/**
 * A page block, turned into the dialect.
 *
 * ONE conversion, used by every surface that draws a declared page — the page route and the shared
 * link — because they were two, and the second one only knew about `table` and `stat`.
 *
 * A page block becomes a Block segment THROUGH THE DIALECT, so a declared page and a hand-written
 * write-up take one code path from the first `<figure>` down.
 *
 * ── THE PROJECTION IS DECLARED, NOT HARD-CODED ──────────────────────────────
 *
 * This file used to carry one bespoke row-builder per kind: `timelineRows` read `renews`, `name`
 * and `provider`; `boardRows` read `state`, `what` and `thing`. Those are the SERVICES and TASKS
 * registers' field names, welded into the renderer.
 *
 * It worked for exactly as long as every block was bound to the register it was written against.
 * The first project page — a `timeline` over agent sessions — printed `undefined | undefined |
 * undefined`, and a `todo` over the same register printed nothing at all, because no builder
 * existed for it.
 *
 * So the projection comes from the DECLARATION. A kind knows its arity (`KINDS[kind].cells`); the
 * block's `columns:` names which field fills each cell, in order; `display()` formats each one the
 * way every other surface formats it. Any of the sixteen kinds can now be bound to any register,
 * which is the whole of what "everything is a widget" has to mean.
 *
 * ONE kind keeps its own builder, and it earns it: `bar` does ARITHMETIC. It groups rows and sums a
 * field, so there is no per-row projection to declare — the rows it draws are not the rows it read.
 * It names its two fields through `columns:` like everything else, but what it does with them is
 * group-and-sum rather than print.
 *
 * `board` needed one and does not: it groups by the first cell, and the general path already puts
 * the declared first field there. The grid primitive derives the column SET from the distinct values
 * it finds, which is the one place a layout is allowed to count what it was given (05 §4 forbids
 * inferring from the space available, not from the data).
 */

import { money, parse, relative } from 'braindog-render';
import { KINDS, isKind } from 'braindog-render';
import { NOW, REGISTERS, display, type BlockResult } from './api.ts';
import { asMoney, merge, mixedFix, total, type Total } from './money.ts';

/**
 * The rest of the groups, as one group.
 *
 * `limit:` on a kind that reduces means HOW MANY BARS, not how many rows to read — nobody writing
 * `limit: 8` on a bar is asking for the total of eight rows. So the groups are cut, not the rows,
 * and the cut is cut at the bottom with the remainder carried: a chart captioned "by counterparty"
 * that quietly leaves out twelve counterparties is a chart about a subset nobody chose.
 */
const REST = 'Everything else';

function cut(groups: [string, number][], limit: number | undefined): [string, number][] {
  if (limit === undefined || groups.length <= limit) return groups;
  const kept = groups.slice(0, Math.max(1, limit - 1));
  const rest = groups.slice(kept.length).reduce((a, [, n]) => a + n, 0);
  return [...kept, [REST, rest]];
}

/** The same cut over money totals, where the remainder merges rather than adds. */
function cutTotals(groups: (readonly [string, Total])[], limit: number | undefined): (readonly [string, Total])[] {
  if (limit === undefined || groups.length <= limit) return groups;
  const kept = groups.slice(0, Math.max(1, limit - 1));
  return [...kept, [REST, merge(groups.slice(kept.length).map(([, t]) => t))] as const];
}

/** A bar over a register groups its rows and sums them — the one place a page does arithmetic. */
function barRows(block: BlockResult): string[] {
  const by = block.columns[0]?.field ?? 'party';
  const of = block.columns[1]?.field ?? 'amount';
  const grouped = new Map<string, unknown[]>();
  /* `matched`, NOT `entries`. The block draws the first `limit:` rows and it ADDS UP all of them:
     summing the page instead of the answer is a figure that is wrong by however many rows did not
     fit, silently, and it is the same number of pixels either way. */
  for (const e of block.matched) {
    const key = display(block.register ?? '', by, e.fields[by]) ?? 'Nobody in particular';
    const list = grouped.get(key) ?? [];
    list.push(e.fields[of]);
    grouped.set(key, list);
  }

  /* THE BAR IS PER GROUP, AND SO IS THE CURRENCY CHECK. One client billed in two currencies is one
     bar whose length is a number about nothing — and it sits in a chart beside bars that are real,
     which is the version of this nobody catches. */
  const totals = [...grouped].map(([key, values]) => [key, total(values)] as const);
  return cutTotals(
    totals.sort((a, b) => b[1].amount - a[1].amount),
    block.limit,
  ).map(([key, sum]) => {
    /* The SUM is formatted through the summed field's own type, not always as money. A bar over
       `effort` in days printed `GBP 0.02` — the total was 2.4 days, run through a money formatter
       that reads its input as minor units. A block that can be bound to any register cannot assume
       the thing it is adding up is currency. */
    const shown = sum.mixed.length
      ? mixedFix(sum.mixed)
      : (display(block.register ?? '', of, asMoney(sum.amount, sum.currency)) ?? String(sum.amount));
    return `${escapeCell(key)} | ${escapeCell(shown)} | `;
  });
}

/**
 * One cell, safe to put between pipes.
 *
 * The dialect reads `\\|` as a literal pipe and `\\\\` as a literal backslash, so both have to be
 * escaped and the backslash has to go FIRST — escaping the pipe first would then double the
 * backslash it just introduced and turn one literal pipe into a backslash followed by a column
 * break. Doing it here means an author never has to know the rule.
 */
const escapeCell = (c: string): string =>
  c.replaceAll('\\', '\\\\').replaceAll('|', '\\|');

/**
 * A chips row over a register: GROUP AND COUNT.
 *
 * Chips are "a few short facts in a row", and a fact per row is not a few — a register of fifteen
 * services drawn one chip each is a paragraph of pills. What the shape is for is the summary: seven
 * domains, three hosting, one certificate. So it groups by the first declared column and counts,
 * the same move `bar` makes with a sum.
 *
 * The first cell is the pill's dot, which is drawn or not drawn and never read; the figure and the
 * word are the fact. A chip with either missing is dropped by the renderer, because a number with
 * no noun is not a fact and a coloured dot on its own is unreadable to a tenth of people.
 */
function chipsRows(block: BlockResult): string[] {
  const by = block.columns[0]?.field ?? '';
  const counts = new Map<string, number>();
  for (const e of block.matched) {
    const key = display(block.register ?? '', by, e.fields[by]) ?? 'Unset';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return cut([...counts].sort((a, b) => b[1] - a[1]), block.limit).map(
    ([key, n]) => ` | ${n} | ${escapeCell(key)}`,
  );
}

/**
 * A gauge over a register: ONE SUM, against a declared target.
 *
 * A gauge reads `rows[0]` and nothing else, so pointed at a register it drew whichever row happened
 * to sort first and captioned it with a neighbouring column — a real number, about the wrong thing,
 * next to a word that was not a target. That is worse than no gauge.
 *
 * It sums the second declared column across every row the block's `where` admits, and measures it
 * against `target:`, which is on the declaration because there is nowhere else it could come from:
 * a budget is a decision somebody made, not a figure in the rows.
 */
function gaugeRows(block: BlockResult): string[] {
  const of = block.columns[1]?.field ?? '';
  const sum = total(block.matched.map((e) => e.fields[of]));
  const target = block.target;
  if (target === undefined) return [];
  const label = block.columns[0]?.label ?? block.heading ?? '';
  /* A GAUGE OVER TWO CURRENCIES IS NOT A GAUGE. Its whole output is one figure measured against one
     line, and neither of them means anything if the figure is a sum of two units. */
  if (sum.mixed.length) return [`${escapeCell(label)} | ${escapeCell(mixedFix(sum.mixed))} |  | warn`];
  const amount = sum.amount;
  const fmt = (n: number) => display(block.register ?? '', of, asMoney(n, sum.currency)) ?? String(n);
  /* The tone is the reading, and it is the whole point of a gauge: over the line is `bad`, close to
     it is `warn`, under it is nothing at all — a gauge that is fine should not be coloured. */
  const tone = amount > target ? ' | bad' : amount > target * 0.85 ? ' | warn' : '';
  return [`${escapeCell(label)} | ${fmt(amount)} | ${fmt(target)}${tone}`];
}

/**
 * A board's columns follow the ENUM'S DECLARED ORDER, not the order rows happen to arrive in.
 *
 * The renderer takes its columns from the first cell of each row in sequence, which is correct for a
 * primitive that cannot know what the values mean. The host does know: `state` declares
 * `open, doing, blocked, done, dropped`, and that list is the workflow. Left to arrival order the
 * board read OPEN · BLOCKED · DOING · DONE — a board whose columns are not in the order work moves
 * through them is a board you have to read twice to use once.
 *
 * Values the enum does not declare sort last, in the order they turned up, rather than being
 * dropped: a row in an unknown state is a row somebody needs to see.
 */
function boardOrder(block: BlockResult): BlockResult {
  const field = block.columns[0]?.field;
  const values = field ? REGISTERS[block.register ?? '']?.fields.find((f) => f.id === field)?.values : undefined;
  if (!field || !values) return block;
  const rank = (e: (typeof block.entries)[number]) => {
    const i = values.indexOf(String(e.fields[field] ?? ''));
    return i === -1 ? values.length : i;
  };
  return { ...block, entries: [...block.entries].sort((a, b) => rank(a) - rank(b)) };
}

/**
 * The general path: one row per entry, one cell per declared column, formatted.
 *
 * The tone travels with the row rather than being a fourth column, because a kind's arity does not
 * include it — `KINDS[kind].tone` says whether a trailing tone word is read, and the dialect's own
 * parser takes it from the end of the line.
 */
function projectRows(block: BlockResult, cells: number): string[] {
  const fields = block.columns.map((c) => c.field);
  return block.rows.map((row, i) => {
    const entry = block.entries[i];
    const values = Array.from({ length: cells }, (_, n) => {
      const field = fields[n];
      if (!field || !entry) return '';
      /* An `instant` on a row that is a live thing reads as an age, not a timestamp: a session's
         `last_seen` is "8m ago", which is the only form of it anybody says out loud. */
      const raw = entry.fields[field];
      return (typeof raw === 'string' && field.endsWith('_seen')
        ? relative(raw.slice(0, 10), NOW)
        : display(block.register ?? '', field, raw)) ?? '';
    });
    /**
     * THE TICK, for a kind that has one.
     *
     * `todo` and its parser have always read `[ ]` and `[x]` at the head of a line; the projection
     * never wrote one, so a register-bound todo drew a list of tasks with no checkboxes at all and
     * no way to tell a finished row from an open one. Nothing had to be added to the declaration to
     * fix it: a register already says which of its states are terminal, in `done:`, and that is the
     * same list `toneOf` reads to paint a finished row.
     */
    const spec = KINDS[block.kind as keyof typeof KINDS];
    const out = values.map(escapeCell);
    if (spec?.checkbox && entry) {
      const reg = REGISTERS[block.register ?? ''];
      const state = reg?.state ? String(entry.fields[reg.state] ?? '') : '';
      /* AFTER the escaping, never through it: the brackets are dialect and the name is data, and a
         task called `ship a | b` must still be one cell. */
      out[0] = `[${reg?.done?.includes(state) ? 'x' : ' '}] ${out[0] ?? ''}`;
    }

    const tone = spec?.tone && row.tone ? ` | ${row.tone}` : '';
    /* ESCAPED, like the authored path. A value is a string somebody typed, and one `|` in it made
       the row one cell too wide, failed the arity check, and degraded the WHOLE BLOCK to a fence
       the app then dropped on the floor. `redirect | kiln.example` in a domain's target field was
       enough to delete the block it appeared in. */
    return `${out.join(' | ')}${tone}`;
  });
}

/**
 * The heading is DELIBERATELY not passed through. The block bar above already names the block and
 * says where its rows came from; a figcaption repeating it is the same sentence twice, in two
 * different typographic registers.
 */
export function toSegments(block: BlockResult) {
  const head = `${block.kind}${block.tone ? ` |  | ${block.tone}` : ''}`;
  const spec = isKind(block.kind) ? KINDS[block.kind] : undefined;

  /* AUTHORED ROWS COME FIRST, and a block that declares both a source and authored rows is refused
     rather than resolved. Picking one would be a silent decision about where a block's content
     comes from, made on behalf of whoever wrote the declaration — and the whole argument for the
     `where:` evaluator was that a declaration must not be quietly reinterpreted.

     The cells are joined with the dialect's own separator here rather than by the author, so a cell
     containing a pipe is escaped once, in one place, instead of being a rule everybody has to know.
     A tone is a trailing cell, which is what the parser expects and what `KINDS[kind].tone` gates. */
  const conflicted = Boolean(block.authored?.length) && Boolean(block.register);

  const rows = conflicted
    ? []
    : block.authored?.length
      ? block.authored.map(
          (r) =>
            `${r.cells.map(escapeCell).join(' | ')}${
              r.tone && spec?.tone ? ` | ${r.tone}` : ''
            }`,
        )
      : block.metrics
    ? block.metrics.map(
        (m) => `${escapeCell(m.label)} | ${escapeCell(m.value)} | ${escapeCell(m.note)}${m.tone ? ` | ${m.tone}` : ''}`,
      )
    : block.kind === 'bar'
      ? barRows(block)
      : block.kind === 'chips'
        ? chipsRows(block)
      : block.kind === 'gauge'
        ? gaugeRows(block)
      : block.register && block.columns.length > 0 && spec
        ? projectRows(block.kind === 'board' ? boardOrder(block) : block, spec.cells)
        : block.body
          ? [block.body]
          : [];
  return parse(['```' + head, ...rows, '```'].join('\n'));
}

/**
 * ── WHY A BLOCK IS BLANK ─────────────────────────────────────────────────────
 *
 * `empty:` was rendered for `table` and for nothing else, so fifteen of the sixteen kinds drew a
 * heading over a blank rectangle and said nothing at all. That reads as a bug in the product rather
 * than as an answer, and it is the worst of the three cases that reach it:
 *
 *   1. THE FILTER WAS NOT UNDERSTOOD. `compile()` refuses a clause it cannot resolve and `matches`
 *      then admits no row, which is the safe answer and an invisible one. Whoever wrote the
 *      declaration — usually an agent, which cannot see the screen — learns nothing and writes it
 *      the same way again. 10 §7's fourth rule is that the refusal is the teacher, so the words
 *      `explain()` already produces are put on the page.
 *   2. THE DECLARATION CONTRADICTS ITSELF: a source and authored rows, where picking one would be a
 *      silent decision about where the block's content comes from.
 *   3. IT ASKED AND THE ANSWER WAS NOTHING. The ordinary case, and the author's own `empty:`
 *      sentence is the right words for it — "You owe nobody anything" is a result, not a fault.
 *
 * One and two are the block's own error and take the `error` state; three is `no-results`. The
 * difference is the whole point: a reader must be able to tell "nothing matched" from "this block
 * is broken", and both were drawn as the same emptiness.
 */
export type Refusal = {
  kind: 'no-results' | 'error';
  title: string;
  body?: string;
  /** One line per clause that did not resolve, verbatim from `explain()`. */
  lines?: string[];
};

/** Everything a surface needs to draw one block: the segments, or the reason there are none. */
export function draw(block: BlockResult): { segments: ReturnType<typeof parse>; refusal: Refusal | null } {
  if (block.authored?.length && block.register)
    return {
      segments: [],
      refusal: {
        kind: 'error',
        title: 'This block declares both a source and rows of its own.',
        body: 'Keep one. `source:` reads a register; `authored:` is written out by hand.',
      },
    };

  if (block.refusals.length)
    return {
      segments: [],
      refusal: {
        kind: 'error',
        title: 'This block’s filter was not understood, so it matched nothing.',
        lines: block.refusals,
      },
    };

  /* A `table` is drawn by the grid rather than through the dialect, so its rows are the check. */
  if (block.kind === 'table')
    return {
      segments: [],
      refusal: block.rows.length
        ? null
        : { kind: 'no-results', title: block.empty ?? 'Nothing here yet.' },
    };

  const segments = toSegments(block);
  const blank = segments.every((s) => s.type === 'block' && s.rows.length === 0);
  return {
    segments,
    refusal: blank ? { kind: 'no-results', title: block.empty ?? 'Nothing here yet.' } : null,
  };
}
