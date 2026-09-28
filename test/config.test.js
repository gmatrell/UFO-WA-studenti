'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { ConfigError, parseArgs } = require('../src/config');

test('la radice segue la precedenza CLI, ambiente, default', () => {
  assert.equal(parseArgs(['--projects-root', '/tmp/cli'], { UFO_PROJECTS_ROOT: '/tmp/env' }).projectsRoot, '/tmp/cli');
  assert.equal(parseArgs([], { UFO_PROJECTS_ROOT: '/tmp/env' }).projectsRoot, '/tmp/env');
  assert.ok(path.isAbsolute(parseArgs([], {}).projectsRoot));
});

test('host e porta sono validati e l’ascolto resta locale', () => {
  const config = parseArgs(['--port=9090'], {});
  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.port, 9090);
  assert.throws(() => parseArgs(['--port', '70000'], {}), ConfigError);
  assert.throws(() => parseArgs(['--unknown'], {}), ConfigError);
});
