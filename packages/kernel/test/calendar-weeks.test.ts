/**
 * A `calendar` with `weeks:`: a strip of whole weeks from the Monday of this one, in place of `back:` and `ahead:`.
 *
 * ON A REAL RECORD, read through the record's own `list`, the kind asked as `pages.ts` asks a registered kind (its
 * `validate`, then its `read` with the kit), as `calendar-deadlines.test.ts` asks it. Read on Tuesday 15 September 2026,
 * so this week's Monday is the 14th and five weeks end on Sunday 18 October.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { no, ok } from '@braindog/ports';
import type { Schema } from '@braindog/where';

import { calendar } from '../src/kinds/calendar.ts';
import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { predicateOf } from '../src/metrics.ts';
import type { BlockResult, PageBlock, PageDeps } from '../src/pages.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 15, 12);
const OWNER = { actor: 'p_1' };

const list = (id: string, name: string, fields: Record<string, unknown>[], more: Record<string, unknown> = {}): Declaration => ({
  id: `register.${id}`,
  kind: 'register',
  body: { id, name, title: 'what', fields, ...more } as never,
});

const LISTS: Declaration[] = [
  list(
    'chores',
    'Chores',
    [
      { id: 'what', type: 'text', required: true },
      { id: 'due', type: 'day', deadline: true },
      { id: 'state', type: 'enum', values: ['open', 'done'], default: 'open' },
    ],
    { state: 'state', done: ['done'] },
  ),
  list('bills', 'Bills', [
    { id: 'what', type: 'text', required: true },
    { id: 'due', type: 'day', required: true, deadline: true },
  ]),
];

/** Five weeks of what falls due, from this one. */
const BLOCK = { kind: 'calendar', source: 'deadlines', columns: [{ field: 'title' }, { field: 'day' }], weeks: 5 } as PageBlock;

async function record(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const installed = await k.install(LISTS);
  assert.ok(installed.ok, JSON.stringify(installed));
  const made = (register: string, fields: Record<string, unknown>): void => {
    const out = k.create(register, fields, OWNER);
    assert.ok(out.ok, JSON.stringify(out));
  };
  made('chores', { what: 'Water the ferns', due: '2026-09-17' });
  made('chores', { what: 'Mend the gate', due: '2026-09-13' });
  made('chores', { what: 'Clean the gutters', due: '2026-09-14' });
  made('chores', { what: 'Paint the shed', due: '2026-10-01', state: 'done' });
  made('bills', { what: 'Water bill', due: '2026-10-18' });
  made('bills', { what: 'Phone bill', due: '2026-10-19' });
  made('bills', { what: 'Insurance', due: '2026-09-29' });
  return k;
}

function depsOver(k: Kernel): PageDeps {
  const schemaOf = (register: string): Schema | null => {
    const decl = k.register(register);
    if (!decl) return null;
    return { register, ...(decl.state === undefined ? {} : { state: decl.state }), fields: Object.fromEntries(decl.fields.map((f) => [f.id, f])) };
  };
  return {
    pages: () => [],
    metric: () => null,
    read: () => no('METRIC_UNKNOWN', 'This test reads no figures.'),
    list: (q) => {
      const out = k.list({ register: q.register, ...(q.where ? { where: q.where } : {}), ...(q.limit ? { limit: q.limit } : {}), ...(q.order?.length ? { order: q.order } : {}) });
      return out.ok ? ok({ rows: out.value.rows, matched: out.value.matched }) : out;
    },
    schemaOf,
    titleOf: (register) => k.register(register)?.title ?? null,
    lists: () => [...k.registers().values()],
    runway: () => null,
    ctx: { nowMs: NOW, schemaOf },
    kit: { predicateOf, today: () => new Date(NOW).toISOString().slice(0, 10) },
  } as PageDeps;
}

function read(k: Kernel, block: PageBlock): BlockResult {
  const base = { ...block, rows: [], matched: 0, refusals: [] } as BlockResult;
  const fault = calendar.validate?.(block, { stage: 'read' }) ?? null;
  return fault ? { ...base, refusals: [fault] } : calendar.read(depsOver(k), block, base);
}

const drawn = (out: BlockResult): string[] => (out.rows ?? []).map((r) => `${String(r.fields.day)} ${String(r.fields.title)}`);
const weeksOn = (out: BlockResult): unknown => (out as BlockResult & { weeks?: unknown }).weeks;

test('weeks: 5 READS FIVE WHOLE WEEKS FROM THIS MONDAY, the days of this week already gone among them, and says weeks', async () => {
  const k = await record();
  const out = read(k, BLOCK);
  assert.deepEqual(out.refusals, []);
  assert.deepEqual(out.window, { from: '2026-09-14', to: '2026-10-18', today: '2026-09-15' });
  assert.equal(weeksOn(out), 5);
  /* THE MONDAY IS IN AND THE SUNDAY BEFORE IS NOT; the last Sunday is in and the Monday after is not; done is left out. */
  assert.deepEqual(drawn(out), ['2026-09-14 Clean the gutters', '2026-09-17 Water the ferns', '2026-09-29 Insurance', '2026-10-18 Water bill']);
  assert.equal(out.matched, 4);
});

test('ONE WEEK IS THIS WEEK, Monday to Sunday', async () => {
  const k = await record();
  const out = read(k, { ...BLOCK, weeks: 1 } as PageBlock);
  assert.deepEqual(out.window, { from: '2026-09-14', to: '2026-09-20', today: '2026-09-15' });
  assert.deepEqual(drawn(out), ['2026-09-14 Clean the gutters', '2026-09-17 Water the ferns']);
});

test('OVER ONE LIST, AND WRITTEN OUT, A STRIP READS THE SAME WEEKS', async () => {
  const k = await record();
  const over = read(k, { kind: 'calendar', source: 'register.bills', columns: [{ field: 'what' }, { field: 'due' }], weeks: 3 } as PageBlock);
  assert.deepEqual(over.refusals, []);
  assert.deepEqual(over.window, { from: '2026-09-14', to: '2026-10-04', today: '2026-09-15' });
  assert.deepEqual(
    over.rows.map((r) => r.fields.what),
    ['Insurance'],
  );
  assert.equal(weeksOn(over), 3);
  const written = read(k, { kind: 'calendar', authored: [{ cells: ['Picnic', '2026-09-19'] }], weeks: 2 } as PageBlock);
  assert.deepEqual(written.refusals, []);
  assert.deepEqual(written.window, { from: '2026-09-14', to: '2026-09-27', today: '2026-09-15' });
  assert.equal(weeksOn(written), 2);
});

test('A CALENDAR SAYING NO weeks: DRAWS ITS MONTHS AS BEFORE, and says no weeks', async () => {
  const k = await record();
  const out = read(k, { ...BLOCK, weeks: undefined, back: 0, ahead: 0 } as unknown as PageBlock);
  assert.deepEqual(out.window, { from: '2026-09-01', to: '2026-09-30', today: '2026-09-15' });
  assert.equal(weeksOn(out), undefined);
});

test('weeks: 9, weeks: 0 AND A WEEKS NOT WHOLE ARE REFUSED, and so is weeks: beside back: or ahead:', async () => {
  const k = await record();
  const said = (more: Record<string, unknown>): { fix: string; at?: string } => {
    const r = read(k, { ...BLOCK, ...more } as PageBlock).refusals[0];
    return { fix: r?.fix ?? '', ...(r?.at ? { at: r.at } : {}) };
  };
  assert.deepEqual(said({ weeks: 9 }), { fix: 'weeks: on a calendar is how many whole weeks it shows from this one, from 1 to 8, and 9 is not.', at: 'weeks' });
  assert.match(said({ weeks: 0 }).fix, /from 1 to 8, and 0 is not/u);
  assert.match(said({ weeks: 2.5 }).fix, /and 2.5 is not/u);
  assert.match(said({ weeks: '5' }).fix, /and "5" is not/u);
  const both = 'A calendar shows whole months with back: and ahead:, or whole weeks from this one with weeks:, and this one says both. Take one off.';
  assert.deepEqual(said({ back: 1 }), { fix: both, at: 'back' });
  assert.deepEqual(said({ ahead: 0 }), { fix: both, at: 'ahead' });
  assert.match(said({ limit: 5 }).fix, /takes no limit:.*show fewer weeks with weeks:/u);
  /* AND THE INSTALL ASKS THE SAME MODULE: a page with five weeks goes in, and one with weeks beside back does not. */
  const page = (id: string, block: Record<string, unknown>): Declaration => ({ id: `page.${id}`, kind: 'page', body: { page: id, title: 'Soon', blocks: [block] } as never });
  const good = await k.install([page('soon', BLOCK as never)]);
  assert.ok(good.ok, JSON.stringify(good));
  const wrong = await k.install([page('soon-wrong', { ...BLOCK, back: 1 })]);
  assert.ok(!wrong.ok);
});

test("THROUGH THE RECORD'S OWN block: the page gets the five weeks and the answer says weeks", async () => {
  const k = await record();
  const out = k.block(BLOCK);
  assert.deepEqual(out.refusals, []);
  assert.deepEqual(out.window, { from: '2026-09-14', to: '2026-10-18', today: '2026-09-15' });
  assert.equal(weeksOn(out), 5);
  assert.deepEqual(drawn(out), ['2026-09-14 Clean the gutters', '2026-09-17 Water the ferns', '2026-09-29 Insurance', '2026-10-18 Water bill']);
});
