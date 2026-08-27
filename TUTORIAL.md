# Prose Tutorial

Prose programs are English sentences. Most statements end with a period. A newline is enough too (handy for markdown lists). Comments start with `#`. Blocks after a colon are indented.

Start the shell with `node src/index.js`. Run a file with `node src/index.js examples/hello.prose`. Type `.exit` to quit.

Keywords and verbs begin with a capital letter (`Print`, `If`, `To Double`, `Uppercase`). Articles and prepositions do not (`a`, `the`, `of`, `to`). Variables stay small: `score`, `myScore`, `my_score`, `my-score`.

`x-y` is one name. `x - y` subtracts. Always space around `-` `+` `*` `/` when they are operators.

Use parentheses for order: `Print (2 + 3) * 4.` — there is no hidden precedence.

`True` and `False` are `1` and `0`. `Not` / `!` negate. `.` is a field (`Ada.age`), never a method.

---

## 1. Quotes

| Syntax | Meaning |
|--------|---------|
| `"Hello"` | String (Text) |
| `` `echo hello` `` | OS command |

```
Print "Hello".
`echo hello`.
Listing is `dir`.
```

Interpolation only works in strings: `"Hello, ${Name}"`.

---

## 2. Variables and types

Assigning creates the variable. Types: Number, Text, List, Dictionary, and named entities (User, Account, …).

```
X is 42.
Name is "Alice".
A Number named Age exists.
Age is 30.
A Text named Warning exists as follows until EndMsg:
    All actions monitored.
EndMsg
```

`named` is optional: `A Number Age exists.`

Print:

```
Print Name.
Print "Hello, ${Name}! You are ${Age}".
Print "Hello" + " world".
```

Change numbers:

```
Increase Age by 1.
Lower Age by 5.
Set Age to 21.
```

---

## 3. Arithmetic and comparisons

```
X is 5 plus 3.
X is 5 + 3.
X is 10 - 4.
X is 3 * 7.
X is 20 / 4.
Print "Hi" + " there".
If Score >= 80:
    Print "A".
```

Comparisons: `is greater than`, `is less than`, `is equal to`, `is not equal to`, `is greater than or equal to`, `is less than or equal to`. Combine with `and` / `or`.

```
If Score is greater than or equal to 80:
    Print "Grade: A".
Otherwise If Score is greater than or equal to 70:
    Print "Grade: B".
Otherwise:
    Print "Grade: F".

If Age is greater than 18 and Score is greater than 60:
    Print "Passed".
```

---

## 4. Loops

```
While Counter is less than 5:
    Increase Counter by 1.

For Every Number from 1 to 10:
    Print _index.

For Every User in Staff:
    Print User's name.
```

---

## 5. Entities

```
A User named Alice exists.
Alice's age is 25.
Alice's role is "Administrator".
Print Alice's role.
```

Declarative query:

```
Find every User in Staff whose role is "Administrator".
```

---

## 6. Lists

```
A List named Scores exists.
Scores contains 10, 20, and 30.

To Double a Number:
    Result is the Number times 2.

Doubled is Scores transformed-by Double.
Big is Scores filtered-by _ > 15.
Print the sum of Scores.
```

Keep splits a list into `those` (kept) and `others` (dropped):

```
Keep Scores filtered-by _ > 15.
Print those.
Print others.
```

Built-in verbs (side-notes in parentheses): `push`, `pop`, `shift`, `unshift`, `sort`, `first`, `last`, `unique`, `slice`, `splice`, `join`, `length`.

```
Print (Push Scores 40).
Print (Sort Scores).
Print (Join Scores ",").
```

---

## 7. Dictionaries

```
A Dictionary named Capitals exists.
Inside Capitals, "France" maps to "Paris".
Print the value for "Japan" inside Capitals.
```

Or a literal:

```
Set u1 to Dictionary of type is "User" and name is "Alice" and balance is 10.
Print name of u1.
```

Verbs: `keys`, `values`, `haskey`, `deletekey`, `dictsize`, `merge`.

---

## 8. Strings

Double quotes only.

```
Shout is (Uppercase "hello").
Quiet is (Lowercase "HELLO").
Part is (Substr "abcdef" 1 3).
Fixed is (replace "a-b-c" "-" "/").
```

Also: `length`, `split`, `join`, `index`, `rindex`, `chop`, `chomp`, `trim`, `reverse`, `repeat`, `sprintf`, `chr`, `ord`, `startswith`, `endswith`, `contains`.

---

## 9. Files and folders

Paths are strings. Commands stay in backticks.

```
Write "Hello" to the file "notes.txt".
Read the file "notes.txt" into Content.
Append " more" to the file "notes.txt".
Copy the file "notes.txt" to "copy.txt".
Rename the file "copy.txt" to "renamed.txt".
Touch the file "stamp.txt".
Make the directory "tmp".
Change directory to "tmp".
Delete the file "notes.txt".
Files is the list of files in ".".
```

Tests: `fileexists`, `isfile`, `isdir`, `isreadable`, `iswritable`, `isexecutable`, `filesize`, `isemptyfile`. Also `cat`, `glob`, `which`, `pwd`, `chdir`, `chmod`, `basename`, `dirname`.

`there` is the last file or folder mentioned. `here` is the current folder.

```
Write "z" to the file "notes.txt".
Print (Cat there).
```

`With` sets `there` for a block:

```
With "notes.txt" then:
    Read the file there into Content.
```

---

## 10. Shell commands

Backticks. Never double quotes.

```
`echo hello`.
Execute the shell command `dir`.
Run the command `echo hello`.
Run the shell command `echo hello` and pipe to `findstr hello`.

Listing is `dir`.
Listing is the output of the shell command `dir`.
```

Environment and HTTP:

```
Home is the environment variable "HOME".
Page is the fetched content of the url "https://example.com".
```

---

## 11. Verbs

```
To Double a Number:
    Result is the Number times 2.

To Greet a Person:
    Print "Hello, " followed by the Person's name.

A Person named Ada exists.
Ada's name is "Ada".
Greet Ada.
Print (double 21).
```

**Typed verbs.** The word after `a`/`an` is a type. Inside the body, `the Client` is that entity.

```
To Settle a Client:
    Set the Client's balanceDue to 0.
    Print "Settled " followed by the Client's name.

Settle the Current Client.
```

Roles: `To Charge a Client using an Amount:`. Inside: `the Amount`, `the using number`. At the call, `using` / `with` / `into` / `from` / `by` / `as` / `to` / `and` may be written or left out.

`Charge the Current Client using 50.`

Parentheses are side-notes: they run a verb or expression and use the result.

---

## 12. Anaphora (pointing words)

| Word | Means |
|------|--------|
| `it` | Last scalar, or the current keep/loop item |
| `it's FIELD` | That field of `it` |
| `there` | Last file or folder, or `With` target |
| `here` | Current folder |
| `those` | Last list, or what `keep` kept |
| `others` | What `keep` dropped |
| `the number` | Last number |
| `the User` | Last entity of that type |

```
X is 42.
Print it.
Print the number.
Print here.
```

---

## 13. Entity graph

A dictionary assigned to a name is an entity. `the Active Admin` finds the most recent dictionary whose fields include those words (`status` is Active, `role` is Admin, or `type` is Admin). Two equally recent matches are a coreference error.

```
Set u1 to Dictionary of type is "User" and status is "Active" and role is "Admin" and name is "Alice" and balance is 10.
Print name of the Active Admin.
Call the Active Admin the Current Client.
Set the Current Client's balance to 250.
Print balance of u1.
```

`Call it the Current Client.` names the same entity.

---

## 14. Control: labels, lists, include, dynamic code

```
Label "Retry".
Jump to the label "Retry".
```

Numbered markdown items are labels. Periods optional on list lines:

```
1. Print "one"
2. Print "two"
Jump to the label 1.
```

Bullets `-`, `*`, `+` work the same way (no auto label).

```
Include "helpers.prose".

Snippet is "Print 1.".
Execute the text inside Snippet.
```

JSON:

```
Data is the parsed JSON of "{\"name\": \"Ada\"}".
Print the value for "name" inside Data.
```

Errors:

```
Try:
    Execute the shell command `no-such-command`.
Catch the error into Err:
    Print "Caught: ${Err}".
```

---

## 15. Whenever, timing, DSL

```
Whenever Primary's balance changes:
    Print "Balance changed".

Whenever X changes:
    Print "X is now ${X}".

After 5 seconds:
    Print "Done".

Every 2 seconds:
    Print "Tick".
```

Raw text for another verb:

```
To ProcessRules a Text:
    Print the Text.

Using ProcessRules parse {
    build: main.o
        gcc -o build main.o
}
```

---

## 16. Interactive shell

| Command | What it does |
|---------|----------------|
| `.help` | Help |
| `.exit` / `.quit` | Leave |
| `.run <file>` | Run a file in a fresh environment |
| `.load <file>` | Run a file in the current environment |
| `.vars` | Variables |
| `.verbs` | Verbs |
| `.reset` | Clear the session |
| `.clear` | Clear the screen |
| `.pwd` | Working directory |

Tab completes. Up/down is history. A blank line ends a multi-line block.

---

## Quick reference

| You want | Write |
|----------|--------|
| String | `"Hello"` |
| Command | `` `echo hello` `` |
| Variable | `Name is "Ada".` |
| Print | `Print Name.` |
| Interpolate | `"${Name}"` |
| Math | `X is 5 plus 3.` |
| If / else | `If X is greater than 5:` … `Otherwise:` |
| While | `While X is less than 5:` |
| Count | `For Every Number from 1 to 10:` |
| Verb | `To Greet a Person:` … `the Person` in the body … `Greet Ada.` |
| List | `Scores contains 1, 2, and 3.` |
| Keep | `Keep Scores filtered-by _ > 1.` |
| File | `Write "hi" to the file "f.txt".` |
| Capture command | `` Out is `dir`. `` |
| Last value | `Print it.` |
| Last file | `Print there.` |
| Entity by fields | `Print name of the Active Admin.` |
| Include | `Include "lib.prose".` |
