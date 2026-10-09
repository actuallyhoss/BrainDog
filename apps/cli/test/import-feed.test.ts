/**
 * A number the import says the record should poll is filed as a fill of the live feed add-on, and never twice.
 *
 * ONE BUILDER. Before REC-C01 the importer built its own pack, `poll-<id>`, with a builder that needed the Founder use
 * case, and `braindog feed propose` and the app's form built `feed-<id>` with `fillFeed`. The same poll could then be
 * asked under two names. Now the importer files `feed-<id>` from `live-feed.pack.json`, and a record that already
 * holds the old `poll-<id>`, answered or waiting, is not asked again: the same requests to the same address are one
 * approval, whatever they were first called.
 *
 * THE DOOR IS THE KERNEL THIS PRODUCT SHIPS, as in `import-at-scale.test.ts`, and the filed add-on is read by the
 * record's own `normalise` and `validateDeclaration`, so a fill the record would refuse after his yes fails here.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalise } from '@braindog/declare';
import { openRecord, validateDeclaration, type Kernel } from '@braindog/kernel';

import { fixedClock, openSqlite } from '../../../packages/kernel/test/sqlite.ts';
import { applyPlan, type Door } from '../src/import.ts';
import type { Plan, PlannedPoll, PlannedRow } from '../src/adapter.ts';

const NOW = Date.UTC(2026, 9, 9, 9);
const ACTOR = 'p_1';

const THINGS = {
  id: 'register.things',
  kind: 'register' as const,
  body: {
    id: 'things',
    name: 'Projects',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'tags', type: 'list', of: 'text' },
    ],
  } as never,
};

/** The readings list a poll writes into, as a pack of anybody's declares it. */
const DATAPOINTS = {
  id: 'register.datapoints',
  kind: 'register' as const,
  body: {
    id: 'datapoints',
    name: 'Readings',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'value', type: 'decimal' },
      { id: 'unit', type: 'text' },
      { id: 'thing', type: 'ref', to: 'things' },
      { id: 'at', type: 'instant' },
      { id: 'source', type: 'text' },
    ],
  } as never,
};

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${String(x.refusal?.code)}: ${String(x.refusal?.fix)}`);
  return x.value;
};

async function record() {
  const sql = openSqlite();
  const kernel = await openRecord(sql, fixedClock(NOW));
  assert.ok((await kernel.install([THINGS, DATAPOINTS])).ok, 'the lists would not install');
  return { sql, kernel };
}

function doorOf(kernel: Kernel): Door {
  return {
    schema: async (register) =>
      kernel.registers().has(register)
        ? { ok: true, value: { register } }
        : { ok: false, refusal: { code: 'REGISTER_UNKNOWN', fix: `There is no register called ${register}.` } },
    list: async ({ register, limit, cursor }) =>
      kernel.list({ register, ...(limit === undefined ? {} : { limit }), ...(cursor === undefined || cursor === null ? {} : { cursor }) }),
    create: async ({ register, fields, note }) => kernel.create(register, fields, { actor: ACTOR, ...(note === undefined ? {} : { note }) }),
    update: async ({ register, seq, patch, version, note }) =>
      kernel.update(register, `${register}#${String(seq)}`, patch, { actor: ACTOR, ...(version === undefined ? {} : { version }), ...(note === undefined ? {} : { note }) }),
    governance: async ({ register, status, limit, cursor }) =>
      kernel.governance((register ?? 'suggestion') as never, { ...(status === undefined ? {} : { status }), ...(limit === undefined ? {} : { limit }), ...(cursor === undefined ? {} : { cursor }) }),
    propose: async (p) => kernel.propose(p as never, ACTOR),
  };
}

const KILN: PlannedRow = { register: 'things', key: 'tallybook:project:kiln', label: 'Kiln', fields: { name: 'Kiln' } };

const POLL: PlannedPoll = {
  key: 'tallybook:poll:kiln',
  label: 'Kiln stats',
  id: 'kiln-stats',
  url: 'https://stats.kiln.example/v1/numbers',
  every: '1h',
  project: KILN.key,
  measures: [
    { name: 'Active users', path: 'data.users', type: 'int' },
    { name: 'Monthly revenue', path: 'data.mrr', unit: 'USD' },
  ],
};

const plan = (polls: PlannedPoll[]): Plan => ({ key: 'tallybook:', taken: '2026-10-08', rev: 1, rows: [KILN], asks: [], polls, skipped: [], changed: [] });

type Suggestion = { id: string; status: string; body: { install?: string; doc?: Record<string, unknown> } };
const onDecide = (kernel: Kernel) => value<Suggestion[]>(kernel.governance('suggestion', { status: 'all', every: true }));

test('A POLL IS FILED AS THE LIVE FEED ADD-ON, feed-<id>, on the project the import wrote, and asked once', async () => {
  const { sql, kernel } = await record();
  const door = doorOf(kernel);

  const first = await applyPlan(plan([POLL]), door, { dryRun: false });
  assert.deepEqual(first.refused, []);
  assert.deepEqual(first.polls, { filed: 1, before: 0 });

  const [asked, ...more] = onDecide(kernel);
  assert.equal(more.length, 0, 'one poll is one question');
  assert.equal(asked!.body.install, 'feed-kiln-stats');
  const doc = asked!.body.doc!;
  assert.equal(doc.pack, 'feed-kiln-stats');
  assert.equal(doc.title, 'Numbers from stats.kiln.example');
  /* ANY RECORD WITH A READINGS LIST, not only a founder's: the old poll required the Founder use case. */
  assert.deepEqual((doc.requires as { packs: unknown }).packs, {});
  const [poll] = doc.declarations as { ingest: string; project?: string; map: { name: { value: string }; thing?: { value: string } }[] }[];
  assert.equal(poll!.ingest, 'feed_kiln_stats');
  const kiln = value<{ rows: { id: string; fields: { name: string } }[] }>(kernel.list({ register: 'things' })).rows.find((r) => r.fields.name === 'Kiln')!;
  assert.equal(poll!.project, kiln.id, 'the poll runs for the project this import wrote');
  assert.deepEqual(
    poll!.map.map((m) => [m.name.value, m.thing?.value]),
    [
      ['Active users', kiln.id],
      ['Monthly revenue', kiln.id],
    ],
  );
  /* AND THE RECORD WOULD TAKE IT: each declaration as `install` reads it after the owner's yes. */
  const read = await normalise(doc, { kind: 'local' });
  assert.ok(read.ok, read.ok ? '' : JSON.stringify(read));
  for (const d of (read.value as { declarations: Parameters<typeof validateDeclaration>[0][] }).declarations) assert.equal(validateDeclaration(d), null);

  const again = await applyPlan(plan([POLL]), door, { dryRun: false });
  assert.deepEqual(again.polls, { filed: 0, before: 1 });
  assert.equal(onDecide(kernel).length, 1, 'the same poll asked twice');
  sql.close();
});

test('A RECORD THAT HOLDS THE OLD poll-<id> IS NOT ASKED THE SAME POLL AGAIN under its new name', async () => {
  const { sql, kernel } = await record();
  /* WHAT AN IMPORT BEFORE THE LIVE FEED FILED: its own pack, named `poll-<id>`, for the same address. */
  const old = {
    pack: 'poll-kiln-stats',
    version: '1.0.0',
    summary: 'Polls stats.kiln.example every 1h for Active users, Monthly revenue.',
    author: 'BrainDog',
    license: 'MIT',
    requires: { format: 1, primitives: 1, packs: {} },
    declarations: [
      {
        ingest: 'poll_kiln_stats',
        channel: 'poll',
        url: POLL.url,
        every: '1h',
        map: [{ name: { value: 'Active users' }, value: { path: 'data.users', type: 'int' }, source: { value: 'polled' }, at: { arrived: true } }],
        writes: { register: 'datapoints' },
      },
    ],
  };
  const filed = value<{ id: string }>(kernel.propose({ question: 'Poll stats.kiln.example every 1h for Active users?', body_kind: 'pack', body: { install: 'poll-kiln-stats', doc: old } } as never, ACTOR));

  const run = await applyPlan(plan([POLL]), doorOf(kernel), { dryRun: false });
  assert.deepEqual(run.refused, []);
  assert.deepEqual(run.polls, { filed: 0, before: 1 });
  assert.deepEqual(
    onDecide(kernel).map((s) => s.body.install),
    ['poll-kiln-stats'],
    'a poll proposed twice, once under each name',
  );

  /* AND ONCE HE HAS SAID YES TO IT, the answered question is the one that must not come back under the new name. */
  value(kernel.decide(filed.id, { decide: { option: 'accept', reason: 'It is the Kiln numbers.' } }, ACTOR));
  const after = await applyPlan(plan([POLL]), doorOf(kernel), { dryRun: false });
  assert.deepEqual(after.polls, { filed: 0, before: 1 });
  assert.deepEqual(
    onDecide(kernel).map((s) => [s.body.install, s.status]),
    [['poll-kiln-stats', 'resolved']],
  );
  sql.close();
});

test("A POLL THE FILL REFUSES IS SAID IN THE FILL'S OWN SENTENCE, and nothing is filed for it", async () => {
  const { sql, kernel } = await record();
  const plain = { ...POLL, key: 'tallybook:poll:plain', label: 'Plain stats', id: 'plain-stats', url: 'http://stats.kiln.example/v1/numbers' };
  const run = await applyPlan(plan([plain, POLL]), doorOf(kernel), { dryRun: false });
  assert.deepEqual(run.polls, { filed: 1, before: 0 });
  assert.deepEqual(run.refused, [{ label: 'Plain stats', register: 'Decide', fix: 'http://stats.kiln.example/v1/numbers is not an https:// address, and the host sends nothing to any other.' }]);
  assert.deepEqual(
    onDecide(kernel).map((s) => s.body.install),
    ['feed-kiln-stats'],
  );
  sql.close();
});

test('A DRY RUN COUNTS THE POLL IT WOULD FILE and files nothing', async () => {
  const { sql, kernel } = await record();
  const run = await applyPlan(plan([POLL]), doorOf(kernel), { dryRun: true });
  assert.deepEqual(run.polls, { filed: 1, before: 0 });
  assert.equal(onDecide(kernel).length, 0);
  sql.close();
});
