# esh — Prose Language Shell v2.0

A practical, declarative, and highly structured programming language that reads like standard English prose. No braces, no parentheses, no arcane punctuation -- just nouns, verbs, adjectives, and proper sentence structure.

Built in JavaScript for Node.js. Modern terminal UI with gradient banner, styled prompts, tab completion, and source-aware error display.

## Quick Start

```bash
cd esh
npm install       # Install TUI dependencies

# Start the interactive REPL
node src/index.js

# Run a Prose source file
node src/index.js examples/hello.prose
```

### Build Standalone Executable (Windows .exe)

Requires [Bun](https://bun.sh):

```bash
npm run build       # creates dist/esh.exe (~94 MB, zero dependencies)
./dist/esh.exe examples/hello.prose
```

## Usage

```
esh                          Start interactive REPL
esh <file.prose>             Run a Prose source file
esh --repl                   Force REPL mode
esh --run <file.prose>       Run a file explicitly
esh --help, -h               Show help
```

## Language Tour

### Variables and Types

Implicit declaration -- just assign, the type is inferred:

```
X is 42.                    # Creates a Number
Name is "Alice".            # Creates a Text
Pi is 3.14.                 # Creates a Number
```

Explicit declarations still work and `named` is optional:

```
A Number Age exists.        # Short form
A Text named Name exists.   # Long form (backward compatible)
```

### String Interpolation

Embed variables directly inside double-quoted strings with `${var}`:

```
Print "Hello, ${Name}! You are ${Age} years old".
```

### Entities (Objects)

```
A User named Alice exists.
Alice's age is 25.
Alice's role is "Administrator".
```

### Heredocs

```
A Text named Warning exists as follows until EndMsg:
    ==============================
    WARNING: Secure zone.
    All actions monitored.
    ==============================
EndMsg
```

### Collections

**Lists:**
```
A List Staff exists.
Staff contains Alice, Bob, and Charlie.

Find every User in Staff whose role is "Administrator".
```

**Map (transform every item):**
```
To double a Number:
    Result is Number times 2.

A List Doubled exists.
Doubled is every item in Numbers transformed by double.
```

**Filter (keep matching items):**
```
A List Big exists.
Big is every item in Numbers where _item is greater than 3.
```

**Sum:**
```
Total is the sum of Numbers.
```

**Dictionaries:**
```
A Dictionary Capitals exists.
Inside Capitals, "France" maps to "Paris".
Print the value for "Japan" inside Capitals.
```

### Arithmetic Expressions

```
X is 5 plus 3.          # 8
X is 10 minus 4.        # 6
X is 3 times 7.         # 21
X is 20 divided by 4.   # 5
```

### Conditionals and Comparisons

```
If Score is greater than or equal to 80:
    Print "Grade: A".
Otherwise if Score is greater than or equal to 70:
    Print "Grade: B".
Otherwise:
    Print "Grade: F".
```

Supported comparisons: `is greater than`, `is less than`, `is equal to`, `is not equal to`, `is greater than or equal to`, `is less than or equal to`.

Logic: `If X > 5 and Y < 10:` / `If A or B:` (short-circuit evaluation).

### Loops

```
# While loop
While Counter is less than 5:
    Increase Counter by 1.

# For-range
For every Number from 1 to 10:
    Print _index.

# For-each
For every User in Staff:
    Print User's name.
```

### Verbs (Functions)

```
To double a Number:
    Result is Number times 2.

To Greet User:
    Print "Hello, ${User}".

Greet "Alice".
```

### Reactive Programming (Whenever)

Works on entity properties AND plain variables:

```
# Entity property watch
Whenever Primary's balance changes:
    Print "Balance changed".

# Plain variable watch
Whenever X changes:
    Print "X is now ${X}".
```

### Timed Blocks

```
After 5 seconds:
    Print "Done waiting".

Every 2 seconds:
    Print "Tick".
```

### Command Substitution (Side-Notes)

```
Print "Status: " followed by (the value for "Overdraft" inside RiskRegistry).
```

Verb calls work inside parens: `Shout is (uppercase "hello").`

### Dynamic Code Execution

```
Execute the text inside DynamicAction.
```

### DSL Embedding (Using Blocks)

Embed custom DSLs inside `{ }` blocks -- raw text passed to a handler verb:

```
To ProcessRules Source:
    Print "Processing:" followed by Source.

Using ProcessRules parse {
    build: main.o util.o
        gcc -o build main.o util.o
}
```

### OS Shell Commands

```
# Execute and print output
Execute the shell command "dir".
Run the command "echo hello".
system "echo from system".

# Capture output (Perl backticks)
Listing is the output of the shell command "ls -la".
Out is (backtick "echo captured").
```

### Environment Variables

```
Home is the environment variable "HOME".
```

### HTTP Requests

```
Page is the fetched content of the url "https://api.example.com/data".
```

### Anaphora

```
Print it.                    # last scalar
Print the number.            # last number
Print here.                  # current folder
Print there.                 # last file path
Keep Scores where _item is greater than 5.
Print those.                 # kept
Print others.                # dropped
Print name of the Active Admin.
Call it the Current Client.
Settle the Current Client.
```

Numbered markdown lists (`1. Print "hi"`) omit the period; the number is a goto label.

### String Manipulation

```
Shout is (uppercase "hello").
Len is (length "hello").
Part is (substr "hello" 1 3).
```

Also: `lowercase`, `split`, `join`, `replace`, `index`, `rindex`, `chop`, `chomp`, `trim`, `reverse`, `repeat`, `sprintf`, `chr`, `ord`, `startswith`, `endswith`, `contains`.

### List and Dictionary Operations

```
A List named Items exists.
Items contains "a", "b", and "c".
Print (push Items "d").
Print (pop Items).
Print (sort Items).
Print (keys Capitals).
```

Also: `shift`, `unshift`, `first`, `last`, `unique`, `slice`, `splice`, `values`, `haskey`, `deletekey`, `dictsize`, `merge`.

### File I/O

```
Write "Hello, file!" to the file "output.txt".
Read the file "output.txt" into Content.
Append " more" to the file "output.txt".
Copy the file "output.txt" to "copy.txt".
Rename the file "copy.txt" to "renamed.txt".
Touch the file "stamp.txt".
Make the directory "tmp_prose".
Delete the file "output.txt".
Files is the list of files in ".".
```

File tests (Perl `-e`/`-f`/`-d`/`-r`/`-w`/`-s`/`-z`): `fileexists`, `isfile`, `isdir`, `isreadable`, `iswritable`, `isexecutable`, `filesize`, `isemptyfile`. Also `cat`, `glob`, `which`, `pwd`, `chdir`, `chmod`, `basename`, `dirname`.

### JSON Parsing

```
Data is the parsed JSON of "{\"name\": \"Alice\"}".
Print the value for "name" inside Data.
```

### Try/Catch Error Handling

```
Try:
    Execute the shell command "nonexistent-command".
Catch the error into ErrMsg:
    Print "Caught: ${ErrMsg}".
Print "Program continues after error handling".
```

### Module System (Include)

```
Include "helpers.prose".
```

### Goto and Labels

```
Label "Retry Connection".
If ConnectionStatus is "Failed":
    Jump to the label "Retry Connection".
```

## Shell Commands

The REPL features a modern terminal UI with gradient banner, path-aware prompt, tab completion, and styled output.

| Command | Description |
|---------|-------------|
| `.help` | Show styled help with tips |
| `.exit`, `.quit`, `.q` | Exit the shell |
| `.run <file>`, `.r` | Run a Prose file (fresh env) |
| `.load <file>`, `.l` | Load a Prose file (current env) |
| `.vars`, `.v` | List all variables (boxed) |
| `.verbs` | List all defined verbs (boxed) |
| `.reset` | Reset environment and clear history |
| `.clear`, `.cls` | Clear screen and re-show banner |
| `.env` | Show session info (dir, counts) |
| `.stats` | Show session statistics |
| `.echo <text>` | Print text |
| `.pwd` | Print working directory |

**Key bindings:**
- `Tab` — Complete dot-commands and Prose keywords
- `↑/↓` — Navigate command history
- `Ctrl+C` — Cancel multi-line input (or exit on second press)
- `Enter` on blank line — Execute multi-line block

## Project Architecture

```
src/
  core/         Value, Environment, Errors, Logger
  lexer/        Token, Lexer (indentation-aware)
  parser/       AST, Parser (pattern-matching recursive descent)
  interpreter/  Builtins, Interpreter (tree-walking + goto + reactive)
  shell/        Shell (interactive REPL)
  index.js      Entry point
examples/
  hello.prose         Hello World
  variables.prose     Data types and collections
  bank_simple.prose   Bank transaction with Whenever
  bank.prose          Full bank example with Goto loop
  dsl_shell.prose     DSL blocks and shell commands
  minimal_dsl.prose   Minimal DSL example
  new_features.prose  Arithmetic, comparisons, logic, else-if, file I/O, JSON, try/catch
  all_new.prose       String interp, env vars, range-for, pipe shell, fetch, include
  simplified.prose    Implicit vars, map, filter, sum, extended Whenever, file ops
```

## License

MIT
