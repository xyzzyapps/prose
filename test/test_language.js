/**
 * Language tests: capitals, operators, indexing, control, anaphora, types.
 *
 * Order (top to bottom):
 *   1. Capitals
 *   2. Assignment
 *   3. True, False, Not
 *   4. Numbers and operators
 *   5. Indexing
 *   6. Lists: transformed-by, filtered-by, Keep
 *   7. Break and Continue
 *   8. Fields
 *   9. Typed verbs
 *  10. Anaphora and interpolation
 *  11. Heredoc and quotes
 *  12. Fail-fast vs recover
 *  13. Lexer details
 *
 * Run: node --test test/test_language.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Lexer } from '../src/lexer/Lexer.js';
import { Parser } from '../src/parser/Parser.js';
import { Interpreter } from '../src/interpreter/Interpreter.js';
import { SyntaxError, TypeError as ProseTypeError, RuntimeError } from '../src/core/Errors.js';

function runCode(source) {
  const lexer = new Lexer(source, '<test>');
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  const program = parser.parse();
  const interpreter = new Interpreter();
  const result = interpreter.interpret(program);
  return { output: result.output, interpreter, program };
}

function parseOnly(source, recover = false) {
  const tokens = new Lexer(source, '<test>').tokenize();
  return new Parser(tokens, { recover }).parse();
}

// ---------------------------------------------------------------------------
// 1. Capitals
// ---------------------------------------------------------------------------

describe('1. Capitals', () => {
  it('rejects lowercase print in file mode', () => {
    assert.throws(() => parseOnly('print "hi".\n'), SyntaxError);
  });

  it('accepts Print', () => {
    assert.equal(runCode('Print "hi".\n').output, 'hi');
  });

  it('rejects lowercase verb call', () => {
    assert.throws(() => runCode('Print (uppercase "hi").\n'));
  });

  it('accepts capital builtin', () => {
    assert.equal(runCode('Print (Uppercase "hi").\n').output, 'HI');
  });
});

// ---------------------------------------------------------------------------
// 2. Assignment
// ---------------------------------------------------------------------------

describe('2. Assignment', () => {
  it('is and = both assign', () => {
    const { interpreter } = runCode('a is 1.\nb = 2.\n');
    assert.equal(interpreter.env.lookup('a').value, 1);
    assert.equal(interpreter.env.lookup('b').value, 2);
  });
});

// ---------------------------------------------------------------------------
// 3. True, False, Not
// ---------------------------------------------------------------------------

describe('3. True, False, Not', () => {
  it('True is 1 and False is 0', () => {
    assert.equal(runCode('Print True.\nPrint False.\n').output, '1\n0');
  });

  it('Not False is true', () => {
    assert.equal(runCode('If Not False:\n    Print "y".\n').output, 'y');
  });

  it('! is Not', () => {
    assert.equal(runCode('If !False:\n    Print "y".\n').output, 'y');
  });

  it('lowercase true is not a boolean', () => {
    assert.throws(() => runCode('Print true.\n'));
  });
});

// ---------------------------------------------------------------------------
// 4. Numbers and operators
// ---------------------------------------------------------------------------

describe('4. Numbers and operators', () => {
  it('left to right, no precedence', () => {
    assert.equal(runCode('Print 2 + 3 * 4.\n').output, '20');
  });

  it('parens for intended order', () => {
    assert.equal(runCode('Print 2 + (3 * 4).\n').output, '14');
  });

  it('unary minus', () => {
    assert.equal(runCode('Print -3.\n').output, '-3');
  });

  it('scientific number', () => {
    assert.equal(runCode('Print 1.5e2.\nPrint 1e-3.\n').output, '150\n0.001');
  });

  it('kebab name vs minus', () => {
    const { interpreter } = runCode('x-y = 7.\n');
    assert.equal(interpreter.env.lookup('x-y').value, 7);
    assert.equal(runCode('Print 5 - 3.\n').output, '2');
  });

  it('comparisons', () => {
    assert.equal(runCode('If 3 > 1 and 2 == 2:\n    Print "ok".\n').output, 'ok');
  });

  it('division by zero', () => {
    assert.throws(() => runCode('Print 1 / 0.\n'), RuntimeError);
  });
});

// ---------------------------------------------------------------------------
// 5. Indexing
// ---------------------------------------------------------------------------

describe('5. Indexing', () => {
  const setup = 'A List named xs exists.\nxs contains "a", "b", and "c".\n';

  it('at', () => {
    assert.equal(runCode(setup + 'Print xs at 0.\n').output, 'a');
  });

  it('brackets', () => {
    assert.equal(runCode(setup + 'Print xs[1].\n').output, 'b');
  });

  it('item of', () => {
    assert.equal(runCode(setup + 'Print item 2 of xs.\n').output, 'c');
  });

  it('assign through brackets', () => {
    assert.equal(runCode(setup + 'xs[0] = "z".\nPrint xs[0].\n').output, 'z');
  });

  it('assign through at', () => {
    assert.equal(runCode(setup + 'xs at 1 = "q".\nPrint xs at 1.\n').output, 'q');
  });
});

// ---------------------------------------------------------------------------
// 6. Lists: transformed-by, filtered-by, Keep
// ---------------------------------------------------------------------------

describe('6. Lists: transformed-by, filtered-by, Keep', () => {
  it('transformed-by Double', () => {
    assert.equal(
      runCode(
        'To Double a Number:\n    Result is the Number * 2.\nA List named scores exists.\nscores contains 1, 2, and 3.\nPrint scores transformed-by Double.\n'
      ).output,
      '[2, 4, 6]'
    );
  });

  it('filtered-by _', () => {
    assert.equal(
      runCode(
        'A List named scores exists.\nscores contains 1, 2, and 9.\nPrint scores filtered-by _ > 5.\n'
      ).output,
      '[9]'
    );
  });

  it('Keep those others', () => {
    assert.equal(
      runCode(
        'A List named scores exists.\nscores contains 1, 8, and 2.\nKeep scores filtered-by _ > 5.\nPrint those.\nPrint others.\n'
      ).output,
      '[8]\n[1, 2]'
    );
  });
});

// ---------------------------------------------------------------------------
// 7. Break and Continue
// ---------------------------------------------------------------------------

describe('7. Break and Continue', () => {
  it('Break leaves While', () => {
    assert.equal(
      runCode(
        'n = 0.\nWhile True:\n    Increase n by 1.\n    If n == 3:\n        Break.\nPrint n.\n'
      ).output,
      '3'
    );
  });

  it('Continue skips the rest of a For-Every body', () => {
    assert.equal(
      runCode(
        'A List named xs exists.\nxs contains 1, 2, and 3.\nFor-Every n in xs:\n    If n == 2:\n        Continue.\n    Print n.\n'
      ).output,
      '1\n3'
    );
  });
});

// ---------------------------------------------------------------------------
// 8. Fields
// ---------------------------------------------------------------------------

describe('8. Fields', () => {
  it("possessive and dot are the same field", () => {
    assert.equal(
      runCode(
        'A User named Ada exists.\nAda\'s age is 36.\nPrint Ada.age.\nPrint Ada\'s age.\n'
      ).output,
      '36\n36'
    );
  });
});

// ---------------------------------------------------------------------------
// 9. Typed verbs
// ---------------------------------------------------------------------------

describe('9. Typed verbs', () => {
  it('Greet a Person rejects a string', () => {
    assert.throws(
      () => runCode('To Greet a Person:\n    Print the Person.\nGreet "Ada".\n'),
      ProseTypeError
    );
  });

  it('Greet a Person accepts an entity', () => {
    assert.equal(
      runCode('To Greet a Person:\n    Print the Person.\nA Person named Ada exists.\nGreet Ada.\n').output,
      'Ada'
    );
  });

  it('alias last word matches type', () => {
    assert.equal(
      runCode(
        'Set u1 to Dictionary of type is "User" and name is "Al".\nCall u1 the Current Client.\nTo Settle a Client:\n    Print the Client\'s name.\nSettle the Current Client.\n'
      ).output,
      'Al'
    );
  });
});

// ---------------------------------------------------------------------------
// 10. Anaphora and interpolation
// ---------------------------------------------------------------------------

describe('10. Anaphora and interpolation', () => {
  it('it after a number', () => {
    assert.equal(runCode('n = 42.\nPrint it.\nPrint the number.\n').output, '42\n42');
  });

  it('interpolates it', () => {
    assert.equal(runCode('n = 7.\nPrint "x=${it}".\n').output, 'x=7');
  });
});

// ---------------------------------------------------------------------------
// 11. Heredoc and quotes
// ---------------------------------------------------------------------------

describe('11. Heredoc and quotes', () => {
  it('chevron heredoc', () => {
    assert.match(runCode('msg <<End\n    hello\nEnd\nPrint msg.\n').output, /hello/);
  });

  it('double quotes are a string, not a command', () => {
    assert.equal(runCode('Print "echo hi".\n').output, 'echo hi');
  });
});

// ---------------------------------------------------------------------------
// 12. Fail-fast vs recover
// ---------------------------------------------------------------------------

describe('12. Fail-fast vs recover', () => {
  it('file parse throws', () => {
    assert.throws(() => parseOnly('print "x".\nPrint "y".\n', false), SyntaxError);
  });

  it('REPL recover continues', () => {
    const program = parseOnly('print "x".\nPrint "y".\n', true);
    const interpreter = new Interpreter();
    const result = interpreter.interpret(program);
    assert.equal(result.output, 'y');
  });
});

// ---------------------------------------------------------------------------
// 13. Lexer details
// ---------------------------------------------------------------------------

describe('13. Lexer details', () => {
  it('scientific tokens', () => {
    const toks = new Lexer('1e-3 2.5E+2', '<t>').tokenize();
    const nums = toks.filter(t => t.type === 'NUMBER').map(t => t.value);
    assert.deepEqual(nums, ['1e-3', '2.5E+2']);
  });
});
