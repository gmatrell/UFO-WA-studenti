'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { PathGuard } = require('../src/path-guard');
const { JobManager } = require('../src/jobs');
const { toolPaths } = require('../src/server');

async function digest(filename) {
  return crypto.createHash('sha256').update(await fs.readFile(filename)).digest('hex');
}

test('collaudo completo AND2 in copia temporanea: simulazione e sintesi', { timeout: 30_000 }, async (t) => {
  const repository = path.resolve(__dirname, '..');
  const reference = path.join(repository, 'Test', 'AND2');
  const originals = [path.join(reference, 'AND2.vhd'), path.join(reference, 'AND2_tb.vhd')];
  const before = await Promise.all(originals.map(digest));
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ufo-and2-test-'));
  const project = path.join(root, 'AND2');
  await fs.mkdir(project);
  await Promise.all(originals.map((filename) => fs.copyFile(filename, path.join(project, path.basename(filename)))));
  t.after(async () => fs.rm(root, { recursive: true, force: true }));

  const guard = await PathGuard.create(root);
  const jobs = new JobManager({
    guard,
    tools: toolPaths(),
    versions: { test: 'collaudo AND2' },
    timeouts: { command: 10_000, simulation: 10_000, synthesis: 15_000 },
  });

  const simulation = jobs.startSimulation({ project: 'AND2', testbench: 'AND2_tb', stopTime: '40ns' });
  assert.equal(simulation.interactive, false);
  const simulationResult = await jobs.wait(simulation.id);
  assert.equal(simulationResult.state, 'completed', `${simulationResult.error || ''}\n${simulationResult.logs.map((entry) => entry.text).join('\n')}`);
  const vcd = jobs.artifact(simulation.id, 'vcd');
  assert.ok((await fs.stat(vcd)).size > 0);
  assert.match(await fs.readFile(vcd, 'utf8'), /\$var reg 1 .* y \$end/);

  const synthesis = jobs.startSynthesis({ project: 'AND2', top: 'AND2' });
  const synthesisResult = await jobs.wait(synthesis.id);
  assert.equal(synthesisResult.state, 'completed', `${synthesisResult.error || ''}\n${synthesisResult.logs.map((entry) => entry.text).join('\n')}`);
  assert.equal(synthesisResult.synthesisMode, 'gate');
  const json = JSON.parse(await fs.readFile(jobs.artifact(synthesis.id, 'json'), 'utf8'));
  assert.ok(json.modules.AND2 || json.modules.and2);
  const svg = await fs.readFile(jobs.artifact(synthesis.id, 'rtl'), 'utf8');
  assert.match(svg, /<svg[\s>]/);
  assert.match(svg, /s:type="and"/i);

  const after = await Promise.all(originals.map(digest));
  assert.deepEqual(after, before, 'I file di riferimento AND2 non devono cambiare');
});

test('la sintesi RTL e GATE con case distingue $pmux e genera JSON e SVG', { timeout: 30_000 }, async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ufo-case-test-'));
  const project = path.join(root, 'CaseMux');
  await fs.mkdir(project);
  await fs.writeFile(path.join(project, 'CaseMux.vhd'), `
library ieee;
use ieee.std_logic_1164.all;

entity CaseMux is
  port (
    sel : in std_logic_vector(1 downto 0);
    y   : out std_logic_vector(1 downto 0)
  );
end entity;

architecture rtl of CaseMux is
begin
  process(sel)
  begin
    case sel is
      when "00" => y <= "00";
      when "01" => y <= "01";
      when "10" => y <= "11";
      when others => y <= "10";
    end case;
  end process;
end architecture;
`, 'utf8');
  t.after(async () => fs.rm(root, { recursive: true, force: true }));

  const guard = await PathGuard.create(root);
  const jobs = new JobManager({
    guard,
    tools: toolPaths(),
    versions: { test: 'sintesi case' },
    timeouts: { command: 10_000, synthesis: 15_000 },
  });

  const rtl = jobs.startSynthesis({ project: 'CaseMux', top: 'CaseMux', mode: 'rtl' });
  const rtlResult = await jobs.wait(rtl.id);
  assert.equal(rtlResult.state, 'completed', `${rtlResult.error || ''}\n${rtlResult.logs.map((entry) => entry.text).join('\n')}`);
  assert.equal(rtlResult.synthesisMode, 'rtl');

  const rtlScript = await fs.readFile(path.join(project, '.ufo', 'build', rtl.id, 'synthesis.ys'), 'utf8');
  assert.equal(rtlScript, [
    'read_verilog design.v',
    'hierarchy -check -top CaseMux',
    'prep -top CaseMux',
    'write_json netlist.json',
    '',
  ].join('\n'));
  assert.doesNotMatch(rtlScript, /pmuxtree|simplemap|abc/);

  const rtlJson = JSON.parse(await fs.readFile(jobs.artifact(rtl.id, 'json'), 'utf8'));
  assert.ok(rtlJson.modules.CaseMux || rtlJson.modules.casemux);
  assert.match(JSON.stringify(rtlJson), /\$pmux/);
  const rtlSvg = await fs.readFile(jobs.artifact(rtl.id, 'rtl'), 'utf8');
  assert.match(rtlSvg, /<svg[\s>]/);
  assert.ok(rtlSvg.length > 0);

  const gate = jobs.startSynthesis({ project: 'CaseMux', top: 'CaseMux', mode: 'gate' });
  const gateResult = await jobs.wait(gate.id);
  assert.equal(gateResult.state, 'completed', `${gateResult.error || ''}\n${gateResult.logs.map((entry) => entry.text).join('\n')}`);
  assert.equal(gateResult.synthesisMode, 'gate');

  const gateScript = await fs.readFile(path.join(project, '.ufo', 'build', gate.id, 'synthesis.ys'), 'utf8');
  assert.equal(gateScript, [
    'read_verilog design.v',
    'hierarchy -check -top CaseMux',
    'prep -top CaseMux',
    'pmuxtree',
    'simplemap',
    'abc',
    'write_json netlist.json',
    '',
  ].join('\n'));

  const gateJson = JSON.parse(await fs.readFile(jobs.artifact(gate.id, 'json'), 'utf8'));
  assert.ok(gateJson.modules.CaseMux || gateJson.modules.casemux);
  assert.doesNotMatch(JSON.stringify(gateJson), /\$pmux/);
  const gateSvg = await fs.readFile(jobs.artifact(gate.id, 'rtl'), 'utf8');
  assert.match(gateSvg, /<svg[\s>]/);
  assert.ok(gateSvg.length > 0);
});
