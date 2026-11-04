/**
 * Ingest: a payload arrives, and the record fills itself.
 *
 * The two failures every ingest pipeline has are SILENCE and DUPLICATION, and everything here is
 * about one or the other. A payload nobody wrote a pattern for is a row somebody can see. A payload
 * whose pattern could not read a field is a row somebody can see, with the reason on it. And the
 * same bytes twice are one row, because every webhook sender retries and most mail servers do too.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { arrive, extractField, extractOutcome, ingestDay, openRecord, type Arrived, type Declaration, type Kernel } from '../src/index.ts';
import { EXPONENT, exponentOf, UNVERIFIED } from '../src/ingest.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 5, 12);

const TRANSACTIONS: Declaration = {
  id: 'register.transactions',
  kind: 'register',
  body: {
    id: 'transactions',
    name: 'Transactions',
    title: 'merchant',
    fields: [
      { id: 'merchant', type: 'text', required: true },
      { id: 'amount', type: 'money' },
      { id: 'date', type: 'day', index: true },
      { id: 'account', type: 'ref', to: 'accounts' },
      { id: 'ref', type: 'text', index: true },
      { id: 'kind', type: 'enum', values: ['debit', 'credit'] },
    ],
  } as never,
};

const ACCOUNTS: Declaration = {
  id: 'register.accounts',
  kind: 'register',
  body: { id: 'accounts', name: 'Accounts', title: 'last4', fields: [{ id: 'last4', type: 'text', required: true }] } as never,
};

const HSBC = (over: Record<string, unknown> = {}): Declaration => ({
  id: 'ingest.hsbc-sms',
  kind: 'ingest',
  body: {
    ingest: 'hsbc-sms',
    channel: 'email',
    match: { all: [{ field: 'from', is: 'alerts@hsbc.example' }, { field: 'subject', contains: 'transaction' }] },
    extract: {
      merchant: { text: { between: ['at ', ' on'] } },
      amount: { money: { after: 'EGP', currency: 'EGP' } },
      date: { date: { format: 'DD/MM/YY', after: ' on ' } },
      account: { lookup: { register: 'accounts', by: 'last4', after: 'card ending ' } },
      kind: { enum: { map: { debited: 'debit', credited: 'credit' } } },
    },
    writes: { register: 'transactions', confidence: 'exact' }, dedupe: ['merchant', 'date'],
    on_conflict: 'skip',
    ...over,
  } as never,
});

const MAIL = 'Your card ending 4471 was debited EGP 1,316.24 at Halden Coffee on 03/04/26.';

type Clockish = ReturnType<typeof fixedClock>;

async function record(...decls: Declaration[]): Promise<{ k: Kernel; sql: NodeSql; clock: Clockish }> {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  assert.ok((await k.install([ACCOUNTS, TRANSACTIONS, ...decls])).ok);
  assert.ok(k.create('accounts', { last4: '4471' }, { actor: 'p_1' }).ok);
  return { k, sql, clock };
}

const send = (k: Kernel, body = MAIL, sha256 = 'a1', subject = 'Your transaction alert') =>
  k.arrive({ channel: 'email', headers: { From: 'alerts@hsbc.example', Subject: subject }, body, sha256 });

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

/* ── it fills itself ─────────────────────────────────────────────────────── */

test('A PAYLOAD ARRIVES AND THE RECORD FILLS ITSELF, in one transaction with no model in it', async () => {
  const { k, sql } = await record(HSBC());
  const out = value<Arrived>(send(k));

  assert.equal(out.state, 'matched');
  assert.equal(out.ingest, 'hsbc-sms');
  assert.equal(out.wrote.length, 1);

  const row = k.get('transactions#1')!;
  assert.equal(row.fields.merchant, 'Halden Coffee');
  assert.deepEqual(row.fields.amount, { amount: 131_624, currency: 'EGP' }, 'the money is not an integer in minor units');
  assert.equal(row.fields.date, '2026-04-03');
  assert.equal(row.fields.account, k.get('accounts#1')?.id, 'the lookup did not resolve to a row');
  assert.equal(row.fields.kind, 'debit');

  // The raw bytes are in the record, which is what makes "why did that not come through" answerable.
  const raw = sql.one<{ state: string; channel: string; sha256: string }>('SELECT state, channel, sha256 FROM inbox_raw')!;
  assert.equal(raw.state, 'matched');
  assert.equal(raw.sha256, 'a1');

  // One receipt per arrival, its `wrote` filled by the record.
  const receipt = sql.one<{ wrote: string; confidence: string; ingest_id: string }>('SELECT wrote, confidence, ingest_id FROM ingest_receipt')!;
  assert.deepEqual(JSON.parse(receipt.wrote), out.wrote);
  assert.equal(receipt.confidence, 'exact');

  // And the write wears the ingest's name, not a person's.
  assert.equal(sql.one<{ actor: string }>("SELECT actor FROM event WHERE kind = 'create' ORDER BY rowid DESC LIMIT 1")?.actor, 'ingest:hsbc-sms');
  sql.close();
});

/* ── the same bytes twice ────────────────────────────────────────────────── */

test('THE SAME BYTES TWICE ARE ONE ROW, because every webhook sender retries', async () => {
  const { k, sql } = await record(HSBC());
  value<Arrived>(send(k));
  const again = value<Arrived>(send(k));

  assert.equal(k.count('transactions'), 1, 'a redelivery wrote a duplicate invoice');
  assert.equal(sql.all('SELECT 1 FROM inbox_raw').length, 1);
  assert.match(again.reason ?? '', /arrived before/);
  /* AND IT SAYS WHAT IT DID THE FIRST TIME. A redelivery answering "nothing was written" would send
     a sender looking for the row it never got told about — the answer is the row from before. */
  assert.deepEqual(again.wrote, [k.get('transactions#1')!.id]);
  assert.equal(again.ingest, 'hsbc-sms');
  sql.close();
});

test('and a DIFFERENT email about the same thing is skipped by its key, with the row named', async () => {
  // The hash catches a redelivery; `key:` catches the second notice about one transaction.
  const { k, sql } = await record(HSBC());
  value<Arrived>(send(k));
  const out = value<Arrived>(send(k, `Reminder: ${MAIL}`, 'a2'));

  assert.equal(out.state, 'skipped');
  assert.equal(out.reason, 'Looks like a repeat of Halden Coffee, EGP 1,316.24, 3 Apr.');
  assert.equal(k.count('transactions'), 1);
  // A skipped arrival has no receipt, which is what makes "what did this do" answerable by existence.
  assert.equal(sql.all('SELECT 1 FROM ingest_receipt').length, 1);
  sql.close();
});

test('unless the pattern says to update, in which case the row moves rather than doubling', async () => {
  const { k, sql } = await record(HSBC({ on_conflict: 'update' }));
  value<Arrived>(send(k));
  const out = value<Arrived>(send(k, MAIL.replace('1,316.24', '1,400.00'), 'a2'));

  assert.equal(out.state, 'matched');
  assert.equal(k.count('transactions'), 1);
  assert.deepEqual(k.get('transactions#1')?.fields.amount, { amount: 140_000, currency: 'EGP' });
  sql.close();
});

/* ── silence is the failure ──────────────────────────────────────────────── */

test('A PAYLOAD NOBODY WROTE A PATTERN FOR IS A ROW SOMEBODY CAN SEE', async () => {
  /* Not dropped and not guessed at. An ingest pipeline whose answer to "I do not recognise this" is
     to drop it is a pipeline whose failures are invisible — and the person who would have written
     the pattern is the one who never finds out it was needed. */
  const { k, sql } = await record(HSBC());
  const out = value<Arrived>(
    k.arrive({ channel: 'email', headers: { From: 'somebody@else.example', Subject: 'hello' }, body: 'nothing to see', sha256: 'z1' }),
  );

  assert.equal(out.state, 'untriaged');
  assert.equal(out.ingest, null);
  assert.equal(k.count('transactions'), 0);
  assert.equal(sql.one<{ body: string }>('SELECT body FROM inbox_raw')?.body, 'nothing to see', 'the bytes went away');
  sql.close();
});

test('AND A FIELD THE PATTERN COULD NOT READ IS A REVIEW, with the reason on it', async () => {
  // A failure downgrades rather than discards: the person who set the pattern up is the only one who
  // can fix it, and they cannot fix what they cannot see.
  const { k, sql } = await record(HSBC());
  const out = value<Arrived>(send(k, 'Your card ending 4471 was debited at Halden Coffee on 03/04/26.', 'b1'));

  assert.equal(out.state, 'review');
  assert.match(out.reason ?? '', /could not read amount/);
  assert.equal(k.count('transactions'), 0, 'it wrote a row with a hole in it');
  assert.equal(sql.one<{ reason: string }>('SELECT reason FROM inbox_raw')?.reason, out.reason);
  assert.equal(sql.all('SELECT 1 FROM ingest_receipt').length, 0, 'a review earned a receipt');
  sql.close();
});

test('a lookup that resolves to nothing is a review too, not a broken reference', async () => {
  const { k, sql } = await record(HSBC());
  const out = value<Arrived>(send(k, MAIL.replace('4471', '9999'), 'c1'));
  assert.equal(out.state, 'review');
  assert.match(out.reason ?? '', /^Account could not be found/);
  sql.close();
});

/* ── the transforms ──────────────────────────────────────────────────────── */

const deps = { rows: () => [] } as never;

/** `deps` with `43 §4.3`'s readers wired, the way `@braindog/record` wires them. */
const wired = (over: Record<string, unknown>) =>
  ({ rows: () => [], numbers: { money: () => [], int: () => [], decimal: () => [], ...over } }) as never;

/** `deps` with `43 §4.3`'s literal rule wired, and the register rows a `lookup` searches. */
const literate = (
  literals: (text: string, entries: readonly (readonly [string, unknown])[]) => unknown[] | 'ambiguous',
  rows: { id: string; value: string }[] = [],
) => ({ rows: () => rows, literals }) as never;

test("MONEY IS READ BY THE RECORD'S SCANNER, and a declared currency is handed to it as a fallback", () => {
  /* `43 §63`, verbatim: *`declared` is the fallback currency, never an override.* This file read
     it as an override and could not read a currency out of a payload at all, so
     `{ money: { currency: 'EGP' } }` over `You paid USD 99.95` wrote EGP 99.95 — wrong money in a
     register from a declaration that reads correctly — and `{ money: {} }` read nothing on every
     arrival, for ever. Neither is fixable here: telling `EGP 500` from `VAT 500` needs the list of
     currency codes, and this package has not got one. `@braindog/extract`'s `scanMoney` has, and
     is rank 9 to this package's 7, so it is handed down by the record rather than imported. */
  const seen: [string, string | undefined][] = [];
  const scanner = (text: string, declared?: string) => {
    seen.push([text, declared]);
    return text.includes('USD') ? [{ amount: 9995, currency: 'USD' }] : [];
  };

  assert.deepEqual(extractOutcome(wired({ money: scanner }), { money: { currency: 'EGP' } }, 'You paid USD 99.95'), {
    value: { amount: 9995, currency: 'USD' },
    outcome: 'exact',
  });
  /* THE DECLARED CURRENCY REACHES THE SCANNER AS ITS FALLBACK ARGUMENT AND NOT AS A RELABELLING. */
  assert.deepEqual(seen.at(-1), ['You paid USD 99.95', 'EGP']);

  /* AND A FORM WITH NO `currency:` IS A FORM THAT ASKS THE TEXT, which is what `43 §9.1`'s
     `{ money: {} }` row is: the first amount that has a code beside it, not nothing. */
  extractOutcome(wired({ money: scanner }), { money: {} }, 'You paid USD 99.95');
  assert.deepEqual(seen.at(-1), ['You paid USD 99.95', undefined]);
});

test('AND EVERY AMOUNT IN A SLICE IS A CANDIDATE, which is what `nth` over money was missing', () => {
  /* `43 §5.4`'s scanners yield every match inside a slice; this runtime yielded the first number
     of one and said so in `candidatesAt`'s own paragraph. So `nth: { n: 2, of: { money: {} } }`
     over a message carrying two amounts could not reach the second however it was anchored. A
     scanner that returns a list closes it without a second walker. */
  const two = (text: string) =>
    text.includes('and')
      ? [{ amount: 1000, currency: 'EGP' }, { amount: 2000, currency: 'EGP' }]
      : [{ amount: 1000, currency: 'EGP' }];
  const withScan = wired({ money: two });

  assert.deepEqual(extractOutcome(withScan, { nth: { n: 2, of: { money: {} } } }, 'EGP 10 and EGP 20'), {
    value: { amount: 2000, currency: 'EGP' },
    outcome: 'exact',
  });
  assert.deepEqual(extractOutcome(withScan, { nth: { n: 3, of: { money: {} } } }, 'EGP 10 and EGP 20'), {
    value: null,
    outcome: 'missing',
  });
  /* AND A NESTED ARM MEANS THE SAME THING AS A BARE ONE. `first:` and `default:` run the single-
     value path rather than the candidate path, so a form whose meaning depended on what it was
     nested inside would be the worst kind of wrong: right in every test written one way. */
  assert.deepEqual(extractOutcome(withScan, { first: [{ money: {} }] }, 'EGP 10 and EGP 20'), {
    value: { amount: 1000, currency: 'EGP' },
    outcome: 'exact',
  });
});

test("AN INTEGER TAKES NO FRACTION AND A DECIMAL OWNS ITS POINT, which is `43 §4.3`'s two rows", () => {
  /* *each integer in the slice; grouping allowed, **no fraction*** and *each decimal in the slice;
     the other separator groups*, verbatim. This file read both with one `number()` that takes the
     first number of a slice and drops what it cannot use, so `1,250.00` came back as the integer
     1250 — it is not an integer, it is a decimal, and the form that asked for an integer should
     read nothing — and `1.234,56` under the default `sep` came back as 123456, a hundredfold on
     the field most likely to hold a price. Both are now the record's readers, wired here as stubs
     so this file asserts the delegation and `packages/record/test/numbers.test.ts` asserts what a
     real record reads. */
  const seen: unknown[] = [];
  const ints = (text: string) => {
    seen.push(['int', text]);
    return text.includes('1,250.00') ? [] : [1250];
  };
  const decs = (text: string, sep?: string) => {
    seen.push(['decimal', text, sep]);
    return sep === ',' ? [1234.56] : [];
  };
  const with3 = wired({ int: ints, decimal: decs });

  assert.deepEqual(extractOutcome(with3, { int: {} }, 'EGP 1,250.00 debited'), { value: null, outcome: 'missing' });
  assert.deepEqual(extractOutcome(with3, { int: {} }, 'Qty 1,250 units'), { value: 1250, outcome: 'exact' });

  /* AND `sep` REACHES THE READER AS THE POINT IT IS, default included. A `decimal` with no `sep`
     is a `decimal` with `sep: '.'`, which `§4.3` writes out, and a text whose separators
     contradict it is one this declaration cannot read rather than one to read anyway. */
  assert.deepEqual(extractOutcome(with3, { decimal: {} }, 'Amount 1.234,56 EUR'), { value: null, outcome: 'missing' });
  assert.deepEqual(seen.at(-1), ['decimal', 'Amount 1.234,56 EUR', '.']);
  assert.deepEqual(extractOutcome(with3, { decimal: { sep: ',' } }, 'Amount 1.234,56 EUR'), {
    value: 1234.56,
    outcome: 'exact',
  });
  assert.deepEqual(seen.at(-1), ['decimal', 'Amount 1.234,56 EUR', ',']);

  /* AND EVERY MATCH IN THE SLICE IS A CANDIDATE, as it now is for money — `43 §5.4`. The same
     ceiling was in force for these two and for the same reason: one `number()` per slice. */
  const many = wired({ int: () => [7, 8, 9] });
  assert.deepEqual(extractOutcome(many, { nth: { n: 3, of: { int: {} } } }, 'x'), { value: 9, outcome: 'exact' });
  assert.deepEqual(extractOutcome(many, { nth: { n: 4, of: { int: {} } } }, 'x'), { value: null, outcome: 'missing' });
  /* AND A NESTED ARM MEANS THE SAME AS A BARE ONE, for these as for money. */
  assert.deepEqual(extractOutcome(many, { first: [{ int: {} }] }, 'x'), { value: 7, outcome: 'exact' });
});

test('AND A RECORD WITH NO READERS WIRED READS ALL THREE THE WAY IT ALWAYS DID', () => {
  /* THE FALLBACK IS KEPT WHOLE AND NOT HALF-FIXED. Half of the old reading is the half that needs
     the code list, so a record opened without a scanner keeps all of it — a declared currency, the
     first number of the slice, no sign from parentheses — rather than a third behaviour nobody
     has a test for. */
  assert.deepEqual(extractOutcome(deps, { money: { currency: 'EGP' } }, 'You paid USD 99.95'), {
    value: { amount: 9995, currency: 'EGP' },
    outcome: 'exact',
  });
  assert.deepEqual(extractOutcome(deps, { money: {} }, 'You paid USD 99.95'), { value: null, outcome: 'missing' });

  /* INCLUDING THE TWO THAT COULD HAVE BEEN FIXED HERE. Nothing about `no fraction` needs a
     currency table, so half-fixing was available and was not taken: a record reading its integers
     by one grammar and its amounts by another is a third behaviour nobody has a test for, and the
     line that wires all three is one line. These are the old answers, and they are the wrong ones. */
  assert.deepEqual(extractOutcome(deps, { int: {} }, 'EGP 1,250.00 debited'), { value: 1250, outcome: 'exact' });
  assert.deepEqual(extractOutcome(deps, { decimal: {} }, 'Amount 1.234,56 EUR'), {
    value: 123_456,
    outcome: 'exact',
  });
});

test("`enum` AND `lookup` ARE READ BY THE RECORD'S LITERAL RULE, and both can now say ambiguous", () => {
  /* `43 §4.3` gives the two forms one rule: *the longest literal present as a whole token*, and
     *two of equal length with different values → **ambiguous***. This file had neither half. It
     matched substrings, so `coin` read as the literal `in`, and it had no ambiguity at all, so two
     literals both present were settled by the order `Object.keys` gave them. Neither is fixable
     by sorting harder; the rule is one function in `@braindog/extract`, which is rank 9 to this
     package's 7, so it is handed down the way the number readers are. */
  const seen: unknown[] = [];
  const rule = (text: string, entries: readonly (readonly [string, unknown])[]) => {
    seen.push([text, entries]);
    if (text.includes('two')) return 'ambiguous' as const;
    return text.includes('yes') ? ['found'] : [];
  };

  assert.deepEqual(extractOutcome(literate(rule), { enum: { map: { yes: 'found' } } }, 'the yes one'), {
    value: 'found',
    outcome: 'exact',
  });
  /* THE MAP REACHES THE RULE AS ITS TABLE, entries and all, rather than being walked here. */
  assert.deepEqual(seen.at(-1), ['the yes one', [['yes', 'found']]]);

  /* AND AMBIGUITY IS AN OUTCOME AND NOT A MISS, which is the word this runtime could not say.
     `43 §5.1` step 7 files it at `needs-review`, and it carries no value because there is no
     honest one to carry. */
  assert.deepEqual(extractOutcome(literate(rule), { enum: { map: { yes: 'found' } } }, 'the two of them'), {
    value: null,
    outcome: 'ambiguous',
  });

  /* A `lookup`'s TABLE IS THE REGISTER'S ROWS, one SELECT — `43 §2` in those words. The old seam
     took one value and answered yes or no, which cannot express *longest wins* or *two matched*. */
  const rows = [{ id: 'e1', value: '1234' }, { id: 'e2', value: '4471' }];
  extractOutcome(literate(rule, rows), { lookup: { register: 'accounts', by: 'last4' } }, 'the yes one');
  assert.deepEqual(seen.at(-1), ['the yes one', [['1234', 'e1'], ['4471', 'e2']]]);

  /* AND AMBIGUITY DOES NOT FALL THROUGH A COMBINATOR. The text held two readings and the next arm
     cannot unsay that; `43 §4.3`'s `default` row says the same in its own words — *an ambiguous
     `of` stays ambiguous* — and a default that covered it would write the declaration's value
     over a text that contradicted it. */
  const both = { enum: { map: { yes: 'found' } } };
  assert.deepEqual(extractOutcome(literate(rule), { first: [both, { after: 'the ' }] }, 'the two of them'), {
    value: null,
    outcome: 'ambiguous',
  });
  assert.deepEqual(extractOutcome(literate(rule), { nth: { n: 1, of: both } }, 'the two of them'), {
    value: null,
    outcome: 'ambiguous',
  });
  assert.deepEqual(extractOutcome(literate(rule), { default: { value: 'x', of: both } }, 'the two of them'), {
    value: null,
    outcome: 'ambiguous',
  });
  /* AND ABSENCE IS STILL COVERED, which is what a `default` is for. */
  assert.deepEqual(extractOutcome(literate(rule), { default: { value: 'x', of: both } }, 'nothing here'), {
    value: 'x',
    outcome: 'defaulted',
  });
});

test('AND A RECORD WITH NO LITERAL RULE WIRED READS BOTH THE WAY IT ALWAYS DID', () => {
  /* THE FALLBACK IS KEPT WHOLE, as it is for the three number forms: substring matching, no
     ambiguity, and a `lookup` that reads the first token of its slice. These are the old answers
     and they are the wrong ones. */
  const plain = { rows: () => [{ id: 'e1', value: '1234' }] } as never;
  assert.deepEqual(extractOutcome(plain, { enum: { map: { in: 'credit' } } }, 'coin'), {
    value: 'credit',
    outcome: 'exact',
  });
  assert.deepEqual(extractOutcome(plain, { lookup: { register: 'accounts', by: 'last4' } }, '1234 debited'), {
    value: 'e1',
    outcome: 'exact',
  });
  assert.deepEqual(extractOutcome(plain, { lookup: { register: 'accounts', by: 'last4' } }, 'Card 1234 debited'), {
    value: null,
    outcome: 'missing',
  });
});

test("A DATE IS READ BY THE RECORD'S READER, and every date in the slice is a candidate", () => {
  /* `43 §4.3`'s tokens are `YYYY YY MM M DD D` and this file read four named formats, which is a
     second date grammar beside `@braindog/extract`'s. It was never silent about it — `declare.ts`
     refused what it could not read and said *the repair is a deploy, not an edit* — so what this
     closes is a gap rather than a defect, and what it deletes is the list rather than the
     honesty. */
  const seen: [string, string][] = [];
  const reader = (text: string, format: string) => {
    seen.push([text, format]);
    return format === 'D/M/YY' ? ['2026-01-01', '2026-02-02'] : [];
  };
  const withDates = { rows: () => [], dates: reader } as never;

  /* THE FORMAT REACHES THE READER AS DECLARED, never guessed at and never rewritten. */
  assert.deepEqual(extractOutcome(withDates, { date: { format: 'D/M/YY' } }, '1/1/26 and 2/2/26'), {
    value: '2026-01-01',
    outcome: 'exact',
  });
  assert.deepEqual(seen.at(-1), ['1/1/26 and 2/2/26', 'D/M/YY']);

  /* AND `nth` REACHES THE SECOND DATE — `43 §9.3`'s own row. The fallback answers one day per
     slice, so the second date of a one-slice message was unreachable however it was anchored. */
  assert.deepEqual(extractOutcome(withDates, { nth: { n: 2, of: { date: { format: 'D/M/YY' } } } }, '1/1/26 and 2/2/26'), {
    value: '2026-02-02',
    outcome: 'exact',
  });

  /* AND A RECORD WITH NO READER WIRED KEEPS `day`, four formats and one date per slice. */
  assert.equal(extractField(deps, { date: { format: 'D/M/YY' } }, '1/1/26'), null, 'a format the fallback lacks');
  assert.equal(extractField(deps, { date: { format: 'DD/MM/YY' } }, 'paid 01/01/26'), '2026-01-01');
});

test('A DATE IS PARSED IN THE FORMAT THE PATTERN DECLARES, never guessed', () => {
  /* `03/04/26` is the third of April in Britain and the fourth of March in America. An extractor
     that decided by looking at the number would be right most of the time and wrong about every
     date before the thirteenth. */
  assert.equal(ingestDay('03/04/26', 'DD/MM/YY'), '2026-04-03');
  assert.equal(ingestDay('03/04/2026', 'MM/DD/YYYY'), '2026-03-04');
  assert.equal(ingestDay('2026-04-03', 'YYYY-MM-DD'), '2026-04-03');
  assert.equal(ingestDay('03/04/26', 'DD-MM-YY'), null, 'a format the vocabulary does not have');

  // The shape is not the check, here as everywhere: a row dated 31 February sorts for ever.
  assert.equal(ingestDay('31/02/26', 'DD/MM/YY'), null);
  assert.equal(ingestDay('nothing', 'DD/MM/YY'), null);
});

test('and money is a number the payload carries with a currency the PATTERN declares', () => {
  // Reading a currency out of a payload means guessing from a symbol, and `$` is at least five.
  assert.deepEqual(extractField(deps, { money: { after: 'EGP', currency: 'EGP' } }, 'paid EGP 1,316.24 today'), {
    amount: 131_624,
    currency: 'EGP',
  });
  assert.equal(extractField(deps, { money: { after: 'EGP' } } as never, 'paid EGP 12.00'), null, 'money with no currency');
  assert.equal(extractField(deps, { money: { after: 'USD', currency: 'USD' } }, 'no dollars here'), null);
});

test('an enum takes its LONGEST literal first, so `unpaid` does not read as `paid`', () => {
  const form = { enum: { map: { paid: 'settled', unpaid: 'open' } } } as const;
  assert.equal(extractField(deps, form, 'this invoice is unpaid'), 'open');
  assert.equal(extractField(deps, form, 'this invoice is paid'), 'settled');
  assert.equal(extractField(deps, form, 'this invoice is pending'), null);
});

test('an anchor that is not in the text is nothing, never the whole text', () => {
  // The failure this prevents: a `between` that missed and extracted the entire email as a merchant.
  assert.equal(extractField(deps, { between: ['at ', ' on'] }, 'no anchors here'), null);
  assert.equal(extractField(deps, { after: 'ref: ' }, 'no anchors here'), null);
  assert.equal(extractField(deps, { after: 'ref: ' }, 'ref: ABC-1'), 'ABC-1');
  assert.equal(extractField(deps, { between: ['at ', ' on'] }, 'paid at Halden on Tuesday'), 'Halden');
});

test('and `null` is "not there", never zero and never the empty string', () => {
  // A pattern producing a zero for a missing amount writes a row saying somebody owes nothing, which
  // is a different and worse claim than not writing one.
  assert.equal(extractField(deps, { int: {} }, 'no numbers'), null);
  assert.equal(extractField(deps, { text: {} }, '   '), null);
  assert.equal(extractField(deps, { int: {} }, 'there are 41 of them'), 41);
  assert.equal(extractField(deps, { int: {} }, 'there are 4.1 of them'), null, 'an int is a whole number');
});

test('THE THREE COMBINATORS ARE IMPLEMENTED, and until they were an ingest installed and read nothing', () => {
  /* `declare.ts` has always checked a form's key against all thirteen of `07 §3`, and the runtime
     held ten. So a declaration saying `first:` passed the linter, installed, matched arrivals, and
     then reported the field as one the pattern could not read — naming the field rather than the
     form nobody had written. */

  // `first` — the reason no regular expression is needed when one bank words it differently.
  const either = {
    first: [{ money: { after: 'EGP ', currency: 'EGP' } }, { money: { after: 'E£', currency: 'EGP' } }],
  } as const;
  assert.deepEqual(extractField(deps, either, 'debited E£ 40.00 today'), { amount: 4000, currency: 'EGP' });
  assert.deepEqual(extractField(deps, either, 'debited EGP 12.50 today'), { amount: 1250, currency: 'EGP' });
  assert.equal(extractField(deps, either, 'debited USD 12.50 today'), null, 'no arm yielded');

  // `nth` — the second occurrence of the anchor, which is what a statement line looks like.
  const second = { nth: { n: 2, of: { money: { after: 'EGP ', currency: 'EGP' } } } } as const;
  assert.deepEqual(extractField(deps, second, 'fee EGP 5.00 and total EGP 45.00'), {
    amount: 4500,
    currency: 'EGP',
  });
  assert.equal(extractField(deps, second, 'fee EGP 5.00 only'), null, 'fewer candidates than n');
  assert.equal(extractField(deps, { nth: { n: 0, of: { int: {} } } } as never, 'x 4'), null, 'n is 1-based');

  // `default` — the only way to make a declared field optional.
  const optional = { default: { value: 0, of: { int: { after: 'tip ' } } } } as const;
  assert.equal(extractField(deps, optional, 'tip 7 pounds'), 7);
  assert.equal(extractField(deps, optional, 'no tip at all'), 0, 'the value, not null');
});

test('and each combinator says HOW it read, because 43 §5.1 files a choice at `proposed`', () => {
  /* A defaulted field was not sent by anybody and a chosen one was read two ways. Both are rows a
     person should see before they are rows, and the confidence level that says so — `proposed` —
     was previously reachable only by declaring it as a ceiling. */
  const one = { first: [{ int: { after: 'a ' } }, { int: { after: 'b ' } }] } as const;
  assert.deepEqual(extractOutcome(deps, one, 'a 1 only'), { value: 1, outcome: 'exact' }, 'one arm yielded');
  assert.deepEqual(extractOutcome(deps, one, 'a 1 and b 2'), { value: 1, outcome: 'chosen' }, 'two did');

  assert.deepEqual(extractOutcome(deps, { default: { value: 0, of: { int: { after: 'tip ' } } } }, 'no tip'), {
    value: 0,
    outcome: 'defaulted',
  });
  assert.deepEqual(extractOutcome(deps, { default: { value: 0, of: { int: { after: 'tip ' } } } }, 'tip 7'), {
    value: 7,
    outcome: 'exact',
  }, "`of` answered, so it keeps `of`'s outcome");

  assert.deepEqual(extractOutcome(deps, { int: { after: 'q ' } }, 'nothing'), { value: null, outcome: 'missing' });
});

test('a form nested past three deep yields nothing, and never a walk that does not end', () => {
  /* `declare` refuses it at install, and a `.brain` import or a pack reaches `arrive` without passing
     the linter. A payload produces an outcome, never a throw. */
  const deep = { first: [{ first: [{ first: [{ first: [{ int: {} }] }] }] }] } as never;
  assert.equal(extractField(deps, deep, 'there are 41'), null);

  const cyclic = { first: [] } as { first: unknown[] };
  cyclic.first.push(cyclic);
  assert.equal(extractField(deps, cyclic as never, 'there are 41'), null);
});

test('AN ANCHOR YIELDS EVERY OCCURRENCE, and candidate 1 is what it always read', () => {
  /* The candidates come from the anchor: `43 §5.3`'s other half — every match inside one slice — is
     this runtime's stated ceiling, so `{ money: {} }` over two amounts is still one candidate. */
  assert.equal(extractField(deps, { after: 'ref: ' }, 'ref: A and ref: B'), 'A and ref: B', 'candidate 1');
  assert.equal(extractField(deps, { nth: { n: 2, of: { after: 'ref: ' } } } as never, 'ref: A and ref: B'), 'B');

  const pair = { between: ['at ', ' on'] } as const;
  assert.equal(extractField(deps, pair, 'at Halden on Mon and at Oslo on Fri'), 'Halden');
  assert.equal(extractField(deps, { nth: { n: 2, of: pair } } as never, 'at Halden on Mon and at Oslo on Fri'), 'Oslo');

  /* AN `A` WITH NO `B` IS NOT A CANDIDATE AND DOES NOT END THE WALK — `43 §4.3`. Only the tail can
     be that occurrence: every slice is a suffix of the one before it, so a `B` missing from the
     first slice is missing from all of them. Which is why this rule cannot move candidate 1, and
     why the walk having to survive it matters only from candidate 2 on. */
  assert.equal(extractField(deps, pair, 'at Halden on Mon, then at Oslo'), 'Halden');
  assert.equal(extractField(deps, { nth: { n: 2, of: pair } } as never, 'at Halden on Mon, then at Oslo'), null);
});

/* ── the boundaries ──────────────────────────────────────────────────────── */

test('a channel that is not a channel, and an arrival with no hash, are refused', async () => {
  const { k, sql } = await record(HSBC());
  const bad = k.arrive({ channel: 'carrier-pigeon' as never, body: 'x', sha256: 'q' });
  assert.equal(bad.ok, false);
  const none = k.arrive({ channel: 'email', body: 'x', sha256: '' });
  assert.equal(none.ok, false);
  assert.equal(sql.all('SELECT 1 FROM inbox_raw').length, 0);
  sql.close();
});

test('THE FIRST MATCHING PATTERN WINS, and the second is not merged into it', async () => {
  // Merging two extractions produces a row neither declaration describes.
  const { k, sql } = await record(
    HSBC(),
    {
      id: 'ingest.catch-all',
      kind: 'ingest',
      body: {
        ingest: 'catch-all',
        channel: 'email',
        extract: { merchant: { text: {} } },
        writes: { register: 'transactions' },
      } as never,
    },
  );
  const out = value<Arrived>(send(k));
  assert.equal(out.ingest, 'hsbc-sms');
  assert.equal(k.get('transactions#1')?.fields.merchant, 'Halden Coffee', 'the catch-all took the whole email');
  sql.close();
});

test('AND AN OPERATOR THIS BACKEND CANNOT SERVE IS REFUSED AT INSTALL, not left to fire on nothing', async () => {
  /* The field axis was checked and the operator axis was not, so `matches`, `has` and `lacks`
     installed and never fired, and `starts` and `ends` installed and DID fire where `34 §1.9`
     refuses them: wider than published in one direction and silent in the other. An ingest that
     never fires and an ingest that fires correctly look identical from the outside. */
  const { k, sql } = await record();
  for (const op of ['matches', 'has', 'lacks', 'starts', 'ends', 'near', 'via']) {
    const out = await k.install([
      {
        id: 'ingest.probe',
        kind: 'ingest' as const,
        body: {
          ingest: 'probe',
          channel: 'email',
          match: { field: 'subject', [op]: 'x' },
          extract: { merchant: { text: {} } },
          writes: { register: 'transactions' },
        } as never,
      },
    ]);
    assert.equal(out.ok, false, `${op} installed and would fire on nothing`);
    assert.equal((out as { refusal: { code: string } }).refusal.code, 'MATCH_OP_UNSUPPORTED', op);
  }


  /* AND THE OPERATORS IT DOES SERVE STILL INSTALL, so the check is about the published set rather
     than about being strict. */
  const fine = await k.install([
    {
      id: 'ingest.probe',
      kind: 'ingest' as const,
      body: {
        ingest: 'probe',
        channel: 'email',
        match: { field: 'subject', contains: 'x' },
        extract: { merchant: { text: {} } },
        writes: { register: 'transactions' },
      } as never,
    },
  ]);
  assert.equal(fine.ok, true, (fine as { refusal?: { fix: string } }).refusal?.fix ?? '');
  sql.close();
});

test('A `match:` ON `ts` OR `state` FIRES, and it used to install cleanly and never match', async () => {
  /* `34 §1.9` publishes seven field names and `declare.ts` enforces exactly those seven, reciting
     them in its refusal. The matcher's `ARRIVAL` schema declared five, and `evaluate` answers
     `false` to whatever `compile` would refuse, so a pattern naming `ts` or `state` was not an
     error: it was a pattern that never matched, for ever. `ingestBody`'s own header is the finding,
     in its own words: an ingest that never fires and an ingest that fires correctly look identical
     from the outside until somebody notices a month of arrivals sitting untriaged. The fix that
     sentence stands over landed on the UNKNOWN names and never on these two published ones.

     Scoping an email rule with `match: { field: ts, after: … }` is an ordinary thing to write, and
     the cost of it landing here rather than at install is days of somebody's inbox. */
  const scoped = (match: unknown, id: string): Declaration => ({
    id: `ingest.${id}`,
    kind: 'ingest',
    body: { ingest: id, channel: 'email', match, extract: { merchant: { text: { between: ['at ', ' on'] } } }, writes: { register: 'transactions' } } as never,
  });

  const fires = async (match: unknown, id: string): Promise<boolean> => {
    const { k, sql } = await record(scoped(match, id));
    const out = value<Arrived>(send(k, MAIL, `sha-${id}`));
    sql.close();
    return out.ingest === id;
  };

  // The two that installed and never fired.
  assert.equal(await fires({ field: 'ts', after: '2020-01-01' }, 'by-ts'), true, 'a match on ts never fired');
  assert.equal(await fires({ field: 'state', is: 'untriaged' }, 'by-state'), true, 'a match on state never fired');

  /* AND THEY ANSWER, WHICH IS NOT THE SAME AS FIRING. A field carried as a constant would make every
     pattern over it true, which is the same defect wearing the other face. */
  assert.equal(await fires({ field: 'ts', before: '2020-01-01' }, 'ts-past'), false);
  assert.equal(
    await fires({ field: 'state', is: 'matched' }, 'state-matched'),
    false,
    'an arrival is untriaged when the match runs; matching is step 2 and every other state is decided after it',
  );

  // The five that always worked, so this did not narrow anything.
  assert.equal(await fires({ all: [{ field: 'from', is: 'alerts@hsbc.example' }, { field: 'ts', after: '2020-01-01' }] }, 'both'), true);
  assert.equal(await fires({ field: 'channel', is: 'email' }, 'by-channel'), true);
  // And a name outside the seven is still refused at install, with the seven in the sentence.
  const other = openSqlite();
  const bad = await openRecord(other, fixedClock(NOW));
  const said = await bad.install([ACCOUNTS, TRANSACTIONS, scoped({ field: 'cc', is: 'x' }, 'by-cc')]);
  assert.equal(said.ok, false, 'a field outside the ten installed');
  const why = (said as { refusal: { code: string; fix: string } }).refusal;
  assert.equal(why.code, 'MATCH_FIELD_UNKNOWN');
  assert.match(why.fix, /from, from_name, from_address, from_domain, to, subject, body, channel, state, ts/);
  other.close();
});

test('A REGISTER REFUSING WHAT A PATTERN READ DOWNGRADES IT, and never discards the bytes', async () => {
  /* The header of the module says the raw is stored first and always, twice. Returning the refusal
     rolled the raw back with it — the payload gone, and nobody able to fix the pattern from a row
     that does not exist. */
  const { k, sql } = await record(
    HSBC({
      extract: { amount: { money: { after: 'EGP', currency: 'EGP' } } },
      writes: { register: 'transactions' },
    }),
  );
  const out = value<Arrived>(send(k));
  assert.equal(out.state, 'review');
  assert.equal(out.confidence, 'needs-review');
  assert.equal(out.wrote.length, 0);
  assert.match(out.reason ?? '', /merchant/, 'the reason does not say which field the register refused');

  assert.equal(k.count('transactions'), 0, 'a row with no required field was written');
  const raw = sql.one<{ state: string; reason: string }>('SELECT state, reason FROM inbox_raw')!;
  assert.equal(raw.state, 'review');

  // And what it read is in front of somebody, which is the only thing that makes it fixable.
  const sg = sql.one<{ id: string; body: string; opened_by: string }>("SELECT id, body, opened_by FROM suggestion")!;
  assert.equal(sg.id, out.suggestion);
  assert.equal(sg.opened_by, 'ingest:hsbc-sms');
  assert.deepEqual(JSON.parse(sg.body), {
    cause: sql.one<{ cause: string }>('SELECT cause FROM suggestion WHERE id = ?', sg.id)!.cause,
    register: 'transactions',
    rows: [{ amount: { amount: 131_624, currency: 'EGP' } }],
    count: 1,
    ingest: 'hsbc-sms',
    /* NO PAYEE WAS READ, so the row is keyed on the way its money moved alone. */
    joins_on: '["","amount:+"]',
    context: 'The part it would not take is its merchant.',
  });
  /* AND IT IS ASKED IN A PERSON'S WORDS: the list by its name, the field by its label, and neither id. */
  assert.equal(k.question(sg.id), 'Transactions would not take this email as read. Fix it and add it?');

  // And the observation the write left behind survives, or the record cannot tell a bad
  // declaration from a bad afternoon.
  assert.equal(
    sql.one<{ subject: string }>("SELECT subject FROM observation WHERE kind = 'write.refused'")?.subject,
    'transactions.merchant:REQUIRED_MISSING',
  );
  sql.close();
});

/* ── the ceiling ────────────────────────────────────────────────── */

test('A PATTERN NOBODY HAS APPROVED WRITES NOTHING, however cleanly it read', async () => {
  /* Every pattern a model proposes files at `needs-review`, and one of those writing rows into
     somebody's ledger is the single failure this whole design exists to prevent. */
  const { k, sql } = await record(HSBC({ writes: { register: 'transactions', confidence: 'needs-review' } }));
  const out = value<Arrived>(send(k));

  assert.equal(out.state, 'review');
  assert.equal(out.confidence, 'needs-review');
  assert.deepEqual(out.wrote, []);
  assert.equal(k.count('transactions'), 0, 'an unapproved pattern wrote a row');
  assert.equal(sql.all('SELECT 1 FROM ingest_receipt').length, 0, 'nothing was written, so nothing has a receipt');

  // The extraction is not thrown away: it is the thing somebody accepts or corrects.
  const body = JSON.parse(sql.one<{ body: string }>('SELECT body FROM suggestion')!.body) as {
    register: string;
    rows: Record<string, unknown>[];
    ingest: string;
  };
  assert.equal(body.register, 'transactions');
  assert.equal(body.rows[0]?.merchant, 'Halden Coffee');
  assert.equal(body.ingest, 'hsbc-sms');
  sql.close();
});

test('and `proposed` parks the arrival in its own state, so the two are told apart', async () => {
  const { k, sql } = await record(HSBC({ writes: { register: 'transactions', confidence: 'proposed' } }));
  const out = value<Arrived>(send(k));

  assert.equal(out.state, 'proposed');
  assert.equal(out.confidence, 'proposed');
  assert.equal(sql.one<{ state: string }>('SELECT state FROM inbox_raw')?.state, 'proposed');
  assert.match(out.reason ?? '', /proposed rather than written/);
  assert.equal(k.count('transactions'), 0);
  sql.close();
});

test('AND A DEFAULTED FIELD IS `proposed` UNDER AN `exact` DECLARATION, which nothing could produce before', async () => {
  /* `43 §5.1` step 7 has three levels and this record could only reach two of them: a field the
     pattern missed, or a ceiling somebody declared. A value the RECORD supplied — defaulted in
     because the payload did not carry one, or chosen between two forms — is neither, and writing it
     at `exact` says a bank sent a number the record invented. */
  const { k, sql } = await record(
    HSBC({
      extract: {
        merchant: { text: { between: ['at ', ' on'] } },
        amount: { money: { after: 'EGP', currency: 'EGP' } },
        date: { date: { format: 'DD/MM/YY', after: ' on ' } },
        ref: { default: { value: 'none', of: { text: { after: 'ref: ' } } } },
      },
    }),
  );
  const out = value<Arrived>(send(k));

  assert.equal(out.confidence, 'proposed', 'a defaulted field under an exact declaration');
  assert.equal(out.state, 'proposed');
  assert.match(out.reason ?? '', /chose or defaulted ref/);
  assert.equal(k.count('transactions'), 0, 'proposed writes nothing until somebody accepts it');

  /* AND THE REASON NAMES FIELD IDS AND NOTHING OUT OF THE PAYLOAD — `43 §6`'s leak rule. */
  assert.doesNotMatch(out.reason ?? '', /Halden|4471|1,316/);
  sql.close();
});

test('and a payload that carries the field reads at `exact`, so a fallback costs nothing', async () => {
  const { k, sql } = await record(
    HSBC({
      extract: {
        merchant: { text: { between: ['at ', ' on'] } },
        amount: { money: { after: 'EGP', currency: 'EGP' } },
        date: { date: { format: 'DD/MM/YY', after: ' on ' } },
        ref: { default: { value: 'none', of: { text: { between: ['ref: ', '.'] } } } },
      },
    }),
  );
  const out = value<Arrived>(send(k, `${MAIL} ref: A-91.`));
  assert.equal(out.confidence, 'exact');
  assert.equal(k.count('transactions'), 1);
  type Page = { rows: { fields: Record<string, unknown> }[] };
  const wrote = value<Page>(k.list({ register: 'transactions', limit: 10 }));
  assert.equal(wrote.rows[0]?.fields.ref, 'A-91', 'the payload won, not the fallback');
  sql.close();
});

test('THE CEILING ONLY EVER BRINGS IT DOWN: an unreadable field beats an `exact` declaration', async () => {
  // Confidence is derived and the ceiling caps it. A pattern cannot promise its way past a miss.
  const { k, sql } = await record(HSBC());
  const out = value<Arrived>(k.arrive({ channel: 'email', headers: { From: 'alerts@hsbc.example', Subject: 'Your transaction alert' }, body: 'Your card ending 4471 was debited at Halden Coffee on 03/04/26.', sha256: 'b2' }));
  assert.equal(out.state, 'review');
  assert.equal(out.confidence, 'needs-review');
  assert.match(out.reason ?? '', /could not read amount/);

  /* AND A CONFIDENCE OUTSIDE THE THREE KEEPS THE BYTES. This used to refuse before `store` had run,
     and the whole call sits in a savepoint — so a declaration carrying `confidence: probably`, which
     nothing validates at install and which a `.brain` import or a pack installs cleanly, threw the
     arrival away entirely: `inbox_raw` got no row, against 07 §2's "nothing is ever dropped". The
     sender did nothing wrong; the pattern did, and the payload is the evidence for fixing it. */
  const bad = await record(HSBC({ writes: { register: 'transactions', confidence: 'probably' } }));
  const r = value<Arrived>(
    bad.k.arrive({ channel: 'email', headers: { From: 'alerts@hsbc.example', Subject: 'Your transaction alert' }, body: MAIL, sha256: 'c3' }),
  );
  assert.equal(r.state, 'review');
  assert.match(r.reason ?? '', /not a confidence/);
  assert.equal(bad.sql.all('SELECT 1 FROM inbox_raw').length, 1, 'the bytes were thrown away');
  assert.equal(bad.k.count('transactions'), 0, 'and nothing was written from a declaration it could not read');
  sql.close();
  bad.sql.close();
});

test('and the ingest is on the ledger under its own name, twice', async () => {
  // `match` says a pattern claimed this payload; `extract` says it wrote. Neither is a person.
  const { k, sql } = await record(HSBC());
  value<Arrived>(send(k));
  assert.deepEqual(
    sql
      .all<{ kind: string; actor: string }>("SELECT kind, actor FROM event WHERE kind IN ('match','extract') ORDER BY rowid")
      .map((r) => ({ kind: r.kind, actor: r.actor })),
    [
      { kind: 'match', actor: 'ingest:hsbc-sms' },
      { kind: 'extract', actor: 'ingest:hsbc-sms' },
    ],
  );
  sql.close();
});

/* ── 3′: the shape nobody wrote a pattern for ─────────────────────────── */

test('AN UNMATCHED SHAPE EARNS ONE DRAFT AT ITS THIRD ARRIVAL, and never one per payload', async () => {
  /* A model call per arrival is a bill that scales with a stranger's sending rate. Three is the
     smallest number of examples a pattern can be written from and the smallest that is not a
     coincidence, which is why it is the same three. */
  const { k, sql } = await record();
  const cib = (n: number, from = 'CIB Alerts <alerts@cib.eg>') =>
    value<Arrived>(k.arrive({ channel: 'email', headers: { From: from, Subject: 'Debit' }, body: `payment ${n}`, sha256: `x${n}` }));

  assert.equal(cib(1).state, 'untriaged');
  assert.equal(cib(2).state, 'untriaged');
  assert.equal(sql.all('SELECT 1 FROM outbox').length, 0, 'two of anything is a coincidence');

  cib(3);
  const rows = sql.all<{ kind: string; payload: string }>('SELECT kind, payload FROM outbox');
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.kind, 'infer.draft');
  const draft = JSON.parse(rows[0]!.payload) as { shape: string; n: number; examples: string[]; window: string };
  assert.equal(draft.shape, 'email:alerts@cib.eg');
  assert.equal(draft.n, 3);
  assert.equal(draft.window, '30d');

  // Ids, oldest first, and never the bodies: a stranger's text does not go into a queue that is
  // summarised in front of a person.
  assert.equal(draft.examples.length, 3);
  assert.deepEqual(
    draft.examples,
    sql.all<{ id: string }>('SELECT id FROM inbox_raw ORDER BY rowid').map((r) => r.id),
  );
  assert.equal(JSON.stringify(draft).includes('payment'), false);

  // And the fourth asks the same question again, which is one bill for nothing.
  cib(4);
  assert.equal(sql.all('SELECT 1 FROM outbox').length, 1);
  sql.close();
});

test('and the display name is not the shape, or three examples are three shapes', async () => {
  // A bank that sends as `CIB` on Monday and `CIB Alerts` on Tuesday is one sender.
  const { k, sql } = await record();
  const names = ['CIB <alerts@cib.eg>', 'CIB Alerts <ALERTS@cib.eg>', 'alerts@cib.eg'];
  names.forEach((from, i) =>
    k.arrive({ channel: 'email', headers: { From: from, Subject: 'Debit' }, body: `p${i}`, sha256: `y${i}` }),
  );
  assert.equal(sql.all('SELECT 1 FROM outbox').length, 1, 'one sender was read as three');

  // And what it noticed about itself is the same shape, so the weekly analyser agrees with 3'.
  assert.equal(
    sql.one<{ subject: string; n: number }>("SELECT subject, n FROM observation WHERE kind = 'ingest.unmatched'")?.n,
    3,
  );
  sql.close();
});

test('and a matched payload proposes nothing, because there is nothing to propose', async () => {
  const { k, sql } = await record(HSBC());
  value<Arrived>(send(k));
  assert.equal(sql.all('SELECT 1 FROM outbox').length, 0);
  assert.equal(sql.all("SELECT 1 FROM observation WHERE kind = 'ingest.unmatched'").length, 0);
  sql.close();
});

test('the function is a function, and it reads the record it was handed', async () => {
  const { k, sql } = await record(HSBC());
  const out = arrive(
    {
      sql,
      ingests: () => [],
      schemaOf: () => null,
      write: () => ({ ok: false, refusal: { code: 'X', fix: 'x' } }),
      rows: () => [],
      mint: () => '01ABCDEFGHJKMNPQRSTVWXYZ99',
      allocate: () => 1,
      nowMs: NOW,
    },
    { channel: 'paste', body: 'anything', sha256: 'p1' },
    k.transaction,
  );
  assert.equal(value<Arrived>(out).state, 'untriaged');
  sql.close();
});

/* ── what the transforms get wrong when nobody looks ──────────────────── */

test("A DECIMAL'S `sep` IS THE DECIMAL POINT, and it was reading as the thousands separator", async () => {
  /**
   * ONE `number()` AND TWO MEANINGS OF `sep`. The helper is shared by `money` and `decimal`, and it
   * was written for `money`, where `sep` named the THOUSANDS character — the test above, before the
   * digit rule made that key unnecessary. `decimal` inherited that meaning by sharing the helper.
   *
   * `43 §4.3` gives `decimal` the other one: *`sep` default `"."` — each decimal in the slice; the
   * other separator groups*, and `§9` repeats it. `@braindog/extract` does that. So the same
   * declaration over the same text read two ways, a hundredfold apart, on the line a European
   * bank's SMS actually writes:
   *
   *     { decimal: { sep: ',' } } over "EGP 1.234,56"   kernel 123456   extract 1234.56
   *
   * Nothing in the tree declared a `sep` on a `decimal`, so no row anybody holds is wrong. What was
   * wrong is the grammar an author writes against.
   */
  const { sql } = await record();
  const deps = { rows: () => [] } as never;
  const read = (sep: string | undefined, text: string): unknown =>
    extractField(deps, { decimal: sep === undefined ? {} : { sep } } as never, text);

  assert.equal(read(',', 'EGP 1.234,56'), 1234.56, 'the comma is the point and the stop groups');
  assert.equal(read(',', 'EGP 1.250'), 1250, 'no comma, so the stop groups');
  assert.equal(read(',', 'EGP 1,250'), 1.25, 'the comma is the point wherever it falls');
  assert.equal(read(',', 'EGP 1 234 567,89'), 1234567.89, 'a space groups in either locale');

  /* AND THE DEFAULT IS `.`, WHICH IS `43 §4.3`'s. `07 §3`'s thousands rule is about `money`, where
     a currency's exponent breaks the tie; a bare decimal has no currency, so the declaration
     decides and its default decides when it is absent. */
  assert.equal(read(undefined, 'EGP 1.250'), 1.25, 'the default point is the stop');
  assert.equal(read(undefined, 'EGP 1,250'), 1250);
  assert.equal(read(undefined, 'EGP 1,234.56'), 1234.56);
  assert.equal(read('.', 'EGP 10.5555'), 10.5555, 'four decimals are four decimals');

  sql.close();
});

test('MONEY READS ITS OWN SEPARATORS, or every European amount is a thousandth of itself', async () => {
  /* `decimal` took a `sep` and `money` did not, so €1.234,56 was written as €1.23 — the worst place
     for that bug, because the row still looks plausible. The first repair gave `money` a `sep` of
     its own, meaning the THOUSANDS separator; the digit rule that landed after it (`07 §3`: with
     two or more separators the last differing one is the decimal point) answers both of these
     without one. So the key is gone and these assertions are unchanged, which is the proof: the
     declaration below no longer says how Europe writes a number, and still reads it. */
  const { k, sql } = await record();
  const deps = { rows: () => [] } as never;

  assert.deepEqual(extractField(deps, { money: { after: 'EUR', currency: 'EUR' } }, 'EUR 1.234,56'), {
    amount: 123_456,
    currency: 'EUR',
  });
  assert.deepEqual(extractField(deps, { money: { after: 'EUR', currency: 'EUR' } }, 'EUR 1.234.567,89'), {
    amount: 123_456_789,
    currency: 'EUR',
  });
  assert.deepEqual(extractField(deps, { money: { after: 'EGP', currency: 'EGP' } }, 'EGP 1,316.24'), {
    amount: 131_624,
    currency: 'EGP',
  });

  // And a number stops at the number: the next token's digits are not part of this one.
  assert.deepEqual(extractField(deps, { money: { after: 'EGP', currency: 'EGP' } }, 'EGP 250 2 items'), {
    amount: 25_000,
    currency: 'EGP',
  });
  void k;
  sql.close();
});

test('and a declared DD/MM/YY does not read the first half of a four-digit year', async () => {
  // `03/04/2026` came back as 2020-04-03 — a real day, six years early, sorting before everything.
  assert.equal(ingestDay('paid 03/04/2026', 'DD/MM/YY'), null);
  assert.equal(ingestDay('paid 03/04/2026', 'DD/MM/YYYY'), '2026-04-03');
  assert.equal(ingestDay('paid 03/04/26', 'DD/MM/YY'), '2026-04-03');
  assert.equal(ingestDay('ref 12026-04-03', 'YYYY-MM-DD'), null);
});

/* ── what a pack may put in a query ──────────────────────────────────────── */

test('A FIELD ID FROM A DECLARATION CANNOT BECOME SQL', async () => {
  /* `writes.key` is a list of field ids from a declaration, and a declaration can come from a pack —
     which 04 says is meant to be safe to install from a stranger. They were interpolated into
     `json_extract(fields, '$.<id>')` with no grammar check, so a key of
     `ref') = 1 OR 1 = 1 OR json_extract(fields, '$.x` selected the first row of the register and an
     `on_conflict: update` wrote over it. */
  /* AND IT IS REFUSED AT INSTALL, where somebody can still fix it. `declare.ts`'s grammar check
     applies to register and field ids and returns before every other kind, so an ingest's
     `writes.key` was an arbitrary string all the way to the query. */
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const out = await k.install([
    TRANSACTIONS,
    HSBC({ writes: { register: 'transactions' }, dedupe: ["ref') = 1 OR 1 = 1 OR json_extract(fields, '$.x"] }),
  ]);
  assert.equal(out.ok, false);
  assert.equal((out as { refusal: { code: string } }).refusal.code, 'DECLARATION_INVALID');
  sql.close();
});

test('A NUMERIC DEDUPE KEY MATCHES, which it never did', async () => {
  /* The key values were bound as strings and `json_extract` answers an INTEGER for an `int` field
     and an object for a `money` one — and SQLite compares storage classes, so `= '1234'` never
     matched. Every re-notice of one payment wrote a second row and the money was counted twice. */
  const { k, sql } = await record(HSBC({ writes: { register: 'transactions' }, dedupe: ['amount'] }));
  const first = value<Arrived>(
    k.arrive({ channel: 'email', headers: { From: 'alerts@hsbc.example', Subject: 'Your transaction alert' }, body: MAIL, sha256: 'm1' }),
  );
  assert.equal(first.state, 'matched');

  const again = value<Arrived>(
    k.arrive({ channel: 'email', headers: { From: 'alerts@hsbc.example', Subject: 'Your transaction alert (resent)' }, body: MAIL, sha256: 'm2' }),
  );
  assert.equal(again.state, 'skipped', 'the same amount arrived twice and was written twice');
  assert.equal(k.count('transactions'), 1);
  sql.close();
});

test('A DOT-GROUPED AMOUNT IS NOT A THOUSAND TIMES TOO SMALL', () => {
  /* `sep` was the whole of the thousands rule and it defaulted to a comma, so `EGP 1.250` read as
     125 minor units — EGP 1.25 for EGP 1,250.00, on a row that still looks plausible. And `int` had
     no way to pass one at all, so `Quantity: 2.000` read as 2 while `1.500` read as null: the same
     declaration refusing one payload and silently mis-reading the next.

     07 §3's rule reads it off the digits: a lone separator followed by exactly three digits is
     grouping, and with two or more the last one that differs is the decimal point. */
  const money = (text: string, sep?: string) =>
    extractField({} as never, { money: { currency: 'EGP', ...(sep === undefined ? {} : { sep }) } } as never, text);

  assert.deepEqual(money('EGP 1.250'), { amount: 125_000, currency: 'EGP' });
  assert.deepEqual(money('EGP 1,250'), { amount: 125_000, currency: 'EGP' });
  assert.deepEqual(money('EGP 1250'), { amount: 125_000, currency: 'EGP' });
  assert.deepEqual(money('EGP 1.250,00'), { amount: 125_000, currency: 'EGP' });
  assert.deepEqual(money('EGP 1,250.00'), { amount: 125_000, currency: 'EGP' });
  assert.deepEqual(money('EGP 12,50'), { amount: 1250, currency: 'EGP' }, 'two digits after a lone mark is a decimal');
  // A declared separator still wins, because a caller who knows the locale knows better.
  assert.deepEqual(money('EGP 1.250', '.'), { amount: 125_000, currency: 'EGP' });
});

test('and an amount that would need rounding is refused', () => {
  /* 07 §3. `USD 10.5555` is not 1056 minor units; it is a payload whose pattern does not fit, and
     writing the rounded figure puts a number nobody sent into a ledger.

     `10.555` IS NOT THAT CASE, and the difference is the thousands rule doing its job: a lone
     separator followed by exactly THREE digits is grouping, so that is ten thousand five hundred and
     fifty-five. Four digits after a lone mark is a decimal, and 1055.55 minor units is not a number
     of minor units. */
  assert.deepEqual(extractField({} as never, { money: { currency: 'USD' } } as never, 'USD 10.555'), {
    amount: 1_055_500,
    currency: 'USD',
  });
  assert.equal(extractField({} as never, { money: { currency: 'USD' } } as never, 'USD 10.5555'), null);
  assert.deepEqual(extractField({} as never, { money: { currency: 'USD' } } as never, 'USD 10.55'), {
    amount: 1055,
    currency: 'USD',
  });
});

test('AND AN INTEGER READS ITS OWN GROUPING', () => {
  assert.equal(extractField({} as never, { int: {} } as never, 'Quantity: 2.000 units'), 2000);
  assert.equal(extractField({} as never, { int: {} } as never, 'Quantity: 1.500 units'), 1500);
  assert.equal(extractField({} as never, { int: {} } as never, 'Quantity: 2 units'), 2);
});

test('THE CURRENCY’S OWN EXPONENT DECIDES BOTH THE GROUPING AND THE SCALE', () => {
  /* 07 §3: a lone separator followed by exactly three digits is grouping UNLESS the exponent is 3,
     and the exponent comes from `EXPONENT`, at ISO 4217's values and not CLDR's (02 §3 rule 1).
     Both were hard-coded
     at two, so `KWD 1.250` read as 125,000 fils (one thousand two hundred and fifty dinars) for one
     and a quarter, and `JPY 1250` read as 125,000 of a subunit the yen does not have. */
  const money = (currency: string, text: string) =>
    extractField({} as never, { money: { currency } } as never, text);

  assert.deepEqual(money('KWD', 'KWD 1.250'), { amount: 1250, currency: 'KWD' }, 'three minor digits makes it a decimal');
  assert.deepEqual(money('JPY', 'JPY 1250'), { amount: 1250, currency: 'JPY' }, 'the yen has no subunit');
  assert.deepEqual(money('GBP', 'GBP 1.250'), { amount: 125_000, currency: 'GBP' }, 'and two minor digits makes it a group');
});

test('and a number stops where the digits stop making a group', () => {
  // `1 2345` matched `1 234` and dropped the trailing digit — a plausible row for a number nobody
  // sent. A space followed by something that is not a group of three ends the number.
  assert.equal(extractField({} as never, { int: {} } as never, 'Quantity: 1 2345 units'), 1);
  assert.equal(extractField({} as never, { int: {} } as never, 'Quantity: 1 234 units'), 1234);
  assert.deepEqual(extractField({} as never, { money: { currency: 'EGP' } } as never, 'EGP 250 2 items'), {
    amount: 25_000,
    currency: 'EGP',
  });
});

test('A MALFORMED DECLARATION IS A REFUSAL, not a throw out of `install`', async () => {
  /* The first version of the field-id check spread `writes.key` straight into an array literal, so a
     `key` of `5` threw `not iterable` out of `install` and a `key` of `"ref"` spread into three
     one-letter ids that all passed the grammar and threw later at `arrive`. Three uncaught
     exceptions, in the check whose whole thesis is that a refusal is a value. */
  for (const writes of [
    { register: 'transactions', key: 5 },
    { register: 'transactions', key: 'ref' },
    { register: 'transactions', key: { ref: true } },
  ]) {
    const sql = openSqlite();
    const k = await openRecord(sql, fixedClock(NOW));
    const out = await k.install([TRANSACTIONS, HSBC({ writes: writes as never })]);
    assert.equal(out.ok, false, JSON.stringify(writes));
    assert.equal((out as { refusal: { code: string } }).refusal.code, 'DECLARATION_INVALID');
    sql.close();
  }
});

test('and a `then` that is not a list is refused the same way', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const out = await k.install([
    TRANSACTIONS,
    { id: 'rule.odd', kind: 'rule', body: { rule: 'odd', register: 'transactions', then: 'x' } } as never,
  ]);
  assert.equal(out.ok, false);
  sql.close();
});

test('THE MINOR UNIT IS ISO 4217’S, AND ONE TABLE SAYS IT', async () => {
  /* It was `Intl`, and `Intl` is not ISO 4217: CLDR carries a FORMATTING convention — what somebody
     in that country expects to see — and ISO carries the minor unit, which is what a record stores.
     They disagree on real currencies, and the disagreement was a thousandfold error on a screen:
     `Intl` says the Iraqi dinar has no minor unit, so `IQD 1.250` was read by the grouping rule as
     one thousand two hundred and fifty dinars, stored as `1250`, and then divided by 10³ by the
     renderer — which printed `IQD 1.250` back. One and a quarter dinars on screen for a number the
     record holds as 1,250. */
  assert.equal(exponentOf('IQD'), 3, 'the Iraqi dinar has 1,000 fils');
  assert.equal(exponentOf('KWD'), 3);
  assert.equal(exponentOf('JPY'), 0);
  assert.equal(exponentOf('GBP'), 2);
  assert.equal(exponentOf('MGA'), 2, 'ISO gives the ariary two, and Intl gives it none');
  assert.equal(exponentOf('gbp'), 2, 'the code is matched upper-cased');
  assert.equal(exponentOf('ZZZ'), 2, 'a code nobody knows is read as most currencies are read');

  /* AND IT IS `braindog-render`'s TABLE, BYTE FOR BYTE. The two cannot be one module — `render` is
     the published block dialect and depends on no `@braindog/*` package, and the kernel must not
     depend on a published renderer — so this is the thing that keeps the two copies one answer. A
     record that stores in one minor unit and draws in another is wrong money on a screen, which is
     the only class of defect that makes somebody act on a false number. */
  /* THE TWO EXPONENT-4 CODES, which are the only two in ISO 4217 and were in neither table. The
     paragraph above `EXPONENT` named `CLF` as *"a hundredfold, the other way"* and the table four
     lines below it did not have the row, so both copies fell to `?? 2`. */
  assert.equal(exponentOf('CLF'), 4, 'the unidad de fomento is quoted to four places');
  assert.equal(exponentOf('UYW'), 4, 'so is the unidad previsional');

  /* BY PATH, because the kernel does not depend on the renderer and must not — this is a test
     reading the other copy, which is what a drift check is.

     THE UNION OF BOTH KEY SETS. It enumerated `Object.keys(EXPONENT)` plus a handful of literals,
     so a code the RENDERER had and the kernel did not was invisible to it by construction — and
     that is the direction a table drifts, because the renderer is where a wrong minor unit is
     noticed. `CLF` was in the literals and it passed anyway: both sides returned 2, and agreement
     between two wrong answers is agreement. */
  const { exponentOf: drawn, EXPONENT: DRAWN } = await import('../../render/src/format.ts');
  for (const code of new Set([...Object.keys(EXPONENT), ...Object.keys(DRAWN), 'GBP', 'EUR', 'USD', 'MGA', 'HUF', 'ZZZ']))
    assert.equal(exponentOf(code), drawn(code), `${code}: the record stores one minor unit and draws another`);

  /* AND BOTH AGREE WITH SOMETHING THAT IS NOT THE OTHER ONE. Every override is deliberate and
     argued above — `IQD`, `MGA` — so the check is: where the two tables and `Intl` all speak, they
     agree, and where they do not, the disagreement is one of the three this file names. */
  const ARGUED = new Set(['IQD', 'MGA']);
  for (const code of Object.keys(EXPONENT)) {
    if (ARGUED.has(code)) continue;
    const cldr = new Intl.NumberFormat('en', { style: 'currency', currency: code }).resolvedOptions().maximumFractionDigits;
    assert.equal(EXPONENT[code], cldr, `${code} differs from CLDR and is not one of the overrides this file argues for`);
  }
});

/**
 * What git ignores under `root`, as git names it from there: a file by its path, a folder wholly ignored by its path
 * and a `/`. Nothing outside a git checkout.
 *
 * ASKED OF GIT, NEVER TYPED HERE. A checkout holds what nobody committed: a history scrub's copies of old trees, a
 * plan's scratch notes, a session's exports. Each is ignored, and each was read as the tree (29 Oct: the scrub's
 * `tip-checkout` copies of `ingest.ts` declared "their own" `exponentOf`), so a clean commit went red on the one
 * machine that kept them. A list of their names here would miss the next one.
 */
function ignoredIn(root: string): Set<string> {
  try {
    const out = execFileSync('git', ['ls-files', '--others', '--ignored', '--exclude-standard', '--directory', '-z'], { cwd: root, encoding: 'utf8' });
    return new Set(out.split('\0').filter((p) => p !== ''));
  } catch {
    return new Set();
  }
}

/**
 * Every source file in the tree, so a check can be about the tree and not about a list of files
 * somebody remembered. The skipped names are outputs and caches, never authored, and so is whatever git ignores.
 */
function* sources(root: string): Generator<string> {
  const SKIP = new Set(['node_modules', '.git', '.svelte-kit', '.wrangler', '.scratch', '.claude', 'dist', 'coverage', 'shots']);
  const ignored = ignoredIn(root);
  function* walk(dir: string): Generator<string> {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      const rel = relative(root, path).split(sep).join('/');
      if (entry.isDirectory()) {
        if (SKIP.has(entry.name) || entry.name.startsWith('build') || ignored.has(`${rel}/`)) continue;
        yield* walk(path);
      } else if (/\.(?:m|c)?[jt]s$|\.svelte$/u.test(entry.name) && !ignored.has(rel)) yield path;
    }
  }
  yield* walk(root);
}

test('NO FOURTH COPY: nothing outside the two tables works a currency exponent out for itself', () => {
  /* A CHECK THAT ENUMERATES THE COPIES IT KNOWS ABOUT CANNOT SEE THE NEXT ONE, which is how this
     survived. The drift check above compares the kernel's table with the renderer's, and a third
     reader grew up in `apps/web/src/lib/record/measures.ts` where neither could see it: it asked
     CLDR for the exponent, multiplied by it, and handed the result to `money()`, which divided by
     ISO's. `IQD 1.5` drew `IQD 0.002`. `02 §3` rule 1 is the rule; this is the thing that holds it.

     THE PATTERN IS NARROW ON PURPOSE AND MUST STAY NARROW. `maximumFractionDigits` appears all
     over the tree as the OUTPUT option to `toLocaleString`, which is how a figure is drawn and is
     nobody's business but the formatter's. What is forbidden is READING it back off
     `resolvedOptions()`, because that is asking CLDR what a currency's minor unit is, and CLDR
     answers a different question. Widening this to the bare identifier would flag fourteen
     innocent lines and the gate would be turned off within a week. */
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  const READS_CLDR = /resolvedOptions\(\)[\s\S]{0,40}?(?:maxi|mini)mumFractionDigits/u;

  /* ONE ALLOWANCE, AND IT IS THIS FILE. After the fix there is exactly one legitimate reader in
     the tree and it is the loop above, which reads CLDR in order to DISAGREE with it: the check
     that every override in `EXPONENT` is argued for needs the answer it is overriding. The two
     modules that hold the table do not appear here because they never call `Intl` at all. */
  const CLDR_ALLOWED = ['packages/kernel/test/ingest.test.ts'];

  /* AND NOBODY ELSE DECLARES THE FUNCTION EITHER, whatever they compute inside it. A copy that
     hard-codes `KWD: 3` drifts exactly as the CLDR one did; the two modules named here are the two
     `02 §3` rule 1 allows, and everyone else imports. Destructuring an import reads
     `const { exponentOf` and does not match. */
  const DECLARES = /(?:function|const|let|var)\s+exponentOf\b/u;
  const DECLARE_ALLOWED = ['packages/kernel/src/exponent.ts', 'packages/render/src/format.ts'];

  const found: string[] = [];
  for (const path of sources(root)) {
    /* POSIX SEPARATORS, because the allow-lists are written the way the repository is talked about
       and half the people running this are on Windows. */
    const rel = relative(root, path).split(sep).join('/');
    const text = readFileSync(path, 'utf8');
    if (READS_CLDR.test(text) && !CLDR_ALLOWED.includes(rel))
      found.push(`${rel} reads a currency's minor unit off Intl.resolvedOptions(). That is CLDR, which says what a country expects to SEE; money() divides by what ISO 4217 says a record STORES, and they differ on IQD and MGA. Import exponentOf from 'braindog-render' (an app or the renderer) or from './ingest.ts' (inside the kernel).`);
    if (DECLARES.test(text) && !DECLARE_ALLOWED.includes(rel))
      found.push(`${rel} declares its own exponentOf. 02 §3 rule 1 allows two copies of that table, packages/kernel/src/exponent.ts and packages/render/src/format.ts, and no third. Import exponentOf from 'braindog-render' or from '@braindog/kernel' instead of writing one.`);
  }
  assert.deepEqual(found, [], `\n${found.join('\n')}\n`);
});

test('NO FOURTH LIST: nothing outside two named places decides for itself what a currency is', () => {
  /* THE GUARD ABOVE IS HALF OF `02 §3` RULE 1, AND IT IS THE HALF THAT WAS EASY TO SEE. Rule 1
     answers two questions, and they are not the same question. How many minor digits a code has is
     the EXPONENT, held in two tables and guarded above. Whether three letters are a currency at all
     is MEMBERSHIP, and the rule says it is `Intl.supportedValuesOf('currency')`, the runtime's
     tender list.

     NOTHING WAS GUARDING MEMBERSHIP, so a fourth list grew up in the web app: a constant called
     `ISO_4217`, a hand-typed array of 155 codes, sitting beside a write path that validated against
     `Intl`'s 162. It was seven codes short, and one of the seven was real: `XCG`, the Caribbean
     guilder, which became tender in 2025. The record would accept an amount in it and the picker
     could not offer one. The exponent guard could not see any of this: `currencies.ts` neither
     reads `resolvedOptions()` nor declares `exponentOf`.

     THE NAME IS THE LIE, WHICH IS WHY THE NAME IS WHAT IS CHECKED. A constant named after the
     standard is a claim to BE the standard's list, and that claim cannot be true of anything typed
     by hand: the standard moves and the file does not. A curated list is a different thing and is
     allowed, as long as it is honest about being curated. `currencies.ts` now takes membership from
     `Intl` and SUBTRACTS a handful of codes that are not money anybody keeps books in, each with
     its reason, which can only ever fail to offer a code and can never admit one the write refuses.

     AND A LONG LIST OF REAL CODES IS THE OTHER SHAPE, caught by counting rather than by name. The threshold is
     deliberately well above the twelve `currencies.ts` legitimately holds. The rates form's list of what one rates
     source publishes was allowed here until rates became a preset of the new-action sheet and the list went with the
     form. */
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  const CLAIMS_THE_STANDARD = /(?:function|const|let|var|type|interface)\s+(ISO_?4217\w*|ALL_CURRENCIES|CURRENCY_CODES)\b/u;

  /* A LIST THIS LONG IS A LIST OF WHAT CURRENCIES THERE ARE, whatever it is called. Twenty rather
     than twelve, so an ordered head of the dozen a person actually picks is never mistaken for one.
     Tests are not exempt as a class: a test asserting on thirty codes is a test that will disagree
     with the runtime one day, and it is better for it to say so here than to go red in a year with
     no explanation. The one that does it is named, with what it is for. */
  const MANY = 20;
  const LIST_ALLOWED = new Map([
    ['apps/web/test/measures-currency.test.ts', 'the drawing test, which asserts on a spread of codes on purpose'],
    ['packs/stripe/stripe.test.ts', "Stripe's own page of zero-decimal, three-decimal and special units, each held against the script's table"],
  ]);

  const TENDER = new Set(Intl.supportedValuesOf('currency'));
  const found: string[] = [];
  for (const path of sources(root)) {
    const rel = relative(root, path).split(sep).join('/');
    const text = readFileSync(path, 'utf8');

    if (CLAIMS_THE_STANDARD.test(text))
      found.push(`${rel} declares a constant named after ISO 4217. Membership is Intl.supportedValuesOf('currency') by 02 §3 rule 1, and a hand-typed copy of the standard is wrong the day the standard moves: the last one was missing XCG. Derive from Intl and subtract what you do not want, with a reason beside each.`);

    const held = new Set<string>();
    for (const [, code] of text.matchAll(/['"]([A-Z]{3})['"]/gu)) if (code !== undefined && TENDER.has(code)) held.add(code);
    if (held.size >= MANY && !LIST_ALLOWED.has(rel))
      found.push(`${rel} quotes ${held.size} real currency codes, which is a list of what currencies there are. Take membership from Intl.supportedValuesOf('currency'), or name this file above with what the list is for if Intl cannot answer it.`);
  }
  assert.deepEqual(found, [], `\n${found.join('\n')}\n`);
});

/* ── 12 section 3: unverified is stored, and never matched ──────────────── */

test('AN UNVERIFIED ARRIVAL IS STORED AND NEVER MATCHED, however well the pattern fits', async () => {
  /* The host has carried this flag since `/in/*` was built and the record had nowhere to read it
     from, so the rule had a host half and no record half: a stranger holding the webhook URL and
     sending a wrong token had the bytes matched, extracted and written into a register as though
     the bank had sent them. The same bytes are sent twice here, once each way, so the only thing
     that differs between the two runs is the flag. */
  const { k, sql } = await record(HSBC());

  const forged = value<Arrived>(
    k.arrive({ channel: 'email', headers: { From: 'alerts@hsbc.example', Subject: 'Your transaction alert' }, body: MAIL, sha256: 'f1', verified: false }),
  );
  assert.equal(forged.state, 'untriaged', 'an unverified payload was matched');
  assert.equal(forged.ingest, null);
  assert.deepEqual(forged.wrote, []);
  assert.equal(forged.reason, UNVERIFIED);
  assert.equal(k.get('transactions#1'), null, 'a forgery wrote a row into the register');

  // AND THE BYTES ARE IN THE RECORD, which is the rule no repair here may weaken: the row is
  // readable, with the sentence saying why nothing was tried on it.
  const row = sql.one<{ state: string; reason: string | null; body: string }>("SELECT state, reason, body FROM inbox_raw WHERE sha256 = 'f1'")!;
  assert.equal(row.state, 'untriaged');
  assert.equal(row.reason, UNVERIFIED);
  assert.equal(row.body, MAIL);

  // The same bytes, verified, do everything they always did.
  const real = value<Arrived>(
    k.arrive({ channel: 'email', headers: { From: 'alerts@hsbc.example', Subject: 'Your transaction alert' }, body: MAIL, sha256: 'f2', verified: true }),
  );
  assert.equal(real.state, 'matched');
  assert.equal(real.wrote.length, 1);
  sql.close();
});

test('and an arrival that says nothing about verification is not an unverified one', async () => {
  /* Only the two channels that terminate at a public door can answer the question at all. Reading
     silence as `false` would have made every connector answer and every pasted payload untriaged. */
  const { k, sql } = await record(HSBC());
  assert.equal(value<Arrived>(send(k)).state, 'matched');
  sql.close();
});

test('THREE FORGERIES BUY NO MODEL CALL, which is the one way an unverified row could still spend money', async () => {
  /* `3'` queues a draft at the third arrival of an unmatched shape, and a draft is a bill. Without
     this the cheapest attack on a record's owner is to send the same unsigned payload three times
     from an address nobody has a pattern for. */
  const { k, sql } = await record();
  for (const n of [1, 2, 3, 4])
    k.arrive({ channel: 'email', headers: { From: 'alerts@cib.eg', Subject: 'Debit' }, body: `payment ${n}`, sha256: `u${n}`, verified: false });
  assert.equal(sql.all('SELECT 1 FROM outbox').length, 0, 'three forgeries queued a draft somebody pays for');

  // And a verified shape still earns its one draft, so this rations rather than switches off.
  for (const n of [1, 2, 3])
    k.arrive({ channel: 'email', headers: { From: 'alerts@nbe.eg', Subject: 'Debit' }, body: `payment ${n}`, sha256: `v${n}`, verified: true });
  assert.equal(sql.all('SELECT 1 FROM outbox').length, 1);
  sql.close();
});
