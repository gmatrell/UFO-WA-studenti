'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const SKIP_DIRECTORIES = new Set(['.ufo', 'results', 'node_modules', '.git']);

async function sourceDirectory(projectDirectory) {
  const structured = path.join(projectDirectory, 'src');
  const stat = await fs.stat(structured).catch(() => null);
  if (!stat?.isDirectory()) return projectDirectory;
  async function containsVhdl(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isFile() && /\.vhdl?$/i.test(entry.name)) return true;
      if (entry.isDirectory() && await containsVhdl(absolute)) return true;
    }
    return false;
  }
  if (await containsVhdl(structured)) return structured;
  if (await containsVhdl(projectDirectory)) return projectDirectory;
  return structured;
}

async function listVhdlFiles(projectDirectory) {
  const base = await sourceDirectory(projectDirectory);
  const output = [];

  async function walk(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory() && !SKIP_DIRECTORIES.has(entry.name)) {
        await walk(absolute);
      } else if (entry.isFile() && /\.vhdl?$/i.test(entry.name)) {
        output.push(absolute);
      }
    }
  }

  await walk(base);
  return output;
}

function stripComments(source) {
  return source.replace(/--.*$/gm, ' ');
}

function matchingParenthesis(source, openingIndex) {
  let depth = 0;
  for (let index = openingIndex; index < source.length; index += 1) {
    if (source[index] === '(') depth += 1;
    if (source[index] === ')') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function splitTopLevel(source, separator) {
  const parts = [];
  let start = 0;
  let depth = 0;
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === '(') depth += 1;
    if (source[index] === ')') depth = Math.max(0, depth - 1);
    if (source[index] === separator && depth === 0) {
      parts.push(source.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(source.slice(start));
  return parts;
}

function parsePorts(declaration) {
  const portMatch = /\bport\s*\(/i.exec(declaration);
  if (!portMatch) return [];
  const openingIndex = declaration.indexOf('(', portMatch.index);
  const closingIndex = matchingParenthesis(declaration, openingIndex);
  if (closingIndex < 0) return [];

  const body = declaration.slice(openingIndex + 1, closingIndex);
  const ports = [];
  for (const item of splitTopLevel(body, ';')) {
    const colonIndex = item.indexOf(':');
    if (colonIndex < 0) continue;
    const names = splitTopLevel(item.slice(0, colonIndex), ',')
      .map((name) => name.trim())
      .filter((name) => /^[A-Za-z][A-Za-z0-9_]*$/.test(name));
    const modeAndType = item.slice(colonIndex + 1).trim();
    const modeMatch = /^(inout|buffer|in|out|linkage)\b\s*(.*)$/is.exec(modeAndType);
    if (!modeMatch) continue;
    const direction = modeMatch[1].toLowerCase();
    const type = modeMatch[2].replace(/:=.*$/s, '').trim();
    const rangeMatch = /\(\s*([^()]*)\s*\)/.exec(type);
    const range = rangeMatch ? rangeMatch[1].trim() : null;
    for (const name of names) ports.push({ name, direction, range });
  }
  return ports;
}

function declarations(source, file) {
  const clean = stripComments(source);
  const entities = [];
  const entityPattern = /\bentity\s+([A-Za-z][A-Za-z0-9_]*)\s+is\b/gi;
  let match;
  while ((match = entityPattern.exec(clean)) !== null) {
    const end = clean.slice(match.index).search(/\bend\b/i);
    const declaration = end >= 0 ? clean.slice(match.index, match.index + end) : '';
    entities.push({
      name: match[1],
      file,
      hasPorts: /\bport\s*\(/i.test(declaration),
      ports: parsePorts(declaration),
    });
  }

  const instantiated = [];
  const directPattern = /:\s*entity\s+[A-Za-z][A-Za-z0-9_]*\.([A-Za-z][A-Za-z0-9_]*)/gi;
  while ((match = directPattern.exec(clean)) !== null) instantiated.push(match[1]);

  return { entities, instantiated: [...new Set(instantiated)] };
}

async function inspectProject(projectDirectory) {
  const files = await listVhdlFiles(projectDirectory);
  const units = [];
  const fileData = [];
  for (const absolute of files) {
    const source = await fs.readFile(absolute, 'utf8');
    const relative = path.relative(projectDirectory, absolute).split(path.sep).join('/');
    const parsed = declarations(source, relative);
    fileData.push({ file: relative, instantiates: parsed.instantiated });
    for (const entity of parsed.entities) {
      units.push({
        ...entity,
        instantiates: parsed.instantiated,
        instantiatedBy: [],
        isTestbench: /(?:^|_)tb$/i.test(entity.name) || !entity.hasPorts,
      });
    }
  }

  const byName = new Map(units.map((unit) => [unit.name.toLowerCase(), unit]));
  for (const unit of units) {
    for (const child of unit.instantiates) {
      const target = byName.get(child.toLowerCase());
      if (target && !target.instantiatedBy.includes(unit.name)) target.instantiatedBy.push(unit.name);
    }
  }

  const designs = units.filter((unit) => !unit.isTestbench);
  const testbenches = units.filter((unit) => unit.isTestbench);
  const roots = designs.filter((unit) => !unit.instantiatedBy.some((parent) => {
    const parentUnit = byName.get(parent.toLowerCase());
    return parentUnit && !parentUnit.isTestbench;
  }));
  const recommendedTop = roots.length === 1 ? roots[0].name : null;
  let recommendedTestbench = null;
  if (recommendedTop) {
    const matching = testbenches.find((unit) => unit.name.toLowerCase() === `${recommendedTop.toLowerCase()}_tb`);
    if (matching) recommendedTestbench = matching.name;
  }
  if (!recommendedTestbench && testbenches.length === 1) recommendedTestbench = testbenches[0].name;

  return {
    units,
    designs,
    testbenches,
    roots: roots.map((unit) => unit.name),
    recommendedTop,
    recommendedTestbench,
    files: fileData,
  };
}

module.exports = { declarations, inspectProject, listVhdlFiles, sourceDirectory, stripComments };
