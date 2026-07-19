/**
 * interpreter/Builtins.js - Built-in operations and default verbs
 * for the Prose language interpreter.
 */

import { NumberValue, TextValue, EntityValue, ListValue,
         DictionaryValue, NULL } from '../core/Value.js';
import { RuntimeError } from '../core/Errors.js';

/**
 * Register built-in verbs and functions in the environment.
 * @param {import('../core/Environment.js').Environment} env
 * @param {import('./Interpreter.js').Interpreter} interpreter
 */
export function registerBuiltins(env, interpreter) {
  // Say/Print is handled as a statement, but also define as verb for inline use
  env.defineVerb('say', {
    name: 'say',
    params: ['text'],
    body: null,
    closure: env,
    // Native implementation
    native: true,
    execute(args, env, interp) {
      const text = args.map(a => interp.stringify(a)).join(' ');
      interp._output(text);
      return new TextValue(text);
    }
  });

  env.defineVerb('greet', {
    name: 'greet',
    params: ['user'],
    body: null,
    closure: env,
    native: true,
    execute(args, env, interp) {
      const userName = args[0]?.toString() ?? 'unknown';
      const result = `Hello, ${userName}`;
      return new TextValue(result);
    }
  });

  // Arithmetic builtins
  env.defineVerb('add', {
    name: 'add',
    params: ['a', 'to', 'b'],
    closure: env,
    native: true,
    execute(args, env, interp) {
      const a = interp.toNumber(args[0]);
      const b = interp.toNumber(args[2]);
      return new NumberValue(a + b);
    }
  });

  env.defineVerb('subtract', {
    name: 'subtract',
    params: ['a', 'from', 'b'],
    closure: env,
    native: true,
    execute(args, env, interp) {
      const a = interp.toNumber(args[0]);
      const b = interp.toNumber(args[2]);
      return new NumberValue(b - a);
    }
  });

  // String manipulation builtins
  env.defineVerb('split', {
    name: 'split',
    params: ['text', 'by', 'delimiter'],
    closure: env,
    native: true,
    execute(args, env, interp) {
      const text = interp.stringify(args[0]);
      const delim = interp.stringify(args[2]);
      const parts = text.split(delim);
      const list = new ListValue();
      for (const p of parts) list.push(new TextValue(p));
      return list;
    }
  });

  env.defineVerb('join', {
    name: 'join',
    params: ['list', 'with', 'delimiter'],
    closure: env,
    native: true,
    execute(args, env, interp) {
      const list = args[0];
      const delim = interp.stringify(args[2]);
      if (!(list instanceof ListValue)) throw new RuntimeError('join requires a List');
      const parts = list.items.map(i => interp.stringify(i));
      return new TextValue(parts.join(delim));
    }
  });

  env.defineVerb('replace', {
    name: 'replace',
    params: ['in', 'text', 'replace', 'old', 'with', 'new'],
    closure: env,
    native: true,
    execute(args, env, interp) {
      const text = interp.stringify(args[1]);
      const oldStr = interp.stringify(args[3]);
      const newStr = interp.stringify(args[5]);
      return new TextValue(text.split(oldStr).join(newStr));
    }
  });

  env.defineVerb('uppercase', {
    name: 'uppercase',
    params: ['text'],
    closure: env,
    native: true,
    execute(args, env, interp) {
      return new TextValue(interp.stringify(args[0]).toUpperCase());
    }
  });

  env.defineVerb('lowercase', {
    name: 'lowercase',
    params: ['text'],
    closure: env,
    native: true,
    execute(args, env, interp) {
      return new TextValue(interp.stringify(args[0]).toLowerCase());
    }
  });
}

/**
 * Convert any Value to a JavaScript number.
 * @param {import('../core/Value.js').Value} val
 * @returns {number}
 */
export function valueToNumber(val) {
  if (val instanceof NumberValue) return val.value;
  if (val instanceof TextValue) {
    const n = Number(val.value);
    if (!isNaN(n)) return n;
  }
  throw new RuntimeError(`Cannot convert ${val.typeName()} to a Number`);
}

/**
 * Convert any Value to a string.
 * @param {import('../core/Value.js').Value} val
 * @returns {string}
 */
export function valueToString(val) {
  if (!val) return 'nothing';
  if (val instanceof TextValue) return val.value;
  if (val instanceof NumberValue) return String(val.value);
  return val.toString();
}
