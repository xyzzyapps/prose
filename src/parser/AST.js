/**
 * parser/AST.js - Abstract Syntax Tree node definitions for Prose.
 *
 * Every AST node extends Stmt (statement) or Expr (expression).
 * Each node carries a line/column for error reporting.
 */

// ---------------------------------------------------------------------------
// Base classes
// ---------------------------------------------------------------------------

export class ASTNode {
  constructor(line = 0, column = 0) {
    this.line = line;
    this.column = column;
  }
}

export class Stmt extends ASTNode {
  /** @returns {string} */
  nodeType() { return 'Stmt'; }
}

export class Expr extends ASTNode {
  /** @returns {string} */
  nodeType() { return 'Expr'; }
}

// ---------------------------------------------------------------------------
// Program (root node)
// ---------------------------------------------------------------------------

export class Program extends ASTNode {
  /**
   * @param {Stmt[]} statements
   */
  constructor(statements) {
    super();
    this.statements = statements;
  }
  nodeType() { return 'Program'; }
}

// ---------------------------------------------------------------------------
// Statements
// ---------------------------------------------------------------------------

/** `A Number named X exists.` or `A User named Alice exists.` */
export class VariableDeclaration extends Stmt {
  /**
   * @param {string} typeName   e.g. "Number", "Text", "User"
   * @param {string} varName    e.g. "X", "Alice"
   * @param {number} line
   * @param {number} column
   */
  constructor(typeName, varName, line, column) {
    super(line, column);
    this.typeName = typeName;
    this.varName = varName;
  }
  nodeType() { return 'VariableDeclaration'; }
}

/** `X is 30.` or `Alice's age is 25.` */
export class Assignment extends Stmt {
  /**
   * @param {string|null} entity   entity name for property assign, or null
   * @param {string} target         variable or property name
   * @param {Expr} value
   * @param {number} line
   * @param {number} column
   */
  constructor(entity, target, value, line, column) {
    super(line, column);
    this.entity = entity;
    this.target = target;
    this.value = value;
  }
  nodeType() { return 'Assignment'; }
}

/** `Print expression.` */
export class PrintStmt extends Stmt {
  /**
   * @param {Expr} expression
   * @param {number} line
   * @param {number} column
   */
  constructor(expression, line, column) {
    super(line, column);
    this.expression = expression;
  }
  nodeType() { return 'PrintStmt'; }
}

/** `If condition: ... Otherwise: ...` with optional else-if chains */
export class IfStmt extends Stmt {
  /**
   * @param {Expr} condition
   * @param {Stmt[]} thenBlock
   * @param {Stmt[]} elseBlock
   * @param {Array<{condition: Expr, body: Stmt[]}>} [elseIfs]
   * @param {number} line
   * @param {number} column
   */
  constructor(condition, thenBlock, elseBlock, elseIfs = [], line = 0, column = 0) {
    super(line, column);
    this.condition = condition;
    this.thenBlock = thenBlock;   // Stmt[]
    this.elseBlock = elseBlock;   // Stmt[] (may be empty [])
    this.elseIfs = elseIfs;       // [{condition: Expr, body: Stmt[]}, ...]
  }
  nodeType() { return 'IfStmt'; }
}

/** `While condition: ...` */
export class WhileStmt extends Stmt {
  /**
   * @param {Expr} condition
   * @param {Stmt[]} body
   * @param {number} line
   * @param {number} column
   */
  constructor(condition, body, line, column) {
    super(line, column);
    this.condition = condition;
    this.body = body;
  }
  nodeType() { return 'WhileStmt'; }
}

/** `For every X in Y: ...` */
export class ForEveryStmt extends Stmt {
  /**
   * @param {string} iteratorVar
   * @param {string} collectionName
   * @param {Stmt[]} body
   * @param {number} line
   * @param {number} column
   */
  constructor(iteratorVar, collectionName, body, line, column) {
    super(line, column);
    this.iteratorVar = iteratorVar;
    this.collectionName = collectionName;
    this.body = body;
  }
  nodeType() { return 'ForEveryStmt'; }
}

/** `To verbName params: ...` */
export class VerbDefinition extends Stmt {
  /**
   * @param {string} name       verb name, e.g. "Greet"
   * @param {string[]} params   parameter names
   * @param {Stmt[]} body
   * @param {number} line
   * @param {number} column
   * @param {{ type: string, role: string|null }[]|null} [slots]
   */
  constructor(name, params, body, line, column, slots = null) {
    super(line, column);
    this.name = name;
    this.params = params;
    this.body = body;
    this.slots = slots;
  }
  nodeType() { return 'VerbDefinition'; }
}

/** `VerbName args.` */
export class VerbCall extends Stmt {
  /**
   * @param {string} verbName
   * @param {Expr[]} args
   * @param {number} line
   * @param {number} column
   */
  constructor(verbName, args, line, column) {
    super(line, column);
    this.verbName = verbName;
    this.args = args;
  }
  nodeType() { return 'VerbCall'; }
}

/** `Label "name".` */
export class LabelStmt extends Stmt {
  /**
   * @param {string} name
   * @param {number} line
   * @param {number} column
   */
  constructor(name, line, column) {
    super(line, column);
    this.name = name;
  }
  nodeType() { return 'LabelStmt'; }
}

/** `Jump to the label "name".` */
export class JumpStmt extends Stmt {
  /**
   * @param {string} labelName
   * @param {number} line
   * @param {number} column
   */
  constructor(labelName, line, column) {
    super(line, column);
    this.labelName = labelName;
  }
  nodeType() { return 'JumpStmt'; }
}

/** `Execute the text inside variable.` */
export class ExecuteStmt extends Stmt {
  /**
   * @param {string} varName
   * @param {number} line
   * @param {number} column
   */
  constructor(varName, line, column) {
    super(line, column);
    this.varName = varName;
  }
  nodeType() { return 'ExecuteStmt'; }
}

/** `Inside dictName, "key" maps to value.` */
export class DictionarySetStmt extends Stmt {
  /**
   * @param {string} dictName
   * @param {Expr} key
   * @param {Expr} value
   * @param {number} line
   * @param {number} column
   */
  constructor(dictName, key, value, line, column) {
    super(line, column);
    this.dictName = dictName;
    this.key = key;
    this.value = value;
  }
  nodeType() { return 'DictionarySetStmt'; }
}

/** `ListName contains item1, item2, and item3.` */
export class ListAddStmt extends Stmt {
  /**
   * @param {string} listName
   * @param {Expr[]} items
   * @param {number} line
   * @param {number} column
   */
  constructor(listName, items, line, column) {
    super(line, column);
    this.listName = listName;
    this.items = items;
  }
  nodeType() { return 'ListAddStmt'; }
}

/** `Find every Type in collection whose property is value.` */
export class QueryStmt extends Stmt {
  /**
   * @param {string} typeName    e.g. "User"
   * @param {string} collection  e.g. "Staff"
   * @param {string} property    e.g. "role"
   * @param {Expr} value         e.g. "Administrator"
   * @param {number} line
   * @param {number} column
   */
  constructor(typeName, collection, property, value, line, column) {
    super(line, column);
    this.typeName = typeName;
    this.collection = collection;
    this.property = property;
    this.value = value;
  }
  nodeType() { return 'QueryStmt'; }
}

/** `Whenever entity's property changes: ...` */
export class WheneverStmt extends Stmt {
  /**
   * @param {string} entityName
   * @param {string|null} propertyName  null if watching all properties
   * @param {Stmt[]} body
   * @param {number} line
   * @param {number} column
   */
  constructor(entityName, propertyName, body, line, column) {
    super(line, column);
    this.entityName = entityName;
    this.propertyName = propertyName;
    this.body = body;
  }
  nodeType() { return 'WheneverStmt'; }
}

/** `Increase/Lower/Set variable by/to value.` - arithmetic mutation */
export class MutationStmt extends Stmt {
  /**
   * @param {string} operation   'increase', 'decrease'/'lower', 'set'
   * @param {string|null} entity  entity name for property, or null
   * @param {string} target       variable or property name
   * @param {Expr} value
   * @param {number} line
   * @param {number} column
   */
  constructor(operation, entity, target, value, line, column) {
    super(line, column);
    this.operation = operation;
    this.entity = entity;
    this.target = target;
    this.value = value;
  }
  nodeType() { return 'MutationStmt'; }
}

/** `Result is value.` - return from a verb */
export class ResultStmt extends Stmt {
  /**
   * @param {Expr} value
   * @param {number} line
   * @param {number} column
   */
  constructor(value, line, column) {
    super(line, column);
    this.value = value;
  }
  nodeType() { return 'ResultStmt'; }
}

/** Inline expression evaluated as a statement (for side-effects in parenthesized expressions) */
export class ExpressionStmt extends Stmt {
  /**
   * @param {Expr} expression
   * @param {number} line
   * @param {number} column
   */
  constructor(expression, line, column) {
    super(line, column);
    this.expression = expression;
  }
  nodeType() { return 'ExpressionStmt'; }
}

/**
 * `Using [verbName] parse { dslContent }` or `Using [verbName] process { ... }`
 * Passes the raw DSL text block to a verb for custom parsing.
 */
export class UsingStmt extends Stmt {
  /**
   * @param {string} verbName    handler verb name
   * @param {string} dslText     raw text content between { }
   * @param {number} line
   * @param {number} column
   */
  constructor(verbName, dslText, line, column) {
    super(line, column);
    this.verbName = verbName;
    this.dslText = dslText;
  }
  nodeType() { return 'UsingStmt'; }
}

/**
 * `Execute the shell command "cmd".` - run an OS command.
 */
export class ShellStmt extends Stmt {
  /**
   * @param {Expr} commandExpr   expression evaluating to the command string
   * @param {number} line
   * @param {number} column
   */
  constructor(commandExpr, line, column) {
    super(line, column);
    this.commandExpr = commandExpr;
  }
  nodeType() { return 'ShellStmt'; }
}

/**
 * `the output of the shell command "cmd"` - captures stdout of a command.
 */
export class ShellExpr extends Expr {
  /**
   * @param {Expr} commandExpr   expression evaluating to the command string
   * @param {number} line
   * @param {number} column
   */
  constructor(commandExpr, line, column) {
    super(line, column);
    this.commandExpr = commandExpr;
  }
  nodeType() { return 'ShellExpr'; }
}

// ---------------------------------------------------------------------------
// Expressions
// ---------------------------------------------------------------------------

/** Literal value: number, text, heredoc */
export class LiteralExpr extends Expr {
  /**
   * @param {string} valueType  'number', 'text', 'heredoc'
   * @param {string} rawValue
   * @param {number} line
   * @param {number} column
   */
  constructor(valueType, rawValue, line, column) {
    super(line, column);
    this.valueType = valueType;
    this.rawValue = rawValue;
  }
  nodeType() { return 'LiteralExpr'; }
}

/** Variable reference */
export class VariableExpr extends Expr {
  /**
   * @param {string} name
   * @param {number} line
   * @param {number} column
   */
  constructor(name, line, column) {
    super(line, column);
    this.name = name;
  }
  nodeType() { return 'VariableExpr'; }
}

/** Entity property access: `Alice's age` */
export class PropertyAccessExpr extends Expr {
  /**
   * @param {string} entity
   * @param {string} property
   * @param {number} line
   * @param {number} column
   */
  constructor(entity, property, line, column) {
    super(line, column);
    this.entity = entity;
    this.property = property;
  }
  nodeType() { return 'PropertyAccessExpr'; }
}

/** Binary operation: `X followed by Y`, `X is greater than Y`, etc. */
export class BinaryOpExpr extends Expr {
  /**
   * @param {Expr} left
   * @param {string} op   'followed_by', 'greater_than', 'less_than',
   *                       'equal_to', 'not_equal_to', 'greater_equal',
   *                       'less_equal', 'plus', 'minus', 'times', 'divided_by'
   * @param {Expr} right
   * @param {number} line
   * @param {number} column
   */
  constructor(left, op, right, line, column) {
    super(line, column);
    this.left = left;
    this.op = op;
    this.right = right;
  }
  nodeType() { return 'BinaryOpExpr'; }
}

/** Inline verb call used as an expression: `(Greet Target)` */
export class CallExpr extends Expr {
  /**
   * @param {string} verbName
   * @param {Expr[]} args
   * @param {number} line
   * @param {number} column
   */
  constructor(verbName, args, line, column) {
    super(line, column);
    this.verbName = verbName;
    this.args = args;
  }
  nodeType() { return 'CallExpr'; }
}

/** Dictionary value lookup: `the value for "key" inside dict` */
export class DictionaryAccessExpr extends Expr {
  /**
   * @param {string} dictName
   * @param {Expr} key
   * @param {number} line
   * @param {number} column
   */
  constructor(dictName, key, line, column) {
    super(line, column);
    this.dictName = dictName;
    this.key = key;
  }
  nodeType() { return 'DictionaryAccessExpr'; }
}

// ---------------------------------------------------------------------------
// New: Try/Catch, File I/O, JSON, Logic operators
// ---------------------------------------------------------------------------

/** `Try: ... Catch: ...` or `Try: ... Catch the error: ...` */
export class TryStmt extends Stmt {
  /**
   * @param {Stmt[]} tryBlock
   * @param {Stmt[]} catchBlock
   * @param {string|null} errorVar  variable name to bind the error, or null
   * @param {number} line
   * @param {number} column
   */
  constructor(tryBlock, catchBlock, errorVar = null, line = 0, column = 0) {
    super(line, column);
    this.tryBlock = tryBlock;
    this.catchBlock = catchBlock;
    this.errorVar = errorVar;
  }
  nodeType() { return 'TryStmt'; }
}

/** `Read the file [path] into [var].` */
export class ReadFileStmt extends Stmt {
  /**
   * @param {Expr} pathExpr
   * @param {string} targetVar
   * @param {number} line
   * @param {number} column
   */
  constructor(pathExpr, targetVar, line, column) {
    super(line, column);
    this.pathExpr = pathExpr;
    this.targetVar = targetVar;
  }
  nodeType() { return 'ReadFileStmt'; }
}

/** `Write [expr] to the file [path].` */
export class WriteFileStmt extends Stmt {
  /**
   * @param {Expr} valueExpr
   * @param {Expr} pathExpr
   * @param {number} line
   * @param {number} column
   */
  constructor(valueExpr, pathExpr, line, column) {
    super(line, column);
    this.valueExpr = valueExpr;
    this.pathExpr = pathExpr;
  }
  nodeType() { return 'WriteFileStmt'; }
}

/** `the parsed JSON of [expr]` - parses a JSON string into dict/list */
export class JsonParseExpr extends Expr {
  /**
   * @param {Expr} sourceExpr  expression evaluating to JSON text
   * @param {number} line
   * @param {number} column
   */
  constructor(sourceExpr, line, column) {
    super(line, column);
    this.sourceExpr = sourceExpr;
  }
  nodeType() { return 'JsonParseExpr'; }
}

/** Logical combination: `X and Y`, `X or Y` */
export class LogicalExpr extends Expr {
  /**
   * @param {Expr} left
   * @param {string} op  'and' or 'or'
   * @param {Expr} right
   * @param {number} line
   * @param {number} column
   */
  constructor(left, op, right, line, column) {
    super(line, column);
    this.left = left;
    this.op = op;
    this.right = right;
  }
  nodeType() { return 'LogicalExpr'; }
}

// ---------------------------------------------------------------------------
// New: Env var, HTTP fetch, Range for, Pipe shell, Include
// ---------------------------------------------------------------------------

/** `the environment variable "HOME"` */
export class EnvVarExpr extends Expr {
  constructor(nameExpr, line, column) {
    super(line, column);
    this.nameExpr = nameExpr;
  }
  nodeType() { return 'EnvVarExpr'; }
}

/** `the fetched content of the url "..."` */
export class FetchExpr extends Expr {
  constructor(urlExpr, line, column) {
    super(line, column);
    this.urlExpr = urlExpr;
  }
  nodeType() { return 'FetchExpr'; }
}

/** `For every Number from 1 to 10:` */
export class RangeForStmt extends Stmt {
  constructor(iteratorVar, fromExpr, toExpr, body, line, column) {
    super(line, column);
    this.iteratorVar = iteratorVar;
    this.fromExpr = fromExpr;
    this.toExpr = toExpr;
    this.body = body;
  }
  nodeType() { return 'RangeForStmt'; }
}

/** `Run the shell command "a" and pipe to "b".` */
export class PipeShellStmt extends Stmt {
  constructor(cmd1Expr, cmd2Expr, line, column) {
    super(line, column);
    this.cmd1Expr = cmd1Expr;
    this.cmd2Expr = cmd2Expr;
  }
  nodeType() { return 'PipeShellStmt'; }
}

/** `Include "file.prose".` */
export class IncludeStmt extends Stmt {
  constructor(pathExpr, line, column) {
    super(line, column);
    this.pathExpr = pathExpr;
  }
  nodeType() { return 'IncludeStmt'; }
}

// ---------------------------------------------------------------------------
// New: Map/Filter/Sum, Timed blocks, File ops, Extended Whenever
// ---------------------------------------------------------------------------

/** `List is every item in Source transformed by Verb.` */
export class MapExpr extends Expr {
  constructor(sourceExpr, verbName, line, column) {
    super(line, column);
    this.sourceExpr = sourceExpr;
    this.verbName = verbName;
  }
  nodeType() { return 'MapExpr'; }
}

/** `List is every item in Source where condition.` */
export class FilterExpr extends Expr {
  constructor(sourceExpr, condition, line, column) {
    super(line, column);
    this.sourceExpr = sourceExpr;
    this.condition = condition;
  }
  nodeType() { return 'FilterExpr'; }
}

/** `X is the sum of List.` */
export class SumExpr extends Expr {
  constructor(sourceExpr, line, column) {
    super(line, column);
    this.sourceExpr = sourceExpr;
  }
  nodeType() { return 'SumExpr'; }
}

/** `After N seconds: ...` */
export class AfterStmt extends Stmt {
  constructor(secondsExpr, body, line, column) {
    super(line, column);
    this.secondsExpr = secondsExpr;
    this.body = body;
  }
  nodeType() { return 'AfterStmt'; }
}

/** `Every N seconds: ...` */
export class EveryStmt extends Stmt {
  constructor(secondsExpr, body, line, column) {
    super(line, column);
    this.secondsExpr = secondsExpr;
    this.body = body;
  }
  nodeType() { return 'EveryStmt'; }
}

/** `Delete the file "path".` */
export class DeleteFileStmt extends Stmt {
  constructor(pathExpr, line, column) {
    super(line, column);
    this.pathExpr = pathExpr;
  }
  nodeType() { return 'DeleteFileStmt'; }
}

/** `the list of files in "dir"` */
export class ListFilesExpr extends Expr {
  constructor(dirExpr, line, column) {
    super(line, column);
    this.dirExpr = dirExpr;
  }
  nodeType() { return 'ListFilesExpr'; }
}

/** `Make the directory "path".` */
export class MkdirStmt extends Stmt {
  constructor(pathExpr, line, column) {
    super(line, column);
    this.pathExpr = pathExpr;
  }
  nodeType() { return 'MkdirStmt'; }
}

/** `Change directory to "path".` */
export class ChdirStmt extends Stmt {
  constructor(pathExpr, line, column) {
    super(line, column);
    this.pathExpr = pathExpr;
  }
  nodeType() { return 'ChdirStmt'; }
}

/** `Copy the file "from" to "to".` */
export class CopyFileStmt extends Stmt {
  constructor(fromExpr, toExpr, line, column) {
    super(line, column);
    this.fromExpr = fromExpr;
    this.toExpr = toExpr;
  }
  nodeType() { return 'CopyFileStmt'; }
}

/** `Rename the file "from" to "to".` */
export class RenameFileStmt extends Stmt {
  constructor(fromExpr, toExpr, line, column) {
    super(line, column);
    this.fromExpr = fromExpr;
    this.toExpr = toExpr;
  }
  nodeType() { return 'RenameFileStmt'; }
}

/** `Touch the file "path".` */
export class TouchFileStmt extends Stmt {
  constructor(pathExpr, line, column) {
    super(line, column);
    this.pathExpr = pathExpr;
  }
  nodeType() { return 'TouchFileStmt'; }
}

/** `Append expr to the file "path".` */
export class AppendFileStmt extends Stmt {
  constructor(valueExpr, pathExpr, line, column) {
    super(line, column);
    this.valueExpr = valueExpr;
    this.pathExpr = pathExpr;
  }
  nodeType() { return 'AppendFileStmt'; }
}

/** Flattened group of statements (numbered list item = label + body). */
export class SequenceStmt extends Stmt {
  constructor(statements, line, column) {
    super(line, column);
    this.statements = statements;
  }
  nodeType() { return 'SequenceStmt'; }
}

/** `call TARGET the Alias Phrase` */
export class AliasStmt extends Stmt {
  constructor(targetExpr, aliasWords, line, column) {
    super(line, column);
    this.targetExpr = targetExpr;
    this.aliasWords = aliasWords;
  }
  nodeType() { return 'AliasStmt'; }
}

/** `Keep SOURCE where CONDITION.` */
export class KeepStmt extends Stmt {
  constructor(sourceExpr, condition, line, column) {
    super(line, column);
    this.sourceExpr = sourceExpr;
    this.condition = condition;
  }
  nodeType() { return 'KeepStmt'; }
}

/** `With TARGET then: ...` */
export class WithStmt extends Stmt {
  constructor(targetExpr, body, line, column) {
    super(line, column);
    this.targetExpr = targetExpr;
    this.body = body;
  }
  nodeType() { return 'WithStmt'; }
}

/** `the Current Client.settle args` */
export class MethodCallStmt extends Stmt {
  constructor(targetExpr, verbName, args, line, column) {
    super(line, column);
    this.targetExpr = targetExpr;
    this.verbName = verbName;
    this.args = args;
  }
  nodeType() { return 'MethodCallStmt'; }
}

/** `end` */
export class NopStmt extends Stmt {
  nodeType() { return 'NopStmt'; }
}

/** Anaphor or typed phrase: `it`, `the Active Admin`, `the number` */
export class CorefExpr extends Expr {
  /**
   * @param {string} kind  'it'|'there'|'here'|'those'|'others'|'number'|'phrase'|'role'
   * @param {string[]} words
   */
  constructor(kind, words, line, column) {
    super(line, column);
    this.kind = kind;
    this.words = words;
  }
  nodeType() { return 'CorefExpr'; }
}

/** `name of the Active Admin` */
export class OfPropertyExpr extends Expr {
  constructor(property, objectExpr, line, column) {
    super(line, column);
    this.property = property;
    this.objectExpr = objectExpr;
  }
  nodeType() { return 'OfPropertyExpr'; }
}

/** `dictionary of type is "User" and status is "Active"` */
export class DictLiteralExpr extends Expr {
  constructor(pairs, line, column) {
    super(line, column);
    this.pairs = pairs; // [{key: string, value: Expr}]
  }
  nodeType() { return 'DictLiteralExpr'; }
}

/** `keep SOURCE where CONDITION` as an expression */
export class KeepExpr extends Expr {
  constructor(sourceExpr, condition, line, column) {
    super(line, column);
    this.sourceExpr = sourceExpr;
    this.condition = condition;
  }
  nodeType() { return 'KeepExpr'; }
}
