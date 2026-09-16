/**
 * `toHTML` — the framework-free renderer.
 *
 * It is NOT a server render. It serves the mirror, the exports, the tests and the digest email; the
 * app draws blocks through `braindog-render/svelte` inside a static shell (05 §1, ADR-066). The two
 * exist so the parity gate can assert they produce the same accessibility tree, which is what makes
 * two renderers one renderer.
 *
 * The markup contract, whole: every block is one `<figure>` carrying its kind, its primitive and its
 * tone as data attributes, with the heading as its `<figcaption>`; a cell is a `<span>` named for
 * the cell it is. That is all a host's stylesheet draws against (05 §7.7).
 *
 * ONE escape function, used on every value, and the only inline `style` values in the output are
 * `--cells` and `--magnitude`, both numbers this file formats itself.
 */

import { KINDS, TONES, type Kind } from './kinds.ts';
import { inline, magnitudeOfCell, text as plain, type Inline, type InlineOptions } from './inline.ts';
import { MISSING, leadingCode, symbolFigure, symbolText, valueWord } from './format.ts';
import { CARDS_NONE, FOLD_HIDE, FOLD_SHOW, TREND, cardLayout, counted, initialOf, isQuiet, markOf, ringDash, ringOf, trendOf } from './cards.ts';
import { FEED_EARLIER, feedNew, feedPlan } from './feed.ts';
import { DIFF_GLYPHS, DIFF_WORDS, diffFolded, diffPlan, type DiffLine } from './diff.ts';
import type { Block, Degraded, Markdown, Row, Segment } from './parse.ts';

export type RenderOptions = InlineOptions & {
  /** Turn a spoken id into an address. A link the host cannot resolve renders as plain text. */
  link?: (spoken: string) => string | null;
  /**
   * Where a figure's rows are, by its position in the block. `null` is "nowhere to go".
   *
   * A FIGURE THAT IS NOT A DOOR IS A DEAD END. "Overdue · GBP 2,340.00" is a number somebody
   * immediately wants the four rows behind, and every stat tile in this product was a `<div>` — so
   * the one derivation that guarantees a tile and its list cannot disagree shipped behind something
   * unclickable. It is per-INDEX rather than per-metric because the dialect is text: a block's rows
   * are in the order its cells named them, and that order is the only handle there is.
   */
  cellHref?: (index: number) => string | null;
  /**
   * Where a date goes, if anywhere. `null` is "nowhere", which renders as the plain figure.
   *
   * THE RENDERER DOES NOT INVENT ROUTES. This was hard-coded to `/calendar/<day>`, an address no
   * host in this workspace serves — so every `{{date:}}` in a document was an anchor to the error
   * page, and the one in the seed's own note put it on a row somebody reaches in two clicks. `row`
   * has asked the host since it was written; a date is the same question and had been answered by
   * guessing.
   */
  dayHref?: (iso: string) => string | null;
  /**
   * What to do about a hole, if the host can do anything.
   *
   * A HOLE IS A TASK AND A BUTTON IS A PROMISE. 05 §7.5 is right that an unknown is an affordance
   * rather than a value — but the affordance was rendered as a `<button>` with no handler on either
   * side of the parity boundary, so a real tab stop, styled as a control, did nothing on every
   * document that had one. Absent this, it renders as a marked span: still visibly a gap, no longer
   * a control that lies.
   *
   * The HTML renderer takes the same key and reads only its presence, so the two trees stay
   * identical and the parity gate keeps meaning something.
   */
  hole?: ((path: string | null) => void) | true;
};

/**
 * A hole's label, as prose rather than as an address.
 *
 * IT PRINTED THE DOTTED PATH — `obligations.oldest_overdue` — in the middle of a sentence somebody
 * is reading. That is the author's vocabulary, not the reader's, and it appears exactly where the
 * reader is already confused. The last segment, unpunctuated, says what is missing; the whole path
 * stays in `data-path` for whoever is fixing it.
 */
export const holeLabel = (path: string): string => (path.split('.').at(-1) ?? path).replace(/_/g, ' ');

export const escape = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Two decimals, always, so the value is a number and the assertion over it is one regex. */
const magnitude = (v: number): string => Math.max(0, Math.min(1, v)).toFixed(2);

function renderInline(nodes: Inline[], opts: RenderOptions): string {
  return nodes
    .map((n) => {
      switch (n.type) {
        case 'text':
          return escape(n.text);
        case 'code':
          return `<code>${escape(n.text)}</code>`;
        case 'strong':
          return `<strong>${renderInline(n.body, opts)}</strong>`;
        case 'em':
          return `<em>${renderInline(n.body, opts)}</em>`;
        case 'link':
          return `<a href="${escape(n.href)}">${renderInline(n.body, opts)}</a>`;
        case 'path':
          // A path that names nothing renders as the path, marked, and it is an AFFORDANCE: an
          // unknown is a hole, and a hole is a task somebody has to close (05 §7.5).
          if (n.resolved !== null) return `<span class="figure num">${escape(n.resolved)}</span>`;
          return opts.hole
            ? `<button type="button" class="hole" data-path="${escape(n.path)}">${escape(holeLabel(n.path))} ${MISSING}</button>`
            : `<span class="hole" data-path="${escape(n.path)}">${escape(holeLabel(n.path))} ${MISSING}</span>`;
        case 'typed': {
          const href = n.link === 'row' ? opts.link?.(n.arg) : n.link === 'day' ? opts.dayHref?.(n.arg) : null;
          const body = `<span class="typed num" data-form="${n.form}">${escape(n.text)}</span>`;
          return href ? `<a href="${escape(href)}">${body}</a>` : body;
        }
        case 'evidence':
          // `{unknown}` is not a weak claim, it is a hole, so it renders as an affordance.
          return n.kind === 'unknown'
            ? opts.hole
              ? `<button type="button" class="hole">unknown</button>`
              : `<span class="hole">unknown</span>`
            : `<span class="evidence" data-evidence="${n.kind}"${n.source ? ` title="${escape(n.source)}"` : ''}>${n.kind}${n.source ? `: ${escape(n.source)}` : ''}</span>`;
        case 'unresolved':
          return `<span class="unresolved">${escape(n.text)}</span>`;
      }
    })
    .join('');
}

const cell = (name: string, value: string | undefined, opts: RenderOptions, extra = ''): string =>
  `<span class="${name}"${extra}>${value ? renderInline(inline(value, opts), opts) : ''}</span>`;

/** The intent reaches the DOM only as `data-intent` plus its glyph. There is no other path. */
const toneAttrs = (tone?: string): string => (tone ? ` data-intent="${tone}"` : '');

const toneGlyph = (tone?: string): string => {
  if (!tone || !Object.hasOwn(TONES, tone)) return '';
  const t = TONES[tone as keyof typeof TONES];
  return `<span class="glyph" role="img" aria-label="${t.label}">${t.glyph}</span>`;
};

/* ── the eight primitives ─────────────────────────────────────────────────── */

function panel(b: Block, o: RenderOptions): string {
  if (b.kind === 'section') return section(b, o);
  if (b.kind === 'quote') {
    const r = b.rows[0] ?? { cells: [] };
    return `<blockquote class="panel">${cell('quote-text', r.cells[0], o)}${r.cells[1] ? `<cite class="quote-by">${escape(r.cells[1])}</cite>` : ''}</blockquote>`;
  }
  // `note` is the only drawn kind in the `measure` class, because it is the only one that may
  // contain a paragraph. Prose in any other block is unreadable, and the heading is a KICKER —
  // two or three words, small caps; the sentence goes in the body (05 §7.4).
  const paragraphs: string[][] = [[]];
  for (const r of b.rows) {
    const line = r.cells[0] ?? '';
    if (line.trim() === '') paragraphs.push([]);
    else paragraphs[paragraphs.length - 1]!.push(line);
  }
  const body = paragraphs
    .filter((p) => p.length)
    .map((p) => `<p>${renderInline(inline(p.join(' '), o), o)}</p>`)
    .join('');
  return `<div class="panel measure">${body}</div>`;
}

function grid(b: Block, o: RenderOptions): string {
  if (b.kind === 'cards') return cards(b, o);
  if (b.kind === 'board') {
    const columns = [...new Set(b.rows.map((r) => r.cells[0] ?? ''))];
    const body = columns
      .map(
        (col) =>
          `<div class="board-col"><h4 class="board-head">${escape(valueWord(col, true))}</h4>${b.rows
            .filter((r) => r.cells[0] === col)
            .map((r) => `<div class="card">${cell('card-title', r.cells[1], o)}${cell('card-detail', r.cells[2], o)}</div>`)
            .join('')}</div>`,
      )
      .join('');
    return `<div class="grid" style="--cells:${columns.length}">${body}</div>`;
  }
  // A layout primitive must be TOLD how many things it contains. It must never infer the count from
  // the space available — three tiles once drew seven auto-fit tracks and a 550px slab of border
  // colour, and every selector was correct (05 §4).
  const body = b.rows
    .map(
      (r) =>
        `<div class="cell"${toneAttrs(r.tone)}>${cell('cell-label', r.cells[0], o)}<span class="cell-figure num">${
          r.cells[1] ? renderInline(inline(r.cells[1], o), o) : MISSING
        }</span>${cell('cell-note', r.cells[2] && symbolText(r.cells[2]), o)}${toneGlyph(r.tone)}</div>`,
    )
    .join('');
  return `<div class="grid" style="--cells:${b.rows.length}">${body}</div>`;
}

function rows(b: Block, o: RenderOptions): string {
  const body = b.rows
    .map(
      (r) =>
        `<div class="row">${cell('row-label', r.cells[0], o)}<span class="row-value num">${
          r.cells[1] ? renderInline(inline(r.cells[1], o), o) : MISSING
        }</span>${cell('row-note', r.cells[2], o)}</div>`,
    )
    .join('');
  return `<div class="rows">${body}</div>`;
}

function proportional(b: Block, o: RenderOptions): string {
  /* THE VALUE CELL IS A CELL, and it was the one cell in the block that was not treated as one.
     `prop-label` and `prop-note` went through the inline renderer. `prop-value`, the only cell here
     that IS the number, was escaped raw, and the magnitude was then scraped off the same raw
     string. So a gauge bound to `{{cash.now}}` printed the braces at a length of zero, and a bar
     mixing an interpolated amount with a literal one measured minor units against major: a
     hundredfold error in the length of the bar. The identical defect was found and fixed one
     primitive over, on `timeline`'s date cell, for the identical reason. `MISSING` goes through
     `inline` too, which draws it unchanged and keeps the empty cell reading exactly as it did. */
  const drawn = (v: string | undefined): string => renderInline(inline(v ?? MISSING, o), o);
  /* A bar scales to its largest NON-HOLE row. A row whose value is not a number keeps its words and
     loses its bar, and an empty cell is not a number: a bar at zero claims the value IS zero
     (05 §7.4). Both readings come out of `magnitudeOfCell`, which is also what the Svelte primitive
     uses; two copies of it gave two answers for the same cell. */
  const numeric = (r: Row) => magnitudeOfCell(String(r.cells[1] ?? ''), o);

  if (b.kind === 'gauge') {
    const r = b.rows[0] ?? { cells: [] };
    const value = numeric(r);
    const target = magnitudeOfCell(String(r.cells[2] ?? ''), o);
    const m = Number.isFinite(value) && Number.isFinite(target) && target !== 0 ? value / target : 0;
    return `<div class="prop"><div class="prop-row"${toneAttrs(r.tone)}>${cell('prop-label', r.cells[0], o)}<span class="prop-track" style="--magnitude:${magnitude(m)}"></span><span class="prop-value num">${drawn(r.cells[1])}</span><span class="prop-note num">of ${drawn(r.cells[2])}</span>${toneGlyph(r.tone)}</div></div>`;
  }
  const scale = Math.max(0, ...b.rows.filter((r) => !r.hole).map(numeric).filter(Number.isFinite));
  const body = b.rows
    .map((r) => {
      const v = numeric(r);
      /* A NEGATIVE VALUE LOSES ITS BAR, like a value that is not a number. The scale has one
         side, so the only bar it could draw for a credit is a bar of length zero, and a bar at zero
         claims the value IS zero. The number is still printed, with its sign. */
      const drawable = Number.isFinite(v) && v >= 0 && !r.hole && scale > 0;
      const track = drawable ? `<span class="prop-track" style="--magnitude:${magnitude(v / scale)}"></span>` : '';
      const inner = `${cell('prop-label', r.cells[0], o)}${track}<span class="prop-value num">${drawn(r.cells[1])}</span>${cell('prop-note', r.cells[2], o)}${toneGlyph(r.tone)}`;
      return r.hole
        /* A HOLE ROW IS A CONTROL ONLY WHERE THE HOST CAN ACT ON IT — the same rule as an inline
           hole, for the same reason. This was a `<button>` with no handler on either side of the
           parity boundary: a tab stop styled as a control, on the one row of the chart that is
           supposed to be the way to fix the chart. */
        ? o.hole
          ? `<button type="button" class="prop-row" data-hole${toneAttrs(r.tone)}>${inner}</button>`
          : `<div class="prop-row" data-hole${toneAttrs(r.tone)}>${inner}</div>`
        : `<div class="prop-row"${toneAttrs(r.tone)}>${inner}</div>`;
    })
    .join('');
  return `<div class="prop">${body}</div>`;
}

function inlinePrimitive(b: Block, o: RenderOptions): string {
  // A chips row needs a number AND a word, or it is dropped: an icon alone is a rebus, and a colour
  // alone is unreadable to a tenth of readers. The columns do not move (05 §7.4).
  const body = b.rows
    .filter((r) => (r.cells[1] ?? '') !== '' && (r.cells[2] ?? '') !== '')
    .map(
      (r) =>
        `<span class="pill"${toneAttrs(r.tone)}><span class="pill-glyph" data-glyph="${escape(r.cells[0] ?? '')}" aria-hidden="true"></span><span class="pill-figure num">${escape(r.cells[1] ?? '')}</span><span class="pill-word">${escape(valueWord(r.cells[2] ?? ''))}</span>${toneGlyph(r.tone)}</span>`,
    )
    .join('');
  return `<div class="inline">${body}</div>`;
}

function list(b: Block, o: RenderOptions): string {
  if (b.kind === 'feed') return feed(b, o);
  const spec = KINDS[b.kind];
  const tag = spec.ordered ? 'ol' : 'ul';
  const body = b.rows
    .map((r) => {
      if (b.kind === 'todo')
        return `<li class="item"><span class="item-marker" data-done="${r.done ? 'yes' : 'no'}" role="img" aria-label="${r.done ? 'done' : 'not done'}">${r.done ? '✓' : ''}</span>${cell('item-title', r.cells[0], o)}${cell('item-detail', r.cells[1], o)}</li>`;
      if (b.kind === 'timeline')
        return `<li class="item"${toneAttrs(r.tone)}>${cell('item-marker num', r.cells[0], o)}${cell('item-title', r.cells[1], o)}${cell('item-detail', r.cells[2], o)}${toneGlyph(r.tone)}</li>`;
      return `<li class="item">${cell('item-title', r.cells[0], o)}${cell('item-detail', r.cells[1], o)}${cell('item-state', r.cells[2], o)}</li>`;
    })
    .join('');
  return `<${tag} class="list" data-kind="${b.kind}">${body}</${tag}>`;
}

function table(b: Block, o: RenderOptions): string {
  const [head, ...body] = b.rows;
  if (!head) return `<div class="table"></div>`;
  const cols = head.cells.length;
  const th = head.cells.map((c) => `<span class="th" role="columnheader">${escape(c)}</span>`).join('');
  const tr = body
    .map(
      (r, i) =>
        `<div class="tr" role="row" aria-rowindex="${i + 2}">${head.cells
          .map((_, j) => `<span class="td" role="gridcell">${renderInline(inline(r.cells[j] ?? '', o), o)}</span>`)
          .join('')}</div>`,
    )
    .join('');
  return `<div class="table" role="grid" aria-rowcount="${body.length + 1}" aria-colcount="${cols}" style="--cols:repeat(${cols},minmax(0,1fr))"><div class="tr" role="row" aria-rowindex="1">${th}</div>${tr}</div>`;
}

/**
 * The text of a verbatim block, with an indented kind's levels put back on.
 *
 * `parse` TAKES THE INDENT OFF THE CELL AND PUTS IT IN `Row.depth`, deliberately, so a `tree` row's
 * text is what the line says and its level is a number beside it. `Media.svelte` puts the two back
 * together and this file never did: it read cell 0 alone, so a four-line tree came out flat in the
 * exports, in the digest email and in every test that reads the mirror, which is the whole of what
 * `toHTML` serves. The primitive's own header says what that costs: a code sample that loses its
 * indentation is a code sample that is wrong. It was a straight parity break besides, the two
 * renderers differing in text content on every `tree` block in the record.
 *
 * ONE function, read by both renderers, and it asks the KIND rather than naming `tree`, so a pack
 * that declares a second indented kind is drawn by both of them the same way.
 */
export function verbatimText(b: Block): string {
  /* CLAMPED, because a renderer that throws takes the whole page with it. `depth` is the parser's
     own arithmetic and cannot be negative today, and `Row` is a public type a host can build by
     hand: `String.repeat` answers a negative or a non-finite count with a `RangeError`. */
  const level = (d: number | undefined): string =>
    '  '.repeat(Number.isFinite(d) ? Math.max(0, Math.floor(d as number)) : 0);
  const indented = KINDS[b.kind].indented;
  return b.rows.map((r) => (indented ? level(r.depth) : '') + (r.cells[0] ?? '')).join('\n');
}

function media(b: Block): string {
  if (b.kind === 'diff') return diff(b);
  const body = escape(verbatimText(b));
  const lang = b.kind === 'code' && b.heading ? ` data-lang="${escape(b.heading)}"` : '';
  /* FOCUSABLE, because a `pre` does not wrap: on a phone it is always the widest thing on the
     page and always scrolls sideways, and a scrolling box a keyboard cannot focus is a box a
     keyboard cannot read (WCAG 2.1.1). This is the third place in the product where that was
     true; the other two were fixed at the call site, and this one is fixed here because a host
     cannot reach inside a primitive to add an attribute and every host would need the same one.
     Named, so tabbing to it announces what it is instead of reading a line of code at you. */
  const label = b.heading ? escape(b.heading) : b.kind === 'tree' ? 'Tree' : 'Code';
  return `<pre class="media"${lang} tabindex="0" role="group" aria-label="${label}"><code>${body}</code></pre>`;
}

/* ── two kinds with a drawer of their own ─────────────────────────────────── */

/**
 * An amount, drawn with its currency's symbol where it has one (`£4,800.00`), and otherwise with its
 * code in front, present and quiet, as `Grid.svelte` draws a stat's figure.
 */
function amount(value: string, o: RenderOptions): string {
  const symbol = symbolFigure(value);
  if (symbol) return escape(symbol);
  const coded = leadingCode(value);
  return coded
    ? `<span class="amount-code">${escape(coded.currency)}</span> ${renderInline(inline(coded.rest, o), o)}`
    : renderInline(inline(value, o), o);
}

/**
 * `cards`: one card per row after the first, which names what each column is (`src/cards.ts`).
 *
 * The grid's column count is the host's `auto-fill` over a minimum width, so a narrow container is
 * one column with no breakpoint. `--cells` is not written: 05 §4 forbids inferring a count from the
 * space, and a card grid infers nothing, it only lets empty tracks stay empty.
 */
function cards(b: Block, o: RenderOptions): string {
  const [head, ...rows] = b.rows;
  if (rows.length === 0) return `<p class="cards-empty">${escape(CARDS_NONE)}</p>`;
  const L = cardLayout(head?.cells ?? []);
  const label = (i: number): string => L.labels[i] ?? '';
  const said = (r: Row, i: number): string => (i < 0 ? '' : plain(inline(r.cells[i] ?? '', o)));
  const drawn = (r: Row, i: number): string => renderInline(inline(r.cells[i] ?? '', o), o);
  const labelled = (i: number): string => (label(i) ? `<span class="cards-label">${escape(label(i))}</span>` : '');

  const body = rows
    .map((r) => {
      const mark = L.mark >= 0 ? markOf(said(r, L.mark)) : null;
      const face = L.nameIsWho ? initialOf(said(r, L.name)) : null;
      const lead = mark
        ? `<span class="cards-mark" aria-hidden="true">${escape(mark)}</span>`
        : face
          ? `<span class="cards-face" aria-hidden="true">${escape(face)}</span>`
          : '';
      const name = L.name >= 0 ? `<h3 class="cards-title">${r.cells[L.name] ? drawn(r, L.name) : MISSING}</h3>` : '';
      const when = L.when >= 0 && r.cells[L.when] ? `<span class="cards-when">${drawn(r, L.when)}</span>` : '';

      const figure =
        L.figure >= 0
          ? `<span class="cards-figure"><span class="cards-value num">${r.cells[L.figure] ? amount(r.cells[L.figure]!, o) : MISSING}</span>${labelled(L.figure)}</span>`
          : '';
      const t = L.trend >= 0 ? trendOf(said(r, L.trend)) : null;
      const trend = t
        ? `<svg class="cards-trend" viewBox="0 0 1000 100" preserveAspectRatio="none" role="img" aria-label="${escape(`${label(L.trend) || TREND}: ${t.said.join(', ')}`)}"><path class="cards-trend-line" d="${t.d}" vector-effect="non-scaling-stroke"></path><path class="cards-trend-end" d="${t.end}" vector-effect="non-scaling-stroke"></path></svg>`
        : '';
      const m = L.ring >= 0 ? ringOf(said(r, L.ring)) : null;
      /* The ring is decoration beside the value it draws, which is printed, so it is hidden and the
         words are what a screen reader hears. A value that is not a proportion keeps its words. */
      const ring =
        L.ring >= 0 && r.cells[L.ring]
          ? `<span class="cards-ring">${
              m === null
                ? ''
                : `<svg class="cards-ring-mark" viewBox="0 0 36 36" aria-hidden="true"><circle class="cards-ring-track" cx="18" cy="18" r="16" pathLength="100"></circle><circle class="cards-ring-fill" cx="18" cy="18" r="16" pathLength="100" stroke-dasharray="${ringDash(m)}" transform="rotate(-90 18 18)"></circle></svg>`
            }<span class="cards-value num">${drawn(r, L.ring)}</span>${labelled(L.ring)}</span>`
          : '';
      const middle = figure || trend || ring ? `<div class="cards-body">${figure}${trend}${ring}</div>` : '';
      const facts = L.facts.length
        ? `<dl class="cards-facts">${L.facts
            .map((i) => `<div class="cards-fact"><dt>${escape(label(i))}</dt><dd>${r.cells[i] ? drawn(r, i) : MISSING}</dd></div>`)
            .join('')}</dl>`
        : '';
      const whoFace = L.who >= 0 ? initialOf(said(r, L.who)) : null;
      const who =
        L.who >= 0 && r.cells[L.who]
          ? `<div class="cards-who">${whoFace ? `<span class="cards-face" aria-hidden="true">${escape(whoFace)}</span>` : ''}<span class="cards-name">${drawn(r, L.who)}</span></div>`
          : '';
      /* DIMMED BY AN ATTRIBUTE, so the host's CSS decides how, and the card keeps every word it had. */
      const quiet = isQuiet(L, r.cells) ? ' data-quiet=""' : '';
      return `<li class="cards-item"${toneAttrs(r.tone)}${quiet}><div class="cards-head">${lead}${name}${toneGlyph(r.tone)}${when}</div>${middle}${facts}${who}</li>`;
    })
    .join('');
  return `<ul class="cards-grid">${body}</ul>`;
}

/**
 * `section`: a heading on a page, with a count aside and, when folded, the control that folds what
 * follows. The folding itself is the host's, because the blocks that follow are the page's and not
 * this block's; `details` carries the state so the host can read it without script.
 */
function section(b: Block, o: RenderOptions): string {
  const [glyph = '', count = '', fold = ''] = b.rows[0]?.cells ?? [];
  const mark = glyph ? `<span class="sec-glyph" data-glyph="${escape(glyph)}" aria-hidden="true"></span>` : '';
  const n = counted(plain(inline(count, o))) ? `<span class="sec-count num">${renderInline(inline(count, o), o)}</span>` : '';
  const title = b.heading ? `<h2 class="sec-title">${mark}${renderInline(inline(b.heading, o), o)}${n}</h2>` : '';
  const toggle =
    fold === 'fold'
      ? `<details class="sec-fold"><summary class="sec-toggle"><span class="sec-show">${FOLD_SHOW}</span><span class="sec-hide">${FOLD_HIDE}</span></summary></details>`
      : '';
  return `<div class="sec">${title}${toggle}</div>`;
}

/**
 * `feed`: what agents, rules and you did, one group each, a burst on one row (`src/feed.ts`).
 *
 * The count leads the row. A new row's count takes the accent, and the words say it too: the head
 * says how many are new, and a line says where the ones you had seen begin.
 */
function feed(b: Block, o: RenderOptions): string {
  const plan = feedPlan(b.rows);
  if (plan.groups.length === 0) return `<p class="feed-empty">${escape(plan.empty)}</p>`;
  const said = (v: string | undefined): string => plain(inline(v ?? '', o));
  const drawn = (v: string | undefined): string => renderInline(inline(v ?? '', o), o);
  const body = plan.groups
    .map((g) => {
      const head =
        g.fresh > 0 ? `<span class="feed-new num">${escape(feedNew(g.fresh))}</span>` : `<span class="feed-tally num">${g.total}</span>`;
      const rows = g.rows
        .map(({ row: r, fresh }, i) => {
          const who = r.cells[1] ?? '';
          const face = g.by === 'rule' ? markOf(said(who)) : initialOf(said(who));
          const line = i === g.earlier ? `<li class="feed-seen">${escape(FEED_EARLIER)}</li>` : '';
          return `${line}<li class="feed-row"${fresh ? ' data-new' : ''}${toneAttrs(r.tone)}><span class="feed-count num">${
            counted(said(r.cells[2])) ? drawn(r.cells[2]) : ''
          }</span><span class="feed-face" aria-hidden="true">${face ? escape(face) : ''}</span><span class="feed-what"><span class="feed-who">${
            who ? drawn(who) : MISSING
          }</span> ${drawn(r.cells[3])}${toneGlyph(r.tone)}</span><span class="feed-when">${drawn(r.cells[4])}</span></li>`;
        })
        .join('');
      return `<div class="feed-group" data-by="${g.by}"><h3 class="feed-head">${escape(g.label)}${head}</h3><ul class="feed-rows">${rows}</ul></div>`;
    })
    .join('');
  return `<div class="feed">${body}</div>`;
}

/**
 * `diff`: a text's lines, taken out, put in or shared (`src/diff.ts`). A long shared run folds into
 * a `details`, so the change is on the screen and the rest is one press away.
 */
function diff(b: Block): string {
  const plan = diffPlan(b.rows.map((r) => r.cells[0] ?? ''));
  const line = (l: DiffLine): string => {
    const tag = l.op === 'del' ? 'del' : l.op === 'add' ? 'ins' : 'div';
    const mark =
      l.op === 'same'
        ? `<span class="diff-mark" aria-hidden="true"></span>`
        : `<span class="diff-mark" role="img" aria-label="${DIFF_WORDS[l.op]}">${DIFF_GLYPHS[l.op]}</span>`;
    return `<${tag} class="diff-line" data-op="${l.op}">${mark}<span class="diff-text">${escape(l.text)}</span></${tag}>`;
  };
  const body = plan.parts
    .map((p) =>
      p.fold
        ? `<details class="diff-fold"><summary class="diff-toggle">${escape(diffFolded(p.lines.length))}</summary>${p.lines.map(line).join('')}</details>`
        : p.lines.map(line).join(''),
    )
    .join('');
  return `<div class="diff"><p class="diff-sum">${escape(plan.summary)}</p><div class="diff-lines">${body}</div></div>`;
}

const PRIMITIVE_RENDERERS = { panel, grid, rows, proportional, inline: inlinePrimitive, list, table, media } as const;

/* ── segments ─────────────────────────────────────────────────────────────── */

/**
 * Whether a block's heading becomes its figcaption.
 *
 * `code`'s heading is its language, and a `section`'s heading is the section, drawn by its drawer as
 * a real heading. Neither is a caption. One function, read by both renderers, so the two trees
 * cannot disagree about it.
 */
export const captioned = (b: Block): boolean => Boolean(b.heading) && b.kind !== 'code' && b.kind !== 'section';

function block(b: Block, o: RenderOptions): string {
  const spec = KINDS[b.kind];
  const draw = PRIMITIVE_RENDERERS[spec.primitive];
  const cap = captioned(b)
    ? `<figcaption class="block-head"${toneAttrs(b.tone)}>${toneGlyph(b.tone)}${renderInline(inline(b.heading ?? '', o), o)}</figcaption>`
    : '';
  return `<figure class="block block-${spec.primitive}" data-kind="${b.kind}" data-primitive="${spec.primitive}"${toneAttrs(b.tone)}>${cap}${draw(b as never, o)}</figure>`;
}

/**
 * A degraded block shows exactly what the author typed, with the reason above it. It never renders
 * wrong and never renders nothing — a dropped block must read as feedback, and when the author is
 * an agent this is the only feedback channel that exists (05 §3).
 */
function degraded(d: Degraded): string {
  return `<figure class="block block-degraded" data-code="${d.code}"><figcaption class="degraded-fix">${escape(d.fix)}</figcaption><pre class="media"><code>${escape(d.raw)}</code></pre></figure>`;
}

/**
 * The closed markdown subset: ATX headings, paragraphs, flat lists, a rule, and inline spans.
 * A BLANK LINE ends a paragraph; a newline does not — see the note in Markdown.svelte, and the
 * `a11y-tree` parity gate is what keeps these two in step.
 */
function markdown(m: Markdown, o: RenderOptions): string {
  const out: string[] = [];
  let bullets: string[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push(`<p class="measure">${renderInline(inline(para.join(' '), o), o)}</p>`);
    para = [];
    if (bullets.length) out.push(`<ul class="prose-list measure">${bullets.join('')}</ul>`);
    bullets = [];
  };
  for (const raw of m.text.split('\n')) {
    const line = raw.trim();
    if (line === '') {
      flush();
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      flush();
      const n = h[1]!.length;
      out.push(`<h${n} class="measure">${renderInline(inline(h[2]!, o), o)}</h${n}>`);
      continue;
    }
    if (/^([-*_])\1{2,}$/.test(line)) {
      flush();
      out.push('<hr />');
      continue;
    }
    const li = /^[-*]\s+(.*)$/.exec(line);
    if (li) {
      if (para.length) flush();
      bullets.push(`<li>${renderInline(inline(li[1]!, o), o)}</li>`);
      continue;
    }
    if (bullets.length) flush();
    para.push(line);
  }
  flush();
  return out.join('');
}

export function toHTML(segments: Segment[], opts: RenderOptions = {}): string {
  return segments
    .map((s) => (s.type === 'block' ? block(s, opts) : s.type === 'degraded' ? degraded(s) : markdown(s, opts)))
    .join('');
}

/** The accessible name of a drawn figure reads as a sentence, not as three floating numbers (13 §7). */
export const describe = (b: Block, o: RenderOptions = {}): string =>
  [b.heading, ...b.rows.map((r) => r.cells.filter(Boolean).map((c) => plain(inline(c, o))).join(', '))]
    .filter(Boolean)
    .join('. ');
