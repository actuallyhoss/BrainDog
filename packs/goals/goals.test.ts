/**
 * `goals` as an add-on to Money: what a person is saving for, counted from what an account, a currency or a value holds.
 *
 * THE LIST IS NAMED `money_goals` AND NOT `savings_goals`, because Personal already keeps a list of that name, and a
 * record can hold only one list under a name. It keeps that list's words (a name, a target, a day, an account it is
 * kept in, a status of saving, paused or reached), so a person who has used one finds the other where they expect it.
 *
 * PACE IS A SCRIPT'S, NOT A FIGURE'S. A figure adds up a field over rows; it cannot divide what is left by the months
 * to a day, so `pace.js` writes the amount to put by each month and whether the goal is on track, as `holdings` writes
 * its worth. The invented rows here are nobody's.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { scriptReads, scriptRunner } from '../../packages/host/src/script.ts';
import { createRecordApi, type CallContext } from '../../packages/record/src/index.ts';
import { fixedClock, openSqlite } from '../../packages/kernel/test/sqlite.ts';
import { runInQuickJs } from '../../packages/script/src/quickjs.ts';
import { FIRST_PARTY, firstPartyDocument } from '../../packages/seed/src/index.ts';

const NOW = Date.UTC(2026, 8, 25, 9);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

type Refusal = { code: string; fix: string; at?: string };
type Out = { ok: boolean; value?: unknown; refusal?: Refusal };
const said = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};

type Api = Awaited<ReturnType<typeof createRecordApi>>;
type Diff = { planHash: string; approve: unknown[]; conflicts: unknown[]; adds: { id: string }[] };
type Body = Record<string, unknown>;
type Money = { amount: number; currency: string };

const PACK_FILE = new URL('./goals.pack.json', import.meta.url);
const file = (): Body & { version: string; declarations: Body[] } => JSON.parse(readFileSync(PACK_FILE, 'utf8')) as never;
const SOURCE = readFileSync(new URL('./pace.js', import.meta.url), 'utf8');

async function money(): Promise<{ api: Api; close: () => void }> {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  for (const id of FIRST_PARTY) said(await put(api, firstPartyDocument(id)));
  said(await put(api, file()));
  return { api, close: () => sql.close() };
}

const planOf = async (api: Api, doc: unknown): Promise<Diff> =>
  said<{ diff: Diff }>(await api.planPack({ doc, source: { kind: 'local' } } as never, owner)).diff;

async function put(api: Api, doc: unknown): Promise<Out> {
  const diff = await planOf(api, doc);
  return (await api.installPack({ doc, source: { kind: 'local' }, planHash: diff.planHash, approve: diff.approve } as never, owner)) as Out;
}

/** The rules' runs taken to the end the way a host takes them, with the script run in QuickJS. */
async function settle(api: Api, rounds = 4): Promise<void> {
  const refuse = async (): Promise<never> => {
    throw new Error('the pace script fetches nothing');
  };
  const run = scriptRunner({ run: runInQuickJs, send: refuse, pin: refuse, openKey: refuse, grantOf: () => null, reads: scriptReads(api), now: () => NOW } as never);
  for (let i = 0; i < rounds; i++) {
    await api.kernel.drain();
    await api.kernel.runActions(refuse as never, { script: run, limit: 50 });
  }
}

const gbp = (amount: number): Money => ({ amount, currency: 'GBP' });
const usd = (amount: number): Money => ({ amount, currency: 'USD' });

const account = (api: Api, name: string, balance: Money, more: Body = {}): string =>
  said<{ id: string }>(api.kernel.create('accounts', { name, kind: 'bank', balance, as_of: '2026-09-25', ...more } as never, { actor: 'p_1' })).id;
const goal = (api: Api, fields: Body): string => said<{ id: string }>(api.kernel.create('money_goals', fields as never, { actor: 'p_1' })).id;
const read = (api: Api, id: string): Body => api.kernel.get(id)!.fields as Body;

test('THE FILE DECLARES THE LIST, THE TWO RULES, THE SCRIPT, THE FIGURES AND THE PAGE', () => {
  const doc = file();
  assert.equal(doc.pack, 'goals');
  /* 2.2.0 SINCE 1 November (d68fb4080): what to add while it is empty, with `goals-count`. 2.2.1 SINCE 3 November (3ea2e541c). */
  assert.equal(doc.version, '2.2.1');
  const list = doc.declarations.find((d) => d.register === 'money_goals')!;
  const ids = (list.fields as Body[]).map((f) => f.id);
  /* THE WORDS PERSONAL'S SAVINGS GOALS USES, kept so the two read alike. */
  for (const id of ['name', 'target', 'by', 'account', 'state']) assert.ok(ids.includes(id), `${id} is missing`);
  assert.deepEqual((list.fields as Body[]).find((f) => f.id === 'state')!.values, ['saving', 'paused', 'reached']);
  assert.deepEqual((list.fields as Body[]).find((f) => f.id === 'kind')!.values, ['account', 'currency', 'value']);
});

test('THE SCRIPT IN THE FILE IS pace.js, BYTE FOR BYTE, AND REACHES ONLY GOALS AND ACCOUNTS', () => {
  const script = file().declarations.find((d) => d.script === 'goals_pace')!;
  assert.equal(script.source, SOURCE, 'goals.pack.json and pace.js disagree; copy pace.js into the source');
  assert.deepEqual([script.egress, script.keys, script.reads, script.writes], [[], [], ['money_goals', 'accounts'], ['money_goals']]);
});

test('BEFORE THE PACK THE RECORD HAS NO GOALS, AND THE FILE INSTALLS WITH NOTHING REFUSED', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  for (const id of FIRST_PARTY) said(await put(api, firstPartyDocument(id)));
  assert.equal(api.kernel.register('money_goals'), undefined);
  const diff = await planOf(api, file());
  assert.deepEqual(diff.conflicts, []);
  assert.deepEqual(
    diff.adds.map((a) => a.id).sort(),
    ['metric.goals-behind', 'metric.goals-count', 'metric.goals-have-by-name', 'metric.goals-held', 'metric.goals-need', 'metric.goals-reached', 'metric.goals-saving', 'page.goals', 'register.money_goals', 'rule.goals_pace', 'rule.goals_pace_on_balance', 'script.goals_pace'],
  );
  said(await put(api, file()));
  assert.equal(api.kernel.packs().find((p) => p.id === 'goals')?.version, '2.2.1');
  sql.close();
});

test('A GOAL KEPT IN AN ACCOUNT HOLDS ITS BALANCE, ASKS FOR WHAT IS LEFT OVER THE MONTHS TO ITS DAY, AND IS ON TRACK ON THE DAY IT IS MADE', async () => {
  const { api, close } = await money();
  const bank = account(api, 'Rainy day', gbp(200_000));
  /* 2026-09-25 to 2027-03-25 is 181 days, 5.95 months; 400,000 left asks 67,227 (rounded up) a month. */
  const g = goal(api, { name: 'Emergency cushion', kind: 'account', account: bank, target: gbp(600_000), by: '2027-03-25' });
  await settle(api);
  const f = read(api, g);
  assert.deepEqual(f.have, gbp(200_000));
  assert.deepEqual(f.need, gbp(67_266));
  assert.equal(f.pace, 'on_track');
  assert.equal(f.started_on, '2026-09-25');
  assert.deepEqual(f.from_amount, gbp(200_000));
  close();
});

test('A GOAL SLIPS BEHIND WHEN IT HOLDS LESS THAN THE LINE FROM WHERE IT BEGAN, AND A BALANCE THAT MOVES MOVES THE GOAL', async () => {
  const { api, close } = await money();
  const bank = account(api, 'Rainy day', gbp(200_000));
  const g = goal(api, { name: 'Emergency cushion', kind: 'account', account: bank, target: gbp(600_000), by: '2026-12-25', started_on: '2026-08-25', from_amount: gbp(100_000) });
  await settle(api);
  /* 31 of 122 days gone: the line stands at 100,000 + 500,000 * 31 / 122 = 227,049, so 200,000 is behind. */
  assert.equal(read(api, g).pace, 'behind');
  said(api.kernel.update('accounts', bank, { balance: gbp(300_000) } as never, { actor: 'p_1' }));
  await settle(api);
  assert.deepEqual(read(api, g).have, gbp(300_000));
  assert.equal(read(api, g).pace, 'on_track');
  close();
});

test('MORE THAN FIFTY ACCOUNTS ARE ALL COUNTED toward a goal in their currency', async () => {
  const { api, close } = await money();
  const before = goal(api, { name: 'Before', kind: 'currency', target: gbp(600_000), by: '2027-03-25' });
  await settle(api, 12);
  const base = (read(api, before).have as Money).amount;
  for (let i = 0; i < 60; i++) account(api, `Pot ${i + 1}`, gbp(1_000));
  const g = goal(api, { name: 'Everything', kind: 'currency', target: gbp(6_000_000), by: '2027-03-25' });
  await settle(api, 12);
  assert.deepEqual(read(api, g).have, gbp(base + 60_000));
  close();
});

test('A GOAL IN A CURRENCY ADDS THE OPEN ACCOUNTS IN THAT CURRENCY AND NEVER ADDS ANOTHER', async () => {
  const { api, close } = await money();
  account(api, 'Current', gbp(100_000));
  account(api, 'Savings', gbp(50_000));
  account(api, 'Dollar box', usd(900_000));
  account(api, 'Old', gbp(70_000), { state: 'closed' });
  const g = goal(api, { name: 'Pounds put by', kind: 'currency', target: gbp(3_000_000), by: '2027-09-25' });
  await settle(api);
  /* THE RECORD OPENS WITH AN ACCOUNT OF ITS OWN HOLDING 985,000, which counts: 100,000 + 50,000 + 985,000. The dollars and the closed one do not. */
  assert.deepEqual(read(api, g).have, gbp(1_135_000));
  close();
});

test('A GOAL KEPT AS A VALUE KEEPS WHAT WAS TYPED, AND IS REACHED WHEN IT MEETS ITS TARGET', async () => {
  const { api, close } = await money();
  const g = goal(api, { name: 'Bike fund', kind: 'value', target: gbp(80_000), by: '2027-01-25', have: gbp(20_000) });
  await settle(api);
  assert.deepEqual(read(api, g).have, gbp(20_000));
  assert.equal(read(api, g).pace, 'on_track');
  said(api.kernel.update('money_goals', g, { have: gbp(80_000) } as never, { actor: 'p_1' }));
  await settle(api);
  assert.equal(read(api, g).pace, 'reached');
  assert.equal(read(api, g).state, 'reached');
  assert.equal(read(api, g).need ?? null, null);
  close();
});

test('SUB-GOALS ADD UP INTO THE GOAL THEY ARE PART OF, WHICH ASKS NOTHING ITSELF SO THE SAME MONEY IS NOT ASKED TWICE', async () => {
  const { api, close } = await money();
  const a = account(api, 'Holiday pot', gbp(30_000));
  const b = account(api, 'Gift pot', gbp(10_000));
  const whole = goal(api, { name: 'Next year', kind: 'value', target: gbp(200_000), by: '2027-03-25' });
  goal(api, { name: 'Holiday', kind: 'account', account: a, target: gbp(120_000), by: '2027-03-25', under: whole });
  goal(api, { name: 'Gifts', kind: 'account', account: b, target: gbp(80_000), by: '2027-03-25', under: whole });
  await settle(api);
  assert.deepEqual(read(api, whole).have, gbp(40_000));
  assert.equal(read(api, whole).need ?? null, null);
  const metric = file().declarations.find((d) => d.metric === 'goals-need')!;
  const total = said<{ parts?: Money[]; value: number | null }>(api.kernel.metric(metric as never));
  /* 90,000 + 70,000 left over 5.95 months: 15,126 + 11,765, the two sub-goals' asks and not the whole's. */
  const parts = total.parts ?? (total.value === null ? [] : [{ amount: total.value, currency: 'GBP' }]);
  assert.deepEqual(parts.map((p) => [p.currency, p.amount]), [['GBP', 26_907]]);
  close();
});

test('AN ACCOUNT IN ANOTHER CURRENCY THAN THE TARGET HOLDS NOTHING TOWARD IT, AND A PAUSED GOAL ASKS NOTHING', async () => {
  const { api, close } = await money();
  const box = account(api, 'Dollar box', usd(900_000));
  const g = goal(api, { name: 'Pounds', kind: 'account', account: box, target: gbp(300_000), by: '2027-09-25' });
  const p = goal(api, { name: 'Later', kind: 'value', target: gbp(50_000), by: '2027-09-25', have: gbp(1_000), state: 'paused' });
  await settle(api);
  assert.equal(read(api, g).have ?? null, null);
  assert.equal(read(api, g).pace ?? null, null);
  assert.equal(read(api, p).pace ?? null, null);
  assert.equal(read(api, p).need ?? null, null);
  close();
});

test('A DAY THAT HAS COME WITH THE TARGET NOT MET IS BEHIND AND ASKS FOR ALL THAT IS LEFT, AND NO DAY IS SAID SO', async () => {
  const { api, close } = await money();
  const late = goal(api, { name: 'Late', kind: 'value', target: gbp(100_000), by: '2026-09-01', have: gbp(40_000) });
  const open = goal(api, { name: 'Whenever', kind: 'value', target: gbp(100_000), have: gbp(40_000) });
  await settle(api);
  assert.equal(read(api, late).pace, 'behind');
  assert.deepEqual(read(api, late).need, gbp(60_000));
  assert.equal(read(api, open).pace, 'no_day');
  assert.equal(read(api, open).need ?? null, null);
  close();
});

test('THE SCRIPT WRITES NOTHING THE SECOND TIME ROUND', async () => {
  const { api, close } = await money();
  const bank = account(api, 'Rainy day', gbp(200_000));
  const g = goal(api, { name: 'Cushion', kind: 'account', account: bank, target: gbp(600_000), by: '2027-03-25' });
  await settle(api);
  const runs = (): number => (api.kernel as unknown as { history(id: string): unknown[] }).history(g).length;
  const before = runs();
  await settle(api);
  assert.equal(runs(), before, 'the script wrote the goal again with nothing moved');
  close();
});

test('THE GOALS PAGE DRAWS THE FIGURES, A TRACK FOR EACH GOAL AND EVERY ROW, WITH NOTHING REFUSED', async () => {
  const { api, close } = await money();
  const bank = account(api, 'Rainy day', gbp(200_000));
  goal(api, { name: 'Emergency cushion', kind: 'account', account: bank, target: gbp(600_000), by: '2027-03-25' });
  goal(api, { name: 'Bike fund', kind: 'value', target: gbp(80_000), by: '2027-01-25', have: gbp(20_000) });
  await settle(api);
  assert.ok(said<{ slug: string }[]>(await api.pages(owner)).some((p) => p.slug === 'goals'));
  const page = said<{ title: string; blocks: { kind: string; heading?: string; rows?: { fields: Body }[]; refusals: unknown[]; values?: Body }[] }>(
    await api.page({ slug: 'goals' }, owner),
  );
  assert.equal(page.title, 'Goals');
  assert.equal(page.blocks[0]!.kind, 'note');
  for (const b of page.blocks) assert.deepEqual(b.refusals, [], `${b.heading} was refused`);
  const table = page.blocks.find((b) => b.heading === 'Every goal')!;
  assert.deepEqual((table.rows ?? []).map((r) => r.fields.name).sort(), ['Bike fund', 'Emergency cushion']);
  const track = page.blocks.find((b) => b.kind === 'progress')!;
  assert.equal((track.rows ?? []).length, 2);
  close();
});

test('A GOAL IN DOLLARS ON A RECORD KEPT IN POUNDS IS DRAWN, NOT REFUSED, WHEN THE RECORD HOLDS A RATE', async () => {
  const { api, close } = await money();
  said(api.kernel.create('fx', { currency: 'USD', base: 'GBP', rate: 0.8, as_of: '2026-09-01' } as never, { actor: 'p_1' }));
  goal(api, { name: 'Bike fund', kind: 'value', target: gbp(80_000), by: '2027-01-25', have: gbp(20_000) });
  goal(api, { name: 'Trip fund', kind: 'value', target: { amount: 100_000, currency: 'USD' }, by: '2027-01-25', have: { amount: 30_000, currency: 'USD' } });
  await settle(api);
  const page = said<{ blocks: { kind: string; heading?: string; rows?: unknown[]; refusals: unknown[] }[] }>(await api.page({ slug: 'goals' }, owner));
  for (const b of page.blocks) assert.deepEqual(b.refusals, [], `${b.heading ?? b.kind} was refused`);
  assert.equal((page.blocks.find((b) => b.kind === 'progress')!.rows ?? []).length, 2);
  close();
});
