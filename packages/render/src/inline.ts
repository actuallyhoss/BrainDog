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
 *
 * `{{bad:words}}` IS THE ONE FORM THAT HOLDS OTHER TOKENS, so it is the one form that does not close
 * on the first `}}` after it. See `pairs`.
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
  /**
   * A phrase in the danger colour, `{{bad:three days overdue}}`. Its words are inline text, so a path, a
   * typed value and a bold run inside read as they do outside; one `bad` never holds another.
   *
   * `bad` IS THE ONLY COLOUR WITH A FORM, and it is a word about the thing and not a paint: there is no `good`, no
   * `red`, no `warn`. The words carry the meaning and the colour repeats it, so a phrase is never colour alone.
   */
  | { type: 'bad'; body: Inline[] }
  /**
   * A live figure. `resolved` is null when the record holds no value; the renderer draws an em dash.
   *
   * `named: false` IS A PATH THAT NAMES NOTHING (`UNNAMED`): no figure, list, row or field of the record answers to
   * it, so there is no value to wait for and no hole to fill. In prose it is the author's text, dotted, as any token
   * that was not one; as the figure of a chip, a tile or a bar it is left out. Absent on every path that names
   * something, so a named path with no value keeps its dash.
   */
  | { type: 'path'; path: string; resolved: string | null; named?: false }
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

/**
 * What a resolver answers for a path that names nothing of the record (the kernel's `unnamed`), as against `null`
 * for a path that names something with no value yet. Two answers because they are two faults: his pages drew 48
 * "Open tasks —" for paths that will never hold a value, the same word and dash as a figure still to come.
 *
 * `Symbol.for`, so a host holding a second copy of this package (the built one beside the source) answers the
 * same constant.
 */
export const UNNAMED: unique symbol = Symbol.for('braindog-render.unnamed');

export type Resolve = (path: string) => string | null | undefined | typeof UNNAMED;

export type InlineOptions = {
  resolve?: Resolve;
  now?: number;
  /** The reader's zone, an IANA name, that "today" is counted in; absent, the browser's own, else UTC. */
  zone?: string;
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
  /**
   * The host's drawings that arrive after the page: settles once `icon` can answer every name the set holds.
   *
   * THE SET IS A CHUNK OF ITS OWN (`glyphs/index.ts`), so a host answering `icon` from what it has in hand
   * answers `null` for `circle-check` until the chunk lands, and a drawer that asked once keeps its slot
   * empty for good. A live drawer whose `icon` answered `null` for a glyph name waits on this once and asks
   * again, as the app's `Icon` does (`glyphWaits`). `toHTML` is one pass and never waits: its slot stays
   * the named, empty span a host without the set has always had.
   */
  iconSet?: () => Promise<unknown>;
  /**
   * `away`: a link is drawn only where it leaves the record, an https address or a mailto, and a path into the record
   * is drawn as its words. A shared page passes it (review 30 Oct, R10): whoever holds its link is no reader of the
   * record, so a link into it leads only to a sign-in, and a shared page never links into the record. It holds for a
   * note's words, every cell drawn as words, a `link` list and a `capture`'s "add it there". Absent, every safe link
   * is drawn.
   */
  links?: 'away';
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

/**
 * Whether a slot that drew nothing for `name` should wait on the host's set and ask again: the name is a
 * glyph, the host has no drawing for it yet, and the host says its drawings are still arriving. A name
 * that is no glyph never waits, so `constructor` reaches neither `icon` nor `iconSet`.
 */
export const glyphWaits = (name: string, opts: InlineOptions): boolean =>
  opts.iconSet !== undefined && glyphName(name) !== null && glyphPath(name, opts) === null;

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
 *
 * NO CONTROL CHARACTER ANYWHERE IN IT. The URL parser drops every tab, line feed and carriage return before it reads
 * an address, so `/\t/evil.example` passed the slash test above as a path and reached the browser as `//evil.example`.
 * Nothing a person writes as a link carries a control character, so any of them (C0, DEL and C1) is refused outright.
 */
export function safeHref(href: string): string | null {
  const h = href.trim();
  if (/\p{Cc}/u.test(h)) return null;
  if (h.startsWith('#')) return h;
  if (h.startsWith('/')) return /^\/[/\\]/.test(h) ? null : h;
  if (/^https:\/\//i.test(h) || /^mailto:/i.test(h)) return h;
  return null;
}

/** A safe address as `opts` draw it: `null` for one that stays in the record where only links away are drawn (`links`). */
export const drawnLink = (href: string | null, opts: Pick<InlineOptions, 'links'>): string | null =>
  href !== null && opts.links === 'away' && !/^(?:https:\/\/|mailto:)/iu.test(href) ? null : href;

/**
 * `{{money:<path>}}` OVER A FIGURE THE HOST ALREADY WROTE: a money figure or a row's money field is answered as the
 * amount written (`EGP 12,400.00`, `£1,200.00`, one amount a currency joined by ` · `, a day after it when it is old),
 * never as minor units and a code. So the written amount is drawn as it came. A bare number is no amount (money is never
 * a number alone), and stays the author's text, marked. Two currencies are never added here: the host writes them apart.
 */
function writtenAmount(form: string, said: string): string | null {
  /* `{{day:<path>}}` OVER A DAY FIGURE THE HOST ALREADY SAID ("15 Jan", "1 Mar 2028") is that day as said: the page drew
     the figure's own id in its place, "Next payout certificates-next-payout.", because the said day is no ISO day. */
  if ((form === 'day' || form === 'date') && /\d/u.test(said) && /\p{L}/u.test(said)) return said.trim();
  if (form !== 'money') return null;
  const t = said.trim();
  if (!/\d/u.test(t) || /^[-−+]?[\d,.\s]+$/u.test(t)) return null;
  return t;
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
      if (arg === UNNAMED) return { type: 'path', path: raw, resolved: null, named: false };
      if (arg === null || arg === undefined)
        return { type: 'path', path: raw, resolved: null };
      const typed = formatTyped(form as TypedForm, arg, opts.now, opts.zone);
      const text = typed ?? (isPath ? writtenAmount(form, arg) : null);
      if (text === null) return { type: 'unresolved', text: raw };
      /* A DAY THE HOST SAID IN WORDS IS NO ADDRESS, so only a day this form read itself links. */
      const link = typed === null ? undefined : form === 'date' ? ('day' as const) : form === 'ref' ? ('row' as const) : undefined;
      return { type: 'typed', form: form as TypedForm, arg, text, ...(link ? { link } : {}) };
    }
  }
  const path = body.trim();
  /* A FIGURE ASKED WITH ITS PARAMETER, `{{plan-left:Flat}}`, is not lexically a path, and the record answers it keyed
     by the hole as written. The first colon separates, as it does in a figure cell, so a parameter may hold a colon
     or a full stop. Only an answer makes it a path: words nobody answered (`{{config:book}}`) stay the author's text. */
  if (colon > 0 && /^[a-z][a-z0-9_-]*$/.test(body.slice(0, colon).trim()) && body.slice(colon + 1).trim() !== '') {
    const asked = opts.resolve?.(path);
    if (typeof asked === 'string') return { type: 'path', path, resolved: asked };
  }
  if (!PATH.test(path)) return { type: 'unresolved', text: path };
  const value = opts.resolve?.(path);
  if (value === UNNAMED) return { type: 'path', path, resolved: null, named: false };
  return { type: 'path', path, resolved: value === undefined || value === null ? null : dayInWords(value) };
}

const MONTH_WORDS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/**
 * A FIGURE THAT IS A BARE DAY IS SAID AS A PERSON SAYS ONE: `2027-01-13` in a sentence read "cash lasts to 2027-01-13",
 * where a tile's cell under it said "Until 13 Jan 2027". Only a value that is a day and nothing else; anything else is
 * drawn as the record wrote it.
 */
export function dayInWords(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value.trim());
  if (m === null) return value;
  const month = MONTH_WORDS[Number(m[2]) - 1];
  return month === undefined ? value : `${Number(m[3])} ${month} ${m[1]}`;
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

/** `{{bad:`, with the space `{{ icon: rocket }}` is allowed. Sticky, so it is asked at one place and scans nothing. */
const BAD = /\{\{\s*bad\s*:/y;

/**
 * Where each `{{` closes, counting the ones inside it: the opener's place to the place of its `}}`.
 *
 * ONLY `{{bad:` ASKS, because it is the only form whose body holds tokens: `{{bad:{{tasks.late}} late}}` read to
 * the first `}}` is `bad:{{tasks.late`, which is how it drew before there was a form. Every other token still
 * closes on the first `}}`, so no tree that parsed before this parses differently.
 *
 * ONE PASS, ASKED FOR ONCE A RUN and only by a run that holds a `{{bad:`, for the reason `seeker` gives: counting
 * depth afresh from each opener is the square of the length on a text of nothing but openers.
 *
 * AN ODD RUN OF `}` GIVES ITS FIRST ONE AWAY. `{{bad:late {estimate}}}` ends on three: the tag's one and the
 * form's two. Read left to right the form would close a brace early and leave `}` on the page.
 */
function pairs(text: string): Map<number, number> {
  const closes = new Map<number, number>();
  const open: number[] = [];
  for (let i = 0; i < text.length; ) {
    if (text.startsWith('{{', i)) {
      open.push(i);
      i += 2;
    } else if (text[i] === '}') {
      let end = i;
      while (text[end] === '}') end++;
      for (let at = i + ((end - i) % 2); at < end && open.length > 0; at += 2) closes.set(open.pop()!, at);
      i = end;
    } else i++;
  }
  return closes;
}

/**
 * One pass over a run of text, after code spans have been lifted out of it.
 *
 * `held` is true for the words of a `{{bad:…}}` and everything inside them. A `bad` in there is the author's
 * text, so the reader goes one level down and no further, whatever it is handed.
 */
/**
 * A ROW'S HANDLE WRITTEN BARE IN PROSE, `tasks#404`, as an agent writes it into a note: never inside an address, a
 * file's path (`file:parts#2/photo`) or a longer word. It is drawn as `{{ref:tasks#404}}` is, the row's number linked
 * where the host can link it, so a project's note never prints a register's key where a name goes.
 */
const BARE_HANDLE = /(?<![\w:/#.@-])[a-z][a-z0-9_]*#\d+(?![\w/#-])/gu;

/** Plain text, with each bare handle in it drawn as a `ref`. */
function plainRun(text: string, opts: InlineOptions): Inline[] {
  if (!text.includes('#')) return [{ type: 'text', text }];
  const out: Inline[] = [];
  let at = 0;
  for (const m of text.matchAll(BARE_HANDLE)) {
    const shown = formatTyped('ref', m[0], opts.now, opts.zone);
    if (shown === null) continue;
    if (m.index > at) out.push({ type: 'text', text: text.slice(at, m.index) });
    out.push({ type: 'typed', form: 'ref', arg: m[0], text: shown, link: 'row' });
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push({ type: 'text', text: text.slice(at) });
  return out;
}

function tokens(text: string, opts: InlineOptions, held = false): Inline[] {
  const out: Inline[] = [];
  let buf = '';
  const push = () => {
    if (buf) out.push(...plainRun(buf, opts));
    buf = '';
  };

  const endOfPath = seeker(text, '}}');
  const endOfTag = seeker(text, '}');
  const endOfStrong = seeker(text, '**');
  const endOfEm = seeker(text, '*');
  const endOfLabel = seeker(text, ']');
  const endOfHref = seeker(text, ')');
  let closes: Map<number, number> | undefined;

  for (let i = 0; i < text.length; ) {
    if (text.startsWith('{{', i)) {
      BAD.lastIndex = i;
      if (!held && BAD.test(text)) {
        const from = BAD.lastIndex;
        const close = (closes ??= pairs(text)).get(i);
        // No words is no phrase: `{{bad:}}` falls through and is the author's text, dotted.
        const words = close === undefined ? '' : text.slice(from, close).trim();
        if (close !== undefined && words) {
          push();
          out.push({ type: 'bad', body: tokens(words, opts, true) });
          i = close + 2;
          continue;
        }
      }
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
        out.push({ type: 'strong', body: tokens(text.slice(i + 2, close), opts, held) });
        i = close + 2;
        continue;
      }
    }
    if (text[i] === '*') {
      const close = endOfEm(i + 1);
      if (close !== -1) {
        push();
        out.push({ type: 'em', body: tokens(text.slice(i + 1, close), opts, held) });
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
          const safe = safeHref(raw);
          const href = drawnLink(safe, opts);
          push();
          // A link the host cannot resolve is plain text, not a dead anchor (36 §13 D16).
          if (href) out.push({ type: 'link', href, body: tokens(label, opts, held) });
          // A path into the record where only links away are drawn is its words, as the author wrote them (`links`).
          else if (safe) out.push(...tokens(label, opts, held));
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
export const magnitudeOfCell = (cell: string, opts: InlineOptions = {}): number => {
  const nodes = inline(cell, opts);
  /* A PATH THAT NAMES NOTHING IS NO NUMBER, whatever digits its own name holds: `q3.revenue2025` is not 2025. */
  return namesNothing(nodes) ? Number.NaN : magnitudeOf(text(nodes));
};

/**
 * Whether a run holds a path that names nothing (`UNNAMED`), at any depth. A figure that does is left out of a chip,
 * a tile and a bar in both drawers (`drawnRows` in `html.ts`), since half a figure read off a path that will never
 * answer is not a figure.
 */
export const namesNothing = (nodes: readonly Inline[]): boolean =>
  nodes.some((n) => (n.type === 'path' ? n.named === false : 'body' in n ? namesNothing(n.body) : false));

/** `namesNothing` for a cell as the author typed it. */
export const cellNamesNothing = (cell: string | undefined, opts: InlineOptions = {}): boolean =>
  cell !== undefined && cell.includes('{{') && namesNothing(inline(cell, opts));

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
        case 'bad':
          return text(n.body);
        case 'path':
          /* The author's text for a path that names nothing, as it is drawn: there is no value to be missing. */
          return n.named === false ? n.path : (n.resolved ?? MISSING);
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
