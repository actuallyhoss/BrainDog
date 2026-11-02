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

import { SPARKLINE_POINT, TONES, sectionTone, type KindSpec } from './kinds.ts';
import { kindSpec } from './kind-spec.ts';
import { cellNamesNothing, inline, magnitudeOfCell, text as plain, type Inline, type InlineOptions } from './inline.ts';
import { glyphPath } from './inline.ts';
import { MISSING, barFigure, barFigures, day, figureChars, headlineFigure, leadingCode, symbolFigure, symbolText, valueWord } from './format.ts';
import { CARDS_NEXT, CARDS_NONE, cardsCount, helpersOf, type Helpers, FOLD_HIDE, FOLD_SHOW, RUN_OPEN, TREND, agentMarkFill, cardLayout, cardTrend, counted, type AgentMark, initialOf, isDimmed, isQuiet, markGlyphOf, markOf, ringDash, ringOf, runFaceOf, runMarkOf, runTokens, trendOf, trendAhead, TREND_TODAY, TREND_WAIT, type RunCell, type RunFace } from './cards.ts';
import { FEED_DAY, FEED_EARLIER, feedBurst, feedCasedNodes, feedFold, feedNew, feedPlan } from './feed.ts';
import { FILTERS_ALL, filtersMore, filtersPlan, type Filter } from './filters.ts';
import { QUEUE_DOES, QUEUE_REASONS, QUEUE_RECOMMENDED, fileSrc, queueMore, queuePlan, queueReasoned, queueSuggested, queueWays, type QueueShows } from './queue.ts';
import { PATH_DONE, PATH_NEXT, pathMore, pathPlan, unvalued } from './path.ts';
import { INPUTS_NONE, inputsPlan } from './inputs.ts';
import { captureNowhere, capturePlan, capturePromptFor } from './capture.ts';
import { takeWorking, WORKING_GLYPH, WORKING_LABEL } from './working.ts';
import { TODO_META_JOIN, boardMeta, todoLines, todoTitle } from './todo.ts';
import {
  TIMELINE_CHIP,
  TIMELINE_UNDER,
  rowsCell,
  timelineCell,
  timelineChip,
  UNFILED_HINT,
  timelineDayHead,
  timelineDays,
  timelineDetails,
  timelineIn,
  timelineWordy,
  timelineNets,
  timelineRich,
  timelineTitle,
  timelineUnder,
  type TimelineChip,
} from './timeline.ts';
import { CHOICE_KEYS, rowKey } from './cursor.ts';
import { TABLE_CHUNK, TABLE_ROWS_LABEL, ariaSort, chunkRows, comparisonPlan, glyphColumn, intrinsicRows, cellIn, tableCellBody, tracksOf } from './table.ts';
import { AGENTS_EARLIER, agentsPlan } from './agents.ts';
import { SPLIT_AMOUNT, SPLIT_NONE, SPLIT_PART, SPLIT_SHARE, SPLIT_ZERO, splitFigures, splitListed, splitPlan, splitSentence, splitShare, splitSlot } from './split.ts';
import { slotOf } from './slot.ts';
import { BRIDGE_AMOUNT, BRIDGE_STEP, bridgePlanOf, bridgeSentence, bridgeWritten, signedOf } from './bridge.ts';
import { SERIES_NET, SERIES_NONE, SERIES_PALER, SERIES_UNDER, seriesPlan, type SeriesPlan } from './series.ts';
import { LINES_AGAINST, LINES_NONE, LINES_NUMBERS, againstSaid, linesAge, linesKeyed, linesOnly, linesPlan } from './lines.ts';
import { linesTrend } from './lines-trend.ts';
import { PROGRESS_ALL_BUDGETS, PROGRESS_NONE, budgetTotal, PROGRESS_OF, PROGRESS_TOTAL, progressPlan, progressRangeSaid, progressSentence, progressSpentSaid, rangePlan, rangeSentence } from './progress.ts';
import { AMOUNT_SPACE, writeFigure, type AmountSetting, type WrittenAmount } from './money.ts';
import {
  FORECAST_AXIS_BREAK,
  FORECAST_AXIS_BREAK_STYLE,
  FORECAST_BALANCE,
  FORECAST_LOWEST,
  FORECAST_MOVE,
  FORECAST_NEXT,
  FORECAST_NONE,
  FORECAST_NOW,
  FORECAST_NUMBERS,
  FORECAST_PAINT,
  FORECAST_WHAT,
  FORECAST_WHEN,
  baseKnobs,
  forecastEveryday,
  forecastFigure,
  forecastModel,
  forecastNext,
  forecastNextMore,
  forecastPlan,
  forecastSummary,
  listedSteps,
  nowPlaced,
  scenario,
  underNote,
} from './forecast.ts';
import { DIFF_GLYPHS, DIFF_WORDS, diffFolded, diffPlan, type DiffLine } from './diff.ts';
import { ROADMAP_LEGEND, ROADMAP_NONE, ROADMAP_TODAY, roadmapAxis, roadmapFlip, roadmapLegend, roadmapLines, roadmapPlan, roadmapRow, roadmapSentence, roadmapShare, roadmapSkipped, roadmapToday } from './roadmap.ts';
import { RING_NONE, RING_OF, RING_PAINT, RING_STEP_OPACITY, partsRing, ringPlan } from './ring.ts';
import { HEAT_DAY, HEAT_NONE, HEAT_SHARE_HEAD, HEAT_SHARE_LINE, HEAT_VALUE, heatLines, heatMissed, heatOutside, heatPeopleMore, heatPeoplePlan, heatPersonSaid, heatPlan, heatSkipped, heatTitle, heatWeekTitle } from './heat.ts';
import { CALENDAR_FEW, CALENDAR_NONE, CALENDAR_REST, CALENDAR_TODAY, CALENDAR_WEEK_NONE, WEEKDAYS, calendarMore, calendarOutside, calendarPlan, calendarSkipped, calendarStripPlan } from './calendar.ts';
import { LANES_NONE, LANES_NOW, laneHue, laneWho, lanesOutside, lanesPlan, lanesSentence, lanesSkipped } from './lanes.ts';
import { LINKS_NONE, linkPlan } from './links.ts';
import { GALLERY_NONE, galleryPlan, pictureSrc } from './gallery.ts';
import { EMBED_NONE, embedOpen, embedPlan } from './embed.ts';
import { formLines, formOf } from './form.ts';
import { hueOf } from './cards.ts';
import { pathRest, pathShort } from './path.ts';
import type { Block, Degraded, Markdown, Row, Segment } from './parse.ts';
import { actionLabels } from './actions.ts';
import { moreSaid, mostOf, type MostKeys } from './most.ts';
import { statChange } from './hero.ts';

export type RenderOptions = InlineOptions & {
  /**
   * The record's home currency, which the one writer of an amount spells every figure against (`money.ts`): `null` for
   * a record that has none, and left out by a host that does not say, which keeps each figure as its cell wrote it.
   */
  home?: string | null;
  /**
   * AN AMOUNT IN ANOTHER CURRENCY, RESTATED IN THE HOME ONE AS A GUIDE: `≈ EGP 51,744` under `$1,000.00`. Handed the
   * amount as its cell holds it (`readFigure` reads every form a cell does); the host answers the line under it, with its
   * own `≈`, or null where the amount is already in the home currency or there is no rate to say it at. Only the host holds the rates, so a host that passes nothing
   * draws each amount alone, as it always did. A ledger's line, a card's figure and the lead figure read it.
   */
  approx?: (figure: string) => string | null;
  /**
   * A PART'S CHIP, WHERE THE HOST KNOWS ONE: the glyph and colour slot of the category or account a bar's row or a
   * timeline line names (`Groceries`, `HSBC (EGP)`). The app answers it on Money's pages alone; a host that passes
   * nothing draws each row as it always did, so the HTML twin needs nothing.
   */
  partLook?: (label: string) => { glyph: string; slot: string | null } | null;
  /** The day a link opened a calendar on (`?day=`, `YYYY-MM-DD`): its cell is marked `aria-current="date"`. */
  day?: string | null;
  /** Turn a spoken id into an address. A link the host cannot resolve renders as plain text. */
  link?: (spoken: string) => string | null;
  /**
   * THE NAME A SPOKEN ID GOES BY, `tasks#3` as "Turn auto-renew back on" (31 October, AG21): a note drew "Tracked as #3"
   * where the task's name belonged. A host that knows no name answers `null` and the row's number stands.
   */
  refName?: (spoken: string) => string | null;
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
   * THE RECORD WRITES ITS ADDRESSES RECORD-RELATIVE AND THE HOST NAMES THE RECORD IN THE PATH. A queue's "N more"
   * is `/decide`, a capture's list is `/r/tasks?…`, a note's link is `/r/things/1`, and under a host served
   * from `/app/<slug>`, as the Cloud was then, every one of those left the app: a press loaded the marketing site's
   * 404. Under `/<slug>` today they would open the session's record and not the one on screen. The web app
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
  /**
   * What a block left with nothing says, as the host's page answers it: the block's `empty:` line where the block is
   * the page's lead, `keep` (`EMPTY_KEEP`) where its author wrote `empty: keep`, or `null` for nothing at all. A READ.
   *
   * A CHIP, A `spec` ROW, A FIGURE CELL OR A STONE WHOSE VALUE IS MISSING IS NOT DRAWN (`unvalued`), in both drawers,
   * for every reader: his project pages drew chips that were a name and a dash, and a row "Keeping it alive: lanternfish.example"
   * over a dash ("An empty or unused part is not drawn"). A block that has nothing left says this line
   * where there is one and is not drawn where there is none. Absent, which is a write-up, an export and the mirror,
   * there is never a line: the page's lead is the page's to name, never the renderer's.
   *
   * `keep` is the way back for an author who wants the nought: a ledger wants its blanks, and every part is drawn as it
   * was, a dash where the value is missing.
   */
  empty?: (b: Block) => string | null;
};

/** The `empty:` answer that keeps every part, the missing ones as a dash (`RenderOptions.empty`). */
export const EMPTY_KEEP = 'keep';

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

/**
 * A ledger row's chip (`timelineChip`): its glyph on its category's tint where the host has art for the glyph, else the
 * title's first letter, and a `?` on a line nothing has filed, with its hint (`UNFILED_HINT`) as its title. A picture beside words that already say the row, so it is
 * hidden from a screen reader. `List.svelte` draws the same element.
 */
function chipHtml(c: TimelineChip, o: RenderOptions): string {
  const art = c.glyph ? slotArt(c.glyph, o) : '';
  const attrs = `${c.colour ? ` data-slot="${c.colour}"` : ''}${c.unfiled ? ` data-unfiled="" title="${escape(UNFILED_HINT)}"` : ''}`;
  return `<span class="item-chip"${attrs} aria-hidden="true">${art || escape(c.unfiled ? '?' : c.letter)}</span>`;
}

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
        case 'bad':
          // The words say what is wrong and the class repeats it in the danger colour: never colour alone.
          return `<span class="bad">${renderInline(n.body, opts)}</span>`;
        case 'path':
          /* A PATH THAT NAMES NOTHING IS THE AUTHOR'S TEXT, DOTTED, like any token that was not one: no value will
             ever come, so it is no hole and has no dash. Only prose reaches here with one; a chip, a tile and
             a bar leave such a figure out (`drawnRows`). */
          if (n.named === false) return `<span class="unresolved">${escape(n.path)}</span>`;
          // A path with no value renders as the path, marked, and it is an AFFORDANCE: an
          // unknown is a hole, and a hole is a task somebody has to close (05 §7.5).
          if (n.resolved !== null) return `<span class="figure num">${escape(n.resolved)}</span>`;
          return opts.hole
            ? `<button type="button" class="hole" data-path="${escape(n.path)}">${escape(holeLabel(n.path))} ${MISSING}</button>`
            : `<span class="hole" data-path="${escape(n.path)}">${escape(holeLabel(n.path))} ${MISSING}</span>`;
        case 'typed': {
          const href = n.link === 'row' ? opts.link?.(n.arg) : n.link === 'day' ? opts.dayHref?.(n.arg) : null;
          const body = `<span class="typed num" data-form="${n.form}">${escape(typedText(n, opts))}</span>`;
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
const todoMeta = (parts: readonly string[], opts: RenderOptions): string =>
  parts.length ? `<span class="item-meta">${parts.map((c) => renderInline(inline(c, opts), opts)).join(TODO_META_JOIN)}</span>` : '';

/**
 * A board card's third and fourth cells, as the one quiet line under its title.
 *
 * THE THIRD CELL ALONE IS DRAWN AS IT ALWAYS WAS, empty span and all, so a three-cell board, or one a page
 * padded to four with a blank, is the markup it was before a card could carry a second fact.
 */
const boardDetail = (cells: readonly string[], opts: RenderOptions): string => {
  const parts = boardMeta(cells, opts.now);
  if ((cells[3] ?? '').trim() === '') return cell('card-detail', parts[0], opts);
  return `<span class="card-detail">${parts.map((c) => renderInline(inline(c, opts), opts)).join(TODO_META_JOIN)}</span>`;
};

/** The dot itself, said the same way `Table`, `Grid` and `List` say it. */
/* AND A TOOLTIP, because a dot is not self-explaining to somebody looking at it. A screen reader has
   been told since this shipped; a sighted reader was left with a mark and no way to ask what it means.
   `aria-label` still names it — `title` is only the hover. */
/** A task's title: its short name, and the rest of it quiet after it when there is more (`todoTitle`). */
const todoTitleHTML = (value: string | undefined, opts: RenderOptions): string => {
  const { text, working } = takeWorking(value ?? null);
  const { head, rest } = todoTitle(text ?? '');
  if (rest === '') return cell('item-title', value, opts);
  return `<span class="item-title">${working ? workingSpan() : ''}<span class="item-words">${renderInline(inline(head, opts), opts)}<span class="item-title-rest"> ${renderInline(inline(rest, opts), opts)}</span></span></span>`;
};

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

/**
 * A LATE PART IS STRIPED IN SVG TOO. The working accent is BrainDog red and late is a deeper red of the
 * same hue, so a late segment or arc beside a working one must differ by a mark and not by its shade alone. A CSS
 * stripe cannot reach an SVG shape, so the shape is painted with a `<pattern>` of its own, drawn in `--chart-late`
 * through `currentColor` (`.late-hatch` in `blocks-charts.css`) and in the block's own ink with no stylesheet. The
 * shape takes it as an inline `fill` or `stroke`, because the stylesheet's `--part` rule outranks any attribute.
 *
 * ITS ID IS THE BLOCK'S, AND ONE CALL NEVER HANDS IT OUT TWICE. `url(#id)` paints from the first element with that id
 * in the document, so two charts sharing one would paint from whichever came first, and from nothing at all when
 * that one sits in a closed fold. A hash of what the block says keeps the output the same for the same input; the
 * count within one `toHTML` call parts two blocks that say the same thing. `svelte/Split.svelte` and
 * `svelte/p/Ring.svelte` take theirs from `$props.id()`, which the parity test reads past.
 *
 * TWO CALLS STILL SHARE ONE, since the same input draws the same page (a host caches it), and the count starts again
 * with each call. So the paint names the late red after the pattern (`lateFill`): where the first pattern with that id
 * sits in a closed fold, or is gone, the part is painted flat in `--chart-late` instead of not at all (9).
 * With no stylesheet the fallback is the ink, as the pattern's is: an undefined variable would void the whole paint.
 */
const LATE = 'bad';
let lateSeen: Map<string, number> | null = null;

function lateId(b: Block): string {
  let h = 0x811c9dc5;
  for (const ch of `${b.kind}\u0000${b.heading ?? ''}\u0000${b.rows.map((r) => `${r.tone ?? ''}\u0001${r.cells.join('\u0001')}`).join('\u0002')}`)
    h = Math.imul(h ^ ch.codePointAt(0)!, 0x01000193);
  const base = `late-${(h >>> 0).toString(36)}`;
  if (!lateSeen) return base;
  const n = lateSeen.get(base) ?? 0;
  lateSeen.set(base, n + 1);
  return n ? `${base}-${n}` : base;
}

/** The paint of a late part: its pattern, and the late red where the pattern cannot be reached. */
const lateFill = (prop: 'fill' | 'stroke', id: string): string => `${prop}:url(#${id}) var(--chart-late, currentColor)`;

/** The stripes, one tile `w` by `h` in the drawing's own units: a diagonal band on the late red at 30%. */
const latePattern = (id: string, w: number, h: number): string =>
  `<defs><pattern class="late-hatch" id="${id}" patternUnits="userSpaceOnUse" width="${w}" height="${h}"><rect class="late-ground" width="${w}" height="${h}" fill="currentColor" fill-opacity="0.3"></rect><path class="late-stripe" d="M0 0H${w / 2}L0 ${h / 2}ZM${w} 0V${h / 2}L${w / 2} ${h}H0Z" fill="currentColor"></path></pattern></defs>`;

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

/** Whether a stat's trend cell is a run of gaps alone: a line asked for and not kept yet (`Grid.svelte` reads it too). */
export const trendWaits = (value: string): boolean => value.trim() !== '' && /^[-\s]+$/u.test(value);

/** A stat cell's line, or, where it asked for one and its past holds fewer than two nights, when the line starts. */
function trendOrWait(label: string, value: string, o: RenderOptions): string {
  return trendWaits(value) ? `<span class="cell-trend-wait">${escape(TREND_WAIT)}</span>` : trendSvg('cell-trend', label, value, o);
}

/**
 * A run of numbers as a small line, named by the numbers it was drawn from, or nothing when the run
 * has fewer than two. `stat`'s trend cell and `sparkline` draw it; `Trend.svelte` is its twin.
 */
function trendSvg(cls: string, label: string, value: string, o: RenderOptions): string {
  /* A RUN AHEAD (`@day` first) is the walk from today: its line, today marked at its start and its lowest point marked,
     and its two ends dated under it (`trendAhead`). `Trend.svelte` draws the same. */
  const ahead = trendAhead(plain(inline(value, o)));
  if (ahead) {
    const run = trendOf(ahead.run)!;
    const named = `${plain(inline(label, o)) || TREND}, ${TREND_TODAY.toLowerCase()} to ${ahead.to}: ${run.said.join(', ')}`;
    return `<span class="${cls}-ahead"><svg class="${cls}" viewBox="0 0 1000 100" preserveAspectRatio="none" role="img" aria-label="${escape(named)}"><path class="trend-area" d="${run.area}"></path>${run.zero ? `<path class="trend-zero" d="${run.zero}" vector-effect="non-scaling-stroke"></path>` : ''}<path class="trend-line" d="${run.d}" vector-effect="non-scaling-stroke"></path><path class="trend-today" d="${ahead.today}" vector-effect="non-scaling-stroke"></path><path class="trend-low" d="${ahead.low}" vector-effect="non-scaling-stroke"${run.below ? ' data-below=""' : ''}></path></svg><span class="trend-days" aria-hidden="true"><span>${escape(TREND_TODAY)}</span><span>${escape(ahead.to)}</span></span></span>`;
  }
  const t = trendOf(plain(inline(value, o)));
  if (!t) return '';
  const name = `${plain(inline(label, o)) || TREND}: ${t.said.join(', ')}`;
  /* A STAT'S SHORT RUN IS BARS; a `sparkline` keeps its line. */
  if (cls === 'cell-trend' && t.bars)
    return `<svg class="${cls}" viewBox="0 0 1000 100" preserveAspectRatio="none" role="img" aria-label="${escape(name)}"><path class="trend-bar" d="${t.bars}" vector-effect="non-scaling-stroke"></path></svg>`;
  return `<svg class="${cls}" viewBox="0 0 1000 100" preserveAspectRatio="none" role="img" aria-label="${escape(name)}"><path class="trend-area" d="${t.area}"></path><path class="trend-line" d="${t.d}" vector-effect="non-scaling-stroke"></path><path class="trend-end" d="${t.end}" vector-effect="non-scaling-stroke"></path></svg>`;
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

/* ── parts with no value ──────────────────────────────────────────────────── */

/** Whether the host asked this block to keep the parts with no value, each as a dash (`empty: keep`). */
export const keepsNought = (b: Block, o: RenderOptions): boolean => o.empty?.(b) === EMPTY_KEEP;

/** Whether any path in a run has no value, at any depth. */
const holed = (nodes: readonly Inline[]): boolean => nodes.some((n) => (n.type === 'path' ? n.resolved === null : 'body' in n ? holed(n.body) : false));

/** Whether a chip's figure, read as drawn, says something: not blank, not the dash, and holding no path with no value. */
const readsSomething = (cell: string | undefined, o: RenderOptions): boolean => {
  const nodes = inline(cell ?? '', o);
  return !holed(nodes) && !unvalued(plain(nodes));
};

/** The grid kinds with a drawer of their own, which this rule does not read: a card, a day and a picture are not figures. */
const OWN_GRID = new Set(['cards', 'heat', 'gallery', 'board']);

/**
 * The rows a chip run, a `spec` and a figure grid draw, each with its place in the block, which `cellHref` is keyed by.
 *
 * A CHIP NEEDS ITS FIGURE AND ITS WORD, a `spec` row and a figure cell their value (`unvalued`): the one that has none
 * is not drawn. Where the block keeps its noughts every row is drawn as it was, and a chip still needs both cells
 * written, since a chip with no word is a rebus whatever the author asked (05 §7.4). A chip, a figure cell and a bar whose
 * figure holds a path that names nothing (`UNNAMED`) are left out, kept noughts or not. Every other block draws every row.
 */
/**
 * Whether a `bar` block's rows are drawn with bars: while two of them or more could have one (a number, not below
 * nought, not a hole). A single bar is always the whole track, a share of itself, so one row is its words and figure.
 */
export function barsCompare(rows: readonly Row[], numeric: (r: Row) => number): boolean {
  let n = 0;
  for (const r of rows) {
    const v = numeric(r);
    if (!r.hole && Number.isFinite(v) && v >= 0) n++;
    if (n >= 2) return true;
  }
  return false;
}

export function drawnRows(b: Block, o: RenderOptions): { row: Row; at: number }[] {
  const all = b.rows.map((row, at) => ({ row, at }));
  const keep = keepsNought(b, o);
  const primitive = kindSpec(b.kind, o.kinds)?.primitive;
  /* A FIGURE THAT NAMES NOTHING (`UNNAMED`) IS LEFT OUT of a chip, a tile and a bar, nought-keeping or not: it is no
     nought, it is a path no figure of the record answers to, and in prose it is the author's text, dotted. */
  const named = ({ row: r }: { row: Row }) => !cellNamesNothing(r.cells[1], o);
  if (primitive === 'inline')
    /* THE CHIP'S FIGURE IS READ, as the bar's is: it was printed as typed, and nine chips on his record drew braces. A
       chip whose figure reads to nothing (an empty cell, the dash, a path with no value, `{{effortDays}}d` with none)
       is dropped: a chip is a figure and a word, and a hole is neither. */
    return all.filter((e) =>
      keep ? (e.row.cells[1] ?? '') !== '' && (e.row.cells[2] ?? '') !== '' && named(e) : named(e) && readsSomething(e.row.cells[1], o) && !unvalued(e.row.cells[2]),
    );
  const figures = (primitive === 'grid' && !OWN_GRID.has(b.kind)) || b.kind === 'bar';
  if (keep) return figures ? all.filter(named) : all;
  if (primitive === 'grid' && !OWN_GRID.has(b.kind)) return all.filter((e) => named(e) && !unvalued(e.row.cells[1]));
  if (b.kind === 'bar') return all.filter(named);
  if (primitive === 'rows' && b.kind !== 'inputs') return all.filter(({ row: r }) => !unvalued(r.cells[1]));
  return all;
}

/**
 * What a chip run, a `spec`, a figure grid or a path says once its parts with no value are gone: `undefined` while a
 * part is left (or it keeps its noughts, or it is a block this rule does not read), the host's `empty:` line where the
 * block is the page's lead (`RenderOptions.empty`), and `null` where nothing is drawn, not even the block's frame.
 */
export function emptied(b: Block, o: RenderOptions): string | null | undefined {
  const primitive = kindSpec(b.kind, o.kinds)?.primitive;
  const path = b.kind === 'steps' && b.form === 'path';
  const ruled = path || primitive === 'inline' || (primitive === 'grid' && !OWN_GRID.has(b.kind)) || (primitive === 'rows' && b.kind !== 'inputs');
  if (!ruled || keepsNought(b, o)) return undefined;
  if (path) {
    const plan = pathPlan(b.rows);
    if (plan.stones.length > 0 || plan.more > 0) return undefined;
  } else if (drawnRows(b, o).length > 0) return undefined;
  const line = o.empty?.(b)?.trim();
  return line ? line : null;
}

/** A block's `empty:` line, drawn in place of its parts. `svelte/p/*` and `svelte/Path.svelte` draw the same. */
const emptyLine = (line: string): string => `<p class="block-empty">${escape(line)}</p>`;

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
          .map((r) => `<div class="card">${cell('card-title', r.cells[1], o)}${boardDetail(r.cells, o)}</div>`)
          .join('')}</div>`;
      })
      .join('');
    return `<div class="grid" style="--cells:${columns.length}">${body}</div>`;
  }
  // A layout primitive must be TOLD how many things it contains. It must never infer the count from
  // the space available — three tiles once drew seven auto-fit tracks and a 550px slab of border
  // colour, and every selector was correct (05 §4).
  /* A FIGURE WITH NO VALUE IS NOT DRAWN (`drawnRows`), and the tiles are counted after: "Costs a year" over a dash
     was a tile that said nothing, and a fourth track held its place. */
  const shown = drawnRows(b, o).map(({ row }) => row);
  const body = shown
    .map((r, i) => {
      /* THE SAME FIGURE IN THE HOME CURRENCY, under a figure in another one, where the host can say it (`approx`). */
      const approx = r.cells[1] && o.approx ? o.approx(r.cells[1].trim()) : null;
      /* THE LEAD FIGURE'S CHANGE AS A CHIP in front of the rest of its note (`statChange`), on the lead figure alone. */
      const note = r.cells[2] ? symbolText(r.cells[2], true, o.home) : '';
      const change = b.form === 'lead' && i === 0 ? statChange(note) : null;
      const noted = change
        ? `<span class="cell-note"><span class="cell-change num" data-dir="${change.dir}">${escape(change.change)}</span>${change.rest ? ` ${renderInline(inline(change.rest, o), o)}` : ''}</span>`
        : cell('cell-note', note, o);
      return `<div class="cell"${toneAttrs(r.tone)}>${cell('cell-label', r.cells[0], o)}<span class="cell-figure num"${fitAttrs(r.cells[1] && headlineFigure(r.cells[1], o.home))}>${
        /* The code quiet or the symbol in its place, as `Grid.svelte` draws it: this printed the
           code at full size, and the two trees differed on every stat with an amount in it. A stat's
           figure is a headline, so it is said the way `headlineFigure` says one: `£33,850`, not `£33,850.00`. */
        r.cells[1] ? amount(r.cells[1], o) : MISSING
      }</span>${approx ? `<span class="cell-approx num">${escape(approx)}</span>` : ''}${trendOrWait(r.cells[0] ?? '', r.cells[3] ?? '', o)}${noted}${toneGlyph(r.tone)}</div>`;
    })
    .join('');
  return `<div class="grid" style="--cells:${shown.length}">${body}</div>`;
}

/**
 * WHETHER A ROW'S VALUE IS A FIGURE (audit 31 Oct i, AI10): a figure keeps `num` and stays on one line; words wrap.
 * "code, run in a sandbox and never inside the record" was held to one line and cut at "reco" on a phone. A value with a
 * digit and no word longer than three letters is a figure ("£4,050", "Tue 15 Sep", "GBP 14.00", "3.2%").
 */
export const isFigure = (text: string | undefined): boolean => text !== undefined && /\d/u.test(text) && !/\p{L}{4,}/u.test(text);

function rows(b: Block, o: RenderOptions): string {
  if (b.kind === 'inputs') return inputs(b, o);
  /* A DAY THIS YEAR DROPS ITS YEAR, AND MONEY MOVING BY NOTHING IS NOT SAID (`rowsCell`). An empty value is still
     `MISSING`; a value said as nothing is a known nothing, and draws no mark at all. */
  /* A ROW WITH NO VALUE IS NOT DRAWN (`drawnRows`): "Keeping it alive: lanternfish.example" over a dash said a name and nothing.
     Where the block keeps its noughts, a blank value is `MISSING` again. */
  const body = drawnRows(b, o)
    .map(({ row: r }) => {
      const value = r.cells[1] ? rowsCell(r.cells[1], o.now) : undefined;
      return `<div class="row">${cell('row-label', r.cells[0], o)}<span class="${value === undefined || isFigure(value) ? 'row-value num' : 'row-value'}">${
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
    return `<div class="prop"><div class="prop-row"${toneAttrs(r.tone)}>${cell('prop-label', r.cells[0], o)}<span class="prop-track" style="--magnitude:${magnitude(m)}"></span><span class="prop-value num">${drawn(gaugeFigure(r.cells[1], o))}</span><span class="prop-note num">of ${drawn(gaugeFigure(r.cells[2], o))}</span>${toneGlyph(r.tone)}</div></div>`;
  }
  const scale = Math.max(0, ...b.rows.filter((r) => !r.hole).map(numeric).filter(Number.isFinite));
  /* A BAR WHOSE FIGURE NAMES NOTHING IS LEFT OUT (`drawnRows`); one with no value yet keeps its dash and its hole. */
  const listed = drawnRows(b, o);
  /* THE BARS' FIGURES ARE ONE SET (`barFigures`): all whole, or all to the same places. */
  const figures = barFigures(listed.map(({ row: r }) => r.cells[1] ?? MISSING), o.home);
  /* A BAR OF ONE COMPARES NOTHING (empty states, 2 Nov): Money's Accounts with one account drew a track the whole width
     of the tile, a share of 100% of itself. Bars are drawn while two rows or more have one (`barsCompare`). */
  const compare = barsCompare(listed.map(({ row }) => row), numeric);
  const body = listed
    .map(({ row: r }, i) => {
      const v = numeric(r);
      /* A NEGATIVE VALUE LOSES ITS BAR, like a value that is not a number. The scale has one
         side, so the only bar it could draw for a credit is a bar of length zero, and a bar at zero
         claims the value IS zero. The number is still printed, with its sign. */
      const drawable = compare && Number.isFinite(v) && v >= 0 && !r.hole && scale > 0;
      const track = drawable ? `<span class="prop-track" style="--magnitude:${magnitude(v / scale)}"></span>` : '';
      const inner = `${cell('prop-label', r.cells[0], o)}${track}<span class="prop-value num">${drawn(figures[i] ?? MISSING)}</span>${cell('prop-note', r.cells[2], o)}${toneGlyph(r.tone)}`;
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
  // A chip whose figure is the dash a reader prints for null is dropped as well (`drawnRows`): his notes drew chips
  // that were a name and a dash. The figure is read through the inline reader, as the bar's is, so `{{tasks.open}}`
  // prints the count and never its braces.
  const body = drawnRows(b, o)
    .map(
      ({ row: r }) =>
        `<span class="pill"${toneAttrs(r.tone)}><span class="pill-glyph" data-glyph="${escape(r.cells[0] ?? '')}" aria-hidden="true">${slotArt(r.cells[0] ?? '', o)}</span><span class="pill-figure num">${renderInline(inline(r.cells[1] ?? '', o), o)}</span><span class="pill-word">${escape(valueWord(r.cells[2] ?? ''))}</span>${toneGlyph(r.tone)}</span>`,
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
  if (b.kind === 'form') return formText(b);
  if (b.kind === 'calendar') return calendar(b, o);
  if (b.kind === 'lanes') return lanes(b, o);
  if (b.kind === 'link') return links(b, o);
  const tag = kindSpec(b.kind, o.kinds)?.ordered ? 'ol' : 'ul';
  const days = b.kind === 'timeline' ? timelineDays(b.rows) : [];
  const details = b.kind === 'timeline' ? timelineDetails(b.rows, o.now, o.home) : [];
  const grouped = days.some((d) => d !== null);
  const nets = b.kind === 'timeline' ? timelineNets(days, details) : [];
  const rich = b.kind === 'timeline' && timelineRich(b.rows);
  const body = b.rows
    .map((r, i) => {
      /* EVERY ROW CARRIES ITS KEY (`cursor.ts`), so a host walks a page's rows with one query across its blocks. */
      const key = ` data-row="${escape(rowKey(r, i))}"`;
      if (b.kind === 'todo') {
        const lines = todoLines(r.cells, o.now, r.done === true);
        return `<li class="item"${key}><span class="item-marker" data-done="${r.done ? 'yes' : 'no'}" role="img" aria-label="${r.done ? 'done' : 'not done'}">${r.done ? '✓' : ''}</span>${todoTitleHTML(r.cells[0], o)}${cell('item-detail', lines.detail, o, timelineIn(lines.detail) ? ' data-sign="in"' : '')}${todoMeta(lines.meta, o)}</li>`;
      }
      if (b.kind === 'timeline') {
        /* A GROUPED TIMELINE SAYS EACH DAY ONCE, over its rows, and the rows under it leave their own date blank
           (`timeline.ts`). The heading is an item of the list, so the list stays a list of its children. */
        const day = days[i] ?? null;
        /* EACH CELL AS IT IS SAID (`timelineCell`): a day this year without its year, and an amount of nothing not at all. */
        /* WITH ITS WEEKDAY, AND THE DAY'S NET AT ITS END where its lines are in one currency (`timelineNets`). */
        const net = nets[i] ?? null;
        const head =
          day === null
            ? ''
            : `<li class="item-day num"><span class="item-day-name">${renderInline(inline(timelineDayHead(day, o.now), o), o)}</span>${net ? `<span class="item-day-net">${escape(net)}</span>` : ''}</li>`;
        /* MONEY COMING IN IS THE ONE AMOUNT IN COLOUR (`timelineIn`); money going out stays ink. */
        const said = details[i] ?? '';
        const sign = timelineIn(said) ? ' data-sign="in"' : '';
        /* THE MONEY ROW (`timelineRich`): the chip, the title, the amount, and under them the quiet line and the amount
           restated in the home currency where the host can say it. */
        if (rich) {
          const title = timelineTitle(r.cells[1]);
          const chip = timelineChip(r.cells[TIMELINE_CHIP], plain(inline(title, o)), plain(inline(r.cells[TIMELINE_UNDER[0]] ?? '', o)));
          /* A MOVE BETWEEN YOUR OWN ACCOUNTS IS NO MONEY IN, so its amount stays ink (`TIMELINE_BETWEEN`). */
          const signed = chip.between ? '' : sign;
          const approx = said && o.approx ? o.approx((r.cells[2] ?? '').trim()) : null;
          return `${head}<li class="item" data-rich=""${toneAttrs(r.tone)}${key}>${chipHtml(chip, o)}${cell('item-title', title, o, '', toneGlyph(r.tone))}${cell('item-detail', said, o, signed)}${cell('item-under', timelineUnder(r.cells, o.now, grouped), o)}${approx ? `<span class="item-approx num">${escape(approx)}</span>` : ''}</li>`;
        }
        /* THE GLYPH SITS WITH THE TITLE, as `List.svelte` has drawn it since a tone five hundred pixels
           from the thing it qualifies was found to qualify nothing (13 §2.3). This drew it after the
           detail instead, so the two renderers differed on every timeline row that carried a tone, and
           no shape here was a timeline with one. */
        const marker = grouped ? '<span class="item-marker num"></span>' : cell('item-marker num', timelineCell(r.cells[0], o.now), o);
        return `${head}<li class="item"${toneAttrs(r.tone)}${key}${timelineWordy(said) ? ' data-wordy=""' : ''}>${marker}${cell('item-title', timelineTitle(r.cells[1]), o, '', toneGlyph(r.tone))}${cell('item-detail', said, o, sign)}</li>`;
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
  /* A STONE WITH NO STEP IS NOT DRAWN, unless the block keeps its noughts (`pathPlan`). */
  const plan = pathPlan(b.rows, keepsNought(b, o));
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
 * One line of a table as drawn: a group's heading, or a row and its place among the rows drawn (`at`, the caret's).
 *
 * HERE AND NOT IN `table.ts`, because both tables already read this file: `Table.svelte` takes `hrefFor` from it.
 */
export type TableLine<R> = { kind: 'group'; name: string; count: number } | { kind: 'row'; row: R; at: number };

/**
 * A table's rows in groups, as both renderers draw them: each group under one heading with its count, the groups in
 * the order the first row of each stands, and a group's rows in the order the record read them.
 *
 * A ROW IN NO GROUP IS DRAWN BEFORE THE FIRST HEADING, in the record's order. A table has no edge under a group, so a
 * row drawn after a heading reads as that group's: before them all is the one place a row stands under no heading.
 * A GROUP OF ONE IS STILL A GROUP: a table of states heads every state it holds, where a card of one stays loose.
 * NO ROW IN ANY GROUP, and the lines are the rows as they came, which is the table drawn exactly as it was.
 */
export function tableLines<R>(rows: readonly R[], groupOf: (row: R) => string | null | undefined): TableLine<R>[] {
  const named = rows.map((r) => groupOf(r)?.trim() || null);
  const members = new Map<string, R[]>();
  rows.forEach((r, i) => {
    const g = named[i];
    if (g) members.set(g, [...(members.get(g) ?? []), r]);
  });
  if (members.size === 0) return rows.map((row, at) => ({ kind: 'row', row, at }));
  const lines: TableLine<R>[] = rows.flatMap((row, i): TableLine<R>[] => (named[i] ? [] : [{ kind: 'row', row, at: 0 }]));
  for (const [name, held] of members) lines.push({ kind: 'group', name, count: held.length }, ...held.map((row): TableLine<R> => ({ kind: 'row', row, at: 0 })));
  let at = 0;
  return lines.map((l) => (l.kind === 'row' ? { ...l, at: at++ } : l));
}

/**
 * A group's heading in a table, as `Table.svelte` writes it: one cell across the columns, the group's name and its
 * count. `at` is its `aria-rowindex`.
 */
export const groupHead = (name: string, count: number, at: number, columns: number): string =>
  `<div class="tr tr-group" role="row" aria-rowindex="${at}"><span class="td" role="gridcell" aria-colspan="${columns}" style="grid-column:1/-1"><span class="group-name">${escape(name)}</span> <span class="group-count">${count}</span></span></div>`;

/** A row's group as a host put it on the row, by name: `group` when it is words, and nothing otherwise. */
export const rowGroup = (row: object): string | null => {
  const g = (row as { group?: unknown }).group;
  return typeof g === 'string' && g.trim() !== '' ? g.trim() : null;
};

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
  /* EACH GROUP UNDER ITS HEADING (`tableLines`), a heading being a row of the grid, so `aria-rowindex` counts it. A
     group comes from the row the host built, `group` on it, which the dialect never writes: no group, no heading. */
  const lines = tableLines(
    rows.map((row, i) => ({ row, group: rowGroup(b.rows[i + 1] ?? {}) })),
    (r) => r.group,
  );
  const grouped = chunkRows(lines, TABLE_CHUNK);
  const body = grouped.groups
    .map((group, g) => {
      const trs = group
        .map((line, i) => {
          const index = g * grouped.step + i;
          if (line.kind === 'group') return groupHead(line.name, line.count, index + 2, columns.length);
          const { row } = line.row;
          const tds = columns
            .map((column, c) => {
              const drawn = tableCellBody(row.cells[c] ?? null, o.home, o.now);
              const inner =
                drawn.body.kind === 'missing'
                  ? `<span class="missing">${MISSING}</span>`
                  : drawn.body.kind === 'coded'
                    ? `<span class="amount"${cellIn(drawn.body) ? ' data-sign="in"' : ''}>${escape(drawn.body.sign)}<span class="amount-code">${escape(drawn.body.currency)}</span>${AMOUNT_SPACE}${escape(drawn.body.rest.slice(0, figureEnd(drawn.body.rest)))}</span>${escape(drawn.body.rest.slice(figureEnd(drawn.body.rest)))}`
                    : cellIn(drawn.body)
                      ? `<span class="amount" data-sign="in">${escape(drawn.body.text)}</span>`
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
  const tracks = tracksOf(columns);
  return (
    `<div class="table-region" role="group" tabindex="0" aria-label="${escape(label)}">` +
    `<div class="table" role="grid" aria-rowcount="${lines.length + 1}" aria-colcount="${columns.length}" style="--cols:${tracks}" tabindex="-1">` +
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
/** A split part's identity slot as an attribute, from its fourth cell (`splitSlot`). */
const slotAttr = (r: Row): string => {
  const slot = splitSlot(r.cells[3]);
  return slot ? ` data-slot="${slot}"` : '';
};

function split(b: Block, o: RenderOptions): string {
  const rows = b.rows.filter((r) => !r.hole);
  const holes = b.rows.filter((r) => r.hole);
  /* Signed as drawn, so `−£40.00` is a credit with no part rather than a part of 40. */
  const values = rows.map((r) => signedOf(plain(inline(r.cells[1] ?? '', o))));
  const plan = splitPlan(values);
  const partOf = (i: number) => plan.parts.find((p) => p.at === i);
  const said = (r: Row) => plain(inline(r.cells[0] ?? '', o));
  /* The track is 1000 by 100 stretched to its box, so the 10 by 60 tile's stripe follows its width: about 3px apart on
     a phone's full-width track, 5px on a wide tile's. */
  const late = plan.parts.some((p) => rows[p.at]!.tone === LATE) ? lateId(b) : '';
  /* THE DONUT FORM (`split donut`): the same parts as a thin ring with their total in the middle, each arc in its row's
     own colour where it names one. The legend under it is the same. */
  const donut = b.form === 'donut' && !plan.empty ? partsRing(rows.map((r) => ({ label: said(r), value: plain(inline(r.cells[1] ?? '', o)), third: '' })), o.home) : null;
  const track = plan.empty
    ? `<p class="split-empty">${escape(SPLIT_ZERO)}</p>`
    : donut
      ? `<div class="ring-dial"><svg class="ring-mark" viewBox="0 0 36 36" role="img" aria-label="${escape(donut.name)}">${late ? latePattern(late, 4, 4) : ''}<circle class="ring-track" fill="none" stroke="currentColor" stroke-opacity="0.15" stroke-width="4" cx="18" cy="18" r="16" pathLength="100"></circle>${donut.arcs
          .map(
            (a) =>
              `<circle class="ring-arc" data-step="${a.step}"${slotAttr(rows[a.row]!)}${toneAttrs(rows[a.row]!.tone)} fill="none" stroke="currentColor" stroke-width="4"${rows[a.row]!.tone === LATE ? ` style="${lateFill('stroke', late)}"` : ''} stroke-dasharray="${a.dash}" stroke-dashoffset="${a.offset}" transform="rotate(-90 18 18)" cx="18" cy="18" r="16" pathLength="100"></circle>`,
          )
          .join('')}</svg>${donut.centre ? `<span class="ring-figure num" aria-hidden="true">${renderInline(inline(headlineFigure(donut.centre, o.home), o), o)}</span>` : ''}</div>`
      : `<svg class="split-track" viewBox="0 0 1000 100" preserveAspectRatio="none" role="img" aria-label="${escape(
        splitSentence(plan.parts.map((p) => ({ label: said(rows[p.at]!), share: p.share }))),
      )}">${late ? latePattern(late, 10, 60) : ''}${plan.parts
        .map(
          (p) =>
            `<rect class="split-seg" data-step="${p.step}"${slotAttr(rows[p.at]!)}${toneAttrs(rows[p.at]!.tone)}${rows[p.at]!.tone === LATE ? ` style="${lateFill('fill', late)}"` : ''} x="${p.x}" y="0" width="${p.width}" height="100"></rect>`,
        )
        .join('')}${plan.cuts ? `<path class="split-cut" d="${plan.cuts}" vector-effect="non-scaling-stroke"></path>` : ''}</svg>`;
  const figures = splitFigures(rows.map((r) => r.cells[1]), o.home);
  const legend = rows.length
    ? `<ul class="split-legend">${rows
        .map((r, i) => {
          /* A part at nought is left out of the legend (`splitListed`); the fold below still says it. */
          if (!splitListed(plan, values[i]!)) return '';
          const part = partOf(i);
          const share = splitShare(plan, i, values[i]!, plain(inline(r.cells[1] ?? '', o)));
          return `<li class="split-item"${toneAttrs(r.tone)}><span class="split-dot"${part ? ` data-step="${part.step}"` : ''}${slotAttr(r)} aria-hidden="true"></span>${cell('split-label', r.cells[0], o)}<span class="split-value num">${renderInline(inline(figures[i] ?? MISSING, o), o)}</span>${share ? `<span class="split-share num">${escape(share)}</span>` : ''}${cell('split-note', r.cells[2], o)}${toneGlyph(r.tone)}</li>`;
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
        /* THE FIGURES THE LEGEND SAYS, one way a set (colour lane, 2 Nov): the fold read "$8.25" and "$1.17" for a screen
           reader under a legend that said "$8" and "$1". A hole is no part of the set and keeps its cell. */
        all.map((r, i) => [said(r) || SPLIT_PART, plain(inline((i < rows.length ? figures[i] : r.cells[1]) ?? '', o)) || SPLIT_NONE, (!r.hole && i < rows.length ? splitShare(plan, i, values[i]!, plain(inline(r.cells[1] ?? '', o))) : null) ?? SPLIT_NONE]),
      )
    : '';
  return `<div class="prop split"${donut ? ' data-form="donut"' : ''}>${track}${legend}${hole}${numbers}</div>`;
}

/**
 * `bridge`: bars floating from the first row to the last (`src/bridge.ts`), then the rows as text
 * under them, and a warn line when the rows do not add up. The chart is the wide form; a narrow
 * container hides it and draws each row's bar inline, so both are in the markup and neither is text.
 */
function bridge(b: Block, o: RenderOptions): string {
  /* Each step's amount as text. Told the record's home (`o.home`), a whole amount is the one writer's, as a table cell's
     is, and steps in two currencies are never added: `Bridge.svelte`'s twin, line for line (bridge-home-60). */
  const said = b.rows.map((r) => plain(inline(r.cells[1] ?? '', o)));
  const written = said.map((s) => bridgeWritten(s, o.home));
  const plan = bridgePlanOf(said, o.home);
  const chart = plan.bars
    ? `<svg class="bridge-chart" viewBox="0 0 1000 100" preserveAspectRatio="none" role="img" aria-label="${escape(
        bridgeSentence(b.rows.map((r, i) => ({ label: plain(inline(r.cells[0] ?? '', o)), value: written[i] ?? said[i] ?? '' }))),
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
      return `<li class="bridge-row"${bar ? ` data-move="${bar.move}"` : ''}>${cell('bridge-label', r.cells[0], o)}${inline_}<span class="bridge-value num">${renderInline(inline(written[i] ?? (r.cells[1] || MISSING), o), o)}</span>${cell('bridge-note', r.cells[2], o)}</li>`;
    })
    .join('');
  const warn = plan.warn ? `<p class="bridge-warn" data-intent="warn">${toneGlyph('warn')}${escape(plan.warn)}</p>` : '';
  const numbers = b.rows.length
    ? numbersFold(
        'bridge',
        [BRIDGE_STEP, BRIDGE_AMOUNT],
        b.rows.map((r, i) => [plain(inline(r.cells[0] ?? '', o)), (written[i] ?? said[i]) || MISSING]),
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

/**
 * Where the figure after a code ends: at its first space. `.amount` holds the code and that figure on one line, and
 * what follows (` · £24,800` in a figure in three currencies, or a note) stays outside it, free to wrap between its
 * amounts as `stat.css` says a figure too long for its tile does.
 */
const figureEnd = (rest: string): number => rest.search(/\s|$/u);

/**
 * The newest known value of a card's run, as its cell wrote it, for a run `cardTrend` draws no line through.
 *
 * TWO POINTS ARE NOT A CHART, AND THEY ARE STILL A NUMBER. A card with a trend column and no figure column showed
 * nothing at all for a short run, so the newest count is printed as text with the trend's name. A gap is not a value,
 * a run with no number in it says nothing, and neither does one with no name. One number alone is a run of one.
 */
export function trendNewest(value: string, label: string): { last: string; label: string } | null {
  const name = label.trim();
  if (!name) return null;
  const known = (s: string): boolean => s.trim() !== '' && Number.isFinite(Number(s.replace(/−/gu, '-').replace(/,/gu, '')));
  const run = trendOf(value)?.said.filter(known);
  if (run?.length) return { last: run[run.length - 1]!, label: name };
  /* ONE KNOWN POINT IS NO LINE TO `trendOf`, so the run is read here by the rule it reads one by (`runTokens`). */
  const one = runTokens(value).filter(known);
  return one.length ? { last: one[one.length - 1]!, label: name } : null;
}

/**
 * A stored amount as the one writer writes it for this page (`money.ts`), or `null` when the host has not said the
 * record's home currency or the cell is not one stored amount, and then the cell is drawn the way it always was.
 */
export function written(value: string, o: Pick<RenderOptions, 'home'>, setting: AmountSetting): WrittenAmount | null {
  if (o.home === undefined) return null;
  return writeFigure(value, o.home, setting);
}

/**
 * A typed figure's words as they are drawn. `{{money:1840000 GBP}}` stands among words, so where the page says its home it
 * is the one writer's amount said short (`£18,400`), as the figures round it are; `formatTyped` wrote the stored form
 * (`GBP 18,400.00`), and drawn as it was one page spelled the pound two ways. Where the host does not say, and for every
 * other form, it is the text as written. The node keeps the stored form, which `text` hands the drawers that parse it.
 */
export const typedText = (n: Extract<Inline, { type: 'typed' }>, o: Pick<RenderOptions, 'home' | 'refName'>): string =>
  n.form === 'money' ? (written(n.text, o, 'read')?.text ?? n.text) : n.form === 'ref' ? (named(o.refName?.(n.arg)) ?? n.text) : n.text;

/** A row's name a host answered, trimmed, or `null` for none: an empty name is no name. */
const named = (v: string | null | undefined): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

/** A gauge's value or target: a stored amount as the writer says it short, and anything else as its cell wrote it. */
export const gaugeFigure = (cell: string | undefined, o: Pick<RenderOptions, 'home'>): string | undefined =>
  cell === undefined ? cell : (written(cell, o, 'read')?.text ?? cell);

/** A headline's amount from its cell: the writer's where the page says its home, the code quiet where it stands in front. */
function amount(cell: string, o: RenderOptions): string {
  const w = written(cell, o, 'read');
  if (w) {
    return w.codePlace === 'before'
      ? `<span class="amount">${escape(w.minus)}<span class="amount-code">${escape(w.code)}</span>${AMOUNT_SPACE}${escape(`${w.whole}${w.fraction}`)}</span>`
      : escape(w.text);
  }
  const value = headlineFigure(cell, o.home);
  const symbol = symbolFigure(value);
  if (symbol) return escape(symbol);
  const coded = leadingCode(value);
  if (!coded) return renderInline(inline(value, o), o);
  const end = figureEnd(coded.rest);
  return `<span class="amount">${escape(coded.sign)}<span class="amount-code">${escape(coded.currency)}</span> ${renderInline(inline(coded.rest.slice(0, end), o), o)}</span>${renderInline(inline(coded.rest.slice(end), o), o)}`;
}

/**
 * A RUN'S FACE WEARS ITS SLOT (domains lane, 2 Nov), as `AgentFace` does: the disc is the slot's tint and the ring its
 * fill. The run's hue drawn as it was, at the mark's lightness and chroma, was a colour no other mark of that run had.
 */
export const runSlotStyle = (hue: number): string => {
  const s = slotOf(hue);
  return `--run-wash:var(--cat-${s}-tint);--run-ring:var(--cat-${s}-fill)`;
};

/**
 * A run's face, mirroring `Cards.svelte`'s `runFace` snippet: the kind's glyph on a disc washed in the
 * run's hue, ringed in that hue while the run is open, solid while it works and dashed once it has gone quiet, and a
 * door to the run's page.
 */
function runFaceHtml(f: RunFace, o: RenderOptions): string {
  const d = f.glyph === 'slash' ? 'M15.5 4.5 8.5 19.5' : (o.icon?.(f.glyph) ?? null);
  const ring =
    f.live !== 'stopped'
      ? `<circle class="cards-run-ring" cx="18" cy="18" r="16.5" fill="none" stroke-width="2.5"${f.live === 'quiet' ? ' stroke-dasharray="4 3"' : ''} style="stroke:var(--run-ring)"></circle>`
      : '';
  /* THE MAKER'S MARK WHERE THE HOST DRAWS ONE, filled in its tone and centred in the disc; else the kind's glyph. */
  const m = runMarkOf(f, o.agentMark);
  const fill = m ? agentMarkFill(m.tone) : null;
  const path = m
    ? `<path class="cards-run-agent" d="${escape(m.d)}" fill-rule="${m.rule}" clip-rule="${m.rule}" transform="translate(10.5 10.5) scale(0.625)" fill="currentColor" data-tone="${escape(m.tone)}"${fill ? ` style="${fill}"` : ''}></path>`
    : d
      ? `<path d="${escape(d)}" transform="translate(9 9) scale(0.75)" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>`
      : '';
  return `<a class="cards-face cards-run tap" style="background:none" href="${escape(hrefFor(o, `/r/session/${f.seq}`))}" data-live="${f.live}" aria-label="${escape(RUN_OPEN)}"><svg class="cards-run-mark" viewBox="0 0 36 36" width="100%" height="100%" aria-hidden="true" style="${runSlotStyle(f.hue)}"><circle class="cards-run-disc" cx="18" cy="18" r="14" style="fill:var(--run-wash)"></circle>${ring}${path}</svg></a>`;
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
function cards(b: Block, o: RenderOptions & { runs?: readonly (RunCell | null)[] | undefined; helpers?: readonly Helpers[] | undefined }): string {
  const [head, ...rows] = b.rows;
  if (rows.length === 0) return `<p class="cards-empty">${escape(CARDS_NONE)}</p>`;
  const L = cardLayout(head?.cells ?? []);
  const label = (i: number): string => L.labels[i] ?? '';
  const said = (r: Row, i: number): string => (i < 0 ? '' : plain(inline(r.cells[i] ?? '', o)));
  const drawn = (r: Row, i: number): string => renderInline(inline(r.cells[i] ?? '', o), o);
  const labelled = (i: number): string => (label(i) ? `<span class="cards-label">${escape(label(i))}</span>` : '');

  /* A LONG BLOCK DRAWS ITS FIRST SIX (`mostOf`) and says how many it left out, with nothing to press: the app draws the
     same six and a "Show all" that opens the rest in place (`Cards.svelte`). */
  const most = mostOf(b as Block & MostKeys, rows.length);
  const body = rows
    .slice(0, most.shown)
    .map((r, n) => {
      /* A MARK THAT NAMES A PICTURE IS THE PICTURE, and one that names none is the title's letter, never the first letter
         of the picture's name ("C Oxbow.gg"); `Cards.svelte` draws the same slot (`markOf`, `markGlyphOf`). */
      const mark = L.mark >= 0 ? markOf(said(r, L.mark), said(r, L.name)) : null;
      const markGlyph = markGlyphOf(mark);
      const run = L.name >= 0 || L.who >= 0 ? runFaceOf(said(r, L.nameIsWho ? L.name : L.who), o.runs?.[n], isQuiet(L, r.cells)) : null;
      const face = L.nameIsWho ? initialOf(said(r, L.name)) : null;
      const nameMark = L.nameIsWho ? markFor(o, said(r, L.name)) : null;
      const lead = mark
        ? `<span class="cards-mark"${markGlyph ? ` data-glyph="${escape(markGlyph)}"` : ''} aria-hidden="true">${
            markGlyph ? ((d) => (d ? glyphSvg(d, ' width="100%" height="100%"') : ''))(glyphPath(markGlyph, o)) : escape(mark)
          }</span>`
        : L.nameIsWho && run
          ? runFaceHtml(run, o)
          : nameMark
            ? agentFaceHtml(nameMark, 'cards-face')
            : face
              ? `<span class="cards-face" aria-hidden="true">${escape(face)}</span>`
              : '';
      const name = L.name >= 0 ? `<h3 class="cards-title">${r.cells[L.name] ? drawn(r, L.name) : MISSING}</h3>` : '';
      const when = L.when >= 0 && r.cells[L.when] ? `<span class="cards-when">${drawn(r, L.when)}</span>` : '';

      /* A CARD'S FIGURE THAT NAMES NOTHING IS LEFT OUT, as a tile's is (`drawnRows`): the card keeps its name and facts. */
      const figure =
        L.figure >= 0 && !cellNamesNothing(r.cells[L.figure], o)
          ? `<span class="cards-figure"><span class="cards-value num">${r.cells[L.figure] ? amount(r.cells[L.figure]!, o) : MISSING}</span>${labelled(L.figure)}</span>`
          : '';
      /* A TREND IS DRAWN WITH ITS NAME AND ITS NEWEST VALUE, OR NOT AT ALL (`cardTrend`): a bare line said nothing. */
      const t = L.trend >= 0 ? cardTrend(said(r, L.trend), label(L.trend)) : null;
      const trend = t
        ? `<span class="cards-trended"><svg class="cards-trend" viewBox="0 0 1000 100" preserveAspectRatio="none" role="img" aria-label="${escape(`${t.label}: ${t.said.join(', ')}`)}"><path class="cards-trend-line" d="${t.d}" vector-effect="non-scaling-stroke"></path><path class="cards-trend-end" d="${t.end}" vector-effect="non-scaling-stroke"></path></svg><span class="cards-value num">${escape(t.last)}</span><span class="cards-label">${escape(t.label)}</span></span>`
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
      /* A RUN TOO SHORT TO DRAW STILL SAYS ITS NEWEST NUMBER where the card has no figure of its own (`trendNewest`):
         it is printed as the card's figure, under the trend's name, and `Cards.svelte` prints the same. */
      const newest = !t && L.figure < 0 && L.trend >= 0 ? trendNewest(said(r, L.trend), label(L.trend)) : null;
      const short = newest
        ? `<span class="cards-figure"><span class="cards-value num">${escape(newest.last)}</span><span class="cards-label">${escape(newest.label)}</span></span>`
        : '';
      const middle = figure || short || trend || ring ? `<div class="cards-body">${figure}${short}${trend}${ring}</div>` : '';
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
      const quiet = isDimmed(L, r.cells, o.runs?.[n]) ? ' data-quiet=""' : '';
      /* THE REPLY IS THE LINE UNDER THE HEAD and the next step the card's last word before who is on it, and an empty
         cell draws neither: "Next:" over nothing says there is a step nobody wrote down. */
      const reply = L.reply >= 0 && r.cells[L.reply] ? `<p class="cards-reply">${drawn(r, L.reply)}</p>` : '';
      /* A RUN'S HELPERS ARE SAID UNDER ITS SENTENCE, in the reply's quieter voice (`helpersOf`), and none draws nothing. */
      const helped = helpersOf(o.helpers, n);
      const helpers = helped ? `<p class="cards-reply" data-helpers="">${escape(helped)}</p>` : '';
      const next = L.next >= 0 && r.cells[L.next] ? `<p class="cards-next">${CARDS_NEXT}: ${drawn(r, L.next)}</p>` : '';
      /* THE LEAD IS TOLD, NEVER INFERRED (05 §4): the first card of a `cards lead` block, and the host's grid decides
         what two tracks are, so a phone's one column keeps it one card wide. */
      const leading = b.form === 'lead' && n === 0 ? ' data-lead=""' : '';
      /* THE HUE IS A NUMBER ON THE CARD AND NOTHING ELSE, which the host draws the mark in; a cell that is not a turn
         from 0 to 359 writes no style at all. THE PICTURE LEADS THE CARD where the host serves the file, and is hidden
         from a screen reader because the title under it names the card. */
      const hue = L.hue >= 0 ? hueOf(said(r, L.hue)) : null;
      const tinted = hue === null ? '' : ` style="--hue:${hue}" data-slot="${slotOf(hue)}"`;
      const src = L.picture >= 0 ? pictureSrc(r.cells[L.picture] ?? '', o.file) : null;
      const picture = src ? `<img class="cards-picture" src="${escape(hrefFor(o, src))}" alt="" loading="lazy">` : '';
      return `<li class="cards-item"${leading}${toneAttrs(r.tone)}${quiet}${tinted}>${picture}<div class="cards-head">${lead}${name}${toneGlyph(r.tone)}${when}</div>${reply}${helpers}${middle}${facts}${next}${who}</li>`;
    })
    .join('');
  const more = most.more > 0 ? `<p class="cards-more">${escape(moreSaid(most.more))}</p>` : '';
  return `<ul class="cards-grid" data-cards="${cardsCount(most.shown)}">${body}</ul>${more}`;
}

/**
 * `section`: a heading on a page, with a count aside and, when folded, the control that folds what
 * follows. The folding itself is the host's, because the blocks that follow are the page's and not
 * this block's; `details` carries the state so the host can read it without script.
 */
function section(b: Block, o: RenderOptions): string {
  const [glyph = '', count = '', fold = '', toned = ''] = b.rows[0]?.cells ?? [];
  /* The well's tone, a closed word (`SECTION_TONES`), so nothing a cell holds reaches the attribute unread. */
  const tone = sectionTone(toned);
  const mark = glyph ? `<span class="sec-glyph" data-glyph="${escape(glyph)}"${tone ? ` data-tone="${tone}"` : ''} aria-hidden="true">${slotArt(glyph, o)}</span>` : '';
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
  const plan = capturePlan(b.rows, o);
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
 *
 * A feed the host parted by day (`day | Today`) is drawn under a heading a day, its lines in the order they came and
 * each with its own actor's mark. A line that stands for a run's work says its fold after its words ("and 39 more").
 */
function feed(b: Block, o: RenderOptions): string {
  const plan = feedPlan(b.rows);
  if (plan.groups.length === 0) return `<p class="feed-empty">${escape(plan.empty)}</p>`;
  const said = (v: string | undefined): string => plain(inline(v ?? '', o));
  const drawn = (v: string | undefined): string => renderInline(inline(v ?? '', o), o);
  const body = plan.groups
    .map((g) => {
      /* A DAY'S HEAD COUNTS ONLY WHAT IS NEW. A tally beside "Yesterday" would count the lines drawn and not the work
         folded into them, which is a figure that says less than the day's name. */
      const head =
        g.fresh > 0
          ? `<span class="feed-new num">${escape(feedNew(g.fresh))}</span>`
          : g.by === FEED_DAY
            ? ''
            : `<span class="feed-tally num" data-calm="">${g.total}</span>`;
      const rows = g.rows
        .map(({ row: r, fresh, by }, i) => {
          const more = feedFold(r.cells);
          const who = r.cells[1] ?? '';
          /* A RULE WEARS NO LETTER, and an agent its maker's mark where the host draws one: `1 C` led every rule's line. */
          const run = runFaceOf(who, null, false);
          const mark = by === 'rule' ? null : markFor(o, said(who));
          const face = by === 'rule' ? null : initialOf(said(who));
          /* AND NO FACE AT ALL, not an empty one: an empty slot kept the column, and every rule's line sat indented
             under nothing (`feed.css` gives a line with no face its column back). */
          const lead = run
            ? runFaceHtml(run, o)
            : mark
              ? agentFaceHtml(mark, 'feed-face')
              : by === 'rule'
                ? ''
                : `<span class="feed-face" aria-hidden="true">${face ? escape(face) : ''}</span>`;
          const line = i === g.earlier ? `<li class="feed-seen">${escape(FEED_EARLIER)}</li>` : '';
          return `${line}<li class="feed-row"${fresh ? ' data-new' : ''}${toneAttrs(r.tone)} data-row="${escape(rowKey(r, b.rows.indexOf(r)))}"><span class="feed-count num">${
            feedBurst(said(r.cells[2])) ? drawn(r.cells[2]) : ''
          }</span>${lead}<span class="feed-what">${
            /* A RULE THAT WORDED ITS OWN LINE SENDS NO WHO ("Tallyard categorised"), and draws none: a dash in front of
               every rule's line read as something missing when nothing was. Anyone else without a name is still one. */
            who || by !== 'rule' ? `<span class="feed-who">${who ? drawn(who) : MISSING}</span> ` : ''
          }${renderInline(feedCasedNodes(inline(r.cells[3] ?? '', o)), o)}${toneGlyph(r.tone)}${
            /* THE FOLD FOLLOWS THE LINE IT FOLDED INTO, as its own part so the sheet can set it quieter than the words. */
            more ? ` <span class="feed-more">${drawn(more)}</span>` : ''
          }</span><span class="feed-when" data-calm="">${drawn(r.cells[4])}</span></li>`;
        })
        .join('');
      /* ONE GROUP DRAWS NO HEAD (`feedPlan`'s `lone`), and neither do the lines above the first day, which have no name. */
      const named = plan.lone || g.label === '' ? '' : `<h3 class="feed-head">${escape(g.label)}${head}</h3>`;
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
  const plan = queuePlan(b.rows, o);
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
      const question = `<h3 class="queue-question">${drawn(symbolText(item.question, true, o.home))}</h3>`;
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
      /* AS A FEED'S LINE SAYS IT (24 October): who did it in words, then what, "Claude added Archie", the maker's mark
         where the host draws one, and a count only for a burst. "1 C added Archie" read a number and a letter. */
      const mark = markFor(o, said(g.who));
      const who = said(g.who) ? `<span class="feed-who">${drawn(g.who)}</span> ` : '';
      const rows = g.rows
        .map((r) => {
          const what = (r.cells[2] ?? '').trim() === '' ? escape(AGENTS_EARLIER) : who + drawn(r.cells[2]);
          return `<li class="feed-row"${toneAttrs(r.tone)}><span class="feed-count num">${
            feedBurst(said(r.cells[1])) ? drawn(r.cells[1]) : ''
          }</span>${mark ? agentFaceHtml(mark, 'feed-face') : `<span class="feed-face" aria-hidden="true">${face ? escape(face) : ''}</span>`}<span class="feed-what">${what}${toneGlyph(r.tone)}</span><span class="feed-when">${drawn(r.cells[3])}</span></li>`;
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
  const plan = progressPlan(b.rows.map((r) => ({ value: said(r, 1), target: said(r, 2), ...(r.tone ? { tone: r.tone } : {}) })), form, o.home);
  const drawn = (v: string | undefined): string => renderInline(inline(v || MISSING, o), o);
  /* EVERY BUDGET TOGETHER, AS THE FIRST ROW (`budgetTotal`), as `Progress.svelte` draws it. */
  const total = form === 'budget' ? budgetTotal(b.rows.map((r) => ({ value: said(r, 1), target: said(r, 2) })), o.home) : null;
  const tp = total ? progressPlan([total], 'budget', o.home)[0]! : null;
  const head =
    total && tp
      ? `<div class="progress-row" data-total=""${toneAttrs(tp.intent)}><span class="progress-label">${escape(PROGRESS_ALL_BUDGETS)}</span><span class="progress-figure num"><span class="progress-value">${escape(total.value)}</span><span class="progress-of">${PROGRESS_OF}</span><span class="progress-target">${escape(total.target)}</span></span><span class="progress-share num">${escape(tp.share)}</span><span class="progress-track" role="img" aria-label="${escape(progressSentence(PROGRESS_ALL_BUDGETS, total.value, total.target, tp.share))}" style="--fill:${tp.fill}"><span class="progress-fill"></span>${
          tp.limit === null ? '' : `<span class="progress-over" style="--limit:${tp.limit}"></span>`
        }</span>${tp.left ? `<span class="progress-left num">${escape(tp.left)}</span>` : ''}${toneGlyph(tp.intent)}</div>`
      : '';
  const body = b.rows.length
    ? head + b.rows
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
  const plan = rangePlan(b.rows.map((r) => ({ spent: said(r, 1), low: said(r, 2), high: said(r, 3), ...(r.tone ? { tone: r.tone } : {}) })), o.home);
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
  const plan = linesPlan(b.rows.map((r) => r.cells.map((c) => plain(inline(c, o)))), o.home);
  /* ONE READING IS A FIGURE, its value and when it was read, with no chart of one dot and no fold of one point. */
  if (plan.single)
    return `<div class="prop lines" data-single=""><p class="lines-lead"><span class="lines-now num">${escape(plan.single.value)}</span><span class="lines-against">${escape(
      linesOnly(plan.single, Boolean(b.heading)),
    )}</span></p></div>`;
  /* AN OLD READING SAYS ITS AGE beside the figure it leads with (`linesAge`). */
  const age = linesAge(plan, o.now);
  const lead = plan.now
    ? `<p class="lines-lead"><span class="lines-now num">${escape(plan.now)}</span>${
        plan.change
          ? `<span class="lines-change num" data-trend="${plan.trend}">${escape(plan.change)}</span><span class="lines-against">${LINES_AGAINST} ${escape(againstSaid(plan.against))}, <span class="num">${escape(plan.then)}</span></span>`
          : ''
      }${age ? `<span class="lines-against" data-old="">${escape(age)}</span>` : ''}</p>`
    : '';
  const keyed = linesKeyed(plan);
  const legend = keyed.length === 0 ? '' : `<ul class="lines-legend">${keyed
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
  /* THE TREND'S SENTENCE when the readings hold none (`lines-trend.ts`). Its dashed path waits on the skin's twin of
     Lines.svelte's rules, which is the owner's (board-yes), so a path is not drawn here unstyled. */
  const trend = linesTrend(plan);
  const chart = plan.empty
    ? `<p class="lines-empty">${escape(LINES_NONE)}</p>`
    : `<div class="lines-plot">${plan.top ? `<span class="lines-top num" aria-hidden="true">${escape(plan.top)}</span>` : ''}${
        plan.bottom ? `<span class="lines-bottom num" aria-hidden="true">${escape(plan.bottom)}</span>` : ''
      }<svg class="lines-chart" viewBox="0 0 1000 100" preserveAspectRatio="none" role="img" aria-label="${escape(
        `${plan.axis ? `${plan.axis}: ` : ''}${plan.sentence}`,
      )}">${paths}</svg></div><ol class="lines-ticks" aria-hidden="true">${plan.ticks
        .map((t) => `<li class="lines-tick" style="--at:${t.at}"${t.minor ? ' data-minor=""' : ''}>${escape(t.label)}</li>`)
        .join('')}</ol>${trend && 'said' in trend ? `<p class="lines-trend-said">${escape(trend.said)}</p>` : ''}`;
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
    o.home,
  );
  const net = b.form === 'net';
  const keyed = plan.drawn && (plan.series.length > 1 || net);
  const legend = keyed
    ? `<ul class="series-legend">${plan.series
        .map((s) => `<li class="series-key" data-dir="${s.dir}" data-step="${s.step}"><span class="series-swatch" aria-hidden="true"></span><span class="series-name">${escape(s.label)}</span></li>`)
        .join('')}${net ? `<li class="series-key" data-net=""><span class="series-swatch" aria-hidden="true"></span><span class="series-name">${SERIES_NET}</span></li>` : ''}${plan.buckets.some((k) => k.under) ? `<li class="series-key" data-under=""><span class="series-swatch" aria-hidden="true"></span><span class="series-name">${SERIES_UNDER}</span></li>` : ''}${plan.buckets.some((k) => k.state !== '') ? `<li class="series-key" data-paler=""><span class="series-swatch" aria-hidden="true"></span><span class="series-name">${SERIES_PALER}</span></li>` : ''}</ul>`
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
              `<li class="series-col"${k.state ? ` data-state="${k.state}"` : ''}${k.under ? ' data-under=""' : ''}${i >= plan.buckets.length / 2 ? ' data-flip=""' : ''}>${plan.bars
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
  /* WHERE WHAT IT KNOWS STOPS, when the empty months to come were left off (`rest`). */
  const rest = plan.rest ? `<p class="series-rest">${escape(plan.rest)}</p>` : '';
  return `<div class="prop series" style="--cells:${plan.buckets.length}">${legend}${chart}${rest}${numbers}</div>`;
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
  const placed = nowPlaced(plan);
  const near = `${plan.cross?.near ? ' data-near-flag=""' : ''}${placed ? ` data-place="${placed}"` : ''}${plan.now.over ? ' data-over=""' : ''}`;
  /* THE END OF THE AXIS NEAREST ZERO, WHERE ZERO IS OFF IT, carries a break beside its real amount (`cut`), and the
     chart's name says where the axis starts, as `Forecast.svelte` draws it. */
  const axis = `<ol class="forecast-axis" aria-hidden="true">${plan.axis
    .map(
      (a) =>
        `<li class="forecast-axis-tick"${a.zero ? ' data-zero=""' : ''}${a.cut ? ' data-cut=""' : ''} style="--at:${a.at}">${
          a.cut ? `<span class="forecast-axis-break" style="${FORECAST_AXIS_BREAK_STYLE}">${FORECAST_AXIS_BREAK}</span>` : ''
        }${escape(a.label)}</li>`,
    )
    .join('')}</ol>`;
  /* THE LINE IS INK ABOVE £0 AND RED UNDER IT, one stroke cut at the zero rule, as `Forecast.svelte` draws it. */
  const under = plan.below ? `${lateId(b)}-under` : '';
  const split = under
    ? `<defs><linearGradient class="forecast-split" id="${under}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="100"><stop class="forecast-above" offset="${plan.zero}%"></stop><stop class="forecast-under" offset="${plan.zero}%"></stop></linearGradient></defs>`
    : '';
  const cutLine = under ? ` style="stroke:url(#${under})"` : '';
  const chart = `<div class="forecast-plot"><svg class="forecast-chart" viewBox="0 0 1000 100" preserveAspectRatio="none" role="img" aria-label="${escape(plan.sentence)}">${split}${path('forecast-grid', plan.grid, painted(FORECAST_PAINT.grid))}${path('forecast-area', plan.area, painted(FORECAST_PAINT.area))}${path('forecast-area', plan.below, ` data-below=""${painted(FORECAST_PAINT.area)}`)}${path('forecast-zero', `M0 ${plan.zero}H1000`)}${plan.cross ? path('forecast-cross-rule', plan.cross.rule, painted(FORECAST_PAINT.rule)) : ''}${path('forecast-today', plan.now.rule)}${path('forecast-base', plan.base)}${path('forecast-past', plan.past, cutLine)}${path('forecast-walk', plan.walk, `${painted(FORECAST_PAINT.walk)}${cutLine}`)}${path('forecast-future', plan.future, cutLine)}${path('forecast-low', plan.low)}${path('forecast-mark', plan.marks.in, ` data-dir="in"${painted(FORECAST_PAINT.mark)}`)}${path('forecast-mark', plan.marks.out, ` data-dir="out"${painted(FORECAST_PAINT.mark)}`)}${path('forecast-now', plan.now.d, painted(FORECAST_PAINT.now))}${plan.cross ? path('forecast-cross', plan.cross.d) : ''}</svg><span class="forecast-now-label num"${near} style="--at:${plan.now.at};--y:${plan.now.y}" aria-hidden="true"><span class="forecast-now-word">${escape(FORECAST_NOW)}</span><span class="forecast-now-figure">${escape(plan.now.label)}</span></span>${axis}${
    plan.cross ? `<span class="forecast-pin"${plan.cross.near ? ' data-side="end"' : ''} style="--at:${plan.cross.at}" aria-hidden="true">${TONES.warn.glyph} ${escape(plan.cross.day)}</span>` : ''
  }${plan.drops.map((d) => `<span class="forecast-drop num" style="--at:${d.at};--y:${d.y}" aria-hidden="true">${d.n}</span>`).join('')}${
    plan.lowLabel
      ? `<span class="forecast-low-label num"${plan.lowLabel.side ? ` data-side="${plan.lowLabel.side}"` : ''}${plan.lowLabel.drop ? ' data-drop=""' : ''}${plan.lowLabel.foot ? ' data-foot=""' : ''} style="--at:${plan.lowLabel.at};--y:${plan.lowLabel.y}" aria-hidden="true"><span class="forecast-low-word">${escape(FORECAST_LOWEST)}</span><span class="forecast-low-figure">${escape(plan.lowLabel.figure)}</span></span>`
      : ''
  }</div>`;
  const ticks = `<ol class="forecast-ticks" aria-hidden="true">${plan.ticks
    .map((t) => `<li class="forecast-tick"${t.edge ? ' data-edge=""' : ''} style="--at:${t.at}">${escape(t.label)}</li>`)
    .join('')}</ol>`;
  /* THE ANSWER OVER THE CHART: the cash at the horizon, the lowest point and everyday spending (`forecastSummary`). */
  const summary = `<dl class="forecast-summary">${forecastSummary(model, shown)
    .map(
      (c) =>
        `<div class="forecast-sum" data-key="${c.key}"${c.below ? ' data-below=""' : ''}><dt class="forecast-sum-label">${escape(c.label)}</dt><dd class="forecast-sum-figure num">${escape(c.figure)}</dd><dd class="forecast-sum-note"${c.dir ? ` data-dir="${c.dir}"` : ''}>${escape(c.note)}</dd></div>`,
    )
    .join('')}</dl>`;
  /* EVERY MOVEMENT IN ORDER UNDER THE CHART, each part of a plan numbered as its mark on the line is (`forecastNext`). */
  const next = forecastNext(model, shown, plan);
  const listed = next.rows.length
    ? `<div class="forecast-next"><p class="forecast-next-head">${escape(FORECAST_NEXT)}</p><ol class="forecast-next-list">${next.rows
        .map((r) =>
          r.everyday
            ? `<li class="forecast-next-item" data-everyday="">${escape(r.said)}</li>`
            : `<li class="forecast-next-item" data-dir="${r.dir}">${r.n === null ? '<span class="forecast-next-dot" aria-hidden="true"></span>' : `<span class="forecast-next-n num" aria-hidden="true">${r.n}</span>`}<span class="forecast-next-day">${escape(r.day)}</span><span class="forecast-next-label">${escape(r.label)}</span><span class="forecast-next-amount num">${escape(r.amount)}</span></li>`,
        )
        .join('')}</ol>${next.more > 0 ? `<p class="forecast-next-more">${escape(forecastNextMore(next.more))}</p>` : ''}</div>`
    : '';
  /* EVERYDAY SPENDING IS ONE LINE, not a row a week (`forecastEveryday`), and the bills are listed around it. */
  const everyday = forecastEveryday(model, shown);
  const row = (when: string, what: string, move: string, balance: string) =>
    `<tr><th scope="row">${escape(when)}</th><td>${escape(what)}</td><td class="num">${escape(move)}</td><td class="num">${escape(balance)}</td></tr>`;
  const numbers = `<details class="forecast-numbers"><summary class="forecast-toggle">${escape(FORECAST_NUMBERS)}</summary><table class="forecast-table"><thead><tr>${[FORECAST_WHEN, FORECAST_WHAT, FORECAST_MOVE, FORECAST_BALANCE]
    .map((h) => `<th scope="col">${escape(h)}</th>`)
    .join('')}</tr></thead><tbody>${row(day(model.today), model.label, '', model.template)}${everyday ? `<tr data-everyday=""><td colspan="4">${escape(everyday)}</td></tr>` : ''}${listedSteps(shown.steps)
    .map((s) => row(day(s.day), s.label, forecastFigure(model, s.delta), forecastFigure(model, s.balance)))
    .join('')}</tbody></table></details>`;
  const note = underNote(model, shown);
  const soon = note ? `<p class="forecast-soon">${escape(note)}</p>` : '';
  return `<div class="prop forecast">${summary}${said}${chart}${ticks}${soon}${listed}${numbers}</div>`;
}

/**
 * `roadmap`: tasks on one time axis (`src/roadmap.ts`), drawn as a timeline. Each row is a line of its own, its name in
 * the left column and its window as a bar on a track in the right, so no name can land on another or on a bar: the
 * names over a stretched drawing collided at every width. A date with no effort is a dot on its day.
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
  const rows = b.rows.map((r) => roadmapRow(said(r, 0), said(r, 1), said(r, 2), r.tone, o.now));
  const plan = roadmapPlan(rows, roadmapToday(o.now));
  const skipped = plan.skipped.length
    ? `<p class="roadmap-skipped">${escape(roadmapSkipped(plan.skipped.map((i) => rows[i]!.title || MISSING)))}</p>`
    : '';
  if (plan.empty) return `<div class="roadmap"><p class="roadmap-empty">${escape(ROADMAP_NONE)}</p>${skipped}</div>`;

  /* `--at` IS A SHARE OF THE WIDTH, as `blocks-charts.css` reads it for every chart's ticks (`calc(var(--at) * 100%)`). */
  const axis = `<ol class="roadmap-axis"${plan.weekly ? ' data-weekly=""' : ''} aria-hidden="true">${roadmapAxis(plan)
    .map((t) => `<li class="roadmap-tick" style="--at:${roadmapShare(t.x)}">${escape(t.label)}</li>`)
    .join('')}${plan.today === null ? '' : `<li class="roadmap-today" style="--at:${roadmapShare(plan.today)}">${ROADMAP_TODAY}</li>`}</ol>`;
  const lines = roadmapLines(plan, o.now ?? Date.now());
  const list = `<ol class="roadmap-list" aria-label="${escape(roadmapSentence(plan))}">${lines
    .map(
      (p) =>
        `<li class="roadmap-item"${toneAttrs(p.tone)}${p.from === MISSING ? ' data-date=""' : ''}${roadmapFlip(p) ? ' data-flip=""' : ''} style="--at:${p.at};--span:${p.span}"><span class="roadmap-item-title"${p.title ? ` title="${escape(p.title)}"` : ''}>${escape(p.title)}${toneGlyph(p.tone)}</span> <span class="roadmap-item-when num">${escape(p.when)}</span><span class="roadmap-item-track" aria-hidden="true"><span class="roadmap-bar"></span></span></li>`,
    )
    .join('')}</ol>`;

  const keys = roadmapLegend(lines);
  const legend = keys.length
    ? `<ul class="roadmap-legend" aria-label="${escape(ROADMAP_LEGEND)}">${keys.map((k) => `<li class="roadmap-key"${k.tone ? ` data-key="${escape(k.tone)}"` : ''}>${escape(k.label)}</li>`).join('')}</ul>`
    : '';
  return `<div class="roadmap" style="--rows:${lines.length}">${axis}${list}${legend}${skipped}</div>`;
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
  const plan = ringPlan(b.rows.map((r) => ({ label: said(r, 0), value: said(r, 1), third: said(r, 2), ...(r.tone ? { tone: r.tone } : {}) })), o.home);
  if (plan.empty) return `<div class="prop ring"><p class="ring-empty">${escape(RING_NONE)}</p></div>`;

  const paint = (p: Readonly<Record<string, string>>): string =>
    Object.entries(p)
      .map(([k, v]) => ` ${k}="${v}"`)
      .join('');
  const circle = (cls: string, attrs: string): string => `<circle class="${cls}"${attrs} cx="18" cy="18" r="16" pathLength="100"></circle>`;
  /* An arc is a stroke whose dashes already draw its length, so its mark is the pattern and not a dash: a 4 by 4 tile
     in a 64px dial is a stripe of about 2.5px every 5px, near the CSS hatch's 3 in 6; a 3 by 3 one blurred at 1x. */
  const late = plan.arcs.some((a) => a.tone === LATE) ? lateId(b) : '';
  const dial = plan.ring
    ? `<div class="ring-dial"><svg class="ring-mark" viewBox="0 0 36 36" role="img" aria-label="${escape(plan.name)}">${late ? latePattern(late, 4, 4) : ''}${circle('ring-track', paint(RING_PAINT.track))}${plan.arcs
        .map((a) =>
          circle(
            'ring-arc',
            ` data-step="${a.step}"${toneAttrs(a.tone)}${paint(RING_PAINT.arc)}${a.tone === LATE ? ` style="${lateFill('stroke', late)}"` : ''} stroke-opacity="${RING_STEP_OPACITY[a.step]}" stroke-dasharray="${a.dash}" stroke-dashoffset="${a.offset}" transform="rotate(-90 18 18)"`,
          ),
        )
        .join('')}</svg>${plan.centre ? `<span class="ring-figure num" aria-hidden="true">${escape(plan.centre)}</span>` : ''}</div>`
    : '';

  if (plan.form === 'progress') {
    const r = b.rows[0]!;
    const target = r.cells[2] ? `<span class="ring-of">${RING_OF}</span><span class="ring-target">${drawn(headlineFigure(r.cells[2], o.home))}</span>` : '';
    return `<div class="prop ring" data-form="progress">${dial}<div class="ring-row"${toneAttrs(plan.intent)}><span class="ring-label">${drawn(r.cells[0])}</span><span class="ring-figures num"><span class="ring-value">${drawn(headlineFigure(r.cells[1] || MISSING, o.home))}</span>${target}</span>${
      plan.left ? `<span class="ring-left num">${escape(plan.left)}</span>` : ''
    }${toneGlyph(plan.intent)}</div></div>`;
  }

  const legend = `<ul class="ring-legend">${b.rows
    .map((r, i) => {
      const arc = plan.arcs.find((a) => a.row === i);
      const share = plan.shares[i];
      return `<li class="ring-item"${toneAttrs(r.tone)}><span class="ring-dot"${arc ? ` data-step="${arc.step}"` : ''} aria-hidden="true"></span><span class="ring-label">${drawn(r.cells[0])}</span><span class="ring-value num">${drawn(headlineFigure(r.cells[1] || MISSING, o.home))}</span>${
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
  /* A BLOCK WITH `of:` SAYS WHAT ITS WASH IS, under the grid: there a full cell is a day wholly of them, not the busiest. */
  const share = plan.share ? `<p class="heat-share">${escape(HEAT_SHARE_LINE)}</p>` : '';
  /* A FOLD, NOT A TABLE STANDING OPEN, since a day's count was only in `title`, which a finger cannot hover
     (`pages.md` §2.5 rank 11). `lines-numbers` and `lines-toggle` are the classes the `lines` block's own fold
     already carries and `packages/skin/blocks-charts.css` already styles, reused rather than repeated under a
     `heat-` name; the table inside keeps `heat-table`, its own. */
  const table = `<details class="lines-numbers"><summary class="lines-toggle">${LINES_NUMBERS}</summary><table class="heat-table"><thead><tr>${[HEAT_DAY, plan.share ? HEAT_SHARE_HEAD : HEAT_VALUE]
    .map((h) => `<th scope="col">${escape(h)}</th>`)
    .join('')}</tr></thead><tbody>${heatLines(plan)
    .map((l) => `<tr><th scope="row">${escape(l.day)}</th><td class="num">${escape(l.count)}</td></tr>`)
    .join('')}</tbody></table></details>`;
  return `<div class="heat" style="--weeks:${plan.weeks}"><div class="heat-grid" role="img" aria-label="${escape(plan.name)}">${cells}</div>${share}${table}${skipped}${outside}</div>`;
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
 * `lanes`: one row a lane, its span placed in a window of time (`src/lanes.ts`). The names along the top and now's
 * line are a hidden axis, as a roadmap's are; the list under it is what is read, each lane its title, how its time is
 * said, and a track that holds the bar. `--at` and `--span` are percentages of the track's width, written inline.
 * `svelte/Lanes.svelte` is this function's twin.
 *
 * A LANE SAYS WHAT ITS BAR SHOWS: `data-open` on one still going, `data-point` on one that is a single instant,
 * `data-before` and `data-after` on one cut at an edge of the window, and its tone as `data-intent`.
 */
function lanes(b: Block, o: RenderOptions): string {
  const said = (r: Row): string => plain(inline(r.cells[0] ?? '', o)) || MISSING;
  const plan = lanesPlan(b.rows, o.now);
  const under =
    (plan.outside.length ? `<p class="lanes-outside">${escape(lanesOutside(plan.outside.map((i) => said(b.rows[i]!))))}</p>` : '') +
    (plan.skipped.length ? `<p class="lanes-skipped">${escape(lanesSkipped(plan.skipped.map((i) => said(b.rows[i]!))))}</p>` : '');
  if (plan.empty) return `<div class="lanes"><p class="lanes-empty">${escape(LANES_NONE)}</p>${under}</div>`;
  const axis = `<ol class="lanes-axis" aria-hidden="true">${plan.ticks.map((t) => `<li class="lanes-tick" style="--at:${t.at}">${escape(t.label)}</li>`).join('')}${
    plan.now === null ? '' : `<li class="lanes-now" style="--at:${plan.now}"><span class="lanes-now-word">${LANES_NOW}</span></li>`
  }</ol>`;
  const list = `<ol class="lanes-list" aria-label="${escape(lanesSentence(plan))}">${plan.lanes
    .map(
      (l) => {
        /* A LANE THAT NAMES WHO IT IS (`laneWho`): the agent's face and name before its words, its bar in its hue. */
        const who = laneWho(l.row.cells);
        const mark = who ? markFor(o, who) : null;
        const lead = who ? `<span class="lanes-who">${mark ? agentFaceHtml(mark, 'lanes-face') : ''}<span class="lanes-agent">${escape(who)}</span></span>` : '';
        return `<li class="lanes-item"${toneAttrs(l.row.tone)}${who ? ' data-who=""' : ''}${l.open ? ' data-open=""' : ''}${l.point ? ' data-point=""' : ''}${l.before ? ' data-before=""' : ''}${l.after ? ' data-after=""' : ''} style="--at:${l.at};--span:${l.span}${laneHue(mark?.tone)}">${lead}${cell('lanes-title', l.row.cells[0] || MISSING, o)}${toneGlyph(l.row.tone)}<span class="lanes-when num">${escape(l.when)}</span><span class="lanes-track" aria-hidden="true"><span class="lanes-bar"></span></span></li>`;
      },
    )
    .join('')}</ol>`;
  return `<div class="lanes" style="--rows:${plan.lanes.length}">${axis}${list}${under}</div>`;
}

/**
 * `form`: a form is filled in on a screen, so the string drawer says what it asks and never draws a box: one line a
 * field and the button's line (`src/form.ts` `formLines`). `svelte/Form.svelte` draws the boxes.
 */
function formText(b: Block): string {
  const form = formOf(b);
  return form ? `<ul class="form-lines">${formLines(form).map((l) => `<li>${escape(l)}</li>`).join('')}</ul>` : '<p class="form-empty">Nothing to fill in here.</p>';
}

/**
 * `calendar`: every month from the first row's to the last row's as a grid of weeks, Monday first, each day naming its
 * first rows and counting the rest, then an agenda of the days that hold anything (`src/calendar.ts` over
 * `src/days.ts`). `svelte/Calendar.svelte` is this function's twin.
 *
 * ONE MONTH IS SHOWN (`plan.focus`), the others written `hidden`; this drawer has no buttons, so a reader of a copy
 * reaches the other months' rows in the agenda, whose days in the month shown are marked `data-shown` for a wide host
 * to leave out. The Svelte twin draws the same tree until its arrows move to another month.
 *
 * A MONTH IS A TABLE, because it is one: a caption naming the month, a head naming the weekdays, and a row a week,
 * which a screen reader walks by row and column as a sighted reader scans one. A day of the month either side is an
 * empty cell marked `data-outside`, so the columns hold. A busy day carries `data-count`, which is what a host drawing
 * the month as a strip of days on a phone puts a dot on, and the agenda under it says every row of every day.
 */
function calendar(b: Block, o: RenderOptions): string {
  if (typeof b.weeks === 'number') return calendarStrip(b, o, b.weeks);
  const said = (r: Row, i: number): string => plain(inline(r.cells[i] ?? '', o));
  const plan = calendarPlan(b.rows, roadmapToday(o.now), o.day);
  const skipped = plan.skipped.length ? `<p class="calendar-skipped">${escape(calendarSkipped(plan.skipped.map((i) => said(b.rows[i]!, 0) || MISSING)))}</p>` : '';
  if (plan.empty) return `<div class="calendar"><p class="calendar-empty">${escape(CALENDAR_NONE)}</p>${skipped}</div>`;
  /* EACH ROW'S AMOUNT, its third cell, as one set (`barFigures`), said in the agenda after its title. */
  const amounts = barFigures(b.rows.map((r) => (r.cells[2] ?? '').trim()), o.home, true);
  const amount = (r: Row): string => {
    const a = amounts[b.rows.indexOf(r)];
    return a ? `<span class="calendar-amount num">${escape(a)}</span>` : '';
  };
  const item = (r: Row): string => `<li class="calendar-item"${toneAttrs(r.tone)}>${cell('calendar-title', r.cells[0] || MISSING, o)}${amount(r)}${toneGlyph(r.tone)}</li>`;
  const items = (rows: readonly Row[]): string => (rows.length ? `<ul class="calendar-items">${rows.map(item).join('')}</ul>` : '');
  const few = plan.days.reduce((n, d) => n + d.items.length, 0) <= CALENDAR_FEW ? ' data-few=""' : '';
  const head = `<thead><tr>${WEEKDAYS.map((d) => `<th scope="col" abbr="${d.long}">${d.short}</th>`).join('')}</tr></thead>`;
  const shownMonth = plan.months[plan.focus]?.month ?? '';
  const months = plan.months
    .map(
      (m, at) =>
        `<table class="calendar-month"${at === plan.focus ? '' : ' hidden=""'}><caption class="calendar-caption">${escape(m.label)}</caption>${head}<tbody>${m.weeks
          .map(
            (week) =>
              `<tr>${week
                .map((c) =>
                  c.inside
                    ? `<td class="calendar-cell"${c.today ? ' data-today=""' : ''}${c.count ? ` data-count="${c.count}"` : ''}${c.marked ? ' aria-current="date"' : ''}><span class="calendar-num num">${c.num}</span>${items(c.items)}${
                        c.more ? `<span class="calendar-more">${escape(calendarMore(c.more))}</span>` : ''
                      }</td>`
                    : '<td class="calendar-cell" data-outside=""></td>',
                )
                .join('')}</tr>`,
          )
          .join('')}</tbody></table>`,
    )
    .join('');
  const rest = plan.days.some((d) => d.day.slice(0, 7) !== shownMonth) ? `<p class="calendar-rest">${escape(CALENDAR_REST)}</p>` : '';
  const agenda = `${rest}<ol class="calendar-agenda">${plan.days
    .map((d) => `<li class="calendar-day"${d.today ? ' data-today=""' : ''}${d.day.slice(0, 7) === shownMonth ? ' data-shown=""' : ''}><span class="calendar-date num">${escape(d.said)}</span>${items(d.items)}</li>`)
    .join('')}</ol>`;
  return `<div class="calendar"${few}>${months}${agenda}${skipped}</div>`;
}

/**
 * `calendar` with `weeks`: a strip of whole weeks from the Monday of this one, seven days a week, each day naming its
 * first rows and counting the rest. The twin of `svelte/Calendar.svelte`'s strip, drawn from `calendarStripPlan`.
 */
function calendarStrip(b: Block, o: RenderOptions, weeks: number): string {
  const said = (r: Row, i: number): string => plain(inline(r.cells[i] ?? '', o));
  const plan = calendarStripPlan(b.rows, roadmapToday(o.now), weeks, o.day);
  const amounts = barFigures(b.rows.map((r) => (r.cells[2] ?? '').trim()), o.home, true);
  const amount = (r: Row): string => {
    const a = amounts[b.rows.indexOf(r)];
    return a ? `<span class="calendar-amount num">${escape(a)}</span>` : '';
  };
  const item = (r: Row): string => `<li class="calendar-item"${toneAttrs(r.tone)}>${cell('calendar-title', r.cells[0] || MISSING, o)}${amount(r)}${toneGlyph(r.tone)}</li>`;
  const items = (rows: readonly Row[]): string => (rows.length ? `<ul class="calendar-items">${rows.map(item).join('')}</ul>` : '');
  const skipped = plan.skipped.length ? `<p class="calendar-skipped">${escape(calendarSkipped(plan.skipped.map((i) => said(b.rows[i]!, 0) || MISSING)))}</p>` : '';
  const outside = plan.outside.length ? `<p class="calendar-skipped">${escape(calendarOutside(plan.outside.length))}</p>` : '';
  const day = (d: (typeof plan.weeks)[number]['days'][number]): string =>
    `<li class="calendar-strip-day"${d.today ? ' data-today=""' : ''}${d.past ? ' data-past=""' : ''}${d.count ? ` data-count="${d.count}"` : ''}${d.marked ? ' aria-current="date"' : ''}><span class="calendar-strip-date num">${escape(d.said)}${d.today ? ` <span class="calendar-today">${escape(CALENDAR_TODAY)}</span>` : ''}</span>${items(d.items)}${d.more ? `<span class="calendar-more">${escape(calendarMore(d.more))}</span>` : ''}</li>`;
  const body = plan.empty
    ? `<p class="calendar-empty">${escape(CALENDAR_NONE)}</p>`
    : plan.weeks.map((w) => `<div class="calendar-week"${w.count ? ` data-count="${w.count}"` : ''}><p class="calendar-week-label">${escape(w.label)}</p><ol class="calendar-week-days" aria-label="${escape(w.label)}">${w.days.map(day).join('')}</ol>${w.count === 0 ? `<p class="calendar-week-none">${escape(CALENDAR_WEEK_NONE)}</p>` : ''}</div>`).join('');
  return `<div class="calendar calendar-strip">${body}${outside}${skipped}</div>`;
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
  const lines = linkPlan(b.rows, o);
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
  /* A BLOCK LEFT WITH NOTHING ONCE ITS PARTS WITH NO VALUE ARE GONE says the host's `empty:` line in place of them, or
     is not drawn at all, frame and caption with it (`emptied`). */
  const left = emptied(b, o);
  if (left === null) return '';
  /* A BLOCK'S ACTIONS WITH NO HOST TO PRESS THEM are one quiet line of their labels, the line Block.svelte draws when no
     `act` is handed, so the two renderers stay one tree. Each row's actions are said once in that line, never per row. */
  const acts = actionLabels([...(b.actions ?? []), ...(b.row_actions ?? [])]);
  const actsLine = acts.length ? `<p class="block-actions">${escape(acts.join(' · '))}</p>` : '';
  return `<figure class="block block-${spec.primitive}" data-kind="${b.kind}"${form} data-primitive="${spec.primitive}"${toneAttrs(b.tone)}>${cap}${
    left === undefined ? draw(b as never, o) : emptyLine(left)
  }${actsLine}</figure>`;
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
  /* One count of late patterns for the whole call (`lateId`); a call made while drawing shares the outer one. */
  const own = lateSeen === null;
  if (own) lateSeen = new Map();
  try {
    return segments
      .map((s) => (s.type === 'block' ? block(s, opts) : s.type === 'degraded' ? degraded(s) : markdown(s, opts)))
      .join('');
  } finally {
    if (own) lateSeen = null;
  }
}

/** The accessible name of a drawn figure reads as a sentence, not as three floating numbers (13 §7). A part that is
    not drawn for having no value (`drawnRows`) is not said either. */
export const describe = (b: Block, o: RenderOptions = {}): string =>
  [b.heading, ...drawnRows(b, o).map(({ row: r }) => r.cells.filter(Boolean).map((c) => plain(inline(c, o))).join(', '))]
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
  const choice = (label: string, on: boolean, count: number | null, hue: number | null = null): string =>
    `<span class="filters-choice"${on ? ' data-on=""' : ''}>${hue === null ? '' : `<span class="filters-dot" style="--hue: ${hue}" aria-hidden="true" data-slot="${slotOf(hue)}"></span>`}${escape(label)}${count === null ? '' : `<span class="filters-count num">${count}</span>`}</span>`;
  const groups = plans
    .map(
      (p) =>
        `<div class="filters-group" role="group" aria-label="${escape(p.label)}" data-control="${p.control}" data-field="${escape(p.field)}">${choice(FILTERS_ALL, p.all, null)}${p.shown
          .map((v) => choice(v.label, v.on, v.count, v.hue))
          .join('')}${p.rest.length ? `<span class="filters-more">${escape(filtersMore(p.rest.length))}</span>` : ''}</div>`,
    )
    .join('');
  return `<div class="filters">${groups}</div>`;
}
