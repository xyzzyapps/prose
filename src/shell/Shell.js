/**
 * shell/Shell.js - Interactive REPL shell for Prose.
 *
 * Provides a DOS/bash-like interactive environment with:
 *   - Multi-line input for indented blocks
 *   - Command history
 *   - Built-in commands (.run, .load, .help, .exit, etc.)
 *   - Colorized output
 *   - State persistence between lines
 */

import * as readline from 'node:readline';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Lexer } from '../lexer/Lexer.js';
import { Parser } from '../parser/Parser.js';
import { Interpreter } from '../interpreter/Interpreter.js';
import { Environment } from '../core/Environment.js';
import { ProseError } from '../core/Errors.js';
import { Logger } from '../core/Logger.js';

const logger = new Logger('shell');

// ANSI color codes
const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

const PROMPT = `${COLORS.cyan}prose>${COLORS.reset} `;
const CONT_PROMPT = `${COLORS.dim}......${COLORS.reset} `;
const BANNER = `
${COLORS.bold}${COLORS.green}Prose Shell (esh) v1.0.0${COLORS.reset}
${COLORS.dim}A practical, declarative, English-like programming language.${COLORS.reset}
${COLORS.dim}Type ${COLORS.yellow}.help${COLORS.dim} for available commands.${COLORS.reset}
${COLORS.dim}Type ${COLORS.yellow}.exit${COLORS.dim} to quit.${COLORS.reset}
`;

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
    /** @type {number} max history size */
    this.maxHistory = 1000;
    /** @type {boolean} whether to show colors */
    this.useColor = true;
    /** @type {string} current working file/dir context */
    this.workDir = process.cwd();
  }

  /**
   * Start the interactive REPL.
   */
  async start() {
    console.log(BANNER);

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: PROMPT,
      history: this.history,
      historySize: this.maxHistory,
      removeHistoryDuplicates: true,
      terminal: true,
    });

    this.rl.on('line', (line) => this._handleLine(line));
    this.rl.on('close', () => {
      console.log(`\n${COLORS.dim}Goodbye.${COLORS.reset}`);
      process.exit(0);
    });

    // Handle Ctrl+C gracefully
    this.rl.on('SIGINT', () => {
      console.log(`\n${COLORS.dim}Use ${COLORS.yellow}.exit${COLORS.dim} to quit.${COLORS.reset}`);
      this.rl.prompt();
    });

    this.rl.prompt();
  }

  /**
   * Execute a Prose source file.
   * @param {string} filePath
   */
  async runFile(filePath) {
    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) {
      console.error(`${COLORS.red}Error: File not found: ${resolved}${COLORS.reset}`);
      process.exit(1);
    }

    const source = fs.readFileSync(resolved, 'utf-8');
    this.workDir = path.dirname(resolved);

    try {
      const lexer = new Lexer(source, resolved);
      const tokens = lexer.tokenize();
      const parser = new Parser(tokens);
      const program = parser.parse();
      const result = this.interpreter.interpret(program);

      if (result.output) {
        console.log(result.output);
      }
    } catch (e) {
      this._printError(e);
      process.exit(1);
    }
  }

  // -----------------------------------------------------------------------
  // Line handling
  // -----------------------------------------------------------------------

  /**
   * Handle a single input line.
   * Supports multi-line input for blocks ending with a colon.
   * @param {string} line
   */
  async _handleLine(line) {
    const trimmed = line.trim();

    // Check for dot-commands
    if (trimmed.startsWith('.')) {
      await this._handleCommand(trimmed);
      if (!this.rl) return; // .exit was called
      this.rl.setPrompt(PROMPT);
      this.rl.prompt();
      return;
    }

    // Skip empty lines
    if (trimmed === '') {
      this.rl.setPrompt(PROMPT);
      this.rl.prompt();
      return;
    }

    // Add to history
    if (trimmed) {
      this.history.push(trimmed);
      if (this.history.length > this.maxHistory) {
        this.history.shift();
      }
    }

    // Check if this line opens a block (ends with colon)
    if (trimmed.endsWith(':')) {
      await this._readMultiline(trimmed);
    } else {
      await this._executeLine(trimmed);
    }

    if (this.rl) {
      this.rl.setPrompt(PROMPT);
      this.rl.prompt();
    }
  }

  /**
   * Read a multi-line block. Lines are collected until a blank line
   * terminates the block.
   * @param {string} firstLine
   */
  async _readMultiline(firstLine) {
    const lines = [firstLine];
    this.rl.setPrompt(CONT_PROMPT);

    return new Promise((resolve) => {
      const handler = (line) => {
        // Empty line terminates the block
        if (line.trim() === '') {
          this.rl.removeListener('line', handler);
          const fullText = lines.join('\n') + '\n';
          this._executeLine(fullText);
          resolve();
          return;
        }

        lines.push(line);
        this.rl.setPrompt(CONT_PROMPT);
        this.rl.prompt();
      };

      this.rl.on('line', handler);
      this.rl.prompt();
    });
  }

  /**
   * Execute a single line or completed block of Prose code.
   * @param {string} code
   */
  async _executeLine(code) {
    // Pre-process: ensure code ends with newline for proper lexing
    if (!code.endsWith('\n')) code += '\n';

    try {
      const lexer = new Lexer(code, '<repl>');
      const tokens = lexer.tokenize();
      const parser = new Parser(tokens);
      const program = parser.parse();
      const result = this.interpreter.interpret(program);

      if (result.output) {
        console.log(result.output);
      }
    } catch (e) {
      this._printError(e);
    }
  }

  // -----------------------------------------------------------------------
  // Dot-commands
  // -----------------------------------------------------------------------

  /**
   * Handle shell meta-commands (prefixed with .).
   * @param {string} input
   */
  async _handleCommand(input) {
    const parts = input.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    switch (cmd) {
      case '.help':
        this._cmdHelp();
        break;
      case '.exit':
      case '.quit':
      case '.q':
        this.rl.close();
        this.rl = null;
        break;
      case '.run':
      case '.r':
        await this._cmdRun(args);
        break;
      case '.load':
      case '.l':
        await this._cmdLoad(args);
        break;
      case '.clear':
      case '.cls':
        console.clear();
        break;
      case '.vars':
      case '.v':
        this._cmdShowVars();
        break;
      case '.verbs':
        this._cmdShowVerbs();
        break;
      case '.reset':
        this._cmdReset();
        break;
      case '.color':
        this.useColor = !this.useColor;
        console.log(`Colors ${this.useColor ? 'enabled' : 'disabled'}.`);
        break;
      case '.echo':
        console.log(args.join(' '));
        break;
      case '.pwd':
        console.log(this.workDir);
        break;
      default:
        console.log(`${COLORS.yellow}Unknown command: ${cmd}. Type .help for available commands.${COLORS.reset}`);
    }
  }

  _cmdHelp() {
    console.log(`
${COLORS.bold}Prose Shell Commands:${COLORS.reset}
  ${COLORS.cyan}.help${COLORS.reset}           Show this help
  ${COLORS.cyan}.exit, .quit, .q${COLORS.reset}  Exit the shell
  ${COLORS.cyan}.run <file>${COLORS.reset}       Run a Prose source file
  ${COLORS.cyan}.load <file>${COLORS.reset}      Load and execute a Prose file in current environment
  ${COLORS.cyan}.vars, .v${COLORS.reset}         List all variables
  ${COLORS.cyan}.verbs${COLORS.reset}            List all defined verbs
  ${COLORS.cyan}.reset${COLORS.reset}            Reset the environment (clear all state)
  ${COLORS.cyan}.clear, .cls${COLORS.reset}      Clear the screen
  ${COLORS.cyan}.color${COLORS.reset}            Toggle colored output
  ${COLORS.cyan}.echo <text>${COLORS.reset}      Print text to the console
  ${COLORS.cyan}.pwd${COLORS.reset}              Print working directory

${COLORS.bold}Prose Entry Points:${COLORS.reset}
  Type Prose statements directly at the prompt.
  Lines ending with ${COLORS.cyan}:${COLORS.reset} start a multi-line block (end with blank line).
  Use ${COLORS.cyan}Ctrl+C${COLORS.reset} to cancel input.
`);
  }

  async _cmdRun(args) {
    if (args.length === 0) {
      console.log(`${COLORS.red}Usage: .run <file>${COLORS.reset}`);
      return;
    }
    const filePath = path.resolve(this.workDir, args[0]);
    if (!fs.existsSync(filePath)) {
      console.log(`${COLORS.red}File not found: ${filePath}${COLORS.reset}`);
      return;
    }
    const source = fs.readFileSync(filePath, 'utf-8');
    try {
      const lexer = new Lexer(source, filePath);
      const tokens = lexer.tokenize();
      const parser = new Parser(tokens);
      const program = parser.parse();

      // Run in a fresh environment (no side effects on current session)
      const freshEnv = new Environment();
      const freshInterp = new Interpreter(freshEnv);
      const result = freshInterp.interpret(program);

      if (result.output) {
        console.log(result.output);
      }
      console.log(`${COLORS.green}File executed successfully.${COLORS.reset}`);
    } catch (e) {
      this._printError(e);
    }
  }

  async _cmdLoad(args) {
    if (args.length === 0) {
      console.log(`${COLORS.red}Usage: .load <file>${COLORS.reset}`);
      return;
    }
    const filePath = path.resolve(this.workDir, args[0]);
    if (!fs.existsSync(filePath)) {
      console.log(`${COLORS.red}File not found: ${filePath}${COLORS.reset}`);
      return;
    }
    const source = fs.readFileSync(filePath, 'utf-8');
    try {
      const lexer = new Lexer(source, filePath);
      const tokens = lexer.tokenize();
      const parser = new Parser(tokens);
      const program = parser.parse();

      // Execute in current environment (side effects persist)
      const result = this.interpreter.interpret(program);

      if (result.output) {
        console.log(result.output);
      }
      console.log(`${COLORS.green}File loaded successfully.${COLORS.reset}`);
    } catch (e) {
      this._printError(e);
    }
  }

  _cmdShowVars() {
    const vars = this.env.variables;
    if (vars.size === 0) {
      console.log(`${COLORS.dim}No variables defined.${COLORS.reset}`);
      return;
    }
    console.log(`${COLORS.bold}Variables:${COLORS.reset}`);
    for (const [name, value] of vars) {
      const typeStr = value.typeName();
      const valStr = this._truncate(value.toString(), 80);
      console.log(`  ${COLORS.cyan}${name}${COLORS.reset} ${COLORS.dim}(${typeStr})${COLORS.reset} = ${valStr}`);
    }
  }

  _cmdShowVerbs() {
    const verbs = this.env.verbs;
    if (verbs.size === 0) {
      console.log(`${COLORS.dim}No verbs defined.${COLORS.reset}`);
      return;
    }
    console.log(`${COLORS.bold}Verbs:${COLORS.reset}`);
    for (const [name, def] of verbs) {
      const params = def.params ? def.params.join(' ') : '';
      const type = def.native ? 'native' : 'user';
      console.log(`  ${COLORS.magenta}${name}${COLORS.reset} ${COLORS.dim}${params}${COLORS.reset} ${COLORS.dim}(${type})${COLORS.reset}`);
    }
  }

  _cmdReset() {
    this.env = new Environment();
    this.interpreter = new Interpreter(this.env);
    console.log(`${COLORS.green}Environment reset.${COLORS.reset}`);
  }

  // -----------------------------------------------------------------------
  // Utilities
  // -----------------------------------------------------------------------

  /**
   * Print a formatted error.
   * @param {Error} e
   */
  _printError(e) {
    if (e instanceof ProseError) {
      console.error(`${COLORS.red}${e.toString()}${COLORS.reset}`);
    } else {
      console.error(`${COLORS.red}Error: ${e.message}${COLORS.reset}`);
      if (process.env.DEBUG) {
        console.error(e.stack);
      }
    }
  }

  /**
   * Truncate a string to a max length.
   * @param {string} str
   * @param {number} maxLen
   * @returns {string}
   */
  _truncate(str, maxLen) {
    if (str.length <= maxLen) return str;
    return str.substring(0, maxLen - 3) + '...';
  }
}
