/**
 * test/test_basic.js - Basic smoke tests for the Prose interpreter.
 *
 * Run with: node --test test/test_basic.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Lexer } from '../src/lexer/Lexer.js';
import { Parser } from '../src/parser/Parser.js';
import { Interpreter } from '../src/interpreter/Interpreter.js';
import { Environment } from '../src/core/Environment.js';
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

describe('Value Types', () => {
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

describe('Lexer', () => {
  it('tokenizes simple declaration', () => {
    const lexer = new Lexer('A Number named X exists.', '<test>');
    const tokens = lexer.tokenize();
    assert.ok(tokens.length > 5);
  });

  it('produces INDENT/DEDENT', () => {
    const lexer = new Lexer('If x:\n    Print "y".\n', '<test>');
    const tokens = lexer.tokenize();
    const types = tokens.map(t => t.type);
    assert.ok(types.includes('INDENT'));
    assert.ok(types.includes('DEDENT'));
  });
});

describe('Parser + Interpreter', () => {
  it('variable declaration and assignment', () => {
    const { output, interpreter } = runCode(
      'A Number named X exists.\nX is 42.\n'
    );
    const val = interpreter.env.lookup('X');
    assert.ok(val instanceof NumberValue);
    assert.equal(val.value, 42);
  });

  it('print statement', () => {
    const { output } = runCode(
      'Print "Hello, World!".\n'
    );
    assert.equal(output, 'Hello, World!');
  });

  it('entity and property', () => {
    const { interpreter } = runCode(
      'A User named Alice exists.\nAlice\'s age is 25.\n'
    );
    const alice = interpreter.env.lookup('Alice');
    assert.ok(alice instanceof EntityValue);
    assert.equal(alice.get('age').value, 25);
  });

  it('followed by concatenation', () => {
    const { output } = runCode(
      'Print "Hello" followed by " World".\n'
    );
    assert.equal(output, 'Hello World');
  });

  it('dictionary operations', () => {
    const { output } = runCode(
      'A Dictionary named D exists.\nInside D, "key" maps to "value".\nPrint the value for "key" inside D.\n'
    );
    assert.equal(output, 'value');
  });

  it('if statement', () => {
    const { output } = runCode(
      'A Number named X exists.\nX is 10.\nIf X is greater than 5:\n    Print "yes".\nOtherwise:\n    Print "no".\n'
    );
    assert.equal(output, 'yes');
  });

  it('while loop', () => {
    const { output } = runCode(
      'A Number named C exists.\nC is 0.\nWhile C is less than 3:\n    Print C.\n    Increase C by 1.\n'
    );
    assert.equal(output, '0\n1\n2');
  });

  it('verb definition and call', () => {
    const { output } = runCode(
      'To SayHello:\n    Print "Hello".\nSayHello.\n'
    );
    assert.equal(output, 'Hello');
  });

  it('mutation', () => {
    const { interpreter } = runCode(
      'A Number named X exists.\nX is 10.\nIncrease X by 5.\n'
    );
    assert.equal(interpreter.env.lookup('X').value, 15);
  });

  it('string builtins', () => {
    const { output } = runCode(
      'Print (uppercase "hi").\nPrint (length "hello").\nPrint (substr "abcdef" 1 3).\n'
    );
    assert.equal(output, 'HI\n5\nbcd');
  });

  it('list builtins', () => {
    const { output } = runCode(
      'A List named L exists.\nL contains "b", "a", and "c".\nPrint (join (sort L) ",").\nPrint (first L).\n'
    );
    assert.equal(output, 'a,b,c\nb');
  });

  it('dictionary builtins', () => {
    const { output } = runCode(
      'A Dictionary named D exists.\nInside D, "k" maps to "v".\nPrint (haskey D "k").\nPrint (dictsize D).\n'
    );
    assert.equal(output, '1\n1');
  });

  it('file builtins', () => {
    const { output } = runCode(
      'Write "xyz" to the file "_t_esh.txt".\nPrint (fileexists "_t_esh.txt").\nPrint (cat "_t_esh.txt").\nDelete the file "_t_esh.txt".\n'
    );
    assert.equal(output, '1\nxyz');
  });

  it('shell command', () => {
    const { output } = runCode(
      'Print (backtick "echo esh-shell").\n'
    );
    assert.match(output, /esh-shell/);
  });

  it('anaphora it and the number', () => {
    const { output } = runCode(
      'X is 42\nPrint it\nPrint the number\n'
    );
    assert.equal(output, '42\n42');
  });

  it('keep those and others', () => {
    const { output } = runCode(
      'A List named N exists.\nN contains 1, 2, and 3.\nKeep N where _item is greater than 1.\nPrint those.\nPrint others.\n'
    );
    assert.equal(output, '[2, 3]\n[1]');
  });

  it('here is the current folder', () => {
    const { output } = runCode('Print here.\n');
    assert.ok(output.length > 0);
  });

  it('markdown numbered list is a goto label', () => {
    const { output } = runCode(
      'A Number named C exists.\nC is 0.\n1. Increase C by 1.\nIf C is less than 2:\n    Jump to the label 1.\nPrint C.\n'
    );
    assert.equal(output, '2');
  });

  it('entity graph the Active Admin', () => {
    const { output } = runCode(
      'set u1 to dictionary of type is "User" and status is "Active" and role is "Admin" and name is "Alice" and balance is 10\nPrint name of the Active Admin\ncall the Active Admin the Current Client\nset the Current Client\'s balance to 250\nPrint balance of u1\n'
    );
    assert.equal(output, 'Alice\n250');
  });

  it('typed verb the Client', () => {
    const { output } = runCode(
      'Set u1 to dictionary of type is "User" and status is "Active" and role is "Admin" and name is "Alice" and balanceDue is 10.\nCall u1 the Current Client.\nTo Settle a Client:\n    Set the Client\'s balanceDue to 0.\n    Print "Settled " followed by the Client\'s name.\nSettle the Current Client.\nPrint balanceDue of u1.\n'
    );
    assert.equal(output, 'Settled Alice\n0');
  });

  it("it's field and there after write", () => {
    const { output } = runCode(
      'set u1 to dictionary of type is "User" and name is "Bob"\nPrint it\'s name\nWrite "z" to the file "_a_there.txt"\nPrint (cat there)\nDelete the file there\n'
    );
    assert.equal(output, 'Bob\nz');
  });

  it('method call entity.verb', () => {
    const { output } = runCode(
      'Set u1 to dictionary of type is "User" and name is "Cara".\nCall u1 the Current Client.\nTo Settle a Client:\n    Print the Client\'s name.\nSettle the Current Client.\n'
    );
    assert.equal(output, 'Cara');
  });
});

console.log('All tests passed!');
