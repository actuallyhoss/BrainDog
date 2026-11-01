/**
 * Debts: a list of what is being paid off, and two plans worked out from it, the avalanche and the snowball.
 *
 * THE SCRIPT IS TESTED TWICE. First alone, in QuickJS, over a host double that answers the two lists it reads, so the
 * arithmetic is held to numbers worked by hand: two debts at no interest clear in a month count anyone can check, and
 * the rest is held to what must be true of any answer (the avalanche never costs more interest than the snowball,
 * the snowball never clears the first debt later). Then the pack as it ships is planned and installed on a record
 * beside money-core, a debt is written the way a person writes one, the rule and the script run, and the page is read.
 *
 * Every name and amount here is invented.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { readPackFile } from '../../packages/declare/src/catalogue.ts';
import { scriptReads, scriptRunner } from '../../packages/host/src/script.ts';
import { createRecordApi, type CallContext } from '../../packages/record/src/index.ts';
import { fixedClock, openSqlite } from '../../packages/kernel/test/sqlite.ts';
import { fixOf } from '../../packages/ports/src/index.ts';
import type { CtxHost, Json, ScriptAnswer, ScriptDecl, ScriptWrite } from '../../packages/script/src/index.ts';
import { runInQuickJs } from '../../packages/script/src/quickjs.ts';
import { firstPartyDocument } from '../../packages/seed/src/index.ts';

const HERE = new URL('./', import.meta.url);
const SOURCE = readFileSync(new URL('payoff.js', HERE), 'utf8');
const TEXT = readFileSync(new URL('debts.pack.json', HERE), 'utf8');
const PACK = JSON.parse(TEXT) as { pack: string; version: string; declarations: Record<string, unknown>[] };
const SCRIPT = PACK.declarations.find((d) => typeof d.script === 'string') as {
  script: string;
  runs: unknown;
  reads: string[];
  writes: string[];
  egress: string[];
  keys: string[];
  source: string;
};
const RULES = PACK.declarations.filter((d) => typeof d.rule === 'string') as { rule: string; on: unknown; steps: unknown[] }[];

const NOW = '2026-10-15T09:00:00.000Z';
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

type Row = { id: string; register: string; seq: number; fields: Record<string, Json>; version: number; updated_at: string };
let minted = 0;
const row = (register: string, fields: Record<string, Json>, updated = NOW): Row => {
  minted += 1;
  return { id: `01K5DEBT${String(minted).padStart(18, '0')}`, register, seq: minted, fields, version: 1, updated_at: updated };
};
const usd = (amount: number): Json => ({ amount, currency: 'USD' });
const debt = (name: string, balance: number, apr: number, minimum: number, currency = 'USD'): Row =>
  row('debts', { name, left: { amount: balance, currency }, apr, minimum: { amount: minimum, currency } });

type Leaf = { field?: string; gt?: number; lte?: number; all?: Leaf[] };
const flat = (w: Leaf | null | undefined): Leaf[] => (w ? (w.all ? w.all.flatMap(flat) : [w]) : []);
const hostOf = (rows: Row[]): CtxHost => ({
  fetch: async () => {
    throw new Error('paying debts off fetches nothing');
  },
  /* A script's list is one page of fifty, in no order of seq, and takes no cursor; a script asks for rows by seq range. */
  list: async (register, where) => {
    const leaves = flat(where as Leaf | null);
    const has = (r: Row, l: Leaf) => (l.field === 'seq' ? (l.gt === undefined || r.seq > l.gt) && (l.lte === undefined || r.seq <= l.lte) : true);
    return rows.filter((r) => r.register === register && leaves.every((l) => has(r, l))).sort((a, b) => ((a.seq * 7919) % 1009) - ((b.seq * 7919) % 1009)).slice(0, 50) as unknown as Json[];
  },
  now: () => NOW,
  tz: 'UTC',
  input: {},
});
const decl = (): ScriptDecl => ({ id: SCRIPT.script, version: 1, egress: SCRIPT.egress, keys: SCRIPT.keys, reads: SCRIPT.reads, writes: SCRIPT.writes, source: SCRIPT.source });
const writesOf = (a: ScriptAnswer): ScriptWrite[] => {
  assert.ok('writes' in a, `the run was refused: ${JSON.stringify(a)}`);
  return a.writes;
};
type Patch = Record<string, Json>;
/** The plan the run wrote for one way, whether it created it or updated it. */
const planOf = (w: ScriptWrite[], method: string): Patch => {
  const hit = w.find((x) => ((x as { fields?: Patch; patch?: Patch }).fields ?? (x as { patch?: Patch }).patch)?.how === method) as { fields?: Patch; patch?: Patch } | undefined;
  assert.ok(hit, `no plan for ${method}`);
  return (hit.fields ?? hit.patch) as Patch;
};

test('THE PACK CARRIES payoff.js AS ITS SOURCE, byte for byte, fetches nothing, and is started by a debt or by the extra changing', async () => {
  assert.equal(SCRIPT.source, SOURCE, 'debts.pack.json and payoff.js disagree; copy payoff.js into the source');
  assert.deepEqual(SCRIPT.runs, { rule: true });
  assert.deepEqual([SCRIPT.egress, SCRIPT.keys], [[], []]);
  assert.deepEqual([...SCRIPT.reads].sort(), ['debts', 'payoff_plans']);
  assert.deepEqual(SCRIPT.writes, ['payoff_plans']);
  assert.deepEqual(RULES.map((r) => r.on), [
    { written: { register: 'debts', op: ['create', 'update', 'delete'] } },
    { written: { register: 'payoff_plans', op: ['update'], fields: ['extra'] } },
  ]);
  const file = await readPackFile(TEXT);
  assert.ok(file.ok, fixOf(file));
  assert.equal(file.value.pack.manifest.pack, 'debts');
  assert.equal(PACK.version, '2.1.1');
});

test('TWO DEBTS AT NO INTEREST: 300 and 600, 50 minimum each and 100 extra, clear in 5 months, against 12 at the minimums', async () => {
  const a = debt('Phone', 30_000, 0, 5_000);
  const b = debt('Sofa', 60_000, 0, 5_000);
  const set = row('payoff_plans', { how: 'avalanche', extra: usd(10_000), used: usd(0) });
  const w = writesOf(await runInQuickJs(decl(), hostOf([a, b, set])));
  for (const method of ['avalanche', 'snowball']) {
    const p = planOf(w, method);
    assert.equal(p.mos, 5);
    assert.equal(p.takes, '5 months');
    assert.equal(p.debt_free, '2027-03-15');
    assert.deepEqual(p.interest, usd(0));
    assert.deepEqual(p.saved, usd(0));
    assert.equal(p.sooner, 7, 'the minimums alone take 12 months, the Sofa');
    assert.equal(p.order, 'Phone (2 months), then Sofa (5 months)');
  }
});

test('MORE THAN FIFTY DEBTS ARE ALL IN THE PLAN, not the first page', async () => {
  const many = Array.from({ length: 60 }, (_, i) => debt(`Debt ${i + 1}`, 10_000, 0, 10_000));
  const w = writesOf(await runInQuickJs(decl(), hostOf(many)));
  for (const method of ['avalanche', 'snowball']) {
    const order = String(planOf(w, method).order);
    for (let i = 1; i <= 60; i++) assert.match(order, new RegExp(`Debt ${i} \\(`), `${method} left out Debt ${i}`);
  }
});

test('THE EXTRA IS PAID EVERY MONTH AND A PAID-OFF MINIMUM IS PASSED ON, so the same two debts with 100 extra finish sooner than with none', async () => {
  const rows = [debt('Phone', 30_000, 0, 5_000), debt('Sofa', 60_000, 0, 5_000)];
  const nothing = planOf(writesOf(await runInQuickJs(decl(), hostOf(rows))), 'avalanche');
  const plans = [row('payoff_plans', { how: 'avalanche', extra: usd(10_000), used: usd(0) })];
  const more = planOf(writesOf(await runInQuickJs(decl(), hostOf([...rows, ...plans]))), 'avalanche');
  assert.equal(nothing.mos, 9, 'with no extra the Phone minimum passes on once it is paid, after month 6, and the Sofa ends in month 9');
  assert.equal(more.mos, 5);
});

test('THE AVALANCHE COSTS THE LEAST INTEREST AND THE SNOWBALL CLEARS THE SMALLEST FIRST', async () => {
  const card = debt('Store card', 400_000, 27, 12_000);
  const small = debt('Laptop plan', 80_000, 5, 6_000);
  const car = debt('Car loan', 900_000, 9, 20_000);
  const extra = row('payoff_plans', { how: 'avalanche', extra: usd(30_000), used: usd(0) });
  const w = writesOf(await runInQuickJs(decl(), hostOf([card, small, car, extra])));
  const av = planOf(w, 'avalanche');
  const sn = planOf(w, 'snowball');
  assert.ok((av.interest as { amount: number }).amount < (sn.interest as { amount: number }).amount, 'the avalanche pays less interest');
  assert.ok(Number(av.mos) <= Number(sn.mos));
  assert.match(String(av.order), /^Store card \(\d+ months?\), then /);
  assert.match(String(sn.order), /^Laptop plan \(\d+ months?\), then /);
  assert.ok((av.saved as { amount: number }).amount > (sn.saved as { amount: number }).amount - 1, 'saved is the minimums\' interest less the plan\'s');
  assert.equal((av.saved as { amount: number }).amount, (av.minimum_interest as { amount: number }).amount - (av.interest as { amount: number }).amount);
  assert.ok(Number(av.sooner) > 0);
  assert.deepEqual(av.used, usd(30_000));
});

test('THE EXTRA A PERSON EDITED IS TAKEN FOR BOTH PLANS, the newest edit when both differ', async () => {
  const rows = [debt('Phone', 30_000, 0, 5_000), debt('Sofa', 60_000, 0, 5_000)];
  const av = row('payoff_plans', { how: 'avalanche', extra: usd(0), used: usd(0) }, '2026-10-01T00:00:00.000Z');
  const sn = row('payoff_plans', { how: 'snowball', extra: usd(10_000), used: usd(0) }, '2026-10-14T00:00:00.000Z');
  const w = writesOf(await runInQuickJs(decl(), hostOf([...rows, av, sn])));
  for (const method of ['avalanche', 'snowball']) assert.deepEqual(planOf(w, method).used, usd(10_000), method);
  assert.deepEqual(planOf(w, 'avalanche').extra, usd(10_000), 'the plan that was not edited is given it');
  /* AND A PLAN THAT ALREADY HOLDS WHAT IT WAS WORKED WITH IS NOT WRITTEN OVER with the same extra. */
  const settled = row('payoff_plans', { how: 'snowball', extra: usd(10_000), used: usd(10_000) });
  assert.equal('extra' in planOf(writesOf(await runInQuickJs(decl(), hostOf([...rows, settled]))), 'snowball'), false);
});

test('A MINIMUM THAT DOES NOT COVER THE INTEREST NEVER ENDS, and the plan names the debt instead of giving a date', async () => {
  const w = writesOf(await runInQuickJs(decl(), hostOf([debt('Old card', 500_000, 36, 10_000)])));
  const p = planOf(w, 'avalanche');
  assert.equal(p.mos, null);
  assert.equal(p.debt_free, null);
  assert.match(String(p.said), /The minimum on Old card does not cover its interest/);
  /* WITH AN EXTRA IT DOES END, and there is nothing to compare with, which it says. */
  const extra = row('payoff_plans', { how: 'avalanche', extra: usd(30_000), used: usd(0) });
  const q = planOf(writesOf(await runInQuickJs(decl(), hostOf([debt('Old card', 500_000, 36, 10_000), extra]))), 'avalanche');
  assert.ok(typeof q.mos === 'number');
  assert.equal(q.saved, null);
  assert.match(String(q.said), /never ends, so there is nothing to compare with/);
});

test('A DEBT IN ANOTHER CURRENCY IS LEFT OUT AND SAID, because two currencies are never added', async () => {
  const w = writesOf(await runInQuickJs(decl(), hostOf([debt('Phone', 30_000, 0, 5_000), debt('Sofa', 60_000, 0, 5_000), debt('Bike', 90_000, 0, 5_000, 'EUR')])));
  const p = planOf(w, 'avalanche');
  assert.equal(p.mos, 9, 'the two dollar debts alone, with no extra');
  assert.match(String(p.said), /1 debt in another currency than USD was left out/);
});

test('A DEBT WITH NOTHING LEFT IS NOT A DEBT, and with none at all no plan is made', async () => {
  const a = await runInQuickJs(decl(), hostOf([debt('Paid card', 0, 20, 5_000)]));
  assert.deepEqual(writesOf(a), []);
  assert.match(a.log, /no debts with a balance/);
});

/* ── The pack on a record ──────────────────────────────────────────────────────────────────────── */

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };
const said = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};
type Api = Awaited<ReturnType<typeof createRecordApi>>;
type Block = { kind: string; heading?: string; rows: { id: string; fields: Record<string, unknown> }[]; refusals: unknown[] };
type Page = { title: string; blocks: Block[] };

async function put(api: Api, doc: unknown): Promise<void> {
  const diff = said<{ diff: { planHash: string; approve: unknown[] } }>(await api.planPack({ doc, source: { kind: 'local' } } as never, owner)).diff;
  said(await api.installPack({ doc, source: { kind: 'local' }, planHash: diff.planHash, approve: diff.approve } as never, owner));
}

async function settle(api: Api): Promise<void> {
  const refuse = async (): Promise<never> => {
    throw new Error('paying debts off fetches nothing');
  };
  const at = Date.parse(NOW);
  const run = scriptRunner({ run: runInQuickJs, send: refuse, pin: refuse, openKey: refuse, grantOf: () => null, reads: scriptReads(api), now: () => at } as never);
  for (let i = 0; i < 3; i++) {
    await api.kernel.drain();
    const ran = (await api.kernel.runActions(refuse as never, { script: run, limit: 50 })) as { refused: number; failed: number };
    assert.deepEqual([ran.refused, ran.failed], [0, 0], 'the plan run was refused or failed');
  }
}

async function fresh(): Promise<{ api: Api; sql: ReturnType<typeof openSqlite>; close: () => void }> {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.parse(NOW)) });
  for (const id of ['portfolio', 'people', 'money-core']) await put(api, firstPartyDocument(id, { seeds: [] }));
  await put(api, JSON.parse(TEXT));
  return { api, sql, close: () => sql.close() };
}

test('INSTALLED BESIDE MONEY-CORE: a debt written by a person makes both plans, and the Debts page shows them and the debt', async () => {
  const { api, sql, close } = await fresh();
  const page0 = said<Page>(await api.page({ slug: 'debts' }, owner));
  assert.deepEqual(page0.blocks.map((b) => b.heading), [undefined, 'Payoff plans', 'The two compared', undefined, 'What you are paying off', 'Add a debt']);
  assert.deepEqual(page0.blocks.map((b) => b.refusals), [[], [], [], [], [], []]);
  assert.equal(page0.blocks[1]!.rows.length, 0, 'no plan until there is a debt');

  for (const [name, balance, apr, minimum] of [['Phone', 30_000, 0, 5_000], ['Sofa', 60_000, 0, 5_000]] as const)
    said(await api.create({ register: 'debts', fields: { name, left: usd(balance), apr, minimum: usd(minimum) } }, owner));
  await settle(api);
  const page = said<Page>(await api.page({ slug: 'debts' }, owner));
  const plans = page.blocks.find((b) => b.heading === 'Payoff plans')!;
  assert.deepEqual(plans.rows.map((r) => [r.fields.how, r.fields.takes]).sort(), [['avalanche', '9 months'], ['snowball', '9 months']]);
  assert.equal(page.blocks.find((b) => b.heading === 'What you are paying off')!.rows.length, 2);

  /* A CHANGED EXTRA IS WORKED AGAIN, on both plans. */
  const seqs = sql.all<{ seq: number; fields: string }>("SELECT seq, fields FROM entry WHERE register = 'payoff_plans' AND deleted_at IS NULL");
  const av = seqs.find((r) => (JSON.parse(r.fields) as { how: string }).how === 'avalanche')!;
  said(await api.update({ register: 'payoff_plans', seq: av.seq, patch: { extra: usd(25_000) } } as never, owner));
  await settle(api);
  const again = said<Page>(await api.page({ slug: 'debts' }, owner)).blocks.find((b) => b.heading === 'Payoff plans')!;
  assert.deepEqual(again.rows.map((r) => [r.fields.how, r.fields.takes, r.fields.extra]).sort(), [
    ['avalanche', '3 months', usd(25_000)],
    ['snowball', '3 months', usd(25_000)],
  ]);
  close();
});

test('NO TEXT OF THE PACK SAYS "owe", and the page opens with a lead note', () => {
  assert.doesNotMatch(TEXT.replace(SOURCE.slice(0, 0), '').replace(/"source": "(?:[^"\\]|\\.)*"/, ''), /\bowe/i);
  const page = PACK.declarations.find((d) => typeof d.page === 'string') as { blocks: { kind: string; lead?: boolean }[] };
  assert.deepEqual([page.blocks[0]!.kind, page.blocks[0]!.lead], ['note', true]);
});
