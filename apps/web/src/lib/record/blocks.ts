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

import { across, convertMinor, dayFieldOf, rateFor, type Part, type Rate } from '@braindog/kernel';
import { day as longDay, money, parse, type Block } from 'braindog-render';
import { KINDS, isKind, type CardRole } from 'braindog-render';
import type { Column } from 'braindog-render/svelte';
import { NOW, REGISTERS, ROWS, display, homeCurrency, walkTable, type BlockResult } from './api.ts';
import { copy } from '../copy.ts';
import { declaredValue, registerHref } from './where.ts';
import { format, fxNow, windowMs } from './metrics.ts';
import { METRICS } from './declared.ts';
import { asMoney, currencyOf, merge, mixedFix, symbolText, total, type Total } from './money.ts';
import { linesText, measuresOf, tileRows } from './measures.ts';

/**
 * Where a list of links points and the money field each linked row holds, or `null` when the field is not such a list.
 *
 * `FieldDecl` names `to` and not `of`, so a list of links is a `list` field that says where it points.
 */
export function linkOf(register: string | null, field: string | undefined): { to: string; money: string } | null {
  if (!register || !field) return null;
  const f = REGISTERS[register]?.fields.find((x) => x.id === field);
  /* `FieldType` is the build's own list, and a record's schema may send a `list` it does not name. */
  if (!f || (f.type as string) !== 'list' || !f.to) return null;
  const money = REGISTERS[f.to]?.fields.find((x) => x.type === 'money')?.id;
  return money ? { to: f.to, money } : null;
}

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
  /* A LIST OF LINKS ADDS UP WHAT IT LINKS TO, each linked row's money handed on by the page reader, and the sum is
     written as that money field writes it. */
  const link = block.linked ? linkOf(block.register ?? null, of) : null;
  const valuesOf = (v: unknown): unknown[] =>
    link ? (Array.isArray(v) ? v.map((id) => block.linked?.[String(id)]).filter((m) => m !== undefined) : []) : [v];
  const written = (sum: Total): string | null =>
    link ? display(link.to, link.money, asMoney(sum.amount, sum.currency)) : display(block.register ?? '', of, asMoney(sum.amount, sum.currency));
  const grouped = new Map<string, unknown[]>();
  /* `matched`, NOT `entries`. The block draws the first `limit:` rows and it ADDS UP all of them:
     summing the page instead of the answer is a figure that is wrong by however many rows did not
     fit, silently, and it is the same number of pixels either way. */
  const unset: unknown[] = [];
  for (const e of block.matched) {
    /* A ROW THAT LINKS TO NOTHING WITH MONEY IN IT HAS NO BAR, because a zero would say it holds none. */
    if (link && valuesOf(e.fields[of]).length === 0) continue;
    const said = display(block.register ?? '', by, e.fields[by], NOW, block.names);
    /* WHAT NO PART HOLDS IS ITS OWN ROW, LAST, where the block names it, and it opens those rows. */
    if (said === null && block.unset) {
      unset.push(...valuesOf(e.fields[of]));
      continue;
    }
    const key = said ?? 'Nobody in particular';
    const list = grouped.get(key) ?? [];
    list.push(...valuesOf(e.fields[of]));
    grouped.set(key, list);
  }

  /* THE BAR IS PER GROUP, AND SO IS THE CURRENCY CHECK. One client billed in two currencies is one
     bar whose length is a number about nothing — and it sits in a chart beside bars that are real,
     which is the version of this nobody catches. */
  const totals = [...grouped].map(([key, values]) => [key, total(values)] as const);
  const drawn = cutTotals(
    totals.sort((a, b) => b[1].amount - a[1].amount),
    block.limit,
  ).map(([key, sum]) => {
    /* The SUM is formatted through the summed field's own type, not always as money. A bar over
       `effort` in days printed `GBP 0.02` — the total was 2.4 days, run through a money formatter
       that reads its input as minor units. A block that can be bound to any register cannot assume
       the thing it is adding up is currency. */
    const shown = sum.mixed.length
      ? mixedFix(sum.mixed)
      : (written(sum) ?? String(sum.amount));
    return `${escapeCell(key)} | ${escapeCell(shown)} | `;
  });
  if (!block.unset || unset.length === 0 || !block.register) return drawn;
  const sum = total(unset);
  const shown = sum.mixed.length ? mixedFix(sum.mixed) : (written(sum) ?? String(sum.amount));
  return [...drawn, unsetRow(block.unset, registerHref(block.register, joined(block.where, `${by} is empty`)), shown)];
}

/**
 * A `progress` over a register: a track a row, in one of three readings of its columns.
 *
 * A GOAL (`toward:`) sets each row's target, its second column, against what was logged toward that row, and its third
 * column is the note. A BUDGET (`spent:`) sets each row's limit, its second column, against the part of the figure whose key is the row's
 * first column as stored, so Groceries is set against what the figure grouped as `groceries`, and a category nothing was
 * spent in is at zero. A COUNT, when the second column is a yes or no, groups the rows by the first and fills each group
 * by how many say yes: a project by its steps done. Otherwise each row is its own track, value against target, and a row
 * with no target has nothing to fill toward and is left out. `limit:` is how many tracks.
 */
function progressRows(block: BlockResult): string[] {
  const register = block.register ?? '';
  const [label, value, target, note] = block.columns.map((c) => c.field);
  if (!label || !value) return [];
  const said = (field: string | undefined, v: unknown): string => (field ? (display(register, field, v, NOW, block.names) ?? '') : '');
  const cap = (rows: string[]) => (block.limit === undefined ? rows : rows.slice(0, Math.max(0, block.limit)));

  /* A GOAL (`toward:`) sets each row's target, its second column, against what was logged toward that row. */
  if (block.spentBy?.toward) {
    const logged = block.spentBy;
    return cap(
      block.matched.map((e) => {
        const aim = e.fields[value];
        const currency = logged.unit ?? currencyOf(aim) ?? null;
        const part = logged.groups.find((g) => g.key === String(e.seq))?.value ?? 0;
        const figure = currency ? money(Math.round(part), currency) : String(Math.round(part * 100) / 100);
        return `${escapeCell(said(label, e.fields[label]))} | ${escapeCell(figure)} | ${escapeCell(said(value, aim))} | ${escapeCell(said(target, e.fields[target ?? '']))}`;
      }),
    );
  }

  if (block.spentBy) {
    const spent = block.spentBy;
    return cap(
      block.matched.map((e) => {
        const limit = e.fields[value];
        const currency = spent.unit ?? currencyOf(limit) ?? null;
        const part = spent.groups.find((g) => g.key === String(e.fields[label] ?? ''))?.value ?? 0;
        const figure = currency ? money(Math.round(part), currency) : String(part);
        return `${escapeCell(said(label, e.fields[label]))} | ${escapeCell(figure)} | ${escapeCell(said(value, limit))} | `;
      }),
    );
  }

  if (REGISTERS[register]?.fields.find((f) => f.id === value)?.type === 'bool') {
    const groups = new Map<string, { done: number; all: number }>();
    for (const e of block.matched) {
      const key = display(register, label, e.fields[label], NOW, block.names) ?? REST;
      const g = groups.get(key) ?? { done: 0, all: 0 };
      g.all += 1;
      if (e.fields[value] === true) g.done += 1;
      groups.set(key, g);
    }
    return cap([...groups].map(([key, g]) => `${escapeCell(key)} | ${g.done} | ${g.all} | `));
  }

  if (!target) return [];
  return cap(
    block.matched
      .filter((e) => e.fields[target] !== null && e.fields[target] !== undefined && e.fields[target] !== '')
      .map((e) => `${escapeCell(said(label, e.fields[label]))} | ${escapeCell(said(value, e.fields[value]))} | ${escapeCell(said(target, e.fields[target]))} | ${escapeCell(said(note, e.fields[note ?? '']))}`),
  );
}

/** Two clauses of a sentence predicate as one. */
const joined = (where: string | undefined, clause: string): string => (where?.trim() ? `${where}, ${clause}` : clause);

/** The row for what no part holds: its label, linked to those rows, and its figure. */
const unsetRow = (label: string, href: string, shown: string): string => `[${escapeCell(label)}](${href}) | ${escapeCell(shown)} | `;

/**
 * A bar or a split over a grouped figure: each part, labelled as its field labels it, largest first, and what no part
 * holds as the block's `unset:` row.
 *
 * THE WHOLE LESS THE PARTS IS WHAT NO PART HOLDS, because a grouping leaves out rows with no value in its field. It is
 * only said when every part was read: past the cap the rest is not known to be unset.
 */
function partsRows(block: BlockResult): string[] {
  const parts = block.parts!;
  const decl = METRICS[parts.metric];
  const register = decl?.source?.startsWith('register.') ? decl.source.slice('register.'.length) : '';
  const field = decl?.group_by ?? '';
  const currency = parts.unit ?? (decl?.format?.startsWith('money.') ? decl.format.slice('money.'.length) : null);
  const said = (v: number) => (currency ? money(Math.round(v), currency) : format(decl?.format, v));
  const limit = block.limit ?? parts.groups.length;
  const rows = parts.groups
    .filter((g): g is { key: string; value: number } => g.value !== null)
    .slice(0, limit)
    .map((g) => `${escapeCell(display(register, field, g.key) ?? g.key)} | ${escapeCell(said(g.value))} | `);
  const rest = parts.value === null || parts.more > 0 ? 0 : parts.value - parts.groups.reduce((n, g) => n + (g.value ?? 0), 0);
  if (!block.unset || !register || Math.round(rest) < 1) return rows;
  return [...rows, unsetRow(block.unset, registerHref(register, joined(decl?.where, `${field} is empty`)), said(rest))];
}

/**
 * A bridge over the cash walk: cash now, what comes in and what goes out over the walk, and where it lands.
 *
 * THE WALK IS THE ARITHMETIC, so the rows add up by construction: the end is the walk's last balance,
 * which is the start plus every movement it made. A walk with no movements still draws the start and
 * the end, because "nothing moves" is an answer about the next thirty days.
 */
function bridgeRows(block: BlockResult): string[] {
  const walk = block.walk;
  if (!walk) return [];
  const currency = walk.currency ?? homeCurrency() ?? null;
  if (currency === null) return [];
  const ins = walk.steps.filter((s) => s.delta > 0);
  const outs = walk.steps.filter((s) => s.delta < 0);
  const sum = (steps: readonly { delta: number }[]) => steps.reduce((n, s) => n + s.delta, 0);
  const end = walk.steps.at(-1)?.balance ?? walk.from;
  return [
    `${escapeCell(copy.bridgeStart)} | ${money(walk.from, currency)} | `,
    `${escapeCell(copy.bridgeIn)} | ${money(sum(ins), currency)} | `,
    `${escapeCell(copy.bridgeOut)} | ${money(sum(outs), currency)} | `,
    `${escapeCell(copy.bridgeEnd(block.horizon ?? 180))} | ${money(end, currency)} | `,
  ];
}

/**
 * A forecast as the dialect writes it: the opening, the balance remembered before today, every movement
 * of the walk, the horizon, the knobs a reader may move, how late money comes in, and how near a crossing is said.
 *
 * THE WALK IS THE ONE THE TABLE AND THE BRIDGE READ, so the line, the bars of the next thirty days and
 * the figures beside them cannot disagree about where the money goes.
 */
function forecastRows(block: BlockResult): string[] {
  const walk = block.walk;
  if (!walk) return [];
  const currency = walk.currency ?? homeCurrency() ?? null;
  const said = (minor: number) => (currency ? money(minor, currency) : String(minor));
  /* THE DAY THE BLOCK WAS READ, which is the record's clock on a live page and the sample's here. */
  const today = block.stale_at.slice(0, 10);
  return [
    `opening | ${today} | ${escapeCell(copy.bridgeStart)} | ${said(walk.from)}`,
    ...(block.past ?? []).map((p) => `past | ${p.at} |  | ${said(p.value)}`),
    ...walk.steps.map((s) => `step | ${s.day} | ${escapeCell(s.label)} | ${said(s.delta)}`),
    `horizon | ${block.horizon ?? 180} |  | `,
    ...(block.knobs?.length ? [`knobs | ${block.knobs.join(' ')} |  | `] : []),
    /* ONE WALK OF SEVERAL, which moves with the others under the knobs the last of them draws. */
    ...(block.walkGroup ? [`group | ${escapeCell(block.walkGroup.id)} | ${escapeCell(block.walkGroup.key)} | `] : []),
    /* HOW LATE MONEY HAS COME IN, in whole days, which the late knob marks; and how near a crossing is said. */
    /* AND WHAT THE KNOB IS CALLED, the figure's name as the record holds it, so a person's record says it in their words. */
    ...(typeof block.lateness === 'number' && Number.isFinite(block.lateness)
      ? [`late | ${Math.round(block.lateness)} | ${escapeCell(block.late_name ?? '')} | `]
      : block.late_name
        ? [`late |  | ${escapeCell(block.late_name)} | `]
        : []),
    ...(typeof block.under === 'number' ? [`under | ${block.under} |  | `] : []),
  ];
}

/**
 * A series as the dialect writes it: a header naming each line in or out, then a row a bucket.
 *
 * THE LABEL IS THE BUCKET AS A PERSON SAYS IT, `Apr 2026` rather than `2026-04`, and a figure is money
 * in the lines' one currency. A bucket nothing fell in is an empty cell, which the renderer draws as a
 * gap. No buckets at all is no rows, which `draw` answers with the block's `empty:` sentence.
 */
function seriesRows(block: BlockResult): string[] {
  const bars = block.bars;
  if (!bars || bars.keys.length === 0) return [];
  const currency = bars.unit ?? homeCurrency() ?? null;
  const lines = block.series ?? [];
  const head = [
    escapeCell(copy.seriesAxis[bars.bucket] ?? bars.bucket),
    ...lines.map((l) => `${l.dir === 'out' ? 'out' : 'in'}: ${escapeCell(l.label ?? l.metric)}`),
    'state',
  ].join(' | ');
  const rows = bars.keys.map((key, i) => {
    const cells = bars.values.map((line) => {
      const v = line[i];
      return v === null || v === undefined ? '' : currency ? money(v, currency) : String(v);
    });
    return [escapeCell(bucketLabel(key, bars.bucket)), ...cells, bars.states[i] ?? ''].join(' | ');
  });
  return [head, ...rows];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A bucket's key as a person reads it: `Apr 2026`, `Q3 2026`, `2026`, `17 Sep`, or the week it begins. */
export function bucketLabel(key: string, bucket: string): string {
  const [y, rest] = key.split('-', 2) as [string, string | undefined];
  if (bucket === 'year' || rest === undefined) return y;
  if (bucket === 'quarter') return `${rest} ${y}`;
  const month = MONTHS[Number(key.slice(5, 7)) - 1] ?? '';
  if (bucket === 'month') return `${month} ${y}`;
  const day = `${Number(key.slice(8, 10))} ${month}`;
  return bucket === 'week' ? copy.seriesWeekOf(day) : day;
}

/**
 * One cell, safe to put between pipes.
 *
 * The dialect reads `\\|` as a literal pipe and `\\\\` as a literal backslash, so both have to be
 * escaped and the backslash has to go FIRST — escaping the pipe first would then double the
 * backslash it just introduced and turn one literal pipe into a backslash followed by a column
 * break. Doing it here means an author never has to know the rule.
 */
/**
 * A figure's trend as the dialect's fourth `stat` cell: whole units, a gap as `-`.
 *
 * WHOLE UNITS FOR MONEY, because the line's accessible name reads these numbers out, and `3385000` is
 * pence nobody says. The shape is the same at any scale. A trend of gaps only draws no cell at all.
 */
export function trendCell(trend: readonly (number | null)[] | undefined, money = false): string {
  if (!trend || !trend.some((v) => v !== null)) return '';
  return ` | ${trend.map((v) => (v === null ? '-' : String(money ? Math.round(v / 100) : v))).join(' ')}`;
}

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
  /**
   * THE CURRENCY IS THE FIELD'S, NOT THE MATCHED SET'S.
   *
   * `total()` reports `currency: null` when nothing matched — correctly, because no row supplied
   * one — and `asMoney(n, null)` makes a value `display()` cannot format, so BOTH numbers fell
   * through to `String(n)` and printed raw minor units. `/p/estate` on a young record read
   * **"Every month  0  of 22,000"** where the declaration says GBP 220.00, three hundred pixels from
   * a tile reading "no more than GBP 3,000.00" — so a person in their first week saw a monthly
   * ceiling of "22,000" beside a yearly one of £3,000.
   *
   * `13 §4.2`: a truncated figure is not shortened, it is wrong; a figure that has lost its unit is
   * the same failure, and the target had never had a unit to lose — it is a declared constant that
   * does not change when a filter matches nothing. So the code falls back to the currency the FIELD
   * holds anywhere in the register, which is what both numbers are denominated in either way.
   */
  const declared =
    sum.currency ??
    (ROWS[block.register ?? ''] ?? []).map((e) => currencyOf(e.fields[of])).find(Boolean) ??
    null;
  const fmt = (n: number) => display(block.register ?? '', of, asMoney(n, declared)) ?? String(n);
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
         `last_seen` is "8m ago", which is the only form of it anybody says out loud.

         AND THAT IS WHAT `display()` DOES NOW, so the special case is gone. It named one field
         suffix and routed it around the dispatch — `relative(raw.slice(0, 10))`, the truncation the
         formatter work exists to end — so `/p/kiln`'s Agents block read `today · today · 1d ago` while
         `/r/sessions`, one click away, read `just now · 6 min ago · 3h ago` for the same three rows.
         A block and a register disagreeing about the same field is exactly the split one dispatch is
         for, and the fix is a deletion. */
      /* A LINK READS AS THE ROW IT POINTS AT, as the evaluator named it and the table beside it shows it: a guide's
         step drew `milestones#1` where the table drew the milestone's title. */
      if (REGISTERS[block.register ?? '']?.fields.find((f) => f.id === field)?.type === 'ref' && row.cells[n]) return row.cells[n];
      return display(block.register ?? '', field, entry.fields[field]) ?? '';
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
 * What each column is on a card: the declaration's `as:`, or where a phone card would put it.
 *
 * A column without `as:` is placed by `cardPlan`'s two rules: the first text column names the card
 * and the first figure that never truncates is its figure. Everything else is a fact, and past three
 * facts the renderer degrades the block and says why, which is better than this choosing what to
 * leave out.
 */
function cardRoles(columns: readonly Column[]): CardRole[] {
  const roles: (CardRole | undefined)[] = columns.map((c) => c.as);
  const free = (test: (c: Column) => boolean) => columns.findIndex((c, i) => roles[i] === undefined && test(c));
  if (!roles.includes('title') && !roles.includes('who')) {
    const i = free((c) => c.align !== 'end');
    if (i >= 0) roles[i] = 'title';
  }
  if (!roles.includes('figure')) {
    const i = free((c) => c.truncate === 'never');
    if (i >= 0) roles[i] = 'figure';
  }
  return roles.map((r) => r ?? 'fact');
}

/**
 * A card grid over a register: a first row naming each column's role and label, then one row per
 * entry, projected the way every other kind is.
 *
 * THE LABEL IS THE FIELD'S NAME, not its id. A column declared without `label:` arrives labelled with
 * its field id, and `last_seen` beside a figure is the schema talking to a reader.
 */
function cardsRows(block: BlockResult): string[] {
  /* The evaluator's columns, typed as the renderer's: the declaration's own column type is the other
     half of this intersection and does not carry `as`. */
  const columns: readonly Column[] = block.columns;
  const roles = cardRoles(columns);
  const fields = REGISTERS[block.register ?? '']?.fields ?? [];
  const labelOf = (c: Column) => (c.label !== c.field ? c.label : (fields.find((f) => f.id === c.field)?.label ?? c.label));
  /* A RUN GONE QUIET IS THE EVALUATOR'S TO SAY, so it is a column of its own and not a declared one. */
  const quiet = block.quiet;
  const head = [...columns.map((c, i) => escapeCell(`${roles[i]}: ${labelOf(c)}`)), ...(quiet ? ['quiet'] : [])].join(' | ');
  /* The card's name: its title, or the person when it has none, which is what the renderer heads it with. */
  const named = roles.includes('title') ? roles.indexOf('title') : roles.indexOf('who');
  const rows = block.entries.map((_, i) => {
    /* THE ROW'S OWN CELLS, as the evaluator said them: a scope as Everywhere, and a run's project by
       its name. AN ENUM VALUE IN SENTENCE CASE, as the lists set it: "client" on a card read as a
       stored value. Enums only, because an email or a name must keep the case it was written in. */
    const said = (c: Column, j: number): string => {
      const v = block.rows[i]?.cells[j] ?? '';
      return fields.find((f) => f.id === c.field)?.type === 'enum' && v ? v.charAt(0).toUpperCase() + v.slice(1) : v;
    };
    const cells = columns.map((c, j) => escapeCell(said(c, j)));
    if (quiet) cells.push(quiet[i] ? 'quiet' : '');
    /* OUT OF DATE: the day is older than the window, so the card says so beside that day, with the watch glyph. */
    const old = staleAt(block, block.entries[i]);
    const at = old ? columns.findIndex((c) => c.field === block.stale?.field) : -1;
    if (at >= 0) cells[at] = escapeCell(copy.outOfDate(said(columns[at]!, at)));
    /* THE NAME OPENS THE ROW, so a card is a door the way a register row is. It is written as the
       dialect's own link, so no host callback is needed; a name holding a bracket stays text rather
       than breaking the link written around it. */
    const href = block.rows[i]?.href;
    const name = named >= 0 ? cells[named] : undefined;
    if (href && name && !/[[\]]/u.test(name)) cells[named] = `[${name}](${href})`;
    const tone = old ? 'warn' : block.rows[i]?.tone;
    return `${cells.join(' | ')}${tone ? ` | ${tone}` : ''}`;
  });
  return [head, ...rows];
}

/** Whether a row's `stale:` day is older than the window, on the clock the block was read at. */
function staleAt(block: BlockResult, entry: BlockResult['entries'][number] | undefined): boolean {
  const rule = block.stale;
  const span = rule ? windowMs(rule.after) : null;
  const v = rule && entry ? entry.fields[rule.field] : undefined;
  if (span === null || typeof v !== 'string') return false;
  return Date.parse(v.length === 10 ? `${v}T00:00:00Z` : v) < Date.parse(block.stale_at) - span;
}

/**
 * A section's one row: `glyph | count | fold`.
 *
 * Over a register it counts what its `where:` admits, so the heading says how many are under it.
 * Without a source it counts nothing and draws no number, a gap rather than a zero. `icon:` and
 * `fold:` are read through a local type because `PageBlock` does not carry them yet.
 */
function sectionRow(block: BlockResult): string {
  const { icon, fold } = block as BlockResult & { icon?: string; fold?: boolean };
  /* `total` AND NOT `matched.length`: a live answer sends the count and only the rows that fit. */
  const count = block.register ? String(block.total) : '';
  return `${escapeCell(icon ?? '')} | ${count} | ${fold ? 'fold' : ''}`;
}

/**
 * The heading is DELIBERATELY not passed through. The block bar above already names the block and
 * says where its rows came from; a figcaption repeating it is the same sentence twice, in two
 * different typographic registers.
 *
 * A SECTION IS THE EXCEPTION, because its heading is the whole block: the renderer draws it as a
 * heading rather than a caption, and `blocks.css` takes the bar away over it so it is said once.
 */
/** The series a `stat` or `lines` over readings draws: the record's, or worked out here from the sample's rows. */
const measuresFor = (block: BlockResult) =>
  block.measures ??
  measuresOf(block.entries, block.columns.map((c) => c.field), Date.parse(block.stale_at), block.back, block.heading ?? '', { bucket: block.bucket });

/* ── money across currencies, on a chart ─────────────────────────────────── */

/**
 * A chart over money in more than one currency: converted into the home currency, or one chart a currency.
 *
 * TWO CURRENCIES ARE NEVER DRAWN ON ONE SCALE. A bar a currency beside another is a length about nothing, so a chart
 * whose figures or rows could not all be added up in one currency is drawn once per currency, each under its code, and
 * one converted says as of which day's rates. The arithmetic is the record's (`fx.ts`), with the rates the record sent
 * beside the block, or the sample's.
 */
type Charted = { currency: string | null; block: BlockResult }[];

function charted(block: BlockResult): { charts: Charted; converted: string | null; note?: string | null } | null {
  /* A CASH WALK THE RECORD COULD NOT ADD UP, one walk a currency, each with its own table. A `table` over the walk is
     one table a currency too, each cut to `limit:` as the one walk's is, rather than the first currency's alone. */
  if (block.walks && block.walks.length > 0) {
    const today = block.stale_at.slice(0, 10);
    const whole = block.kind === 'forecast' || block.kind === 'bridge';
    /* EACH WALK DRAWS ITS OWN REMEMBERED CASH, AND ONE SET OF KNOBS MOVES THEM ALL, under the last walk (`group`). */
    const walks = block.walks;
    const id = `${block.heading ?? block.source ?? 'walk'}:${walks.map((w) => w.currency ?? '').join(',')}`;
    return {
      charts: walks.map((walk, i) => ({
        currency: walk.currency,
        block: {
          ...block,
          walk,
          walks: undefined,
          ...(walk.past ? { past: walk.past } : {}),
          ...(walks.length > 1 ? { walkGroup: { id, key: walk.currency ?? String(i) }, ...(i === walks.length - 1 ? {} : { knobs: [] }) } : {}),
          ...walkTable(walk, whole ? walk.steps.length : block.limit, today, false),
        },
      })),
      converted: null,
      note: block.walkNote ?? null,
    };
  }
  /* A SERIES THE RECORD LINED UP ONCE PER CURRENCY. */
  if (block.kind === 'series' && block.bars?.split && block.bars.split.length > 0) {
    const bars = block.bars;
    const { split: lines, ...one } = bars;
    return { charts: lines!.map((t) => ({ currency: t.unit, block: { ...block, bars: { ...one, unit: t.unit, values: t.values } } })), converted: null };
  }
  if (block.kind !== 'bar' && block.kind !== 'split') return null;
  /* A FIGURE'S PARTS, where a part is in several currencies. */
  const parts = block.parts;
  if (parts) {
    const units = [...new Set(parts.groups.flatMap((g) => (g.parts ?? []).map((p) => p.currency)))].sort();
    if (units.length === 0) return null;
    return {
      charts: units.map((unit) => ({
        currency: unit,
        block: {
          ...block,
          parts: {
            ...parts,
            unit,
            value: null,
            groups: parts.groups.flatMap((g) => {
              const amount = g.parts?.find((p) => p.currency === unit)?.amount;
              return amount === undefined ? [] : [{ key: g.key, value: amount }];
            }),
          },
        },
      })),
      converted: null,
    };
  }
  /* A REGISTER'S ROWS, each amount in its own currency and dated by the list's first day. A list of links adds up
     money another list holds, which is left to `barRows` as it was. */
  const register = block.register ?? '';
  const of = block.columns[1]?.field ?? 'amount';
  if (!register || linkOf(register, of)) return null;
  const seen = new Set(block.matched.map((e) => currencyOf(e.fields[of])).filter((c): c is string => c !== null));
  const fx = block.fx ?? fxNow();
  const home = fx.home;
  if (seen.size === 0 || (seen.size === 1 && (home === null || seen.has(home)))) return null;
  const day = dayFieldOf(REGISTERS[register]?.fields ?? []);
  const dayOf = (e: BlockResult['matched'][number]): string => {
    const v = day ? e.fields[day] : null;
    return typeof v === 'string' ? v.slice(0, 10) : new Date(NOW).toISOString().slice(0, 10);
  };
  if (home !== null) {
    const amounts = block.matched.flatMap((e) => {
      const v = e.fields[of];
      const c = currencyOf(v);
      return c === null ? [] : [{ currency: c, amount: (v as { amount: number }).amount, day: dayOf(e) }];
    });
    const got = across(amounts, home, fx.rates, new Date(NOW).toISOString().slice(0, 10));
    if (got.kind === 'converted') {
      const matched = block.matched.map((e) => {
        const v = e.fields[of];
        const c = currencyOf(v);
        if (c === null || c === home) return e;
        const r = rateFor(fx.rates as Rate[], c, home, dayOf(e))!;
        return { ...e, fields: { ...e.fields, [of]: { amount: convertMinor((v as { amount: number }).amount, c, home, r.rate), currency: home } } };
      });
      return { charts: [{ currency: null, block: { ...block, matched, fx: undefined } }], converted: got.asOf };
    }
  }
  return {
    charts: [...seen].sort().map((unit) => ({ currency: unit, block: { ...block, matched: block.matched.filter((e) => currencyOf(e.fields[of]) === unit), fx: undefined } })),
    converted: null,
  };
}

/**
 * A `table` over a cash walk drawn once per currency: each currency's table under its code, and the reason said once after.
 * `null` when the walk is one. The grid draws a table rather than the dialect, so the page draws these parts itself.
 */
export function walkTables(block: BlockResult): { said: ReturnType<typeof parse>; table?: Pick<BlockResult, 'columns' | 'rows' | 'total'> }[] | null {
  if (block.kind !== 'table' || !block.walks?.length) return null;
  const split = charted(block);
  if (!split) return null;
  return [
    ...split.charts.map(({ currency, block: part }) => ({
      said: currency === null ? [] : parse(`**${copy.inCurrency(currency)}**`, { page: true }),
      table: { columns: part.columns, rows: part.rows, total: part.total },
    })),
    ...(split.note ? [{ said: parse(split.note, { page: true }) }] : []),
  ];
}

export function toSegments(block: BlockResult): ReturnType<typeof parse> {
  const split = charted(block);
  if (split) {
    const one = split.charts.length === 1 && split.charts[0]!.currency === null;
    return [
      ...split.charts.flatMap(({ currency, block: part }) => [
        ...(one || currency === null ? [] : parse(`**${copy.inCurrency(currency)}**`, { page: true })),
        ...drawSegments(part),
        ...(split.converted ? parse(copy.figureConverted(longDay(split.converted)), { page: true }) : []),
      ]),
      ...(split.note ? parse(split.note, { page: true }) : []),
    ];
  }
  return drawSegments(block);
}

function drawSegments(block: BlockResult): ReturnType<typeof parse> {
  /* A NOTE THAT IS A WHOLE DOCUMENT, such as the plan and the decisions written on a project, is drawn as that document,
     blocks and all. One the row has not written yet is still its placeholder, and draws nothing, so `empty:` says so. */
  if (block.kind === 'note' && block.document) {
    const body = (block.body ?? '').trim();
    return body === '' || /^\{\{\w+\}\}$/u.test(body) ? [] : parse(body, { page: true });
  }
  /* A LINE A MEASURE, each chart its own fence under the measure's name, from the rows a project reported. */
  if (block.kind === 'lines' && (block.register || block.measures) && !block.authored?.length)
    return parse(linesText(measuresFor(block)), { page: true });
  const heading = block.kind === 'section' && block.heading ? ` | ${escapeCell(block.heading)}` : '';
  /* THE HERO FIGURE IS A FORM OF `stat`, written after the kind: ```stat lead. */
  const form = block.kind === 'stat' && block.lead ? ' lead' : block.kind === 'series' && block.net ? ' net' : block.kind === 'progress' && block.spent ? ' budget' : '';
  const head = `${block.kind}${form}${heading || (block.tone ? ` |  | ${block.tone}` : '')}`;
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
        (m) => `${escapeCell(m.label)} | ${escapeCell(m.value)} | ${escapeCell(m.note)}${trendCell(m.trend, /^[A-Z]{3} /u.test(m.value))}${m.tone ? ` | ${m.tone}` : ''}`,
      )
    : block.kind === 'stat' && (block.register || block.measures)
      ? tileRows(measuresFor(block))
    : block.kind === 'bar' || block.kind === 'split'
      ? block.parts
        ? partsRows(block)
        : barRows(block)
      : block.kind === 'bridge' && block.source === 'forecast.runway'
        ? bridgeRows(block)
      : block.kind === 'series'
        ? seriesRows(block)
      : block.kind === 'forecast' && block.source === 'forecast.runway'
        ? forecastRows(block)
      : (block.kind === 'agents' || block.kind === 'feed') && block.source === 'activity'
        ? /* THE LOG'S ROWS ARE WRITTEN BY THE READER (`agentsTable`, `feedTable`) in the kind's own cells, so they go
             through as they are. Without this a live `agents` block drew its `empty:` over five things an agent did. */
          block.rows.map((r) => r.cells.map((c) => escapeCell(c ?? '')).join(' | '))
      : block.kind === 'chips'
        ? chipsRows(block)
      : block.kind === 'gauge'
        ? gaugeRows(block)
      : block.kind === 'progress' && block.register
        ? progressRows(block)
      : block.kind === 'cards'
        ? cardsRows(block)
      : block.kind === 'section'
        ? [sectionRow(block)]
      : block.register && block.columns.length > 0 && spec
        ? projectRows(block.kind === 'board' ? boardOrder(block) : block, spec.cells)
        : block.body
          ? [block.body]
          : [];
  /* `page`, because this is a page's evaluator: it is the one caller that may draw the page-only
     kinds whose rows it wrote itself. `table` has no rows to write and still degrades. */
  const segments = parse(['```' + head, ...rows, '```'].join('\n'), { page: true });
  const projected =
    !conflicted &&
    !block.authored?.length &&
    !block.metrics &&
    !['bar', 'split', 'chips', 'gauge', 'progress', 'cards', 'section', 'stat'].includes(block.kind) &&
    Boolean(block.register && block.columns.length > 0 && spec);
  return projected && block.register
    ? withRefs(segments, block.register, block.kind === 'board' ? boardOrder(block).entries : block.entries)
    : segments;
}

/**
 * EACH PROJECTED ROW NAMES THE RECORD ROW IT CAME FROM, after the parse, because the text in between carries no identity.
 *
 * One drawn row per entry, in the order `projectRows` wrote them. A parse that drew anything else, a degraded fence or a
 * different number of rows, gets no refs at all: a card named by the wrong row would move somebody else's row.
 */
function withRefs(segments: ReturnType<typeof parse>, register: string, entries: BlockResult['entries']): ReturnType<typeof parse> {
  const drawn = segments.filter((s): s is Block => s.type === 'block');
  const only = drawn.length === 1 && segments.length === 1 ? drawn[0] : undefined;
  if (!only || only.rows.length !== entries.length) return segments;
  only.rows.forEach((row, i) => {
    const entry = entries[i];
    if (entry && entry.seq > 0) row.ref = { register, seq: entry.seq, version: entry.version };
  });
  return segments;
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
  kind: 'no-results' | 'no-data-yet' | 'error';
  title: string;
  body?: string;
  /** One line per clause that did not resolve, verbatim from `explain()`. */
  lines?: string[];
  /**
   * The one thing to do about it, when there is one.
   *
   * `13 §5.2` asks every empty state for an action and says it must be a real link or button "so it
   * joins the tab order" — and `no-data-yet` is the state where an action is the entire point: the
   * list is empty because nobody has put anything in it, and the reader is the person who would.
   * `no-results` gets none, because the way out of a filter that matched nothing is the filter that
   * is already on screen; a second control saying so is a second control.
   */
  action?: { href: string; label: string };
};

/** Everything a surface needs to draw one block: the segments, or the reason there are none. */
export function draw(
  block: BlockResult,
  /**
   * What the block's register holds, when it holds nothing yet.
   *
   * `19 §6` NAMES FIVE EMPTY STATES AND SAYS COLLAPSING THEM INTO ONE IS THE FAILURE — and this
   * drew `no-results` for two of them, under the literal words the section quotes as the mistake:
   * "Nothing here yet." A filter that matched nothing and a register with nothing in it are
   * different facts about the record, and the second one is the one somebody can DO something about.
   *
   * THE CALLER SUPPLIES THE FACTS AND THIS DECIDES THE STATE, because a register's row count and its
   * declared `holds:` sentence come from the record and this file draws blocks.
   */
  held?: { rows: number; name: string; holds?: string; add?: { href: string; label: string } } | undefined,
): { segments: ReturnType<typeof parse>; refusal: Refusal | null } {
  /**
   * Nothing matched — and which kind of nothing.
   *
   * AN EMPTY LIST BEATS THE AUTHOR'S SENTENCE, and the order used to be the other way round.
   *
   * `empty:` is MANDATORY on every source-bound block — `06 §1.1`, and `schema.ts` requires it, and
   * `arrange.test.ts` asserts it — so a check for `block.empty` FIRST is a check that always passes.
   * `no-data-yet` could not be reached from a declared page at all: measured across forty-two
   * routes, `no-results` rendered 0 times, `cleared` 0, `no-permission` 0, `error` 0, and every one
   * of the five states `19 §6` says must be told apart was drawn as whichever one the author happened
   * to have typed. The seed made it literal — its generated block declares `empty: "Nothing in
   * <name> yet."`, the phrase the section quotes as THE FAILURE, under a comment saying "it renders
   * on day one, which is exactly when a register is empty". It did render on day one. Under the
   * wrong kind, with the search glyph, and with nothing to do about it.
   *
   * AND A FILTER'S SENTENCE IS ABOUT A FILTER THAT RAN. "Nothing owed either way in the next
   * ninety days" is a claim about a window; on a record whose Obligations list has never held a
   * row, no window was searched and the sentence describes a search that did not happen. A list
   * with no rows in it cannot have matched, so which fact is true is decided by the count and not
   * by the declaration.
   *
   * THE UNFILTERED CASE IS DIFFERENT AND KEEPS ITS WORDS, and an earlier version of this comment
   * used a filtered block's sentence to argue against them, which was the wrong example: "You owe
   * nobody anything" belongs to a block filtered to `direction is owed to me, state is open or
   * part`, and it takes the derived title precisely because it is filtered. Over the WHOLE list,
   * the same sentence is simply true — there are no obligations, so you owe nobody anything.
   *
   * THE AUTHOR STILL WINS THE CASE THEY WROTE IT FOR: rows exist and none of them matched.
   */
  const nothing = (): Refusal => {
    if (held && held.rows === 0)
      return {
        kind: 'no-data-yet',
        /**
         * AN UNFILTERED BLOCK'S `empty:` IS THIS STATE'S SENTENCE, and there is no other state it
         * could ever be about.
         *
         * A block with no `where:` draws every row its list holds, so it can only be empty when the
         * list is — which makes `no-results` unreachable for it and its `empty:` a sentence about
         * day one whether the author meant it that way or not. Three in the seed say so outright:
         * "Nobody yet.", and "Nothing here yet." twice. Deriving over them would replace a sentence
         * somebody wrote about their own record with a generated one AND leave theirs rendering
         * nowhere, which is the same dead-copy failure `dead-copy` exists to catch, one level down.
         *
         * A FILTERED BLOCK'S IS NOT. "You owe nobody anything" is a claim about a filter that ran,
         * and on a list that has never held a row no filter ran.
         */
        title: block.where || !block.empty ? `Nothing in ${held.name} yet.` : block.empty,
        /* BE SPECIFIC ABOUT WHAT WILL BE HERE (19 §6). The register declares the sentence; every
           register does, and one screen was reading it. */
        ...(held.holds ? { body: `${held.name} holds ${held.holds}.` } : {}),
        /* AND ONE THING TO DO, when the surface knows where. A shared page does not: it is read-only
           and there is no list to open, so it gets the sentence and no button rather than a button
           that goes nowhere.

           THE CALLER SUPPLIES THE WORDS. Every sentence in this product is typed in `copy.ts` — it
           is the whole reason `50 §3` gives for that file existing, and a label built here would be
           the one line of user-facing English outside it. */
        ...(held.add ? { action: held.add } : {}),
      };
    if (block.empty) return { kind: 'no-results', title: block.empty };
    return { kind: 'no-results', title: 'Nothing matched.' };
  };

  if (block.authored?.length && block.register)
    return {
      segments: [],
      refusal: {
        kind: 'error',
        /* `has` AND IT WAS `declares`. The same rule as the cycle refusal in `forecast.ts`: a
           refusal is the teacher (`10 §7`), and the schema's verb in the first three words teaches
           the schema rather than the fix. The body below already names both halves in the
           dialect's own words, which is where an author needs them. */
        title: 'This block has both a source and rows of its own.',
        body: 'Keep one. `source:` reads a register; `authored:` is written out by hand.',
      },
    };

  if (block.refusals.length)
    return {
      segments: [],
      refusal: {
        kind: 'error',
        /* A WALK OR A CHART THAT NEEDS ONE CURRENCY says that, not that its filter was misread: the lines name the rate. */
        title: block.refusals.every((r) => /currenc|a walk starts from one amount/iu.test(r)) ? copy.blockNeedsOneCurrency : 'This block’s filter was not understood, so it matched nothing.',
        lines: block.refusals,
      },
    };

  /* A `table` is drawn by the grid rather than through the dialect, so its rows are the check. */
  if (block.kind === 'table')
    return {
      segments: [],
      refusal: block.rows.length ? null : nothing(),
    };

  /* A FIGURE IN A LABEL-AND-VALUE ROW READS AS MONEY, the way the table beside it does. The
     primitive draws its cells as text, so a `spec` block on a project page said `GBP 14.00` under a
     table saying `£8,530.00`. A code block keeps what was written. */
  const home = homeCurrency();
  const segments = toSegments(block).map((s) =>
    s.type === 'block' && s.kind !== 'code' ? { ...s, rows: s.rows.map((r) => ({ ...r, cells: r.cells.map((c) => symbolText(c, home)) })) } : s,
  );
  /* A CARD GRID IS BLANK WHEN IT HAS NO ENTRIES, whatever its first row says: that row names the
     columns and is not a card. A section over a register that admitted nothing has nothing under
     it, and its `empty:` is the sentence for that; a section with no source is a heading, and a
     heading is never blank. */
  const blank =
    block.kind === 'cards'
      ? block.entries.length === 0
      : block.kind === 'section'
        ? Boolean(block.register) && block.matched.length === 0
        : segments.every((s) => s.type === 'block' && s.rows.length === 0);
  return {
    segments,
    refusal: blank ? nothing() : null,
  };
}

/**
 * A `where:` clause as a person would read it.
 *
 * EVERY BLOCK ON EVERY DECLARED PAGE PRINTED ITS CLAUSE VERBATIM. `direction is owed to me, state
 * is open or part`; `renews after yesterday, renews before +90d`; `kind is domain`. The field ids
 * are the schema's spelling of names the same screens render properly — `kind` is the word
 * `/r/services` calls **Type** — and `+90d` is a machine duration nobody types or says.
 *
 * IT IS A RENDER AND NOT A PARSER. The clause is already valid; this walks it once, swaps each
 * field id for its declared label and each relative day for the phrase it means, and leaves
 * everything it does not recognise exactly as written. A sentence it cannot improve is a sentence
 * it must not change: half a filter said in English and half in the dialect is worse than either.
 */
/* THREE UNITS, WHICH IS WHAT THE GRAMMAR HAS. `34 §1.1`'s EBNF is `unit = "d" | "w" | "m"` and
   `where.ts`'s `RELATIVE` reads exactly those, so `y` was a fourth spelling this table could print
   and nothing in the product could compile — a sentence offered to a reader that the record refuses
   the moment they use it. (The kernel's own parser does accept `y`, against the same EBNF; that is
   filed as the kernel's bug, not answered by printing it here.) */
const UNITS: Record<string, string> = { d: 'day', w: 'week', m: 'month' };

/* `today`, `yesterday` and `tomorrow` are already English and pass through; `+90d` is not. That is
   the whole of `resolveDay`'s grammar and the whole of what a block ever writes. */
const spokenDay = (word: string): string => {
  /* THREE UNITS IN THE PATTERN TOO, and dropping `y` from the table alone made it worse than before.
     `+2y` still matched, `UNITS.y` was gone, and `?? 'day'` turned two YEARS into "2 days from now"
     — which the compiler then accepted, resolving to a date two years out. It had been loudly wrong;
     it became silently wrong. `34 §1.1`'s EBNF is `unit = "d" | "w" | "m"`, so a `+2y` this build
     cannot read passes through verbatim and is refused by name. */
  const rel = /^([+-])(\d+)([dwm])$/.exec(word.trim());
  if (!rel) return word;
  const [, sign, n, unit] = rel as unknown as [string, string, string, string];
  const noun = UNITS[unit] ?? 'day';
  return `${n} ${noun}${n === '1' ? '' : 's'} ${sign === '+' ? 'from now' : 'ago'}`;
};

export function saidPlainly(register: string, where: string | undefined): string {
  if (!where) return '';
  return where
    .split(',')
    .map((clause) => {
      const said = clause.trim();
      /* FOUR OPERATORS, THE SAME FOUR `where.ts` READS. `on` was a fifth: this would render
         `renews on today` as though it meant something, and `compile` answers "that is not
         something a filter can say". A printer that speaks a wider language than the parser is a
         printer that teaches people sentences the record will not take. */
      const m = /^(.+?)\s+(is not|is|before|after)\s+(.+)$/i.exec(said);
      if (!m) return said;
      const [, rawField, verb, rest] = m as unknown as [string, string, string, string];
      const decl = REGISTERS[register]?.fields.find((f) => f.id.toLowerCase() === rawField.trim().toLowerCase());
      if (!decl) return said;
      const name = decl.label ?? decl.id.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
      const values =
        verb === 'before' || verb === 'after'
          ? spokenDay(rest)
          : rest
              .split(/\s+or\s+/)
              .map((v) => declaredValue(register, decl.id, v.trim()).replace(/_/g, ' '))
              .join(' or ');
      return `${name.toLowerCase()} ${verb} ${values}`;
    })
    .join(', ');
}
