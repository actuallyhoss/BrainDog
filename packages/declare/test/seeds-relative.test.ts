/**
 * Example rows that count their days from install day and point at each other (SHL-A09).
 *
 * BOTH WERE DONE BY CODE AFTER THE INSTALL. A seed held a day written on the day its author wrote it, so an example
 * "due next week" was late on every record that installed it a month on, and a function moved the days afterwards. A
 * seed carried no link either, so a second function made them from titles once the rows were in. The file says both
 * now: `{ "day": "+3" }` is three days on from install day, and `{ "ref": "<local key>" }` is the row another seed of
 * this file made, by the `key` that seed gives itself. A row a seed points at is written before the row that points at
 * it, so every row is written once, in its final state, and nothing moves it after.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '../src/index.ts';
import { openRecord, type Kernel } from '@braindog/kernel';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 12);
const TODAY = '2026-10-09';

type Row = { id: string; version?: number; fields: Record<string, unknown> };
type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };
const value = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};
const refusal = (r: unknown): NonNullable<Out['refusal']> => {
  const x = r as Out;
  assert.equal(x.ok, false, 'this file should have been refused');
  return x.refusal!;
};

const DOC = (seeds: unknown[]): Record<string, unknown> => ({
  pack: 'sample-visits',
  version: '1.0.0',
  summary: 'A made-up visits add-on for tests.',
  author: 'Test Author',
  license: 'MIT',
  requires: { format: 1, primitives: 1, packs: {} },
  declarations: [
    { register: 'places', name: 'Places', one: 'place', title: 'what', fields: [{ id: 'what', type: 'text' }, { id: 'tags', type: 'list', of: 'text' }] },
    {
      register: 'visits',
      name: 'Visits',
      one: 'visit',
      title: 'what',
      fields: [
        { id: 'what', type: 'text' },
        { id: 'due', type: 'day' },
        { id: 'place', type: 'ref', to: 'places' },
        { id: 'tags', type: 'list', of: 'text' },
      ],
    },
  ],
  seeds,
});

/* THE VISIT IS WRITTEN FIRST IN THE FILE AND POINTS AT A PLACE WRITTEN AFTER IT, which is the order a person writes. */
const THREE = [
  { register: 'visits', fields: { what: 'See the surveyor', due: { day: '+3' }, place: { ref: 'yard' }, tags: ['example'] } },
  { register: 'places', key: 'yard', fields: { what: 'The yard', tags: ['example'] } },
  { register: 'visits', fields: { what: 'Last inspection', due: { day: '-2' }, tags: ['example'] } },
];

const hostFor = (k: Kernel, writes: string[], today: string | undefined = TODAY): Host => ({
  count: (register) => k.count(register),
  stage: (batch) => k.stageInstall(batch as never),
  transaction: (fn) => k.transaction(fn),
  reload: () => k.reload(),
  retire: (ids) => k.retire(ids),
  seed: (register, fields) => {
    writes.push(register);
    return k.create(register, fields as never, { actor: 'p_seed', cascade: false }) as never;
  },
  remember: (row) => k.rememberPack(row),
  forget: (id) => k.forgetPack(id),
  claimed: (pack) => k.packClaims(pack),
  ...(today === undefined ? {} : { today: () => today }),
});

const stateOf = (k: Kernel): Installed => ({
  format: 1,
  primitives: 1,
  record_version: k.version(),
  packs: k.packs(),
  declarations: k.declarations() as Installed['declarations'],
  rows: k.census(),
  config: k.packSettings(),
});

async function installed(seeds: unknown[], today?: string): Promise<{ k: Kernel; writes: string[]; pack: Pack }> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const pack = value<Pack>(await normalise(DOC(seeds), { kind: 'local' }));
  const diff = await plan(pack, stateOf(k));
  const writes: string[] = [];
  value(await install(pack, diff, hostFor(k, writes, today), diff.planHash));
  return { k, writes, pack };
}

const rowsOf = (k: Kernel, register: string): Row[] => value<{ rows: Row[] }>(k.list({ register })).rows;

test('THREE SEEDS, ONE DATED "+3" AND LINKED TO ANOTHER: the row shows the day three days on and opens its linked row', async () => {
  const { k } = await installed(THREE);
  const yard = rowsOf(k, 'places')[0]!;
  const visit = rowsOf(k, 'visits').find((r) => r.fields.what === 'See the surveyor')!;
  assert.equal(visit.fields.due, '2026-10-12');
  assert.equal(visit.fields.place, yard.id);
  assert.equal((k.get(visit.fields.place as string) as unknown as Row).fields.what, 'The yard');
  assert.equal(rowsOf(k, 'visits').find((r) => r.fields.what === 'Last inspection')!.fields.due, '2026-10-07');
});

test('ROWS ARE SEEDED IN THEIR FINAL STATE: each is written once, the row pointed at before the row that points', async () => {
  const { k, writes } = await installed(THREE);
  assert.deepEqual(writes, ['places', 'visits', 'visits']);
  /* NOTHING MOVED THEM AFTER: every example row is still at the version its one write gave it. */
  const versions = [...rowsOf(k, 'places'), ...rowsOf(k, 'visits')].map((r) => r.version);
  assert.equal(new Set(versions).size, 1, JSON.stringify(versions));
});

test('THE DAY COUNTS FROM INSTALL DAY, whichever day that is, and across a month end', async () => {
  const { k } = await installed([{ register: 'visits', fields: { what: 'Month end', due: { day: '+3' }, tags: ['example'] } }], '2027-02-27');
  assert.equal(rowsOf(k, 'visits')[0]!.fields.due, '2027-03-02');
  const zero = await installed([{ register: 'visits', fields: { what: 'Today', due: { day: '+0' }, tags: ['example'] } }]);
  assert.equal(rowsOf(zero.k, 'visits')[0]!.fields.due, TODAY);
});

test('THE FILE IS HELD TO ITS OWN KEYS AND FIELDS where it is read', async () => {
  const nobody = refusal(await normalise(DOC([{ register: 'visits', fields: { what: 'Lost', place: { ref: 'nowhere' }, tags: ['example'] } }])));
  assert.deepEqual([nobody.code, nobody.at], ['FIELD_UNKNOWN', 'seeds.visits.place']);

  const twice = refusal(await normalise(DOC([{ register: 'places', key: 'yard', fields: { what: 'A', tags: ['example'] } }, { register: 'places', key: 'yard', fields: { what: 'B', tags: ['example'] } }])));
  assert.deepEqual([twice.code, twice.at], ['PACK_MALFORMED', 'seeds.places.key']);

  const wrongDay = refusal(await normalise(DOC([{ register: 'visits', fields: { what: 'Soon', due: { day: 'next week' }, tags: ['example'] } }])));
  assert.deepEqual([wrongDay.code, wrongDay.at], ['VALUE_MALFORMED', 'seeds.visits.due']);

  const notADay = refusal(await normalise(DOC([{ register: 'visits', fields: { what: { day: '+3' }, tags: ['example'] } }])));
  assert.deepEqual([notADay.code, notADay.at], ['VALUE_MALFORMED', 'seeds.visits.what']);

  const wrongList = refusal(
    await normalise(DOC([{ register: 'visits', key: 'first', fields: { what: 'One', tags: ['example'] } }, { register: 'visits', fields: { what: 'Two', place: { ref: 'first' }, tags: ['example'] } }])),
  );
  assert.deepEqual([wrongList.code, wrongList.at], ['VALUE_MALFORMED', 'seeds.visits.place']);
});

test('TWO EXAMPLE ROWS THAT POINT AT EACH OTHER ARE REFUSED, because neither could be written in its final state', async () => {
  const doc = DOC([]);
  ((doc.declarations as { fields: unknown[] }[])[0]!.fields as unknown[]).push({ id: 'last', type: 'ref', to: 'visits' });
  doc.seeds = [
    { register: 'places', key: 'yard', fields: { what: 'The yard', last: { ref: 'call' }, tags: ['example'] } },
    { register: 'visits', key: 'call', fields: { what: 'A call', place: { ref: 'yard' }, tags: ['example'] } },
  ];
  const loop = refusal(await normalise(doc));
  assert.equal(loop.code, 'PACK_MALFORMED');
  assert.match(loop.fix, /point at each other/);
});

test('A SEED WITH NEITHER reads and installs as it always did, and a key changes nothing a row holds', async () => {
  const { k } = await installed([{ register: 'places', key: 'yard', fields: { what: 'The yard', tags: ['example'] } }]);
  assert.deepEqual(Object.keys(rowsOf(k, 'places')[0]!.fields).sort(), ['tags', 'what']);
});
