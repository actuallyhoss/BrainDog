/**
 * Certificates: what is put in a fixed deposit, the rate, what it has earned so far, when it pays and when it matures,
 * and the walk of Cash ahead reading its payouts and the principal coming back.
 *
 * THE ADD-ON FEEDS THE CASH WALK, and the walk lives in Money (`CASH_LEGS`). Money names Certificates in two legs and
 * every install leaves a leg out when the record does not hold its list (`legsKept`), so a record without the add-on
 * walks as it always did; a record that holds it walks the payouts and the principal. These tests run the pack as it
 * ships, planned and installed the road a person takes from the app, beside money-core.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { readPackFile } from '../../packages/declare/src/catalogue.ts';
import { fixedClock, openSqlite } from '../../packages/kernel/test/sqlite.ts';
import { fixOf } from '../../packages/ports/src/index.ts';
import { createRecordApi, type CallContext } from '../../packages/record/src/index.ts';
import type { CtxHost, Json, ScriptDecl } from '../../packages/script/src/index.ts';
import { runInQuickJs } from '../../packages/script/src/quickjs.ts';
import { firstPartyDocument } from '../../packages/seed/src/index.ts';
import { CASH_LEGS } from '../../packages/seed/src/modules/money/legs.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const NOW = Date.UTC(2026, 9, 15, 12);
const TODAY = '2026-10-15';

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };
const said = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};

type Api = Awaited<ReturnType<typeof createRecordApi>>;

const TEXT = readFileSync(new URL('./certificates.pack.json', import.meta.url), 'utf8');
const shipped = (): Record<string, unknown> => JSON.parse(TEXT) as Record<string, unknown>;
const PACK = shipped() as { declarations: Record<string, unknown>[] };
const script = (id: string) => PACK.declarations.find((d) => d.script === id) as { script: string; runs: Record<string, unknown>; egress: string[]; keys: string[]; reads: string[]; writes: string[]; source: string };
const ACCRUE = script('certificates_accrue');
const PAYOUT = script('certificates_payout');

async function put(api: Api, doc: unknown): Promise<void> {
  const diff = said<{ diff: { planHash: string; approve: unknown[] } }>(await api.planPack({ doc, source: { kind: 'local' } } as never, owner)).diff;
  said(await api.installPack({ doc, source: { kind: 'local' }, planHash: diff.planHash, approve: diff.approve } as never, owner));
}

const MODULES = ['portfolio', 'people', 'money-core'];

/** A fresh record holding money-core and the modules it stands on, and nothing else. */
async function fresh() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  for (const id of MODULES) await put(api, firstPartyDocument(id, { seeds: [] }));
  return { api, sql, close: () => sql.close() };
}

/** Money as a record that holds the add-on is given it: the walk with the lists the record now has. */
const held = (api: Api): string[] => api.kernel.declarations().flatMap((d) => (d.id.startsWith('register.') ? [d.id.slice('register.'.length)] : []));

/* ── The pack ──────────────────────────────────────────────────────────────────────────────────── */

test('THE PACK CARRIES ITS TWO SCRIPTS AS THEIR SOURCE, byte for byte; neither fetches anything', async () => {
  assert.equal(ACCRUE.source, readFileSync(new URL('./accrue.js', import.meta.url), 'utf8'), 'certificates.pack.json and accrue.js disagree');
  assert.equal(PAYOUT.source, readFileSync(new URL('./payout.js', import.meta.url), 'utf8'), 'certificates.pack.json and payout.js disagree');
  for (const s of [ACCRUE, PAYOUT]) assert.deepEqual([s.egress, s.keys], [[], []]);
  assert.deepEqual(ACCRUE.runs, { rule: true, every: '1d' });
  assert.deepEqual(PAYOUT.runs, { rule: true });
  const file = await readPackFile(TEXT);
  assert.ok(file.ok, fixOf(file));
  assert.equal(file.value.pack.manifest.pack, 'certificates');
  assert.equal(file.value.pack.manifest.version, '2.0.2');
});

test('THE SCRIPT STEPS A PAYOUT BY THE WALK’S OWN LEG, written into its source as data', () => {
  const leg = CASH_LEGS.find((l) => l.register === 'certificates' && l.every !== undefined)!;
  const mine = (({ on, every, ends }) => ({ on, every, ends }))(leg);
  const written = /const LEG = (\{.*\});/.exec(PAYOUT.source)![1]!;
  assert.deepEqual(new Function(`return ${written}`)(), mine, 'payout.js steps a payout by a leg the walk does not read');
  assert.deepEqual(mine, { on: 'next_payout', every: { field: 'every', months: { monthly: 1, quarterly: 3, yearly: 12 } }, ends: 'ends' });
});

test('MONEY WALKS A CERTIFICATE TWICE: EACH PAYOUT TO ITS END, AND THE PRINCIPAL ON THE DAY IT MATURES', () => {
  const mine = CASH_LEGS.filter((l) => l.register === 'certificates');
  assert.equal(mine.length, 2);
  assert.deepEqual(
    mine.map((l) => [l.on, l.amount, l.every === undefined ? 'once' : 'repeats']),
    [
      ['next_payout', 'pays', 'repeats'],
      ['ends', 'at_maturity', 'once'],
    ],
  );
  for (const l of mine) assert.deepEqual(l.incoming, { field: 'flow', is: 'in' });
});

test('IT INSTALLS BESIDE MONEY, AND THE REGISTER, THE PAGE AND THE FIGURES ARE THERE', async () => {
  const { api, close } = await fresh();
  await put(api, shipped());
  assert.ok(held(api).includes('certificates'));
  const page = said<{ title: string; blocks: { heading?: string; refusals: unknown[]; kind: string; lead?: boolean }[] }>(await api.page({ slug: 'certificates' }, owner));
  assert.equal(page.title, 'Certificates');
  assert.equal(page.blocks[0]!.kind, 'note');
  for (const b of page.blocks) assert.deepEqual(b.refusals, [], `${b.heading ?? b.kind} was refused`);
  close();
});

/* ── The page, the figures and the walk ────────────────────────────────────────────────────────── */

const add = async (api: Api, fields: Record<string, unknown>) =>
  said<{ id: string }>(await api.create({ register: 'certificates', fields: { bank: 'Harbour Bank', amount: { amount: 10_000_000, currency: 'EGP' }, rate: 18, start: '2026-07-01', every: 'monthly', ...fields } }, owner));

async function settle(api: Api): Promise<void> {
  const refuse = async (): Promise<never> => {
    throw new Error('a certificate fetches nothing');
  };
  const { scriptReads, scriptRunner } = await import('../../packages/host/src/script.ts');
  const run = scriptRunner({ run: runInQuickJs, send: refuse, pin: refuse, openKey: refuse, grantOf: () => null, reads: scriptReads(api), now: () => NOW } as never);
  for (let i = 0; i < 3; i++) {
    await api.kernel.drain();
    const ran = (await api.kernel.runActions(refuse as never, { script: run, limit: 50 })) as { refused: number; failed: number };
    assert.deepEqual([ran.refused, ran.failed], [0, 0]);
  }
}

const fieldsOf = (sql: ReturnType<typeof openSqlite>, seq: number) =>
  JSON.parse(sql.one<{ fields: string }>(`SELECT fields FROM entry WHERE register = 'certificates' AND seq = ${seq}`)!.fields) as Record<string, any>;

test('A CERTIFICATE ADDED WITH ONLY ITS TERMS IS WORKED OUT: when it matures, what each payout is, when the next is, what it has earned', async () => {
  const { api, sql, close } = await fresh();
  await put(api, shipped());
  /* EGP 100,000.00 at 18% a year, a year long from 1 July 2026, paying every month: EGP 1,500.00 a month. */
  await add(api, { term: 12 });
  await settle(api);
  const f = fieldsOf(sql, 1);
  assert.equal(f.ends, '2027-07-01');
  assert.deepEqual(f.pays, { amount: 150_000, currency: 'EGP' });
  assert.equal(f.next_payout, '2026-08-01');
  /* 106 days of 18% on EGP 100,000.00 by 15 October: 5,227.40 */
  assert.deepEqual(f.accrued, { amount: Math.round((10_000_000 * 18 * 106) / 36_500), currency: 'EGP' });
  assert.deepEqual(f.interest, { amount: 1_800_000, currency: 'EGP' });
  assert.deepEqual(f.at_maturity, { amount: 10_000_000, currency: 'EGP' }, 'one that pays its interest out gets the principal back');
  close();
});

test('A CERTIFICATE THAT COMPOUNDS IS WORTH ITS PRINCIPAL GROWN OVER THE TERM ON THE DAY IT MATURES', async () => {
  const { api, sql, close } = await fresh();
  await put(api, shipped());
  await add(api, { term: 12, roll: true });
  await settle(api);
  const f = fieldsOf(sql, 1);
  assert.equal(f.at_maturity.amount, 10_000_000 + f.interest.amount);
  assert.ok(f.at_maturity.amount > 11_800_000, 'compounding grows past simple interest');
  close();
});

test('A PAYOUT OR A DAY SOMEBODY WROTE IS NEVER WRITTEN OVER', async () => {
  const { api, sql, close } = await fresh();
  await put(api, shipped());
  await add(api, { term: 12, pays: { amount: 140_000, currency: 'EGP' }, next_payout: '2026-11-01', ends: '2027-06-30' });
  await settle(api);
  const f = fieldsOf(sql, 1);
  assert.deepEqual([f.pays.amount, f.next_payout, f.ends], [140_000, '2026-11-01', '2027-06-30']);
  close();
});

test('THE PAGE READS ITS TOTALS AND ONE CARD A CERTIFICATE, with no refusal, and a matured one leaves the live cards', async () => {
  const { api, close } = await fresh();
  await put(api, shipped());
  await add(api, { term: 12 });
  await add(api, { bank: 'Lakeside Savings', amount: { amount: 5_000_000, currency: 'EGP' }, rate: 12, term: 6, start: '2026-01-01', every: 'quarterly', state: 'matured' });
  await settle(api);
  const page = said<{ blocks: { heading?: string; kind: string; refusals: unknown[]; rows?: { fields: Record<string, unknown> }[]; body?: string }[] }>(await api.page({ slug: 'certificates' }, owner));
  for (const b of page.blocks) assert.deepEqual(b.refusals, [], `${b.heading ?? b.kind} was refused`);
  const live = page.blocks.find((b) => b.heading === 'Your certificates')!;
  assert.deepEqual(live.rows!.map((r) => r.fields.bank), ['Harbour Bank']);
  /* NO LINE OVER THE PAGE SINCE 2.0.4 (3 Nov, "i dont like those briefs at all, remove them"): "Next payout 20 Nov." said
     what the table shows for each one. The line for no certificate is left out, since there are two. */
  const leads = page.blocks.filter((b) => (b as { lead?: boolean; drawn?: boolean }).lead === true && (b as { drawn?: boolean }).drawn !== false);
  assert.deepEqual(leads.map((b) => b.body), [], 'the page still opens on a line');
  assert.equal(page.blocks.some((b) => String(b.body ?? '').includes('certificates-next-payout')), false, 'the page still says the next payout over the table');
  close();
});

/* ── The walk ──────────────────────────────────────────────────────────────────────────────────── */

const WALK = ['arriving-30d', 'runway-days'];

test('A RECORD THAT HOLDS CERTIFICATES WALKS THEIR PAYOUTS AND THE PRINCIPAL INTO CASH AHEAD; one that does not walks as it did', async () => {
  const { api, close } = await fresh();
  const arriving = (): number => {
    const out = api.kernel.metric(api.kernel.metricDecl('arriving-30d')!) as unknown as { ok: boolean; value: { value: number | null } };
    assert.ok(out.ok);
    return out.value.value ?? 0;
  };
  assert.equal(JSON.stringify(api.kernel.metricDecl('arriving-30d')).includes('certificates'), false, 'a record without the add-on walks a list it does not hold');
  await put(api, shipped());
  /* A PAYOUT ON THE 20TH EVERY MONTH, AND THE VALUE BACK ON 10 NOVEMBER: both fall in the next 30 days. */
  await add(api, { start: '2026-09-20', term: 2, ends: '2026-11-10', at_maturity: { amount: 10_000_000, currency: 'EGP' }, pays: { amount: 150_000, currency: 'EGP' }, next_payout: '2026-10-20' });
  /* THE ADD-ON ALONE IS ENOUGH: installing it puts Money in again for the lists the record holds, quietly, with no
     update of Money to wait for. */
  const version = (): string | null => api.kernel.packStates().find((p) => p.id === 'money-core')?.version ?? null;
  const before = version();
  assert.ok(JSON.stringify(api.kernel.metricDecl('arriving-30d')).includes('certificates'), 'Money does not walk Certificates for a record that holds them');
  assert.equal(arriving(), 150_000 + 10_000_000, 'the 20 October payout and the principal on 10 November; the payout after that is past the day it matures');
  assert.equal(version(), before, 'no version moved');
  const open = api.kernel.openSuggestions();
  assert.deepEqual(open.ok ? open.value : open, [], 'nothing was asked');
  /* TAKEN OUT AGAIN, NOTHING REFUSES AND THE WALK STOPS NAMING THE LIST. */
  said(await api.uninstallPack({ id: 'certificates' }, owner));
  assert.equal(JSON.stringify(api.kernel.metricDecl('arriving-30d')).includes('certificates'), false, 'Money walks a list the record no longer holds');
  assert.equal(version(), before);
  assert.equal(arriving(), 0);
  close();
});

/* ── The script that moves a payout on ─────────────────────────────────────────────────────────── */

type Row = { id: string; register: string; seq: number; fields: Record<string, Json>; version: number; updated_at: string };
const row = (id: string, register: string, seq: number, fields: Record<string, Json>, version = 1): Row => ({ id, register, seq, fields, version, updated_at: NOW as unknown as string });

const CERT = row('01K5CRT0000000000000000001', 'certificates', 1, {
  bank: 'Harbour Bank',
  amount: { amount: 10_000_000, currency: 'EGP' },
  rate: 18,
  start: '2026-07-01',
  every: 'monthly',
  pays: { amount: 150_000, currency: 'EGP' },
  next_payout: '2026-10-01',
  ends: '2027-07-01',
  state: 'live',
  flow: 'in',
  account: 'accounts#2',
});

const LINE = row('01K5TXN0000000000000000001', 'transactions', 7, { what: 'Harbour Bank profit', on: '2026-10-02', direction: 'in', amount: { amount: 150_000, currency: 'EGP' }, account: 'accounts#2', state: 'cleared' });

const payoutHost = (line: Row, certificates: Row[], cycle?: (day: string) => string): CtxHost => ({
  fetch: async () => {
    throw new Error('a certificate fetches nothing');
  },
  get: async (spoken: string) => ([line, ...certificates].find((r) => r.id === spoken || `${r.register}#${r.seq}` === spoken) ?? null) as unknown as Json,
  list: async (register: string) => certificates.filter((r) => r.register === register) as unknown as Json[],
  now: () => NOW,
  tz: 'UTC',
  input: { line: line.id },
  ...(cycle === undefined ? {} : { cycle: async (day: string) => cycle(day) }),
} as never);

const decl = (s: typeof PAYOUT): ScriptDecl => ({ id: s.script, version: 1, egress: s.egress, keys: s.keys, reads: s.reads, writes: s.writes, source: s.source });

test('A PAYOUT BOOKED IS ASKED ABOUT ONCE: Move it on to 1 November, or leave it', async () => {
  const a = await runInQuickJs(decl(PAYOUT), payoutHost(LINE, [CERT], () => '2026-11-01'));
  const ask = (a as { ask?: { question: string; options: { label: string; patches?: { id: string; fields: Record<string, unknown> }[] }[] } }).ask!;
  assert.ok(ask, JSON.stringify(a));
  assert.equal(ask.question, 'Payout of Harbour Bank is booked. Move its next payout on to 1 November?');
  assert.deepEqual(ask.options.map((o) => o.label), ['Move it on', 'Leave it']);
  assert.deepEqual(ask.options[0]!.patches, [{ id: 'certificates#1', version: 1, fields: { next_payout: '2026-11-01' } }]);
});

test('A PAYOUT THAT IS THE LAST ASKS TO MARK THE CERTIFICATE MATURED', async () => {
  const last = row(CERT.id, 'certificates', 1, { ...CERT.fields, next_payout: '2027-07-01', ends: '2027-07-01' });
  const line = row(LINE.id, 'transactions', 7, { ...LINE.fields, on: '2027-07-01' });
  const a = await runInQuickJs(decl(PAYOUT), payoutHost(line, [last], () => '2027-08-01'));
  const ask = (a as { ask?: { question: string; options: { patches?: { fields: Record<string, unknown> }[] }[] } }).ask!;
  assert.equal(ask.question, 'Its last payout is booked for Harbour Bank. Mark the certificate matured?');
  assert.deepEqual(ask.options[0]!.patches![0]!.fields, { state: 'matured' });
});

test('NOTHING IS ASKED when the amount differs, the account differs, the day is far, money went out, or two certificates fit', async () => {
  const none = async (line: Row, certs: Row[]) => {
    const a = (await runInQuickJs(decl(PAYOUT), payoutHost(line, certs, () => '2026-11-01'))) as { ask?: unknown };
    return a.ask ?? null;
  };
  assert.equal(await none(row(LINE.id, 'transactions', 7, { ...LINE.fields, amount: { amount: 149_999, currency: 'EGP' } }), [CERT]), null);
  assert.equal(await none(row(LINE.id, 'transactions', 7, { ...LINE.fields, amount: { amount: 150_000, currency: 'USD' } }), [CERT]), null);
  assert.equal(await none(row(LINE.id, 'transactions', 7, { ...LINE.fields, account: 'accounts#9' }), [CERT]), null);
  assert.equal(await none(row(LINE.id, 'transactions', 7, { ...LINE.fields, on: '2026-10-20' }), [CERT]), null);
  assert.equal(await none(row(LINE.id, 'transactions', 7, { ...LINE.fields, direction: 'out' }), [CERT]), null);
  assert.equal(await none(LINE, [CERT, row('01K5CRT0000000000000000002', 'certificates', 2, { ...CERT.fields, bank: 'Lakeside Savings' })]), null);
});
