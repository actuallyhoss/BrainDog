/**
 * What the checker of `56b35c41` left of audit sixty-three's findings 2, 4 and 6, all of it money read wrong.
 *
 * ONE: AN UPDATE THAT RENAMES THE MARK LOST HIS WORD ON THE OLD ONE. A pack moving `pairs.mark` from `transfer` to
 * `moved` settled the ledger under `moved` and asked for a pin only there, so the leg he had unticked on `transfer` paired
 * again and read `moved: true`: his "not a transfer" gone, the dinner Omar paid him back for read as spent 0.00.
 *
 * TWO: A REGISTER THAT DECLARES NO `state:` OR NO `done:` HAD NO ROW THAT WAITS, so audit sixty-three's finding 2 stood
 * there as it did before the repair: a split move with one half pending, beside a client's payment of the same size, hid
 * the client as the second half, Received 0.00 against 20,000.00.
 *
 * THREE: ONE OUT WHOSE IN IS STILL PENDING PAIRED WITH A CLIENT BESIDE IT. Nothing was tied, and the check that a leg
 * may still arrive guarded only a set of tied legs, so the out took the one cleared in of its size in the window: Spent
 * 0.00 and Received 0.00 against EGP 20,000.00 each until the bank cleared the real in. This is audit sixty-five's
 * finding 1.
 *
 * FOUR: THE FIRST REPAIR OF THREE LET A ROW HE TICKED HOLD THE BANK'S OWN LEGS BACK FOR GOOD, since a pinned row is
 * never a partner and so never stops waiting. Its checker measured Spent and Received 20,000.00 each where HEAD read 0,
 * and the owner decided (DIRECTION 25) that only a row that clears on its own holds a pair back.
 *
 * EVERY FIGURE HERE IS READ THE WAY THE LEDGER PAGE READS IT, as `pairs-pending.test.ts` reads it: `k.list` with Money's
 * `spent-30d` and `received-30d` sentences minus the date window, over whichever field the register marks by.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Entry, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 23, 12);
const BANK = { actor: 'ingest:bank' };
const PERSON = { actor: 'p_1' };
const DAY = (n: number) => new Date(Date.UTC(2026, 8, 10 + n, 12)).toISOString().slice(0, 10);

const CLEARED = { field: 'state', is: 'cleared' };
const UNNAMED = { all: [{ field: 'state', is: 'cleared' }, { field: 'party', empty: true }] };

/**
 * A ledger of money-core's shape. `life` is what it says about its rows' lifecycle: `state:` and `done:` as Money
 * declares them, `state:` alone, or neither, where `state` is still an enum of pending, cleared and void that `where` reads.
 */
const LEDGER = (o: { life: 'done' | 'state' | 'none'; where?: object; mark?: string }): Declaration => ({
  id: 'register.ledger',
  kind: 'register',
  body: {
    id: 'ledger',
    name: 'Ledger',
    title: 'what',
    ...(o.life === 'none' ? {} : { state: 'state' }),
    ...(o.life === 'done' ? { done: ['cleared', 'void'] } : {}),
    pairs: { on: ['abs(amount)'], opposite: 'direction', across: 'account', within: '4d', mark: o.mark ?? 'moved', where: o.where ?? CLEARED },
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'on', type: 'day', required: true },
      { id: 'direction', type: 'enum', values: ['in', 'out'], required: true },
      { id: 'amount', type: 'money', required: true },
      { id: 'account', type: 'text', required: true },
      { id: 'state', type: 'enum', values: ['pending', 'cleared', 'void'], default: 'cleared', required: true },
      { id: 'party', type: 'text' },
      { id: 'note', type: 'text' },
      { id: 'transfer', type: 'bool', default: false },
      { id: 'moved', type: 'bool', default: false },
    ],
  } as never,
});

const made = (r: unknown): Entry => {
  const x = r as { ok: boolean; value: Entry; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

async function ledger(decl: Declaration): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const out = await k.install([decl]);
  assert.ok(out.ok, JSON.stringify(out));
  return { k, sql };
}

type Line = { what: string; on: string; direction: 'in' | 'out'; account: string; state?: 'pending' | 'cleared' | 'void'; party?: string };

/** Every line is EGP 20,000.00, written by the bank, each keyed by its `what`. */
const write = (k: Kernel, lines: readonly Line[]): Record<string, string> =>
  Object.fromEntries(
    lines.map((l) => [
      l.what,
      made(
        k.create(
          'ledger',
          {
            what: l.what,
            on: l.on,
            direction: l.direction,
            amount: { amount: 2_000_000, currency: 'EGP' },
            account: l.account,
            state: l.state ?? 'cleared',
            ...(l.party === undefined ? {} : { party: l.party }),
          },
          BANK,
        ),
      ).id,
    ]),
  );

/** Money's `spent-30d` or `received-30d` without the window, in whole pounds, counting by `mark`. */
const total = (k: Kernel, direction: 'in' | 'out', mark = 'moved'): number =>
  (made(k.list({ register: 'ledger', where: `state is cleared, ${mark} is false, direction is ${direction}`, limit: 500 })) as unknown as { rows: Entry[] }).rows.reduce(
    (n, r) => n + (r.fields.amount as { amount: number }).amount / 100,
    0,
  );

/** Every row's partner by its `what`, so a failure prints the ledger as a person reads it. */
const partners = (k: Kernel, ids: Record<string, string>): Record<string, string | null> => {
  const name = new Map(Object.entries(ids).map(([what, id]) => [id, what]));
  return Object.fromEntries(
    Object.entries(ids).map(([what, id]) => {
      const to = k.get(id)!.fields._pair;
      return [what, typeof to === 'string' ? (name.get(to) ?? to) : null];
    }),
  );
};

/* ─────────────── one: a mark renamed by an update ─────────────── */

/* THE REPAIR IS `pairs.ts`'s `carryPins`, which `settleRedeclared` asks when the old declaration's mark differs from the
   new one's, before the old mark is unpaired: it finds his word on the old field, with the actor `pinnedBy` reads, and
   the kernel writes it onto the new field in his name before the pass settles under it. Measured without it: DINNER
   pairs with OMAR and reads `moved: true`, Spent 0.00 against 20,000.00. The two tests below that passed without it are
   the guards that keep `carryPins` from carrying too much. */

/** The two ways an install arrives, as `pairs-on-update.test.ts` drives them. */
const PATHS: Record<string, (k: Kernel, decl: Declaration) => Promise<void>> = {
  install: async (k, decl) => {
    const out = await k.install([decl]);
    assert.ok(out.ok, JSON.stringify(out));
  },
  pack: async (k, decl) => {
    const staged = (await k.stageInstall([decl])) as { ok: boolean; value: () => { ok: boolean } };
    assert.ok(staged.ok, JSON.stringify(staged));
    k.transaction(() => assert.ok(staged.value().ok));
    k.reload();
  },
};

for (const [path, update] of Object.entries(PATHS)) {
  test(`ONE (${path}): HIS WORD ON THE OLD MARK IS HIS WORD ON THE NEW ONE when an update renames it, either way he said it`, async () => {
    const { k, sql } = await ledger(LEDGER({ life: 'done', where: UNNAMED, mark: 'transfer' }));
    /* The checker's case: dinner on the card, and Omar paying him back into CIB the next day, which the bank pairs. */
    const ids = write(k, [
      { what: 'DINNER', on: DAY(0), direction: 'out', account: 'card' },
      { what: 'OMAR', on: DAY(1), direction: 'in', account: 'cib' },
    ]);
    assert.equal(partners(k, ids).DINNER, 'OMAR', 'the two lines look like one move, so the record pairs them');
    made(k.update('ledger', ids.DINNER!, { transfer: false }, PERSON));
    /* And a move he typed and ticked himself, whose other leg has not come in. */
    const typed = made(
      k.create('ledger', { what: 'TO SAVINGS', on: DAY(2), direction: 'out', amount: { amount: 400_000, currency: 'EGP' }, account: 'cib', transfer: true }, PERSON),
    ).id;
    assert.deepEqual(partners(k, ids), { DINNER: null, OMAR: null });
    assert.equal(total(k, 'out', 'transfer'), 20_000, 'dinner, as he said');

    await update(k, LEDGER({ life: 'done', where: UNNAMED, mark: 'moved' }));
    /* MEASURED BEFORE THE REPAIR: DINNER named OMAR and read `moved: true`, Spent 0.00 against 20,000.00; and his typed
       move read `moved: false`, so 4,000.00 that only moved read as spent. */
    assert.deepEqual(partners(k, ids), { DINNER: null, OMAR: null }, 'his "not a transfer" was lost when the mark was renamed');
    assert.equal(k.get(ids.DINNER!)!.fields.moved, false);
    assert.equal(k.get(typed)!.fields.moved, true, 'his tick on the typed move was lost when the mark was renamed');
    assert.equal(total(k, 'out'), 20_000, 'dinner counted, his typed move not');
    assert.equal(total(k, 'in'), 20_000, 'Omar counted');

    /* THE HISTORY SAYS WHOSE WORD IT IS, and that it was carried: his actor, in the install's batch, with a note. */
    const said = sql.all<{ actor: string; note: string | null }>("SELECT actor, note FROM event WHERE target = ? AND kind = 'edit' AND field = 'moved'", `entry:${ids.DINNER}`);
    assert.equal(said.length, 1, JSON.stringify(said));
    assert.equal(said[0]!.actor, 'p_1');
    assert.match(said[0]!.note ?? '', /transfer/);

    /* AND IT OUTLIVES THE NEXT WRITE: a second repayment of the same size arriving beside dinner does not take it. */
    const more = write(k, [{ what: 'OMAR AGAIN', on: DAY(1), direction: 'in', account: 'hsbc' }]);
    assert.equal(partners(k, { ...ids, ...more }).DINNER, null);
    assert.equal(total(k, 'out'), 20_000);
    sql.close();
  });
}

test('ONE: A MARK NOBODY PINNED IS NOT CARRIED, so the rows the old mark paired pair again under the new one', async () => {
  const { k, sql } = await ledger(LEDGER({ life: 'done', where: UNNAMED, mark: 'transfer' }));
  const ids = write(k, [
    { what: 'CIB OUT', on: DAY(0), direction: 'out', account: 'cib' },
    { what: 'HSBC IN', on: DAY(0), direction: 'in', account: 'hsbc' },
  ]);
  await PATHS.install!(k, LEDGER({ life: 'done', where: UNNAMED, mark: 'moved' }));
  assert.deepEqual(partners(k, ids), { 'CIB OUT': 'HSBC IN', 'HSBC IN': 'CIB OUT' });
  assert.equal(total(k, 'out'), 0);
  assert.deepEqual(sql.all("SELECT actor FROM event WHERE kind = 'edit' AND field = 'moved' AND actor <> 'system'"), []);
  sql.close();
});

test('ONE: RENAMED THERE AND BACK, HIS LATER WORD IS THE ONE CARRIED, not the older one still in the first field', async () => {
  /* MEASURED BEFORE THE REPAIR, by the checker of this change: `transfer` to `moved` carried his "not a transfer", he
     then ticked dinner on `moved`, and the update back to `transfer` kept the old false there because somebody had
     already spoken on `transfer`. His tick was lost and dinner read as spent, EGP 20,000.00. */
  const { k, sql } = await ledger(LEDGER({ life: 'done', mark: 'transfer' }));
  const ids = write(k, [
    { what: 'DINNER', on: DAY(0), direction: 'out', account: 'card' },
    { what: 'OMAR', on: DAY(1), direction: 'in', account: 'cib' },
  ]);
  made(k.update('ledger', ids.DINNER!, { transfer: false }, PERSON));
  await PATHS.install!(k, LEDGER({ life: 'done', mark: 'moved' }));
  made(k.update('ledger', ids.DINNER!, { moved: true }, PERSON));
  await PATHS.install!(k, LEDGER({ life: 'done', mark: 'transfer' }));
  assert.equal(k.get(ids.DINNER!)!.fields.transfer, true, 'his tick on moved was lost on the way back');
  assert.equal(total(k, 'out', 'transfer'), 0);
  sql.close();
});

test('ONE: A WORD SAID ON THE NEW FIELD AFTER THE OLD ONE STANDS, and is not overwritten by the older', async () => {
  const { k, sql } = await ledger(LEDGER({ life: 'done', mark: 'transfer' }));
  const ids = write(k, [
    { what: 'DINNER', on: DAY(0), direction: 'out', account: 'card' },
    { what: 'OMAR', on: DAY(1), direction: 'in', account: 'cib' },
  ]);
  made(k.update('ledger', ids.DINNER!, { transfer: false }, PERSON));
  made(k.update('ledger', ids.DINNER!, { moved: true }, PERSON));
  await PATHS.install!(k, LEDGER({ life: 'done', mark: 'moved' }));
  assert.equal(k.get(ids.DINNER!)!.fields.moved, true);
  assert.deepEqual(sql.all("SELECT note FROM event WHERE target = ? AND kind = 'edit' AND field = 'moved' AND note IS NOT NULL", `entry:${ids.DINNER}`), []);
  sql.close();
});

/* ─────────────── two: a register that declares no final state ─────────────── */

const HALVES: readonly Line[] = [
  { what: 'CIB OUT 1', on: DAY(0), direction: 'out', account: 'cib' },
  { what: 'CIB OUT 2', on: DAY(0), direction: 'out', account: 'cib' },
  { what: 'HSBC IN 1', on: DAY(0), direction: 'in', account: 'hsbc' },
  { what: 'HSBC IN 2', on: DAY(0), direction: 'in', account: 'hsbc' },
];
const CLIENT: Line = { what: 'NILE DESIGN', on: DAY(2), direction: 'in', account: 'hsbc' };

function halvesPairedClientCounted(k: Kernel, ids: Record<string, string>, said: string): void {
  const got = partners(k, ids);
  assert.equal(got['NILE DESIGN'], null, `${said}: the client's payment was hidden as half of a move, ${JSON.stringify(got)}`);
  for (const what of ['CIB OUT 1', 'CIB OUT 2', 'HSBC IN 1', 'HSBC IN 2']) assert.notEqual(got[what], null, `${said}: ${what} was left unpaired, ${JSON.stringify(got)}`);
  assert.equal(total(k, 'out'), 0, `${said}: EGP 40,000.00 that only moved read as spent`);
  assert.equal(total(k, 'in'), 20_000, `${said}: Received is the client alone`);
}

for (const life of ['state', 'none'] as const) {
  test(`TWO (${life === 'none' ? 'no state:' : 'state: without done:'}): A PENDING HALF HOLDS ITS SET BACK, so the client is not hidden in its place`, async () => {
    const { k, sql } = await ledger(LEDGER({ life }));
    const ids = write(k, [HALVES[0]!, HALVES[1]!, HALVES[2]!, { ...HALVES[3]!, state: 'pending' }, CLIENT]);
    /* MEASURED BEFORE THE REPAIR: CIB OUT 2 named NILE DESIGN, Received 0.00 against 20,000.00 for the one cleared half
       and the client, which is audit sixty-three's F2 in a register that says nothing about which states are final. */
    const pending = partners(k, ids);
    for (const [what, to] of Object.entries(pending)) assert.equal(to, null, `${what} was paired while a half was pending, ${JSON.stringify(pending)}`);
    assert.equal(total(k, 'in'), 40_000, 'the cleared half and the client, both counted');
    made(k.update('ledger', ids['HSBC IN 2']!, { state: 'cleared' }, BANK));
    halvesPairedClientCounted(k, ids, 'cleared');
    sql.close();
  });
}

test('TWO (no state:): A PAYMENT REFUSED FOR WHAT IT NAMES DOES NOT WAIT, since no value of a field of fixed values would let it through', async () => {
  /* The first attempt at finding 2 held every refused row back, and a cleared client naming Nile Design kept the halves
     counted for good, Spent and Received each EGP 40,000.00 high. With no `state:`, the fields that may move are the
     enums `where` reads; `party` is a text, and what a row names is what it says. */
  for (const state of ['cleared', 'pending'] as const) {
    const { k, sql } = await ledger(LEDGER({ life: 'none', where: UNNAMED }));
    const ids = write(k, [...HALVES, { ...CLIENT, party: 'Nile Design', state }]);
    const got = partners(k, ids);
    assert.equal(got['NILE DESIGN'], null);
    for (const what of ['CIB OUT 1', 'CIB OUT 2', 'HSBC IN 1', 'HSBC IN 2']) assert.notEqual(got[what], null, `${state}: ${what} held back, ${JSON.stringify(got)}`);
    assert.equal(total(k, 'out'), 0);
    sql.close();
  }
});

test('TWO: A VOID HALF HOLDS THE SET BACK ONLY WHERE THE REGISTER DOES NOT SAY VOID IS FINAL, which is the counted side', async () => {
  /* WHAT THIS DECIDES, AND WHAT IT COSTS. Money says `done: [cleared, void]`, and a void row stays void, so a bounced half
     beside a split move holds nothing back (`pairs-pending.test.ts`). A register with no `done:` has said no state is
     final, and one with no `state:` has named no lifecycle at all, so a void row there may be put back to cleared and is
     treated as a leg that may yet arrive: the halves stay counted, EGP 40,000.00 each way, until it is deleted or the
     register says void is final. Guessing the other way hides a real payment, which is the side this tree refuses. */
  const bounced: Line = { what: 'HSBC VOID', on: DAY(1), direction: 'in', account: 'hsbc', state: 'void' };
  for (const life of ['done', 'state', 'none'] as const) {
    const { k, sql } = await ledger(LEDGER({ life }));
    const ids = write(k, [...HALVES, bounced]);
    const got = partners(k, ids);
    assert.equal(got['HSBC VOID'], null);
    const paired = ['CIB OUT 1', 'CIB OUT 2', 'HSBC IN 1', 'HSBC IN 2'].filter((what) => got[what] !== null);
    assert.equal(paired.length, life === 'done' ? 4 : 0, `${life}: ${JSON.stringify(got)}`);
    assert.equal(total(k, 'out'), life === 'done' ? 0 : 40_000, life);
    sql.close();
  }
});

/* ─────────────── three: one out, its in pending, a client beside it ─────────────── */

const OUT: Line = { what: 'CIB OUT', on: DAY(0), direction: 'out', account: 'cib' };
const IN_PENDING: Line = { what: 'HSBC IN', on: DAY(0), direction: 'in', account: 'hsbc', state: 'pending' };
const BARE_CLIENT: Line = { what: 'CLIENT', on: DAY(1), direction: 'in', account: 'hsbc' };

for (const life of ['done', 'none'] as const) {
  test(`THREE (${life === 'done' ? "Money's state and done" : 'no state:'}): AN OUT WHOSE IN IS PENDING DOES NOT PAIR WITH A CLIENT BESIDE IT, in either order`, async () => {
    for (const order of ['client last', 'pending last'] as const) {
      const { k, sql } = await ledger(LEDGER({ life }));
      const ids = order === 'client last' ? write(k, [OUT, IN_PENDING, BARE_CLIENT]) : write(k, [OUT, BARE_CLIENT, IN_PENDING]);
      /* MEASURED BEFORE THE REPAIR: CIB OUT named CLIENT, Spent 0.00 and Received 0.00 against 20,000.00 each. Nothing
         was tied, so the check for a leg still to come, which guarded only tied sets, was never asked. */
      assert.deepEqual(partners(k, ids), { 'CIB OUT': null, 'HSBC IN': null, CLIENT: null }, order);
      assert.equal(total(k, 'out'), 20_000, `${order}: the out, counted until its in clears`);
      assert.equal(total(k, 'in'), 20_000, `${order}: the client, counted`);
      made(k.update('ledger', ids['HSBC IN']!, { state: 'cleared' }, BANK));
      assert.deepEqual(partners(k, ids), { 'CIB OUT': 'HSBC IN', 'HSBC IN': 'CIB OUT', CLIENT: null }, `${order}, cleared`);
      assert.equal(total(k, 'out'), 0);
      assert.equal(total(k, 'in'), 20_000, `${order}, cleared: Received is the client alone`);
      sql.close();
    }
  });
}

test('THREE: A PENDING LEG FARTHER OFF THAN A CLEARED PARTNER DOES NOT HOLD THE PAIR BACK, because clearing it would change nothing', async () => {
  /* The out's nearest cleared in is on its own day and the pending one two days off. Cleared, the pending in would still
     be the farther, so the pair stands now as it would then, and holding it back would count EGP 20,000.00 each way for
     as long as the bank takes. */
  const { k, sql } = await ledger(LEDGER({ life: 'done' }));
  const ids = write(k, [OUT, { what: 'HSBC IN', on: DAY(0), direction: 'in', account: 'hsbc' }, { what: 'NBE IN', on: DAY(2), direction: 'in', account: 'nbe', state: 'pending' }]);
  assert.deepEqual(partners(k, ids), { 'CIB OUT': 'HSBC IN', 'HSBC IN': 'CIB OUT', 'NBE IN': null });
  assert.equal(total(k, 'out'), 0);
  sql.close();
});

test('THREE: A PENDING LEG AS NEAR AS THE CLEARED CANDIDATE HOLDS THE PAIR BACK, since cleared it would be a tie', async () => {
  /* The out on day one, its pending in a day before and a client's in a day after. Cleared, the two ins stand equally
     near and a tie is not guessed, so pairing the client now would be a pair the ledger takes back later. */
  const { k, sql } = await ledger(LEDGER({ life: 'done' }));
  const ids = write(k, [{ ...OUT, on: DAY(1) }, IN_PENDING, { ...BARE_CLIENT, on: DAY(2) }]);
  assert.deepEqual(partners(k, ids), { 'CIB OUT': null, 'HSBC IN': null, CLIENT: null });
  assert.equal(total(k, 'in'), 20_000, 'the client, counted');
  sql.close();
});

test('THREE: PAST THE SET BOUND THE PENDING IN STILL HOLDS THE PAIR BACK, since a set that large is answered leg by leg', async () => {
  /* A SET OF MORE THAN `SET_MOST` ALIKE LEGS IS NOT ANSWERED AS A SET (`answerOf` falls to `nearestOf`), and every test
     above stays under it. Measured by the checker of this change: `nearestOf` put back to `nearestIn` passed every other
     test in this file, so the wait was guarded on one path only. Here thirty-three outs from other banks sit beside the
     client, which makes the out's set too large, and the out still must not take the client while its own in is pending. */
  const { k, sql } = await ledger(LEDGER({ life: 'done' }));
  const crowd: Line[] = Array.from({ length: 33 }, (_, i) => ({ what: `OTHER OUT ${i}`, on: DAY(4), direction: 'out', account: `bank${i}` }));
  const ids = write(k, [OUT, IN_PENDING, ...crowd, BARE_CLIENT]);
  const got = partners(k, ids);
  assert.equal(got['CIB OUT'], null, `the out took the client while its in was pending, ${got['CIB OUT']}`);
  assert.equal(got.CLIENT, null);
  made(k.update('ledger', ids['HSBC IN']!, { state: 'cleared' }, BANK));
  const cleared = partners(k, ids);
  assert.equal(cleared['CIB OUT'], 'HSBC IN');
  assert.equal(cleared.CLIENT, null);
  sql.close();
});

/* ─────────────── four: a row he ticked never holds the bank's legs back ─────────────── */

test("FOUR: HIS TICKED 'TO SAVINGS' DOES NOT HOLD BACK THE BANK'S OWN TWO LEGS OF THE SAME MOVE, in either order they arrive", async () => {
  /* THE CHECKER'S CASE AGAINST held66, AND THE OWNER'S CALL ON IT (DIRECTION 25). He types EGP 20,000.00 out of CIB and
     ticks it moved; the bank then imports the real CIB out and the HSBC in, the same day. His row mirrors the HSBC in and
     is nobody's partner, since a pinned mark never pairs, so a wait on it never ends. MEASURED ON held66 BEFORE THE
     REPAIR: the bank's legs stayed apart for good, Spent 20,000 and Received 20,000 where HEAD read 0 and 0. */
  for (const life of ['done', 'none'] as const) {
    for (const order of ['out first', 'in first'] as const) {
      const { k, sql } = await ledger(LEDGER({ life }));
      const typed = made(
        k.create('ledger', { what: 'TO SAVINGS', on: DAY(0), direction: 'out', amount: { amount: 2_000_000, currency: 'EGP' }, account: 'cib', moved: true }, PERSON),
      ).id;
      const legs: Line[] = [
        { what: 'CIB OUT', on: DAY(0), direction: 'out', account: 'cib' },
        { what: 'HSBC IN', on: DAY(0), direction: 'in', account: 'hsbc' },
      ];
      const ids = write(k, order === 'out first' ? legs : [...legs].reverse());
      const said = `${life}, ${order}`;
      assert.deepEqual(partners(k, { ...ids, 'TO SAVINGS': typed }), { 'CIB OUT': 'HSBC IN', 'HSBC IN': 'CIB OUT', 'TO SAVINGS': null }, said);
      assert.equal(k.get(typed)!.fields.moved, true, `${said}: his tick is his`);
      assert.equal(total(k, 'out'), 0, `${said}: money that only moved read as spent`);
      assert.equal(total(k, 'in'), 0, `${said}: money that only moved read as received`);
      sql.close();
    }
  }
});

test('FOUR: HIS TICKED LEG BESIDE A SPLIT MOVE DOES NOT HOLD THE SET BACK EITHER, so the halves pair and his row stays his', async () => {
  /* `pairs-pending.test.ts` held the opposite, that his `true` says a leg landed and not which row is the other, so the
     set was answered leg by leg and every half counted, EGP 40,000.00 each way. The owner decided against that
     (DIRECTION 25): his row can never be paired, so the halves would be counted for as long as it stands. */
  const { k, sql } = await ledger(LEDGER({ life: 'done' }));
  const typed = made(
    k.create('ledger', { what: 'HSBC TYPED', on: DAY(0), direction: 'in', amount: { amount: 2_000_000, currency: 'EGP' }, account: 'hsbc', moved: true }, PERSON),
  ).id;
  const ids = write(k, HALVES);
  const got = partners(k, { ...ids, 'HSBC TYPED': typed });
  assert.equal(got['HSBC TYPED'], null);
  for (const what of ['CIB OUT 1', 'CIB OUT 2', 'HSBC IN 1', 'HSBC IN 2']) assert.notEqual(got[what], null, `${what} held back by his ticked leg, ${JSON.stringify(got)}`);
  assert.equal(total(k, 'out'), 0);
  assert.equal(total(k, 'in'), 0, 'the halves paired, his ticked leg not counted');
  sql.close();
});
