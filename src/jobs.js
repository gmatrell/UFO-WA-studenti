'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');
const { AppError, validProjectName } = require('./path-guard');
const { listVhdlFiles } = require('./vhdl');

const execFileAsync = promisify(execFile);
const MAX_LOG_CHARACTERS = 512 * 1024;
const MAX_CAPTURE_BYTES = 16 * 1024 * 1024;
const ENTITY_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;
const STOP_TIME_PATTERN = /^(\d+)(fs|ps|ns|us|ms|sec)$/;
const EXT_WSL_DISTRO = 'WSL-FeLED';
const SYNTHESIS_MODES = new Set(['rtl', 'gate']);

function wslOutputLines(output) {
  return String(output)
    .replaceAll('\0', '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^\*\s*/, '').replace(/\s+\(Default\)$/i, ''))
    .filter(Boolean);
}

async function detectWslDistribution(wsl, configuredDistro, exec = execFileAsync) {
  if (configuredDistro === EXT_WSL_DISTRO) return configuredDistro;
  try {
    const { stdout } = await exec(wsl, ['--list', '--quiet'], { timeout: 4_000, maxBuffer: 64 * 1024 });
    return wslOutputLines(stdout).find((name) => name === EXT_WSL_DISTRO) || null;
  } catch {
    return null;
  }
}

async function detectWslUser(wsl, distro, configuredUser, exec = execFileAsync) {
  if (configuredUser) return configuredUser;
  try {
    const { stdout } = await exec(
      wsl,
      ['--distribution', distro, '--exec', 'whoami'],
      { timeout: 4_000, maxBuffer: 64 * 1024 },
    );
    return wslOutputLines(stdout)[0] || null;
  } catch {
    return null;
  }
}

function jobId(kind) {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  return `${kind}-${timestamp}-${crypto.randomBytes(4).toString('hex')}`;
}

function quoteArgument(argument) {
  const value = String(argument);
  return /^[A-Za-z0-9_./:=+-]+$/.test(value) ? value : `'${value.replaceAll("'", "'\\''")}'`;
}

function displayCommand(command, args) {
  return [command, ...args].map(quoteArgument).join(' ');
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\"'\"'")}'`;
}

const INTERACTIVE_OUTPUT_FILTER = [
  'import os, re, sys',
  'separator = b"\\r\\n\\r\\n----------------------------------------\\r\\nUFO-WA EXT_SIM - INIZIO OUTPUT TESTBENCH\\r\\n----------------------------------------\\r\\n"',
  'tree_line = re.compile(rb"^.*\\[(?:entity|arch|instance|package)\\]\\r?\\n$")',
  'buffer = bytearray()',
  'tree_seen = False',
  'inserted = False',
  'while True:',
  '    chunk = os.read(sys.stdin.fileno(), 4096)',
  '    if not chunk:',
  '        break',
  '    if inserted:',
  '        sys.stdout.buffer.write(chunk)',
  '        sys.stdout.buffer.flush()',
  '        continue',
  '    buffer.extend(chunk)',
  '    while True:',
  '        end = buffer.find(b"\\n")',
  '        if end < 0:',
  '            break',
  '        line = bytes(buffer[:end + 1])',
  '        del buffer[:end + 1]',
  '        if not inserted and tree_line.match(line):',
  '            tree_seen = True',
  '            sys.stdout.buffer.write(line)',
  '            sys.stdout.buffer.flush()',
  '            continue',
  '        if not inserted and tree_seen:',
  '            sys.stdout.buffer.write(separator)',
  '            inserted = True',
  '        sys.stdout.buffer.write(line)',
  '        sys.stdout.buffer.flush()',
  '    if not inserted and tree_seen and len(buffer) >= 4 and re.search(rb"(?:>|:)\\s*$", bytes(buffer)):',
  '        sys.stdout.buffer.write(separator)',
  '        sys.stdout.buffer.write(buffer)',
  '        sys.stdout.buffer.flush()',
  '        buffer.clear()',
  '        inserted = True',
  'if buffer:',
  '    if not inserted and tree_seen:',
  '        sys.stdout.buffer.write(separator)',
  '    sys.stdout.buffer.write(buffer)',
  '    sys.stdout.buffer.flush()',
].join('\n');

function sourceAnalysisStep({ ghdl, buildDirectory, sourceCopies }) {
  return {
    phase: 'Analisi dei sorgenti',
    command: ghdl,
    args: ['-i', '--std=08', `--workdir=${buildDirectory}`, ...sourceCopies],
  };
}

function simulationPlan({ ghdl, buildDirectory, sourceCopies, testbench, vcd, stopTime }) {
  return [
    sourceAnalysisStep({ ghdl, buildDirectory, sourceCopies }),
    {
      phase: 'Ordine di elaborazione',
      command: ghdl,
      args: ['elab-order', '--std=08', `--workdir=${buildDirectory}`, testbench],
    },
    {
      phase: 'Elaborazione del testbench',
      command: ghdl,
      args: ['-m', '--std=08', `--workdir=${buildDirectory}`, testbench],
    },
    {
      phase: 'Simulazione funzionale',
      command: ghdl,
      args: [
        '-r', '--std=08', `--workdir=${buildDirectory}`, testbench,
        `--vcd=${vcd}`, `--stop-time=${stopTime}`, '--disp-tree=inst',
      ],
    },
  ];
}

function buildInteractiveScript({ plan, buildDirectory, vcd, gtkwave, python = '/usr/bin/python3', script = 'script' }) {
  const lines = [
    '#!/usr/bin/env bash',
    'set -u',
    '',
    'pause_on_error() {',
    '  local status="$1"',
    '  local message="$2"',
    '  printf "\\n%s\\n" "$message"',
    '  read -r -p "Premi INVIO per chiudere il terminale..." _ || true',
    '  exit "$status"',
    '}',
    '',
    `if ! cd -- ${shellQuote(buildDirectory)}; then`,
    '  pause_on_error 1 "Impossibile raggiungere la directory di build."',
    'fi',
    '',
    'printf "\\n"',
    'printf "%s\\n" "----------------------------------------"',
    'printf "%s\\n" "UFO-WA EXT_SIM - SIMULAZIONE ESTERNA"',
    'printf "%s\\n\\n" "----------------------------------------"',
    'run_phase() {',
    '  local phase="$1"',
    '  shift',
    '  printf "\\n[%s]\\n$" "$phase"',
    '  printf " %q" "$@"',
    '  printf "\\n"',
    '  "$@"',
    '  local status=$?',
    '  if [ "$status" -ne 0 ]; then',
    '    pause_on_error "$status" "La fase \\"$phase\\" è fallita con codice $status."',
    '  fi',
    '}',
    '',
  'run_interactive_phase() {',
  '  local phase="$1"',
  '  shift',
  '  local display_command="$1"',
  '  shift',
  '  local command_line="$1"',
  '  printf "\\n[%s]\\n$ %s\\n" "$phase" "$display_command"',
  `  ${shellQuote(script)} -qefc "$command_line" /dev/null 2>&1 | ${shellQuote(python)} -u -c ${shellQuote(INTERACTIVE_OUTPUT_FILTER)}`,
    '  local status="${PIPESTATUS[0]}"',
    '  if [ "$status" -ne 0 ]; then',
    '    pause_on_error "$status" "La fase \\"$phase\\" è fallita con codice $status."',
    '  fi',
    '}',
    '',
  ];

  for (const [index, item] of plan.entries()) {
    if (index === plan.length - 1) {
      const commandLine = [item.command, ...item.args].map(shellQuote).join(' ');
      lines.push(`run_interactive_phase ${shellQuote(item.phase)} ${shellQuote(displayCommand(item.command, item.args))} ${shellQuote(commandLine)}`);
    } else {
      lines.push(`run_phase ${shellQuote(item.phase)} ${shellQuote(item.command)} ${item.args.map(shellQuote).join(' ')}`);
    }
  }

  lines.push(
    `if [ ! -s ${shellQuote(vcd)} ]; then`,
    '  pause_on_error 1 "GHDL è terminato senza produrre un VCD valido."',
    'fi',
    '',
    `run_phase ${shellQuote('Avvio GTKWave')} ${shellQuote(gtkwave)} ${shellQuote(vcd)}`,
    '',
  );
  return `${lines.join('\n')}\n`;
}

function validateEntity(value, label) {
  if (typeof value !== 'string' || !ENTITY_PATTERN.test(value)) {
    throw new AppError(400, 'INVALID_ENTITY', `${label} non valido.`);
  }
  return value;
}

function validateStopTime(value) {
  const candidate = value || '1us';
  const match = STOP_TIME_PATTERN.exec(candidate);
  if (!match || Number(match[1]) > 1_000_000_000) {
    throw new AppError(400, 'INVALID_STOP_TIME', 'Tempo di arresto non valido. Esempio: 100ns, 1us, 10ms.');
  }
  const scale = { fs: 1e-15, ps: 1e-12, ns: 1e-9, us: 1e-6, ms: 1e-3, sec: 1 }[match[2]];
  if (Number(match[1]) * scale > 1) {
    throw new AppError(400, 'STOP_TIME_TOO_LARGE', 'Il tempo simulato massimo per questa versione è 1 secondo.');
  }
  return candidate;
}

function validateSynthesisMode(value) {
  const candidate = value || 'gate';
  if (!SYNTHESIS_MODES.has(candidate)) {
    throw new AppError(400, 'INVALID_SYNTHESIS_MODE', 'Modalità di sintesi non valida. Usare rtl o gate.');
  }
  return candidate;
}

function buildYosysSynthesisScript(top, mode = 'gate') {
  const synthesisMode = validateSynthesisMode(mode);
  const lines = [
    'read_verilog design.v',
    `hierarchy -check -top ${top}`,
    `prep -top ${top}`,
  ];
  if (synthesisMode === 'gate') lines.push('pmuxtree', 'simplemap', 'abc');
  lines.push('write_json netlist.json', '');
  return lines.join('\n');
}

function killProcessGroup(child, signal) {
  if (!child?.pid) return;
  try {
    process.kill(-child.pid, signal);
  } catch {
    try { child.kill(signal); } catch { /* processo già terminato */ }
  }
}

async function hashFile(filename) {
  const data = await fs.readFile(filename);
  return crypto.createHash('sha256').update(data).digest('hex');
}

class JobManager {
  constructor({ guard, tools, versions = {}, timeouts = {} }) {
    this.guard = guard;
    this.tools = tools;
    this.versions = versions;
    this.timeouts = {
      command: timeouts.command || 30_000,
      simulation: timeouts.simulation || 45_000,
      synthesis: timeouts.synthesis || 45_000,
    };
    this.jobs = new Map();
    this.activeProjects = new Map();
  }

  hasActiveProject(project) {
    return this.activeProjects.has(project);
  }

  get(id) {
    const job = this.jobs.get(id);
    if (!job) throw new AppError(404, 'JOB_NOT_FOUND', 'Operazione non trovata.');
    return job;
  }

  public(id) {
    const job = this.get(id);
    return {
      id: job.id,
      kind: job.kind,
      synthesisMode: job.synthesisMode,
      project: job.project,
      interactive: job.interactive,
      state: job.state,
      phase: job.phase,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      logs: job.logs,
      diagnostics: job.diagnostics,
      artifacts: Object.keys(job.artifacts),
      error: job.error,
    };
  }

  async wait(id) {
    const job = this.get(id);
    await job.done;
    return this.public(id);
  }

  startSimulation(input) {
    const project = validProjectName(input.project);
    const testbench = validateEntity(input.testbench, 'Testbench');
    const stopTime = validateStopTime(input.stopTime);
    const interactive = input.interactive === true;
    return this.start(
      'simulation',
      project,
      (job) => this.runSimulation(job, { testbench, stopTime, interactive }),
      { interactive },
    );
  }

  startSynthesis(input) {
    const project = validProjectName(input.project);
    const top = validateEntity(input.top, 'Top-level');
    const mode = validateSynthesisMode(input.mode);
    return this.start('synthesis', project, (job) => this.runSynthesis(job, { top, mode }), { synthesisMode: mode });
  }

  start(kind, project, runner, metadata = {}) {
    if (this.activeProjects.has(project)) {
      throw new AppError(409, 'PROJECT_BUSY', 'Il progetto ha già un’operazione in corso.');
    }
    const id = jobId(kind === 'simulation' ? 'sim' : 'rtl');
    let resolveDone;
    const job = {
      id,
      kind,
      project,
      interactive: metadata.interactive === true,
      synthesisMode: metadata.synthesisMode || null,
      state: 'queued',
      phase: 'Preparazione',
      createdAt: new Date().toISOString(),
      startedAt: null,
      finishedAt: null,
      logs: [],
      logCharacters: 0,
      diagnostics: [],
      artifacts: {},
      currentProcess: null,
      cancelled: false,
      commands: [],
      done: new Promise((resolve) => { resolveDone = resolve; }),
    };
    job.resolveDone = resolveDone;
    this.jobs.set(id, job);
    this.activeProjects.set(project, id);
    queueMicrotask(async () => {
      if (job.cancelled) {
        job.state = 'cancelled';
        job.error = 'Operazione interrotta dall’utente.';
        job.finishedAt = new Date().toISOString();
        this.activeProjects.delete(project);
        await this.finalize(job).catch((error) => this.log(job, 'error', `Impossibile scrivere il manifesto: ${error.message}`));
        job.resolveDone();
        return;
      }
      job.state = 'running';
      job.startedAt = new Date().toISOString();
      try {
        await runner(job);
        if (!job.cancelled) {
          job.state = 'completed';
          this.log(job, 'status', 'Operazione completata con successo.');
        }
      } catch (error) {
        if (job.cancelled) {
          job.state = 'cancelled';
          job.error = 'Operazione interrotta dall’utente.';
        } else {
          job.state = 'failed';
          job.error = error.message || String(error);
          this.log(job, 'error', job.error);
        }
      } finally {
        job.finishedAt = new Date().toISOString();
        job.currentProcess = null;
        this.activeProjects.delete(project);
        await this.finalize(job).catch((error) => this.log(job, 'error', `Impossibile scrivere il manifesto: ${error.message}`));
        job.resolveDone();
      }
    });
    return this.public(id);
  }

  cancel(id) {
    const job = this.get(id);
    if (job.state !== 'running' && job.state !== 'queued') {
      throw new AppError(409, 'JOB_NOT_RUNNING', 'L’operazione non è in esecuzione.');
    }
    job.cancelled = true;
    this.log(job, 'status', 'Interruzione richiesta…');
    killProcessGroup(job.currentProcess, 'SIGTERM');
    const processToKill = job.currentProcess;
    setTimeout(() => killProcessGroup(processToKill, 'SIGKILL'), 1_000).unref();
    return this.public(id);
  }

  async stopAll() {
    const active = [...this.jobs.values()].filter((job) => job.state === 'running' || job.state === 'queued');
    for (const job of active) this.cancel(job.id);
    await Promise.all(active.map((job) => job.done));
  }

  log(job, stream, text) {
    if (!text) return;
    const available = MAX_LOG_CHARACTERS - job.logCharacters;
    if (available <= 0) return;
    const safeText = String(text).slice(0, available);
    job.logCharacters += safeText.length;
    job.logs.push({ at: new Date().toISOString(), phase: job.phase, stream, text: safeText });
    this.extractDiagnostics(job, safeText);
  }

  extractDiagnostics(job, text) {
    const pattern = /([^\s:]+\.vhdl?):(\d+):(?:(\d+):)?([^\n]*)/gi;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const absoluteOrRelative = match[1];
      const file = job.projectDirectory
        ? path.relative(job.projectDirectory, path.resolve(job.buildDirectory || job.projectDirectory, absoluteOrRelative)).split(path.sep).join('/')
        : absoluteOrRelative;
      job.diagnostics.push({
        file: file.startsWith('..') ? path.basename(absoluteOrRelative) : file,
        line: Number(match[2]),
        column: Number(match[3] || 1),
        message: match[4].trim() || 'Errore GHDL',
      });
    }
  }

  async runCommand(job, phase, command, args, options = {}) {
    if (job.cancelled) throw new Error('Operazione interrotta.');
    job.phase = phase;
    const shown = displayCommand(command, args);
    job.commands.push(shown);
    this.log(job, 'command', `$ ${shown}`);
    const timeoutMs = options.timeout || this.timeouts.command;

    await new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: options.cwd,
        detached: true,
        env: { ...process.env, LC_ALL: 'C.UTF-8' },
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      job.currentProcess = child;
      const captured = [];
      let capturedBytes = 0;
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        this.log(job, 'error', `Timeout dopo ${timeoutMs} ms.`);
        killProcessGroup(child, 'SIGTERM');
        setTimeout(() => killProcessGroup(child, 'SIGKILL'), 1_000).unref();
      }, timeoutMs);

      child.stdout.on('data', (chunk) => {
        if (options.captureStdout) {
          capturedBytes += chunk.length;
          if (capturedBytes <= MAX_CAPTURE_BYTES) captured.push(chunk);
          else killProcessGroup(child, 'SIGTERM');
        } else {
          this.log(job, 'stdout', chunk.toString('utf8'));
        }
      });
      child.stderr.on('data', (chunk) => this.log(job, 'stderr', chunk.toString('utf8')));
      child.on('error', (error) => {
        clearTimeout(timer);
        reject(new Error(`Impossibile avviare ${command}: ${error.message}`));
      });
      child.on('close', async (code, signal) => {
        clearTimeout(timer);
        job.currentProcess = null;
        if (job.cancelled) return reject(new Error('Operazione interrotta.'));
        if (timedOut) return reject(new Error(`La fase “${phase}” ha superato il timeout.`));
        if (capturedBytes > MAX_CAPTURE_BYTES) return reject(new Error('L’output del processo supera il limite consentito.'));
        if (code !== 0) return reject(new Error(`${phase}: processo terminato con codice ${code}${signal ? ` (${signal})` : ''}.`));
        if (options.captureStdout) await fs.writeFile(options.captureStdout, Buffer.concat(captured));
        this.log(job, 'status', `${phase}: completata.`);
        resolve();
      });
    });
  }

  async prepare(job, resultKind) {
    const project = await this.guard.project(job.project);
    job.projectDirectory = project.absolute;
    job.buildDirectory = path.join(project.absolute, '.ufo', 'build', job.id);
    job.resultDirectory = path.join(project.absolute, 'results', resultKind, job.id);
    await fs.mkdir(job.buildDirectory, { recursive: true });
    await fs.mkdir(job.resultDirectory, { recursive: true });
    job.sources = await listVhdlFiles(project.absolute);
    if (job.sources.length === 0) throw new AppError(400, 'NO_SOURCES', 'Il progetto non contiene sorgenti VHDL.');
    job.sourceCopies = [];
    for (const filename of job.sources) {
      const relative = path.relative(project.absolute, filename);
      const copiedRelative = path.join('source', relative);
      const copiedAbsolute = path.join(job.buildDirectory, copiedRelative);
      await fs.mkdir(path.dirname(copiedAbsolute), { recursive: true });
      await fs.copyFile(filename, copiedAbsolute);
      job.sourceCopies.push(copiedRelative);
    }
    this.log(job, 'status', `Trovati ${job.sources.length} file VHDL.`);
  }

  async importSources(job) {
    const analysis = sourceAnalysisStep({
      ghdl: this.tools.ghdl,
      buildDirectory: job.buildDirectory,
      sourceCopies: job.sourceCopies,
    });
    await this.runCommand(job, analysis.phase, analysis.command, analysis.args, { cwd: job.buildDirectory });
  }

  async runInteractiveSimulation(job, { testbench, stopTime, vcd }) {
    const plan = simulationPlan({
      ghdl: this.tools.ghdl,
      buildDirectory: job.buildDirectory,
      sourceCopies: job.sourceCopies,
      testbench,
      vcd,
      stopTime,
    });
    const scriptFile = path.join(job.buildDirectory, 'interactive-simulation.sh');
    const script = buildInteractiveScript({
      plan,
      buildDirectory: job.buildDirectory,
      vcd,
      gtkwave: this.tools.gtkwave,
      python: this.tools.python || '/usr/bin/python3',
      script: this.tools.script || 'script',
    });
    await fs.writeFile(scriptFile, script, { encoding: 'utf8', mode: 0o700 });

    const terminal = this.tools.terminal || 'wt.exe';
    const wsl = this.tools.wsl || 'wsl.exe';
    const wslDistro = await detectWslDistribution(wsl, this.tools.wslDistro);
    if (!wslDistro) {
      this.log(job, 'error', `Distribuzione WSL "${EXT_WSL_DISTRO}" non rilevata.`);
      throw new Error('Distribuzione o utente WSL non determinabili per la simulazione interattiva.');
    }
    this.log(job, 'status', `Distribuzione WSL rilevata: ${wslDistro}.`);
    const wslUser = await detectWslUser(wsl, wslDistro, this.tools.wslUser);
    if (!wslUser) {
      this.log(job, 'error', `Utente WSL non rilevato nella distribuzione ${wslDistro}.`);
      throw new Error('Distribuzione o utente WSL non determinabili per la simulazione interattiva.');
    }
    this.log(job, 'status', `Utente WSL rilevato: ${wslUser}.`);
    const terminalArgs = [
      '--window', 'new',
      'new-tab',
      '--title', `UFO EXT_SIM · ${testbench}`,
      wsl, '--distribution', wslDistro, '--user', wslUser, '--exec', 'bash', scriptFile,
    ];
    job.phase = 'Avvio simulazione interattiva';
    for (const item of plan) job.commands.push(displayCommand(item.command, item.args));
    job.commands.push(displayCommand(terminal, terminalArgs));
    this.log(job, 'command', `$ ${displayCommand(terminal, terminalArgs)}`);

    await new Promise((resolve, reject) => {
      const child = spawn(terminal, terminalArgs, {
        cwd: this.tools.terminalCwd || '/mnt/c/Windows',
        detached: true,
        env: { ...process.env, LC_ALL: 'C.UTF-8' },
        shell: false,
        stdio: 'ignore',
      });
      job.currentProcess = child;
      child.once('error', (error) => {
        job.currentProcess = null;
        reject(new Error(`Impossibile avviare ${terminal}: ${error.message}`));
      });
      child.once('spawn', () => {
        job.currentProcess = null;
        child.unref();
        this.log(job, 'status', 'Simulazione EXT_SIM avviata nel terminale esterno.');
        resolve();
      });
    });
  }

  async runSimulation(job, { testbench, stopTime, interactive }) {
    await this.prepare(job, 'simulation');
    const vcd = path.join(job.resultDirectory, `${testbench}.vcd`);
    if (interactive) {
      await this.runInteractiveSimulation(job, { testbench, stopTime, vcd });
      return;
    }

    job.testbench = testbench;
    job.vcd = vcd;
    await this.importSources(job);
    const plan = simulationPlan({
      ghdl: this.tools.ghdl,
      buildDirectory: job.buildDirectory,
      sourceCopies: job.sourceCopies,
      testbench,
      vcd,
      stopTime,
    });
    await this.runCommand(job, plan[1].phase, plan[1].command, plan[1].args, { cwd: job.buildDirectory });
    await this.runCommand(job, plan[2].phase, plan[2].command, plan[2].args, { cwd: job.buildDirectory });
    await this.runCommand(job, plan[3].phase, plan[3].command, plan[3].args, {
      cwd: job.buildDirectory,
      timeout: this.timeouts.simulation,
    });
    const stat = await fs.stat(vcd).catch(() => null);
    if (!stat?.isFile() || stat.size === 0) throw new Error('GHDL non ha prodotto un VCD valido.');
    job.artifacts.vcd = vcd;
  }

  async runSynthesis(job, { top, mode }) {
    await this.prepare(job, 'synthesis');
    await this.importSources(job);
    await this.runCommand(job, 'Preparazione del top-level', this.tools.ghdl, [
      '-m', '--std=08', `--workdir=${job.buildDirectory}`, top,
    ], { cwd: job.buildDirectory });
    const verilog = path.join(job.buildDirectory, 'design.v');
    await this.runCommand(job, 'Sintesi VHDL con GHDL', this.tools.ghdl, [
      'synth', '--std=08', `--workdir=${job.buildDirectory}`, '--out=verilog', top,
    ], { cwd: job.buildDirectory, timeout: this.timeouts.synthesis, captureStdout: verilog });

    const yosysScript = buildYosysSynthesisScript(top, mode);
    const scriptFile = path.join(job.buildDirectory, 'synthesis.ys');
    await fs.writeFile(scriptFile, yosysScript, 'utf8');
    await this.runCommand(job, 'Elaborazione RTL con Yosys', this.tools.yosys, [
      '-s', 'synthesis.ys',
    ], { cwd: job.buildDirectory, timeout: this.timeouts.synthesis });

    const jsonResult = path.join(job.resultDirectory, `${top}.json`);
    await fs.copyFile(path.join(job.buildDirectory, 'netlist.json'), jsonResult);
    const svgResult = path.join(job.resultDirectory, `${top}.svg`);
    await this.runCommand(job, 'Generazione diagramma con netlistsvg', this.tools.netlistsvg, [
      'netlist.json', '-o', svgResult,
    ], { cwd: job.buildDirectory, timeout: this.timeouts.synthesis });
    const stat = await fs.stat(svgResult).catch(() => null);
    if (!stat?.isFile() || stat.size === 0) throw new Error('netlistsvg non ha prodotto un SVG valido.');
    job.artifacts.rtl = svgResult;
    job.artifacts.json = jsonResult;
    job.artifacts.verilog = verilog;
  }

  async finalize(job) {
    if (!job.resultDirectory) return;
    const sources = [];
    for (const filename of job.sources || []) {
      sources.push({
        file: path.relative(job.projectDirectory, filename).split(path.sep).join('/'),
        sha256: await hashFile(filename),
      });
    }
    const manifest = {
      id: job.id,
      type: job.kind,
      project: job.project,
      interactive: job.interactive,
      synthesisMode: job.synthesisMode,
      state: job.state,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      toolVersions: this.versions,
      commands: job.commands,
      sources,
      diagnostics: job.diagnostics,
      error: job.error || null,
    };
    const manifestFile = path.join(job.resultDirectory, 'manifest.json');
    const logFile = path.join(job.resultDirectory, 'console.log');
    await fs.writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    await fs.writeFile(logFile, job.logs.map((entry) => `[${entry.at}] [${entry.phase}] [${entry.stream}] ${entry.text}`).join('\n'), 'utf8');
    job.artifacts.manifest = manifestFile;
    job.artifacts.log = logFile;
  }

  async openGtkWave(id) {
    const job = this.get(id);
    if (job.state !== 'completed' || !job.artifacts.vcd) {
      throw new AppError(409, 'VCD_UNAVAILABLE', 'Nessun VCD completato è disponibile per questa operazione.');
    }
    const child = spawn(this.tools.gtkwave, [job.artifacts.vcd], {
      cwd: path.dirname(job.artifacts.vcd),
      detached: true,
      shell: false,
      stdio: 'ignore',
    });
    child.unref();
    return { opened: true };
  }

  artifact(id, kind) {
    const job = this.get(id);
    const filename = job.artifacts[kind];
    if (!filename) throw new AppError(404, 'ARTIFACT_NOT_FOUND', 'Risultato non disponibile.');
    return filename;
  }
}

module.exports = {
  JobManager,
  buildInteractiveScript,
  detectWslDistribution,
  detectWslUser,
  displayCommand,
  buildYosysSynthesisScript,
  simulationPlan,
  validateEntity,
  validateSynthesisMode,
  validateStopTime,
};
