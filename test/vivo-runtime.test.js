'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { PathGuard } = require('../src/path-guard');
const { VivoRuntimeManager, generateVivoTestbench, parseResponse, validateConnections, vectorBitPins } = require('../src/vivo-runtime');

const AND2 = `library ieee;
use ieee.std_logic_1164.all;
entity AND2 is
  port (A : in std_logic; B : in std_logic; Y : out std_logic);
end entity;
architecture rtl of AND2 is begin Y <= A and B; end architecture;
`;

const SEGMENT_DRIVER = `library ieee;
use ieee.std_logic_1164.all;
entity SegmentDriver is
  port (A : in std_logic; SEG : out std_logic_vector(6 downto 0));
end entity;
architecture rtl of SegmentDriver is begin
  SEG <= "1011011" when A = '1' else "0000000";
end architecture;
`;

const VECTOR_INPUT_DRIVER = `library ieee;
use ieee.std_logic_1164.all;
entity VectorInputDriver is
  port (A : in std_logic_vector(3 downto 0); Y : out std_logic);
end entity;
architecture rtl of VectorInputDriver is begin
  Y <= A(3) and A(2) and A(1) and A(0);
end architecture;
`;

const DELTA_DECODER = `library ieee;
use ieee.std_logic_1164.all;
entity DeltaDecoder is
  port (HEX_IN : in std_logic_vector(3 downto 0); SEG : out std_logic_vector(6 downto 0));
end entity;
architecture rtl of DeltaDecoder is
  signal A, B, C, D : std_logic;
begin
  A <= HEX_IN(3); B <= HEX_IN(2); C <= HEX_IN(1); D <= HEX_IN(0);
  SEG(6) <= A; SEG(5) <= B; SEG(4) <= C; SEG(3) <= D;
  SEG(2) <= A and B; SEG(1) <= C and D; SEG(0) <= A xor D;
end architecture;
`;

test('ViVo START/UPDATE/STOP mantiene GHDL e pilota AND2', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ufo-vivo-runtime-'));
  const project = path.join(root, 'AndDemo');
  await fs.mkdir(path.join(project, 'src'), { recursive: true });
  await fs.writeFile(path.join(project, 'src', 'AND2.vhd'), AND2);
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const runtime = new VivoRuntimeManager({
    guard: await PathGuard.create(root),
    tools: { ghdl: '/usr/bin/ghdl' },
  });
  const connections = [
    { typeId: 'switch', pin: 'A' },
    { typeId: 'push-button', pin: 'B' },
    { typeId: 'led', pin: 'Y' },
  ];
  const started = await runtime.start({ project: 'AndDemo', top: 'AND2', connections });
  assert.equal(started.active, true);
  assert.equal(started.inputs.join(','), 'A,B');
  assert.equal(started.outputs.join(','), 'Y');
  const pid = started.pid;
  const table = [['0', '0', '0'], ['0', '1', '0'], ['1', '0', '0'], ['1', '1', '1']];
  for (const [a, b, expected] of table) {
    const result = await runtime.update({ project: 'AndDemo', values: { A: a, B: b } });
    assert.equal(result.pid, pid);
    assert.equal(result.outputs.Y, expected);
  }
  const session = runtime.sessions.get('AndDemo');
  assert.match(await fs.readFile(path.join(session.buildDirectory, 'vivo_runtime_tb.vhd'), 'utf8'), /entity work\.AND2/);
  const stopped = await runtime.stop({ project: 'AndDemo' });
  assert.equal(stopped.active, false);
  assert.equal(runtime.sessions.has('AndDemo'), false);
});

test('il testbench ViVo generato usa TEXTIO e il protocollo nome=valore', () => {
  const testbench = generateVivoTestbench('AND2', [
    { name: 'A', direction: 'in' }, { name: 'B', direction: 'in' }, { name: 'Y', direction: 'out' },
  ]);
  assert.match(testbench, /use std\.textio\.all/);
  assert.match(testbench, /read\(command_line, key_A\)/);
  assert.match(testbench, /write\(response_line, string'\("Y="\)\)/);
  assert.match(testbench, /constant VIVO_SETTLE_DELTAS : positive := 8/);
  assert.match(testbench, /for delta_cycle in 1 to VIVO_SETTLE_DELTAS loop/);
  assert.throws(
    () => validateConnections({ ports: [{ name: 'A', direction: 'in', range: null }, { name: 'Y', direction: 'out', range: null }] }, [{ typeId: 'switch', pin: 'A' }]),
    /Manca un ViVoO per Y/,
  );
  assert.throws(
    () => validateConnections({ ports: [{ name: 'A', direction: 'in', range: null }, { name: 'Y', direction: 'out', range: null }] }, [{ typeId: 'switch', label: 'SW1', pin: 'A' }, { typeId: 'led', label: 'LED1', pin: 'Z' }]),
    /LED1→Z.*Pin disponibili.*A, Y/,
  );
  assert.deepEqual(parseResponse('Q=U', [{ name: 'Q', direction: 'out', range: null }]), { Q: 'U' });
  assert.deepEqual(parseResponse('SEG=1011011', [{ name: 'SEG', direction: 'out', range: '6 downto 0' }]), { SEG: '1011011' });
});

test('ViVo inoltra un vettore output a 7 bit al display e a LED sui suoi bit', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ufo-vivo-segment-'));
  const project = path.join(root, 'SegmentDemo');
  await fs.mkdir(path.join(project, 'src'), { recursive: true });
  await fs.writeFile(path.join(project, 'src', 'SegmentDriver.vhd'), SEGMENT_DRIVER);
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const runtime = new VivoRuntimeManager({ guard: await PathGuard.create(root), tools: { ghdl: '/usr/bin/ghdl' } });
  const started = await runtime.start({ project: 'SegmentDemo', top: 'SegmentDriver', connections: [
    { typeId: 'switch', pin: 'A' }, { typeId: 'seven-segment', pin: 'SEG' }, { typeId: 'led', pin: 'SEG(6)' },
  ] });
  assert.equal((await runtime.update({ project: 'SegmentDemo', values: { A: '0' } })).outputs.SEG, '0000000');
  assert.equal((await runtime.update({ project: 'SegmentDemo', values: { A: '1' } })).outputs.SEG, '1011011');
  assert.equal(runtime.sessions.get('SegmentDemo').simulator.pid, started.pid);
  await runtime.stop({ project: 'SegmentDemo' });
});

test('ViVo aggrega quattro Switch nei bit di un ingresso vettoriale', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ufo-vivo-vector-input-'));
  const project = path.join(root, 'VectorDemo');
  await fs.mkdir(path.join(project, 'src'), { recursive: true });
  await fs.writeFile(path.join(project, 'src', 'VectorInputDriver.vhd'), VECTOR_INPUT_DRIVER);
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  assert.deepEqual(vectorBitPins({ name: 'A', range: '3 downto 0' }), ['A(3)', 'A(2)', 'A(1)', 'A(0)']);
  const runtime = new VivoRuntimeManager({ guard: await PathGuard.create(root), tools: { ghdl: '/usr/bin/ghdl' } });
  await runtime.start({ project: 'VectorDemo', top: 'VectorInputDriver', connections: [
    { typeId: 'switch', pin: 'A(3)' }, { typeId: 'switch', pin: 'A(2)' },
    { typeId: 'switch', pin: 'A(1)' }, { typeId: 'switch', pin: 'A(0)' }, { typeId: 'led', pin: 'Y' },
  ] });
  assert.equal((await runtime.update({ project: 'VectorDemo', values: { 'A(3)': '1', 'A(2)': '1', 'A(1)': '1', 'A(0)': '0' } })).outputs.Y, '0');
  assert.equal((await runtime.update({ project: 'VectorDemo', values: { 'A(3)': '1', 'A(2)': '1', 'A(1)': '1', 'A(0)': '1' } })).outputs.Y, '1');
  await runtime.stop({ project: 'VectorDemo' });
});

test('ViVo collega il tastierino alla porta vettoriale a 4 bit', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ufo-vivo-keypad-'));
  const project = path.join(root, 'KeypadDemo');
  await fs.mkdir(path.join(project, 'src'), { recursive: true });
  await fs.writeFile(path.join(project, 'src', 'VectorInputDriver.vhd'), VECTOR_INPUT_DRIVER);
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const runtime = new VivoRuntimeManager({ guard: await PathGuard.create(root), tools: { ghdl: '/usr/bin/ghdl' } });
  const started = await runtime.start({ project: 'KeypadDemo', top: 'VectorInputDriver', connections: [
    { typeId: 'hex-keypad', pin: 'A' }, { typeId: 'led', pin: 'Y' },
  ] });
  const pid = started.pid;
  assert.equal((await runtime.update({ project: 'KeypadDemo', values: { A: '1110' } })).outputs.Y, '0');
  assert.equal((await runtime.update({ project: 'KeypadDemo', values: { A: '1111' } })).outputs.Y, '1');
  assert.equal(runtime.sessions.get('KeypadDemo').simulator.pid, pid);
  await runtime.stop({ project: 'KeypadDemo' });
});

test('ViVo attende i delta cycle di un decoder con segnali intermedi', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ufo-vivo-delta-decoder-'));
  const project = path.join(root, 'DeltaDecoderDemo');
  await fs.mkdir(path.join(project, 'src'), { recursive: true });
  await fs.writeFile(path.join(project, 'src', 'DeltaDecoder.vhd'), DELTA_DECODER);
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const runtime = new VivoRuntimeManager({ guard: await PathGuard.create(root), tools: { ghdl: '/usr/bin/ghdl' } });
  await runtime.start({ project: 'DeltaDecoderDemo', top: 'DeltaDecoder', connections: [
    { typeId: 'switch', pin: 'HEX_IN(3)' }, { typeId: 'switch', pin: 'HEX_IN(2)' },
    { typeId: 'switch', pin: 'HEX_IN(1)' }, { typeId: 'switch', pin: 'HEX_IN(0)' }, { typeId: 'seven-segment', pin: 'SEG' },
  ] });
  const result = await runtime.update({ project: 'DeltaDecoderDemo', values: { 'HEX_IN(3)': '1', 'HEX_IN(2)': '0', 'HEX_IN(1)': '1', 'HEX_IN(0)': '1' } });
  assert.equal(result.outputs.SEG, '1011010');
  await runtime.stop({ project: 'DeltaDecoderDemo' });
});
