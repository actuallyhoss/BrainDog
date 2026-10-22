/**
 * THE RESOLVER AN ENTRY'S OWN DOCUMENT IS DRAWN WITH (PGS-B03 c), over what the record read for it (`get` with
 * `values: true`, `docValues` in the record). Before it the entry's screen answered nothing for every path, so a
 * project's note that said `{{blockers.count}} in the way` printed a hole on the project's own screen.
 *
 * A PAGE'S RULES, NOT NEW ONES: a value is written as a block on a page writes it (`namedResolverOf`), a path the record
 * says names nothing is `UNNAMED`, so the author's words print as written, and a path that names something and holds
 * nothing is the dash.
 *
 * TWO THINGS ONLY AN ENTRY'S FIELDS HOLD. A day or an instant field is said as a day ("9 Oct 2026"), never the stored
 * ISO text. And a path a typed form reads (`{{money:price}}`, `{{date:due}}`) is handed over as the literal that form
 * takes, `135000 EGP` or the ISO day, because the renderer formats it itself and could not read a written amount back.
 */

import { TYPED, dateSaid, type Resolve } from 'braindog-render';

import { namedResolverOf } from './page-live.ts';

/**
 * What one document's paths answer, as the record sends it: `values` by path, the paths that name nothing, and `held`
 * when the reader may not see what the rest read (`shownOf`).
 */
export type DocValues = { values?: Record<string, unknown>; unnamed?: readonly string[]; held?: boolean };

/** A stored day or instant, which a sentence says as a day. */
const ISO_DAY = /^\d{4}-\d{2}-\d{2}(?:T[\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)?$/u;

/** Every path a typed form reads in `src`, outside code spans, as the renderer finds them (`inline.ts` `braced`). */
function typedPaths(src: string): Set<string> {
  const out = new Set<string>();
  for (const m of src.replace(/`[^`]*`/gu, ' ').matchAll(/\{\{([^{}]*)\}\}/gu)) {
    const body = m[1] ?? '';
    const colon = body.indexOf(':');
    if (colon <= 0 || !(TYPED as readonly string[]).includes(body.slice(0, colon).trim())) continue;
    const raw = body.slice(colon + 1).trim();
    if (/^[A-Za-z]/u.test(raw)) out.add(raw);
  }
  return out;
}

/** A path as the renderer reads one (`inline.ts` `PATH`). */
const PATH = /^[A-Za-z][A-Za-z0-9_-]*(?:#\d+)?(?:\.[A-Za-z][A-Za-z0-9_-]*(?:#\d+)?)*$/u;

/** The path a `{{...}}` body asks the resolver for, bare or in a typed form, or null where it asks none. */
function askedPath(body: string): string | null {
  const colon = body.indexOf(':');
  if (colon > 0) {
    const form = body.slice(0, colon).trim();
    if (!(TYPED as readonly string[]).includes(form)) return null;
    const raw = body.slice(colon + 1).trim();
    return /^[A-Za-z]/u.test(raw) && !(form === 'ref' && /^[a-z][a-z0-9_]*#\d+$/u.test(raw)) ? raw : null;
  }
  const path = body.trim();
  return PATH.test(path) ? path : null;
}

/**
 * A document's text as its screen draws it. WHAT THE READER MAY NOT SEE PRINTS NOTHING: where the record held the read
 * from her (`held`), each `{{path}}` it gave no value for is taken out, never drawn as its words and a dash, which said
 * there was a value she could ask for. Code spans are the author's text and are left as written.
 */
export function shownOf(doc: DocValues | undefined, src: string): string {
  if (doc?.held !== true) return src;
  const values = doc.values ?? {};
  return src.replace(/(`[^`]*`)|\{\{([^{}]*)\}\}/gu, (whole, code: string | undefined, body: string | undefined) => {
    if (code !== undefined || body === undefined) return whole;
    const path = askedPath(body);
    return path !== null && !Object.hasOwn(values, path) ? '' : whole;
  });
}

/** A value as a typed form's literal: an amount as `<minor> <CUR>`, a scalar as its text, anything else nothing. */
function literalOf(v: unknown): string | null {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
    const { amount, currency } = v as { amount?: unknown; currency?: unknown };
    if (typeof amount === 'number' && typeof currency === 'string') return `${amount} ${currency}`;
  }
  return null;
}

/**
 * The resolver for one document of an entry: `doc` is what the record read for it (absent where it read nothing, so every
 * path draws as a page draws a path with no value), and `src` the document's own text, which says which paths a typed
 * form reads.
 */
export function resolverOf(doc: DocValues | undefined, src = ''): Resolve {
  const values = doc?.values;
  const said = namedResolverOf(values, doc?.unnamed);
  const typed = typedPaths(src);
  return (path) => {
    const v = values && Object.hasOwn(values, path) ? values[path] : undefined;
    if (v === undefined) return said(path);
    if (typed.has(path)) return literalOf(v);
    if (typeof v === 'string' && ISO_DAY.test(v)) return dateSaid(v);
    return said(path);
  };
}
