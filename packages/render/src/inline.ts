/**
 * Inline tokens: the closed markdown subset, live values, typed values and evidence tags.
 *
 * ORDER MATTERS AND IT IS NOT ARBITRARY. Code spans are lifted FIRST, so a literal `{{…}}` copied
 * out of another system survives inside backticks (05 §7.1). Everything after that runs on the gaps
 * between them.
 *
 * The distinction that carries the most weight in this file: `{{path}}` is not `{verified: path}`.
 * The tag says somebody checked this figure against that path ONCE; the double brace says go and
 * read it NOW. A figure you interpolate needs no tag — the path is its provenance (05 §7.3).
 */

import { MISSING, TYPED, formatTyped, magnitudeOf, type TypedForm } from './format.ts';

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'code'; text: string }
  | { type: 'strong'; body: Inline[] }
  | { type: 'em'; body: Inline[] }
  | { type: 'link'; href: string; body: Inline[] }
  /** A live figure. `resolved` is null when the record holds no value; the renderer draws an em dash. */
  | { type: 'path'; path: string; resolved: string | null }
  | { type: 'typed'; form: TypedForm; arg: string; text: string; link?: 'day' | 'row' }
  | { type: 'evidence'; kind: 'verified' | 'inferred' | 'estimate' | 'unknown'; source?: string }
  /** Anything that looked like a token and was not. Drawn as the author's text, dotted. */
  | { type: 'unresolved'; text: string };

export type Resolve = (path: string) => string | null | undefined;

export type InlineOptions = { resolve?: Resolve; now?: number };

const EVIDENCE = ['verified', 'inferred', 'estimate', 'unknown'] as const;

/** Lexically: `segment ('.' segment)*`, a segment `[A-Za-z][A-Za-z0-9_-]*` or `register#digits`. */
const PATH = /^[A-Za-z][A-Za-z0-9_-]*(?:#\d+)?(?:\.[A-Za-z][A-Za-z0-9_-]*(?:#\d+)?)*$/;

/**
 * `https:`, `mailto:`, `#anchor` and same-origin paths render as links. Everything else is text.
 *
 * A LEADING SLASH IS NOT THE TEST FOR SAME-ORIGIN. `//evil.com/x` starts with one, carries no
 * scheme, and is a protocol-relative URL: the browser fills in the current page's scheme and the
 * link goes to somebody else's host wearing the shape of an internal path. `/\evil.com` is the same
 * thing — the URL parser treats a backslash in the authority position as a slash. Both were passing
 * here, out of a record whose text is written by agents.
 */
export function safeHref(href: string): string | null {
  const h = href.trim();
  if (h.startsWith('#')) return h;
  if (h.startsWith('/')) return /^\/[/\\]/.test(h) ? null : h;
  if (/^https:\/\//i.test(h) || /^mailto:/i.test(h)) return h;
  return null;
}

function braced(body: string, opts: InlineOptions): Inline {
  const colon = body.indexOf(':');
  if (colon > 0) {
    const form = body.slice(0, colon).trim();
    if ((TYPED as readonly string[]).includes(form)) {
      const raw = body.slice(colon + 1).trim();
      // An argument may be a path instead of a literal: a literal starts with a digit or `-`, a
      // path with a letter.
      //
      // `ref` is the one form where that rule is not enough, because its literal argument is
      // `register#seq` and a path SEGMENT is also allowed to be `register#seq`. So `{{ref:tasks#241}}`
      // read as a path, resolved to nothing, and drew a hole where a link belonged. For `ref` the
      // `register#digits` shape is the literal; a bare name is still a path.
      const isPath = /^[A-Za-z]/.test(raw) && !(form === 'ref' && /^[a-z][a-z0-9_]*#\d+$/.test(raw));
      const arg = isPath ? (opts.resolve?.(raw) ?? null) : raw;
      if (arg === null || arg === undefined)
        return { type: 'path', path: raw, resolved: null };
      const text = formatTyped(form as TypedForm, arg, opts.now);
      if (text === null) return { type: 'unresolved', text: raw };
      const link = form === 'date' ? ('day' as const) : form === 'ref' ? ('row' as const) : undefined;
      return { type: 'typed', form: form as TypedForm, arg, text, ...(link ? { link } : {}) };
    }
  }
  const path = body.trim();
  if (!PATH.test(path)) return { type: 'unresolved', text: path };
  const value = opts.resolve?.(path);
  return { type: 'path', path, resolved: value === undefined || value === null ? null : value };
}

/**
 * A source runs to the first `}` and may not contain `|` or `}` — except a whole `{{…}}`
 * interpolation, which it may hold, tokenised once and one level deep, so a source can cite a row.
 */
function evidence(token: string): Inline | null {
  const m = /^\{(verified|inferred|estimate|unknown)(?::\s*([^}|]*))?\}$/.exec(token);
  if (!m) return null;
  const kind = m[1] as (typeof EVIDENCE)[number];
  const source = m[2]?.trim();
  return { type: 'evidence', kind, ...(source ? { source } : {}) };
}

/** One pass over a run of text, after code spans have been lifted out of it. */
function tokens(text: string, opts: InlineOptions): Inline[] {
  const out: Inline[] = [];
  let buf = '';
  const push = () => {
    if (buf) out.push({ type: 'text', text: buf });
    buf = '';
  };

  for (let i = 0; i < text.length; ) {
    if (text.startsWith('{{', i)) {
      const close = text.indexOf('}}', i + 2);
      if (close !== -1) {
        push();
        out.push(braced(text.slice(i + 2, close), opts));
        i = close + 2;
        continue;
      }
    }
    if (text[i] === '{') {
      const close = text.indexOf('}', i + 1);
      if (close !== -1) {
        const tag = evidence(text.slice(i, close + 1));
        if (tag) {
          push();
          out.push(tag);
          i = close + 1;
          continue;
        }
      }
    }
    if (text.startsWith('**', i)) {
      const close = text.indexOf('**', i + 2);
      if (close !== -1) {
        push();
        out.push({ type: 'strong', body: tokens(text.slice(i + 2, close), opts) });
        i = close + 2;
        continue;
      }
    }
    if (text[i] === '*') {
      const close = text.indexOf('*', i + 1);
      if (close !== -1) {
        push();
        out.push({ type: 'em', body: tokens(text.slice(i + 1, close), opts) });
        i = close + 1;
        continue;
      }
    }
    if (text[i] === '[') {
      const m = /^\[([^\]]*)\]\(([^)\s]*)\)/.exec(text.slice(i));
      if (m) {
        const href = safeHref(m[2]!);
        push();
        // A link the host cannot resolve is plain text, not a dead anchor (36 §13 D16).
        if (href) out.push({ type: 'link', href, body: tokens(m[1]!, opts) });
        else out.push({ type: 'text', text: m[1]! });
        i += m[0].length;
        continue;
      }
    }
    buf += text[i];
    i++;
  }
  push();
  return out;
}

export function inline(text: string, opts: InlineOptions = {}): Inline[] {
  const out: Inline[] = [];
  let rest = text;
  // Code spans first, so a literal token in backticks survives every pass below it.
  while (rest.length > 0) {
    const open = rest.indexOf('`');
    const close = open === -1 ? -1 : rest.indexOf('`', open + 1);
    if (open === -1 || close === -1) {
      out.push(...tokens(rest, opts));
      break;
    }
    out.push(...tokens(rest.slice(0, open), opts));
    out.push({ type: 'code', text: rest.slice(open + 1, close) });
    rest = rest.slice(close + 1);
  }
  return out;
}

/**
 * The magnitude of a CELL: the number in what the cell draws, never the number in what the author
 * typed.
 *
 * `magnitudeOf` says of itself that it is "for the one thing that has to read a string it just
 * wrote", and neither of the two things reading it was handing it one. `bar` and `gauge` took the
 * magnitude straight off `row.cells[1]`, which is source. So a gauge bound to `{{cash.now}}`, which
 * is how a page that stays true is written, measured as `NaN`, its bar collapsed to zero, and the
 * value column printed the author's braces; and a bar mixing `{{money:500000 GBP}}` with a literal
 * `GBP 1,200.00` compared 500000 minor units against 1200 major ones, drawing the first bar a
 * hundred times too long, in the same block, with every selector correct.
 *
 * Rendered first and read second is the only order in which the number on the screen and the
 * length of the bar beside it are the same number. Both renderers call this, for the reason the
 * bar's own comment already gives: two copies of the reading gave two answers for one cell.
 */
export const magnitudeOfCell = (cell: string, opts: InlineOptions = {}): number =>
  magnitudeOf(text(inline(cell, opts)));

/** The plain-text projection, for an accessible name, a title, or an export. */
export function text(nodes: Inline[]): string {
  return nodes
    .map((n) => {
      switch (n.type) {
        case 'text':
        case 'code':
          return n.text;
        case 'strong':
        case 'em':
        case 'link':
          return text(n.body);
        case 'path':
          return n.resolved ?? MISSING;
        case 'typed':
          return n.text;
        case 'evidence':
          return n.source ? `${n.kind}: ${n.source}` : n.kind;
        case 'unresolved':
          return n.text;
      }
    })
    .join('');
}
