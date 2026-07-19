# Prose Language Specification (SPEC.md)

## 1. Overview

Prose is a practical, declarative, and highly structured programming language designed to make code read like standard English prose. Every valid statement is a complete sentence terminating with a period (`.`). Blocks use indentation-based scoping (Python-style).

### Design Principles

1. **English-like syntax**: Code reads as grammatical English sentences
2. **Everything is a String** (Tcl-inspired): All data can be treated as text at runtime
3. **Declarative queries**: Collection filtering without manual loops
4. **Reactive programming**: Native `Whenever` blocks for event-driven behavior
5. **Explicit control flow**: `If`/`Otherwise`, `While`, `For every`, and `Goto`/`Label`

---

## 2. Lexical Structure

### 2.1 Tokens

| Token Type | Description | Example |
|-----------|-------------|---------|
| `WORD` | Identifiers and keywords | `Alice`, `Print`, `exists` |
| `NUMBER` | Integers and decimals | `42`, `3.14` |
| `TEXT` | Double-quoted strings | `"Hello, World!"` |
| `HEREDOC` | Multiline text blocks | (see Heredocs) |
| `POSSESSIVE` | Possessive marker | `'s` |
| `PERIOD` | Sentence terminator | `.` |
| `COLON` | Block opener | `:` |
| `COMMA` | List separator | `,` |
| `LPAREN` / `RPAREN` | Side-note delimiters | `(` `)` |
| `INDENT` / `DEDENT` | Indentation change | (virtual tokens) |
| `NEWLINE` | Line separator | `\n` |
| `EOF` | End of file | (virtual token) |

### 2.2 Indentation

Indentation uses spaces or tabs (1 tab = 4 spaces). INDENT/DEDENT tokens are generated Python-style when indentation levels change. Blank lines are ignored.

### 2.3 Comments

Lines starting with `#` are comments and ignored.

### 2.4 Articles

The articles `a`, `an`, and `the` are decorative and skipped during parsing unless they carry structural meaning (e.g., `A Type named X exists.`).

### 2.5 Heredocs

```
A Text named X exists as follows until TERMINATOR:
    content lines
TERMINATOR
```

The terminator is a custom word. Content is read verbatim until a line starting with the terminator is found. The header line's `exists as follows until TERM:` is consumed by the lexer, which emits `WORD("exists")` followed by a `HEREDOC` token.

---

## 3. Data Types

### 3.1 Number

Integer and floating-point values. Truthy if non-zero.

```
A Number named Age exists.
Age is 30.
```

### 3.2 Text

String values enclosed in double quotes with escape sequences (`\"`, `\\`, `\n`, `\t`, `\r`). Truthy if non-empty.

```
A Text named Name exists.
Name is "Alice".
```

### 3.3 Entity (Object)

Instances of a blueprint (class). Created with `A [Blueprint] named [Name] exists.` Properties accessed via possessive: `Entity's property`.

```
A User named Alice exists.
Alice's age is 25.
Alice's role is "Administrator".
```

### 3.4 List

Ordered collection. Created explicitly or via `contains`.

```
A List named Staff exists.
Staff contains Alice, Bob, and Charlie.
```

### 3.5 Dictionary

Key-value map. Keys are stringified.

```
A Dictionary named Capitals exists.
Inside Capitals, "France" maps to "Paris".
Print the value for "Japan" inside Capitals.
```

---

## 4. Statements

### 4.1 Variable Declaration

```
A [Type] named [Name] exists.
```

Creates a variable initialized to the type's default value:
- `Number` → `0`
- `Text` → `""`
- `List` → empty list
- `Dictionary` → empty dictionary
- Capitalized types (e.g., `User`, `Account`, `System`) → entity instances

### 4.2 Assignment

```
[Name] is [expression].
[Entity]'s [property] is [expression].
```

### 4.3 Print

```
Print [expression].
```

Evaluates the expression and writes to stdout.

### 4.4 Mutation

```
Increase [target] by [expression].
Lower [target] by [expression].
Set [target] to [expression].
```

Arithmetic mutation on numeric values. Supports entity properties: `Lower Primary's balance by 600.`

### 4.5 Conditional (If/Otherwise)

```
If [condition]:
    [statements...]
Otherwise:
    [statements...]
```

The `Otherwise:` clause is optional.

### 4.6 Loop (While)

```
While [condition]:
    [statements...]
```

Limited to 10,000 iterations for safety.

### 4.7 Iteration (For Every)

```
For every [variable] in [list]:
    [statements...]
```

### 4.8 Verb Definition (Function)

```
To [VerbName] [param1] [param2] ...:
    [statements...]
```

Return value via `Result is [expression].`

### 4.9 Verb Call

```
[VerbName] [arg1] [arg2] ... .
```

Arguments are evaluated expressions passed to the verb.

### 4.10 Label and Goto

```
Label "name".
Jump to the label "name".
```

Unconditional jump to a labeled position. Labels are registered in a first pass before execution.

### 4.11 Dynamic Execution

```
Execute the text inside [variable].
```

Treats the variable's text value as Prose source code, lexes, parses, and interprets it dynamically.

### 4.12 Dictionary Operations

```
Inside [dict], [key] maps to [value].
```

### 4.13 List Operations

```
[List] contains [item1], [item2], and [item3].
```

### 4.14 Query (Declarative Filter)

```
Find every [Type] in [collection] whose [property] is [value].
```

Filters a list for entities matching the criteria. Results stored in `query_result_[type]`.

### 4.15 Reactive Watch (Whenever)

```
Whenever [entity]'s [property] changes:
    [statements...]
```

Registers a reactive watcher. When the specified entity property is modified, the block executes. Limited to 100 nested watcher invocations to prevent infinite recursion.

### 4.16 Result (Return)

```
Result is [expression].
```

Returns a value from a verb. Causes immediate exit from the verb body.

### 4.17 DSL Using Block

```
Using [verbName] parse { [dslContent] }
```

Passes the raw text between `{ }` (including newlines and indentation) to the named verb as a Text argument. The verb processes the DSL content. Curly braces within the block are balanced and may be escaped with `\{` and `\}`.

The `{ }` block content is captured as a BRACEBLOCK token without any Prose parsing. This allows embedding arbitrary syntax (Makefiles, regex patterns, configuration formats, etc.) inside Prose code.

### 4.18 Shell Command Execution

```
Execute the shell command [commandExpr].
```

Runs the given command string in the OS shell (via `child_process.spawnSync`). Both stdout and stderr are printed. The command has a 30-second timeout.

### 4.19 Shell Output Capture

```
the output of the shell command [commandExpr]
```

Expression form that captures the stdout of a shell command as a Text value. Stderr is not captured in expression form.

### 4.20 Arithmetic Expressions

```
X is 5 plus 3.
X is 10 minus 4.
X is 3 times 7.
X is 20 divided by 4.
```

Infix arithmetic operators with equal precedence.

### 4.21 Logic Operators

```
If X is greater than 5 and Y is less than 10:
    ...

If A or B:
    ...
```

Short-circuit evaluation: `and` stops at first false, `or` stops at first true.

### 4.22 Else-If Chains

```
If condition1:
    ...
Otherwise if condition2:
    ...
Otherwise if condition3:
    ...
Otherwise:
    ...
```

### 4.23 For-Range Loops

```
For every Number from 1 to 10:
    Print _index.
```

Iterates from the `from` value to the `to` value (inclusive). The loop variable `_index` holds the current value.

### 4.24 File I/O

```
Read the file [path] into [var].
Write [expr] to the file [path].
```

Synchronous file read/write using UTF-8 encoding.

### 4.25 JSON Parsing

```
the parsed JSON of [expr]
```

Parses a JSON string into nested Dictionary/List values. Returns DictionaryValue or ListValue.

### 4.26 Try/Catch

```
Try:
    ...
Catch the error into ErrVar:
    ...
```

Executes the try block. If any ProseError is thrown, executes the catch block. The error message is bound to ErrVar (optional).

### 4.27 Pipe Shell Commands

```
Run the shell command [cmd1] and pipe to [cmd2].
```

Runs `cmd1 | cmd2` in the OS shell. Both stdout and stderr are printed.

### 4.28 Environment Variables

```
the environment variable [name]
```

Returns the value of an OS environment variable as Text. Returns empty string if not set.

### 4.29 HTTP Fetch

```
the fetched content of the url [url]
```

Performs an HTTP GET request (via Node subprocess) and returns the response body as Text. Has a 15-second timeout.

### 4.30 Module System (Include)

```
Include [path].
```

Loads and executes another Prose file in the current scope. Variables and verbs defined in the included file persist.

### 4.31 String Interpolation

```
"Hello, ${Name}!"
```

Inside double-quoted strings, `${variable}` is replaced with the variable's string value at runtime. Use `\$` for a literal dollar sign.

### 4.32 String Built-in Verbs

| Verb | Parameters | Description |
|------|-----------|-------------|
| `uppercase` | text | Returns uppercase text |
| `lowercase` | text | Returns lowercase text |
| `split` | text, by, delimiter | Splits text into a List |
| `join` | list, with, delimiter | Joins list items with delimiter |
| `replace` | in, text, replace, old, with, new | Replaces all occurrences |

---

## 5. Expressions

### 5.1 Literals

- Numbers: `42`, `3.14`
- Text: `"hello"`
- Heredocs: (stored as text)

### 5.2 Variable Reference

```
[Name]
```

### 5.3 Property Access

```
[Entity]'s [property]
```

### 5.4 Binary Operations

| Operator | Prose Syntax | Description |
|----------|-------------|-------------|
| Concatenation | `X followed by Y` | String concatenation |
| Addition | `X plus Y` | Numeric addition |
| Subtraction | `X minus Y` | Numeric subtraction |
| Multiplication | `X times Y` | Numeric multiplication |
| Division | `X divided by Y` | Numeric division |
| Greater than | `X is greater than Y` | Numeric comparison |
| Less than | `X is less than Y` | Numeric comparison |
| Greater or equal | `X is greater than or equal to Y` | Numeric comparison |
| Less or equal | `X is less than or equal to Y` | Numeric comparison |
| Equal to | `X is equal to Y` | String equality |
| Not equal to | `X is not equal to Y` | String inequality |
| Logical AND | `X and Y` | Short-circuit logical and |
| Logical OR | `X or Y` | Short-circuit logical or |

### 5.5 Side-Notes (Command Substitution)

```
( [statement or expression] )
```

Parenthesized expressions are evaluated first and their result substituted inline as text. This is Prose's equivalent of `$(...)` in bash or `[...]` in Tcl.

### 5.6 Dictionary Access

```
the value for [key] inside [dictionary]
```

Returns the value mapped to the key. Returns empty text if not found.

---

## 6. Runtime Semantics

### 6.1 Everything is a String

Internally, all values can be converted to their string representation. This enables:
- Dynamic code execution via `Execute the text inside X.`
- String concatenation with `followed by`
- Seamless mixing of types in output

### 6.2 Scope

Variables use lexical scoping. Each verb execution creates a child scope. Variable lookup walks the scope chain upward.

### 6.3 Truthiness

- `Number`: non-zero → true
- `Text`: non-empty → true
- `List`: non-empty → true
- `Entity`: always true
- `Null`/nothing: false

### 6.4 Reactive Execution

Whenever watchers fire synchronously when an entity property changes. Watchers execute in a child interpreter that shares the output buffer. Watcher recursion is limited to 100 levels.

---

## 7. Architecture

### 7.1 Pipeline

```
Source Text → Lexer → Tokens → Parser → AST → Interpreter → Output
```

### 7.2 Component Diagram

```
┌──────────────────────────────────────────────┐
│                  src/index.js                 │
│              (Entry point / CLI)              │
└──────┬──────────────────────────┬────────────┘
       │                          │
       ▼                          ▼
┌──────────────┐          ┌──────────────┐
│ shell/       │          │ (file mode)  │
│  Shell.js    │          │              │
│  (REPL)      │          │              │
└──────┬───────┘          └──────┬───────┘
       │                         │
       └──────────┬──────────────┘
                  ▼
┌──────────────────────────────────────────────┐
│              lexer/Lexer.js                   │
│         Source text → Token stream            │
└──────────────────┬───────────────────────────┘
                   ▼
┌──────────────────────────────────────────────┐
│              parser/Parser.js                 │
│       Token stream → AST (Program)            │
└──────────────────┬───────────────────────────┘
                   ▼
┌──────────────────────────────────────────────┐
│          interpreter/Interpreter.js           │
│        AST → Execution → Output               │
└──────────────────┬───────────────────────────┘
                   │
          ┌────────┴────────┐
          ▼                 ▼
┌──────────────┐   ┌──────────────┐
│ core/        │   │ core/        │
│  Value.js    │   │  Environment │
│  (data types)│   │  (scopes)    │
└──────────────┘   └──────────────┘
```

### 7.3 Key Design Decisions

1. **No external dependencies**: Uses only Node.js built-in modules
2. **ES modules**: Modern `import`/`export` syntax
3. **Recursive descent with pattern matching**: Parser tries sentence patterns in order
4. **Python-style indentation**: INDENT/DEDENT tokens generated by lexer
5. **Exception-based control flow**: `ReturnSignal` for verb returns, `GotoSignal` for jumps
6. **Synchronous execution model**: No async/await in the core interpreter

---

## 8. Error Handling

| Error Type | Description |
|-----------|-------------|
| `SyntaxError` | Invalid token or syntax during parsing |
| `RuntimeError` | Error during program execution |
| `NameError` | Undefined variable or verb |
| `TypeError` | Type mismatch (e.g., treating non-entity as entity) |

Errors include line and column information for debugging.

The parser includes error recovery: if a statement cannot be parsed, it skips to the next PERIOD and continues. This allows partial execution of programs with syntax errors.

---

## 9. Limitations

1. **No user-defined types/blueprints**: Entity blueprints are nominal only
2. **No first-class boolean type**: Truthiness is implicit (non-zero number, non-empty text)
3. **No closures in verbs**: Verbs capture their definition environment as closure
4. **Goto within blocks**: Jump only to top-level labels
5. **Single-threaded**: No concurrency support
6. **HTTP fetch via subprocess**: Slower than native HTTP, requires Node.js on PATH

---

## 10. Example Program

See `examples/bank_simple.prose` for a complete working example demonstrating dictionaries, entities, heredocs, reactive Whenever blocks, and side-note command substitution.
