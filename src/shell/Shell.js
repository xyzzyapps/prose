/**
 * shell/Shell.js - Modern interactive REPL for Prose.
 *
 * Features:
 *   - Styled banner and prompt (chalk, boxen, figlet, gradient-string)
 *   - Loading spinners for long operations (ora)
 *   - Tab completion for dot-commands and Prose keywords
 *   - Source context in error messages
 *   - One statement per line (periods optional)
 *   - Command history with search (Ctrl+R via readline)
 *   - State persistence between lines
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as readline from 'node:readline';
import { Lexer } from '../lexer/Lexer.js';
import { Parser } from '../parser/Parser.js';
import { Interpreter } from '../interpreter/Interpreter.js';
import { Environment } from '../core/Environment.js';
import { ProseError } from '../core/Errors.js';
import {
  showBanner, makePrompt,
  printSuccess, printInfo, printWarning, printError,
  printDivider, printBox, createSpinner,
  createReadline, showSourceContext,
} from './Terminal.js';
import chalk from 'chalk';

export class Shell {
  constructor() {
    /** @type {Environment} shared environment across REPL lines */
    this.env = new Environment();
    /** @type {Interpreter} */
    this.interpreter = new Interpreter(this.env);
    /** @type {readline.Interface} */
    this.rl = null;
    /** @type {string[]} command history */
    this.history = [];
    /** @type {string} current working directory context */
    this.workDir = process.cwd();
    /** @type {boolean} suppress banner on reload */
    this._firstRun = true;
    /** @type {boolean} */
    this._handlingLine = false;
    /** @type {string[]} */
    this._lineQueue = [];
    /** @type {boolean} */
    this._closing = false;
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  async start() {
    await this._startInteractive();
  }

  async _startInteractive() {
    if (this._firstRun) {
      showBanner();
      this._firstRun = false;
    }

    this.rl = createReadline();

    // Store history externally since readline's built-in is limited
    this.rl.history = this.history;

    this.rl.on('line', (line) => {
      void this._onLine(line);
    });
    this.rl.on('close', () => {
      void this._onClose();
    });

    this.rl.on('SIGINT', () => {
      console.log(chalk.dim('\n  Press Ctrl+C again or type .exit to quit.'));
      this._setMainPrompt();
    });

    this._setMainPrompt();
  }

  async runFile(filePath) {
    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) {
      console.error(chalk.red(`Error: File not found: ${resolved}`));
      process.exit(1);
    }

    displayFileHeader(resolved);

    const source = fs.readFileSync(resolved, 'utf-8');
    this.workDir = path.dirname(resolved);

    const isTTY = process.stdout.isTTY;
    const spinner = isTTY ? createSpinner('Executing...') : null;
    if (spinner) spinner.start();

    try {
      const lexer = new Lexer(source, resolved);
      const tokens = lexer.tokenize();
      const parser = new Parser(tokens);
      const program = parser.parse();
      const result = this.interpreter.interpret(program);

      if (spinner) spinner.stop();

      if (result.output) {
        for (const l of result.output.split('\n')) {
          console.log('  ' + l);
        }
      }
      printDivider();
      printSuccess('Done');
    } catch (e) {
      if (spinner) spinner.stop();
      this._printError(e, source);
      process.exit(1);
    }
  }

  // -----------------------------------------------------------------------
  // Line handling
  // -----------------------------------------------------------------------

  async _onLine(line) {
    this._lineQueue.push(line);
    if (this._handlingLine) return;
    this._handlingLine = true;
    this.rl.pause();
    try {
      while (this._lineQueue.length) {
        const next = this._lineQueue.shift();
        await this._handleLine(next);
      }
    } catch (e) {
      this._printError(e);
      this._setMainPrompt();
    } finally {
      this._handlingLine = false;
      if (this.rl && !this._closing) this.rl.resume();
    }
  }

  async _onClose() {
    if (this._closing) return;
    this._closing = true;
    console.log(chalk.dim('\n  Goodbye.\n'));
    process.exit(0);
  }

  async _handleLine(line) {
    const cleaned = line.replace(/^\uFEFF/, '').replace(/^\u200B/, '');
    const trimmed = cleaned.trim();

    if (trimmed.startsWith('.')) {
      await this._handleCommand(trimmed);
      if (!this.rl) return;
      this._setMainPrompt();
      return;
    }

    if (trimmed === '') {
      this._setMainPrompt();
      return;
    }

    this.history.push(trimmed);
    if (this.history.length > 1000) this.history.shift();
    await this._executeCode(cleaned + '\n');
    this._setMainPrompt();
  }

  async _executeCode(code) {
    // Trim leading/trailing blank lines but preserve internal structure
    code = code.replace(/^\n+/, '').replace(/\n+$/, '\n');

    if (!code.trim()) return;

    try {
      const lexer = new Lexer(code, '<repl>');
      const tokens = lexer.tokenize();
      const parser = new Parser(tokens, { recover: true });
      const program = parser.parse();
      const result = this.interpreter.interpret(program);

      if (result.output) {
        const lines = result.output.split('\n');
        for (const l of lines) {
          // Dim blank lines, bright for content
          if (l.trim() === '') {
            console.log('');
          } else {
            console.log('  ' + l);
          }
        }
      }
    } catch (e) {
      this._printError(e, code);
    }
  }

  // -----------------------------------------------------------------------
  // Dot-commands
  // -----------------------------------------------------------------------

  async _handleCommand(input) {
    const parts = input.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    switch (cmd) {
      case '.help':    this._cmdHelp(); break;
      case '.exit':
      case '.quit':
      case '.q':
        this.rl.close();
        this.rl = null;
        break;
      case '.run':
      case '.r':       await this._cmdRun(args); break;
      case '.load':
      case '.l':       await this._cmdLoad(args); break;
      case '.clear':
      case '.cls':     console.clear(); showBanner(); break;
      case '.vars':
      case '.v':       this._cmdShowVars(); break;
      case '.verbs':   this._cmdShowVerbs(); break;
      case '.reset':   this._cmdReset(); break;
      case '.color':   this._cmdColor(); break;
      case '.echo':    console.log(args.join(' ')); break;
      case '.pwd':     console.log('  ' + this.workDir); break;
      case '.env':     this._cmdShowEnv(); break;
      case '.stats':   this._cmdStats(); break;
      default:
        console.log(chalk.yellow(`  Unknown: ${cmd}. Type .help for commands.`));
    }
  }

  _cmdHelp() {
    const text = [
      `${chalk.bold.cyan('Shell Commands')}`,
      '',
      `${chalk.yellow('.help')}              Show this help`,
      `${chalk.yellow('.exit, .quit, .q')}   Exit the shell`,
      `${chalk.yellow('.run <file>')}        Run a Prose file (fresh env)`,
      `${chalk.yellow('.load <file>')}       Load a Prose file (current env)`,
      `${chalk.yellow('.vars, .v')}          List all variables`,
      `${chalk.yellow('.verbs')}             List all defined verbs`,
      `${chalk.yellow('.reset')}             Reset environment`,
      `${chalk.yellow('.clear, .cls')}       Clear the screen`,
      `${chalk.yellow('.color')}             Toggle colored output`,
      `${chalk.yellow('.echo <text>')}       Print text`,
      `${chalk.yellow('.pwd')}               Print working directory`,
      `${chalk.yellow('.env')}               Show session info`,
      `${chalk.yellow('.stats')}             Show session statistics`,
      '',
      `${chalk.bold.cyan('Tips')}`,
      '',
      `• One statement per line; periods are optional`,
      `• Same-line blocks: ${chalk.yellow('If x > 5 Print "yes" Otherwise Print "no"')}`,
      `• ${chalk.yellow('Tab')} completes keywords`,
      `• Variables defined in the REPL persist between lines`,
    ].join('\n');

    printBox(text, 'Help');
  }

  async _cmdRun(args) {
    if (args.length === 0) {
      console.log(chalk.red('  Usage: .run <file>'));
      return;
    }
    const filePath = path.resolve(this.workDir, args[0]);
    if (!fs.existsSync(filePath)) {
      printError(`File not found: ${filePath}`);
      return;
    }
    displayFileHeader(filePath);
    const source = fs.readFileSync(filePath, 'utf-8');
    const spinner = createSpinner('Running...');
    spinner.start();
    try {
      const lexer = new Lexer(source, filePath);
      const tokens = lexer.tokenize();
      const parser = new Parser(tokens);
      const program = parser.parse();
      const freshEnv = new Environment();
      const freshInterp = new Interpreter(freshEnv);
      const result = freshInterp.interpret(program);
      spinner.stop();
      if (result.output) {
        for (const l of result.output.split('\n')) console.log('  ' + l);
      }
      printDivider();
      printSuccess('File executed');
    } catch (e) {
      spinner.stop();
      this._printError(e, source);
    }
  }

  async _cmdLoad(args) {
    if (args.length === 0) {
      console.log(chalk.red('  Usage: .load <file>'));
      return;
    }
    const filePath = path.resolve(this.workDir, args[0]);
    if (!fs.existsSync(filePath)) {
      printError(`File not found: ${filePath}`);
      return;
    }
    displayFileHeader(filePath);
    const source = fs.readFileSync(filePath, 'utf-8');
    const spinner = createSpinner('Loading...');
    spinner.start();
    try {
      const lexer = new Lexer(source, filePath);
      const tokens = lexer.tokenize();
      const parser = new Parser(tokens);
      const program = parser.parse();
      const result = this.interpreter.interpret(program);
      spinner.stop();
      if (result.output) {
        for (const l of result.output.split('\n')) console.log('  ' + l);
      }
      printDivider();
      printSuccess('File loaded');
    } catch (e) {
      spinner.stop();
      this._printError(e, source);
    }
  }

  _cmdShowVars() {
    const vars = this.env.variables;
    if (vars.size === 0) {
      console.log(chalk.dim('  No variables defined.'));
      return;
    }
    const rows = [];
    for (const [name, value] of vars) {
      const typeStr = chalk.dim(`(${value.typeName()})`);
      const valStr = value.toString().substring(0, 60);
      rows.push(`  ${chalk.cyan(name)} ${typeStr} = ${valStr}`);
    }
    printBox(rows.join('\n'), `Variables (${vars.size})`);
  }

  _cmdShowVerbs() {
    const verbs = this.env.verbs;
    if (verbs.size === 0) {
      console.log(chalk.dim('  No verbs defined.'));
      return;
    }
    const rows = [];
    for (const [name, def] of verbs) {
      const params = def.params ? def.params.join(' ') : '';
      const type = def.native ? chalk.dim('(native)') : chalk.green('(user)');
      rows.push(`  ${chalk.magenta(name)} ${chalk.dim(params)} ${type}`);
    }
    printBox(rows.join('\n'), `Verbs (${verbs.size})`);
  }

  _cmdReset() {
    this.env = new Environment();
    this.interpreter = new Interpreter(this.env);
    this.history = [];
    printSuccess('Environment reset. All state cleared.');
  }

  _cmdColor() {
    // Colors always on with chalk
    console.log(chalk.dim('  Colors are always enabled.'));
  }

  _cmdShowEnv() {
    const info = [
      `${chalk.dim('Working dir:')} ${this.workDir}`,
      `${chalk.dim('Variables:')}   ${this.env.variables.size}`,
      `${chalk.dim('Verbs:')}       ${this.env.verbs.size}`,
      `${chalk.dim('Watchers:')}    ${this.env.watchers.length}`,
      `${chalk.dim('Labels:')}      ${this.env.labels.size}`,
    ].join('\n');
    printBox(info, 'Session');
  }

  _cmdStats() {
    const info = [
      `${chalk.dim('Variables:')} ${this.env.variables.size}`,
      `${chalk.dim('Verbs:')}     ${this.env.verbs.size}`,
      `${chalk.dim('Watchers:')}  ${this.env.watchers.length}`,
      `${chalk.dim('History:')}   ${this.history.length} lines`,
      `${chalk.dim('Platform:')}  ${process.platform} / Node ${process.version}`,
    ].join('\n');
    printBox(info, 'Statistics');
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  _setMainPrompt() {
    if (!this.rl) return;
    this.rl.setPrompt(makePrompt());
    this.rl.prompt();
  }

  _printError(e, source = null) {
    if (e instanceof ProseError) {
      const msg = e.toString();
      printError(msg);
      if (source && e.line > 0) {
        console.log(chalk.dim('  ' + '─'.repeat(40)));
        const ctx = showSourceContext(source, e.line, e.column);
        console.log(ctx);
        console.log(chalk.dim('  ' + '─'.repeat(40)));
      }
    } else {
      printError(e.message);
      if (process.env.DEBUG) console.error(chalk.dim(e.stack));
    }
  }
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

function displayFileHeader(filePath) {
  const home = os.homedir();
  const display = filePath.startsWith(home) ? '~' + filePath.slice(home.length) : filePath;
  printDivider(path.basename(filePath));
  console.log(chalk.dim(`  ${display}`));
  printDivider();
}
