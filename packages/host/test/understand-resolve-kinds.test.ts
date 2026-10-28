/**
 * The host's half for the other pairs: an `infer.resolve` job now holds two organisations or two
 * projects beside the people, each with its kind. The model reads each side's kind as the kernel queued it, a verdict on
 * a pair of organisations is kept and acked as any other, an answer about a handle it was not handed is dropped, and a
 * side of another kind than its pair is never one. Every model here is the fake adapter: no key, nothing sent. The gate
 * before any of it, a model and his switch for background reading (`model-jobs.ts` `allowed`, `infer.ts` `mayThink`),
 * is unchanged and has its own tests (`may-think.test.ts`): with no model, `infer.resolve` waits and the tile is as before.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { no } from '@braindog/ports';
import { openRecord, type Declaration, type OutboxRow } from '@braindog/kernel';
import type { CallContext } from '@braindog/record';

import { settleResolve, SLASH_RESOLVE_INSTRUCTIONS, type ResolveInput } from '../src/understand.ts';
import { methods as namedTwiceMethods, type NamedTwice } from '../../record/src/methods/named-twice.ts';
import type { RecordDeps } from '../../record/src/methods/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { COMPANIES } from '../../../fixtures/names.ts';

const T0 = Date.UTC(2026, 9, 15, 2, 30);

const job = (id: string, payload: unknown): OutboxRow => ({ id, kind: 'infer.resolve' as OutboxRow['kind'], payload: JSON.stringify(payload), attempts: 0, leasedUntil: '2026-10-15T03:00:00.000Z' });

const PAIRS = [
  { hash: 'h-person', kind: 'person', a: { name: 'Mara Okafor', kind: 'person', seen: ['Copperleaf'] }, b: { name: 'Mara O', kind: 'person', seen: [] } },
  { hash: 'h-org', kind: 'organisation', a: { name: 'Lanternfish', kind: 'organisation', seen: [] }, b: { name: 'Lanternfish', kind: 'organisation', seen: [] } },
  { hash: 'h-project', kind: 'project', a: { name: 'Northbank', kind: 'project', seen: ['tied to Harbour Mill'] }, b: { name: 'North Bank', kind: 'project', seen: ['named 3 times in the work, with nothing else said of it'] } },
  /* A pair that says it is of organisations, with a side that is a person: never one, and never shown. */
  { hash: 'h-odd', kind: 'organisation', a: { name: 'Orchardline', kind: 'organisation', seen: [] }, b: { name: 'Orchardline Duarte', kind: 'person', seen: [] } },
];

/** The fake adapter: what it was handed, and the verdicts it says, by the handles it was given or any other. */
const fake = (asked: ResolveInput[], verdicts: Record<string, number>) => async (input: ResolveInput) => (asked.push(input), { ok: true as const, value: { verdicts } });

test('AN ORGANISATION PAIR IS SHOWN WITH ITS KIND AND ITS VERDICT KEPT; a handle not handed out is dropped', async () => {
  const asked: ResolveInput[] = [];
  /* p4 was never handed out, and the record's own hash is not a handle: the model's word about either is nobody's. */
  const out = await settleResolve(fake(asked, { p1: 0.3, p2: 0.12, p3: 0.93, p4: 1, 'h-org': 1 }), job('J1', { pairs: PAIRS }), openSqlite(), T0, () => {});

  assert.equal(asked.length, 1);
  assert.deepEqual(asked[0]!.pairs.map((p) => [p.id, p.a.kind, p.b.kind, p.a.name]), [
    ['p1', 'person', 'person', 'Mara Okafor'],
    ['p2', 'organisation', 'organisation', 'Lanternfish'],
    ['p3', 'project', 'project', 'Northbank'],
  ]);
  assert.deepEqual(asked[0]!.pairs[2]!.b.seen, ['named 3 times in the work, with nothing else said of it']);
  assert.ok(!JSON.stringify(asked[0]).includes('h-'), "the record's hashes went to the model");
  assert.deepEqual(out, {
    state: 'done',
    result: {
      verdicts: [
        { hash: 'h-odd', same: false, confidence: 0 },
        { hash: 'h-person', same: false, confidence: 0.3 },
        { hash: 'h-org', same: false, confidence: 0.12 },
        { hash: 'h-project', same: true, confidence: 0.93 },
      ],
    },
  });
});

test('WHAT IS SAID OF AN ORGANISATION PAIR IS KEPT, and answered again from the cache with no ask', async () => {
  const store = openSqlite();
  const asked: ResolveInput[] = [];
  await settleResolve(fake(asked, { p1: 0.97 }), job('J1', { pairs: [PAIRS[1]] }), store, T0, () => {});
  const again = await settleResolve(fake(asked, {}), job('J2', { pairs: [PAIRS[1]] }), store, T0 + 86_400_000, () => {});
  assert.equal(asked.length, 1, 'the cache did not answer the second night');
  assert.deepEqual(again, { state: 'done', result: { verdicts: [{ hash: 'h-org', same: true, confidence: 0.97 }] } });
});

test('A PAIR OF ORGANISATIONS FROM AN OLDER JOB, NAMING NO KIND, is read by its sides as before', async () => {
  const asked: ResolveInput[] = [];
  const older = { hash: 'h-org', a: PAIRS[1]!.a, b: PAIRS[1]!.b };
  const out = await settleResolve(fake(asked, { p1: 0.61 }), job('J1', { pairs: [older] }), openSqlite(), T0, () => {});
  assert.deepEqual(asked[0]!.pairs.map((p) => [p.a.kind, p.b.kind]), [['organisation', 'organisation']]);
  assert.deepEqual(out, { state: 'done', result: { verdicts: [{ hash: 'h-org', same: true, confidence: 0.61 }] } });
});

test('THE MODEL IS TOLD A SIDE MAY BE A PROJECT, and that two of one name may still be two', () => {
  assert.match(SLASH_RESOLVE_INSTRUCTIONS, /person, organisation or project/u);
  assert.match(SLASH_RESOLVE_INSTRUCTIONS, /a client and a supplier/u);
  assert.doesNotMatch(SLASH_RESOLVE_INSTRUCTIONS, /—/u);
});

/* ── end to end, on the record's own kernel: the tile's read after a night ─────────────────────────────────────── */

const NOW = Date.UTC(2026, 9, 15, 12);
const OWNER: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const ORGS: Declaration = {
  id: 'register.organisations',
  kind: 'register',
  body: {
    id: 'organisations',
    name: 'Organisations',
    title: 'name',
    org: { name: 'name', domain: 'domain', keys: 'keys', merged_into: 'merged_into' },
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'domain', type: 'text' },
      { id: 'keys', type: 'list', of: 'text' },
      { id: 'merged_into', type: 'ref', to: 'organisations' },
    ],
  } as never,
};

/** A record with one list of organisations, and the tile's read over its kernel, as the record's door hands it. */
async function studio() {
  const sql = openSqlite();
  const kernel = await openRecord(sql, fixedClock(NOW));
  value(await kernel.install([ORGS]));
  const deps = { kernel, sql, guard: () => null, scoped: () => null, readable: () => null, no, tail: async <T>(o: T) => o, clock: fixedClock(NOW) } as unknown as RecordDeps;
  const { namedTwice } = namedTwiceMethods(deps);
  const add = (fields: Record<string, unknown>) => value(kernel.create('organisations', fields as never, { actor: 'p_1' }));
  const offers = async () => value<NamedTwice>(await namedTwice(undefined, OWNER)).pairs;
  return { kernel, sql, add, offers };
}

test('AFTER A NIGHT, THE TILE SAYS WHAT SLASH READ: one it read as one comes first with its sentence, one it read as two is gone, nothing is asked', async () => {
  const { kernel, sql, add, offers } = await studio();
  const [orchard, bright] = [COMPANIES[3], COMPANIES[0]];
  add({ name: bright });
  add({ name: bright });
  add({ name: `${orchard} Ltd` });
  add({ name: orchard });
  assert.deepEqual((await offers()).map((p) => [p.a.name, p.judged ?? null, p.reading ?? null]), [[bright, null, null], [`${orchard} Ltd`, null, null]]);

  kernel.purge();
  const [leased] = kernel.leaseOutbox(['infer.resolve'], 5);
  assert.ok(leased, 'no infer.resolve job was queued');
  const pairs = (JSON.parse(leased.payload) as { pairs: { hash: string; kind: string; a: { name: string } }[] }).pairs;
  assert.deepEqual(pairs.map((p) => p.kind), ['organisation', 'organisation']);
  const hash = (name: string) => pairs.find((p) => p.a.name === name)!.hash;
  value(
    kernel.ackOutbox({
      id: leased.id,
      state: 'done',
      leasedUntil: leased.leasedUntil,
      result: { verdicts: [{ hash: hash(bright), same: false, confidence: 0.08 }, { hash: hash(`${orchard} Ltd`), same: true, confidence: 0.96 }] },
    } as never),
  );

  const after = await offers();
  assert.equal(after.length, 1, JSON.stringify(after));
  assert.deepEqual([after[0]!.a.name, after[0]!.judged, after[0]!.reading, after[0]!.can], [`${orchard} Ltd`, 0.96, 'Slash reads these as one.', true]);
  assert.match(after[0]!.evidence, /read as one name/u);
  assert.equal(sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM suggestion')!.n, 0, 'a verdict filed a question by itself');
  sql.close();
});
