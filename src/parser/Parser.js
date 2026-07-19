/**
 * parser/Parser.js - Recursive descent parser for the Prose language.
 *
 * Strategy: The parser uses a pattern-matching approach where each
 * sentence shape is tried against the token stream. Articles (a, an, the)
 * and certain noise words are skipped during matching. The parser handles
 * indentation-sensitive blocks via consumeBlock().
 */

import { TokenType, ARTICLES } from '../lexer/Token.js';
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
  'a', 'an', 'the',
]);

export class Parser {
  /**
   * @param {import('../lexer/Token.js').Token[]} tokens
   */
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
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

  /** Skip noise words and articles without consuming structural tokens */
  _skipNoise() {
    while (this._current().type === TokenType.WORD &&
           NOISE.has(this._current().value.toLowerCase())) {
      this._advance();
    }
  }

  /** Skip until we hit a specific token type */
  _skipPast(type) {
    while (this.pos < this.tokens.length && this._current().type !== type) {
      this._advance();
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
          statements.push(stmt);
        }
      } catch (e) {
        if (e instanceof SyntaxError) {
          // Try to recover: skip to next sentence (PERIOD + NEWLINE)
          logger.warn(`Parse error: ${e.message} — attempting recovery`);
          this._skipPast(TokenType.PERIOD);
          if (this._check(TokenType.PERIOD)) this._advance();
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
    const savedPos = this.pos;

    // Try each statement pattern in order
    const patterns = [
      () => this._parseLabel(),
      () => this._parseWhenever(),
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
      () => this._parseReadFile(),       // Read the file "..." into X.
      () => this._parseWriteFile(),      // Write ... to the file "...".
      () => this._parseInclude(),        // Include "file.prose".
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
   * Consume a block of indented statements.
   * Expects: COLON NEWLINE INDENT statements... DEDENT
   * @returns {Stmt[]}
   */
  consumeBlock() {
    const colonTok = this._expect(TokenType.COLON);
    // Allow optional newline before the INDENT
    const savedPos = this.pos;
    // Actually, after COLON, we either have NEWLINE INDENT or blank lines then INDENT
    // Skip any intervening NEWLINEs
    while (this._check(TokenType.NEWLINE)) {
      this._advance();
    }

    if (!this._check(TokenType.INDENT)) {
      // Single-line block: parse a single statement on the same line after colon
      // (Some constructs might allow this, but for now require indented block)
      throw new SyntaxError(
        'Expected indented block after colon',
        colonTok.line, colonTok.column
      );
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

  /** `Label "name".` */
  _parseLabel() {
    this._skipNoise();
    if (!this._match(TokenType.WORD, 'label')) return null;
    const textTok = this._expect(TokenType.TEXT);
    this._expect(TokenType.PERIOD);
    return new LabelStmt(textTok.value, textTok.line, textTok.column);
  }

  /** `Jump to the label "name".` */
  _parseJump() {
    this._skipNoise();
    if (!this._match(TokenType.WORD, 'jump')) return null;
    this._skipNoise(); // skip "to the"
    while (this._check(TokenType.WORD) &&
           this._current().value.toLowerCase() !== 'label') {
      this._advance(); // skip noise words
    }
    this._match(TokenType.WORD, 'label'); // consume "label"
    const textTok = this._expect(TokenType.TEXT);
    this._expect(TokenType.PERIOD);
    return new JumpStmt(textTok.value, textTok.line, textTok.column);
  }

  /** `Using [verbName] parse { dslContent }` */
  _parseUsing() {
    this._skipNoise();
    const usingTok = this._match(TokenType.WORD, 'using');
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

  /** `Execute the shell command "..."` */
  _parseShellStmt() {
    this._skipNoise();
    const execTok = this._match(TokenType.WORD, 'execute');
    if (!execTok) return null;

    // Match "the shell command" explicitly (no _skipNoise that would eat "the")
    if (!this._match(TokenType.WORD, 'the')) return null;
    this._match(TokenType.WORD, 'shell');
    this._expect(TokenType.WORD, 'command');

    const cmdExpr = this.parseExpression();
    this._expect(TokenType.PERIOD);

    return new ShellStmt(cmdExpr, execTok.line, execTok.column);
  }

  /** `Run the shell command "a" and pipe to "b".` */
  _parsePipeShell() {
    this._skipNoise();
    const runTok = this._match(TokenType.WORD, 'run');
    if (!runTok) return null;
    this._skipNoise();
    this._match(TokenType.WORD, 'the');
    this._match(TokenType.WORD, 'shell');
    this._expect(TokenType.WORD, 'command');
    const cmd1 = this._parsePrimary(); // Don't use parseExpression (avoids "and" as logical op)
    this._skipNoise();
    this._expect(TokenType.WORD, 'and');
    this._skipNoise();
    this._match(TokenType.WORD, 'pipe');
    this._skipNoise();
    this._match(TokenType.WORD, 'to');
    const cmd2 = this._parsePrimary();
    this._expect(TokenType.PERIOD);
    return new PipeShellStmt(cmd1, cmd2, runTok.line, runTok.column);
  }

  /** `Include "file.prose".` */
  _parseInclude() {
    this._skipNoise();
    const inclTok = this._match(TokenType.WORD, 'include');
    if (!inclTok) return null;
    const pathExpr = this.parseExpression();
    this._expect(TokenType.PERIOD);
    return new IncludeStmt(pathExpr, inclTok.line, inclTok.column);
  }

  /** `Try: ... Catch: ...` or `Try: ... Catch the error: ...` */
  _parseTry() {
    const tryTok = this._match(TokenType.WORD, 'try');
    if (!tryTok) return null;

    const tryBlock = this.consumeBlock();

    // Skip NEWLINEs before Catch
    while (this._check(TokenType.NEWLINE)) this._advance();

    if (!this._match(TokenType.WORD, 'catch')) {
      throw new SyntaxError('Expected "Catch" after Try block', tryTok.line, tryTok.column);
    }

    // Optional: "the error" or "the error into X"
    // Don't _skipNoise here - "the" could be the next word
    let errorVar = null;
    if (this._match(TokenType.WORD, 'the')) {
      this._match(TokenType.WORD, 'error');
      if (this._match(TokenType.WORD, 'into')) {
        errorVar = this._expect(TokenType.WORD).value;
      }
    }

    const catchBlock = this.consumeBlock();

    return new TryStmt(tryBlock, catchBlock, errorVar, tryTok.line, tryTok.column);
  }

  /** `Read the file [path] into [var].` */
  _parseReadFile() {
    this._skipNoise();
    const readTok = this._match(TokenType.WORD, 'read');
    if (!readTok) return null;

    this._skipNoise();
    this._match(TokenType.WORD, 'the');
    this._expect(TokenType.WORD, 'file');

    const pathExpr = this.parseExpression();

    this._skipNoise();
    this._expect(TokenType.WORD, 'into');

    const varTok = this._expect(TokenType.WORD);
    this._expect(TokenType.PERIOD);

    return new ReadFileStmt(pathExpr, varTok.value, readTok.line, readTok.column);
  }

  /** `Write [expr] to the file [path].` */
  _parseWriteFile() {
    this._skipNoise();
    const writeTok = this._match(TokenType.WORD, 'write');
    if (!writeTok) return null;

    const valueExpr = this.parseExpression();

    this._skipNoise();
    this._expect(TokenType.WORD, 'to');
    this._skipNoise();
    this._match(TokenType.WORD, 'the');
    this._expect(TokenType.WORD, 'file');

    const pathExpr = this.parseExpression();
    this._expect(TokenType.PERIOD);

    return new WriteFileStmt(valueExpr, pathExpr, writeTok.line, writeTok.column);
  }

  /** `Execute the text inside varName.` */
  _parseExecute() {
    this._skipNoise();
    if (!this._match(TokenType.WORD, 'execute')) return null;
    this._skipNoise(); // skip articles like "the"
    // Explicitly consume "the", "text", "inside" if present
    this._match(TokenType.WORD, 'the');
    this._match(TokenType.WORD, 'text');
    this._match(TokenType.WORD, 'inside');
    const varTok = this._expect(TokenType.WORD);
    this._expect(TokenType.PERIOD);
    return new ExecuteStmt(varTok.value, varTok.line, varTok.column);
  }

  /** `A Type named VarName exists.` or `A Text named X exists as follows until TERM: ... TERM` */
  _parseVariableDecl() {
    // Match "A" or "An" directly before skipping noise (it's structural here)
    const articleTok = this._match(TokenType.WORD, 'a') || this._match(TokenType.WORD, 'an');
    if (!articleTok) return null;
    this._skipNoise(); // skip any articles between "a" and the type

    const typeTok = this._current();
    // Type is a WORD (capitalized conventionally)
    if (typeTok.type !== TokenType.WORD) return null;

    // Peek ahead: check that the full pattern "A Type named Name exists" is present
    // to avoid greedily matching assignments like "A is 10."
    const savedPos = this.pos;
    this._advance(); // consume tentative type
    this._skipNoise();
    if (!this._match(TokenType.WORD, 'named')) {
      this.pos = savedPos; // backtrack: not a declaration
      return null;
    }
    // "named" matched, now check for name + "exists"
    if (!this._check(TokenType.WORD)) {
      this.pos = savedPos;
      return null;
    }
    const nameTok = this._advance(); // consume name
    this._skipNoise();
    if (!this._match(TokenType.WORD, 'exists')) {
      this.pos = savedPos; // not a declaration
      return null;
    }

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

    this._expect(TokenType.PERIOD);
    return new VariableDeclaration(
      typeTok.value, nameTok.value,
      typeTok.line, typeTok.column
    );
  }

  /** `X is expr.` or `Entity's prop is expr.` */
  _parseAssignment() {
    const firstTok = this._current();
    if (firstTok.type !== TokenType.WORD) {
      return null;
    }

    let entity = null;
    let target;

    // Look ahead for possessive
    if (this._peek(1)?.type === TokenType.POSSESSIVE) {
      entity = firstTok.value;
      this._advance(); // consume entity name
      this._advance(); // consume 's
      target = this._expect(TokenType.WORD).value;
    } else if (this._peek(1)?.type === TokenType.WORD &&
               this._peek(1)?.value.toLowerCase() === 'is') {
      target = firstTok.value;
      this._advance(); // consume target
    } else {
      return null;
    }

    this._skipNoise();
    this._expect(TokenType.WORD, 'is');

    this._skipNoise();
    const value = this.parseExpression();
    this._expect(TokenType.PERIOD);

    // REMOVE AFTER DEBUG: console.log(`_parseAssignment: returning Assignment(${target}, ...)`);
    return new Assignment(
      entity, target, value,
      firstTok.line, firstTok.column
    );
  }

  /** `Print expr.` or `Print expr followed by expr.` */
  _parsePrint() {
    this._skipNoise();
    const printTok = this._match(TokenType.WORD, 'print');
    if (!printTok) return null;

    this._skipNoise();
    const expr = this.parseExpression();
    this._expect(TokenType.PERIOD);

    return new PrintStmt(expr, printTok.line, printTok.column);
  }

  /** `If expr: [block] (Otherwise: [block])? (Otherwise if expr: [block])*` */
  _parseIf() {
    const ifTok = this._match(TokenType.WORD, 'if');
    if (!ifTok) return null;

    // Don't _skipNoise here - the condition may start with a variable named "A"
    const condition = this.parseExpression();
    const thenBlock = this.consumeBlock();

    let elseBlock = [];
    const elseIfs = [];

    // Check for "Otherwise:" or "Otherwise if:"
    while (true) {
      const savedPos = this.pos;
      while (this._check(TokenType.NEWLINE)) this._advance();
      this._skipNoise();

      if (!this._match(TokenType.WORD, 'otherwise')) {
        this.pos = savedPos;
        break;
      }

      // Check if it's "Otherwise if condition:"
      this._skipNoise();
      if (this._match(TokenType.WORD, 'if')) {
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
    const whileTok = this._match(TokenType.WORD, 'while');
    if (!whileTok) return null;
    const condition = this.parseExpression();
    const body = this.consumeBlock();

    return new WhileStmt(condition, body, whileTok.line, whileTok.column);
  }

  /** `For every var in collection: [block]` */
  _parseForEvery() {
    this._skipNoise();
    if (!this._match(TokenType.WORD, 'for')) return null;
    this._skipNoise();
    this._expect(TokenType.WORD, 'every');
    const varTok = this._expect(TokenType.WORD);
    this._skipNoise();
    this._expect(TokenType.WORD, 'in');
    const collTok = this._expect(TokenType.WORD);
    const body = this.consumeBlock();

    return new ForEveryStmt(
      varTok.value, collTok.value, body,
      varTok.line, varTok.column
    );
  }

  /** `For every Number from X to Y:` */
  _parseRangeFor() {
    this._skipNoise();
    const forTok = this._match(TokenType.WORD, 'for');
    if (!forTok) return null;
    this._skipNoise();
    if (!this._match(TokenType.WORD, 'every')) return null;

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

  /** `To verbName param1 param2 ...: [block]` */
  _parseVerbDefinition() {
    this._skipNoise();
    const toTok = this._match(TokenType.WORD, 'to');
    if (!toTok) return null;

    const verbNameTok = this._expect(TokenType.WORD);
    const verbName = verbNameTok.value;

    // Read parameters (WORDs before COLON, excluding articles)
    const params = [];
    while (this.pos < this.tokens.length &&
           this._current().type === TokenType.WORD &&
           this._current().value.toLowerCase() !== 'to') {
      const paramWord = this._advance().value;
      // Skip articles (a, an, the) in parameter list
      const lower = paramWord.toLowerCase();
      if (lower !== 'a' && lower !== 'an' && lower !== 'the') {
        params.push(paramWord);
      }
    }

    const body = this.consumeBlock();

    return new VerbDefinition(
      verbName, params, body,
      toTok.line, toTok.column
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
      'dictionary', 'account', 'system', 'user', 'value',
    ]);
    if (keywords.has(lower)) return null;

    // Check if this looks like a verb call: WORD WORD ... PERIOD
    // (not followed by 's or "is")
    if (this._peek(1)?.type === TokenType.POSSESSIVE) return null;
    if (this._peek(1)?.type === TokenType.WORD &&
        this._peek(1)?.value.toLowerCase() === 'is') return null;

    this._advance(); // consume verb name

    // Read arguments (everything up to PERIOD, COLON, NEWLINE, or RPAREN)
    const args = [];
    while (this.pos < this.tokens.length &&
           this._current().type !== TokenType.PERIOD &&
           this._current().type !== TokenType.COLON &&
           this._current().type !== TokenType.NEWLINE &&
           this._current().type !== TokenType.RPAREN) {
      // Skip noise words
      if (this._current().type === TokenType.WORD &&
          NOISE.has(this._current().value.toLowerCase())) {
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
      this._expect(TokenType.PERIOD);
    }

    return new VerbCall(
      verbTok.value, args,
      verbTok.line, verbTok.column
    );
  }

  /** `Inside dictName, "key" maps to expr.` */
  _parseDictionarySet() {
    this._skipNoise();
    if (!this._match(TokenType.WORD, 'inside')) return null;

    const dictTok = this._expect(TokenType.WORD);
    this._match(TokenType.COMMA); // optional comma

    // key can be TEXT or expression
    const key = this.parseExpression();

    this._skipNoise();
    this._expect(TokenType.WORD, 'maps');
    this._skipNoise();
    this._expect(TokenType.WORD, 'to');

    const value = this.parseExpression();
    this._expect(TokenType.PERIOD);

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

    this._expect(TokenType.PERIOD);

    return new ListAddStmt(
      listTok.value, items,
      listTok.line, listTok.column
    );
  }

  /** `Find every Type in collection whose property is expr.` */
  _parseQuery() {
    this._skipNoise();
    if (!this._match(TokenType.WORD, 'find')) return null;

    this._skipNoise();
    this._expect(TokenType.WORD, 'every');
    const typeTok = this._expect(TokenType.WORD);
    this._skipNoise();
    this._expect(TokenType.WORD, 'in');
    const collTok = this._expect(TokenType.WORD);
    this._skipNoise();

    // Skip up to "whose"
    while (this._current().type === TokenType.WORD &&
           this._current().value.toLowerCase() !== 'whose') {
      this._advance();
    }
    this._expect(TokenType.WORD, 'whose');

    const propTok = this._expect(TokenType.WORD);
    this._skipNoise();
    this._expect(TokenType.WORD, 'is');

    const value = this.parseExpression();
    this._expect(TokenType.PERIOD);

    return new QueryStmt(
      typeTok.value, collTok.value, propTok.value, value,
      typeTok.line, typeTok.column
    );
  }

  /** `Whenever entity's prop changes: [block]` */
  _parseWhenever() {
    this._skipNoise();
    const wheneverTok = this._match(TokenType.WORD, 'whenever');
    if (!wheneverTok) return null;

    const entityTok = this._expect(TokenType.WORD);
    let propertyName = null;

    if (this._check(TokenType.POSSESSIVE)) {
      this._advance(); // consume 's
      propertyName = this._expect(TokenType.WORD).value;
    } else {
      // "Core's status" pattern - possessive next
      // Already handled above. If no possessive, "Core changes" maybe?
      // Skip noise words
      while (this._check(TokenType.WORD) &&
             this._current().value.toLowerCase() !== 'changes') {
        this._advance();
      }
    }

    this._skipNoise();
    // Skip "changes" if present
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

  /** `Increase/Lower/Set target by/to expr.` */
  _parseMutation() {
    this._skipNoise();
    const opTok = this._current();
    if (opTok.type !== TokenType.WORD) return null;

    const opLower = opTok.value.toLowerCase();
    let operation = null;
    if (opLower === 'increase') operation = 'increase';
    else if (opLower === 'lower' || opLower === 'decrease') operation = 'decrease';
    else if (opLower === 'set') operation = 'set';
    else return null;

    this._advance(); // consume operation word

    // Check for possessive pattern: `Lower Entity's prop by expr.`
    let entity = null;
    let target;

    const targetTok = this._expect(TokenType.WORD);

    if (this._check(TokenType.POSSESSIVE)) {
      entity = targetTok.value;
      this._advance(); // consume 's
      target = this._expect(TokenType.WORD).value;
    } else {
      target = targetTok.value;
    }

    this._skipNoise();

    // "by" or "to" depending on operation
    if (operation === 'set') {
      this._expect(TokenType.WORD, 'to');
    } else {
      this._expect(TokenType.WORD, 'by');
    }

    const value = this.parseExpression();
    this._expect(TokenType.PERIOD);

    return new MutationStmt(
      operation, entity, target, value,
      opTok.line, opTok.column
    );
  }

  /** `Result is expr.` */
  _parseResult() {
    this._skipNoise();
    const resultTok = this._match(TokenType.WORD, 'result');
    if (!resultTok) return null;

    this._skipNoise();
    this._expect(TokenType.WORD, 'is');

    const value = this.parseExpression();
    this._expect(TokenType.PERIOD);

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
  _parseBinaryOp() {
    let left = this._parsePrimary();

    while (true) {
      this._skipNoise();

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

    // TEXT literal
    if (tok.type === TokenType.TEXT) {
      this._advance();
      return new LiteralExpr('text', tok.value, tok.line, tok.column);
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

          const cmdExpr = this.parseExpression();
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

    // Variable or property access
    if (tok.type === TokenType.WORD) {
      const wordTok = this._advance();

      // Check for possessive: Entity's property
      if (this._check(TokenType.POSSESSIVE)) {
        this._advance(); // consume 's
        // Skip decorative articles
        while (this._current().type === TokenType.WORD &&
               (this._current().value.toLowerCase() === 'a' ||
                this._current().value.toLowerCase() === 'an' ||
                this._current().value.toLowerCase() === 'the')) {
          this._advance();
        }
        const propTok = this._expect(TokenType.WORD);
        return new PropertyAccessExpr(
          wordTok.value, propTok.value,
          wordTok.line, wordTok.column
        );
      }

      // Simple variable reference
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
}
