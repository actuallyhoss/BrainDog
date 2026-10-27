/**
 * The question an arrival held for a person asks: where it came from, the list it would go on and what stopped it, in
 * a person's words and in eighty characters, asked once.
 *
 * MEASURED ON THE OWNER'S RECORD: three texts a bank sent for a card nobody had added opened SG71, SG72 and SG73, each
 * "bank-card-used-sms could not read account out of this one. Accept it into transactions, or fix the pattern.", one
 * under another on Decide. A pattern's id and a list's id are words nobody chose for a person to read, the sentence ran
 * past a phone's line twice, and the same question three times is two questions too many.
 *
 * THE REASON IS NOT THE QUESTION. The reason is the inbox's sentence, stored on the arrival and word for word what it
 * was; the question is what Decide draws, and its detail is the suggestion's `context`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { jcs, openRecord, type Arrived, type Declaration, type Json, type Kernel } from '../src/index.ts';
import { QUESTION_MOST, arrive as arriveThrough, type IngestDeps } from '../src/ingest.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 5, 12);
const OWNER = { actor: 'p_1' };

const TRANSACTIONS: Declaration = {
  id: 'register.transactions',
  kind: 'register',
  body: {
    id: 'transactions',
    name: 'Transactions',
    title: 'merchant',
    fields: [
      { id: 'merchant', type: 'text', label: 'Merchant', required: true },
      { id: 'amount', type: 'money', label: 'Amount' },
      { id: 'account', type: 'ref', to: 'accounts', label: 'Account' },
      { id: 'ref', type: 'text', label: 'Reference' },
    ],
  } as never,
};

const ACCOUNTS: Declaration = {
  id: 'register.accounts',
  kind: 'register',
  body: {
    id: 'accounts',
    name: 'Accounts',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'last4', type: 'text' },
    ],
  } as never,
};

const READS = {
  merchant: { text: { between: ['at ', ' for'] } },
  amount: { money: { after: 'EGP ', currency: 'EGP' } },
  account: { lookup: { register: 'accounts', by: 'last4', after: 'card ending ' } },
};

const CARD = (over: Record<string, unknown> = {}): Declaration => ({
  id: 'ingest.bank-card-used',
  kind: 'ingest',
  body: {
    ingest: 'bank-card-used',
    channel: 'email',
    match: { all: [{ field: 'body', contains: 'card ending' }] },
    extract: READS,
    writes: { register: 'transactions', confidence: 'exact' },
    dedupe: ['merchant', 'amount'],
    on_conflict: 'skip',
    ...over,
  } as never,
});

/* Synthetic wordings, invented for this file: no real message is quoted here. */
const said = (merchant: string, last4: string, amount = '85.00'): string => `Your card ending ${last4} was used at ${merchant} for EGP ${amount} today.`;

/**
 * `43 §4.3`'s literal rule as `@braindog/extract` hands it down, cut to what this file reads: a whole token, and for a
 * `lookup` the one value whose end is the digits printed behind stars.
 */
const literals = (text: string, entries: readonly (readonly [string, Json])[], form?: 'enum' | 'lookup'): Json[] => {
  const tokens = text.trim().split(/\s+/);
  const whole = entries.filter(([literal]) => tokens.includes(literal)).map(([, id]) => id);
  if (whole.length || form !== 'lookup') return whole;
  const printed = /^\*+-?(\d{3,})$/.exec(tokens[0] ?? '')?.[1];
  return printed === undefined ? [] : entries.filter(([literal]) => literal.length > printed.length && literal.endsWith(printed)).map(([, id]) => id);
};

async function record(...decls: Declaration[]): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW), { literals });
  const installed = await k.install([ACCOUNTS, TRANSACTIONS, ...decls]);
  assert.ok(installed.ok, JSON.stringify(installed));
  assert.ok(k.create('accounts', { name: 'Cairo savings', last4: '6518' }, OWNER).ok);
  return { k, sql };
}

const arrive = (k: Kernel, body: string, sha256: string, channel: 'email' | 'api' = 'email'): Arrived => {
  const r = k.arrive({ channel, headers: { From: 'alerts@bank.example', Subject: 'Card' }, body, sha256 }) as { ok: boolean; value: Arrived };
  assert.ok(r.ok, JSON.stringify(r));
  return r.value;
};

/** The question and the detail Decide draws for an arrival's suggestion. */
const asked = (k: Kernel, sql: NodeSql, out: Arrived): { question: string; context: string | undefined } => {
  assert.ok(out.suggestion, `no question was opened: ${out.reason}`);
  const body = JSON.parse(sql.one<{ body: string }>('SELECT body FROM suggestion WHERE id = ?', out.suggestion)!.body) as { context?: string };
  return { question: k.question(out.suggestion) ?? '', context: body.context };
};

/** No id a person did not choose: neither the pattern's nor the list's, nor a row's spoken one. */
const inWords = (question: string): void => {
  assert.ok([...question].length <= QUESTION_MOST, `${[...question].length} characters: ${question}`);
  assert.doesNotMatch(question, /bank-card-used|transactions|#\d/u, question);
};

test('A FIELD IT COULD NOT READ IS ASKED BY ITS LABEL, on the list by its name, from what came, and the reason is kept', async () => {
  const { k, sql } = await record(CARD());
  const out = arrive(k, said('Halden Coffee', '9999'), 'a1');
  assert.equal(out.state, 'review');
  assert.equal(out.reason, 'Account could not be found in this one.', 'the inbox says the field by its label and no pattern by its id');

  const { question, context } = asked(k, sql, out);
  assert.equal(question, 'Add this email to Transactions? Its account could not be read.');
  inWords(question);
  assert.equal(context, 'Account was not found in it.');

  sql.close();

  /* A MESSAGE SENT TO AN ADDRESS IS A MESSAGE, and fields too many for the line are said in the detail. */
  const api = await record(CARD({ channel: 'api' }));
  const three = asked(api.k, api.sql, arrive(api.k, 'Your card ending 9999 was used today.', 'a2', 'api'));
  assert.equal(three.question, 'Add this message to Transactions? Part of it could not be read.');
  inWords(three.question);
  assert.equal(three.context, 'Merchant, amount and account were not found in it.');
  api.sql.close();
});

test('WHERE IT CAME FROM IS THE PATTERN’S DESCRIPTION, and a description too long for the line is left to the detail', async () => {
  const named = await record(CARD({ description: 'HSBC' }));
  const short = asked(named.k, named.sql, arrive(named.k, said('Halden Coffee', '9999'), 'd1'));
  assert.equal(short.question, 'Add this email from HSBC to Transactions? Its account could not be read.');
  inWords(short.question);
  named.sql.close();

  const long = await record(CARD({ description: 'HSBC Egypt card alerts forwarded from the shared inbox' }));
  const fell = asked(long.k, long.sql, arrive(long.k, said('Halden Coffee', '9999'), 'd2'));
  assert.equal(fell.question, 'Add this email to Transactions? Its account could not be read.');
  long.sql.close();
});

test('WITH NO DESCRIPTION, WHERE IT CAME FROM IS THE ADD-ON THAT DECLARED THE PATTERN, by its title and never its id', async () => {
  /* NO SHIPPED PATTERN CARRIES A DESCRIPTION, so every question a bank's alert opened said "this email" and never whose. */
  const withPack = async (title: string | undefined, over: Record<string, unknown> = { pack: 'card-alerts' }, on = true) => {
    const sql = openSqlite();
    const k = await openRecord(sql, fixedClock(NOW), { literals });
    k.rememberPack({
      id: 'card-alerts',
      version: '1.0.0',
      source: 'local',
      ref: null,
      manifest: jcs({ pack: 'card-alerts', version: '1.0.0', ...(title === undefined ? {} : { title }) }),
      checksum: 'not-a-real-checksum',
    });
    const installed = await k.install([ACCOUNTS, TRANSACTIONS, CARD(over)]);
    assert.ok(installed.ok, JSON.stringify(installed));
    if (!on) sql.exec("UPDATE pack SET disabled_at = '2026-09-01T00:00:00.000Z' WHERE id = 'card-alerts'");
    assert.ok(k.create('accounts', { name: 'Cairo savings', last4: '6518' }, OWNER).ok);
    const question = asked(k, sql, arrive(k, said('Halden Coffee', '9999'), 'p1')).question;
    sql.close();
    return question;
  };
  const titled = await withPack('Card alerts');
  assert.equal(titled, 'Add this email from Card alerts to Transactions? Its account could not be read.');
  inWords(titled);
  /* A DESCRIPTION STILL WINS, the name somebody chose for this one pattern. */
  assert.equal(await withPack('Card alerts', { pack: 'card-alerts', description: 'HSBC' }), 'Add this email from HSBC to Transactions? Its account could not be read.');
  /* An add-on with no title, or one switched off, names nothing: its id is a slug nobody chose for a person to read. */
  assert.equal(await withPack(undefined), 'Add this email to Transactions? Its account could not be read.');
  assert.equal(await withPack('Card alerts', { pack: 'card-alerts' }, false), 'Add this email to Transactions? Its account could not be read.');
});

test('THE SAME QUESTION IS ASKED ONCE while it is open, and the arrival asked it again joins it as a second row', async () => {
  const { k, sql } = await record(CARD());
  const first = arrive(k, said('Halden Coffee', '9999'), 's1');
  assert.ok(first.suggestion);
  /* A SECOND CARD NOBODY ADDED, ANOTHER CHARGE AT THE SAME SHOP: the same words, the same list, the same detail. */
  const second = arrive(k, said('HALDEN Coffee', '8888', '40.00'), 's2');
  assert.equal(second.state, 'review');
  assert.equal(second.suggestion, first.suggestion, 'the same question was filed twice');
  assert.equal(second.reason, 'Account could not be found in this one.');
  const held = sql.one<{ state: string; reason: string }>('SELECT state, reason FROM inbox_raw WHERE id = ?', second.raw);
  assert.deepEqual({ ...held }, { state: 'review', reason: second.reason }, 'the arrival is kept, held, with its reason');
  const open = () => sql.one<{ n: number }>("SELECT count(*) AS n FROM suggestion WHERE body_kind = 'rowset' AND status = 'open'")!.n;
  assert.equal(open(), 1);
  /* AND ITS CHARGE IS IN THE QUESTION, a row under the one heading: left out of every question, accepting the first added
     one charge and the second was in the inbox alone, where nothing reads it again. */
  const body = (id: string) => JSON.parse(sql.one<{ body: string }>('SELECT body FROM suggestion WHERE id = ?', id)!.body) as { rows: { merchant?: unknown }[]; count?: number };
  const merchants = (id: string): unknown[] => body(id).rows.map((r) => r.merchant);
  assert.deepEqual(merchants(first.suggestion!), ['Halden Coffee', 'HALDEN Coffee']);
  assert.equal(body(first.suggestion!).count, 2, 'the heading cannot say how many it asks about');
  assert.equal(k.question(first.suggestion!), 'Add this email to Transactions? Its account could not be read.');

  /* THE JOIN IS IN THE LOG: growing a question changes what one press accepts, so it is never silent. */
  const joined = sql.all<{ actor: string; field: string; from_v: string; to_v: string; note: string }>(
    "SELECT actor, field, from_v, to_v, note FROM event WHERE kind = 'suggest' AND target = ? AND field = 'rows' ORDER BY rowid",
    `suggestion:${first.suggestion}`,
  );
  assert.deepEqual(
    joined.map((e) => ({ ...e })),
    [{ actor: 'ingest:bank-card-used', field: 'rows', from_v: '1', to_v: '2', note: 'One more like it joined this question, 2 in all.' }],
  );
  assert.doesNotMatch(joined[0]!.note, /SG\d|inbox_raw|bank-card-used/u, 'the note names an id');

  /* A CHARGE AT ANOTHER SHOP JOINS TOO, WHEN WHAT WAS NOT READ IS THE ACCOUNT: the answer is the same for every
     charge it holds, so a question per shop asked it again for each shop. The message prints no tail a lookup that says
     nothing of what it reads could take for one, so it keeps this question, joined by its door and what was missed. */
  const bakery = arrive(k, said('Cedar Lane Bakery', '8888', '40.00'), 's2b');
  assert.equal(bakery.suggestion, first.suggestion, 'a charge whose account was not read was asked again for its shop');
  assert.deepEqual(merchants(first.suggestion!), ['Halden Coffee', 'HALDEN Coffee', 'Cedar Lane Bakery']);
  assert.equal(open(), 1);

  /* A DIFFERENT CAUSE IS A DIFFERENT QUESTION. */
  const unpriced = arrive(k, 'Your card ending 9999 was used at Halden Coffee for a coffee today.', 's3');
  assert.ok(unpriced.suggestion, 'a different question was taken for the same one');
  assert.notEqual(unpriced.suggestion, first.suggestion);
  assert.equal(k.question(unpriced.suggestion!), 'Add this email to Transactions? Its amount and account could not be read.');
  assert.equal(open(), 2);

  /* ACCEPTED, IT ADDS EVERY CHARGE IT HOLDS, and once it is answered the next one is asked again: a new question. */
  const yes = k.decide(first.suggestion!, { decide: { option: 'accept', reason: 'all are mine' } }, 'p_1');
  assert.ok(yes.ok, JSON.stringify(yes));
  assert.equal(yes.value.wrote.length, 3);
  const third = arrive(k, said('Nile Books', '7777', '12.00'), 's4');
  assert.ok(third.suggestion, 'an answered question kept the next one from being asked');
  assert.notEqual(third.suggestion, first.suggestion);
  assert.equal(k.question(third.suggestion!), 'Add this email to Transactions? Its account could not be read.');

  /* A QUESTION HOLDING AS MANY ROWS AS ONE MAY is asked again beside it, rather than grown past what can be accepted. */
  sql.exec("UPDATE suggestion SET body = json_set(body, '$.rows', json(?)) WHERE id = ?", JSON.stringify(Array.from({ length: 200 }, () => ({ merchant: 'Nile Books' }))), third.suggestion);
  const full = arrive(k, said('Nile Books', '6666', '7.00'), 's5');
  assert.ok(full.suggestion && full.suggestion !== third.suggestion, 'a full question was grown past two hundred rows');
  assert.deepEqual(merchants(full.suggestion!), ['Nile Books']);
  sql.close();
});

test('A REFUND IS NEVER ASKED UNDER A CHARGE: the way the money moved is part of what a row is about', async () => {
  /* A PATTERN THAT HOLDS EVERYTHING FOR A PERSON asks one question in the same words about every row it reads. */
  const { k, sql } = await record(CARD({ writes: { register: 'transactions', confidence: 'needs-review' } }));
  const charge = arrive(k, said('Halden Coffee', '6518'), 'r1');
  const again = arrive(k, said('Halden Coffee', '6518', '12.00'), 'r2');
  assert.equal(again.suggestion, charge.suggestion, 'two charges at one shop are one question');
  const refund = arrive(k, said('Halden Coffee', '6518', '-12.00'), 'r3');
  assert.equal(k.question(refund.suggestion!), k.question(charge.suggestion!), 'the premise: the same words');
  assert.notEqual(refund.suggestion, charge.suggestion, 'money moving the other way joined the question');
  const elsewhere = arrive(k, said('Nile Books', '6518'), 'r4');
  assert.notEqual(elsewhere.suggestion, charge.suggestion, 'a charge at another shop joined the question');
  assert.equal(sql.one<{ n: number }>("SELECT count(*) AS n FROM suggestion WHERE status = 'open'")!.n, 3);
  sql.close();
});

test('A GUESS, A PATTERN THAT WAITS AND A REFUSED WRITE each ask in words, with the detail under them', async () => {
  /* A FIELD FILLED IN RATHER THAN READ is a best guess. */
  const guessed = await record(CARD({ extract: { ...READS, ref: { default: { value: 'none', of: { text: { after: 'ref: ' } } } } } }));
  const guess = arrive(guessed.k, said('Halden Coffee', '6518'), 'g1');
  assert.equal(guess.state, 'proposed');
  const g = asked(guessed.k, guessed.sql, guess);
  assert.equal(g.question, 'Add this email to Transactions? Its reference is a best guess.');
  assert.equal(g.context, 'Reference was a best guess, not read from it.');
  guessed.sql.close();

  /* A PATTERN THAT FILES NOTHING UNTIL A PERSON HAS LOOKED is held for her, whatever it read. */
  const waiting = await record(CARD({ writes: { register: 'transactions', confidence: 'needs-review' } }));
  const w = asked(waiting.k, waiting.sql, arrive(waiting.k, said('Halden Coffee', '6518'), 'w1'));
  assert.equal(w.question, 'Add this email to Transactions? It is held for you to check.');
  assert.equal(w.context, 'Everything read this way waits for you before it is added.');
  waiting.sql.close();

  /* A LIST THAT WOULD NOT TAKE WHAT WAS READ names the field by its label, and never the refusal's ids. */
  const refusing = await record(CARD({ extract: { amount: READS.amount } }));
  const r = asked(refusing.k, refusing.sql, arrive(refusing.k, said('Halden Coffee', '6518'), 'r1'));
  assert.equal(r.question, 'Transactions would not take this email as read. Fix it and add it?');
  assert.equal(r.context, 'The part it would not take is its merchant.');
  inWords(r.question);
  refusing.sql.close();
});

test('A NEAR MATCH ASKS BY THE TITLE OF THE ROW IT LOOKS LIKE, cut short rather than past the line', async () => {
  const { k, sql } = await record(CARD({ on_conflict: 'review' }));
  assert.equal(arrive(k, said('Halden Coffee', '6518'), 'n1').state, 'matched');
  const near = arrive(k, said('Halden Coffee', '6518').replace('today', 'this morning'), 'n2');
  assert.equal(near.reason, 'This looks like Halden Coffee, with the same merchant and amount, so the pattern held it for a person rather than skip it or file it twice.');
  const n = asked(k, sql, near);
  assert.equal(n.question, 'Add this email to Transactions as a second one? It looks like Halden Coffee.');
  assert.equal(n.context, 'Compared with Halden Coffee, it has the same merchant and amount. Say no if it is that one.');
  inWords(n.question);

  const long = 'Halden Coffee Roasters and Bakery of the Old Corniche Road';
  assert.equal(arrive(k, said(long, '6518', '9.00'), 'n3').state, 'matched');
  const cut = asked(k, sql, arrive(k, said(long, '6518', '9.00').replace('today', 'again'), 'n4'));
  assert.equal([...cut.question].length, QUESTION_MOST, cut.question);
  assert.equal(cut.question, 'Add this email to Transactions as a second one? It looks like Halden Coffee Ro….');
  assert.ok(cut.context?.includes(long), 'the detail names the row whole');

  /* THE SAME WORDS ABOUT ANOTHER ROW ARE ANOTHER QUESTION: two charges at Halden Coffee are two rows a second one may be,
     and a row asked about beside the wrong one would be compared with a charge it does not look like. */
  assert.equal(arrive(k, said('Halden Coffee', '6518', '12.00'), 'n5').state, 'matched');
  const other = arrive(k, said('Halden Coffee', '6518', '12.00').replace('today', 'again'), 'n6');
  assert.equal(asked(k, sql, other).question, n.question, 'the premise: the same words');
  assert.notEqual(other.suggestion, near.suggestion, 'a near match was asked beside another row it does not look like');
  /* AND THE SAME ROW AGAIN IS THE SAME QUESTION, one more row under it. */
  const again = arrive(k, said('Halden Coffee', '6518').replace('today', 'at noon'), 'n7');
  assert.equal(again.suggestion, near.suggestion);
  sql.close();
});

test('AN ACCOUNT READ FROM ITS LAST DIGITS IS ASKED BY ITS NAME, and the detail says which digits', async () => {
  const { k, sql } = await record(CARD());
  const out = arrive(k, said('Halden Coffee', '***518'), 't1');
  assert.equal(out.state, 'proposed', out.reason ?? '');
  assert.equal(out.reason, 'Filed to Cairo savings by its last digits 518. Confirm it once and later ones file straight away.');
  const t = asked(k, sql, out);
  assert.equal(t.question, 'Add this email to Transactions? Its last digits match Cairo savings.');
  assert.equal(t.context, 'It was matched to Cairo savings by its last digits, 518. Say yes once and later ones are added straight away.');
  inWords(t.question);

  /* A SECOND CHARGE AT THE SAME SHOP ON THE SAME CARD BEFORE ANYBODY SAID YES is the same question, its tail said once;
     one at another shop is a question of its own; and yes to the first adds both its charges and confirms the card, so
     the next one is filed straight away. */
  const again = arrive(k, said('Halden Coffee', '***518', '12.00'), 't2');
  assert.equal(again.suggestion, out.suggestion);
  const body = JSON.parse(sql.one<{ body: string }>('SELECT body FROM suggestion WHERE id = ?', out.suggestion!)!.body) as { rows: unknown[]; tails: unknown[] };
  assert.deepEqual([body.rows.length, body.tails.length], [2, 1]);
  const books = arrive(k, said('Nile Books', '***518', '12.00'), 't2b');
  assert.notEqual(books.suggestion, out.suggestion, 'a charge at another shop joined the question');
  const yes = k.decide(out.suggestion!, { decide: { option: 'accept', reason: 'my card' } }, 'p_1');
  assert.ok(yes.ok, JSON.stringify(yes));
  assert.equal(yes.value.wrote.length, 2);
  assert.equal(arrive(k, said('Cedar Lane Bakery', '***518', '40.00'), 't3').state, 'matched');
  sql.close();
});

test('A LIST OR A FIELD A PERSON RENAMED IS ASKED BY ITS NEW WORD, as the record speaks it, and the reason keeps its own', async () => {
  const { k, sql } = await record(CARD());
  /* THE INGEST'S SEAM AS THE RECORD WIRES IT, with the speaking use case's words handed down beside it. */
  const register = (id: string) => {
    const decl = k.register(id);
    return decl ? ({ register: id, fields: Object.fromEntries(decl.fields.map((f) => [f.id, f])) } as never) : null;
  };
  let minted = 0;
  const deps: IngestDeps = {
    sql,
    ingests: () => [CARD().body as never],
    schemaOf: register,
    write: (list, spoken, patch, actor) => k.write(list, spoken, patch as never, { actor }),
    rows: (list, by) =>
      sql
        .all<{ id: string; value: unknown }>(`SELECT id, json_extract(fields, '$.${by}') AS value FROM entry WHERE register = ? AND deleted_at IS NULL`, list)
        .flatMap((r) => (r.value === null ? [] : [{ id: r.id, value: String(r.value) }])),
    literals,
    mint: () => `01JZ8QK3F7R2M9V4XN6TCB${String(++minted).padStart(4, '0')}`,
    allocate: () => 900 + minted,
    nowMs: NOW,
    words: () => ({ label_transactions: 'Spending', label_transactions__account: 'Card', label_accounts: 'Wallets', speaks: true }),
  };
  const out = arriveThrough(deps, { channel: 'email', headers: { From: 'alerts@bank.example' }, body: said('Halden Coffee', '9999'), sha256: 'w1' }, k.transaction);
  assert.ok(out.ok, JSON.stringify(out));
  const { question } = asked(k, sql, out.value);
  assert.equal(question, 'Add this email to Spending? Its card could not be read.');
  inWords(question);
  assert.equal(out.value.reason, 'Card could not be found in this one.', 'the inbox says the field as the record speaks it and no pattern by its id');

  /* A WORD NOBODY TYPED, OR ONE LEFT BLANK, IS THE DECLARATION'S. */
  const blank = arriveThrough({ ...deps, words: () => ({ label_transactions: '  ' }) }, { channel: 'email', headers: {}, body: said('Nile Books', '9999', '12.00'), sha256: 'w2' }, k.transaction);
  assert.ok(blank.ok && blank.value.suggestion, JSON.stringify(blank));
  assert.equal(k.question(blank.value.suggestion), 'Add this email to Transactions? Its account could not be read.');

  /* A NEAR MATCH SAYS WHAT THE TWO SHARE IN THE RENAMED WORDS TOO, and its reason keeps the declared ones. */
  const near: IngestDeps = { ...deps, ingests: () => [CARD({ on_conflict: 'review' }).body as never], words: () => ({ label_transactions: 'Spending', label_transactions__merchant: 'Shop' }) };
  const first = arriveThrough(near, { channel: 'email', headers: {}, body: said('Halden Coffee', '6518'), sha256: 'w3' }, k.transaction);
  assert.ok(first.ok && first.value.state === 'matched', JSON.stringify(first));
  const second = arriveThrough(near, { channel: 'email', headers: {}, body: said('Halden Coffee', '6518').replace('today', 'again'), sha256: 'w4' }, k.transaction);
  assert.ok(second.ok, JSON.stringify(second));
  const n = asked(k, sql, second.value);
  assert.equal(n.question, 'Add this email to Spending as a second one? It looks like Halden Coffee.');
  assert.equal(n.context, 'Compared with Halden Coffee, it has the same shop and amount. Say no if it is that one.');
  assert.match(second.value.reason ?? '', /with the same merchant and amount/u);
  sql.close();
});
