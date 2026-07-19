# TODO.md - Prose Language Shell (esh)

## Completed

- [x] Project structure (package.json, directories)
- [x] Core runtime: Value types (Number, Text, Entity, List, Dictionary, Null)
- [x] Core runtime: Environment (scope chain, verb registry, label registry, watchers)
- [x] Core runtime: Error types (SyntaxError, RuntimeError, NameError, TypeError)
- [x] Core runtime: Structured logging
- [x] Lexer: Token type definitions
- [x] Lexer: Indentation-aware tokenizer (INDENT/DEDENT)
- [x] Lexer: Heredoc support
- [x] Parser: AST node definitions for all statement/expression types
- [x] Parser: Pattern-matching recursive descent parser
- [x] Parser: Error recovery (skip to next PERIOD on parse failure)
- [x] Interpreter: Tree-walking evaluator
- [x] Interpreter: Goto/Label support (exception-based)
- [x] Interpreter: Reactive Whenever watchers
- [x] Interpreter: Dynamic code execution (Execute statement)
- [x] Interpreter: Side-note command substitution
- [x] Shell: Interactive REPL with readline
- [x] Shell: Multi-line input for indented blocks
- [x] Shell: Dot-commands (.help, .exit, .run, .load, .vars, .verbs, .reset, etc.)
- [x] CLI: Run files or start REPL from command line
- [x] Examples: hello.prose, variables.prose, bank_simple.prose, bank.prose
- [x] Documentation: README.md, SPEC.md

## Known Issues

### Parser
- [ ] **INDENT/DEDENT with NEWLINE**: The lexer doesn't emit NEWLINE between COLON and INDENT, which works but is technically incorrect. Should emit NEWLINE after every non-blank line.
- [ ] **Verb call greediness**: `_parseVerbCall` can match unexpected patterns; the keyword exclusion list is a workaround. A proper solution would use a more constrained grammar.
- [ ] **Error recovery is lossy**: Skipping to next PERIOD can cause cascading parse failures, especially in nested blocks.
- [ ] **No precedence for binary operators**: Only `followed by` and comparisons are supported as binary ops. Mathematical operators are not expressions.

### Interpreter
- [ ] **Watcher execution**: Whenever watchers share the output buffer but create child interpreters. This can cause subtle issues with Goto inside watchers.
- [ ] **No tail-call optimization**: Recursive verbs will stack overflow.
- [ ] **Dynamic execution isolates scopes**: `Execute` creates a child scope, so variables defined in dynamic code don't persist.

### Language
- [ ] **No boolean type**: Truthiness is implicit (non-zero number, non-empty text, non-empty list).
- [ ] **No negation operator**: Cannot write `If X is not greater than Y`.
- [ ] **Limited comparison**: Only `greater than` and `less than` supported.
- [ ] **No else-if chain**: Only single `Otherwise` clause.

## Future Enhancements

### High Priority
- [ ] Add proper test suite using Node.js test runner
- [ ] Fix NEWLINE emission between COLON and INDENT
- [ ] Add `is equal to` and `is not equal to` comparison support in parser
- [ ] Support `is greater than or equal to` and `is less than or equal to`
- [ ] Add `and`/`or` logical operators in conditions

### Medium Priority
- [ ] Arithmetic expressions: `X plus Y`, `X minus Y`, `X times Y`, `X divided by Y`
- [ ] Negation: `not` keyword
- [ ] Else-if chains: `Otherwise if condition:`
- [ ] For loops with ranges: `For every Number from 1 to 10:`
- [ ] Better error messages with source context display
- [ ] Tab completion in REPL
- [ ] Command history persistence (.prose_history file)
- [ ] Syntax highlighting support (VS Code extension, tree-sitter grammar)

### Low Priority
- [ ] Module/import system: `Include "file.prose".`
- [ ] User-defined types with blueprint definitions
- [ ] Standard library (math, string, file I/O verbs)
- [ ] Debug mode with step-through execution
- [ ] Source maps for error locations in dynamic code
- [ ] Compile to JavaScript (transpiler)
- [ ] Web playground (browser-based REPL)

### Shell Improvements
- [ ] Pipe support: `|` to chain operations
- [ ] Redirect support: `>` and `>>` for file output
- [ ] Environment variable access
- [ ] Tab completion for variables and verbs
- [ ] Multi-line editing with cursor movement

## Notes

- The full `bank.prose` example intentionally loops infinitely (Goto back to Label triggering the watcher). This is by design per the original Prose spec.
- The parser's error recovery means that programs with syntax errors may still partially execute. This is intentional for REPL usage but could be surprising in file mode.
- All value types implement `toString()` for the "Everything is a String" philosophy, but the conversion may not always be reversible.
