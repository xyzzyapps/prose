# TODO.md

- [ ] **REPL is disabled.** Interactive mode (`prose` with no file, `--repl`) is off because multiline input is buggy: continuation indent, blank-line end, and `Otherwise`/`Catch` dedent do not hold together. To re-enable, wire `src/index.js` back to `Shell.start()` and have `start()` call `_startInteractive()`. Until then, only script execution (`prose <file.prose>`) is allowed.
- [ ] Debug mode with step-through execution
- [ ] Source maps for error locations in dynamic code
- [ ] Compile to JavaScript (transpiler)
- [ ] Web playground (browser-based REPL)
- [ ] Pipe support: `|` to chain operations
- [ ] Redirect support: `>` and `>>` for file output
- [ ] Environment variable access
- [ ] Tab completion for variables and verbs
- [ ] Multi-line editing with cursor movement

