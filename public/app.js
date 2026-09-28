'use strict';

const sessionToken = document.querySelector('meta[name="ufo-token"]').content;
const state = {
  config: null,
  projects: [],
  selected: null,
  selectedProject: null,
  expanded: new Set(),
  models: new Map(),
  activePath: null,
  currentJob: null,
  currentJobKind: null,
  pollTimer: null,
  stopping: false,
  logCount: 0,
  lastSimulationJob: null,
  rtlUrl: null,
  entityInfo: new Map(),
  vivoActive: false,
};

const elements = Object.fromEntries([
  'projects-root', 'project-tree', 'refresh-tree', 'new-project', 'new-file', 'import-file', 'file-upload',
  'rename-selected', 'delete-selected', 'stop-service', 'top-select', 'testbench-select', 'interactive-simulation', 'simulate',
  'synthesize-rtl', 'synthesize', 'vivo', 'stop-job', 'editor-tabs', 'save-file', 'editor-welcome', 'editor',
  'console-output', 'console-resizer', 'job-state', 'clear-console', 'toggle-console',
  'input-dialog', 'dialog-title', 'dialog-description', 'dialog-input', 'toast-region',
].map((id) => [id, document.getElementById(id)]));

let editor;
let monacoApi;

function toast(message, error = false) {
  const item = document.createElement('div');
  item.className = `toast${error ? ' error' : ''}`;
  item.textContent = message;
  elements['toast-region'].append(item);
  setTimeout(() => item.remove(), 4_500);
}

async function api(path, options = {}) {
  const headers = { 'X-UFO-Token': sessionToken, ...options.headers };
  if (options.body && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const response = await fetch(path, { ...options, headers });
  if (!response.ok) {
    let message = `Errore HTTP ${response.status}`;
    try { message = (await response.json()).error.message; } catch { /* risposta non JSON */ }
    throw new Error(message);
  }
  return options.raw ? response : response.json();
}

function dialogInput(title, description, initial = '') {
  elements['dialog-title'].textContent = title;
  elements['dialog-description'].textContent = description;
  elements['dialog-input'].value = initial;
  elements['input-dialog'].showModal();
  setTimeout(() => elements['dialog-input'].select(), 0);
  return new Promise((resolve) => {
    elements['input-dialog'].addEventListener('close', () => {
      resolve(elements['input-dialog'].returnValue === 'confirm' ? elements['dialog-input'].value.trim() : null);
    }, { once: true });
  });
}

function setJobState(value, label) {
  elements['job-state'].className = `job-state ${value}`;
  elements['job-state'].textContent = label;
}

function appendConsole(entry) {
  const line = document.createElement('div');
  line.className = `console-line ${entry.stream}`;
  const phase = document.createElement('span');
  phase.className = 'phase';
  phase.textContent = `[${entry.phase}]`;
  line.append(phase, document.createTextNode(` ${entry.text}`));
  elements['console-output'].append(line);
  elements['console-output'].scrollTop = elements['console-output'].scrollHeight;
}

function projectByName(name) { return state.projects.find((project) => project.name === name); }

function entityFilePath(project, entity) {
  return `${project}/${entity.file}`;
}

function displayFileName(filePath) {
  return filePath.split('/').pop();
}

function appendFileRow(container, project, file, depth = 0, label = file.name, testbench = false) {
  const fileRow = document.createElement('div');
  fileRow.className = `tree-row tree-file hierarchy-node${testbench ? ' testbench' : ''}${state.selected?.path === file.path ? ' selected' : ''}`;
  fileRow.style.setProperty('--depth', String(depth));
  const icon = testbench ? 'testbench' : 'vhdl';
  fileRow.innerHTML = `<img class="file-icon" src="/immagini/${icon}.svg" alt=""><span>${label}</span>`;
  fileRow.title = file.path;
  fileRow.addEventListener('click', (event) => {
    event.stopPropagation();
    selectItem('file', project, file.path, false);
  });
  fileRow.addEventListener('dblclick', (event) => {
    event.stopPropagation();
    openFile(file.path).catch((error) => toast(error.message, true));
  });
  container.append(fileRow);
}

function appendEntityBranch(container, project, unit, info, filesByPath, depth, ancestry, renderedPaths) {
  const key = unit.name.toLowerCase();
  if (ancestry.has(key)) return;
  const nextAncestry = new Set(ancestry).add(key);
  const file = filesByPath.get(entityFilePath(project, unit));
  if (file) {
    appendFileRow(container, project, file, depth, file.name);
    renderedPaths.add(file.path);
  }

  // Most course projects name the testbench <entity>_tb. Keep it directly
  // below its design, at the same indentation level.
  const testbench = info.testbenches.find((candidate) => candidate.name.toLowerCase() === `${unit.name.toLowerCase()}_tb`);
  if (testbench) {
    const testbenchFile = filesByPath.get(entityFilePath(project, testbench));
    if (testbenchFile) {
      appendFileRow(container, project, testbenchFile, depth, testbenchFile.name, true);
      renderedPaths.add(testbenchFile.path);
    }
  }

  const children = [...new Map(unit.instantiates
    .map((child) => info.units.find((candidate) => candidate.name.toLowerCase() === child.toLowerCase()))
    .filter(Boolean)
    .map((child) => [child.name.toLowerCase(), child])).values()];
  for (const child of children) appendEntityBranch(container, project, child, info, filesByPath, depth + 1, nextAncestry, renderedPaths);
}

function selectItem(kind, project, path = null, updateTree = true) {
  state.selected = { kind, project, path };
  state.selectedProject = project;
  if (updateTree) {
    renderTree();
    refreshEntities().catch((error) => toast(error.message, true));
  } else {
    elements['project-tree'].querySelectorAll('.tree-file.selected').forEach((item) => item.classList.remove('selected'));
    elements['project-tree'].querySelector(`[title="${CSS.escape(path)}"]`)?.classList.add('selected');
  }
}

function renderTree() {
  elements['project-tree'].replaceChildren();
  for (const project of state.projects) {
    const wrapper = document.createElement('div');
    wrapper.className = 'tree-project';
    const row = document.createElement('div');
    row.className = `tree-row${state.selected?.kind === 'project' && state.selected.project === project.name ? ' selected' : ''}`;
    row.setAttribute('role', 'treeitem');
    const projectIcon = state.expanded.has(project.name) ? 'project-open' : 'project';
    row.innerHTML = `<span class="caret">${state.expanded.has(project.name) ? '⌄' : '›'}</span><img class="folder" src="/immagini/${projectIcon}.svg" alt=""><span>${project.name}</span>`;
    row.addEventListener('click', () => {
      if (state.expanded.has(project.name)) state.expanded.delete(project.name); else state.expanded.add(project.name);
      selectItem('project', project.name);
    });
    wrapper.append(row);
    if (state.expanded.has(project.name)) {
      const files = document.createElement('div');
      files.className = 'tree-files';
      const info = state.entityInfo.get(project.name);
      const filesByPath = new Map(project.files.map((file) => [file.path, file]));
      const renderedPaths = new Set();
      if (info) {
        const roots = info.roots.length ? info.roots : info.designs.map((unit) => unit.name);
        for (const rootName of roots) {
          const root = info.units.find((unit) => unit.name === rootName);
          if (root) {
            appendEntityBranch(files, project.name, root, info, filesByPath, 0, new Set(), renderedPaths);
          }
        }
        const unassociatedTestbenches = info.testbenches.filter((unit) => !info.designs.some((design) => design.name.toLowerCase() === unit.name.replace(/_tb$/i, '').toLowerCase()));
        if (unassociatedTestbenches.length) {
          const group = document.createElement('div');
          group.className = 'tree-group';
          group.textContent = 'Testbench';
          files.append(group);
          for (const unit of unassociatedTestbenches) {
            const file = filesByPath.get(entityFilePath(project.name, unit));
            if (file) { appendFileRow(files, project.name, file, 0, file.name, true); renderedPaths.add(file.path); }
          }
        }
        for (const file of project.files) {
          if (!renderedPaths.has(file.path)) appendFileRow(files, project.name, file, 0, file.name, /(?:^|_)tb\.vhdl?$/i.test(file.name));
        }
      } else {
        for (const file of project.files) appendFileRow(files, project.name, file, 0, file.name, /(?:^|_)tb\.vhdl?$/i.test(file.name));
      }
      if (project.files.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'tree-row';
        empty.textContent = 'Nessun file VHDL';
        files.append(empty);
      }
      wrapper.append(files);
    }
    elements['project-tree'].append(wrapper);
  }
}

async function refreshTree(preferredProject = state.selectedProject) {
  const data = await api('/api/tree');
  state.projects = data.projects;
  if (preferredProject && projectByName(preferredProject)) {
    state.selectedProject = preferredProject;
    state.expanded.add(preferredProject);
  } else if (state.projects.length === 1) {
    state.selectedProject = state.projects[0].name;
    state.expanded.add(state.selectedProject);
  }
  renderTree();
  await refreshEntities();
}

async function refreshEntities() {
  const topSelect = elements['top-select'];
  const tbSelect = elements['testbench-select'];
  topSelect.innerHTML = '<option value="">— seleziona —</option>';
  tbSelect.innerHTML = '<option value="">— seleziona —</option>';
  if (!state.selectedProject) {
    await refreshVivoAvailability();
    return;
  }
  const data = await api(`/api/entities?project=${encodeURIComponent(state.selectedProject)}`);
  state.entityInfo.set(state.selectedProject, data);
  for (const design of data.designs) topSelect.add(new Option(displayFileName(design.file), design.name));
  for (const testbench of data.testbenches) tbSelect.add(new Option(displayFileName(testbench.file), testbench.name));
  if (data.recommendedTop) topSelect.value = data.recommendedTop;
  if (data.recommendedTestbench) tbSelect.value = data.recommendedTestbench;
  renderTree();
  await refreshVivoAvailability();
}

async function refreshVivoAvailability() {
  const project = state.selectedProject;
  if (!project) {
    state.vivoActive = false;
    elements.vivo.disabled = false;
    elements.vivo.title = '';
    return;
  }
  try {
    const status = await api(`/api/vivo/status?project=${encodeURIComponent(project)}`);
    if (project !== state.selectedProject) return;
    state.vivoActive = status.active;
    elements.vivo.disabled = status.active;
    elements.vivo.title = status.active ? `ViVo già attiva per ${project}` : '';
  } catch {
    if (project !== state.selectedProject) return;
    state.vivoActive = false;
    elements.vivo.disabled = false;
    elements.vivo.title = '';
  }
}

function renderTabs() {
  elements['editor-tabs'].replaceChildren();
  for (const [filePath, item] of state.models) {
    const tab = document.createElement('div');
    tab.className = `editor-tab${state.activePath === filePath ? ' active' : ''}`;
    tab.title = filePath;
    const name = document.createElement('span');
    name.className = 'tab-name';
    name.textContent = filePath.split('/').pop();
    const dirty = document.createElement('span');
    dirty.className = 'dirty';
    dirty.textContent = item.dirty ? '●' : '';
    const close = document.createElement('button');
    close.textContent = '×';
    close.title = 'Chiudi scheda';
    close.addEventListener('click', (event) => { event.stopPropagation(); closeFile(filePath); });
    tab.addEventListener('click', () => activateFile(filePath));
    tab.append(name, dirty, close);
    elements['editor-tabs'].append(tab);
  }
}

function activateFile(filePath) {
  const item = state.models.get(filePath);
  if (!item) return;
  state.activePath = filePath;
  state.selectedProject = filePath.split('/')[0];
  editor.setModel(item.model);
  elements['editor-welcome'].hidden = true;
  elements.editor.style.display = 'block';
  renderTabs();
  editor.focus();
}

async function openFile(filePath) {
  if (!state.models.has(filePath)) {
    const data = await api(`/api/file?path=${encodeURIComponent(filePath)}`);
    const uri = monacoApi.Uri.parse(`inmemory://ufo/${filePath}`);
    const model = monacoApi.editor.createModel(data.content, 'vhdl', uri);
    const item = { model, dirty: false, savedValue: data.content };
    model.onDidChangeContent(() => {
      item.dirty = model.getValue() !== item.savedValue;
      renderTabs();
    });
    state.models.set(filePath, item);
  }
  activateFile(filePath);
}

function closeFile(filePath, force = false) {
  const item = state.models.get(filePath);
  if (!item) return;
  if (!force && item.dirty && !window.confirm(`Chiudere ${filePath} senza salvare?`)) return;
  item.model.dispose();
  state.models.delete(filePath);
  if (state.activePath === filePath) {
    state.activePath = state.models.keys().next().value || null;
    if (state.activePath) activateFile(state.activePath);
    else {
      editor.setModel(null);
      elements['editor-welcome'].hidden = false;
    }
  }
  renderTabs();
}

async function saveActive() {
  const item = state.models.get(state.activePath);
  if (!item) return;
  await api('/api/file', { method: 'PUT', body: JSON.stringify({ path: state.activePath, content: item.model.getValue() }) });
  item.savedValue = item.model.getValue();
  item.dirty = false;
  renderTabs();
  toast(`Salvato ${state.activePath}`);
  await refreshEntities();
}

async function createProject() {
  const name = await dialogInput('Nuovo progetto', 'Usa lettere, numeri, punto, trattino o underscore.');
  if (!name) return;
  await api('/api/projects', { method: 'POST', body: JSON.stringify({ name }) });
  state.expanded.add(name);
  state.selectedProject = name;
  await refreshTree(name);
  toast(`Progetto ${name} creato.`);
}

function sourcePathFor(project, filename) {
  const selected = projectByName(project);
  const sourceDirectory = selected?.sourceDirectory || project;
  return `${sourceDirectory}/${filename}`;
}

async function createFile(content = '', suggestedName = '') {
  if (!state.selectedProject) return toast('Seleziona prima un progetto.', true);
  const name = await dialogInput('Nuovo file VHDL', 'Il nome deve terminare con .vhd o .vhdl.', suggestedName);
  if (!name) return;
  const filePath = sourcePathFor(state.selectedProject, name);
  await api('/api/files', { method: 'POST', body: JSON.stringify({ path: filePath, content }) });
  await refreshTree(state.selectedProject);
  await openFile(filePath);
  toast(`Creato ${filePath}`);
}

async function createDesign() {
  if (!state.selectedProject) return toast('Seleziona prima un progetto.', true);
  const name = await dialogInput('Nuova ENTITY VHDL', 'Inserisci il nome della ENTITY di design (es. My_Buffer). UFO creerà anche il relativo testbench.', '');
  if (!name) return;
  const result = await api('/api/design', { method: 'POST', body: JSON.stringify({ project: state.selectedProject, name }) });
  await refreshTree(state.selectedProject);
  await openFile(result.files[0]);
  toast(`Creati ${result.files[0]} e ${result.files[1]}.`);
}

async function importFiles(files) {
  if (!state.selectedProject) return toast('Seleziona prima un progetto.', true);
  const selectedFiles = [...files];
  if (!selectedFiles.length) return;
  if (selectedFiles.some((file) => !/\.vhdl?$/i.test(file.name))) {
    return toast('Seleziona soltanto file .vhd o .vhdl.', true);
  }
  const names = selectedFiles.map((file) => file.name.toLowerCase());
  if (new Set(names).size !== names.length) return toast('Non puoi importare due file con lo stesso nome.', true);
  const payloadFiles = await Promise.all(selectedFiles.map(async (file) => ({
    path: sourcePathFor(state.selectedProject, file.name),
    content: await file.text(),
  })));
  const result = await api('/api/files/batch', { method: 'POST', body: JSON.stringify({ files: payloadFiles }) });
  await refreshTree(state.selectedProject);
  await openFile(result.files[0]);
  toast(`Importati ${result.files.length} file VHDL.`);
}

async function renameSelected() {
  if (!state.selected) return toast('Seleziona un progetto o un file.', true);
  if (state.selected.kind === 'project') {
    const oldName = state.selected.project;
    const newName = await dialogInput('Rinomina progetto', 'Nuovo nome del progetto.', oldName);
    if (!newName || newName === oldName) return;
    await api('/api/projects', { method: 'PATCH', body: JSON.stringify({ name: oldName, newName }) });
    state.selected = { kind: 'project', project: newName, path: null };
    state.selectedProject = newName;
    state.expanded.delete(oldName);
    state.expanded.add(newName);
    await refreshTree(newName);
    return toast(`Progetto rinominato in ${newName}.`);
  }
  const oldPath = state.selected.path;
  const oldName = oldPath.split('/').pop();
  const newName = await dialogInput('Rinomina file', 'Nuovo nome VHDL.', oldName);
  if (!newName || newName === oldName) return;
  const newPath = `${oldPath.slice(0, -oldName.length)}${newName}`;
  await api('/api/file', { method: 'PATCH', body: JSON.stringify({ path: oldPath, newPath }) });
  if (state.models.has(oldPath)) closeFile(oldPath, true);
  state.selected.path = newPath;
  await refreshTree(state.selectedProject);
  await openFile(newPath);
  toast(`File rinominato in ${newName}.`);
}

async function deleteSelected() {
  if (!state.selected) return toast('Seleziona un progetto o un file.', true);
  const label = state.selected.kind === 'project' ? state.selected.project : state.selected.path;
  if (!window.confirm(`Spostare “${label}” nel cestino recuperabile di UFO?`)) return;
  if (state.selected.kind === 'project') {
    await api('/api/projects', { method: 'DELETE', body: JSON.stringify({ name: state.selected.project }) });
    for (const filePath of [...state.models.keys()]) if (filePath.startsWith(`${state.selected.project}/`)) closeFile(filePath, true);
    state.selected = null;
    state.selectedProject = null;
  } else {
    await api('/api/file', { method: 'DELETE', body: JSON.stringify({ path: state.selected.path }) });
    closeFile(state.selected.path, true);
    state.selected = { kind: 'project', project: state.selected.project, path: null };
  }
  await refreshTree();
  toast('Elemento spostato nel cestino UFO.');
}

async function stopService() {
  const button = elements['stop-service'];
  button.disabled = true;
  try {
    await api('/api/shutdown', { method: 'POST' });
    state.stopping = true;
    document.body.innerHTML = '<main class="shutdown-screen"><div><div class="shutdown-mark">UFO</div><h1>UFO arrestato</h1><p>Il servizio è stato arrestato.</p><p class="shutdown-hint">Puoi chiudere questa scheda.</p></div></main>';
    window.setTimeout(() => window.close(), 120);
  } catch (error) {
    button.disabled = false;
    toast(`Arresto non riuscito: ${error.message}`, true);
  }
}

function setMarkers(diagnostics) {
  for (const [filePath, item] of state.models) {
    const matching = diagnostics.filter((diagnostic) => filePath.endsWith(diagnostic.file) || diagnostic.file.endsWith(filePath.split('/').slice(1).join('/')));
    monacoApi.editor.setModelMarkers(item.model, 'ghdl', matching.map((diagnostic) => ({
      startLineNumber: diagnostic.line,
      startColumn: diagnostic.column,
      endLineNumber: diagnostic.line,
      endColumn: diagnostic.column + 1,
      message: diagnostic.message,
      severity: monacoApi.MarkerSeverity.Error,
      source: 'GHDL',
    })));
  }
}

function setSynthesisButtonsDisabled(disabled) {
  elements['synthesize-rtl'].disabled = disabled;
  elements.synthesize.disabled = disabled;
}

async function startJob(kind, synthesisMode = null) {
  if (!state.selectedProject) return toast('Seleziona un progetto.', true);
  const body = { project: state.selectedProject };
  const endpoint = kind === 'simulation' ? '/api/jobs/simulate' : '/api/jobs/synthesize';
  if (kind === 'simulation') {
    body.testbench = elements['testbench-select'].value;
    body.stopTime = '1us';
    body.interactive = elements['interactive-simulation'].checked;
    if (!body.testbench) return toast('Seleziona un testbench.', true);
  } else {
    body.top = elements['top-select'].value;
    if (!body.top) return toast('Seleziona il top-level RTL.', true);
    body.mode = synthesisMode;
  }
  elements['console-output'].replaceChildren();
  state.logCount = 0;
  const job = await api(endpoint, { method: 'POST', body: JSON.stringify(body) });
  state.currentJob = job.id;
  state.currentJobKind = kind;
  const synthesisLabel = synthesisMode === 'gate' ? 'Sintesi GATE' : 'Sintesi RTL';
  setJobState('running', kind === 'simulation' ? 'Simulazione' : synthesisLabel);
  elements['stop-job'].disabled = false;
  elements.simulate.disabled = true;
  setSynthesisButtonsDisabled(true);
  await pollJob();
}

async function pollJob() {
  if (!state.currentJob) return;
  try {
    const job = await api(`/api/jobs/${state.currentJob}`);
    for (const entry of job.logs.slice(state.logCount)) appendConsole(entry);
    state.logCount = job.logs.length;
    setJobState(job.state, `${job.phase} · ${job.state}`);
    if (job.state === 'running' || job.state === 'queued') {
      state.pollTimer = setTimeout(pollJob, 350);
      return;
    }
    elements['stop-job'].disabled = true;
    elements.simulate.disabled = false;
    setSynthesisButtonsDisabled(false);
    setMarkers(job.diagnostics || []);
    if (job.state === 'completed' && job.kind === 'simulation' && !job.interactive) {
      state.lastSimulationJob = job.id;
      try {
        await api(`/api/jobs/${job.id}/gtkwave`, { method: 'POST' });
        toast('GTKWave avviato.');
      } catch (error) {
        toast(`Simulazione completata, ma GTKWave non è stato avviato: ${error.message}`, true);
      }
    }
    if (job.state === 'completed' && job.kind === 'simulation' && job.interactive) {
      toast('Simulazione EXT_SIM avviata nel terminale esterno.');
    }
    if (job.state === 'completed' && job.kind === 'synthesis') await showRtl(job.id);
    if (job.state !== 'completed') toast(job.error || 'Operazione non completata.', true);
    state.currentJob = null;
  } catch (error) {
    toast(error.message, true);
    state.currentJob = null;
    elements['stop-job'].disabled = true;
    elements.simulate.disabled = false;
    setSynthesisButtonsDisabled(false);
    setJobState('failed', 'Errore comunicazione');
  }
}

async function showRtl(jobId) {
  const response = await api(`/api/jobs/${jobId}/artifact?kind=rtl`, { raw: true });
  const blob = await response.blob();
  state.rtlUrl = URL.createObjectURL(blob);
  const windowRef = window.open(state.rtlUrl, '_blank', 'noopener,noreferrer');
  if (!windowRef) toast('Il browser ha bloccato la nuova finestra SVG.', true);
}

function openVivo() {
  const project = state.selectedProject;
  const top = elements['top-select'].value;
  if (!project) return toast('Seleziona prima un progetto.', true);
  if (!top) return toast('Seleziona prima il top-level RTL.', true);
  if (state.vivoActive) return toast('ViVo è già attiva per questo progetto.', true);
  const url = new URL('/vivo.html', window.location.href);
  url.searchParams.set('project', project);
  url.searchParams.set('top', top);
  const windowRef = window.open(url.href, '_blank', 'noopener,noreferrer');
  if (!windowRef) toast('Il browser ha bloccato la nuova finestra ViVo.', true);
}

function registerVhdl(monaco) {
  monaco.languages.register({ id: 'vhdl', extensions: ['.vhd', '.vhdl'], aliases: ['VHDL'] });
  monaco.languages.setLanguageConfiguration('vhdl', {
    comments: { lineComment: '--' },
    brackets: [['(', ')'], ['[', ']']],
    autoClosingPairs: [{ open: '(', close: ')' }, { open: '"', close: '"' }, { open: "'", close: "'" }],
  });
  monaco.languages.setMonarchTokensProvider('vhdl', {
    ignoreCase: true,
    defaultToken: '',
    keywords: [
      'architecture', 'array', 'assert', 'attribute', 'begin', 'block', 'body', 'buffer', 'bus', 'case',
      'component', 'configuration', 'constant', 'disconnect', 'downto', 'else', 'elsif', 'end', 'entity',
      'exit', 'file', 'for', 'function', 'generate', 'generic', 'group', 'guarded', 'if', 'impure', 'in',
      'inertial', 'inout', 'is', 'label', 'library', 'linkage', 'literal', 'loop', 'map', 'new', 'next',
      'null', 'of', 'on', 'open', 'others', 'out', 'package', 'port', 'postponed', 'procedure', 'process',
      'pure', 'range', 'record', 'register', 'reject', 'report', 'return', 'select', 'severity', 'signal',
      'shared', 'subtype', 'then', 'to', 'transport', 'type', 'unaffected', 'units', 'until', 'use',
      'variable', 'wait', 'when', 'while', 'with', 'and', 'or', 'nand', 'nor', 'xor', 'xnor', 'not', 'mod', 'rem',
    ],
    typeKeywords: ['std_logic', 'std_logic_vector', 'unsigned', 'signed', 'integer', 'natural', 'boolean', 'bit', 'bit_vector', 'time'],
    tokenizer: {
      root: [
        [/--.*$/, 'comment'],
        [/[A-Za-z][\w]*/, { cases: { '@keywords': 'keyword', '@typeKeywords': 'type', '@default': 'identifier' } }],
        [/"([^"\\]|\\.)*"/, 'string'],
        [/'[^']*'/, 'string'],
        [/\d+(?:\.\d+)?(?:\s*(?:fs|ps|ns|us|ms|sec))?/, 'number'],
        [/:=|<=|=>|\*\*|\/=|>=|[+\-*\/=<>:&]/, 'operator'],
        [/[()[\],.;]/, 'delimiter'],
      ],
    },
  });
  monaco.editor.defineTheme('ufo-dark', {
    base: 'vs-dark', inherit: true,
    rules: [
      { token: 'comment', foreground: '6A9955' },
      { token: 'keyword', foreground: '50CFE6' },
      { token: 'type', foreground: 'D287E8' },
      { token: 'string', foreground: 'E59B72' },
      { token: 'number', foreground: 'B5CEA8' },
      { token: 'operator', foreground: 'D7E0E4' },
    ],
    colors: {
      'editor.background': '#0D1418', 'editor.foreground': '#D8E1E5', 'editorLineNumber.foreground': '#53656D',
      'editorLineNumber.activeForeground': '#20D8F4', 'editorCursor.foreground': '#20D8F4',
      'editor.selectionBackground': '#164A59', 'editor.inactiveSelectionBackground': '#123743',
    },
  });
}

function bindEvents() {
  elements['dialog-input'].addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    elements['input-dialog'].close('confirm');
  });
  elements['refresh-tree'].addEventListener('click', () => refreshTree().catch((error) => toast(error.message, true)));
  elements['new-project'].addEventListener('click', () => createProject().catch((error) => toast(error.message, true)));
  elements['new-file'].addEventListener('click', () => createDesign().catch((error) => toast(error.message, true)));
  elements['import-file'].addEventListener('click', () => elements['file-upload'].click());
  elements['file-upload'].addEventListener('change', () => {
    const files = elements['file-upload'].files;
    if (files.length) importFiles(files).catch((error) => toast(error.message, true));
    elements['file-upload'].value = '';
  });
  elements['rename-selected'].addEventListener('click', () => renameSelected().catch((error) => toast(error.message, true)));
  elements['delete-selected'].addEventListener('click', () => deleteSelected().catch((error) => toast(error.message, true)));
  elements['stop-service'].addEventListener('click', () => stopService());
  elements['save-file'].addEventListener('click', () => saveActive().catch((error) => toast(error.message, true)));
  elements.simulate.addEventListener('click', () => startJob('simulation').catch((error) => toast(error.message, true)));
  elements['synthesize-rtl'].addEventListener('click', () => startJob('synthesis', 'rtl').catch((error) => toast(error.message, true)));
  elements.synthesize.addEventListener('click', () => startJob('synthesis', 'gate').catch((error) => toast(error.message, true)));
  elements.vivo.addEventListener('click', () => openVivo());
  elements['stop-job'].addEventListener('click', () => state.currentJob && api(`/api/jobs/${state.currentJob}`, { method: 'DELETE' }).catch((error) => toast(error.message, true)));
  elements['clear-console'].addEventListener('click', () => elements['console-output'].replaceChildren());
  elements['toggle-console'].addEventListener('click', () => document.querySelector('.console-panel').classList.toggle('collapsed'));
  elements['console-resizer'].addEventListener('pointerdown', (event) => {
    event.preventDefault();
    const workbench = document.querySelector('.workbench');
    const onMove = (moveEvent) => {
      const bounds = workbench.getBoundingClientRect();
      const height = Math.max(110, Math.min(480, bounds.bottom - moveEvent.clientY));
      workbench.style.setProperty('--console-height', `${height}px`);
    };
    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.body.classList.remove('resizing-console');
    };
    document.body.classList.add('resizing-console');
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp, { once: true });
  });
  window.addEventListener('beforeunload', (event) => {
    if (!state.stopping && [...state.models.values()].some((item) => item.dirty)) { event.preventDefault(); event.returnValue = ''; }
  });
  window.addEventListener('focus', () => refreshVivoAvailability());
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshVivoAvailability();
  });
}

window.MonacoEnvironment = {
  getWorkerUrl() {
    const source = "self.MonacoEnvironment={baseUrl:'/vendor/monaco/'};importScripts('/vendor/monaco/vs/base/worker/workerMain.js');";
    return URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  },
};

window.require.config({ paths: { vs: '/vendor/monaco/vs' } });
window.require(['vs/editor/editor.main'], async () => {
  monacoApi = window.monaco;
  registerVhdl(monacoApi);
  editor = monacoApi.editor.create(elements.editor, {
    theme: 'ufo-dark', language: 'vhdl', model: null, automaticLayout: true,
    fontFamily: 'Cascadia Code, Fira Code, monospace', fontSize: 14, lineHeight: 21,
    minimap: { enabled: false }, padding: { top: 12 }, smoothScrolling: true,
    renderWhitespace: 'selection', tabSize: 4, insertSpaces: true,
  });
  editor.addCommand(monacoApi.KeyMod.CtrlCmd | monacoApi.KeyCode.KeyS, () => saveActive().catch((error) => toast(error.message, true)));
  bindEvents();
  try {
    state.config = await api('/api/config');
    elements['projects-root'].textContent = state.config.projectsRoot;
    elements['projects-root'].title = state.config.projectsRoot;
    appendConsole({ phase: 'UFO', stream: 'status', text: `Radice attiva: ${state.config.projectsRoot}` });
    appendConsole({ phase: 'UFO', stream: 'status', text: `GHDL: ${state.config.versions.ghdl}` });
    await refreshTree();
    window.setInterval(() => {
      if (!document.hidden) refreshVivoAvailability();
    }, 1_500);
  } catch (error) {
    toast(error.message, true);
    setJobState('failed', 'Backend non disponibile');
  }
});
