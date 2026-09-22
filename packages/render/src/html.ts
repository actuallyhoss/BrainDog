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
 * `--cells`, `--magnitude` and `--at`, all numbers this file formats itself.
 */

import { KINDS, SPARKLINE_POINT, TONES, type Kind } from './kinds.ts';
import { inline, magnitudeOfCell, text as plain, type Inline, type InlineOptions } from './inline.ts';
import { MISSING, day, figureChars, leadingCode, symbolFigure, symbolText, valueWord } from './format.ts';
import { CARDS_NONE, FOLD_HIDE, FOLD_SHOW, TREND, cardLayout, counted, initialOf, isQuiet, markOf, ringDash, ringOf, trendOf } from './cards.ts';
import { FEED_EARLIER, feedNew, feedPlan } from './feed.ts';
import { QUEUE_RECOMMENDED, queueMore, queuePlan } from './queue.ts';
import { captureNowhere, capturePlan, capturePromptFor } from './capture.ts';
import { takeWorking, WORKING_GLYPH, WORKING_LABEL } from './working.ts';
import { TODO_META_JOIN, todoMeta as metaCells } from './todo.ts';
import { TABLE_CHUNK, TABLE_ROWS_LABEL, ariaSort, chunkRows, comparisonPlan, glyphColumn, intrinsicRows, tableCellBody } from './table.ts';
import { AGENTS_EARLIER, agentsPlan } from './agents.ts';
import { SPLIT_AMOUNT, SPLIT_PART, SPLIT_SHARE, SPLIT_ZERO, splitPlan, splitSentence } from './split.ts';
import { BRIDGE_AMOUNT, BRIDGE_STEP, bridgePlan, bridgeSentence, signedOf } from './bridge.ts';
import { SERIES_NET, SERIES_NONE, seriesPlan } from './series.ts';
import { LINES_AGAINST, LINES_NONE, LINES_NUMBERS, linesPlan } from './lines.ts';
import { PROGRESS_NONE, PROGRESS_OF, progressPlan, progressSentence } from './progress.ts';
import { figureLike } from './figure.ts';
import { FORECAST_BALANCE, FORECAST_MOVE, FORECAST_NONE, FORECAST_NUMBERS, FORECAST_WHAT, FORECAST_WHEN, baseKnobs, forecastModel, forecastPlan, scenario, underNote } from './forecast.ts';
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
  /**
   * Whether a `forecast` draws its knobs and its scrub. Only the Svelte drawer reads it: the knobs
   * are state in a component, so `toHTML` always draws the walk as the host made it, and the parity
   * tests compare the two without it.
   */
  scenario?: boolean;
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

/**
 * One named cell, with `working: true`'s dot taken off its front and drawn as the mark it is.
 *
 * EVERY CELL AND NOT A CHOSEN FEW, because the writing side (`blocks.ts`) decides which cell carries
 * it and this side must not hold a second opinion about that. A cell with no mark is unchanged, which
 * is every cell on every block that did not ask for one.
 */
const cell = (name: string, value: string | undefined, opts: RenderOptions, extra = '', after = ''): string => {
  const { text, working } = takeWorking(value ?? null);
  return `<span class="${name}"${extra}>${working ? workingSpan() : ''}${text ? renderInline(inline(text, opts), opts) : ''}${after ? ` ${after}` : ''}</span>`;
};

/**
 * A todo row's third and fourth cells, as the one quiet line under its title, or nothing.
 *
 * NOTHING, NOT AN EMPTY SPAN, where the row carries neither: a two-cell todo draws the markup it drew
 * before this line existed, and a page pads every two-column todo to four cells with blanks.
 */
const todoMeta = (cells: readonly string[], opts: RenderOptions): string => {
  const parts = metaCells(cells);
  return parts.length ? `<span class="item-meta">${parts.map((c) => renderInline(inline(c, opts), opts)).join(TODO_META_JOIN)}</span>` : '';
};

/** The dot itself, said the same way `Table`, `Grid` and `List` say it. */
/* AND A TOOLTIP, because a dot is not self-explaining to somebody looking at it. A screen reader has
   been told since this shipped; a sighted reader was left with a mark and no way to ask what it means.
   `aria-label` still names it — `title` is only the hover. */
const workingSpan = (): string => `<span role="img" aria-label="${WORKING_LABEL}" title="${WORKING_LABEL}">${WORKING_GLYPH}</span> `;

/**
 * The intent reaches the DOM only as `data-intent` plus its glyph. There is no other path.
 *
 * ESCAPED, BECAUSE A TYPE IS A PROMISE AND NOT A CHECK. `Tone` is a closed union of four words, and
 * this was written raw on the strength of that; but `Block` is a public type a host builds by hand,
 * and the parser was separately reading `Object.prototype` into the tone slot, so the attribute has
 * in fact carried `function Object() { [native code] }` out of a fence an author typed. The Svelte
 * drawer escapes this attribute because Svelte escapes every attribute, so writing it raw here was
 * also the two renderers disagreeing about one input. This file's own header promises ONE escape
 * function used on every value, and this was the value it was not used on.
 */
const toneAttrs = (tone?: string): string => (tone ? ` data-intent="${escape(String(tone))}"` : '');

const toneGlyph = (tone?: string): string => {
  if (!tone || !Object.hasOwn(TONES, tone)) return '';
  const t = TONES[tone as keyof typeof TONES];
  return `<span class="glyph" role="img" aria-label="${t.label}">${t.glyph}</span>`;
};

/* ── the eight primitives ─────────────────────────────────────────────────── */

function panel(b: Block, o: RenderOptions): string {
  if (b.kind === 'section') return section(b, o);
  if (b.kind === 'capture') return capture(b);
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

/**
 * A run of numbers as a small line, named by the numbers it was drawn from, or nothing when the run
 * has fewer than two. `stat`'s trend cell and `sparkline` draw it; `Trend.svelte` is its twin.
 */
function trendSvg(cls: string, label: string, value: string, o: RenderOptions): string {
  const t = trendOf(plain(inline(value, o)));
  if (!t) return '';
  const name = `${plain(inline(label, o)) || TREND}: ${t.said.join(', ')}`;
  return `<svg class="${cls}" viewBox="0 0 1000 100" preserveAspectRatio="none" role="img" aria-label="${escape(name)}"><path class="trend-line" d="${t.d}" vector-effect="non-scaling-stroke"></path><path class="trend-end" d="${t.end}" vector-effect="non-scaling-stroke"></path></svg>`;
}

/**
 * The numbers a figure was drawn from, as a table a screen reader reads and nobody sees: `bridge`, `split` and
 * `sparkline` put one under the drawing, as `series` does. It was a fold headed "The numbers", which under every chart
 * read as a stray caption. Column heads first, then each row as its row head and
 * its cells, all plain text this function escapes.
 */
function numbersFold(kind: string, heads: readonly string[], rows: readonly (readonly string[])[]): string {
  return `<div class="${kind}-numbers"><table class="${kind}-table"><thead><tr>${heads
    .map((h) => `<th scope="col">${escape(h)}</th>`)
    .join('')}</tr></thead><tbody>${rows
    .map(([head, ...cells]) => `<tr><th scope="row">${escape(head ?? '')}</th>${cells.map((c) => `<td class="num">${escape(c)}</td>`).join('')}</tr>`)
    .join('')}</tbody></table></div>`;
}

function grid(b: Block, o: RenderOptions): string {
  if (b.kind === 'cards') return cards(b, o);
  if (b.kind === 'board') {
    const columns = [...new Set(b.rows.map((r) => r.cells[0] ?? ''))];
    const body = columns
      .map((col) => {
        const cards = b.rows.filter((r) => r.cells[0] === col);
        /* HOW MANY ARE UNDER IT, which `Grid.svelte` has drawn on every column since it was written
           and this did not: the two renderers differed on the head of every board in the record, and
           no shape in `parity.test.ts` was a board, so nothing said so. */
        return `<div class="board-col"><h4 class="board-head">${escape(valueWord(col, true))}<span class="board-count num">${cards.length}</span></h4>${cards
          .map((r) => `<div class="card">${cell('card-title', r.cells[1], o)}${cell('card-detail', r.cells[2], o)}</div>`)
          .join('')}</div>`;
      })
      .join('');
    return `<div class="grid" style="--cells:${columns.length}">${body}</div>`;
  }
  // A layout primitive must be TOLD how many things it contains. It must never infer the count from
  // the space available — three tiles once drew seven auto-fit tracks and a 550px slab of border
  // colour, and every selector was correct (05 §4).
  const body = b.rows
    .map(
      (r) =>
        `<div class="cell"${toneAttrs(r.tone)}>${cell('cell-label', r.cells[0], o)}<span class="cell-figure num"${fitAttrs(r.cells[1])}>${
          /* The code quiet or the symbol in its place, as `Grid.svelte` draws it: this printed the
             code at full size, and the two trees differed on every stat with an amount in it. */
          r.cells[1] ? amount(r.cells[1], o) : MISSING
        }</span>${trendSvg('cell-trend', r.cells[0] ?? '', r.cells[3] ?? '', o)}${cell('cell-note', r.cells[2] && symbolText(r.cells[2]), o)}${toneGlyph(r.tone)}</div>`,
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

  /* `sparkline`: a label, a small line in the quiet ink ending in a dot, and the figure it ends at.
     Fewer than two points draw no line, and the figure is still said. */
  if (b.kind === 'sparkline') {
    /* The fold holds the points of every line that drew, a column each, a row per position. */
    const runs = b.rows.flatMap((r) => {
      const t = trendOf(plain(inline(r.cells[1] ?? '', o)));
      return t ? [{ label: plain(inline(r.cells[0] ?? '', o)) || TREND, said: t.said }] : [];
    });
    const depth = Math.max(0, ...runs.map((r) => r.said.length));
    const numbers = runs.length
      ? numbersFold(
          'spark',
          [SPARKLINE_POINT, ...runs.map((r) => r.label)],
          Array.from({ length: depth }, (_, i) => [String(i + 1), ...runs.map((r) => r.said[i] ?? MISSING)]),
        )
      : '';
    return `<div class="prop">${b.rows
      .map(
        (r) =>
          `<div class="spark-row"${toneAttrs(r.tone)}>${cell('spark-label', r.cells[0], o)}${trendSvg('spark-line', r.cells[0] ?? '', r.cells[1] ?? '', o)}<span class="spark-figure num">${drawn(r.cells[2] || MISSING)}</span>${toneGlyph(r.tone)}</div>`,
      )
      .join('')}${numbers}</div>`;
  }

  if (b.kind === 'split') return split(b, o);
  if (b.kind === 'bridge') return bridge(b, o);
  if (b.kind === 'series') return series(b, o);
  if (b.kind === 'lines') return lines(b, o);
  if (b.kind === 'progress') return progress(b, o);
  if (b.kind === 'forecast') return forecast(b, o);

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
  if (b.kind === 'agents') return agents(b, o);
  if (b.kind === 'queue') return queue(b, o);
  const spec = KINDS[b.kind];
  const tag = spec.ordered ? 'ol' : 'ul';
  const body = b.rows
    .map((r) => {
      if (b.kind === 'todo')
        return `<li class="item"><span class="item-marker" data-done="${r.done ? 'yes' : 'no'}" role="img" aria-label="${r.done ? 'done' : 'not done'}">${r.done ? '✓' : ''}</span>${cell('item-title', r.cells[0], o)}${cell('item-detail', r.cells[1], o)}${todoMeta(r.cells, o)}</li>`;
      if (b.kind === 'timeline')
        /* THE GLYPH SITS WITH THE TITLE, as `List.svelte` has drawn it since a tone five hundred pixels
           from the thing it qualifies was found to qualify nothing (13 §2.3). This drew it after the
           detail instead, so the two renderers differed on every timeline row that carried a tone, and
           no shape here was a timeline with one. */
        return `<li class="item"${toneAttrs(r.tone)}>${cell('item-marker num', r.cells[0], o)}${cell('item-title', r.cells[1], o, '', toneGlyph(r.tone))}${cell('item-detail', r.cells[2], o)}</li>`;
      return `<li class="item">${cell('item-title', r.cells[0], o)}${cell('item-detail', r.cells[1], o)}${cell('item-state', r.cells[2], o)}</li>`;
    })
    .join('');
  return `<${tag} class="list" data-kind="${b.kind}">${body}</${tag}>`;
}

/**
 * `table` — the static mirror of `svelte/p/Table.svelte`, drawn from the same decisions.
 *
 * IT USED TO BE A SECOND, SMALLER TABLE and that was the largest hole in this package's "equal by
 * construction" claim. There was no scroll region, no `rowgroup`, no `data-align` or
 * `data-truncate` on a cell, no missing mark, no figure in its symbol, and `--cols` spelled
 * `repeat(2,minmax(0,1fr))` against the component's `minmax(0,1fr) minmax(0,1fr)`. Everything
 * `blocks.css` hangs off those attributes was styled on one surface and not on the other, and
 * `parity.test.ts` had no `comparison` shape to notice any of it.
 *
 * WHAT IT DELIBERATELY DOES NOT CARRY is the roving tab stop: one cell at `tabindex="0"` and the
 * rest at `-1` is a promise that the arrow keys move a caret, and a static page has no handler to
 * keep it. The scroll region IS focusable here, as it is there, so a keyboard can still reach and
 * scroll a wide table. `src/table.ts` sets out the reasoning and `parity.test.ts` asserts that this
 * is the only difference between the two trees.
 */
function table(b: Block, o: RenderOptions): string {
  const plan = comparisonPlan(b.rows);
  /* NOTHING, AND NOT AN EMPTY GRID. `Block.svelte` draws no table for a block with no rows at all,
     and an empty `role="grid"` is a thing a screen reader stops on and announces, so the mirror
     was putting a table nobody wrote into the tree. */
  if (!plan) return '';
  const { columns, rows } = plan;
  const glyphAt = glyphColumn(columns);
  const th = columns
    .map((c) => {
      const sorted = ariaSort(c, undefined, false);
      return `<span class="th" role="columnheader"${sorted ? ` aria-sort="${sorted}"` : ''} data-align="${c.align ?? 'start'}">${escape(c.label)}</span>`;
    })
    .join('');
  const grouped = chunkRows(rows, TABLE_CHUNK);
  const body = grouped.groups
    .map((group, g) => {
      const trs = group
        .map((row, i) => {
          const index = g * grouped.step + i;
          const tds = columns
            .map((column, c) => {
              const drawn = tableCellBody(row.cells[c] ?? null);
              const inner =
                drawn.body.kind === 'missing'
                  ? `<span class="missing">${MISSING}</span>`
                  : drawn.body.kind === 'coded'
                    ? `${escape(drawn.body.sign)}<span class="amount-code">${escape(drawn.body.currency)}</span> ${escape(drawn.body.rest)}`
                    : escape(drawn.body.text);
              /* NO TONE GLYPH AND NO `data-tone` HERE, because a dialect table cannot carry either:
                 `comparisonPlan` builds its rows from cells and a block's tone belongs to the whole
                 figure. The component draws both for the register grid, which passes rows it built
                 itself. If the dialect ever grows a per-row tone the parity test fails on the first
                 shape that uses one, which is the right way to find out. */
              return `<span class="td" role="gridcell" data-align="${column.align ?? 'start'}" data-truncate="${column.truncate ?? 'end'}"${c === glyphAt ? ' data-glyph=""' : ''}>${drawn.working ? workingSpan() : ''}${inner}</span>`;
            })
            .join('');
          return `<div class="tr" role="row" aria-rowindex="${index + 2}">${tds}</div>`;
        })
        .join('');
      return `<div class="rowgroup" role="rowgroup" style="${intrinsicRows(group.length)}">${trs}</div>`;
    })
    .join('');
  const label = b.heading ?? TABLE_ROWS_LABEL;
  const tracks = columns.map((c) => c.width).join(' ');
  return (
    `<div class="table-region" role="group" tabindex="0" aria-label="${escape(label)}">` +
    `<div class="table" role="grid" aria-rowcount="${rows.length + 1}" aria-colcount="${columns.length}" style="--cols:${tracks}" tabindex="-1">` +
    `<div class="tr th-row" role="row" aria-rowindex="1">${th}</div>${body}</div></div>`
  );
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

/* ── kinds with a drawer of their own ─────────────────────────────────────── */

/**
 * `split`: one track cut into parts (`src/split.ts`), then a legend of dots, labels, figures and
 * shares, then the hole. A part is drawn in a neutral step, or in its intent when the row has one.
 * All zero, the track is a sentence and the legend still prints every figure.
 */
function split(b: Block, o: RenderOptions): string {
  const rows = b.rows.filter((r) => !r.hole);
  const holes = b.rows.filter((r) => r.hole);
  /* Signed as drawn, so `−£40.00` is a credit with no part rather than a part of 40. */
  const plan = splitPlan(rows.map((r) => signedOf(plain(inline(r.cells[1] ?? '', o)))));
  const partOf = (i: number) => plan.parts.find((p) => p.at === i);
  const said = (r: Row) => plain(inline(r.cells[0] ?? '', o));
  const track = plan.empty
    ? `<p class="split-empty">${escape(SPLIT_ZERO)}</p>`
    : `<svg class="split-track" viewBox="0 0 1000 100" preserveAspectRatio="none" role="img" aria-label="${escape(
        splitSentence(plan.parts.map((p) => ({ label: said(rows[p.at]!), share: p.share }))),
      )}">${plan.parts
        .map((p) => `<rect class="split-seg" data-step="${p.step}"${toneAttrs(rows[p.at]!.tone)} x="${p.x}" y="0" width="${p.width}" height="100"></rect>`)
        .join('')}${plan.cuts ? `<path class="split-cut" d="${plan.cuts}" vector-effect="non-scaling-stroke"></path>` : ''}</svg>`;
  const legend = rows.length
    ? `<ul class="split-legend">${rows
        .map((r, i) => {
          const part = partOf(i);
          return `<li class="split-item"${toneAttrs(r.tone)}><span class="split-dot"${part ? ` data-step="${part.step}"` : ''} aria-hidden="true"></span>${cell('split-label', r.cells[0], o)}<span class="split-value num">${renderInline(inline(r.cells[1] || MISSING, o), o)}</span>${part ? `<span class="split-share num">${escape(part.share)}</span>` : ''}${cell('split-note', r.cells[2], o)}${toneGlyph(r.tone)}</li>`;
        })
        .join('')}</ul>`
    : '';
  const hole = holes
    .map((r) => {
      const inner = `${cell('split-label', r.cells[0], o)}<span class="split-value num">${renderInline(inline(r.cells[1] || MISSING, o), o)}</span>${cell('split-note', r.cells[2], o)}${toneGlyph(r.tone)}`;
      return o.hole
        ? `<button type="button" class="split-hole" data-hole${toneAttrs(r.tone)}>${inner}</button>`
        : `<div class="split-hole" data-hole${toneAttrs(r.tone)}>${inner}</div>`;
    })
    .join('');
  const all = [...rows, ...b.rows.filter((r) => r.hole)];
  const numbers = all.length
    ? numbersFold(
        'split',
        [SPLIT_PART, SPLIT_AMOUNT, SPLIT_SHARE],
        all.map((r, i) => [said(r) || SPLIT_PART, plain(inline(r.cells[1] ?? '', o)) || MISSING, plan.parts.find((p) => p.at === i && !r.hole)?.share ?? MISSING]),
      )
    : '';
  return `<div class="prop split">${track}${legend}${hole}${numbers}</div>`;
}

/**
 * `bridge`: bars floating from the first row to the last (`src/bridge.ts`), then the rows as text
 * under them, and a warn line when the rows do not add up. The chart is the wide form; a narrow
 * container hides it and draws each row's bar inline, so both are in the markup and neither is text.
 */
function bridge(b: Block, o: RenderOptions): string {
  const values = b.rows.map((r) => signedOf(plain(inline(r.cells[1] ?? '', o))));
  const plan = bridgePlan(values);
  const chart = plan.bars
    ? `<svg class="bridge-chart" viewBox="0 0 1000 100" preserveAspectRatio="none" role="img" aria-label="${escape(
        bridgeSentence(b.rows.map((r) => ({ label: plain(inline(r.cells[0] ?? '', o)), value: plain(inline(r.cells[1] ?? '', o)) }))),
      )}">${plan.zero === null ? '' : `<path class="bridge-zero" d="M0 ${plan.zero}H1000" vector-effect="non-scaling-stroke"></path>`}${plan.bars
        .map((bar) => `<rect class="bridge-bar" data-move="${bar.move}" x="${bar.x}" y="${bar.y}" width="${bar.width}" height="${bar.height}"></rect>`)
        .join('')}</svg>`
    : '';
  const rows = b.rows
    .map((r, i) => {
      const bar = plan.bars?.[i];
      const inline_ = bar
        ? `<svg class="bridge-inline" viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true"><rect class="bridge-bar" data-move="${bar.move}" x="${bar.from}" y="0" width="${bar.span}" height="100"></rect></svg>`
        : '';
      return `<li class="bridge-row"${bar ? ` data-move="${bar.move}"` : ''}>${cell('bridge-label', r.cells[0], o)}${inline_}<span class="bridge-value num">${renderInline(inline(r.cells[1] || MISSING, o), o)}</span>${cell('bridge-note', r.cells[2], o)}</li>`;
    })
    .join('');
  const warn = plan.warn ? `<p class="bridge-warn" data-intent="warn">${toneGlyph('warn')}${escape(plan.warn)}</p>` : '';
  const numbers = b.rows.length
    ? numbersFold(
        'bridge',
        [BRIDGE_STEP, BRIDGE_AMOUNT],
        b.rows.map((r) => [plain(inline(r.cells[0] ?? '', o)), plain(inline(r.cells[1] ?? '', o)) || MISSING]),
      )
    : '';
  return `<div class="prop bridge" style="--cells:${b.rows.length}">${chart}<ol class="bridge-rows">${rows}</ol>${warn}${numbers}</div>`;
}

/**
 * An amount, drawn with its currency's symbol where it has one (`£4,800.00`), and otherwise with its
 * code in front, present and quiet, as `Grid.svelte` draws a stat's figure.
 */
/** A long figure's length for its cell to fit it to (`figureChars`), or nothing. */
function fitAttrs(value: string | null | undefined): string {
  const chars = figureChars(value ?? '');
  return chars === null ? '' : ` data-fit="" style="--chars:${String(chars)}"`;
}

function amount(value: string, o: RenderOptions): string {
  const symbol = symbolFigure(value);
  if (symbol) return escape(symbol);
  const coded = leadingCode(value);
  return coded
    ? `${escape(coded.sign)}<span class="amount-code">${escape(coded.currency)}</span> ${renderInline(inline(coded.rest, o), o)}`
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
 * `capture`: the one-line add (`src/capture.ts`), as it is drawn where nothing can write.
 *
 * NO FIELD, NO BUTTON AND NO FORM, EVER, because `toHTML` has no callbacks and a field here would be a
 * field that swallows what is typed into it. What is drawn instead is the list, named, and a door to it
 * where the evaluator gave it an address: the list's own page is where the row can be added. The Svelte
 * drawer draws this same tree when its host passes no `oncapture`, so the two are equal by construction.
 * A block whose rows name no list draws an empty panel, which the parser never lets a fence reach.
 */
function capture(b: Block): string {
  const plan = capturePlan(b.rows);
  if (!plan) return '<div class="capture"></div>';
  const said = plan.href
    ? `<a class="capture-where" href="${escape(plan.href)}">${escape(capturePromptFor(plan.label))}</a>`
    : escape(captureNowhere(plan.label));
  return `<div class="capture"><p class="capture-elsewhere">${said}</p></div>`;
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
 * `queue`: what is waiting on a person, one card per question (`src/queue.ts`).
 *
 * The options are words here and never buttons: `toHTML` has no callbacks, which is the same read-only
 * shape the Svelte drawer takes when a host passes no `onact`, so the two trees are equal by construction
 * rather than by a promise. The recommendation is a word beside its option and nothing is pre-chosen.
 */
function queue(b: Block, o: RenderOptions): string {
  const plan = queuePlan(b.rows);
  if (plan.items.length === 0) return `<p class="queue-empty">${escape(plan.empty)}</p>`;
  const drawn = (v: string | undefined): string => renderInline(inline(v ?? '', o), o);
  const body = plan.items
    .map((item) => {
      const options = item.options
        .map(
          (opt) =>
            `<li class="queue-option"${opt.recommended ? ' data-recommended' : ''}><span class="queue-label">${escape(opt.label)}</span>${
              opt.recommended ? `<span class="queue-rec">${escape(QUEUE_RECOMMENDED)}</span>` : ''
            }${opt.because ? `<span class="queue-because">${drawn(opt.because)}</span>` : ''}</li>`,
        )
        .join('');
      /* THE BAND IS A LABEL AND NOT AN ARGUMENT. It sits last on the by-line, in the same register as
         who asked and when, because it is the answer to "why is this card here" and not the card's
         content. `data-cost` carries the band's own word so a stylesheet can weight the dearest one
         without matching on English. */
      const cost = item.costLabel ? `<span class="queue-cost" data-cost="${escape(item.cost)}">${escape(item.costLabel)}</span>` : '';
      return `<article class="queue-card"${toneAttrs(item.row.tone)}><p class="queue-by"><span class="queue-who">${drawn(
        item.who,
      )}</span><span class="queue-when">${drawn(item.when)}</span>${cost}</p><h3 class="queue-question">${drawn(item.question)}</h3>${
        item.why ? `<p class="queue-why">${drawn(item.why)}</p>` : ''
      }<ul class="queue-options">${options}</ul></article>`;
    })
    .join('');
  const said = escape(queueMore(plan.more));
  const more = plan.more === 0 ? '' : plan.moreHref ? `<a class="queue-more" href="${escape(plan.moreHref)}">${said}</a>` : `<p class="queue-more">${said}</p>`;
  return `<div class="queue">${body}${more}</div>`;
}

/**
 * `agents`: what each agent did, one group per agent, a burst on one row (`src/agents.ts`).
 *
 * Drawn with `feed`'s classes, so a host that styles one styles both: the head is the agent's name with its
 * tally, and each row leads with its count. A row with no `what` is the rest of that agent's work, said as earlier.
 */
function agents(b: Block, o: RenderOptions): string {
  const plan = agentsPlan(b.rows);
  if (plan.groups.length === 0) return `<p class="feed-empty">${escape(plan.empty)}</p>`;
  const said = (v: string | undefined): string => plain(inline(v ?? '', o));
  const drawn = (v: string | undefined): string => renderInline(inline(v ?? '', o), o);
  const body = plan.groups
    .map((g) => {
      const face = initialOf(said(g.who));
      const rows = g.rows
        .map((r) => {
          const what = (r.cells[2] ?? '').trim() === '' ? escape(AGENTS_EARLIER) : drawn(r.cells[2]);
          return `<li class="feed-row"${toneAttrs(r.tone)}><span class="feed-count num">${
            counted(said(r.cells[1])) ? drawn(r.cells[1]) : ''
          }</span><span class="feed-face" aria-hidden="true">${face ? escape(face) : ''}</span><span class="feed-what">${what}${toneGlyph(r.tone)}</span><span class="feed-when">${drawn(r.cells[3])}</span></li>`;
        })
        .join('');
      return `<div class="feed-group" data-by="agent"><h3 class="feed-head">${drawn(g.who)}<span class="feed-tally num">${g.total}</span></h3><ul class="feed-rows">${rows}</ul></div>`;
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

/**
 * `progress`: one track a row, filled toward its target (`src/progress.ts`), with the value of the target, the share,
 * what is left, and the numbers in a fold. The `budget` form marks spending past the limit beyond a line at the limit.
 * `Progress.svelte` is this function's twin.
 */
function progress(b: Block, o: RenderOptions): string {
  const form = b.form === 'budget' ? 'budget' : 'goal';
  const said = (r: Row, i: number) => plain(inline(r.cells[i] ?? '', o));
  const plan = progressPlan(b.rows.map((r) => ({ value: said(r, 1), target: said(r, 2), ...(r.tone ? { tone: r.tone } : {}) })), form);
  const drawn = (v: string | undefined): string => renderInline(inline(v || MISSING, o), o);
  const body = b.rows.length
    ? b.rows
        .map((r, i) => {
          const p = plan[i]!;
          const track = p.drawable
            ? `<span class="progress-track" role="img" aria-label="${escape(progressSentence(said(r, 0), said(r, 1), said(r, 2), p.share))}" style="--fill:${p.fill}"><span class="progress-fill"></span>${
                p.limit === null ? '' : `<span class="progress-over" style="--limit:${p.limit}"></span>`
              }</span>`
            : '';
          return `<div class="progress-row"${toneAttrs(p.intent)}>${cell('progress-label', r.cells[0], o)}<span class="progress-figure num"><span class="progress-value">${drawn(r.cells[1])}</span><span class="progress-of">${PROGRESS_OF}</span><span class="progress-target">${drawn(r.cells[2])}</span></span><span class="progress-share num">${escape(p.share)}</span>${track}${
            p.left ? `<span class="progress-left num">${escape(p.left)}</span>` : ''
          }${r.cells[3] ? cell('progress-note', r.cells[3], o) : ''}${toneGlyph(p.intent)}</div>`;
        })
        .join('')
    : `<p class="progress-empty">${escape(PROGRESS_NONE)}</p>`;
  /* NO FOLD OF NUMBERS: every row already says its figure, its target and its share as text, so a fold under the bars
     repeated them behind a stray "The numbers". */
  return `<div class="prop progress"${form === 'budget' ? ' data-form="budget"' : ''}>${body}</div>`;
}

/**
 * `lines`: a measure over time as a line and the period before as a dashed one (`src/lines.ts`), the lead
 * figure with its change, a legend, the point labels, and the numbers as a table in a fold. `Lines.svelte`
 * is this function's twin; the pointer's readout is the component's alone, because nothing here moves.
 */
function lines(b: Block, o: RenderOptions): string {
  const plan = linesPlan(b.rows.map((r) => r.cells.map((c) => plain(inline(c, o)))));
  const lead = plan.now
    ? `<p class="lines-lead"><span class="lines-now num">${escape(plan.now)}</span>${
        plan.change
          ? `<span class="lines-change num" data-trend="${plan.trend}">${escape(plan.change)}</span><span class="lines-against">${LINES_AGAINST} ${escape(plan.against)}, <span class="num">${escape(plan.then)}</span></span>`
          : ''
      }</p>`
    : '';
  const legend = `<ul class="lines-legend">${plan.lines
    .map((l) => `<li class="lines-key"${l.was ? ' data-was=""' : ''} data-step="${l.step}"><span class="lines-swatch" aria-hidden="true"></span><span class="lines-name">${escape(l.label)}</span></li>`)
    .join('')}</ul>`;
  const paths =
    plan.lines.filter((l) => l.was && l.d).map((l) => `<path class="lines-line" data-was="" data-step="${l.step}" d="${l.d}" vector-effect="non-scaling-stroke"></path>`).join('') +
    plan.lines
      .filter((l) => !l.was)
      .map(
        (l) =>
          `${l.d ? `<path class="lines-line" data-step="${l.step}" d="${l.d}" vector-effect="non-scaling-stroke"></path>` : ''}${l.end ? `<path class="lines-end" data-step="${l.step}" d="${l.end}" vector-effect="non-scaling-stroke"></path>` : ''}`,
      )
      .join('');
  const chart = plan.empty
    ? `<p class="lines-empty">${escape(LINES_NONE)}</p>`
    : `<div class="lines-plot">${plan.top ? `<span class="lines-top num" aria-hidden="true">${escape(plan.top)}</span>` : ''}${
        plan.bottom ? `<span class="lines-bottom num" aria-hidden="true">${escape(plan.bottom)}</span>` : ''
      }<svg class="lines-chart" viewBox="0 0 1000 100" preserveAspectRatio="none" role="img" aria-label="${escape(
        `${plan.axis ? `${plan.axis}: ` : ''}${plan.sentence}`,
      )}">${paths}</svg></div><ol class="lines-ticks" aria-hidden="true">${plan.ticks
        .map((t) => `<li class="lines-tick" style="--at:${t.at}"${t.minor ? ' data-minor=""' : ''}>${escape(t.label)}</li>`)
        .join('')}</ol>`;
  const numbers = plan.points.length
    ? `<details class="lines-numbers"><summary class="lines-toggle">${LINES_NUMBERS}</summary><table class="lines-table"><thead><tr><th scope="col">${escape(plan.axis)}</th>${plan.lines
        .map((l) => `<th scope="col">${escape(l.label)}</th>`)
        .join('')}</tr></thead><tbody>${plan.points
        .map((p) => `<tr><th scope="row">${escape(p.label)}</th>${p.values.map((v) => `<td class="num">${escape(v)}</td>`).join('')}</tr>`)
        .join('')}</tbody></table></details>`
    : '';
  return `<div class="prop lines">${lead}${legend}${chart}${numbers}</div>`;
}

/**
 * `series`: bars by bucket over a zero rule, in above and out below (`src/series.ts`), a legend, the
 * bucket labels, and the numbers as a table in a fold. `Series.svelte` is this function's twin.
 */
function series(b: Block, o: RenderOptions): string {
  const plan = seriesPlan(
    b.rows.map((r) => r.cells.map((c) => plain(inline(c, o)))),
    b.form === 'net',
  );
  const net = b.form === 'net';
  const legend = `<ul class="series-legend">${plan.series
    .map((s) => `<li class="series-key" data-dir="${s.dir}" data-step="${s.step}"><span class="series-swatch" aria-hidden="true"></span><span class="series-name">${escape(s.label)}</span></li>`)
    .join('')}${net ? `<li class="series-key" data-net=""><span class="series-swatch" aria-hidden="true"></span><span class="series-name">${SERIES_NET}</span></li>` : ''}</ul>`;
  const chart = plan.empty
    ? `<p class="series-empty">${escape(SERIES_NONE)}</p>`
    : `<div class="series-plot">${plan.top ? `<span class="series-top num" aria-hidden="true">${escape(plan.top)}</span>` : ''}<svg class="series-chart" viewBox="0 0 1000 100" preserveAspectRatio="none" role="img" aria-label="${escape(
        `${plan.axis ? `${plan.axis}: ` : ''}${plan.sentence}`,
      )}"><path class="series-zero" d="M0 ${plan.zero}H1000" vector-effect="non-scaling-stroke"></path>${plan.bars
        .map(
          (bar) =>
            `<rect class="series-bar" data-dir="${bar.dir}" data-step="${bar.step}"${bar.state ? ` data-state="${bar.state}"` : ''} x="${bar.x}" y="${bar.y}" width="${bar.width}" height="${bar.height}" vector-effect="non-scaling-stroke"></rect>`,
        )
        .join('')}${plan.netLine ? `<path class="series-net" d="${plan.netLine}" vector-effect="non-scaling-stroke"></path><path class="series-dot" d="${plan.netDots}" vector-effect="non-scaling-stroke"></path>` : ''}</svg>${plan.bottom ? `<span class="series-bottom num" aria-hidden="true">${escape(plan.bottom)}</span>` : ''}</div><ol class="series-ticks" aria-hidden="true">${plan.buckets
        .map(
          (k) =>
            `<li class="series-tick"${k.state ? ` data-state="${k.state}"` : ''}><span class="series-tick-long">${escape(k.label)}</span><span class="series-tick-short">${escape(k.short)}</span></li>`,
        )
        .join('')}</ol>`;
  const numbers = plan.buckets.length
    ? `<div class="series-numbers"><table class="series-table"><thead><tr><th scope="col">${escape(plan.axis)}</th>${plan.series
        .map((s) => `<th scope="col">${escape(s.label)}</th>`)
        .join('')}${net ? `<th scope="col">${SERIES_NET}</th>` : ''}</tr></thead><tbody>${plan.buckets
        .map(
          (k) =>
            `<tr><th scope="row">${escape(k.label)}${k.said ? `<span class="series-said">${escape(k.said)}</span>` : ''}</th>${k.values
              .map((v) => `<td class="num">${escape(v)}</td>`)
              .join('')}${net ? `<td class="num">${escape(k.net)}</td>` : ''}</tr>`,
        )
        .join('')}</tbody></table></div>`
    : '';
  return `<div class="prop series" style="--cells:${plan.buckets.length}">${legend}${chart}${numbers}</div>`;
}

/**
 * `forecast`: the cash walk as a line over a zero rule (`src/forecast.ts`), the sentence over it, the
 * crossing pinned, month ticks, and every movement in a fold. Always the walk as the host made it:
 * the knobs and the scrub are `Forecast.svelte`'s, and only where the host asks for them.
 */
function forecast(b: Block, o: RenderOptions): string {
  const model = forecastModel(b.rows.map((r) => r.cells.map((c) => plain(inline(c, o)))));
  if (!model) return `<div class="prop forecast"><p class="forecast-empty">${escape(FORECAST_NONE)}</p></div>`;
  const shown = scenario(model, baseKnobs(model));
  const plan = forecastPlan(model, shown, null);
  const path = (cls: string, d: string, extra = '') => (d ? `<path class="${cls}"${extra} d="${d}" vector-effect="non-scaling-stroke"></path>` : '');
  const said = `<p class="forecast-said"${plan.warn ? ' data-intent="warn"' : ''}>${plan.warn ? toneGlyph('warn') : ''}${escape(plan.said)}</p>`;
  const chart = `<div class="forecast-plot"${plan.rises ? ' data-rises' : ''}><span class="forecast-top num" aria-hidden="true">${escape(plan.top)}</span><span class="forecast-bottom num" aria-hidden="true">${escape(plan.bottom)}</span><svg class="forecast-chart" viewBox="0 0 1000 100" preserveAspectRatio="none" role="img" aria-label="${escape(plan.sentence)}">${path('forecast-zero', `M0 ${plan.zero}H1000`)}${path('forecast-base', plan.base)}${path('forecast-stem', plan.up, ' data-move="up"')}${path('forecast-stem', plan.down, ' data-move="down"')}${path('forecast-past', plan.past)}${path('forecast-future', plan.future)}${path('forecast-low', plan.low)}${plan.cross ? path('forecast-cross', plan.cross.d) : ''}</svg>${
    plan.cross ? `<span class="forecast-pin" style="--at:${plan.cross.at}" aria-hidden="true">${TONES.warn.glyph} ${escape(plan.cross.day)}</span>` : ''
  }</div>`;
  const ticks = `<ol class="forecast-ticks" aria-hidden="true">${plan.ticks.map((t) => `<li class="forecast-tick" style="--at:${t.at}">${escape(t.label)}</li>`).join('')}</ol>`;
  const row = (when: string, what: string, move: string, balance: string) =>
    `<tr><th scope="row">${escape(when)}</th><td>${escape(what)}</td><td class="num">${escape(move)}</td><td class="num">${escape(balance)}</td></tr>`;
  const numbers = `<details class="forecast-numbers"><summary class="forecast-toggle">${escape(FORECAST_NUMBERS)}</summary><table class="forecast-table"><thead><tr>${[FORECAST_WHEN, FORECAST_WHAT, FORECAST_MOVE, FORECAST_BALANCE]
    .map((h) => `<th scope="col">${escape(h)}</th>`)
    .join('')}</tr></thead><tbody>${row(day(model.today), model.label, '', model.template)}${shown.steps
    .map((s) => row(day(s.day), s.label, figureLike(model.template, s.delta), figureLike(model.template, s.balance)))
    .join('')}</tbody></table></details>`;
  const note = underNote(model, shown);
  const soon = note ? `<p class="forecast-soon">${escape(note)}</p>` : '';
  return `<div class="prop forecast">${said}${chart}${ticks}${soon}${numbers}</div>`;
}

const PRIMITIVE_RENDERERS ={ panel, grid, rows, proportional, inline: inlinePrimitive, list, table, media } as const;

/* ── segments ─────────────────────────────────────────────────────────────── */

/**
 * Whether a block's heading becomes its figcaption.
 *
 * `code`'s heading is its language, and a `section`'s heading is the section, drawn by its drawer as
 * a real heading. A `capture`'s heading is its field's prompt (`src/capture.ts`). None is a caption.
 * One function, read by both renderers, so the two trees cannot disagree about it.
 */
export const captioned = (b: Block): boolean => Boolean(b.heading) && b.kind !== 'code' && b.kind !== 'section' && b.kind !== 'capture';

function block(b: Block, o: RenderOptions): string {
  const spec = KINDS[b.kind];
  const draw = PRIMITIVE_RENDERERS[spec.primitive];
  const cap = captioned(b)
    ? `<figcaption class="block-head"${toneAttrs(b.tone)}>${toneGlyph(b.tone)}${renderInline(inline(b.heading ?? '', o), o)}</figcaption>`
    : '';
  const form = b.form ? ` data-form="${escape(b.form)}"` : '';
  return `<figure class="block block-${spec.primitive}" data-kind="${b.kind}"${form} data-primitive="${spec.primitive}"${toneAttrs(b.tone)}>${cap}${draw(b as never, o)}</figure>`;
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
