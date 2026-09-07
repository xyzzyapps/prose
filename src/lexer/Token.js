/**
 * lexer/Token.js - Token type definitions for the Prose lexer.
 */

export const TokenType = {
  // Structural
  NEWLINE: 'NEWLINE',
  INDENT: 'INDENT',
  DEDENT: 'DEDENT',
  EOF: 'EOF',

  // Punctuation
  PERIOD: 'PERIOD',       // .
  COMMA: 'COMMA',         // ,
  LPAREN: 'LPAREN',       // (
  RPAREN: 'RPAREN',       // )
  LBRACE: 'LBRACE',       // {
  RBRACE: 'RBRACE',       // }
  POSSESSIVE: 'POSSESSIVE', // 's
  DOT: 'DOT',               // method call: Entity.verb
  BULLET: 'BULLET',         // markdown list marker -, *, +
  OPERATOR: 'OPERATOR',     // + - * / > < >= <= == != !
  LBRACKET: 'LBRACKET',     // [
  RBRACKET: 'RBRACKET',     // ]

  // Literals
  NUMBER: 'NUMBER',       // 42, 3.14
  TEXT: 'TEXT',           // "hello"
  COMMAND: 'COMMAND',     // `echo hello`  (shell command)
  HEREDOC: 'HEREDOC',     // multiline text block
  BRACEBLOCK: 'BRACEBLOCK', // raw text between { } (for DSLs)
  INTERPOLATED: 'INTERPOLATED', // "Hello, ${name}!" with embedded variables

  // Identifiers
  WORD: 'WORD',           // identifiers, keywords, verbs
};

/**
 * ARTICLES that are semantically ignored by the parser.
 * The lexer produces WORD tokens for them, but the parser
 * may skip them during pattern matching.
 */
export const ARTICLES = new Set(['a', 'an', 'the']);

/**
 * True if `name` may be used as a variable identifier.
 * Must start with a lowercase letter (camelCase, snake_case, kebab-case)
 * or `_` (`_index`, `_`). Multi-word alias phrases are not checked here.
 */
export function isSmallVariableName(name) {
  if (!name) return false;
  const c = name[0];
  if (c === '_') return true;
  return c === c.toLowerCase() && c !== c.toUpperCase();
}

/** Suggest the small-case form of a capitalized variable (`Age` → `age`). */
export function smallVariableHint(name) {
  if (!name) return name;
  return name[0].toLowerCase() + name.slice(1);
}

export class Token {
  /**
   * @param {string} type    one of TokenType
   * @param {string} value   the lexeme text
   * @param {number} line    1-based line number
   * @param {number} column  1-based column number
   */
  constructor(type, value, line, column) {
    this.type = type;
    this.value = value;
    this.line = line;
    this.column = column;
  }

  toString() {
    return `Token(${this.type}, "${this.value}", ${this.line}:${this.column})`;
  }
}
