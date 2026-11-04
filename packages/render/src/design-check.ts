/**
 * THE DESIGN CHECK: one check every draft passes before it is shown, the way the
 * prototypes were checked. A draft that fails is mended by the model or it is not shown, so a person is never the
 * tester of what BrainDog drew.
 *
 * WHAT IT HOLDS A DRAFT TO, each as a rule with its sentence:
 *
 * - `reads`: it reads only lists it may read. The caller says which (`reads`); left out, every list is.
 * - `fits`: it is a kind this build draws, and one that may sit where it is shown: a whole-page kind never sits inside
 *   a decision, a task or a card.
 * - `phone`: it fits a 390 px phone with nothing scrolling sideways. A composed block does by construction (the page
 *   stacks); a drawn component is read for a fixed width past the phone, a frame as wide as the window, or a part that
 *   scrolls sideways.
 * - `tokens`: it uses only the book's colours, so it reads in light and dark. A drawn component's literal colours (a
 *   hex, an `rgb()`, a named colour) and a `var(--x)` the theme does not hand in are refused.
 * - `empty`: it has its empty state. A composed block over a list says `empty:` or carries `when:`; a drawn component
 *   that reads its rows says something when there are none. Its loading state is the host's: a composed block draws
 *   from the read, and a drawn one draws its picture first.
 * - `words`: it uses his words, never the system's: no em dash, no raw id, and no heading that says row, list,
 *   register, block or entity.
 * - `budget`: it draws in budget, where the caller measured it: under 50 ms composed, and a drawn one alive within
 *   150 ms.
 * - `sizes`: a widget on a board takes a size its kind draws in (`kinds.ts` `KIND_SIZES`), a board holds at most
 *   sixteen, and where the caller drew it at its sizes (390 and 1512, light and dark) nothing was clipped mid-word and
 *   nothing ran sideways (`fitted`). The widgets plan of 29 October, §5.9.
 *
 * PURE. It reads the blocks it is handed and nothing else, so the record (Slash's drafts, the design agent's offers)
 * and the browser (Make a component) hold a draft to the same rules.
 */

import { drawnFault, DRAWN_TOKENS } from './drawn.ts';
import { isKind, isWidgetSize, KINDS, sizesOf } from './kinds.ts';
import { lintPart } from './lint.ts';

/** The phone every design fits, in CSS pixels, and what is left of it inside a page's gutters. */
export const PHONE_PX = 390;
export const PHONE_ROOM_PX = PHONE_PX - 32;

/** The budget a design draws in: composed, and a drawn component alive after its picture. */
export const DESIGN_BUDGET = { composedMs: 50, aliveMs: 150 } as const;

/** Where a draft is shown. A page holds anything; a decision, a task and a card hold a block of the page's width or less. */
export type DesignWhere = 'page' | 'decision' | 'task' | 'card';

export type DesignRule = 'reads' | 'fits' | 'phone' | 'tokens' | 'empty' | 'words' | 'budget' | 'sizes';

/** The most widgets a board holds (the kernel's `BOARD_MOST`). */
export const BOARD_MOST = 16;

/** A widget as the caller drew it at one size and width: whether anything was cut mid-word or ran past its frame. */
export type DesignFitted = { at: number; size: string; width: number; clipped: boolean; sideways: boolean };

/** One fault, at the block it is in, with the sentence that finishes "This design is not shown, because". */
export type DesignFinding = { at: number; rule: DesignRule; said: string };

/** A block as a draft declares it. Only the keys the check reads; anything else rides along. */
export type DesignBlock = {
  kind?: unknown;
  heading?: unknown;
  body?: unknown;
  empty?: unknown;
  when?: unknown;
  source?: unknown;
  code?: unknown;
  drawn?: unknown;
  added?: unknown;
  [key: string]: unknown;
};

export type DesignDraft = {
  blocks: readonly DesignBlock[];
  where?: DesignWhere;
  /** Whether the draft may read a list, by its id. Left out, it may read every list. */
  reads?: (list: string) => boolean;
  /** What drawing it took where the caller measured it, in milliseconds. */
  drewMs?: number;
  /** For a drawn component, how long after its picture it came alive. */
  aliveMs?: number;
  /** Whether the draft is a board's widgets, each with its `size`. */
  board?: boolean;
  /** Each widget as the caller drew it at its sizes, where it measured them (`sizes`). */
  fitted?: readonly DesignFitted[];
};

/** The names a drawn component may say a colour by: the theme's tokens, and the two the bridge adds. */
const TOKENS: ReadonlySet<string> = new Set([...DRAWN_TOKENS, 'accent', 'font']);

/** What is not a colour of its own: inherited, see-through, none, or the text's own. */
const NOT_A_COLOUR: ReadonlySet<string> = new Set(['transparent', 'currentcolor', 'inherit', 'initial', 'unset', 'none', 'revert']);

/** The colour names CSS knows that a draft is likeliest to reach for, which read as one colour in both themes. */
const NAMED = /\b(?:white|black|red|green|blue|yellow|orange|purple|pink|gray|grey|silver|navy|teal|maroon|olive|lime|aqua|fuchsia|brown|beige|crimson|coral|salmon|indigo|violet|tomato|wheat|ivory|khaki|lavender|plum|tan|cyan|magenta)\b/iu;
const LITERAL = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/iu;

/** Where a colour is set: a CSS property, an SVG paint attribute, or a script setting one. */
const PAINTS =
  /(?:^|[\s;{"'(,])(color|background(?:-color)?|fill|stroke|stop-color|flood-color|lighting-color|border(?:-(?:top|right|bottom|left))?(?:-color)?|outline(?:-color)?|box-shadow|text-shadow|caret-color|accent-color|text-decoration-color)\s*[:=]\s*("[^"]*"|'[^']*'|[^;}"'>\n]+)/giu;
const SCRIPT_PAINTS = /\.style\.(?:color|background(?:Color)?|fill|stroke|borderColor|outlineColor)\s*=\s*("[^"]*"|'[^']*')|setAttribute\(\s*["'](?:fill|stroke|color|stop-color)["']\s*,\s*("[^"]*"|'[^']*')/gu;

/** A width set past the phone: a CSS width, or an element's own width attribute. */
const CSS_WIDTH = /(?:^|[\s;{"'])(?:min-)?width\s*:\s*(\d+(?:\.\d+)?)px/giu;
const ATTR_WIDTH = /<(svg|img|canvas|table|div|video)\b([^>]*)>/giu;
const WINDOW_WIDE = /(?:^|[\s;{"'])(?:min-)?width\s*:\s*100vw\b/iu;
const SIDEWAYS = /overflow(?:-x)?\s*:\s*(?:scroll|auto)\b/iu;

/** A drawn component reads its rows, and says what it does when there are none. */
const READS_ROWS = /\brows\b/u;
const SAYS_EMPTY = /\brows\s*\.\s*length\b|\.length\s*===?\s*0|!\s*\w+(?:\.rows)?\.length\b/u;

/** The system's words, which a heading never says about his own things. */
const SYSTEM_WORDS = /\b(?:rows?|registers?|blocks?|entit(?:y|ies))\b/iu;

/** The line rules a draft's words are read by: what prints a dash or an id. */
const WORD_RULES = new Set(['em-dash', 'raw-id']);

const said = (v: unknown): string => (typeof v === 'string' ? v : '');
const unquote = (v: string): string => v.trim().replace(/^(["'])([\s\S]*)\1$/u, '$2').trim();

/** The colour faults in a value as written, or `null` when it names only tokens. */
function paintFault(value: string): string | null {
  const v = unquote(value);
  for (const m of v.matchAll(/var\(\s*--([a-z0-9-]+)/giu)) if (!TOKENS.has(m[1]!.toLowerCase())) return `--${m[1]}, a colour the book does not have`;
  /* A URL IS A PAINT SERVER OR A PICTURE, never a colour of its own: `url(#fade)` is the SVG's own gradient. */
  const bare = v.replace(/url\([^)]*\)/giu, '').replace(/var\([^)]*\)/giu, '');
  const lit = LITERAL.exec(bare);
  if (lit) return lit[0].replace(/\($/u, '()');
  const named = NAMED.exec(bare);
  if (named && !NOT_A_COLOUR.has(named[0].toLowerCase())) return named[0].toLowerCase();
  return null;
}

/** What a drawn component's code does that the check refuses, each once by rule. */
function codeFindings(code: string, at: number): DesignFinding[] {
  const out: DesignFinding[] = [];
  const fault = drawnFault(code);
  if (fault) out.push({ at, rule: 'fits', said: fault });

  let colour: string | null = null;
  for (const m of code.matchAll(PAINTS)) {
    colour = paintFault(m[2] ?? '');
    if (colour) break;
  }
  if (!colour)
    for (const m of code.matchAll(SCRIPT_PAINTS)) {
      colour = paintFault(m[1] ?? m[2] ?? '');
      if (colour) break;
    }
  if (colour) out.push({ at, rule: 'tokens', said: `it uses ${colour} where the book's colours go, so it would not read in both light and dark. Use the theme's tokens, such as var(--ink) and var(--red).` });

  let wide = 0;
  for (const m of code.matchAll(CSS_WIDTH)) wide = Math.max(wide, Number(m[1]));
  for (const m of code.matchAll(ATTR_WIDTH)) {
    const attrs = m[2] ?? '';
    /* AN SVG WITH A VIEWBOX SCALES TO ITS BOX, so its width is a ratio and not a size. */
    if (/\bviewBox\s*=/iu.test(attrs)) continue;
    const w = /\bwidth\s*=\s*["']?(\d+(?:\.\d+)?)(?:px)?["']?/iu.exec(attrs);
    if (w) wide = Math.max(wide, Number(w[1]));
  }
  if (wide > PHONE_ROOM_PX) out.push({ at, rule: 'phone', said: `it is ${Math.round(wide)} px wide, wider than a ${PHONE_PX} px phone, so it would scroll sideways. Size it in percent or give its SVG a viewBox.` });
  else if (WINDOW_WIDE.test(code)) out.push({ at, rule: 'phone', said: 'it is as wide as the window, not the tile it sits in, so it would run past its edge on a phone.' });
  else if (SIDEWAYS.test(code)) out.push({ at, rule: 'phone', said: `it scrolls sideways, and nothing on a ${PHONE_PX} px phone does. Wrap it, or draw less.` });

  if (READS_ROWS.test(code) && !SAYS_EMPTY.test(code))
    out.push({ at, rule: 'empty', said: 'it draws nothing when there are no entries. Say so in words when data.rows is empty.' });
  return out;
}

/**
 * Every fault in a draft, in block order, each block's rules once. Empty when the draft may be shown.
 *
 * A BLOCK ANOTHER PACK LAYS ON THE PAGE (`added`) AND ONE THE PAGE DOES NOT DRAW (`drawn: false`) are not the draft's,
 * so neither is read.
 */
export function designCheck(draft: DesignDraft): DesignFinding[] {
  const where = draft.where ?? 'page';
  const out: DesignFinding[] = [];
  for (const [at, b] of draft.blocks.entries()) {
    if (b === null || typeof b !== 'object' || b.added !== undefined || b.drawn === false) continue;
    const kind = said(b.kind);
    if (!isKind(kind)) {
      out.push({ at, rule: 'fits', said: `"${kind || 'nothing'}" is not a kind of block BrainDog draws.` });
      continue;
    }
    const spec = KINDS[kind];
    if (where !== 'page' && spec.pageOnly === true) out.push({ at, rule: 'fits', said: `a ${kind} block takes a whole page, and cannot sit inside a ${where}.` });

    const source = said(b.source);
    const list = source.startsWith('register.') ? source.slice('register.'.length) : null;
    if (list !== null && draft.reads && !draft.reads(list)) out.push({ at, rule: 'reads', said: `it reads ${list}, a list it may not read.` });

    const drawsRows = source !== '' && (spec.purpose === 'list' || spec.purpose === 'plan');
    if (drawsRows && said(b.empty).trim() === '' && b.when === undefined) out.push({ at, rule: 'empty', said: 'it says nothing when it has nothing to show. Give it the words it says then.' });

    if (kind === 'drawn' && typeof b.code === 'string' && b.code.trim() !== '') out.push(...codeFindings(b.code, at));

    if (b.size !== undefined || draft.board === true) {
      const size = b.size;
      const can = sizesOf(kind);
      if (size !== undefined && !isWidgetSize(size)) out.push({ at, rule: 'sizes', said: `its size is ${JSON.stringify(size)}, and a widget is small, wide, tall, large or full.` });
      else if (size !== undefined && !can.includes(size)) out.push({ at, rule: 'sizes', said: `a ${kind} is not drawn ${size}; it can be ${can.join(', ')}.` });
    }

    const heading = said(b.heading);
    if (SYSTEM_WORDS.test(heading)) out.push({ at, rule: 'words', said: `its heading "${heading.trim()}" says the system's word. Name the person's own things instead.` });
    for (const [name, text] of [
      [heading.trim() || 'its heading', heading],
      ['its words', said(b.body)],
      ['what it says when empty', said(b.empty)],
    ] as const) {
      if (text.trim() === '') continue;
      const hit = lintPart({ name, text }).find((f) => WORD_RULES.has(f.rule));
      if (hit) {
        out.push({ at, rule: 'words', said: `${name} ${hit.rule === 'em-dash' ? 'has an em dash; say it with a comma or a full stop' : 'prints an id where a name goes'}.` });
        break;
      }
    }
  }
  if (draft.board === true) {
    const widgets = draft.blocks.filter((b) => b !== null && typeof b === 'object' && b.size !== undefined).length;
    if (widgets > BOARD_MOST) out.push({ at: 0, rule: 'sizes', said: `the board holds ${widgets} widgets, and a board holds ${BOARD_MOST} at most.` });
  }
  for (const f of draft.fitted ?? []) {
    if (f.sideways) out.push({ at: f.at, rule: 'sizes', said: `drawn ${f.size} at ${f.width} px it runs past its frame. Draw less at that size, or take the size off.` });
    else if (f.clipped) out.push({ at: f.at, rule: 'sizes', said: `drawn ${f.size} at ${f.width} px a word or a figure is cut. Show fewer things at that size.` });
  }
  if (draft.drewMs !== undefined && draft.drewMs > DESIGN_BUDGET.composedMs)
    out.push({ at: 0, rule: 'budget', said: `it took ${Math.round(draft.drewMs)} ms to draw, past the ${DESIGN_BUDGET.composedMs} ms a design has.` });
  if (draft.aliveMs !== undefined && draft.aliveMs > DESIGN_BUDGET.aliveMs)
    out.push({ at: 0, rule: 'budget', said: `it came alive ${Math.round(draft.aliveMs)} ms after its picture, past the ${DESIGN_BUDGET.aliveMs} ms a drawn one has.` });
  const seen = new Set<string>();
  return out.filter((f) => {
    const k = `${f.at}\n${f.rule}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** What a person reads of a draft that is not shown: its first fault, as one sentence. `null` when it passed. */
export function designSentence(findings: readonly DesignFinding[]): string | null {
  const first = findings[0];
  return first === undefined ? null : `This design is not shown, because ${first.said}`;
}
