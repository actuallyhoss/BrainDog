/**
 * A card text BrainDog is sure of files itself with a mark: the sender's rule trusted, the account found
 * by its last digits, the amount read and the shop named. One short of that and it asks, as it did.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { arrivalSure } from '../src/ingest.ts';
import { openRecord, type Arrived, type Declaration, type Json, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';
import { BANKS, CARD_TAILS } from '../../../fixtures/names.ts';

const NOW = Date.UTC(2026, 8, 25, 12);

const wordy = (ch: string | undefined): boolean => ch !== undefined && /[A-Za-z0-9]/.test(ch);

/** The whole-token rule, and the masked-tail rule for a `lookup`, over the table the kernel hands in. */
function literals(text: string, entries: readonly (readonly [string, Json])[], form: 'enum' | 'lookup' = 'enum'): Json[] | 'ambiguous' {
  const hay = text.toLowerCase();
  let best: { length: number; value: Json } | null = null;
  let clash = false;
  for (const [literal, value] of entries) {
    const needle = literal.toLowerCase();
    if (needle === '') continue;
    let hit = false;
    for (let i = hay.indexOf(needle); i !== -1 && !hit; i = hay.indexOf(needle, i + 1))
      hit = !wordy(hay[i - 1]) && !wordy(hay[i + needle.length]);
    if (!hit) continue;
    if (best === null || needle.length > best.length) {
      best = { length: needle.length, value };
      clash = false;
    } else if (needle.length === best.length && JSON.stringify(value) !== JSON.stringify(best.value)) clash = true;
  }
  if (best !== null) return clash ? 'ambiguous' : [best.value];
  if (form !== 'lookup') return [];
  const first = hay.trimStart().split(' ')[0] ?? '';
  const digits = /\*+-?(\d{3,})$/.exec(first)?.[1];
  if (digits === undefined) return [];
  /* AND THE REVERSE TAIL: a stored value of three digits or more that the printed digits end in. */
  const ending = entries.filter(
    ([literal]) => (literal.length > digits.length && literal.endsWith(digits)) || (/^\d{3,}$/.test(literal) && literal.length < digits.length && digits.endsWith(literal)),
  );
  if (ending.length === 0) return [];
  return ending.length > 1 ? 'ambiguous' : [ending[0]![1]];
}

const ACCOUNTS: Declaration = {
  id: 'register.accounts',
  kind: 'register',
  body: { id: 'accounts', name: 'Accounts', title: 'name', fields: [{ id: 'name', type: 'text', required: true }, { id: 'number', type: 'text' }] } as never,
};

const LEDGER: Declaration = {
  id: 'register.ledger',
  kind: 'register',
  body: {
    id: 'ledger',
    name: 'Ledger',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'amount', type: 'money' },
      { id: 'account', type: 'text' },
    ],
  } as never,
};

/** Reads the amount in `EGP 75.00` form, or with `soft` a text that prints none and so falls to a default. */
const door = (id: string, extra: Record<string, unknown> = {}): Declaration => ({
  id: `ingest.${id}`,
  kind: 'ingest',
  body: {
    ingest: id,
    channel: 'email',
    match: { all: [{ field: 'body', contains: id }] },
    extract: {
      account: { lookup: { register: 'accounts', by: 'number', between: ['Card ***', ' was'] } },
      what: { text: { between: ['to ', ' for'] } },
      counterparty_text: { text: { between: ['to ', ' for'] } },
      amount: { money: { after: 'for ', currency: 'EGP' } },
      ...extra,
    },
    writes: { register: 'ledger', confidence: 'exact' },
  } as never,
});

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW), { literals });
  const installed = await k.install([ACCOUNTS, LEDGER, door('sure-door')]);
  assert.ok(installed.ok, JSON.stringify(installed));
  const made = k.create('accounts', { name: BANKS[0], number: `90${CARD_TAILS[0]}` }, { actor: 'p_1' });
  assert.ok(made.ok, JSON.stringify(made));
  return { k, sql };
}

let sent = 0;
const text = (k: Kernel, tail: string, shop: string, amount: string): Arrived => {
  sent += 1;
  const r = k.arrive({
    channel: 'email',
    headers: { From: 'alerts@bank.example', Subject: 'sure-door' },
    body: `sure-door Card ***${tail} was used to ${shop} for EGP ${amount} today.`,
    sha256: `arrival-sure-${String(sent)}`,
  }) as { ok: boolean; value: Arrived };
  assert.ok(r.ok, JSON.stringify(r));
  return r.value;
};

test('ONLY ALL FOUR TOGETHER ARE SURE: a rule, a tail, an amount and a shop', () => {
  const all = { ruleTrusted: true, missed: 0, soft: 0, tails: 1, amount: true, payee: true };
  assert.equal(arrivalSure(all).sure, true);
  assert.equal(arrivalSure({ ...all, amount: false }).sure, false);
  assert.equal(arrivalSure({ ...all, payee: false }).sure, false);
  assert.equal(arrivalSure({ ...all, soft: 1 }).sure, false);
  assert.equal(arrivalSure({ ...all, ruleTrusted: false }).sure, false);
  assert.equal(arrivalSure({ ...all, tails: 0 }).score, 0.75);
});

test('A SURE CARD TEXT IS FILED AT ONCE and BrainDog signs it with the digits it matched', async () => {
  const { k, sql } = await record();
  const got = text(k, CARD_TAILS[0], 'Orchard Prints', '75.00');
  assert.equal(k.count('ledger'), 1, `${got.state}: ${got.reason}`);
  const d = sql.one<{ question: string; decided_by: string }>('SELECT question, decided_by FROM decision ORDER BY rowid DESC LIMIT 1');
  assert.equal(d?.decided_by, 'rule:handled');
  assert.match(d?.question ?? '', /^Filed by BrainDog: matched .* by its last digits/);
  sql.close();
});

test('A TEXT WITH NO AMOUNT IN IT STILL ASKS, because money that did not read is never filed unasked', async () => {
  const { k, sql } = await record();
  sent += 1;
  const r = k.arrive({
    channel: 'email',
    headers: { From: 'alerts@bank.example', Subject: 'sure-door' },
    body: `sure-door Card ***${CARD_TAILS[0]} was used to Orchard Prints for a purchase today.`,
    sha256: `arrival-sure-${String(sent)}`,
  }) as { ok: boolean; value: Arrived };
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(k.count('ledger'), 0);
  assert.ok(r.value.suggestion, 'a person is asked');
  sql.close();
});

/** A door whose rule is not trusted yet: what it reads files only as a proposal. */
const careful = (): Declaration => {
  const d = door('careful-door');
  return { ...d, body: { ...d.body, writes: { register: 'ledger', confidence: 'proposed' } } } as never;
};

const carefulText = (k: Kernel, what: string): void => {
  sent += 1;
  const r = k.arrive({
    channel: 'email',
    headers: { From: 'alerts@bank.example', Subject: 'careful-door' },
    body: `careful-door Card ***${CARD_TAILS[0]} was used to Orchard Prints for ${what} today.`,
    sha256: `arrival-sure-${String(sent)}`,
  }) as { ok: boolean };
  assert.ok(r.ok, JSON.stringify(r));
};

test('A DOUBTFUL TEXT WAITS IN TO REVIEW and Needs you does not count it', async () => {
  const { k, sql } = await record();
  assert.ok((await k.install([careful()])).ok);
  carefulText(k, 'EGP 12.00');
  assert.equal(k.count('ledger'), 0);
  const open = k.openSuggestions();
  assert.ok(open.ok && open.value.length === 0, 'nothing is asked in Needs you');
  const review = k.governance('suggestion', { status: 'open', review: 'only' });
  assert.ok(review.ok && review.value.length === 1, 'one waits in To review');
  sql.close();
});

test('MONEY NOT READ CLEANLY STILL ASKS IN NEEDS YOU, even from a door that is not trusted', async () => {
  const { k, sql } = await record();
  assert.ok((await k.install([careful()])).ok);
  carefulText(k, 'a purchase');
  const open = k.openSuggestions();
  assert.ok(open.ok && open.value.length === 1, 'the amount question is in Needs you');
  const review = k.governance('suggestion', { status: 'open', review: 'only' });
  assert.ok(review.ok && review.value.length === 0);
  sql.close();
});
