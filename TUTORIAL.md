# esh Tutorial — Prose for Shell Users

Welcome to esh. If you know bash, zsh, or PowerShell, you already know the *concepts*.
Prose just uses English sentences instead of terse symbols.

## Getting Started

```bash
# Start the REPL
./dist/esh.exe
# or: node src/index.js
```

Prompt:
```
esh ~ ›
```

Type Prose statements ending with `.` and press Enter. `.exit` to quit.

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

**No declaration needed.** The first assignment creates the variable automatically.

---

## 2. Math — Replace `$((...))` and `expr`

| Shell | Prose |
|-------|-------|
| `echo $((5 + 3))` | `Print 5 plus 3.` |
| `echo $((10 - 4))` | `Print 10 minus 4.` |

```prose
Total is 100 plus 50.          # 150
Tax is Total times 20 divided by 100.  # 30
Print "Total: ${Total}, Tax: ${Tax}".
```

Mutate in-place: `Increase X by 1.` / `Lower X by 5.`

---

## 3. Conditionals — Replace `if [ ... ]; then`

| Shell | Prose |
|-------|-------|
| `if [ "$X" -gt 5 ]; then ... fi` | `If X is greater than 5:` |
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

Combine with `and` / `or`:

```prose
If Age is greater than 18 and Score is greater than 60:
    Print "Passed".
```

Comparisons: `is greater than`, `is less than`, `is equal to`, `is not equal to`,
`is greater than or equal to`, `is less than or equal to`.

---

## 4. Loops — Replace `for`, `while`

| Shell | Prose |
|-------|-------|
| `for i in {1..10}; do ... done` | `For every Number from 1 to 10:` |
| `while [ $X -lt 5 ]; do ... done` | `While X is less than 5:` |

```prose
# Range
For every Number from 1 to 5:
    Print _index.

# While
Counter is 1.
While Counter is less than 3:
    Print "While: ${Counter}".
    Increase Counter by 1.
```

---

## 5. List Processing — Replace `grep`, `awk`, `sed` loops

```prose
A List Nums exists.
Nums contains 10, 20, 30, 40, and 50.

# Map — like awk '{print $1*2}'
To double N:
    Result is N times 2.

Doubled is every item in Nums transformed by double.
Print Doubled.    # [20, 40, 60, 80, 100]

# Filter — like grep / awk '$1>25'
Big is every item in Nums where _item is greater than 25.
Print Big.        # [30, 40, 50]

# Sum — like awk '{sum+=$1} END{print sum}'
Print the sum of Nums.   # 150
```

---

## 6. String Manipulation — Replace `tr`, `sed`

| Shell | Prose |
|-------|-------|
| `echo "$X" \| tr a-z A-Z` | `(uppercase X)` |
| `echo "$X" \| tr A-Z a-z` | `(lowercase X)` |
| `echo "$X" \| sed 's/old/new/g'` | `(replace X "old" "new")` |

```prose
Shout is (uppercase "hello").        # "HELLO"
Quiet is (lowercase "HELLO").        # "hello"
Fixed is (replace "a-b-c" "-" "/").  # "a/b/c"
```

---

## 7. File Operations — Replace `cat`, `>`, `rm`, `ls`

| Shell | Prose |
|-------|-------|
| `cat file.txt` | `Read the file "file.txt" into Content. Print Content.` |
| `echo "hi" > file.txt` | `Write "hi" to the file "file.txt".` |
| `rm file.txt` | `Delete the file "file.txt".` |
| `ls` | `Files is the list of files in "."` |

```prose
Write "Hello, world!" to the file "output.txt".
Read the file "output.txt" into Content.
Print Content.
Delete the file "output.txt".
Files is the list of files in ".".
```

---

## 8. Running Commands — Replace Backticks and `$()`

| Shell | Prose |
|-------|-------|
| `` `ls -la` `` | `the output of the shell command "ls -la"` |
| `ls \| grep txt` | `Run the shell command "ls" and pipe to "grep txt".` |

```prose
# Capture
Listing is the output of the shell command "ls -la".
Print Listing.

# Execute (no capture)
Execute the shell command "mkdir -p mydir".

# Pipe
Run the shell command "cat log.txt" and pipe to "grep ERROR".
```

---

## 9. Environment Variables — Replace `$HOME`

```prose
Home is the environment variable "HOME".
Print "Home: ${Home}".
```

---

## 10. JSON / APIs — Replace `jq`, `curl | jq`

```prose
Raw is the fetched content of the url "https://api.github.com/repos/torvalds/linux".
Data is the parsed JSON of Raw.
Print the value for "full_name" inside Data.
```

---

## 11. Functions (Verbs) — Replace `function name() { }`

```prose
To double N:
    Result is N times 2.

To Greet Name:
    Print "Hello, ${Name}!".

Greet "Alice".           # Hello, Alice!
Print (double 21).       # 42
```

---

## 12. Error Handling — Replace `||`, `trap`

```prose
Try:
    Execute the shell command "risky-command".
Catch the error into Err:
    Print "Failed: ${Err}".
Print "Continues anyway".
```

---

## 13. Scripting — Replace `.sh` with `.prose`

**Shell:**
```bash
#!/bin/bash
DATE=$(date +%Y-%m-%d)
mkdir -p backups
cp *.txt "backups/$DATE/"
echo "Backed up to backups/$DATE"
```

**Prose:**
```prose
Today is the output of the shell command "date +%Y-%m-%d".
Execute the shell command "mkdir -p backups".
Run the shell command "cp *.txt backups/${Today}".
Print "Backed up to backups/${Today}".
```

Run: `./dist/esh.exe backup.prose`

---

## 14. Reactive Automation — Replace `watch`, `cron`

```prose
# Every N seconds
Every 5 seconds:
    Execute the shell command "df -h".

# One-shot delay
After 10 seconds:
    Print "Done waiting".

# React to changes
Whenever Status changes:
    Print "Status is now ${Status}".
```

---

## Quick Reference Card

| Task | Bash | Prose |
|------|------|-------|
| Set variable | `X=42` | `X is 42.` |
| Print | `echo $X` | `Print X.` |
| Interpolate | `"$X $Y"` | `"${X} ${Y}"` |
| If | `if [ $X -gt 5 ]` | `If X is greater than 5:` |
| Else-if | `elif` | `Otherwise if X:` |
| Loop 1..10 | `for i in {1..10}` | `For every Number from 1 to 10:` |
| While | `while [ $X -lt 5 ]` | `While X is less than 5:` |
| Math | `$((a + b))` | `A plus B` |
| Uppercase | `tr a-z A-Z` | `(uppercase X)` |
| Replace | `sed s/old/new/` | `(replace X "old" "new")` |
| Map list | awk loop | `every item in List transformed by V` |
| Filter list | grep loop | `every item in List where cond` |
| Sum list | awk '{s+=$1}END{print s}' | `the sum of List` |
| Read file | `cat f.txt` | `Read the file "f.txt" into C.` |
| Write file | `echo hi > f.txt` | `Write "hi" to the file "f.txt".` |
| Delete file | `rm f.txt` | `Delete the file "f.txt".` |
| List files | `ls` | `the list of files in "."` |
| Run command | `` `cmd` `` | `the output of the shell command "cmd"` |
| Pipe | `a \| b` | `Run the shell command "a" and pipe to "b".` |
| Env var | `$HOME` | `the environment variable "HOME"` |
| JSON parse | `jq .key` | `the parsed JSON of ... \| value for "key"` |
| Function | `f() { ... }` | `To f P: ...` |
| Try/catch | `cmd \|\| echo err` | `Try: ... Catch the error into E:` |
| Sleep | `sleep 5` | `After 5 seconds:` |
| Interval | `watch -n 5` | `Every 5 seconds:` |
| Module | `source` | `Include "file.prose".` |
| DSL embed | heredoc | `Using H parse { ... }` |

---

## Tips

- **Every statement ends with `.`** — #1 gotcha for shell users.
- **No `$` for variables** — `X` not `$X` (except inside `${...}` in strings).
- **Colon starts a block** — `If X:` not `if X; then`.
- **Indentation matters** — 4 spaces (or tab) for block bodies.
- **`.help`** in REPL shows all commands. **`Tab`** completes keywords.
- **Comments** start with `#`, same as shell.
- **Implicit declaration** — just assign, no `declare`/`export`/`local` needed.
- **Verbs return values** — `(verb args)` in side-notes captures the result.
