'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { declarations, inspectProject } = require('../src/vhdl');

test('estrae entity e istanze dirette ignorando i commenti', () => {
  const parsed = declarations(`
    entity TOP is port (a: in bit); end;
    architecture rtl of TOP is begin
      U1 : entity work.CHILD port map (a => a);
      -- U2 : entity work.IGNORED port map (a => a);
    end;
  `, 'top.vhd');
  assert.deepEqual(parsed.entities.map((item) => item.name), ['TOP']);
  assert.deepEqual(parsed.instantiated, ['CHILD']);
});

test('estrae porte in/out e conserva il range dei vettori', () => {
  const parsed = declarations(`
    entity Decoder2 is
      port (
        a, b : in std_logic_vector(3 downto 0);
        enable : in std_logic;
        seg : out std_logic_vector(6 downto 0);
        valid : out std_logic
      );
    end entity;
  `, 'decoder.vhd');
  assert.deepEqual(parsed.entities[0].ports, [
    { name: 'a', direction: 'in', range: '3 downto 0' },
    { name: 'b', direction: 'in', range: '3 downto 0' },
    { name: 'enable', direction: 'in', range: null },
    { name: 'seg', direction: 'out', range: '6 downto 0' },
    { name: 'valid', direction: 'out', range: null },
  ]);
});

test('riconosce RCA come top-level gerarchico e RCA_tb come testbench', async () => {
  const project = path.resolve(__dirname, '..', 'Test', 'RCA');
  const result = await inspectProject(project);
  assert.equal(result.recommendedTop, 'RCA');
  assert.equal(result.recommendedTestbench, 'RCA_tb');
  assert.deepEqual(result.roots, ['RCA']);
  assert.deepEqual(result.designs.map((item) => item.name).sort(), ['FA', 'HA', 'RCA']);
  assert.ok(result.units.find((item) => item.name === 'RCA').instantiates.includes('FA'));
  assert.ok(result.units.find((item) => item.name === 'FA').instantiates.includes('HA'));
});
