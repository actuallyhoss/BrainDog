/**
 * An ask in the owner's list says what it was for (ENG-A05 job 6).
 *
 * RED BEFORE THIS: `history` selected the ledger's columns without `purpose`, the one the store has written since
 * version 3, so `Asked` had no such field and every case here read `undefined`. A page that lists the asks could not
 * tell his own from the record's, nor the reading of what arrived from the page headlines.
 *
 * HIS WORDS: "thinking budget 600 a month". The 600 is the record's own work, and it is several kinds of work.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createSlash, type Ask, type Asked, type RawPayload } from '../src/index.ts';
import { canned, fakeRecord, fixedClock, MEMBER, NOW, OWNER, openSqlite } from './double.ts';

const build = () => {
  const sql = openSqlite();
  const inference = canned();
  const slash = createSlash({ sql, clock: fixedClock(NOW), inference, record: fakeRecord() });
  return { sql, inference, slash };
};

/** The list as its owner reads it, oldest first so a case reads in the order it wrote. */
const listed = (slash: ReturnType<typeof build>['slash'], limit = 20): Asked[] => {
  const got = slash.history(limit, OWNER);
  assert.equal(got.ok, true, JSON.stringify(got));
  return got.ok ? [...got.value.asks].reverse() : [];
};

/** A settled row as a host writes its own (`packages/host/src/slash-ask.ts`): the columns named, the rest defaulted. */
const wrote = (sql: ReturnType<typeof build>['sql'], id: string, kind: string, question: string, purpose: string, spends: string): void =>
  sql.exec(
    `INSERT INTO slash_call (id, ts, kind, tier, model, tokens_in, tokens_out, neurons, ms, status, question, purpose, spends)
     VALUES (?, ?, ?, 'a', 'glm-5.3-flash', 700, 60, 9, 40, 'ok', ?, ?, ?)`,
    id,
    new Date(NOW).toISOString(),
    kind,
    question,
    purpose,
    spends,
  );

const sample = (seq: number, amount: string): RawPayload => ({
  id: `inbox_raw#${seq}`,
  channel: 'email',
  ts: '2026-11-14T08:00:00Z',
  from: 'alerts@hsbc.com.eg',
  subject: `HSBC: You have received EGP ${amount} from ACME`,
  body: `Dear customer, your account was credited with EGP ${amount} at ACME LTD on 14 Nov.`,
});

const INGEST = JSON.stringify({
  ingest: {
    match: { from: { is: 'alerts@hsbc.com.eg' }, subject: { starts: 'HSBC: You have received' } },
    extract: { merchant: { between: ['at ', ' LTD'] }, amount: { money: true } },
    writes: { register: 'obligations', confidence: 'exact' },
  },
  flagged: false,
});

const PREDICATE = JSON.stringify({ registers: ['obligations'], where: { all: [{ field: 'state', is: 'open' }] }, q: null });

const RATE: Ask = { rule: 'rate', step: 0, question: 'What rate applies to Gold?', shape: 'number' };

test('(1) ASK, HEADLINE, LOOK AND UNDERSTAND COME BACK LABELLED, each row under the purpose it was written with', () => {
  const { sql, slash } = build();
  try {
    wrote(sql, 'a_1', 'read', 'what is still open', 'ask', 'person');
    wrote(sql, 'a_2', 'pattern', "Slash's page headlines", 'headline', 'background');
    wrote(sql, 'a_3', 'pattern', 'The daily look', 'look', 'background');
    wrote(sql, 'a_4', 'pattern', 'Who is who', 'understand', 'background');

    const asks = listed(slash);
    assert.deepEqual(asks.map((a) => [a.id, a.purpose]), [
      ['a_1', 'ask'],
      ['a_2', 'headline'],
      ['a_3', 'look'],
      ['a_4', 'understand'],
    ]);
    /* THE COUNT A PAGE MAKES FROM IT, which is the reason the field is there. */
    const by = (purpose: string): number => asks.filter((a) => a.purpose === purpose).length;
    assert.deepEqual([by('ask'), by('headline'), by('look'), by('understand')], [1, 1, 1, 1]);
    /* And the rest of an asked row is what it was. */
    assert.deepEqual(asks[1], {
      id: 'a_2',
      ts: new Date(NOW).toISOString(),
      kind: 'pattern',
      purpose: 'headline',
      status: 'ok',
      code: null,
      question: "Slash's page headlines",
      model: 'glm-5.3-flash',
      filed: null,
    });
  } finally {
    sql.close();
  }
});

test("(2) THE ENGINE'S OWN ROWS SAY THEIRS: his question is `ask`, a rule's is `automation`, the record's draft is `look`", async () => {
  const { sql, inference, slash } = build();
  try {
    inference.say(PREDICATE);
    assert.equal((await slash.read('what is still open', OWNER)).ok, true);
    inference.say(JSON.stringify({ value: 12, cites: [] }));
    await slash.answer(RATE);
    inference.say(INGEST);
    const drafted = await slash.draftPattern([sample(212, '5,005.00'), sample(213, '1,200.50'), sample(214, '99.00')]);
    assert.equal(drafted.ok, true, JSON.stringify(drafted));

    assert.deepEqual(listed(slash).map((a) => [a.kind, a.purpose]), [
      ['read', 'ask'],
      ['read', 'automation'],
      ['pattern', 'look'],
    ]);
  } finally {
    sql.close();
  }
});

test('(3) A ROW WRITTEN WITHOUT A PURPOSE IS ONE OF HIS, the column\'s own default, and a purpose the package does not name is kept as written', () => {
  const { sql, slash } = build();
  try {
    sql.exec(
      `INSERT INTO slash_call (id, ts, kind, tier, model, tokens_in, tokens_out, neurons, ms, status)
       VALUES ('o_1', ?, 'read', 'a', 'glm-5.3-flash', 700, 60, 9, 40, 'ok')`,
      new Date(NOW).toISOString(),
    );
    wrote(sql, 'o_2', 'pattern', 'A later kind of work', 'later', 'background');
    assert.deepEqual(listed(slash).map((a) => [a.id, a.purpose]), [
      ['o_1', 'ask'],
      ['o_2', 'later'],
    ]);
  } finally {
    sql.close();
  }
});

test('(4) WHAT THE LIST ALREADY HELD STILL HOLDS: a hold in flight is left out, the newest is first, and only the owner reads it', () => {
  const { sql, slash } = build();
  try {
    wrote(sql, 'n_1', 'read', 'the first', 'ask', 'person');
    wrote(sql, 'n_2', 'pattern', 'The daily look', 'look', 'background');
    sql.exec(
      `INSERT INTO slash_call (id, ts, kind, tier, model, tokens_in, tokens_out, neurons, ms, status, code, question, purpose, spends)
       VALUES ('n_3', ?, 'pattern', 'a', 'glm-5.3-flash', 0, 0, 0, 0, 'error', 'SLASH_PENDING', 'Who is who', 'understand', 'background')`,
      new Date(NOW).toISOString(),
    );
    const got = slash.history(20, OWNER);
    assert.equal(got.ok, true);
    assert.deepEqual(got.ok ? got.value.asks.map((a) => [a.id, a.purpose]) : [], [
      ['n_2', 'look'],
      ['n_1', 'ask'],
    ]);
    assert.equal(slash.history(20, MEMBER).ok, false);
  } finally {
    sql.close();
  }
});
