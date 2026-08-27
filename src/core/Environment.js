/**
 * core/Environment.js - Variable scope management for Prose.
 *
 * Implements a scope chain. Each scope is a Map from variable name
 * (lowercased) to Value. Lookups walk the chain; sets go to the
 * current/innermost scope by default.
 *
 * Also manages:
 *   - Verb (function) definitions keyed by verb name
 *   - Reactive watchers registered by Whenever
 *   - Discourse / anaphora state (root environment)
 */

import { DiscourseState } from './Discourse.js';

export class Environment {
  constructor(parent = null) {
    /** @type {Environment|null} */
    this.parent = parent;
    /** @type {Map<string, import('./Value.js').Value>} */
    this.variables = new Map();
    /** @type {Map<string, VerbDefinition>} */
    this.verbs = new Map();
    /** @type {import('./Value.js').ReactiveWatcher[]} */
    this.watchers = [];
    /** @type {DiscourseState|null} owned by the root environment */
    this.discourse = parent ? null : new DiscourseState();
  }

  /** @returns {DiscourseState} */
  getDiscourse() {
    return this.root().discourse;
  }

  // -----------------------------------------------------------------------
  // Variables
  // -----------------------------------------------------------------------

  /**
   * Look up a variable, walking the scope chain.
   * @param {string} name
   * @returns {import('./Value.js').Value|null}
   */
  lookup(name) {
    const key = name.toLowerCase();
    if (this.variables.has(key)) return this.variables.get(key);
    if (this.parent) return this.parent.lookup(name);
    return null;
  }

  /**
   * Set a variable in the scope where it was defined, or current scope.
   * @param {string} name
   * @param {import('./Value.js').Value} value
   * @param {boolean} [createInCurrent=false] if true, always set in current scope
   */
  set(name, value, createInCurrent = false) {
    const key = name.toLowerCase();
    if (createInCurrent) {
      this.variables.set(key, value);
      return;
    }
    // Walk up to find existing definition
    let scope = this;
    while (scope) {
      if (scope.variables.has(key)) {
        scope.variables.set(key, value);
        return;
      }
      scope = scope.parent;
    }
    // Not found anywhere, create in current
    this.variables.set(key, value);
  }

  /**
   * Define a variable in the current scope only.
   * @param {string} name
   * @param {import('./Value.js').Value} value
   */
  define(name, value) {
    this.variables.set(name.toLowerCase(), value);
  }

  // -----------------------------------------------------------------------
  // Verbs (functions)
  // -----------------------------------------------------------------------

  /**
   * Register a verb definition.
   * @param {string} verbName
   * @param {VerbDefinition} def
   */
  defineVerb(verbName, def) {
    this.verbs.set(verbName.toLowerCase(), def);
  }

  /**
   * Lookup a verb, walking the scope chain.
   * @param {string} verbName
   * @returns {VerbDefinition|null}
   */
  lookupVerb(verbName) {
    const key = verbName.toLowerCase();
    if (this.verbs.has(key)) return this.verbs.get(key);
    if (this.parent) return this.parent.lookupVerb(verbName);
    return null;
  }

  // -----------------------------------------------------------------------
  // Reactive Watchers
  // -----------------------------------------------------------------------

  /**
   * Register a reactive Whenever watcher.
   * @param {ReactiveWatcher} watcher
   */
  addWatcher(watcher) {
    this.watchers.push(watcher);
  }

  /**
   * Fire watchers for a given entity + property change.
   * @param {string} entityName
   * @param {string} propertyName
   * @param {import('./Value.js').EntityValue} entity
   * @param {import('./Value.js').Value} newValue
   * @param {import('./interpreter/Interpreter.js').Interpreter} interpreter
   */
  fireWatchers(entityName, propertyName, entity, newValue, interpreter) {
    for (const w of this.watchers) {
      if (w.entityName.toLowerCase() === entityName.toLowerCase()) {
        if (w.propertyName === null ||
            w.propertyName.toLowerCase() === propertyName.toLowerCase()) {
          try {
            w.callback(entity, interpreter);
          } catch (e) {
            // Log but don't crash - watcher errors shouldn't break main flow
            console.error(`Watcher error on ${entityName}.${propertyName}: ${e.message}`);
          }
        }
      }
    }
  }

  /**
   * Fire watchers for plain variable changes (non-entity).
   */
  fireVarWatchers(varName, newValue, interpreter) {
    const key = varName.toLowerCase();
    for (const w of this.watchers) {
      if (w.entityName.toLowerCase() === key && w.propertyName === null) {
        try {
          w.callback(null, interpreter);
        } catch (e) {
          console.error(`Watcher error on ${varName}: ${e.message}`);
        }
      }
    }
  }

  /**
   * Create a child scope (for verb execution, block scopes, etc.)
   * @returns {Environment}
   */
  pushScope() {
    return new Environment(this);
  }

  /**
   * Get the root-most environment.
   * @returns {Environment}
   */
  root() {
    let env = this;
    while (env.parent) env = env.parent;
    return env;
  }
}

/**
 * Represents a verb (function) definition.
 */
export class VerbDefinition {
  /**
   * @param {string} name        verb name, e.g. "Greet"
   * @param {string[]} params    parameter names, e.g. ["User"] or ["target", "by", "amount"]
   * @param {import('../parser/AST.js').Statement[]} body
   * @param {Environment} closure the environment where the verb was defined
   */
  constructor(name, params, body, closure) {
    this.name = name;
    this.params = params;
    this.body = body;
    this.closure = closure;
    /** @type {{ type: string, role: string|null }[]|null} typed slots for taught verbs */
    this.slots = null;
  }
}
