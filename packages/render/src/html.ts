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
 * custom properties holding numbers this file formats itself, never a colour or a length. This said
 * three of them, `--cells`, `--magnitude` and `--at`, long after `--chars`, `--cols`, `--fill` and
 * `--limit` had joined; `roadmap` adds `--rows` and `--span`, `heat` adds `--weeks`, a
 * range adds `--from` and `--to`, and a card's `hue` adds `--hue`, a whole number `hueOf` read as digits.
 *
 * ONE EXCEPTION, NAMED: `--swatch`, on an option's visual, holds a colour from the record, because which lining a
 * choice is IS a colour (`05 §5`). It holds six hex digits `queue.ts` checked on the way in and nothing else, it is
 * written only inside that option's `queue-visual`, and nothing on the page is drawn in it.
 */

import { SPARKLINE_POINT, TONES, type KindSpec } from './kinds.ts';
import { kindSpec } from './kind-spec.ts';
import { inline, magnitudeOfCell, text as plain, type Inline, type InlineOptions } from './inline.ts';
import { glyphPath } from './inline.ts';
import { MISSING, barFigure, day, figureChars, headlineFigure, leadingCode, symbolFigure, symbolText, valueWord } from './format.ts';
import { CARDS_NEXT, CARDS_NONE, cardsCount, FOLD_HIDE, FOLD_SHOW, RUN_OPEN, TREND, agentMarkFill, cardLayout, counted, type AgentMark, initialOf, isQuiet, markOf, ringDash, ringOf, runFaceOf, trendOf, type RunCell, type RunFace } from './cards.ts';
import { FEED_EARLIER, feedBurst, feedCasedNodes, feedNew, feedPlan } from './feed.ts';
import { FILTERS_ALL, filtersMore, filtersPlan, type Filter } from './filters.ts';
import { QUEUE_DOES, QUEUE_REASONS, QUEUE_RECOMMENDED, fileSrc, queueMore, queuePlan, queueReasoned, queueSuggested, queueWays, type QueueShows } from './queue.ts';
import { PATH_DONE, PATH_NEXT, pathMore, pathPlan } from './path.ts';
import { INPUTS_NONE, inputsPlan } from './inputs.ts';
import { captureNowhere, capturePlan, capturePromptFor } from './capture.ts';
import { takeWorking, WORKING_GLYPH, WORKING_LABEL } from './working.ts';
import { TODO_META_JOIN, todoMeta as metaCells } from './todo.ts';
import { rowsCell, timelineCell, timelineDays } from './timeline.ts';
import { CHOICE_KEYS, rowKey } from './cursor.ts';
import { TABLE_CHUNK, TABLE_ROWS_LABEL, ariaSort, chunkRows, comparisonPlan, glyphColumn, intrinsicRows, tableCellBody } from './table.ts';
import { AGENTS_EARLIER, agentsPlan } from './agents.ts';
import { SPLIT_AMOUNT, SPLIT_PART, SPLIT_SHARE, SPLIT_ZERO, splitPlan, splitSentence } from './split.ts';
import { BRIDGE_AMOUNT, BRIDGE_STEP, bridgePlan, bridgeSentence, signedOf } from './bridge.ts';
import { SERIES_NET, SERIES_NONE, seriesPlan, type SeriesPlan } from './series.ts';
import { LINES_AGAINST, LINES_NONE, LINES_NUMBERS, linesOnly, linesPlan } from './lines.ts';
import { PROGRESS_NONE, PROGRESS_OF, PROGRESS_TOTAL, progressPlan, progressRangeSaid, progressSentence, progressSpentSaid, rangePlan, rangeSentence } from './progress.ts';
import { figureLike } from './figure.ts';
import { FORECAST_BALANCE, FORECAST_MOVE, FORECAST_NONE, FORECAST_NUMBERS, FORECAST_PAINT, FORECAST_WHAT, FORECAST_WHEN, baseKnobs, forecastModel, forecastPlan, scenario, underNote } from './forecast.ts';
import { DIFF_GLYPHS, DIFF_WORDS, diffFolded, diffPlan, type DiffLine } from './diff.ts';
import { ROADMAP_NONE, ROADMAP_TODAY, roadmapAxis, roadmapFlip, roadmapLines, roadmapPlan, roadmapRow, roadmapSentence, roadmapShare, roadmapSkipped, roadmapToday } from './roadmap.ts';
import { RING_NONE, RING_OF, RING_PAINT, RING_STEP_OPACITY, ringPlan } from './ring.ts';
import { HEAT_DAY, HEAT_NONE, HEAT_VALUE, heatLines, heatMissed, heatOutside, heatPeopleMore, heatPeoplePlan, heatPersonSaid, heatPlan, heatSkipped, heatTitle, heatWeekTitle } from './heat.ts';
import { CALENDAR_NONE, WEEKDAYS, calendarMore, calendarPlan, calendarSkipped } from './calendar.ts';
import { LINKS_NONE, linkPlan } from './links.ts';
import { GALLERY_NONE, galleryPlan, pictureSrc } from './gallery.ts';
import { EMBED_NONE, embedOpen, embedPlan } from './embed.ts';
import { hueOf } from './cards.ts';
import { pathRest, pathShort } from './path.ts';
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
  /**
   * Asks the host to walk a forecast further: a length its horizon knob offers past how far the walk reaches, in days,
   * or `last`. Only the Svelte drawer calls it, as a person picks the length, and the chart draws it once the host
   * sends the longer walk. Absent, the knob offers only what the walk already reaches.
   */
  walk?: (length: number | 'last') => void;
  /**
   * Where an address this renderer draws goes, as the host serves it. Absent, it is drawn as written.
   *
   * THE RECORD WRITES ITS ADDRESSES RECORD-RELATIVE AND THE HOST MAY NOT LIVE AT THE ROOT. A queue's "N more"
   * is `/decide`, a capture's list is `/r/tasks?…`, a note's link is `/r/things/1`, and under a host served
   * from `/app/<slug>` every one of those left the app: a press loaded the marketing site's 404. The web app
   * repaired it with a `MutationObserver` over `<main>` that rewrote each `href` after this package drew it,
   * because nothing here asked. Now every `href` either renderer draws passes through this last, the host's
   * own answers from `link`, `dayHref` and `cellHref` included, so a host whose answers are record-relative
   * too has one place to put itself. It must be safe to call on an address it has already rendered.
   */
  href?: (path: string) => string;
  /**
   * Where a file the record holds is served, by the row and the field that hold it, or `null` for nowhere.
   *
   * A READ, SO IT IS HERE AND NOT BESIDE THE CALLBACKS: a queue option that shows a photograph names `parts#2/photo`,
   * and only the host knows the address of that file. Absent, or answering an address that is not a path of this
   * host's, the picture is left out and the option keeps its words (`queue.ts` `fileSrc`).
   */
  file?: (row: string, field: string) => string | null;
  /**
   * The kinds the record's packs declare, keyed `block.<id>`, as the record's `schema` answers them. A READ, like the
   * rest: both renderers look a block's spec up through `kindSpec` with this, so a pack's kind is drawn by its
   * primitive exactly as a first-party kind on that primitive is, and a kind nobody installed draws the one line that
   * says so rather than nothing.
   */
  kinds?: Readonly<Record<string, KindSpec>>;
  /**
   * The mark an agent wears, for the name a cell gives it (`Claude`), or `null` for a name that is no agent's. A READ,
   * like `icon`, because this package ships no art: the host answers from its makers' marks, and a card's who or a feed
   * line's actor draws the mark in place of a letter. Absent, or answering `null`, a person keeps their initial.
   */
  agentMark?: (name: string) => AgentMark | null;
};

/** An address as the host serves it (`RenderOptions.href`). */
export const hrefFor = (o: { href?: RenderOptions['href'] | undefined }, path: string): string => (o.href ? o.href(path) : path);

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

/**
 * A glyph, drawn from the path data the host answered (`RenderOptions.icon`): one 24 box, stroked in
 * `currentColor` with the app's own stroke, so it takes the colour of the words around it and never
 * one of its own. NO `width` OR `height` ON THE TAG: the host's stylesheet sizes it, 1em in a line of
 * text and the slot's size in a slot, because a literal size is how a glyph stops following the type.
 * `Text.svelte`, `Section.svelte` and `p/Inline.svelte` draw the same element with the same attributes.
 */
const glyphSvg = (d: string, attrs = ''): string =>
  `<svg${attrs} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="${escape(d)}"></path></svg>`;

/**
 * A glyph slot's drawing, or nothing: the host's art for a name the set holds, else the slot stays
 * empty, as it was before any host could answer, and the stylesheet draws what it always drew there.
 * One pass and no waiting: a set glyph the host has not got yet stays the named, empty slot here, and
 * the Svelte `Section` fills it once `opts.iconSet` settles. The server render of that drawer is this tree.
 */
const slotArt = (name: string, o: RenderOptions): string => {
  const d = glyphPath(name, o);
  return d ? glyphSvg(d) : '';
};

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
          return `<a href="${escape(hrefFor(opts, n.href))}">${renderInline(n.body, opts)}</a>`;
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
          return href ? `<a href="${escape(hrefFor(opts, href))}">${body}</a>` : body;
        }
        case 'evidence':
          // `{unknown}` is not a weak claim, it is a hole, so it renders as an affordance.
          return n.kind === 'unknown'
            ? opts.hole
              ? `<button type="button" class="hole">unknown</button>`
              : `<span class="hole">unknown</span>`
            : `<span class="evidence" data-evidence="${n.kind}"${n.source ? ` title="${escape(n.source)}"` : ''}>${n.kind}${n.source ? `: ${escape(n.source)}` : ''}</span>`;
        case 'icon': {
          // A glyph in a sentence names itself, because it stands among the words. Without the host's
          // art it is the same named span with nothing in it, so the words around it never move.
          const d = glyphPath(n.name, opts);
          const named = ` class="glyph-inline" role="img" aria-label="${escape(n.name)}"`;
          return d ? glyphSvg(d, named) : `<span class="glyph-inline" data-glyph="${escape(n.name)}" role="img" aria-label="${escape(n.name)}"></span>`;
        }
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
  return parts.length ? `<span class="item-meta" data-calm="">${parts.map((c) => renderInline(inline(c, opts), opts)).join(TODO_META_JOIN)}</span>` : '';
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
  if (b.kind === 'capture') return capture(b, o);
  if (b.kind === 'embed') return embed(b, o);
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
  if (b.kind === 'heat') return heat(b, o);
  if (b.kind === 'gallery') return gallery(b, o);
  if (b.kind === 'board') {
    const columns = [...new Set(b.rows.map((r) => r.cells[0] ?? ''))];
    const body = columns
      .map((col) => {
        const cards = b.rows.filter((r) => r.cells[0] === col);
        /* HOW MANY ARE UNDER IT, which `Grid.svelte` has drawn on every column since it was written
           and this did not: the two renderers differed on the head of every board in the record, and
           no shape in `parity.test.ts` was a board, so nothing said so. */
        return `<div class="board-col"><h3 class="board-head">${escape(valueWord(col, true))}<span class="board-count num">${cards.length}</span></h3>${cards
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
        `<div class="cell"${toneAttrs(r.tone)}>${cell('cell-label', r.cells[0], o)}<span class="cell-figure num"${fitAttrs(r.cells[1] && headlineFigure(r.cells[1]))}>${
          /* The code quiet or the symbol in its place, as `Grid.svelte` draws it: this printed the
             code at full size, and the two trees differed on every stat with an amount in it. A stat's
             figure is a headline, so it is said the way `headlineFigure` says one: `£33,850`, not `£33,850.00`. */
          r.cells[1] ? amount(headlineFigure(r.cells[1]), o) : MISSING
        }</span>${trendSvg('cell-trend', r.cells[0] ?? '', r.cells[3] ?? '', o)}${cell('cell-note', r.cells[2] && symbolText(r.cells[2], true), o)}${toneGlyph(r.tone)}</div>`,
    )
    .join('');
  return `<div class="grid" style="--cells:${b.rows.length}">${body}</div>`;
}

function rows(b: Block, o: RenderOptions): string {
  if (b.kind === 'inputs') return inputs(b, o);
  /* A DAY THIS YEAR DROPS ITS YEAR, AND MONEY MOVING BY NOTHING IS NOT SAID (`rowsCell`). An empty value is still
     `MISSING`; a value said as nothing is a known nothing, and draws no mark at all. */
  const body = b.rows
    .map((r) => {
      const value = r.cells[1] ? rowsCell(r.cells[1], o.now) : undefined;
      return `<div class="row">${cell('row-label', r.cells[0], o)}<span class="row-value num">${
        value === undefined ? MISSING : value ? renderInline(inline(value, o), o) : ''
      }</span>${cell('row-note', rowsCell(r.cells[2], o.now), o)}</div>`;
    })
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
          'sparkline',
          [SPARKLINE_POINT, ...runs.map((r) => r.label)],
          Array.from({ length: depth }, (_, i) => [String(i + 1), ...runs.map((r) => r.said[i] ?? MISSING)]),
        )
      : '';
    return `<div class="prop">${b.rows
      .map(
        (r) =>
          `<div class="sparkline-row"${toneAttrs(r.tone)}>${cell('sparkline-label', r.cells[0], o)}${trendSvg('sparkline-line', r.cells[0] ?? '', r.cells[1] ?? '', o)}<span class="sparkline-figure num">${drawn(r.cells[2] || MISSING)}</span>${toneGlyph(r.tone)}</div>`,
      )
      .join('')}${numbers}</div>`;
  }

  if (b.kind === 'split') return split(b, o);
  if (b.kind === 'bridge') return bridge(b, o);
  if (b.kind === 'series') return series(b, o);
  if (b.kind === 'lines') return lines(b, o);
  if (b.kind === 'progress') return progress(b, o);
  if (b.kind === 'forecast') return forecast(b, o);
  if (b.kind === 'ring') return ring(b, o);

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
      const inner = `${cell('prop-label', r.cells[0], o)}${track}<span class="prop-value num">${drawn(barFigure(r.cells[1] ?? MISSING))}</span>${cell('prop-note', r.cells[2], o)}${toneGlyph(r.tone)}`;
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
        `<span class="pill"${toneAttrs(r.tone)}><span class="pill-glyph" data-glyph="${escape(r.cells[0] ?? '')}" aria-hidden="true">${slotArt(r.cells[0] ?? '', o)}</span><span class="pill-figure num">${escape(r.cells[1] ?? '')}</span><span class="pill-word">${escape(valueWord(r.cells[2] ?? ''))}</span>${toneGlyph(r.tone)}</span>`,
    )
    .join('');
  return `<div class="inline">${body}</div>`;
}

function list(b: Block, o: RenderOptions): string {
  if (b.kind === 'feed') return feed(b, o);
  if (b.kind === 'agents') return agents(b, o);
  if (b.kind === 'queue') return queue(b, o);
  if (b.kind === 'roadmap') return roadmap(b, o);
  if (b.kind === 'steps' && b.form === 'path') return path(b, o);
  if (b.kind === 'calendar') return calendar(b, o);
  if (b.kind === 'link') return links(b, o);
  const tag = kindSpec(b.kind, o.kinds)?.ordered ? 'ol' : 'ul';
  const days = b.kind === 'timeline' ? timelineDays(b.rows) : [];
  const grouped = days.some((d) => d !== null);
  const body = b.rows
    .map((r, i) => {
      /* EVERY ROW CARRIES ITS KEY (`cursor.ts`), so a host walks a page's rows with one query across its blocks. */
      const key = ` data-row="${escape(rowKey(r, i))}"`;
      if (b.kind === 'todo')
        return `<li class="item"${key}><span class="item-marker" data-done="${r.done ? 'yes' : 'no'}" role="img" aria-label="${r.done ? 'done' : 'not done'}">${r.done ? '✓' : ''}</span>${cell('item-title', r.cells[0], o)}${cell('item-detail', r.cells[1], o)}${todoMeta(r.cells, o)}</li>`;
      if (b.kind === 'timeline') {
        /* A GROUPED TIMELINE SAYS EACH DAY ONCE, over its rows, and the rows under it leave their own date blank
           (`timeline.ts`). The heading is an item of the list, so the list stays a list of its children. */
        const day = days[i] ?? null;
        /* EACH CELL AS IT IS SAID (`timelineCell`): a day this year without its year, and an amount of nothing not at all. */
        const head = day === null ? '' : `<li class="item-day num">${renderInline(inline(timelineCell(day, o.now), o), o)}</li>`;
        /* THE GLYPH SITS WITH THE TITLE, as `List.svelte` has drawn it since a tone five hundred pixels
           from the thing it qualifies was found to qualify nothing (13 §2.3). This drew it after the
           detail instead, so the two renderers differed on every timeline row that carried a tone, and
           no shape here was a timeline with one. */
        const marker = grouped ? '<span class="item-marker num"></span>' : cell('item-marker num', timelineCell(r.cells[0], o.now), o);
        return `${head}<li class="item"${toneAttrs(r.tone)}${key}>${marker}${cell('item-title', r.cells[1], o, '', toneGlyph(r.tone))}${cell('item-detail', timelineCell(r.cells[2], o.now), o)}</li>`;
      }
      return `<li class="item"${key}>${cell('item-title', r.cells[0], o)}${cell('item-detail', r.cells[1], o)}${cell('item-state', r.cells[2], o)}</li>`;
    })
    .join('');
  return `<${tag} class="list" data-kind="${b.kind}"${grouped ? ' data-days=""' : ''}>${body}</${tag}>`;
}

/**
 * `steps path`: the stones in the list's order, each marked done, next or later (`src/path.ts`), and the count of the
 * open steps the short view left out. `svelte/Path.svelte` is this function's twin.
 *
 * THE LIST'S OWN CLASSES, WITH THE MARK AS AN ATTRIBUTE, so a host that styles `steps` already draws a path as a
 * numbered list and the connecting line is one rule on `data-mark` away. A done stone's tick is an image named "done",
 * as `todo`'s box is where it cannot be pressed; the next one is said in a word, because the whole form exists so a
 * reader can find it without reading every row; a later one has no marker text at all.
 *
 * A PATH WITH A SHORT VIEW IS DRAWN AS THAT VIEW, its stones alone and a line saying how many more there are for when
 * there is room (`pathShort`). The switch to every stone is the Svelte drawer's, because it is state in a component and
 * this has none; every other part of the two trees is the same. A stone in the short view carries `data-short`, so a
 * host drawing every stone can still show which ones the view holds.
 */
function path(b: Block, o: RenderOptions): string {
  const plan = pathPlan(b.rows);
  const short = pathShort(plan);
  const stones = short ? plan.stones.filter((s) => s.short) : plan.stones;
  const body = stones
    .map(({ row: r, mark, short: held }) => {
      const marker =
        mark === 'done'
          ? `<span class="item-marker" role="img" aria-label="${PATH_DONE}">${TONES.good.glyph}</span>`
          : mark === 'next'
            ? `<span class="item-marker"><span class="path-next">${PATH_NEXT}</span></span>`
            : `<span class="item-marker"></span>`;
      return `<li class="item" data-mark="${mark}"${held ? ' data-short=""' : ''}>${marker}${cell('item-title', r.cells[0], o)}${cell('item-detail', r.cells[1], o)}</li>`;
    })
    .join('');
  const rest = short ? `<p class="path-rest">${escape(pathRest(plan.stones.length - stones.length))}</p>` : '';
  const more = plan.more > 0 ? `<p class="path-more">${escape(pathMore(plan.more))}</p>` : '';
  return `<ol class="list" data-kind="steps" data-form="path">${body}</ol>${rest}${more}`;
}

/**
 * `inputs` where nothing can write: a `spec` of the values (`src/inputs.ts`), drawn with the spec's own classes.
 *
 * NO FIELD, EVER, for the reason `capture` draws none here: `toHTML` has no callbacks, and a box that swallows what is
 * typed into it is worse than the figure it would have held. `svelte/Inputs.svelte` draws this same tree when its host
 * passes no `oninput`, so the two are equal by construction.
 */
function inputs(b: Block, o: RenderOptions): string {
  const plan = inputsPlan(b.rows);
  if (plan.fields.length === 0) return `<p class="inputs-empty">${escape(plan.empty || INPUTS_NONE)}</p>`;
  const body = plan.fields
    .map(
      (f) =>
        `<div class="row"><span class="row-label">${escape(f.label)}</span><span class="row-value num">${
          f.value ? renderInline(inline(f.value, o), o) : MISSING
        }</span><span class="row-note"></span></div>`,
    )
    .join('');
  return `<div class="rows" data-inputs="">${body}</div>`;
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
  /* No options here, and none needed: a pack's kind cannot draw on `media`, so only a built-in kind is ever indented. */
  const indented = kindSpec(b.kind)?.indented;
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
 *
 * A LEGEND'S FIGURE IS A TILE'S, SAID SHORT (`headlineFigure`): Accounts read `£24,000.00 GBP 71%` beside a bar that
 * already says the share, and the fold of numbers under it keeps every penny.
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
          return `<li class="split-item"${toneAttrs(r.tone)}><span class="split-dot"${part ? ` data-step="${part.step}"` : ''} aria-hidden="true"></span>${cell('split-label', r.cells[0], o)}<span class="split-value num">${renderInline(inline(headlineFigure(r.cells[1] || MISSING), o), o)}</span>${part ? `<span class="split-share num">${escape(part.share)}</span>` : ''}${cell('split-note', r.cells[2], o)}${toneGlyph(r.tone)}</li>`;
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
 * A run's face, mirroring `Cards.svelte`'s `runFace` snippet: the kind's glyph on a disc washed in the
 * run's hue, ringed in that hue while the run is open, solid while it works and dashed once it has gone quiet, and a
 * door to the run's page.
 */
function runFaceHtml(f: RunFace, o: RenderOptions): string {
  const d = f.glyph === 'slash' ? 'M15.5 4.5 8.5 19.5' : (o.icon?.(f.glyph) ?? null);
  const ring =
    f.live !== 'stopped'
      ? `<circle class="cards-run-ring" cx="18" cy="18" r="16.5" fill="none" stroke-width="2.5"${f.live === 'quiet' ? ' stroke-dasharray="4 3"' : ''} style="stroke:oklch(var(--mark-l) var(--mark-c) var(--run-hue))"></circle>`
      : '';
  const path = d ? `<path d="${escape(d)}" transform="translate(9 9) scale(0.75)" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>` : '';
  return `<a class="cards-face cards-run" style="background:none" href="${escape(hrefFor(o, `/r/session/${f.seq}`))}" data-live="${f.live}" aria-label="${escape(RUN_OPEN)}"><svg class="cards-run-mark" viewBox="0 0 36 36" width="100%" height="100%" aria-hidden="true" style="--run-hue:${f.hue}"><circle class="cards-run-disc" cx="18" cy="18" r="14" style="fill:color-mix(in srgb, oklch(var(--mark-l) var(--mark-c) var(--run-hue)) 30%, var(--bg))"></circle>${ring}${path}</svg></a>`;
}

/**
 * An agent's face as its maker's mark, mirroring `Cards.svelte`'s and `Feed.svelte`'s `agentFace` snippet: the host's
 * path on a 24 grid, filled in the maker's tone, inside the face slot it replaces. Hidden, as the letter was, because
 * the agent is named in words beside it.
 */
function agentFaceHtml(m: AgentMark, cls: string): string {
  const fill = agentMarkFill(m.tone);
  return `<span class="${cls}" data-agent="" aria-hidden="true"><svg class="agent-mark" data-tone="${escape(m.tone)}" viewBox="0 0 24 24" width="100%" height="100%" fill="currentColor"${
    fill ? ` style="${fill}"` : ''
  }><path d="${escape(m.d)}" fill-rule="${m.rule}" clip-rule="${m.rule}"></path></svg></span>`;
}

/** The mark the host draws for the name in a cell, or `null`. */
const markFor = (o: RenderOptions, name: string): AgentMark | null => (name.trim() && o.agentMark ? o.agentMark(name.trim()) : null);

/**
 * `cards`: one card per row after the first, which names what each column is (`src/cards.ts`).
 *
 * The grid's column count is the host's `auto-fill` over a minimum width, so a narrow container is
 * one column with no breakpoint. `--cells` is not written: 05 §4 forbids inferring a count from the
 * space, and a card grid infers nothing, it only lets empty tracks stay empty.
 */
function cards(b: Block, o: RenderOptions & { runs?: readonly (RunCell | null)[] | undefined }): string {
  const [head, ...rows] = b.rows;
  if (rows.length === 0) return `<p class="cards-empty">${escape(CARDS_NONE)}</p>`;
  const L = cardLayout(head?.cells ?? []);
  const label = (i: number): string => L.labels[i] ?? '';
  const said = (r: Row, i: number): string => (i < 0 ? '' : plain(inline(r.cells[i] ?? '', o)));
  const drawn = (r: Row, i: number): string => renderInline(inline(r.cells[i] ?? '', o), o);
  const labelled = (i: number): string => (label(i) ? `<span class="cards-label">${escape(label(i))}</span>` : '');

  const body = rows
    .map((r, n) => {
      const mark = L.mark >= 0 ? markOf(said(r, L.mark)) : null;
      const run = L.name >= 0 || L.who >= 0 ? runFaceOf(said(r, L.nameIsWho ? L.name : L.who), o.runs?.[n], isQuiet(L, r.cells)) : null;
      const face = L.nameIsWho ? initialOf(said(r, L.name)) : null;
      const nameMark = L.nameIsWho ? markFor(o, said(r, L.name)) : null;
      const lead = mark
        ? `<span class="cards-mark" aria-hidden="true">${escape(mark)}</span>`
        : L.nameIsWho && run
          ? runFaceHtml(run, o)
          : nameMark
            ? agentFaceHtml(nameMark, 'cards-face')
            : face
              ? `<span class="cards-face" aria-hidden="true">${escape(face)}</span>`
              : '';
      const name = L.name >= 0 ? `<h3 class="cards-title">${r.cells[L.name] ? drawn(r, L.name) : MISSING}</h3>` : '';
      const when = L.when >= 0 && r.cells[L.when] ? `<span class="cards-when">${drawn(r, L.when)}</span>` : '';

      const figure =
        L.figure >= 0
          ? `<span class="cards-figure"><span class="cards-value num">${r.cells[L.figure] ? amount(headlineFigure(r.cells[L.figure]!), o) : MISSING}</span>${labelled(L.figure)}</span>`
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
      /* A FACT NOBODY WROTE IS NOT DRAWN, as in `Cards.svelte`, and a card with no fact written has no list. */
      const written = L.facts.filter((i) => r.cells[i]);
      const facts = written.length
        ? `<dl class="cards-facts">${written.map((i) => `<div class="cards-fact"><dt>${escape(label(i))}</dt><dd>${drawn(r, i)}</dd></div>`).join('')}</dl>`
        : '';
      const whoFace = L.who >= 0 ? initialOf(said(r, L.who)) : null;
      const whoMark = L.who >= 0 ? markFor(o, said(r, L.who)) : null;
      const whoLead = run ? runFaceHtml(run, o) : whoMark ? agentFaceHtml(whoMark, 'cards-face') : whoFace ? `<span class="cards-face" aria-hidden="true">${escape(whoFace)}</span>` : '';
      const who = L.who >= 0 && r.cells[L.who] ? `<div class="cards-who">${whoLead}<span class="cards-name">${drawn(r, L.who)}</span></div>` : '';
      /* DIMMED BY AN ATTRIBUTE, so the host's CSS decides how, and the card keeps every word it had. */
      const quiet = isQuiet(L, r.cells) ? ' data-quiet=""' : '';
      /* THE REPLY IS THE LINE UNDER THE HEAD and the next step the card's last word before who is on it, and an empty
         cell draws neither: "Next:" over nothing says there is a step nobody wrote down. */
      const reply = L.reply >= 0 && r.cells[L.reply] ? `<p class="cards-reply">${drawn(r, L.reply)}</p>` : '';
      const next = L.next >= 0 && r.cells[L.next] ? `<p class="cards-next">${CARDS_NEXT}: ${drawn(r, L.next)}</p>` : '';
      /* THE LEAD IS TOLD, NEVER INFERRED (05 §4): the first card of a `cards lead` block, and the host's grid decides
         what two tracks are, so a phone's one column keeps it one card wide. */
      const leading = b.form === 'lead' && n === 0 ? ' data-lead=""' : '';
      /* THE HUE IS A NUMBER ON THE CARD AND NOTHING ELSE, which the host draws the mark in; a cell that is not a turn
         from 0 to 359 writes no style at all. THE PICTURE LEADS THE CARD where the host serves the file, and is hidden
         from a screen reader because the title under it names the card. */
      const hue = L.hue >= 0 ? hueOf(said(r, L.hue)) : null;
      const tinted = hue === null ? '' : ` style="--hue:${hue}"`;
      const src = L.picture >= 0 ? pictureSrc(r.cells[L.picture] ?? '', o.file) : null;
      const picture = src ? `<img class="cards-picture" src="${escape(hrefFor(o, src))}" alt="" loading="lazy">` : '';
      return `<li class="cards-item"${leading}${toneAttrs(r.tone)}${quiet}${tinted}>${picture}<div class="cards-head">${lead}${name}${toneGlyph(r.tone)}${when}</div>${reply}${middle}${facts}${next}${who}</li>`;
    })
    .join('');
  return `<ul class="cards-grid" data-cards="${cardsCount(rows.length)}">${body}</ul>`;
}

/**
 * `section`: a heading on a page, with a count aside and, when folded, the control that folds what
 * follows. The folding itself is the host's, because the blocks that follow are the page's and not
 * this block's; `details` carries the state so the host can read it without script.
 */
function section(b: Block, o: RenderOptions): string {
  const [glyph = '', count = '', fold = ''] = b.rows[0]?.cells ?? [];
  const mark = glyph ? `<span class="sec-glyph" data-glyph="${escape(glyph)}" aria-hidden="true">${slotArt(glyph, o)}</span>` : '';
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
function capture(b: Block, o: RenderOptions): string {
  const plan = capturePlan(b.rows);
  if (!plan) return '<div class="capture"></div>';
  const said = plan.href
    ? `<a class="capture-where" href="${escape(hrefFor(o, plan.href))}">${escape(capturePromptFor(plan.label))}</a>`
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
        g.fresh > 0 ? `<span class="feed-new num">${escape(feedNew(g.fresh))}</span>` : `<span class="feed-tally num" data-calm="">${g.total}</span>`;
      const rows = g.rows
        .map(({ row: r, fresh }, i) => {
          const who = r.cells[1] ?? '';
          /* A RULE WEARS NO LETTER, and an agent its maker's mark where the host draws one: `1 C` led every rule's line. */
          const run = runFaceOf(who, null, false);
          const mark = g.by === 'rule' ? null : markFor(o, said(who));
          const face = g.by === 'rule' ? null : initialOf(said(who));
          const lead = run
            ? runFaceHtml(run, o)
            : mark
              ? agentFaceHtml(mark, 'feed-face')
              : `<span class="feed-face" aria-hidden="true">${face ? escape(face) : ''}</span>`;
          const line = i === g.earlier ? `<li class="feed-seen">${escape(FEED_EARLIER)}</li>` : '';
          return `${line}<li class="feed-row"${fresh ? ' data-new' : ''}${toneAttrs(r.tone)} data-row="${escape(rowKey(r, b.rows.indexOf(r)))}"><span class="feed-count num">${
            feedBurst(said(r.cells[2])) ? drawn(r.cells[2]) : ''
          }</span>${lead}<span class="feed-what">${
            /* A RULE THAT WORDED ITS OWN LINE SENDS NO WHO ("Tallyard categorised"), and draws none: a dash in front of
               every rule's line read as something missing when nothing was. Anyone else without a name is still one. */
            who || g.by !== 'rule' ? `<span class="feed-who">${who ? drawn(who) : MISSING}</span> ` : ''
          }${renderInline(feedCasedNodes(inline(r.cells[3] ?? '', o)), o)}${toneGlyph(r.tone)}</span><span class="feed-when" data-calm="">${drawn(r.cells[4])}</span></li>`;
        })
        .join('');
      /* ONE GROUP DRAWS NO HEAD (`feedPlan`'s `lone`). */
      const named = plan.lone ? '' : `<h3 class="feed-head">${escape(g.label)}${head}</h3>`;
      return `<div class="feed-group" data-by="${g.by}">${named}<ul class="feed-rows">${rows}</ul></div>`;
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
  const tiles = b.form === 'tiles';
  const lead = b.form === 'lead';
  const body = plan.items
    .map((item, n) => {
      /* `data-choice` IS THE NUMBER KEY THAT ANSWERS WITH AN OPTION, 1 to 9 (`cursor.ts`), so a host can press it. */
      /* ONLY THE CARD A PERSON ANSWERS NEXT SAYS WHY EACH WAY, under its pill (`queueReasoned`). Every other card is its
         question and its pills, with the reasons in a fold that opens on demand: Decide drew eight questions with a
         paragraph under every option, three screens of small print on a phone (visual review 3). */
      const reasoned = tiles || queueReasoned(n);
      const options = item.options
        .map(
          (opt, at) =>
            `<li class="queue-option"${opt.recommended ? ' data-recommended' : ''}${at < CHOICE_KEYS ? ` data-choice="${at + 1}"` : ''}>${visual(opt.shows, o)}<span class="queue-label">${escape(opt.label)}</span>${
              opt.recommended ? `<span class="queue-rec">${escape(QUEUE_RECOMMENDED)}</span>` : ''
            }${reasoned && opt.because ? `<span class="queue-because" data-calm="">${drawn(opt.because)}</span>` : ''}</li>`,
        )
        .join('');
      const because = item.options.filter((opt) => opt.because);
      const folded =
        reasoned || (because.length === 0 && !item.why)
          ? ''
          : `<details class="queue-ways queue-reasons"><summary class="queue-ways-toggle">${escape(QUEUE_REASONS)}</summary>${item.why ? `<p class="queue-why">${drawn(item.why)}</p>` : ''}${
              because.length
                ? `<ul class="queue-reasons-list">${because.map((opt) => `<li class="queue-reason"><span class="queue-reason-label">${escape(opt.label)}</span> ${drawn(opt.because)}</li>`).join('')}</ul>`
                : ''
            }</details>`;
      const key = ` data-row="${escape(rowKey(item.row, b.rows.indexOf(item.row)))}"`;
      /* THE BAND IS A LABEL AND NOT AN ARGUMENT. It sits after the ways to answer, at the end of the options row,
         because it is the answer to "how careful should this answer be" and not the card's content: on the by-line it
         floated alone at the far right of an otherwise calm, empty band (visual review 4). `data-cost` carries the
         band's own word so a stylesheet can weight the dearest one without matching on English. `call` draws no chip,
         as `QueueAnswer.svelte` draws none: every question here is the reader's call, so "Your call" said nothing. */
      const cost = item.costLabel && item.cost !== 'call' ? `<span class="queue-cost" data-cost="${escape(item.cost)}">${escape(item.costLabel)}</span>` : '';
      /* WHO ASKED AND WHEN ARE THE CARD'S SECONDARY LINE, shown on hover or focus (`data-calm`). */
      const by = `<p class="queue-by"><span class="queue-who" data-calm="">${drawn(item.who)}</span><span class="queue-when" data-calm="">${drawn(item.when)}</span></p>`;
      /* A QUESTION IS A CARD'S HEADLINE, so its money is said short: "was due 4 days ago, £39. Did it go through?" */
      const question = `<h3 class="queue-question">${drawn(symbolText(item.question, true))}</h3>`;
      const why = item.why ? `<p class="queue-why">${drawn(item.why)}</p>` : '';
      /* THE LEAD QUESTION IS DRAWN WHOLE (`queue lead`): what its agents recommend, why, and what accepting it changes,
         a line each, above its ways to answer. Only the first, which is the one a person answers next; the rest are
         the cards they always were. */
      if (lead && n === 0) {
        const suggested = item.options.find((opt) => opt.recommended);
        const does = item.does.length
          ? `<ul class="queue-does" aria-label="${escape(QUEUE_DOES)}">${item.does.map((line) => `<li class="queue-does-line">${drawn(line)}</li>`).join('')}</ul>`
          : '';
        return `<article class="queue-card queue-lead"${toneAttrs(item.row.tone)}${key}>${by}${question}${
          suggested ? `<p class="queue-suggested">${escape(queueSuggested(suggested.label))}</p>` : ''
        }${why}${does}<ul class="queue-options">${options}</ul>${cost}</article>`;
      }
      if (!tiles)
        return `<article class="queue-card"${toneAttrs(item.row.tone)}${key}>${by}${question}${reasoned ? why : ''}<ul class="queue-options">${options}</ul>${cost}${folded}</article>`;
      /* A TILE IS THE SAME CARD LED BY WHAT ITS RECOMMENDED OPTION IS, its ways to answer folded under it. The fold is a
         `details`, so it opens with no script in the mirror and in the app alike, and it starts shut: a tile that
         arrived showing one option picked out and the rest hidden would be the recommendation standing in for the
         choice. The recommendation is still a line of words, never a selection. */
      const suggested = item.options.find((opt) => opt.recommended);
      return `<article class="queue-card queue-tile"${toneAttrs(item.row.tone)}${key}>${suggested ? visual(suggested.shows, o) : ''}${by}${question}${
        suggested ? `<p class="queue-suggested">${escape(queueSuggested(suggested.label))}</p>` : ''
      }${why}<details class="queue-ways"><summary class="queue-ways-toggle">${escape(queueWays(item.options.length))}</summary><ul class="queue-options">${options}</ul></details>${cost}</article>`;
    })
    .join('');
  const said = escape(queueMore(plan.more));
  const more = plan.more === 0 ? '' : plan.moreHref ? `<a class="queue-more" href="${escape(hrefFor(o, plan.moreHref))}">${said}</a>` : `<p class="queue-more">${said}</p>`;
  return `<div class="queue">${body}${more}</div>`;
}

/**
 * What an option is, drawn in its own box beside its label (`src/queue.ts`), or nothing.
 *
 * THE BOX IS THE ONLY PLACE A COLOUR FROM THE RECORD IS WRITTEN, one `--swatch` a chip, and the chip is hidden from a
 * screen reader because six hex digits are not a name: the label beside it is. A figure is text and is read. A file is
 * drawn only where the host gave it an address of its own (`fileSrc`), with no alt text of its own for the same reason
 * the swatch has none.
 */
function visual(shows: QueueShows | null, o: RenderOptions): string {
  if (!shows) return '';
  if ('swatch' in shows)
    return `<span class="queue-visual" data-shows="swatch" aria-hidden="true">${shows.swatch.map((c) => `<span class="queue-swatch" style="--swatch:${escape(c)}"></span>`).join('')}</span>`;
  if ('figure' in shows) return `<span class="queue-visual" data-shows="figure"><span class="queue-figure num">${escape(shows.figure)}</span></span>`;
  const src = fileSrc(o.file?.(shows.file.row, shows.file.field));
  return src ? `<span class="queue-visual" data-shows="file"><img class="queue-file" src="${escape(hrefFor(o, src))}" alt=""></span>` : '';
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
  if (b.form === 'range') return range(b, o);
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
 * `progress range`: a row a line of a budget, its band from low to high on one scale for the block, what was spent
 * marked on it, and a total line (`src/progress.ts` `rangePlan`). `Progress.svelte` is this function's twin.
 *
 * ON `progress`'s OWN ROW AND TRACK, so a host that draws a goal already lays a range out; the band and the mark are
 * two spans inside the track the host places by `--from`, `--to` and `--at`. Every figure is also said in words beside
 * the track, so the drawing repeats what a reader can already read and the track's name says it once more for a
 * screen reader.
 */
function range(b: Block, o: RenderOptions): string {
  const said = (r: Row, i: number) => plain(inline(r.cells[i] ?? '', o));
  const plan = rangePlan(b.rows.map((r) => ({ spent: said(r, 1), low: said(r, 2), high: said(r, 3), ...(r.tone ? { tone: r.tone } : {}) })));
  if (b.rows.length === 0) return `<div class="prop progress" data-form="range"><p class="progress-empty">${escape(PROGRESS_NONE)}</p></div>`;
  const body = b.rows
    .map((r, i) => {
      const p = plan.bars[i]!;
      const track = p.drawable
        ? `<span class="progress-track" role="img" aria-label="${escape(rangeSentence(said(r, 0), p.spent, p.range))}" style="--from:${p.from};--to:${p.to}"><span class="progress-band"></span>${
            p.at === null ? '' : `<span class="progress-at" style="--at:${p.at}"></span>`
          }</span>`
        : '';
      return `<div class="progress-row"${toneAttrs(p.intent)}>${cell('progress-label', r.cells[0], o)}<span class="progress-figure num"><span class="progress-value">${escape(p.spent)}</span></span><span class="progress-range num">${escape(p.range)}</span>${track}${toneGlyph(p.intent)}</div>`;
    })
    .join('');
  /* FIGURES IN TWO UNITS GET THE SENTENCE WHERE THE TOTAL WOULD BE: a total of dashes under rows with no tracks said
     that something was missing and not what. */
  const total = plan.refused
    ? `<p class="progress-empty">${escape(plan.refused)}</p>`
    : `<div class="progress-row" data-total=""><span class="progress-label">${PROGRESS_TOTAL}</span><span class="progress-figure num"><span class="progress-value">${escape(
        progressSpentSaid(plan.total.spent),
      )}</span></span><span class="progress-range num">${escape(progressRangeSaid(plan.total.low, plan.total.high))}</span></div>`;
  return `<div class="prop progress" data-form="range">${body}${total}</div>`;
}

/**
 * `lines`: a measure over time as a line and the period before as a dashed one (`src/lines.ts`), the lead
 * figure with its change, a legend, the point labels, and the numbers as a table in a fold. `Lines.svelte`
 * is this function's twin; the pointer's readout is the component's alone, because nothing here moves.
 */
function lines(b: Block, o: RenderOptions): string {
  const plan = linesPlan(b.rows.map((r) => r.cells.map((c) => plain(inline(c, o)))));
  /* ONE READING IS A FIGURE, its value and when it was read, with no chart of one dot and no fold of one point. */
  if (plan.single)
    return `<div class="prop lines" data-single=""><p class="lines-lead"><span class="lines-now num">${escape(plan.single.value)}</span><span class="lines-against">${escape(
      linesOnly(plan.single, Boolean(b.heading)),
    )}</span></p></div>`;
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
 * `series`: bars by bucket over the scale's three lines, money in above zero and money out below, the `net` form's
 * line over them, the bucket names under them, and the numbers in a table for a screen reader (`src/series.ts`).
 *
 * THE BARS ARE HTML, a column a bucket, so a bar keeps its own width (no more than 24px) and its rounded end at any
 * size of tile: drawn in a stretched box, a bar was as wide as its slot made it and its corners came out as ellipses.
 * Each column holds its figures, shown on hover beside its bar, and before it in the right half (`data-flip`), where
 * after it the card would run off the tile. Only the net line is drawn in a box, under no rule of width.
 *
 * TOO FEW BUCKETS ARE A FIGURE, NOT A CHART (`drawn`): each series' total, said once, where two bars side by side read
 * as a comparison. The legend is drawn only where it tells two things apart; one series is named by the tile.
 */
function series(b: Block, o: RenderOptions): string {
  const plan = seriesPlan(
    b.rows.map((r) => r.cells.map((c) => plain(inline(c, o)))),
    b.form === 'net',
  );
  const net = b.form === 'net';
  const keyed = plan.drawn && (plan.series.length > 1 || net);
  const legend = keyed
    ? `<ul class="series-legend">${plan.series
        .map((s) => `<li class="series-key" data-dir="${s.dir}" data-step="${s.step}"><span class="series-swatch" aria-hidden="true"></span><span class="series-name">${escape(s.label)}</span></li>`)
        .join('')}${net ? `<li class="series-key" data-net=""><span class="series-swatch" aria-hidden="true"></span><span class="series-name">${SERIES_NET}</span></li>` : ''}</ul>`
    : '';
  const tip = (k: SeriesPlan['buckets'][number]): string =>
    `<span class="series-tip"><span class="series-tip-label">${escape(k.label)}${k.said ? ` ${escape(k.said)}` : ''}</span>${plan.series
      .map((s, i) => `<span class="series-tip-value">${escape(s.label)} <span class="num">${escape(k.values[i] ?? MISSING)}</span></span>`)
      .join('')}${net ? `<span class="series-tip-value">${SERIES_NET} <span class="num">${escape(k.net)}</span></span>` : ''}</span>`;
  const chart = plan.empty
    ? `<p class="series-empty">${escape(SERIES_NONE)}</p>`
    : !plan.drawn
      ? `<p class="series-totals">${plan.totals
          .map((t) => `<span class="series-total"><span class="series-total-value num">${escape(t.value)}</span> <span class="series-total-label">${escape(t.label)}</span></span>`)
          .join('')}</p>`
      : `<div class="series-plot" role="img" aria-label="${escape(`${plan.axis ? `${plan.axis}: ` : ''}${plan.sentence}`)}"><ol class="series-scale" aria-hidden="true">${plan.ticks
          .map((t) => `<li class="series-line"${t.zero ? ' data-zero=""' : ''} style="--y:${t.y}"><span class="series-line-label num">${escape(t.label)}</span></li>`)
          .join('')}</ol><ol class="series-cols" aria-hidden="true">${plan.buckets
          .map(
            (k, i) =>
              `<li class="series-col"${k.state ? ` data-state="${k.state}"` : ''}${i >= plan.buckets.length / 2 ? ' data-flip=""' : ''}>${plan.bars
                .filter((bar) => bar.bucket === i)
                .map(
                  (bar) =>
                    `<span class="series-bar" data-dir="${bar.dir}" data-step="${bar.step}"${bar.state ? ` data-state="${bar.state}"` : ''}${bar.end ? ' data-end=""' : ''} style="--y:${bar.y};--h:${bar.height}"></span>`,
                )
                .join('')}${tip(k)}</li>`,
          )
          .join('')}</ol>${
          plan.netLine
            ? `<svg class="series-chart" viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true"><path class="series-net" d="${plan.netLine}" vector-effect="non-scaling-stroke"></path><path class="series-dot" d="${plan.netDots}" vector-effect="non-scaling-stroke"></path></svg>`
            : ''
        }</div><ol class="series-ticks" aria-hidden="true">${plan.buckets
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
  const painted = (p: Readonly<Record<string, string>>): string =>
    Object.entries(p)
      .map(([k, v]) => ` ${k}="${v}"`)
      .join('');
  /* NO SENTENCE WHERE THE PAGE'S HEADLINE SAYS IT (`legend`): the flag on the crossing stays. */
  const said = plan.legend ? `<p class="forecast-said"${plan.warn ? ' data-intent="warn"' : ''}>${plan.warn ? toneGlyph('warn') : ''}${escape(plan.said)}</p>` : '';
  /* A CROSSING NEAR TODAY SETS THE TWO LABELS APART: today's balance under its dot, the flag's day after its rule. */
  const near = plan.cross?.near ? ' data-near-flag=""' : '';
  const axis = `<ol class="forecast-axis" aria-hidden="true">${plan.axis
    .map((a) => `<li class="forecast-axis-tick"${a.zero ? ' data-zero=""' : ''} style="--at:${a.at}">${escape(a.label)}</li>`)
    .join('')}</ol>`;
  const chart = `<div class="forecast-plot"><svg class="forecast-chart" viewBox="0 0 1000 100" preserveAspectRatio="none" role="img" aria-label="${escape(plan.sentence)}">${path('forecast-grid', plan.grid, painted(FORECAST_PAINT.grid))}${path('forecast-area', plan.area, painted(FORECAST_PAINT.area))}${path('forecast-area', plan.below, ` data-below=""${painted(FORECAST_PAINT.area)}`)}${path('forecast-zero', `M0 ${plan.zero}H1000`)}${plan.cross ? path('forecast-cross-rule', plan.cross.rule, painted(FORECAST_PAINT.rule)) : ''}${path('forecast-base', plan.base)}${path('forecast-past', plan.past)}${path('forecast-walk', plan.walk, painted(FORECAST_PAINT.walk))}${path('forecast-future', plan.future)}${path('forecast-low', plan.low)}${path('forecast-now', plan.now.d, painted(FORECAST_PAINT.now))}${plan.cross ? path('forecast-cross', plan.cross.d) : ''}</svg><span class="forecast-now-label num"${near} style="--at:${plan.now.at};--y:${plan.now.y}" aria-hidden="true">${escape(plan.now.label)}</span>${axis}${
    plan.cross ? `<span class="forecast-pin"${plan.cross.near ? ' data-side="end"' : ''} style="--at:${plan.cross.at}" aria-hidden="true">${TONES.warn.glyph} ${escape(plan.cross.day)}</span>` : ''
  }</div>`;
  const ticks = `<ol class="forecast-ticks" aria-hidden="true">${plan.ticks
    .map((t) => `<li class="forecast-tick"${t.edge ? ' data-edge=""' : ''} style="--at:${t.at}">${escape(t.label)}</li>`)
    .join('')}</ol>`;
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

/**
 * `roadmap`: tasks on one time axis (`src/roadmap.ts`), drawn as a timeline. Each row is a line of its own, its name in
 * the left column and its window as a bar on a track in the right, so no name can land on another or on a bar: the
 * names over a stretched drawing collided at every width (DIRECTION §39). A date with no effort is a dot on its day.
 * Across the top the axis names each Monday or each month, and today's line runs down every track.
 *
 * THE LIST IS THE CHART. It was a drawing with a lane list under it for a screen reader and a phone; now the one list
 * is what all three read, its name the plan's sentence. The bar's colour is the row's state, working, late or done, and
 * a late row keeps its named glyph, so the colour is never the only word. Its days are said beside the bar on hover
 * and under the name on a phone.
 *
 * A ROW THE PLAN SKIPPED IS NAMED UNDER THE TIMELINE, by its title. Drawn nowhere and said nowhere, a task whose due
 * day did not read would simply be missing, and nobody would know to fix it. Nothing here is interactive, and
 * `svelte/p/Roadmap.svelte` draws this same tree (`roadmap-parity.test.ts`); the drag is the Svelte twin's alone.
 */
function roadmap(b: Block, o: RenderOptions): string {
  const said = (r: Row, i: number): string => plain(inline(r.cells[i] ?? '', o));
  const rows = b.rows.map((r) => roadmapRow(said(r, 0), said(r, 1), said(r, 2), r.tone));
  const plan = roadmapPlan(rows, roadmapToday(o.now));
  const skipped = plan.skipped.length
    ? `<p class="roadmap-skipped">${escape(roadmapSkipped(plan.skipped.map((i) => rows[i]!.title || MISSING)))}</p>`
    : '';
  if (plan.empty) return `<div class="roadmap"><p class="roadmap-empty">${escape(ROADMAP_NONE)}</p>${skipped}</div>`;

  /* `--at` IS A SHARE OF THE WIDTH, as `blocks-charts.css` reads it for every chart's ticks (`calc(var(--at) * 100%)`). */
  const axis = `<ol class="roadmap-axis"${plan.weekly ? ' data-weekly=""' : ''} aria-hidden="true">${roadmapAxis(plan)
    .map((t) => `<li class="roadmap-tick" style="--at:${roadmapShare(t.x)}">${escape(t.label)}</li>`)
    .join('')}${plan.today === null ? '' : `<li class="roadmap-today" style="--at:${roadmapShare(plan.today)}">${ROADMAP_TODAY}</li>`}</ol>`;
  const lines = roadmapLines(plan);
  const list = `<ol class="roadmap-list" aria-label="${escape(roadmapSentence(plan))}">${lines
    .map(
      (p) =>
        `<li class="roadmap-item"${toneAttrs(p.tone)}${p.from === MISSING ? ' data-date=""' : ''}${roadmapFlip(p) ? ' data-flip=""' : ''} style="--at:${p.at};--span:${p.span}"><span class="roadmap-item-title">${escape(p.title)}${toneGlyph(p.tone)}</span> <span class="roadmap-item-when num">${escape(p.when)}</span><span class="roadmap-item-track" aria-hidden="true"><span class="roadmap-bar"></span></span></li>`,
    )
    .join('')}</ol>`;

  return `<div class="roadmap" style="--rows:${lines.length}">${axis}${list}${skipped}</div>`;
}

/**
 * `ring`: a small dial with its figure in the centre, beside the rows as words (`src/ring.ts`). One row is progress
 * toward a target and says its value of the target and what is left; two to five are parts, said as a legend of dots
 * in the arcs' steps, as `split` says its parts. `svelte/p/Ring.svelte` draws this same tree (`ring.test.ts`).
 *
 * THE CENTRE FIGURE IS HIDDEN FROM A SCREEN READER, because the dial's own name already says it and the words
 * beside the dial say every figure again; heard three times it would be noise. A row whose value does not read
 * draws no dial at all, and the words stay.
 */
function ring(b: Block, o: RenderOptions): string {
  const said = (r: Row, i: number): string => plain(inline(r.cells[i] ?? '', o));
  const drawn = (v: string | undefined): string => renderInline(inline(v ?? '', o), o);
  const plan = ringPlan(b.rows.map((r) => ({ label: said(r, 0), value: said(r, 1), third: said(r, 2), ...(r.tone ? { tone: r.tone } : {}) })));
  if (plan.empty) return `<div class="prop ring"><p class="ring-empty">${escape(RING_NONE)}</p></div>`;

  const paint = (p: Readonly<Record<string, string>>): string =>
    Object.entries(p)
      .map(([k, v]) => ` ${k}="${v}"`)
      .join('');
  const circle = (cls: string, attrs: string): string => `<circle class="${cls}"${attrs} cx="18" cy="18" r="16" pathLength="100"></circle>`;
  const dial = plan.ring
    ? `<div class="ring-dial"><svg class="ring-mark" viewBox="0 0 36 36" role="img" aria-label="${escape(plan.name)}">${circle('ring-track', paint(RING_PAINT.track))}${plan.arcs
        .map((a) =>
          circle(
            'ring-arc',
            ` data-step="${a.step}"${toneAttrs(a.tone)}${paint(RING_PAINT.arc)} stroke-opacity="${RING_STEP_OPACITY[a.step]}" stroke-dasharray="${a.dash}" stroke-dashoffset="${a.offset}" transform="rotate(-90 18 18)"`,
          ),
        )
        .join('')}</svg>${plan.centre ? `<span class="ring-figure num" aria-hidden="true">${escape(plan.centre)}</span>` : ''}</div>`
    : '';

  if (plan.form === 'progress') {
    const r = b.rows[0]!;
    const target = r.cells[2] ? `<span class="ring-of">${RING_OF}</span><span class="ring-target">${drawn(headlineFigure(r.cells[2]))}</span>` : '';
    return `<div class="prop ring" data-form="progress">${dial}<div class="ring-row"${toneAttrs(plan.intent)}><span class="ring-label">${drawn(r.cells[0])}</span><span class="ring-figures num"><span class="ring-value">${drawn(headlineFigure(r.cells[1] || MISSING))}</span>${target}</span>${
      plan.left ? `<span class="ring-left num">${escape(plan.left)}</span>` : ''
    }${toneGlyph(plan.intent)}</div></div>`;
  }

  const legend = `<ul class="ring-legend">${b.rows
    .map((r, i) => {
      const arc = plan.arcs.find((a) => a.row === i);
      const share = plan.shares[i];
      return `<li class="ring-item"${toneAttrs(r.tone)}><span class="ring-dot"${arc ? ` data-step="${arc.step}"` : ''} aria-hidden="true"></span><span class="ring-label">${drawn(r.cells[0])}</span><span class="ring-value num">${drawn(headlineFigure(r.cells[1] || MISSING))}</span>${
        share ? `<span class="ring-share num">${escape(share)}</span>` : ''
      }${r.cells[2] ? `<span class="ring-note">${drawn(r.cells[2])}</span>` : ''}${toneGlyph(r.tone)}</li>`;
    })
    .join('')}</ul>`;
  return `<div class="prop ring" data-form="parts">${dial}${legend}</div>`;
}

/**
 * `heat`: twelve weeks by weekday, each day a cell washed by how busy it was (`src/heat.ts` over `src/days.ts`).
 * The cells come week by week, Monday first, and the host's stylesheet flows them into seven rows, so no cell
 * carries its own position; `--weeks` is how many columns there are. `svelte/p/Heat.svelte` is this function's twin.
 *
 * THE GRID IS ONE PICTURE WITH ONE NAME, and each day says its date and count only as a hover: eighty-four named
 * cells would be eighty-four stops for a screen reader to walk through to learn one sentence. The counted days are
 * said again as a table under it, which is what that reader reads, as every other chart here does.
 */
function heat(b: Block, o: RenderOptions): string {
  const said = (r: Row, i: number): string => plain(inline(r.cells[i] ?? '', o));
  if (b.form === 'who') return heatPeople(b, said, o);
  const plan = heatPlan(
    b.rows.map((r) => ({ day: said(r, 0), value: said(r, 1) })),
    roadmapToday(o.now),
  );
  const skipped = plan.skipped.length
    ? `<p class="heat-skipped">${escape(heatSkipped(plan.skipped.map((i) => said(b.rows[i]!, 0) || MISSING)))}</p>`
    : '';
  const outside = plan.outside ? `<p class="heat-outside">${escape(heatOutside(plan.outside))}</p>` : '';
  if (plan.empty) return `<div class="heat"><p class="heat-empty">${escape(HEAT_NONE)}</p>${skipped}${outside}</div>`;

  const cells = plan.cells
    .map((c) => {
      const title = heatTitle(c);
      return `<span class="heat-day"${c.today ? ' data-today=""' : ''}${c.future ? ' data-future=""' : ''}${c.wash === null ? '' : ` data-wash="${c.wash}"`}${
        title === null ? '' : ` title="${escape(title)}"`
      }></span>`;
    })
    .join('');
  /* A FOLD, NOT A TABLE STANDING OPEN, since a day's count was only in `title`, which a finger cannot hover
     (`pages.md` §2.5 rank 11). `lines-numbers` and `lines-toggle` are the classes the `lines` block's own fold
     already carries and `packages/skin/blocks-charts.css` already styles, reused rather than repeated under a
     `heat-` name; the table inside keeps `heat-table`, its own. */
  const table = `<details class="lines-numbers"><summary class="lines-toggle">${LINES_NUMBERS}</summary><table class="heat-table"><thead><tr>${[HEAT_DAY, HEAT_VALUE]
    .map((h) => `<th scope="col">${escape(h)}</th>`)
    .join('')}</tr></thead><tbody>${heatLines(plan)
    .map((l) => `<tr><th scope="row">${escape(l.day)}</th><td class="num">${escape(l.count)}</td></tr>`)
    .join('')}</tbody></table></details>`;
  return `<div class="heat" style="--weeks:${plan.weeks}"><div class="heat-grid" role="img" aria-label="${escape(plan.name)}">${cells}</div>${table}${skipped}${outside}</div>`;
}

/**
 * `heat who`: a line a person across the twelve weeks, a dot in each week they were in touch (`heatPeoplePlan`).
 * Each person's dots are named in words, so there is no fold of numbers under it.
 */
function heatPeople(b: Block, said: (r: Row, i: number) => string, o: RenderOptions): string {
  const plan = heatPeoplePlan(
    b.rows.map((r) => ({ day: said(r, 0), who: said(r, 1) })),
    roadmapToday(o.now),
  );
  const skipped = plan.skipped.length ? `<p class="heat-skipped">${escape(heatMissed(plan.skipped.map((i) => said(b.rows[i]!, 0) || MISSING)))}</p>` : '';
  if (plan.empty) return `<div class="heat" data-form="who"><p class="heat-empty">${escape(HEAT_NONE)}</p>${skipped}</div>`;
  const people = plan.people
    .map(
      (p) =>
        `<li class="heat-person"><span class="heat-who">${escape(p.who)}</span><span class="heat-weeks" role="img" aria-label="${escape(heatPersonSaid(p, plan.weeks))}">${p.weeks
          .map(
            (on, w) =>
              `<span class="heat-week"${on ? ' data-on=""' : ''}${w === plan.weeks - 1 ? ' data-now=""' : ''}${on ? ` title="${escape(heatWeekTitle(plan.starts[w]!))}"` : ''}></span>`,
          )
          .join('')}</span></li>`,
    )
    .join('');
  const ticks = plan.ticks.map((t) => `<li class="heat-tick" style="--week:${t.week}">${escape(t.label)}</li>`).join('');
  const more = plan.more ? `<p class="heat-more">${escape(heatPeopleMore(plan.more))}</p>` : '';
  return `<div class="heat" data-form="who" style="--weeks:${plan.weeks}"><ol class="heat-people" aria-label="${escape(plan.name)}">${people}</ol><ol class="heat-ticks" aria-hidden="true">${ticks}</ol>${more}${skipped}</div>`;
}

/**
 * `calendar`: every month from the first row's to the last row's as a grid of weeks, Monday first, each day naming its
 * first rows and counting the rest, then an agenda of the days that hold anything (`src/calendar.ts` over
 * `src/days.ts`). `svelte/Calendar.svelte` is this function's twin.
 *
 * A MONTH IS A TABLE, because it is one: a caption naming the month, a head naming the weekdays, and a row a week,
 * which a screen reader walks by row and column as a sighted reader scans one. A day of the month either side is an
 * empty cell marked `data-outside`, so the columns hold. A busy day carries `data-count`, which is what a host drawing
 * the month as a strip of days on a phone puts a dot on, and the agenda under it says every row of every day.
 */
function calendar(b: Block, o: RenderOptions): string {
  const said = (r: Row, i: number): string => plain(inline(r.cells[i] ?? '', o));
  const plan = calendarPlan(b.rows, roadmapToday(o.now));
  const skipped = plan.skipped.length ? `<p class="calendar-skipped">${escape(calendarSkipped(plan.skipped.map((i) => said(b.rows[i]!, 0) || MISSING)))}</p>` : '';
  if (plan.empty) return `<div class="calendar"><p class="calendar-empty">${escape(CALENDAR_NONE)}</p>${skipped}</div>`;
  const item = (r: Row): string => `<li class="calendar-item"${toneAttrs(r.tone)}>${cell('calendar-title', r.cells[0] || MISSING, o)}${toneGlyph(r.tone)}</li>`;
  const items = (rows: readonly Row[]): string => (rows.length ? `<ul class="calendar-items">${rows.map(item).join('')}</ul>` : '');
  const head = `<thead><tr>${WEEKDAYS.map((d) => `<th scope="col" abbr="${d.long}">${d.short}</th>`).join('')}</tr></thead>`;
  const months = plan.months
    .map(
      (m) =>
        `<table class="calendar-month"><caption class="calendar-caption">${escape(m.label)}</caption>${head}<tbody>${m.weeks
          .map(
            (week) =>
              `<tr>${week
                .map((c) =>
                  c.inside
                    ? `<td class="calendar-cell"${c.today ? ' data-today=""' : ''}${c.count ? ` data-count="${c.count}"` : ''}><span class="calendar-num num">${c.num}</span>${items(c.items)}${
                        c.more ? `<span class="calendar-more">${escape(calendarMore(c.more))}</span>` : ''
                      }</td>`
                    : '<td class="calendar-cell" data-outside=""></td>',
                )
                .join('')}</tr>`,
          )
          .join('')}</tbody></table>`,
    )
    .join('');
  const agenda = `<ol class="calendar-agenda">${plan.days
    .map((d) => `<li class="calendar-day"${d.today ? ' data-today=""' : ''}><span class="calendar-date num">${escape(d.said)}</span>${items(d.items)}</li>`)
    .join('')}</ol>`;
  return `<div class="calendar">${months}${agenda}${skipped}</div>`;
}

/**
 * `link`: a list of addresses, each titled, with the host it leaves for under the title and a note after
 * (`src/links.ts`). `svelte/Links.svelte` is this function's twin.
 *
 * ON THE LIST'S OWN CLASSES, so a host that styles a `todo` draws a list of links as a list before it has a rule of
 * its own for one. The title is the anchor's words and nothing else, as plain text: a title written as a link of its
 * own would be an anchor inside an anchor. An address that leaves this BrainDog tells the page it came from nothing.
 */
function links(b: Block, o: RenderOptions): string {
  const lines = linkPlan(b.rows);
  if (lines.length === 0) return `<p class="links-empty">${escape(LINKS_NONE)}</p>`;
  const body = lines
    .map((l) => {
      const words = escape(plain(inline(l.title, o)) || MISSING);
      const title = l.href ? `<a class="item-title" href="${escape(hrefFor(o, l.href))}"${l.away ? ' rel="noreferrer"' : ''}>${words}</a>` : `<span class="item-title">${words}</span>`;
      const host = l.host ? `<span class="item-detail link-host">${escape(l.host)}</span>` : '';
      const note = l.note ? `<span class="item-meta link-note">${renderInline(inline(l.note, o), o)}</span>` : '';
      /* THE ROW'S GLYPH IN A WELL BEFORE THE TITLE, hidden because the title says what the row is; and a row with a
         well that stays in this BrainDog ends in a chevron, as a settings row does. The well is drawn for a glyph
         the host has no art for, empty, so the titles still line up; the chevron only with the host's art. */
      const d = l.icon ? glyphPath(l.icon, o) : null;
      const well = l.icon ? `<span class="link-well" aria-hidden="true">${d ? glyphSvg(d) : ''}</span>` : '';
      const chevron = l.icon && l.inApp ? glyphPath('chevron-right', o) : null;
      const end = chevron ? `<span class="link-chevron" aria-hidden="true">${glyphSvg(chevron)}</span>` : '';
      return `<li class="item">${well}${title}${host}${note}${end}</li>`;
    })
    .join('');
  return `<ul class="list" data-kind="link">${body}</ul>`;
}

/**
 * `gallery`: a tile a row, the picture where the host serves the file and the file's name where it is not a picture,
 * with the caption under either (`src/gallery.ts`). `svelte/Gallery.svelte` is this function's twin.
 *
 * THE PICTURE HAS NO TEXT OF ITS OWN, because the caption beside it is its name; a page's writer captions a picture
 * with the file's name when its list gave it none. It loads lazily, because a gallery is the one block that can put
 * two dozen pictures on a page at once.
 */
function gallery(b: Block, o: RenderOptions): string {
  const tiles = galleryPlan(b.rows, o.file);
  if (tiles.length === 0) return `<p class="gallery-empty">${escape(GALLERY_NONE)}</p>`;
  return `<ul class="gallery">${tiles
    .map(
      (t) =>
        `<li class="gallery-item">${t.src ? `<img class="gallery-picture" src="${escape(hrefFor(o, t.src))}" alt="" loading="lazy">` : ''}${
          t.name ? `<span class="gallery-file">${escape(t.name)}</span>` : ''
        }${t.caption ? cell('gallery-caption', t.caption, o) : ''}</li>`,
    )
    .join('')}</ul>`;
}

/**
 * `embed`: a video, a design or a map from one of `EMBED_PROVIDERS`, drawn as a facade (its title, whose it is, and a
 * link to the original), sized by `data-aspect` (`src/embed.ts`). `svelte/Embed.svelte` is this function's twin.
 *
 * NO FRAME, EVER, and that is the point of a facade in a copy with no script: the mirror and the digest cannot load
 * one, and a frame on a page before anybody asked for it would tell the provider who is reading. The Svelte drawer adds
 * a Load button to this same tree, and only a press there puts the frame on the page.
 */
function embed(b: Block, o: RenderOptions): string {
  const plan = embedPlan(b.rows);
  if (!plan) return `<p class="embed-empty">${escape(EMBED_NONE)}</p>`;
  const title = plan.title ? `<p class="embed-title">${renderInline(inline(plan.title, o), o)}</p>` : '';
  return `<div class="embed" data-provider="${plan.provider.id}" data-aspect="${plan.aspect}"><div class="embed-facade">${title}<p class="embed-from">${escape(plan.provider.name)}</p></div><a class="embed-open" href="${escape(
    hrefFor(o, plan.url),
  )}" rel="noreferrer">${escape(embedOpen(plan.provider.name))}</a></div>`;
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
  const spec = kindSpec(b.kind, o.kinds);
  /* A KIND NOBODY INSTALLED IS ONE LINE, the Svelte drawer's own: a host can build a `Block` by hand, or keep one it
     parsed while a pack was installed, and a renderer that throws takes the whole page with it. */
  if (!spec)
    return `<figure class="block" data-kind="${escape(b.kind)}"><p class="needs-client">Block “${escape(b.kind)}” needs a newer client.</p></figure>`;
  const draw = PRIMITIVE_RENDERERS[spec.primitive];
  const cap = captioned(b)
    ? `<figcaption class="block-head"${toneAttrs(b.tone)}>${toneGlyph(b.tone)}${renderInline(inline(b.heading ?? '', o), o)}</figcaption>`
    : '';
  const form = b.form ? ` data-form="${escape(b.form)}"` : '';
  return `<figure class="block block-${spec.primitive}" data-kind="${b.kind}"${form} data-primitive="${spec.primitive}"${toneAttrs(b.tone)}>${cap}${draw(b as never, o)}</figure>`;
}

/**
 * A degraded block shows exactly what the author typed, with the reason above it. It never renders
 * wrong and never renders nothing: a dropped block must read as feedback, and when the author is an
 * agent this is the only feedback channel that exists (05 §3).
 *
 * The same tree as `svelte/Degraded.svelte`, whose comment says why it is a quiet note: the reason,
 * then the source under `degraded-source`, which wraps inside its column rather than scrolling like a
 * `media` code block. The mirror has no Fix button because it has no host to hand the press to.
 */
function degraded(d: Degraded): string {
  return `<figure class="block block-degraded" data-code="${d.code}"><figcaption class="degraded-fix">${escape(d.fix)}</figcaption><pre class="degraded-source"><code>${escape(d.raw)}</code></pre></figure>`;
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

/**
 * A page's filter strip, read-only (`src/filters.ts`): each field as a group of words, "All" first, the choice the page
 * is narrowed to marked `data-on`, and how many more values there are past the first few. `svelte/Filters.svelte` is
 * its twin with no `onfilter`; with one, the same words are buttons and the rest a select.
 */
export function filtersHTML(filters: readonly Filter[], chosen: Readonly<Record<string, string>> = {}): string {
  const plans = filtersPlan(filters, chosen);
  if (plans.length === 0) return '';
  const choice = (label: string, on: boolean, count: number | null): string =>
    `<span class="filters-choice"${on ? ' data-on=""' : ''}>${escape(label)}${count === null ? '' : `<span class="filters-count num" data-calm="">${count}</span>`}</span>`;
  const groups = plans
    .map(
      (p) =>
        `<div class="filters-group" role="group" aria-label="${escape(p.label)}" data-control="${p.control}" data-field="${escape(p.field)}">${choice(FILTERS_ALL, p.all, null)}${p.shown
          .map((v) => choice(v.label, v.on, v.count))
          .join('')}${p.rest.length ? `<span class="filters-more">${escape(filtersMore(p.rest.length))}</span>` : ''}</div>`,
    )
    .join('');
  return `<div class="filters">${groups}</div>`;
}
