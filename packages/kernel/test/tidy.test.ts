/**
 * The tidy's finders, over a planted record (AGT-C18 job a).
 *
 * WHAT WAS MEASURED BEFORE THIS. "how good is braindog's mcp at cleaning up stale stuff?" (D40.10) had the answer
 * "Poor": one hourly sweep, and no read that says what went stale or what was cleaned. A finder is that read for one
 * kind of thing: how many are stale now, how many the record cleared in the last day, and the one question it may ask.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ulids } from '../src/ids.ts';
import { openRecord } from '../src/index.ts';
import { EXPIRED_NOTE } from '../src/handoff.ts';
import { SWEPT_NOTE } from '../src/schedule.ts';
import { TIDY_OPTIONS, causeOfFinder, finderOf, finders, registerFinder, tidy, tidyDays, tidyHour, type Finder, type TidyDay, type TidyDeps } from '../src/tidy.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 13, 9);
const DAY = 86_400_000;
const ago = (ms: number): string => new Date(NOW - ms).toISOString();

async function record(): Promise<{ sql: NodeSql; deps: TidyDeps }> {
  const sql = openSqlite();
  await openRecord(sql, fixedClock(NOW));
  const mint = ulids(() => NOW);
  const allocate = (name: string): number => {
    sql.exec('INSERT OR IGNORE INTO counter (name, next) VALUES (?, 1)', name);
    return sql.one<{ n: number }>('UPDATE counter SET next = next + 1 WHERE name = ? RETURNING next - 1 AS n', name)!.n;
  };
  return { sql, deps: { sql, nowMs: NOW, mint, allocate } };
}

let planted = 9000;
/** One run, written straight into the table the sweep reads. `heard` is how long ago it was last heard from. */
function run(sql: NodeSql, state: string, heard: number, fields: Record<string, unknown> = {}): string {
  const seq = ++planted;
  const id = `RUN${seq}`;
  const at = ago(heard);
  sql.exec(
    "INSERT INTO entry (id, register, seq, fields, state, version, created_at, updated_at) VALUES (?, 'session', ?, ?, ?, 1, ?, ?)",
    id,
    seq,
    JSON.stringify({ doing: `Run ${seq}`, state, started: at, last_seen: at, ...fields }),
    state,
    at,
    at,
  );
  return id;
}

const question = (sql: NodeSql, asked: number, status = 'open', defer: string | null = null): void =>
  sql.exec(
    "INSERT INTO suggestion (id, body_kind, body, status, opened_by, opened_at, defer_until) VALUES (?, 'options', '{}', ?, 'p_owner', ?, ?)",
    `SGQ${++planted}`,
    status,
    ago(asked),
    defer,
  );

const line = (out: ReturnType<typeof tidy>, id: string) => {
  const found = out.find((l) => l.finder === id);
  assert.ok(found, `no line for ${id}`);
  return found;
};

test('the registry holds this part\'s seven finders, each { id, find }', () => {
  assert.deepEqual(
    finders().map((f) => f.id),
    ['runs-stopped', 'runs-empty', 'steps-old', 'questions-old', 'questions-moot', 'faults-open', 'keys-unopened'],
  );
  for (const f of finders()) assert.equal(typeof f.find, 'function');
  assert.equal(finderOf('runs-empty')?.id, 'runs-empty');
  assert.equal(finderOf('nothing'), undefined);
  assert.equal(causeOfFinder('runs-empty'), 'tidy#runs-empty');
});

test('a record with nothing stale: every finder answers stale 0, did 0 and no ask, and nothing is filed', async () => {
  const { sql, deps } = await record();
  run(sql, 'active', 60_000);
  run(sql, 'done', 3 * DAY, { wrote: 0 });
  run(sql, 'done', 40 * DAY, { wrote: 4 });
  question(sql, 2 * DAY);
  for (const f of finders()) assert.deepEqual(f.find(sql, NOW), { stale: 0, did: 0, ask: null }, f.id);
  const out = tidy(deps);
  assert.deepEqual(
    out.map((l) => [l.finder, l.stale, l.did, l.asked]),
    finders().map((f) => [f.id, 0, 0, null]),
  );
  assert.equal(sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM suggestion WHERE cause LIKE 'tidy#%'")?.n, 0);
});

test('runs-stopped: counts the runs the sweep is about to write off, and the ones it wrote off in the last day', async () => {
  const { sql, deps } = await record();
  run(sql, 'active', 13 * 3_600_000);
  run(sql, 'idle', 2 * DAY);
  run(sql, 'active', 11 * 3_600_000);
  run(sql, 'handoff', 5 * DAY, { next: 'Ship it', next_at: ago(5 * DAY) });
  const off = run(sql, 'abandoned', 20 * 3_600_000, { wrote: 2 });
  const long = run(sql, 'abandoned', 9 * DAY, { wrote: 2 });
  const swept = (id: string, at: number) =>
    sql.exec(
      "INSERT INTO event (id, ts, actor, kind, target, target_kind, field, from_v, to_v, note) VALUES (?, ?, 'system', 'state', ?, 'entry', 'state', '\"idle\"', '\"abandoned\"', ?)",
      deps.mint(),
      ago(at),
      `entry:${id}`,
      SWEPT_NOTE,
    );
  swept(off, 3 * 3_600_000);
  swept(long, 8 * DAY);
  assert.deepEqual(finderOf('runs-stopped')!.find(sql, NOW), { stale: 2, did: 1, ask: null });
});

test('runs-empty: ended, wrote nothing, over 30 days old, and it asks once whether to delete them', async () => {
  const { sql, deps } = await record();
  run(sql, 'done', 31 * DAY, { wrote: 0 });
  run(sql, 'abandoned', 90 * DAY, { wrote: 0 });
  run(sql, 'done', 29 * DAY, { wrote: 0 }); // not old enough
  run(sql, 'done', 60 * DAY, { wrote: 3 }); // wrote
  run(sql, 'done', 60 * DAY); // never counted, so not known to be empty
  run(sql, 'handoff', 60 * DAY, { wrote: 0, next: 'Ship it' }); // waits for a taker, not ended
  const gone = run(sql, 'done', 60 * DAY, { wrote: 0 });
  sql.exec('UPDATE entry SET deleted_at = ? WHERE id = ?', ago(DAY), gone);

  const found = finderOf('runs-empty')!.find(sql, NOW);
  assert.equal(found.stale, 2);
  assert.equal(found.did, 0);
  assert.match(found.ask!.question, /^2 runs ended more than 30 days ago and wrote nothing\. Delete them\?$/);

  const first = line(tidy(deps), 'runs-empty');
  assert.match(String(first.asked), /^SG\d+$/);
  const asked = sql.all<{ id: string; body_kind: string; body: string; status: string; opened_by: string; cause: string }>(
    "SELECT id, body_kind, body, status, opened_by, cause FROM suggestion WHERE cause = 'tidy#runs-empty'",
  );
  assert.equal(asked.length, 1);
  assert.equal(asked[0]!.id, first.asked);
  assert.equal(asked[0]!.body_kind, 'options');
  assert.equal(asked[0]!.status, 'open');
  assert.equal(asked[0]!.opened_by, 'system');
  const body = JSON.parse(asked[0]!.body) as { cause: string; finder: string; count: number; options: { id: string; label: string; because: string }[] };
  assert.equal(body.cause, 'tidy#runs-empty');
  assert.equal(body.finder, 'runs-empty');
  assert.equal(body.count, 2);
  assert.deepEqual(
    body.options.map((o) => [o.id, o.label]),
    [
      ['do', 'Do it'],
      ['always', 'Always do this'],
      ['leave', 'Leave them'],
    ],
  );
  assert.deepEqual(body.options.map((o) => o.id), TIDY_OPTIONS.map((o) => o.id));
  for (const o of body.options) assert.ok(o.because.trim().length > 0 && !o.because.includes('—'));
  /* The question's own words are on its `suggest` line, where every question's are read from. */
  const said = sql.one<{ actor: string; to_v: string }>("SELECT actor, to_v FROM event WHERE kind = 'suggest' AND target = ?", `suggestion:${first.asked}`);
  assert.deepEqual({ ...said }, { actor: 'system', to_v: found.ask!.question });
  /* It asks, and deletes nothing. */
  assert.equal(finderOf('runs-empty')!.find(sql, NOW).stale, 2);
});

test('steps-old: open steps passed over or past thirty days, and the ones that expired in the last day', async () => {
  const { sql } = await record();
  const step = (heard: number, fields: Record<string, unknown> = {}) =>
    run(sql, 'handoff', heard, { next: 'Ship it', next_at: ago(heard), project: 'PRJ1', ...fields });
  step(2 * DAY); // passed over below
  step(3 * 3_600_000); // fresh, and nobody has worked here since
  step(2 * DAY, { project: 'PRJ2' }); // another project, where nobody has worked since
  step(31 * DAY, { project: 'PRJ3' }); // the sweep closes it within the hour
  /* A run that began after the first step was left, wrote, and ended: it passed that step over. */
  run(sql, 'done', DAY, { project: 'PRJ1', wrote: 2, started: ago(DAY + 3_600_000), last_seen: ago(DAY) });
  /* A helper, and a run that wrote nothing, pass nothing over. */
  run(sql, 'done', DAY, { project: 'PRJ2', wrote: 2, parent: 'RUN1', started: ago(DAY + 3_600_000) });
  run(sql, 'done', DAY, { project: 'PRJ2', wrote: 0, started: ago(DAY + 3_600_000) });
  run(sql, 'done', 5 * 3_600_000, { closed_as: 'expired', closed_at: ago(5 * 3_600_000), next: 'Old words', note: EXPIRED_NOTE });
  run(sql, 'done', 3 * DAY, { closed_as: 'expired', closed_at: ago(3 * DAY), next: 'Older words' });
  run(sql, 'done', 2 * 3_600_000, { closed_as: 'taken', closed_at: ago(2 * 3_600_000), next: 'Taken' });
  assert.deepEqual(finderOf('steps-old')!.find(sql, NOW), { stale: 2, did: 1, ask: null });
});

test('questions-old: open for more than 14 days, counted only', async () => {
  const { sql, deps } = await record();
  question(sql, 15 * DAY);
  question(sql, 40 * DAY);
  question(sql, 13 * DAY);
  question(sql, 40 * DAY, 'resolved');
  question(sql, 40 * DAY, 'open', new Date(NOW + DAY).toISOString()); // put off by the person until tomorrow
  question(sql, 40 * DAY, 'open', ago(DAY)); // put off, and it has come round
  assert.deepEqual(finderOf('questions-old')!.find(sql, NOW), { stale: 3, did: 0, ask: null });
  assert.equal(line(tidy(deps), 'questions-old').asked, null);
  assert.equal(sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM suggestion WHERE cause LIKE 'tidy#%'")?.n, 0);
});

test('running twice asks once, and the open question keeps the count it would act on', async () => {
  const { sql, deps } = await record();
  run(sql, 'done', 31 * DAY, { wrote: 0 });
  const first = line(tidy(deps), 'runs-empty').asked;
  const again = line(tidy(deps), 'runs-empty');
  assert.equal(again.asked, first);
  assert.equal(again.stale, 1);
  run(sql, 'done', 45 * DAY, { wrote: 0 });
  const later = line(tidy({ ...deps, nowMs: NOW + 3_600_000 }), 'runs-empty');
  assert.equal(later.asked, first);
  const all = sql.all<{ body: string }>("SELECT body FROM suggestion WHERE cause = 'tidy#runs-empty'");
  assert.equal(all.length, 1);
  assert.equal((JSON.parse(all[0]!.body) as { count: number }).count, 2);
  assert.equal(sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM event WHERE kind = 'suggest'")?.n, 1);
});

test('an answered question is not asked again: the finder goes on counting', async () => {
  const { sql, deps } = await record();
  run(sql, 'done', 31 * DAY, { wrote: 0 });
  const first = line(tidy(deps), 'runs-empty').asked;
  sql.exec("UPDATE suggestion SET status = 'resolved', resolved_as = 'leave' WHERE id = ?", first);
  const after = line(tidy({ ...deps, nowMs: NOW + DAY }), 'runs-empty');
  assert.deepEqual([after.stale, after.asked], [1, null]);
  assert.equal(sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM suggestion WHERE cause = 'tidy#runs-empty'")?.n, 1);
});

test('a finder another part registers is run with the rest, and asks at most one question under its own cause', async () => {
  const { sql, deps } = await record();
  const keys: Finder = {
    id: 'keys-unused',
    find: () => ({ stale: 3, did: 1, ask: { question: '3 keys were not used in 90 days. Retire them?', does: 'Retires the 3 keys.' } }),
  };
  registerFinder(keys);
  assert.throws(() => registerFinder(keys), /keys-unused/);
  assert.throws(() => registerFinder({ id: 'Not A Key', find: keys.find }), /Not A Key/);
  assert.equal(finders().at(-1)?.id, 'keys-unused');
  tidy(deps);
  const out = line(tidy(deps), 'keys-unused');
  assert.deepEqual([out.stale, out.did], [3, 1]);
  const asked = sql.all<{ id: string; cause: string }>("SELECT id, cause FROM suggestion WHERE cause LIKE 'tidy#%'");
  assert.deepEqual(asked.map((a) => ({ ...a })), [{ id: out.asked, cause: 'tidy#keys-unused' }]);
  /* A finder that offers a question with nothing stale asks nothing. */
  const idle: Finder = { id: 'idle-things', find: () => ({ stale: 0, did: 0, ask: { question: 'Nothing. Delete it?', does: 'Nothing.' } }) };
  assert.deepEqual(tidy(deps, [idle]), [{ finder: 'idle-things', stale: 0, did: 0, asked: null }]);
});

/* ── the hourly pass (AGT-C18, the direction audit's claim 2) ───────────── */

const HOUR = 3_600_000;
const kept = (sql: NodeSql, finder: string) =>
  sql.all<TidyDay>('SELECT finder, day, stale, did, low, at FROM tidy_line WHERE finder = ? ORDER BY day', finder).map((l) => ({ ...l }));
/** The person picks one of a tidy question's answers, as `decide` leaves it: the question addressed, and a decision under its cause. */
function answer(sql: NodeSql, id: string | null, option: string, at: number): void {
  assert.ok(id);
  sql.exec("UPDATE suggestion SET status = 'resolved', resolved_as = 'addressed' WHERE id = ?", id);
  sql.exec(
    "INSERT INTO decision (id, question, answer, reason, decided_by, ts, supersedes, cause) VALUES (?, 'Delete them?', ?, '', 'p_owner', ?, NULL, (SELECT cause FROM suggestion WHERE id = ?))",
    `DQ${++planted}`,
    option,
    new Date(at).toISOString(),
    id,
  );
}
const asks = (sql: NodeSql): number => sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM suggestion WHERE cause = 'tidy#runs-empty'")!.n;

test('the hourly pass keeps one line a finder a day, the day\'s last count and its lowest, 90 days deep', async () => {
  const { sql, deps } = await record();
  assert.deepEqual(tidyDays(sql, NOW), []); // a record the pass has not run on
  run(sql, 'done', 31 * DAY, { wrote: 0 });
  const first = tidyHour(deps);
  assert.deepEqual(first.map((l) => l.finder), finders().map((f) => f.id));
  assert.deepEqual(tidyHour(deps), first); // twice in an hour: the same lines, and nothing more filed
  run(sql, 'done', 45 * DAY, { wrote: 0 });
  tidyHour({ ...deps, nowMs: NOW + HOUR });
  assert.deepEqual(kept(sql, 'runs-empty'), [{ finder: 'runs-empty', day: '2026-10-13', stale: 2, did: 0, low: 1, at: new Date(NOW + HOUR).toISOString() }]);
  assert.equal(sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM tidy_line')?.n, finders().length);
  assert.equal(asks(sql), 1);
  /* The next day is a new line, and the table is in no section, so a copy of the record does not carry it. */
  tidyHour({ ...deps, nowMs: NOW + DAY });
  assert.deepEqual(kept(sql, 'runs-empty').map((l) => [l.day, l.stale, l.low]), [['2026-10-13', 2, 1], ['2026-10-14', 2, 2]]);
  assert.equal(sql.one("SELECT 1 AS n FROM dog_section WHERE table_name = 'tidy_line'"), undefined);
  assert.deepEqual(tidyDays(sql, NOW + DAY, 1).map((l) => l.day), finders().map(() => '2026-10-14'));
  assert.equal(tidyDays(sql, NOW + DAY).length, 2 * finders().length);
  /* Ninety days on, the old lines are gone and the last 90 days are kept. */
  tidyHour({ ...deps, nowMs: NOW + 89 * DAY });
  assert.deepEqual(kept(sql, 'runs-empty').map((l) => l.day), ['2026-10-13', '2026-10-14', '2027-01-10']);
  tidyHour({ ...deps, nowMs: NOW + 90 * DAY });
  assert.deepEqual(kept(sql, 'runs-empty').map((l) => l.day), ['2026-10-14', '2027-01-10', '2027-01-11']);
});

test('after a plain Do it the hourly pass asks again when more went stale, and not for the same ones', async () => {
  const { sql, deps } = await record();
  run(sql, 'done', 31 * DAY, { wrote: 0 });
  run(sql, 'done', 32 * DAY, { wrote: 0 });
  const first = line(tidyHour(deps), 'runs-empty').asked;
  answer(sql, first, 'do', NOW + 60_000);
  /* Nothing acts on the answer yet, so the same two are still there: not asked again, hour after hour or day after day. */
  for (const later of [HOUR, 2 * HOUR, DAY, 3 * DAY]) assert.equal(line(tidyHour({ ...deps, nowMs: NOW + later }), 'runs-empty').asked, null);
  assert.equal(asks(sql), 1);
  /* A third went stale: one new question, about all three, and it is the finder's only open one. */
  run(sql, 'done', 40 * DAY, { wrote: 0 });
  const second = line(tidyHour({ ...deps, nowMs: NOW + 4 * DAY }), 'runs-empty').asked;
  assert.ok(second && second !== first);
  assert.equal((JSON.parse(sql.one<{ body: string }>('SELECT body FROM suggestion WHERE id = ?', second)!.body) as { count: number }).count, 3);
  assert.equal(line(tidyHour({ ...deps, nowMs: NOW + 4 * DAY + HOUR }), 'runs-empty').asked, second);
  assert.equal(sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM suggestion WHERE cause = 'tidy#runs-empty' AND status = 'open'")?.n, 1);
  assert.equal(asks(sql), 2);
});

test('Do it that cleared everything asks again at the first new one, the same day', async () => {
  const { sql, deps } = await record();
  const a = run(sql, 'done', 31 * DAY, { wrote: 0 });
  const b = run(sql, 'done', 32 * DAY, { wrote: 0 });
  tidyHour({ ...deps, nowMs: NOW - HOUR }); // an earlier pass the same day, before the answer
  const first = line(tidyHour(deps), 'runs-empty').asked;
  answer(sql, first, 'do', NOW + 60_000);
  sql.exec('DELETE FROM entry WHERE id IN (?, ?)', a, b); // what acting on the answer will do
  assert.equal(line(tidyHour({ ...deps, nowMs: NOW + HOUR }), 'runs-empty').asked, null);
  assert.deepEqual(kept(sql, 'runs-empty').map((l) => [l.stale, l.low]), [[0, 0]]);
  run(sql, 'done', 33 * DAY, { wrote: 0 });
  const second = line(tidyHour({ ...deps, nowMs: NOW + 2 * HOUR }), 'runs-empty').asked;
  assert.ok(second && second !== first);
  assert.equal(asks(sql), 2);
});

test('Always do this, Leave them, a decline and tidy by itself are never asked again', async () => {
  for (const said of ['always', 'leave', 'wont-fix', 'do-but-tidy-alone']) {
    const { sql, deps } = await record();
    run(sql, 'done', 31 * DAY, { wrote: 0 });
    const first = line(tidyHour(deps), 'runs-empty').asked;
    if (said === 'wont-fix') sql.exec("UPDATE suggestion SET status = 'resolved', resolved_as = 'wont-fix' WHERE id = ?", first);
    else answer(sql, first, said === 'do-but-tidy-alone' ? 'do' : said, NOW + 60_000);
    run(sql, 'done', 40 * DAY, { wrote: 0 });
    run(sql, 'done', 41 * DAY, { wrote: 0 });
    const later = { ...deps, nowMs: NOW + DAY };
    const out = line(said === 'do-but-tidy-alone' ? tidy(later) : tidyHour(later), 'runs-empty');
    assert.deepEqual([out.stale, out.asked], [3, null], said);
    assert.equal(asks(sql), 1, said);
  }
});
