#!/usr/bin/env node
'use strict';

const { ConfigError, helpText, parseArgs } = require('./config');
const { createUfoServer } = require('./server');

async function main() {
  const config = parseArgs();
  if (config.help) {
    process.stdout.write(`${helpText()}\n`);
    return;
  }
  const application = await createUfoServer({ ...config, onShutdown: () => process.exit(0) });
  const address = await application.listen();
  process.stdout.write(`UFO avviato su http://${address.host}:${address.port}\n`);
  process.stdout.write(`Radice progetti: ${address.projectsRoot}\n`);

  const stop = async () => {
    process.stdout.write('\nArresto UFO…\n');
    await application.close();
    process.exit(0);
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

main().catch((error) => {
  const prefix = error instanceof ConfigError ? 'Configurazione non valida' : 'Avvio non riuscito';
  process.stderr.write(`${prefix}: ${error.message}\n`);
  process.exitCode = 1;
});
