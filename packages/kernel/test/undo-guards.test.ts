/**
 * Undo's guards (`undo.ts`), the holes batch 20's audit found: a run the overnight walk placed can be unplaced, a tag a
 * person put back and a value a person set away and back again are theirs, a key from inside a batch is read as the
 * batch, an undone decision's question goes back to Decide, and a second undo of the same batch adds to its mark.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf, type Result } from '@braindog/ports';

import { BACKFILL_ACTOR } from '../src/backfill.ts';
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
      { id: 'state', type: 'enum', values: ['open', 'doing', 'done'], default: 'open' },
      { id: 'due', type: 'day', label: 'Due' },
    ],
  } as never,
};

const CODES: Declaration = {
  id: 'register.codes',
  kind: 'register',
  body: { id: 'codes', name: 'Codes', one: 'code', title: 'code', fields: [{ id: 'code', type: 'text', required: true, unique: true }, { id: 'note', type: 'text' }] } as never,
};

const MARA: WriteContext = { actor: 'p_mara' };
const AGENT: WriteContext = { actor: 'p_agent' };

type Rec = { k: Kernel; sql: NodeSql; clock: ReturnType<typeof fixedClock>; parts: UndoParts };

async function record(): Promise<Rec> {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  value(await k.install([TASKS, CODES]));
  sql.exec("INSERT INTO person (id, email, name) VALUES ('p_mara', 'mara@example.com', 'Mara'), ('p_agent', NULL, 'Robin')");
  return { k, sql, clock, parts: { sql, clock, mint: ulids(clock.now), transaction: k.transaction, write: k.write } };
}

function value<T>(out: Result<T> | { ok: boolean }): T {
  assert.ok(out.ok, fixOf(out as never));
  return (out as { value: T }).value;
}

const lastBatch = (sql: NodeSql, id: string): string =>
  sql.one<{ k: string }>('SELECT coalesce(batch, id) AS k FROM event WHERE target = ? ORDER BY rowid DESC LIMIT 1', `entry:${id}`)!.k;

const plan = (r: Rec, scope: UndoScope): UndoPlan => value(undoPlan(r.sql, scope));

/** No ULID, no handle, no em dash in anything a person reads. */
function readable(lines: readonly string[]): void {
  for (const line of lines) {
    assert.doesNotMatch(line, /[0-9A-HJKMNP-TV-Z]{26}/, `an id in "${line}"`);
    assert.doesNotMatch(line, /#\d|\bS\d+\b|p_\w+|rule:/, `a handle in "${line}"`);
    assert.doesNotMatch(line, /—/, `an em dash in "${line}"`);
  }
}

/** A finished run in no project, as one a hook opened before any project listed where it works. */
const run = (r: Rec, doing: string): Entry => value<Entry>(r.k.create('session', { doing, agent: 'claude', state: 'done', repo: 'kiln' }, { ...MARA, stamp: { project: '' } }));

test('A RUN THE OVERNIGHT WALK PLACED IS UNPLACED BY THE GENERIC UNDO, and the rest of the run is left as it is', async () => {
  const r = await record();
  const one = run(r, 'Fix login');
  const two = run(r, 'Glaze');
  const B = '01JBACKFILLBATCH0000000000';
  /* THE WALK'S OWN WRITE, as `backfill.ts` makes it: an empty patch and the project stamped, one batch for the slice. */
  const w = { actor: BACKFILL_ACTOR, batch: B, cascade: false };
  value(r.k.write('session', one.id, {}, { ...w, version: one.version, stamp: { project: 'Kiln' } }));
  value(r.k.write('session', two.id, { next: 'Fire it' }, { ...w, version: two.version, stamp: { project: 'Kiln' } }));

  const p = plan(r, { batch: B });
  assert.deepEqual(p.lines.sort(), ['Takes "Fix login" out of the Kiln project.', 'Takes "Glaze" out of the Kiln project.']);
  readable([p.say, ...p.lines]);
  const done = value(undoApply(r.parts, { batch: B }, p.hash, 'p_mara'));
  assert.equal(done.put, 2);
  assert.ok(!r.k.get(one.id)!.fields.project, 'back in no project, as it was');
  assert.ok(!r.k.get(two.id)!.fields.project, 'back in no project, as it was');
  assert.equal(r.k.get(two.id)!.fields.next, 'Fire it', 'every other field of a run stays as it is');
  assert.equal(done.undone[0]?.actor, BACKFILL_ACTOR);
  assert.equal(plan(r, { batch: B }).already, true);
  r.sql.close();
});

test('THE OVERNIGHT WALK’S OWN SLICE OF RUNS GOES BACK THROUGH THE GENERIC UNDO', async () => {
  const sql = openSqlite();
  const clock = fixedClock(NOW - 48 * 60 * MIN);
  const k = await openRecord(sql, clock);
  value(
    await k.install([
      {
        id: 'register.things',
        kind: 'register',
        body: {
          id: 'things',
          name: 'Projects',
          title: 'name',
          scopes: { repos: 'repos', folders: 'folders' },
          fields: [
            { id: 'name', type: 'text', required: true },
            { id: 'repos', type: 'list', of: 'text' },
            { id: 'folders', type: 'list', of: 'text' },
          ],
        } as never,
      },
    ]),
  );
  sql.exec("INSERT INTO person (id, email, name) VALUES ('p_mara', 'mara@example.com', 'Mara')");
  /* Runs from before the project listed where it lives, so neither was placed when it opened. */
  for (const doing of ['Fix login', 'Glaze']) value(k.create('session', { doing, agent: 'claude', state: 'done', remote: 'git@github.com:acme/kiln.git', repo: 'kiln' }, MARA));
  value(k.create('things', { name: 'Kiln', repos: ['git@github.com:acme/kiln.git'] }, MARA));
  clock.advance(48 * 60 * MIN);

  const walked = k.backfill();
  assert.equal(walked.runs.wrote, 2);
  const B = walked.runs.batch!;
  const parts: UndoParts = { sql, clock, mint: ulids(clock.now), transaction: k.transaction, write: k.write };
  const p = value<UndoPlan>(undoPlan(sql, { batch: B }));
  assert.deepEqual(p.lines.sort(), ['Takes "Fix login" out of the Kiln project.', 'Takes "Glaze" out of the Kiln project.']);
  value(undoApply(parts, { batch: B }, p.hash, 'p_mara'));
  const placed = sql.all<{ p: string | null }>("SELECT json_extract(fields, '$.project') AS p FROM entry WHERE register = 'session'");
  assert.ok(placed.every((r) => !r.p), 'both runs are back in no project');
  sql.close();
});

test('A PLACEMENT SOMEBODY HAS MOVED SINCE STAYS, and an older bare stamp goes back only while it is the run’s last line', async () => {
  const r = await record();
  const moved = run(r, 'Fix login');
  const B = '01JBACKFILLBATCH0000000001';
  const placed = value<Entry>(r.k.write('session', moved.id, {}, { actor: BACKFILL_ACTOR, batch: B, cascade: false, version: moved.version, stamp: { project: 'Kiln' } }));
  r.clock.advance(10 * MIN);
  value(r.k.write('session', moved.id, {}, { ...MARA, version: placed.version, stamp: { project: 'Lantern' } }));
  assert.deepEqual(plan(r, { batch: B }).lines, ['Leaves "Fix login" as it is: Mara has changed project since.']);

  /* A PLACEMENT FROM BEFORE ITS MOVE WAS A LINE OF ITS OWN: the project set and one line naming no field. */
  const bare = run(r, 'Glaze');
  const C = '01JBACKFILLBATCH0000000002';
  const at = new Date(r.clock.now()).toISOString();
  r.sql.exec("UPDATE entry SET fields = json_set(fields, '$.project', 'Kiln'), version = version + 1 WHERE id = ?", bare.id);
  r.sql.exec("INSERT INTO event (id, ts, actor, kind, target, target_kind, batch) VALUES ('01JBARESTAMP00000000000000', ?, ?, 'edit', ?, 'entry', ?)", at, BACKFILL_ACTOR, `entry:${bare.id}`, C);
  const p = plan(r, { batch: C });
  assert.deepEqual(p.lines, ['Takes "Glaze" out of the Kiln project.']);

  /* The run heard from since: its stamp no longer says the run is as the walk left it. */
  r.clock.advance(MIN);
  value(r.k.write('session', bare.id, { next: 'Fire it' }, { actor: 'S2', version: r.k.get(bare.id)!.version }));
  const later = plan(r, { batch: C });
  assert.equal(later.steps.length, 0);
  assert.equal(later.skipped.length, 1);
  assert.match(later.skipped[0]!.line, /^Leaves "Glaze" as it is: .+ has changed it since\.$/);
  r.sql.close();
});

test('A TAG A PERSON TOOK OFF AND PUT BACK IS THEIRS, and the rest of the batch’s tags still swap', async () => {
  const r = await record();
  const made = value<Entry>(r.k.create('tasks', { name: 'Tidy', tags: ['home'] }, MARA));
  r.clock.advance(10 * MIN);
  value(r.k.update('tasks', made.id, { tags: ['home', 'urgent', 'later'] }, AGENT));
  const scope = { batch: lastBatch(r.sql, made.id) };
  r.clock.advance(MIN);
  value(r.k.update('tasks', made.id, { tags: ['home', 'later'] }, MARA));
  value(r.k.update('tasks', made.id, { tags: ['home', 'later', 'urgent'] }, MARA));

  const p = plan(r, scope);
  assert.deepEqual(p.lines, ['Takes the "later" tag off "Tidy".', 'Leaves "Tidy" as it is: Mara has changed the "urgent" tag since.']);
  readable(p.lines);
  value(undoApply(r.parts, scope, p.hash, 'p_mara'));
  assert.deepEqual([...(r.k.get(made.id)!.fields.tags as string[])].sort(), ['home', 'urgent']);
  r.sql.close();
});

test('A VALUE A PERSON SET AWAY AND BACK AGAIN IS THEIRS, though it reads the same as the undone write left it', async () => {
  const r = await record();
  const made = value<Entry>(r.k.create('tasks', { name: 'Fix login', due: '2026-10-08' }, MARA));
  r.clock.advance(10 * MIN);
  value(r.k.update('tasks', made.id, { due: '2026-10-09' }, AGENT));
  const scope = { batch: lastBatch(r.sql, made.id) };
  r.clock.advance(MIN);
  value(r.k.update('tasks', made.id, { due: '2026-10-12' }, MARA));
  value(r.k.update('tasks', made.id, { due: '2026-10-09' }, MARA));

  const p = plan(r, scope);
  assert.deepEqual(p.lines, ['Leaves "Fix login" as it is: Mara has changed due since.']);
  assert.equal(p.steps.length, 0);
  r.sql.close();
});

test('A KEY FROM INSIDE A BATCH IS READ AS THE BATCH, so all of it goes back and the ladder’s mark is made', async () => {
  const r = await record();
  const made = value<Entry>(r.k.create('tasks', { name: 'Write docs', due: '2026-10-08' }, MARA));
  r.clock.advance(10 * MIN);
  value(r.k.update('tasks', made.id, { name: 'Write the docs', due: '2026-10-09' }, AGENT));
  const lines = r.sql.all<{ id: string; batch: string | null }>('SELECT id, batch FROM event WHERE target = ? ORDER BY rowid DESC LIMIT 2', `entry:${made.id}`);
  const inner = lines.find((l) => l.batch !== null)!;
  const head = inner.batch!;
  assert.notEqual(inner.id, head, 'an event id that is not its batch');

  const p = plan(r, { batch: inner.id });
  assert.equal(p.steps.length, 2, p.lines.join(' | '));
  assert.equal(p.hash, plan(r, { batch: head }).hash, 'the same plan by either key');
  const done = value(undoApply(r.parts, { batch: inner.id }, p.hash, 'p_mara'));
  assert.deepEqual(
    done.undone.map((m) => m.batch),
    [head],
  );
  assert.ok(r.sql.one('SELECT 1 AS y FROM undone WHERE batch = ?', head), 'the mark is keyed by the real batch');
  assert.equal(r.k.get(made.id)!.fields.name, 'Write docs');
  assert.equal(plan(r, { batch: inner.id }).already, true);
  r.sql.close();
});

/** An accepted question and the rows its accept wrote, in one batch, as `govern.ts` writes them. */
function accepted(r: Rec, batch: string, names: string[]): Entry[] {
  const at = new Date(r.clock.now()).toISOString();
  r.sql.exec(
    "INSERT INTO suggestion (id, body_kind, body, status, opened_by, opened_at, resolved_as) VALUES ('SG1', 'rowset', '{}', 'resolved', 'p_agent', ?, 'addressed')",
    at,
  );
  const rows = names.map((name) => value<Entry>(r.k.create('tasks', { name }, { ...MARA, batch })));
  r.sql.exec("INSERT INTO event (id, ts, actor, kind, target, target_kind, to_v, batch) VALUES ('01JDECIDE00000000000000000', ?, 'p_mara', 'decide', 'decision:D1', 'decision', '{}', ?)", at, batch);
  r.sql.exec("INSERT INTO event (id, ts, actor, kind, target, target_kind, to_v, batch) VALUES ('01JRESOLVE0000000000000000', ?, 'p_mara', 'resolve', 'suggestion:SG1', 'suggestion', 'addressed', ?)", at, batch);
  return rows;
}

const question = (r: Rec): { status: string; resolved_as: string | null } => ({
  ...r.sql.one<{ status: string; resolved_as: string | null }>("SELECT status, resolved_as FROM suggestion WHERE id = 'SG1'")!,
});

test('AN UNDONE DECISION PUTS ITS QUESTION BACK IN DECIDE, and one only partly undone is marked undone', async () => {
  const r = await record();
  accepted(r, '01JDECIDEBATCH000000000000', ['Book venue', 'Send invites']);
  const p = plan(r, { decision: 'D1' });
  assert.ok(p.lines.includes('Puts the question back in Decide.'), p.lines.join(' | '));
  const done = value(undoApply(r.parts, { decision: 'D1' }, p.hash, 'p_mara'));
  assert.ok(done.lines.includes('Puts the question back in Decide.'));
  assert.deepEqual(question(r), { status: 'open', resolved_as: null });
  assert.equal(r.sql.one<{ to_v: string }>("SELECT to_v FROM event WHERE target = 'suggestion:SG1' AND kind = 'suggest'")?.to_v, 'reopened');
  r.sql.close();

  const s = await record();
  const [venue] = accepted(s, '01JDECIDEBATCH000000000001', ['Book venue', 'Send invites']);
  s.clock.advance(10 * MIN);
  value(s.k.update('tasks', venue!.id, { due: '2026-10-20' }, MARA));
  const partly = plan(s, { decision: 'D1' });
  assert.ok(!partly.lines.includes('Puts the question back in Decide.'));
  value(undoApply(s.parts, { decision: 'D1' }, partly.hash, 'p_mara'));
  assert.deepEqual(question(s), { status: 'resolved', resolved_as: 'undone' });
  s.sql.close();
});

test('ONLY ONE ROW OF A DECISION TAKEN BACK leaves its question decided and marked undone in part', async () => {
  const r = await record();
  const [venue, invites] = accepted(r, '01JDECIDEBATCH000000000003', ['Book venue', 'Send invites']) as (Entry & { seq: number })[];
  const row = { register: 'tasks', seq: venue!.seq };
  const p = plan(r, { decision: 'D1', row });
  assert.ok(!p.lines.includes('Puts the question back in Decide.'), p.lines.join(' | '));
  value(undoApply(r.parts, { decision: 'D1', row }, p.hash, 'p_mara'));
  assert.ok(r.k.get(venue!.id, { includeDeleted: true })!.deleted_at, 'that one is gone');
  assert.equal(r.k.get(invites!.id)!.deleted_at, null, 'the other stays');
  assert.deepEqual(question(r), { status: 'resolved', resolved_as: 'undone' });
  r.sql.close();
});

test('A SECOND UNDO OF THE SAME BATCH ADDS WHAT IT PUT BACK TO THE MARK the first made', async () => {
  const r = await record();
  const a = value<Entry>(r.k.create('codes', { code: 'Spring' }, MARA));
  const b = value<Entry>(r.k.create('codes', { code: 'Autumn' }, MARA));
  r.clock.advance(10 * MIN);
  const B = '01JRUNBATCH000000000000000';
  value(r.k.update('codes', a.id, { deleted_at: true }, { ...AGENT, batch: B, version: a.version }));
  value(r.k.update('codes', b.id, { note: 'old' }, { ...AGENT, batch: B }));
  /* The code taken while the first is deleted, so its restore is refused the first time. */
  const taken = value<Entry>(r.k.create('codes', { code: 'Spring' }, MARA));

  const first = value(undoApply(r.parts, { batch: B }, plan(r, { batch: B }).hash, 'p_mara'));
  assert.equal(first.put, 1);
  const once = JSON.parse(r.sql.one<{ kinds: string }>('SELECT kinds FROM undone WHERE batch = ?', B)!.kinds) as string[];
  assert.deepEqual(once, first.undone[0]!.kinds);

  value(r.k.update('codes', taken.id, { deleted_at: true }, { ...MARA, version: taken.version }));
  const second = value(undoApply(r.parts, { batch: B }, plan(r, { batch: B }).hash, 'p_mara'));
  assert.equal(second.put, 1);
  assert.equal(r.k.get(a.id)!.deleted_at, null, 'the code is back');
  const twice = JSON.parse(r.sql.one<{ kinds: string }>('SELECT kinds FROM undone WHERE batch = ?', B)!.kinds) as string[];
  assert.deepEqual(twice, [...new Set([...once, ...second.undone[0]!.kinds])].sort());
  assert.ok(twice.length > once.length, `the second undo's kinds are added: ${twice.join(', ')}`);
  r.sql.close();
});

test('A SECOND UNDO THAT PUTS BACK WHAT THE FIRST LEFT puts the question back in Decide', async () => {
  const r = await record();
  const a = value<Entry>(r.k.create('codes', { code: 'Spring' }, MARA));
  const b = value<Entry>(r.k.create('codes', { code: 'Autumn' }, MARA));
  r.clock.advance(10 * MIN);
  const B = '01JDECIDEBATCH000000000002';
  const at = new Date(r.clock.now()).toISOString();
  r.sql.exec("INSERT INTO suggestion (id, body_kind, body, status, opened_by, opened_at, resolved_as) VALUES ('SG1', 'rowset', '{}', 'resolved', 'p_agent', ?, 'addressed')", at);
  value(r.k.update('codes', a.id, { deleted_at: true }, { ...MARA, batch: B, version: a.version }));
  value(r.k.update('codes', b.id, { note: 'old' }, { ...MARA, batch: B }));
  r.sql.exec("INSERT INTO event (id, ts, actor, kind, target, target_kind, to_v, batch) VALUES ('01JDECIDE00000000000000002', ?, 'p_mara', 'decide', 'decision:D2', 'decision', '{}', ?)", at, B);
  r.sql.exec("INSERT INTO event (id, ts, actor, kind, target, target_kind, to_v, batch) VALUES ('01JRESOLVE0000000000000002', ?, 'p_mara', 'resolve', 'suggestion:SG1', 'suggestion', 'addressed', ?)", at, B);
  /* The code taken while the first is deleted, so its restore is refused the first time. */
  const taken = value<Entry>(r.k.create('codes', { code: 'Spring' }, MARA));

  value(undoApply(r.parts, { decision: 'D2' }, plan(r, { decision: 'D2' }).hash, 'p_mara'));
  assert.deepEqual(question(r), { status: 'resolved', resolved_as: 'undone' });

  value(r.k.update('codes', taken.id, { deleted_at: true }, { ...MARA, version: taken.version }));
  const p = plan(r, { decision: 'D2' });
  assert.ok(p.lines.includes('Puts the question back in Decide.'), p.lines.join(' | '));
  value(undoApply(r.parts, { decision: 'D2' }, p.hash, 'p_mara'));
  assert.deepEqual(question(r), { status: 'open', resolved_as: null });
  r.sql.close();
});

test('A PROJECT NAMED LIKE A HANDLE IS SAID BY ITS NAME when no list numbers its rows that way', async () => {
  const r = await record();
  const one = run(r, 'Fix login');
  const B = '01JBACKFILLBATCH0000000003';
  value(r.k.write('session', one.id, {}, { actor: BACKFILL_ACTOR, batch: B, cascade: false, version: one.version, stamp: { project: 'Web3' } }));
  assert.deepEqual(plan(r, { batch: B }).lines, ['Takes "Fix login" out of the Web3 project.']);
  r.sql.close();
});
