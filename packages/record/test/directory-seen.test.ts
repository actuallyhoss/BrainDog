/**
 * Visits and the funnel (`seen`): a day's count a page and where it came from, the operator's week totals, and the
 * sweep of decided applications, against a real Directory and a fixed clock.
 *
 * WHAT MUST HOLD. A page or a came-from outside its closed list is never kept; the table holds a day, the two names and
 * a count and nothing else; each ISO week from the one `since` falls in is answered, a quiet one zero; an application
 * is deleted 90 days after it was decided and never while it waits; and every copy carries the counts.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { APPLY_DECIDED_DAYS, CARRIED, FUNNEL_WEEKS_MOST, SEEN_CAME, SEEN_PAGES, createDirectory, type FunnelWeek } from '../src/directory.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

/** Saturday 17 October 2026: its ISO week began on Monday the 12th. */
const NOW = Date.UTC(2026, 9, 17, 9);
const DAY = 86_400_000;

const refusalOf = (r: { ok: boolean }): { code: string; at?: string } | null => ('refusal' in r ? (r as { refusal: { code: string; at?: string } }).refusal : null);

function setup() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const d = createDirectory(sql, clock, { mac: new Uint8Array(32).fill(7), magic: true });
  return { sql, clock, d };
}

const rows = (sql: ReturnType<typeof openSqlite>) =>
  sql.all<{ day: string; page: string; came: string; n: number }>('SELECT day, page, came, n FROM dir_seen ORDER BY day, page, came').map((r) => ({ ...r }));

test('A VISIT IS COUNTED A DAY, A PAGE AND WHERE IT CAME FROM, and nothing else is kept', () => {
  const { sql, clock, d } = setup();
  assert.deepEqual(d.seen({ flow: 'seen.count', page: 'home', came: 'search' }), { counted: true });
  assert.deepEqual(d.seen({ flow: 'seen.count', page: 'home', came: 'search' }), { counted: true });
  assert.deepEqual(d.seen({ flow: 'seen.count', page: 'pricing', came: 'direct' }), { counted: true });
  clock.advance(DAY);
  d.seen({ flow: 'seen.count', page: 'home', came: 'search' });
  assert.deepEqual(rows(sql), [
    { day: '2026-10-17', page: 'home', came: 'search', n: 2 },
    { day: '2026-10-17', page: 'pricing', came: 'direct', n: 1 },
    { day: '2026-10-18', page: 'home', came: 'search', n: 1 },
  ]);
  const columns = sql.all<{ name: string }>("SELECT name FROM pragma_table_info('dir_seen') ORDER BY cid").map((c) => c.name);
  assert.deepEqual(columns, ['day', 'page', 'came', 'n'], 'a column that could tell one visitor from another');
});

test('A PAGE OR A CAME-FROM OUTSIDE ITS LIST IS NEVER KEPT, whatever the Worker let through', () => {
  const { sql, d } = setup();
  for (const [page, came] of [
    ['/pricing', 'direct'],
    ['home', 'news.example.com'],
    ['Home', 'search'],
    ['home?ref=mail', 'search'],
    [7, 'search'],
    ['home', null],
  ] as const)
    assert.deepEqual(d.seen({ flow: 'seen.count', page: page as string, came: came as string }), { counted: false });
  assert.deepEqual(rows(sql), []);
  for (const page of SEEN_PAGES) assert.match(page, /^[a-z-]+$/);
  for (const came of SEEN_CAME) assert.match(came, /^[a-z-]+$/);
});

test('THE FUNNEL ANSWERS EVERY ISO WEEK FROM THE ONE SINCE FALLS IN, from where each step is already kept', () => {
  const { sql, clock, d } = setup();
  /* Last week (Monday 5 October to Sunday 11 October), and this one. */
  clock.set(Date.UTC(2026, 9, 11, 23, 59));
  d.seen({ flow: 'seen.count', page: 'home', came: 'direct' });
  d.seen({ flow: 'seen.count', page: 'docs', came: 'github' });
  clock.set(NOW);
  for (let i = 0; i < 3; i++) d.seen({ flow: 'seen.count', page: 'home', came: 'search' });
  const iso = (ms: number) => new Date(ms).toISOString();
  sql.exec('INSERT INTO dir_person (id, email, name, created_at) VALUES (?, ?, ?, ?)', 'p_a', 'ines@example.com', 'Ines', iso(Date.UTC(2026, 9, 6)));
  sql.exec('INSERT INTO dir_person (id, email, name, created_at) VALUES (?, ?, ?, ?)', 'p_b', 'tomas@example.com', 'Tomas', iso(Date.UTC(2026, 9, 12)));
  sql.exec('INSERT INTO dir_person (id, email, name, created_at) VALUES (?, ?, ?, ?)', 'p_c', 'old@example.com', null, iso(Date.UTC(2026, 8, 1)));
  sql.exec('INSERT INTO dir_record (id, owner, created_at, closed_at) VALUES (?, ?, ?, ?)', 'rec_a', 'p_b', iso(Date.UTC(2026, 9, 12, 1)), iso(Date.UTC(2026, 9, 13)));
  sql.exec('INSERT INTO dir_apply (id, email, name, made_at, updated_at) VALUES (?, ?, ?, ?, ?)', 'a1', 'ines@example.com', 'Ines', Date.UTC(2026, 9, 5), Date.UTC(2026, 9, 5));
  sql.exec('INSERT INTO dir_invite (code_hash, made_at, spent_at, person) VALUES (?, ?, ?, ?)', 'f'.repeat(64), Date.UTC(2026, 9, 1), Date.UTC(2026, 9, 12), 'p_b');
  sql.exec('INSERT INTO dir_invite (code_hash, made_at) VALUES (?, ?)', 'e'.repeat(64), Date.UTC(2026, 9, 1));

  const out = d.seen({ flow: 'funnel.read', since: Date.UTC(2026, 8, 30, 15) });
  assert.ok(out.ok);
  const weeks: FunnelWeek[] = out.value.weeks;
  assert.deepEqual(weeks, [
    { week: '2026-09-28', seen: 0, signed_up: 0, records: 0, applied: 0, invites_used: 0 },
    { week: '2026-10-05', seen: 2, signed_up: 1, records: 0, applied: 1, invites_used: 0 },
    { week: '2026-10-12', seen: 3, signed_up: 1, records: 1, applied: 0, invites_used: 1 },
  ]);
  const later = d.seen({ flow: 'funnel.read', since: NOW + 30 * DAY });
  assert.ok(later.ok);
  assert.deepEqual(later.value.weeks.map((w) => w.week), ['2026-10-12'], 'a since after now reads this week');
});

test('THE FUNNEL REFUSES A SINCE IT CANNOT READ, by name', () => {
  const { d } = setup();
  for (const since of ['yesterday', -1, 1.5, Number.NaN]) {
    const out = d.seen({ flow: 'funnel.read', since: since as number });
    assert.equal(out.ok, false);
    assert.equal(refusalOf(out)?.at, 'since');
  }
  const far = d.seen({ flow: 'funnel.read', since: NOW - (FUNNEL_WEEKS_MOST + 1) * 7 * DAY });
  assert.equal(refusalOf(far)?.code, 'OUT_OF_BOUNDS');
  assert.ok(d.seen({ flow: 'funnel.read', since: NOW - (FUNNEL_WEEKS_MOST - 1) * 7 * DAY }).ok);
});

test('A DECIDED APPLICATION IS DELETED 90 DAYS AFTER IT WAS DECIDED, and a waiting one never is', async () => {
  const { sql, clock, d } = setup();
  const at = NOW - (APPLY_DECIDED_DAYS + 1) * DAY;
  const put = (id: string, state: string, decided: number | null) =>
    sql.exec('INSERT INTO dir_apply (id, email, name, made_at, updated_at, state, decided_at) VALUES (?, ?, ?, ?, ?, ?, ?)', id, `${id}@example.com`, id, at - DAY, at - DAY, state, decided);
  put('old-declined', 'declined', at);
  put('old-invited', 'invited', at);
  put('new-declined', 'declined', NOW - DAY);
  put('waiting', 'waiting', null);
  const left = (await d.applications({ flow: 'apply.list' })).map((r) => r.id).sort();
  assert.deepEqual(left, ['new-declined', 'waiting']);
  clock.advance(APPLY_DECIDED_DAYS * DAY);
  assert.deepEqual((await d.applications({ flow: 'apply.list' })).map((r) => r.id), ['waiting']);
});

test('EVERY COPY CARRIES THE COUNTS, and a copy made before them still loads', () => {
  const from = setup();
  from.d.seen({ flow: 'seen.count', page: 'support', came: 'reddit' });
  assert.ok((CARRIED as readonly string[]).includes('dir_seen'));
  const lines = from.d.dump();
  const to = setup();
  assert.ok(to.d.load(lines).ok);
  assert.deepEqual(rows(to.sql), rows(from.sql));
  const at = lines.indexOf('#table dir_seen');
  assert.ok(at > 0);
  let end = lines.findIndex((l, i) => i > at && l.startsWith('#table '));
  if (end < 0) end = lines.length;
  assert.ok(setup().d.load([...lines.slice(0, at), ...lines.slice(end)]).ok);
});
