/**
 * One Ledger entry split across categories (`parts` on `transactions`), read through the kernel on a record that
 * installed Money the way a person does.
 *
 * The clock is 18 September 2026. A shop run of E£1,000.00 is E£700.00 of groceries and E£300.00 of a gift: spending by
 * category counts each part under its own category, every total stays the entry's, and parts that do not add up to the
 * entry are refused with what to move.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Entry, type Kernel, type PageBlock } from '@braindog/kernel';
import { sayOf } from '@braindog/ports';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { METRICS, firstPartyDocument } from '../src/index.ts';
import { MONEY_REPORTS_PAGE } from '../src/modules/money/pages/reports.ts';

const OWNER = { actor: 'p_1' };
const TODAY = Date.UTC(2026, 8, 18, 12);

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

type Kept = { k: Kernel; card: Entry; groceries: Entry; gifts: Entry; rent: Entry };

async function fresh(): Promise<Kept> {
  const k = await openRecord(openSqlite(), fixedClock(TODAY));
  for (const id of ['portfolio', 'people', 'money-core']) {
    const pack = value<Pack>(await normalise(firstPartyDocument(id, { seeds: [] }), { kind: 'local' }));
    const state: Installed = { format: 1, primitives: 1, record_version: k.version(), packs: k.packs(), declarations: k.declarations() as Installed['declarations'], rows: k.census() };
    const diff = await plan(pack, state);
    value(await install(pack, diff, hostFor(k), diff.planHash));
  }
  const category = (name: string, more: Record<string, unknown> = {}): Entry => value<Entry>(k.create('categories', { name, direction: 'out', state: 'live', ...more }, OWNER));
  const card = value<Entry>(k.create('accounts', { name: 'Card', kind: 'bank', balance: { amount: 5_000_000, currency: 'EGP' }, as_of: '2026-07-01' }, OWNER));
  return { k, card, groceries: category('Groceries', { budget: { amount: 80_000, currency: 'EGP' } }), gifts: category('Gifts'), rent: category('Rent') };
}

/** One cleared payment out this month, in piastres. */
const spent = (r: Kept, on: string, amount: number, more: Record<string, unknown> = {}) =>
  r.k.create('transactions', { what: `A payment ${on}`, on, direction: 'out', amount: { amount, currency: 'EGP' }, account: r.card.id, state: 'cleared', transfer: false, ...more }, OWNER);

type Part = { key: string; value: number | null };
type Read = { value: number | null; rows: number; groups?: Part[]; crossed?: { at: string } };

const read = (k: Kernel, id: string, it?: string): Read => {
  const decl = METRICS[id]!;
  const r = k.metric((it === undefined ? decl : { ...decl, where: String(decl.where).replace('{{it}}', it) }) as never);
  assert.ok(r.ok, `${id}: ${sayOf(r)}`);
  return r.value as unknown as Read;
};
const groupOf = (got: Read, c: Entry): number | null | undefined => got.groups?.find((g) => g.key === c.id)?.value;

/** The shop run, E£1,000.00 on the 10th, split E£700.00 groceries and E£300.00 gifts. */
const shopRun = (r: Kept, more: Record<string, unknown> = {}): Entry =>
  value<Entry>(
    spent(r, '2026-09-10', 100_000, {
      category: r.groceries.id,
      parts: [
        { category: r.groceries.id, amount: { amount: 70_000, currency: 'EGP' } },
        { category: r.gifts.id, amount: 30_000, note: 'Birthday present' },
      ],
      ...more,
    }),
  );

test('A SPLIT ENTRY COUNTS EACH PART UNDER ITS OWN CATEGORY, and every total stays the entry', async () => {
  const r = await fresh();
  value(spent(r, '2026-09-02', 500_000, { category: r.rent.id }));
  shopRun(r);
  const by = read(r.k, 'spent-by-category-month');
  assert.equal(groupOf(by, r.groceries), 70_000);
  assert.equal(groupOf(by, r.gifts), 30_000);
  assert.equal(groupOf(by, r.rent), 500_000);
  assert.equal(by.value, 600_000, 'the whole is the entries, not the parts twice');
  assert.equal(read(r.k, 'spent-30d').value, 600_000);
  /* THIS MONTH AGAINST LAST reads the parts too: nothing last month, so each part is all of its change. */
  const vs = read(r.k, 'spent-vs-last-month');
  assert.equal(groupOf(vs, r.gifts), 30_000);
  assert.equal(groupOf(vs, r.groceries), 70_000);
});

test('A BUDGET COUNTS ONLY ITS OWN PART: groceries reach their E£800.00 on the part, never on the whole entry', async () => {
  const r = await fresh();
  shopRun(r);
  const before = read(r.k, 'budget-passed-on', r.groceries.id);
  assert.equal(before.value, 70_000);
  assert.equal(before.crossed, undefined, 'the gift part was counted against groceries');
  value(spent(r, '2026-09-14', 10_000, { category: r.groceries.id }));
  assert.equal(read(r.k, 'budget-passed-on', r.groceries.id).crossed?.at, '2026-09-14');
});

test('A SPLIT ENTRY IS FILED: no count or sum of what has no category holds it', async () => {
  const r = await fresh();
  shopRun(r, { category: null });
  assert.equal(read(r.k, 'txn-uncategorised').value, 0);
  assert.equal(read(r.k, 'unfiled-month').value, 0);
  assert.equal(read(r.k, 'unfiled-spent-month').value ?? 0, 0);
});

test('PARTS THAT DO NOT ADD UP TO THE ENTRY ARE REFUSED, saying how much to move', async () => {
  const r = await fresh();
  const short = spent(r, '2026-09-10', 100_000, { parts: [{ category: r.groceries.id, amount: 60_000 }, { category: r.gifts.id, amount: 30_000 }] });
  assert.equal(short.ok, false);
  assert.match(sayOf(short), /The parts add up to EGP 900\.00 and the line is EGP 1,000\.00\. Add EGP 100\.00 to a part so they match\./u);
  const over = spent(r, '2026-09-10', 100_000, { parts: [{ category: r.groceries.id, amount: 80_000 }, { category: r.gifts.id, amount: 30_000 }] });
  assert.match(sayOf(over), /Take EGP 100\.00 off a part/u);
  const one = spent(r, '2026-09-10', 100_000, { parts: [{ category: r.groceries.id, amount: 100_000 }] });
  assert.match(sayOf(one), /two parts or more/u);
  const dollars = spent(r, '2026-09-10', 100_000, { parts: [{ category: r.groceries.id, amount: { amount: 70_000, currency: 'USD' } }, { category: r.gifts.id, amount: 30_000 }] });
  assert.match(sayOf(dollars), /Give every part in EGP/u);
  const nothing = spent(r, '2026-09-10', 100_000, { parts: [{ category: r.groceries.id, amount: 100_000 }, { category: r.gifts.id, amount: 0 }] });
  assert.match(sayOf(nothing), /more than nothing/u);
});

test('THE AMOUNT CANNOT MOVE UNDER ITS PARTS, and taking the split off gives the entry its one category back', async () => {
  const r = await fresh();
  const run = shopRun(r);
  const moved = r.k.update('transactions', run.id, { amount: { amount: 120_000, currency: 'EGP' } }, OWNER);
  assert.equal(moved.ok, false);
  assert.match(sayOf(moved), /The parts add up to EGP 1,000\.00 and the line is EGP 1,200\.00/u);
  value(r.k.update('transactions', run.id, { parts: null }, OWNER));
  const by = read(r.k, 'spent-by-category-month');
  assert.equal(groupOf(by, r.groceries), 100_000);
  assert.equal(groupOf(by, r.gifts), undefined);
});

test('THE REPORTS SPLIT BY CATEGORY ADDS UP THE PARTS TOO, as the page reads it', async () => {
  const r = await fresh();
  value(spent(r, '2026-09-02', 500_000, { category: r.rent.id }));
  shopRun(r);
  const declared = MONEY_REPORTS_PAGE.blocks.find((b) => (b as { heading?: string }).heading === 'Spending by category')!;
  const got = r.k.block(declared as unknown as PageBlock) as unknown as { refusals: unknown[]; wholeRead?: { rows: { label: unknown; value: number }[]; total: number } };
  assert.deepEqual(got.refusals, []);
  const rows = new Map((got.wholeRead?.rows ?? []).map((w) => [w.label, w.value]));
  assert.equal(rows.get(r.groceries.id), 70_000);
  assert.equal(rows.get(r.gifts.id), 30_000);
  assert.equal(got.wholeRead?.total, 600_000);
});
