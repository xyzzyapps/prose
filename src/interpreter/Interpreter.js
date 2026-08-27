/**
 * interpreter/Interpreter.js - Tree-walking interpreter for Prose.
 *
 * Walks the AST produced by the parser and evaluates it against
 * the runtime environment. Supports:
 *   - All statement types
 *   - Verb (function) definition and calling
 *   - Goto via Label/Jump
 *   - Whenever reactive watchers
 *   - Dynamic code execution (Execute)
 *   - Parenthesized side-note evaluation
 */

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
} from '../parser/AST.js';
import {
  NumberValue, TextValue, EntityValue,
  ListValue, DictionaryValue, NULL, ReactiveWatcher,
  ShellResultValue,
} from '../core/Value.js';
import { Environment, VerbDefinition as VerbDef } from '../core/Environment.js';
import { ProseError, RuntimeError, NameError, TypeError, CoreferenceError } from '../core/Errors.js';
import { ANAPHORS, getProperty, setProperty } from '../core/Discourse.js';
import { Logger } from '../core/Logger.js';
import { registerBuiltins } from './Builtins.js';
import { Lexer } from '../lexer/Lexer.js';
import { Parser } from '../parser/Parser.js';
import * as child_process from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const logger = new Logger('interpreter');

/**
 * Thrown when a Jump statement is executed.
 * The interpreter catches this to reposition the program counter.
 */
class GotoSignal {
  /**
   * @param {string} labelName
   */
  constructor(labelName) {
    this.labelName = labelName;
  }
}

/**
 * Thrown when a Result statement is executed inside a verb.
 * Carries the return value.
 */
class ReturnSignal {
  /**
   * @param {Value} value
   */
  constructor(value) {
    this.value = value;
  }
}

class BreakSignal {}
class ContinueSignal {}

export class Interpreter {
  /**
   * @param {Environment} [environment]
   */
  constructor(environment = null) {
    /** @type {Environment} */
    this.env = environment || new Environment();
    /** @type {string[]} accumulated output lines */
    this.outputBuffer = [];
    /** @type {Map<string, number>} label -> statement index */
    this.labelMap = new Map();
    /** Counter for preventing infinite watcher loops */
    this.watcherDepth = 0;
    this.maxWatcherDepth = 100;
    /** The current statements being executed (for goto) */
    this.statements = [];
    this.pc = 0;

    // Register builtins
    registerBuiltins(this.env, this);
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Interpret a parsed program.
   * @param {Program} program
   * @returns {{ output: string, result: Value }}
   */
  interpret(program) {
    this.outputBuffer = [];
    this.labelMap.clear();
    this.statements = program.statements;

    logger.debug(`Interpreting ${this.statements.length} statements`);

    // First pass: register all labels
    this._registerLabels();

    // Second pass: execute
    this.pc = 0;
    while (this.pc < this.statements.length) {
      const stmt = this.statements[this.pc];
      this.pc++;
      try {
        this.execute(stmt);
      } catch (e) {
        if (e instanceof GotoSignal) {
          const target = this.labelMap.get(e.labelName);
          if (target !== undefined) {
            logger.debug(`Goto: jumping to label "${e.labelName}" at index ${target}`);
            this.pc = target;
          } else {
            throw new RuntimeError(
              `Label "${e.labelName}" not found`,
              stmt.line, stmt.column
            );
          }
        } else if (e instanceof ReturnSignal) {
          // Return from top level - just capture the value
          return { output: this.outputBuffer.join('\n'), result: e.value };
        } else {
          throw e;
        }
      }
    }

    return {
      output: this.outputBuffer.join('\n'),
      result: NULL
    };
  }

  /**
   * Evaluate an expression and return its value.
   * @param {import('../parser/AST.js').Expr} expr
   * @returns {Value}
   */
  evaluate(expr) {
    if (!expr) return NULL;

    switch (expr.constructor) {
      case LiteralExpr: return this._evalLiteral(expr);
      case VariableExpr: return this._evalVariable(expr);
      case PropertyAccessExpr: return this._evalPropertyAccess(expr);
      case BinaryOpExpr: return this._evalBinaryOp(expr);
      case CallExpr: return this._evalCallExpr(expr);
      case DictionaryAccessExpr: return this._evalDictionaryAccess(expr);
      case ShellExpr: return this._evalShellExpr(expr);
      case JsonParseExpr: return this._evalJsonParse(expr);
      case LogicalExpr: return this._evalLogical(expr);
      case EnvVarExpr: return this._evalEnvVar(expr);
      case FetchExpr: return this._evalFetch(expr);
      case MapExpr: return this._evalMap(expr);
      case FilterExpr: return this._evalFilter(expr);
      case SumExpr: return this._evalSum(expr);
      case ListFilesExpr: return this._evalListFiles(expr);
      case CorefExpr: return this._evalCoref(expr);
      case OfPropertyExpr: return this._evalOfProperty(expr);
      case DictLiteralExpr: return this._evalDictLiteral(expr);
      case KeepExpr: return this._evalKeep(expr);
      case UnaryExpr: return this._evalUnary(expr);
      case IndexExpr: return this._evalIndex(expr);
      case FieldAccessExpr: return this._evalField(expr);
      default:
        throw new RuntimeError(
          `Unknown expression type: ${expr.constructor.name}`,
          expr.line, expr.column
        );
    }
  }

  /**
   * Execute a single statement.
   * @param {import('../parser/AST.js').Stmt} stmt
   * @returns {Value}
   */
  execute(stmt) {
    if (!stmt) return NULL;

    switch (stmt.constructor) {
      case VariableDeclaration: return this._execVariableDecl(stmt);
      case Assignment: return this._execAssignment(stmt);
      case PrintStmt: return this._execPrint(stmt);
      case IfStmt: return this._execIf(stmt);
      case WhileStmt: return this._execWhile(stmt);
      case ForEveryStmt: return this._execForEvery(stmt);
      case VerbDefinition: return this._execVerbDef(stmt);
      case VerbCall: return this._execVerbCall(stmt);
      case LabelStmt: return this._execLabel(stmt);
      case JumpStmt: return this._execJump(stmt);
      case ExecuteStmt: return this._execExecute(stmt);
      case DictionarySetStmt: return this._execDictionarySet(stmt);
      case ListAddStmt: return this._execListAdd(stmt);
      case QueryStmt: return this._execQuery(stmt);
      case WheneverStmt: return this._execWhenever(stmt);
      case MutationStmt: return this._execMutation(stmt);
      case ResultStmt: return this._execResult(stmt);
      case ExpressionStmt: return this._execExpressionStmt(stmt);
      case UsingStmt: return this._execUsing(stmt);
      case ShellStmt: return this._execShellStmt(stmt);
      case TryStmt: return this._execTry(stmt);
      case ReadFileStmt: return this._execReadFile(stmt);
      case WriteFileStmt: return this._execWriteFile(stmt);
      case RangeForStmt: return this._execRangeFor(stmt);
      case PipeShellStmt: return this._execPipeShell(stmt);
      case IncludeStmt: return this._execInclude(stmt);
      case AfterStmt: return this._execAfter(stmt);
      case EveryStmt: return this._execEvery(stmt);
      case DeleteFileStmt: return this._execDeleteFile(stmt);
      case MkdirStmt: return this._execMkdir(stmt);
      case ChdirStmt: return this._execChdir(stmt);
      case CopyFileStmt: return this._execCopyFile(stmt);
      case RenameFileStmt: return this._execRenameFile(stmt);
      case TouchFileStmt: return this._execTouchFile(stmt);
      case AppendFileStmt: return this._execAppendFile(stmt);
      case AliasStmt: return this._execAlias(stmt);
      case KeepStmt: return this._execKeep(stmt);
      case WithStmt: return this._execWith(stmt);
      case NopStmt: return NULL;
      case BreakStmt: throw new BreakSignal();
      case ContinueStmt: throw new ContinueSignal();
      case SequenceStmt:
        for (const s of stmt.statements) this.execute(s);
        return NULL;
      default:
        throw new RuntimeError(
          `Unknown statement type: ${stmt.constructor.name}`,
          stmt.line, stmt.column
        );
    }
  }

  // -----------------------------------------------------------------------
  // Expression evaluation
  // -----------------------------------------------------------------------

  /** @param {LiteralExpr} expr */
  _evalLiteral(expr) {
    switch (expr.valueType) {
      case 'number': {
        const n = new NumberValue(Number(expr.rawValue));
        this.env.getDiscourse().mentionScalar(n);
        return n;
      }
      case 'text':
        return new TextValue(expr.rawValue);
      case 'heredoc':
        return new TextValue(expr.rawValue);
      case 'braceblock':
        return new TextValue(expr.rawValue);
      case 'interpolated':
        return this._evalInterpolated(expr.rawValue);
      default:
        return new TextValue(expr.rawValue);
    }
  }

  /** @param {VariableExpr} expr */
  _evalVariable(expr) {
    if (ANAPHORS.has(expr.name.toLowerCase())) {
      return this.env.getDiscourse().resolveAnaphor(expr.name, expr.line, expr.column);
    }
    const val = this.env.lookup(expr.name);
    if (val === null) {
      try {
        return this.env.getDiscourse().resolvePhrase(expr.name.split(/\s+/), expr.line, expr.column);
      } catch (e) {
        if (e instanceof CoreferenceError) {
          throw new NameError(
            `Variable "${expr.name}" does not exist`,
            expr.line, expr.column
          );
        }
        throw e;
      }
    }
    this._mentionValue(val);
    return val;
  }

  /** @param {PropertyAccessExpr} expr */
  _evalPropertyAccess(expr) {
    const entity = this._resolveName(expr.entity, expr.line, expr.column);
    const val = getProperty(entity, expr.property);
    if (val === null || val === undefined) {
      throw new NameError(
        `Property "${expr.property}" does not exist on ${expr.entity}`,
        expr.line, expr.column
      );
    }
    this._mentionValue(val);
    return val;
  }

  /** @param {BinaryOpExpr} expr */
  _evalBinaryOp(expr) {
    const left = this.evaluate(expr.left);
    const right = this.evaluate(expr.right);

    switch (expr.op) {
      case 'followed_by':
        return new TextValue(this.stringify(left) + this.stringify(right));

      case 'greater_than':
        return new NumberValue(this.toNumber(left) > this.toNumber(right) ? 1 : 0);

      case 'less_than':
        return new NumberValue(this.toNumber(left) < this.toNumber(right) ? 1 : 0);

      case 'greater_equal':
        return new NumberValue(this.toNumber(left) >= this.toNumber(right) ? 1 : 0);

      case 'less_equal':
        return new NumberValue(this.toNumber(left) <= this.toNumber(right) ? 1 : 0);

      case 'equal_to':
        return new NumberValue(this.stringify(left) === this.stringify(right) ? 1 : 0);

      case 'not_equal_to':
        return new NumberValue(this.stringify(left) !== this.stringify(right) ? 1 : 0);

      case 'plus':
        if (left instanceof NumberValue && right instanceof NumberValue) {
          return new NumberValue(left.value + right.value);
        }
        return new TextValue(this.stringify(left) + this.stringify(right));

      case 'modulo':
        return new NumberValue(this.toNumber(left) % this.toNumber(right));

      case 'minus':
        return new NumberValue(this.toNumber(left) - this.toNumber(right));

      case 'times':
        return new NumberValue(this.toNumber(left) * this.toNumber(right));

      case 'divided_by': {
        const den = this.toNumber(right);
        if (den === 0) {
          throw new RuntimeError('Division by zero', expr.line, expr.column);
        }
        return new NumberValue(this.toNumber(left) / den);
      }

      default:
        throw new RuntimeError(
          `Unknown binary operator: ${expr.op}`,
          expr.line, expr.column
        );
    }
  }

  /**
   * Evaluate a parenthesized side-note expression.
   * The inner statement is executed and its result converted to text.
   * @param {CallExpr} expr
   */
  _evalCallExpr(expr) {
    if (expr.verbName === '__paren__') {
      // This is a parenthesized side-note
      // The first "argument" is actually a statement to evaluate
      const innerStmt = expr.args[0];
      if (!innerStmt) return new TextValue('');

      // Execute the inner statement/expression
      let result;
      if (innerStmt instanceof ExpressionStmt) {
        result = this.evaluate(innerStmt.expression);
      } else {
        result = this.execute(innerStmt);
      }

      if (!result) return new TextValue('');
      return result;
    }

    // Regular inline verb call
    return this._callVerb(expr.verbName, expr.args, expr.line, expr.column);
  }

  /** @param {DictionaryAccessExpr} expr */
  _evalDictionaryAccess(expr) {
    const dict = this.env.lookup(expr.dictName);
    if (!dict || !(dict instanceof DictionaryValue)) {
      throw new NameError(
        `Dictionary "${expr.dictName}" does not exist`,
        expr.line, expr.column
      );
    }
    const key = this.evaluate(expr.key);
    const keyStr = this.stringify(key);
    const val = dict.get(keyStr);
    if (val === null) {
      // Return empty text instead of error for graceful handling
      return new TextValue('');
    }
    return val;
  }

  // -----------------------------------------------------------------------
  // Statement execution
  // -----------------------------------------------------------------------

  /** @param {VariableDeclaration} stmt */
  _execVariableDecl(stmt) {
    const typeLower = stmt.typeName.toLowerCase();

    let initialValue;
    switch (typeLower) {
      case 'number':
        initialValue = new NumberValue(0);
        break;
      case 'text':
        initialValue = new TextValue('');
        break;
      case 'list':
        initialValue = new ListValue();
        break;
      case 'dictionary':
        initialValue = new DictionaryValue();
        break;
      case 'system':
        initialValue = new EntityValue(stmt.typeName, stmt.varName);
        break;
      case 'account':
        initialValue = new EntityValue(stmt.typeName, stmt.varName);
        break;
      default:
        // Any capitalized name is treated as an entity blueprint
        if (stmt.typeName[0] === stmt.typeName[0].toUpperCase()) {
          initialValue = new EntityValue(stmt.typeName, stmt.varName);
        } else {
          // Unknown type, default to text
          initialValue = new TextValue('');
        }
        break;
    }

    // Handle heredoc initializer
    if (stmt._heredocValue) {
      initialValue = this.evaluate(stmt._heredocValue);
    }

    this.env.define(stmt.varName, initialValue);
    logger.debug(`Declared ${stmt.typeName} named ${stmt.varName}`);
    return initialValue;
  }

  /** @param {Assignment} stmt */
  _execAssignment(stmt) {
    const value = this.evaluate(stmt.value);

    this._mentionValue(value);
    if (value instanceof DictionaryValue || value instanceof EntityValue) {
      this.env.getDiscourse().registerEntity(value, stmt.entity ? null : stmt.target);
    }

    if (stmt.indexExpr) {
      const list = this.env.lookup(stmt.target);
      if (!(list instanceof ListValue)) {
        throw new TypeError(`"${stmt.target}" is not a List`, stmt.line, stmt.column);
      }
      const i = Math.trunc(this.toNumber(this.evaluate(stmt.indexExpr)));
      const idx = i < 0 ? list.items.length + i : i;
      if (idx < 0 || idx >= list.items.length) {
        throw new RuntimeError(`Index ${i} out of range`, stmt.line, stmt.column);
      }
      list.items[idx] = value;
      return value;
    }

    if (stmt.entity) {
      const entity = this._resolveName(stmt.entity, stmt.line, stmt.column);
      if (!setProperty(entity, stmt.target, value)) {
        throw new TypeError(
          `"${stmt.entity}" is not an entity`,
          stmt.line, stmt.column
        );
      }
      this.env.getDiscourse().registerEntity(entity);
      this.env.fireWatchers(stmt.entity, stmt.target, entity, value, this);
      logger.debug(`Set ${stmt.entity}'s ${stmt.target} = ${this.stringify(value)}`);
    } else {
      // Simple variable assignment: X is 30.
      // Auto-declare if variable doesn't exist yet
      const existing = this.env.lookup(stmt.target);
      if (!existing) {
        // Implicit declaration - create with appropriate type
        this.env.define(stmt.target, value);
        logger.debug(`Implicitly declared ${value.typeName()} named ${stmt.target} = ${this.stringify(value)}`);
      } else {
        this.env.set(stmt.target, value);
        logger.debug(`Set ${stmt.target} = ${this.stringify(value)}`);
      }

      // If this is an entity, fire watchers
      if (value instanceof EntityValue) {
        this.env.fireWatchers(stmt.target, '*', value, value, this);
      } else {
        // Fire variable-change watchers
        this.env.fireVarWatchers(stmt.target, value, this);
      }
    }

    return value;
  }

  /** @param {PrintStmt} stmt */
  _execPrint(stmt) {
    const value = this.evaluate(stmt.expression);
    const text = this.stringify(value);
    this._output(text);
    return new TextValue(text);
  }

  /** @param {IfStmt} stmt */
  _execIf(stmt) {
    const condition = this.evaluate(stmt.condition);
    if (this.isTruthy(condition)) {
      this._executeBlock(stmt.thenBlock);
      return NULL;
    }

    // Check else-if chains
    if (stmt.elseIfs) {
      for (const elif of stmt.elseIfs) {
        if (this.isTruthy(this.evaluate(elif.condition))) {
          this._executeBlock(elif.body);
          return NULL;
        }
      }
    }

    if (stmt.elseBlock && stmt.elseBlock.length > 0) {
      this._executeBlock(stmt.elseBlock);
    }
    return NULL;
  }

  /** @param {WhileStmt} stmt */
  _execWhile(stmt) {
    let iterations = 0;
    const maxIterations = 10000;
    while (this.isTruthy(this.evaluate(stmt.condition))) {
      if (++iterations > maxIterations) {
        throw new RuntimeError(
          'While loop exceeded maximum iterations',
          stmt.line, stmt.column
        );
      }
      try {
        this._executeBlock(stmt.body);
      } catch (e) {
        if (e instanceof ContinueSignal) continue;
        if (e instanceof BreakSignal) break;
        throw e;
      }
    }
    return NULL;
  }

  /** @param {ForEveryStmt} stmt */
  _execForEvery(stmt) {
    const collection = this.env.lookup(stmt.collectionName);
    if (!collection || !(collection instanceof ListValue)) {
      throw new TypeError(
        `"${stmt.collectionName}" is not a List`,
        stmt.line, stmt.column
      );
    }

    const d = this.env.getDiscourse();
    d.mentionCollection(collection);
    for (const item of collection.items) {
      this.env.define(stmt.iteratorVar, item);
      this.env.define('_', item);
      d.loopItem = item;
      d.it = item;
      try {
        this._executeBlock(stmt.body);
      } catch (e) {
        if (e instanceof ContinueSignal) continue;
        if (e instanceof BreakSignal) break;
        throw e;
      }
    }
    d.loopItem = null;
    return NULL;
  }

  /** @param {VerbDefinition} stmt */
  _execVerbDef(stmt) {
    const verbDef = new VerbDef(
      stmt.name, stmt.params, stmt.body, this.env
    );
    verbDef.slots = stmt.slots;
    this.env.defineVerb(stmt.name, verbDef);
    logger.debug(`Defined verb "${stmt.name}" with params: ${stmt.params.join(', ')}`);
    return NULL;
  }

  /** @param {VerbCall} stmt */
  _execVerbCall(stmt) {
    return this._callVerb(stmt.verbName, stmt.args, stmt.line, stmt.column);
  }

  /** @param {LabelStmt} stmt */
  _execLabel(stmt) {
    // Labels are pre-registered in first pass; no-op during execution
    return NULL;
  }

  /** @param {JumpStmt} stmt */
  _execJump(stmt) {
    throw new GotoSignal(stmt.labelName);
  }

  /** @param {ExecuteStmt} stmt */
  _execExecute(stmt) {
    const varValue = this.env.lookup(stmt.varName);
    if (!varValue) {
      throw new NameError(
        `Variable "${stmt.varName}" does not exist`,
        stmt.line, stmt.column
      );
    }

    const codeText = this.stringify(varValue);

    // Dynamically lex, parse, and interpret the code
    logger.debug(`Executing dynamic code: ${codeText.substring(0, 80)}...`);

    const lexer = new Lexer(codeText, '<dynamic>');
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens);
    const program = parser.parse();

    // Execute in a child scope
    const childEnv = this.env.pushScope();
    const childInterp = new Interpreter(childEnv);
    const result = childInterp.interpret(program);

    // Copy output
    if (result.output) {
      this._output(result.output);
    }

    return result.result;
  }

  /** @param {DictionarySetStmt} stmt */
  _execDictionarySet(stmt) {
    const dict = this.env.lookup(stmt.dictName);
    if (!dict || !(dict instanceof DictionaryValue)) {
      throw new NameError(
        `Dictionary "${stmt.dictName}" does not exist`,
        stmt.line, stmt.column
      );
    }
    const key = this.evaluate(stmt.key);
    const value = this.evaluate(stmt.value);
    dict.set(this.stringify(key), value);
    logger.debug(`Set "${this.stringify(key)}" -> ${this.stringify(value)} in ${stmt.dictName}`);
    return value;
  }

  /** @param {ListAddStmt} stmt */
  _execListAdd(stmt) {
    let list = this.env.lookup(stmt.listName);
    if (!list) {
      // Create list if it doesn't exist
      list = new ListValue();
      this.env.define(stmt.listName, list);
    }
    if (!(list instanceof ListValue)) {
      throw new TypeError(
        `"${stmt.listName}" is not a List`,
        stmt.line, stmt.column
      );
    }
    for (const itemExpr of stmt.items) {
      list.push(this.evaluate(itemExpr));
    }
    return list;
  }

  /** @param {QueryStmt} stmt */
  _execQuery(stmt) {
    const collection = this.env.lookup(stmt.collection);
    if (!collection || !(collection instanceof ListValue)) {
      throw new TypeError(
        `"${stmt.collection}" is not a List`,
        stmt.line, stmt.column
      );
    }

    const targetValue = this.stringify(this.evaluate(stmt.value));
    const results = new ListValue();

    for (const item of collection.items) {
      if (item instanceof EntityValue && item.blueprint === stmt.typeName) {
        const propVal = item.get(stmt.property);
        if (propVal && this.stringify(propVal) === targetValue) {
          results.push(item);
        }
      }
    }

    // Store result in a variable named after the query type
    const resultName = `query_result_${stmt.typeName.toLowerCase()}`;
    this.env.define(resultName, results);

    logger.debug(`Query found ${results.length} ${stmt.typeName}(s) in ${stmt.collection}`);
    return results;
  }

  /** @param {WheneverStmt} stmt */
  _execWhenever(stmt) {
    const watcher = new ReactiveWatcher(
      stmt.entityName,
      stmt.propertyName,
      (entity, interp) => {
        if (this.watcherDepth >= this.maxWatcherDepth) {
          logger.warn(`Watcher recursion limit reached for ${stmt.entityName}`);
          return;
        }
        this.watcherDepth++;
        try {
          // Create a child interpreter for watcher execution
          const watcherEnv = this.env.pushScope();
          const watcherInterp = new Interpreter(watcherEnv);
          watcherInterp._executeBlock(stmt.body);
          // Copy output
          for (const line of watcherInterp.outputBuffer) {
            this._output(line);
          }
        } finally {
          this.watcherDepth--;
        }
      }
    );
    this.env.addWatcher(watcher);
    logger.debug(`Registered Whenever watcher for ${stmt.entityName}${stmt.propertyName ? '.' + stmt.propertyName : ''}`);
    return NULL;
  }

  /** @param {MutationStmt} stmt */
  _execMutation(stmt) {
    const operand = this.evaluate(stmt.value);

    if (stmt.operation === 'set') {
      this._mentionValue(operand);
      if (operand instanceof DictionaryValue || operand instanceof EntityValue) {
        this.env.getDiscourse().registerEntity(operand, stmt.entity ? null : stmt.target);
      }
      if (stmt.entity) {
        const entity = this._resolveName(stmt.entity, stmt.line, stmt.column);
        if (!setProperty(entity, stmt.target, operand)) {
          throw new TypeError(`"${stmt.entity}" is not an entity`, stmt.line, stmt.column);
        }
        this.env.getDiscourse().registerEntity(entity);
        this.env.fireWatchers(stmt.entity, stmt.target, entity, operand, this);
      } else {
        const existing = this.env.lookup(stmt.target);
        if (!existing) this.env.define(stmt.target, operand);
        else this.env.set(stmt.target, operand);
        this.env.fireVarWatchers(stmt.target, operand, this);
      }
      return operand;
    }

    let currentVal;
    let entity = null;
    if (stmt.entity) {
      entity = this._resolveName(stmt.entity, stmt.line, stmt.column);
      currentVal = getProperty(entity, stmt.target);
      if (!currentVal) {
        throw new NameError(`Property "${stmt.target}" not found on ${stmt.entity}`, stmt.line, stmt.column);
      }
    } else {
      currentVal = this.env.lookup(stmt.target);
      if (!currentVal) {
        throw new NameError(`"${stmt.target}" does not exist`, stmt.line, stmt.column);
      }
    }

    const currentNum = this.toNumber(currentVal);
    const operandNum = this.toNumber(operand);
    const newNum = stmt.operation === 'increase' ? currentNum + operandNum : currentNum - operandNum;
    const newVal = new NumberValue(newNum);
    this.env.getDiscourse().mentionScalar(newVal);

    if (stmt.entity) {
      setProperty(entity, stmt.target, newVal);
      this.env.fireWatchers(stmt.entity, stmt.target, entity, newVal, this);
    } else {
      this.env.set(stmt.target, newVal);
    }
    return newVal;
  }

  /** @param {ResultStmt} stmt */
  _execResult(stmt) {
    const value = this.evaluate(stmt.value);
    throw new ReturnSignal(value);
  }

  /** @param {ExpressionStmt} stmt */
  _execExpressionStmt(stmt) {
    return this.evaluate(stmt.expression);
  }

  /** @param {UsingStmt} stmt */
  _execUsing(stmt) {
    // Call the handler verb with the raw DSL text
    // Create a LiteralExpr to pass as an AST node (not a raw Value)
    const litExpr = new LiteralExpr('text', stmt.dslText, stmt.line, stmt.column);
    logger.debug(`Using verb "${stmt.verbName}" to parse DSL block (${stmt.dslText.length} chars)`);
    return this._callVerb(stmt.verbName, [litExpr], stmt.line, stmt.column);
  }

  /** @param {ShellStmt} stmt */
  _execShellStmt(stmt) {
    const cmdValue = this.evaluate(stmt.commandExpr);
    const cmdStr = this.stringify(cmdValue);
    logger.debug(`Executing shell command: ${cmdStr}`);
    const result = this._runShellCommand(cmdStr);
    // Print stdout if any
    if (result.stdout) {
      this._output(result.stdout.trimEnd());
    }
    // Print stderr if any
    if (result.stderr) {
      this._output(result.stderr.trimEnd());
    }
    return result;
  }

  /** @param {ShellExpr} expr */
  _evalShellExpr(expr) {
    const cmdValue = this.evaluate(expr.commandExpr);
    const cmdStr = this.stringify(cmdValue);
    logger.debug(`Capturing shell command output: ${cmdStr}`);
    const result = this._runShellCommand(cmdStr);
    return new TextValue(result.stdout.trimEnd());
  }

  /**
   * Run an OS shell command and return the result.
   * @param {string} command
   * @returns {ShellResultValue}
   */
  _runShellCommand(command) {
    try {
      const result = child_process.spawnSync(command, [], {
        shell: true,
        encoding: 'utf-8',
        timeout: 30000, // 30 second timeout
        windowsHide: true,
      });

      const stdout = result.stdout || '';
      const stderr = result.stderr || '';
      const code = result.status ?? (result.error ? 1 : 0);

      if (result.error) {
        return new ShellResultValue(stdout, result.error.message, 1);
      }

      return new ShellResultValue(stdout, stderr, code);
    } catch (e) {
      return new ShellResultValue('', e.message, 1);
    }
  }

  /** @param {TryStmt} stmt */
  _execTry(stmt) {
    try {
      this._executeBlock(stmt.tryBlock);
    } catch (e) {
      // Bind error to variable if specified
      if (stmt.errorVar) {
        const errMsg = e instanceof ProseError ? e.toString() : e.message;
        this.env.define(stmt.errorVar, new TextValue(errMsg));
      }
      // Execute catch block
      const catchEnv = this.env.pushScope();
      if (stmt.errorVar) {
        const errMsg = e instanceof ProseError ? e.toString() : e.message;
        catchEnv.define(stmt.errorVar, new TextValue(errMsg));
      }
      const catchInterp = new Interpreter(catchEnv);
      catchInterp.outputBuffer = this.outputBuffer;
      catchInterp._executeBlock(stmt.catchBlock);
    }
  }

  /** @param {ReadFileStmt} stmt */
  _execReadFile(stmt) {
    const pathVal = this.evaluate(stmt.pathExpr);
    const filePath = this.stringify(pathVal);
    logger.debug(`Reading file: ${filePath}`);
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      this.env.set(stmt.targetVar, new TextValue(content), true);
      this.env.getDiscourse().mentionPath(filePath);
      this.env.getDiscourse().mentionScalar(this.env.lookup(stmt.targetVar));
    } catch (e) {
      throw new RuntimeError(`Cannot read file "${filePath}": ${e.message}`, stmt.line, stmt.column);
    }
    return NULL;
  }

  /** @param {WriteFileStmt} stmt */
  _execWriteFile(stmt) {
    const valueVal = this.evaluate(stmt.valueExpr);
    const content = this.stringify(valueVal);
    const pathVal = this.evaluate(stmt.pathExpr);
    const filePath = this.stringify(pathVal);
    logger.debug(`Writing file: ${filePath}`);
    try {
      fs.writeFileSync(filePath, content, 'utf-8');
      this.env.getDiscourse().mentionPath(filePath);
    } catch (e) {
      throw new RuntimeError(`Cannot write file "${filePath}": ${e.message}`, stmt.line, stmt.column);
    }
    return NULL;
  }

  /** @param {JsonParseExpr} expr */
  _evalJsonParse(expr) {
    const sourceVal = this.evaluate(expr.sourceExpr);
    const jsonText = this.stringify(sourceVal);
    logger.debug(`Parsing JSON (${jsonText.length} chars)`);
    try {
      const parsed = JSON.parse(jsonText);
      return this._jsonToValue(parsed);
    } catch (e) {
      throw new RuntimeError(`Invalid JSON: ${e.message}`, expr.line, expr.column);
    }
  }

  /**
   * Convert a JSON-parsed value to Prose values.
   */
  _jsonToValue(jsVal) {
    if (jsVal === null || jsVal === undefined) return NULL;
    if (typeof jsVal === 'number') return new NumberValue(jsVal);
    if (typeof jsVal === 'string') return new TextValue(jsVal);
    if (typeof jsVal === 'boolean') return new TextValue(String(jsVal));
    if (Array.isArray(jsVal)) {
      const list = new ListValue();
      for (const item of jsVal) list.push(this._jsonToValue(item));
      return list;
    }
    if (typeof jsVal === 'object') {
      const dict = new DictionaryValue();
      for (const [key, val] of Object.entries(jsVal)) {
        dict.set(key, this._jsonToValue(val));
      }
      return dict;
    }
    return new TextValue(String(jsVal));
  }

  /** @param {LogicalExpr} expr */
  _evalLogical(expr) {
    const left = this.evaluate(expr.left);
    const leftTruthy = this.isTruthy(left);

    if (expr.op === 'and') {
      if (!leftTruthy) return new NumberValue(0);
      const right = this.evaluate(expr.right);
      return new NumberValue(this.isTruthy(right) ? 1 : 0);
    }
    // 'or'
    if (leftTruthy) return new NumberValue(1);
    const right = this.evaluate(expr.right);
    return new NumberValue(this.isTruthy(right) ? 1 : 0);
  }

  /** Expand an interpolated string from JSON segments */
  _evalInterpolated(rawJson) {
    try {
      const segments = JSON.parse(rawJson);
      let result = '';
      for (const seg of segments) {
        if (seg.t === 'text') {
          result += seg.v;
        } else if (seg.t === 'var') {
          let val = null;
          const n = seg.n;
          if (n === '_' || ANAPHORS.has(n.toLowerCase())) {
            try { val = this.env.getDiscourse().resolveAnaphor(n === '_' ? 'it' : n); } catch { val = this.env.lookup('_'); }
          }
          if (!val) val = this.env.lookup(n);
          result += val ? this.stringify(val) : '';
        }
      }
      return new TextValue(result);
    } catch (e) {
      return new TextValue(rawJson);
    }
  }

  /** @param {EnvVarExpr} expr */
  _evalEnvVar(expr) {
    const nameVal = this.evaluate(expr.nameExpr);
    const varName = this.stringify(nameVal);
    const value = process.env[varName] || '';
    return new TextValue(value);
  }

  /** @param {FetchExpr} expr */
  _evalFetch(expr) {
    const urlVal = this.evaluate(expr.urlExpr);
    const url = this.stringify(urlVal);
    logger.debug(`Fetching URL: ${url}`);
    try {
      const result = child_process.spawnSync('node', [
        '-e',
        `const{h}=require('${url.startsWith('https') ? 'https' : 'http'}');h.get("${url.replace(/"/g, '\\"')}",r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>console.log(d))}).on('error',e=>{console.error(e.message);process.exit(1)})`
      ], { encoding: 'utf-8', timeout: 15000, windowsHide: true });
      if (result.error || result.status !== 0) {
        throw new Error(result.stderr || 'HTTP request failed');
      }
      return new TextValue(result.stdout);
    } catch (e) {
      throw new RuntimeError(`Cannot fetch "${url}": ${e.message}`, expr.line, expr.column);
    }
  }

  /** @param {RangeForStmt} stmt */
  _execRangeFor(stmt) {
    const fromVal = this.evaluate(stmt.fromExpr);
    const toVal = this.evaluate(stmt.toExpr);
    const from = this.toNumber(fromVal);
    const to = this.toNumber(toVal);

    for (let i = from; i <= to; i++) {
      this.env.define('_index', new NumberValue(i));
      this.env.define('_', new NumberValue(i));
      try {
        this._executeBlock(stmt.body);
      } catch (e) {
        if (e instanceof ContinueSignal) continue;
        if (e instanceof BreakSignal) break;
        throw e;
      }
    }
    return NULL;
  }

  /** @param {PipeShellStmt} stmt */
  _execPipeShell(stmt) {
    const cmd1 = this.stringify(this.evaluate(stmt.cmd1Expr));
    const cmd2 = this.stringify(this.evaluate(stmt.cmd2Expr));
    const pipeCmd = `${cmd1} | ${cmd2}`;
    logger.debug(`Pipe shell: ${pipeCmd}`);
    const result = this._runShellCommand(pipeCmd);
    if (result.stdout) this._output(result.stdout.trimEnd());
    if (result.stderr) this._output(result.stderr.trimEnd());
    return result;
  }

  /** @param {IncludeStmt} stmt */
  _execInclude(stmt) {
    const pathVal = this.evaluate(stmt.pathExpr);
    const filePath = path.resolve(this.stringify(pathVal));
    logger.debug(`Including file: ${filePath}`);
    try {
      const source = fs.readFileSync(filePath, 'utf-8');
      const lexer = new Lexer(source, filePath);
      const tokens = lexer.tokenize();
      const parser = new Parser(tokens);
      const program = parser.parse();
      this._executeBlock(program.statements);
    } catch (e) {
      throw new RuntimeError(`Cannot include "${filePath}": ${e.message}`, stmt.line, stmt.column);
    }
    return NULL;
  }

  /** @param {MapExpr} expr */
  _evalMap(expr) {
    const source = this.evaluate(expr.sourceExpr);
    if (!(source instanceof ListValue)) throw new RuntimeError('Map requires a List', expr.line, expr.column);
    const result = new ListValue();
    for (const item of source.items) {
      this.env.define('_map_item', item);
      const mapped = this._callVerb(
        expr.verbName,
        [new VariableExpr('_map_item', expr.line, expr.column)],
        expr.line, expr.column
      );
      result.push(mapped);
    }
    return result;
  }

  /** @param {FilterExpr} expr */
  _evalFilter(expr) {
    const source = this.evaluate(expr.sourceExpr);
    if (!(source instanceof ListValue)) throw new RuntimeError('Filter requires a List', expr.line, expr.column);
    const result = new ListValue();
    const d = this.env.getDiscourse();
    for (const item of source.items) {
      this.env.define('_', item);
      this.env.define('_item', item);
      d.loopItem = item;
      const cond = this.evaluate(expr.condition);
      if (this.isTruthy(cond)) result.push(item);
    }
    return result;
  }

  /** @param {SumExpr} expr */
  _evalSum(expr) {
    const source = this.evaluate(expr.sourceExpr);
    if (!(source instanceof ListValue)) throw new RuntimeError('Sum requires a List', expr.line, expr.column);
    let total = 0;
    for (const item of source.items) total += this.toNumber(item);
    return new NumberValue(total);
  }

  /** @param {AfterStmt} stmt */
  _execAfter(stmt) {
    const secs = this.toNumber(this.evaluate(stmt.secondsExpr));
    logger.debug(`Sleeping ${secs} seconds...`);
    child_process.spawnSync(process.platform === 'win32' ? 'timeout' : 'sleep', [
      process.platform === 'win32' ? `/t ${secs}` : String(secs),
      process.platform === 'win32' ? '/nobreak' : ''
    ].filter(Boolean), { stdio: 'ignore', timeout: secs * 1000 + 5000 });
    this._executeBlock(stmt.body);
    return NULL;
  }

  /** @param {EveryStmt} stmt */
  _execEvery(stmt) {
    const secs = this.toNumber(this.evaluate(stmt.secondsExpr));
    // Run up to 100 iterations
    for (let i = 0; i < 100; i++) {
      child_process.spawnSync(process.platform === 'win32' ? 'timeout' : 'sleep', [
        process.platform === 'win32' ? `/t ${secs}` : String(secs),
        process.platform === 'win32' ? '/nobreak' : ''
      ].filter(Boolean), { stdio: 'ignore', timeout: secs * 1000 + 5000 });
      this._executeBlock(stmt.body);
    }
    return NULL;
  }

  /** @param {DeleteFileStmt} stmt */
  _execDeleteFile(stmt) {
    const pathVal = this.evaluate(stmt.pathExpr);
    const filePath = this.stringify(pathVal);
    this.env.getDiscourse().mentionPath(filePath);
    try { fs.unlinkSync(filePath); } catch (e) {
      throw new RuntimeError(`Cannot delete "${filePath}": ${e.message}`, stmt.line, stmt.column);
    }
    return NULL;
  }

  /** @param {MkdirStmt} stmt */
  _execMkdir(stmt) {
    const filePath = this.stringify(this.evaluate(stmt.pathExpr));
    try {
      fs.mkdirSync(filePath, { recursive: true });
      this.env.getDiscourse().mentionPath(filePath);
    } catch (e) {
      throw new RuntimeError(`Cannot make directory "${filePath}": ${e.message}`, stmt.line, stmt.column);
    }
    return new TextValue(filePath);
  }

  /** @param {ChdirStmt} stmt */
  _execChdir(stmt) {
    const filePath = this.stringify(this.evaluate(stmt.pathExpr));
    try {
      process.chdir(filePath);
      this.env.getDiscourse().mentionPath(process.cwd());
    } catch (e) {
      throw new RuntimeError(`Cannot change directory to "${filePath}": ${e.message}`, stmt.line, stmt.column);
    }
    return new TextValue(process.cwd());
  }

  /** @param {CopyFileStmt} stmt */
  _execCopyFile(stmt) {
    const from = this.stringify(this.evaluate(stmt.fromExpr));
    const to = this.stringify(this.evaluate(stmt.toExpr));
    try {
      fs.copyFileSync(from, to);
    } catch (e) {
      throw new RuntimeError(`Cannot copy "${from}" to "${to}": ${e.message}`, stmt.line, stmt.column);
    }
    return new TextValue(to);
  }

  /** @param {RenameFileStmt} stmt */
  _execRenameFile(stmt) {
    const from = this.stringify(this.evaluate(stmt.fromExpr));
    const to = this.stringify(this.evaluate(stmt.toExpr));
    try {
      fs.renameSync(from, to);
    } catch (e) {
      throw new RuntimeError(`Cannot rename "${from}" to "${to}": ${e.message}`, stmt.line, stmt.column);
    }
    return new TextValue(to);
  }

  /** @param {TouchFileStmt} stmt */
  _execTouchFile(stmt) {
    const filePath = this.stringify(this.evaluate(stmt.pathExpr));
    const now = new Date();
    try {
      fs.utimesSync(filePath, now, now);
    } catch {
      try {
        fs.writeFileSync(filePath, '');
      } catch (e) {
        throw new RuntimeError(`Cannot touch "${filePath}": ${e.message}`, stmt.line, stmt.column);
      }
    }
    return new TextValue(filePath);
  }

  /** @param {AppendFileStmt} stmt */
  _execAppendFile(stmt) {
    const content = this.stringify(this.evaluate(stmt.valueExpr));
    const filePath = this.stringify(this.evaluate(stmt.pathExpr));
    try {
      fs.appendFileSync(filePath, content, 'utf-8');
    } catch (e) {
      throw new RuntimeError(`Cannot append to "${filePath}": ${e.message}`, stmt.line, stmt.column);
    }
    return NULL;
  }

  /** @param {ListFilesExpr} expr */
  _evalListFiles(expr) {
    const dirVal = this.evaluate(expr.dirExpr);
    const dirPath = this.stringify(dirVal);
    try {
      const files = fs.readdirSync(dirPath);
      const list = new ListValue();
      for (const f of files) list.push(new TextValue(f));
      return list;
    } catch (e) {
      throw new RuntimeError(`Cannot list "${dirPath}": ${e.message}`, expr.line, expr.column);
    }
  }

  // -----------------------------------------------------------------------
  // Verb calling
  // -----------------------------------------------------------------------

  /**
   * Call a verb by name with arguments.
   * @param {string} verbName
   * @param {import('../parser/AST.js').Expr[]} argExprs
   * @param {number} line
   * @param {number} column
   * @returns {Value}
   */
  _callVerb(verbName, argExprs, line, column) {
    // Evaluate arguments
    const args = argExprs.map(e => this.evaluate(e));

    // Check for built-in/native verb first
    const def = this.env.lookupVerb(verbName);
    if (!def) {
      throw new NameError(
        `Verb "${verbName}" is not defined`,
        line, column
      );
    }

    if (def.native) {
      const result = def.execute(args, this.env, this);
      this._mentionValue(result);
      return result;
    }

    // User-defined verb
    const verbEnv = new Environment(def.closure);

    const slots = def.slots && def.slots.length ? def.slots : def.params.map(p => ({ type: p, role: null }));
    if (args.length < slots.length) {
      throw new TypeError(
        `Verb "${verbName}" expects ${slots.map(s => s.type).join(', ')}`,
        line, column
      );
    }
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      const arg = args[i];
      if (!this._argMatchesType(arg, slot.type)) {
        throw new TypeError(
          `Verb "${verbName}" expected a ${slot.type}, got ${arg ? arg.typeName() : 'nothing'}`,
          line, column
        );
      }
      // Body refers by type: `the Person`, `Person's name`, `${Person}`
      verbEnv.define(slot.type, arg);
      if (slot.role) {
        verbEnv.define(slot.role, arg);
        verbEnv.define(`${slot.role} number`, arg);
        verbEnv.define(`${slot.role} ${slot.type}`, arg);
        verbEnv.define(`the ${slot.role} number`, arg);
      }
      this.env.getDiscourse().registerEntity(arg, slot.type);
    }

    // Execute the verb body
    const verbInterp = new Interpreter(verbEnv);
    verbInterp.outputBuffer = this.outputBuffer; // Share output buffer

    try {
      verbInterp._executeBlock(def.body);
    } catch (e) {
      if (e instanceof ReturnSignal) {
        this._mentionValue(e.value);
        return e.value;
      }
      throw e;
    }

    return NULL;
  }

  _argMatchesType(arg, typeName) {
    if (!arg) return false;
    const t = typeName.toLowerCase();
    if (t === 'number') return arg instanceof NumberValue;
    if (t === 'text') return arg instanceof TextValue;
    if (t === 'list') return arg instanceof ListValue;
    if (t === 'dictionary') return arg instanceof DictionaryValue;
    if (arg instanceof EntityValue && arg.blueprint.toLowerCase() === t) return true;
    if (arg instanceof DictionaryValue) {
      const ty = arg.get('type');
      if (ty && this.stringify(ty).toLowerCase() === t) return true;
    }
    const rec = this.env.getDiscourse().entities.find(e => e.value === arg);
    if (rec) {
      if (rec.aliases.has(t)) return true;
      for (const a of rec.aliases) {
        const parts = a.split(/\s+/);
        if (parts[parts.length - 1] === t) return true;
      }
    }
    return false;
  }

  _evalUnary(expr) {
    const v = this.evaluate(expr.operand);
    if (expr.op === 'not') {
      return new NumberValue(this.isTruthy(v) ? 0 : 1);
    }
    throw new RuntimeError(`Unknown unary op ${expr.op}`, expr.line, expr.column);
  }

  _evalIndex(expr) {
    const obj = this.evaluate(expr.objectExpr);
    const idxVal = this.evaluate(expr.indexExpr);
    if (obj instanceof ListValue) {
      let i = Math.trunc(this.toNumber(idxVal));
      if (i < 0) i = obj.items.length + i;
      if (i < 0 || i >= obj.items.length) {
        throw new RuntimeError(`Index ${this.stringify(idxVal)} out of range`, expr.line, expr.column);
      }
      return obj.items[i];
    }
    if (obj instanceof TextValue) {
      let i = Math.trunc(this.toNumber(idxVal));
      if (i < 0) i = obj.value.length + i;
      if (i < 0 || i >= obj.value.length) {
        throw new RuntimeError(`Index out of range`, expr.line, expr.column);
      }
      return new TextValue(obj.value[i]);
    }
    if (obj instanceof DictionaryValue) {
      const v = obj.get(this.stringify(idxVal));
      return v ?? new TextValue('');
    }
    throw new TypeError('Cannot index this value', expr.line, expr.column);
  }

  _evalField(expr) {
    const obj = this.evaluate(expr.objectExpr);
    const val = getProperty(obj, expr.field);
    if (val === null || val === undefined) {
      throw new NameError(`No field "${expr.field}"`, expr.line, expr.column);
    }
    this._mentionValue(val);
    return val;
  }

  _mentionValue(val) {
    if (!val) return;
    const d = this.env.getDiscourse();
    d.mentionScalar(val);
    if (val instanceof ListValue) d.mentionCollection(val);
    if (val instanceof DictionaryValue || val instanceof EntityValue) d.registerEntity(val);
  }

  _resolveName(name, line, column) {
    if (!name) throw new NameError('Missing name', line, column);
    const lower = name.toLowerCase();
    if (ANAPHORS.has(lower)) {
      return this.env.getDiscourse().resolveAnaphor(lower, line, column);
    }
    const found = this.env.lookup(name);
    if (found) return found;
    return this.env.getDiscourse().resolvePhrase(String(name).split(/\s+/), line, column);
  }

  _evalCoref(expr) {
    const d = this.env.getDiscourse();
    if (expr.kind === 'phrase') {
      const v = d.resolvePhrase(expr.words, expr.line, expr.column);
      this._mentionValue(v);
      return v;
    }
    if (expr.kind === 'role') {
      const joined = expr.words.join(' ');
      let v = this.env.lookup(joined) || this.env.lookup(expr.words[0]);
      if (!v) {
        v = d.resolvePhrase(expr.words, expr.line, expr.column);
      }
      return v;
    }
    return d.resolveAnaphor(expr.kind, expr.line, expr.column);
  }

  _evalOfProperty(expr) {
    const obj = this.evaluate(expr.objectExpr);
    const val = getProperty(obj, expr.property);
    if (val === null || val === undefined) {
      throw new NameError(
        `Property "${expr.property}" does not exist`,
        expr.line, expr.column
      );
    }
    this._mentionValue(val);
    return val;
  }

  _evalDictLiteral(expr) {
    const dict = new DictionaryValue();
    for (const pair of expr.pairs) {
      dict.set(pair.key, this.evaluate(pair.value));
    }
    this.env.getDiscourse().registerEntity(dict);
    this._mentionValue(dict);
    return dict;
  }

  _runKeep(sourceExpr, condition, line, column) {
    const source = this.evaluate(sourceExpr);
    if (!(source instanceof ListValue)) throw new RuntimeError('keep requires a List', line, column);
    const kept = new ListValue();
    const dropped = new ListValue();
    const d = this.env.getDiscourse();
    for (const item of source.items) {
      this.env.define('_', item);
      this.env.define('_item', item);
      d.loopItem = item;
      const cond = this.evaluate(condition);
      if (this.isTruthy(cond)) kept.push(item);
      else dropped.push(item);
    }
    d.loopItem = null;
    d.those = kept;
    d.others = dropped;
    d.mentionCollection(kept);
    return kept;
  }

  _evalKeep(expr) {
    return this._runKeep(expr.sourceExpr, expr.condition, expr.line, expr.column);
  }

  _execKeep(stmt) {
    return this._runKeep(stmt.sourceExpr, stmt.condition, stmt.line, stmt.column);
  }

  _execAlias(stmt) {
    const target = this.evaluate(stmt.targetExpr);
    const phrase = stmt.aliasWords.join(' ');
    this.env.getDiscourse().registerEntity(target);
    this.env.getDiscourse().alias(phrase, target);
    this.env.define(phrase, target);
    this.env.getDiscourse().it = target;
    return target;
  }

  _execWith(stmt) {
    const target = this.evaluate(stmt.targetExpr);
    const d = this.env.getDiscourse();
    d.mentionPath(this.stringify(target));
    d.it = target;
    this._executeBlock(stmt.body);
    return target;
  }

  // -----------------------------------------------------------------------
  // Block execution
  // -----------------------------------------------------------------------

  /**
   * Execute a block of statements (for verb bodies, if/else blocks, etc.)
   * @param {import('../parser/AST.js').Stmt[]} statements
   */
  _executeBlock(statements) {
    for (const stmt of statements) {
      this.execute(stmt);
    }
  }

  // -----------------------------------------------------------------------
  // First-pass label registration
  // -----------------------------------------------------------------------

  _registerLabels() {
    for (let i = 0; i < this.statements.length; i++) {
      const stmt = this.statements[i];
      if (stmt instanceof LabelStmt) {
        this.labelMap.set(stmt.name, i);
        logger.debug(`Registered label "${stmt.name}" at index ${i}`);
      }
    }
  }

  // -----------------------------------------------------------------------
  // Utility methods
  // -----------------------------------------------------------------------

  /**
   * Convert a Value to a string representation.
   * @param {Value} val
   * @returns {string}
   */
  stringify(val) {
    if (val === null || val === undefined) return 'nothing';
    if (val instanceof TextValue) return val.value;
    if (val instanceof NumberValue) return String(val.value);
    if (val instanceof EntityValue) return val.name;
    return val.toString();
  }

  /**
   * Convert a Value to a JavaScript number.
   * @param {Value} val
   * @returns {number}
   */
  toNumber(val) {
    if (val instanceof NumberValue) return val.value;
    if (val instanceof TextValue) {
      const n = Number(val.value);
      if (!isNaN(n)) return n;
    }
    throw new RuntimeError(`Cannot convert ${val.typeName()} to a Number`);
  }

  /**
   * Check if a value is "truthy".
   * @param {Value} val
   * @returns {boolean}
   */
  isTruthy(val) {
    if (val === null || val === undefined) return false;
    if (val instanceof NumberValue) return val.value !== 0;
    if (val instanceof TextValue) return val.value.length > 0;
    if (val instanceof ListValue) return val.items.length > 0;
    return val.isTruthy();
  }

  /**
   * Append a line to the output buffer.
   * @param {string} text
   */
  _output(text) {
    this.outputBuffer.push(text);
  }
}
