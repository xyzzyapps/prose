# esh - Prose Language Shell

A practical, declarative, and highly structured programming language that reads like standard English prose. No braces, no parentheses, no arcane punctuation -- just nouns, verbs, adjectives, and proper sentence structure.

Built in JavaScript for Node.js.

## Quick Start

```bash
# Clone and enter the project
cd esh

# No dependencies to install! Uses only Node.js built-ins.

# Start the interactive REPL
node src/index.js

# Or make it executable and run directly
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

### Conditionals

```
If Alice's age is greater than 21:
    Print "Access granted."
Otherwise:
    Print "Access denied."
```

### Loops

```
A Number named Counter exists.
Counter is 1.

While Counter is less than 5:
    Print "Count: " followed by Counter.
    Increase Counter by 1.
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

Embed custom domain-specific languages inside `{ }` blocks.
The raw text is passed to a handler verb for custom parsing.

```
To ProcessRules a Source:
    Print "Processing:" followed by Source.

Using ProcessRules parse {
    build: main.o util.o
        gcc -o build main.o util.o
}
```

### OS Shell Commands

Execute OS commands and capture their output.

```
# Execute and print output
Execute the shell command "dir".

# Capture output into a variable
A Text named Listing exists.
Listing is the output of the shell command "ls -la".
Print Listing.
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

Multi-line blocks: end a line with `:` and the REPL enters continuation mode.
Press Enter on a blank line to execute the block.

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
```

## License

MIT
