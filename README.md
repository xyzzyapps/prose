# esh - Prose Language Shell

A practical, declarative, and highly structured programming language that reads like standard English prose. No braces, no parentheses, no arcane punctuation -- just nouns, verbs, adjectives, and proper sentence structure.

Built in JavaScript for Node.js. Zero external dependencies.

## Quick Start

```bash
cd esh

# No dependencies to install! Uses only Node.js built-ins.

# Start the interactive REPL
node src/index.js

# Run a Prose source file
node src/index.js examples/hello.prose
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

```
A Number named Age exists.
Age is 30.

A Text named Name exists.
Name is "Alice".
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

### Dictionaries

```
A Dictionary named Capitals exists.
Inside Capitals, "France" maps to "Paris".
Inside Capitals, "Japan" maps to "Tokyo".

Print the value for "Japan" inside Capitals.
```

### Lists and Queries

```
A List named Staff exists.
Staff contains Alice, Bob, and Charlie.

Find every User in Staff whose role is "Administrator".
```

### Arithmetic Expressions

```
A Number named X exists.
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
Otherwise if Score is greater than or equal to 60:
    Print "Grade: C".
Otherwise:
    Print "Grade: F".
```

Supported comparisons: `is greater than`, `is less than`, `is equal to`, `is not equal to`, `is greater than or equal to`, `is less than or equal to`.

### Logic Operators

```
If A is greater than 5 and B is less than 30:
    Print "Both conditions true".

If A is less than 5 or B is greater than 15:
    Print "At least one condition true".
```

### Loops

```
A Number named Counter exists.
Counter is 1.

While Counter is less than 5:
    Print "Count: " followed by Counter.
    Increase Counter by 1.
```

### For-Range Loops

```
For every Number from 1 to 5:
    Print _index.
```

### Verbs (Functions)

```
To Greet a User:
    Print "Hello, " followed by the User's name.

Greet Alice.
```

### Reactive Programming (Whenever)

```
A System named Core exists.
Core's status is "nominal".

Whenever Core's status changes:
    Print "Alert: System status is now " followed by Core's status.
```

### Command Substitution (Side-Notes)

```
Print "Status: " followed by (the value for "Overdraft" inside RiskRegistry).
```

### Dynamic Code Execution

```
A Command named DynamicAction exists.
DynamicAction is "Print \"System override activated.\"".

Execute the text inside DynamicAction.
```

### DSL Embedding (Using Blocks)

Embed custom domain-specific languages inside `{ }` blocks:

```
To ProcessRules a Source:
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

# Capture output into a variable
A Text named Listing exists.
Listing is the output of the shell command "ls -la".

# Pipe between commands
Run the shell command "cat log.txt" and pipe to "grep ERROR".
```

### Environment Variables

```
A Text named Home exists.
Home is the environment variable "HOME".
Print "User home: " followed by Home.
```

### HTTP Requests

```
A Text named Page exists.
Page is the fetched content of the url "https://api.example.com/data".
```

### String Manipulation

Built-in verbs for text processing:

```
Shout is (uppercase "hello").       # "HELLO"
Quiet is (lowercase "HELLO").       # "hello"
Replaced is (replace in "abc" replace "b" with "x").  # "axc"

# Also available: split, join
```

### File I/O

```
Write "Hello, file!" to the file "output.txt".

A Text named Content exists.
Read the file "output.txt" into Content.
```

### JSON Parsing

```
A Text named Raw exists.
Raw is "{\"name\": \"Alice\", \"age\": 30}".

A Dictionary named Data exists.
Data is the parsed JSON of Raw.

Print the value for "name" inside Data.
```

### Try/Catch Error Handling

```
Try:
    Execute the shell command "nonexistent-command".
Catch the error into ErrMsg:
    Print "Caught error: " followed by ErrMsg.

Print "Program continues after error handling".
```

### Module System (Include)

```
Include "helpers.prose".
```

### Goto and Labels

```
Label "Retry Connection".
Print "Attempting to reach database..."

If ConnectionStatus is "Failed":
    Jump to the label "Retry Connection".
```

## Shell Commands

Inside the interactive REPL, use dot-commands:

| Command | Description |
|---------|-------------|
| `.help` | Show help |
| `.exit`, `.quit`, `.q` | Exit the shell |
| `.run <file>` | Run a Prose file (fresh environment) |
| `.load <file>` | Load a Prose file (current environment) |
| `.vars`, `.v` | List all variables |
| `.verbs` | List all defined verbs |
| `.reset` | Reset environment |
| `.clear`, `.cls` | Clear screen |
| `.color` | Toggle colored output |

## Project Architecture

```
src/
  core/
    Value.js          Runtime value types
    Environment.js    Scope/variable management
    Errors.js         Error types
    Logger.js         Structured logging
  lexer/
    Token.js          Token type definitions
    Lexer.js          Tokenizer (indentation-aware)
  parser/
    AST.js            AST node definitions
    Parser.js         Pattern-matching recursive descent parser
  interpreter/
    Builtins.js       Built-in operations
    Interpreter.js    Tree-walking evaluator
  shell/
    Shell.js          Interactive REPL
  index.js            Entry point
examples/
  hello.prose         Hello World
  variables.prose     Data types and collections
  bank_simple.prose   Bank transaction with Whenever
  bank.prose          Full bank example with Goto loop
  dsl_shell.prose     DSL blocks and shell commands
  minimal_dsl.prose   Minimal DSL example
  new_features.prose  Arithmetic, comparisons, logic, else-if, file I/O, JSON, try/catch
  all_new.prose       String interp, env vars, range-for, pipe, fetch, include
```

## License

MIT
