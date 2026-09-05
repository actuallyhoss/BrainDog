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
import { CURRENCY, NOW, REGISTERS, display, type BlockResult } from './api.ts';

/** A bar over a register groups its rows and sums them — the one place a page does arithmetic. */
function barRows(block: BlockResult): string[] {
  const by = block.columns[0]?.field ?? 'party';
  const of = block.columns[1]?.field ?? 'amount';
  const totals = new Map<string, number>();
  for (const e of block.entries) {
    const key = display(block.register ?? '', by, e.fields[by]) ?? 'Nobody in particular';
    totals.set(key, (totals.get(key) ?? 0) + Number(e.fields[of] ?? 0));
  }
  return [...totals]
    .sort((a, b) => b[1] - a[1])
    /* The SUM is formatted through the summed field's own type, not always as money. A bar over
       `effort` in days printed `GBP 0.02` — the total was 2.4 days, run through a money formatter
       that reads its input as minor units. A block that can be bound to any register cannot assume
       the thing it is adding up is currency. */
    .map(([key, total]) => `${key} | ${display(block.register ?? '', of, total) ?? money(total, CURRENCY)} | `);
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
  for (const e of block.entries) {
    const key = display(block.register ?? '', by, e.fields[by]) ?? 'Unset';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1]).map(([key, n]) => ` | ${n} | ${key}`);
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
  const total = block.entries.reduce((a, e) => a + Number(e.fields[of] ?? 0), 0);
  const target = block.target;
  if (target === undefined) return [];
  const label = block.columns[0]?.label ?? block.heading ?? '';
  const fmt = (n: number) => display(block.register ?? '', of, n) ?? String(n);
  /* The tone is the reading, and it is the whole point of a gauge: over the line is `bad`, close to
     it is `warn`, under it is nothing at all — a gauge that is fine should not be coloured. */
  const tone = total > target ? ' | bad' : total > target * 0.85 ? ' | warn' : '';
  return [`${label} | ${fmt(total)} | ${fmt(target)}${tone}`];
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
    const tone = KINDS[block.kind as keyof typeof KINDS]?.tone && row.tone ? ` | ${row.tone}` : '';
    return `${values.join(' | ')}${tone}`;
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
    ? block.metrics.map((m) => `${m.label} | ${m.value} | ${m.note}${m.tone ? ` | ${m.tone}` : ''}`)
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
