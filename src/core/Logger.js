/**
 * core/Logger.js - Simple structured logger for Prose.
 *
 * Uses console under the hood with configurable levels.
 */

const LEVELS = {
  TRACE: 0,
  DEBUG: 1,
  INFO: 2,
  WARN: 3,
  ERROR: 4,
  SILENT: 5,
};

const LEVEL_NAMES = ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'SILENT'];

export class Logger {
  /**
   * @param {string} name     logger name (e.g. 'lexer', 'parser', 'interpreter')
   * @param {string} [level]  one of TRACE, DEBUG, INFO, WARN, ERROR, SILENT
   */
  constructor(name, level = 'INFO') {
    this.name = name;
    this.level = LEVELS[level] ?? LEVELS.INFO;
  }

  /** @param {string} level */
  setLevel(level) {
    this.level = LEVELS[level] ?? LEVELS.INFO;
  }

  _log(level, args) {
    if (LEVELS[level] < this.level) return;
    const ts = new Date().toISOString();
    const prefix = `[${ts}] [${level.padEnd(5)}] [${this.name}]`;
    const method = level === 'ERROR' ? 'error' :
                   level === 'WARN' ? 'warn' :
                   level === 'DEBUG' ? 'debug' : 'log';
    console[method](prefix, ...args);
  }

  trace(...args) { this._log('TRACE', args); }
  debug(...args) { this._log('DEBUG', args); }
  info(...args)  { this._log('INFO', args); }
  warn(...args)  { this._log('WARN', args); }
  error(...args) { this._log('ERROR', args); }
}

/** Default singleton logger. */
export const logger = new Logger('prose', 'INFO');
