/**
 * Property: a flat or a house paid in parts. The plan gains what it is worth, its price, who builds it, when it is
 * handed over and a loan; a page says the equity, the parts paid as a line and the parts to come; and two scripts make
 * the parts, one from a price and one from a pasted list.
 *
 * NO KERNEL CHANGE. Everything here is the file `property.pack.json` laying fields on the Plans and Instalments that
 * Money already has, three scripts, a handful of figures and two pages. The scripts are `make.js`, `paste.js` and
 * `sums.js`, each carried byte for byte in the file. Every plan, developer and amount below is invented.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readPackFile } from '../../packages/declare/src/catalogue.ts';
import { fixOf } from '../../packages/ports/src/index.ts';
import type { CallContext } from '../../packages/record/src/index.ts';
import type { CtxHost, Json, ScriptAnswer, ScriptDecl, ScriptWrite } from '../../packages/script/src/index.ts';
import { runInQuickJs } from '../../packages/script/src/quickjs.ts';
import { firstPartyDocument } from '../../packages/seed/src/index.ts';

const HERE = new URL('./', import.meta.url);
const TEXT = readFileSync(new URL('property.pack.json', HERE), 'utf8');
type Decl = Record<string, unknown>;
const PACK = JSON.parse(TEXT) as { pack: string; requires: { packs: Record<string, string> }; extends: Record<string, { fields: { id: string; type: string }[] }>; declarations: Decl[] };
const scriptOf = (id: string) => PACK.declarations.find((d) => d.script === id) as { script: string; runs: Record<string, unknown>; egress: string[]; keys: string[]; reads: string[]; writes: string[]; source: string };
const ruleOf = (id: string) => PACK.declarations.find((d) => d.rule === id) as { rule: string; on: { written: { register: string; fields: string[] } }; steps: { script: { id: string } }[] };

const NOW = '2026-10-27T09:00:00.000Z';
const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAF';

/* ── The pack ──────────────────────────────────────────────────────────────────────────────────── */

test('THE PACK CARRIES ITS THREE SCRIPTS BYTE FOR BYTE, and each calls nobody and writes only plans and instalments', async () => {
  for (const [id, file] of [['property_make', 'make.js'], ['property_paste', 'paste.js'], ['property_sums', 'sums.js']] as const) {
    const s = scriptOf(id);
    assert.equal(s.source, readFileSync(new URL(file, HERE), 'utf8'), `property.pack.json and ${file} disagree; copy ${file} into the source`);
    assert.deepEqual([s.egress, s.keys], [[], []]);
    assert.deepEqual([[...s.reads].sort(), [...s.writes].sort()], [['installments', 'plans'], ['installments', 'plans']]);
  }
  const file = await readPackFile(TEXT);
  assert.ok(file.ok, fixOf(file));
  assert.equal(file.value.pack.manifest.pack, 'property');
  /* 1.0.3 SINCE 1 November (d68fb4080): what to add while it is empty. */
  assert.equal(file.value.pack.manifest.version, '1.0.3');
  assert.deepEqual(PACK.requires.packs, { 'money-core': '>=3.29.0 <4.0.0' });
});

test('IT LAYS FIELDS ON PLANS AND ONE ON INSTALMENTS, and declares no list of its own', () => {
  assert.deepEqual(Object.keys(PACK.extends).sort(), ['register.installments', 'register.plans']);
  const plans = PACK.extends['register.plans']!.fields.map((f) => f.id);
  for (const id of ['value', 'price', 'developer', 'delivers_on', 'mortgage_principal', 'mortgage_rate', 'mortgage_years']) assert.ok(plans.includes(id), `plans lack ${id}`);
  assert.deepEqual(PACK.extends['register.installments']!.fields.map((f) => f.id), ['paid_to_date']);
  assert.equal(PACK.declarations.filter((d) => 'register' in d).length, 0);
});

test('EACH RULE WATCHES WHAT A PERSON TYPES AND NOTHING A SCRIPT WRITES, so no script starts itself again', () => {
  assert.deepEqual(ruleOf('property_make').on.written.fields, ['make_how', 'make_first']);
  assert.deepEqual(ruleOf('property_paste').on.written.fields, ['paste']);
  const written = ['paid', 'left', 'equity', 'mortgage_monthly', 'mortgage_interest', 'plan_said', 'paid_to_date'];
  for (const r of ['property_make', 'property_paste', 'property_sums_part', 'property_sums_plan']) for (const f of ruleOf(r).on.written.fields) assert.equal(written.includes(f), false, `${r} watches ${f}, which a script writes`);
});

test('NO PAGE SAYS "OWE", and every page opens with a lead sentence', () => {
  assert.doesNotMatch(TEXT, /\bowe/i);
  for (const p of PACK.declarations.filter((d) => 'page' in d) as { blocks: { kind: string; lead?: boolean }[] }[]) assert.deepEqual([p.blocks[0]!.kind, p.blocks[0]!.lead], ['note', true]);
});

/* ── The scripts, in QuickJS ───────────────────────────────────────────────────────────────────── */

type Row = { id: string; register: string; seq: number; fields: Record<string, Json>; version: number; updated_at: string };
const row = (id: string, register: string, seq: number, fields: Record<string, Json>, version = 1): Row => ({ id, register, seq, fields, version, updated_at: NOW });
const egp = (pounds: number) => ({ amount: Math.round(pounds * 100), currency: 'EGP' });

type Leaf = { field?: string; is?: Json; gt?: number; lte?: number; all?: Leaf[] };
const flat = (w: Leaf | null | undefined): Leaf[] => (w ? (w.all ? w.all.flatMap(flat) : [w]) : []);
const hostOf = (input: Row, rows: Row[]): CtxHost => ({
  fetch: async () => {
    throw new Error('property fetches nothing');
  },
  get: async (spoken) => ([input, ...rows].find((r) => r.id === spoken) ?? null) as unknown as Json,
  list: async (register, where) => {
    /* A script's list is one page of fifty in no order of seq and takes no cursor; a script asks for rows by seq range. */
    const leaves = flat(where as Leaf | null);
    const has = (r: Row, l: Leaf) => (l.field === 'seq' ? (l.gt === undefined || r.seq > l.gt) && (l.lte === undefined || r.seq <= l.lte) : r.fields[l.field!] === l.is);
    return rows.filter((r) => r.register === register && leaves.every((l) => has(r, l))).sort((a, b) => ((a.seq * 7919) % 1009) - ((b.seq * 7919) % 1009)).slice(0, 50) as unknown as Json[];
  },
  now: () => NOW,
  tz: 'UTC',
  input: { id: input.id, register: input.register, seq: input.seq },
});
const decl = (id: string): ScriptDecl => {
  const s = scriptOf(id);
  return { id: s.script, version: 1, egress: s.egress, keys: s.keys, reads: s.reads, writes: s.writes, source: s.source };
};
const writesOf = (a: ScriptAnswer): Record<string, any>[] => {
  assert.ok('writes' in a, `the run was refused: ${JSON.stringify(a)}`);
  return a.writes as unknown as Record<string, any>[];
};
const PLAN_ID = '01K5PLN0000000000000000001';
const plan = (fields: Record<string, Json>, version = 2) => row(PLAN_ID, 'plans', 1, { name: 'Palm Court 12', state: 'open', ...fields }, version);
const made = async (script: string, p: Row, rows: Row[] = []) => writesOf(await runInQuickJs(decl(script), hostOf(p, rows)));
const parts = (w: Record<string, any>[]) => w.filter((x) => x.op === 'create' && x.register === 'installments').map((x) => x.fields as Record<string, any>);
const planPatch = (w: Record<string, any>[]) => w.find((x) => x.op === 'update' && x.spoken === 'plans#1')?.patch as Record<string, any>;

test('GENERATE, EQUAL PARTS: the parts add up to the price, rounding goes to the last, and a month-end day stays in its month', async () => {
  const w = await made('property_make', plan({ price: egp(1_000_000.01), make_how: 'equal', make_first: '2027-01-31', make_parts: 3, make_every: 'monthly' }));
  const p = parts(w);
  assert.deepEqual(p.map((x) => x.due), ['2027-01-31', '2027-02-28', '2027-03-31']);
  assert.deepEqual(p.map((x) => x.amount.amount), [33_333_333, 33_333_333, 33_333_335]);
  assert.equal(p.reduce((a, x) => a + x.amount.amount, 0), 100_000_001);
  assert.deepEqual(p.map((x) => [x.number, x.parts, x.direction, x.state, x.plan, x.plan_row]), [1, 2, 3].map((n) => [n, 3, 'out', 'open', 'Palm Court 12', PLAN_ID]));
  assert.deepEqual(planPatch(w), { make_how: null, make_first: null, make_parts: null, make_every: null, make_down: null, plan_said: 'Made 3 parts from 2027-01-31.' });
});

test('GENERATE, A DOWN PAYMENT THEN QUARTERLY PARTS: the down payment is the first part and the rest follow it', async () => {
  const w = await made('property_make', plan({ price: egp(2_000_000), account: 'acc_1', make_how: 'down_equal', make_down: egp(400_000), make_first: '2026-12-15', make_parts: 4, make_every: 'quarterly' }));
  const p = parts(w);
  assert.deepEqual(p.map((x) => x.amount.amount), [40_000_000, 40_000_000, 40_000_000, 40_000_000, 40_000_000]);
  assert.deepEqual(p.map((x) => x.due), ['2026-12-15', '2027-03-15', '2027-06-15', '2027-09-15', '2027-12-15']);
  assert.ok(p.every((x) => x.account === 'acc_1' && x.parts === 5));
});

test('GENERATE, A LOAN PAID MONTHLY: equal amounts, the last takes what rounding left, and the interest is the difference', async () => {
  const w = await made('property_make', plan({ mortgage_principal: egp(1_200_000), mortgage_rate: 12, mortgage_years: 1, make_how: 'mortgage', make_first: '2027-02-01' }));
  const p = parts(w);
  assert.equal(p.length, 12);
  const total = p.reduce((a, x) => a + x.amount.amount, 0);
  /* 1,200,000 at 1% a month over 12 months pays 106,618.55 a month: the standard annuity. */
  assert.equal(p[0]!.amount.amount, 10_661_855);
  assert.ok(Math.abs(p[11]!.amount.amount - p[0]!.amount.amount) < 12, 'the last part is within rounding of the others');
  const patch = planPatch(w);
  assert.deepEqual(patch.mortgage_monthly, egp(106_618.55));
  assert.equal(patch.mortgage_interest.amount, total - 120_000_000);
});

test('GENERATE NEVER ADDS TO A PLAN THAT HAS PARTS, and says so; a bad down payment is said, not guessed', async () => {
  const have = row('01K5INS0000000000000000001', 'installments', 1, { what: 'Part 1', plan: 'Palm Court 12', plan_row: PLAN_ID, amount: egp(10), due: '2026-11-01', direction: 'out', state: 'open' });
  const w = await made('property_make', plan({ price: egp(100), make_how: 'equal', make_first: '2027-01-01', make_parts: 2 }), [have]);
  assert.equal(parts(w).length, 0);
  assert.match(planPatch(w).plan_said, /already has parts/);
  const bad = await made('property_make', plan({ price: egp(100), make_how: 'down_equal', make_down: egp(100), make_first: '2027-01-01', make_parts: 2 }));
  assert.equal(parts(bad).length, 0);
  assert.match(planPatch(bad).plan_said, /less than the price/);
  const none = await made('property_make', plan({ make_how: 'equal', make_first: '2027-01-01', make_parts: 2 }));
  assert.match(planPatch(none).plan_said, /price/);
  assert.deepEqual(await made('property_make', plan({ price: egp(100), make_parts: 2 })), [], 'nothing is made until the way and the first day are both said');
});

const PASTED = ['Date;Amount;Label', '15/03/2027;"250,000.50";Second part', '15/12/2026;400000;Down payment', 'soon;100;?', '2027-06-15; E£ 250.000,00 ;'].join('\n');

test('PASTE: day-first and year-first dates, quoted and thousands-marked amounts, a heading skipped, a bad line counted', async () => {
  const w = await made('property_paste', plan({ price: egp(900_000), paste: PASTED }));
  const p = parts(w);
  assert.deepEqual(p.map((x) => [x.due, x.amount.amount, x.what]), [
    ['2026-12-15', 40_000_000, 'Down payment'],
    ['2027-03-15', 25_000_050, 'Second part'],
    ['2027-06-15', 25_000_000, 'Palm Court 12, part 3 of 3'],
  ]);
  assert.ok(p.every((x) => x.amount.currency === 'EGP' && x.parts === 3));
  assert.deepEqual(planPatch(w), { paste: null, plan_said: 'Pasted 3 parts, and left out 1 line it could not read.' });
});

test('PASTE: tabs separate as well, and a plan with no price has no currency to read the amounts in', async () => {
  const tabs = parts(await made('property_paste', plan({ price: egp(1), paste: '2027-01-01\t1,000\tOne\n2027-02-01\t1,000\tTwo' })));
  assert.deepEqual(tabs.map((x) => x.amount.amount), [100_000, 100_000]);
  const w = await made('property_paste', plan({ paste: '2027-01-01, 100' }));
  assert.equal(parts(w).length, 0);
  assert.match(planPatch(w).plan_said, /price/);
});

const part = (n: number, due: string, amount: number, state: string, more: Record<string, Json> = {}) =>
  row(`01K5INS00000000000000000${String(n).padStart(2, '0')}`, 'installments', n, { what: `Part ${n}`, plan: 'Palm Court 12', plan_row: PLAN_ID, number: n, amount: egp(amount), due, direction: 'out', state, ...more });

test('SUMS: paid, left and equity, the running total on each paid part, a cancelled part and another currency left out', async () => {
  const rows = [
    part(1, '2026-01-01', 100, 'paid'),
    part(2, '2026-04-01', 150, 'paid'),
    part(3, '2026-07-01', 200, 'open'),
    part(4, '2026-10-01', 250, 'open'),
    part(5, '2026-11-01', 999, 'cancelled'),
    part(6, '2026-12-01', 5, 'open', { amount: { amount: 500, currency: 'USD' } }),
  ];
  const p = plan({ value: egp(1000), price: egp(700) });
  const w = writesOf(await runInQuickJs(decl('property_sums'), hostOf(p, [p, ...rows])));
  const on = (seq: number) => w.find((x) => x.spoken === `installments#${seq}`)?.patch;
  assert.deepEqual(on(1), { paid_to_date: egp(100) });
  assert.deepEqual(on(2), { paid_to_date: egp(250) });
  assert.equal(on(3), undefined);
  assert.deepEqual(planPatch(w), { paid: egp(250), left: egp(450), equity: egp(550) });
  /* RUN AGAIN OVER WHAT IT WROTE and nothing more is written, so it cannot start itself. */
  const settled = rows.map((r) => (r.seq === 1 ? { ...r, fields: { ...r.fields, paid_to_date: egp(100) } } : r.seq === 2 ? { ...r, fields: { ...r.fields, paid_to_date: egp(250) } } : r));
  const again = plan({ value: egp(1000), price: egp(700), paid: egp(250), left: egp(450), equity: egp(550) });
  assert.deepEqual(writesOf(await runInQuickJs(decl('property_sums'), hostOf(again, [again, ...settled]))), []);
});

test('SUMS: A PLAN OF MORE THAN FIFTY PARTS IS SUMMED WHOLE, not on its first page', async () => {
  const rows = Array.from({ length: 130 }, (_, i) => part(i + 1, `2026-01-${String((i % 28) + 1).padStart(2, '0')}`, 10, i < 70 ? 'paid' : 'open'));
  const p = plan({ value: egp(5000) });
  const w = writesOf(await runInQuickJs(decl('property_sums'), hostOf(p, [p, ...rows])));
  assert.deepEqual(planPatch(w), { paid: egp(700), left: egp(600), equity: egp(4400) });
});

test('SUMS: a paid part put back to open loses its running total, and a plan with no money on it is left alone', async () => {
  const back = part(1, '2026-01-01', 100, 'open', { paid_to_date: egp(100) });
  const p = plan({ value: egp(300) });
  const w = writesOf(await runInQuickJs(decl('property_sums'), hostOf(p, [p, back])));
  assert.deepEqual(w.find((x) => x.spoken === 'installments#1')?.patch, { paid_to_date: null });
  assert.deepEqual(planPatch(w), { paid: egp(0), left: egp(100), equity: egp(200) });
  const bare = plan({});
  assert.deepEqual(writesOf(await runInQuickJs(decl('property_sums'), hostOf(bare, [bare]))), []);
});

test('SUMS: a loan on the plan gets its monthly amount and its interest, the same as Generate works them', async () => {
  const p = plan({ mortgage_principal: egp(1_200_000), mortgage_rate: 12, mortgage_years: 1 });
  const patch = planPatch(writesOf(await runInQuickJs(decl('property_sums'), hostOf(p, [p]))));
  assert.deepEqual(patch.mortgage_monthly, egp(106_618.55));
  const made2 = planPatch(await made('property_make', plan({ mortgage_principal: egp(1_200_000), mortgage_rate: 12, mortgage_years: 1, make_how: 'mortgage', make_first: '2027-02-01' })));
  assert.deepEqual(patch.mortgage_interest, made2.mortgage_interest);
});

/* ── The whole path ────────────────────────────────────────────────────────────────────────────── */

test('THE WHOLE PATH ON A SELF-HOST: make the parts, pay two, and the page says the equity and draws the line', async () => {
  const { start } = await import('../../apps/selfhost/src/server.ts');
  const dir = mkdtempSync(join(tmpdir(), 'braindog-property-'));
  const running = await start({
    file: join(dir, 'record.brain'),
    directory: join(dir, 'directory.sqlite'),
    port: 0,
    host: '127.0.0.1',
    pollMs: 0,
    actions: { openKey: async () => null, send: async () => new Response('{}'), resolve: async () => [] },
  });
  try {
    const person = running.directory.person$('ada@example.test', 'Ada');
    assert.ok(person.ok);
    const api = running.api;
    assert.ok((await api.createRecord({ id: REC, slug: 'studio', name: 'Studio', tz: 'UTC', locale: 'en', owner: { id: person.value.id, email: 'ada@example.test', name: 'Ada' } })).ok);
    const owner: CallContext = { principal: { kind: 'person', id: person.value.id, level: 'owner' } };
    const said = <T>(r: unknown): T => {
      const x = r as { ok: boolean; value: T };
      assert.ok(x.ok, fixOf(x as never));
      return x.value;
    };
    const put = async (doc: unknown) => {
      const planned = said<{ diff: { planHash: string; approve: string[] } }>(await api.planPack({ doc, source: { kind: 'local' } } as never, owner));
      said(await api.installPack({ doc, source: { kind: 'local' }, planHash: planned.diff.planHash, approve: planned.diff.approve } as never, owner));
    };
    for (const id of ['portfolio', 'people', 'money-core']) await put(firstPartyDocument(id, { seeds: [] }));
    await put(PACK);
    const settle = async () => {
      await running.drain();
      await running.poll();
    };
    const entries = (register: string) =>
      running.sql
        .all<{ id: string; fields: string }>(`SELECT id, fields FROM entry WHERE register = '${register}' AND deleted_at IS NULL ORDER BY seq`)
        .map((r) => ({ id: r.id, f: JSON.parse(r.fields) as Record<string, any> }));

    const flat = said<{ id: string }>(await api.create({ register: 'plans', fields: { name: 'Palm Court 12', developer: 'Harbour Homes', price: egp(1_000), value: egp(1_200), delivers_on: '2029-06-30' } }, owner));
    await settle();
    said(await api.update({ register: 'plans', seq: api.kernel.get(flat.id)!.seq!, patch: { make_how: 'equal', make_first: '2026-09-01', make_parts: 4, make_every: 'quarterly' } }, owner));
    await settle();
    const made4 = entries('installments');
    assert.deepEqual(made4.map((e) => [e.f.due, e.f.amount.amount, e.f.plan_row === flat.id]), [
      ['2026-09-01', 25_000, true],
      ['2026-12-01', 25_000, true],
      ['2027-03-01', 25_000, true],
      ['2027-06-01', 25_000, true],
    ]);
    assert.equal(api.kernel.get(flat.id)?.fields.make_how ?? null, null, 'the choices are cleared once made');

    /* TWO PARTS PAID: the plan has paid 500, has 500 left and 700 of equity, and the paid parts carry their running total. */
    for (const e of made4.slice(0, 2)) said(await api.update({ register: 'installments', seq: api.kernel.get(e.id)!.seq!, patch: { state: 'paid', settled: e.f.due } }, owner));
    await settle();
    const f = api.kernel.get(flat.id)?.fields as Record<string, { amount: number }>;
    assert.deepEqual([f.paid?.amount, f.left?.amount, f.equity?.amount], [50_000, 50_000, 70_000]);
    assert.deepEqual(entries('installments').map((e) => e.f.paid_to_date?.amount ?? null), [25_000, 50_000, null, null]);

    const overview = said<{ title: string; blocks: { kind: string; heading?: string; refusals: unknown[]; rows?: { fields: Record<string, any> }[] }[] }>(await api.page({ slug: 'properties' }, owner));
    for (const b of overview.blocks) assert.deepEqual(b.refusals, [], `${b.heading ?? b.kind} was refused on the overview`);
    const table = overview.blocks.find((b) => b.heading === 'Your property')!;
    assert.deepEqual(table.rows?.map((r) => r.fields.name), ['Palm Court 12']);
    const one = said<{ title: string; blocks: { kind: string; heading?: string; why?: string; body?: string; refusals: unknown[]; rows?: unknown[] }[] }>(await api.page({ slug: said<{ slug: string; title?: string; about?: { register: string } | null }[]>(await api.pages(owner)).find((p) => p.title === 'Palm Court 12, property')!.slug }, owner));
    for (const b of one.blocks) assert.deepEqual(b.refusals, [], `${b.heading ?? b.kind} was refused on the plan`);
    const drawn = (h: string) => one.blocks.find((b) => b.heading === h && b.why !== 'when');
    assert.equal(drawn('Upcoming')?.rows?.length, 2);
    assert.equal(drawn('Paid')?.rows?.length, 2);
    assert.ok(drawn('Paid in all, over time'), 'the line is drawn once a part is paid');
  } finally {
    await running.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
