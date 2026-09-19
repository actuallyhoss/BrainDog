/**
 * `43 §4.3`'s two literal forms — `enum` and `lookup` — read the way a real record reads them.
 *
 * THE ORACLE IS THE DOCUMENT AND NOT EITHER IMPLEMENTATION, as in `numbers.test.ts`. Every
 * expectation below is a row of `43 §9.1` or a sentence of `§4.3`, and when the two readers were
 * driven against each other over the seven forms the kernel still read itself, five rows differed
 * and all five were the kernel's.
 *
 * AND THE WORD `ambiguous` IS THE POINT OF THE FILE. A text that says two things is not a value
 * and not a miss; the kernel had no way to say so, so it picked one — an `enum` by the order
 * `Object.keys` gave, a `lookup` by not looking past the first token. `43 §5.1` step 7 files
 * ambiguity at `needs-review`, which is a person being asked rather than a row being written.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 5, 12);
const OWNER = { principal: { kind: 'person', id: 'p_1', level: 'owner' } } as never;

/** `43 §9`'s M1, byte for byte. */
const M1 = 'Card 1234 debited EGP 1,250.00 at BEANS COFFEE on 29/08/26. Ref 88213. Balance EGP 3,020.15.';

const MOVES = {
  id: 'register.moves',
  kind: 'register' as const,
  body: {
    id: 'moves',
    name: 'Moves',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'kind', type: 'text' },
      { id: 'account', type: 'text' },
    ],
  } as never,
};

/** `43 §9.1`'s lookup register: two accounts, by their last four digits. */
const ACCOUNTS = {
  id: 'register.accounts',
  kind: 'register' as const,
  body: {
    id: 'accounts',
    name: 'Accounts',
    title: 'last4',
    fields: [{ id: 'last4', type: 'text', required: true }],
  } as never,
};

const reader = (form: Record<string, unknown>, field: string) => ({
  id: 'ingest.bank-sms',
  kind: 'ingest' as const,
  body: {
    ingest: 'bank-sms',
    channel: 'email',
    match: { all: [{ field: 'from', is: 'alerts@bank.example' }] },
    extract: { what: { text: { before: ' at' } }, [field]: form },
    writes: { register: 'moves', confidence: 'exact', key: ['what'] },
    on_conflict: 'skip',
  } as never,
});

type Read = { value: unknown; state: string; ids: string[] };

/**
 * One message through one declaration: what it read, and what state the arrival landed in.
 *
 * THE VALUE COMES FROM WHEREVER THE EXTRACTION WENT, because `ingest.ts`'s own first line is that
 * `exact` writes rows and `proposed` and `needs-review` write nothing and open a `rowset` instead.
 * Reading only the register would make every `defaulted` and every `ambiguous` look identical —
 * both absent — and this file is about telling those two apart.
 */
async function reads(field: string, form: Record<string, unknown>, body: string, last4: string[] = []): Promise<Read> {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) } as never);
  const put = await api.kernel.install([MOVES, ACCOUNTS, reader(form, field)]);
  assert.ok(put.ok, JSON.stringify(put));
  const ids: string[] = [];
  for (const value of last4) {
    const made = await api.create({ register: 'accounts', fields: { last4: value } }, OWNER);
    assert.ok(made.ok, JSON.stringify(made));
    ids.push((made.value as { id: string }).id);
  }
  const out = api.kernel.arrive({ channel: 'email', headers: { From: 'alerts@bank.example' }, body, sha256: 'a1' });
  assert.ok(out.ok, JSON.stringify(out));
  const state = out.value.state;
  if (state === 'matched') {
    const got = await api.list({ register: 'moves' }, OWNER);
    const rows = got.ok ? (got.value as { rows: { fields: Record<string, unknown> }[] }).rows : [];
    return { value: rows[0]?.fields[field] ?? null, state, ids };
  }
  const held = sql.one<{ body: string }>('SELECT body FROM suggestion WHERE id = ?', out.value.suggestion ?? '');
  const rows = held === undefined ? [] : (JSON.parse(held.body) as { rows: Record<string, unknown>[] }).rows;
  return { value: rows[0]?.[field] ?? null, state, ids };
}

test("43 §9.1'S ENUM ROWS, and the reader matched substrings and never said ambiguous", async () => {
  /* THE ROW THAT WORKS, so the three below are about the rule and not about the wiring. */
  assert.equal((await reads('kind', { enum: { map: { debited: 'debit', credited: 'credit' } } }, M1)).value, 'debit');

  /* A LITERAL IS A WHOLE TOKEN — `43 §4.3`, and `§9.1` gives `coin` against the literal `in` as
     the row. The old reading was `anchored.toLowerCase().includes(literal)`, so a three-letter
     word inside an unrelated one wrote a value into a register. It is a legal value for the
     field, off a fragment of a word nobody meant, which is exactly why nothing downstream
     catches it. */
  const coin = await reads('kind', { enum: { map: { in: 'credit' } } }, 'coin found at Acme');
  assert.equal(coin.value, null);

  /* AND TWO OF EQUAL LENGTH WITH DIFFERENT VALUES ARE AMBIGUOUS, not a coin toss decided by the
     order `Object.keys` happened to give. `§9.1`'s row is `"sent 5 recv 5"`. */
  const both = await reads('kind', { enum: { map: { sent: 'debit', recv: 'credit' } } }, 'sent 5 recv 5 at Acme');
  assert.equal(both.value, null, 'a text that said two things is not a value');
  assert.equal(both.state, 'review', '`43 §5.1` step 7: ambiguous is needs-review');

  /* AND THE LONGEST STILL WINS, which is the half the old reading did get right. */
  assert.equal((await reads('kind', { enum: { map: { paid: 'p', unpaid: 'u' } } }, 'this is unpaid at Acme')).value, 'u');
});

test("43 §9.1'S LOOKUP ROWS, and the reader read only the first token of the slice", async () => {
  /* `§9.1`: rows `[{e1,"1234"},{e2,"4471"}]` over M1 give `e1`. The old reading took the first
     token of the slice — `Card` — looked up exactly that, found nothing, and was silent. A
     declaration that installs, matches, fires and says nothing, for the fourth time. */
  const one = await reads('account', { lookup: { register: 'accounts', by: 'last4' } }, M1, ['1234', '4471']);
  assert.equal(one.value, one.ids[0], 'the id of the account whose last4 the message carries');

  /* AND TWO ROWS MATCHED IS AMBIGUOUS — `§9.1`'s `"cards 1234 and 4471"` row. */
  const two = await reads('account', { lookup: { register: 'accounts', by: 'last4' } }, 'cards 1234 and 4471 at Acme', [
    '1234',
    '4471',
  ]);
  assert.equal(two.value, null);
  assert.equal(two.state, 'review');

  /* AND A VALUE THAT IS NOT THERE IS A MISS AND NOT AN ERROR. */
  const none = await reads('account', { lookup: { register: 'accounts', by: 'last4' } }, 'card 9999 at Acme', ['1234']);
  assert.equal(none.value, null);
});

test('AND A DEFAULT COVERS ABSENCE, NEVER AMBIGUITY', async () => {
  /* `43 §4.3` on the `default` row, verbatim: *an ambiguous `of` stays ambiguous.* The old reading
     had no ambiguity to keep, so a default over two readings wrote the value the declaration
     named over a text that contradicted it — the one case where a fallback is worse than no
     value, because the text did say something and the row says otherwise. */
  const over = { default: { value: 'x', of: { enum: { map: { sent: 'a', recv: 'b' } } } } };
  const got = await reads('kind', over, 'sent recv at Acme');
  assert.equal(got.value, null);
  assert.equal(got.state, 'review');

  /* AND ABSENCE IS STILL COVERED, which is what the form is for. */
  assert.equal((await reads('kind', over, 'nothing of the sort at Acme')).value, 'x');
});
