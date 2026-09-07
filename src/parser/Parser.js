/**
 * parser/Parser.js - Recursive descent parser for the Prose language.
 *
 * Strategy: The parser uses a pattern-matching approach where each
 * sentence shape is tried against the token stream. Articles (a, an, the)
 * and certain noise words are skipped during matching. The parser handles
 * indentation-sensitive blocks via consumeBlock().
 */

import { TokenType, ARTICLES, isSmallVariableName, smallVariableHint } from '../lexer/Token.js';
import {
  Program,
  VariableDeclaration, Assignment, PrintStmt,
  IfStmt, WhileStmt, ForEveryStmt,
  VerbDefinition, VerbCall,
  LabelStmt, JumpStmt, ExecuteStmt,
  DictionarySetStmt, ListAddStmt, QueryStmt,
  WheneverStmt, MutationStmt, ResultStmt, ExpressionStmt,
  UsingStmt, ShellStmt, ShellExpr,
  TryStmt, ReadFileStmt, WriteFileStmt, JsonParseExpr, LogicalExpr,
  EnvVarExpr, FetchExpr, RangeForStmt, PipeShellStmt, IncludeStmt,
  MapExpr, FilterExpr, SumExpr, AfterStmt, EveryStmt, DeleteFileStmt, ListFilesExpr,
  MkdirStmt, ChdirStmt, CopyFileStmt, RenameFileStmt, TouchFileStmt, AppendFileStmt,
  SequenceStmt, AliasStmt, KeepStmt, WithStmt, NopStmt,
  CorefExpr, OfPropertyExpr, DictLiteralExpr, KeepExpr,
  UnaryExpr, IndexExpr, FieldAccessExpr, BreakStmt, ContinueStmt,
  LiteralExpr, VariableExpr, PropertyAccessExpr,
  BinaryOpExpr, CallExpr, DictionaryAccessExpr,
} from './AST.js';
import { SyntaxError } from '../core/Errors.js';
import { Logger } from '../core/Logger.js';

const logger = new Logger('parser');

/**
 * Noise words that are skipped during pattern matching.
 * These provide readability but carry no semantic weight.
 */
/**
 * Noise words that are skipped during pattern matching.
 * These are purely decorative/filler words that carry no semantic weight.
 * IMPORTANT: Do NOT include words that are grammatically required for parsing
 * (like "is", "named", "by", "to", etc.) - those are handled explicitly.
 */
const NOISE = new Set([
  'a', 'an',
]);

const ROLE_FILLERS = new Set(['using', 'with', 'into', 'from', 'by', 'as', 'to', 'and']);
const BUILTIN_TYPES = new Set(['number', 'text', 'list', 'dictionary', 'account', 'system']);

/** Types are builtins or Capitalized names (Person, Client), not dummy params like N. */
function isTypeName(name) {
  if (!name) return false;
  if (BUILTIN_TYPES.has(name.toLowerCase())) return true;
  return name.length >= 2 && name[0] === name[0].toUpperCase() && name[0] !== name[0].toLowerCase();
}
const ANAPHOR_WORDS = new Set(['it', 'there', 'here', 'those', 'others', '_']);

/** Capitalized words that open a statement, so a header can omit `:`. */
const BODY_STARTERS = new Set([
  'print', 'if', 'otherwise', 'otherwise-if', 'while',
  'for', 'for-every', 'to', 'result', 'set', 'increase', 'lower', 'decrease',
  'label', 'jump', 'try', 'catch', 'keep', 'call', 'using', 'include',
  'whenever', 'after', 'every', 'read', 'write', 'delete', 'make', 'change',
  'copy', 'rename', 'touch', 'append', 'run', 'execute', 'break', 'continue',
  'find', 'find-every', 'inside', 'with', 'end',
]);

const PHRASE_STOP = new Set([
  'is', 'to', 'by', 'of', 'then', 'where', 'and', 'or', 'followed', 'plus', 'minus',
  'times', 'divided', 'using', 'with', 'into', 'from', 'as', 'named', 'exists',
  'maps', 'contains', 'print', 'if', 'while', 'for', 'call', 'set', 'keep',
  'end', 'the', 'a', 'an',
]);

export class Parser {
  /**
   * @param {import('../lexer/Token.js').Token[]} tokens
   */
  constructor(tokens, options = {}) {
    this.tokens = tokens;
    this.pos = 0;
    this.recover = options.recover === true;
  }

  /** @returns {import('../lexer/Token.js').Token} */
  _current() {
    return this.pos < this.tokens.length ? this.tokens[this.pos] : this.tokens[this.tokens.length - 1];
  }

  _peek(offset = 0) {
    const idx = this.pos + offset;
    return idx < this.tokens.length ? this.tokens[idx] : null;
  }

  _advance() {
    const tok = this._current();
    if (this.pos < this.tokens.length) this.pos++;
    return tok;
  }

  /** Check if current token matches type and optional value */
  _check(type, value = null) {
    const tok = this._current();
    if (tok.type !== type) return false;
    if (value !== null && tok.value.toLowerCase() !== value.toLowerCase()) return false;
    return true;
  }

  /** Match and consume if current token matches; otherwise error */
  _expect(type, value = null) {
    if (!this._check(type, value)) {
      const tok = this._current();
      const expected = value ? `${type}("${value}")` : type;
      throw new SyntaxError(
        `Expected ${expected} but got ${tok.type}("${tok.value}")`,
        tok.line, tok.column
      );
    }
    return this._advance();
  }

  /** Match and consume if current token matches; otherwise return null */
  _match(type, value = null) {
    if (this._check(type, value)) {
      return this._advance();
    }
    return null;
  }

  /** True if the word starts with a Unicode uppercase letter. */
  _isCapitalized(s) {
    if (!s) return false;
    const c = s[0];
    return c !== c.toLowerCase();
  }

  /**
   * Variables must start with a lowercase letter (`score`, `myScore`, `my-score`).
   * Multi-word alias phrases (`Current Client`) are not variable identifiers.
   * Throws a committed SyntaxError so statement-pattern backtracking does not swallow it.
   */
  _assertVarName(name, tok) {
    if (!name || name.includes(' ')) return;
    if (isSmallVariableName(name)) return;
    const err = new SyntaxError(
      `Variable names start with a lowercase letter (use "${smallVariableHint(name)}")`,
      tok.line, tok.column
    );
    err.committed = true;
    throw err;
  }

  /**
   * Statement/clause keyword: must start with a capital and match `canonical`
   * case-insensitively (`Print`, not `print`).
   */
  _matchKw(canonical) {
    const tok = this._current();
    if (tok.type !== TokenType.WORD) return null;
    if (tok.value.toLowerCase() !== canonical.toLowerCase()) return null;
    if (!this._isCapitalized(tok.value)) return null;
    return this._advance();
  }

  /** Skip noise words and articles without consuming structural tokens */
  _skipNoise() {
    while (this._current().type === TokenType.WORD &&
           NOISE.has(this._current().value.toLowerCase())) {
      this._advance();
    }
  }

  _isBodyStarter() {
    if (!this._check(TokenType.WORD)) return false;
    if (!this._isCapitalized(this._current().value)) return false;
    return BODY_STARTERS.has(this._current().value.toLowerCase());
  }

  _atStmtEnd() {
    const t = this._current().type;
    return t === TokenType.PERIOD || t === TokenType.NEWLINE || t === TokenType.DEDENT ||
           t === TokenType.EOF || t === TokenType.RPAREN ||
           this._isBodyStarter();
  }

  /** Sentence terminator: period, end of line / block, or the next statement. */
  _expectEnd() {
    if (this._check(TokenType.PERIOD)) {
      this._advance();
      return;
    }
    if (this._atStmtEnd()) return;
    const tok = this._current();
    throw new SyntaxError(
      `Expected "." but got ${tok.type}("${tok.value}")`,
      tok.line, tok.column
    );
  }

  _flattenStmt(stmt, out) {
    if (stmt instanceof SequenceStmt) {
      for (const s of stmt.statements) this._flattenStmt(s, out);
    } else if (stmt) {
      out.push(stmt);
    }
  }

  // ===================================================================
  // Top-level parsing
  // ===================================================================

  /**
   * Parse the full program.
   * @returns {Program}
   */
  parse() {
    logger.debug('Starting parse');
    const statements = [];

    while (this.pos < this.tokens.length &&
           this._current().type !== TokenType.EOF) {
      // Skip blank NEWLINEs between statements
      while (this._check(TokenType.NEWLINE)) {
        this._advance();
      }
      if (this._current().type === TokenType.EOF) break;

      try {
        const stmt = this.parseStatement();
        if (stmt) {
          this._flattenStmt(stmt, statements);
        }
      } catch (e) {
        if (e instanceof SyntaxError && this.recover) {
          logger.warn(`Parse error: ${e.message} — attempting recovery`);
          while (this.pos < this.tokens.length &&
                 !this._check(TokenType.PERIOD) &&
                 !this._check(TokenType.NEWLINE) &&
                 !this._check(TokenType.DEDENT) &&
                 !this._check(TokenType.EOF)) {
            this._advance();
          }
          if (this._check(TokenType.PERIOD) || this._check(TokenType.NEWLINE)) this._advance();
        } else {
          throw e;
        }
      }
    }

    logger.debug(`Parsed ${statements.length} statements`);
    return new Program(statements);
  }

  // ===================================================================
  // Statement parsing
  // ===================================================================

  /**
   * Parse a single statement. Tries each pattern in order.
   * @returns {Stmt|null}
   */
  parseStatement() {
    while (this._check(TokenType.BULLET)) this._advance();
    const savedPos = this.pos;

    // Try each statement pattern in order
    const patterns = [
      () => this._parseNumberedItem(),
      () => this._parseBareCommand(),
      () => this._parseNopEnd(),
      () => this._parseBreakContinue(),
      () => this._parseAliasCall(),
      () => this._parseKeepStmt(),
      () => this._parseWithStmt(),
      () => this._parseLabel(),
      () => this._parseWhenever(),
      () => this._parseAfter(),          // After N seconds:
      () => this._parseEvery(),          // Every N seconds:
      () => this._parseTry(),             // Try: ... Catch: ...
      () => this._parseIf(),
      () => this._parseWhile(),
      () => this._parseForEvery(),
      () => this._parseRangeFor(),       // For every Number from X to Y:
      () => this._parseVerbDefinition(),
      () => this._parseJump(),
      () => this._parseUsing(),          // Using [verb] parse { ... }
      () => this._parseShellStmt(),      // Execute the shell command "..."
      () => this._parsePipeShell(),      // Run "..." and pipe to "..."
      () => this._parseExecute(),
      () => this._parseReadFile(),       // Read the file "..." into x.
      () => this._parseWriteFile(),      // Write ... to the file "...".
      () => this._parseInclude(),        // Include "file.prose".
      () => this._parseDeleteFile(),      // Delete the file "path".
      () => this._parseMkdir(),           // Make the directory "path".
      () => this._parseChdir(),           // Change directory to "path".
      () => this._parseCopyFile(),        // Copy the file A to B.
      () => this._parseRenameFile(),      // Rename the file A to B.
      () => this._parseTouchFile(),       // Touch the file "path".
      () => this._parseAppendFile(),      // Append expr to the file "path".
      () => this._parseRunCommand(),      // Run the command "...".
      () => this._parseVariableDecl(),
      () => this._parseDictionarySet(),
      () => this._parseQuery(),
      () => this._parseListAdd(),
      () => this._parseResult(),
      () => this._parseMutation(),
      () => this._parsePrint(),
      () => this._parseAssignment(),
      () => this._parseVerbCall(),
    ];

    for (const pattern of patterns) {
      this.pos = savedPos;
      try {
        const stmt = pattern.call(this);
        if (stmt !== null) {
          return stmt;
        }
      } catch (e) {
        if (e instanceof SyntaxError && e.committed) throw e;
        // This pattern didn't match, try next
        continue;
      }
    }

    // No pattern matched
    const tok = this._current();
    throw new SyntaxError(
      `Could not parse statement starting with "${tok.value}"`,
      tok.line, tok.column
    );
  }

  /**
   * Consume a block: indented statements, or one statement on the same line.
   * `If x > 5 Print "yes"` and the indented form are both valid. No colon.
   * @returns {Stmt[]}
   */
  consumeBlock() {
    const startTok = this._current();
    while (this._check(TokenType.NEWLINE)) {
      this._advance();
    }

    if (!this._check(TokenType.INDENT)) {
      if (this._atStmtEnd() && !this._isBodyStarter()) {
        const err = new SyntaxError(
          'Expected a statement in the block',
          startTok.line, startTok.column
        );
        err.committed = true;
        throw err;
      }
      try {
        const stmt = this.parseStatement();
        return stmt ? [stmt] : [];
      } catch (e) {
        if (e instanceof SyntaxError) e.committed = true;
        throw e;
      }
    }

    this._advance(); // consume INDENT
    const statements = [];

    while (this.pos < this.tokens.length &&
           this._current().type !== TokenType.DEDENT &&
           this._current().type !== TokenType.EOF) {
      // Skip blank newlines
      while (this._check(TokenType.NEWLINE)) {
        this._advance();
      }
      if (this._current().type === TokenType.DEDENT ||
          this._current().type === TokenType.EOF) break;

      statements.push(this.parseStatement());
    }

    if (this._check(TokenType.DEDENT)) {
      this._advance();
    }

    return statements;
  }

  /**
   * Parse inline expression up to PERIOD or other delimiter.
   * This is the "sub-sentence" inside parenthesized side-notes.
   * Returns a Stmt or Expr that can be evaluated.
   * @returns {Stmt}
   */
  parseInlineStatement() {
    const savedPos = this.pos;

    // Try verb call first (e.g., "uppercase \"hello\"")
    const stmt = this._parseVerbCall();
    if (stmt) return stmt;

    this.pos = savedPos;

    // Try print and assignment
    const printStmt = this._parsePrint();
    if (printStmt) return printStmt;

    this.pos = savedPos;
    const assignStmt = this._parseAssignment();
    if (assignStmt) return assignStmt;

    // Try parsing as a pure expression (handles dictionary access, etc.)
    this.pos = savedPos;
    try {
      const expr = this.parseExpression();
      if (expr) {
        return new ExpressionStmt(expr, expr.line, expr.column);
      }
    } catch (e) {
      // Not an expression, fall through
    }

    throw new SyntaxError(
      `Could not parse inline expression`,
      this._current().line, this._current().column
    );
  }

  // ===================================================================
  // Individual statement parsers
  // ===================================================================

  /** `1. Print "hello"` — number becomes a goto label. */
  _parseNumberedItem() {
    if (!this._check(TokenType.NUMBER)) return null;
    const numTok = this._advance();
    this._match(TokenType.PERIOD);
    while (this._check(TokenType.BULLET)) this._advance();
    if (this._atStmtEnd() && !this._isBodyStarter()) {
      return new LabelStmt(String(numTok.value), numTok.line, numTok.column);
    }
    const inner = this.parseStatement();
    return new SequenceStmt(
      [new LabelStmt(String(numTok.value), numTok.line, numTok.column), inner],
      numTok.line, numTok.column
    );
  }

  _parseBreakContinue() {
    const br = this._matchKw('Break');
    if (br) {
      this._expectEnd();
      return new BreakStmt(br.line, br.column);
    }
    const c = this._matchKw('Continue');
    if (c) {
      this._expectEnd();
      return new ContinueStmt(c.line, c.column);
    }
    return null;
  }

  /** Optional `end` after a block. */
  _parseNopEnd() {
    const tok = this._matchKw('End');
    if (!tok) return null;
    this._expectEnd();
    return new NopStmt(tok.line, tok.column);
  }

  /** `call TARGET the Alias Phrase` */
  _parseAliasCall() {
    const callTok = this._matchKw('Call');
    if (!callTok) return null;
    const targetExpr = this.parseExpression();
    this._skipNoise();
    this._match(TokenType.WORD, 'the');
    const words = [];
    while (this._check(TokenType.WORD) &&
           !PHRASE_STOP.has(this._current().value.toLowerCase())) {
      words.push(this._advance().value);
    }
    this._expectEnd();
    if (words.length === 0) return null;
    return new AliasStmt(targetExpr, words, callTok.line, callTok.column);
  }

  /** `Keep SOURCE where CONDITION.` */
  _parseKeepStmt() {
    const keepTok = this._matchKw('Keep');
    if (!keepTok) return null;
    const sourceExpr = this._parsePrimary();
    this._skipNoise();
    if (!this._match(TokenType.WORD, 'filtered-by') && !this._match(TokenType.WORD, 'where')) {
      throw new SyntaxError('Expected filtered-by', keepTok.line, keepTok.column);
    }
    const condition = this.parseExpression();
    this._expectEnd();
    return new KeepStmt(sourceExpr, condition, keepTok.line, keepTok.column);
  }

  /** `With TARGET then: ...` */
  _parseWithStmt() {
    const withTok = this._matchKw('With');
    if (!withTok) return null;
    const targetExpr = this.parseExpression();
    this._skipNoise();
    this._expect(TokenType.WORD, 'then');
    const body = this.consumeBlock();
    return new WithStmt(targetExpr, body, withTok.line, withTok.column);
  }

  /** `Label "name".` */
  _parseLabel() {
    this._skipNoise();
    if (!this._matchKw('Label')) return null;
    const textTok = this._expect(TokenType.TEXT);
    this._expectEnd();
    return new LabelStmt(textTok.value, textTok.line, textTok.column);
  }

  /** `Jump to the label "name".` */
  _parseJump() {
    this._skipNoise();
    const jumpTok = this._matchKw('Jump');
    if (!jumpTok) return null;
    this._skipNoise(); // skip "to the"
    while (this._check(TokenType.WORD) &&
           this._current().value.toLowerCase() !== 'label') {
      this._advance(); // skip noise words
    }
    this._match(TokenType.WORD, 'label'); // consume "label"
    let name;
    if (this._check(TokenType.TEXT)) name = this._advance().value;
    else if (this._check(TokenType.NUMBER)) name = String(this._advance().value);
    else if (this._check(TokenType.WORD)) name = this._advance().value;
    else {
      const tok = this._current();
      throw new SyntaxError(`Expected label name, got ${tok.type}`, tok.line, tok.column);
    }
    this._expectEnd();
    return new JumpStmt(name, jumpTok.line, jumpTok.column);
  }

  /** `Using [verbName] parse { dslContent }` */
  _parseUsing() {
    this._skipNoise();
    const usingTok = this._matchKw('Using');
    if (!usingTok) return null;

    const verbTok = this._expect(TokenType.WORD);
    const verbName = verbTok.value;

    // Skip "parse" or "process" or "handle" etc.
    this._skipNoise();
    if (this._check(TokenType.WORD)) {
      const actionWord = this._current().value.toLowerCase();
      if (actionWord === 'parse' || actionWord === 'process' ||
          actionWord === 'handle' || actionWord === 'with') {
        this._advance();
      }
    }

    // Expect brace block
    const braceTok = this._current();
    if (braceTok.type !== TokenType.BRACEBLOCK) {
      throw new SyntaxError(
        `Expected { ... } block after "Using ${verbName}", got ${braceTok.type}`,
        braceTok.line, braceTok.column
      );
    }
    this._advance(); // consume BRACEBLOCK

    return new UsingStmt(
      verbName, braceTok.value,
      usingTok.line, usingTok.column
    );
  }

  /** Command text: `` `echo hi` `` or a normal expression. */
  _parseCommandArg() {
    if (this._check(TokenType.COMMAND)) {
      const tok = this._advance();
      return new LiteralExpr('text', tok.value, tok.line, tok.column);
    }
    return this.parseExpression();
  }

  /** Standalone `` `echo hello`. `` — run and print. */
  _parseBareCommand() {
    if (!this._check(TokenType.COMMAND)) return null;
    const tok = this._advance();
    this._expectEnd();
    return new ShellStmt(
      new LiteralExpr('text', tok.value, tok.line, tok.column),
      tok.line, tok.column
    );
  }

  /** `Execute the shell command `dir`` or `Execute the command "..."` */
  _parseShellStmt() {
    this._skipNoise();
    const execTok = this._matchKw('Execute');
    if (!execTok) return null;

    // Match "the shell command" or "the command"
    if (!this._match(TokenType.WORD, 'the')) return null;
    this._match(TokenType.WORD, 'shell');
    this._expect(TokenType.WORD, 'command');

    const cmdExpr = this._parseCommandArg();
    this._expectEnd();

    return new ShellStmt(cmdExpr, execTok.line, execTok.column);
  }

  /** `Run the command `echo hello`.` (no pipe) */
  _parseRunCommand() {
    this._skipNoise();
    const runTok = this._matchKw('Run');
    if (!runTok) return null;
    this._skipNoise();
    this._match(TokenType.WORD, 'the');
    this._match(TokenType.WORD, 'shell');
    if (!this._match(TokenType.WORD, 'command')) return null;
    const cmdExpr = this._parseCommandArg();
    this._expectEnd();
    return new ShellStmt(cmdExpr, runTok.line, runTok.column);
  }

  /** `Run the shell command "a" and pipe to "b".` */
  _parsePipeShell() {
    this._skipNoise();
    const runTok = this._matchKw('Run');
    if (!runTok) return null;
    this._skipNoise();
    this._match(TokenType.WORD, 'the');
    this._match(TokenType.WORD, 'shell');
    this._expect(TokenType.WORD, 'command');
    const cmd1 = this._check(TokenType.COMMAND) ? this._parseCommandArg() : this._parsePrimary();
    this._skipNoise();
    this._expect(TokenType.WORD, 'and');
    this._skipNoise();
    this._match(TokenType.WORD, 'pipe');
    this._skipNoise();
    this._match(TokenType.WORD, 'to');
    const cmd2 = this._check(TokenType.COMMAND) ? this._parseCommandArg() : this._parsePrimary();
    this._expectEnd();
    return new PipeShellStmt(cmd1, cmd2, runTok.line, runTok.column);
  }

  /** `Include "file.prose".` */
  _parseInclude() {
    this._skipNoise();
    const inclTok = this._matchKw('Include');
    if (!inclTok) return null;
    const pathExpr = this.parseExpression();
    this._expectEnd();
    return new IncludeStmt(pathExpr, inclTok.line, inclTok.column);
  }

  /** `Try: ... Catch: ...` or `Try: ... Catch the error: ...` */
  _parseTry() {
    const tryTok = this._matchKw('Try');
    if (!tryTok) return null;

    const tryBlock = this.consumeBlock();

    // Skip NEWLINEs before Catch
    while (this._check(TokenType.NEWLINE)) this._advance();

    if (!this._matchKw('Catch')) {
      throw new SyntaxError('Expected "Catch" after Try block', tryTok.line, tryTok.column);
    }

    // Optional: "the error" or "the error into err"
    // Don't _skipNoise here - "the" could be the next word
    let errorVar = null;
    if (this._match(TokenType.WORD, 'the')) {
      this._match(TokenType.WORD, 'error');
      if (this._match(TokenType.WORD, 'into')) {
        const errTok = this._expect(TokenType.WORD);
        this._assertVarName(errTok.value, errTok);
        errorVar = errTok.value;
      }
    }

    const catchBlock = this.consumeBlock();

    return new TryStmt(tryBlock, catchBlock, errorVar, tryTok.line, tryTok.column);
  }

  /** `Read the file [path] into [var].` */
  _parseReadFile() {
    this._skipNoise();
    const readTok = this._matchKw('Read');
    if (!readTok) return null;

    this._skipNoise();
    this._match(TokenType.WORD, 'the');
    this._match(TokenType.WORD, 'file');

    const pathExpr = this.parseExpression();

    this._skipNoise();
    this._expect(TokenType.WORD, 'into');

    const varTok = this._expect(TokenType.WORD);
    this._assertVarName(varTok.value, varTok);
    this._expectEnd();

    return new ReadFileStmt(pathExpr, varTok.value, readTok.line, readTok.column);
  }

  /** `Write [expr] to the file [path].` */
  _parseWriteFile() {
    this._skipNoise();
    const writeTok = this._matchKw('Write');
    if (!writeTok) return null;

    const valueExpr = this.parseExpression();

    this._skipNoise();
    this._expect(TokenType.WORD, 'to');
    this._skipNoise();
    this._match(TokenType.WORD, 'the');
    this._match(TokenType.WORD, 'file');

    const pathExpr = this.parseExpression();
    this._expectEnd();

    return new WriteFileStmt(valueExpr, pathExpr, writeTok.line, writeTok.column);
  }

  /** `Execute the text inside varName.` */
  _parseExecute() {
    this._skipNoise();
    if (!this._matchKw('Execute')) return null;
    this._skipNoise(); // skip articles like "the"
    // Explicitly consume "the", "text", "inside" if present
    this._match(TokenType.WORD, 'the');
    this._match(TokenType.WORD, 'text');
    this._match(TokenType.WORD, 'inside');
    const varTok = this._expect(TokenType.WORD);
    this._assertVarName(varTok.value, varTok);
    this._expectEnd();
    return new ExecuteStmt(varTok.value, varTok.line, varTok.column);
  }

  /** `A Type named varName exists.` or `A Text named x exists as follows until TERM: ... TERM` */
  _parseVariableDecl() {
    // Match "A" or "An" directly before skipping noise (it's structural here)
    const articleTok = this._matchKw('A') || this._matchKw('An');
    if (!articleTok) return null;
    this._skipNoise(); // skip any articles between "a" and the type

    const typeTok = this._current();
    // Type is a WORD (capitalized conventionally)
    if (typeTok.type !== TokenType.WORD) return null;

    // Consume the type word
    this._advance();
    // "named" is optional. Do not skipNoise here — a variable may be named `a`.
    this._match(TokenType.WORD, 'named');
    if (!this._check(TokenType.WORD)) return null;
    const nameTok = this._advance();
    if (!this._match(TokenType.WORD, 'exists')) {
      return null;
    }
    this._assertVarName(nameTok.value, nameTok);

    // Check for heredoc initializer
    if (this._check(TokenType.HEREDOC)) {
      const heredocTok = this._advance();
      const decl = new VariableDeclaration(
        typeTok.value, nameTok.value,
        typeTok.line, typeTok.column
      );
      decl._heredocValue = new LiteralExpr('heredoc', heredocTok.value, heredocTok.line, heredocTok.column);
      return decl;
    }

    this._expectEnd();
    return new VariableDeclaration(
      typeTok.value, nameTok.value,
      typeTok.line, typeTok.column
    );
  }

  /** `X is expr.` or `Entity's prop is expr.` or `the Current Client's balance is 1.` */
  _parseAssignment() {
    const firstTok = this._current();
    if (firstTok.type !== TokenType.WORD) return null;

    const dest = this._parseAssignTarget();
    if (!dest) return null;

    this._skipNoise();
    if (this._check(TokenType.HEREDOC)) {
      if (dest.entity) {
        if (!dest.usedThe) this._assertVarName(dest.entity, firstTok);
      } else {
        this._assertVarName(dest.target, firstTok);
      }
      const value = this.parseExpression();
      this._expectEnd();
      return new Assignment(
        dest.entity, dest.target, value,
        firstTok.line, firstTok.column, dest.indexExpr || null
      );
    }
    if (!this._match(TokenType.WORD, 'is') && !this._match(TokenType.OPERATOR, '=')) return null;

    if (dest.entity) {
      if (!dest.usedThe) this._assertVarName(dest.entity, firstTok);
    } else {
      this._assertVarName(dest.target, firstTok);
    }

    this._skipNoise();
    const value = this.parseExpression();
    this._expectEnd();

    return new Assignment(
      dest.entity, dest.target, value,
      firstTok.line, firstTok.column, dest.indexExpr || null
    );
  }

  /**
   * Parse `the Current Client's balance` or `x` or `alice's age`.
   * Leaves the stream at `is` / `to` / `by` on success.
   */
  _parseAssignTarget() {
    const saved = this.pos;
    const words = [];
    const peekIsBinder = () => {
      const p = this._peek(1);
      if (!p) return false;
      if (p.type === TokenType.POSSESSIVE) return true;
      if (p.type === TokenType.WORD && ['is', 'to', 'by'].includes(p.value.toLowerCase())) return true;
      if (p.type === TokenType.OPERATOR && p.value === '=') return true;
      return false;
    };
    let usedThe = false;
    if (this._check(TokenType.WORD, 'the') && !peekIsBinder()) {
      this._advance();
      usedThe = true;
    } else if (this._check(TokenType.WORD, 'a') && !peekIsBinder()) this._advance();
    else if (this._check(TokenType.WORD, 'an') && !peekIsBinder()) this._advance();

    while (this._check(TokenType.WORD)) {
      const w = this._current().value.toLowerCase();
      if (w === 'is' || w === 'to' || w === 'by' || w === 'at') break;
      words.push(this._advance().value);
      if (this._check(TokenType.POSSESSIVE)) {
        this._advance();
        const prop = this._expect(TokenType.WORD).value;
        return { entity: words.join(' '), target: prop, indexExpr: null, usedThe };
      }
    }

    if (words.length === 1 && this._check(TokenType.LBRACKET)) {
      this._advance();
      const idx = this.parseExpression();
      this._expect(TokenType.RBRACKET);
      return { entity: null, target: words[0], indexExpr: idx, usedThe: false };
    }
    if (words.length === 1 && this._check(TokenType.WORD, 'at')) {
      this._advance();
      const idx = this._parseUnary();
      return { entity: null, target: words[0], indexExpr: idx, usedThe: false };
    }

    if (words.length >= 1 &&
        (this._check(TokenType.HEREDOC) ||
         (this._check(TokenType.WORD) &&
          ['is', 'to', 'by'].includes(this._current().value.toLowerCase())) ||
         this._check(TokenType.OPERATOR, '='))) {
      return { entity: null, target: words.join(' '), indexExpr: null, usedThe: false };
    }

    this.pos = saved;
    return null;
  }

  /** `Print expr.` or `Print expr followed by expr.` */
  _parsePrint() {
    this._skipNoise();
    const printTok = this._matchKw('Print');
    if (!printTok) return null;

    this._skipNoise();
    const parts = [this.parseExpression()];
    while (!this._atStmtEnd() && this._current().type !== TokenType.DEDENT) {
      const saved = this.pos;
      try {
        const next = this.parseExpression();
        if (!next) break;
        const space = new LiteralExpr('text', ' ', printTok.line, printTok.column);
        const joined = new BinaryOpExpr(parts[parts.length - 1], 'followed_by', space,
          printTok.line, printTok.column);
        parts[parts.length - 1] = new BinaryOpExpr(joined, 'followed_by', next,
          printTok.line, printTok.column);
      } catch {
        this.pos = saved;
        break;
      }
    }
    this._expectEnd();

    return new PrintStmt(parts[0], printTok.line, printTok.column);
  }

  /** `If expr: [block] (Otherwise: [block])? (Otherwise if expr: [block])*` */
  _parseIf() {
    const ifTok = this._matchKw('If');
    if (!ifTok) return null;

    // Don't _skipNoise here - the condition may start with a variable named "a"
    const condition = this.parseExpression();
    const thenBlock = this.consumeBlock();

    let elseBlock = [];
    const elseIfs = [];

    // Check for "Otherwise:" or "Otherwise if:"
    while (true) {
      const savedPos = this.pos;
      while (this._check(TokenType.NEWLINE)) this._advance();
      this._skipNoise();

      if (this._matchKw('Otherwise-If')) {
        this._skipNoise();
        const elifCond = this.parseExpression();
        const elifBlock = this.consumeBlock();
        elseIfs.push({ condition: elifCond, body: elifBlock });
        continue;
      }
      if (!this._matchKw('Otherwise')) {
        this.pos = savedPos;
        break;
      }

      // Check if it's "Otherwise if condition:"
      this._skipNoise();
      if (this._matchKw('If')) {
        this._skipNoise();
        const elifCond = this.parseExpression();
        const elifBlock = this.consumeBlock();
        elseIfs.push({ condition: elifCond, body: elifBlock });
        // Continue looking for more else-ifs or a final Otherwise
      } else {
        // Plain "Otherwise:" final else block
        elseBlock = this.consumeBlock();
        break;
      }
    }

    return new IfStmt(condition, thenBlock, elseBlock, elseIfs, ifTok.line, ifTok.column);
  }

  /** `While expr: [block]` */
  _parseWhile() {
    const whileTok = this._matchKw('While');
    if (!whileTok) return null;
    const condition = this.parseExpression();
    const body = this.consumeBlock();

    return new WhileStmt(condition, body, whileTok.line, whileTok.column);
  }

  /** `For every var in collection: [block]` */
  _parseForEvery() {
    this._skipNoise();
    if (this._matchKw('For-Every')) {
      /* kebab */
    } else {
      if (!this._matchKw('For')) return null;
      this._skipNoise();
      if (!this._matchKw('Every')) return null;
    }
    const varTok = this._expect(TokenType.WORD);
    this._skipNoise();
    this._expect(TokenType.WORD, 'in');
    const collTok = this._expect(TokenType.WORD);
    this._assertVarName(varTok.value, varTok);
    this._assertVarName(collTok.value, collTok);
    const body = this.consumeBlock();

    return new ForEveryStmt(
      varTok.value, collTok.value, body,
      varTok.line, varTok.column
    );
  }

  /** `For every Number from X to Y:` */
  _parseRangeFor() {
    this._skipNoise();
    let forTok = this._matchKw('For-Every');
    if (!forTok) {
      forTok = this._matchKw('For');
      if (!forTok) return null;
      this._skipNoise();
      if (!this._matchKw('Every')) return null;
    }

    const typeTok = this._expect(TokenType.WORD); // Number
    const savedPos = this.pos;
    this._skipNoise();
    if (!this._match(TokenType.WORD, 'from')) {
      this.pos = savedPos;
      return null; // Not a range for, might be a regular "For every X in Y"
    }
    const fromExpr = this.parseExpression();
    this._skipNoise();
    this._expect(TokenType.WORD, 'to');
    const toExpr = this.parseExpression();
    const body = this.consumeBlock();

    // Use a variable name like "index" or the type name
    return new RangeForStmt('_index', fromExpr, toExpr, body, forTok.line, forTok.column);
  }

  /** `To Greet a Person:` / `To Charge a Client using an Amount:` — slots are types. */
  _parseVerbDefinition() {
    this._skipNoise();
    const toTok = this._matchKw('To');
    if (!toTok) return null;

    const verbNameTok = this._expect(TokenType.WORD);
    const verbName = verbNameTok.value;
    if (!this._isCapitalized(verbName)) {
      throw new SyntaxError(
        `Verb names start with a capital letter (To ${verbName[0].toUpperCase()}${verbName.slice(1)} …)`,
        verbNameTok.line, verbNameTok.column
      );
    }

    const slots = [];
    while (this.pos < this.tokens.length &&
           this._current().type === TokenType.WORD) {
      if (this._isBodyStarter()) break;
      let role = null;
      const w = this._current().value.toLowerCase();
      if (ROLE_FILLERS.has(w) && w !== 'and') {
        role = this._advance().value;
        this._match(TokenType.WORD, 'a');
        this._match(TokenType.WORD, 'an');
        this._match(TokenType.WORD, 'the');
        if (!this._check(TokenType.WORD)) break;
        const typeTok = this._advance();
        if (!isTypeName(typeTok.value)) {
          throw new SyntaxError(
            `"${typeTok.value}" is not a type. Teach verbs with types: To Greet a Person`,
            typeTok.line, typeTok.column
          );
        }
        slots.push({ role, type: typeTok.value });
        continue;
      }
      if (w === 'a' || w === 'an' || w === 'the') {
        this._advance();
        continue;
      }
      const typeTok = this._advance();
      if (!isTypeName(typeTok.value)) {
        throw new SyntaxError(
          `"${typeTok.value}" is not a type. Use To Greet a Person and refer to the Person in the body.`,
          typeTok.line, typeTok.column
        );
      }
      slots.push({ role: null, type: typeTok.value });
    }

    const params = slots.map(s => s.type);
    const body = this.consumeBlock();

    return new VerbDefinition(
      verbName, params, body,
      toTok.line, toTok.column, slots
    );
  }

  /** `VerbName arg1 arg2 ... .` */
  _parseVerbCall() {
    const verbTok = this._current();
    if (verbTok.type !== TokenType.WORD) return null;

    // Don't confuse with keywords
    const lower = verbTok.value.toLowerCase();
    const keywords = new Set([
      'print', 'if', 'while', 'for', 'to', 'label', 'jump',
      'execute', 'a', 'an', 'the', 'inside', 'find', 'increase', 'lower',
      'decrease', 'set', 'result', 'whenever', 'named', 'exists',
      'contains', 'maps', 'followed', 'text', 'number', 'list',
      'dictionary', 'account', 'user', 'value',
      'make', 'change', 'copy', 'rename', 'touch', 'append', 'run',
      'call', 'keep', 'with', 'end', 'break', 'continue',
    ]);
    if (keywords.has(lower)) return null;
    if (!this._isCapitalized(verbTok.value)) return null;

    // Check if this looks like a verb call: WORD WORD ... PERIOD
    // (not followed by 's or "is")
    if (this._peek(1)?.type === TokenType.POSSESSIVE) return null;
    if (this._peek(1)?.type === TokenType.WORD &&
        this._peek(1)?.value.toLowerCase() === 'is') return null;

    this._advance(); // consume verb name

    // Read arguments (everything up to PERIOD, NEWLINE, or RPAREN)
    const args = [];
    while (this.pos < this.tokens.length &&
           !this._atStmtEnd() &&
           this._current().type !== TokenType.DEDENT &&
           this._current().type !== TokenType.DOT) {
      // Skip noise words and role fillers (using/with/into/...)
      if (this._current().type === TokenType.WORD &&
          (NOISE.has(this._current().value.toLowerCase()) ||
           ROLE_FILLERS.has(this._current().value.toLowerCase()))) {
        this._advance();
        continue;
      }
      // Read an argument expression
      try {
        const expr = this.parseExpression();
        if (expr) args.push(expr);
      } catch (e) {
        // If we can't parse as expression, skip the word
        if (this._current().type === TokenType.WORD) {
          this._advance();
        } else {
          break;
        }
      }
    }

    // Accept PERIOD (for standalone calls) or RPAREN (inside side-notes)
    // Don't consume RPAREN - let _parseParenExpr handle it
    if (this._check(TokenType.RPAREN)) {
      // Inside parenthesized expression, don't consume the RPAREN
    } else {
      this._expectEnd();
    }

    return new VerbCall(
      verbTok.value, args,
      verbTok.line, verbTok.column
    );
  }

  /** `Inside dictName, "key" maps to expr.` */
  _parseDictionarySet() {
    this._skipNoise();
    if (!this._matchKw('Inside')) return null;

    const dictTok = this._expect(TokenType.WORD);
    this._assertVarName(dictTok.value, dictTok);
    this._match(TokenType.COMMA); // optional comma

    // key can be TEXT or expression
    const key = this.parseExpression();

    this._skipNoise();
    this._expect(TokenType.WORD, 'maps');
    this._skipNoise();
    this._expect(TokenType.WORD, 'to');

    const value = this.parseExpression();
    this._expectEnd();

    return new DictionarySetStmt(
      dictTok.value, key, value,
      dictTok.line, dictTok.column
    );
  }

  /** `ListName contains item1, item2, and item3.` */
  _parseListAdd() {
    this._skipNoise();
    const listTok = this._current();
    if (listTok.type !== TokenType.WORD) return null;

    // Peek ahead for "contains"
    let peekPos = this.pos + 1;
    while (peekPos < this.tokens.length &&
           this.tokens[peekPos].type === TokenType.WORD &&
           NOISE.has(this.tokens[peekPos].value.toLowerCase())) {
      peekPos++;
    }
    if (peekPos >= this.tokens.length ||
        this.tokens[peekPos].value.toLowerCase() !== 'contains') {
      return null;
    }

    this._advance(); // consume list name
    this._assertVarName(listTok.value, listTok);
    this._skipNoise();
    this._expect(TokenType.WORD, 'contains');

    // Read comma-separated items
    const items = [];
    items.push(this.parseExpression());

    while (this._match(TokenType.COMMA)) {
      this._skipNoise();
      // The last item may be prefixed with "and"
      this._match(TokenType.WORD, 'and');
      this._skipNoise();
      items.push(this.parseExpression());
    }

    this._expectEnd();

    return new ListAddStmt(
      listTok.value, items,
      listTok.line, listTok.column
    );
  }

  /** `Find every Type in collection whose property is expr.` */
  _parseQuery() {
    this._skipNoise();
    if (this._matchKw('Find-Every')) {
      /* kebab */
    } else if (!this._matchKw('Find')) return null;

    this._skipNoise();
    this._match(TokenType.WORD, 'every');
    this._matchKw('Every');
    const typeTok = this._expect(TokenType.WORD);
    this._skipNoise();
    this._expect(TokenType.WORD, 'in');
    const collTok = this._expect(TokenType.WORD);
    this._assertVarName(collTok.value, collTok);
    this._skipNoise();

    let propName;
    const cur = this._current();
    if (cur.type === TokenType.WORD && cur.value.toLowerCase().startsWith('with-')) {
      propName = cur.value.slice(5);
      this._advance();
    } else {
      while (this._current().type === TokenType.WORD &&
             this._current().value.toLowerCase() !== 'whose') {
        this._advance();
      }
      this._expect(TokenType.WORD, 'whose');
      propName = this._expect(TokenType.WORD).value;
      this._skipNoise();
      this._match(TokenType.WORD, 'is');
    }

    const value = this.parseExpression();
    this._expectEnd();

    return new QueryStmt(
      typeTok.value, collTok.value, propName, value,
      typeTok.line, typeTok.column
    );
  }

  /** `Whenever entity's prop changes: [block]` */
  _parseWhenever() {
    const wheneverTok = this._matchKw('Whenever');
    if (!wheneverTok) return null;

    const entityTok = this._expect(TokenType.WORD);
    this._assertVarName(entityTok.value, entityTok);
    let propertyName = null;

    if (this._check(TokenType.POSSESSIVE)) {
      this._advance(); // consume 's
      propertyName = this._expect(TokenType.WORD).value;
    }
    // else: plain variable watch - propertyName stays null

    this._skipNoise();
    if (this._check(TokenType.WORD) &&
        this._current().value.toLowerCase() === 'changes') {
      this._advance();
    }

    const body = this.consumeBlock();

    return new WheneverStmt(
      entityTok.value, propertyName, body,
      wheneverTok.line, wheneverTok.column
    );
  }

  /** `After N seconds: ...` */
  _parseAfter() {
    const afterTok = this._matchKw('After');
    if (!afterTok) return null;
    const secExpr = this.parseExpression();
    this._skipNoise();
    this._match(TokenType.WORD, 'second');
    this._match(TokenType.WORD, 'seconds');
    const body = this.consumeBlock();
    return new AfterStmt(secExpr, body, afterTok.line, afterTok.column);
  }

  /** `Every N seconds: ...` */
  _parseEvery() {
    const everyTok = this._matchKw('Every');
    if (!everyTok) return null;
    const secExpr = this.parseExpression();
    this._skipNoise();
    this._match(TokenType.WORD, 'second');
    this._match(TokenType.WORD, 'seconds');
    const body = this.consumeBlock();
    return new EveryStmt(secExpr, body, everyTok.line, everyTok.column);
  }

  /** `Delete the file "path".` */
  _parseDeleteFile() {
    const delTok = this._matchKw('Delete');
    if (!delTok) return null;
    this._skipNoise();
    this._match(TokenType.WORD, 'the');
    this._match(TokenType.WORD, 'file');
    const pathExpr = this.parseExpression();
    this._expectEnd();
    return new DeleteFileStmt(pathExpr, delTok.line, delTok.column);
  }

  /** `Make the directory "path".` */
  _parseMkdir() {
    const makeTok = this._matchKw('Make');
    if (!makeTok) return null;
    this._skipNoise();
    this._match(TokenType.WORD, 'the');
    if (!this._match(TokenType.WORD, 'directory') && !this._match(TokenType.WORD, 'dir')) return null;
    const pathExpr = this.parseExpression();
    this._expectEnd();
    return new MkdirStmt(pathExpr, makeTok.line, makeTok.column);
  }

  /** `Change directory to "path".` */
  _parseChdir() {
    const chTok = this._matchKw('Change');
    if (!chTok) return null;
    this._skipNoise();
    if (!this._match(TokenType.WORD, 'directory') && !this._match(TokenType.WORD, 'dir')) return null;
    this._skipNoise();
    this._match(TokenType.WORD, 'to');
    const pathExpr = this.parseExpression();
    this._expectEnd();
    return new ChdirStmt(pathExpr, chTok.line, chTok.column);
  }

  /** `Copy the file "from" to "to".` */
  _parseCopyFile() {
    const copyTok = this._matchKw('Copy');
    if (!copyTok) return null;
    this._skipNoise();
    this._match(TokenType.WORD, 'the');
    this._match(TokenType.WORD, 'file');
    const fromExpr = this.parseExpression();
    this._skipNoise();
    this._expect(TokenType.WORD, 'to');
    const toExpr = this.parseExpression();
    this._expectEnd();
    return new CopyFileStmt(fromExpr, toExpr, copyTok.line, copyTok.column);
  }

  /** `Rename the file "from" to "to".` */
  _parseRenameFile() {
    const renTok = this._matchKw('Rename');
    if (!renTok) return null;
    this._skipNoise();
    this._match(TokenType.WORD, 'the');
    this._match(TokenType.WORD, 'file');
    const fromExpr = this.parseExpression();
    this._skipNoise();
    this._expect(TokenType.WORD, 'to');
    const toExpr = this.parseExpression();
    this._expectEnd();
    return new RenameFileStmt(fromExpr, toExpr, renTok.line, renTok.column);
  }

  /** `Touch the file "path".` */
  _parseTouchFile() {
    const tTok = this._matchKw('Touch');
    if (!tTok) return null;
    this._skipNoise();
    this._match(TokenType.WORD, 'the');
    this._match(TokenType.WORD, 'file');
    const pathExpr = this.parseExpression();
    this._expectEnd();
    return new TouchFileStmt(pathExpr, tTok.line, tTok.column);
  }

  /** `Append expr to the file "path".` */
  _parseAppendFile() {
    const apTok = this._matchKw('Append');
    if (!apTok) return null;
    const valueExpr = this.parseExpression();
    this._skipNoise();
    this._expect(TokenType.WORD, 'to');
    this._skipNoise();
    this._match(TokenType.WORD, 'the');
    this._expect(TokenType.WORD, 'file');
    const pathExpr = this.parseExpression();
    this._expectEnd();
    return new AppendFileStmt(valueExpr, pathExpr, apTok.line, apTok.column);
  }

  /** `Increase/Lower/Set target by/to expr.` */
  _parseMutation() {
    this._skipNoise();
    const opTok = this._current();
    if (opTok.type !== TokenType.WORD) return null;

    if (!this._isCapitalized(opTok.value)) return null;
    const opLower = opTok.value.toLowerCase();
    let operation = null;
    if (opLower === 'increase') operation = 'increase';
    else if (opLower === 'lower' || opLower === 'decrease') operation = 'decrease';
    else if (opLower === 'set') operation = 'set';
    else return null;

    this._advance(); // consume operation word

    const dest = this._parseAssignTarget();
    if (!dest) return null;
    if (dest.entity) {
      if (!dest.usedThe) this._assertVarName(dest.entity, opTok);
    } else {
      this._assertVarName(dest.target, opTok);
    }
    const entity = dest.entity;
    const target = dest.target;

    this._skipNoise();

    // "by" or "to" depending on operation
    if (operation === 'set') {
      this._expect(TokenType.WORD, 'to');
    } else {
      this._expect(TokenType.WORD, 'by');
    }

    const value = this.parseExpression();
    this._expectEnd();

    return new MutationStmt(
      operation, entity, target, value,
      opTok.line, opTok.column
    );
  }

  /** `Result is expr.` */
  _parseResult() {
    this._skipNoise();
    const resultTok = this._matchKw('Result');
    if (!resultTok) return null;

    this._skipNoise();
    if (!this._match(TokenType.WORD, 'is') && !this._match(TokenType.OPERATOR, '=')) {
      return null;
    }

    const value = this.parseExpression();
    this._expectEnd();

    return new ResultStmt(value, resultTok.line, resultTok.column);
  }

  // ===================================================================
  // Expression parsing
  // ===================================================================

  /**
   * Parse an expression up to the next structural token.
   * @returns {Expr}
   */
  parseExpression() {
    return this._parseBinaryOp();
  }

  /**
   * Parse binary operations (lowest precedence).
   * Handles: "followed by", comparisons (is greater than, is less than, etc.)
   */
  /**
   * Parse binary operations (lowest precedence).
   * Handles: "followed by", arithmetic (plus, minus, times, divided by),
   * comparisons (is greater than, etc.), and logic (and, or).
   */
  _parseUnary() {
    if (this._current().type === TokenType.OPERATOR && this._current().value === '!') {
      const tok = this._advance();
      return new UnaryExpr('not', this._parseUnary(), tok.line, tok.column);
    }
    if (this._check(TokenType.WORD, 'not') && this._isCapitalized(this._current().value)) {
      const tok = this._advance();
      return new UnaryExpr('not', this._parseUnary(), tok.line, tok.column);
    }
    if (this._current().type === TokenType.OPERATOR && this._current().value === '-') {
      const tok = this._advance();
      const inner = this._parseUnary();
      return new BinaryOpExpr(new LiteralExpr('number', '0', tok.line, tok.column), 'minus', inner, tok.line, tok.column);
    }
    return this._parsePostfix();
  }

  _parsePostfix() {
    let left = this._parsePrimary();
    while (true) {
      if (this._check(TokenType.LBRACKET)) {
        this._advance();
        const idx = this.parseExpression();
        this._expect(TokenType.RBRACKET);
        left = new IndexExpr(left, idx, left.line, left.column);
        continue;
      }
      if (this._check(TokenType.DOT)) {
        this._advance();
        const field = this._expect(TokenType.WORD);
        left = new FieldAccessExpr(left, field.value, left.line, left.column);
        continue;
      }
      if (this._check(TokenType.WORD, 'at')) {
        this._advance();
        const idx = this._parseUnary();
        left = new IndexExpr(left, idx, left.line, left.column);
        continue;
      }
      break;
    }
    return left;
  }

  _parseBinaryOp() {
    let left = this._parseUnary();

    while (true) {
      this._skipNoise();

      // Postfix: `Scores transformed-by Double` / `Scores filtered-by cond`
      if (this._check(TokenType.WORD)) {
        const pf = this._current().value.toLowerCase();
        if (pf === 'transformed-by' || pf === 'mapped-by') {
          this._advance();
          this._skipNoise();
          const verbTok = this._expect(TokenType.WORD);
          left = new MapExpr(left, verbTok.value, left.line, left.column);
          continue;
        }
        if (pf === 'filtered-by' || pf === 'where') {
          this._advance();
          const condition = this.parseExpression();
          left = new FilterExpr(left, condition, left.line, left.column);
          continue;
        }
      }

      // Symbolic operators: + - * / > < >= <= == !=
      if (this._current().type === TokenType.OPERATOR) {
        const sym = this._advance().value;
        this._skipNoise();
        const right = this._parseUnary();
        const opMap = {
          '+': 'plus', '-': 'minus', '*': 'times', '/': 'divided_by', '%': 'modulo',
          '>': 'greater_than', '<': 'less_than', '>=': 'greater_equal', '<=': 'less_equal',
          '==': 'equal_to', '!=': 'not_equal_to',
        };
        if (sym === '=') {
          throw new SyntaxError('Use "is" or "=" for assignment, "==" for equality', left.line, left.column);
        }
        const op = opMap[sym];
        if (!op) break;
        left = new BinaryOpExpr(left, op, right, left.line, left.column);
        continue;
      }

      // Kebab and word operators
      if (this._check(TokenType.WORD)) {
        const aw = this._current().value.toLowerCase();
        const kebabOps = {
          'followed-by': 'followed_by',
          'greater-than': 'greater_than',
          'less-than': 'less_than',
          'greater-or-equal': 'greater_equal',
          'less-or-equal': 'less_equal',
          'equal-to': 'equal_to',
          'not-equal-to': 'not_equal_to',
          'divided-by': 'divided_by',
        };
        if (kebabOps[aw]) {
          this._advance();
          this._skipNoise();
          const right = this._parsePrimary();
          left = new BinaryOpExpr(left, kebabOps[aw], right, left.line, left.column);
          continue;
        }
      }

      // "followed by" (string concatenation)
      if (this._check(TokenType.WORD, 'followed')) {
        this._advance();
        this._skipNoise();
        this._expect(TokenType.WORD, 'by');
        this._skipNoise();
        const right = this._parsePrimary();
        left = new BinaryOpExpr(left, 'followed_by', right, left.line, left.column);
        continue;
      }

      // Arithmetic: "plus", "minus", "times", "divided by"
      const arithWord = this._current();
      if (arithWord.type === TokenType.WORD) {
        const aw = arithWord.value.toLowerCase();
        if (aw === 'plus' || aw === 'minus' || aw === 'times') {
          this._advance();
          const op = aw === 'plus' ? 'plus' : aw === 'minus' ? 'minus' : 'times';
          this._skipNoise();
          const right = this._parsePrimary();
          left = new BinaryOpExpr(left, op, right, left.line, left.column);
          continue;
        }
        if (aw === 'divided') {
          this._advance();
          this._skipNoise();
          this._expect(TokenType.WORD, 'by');
          this._skipNoise();
          const right = this._parsePrimary();
          left = new BinaryOpExpr(left, 'divided_by', right, left.line, left.column);
          continue;
        }
      }

      // Logical operators: "and", "or"
      if (this._check(TokenType.WORD)) {
        const logicWord = this._current().value.toLowerCase();
        if (logicWord === 'and' || logicWord === 'or') {
          this._advance();
          this._skipNoise();
          const right = this._parseBinaryOp(); // parse full right expression
          left = new LogicalExpr(left, logicWord, right, left.line, left.column);
          continue;
        }
      }

      // Comparison operators: "is greater than", "is less than", etc.
      if (this._check(TokenType.WORD, 'is')) {
        const savedPos = this.pos;
        this._advance();
        this._skipNoise();
        const opWord = this._current();
        if (opWord.type !== TokenType.WORD) { this.pos = savedPos; break; }
        const opLower = opWord.value.toLowerCase();
        let op = null;
        if (opLower === 'greater') {
          this._advance();
          this._skipNoise();
          // Check for "greater than or equal to" before "greater than"
          if (this._check(TokenType.WORD, 'than')) {
            const savedPos2 = this.pos;
            this._advance(); this._skipNoise();
            if (this._check(TokenType.WORD, 'or')) {
              this._advance(); this._skipNoise();
              this._expect(TokenType.WORD, 'equal'); this._skipNoise();
              this._expect(TokenType.WORD, 'to');
              op = 'greater_equal';
            } else {
              // Just "greater than"
              this.pos = savedPos2;
              this._advance(); // consume "than"
              op = 'greater_than';
            }
          } else { this.pos = savedPos; break; }
        } else if (opLower === 'less') {
          this._advance();
          this._skipNoise();
          // Check for "less than or equal to" before "less than"
          if (this._check(TokenType.WORD, 'than')) {
            const savedPos2 = this.pos;
            this._advance(); this._skipNoise();
            if (this._check(TokenType.WORD, 'or')) {
              this._advance(); this._skipNoise();
              this._expect(TokenType.WORD, 'equal'); this._skipNoise();
              this._expect(TokenType.WORD, 'to');
              op = 'less_equal';
            } else {
              this.pos = savedPos2;
              this._advance(); // consume "than"
              op = 'less_than';
            }
          } else { this.pos = savedPos; break; }
        } else if (opLower === 'equal') {
          this._advance();
          this._skipNoise();
          this._expect(TokenType.WORD, 'to');
          op = 'equal_to';
        } else if (opLower === 'not') {
          this._advance();
          this._skipNoise();
          this._expect(TokenType.WORD, 'equal');
          this._skipNoise();
          this._expect(TokenType.WORD, 'to');
          op = 'not_equal_to';
        } else {
          this.pos = savedPos;
          break;
        }
        this._skipNoise();
        const right = this._parsePrimary();
        left = new BinaryOpExpr(left, op, right, left.line, left.column);
        continue;
      }

      break;
    }

    return left;
  }

  /**
   * Parse primary expressions: literals, variables, property access,
   * parenthesized expressions, dictionary access expressions.
   *
   * Leading decorative articles (a, an, the) are skipped at entry.
   * Structural words like "value", "for", "inside" are matched explicitly.
   */
  _parsePrimary() {
    // Bare anaphors: it, there, here, those, others
    if (this._check(TokenType.WORD)) {
      const w = this._current().value.toLowerCase();
      if (ANAPHOR_WORDS.has(w)) {
        const tok = this._advance();
        if (this._check(TokenType.POSSESSIVE)) {
          this._advance();
          const prop = this._expect(TokenType.WORD).value;
          return new OfPropertyExpr(prop, new CorefExpr(w, [w], tok.line, tok.column), tok.line, tok.column);
        }
        return new CorefExpr(w, [w], tok.line, tok.column);
      }
    }

    // `the ...` coreference, the number, the list of files, etc.
    if (this._check(TokenType.WORD, 'the')) {
      const theRef = this._tryParseTheRef();
      if (theRef) return theRef;
    }

    // Skip decorative articles only (a, an, the) UNLESS the next token
    // indicates this is actually a variable reference (followed by 's, "is", etc.)
    const savedPreSkip = this.pos;
    while (this._current().type === TokenType.WORD &&
           (this._current().value.toLowerCase() === 'a' ||
            this._current().value.toLowerCase() === 'an' ||
            this._current().value.toLowerCase() === 'the')) {
      // Peek ahead: if followed by structural tokens, this is a variable, not an article
      const peekTok = this._peek(1);
      if (peekTok && (
          peekTok.type === TokenType.POSSESSIVE ||
          (peekTok.type === TokenType.WORD && peekTok.value.toLowerCase() === 'is') ||
          (peekTok.type === TokenType.WORD && peekTok.value.toLowerCase() === 'followed') ||
          (peekTok.type === TokenType.WORD && peekTok.value.toLowerCase() === 'plus') ||
          (peekTok.type === TokenType.WORD && peekTok.value.toLowerCase() === 'minus') ||
          (peekTok.type === TokenType.WORD && peekTok.value.toLowerCase() === 'times') ||
          (peekTok.type === TokenType.WORD && peekTok.value.toLowerCase() === 'divided') ||
          (peekTok.type === TokenType.WORD && (peekTok.value.toLowerCase() === 'and' || peekTok.value.toLowerCase() === 'or'))
      )) {
        // This is a variable reference, don't skip
        break;
      }
      // Skip the article
      this._advance();
    }

    const tok = this._current();

    // NUMBER literal
    if (tok.type === TokenType.NUMBER) {
      this._advance();
      return new LiteralExpr('number', tok.value, tok.line, tok.column);
    }

    // True / False → 1 / 0 (capital literals)
    if (tok.type === TokenType.WORD && this._isCapitalized(tok.value) &&
        (tok.value.toLowerCase() === 'true' || tok.value.toLowerCase() === 'false')) {
      this._advance();
      return new LiteralExpr('number', tok.value.toLowerCase() === 'true' ? '1' : '0', tok.line, tok.column);
    }

    // `item 0 of xs`
    if (tok.type === TokenType.WORD && tok.value.toLowerCase() === 'item') {
      const saved = this.pos;
      this._advance();
      try {
        const idx = this._parseUnary();
        this._skipNoise();
        this._expect(TokenType.WORD, 'of');
        const obj = this._parseUnary();
        return new IndexExpr(obj, idx, tok.line, tok.column);
      } catch (e) {
        this.pos = saved;
      }
    }

    // TEXT literal
    if (tok.type === TokenType.TEXT) {
      this._advance();
      return new LiteralExpr('text', tok.value, tok.line, tok.column);
    }

    // `` `command` `` — capture stdout (Unix command substitution)
    if (tok.type === TokenType.COMMAND) {
      this._advance();
      const lit = new LiteralExpr('text', tok.value, tok.line, tok.column);
      return new ShellExpr(lit, tok.line, tok.column);
    }

    // HEREDOC literal
    if (tok.type === TokenType.HEREDOC) {
      this._advance();
      return new LiteralExpr('heredoc', tok.value, tok.line, tok.column);
    }

    // BRACEBLOCK literal (raw text between { })
    if (tok.type === TokenType.BRACEBLOCK) {
      this._advance();
      return new LiteralExpr('braceblock', tok.value, tok.line, tok.column);
    }

    // INTERPOLATED string (contains ${var})
    if (tok.type === TokenType.INTERPOLATED) {
      this._advance();
      return new LiteralExpr('interpolated', tok.value, tok.line, tok.column);
    }

    // Parenthesized expression (side-note)
    if (tok.type === TokenType.LPAREN) {
      return this._parseParenExpr();
    }

    // Dictionary access: "value for ... inside ..."
    // (leading "the" already skipped above)
    if (tok.type === TokenType.WORD &&
        tok.value.toLowerCase() === 'value') {
      const savedPos = this.pos;
      this._advance(); // consume "value"

      // Skip decorative words between "value" and "for"
      while (this._current().type === TokenType.WORD &&
             (this._current().value.toLowerCase() === 'a' ||
              this._current().value.toLowerCase() === 'an' ||
              this._current().value.toLowerCase() === 'the')) {
        this._advance();
      }

      if (this._check(TokenType.WORD, 'for')) {
        this._advance(); // consume "for"

        // Parse the key (usually a TEXT literal)
        const key = this._parsePrimary();

        // Skip decorative words before "inside"
        while (this._current().type === TokenType.WORD &&
               (this._current().value.toLowerCase() === 'a' ||
                this._current().value.toLowerCase() === 'an' ||
                this._current().value.toLowerCase() === 'the')) {
          this._advance();
        }

        this._expect(TokenType.WORD, 'inside');

        const dictTok = this._expect(TokenType.WORD);
        this._assertVarName(dictTok.value, dictTok);
        return new DictionaryAccessExpr(
          dictTok.value, key,
          tok.line, tok.column
        );
      }
      // Not a dictionary access, backtrack
      this.pos = savedPos;
      // Fall through to word handling below
    }

    // Shell output expression: "the output of the shell command ..."
    // or just "output of the shell command ..." (if "the" was already skipped as article)
    if (tok.type === TokenType.WORD) {
      const tokLower = tok.value.toLowerCase();
      if (tokLower === 'the' || tokLower === 'output') {
        const savedPos = this.pos;

        if (tokLower === 'the') {
          this._advance(); // consume "the"
          // Skip decorative articles
          while (this._current().type === TokenType.WORD &&
                 (this._current().value.toLowerCase() === 'a' ||
                  this._current().value.toLowerCase() === 'an' ||
                  this._current().value.toLowerCase() === 'the')) {
            this._advance();
          }
        }
        // Now current should be "output"
        if (this._check(TokenType.WORD, 'output')) {
          this._advance(); // consume "output"
          this._skipNoise();
          this._expect(TokenType.WORD, 'of');
          this._skipNoise();
          // Optional "the"
          this._match(TokenType.WORD, 'the');
          this._match(TokenType.WORD, 'shell');
          this._expect(TokenType.WORD, 'command');

          const cmdExpr = this._parseCommandArg();
          return new ShellExpr(cmdExpr, tok.line, tok.column);
        }
        // Not a shell expression, backtrack
        this.pos = savedPos;
        // Fall through to word handling below
      }
    }

    // JSON parse: "the parsed JSON of [expr]" or just "parsed JSON of"
    {
      const savedPos = this.pos;
      // Either we're at "the" (not yet skipped) or "parsed" (articles already skipped)
      if (this._check(TokenType.WORD, 'the')) {
        this._advance();
        while (this._current().type === TokenType.WORD &&
               (this._current().value.toLowerCase() === 'a' ||
                this._current().value.toLowerCase() === 'an' ||
                this._current().value.toLowerCase() === 'the')) {
          this._advance();
        }
      }
      if (this._check(TokenType.WORD, 'parsed')) {
        this._advance();
        this._skipNoise();
        const jsonTok = this._current();
        if (jsonTok.type === TokenType.WORD &&
            jsonTok.value.toLowerCase() === 'json') {
          this._advance();
          this._skipNoise();
          this._expect(TokenType.WORD, 'of');
          const sourceExpr = this.parseExpression();
          return new JsonParseExpr(sourceExpr, tok.line, tok.column);
        }
      }
      this.pos = savedPos;
    }

    // Environment variable: "the environment variable [expr]"
    if (tok.type === TokenType.WORD &&
        (tok.value.toLowerCase() === 'the' || tok.value.toLowerCase() === 'environment')) {
      const savedPos = this.pos;
      if (tok.value.toLowerCase() === 'the') {
        this._advance();
        while (this._current().type === TokenType.WORD &&
               (this._current().value.toLowerCase() === 'a' ||
                this._current().value.toLowerCase() === 'an' ||
                this._current().value.toLowerCase() === 'the')) {
          this._advance();
        }
      }
      if (this._check(TokenType.WORD, 'environment')) {
        this._advance();
        this._skipNoise();
        this._match(TokenType.WORD, 'variable');
        const nameExpr = this.parseExpression();
        return new EnvVarExpr(nameExpr, tok.line, tok.column);
      }
      // Check for "fetched content of the url"
      if (this._check(TokenType.WORD, 'fetched')) {
        this._advance();
        this._skipNoise();
        this._match(TokenType.WORD, 'content');
        this._skipNoise();
        this._expect(TokenType.WORD, 'of');
        this._skipNoise();
        this._match(TokenType.WORD, 'the');
        this._match(TokenType.WORD, 'url');
        const urlExpr = this.parseExpression();
        return new FetchExpr(urlExpr, tok.line, tok.column);
      }
      this.pos = savedPos;
    }

    // Map: "every item in List transformed by Verb"
    // Filter: "every item in List where condition"
    // Sum: "the sum of List"
    // List files: "the list of files in Dir"
    if (tok.type === TokenType.WORD) {
      const tokLower = tok.value.toLowerCase();
      if (tokLower === 'every-item-in') {
        this._advance();
        const sourceExpr = this.parseExpression();
        this._skipNoise();
        if (this._match(TokenType.WORD, 'transformed') || this._check(TokenType.WORD, 'transformed-by') ||
            this._check(TokenType.WORD, 'mapped-by')) {
          if (this._current().value.toLowerCase().endsWith('-by')) this._advance();
          else {
            this._advance();
            this._skipNoise();
            this._match(TokenType.WORD, 'by');
          }
          const verbName = this._expect(TokenType.WORD).value;
          return new MapExpr(sourceExpr, verbName, tok.line, tok.column);
        }
        if (this._match(TokenType.WORD, 'where')) {
          return new FilterExpr(sourceExpr, this.parseExpression(), tok.line, tok.column);
        }
      }
      if (tokLower === 'every') {
        const savedPos = this.pos;
        this._advance(); // consume "Every"
        this._skipNoise();
        this._match(TokenType.WORD, 'item');
        this._skipNoise();
        this._expect(TokenType.WORD, 'in');
        const sourceExpr = this.parseExpression();
        this._skipNoise();
        if (this._match(TokenType.WORD, 'transformed')) {
          this._skipNoise();
          this._expect(TokenType.WORD, 'by');
          const verbNameTok = this._expect(TokenType.WORD);
          if (!this._isCapitalized(verbNameTok.value)) {
            this.pos = savedPos;
          } else {
            return new MapExpr(sourceExpr, verbNameTok.value, tok.line, tok.column);
          }
        }
        if (this._match(TokenType.WORD, 'where')) {
          const condition = this.parseExpression();
          return new FilterExpr(sourceExpr, condition, tok.line, tok.column);
        }
        this.pos = savedPos;
      }
      if (tokLower === 'the' || tokLower === 'sum' || tokLower === 'list') {
        const savedPos = this.pos;
        if (tokLower === 'the') { this._advance(); this._skipNoise(); }
        if (this._check(TokenType.WORD, 'sum')) {
          this._advance(); this._skipNoise();
          this._expect(TokenType.WORD, 'of');
          return new SumExpr(this.parseExpression(), tok.line, tok.column);
        }
        if (this._check(TokenType.WORD, 'list')) {
          this._advance(); this._skipNoise();
          this._expect(TokenType.WORD, 'of');
          this._match(TokenType.WORD, 'files'); this._skipNoise();
          this._expect(TokenType.WORD, 'in');
          return new ListFilesExpr(this.parseExpression(), tok.line, tok.column);
        }
        this.pos = savedPos;
      }
    }

    // `Keep SOURCE filtered-by CONDITION`
    if (tok.type === TokenType.WORD && tok.value.toLowerCase() === 'keep' &&
        this._isCapitalized(tok.value)) {
      this._advance();
      const sourceExpr = this._parsePrimary();
      this._skipNoise();
      if (!this._match(TokenType.WORD, 'filtered-by') && !this._match(TokenType.WORD, 'where')) {
        throw new SyntaxError('Expected filtered-by', tok.line, tok.column);
      }
      const condition = this.parseExpression();
      return new KeepExpr(sourceExpr, condition, tok.line, tok.column);
    }

    // `dictionary of field is value and field is value`
    if (tok.type === TokenType.WORD && tok.value.toLowerCase() === 'dictionary' &&
        this._isCapitalized(tok.value)) {
      this._advance();
      this._skipNoise();
      this._match(TokenType.WORD, 'of');
      const pairs = [];
      while (this._check(TokenType.WORD)) {
        const key = this._advance().value;
        this._skipNoise();
        if (!this._match(TokenType.WORD, 'is')) break;
        const val = this._parsePrimary();
        pairs.push({ key, value: val });
        this._skipNoise();
        if (!this._match(TokenType.WORD, 'and')) break;
      }
      return new DictLiteralExpr(pairs, tok.line, tok.column);
    }

    // Variable or property access or `name of X`
    if (tok.type === TokenType.WORD) {
      const wordTok = this._advance();

      // Check for possessive: Entity's property
      if (this._check(TokenType.POSSESSIVE)) {
        this._advance(); // consume 's
        while (this._current().type === TokenType.WORD &&
               (this._current().value.toLowerCase() === 'a' ||
                this._current().value.toLowerCase() === 'an' ||
                this._current().value.toLowerCase() === 'the')) {
          this._advance();
        }
        const propTok = this._expect(TokenType.WORD);
        this._assertVarName(wordTok.value, wordTok);
        return new PropertyAccessExpr(
          wordTok.value, propTok.value,
          wordTok.line, wordTok.column
        );
      }

      // `name of entity`
      if (this._check(TokenType.WORD, 'of')) {
        this._advance();
        const obj = this._parsePrimary();
        return new OfPropertyExpr(wordTok.value, obj, wordTok.line, wordTok.column);
      }

      this._assertVarName(wordTok.value, wordTok);
      return new VariableExpr(wordTok.value, wordTok.line, wordTok.column);
    }

    // No primary expression found
    throw new SyntaxError(
      `Expected expression but got ${tok.type}("${tok.value}")`,
      tok.line, tok.column
    );
  }

  /**
   * Parse a parenthesized side-note expression.
   * `(...)` evaluates the inner content as a statement/expression
   * and returns its text value.
   */
  _parseParenExpr() {
    const lparenTok = this._expect(TokenType.LPAREN);

    // Parse the inner content as an inline statement
    const inner = this.parseInlineStatement();

    this._expect(TokenType.RPAREN);

    // Return as a special expression that wraps the inner statement
    return new CallExpr(
      '__paren__', // special internal name
      [inner],     // pass the statement as argument for evaluation
      lparenTok.line, lparenTok.column
    );
  }

  /**
   * `the number`, `the nearest number`, `the Active Admin`, `the Client's name`.
   * Returns null if this `the` belongs to another form (output of, parsed JSON, ...).
   */
  _tryParseTheRef() {
    const saved = this.pos;
    const theTok = this._advance(); // consume "the"

    // Defer to existing special forms
    const next = this._current();
    if (next.type === TokenType.WORD) {
      const nl = next.value.toLowerCase();
      if (['output', 'parsed', 'environment', 'fetched', 'sum', 'list', 'value'].includes(nl)) {
        this.pos = saved;
        return null;
      }
    }

    // the nearest number / the number
    if (this._check(TokenType.WORD, 'nearest')) {
      this._advance();
      this._match(TokenType.WORD, 'number');
      return new CorefExpr('number', ['nearest', 'number'], theTok.line, theTok.column);
    }
    if (this._check(TokenType.WORD, 'number') &&
        !(this._peek(1)?.type === TokenType.WORD && this._peek(1).value.toLowerCase() === 'of')) {
      this._advance();
      return new CorefExpr('number', ['number'], theTok.line, theTok.column);
    }

    const words = [];
    while (this._check(TokenType.WORD) &&
           !PHRASE_STOP.has(this._current().value.toLowerCase())) {
      words.push(this._advance().value);
      if (this._check(TokenType.POSSESSIVE)) {
        this._advance();
        const prop = this._expect(TokenType.WORD).value;
        const obj = new CorefExpr('phrase', words, theTok.line, theTok.column);
        return new OfPropertyExpr(prop, obj, theTok.line, theTok.column);
      }
    }

    if (words.length === 0) {
      this.pos = saved;
      return null;
    }

    // `the using number` — role + type
    if (words.length >= 2 && ROLE_FILLERS.has(words[0].toLowerCase())) {
      return new CorefExpr('role', words, theTok.line, theTok.column);
    }

    return new CorefExpr('phrase', words, theTok.line, theTok.column);
  }
}
