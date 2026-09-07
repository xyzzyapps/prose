# Prose Language Specification (SPEC.md)

This document is the **normative** description of Prose for humans and for agents implementing, generating, or reviewing Prose. The tutorial is pedagogical; this spec is complete. If tutorial and spec disagree, the spec wins. The interpreter in `src/` is the reference implementation.

## 1. Overview

Prose is a practical, declarative, and highly structured programming language designed to make code read like standard English prose. Statements are complete sentences, usually ending with a period (`.`). A newline also ends a statement (so markdown lists need no `.`). Blocks use indentation-based scoping (Python-style).

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
| `WORD` | Identifiers and keywords | `alice`, `Print`, `exists` |
| `NUMBER` | Integers and decimals | `42`, `3.14` |
| `TEXT` | Double-quoted strings | `"Hello, World!"` |
| `COMMAND` | Backtick-quoted OS command | `` `echo hello` `` |
| `HEREDOC` | Multiline text blocks | (see Heredocs) |
| `POSSESSIVE` | Possessive marker | `'s` |
| `PERIOD` | Sentence terminator | `.` |
| `COMMA` | List separator | `,` |
| `LPAREN` / `RPAREN` | Side-note delimiters | `(` `)` |
| `LBRACE` / `RBRACE` | Not emitted; `{...}` becomes `BRACEBLOCK` | |
| `DOT` | Field access when `.` is immediately followed by a letter | `ada.age` |
| `BULLET` | Markdown list marker at line start | `- `, `* `, `+ ` |
| `INDENT` / `DEDENT` | Indentation change | (virtual tokens) |
| `NEWLINE` | End of a source line | `\n` |
| `EOF` | End of file | (virtual token) |
| `BRACEBLOCK` | Raw text between `{ }` | DSL content |
| `INTERPOLATED` | String with `${var}` | `"Hello, ${name}"` |

**Capitalization (normative):**

- **Keywords that open a statement or clause** start with a capital: `Print`, `If`, `Otherwise`, `Otherwise If`, `While`, `For Every`, `To`, `Result`, `Set`, `Increase`, `Label`, `Jump`, `Try`, `Catch`, `Keep`, `Call`, `Using`, `Include`, `Whenever`, `After`, `Every`, `A` / `An` (in declarations), `Inside`, `Find`, `Read`, `Write`, and the other file verbs.
- **Verb names** start with a capital: `To Greet a Person`, `Greet ada.`, `(Uppercase "hi")`.
- **Types** start with a capital: `Number`, `Person`, `Client`.
- **Articles and prepositions** stay lowercase: `a`, `an`, `the`, `of`, `to`, `by`, `in`, `from`, `using` (as a role filler), `is`, `named`, `exists`.
- **Variables** start with a lowercase letter: `score`, `myScore`, `my_score`, `my-score`. `Age is 30.` is a syntax error.

Lookup of names and verbs is still case-insensitive internally. The source form must use the capitals above. `print "hi".` is not a Print statement.

### 2.1.1 Statement terminators

A statement ends at the first of: `PERIOD` (`.`), `NEWLINE`, `DEDENT`, `EOF`, or `RPAREN` (inside a side-note). A missing `.` at end of line is valid.

A `.` immediately followed by a letter is `DOT` (field access: `ada.age`), not a terminator. `1. Print` (digit, period, space) is a numbered list item. `3.14` is a number.

### 2.2 Indentation

Indentation uses spaces or tabs (1 tab = 4 spaces). INDENT/DEDENT tokens are generated Python-style when indentation levels change. Blank lines are ignored.

### 2.3 Comments

Lines starting with `#` are comments and ignored.

### 2.4 Articles

The articles `a`, `an`, and `the` are decorative and skipped during parsing unless they carry structural meaning (e.g., `A Type named x exists.`).

### 2.5 Heredocs

```
A Text named x exists as follows until TERMINATOR
    content lines
TERMINATOR
```

The terminator is a custom word. Content is read verbatim until a line starting with the terminator is found. The header line's `exists as follows until TERM` is consumed by the lexer, which emits `WORD("exists")` followed by a `HEREDOC` token.

### 2.6 Quotes

| Form | Meaning |
|------|---------|
| `"text"` | **String** (Text). Escapes: `\"`, `\\`, `\n`, `\t`, `\r`. Interpolation: `"Hello, ${name}"`. |
| `` `command` `` | **Command**. Never a string. As a statement it runs; as an expression it captures stdout. |

Do not put OS commands in double quotes. `"dir"` is the four-character string dir; `` `dir` `` is a shell command.

### 2.8 Identifiers

Variables **must** start with a lowercase letter. They may be **camelCase**, **snake_case**, or **kebab-case**: `score`, `myScore`, `my_score`, `my-score`. Types and verb names stay Capitalized. `Age is 30.` is a syntax error; write `age is 30.`

Hyphens bind inside a word (`transformed-by` is one token). Put spaces around `-` when it means minus: `x - y`.

### 2.9 Compound keywords (kebab-case)

Where English used several keywords, a single kebab-case word is preferred.

| Verbose | Kebab / short |
|---------|----------------|
| `followed by` | `followed-by` or `+` |
| `Every item in Scores transformed by Double` | `Scores transformed-by Double` |
| `Every item in Scores where cond` | `Scores filtered-by cond` |
| `is greater than` | `greater-than` or `>` |
| `is less than` | `less-than` or `<` |
| `is greater than or equal to` | `greater-or-equal` or `>=` |
| `is less than or equal to` | `less-or-equal` or `<=` |
| `is equal to` | `equal-to` or `==` |
| `is not equal to` | `not-equal-to` or `!=` |
| `divided by` | `divided-by` or `/` |
| `plus` / `minus` / `times` | `+` `-` `*` |
| `For Every` | `For-Every` |
| `Otherwise If` | `Otherwise-If` |
| `Find every User in Staff whose role is` | `Find User in Staff with-role` |
| `A Text named warning exists as follows until End` | `warning <<End` |
| `Write X to the file "f"` | `Write x to "f"` |
| `Read the file "f" into C` | `Read "f" into c` |

`+` concatenates if either side is not a Number; otherwise it adds.

There is **no operator precedence**. `2 + 3 * 4` is `((2+3)*4)`. Use parentheses: `(2 + 3) * 4`.

`.` is **field access only** (`ada.age`), never a method call. Call verbs as sentences: `Settle ada`.

`=` is an alias of `is` (assignment). Equality is `==` or `is equal to`.

`True` / `False` are Numbers `1` and `0`. `Not` and `!` negate truthiness.

Indexing: `xs at 0`, `item 0 of xs`, `xs[0]`. Filter item is `_`: `Scores filtered-by _ > 15`.

`Break` / `Continue` work in `While`, `For-Every`, and range-for.

Scientific numbers: `1.5e2`, `1e-3`.

Parse errors **stop the run in files**. The REPL still skips to the next `.` or newline.

A custom verb type (`Client`) matches an Entity whose blueprint is Client, a Dictionary whose `type` is Client, or an entity aliased so the last word is Client (`Call u1 the Current Client`).

Command escapes: `` \` ``, `\\`. Commands may not span lines.

### 2.7 Markdown lists

At the start of line content, `- `, `* `, or `+ ` is a `BULLET` and is ignored as a statement prefix.

A line starting with a number then `.` is a **numbered item**. The number is registered as a goto label (`Jump to the label 1.`).

---

## 3. Data Types

### 3.1 Number

Integer and floating-point values. Truthy if non-zero.

```
A Number named age exists.
age is 30.
```

### 3.2 Text

String values. Always written in **double quotes** (`"..."`), never backticks. Escapes: `\"`, `\\`, `\n`, `\t`, `\r`. Truthy if non-empty.

```
A Text named name exists.
name is "Alice".
```

### 3.3 Entity (Object)

Instances of a blueprint (class). Created with `A [Blueprint] named [name] exists.` Properties accessed via possessive: `entity's property`.

```
A User named alice exists.
alice's age is 25.
alice's role is "Administrator".
```

### 3.4 List

Ordered collection. Created explicitly or via `contains`.

```
A List named staff exists.
staff contains alice, bob, and charlie.
```

### 3.5 Dictionary

Key-value map. Keys are stringified.

```
A Dictionary named capitals exists.
Inside capitals, "France" maps to "Paris".
Print the value for "Japan" inside capitals.
```

A dictionary assigned to a name is registered on the **entity graph** (see 4.32d). Property access (`name of u1`, `u1`'s name) works on both Entity and Dictionary.

### 3.6 Null

The value `nothing`. Falsy. Produced by missing lookups that degrade gracefully (some accessors) and by verbs such as `pop` on an empty list.

### 3.7 ShellResult

Result of running a command as a statement. Fields: `stdout`, `stderr`, `code`. Stringifies to stdout. Truthy iff `code === 0`.

A **backtick expression** (capture) yields **Text** (stdout), not ShellResult.

---

## 4. Statements

### 4.1 Variable Declaration

```
A [Type] [named] [name] exists.
```

`named` is optional. Also supports implicit declaration via assignment:

```
x is 42.         # Auto-creates Number
name is "Alice". # Auto-creates Text
```

Explicit declarations set the type's default value (`Number` → 0, `Text` → "", etc.). Implicit declarations infer the type from the value.

### 4.2 Assignment

```
[name] is [expression].
[entity]'s [property] is [expression].
```

If the target variable does not exist, it is auto-created with the value's type (implicit declaration).

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

Arithmetic mutation on numeric values. Supports entity properties: `Lower primary's balance by 600.`

### 4.5 Conditional (If/Otherwise)

```
If [condition]
    [statements...]
Otherwise
    [statements...]
```

The `Otherwise` clause is optional. No colon. A single statement may follow on the same line (handy in the REPL):

```
If x > 5 Print "yes" Otherwise Print "no".
While n < 3 Increase n by 1.
```

### 4.6 Loop (While)

```
While [condition]
    [statements...]
```

Limited to 10,000 iterations for safety.

### 4.7 Iteration (For Every)

```
For Every [variable] in [list]
    [statements...]
```

### 4.8 Verb Definition (Function)

Slots are **types**, not parameter names. Inside the body, refer to the argument as `the Type` / `the Type's field`. Interpolation of a slot uses the small-case type name: `${person}`.

```
To Greet a Person
    Print "Hello, " followed by the Person.

To Double a Number
    Result is the Number times 2.
```

A type is a builtin (`Number`, `Text`, `List`, `Dictionary`) or a Capitalized name of at least two letters (`Person`, `Client`, `Amount`). Dummy names (`N`, `x`, `param`) are a syntax error.

At the call, builtins are checked strictly (`To Double a Number` will not accept Text). A custom type (`Person`, `Client`) accepts an Entity or Dictionary; in the body that value is `the Person` / `the Client`. `Greet "Alice"` is a type error — greet a Person entity, not a string.

Return value via `Result is [expression].`

### 4.9 Verb Call

```
[VerbName] [arg1] [arg2] ... .
```

Arguments are evaluated expressions passed to the verb. Role fillers (`using`, `with`, `into`, `from`, `by`, `as`, `to`, `and`) between arguments are skipped.

Optional method form: `[entity].Verb args` (a `DOT` token). Equivalent to `Verb entity args`. Prefer the sentence form `Settle the Current Client.`

A line that is only `end` is a no-op (optional closer after a block).

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
Whenever [entity]'s [property] changes
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

Commands are **backticks** (`` `...` ``). Double quotes are only for strings.

```
`echo hello`.
Execute the shell command `dir`.
Execute the command `echo hello`.
Run the command `echo hello`.
Run the shell command `echo hello` and pipe to `findstr hello`.
```

A bare `` `command`. `` runs the command and prints stdout/stderr. English forms do the same. Timeout is 30 seconds (`child_process.spawnSync`).

### 4.19 Shell Output Capture

A backtick expression captures stdout (Unix command substitution):

```
listing is `ls -la`.
listing is the output of the shell command `ls -la`.
```

### 4.20 Arithmetic Expressions

```
x is 5 plus 3.
x is 10 minus 4.
x is 3 times 7.
x is 20 divided by 4.
```

Infix arithmetic operators with equal precedence.

### 4.21 Logic Operators

```
If x is greater than 5 and y is less than 10
    ...

If a or b
    ...
```

Short-circuit evaluation: `and` stops at first false, `or` stops at first true.

### 4.22 Else-If Chains

```
If condition1
    ...
Otherwise If condition2
    ...
Otherwise If condition3
    ...
Otherwise
    ...
```

### 4.23 For-Range Loops

```
For Every Number from 1 to 10
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
Try
    ...
Catch the error into err
    ...
```

Executes the try block. If any ProseError is thrown, executes the catch block. The error message is bound to `err` (optional).

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
"Hello, ${name}!"
```

Inside double-quoted strings, `${variable}` is replaced with the variable's string value at runtime. Use `\$` for a literal dollar sign.

### 4.32 String Built-in Verbs

Perl 4 / Tcl-inspired. Call as a sentence or a side-note: `(Uppercase "hello")`.

| Verb | Parameters | Description |
|------|-----------|-------------|
| `uppercase` | text | Uppercase text |
| `lowercase` | text | Lowercase text |
| `split` | text, delimiter | Split text into a List |
| `join` | list, delimiter | Join list items with delimiter |
| `replace` | text, old, new | Replace all occurrences of old with new |
| `length` | value | Character, list, or dictionary size |
| `substr` | text, start, count | Substring (Perl `substr`) |
| `index` | haystack, needle | First index of needle, or -1 |
| `rindex` | haystack, needle | Last index of needle |
| `chop` | text | Drop last character |
| `chomp` | text | Strip trailing newlines |
| `trim` | text | Strip leading/trailing whitespace |
| `reverse` | value | Reverse a string or list |
| `repeat` | text, count | Repeat text N times |
| `sprintf` | format, ... | `%s` `%d` `%f` `%%` formatting |
| `chr` | n | Character from code point |
| `ord` | text | Code point of first character |
| `startswith` | text, prefix | 1 if prefix matches |
| `endswith` | text, suffix | 1 if suffix matches |
| `contains` | haystack, needle | Text / list / dictionary membership |

### 4.32a List Built-in Verbs

Perl 4 array operations. `push` / `pop` / `shift` / `unshift` / `splice` mutate the list.

| Verb | Parameters | Description |
|------|-----------|-------------|
| `push` | list, item... | Append items, return new length |
| `pop` | list | Remove and return last item |
| `shift` | list | Remove and return first item |
| `unshift` | list, item... | Prepend items |
| `sort` | list | Sorted copy (numeric-aware text) |
| `first` | list | First item |
| `last` | list | Last item |
| `unique` | list | Deduplicated copy |
| `slice` | list, start, end | Copy of a range |
| `splice` | list, start, count, ... | Remove/insert in place |

### 4.32b Dictionary Built-in Verbs

Perl 4 hash operations.

| Verb | Parameters | Description |
|------|-----------|-------------|
| `keys` | dict | List of keys |
| `values` | dict | List of values |
| `haskey` | dict, key | 1 if key exists |
| `deletekey` | dict, key | Remove key, return prior value |
| `dictsize` | dict | Number of entries |
| `merge` | dest, src | Copy src entries into dest |

### 4.32c Anaphora and coreference

| Word | Refers to |
|------|-----------|
| `it` | Last scalar result, or the current keep/loop item |
| `it's FIELD` | `FIELD of it` |
| `there` | Last mentioned file or folder, or the target of `With TARGET then` |
| `here` | Current working directory |
| `those` | Last collection, or the list kept by `keep` |
| `others` | Items a `keep` dropped |
| `the number`, `the nearest number` | Most recently mentioned number |
| `the Type` | Most recent entity of that type |

```
Keep Scores filtered-by _ > 5.
Print those.
Print others.

With "notes.txt" then
    Read the file there into Content.
```

Markdown bullets (`-`, `*`, `+`) and numbered items (`1. ...`) do not need a closing period. The number becomes a goto label (`Jump to the label 1.`).

### 4.32d Dynamic entity graph

A dictionary assigned to a name is registered as an entity. `the Active Admin` finds the most recent dictionary whose fields include those words (`status` is Active, `role` is Admin, or `type` is Admin). If two equally recent entities match, the script stops with a coreference error.

```
Set u1 to Dictionary of type is "User" and status is "Active" and role is "Admin" and name is "Alice" and balance is 10.
Print name of the Active Admin.
Call the Active Admin the Current Client.
Set the Current Client's balance to 250.
Print balance of u1.
```

`Call it the Current Client.` attaches that phrase to the same entity.

### 4.32e Teaching a verb

`To Settle a Client` names a new command. Every slot is a type. The call must supply a value of that type (`Number`/`Text`/`List`/`Dictionary`, or an Entity/Dictionary whose type/blueprint matches). Inside the body only type references work: `the Client`, `the Client's name`. Interpolation uses the small-case type name: `${client}`.

```
To Settle a Client
    Set the Client's balanceDue to 0.
    Print "Settled " followed by the Client's name.

Settle the Current Client.
```

More than one type: `To Charge a Client using an Amount`. The filler is a **role**: inside the body `the Amount` and `the using number` are that argument. At the call, `using` / `with` / `into` / `from` / `by` / `as` / `to` / `and` may be written or left out.

`Charge the Current Client using 50.`

### 4.33 Collection Operations (Map, Filter, Sum)

**Map** -- transform every item using a verb:
```
doubled is Every item in numbers transformed by Double.
```

**Filter** -- keep items matching a condition (item bound to `_`):
```
big is numbers filtered-by _ > 3.
```

**Sum** -- numeric total of a list:
```
total is the sum of numbers.
```

### 4.34 Extended Whenever (Variable Watch)

```
Whenever [variable] changes
    [statements...]
```

Works on any variable, not just entity properties. Fires on every assignment.

### 4.35 Timed Blocks

```
After N seconds
    [statements...]

Every N seconds
    [statements...]
```

`After` executes once after the delay. `Every` repeats up to 100 iterations. Uses OS `sleep`/`timeout` for blocking delay.

### 4.36 File Operations (Extended)

Perl `-X` tests and tcsh-style path builtins.

```
Delete the file [path].
Make the directory [path].
Change directory to [path].
Copy the file [from] to [to].
Rename the file [from] to [to].
Touch the file [path].
Append [expr] to the file [path].
files is the list of files in [dir].
```

| Verb | Perl / tcsh analog | Description |
|------|-------------------|-------------|
| `fileexists` | `-e` | Path exists |
| `isfile` | `-f` | Regular file |
| `isdir` | `-d` | Directory |
| `isreadable` | `-r` | Readable |
| `iswritable` | `-w` | Writable |
| `isexecutable` | `-x` | Executable |
| `filesize` | `-s` | Size in bytes, or -1 |
| `isemptyfile` | `-z` | Size is 0 |
| `cat` | `cat` | Read file as Text |
| `touch` | `touch` | Create or update mtime |
| `mkdir` / `rmdir` | `mkdir` / `rmdir` | Create / remove directory |
| `unlink` | `unlink` | Delete file |
| `rename` / `copy` | `rename` / `cp` | Move / copy |
| `chdir` / `pwd` | `cd` / `pwd` | Change / print working directory |
| `chmod` | `chmod` | Mode (decimal 755 treated as octal) |
| `glob` | `glob` / tcsh glob | Expand `*` and `?` |
| `which` | `which` | Resolve command on PATH |
| `basename` / `dirname` | same | Path parts |

---

## 5. Expressions

### 5.1 Literals

- Numbers: `42`, `3.14`
- Text: `"hello"` (double quotes only)
- Commands: `` `echo hi` `` (expression = capture stdout as Text; statement = run)
- Heredocs: stored as Text
- Dictionary literals: `dictionary of type is "User" and name is "Ada"`

### 5.2 Variable Reference and anaphors

```
[Name]
it
there
here
those
others
the number
the nearest number
the Active Admin
the Client
the using number
```

See 4.32c. `it's FIELD` is `FIELD of it`.

### 5.3 Property Access

```
[Entity]'s [property]
[property] of [entity-or-dict]
```

Works on Entity and Dictionary. Missing dictionary keys used via `the value for K inside D` return empty text; missing properties via `'s` / `of` raise `NameError`.

### 5.4 Binary Operations

| Operator | Prose Syntax | Description |
|----------|-------------|-------------|
| Concatenation | `X followed by Y` | String concatenation |
| Addition | `X plus Y` | Numeric addition |
| Subtraction | `X minus Y` | Numeric subtraction |
| Multiplication | `X times Y` | Numeric multiplication |
| Division | `X divided by Y` | Numeric division |
| Greater than | `x is greater than y` | Numeric comparison |
| Less than | `x is less than y` | Numeric comparison |
| Greater or equal | `x is greater than or equal to y` | Numeric comparison |
| Less or equal | `x is less than or equal to y` | Numeric comparison |
| Equal to | `x is equal to y` | String equality |
| Not equal to | `x is not equal to y` | String inequality |
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

### 5.7 Keep expression

```
keep [list] where [condition]
```

Same as the `Keep` statement. Binds `_`, fills `those` / `others`.

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
- `Dictionary`: non-empty → true
- `Entity`: always true
- `ShellResult`: exit code 0 → true
- `Null`/nothing: false

### 6.4 Reactive Execution

Whenever watchers fire synchronously when an entity property **or** watched variable changes. Watchers execute in a child interpreter that shares the output buffer. Watcher recursion is limited to 100 levels.

### 6.5 Discourse (anaphora)

The **root** environment owns a `DiscourseState`:

| Slot | Updated when | Read by |
|------|----------------|---------|
| `it` | Last Number, Text, Entity, or Dictionary result; loop/keep item while iterating | `it`, `it's FIELD` |
| `lastNumber` | A Number is evaluated or assigned | `the number`, `the nearest number` |
| `those` | A List is mentioned, or `keep` succeeds | `those` |
| `others` | `keep` drops items | `others` |
| `there` | File/dir operations; `With TARGET then` | `there` |
| `here` | (not stored; always `process.cwd()`) | `here` |
| entity graph | Dictionary or Entity assigned/registered | `the Active Admin`, aliases from `Call` |

Phrase match: every content word in `the W1 W2 …` must equal (case-insensitive) a field **value**, the entity `type`, a registered alias, or the variable name. Among matches, the highest generation wins. Two matches with the same generation → `CoreferenceError`.

`Call TARGET the Alias Phrase` adds that phrase as an alias and binds it as a variable.

Typed verb slots bind `the Type`, optional `the role`, and `the role number` / `the role Type` in the verb scope, and register the argument on the entity graph.

### 6.6 Limits (reference implementation)

| Limit | Value |
|-------|--------|
| `While` iterations | 10,000 |
| `Every` iterations | 100 |
| Whenever nesting | 100 |
| Shell command timeout | 30 s |
| HTTP fetch timeout | 15 s |
| Division by zero | `RuntimeError` |

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
│  Terminal.js │          │              │
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

1. **Core zero-dependency**: Core interpreter uses only Node.js built-in modules
2. **Shell UI dependencies**: REPL uses chalk, boxen, ora, figlet, gradient-string for modern terminal look
3. **ES modules**: Modern `import`/`export` syntax
4. **Recursive descent with pattern matching**: Parser tries sentence patterns in order
5. **Python-style indentation**: INDENT/DEDENT tokens generated by lexer
6. **Exception-based control flow**: `ReturnSignal` for verb returns, `GotoSignal` for jumps
7. **Synchronous execution model**: No async/await in the core interpreter

---

## 8. Error Handling

| Error Type | Description |
|-----------|-------------|
| `SyntaxError` | Invalid token or syntax during parsing |
| `RuntimeError` | Error during program execution |
| `NameError` | Undefined variable or verb |
| `TypeError` | Type mismatch (e.g., treating non-entity as entity) |
| `CoreferenceError` | Anaphor or phrase has no unique referent (`it` with no prior scalar; two equally recent `the Active Admin` matches) |

Errors include line and column information for debugging.

The parser includes error recovery (REPL only): if a statement cannot be parsed, it skips to the next period or newline and continues.

---

## 9. Limitations

1. **No user-defined type/blueprint bodies**: `A User named alice exists` is nominal; fields are ad hoc
2. **No first-class boolean type**: Comparisons yield Number 1 or 0
3. **Goto**: Labels are registered on the top-level statement list only. `Jump` inside a verb or indented block cannot target an inner label
4. **Map stringifies**: `Every item in L transformed by V` passes each item as Text to the verb
5. **Parser recovery**: Unparsed statements skip to the next `.` and continue; programs with syntax errors may still run in part
6. **Single-threaded**: No concurrency
7. **HTTP fetch via subprocess**: Requires `node` on PATH; 15 s timeout
8. **`Every`**: Caps at 100 iterations
9. **Verb execution**: A nested `Interpreter` is created per call (builtins are re-registered on the child env)

---

## 10. Example Program

See `examples/bank_simple.prose` for a complete working example demonstrating dictionaries, entities, heredocs, reactive Whenever blocks, and side-note command substitution.

---

## 11. Internal Mechanisms

### 11.1 Goto Implementation
Goto uses a `GotoSignal` exception. A first pass registers all `Label` positions. During execution, `Jump` throws `GotoSignal(labelName)`. The interpreter's main loop catches it, looks up the label's statement index, and repositions the program counter. This means Goto only works at the top level of a program, not inside nested verb bodies.

### 11.2 Verb Return
Verb definitions use `ReturnSignal`. When `Result is x.` executes inside a verb, it throws `ReturnSignal(value)`. The verb caller catches this and returns the value. At the top level, `ReturnSignal` is also caught but the value is simply captured (the program does not terminate — only statements inside verbs exit early via `Result`).

### 11.3 Reactive Watchers
`Whenever` blocks register `ReactiveWatcher` objects in the Environment. When an entity property or variable is modified (via assignment or mutation), watchers are fired synchronously. Watchers execute in a child interpreter sharing the output buffer. Recursion is limited to 100 nested invocations to prevent infinite loops.

### 11.4 Implicit Declaration
When `x is 42.` is executed and `x` does not exist, the interpreter auto-creates the variable with the value's type (NumberValue, TextValue, ListValue, etc.). Explicit declarations (`A Number x exists.`) set the type's default value (Number → 0, Text → "", etc.).

### 11.5 Parser Error Recovery
If a statement cannot be parsed (no pattern matches) and recovery is on, the parser skips tokens until the next period or newline and continues. File mode does not recover.

### 11.6 Side-Note Evaluation
Parenthesized expressions `( ... )` are parsed by `parseInlineStatement`, which first tries verb call, then print, then assignment, then falls back to expression parsing. The result is wrapped in a `CallExpr('__paren__', ...)` which the interpreter evaluates and converts to text.

### 11.7 String Interpolation Internals
The lexer's `_readString` detects `${var}` inside double-quoted strings and produces an `INTERPOLATED` token containing a JSON array of segments: `[{t:'text',v:'...'}, {t:'var',n:'name'}, ...]`. The interpreter resolves variable references at evaluation time. Interpolated names must start with a lowercase letter.

---

## 12. Project Structure

```
prose/
├── src/
│   ├── index.js              CLI entry point (REPL or file)
│   ├── core/
│   │   ├── Value.js          Runtime value types (Number, Text, Entity, List, Dictionary, Null, ShellResult)
│   │   ├── Environment.js    Scope chain, verb/label/watcher registries
│   │   ├── Errors.js         SyntaxError, RuntimeError, NameError, TypeError, CoreferenceError
│   │   ├── Discourse.js      Anaphora and entity-graph state
│   │   └── Logger.js         Structured console logger
│   ├── lexer/
│   │   ├── Token.js          Token type constants and Token class
│   │   └── Lexer.js          Indentation-aware tokenizer (Python-style INDENT/DEDENT)
│   ├── parser/
│   │   ├── AST.js            All AST node classes (40+ statement and expression types)
│   │   └── Parser.js         Pattern-matching recursive descent parser
│   ├── interpreter/
│   │   ├── Builtins.js       Native verbs (string, list, dict, file tests, shell)
│   │   └── Interpreter.js    Tree-walking evaluator with Goto, Whenever, Try/Catch, shell, file I/O
│   └── shell/
│       ├── Terminal.js       UI utilities (chalk, boxen, ora, figlet, gradient-string)
│       └── Shell.js          Interactive REPL and file runner
├── examples/                 Example .prose programs (9 files)
├── test/                     Test suite (Node.js native test runner)
├── dist/                     Build output (prose.exe via Bun compile)
├── package.json              v2.0.0, dependencies, scripts
├── README.md                 End-user documentation
├── SPEC.md                   This specification
├── TUTORIAL.md               Full language tutorial
└── TODO.md                   Known issues and future work
```

---

## 13. Build & Run

### Development
```bash
npm install          # Install TUI dependencies
node src/index.js                         # Interactive REPL
node src/index.js examples/hello.prose   # Run a script
npm test             # Run the test suite
```

The REPL runs one statement per line. Periods are optional. Same-line bodies are allowed: `If x > 5 Print "yes"`. Do not write a colon after `If` / `While` / `To`.

### Standalone Executable
```bash
npm run build        # Requires Bun: creates dist/prose.exe
./dist/prose.exe examples/hello.prose
```

### Dependencies
- **Runtime (REPL only):** chalk, boxen, ora, figlet, gradient-string
- **Core interpreter:** Zero external dependencies (Node.js built-ins only)
- **Build:** Bun ≥1.0 (for `bun build --compile`)
