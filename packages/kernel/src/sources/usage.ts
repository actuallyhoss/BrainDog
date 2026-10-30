/**
 * `usage.days`, `usage.actions` and `usage.projects`: this month's use of the record's scheduled actions, by day, by
 * action and by the project each runs for.
 *
 * A USAGE PAGE IS A DECLARATION OVER THESE, not a screen of its own. Each reads `deps.actions()`, the list the
 * `actions` read and a project's "Runs on" read, and each action's counts through `monthOf`, so the four places that
 * count a month cannot disagree: what the days add up to is what the actions add up to, and the projects are the same
 * actions summed by where they run. A held call is in `held` and in no other count, as the meter writes it.
 *
 * WORD-FREE: an answer holds counts, days and names, and the page that draws it says what they are. `usage.days` is a
 * series, one bar a day from the first of the month to today with a line of runs and a line of requests, and the same
 * days as rows; the other two are rows a table or cards block draws.
 */

import type { Schema } from '@braindog/where';
import { evaluate } from '@braindog/where';

import type { ActionRow } from '../actions.ts';
import type { Entry } from '../index.ts';
import type { BlockResult, PageBlock, PageDeps, SourceKit } from '../pages.ts';
import { monthOf } from './actions.ts';
import type { Also, Source } from './index.ts';

type Month = ReturnType<typeof monthOf>;

const COUNTS = {
  runs: { type: 'int' },
  requests: { type: 'int' },
  bytes: { type: 'int' },
  failures: { type: 'int' },
  held: { type: 'int' },
} as const;

/** One day of the month: its runs and requests, every action's added up. */
const DAYS: Schema = { register: 'usage.days', fields: { day: { type: 'day' }, runs: { type: 'int' }, requests: { type: 'int' } } };

/** One scheduled action and its month. `project` is the project's name, and `spoken` the handle beside it. */
const ACTIONS: Schema = {
  register: 'usage.actions',
  fields: {
    name: { type: 'text' },
    channel: { type: 'enum', values: ['pull', 'call', 'poll'] },
    project: { type: 'text' },
    spoken: { type: 'text' },
    scope: { type: 'enum', values: ['project', 'global'] },
    ...COUNTS,
  },
};

/** One project's month: every action that runs for it, added up. The actions for every project are one row of their own. */
const PROJECTS: Schema = {
  register: 'usage.projects',
  fields: {
    name: { type: 'text' },
    spoken: { type: 'text' },
    scope: { type: 'enum', values: ['project', 'global'] },
    actions: { type: 'int' },
    ...COUNTS,
  },
};

/** A row id, which no page should say: a project an action names but the record no longer holds is named by nothing. */
const ROW_ID = /^[0-9A-HJKMNP-TV-Z]{26}$/u;

/** Where an action runs, by name: the project row's title, its handle when it has none, and `null` for every project. */
function whereOf(a: ActionRow): { key: string; name: string | null; spoken: string | null; scope: 'project' | 'global' } {
  if (a.project === null) return { key: '', name: null, spoken: null, scope: 'global' };
  const row = a.project_row ?? null;
  const said = ROW_ID.test(a.project) ? null : a.project;
  return { key: row?.id ?? a.project, name: row?.title ?? row?.spoken ?? said, spoken: row?.spoken ?? said, scope: 'project' };
}

/** A row of one of these sources, which belongs to no list, so its `seq` is `null`. */
const entryOf = (schema: Schema, id: string, fields: Entry['fields'], at: string): Entry => ({
  id,
  register: schema.register,
  seq: null,
  fields,
  state: null,
  version: 1,
  created_at: at,
  updated_at: at,
  deleted_at: null,
});

const zero = (): Month => ({ runs: 0, requests: 0, bytes: 0, failures: 0, held: 0 });
const add = (into: Month, more: Month): void => {
  into.runs += more.runs;
  into.requests += more.requests;
  into.bytes += more.bytes;
  into.failures += more.failures;
  into.held += more.held;
};

/**
 * What every one of the three does before it reads: the action list there, no `order:`, columns it holds, a `where:`
 * it can read. Then the rows it kept, cut to `limit:`.
 */
function rowsOf(deps: PageDeps, block: PageBlock, base: BlockResult, also: Also, kit: SourceKit, schema: Schema, build: (actions: ActionRow[]) => Entry[]): BlockResult {
  const name = schema.register;
  if (!deps.actions) return { ...base, refusals: also({ code: 'NOT_IN_THIS_BUILD', fix: 'This BrainDog does not read its scheduled actions onto a page yet.', at: 'source' }) };
  if (block.order?.length) return { ...base, refusals: also({ code: 'DECLARATION_INVALID', fix: `${name} comes in its own order, so it takes no order:.`, at: 'order' }) };
  const unknown = (block.columns ?? []).map((c) => c.field).filter((f) => !Object.hasOwn(schema.fields, f));
  if (unknown.length)
    return { ...base, refusals: also({ code: 'FIELD_UNKNOWN', fix: `${name} has no field called ${unknown.join(', ')}.`, at: 'columns', allowed: Object.keys(schema.fields) }) };
  const said = kit.predicateOf(block.where, schema, deps.ctx);
  if (said.bad.length) return { ...base, refusals: also(...said.bad) };
  const kept = build(deps.actions()).filter((r) => evaluate(said.predicate, r.fields, schema, r));
  const limit = block.limit === undefined ? 50 : Math.max(0, Math.floor(block.limit));
  return { ...base, rows: kept.slice(0, limit), matched: kept.length, types: kit.typesOf(schema) };
}

/** UTC, as the meter's month is: today's day, and every day of this month up to it, oldest first. */
function monthDays(nowMs: number): { today: string; days: string[] } {
  const today = new Date(nowMs).toISOString().slice(0, 10);
  const days = Array.from({ length: Number(today.slice(8, 10)) }, (_, i) => `${today.slice(0, 8)}${String(i + 1).padStart(2, '0')}`);
  return { today, days };
}

/**
 * One row a day of this month, from the first to today, each action's day added in, and a day nobody ran at zero.
 *
 * AND THE SAME DAYS AS A SERIES (`bars`), one line of runs and one of requests, today's bar partial, so a `series` block
 * draws it. It is answered `first`, before the `series` kind reads figures a source block names none of. Whether three
 * days say enough to draw is the page's to decide; the answer is every day.
 */
function daysBlock(deps: PageDeps, block: PageBlock, base: BlockResult, also: Also, kit: SourceKit): BlockResult {
  const { today, days } = monthDays(deps.ctx.nowMs);
  const read = rowsOf(deps, block, base, also, kit, DAYS, (actions) => {
    const by = new Map(days.map((day) => [day, { runs: 0, requests: 0 }]));
    for (const a of actions)
      for (const d of a.days) {
        const day = by.get(d.day);
        if (!day) continue;
        day.runs += d.runs;
        day.requests += d.requests;
      }
    return days.map((day) => entryOf(DAYS, `usage:${day}`, { day, ...by.get(day)! }, `${day}T00:00:00.000Z`));
  });
  if (read.refusals.length || !read.rows) return read;
  const keys = read.rows.map((r) => String(r.fields.day));
  const line = (field: 'runs' | 'requests'): number[] => read.rows.map((r) => Number(r.fields[field] ?? 0));
  return {
    ...read,
    bars: { bucket: 'day', current: today, keys, states: keys.map((k) => (k === today ? 'partial' : '')), values: [line('runs'), line('requests')], unit: null },
  };
}

/** One row a scheduled action, by its name, with where it runs by name and its month. A finished action that ran this month is counted. */
function actionsBlock(deps: PageDeps, block: PageBlock, base: BlockResult, also: Also, kit: SourceKit): BlockResult {
  return rowsOf(deps, block, base, also, kit, ACTIONS, (actions) =>
    actions
      .map((a) => {
        const at = whereOf(a);
        return entryOf(ACTIONS, `usage:${a.ingest}`, { name: a.ingest, channel: a.channel, project: at.name, spoken: at.spoken, scope: at.scope, ...monthOf(a) }, a.last?.at ?? '');
      })
      .sort(byName),
  );
}

/** The same months added up by the project each action runs for, the projects by name, then every project's actions as one row. */
function projectsBlock(deps: PageDeps, block: PageBlock, base: BlockResult, also: Also, kit: SourceKit): BlockResult {
  return rowsOf(deps, block, base, also, kit, PROJECTS, (actions) => {
    const by = new Map<string, { at: ReturnType<typeof whereOf>; actions: number; month: Month; last: string }>();
    for (const a of actions) {
      const at = whereOf(a);
      const group = by.get(at.key) ?? { at, actions: 0, month: zero(), last: '' };
      group.actions += 1;
      add(group.month, monthOf(a));
      if ((a.last?.at ?? '') > group.last) group.last = a.last!.at;
      by.set(at.key, group);
    }
    const rows = [...by.values()].map((g) =>
      entryOf(PROJECTS, `usage:${g.at.key || 'global'}`, { name: g.at.name, spoken: g.at.spoken, scope: g.at.scope, actions: g.actions, ...g.month }, g.last),
    );
    return rows.sort((x, y) => (x.fields.scope === y.fields.scope ? byName(x, y) : x.fields.scope === 'global' ? 1 : -1));
  });
}

function byName(a: Entry, b: Entry): number {
  const x = String(a.fields.name ?? '');
  const y = String(b.fields.name ?? '');
  return x < y ? -1 : x > y ? 1 : 0;
}

/* EACH BELONGS TO NO LIST: the actions are the record's, so a block over one is shown to a reader of the whole record. */
export const usageDays: Source = { whole: true, first: true, says: "this month's scheduled actions by day, first to today, as a series of runs and requests and as rows: day, runs, requests; no order:", read: daysBlock };
export const usageActions: Source = { whole: true, says: "this month's use, one scheduled action a row, by name, as rows: name, channel, project, spoken, scope, runs, requests, bytes, failures, held; no order:", read: actionsBlock };
export const usageProjects: Source = { whole: true, says: "this month's use added up by the project each scheduled action runs for, by name, every project's last, as rows: name, spoken, scope, actions, runs, requests, bytes, failures, held; no order:", read: projectsBlock };
