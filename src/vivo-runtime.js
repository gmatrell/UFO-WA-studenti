'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { AppError } = require('./path-guard');
const { inspectProject, listVhdlFiles } = require('./vhdl');
const { GhdlPersistentSimulator, SimulatorError } = require('./vivo-simulator');

const execFileAsync = promisify(execFile);

function vectorWidth(port) {
  if (!port.range) return null;
  const range = port.range.match(/^\s*(-?\d+)\s+(downto|to)\s+(-?\d+)\s*$/i);
  return range ? Math.abs(Number(range[1]) - Number(range[3])) + 1 : null;
}

function vectorBitPins(port) {
  const match = port.range?.match(/^\s*(-?\d+)\s+(downto|to)\s+(-?\d+)\s*$/i);
  if (!match) return [];
  const high = Math.max(Number(match[1]), Number(match[3]));
  const low = Math.min(Number(match[1]), Number(match[3]));
  return Array.from({ length: high - low + 1 }, (_, offset) => `${port.name}(${high - offset})`);
}

function generateVivoTestbench(top, ports) {
  const inputs = ports.filter((port) => port.direction === 'in');
  const outputs = ports.filter((port) => port.direction === 'out');
  const signal = (port) => `vivo_${port.name}`;
  const declarations = ports.map((port) => port.range
    ? `  signal ${signal(port)} : std_logic_vector(${port.range}) := (others => '0');`
    : `  signal ${signal(port)} : std_logic := '0';`).join('\n');
  const mappings = ports.map((port) => `      ${port.name} => ${signal(port)}`).join(',\n');
  const variables = inputs.map((port) => port.range
    ? `    variable key_${port.name} : string(1 to ${port.name.length});\n    variable value_${port.name} : string(1 to ${vectorWidth(port)});`
    : `    variable key_${port.name} : string(1 to ${port.name.length});\n    variable value_${port.name} : std_logic;`).join('\n');
  const reads = inputs.map((port, index) => [
    `      read(command_line, key_${port.name});`,
    `      read(command_line, equals);`,
    `      read(command_line, value_${port.name});`,
    `      assert key_${port.name} = "${port.name}" and equals = '=' report "Comando ViVo non valido" severity failure;`,
    ...(port.range
      ? [`      for bit_position in 0 to value_${port.name}'length - 1 loop`, `        ${signal(port)}(${signal(port)}'high - bit_position) <= bit_value(value_${port.name}(value_${port.name}'left + bit_position));`, '      end loop;']
      : [`      ${signal(port)} <= value_${port.name};`]),
    index < inputs.length - 1 ? `      read(command_line, separator);` : '',
  ].filter(Boolean).join('\n')).join('\n');
  const writes = outputs.map((port, index) => [
    `      write(response_line, string'("${port.name}="));`,
    ...(port.range
      ? [`      for bit_index in ${signal(port)}'high downto ${signal(port)}'low loop`, `        write(response_line, ${signal(port)}(bit_index));`, '      end loop;']
      : [`      write(response_line, ${signal(port)});`]),
    index < outputs.length - 1 ? `      write(response_line, character'(';'));` : '',
  ].filter(Boolean).join('\n')).join('\n');
  return `library ieee;
use ieee.std_logic_1164.all;
use std.textio.all;

entity vivo_runtime_tb is
end entity vivo_runtime_tb;

architecture interactive of vivo_runtime_tb is
${declarations}
  -- Assestamento combinatorio: non avanza il tempo simulato.
  constant VIVO_SETTLE_DELTAS : positive := 8;
  function bit_value(value : character) return std_logic is
  begin
    if value = '0' then return '0'; end if;
    if value = '1' then return '1'; end if;
    return 'X';
  end function bit_value;
begin
  dut: entity work.${top}
    port map (
${mappings}
    );

  command_loop: process
    variable command_line : line;
    variable response_line : line;
    variable equals : character;
    variable separator : character;
${variables}
  begin
    while true loop
      readline(input, command_line);
${reads}
      for delta_cycle in 1 to VIVO_SETTLE_DELTAS loop
        wait for 0 ns;
      end loop;
${writes}
      writeline(output, response_line);
    end loop;
  end process command_loop;
end architecture interactive;
`;
}

function validateConnections(design, connections) {
  if (!Array.isArray(connections)) throw new AppError(400, 'INVALID_VIVOO_CONNECTIONS', 'Connessioni ViVo non valide.');
  const ports = design.ports.filter((port) => ['in', 'out'].includes(port.direction));
  if (ports.some((port) => port.direction === 'in' && port.range && !vectorWidth(port)) || ports.some((port) => port.direction === 'out' && port.range && vectorWidth(port) !== 7)) {
    throw new AppError(400, 'UNSUPPORTED_VIVOO_PORT', 'ViVo supporta ingressi scalari o vettoriali numerici e uscite scalari o vettoriali a 7 bit.');
  }
  const byPin = new Map();
  for (const connection of connections) {
    if (!connection || typeof connection.pin !== 'string' || typeof connection.typeId !== 'string') {
      throw new AppError(400, 'INVALID_VIVOO_CONNECTIONS', 'Connessione ViVo non valida.');
    }
    if (byPin.has(connection.pin)) throw new AppError(400, 'DUPLICATE_VIVOO_PIN', `Il pin ${connection.pin} è associato più volte.`);
    byPin.set(connection.pin, connection);
  }
  const expectedByPin = new Map();
  const requiredPins = new Set();
  for (const port of ports) {
    if (port.direction === 'out' && port.range) {
      expectedByPin.set(port.name, new Set(['seven-segment']));
      requiredPins.add(port.name);
      for (const bitPin of vectorBitPins(port)) expectedByPin.set(bitPin, new Set(['led']));
      continue;
    }
    const vectorKeypad = port.direction === 'in' && port.range && byPin.get(port.name)?.typeId === 'hex-keypad';
    const pins = port.direction === 'in' && port.range && !vectorKeypad ? vectorBitPins(port) : [port.name];
    for (const pin of pins) {
      const expected = port.direction === 'in'
        ? (port.range && pin === port.name ? new Set(['hex-keypad']) : new Set(['switch', 'push-button']))
        : new Set(['led']);
      expectedByPin.set(pin, expected);
      requiredPins.add(pin);
    }
  }
  const unexpectedConnections = [...byPin.entries()].filter(([pin]) => !expectedByPin.has(pin));
  if (unexpectedConnections.length) {
    const details = unexpectedConnections.map(([pin, connection]) => `${typeof connection.label === 'string' && connection.label ? connection.label : connection.typeId}→${pin}`).join(', ');
    throw new AppError(400, 'INVALID_VIVOO_PIN', `Connessione ViVo non valida: ${details}. Pin disponibili per questo design: ${[...expectedByPin.keys()].join(', ')}.`);
  }
  const missingPins = [...requiredPins].filter((pin) => !byPin.has(pin));
  if (missingPins.length) {
    throw new AppError(400, 'INCOMPLETE_VIVOO_CONNECTIONS', `Manca un ViVoO per ${missingPins.join(', ')}.`);
  }
  for (const [pin, connection] of byPin) {
    if (!expectedByPin.get(pin).has(connection.typeId)) throw new AppError(400, 'INVALID_VIVOO_DIRECTION', `ViVoO non compatibile con ${pin}.`);
  }
  return ports;
}

function parseResponse(line, outputs) {
  const result = {};
  for (const part of line.split(';')) {
    const match = /^([A-Za-z][A-Za-z0-9_]*)=([01UXZWLH-]+)$/i.exec(part);
    if (!match) throw new AppError(502, 'INVALID_VIVOO_RESPONSE', `Risposta GHDL non valida: ${line}`);
    result[match[1]] = match[2];
  }
  if (outputs.some((port) => !Object.hasOwn(result, port.name)
    || (!port.range && result[port.name].length !== 1)
    || (port.range && result[port.name].length !== vectorWidth(port)))) {
    throw new AppError(502, 'INVALID_VIVOO_RESPONSE', `Risposta GHDL incompleta: ${line}`);
  }
  return result;
}

class VivoRuntimeManager {
  constructor({ guard, tools, responseTimeout = 1_000 }) {
    this.guard = guard;
    this.tools = tools;
    this.responseTimeout = responseTimeout;
    this.sessions = new Map();
  }

  async start({ project, top, connections }) {
    if (this.sessions.has(project)) throw new AppError(409, 'VIVOO_RUNNING', 'La simulazione ViVo è già attiva.');
    const target = await this.guard.project(project);
    const inspection = await inspectProject(target.absolute);
    const design = inspection.designs.find((unit) => unit.name === top);
    if (!design) throw new AppError(404, 'VIVOO_DESIGN_NOT_FOUND', 'Design ViVo non disponibile.');
    const ports = validateConnections(design, connections);
    const buildDirectory = path.join(target.absolute, '.ufo', 'build', `vivo-${crypto.randomBytes(6).toString('hex')}`);
    await fs.mkdir(buildDirectory, { recursive: true });
    const testbench = path.join(buildDirectory, 'vivo_runtime_tb.vhd');
    await fs.writeFile(testbench, generateVivoTestbench(top, ports), 'utf8');
    try {
      // I testbench dell'utente non servono al wrapper ViVo e possono dipendere dal
      // DUT: escluderli evita che un loro ordine lessicografico interrompa la build.
      const testbenchFiles = new Set(inspection.testbenches.map((unit) => path.resolve(target.absolute, unit.file)));
      const designSources = (await listVhdlFiles(target.absolute)).filter((filename) => !testbenchFiles.has(path.resolve(filename)));
      await execFileAsync(this.tools.ghdl, ['-i', '--std=08', `--workdir=${buildDirectory}`, ...designSources, testbench], { timeout: 15_000 });
      await execFileAsync(this.tools.ghdl, ['-m', '--std=08', `--workdir=${buildDirectory}`, 'vivo_runtime_tb'], { timeout: 15_000 });
      const simulator = new GhdlPersistentSimulator({ ghdl: this.tools.ghdl, workdir: buildDirectory, entity: 'vivo_runtime_tb', responseTimeout: this.responseTimeout });
      await simulator.start();
      const session = { project, top, ports, simulator, buildDirectory, inputs: ports.filter((port) => port.direction === 'in'), outputs: ports.filter((port) => port.direction === 'out'), vectorKeypads: new Set(connections.filter((connection) => connection.typeId === 'hex-keypad').map((connection) => connection.pin)) };
      this.sessions.set(project, session);
      return { active: true, pid: simulator.pid, buildDirectory, inputs: session.inputs.map((port) => port.name), outputs: session.outputs.map((port) => port.name) };
    } catch (error) {
      await fs.rm(buildDirectory, { recursive: true, force: true });
      throw new AppError(500, 'VIVOO_START_FAILED', `Avvio GHDL ViVo non riuscito: ${error.stderr || error.message}`);
    }
  }

  async update({ project, values }) {
    const session = this.sessions.get(project);
    if (!session) throw new AppError(409, 'VIVOO_NOT_RUNNING', 'La simulazione ViVo non è attiva.');
    if (!values || typeof values !== 'object') throw new AppError(400, 'INVALID_VIVOO_VALUES', 'Valori ViVo non validi.');
    const command = session.inputs.map((port) => {
      const pins = port.range && !session.vectorKeypads.has(port.name) ? vectorBitPins(port) : [port.name];
      const value = pins.map((pin) => values[pin]).join('');
      if (!/^[01]+$/.test(value) || value.length !== (port.range ? vectorWidth(port) : 1)) {
        throw new AppError(400, 'INVALID_VIVOO_VALUE', `Valore non valido per ${port.name}.`);
      }
      return `${port.name}=${value}`;
    }).join(';');
    try {
      const response = await session.simulator.send(command);
      return { active: true, pid: session.simulator.pid, outputs: parseResponse(response, session.outputs) };
    } catch (error) {
      if (error instanceof AppError) throw error;
      await this.stop({ project }).catch(() => {});
      throw new AppError(502, 'VIVOO_RUNTIME_FAILED', `Errore simulazione ViVo: ${error.stderr || error.message}`);
    }
  }

  async stop({ project }) {
    const session = this.sessions.get(project);
    if (!session) return { active: false };
    this.sessions.delete(project);
    await session.simulator.stop();
    return { active: false, pid: session.simulator.pid };
  }

  status({ project }) {
    const session = this.sessions.get(project);
    return session
      ? { active: true, pid: session.simulator.pid, top: session.top }
      : { active: false };
  }

  async stopAll() {
    await Promise.all([...this.sessions.keys()].map((project) => this.stop({ project })));
  }
}

module.exports = { VivoRuntimeManager, generateVivoTestbench, parseResponse, validateConnections, vectorBitPins, vectorWidth };
