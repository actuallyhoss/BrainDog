/**
 * Insurance: the policies a person keeps, each with its insurer, its premium (a line in Repeating), its cover, what the
 * fund is worth and from which day, and when it matures. The test is a fresh record with every first-party pack, the
 * file installed exactly as it ships, and a handful of invented policies written through the record's own door.
 *
 * THE CLOCK IS FIXED ON TUESDAY 27 OCTOBER 2026, in a record kept in UTC, so every count of premiums is the same on
 * every run. Every insurer, policy and amount here is invented.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { scriptReads, scriptRunner } from '../../packages/host/src/script.ts';
import { createRecordApi, type CallContext } from '../../packages/record/src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from '../../packages/kernel/test/sqlite.ts';
import { runInQuickJs } from '../../packages/script/src/quickjs.ts';
import { FIRST_PARTY, firstPartyDocument } from '../../packages/seed/src/index.ts';

const NOW = Date.UTC(2026, 9, 27, 9);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

type Body = Record<string, unknown>;
type Refusal = { code: string; fix: string; at?: string };
type Out = { ok: boolean; value?: unknown; refusal?: Refusal };
const said = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};

type Api = Awaited<ReturnType<typeof createRecordApi>>;
type Diff = { planHash: string; approve: unknown[]; adds: { id: string }[]; conflicts: unknown[] };
type Money = { amount: number; currency: string };

const PACK_FILE = new URL('./insurance.pack.json', import.meta.url);
const file = (): Body & { version: string; declarations: Body[] } => JSON.parse(readFileSync(PACK_FILE, 'utf8')) as never;
const SOURCE = readFileSync(new URL('./insure.js', import.meta.url), 'utf8');

const planOf = async (api: Api, doc: unknown): Promise<Diff> => said<{ diff: Diff }>(await api.planPack({ doc, source: { kind: 'local' } } as never, owner)).diff;

async function put(api: Api, doc: unknown): Promise<Out> {
  const diff = await planOf(api, doc);
  return (await api.installPack({ doc, source: { kind: 'local' }, planHash: diff.planHash, approve: diff.approve } as never, owner)) as Out;
}

/** A fresh record with every first-party pack, and this file on it when `withPack` says so. */
async function record(withPack = true): Promise<{ api: Api; sql: NodeSql }> {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  for (const id of FIRST_PARTY) said(await put(api, firstPartyDocument(id)));
  if (withPack) said(await put(api, file()));
  return { api, sql };
}

/** The rule's runs taken to the end the way a host takes them, with the script run in QuickJS. */
async function settle(api: Api, rounds = 3): Promise<void> {
  const refuse = async (): Promise<never> => {
    throw new Error('the insurance script fetches nothing');
  };
  const run = scriptRunner({ run: runInQuickJs, send: refuse, pin: refuse, openKey: refuse, grantOf: () => null, reads: scriptReads(api), now: () => NOW } as never);
  for (let i = 0; i < rounds; i++) {
    await api.kernel.drain();
    await api.kernel.runActions(refuse as never, { script: run, limit: 50 });
  }
}

const write = (api: Api, list: string, fields: Body): string => said<{ id: string }>(api.kernel.create(list, fields as never, { actor: 'p_1' })).id;
const fields = (api: Api, id: string): Body => (api.kernel.get(id) as { fields: Body }).fields;
const usd = (dollars: number): Money => ({ amount: dollars * 100, currency: 'USD' });

/** A premium line in Repeating: monthly from a start day. */
const line = (api: Api, what: string, dollars: number, every: string, started: string, extra: Body = {}): string =>
  write(api, 'recurring', { what, direction: 'out', amount: usd(dollars), every, next_due: '2026-11-25', started, ...extra });

/** A year-by-year illustration as an insurer prints it, in cents. */
const ILLUSTRATION = { rows: [{ year: 2025, low: 100_000, mid: 120_000, high: 150_000 }, { year: 2026, low: 400_000, mid: 520_000, high: 700_000 }, { year: 2030, low: 2_000_000, mid: 2_600_000, high: 3_400_000 }] };

type Reading = { metric: string; reading: { rows?: number; value: number | null; parts?: Money[] } };
type Block = { kind?: string; heading?: string; why?: string; body?: string; readings?: Reading[]; rows?: { fields: Body }[]; refusals: Refusal[] };
type Page = { title: string; blocks: Block[] };
const pageOf = async (api: Api, slug: string): Promise<Page> => said<Page>(await api.page({ slug }, owner));
const under = (page: Page, heading: string): Block => {
  const b = page.blocks.find((x) => x.heading === heading && x.why !== 'when');
  assert.ok(b, `${page.title} draws nothing under ${heading}`);
  return b;
};
const cell = (b: Block, metric: string): Reading['reading'] | undefined => b.readings?.find((r) => r.metric === metric)?.reading;
const cents = (r: Reading['reading'] | undefined): number | null => r?.value ?? (r?.parts?.length === 1 ? r.parts[0]!.amount : null);

/* ── Before the add-on, and the file ─────────────────────────────────────────────────────────────────────────────── */

test('BEFORE THE ADD-ON: a record has no policies list and no Insurance page', async () => {
  const { api, sql } = await record(false);
  assert.equal(api.kernel.register('policies'), undefined, 'policies is already on the record');
  assert.ok(!said<{ slug: string }[]>(await api.pages(owner)).some((p) => p.slug === 'insurance'));
  sql.close();
});

test('THE FILE: one list, a rule and its script, two pages, and no kernel change, on money-core 3', () => {
  const doc = file();
  assert.deepEqual([doc.pack, doc.version, doc.author], ['insurance', '2.0.6', 'BrainDog']);
  assert.deepEqual((doc.requires as Body).packs, { 'money-core': '>=3.0.0 <4.0.0' });
  const kinds = (key: string) => doc.declarations.filter((d) => key in d).map((d) => d[key]);
  assert.deepEqual(kinds('register'), ['policies', 'illustration_years']);
  assert.deepEqual(kinds('page'), ['insurance', 'policy']);
  assert.deepEqual([kinds('rule'), kinds('script')], [['insurance_figures'], ['insurance_figures']]);
  const list = doc.declarations.find((d) => d.register === 'policies')!;
  const byId = new Map((list.fields as { id: string; type: string; to?: string }[]).map((f) => [f.id, f]));
  assert.deepEqual([byId.get('cost')?.type, byId.get('cost')?.to, byId.get('illustration')?.type], ['ref', 'recurring', 'json']);
  assert.doesNotMatch(readFileSync(PACK_FILE, 'utf8'), /—|\bowe/u, 'a dash or a word a money page may not say');
});

test('THE SCRIPT IN THE FILE IS insure.js, byte for byte', () => {
  const script = file().declarations.find((d) => d.script === 'insurance_figures') as { source: string };
  assert.equal(script.source, SOURCE, 'insurance.pack.json and insure.js disagree; copy insure.js into the source');
});

test('INSTALLED FROM THE FILE with nothing refused, and it needs money-core', async () => {
  const { api, sql } = await record(false);
  const diff = await planOf(api, file());
  assert.deepEqual(diff.conflicts, []);
  assert.ok(diff.adds.some((a) => a.id === 'page.insurance'));
  assert.ok(diff.adds.some((a) => a.id === 'register.policies'));
  said(await put(api, file()));
  assert.equal(api.kernel.packs().find((p) => p.id === 'insurance')?.version, '2.0.6');
  sql.close();
});

/* ── The figures a policy gets ───────────────────────────────────────────────────────────────────────────────────── */

test('PREMIUMS PAID: counted from the first day by how often the line comes round, and a short month keeps its last day', async () => {
  const { api, sql } = await record();
  const monthly = line(api, 'Life premium', 250, 'monthly', '2025-11-25');
  const yearly = line(api, 'Savings premium', 1800, 'yearly', '2024-03-31');
  const clamped = line(api, 'Cover premium', 40, 'monthly', '2026-01-31');
  const a = write(api, 'policies', { name: 'Harbour Life', insurer: 'Northgate Assurance', number: 'HL-0042', cost: monthly, cover: usd(250_000), starts_on: '2025-11-25', matures_on: '2045-11-25' });
  const b = write(api, 'policies', { name: 'Fenmoor Saver', insurer: 'Pellbridge Mutual', cost: yearly, starts_on: '2024-03-31', matures_on: '2034-03-31' });
  const c = write(api, 'policies', { name: 'Quay Cover', insurer: 'Northgate Assurance', cost: clamped, starts_on: '2026-01-31' });
  await settle(api);
  /* 25 Nov 2025 to 25 Oct 2026 is twelve payments. */
  assert.deepEqual([fields(api, a).paid, fields(api, a).times, fields(api, a).per_year], [usd(250 * 12), 12, usd(250 * 12)]);
  /* 31 Mar in 2024, 2025 and 2026. */
  assert.deepEqual([fields(api, b).paid, fields(api, b).times], [usd(1800 * 3), 3]);
  /* 31 Jan, 28 Feb, 31 Mar, 30 Apr, 31 May, 30 Jun, 31 Jul, 31 Aug, 30 Sep: nine, and the 31 Oct is still ahead. */
  assert.deepEqual([fields(api, c).paid, fields(api, c).times], [usd(40 * 9), 9]);
  sql.close();
});

test('MORE THAN FIFTY LIVE POLICIES ARE ALL WORKED OUT by the daily run', async () => {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  for (const id of FIRST_PARTY) said(await put(api, firstPartyDocument(id)));
  said(await put(api, file()));
  const monthly = line(api, 'Shared premium', 100, 'monthly', '2025-11-25');
  const ids = Array.from({ length: 60 }, (_, i) => write(api, 'policies', { name: `Policy ${i + 1}`, insurer: 'Northgate Assurance', cost: monthly, starts_on: '2025-11-25' }));
  await settle(api, 12);
  /* THE PREMIUM CHANGED IN REPEATING, which no rule watches: only the daily run, over every live policy, picks it up. */
  said(api.kernel.update('recurring', monthly, { amount: usd(200) } as never, { actor: 'p_1' }));
  clock.advance(24 * 60 * 60_000 + 15 * 60_000 + 1);
  await settle(api, 12);
  assert.equal(ids.filter((id) => (fields(api, id).paid as Money | undefined)?.amount === usd(200).amount * 12).length, 60);
  sql.close();
});

test('THE TERM, AND THE ILLUSTRATION: percent of the term gone, and this year\'s mid figure', async () => {
  const { api, sql } = await record();
  const id = write(api, 'policies', {
    name: 'Harbour Life', insurer: 'Northgate Assurance', cover: usd(250_000), fund_value: usd(4_100), fund_as_of: '2026-09-30',
    starts_on: '2025-11-25', matures_on: '2045-11-25', illustration: ILLUSTRATION,
  });
  await settle(api);
  /* 336 days of 7305 */
  assert.equal(fields(api, id).term_pct, 5);
  assert.deepEqual(fields(api, id).illustrated, { amount: 520_000, currency: 'USD' }, 'this year, not 2030');
  sql.close();
});

test('THE ILLUSTRATION IS LAID OUT A YEAR A ROW WITH ITS AGE, kept level when it changes, and drawn on the policy page', async () => {
  const { api, sql } = await record();
  const years = (): Body[] =>
    sql.all<{ fields: string }>("SELECT fields FROM entry WHERE register = 'illustration_years' AND deleted_at IS NULL").map((r) => JSON.parse(r.fields) as Body).sort((x, y) => Number(x.year) - Number(y.year));
  const id = write(api, 'policies', {
    name: 'Harbour Life', insurer: 'Northgate Assurance', cover: usd(250_000), starts_on: '2025-11-25', matures_on: '2045-11-25', age_at_start: 34, illustration: ILLUSTRATION,
  });
  await settle(api);
  assert.deepEqual(years().map((r) => [r.year, r.age, (r.mid as Money).amount]), [[2025, 34, 120_000], [2026, 35, 520_000], [2030, 39, 2_600_000]]);
  /* ONE YEAR MOVED, ONE TAKEN OUT, ONE ADDED: the rows follow, none twice. */
  said(api.kernel.update('policies', id, { illustration: { rows: [{ year: 2026, age: 40, low: 1, mid: 2, high: 3 }, { year: 2031, low: 4, mid: 5, high: 6 }] } } as never, { actor: 'p_1' }));
  await settle(api);
  assert.deepEqual(years().map((r) => [r.year, r.age, (r.mid as Money).amount]), [[2026, 40, 2], [2031, 40, 5]]);
  const page = await pageOf(api, said<{ slug: string; about?: { register?: string } }[]>(await api.pages(owner)).find((p) => p.about?.register === 'policies')!.slug);
  for (const b of page.blocks) assert.deepEqual(b.refusals, [], `${b.heading ?? b.kind} was refused`);
  assert.deepEqual(under(page, 'Year by year').rows?.map((r) => r.fields.year), [2026, 2031]);
  assert.ok(page.blocks.some((b) => b.kind === 'drawn' && b.heading === 'Illustrated fund by year'), 'the chart is on the page');
  sql.close();
});

test('A POLICY WITH NO PREMIUM LINE OR NO DAYS IS LEFT AS IT IS, and nothing is made up', async () => {
  const { api, sql } = await record();
  const id = write(api, 'policies', { name: 'Old Cover', insurer: 'Northgate Assurance', cover: usd(100_000) });
  await settle(api);
  const f = fields(api, id);
  for (const key of ['paid', 'per_year', 'times', 'term_pct', 'illustrated']) assert.equal(f[key] ?? null, null, `${key} was made up`);
  sql.close();
});

test('A PREMIUM CHANGED IN REPEATING IS PICKED UP THE NEXT TIME, and a line that ended stops counting', async () => {
  const { api, sql } = await record();
  const premium = line(api, 'Life premium', 100, 'monthly', '2026-01-10', { ends: '2026-06-10' });
  const id = write(api, 'policies', { name: 'Short Cover', insurer: 'Northgate Assurance', cost: premium, starts_on: '2026-01-10' });
  await settle(api);
  assert.equal(fields(api, id).times, 6, '10 Jan to 10 Jun');
  sql.close();
});

/* ── What a person sees ──────────────────────────────────────────────────────────────────────────────────────────── */

test('THE PAGE: fund value, cover and premiums a year in one currency, and the policies as cards', async () => {
  const { api, sql } = await record();
  const premium = line(api, 'Life premium', 250, 'monthly', '2025-11-25');
  write(api, 'policies', { name: 'Harbour Life', insurer: 'Northgate Assurance', cost: premium, cover: usd(250_000), fund_value: usd(4_100), fund_as_of: '2026-10-01', starts_on: '2025-11-25', matures_on: '2045-11-25' });
  write(api, 'policies', { name: 'Fenmoor Saver', insurer: 'Pellbridge Mutual', cover: usd(50_000), fund_value: usd(12_000), fund_as_of: '2026-09-01', matures_on: '2034-03-31' });
  await settle(api);
  const page = await pageOf(api, 'insurance');
  for (const b of page.blocks) assert.deepEqual(b.refusals, [], `${b.heading}: ${JSON.stringify(b.refusals)}`);
  const tiles = under(page, 'Your policies');
  assert.equal(cents(cell(tiles, 'policies-fund')), (4_100 + 12_000) * 100);
  assert.equal(cents(cell(tiles, 'policies-cover')), (250_000 + 50_000) * 100);
  assert.equal(cents(cell(tiles, 'policies-year')), 3000 * 100);
  assert.equal(cents(cell(tiles, 'policies-paid')), 3000 * 100);
  assert.equal(under(page, 'Policies').rows?.length, 2);
  /* THE CALM LINE IS DRAWN AND THE WARNING IS NOT, while every fund value is fresh. */
  const lines = page.blocks.filter((b) => b.kind === 'note' && b.why !== 'when').map((b) => b.body ?? '');
  assert.equal(lines.filter((t) => /policies-fund-on/u.test(t) && !/over 90 days/u.test(t)).length, 1, 'the age of the oldest fund value is said');
  assert.equal(lines.filter((t) => /over 90 days/u.test(t)).length, 0);
  sql.close();
});

test('A FUND VALUE OVER NINETY DAYS OLD IS SAID, with the day it is from', async () => {
  const { api, sql } = await record();
  write(api, 'policies', { name: 'Harbour Life', insurer: 'Northgate Assurance', cover: usd(250_000), fund_value: usd(4_100), fund_as_of: '2026-04-01' });
  const page = await pageOf(api, 'insurance');
  const warn = page.blocks.find((b) => b.kind === 'note' && b.why !== 'when' && /over 90 days ago/u.test(b.body ?? ''));
  assert.ok(warn, 'the stale fund is not said');
  assert.match(warn.body ?? '', /\{\{day:policies-fund-on\}\}/u, 'the warning names the day the oldest value is from');
  sql.close();
});

test('EACH POLICY HAS A PAGE with its fund, its age, the premiums paid so far and its maturity', async () => {
  const { api, sql } = await record();
  const premium = line(api, 'Life premium', 250, 'monthly', '2025-11-25');
  write(api, 'policies', { name: 'Harbour Life', insurer: 'Northgate Assurance', number: 'HL-0042', cost: premium, cover: usd(250_000), fund_value: usd(4_100), fund_as_of: '2026-10-01', starts_on: '2025-11-25', matures_on: '2045-11-25', maturity_benefit: usd(90_000) });
  await settle(api);
  const listed = said<{ slug: string; title: string; about?: { register?: string } }[]>(await api.pages(owner));
  const own = listed.filter((p) => p.about?.register === 'policies');
  assert.deepEqual(own.map((p) => p.title), ['Harbour Life'], 'one page per policy, named by it');
  const page = await pageOf(api, own[0]!.slug);
  for (const b of page.blocks) assert.deepEqual(b.refusals, [], `${b.heading ?? b.kind} was refused`);
  const fund = under(page, 'Fund and cover');
  assert.equal(cents(cell(fund, 'policy-fund-at:Harbour Life')), 4_100 * 100);
  const lines = page.blocks.filter((b) => b.kind === 'note' && b.why !== 'when').map((b) => b.body ?? '');
  assert.ok(lines.some((t) => /policy-fund-on-at:Harbour Life/u.test(t)), 'the day the fund value is from is said');
  assert.ok(lines.some((t) => /policy-matures-at:Harbour Life/u.test(t)), 'the maturity is said');
  const paid = under(page, 'Premiums');
  assert.equal(cents(cell(paid, 'policy-paid-at:Harbour Life')), 3000 * 100);
  assert.equal(cell(paid, 'policy-payments-at:Harbour Life')?.value, 12);
  const end = under(page, 'Maturity');
  assert.equal(cents(cell(end, 'policy-benefit-at:Harbour Life')), 90_000 * 100);
  sql.close();
});
