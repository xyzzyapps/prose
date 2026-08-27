# Prose

A programming language that reads like English. Statements are sentences. Blocks are indented. Files end in `.prose`.

```
Name is "Alice".
Print "Hello, ${Name}".
```

## Install and run

```bash
npm install
node src/index.js                  # interactive shell
node src/index.js examples/hello.prose
```

With [Bun](https://bun.sh):

```bash
npm run build
./dist/prose.exe examples/hello.prose
```

```
prose                     Interactive shell
prose <file.prose>        Run a file
prose --help
```

Type `.exit` to leave the shell. `.help` lists shell commands. Tab completes keywords.

## Two kinds of quotes

| Write | Meaning |
|-------|---------|
| `"Hello"` | A **string** |
| `` `echo hello` `` | An **OS command** |

They are not interchangeable. `"dir"` is text. `` `dir` `` runs a command.

```
Print "Hello".
`echo hello`.
Listing is `dir`.
```

## A first program

```
Name is "Ada".
Age is 36.
Print "${Name} is ${Age}".

If Age is greater than 18:
    Print "Adult".
Otherwise:
    Print "Minor".

To Greet Person:
    Print "Hello, ${Person}".

Greet Name.
```

Save as `hello.prose` and run `node src/index.js hello.prose`.

## Learn the language

The [tutorial](TUTORIAL.md) walks through every feature: types, lists, files, verbs, anaphora (`it`, `those`, `the Active Admin`), shell commands, and more.

Examples live in `examples/`.

## License

MIT
