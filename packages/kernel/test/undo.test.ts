/**
 * Undo on the server (`undo.ts`): what one write, one decision or one agent's run changed, put back from the log.
 *
 * Every case is read the way a person meets it: the plan's lines in names, never an id, then the record after the
 * apply. A value somebody changed since stays theirs, a withheld amount is never guessed at, a note stays, a message
 * not yet sent is stopped, and a plan that went stale is refused rather than applied over what moved.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf, type Result } from '@braindog/ports';

import { ulids } from '../src/ids.ts';
import { openRecord, type Declaration, type Entry, type Kernel, type WriteContext } from '../src/index.ts';
import { undoApply, undoPlan, type UndoParts, type UndoPlan, type UndoScope } from '../src/undo.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 6, 9);
const MIN = 60_000;

const TASKS: Declaration = {
  id: 'register.tasks',
  kind: 'register',
  body: {
    id: 'tasks',
    name: 'Tasks',
    one: 'task',
    title: 'name',
    state: 'state',
    fields: [
      { id: 'name', type: 'text', required: true },
      {
        id: 'state',
        type: 'enum',
        values: ['open', 'doing', 'done'],
        default: 'open',
        transitions: { open: { to: ['doing', 'done'] }, doing: { to: ['open', 'done'] }, done: { to: ['doing'] } },
      },
      { id: 'due', type: 'day', label: 'Due' },
      { id: 'cost', type: 'money' },
      { id: 'project', type: 'ref', to: 'projects' },
    ],
  } as never,
};

const PROJECTS: Declaration = {
  id: 'register.projects',
  kind: 'register',
  body: { id: 'projects', name: 'Projects', one: 'project', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] } as never,
};

const MARA: WriteContext = { actor: 'p_mara' };
const AGENT: WriteContext = { actor: 'p_agent' };

type Rec = { k: Kernel; sql: NodeSql; clock: ReturnType<typeof fixedClock>; parts: UndoParts };

async function record(): Promise<Rec> {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  value(await k.install([PROJECTS, TASKS]));
  sql.exec("INSERT INTO person (id, email, name) VALUES ('p_mara', 'mara@example.com', 'Mara'), ('p_agent', NULL, 'Robin')");
  return { k, sql, clock, parts: { sql, clock, mint: ulids(clock.now), transaction: k.transaction, write: k.write } };
}

function value<T>(out: Result<T> | { ok: boolean }): T {
  assert.ok(out.ok, fixOf(out as never));
  return (out as { value: T }).value;
}

/** The batch a row's newest write made: the first line of that write, or the batch it was given. */
const lastBatch = (sql: NodeSql, id: string): string =>
  sql.one<{ k: string }>('SELECT coalesce(batch, id) AS k FROM event WHERE target = ? ORDER BY rowid DESC LIMIT 1', `entry:${id}`)!.k;

const plan = (r: Rec, scope: UndoScope): UndoPlan => value(undoPlan(r.sql, scope));

/** No ULID, no `tasks#1`, no `S1` in anything a person reads. */
function readable(lines: readonly string[]): void {
  for (const line of lines) {
    assert.doesNotMatch(line, /[0-9A-HJKMNP-TV-Z]{26}/, `an id in "${line}"`);
    assert.doesNotMatch(line, /#\d|\bS\d+\b|p_\w+/, `a handle in "${line}"`);
    assert.doesNotMatch(line, /—/, `an em dash in "${line}"`);
  }
}

test('A CREATE IS UNDONE AS A DELETE, in names, and a second look says it was undone already', async () => {
  const r = await record();
  const made = value<Entry>(r.k.create('tasks', { name: 'Ship the beta' }, AGENT));
  const scope = { batch: lastBatch(r.sql, made.id) };

  const p = plan(r, scope);
  assert.deepEqual(p.lines, ['Removes "Ship the beta" from Tasks.']);
  assert.equal(p.say, 'Puts back one change.');
  assert.equal(p.steps[0]!.do, 'remove');
  readable([p.say, ...p.lines]);

  const done = value(undoApply(r.parts, scope, p.hash, 'p_mara'));
  assert.equal(done.put, 1);
  assert.equal(done.say, 'Put back one change.');
  assert.ok(r.k.get(made.id, { includeDeleted: true })!.deleted_at, 'the task is deleted');

  /* THE LADDER'S MARK: who made it and the kind it was. */
  const mark = r.sql.one<{ actor: string; kinds: string; undone_by: string; by_batch: string }>('SELECT actor, kinds, undone_by, by_batch FROM undone WHERE batch = ?', scope.batch);
  assert.equal(mark?.actor, 'p_agent');
  assert.deepEqual(JSON.parse(mark!.kinds), ['tasks:add']);
  assert.equal(mark?.undone_by, 'p_mara');
  assert.equal(mark?.by_batch, done.batch);
  assert.deepEqual(done.undone, [{ batch: scope.batch, actor: 'p_agent', agent: null, kinds: ['tasks:add'] }]);

  const again = plan(r, scope);
  assert.equal(again.steps.length, 0);
  assert.equal(again.already, true);
  assert.equal(again.say, 'This was undone already.');
  r.sql.close();
});

test('AN EDIT GOES BACK TO ITS FROM ONLY WHILE THE ROW STILL HOLDS ITS TO, and a value changed since stays, naming who', async () => {
  const r = await record();
  const made = value<Entry>(r.k.create('tasks', { name: 'Fix login', due: '2026-10-08' }, MARA));
  r.clock.advance(10 * MIN);
  const moved = value<Entry>(r.k.update('tasks', made.id, { state: 'doing', due: '2026-10-20' }, AGENT));
  const scope = { batch: lastBatch(r.sql, made.id) };
  r.clock.advance(10 * MIN);
  value(r.k.update('tasks', made.id, { due: '2026-10-22' }, { ...MARA, version: moved.version }));

  const p = plan(r, scope);
  assert.deepEqual(p.lines, ['Moves "Fix login" back to Open (now Doing).', 'Leaves "Fix login" as it is: Mara has changed due since.']);
  assert.equal(p.say, 'Puts back one change. Leaves one as it is.');
  assert.deepEqual(
    p.steps.map((s) => [s.do, s.label, s.from, s.to]),
    [['set', 'state', 'Open', 'Doing']],
  );
  readable(p.lines);

  const done = value(undoApply(r.parts, scope, p.hash, 'p_mara'));
  assert.equal(done.put, 1);
  const now = r.k.get(made.id)!;
  assert.equal(now.fields.state, 'open');
  assert.equal(now.fields.due, '2026-10-22', 'his later date is kept');
  /* THE UNDO IS ITS OWN BATCH, signed by who pressed it, with the rules off, and it says so. */
  const line = r.sql.one<{ actor: string; batch: string | null; id: string; note: string | null; kind: string }>(
    'SELECT actor, batch, id, note, kind FROM event WHERE target = ? ORDER BY rowid DESC LIMIT 1',
    `entry:${made.id}`,
  );
  assert.equal(line?.kind, 'state');
  assert.equal(line?.actor, 'p_mara');
  assert.equal(line?.batch, done.batch);
  r.sql.close();
});

test('A VALUE CHANGED AND CHANGED BACK IN BETWEEN BY SOMEBODY ELSE is left, since the earliest from is no longer what it was before', async () => {
  const r = await record();
  const made = value<Entry>(r.k.create('tasks', { name: 'Draft', due: '2026-10-08' }, MARA));
  r.clock.advance(10 * MIN);
  /* A RUN'S TWO WRITES, with Mara's between them, are one scope only for a run; one batch is one write. */
  const one = value<Entry>(r.k.update('tasks', made.id, { due: '2026-10-09' }, { actor: 'S7' }));
  r.clock.advance(MIN);
  const two = value<Entry>(r.k.update('tasks', made.id, { due: '2026-10-10' }, { ...MARA, version: one.version }));
  r.clock.advance(MIN);
  value(r.k.update('tasks', made.id, { due: '2026-10-11' }, { actor: 'S7', version: two.version }));

  const p = plan(r, { run: 'S7' });
  assert.deepEqual(p.lines, ['Leaves "Draft" as it is: Mara changed due in between.']);
  assert.equal(p.say, 'Nothing can be put back. One change is left as it is.');
  r.sql.close();
});

test('TAG AND UNTAG SWAP, element by element', async () => {
  const r = await record();
  const made = value<Entry>(r.k.create('tasks', { name: 'Tidy', tags: ['home', 'later'] }, MARA));
  r.clock.advance(10 * MIN);
  value(r.k.update('tasks', made.id, { tags: ['home', 'urgent'] }, AGENT));
  const scope = { batch: lastBatch(r.sql, made.id) };

  const p = plan(r, scope);
  assert.deepEqual(p.lines.sort(), ['Puts the "later" tag back on "Tidy".', 'Takes the "urgent" tag off "Tidy".']);
  value(undoApply(r.parts, scope, p.hash, 'p_mara'));
  assert.deepEqual([...(r.k.get(made.id)!.fields.tags as string[])].sort(), ['home', 'later']);
  r.sql.close();
});

test('A DELETE IS UNDONE AS A RESTORE, and a restore already made is left alone', async () => {
  const r = await record();
  const made = value<Entry>(r.k.create('tasks', { name: 'Old idea' }, MARA));
  r.clock.advance(10 * MIN);
  value(r.k.update('tasks', made.id, { deleted_at: true }, { ...AGENT, version: made.version }));
  const scope = { batch: lastBatch(r.sql, made.id) };

  const p = plan(r, scope);
  assert.deepEqual(p.lines, ['Brings back "Old idea" in Tasks.']);
  value(undoApply(r.parts, scope, p.hash, 'p_mara'));
  assert.equal(r.k.get(made.id)!.deleted_at, null);

  const again = plan(r, scope);
  assert.deepEqual(again.lines, ['Leaves "Old idea" as it is: it is already back.']);
  r.sql.close();
});

test('A ROW THE UNDONE WRITE MADE STAYS WHEN SOMEBODY HAS WORKED ON IT SINCE', async () => {
  const r = await record();
  const made = value<Entry>(r.k.create('tasks', { name: 'Call the bank' }, AGENT));
  const scope = { batch: lastBatch(r.sql, made.id) };
  r.clock.advance(10 * MIN);
  value(r.k.update('tasks', made.id, { due: '2026-10-09' }, MARA));

  const p = plan(r, scope);
  assert.deepEqual(p.lines, ['Leaves "Call the bank" as it is: Mara has changed it since.']);
  assert.equal(p.steps.length, 0);
  r.sql.close();
});

test('AN AMOUNT THE LOG WITHHELD IS NEVER GUESSED AT, and a move the list does not allow back is not promised', async () => {
  const r = await record();
  const made = value<Entry>(r.k.create('tasks', { name: 'Pay rent', cost: { amount: 120_000, currency: 'GBP' } }, MARA));
  r.clock.advance(10 * MIN);
  value(r.k.update('tasks', made.id, { cost: { amount: 130_000, currency: 'GBP' } }, AGENT));
  const money = plan(r, { batch: lastBatch(r.sql, made.id) });
  assert.deepEqual(money.lines, ['Leaves "Pay rent" as it is: the record keeps no copy of the earlier cost.']);

  /* done → doing only, so a task an agent moved straight from open to done cannot be walked back to open. */
  r.clock.advance(MIN);
  value(r.k.update('tasks', made.id, { state: 'done' }, AGENT));
  const moved = plan(r, { batch: lastBatch(r.sql, made.id) });
  assert.deepEqual(moved.lines, ['Leaves "Pay rent" as it is: Tasks does not let it move from Done back to Open.']);
  r.sql.close();
});

test('NOTES STAY, and a link back to a row deleted since is left', async () => {
  const r = await record();
  const kiln = value<Entry>(r.k.create('projects', { name: 'Kiln' }, MARA));
  const launch = value<Entry>(r.k.create('projects', { name: 'Launch' }, MARA));
  const made = value<Entry>(r.k.create('tasks', { name: 'Glaze', project: kiln.id }, MARA));
  r.clock.advance(10 * MIN);
  value(r.k.update('tasks', made.id, { project: launch.id }, AGENT));
  const batch = lastBatch(r.sql, made.id);
  r.sql.exec(
    "INSERT INTO event (id, ts, actor, kind, target, target_kind, note, batch) VALUES ('01JNOTE000000000000000000A', ?, 'rule:chase', 'note', ?, 'entry', 'Moved to Launch.', ?)",
    new Date(r.clock.now()).toISOString(),
    `entry:${made.id}`,
    batch,
  );

  const p = plan(r, { batch });
  assert.deepEqual(p.lines, ['Sets project on "Glaze" back to Kiln (now Launch).', 'The note stays.']);
  assert.equal(p.notes, 1);

  value(r.k.update('projects', kiln.id, { deleted_at: true }, MARA));
  const later = plan(r, { batch });
  assert.deepEqual(later.lines, ['Leaves "Glaze" as it is: "Kiln" has been deleted since.', 'The note stays.']);
  r.sql.close();
});

test('A PLAN THAT WENT STALE IS REFUSED, and the plan read again applies', async () => {
  const r = await record();
  const made = value<Entry>(r.k.create('tasks', { name: 'Write docs', due: '2026-10-08' }, MARA));
  r.clock.advance(10 * MIN);
  value(r.k.update('tasks', made.id, { name: 'Write the docs', due: '2026-10-09' }, AGENT));
  const scope = { batch: lastBatch(r.sql, made.id) };
  const seen = plan(r, scope);
  assert.equal(seen.steps.length, 2);

  r.clock.advance(MIN);
  value(r.k.update('tasks', made.id, { due: '2026-10-12' }, MARA));
  const stale = undoApply(r.parts, scope, seen.hash, 'p_mara');
  assert.equal(stale.ok, false);
  assert.equal(!stale.ok && 'refusal' in stale ? stale.refusal.code : '', 'PLAN_STALE');
  assert.equal(r.k.get(made.id)!.fields.name, 'Write the docs', 'nothing was written');

  const fresh = plan(r, scope);
  assert.deepEqual(fresh.lines, ['Sets name on "Write the docs" back to "Write docs" (now "Write the docs").', 'Leaves "Write the docs" as it is: Mara has changed due since.']);
  value(undoApply(r.parts, scope, fresh.hash, 'p_mara'));
  assert.equal(r.k.get(made.id)!.fields.name, 'Write docs');
  r.sql.close();
});

test('AN UNSENT MESSAGE THE WRITE QUEUED IS STOPPED, and one already gone is named as gone', async () => {
  const r = await record();
  const made = value<Entry>(r.k.create('tasks', { name: 'Invoice Acme' }, AGENT));
  const scope = { batch: lastBatch(r.sql, made.id) };
  const at = new Date(r.clock.now()).toISOString();
  r.sql.exec(
    "INSERT INTO outbox (id, created, kind, payload, state, attempts) VALUES ('ob1', ?, 'pull.fetch', ?, 'pending', 0), ('ob2', ?, 'pull.fetch', ?, 'done', 1)",
    at,
    JSON.stringify({ channel: 'call', ingest: 'billing.send', rule: 'send', entry: made.id }),
    at,
    JSON.stringify({ channel: 'call', ingest: 'billing.log', rule: 'log', entry: made.id }),
  );

  const p = plan(r, scope);
  assert.deepEqual(p.lines, [
    'Removes "Invoice Acme" from Tasks.',
    'Stops a call to another app before it goes out.',
    'Leaves a call to another app: it has already gone out.',
  ]);
  value(undoApply(r.parts, scope, p.hash, 'p_mara'));
  const ob = r.sql.one<{ state: string; payload: string }>("SELECT state, payload FROM outbox WHERE id = 'ob1'");
  assert.equal(ob?.state, 'done');
  assert.ok((JSON.parse(ob!.payload) as { cancelled?: string }).cancelled, 'it says when it was stopped');
  r.sql.close();
});

test('A DECISION IS UNDONE BY THE BATCH ITS ACCEPT WROTE, with a note on the decision and the filer marked', async () => {
  const r = await record();
  const B = '01JDECIDEBATCH000000000000';
  const at = new Date(r.clock.now()).toISOString();
  r.sql.exec(
    "INSERT INTO suggestion (id, body_kind, body, status, opened_by, opened_at) VALUES ('Q1', 'rowset', '{}', 'resolved', 'S3', ?)",
    at,
  );
  const a = value<Entry>(r.k.create('tasks', { name: 'Book venue' }, { actor: 'p_mara', batch: B }));
  const b = value<Entry>(r.k.create('tasks', { name: 'Send invites' }, { actor: 'p_mara', batch: B }));
  r.sql.exec("INSERT INTO event (id, ts, actor, kind, target, target_kind, to_v, batch) VALUES ('01JDECIDE00000000000000000', ?, 'p_mara', 'decide', 'decision:D4', 'decision', '{}', ?)", at, B);
  r.sql.exec("INSERT INTO event (id, ts, actor, kind, target, target_kind, to_v, batch) VALUES ('01JRESOLVE0000000000000000', ?, 'p_mara', 'resolve', 'suggestion:Q1', 'suggestion', 'addressed', ?)", at, B);

  const p = plan(r, { decision: 'D4' });
  assert.deepEqual(p.lines.sort(), ['Removes "Book venue" from Tasks.', 'Removes "Send invites" from Tasks.']);
  const done = value(undoApply(r.parts, { decision: 'D4' }, p.hash, 'p_mara'));
  assert.equal(done.put, 2);
  assert.ok(r.k.get(a.id, { includeDeleted: true })!.deleted_at && r.k.get(b.id, { includeDeleted: true })!.deleted_at);
  assert.deepEqual(done.undone, [{ batch: B, actor: 'S3', agent: null, kinds: ['tasks:add'] }]);
  const note = r.sql.one<{ note: string }>("SELECT note FROM event WHERE target = 'decision:D4' AND kind = 'note'");
  assert.equal(note?.note, 'Mara undid this. Put back 2 changes.');

  const unknown = undoPlan(r.sql, { decision: 'D99' });
  assert.equal(!unknown.ok && 'refusal' in unknown ? unknown.refusal.code : '', 'ROW_UNKNOWN');
  r.sql.close();
});

test("A RUN IS UNDONE WHOLE: its writes, the run's own row left alone, a note on it, and the ladder told its agent", async () => {
  const r = await record();
  r.sql.exec("INSERT INTO token (id, person_id, hash, scope, created_at) VALUES ('t_cc', 'p_mara', 'h', 'write', '2026-10-01T00:00:00.000Z')");
  const as: WriteContext = { actor: 'p_mara', principal: { kind: 'token', token: 't_cc' }, session: { client_id: 'cc', host: 'h', repo: 'braindog' } };
  const one = value<Entry>(r.k.create('tasks', { name: 'Refactor auth' }, as));
  r.clock.advance(10 * MIN);
  const kept = value<Entry>(r.k.create('tasks', { name: 'Keep me' }, MARA));
  r.clock.advance(10 * MIN);
  value(r.k.update('tasks', kept.id, { state: 'doing' }, as));
  const run = r.sql.one<{ a: string }>("SELECT actor AS a FROM event WHERE target = ? AND kind = 'create'", `entry:${one.id}`)!.a;
  assert.match(run, /^S\d+$/);

  const p = plan(r, { run });
  assert.deepEqual(p.lines, ['Moves "Keep me" back to Open (now Doing).', 'Removes "Refactor auth" from Tasks.']);
  readable(p.lines);
  const done = value(undoApply(r.parts, { run }, p.hash, 'p_mara'));
  assert.equal(done.put, 2);
  assert.equal(r.k.get(kept.id)!.fields.state, 'open');
  assert.ok(r.k.get(one.id, { includeDeleted: true })!.deleted_at);
  for (const mark of done.undone) assert.equal(mark.agent, 't_cc');
  assert.deepEqual([...new Set(done.undone.flatMap((m) => m.kinds))].sort(), ['tasks:add', 'tasks:move:doing']);

  const session = r.sql.one<{ id: string }>("SELECT id FROM entry WHERE register = 'session' AND seq = ?", Number(run.slice(1)))!;
  assert.equal(r.k.get(session.id)!.deleted_at, null, "the run's own row is not touched");
  const note = r.sql.one<{ note: string; batch: string }>("SELECT note, batch FROM event WHERE target = ? AND kind = 'note'", `entry:${session.id}`);
  assert.equal(note?.note, 'Mara undid this. Put back 2 changes.');
  assert.equal(note?.batch, done.batch);

  /* AND THE UNDO IS ITSELF ONE BATCH, so it can be undone in turn. */
  const redo = plan(r, { batch: done.batch });
  assert.ok(redo.lines.includes('Moves "Keep me" back to Doing (now Open).'), redo.lines.join(' | '));
  assert.ok(redo.lines.includes('Brings back "Refactor auth" in Tasks.'), redo.lines.join(' | '));
  assert.ok(!redo.lines.includes('The note stays.'), "the note on the run's own row is its own");
  r.sql.close();
});

test('A STEP THE WRITE PATH REFUSES WHEN IT COMES TO IT is left with its own sentence, and the rest still goes back', async () => {
  const r = await record();
  value(
    await r.k.install([
      {
        id: 'register.codes',
        kind: 'register',
        body: { id: 'codes', name: 'Codes', one: 'code', title: 'code', fields: [{ id: 'code', type: 'text', required: true, unique: true }, { id: 'note', type: 'text' }] } as never,
      },
    ]),
  );
  const a = value<Entry>(r.k.create('codes', { code: 'Spring' }, MARA));
  const b = value<Entry>(r.k.create('codes', { code: 'Autumn' }, MARA));
  r.clock.advance(10 * MIN);
  const B = '01JRUNBATCH000000000000000';
  value(r.k.update('codes', a.id, { deleted_at: true }, { ...AGENT, batch: B, version: a.version }));
  value(r.k.update('codes', b.id, { note: 'old' }, { ...AGENT, batch: B }));
  /* SOMEBODY TAKES THE CODE while the first is deleted, so bringing it back would hold one code twice. */
  value(r.k.create('codes', { code: 'Spring' }, MARA));

  const p = plan(r, { batch: B });
  assert.equal(p.steps.length, 2);
  const done = value(undoApply(r.parts, { batch: B }, p.hash, 'p_mara'));
  assert.equal(done.put, 1);
  assert.equal(done.skipped.length, 1);
  assert.equal(done.skipped[0]!.line, 'Leaves "Spring" as it is: another one already has that code.');
  readable(done.lines);
  assert.ok(r.k.get(a.id, { includeDeleted: true })!.deleted_at, 'still deleted, nothing half done');
  assert.equal(r.k.get(b.id)!.fields.note, undefined);
  r.sql.close();
});

test('A ROW LEFT AS SOMEBODY MADE IT KEEPS ITS MESSAGE, a rule since is "a rule" mid-sentence, and a hidden list says nothing', async () => {
  const r = await record();
  const made = value<Entry>(r.k.create('tasks', { name: 'Chase Acme' }, AGENT));
  const scope = { batch: lastBatch(r.sql, made.id) };
  r.sql.exec(
    "INSERT INTO outbox (id, created, kind, payload, state, attempts) VALUES ('ob1', ?, 'pull.fetch', ?, 'pending', 0)",
    new Date(r.clock.now()).toISOString(),
    JSON.stringify({ channel: 'call', ingest: 'billing.send', rule: 'send', entry: made.id }),
  );
  r.clock.advance(10 * MIN);
  value(r.k.update('tasks', made.id, { due: '2026-10-09' }, { actor: 'rule:chase' }));

  const p = plan(r, scope);
  assert.deepEqual(p.lines, ['Leaves "Chase Acme" as it is: a rule has changed it since.']);
  value(undoApply(r.parts, scope, p.hash, 'p_mara'));
  assert.equal(r.sql.one<{ state: string }>("SELECT state FROM outbox WHERE id = 'ob1'")?.state, 'pending', 'its message still goes');

  /* A PERSON WHO CANNOT READ TASKS is told nothing of the task, its message or its notes. */
  const hidden = value(undoPlan(r.sql, scope, { reads: (list) => list !== 'tasks' }));
  assert.deepEqual(hidden.lines, []);
  assert.equal(hidden.notes, 0);
  r.sql.close();
});
