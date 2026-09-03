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
import { CURRENCY, NOW, display, type BlockResult } from './api.ts';

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
    .map(([key, total]) => `${key} | ${money(total, CURRENCY)} | `);
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

  const rows = block.metrics
    ? block.metrics.map((m) => `${m.label} | ${m.value} | ${m.note}${m.tone ? ` | ${m.tone}` : ''}`)
    : block.kind === 'bar'
      ? barRows(block)
      : block.register && block.columns.length > 0 && spec
        ? projectRows(block, spec.cells)
        : block.body
          ? [block.body]
          : [];
  return parse(['```' + head, ...rows, '```'].join('\n'));
}
