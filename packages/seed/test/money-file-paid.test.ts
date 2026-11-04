/**
 * A paid bill is spending (file-paid, 30 October): a payment linked to a bill or a repeating line and filed under a
 * category whose money stays yours is filed under the bill's category, and counts as spending.
 *
 * His case: "Internet Banking Transfer", USD 287.15 on the dollar account, filed under Transfers by a filing rule, pays
 * Northwind Premiums, a bill of the kind Insurance. Before this it was linked and counted nowhere.
 *
 * RED FIRST: with `payment-files-paid` out of `MONEY_AUTOMATIONS` the payment stays under Transfers.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { cycleAfter, openRecord, type CycleLine, type Entry, type Kernel } from '@braindog/kernel';
import { sayOf } from '@braindog/ports';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { firstPartyDocument } from '../src/index.ts';
import { MONEY_AUTOMATIONS } from '../src/modules/money/rules.ts';
import { BILL_KINDS, FILE_PAID_RULE, FILE_PAID_SCRIPT, fileUnder } from '../src/modules/money/scripts/file-paid.js';

type Fields = Record<string, unknown>;
const OWNER = { actor: 'p_1' };
const usd = (amount: number) => ({ amount, currency: 'USD' });
const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T };
  assert.ok(x.ok, sayOf(r as never));
  return x.value;
};
const hostFor = (k: Kernel): Host => ({
  count: (register) => k.count(register),
  stage: (batch) => k.stageInstall(batch as never),
  transaction: (fn) => k.transaction(fn),
  reload: () => k.reload(),
  retire: (ids) => k.retire(ids),
  seed: (register, fields) => k.create(register, { ...fields, tags: ['example'] }, { actor: 'p_seed', cascade: false }) as never,
  remember: (row) => k.rememberPack(row),
  forget: (id) => k.forgetPack(id),
  claimed: (pack) => k.packClaims(pack),
});

/** 30 October 2026, the morning after the premium left. */
const NOW = Date.UTC(2026, 9, 30, 9);

async function money() {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  for (const id of ['portfolio', 'people', 'money-core']) {
    const pack = value<Pack>(await normalise(firstPartyDocument(id, { seeds: [] }), { kind: 'local' }));
    const state: Installed = { format: 1, primitives: 1, record_version: k.version(), packs: k.packs(), declarations: k.declarations() as Installed['declarations'], rows: k.census() };
    const diff = await plan(pack, state);
    value(await install(pack, diff, hostFor(k), diff.planHash));
  }
  const made = (list: string, fields: Fields) => value<Entry>(k.create(list, fields, OWNER));
  const account = made('accounts', { name: 'HSBC (USD)', kind: 'bank', liquid: true, balance: usd(857_401), as_of: '2026-10-25' }).id;
  const transfers = made('categories', { name: 'Transfers', direction: 'out', state: 'live', transfer: true });
  const insurance = made('categories', { name: 'Insurance', direction: 'out', state: 'live' });
  const health = made('categories', { name: 'Health', direction: 'out', state: 'live' });
  const rule = made('filing_rules', { match: 'Internet Banking Transfer', match_by: 'exact', reads: 'description', direction: 'out', category: transfers.id, state: 'on' });
  const bill = (more: Fields = {}) =>
    made('obligations', { what: 'Northwind Premiums', direction: 'owed_by_me', amount: usd(28_715), due: '2026-10-25', state: 'open', account, category: 'insurance', ...more });
  const paid = (more: Fields = {}) =>
    made('transactions', { what: 'Internet Banking Transfer', counterparty_text: 'Internet Banking Transfer', on: '2026-10-29', direction: 'out', amount: usd(28_715), account, state: 'cleared', ...more });

  const log: string[] = [];
  const shaped = (e: Entry) => ({ id: e.id, register: e.register, seq: e.seq!, version: e.version, fields: e.fields });
  const sandbox = async (s: { scripted: { input: unknown; decl: { source: string } } }) => {
    const writes: { op: 'update'; spoken: string; patch: unknown; version: number }[] = [];
    const ctx = {
      input: s.scripted.input,
      record: {
        get: async (said: string) => {
          const e = k.get(said);
          return e ? shaped(e) : null;
        },
        list: async (register: string, where: unknown) => value<{ rows: Entry[] }>(k.list({ register, where: where as never })).rows.map(shaped),
      },
      update: (spoken: string, patch: unknown, version: number) => void writes.push({ op: 'update', spoken, patch, version }),
      log: (...words: string[]) => void log.push(words.join(' ')),
      today: () => '2026-10-30',
      cycle: async (day: string, line: CycleLine) => {
        try {
          return cycleAfter(day, line);
        } catch {
          return null;
        }
      },
    };
    const mod = (await import(`data:text/javascript,${encodeURIComponent(s.scripted.decl.source)}`)) as { default: (c: typeof ctx) => Promise<{ ask?: unknown } | null> };
    const out = await mod.default(ctx);
    return { writes, log: log.join('\n'), usage: { fetches: 0, bytes: 0, wall_ms: 1, cpu_ms: 1 }, ...(out && out.ask ? { ask: out.ask } : {}) };
  };
  const turn = async (rounds = 5) => {
    for (let i = 0; i < rounds; i++) {
      await k.drain();
      await k.runActions((async () => {
        throw new Error('no call is taken here');
      }) as never, { script: sandbox as never, limit: 50 });
    }
  };
  const asked = () => sql.all<{ opened_by: string; body: string }>("SELECT opened_by, body FROM suggestion WHERE status = 'open' ORDER BY rowid");
  return { k, made, bill, paid, turn, asked, log, transfers, insurance, health, rule, account };
}

const said = (log: string[]) => log.join(' | ');

test('the rule and its script are Money\'s own and go into its pack document together', () => {
  assert.ok(MONEY_AUTOMATIONS.includes(FILE_PAID_RULE as never), 'no rule starts the script');
  assert.ok(MONEY_AUTOMATIONS.includes(FILE_PAID_SCRIPT as never), 'the script is in no pack document');
  assert.equal((FILE_PAID_RULE as { when: string }).when, 'state is cleared, settles is set, transfer is false, category is set, on after -90d');
  assert.equal(BILL_KINDS.insurance, 'Insurance');
});

test('a premium paid by transfer and filed under Transfers is linked to its bill and filed under Insurance, and nothing is asked', async () => {
  const m = await money();
  const theBill = m.bill();
  const pay = m.paid({ category: m.transfers.id, filed_by: m.rule.id });
  await m.turn();
  const f = m.k.get(pay.id)!.fields;
  assert.equal(f.settles, theBill.id, said(m.log));
  assert.equal(m.k.get(theBill.id)!.fields.state, 'paid', said(m.log));
  assert.deepEqual([f.category, f.filed_by ?? null, f.transfer], [m.insurance.id, null, false], said(m.log));
  assert.ok(m.log.some((l) => l.includes('filed under Insurance, as spending')), said(m.log));
  /* FILED BY THE BILL, NOT BY HAND: no "File every Internet Banking Transfer under Insurance?" */
  assert.deepEqual(m.asked().map((q) => q.opened_by), [], said(m.log));
});

test('a payment linked before this is filed on the link, and one linked while pending by the hourly sweep once it clears', async () => {
  const m = await money();
  const theBill = m.bill({ state: 'paid', settled: '2026-10-29', paid_so_far: usd(28_715) });
  const pay = m.paid({ category: m.transfers.id, settles: theBill.id });
  await m.turn();
  assert.equal(m.k.get(pay.id)!.fields.category, m.insurance.id, said(m.log));
  /* NO WRITE STARTS IT HERE: linked while pending, and its clearing is a write to the status alone, so the hour sees it. */
  const late = m.paid({ on: '2026-09-29', state: 'pending', category: m.transfers.id, settles: theBill.id });
  await m.turn();
  value(m.k.update('transactions', late.id, { state: 'cleared' }, OWNER));
  await m.turn();
  assert.equal(m.k.get(late.id)!.fields.category, m.transfers.id, said(m.log));
  m.k.purge();
  await m.turn();
  assert.equal(m.k.get(late.id)!.fields.category, m.insurance.id, said(m.log));
});

test('a payment under a category that counts as spending stays there, and one whose bill names no category of yours stays under Transfers', async () => {
  const m = await money();
  const first = m.bill();
  const own = m.paid({ category: m.health.id });
  await m.turn();
  assert.deepEqual([m.k.get(own.id)!.fields.settles, m.k.get(own.id)!.fields.category], [first.id, m.health.id], said(m.log));

  const n = await money();
  const second = n.bill({ category: 'software' });
  const moved = n.paid({ category: n.transfers.id });
  await n.turn();
  assert.deepEqual([n.k.get(moved.id)!.fields.settles, n.k.get(moved.id)!.fields.category], [second.id, n.transfers.id], said(n.log));
  assert.ok(n.log.some((l) => l.includes('names no category of yours')), said(n.log));
});

test('a repeating line counted by its payment files that payment under the line\'s category', async () => {
  const m = await money();
  const line = m.made('recurring', { what: 'Northwind Premiums', direction: 'out', amount: usd(28_715), every: 'monthly', next_due: '2026-10-25', state: 'live', account: m.account, category: m.insurance.id });
  const pay = m.paid({ category: m.transfers.id, filed_by: m.rule.id });
  await m.turn();
  const l = m.k.get(line.id)!.fields;
  assert.deepEqual([l.last_paid, l.next_due], ['2026-10-29', '2026-11-25'], said(m.log));
  const f = m.k.get(pay.id)!.fields;
  assert.deepEqual([f.category, f.filed_by ?? null], [m.insurance.id, null], said(m.log));
  /* THE LINE WAS PAST ITS DAY WHEN IT WAS MADE, SO "It went through?" WAS ASKED, AND CLOSED ITSELF WHEN THE PAYMENT MOVED THE
     LINE ON, SINCE 3 November (be7728aa4); NO FILING RULE WAS OFFERED. */
  assert.deepEqual(m.asked().map((q) => q.opened_by), [], said(m.log));
});

test('the decision leaves a move the record paired, a split entry and a category that goes the other way', () => {
  const cat = (id: string, fields: Fields) => ({ id, fields: { state: 'live', direction: 'out', ...fields } });
  const categories = [cat('c_t', { name: 'Transfers', transfer: true }), cat('c_i', { name: 'Insurance' }), cat('c_in', { name: 'Professional fees', direction: 'in' })];
  const row = (fields: Fields) => ({ list: 'transactions', id: 't_1', spoken: 'transactions#1', version: 3, fields: { state: 'cleared', direction: 'out', transfer: false, category: 'c_t', ...fields } });
  const bill = (category: string) => ({ list: 'obligations', id: 'o_1', spoken: 'obligations#1', version: 1, fields: { what: 'Northwind Premiums', category } });
  assert.deepEqual(fileUnder(row({}), bill('insurance'), categories, BILL_KINDS), {
    writes: [{ id: 'transactions#1', version: 3, fields: { category: 'c_i' } }],
    said: 'The payment for Northwind Premiums is filed under Insurance, as spending.',
  });
  /* NO CATEGORY AT ALL IS FILED TOO, so a filing rule that comes after finds it filed. */
  assert.ok('writes' in fileUnder(row({ category: undefined }), bill('insurance'), categories, BILL_KINDS));
  for (const left of [row({ transfer: true }), row({ parts: [{ category: 'c_i', amount: usd(1) }] }), row({ state: 'pending' })])
    assert.ok('nothing' in fileUnder(left, bill('insurance'), categories, BILL_KINDS));
  /* "Professional fees" IS THE KIND'S WORDS, AND THAT CATEGORY IS FOR MONEY IN. */
  assert.match((fileUnder(row({}), bill('professional'), categories, BILL_KINDS) as { nothing: string }).nothing, /goes the other way/u);
});
