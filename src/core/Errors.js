/**
 * core/Errors.js - Error types for the Prose interpreter.
 */

/**
 * Base error class for Prose runtime errors.
 */
export class ProseError extends Error {
  /**
   * @param {string} message
   * @param {number} [line] source line number (1-based)
   * @param {number} [column] source column (1-based)
   */
  constructor(message, line = 0, column = 0) {
    super(message);
    this.name = 'ProseError';
    this.line = line;
    this.column = column;
  }

  toString() {
    if (this.line > 0) {
      return `Error at line ${this.line}, column ${this.column}: ${this.message}`;
    }
    return `Error: ${this.message}`;
  }
}

/**
 * Syntax error during parsing.
 */
export class SyntaxError extends ProseError {
  constructor(message, line = 0, column = 0) {
    super(message, line, column);
    this.name = 'SyntaxError';
  }
}

/**
 * Runtime error during execution.
 */
export class RuntimeError extends ProseError {
  constructor(message, line = 0, column = 0) {
    super(message, line, column);
    this.name = 'RuntimeError';
  }
}

/**
 * Name resolution error (variable not found, etc.).
 */
export class NameError extends ProseError {
  constructor(message, line = 0, column = 0) {
    super(message, line, column);
    this.name = 'NameError';
  }
}

/**
 * Type mismatch error.
 */
export class TypeError extends ProseError {
  constructor(message, line = 0, column = 0) {
    super(message, line, column);
    this.name = 'TypeError';
  }
}
