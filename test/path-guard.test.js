'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { PathGuard, cleanRelative, validProjectName, validVhdlName } = require('../src/path-guard');

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ufo-path-test-'));
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'ufo-outside-test-'));
  await fs.mkdir(path.join(root, 'Demo', 'src'), { recursive: true });
  await fs.writeFile(path.join(root, 'Demo', 'src', 'design.vhd'), 'entity design is end;');
  await fs.writeFile(path.join(outside, 'secret.vhd'), 'secret');
  await fs.symlink(path.join(outside, 'secret.vhd'), path.join(root, 'Demo', 'src', 'link.vhd'));
  t.after(async () => {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(outside, { recursive: true, force: true });
  });
  return { root, guard: await PathGuard.create(root) };
}

test('accetta percorsi relativi leciti e rifiuta traversal/assoluti', async (t) => {
  const { guard } = await fixture(t);
  const file = await guard.existing('Demo/src/design.vhd', 'file');
  assert.equal(path.basename(file.absolute), 'design.vhd');
  assert.throws(() => cleanRelative('../secret.vhd'), /segmenti non ammessi/);
  assert.throws(() => cleanRelative('/etc/passwd'), /percorsi relativi/);
  assert.throws(() => cleanRelative('Demo\\design.vhd'), /percorsi relativi/);
});

test('rifiuta link simbolici e destinazioni già esistenti', async (t) => {
  const { guard } = await fixture(t);
  await assert.rejects(() => guard.existing('Demo/src/link.vhd', 'file'), /esterno|simbolici/);
  await assert.rejects(() => guard.newTarget('Demo/src/design.vhd'), /Esiste già/);
  const target = await guard.newTarget('Demo/src/new.vhd');
  assert.ok(target.absolute.endsWith('/Demo/src/new.vhd'));
});

test('valida nomi di progetto e file VHDL', () => {
  assert.equal(validProjectName('RCA_4bit'), 'RCA_4bit');
  assert.equal(validVhdlName('design_tb.vhd'), 'design_tb.vhd');
  assert.throws(() => validProjectName('../RCA'));
  assert.throws(() => validVhdlName('script.sh'));
});
