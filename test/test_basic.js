/**
 * Core smoke tests for Prose.
 *
 * Order (top to bottom):
 *   1. Values
 *   2. Lexer
 *   3. Names, assignment, print
 *   4. Numbers and operators
 *   5. Strings, quotes, heredoc, concat
 *   6. Lists and dictionaries
 *   7. Control flow
 *   8. Verbs
 *   9. Fields and entities
 *  10. Anaphora
 *  11. Files and shell
 *
 * Run: node --test test/test_basic.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Lexer } from '../src/lexer/Lexer.js';
import { Parser } from '../src/parser/Parser.js';
import { Interpreter } from '../src/interpreter/Interpreter.js';
import { NumberValue, TextValue, EntityValue, ListValue, DictionaryValue } from '../src/core/Value.js';

function runCode(source) {
  const lexer = new Lexer(source, '<test>');
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  const program = parser.parse();
  const interpreter = new Interpreter();
  const result = interpreter.interpret(program);
  return { output: result.output, interpreter };
}

// ---------------------------------------------------------------------------
// 1. Values
// ---------------------------------------------------------------------------

describe('1. Values', () => {
  it('NumberValue', () => {
    const v = new NumberValue(42);
    assert.equal(v.typeName(), 'Number');
    assert.equal(v.toString(), '42');
    assert.equal(v.isTruthy(), true);
  });

  it('TextValue', () => {
    const v = new TextValue('hello');
    assert.equal(v.typeName(), 'Text');
    assert.equal(v.toString(), 'hello');
    assert.equal(v.isTruthy(), true);
    assert.equal(new TextValue('').isTruthy(), false);
  });

  it('EntityValue', () => {
    const e = new EntityValue('User', 'Alice');
    e.set('age', new NumberValue(25));
    assert.equal(e.get('age').toString(), '25');
    assert.equal(e.blueprint, 'User');
  });

  it('ListValue', () => {
    const l = new ListValue([new NumberValue(1), new NumberValue(2)]);
    assert.equal(l.length, 2);
    assert.equal(l.isTruthy(), true);
  });

  it('DictionaryValue', () => {
    const d = new DictionaryValue();
    d.set('key', new TextValue('val'));
    assert.equal(d.get('key').toString(), 'val');
  });
});

// ---------------------------------------------------------------------------
// 2. Lexer
// ---------------------------------------------------------------------------

describe('2. Lexer', () => {
  it('tokenizes a declaration', () => {
    const tokens = new Lexer('A Number named x exists.', '<test>').tokenize();
    assert.ok(tokens.length > 5);
  });

  it('emits INDENT and DEDENT', () => {
    const types = new Lexer('If x\n    Print "y".\n', '<test>').tokenize().map(t => t.type);
    assert.ok(types.includes('INDENT'));
    assert.ok(types.includes('DEDENT'));
  });
});

// ---------------------------------------------------------------------------
// 3. Names, assignment, print
// ---------------------------------------------------------------------------

describe('3. Names, assignment, print', () => {
  it('declares and assigns a Number', () => {
    const { interpreter } = runCode('A Number named x exists.\nx is 42.\n');
    const val = interpreter.env.lookup('x');
    assert.ok(val instanceof NumberValue);
    assert.equal(val.value, 42);
  });

  it('prints text', () => {
    assert.equal(runCode('Print "Hello, World!".\n').output, 'Hello, World!');
  });

  it('Increase mutates a Number', () => {
    const { interpreter } = runCode('A Number named x exists.\nx is 10.\nIncrease x by 5.\n');
    assert.equal(interpreter.env.lookup('x').value, 15);
  });
});

// ---------------------------------------------------------------------------
// 4. Numbers and operators
// ---------------------------------------------------------------------------

describe('4. Numbers and operators', () => {
  it('> in If', () => {
    assert.equal(runCode('x is 10.\nIf x > 5\n    Print "yes".\n').output, 'yes');
  });

  it('+ adds numbers', () => {
    assert.equal(runCode('Print 2 + 3.\n').output, '5');
  });
});

// ---------------------------------------------------------------------------
// 5. Strings, quotes, heredoc, concat
// ---------------------------------------------------------------------------

describe('5. Strings, quotes, heredoc, concat', () => {
  it('followed by concatenates', () => {
    assert.equal(runCode('Print "Hello" followed by " World".\n').output, 'Hello World');
  });

  it('+ concatenates text', () => {
    assert.equal(runCode('Print "Hello" + " World".\n').output, 'Hello World');
  });

  it('chevron heredoc', () => {
    assert.match(runCode('msg <<End\n    hi\nEnd\nPrint msg.\n').output, /hi/);
  });

  it('Uppercase, Length, Substr', () => {
    assert.equal(
      runCode('Print (Uppercase "hi").\nPrint (Length "hello").\nPrint (Substr "abcdef" 1 3).\n').output,
      'HI\n5\nbcd'
    );
  });
});

// ---------------------------------------------------------------------------
// 6. Lists and dictionaries
// ---------------------------------------------------------------------------

describe('6. Lists and dictionaries', () => {
  it('Join Sort First', () => {
    assert.equal(
      runCode('A List named xs exists.\nxs contains "b", "a", and "c".\nPrint (Join (Sort xs) ",").\nPrint (First xs).\n').output,
      'a,b,c\nb'
    );
  });

  it('transformed-by with a kebab list name', () => {
    assert.equal(
      runCode(
        'To Double a Number\n    Result is the Number * 2.\nA List named my-scores exists.\nmy-scores contains 1, 2, and 3.\nout is my-scores transformed-by Double.\nPrint out.\n'
      ).output,
      '[2, 4, 6]'
    );
  });

  it('Inside maps to / the value for', () => {
    assert.equal(
      runCode('A Dictionary named d exists.\nInside d, "key" maps to "value".\nPrint the value for "key" inside d.\n').output,
      'value'
    );
  });

  it('Haskey and Dictsize', () => {
    assert.equal(
      runCode('A Dictionary named d exists.\nInside d, "k" maps to "v".\nPrint (Haskey d "k").\nPrint (Dictsize d).\n').output,
      '1\n1'
    );
  });
});

// ---------------------------------------------------------------------------
// 7. Control flow
// ---------------------------------------------------------------------------

describe('7. Control flow', () => {
  it('If / Otherwise', () => {
    assert.equal(
      runCode('A Number named x exists.\nx is 10.\nIf x is greater than 5\n    Print "yes".\nOtherwise\n    Print "no".\n').output,
      'yes'
    );
  });

  it('While', () => {
    assert.equal(
      runCode('A Number named c exists.\nc is 0.\nWhile c is less than 3\n    Print c.\n    Increase c by 1.\n').output,
      '0\n1\n2'
    );
  });

  it('Break in While', () => {
    assert.equal(
      runCode('n is 0.\nWhile True\n    Increase n by 1.\n    If n == 2\n        Break.\nPrint n.\n').output,
      '2'
    );
  });

  it('If / Otherwise on one line', () => {
    assert.equal(
      runCode('x is 10.\nIf x > 5 Print "yes" Otherwise Print "no".\n').output,
      'yes'
    );
    assert.equal(
      runCode('x is 1.\nIf x > 5 Print "yes" Otherwise Print "no".\n').output,
      'no'
    );
  });

  it('While on one line', () => {
    assert.equal(
      runCode('n is 0.\nWhile n < 3 Increase n by 1.\nPrint n.\n').output,
      '3'
    );
  });

  it('If / While without a colon, indented', () => {
    assert.equal(
      runCode('x is 10.\nIf x > 5\n    Print "yes"\n').output,
      'yes'
    );
    assert.equal(
      runCode('n is 0.\nWhile n < 2\n    Increase n by 1\nPrint n\n').output,
      '2'
    );
  });

  it('numbered list is a goto label', () => {
    assert.equal(
      runCode(
        'A Number named c exists.\nc is 0.\n1. Increase c by 1.\nIf c is less than 2\n    Jump to the label 1.\nPrint c.\n'
      ).output,
      '2'
    );
  });
});

// ---------------------------------------------------------------------------
// 8. Verbs
// ---------------------------------------------------------------------------

describe('8. Verbs', () => {
  it('To SayHello with no arguments', () => {
    assert.equal(runCode('To SayHello\n    Print "Hello".\nSayHello.\n').output, 'Hello');
  });

  it('To and For-Every on one line', () => {
    assert.equal(
      runCode('To Double a Number Result is the Number * 2.\nPrint (Double 21).\n').output,
      '42'
    );
    assert.equal(
      runCode('A List named xs exists.\nxs contains 1, and 2.\nFor-Every n in xs Print n.\n').output,
      '1\n2'
    );
  });

  it('To Settle a Client uses the Client', () => {
    assert.equal(
      runCode(
        'Set u1 to Dictionary of type is "User" and status is "Active" and role is "Admin" and name is "Alice" and balanceDue is 10.\nCall u1 the Current Client.\nTo Settle a Client\n    Set the Client\'s balanceDue to 0.\n    Print "Settled " followed by the Client\'s name.\nSettle the Current Client.\nPrint balanceDue of u1.\n'
      ).output,
      'Settled Alice\n0'
    );
  });
});

// ---------------------------------------------------------------------------
// 9. Fields and entities
// ---------------------------------------------------------------------------

describe('9. Fields and entities', () => {
  it("possessive field Ada's age", () => {
    const { interpreter } = runCode('A User named alice exists.\nalice\'s age is 25.\n');
    const alice = interpreter.env.lookup('alice');
    assert.ok(alice instanceof EntityValue);
    assert.equal(alice.get('age').value, 25);
  });

  it('dot field Ada.age', () => {
    assert.equal(
      runCode('A User named ada exists.\nada\'s age is 36.\nPrint ada.age.\n').output,
      '36'
    );
  });

  it('the Active Admin from the entity graph', () => {
    assert.equal(
      runCode(
        'Set u1 to Dictionary of type is "User" and status is "Active" and role is "Admin" and name is "Alice" and balance is 10\nPrint name of the Active Admin\nCall the Active Admin the Current Client\nSet the Current Client\'s balance to 250\nPrint balance of u1\n'
      ).output,
      'Alice\n250'
    );
  });
});

// ---------------------------------------------------------------------------
// 10. Anaphora
// ---------------------------------------------------------------------------

describe('10. Anaphora', () => {
  it('it and the number', () => {
    assert.equal(runCode('x is 42\nPrint it\nPrint the number\n').output, '42\n42');
  });

  it('Keep those and others', () => {
    assert.equal(
      runCode(
        'A List named ns exists.\nns contains 1, 2, and 3.\nKeep ns filtered-by _ > 1.\nPrint those.\nPrint others.\n'
      ).output,
      '[2, 3]\n[1]'
    );
  });

  it('here is the current folder', () => {
    assert.ok(runCode('Print here.\n').output.length > 0);
  });

  it("it's field and there after Write", () => {
    assert.equal(
      runCode(
        'Set u1 to Dictionary of type is "User" and name is "Bob"\nPrint it\'s name\nWrite "z" to the file "_a_there.txt"\nPrint (Cat there)\nDelete the file there\n'
      ).output,
      'Bob\nz'
    );
  });
});

// ---------------------------------------------------------------------------
// 11. Files and shell
// ---------------------------------------------------------------------------

describe('11. Files and shell', () => {
  it('Write, Fileexists, Cat, Delete', () => {
    assert.equal(
      runCode(
        'Write "xyz" to the file "_t_esh.txt".\nPrint (Fileexists "_t_esh.txt").\nPrint (Cat "_t_esh.txt").\nDelete the file "_t_esh.txt".\n'
      ).output,
      '1\nxyz'
    );
  });

  it('backtick command in Print', () => {
    assert.match(runCode('Print `echo esh-shell`.\n').output, /esh-shell/);
  });

  it('bare backtick command', () => {
    assert.match(runCode('`echo bare-ok`.\n').output, /bare-ok/);
  });
});
