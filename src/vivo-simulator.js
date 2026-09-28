'use strict';

const { spawn } = require('node:child_process');

class SimulatorError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'SimulatorError';
    Object.assign(this, details);
  }
}

/**
 * Piccolo adapter per una singola simulazione GHDL persistente.
 * Il protocollo è volutamente una riga di richiesta -> una riga di risposta.
 */
class GhdlPersistentSimulator {
  constructor({ ghdl = 'ghdl', workdir, entity, responseTimeout = 1_000, spawnImpl = spawn } = {}) {
    if (!entity) throw new TypeError('entity è obbligatoria.');
    this.ghdl = ghdl;
    this.workdir = workdir;
    this.entity = entity;
    this.responseTimeout = responseTimeout;
    this.spawnImpl = spawnImpl;
    this.child = null;
    this.pending = [];
    this.stdoutBuffer = '';
    this.stderr = '';
    this.closed = false;
    this.startPromise = null;
  }

  get pid() {
    return this.child?.pid ?? null;
  }

  get command() {
    return [this.ghdl, '-r', '--std=08', ...(this.workdir ? [`--workdir=${this.workdir}`] : []), this.entity, '--unbuffered'];
  }

  async start() {
    if (this.child && !this.closed) return this;
    if (this.startPromise) return this.startPromise;
    this.closed = false;
    this.stderr = '';
    const [command, ...args] = this.command;
    const child = this.spawnImpl(command, args, {
      cwd: this.workdir,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child = child;
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => this.#receiveStdout(chunk));
    child.stderr.on('data', (chunk) => { this.stderr += chunk; });
    child.once('close', (code, signal) => this.#handleClose(code, signal));
    this.startPromise = new Promise((resolve, reject) => {
      const onSpawn = () => {
        cleanup();
        resolve(this);
      };
      const onError = (error) => {
        cleanup();
        reject(new SimulatorError(`Impossibile avviare GHDL: ${error.message}`, { cause: error }));
      };
      const cleanup = () => {
        child.removeListener('spawn', onSpawn);
        child.removeListener('error', onError);
      };
      child.once('spawn', onSpawn);
      child.once('error', onError);
    }).finally(() => { this.startPromise = null; });
    return this.startPromise;
  }

  async send(command) {
    if (!this.child || this.closed || !this.child.stdin.writable) {
      throw new SimulatorError('GHDL non è in esecuzione.');
    }
    const line = String(command).replace(/[\r\n]/g, '');
    if (!line) throw new TypeError('Il comando non può essere vuoto.');
    return new Promise((resolve, reject) => {
      const request = { resolve, reject, timer: null };
      request.timer = setTimeout(() => {
        this.#removePending(request);
        reject(new SimulatorError(`Timeout in attesa della risposta GHDL a "${line}".`, { stderr: this.stderr }));
      }, this.responseTimeout);
      this.pending.push(request);
      this.child.stdin.write(`${line}\n`, (error) => {
        if (!error) return;
        this.#removePending(request);
        reject(new SimulatorError(`Errore nell'invio a GHDL: ${error.message}`, { cause: error, stderr: this.stderr }));
      });
    });
  }

  async stop() {
    const child = this.child;
    if (!child || this.closed) return;
    const done = new Promise((resolve) => child.once('close', resolve));
    child.stdin.end();
    child.kill('SIGTERM');
    const forcedStop = setTimeout(() => child.kill('SIGKILL'), 1_000);
    forcedStop.unref();
    await done;
    clearTimeout(forcedStop);
  }

  #receiveStdout(chunk) {
    this.stdoutBuffer += chunk;
    let newline = this.stdoutBuffer.indexOf('\n');
    while (newline >= 0) {
      const line = this.stdoutBuffer.slice(0, newline).replace(/\r$/, '');
      this.stdoutBuffer = this.stdoutBuffer.slice(newline + 1);
      const request = this.pending.shift();
      if (request) {
        clearTimeout(request.timer);
        request.resolve(line);
      }
      newline = this.stdoutBuffer.indexOf('\n');
    }
  }

  #removePending(request) {
    const index = this.pending.indexOf(request);
    if (index >= 0) this.pending.splice(index, 1);
    clearTimeout(request.timer);
  }

  #handleClose(code, signal) {
    if (this.closed) return;
    this.closed = true;
    const reason = new SimulatorError('GHDL si è chiuso inaspettatamente.', { code, signal, stderr: this.stderr });
    for (const request of this.pending.splice(0)) {
      clearTimeout(request.timer);
      request.reject(reason);
    }
  }
}

module.exports = { GhdlPersistentSimulator, SimulatorError };
