/**
 * Today's "Money this week" (use case 6, step 6): her first Today reads "Paid EGP 900" after "Nadia paid 900 on InstaPay",
 * on a record that installed Money the way a person does and holds no account.
 *
 * WHAT WOULD BE SILENTLY WRONG: the tile reading the Ledger's money in, which counts a transfer between her own accounts
 * and never sees a payment kept as a paid invoice ("Nothing came in" on the week she was paid); two currencies, or the
 * two figures, added into one number; a week with nothing paid saying "Paid 0"; two cells both named "In"; and a Today kept by the arrange mode's
 * first Done losing its week.
 *
 * The tile is read off a real record (`openRecord`, Money and People installed with no example entries), each figure
 * drawn by the reader every page uses (`tileOf`), then shaped by Home (`homeDrawn`).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Entry, type Kernel } from '@braindog/kernel';
import { firstPartyDocument } from '@braindog/seed';

import '../record/fixtures/fill.ts';
import { tileOf, type LiveBlock } from '../record/page-live.ts';
import { holdsOf, previewedBody } from '../page/home-arrange.ts';
import { MONEY_WEEK, OWED, OWED_TO_YOU, WEEK_IN, WEEK_IN_SAID, homeDrawn, weekMoney, type Week } from './default-home.ts';

/** Tuesday 6 October 2026. */
const NOW = Date.parse('2026-10-06T09:00:00Z');
const TODAY = '2026-10-06';
const OWNER = { actor: 'p_1' };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

/** An in-memory SQLite as the kernel opens one, as `home-arrange.test.ts` opens it. */
function openSqlite(): Parameters<typeof openRecord>[0] {
  const db = new DatabaseSync(':memory:');
  let depth = 0;
  return {
    exec: (text: string, ...params: unknown[]) => (params.length === 0 ? db.exec(text) : void db.prepare(text).run(...(params as never[]))),
    all: (text: string, ...params: unknown[]) => db.prepare(text).all(...(params as never[])),
    one: (text: string, ...params: unknown[]) => db.prepare(text).get(...(params as never[])),
    transactionSync<T>(fn: () => T): T {
      if (depth > 0) return fn();
      db.exec('BEGIN');
      depth++;
      try {
        const out = fn();
        db.exec('COMMIT');
        return out;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      } finally {
        depth--;
      }
    },
  } as unknown as Parameters<typeof openRecord>[0];
}

/** A fresh record holding People and Money (and the projects People links to) as a person installs them, with no example entries and no account. */
async function fresh(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), { now: () => NOW });
  const host: Host = {
    count: (register) => k.count(register),
    stage: (batch) => k.stageInstall(batch as never),
    transaction: (fn) => k.transaction(fn),
    reload: () => k.reload(),
    retire: (ids) => k.retire(ids),
    seed: (register, fields) => k.create(register, fields, { actor: 'p_seed', cascade: false }) as never,
    remember: (row) => k.rememberPack(row),
    forget: (id) => k.forgetPack(id),
    claimed: (pack) => k.packClaims(pack),
  };
  for (const id of ['portfolio', 'people', 'money-core']) {
    const pack = value<Pack>(await normalise(firstPartyDocument(id, { seeds: [] }), { kind: 'local' }));
    const state: Installed = { format: 1, primitives: 1, record_version: k.version(), packs: k.packs(), declarations: k.declarations() as Installed['declarations'], rows: k.census() };
    const diff = await plan(pack, state);
    value(await install(pack, diff, host, diff.planHash));
  }
  value(await k.install([{ id: 'page.week', kind: 'page', body: { page: 'week', title: 'Week', blocks: [weekMoney()] } }] as never));
  return k;
}

/** A payment kept as a paid invoice to a client, the way a record with no account keeps "paid 900 on InstaPay". */
function paid(k: Kernel, name: string, amount: number, currency: string): void {
  const who = value<Entry>(k.create('people', { name }, OWNER));
  value(k.create('obligations', { what: `${name}'s order`, party: who.id, direction: 'owed_to_me', amount: { amount, currency }, due: TODAY, state: 'paid', settled: TODAY }, OWNER));
}

/** A week with nothing due drawn, so the line is the money's alone. */
const WEEK: Week = { due: { register: 'orders', name: 'Orders', one: 'order', day: 'due', who: 'who', what: 'what', open: null, paid: 'paid' } };

/** The tile as Home draws it from what the record answers now, and Home's line over it. */
function drawn(k: Kernel): { tile: LiveBlock; line: string | undefined } {
  const page = value<{ blocks: { drawn?: boolean; readings?: unknown[] }[] }>(k.page('week'));
  const b = page.blocks[0]!;
  const live = {
    ...weekMoney(),
    drawn: b.drawn !== false,
    rows: [], entries: [], matched: [], columns: [], refusals: [], shown: 0, total: 0, stale_at: '',
    metrics: ((b.readings ?? []) as Parameters<typeof tileOf>[0][]).map((cell) => tileOf(cell)),
  } as unknown as LiveBlock;
  const out = homeDrawn([live], NOW, undefined, undefined, null, WEEK);
  return { tile: out.blocks[0]!, line: out.sentence?.text };
}

const cells = (b: LiveBlock): string[][] => (b.drawn ? (b.metrics ?? []).map((m) => [m.label, m.value]) : []);

test('THE TILE IS MONEY\'S OWN TWO FIGURES, EACH BY ITS OWN NAME ("Came in", "Into your accounts"), side by side, and what is owed beside them, drawn only where Money has them', () => {
  const b = weekMoney();
  assert.equal(b.kind, 'stat');
  assert.equal(b.heading, MONEY_WEEK);
  assert.deepEqual(b.cells, [
    { metric: 'settled-in-7d', label: 'Came in' },
    { metric: 'received-7d', label: 'Into your accounts' },
    { metric: OWED, label: OWED_TO_YOU },
  ]);
  assert.deepEqual(WEEK_IN, ['settled-in-7d', 'received-7d']);
  /* NEVER THE LEDGER'S `way is in`, which counts her own transfers: no list is read for it at all. */
  assert.equal(b.source, undefined);
  assert.equal(b.when?.metric, 'settled-in-7d', 'a record on an older Money draws no tile rather than one it cannot read');
  /* NO TWO CELLS SHARE A NAME: the same EGP 900 under "In" twice read as the money counted twice. */
  const names = (b.cells ?? []).map((c) => c.label);
  assert.equal(new Set(names).size, names.length);
  assert.doesNotMatch(`${b.heading} ${names.join(' ')}`, /—|\brow\b/u);
});

test('A FRESH SHOP READS NO MONEY TILE, and after "Nadia paid 900 on InstaPay" it reads Paid EGP 900 with no account', async () => {
  const k = await fresh();
  assert.deepEqual(cells(drawn(k).tile), [], 'nothing paid, nothing owed: no tile, never "Paid 0"');
  paid(k, 'Nadia', 90_000, 'EGP');
  const { tile, line } = drawn(k);
  assert.deepEqual(cells(tile), [['Came in', 'EGP 900']], 'the paid invoice is paid; the empty Ledger and nothing owed are not drawn');
  assert.equal(line, 'EGP 900 came in this week.');
});

test('TWO CURRENCIES ARE NEVER ONE NUMBER: EGP 900 and USD 40 are each their own amount in the tile', async () => {
  const k = await fresh();
  paid(k, 'Nadia', 90_000, 'EGP');
  paid(k, 'Sam', 4_000, 'USD');
  const said = cells(drawn(k).tile).map(([, v]) => v);
  assert.equal(said.length, 1, 'one In figure, the paid invoices, in two parts');
  assert.deepEqual(said[0]!.split(/\s*·\s*/u).map((p) => p.slice(0, 3)), ['EGP', 'USD'], 'each currency its own part');
  assert.doesNotMatch(said[0]!, /\b940|\b94,0/u, 'two currencies added');
});

/** An account of hers in `currency`, holding nothing yet. */
function account(k: Kernel, name: string, currency: string): Entry {
  return value<Entry>(k.create('accounts', { name, kind: 'bank', balance: { amount: 0, currency }, as_of: TODAY }, OWNER));
}

/** One movement on her Ledger, cleared today. */
function moved(k: Kernel, on: Entry, direction: 'in' | 'out', amount: number, currency: string, what: string): Entry {
  return value<Entry>(k.create('transactions', { what, on: TODAY, direction, amount: { amount, currency }, account: on.id, state: 'cleared' }, OWNER));
}

test('A TRANSFER BETWEEN TWO OF HER OWN ACCOUNTS IS NOT MONEY IN: only what somebody paid her is', async () => {
  const k = await fresh();
  const bank = account(k, 'Bank', 'EGP');
  const wallet = account(k, 'InstaPay wallet', 'EGP');
  /* EGP 5,000 out of the bank and into the wallet the same day: the record pairs the two legs and marks both. */
  moved(k, bank, 'out', 500_000, 'EGP', 'To my wallet');
  const leg = moved(k, wallet, 'in', 500_000, 'EGP', 'From my bank');
  assert.equal((k.get(leg.id)?.fields as { transfer?: unknown } | undefined)?.transfer, true, 'the in leg is marked a transfer');
  assert.deepEqual(cells(drawn(k).tile), [], 'her own money moving reads no In, and so no tile');
  assert.doesNotMatch(drawn(k).line ?? '', /came in|paid/u);
  /* WHAT SOMEBODY PAID INTO HER WALLET IS IN, beside the transfer, which still is not. */
  moved(k, wallet, 'in', 30_000, 'EGP', 'A customer');
  assert.deepEqual(cells(drawn(k).tile), [['Into your accounts', 'EGP 300']]);
});

/* RED UNTIL `lib/record/metrics.ts` `partsShown` writes a bare `money` format's parts in each currency's own units
   (blocked line, uc6-today-49). Measured here: the tile read "EGP 90000 · USD 4000", the minor units printed whole. Once
   it lands, take the `todo` off. */
test('TWO CURRENCIES ARE WRITTEN IN THEIR OWN UNITS, in the tile and in the line: EGP 900 and USD 40', async () => {
  const k = await fresh();
  paid(k, 'Nadia', 90_000, 'EGP');
  paid(k, 'Sam', 4_000, 'USD');
  const { tile, line } = drawn(k);
  assert.deepEqual(cells(tile).map(([l, v]) => [l, v!.replace(/\s*·\s*/gu, ' · ')]), [['Came in', 'EGP 900.00 · USD 40.00']]);
  assert.equal(line, 'EGP 900 and USD 40 came in this week.');
});

test('A WEEK WITH NOTHING PAID SAYS NOTHING: a nought is no figure, and a tile of noughts is not drawn', () => {
  const tile = (values: Record<string, string>): LiveBlock =>
    ({ ...weekMoney(), drawn: true, rows: [], entries: [], matched: [], columns: [], refusals: [], shown: 0, total: 0, stale_at: '', metrics: Object.entries(values).map(([id, v]) => ({ id, label: id === OWED ? OWED_TO_YOU : WEEK_IN_SAID[id as (typeof WEEK_IN)[number]], value: v, note: '' })) }) as unknown as LiveBlock;
  const home = (b: LiveBlock) => homeDrawn([b], NOW, undefined, undefined, null, WEEK);
  const none = home(tile({ 'settled-in-7d': 'EGP 0.00', 'received-7d': '0', 'owed-to-you': 'EGP 0.00' }));
  assert.equal(none.blocks[0]!.drawn, false);
  assert.doesNotMatch(none.sentence?.text ?? '', /came in|paid/u);
  /* WHAT IS OWED IS SAID WHERE IT IS SOMETHING, beside what came in. */
  const owed = home(tile({ 'settled-in-7d': 'EGP 900.00', 'received-7d': '0', 'owed-to-you': 'EGP 1,350.00' }));
  assert.deepEqual(cells(owed.blocks[0]!), [['Came in', 'EGP 900.00'], ['Still to come in', 'EGP 1,350.00']]);
  /* AND WHAT IS OWED IS NEVER SAID AS COME IN. */
  assert.equal(owed.sentence?.text, 'EGP 900 came in this week.');
  /* EGP 900 IN BOTH FIGURES (a payment marked paid, and one of that amount in the ledger) IS TWO MONEYS: the tile names
     both figures and so does the line, each by its name and never added. Equal amounts are not one payment. */
  const both = home(tile({ 'settled-in-7d': 'EGP 900.00', 'received-7d': 'EGP 900.00', 'owed-to-you': '0' }));
  assert.deepEqual(cells(both.blocks[0]!), [['Came in', 'EGP 900.00'], ['Into your accounts', 'EGP 900.00']]);
  assert.equal(both.sentence?.text, 'EGP 900 came in, and EGP 900 reached your accounts this week.');
  /* A FIGURE THE RECORD COULD NOT READ still says so, and is never taken for nought. */
  assert.equal(cells(home(tile({ 'settled-in-7d': '—' })).blocks[0]!).length, 1);
});

test('A TODAY KEPT BY THE FIRST DONE KEEPS ITS WEEK: holdsOf takes it, and PageView hands it in', async () => {
  const owner = { level: 'owner', owner: true, person: 'p_1', lists: null } as never;
  const shell = { lists: [{ id: 'orders', name: 'Orders' }], pages: ['money'], me: owner };
  const week: Week = { due: { ...WEEK.due, open: 'state is not paid' } };
  assert.deepEqual(holdsOf(shell, {}, week).week, week);
  assert.equal(holdsOf(shell, {}).week, undefined, 'a record that keeps no week is handed none');
  const kept = await previewedBody('today', holdsOf(shell, {}, week));
  const headings = (kept?.blocks ?? []).map((b) => (b as { heading?: string }).heading);
  assert.ok(headings.includes('Orders due this week'), 'what is due this week is kept');
  assert.ok(headings.includes(MONEY_WEEK), "the week's money is kept");
  const src = readFileSync(new URL('../page/PageView.svelte', import.meta.url), 'utf8');
  assert.match(src, /previewedBody\(slug, holdsOf\(shell, undefined, await weekHeld\(shell\)\)\)/u);
});
