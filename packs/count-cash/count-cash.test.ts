/**
 * Count the cash: a person says what is actually in the box or the account, and the record writes the difference.
 *
 * THE OBVIOUS SHAPE IS A MANUAL AUTOMATION THAT ASKS A PERSON FOR THE AMOUNT, AND THE GRAMMAR CANNOT SAY IT. Measured in the
 * first test below rather than read: `ask_person` offers a closed list of at least two answers (`flow-lint.ts`, "A
 * choice is between at least two, each once"), and `decide` refuses anything else, so a person asked "how much is in
 * the box?" can only pick an amount somebody wrote into the automation beforehand. Deciding 412.37 on a question that
 * offered 412.50 and 400.00 answered `ENUM_VALUE_UNKNOWN: 412.37 is not one of the options`. And a `create` step's
 * fields are text filled from the run, with no arithmetic, so even an amount it had would not become a difference.
 *
 * SO THE COUNT IS A ROW, AND THE AUTOMATION STARTS ON IT. Typing an amount into a form is what a list already takes
 * from a person, so the pack declares `cash_counts`; an automation on each new count starts a script, and the script
 * does the subtraction nothing declared can: the counted amount less what Cash now rolls the account to, written as a dated
 * transaction, the count kept as a balance check (1.1.0), and the difference kept on the count. Nothing in `packages/`
 * changed for it. The day `ask_person` takes an amount, the form becomes a question and the rest stays.
 *
 * RED FIRST, MEASURED: with no `count.js` and no `count-cash.pack.json` this file failed at its first
 * read, ENOENT, before a single test ran.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readPackFile } from '../../packages/declare/src/catalogue.ts';
import { openRecord } from '../../packages/kernel/src/index.ts';
import { fixedClock, openSqlite } from '../../packages/kernel/test/sqlite.ts';
import { fixOf } from '../../packages/ports/src/index.ts';
import type { CallContext } from '../../packages/record/src/index.ts';
import type { CtxHost, Json, ScriptAnswer, ScriptDecl, ScriptWrite } from '../../packages/script/src/index.ts';
import { runInQuickJs } from '../../packages/script/src/quickjs.ts';
import { firstPartyDocument } from '../../packages/seed/src/index.ts';

const HERE = new URL('./', import.meta.url);
const SOURCE = readFileSync(new URL('count.js', HERE), 'utf8');
const TEXT = readFileSync(new URL('count-cash.pack.json', HERE), 'utf8');
const PACK = JSON.parse(TEXT) as { pack: string; changes: string; declarations: Record<string, unknown>[] };
const SCRIPT = PACK.declarations.find((d) => typeof d.script === 'string') as {
  script: string;
  runs: Record<string, unknown>;
  egress: string[];
  keys: string[];
  reads: string[];
  writes: string[];
  source: string;
};
const RULE = PACK.declarations.find((d) => typeof d.rule === 'string') as { rule: string; on: unknown; steps: unknown[] };

const NOW = '2026-09-25T17:00:00.000Z';
const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';

/* ── What the grammar cannot say ───────────────────────────────────────────────────────────────── */

test('MEASURED: A PERSON ASKED FOR AN AMOUNT CAN ONLY PICK ONE WRITTEN IN BEFOREHAND, so the count cannot be a question yet', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(Date.parse(NOW)));
  assert.ok(k.createRecord({ id: REC, slug: 'kiln', name: 'Kiln', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  /* THE MOST A MANUAL AUTOMATION CAN ASK: two amounts somebody guessed. One answer is refused at install. */
  const asking = {
    id: 'rule.count_by_asking',
    kind: 'rule',
    body: { rule: 'count_by_asking', on: { manual: true }, steps: [{ ask_person: { question: 'How much cash is in the box?', options: ['412.50', '400.00'], as: 'counted' } }] },
  };
  const put = await k.install([asking] as never);
  assert.ok(put.ok, fixOf(put));
  const started = k.automationRun('count_by_asking', 'p_1');
  assert.ok(started.ok, fixOf(started as never));
  await k.drain();
  const s = sql.one<{ id: string }>("SELECT id FROM suggestion WHERE status = 'open' AND body_kind = 'options'");
  assert.ok(s, 'the run asked nobody');
  const counted = k.decide(s.id, { decide: { option: '412.37', reason: 'What is in the box.' } }, 'p_1');
  assert.equal(counted.ok, false, 'a person answered an amount the question did not offer, so the count can be a question now');
  assert.equal(fixOf(counted as never), `412.37 is not one of the options on ${s.id}.`);
  sql.close();
});

/* ── The pack ──────────────────────────────────────────────────────────────────────────────────── */

test('THE PACK CARRIES count.js AS ITS SOURCE, byte for byte; it fetches nothing, and a new count is what starts it', async () => {
  assert.equal(SCRIPT.source, SOURCE, 'count-cash.pack.json and count.js disagree; copy count.js into the source');
  assert.deepEqual(SCRIPT.runs, { rule: true });
  assert.deepEqual([SCRIPT.egress, SCRIPT.keys], [[], []], 'counting cash calls nobody');
  /* 1.1.0 READS WHAT CASH NOW ROLLS FROM AND WRITES A CHECK, and no longer writes over the account's own balance. */
  assert.deepEqual([...SCRIPT.reads].sort(), ['accounts', 'balances', 'cash_counts', 'categories', 'transactions']);
  assert.deepEqual([...SCRIPT.writes].sort(), ['balances', 'cash_counts', 'transactions']);
  /* A NEW COUNT, NOT AN EDITED ONE. An edited count run again would subtract against the balance the count itself
     already set, so a correction is a new count, which is also what leaves a trail. */
  assert.deepEqual(RULE.on, { written: { register: 'cash_counts', op: ['create'] } });
  assert.deepEqual(RULE.steps, [{ script: { id: SCRIPT.script, as: 'queued' } }]);
  const file = await readPackFile(TEXT);
  assert.ok(file.ok, fixOf(file));
  assert.equal(file.value.pack.manifest.pack, 'count-cash');
  /* 1.3.0 BESIDE THE RELEASED 1.2.0: a count can say why it was not compared, a field added and none taken away.
     1.3.1 BESIDE THE PUBLISHED 1.3.0: the same sentence, now naming the way out. Words only, so a patch.
     1.3.2 BESIDE THE PUBLISHED 1.3.1: the way out now says which balance to type. Words only again.
     1.3.3 BESIDE THE PUBLISHED 1.3.2: a count in another currency than its account says so on the count, where only
     the run's log did. A sentence written on two paths, no field added, so a patch.
     1.4.0 BESIDE THE PUBLISHED 1.3.3: Money gains a box to count the cash in and the newest count, by adds, and a count
     that files says so. A block and a sentence added, so a minor.
     1.4.1 BESIDE THE PUBLISHED 1.4.0: the two blocks follow Heads up, in the main column, where they followed What it
     holds today, which Money no longer has. Where two blocks stand, nothing added or taken away, so a patch.
     2.0.0 BESIDE THE PUBLISHED 1.4.2: a count can carry notes and coins, say how its difference is recorded, and no
     longer needs a typed total. Fields added and one made optional, so a major.
     2.0.1 BESIDE THE PUBLISHED 2.0.0: the way into the counter on an account's page follows What moved, the table the
     page now has where it had Last moves. One word in an add, so a patch.
     3.0.5 BESIDE THE PUBLISHED 3.0.4: the three on Money follow Cash now does not add up, since Heads up, which they
     followed, left Money at money-core 3.34.0 (aaf8e24df) and they had fallen to the foot of the page. A patch. */
  assert.equal(file.value.pack.manifest.version, '3.0.5');
  assert.match(PACK.changes, /back under Cash now on Money/);
  const counts = PACK.declarations.find((d) => d.register === 'cash_counts') as { fields: { id: string }[] };
  assert.deepEqual(counts.fields.map((f) => f.id), ['account', 'counted', 'on', 'denominations', 'filed', 'lines', 'difference', 'said', 'note']);
});

/* ── The script, in QuickJS ────────────────────────────────────────────────────────────────────── */

type Row = { id: string; register: string; seq: number; fields: Record<string, Json>; version: number; updated_at: string };

const row = (id: string, register: string, seq: number, fields: Record<string, Json>, version = 1): Row => ({ id, register, seq, fields, version, updated_at: NOW });

/** A host double holding one count and one account, as a rule would hand the script the count. */
const hostOf = (count: Row, account: Row): CtxHost => ({
  fetch: async () => {
    throw new Error('counting cash fetches nothing');
  },
  get: async (spoken) => ([count, account].find((r) => r.id === spoken) ?? null) as unknown as Json,
  now: () => NOW,
  tz: 'UTC',
  input: { id: count.id, register: 'cash_counts', seq: count.seq },
});

const decl = (): ScriptDecl => ({ id: SCRIPT.script, version: 1, egress: SCRIPT.egress, keys: SCRIPT.keys, reads: SCRIPT.reads, writes: SCRIPT.writes, source: SCRIPT.source });

const writesOf = (a: ScriptAnswer): ScriptWrite[] => {
  assert.ok('writes' in a, `the run was refused: ${JSON.stringify(a)}`);
  return a.writes;
};

const BOX = row('01K5BOX0000000000000000001', 'accounts', 4, { name: 'Cash box', kind: 'cash', balance: { amount: 50_000, currency: 'GBP' }, as_of: '2026-09-20', liquid: true }, 6);

/** What a count in another currency than its account says (1.3.3): the two currencies, and the way out. */
const OTHER_CURRENCY = "This count is in EUR and the account is in GBP, so it was not compared. Count in the account's currency.";

test('A COUNT IN ANOTHER CURRENCY IS SAID ON THE COUNT AND NOTHING ELSE IS WRITTEN, because two currencies are never subtracted', async () => {
  const count = row('01K5CNT0000000000000000001', 'cash_counts', 1, { account: BOX.id, counted: { amount: 41_250, currency: 'EUR' }, on: '2026-09-25' });
  const a = await runInQuickJs(decl(), hostOf(count, BOX));
  /* SAID WHERE A PERSON READS IT (1.3.3): the log is not on their screen. No check and no difference, as before. */
  assert.deepEqual(writesOf(a), [{ op: 'update', spoken: 'cash_counts#1', patch: { said: OTHER_CURRENCY }, version: 1 }]);
  assert.match(a.log, /counted in EUR and Cash box is held in GBP/);
  assert.doesNotMatch(OTHER_CURRENCY, /\u2014/);
});

test('A COUNT DATED BEFORE THE BALANCE IT WOULD CORRECT IS KEPT AND CHANGES NOTHING, since a later balance already says more', async () => {
  const count = row('01K5CNT0000000000000000002', 'cash_counts', 2, { account: BOX.id, counted: { amount: 41_250, currency: 'GBP' }, on: '2026-09-18' });
  const a = await runInQuickJs(decl(), hostOf(count, BOX));
  assert.deepEqual(writesOf(a), []);
  assert.match(a.log, /Cash box's balance is from 2026-09-20, after this count of 2026-09-18/);
});

/* ── An entry in another currency (1.3.0) ──────────────────────────────────────────────────────── */

type Leaf = { field: string; is?: Json; gt?: string; lte?: string; present?: boolean };

/** The same double with the lists a count reads: `ctx.record.list` answered from `rows` by the leaves the script asks. */
const hostWith = (count: Row, account: Row, rows: Row[]): CtxHost => ({
  ...hostOf(count, account),
  list: async (register, where) => {
    const leaves = (where as { all: Leaf[] }).all;
    const fits = (r: Row, l: Leaf): boolean => {
      const v = r.fields[l.field];
      if (l.present === true) return v !== undefined && v !== null;
      if (l.is !== undefined) return v === l.is;
      if (l.gt !== undefined) return typeof v === 'string' && v > l.gt;
      if (l.lte !== undefined) return typeof v === 'string' && v <= l.lte;
      return true;
    };
    return rows.filter((r) => r.register === register && leaves.every((l) => fits(r, l))) as unknown as Json[];
  },
});

const moved = (seq: number, on: string, amount: number, currency: string, more: Record<string, Json> = {}): Row =>
  row(`01K5TXN00000000000000000${String(seq).padStart(2, '0')}`, 'transactions', seq, { what: 'Paid out', on, direction: 'out', amount: { amount, currency }, account: BOX.id, state: 'cleared', ...more });

/* 1.3.1 NAMES THE WAY OUT. The sentence alone left a box with one foreign sale uncounted for good and never said that
   a newer balance on the account is what lets the next count through.
   1.3.2 SAYS WHICH BALANCE. "Type the account's balance" read as the cash just counted, and a box typed to the count
   agrees with the next count for good: the gap the count was for is never written. The figure to type is the one
   somebody else states, the bank or the statement. */
const NOT_COMPARED = 'This account holds an entry in another currency, so it was not compared. On the account, type the balance its bank or statement shows, not the cash in the box, then count again.';

test('AN ACCOUNT HOLDING A CLEARED ENTRY IN ANOTHER CURRENCY SINCE ITS STATEMENT IS NOT COMPARED, and the count says so', async () => {
  /* THE FAULT, MEASURED ON 1.2.0: the box was said to hold 500.00 on the 20th, 20.00 went out in pounds and 87.50 in
     euros, and a count of 480.00 was "right" to the pound because the script left the euros out, while the record's
     own roll converts them. A count of 392.50 filed 87.50, a difference equal to the foreign charge. */
  const count = row('01K5CNT0000000000000000003', 'cash_counts', 3, { account: BOX.id, counted: { amount: 39_250, currency: 'GBP' }, on: '2026-09-25' }, 2);
  const a = await runInQuickJs(decl(), hostWith(count, BOX, [moved(11, '2026-09-22', 2_000, 'GBP'), moved(12, '2026-09-23', 8_750, 'EUR')]));
  assert.deepEqual(writesOf(a), [{ op: 'update', spoken: 'cash_counts#3', patch: { said: NOT_COMPARED }, version: 2 }]);
  /* THE LOG LINE IS THE ONE 1.3.0 WROTE, whole: the way out is for the person reading the count, not for the run's log. */
  assert.equal(a.log.trim(), 'Cash box holds an entry in another currency than GBP since it was last stated, so this count was not compared and no difference was written.');
});

test('AN ACCOUNT LAST STATED IN ANOTHER CURRENCY THAN THE COUNT SAYS SO ON THE COUNT TOO, by the currency of that statement', async () => {
  /* The account's own balance is in the count's currency, and a balance check after it is in pounds: the roll starts
     from the check, so there is nothing to subtract the count from. 1.3.2 wrote that to the log alone. */
  const till = row('01K5BOX0000000000000000002', 'accounts', 5, { name: 'Till', kind: 'cash', balance: { amount: 50_000, currency: 'EUR' }, as_of: '2026-09-20', liquid: true }, 3);
  const check = row('01K5BAL0000000000000000001', 'balances', 1, { account: till.id, as_of: '2026-09-22', balance: { amount: 40_000, currency: 'GBP' } });
  const count = row('01K5CNT0000000000000000009', 'cash_counts', 9, { account: till.id, counted: { amount: 41_250, currency: 'EUR' }, on: '2026-09-25' }, 2);
  const a = await runInQuickJs(decl(), hostWith(count, till, [check]));
  assert.deepEqual(writesOf(a), [{ op: 'update', spoken: 'cash_counts#9', patch: { said: OTHER_CURRENCY }, version: 2 }]);
  assert.match(a.log, /counted in EUR and Till was last said to hold GBP/);
});

test('A BANK MESSAGE THAT LAST STATED THE ACCOUNT IN ANOTHER CURRENCY SAYS SO ON THE COUNT AS WELL, and count.js holds the sentence', async () => {
  /* The newest statement is a movement's balance after, not a balance check: the same path, reached the other way. */
  const till = row('01K5BOX0000000000000000003', 'accounts', 6, { name: 'Till', kind: 'cash', balance: { amount: 50_000, currency: 'EUR' }, as_of: '2026-09-20', liquid: true }, 3);
  const told = row('01K5TXN0000000000000000021', 'transactions', 21, { what: 'Paid in', on: '2026-09-23', direction: 'in', amount: { amount: 1_000, currency: 'GBP' }, balance_after: { amount: 40_000, currency: 'GBP' }, account: till.id, state: 'cleared' });
  const count = row('01K5CNT0000000000000000010', 'cash_counts', 10, { account: till.id, counted: { amount: 41_250, currency: 'EUR' }, on: '2026-09-25' }, 4);
  const a = await runInQuickJs(decl(), hostWith(count, till, [told]));
  /* ONE WRITE, THE WORD ON THE COUNT: no check, no difference, and never the sentence about a foreign entry. */
  assert.deepEqual(writesOf(a), [{ op: 'update', spoken: 'cash_counts#10', patch: { said: OTHER_CURRENCY }, version: 4 }]);
  assert.match(a.log, /counted in EUR and Till was last said to hold GBP/);
  assert.ok(SOURCE.includes("so it was not compared. Count in the account's currency.`;"), 'count.js says another sentence than this test holds');
});

test('THE SENTENCE NAMES THE WAY OUT, AND THE WAY OUT WORKS: the balance typed after the foreign entry, and the next count is compared', async () => {
  /* WHICH BALANCE, THEN THE WAY OUT, in that order and in one sentence a person reads under What happened. */
  assert.match(NOT_COMPARED, /type the balance its bank or statement shows, not the cash in the box, then count again\.$/);
  assert.doesNotMatch(NOT_COMPARED, /Type the account's balance/);
  assert.doesNotMatch(NOT_COMPARED, /\u2014/);
  assert.ok(SOURCE.includes(`const NOT_COMPARED = '${NOT_COMPARED}';`), 'count.js says another sentence than this test holds');
  /* SHE TYPES 392.50 AS OF THE 24TH, after the euros of the 23rd, and counts 390.00 on the 25th: out by 2.50, written. */
  const typed = row(BOX.id, 'accounts', 4, { ...BOX.fields, balance: { amount: 39_250, currency: 'GBP' }, as_of: '2026-09-24' }, 7);
  const count = row('01K5CNT0000000000000000005', 'cash_counts', 5, { account: BOX.id, counted: { amount: 39_000, currency: 'GBP' }, on: '2026-09-25' });
  const a = await runInQuickJs(decl(), hostWith(count, typed, [moved(11, '2026-09-22', 2_000, 'GBP'), moved(12, '2026-09-23', 8_750, 'EUR')]));
  const writes = writesOf(a) as unknown as { op: string; register?: string; patch?: Record<string, Json> }[];
  assert.deepEqual(writes.map((w) => [w.op, w.register ?? null]), [['create', 'transactions'], ['create', 'balances'], ['update', null]]);
  assert.deepEqual(writes[2]!.patch, { difference: { amount: -250, currency: 'GBP' }, said: 'Filed as one entry in the Ledger.' });
});

test('THE SAME ACCOUNT WITH ITS ENTRIES IN ONE CURRENCY IS COMPARED AS IT WAS, and so is one whose foreign entry is older than its statement', async () => {
  const count = row('01K5CNT0000000000000000004', 'cash_counts', 4, { account: BOX.id, counted: { amount: 47_500, currency: 'GBP' }, on: '2026-09-25' });
  /* A PENDING ENTRY IN EUROS MOVED NOTHING, and one cleared before the 20th is already inside what the box was said to hold. */
  const rows = [moved(11, '2026-09-22', 2_000, 'GBP'), moved(12, '2026-09-23', 8_750, 'EUR', { state: 'pending' }), moved(13, '2026-09-19', 900, 'EUR')];
  const a = await runInQuickJs(decl(), hostWith(count, BOX, rows));
  const writes = writesOf(a) as unknown as { op: string; register?: string; fields?: Record<string, Json>; patch?: Record<string, Json> }[];
  assert.deepEqual(
    writes.map((w) => [w.op, w.register ?? null]),
    [
      ['create', 'transactions'],
      ['create', 'balances'],
      ['update', null],
    ],
  );
  assert.deepEqual([writes[0]!.fields!.direction, writes[0]!.fields!.amount], ['out', { amount: 500, currency: 'GBP' }]);
  assert.deepEqual(writes[2]!.patch, { difference: { amount: -500, currency: 'GBP' }, said: 'Filed as one entry in the Ledger.' });
});

/* ── The whole path ────────────────────────────────────────────────────────────────────────────── */

test('THE WHOLE PATH ON A SELF-HOST: a person writes a count, and the record writes the difference and the check', async () => {
  const { start } = await import('../../apps/selfhost/src/server.ts');
  const dir = mkdtempSync(join(tmpdir(), 'braindog-count-cash-'));
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
    assert.equal(api.kernel.register('cash_counts'), undefined, 'the record already takes a count');
    await put(PACK);

    const box = said<{ id: string; seq: number }>(
      await api.create({ register: 'accounts', fields: { name: 'Cash box', kind: 'cash', balance: { amount: 50_000, currency: 'GBP' }, as_of: '2026-09-20', liquid: true } }, owner),
    );
    const settle = async () => {
      await running.drain();
      await running.poll();
    };

    /* SHORT BY 87.50. The ledger gains one row out, the box says 412.50 as of the count's day, and the count says
       what it found. */
    const short = said<{ id: string }>(await api.create({ register: 'cash_counts', fields: { account: box.id, counted: { amount: 41_250, currency: 'GBP' }, on: '2026-09-25' } }, owner));
    await settle();
    const ledger = () =>
      running.sql
        .all<{ fields: string }>("SELECT fields FROM entry WHERE register = 'transactions' AND deleted_at IS NULL ORDER BY seq")
        .map((r) => JSON.parse(r.fields) as { what: string; on: string; direction: string; amount: { amount: number; currency: string }; account: string; state: string });
    assert.deepEqual(
      ledger().map((t) => [t.what, t.on, t.direction, t.amount.amount, t.amount.currency, t.account, t.state]),
      [['Cash count difference', '2026-09-25', 'out', 8_750, 'GBP', box.id, 'cleared']],
    );
    /* THE COUNT IS A BALANCE CHECK AND THE ACCOUNT KEEPS WHAT A PERSON TYPED, since 1.1.0. */
    const checks = () =>
      running.sql
        .all<{ fields: string }>("SELECT fields FROM entry WHERE register = 'balances' AND deleted_at IS NULL ORDER BY seq")
        .map((r) => JSON.parse(r.fields) as { account: string; balance: { amount: number; currency: string }; as_of: string; source: string })
        .map((c) => [c.account, c.balance.amount, c.balance.currency, c.as_of, c.source]);
    const boxNow = () => api.kernel.get(box.id)?.fields as { balance: { amount: number }; as_of: string };
    assert.deepEqual(checks(), [[box.id, 41_250, 'GBP', '2026-09-25', 'Cash count of 2026-09-25']]);
    assert.deepEqual([boxNow().balance.amount, boxNow().as_of], [50_000, '2026-09-20']);
    assert.deepEqual(api.kernel.get(short.id)?.fields.difference, { amount: -8_750, currency: 'GBP' });

    /* THE NEXT COUNT FINDS MORE THAN THE BOX SAYS, and the difference goes in. The edit the script made to the first
       count started nothing: one transaction for each count, not one for each write. */
    said(await api.create({ register: 'cash_counts', fields: { account: box.id, counted: { amount: 43_000, currency: 'GBP' }, on: '2026-09-26' } }, owner));
    await settle();
    assert.deepEqual(
      ledger().map((t) => [t.direction, t.amount.amount, t.on]),
      [
        ['out', 8_750, '2026-09-25'],
        ['in', 1_750, '2026-09-26'],
      ],
    );
    assert.deepEqual(checks().map((c) => [c[1], c[3]]), [
      [41_250, '2026-09-25'],
      [43_000, '2026-09-26'],
    ]);

    /* A COUNT THAT AGREES WRITES NO TRANSACTION, and still writes its check, because the balance was checked. */
    said(await api.create({ register: 'cash_counts', fields: { account: box.id, counted: { amount: 43_000, currency: 'GBP' }, on: '2026-09-27' } }, owner));
    await settle();
    assert.equal(ledger().length, 2);
    assert.deepEqual(checks().at(-1)?.slice(1, 4), [43_000, 'GBP', '2026-09-27']);

    /* A MOVEMENT BETWEEN TWO COUNTS IS NOT COUNTED TWICE. 1.0.x subtracted the count from the balance the account was
       typed with, so 20.00 spent after the last count was in the ledger and in the difference as well. The next count
       finds exactly what the ledger says is left, and writes no difference. */
    said(await api.create({ register: 'transactions', fields: { what: 'Stamps', on: '2026-09-28', direction: 'out', amount: { amount: 2_000, currency: 'GBP' }, account: box.id, state: 'cleared' } }, owner));
    said(await api.create({ register: 'cash_counts', fields: { account: box.id, counted: { amount: 41_000, currency: 'GBP' }, on: '2026-09-29' } }, owner));
    await settle();
    assert.deepEqual(ledger().map((t) => t.what), ['Cash count difference', 'Cash count difference', 'Stamps']);
    assert.deepEqual(checks().at(-1)?.slice(1, 4), [41_000, 'GBP', '2026-09-29']);

    /* AN ENTRY IN ANOTHER CURRENCY, AND THE NEXT COUNT IS NOT COMPARED (1.3.0). The record's roll converts the euros and
       this script cannot, so the count is kept and says why, and the Ledger and the checks stand as they were. */
    said(await api.create({ register: 'transactions', fields: { what: 'Paper from Lyon', on: '2026-09-30', direction: 'out', amount: { amount: 8_750, currency: 'EUR' }, account: box.id, state: 'cleared' } }, owner));
    const apart = said<{ id: string }>(await api.create({ register: 'cash_counts', fields: { account: box.id, counted: { amount: 33_000, currency: 'GBP' }, on: '2026-10-01' } }, owner));
    await settle();
    assert.deepEqual(ledger().map((t) => t.what), ['Cash count difference', 'Cash count difference', 'Stamps', 'Paper from Lyon']);
    assert.equal(checks().length, 4);
    assert.deepEqual(
      [api.kernel.get(apart.id)?.fields.said, api.kernel.get(apart.id)?.fields.difference ?? null],
      [NOT_COMPARED, null],
    );

    /* A PERSON EDITS AN OLD COUNT'S NOTE, AND NOTHING RUNS. Five counts, five runs. Checked the other way:
       with the rule widened to `op: [create, update]`, this edit was one run more. The script's own
       write of the difference was never one, rule or no rule, because the kernel does not start a rule twice on one row
       in one chain; the edit is what `op: [create]` is for. */
    said(await api.update({ register: 'cash_counts', seq: api.kernel.get(short.id)!.seq!, patch: { note: 'Recounted with the till roll.' } }, owner));
    await settle();
    const runs = running.sql.one<{ n: number }>('SELECT count(*) AS n FROM automation_run WHERE rule = ?', RULE.rule)?.n;
    assert.equal(runs, 5);
  } finally {
    await running.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
