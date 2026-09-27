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
import { canonical } from './glyphs/aliases.ts';
import { GLYPH_NAMES } from './glyphs/names.ts';

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
  /**
   * A glyph named in the text, `{{icon:rocket}}`. `name` is always one `GLYPH_NAMES` holds: the name
   * as written when it is one, else the glyph its alias stands for. A name the set does not hold is
   * `unresolved` instead, so no drawer is ever handed a name it has to doubt.
   */
  | { type: 'icon'; name: string }
  /** Anything that looked like a token and was not. Drawn as the author's text, dotted. */
  | { type: 'unresolved'; text: string };

export type Resolve = (path: string) => string | null | undefined;

export type InlineOptions = {
  resolve?: Resolve;
  now?: number;
  /**
   * The drawing for a glyph name, as SVG path data in a 24 box, or `null` for none.
   *
   * THE RENDERER SHIPS NO GLYPH ART (05 §3, invariant 2), so the host answers this. Absent, or
   * answering `null`, an inline glyph is drawn as a named, empty `data-glyph` span and a glyph slot
   * stays as empty as it has always been; with an answer, both draw the path in `currentColor`. The
   * web app answers from its own drawings and the set; a host that wants the same art without the app
   * can answer from `braindog-render/glyphs`.
   */
  icon?: (name: string) => string | null;
};

/**
 * The name a glyph is drawn by, for a name a document wrote, or `null` when there is no such glyph.
 *
 * THE NAME AS WRITTEN WINS when the set holds it, so `home` stays the app's own drawing rather than
 * becoming the core's `house`; only a name the set does not hold is looked up as an alias. Both steps
 * ask a `Set` and an `Object.hasOwn`, never `in`, so `constructor` is no glyph at all.
 */
export function glyphName(name: string): string | null {
  const n = name.trim();
  if (GLYPH_NAMES.has(n)) return n;
  const alias = canonical(n);
  return GLYPH_NAMES.has(alias) ? alias : null;
}

/**
 * The path data to draw `name` with, or `null` when it names no glyph or the host has no drawing for
 * it. The one question both drawers ask, for an inline glyph, a section's glyph and a chip's, so the
 * two renderers cannot come to different answers about the same slot. An empty answer is no answer.
 */
export function glyphPath(name: string, opts: InlineOptions): string | null {
  const known = glyphName(name);
  const d = known === null ? null : (opts.icon?.(known) ?? null);
  return d ? d : null;
}

/* WHAT FOLLOWS AN INLINE GLYPH IS HELD TO IT, so a line never ends on a glyph and starts again with the
   word it belongs to. A space after it becomes a no-break space; anything else that touches it gets
   a word joiner in front, because a browser may break on either side of an inline picture. */
const NO_BREAK_SPACE = String.fromCharCode(0x00a0);
const WORD_JOINER = String.fromCharCode(0x2060);

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
    /* `icon` IS NOT A TYPED FORM. A typed form formats a value, and a glyph has no value to format:
       its argument is a name and never a path, so `{{icon:rocket}}` is not read as the path `rocket`.
       An unknown name is the author's text, dotted, like any other token that was not one. */
    if (form === 'icon') {
      const name = glyphName(body.slice(colon + 1));
      return name === null ? { type: 'unresolved', text: body.trim() } : { type: 'icon', name };
    }
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

/**
 * WHERE THE NEXT `needle` IS, REMEMBERED, and the reason this function exists is a measurement.
 *
 * Every opener below asks "where does this close", and each asked with a fresh `indexOf` that scans
 * to the end of the text when the answer is nowhere. A document does not have to be malformed for
 * that to hurt: it is the SAME question re-asked at every character, so the cost is the square of
 * the length. Measured on this file before the change, with nothing but the opener repeated:
 *
 *   80,000 `[`                 3,745 ms
 *   40,000 `[` and one `]`       998 ms
 *   40,000 `[](`              3,905 ms
 *   200,000 `{`               1,158 ms
 *
 * Eighty kilobytes of one character is not a big note, and a megabyte of it is minutes with the tab
 * unresponsive, out of a record whose text agents write. Two facts make the memo exact rather than a
 * heuristic. `from` only ever moves forward, so a hit at or after an earlier `from` is still the
 * FIRST hit at or after a later one, because there is nothing between them. And `-1` is permanent:
 * no occurrence at or after `from` means none at or after anything past it. Each rescan therefore
 * covers a stretch the next rescan starts beyond, so the whole pass is linear in the text.
 *
 * Measured after: 2.3 ms, 1.0 ms, 2.4 ms and 4.4 ms, in the order above.
 *
 * WHAT IT COSTS AN ORDINARY LINE IS 11 TO 20 PER CENT, and the earlier figure of 3 per cent in this
 * comment did not reproduce. Six closures are allocated per call to `tokens`, and `tokens` is called
 * once per gap between code spans and once per emphasis body, so the cost is per call and not per
 * character: over 200,000 renders, a plain sentence with no tokens in it went 125 ms to 143 ms, the
 * sentence carrying a bold run, a link, an interpolation, an emphasis, an evidence tag and a code
 * span went 190 ms to 211 ms, and a bare `**a** [b](/c) {{d}} *e*` went 103 ms to 123 ms. That is
 * a tenth of a microsecond a cell against a quadratic, so it is the right trade, and it is not free.
 * Holding the six positions in `let`s instead, with the memo written out at each of the six call
 * sites, recovers most of it (104 ms, 197 ms) and was not taken: this is the version a reader can
 * check, and 0.1 microseconds is not worth six copies of the same three lines.
 *
 * And the trees are identical: 320,000 random strings over this alphabet, half of them up to 60
 * characters of nothing but brackets, parentheses, slashes and backslashes, were drawn through both
 * versions with zero differences, and `render.test.ts` and `parity.test.ts` pass unchanged.
 */
const seeker = (text: string, needle: string) => {
  let at = -2;
  return (from: number): number => {
    if (at !== -1 && at < from) at = text.indexOf(needle, from);
    return at;
  };
};

/** One pass over a run of text, after code spans have been lifted out of it. */
function tokens(text: string, opts: InlineOptions): Inline[] {
  const out: Inline[] = [];
  let buf = '';
  const push = () => {
    if (buf) out.push({ type: 'text', text: buf });
    buf = '';
  };

  const endOfPath = seeker(text, '}}');
  const endOfTag = seeker(text, '}');
  const endOfStrong = seeker(text, '**');
  const endOfEm = seeker(text, '*');
  const endOfLabel = seeker(text, ']');
  const endOfHref = seeker(text, ')');

  for (let i = 0; i < text.length; ) {
    if (text.startsWith('{{', i)) {
      const close = endOfPath(i + 2);
      if (close !== -1) {
        push();
        const node = braced(text.slice(i + 2, close), opts);
        out.push(node);
        i = close + 2;
        if (node.type === 'icon' && i < text.length) {
          if (text[i] === ' ') {
            buf = NO_BREAK_SPACE;
            i++;
          } else buf = WORD_JOINER;
        }
        continue;
      }
    }
    if (text[i] === '{') {
      const close = endOfTag(i + 1);
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
      const close = endOfStrong(i + 2);
      if (close !== -1) {
        push();
        out.push({ type: 'strong', body: tokens(text.slice(i + 2, close), opts) });
        i = close + 2;
        continue;
      }
    }
    if (text[i] === '*') {
      const close = endOfEm(i + 1);
      if (close !== -1) {
        push();
        out.push({ type: 'em', body: tokens(text.slice(i + 1, close), opts) });
        i = close + 1;
        continue;
      }
    }
    if (text[i] === '[') {
      /* `[label](href)`, READ BY HAND RATHER THAN BY `/^\[([^\]]*)\]\(([^)\s]*)\)/`, and it is the
         same grammar spelled so the memo above can be used. The pattern was run against
         `text.slice(i)`, which copied the rest of the note at every `[` and then scanned it for a
         `]` that is often not there: two quadratics on one line. Cell for cell: a label is
         everything up to the first `]`, because `[^\]]` cannot cross one; an href is everything up
         to the first `)`, because `[^)\s]` cannot cross one either, and it must hold no whitespace,
         which is the rest of that class. */
      const shut = endOfLabel(i + 1);
      if (shut !== -1 && text[shut + 1] === '(') {
        const end = endOfHref(shut + 2);
        const raw = end === -1 ? null : text.slice(shut + 2, end);
        if (raw !== null && !/\s/u.test(raw)) {
          const label = text.slice(i + 1, shut);
          const href = safeHref(raw);
          push();
          // A link the host cannot resolve is plain text, not a dead anchor (36 §13 D16).
          if (href) out.push({ type: 'link', href, body: tokens(label, opts) });
          else out.push({ type: 'text', text: label });
          i = end + 1;
          continue;
        }
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
        /* NOTHING, because the words beside a glyph carry what it means, and this projection is also
           read for numbers: a trend, a split and a bar parse it, and a glyph's name is no part of any
           figure. The drawn glyph still names itself, with its own `aria-label`. */
        case 'icon':
          return '';
        case 'unresolved':
          return n.text;
      }
    })
    .join('');
}
