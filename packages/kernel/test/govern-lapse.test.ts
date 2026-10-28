/**
 * Three suggestions wait at most, a stronger one takes the weakest one's place, and one nobody answered by its day is
 * taken back by the asker itself.
 *
 * WHAT WAS MEASURED BEFORE THIS. A fourth open arrangement was refused however strong it was, and nothing an asker filed
 * had a day it ended, so suggestions sat unanswered for five days and more and Decide filled with old ones.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf } from '@braindog/ports';

import { DISPLACED_NOTE, lapsedNote, sweepLapsed, type Filed } from '../src/govern.ts';
import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { PROJECTS } from '../../../fixtures/names.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 12);
const DAY_MS = 86_400_000;

const projects: Declaration = {
  id: 'register.projects',
  kind: 'register',
  body: { id: 'projects', name: 'Projects', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never,
};

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(await k.install([projects]));
  return { k, sql };
}

const value = <T>(out: { ok: boolean }): T => {
  assert.ok(out.ok, fixOf(out as never));
  return (out as unknown as { value: T }).value;
};
const refusal = (out: { ok: boolean }) => {
  assert.equal(out.ok, false, 'this was supposed to be refused');
  return (out as unknown as { refusal: { code: string; fix: string; at?: string } }).refusal;
};

/** One arrangement adding one project, its own cause, and whatever `rank` and `lapses` it is given. */
const arrange = (n: number, extra: Record<string, unknown> = {}) => ({
  question: `Add ${PROJECTS[n % PROJECTS.length]}?`,
  body_kind: 'arrange' as const,
  cause: `offer.test-${n}`,
  body: { why: ['It came up three times this week.'], rows: [{ register: 'projects', fields: { what: `${PROJECTS[n % PROJECTS.length]} ${n}` } }], ...extra },
});

const file = (k: Kernel, n: number, extra: Record<string, unknown>, by = 'S1') => value<Filed>(k.propose(arrange(n, extra), by)).id;
const state = (sql: NodeSql, id: string) => ({ ...sql.one<{ status: string; resolved_as: string | null }>('SELECT status, resolved_as FROM suggestion WHERE id = ?', id) });
const closing = (sql: NodeSql, id: string) => ({ ...sql.one<{ actor: string; note: string }>("SELECT actor, note FROM event WHERE kind = 'resolve' AND target = ?", `suggestion:${id}`) });
const decisions = (sql: NodeSql) => sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM decision')!.n;

test('A STRONGER FOURTH TAKES THE WEAKEST ONE`S PLACE: ranked 3, 5 and 7, a 6 takes back the 3 and is filed', async () => {
  const { k, sql } = await record();
  const [three, five, seven] = [3, 5, 7].map((rank, i) => file(k, i, { rank }));
  const six = file(k, 3, { rank: 6 });
  assert.notEqual(six, three);
  assert.deepEqual(state(sql, three!), { status: 'resolved', resolved_as: 'withdrawn' });
  assert.deepEqual(closing(sql, three!), { actor: 'S1', note: DISPLACED_NOTE });
  for (const id of [five!, seven!, six]) assert.deepEqual(state(sql, id), { status: 'open', resolved_as: null });
  /* Neither a yes nor a no: no decision is written. */
  assert.equal(decisions(sql), 0);
});

test('A WEAKER FOURTH IS REFUSED AS BEFORE, and so is one with no rank', async () => {
  const { k, sql } = await record();
  for (const [i, rank] of [3, 5, 7].entries()) file(k, i, { rank });
  for (const extra of [{ rank: 2 }, { rank: 3 }, {}]) {
    const r = refusal(k.propose(arrange(4, extra), 'S1'));
    assert.equal(r.code, 'OUT_OF_BOUNDS');
    assert.match(r.fix, /3 open arrangements is the most/u);
  }
  assert.equal(sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM suggestion WHERE status = 'open'")!.n, 3);
});

test('ONE WITH NO RANK IS THE WEAKEST, and the oldest of two alike goes first', async () => {
  const { k, sql } = await record();
  const plain = file(k, 0, {});
  const alsoPlain = file(k, 1, {});
  file(k, 2, { rank: 4 });
  file(k, 3, { rank: 0 });
  assert.equal(state(sql, plain).resolved_as, 'withdrawn');
  assert.equal(state(sql, alsoPlain).status, 'open');
});

test('ANOTHER OPENER`S IS NEVER DISPLACED: a run of another key, and one another agent joined', async () => {
  const { k, sql } = await record();
  const theirs = file(k, 0, { rank: 1 }, 'S2');
  file(k, 1, { rank: 5 });
  file(k, 2, { rank: 7 });
  /* The asker's own weakest is the 5, which a 6 outranks; the other key's 1 stays where it is. */
  file(k, 3, { rank: 6 });
  assert.equal(state(sql, theirs).status, 'open');

  /* The asker's own, joined by another agent, is that agent's ask too and stays open for the owner. */
  const { k: k2, sql: sql2 } = await record();
  const joined = file(k2, 0, { rank: 1 });
  value(k2.propose(arrange(0, { rank: 1 }), 'S2'));
  file(k2, 1, { rank: 8 });
  file(k2, 2, { rank: 9 });
  const r = refusal(k2.propose(arrange(3, { rank: 6 }), 'S1'));
  assert.equal(r.code, 'OUT_OF_BOUNDS');
  assert.equal(state(sql2, joined).status, 'open');
});

test('THE SWEEP TAKES BACK ONE NOBODY ANSWERED BY ITS DAY, with its note, and leaves a fresh one and one put off', async () => {
  const { k, sql } = await record();
  const lapsing = file(k, 0, { rank: 5, lapses: '2026-10-11' });
  const fresh = file(k, 1, { rank: 5, lapses: '2026-10-20' });
  const forever = file(k, 2, { rank: 5 });

  /* On its day it still waits; the day after, it is taken back. */
  assert.deepEqual(sweepLapsed({ sql, mint: () => crypto.randomUUID() }, NOW + 2 * DAY_MS, 'UTC'), { withdrawn: [] });
  const later = NOW + 3 * DAY_MS;
  assert.deepEqual(sweepLapsed({ sql, mint: () => crypto.randomUUID() }, later, 'UTC'), { withdrawn: [lapsing] });
  assert.deepEqual(state(sql, lapsing), { status: 'resolved', resolved_as: 'withdrawn' });
  assert.deepEqual(closing(sql, lapsing), { actor: 'S1', note: lapsedNote('2026-10-12') });
  assert.equal(lapsedNote('2026-10-12'), 'Taken back on 12 October: nobody answered it.');
  for (const id of [fresh, forever]) assert.equal(state(sql, id).status, 'open');
  /* No decision row, and a second sweep finds nothing. */
  assert.equal(decisions(sql), 0);
  assert.deepEqual(sweepLapsed({ sql, mint: () => crypto.randomUUID() }, later, 'UTC'), { withdrawn: [] });

  /* One the person put off past today waits for the day they chose. */
  sql.exec('UPDATE suggestion SET defer_until = ? WHERE id = ?', new Date(NOW + 30 * DAY_MS).toISOString(), fresh);
  assert.deepEqual(sweepLapsed({ sql, mint: () => crypto.randomUUID() }, NOW + 12 * DAY_MS, 'UTC').withdrawn, []);
});

test('THE DAY IS THE RECORD`S ZONE: late on the 11th in UTC is already the 12th in Auckland', async () => {
  const { k, sql } = await record();
  const id = file(k, 0, { lapses: '2026-10-11' });
  const late = Date.UTC(2026, 9, 11, 20);
  assert.deepEqual(sweepLapsed({ sql, mint: () => crypto.randomUUID() }, late, 'UTC').withdrawn, []);
  assert.deepEqual(sweepLapsed({ sql, mint: () => crypto.randomUUID() }, late, 'Pacific/Auckland').withdrawn, [id]);
});

test('A BAD RANK OR LAPSES IS REFUSED WITH ITS FIX', async () => {
  const { k } = await record();
  for (const lapses of ['2026-09-31', 'next week', 20261020, '2026-10-08']) {
    const r = refusal(k.propose(arrange(0, { lapses }), 'S1'));
    assert.deepEqual([r.code, r.at], ['VALUE_MALFORMED', 'body.lapses'], String(lapses));
    assert.match(r.fix, /YYYY-MM-DD/u);
  }
  /* A day already past says which day is today. */
  assert.match(refusal(k.propose(arrange(0, { lapses: '2026-10-08' }), 'S1')).fix, /from today, 2026-10-09/u);
  for (const rank of [-1, 1001, 2.5, '7']) {
    const r = refusal(k.propose(arrange(0, { rank }), 'S1'));
    assert.deepEqual([r.code, r.at], ['VALUE_MALFORMED', 'body.rank'], String(rank));
    assert.match(r.fix, /whole number from 0 to 1000/u);
  }
  /* Today itself is a day still to come. */
  value(k.propose(arrange(1, { rank: 0, lapses: '2026-10-09' }), 'S1'));
});
