/**
 * interpreter/Builtins.js - Built-in operations and default verbs
 * for the Prose language interpreter.
 *
 * String, list, and dictionary verbs follow Perl 4 / Tcl conventions.
 * File tests and path ops follow Perl -X operators and tcsh builtins.
 */

import { NumberValue, TextValue, ListValue,
         DictionaryValue, NULL } from '../core/Value.js';
import { RuntimeError } from '../core/Errors.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Register built-in verbs and functions in the environment.
 * @param {import('../core/Environment.js').Environment} env
 * @param {import('./Interpreter.js').Interpreter} interpreter
 */
export function registerBuiltins(env, _interpreter) {
  const verb = (name, params, execute) => {
    env.defineVerb(name, {
      name,
      params,
      body: null,
      closure: env,
      native: true,
      execute,
    });
  };

  // -----------------------------------------------------------------------
  // Output
  // -----------------------------------------------------------------------
  verb('say', ['text'], (args, _env, interp) => {
    const text = args.map(a => interp.stringify(a)).join(' ');
    interp._output(text);
    return new TextValue(text);
  });

  verb('greet', ['user'], (args) => {
    const userName = args[0]?.toString() ?? 'unknown';
    return new TextValue(`Hello, ${userName}`);
  });

  // -----------------------------------------------------------------------
  // Arithmetic
  // -----------------------------------------------------------------------
  verb('add', ['a', 'to', 'b'], (args, _env, interp) => {
    return new NumberValue(interp.toNumber(args[0]) + interp.toNumber(args[2] ?? args[1]));
  });

  verb('subtract', ['a', 'from', 'b'], (args, _env, interp) => {
    const a = interp.toNumber(args[0]);
    const b = interp.toNumber(args[2] ?? args[1]);
    return new NumberValue(b - a);
  });

  verb('multiply', ['a', 'b'], (args, _env, interp) => {
    return new NumberValue(interp.toNumber(args[0]) * interp.toNumber(args[1]));
  });

  verb('divide', ['a', 'b'], (args, _env, interp) => {
    const b = interp.toNumber(args[1]);
    if (b === 0) throw new RuntimeError('Division by zero');
    return new NumberValue(interp.toNumber(args[0]) / b);
  });

  verb('modulo', ['a', 'b'], (args, _env, interp) => {
    return new NumberValue(interp.toNumber(args[0]) % interp.toNumber(args[1]));
  });

  verb('abs', ['n'], (args, _env, interp) => {
    return new NumberValue(Math.abs(interp.toNumber(args[0])));
  });

  verb('int', ['n'], (args, _env, interp) => {
    return new NumberValue(Math.trunc(interp.toNumber(args[0])));
  });

  // -----------------------------------------------------------------------
  // String operations (Perl 4 / Tcl inspired)
  // -----------------------------------------------------------------------
  verb('split', ['text', 'delimiter'], (args, _env, interp) => {
    const text = interp.stringify(args[0]);
    const delim = args[1] != null ? interp.stringify(args[1]) : '';
    const parts = delim === '' ? [...text] : text.split(delim);
    const list = new ListValue();
    for (const p of parts) list.push(new TextValue(p));
    return list;
  });

  verb('join', ['list', 'delimiter'], (args, _env, interp) => {
    const list = args[0];
    const delim = args[1] != null ? interp.stringify(args[1]) : '';
    if (!(list instanceof ListValue)) throw new RuntimeError('join requires a List');
    return new TextValue(list.items.map(i => interp.stringify(i)).join(delim));
  });

  verb('replace', ['text', 'old', 'new'], (args, _env, interp) => {
    const text = interp.stringify(args[0]);
    const oldStr = interp.stringify(args[1]);
    const newStr = interp.stringify(args[2] ?? new TextValue(''));
    return new TextValue(text.split(oldStr).join(newStr));
  });

  verb('uppercase', ['text'], (args, _env, interp) => {
    return new TextValue(interp.stringify(args[0]).toUpperCase());
  });

  verb('lowercase', ['text'], (args, _env, interp) => {
    return new TextValue(interp.stringify(args[0]).toLowerCase());
  });

  verb('length', ['value'], (args) => {
    const v = args[0];
    if (v instanceof ListValue) return new NumberValue(v.length);
    if (v instanceof DictionaryValue) return new NumberValue(v.entries.size);
    if (v instanceof TextValue) return new NumberValue(v.value.length);
    return new NumberValue(String(v ?? '').length);
  });

  verb('substr', ['text', 'start', 'count'], (args, _env, interp) => {
    const text = interp.stringify(args[0]);
    const start = Math.trunc(interp.toNumber(args[1] ?? new NumberValue(0)));
    if (args[2] == null) return new TextValue(text.slice(start));
    const count = Math.trunc(interp.toNumber(args[2]));
    return new TextValue(text.slice(start, start + count));
  });

  verb('index', ['haystack', 'needle'], (args, _env, interp) => {
    const hay = interp.stringify(args[0]);
    const needle = interp.stringify(args[1]);
    return new NumberValue(hay.indexOf(needle));
  });

  verb('rindex', ['haystack', 'needle'], (args, _env, interp) => {
    const hay = interp.stringify(args[0]);
    const needle = interp.stringify(args[1]);
    return new NumberValue(hay.lastIndexOf(needle));
  });

  verb('chop', ['text'], (args, _env, interp) => {
    const text = interp.stringify(args[0]);
    return new TextValue(text.length ? text.slice(0, -1) : '');
  });

  verb('chomp', ['text'], (args, _env, interp) => {
    return new TextValue(interp.stringify(args[0]).replace(/[\r\n]+$/, ''));
  });

  verb('trim', ['text'], (args, _env, interp) => {
    return new TextValue(interp.stringify(args[0]).trim());
  });

  verb('reverse', ['value'], (args, _env, interp) => {
    const v = args[0];
    if (v instanceof ListValue) {
      return new ListValue([...v.items].reverse());
    }
    return new TextValue([...interp.stringify(v)].reverse().join(''));
  });

  verb('repeat', ['text', 'count'], (args, _env, interp) => {
    const n = Math.max(0, Math.trunc(interp.toNumber(args[1])));
    return new TextValue(interp.stringify(args[0]).repeat(n));
  });

  verb('sprintf', ['format', 'args'], (args, _env, interp) => {
    const fmt = interp.stringify(args[0]);
    const values = args.slice(1).map(a => {
      if (a instanceof NumberValue) return a.value;
      return interp.stringify(a);
    });
    return new TextValue(sprintfLite(fmt, values));
  });

  verb('chr', ['n'], (args, _env, interp) => {
    return new TextValue(String.fromCharCode(interp.toNumber(args[0])));
  });

  verb('ord', ['text'], (args, _env, interp) => {
    const s = interp.stringify(args[0]);
    return new NumberValue(s.length ? s.charCodeAt(0) : 0);
  });

  verb('startswith', ['text', 'prefix'], (args, _env, interp) => {
    return new NumberValue(interp.stringify(args[0]).startsWith(interp.stringify(args[1])) ? 1 : 0);
  });

  verb('endswith', ['text', 'suffix'], (args, _env, interp) => {
    return new NumberValue(interp.stringify(args[0]).endsWith(interp.stringify(args[1])) ? 1 : 0);
  });

  verb('contains', ['haystack', 'needle'], (args, _env, interp) => {
    const hay = args[0];
    if (hay instanceof ListValue) {
      const needle = interp.stringify(args[1]);
      return new NumberValue(hay.items.some(i => interp.stringify(i) === needle) ? 1 : 0);
    }
    if (hay instanceof DictionaryValue) {
      return new NumberValue(hay.has(interp.stringify(args[1])) ? 1 : 0);
    }
    return new NumberValue(interp.stringify(hay).includes(interp.stringify(args[1])) ? 1 : 0);
  });

  // -----------------------------------------------------------------------
  // List operations (Perl 4 arrays)
  // -----------------------------------------------------------------------
  verb('push', ['list', 'item'], (args) => {
    const list = requireList(args[0], 'push');
    for (let i = 1; i < args.length; i++) list.push(args[i]);
    return new NumberValue(list.length);
  });

  verb('pop', ['list'], (args) => {
    const list = requireList(args[0], 'pop');
    if (!list.items.length) return NULL;
    return list.items.pop();
  });

  verb('shift', ['list'], (args) => {
    const list = requireList(args[0], 'shift');
    if (!list.items.length) return NULL;
    return list.items.shift();
  });

  verb('unshift', ['list', 'item'], (args) => {
    const list = requireList(args[0], 'unshift');
    const items = args.slice(1);
    list.items.unshift(...items);
    return new NumberValue(list.length);
  });

  verb('sort', ['list'], (args, _env, interp) => {
    const list = requireList(args[0], 'sort');
    const sorted = [...list.items].sort((a, b) =>
      interp.stringify(a).localeCompare(interp.stringify(b), undefined, { numeric: true })
    );
    return new ListValue(sorted);
  });

  verb('first', ['list'], (args) => {
    const list = requireList(args[0], 'first');
    return list.items[0] ?? NULL;
  });

  verb('last', ['list'], (args) => {
    const list = requireList(args[0], 'last');
    return list.items.length ? list.items[list.items.length - 1] : NULL;
  });

  verb('unique', ['list'], (args, _env, interp) => {
    const list = requireList(args[0], 'unique');
    const seen = new Set();
    const out = new ListValue();
    for (const item of list.items) {
      const k = interp.stringify(item);
      if (!seen.has(k)) {
        seen.add(k);
        out.push(item);
      }
    }
    return out;
  });

  verb('slice', ['list', 'start', 'end'], (args, _env, interp) => {
    const list = requireList(args[0], 'slice');
    const start = Math.trunc(interp.toNumber(args[1] ?? new NumberValue(0)));
    const end = args[2] != null ? Math.trunc(interp.toNumber(args[2])) : undefined;
    return new ListValue(list.items.slice(start, end));
  });

  verb('splice', ['list', 'start', 'count'], (args, _env, interp) => {
    const list = requireList(args[0], 'splice');
    const start = Math.trunc(interp.toNumber(args[1] ?? new NumberValue(0)));
    const count = args[2] != null ? Math.trunc(interp.toNumber(args[2])) : list.items.length - start;
    const inserted = args.slice(3);
    const removed = list.items.splice(start, count, ...inserted);
    return new ListValue(removed);
  });

  // -----------------------------------------------------------------------
  // Dictionary operations (Perl 4 hashes)
  // -----------------------------------------------------------------------
  verb('keys', ['dict'], (args) => {
    const dict = requireDict(args[0], 'keys');
    const list = new ListValue();
    for (const k of dict.entries.keys()) list.push(new TextValue(k));
    return list;
  });

  verb('values', ['dict'], (args) => {
    const dict = requireDict(args[0], 'values');
    const list = new ListValue();
    for (const v of dict.entries.values()) list.push(v);
    return list;
  });

  verb('haskey', ['dict', 'key'], (args, _env, interp) => {
    const dict = requireDict(args[0], 'haskey');
    return new NumberValue(dict.has(interp.stringify(args[1])) ? 1 : 0);
  });

  verb('deletekey', ['dict', 'key'], (args, _env, interp) => {
    const dict = requireDict(args[0], 'deletekey');
    const key = interp.stringify(args[1]);
    const prev = dict.get(key);
    dict.entries.delete(key);
    return prev ?? NULL;
  });

  verb('dictsize', ['dict'], (args) => {
    const dict = requireDict(args[0], 'dictsize');
    return new NumberValue(dict.entries.size);
  });

  verb('merge', ['dest', 'src'], (args) => {
    const dest = requireDict(args[0], 'merge');
    const src = requireDict(args[1], 'merge');
    for (const [k, v] of src.entries) dest.set(k, v);
    return dest;
  });

  // -----------------------------------------------------------------------
  // File tests and builtins (Perl -X, tcsh filetest / builtins)
  // -----------------------------------------------------------------------
  verb('fileexists', ['path'], (args, _env, interp) => {
    return new NumberValue(fs.existsSync(interp.stringify(args[0])) ? 1 : 0);
  });

  verb('isfile', ['path'], (args, _env, interp) => {
    try {
      return new NumberValue(fs.statSync(interp.stringify(args[0])).isFile() ? 1 : 0);
    } catch {
      return new NumberValue(0);
    }
  });

  verb('isdir', ['path'], (args, _env, interp) => {
    try {
      return new NumberValue(fs.statSync(interp.stringify(args[0])).isDirectory() ? 1 : 0);
    } catch {
      return new NumberValue(0);
    }
  });

  verb('isreadable', ['path'], (args, _env, interp) => {
    try {
      fs.accessSync(interp.stringify(args[0]), fs.constants.R_OK);
      return new NumberValue(1);
    } catch {
      return new NumberValue(0);
    }
  });

  verb('iswritable', ['path'], (args, _env, interp) => {
    try {
      fs.accessSync(interp.stringify(args[0]), fs.constants.W_OK);
      return new NumberValue(1);
    } catch {
      return new NumberValue(0);
    }
  });

  verb('isexecutable', ['path'], (args, _env, interp) => {
    try {
      fs.accessSync(interp.stringify(args[0]), fs.constants.X_OK);
      return new NumberValue(1);
    } catch {
      return new NumberValue(0);
    }
  });

  verb('filesize', ['path'], (args, _env, interp) => {
    try {
      return new NumberValue(fs.statSync(interp.stringify(args[0])).size);
    } catch {
      return new NumberValue(-1);
    }
  });

  verb('isemptyfile', ['path'], (args, _env, interp) => {
    try {
      return new NumberValue(fs.statSync(interp.stringify(args[0])).size === 0 ? 1 : 0);
    } catch {
      return new NumberValue(0);
    }
  });

  verb('cat', ['path'], (args, _env, interp) => {
    const p = interp.stringify(args[0]);
    try {
      return new TextValue(fs.readFileSync(p, 'utf-8'));
    } catch (e) {
      throw new RuntimeError(`Cannot cat "${p}": ${e.message}`);
    }
  });

  verb('touch', ['path'], (args, _env, interp) => {
    const p = interp.stringify(args[0]);
    const now = new Date();
    try {
      fs.utimesSync(p, now, now);
    } catch {
      fs.writeFileSync(p, '');
    }
    return new TextValue(p);
  });

  verb('mkdir', ['path'], (args, _env, interp) => {
    const p = interp.stringify(args[0]);
    fs.mkdirSync(p, { recursive: true });
    return new TextValue(p);
  });

  verb('rmdir', ['path'], (args, _env, interp) => {
    const p = interp.stringify(args[0]);
    fs.rmdirSync(p);
    return new TextValue(p);
  });

  verb('unlink', ['path'], (args, _env, interp) => {
    const p = interp.stringify(args[0]);
    fs.unlinkSync(p);
    return new TextValue(p);
  });

  verb('rename', ['from', 'to'], (args, _env, interp) => {
    const from = interp.stringify(args[0]);
    const to = interp.stringify(args[1]);
    fs.renameSync(from, to);
    return new TextValue(to);
  });

  verb('copy', ['from', 'to'], (args, _env, interp) => {
    const from = interp.stringify(args[0]);
    const to = interp.stringify(args[1]);
    fs.copyFileSync(from, to);
    return new TextValue(to);
  });

  verb('chdir', ['path'], (args, _env, interp) => {
    const p = interp.stringify(args[0]);
    process.chdir(p);
    return new TextValue(process.cwd());
  });

  verb('pwd', [], () => new TextValue(process.cwd()));

  verb('chmod', ['path', 'mode'], (args, _env, interp) => {
    const p = interp.stringify(args[0]);
    let mode = interp.toNumber(args[1]);
    // Perl-style octal: 755 means 0o755
    if (mode > 511 && String(Math.trunc(mode)).match(/^[0-7]+$/)) {
      mode = parseInt(String(Math.trunc(mode)), 8);
    }
    fs.chmodSync(p, mode);
    return new NumberValue(mode);
  });

  verb('glob', ['pattern'], (args, _env, interp) => {
    const pattern = interp.stringify(args[0]);
    const list = new ListValue();
    for (const match of expandGlob(pattern)) list.push(new TextValue(match));
    return list;
  });

  verb('which', ['cmd'], (args, _env, interp) => {
    const cmd = interp.stringify(args[0]);
    const found = findOnPath(cmd);
    return found ? new TextValue(found) : NULL;
  });

  verb('basename', ['path'], (args, _env, interp) => {
    return new TextValue(path.basename(interp.stringify(args[0])));
  });

  verb('dirname', ['path'], (args, _env, interp) => {
    return new TextValue(path.dirname(interp.stringify(args[0])));
  });

  // -----------------------------------------------------------------------
  // External shell commands (Perl system / backticks, tcsh command)
  // -----------------------------------------------------------------------
  verb('system', ['command'], (args, _env, interp) => {
    const cmd = interp.stringify(args[0]);
    const result = interp._runShellCommand(cmd);
    if (result.stdout) interp._output(result.stdout.trimEnd());
    if (result.stderr) interp._output(result.stderr.trimEnd());
    return new NumberValue(result.code);
  });

  verb('backtick', ['command'], (args, _env, interp) => {
    const cmd = interp.stringify(args[0]);
    const result = interp._runShellCommand(cmd);
    return new TextValue((result.stdout || '').trimEnd());
  });

  verb('shell', ['command'], (args, _env, interp) => {
    const cmd = interp.stringify(args[0]);
    return interp._runShellCommand(cmd);
  });
}

function requireList(val, name) {
  if (!(val instanceof ListValue)) throw new RuntimeError(`${name} requires a List`);
  return val;
}

function requireDict(val, name) {
  if (!(val instanceof DictionaryValue)) throw new RuntimeError(`${name} requires a Dictionary`);
  return val;
}

/** Minimal sprintf: %s, %d, %f, %% */
function sprintfLite(fmt, values) {
  let i = 0;
  return fmt.replace(/%%|%s|%d|%f/g, (m) => {
    if (m === '%%') return '%';
    const v = values[i++];
    if (m === '%s') return String(v ?? '');
    if (m === '%d') return String(Math.trunc(Number(v) || 0));
    if (m === '%f') return String(Number(v) || 0);
    return m;
  });
}

/**
 * Expand a glob with *, ?, and ** (non-recursive ** treated as *).
 */
function expandGlob(pattern) {
  const abs = path.resolve(pattern);
  const dir = path.dirname(abs);
  const base = path.basename(pattern);
  if (!base.includes('*') && !base.includes('?')) {
    return fs.existsSync(abs) ? [abs] : [];
  }
  let entries = [];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const re = globToRegExp(base);
  return entries.filter(e => re.test(e)).map(e => path.join(dir, e));
}

function globToRegExp(glob) {
  let out = '^';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') out += '.*';
    else if (c === '?') out += '.';
    else if ('\\.[]{}()+^$|'.includes(c)) out += '\\' + c;
    else out += c;
  }
  return new RegExp(out + '$', 'i');
}

function findOnPath(cmd) {
  if (path.isAbsolute(cmd) && fs.existsSync(cmd)) return cmd;
  const ext = process.platform === 'win32'
    ? (process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';')
    : [''];
  const dirs = (process.env.PATH || '').split(path.delimiter);
  for (const dir of dirs) {
    for (const e of ext) {
      const candidate = path.join(dir, cmd + e);
      try {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
      } catch { /* skip */ }
    }
  }
  return null;
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
