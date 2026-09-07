# Prose

[![Built with Grok](https://img.shields.io/badge/Built_with-Grok-000000?style=flat&logo=xai&logoColor=white)](https://grok.com)

A programming language that reads like English. Statements are sentences. Blocks are indented. Files end in `.prose`.

```
name is "Alice".
Print "Hello, ${name}".
```

## Install and run

```bash
npm install
node src/index.js examples/hello.prose
```

With [Bun](https://bun.sh)

```bash
npm run build
./dist/prose.exe examples/hello.prose
```

```
prose                     Interactive REPL
prose <file.prose>        Run a file
prose --help
```

The REPL runs one statement per line. Periods are optional. Same-line blocks work: `If x > 5 Print "yes" Otherwise Print "no"`.

## Two kinds of quotes

| Write | Meaning |
|-------|---------|
| `"Hello"` | A **string** |
| `` `echo hello` `` | An **OS command** |

They are not interchangeable. `"dir"` is text. `` `dir` `` runs a command.

Keywords and verb names start with a capital: `Print`, `If`, `To Greet`, `(Uppercase "hi")`. Articles stay small: `a`, `the`, `of`. Variables stay small: `score`, `my-score`. `x-y` is a name; `x - y` subtracts. Use parentheses for order; `*` is not tighter than `+`.

```
Print "Hello".
`echo hello`.
listing is `dir`.
```

## A first program

```
name is "Ada".
age is 36.
Print "${name} is ${age}".

If age is greater than 18
    Print "Adult".
Otherwise
    Print "Minor".

To Greet a Person
    Print "Hello, " + the Person.

A Person named ada exists.
Greet ada.
```

Save as `hello.prose` and run `node src/index.js hello.prose`.

## Learn the language

The [tutorial](TUTORIAL.md) walks through every feature: types, lists, files, verbs, anaphora (`it`, `those`, `the Active Admin`), shell commands, and more.

Examples live in `examples/`.

## License

MIT
