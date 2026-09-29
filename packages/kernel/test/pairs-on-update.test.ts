/**
 * An install that changes what a list's `pairs:` says settles the rows already in it, in the same install.
 *
 * Driven here with two measured cases over a list of money-core's shape. The pairing ran in the write path and nowhere
 * else, and only for a write touching a field `pairsReads` names, while an install writes no ledger row. So a record on
 * 2.1.0 without `pairs:` updated to 2.2.0 read Spent EGP 29,500.00 before the update and 29,500.00 after it, every mark
 * false, and a record on the 2.1.0 that deployed at 00:22 UTC, whose `where` was `state is cleared` alone, kept rent
 * and a named client's payment paired after 2.2.0 refused a named leg: Spent 0.00 and Received 0.00 against EGP
 * 15,000.00 each.
 *
 * BOTH PATHS AN INSTALL TAKES ARE DRIVEN, `install` (a declaration set from the app) and `stageInstall` (every pack
 * install and update), because the first probes went through the pack path and a repair made on one would leave the
 * other as it was.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Entry, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 30, 12);
const PERSON = { actor: 'p_1' };

/* MONEY-CORE 2.2.0'S CLAUSE, and the looser one the 00:22 deploy carried under 2.1.0. */
const BASE = { on: ['abs(amount)'], opposite: 'direction', across: 'account', within: '4d', mark: 'transfer' };
const LOOSE = { ...BASE, where: { field: 'state', is: 'cleared' } };
const TIGHT = { ...BASE, where: { all: [{ field: 'state', is: 'cleared' }, { field: 'party', empty: true }] } };

const LEDGER = (pairs?: unknown): Declaration => ({
  id: 'register.transactions',
  kind: 'register',
  body: {
    id: 'transactions',
    name: 'Transactions',
    title: 'what',
    ...(pairs === undefined ? {} : { pairs }),
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'on', type: 'day', index: true, required: true },
      { id: 'direction', type: 'enum', values: ['in', 'out'], required: true },
      { id: 'amount', type: 'money', required: true },
      { id: 'account', type: 'text', required: true },
      { id: 'state', type: 'enum', values: ['pending', 'cleared', 'void'], default: 'cleared', required: true },
      { id: 'party', type: 'text' },
      { id: 'note', type: 'text' },
      { id: 'transfer', type: 'bool', default: false },
    ],
  } as never,
});

const egp = (n: number) => ({ amount: n * 100, currency: 'EGP' });

const made = (r: unknown): Entry => {
  const x = r as { ok: boolean; value: Entry; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

async function record(pairs?: unknown): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const out = await k.install([LEDGER(pairs)]);
  assert.ok(out.ok, JSON.stringify(out));
  return { k, sql };
}

const leg = (k: Kernel, what: string, day: string, direction: 'in' | 'out', n: number, account: string, extra: Record<string, unknown> = {}) =>
  made(k.create('transactions', { what, on: `2026-09-${day}`, direction, amount: egp(n), account, ...extra }, PERSON)).id;

/** The two ways an install arrives: through `install`, and through a pack's staged write inside the host's transaction. */
const PATHS: Record<string, (k: Kernel, pairs?: unknown) => Promise<void>> = {
  install: async (k, pairs) => {
    const out = await k.install([LEDGER(pairs)]);
    assert.ok(out.ok, JSON.stringify(out));
  },
  pack: async (k, pairs) => {
    const staged = (await k.stageInstall([LEDGER(pairs)])) as { ok: boolean; value: () => { ok: boolean } };
    assert.ok(staged.ok, JSON.stringify(staged));
    k.transaction(() => assert.ok(staged.value().ok));
    k.reload();
  },
};

/** Each row's mark and partner, as the Ledger reads them. */
const marks = (k: Kernel, ids: readonly string[]) => ids.map((id) => k.get(id)!.fields.transfer);
const partners = (k: Kernel, ids: readonly string[]) => ids.map((id) => k.get(id)!.fields._pair ?? null);

/** What the pairing wrote, and who signed it. */
const pairEvents = (sql: NodeSql) =>
  sql.all<{ actor: string; target: string; field: string }>("SELECT actor, target, field FROM event WHERE kind = 'edit' AND field IN ('_pair', 'transfer') ORDER BY rowid");

for (const [path, update] of Object.entries(PATHS)) {
  test(`A LIST GIVEN \`pairs:\` BY AN UPDATE PAIRS THE MOVES ALREADY IN IT, with events signed by the record (${path})`, async () => {
    const { k, sql } = await record();
    const legs = [
      leg(k, 'CREDIT CARD PAYMENT', '25', 'out', 9_500, 'cib'),
      leg(k, 'PAYMENT RECEIVED', '24', 'in', 9_500, 'card'),
      leg(k, 'Internet Banking Transfer', '10', 'out', 20_000, 'cib'),
      leg(k, 'Internet Banking Transfer', '10', 'in', 20_000, 'hsbc'),
    ];
    assert.deepEqual(marks(k, legs), [false, false, false, false]);

    await update(k, TIGHT);
    /* MEASURED BEFORE THE REPAIR: `[false, false, false, false]`, and still after a note on one leg. */
    assert.deepEqual(marks(k, legs), [true, true, true, true], 'the update left the moves already in the ledger counted');
    assert.deepEqual(partners(k, legs), [legs[1], legs[0], legs[3], legs[2]]);
    const said = pairEvents(sql);
    assert.equal(said.length, 8, 'a mark and a partner on each of four legs');
    assert.ok(said.every((e) => e.actor === 'system'), JSON.stringify(said));
    /* THE PASS'S OWN INDEX IS GONE WHEN IT IS DONE, since the record's declared indexes are counted against a ceiling. */
    assert.deepEqual(sql.all("SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'entry_settle_%'"), []);
    sql.close();
  });

  test(`A PAIR THE NEW \`pairs:\` REFUSES DOES NOT OUTLIVE THE UPDATE (${path})`, async () => {
    const { k, sql } = await record(LOOSE);
    const rent = leg(k, 'Rent, September', '03', 'out', 15_000, 'cib');
    const client = leg(k, 'Nile Design, invoice 12', '04', 'in', 15_000, 'hsbc', { party: 'Nile Design' });
    assert.deepEqual(marks(k, [rent, client]), [true, true], 'the looser clause pairs rent with a named client');

    await update(k, TIGHT);
    /* MEASURED BEFORE THE REPAIR: `[true, true]`, Spent 0.00 and Received 0.00 against EGP 15,000.00 each. */
    assert.deepEqual(marks(k, [rent, client]), [false, false], 'a pair 2.2.0 refuses (the client is named) outlived the update');
    assert.deepEqual(partners(k, [rent, client]), [null, null]);
    sql.close();
  });
}

test('A LIST WHOSE `pairs:` IS TAKEN AWAY IS UNPAIRED, because nothing the record says pairs it any more', async () => {
  const { k, sql } = await record(TIGHT);
  const legs = [leg(k, 'Internet Banking Transfer', '10', 'out', 20_000, 'cib'), leg(k, 'Internet Banking Transfer', '10', 'in', 20_000, 'hsbc')];
  assert.deepEqual(marks(k, legs), [true, true]);
  await PATHS.pack!(k);
  assert.deepEqual(marks(k, legs), [false, false]);
  assert.deepEqual(partners(k, legs), [null, null]);
  sql.close();
});

test("A MARK A PERSON SET IS LEFT AS HE SET IT by the update's settle, whichever way he set it", async () => {
  const { k, sql } = await record();
  /* HIS `true` ON A MOVE HE TYPED, and his `false` on a leg he says is not one (`41 §13 #10`: a pinned mark is his). */
  const typed = leg(k, 'To savings', '10', 'out', 4_000, 'cib', { transfer: true });
  const statement = leg(k, 'From current', '11', 'in', 4_000, 'hsbc');
  const refused = leg(k, 'Dinner', '14', 'out', 1_800, 'card');
  const friend = leg(k, 'InstaPay from Omar', '15', 'in', 1_800, 'cib');
  /* TICKED AND UNTICKED, so the `false` is an edit in the history. A lone `{ transfer: false }` over the default, on a
     list with no `pairs:`, writes no row at all (the resend pin is written only where `pairs:` is declared), and the
     update then pairs the leg: measured, `[true, true]`. That is the write path's reading and not this settle's. */
  made(k.update('transactions', refused, { transfer: true }, PERSON));
  made(k.update('transactions', refused, { transfer: false }, PERSON));
  await PATHS.install!(k, TIGHT);
  assert.deepEqual(marks(k, [typed, statement]), [true, false], 'his true is kept, and it takes no partner');
  assert.deepEqual(partners(k, [typed, statement]), [null, null]);
  assert.deepEqual(marks(k, [refused, friend]), [false, false], 'his false is kept, so its mirror has no partner');
  sql.close();
});

test('HIS `true` ON A LEG AN OLDER BUILD LEFT PAIRED IS KEPT when the update takes the pair apart', async () => {
  /* THE PIN GUARD IN THE SETTLE, reached. Today's write path never leaves a leg he ticked holding a `_pair`, so the
     other test of pins never hands the settle one; a record written by an earlier build can hold it, and so can a row
     put right by hand. Here the pair is written straight into the table, as such a record holds it, and the update's
     clause refuses the named leg. Measured with the guard dropped: his `true` went to `false` and the client's EGP
     15,000.00 was counted as received against his word. */
  const { k, sql } = await record(LOOSE);
  const rent = leg(k, 'Rent, September', '03', 'out', 15_000, 'cib');
  const client = leg(k, 'Nile Design, invoice 12', '04', 'in', 15_000, 'hsbc', { party: 'Nile Design' });
  made(k.update('transactions', client, { transfer: false }, PERSON));
  made(k.update('transactions', client, { transfer: true }, PERSON));
  for (const [id, to] of [[client, rent], [rent, client]] as const)
    sql.exec("UPDATE entry SET fields = json_set(fields, '$._pair', ?, '$.transfer', json('true')) WHERE id = ?", to, id);
  await PATHS.install!(k, TIGHT);
  assert.deepEqual(marks(k, [client, rent]), [true, false], 'his true was written over by the settle');
  assert.deepEqual(partners(k, [client, rent]), [null, null]);
  sql.close();
});

test('AN INSTALL THAT LEAVES `pairs:` AS IT WAS WRITES NOTHING TO THE LEDGER', async () => {
  const { k, sql } = await record(TIGHT);
  leg(k, 'Internet Banking Transfer', '10', 'out', 20_000, 'cib');
  leg(k, 'Internet Banking Transfer', '10', 'in', 20_000, 'hsbc');
  const edits = () => sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM event WHERE kind = 'edit'")!.n;
  const versions = () => sql.one<{ n: number }>("SELECT SUM(version) AS n FROM entry WHERE register = 'transactions'")!.n;
  const [before, touched] = [edits(), versions()];
  const widened = LEDGER(TIGHT);
  (widened.body as { fields: unknown[] }).fields.push({ id: 'memo', type: 'text' });
  /* AND ASKS NO WINDOW: a pass that ran and found nothing to change would write nothing too, and cost a read of the list. */
  const asked = await windowsAsked(sql, async () => assert.ok((await k.install([widened])).ok));
  assert.equal(asked, 0, 'an install that left `pairs:` as it was settled the ledger anyway');
  assert.equal(edits(), before);
  assert.equal(versions(), touched);
  sql.close();
});

/* A BUSY LEDGER, AS A SEEDED STREAM: moves split across two banks a day or so apart, and card spending and refunds of
   the same fifty round sizes all around them, packed into a few weeks so that sets of alike legs form and chain. */
function busy(k: Kernel, rows: number, days: number): void {
  let seed = 64;
  const next = () => ((seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648), seed / 2_147_483_648);
  const day = (d: number) => new Date(Date.UTC(2026, 6, 1) + d * 86_400_000).toISOString().slice(0, 10);
  const size = () => egp((1 + Math.floor(next() * 50)) * 1_000);
  for (let written = 0; written < rows; ) {
    const d = Math.floor(next() * days);
    if (next() < 0.35) {
      const amount = size();
      made(k.create('transactions', { what: 'Move', on: day(d), direction: 'out', amount, account: 'cib' }, PERSON));
      made(k.create('transactions', { what: 'Move', on: day(d + Math.floor(next() * 2)), direction: 'in', amount, account: 'hsbc' }, PERSON));
      written += 2;
    } else {
      const account = next() < 0.5 ? 'cib' : 'card';
      made(k.create('transactions', { what: 'Card', on: day(d), direction: next() < 0.7 ? 'out' : 'in', amount: size(), account }, PERSON));
      written += 1;
    }
  }
}

/** Every row's partner and mark by `seq`, which two records written from one stream share and their ids do not. */
const ledgerOf = (sql: NodeSql): string[] => {
  const rows = sql.all<{ seq: number; id: string; fields: string }>("SELECT seq, id, fields FROM entry WHERE register = 'transactions' ORDER BY seq");
  const seqOf = new Map(rows.map((r) => [r.id, r.seq]));
  return rows.map((r) => {
    const f = JSON.parse(r.fields) as { _pair?: string; transfer?: boolean };
    return `${r.seq}: ${f._pair === undefined ? '-' : seqOf.get(f._pair)} ${f.transfer}`;
  });
};

/** How many windows `pairs.ts` asks the ledger for while `fn` runs, read off the query that asks one. */
function windowsAsked(sql: NodeSql, fn: () => Promise<void>): Promise<number> {
  const all = sql.all.bind(sql);
  let n = 0;
  sql.all = ((text: string, ...params: never[]) => {
    if (text.includes('BETWEEN')) n++;
    return all(text, ...params);
  }) as typeof sql.all;
  return fn().then(
    () => ((sql.all = all), n),
    (e: unknown) => {
      sql.all = all;
      throw e;
    },
  );
}

test('THE UPDATE LEAVES A BUSY LEDGER AS PAIRING EACH ROW AS IT ARRIVED WOULD HAVE, row for row', async () => {
  /* The pass settles one seed at a time, in day order, and skips a row an earlier seed already asked. Neither may leave
     a pair the write path would not have made, or miss one it would: the same stream written into a record that had
     2.2.0's `pairs:` from the start is the ledger the update must reach. Measured on 5,000 rows of each shape the
     benchmark in `index.ts` names, the two agree row for row, and so do the pass with and without the size in the
     window's SQL and with and without either saving. */
  const updated = await record();
  busy(updated.k, 400, 40);
  await PATHS.install!(updated.k, TIGHT);
  const fromStart = await record(TIGHT);
  busy(fromStart.k, 400, 40);
  const [got, want] = [ledgerOf(updated.sql), ledgerOf(fromStart.sql)];
  assert.ok(want.filter((r) => !r.includes(' - ')).length > 100, 'the stream pairs enough rows to mean something');
  assert.deepEqual(got, want);
  updated.sql.close();
  fromStart.sql.close();
});

test('THE UPDATE ASKS EACH ROW OF A BUSY LEDGER FOR ITS WINDOW ABOUT ONCE, not once for every set it stands in', async () => {
  /* MEASURED BEFORE THIS, on the 10,000 rows of fifty round amounts packed into one year that `index.ts` names: 159,018
     windows for 10,000 rows, and 251 s in one transaction, which a Durable Object does not have. A set past `SET_MOST`
     is answered leg by leg, and `settle` asked each of its legs, which read the same 32 windows again; and the pass
     asked again as a seed every row an earlier seed had asked. Here, on 1,500 rows packed as tight: */
  const { k, sql } = await record();
  busy(k, 1_500, 45);
  const asked = await windowsAsked(sql, () => PATHS.install!(k, TIGHT));
  assert.ok(asked <= 2 * 1_500, `${asked} windows asked for 1,500 rows`);
  sql.close();
});
