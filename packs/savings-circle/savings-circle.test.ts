/**
 * Savings circle: the people, the part, your turn and the first month written as a plan's months and your payout.
 * Every name and amount here is invented.
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
type Block = { kind: string; heading?: string; refusals: unknown[]; rows?: { fields: Body }[] };

const FILE = new URL('./savings-circle.pack.json', import.meta.url);
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
    throw new Error('savings-circle fetches nothing');
  };
  const run = scriptRunner({ run: runInQuickJs, send: refuse, pin: refuse, openKey: refuse, grantOf: () => null, reads: scriptReads(api), now: () => NOW } as never);
  for (let i = 0; i < 4; i++) {
    await api.kernel.drain();
    const ran = (await api.kernel.runActions(refuse as never, { script: run, limit: 50 })) as { refused: number; failed: number };
    assert.deepEqual([ran.refused, ran.failed], [0, 0], 'a run was refused or failed ' + JSON.stringify(ran));
  }
}

const make = (api: Api, list: string, fields: Body): string => said<{ id: string }>(api.kernel.create(list, fields as never, { actor: 'p_1' })).id;
const fieldsOf = (api: Api, id: string): Body => api.kernel.get(id as never)!.fields as Body;
const rowsOf = (api: Api, register: string, where?: unknown): { id: string; fields: Body }[] =>
  said<{ rows: { id: string; fields: Body }[] }>(api.kernel.list({ register, limit: 100, ...(where ? { where } : {}) } as never)).rows;
const egp = (amount: number) => ({ amount, currency: 'EGP' });
const metric = async (api: Api, id: string): Promise<Reading> => said<Reading>(await api.metric({ metric: id }, owner));

test('THE FILE: savings-circle 1.0.0 on money-core, fields laid on Plans, one rule and its script, one page', () => {
  const doc = shipped();
  assert.deepEqual([doc.pack, doc.version, doc.license], ['savings-circle', '1.2.1', 'Apache-2.0']);
  const kinds = (k: string) => doc.declarations.filter((d) => k in d).map((d) => d[k]);
  assert.deepEqual(kinds('register'), []);
  assert.deepEqual(kinds('page'), ['savings-circles']);
  assert.deepEqual(kinds('rule'), ['circle_make']);
  const script = doc.declarations.find((d) => d.script === 'circle_make')!;
  assert.equal(script.source, readFileSync(new URL('./circle.js', import.meta.url), 'utf8'), 'the pack file and circle.js disagree');
  assert.deepEqual(Object.keys(doc.extends), ['register.plans']);
});

test('BEFORE THE PACK: a plan holds no circle', async () => {
  const { api, close } = await fresh(false);
  const plans = api.kernel.register('plans') as unknown as { fields: { id: string }[] };
  assert.ok(!plans.fields.some((f) => f.id === 'circle_members'));
  close();
});

test('A CIRCLE OF TEN WRITES TEN MONTHS OUT AND ONE PAYOUT IN, on your month, and only once', async () => {
  const { api, close } = await fresh();
  const plan = make(api, 'plans', { name: 'Family circle', circle_members: 10, circle_part: egp(500_000), circle_turn: 4, circle_first: '2026-11-01' });
  await settle(api);
  const parts = rowsOf(api, 'installments', { all: [{ field: 'plan_row', is: plan }] });
  const out = parts.filter((p) => p.fields.direction === 'out');
  const back = parts.filter((p) => p.fields.direction === 'in');
  assert.equal(out.length, 10);
  assert.deepEqual(out.map((p) => p.fields.due).sort()[9], '2027-08-01');
  assert.equal(back.length, 1);
  assert.deepEqual([back[0]!.fields.amount, back[0]!.fields.due], [egp(5_000_000), '2027-02-01']);
  assert.deepEqual([fieldsOf(api, plan).circle_payout, fieldsOf(api, plan).circle_payout_on], [egp(5_000_000), '2027-02-01']);
  assert.equal((await metric(api, 'circles-month')).value, 500_000);

  said(api.kernel.update('plans', plan, { circle_turn: 5 } as never, { actor: 'p_1' }));
  await settle(api);
  assert.equal(rowsOf(api, 'installments', { all: [{ field: 'plan_row', is: plan }] }).length, 11, 'a circle with months is never made twice');
  close();
});

test('A CIRCLE ALREADY UNDER WAY: the months before today are paid, the payout too once its day is gone, and its days are words', async () => {
  const { api, close } = await fresh();
  /* NOW is 26 Oct 2026: August, September and October are gone, November is not; the turn is the second month. */
  const plan = make(api, 'plans', { name: 'Street circle', circle_members: 4, circle_part: egp(100_000), circle_turn: 2, circle_first: '2026-08-01' });
  await settle(api);
  const parts = rowsOf(api, 'installments', { all: [{ field: 'plan_row', is: plan }] });
  const out = parts.filter((p) => p.fields.direction === 'out').sort((a, b) => String(a.fields.due).localeCompare(String(b.fields.due)));
  assert.deepEqual(out.map((p) => p.fields.state), ['paid', 'paid', 'paid', 'open']);
  assert.equal(parts.find((p) => p.fields.direction === 'in')!.fields.state, 'paid', 'the payout on 1 Sep has come');
  const said = String(fieldsOf(api, plan).circle_said);
  assert.match(said, /^Made 4 months from 1 Aug, and your payout on 1 Sep\. The 3 months before today are marked paid/);
  assert.doesNotMatch(said, /\d{4}-\d{2}-\d{2}/, 'no day is said as the record keeps it');
  close();
});

test('A TURN PAST THE LAST MONTH WRITES NOTHING AND SAYS WHY', async () => {
  const { api, close } = await fresh();
  const plan = make(api, 'plans', { name: 'Office circle', circle_members: 5, circle_part: egp(100_000), circle_turn: 6, circle_first: '2026-11-01' });
  await settle(api);
  assert.equal(rowsOf(api, 'installments', { all: [{ field: 'plan_row', is: plan }] }).length, 0);
  assert.match(String(fieldsOf(api, plan).circle_said), /from 1 to 5/);
  close();
});

test('THE PAGE draws with nothing refused', async () => {
  const { api, close } = await fresh();
  const page = said<{ blocks: Block[] }>(await api.page({ slug: 'savings-circles' }, owner));
  for (const b of page.blocks) assert.deepEqual(b.refusals, [], `${b.heading ?? b.kind} was refused`);
  assert.equal(page.blocks[0]!.kind, 'note');
  close();
});
