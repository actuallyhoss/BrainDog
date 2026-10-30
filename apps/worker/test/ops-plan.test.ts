/**
 * The operator's gift door (`ops-plan.ts`): no key is no door, a wrong key is a 401 that names the
 * header, a gift writes a `comp` row with no customer and moves the plan, taking it back returns a record that fits
 * to Free with no row, and a record with two people, or one that pays through Stripe, is refused in one sentence.
 *
 * OVER FAKES of the Directory's billing group and plans, which keep what they were told, so each test reads back what
 * the Directory would answer. Every value is invented.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Refusal, Result } from '@braindog/ports';
import { createDirectory } from '@braindog/record/directory';
import type { MeteredPlan } from '../src/billing.ts';
import { PAYS_FIX, opsPlan, type GiftCall, type GiftRow, type OpsPlanDeps } from '../src/ops-plan.ts';
import { openSqlite } from '../../../packages/kernel/test/sqlite.ts';

const KEY = 'operator-key-made-up-for-this-test';
const ENV = { PROVISION_KEY: KEY };

type Rec = { record: string; slug: string; owner: string; people: number; plan: MeteredPlan };

/** A Directory of the records handed in, with the billing rows and plans it was told. */
function world(recs: Rec[], rows: GiftRow[] = []) {
  const byId = new Map(recs.map((r) => [r.record, r]));
  const billed = new Map(rows.map((r) => [r.record, r]));
  const told: string[] = [];
  const deps: OpsPlanDeps = {
    find: async (name) => {
      const r = recs.find((x) => x.slug === name || x.record === name);
      return r === undefined ? null : { record: r.record, owner: r.owner };
    },
    billing: (async (call: GiftCall) => {
      told.push(call.op);
      if (call.op === 'of') return billed.get(call.record) ?? null;
      if (call.op === 'set') {
        billed.set(call.row.record, { record: call.row.record, person: call.row.person, customer: call.row.customer, subscription: null, state: call.row.state });
        return { ok: true, value: billed.get(call.row.record) };
      }
      if (billed.get(call.record)?.state !== 'comp') return { ok: false, refusal: { code: 'OUT_OF_BOUNDS', fix: 'no gift' } };
      billed.delete(call.record);
      return { ok: true, value: null };
    }) as OpsPlanDeps['billing'],
    setPlan: async (record, plan): Promise<Refusal | null> => {
      const r = byId.get(record);
      if (r === undefined) return { code: 'OUT_OF_BOUNDS', fix: 'no record' };
      r.plan = plan;
      return null;
    },
    people: async (record) => byId.get(record)?.people ?? null,
    owned: async (person) => ({
      ok: true,
      value: recs.filter((r) => r.owner === person).map((r) => ({ record: r.record, slug: r.slug, plan: r.plan, closed: false })) as never,
    }),
  };
  return { deps, billed, byId, told };
}

const ask = (body: unknown, key: string | null = KEY): Request =>
  new Request('https://brain.example/account/ops/plan', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(key !== null ? { authorization: `Bearer ${key}` } : {}) },
    body: JSON.stringify(body),
  });

const read = async (res: Response) => (await res.json()) as { ok: boolean; value?: Record<string, unknown>; refusal?: Refusal };

const LONE: Rec = { record: 'rec_tidepool', slug: 'tidepool', owner: 'per_wren', people: 1, plan: 'free' };

test('NO OPERATOR KEY IS NO DOOR: 404, and nothing is asked of the Directory', async () => {
  const w = world([{ ...LONE }]);
  const res = await opsPlan(ask({ record: 'tidepool', plan: 'plus' }), {}, w.deps);
  assert.equal(res.status, 404);
  assert.equal((await read(res)).refusal?.code, 'ROUTE_UNKNOWN');
  assert.deepEqual(w.told, []);
});

test('A WRONG KEY, OR NONE, IS A 401 THAT NAMES THE HEADER, and never says the key', async () => {
  const w = world([{ ...LONE }]);
  for (const key of ['not-the-key', null]) {
    const res = await opsPlan(ask({ record: 'tidepool', plan: 'plus' }, key), ENV, w.deps);
    assert.equal(res.status, 401);
    const text = await res.text();
    assert.equal((JSON.parse(text) as { refusal: Refusal }).refusal.at, 'authorization');
    assert.ok(!text.includes(KEY));
  }
  assert.deepEqual(w.told, []);
});

test('ONLY JSON, AND ONLY A KNOWN PLAN', async () => {
  const w = world([{ ...LONE }]);
  const plain = new Request('https://brain.example/account/ops/plan', { method: 'POST', headers: { authorization: `Bearer ${KEY}` }, body: 'plus' });
  assert.equal((await read(await opsPlan(plain, ENV, w.deps))).refusal?.code, 'BODY_MALFORMED');
  assert.equal((await read(await opsPlan(ask({ record: 'tidepool', plan: 'gold' }), ENV, w.deps))).refusal?.at, 'plan');
  assert.equal((await read(await opsPlan(ask({ record: 'nowhere', plan: 'plus' }), ENV, w.deps))).refusal?.at, 'record');
  const get = await opsPlan(new Request('https://brain.example/account/ops/plan', { headers: { authorization: `Bearer ${KEY}` } }), ENV, w.deps);
  assert.equal(get.status, 405);
});

test('PLUS GIVEN: the row is comp with no customer, and the Directory meters the record on plus', async () => {
  const w = world([{ ...LONE }]);
  const res = await opsPlan(ask({ record: 'tidepool', plan: 'plus', note: 'a thank-you for the bug reports' }), ENV, w.deps);
  assert.equal(res.status, 200);
  assert.deepEqual((await read(res)).value, { record: 'tidepool', plan: 'plus', gift: true });
  assert.deepEqual(w.billed.get('rec_tidepool'), { record: 'rec_tidepool', person: 'per_wren', customer: '', subscription: null, state: 'comp' });
  assert.equal(w.byId.get('rec_tidepool')?.plan, 'plus');
});

test('TAKEN BACK: one person on it, so it is on Free with no billing row at all', async () => {
  const w = world([{ ...LONE }]);
  await opsPlan(ask({ record: 'tidepool', plan: 'hosted' }), ENV, w.deps);
  const res = await opsPlan(ask({ record: 'tidepool', plan: null }), ENV, w.deps);
  assert.equal(res.status, 200);
  assert.deepEqual((await read(res)).value, { record: 'tidepool', plan: 'free', gift: false });
  assert.equal(w.billed.has('rec_tidepool'), false);
  assert.equal(w.byId.get('rec_tidepool')?.plan, 'free');
});

test('TWO PEOPLE ON IT: taking the gift back is refused in one sentence, and the gift stands', async () => {
  const w = world([{ ...LONE, people: 2 }]);
  await opsPlan(ask({ record: 'tidepool', plan: 'plus' }), ENV, w.deps);
  const out = await read(await opsPlan(ask({ record: 'tidepool', plan: null }), ENV, w.deps));
  assert.equal(out.ok, false);
  assert.equal(out.refusal?.fix, 'Free is for one person and this BrainDog has 2, so it keeps its gift until it has one.');
  assert.equal(w.billed.get('rec_tidepool')?.state, 'comp');
  assert.equal(w.byId.get('rec_tidepool')?.plan, 'plus');
});

test('AN OWNER WITH ANOTHER FREE RECORD keeps the gift too, as a cancel would', async () => {
  const w = world([{ ...LONE }, { record: 'rec_saltmarsh', slug: 'saltmarsh', owner: 'per_wren', people: 1, plan: 'free' }]);
  await opsPlan(ask({ record: 'tidepool', plan: 'plus' }), ENV, w.deps);
  const out = await read(await opsPlan(ask({ record: 'tidepool', plan: null }), ENV, w.deps));
  assert.equal(out.refusal?.code, 'OUT_OF_BOUNDS');
  assert.equal(w.billed.get('rec_tidepool')?.state, 'comp');
});

test('A RECORD THAT PAYS THROUGH STRIPE IS REFUSED, and its row and plan are left alone', async () => {
  const paying: GiftRow = { record: 'rec_tidepool', person: 'per_wren', customer: 'cus_test_made_up', subscription: 'sub_test_made_up', state: 'active' };
  const w = world([{ ...LONE, plan: 'hosted' }], [paying]);
  for (const plan of ['plus', null]) {
    const out = await read(await opsPlan(ask({ record: 'tidepool', plan }), ENV, w.deps));
    assert.equal(out.refusal?.fix, PAYS_FIX);
  }
  assert.deepEqual(w.billed.get('rec_tidepool'), paying);
  assert.equal(w.byId.get('rec_tidepool')?.plan, 'hosted');
  assert.ok(!w.told.includes('set') && !w.told.includes('unbill'));
});

test('A RECORD WITH NO GIFT HAS NOTHING TO TAKE BACK', async () => {
  const w = world([{ ...LONE }]);
  const out = await read(await opsPlan(ask({ record: 'tidepool', plan: null }), ENV, w.deps));
  assert.equal(out.refusal?.fix, 'This BrainDog has no gift to take back.');
  assert.equal(w.byId.get('rec_tidepool')?.plan, 'free');
});

test('A DIRECTORY THAT CANNOT UNBILL: its own refusal is said, and one that knows no unbill is NOT_IN_THIS_BUILD', async () => {
  for (const [answer, code] of [
    [{ ok: false, refusal: { code: 'RECORD_UNAVAILABLE', fix: 'The Directory is busy.' } }, 'RECORD_UNAVAILABLE'],
    [undefined, 'NOT_IN_THIS_BUILD'],
  ] as const) {
    const w = world([{ ...LONE }]);
    await opsPlan(ask({ record: 'tidepool', plan: 'plus' }), ENV, w.deps);
    const billing = w.deps.billing;
    w.deps.billing = (async (call: GiftCall) => (call.op === 'unbill' ? answer : billing(call))) as OpsPlanDeps['billing'];
    const out = await read(await opsPlan(ask({ record: 'tidepool', plan: null }), ENV, w.deps));
    assert.equal(out.refusal?.code, code);
    assert.equal(w.billed.get('rec_tidepool')?.state, 'comp', 'the gift is still marked, so asking again finishes it');
  }
});

test('OVER THE REAL DIRECTORY: the gift is a comp row with no customer, metered on plus, never due, and taken back to no row', async () => {
  const sql = openSqlite();
  const NOW = Date.UTC(2026, 9, 14, 9);
  const d = createDirectory(sql, { now: () => NOW });
  d.person$('wren@example.test', 'Wren');
  const made = d.provision({ slug: 'tidepool', email: 'wren@example.test' }) as Result<{ record: string; person: string }>;
  assert.ok(made.ok);
  const { record, person } = made.value;
  const planOf = () => sql.one<{ plan: string }>('SELECT plan FROM dir_record WHERE id = ?', record)?.plan;
  const deps: OpsPlanDeps = {
    find: async (name) => {
      const named = d.resolve(name);
      const owner = named ? sql.one<{ owner: string }>('SELECT owner FROM dir_record WHERE id = ?', named.record)?.owner : undefined;
      return named && owner ? { record: named.record, owner } : null;
    },
    billing: (async (call: GiftCall) => d.billing(call)) as OpsPlanDeps['billing'],
    setPlan: async (r, plan) => {
      const out = d.setPlan(r, plan);
      return out.ok ? null : 'refusal' in out ? out.refusal : { code: 'RECORD_UNAVAILABLE', fix: 'The plan was not set.' };
    },
    people: async () => 1,
    owned: async (p) => {
      const used = d.usage(p, { from: '2026-10-14', to: '2026-10-14' });
      return used.ok ? { ok: true, value: used.value.records } : used;
    },
  };

  const given = await read(await opsPlan(ask({ record: 'tidepool', plan: 'plus' }), ENV, deps));
  assert.deepEqual(given.value, { record: 'tidepool', plan: 'plus', gift: true });
  const row = d.billing({ op: 'of', record });
  assert.equal(row?.state, 'comp');
  assert.equal(row?.customer, '');
  assert.equal(row?.subscription, null);
  assert.equal(row?.person, person);
  assert.equal(planOf(), 'plus');
  assert.deepEqual(d.billing({ op: 'due', now: NOW + 400 * 86_400_000 }), [], 'a gift came due on the ladder');
  assert.deepEqual(d.billing({ op: 'byCustomer', customer: '' }), [], 'a gift was found by an empty customer');

  const back = await read(await opsPlan(ask({ record: 'tidepool', plan: null }), ENV, deps));
  assert.deepEqual(back.value, { record: 'tidepool', plan: 'free', gift: false });
  assert.equal(d.billing({ op: 'of', record }), null);
  assert.equal(planOf(), 'free');
  sql.close();
});
