'use strict';

const sessionToken = document.querySelector('meta[name="ufo-token"]').content;
const params = new URLSearchParams(window.location.search);
const project = params.get('project');
const selectedTop = params.get('top');
const VIVOO_TYPES = Object.freeze([
  { id: 'switch', label: 'Switch', category: 'input', prefix: 'SW', defaultState: 'off', assets: { off: '/immagini/vivo-switch-off.svg', on: '/immagini/vivo-switch-on.svg' } },
  { id: 'push-button', label: 'Push Button', category: 'input', prefix: 'BTN', defaultState: 'up', assets: { up: '/immagini/vivo-button-up.svg', down: '/immagini/vivo-button-down.svg' } },
  { id: 'led', label: 'LED', category: 'output', prefix: 'LED', defaultState: 'off', assets: { off: '/immagini/vivo-led-off.svg', on: '/immagini/vivo-led-on.svg' } },
  { id: 'seven-segment', label: 'Display7LED', category: 'output', prefix: 'DIS', bitWidth: 7, renderMode: 'dynamic', defaultState: '0000000' },
  { id: 'hex-keypad', label: 'Hex Keypad', category: 'input', prefix: 'KEY', bitWidth: 4, renderMode: 'keypad', defaultState: '0000' },
]);
const VIVOO_BY_ID = new Map(VIVOO_TYPES.map((type) => [type.id, type]));
// Ordine unico del vettore: bit 6..0 => segmenti a,b,c,d,e,f,g (sinistra-destra nella stringa).
const SEVEN_SEGMENT_ORDER = Object.freeze(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
const HEX_KEYPAD_VALUES = '0123456789ABCDEF';
const VIVOO_INSTANCE_WIDTH = 62;
const VIVOO_INSTANCE_HEIGHT = 80;
const elements = {
  caption: document.getElementById('design-caption'),
  object: document.getElementById('fpga-object'),
  status: document.getElementById('design-status'),
  entity: document.getElementById('entity-name'),
  inputs: document.getElementById('input-ports'),
  outputs: document.getElementById('output-ports'),
  console: document.getElementById('console-output'),
  consoleResizer: document.getElementById('console-resizer'),
  designData: document.getElementById('vivo-design-data'),
  fpgaBlock: document.getElementById('fpga-block'),
  vivooLayer: document.getElementById('vivoo-layer'),
  vivooInputLibrary: document.getElementById('vivoo-input-library'),
  vivooOutputLibrary: document.getElementById('vivoo-output-library'),
  importVivoo: document.getElementById('import-vivoo'),
  start: document.getElementById('vivo-start'),
  stop: document.getElementById('vivo-stop'),
  simulationStatus: document.getElementById('vivo-simulation-status'),
  toast: document.getElementById('vivo-toast'),
};
const state = {
  selectedVivooType: null,
  vivooInstances: [],
  designPorts: [],
  openPinMenuId: null,
  selectedVivooId: null,
  lastRemovedVivoo: null,
  undoToastTimer: null,
  simulation: { active: false, pid: null },
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || 'GET',
    headers: { 'X-UFO-Token': sessionToken, ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!response.ok) {
    let message = `Errore HTTP ${response.status}`;
    try { message = (await response.json()).error.message; } catch { /* risposta non JSON */ }
    throw new Error(message);
  }
  return response.json();
}

function renderSimulationControls() {
  elements.start.disabled = state.simulation.active || !state.designPorts.length;
  elements.stop.disabled = !state.simulation.active;
  elements.importVivoo.disabled = state.simulation.active || !selectedVivooType();
  for (const remove of elements.vivooLayer.querySelectorAll('.vivoo-delete')) remove.disabled = state.simulation.active;
  elements.simulationStatus.textContent = state.simulation.active ? `SIMULAZIONE ATTIVA · PID ${state.simulation.pid}` : 'SIMULAZIONE FERMA';
  elements.simulationStatus.classList.toggle('active', state.simulation.active);
}

function log(message, kind = 'status') {
  const line = document.createElement('div');
  line.className = `console-line ${kind}`;
  line.textContent = message;
  elements.console.append(line);
  elements.console.scrollTop = elements.console.scrollHeight;
}

function displayRange(range) {
  if (!range) return '';
  return `[${range.replace(/\s+downto\s+/i, ':').replace(/\s+to\s+/i, ':')}]`;
}

function vectorWidth(port) {
  if (!port.range) return null;
  const match = port.range.match(/^\s*(-?\d+)\s+(downto|to)\s+(-?\d+)\s*$/i);
  return match ? Math.abs(Number(match[1]) - Number(match[3])) + 1 : null;
}

function createSevenSegmentSvg(pattern, className = '') {
  const safePattern = /^[01]{7}$/.test(pattern) ? pattern : '0000000';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 64 96');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('seven-segment-svg', className);
  const segments = {
    a: '14,8 50,8 55,13 50,18 14,18 9,13', b: '51,15 56,20 56,43 51,48 46,43 46,20',
    c: '51,50 56,55 56,78 51,83 46,78 46,55', d: '14,80 50,80 55,85 50,90 14,90 9,85',
    e: '8,50 13,55 13,78 8,83 3,78 3,55', f: '8,15 13,20 13,43 8,48 3,43 3,20',
    g: '14,44 50,44 55,49 50,54 14,54 9,49',
  };
  for (const [index, name] of SEVEN_SEGMENT_ORDER.entries()) {
    const segment = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    segment.setAttribute('points', segments[name]);
    segment.dataset.segment = name;
    segment.classList.add('seven-segment-part', safePattern[index] === '1' ? 'segment-on' : 'segment-off');
    svg.append(segment);
  }
  return svg;
}

function createVivooVisual(type, instance, className, interactive = false) {
  if (type.renderMode === 'dynamic') return createSevenSegmentSvg(instance.visualState, className);
  if (type.renderMode === 'keypad') return createHexKeypad(instance, className, interactive);
  const icon = document.createElement('img');
  icon.className = className;
  icon.src = type.assets[instance.visualState];
  icon.alt = '';
  return icon;
}

function createHexKeypad(instance, className = '', interactive = true) {
  const grid = document.createElement('div');
  grid.className = `hex-keypad-grid ${className}`.trim();
  for (const value of HEX_KEYPAD_VALUES) {
    const key = document.createElement('button');
    key.type = 'button'; key.className = 'hex-keypad-key'; key.textContent = value;
    key.setAttribute('aria-label', `Valore esadecimale ${value}`);
    key.classList.toggle('selected', instance.visualState === Number.parseInt(value, 16).toString(2).padStart(4, '0'));
    if (interactive) key.addEventListener('click', (event) => {
      event.stopPropagation();
      setHexKeypadState(instance, value);
      if (state.simulation.active) void updateSimulation();
    });
    else key.tabIndex = -1;
    grid.append(key);
  }
  return grid;
}

function addPort(container, port, side) {
  const row = document.createElement('div');
  row.className = `port-row ${side}-port`;
  row.dataset.portName = port.name;
  const label = document.createElement('span');
  label.className = 'port-label';
  label.textContent = `${port.name}${displayRange(port.range)}`;
  const pin = document.createElement('span');
  pin.className = 'fpga-pin';
  pin.dataset.portName = port.name;
  pin.setAttribute('aria-hidden', 'true');
  row.append(...(side === 'input' ? [label, pin] : [pin, label]));
  container.append(row);
}

function selectedVivooType() {
  return VIVOO_BY_ID.get(state.selectedVivooType) || null;
}

function renderVivooLibrary() {
  elements.vivooInputLibrary.replaceChildren();
  elements.vivooOutputLibrary.replaceChildren();
  for (const type of VIVOO_TYPES) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = `vivoo-library-item${state.selectedVivooType === type.id ? ' selected' : ''}`;
    item.setAttribute('aria-pressed', String(state.selectedVivooType === type.id));
    const icon = createVivooVisual(type, { visualState: type.defaultState }, 'vivoo-library-icon');
    const label = document.createElement('span');
    label.className = 'vivoo-library-label';
    label.textContent = type.label;
    item.append(icon, label);
    item.addEventListener('click', () => {
      state.selectedVivooType = type.id;
      renderVivooLibrary();
    });
    (type.category === 'input' ? elements.vivooInputLibrary : elements.vivooOutputLibrary).append(item);
  }
  renderSimulationControls();
}

function constrainPosition(x, y, instanceWidth = VIVOO_INSTANCE_WIDTH, instanceHeight = VIVOO_INSTANCE_HEIGHT) {
  const layerWidth = elements.vivooLayer.clientWidth;
  const layerHeight = elements.vivooLayer.clientHeight;
  return {
    x: Math.max(-instanceWidth + 24, Math.min(layerWidth - 24, x)),
    y: Math.max(-instanceHeight + 24, Math.min(layerHeight - 24, y)),
  };
}

function initialVivooPosition(type) {
  const layerBounds = elements.vivooLayer.getBoundingClientRect();
  const fpgaBounds = elements.fpgaBlock.getBoundingClientRect();
  const slot = state.vivooInstances.filter((instance) => VIVOO_BY_ID.get(instance.typeId).category === type.category).length;
  const instanceWidth = type.id === 'hex-keypad' ? 130 : VIVOO_INSTANCE_WIDTH;
  const x = type.category === 'input' ? 20 : layerBounds.width - instanceWidth - 20;
  const y = fpgaBounds.top - layerBounds.top + 18 + slot * 104;
  return constrainPosition(x, y, instanceWidth, type.id === 'hex-keypad' ? 118 : VIVOO_INSTANCE_HEIGHT);
}

function placeVivooElement(element, instance) {
  element.style.left = `${instance.x}px`;
  element.style.top = `${instance.y}px`;
}

function enableVivooDrag(element, instance) {
  element.addEventListener('pointerdown', (event) => {
    if (event.target.closest('.vivoo-pin, .vivoo-delete, .hex-keypad-key')) return;
    if (event.target.matches('img.vivoo-instance-icon')) return;
    if (state.simulation.active) return;
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const originX = instance.x;
    const originY = instance.y;
    element.setPointerCapture(event.pointerId);
    const move = (moveEvent) => {
      const position = constrainPosition(originX + moveEvent.clientX - startX, originY + moveEvent.clientY - startY, element.offsetWidth, element.offsetHeight);
      instance.x = position.x;
      instance.y = position.y;
      placeVivooElement(element, instance);
    };
    const finish = () => {
      element.removeEventListener('pointermove', move);
      element.removeEventListener('pointerup', finish);
      element.removeEventListener('pointercancel', finish);
    };
    element.addEventListener('pointermove', move);
    element.addEventListener('pointerup', finish, { once: true });
    element.addEventListener('pointercancel', finish, { once: true });
  });
}

function selectVivooInstance(instanceId) {
  state.selectedVivooId = instanceId;
  for (const element of elements.vivooLayer.querySelectorAll('.vivoo-instance')) {
    element.classList.toggle('selected', element.dataset.instanceId === instanceId);
  }
}

function hideUndoToast() {
  if (state.undoToastTimer) window.clearTimeout(state.undoToastTimer);
  state.undoToastTimer = null;
  elements.toast.replaceChildren();
  elements.toast.hidden = true;
}

function showUndoToast(instance) {
  hideUndoToast();
  const message = document.createElement('span');
  message.textContent = `${instance.label} rimosso.`;
  const undo = document.createElement('button');
  undo.type = 'button';
  undo.textContent = 'ANNULLA';
  undo.addEventListener('click', restoreRemovedVivoo);
  elements.toast.append(message, undo);
  elements.toast.hidden = false;
  state.undoToastTimer = window.setTimeout(() => {
    state.lastRemovedVivoo = null;
    hideUndoToast();
  }, 6000);
}

function removeVivooInstance(instance) {
  if (state.simulation.active) return;
  if (instance.pin && !window.confirm(`${instance.label} è connesso a ${instance.pin}. Rimuovere anche la connessione?`)) return;
  const index = state.vivooInstances.findIndex((candidate) => candidate.id === instance.id);
  if (index < 0) return;
  state.lastRemovedVivoo = { instance: { ...instance }, index };
  state.vivooInstances.splice(index, 1);
  if (state.selectedVivooId === instance.id) state.selectedVivooId = null;
  if (state.openPinMenuId === instance.id) state.openPinMenuId = null;
  renderAllVivooInstances();
  log(`${instance.label} rimosso dal disegno${instance.pin ? ` e scollegato da ${instance.pin}` : ''}.`);
  showUndoToast(instance);
}

function restoreRemovedVivoo() {
  if (state.simulation.active || !state.lastRemovedVivoo) return;
  const { instance, index } = state.lastRemovedVivoo;
  if (state.vivooInstances.some((candidate) => candidate.id === instance.id)) return;
  state.vivooInstances.splice(Math.min(index, state.vivooInstances.length), 0, instance);
  state.selectedVivooId = instance.id;
  state.lastRemovedVivoo = null;
  hideUndoToast();
  renderAllVivooInstances();
  log(`${instance.label} ripristinato nel disegno.`);
}

function nextVivooNumber(type) {
  const numbers = state.vivooInstances
    .filter((instance) => instance.typeId === type.id)
    .map((instance) => Number.parseInt(instance.label.slice(type.prefix.length), 10))
    .filter(Number.isInteger);
  return Math.max(0, ...numbers) + 1;
}

function expandablePortBits(port) {
  if (!port.range) return [{ id: port.name, label: port.name }];
  const range = port.range.match(/^\s*(-?\d+)\s+(downto|to)\s+(-?\d+)\s*$/i);
  if (!range) return [];
  const start = Number(range[1]);
  const end = Number(range[3]);
  const step = range[2].toLowerCase() === 'downto' ? -1 : 1;
  const bits = [];
  for (let index = start; step > 0 ? index <= end : index >= end; index += step) {
    bits.push({ id: `${port.name}(${index})`, label: `${port.name}(${index})` });
  }
  return bits;
}

function compatiblePins(instance) {
  const type = VIVOO_BY_ID.get(instance.typeId);
  const direction = type.category === 'input' ? 'in' : 'out';
  if (type.bitWidth === 7) {
    return state.designPorts
      .filter((port) => port.direction === direction && vectorWidth(port) === 7)
      .map((port) => ({ id: port.name, label: `${port.name}${displayRange(port.range)}` }));
  }
  if (type.bitWidth === 4) {
    return state.designPorts
      .filter((port) => port.direction === 'in' && vectorWidth(port) === 4)
      .map((port) => ({ id: port.name, label: `${port.name}${displayRange(port.range)}` }));
  }
  return state.designPorts
    .filter((port) => port.direction === direction)
    .flatMap(expandablePortBits);
}

function isPinTaken(pin, exceptInstanceId) {
  return state.vivooInstances.some((instance) => instance.id !== exceptInstanceId && instance.pin === pin);
}

function setVivooState(instance, nextState) {
  const type = VIVOO_BY_ID.get(instance.typeId);
  if (!type.assets?.[nextState]) return;
  instance.visualState = nextState;
  const element = elements.vivooLayer.querySelector(`[data-instance-id="${instance.id}"]`);
  const icon = element?.querySelector('.vivoo-instance-icon');
  if (icon) icon.src = type.assets[nextState];
  const instanceValue = element?.querySelector('.vivoo-instance-value');
  if (instanceValue) instanceValue.textContent = vivooPinValue(instance);
}

function setSevenSegmentState(instance, pattern) {
  if (instance.typeId !== 'seven-segment' || !/^[01]{7}$/.test(pattern)) return false;
  instance.visualState = pattern;
  const svg = elements.vivooLayer.querySelector(`[data-instance-id="${instance.id}"] .seven-segment-svg`);
  if (svg) {
    for (const [index, name] of SEVEN_SEGMENT_ORDER.entries()) {
      const segment = svg.querySelector(`[data-segment="${name}"]`);
      segment?.classList.toggle('segment-on', pattern[index] === '1');
      segment?.classList.toggle('segment-off', pattern[index] === '0');
    }
  }
  const instanceValue = elements.vivooLayer.querySelector(`[data-instance-id="${instance.id}"] .vivoo-instance-value`);
  if (instanceValue) instanceValue.textContent = vivooPinValue(instance);
  return true;
}

function setHexKeypadState(instance, value) {
  if (instance.typeId !== 'hex-keypad' || !/^[0-9A-F]$/i.test(value)) return false;
  const normalized = value.toUpperCase();
  instance.visualState = Number.parseInt(normalized, 16).toString(2).padStart(4, '0');
  const root = elements.vivooLayer.querySelector(`[data-instance-id="${instance.id}"]`);
  root?.querySelectorAll('.hex-keypad-key').forEach((key) => key.classList.toggle('selected', key.textContent === normalized));
  const instanceValue = root?.querySelector('.vivoo-instance-value');
  if (instanceValue) instanceValue.textContent = instance.visualState;
  return true;
}

function vivooPinValue(instance) {
  return ['seven-segment', 'hex-keypad'].includes(instance.typeId) ? instance.visualState : vivooBitValue(instance);
}

function vivooBitValue(instance) {
  return ['on', 'down'].includes(instance.visualState) ? '1' : '0';
}

function renderAllVivooInstances() {
  elements.vivooLayer.replaceChildren();
  for (const instance of state.vivooInstances) renderVivooInstance(instance);
  renderFpgaPinStates();
}

function renderFpgaPinStates() {
  for (const pin of document.querySelectorAll('.fpga-pin')) {
    const portName = pin.dataset.portName;
    const connected = state.vivooInstances.some((instance) => instance.pin === portName || instance.pin?.startsWith(`${portName}(`));
    pin.classList.toggle('connected', connected);
  }
}

function renderPinPopover(instance) {
  if (state.simulation.active) return;
  if (state.openPinMenuId !== instance.id) return;
  const type = VIVOO_BY_ID.get(instance.typeId);
  const popover = document.createElement('div');
  popover.className = `vivoo-pin-popover vivoo-${type.category}-popover`;
  popover.dataset.instanceId = instance.id;
  popover.style.left = `${instance.x + (type.category === 'input' ? VIVOO_INSTANCE_WIDTH + 34 : -172)}px`;
  popover.style.top = `${instance.y + 4}px`;
  const select = document.createElement('select');
  select.className = 'vivoo-pin-select';
  select.setAttribute('aria-label', `Associa ${instance.label} a un pin della Rete Logica`);
  select.append(new Option('— non connesso —', ''));
  for (const candidate of compatiblePins(instance)) {
    if (!isPinTaken(candidate.id, instance.id) || candidate.id === instance.pin) select.append(new Option(candidate.label, candidate.id));
  }
  select.value = instance.pin || '';
  select.addEventListener('change', () => {
    instance.pin = select.value || null;
    state.openPinMenuId = null;
    renderAllVivooInstances();
  });
  popover.append(select);
  elements.vivooLayer.append(popover);
  select.focus();
}

function renderVivooInstance(instance) {
  const type = VIVOO_BY_ID.get(instance.typeId);
  const element = document.createElement('div');
  element.className = `vivoo-instance vivoo-${type.category} vivoo-${type.id}${state.selectedVivooId === instance.id ? ' selected' : ''}`;
  element.dataset.instanceId = instance.id;
  element.title = `${instance.label} · ${type.label}`;
  element.addEventListener('click', (event) => {
    if (event.target.closest('.vivoo-pin, .vivoo-delete, .hex-keypad-key')) return;
    selectVivooInstance(instance.id);
  });
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'vivoo-delete';
  remove.textContent = '×';
  remove.title = `Rimuovi ${instance.label}`;
  remove.setAttribute('aria-label', `Rimuovi ${instance.label}`);
  remove.disabled = state.simulation.active;
  remove.addEventListener('click', (event) => {
    event.stopPropagation();
    removeVivooInstance(instance);
  });
  const stateControl = document.createElement(type.renderMode === 'keypad' ? 'div' : 'button');
  stateControl.type = 'button';
  stateControl.className = 'vivoo-state-control';
  stateControl.setAttribute('aria-label', `${instance.label}: stato ${instance.visualState}`);
  const icon = createVivooVisual(type, instance, 'vivoo-instance-icon', type.renderMode === 'keypad');
  stateControl.append(icon);
  const label = document.createElement('span');
  label.className = 'vivoo-instance-label';
  label.textContent = instance.label;
  const pin = document.createElement('button');
  pin.type = 'button';
  pin.className = `vivoo-pin${instance.pin ? ' connected' : ''}`;
  pin.setAttribute('aria-label', instance.pin ? `Connesso a ${instance.pin}; apri menu connessione` : 'Non connesso; apri menu connessione');
  pin.addEventListener('click', (event) => {
    event.stopPropagation();
    if (state.simulation.active) return;
    state.openPinMenuId = state.openPinMenuId === instance.id ? null : instance.id;
    renderAllVivooInstances();
  });
  const pinConnection = document.createElement('span');
  pinConnection.className = 'vivoo-pin-connection';
  pinConnection.textContent = instance.pin || '';
  pinConnection.hidden = !instance.pin;
  const instanceValue = document.createElement('span');
  instanceValue.className = 'vivoo-instance-value';
  instanceValue.textContent = vivooPinValue(instance);
  if (type.id === 'switch') {
    stateControl.addEventListener('click', (event) => {
      if (!event.target.matches('img.vivoo-instance-icon')) return;
      setVivooState(instance, instance.visualState === 'off' ? 'on' : 'off');
      if (state.simulation.active) void updateSimulation();
    });
  } else if (type.id === 'push-button') {
    const release = (event) => {
      if (event.pointerId !== undefined && stateControl.hasPointerCapture(event.pointerId)) stateControl.releasePointerCapture(event.pointerId);
      setVivooState(instance, 'up');
    };
    stateControl.addEventListener('pointerdown', (event) => {
      if (!event.target.matches('img.vivoo-instance-icon')) return;
      event.preventDefault();
      stateControl.setPointerCapture(event.pointerId);
      setVivooState(instance, 'down');
      if (state.simulation.active) void updateSimulation();
    });
    stateControl.addEventListener('pointerup', (event) => {
      if (!stateControl.hasPointerCapture(event.pointerId)) return;
      release(event);
      if (state.simulation.active) void updateSimulation();
    });
    stateControl.addEventListener('pointercancel', (event) => {
      if (!stateControl.hasPointerCapture(event.pointerId)) return;
      release(event);
      if (state.simulation.active) void updateSimulation();
    });
  }
  stateControl.append(instanceValue);
  element.append(remove, stateControl, label, pin, pinConnection);
  placeVivooElement(element, instance);
  enableVivooDrag(element, instance);
  elements.vivooLayer.append(element);
  renderPinPopover(instance);
}

function importVivoo() {
  if (state.simulation.active) return;
  const type = selectedVivooType();
  if (!type) return;
  const number = nextVivooNumber(type);
  const instance = {
    id: `${type.id}-${number}`,
    typeId: type.id,
    label: `${type.prefix}${number}`,
    visualState: type.defaultState,
    pin: null,
    ...initialVivooPosition(type),
  };
  state.vivooInstances.push(instance);
  renderVivooInstance(instance);
  log(`${instance.label} inserito nel disegno.`);
}

function runtimeConnections() {
  return state.vivooInstances.filter((instance) => instance.pin).map((instance) => ({ typeId: instance.typeId, label: instance.label, pin: instance.pin }));
}

function runtimeInputValues() {
  return Object.fromEntries(state.vivooInstances
    .filter((instance) => ['switch', 'push-button', 'hex-keypad'].includes(instance.typeId) && instance.pin)
    .map((instance) => [instance.pin, instance.typeId === 'hex-keypad' ? instance.visualState : (['on', 'down'].includes(instance.visualState) ? '1' : '0')]));
}

function outputValueForPin(pin, outputs) {
  if (Object.hasOwn(outputs, pin)) return outputs[pin];
  const bit = /^([A-Za-z][A-Za-z0-9_]*)\((-?\d+)\)$/.exec(pin);
  if (!bit) return undefined;
  const port = state.designPorts.find((candidate) => candidate.name === bit[1] && candidate.range);
  const range = port?.range?.match(/^\s*(-?\d+)\s+(downto|to)\s+(-?\d+)\s*$/i);
  if (!range || !Object.hasOwn(outputs, port.name)) return undefined;
  const index = Math.max(Number(range[1]), Number(range[3])) - Number(bit[2]);
  return outputs[port.name][index];
}

function applyRuntimeOutputs(outputs) {
  for (const instance of state.vivooInstances) {
    if (instance.typeId === 'seven-segment' && instance.pin && Object.hasOwn(outputs, instance.pin)) {
      const pattern = outputs[instance.pin];
      if (!setSevenSegmentState(instance, pattern)) {
        setSevenSegmentState(instance, '0000000');
        log(`${instance.pin}=${pattern}: vettore non ancora rappresentabile dal display.`, 'warning');
      }
    }
    if (instance.typeId === 'led' && instance.pin) {
      const value = outputValueForPin(instance.pin, outputs);
      if (value === undefined) continue;
      if (value === '0' || value === '1') {
        setVivooState(instance, value === '1' ? 'on' : 'off');
      } else {
        setVivooState(instance, 'off');
        log(`${instance.pin}=${value}: valore std_logic non ancora rappresentabile dal LED.`, 'warning');
      }
    }
  }
}

async function updateSimulation() {
  try {
    const result = await api('/api/vivo/update', { method: 'POST', body: { project, values: runtimeInputValues() } });
    if (result.pid !== state.simulation.pid) throw new Error('Il processo GHDL è stato riavviato inaspettatamente.');
    applyRuntimeOutputs(result.outputs);
  } catch (error) {
    log(error.message, 'error');
    state.simulation = { active: false, pid: null };
    renderSimulationControls();
  }
}

async function startSimulation() {
  try {
    const result = await api('/api/vivo/start', { method: 'POST', body: { project, top: selectedTop, connections: runtimeConnections() } });
    state.simulation = { active: true, pid: result.pid };
    state.openPinMenuId = null;
    renderAllVivooInstances();
    renderSimulationControls();
    await updateSimulation();
    if (state.simulation.active) log(`Simulazione ViVo attiva (GHDL PID ${result.pid}).`);
  } catch (error) {
    log(error.message, 'error');
  }
}

async function stopSimulation() {
  try {
    await api('/api/vivo/stop', { method: 'POST', body: { project } });
    log('Simulazione ViVo fermata.');
  } catch (error) {
    log(error.message, 'error');
  } finally {
    state.simulation = { active: false, pid: null };
    renderSimulationControls();
  }
}

function renderDesign(design) {
  elements.caption.textContent = `· ${design.name}`;
  elements.entity.textContent = design.name;
  elements.inputs.replaceChildren();
  elements.outputs.replaceChildren();
  const ports = Array.isArray(design.ports) ? design.ports : [];
  state.designPorts = ports;
  const inputs = ports.filter((port) => port.direction === 'in');
  const outputs = ports.filter((port) => ['out', 'buffer'].includes(port.direction));
  const unsupported = ports.filter((port) => ['inout', 'linkage'].includes(port.direction));
  for (const port of inputs) addPort(elements.inputs, port, 'input');
  for (const port of outputs) addPort(elements.outputs, port, 'output');
  if (!inputs.length) elements.inputs.append(document.createTextNode('—'));
  if (!outputs.length) elements.outputs.append(document.createTextNode('—'));
  elements.status.hidden = true;
  elements.object.hidden = false;
  renderFpgaPinStates();
  renderSimulationControls();
  log(`Design selezionato: ${design.name}`);
  log(`${inputs.length} ingressi, ${outputs.length} uscite visualizzati.`);
  if (unsupported.length) log(`Porte non ancora supportate: ${unsupported.map((port) => port.name).join(', ')}`, 'warning');
  log('Associa i ViVoO ai pin della Rete Logica: le connessioni sono locali e 1:1.', 'status');
}

// API locale per il futuro adattatore: ad esempio window.vivo.setLedState('LED1', 'on').
window.vivo = Object.freeze({
  setLedState(label, nextState) {
    const instance = state.vivooInstances.find((candidate) => candidate.label === label && candidate.typeId === 'led');
    if (instance) setVivooState(instance, nextState);
  },
  setSevenSegmentState(label, pattern) {
    const instance = state.vivooInstances.find((candidate) => candidate.label === label && candidate.typeId === 'seven-segment');
    return instance ? setSevenSegmentState(instance, pattern) : false;
  },
  setHexKeypadState(label, value) {
    const instance = state.vivooInstances.find((candidate) => candidate.label === label && candidate.typeId === 'hex-keypad');
    return instance ? setHexKeypadState(instance, value) : false;
  },
});

elements.consoleResizer.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  elements.consoleResizer.setPointerCapture(event.pointerId);
  const layout = document.querySelector('.vivo-layout');
  const onMove = (moveEvent) => {
    const bounds = layout.getBoundingClientRect();
    const height = Math.max(90, Math.min(360, bounds.bottom - moveEvent.clientY));
    layout.style.setProperty('--vivo-console-height', `${height}px`);
  };
  const onUp = () => {
    elements.consoleResizer.removeEventListener('pointermove', onMove);
    elements.consoleResizer.removeEventListener('pointerup', onUp);
    elements.consoleResizer.removeEventListener('pointercancel', onUp);
    document.body.classList.remove('resizing-vivo-console');
  };
  document.body.classList.add('resizing-vivo-console');
  elements.consoleResizer.addEventListener('pointermove', onMove);
  elements.consoleResizer.addEventListener('pointerup', onUp, { once: true });
  elements.consoleResizer.addEventListener('pointercancel', onUp, { once: true });
});

elements.importVivoo.addEventListener('click', importVivoo);
elements.start.addEventListener('click', () => { void startSimulation(); });
elements.stop.addEventListener('click', () => { void stopSimulation(); });
document.addEventListener('keydown', (event) => {
  if (!['Delete', 'Backspace'].includes(event.key) || state.simulation.active) return;
  if (event.target.closest('input, textarea, select, .vivoo-pin, .vivoo-delete, .hex-keypad-key')) return;
  const instance = state.vivooInstances.find((candidate) => candidate.id === state.selectedVivooId);
  if (!instance) return;
  event.preventDefault();
  removeVivooInstance(instance);
});
renderVivooLibrary();

async function load() {
  try {
    const embedded = JSON.parse(elements.designData.textContent);
    if (embedded.design) return renderDesign(embedded.design);
    if (embedded.error) throw new Error(embedded.error);
  } catch (error) {
    if (error instanceof SyntaxError) log('Dati iniziali ViVo non validi; uso il recupero API.', 'warning');
    else throw error;
  }
  if (!project || !selectedTop) throw new Error('Design ViVo non specificato.');
  const data = await api(`/api/entities?project=${encodeURIComponent(project)}`);
  const design = data.designs.find((unit) => unit.name === selectedTop);
  if (!design) throw new Error(`Il design selezionato non è disponibile: ${selectedTop}`);
  renderDesign(design);
}

load().catch((error) => {
  elements.status.textContent = error.message;
  elements.status.classList.add('error');
  log(error.message, 'error');
});
