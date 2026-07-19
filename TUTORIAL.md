# esh Tutorial — Prose for Shell Users

Welcome to esh. If you know bash, zsh, or PowerShell, you already know the *concepts*.
Prose just uses English sentences instead of terse symbols. This guide maps your
existing shell knowledge to Prose one-to-one.

## Getting Started

```bash
# Start the REPL
./dist/esh.exe
# or: node src/index.js
```

You'll see the banner, then a prompt:
```
esh ~ ›
```

Type Prose statements ending with `.` and press Enter. Type `.exit` to quit.

---

## 1. Variables — No More `export` or `$`

| Shell | Prose |
|-------|-------|
| `NAME="Alice"` | `Name is "Alice".` |
| `AGE=30` | `Age is 30.` |
| `echo $NAME` | `Print Name.` |
| `echo "$NAME is $AGE"` | `Print "${Name} is ${Age}".` |

```prose
Name is "Alice".
Age is 30.
Print "${Name} is ${Age} years old".
```

**No declaration needed.** The first assignment creates the variable with
the right type automatically.

---

## 2. Math — Replace `$((...))` and `expr`

| Shell | Prose |
|-------|-------|
| `echo $((5 + 3))` | `Print 5 plus 3.` |
| `RESULT=$((10 - 4))` | `Result is 10 minus 4.` |
| `expr 3 \* 7` | `Print 3 times 7.` |

```prose
Total is 100 plus 50.          # 150
Tax is Total times 20 divided by 100.  # 30
Print "Total: ${Total}, Tax: ${Tax}".
```

Also: `Increase X by 1.` and `Lower X by 5.` mutate variables in-place.

---

## 3. Conditionals — Replace `if [ ... ]; then`

| Shell | Prose |
|-------|-------|
| `if [ "$X" -gt 5 ]; then ... fi` | `If X is greater than 5:` |
| `if [ "$A" = "yes" ]; then ... fi` | `If A is equal to "yes":` |
| `elif [ "$X" -ge 70 ]; then` | `Otherwise if X is greater than or equal to 70:` |
| `else` | `Otherwise:` |

```prose
If Score is greater than or equal to 90:
    Print "Grade: A".
Otherwise if Score is greater than or equal to 80:
    Print "Grade: B".
Otherwise if Score is greater than or equal to 70:
    Print "Grade: C".
Otherwise:
    Print "Grade: F".
```

Combine conditions with `and` / `or`:

```prose
If Age is greater than 18 and Score is greater than 60:
    Print "Passed".
```

Available comparisons:
`is greater than`, `is less than`, `is equal to`, `is not equal to`,
`is greater than or equal to`, `is less than or equal to`.

---

## 4. Loops — Replace `for`, `while`, `do`

| Shell | Prose |
|-------|-------|
| `for i in {1..10}; do ... done` | `For every Number from 1 to 10:` |
| `while [ $X -lt 5 ]; do ... done` | `While X is less than 5:` |

```prose
# Count 1 to 10
For every Number from 1 to 10:
    Print _index.

# While loop
Counter is 1.
While Counter is less than 5:
    Print "Count: ${Counter}".
    Increase Counter by 1.
```

---

## 5. List Processing — Replace `grep`, `awk`, `sed` loops

Prose has built-in map, filter, and sum. No need for `awk '{sum+=$1} END{print sum}'`.

```prose
# Create a list
A List Nums exists.
Nums contains 10, 20, 30, 40, and 50.

# Map: double every item
To double N: Result is N times 2.
Doubled is every item in Nums transformed by double.
Print Doubled.    # [20, 40, 60, 80, 100]

# Filter: keep values > 25
Big is every item in Nums where _item is greater than 25.
Print Big.        # [30, 40, 50]

# Sum: total of all values
Print the sum of Nums.   # 150
```

---

## 6. String Manipulation — Replace `sed`, `tr`, `cut`

| Shell | Prose |
|-------|-------|
| `echo "$X" \| tr 'a-z' 'A-Z'` | `Shout is (uppercase X).` |
| `echo "$X" \| tr 'A-Z' 'a-z'` | `Quiet is (lowercase X).` |
| `echo "$X" \| sed 's/old/new/g'` | `Replaced is (replace in X replace "old" with "new").` |
| `${STR//old/new}` | `(replace in Str replace "old" with "new")` |

```prose
Name is "alice".
Shout is (uppercase Name).        # "ALICE"
Quiet is (lowercase "HELLO").     # "hello"
Fixed is (replace in "a-b-c" replace "-" with "/").   # "a/b/c"
```

Also: `(split Text by ",")` returns a List, `Join List with "-"` returns a Text.

---

## 7. File Operations — Replace `cat`, `>`, `rm`, `ls`

| Shell | Prose |
|-------|-------|
| `cat file.txt` | `Read the file "file.txt" into Content. Print Content.` |
| `echo "hi" > file.txt` | `Write "hi" to the file "file.txt".` |
| `rm file.txt` | `Delete the file "file.txt".` |
| `ls` | `Files is the list of files in ".". Print Files.` |

```prose
# Read a file
A Text Content exists.
Read the file "input.txt" into Content.
Print Content.

# Write a file
Write "Hello, world!" to the file "output.txt".

# Delete a file
Delete the file "temp.txt".

# List directory
Files is the list of files in ".".
Print Files.
```

---

## 8. Running Commands — Replace Backticks and `$()`

| Shell | Prose |
|-------|-------|
| `` `ls -la` `` | `the output of the shell command "ls -la"` |
| `echo $(date)` | `Print (the output of the shell command "date").` |
| `ls \| grep txt` | `Run the shell command "ls" and pipe to "grep txt".` |

```prose
# Capture command output
Listing is the output of the shell command "ls -la".
Print Listing.

# Execute without capturing
Execute the shell command "mkdir -p mydir".

# Pipe
Run the shell command "cat log.txt" and pipe to "grep ERROR".
```

---

## 9. Environment Variables — Replace `$HOME`, `$PATH`

| Shell | Prose |
|-------|-------|
| `echo $HOME` | `Print the environment variable "HOME".` |
| `export MYVAR=hello` | *Set via OS, read in Prose:* `Print the environment variable "MYVAR".` |

```prose
Home is the environment variable "HOME".
Path is the environment variable "PATH".
Print "Home: ${Home}".
```

---

## 10. JSON / APIs — Replace `jq`, `curl | jq`

| Shell | Prose |
|-------|-------|
| `curl -s URL \| jq '.name'` | Read URL, parse JSON, access key: |

```prose
# Fetch data
Raw is the fetched content of the url "https://api.github.com/repos/torvalds/linux".

# Parse JSON
Data is the parsed JSON of Raw.
Print the value for "full_name" inside Data.
Print the value for "stargazers_count" inside Data.
```

---

## 11. Functions — Replace `function name() { ... }`

| Shell | Prose |
|-------|-------|
| `greet() { echo "Hello, $1"; }` | `To Greet Name: Print "Hello, ${Name}".` |

```prose
To double N:
    Result is N times 2.

To Greet Name:
    Print "Hello, ${Name}!".

Greet "Alice".           # Hello, Alice!
Print (double 21).       # 42
```

---

## 12. Error Handling — Replace `||`, `set -e`, `trap`

| Shell | Prose |
|-------|-------|
| `cmd || echo "failed"` | `Try: ... Catch the error into E: Print E.` |
| `set -e` | Try/Catch blocks |

```prose
Try:
    Execute the shell command "risky-command".
Catch the error into Err:
    Print "Failed: ${Err}".

Print "Continues anyway".
```

---

## 13. Scripting — Replace `.sh` files with `.prose`

**Shell script (`backup.sh`):**
```bash
#!/bin/bash
DATE=$(date +%Y-%m-%d)
mkdir -p backups
cp *.txt "backups/$DATE/"
echo "Backed up to backups/$DATE"
```

**Same thing in Prose (`backup.prose`):**
```prose
Today is the output of the shell command "date +%Y-%m-%d".
Execute the shell command "mkdir -p backups".
Run the shell command "cp *.txt backups/${Today}".
Print "Backed up to backups/${Today}".
```

Run it: `./dist/esh.exe backup.prose`

---

## 14. Reactive Automation — Replace `watch`, `cron`, `inotify`

| Shell | Prose |
|-------|-------|
| `watch -n 5 cmd` | `Every 5 seconds: Execute the shell command "cmd".` |
| `cron` job | `Whenever File changes:` |

```prose
# Run every 5 seconds
Every 5 seconds:
    Print "Checking...".
    Execute the shell command "df -h".

# React to variable changes
Whenever Status changes:
    Print "Status is now ${Status}".
    Execute the shell command "notify-send 'Status: ${Status}'".
```

---

## 15. Quick Reference Card

| Task | Bash | Prose |
|------|------|-------|
| Set variable | `X=42` | `X is 42.` |
| Print | `echo $X` | `Print X.` |
| If | `if [ $X -gt 5 ]` | `If X is greater than 5:` |
| Loop 1..10 | `for i in {1..10}` | `For every Number from 1 to 10:` |
| Math | `$((a + b))` | `A plus B` |
| Uppercase | `tr a-z A-Z` | `(uppercase X)` |
| Replace | `sed s/old/new/` | `(replace in X replace "old" with "new")` |
| Read file | `cat f.txt` | `Read the file "f.txt" into C.` |
| Write file | `echo hi > f.txt` | `Write "hi" to the file "f.txt".` |
| Delete file | `rm f.txt` | `Delete the file "f.txt".` |
| List files | `ls` | `the list of files in "."` |
| Run command | `` `cmd` `` | `the output of the shell command "cmd"` |
| Pipe | `a \| b` | `Run the shell command "a" and pipe to "b".` |
| Env var | `$HOME` | `the environment variable "HOME"` |
| JSON parse | `jq .key` | `the parsed JSON of ...` then `the value for "key" inside ...` |
| Function | `f() { ... }` | `To f Param: ...` |
| Try/catch | `cmd \|\| echo err` | `Try: ... Catch the error into E:` |
| Sleep | `sleep 5` | `After 5 seconds:` |
| Cron | cron | `Every 60 seconds:` |
| Watch | inotify | `Whenever X changes:` |
| Module | `source` | `Include "file.prose".` |
| DSL embed | heredoc | `Using Handler parse { ... }` |

---

## Tips

- **Every statement ends with `.`** — this is the #1 gotcha for shell users.
- **No `$` for variables** — `X` not `$X` (except inside `${...}` in strings).
- **Colon starts a block** — `If X:` not `if X; then`.
- **Indentation matters** — 4 spaces (or tab) for block bodies, like Python.
- **`.help`** in the REPL shows all built-in commands.
- **`Tab`** completes dot-commands and Prose keywords.
- **Include files** to organize code: `Include "helpers.prose".`
- **Comments** start with `#`, just like shell.
