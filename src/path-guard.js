'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function cleanRelative(input) {
  if (typeof input !== 'string' || input.length === 0 || input.length > 512) {
    throw new AppError(400, 'INVALID_PATH', 'Percorso mancante o troppo lungo.');
  }
  if (input.includes('\0') || input.includes('\\') || path.isAbsolute(input)) {
    throw new AppError(400, 'INVALID_PATH', 'Sono ammessi soltanto percorsi relativi Unix.');
  }
  const parts = input.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) {
    throw new AppError(400, 'INVALID_PATH', 'Il percorso contiene segmenti non ammessi.');
  }
  return parts.join('/');
}

function validName(name, kind = 'elemento') {
  if (typeof name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(name)) {
    throw new AppError(400, 'INVALID_NAME', `Nome ${kind} non valido.`);
  }
  if (name.startsWith('.')) {
    throw new AppError(400, 'INVALID_NAME', `Il nome ${kind} non può essere nascosto.`);
  }
  return name;
}

function validProjectName(name) {
  validName(name, 'progetto');
  if (name === 'results' || name === 'node_modules') {
    throw new AppError(400, 'RESERVED_NAME', 'Nome progetto riservato.');
  }
  return name;
}

function validVhdlName(name) {
  validName(name, 'file');
  if (!/\.vhdl?$/i.test(name)) {
    throw new AppError(400, 'INVALID_EXTENSION', 'Sono ammessi soltanto file .vhd o .vhdl.');
  }
  return name;
}

class PathGuard {
  static async create(root) {
    const stat = await fs.stat(root).catch(() => null);
    if (!stat || !stat.isDirectory()) {
      throw new AppError(500, 'ROOT_UNAVAILABLE', `La radice progetti non esiste o non è una directory: ${root}`);
    }
    const realRoot = await fs.realpath(root);
    return new PathGuard(realRoot);
  }

  constructor(root) {
    this.root = root;
    this.prefix = `${root}${path.sep}`;
  }

  lexical(relative) {
    const clean = cleanRelative(relative);
    const absolute = path.resolve(this.root, clean);
    if (absolute !== this.root && !absolute.startsWith(this.prefix)) {
      throw new AppError(403, 'PATH_ESCAPE', 'Accesso esterno alla radice progetti negato.');
    }
    return { clean, absolute };
  }

  assertInside(absolute) {
    if (absolute !== this.root && !absolute.startsWith(this.prefix)) {
      throw new AppError(403, 'PATH_ESCAPE', 'Accesso esterno alla radice progetti negato.');
    }
    return absolute;
  }

  async existing(relative, expected) {
    const target = this.lexical(relative);
    const real = await fs.realpath(target.absolute).catch(() => {
      throw new AppError(404, 'NOT_FOUND', `Elemento non trovato: ${target.clean}`);
    });
    this.assertInside(real);
    const stat = await fs.lstat(target.absolute);
    if (stat.isSymbolicLink()) {
      throw new AppError(403, 'SYMLINK_DENIED', 'I link simbolici non sono ammessi.');
    }
    if (expected === 'file' && !stat.isFile()) {
      throw new AppError(400, 'NOT_A_FILE', 'Il percorso non identifica un file.');
    }
    if (expected === 'directory' && !stat.isDirectory()) {
      throw new AppError(400, 'NOT_A_DIRECTORY', 'Il percorso non identifica una directory.');
    }
    return { relative: target.clean, absolute: real, stat };
  }

  async newTarget(relative) {
    const target = this.lexical(relative);
    const parent = path.dirname(target.clean);
    const parentTarget = parent === '.'
      ? { absolute: this.root }
      : await this.existing(parent, 'directory');
    const parentReal = await fs.realpath(parentTarget.absolute);
    this.assertInside(parentReal);
    const destination = path.join(parentReal, path.basename(target.clean));
    this.assertInside(destination);
    const exists = await fs.lstat(destination).then(() => true, () => false);
    if (exists) {
      throw new AppError(409, 'ALREADY_EXISTS', `Esiste già: ${target.clean}`);
    }
    return { relative: target.clean, absolute: destination };
  }

  async project(name) {
    validProjectName(name);
    return this.existing(name, 'directory');
  }
}

module.exports = {
  AppError,
  PathGuard,
  cleanRelative,
  validName,
  validProjectName,
  validVhdlName,
};
