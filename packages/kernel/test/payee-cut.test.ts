/**
 * A shop's name a card text cut short makes no organisation (the audit of 25 October, Y2).
 *
 * A CARD NETWORK PRINTS A SHOP IN A FIELD OF FIXED WIDTH, the processor's prefix included, and a text message prints
 * that field as it came: `FAWRY*` and a name cut at the twentieth character. The walk over the past met each such cut as
 * a shop of its own, so People listed names nobody could read ("Orbt Speciali") and one shop twice, once by the note's
 * whole name and once by the card's cut one. `mayBeCut` says when a text could be one of those; the door keeps the
 * bank's words on the line and meets nobody by them, and the walk makes no organisation from them alone, while a line
 * whose payee the record already knows is still linked.
 *
 * THE SHOP NAMES ARE INVENTED.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { understandBackfill, type BackfillDeps } from '../src/backfill.ts';
import { mayBeCut } from '../src/identity-keys.ts';
import { ulids } from '../src/ids.ts';
import { openRecord, type Arrived, type Declaration, type Entry, type Json } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 25, 2);
const OWNER = { actor: 'p_owner' };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

test('a card text that fills its field to the end, prefix and all, may be cut; one that goes on past the name is whole', () => {
  for (const cut of ['FAWRY*QUILLMOOR BAKE', 'KASHIER*TOLLAND CAFE', 'GEIDEA*MERROW SPECIA', 'NORTHWIND *NORTHWIND HA', 'KASHIER*ARDEN CENTER', 'GEIDEA*SOREL BY KAT'])
    assert.equal(mayBeCut(cut), true, cut);
  for (const whole of [
    'GEIDEA*BRIDGE ST COFFEE 0423 LONDON GB',
    'GEIDEA*PELL VINE',
    'CEDAR LANE BAKERY',
    'UBER *TRIP HELP.UBER.COM',
    'Fenwick Cloud Services Ltd',
    'TALABAT CAIRO 4471 EG',
    'FAWRY*Quillmoor',
    '',
  ])
    assert.equal(mayBeCut(whole), false, whole);
});

/* ── the door ─────────────────────────────────────────────────────────── */

const register = (body: Record<string, unknown>): Declaration => ({ id: `register.${body.id as string}`, kind: 'register', body: body as never });
const LEDGER = register({
  id: 'transactions',
  name: 'Transactions',
  title: 'what',
  fields: [
    { id: 'what', type: 'text', required: true },
    { id: 'amount', type: 'money' },
    { id: 'counterparty_text', type: 'text' },
  ],
});
const CARD: Declaration = {
  id: 'ingest.card-used',
  kind: 'ingest',
  body: {
    ingest: 'card-used',
    channel: 'email',
    match: { all: [{ field: 'body', contains: 'card ending' }] },
    extract: {
      what: { text: { between: ['at ', '. Your'] } },
      counterparty_text: { text: { between: ['at ', '. Your'] } },
      amount: { money: { after: 'EGP ', currency: 'EGP' } },
    },
    writes: { register: 'transactions', confidence: 'exact' },
  } as never,
};
const literals = (text: string, entries: readonly (readonly [string, Json])[]): Json[] => {
  const tokens = text.trim().split(/\s+/);
  return entries.filter(([literal]) => tokens.includes(literal)).map(([, id]) => id);
};

test('the door keeps a cut name on the line as the bank wrote it, and meets nobody by it', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW), { literals });
  value(await k.install([LEDGER, CARD]));
  const arrive = (shop: string, sha256: string): Arrived =>
    value<Arrived>(k.arrive({ channel: 'email', headers: { From: 'Alerts <alerts@bank.example>', Subject: 'Card' }, body: `Your card ending 6518 was used for EGP 85.00 at ${shop}. Your limit is fine.`, sha256 }));
  const cut = arrive('FAWRY*QUILLMOOR BAKE', 'c1');
  assert.equal(cut.state, 'matched', cut.reason ?? '');
  assert.equal(cut.counterparty, undefined, 'a cut name is nobody to meet');
  assert.equal(JSON.parse(sql.one<{ fields: string }>('SELECT fields FROM entry WHERE id = ?', cut.wrote[0]!)!.fields).counterparty_text, 'FAWRY*QUILLMOOR BAKE');
  const whole = arrive('GEIDEA*BRIDGE ST COFFEE 0423 LONDON GB', 'c2');
  assert.equal(whole.counterparty, 'Bridge ST Coffee');
  sql.close();
});

/* ── the walk over the past ───────────────────────────────────────────── */

test('the walk makes no organisation from cut names alone, and still links a line to a shop the record knows', async () => {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  value(
    await k.install([
      register({
        id: 'organisations',
        name: 'Organisations',
        title: 'name',
        org: { name: 'name', kind: 'kind', keys: 'keys', merged_into: 'merged_into' },
        fields: [
          { id: 'name', type: 'text', required: true },
          { id: 'kind', type: 'enum', values: ['company', 'merchant', 'other'] },
          { id: 'keys', type: 'list', of: 'text' },
          { id: 'merged_into', type: 'ref', to: 'organisations' },
        ],
      }),
      register({
        id: 'transactions',
        name: 'Transactions',
        title: 'what',
        fields: [
          { id: 'what', type: 'text', required: true },
          { id: 'amount', type: 'money', required: true },
          { id: 'party', type: 'ref', to: 'organisations' },
          { id: 'counterparty_text', type: 'text' },
          { id: 'note', type: 'text' },
        ],
      }),
    ]),
  );
  const line = (what: string, more: Record<string, unknown> = {}) => value<Entry>(k.create('transactions', { what, amount: { amount: -1_250, currency: 'EGP' }, ...more }, OWNER)).id;
  /* THREE CUT LINES OF ONE SHOP, the bank's words and the import's description, and two of another the record knows. */
  const cut = [line('FAWRY*QUILLMOOR BAKE'), line('FAWRY*QUILLMOOR BAKE'), line('QUILLMOOR BAKE', { counterparty_text: 'FAWRY*QUILLMOOR BAKE' })];
  const known = value<Entry>(k.create('organisations', { name: 'Tolland Cafe', keys: ['bank:tollandcafe'] }, OWNER)).id;
  const linked = [line('KASHIER*TOLLAND CAFE'), line('KASHIER*TOLLAND CAFE')];
  /* AND A WHOLE NAME ON TWO LINES IS MADE, as it always was. */
  line('GEIDEA*BRIDGE ST COFFEE 0423 LONDON GB');
  line('GEIDEA*BRIDGE ST COFFEE 0423 LONDON GB');

  const deps: BackfillDeps = { sql, clock, mint: ulids(() => clock.now()), transaction: k.transaction, write: k.write, registers: k.registers };
  const walked = understandBackfill(deps);
  const orgs = value<{ rows: Entry[] }>(k.list({ register: 'organisations', limit: 50 })).rows.map((r) => r.fields.name).sort();
  assert.deepEqual(orgs, ['Bridge St Coffee', 'Tolland Cafe']);
  for (const id of cut) assert.equal(k.get(id)?.fields.party, undefined, 'a cut line keeps its words and is linked to nobody');
  for (const id of linked) assert.equal(k.get(id)?.fields.party, known);
  assert.equal(walked.suggestions.some((s) => s.kind === 'organisation' && /quillmoor/iu.test(s.name)), false, 'and nobody is asked about a cut name');
  sql.close();
});

test('shops already made from cut names are one question: fold the one a whole name begins with, retire the rest', async () => {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  value(
    await k.install([
      register({
        id: 'organisations',
        name: 'Organisations',
        title: 'name',
        org: { name: 'name', keys: 'keys', merged_into: 'merged_into', retired: 'retired_on' },
        fields: [
          { id: 'name', type: 'text', required: true },
          { id: 'keys', type: 'list', of: 'text' },
          { id: 'merged_into', type: 'ref', to: 'organisations' },
          { id: 'retired_on', type: 'day' },
        ],
      }),
      register({
        id: 'transactions',
        name: 'Transactions',
        title: 'what',
        fields: [
          { id: 'what', type: 'text', required: true },
          { id: 'amount', type: 'money', required: true },
          { id: 'party', type: 'ref', to: 'organisations' },
          { id: 'counterparty_text', type: 'text' },
          { id: 'note', type: 'text' },
        ],
      }),
    ]),
  );
  /* AS THE WALK LEFT THEM: shops it made from the bank's words, each linked to its lines. */
  const shop = (name: string, keys: string[]) => value<Entry>(k.create('organisations', { name, keys }, { actor: 'rule:backfill' })).id;
  const line = (what: string, party: string, more: Record<string, unknown> = {}) => value<Entry>(k.create('transactions', { what, party, amount: { amount: -900, currency: 'EGP' }, ...more }, OWNER)).id;
  const whole = shop('Harrow Market', ['bank:harrowmarket']);
  const cutMarket = shop('Marke', ['bank:harrow2marke']);
  const cutBakery = shop('Quillmoor Bake', ['bank:quillmoorbake']);
  const fine = shop('Bridge ST Coffee', ['bank:bridgestcoffee']);
  const byHand = value<Entry>(k.create('organisations', { name: 'Tolland Cafe', keys: ['bank:tollandcafe'] }, OWNER)).id;
  line('Harrow Market', whole, { note: 'Payee: Harrow Market.' });
  line('FAWRY*HARROW2 MARKE', cutMarket);
  line('HARROW2 MARKE', cutMarket, { counterparty_text: 'FAWRY*HARROW2 MARKE' });
  line('FAWRY*QUILLMOOR BAKE', cutBakery);
  line('GEIDEA*BRIDGE ST COFFEE 0423 LONDON GB', fine);
  line('KASHIER*TOLLAND CAFE', byHand);

  const deps: BackfillDeps = { sql, clock, mint: ulids(() => clock.now()), transaction: k.transaction, write: k.write, registers: k.registers };
  const asks = understandBackfill(deps).held.filter((h) => h.kind === 'cut-organisations');
  assert.equal(asks.length, 1);
  const ask = asks[0]!;
  assert.equal(ask.kind, 'cut-organisations');
  if (ask.kind !== 'cut-organisations') return;
  assert.deepEqual(
    ask.organisations.map((o) => [o.organisation.name, o.into?.name ?? null]),
    [['Marke', 'Harrow Market'], ['Quillmoor Bake', null]],
    'a shop a person made, and one a line names whole, are not asked about',
  );
  assert.equal(ask.question, "2 shops are names a card text cut short: Marke and Quillmoor Bake. Fold Marke into Harrow Market, and retire Quillmoor Bake? Their payments keep the bank's words, and nothing is deleted.");
  assert.equal(ask.payments, 3);
  assert.doesNotMatch(ask.question, /—|bank:|#\d/u);
  /* NOTHING IS WRITTEN BY ASKING: both shops stand as they were. */
  assert.deepEqual([k.get(cutMarket)?.fields.merged_into, k.get(cutBakery)?.fields.retired_on], [undefined, undefined]);
  sql.close();
});
