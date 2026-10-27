/**
 * The three units of batch 37 as the kernel's own verbs answer them: the door's marks, a fault in place of a
 * question, and a question asked once by its cause.
 *
 * THROUGH THE PUBLIC VERBS ONLY, so a wire that is cut fails here even when each module's own test still passes: a
 * mark that never reaches the table, a dead letter that files a question again, a cause dropped on the way to govern.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf } from '@braindog/ports';
import { openRecord, type Declaration, type SessionHints, type WriteContext } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 12);
const DAY = 86_400_000;

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.refusal ? `${x.refusal.code}: ${x.refusal.fix}` : 'refused');
  return x.value;
};

const NOTES: Declaration = {
  id: 'register.notes',
  kind: 'register',
  body: { id: 'notes', name: 'Notes', title: 'body', fields: [{ id: 'body', type: 'text' }] },
};

const asToken = (token: string, session: SessionHints = {}): WriteContext => ({ actor: 'p_1', principal: { kind: 'token', token }, session });

const OPTIONS = { options: [{ id: 'yes', label: 'Yes', because: 'It is due' }, { id: 'no', label: 'No', because: 'It is not' }] };

const open = async () => {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  assert.ok((await k.install([NOTES])).ok);
  return { sql, clock, k };
};

const runs = (sql: ReturnType<typeof openSqlite>) =>
  sql.one<{ n: number }>("SELECT count(*) AS n FROM entry WHERE register = 'session'")?.n ?? 0;

/* ── the door's marks ────────────────────────────────────────────────────── */

test('A MARK IS COUNTED against the caller\'s run, and one with no run marks its token and opens none', async () => {
  const { sql, k } = await open();
  const claude = asToken('t_1', { client_id: 'c-1' });
  assert.ok(k.create('notes', { body: 'From a run' }, claude).ok, 'the run did not open');
  const before = runs(sql);

  value(k.heard(claude, { kind: 'hello', build: '1.4.0', client: 'claude-code' }));
  value(k.heard(claude, { kind: 'listed', n: 21 }));
  value(k.heard(claude, { kind: 'called', n: 3 }));
  value(k.heard(asToken('t_2'), { kind: 'hello', build: '1.4.0' }));
  assert.equal(runs(sql), before, 'a mark opened a run');

  const marked = sql.all<{ run: string }>('SELECT DISTINCT run FROM door_mark ORDER BY run').map((r) => r.run);
  assert.deepEqual(marked, ['S1', 'token:t_2']);

  const signs = value<{ hello: number; listed: number; called: number; calls: number }>(k.doorMarks());
  assert.equal(signs.hello, 2);
  assert.equal(signs.listed, 1);
  assert.equal(signs.called, 1);
  assert.equal(signs.calls, 3);
  sql.close();
});

test('A MARK OFF THE LIST IS REFUSED in a sentence, and the sweep lets a month-old mark go', async () => {
  const { sql, clock, k } = await open();
  const out = k.heard(asToken('t_1'), { kind: 'gossip' } as never);
  assert.equal(out.ok, false);
  assert.equal(!out.ok && 'refusal' in out ? out.refusal.at : null, 'kind');

  value(k.heard(asToken('t_1'), { kind: 'hello' }));
  clock.advance(31 * DAY);
  k.purge();
  assert.equal(sql.one<{ n: number }>('SELECT count(*) AS n FROM door_mark')?.n, 0, 'the hourly sweep kept a mark past thirty days');
  sql.close();
});

/* ── a fault is never a question ─────────────────────────────────────────── */

test('A DEAD LETTER IS ONE FAULT AND NO QUESTION, retryFault queues it again, and its job done clears it', async () => {
  const { sql, clock, k } = await open();
  const openQuestions = () => sql.one<{ n: number }>("SELECT count(*) AS n FROM suggestion WHERE status = 'open'")?.n ?? 0;
  const asked = openQuestions();

  k.outbox('notify.email', { to: 'someone' });
  for (let i = 0; i < 8; i++) {
    const [job] = k.leaseOutbox(['notify.email'], 1);
    assert.ok(job, `attempt ${i + 1} found no job`);
    value(k.ackOutbox({ id: job.id, state: 'failed', error: 'The mail host said no', leasedUntil: job.leasedUntil }));
    if (i === 7) break;
    /* PAST THE RUNG'S OWN TIME, and the retry it armed fired, so the job is back where a deliverer leases it. */
    clock.advance(2 * DAY);
    await k.drain();
  }

  const { faults } = value<{ faults: { cause: string; said: string }[] }>(k.faults());
  assert.deepEqual(faults.map((f) => f.cause), ['outbox#notify.email']);
  assert.ok(faults[0]!.said.length > 0, 'a fault with no sentence');
  assert.equal(openQuestions(), asked, 'a dead letter filed a question');

  const retried = value<{ cause: string; queued: number }>(k.retryFault({ actor: 'p_1' }, { cause: 'outbox#notify.email' }));
  assert.deepEqual(retried, { cause: 'outbox#notify.email', queued: 1 });
  assert.equal(value<{ faults: unknown[] }>(k.faults()).faults.length, 1, 'trying again cleared the fault before the job ran');

  const [again] = k.leaseOutbox(['notify.email'], 1);
  assert.ok(again, 'the retried job was not queued');
  value(k.ackOutbox({ id: again.id, state: 'done', leasedUntil: again.leasedUntil }));
  assert.deepEqual(value<{ faults: unknown[] }>(k.faults()).faults, [], 'a job done did not clear its fault');

  const none = k.retryFault({ actor: 'p_1' }, { cause: 'outbox#notify.email' });
  assert.equal(none.ok, false, 'a fault that is not open was tried again');
  sql.close();
});

/* ── a question has a cause ──────────────────────────────────────────────── */

test('ONE CAUSE PROPOSED TWICE FILES ONE QUESTION, and the second answers the first one\'s id', async () => {
  const { sql, k } = await open();
  const ask = { question: 'Send the invoice today?', body_kind: 'options' as const, body: OPTIONS, cause: 'invoice#7' };
  const first = value<{ id: string; joined?: boolean }>(k.propose(ask, asToken('t_1', { client_id: 'c-1' })));
  const second = value<{ id: string; joined?: boolean }>(k.propose(ask, asToken('t_2', { client_id: 'c-2' })));
  assert.equal(second.id, first.id);
  assert.equal(second.joined, true);
  assert.equal(
    sql.one<{ n: number }>("SELECT count(*) AS n FROM suggestion WHERE status = 'open' AND cause = 'invoice#7'")?.n,
    1,
    'the second proposal filed a question of its own',
  );
  sql.close();
});

test('THE OPENER WITHDRAWS ITS QUESTION, and another key cannot', async () => {
  const { sql, k } = await open();
  const opener = asToken('t_1', { client_id: 'c-1' });
  const { id } = value<{ id: string }>(k.propose({ question: 'Archive the old notes?', body_kind: 'options', body: OPTIONS }, opener));

  const before = runs(sql);
  const stranger = k.withdraw(asToken('t_2', { client_id: 'c-2' }), { id });
  assert.equal(stranger.ok, false, 'another key took the question back');
  assert.equal(!stranger.ok && 'refusal' in stranger ? stranger.refusal.code : null, 'FORBIDDEN');
  assert.equal(runs(sql), before, 'a refused withdraw opened a run for the key it refused');
  assert.equal(k.withdraw(opener, { id: '' }).ok, false, 'a withdraw that names no question was taken');

  const out = k.withdraw(opener, { id });
  assert.ok(out.ok, fixOf(out));
  assert.deepEqual({ ...sql.one<{ status: string; resolved_as: string }>('SELECT status, resolved_as FROM suggestion WHERE id = ?', id) }, { status: 'resolved', resolved_as: 'withdrawn' });
  sql.close();
});
