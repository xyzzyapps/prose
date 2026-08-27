/**
 * lexer/Lexer.js - Tokenizer for the Prose language.
 *
 * Handles:
 *   - Indentation-based blocks (INDENT/DEDENT tokens, Python-style)
 *   - Sentence termination (PERIOD)
 *   - Double-quoted strings with escapes
 *   - Heredocs (multiline text blocks)
 *   - Numbers (integers and floats)
 *   - Words, punctuation, comments
 */

import { Token, TokenType } from './Token.js';
import { SyntaxError } from '../core/Errors.js';
import { Logger } from '../core/Logger.js';

const logger = new Logger('lexer');

export class Lexer {
  /**
   * @param {string} source  the complete source text
   * @param {string} [filename] optional filename for error messages
   */
  constructor(source, filename = '<input>') {
    this.source = source;
    this.filename = filename;
    /** @type {Token[]} */
    this.tokens = [];
    this.pos = 0;          // current character index
    this.line = 1;         // 1-based
    this.column = 1;       // 1-based
    this.indentStack = [0]; // stack of indentation levels
    this.startOfLine = true; // are we at the start of a line?
    this.pendingNewline = false;
  }

  /**
   * Tokenize the entire source.
   * @returns {Token[]}
   */
  tokenize() {
    logger.debug(`Tokenizing ${this.source.length} chars from ${this.filename}`);

    // Skip leading blank lines
    while (this.pos < this.source.length && this._isNewline(this.source[this.pos])) {
      this._advanceLine();
    }

    while (this.pos < this.source.length) {
      this._tokenizeLine();
    }

    // Dedent remaining levels at EOF
    while (this.indentStack.length > 1) {
      this.indentStack.pop();
      this._emit(TokenType.DEDENT, '');
    }

    this._emit(TokenType.EOF, '');
    logger.debug(`Produced ${this.tokens.length} tokens`);
    return this.tokens;
  }

  // -----------------------------------------------------------------------
  // Line-level tokenization
  // -----------------------------------------------------------------------

  _tokenizeLine() {
    // Skip blank lines (but emit NEWLINE if we had content before)
    if (this._isNewline(this.source[this.pos])) {
      if (this.pendingNewline) {
        this._emit(TokenType.NEWLINE, '\n');
        this.pendingNewline = false;
      }
      this._advanceLine();
      return;
    }

    // Check indentation level
    if (this.startOfLine) {
      const indent = this._readIndent();
      this.startOfLine = false;

      if (indent > this.indentStack[this.indentStack.length - 1]) {
        this.indentStack.push(indent);
        this._emit(TokenType.INDENT, '');
      } else if (indent < this.indentStack[this.indentStack.length - 1]) {
        while (indent < this.indentStack[this.indentStack.length - 1]) {
          this.indentStack.pop();
          this._emit(TokenType.DEDENT, '');
        }
        if (indent !== this.indentStack[this.indentStack.length - 1]) {
          throw new SyntaxError(
            `Inconsistent indentation (expected ${this.indentStack[this.indentStack.length - 1]}, got ${indent})`,
            this.line, this.column
          );
        }
      }
    }

    // Tokenize tokens on this line
    let atLineContentStart = true;
    while (this.pos < this.source.length && !this._isNewline(this.source[this.pos])) {
      // Skip whitespace (spaces/tabs within a line, not at start)
      if (this.source[this.pos] === ' ' || this.source[this.pos] === '\t') {
        this._advance();
        continue;
      }

      // Markdown bullets at the start of line content: - * +
      if (atLineContentStart &&
          (this.source[this.pos] === '-' || this.source[this.pos] === '*' || this.source[this.pos] === '+')) {
        const next = this.source[this.pos + 1];
        if (next === ' ' || next === '\t') {
          this._advance(); // marker
          this._emit(TokenType.BULLET, '-');
          atLineContentStart = false;
          continue;
        }
      }
      atLineContentStart = false;

      // Skip comments (# to end of line)
      if (this.source[this.pos] === '#') {
        this._skipComment();
        break;
      }

      // Brace-delimited raw text block { ... } for DSL embedding
      if (this.source[this.pos] === '{') {
        this._readBraceBlock();
        continue;
      }

      // Check for possessive 's
      if (this.pos + 1 < this.source.length &&
          this.source[this.pos] === "'" &&
          this.source[this.pos + 1] === 's') {
        this._advance(); // skip '
        this._advance(); // skip s
        this._emit(TokenType.POSSESSIVE, "'s");
        continue;
      }

      // Double-quoted string
      if (this.source[this.pos] === '"') {
        this._readString();
        continue;
      }

      // Backtick-quoted shell command: `echo hello`
      if (this.source[this.pos] === '`') {
        this._readCommand();
        continue;
      }

      // Parentheses
      if (this.source[this.pos] === '(') {
        this._advance();
        this._emit(TokenType.LPAREN, '(');
        continue;
      }
      if (this.source[this.pos] === ')') {
        this._advance();
        this._emit(TokenType.RPAREN, ')');
        continue;
      }

      // Colon
      if (this.source[this.pos] === ':') {
        this._advance();
        this._emit(TokenType.COLON, ':');
        continue;
      }

      // Comma
      if (this.source[this.pos] === ',') {
        this._advance();
        this._emit(TokenType.COMMA, ',');
        continue;
      }

      // Period: method call if immediately followed by a letter; else sentence end
      if (this.source[this.pos] === '.') {
        const next = this.pos + 1 < this.source.length ? this.source[this.pos + 1] : '';
        if (next && this._isWordStart(next)) {
          this._advance();
          this._emit(TokenType.DOT, '.');
          continue;
        }
        this._advance();
        this._emit(TokenType.PERIOD, '.');
        this.pendingNewline = true;
        continue;
      }

      // Number (including decimals)
      if (this._isDigit(this.source[this.pos])) {
        this._readNumber();
        continue;
      }

      // Word (identifiers, keywords)
      if (this._isWordStart(this.source[this.pos])) {
        // Check if this word is "exists" followed by a heredoc declaration
        const savedPos = this.pos;
        const savedLine = this.line;
        const savedCol = this.column;
        const word = this._readRawWord();

        if (word.toLowerCase() === 'exists') {
          // Check if followed by " as follows until"
          this._advanceWhitespace();
          if (this._sourceMatch('as follows until')) {
            // Emit WORD("exists") first
            this._emit(TokenType.WORD, word, savedLine, savedCol);

            // Skip " as follows until"
            // (already consumed by _sourceMatch)

            // Read the terminator
            this._advanceWhitespace();
            const termStartLine = this.line;
            const termStartCol = this.column;
            let terminator = '';
            while (this.pos < this.source.length &&
                   this._isWordChar(this.source[this.pos])) {
              terminator += this.source[this.pos];
              this._advance();
            }

            // Skip optional colon
            if (this.pos < this.source.length && this.source[this.pos] === ':') {
              this._advance();
            }

            // Skip rest of the header line
            this._skipToEndOfLine();
            if (this.pos < this.source.length && this._isNewline(this.source[this.pos])) {
              this._advanceLine();
            }

            // Read heredoc content until the terminator
            let value = '';
            while (this.pos < this.source.length) {
              // Check if this line starts with the terminator
              const lineStartPos = this.pos;
              const lineStartLine = this.line;

              // Read the first word of this line
              let firstWord = '';
              let wp = this.pos;
              while (wp < this.source.length && this._isWordChar(this.source[wp])) {
                firstWord += this.source[wp];
                wp++;
              }

              if (firstWord === terminator) {
                // Check that the terminator is on its own (followed by whitespace or newline or EOF)
                const afterPos = wp;
                if (afterPos >= this.source.length ||
                    this._isNewline(this.source[afterPos]) ||
                    this.source[afterPos] === ' ' ||
                    this.source[afterPos] === '\t') {
                  // Consume the terminator line
                  this.pos = afterPos;
                  this._skipToEndOfLine();
                  if (this.pos < this.source.length && this._isNewline(this.source[this.pos])) {
                    this._advanceLine();
                  }
                  break;
                }
              }

              // Read one line of content
              let lineContent = '';
              while (this.pos < this.source.length && !this._isNewline(this.source[this.pos])) {
                lineContent += this.source[this.pos];
                this._advance();
              }

              // Trim trailing whitespace but preserve intentional formatting
              if (value.length > 0) value += '\n';
              value += lineContent;

              // Move past newline
              if (this.pos < this.source.length && this._isNewline(this.source[this.pos])) {
                this._advanceLine();
              } else if (this.pos >= this.source.length) {
                break;
              }
            }

            this._emit(TokenType.HEREDOC, value, termStartLine, termStartCol);
            this.pendingNewline = true;
            continue;
          } else {
            // Not a heredoc, restore position and emit the word normally
            this.pos = savedPos;
            this.line = savedLine;
            this.column = savedCol;
            // We already read the word, just emit it
            this.pos += word.length;
            this.column += word.length;
            this._emit(TokenType.WORD, word, savedLine, savedCol);
            continue;
          }
        } else {
          // Not "exists", emit the word normally
          // Position is already advanced by _readRawWord
          this._emit(TokenType.WORD, word, savedLine, savedCol);
          continue;
        }
      }

      // Unknown character
      throw new SyntaxError(
        `Unexpected character '${this.source[this.pos]}'`,
        this.line, this.column
      );
    }

    // End of line reached — always emit NEWLINE so period-less markdown lists
    // and English sentences terminate.
    if (this.pos >= this.source.length || this._isNewline(this.source[this.pos])) {
      this._emit(TokenType.NEWLINE, '\n');
      this.pendingNewline = false;
      if (this.pos < this.source.length) {
        this._advanceLine();
        this.startOfLine = true;
      }
    }
  }

  // -----------------------------------------------------------------------
  // Readers for specific token types
  // -----------------------------------------------------------------------

  _readIndent() {
    let spaces = 0;
    const startPos = this.pos;
    while (this.pos < this.source.length &&
           (this.source[this.pos] === ' ' || this.source[this.pos] === '\t')) {
      if (this.source[this.pos] === '\t') {
        spaces += 4; // tabs = 4 spaces
      } else {
        spaces += 1;
      }
      this._advance();
    }
    // If this line is blank (only whitespace then newline), reset
    if (this.pos < this.source.length && this._isNewline(this.source[this.pos])) {
      this.pos = startPos;
      return 0; // blank line
    }
    return spaces;
  }

  /** Backtick-quoted OS command. Escapes: \` \\ */
  _readCommand() {
    const startLine = this.line;
    const startCol = this.column;
    this._advance(); // skip opening `
    let value = '';
    while (this.pos < this.source.length) {
      const ch = this.source[this.pos];
      if (ch === '`') {
        this._advance();
        this._emit(TokenType.COMMAND, value, startLine, startCol);
        return;
      }
      if (this._isNewline(ch)) {
        throw new SyntaxError('Unterminated command (`)', startLine, startCol);
      }
      if (ch === '\\' && this.pos + 1 < this.source.length) {
        this._advance();
        const escaped = this.source[this.pos];
        value += escaped === '`' || escaped === '\\' ? escaped : '\\' + escaped;
        this._advance();
        continue;
      }
      value += ch;
      this._advance();
    }
    throw new SyntaxError('Unterminated command (`)', startLine, startCol);
  }

  _readString() {
    const startLine = this.line;
    const startCol = this.column;
    this._advance(); // skip opening "

    let hasInterp = false;
    let value = '';
    const segments = []; // [{t:'text',v:'...'} | {t:'var',n:'Name'}]

    while (this.pos < this.source.length) {
      const ch = this.source[this.pos];

      if (ch === '"') {
        this._advance(); // skip closing "
        if (hasInterp) {
          if (value.length > 0) segments.push({ t: 'text', v: value });
          this._emit(TokenType.INTERPOLATED, JSON.stringify(segments), startLine, startCol);
        } else {
          this._emit(TokenType.TEXT, value, startLine, startCol);
        }
        return;
      }

      // Check for ${variable} interpolation
      if (ch === '$' && this.pos + 1 < this.source.length && this.source[this.pos + 1] === '{') {
        hasInterp = true;
        if (value.length > 0) {
          segments.push({ t: 'text', v: value });
          value = '';
        }
        this._advance(); // skip $
        this._advance(); // skip {
        // Read variable name until }
        let varName = '';
        while (this.pos < this.source.length && this.source[this.pos] !== '}') {
          if (this._isNewline(this.source[this.pos])) {
            throw new SyntaxError('Unterminated interpolation', startLine, startCol);
          }
          varName += this.source[this.pos];
          this._advance();
        }
        if (this.pos < this.source.length) {
          this._advance(); // skip }
        }
        segments.push({ t: 'var', n: varName.trim() });
        continue;
      }

      if (ch === '\\' && this.pos + 1 < this.source.length) {
        this._advance();
        const escaped = this.source[this.pos];
        switch (escaped) {
          case 'n': value += '\n'; break;
          case 't': value += '\t'; break;
          case 'r': value += '\r'; break;
          case '"': value += '"'; break;
          case '\\': value += '\\'; break;
          case '$': value += '$'; break;
          default: value += escaped; break;
        }
        this._advance();
      } else if (this._isNewline(ch)) {
        throw new SyntaxError('Unterminated string literal', startLine, startCol);
      } else {
        value += ch;
        this._advance();
      }
    }
    throw new SyntaxError('Unterminated string literal', startLine, startCol);
  }

  _readHeredoc() {
    // We've matched "exists as follows until"
    // Now read the terminator word
    this._advanceWhitespace();
    const startLine = this.line;
    const startCol = this.column;

    // Read the terminator word
    let terminator = '';
    while (this.pos < this.source.length &&
           this._isWordChar(this.source[this.pos]) &&
           this.source[this.pos] !== ':') {
      terminator += this.source[this.pos];
      this._advance();
    }

    // Skip the colon after terminator
    if (this.pos < this.source.length && this.source[this.pos] === ':') {
      this._advance();
    }

    // Skip rest of this line (the header line)
    this._skipToEndOfLine();

    // Now read until we hit a line starting with terminator
    let value = '';
    while (this.pos < this.source.length) {
      // Check if this line starts with the terminator
      const lineStart = this.pos;
      let matched = true;
      for (let i = 0; i < terminator.length; i++) {
        if (this.pos + i >= this.source.length ||
            this.source[this.pos + i] !== terminator[i]) {
          matched = false;
          break;
        }
      }
      // After terminator, must be end of line or whitespace + end of line
      if (matched) {
        const after = this.pos + terminator.length;
        if (after >= this.source.length ||
            this._isNewline(this.source[after]) ||
            this.source[after] === ' ' ||
            this.source[after] === '\t') {
          // Check that it's on its own line (only whitespace before it on this line)
          // Actually the spec shows the terminator at the start of its own line
          // Let's be flexible: terminator can appear anywhere on a line by itself
          // Skip the terminator and anything after it on this line
          this.pos += terminator.length;
          this._skipToEndOfLine();
          // Consume the newline after terminator
          if (this.pos < this.source.length && this._isNewline(this.source[this.pos])) {
            this._advanceLine();
          }
          break;
        }
      }

      // Read one line of heredoc content
      const lineContent = this._readLineContent();
      if (value.length > 0) value += '\n';
      value += lineContent;

      // Move past the newline
      if (this.pos < this.source.length && this._isNewline(this.source[this.pos])) {
        this._advanceLine();
      } else if (this.pos >= this.source.length) {
        break; // EOF
      }
    }

    this._emit(TokenType.HEREDOC, value, startLine, startCol);
  }

  _readNumber() {
    const startCol = this.column;
    let value = '';
    while (this.pos < this.source.length && this._isDigit(this.source[this.pos])) {
      value += this.source[this.pos];
      this._advance();
    }
    // Decimal part
    if (this.pos < this.source.length && this.source[this.pos] === '.') {
      // Peek ahead to make sure this isn't a sentence-ending period
      // A decimal period is followed by a digit; sentence period is followed
      // by whitespace, newline, or EOF.
      if (this.pos + 1 < this.source.length && this._isDigit(this.source[this.pos + 1])) {
        value += '.';
        this._advance();
        while (this.pos < this.source.length && this._isDigit(this.source[this.pos])) {
          value += this.source[this.pos];
          this._advance();
        }
      }
    }
    this._emit(TokenType.NUMBER, value, this.line, startCol);
  }

  _readWord() {
    const startCol = this.column;
    let value = '';
    while (this.pos < this.source.length && this._isWordChar(this.source[this.pos])) {
      value += this.source[this.pos];
      this._advance();
    }
    this._emit(TokenType.WORD, value, this.line, startCol);
  }

  /**
   * Read the rest of the current line (not including the newline).
   * @returns {string}
   */
  _readLineContent() {
    let content = '';
    while (this.pos < this.source.length && !this._isNewline(this.source[this.pos])) {
      content += this.source[this.pos];
      this._advance();
    }
    return content;
  }

  _skipComment() {
    while (this.pos < this.source.length && !this._isNewline(this.source[this.pos])) {
      this._advance();
    }
  }

  _skipToEndOfLine() {
    while (this.pos < this.source.length && !this._isNewline(this.source[this.pos])) {
      this._advance();
    }
  }

  /**
   * Read a brace-delimited raw text block { ... }.
   * Handles balanced braces for nested content (e.g. DSLs containing braces).
   * The content between the outer { } is captured verbatim including newlines.
   */
  _readBraceBlock() {
    const startLine = this.line;
    const startCol = this.column;

    this._advance(); // consume opening {

    let depth = 1;
    let value = '';
    const startPos = this.pos;

    while (this.pos < this.source.length && depth > 0) {
      const ch = this.source[this.pos];

      if (ch === '{') {
        depth++;
        value += ch;
        this._advance();
      } else if (ch === '}') {
        depth--;
        if (depth > 0) {
          value += ch;
        }
        this._advance();
      } else if (ch === '\\' && this.pos + 1 < this.source.length) {
        // Escape sequence: \{ and \} are literal braces
        const next = this.source[this.pos + 1];
        if (next === '{' || next === '}') {
          value += next;
          this._advance(); // skip backslash
          this._advance(); // skip brace
        } else {
          value += ch;
          this._advance();
        }
      } else {
        value += ch;
        this._advance();
      }
    }

    if (depth > 0) {
      throw new SyntaxError(
        'Unterminated brace block (missing closing })',
        startLine, startCol
      );
    }

    this._emit(TokenType.BRACEBLOCK, value, startLine, startCol);
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  _emit(type, value, line, column) {
    this.tokens.push(new Token(type, value, line ?? this.line, column ?? this.column));
  }

  _advance() {
    if (this.pos < this.source.length) {
      if (this.source[this.pos] === '\n') {
        this.line++;
        this.column = 1;
      } else {
        this.column++;
      }
      this.pos++;
    }
  }

  _advanceLine() {
    while (this.pos < this.source.length && this._isNewline(this.source[this.pos])) {
      if (this.source[this.pos] === '\r') {
        this.pos++;
        if (this.pos < this.source.length && this.source[this.pos] === '\n') {
          this.pos++;
        }
        this.line++;
        this.column = 1;
      } else if (this.source[this.pos] === '\n') {
        this.pos++;
        this.line++;
        this.column = 1;
      }
    }
  }

  _advanceWhitespace() {
    while (this.pos < this.source.length &&
           (this.source[this.pos] === ' ' || this.source[this.pos] === '\t')) {
      this._advance();
    }
  }

  /**
   * Read a raw word from the source without emitting a token.
   * Advances position past the word. Returns the word string.
   * @returns {string}
   */
  _readRawWord() {
    let value = '';
    while (this.pos < this.source.length && this._isWordChar(this.source[this.pos])) {
      value += this.source[this.pos];
      this._advance();
    }
    return value;
  }

  /**
   * Check if the source at the current position matches a string
   * (case-insensitive). Advances position on match. Unlike _match,
   * this does NOT check word boundaries (used for mid-phrase matching).
   * @param {string} str
   * @returns {boolean}
   */
  _sourceMatch(str) {
    const lower = str.toLowerCase();
    for (let i = 0; i < lower.length; i++) {
      if (this.pos + i >= this.source.length) return false;
      if (this.source[this.pos + i].toLowerCase() !== lower[i]) return false;
    }
    // Advance past the matched string
    for (let j = 0; j < str.length; j++) this._advance();
    return true;
  }

  /**
   * Check if the next characters match a string (case-insensitive).
   * Only advances position if it matches.
   */
  _match(str) {
    const lower = str.toLowerCase();
    let i = 0;
    for (i = 0; i < lower.length; i++) {
      if (this.pos + i >= this.source.length) return false;
      if (this.source[this.pos + i].toLowerCase() !== lower[i]) return false;
    }
    // Make sure it's a word boundary
    if (this.pos + i < this.source.length && this._isWordChar(this.source[this.pos + i])) {
      return false;
    }
    // Advance past the matched string
    for (let j = 0; j < str.length; j++) this._advance();
    return true;
  }

  _isDigit(ch) { return ch >= '0' && ch <= '9'; }
  _isAlpha(ch) { return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_'; }
  _isWordStart(ch) { return this._isAlpha(ch); }
  _isWordChar(ch) { return this._isAlpha(ch) || this._isDigit(ch); }
  _isNewline(ch) { return ch === '\n' || ch === '\r'; }
}
