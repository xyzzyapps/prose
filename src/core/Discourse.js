/**
 * core/Discourse.js - Anaphora and entity-graph tracking.
 */

import { NumberValue, TextValue, EntityValue, ListValue, DictionaryValue, NULL } from './Value.js';
import { CoreferenceError } from './Errors.js';

export const ANAPHORS = new Set(['it', 'there', 'here', 'those', 'others', '_']);

export class DiscourseState {
  constructor() {
    this.clock = 0;
    /** @type {import('./Value.js').Value|null} last scalar (or loop/keep item) */
    this.it = null;
    /** @type {ListValue|null} */
    this.those = null;
    /** @type {ListValue} */
    this.others = new ListValue();
    /** @type {TextValue|null} last file/folder path */
    this.there = null;
    /** @type {NumberValue|null} */
    this.lastNumber = null;
    /** @type {{ value: import('./Value.js').Value, gen: number, aliases: Set<string>, varName: string|null }[]} */
    this.entities = [];
    /** current keep/loop item (overrides `it` while set) */
    this.loopItem = null;
  }

  tick() {
    return ++this.clock;
  }

  mentionScalar(value) {
    if (!value) return;
    if (value instanceof NumberValue) {
      this.it = value;
      this.lastNumber = value;
    } else if (value instanceof TextValue) {
      this.it = value;
    } else if (value instanceof EntityValue || value instanceof DictionaryValue) {
      this.it = value;
    }
  }

  mentionCollection(list) {
    if (list instanceof ListValue) this.those = list;
  }

  mentionPath(pathStr) {
    if (pathStr == null || pathStr === '') return;
    this.there = new TextValue(String(pathStr));
  }

  /**
   * Register a dictionary or entity as a graph node.
   */
  registerEntity(value, varName = null) {
    if (!(value instanceof DictionaryValue) && !(value instanceof EntityValue)) return;
    const existing = this.entities.find(e => e.value === value);
    const gen = this.tick();
    if (existing) {
      existing.gen = gen;
      if (varName) {
        existing.varName = varName;
        existing.aliases.add(varName.toLowerCase());
      }
      return existing;
    }
    const aliases = new Set();
    if (varName) aliases.add(varName.toLowerCase());
    if (value instanceof EntityValue && value.name) aliases.add(value.name.toLowerCase());
    const rec = { value, gen, aliases, varName };
    this.entities.push(rec);
    this.it = value;
    return rec;
  }

  alias(phrase, value) {
    const key = normalizePhrase(phrase);
    let rec = this.entities.find(e => e.value === value);
    if (!rec) rec = this.registerEntity(value, null);
    if (rec) rec.aliases.add(key);
    return rec;
  }

  /**
   * Resolve `it` / `there` / `here` / `those` / `others` / `the number`.
   */
  resolveAnaphor(kind, line = 0, column = 0) {
    const k = kind.toLowerCase();
    if (k === 'it' || k === '_') {
      if (this.loopItem) return this.loopItem;
      if (this.it) return this.it;
      throw new CoreferenceError('Nothing for "it" to refer to', line, column);
    }
    if (k === 'there') {
      if (this.there) return this.there;
      throw new CoreferenceError('Nothing for "there" to refer to', line, column);
    }
    if (k === 'here') {
      return new TextValue(process.cwd());
    }
    if (k === 'those') {
      if (this.those) return this.those;
      throw new CoreferenceError('Nothing for "those" to refer to', line, column);
    }
    if (k === 'others') {
      return this.others;
    }
    if (k === 'number' || k === 'nearest number') {
      if (this.lastNumber) return this.lastNumber;
      throw new CoreferenceError('No number has been mentioned yet', line, column);
    }
    return null;
  }

  /**
   * Resolve a phrase such as "Active Admin" or "User" or "Current Client".
   */
  resolvePhrase(words, line = 0, column = 0) {
    const filtered = words.filter(w => w && !['the', 'a', 'an'].includes(w.toLowerCase()));
    if (filtered.length === 0) {
      throw new CoreferenceError('Empty coreference phrase', line, column);
    }
    const phrase = normalizePhrase(filtered.join(' '));

    // Alias exact match (most recent)
    const aliasHits = this.entities.filter(e => e.aliases.has(phrase));
    if (aliasHits.length === 1) return aliasHits[0].value;
    if (aliasHits.length > 1) {
      return pickRecent(aliasHits, filtered, line, column);
    }

    const hits = this.entities.filter(e => phraseMatches(e, filtered));
    if (hits.length === 0) {
      throw new CoreferenceError(
        `Cannot resolve "the ${filtered.join(' ')}"`,
        line, column
      );
    }
    return pickRecent(hits, filtered, line, column);
  }
}

function pickRecent(hits, words, line, column) {
  let maxGen = -1;
  for (const h of hits) if (h.gen > maxGen) maxGen = h.gen;
  const top = hits.filter(h => h.gen === maxGen);
  if (top.length > 1) {
    throw new CoreferenceError(
      `Ambiguous "the ${words.join(' ')}": ${top.length} equally recent matches`,
      line, column
    );
  }
  return top[0].value;
}

function normalizePhrase(s) {
  return String(s).trim().toLowerCase().replace(/\s+/g, ' ');
}

function fieldMap(value) {
  /** @type {Map<string, string>} */
  const m = new Map();
  if (value instanceof DictionaryValue) {
    for (const [k, v] of value.entries) {
      m.set(k.toLowerCase(), valueToPlain(v));
    }
  }
  if (value instanceof EntityValue) {
    m.set('type', value.blueprint || '');
    m.set('name', value.name || '');
    for (const [k, v] of value.properties) {
      m.set(k.toLowerCase(), valueToPlain(v));
    }
  }
  return m;
}

function valueToPlain(v) {
  if (!v) return '';
  if (v instanceof NumberValue) return String(v.value);
  if (v instanceof TextValue) return v.value;
  return String(v);
}

/**
 * Each content word must match a field value, type, or alias fragment.
 */
function phraseMatches(rec, words) {
  const fields = fieldMap(rec.value);
  const type = (fields.get('type') || (rec.value instanceof EntityValue ? rec.value.blueprint : '') || '').toLowerCase();
  const aliasText = [...rec.aliases].join(' ');

  for (const w of words) {
    const wl = w.toLowerCase();
    let ok = false;
    if (type === wl) ok = true;
    if (aliasText.split(/\s+/).includes(wl)) ok = true;
    if (rec.varName && rec.varName.toLowerCase() === wl) ok = true;
    for (const [, val] of fields) {
      if (String(val).toLowerCase() === wl) ok = true;
    }
    if (!ok) return false;
  }
  return true;
}

export function getProperty(value, propName) {
  if (!value) return null;
  if (value instanceof EntityValue) return value.get(propName);
  if (value instanceof DictionaryValue) return value.get(propName);
  return null;
}

export function setProperty(value, propName, val) {
  if (value instanceof EntityValue) {
    value.set(propName, val);
    return true;
  }
  if (value instanceof DictionaryValue) {
    value.set(propName, val);
    return true;
  }
  return false;
}
