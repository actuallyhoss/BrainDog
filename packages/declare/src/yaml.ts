/**
 * YAML text to JSON, through the one parser the repository admits (ADR-063, `docs/42-SPEC-DECLARE.md` §5.1).
 *
 * THIS IS A SUBPATH OF ITS OWN, `@braindog/declare/yaml`, SO THE BOUNDARY IS A PATH AND NOT A DISCIPLINE. The package root
 * never imports this file, so the record, the Worker and the web bundle stay one import line further from the parser than
 * they would be if it sat in `index.ts`. Only the command line and the self-host read YAML, where a pack or a theme is read
 * from disk; everything past them receives the JSON this returns.
 *
 * THE DIALECT IS NARROWED, NOT EXTENDED. YAML 1.2's core schema, so `yes`, `on` and `2026-01-01` stay strings; one document
 * per file; no anchor, no alias and no explicit tag, because each is a way for one file to mean something its reader cannot
 * see at the spot where it is used, and an alias is also the billion-laughs door. Warnings are faults here: a pack is read
 * by the record exactly once, and a file the parser had to guess about is a file two readers may read two ways.
 *
 * THE AST IS WALKED RATHER THAN HANDED TO `toJS`, so every fault keeps the line and column of the node that caused it, a
 * key that is not text is refused rather than turned into `"[object Object]"`, and a key named `__proto__` becomes an own
 * property the way `JSON.parse` makes it, never the object's prototype.
 *
 * IT NEVER THROWS. A refusal's `at` is `<line>:<column>`, both counted from one, for the caller to put its path in front
 * of, and `detail` carries the parser's own code when the parser raised the fault.
 */

import type { Json } from '@braindog/kernel';
import type { Result } from '@braindog/ports';
import { no, ok } from '@braindog/ports';
import { isAlias, isMap, isScalar, isSeq, LineCounter, parseAllDocuments, type Node } from 'yaml';

import { NESTED_MOST } from './credentials.ts';

/** One file's cap, from §5.1's limits: a pack file above it is refused before a byte of it is parsed. */
export const YAML_MOST_BYTES = 1_048_576;

/** Parse one YAML document into JSON, or say where and why it is not one. */
export function parseYaml(text: string): Result<Json> {
  const bytes = new TextEncoder().encode(text).length;
  if (bytes > YAML_MOST_BYTES)
    return no('PACK_MALFORMED', `This file is ${Math.ceil(bytes / 1024)} KB, and a YAML file is at most ${YAML_MOST_BYTES / 1024} KB. Split it into smaller files.`, { at: '0:0' });

  const lines = new LineCounter();
  let docs: ReturnType<typeof parseAllDocuments>;
  try {
    docs = parseAllDocuments(text, { version: '1.2', schema: 'core', strict: true, uniqueKeys: true, intAsBigInt: true, prettyErrors: false, lineCounter: lines });
  } catch (e) {
    // The parser throws on input it cannot even tokenise, a hundred thousand open brackets among them; the contract is a
    // `Result`, so that becomes a refusal like any other fault.
    return no('PACK_MALFORMED', 'This file could not be read as YAML at all.', { at: '0:0', detail: e instanceof Error ? e.message : String(e) });
  }
  const where = (offset: number): string => {
    const { line, col } = lines.linePos(offset);
    return `${line}:${col}`;
  };

  // The parser's own faults come first, because each one points at a line and a column, which a count of documents cannot.
  const faults = 'empty' in docs ? [...docs.errors, ...docs.warnings] : docs.flatMap((doc) => [...doc.errors, ...doc.warnings]);
  if (faults.length > 0) {
    const fault = faults[0]!;
    const at = where(fault.pos[0]);
    return no('PACK_MALFORMED', `Line ${at.replace(':', ', column ')}: ${fault.message}`, { at, detail: fault.code });
  }
  if (docs.length !== 1) {
    const second = docs.length > 1 ? docs[1] : undefined;
    const at = second?.range ? where(second.range[0]) : '0:0';
    return no('PACK_MALFORMED', `A YAML file here holds exactly one document, and this one holds ${docs.length}. Put each in a file of its own.`, { at });
  }
  return toJson(docs[0]!.contents, 0, where);
}

/**
 * One node as JSON. It recurses once a level, which is safe because it refuses past `NESTED_MOST`, the same depth
 * `readPackFile` refuses a JSON add-on past, so a YAML file and its JSON twin are refused at the same depth.
 */
function toJson(node: Node | null, depth: number, where: (offset: number) => string): Result<Json> {
  if (node === null) return ok(null);
  const at = node.range ? where(node.range[0]) : '0:0';
  if (depth > NESTED_MOST) return no('PACK_MALFORMED', `This file nests deeper than ${NESTED_MOST} levels, and no plugin does.`, { at });
  if (isAlias(node) || node.anchor)
    return no('PACK_MALFORMED', 'This file uses an anchor or an alias. Write the value out in full wherever it is used.', { at });
  if (node.tag) return no('PACK_MALFORMED', `This file carries the tag ${node.tag}, and a pack carries no tags. Take it out.`, { at });

  if (isScalar(node)) return scalar(node.value, at);

  if (isSeq(node)) {
    const out: Json[] = [];
    for (const item of node.items) {
      const value = toJson((item ?? null) as Node | null, depth + 1, where);
      if (!value.ok) return value;
      out.push(value.value);
    }
    return ok(out);
  }

  if (isMap(node)) {
    const out: { [key: string]: Json } = {};
    for (const pair of node.items) {
      const key = (pair.key ?? null) as Node | null;
      const keyAt = key?.range ? where(key.range[0]) : at;
      if (!isScalar(key) || typeof key.value !== 'string' || key.anchor || key.tag)
        return no('PACK_MALFORMED', 'Every key in this file is plain text. Write this key as a word, not a number, a list or a map.', { at: keyAt });
      const value = toJson((pair.value ?? null) as Node | null, depth + 1, where);
      if (!value.ok) return value;
      Object.defineProperty(out, key.value, { value: value.value, enumerable: true, writable: true, configurable: true });
    }
    return ok(out);
  }

  return no('PACK_MALFORMED', 'This file holds a value YAML can write and JSON cannot.', { at });
}

/** A scalar's value under the core schema: text, a boolean, null, a float, or an integer read as a `bigint`. */
function scalar(value: unknown, at: string): Result<Json> {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return ok(value);
  if (typeof value === 'bigint') {
    // Integers are read as `bigint` so one past 2^53 is caught here rather than silently rounded to its neighbour.
    if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER))
      return no('INT_OUT_OF_RANGE', `${value} is too large a whole number to keep exactly. Write it as text in quotes.`, { at });
    return ok(Number(value));
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return no('PACK_MALFORMED', 'This file holds an infinite or not-a-number value, and JSON has neither.', { at });
    return ok(Object.is(value, -0) ? 0 : value);
  }
  return no('PACK_MALFORMED', 'This file holds a value YAML can write and JSON cannot.', { at });
}
