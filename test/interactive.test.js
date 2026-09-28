'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { PathGuard } = require('../src/path-guard');
const { JobManager } = require('../src/jobs');
const { buildInteractiveScript, detectWslDistribution, detectWslUser, simulationPlan } = require('../src/jobs');
const { GhdlPersistentSimulator } = require('../src/vivo-simulator');

const execFileAsync = promisify(execFile);

function fakeChild() {
  const child = new EventEmitter();
  child.pid = 4242;
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = (signal) => process.nextTick(() => child.emit('close', null, signal));
  process.nextTick(() => child.emit('spawn'));
  return child;
}

test('adapter ViVo mantiene GHDL persistente e riceve più comandi TEXTIO', async (t) => {
  const workdir = await fs.mkdtemp(path.join(os.tmpdir(), 'ufo-vivo-ghdl-'));
  const source = path.join(__dirname, '..', 'Test', 'ViVo', 'vivo_test.vhd');
  t.after(() => fs.rm(workdir, { recursive: true, force: true }));
  await execFileAsync('/usr/bin/ghdl', ['-a', '--std=08', `--workdir=${workdir}`, source]);

  const simulator = new GhdlPersistentSimulator({
    ghdl: '/usr/bin/ghdl',
    workdir,
    entity: 'vivo_test',
    responseTimeout: 1_000,
  });
  await simulator.start();
  const pid = simulator.pid;
  const replies = [];
  for (const [command, expected] of [['0 0', 'Y=0'], ['0 1', 'Y=0'], ['1 0', 'Y=0'], ['1 1', 'Y=1']]) {
    replies.push(`${command} -> ${await simulator.send(command)}`);
    assert.equal(replies.at(-1), `${command} -> ${expected}`);
    assert.equal(simulator.pid, pid);
  }
  t.diagnostic(`GHDL PID ${pid}, protocollo temporaneo:\n${replies.join('\n')}`);
  await simulator.stop();
  assert.equal(simulator.closed, true);
});

test('adapter ViVo gestisce timeout e chiusura inattesa del simulatore', async () => {
  const timeoutChild = fakeChild();
  const timeoutSimulator = new GhdlPersistentSimulator({
    entity: 'vivo_test',
    responseTimeout: 10,
    spawnImpl: () => timeoutChild,
  });
  await timeoutSimulator.start();
  await assert.rejects(timeoutSimulator.send('0 0'), /Timeout/);
  await timeoutSimulator.stop();

  const closedChild = fakeChild();
  const closedSimulator = new GhdlPersistentSimulator({ entity: 'vivo_test', spawnImpl: () => closedChild });
  await closedSimulator.start();
  const waiting = closedSimulator.send('1 1');
  closedChild.stderr.write('errore GHDL\n');
  closedChild.emit('close', 1, null);
  await assert.rejects(waiting, (error) => error.message.includes('chiuso') && error.stderr.includes('errore GHDL'));
});

test('rileva la distribuzione EXT senza affidarsi alla distro predefinita', async () => {
  const calls = [];
  const distro = await detectWslDistribution('wsl.exe', null, async (command, args) => {
    calls.push({ command, args });
    return { stdout: '\uFEFFUbuntu-26.04\r\n\0* WSL-FeLED (Default)\r\n' };
  });

  assert.equal(distro, 'WSL-FeLED');
  assert.deepEqual(calls, [{ command: 'wsl.exe', args: ['--list', '--quiet'] }]);
});

test('rileva separatamente l’utente dalla distribuzione EXT', async () => {
  const calls = [];
  const user = await detectWslUser('wsl.exe', 'WSL-FeLED', null, async (command, args) => {
    calls.push({ command, args });
    return { stdout: 'feled\r\n' };
  });

  assert.equal(user, 'feled');
  assert.deepEqual(calls, [{
    command: 'wsl.exe',
    args: ['--distribution', 'WSL-FeLED', '--exec', 'whoami'],
  }]);
});

test('lo script EXT_SIM usa la sequenza GHDL e mantiene il terminale aperto agli errori', () => {
  const vcd = '/tmp/ufo-sim/results/simulation/sim.vcd';
  const plan = simulationPlan({
    ghdl: '/usr/bin/ghdl',
    buildDirectory: '/tmp/ufo-sim/.ufo/build/job',
    sourceCopies: ['source/design.vhd', 'source/design_tb.vhd'],
    testbench: 'design_tb',
    vcd,
    stopTime: '1us',
  });
  const script = buildInteractiveScript({
    plan,
    buildDirectory: '/tmp/ufo-sim/.ufo/build/job',
    vcd,
    gtkwave: '/usr/bin/gtkwave',
    python: '/usr/bin/python3',
    script: '/usr/bin/script',
  });

  assert.match(script, /run_phase 'Analisi dei sorgenti'/);
  assert.match(script, /UFO-WA EXT_SIM - SIMULAZIONE ESTERNA/);
  assert.match(script, /UFO-WA EXT_SIM - INIZIO OUTPUT TESTBENCH/);
  assert.match(script, /separator = b"\\r\\n\\r\\n/);
  assert.match(script, /os\.read\(sys\.stdin\.fileno\(\), 4096\)/);
  assert.match(script, /if inserted:\s+sys\.stdout\.buffer\.write\(chunk\)/);
  assert.doesNotMatch(script, /sys\.stdin\.buffer\.read\(256\)/);
  assert.match(script, /'\/usr\/bin\/script' -qefc/);
  assert.match(script, /run_phase 'Ordine di elaborazione'/);
  assert.match(script, /run_phase 'Elaborazione del testbench'/);
  assert.match(script, /run_interactive_phase 'Simulazione funzionale'/);
  assert.match(script, /read -r -p "Premi INVIO per chiudere il terminale/);
  assert.match(script, /\[ ! -s '\/tmp\/ufo-sim\/results\/simulation\/sim\.vcd' \]/);
  assert.ok(script.indexOf("run_phase 'Avvio GTKWave'") > script.indexOf("[ ! -s '/tmp/ufo-sim/results/simulation/sim.vcd' ]"));
});

test('il job EXT_SIM prepara lo script e termina dopo l’avvio del launcher', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ufo-interactive-job-'));
  const project = path.join(root, 'Demo');
  await fs.mkdir(project, { recursive: true });
  await fs.writeFile(path.join(project, 'design.vhd'), 'entity design is end entity;\n');
  await fs.writeFile(path.join(project, 'design_tb.vhd'), 'entity design_tb is end entity;\n');
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const jobs = new JobManager({
    guard: await PathGuard.create(root),
    tools: {
      ghdl: '/usr/bin/ghdl',
      gtkwave: '/usr/bin/gtkwave',
      wslDistro: 'WSL-FeLED',
      wslUser: 'feled',
      terminal: '/bin/true',
      terminalCwd: '/tmp',
    },
    versions: { test: 'interactive' },
  });
  const started = jobs.startSimulation({ project: 'Demo', testbench: 'design_tb', interactive: true });
  const result = await jobs.wait(started.id);
  assert.equal(result.state, 'completed');
  assert.equal(result.interactive, true);
  const logs = result.logs.map((entry) => entry.text).join('\n');
  assert.match(logs, /Distribuzione WSL rilevata: WSL-FeLED/);
  assert.match(logs, /Utente WSL rilevato: feled/);
  assert.match(logs, /Simulazione EXT_SIM avviata/);
  const script = path.join(project, '.ufo', 'build', started.id, 'interactive-simulation.sh');
  assert.match(await fs.readFile(script, 'utf8'), /ghdl/);
});
