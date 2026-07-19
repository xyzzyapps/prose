/**
 * core/Value.js - Runtime value types for the Prose language.
 *
 * Prose has these value types:
 *   - NumberValue: integers and floats
 *   - TextValue: strings
 *   - EntityValue: object instances with a blueprint name and properties
 *   - ListValue: ordered collections
 *   - DictionaryValue: key-value maps
 *   - NullValue: represents nothing/null
 *   - ReactiveWatcher: a callback registered with Whenever
 */

export class Value {
  /** @returns {string} */
  typeName() { return 'value'; }

  /** @returns {string} debug representation */
  toString() { return '<value>'; }

  /** @returns {boolean} */
  isTruthy() { return true; }
}

// ---------------------------------------------------------------------------
// NumberValue
// ---------------------------------------------------------------------------

export class NumberValue extends Value {
  /** @param {number} value */
  constructor(value) {
    super();
    this.value = Number(value);
  }

  typeName() { return 'Number'; }
  toString() { return String(this.value); }
  isTruthy() { return this.value !== 0; }
}

// ---------------------------------------------------------------------------
// TextValue
// ---------------------------------------------------------------------------

export class TextValue extends Value {
  /** @param {string} value */
  constructor(value) {
    super();
    this.value = String(value);
  }

  typeName() { return 'Text'; }
  toString() { return this.value; }
  isTruthy() { return this.value.length > 0; }
}

// ---------------------------------------------------------------------------
// EntityValue  (class instances / objects)
// ---------------------------------------------------------------------------

export class EntityValue extends Value {
  /**
   * @param {string} blueprint  e.g. "User", "Account"
   * @param {string} name       instance name, e.g. "Alice"
   * @param {Map<string, Value>} [properties]
   */
  constructor(blueprint, name, properties = new Map()) {
    super();
    this.blueprint = blueprint;
    this.name = name;
    this.properties = properties;  // Map<string, Value>
  }

  typeName() { return this.blueprint; }

  /** Get a property by name (case-insensitive first match) */
  get(propName) {
    // Try exact match first
    if (this.properties.has(propName)) return this.properties.get(propName);
    // Try case-insensitive
    const lower = propName.toLowerCase();
    for (const [k, v] of this.properties) {
      if (k.toLowerCase() === lower) return v;
    }
    return null;
  }

  /** Set a property */
  set(propName, value) {
    this.properties.set(propName, value);
  }

  toString() {
    const props = [...this.properties.entries()]
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
    return `${this.blueprint}(${this.name}){${props}}`;
  }

  isTruthy() { return true; }
}

// ---------------------------------------------------------------------------
// ListValue
// ---------------------------------------------------------------------------

export class ListValue extends Value {
  /** @param {Value[]} items */
  constructor(items = []) {
    super();
    this.items = items;
  }

  typeName() { return 'List'; }
  toString() { return `[${this.items.map(i => i.toString()).join(', ')}]`; }
  isTruthy() { return this.items.length > 0; }

  push(item) { this.items.push(item); }
  /** @returns {number} */
  get length() { return this.items.length; }
}

// ---------------------------------------------------------------------------
// DictionaryValue (key-value map)
// ---------------------------------------------------------------------------

export class DictionaryValue extends Value {
  /** @param {Map<string, Value>} [entries] */
  constructor(entries = new Map()) {
    super();
    /** @type {Map<string, Value>} */
    this.entries = entries;
  }

  typeName() { return 'Dictionary'; }

  set(key, value) {
    this.entries.set(String(key), value);
  }

  get(key) {
    return this.entries.get(String(key)) ?? null;
  }

  has(key) {
    return this.entries.has(String(key));
  }

  toString() {
    const pairs = [...this.entries.entries()]
      .map(([k, v]) => `"${k}" -> ${v}`)
      .join(', ');
    return `{${pairs}}`;
  }

  isTruthy() { return this.entries.size > 0; }
}

// ---------------------------------------------------------------------------
// NullValue
// ---------------------------------------------------------------------------

export class NullValue extends Value {
  typeName() { return 'Null'; }
  toString() { return 'nothing'; }
  isTruthy() { return false; }
}

export const NULL = new NullValue();

// ---------------------------------------------------------------------------
// ShellResult - result of an OS shell command execution
// ---------------------------------------------------------------------------

export class ShellResultValue extends Value {
  /**
   * @param {string} stdout  standard output from the command
   * @param {string} stderr  standard error from the command
   * @param {number} code    exit code
   */
  constructor(stdout, stderr, code) {
    super();
    this.stdout = stdout;
    this.stderr = stderr;
    this.code = code;
  }

  typeName() { return 'ShellResult'; }
  toString() { return this.stdout; }
  isTruthy() { return this.code === 0; }
}

// ---------------------------------------------------------------------------
// ReactiveWatcher - registered by Whenever blocks
// ---------------------------------------------------------------------------

export class ReactiveWatcher {
  /**
   * @param {string} entityName   which entity to watch
   * @param {string} propertyName which property to watch (null = any)
   * @param {Function} callback   (entity: EntityValue) => void
   */
  constructor(entityName, propertyName, callback) {
    this.entityName = entityName;
    this.propertyName = propertyName;
    this.callback = callback;
  }
}
