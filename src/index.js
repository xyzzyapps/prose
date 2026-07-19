#!/usr/bin/env node

/**
 * esh - Prose programming language interpreter and interactive shell.
 *
 * Usage:
 *   esh                    Start interactive REPL
 *   esh <file.prose>       Run a Prose source file
 *   esh --repl             Force REPL mode
 *   esh --run <file.prose> Run a file explicitly
 *   esh --help             Show help
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import { Shell } from './shell/Shell.js';

function printHelp() {
  console.log(`
Prose Shell (esh) v1.0.0
A practical, declarative, English-like programming language.

Usage:
  esh                        Start interactive REPL
  esh <file.prose>            Run a Prose source file
  esh --repl                  Force REPL mode
  esh --run <file.prose>      Run a file explicitly
  esh --help, -h              Show this help
  esh --version, -v           Show version

Examples:
  esh                        Launch the interactive shell
  esh examples/hello.prose   Run the hello world example
  esh examples/bank.prose    Run the bank transaction example
`);
}

function printVersion() {
  console.log('esh v1.0.0');
}

async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  if (args.length === 0) {
    // No arguments: start REPL
    const shell = new Shell();
    await shell.start();
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
    const shell = new Shell();
    await shell.start();
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
