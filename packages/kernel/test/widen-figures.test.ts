/**
 * A widening refuses to change what an installed figure counts.
 *
 * MEASURED IN `loop/research-batch-thirty-four-audit.md` §1. `enum` to `text` is a widening (`widen.ts`), and `stranded`
 * re-asked each reader of the opened field only whether it still compiles, which every one of these does. But `where`
 * maps an enum's words to its stored value by label, by spaces for underscores and without case, and over `text` it hands
 * the word back as written. Projects with `lane: enum [building, earning_money, parked]`, one row each, then `lane`
 * opened to text: `lane is earning money` went from 1 to 0, `lane is Building` from 1 to 0, `lane is not Parked` from 2
 * to 3, and a table filtered on the label `Earning` from 1 row to 0. Only the figure that wrote the stored value kept
 * its answer.
 *
 * REFUSED, NOT REWRITTEN. The other way out was to rewrite each reader's literal to the stored value as part of the
 * change. That edits a declaration nobody in this change asked to edit, often one a pack owns and would put back on its
 * next update, and it would have to re-print a sentence somebody wrote, which the tree form cannot do faithfully for
 * every shape. The refusal names the reader and the words, and the fix is one edit the owner can see.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { codeOf, fixOf } from '@braindog/ports';

import { openRecord, type Declaration, type Kernel, type MetricDecl } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 22, 12);

const NAME = { id: 'name', type: 'text', required: true };
const LANE = { id: 'lane', type: 'enum', values: ['building', 'earning_money', 'parked'], labels: { earning_money: 'Earning' } };
const LANE_TEXT = { id: 'lane', type: 'text' };

const projects = (lane: Record<string, unknown>): Declaration => ({
  id: 'register.projects',
  kind: 'register',
  body: { id: 'projects', name: 'Projects', title: 'name', fields: [NAME, lane] } as never,
});

const counting = (metric: string, where: string): MetricDecl =>
  ({ metric, name: metric, source: 'register.projects', value: { count: 'id' }, where, format: 'int', target: { gte: 0 }, window: '30d' }) as never;

const BY_VALUE = counting('by-value', 'lane is earning_money');
const BY_WORDS = counting('by-words', 'lane is earning money');
const BY_CASE = counting('by-case', 'lane is Building');
const NOT_PARKED = counting('not-parked', 'lane is not Parked');

const metric = (body: MetricDecl): Declaration => ({ id: `metric.${body.metric}`, kind: 'metric', body: body as never });

const EARNING_PAGE: Declaration = {
  id: 'page.earning',
  kind: 'page',
  body: {
    page: 'earning',
    title: 'Earning',
    blocks: [{ kind: 'table', source: 'register.projects', where: 'lane is Earning', columns: [{ field: 'name' }], empty: 'None.' }],
  } as never,
};

const BUILDING_RULE: Declaration = {
  id: 'rule.building',
  kind: 'rule',
  body: { rule: 'building', register: 'projects', when: 'lane is Building', then: [{ tag: 'busy' }] } as never,
};

const PARKED_AUTOMATION: Declaration = {
  id: 'rule.parked-note',
  kind: 'rule',
  body: {
    rule: 'parked-note',
    on: { written: { register: 'projects', op: ['update'] } },
    once_per: ['name'],
    steps: [{ if: 'lane is Parked', then: [{ notify: { say: 'Parked: {{trigger.row.name}}' } }] }],
  } as never,
};

async function record(...readers: Declaration[]): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const out = await k.install([projects(LANE), ...readers]);
  assert.ok(out.ok, fixOf(out));
  for (const [name, lane] of [['Kiln', 'earning_money'], ['Loom', 'building'], ['Shed', 'parked']])
    assert.ok(k.create('projects', { name, lane }, { actor: 'p_1' }).ok);
  return k;
}

const count = (k: Kernel, body: MetricDecl): unknown => {
  const read = k.metric(body) as { ok: boolean; value?: { value: unknown } };
  assert.ok(read.ok, JSON.stringify(read));
  return read.value!.value;
};

test('A FIGURE THAT WROTE AN ENUM VALUE THE WAY A SCREEN SHOWS IT REFUSES THE WIDENING, naming itself and its words', async () => {
  const k = await record(metric(BY_VALUE), metric(BY_WORDS));
  assert.equal(count(k, BY_WORDS), 1, 'the words read the stored value under the enum');

  const out = await k.install([projects(LANE_TEXT)]);
  assert.equal(out.ok, false, 'the widening silently changed what metric.by-words counts');
  assert.equal(codeOf(out), 'FIELD_TYPE_CHANGED');
  assert.match(fixOf(out), /metric\.by-words/);
  assert.match(fixOf(out), /lane is earning money/);
  assert.match(fixOf(out), /earning_money/);
  assert.ok(!fixOf(out).includes(String.fromCharCode(0x2014)), 'no em dash in a sentence a stranger reads');
  assert.equal(k.register('projects')?.fields.find((f) => f.id === 'lane')?.type, 'enum', 'nothing installed');
  assert.equal(count(k, BY_WORDS), 1);
});

test('CASE ALONE IS A DIFFERENT WORD UNDER text, and so is an is not that would start counting the row it excluded', async () => {
  for (const [reader, id, words] of [
    [BY_CASE, 'metric.by-case', 'Building'],
    [NOT_PARKED, 'metric.not-parked', 'Parked'],
  ] as const) {
    const k = await record(metric(reader));
    const out = await k.install([projects(LANE_TEXT)]);
    assert.equal(out.ok, false, `${id} changed its answer and the widening installed`);
    assert.match(fixOf(out), new RegExp(id.replace('.', '\\.')));
    assert.match(fixOf(out), new RegExp(words));
  }
});

test("A PAGE FILTERED ON THE LABEL, A RULE'S when: AND AN AUTOMATION'S if: WRITTEN IN ANOTHER CASE ARE ASKED TOO", async () => {
  for (const [reader, id] of [
    [EARNING_PAGE, 'page.earning'],
    [BUILDING_RULE, 'rule.building'],
    [PARKED_AUTOMATION, 'rule.parked-note'],
  ] as const) {
    const k = await record(reader);
    const out = await k.install([projects(LANE_TEXT)]);
    assert.equal(out.ok, false, `${id} changed what it reads and the widening installed`);
    assert.equal(codeOf(out), 'FIELD_TYPE_CHANGED');
    assert.match(fixOf(out), new RegExp(id.replace('.', '\\.')));
  }
});

/* FOUND WRITING THE CASE ABOVE, and not in the audit: `page.earning` beside Projects in one batch was refused
   "projects.lane has no value Earning", while the same page installed after Projects was taken. `unreadable` builds the
   schema of a list arriving in the batch by hand and left the value labels out, which `schemaOf` carries. */
test('A PAGE INSTALLED IN THE SAME BATCH AS ITS LIST MAY FILTER ON A VALUE LABEL, as one installed after it may', async () => {
  const after = await openRecord(openSqlite(), fixedClock(NOW));
  assert.ok((await after.install([projects(LANE)])).ok);
  const later = await after.install([EARNING_PAGE]);
  assert.ok(later.ok, fixOf(later));

  const beside = await openRecord(openSqlite(), fixedClock(NOW));
  const out = await beside.install([projects(LANE), EARNING_PAGE]);
  assert.ok(out.ok, fixOf(out));
});

test('A FIGURE THAT WROTE THE STORED VALUE STILL INSTALLS THE WIDENING, and counts what it counted', async () => {
  const k = await record(metric(BY_VALUE));
  const out = await k.install([projects(LANE_TEXT)]);
  assert.ok(out.ok, fixOf(out));
  assert.equal(k.register('projects')?.fields.find((f) => f.id === 'lane')?.type, 'text');
  assert.equal(count(k, BY_VALUE), 1);
});

/* FOUND BY THE CHECKER OF THIS CHANGE: a pack update sends every declaration it holds, so the figure arrives in the
   widening batch with the same bytes it already had. Passed over as "the batch's", `lane is earning money` went from 1
   to 0 and the widening installed, the one path the refusal was chosen to hold against. */
test('A FIGURE RESENT UNCHANGED BESIDE THE WIDENING, as a pack update sends it, is still asked', async () => {
  const k = await record(metric(BY_WORDS));
  const out = await k.install([projects(LANE_TEXT), metric(BY_WORDS)]);
  assert.equal(out.ok, false, 'the resent figure changed its answer and the widening installed');
  assert.equal(codeOf(out), 'FIELD_TYPE_CHANGED');
  assert.match(fixOf(out), /metric\.by-words/);
  assert.equal(count(k, BY_WORDS), 1);
});

test('AND ONE WHOSE WORDS ARE CHANGED IN THE SAME BATCH BELONGS TO THE BATCH, and installs with it', async () => {
  const k = await record(metric(BY_WORDS));
  const out = await k.install([projects(LANE_TEXT), metric({ ...BY_WORDS, where: 'lane is earning_money' } as MetricDecl)]);
  assert.ok(out.ok, fixOf(out));
  assert.equal(count(k, { ...BY_WORDS, where: 'lane is earning_money' } as MetricDecl), 1);
});
