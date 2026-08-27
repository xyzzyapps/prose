/**
 * shell/Terminal.js - Modern terminal UI utilities for Prose.
 *
 * Provides styled prompts, banners, boxes, spinners, and output formatting
 * inspired by modern AI coding agents (Claude Code, OpenCode, etc.).
 */

import chalk from 'chalk';
import boxen from 'boxen';
import ora from 'ora';
import figlet from 'figlet';
import gradient from 'gradient-string';
import * as readline from 'node:readline';
import * as path from 'node:path';
import * as os from 'node:os';

// ---------------------------------------------------------------------------
// Banner
// ---------------------------------------------------------------------------

export function showBanner() {
  const termWidth = process.stdout.columns || 80;

  // Render figlet title
  const figletText = figlet.textSync('  prose', {
    font: 'Standard',
    horizontalLayout: 'default',
  });

  const title = gradient.pastel(figletText);

  const subtitle = gradient(['#a8e6cf', '#dcedc1', '#ffd3b6', '#ffaaa5', '#ff8b94']);

  const box = boxen(
    `${title}\n${chalk.dim('Prose  v2.0')}\n${subtitle('Code that reads like English.')}\n\n${chalk.dim('• Type Prose statements directly')}\n${chalk.dim('• .help for commands  •  .exit to quit')}\n${chalk.dim('• Ctrl+C to cancel  •  Lines ending with : enter multi-line mode')}`,
    {
      padding: { top: 0, bottom: 1, left: 3, right: 3 },
      margin: { top: 1, bottom: 1 },
      borderStyle: 'round',
      borderColor: 'cyan',
      float: 'center',
    }
  );

  console.log(box);
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

export function makePrompt() {
  const cwd = process.cwd();
  const home = os.homedir();
  const displayPath = cwd.startsWith(home) ? '~' + cwd.slice(home.length) : cwd;
  const dirName = path.basename(displayPath) || displayPath;

  return `${chalk.hex('#6c5ce7').bold('prose')} ${chalk.dim(displayPath)} ${chalk.hex('#a29bfe')('›')} `;
}

export function makeContPrompt(_indent = 0) {
  // Plain ASCII: ANSI + leading spaces desync the cursor on Windows readline.
  return '... ';
}

// ---------------------------------------------------------------------------
// Output styling
// ---------------------------------------------------------------------------

export function printSuccess(msg) {
  console.log(chalk.green('✓') + ' ' + chalk.dim(msg));
}

export function printInfo(msg) {
  console.log(chalk.blue('ℹ') + ' ' + msg);
}

export function printWarning(msg) {
  console.log(chalk.yellow('⚠') + ' ' + msg);
}

export function printError(msg, sourceLine = null, column = 0) {
  console.log(chalk.red('✗ ') + chalk.red.bold(msg));
  if (sourceLine) {
    console.log(chalk.dim('  │ ') + sourceLine);
    if (column > 0) {
      const pointer = ' '.repeat(column) + chalk.red('^');
      console.log(chalk.dim('  │ ') + pointer);
    }
  }
}

export function printDivider(label = '') {
  const width = process.stdout.columns || 80;
  if (label) {
    const pad = Math.max(0, (width - label.length - 4) / 2);
    console.log(chalk.dim('─'.repeat(pad) + ` ${label} ` + '─'.repeat(pad)));
  } else {
    console.log(chalk.dim('─'.repeat(width)));
  }
}

export function printBox(content, title = '') {
  const box = boxen(content, {
    padding: { top: 0, bottom: 0, left: 2, right: 2 },
    margin: { top: 0, bottom: 0 },
    borderStyle: 'round',
    borderColor: 'cyan',
    title: title || undefined,
    titleAlignment: 'left',
  });
  console.log(box);
}

// ---------------------------------------------------------------------------
// Spinner
// ---------------------------------------------------------------------------

export function createSpinner(text) {
  return ora({
    text: chalk.dim(text),
    spinner: 'dots',
    color: 'cyan',
  });
}

// ---------------------------------------------------------------------------
// Tab completion
// ---------------------------------------------------------------------------

const BUILTIN_COMMANDS = [
  '.help', '.exit', '.quit', '.q', '.run', '.load',
  '.vars', '.v', '.verbs', '.reset', '.clear', '.cls',
  '.color', '.echo', '.pwd',
];

const PROSE_KEYWORDS = [
  'Print', 'If', 'Otherwise', 'While', 'For-Every', 'To', 'Result',
  'Label', 'Jump', 'Execute', 'A', 'An', 'named', 'exists',
  'Number', 'Text', 'List', 'Dictionary', 'User', 'Account',
  'Increase', 'Lower', 'Set', 'Keep', 'Call', 'With',
  'Whenever', 'Using', 'Include', 'Break', 'Continue', 'True', 'False', 'Not',
  'Read', 'Write', 'Delete', 'Make', 'Copy', 'Rename', 'Touch', 'Append',
  'Try', 'Catch', 'Run',
  'Uppercase', 'Lowercase', 'Length', 'Split', 'Join', 'Replace',
];

/**
 * Tab completion. Empty / whitespace-only lines get 4 more spaces (indent).
 * Leading indent is kept on keyword hits so continuation lines stay indented.
 */
export function completer(line) {
  const leadWs = (line.match(/^[ \t]*/) || [''])[0];
  const trimmed = line.slice(leadWs.length);

  if (!trimmed) {
    return [[leadWs + '    '], line];
  }

  const hits = [];

  if (trimmed.startsWith('.')) {
    for (const cmd of BUILTIN_COMMANDS) {
      if (cmd.startsWith(trimmed)) hits.push(leadWs + cmd);
    }
  } else {
    const words = trimmed.split(/\s+/);
    const lastWord = words[words.length - 1] || '';
    const beforeLast = trimmed.slice(0, trimmed.length - lastWord.length);
    for (const kw of PROSE_KEYWORDS) {
      if (kw.toLowerCase().startsWith(lastWord.toLowerCase())) {
        hits.push(leadWs + beforeLast + kw);
      }
    }
  }

  return [hits.length ? hits : [], line];
}

/** Lines that stay at the current outer indent in a REPL block. */
const REPL_DEDENT_HEADS = /^(Otherwise|Catch)\b/;

/**
 * Indent a continuation line for an indented Prose block.
 * @returns {{ text: string, indent: number, endBlock: boolean }}
 */
export function applyReplContinuation(line, blockIndent) {
  const trimmed = line.trim();
  if (trimmed === '') {
    return { text: line, indent: 0, endBlock: true };
  }
  const indent = line.length - line.trimStart().length;
  if (indent === 0 && !REPL_DEDENT_HEADS.test(trimmed)) {
    const pad = blockIndent > 0 ? blockIndent : 4;
    return { text: ' '.repeat(pad) + trimmed, indent: pad, endBlock: false };
  }
  return { text: line, indent, endBlock: false };
}

// ---------------------------------------------------------------------------
// Readline setup
// ---------------------------------------------------------------------------

export function createReadline() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    completer: completer,
    terminal: true,
    historySize: 1000,
    removeHistoryDuplicates: true,
  });
}

// ---------------------------------------------------------------------------
// Source context for errors
// ---------------------------------------------------------------------------

export function showSourceContext(source, lineNum, column) {
  const lines = source.split('\n');
  const target = lineNum - 1;
  const start = Math.max(0, target - 2);
  const end = Math.min(lines.length, target + 3);

  const output = [];
  for (let i = start; i < end; i++) {
    const num = String(i + 1).padStart(4, ' ');
    const marker = i === target ? chalk.red('▶') : chalk.dim('│');
    const line = i === target ? chalk.red(lines[i]) : chalk.dim(lines[i]);
    output.push(`${chalk.dim(num)} ${marker} ${line}`);
    if (i === target && column > 0) {
      output.push(`      ${chalk.dim('│')} ${' '.repeat(column - 1)}${chalk.red.bold('^── here')}`);
    }
  }
  return output.join('\n');
}
