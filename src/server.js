'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { AppError, PathGuard, cleanRelative, validProjectName, validVhdlName } = require('./path-guard');
const { inspectProject, listVhdlFiles, sourceDirectory } = require('./vhdl');
const { JobManager } = require('./jobs');
const { VivoRuntimeManager } = require('./vivo-runtime');

const execFileAsync = promisify(execFile);
const REPOSITORY_ROOT = path.resolve(__dirname, '..');
const PUBLIC_ROOT = path.join(REPOSITORY_ROOT, 'public');
const IMAGE_ROOT = path.join(REPOSITORY_ROOT, 'immagini');
const TEMPLATE_ROOT = path.join(REPOSITORY_ROOT, 'Template');
const MONACO_ROOT = path.join(REPOSITORY_ROOT, 'node_modules', 'monaco-editor', 'min');
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_SOURCE_BYTES = 1024 * 1024;
const ENTITY_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.ttf': 'font/ttf',
  '.vcd': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function standardHeaders(extra = {}) {
  return {
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    ...extra,
  };
}

function json(response, status, payload) {
  response.writeHead(status, standardHeaders({ 'Content-Type': 'application/json; charset=utf-8' }));
  response.end(`${JSON.stringify(payload)}\n`);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));
}

function vivoPortLabel(port) {
  if (!port.range) return port.name;
  return `${port.name}[${port.range.replace(/\s+downto\s+/i, ':').replace(/\s+to\s+/i, ':')}]`;
}

function vivoPortMarkup(ports, direction) {
  if (!ports.length) return '—';
  return ports.map((port) => {
    const pin = `<span class="fpga-pin" data-port-name="${escapeHtml(port.name)}" aria-hidden="true"></span>`;
    const label = `<span class="port-label">${escapeHtml(vivoPortLabel(port))}</span>`;
    return `<div class="port-row ${direction}-port" data-port-name="${escapeHtml(port.name)}">${direction === 'input' ? `${label}${pin}` : `${pin}${label}`}</div>`;
  }).join('');
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new AppError(413, 'BODY_TOO_LARGE', 'Richiesta troppo grande.');
    chunks.push(chunk);
  }
  if (size === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new AppError(400, 'INVALID_JSON', 'Corpo JSON non valido.');
  }
}

async function commandVersion(command, args, firstLine = true) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, { timeout: 4_000, maxBuffer: 64 * 1024 });
    const value = `${stdout}${stderr}`.trim();
    return firstLine ? value.split(/\r?\n/)[0] : value;
  } catch (error) {
    return `non disponibile (${error.code || error.message})`;
  }
}

async function detectVersions(tools) {
  const netlistsvgPackage = JSON.parse(await fs.readFile(path.join(REPOSITORY_ROOT, 'node_modules', 'netlistsvg', 'package.json'), 'utf8'));
  const monacoPackage = JSON.parse(await fs.readFile(path.join(REPOSITORY_ROOT, 'node_modules', 'monaco-editor', 'package.json'), 'utf8'));
  return {
    node: process.version,
    ghdl: await commandVersion(tools.ghdl, ['--version']),
    yosys: await commandVersion(tools.yosys, ['-V']),
    gtkwave: 'GTKWave installato (versione registrata in REPORT.md)',
    netlistsvg: netlistsvgPackage.version,
    monacoEditor: monacoPackage.version,
  };
}

function toolPaths() {
  return {
    ghdl: '/usr/bin/ghdl',
    yosys: '/usr/bin/yosys',
    gtkwave: '/usr/bin/gtkwave',
    python: '/usr/bin/python3',
    terminal: 'wt.exe',
    wsl: 'wsl.exe',
    script: '/usr/bin/script',
    wslDistro: null,
    wslUser: null,
    terminalCwd: '/mnt/c/Windows',
    netlistsvg: path.join(REPOSITORY_ROOT, 'node_modules', '.bin', 'netlistsvg'),
  };
}

async function projectTree(guard) {
  const entries = await fs.readdir(guard.root, { withFileTypes: true });
  const projects = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory() || entry.isSymbolicLink() || entry.name.startsWith('.')) continue;
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(entry.name)) continue;
    const project = await guard.project(entry.name);
    const sourceRoot = await sourceDirectory(project.absolute);
    const files = await listVhdlFiles(project.absolute);
    projects.push({
      name: entry.name,
      structured: sourceRoot !== project.absolute,
      sourceDirectory: path.relative(guard.root, sourceRoot).split(path.sep).join('/'),
      files: files.map((filename) => ({
        name: path.basename(filename),
        path: path.relative(guard.root, filename).split(path.sep).join('/'),
        projectPath: path.relative(project.absolute, filename).split(path.sep).join('/'),
      })),
    });
  }
  return projects;
}

async function ensureSourceContent(content) {
  if (typeof content !== 'string') throw new AppError(400, 'INVALID_CONTENT', 'Il contenuto del file deve essere testuale.');
  if (Buffer.byteLength(content, 'utf8') > MAX_SOURCE_BYTES) {
    throw new AppError(413, 'SOURCE_TOO_LARGE', 'Il file VHDL supera il limite di 1 MiB.');
  }
  if (content.includes('\0')) throw new AppError(400, 'BINARY_SOURCE', 'Il file contiene byte non testuali.');
  return content;
}

function projectFromFilePath(relative) {
  const clean = cleanRelative(relative);
  const [project] = clean.split('/');
  validProjectName(project);
  return { clean, project };
}

function validDesignName(value) {
  if (typeof value !== 'string' || !ENTITY_NAME_PATTERN.test(value)) {
    throw new AppError(400, 'INVALID_ENTITY_NAME', 'Il nome della ENTITY deve iniziare con una lettera e contenere soltanto lettere, numeri o underscore.');
  }
  if (/_tb$/i.test(value)) {
    throw new AppError(400, 'INVALID_DESIGN_NAME', 'Il nome del design non può terminare con _tb.');
  }
  return value;
}

async function readDesignTemplates() {
  try {
    return await Promise.all([
      fs.readFile(path.join(TEMPLATE_ROOT, 'Template.vhd'), 'utf8'),
      fs.readFile(path.join(TEMPLATE_ROOT, 'Template_tb.vhd'), 'utf8'),
    ]);
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new AppError(500, 'TEMPLATES_UNAVAILABLE', 'I template VHDL non sono disponibili nella cartella Template.');
    }
    throw error;
  }
}

async function createUfoServer(options) {
  const guard = await PathGuard.create(options.projectsRoot);
  const tools = options.tools || toolPaths();
  const versions = options.versions || await detectVersions(tools);
  const token = crypto.randomBytes(24).toString('hex');
  const jobs = new JobManager({ guard, tools, versions, timeouts: options.timeouts });
  const vivoRuntime = new VivoRuntimeManager({ guard, tools, responseTimeout: options.vivoResponseTimeout });
  let boundPort = options.port ?? 8080;
  let closePromise = null;

  function authenticate(request) {
    const host = request.headers.host || '';
    if (!/^127\.0\.0\.1(?::\d+)?$/.test(host)) {
      throw new AppError(403, 'INVALID_HOST', 'Host non autorizzato.');
    }
    const origin = request.headers.origin;
    if (origin && origin !== `http://127.0.0.1:${boundPort}`) {
      throw new AppError(403, 'INVALID_ORIGIN', 'Origine non autorizzata.');
    }
    if (request.headers['x-ufo-token'] !== token) {
      throw new AppError(403, 'INVALID_TOKEN', 'Token di sessione non valido.');
    }
  }

  async function serveFile(response, root, relative, injectToken = false, replacements = null) {
    const clean = relative.replace(/^\/+/, '');
    if (!clean || clean.split('/').some((part) => !part || part === '.' || part === '..')) {
      throw new AppError(404, 'ASSET_NOT_FOUND', 'Risorsa non trovata.');
    }
    const filename = path.resolve(root, clean);
    const prefix = `${path.resolve(root)}${path.sep}`;
    if (!filename.startsWith(prefix)) throw new AppError(404, 'ASSET_NOT_FOUND', 'Risorsa non trovata.');
    let data = await fs.readFile(filename).catch(() => {
      throw new AppError(404, 'ASSET_NOT_FOUND', 'Risorsa non trovata.');
    });
    if (injectToken || replacements) {
      let source = data.toString('utf8');
      if (injectToken) source = source.replace('__UFO_TOKEN__', token);
      if (replacements) {
        for (const [placeholder, value] of Object.entries(replacements)) source = source.replaceAll(placeholder, value);
      }
      data = Buffer.from(source);
    }
    const type = MIME_TYPES[path.extname(filename).toLowerCase()] || 'application/octet-stream';
    response.writeHead(200, standardHeaders({
      'Content-Type': type,
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    }));
    response.end(data);
  }

  async function closeApplication() {
    if (closePromise) return closePromise;
    closePromise = (async () => {
      await Promise.all([jobs.stopAll(), vivoRuntime.stopAll()]);
      if (!server.listening) return;
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    })();
    return closePromise;
  }

  function scheduleShutdown(response) {
    json(response, 202, { stopping: true });
    setImmediate(() => closeApplication()
      .then(() => options.onShutdown?.())
      .catch((error) => console.error(`Arresto UFO non riuscito: ${error.message}`)));
  }

  async function handleApi(request, response, url) {
    authenticate(request);
    const method = request.method;
    const pathname = url.pathname;

    if (method === 'POST' && pathname === '/api/shutdown') {
      scheduleShutdown(response);
      return;
    }

    if (method === 'GET' && pathname === '/api/config') {
      return json(response, 200, { projectsRoot: guard.root, host: '127.0.0.1', port: boundPort, versions });
    }
    if (method === 'GET' && pathname === '/api/tree') {
      return json(response, 200, { projects: await projectTree(guard) });
    }
    if (method === 'GET' && pathname === '/api/entities') {
      const project = await guard.project(url.searchParams.get('project'));
      return json(response, 200, await inspectProject(project.absolute));
    }
    if (method === 'GET' && pathname === '/api/file') {
      const target = await guard.existing(url.searchParams.get('path'), 'file');
      if (!/\.vhdl?$/i.test(target.relative)) throw new AppError(400, 'INVALID_EXTENSION', 'Il file non è un sorgente VHDL.');
      if (target.stat.size > MAX_SOURCE_BYTES) throw new AppError(413, 'SOURCE_TOO_LARGE', 'Il file supera il limite di 1 MiB.');
      return json(response, 200, { path: target.relative, content: await fs.readFile(target.absolute, 'utf8') });
    }
    if (method === 'POST' && pathname === '/api/projects') {
      const body = await readJson(request);
      const name = validProjectName(body.name);
      const target = await guard.newTarget(name);
      await fs.mkdir(path.join(target.absolute, 'src'), { recursive: true });
      await fs.mkdir(path.join(target.absolute, 'results', 'simulation'), { recursive: true });
      await fs.mkdir(path.join(target.absolute, 'results', 'synthesis'), { recursive: true });
      await fs.mkdir(path.join(target.absolute, '.ufo', 'build'), { recursive: true });
      await fs.writeFile(path.join(target.absolute, '.ufo', 'project.json'), `${JSON.stringify({ name, createdAt: new Date().toISOString() }, null, 2)}\n`);
      return json(response, 201, { name });
    }
    if (method === 'PATCH' && pathname === '/api/projects') {
      const body = await readJson(request);
      const oldName = validProjectName(body.name);
      const newName = validProjectName(body.newName);
      if (jobs.hasActiveProject(oldName)) throw new AppError(409, 'PROJECT_BUSY', 'Impossibile rinominare un progetto occupato.');
      const source = await guard.project(oldName);
      const destination = await guard.newTarget(newName);
      await fs.rename(source.absolute, destination.absolute);
      return json(response, 200, { name: newName });
    }
    if (method === 'DELETE' && pathname === '/api/projects') {
      const body = await readJson(request);
      const name = validProjectName(body.name);
      if (jobs.hasActiveProject(name)) throw new AppError(409, 'PROJECT_BUSY', 'Impossibile eliminare un progetto occupato.');
      const project = await guard.project(name);
      const trash = path.join(guard.root, '.ufo-trash');
      await fs.mkdir(trash, { recursive: true });
      const destination = path.join(trash, `${Date.now()}-${name}`);
      await fs.rename(project.absolute, destination);
      return json(response, 200, { deleted: name, recoverable: true });
    }
    if (method === 'POST' && pathname === '/api/design') {
      const body = await readJson(request);
      const project = validProjectName(body.project);
      const name = validDesignName(body.name);
      const projectTarget = await guard.project(project);
      const sourceRoot = await sourceDirectory(projectTarget.absolute);
      const sourceRelative = path.relative(guard.root, sourceRoot).split(path.sep).join('/');
      const [designTemplate, testbenchTemplate] = await readDesignTemplates();
      const files = [
        { relative: `${sourceRelative}/${name}.vhd`, content: designTemplate.replaceAll('$NOME_tb', `${name}_tb`).replaceAll('$NOME', name) },
        { relative: `${sourceRelative}/${name}_tb.vhd`, content: testbenchTemplate.replaceAll('$NOME_tb', `${name}_tb`).replaceAll('$NOME', name) },
      ];
      for (const file of files) file.content = await ensureSourceContent(file.content);
      const targets = await Promise.all(files.map((file) => guard.newTarget(file.relative)));
      const created = [];
      try {
        for (let index = 0; index < targets.length; index += 1) {
          await fs.writeFile(targets[index].absolute, files[index].content, { encoding: 'utf8', flag: 'wx' });
          created.push(targets[index].absolute);
        }
      } catch (error) {
        await Promise.allSettled(created.map((filename) => fs.unlink(filename)));
        throw error;
      }
      return json(response, 201, { name, files: files.map((file) => file.relative) });
    }
    if (method === 'POST' && pathname === '/api/files') {
      const body = await readJson(request);
      const { clean, project } = projectFromFilePath(body.path);
      validVhdlName(path.basename(clean));
      await guard.project(project);
      const lexical = guard.lexical(clean);
      await fs.mkdir(path.dirname(lexical.absolute), { recursive: true });
      const destination = await guard.newTarget(clean);
      await fs.writeFile(destination.absolute, await ensureSourceContent(body.content || ''), { encoding: 'utf8', flag: 'wx' });
      return json(response, 201, { path: clean });
    }
    if (method === 'POST' && pathname === '/api/files/batch') {
      const body = await readJson(request);
      if (!Array.isArray(body.files) || body.files.length === 0 || body.files.length > 128) {
        throw new AppError(400, 'INVALID_FILE_BATCH', 'Selezionare da uno a 128 file VHDL.');
      }
      const prepared = [];
      const seen = new Set();
      let batchProject = null;
      for (const item of body.files) {
        if (!item || typeof item !== 'object') throw new AppError(400, 'INVALID_FILE_BATCH', 'Elemento di importazione non valido.');
        const { clean, project } = projectFromFilePath(item.path);
        validVhdlName(path.basename(clean));
        if (batchProject && project !== batchProject) {
          throw new AppError(400, 'CROSS_PROJECT_IMPORT', 'Tutti i file devono appartenere allo stesso progetto.');
        }
        batchProject = project;
        if (seen.has(clean)) throw new AppError(409, 'DUPLICATE_FILE', `Il file è presente più volte: ${clean}`);
        seen.add(clean);
        prepared.push({ clean, content: await ensureSourceContent(item.content) });
      }
      await guard.project(batchProject);
      const targets = await Promise.all(prepared.map((file) => guard.newTarget(file.clean)));
      const created = [];
      try {
        for (let index = 0; index < targets.length; index += 1) {
          await fs.writeFile(targets[index].absolute, prepared[index].content, { encoding: 'utf8', flag: 'wx' });
          created.push(targets[index].absolute);
        }
      } catch (error) {
        await Promise.allSettled(created.map((filename) => fs.unlink(filename)));
        throw error;
      }
      return json(response, 201, { files: prepared.map((file) => file.clean) });
    }
    if (method === 'PUT' && pathname === '/api/file') {
      const body = await readJson(request);
      const { clean } = projectFromFilePath(body.path);
      validVhdlName(path.basename(clean));
      const target = await guard.existing(clean, 'file');
      await fs.writeFile(target.absolute, await ensureSourceContent(body.content), 'utf8');
      return json(response, 200, { path: clean, saved: true });
    }
    if (method === 'PATCH' && pathname === '/api/file') {
      const body = await readJson(request);
      const oldPath = projectFromFilePath(body.path);
      const newPath = projectFromFilePath(body.newPath);
      if (oldPath.project !== newPath.project) throw new AppError(400, 'CROSS_PROJECT_RENAME', 'Lo spostamento tra progetti non è consentito.');
      validVhdlName(path.basename(newPath.clean));
      const source = await guard.existing(oldPath.clean, 'file');
      const destination = await guard.newTarget(newPath.clean);
      await fs.rename(source.absolute, destination.absolute);
      return json(response, 200, { path: newPath.clean });
    }
    if (method === 'DELETE' && pathname === '/api/file') {
      const body = await readJson(request);
      const filePath = projectFromFilePath(body.path);
      const source = await guard.existing(filePath.clean, 'file');
      const project = await guard.project(filePath.project);
      const trash = path.join(project.absolute, '.ufo', 'trash');
      await fs.mkdir(trash, { recursive: true });
      const destination = path.join(trash, `${Date.now()}-${path.basename(source.absolute)}`);
      await fs.rename(source.absolute, destination);
      return json(response, 200, { deleted: filePath.clean, recoverable: true });
    }
    if (method === 'POST' && pathname === '/api/jobs/simulate') {
      return json(response, 202, jobs.startSimulation(await readJson(request)));
    }
    if (method === 'POST' && pathname === '/api/jobs/synthesize') {
      return json(response, 202, jobs.startSynthesis(await readJson(request)));
    }
    if (method === 'POST' && pathname === '/api/vivo/start') {
      return json(response, 201, await vivoRuntime.start(await readJson(request)));
    }
    if (method === 'POST' && pathname === '/api/vivo/update') {
      return json(response, 200, await vivoRuntime.update(await readJson(request)));
    }
    if (method === 'POST' && pathname === '/api/vivo/stop') {
      return json(response, 200, await vivoRuntime.stop(await readJson(request)));
    }
    if (method === 'GET' && pathname === '/api/vivo/status') {
      const project = url.searchParams.get('project');
      if (!project) throw new AppError(400, 'INVALID_PROJECT', 'Progetto ViVo mancante.');
      return json(response, 200, vivoRuntime.status({ project }));
    }

    const jobMatch = /^\/api\/jobs\/([A-Za-z0-9-]+)(?:\/(gtkwave|artifact))?$/.exec(pathname);
    if (jobMatch) {
      const [, id, action] = jobMatch;
      if (method === 'GET' && !action) return json(response, 200, jobs.public(id));
      if (method === 'DELETE' && !action) return json(response, 200, jobs.cancel(id));
      if (method === 'POST' && action === 'gtkwave') return json(response, 200, await jobs.openGtkWave(id));
      if (method === 'GET' && action === 'artifact') {
        const kind = url.searchParams.get('kind');
        if (!['rtl', 'json', 'vcd', 'manifest', 'log'].includes(kind)) throw new AppError(400, 'INVALID_ARTIFACT', 'Tipo di risultato non valido.');
        const filename = jobs.artifact(id, kind);
        const data = await fs.readFile(filename);
        const type = MIME_TYPES[path.extname(filename)] || 'application/octet-stream';
        const headers = standardHeaders({ 'Content-Type': type });
        if (kind === 'rtl') headers['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
        response.writeHead(200, headers);
        return response.end(data);
      }
    }
    throw new AppError(404, 'API_NOT_FOUND', 'Endpoint non trovato.');
  }

  async function serveVivo(response, url) {
    const projectName = url.searchParams.get('project');
    const top = url.searchParams.get('top');
    let design = null;
    let error = null;
    if (!projectName || !top) {
      error = 'Design ViVo non specificato.';
    } else {
      try {
        const project = await guard.project(projectName);
        const entities = await inspectProject(project.absolute);
        design = entities.designs.find((unit) => unit.name === top) || null;
        if (!design) error = `Il design selezionato non è disponibile: ${top}`;
      } catch (caught) {
        error = caught.message || 'Impossibile caricare il design ViVo.';
      }
    }
    const ports = design?.ports || [];
    const inputs = ports.filter((port) => port.direction === 'in');
    const outputs = ports.filter((port) => ['out', 'buffer'].includes(port.direction));
    const payload = JSON.stringify({ project: projectName, top, design, error }).replace(/</g, '\\u003c');
    return serveFile(response, PUBLIC_ROOT, 'vivo.html', true, {
      '__VIVO_DESIGN__': payload,
      '__VIVO_BLOCK_HIDDEN__': design ? '' : 'hidden',
      '__VIVO_ENTITY__': design ? escapeHtml(design.name) : '',
      '__VIVO_INPUTS__': vivoPortMarkup(inputs, 'input'),
      '__VIVO_OUTPUTS__': vivoPortMarkup(outputs, 'output'),
      '__VIVO_STATUS_HIDDEN__': design ? 'hidden' : '',
      '__VIVO_STATUS__': error || 'Caricamento del design...',
    });
  }

  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://127.0.0.1');
      if (url.pathname.startsWith('/api/')) return await handleApi(request, response, url);
      if (request.method !== 'GET') throw new AppError(405, 'METHOD_NOT_ALLOWED', 'Metodo non consentito.');
      if (url.pathname === '/' || url.pathname === '/index.html') return await serveFile(response, PUBLIC_ROOT, 'index.html', true);
      if (url.pathname === '/vivo.html') return await serveVivo(response, url);
      if (url.pathname.startsWith('/vendor/monaco/')) {
        return await serveFile(response, MONACO_ROOT, url.pathname.slice('/vendor/monaco/'.length));
      }
      if (url.pathname.startsWith('/immagini/')) {
        return await serveFile(response, IMAGE_ROOT, url.pathname.slice('/immagini/'.length));
      }
      return await serveFile(response, PUBLIC_ROOT, url.pathname);
    } catch (error) {
      const status = error.status || 500;
      if (status >= 500) console.error(error);
      if (!response.headersSent) json(response, status, { error: { code: error.code || 'INTERNAL_ERROR', message: error.message || 'Errore interno.' } });
      else response.end();
    }
  });

  return {
    guard,
    jobs,
    vivoRuntime,
    server,
    token,
    versions,
    async listen() {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(options.port ?? 8080, '127.0.0.1', resolve);
      });
      boundPort = server.address().port;
      return { host: '127.0.0.1', port: boundPort, projectsRoot: guard.root };
    },
    async close() {
      await closeApplication();
    },
  };
}

module.exports = { createUfoServer, detectVersions, projectTree, toolPaths };
