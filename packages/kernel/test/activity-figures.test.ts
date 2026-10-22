/**
 * The record's own log as three figures (PGS-C24 job 4, AGT-C17 job c): who worked, what changed and the busy hours.
 *
 * WHAT WAS MEASURED BEFORE THIS. A figure read a list, a kept line or one of the record's own counts, and never the log.
 * So the three side tiles of Activity were worked out inside one hand-built screen, from whatever page of the log the
 * browser had read so far, and no page could draw them and no agent could read them.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord } from '../src/index.ts';
import { EVENT_KINDS } from '../src/events.ts';
import { BUILT_IN_FIGURES, RECORD_ACTIVITY, builtInFigure, readActivity } from '../src/built-in-figures.ts';
import { evaluateMetric, type Group, type Reading } from '../src/metrics.ts';
import { figureLists } from '../src/money-figures.ts';
import { byOf } from '../src/pages.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

/* 13 October 2026, 09:00 UTC, which is 14:30 in Kolkata: a zone a half hour off, so an hour read in UTC is the wrong one. */
const NOW = Date.UTC(2026, 9, 13, 9);
const TZ = 'Asia/Kolkata';
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const CTX = { nowMs: NOW, tz: TZ };

type Kernel = Awaited<ReturnType<typeof openRecord>>;

let planted = 0;
/** One line of the log, written straight into the table the figures read. */
function line(sql: NodeSql, atMs: number, actor: string, kind: string, more: { target?: string; target_kind?: string; field?: string; from?: unknown; to?: unknown } = {}): void {
  const seq = ++planted;
  const json = (v: unknown): string | null => (v === undefined ? null : JSON.stringify(v));
  sql.exec(
    'INSERT INTO event (id, ts, actor, kind, target, target_kind, field, from_v, to_v, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    `EV${String(seq).padStart(6, '0')}`,
    new Date(atMs).toISOString(),
    actor,
    kind,
    more.target ?? `entry:THING${seq}`,
    more.target_kind ?? 'entry',
    more.field ?? null,
    json(more.from),
    json(more.to),
    kind === 'note' ? 'A note somebody wrote' : null,
  );
}

/** A run's own row, which the sweep and a stamp are written about. */
function run(sql: NodeSql, id: string, seq: number): void {
  const at = new Date(NOW - 12 * DAY).toISOString();
  sql.exec(
    "INSERT INTO entry (id, register, seq, fields, state, version, created_at, updated_at) VALUES (?, 'session', ?, ?, 'active', 1, ?, ?)",
    id,
    seq,
    JSON.stringify({ doing: `Run ${seq}`, state: 'active', started: at, last_seen: at }),
    at,
    at,
  );
}

/* Sixty writes: two agents, one rule and one person, in ten kinds, over ten days. */
const WHO = [...Array<string>(20).fill('S1'), ...Array<string>(10).fill('S2'), ...Array<string>(12).fill('rule:renewal'), ...Array<string>(18).fill('p_owner')];
const KINDS: [string, number][] = [['create', 14], ['edit', 12], ['state', 9], ['note', 7], ['link', 5], ['tag', 4], ['decide', 3], ['suggest', 3], ['delete', 2], ['untag', 1]];
const WHAT = KINDS.flatMap(([kind, n]) => Array<string>(n).fill(kind));
/** When write `i` was made: day `i % 10` back, at a quarter to the hour, the hours 00 to 08 UTC so none is after now. */
const when = (i: number): number => NOW - (i % 10) * DAY - 9 * HOUR + ((i * 7) % 9) * HOUR + 45 * MIN;

async function record(): Promise<{ sql: NodeSql; k: Kernel }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  /* The log is the fixture: whatever opening the record wrote is not one of the sixty. */
  sql.exec('DELETE FROM event');
  run(sql, 'RUN1', 1);
  run(sql, 'RUN2', 2);
  /* 37 and 60 share no factor, so the kinds are spread over the actors and the days and not in step with them. */
  for (let i = 0; i < 60; i++) line(sql, when(i), WHO[i]!, WHAT[(i * 37) % 60]!);
  return { sql, k };
}

const read = (sql: NodeSql, id: string, ctx: { nowMs: number; tz?: string } = CTX): Reading => {
  const decl = builtInFigure(id);
  assert.ok(decl, `no figure called ${id}`);
  assert.equal(decl.source, RECORD_ACTIVITY);
  const got = readActivity(sql, ctx, decl);
  assert.ok(got.ok, id);
  return got.value;
};

const parts = (r: Reading): Record<string, number | null> => Object.fromEntries((r.groups ?? []).map((g) => [g.key, g.value]));

/** The hour of the day `ms` falls in, on the clock of `tz`: asked of `Intl`, which is not how the figure is built. */
const hourIn = (ms: number, tz: string): string =>
  new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(new Date(ms)).padStart(2, '0');

test('the three figures are declared over the log, with names a person reads', () => {
  assert.equal(RECORD_ACTIVITY, 'record.activity');
  const names = Object.fromEntries(['activity-by-who', 'activity-by-kind', 'activity-by-hour'].map((id) => [id, BUILT_IN_FIGURES[id]?.name]));
  assert.deepEqual(names, { 'activity-by-who': 'Who worked', 'activity-by-kind': 'What changed', 'activity-by-hour': 'Busy hours' });
  for (const id of Object.keys(names)) {
    const decl = builtInFigure(id)!;
    assert.equal(decl.source, RECORD_ACTIVITY);
    assert.equal(decl.window, '30d', `${id} is over the last 30 days`);
    assert.equal(decl.target, undefined, `${id}: a busy month is not a good one or a bad one`);
  }
});

test('activity-by-who: the count for each of agent, rule and you, in the shape a figure in parts answers', async () => {
  const { sql } = await record();
  const r = read(sql, 'activity-by-who');
  assert.deepEqual(parts(r), { agent: 30, rule: 12, you: 18 });
  assert.deepEqual([r.value, r.rows, r.held, r.unit, r.met], [60, 60, 60, null, null]);
  assert.deepEqual(r.refusals, []);
  /* The shape is `Group`, the one `events.<list>` and every grouped figure answers: nothing new for a reader to learn. */
  const agent: Group = r.groups![0]!;
  assert.deepEqual(agent, { key: 'agent', label: 'Agents', value: 30, rows: 30, state: 'full' });
  assert.deepEqual(r.groups!.map((g) => g.label), ['Agents', 'Rules', 'You']);
  assert.doesNotMatch(JSON.stringify(r), /S1|S2|p_owner|rule:renewal|—/u, 'a handle or an id reached what a person reads');
  sql.close();
});

test('who is who by the feed\'s own rule, so the figure and a feed never split a line two ways', async () => {
  const { sql } = await record();
  line(sql, NOW - HOUR, 'slash', 'edit');
  line(sql, NOW - HOUR, 'agent:claude', 'edit');
  line(sql, NOW - HOUR, 'system', 'export', { target: 'record', target_kind: 'record' });
  line(sql, NOW - HOUR, 'script:tidy@v2', 'create');
  line(sql, NOW - HOUR, 'p_seed', 'create');
  const all = sql.all<{ actor: string }>('SELECT actor FROM event');
  const want = { agent: 0, rule: 0, you: 0 };
  for (const e of all) want[byOf(e.actor)] += 1;
  assert.deepEqual(parts(read(sql, 'activity-by-who')), want);
  assert.deepEqual(want, { agent: 32, rule: 15, you: 18 });
  sql.close();
});

test('activity-by-kind: each kind of write, the eight largest and the rest as one', async () => {
  const { sql } = await record();
  const r = read(sql, 'activity-by-kind');
  assert.deepEqual(
    r.groups!.map((g) => [g.key, g.label, g.value]),
    [
      ['create', 'Created', 14],
      ['edit', 'Changed', 12],
      ['state', 'Moved', 9],
      ['note', 'Noted', 7],
      ['link', 'Linked', 5],
      ['tag', 'Tagged', 4],
      ['decide', 'Decided', 3],
      ['suggest', 'Asked', 3],
      ['other', 'Everything else', 3],
    ],
  );
  assert.equal(r.value, 60);
  assert.equal(r.more, undefined, 'the rest is a part, so nothing is left out to count');
  assert.ok(r.groups!.every((g) => g.state === 'full' && g.rows === g.value));
  sql.close();
});

test('eight kinds or fewer are each said, and no part is made of nothing', async () => {
  const sql = openSqlite();
  await openRecord(sql, fixedClock(NOW));
  sql.exec('DELETE FROM event');
  for (const [i, kind] of ['create', 'create', 'edit', 'note', 'link', 'tag', 'decide', 'suggest', 'delete'].entries()) line(sql, NOW - (i + 1) * HOUR, 'p_owner', kind);
  const r = read(sql, 'activity-by-kind');
  assert.deepEqual(r.groups!.map((g) => g.key), ['create', 'decide', 'delete', 'edit', 'link', 'note', 'suggest', 'tag']);
  assert.equal(r.value, 9);
  sql.close();
});

test('every kind of write a feed holds is said in a word, never by its key', async () => {
  const sql = openSqlite();
  await openRecord(sql, fixedClock(NOW));
  const shown = EVENT_KINDS.filter((kind) => !/^(?:grant|access|share)\./u.test(kind));
  assert.equal(shown.length, 31);
  /* Eight at a time, so each is one of the eight said by name. */
  for (let from = 0; from < shown.length; from += 8) {
    sql.exec('DELETE FROM event');
    const some = shown.slice(from, from + 8);
    for (const kind of some) line(sql, NOW - HOUR, 'p_owner', kind);
    const said = read(sql, 'activity-by-kind').groups!;
    assert.deepEqual(said.map((g) => g.key).sort(), [...some].sort());
    for (const g of said) {
      assert.notEqual(g.label, g.key, `${g.key} is said by its key`);
      assert.match(g.label ?? '', /^[A-Z][a-z]+(?: [a-z]+)*$/u, `${g.key} reads ${String(g.label)}`);
    }
  }
  sql.close();
});

test('activity-by-hour: 24 counts, each hour on the clock of the record\'s own zone', async () => {
  const { sql } = await record();
  const r = read(sql, 'activity-by-hour');
  const want: Record<string, number> = Object.fromEntries(Array.from({ length: 24 }, (_, h) => [String(h).padStart(2, '0'), 0]));
  for (let i = 0; i < 60; i++) want[hourIn(when(i), TZ)]! += 1;
  assert.equal(r.groups!.length, 24);
  assert.deepEqual(r.groups!.map((g) => g.key), Object.keys(want).sort(), 'the hours are in the order of the day, never largest first');
  assert.deepEqual(parts(r), want);
  assert.equal(r.value, 60);
  /* A quarter to the hour from 00 to 08 UTC is a quarter past from 06 to 14 in Kolkata, and no other hour. */
  const busy = Object.entries(want).filter(([, n]) => n > 0).map(([h]) => h).sort();
  assert.deepEqual(busy, ['06', '07', '08', '09', '10', '11', '12', '13', '14']);
  assert.deepEqual(r.groups!.find((g) => g.key === '03'), { key: '03', label: '03:00', value: 0, rows: 0, state: 'full' });
  /* Read with no zone the same writes fall in the hours of UTC. */
  const utc = parts(read(sql, 'activity-by-hour', { nowMs: NOW }));
  assert.deepEqual(Object.entries(utc).filter(([, n]) => (n ?? 0) > 0).map(([h]) => h).sort(), ['00', '01', '02', '03', '04', '05', '06', '07', '08']);
  sql.close();
});

test('a late evening write is the next morning\'s hour east of UTC', async () => {
  const { sql } = await record();
  line(sql, NOW - 2 * DAY + 11 * HOUR + 45 * MIN, 'p_owner', 'edit'); // 20:45 UTC, 02:15 in Kolkata
  const r = read(sql, 'activity-by-hour');
  assert.equal(parts(r)['02'], 1);
  assert.equal(parts(r)['20'], 0);
  sql.close();
});

test('the record keeping its own books is left out, as a feed leaves it out, and the owner\'s lines with it', async () => {
  const { sql, k } = await record();
  const earlier = new Date(NOW - 3 * DAY).toISOString();
  const at = NOW - 2 * HOUR;
  const stamp = new Date(at).toISOString();
  /* The sweep writing a quiet run off, a run stamping when it last looked, and a script's quiet night. */
  line(sql, at, 'system', 'state', { target: 'entry:RUN1', field: 'state', from: 'active', to: 'abandoned' });
  line(sql, at, 'S1', 'edit', { target: 'entry:RUN1', field: 'last_seen', from: earlier, to: stamp });
  line(sql, at, 'system', 'pull', { target: 'declaration:script.night', target_kind: 'declaration', to: { quiet: 1 } });
  /* The owner's own: a key read, somebody given access, a link opened. */
  line(sql, at, 'S1', 'grant.read', { target: 'GR1', target_kind: 'grant' });
  line(sql, at, 'p_owner', 'access.grant', { target: 'p_01M1KJ7RG0TYYA0AX15QPGJJ4', target_kind: 'member' });
  line(sql, at, 'p_owner', 'share.open', { target: 'SH1', target_kind: 'share' });
  line(sql, at, 'p_owner', 'edit', { target: 'VK1', target_kind: 'vault_key' });
  assert.deepEqual(parts(read(sql, 'activity-by-who')), { agent: 30, rule: 12, you: 18 }, 'a line of the record\'s books was counted as work');
  assert.equal(read(sql, 'activity-by-kind').value, 60);
  assert.equal(read(sql, 'activity-by-hour').value, 60);

  /* AND WHAT LOOKS LIKE THEM AND IS A CHANGE: a run setting a day ahead, a person's own stamp, a script that did something,
     a run moved by somebody. Each is counted. */
  line(sql, at, 'S1', 'edit', { target: 'entry:RUN1', field: 'last_seen', from: earlier, to: new Date(NOW + 7 * DAY).toISOString() });
  line(sql, at, 'p_owner', 'edit', { target: 'entry:RUN1', field: 'last_seen', from: earlier, to: stamp });
  line(sql, at, 'system', 'pull', { target: 'declaration:script.night', target_kind: 'declaration', to: { wrote: 3 } });
  line(sql, at, 'p_owner', 'state', { target: 'entry:RUN2', field: 'state', from: 'active', to: 'done' });
  line(sql, at, 'S2', 'edit', { target: 'entry:RUN2', field: 'doing', from: 'One thing', to: 'Another' });
  assert.deepEqual(parts(read(sql, 'activity-by-who')), { agent: 32, rule: 13, you: 20 });

  /* ONE RULE, HELD TO THE KERNEL'S OWN: every line of the log is asked of the feed's two tests, and the figure counts
     what they keep. */
  type Raw = { ts: string; actor: string; kind: string; target: string | null; target_kind: string | null; field: string | null; from_v: string | null; to_v: string | null };
  const json = (v: string | null): never => (v === null ? null : JSON.parse(v)) as never;
  const owners = (e: Raw): boolean => /^(?:grant|access|share)\./u.test(e.kind) || ['grant', 'vault_key', 'device_grant', 'member', 'person', 'sealed'].includes(e.target_kind ?? '');
  const kept = sql
    .all<Raw>('SELECT ts, actor, kind, target, target_kind, field, from_v, to_v FROM event')
    .filter((e) => !owners(e) && !k.bookkeeping({ ...e, from: json(e.from_v), to: json(e.to_v) }));
  assert.equal(kept.length, 65);
  assert.equal(read(sql, 'activity-by-who').value, kept.length);
  sql.close();
});

test('a write 31 days old is not counted, and one 29 days old is', async () => {
  const { sql } = await record();
  line(sql, NOW - 31 * DAY, 'p_owner', 'create');
  line(sql, NOW - 45 * DAY, 'S1', 'edit');
  for (const id of ['activity-by-who', 'activity-by-kind', 'activity-by-hour']) assert.equal(read(sql, id).value, 60, id);
  line(sql, NOW - 29 * DAY, 'p_owner', 'create');
  for (const id of ['activity-by-who', 'activity-by-kind', 'activity-by-hour']) assert.equal(read(sql, id).value, 61, id);
  /* The window is the figure's own: the same source read over a week counts the week. */
  const week = readActivity(sql, CTX, { ...builtInFigure('activity-by-who')!, window: '7d' });
  assert.ok(week.ok);
  assert.equal(week.value.value, 42, 'seven days, today among them, six writes a day');
  sql.close();
});

test('read as of a past day, it counts what the log held then', async () => {
  const { sql } = await record();
  const then = readActivity(sql, { nowMs: NOW, asOfMs: NOW - 5 * DAY, tz: TZ }, builtInFigure('activity-by-who')!);
  assert.ok(then.ok);
  assert.equal(then.value.value, 30, 'the five days up to that one, six writes each');
  sql.close();
});

test('a quiet record holds nothing to draw, and a read writes nothing', async () => {
  const sql = openSqlite();
  await openRecord(sql, fixedClock(NOW));
  sql.exec('DELETE FROM event');
  const quiet = read(sql, 'activity-by-who');
  assert.deepEqual([quiet.value, quiet.held, quiet.rows], [0, 0, 0], 'held is whether there was anything to read');
  assert.deepEqual(parts(quiet), { agent: 0, rule: 0, you: 0 });
  assert.deepEqual(read(sql, 'activity-by-kind').groups, []);
  assert.equal(read(sql, 'activity-by-hour').groups!.length, 24);
  assert.equal(sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM event')?.n, 0);
  sql.close();
});

test('the record answers them by their source word, and a member held to one list is refused all three, as the tidy is', async () => {
  const { sql } = await record();
  const ctx = { ...CTX, schemaOf: () => null };
  for (const id of ['activity-by-who', 'activity-by-kind', 'activity-by-hour']) {
    const decl = builtInFigure(id)!;
    const got = evaluateMetric(sql, decl, ctx);
    assert.ok(got.ok, id);
    assert.equal(got.value.value, 60, id);
    /* `*` is the whole record, which only somebody who reads every list may: the log says what was done on all of them. */
    assert.deepEqual(figureLists(decl), ['*'], `${id} named a list, so a member held to one list reads the whole log's counts`);
    assert.deepEqual(figureLists(decl), figureLists(builtInFigure('gone-stale')!));
  }
  sql.close();
});

test('a figure over the log that names no reading of it is refused by name', async () => {
  const { sql } = await record();
  const got = readActivity(sql, CTX, { ...builtInFigure('activity-by-who')!, activity: 'week' } as never);
  assert.equal(got.ok, false);
  const refusal = (got as { refusal: { code: string; fix: string; at?: string } }).refusal;
  assert.equal(refusal.code, 'VALUE_MALFORMED');
  assert.equal(refusal.at, 'activity');
  assert.match(refusal.fix, /who, kind, hour/u);
  sql.close();
});

test('through the record itself, over writes the record made: the figure counts the lines its own feed keeps', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const made = await k.install([
    { id: 'register.things', kind: 'register', body: { id: 'things', name: 'Things', title: 'name', fields: [{ id: 'name', type: 'text', required: true }, { id: 'checked', type: 'instant' }] } },
  ]);
  assert.ok(made.ok);
  const ids: string[] = [];
  for (let i = 0; i < 6; i++) {
    const row = k.create('things', { name: `Thing ${i}` }, { actor: i < 2 ? 'rule:renewal' : 'p_1' });
    assert.ok(row.ok);
    ids.push(row.value.id);
  }
  assert.ok(k.update('things', ids[0]!, { name: 'Thing renamed' }, { actor: 'p_1' }).ok);

  type Raw = { ts: string; actor: string; kind: string; target: string | null; target_kind: string | null; field: string | null; from_v: string | null; to_v: string | null };
  const json = (v: string | null): never => (v === null ? null : JSON.parse(v)) as never;
  const owners = (e: Raw): boolean => /^(?:grant|access|share)\./u.test(e.kind) || ['grant', 'vault_key', 'device_grant', 'member', 'person', 'sealed'].includes(e.target_kind ?? '');
  const kept = sql
    .all<Raw>('SELECT ts, actor, kind, target, target_kind, field, from_v, to_v FROM event')
    .filter((e) => !owners(e) && !k.bookkeeping({ ...e, from: json(e.from_v), to: json(e.to_v) }));
  assert.ok(kept.length >= 7, 'the record wrote its own lines for the writes made here');

  const who = k.metric(builtInFigure('activity-by-who')!);
  assert.ok(who.ok);
  const want = { agent: 0, rule: 0, you: 0 };
  for (const e of kept) want[byOf(e.actor)] += 1;
  assert.deepEqual(parts(who.value), want);
  assert.equal(who.value.value, kept.length);
  assert.ok(want.you >= 5 && want.rule >= 2);

  const kinds = k.metric(builtInFigure('activity-by-kind')!);
  assert.ok(kinds.ok);
  const created = kept.filter((e) => e.kind === 'create').length;
  assert.equal(kinds.value.groups!.find((g) => g.key === 'create')?.value, created);
  assert.ok(created >= 6);

  /* Every write was made at the record's one moment, 09:00 UTC, so the whole of it is that hour. */
  const hours = k.metric(builtInFigure('activity-by-hour')!);
  assert.ok(hours.ok);
  assert.equal(hours.value.value, kept.length);
  assert.equal(hours.value.groups!.filter((g) => (g.value ?? 0) > 0).length, 1);
  sql.close();
});

test('a bar or a split over a figure of the log draws its parts, though the figure is cut by `activity:` and groups by no word', async () => {
  const { sql, k } = await record();
  const page = {
    id: 'page.busy',
    kind: 'page',
    body: {
      page: 'busy',
      title: 'Busy',
      blocks: [
        { kind: 'split', heading: 'Who worked', source: 'metric.activity-by-who' },
        { kind: 'bar', heading: 'What changed', source: 'metric.activity-by-kind' },
        { kind: 'bar', heading: 'Busy hours', source: 'metric.activity-by-hour' },
      ],
    },
  };
  const made = await k.install([page as never]);
  assert.ok(made.ok, JSON.stringify(made));
  type Drawn = { heading?: string; refusals?: { code: string; fix: string }[]; readings?: { metric: string; reading: Reading | null }[] };
  const out = k.page('busy') as { ok: boolean; value: { blocks: Drawn[] } };
  assert.ok(out.ok, JSON.stringify(out));
  const [who, kinds, hours] = out.value.blocks;
  for (const b of [who!, kinds!, hours!]) assert.deepEqual(b.refusals ?? [], [], b.heading);
  /* THE SAME PARTS THE FIGURE ANSWERS READ ALONE, so a tile and an agent's read never say two counts. */
  assert.deepEqual(parts(who!.readings![0]!.reading!), parts(read(sql, 'activity-by-who')));
  assert.deepEqual(parts(kinds!.readings![0]!.reading!), parts(read(sql, 'activity-by-kind')));
  assert.equal(hours!.readings![0]!.reading!.groups!.length, 24);
  sql.close();
});
