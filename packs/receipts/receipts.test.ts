/**
 * Receipts: a receipt on each Ledger line, a receipt sent in alone matched to its line, and lines that want one.
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

const FILE = new URL('./receipts.pack.json', import.meta.url);
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
    throw new Error('receipts fetches nothing');
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
const gbp = (amount: number) => ({ amount, currency: 'GBP' });
const metric = async (api: Api, id: string): Promise<Reading> => said<Reading>(await api.metric({ metric: id }, owner));
const picture = (n: number) => ({ sha256: String(n).repeat(64).slice(0, 64), mime: 'image/jpeg', bytes: 1_000 + n, name: `receipt-${n}.jpg` });

test('THE FILE: receipts 1.0.0 on money-core, one list, a receipt on the Ledger, one script for two rules and the night', () => {
  const doc = shipped();
  assert.deepEqual([doc.pack, doc.version, doc.license], ['receipts', '1.2.0', 'Apache-2.0']);
  const kinds = (k: string) => doc.declarations.filter((d) => k in d).map((d) => d[k]);
  assert.deepEqual(kinds('register'), ['receipts']);
  assert.deepEqual(kinds('page'), ['receipts']);
  assert.deepEqual(kinds('rule'), ['receipts_from_receipt', 'receipts_from_line']);
  const script = doc.declarations.find((d) => d.script === 'receipts_match')!;
  assert.equal(script.source, readFileSync(new URL('./match.js', import.meta.url), 'utf8'), 'the pack file and match.js disagree');
  const added = (doc.extends['register.transactions'] as { fields: Body[] }).fields;
  assert.deepEqual(added.map((f) => [f.id, f.type]), [['receipt', 'file'], ['receipt_wanted', 'bool']]);
});

test('BEFORE THE PACK: there is no receipts list', async () => {
  const { api, close } = await fresh(false);
  assert.equal(api.kernel.register('receipts'), undefined);
  close();
});

test('A RECEIPT FINDS ITS ONE LINE BY AMOUNT AND DAY, and one with two near lines waits for an answer', async () => {
  const { api, close } = await fresh();
  const account = make(api, 'accounts', { name: 'Card', kind: 'card', balance: gbp(0), as_of: '2026-10-01', liquid: false });
  const line = (what: string, on: string, amount: number) => make(api, 'transactions', { what, on, direction: 'out', amount: gbp(amount), account, state: 'cleared' });
  const lamp = line('Lamp shop', '2026-10-20', 4_599);
  line('Other shop', '2026-10-19', 1_000);
  const one = make(api, 'receipts', { picture: picture(1), shop: 'Lamp shop', on: '2026-10-21', amount: gbp(4_599) });
  await settle(api);
  assert.deepEqual(fieldsOf(api, lamp).receipt, picture(1));
  assert.deepEqual([fieldsOf(api, one).state, fieldsOf(api, one).line], ['matched', lamp]);

  line('Cafe', '2026-10-22', 350);
  line('Cafe again', '2026-10-23', 350);
  /* THE LINES ARE IN BEFORE THE RECEIPT, so the receipt is the one that looks: written in one go, the first line's own
     look would take the waiting receipt, which is the line-side match and not this case. */
  await settle(api);
  const two = make(api, 'receipts', { picture: picture(2), shop: 'Cafe', on: '2026-10-22', amount: gbp(350) });
  await settle(api);
  assert.equal(fieldsOf(api, two).state, 'waiting', 'two lines fit, so it asks rather than picks');
  close();
});

test('A LINE THAT LANDS AFTER ITS RECEIPT TAKES IT, and a line in a category that keeps receipts says it wants one', async () => {
  const { api, close } = await fresh();
  const account = make(api, 'accounts', { name: 'Card', kind: 'card', balance: gbp(0), as_of: '2026-10-01', liquid: false });
  const work = make(api, 'categories', { name: 'Work costs', direction: 'out', wants_receipt: true });
  const early = make(api, 'receipts', { picture: picture(3), shop: 'Print shop', on: '2026-10-20', amount: gbp(2_500) });
  await settle(api);
  assert.equal(fieldsOf(api, early).state, 'waiting');
  const print = make(api, 'transactions', { what: 'Print shop', on: '2026-10-22', direction: 'out', amount: gbp(2_500), account, state: 'cleared', category: work });
  const paper = make(api, 'transactions', { what: 'Paper', on: '2026-10-22', direction: 'out', amount: gbp(900), account, state: 'cleared', category: work });
  await settle(api);
  assert.deepEqual(fieldsOf(api, print).receipt, picture(3));
  assert.equal(fieldsOf(api, early).state, 'matched');
  assert.equal(fieldsOf(api, paper).receipt_wanted, true);
  assert.equal((await metric(api, 'receipts-missing')).value, 1);
  close();
});

test('THE PAGE draws with nothing refused', async () => {
  const { api, close } = await fresh();
  const page = said<{ blocks: Block[] }>(await api.page({ slug: 'receipts' }, owner));
  for (const b of page.blocks) assert.deepEqual(b.refusals, [], `${b.heading ?? b.kind} was refused`);
  assert.equal(page.blocks[0]!.kind, 'note');
  close();
});
