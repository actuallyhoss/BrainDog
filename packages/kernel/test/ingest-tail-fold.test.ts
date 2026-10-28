/**
 * The questions per message already open are folded into the one.
 *
 * HIS RECORD HOLDS THEM ALREADY: about seventeen questions, one per bank text, each asking to add a row whose account was
 * not read, filed before a tail had a question of its own. They carry no `raws` (that came with this change) and were
 * joined by payee. Here they are made the way the old code made them, and the next text at the door folds them: into the
 * one question when the digits name no account, filed when a person has put the digits on one, and into one confirming
 * question when an agent did. The old ones close as "asked again as one question" or as filed, never as declined.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Declaration } from '../src/index.ts';
import { CARD, bodyOf, openQuestions, record, text, type Rec } from './ingest-tail-kit.ts';

/** The pattern as an older add-on wrote it: the card's digits printed bare, and the lookup saying nothing of them. */
const OLD = (says?: string): Declaration =>
  CARD(
    { match: { all: [{ field: 'body', contains: 'was used' }] } },
    { between: undefined, after: 'card ending ', where: undefined, says },
  );

const bare = (digits: string, shop: string, amount: string): string => `Your card ending ${digits} was used for EGP ${amount} on 05/10/2026 at ${shop}.`;

/** Texts held the way the old code held them: a question of their own each, with no `raws`, joined by nothing. */
function legacy(r: Rec, digits: string, shops: readonly string[]): string[] {
  return shops.map((shop, i) => {
    const out = text(r.k, bare(digits, shop, `${10 + i}.00`));
    assert.equal(out.state, 'review');
    r.sql.exec("UPDATE suggestion SET body = json_set(json_remove(body, '$.raws'), '$.joins_on', ?) WHERE id = ?", `legacy-${shop}`, out.suggestion!);
    return out.suggestion!;
  });
}

const status = (r: Rec, id: string): [string, string | null] => {
  const q = r.sql.one<{ status: string; resolved_as: string | null }>('SELECT status, resolved_as FROM suggestion WHERE id = ?', id)!;
  return [q.status, q.resolved_as];
};

test('DIGITS NOBODY HOLDS: the open questions per text fold into the one, and close as asked again', async () => {
  const r = await record(OLD());
  const old = legacy(r, '1234', ['CORNER SHOP', 'NILE BOOKS', 'HALDEN COFFEE']);
  assert.equal(openQuestions(r.sql).length, 3);

  /* THE ADD-ON'S UPDATE SAYS WHAT IT READS, so a bare run is a card's digits; then the next text comes. */
  const updated = await r.k.install([OLD('card')]);
  assert.ok(updated.ok, JSON.stringify(updated));
  const next = text(r.k, bare('1234', 'ORCHARD PRINTS', '5.00'));

  const asked = openQuestions(r.sql);
  assert.equal(asked.length, 1, `Decide holds ${asked.length} questions where it should hold one`);
  assert.equal(asked[0]!.id, next.suggestion);
  assert.equal(r.k.question(asked[0]!.id), 'Which account is the card ending 1234?');
  assert.equal((bodyOf(r.sql, asked[0]!.id) as { count: number }).count, 4);
  for (const id of old) assert.deepEqual(status(r, id), ['resolved', 'asked-again']);
  const closed = r.sql.one<{ note: string }>("SELECT note FROM event WHERE kind = 'resolve' AND target = ?", `suggestion:${old[0]}`)!;
  assert.equal(closed.note, 'Asked again as one question.');
  r.sql.close();
});

test('DIGITS A PERSON PUT ON AN ACCOUNT: the next text files the backlog, and the old questions close as filed', async () => {
  const r = await record(OLD());
  const old = legacy(r, '7731', ['CORNER SHOP', 'NILE BOOKS', 'HALDEN COFFEE']);
  const before = openQuestions(r.sql).length;
  assert.equal(before, 3);

  assert.ok(r.k.write('accounts', r.card, { last4: '7731' } as never, { actor: 'p_1' }).ok);
  /* ANY TEXT AT THE DOOR, even one for another card. */
  text(r.k, bare('7777', 'ORCHARD PRINTS', '5.00'));

  assert.equal(r.k.count('transactions'), 3, 'the backlog waited on after its digits were on the account');
  for (const id of old) assert.deepEqual(status(r, id), ['resolved', 'filed']);
  assert.equal(
    r.sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM inbox_raw WHERE state IN ('review', 'proposed') AND body LIKE '%7731%'")!.n,
    0,
  );
  r.sql.close();
});

test('DIGITS AN AGENT PUT ON AN ACCOUNT: the backlog waits under one question that suggests it, and one press files all', async () => {
  const r = await record(OLD());
  const old = legacy(r, '7731', ['CORNER SHOP', 'NILE BOOKS', 'HALDEN COFFEE', 'CEDAR LANE BAKERY']);
  assert.ok(r.k.write('accounts', r.card, { last4: '7731' } as never, { actor: 'S731' }).ok);
  const next = text(r.k, bare('7731', 'ORCHARD PRINTS', '5.00'));
  assert.equal(next.state, 'review');

  const asked = openQuestions(r.sql);
  assert.equal(asked.length, 1, 'one question per text');
  const body = bodyOf(r.sql, asked[0]!.id) as { count: number; options: { id: string; recommended?: boolean }[] };
  assert.equal(body.count, 5);
  assert.equal(body.options.find((o) => o.recommended)?.id, r.card);
  for (const id of old) assert.deepEqual(status(r, id), ['resolved', 'asked-again']);
  assert.equal(r.k.count('transactions'), 0);
  r.sql.close();
});

test('A QUESTION HELD FOR ANOTHER REASON IS LEFT TO ITSELF: only a row asked with its account empty is folded', async () => {
  const r = await record(OLD('card'));
  assert.ok(r.k.write('accounts', r.card, { last4: '1234' } as never, { actor: 'p_1' }).ok);
  /* THE AMOUNT IS NOT READ; THE ACCOUNT IS. */
  const odd = text(r.k, 'Your card ending 1234 was used on 05/10/2026 at HALDEN COFFEE.');
  assert.equal(odd.state, 'review');
  text(r.k, bare('1234', 'ORCHARD PRINTS', '5.00'));
  assert.deepEqual(status(r, odd.suggestion!), ['open', null]);
  r.sql.close();
});
