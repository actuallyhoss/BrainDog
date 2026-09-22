/**
 * The seed, installed into a real record.
 *
 * WHAT THIS IS FOR. Every figure the interface shows was, until now, a figure about a literal in a
 * mock-up: eight registers described in a Svelte app's `lib/`, and a backend with nothing to be
 * measured against. Installing the same constants through the real write path turns each of those
 * numbers into an assertion — the record either accepts these eight declarations and these three
 * hundred rows, or the product does not work on its own demo.
 *
 * Which is also the strongest single test of the write path there is: sixteen types, refs resolved
 * across registers, enums, money in three currencies, documents with fenced blocks in them, and a
 * generated tail that is the same grid every time.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { openRecord, type Entry, type Kernel } from '@braindog/kernel';
import type { Param, Row, Sql } from '@braindog/ports';
import { fixOf, sayOf } from '@braindog/ports';

import { FIRST_PARTY, NOW, ORDER, REGISTERS, ROWS, TODAY, firstPartyManifest, forWrite, hours, installSeed } from '../src/index.ts';

function openSqlite(): Sql & { close(): void } {
  const db = new DatabaseSync(':memory:');
  let depth = 0;
  return {
    close: () => db.close(),
    exec: (text, ...params) => {
      if (params.length === 0) db.exec(text);
      else db.prepare(text).run(...(params as never[]));
    },
    all: <T = Row>(text: string, ...params: Param[]) => db.prepare(text).all(...(params as never[])) as T[],
    one: <T = Row>(text: string, ...params: Param[]) => db.prepare(text).get(...(params as never[])) as T | undefined,
    transactionSync<T>(fn: () => T): T {
      if (depth > 0) return fn();
      db.exec('BEGIN');
      depth++;
      try {
        const value = fn();
        db.exec('COMMIT');
        return value;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      } finally {
        depth--;
      }
    },
  };
}

async function seeded(): Promise<{ k: Kernel; sql: Sql & { close(): void }; rows: number }> {
  const sql = openSqlite();
  const k = await openRecord(sql, { now: () => NOW });
  const out = await installSeed(k);
  assert.ok(out.ok, sayOf(out));
  return { k, sql, rows: out.value.rows };
}

const rowsOf = (k: Kernel, register: string): Entry[] => {
  const out = k.list({ register, limit: 1000 });
  assert.ok(out.ok, fixOf(out));
  return out.value.rows;
};

/* ── it goes in ──────────────────────────────────────────────────────────── */

test('THE RECORD THE PRODUCT IS SHOWN WITH IS A RECORD THE PRODUCT CAN HOLD', async () => {
  const { k, sql, rows } = await seeded();

  assert.equal(rows, Object.values(ROWS).reduce((n, list) => n + list.length, 0), 'a row was dropped on the way in');
  for (const register of ORDER)
    assert.equal(k.count(register), ROWS[register]?.length ?? 0, `${register} lost rows`);

  // And every register the seed declares is one the record can describe.
  for (const id of Object.keys(REGISTERS)) assert.ok(k.register(id), `${id} did not install`);
  sql.close();
});

test('EVERY REF RESOLVED TO A ROW, rather than being stored as the number somebody typed', async () => {
  // A ref that came back as `2` would list, filter and render exactly as if it worked, and only
  // stop working when the row it points at is renumbered.
  const { k, sql } = await seeded();
  const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;

  let checked = 0;
  for (const register of ORDER) {
    const refs = (REGISTERS[register]?.fields ?? []).filter((f) => f.type === 'ref');
    if (refs.length === 0) continue;
    for (const row of rowsOf(k, register))
      for (const f of refs) {
        const held = row.fields[f.id];
        if (held === undefined || held === null) continue;
        assert.match(String(held), ULID, `${register}.${f.id} holds ${String(held)}, which is not a row id`);
        /* `|| true` MADE THIS A TAUTOLOGY, and it was the only line in the test that checked the
           thing the test is named after. A well-formed ULID pointing at no row passed — which is
           precisely the failure "resolved to a row, rather than stored as the number somebody
           typed" describes, and the shape check one line up cannot see. */
        assert.ok(k.get(String(held)) !== null, `${register}.${f.id} holds ${String(held)}, which points at no row`);
        checked++;
      }
  }
  assert.ok(checked > 100, `only ${checked} refs were checked, so this proves little`);
  sql.close();
});

test('the numbers a person says are the numbers the record issued', async () => {
  const { k, sql } = await seeded();
  // `things#1` is Kiln because it was written first, and the whole seed points at it by that number.
  assert.equal(k.get('things#1')?.fields.name, 'Kiln');
  assert.equal(k.get('people#3')?.fields.name, 'J. Okonkwo');
  assert.equal(k.get('tracks#1')?.fields.name, 'Variable axis QA');

  const invoice = k.get('obligations#1')!;
  assert.equal(invoice.fields.what, 'Invoice 2026-041: brand system');
  assert.equal(invoice.fields.party, k.get('people#1')!.id, 'the invoice does not point at Halden');
  assert.equal(invoice.fields.thing, k.get('things#2')!.id);
  sql.close();
});

/* ── the figures on the screen ───────────────────────────────────────────── */

const money = (row: Entry, field: string) => (row.fields[field] as { amount: number; currency: string }).amount;

test('MONEY SURVIVES AS AN INTEGER IN MINOR UNITS, with its currency', async () => {
  const { k, sql } = await seeded();
  const invoice = k.get('obligations#1')!;
  assert.deepEqual(invoice.fields.amount, { amount: 480_000, currency: 'GBP' }, '£4,800.00, and not 4800 of something');

  // The figure Home shows: what is owed to me and still open.
  const owed = rowsOf(k, 'obligations')
    .filter((r) => r.fields.direction === 'owed_to_me' && r.fields.state !== 'paid' && r.fields.state !== 'written_off')
    .reduce((n, r) => n + money(r, 'amount'), 0);
  assert.ok(owed > 0);
  assert.equal(Number.isInteger(owed), true, 'a total of minor units came out fractional');
  sql.close();
});

test('and the record can be asked the questions the interface asks it', async () => {
  const { k, sql } = await seeded();

  // The overdue list: owed to me, still open, and past its date. `where` compiled, not filtered.
  const overdue = k.list({
    register: 'obligations',
    where: {
      all: [
        { field: 'direction', is: 'owed_to_me' },
        { field: 'state', in: ['open', 'part'] },
        { field: 'due', before: TODAY },
      ],
    },
    limit: 100,
  });
  assert.ok(overdue.ok, fixOf(overdue));
  assert.ok(overdue.value.rows.length > 0, 'a seed with nothing overdue cannot show what the product is for');
  for (const r of overdue.value.rows) assert.ok(String(r.fields.due) < TODAY);

  // The renewals in the next thirty days, which is the other half of the demo.
  const soon = k.list({
    register: 'services',
    where: { all: [{ field: 'state', is: 'live' }, { field: 'renews', before: new Date(NOW + 30 * 86_400_000).toISOString().slice(0, 10) }] },
    limit: 100,
  });
  assert.ok(soon.ok && soon.value.rows.length > 0);
  sql.close();
});

test('a document with a fenced block in it comes back byte for byte', async () => {
  // Kiln's note is the write-up the whole page-body dialect is demonstrated with, backticks, pipes,
  // a deliberately malformed block and all. A record that reformatted it would break the one
  // feedback channel an agent has.
  const { k, sql } = await seeded();
  const note = String(k.get('things#1')?.fields.note ?? '');
  assert.ok(note.includes('```chips'), 'the write-up lost its blocks');
  assert.ok(note.includes('Too | many | cells'), 'the deliberately malformed block was cleaned up');
  assert.equal(note, String(ROWS.things?.[0]?.note ?? ''), 'the document changed on the way in');
  sql.close();
});

test('THE SEARCH INDEX WAS BUILT AS THE ROWS ARRIVED, not afterwards', async () => {
  const { k, sql } = await seeded();
  assert.ok(k.search('halden').length > 0, 'a name in the record is not findable');
  assert.ok(k.search('kiln').length > 0);
  assert.equal(k.search('zzzznothing').length, 0);
  sql.close();
});

test('and the reminders were derived from the dates the rows carry', async () => {
  // Three registers declare a date with a lead time; nobody set a single one of these.
  const { k, sql } = await seeded();
  const pending = k.pending();
  assert.ok(pending.nextDueMs !== null, 'a record full of dated obligations has nothing to remind anybody about');
  sql.close();
});

/* ── it is the same record every time ────────────────────────────────────── */

test('THE GENERATED TAIL IS THE SAME GRID EVERY TIME, which is what makes a screenshot repeatable', async () => {
  const first = await seeded();
  const second = await seeded();
  const shape = (k: Kernel) => rowsOf(k, 'obligations').map((r) => [r.seq, r.fields.what, money(r, 'amount'), r.fields.due]);
  assert.deepEqual(shape(second.k), shape(first.k));
  first.sql.close();
  second.sql.close();
});

test('a ref is written as the number a person says, and only where the declaration says ref', async () => {
  // `forWrite` reads the declaration rather than a list of field names, because a list is the copy
  // that goes stale the first time somebody adds a ref.
  assert.deepEqual(forWrite('obligations', { what: 'x', party: 2, thing: 1, amount: 100 }), {
    what: 'x',
    party: 'people#2',
    thing: 'things#1',
    amount: 100,
  });
  // `hue` is an int on `things` and stays one; `effort` is a duration on `tasks`, beside a ref.
  assert.deepEqual(forWrite('things', { name: 'x', hue: 214 }), { name: 'x', hue: 214 });
  assert.deepEqual(forWrite('tasks', { what: 'x', effort: 14, thing: 3 }), { what: 'x', effort: 14, thing: 'things#3' });
  // An absent field is absent, and a null one is a null the write path knows how to clear.
  assert.deepEqual(forWrite('obligations', { party: null, thing: undefined }), { party: null });
});

/* ── agent runs are the kernel's ─────────────────────────────────────────── */

test('ONE LIST OF AGENT RUNS on a seeded record: the kernel’s `session`, and nothing of the seed’s', async () => {
  // The seed once declared `sessions` beside the kernel's `session`, and the rail drew two lists
  // called Agent runs.
  const { k, sql } = await seeded();
  const named = (id: string) => (k.register(id) as unknown as { name?: string } | undefined)?.name;
  const runs = [...k.registers().keys()].filter((id) => named(id) === 'Agent runs' || /^sessions?$/.test(id));
  assert.deepEqual(runs, ['session']);
  assert.equal(REGISTERS.sessions, undefined);
  assert.equal(k.count('session'), ROWS.session?.length);
  sql.close();
});

test('A SEEDED RUN CARRIES WHAT ONLY THE RECORD WRITES, and the refusal guarding those fields is whole', async () => {
  const { k, sql } = await seeded();
  const s1 = k.get('S1');
  assert.ok(s1, 'S1 does not resolve');
  assert.equal(s1.fields.project, 'things#1', 'a run names its project by spoken id, as the ladder does');
  assert.equal(s1.fields.last_seen, ROWS.session?.[0]?.last_seen);
  assert.ok(NOW - Date.parse(String(s1.fields.last_seen)) < 5 * 60_000, 'S1 should read as minutes ago, not as the clock');

  // The seed's path is the kernel's own, not a door: a caller naming one of these is still refused.
  for (const [field, value] of [['last_seen', hours(0)], ['project', 'things#1'], ['token_id', 't_example']] as const) {
    const out = k.create('session', { doing: 'x', [field]: value }, { actor: 'p_seed' });
    assert.equal(out.ok ? 'accepted' : 'refusal' in out ? out.refusal.code : 'conflict', 'IMMUTABLE_FIELD', `${field} was taken from a caller`);
  }
  sql.close();
});

/* ── the questions ───────────────────────────────────────────────────────── */

test('THE SAMPLE’S QUESTIONS ARE FILED THROUGH propose AND decide, in the order that numbers them', async () => {
  const { k, sql } = await seeded();
  const out = await installSeed(await openRecord(openSqlite(), { now: () => NOW }));
  assert.ok(out.ok, sayOf(out));
  /* SEVEN QUESTIONS AND TWO ANSWERS: the five the sample's queue shows open, and D41 and SG33, which
     it shows decided. A count that moves is a question added to one side and not the other. */
  assert.deepEqual([out.value.suggestions, out.value.decisions], [7, 2]);

  const open = k.governance('suggestion', { status: 'open' });
  assert.ok(open.ok, fixOf(open));
  const byRule = (r: { opened_by?: unknown }) => String(r.opened_by ?? '').startsWith('rule:');
  assert.deepEqual(open.value.filter((r) => !byRule(r)).map((r) => r.id).sort(), ['SG2', 'SG3', 'SG4', 'SG5', 'SG7']);
  /* AND MONEY'S RULES ASK AFTER THEM: the two invoices more than a week late, and the balance nine days old. */
  const asked = open.value.filter(byRule);
  assert.deepEqual(asked.map((r) => String(r.opened_by)).sort(), ['rule:cash-stale', 'rule:invoice-late', 'rule:invoice-late']);
  assert.ok(asked.every((r) => Number(String(r.id).slice(2)) > 7), 'a rule question took a number in the middle of the sample');
  assert.equal(k.question(String(asked.find((r) => r.opened_by === 'rule:cash-stale')!.id)), 'The balance of Tax reserve was last set 9 days ago. Update it?');

  const kiln = k.governanceRow('suggestion', 'SG5');
  assert.equal(k.question('SG5'), 'Does Kiln licence per-seat, per-product, or one flat studio price?');
  const options = (kiln?.body as { options: { id: string; recommended?: boolean }[] }).options;
  assert.deepEqual(options.map((o) => o.id), ['seat', 'product', 'flat']);
  assert.deepEqual(options.filter((o) => o.recommended).map((o) => o.id), ['product']);

  assert.equal(k.governanceRow('suggestion', 'SG4')?.body_kind, 'rowset');
  assert.equal(k.governanceRow('decision', 'D1')?.answer, 'nordhaven');
  assert.equal(k.governanceRow('decision', 'D2')?.question, 'Add the two services on the Fenwick invoice?');
  sql.close();
});

/* ── the door a forwarded bank message comes through ─────────────────────── */

/**
 * One HSBC card alert, in the wording Money's charge pattern is written for.
 *
 * THE IDS BELOW ARE SPELLED OUT RATHER THAN READ FROM `INGESTS`, because a test that derives what it
 * expects from the same constant the install derives it from passes when both are empty, which is
 * precisely the state this test exists to end.
 */
const CHARGE = 'HSBC: Your card ending 4471 was debited GBP 42.99 at FENWICK CLOUD on 18/09/26. If this was not you, call us.';

test('INSTALLING THE SEED INSTALLS THE DOOR A BANK MESSAGE COMES THROUGH, and the message lands as a ledger row', async () => {
  /* DECLARED, VALID, TESTED AND INSTALLED BY NOTHING was the state this is about. `test/money.test.ts`
     installs `MONEY_INGESTS` by hand before it forwards anything, so every assertion there held while
     a real record — the one `installSeed` opens — had no pattern at all: each alert he forwards was
     stored, hashed and left `untriaged` for ever, beside an empty ledger. */
  const { k, sql } = await seeded();
  assert.deepEqual(
    k.declarations().filter((d) => d.kind === 'ingest').map((d) => d.id).sort(),
    [
      'ingest.bank-card-in', 'ingest.bank-card-out', 'ingest.bank-card-used', 'ingest.bank-from-in', 'ingest.bank-from-out', 'ingest.bank-from-unsure',
      'ingest.bank-ipn-in', 'ingest.bank-ipn-out',
    ],
    'the seed installed no pattern for a forwarded bank message',
  );

  const before = k.count('transactions');
  const out = k.arrive({ channel: 'email', headers: { From: 'alerts@hsbc.example', Subject: 'Card transaction' }, body: CHARGE, sha256: 'seed-charge-1' });
  assert.ok(out.ok, fixOf(out));
  assert.equal(out.value.state, 'matched', out.value.reason ?? '');
  assert.equal(out.value.ingest, 'bank-card-out');
  /* `exact` OR NOTHING WAS WRITTEN: a chosen or defaulted field files the arrival at `proposed`, which
     opens a suggestion and leaves the ledger as empty as no pattern would have. */
  assert.equal(out.value.confidence, 'exact');
  assert.equal(k.count('transactions'), before + 1, 'the pattern installed and wrote nothing');

  const charge = k.get(out.value.wrote[0]!)!;
  assert.equal(charge.fields.what, 'FENWICK CLOUD');
  assert.equal(charge.fields.direction, 'out', 'a charge was filed as money coming in');
  assert.deepEqual(charge.fields.amount, { amount: 4_299, currency: 'GBP' }, 'the card digits were read as the amount, or the money is not in minor units');
  assert.equal(charge.fields.on, '2026-09-18');
  /* AND THE ACCOUNT RESOLVED AGAINST THE SEED'S OWN ROWS, which is what makes this end to end: the
     `lookup:` reads `accounts.last4`, and the row it lands on was written by this same install. */
  assert.equal(charge.fields.account, k.get('accounts#3')?.id, 'the lookup did not land on the company card');
  sql.close();
});

test('AND MONEY-CORE CLAIMS THEM, rather than filing a nameless declaration under the empty string', () => {
  /* `idOf` IN `packs/first-party.ts` GAINED ITS `ingest` ARM BEFORE ANY INGEST REACHED IT, so the arm
     has never been read over a real one. Without it every pattern would be filed as '' — and two
     versions of the pack would then see one nameless declaration replace another, silently. */
  const provides = firstPartyManifest('money-core').provides;
  assert.ok(provides.includes('ingest.bank-card-out'), 'money-core does not carry the charge pattern');
  assert.ok(provides.includes('ingest.bank-card-in'), 'money-core does not carry the credit pattern');
  assert.equal(provides.includes(''), false, 'a declaration is filed under the empty string');
  /* AND NO OTHER PACK TOOK ONE, which is what a missing `pack:` on a pattern would look like. */
  for (const id of FIRST_PARTY.filter((p) => p !== 'money-core'))
    assert.deepEqual(firstPartyManifest(id).provides.filter((d) => d.startsWith('ingest.')), [], `${id} claimed a bank pattern`);
});
