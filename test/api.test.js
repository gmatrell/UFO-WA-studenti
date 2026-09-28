'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createUfoServer } = require('../src/server');

async function setup(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ufo-api-test-'));
  const app = await createUfoServer({ projectsRoot: root, port: 0, versions: { test: '1' } });
  const address = await app.listen();
  const base = `http://127.0.0.1:${address.port}`;
  t.after(async () => {
    await app.close();
    await fs.rm(root, { recursive: true, force: true });
  });
  async function request(route, options = {}) {
    const response = await fetch(`${base}${route}`, {
      ...options,
      headers: { 'X-UFO-Token': app.token, ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
    });
    const payload = await response.json();
    return { response, payload };
  }
  return { root, app, base, request };
}

test('serve la UI con token e mostra la radice attiva', async (t) => {
  const { root, base, request } = await setup(t);
  const index = await fetch(base);
  const html = await index.text();
  assert.equal(index.status, 200);
  assert.match(html, /meta name="ufo-token" content="[a-f0-9]{48}"/);
  assert.match(html, /<input id="interactive-simulation" type="checkbox">/);
  assert.match(html, /<span>EXT_SIM<\/span>/);
  assert.match(html, /<button[^>]+id="synthesize-rtl">SINTESI RTL<\/button>/);
  assert.match(html, /<button[^>]+id="synthesize">SINTESI GATE<\/button>/);
  assert.match(html, /<button[^>]+id="vivo">ViVo<\/button>/);
  assert.doesNotMatch(html, /interactive-simulation" type="checkbox" checked/);
  assert.ok(html.indexOf('id="synthesize-rtl"') < html.indexOf('id="synthesize"'));
  assert.ok(html.indexOf('id="simulate"') < html.indexOf('id="interactive-simulation"'));
  assert.ok(html.indexOf('id="interactive-simulation"') < html.indexOf('id="stop-job"'));
  const config = await request('/api/config');
  assert.equal(config.response.status, 200);
  assert.equal(config.payload.projectsRoot, root);
  const vivo = await fetch(`${base}/vivo.html`);
  const vivoHtml = await vivo.text();
  assert.equal(vivo.status, 200);
  assert.match(vivoHtml, /meta name="ufo-token" content="[a-f0-9]{48}"/);
  assert.match(vivoHtml, /ViVo Objects/);
  assert.match(vivoHtml, /id="vivoo-input-library"/);
  assert.match(vivoHtml, /id="vivoo-output-library"/);
  assert.match(vivoHtml, /<button id="import-vivoo" disabled>IMPORTA<\/button>/);
  assert.match(vivoHtml, /id="vivoo-layer"/);
  assert.match(vivoHtml, /Progetto Virtual-In-Virtual-Out/);
  assert.match(vivoHtml, /CONSOLE/);
  assert.match(vivoHtml, /class="fpga-assembly">\s*<div class="fpga-label">Rete Logica<\/div>/);
  assert.match(vivoHtml, /class="fpga-assembly"/);
  assert.match(vivoHtml, /id="entity-name" class="entity-name"/);
  assert.match(vivoHtml, /id="console-resizer"/);
  assert.match(vivoHtml, /id="vivo-start"/);
  assert.match(vivoHtml, /id="vivo-stop"/);
  const vivoCss = await fs.readFile(path.join(__dirname, '..', 'public', 'vivo.css'), 'utf8');
  assert.match(vivoCss, /\.fpga-block[\s\S]*width: 160px/);
  assert.match(vivoCss, /\.fpga-block[\s\S]*height: 320px/);
  assert.match(vivoCss, /\.fpga-object\[hidden\], \.design-status\[hidden\] \{ display: none !important; \}/);
  assert.doesNotMatch(vivoCss, /border-inline/);
  for (const icon of [
    'vivo-switch-off.svg', 'vivo-switch-on.svg',
    'vivo-button-up.svg', 'vivo-button-down.svg',
    'vivo-led-off.svg', 'vivo-led-on.svg',
  ]) {
    const asset = await fetch(`${base}/immagini/${icon}`);
    assert.equal(asset.status, 200);
    assert.match(asset.headers.get('content-type'), /image\/svg\+xml/);
    assert.match(await asset.text(), /viewBox="0 0 48 48"/);
  }
  const vivoScript = await fs.readFile(path.join(__dirname, '..', 'public', 'vivo.js'), 'utf8');
  assert.match(vivoScript, /const VIVOO_TYPES/);
  assert.match(vivoScript, /const selectedTop = params\.get\('top'\)/);
  assert.doesNotMatch(vivoScript, /const top =/);
  assert.match(vivoScript, /function importVivoo/);
  assert.match(vivoScript, /function removeVivooInstance/);
  assert.match(vivoScript, /function restoreRemovedVivoo/);
  assert.match(vivoScript, /selectedVivooId/);
  assert.match(vivoScript, /event\.key\)/);
  assert.match(vivoScript, /className = 'vivoo-delete'/);
  assert.match(vivoScript, /function enableVivooDrag/);
  assert.match(vivoScript, /function expandablePortBits/);
  assert.match(vivoScript, /function compatiblePins/);
  assert.match(vivoScript, /function isPinTaken/);
  assert.match(vivoScript, /function renderPinPopover/);
  assert.match(vivoScript, /function renderFpgaPinStates/);
  assert.match(vivoScript, /openPinMenuId/);
  assert.match(vivoScript, /setLedState/);
  assert.match(vivoScript, /function startSimulation/);
  assert.match(vivoScript, /function stopSimulation/);
  assert.match(vivoScript, /function updateSimulation/);
  assert.match(vivoScript, /function vivooBitValue/);
  assert.match(vivoScript, /id: 'seven-segment'/);
  assert.match(vivoScript, /bitWidth: 7/);
  assert.match(vivoScript, /renderMode: 'dynamic'/);
  assert.match(vivoScript, /const SEVEN_SEGMENT_ORDER/);
  assert.match(vivoScript, /function vectorWidth/);
  assert.match(vivoScript, /vectorWidth\(port\) === 7/);
  assert.match(vivoScript, /function setSevenSegmentState/);
  assert.match(vivoScript, /dataset\.segment = name/);
  assert.match(vivoScript, /setSevenSegmentState\(label, pattern\)/);
  assert.match(vivoScript, /id: 'hex-keypad'/);
  assert.match(vivoScript, /bitWidth: 4/);
  assert.match(vivoScript, /renderMode: 'keypad'/);
  assert.match(vivoScript, /const HEX_KEYPAD_VALUES/);
  assert.match(vivoScript, /function createHexKeypad/);
  assert.match(vivoScript, /function setHexKeypadState/);
  assert.match(vivoScript, /setHexKeypadState\(label, value\)/);
  assert.match(vivoCss, /\.seven-segment-part\.segment-on/);
  assert.match(vivoCss, /\.seven-segment-part\.segment-off/);
  assert.match(vivoCss, /\.hex-keypad-grid/);
  assert.match(vivoCss, /\.hex-keypad-key/);
  assert.match(vivoScript, /\/api\/vivo\/start/);
  assert.match(vivoCss, /\.vivoo-input \.vivoo-pin/);
  assert.match(vivoCss, /\.vivoo-output \.vivoo-pin/);
  assert.match(vivoCss, /\.fpga-pin\.connected, \.vivoo-pin\.connected/);
  assert.match(vivoCss, /\.vivoo-pin-popover/);
  assert.match(vivoCss, /\.fpga-pin, \.vivoo-pin/);
  assert.match(vivoCss, /\.vivoo-delete/);
  assert.match(vivoCss, /\.vivoo-delete[\s\S]*border: 1px solid var\(--border\)/);
  assert.match(vivoCss, /\.vivoo-delete[\s\S]*background: rgba\(17, 31, 37, \.96\)/);
  assert.match(vivoHtml, /id="vivo-toast"/);
});

test('ViVo riceve nel documento entity e porte del top selezionato', async (t) => {
  const { request, base } = await setup(t);
  let result = await request('/api/projects', { method: 'POST', body: JSON.stringify({ name: 'Demo' }) });
  assert.equal(result.response.status, 201);
  result = await request('/api/files', {
    method: 'POST',
    body: JSON.stringify({ path: 'Demo/src/Decoder2.vhd', content: `
      entity Decoder2 is
        port (
          A : in bit_vector(3 downto 0);
          EN : in bit;
          SEG : out bit_vector(6 downto 0);
          VALID : out bit
        );
      end entity;
    ` }),
  });
  assert.equal(result.response.status, 201);
  const vivo = await fetch(`${base}/vivo.html?project=Demo&top=Decoder2`);
  const html = await vivo.text();
  assert.equal(vivo.status, 200);
  assert.match(html, /id="entity-name" class="entity-name">Decoder2<\/div>/);
  assert.match(html, /A\[3:0\]/);
  assert.match(html, /EN/);
  assert.match(html, /SEG\[6:0\]/);
  assert.match(html, /VALID/);
  assert.doesNotMatch(html, /__VIVO_/);
});

test('API ViVo START, aggiornamento AND2 e STOP conserva il processo GHDL', async (t) => {
  const { request } = await setup(t);
  let result = await request('/api/projects', { method: 'POST', body: JSON.stringify({ name: 'ViVoAnd' }) });
  assert.equal(result.response.status, 201);
  result = await request('/api/files', { method: 'POST', body: JSON.stringify({ path: 'ViVoAnd/src/AND2.vhd', content: `
    library ieee; use ieee.std_logic_1164.all;
    entity AND2 is port (A : in std_logic; B : in std_logic; Y : out std_logic); end entity;
    architecture rtl of AND2 is begin Y <= A and B; end architecture;
  ` }) });
  assert.equal(result.response.status, 201);
  const connections = [{ typeId: 'switch', pin: 'A' }, { typeId: 'push-button', pin: 'B' }, { typeId: 'led', pin: 'Y' }];
  result = await request('/api/vivo/start', { method: 'POST', body: JSON.stringify({ project: 'ViVoAnd', top: 'AND2', connections }) });
  assert.equal(result.response.status, 201);
  const pid = result.payload.pid;
  result = await request('/api/vivo/status?project=ViVoAnd');
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.payload, { active: true, pid, top: 'AND2' });
  for (const [A, B, Y] of [['0', '0', '0'], ['0', '1', '0'], ['1', '0', '0'], ['1', '1', '1']]) {
    result = await request('/api/vivo/update', { method: 'POST', body: JSON.stringify({ project: 'ViVoAnd', values: { A, B } }) });
    assert.equal(result.response.status, 200);
    assert.equal(result.payload.pid, pid);
    assert.equal(result.payload.outputs.Y, Y);
  }
  result = await request('/api/vivo/stop', { method: 'POST', body: JSON.stringify({ project: 'ViVoAnd' }) });
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.active, false);
  result = await request('/api/vivo/status?project=ViVoAnd');
  assert.deepEqual(result.payload, { active: false });
  result = await request('/api/vivo/start', { method: 'POST', body: JSON.stringify({ project: 'ViVoAnd', top: 'AND2', connections: connections.slice(0, 2) }) });
  assert.equal(result.response.status, 400);
  assert.equal(result.payload.error.code, 'INCOMPLETE_VIVOO_CONNECTIONS');
});

test('CRUD recuperabile di progetti e file', async (t) => {
  const { root, request } = await setup(t);
  let result = await request('/api/projects', { method: 'POST', body: JSON.stringify({ name: 'Demo' }) });
  assert.equal(result.response.status, 201);
  assert.ok((await fs.stat(path.join(root, 'Demo', 'src'))).isDirectory());

  result = await request('/api/files', { method: 'POST', body: JSON.stringify({ path: 'Demo/src/design.vhd', content: 'entity design is end entity;' }) });
  assert.equal(result.response.status, 201);
  result = await request('/api/file?path=Demo%2Fsrc%2Fdesign.vhd');
  assert.match(result.payload.content, /entity design/);

  result = await request('/api/file', { method: 'PUT', body: JSON.stringify({ path: 'Demo/src/design.vhd', content: 'entity design is\nend entity;' }) });
  assert.equal(result.payload.saved, true);
  result = await request('/api/file', { method: 'PATCH', body: JSON.stringify({ path: 'Demo/src/design.vhd', newPath: 'Demo/src/top.vhd' }) });
  assert.equal(result.payload.path, 'Demo/src/top.vhd');
  result = await request('/api/file', { method: 'DELETE', body: JSON.stringify({ path: 'Demo/src/top.vhd' }) });
  assert.equal(result.payload.recoverable, true);

  result = await request('/api/projects', { method: 'PATCH', body: JSON.stringify({ name: 'Demo', newName: 'Renamed' }) });
  assert.equal(result.payload.name, 'Renamed');
  result = await request('/api/projects', { method: 'DELETE', body: JSON.stringify({ name: 'Renamed' }) });
  assert.equal(result.payload.recoverable, true);
  assert.equal((await fs.readdir(path.join(root, '.ufo-trash'))).length, 1);
});

test('genera design e testbench dai template VHDL', async (t) => {
  const { root, request } = await setup(t);
  let result = await request('/api/projects', { method: 'POST', body: JSON.stringify({ name: 'Demo' }) });
  assert.equal(result.response.status, 201);

  result = await request('/api/design', { method: 'POST', body: JSON.stringify({ project: 'Demo', name: 'PIPPO' }) });
  assert.equal(result.response.status, 201);
  assert.deepEqual(result.payload.files, ['Demo/src/PIPPO.vhd', 'Demo/src/PIPPO_tb.vhd']);
  assert.match(await fs.readFile(path.join(root, 'Demo', 'src', 'PIPPO.vhd'), 'utf8'), /entity PIPPO is/);
  assert.match(await fs.readFile(path.join(root, 'Demo', 'src', 'PIPPO_tb.vhd'), 'utf8'), /entity PIPPO_tb is/);
  assert.doesNotMatch(await fs.readFile(path.join(root, 'Demo', 'src', 'PIPPO_tb.vhd'), 'utf8'), /\$NOME/);

  result = await request('/api/entities?project=Demo');
  assert.deepEqual(result.payload.designs.map((unit) => unit.name), ['PIPPO']);
  assert.deepEqual(result.payload.testbenches.map((unit) => unit.name), ['PIPPO_tb']);
  assert.equal(result.payload.recommendedTestbench, 'PIPPO_tb');
  assert.deepEqual(result.payload.designs[0].ports, [
    { name: 'ESEMPIO_PORTA_IN', direction: 'in', range: null },
    { name: 'ESEMPIO_PORTA_OUT', direction: 'out', range: null },
  ]);
});

test('importa più file VHDL in un’unica operazione', async (t) => {
  const { root, request } = await setup(t);
  let result = await request('/api/projects', { method: 'POST', body: JSON.stringify({ name: 'Demo' }) });
  assert.equal(result.response.status, 201);

  result = await request('/api/files/batch', {
    method: 'POST',
    body: JSON.stringify({ files: [
      { path: 'Demo/src/one.vhd', content: 'entity one is port (a: in bit); end entity;' },
      { path: 'Demo/src/two_tb.vhd', content: 'entity two_tb is end entity;' },
    ] }),
  });
  assert.equal(result.response.status, 201);
  assert.deepEqual(result.payload.files, ['Demo/src/one.vhd', 'Demo/src/two_tb.vhd']);
  assert.equal(await fs.readFile(path.join(root, 'Demo', 'src', 'one.vhd'), 'utf8'), 'entity one is port (a: in bit); end entity;');
  assert.equal(await fs.readFile(path.join(root, 'Demo', 'src', 'two_tb.vhd'), 'utf8'), 'entity two_tb is end entity;');
});

test('importazione multipla non lascia file parziali in caso di conflitto', async (t) => {
  const { root, request } = await setup(t);
  let result = await request('/api/projects', { method: 'POST', body: JSON.stringify({ name: 'Demo' }) });
  assert.equal(result.response.status, 201);
  result = await request('/api/files', { method: 'POST', body: JSON.stringify({ path: 'Demo/src/existing.vhd', content: 'existing' }) });
  assert.equal(result.response.status, 201);

  result = await request('/api/files/batch', {
    method: 'POST',
    body: JSON.stringify({ files: [
      { path: 'Demo/src/existing.vhd', content: 'replacement' },
      { path: 'Demo/src/new.vhd', content: 'new' },
    ] }),
  });
  assert.equal(result.response.status, 409);
  assert.equal(await fs.readFile(path.join(root, 'Demo', 'src', 'existing.vhd'), 'utf8'), 'existing');
  await assert.rejects(fs.access(path.join(root, 'Demo', 'src', 'new.vhd')));
});

test('rifiuta nomi design non validi o ambigui', async (t) => {
  const { request } = await setup(t);
  let result = await request('/api/projects', { method: 'POST', body: JSON.stringify({ name: 'Demo' }) });
  assert.equal(result.response.status, 201);
  result = await request('/api/design', { method: 'POST', body: JSON.stringify({ project: 'Demo', name: 'PIPPO_tb' }) });
  assert.equal(result.response.status, 400);
  assert.equal(result.payload.error.code, 'INVALID_DESIGN_NAME');
});

test('API nega traversal, origine esterna e token mancante', async (t) => {
  const { base, request } = await setup(t);
  let result = await request('/api/file?path=..%2Fetc%2Fpasswd');
  assert.equal(result.response.status, 400);
  result = await request('/api/config', { headers: { Origin: 'http://evil.example' } });
  assert.equal(result.response.status, 403);
  const withoutToken = await fetch(`${base}/api/config`);
  assert.equal(withoutToken.status, 403);
});

test('STOP arresta il server tramite endpoint autenticato', async (t) => {
  const { app, base, request } = await setup(t);
  const result = await request('/api/shutdown', { method: 'POST' });
  assert.equal(result.response.status, 202);
  assert.equal(result.payload.stopping, true);
  await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(fetch(`${base}/api/config`));
});
