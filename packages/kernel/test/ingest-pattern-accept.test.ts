/**
 * A shape's one pattern question, answered, carried out (ENG-B07, "the one question and its batch").
 *
 * BEFORE: a shape with three alike texts was owed a draft, the draft came back as one question, and saying yes to it
 * installed the pattern and carried nothing out. The texts that waited still waited, and the pattern, drafted at the
 * `needs-review` ceiling, asked about every later text one at a time. Now one yes files everything the pattern reads,
 * in the decision's batch so one Undo puts it all back, and the next alike text files with no question. A no files
 * nothing and the shape is never owed again. Senders, shops and amounts are invented here.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Arrived, type Declaration, type Kernel } from '../src/index.ts';
import { approvedPattern, owedShapes, patternCause } from '../src/ingest.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 15, 9);
const SHAPE = 'email:notices@pinebank.example';

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

/* The pattern as a draft comes back: held at `needs-review` and `skip`, whatever the model said (`slash/src/jobs.ts`). */
const DRAFTED = {
  id: 'ingest.pinebank-paid',
  kind: 'ingest',
  body: {
    ingest: 'pinebank-paid',
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
  const installed = await k.install([PAYMENTS]);
  assert.ok(installed.ok, JSON.stringify(installed));
  return { k, sql };
}

let sent = 0;
const text = (k: Kernel, body: string, from = 'Pine Bank <notices@pinebank.example>'): Arrived => {
  const r = k.arrive({ channel: 'email', headers: { From: from, Subject: 'Notice' }, body, sha256: `pattern-accept-${++sent}` }) as { ok: boolean; value: Arrived };
  assert.ok(r.ok, JSON.stringify(r));
  return r.value;
};

/** A text the draft reads whole: an amount and a shop. */
const whole = (k: Kernel, n: number): Arrived => text(k, `Paid ${n}.00\nShop Corner Shop`);

/** The question a draft comes back as, filed the way the queue files one: by Slash, under the shape's cause. */
const ask = (k: Kernel, samples: string[]): string => {
  const made = k.propose({ question: 'A pattern for the messages nothing has parsed', body_kind: 'pattern', body: { ingest: DRAFTED, samples }, cause: patternCause(SHAPE) }, 'slash');
  assert.ok(made.ok, JSON.stringify(made));
  return (made as { value: { id: string } }).value.id;
};

/** His yes, and the install the record's `land` does after it. Answers the decision and its batch. */
async function accept(r: Rig, q: string): Promise<{ decision: string; batch: string }> {
  const out = r.k.decide(q, { decide: { option: 'accept', reason: 'that is the bank' } }, 'p_1');
  assert.ok(out.ok, JSON.stringify(out));
  const put = await r.k.install([out.value.install as Declaration], out.value.expects ?? out.value.expect, { actor: 'p_1', suggestion: q } as never);
  assert.ok(put.ok, JSON.stringify(put));
  return { decision: String(out.value.decision), batch: String(out.value.batch) };
}

const states = (sql: NodeSql): Record<string, number> =>
  Object.fromEntries(sql.all<{ state: string; n: number }>('SELECT state, count(*) AS n FROM inbox_raw GROUP BY state').map((r) => [r.state, r.n]));

const openAsked = (sql: NodeSql): { id: string; body_kind: string }[] =>
  sql.all<{ id: string; body_kind: string }>("SELECT id, body_kind FROM suggestion WHERE status = 'open' ORDER BY rowid");

const bodyOf = (sql: NodeSql, q: string): Record<string, unknown> =>
  JSON.parse(sql.one<{ body: string }>('SELECT body FROM suggestion WHERE id = ?', q)!.body) as Record<string, unknown>;

/** Four alike texts and the one question their draft came back as. */
async function four(): Promise<Rig & { raws: string[]; q: string }> {
  const r = await rig();
  const raws = [1, 2, 3, 4].map((n) => whole(r.k, n).raw);
  const drafts = r.sql.all("SELECT id FROM outbox WHERE kind = 'infer.draft'");
  assert.equal(drafts.length, 1, 'four alike texts queued more than one draft');
  const q = ask(r.k, raws.slice(0, 3));
  assert.deepEqual(openAsked(r.sql).map((o) => o.body_kind), ['pattern'], 'four alike texts did not make one question');
  return { ...r, raws, q };
}

test('FOUR ALIKE TEXTS MAKE ONE QUESTION, and his yes files all four in one batch', async () => {
  const r = await four();
  assert.equal(states(r.sql).untriaged, 4);
  const { batch } = await accept(r, r.q);
  assert.equal(r.k.count('payments'), 4, 'the yes filed nothing that waited');
  assert.deepEqual(states(r.sql), { matched: 4 });
  assert.deepEqual(openAsked(r.sql), [], 'filing what waited opened a question per text');
  const said = bodyOf(r.sql, r.q).said;
  assert.equal(said, 'Filed 4 with this pattern.');
  assert.equal(approvedPattern(r.sql, 'pinebank-paid'), r.q);
  const rows = r.sql.all<{ batch: string | null }>("SELECT batch FROM event WHERE kind = 'create' AND target_kind = 'entry' AND actor = 'ingest:pinebank-paid'");
  assert.equal(rows.length, 4);
  assert.ok(rows.every((e) => e.batch === batch), 'the rows the yes filed are not in its decision batch');
  r.sql.close();
});

test('ONE UNDO PUTS THE FOUR BACK TO WAITING, and a second yes files them again', async () => {
  const r = await four();
  const { decision } = await accept(r, r.q);
  const plan = r.k.undoPlan({ decision });
  assert.ok(plan.ok, JSON.stringify(plan));
  assert.ok(r.k.undoApply({ decision }, plan.value.hash, 'p_1').ok);
  assert.equal(r.k.count('payments'), 0, 'the undo left rows the yes filed');
  assert.deepEqual(states(r.sql), { untriaged: 4 }, 'the undo did not put the texts back to waiting');
  assert.deepEqual(openAsked(r.sql).map((o) => o.id), [r.q], 'the undo did not put the question back in Decide');
  assert.equal(bodyOf(r.sql, r.q).said, undefined);
  assert.equal(approvedPattern(r.sql, 'pinebank-paid'), null, 'the approval outlived the undo');

  /* AGAIN, with the pattern already installed: `decide` carries it out itself. */
  const out = r.k.decide(r.q, { decide: { option: 'accept', reason: 'yes, again' } }, 'p_1');
  assert.ok(out.ok, JSON.stringify(out));
  assert.equal(r.k.count('payments'), 4);
  assert.equal(bodyOf(r.sql, r.q).said, 'Filed 4 with this pattern.');
  r.sql.close();
});

test('A FIFTH ALIKE TEXT FILES WITH NO QUESTION once he said yes', async () => {
  const r = await four();
  await accept(r, r.q);
  const fifth = whole(r.k, 5);
  assert.equal(fifth.state, 'matched');
  assert.equal(fifth.confidence, 'exact');
  assert.equal(fifth.suggestion, undefined);
  assert.equal(r.k.count('payments'), 5);
  assert.deepEqual(openAsked(r.sql), []);
  assert.deepEqual(owedShapes(r.sql, NOW), []);
  r.sql.close();
});

test('A NO FILES NOTHING, and the shape is never owed again', async () => {
  const r = await four();
  const out = r.k.decide(r.q, { decide: { option: 'reject', reason: 'not this bank' } }, 'p_1');
  assert.ok(out.ok, JSON.stringify(out));
  assert.equal(out.value.install, undefined);
  assert.equal(r.k.count('payments'), 0);
  assert.deepEqual(states(r.sql), { untriaged: 4 });
  whole(r.k, 5);
  whole(r.k, 6);
  assert.deepEqual(owedShapes(r.sql, NOW), [], 'a no was asked again');
  assert.equal(r.sql.all("SELECT id FROM outbox WHERE kind = 'infer.draft'").length, 1, 'a no queued a second draft');
  assert.deepEqual(openAsked(r.sql), []);
  r.sql.close();
});

test('ANSWERING TWICE FILES ONCE: a later install of the pattern and a second press carry nothing out again', async () => {
  const r = await four();
  await accept(r, r.q);
  /* A NEW VERSION OF THE PATTERN hands it to `rerunHeld` again, which looks for a yes not carried out yet. */
  const fixed = { ...DRAFTED, body: { ...DRAFTED.body, skip: [{ when: { all: [{ field: 'body', contains: 'TEST ONLY' }] }, reason: 'a test message' }] } };
  const again = await r.k.install([fixed as Declaration], undefined, { actor: 'p_1' } as never);
  assert.ok(again.ok, JSON.stringify(again));
  const carried = r.k.decide(r.q, { decide: { option: 'accept', reason: 'once more' } }, 'p_1');
  assert.equal(carried.ok, false, 'a question already answered was answered a second time');
  assert.equal(r.k.count('payments'), 4);
  const notes = r.sql.all("SELECT id FROM event WHERE kind = 'note' AND target = ? AND note LIKE 'Filed%'", `suggestion:${r.q}`);
  assert.equal(notes.length, 1, 'the yes was carried out twice');
  r.sql.close();
});

test('THE VERSION HE SAID YES TO FILES WHAT WAITED, never an older pattern of the same name already in', async () => {
  const r = await four();
  /* AN OLDER VERSION UNDER THE DRAFT'S NAME, which reads the amount and no shop. */
  const older = { ...DRAFTED, body: { ...DRAFTED.body, extract: { what: { after: 'Paid ' } } } };
  assert.ok((await r.k.install([older as Declaration])).ok);
  const { batch } = await accept(r, r.q);
  assert.equal(r.k.count('payments'), 4);
  const made = r.sql.all<{ n: number }>("SELECT count(*) AS n FROM event WHERE kind = 'create' AND target_kind = 'entry' AND batch = ?", batch);
  assert.equal(made[0]?.n, 4, 'what the yes filed is not in its decision batch');
  const shopsFiled = r.sql.all<{ shop: unknown }>("SELECT json_extract(fields, '$.shop') AS shop FROM entry WHERE register = 'payments' AND deleted_at IS NULL").map((e) => e.shop);
  assert.deepEqual(shopsFiled, ['Corner Shop', 'Corner Shop', 'Corner Shop', 'Corner Shop'], 'the yes filed through the older version');
  assert.equal(bodyOf(r.sql, r.q).said, 'Filed 4 with this pattern.');
  r.sql.close();
});
