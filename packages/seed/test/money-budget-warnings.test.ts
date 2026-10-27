/**
 * A budget's warnings (money-core 3.29.0): a category past the share of its budget it warns at is told once that month,
 * and once more when it goes over; and Cash in other currencies, the share of Cash now held outside the home currency.
 *
 * THE CLOCK STARTS ON 20 OCTOBER 2026. Every name and amount is invented.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Entry, type Kernel, type ScriptAnswer, type Scripted } from '@braindog/kernel';
import { sayOf } from '@braindog/ports';
import { openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';

import { automationDeclarations, declarations, firstPartyDocument, metricDeclarations, pageDeclarations, ruleDeclarations } from '../src/index.ts';
import { MONEY_METRICS, MONEY_PAGES } from '../src/modules/money.ts';
import { MONEY_RULES } from '../src/modules/money/rules.ts';
import { BUDGET_WATCH_SCRIPT, budgetWarnings } from '../src/modules/money/scripts/budget-watch.js';

const OWNER = { actor: 'p_1' };
const DAY = 86_400_000;
/** Noon on 20 October 2026. */
const TODAY = Date.UTC(2026, 9, 20, 12);
const egp = (major: number) => ({ amount: Math.round(major * 100), currency: 'EGP' });
const usd = (major: number) => ({ amount: Math.round(major * 100), currency: 'USD' });

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T };
  assert.ok(x.ok, sayOf(r as never));
  return x.value;
};

test('THE MARK IS NEAR PAST THE SHARE, OVER PAST THE MOST, and never made twice in a month or put back', () => {
  const cat = (seq: number, fields: Record<string, unknown>) => ({ id: `ent_${seq}`, spoken: `categories#${seq}`, version: 1, fields });
  const out = (category: string, amount: { amount: number; currency: string }) => ({ id: 'x', fields: { category, amount } });
  const food = cat(1, { name: 'Food', budget: egp(1_000), budget_alert: 80 });
  const fun = cat(2, { name: 'Fun', budget: egp(500) });
  const trips = cat(3, { name: 'Trips', budget: egp(2_000), budget_alert: 50 });
  const entries = [out('ent_1', egp(820)), out('ent_2', egp(400)), out('ent_3', egp(2_100)), out('ent_3', usd(5_000))];
  assert.deepEqual(budgetWarnings([food, fun, trips], entries, '2026-10'), [
    { id: 'categories#1', version: 1, fields: { budget_warned: 'near', warned_month: '2026-10' } },
    { id: 'categories#3', version: 1, fields: { budget_warned: 'over', warned_month: '2026-10' } },
  ]);
  /* FUN HAS NO SHARE TO WARN AT, so it is told only once it is over. DOLLARS DO NOT COUNT AGAINST POUNDS. */
  assert.deepEqual(budgetWarnings([fun], [out('ent_2', egp(501))], '2026-10').map((w) => w.fields.budget_warned), ['over']);
  assert.deepEqual(budgetWarnings([fun], [out('ent_2', usd(10_000))], '2026-10'), []);
  /* ALREADY MARKED THIS MONTH: nothing again, and over is never put back to near. */
  const marked = (c: typeof food, warned: string) => ({ ...c, fields: { ...c.fields, budget_warned: warned, warned_month: '2026-10' } });
  assert.deepEqual(budgetWarnings([marked(food, 'near')], entries, '2026-10'), []);
  assert.deepEqual(budgetWarnings([marked(trips, 'over')], [out('ent_3', egp(1_500))], '2026-10'), []);
  /* NEAR THEN OVER IN ONE MONTH, AND NEAR AGAIN THE NEXT. */
  assert.equal(budgetWarnings([marked(food, 'near')], [out('ent_1', egp(1_001))], '2026-10')[0]!.fields.budget_warned, 'over');
  assert.equal(budgetWarnings([marked(trips, 'over')], [out('ent_3', egp(1_500))], '2026-11')[0]!.fields.budget_warned, 'near');
});

test('THE TWO RULES TELL OF THE MARK, once a category a month', () => {
  for (const id of ['budget-near', 'budget-over']) {
    const r = MONEY_RULES[id]!;
    assert.equal(r.register, 'categories');
    assert.deepEqual(r.once_per, ['entry', 'warned_month']);
    assert.ok(r.then.some((a) => 'notify' in a), `${id} does not tell`);
  }
  assert.deepEqual([BUDGET_WATCH_SCRIPT.runs, BUDGET_WATCH_SCRIPT.reads, BUDGET_WATCH_SCRIPT.writes], [{ every: '1d', rule: true }, ['categories', 'transactions'], ['categories']]);
});

/* ── a record of invented spending ─────────────────────────────────────── */

const shaped = (e: Entry) => ({ id: e.id, seq: e.seq!, version: e.version, fields: e.fields });

async function spending() {
  const sql: NodeSql = openSqlite();
  let now = TODAY;
  const k: Kernel = await openRecord(sql, { now: () => now });
  value(await k.install([...declarations(), ...metricDeclarations(), ...pageDeclarations(), ...ruleDeclarations(), ...automationDeclarations()]));
  const make = (register: string, fields: Record<string, unknown>) => value<Entry>(k.create(register, fields, OWNER));
  const account = make('accounts', { name: 'Harbour Bank', kind: 'bank', balance: egp(90_000), as_of: '2026-09-01', state: 'open' });
  const food = make('categories', { name: 'Groceries', direction: 'out', state: 'live', budget: egp(5_000), budget_alert: 80 });
  const line = (on: string, amount: number, category: Entry) =>
    make('transactions', { what: 'CORNER MARKET', payee: 'Corner Market', on, amount: egp(amount), direction: 'out', account: account.id, state: 'cleared', category: category.id });

  const run = async (s: Scripted): Promise<ScriptAnswer> => {
    const writes: { op: 'update'; spoken: string; patch: unknown; version: number }[] = [];
    const ctx = {
      input: s.scripted.input,
      today: () => new Date(now).toISOString().slice(0, 10),
      now: () => new Date(now).toISOString(),
      record: {
        list: async (register: string, where: unknown) => value<{ rows: Entry[] }>(k.list({ register, limit: 50, ...(where === undefined ? {} : { where: where as never }) })).rows.map(shaped),
      },
      update: (spoken: string, patch: unknown, version: number) => void writes.push({ op: 'update', spoken, patch, version }),
      log: () => {},
    };
    const mod = (await import(`data:text/javascript,${encodeURIComponent(s.scripted.decl.source)}`)) as { default: (c: typeof ctx) => Promise<unknown> };
    const out = (await mod.default(ctx)) as { ask?: unknown } | null;
    return { writes, log: '', usage: { fetches: 0, bytes: 0, wall_ms: 1, cpu_ms: 1 }, ...(out && out.ask ? { ask: out.ask } : {}) } as ScriptAnswer;
  };
  const execute = (async () => {
    throw new Error('the script fetches nothing');
  }) as never;
  const night = async () => {
    const due = sql.one<{ due_at: string }>("SELECT due_at FROM schedule WHERE kind = 'script' AND key = 'budget_watch' AND state = 'pending'")?.due_at;
    now = Math.max(now + DAY, due === undefined ? 0 : Date.parse(due)) + 60_000;
    for (let i = 0; i < 3; i++) {
      await k.drain();
      await k.runActions(execute, { script: run, limit: 50 });
    }
  };
  const told = () => sql.all<{ note: string }>("SELECT note FROM event WHERE kind = 'note' AND actor LIKE 'rule:budget-%' ORDER BY rowid").map((n) => n.note);
  return { k, night, told, line, food };
}

test('ON A RECORD: told once when the month passes the share, not again the next night, and once more when it goes over', async () => {
  const m = await spending();
  m.line('2026-10-03', 2_000, m.food);
  await m.night();
  assert.deepEqual(m.told(), [], 'told before the share was passed');

  m.line('2026-10-21', 2_100, m.food);
  await m.night();
  assert.deepEqual(m.k.get(m.food.id)!.fields.budget_warned, 'near');
  assert.deepEqual(m.told(), ['Groceries is past 80% of its EGP 5,000.00 budget this month.']);
  await m.night();
  await m.night();
  assert.equal(m.told().length, 1, 'the warning was said again');

  m.line('2026-10-24', 1_000, m.food);
  await m.night();
  assert.deepEqual(m.told().slice(1), ['Groceries is over its EGP 5,000.00 budget this month.']);
  await m.night();
  assert.equal(m.told().length, 2, 'over was said again');
});

/** A record holding money-core as its pack document says, so its settings are there to set. */
async function fresh(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), { now: () => TODAY });
  const host: Host = {
    count: (register) => k.count(register),
    stage: (batch) => k.stageInstall(batch as never),
    transaction: (fn) => k.transaction(fn),
    reload: () => k.reload(),
    retire: (ids) => k.retire(ids),
    seed: (register, fields) => k.create(register, { ...fields, tags: ['example'] }, { actor: 'p_seed', cascade: false }) as never,
    remember: (row) => k.rememberPack(row),
    forget: (id) => k.forgetPack(id),
    claimed: (pack) => k.packClaims(pack),
  };
  for (const id of ['portfolio', 'people', 'money-core'] as const) {
    const pack = value<Pack>(await normalise(firstPartyDocument(id, { seeds: [] }) as never, { kind: 'local' }));
    const state: Installed = { format: 1, primitives: 1, record_version: k.version(), packs: k.packs(), declarations: k.declarations() as Installed['declarations'], rows: k.census(), config: k.packSettings() };
    const diff = await plan(pack, state);
    value(await install(pack, diff, host, diff.planHash));
  }
  return k;
}

test('CASH IN OTHER CURRENCIES IS THE SHARE OF CASH NOW OUTSIDE THE HOME ONE, at the rate held, and nothing without one', async () => {
  const k = await fresh();
  value(k.create('accounts', { name: 'Harbour Bank', kind: 'bank', liquid: true, balance: egp(60_000), as_of: '2026-10-01', state: 'open' }, OWNER));
  value(k.create('accounts', { name: 'Dollar Savings', kind: 'bank', liquid: true, balance: usd(1_000), as_of: '2026-10-01', state: 'open' }, OWNER));
  const read = () => value<{ value: number | null }>(k.metric(MONEY_METRICS['cash-foreign-share'] as never)).value;
  assert.equal(read(), null, 'a share with no home currency');
  value(k.setPackConfig('money-core', { home_currency: 'EGP' }, OWNER));
  assert.equal(read(), null, 'a share with no rate for dollars');
  value(k.create('fx', { currency: 'USD', base: 'EGP', rate: 40, as_of: '2026-09-30' }, OWNER));
  /* EGP 40,000 OF EGP 100,000 IS IN DOLLARS. */
  assert.ok(Math.abs(read()! - 0.4) < 1e-9, String(read()));
  /* WITH DOLLARS AT HOME, THE POUNDS ARE THE OTHER CURRENCY: EGP 60,000 at forty to the dollar is USD 1,500 of 2,500. */
  value(k.setPackConfig('money-core', { home_currency: 'USD' }, OWNER));
  assert.ok(Math.abs(read()! - 0.6) < 1e-9, String(read()));

  /* REPORTS SAYS IT IN ITS HEALTH TILE, beside how long the cash lasts. */
  const health = (MONEY_PAGES['money-reports']!.blocks as { heading?: string; cells?: { metric?: string }[] }[]).find((b) => b.heading === 'Health')!;
  assert.deepEqual(health.cells!.map((c) => c.metric).slice(-2), ['lasts-no-income', 'cash-foreign-share']);
});
