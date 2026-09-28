'use strict';

const os = require('node:os');
const path = require('node:path');

class ConfigError extends Error {}

function valueAfter(argv, index, name) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new ConfigError(`Manca il valore per ${name}`);
  }
  return value;
}

function parseArgs(argv = process.argv.slice(2), env = process.env) {
  let cliRoot;
  let cliPort;

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === '--projects-root') {
      cliRoot = valueAfter(argv, index, item);
      index += 1;
    } else if (item.startsWith('--projects-root=')) {
      cliRoot = item.slice('--projects-root='.length);
    } else if (item === '--port') {
      cliPort = valueAfter(argv, index, item);
      index += 1;
    } else if (item.startsWith('--port=')) {
      cliPort = item.slice('--port='.length);
    } else if (item === '--help' || item === '-h') {
      return { help: true };
    } else {
      throw new ConfigError(`Opzione sconosciuta: ${item}`);
    }
  }

  const requestedRoot = cliRoot || env.UFO_PROJECTS_ROOT || path.join(os.homedir(), 'Workspace');
  const rawPort = cliPort || env.UFO_PORT || '8080';
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new ConfigError(`Porta non valida: ${rawPort}`);
  }

  return {
    help: false,
    host: '127.0.0.1',
    port,
    projectsRoot: path.resolve(requestedRoot),
  };
}

function helpText() {
  return [
    'UFO — applicazione didattica locale per VHDL',
    '',
    'Uso: npm start -- [--projects-root PERCORSO] [--port NUMERO]',
    '',
    'Precedenza radice progetti:',
    '  1. --projects-root',
    '  2. UFO_PROJECTS_ROOT',
    '  3. ~/Workspace',
  ].join('\n');
}

module.exports = { ConfigError, helpText, parseArgs };
