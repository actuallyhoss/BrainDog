/**
 * A handoff is an object that closes (AGT-C05, `src/handoff.ts`): a step left in a place is offered as `next` while it
 * is young and nobody has passed it over, and it closes taken, dropped or expired, its words kept on the run.
 *
 * On the real kernel and `node:sqlite`, with the writes sent through the write path as the record will send them.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { EXPIRED_NOTE, HANDOFF_STATES, PASSED_ACTIVE_MS, closePassed, drop, expire, openHandoffs, passedNote, take, type HandoffWrite } from '../src/handoff.ts';
import { openRecord, type Declaration, type SessionHints, type WriteContext } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 8, 12);
const MIN = 60_000;
const DAY = 86_400_000;

const TASKS: Declaration = {
  id: 'register.tasks',
  kind: 'register',
  body: { id: 'tasks', name: 'Tasks', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] },
};

const HERE = { repo: 'braindog' };
const as = (client_id: string, more: SessionHints = {}): WriteContext => ({
  actor: 'agent:claude',
  principal: { kind: 'token', token: 't_1' },
  session: { client_id, agent: 'claude', repo: HERE.repo, ...more },
});
const ok = (r: { ok: boolean }): void => assert.ok(r.ok, JSON.stringify(r));
const fixOf = (r: unknown): string => (r as { refusal?: { fix?: string } }).refusal?.fix ?? JSON.stringify(r);
const codeOf = (r: unknown): string | undefined => (r as { refusal?: { code?: string } }).refusal?.code;
const lastLine = (sql: NodeSql, id: string): { note: string | null; actor: string } => {
  const got = sql.one<{ note: string | null; actor: string }>(
    "SELECT note, actor FROM event WHERE target = ? AND kind = 'state' ORDER BY ts DESC, id DESC LIMIT 1",
    `entry:${id}`,
  );
  return { note: got?.note ?? null, actor: got?.actor ?? '' };
};

async function record() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  ok(await k.install([TASKS]));
  /* THE WRITE THE RECORD WILL WIRE, as the sweep's `move` is wired: the move, the kernel's own fields and the note. */
  const write: HandoffWrite = (id, c) =>
    k.update('session', id, c.state ? { state: c.state } : {}, {
      actor: c.actor,
      cascade: false,
      stamp: c.stamp,
      ...(c.note === null ? {} : { note: c.note }),
    });
  /** A run as it stands, by its spoken name. */
  const row = (spoken: string) => {
    const got = k.get(spoken)!;
    return { id: got.id, state: got.state, fields: got.fields };
  };
  /** A session that works here and is still at it. */
  const work = (client: string, more: SessionHints = {}) => {
    ok(k.create('tasks', { what: `Work of ${client}` }, as(client, more)));
    const run = k.findRun({ client_id: client }, 't_1')!;
    return { id: run.id, spoken: `S${String(run.seq)}` };
  };
  /** A session that works here, leaves `next` and closes, so its run waits as a handoff. */
  const leave = (client: string, next: string, more: SessionHints = {}) => {
    const run = work(client, more);
    ok(k.update('session', run.spoken, { next }, as(client, more)));
    ok(k.endRun(as(client, more), {}));
    return { ...run, ...row(run.spoken) };
  };
  return { sql, clock, k, write, leave, work, row };
}

test('TAKEN: a step left here is offered as next, and taking it closes the run that left it, the words kept', async () => {
  const { sql, clock, k, write, leave, work, row } = await record();
  const s1 = leave('claude', 'Run the gates');
  assert.equal(s1.state, 'handoff');
  clock.advance(5 * MIN);
  const s2 = work('codex', { agent: 'codex' });

  const open = openHandoffs(sql, HERE, s2.id, clock.now());
  assert.deepEqual(
    open.map((h) => [h.spoken, h.mark, h.next, h.agent, h.age_s]),
    [[s1.spoken, 'next', 'Run the gates', 'claude', 300]],
  );
  assert.deepEqual(openHandoffs(sql, HERE, s1.id, clock.now()), [], 'a run is never offered its own step');
  assert.deepEqual(openHandoffs(sql, { repo: 'elsewhere' }, s2.id, clock.now()), [], 'a step is offered only where it was left');
  assert.deepEqual(openHandoffs(sql, {}, s2.id, clock.now()), [], 'a caller who is nowhere is offered nothing');

  const took = take(sql, s2, s1.spoken, clock.now(), write);
  ok(took);
  assert.deepEqual(took.ok && took.value, { left: s1.spoken, next: 'Run the gates', agent: 'claude' });
  const left = row(s1.spoken);
  assert.equal(left.state, 'done');
  assert.equal(left.fields.closed_as, 'taken');
  assert.equal(left.fields.taken_by, s2.spoken);
  assert.equal(left.fields.closed_at, new Date(clock.now()).toISOString());
  assert.equal(left.fields.next, 'Run the gates', 'the step stays on the row');
  assert.equal(row(s2.spoken).fields.took, s1.spoken);
  assert.deepEqual(lastLine(sql, s1.id), { note: `Taken by ${s2.spoken}.`, actor: s2.spoken });
  assert.deepEqual(openHandoffs(sql, HERE, null, clock.now()), [], 'a taken step is no longer open');
  sql.close();
});

test('THE RACE: of two agents taking one step the first wins, and the second is told who took it, by name', async () => {
  const { sql, clock, write, leave, work, row } = await record();
  const s1 = leave('claude', 'Ship the briefing');
  const s2 = work('codex', { agent: 'codex' });
  const s3 = work('cursor', { agent: 'cursor' });
  clock.advance(2 * MIN);

  ok(take(sql, s2, s1.spoken, clock.now(), write));
  clock.advance(3 * MIN);
  const second = take(sql, s3, s1.id, clock.now(), write);
  assert.equal(second.ok, false);
  assert.equal(codeOf(second), 'TRANSITION_ILLEGAL');
  assert.equal(fixOf(second), `${s2.spoken} already took this 3 minutes ago.`);
  assert.equal(row(s1.spoken).fields.taken_by, s2.spoken, 'the second take changed nothing');
  assert.equal(row(s3.spoken).fields.took, undefined, 'and the loser took nothing');

  /* A run's own step is not its to take, and a run that is no run is said so. */
  const s4 = leave('gemini', 'Mine', { agent: 'gemini' });
  const own = take(sql, s4, s4.spoken, clock.now(), write);
  assert.equal(codeOf(own), 'FORBIDDEN');
  assert.equal(row(s4.spoken).state, 'handoff');
  assert.equal(codeOf(take(sql, s3, 'S99', clock.now(), write)), 'ROW_UNKNOWN');
  /* A run still at work has left nothing to take. */
  assert.equal(fixOf(take(sql, s2, s3.spoken, clock.now(), write)), `${s3.spoken} is still working and has no step waiting.`);
  assert.deepEqual([...HANDOFF_STATES], ['idle', 'handoff', 'done']);
  sql.close();
});

test('DROPPED: a step is closed with a reason in words, and with none it is refused and stays open', async () => {
  const { sql, clock, write, leave, work, row } = await record();
  const s1 = leave('claude', 'Wire the old export');
  const s2 = work('codex', { agent: 'codex' });

  const bare = drop(sql, s2.spoken, s1.spoken, '   ', clock.now(), write);
  assert.equal(codeOf(bare), 'REQUIRED_MISSING');
  assert.equal(row(s1.spoken).state, 'handoff');

  clock.advance(MIN);
  ok(drop(sql, s2.spoken, s1.spoken, ' The export was removed in batch 33. ', clock.now(), write));
  const left = row(s1.spoken);
  assert.equal(left.state, 'done');
  assert.equal(left.fields.closed_as, 'dropped');
  assert.equal(left.fields.closed_at, new Date(clock.now()).toISOString());
  assert.equal(left.fields.taken_by, undefined);
  assert.equal(left.fields.next, 'Wire the old export', 'the step stays on the row');
  assert.deepEqual(lastLine(sql, s1.id), { note: 'The export was removed in batch 33.', actor: s2.spoken });

  /* A person closes a step from the app the same way, signed as herself. */
  const s3 = leave('cursor', 'Ask about the logo', { agent: 'cursor' });
  ok(drop(sql, 'person:ana', s3.spoken, 'Done by hand.', clock.now(), write));
  assert.equal(lastLine(sql, s3.id).actor, 'person:ana');

  clock.advance(2 * 60 * MIN);
  const late = take(sql, s2, s1.spoken, clock.now(), write);
  assert.equal(fixOf(late), 'This step was dropped 2 hours ago.');
  assert.equal(codeOf(drop(sql, s2.spoken, s1.spoken, 'again', clock.now(), write)), 'TRANSITION_ILLEGAL');
  sql.close();
});

test('SEVEN DAYS: a step under a week old is next, and one a day older reads earlier, still open to take', async () => {
  const { sql, clock, write, leave, work, row } = await record();
  const s1 = leave('claude', 'Finish the import');
  clock.advance(7 * DAY - MIN);
  const s2 = work('codex', { agent: 'codex' });
  assert.deepEqual(openHandoffs(sql, HERE, s2.id, clock.now()).map((h) => h.mark), ['next']);
  clock.advance(2 * MIN);
  const [old] = openHandoffs(sql, HERE, s2.id, clock.now());
  assert.equal(old?.mark, 'earlier');
  assert.equal(old?.age_s, 7 * 86_400 + 60);
  ok(take(sql, s2, s1.spoken, clock.now(), write));
  assert.equal(row(s1.spoken).fields.closed_as, 'taken', 'an earlier step can still be taken');
  sql.close();
});

test('PASSED OVER: a later run that wrote and ended here makes a step earlier; one that wrote nothing, a helper, a run elsewhere, one working alongside or one still working does not', async () => {
  const { sql, clock, k, leave, work } = await record();
  /* A run already at work here before the step was left. */
  work('alongside');
  clock.advance(MIN);
  const s1 = leave('claude', 'Run the gates');
  const marks = (self: string | null = null) => openHandoffs(sql, HERE, self, clock.now()).map((h) => [h.spoken, h.mark]);
  /* It ends after the step was left, but was never handed it. */
  clock.advance(MIN);
  ok(k.endRun(as('alongside'), {}));
  assert.deepEqual(marks(), [[s1.spoken, 'next']]);

  /* A session that opened here and wrote nothing, then quit. */
  clock.advance(MIN);
  const idle = work('quiet');
  sql.exec("UPDATE entry SET fields = json_set(fields, '$.wrote', 0) WHERE id = ?", idle.id);
  ok(k.endRun(as('quiet'), {}));
  /* A helper of another session, which wrote and ended with it. */
  const parent = work('parent');
  work('helper', { parent: parent.spoken });
  ok(k.endRun(as('helper', { parent: parent.spoken }), {}));
  /* A run that worked in another repository and quit. */
  work('away', { repo: 'elsewhere' });
  ok(k.endRun(as('away', { repo: 'elsewhere' }), {}));
  /* And the parent still at work. */
  assert.deepEqual(marks(), [[s1.spoken, 'next']]);

  /* A session that worked here and quit without taking it passed it over. */
  clock.advance(MIN);
  ok(k.endRun(as('parent'), {}));
  assert.deepEqual(marks(), [[s1.spoken, 'earlier']]);

  /* A newer step left here is next, newest first, and the passed-over one is still listed. */
  clock.advance(MIN);
  const s9 = leave('cursor', 'Ship the card', { agent: 'cursor' });
  assert.deepEqual(marks(), [[s9.spoken, 'next'], [s1.spoken, 'earlier']]);
  sql.close();
});

test('THIRTY DAYS: the sweep closes a step nobody took, with its note, its words kept, once', async () => {
  const { sql, clock, write, leave, work, row } = await record();
  const s1 = leave('claude', 'Rename the export');
  clock.advance(2 * DAY);
  const s2 = leave('codex', 'Draw the run panel', { agent: 'codex' });
  clock.advance(28 * DAY + MIN);

  assert.equal(expire(sql, clock.now(), write), 1);
  const gone = row(s1.spoken);
  assert.equal(gone.state, 'done');
  assert.equal(gone.fields.closed_as, 'expired');
  assert.equal(gone.fields.closed_at, new Date(clock.now()).toISOString());
  assert.equal(gone.fields.next, 'Rename the export', 'the step stays on the row');
  assert.deepEqual(lastLine(sql, s1.id), { note: EXPIRED_NOTE, actor: 'system' });
  assert.equal(EXPIRED_NOTE, 'Nobody took this step in thirty days.');
  assert.equal(row(s2.spoken).state, 'handoff', 'a step twenty-eight days old stays open');
  assert.equal(expire(sql, clock.now(), write), 0, 'a second sweep in the same hour closes nothing');

  const s3 = work('cursor', { agent: 'cursor' });
  assert.deepEqual(openHandoffs(sql, HERE, s3.id, clock.now()).map((h) => [h.spoken, h.mark]), [[s2.spoken, 'earlier']]);
  assert.equal(fixOf(take(sql, s3, s1.spoken, clock.now(), write)), 'Nobody took this step in thirty days, so it closed just now.');

  /* Exactly thirty days old is not over thirty: it stays open until it is. */
  clock.advance(2 * DAY - MIN);
  assert.equal(expire(sql, clock.now(), write), 0);
  assert.equal(row(s2.spoken).state, 'handoff');
  clock.advance(1);
  assert.equal(expire(sql, clock.now(), write), 1);
  assert.deepEqual(openHandoffs(sql, HERE, s3.id, clock.now()), []);
  sql.close();
});

test('PASSED IN THE HOUR: a later run here still at work twelve hours past a step passes it over, and the sweep closes it', async () => {
  const { sql, clock, k, write, leave, work, row } = await record();
  const s1 = leave('claude', 'Run full CI on master');
  const away = leave('elsewhere', 'Fix the other repo', { repo: 'other' });
  clock.advance(MIN);
  const s2 = work('codex', { agent: 'codex' });
  work('far', { repo: 'other' });
  const marks = () => openHandoffs(sql, HERE, null, clock.now()).map((h) => [h.spoken, h.mark]);
  /* Under twelve hours of work past the step, a run still at it was maybe handed it, so nothing closes. */
  clock.advance(PASSED_ACTIVE_MS - 2 * MIN);
  ok(k.create('tasks', { what: 'More work' }, as('codex', { agent: 'codex' })));
  ok(k.create('tasks', { what: 'More work there' }, as('far', { repo: 'other' })));
  assert.deepEqual(marks(), [[s1.spoken, 'next']]);
  assert.equal(closePassed(sql, clock.now(), write), 0);

  clock.advance(2 * MIN);
  ok(k.create('tasks', { what: 'Still at it' }, as('codex', { agent: 'codex' })));
  assert.deepEqual(marks(), [[s1.spoken, 'earlier']]);
  /* THE HOURLY SWEEP closes it (`purge`), and only the step passed over here. */
  k.purge();
  const gone = row(s1.spoken);
  assert.equal(gone.state, 'done');
  assert.equal(gone.fields.closed_as, 'dropped');
  assert.equal(gone.fields.next, 'Run full CI on master', 'the step stays on the row');
  assert.deepEqual(lastLine(sql, s1.id), { note: passedNote(s2.spoken), actor: 'system' });
  assert.equal(row(away.spoken).state, 'handoff', 'a run in another place passes nothing over');
  assert.deepEqual(marks(), []);
  assert.equal(closePassed(sql, clock.now(), write), 0, 'a second sweep closes nothing');
  sql.close();
});
