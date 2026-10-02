/**
 * A page block, turned into the dialect.
 *
 * ONE conversion, used by every surface that draws a declared page — the page route and the shared
 * link — because they were two, and the second one only knew about `table` and `stat`.
 *
 * A page block becomes a Block segment THROUGH THE DIALECT, so a declared page and a hand-written
 * write-up take one code path from the first `<figure>` down.
 *
 * A KIND REGISTERED IN `lib/page/kinds/index.ts` IS NOT DRAWN HERE. `draw` hands it to its own module with the
 * record's answer, before any arm below, so a new kind adds no arm to this file.
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
import { day as longDay, money, parse, since, workingCell, WORKING_MARK, type Block } from 'braindog-render';
import { KINDS, kindSpec, showsOf, type CardRole, type KindSpec } from 'braindog-render';
/* WHICH FILES A CARD LEADS WITH, the renderer's list, read by `pictureCell`. */
import { isPictureMime } from 'braindog-render';
import type { Column } from 'braindog-render/svelte';
import { display, homeCurrency, labelOf, walkTable, type BlockResult } from './api.ts';
/* WHO ASKED A QUEUE'S QUESTION, in the words the card that answers it uses. */
import { proposer } from '../page/queue-answer.ts';
import { REGISTERS } from './held.ts';
import { draftOf } from './field-draft.ts';
import { citedWords } from '../cite.ts';
import { moneyInText } from './money.ts';
/* THE KINDS THAT DRAW THEMSELVES, asked first in `draw`. */
import { drawerOf } from '../page/kinds/index.ts';

/**
 * The instant a block was read at, which is the clock everything drawn from it is told against.
 *
 * IT WAS THE SEED'S `NOW`, 3 September 2026 at noon, for every block, so a live page converted its money at the rate
 * of that day and banded its instants against it however late in the month the record was read. `stale_at` is the
 * clock the reader matched the rows at (`page-live.ts` writes the record's `read_at`, the mock its own `NOW`), so a
 * block and what it draws agree on what today is.
 */
const clockOf = (block: BlockResult): number => {
  const at = Date.parse(block.stale_at);
  return Number.isFinite(at) ? at : Date.now();
};
import { copy } from '../copy.ts';
import type { Entry } from './schema.ts';
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
  /* THE CAST IS GONE BECAUSE THE TYPE ARRIVED. `FieldType` named fifteen of the record's eighteen and
     `list` was not one of them, so this line read `(f.type as string) !== 'list'` — a cast that
     launders a missing member, which is how a whole type goes unhandled quietly, because the next
     reader writes the same cast instead of the same question. `schema.ts` names `list` now. */
  if (!f || f.type !== 'list' || !f.to) return null;
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
    /* NOR DOES A ROW WITH NOTHING TO ADD: open work with no size is not "No project 0 d", and a group or the rest that only
       holds such rows is left out, so a bar with nothing sized says its empty line. */
    const bare = e.fields[of];
    if (!link && (bare === undefined || bare === null || bare === '')) continue;
    const said = display(block.register ?? '', by, e.fields[by], clockOf(block), block.names);
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
 * by how many say yes, or how many are in a state the list calls done: a project by its steps done. Otherwise each row is its own track, value against target, and a row
 * with no target has nothing to fill toward and is left out. `limit:` is how many tracks.
 */
function progressRows(block: BlockResult): string[] {
  const register = block.register ?? '';
  const [label, value, target, note] = block.columns.map((c) => c.field);
  if (!label || !value) return [];
  const said = (field: string | undefined, v: unknown): string => (field ? (display(register, field, v, clockOf(block), block.names) ?? '') : '');
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

  /* OR THE LIST'S OWN STATUS, done when it is one of the states the list says are done: a milestone by its steps done. */
  const decl = REGISTERS[register];
  const doneStates = decl?.state === value && decl.done && decl.done.length > 0 ? new Set(decl.done) : null;
  if (doneStates || decl?.fields.find((f) => f.id === value)?.type === 'bool') {
    const groups = new Map<string, { done: number; all: number }>();
    for (const e of block.matched) {
      const key = display(register, label, e.fields[label], clockOf(block), block.names) ?? REST;
      const g = groups.get(key) ?? { done: 0, all: 0 };
      g.all += 1;
      if (doneStates ? doneStates.has(String(e.fields[value])) : e.fields[value] === true) g.done += 1;
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

/**
 * Two clauses of a sentence predicate as one.
 *
 * A FIGURE'S WHERE MAY BE A PREDICATE TREE (one sentence cannot mix a comma with an `or`), which has no sentence
 * to join a clause to, so the clause goes alone rather than a string operation throwing on an object.
 */
const joined = (where: unknown, clause: string): string => (typeof where === 'string' && where.trim() ? `${where}, ${clause}` : clause);

/** The row for what no part holds: its label, linked to those rows, and its figure. */
const unsetRow = (label: string, href: string, shown: string): string => `[${escapeCell(label)}](${href}) | ${escapeCell(shown)} | `;

/** The intent a block names for one part, as the dialect's trailing word, or nothing. */
const toneOf = (tones: Readonly<Record<string, string>> | undefined, key: string): string => {
  const tone = tones && Object.hasOwn(tones, key) ? tones[key] : undefined;
  return tone === 'good' || tone === 'warn' || tone === 'bad' || tone === 'info' ? ` | ${tone}` : '';
};

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
    /* A PART THE BLOCK GIVES AN INTENT IS DRAWN IN IT, by the value it groups, so "Off track" reads as trouble in the theme's
       own colour and a part not named stays neutral. Only the four intents: anything else is left off. */
    .map((g) => `${escapeCell(display(register, field, g.key) ?? g.key)} | ${escapeCell(said(g.value))} | ${toneOf(block.tones, g.key)}`);
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
 *
 * WHICH IS WHY THE OUT ROW KEEPS ITS MINUS, next to a tile that has none over the same money.
 * `/p/money` draws `Going out GBP −42,741.00` two blocks under `Owed by you, 30 days GBP 38,880.00`,
 * and that was filed as one screen contradicting itself. Measured on the drawn page: the four rows
 * are 33,850 now, 11,490 in, −42,741 out, 2,599 in thirty days, and 33,850 + 11,490 − 42,741 is
 * 2,599 to the penny. Taking the minus off to match the tile was tried and measured too: the sum of
 * the rows becomes 88,081 against an end still reading 2,599, `render/src/bridge.ts`'s own check
 * answers "These rows do not add up: the start and the movements come to 88,081, and the end says
 * 2,599", and `moveOf` reads the row as a movement UP, so the bars came back `start up up end` and
 * the money leaving floated the same way as the money arriving. The sign is load-bearing twice.
 *
 * THE TILE IS RIGHT TO BE POSITIVE FOR THE OPPOSITE REASON, so this is a disagreement on purpose
 * rather than a drift. A tile is not a term in a sum; it is one register's answer to how much is
 * owed, and `Owed by you` carries the direction in the words, where a minus would read as owing less
 * than nothing. Commit 491e7e05 renamed both thirty-day tiles off the bridge's words for the
 * neighbouring failure, a tile saying `Going out, 30 days` over a figure GBP 3,861.00 short of the
 * bridge's because a figure reads one register and this walk reads three. `blocks.test.ts` holds the
 * pair so that neither side can move on its own.
 */
function bridgeRows(block: BlockResult): string[] {
  const walk = block.walk;
  if (!walk) return [];
  /* THE WALK'S OWN CURRENCY, AS THE KERNEL WALKED IT, and where it names none the record's (`homeCurrency()`, the one
     its `boot` said). Nothing here reads a currency out of rows this tab happens to hold. */
  const currency = walk.currency ?? homeCurrency();
  if (currency === null) return [];
  const ins = walk.steps.filter((s) => s.delta > 0);
  const outs = walk.steps.filter((s) => s.delta < 0);
  const sum = (steps: readonly { delta: number }[]) => steps.reduce((n, s) => n + s.delta, 0);
  const end = walk.steps.at(-1)?.balance ?? walk.from;
  return [
    `${escapeCell(copy.bridgeStart)} | ${money(walk.from, currency)} | `,
    `${escapeCell(copy.bridgeIn)} | ${money(sum(ins), currency)} | `,
    `${escapeCell(copy.bridgeOut)} | ${money(sum(outs), currency)} | `,
    `${escapeCell(copy.bridgeEnd(typeof walk.horizon === 'number' ? walk.horizon : typeof block.horizon === 'number' ? block.horizon : 180))} | ${money(end, currency)} | `,
  ];
}

/**
 * A step with the two marks the forecast's controls read, which the kernel's walk sets (`Step.from` and `Step.of`)
 * and `api.ts`'s `WalkStep` does not yet declare. Read through this rather than declared there because that type is
 * not this file's; it names nothing the kernel's walk does not already carry.
 */
type ControlledStep = { of?: string; from?: string };

/** A holding the sell control may count as sold, in the walk's currency and in minor units. */
type ForecastSell = { label: string; value: number };

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
  /* THE WALK'S CURRENCY, ELSE THE RECORD'S, as the bridge reads it. */
  const currency = walk.currency ?? homeCurrency();
  const said = (minor: number) => (currency ? money(minor, currency) : String(minor));
  /* THE DAY THE BLOCK WAS READ, which is the record's clock on a live page and the sample's here. */
  const today = block.stale_at.slice(0, 10);
  return [
    `opening | ${today} | ${escapeCell(copy.bridgeStart)} | ${said(walk.from)}`,
    ...(block.past ?? []).map((p) => `past | ${p.at} |  | ${said(p.value)}`),
    /* WHAT A STEP IS PART OF AND THE PAIR IT WAS CONVERTED THROUGH GO ON AN `of` ROW DIRECTLY UNDER IT, which is what the
       plan and drift controls act on. A fifth cell on the `step` row was the obvious place and is refused: `forecast`
       takes four cells, and a five-cell row degrades the whole block to its source text. The pair is written only when
       the walk has a currency to name, because `GBP to` is not a pair the renderer can drift. */
    ...walk.steps.flatMap((s) => {
      const { of, from } = s as ControlledStep;
      const pair = from && walk.currency ? `${from} to ${walk.currency}` : '';
      return [`step | ${s.day} | ${escapeCell(s.label)} | ${said(s.delta)}`, ...(of || pair ? [`of | ${escapeCell(of ?? '')} | ${pair} | `] : [])];
    }),
    /* WHAT THE SELL CONTROL MAY COUNT AS SOLD, in the walk's own money. The renderer leaves out a figure in any other,
       so a holding the host could not convert is not offered rather than added as the wrong amount. */
    ...((block as BlockResult & { sells?: readonly ForecastSell[] }).sells ?? []).map((s) => `sell |  | ${escapeCell(s.label)} | ${said(s.value)}`),
    `horizon | ${typeof walk.horizon === 'number' ? walk.horizon : typeof block.horizon === 'number' ? block.horizon : 180} |  | `,
    /* THE LENGTHS THE HORIZON KNOB OFFERS, as the block declared them (`horizons:`); the renderer offers each only as far as the walk reaches. */
    ...(block.horizons?.length ? [`horizons | ${block.horizons.join(' ')} |  | `] : []),
    ...(block.knobs?.length ? [`knobs | ${block.knobs.join(' ')} |  | `] : []),
    /* CONVERTED "SHOW IN" FIGURES ARE WRITTEN BY SYMBOL ALONE IN THE RECORD'S OWN CURRENCY, and with the code after in
       any other; the render package cannot know which is home, so this row says it. */
    ...(homeCurrency() ? [`home | ${homeCurrency()} |  | `] : []),
    /* EVERY OTHER CURRENCY THE RECORD'S RATES REACH FROM THE WALK'S, at the newest rate on or before the day the block was
       read, which the "Show in" control converts the walk with (`show` rows, `packages/render/src/forecast.ts` `showsOf`). */
    ...(walk.currency && block.fx
      ? [...new Set(block.fx.rates.flatMap((r) => [r.currency, r.base]))]
          .filter((c) => c !== walk.currency)
          .sort()
          .flatMap((c) => {
            const r = rateFor(block.fx!.rates as Rate[], walk.currency!, c, today);
            return r ? [`show | ${walk.currency} to ${c} | ${r.as_of} | ${r.rate}`] : [];
          })
      : []),
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
  const lines = block.series ?? [];
  /* A SERIES OF COUNTS IS NOT MONEY: the home currency is only the unit of lines whose figures are money. */
  const inMoney = lines.some((l) => METRICS[l.metric]?.format?.startsWith('money.'));
  /* THE BARS' UNIT AS THE KERNEL READ THEM, ELSE THE RECORD'S CURRENCY for lines of money. */
  const currency = bars.unit ?? (inMoney ? homeCurrency() : null);
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
   * does not change when a filter matches nothing. So the code falls back to a currency somebody chose for a money
   * field: its default's, then the record's own. It read the list's rows held in this tab, which a shipped tab holds
   * none of, so on a live record the fallback was always none. Only a sum over nothing falls back, and only over a
   * money field: rows that were summed and carried no currency are not given one.
   */
  const field = REGISTERS[block.register ?? '']?.fields.find((f) => f.id === of);
  const declared = sum.currency ?? (sum.n === 0 && field?.type === 'money' ? (currencyOf(field.default) ?? homeCurrency()) : null);
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
  /* THE ROWS MOVE WITH THEIR ENTRIES. A link is drawn from the row's own cells, so sorting only the entries put each card
     under the project of whichever row had stood in its place.
     AND SO DOES EVERY OTHER ARRAY ALIGNED WITH THEM, which is the same bug a second time: the
     evaluator answers `working_now` in the declaration's order, this sorts the rows, and the dot
     landed on whichever card had stood where the worked-on one was — an agent shown on a row it has
     never touched. Anything aligned with `rows` added here must be moved here too. */
  const order = block.entries.map((e, i) => ({ e, i })).sort((a, b) => rank(a.e) - rank(b.e));
  const working = block.working_now;
  return {
    ...block,
    entries: order.map((o) => o.e),
    rows: order.map((o) => block.rows[o.i]!).filter(Boolean),
    ...(working ? { working_now: order.map((o) => working[o.i] === true) } : {}),
  };
}

/**
 * The general path: one row per entry, one cell per declared column, formatted.
 *
 * The tone travels with the row rather than being a fourth column, because a kind's arity does not
 * include it — `KINDS[kind].tone` says whether a trailing tone word is read, and the dialect's own
 * parser takes it from the end of the line.
 */
function projectRows(block: BlockResult, cells: number, markAt?: (i: number) => string): string[] {
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
      /* A LIST NO REGISTER DECLARES WAS SAID BY ITS READER, and only there. What falls due across every list
         (`page-live.ts`, source `deadlines`) writes each cell by hand, the day as a day and the amount signed, because
         `display()` has no field to ask about; this saying it again from the raw fields drew Today's Overdue as
         `2026-07-01` over `[object Object]` while the rows it was handed read `1 Jul 2026` and `−£9,190.00`. */
      if (!REGISTERS[block.register ?? '']) return row.cells[n] ?? '';
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
    /* A PATH'S LAST CELL IS THE RECORD'S MARK, written in the dialect's own words and never a field's text (`pathRows`). */
    if (markAt) out[cells - 1] = markAt(i);
    /**
     * `working: true`'s DOT, on the cell the kind calls the row by — `workingCell` knows which, so the
     * writing side and the drawing side cannot drift about it. Written BEFORE the checkbox mark below,
     * which has to sit at the very head of the line for the dialect's own parser to read it as one: a
     * dot in front of `[ ]` would not be read as a box at all.
     *
     * WHETHER AN AGENT IS ON THE ROW IS THE EVALUATOR'S ANSWER (`working_now`), never worked out here.
     * This used to ask the SAMPLE's ledger directly, so the dot was a thing only the demo could draw:
     * a live record ran the same code and got `false` for every row it owned.
     */
    if (block.working_now?.[i] === true) {
      const at = workingCell(block.kind);
      if (out[at] !== undefined) out[at] = `${WORKING_MARK}${out[at]}`;
    }
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
    /* A HUE AND A PICTURE ARE WRITTEN FROM THE ROW'S OWN VALUE, never from the cell as said: a hue is the record's whole
       number and a picture a reference the renderer resolves through the host (`pictureCell`). Neither is printed. */
    roles.forEach((role, j) => {
      const field = columns[j]?.field;
      const v = field ? block.entries[i]?.fields[field] : undefined;
      if (role === 'hue') cells[j] = typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 359 ? String(v) : '';
      if (role === 'picture') cells[j] = pictureCell(block.register, block.entries[i]?.seq, field, v);
    });
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

/**
 * A card's `picture` cell: `file:<list>#<seq>/<field>` for a file the record holds that is a picture, or empty.
 *
 * ONLY THIS SIDE KNOWS A FILE'S TYPE, so only a picture is written by reference, and only in a shape the renderer reads
 * as one (`showsOf`), which it turns into an address through the page's `RenderOptions.file`. Anything else writes
 * nothing: a card leads with a picture or with its title, never with a file's name where its picture would be.
 */
function pictureCell(register: string | undefined, seq: number | undefined, field: string | undefined, v: unknown): string {
  if (!register || seq === undefined || !field || v === null || typeof v !== 'object' || Array.isArray(v)) return '';
  const mime = (v as { mime?: unknown }).mime;
  if (typeof mime !== 'string' || !isPictureMime(mime)) return '';
  const ref = `file:${register}#${seq}/${field}`;
  const shows = showsOf(ref);
  return shows && 'file' in shows ? ref : '';
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
 * A queue's rows: a question, then a row an option, then the count of what it is not drawing.
 *
 * `render/src/queue.ts` documents the grammar. Two things are settled here rather than there:
 *
 * THE TWO WORDS A PROPOSAL OF ANY OTHER KIND IS ANSWERED WITH. The record sends the options an
 * `options` body carries and no others, deliberately: it does not know what language the reader has.
 * Every other kind is accepted or rejected, and those are this app's words, the same two
 * `governance.ts` already puts on the decide screen.
 *
 * AND HOW MANY ARE LEFT, which is what is open against what came back. A queue that drew three of
 * nine with no line saying so would be a queue that lies about how much is waiting.
 */
function queueRows(block: BlockResult): string[] {
  const waiting = block.queue ?? [];
  /* THE BLOCK'S OWN CLOCK AND NOT THE MODULE'S. `NOW` is the sample's fixed instant; a live answer
     carries the record's in `stale_at`, and reading the wrong one drew a question opened this morning
     as "in 13d". */
  const at = Date.parse(block.stale_at);
  const rows = waiting.flatMap((q) => {
    const options = q.options.length > 0 ? q.options : [{ key: 'accept', label: copy.acceptIt, because: '', recommended: false }, { key: 'reject', label: copy.rejectIt, because: '', recommended: false }];
    return [
      /* AND THE BAND THE RECORD PUT IT IN, last, which is also the order these rows arrive in
         (`@braindog/kernel`'s `weigh.ts`). Passed through as the record's own word rather than as a
         sentence: the words a reader sees are `render/src/queue.ts`'s, the way tone's are. */
      /* WHO ASKED IS SAID AS THE CARD THAT ANSWERS IT SAYS IT (`QueueAnswer.svelte`, through `proposer`): "Claude",
         "A rule: chase late payments", "Slash", never `rule:cash-stale`. This fence is handed no reader, so a person
         who asked is Someone on this record here; the card names them from the shell's people. */
      ['q', q.id, proposer(q.who).name, since(q.at, at), q.question, q.why, q.cost ?? ''].map(escapeCell).join(' | '),
      /* WHAT ACCEPTING IT CHANGES, a line a row, which the record writes only on a lead queue's first question
         (`does` in `kernel/src/pages.ts`). A string or a list of them, said in the reader's money and with no citation. */
      ...[(q as { does?: unknown }).does]
        .flat()
        .filter((line): line is string => typeof line === 'string' && line.trim() !== '')
        .map((line) => ['does', q.id, moneyInText(citedWords(line))].map(escapeCell).join(' | ')),
      /* AN OPTION'S SEVENTH CELL IS WHAT IT IS (`showsCell`), written only when it has one, so an option with no visual
         is the six-cell row it always was. */
      ...options.map((o) => {
        const shows = showsCell((o as { shows?: unknown }).shows);
        /* NO `{{ref:...}}` REACHES THE SCREEN: a Slash option's words carry citations, which read as their fallback
           words here, and a stored money sentence is drawn in the record's currency, as `governance.ts` does. */
        return ['opt', q.id, o.key, moneyInText(citedWords(o.label)), moneyInText(citedWords(o.because)), o.recommended ? 'true' : '', ...(shows ? [shows] : [])].map(escapeCell).join(' | ');
      }),
    ];
  });
  const more = Math.max(0, block.total - waiting.length);
  /* AND WHERE THE REST OF THEM ARE. A count with nowhere to press told a reader there were five more
     questions and stranded them; Decide is where every open question lives, and the address is written
     HERE rather than in the renderer, which knows no routes. */
  return more > 0 ? [...rows, `more | ${more} | /decide`] : rows;
}

/**
 * A capture's rows: `into` the list, then `set` for each value a new row is filled with (`render/src/capture.ts`).
 *
 * THE BLOCK WAS DRAWN AS A DEGRADED FENCE until this existed. `4cff0163` taught both engines to answer a capture
 * with `register` and `fills`, and nothing here wrote the rows the renderer reads, so the generic branch wrote a
 * fence with none and the parser refused it with "no into row", on every page that declared one.
 *
 * THE LIST'S ADDRESS IS THE BLOCK'S OWN SLICE, `registerHref` over its `where:`, because a reader who cannot add
 * from here is sent to the list to add there, and the grid's line under the same filter fills the same values.
 * The name is the register's, the one the block bar above already prints.
 *
 * NO LIST, NO ROWS, so a capture with nothing to add to still degrades rather than drawing a field that writes
 * nowhere. Both engines refuse that declaration first, so this is only reached by a block built by hand.
 */
function captureRows(block: BlockResult): string[] {
  const register = block.register;
  if (!register) return [];
  const into = ['into', register, REGISTERS[register]?.name ?? register, registerHref(register, block.where)];
  return [into, ...Object.entries(block.fills ?? {}).map(([field, value]) => ['set', field, value])].map((cells) => cells.map(escapeCell).join(' | '));
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
  /* A REGISTER'S ROWS, each amount in its own currency and dated by the list's first day. */
  const register = block.register ?? '';
  const of = block.columns[1]?.field ?? 'amount';
  if (!register) return null;
  /* A LIST OF LINKS ADDS UP MONEY ANOTHER LIST HOLDS, so that money is converted into the home currency at the latest
     rate, or drawn once per currency, before `barRows` adds it up: a bar is never pounds and dollars added as they are. */
  if (linkOf(register, of)) return block.linked ? linkedCharted(block, of) : null;
  const seen = new Set(block.matched.map((e) => currencyOf(e.fields[of])).filter((c): c is string => c !== null));
  const fx = block.fx ?? fxNow();
  const home = fx.home;
  if (seen.size === 0 || (seen.size === 1 && (home === null || seen.has(home)))) return null;
  const day = dayFieldOf(REGISTERS[register]?.fields ?? []);
  const dayOf = (e: BlockResult['matched'][number]): string => {
    const v = day ? e.fields[day] : null;
    return typeof v === 'string' ? v.slice(0, 10) : new Date(clockOf(block)).toISOString().slice(0, 10);
  };
  if (home !== null) {
    const amounts = block.matched.flatMap((e) => {
      const v = e.fields[of];
      const c = currencyOf(v);
      return c === null ? [] : [{ currency: c, amount: (v as { amount: number }).amount, day: dayOf(e) }];
    });
    const got = across(amounts, home, fx.rates, new Date(clockOf(block)).toISOString().slice(0, 10));
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

/** A bar over a list of links whose linked money is in more than one currency: converted, or one bar chart a currency. */
function linkedCharted(block: BlockResult, of: string): { charts: Charted; converted: string | null } | null {
  const linked = block.linked ?? {};
  const named = new Set(block.matched.flatMap((e) => (Array.isArray(e.fields[of]) ? (e.fields[of] as unknown[]).map(String) : [])));
  const held = [...named].flatMap((id) => {
    const v = linked[id];
    const c = currencyOf(v);
    return c === null ? [] : [{ id, currency: c, amount: (v as { amount: number }).amount }];
  });
  const seen = new Set(held.map((h) => h.currency));
  const fx = block.fx ?? fxNow();
  const home = fx.home;
  if (seen.size === 0 || (seen.size === 1 && (home === null || seen.has(home)))) return null;
  const today = new Date(clockOf(block)).toISOString().slice(0, 10);
  if (home !== null) {
    const got = across(held.map((h) => ({ currency: h.currency, amount: h.amount, day: today })), home, fx.rates, today);
    if (got.kind === 'converted') {
      const into = Object.fromEntries(
        held.map((h) => [h.id, { amount: convertMinor(h.amount, h.currency, home, rateFor(fx.rates as Rate[], h.currency, home, today)!.rate), currency: home }]),
      );
      return { charts: [{ currency: null, block: { ...block, linked: { ...linked, ...into }, fx: undefined } }], converted: got.asOf };
    }
  }
  return {
    charts: [...seen].sort().map((unit) => ({
      currency: unit,
      block: { ...block, linked: Object.fromEntries(held.filter((h) => h.currency === unit).map((h) => [h.id, linked[h.id]])), fx: undefined },
    })),
    converted: null,
  };
}

export function toSegments(block: BlockResult, kinds?: Readonly<Record<string, KindSpec>>): ReturnType<typeof parse> {
  const split = charted(block);
  if (split) {
    const one = split.charts.length === 1 && split.charts[0]!.currency === null;
    return [
      ...split.charts.flatMap(({ currency, block: part }) => [
        ...(one || currency === null ? [] : parse(`**${copy.inCurrency(currency)}**`, { page: true })),
        ...drawSegments(part, kinds),
        ...(split.converted ? parse(copy.figureConverted(longDay(split.converted)), { page: true }) : []),
      ]),
      ...(split.note ? parse(split.note, { page: true }) : []),
    ];
  }
  return drawSegments(block, kinds);
}

function drawSegments(block: BlockResult, kinds?: Readonly<Record<string, KindSpec>>): ReturnType<typeof parse> {
  /* A NOTE THAT IS A WHOLE DOCUMENT, such as the plan and the decisions written on a project, is drawn as that document,
     blocks and all. One the row has not written yet is still its placeholder, and draws nothing, so `empty:` says so. */
  if (block.kind === 'note' && block.document) {
    const body = (block.body ?? '').trim();
    return body === '' || /^\{\{\w+\}\}$/u.test(body) ? [] : parse(body, { page: true });
  }
  /* A LINE A MEASURE, each chart its own fence under the measure's name, from the rows a project reported. */
  if (block.kind === 'lines' && (block.register || block.measures) && !block.authored?.length)
    return parse(linesText(measuresFor(block)), { page: true });
  /* A CAPTURE'S HEADING GOES THROUGH TOO, because it is not a caption: it is the field's placeholder and its
     accessible name (`captioned` leaves it off the figure), and without it the field asks "Add to Tasks" where
     its author wrote "What needs doing?". */
  const heading = (block.kind === 'section' || block.kind === 'capture') && block.heading ? ` | ${escapeCell(block.heading)}` : '';
  /* THE HERO FIGURE IS A FORM OF `stat`, written after the kind: ```stat lead. */
  const form = formOf(block);
  const head = `${block.kind}${form}${heading || (block.tone ? ` |  | ${block.tone}` : '')}`;
  const spec = kindSpec(block.kind, kinds);

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
      : block.kind === 'progress' && block.register && ranged(block)
        ? rangeRows(block)
      : block.kind === 'progress' && block.register
        ? progressRows(block)
      : block.kind === 'cards'
        ? cardsRows(block)
      : block.kind === 'queue' && block.queue
        ? queueRows(block)
      : block.kind === 'capture'
        ? captureRows(block)
      : block.kind === 'inputs'
        ? inputsRows(block)
      : block.kind === 'steps' && marksOf(block) && block.register && block.columns.length > 0 && spec
        ? pathRows(block, spec.cells)
      : block.kind === 'section'
        ? [sectionRow(block)]
      : block.register && block.columns.length > 0 && spec
        ? projectRows(block.kind === 'board' ? boardOrder(block) : block, spec.cells)
        : block.body
          ? [block.body]
          : [];
  /* `page`, because this is a page's evaluator: it is the one caller that may draw the page-only
     kinds whose rows it wrote itself. `table` has no rows to write and still degrades. */
  const segments = parse(['```' + head, ...rows, '```'].join('\n'), { page: true, ...(kinds ? { kinds } : {}) });
  /* EVERY FIELD OF AN `inputs` BLOCK IS THE ONE ROW IT EDITS, so each drawn row names that row: the write a change makes
     is an update of it at the version it was read at (`inputs-write.ts`). */
  if (block.kind === 'inputs' && block.register) return withRefs(segments, block.register, rows.map(() => block.entries[0]!).filter(Boolean));
  const projected =
    !conflicted &&
    !block.authored?.length &&
    !block.metrics &&
    !['bar', 'split', 'chips', 'gauge', 'progress', 'cards', 'section', 'stat', 'queue'].includes(block.kind) &&
    Boolean(block.register && block.columns.length > 0 && spec);
  /* A PATH'S NAME FOR ITS SHORT VIEW IS ITS FIRST ROW AND ITS COUNT OF THE REST ITS LAST, and neither is a record row,
     so the stones between them are named and they are not. */
  const named = block.kind === 'steps' && form === ' path' && shortOf(block) ? 1 : 0;
  const counted = block.kind === 'steps' && rows.length === block.entries.length + named + 1 ? 1 : 0;
  return projected && block.register
    ? withRefs(segments, block.register, block.kind === 'board' ? boardOrder(block).entries : block.entries, counted, named)
    : segments;
}

/**
 * EACH PROJECTED ROW NAMES THE RECORD ROW IT CAME FROM, after the parse, because the text in between carries no identity.
 *
 * One drawn row per entry, in the order `projectRows` wrote them, `leading` rows before them and `trailing` rows after
 * them that are no row of the record (a path's name for its short view, and its count of the rest). A parse that drew
 * anything else, a degraded fence or a different number of rows, gets no refs at all: a card named by the wrong row
 * would move somebody else's row.
 */
function withRefs(segments: ReturnType<typeof parse>, register: string, entries: BlockResult['entries'], trailing = 0, leading = 0): ReturnType<typeof parse> {
  const drawn = segments.filter((s): s is Block => s.type === 'block');
  const only = drawn.length === 1 && segments.length === 1 ? drawn[0] : undefined;
  if (!only || only.rows.length !== leading + entries.length + trailing) return segments;
  only.rows.slice(leading, leading + entries.length).forEach((row, i) => {
    const entry = entries[i];
    if (entry && entry.seq > 0) row.ref = { register, seq: entry.seq, version: entry.version };
  });
  return segments;
}

/* ── the forms a built page draws ────────────────────────────────────────── */

/** A key the record answers or a declaration carries that the app's block type does not name, read as it came. */
const keyOf = (block: BlockResult, key: string): unknown => (block as unknown as Record<string, unknown>)[key];

/** Whether a `progress` block is drawn as ranges, which is the declaration's `range: true` and nothing looser. */
const ranged = (block: BlockResult): boolean => keyOf(block, 'range') === true;

/** A path's done marks as the record answered them, aligned with the rows, or `null` for a `steps` block that is no path. */
function marksOf(block: BlockResult): boolean[] | null {
  const marks = keyOf(block, 'done_now');
  return Array.isArray(marks) && marks.length === block.entries.length ? marks.map((m) => m === true) : null;
}

/**
 * The word after the kind in the fence, one of the forms the renderer names (`KINDS[kind].forms`).
 *
 * A PATH IS A FORM THE RECORD DECIDES and every other one is the author's. `steps path` is written when the record
 * answered `done_now`, which it does only over a list that declares `steps:`, because a mark cell is a fact about which
 * rows are done and a list that says nothing about that has no marks to write. The rest are the declaration's own
 * words, each read as `true` and nothing looser, as `sticky` and `box` are.
 */
function formOf(block: BlockResult): string {
  if (block.kind === 'stat' && block.lead) return ' lead';
  if (block.kind === 'series' && block.net) return ' net';
  if (block.kind === 'progress' && ranged(block)) return ' range';
  if (block.kind === 'progress' && block.spent) return ' budget';
  if ((block.kind === 'note' || block.kind === 'cards') && block.lead === true) return ' lead';
  if (block.kind === 'steps' && marksOf(block)) return ' path';
  if (block.kind === 'queue' && keyOf(block, 'lead') === true) return ' lead';
  if (block.kind === 'queue' && keyOf(block, 'tiles') === true) return ' tiles';
  return '';
}

/**
 * A path's rows: `short | <label>` first when the block declares a short view the record answered (`shortOf`), then
 * each stone `title | detail | mark`, the mark `done`, `next` or blank and `short` after it for a stone in that view,
 * then `more | N` when the short view left steps out (`render/src/path.ts`).
 *
 * THE MARKS ARE THE RECORD'S, `done_now` and `next`, and the projected third cell is thrown away for them. That cell
 * was the list's free text, so a path whose third column was a stage drew "sample" where the record knew the step was
 * done; on a path the third cell is the one fact the form exists to say.
 *
 * `N` IS HOW MANY OPEN STEPS THE SHORT VIEW DID NOT DRAW, the record's `open` less the stones, which is what the drawer
 * says it is (`render/src/path.ts`). It was `matched` less the stones, and `matched` counts the done steps too: 5 steps
 * with 2 done under `first: 2` drew 2 and said "3 more" where 1 was left out, and a path with every step done said
 * "2 more" of nothing. Nothing is written when none is left out, nor when the record did not say how many are open. It
 * is written only under `first:`, because a path cut by `limit:` is a slice, and the page's slice line under it already
 * says so with a door to the rest.
 */
function pathRows(block: BlockResult, cells: number): string[] {
  const marks = marksOf(block) ?? [];
  const next = keyOf(block, 'next');
  const short = shortOf(block);
  /* A STONE IN THE SHORT VIEW SAYS SO AFTER ITS MARK, `done short`, `next short` or `short`, in the renderer's words. */
  const stones = projectRows(block, cells, (i) => [marks[i] ? 'done' : next === i ? 'next' : '', short?.held[i] ? 'short' : ''].filter(Boolean).join(' '));
  const open = keyOf(block, 'open');
  const more = typeof keyOf(block, 'first') === 'number' && typeof open === 'number' ? Math.max(0, open - stones.length) : 0;
  return [...(short ? [`short | ${escapeCell(short.label)}`] : []), ...stones, ...(more > 0 ? [`more | ${more}`] : [])];
}

/**
 * A path's short view: its name and which rows the record says are in it (`short_now`, aligned with the rows), or null.
 *
 * THE RECORD DECIDES WHICH STONES ARE IN IT, from the block's `short: { where, label }`, and this only carries that
 * answer into the fence as its first row, `short | <label>`, and a word on each stone. An answer that does not line up
 * with the rows, or a name that is empty, draws the path whole rather than a view of the wrong stones.
 */
function shortOf(block: BlockResult): { label: string; held: boolean[] } | null {
  const short = keyOf(block, 'short');
  const label = short !== null && typeof short === 'object' ? (short as { label?: unknown }).label : undefined;
  const held = keyOf(block, 'short_now');
  if (typeof label !== 'string' || label.trim() === '' || !Array.isArray(held) || held.length !== block.entries.length) return null;
  return { label: label.trim(), held: held.map((h) => h === true) };
}

/**
 * A range's rows: `label | spent | low | high`, one a row the list matched (`render/src/progress.ts` `rangePlan`).
 *
 * EACH FIGURE IS THE RECORD'S, SAID ONCE, through the one formatter every cell uses, so 12050 pence is `GBP 120.50` here
 * and on the list; the scale, the band and the total are the drawer's arithmetic over these same strings. A row with
 * nothing spent writes an empty cell, which the drawer says as "Not spent", rather than nought, which it would draw as
 * a mark at the start of the track: a spend of nothing and no spend yet are two different facts.
 */
function rangeRows(block: BlockResult): string[] {
  const register = block.register ?? '';
  const [label, spent, low, high] = block.columns.map((c) => c.field);
  if (!label || !spent || !low || !high) return [];
  const said = (field: string, v: unknown): string => (v === null || v === undefined || v === '' ? '' : (display(register, field, v, clockOf(block), block.names) ?? ''));
  return block.matched.map((e) => [label, spent, low, high].map((f) => escapeCell(said(f, e.fields[f]))).join(' | '));
}

/**
 * An `inputs` block's rows: `field | label | type | value`, one a field of the one row the record read
 * (`render/src/inputs.ts`).
 *
 * THE TYPE IS THE RECORD'S ANSWER (`types`), which is what picks the control; an enum carries its choices from the
 * list's declaration, as `enum:idea,sample,made`, so the select offers exactly what the record would take.
 *
 * THE VALUE IS WHAT THE BOX OPENS ON AND WHAT THE SPEC SAYS WHERE NOTHING CAN WRITE. Money is the record's reading said
 * once (`GBP 1,200.00`, never a bare `1200` that has lost its currency), and `inputs-write.ts` reads it back; a yes or
 * no is the record's own spelling; an instant is cut to the minute a `datetime-local` box holds. Everything else is
 * what the row page's box opens on (`draftOf`), so a duration opens in its unit and not in seconds.
 */
function inputsRows(block: BlockResult): string[] {
  const register = block.register ?? '';
  const entry = block.entries[0];
  const types = keyOf(block, 'types');
  if (!entry || types === null || typeof types !== 'object') return [];
  const decl = REGISTERS[register];
  /* WITH NO `columns:` THE KERNEL DREW EVERY TYPABLE FIELD, and names them in `types`, so those are the rows. */
  const named = block.columns.length ? block.columns : Object.keys(types).map((f) => ({ field: f, label: f }));
  return named.flatMap((c) => {
    const type = (types as Record<string, unknown>)[c.field];
    if (typeof type !== 'string') return [];
    const field = decl?.fields.find((f) => f.id === c.field);
    /* THE FIELD'S NAME, as the row page says it, where the declaration gave the column none: `price` is the schema
       talking, and it went on the screen as the input's label. */
    const label = c.label !== c.field ? c.label : field ? labelOf(field) : c.field;
    const v = entry.fields[c.field];
    const choices = type === 'enum' ? (field?.values ?? []).join(',') : '';
    const value =
      v === null || v === undefined
        ? type === 'bool' || type === 'boolean'
          ? 'false'
          : ''
        : type === 'money'
          ? (display(register, c.field, v, clockOf(block), block.names) ?? '')
          : type === 'bool' || type === 'boolean'
            ? String(v === true)
            : type === 'instant'
              ? String(v).slice(0, 16)
              : field
                ? draftOf(field, v, null)
                : String(v);
    return [[c.field, label, choices ? `${type}:${choices}` : type, value].map(escapeCell).join(' | ')];
  });
}

/**
 * An option's seventh cell: what it IS, as the renderer spells it (`render/src/queue.ts`), or empty.
 *
 * HELD TO THE RENDERER'S OWN READING BEFORE IT IS WRITTEN. A cell the parser would not read degrades the WHOLE queue,
 * so one option whose colour a record on another build spelled differently would take every question on the page with
 * it; checked here, that option shows nothing and the rest still draw. The record checks the same three shapes on
 * filing (`govern.ts` `showsOf`), so on this build nothing is dropped.
 */
function showsCell(shows: unknown): string {
  if (shows === null || typeof shows !== 'object') return '';
  const s = shows as { swatch?: unknown; figure?: unknown; file?: { row?: unknown; field?: unknown } };
  const cell = Array.isArray(s.swatch)
    ? `swatch:${s.swatch.join(',')}`
    : typeof s.figure === 'string'
      ? `figure:${s.figure}`
      : s.file && typeof s.file.row === 'string' && typeof s.file.field === 'string'
        ? `file:${s.file.row}/${s.file.field}`
        : '';
  return cell !== '' && showsOf(cell) !== null ? cell : '';
}

/**
 * ── WHY A BLOCK IS BLANK ─────────────────────────────────────────────────────
 *
 * `empty:` was rendered for `table` and for nothing else, so fifteen of the sixteen kinds drew a
 * heading over a blank rectangle and said nothing at all. That reads as a bug in the product rather
 * than as an answer, and it is the worst of the three cases that reach it:
 *
 *   1. THE RECORD REFUSED THE BLOCK, and the filter is one of the ways it does. `compile()` refuses
 *      a clause it cannot resolve and `matches` then admits no row, which is the safe answer and an
 *      invisible one; a source no build reads, a column naming no field, a bar past what one read
 *      holds, a figure and a row in two currencies and a thrown error all arrive the same way, each
 *      with its own sentence. Whoever wrote the declaration — usually an agent, which cannot see the
 *      screen — learns nothing and writes it the same way again. 10 §7's fourth rule is that the
 *      refusal is the teacher, so the words the record already produces are put on the page, and the
 *      heading over them says only that the block drew nothing. THIS FILE NAMING THE REASON IS WHAT
 *      WENT WRONG: see the heading itself, in `draw()`.
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
  /** The title is the block's own `empty:`, a sentence its author wrote, so the host reads it as text (a glyph). */
  authored?: true;
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
  /** The record's installed pack kinds (`kinds.ts` `installedKinds`), threaded to `toSegments` below. */
  kinds?: Readonly<Record<string, KindSpec>>,
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
        ...(block.where || !block.empty ? {} : { authored: true as const }),
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
    if (block.empty) return { kind: 'no-results', title: block.empty, authored: true };
    return { kind: 'no-results', title: 'Nothing matched.' };
  };

  if (block.authored?.length && block.register)
    return {
      segments: [],
      refusal: {
        kind: 'error',
        /* `has` AND IT WAS `declares`. The rule every refusal the kernel words keeps: a
           refusal is the teacher (`10 §7`), and the schema's verb in the first three words teaches
           the schema rather than the fix. The body below already names both halves in the
           dialect's own words, which is where an author needs them. */
        title: 'This part of the page is told to draw two things at once.',
        body: 'Keep one. `source:` reads what the record holds; `authored:` is written out by hand.',
      },
    };

  /**
   * THE HEADING NAMES THE STATE AND THE RECORD NAMES THE REASON, because this file cannot know the
   * reason and said it anyway.
   *
   * The line here read `This block’s filter was not understood, so it matched nothing.` over every
   * refusal a block can carry, and over the Ledger's chart of where the money goes it was false
   * twice in one sentence. Measured in `blocks.test.ts` over a record of 220 rows holding the
   * shipped `Where it went, 12 months` and its four shipped clauses: the record refuses the bar with
   * both numbers and the fix — *A bar adds up every row it matched, and ledger matched 216 where a
   * block that adds up reads 200. Narrow it with where: until it matches 200 or fewer, or draw it as
   * a list.* — so the heading contradicted the line printed directly beneath it: the four clauses
   * were understood, and they admitted 216 rows rather than nothing. `ledger` there is the test's
   * name for the register; on his own page the same sentence names `transactions`, and the seed's 36
   * rows are under the ceiling, so the refusal is what his own row count brings and not what the
   * demo shows. The same test page also refuses a table for a column the register does not declare. The filter is ONE of the shapes that reach here, beside a source no build reads, a
   * column naming no field, a `stale:` that is not a day and a window, a key the record does not
   * read, a figure and a row in two currencies, and a thrown error, and a reader sent to look for a
   * fault in four correct clauses spends an afternoon on a filter that was never wrong.
   *
   * THE CURRENCY HEADING WENT WITH IT, which was the same guess in its milder form. The test was
   * `/currenc/` over every line, so `ledger has no field called currency.` — a misspelt column, with
   * nothing whatever wrong with the money — was headed *This needs its money in one currency, and it
   * is in more than one.* Measured through the record in the second test. Its other half,
   * `a walk starts from one amount`, matched no sentence anything in this repository writes: grepped
   * across `packages/` and `apps/`, the only occurrence of those words was the regex itself.
   *
   * AND THE KEY TO A SPECIFIC HEADING DOES NOT ARRIVE HERE. A refusal leaves the record as
   * `{ code, fix, at }` and both boundaries into this app keep the sentence alone —
   * `page-live.ts:571` maps `refusals.map((r) => r.fix)` and `api.ts:1966` writes
   * `['refusal' in got ? got.refusal.fix]` — so `OUT_OF_BOUNDS` and `MIXED_CURRENCY` are the same
   * string to everything downstream and any heading naming one of them is a guess about prose.
   * Carrying `code` through those two lines is what would let this heading be specific, and it is a
   * change in two files this one does not own.
   */
  if (block.refusals.length)
    return {
      segments: [],
      refusal: {
        kind: 'error',
        title: 'This part of the page drew nothing, and the record says why.',
        lines: block.refusals,
      },
    };

  /* A REGISTERED KIND DRAWS ITSELF, FROM THE RECORD'S ANSWER, and it is asked before any arm below
     (`lib/page/kinds/index.ts`). The two answers above are every block's: a block with both a source and rows of its
     own, and one the record refused, are said the same way whatever their kind. A registered kind read from something
     other than a record, which carries no answer, falls through and is drawn as the dialect draws its kind. */
  const drawer = drawerOf(block.kind);
  if (drawer && block.answer) return drawer.draw(block.answer, { home: homeCurrency(), now: clockOf(block), nothing });

  /* A `table` is drawn by the grid rather than through the dialect, so its rows are the check. */
  if (block.kind === 'table')
    return {
      segments: [],
      refusal: block.rows.length ? null : nothing(),
    };

  /* A FIGURE IN A LABEL-AND-VALUE ROW READS AS MONEY, the way the table beside it does. The
     primitive draws its cells as text, so a `spec` block on a project page said `GBP 14.00` under a
     table saying `£8,530.00`. A code block keeps what was written, and so does a capture, whose cells nobody
     reads: they are the list and the values the host writes into a new row, in the form the record stores.
     AN `inputs` VALUE IS WHAT ITS BOX OPENS ON AND WHAT `inputs-write.ts` READS BACK, so it keeps the record's own
     spelling too: on a record whose home is pounds the box would open on `£1,200.00`, and `$` is the symbol of more than
     one currency, so what came back could not say which it was in.
     A TILE'S FIGURE IS A HEADLINE, the second cell of each `stat` row, and says a round amount without its ".00". */
  const home = homeCurrency();
  const segments = toSegments(block, kinds).map((s) =>
    s.type === 'block' && s.kind !== 'code' && s.kind !== 'capture' && s.kind !== 'inputs'
      ? { ...s, rows: s.rows.map((r) => ({ ...r, cells: r.cells.map((c, j) => symbolText(c, home, s.kind === 'stat' && j === 1)) })) }
      : s,
  );
  /* A CARD GRID IS BLANK WHEN IT HAS NO ENTRIES, whatever its first row says: that row names the
     columns and is not a card. A section over a register that admitted nothing has nothing under
     it, and its `empty:` is the sentence for that; a section with no source is a heading, and a
     heading is never blank. */
  const blank =
    block.kind === 'cards'
      ? block.entries.length === 0
      : block.kind === 'section'
        /* AND A SECTION THAT WROTE NO SENTENCE SAYS NOTHING when its list matched nothing: it is a heading over the
           blocks below it, which say their own nothing, and "Nothing matched." above "Nothing is parked or finished."
           is the same fact twice on a record that has neither. */
        ? Boolean(block.register) && block.matched.length === 0 && Boolean(block.empty)
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
    .map((clause, i) => {
      /* `, or` JOINS TWO CONDITIONS, and the word is the separator's, not the field's. Handed
         whole to the regex below, `or due before +30d` looked for a field called `or due`, found none and was printed as
         written, so a block read `which way is Money in, or due before +30d`: half in the rows' words and half in the
         declaration's (`where-any.test.ts`). The `or` is said as the folded word, as the verb is. */
      const joined = i > 0 ? /^\s*or(?:\s+|$)/i.exec(clause) : null;
      return joined ? `or ${plainClause(register, clause.slice(joined[0].length))}` : plainClause(register, clause);
    })
    .join(', ');
}

/** One condition of a `where:` as a person would read it, or as written when it cannot be improved. */
function plainClause(register: string, clause: string): string {
  const said = clause.trim();
  /* THE SAME OPERATORS `where.ts` READS, AND NO MORE. `on` was once a fifth: this would render
     `renews on today` as though it meant something, and `compile` answers "that is not
     something a filter can say". A printer that speaks a wider language than the parser is a
     printer that teaches people sentences the record will not take.
     AND NO FEWER, WHICH IS THE SAME RULE FROM THE OTHER SIDE. `has` and `lacks` were added to the
     compiler and not here, so `repos has portage` fell past this regex and printed with the
     schema's own field id where every clause beside it printed the label a reader sees — `repos`
     under a table headed Repositories. A sentence it cannot improve, it must not change; a
     sentence it can, it must. */
  const m = /^(.+?)\s+(is not|is|before|after|has|lacks)\s+(.+)$/i.exec(said);
  if (!m) return said;
  const [, rawField, wrote, rest] = m as unknown as [string, string, string, string];
  /**
   * THE OPERATOR FOLDED ONCE, WHICH IS WHAT `compile` DOES A FILE AWAY AND FOR THE SAME REASON.
   *
   * The regex takes its `i`, so `needs HAS BRAINDOG_TOKEN` matched here and `compile` reads it too
   * — it folds with `op = said.toLowerCase()`, and the sentence draws row 1. Every test below was
   * against a lower-case literal, so the shouted spelling missed the list branch and fell to the
   * enum swap: it printed `keys it needs HAS BRAINDOG TOKEN`, which compiles clean, refuses
   * nothing and draws NO rows, under a block that drew one. `due BEFORE +30d` was the same defect
   * one operator along and older, printing the relative word where `before` printed the days.
   *
   * AND THE FOLDED WORD IS WHAT IS PRINTED, not the one somebody shouted: the field name beside it
   * is already lower-cased, and a filter line is a sentence rather than a quotation of the
   * declaration.
   */
  const verb = wrote.toLowerCase();
  const decl = REGISTERS[register]?.fields.find((f) => f.id.toLowerCase() === rawField.trim().toLowerCase());
  if (!decl) return said;
  const name = decl.label ?? decl.id.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
  /**
   * AN UNDERSCORE IN AN ENUM'S VALUE IS A SPELLING AND IN A LIST'S IS THE VALUE.
   *
   * `owed_to_me` reads "owed to me" because the column holds an id a person never types, which is
   * what the swap below is for. A `list<text>` holds whatever was written into it, and the swap
   * would print `needs has BRAINDOG TOKEN` for a row whose key really is `BRAINDOG_TOKEN` —
   * measured against the record, which answers `rows [1]` to the first spelling and nothing at all
   * to the printed one. A filter printed in a spelling the record cannot find is worse than one
   * printed in the dialect, because a reader has no way to tell.
   *
   * SO THE SWAP FOLLOWS THE DECLARATION AND NOT THE OPERATOR: a field that declares its values is
   * an enum and gets it, and a field that does not keeps every character somebody wrote. And
   * `has` takes ONE value, so there is nothing to split on ` or `; the compiler refuses two.
   */
  const listed = verb === 'has' || verb === 'lacks';
  /* A DECLARED VALUE IS SAID BY ITS LABEL FIRST, as the rows under the line read it. With Personal's labels on the
     things list this printed "status is building or earning" over rows reading Active and Ongoing, and the label
     typed back (`lane is ongoing`) printed "ongoing", the one spelling that is neither the row's nor the value's.
     The `REGISTERS` this reads are already relabelled, so the label is on the field. */
  const worded = (v: string): string => {
    const value = declaredValue(register, decl.id, v);
    return decl.labels?.[value] ?? value.replace(/_/g, ' ');
  };
  const values =
    verb === 'before' || verb === 'after'
      ? spokenDay(rest)
      : listed
        ? (decl.values ? worded(rest.trim()) : rest.trim())
        : rest
            .split(/\s+or\s+/)
            .map((v) => worded(v.trim()))
            .join(' or ');
  return `${name.toLowerCase()} ${verb} ${values}`;
}
