/**
 * A text a drawn pattern reads only in part waits in the shape's one question, never in one of its own.
 *
 * BEFORE: the header's ceiling held every text a model's pattern read, and each held text opened a `rowset` question of
 * its own, so a shape of thirty texts was thirty questions. Now a text the pattern reads in part, or that its ceiling
 * holds, joins the shape's one open pattern question, whose count and samples grow; once he said yes and no question is
 * open it waits, and nothing new is asked by itself. Senders, shops and amounts are invented here.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Arrived, type Declaration, type Kernel } from '../src/index.ts';
import { patternCause } from '../src/ingest.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 15, 9);
const SHAPE = 'email:alerts@larchbank.example';

const PAYMENTS: Declaration = {
  id: 'register.payments',
  kind: 'register',
  body: {
    id: 'payments',
    name: 'Payments',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'shop', type: 'text' },
    ],
  } as never,
};

/* As a draft comes back: at `needs-review` and `skip`, whatever the model said (`slash/src/jobs.ts`). */
const DRAFTED = {
  id: 'ingest.larch-paid',
  kind: 'ingest',
  body: {
    ingest: 'larch-paid',
    channel: 'email',
    match: { all: [{ field: 'body', contains: 'Paid ' }] },
    extract: { what: { after: 'Paid ' }, shop: { after: 'Shop ' } },
    writes: { register: 'payments', confidence: 'needs-review' },
    dedupe: ['what'],
    on_conflict: 'skip',
  },
};

type Rig = { k: Kernel; sql: NodeSql };

async function rig(): Promise<Rig> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([PAYMENTS])).ok);
  return { k, sql };
}

let sent = 0;
const text = (k: Kernel, body: string): Arrived => {
  const r = k.arrive({ channel: 'email', headers: { From: 'Larch Bank <alerts@larchbank.example>', Subject: 'Notice' }, body, sha256: `pattern-part-${++sent}` }) as { ok: boolean; value: Arrived };
  assert.ok(r.ok, JSON.stringify(r));
  return r.value;
};
const whole = (k: Kernel, n: number): Arrived => text(k, `Paid ${n}.00\nShop Nile Books`);
/** A text the pattern reads only in part: the amount, and no shop. */
const part = (k: Kernel, n: number): Arrived => text(k, `Paid ${n}.00`);

const ask = (k: Kernel, samples: string[]): string => {
  const made = k.propose({ question: 'A pattern for the messages nothing has parsed', body_kind: 'pattern', body: { ingest: DRAFTED, samples }, cause: patternCause(SHAPE) }, 'slash');
  assert.ok(made.ok, JSON.stringify(made));
  return (made as { value: { id: string } }).value.id;
};

async function accept(r: Rig, q: string): Promise<string> {
  const out = r.k.decide(q, { decide: { option: 'accept', reason: 'that is the bank' } }, 'p_1');
  assert.ok(out.ok, JSON.stringify(out));
  const put = await r.k.install([out.value.install as Declaration], out.value.expects ?? out.value.expect, { actor: 'p_1', suggestion: q } as never);
  assert.ok(put.ok, JSON.stringify(put));
  return String(out.value.decision);
}

const openAsked = (sql: NodeSql): { id: string; body_kind: string }[] =>
  sql.all<{ id: string; body_kind: string }>("SELECT id, body_kind FROM suggestion WHERE status = 'open' ORDER BY rowid");
const bodyOf = (sql: NodeSql, q: string): Record<string, unknown> =>
  JSON.parse(sql.one<{ body: string }>('SELECT body FROM suggestion WHERE id = ?', q)!.body) as Record<string, unknown>;

test('A YES WITH ONE TEXT READ IN PART files the rest and says the one still waits', async () => {
  const r = await rig();
  const raws = [whole(r.k, 1), whole(r.k, 2), whole(r.k, 3), part(r.k, 4), whole(r.k, 5)].map((a) => a.raw);
  const q = ask(r.k, raws.slice(0, 3));
  await accept(r, q);
  assert.equal(r.k.count('payments'), 4);
  assert.equal(bodyOf(r.sql, q).said, 'Filed 4 with this pattern. 1 still waits: it reads only part of it.');
  const held = r.sql.one<{ state: string }>('SELECT state FROM inbox_raw WHERE id = ?', raws[3]!);
  assert.equal(held?.state, 'review');
  assert.deepEqual(openAsked(r.sql), [], 'the text read in part opened a question of its own');

  /* AND ONE MORE READ IN PART, with no question open, waits and asks nothing. */
  const later = part(r.k, 6);
  assert.equal(later.state, 'review');
  assert.equal(later.suggestion, undefined);
  assert.deepEqual(openAsked(r.sql), []);
  r.sql.close();
});

test('A FIFTH READ IN PART JOINS THE OPEN QUESTION, whose count and samples grow, and its yes files it', async () => {
  const r = await rig();
  const raws = [1, 2, 3, 4].map((n) => whole(r.k, n).raw);
  const q = ask(r.k, raws.slice(0, 3));
  /* THE PATTERN IN BEFORE THE YES, as an Undo leaves it: installed, with its question open again. */
  assert.ok((await r.k.install([DRAFTED as Declaration])).ok);
  const fifth = part(r.k, 5);
  assert.equal(fifth.state, 'review');
  assert.equal(fifth.suggestion, q, 'the text read in part did not join the shape question');
  const sixth = whole(r.k, 6);
  assert.equal(sixth.suggestion, q, 'a text the ceiling held asked on its own beside the shape question');
  assert.deepEqual(openAsked(r.sql).map((o) => `${o.id} ${o.body_kind}`), [`${q} pattern`], 'a text opened a question of its own');
  const body = bodyOf(r.sql, q);
  assert.deepEqual(body.samples, [...raws.slice(0, 3), fifth.raw, sixth.raw]);
  assert.deepEqual(body.joined, [fifth.raw, sixth.raw]);
  assert.equal(body.count, 5);

  await accept(r, q);
  assert.equal(r.k.count('payments'), 5, 'the yes left out a text that joined the question');
  assert.equal(bodyOf(r.sql, q).said, 'Filed 5 with this pattern. 1 still waits: it reads only part of it.');
  r.sql.close();
});

test('AFTER AN UNDO a text read in part joins the question the Undo put back', async () => {
  const r = await rig();
  const raws = [1, 2, 3].map((n) => whole(r.k, n).raw);
  const q = ask(r.k, raws);
  const decision = await accept(r, q);
  const plan = r.k.undoPlan({ decision });
  assert.ok(plan.ok, JSON.stringify(plan));
  assert.ok(r.k.undoApply({ decision }, plan.value.hash, 'p_1').ok);
  const later = part(r.k, 4);
  assert.equal(later.suggestion, q);
  assert.deepEqual(openAsked(r.sql).map((o) => o.id), [q]);
  r.sql.close();
});

test('NOTHING WAITED: a yes after every text was dealt with says so', async () => {
  const r = await rig();
  const raws = [1, 2, 3].map((n) => whole(r.k, n).raw);
  const q = ask(r.k, raws);
  r.sql.exec("UPDATE inbox_raw SET state = 'ignored'");
  await accept(r, q);
  assert.equal(r.k.count('payments'), 0);
  assert.equal(bodyOf(r.sql, q).said, 'Nothing waited.');
  r.sql.close();
});
