/**
 * Subscriptions: a Repeating line marked as a subscription, what they cost a month and a year, and the old price kept
 * when the amount changes. Every name and amount here is invented.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { scriptReads, scriptRunner } from '../../packages/host/src/script.ts';
import { createRecordApi, type CallContext } from '../../packages/record/src/index.ts';
import { fixedClock, openSqlite } from '../../packages/kernel/test/sqlite.ts';
import { runInQuickJs } from '../../packages/script/src/quickjs.ts';
import { firstPartyDocument } from '../../packages/seed/src/index.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const NOW = Date.UTC(2026, 9, 26, 9);

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };
const said = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};
type Api = Awaited<ReturnType<typeof createRecordApi>>;
type Body = Record<string, unknown>;
type Reading = { value: number | null; unit?: string | null; refusals: unknown[] };
type Block = { kind: string; heading?: string; drawn?: boolean; refusals: unknown[]; rows?: { fields: Body }[] };

const FILE = new URL('./subscriptions.pack.json', import.meta.url);
const shipped = (): Body & { declarations: Body[]; extends: Body } => JSON.parse(readFileSync(FILE, 'utf8')) as never;

async function put(api: Api, doc: unknown): Promise<void> {
  const diff = said<{ diff: { planHash: string; approve: unknown[] } }>(await api.planPack({ doc, source: { kind: 'local' } } as never, owner)).diff;
  said(await api.installPack({ doc, source: { kind: 'local' }, planHash: diff.planHash, approve: diff.approve } as never, owner));
}

async function fresh(withPack = true): Promise<{ api: Api; close: () => void }> {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  for (const id of ['portfolio', 'people', 'money-core']) await put(api, firstPartyDocument(id, { seeds: [] }));
  if (withPack) await put(api, shipped());
  return { api, close: () => sql.close() };
}

async function settle(api: Api): Promise<void> {
  const refuse = async (): Promise<never> => {
    throw new Error('subscriptions fetch nothing');
  };
  const run = scriptRunner({ run: runInQuickJs, send: refuse, pin: refuse, openKey: refuse, grantOf: () => null, reads: scriptReads(api), now: () => NOW } as never);
  for (let i = 0; i < 3; i++) {
    await api.kernel.drain();
    const ran = (await api.kernel.runActions(refuse as never, { script: run, limit: 50 })) as { refused: number; failed: number };
    assert.deepEqual([ran.refused, ran.failed], [0, 0], 'a run was refused or failed ' + JSON.stringify(ran));
  }
}

const make = (api: Api, list: string, fields: Body): string => said<{ id: string }>(api.kernel.create(list, fields as never, { actor: 'p_1' })).id;
const fieldsOf = (api: Api, id: string): Body => api.kernel.get(id as never)!.fields as Body;
const gbp = (amount: number) => ({ amount, currency: 'GBP' });
const metric = async (api: Api, id: string): Promise<Reading> => said<Reading>(await api.metric({ metric: id }, owner));

test('THE FILE: subscriptions 1.0.0 on money-core, fields laid on Repeating, one rule and its script, one page', () => {
  const doc = shipped();
  assert.deepEqual([doc.pack, doc.version, doc.license], ['subscriptions', '1.3.0', 'Apache-2.0']);
  const kinds = (k: string) => doc.declarations.filter((d) => k in d).map((d) => d[k]);
  assert.deepEqual(kinds('register'), []);
  assert.deepEqual(kinds('page'), ['subscriptions']);
  assert.deepEqual(kinds('rule'), ['subscriptions_price']);
  const script = doc.declarations.find((d) => d.script === 'subscriptions_price')!;
  assert.equal(script.source, readFileSync(new URL('./price.js', import.meta.url), 'utf8'), 'the pack file and price.js disagree');
  const added = (doc.extends['register.recurring'] as { fields: Body[] }).fields.map((f) => f.id);
  assert.deepEqual(added, ['subscription', 'trial_ends', 'cancel_by', 'cancel_how', 'used', 'price_was', 'price_up_on', 'price_seen']);
  assert.ok(String(doc.changes).length <= 500);
});

test('BEFORE THE PACK: Repeating has no subscription field and there is no Subscriptions page', async () => {
  const { api, close } = await fresh(false);
  const recurring = api.kernel.register('recurring') as unknown as { fields: { id: string }[] };
  assert.ok(!recurring.fields.some((f) => f.id === 'subscription'));
  assert.ok(!api.kernel.declarations().some((d) => d.id === 'page.subscriptions'));
  close();
});

test('A MONTH AND A YEAR: only live subscriptions going out count, each by how often it comes round', async () => {
  const { api, close } = await fresh();
  const line = (what: string, amount: number, every: string, extra: Body = {}) =>
    make(api, 'recurring', { what, direction: 'out', amount: gbp(amount), every, next_due: '2026-11-03', subscription: true, ...extra });
  line('Film streaming', 1_200, 'monthly');
  line('Cloud photos', 12_000, 'yearly');
  line('Old magazine', 900, 'monthly', { state: 'ended' });
  make(api, 'recurring', { what: 'Rent', direction: 'out', amount: gbp(100_000), every: 'monthly', next_due: '2026-11-01' });
  await settle(api);
  assert.equal((await metric(api, 'subs-count')).value, 2);
  assert.equal((await metric(api, 'subs-month')).value, 1_200 + 1_000);
  assert.equal((await metric(api, 'subs-year')).value, 14_400 + 12_000);
  assert.equal((await metric(api, 'subs-renew-30d')).value, 2);
  close();
});

test('A PRICE THAT GOES UP keeps the old price and the day; one that goes down clears the day', async () => {
  const { api, close } = await fresh();
  const id = make(api, 'recurring', { what: 'Music', direction: 'out', amount: gbp(999), every: 'monthly', next_due: '2026-11-05', subscription: true });
  await settle(api);
  assert.deepEqual(fieldsOf(api, id).price_seen, gbp(999));
  said(api.kernel.update('recurring', id, { amount: gbp(1_199) } as never, { actor: 'p_1' }));
  await settle(api);
  assert.deepEqual([fieldsOf(api, id).price_was, fieldsOf(api, id).price_up_on], [gbp(999), '2026-10-26']);
  assert.equal((await metric(api, 'subs-price-up')).value, 1);
  said(api.kernel.update('recurring', id, { amount: gbp(1_099) } as never, { actor: 'p_1' }));
  await settle(api);
  assert.deepEqual(fieldsOf(api, id).price_was, gbp(1_199));
  assert.equal(fieldsOf(api, id).price_up_on ?? null, null);
  close();
});

test('THE PAGE draws with nothing refused, empty and full', async () => {
  const { api, close } = await fresh();
  const empty = said<{ blocks: Block[] }>(await api.page({ slug: 'subscriptions' }, owner));
  for (const b of empty.blocks) assert.deepEqual(b.refusals, [], `${b.heading ?? b.kind} was refused`);
  assert.equal(empty.blocks[0]!.kind, 'note');
  make(api, 'recurring', { what: 'Film streaming', direction: 'out', amount: gbp(1_200), every: 'monthly', next_due: '2026-11-03', subscription: true, trial_ends: '2026-10-30', used: 'hardly' });
  await settle(api);
  const page = said<{ blocks: Block[] }>(await api.page({ slug: 'subscriptions' }, owner));
  for (const b of page.blocks) assert.deepEqual(b.refusals, [], `${b.heading ?? b.kind} was refused`);
  const heads = page.blocks.map((b) => b.heading);
  for (const h of ['What they cost', 'Free trials ending', 'Hardly used', 'Every subscription']) assert.ok(heads.includes(h), `${h} is on the page: ${heads.join(', ')}`);
  close();
});

test('WITH NOTHING MARKED, THE PAGE LISTS THE REPEATING PAYMENTS TO TICK, and never points to Money watch (audit 31 Oct f, AF6)', async () => {
  const { api, close } = await fresh();
  make(api, 'recurring', { what: 'Newsletter sending', direction: 'out', amount: gbp(3_900), every: 'monthly', next_due: '2026-11-10' });
  make(api, 'recurring', { what: 'Retainer', direction: 'in', amount: gbp(300_000), every: 'monthly', next_due: '2026-11-01' });
  await settle(api);
  const page = said<{ blocks: (Block & { body?: string })[] }>(await api.page({ slug: 'subscriptions' }, owner));
  const drawn = page.blocks.filter((b) => b.drawn !== false);
  const offered = drawn.find((b) => b.heading === 'Repeating payments');
  assert.deepEqual((offered?.rows ?? []).map((r) => r.fields.what), ['Newsletter sending'], 'money going out, not yet marked');
  assert.ok(!JSON.stringify(page.blocks).includes('Money watch'));
  /* EACH ROW MARKED ON ITS OWN, ONE WRITE A ROW WITH ITS UNDO (polish-i, PI4), where each payment was opened one by one. */
  const pressed = (offered as { row_actions?: { verb: string; label: string; args?: Record<string, string>; undo?: boolean }[] } | undefined)?.row_actions ?? [];
  assert.deepEqual(
    pressed.map((a) => [a.verb, a.label, a.args?.field, a.undo]),
    [['row.update', 'Mark as a subscription', 'subscription', true]],
  );
  close();
});

test('ONCE ONE IS MARKED, THE REST STAY UNDER OTHER REPEATING PAYMENTS, each still marked on its own (polish-i, PI4)', async () => {
  const { api, close } = await fresh();
  make(api, 'recurring', { what: 'Newsletter sending', direction: 'out', amount: gbp(3_900), every: 'monthly', next_due: '2026-11-10', subscription: true });
  make(api, 'recurring', { what: 'Design suite', direction: 'out', amount: gbp(5_400), every: 'monthly', next_due: '2026-11-12' });
  await settle(api);
  const page = said<{ blocks: (Block & { row_actions?: unknown[] })[] }>(await api.page({ slug: 'subscriptions' }, owner));
  const drawn = page.blocks.filter((b) => b.drawn !== false);
  assert.ok(!drawn.some((b) => b.heading === 'Repeating payments'), 'the first-run list goes once one is marked');
  const rest = drawn.find((b) => b.heading === 'Other repeating payments');
  assert.deepEqual((rest?.rows ?? []).map((r) => r.fields.what), ['Design suite']);
  assert.equal(rest?.row_actions?.length, 1);
  close();
});
