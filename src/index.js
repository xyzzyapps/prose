#!/usr/bin/env node

/**
 * Prose language interpreter.
 *
 * Usage:
 *   prose                    Start the interactive REPL
 *   prose <file.prose>       Run a Prose source file
 *   prose --run <file.prose> Run a file explicitly
 *   prose --repl             Start the REPL
 *   prose --help             Show help
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import { Shell } from './shell/Shell.js';

function printHelp() {
  console.log(`
Prose v2.0
A programming language that reads like English.

Usage:
  prose                         Start the interactive REPL
  prose <file.prose>            Run a Prose source file
  prose --run <file.prose>      Run a file explicitly
  prose --repl                  Start the REPL
  prose --help, -h              Show this help
  prose --version, -v           Show version

Examples:
  prose                         Interactive shell
  prose examples/hello.prose    Run the hello world example

Periods are optional. Same-line blocks: If x > 5 Print "yes".
`);
}

function printVersion() {
  console.log('Prose v2.0.0');
}

async function startRepl() {
  const shell = new Shell();
  await shell.start();
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    await startRepl();
    return;
  }

  const firstArg = args[0];

  if (firstArg === '--help' || firstArg === '-h') {
    printHelp();
    return;
  }

  if (firstArg === '--version' || firstArg === '-v') {
    printVersion();
    return;
  }

  if (firstArg === '--repl') {
    await startRepl();
    return;
  }

  if (firstArg === '--run') {
    if (args.length < 2) {
      console.error('Error: --run requires a file argument');
      process.exit(1);
    }
    const shell = new Shell();
    await shell.runFile(args[1]);
    return;
  }

  // Treat first argument as a file to run
  const filePath = firstArg;
  const resolved = path.resolve(filePath);

  if (fs.existsSync(resolved) && resolved.endsWith('.prose')) {
    const shell = new Shell();
    await shell.runFile(resolved);
    return;
  }

  // Check with .prose extension
  const withExt = resolved + '.prose';
  if (fs.existsSync(withExt)) {
    const shell = new Shell();
    await shell.runFile(withExt);
    return;
  }

  console.error(`Error: File not found: ${resolved}`);
  console.error('Use --help for usage information.');
  process.exit(1);
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
