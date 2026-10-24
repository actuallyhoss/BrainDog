/**
 * "Run again" for Money's filing rule: `txn-categorise` over entries written before the filing rule that fits them.
 *
 * THE OWNER'S ASK, "a way to run rules over old rows". `txn-categorise` files an entry by linking its category, so the
 * automation's page offered no Run again for it (`fieldOf` in `apps/web/src/routes/automations/[id]/run-again.ts`
 * read `set` steps alone). The page now offers it; this holds the record's half: the dry run counts the entry a new
 * filing rule fits, and the press files it under the one batch one Undo takes back.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Entry, type Kernel } from '@braindog/kernel';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { NOW, day, firstPartyDocument } from '../src/index.ts';

const OWNER = { actor: 'p_1' };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string; at?: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
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

test('RUN AGAIN FILES AN OLD ENTRY BY A NEW FILING RULE: the dry run counts it, and the press writes under one batch', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  for (const id of ['portfolio', 'people', 'money-core']) {
    const pack = value<Pack>(await normalise(firstPartyDocument(id, { seeds: [] }), { kind: 'local' }));
    const state: Installed = { format: 1, primitives: 1, record_version: k.version(), packs: k.packs(), declarations: k.declarations() as Installed['declarations'], rows: k.census() };
    const diff = await plan(pack, state);
    value(await install(pack, diff, hostFor(k), diff.planHash));
  }
  const account = value<Entry>(k.create('accounts', { name: 'Current', kind: 'bank', balance: { amount: 0, currency: 'GBP' }, as_of: day(-60) }, OWNER));
  const outing = value<Entry>(k.create('categories', { name: 'Outing', direction: 'out', state: 'live' }, OWNER));
  const old = value<Entry>(
    k.create('transactions', { what: 'TALABAT CAIRO', on: day(-30), direction: 'out', amount: { amount: 1370, currency: 'GBP' }, account: account.id, state: 'cleared' }, OWNER),
  );
  assert.equal(k.get(old.id)?.fields.category ?? null, null, 'the entry was filed before any rule fitted it');
  value(k.create('filing_rules', { match: 'Talabat', match_by: 'starts', reads: 'description', state: 'on', direction: 'out', category: outing.id }, OWNER));

  const dry = value<{ filled: number }>(k.applyRule('txn-categorise', { dry: true }));
  assert.equal(dry.filled, 1);
  assert.equal(k.get(old.id)?.fields.category ?? null, null, 'the dry run wrote');

  const done = value<{ filled: number }>(k.applyRule('txn-categorise', { batch: 'b_run_again' }));
  assert.equal(done.filled, 1, JSON.stringify(done));
  assert.equal(k.get(old.id)?.fields.category, outing.id);
  const batches = sql.all<{ batch: string | null }>("SELECT DISTINCT batch FROM event WHERE actor = 'rule:txn-categorise'");
  assert.deepEqual(batches.map((b) => b.batch), ['b_run_again'], 'the press wrote under more than the one batch');
  sql.close();
});
