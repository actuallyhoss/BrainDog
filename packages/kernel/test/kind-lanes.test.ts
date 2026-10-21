/**
 * The `lanes` kind: a list's rows as swimlanes over the hours up to now, each from its start to its end.
 *
 * THE KIND IS REGISTERED BEFORE THE KERNEL LOADS, where the registry does not hold it already, because `declare.ts`
 * and `block-keys.ts` build their lists from the registry when they load (`kinds/index.ts`). So only the kind module is
 * imported before that line, and the kernel after it, as `kinds-registry.test.ts` does.
 *
 * EACH TEST DRIVES A REAL RECORD over `node:sqlite`, so the install check, the key closure and the read are the
 * kernel's own.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Declaration } from '../src/index.ts';
import type { BlockResult, PageBlock } from '../src/pages.ts';
import { BLOCK_KIND_MODULES } from '../src/kinds/index.ts';
import { HOURS_MOST, LANES_MOST, lanes, type LanesAnswer } from '../src/kinds/lanes.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

BLOCK_KIND_MODULES.lanes ??= lanes;

const { openRecord } = await import('../src/index.ts');

/* NOW IS NOON ON 25 SEPTEMBER 2026, so lanes that say nothing show from noon on the 24th. */
const NOW = Date.UTC(2026, 8, 25, 12);
const OWNER = { actor: 'p_1' };

const RUNS: Declaration = {
  id: 'register.runs',
  kind: 'register',
  body: {
    id: 'runs',
    name: 'Runs',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'started', type: 'instant' },
      { id: 'ended', type: 'instant' },
      { id: 'on', type: 'day' },
      { id: 'state', type: 'enum', values: ['working', 'done', 'blocked'], default: 'working' },
    ],
    state: 'state',
    done: ['done'],
  } as never,
};

const pageOf = (...blocks: Record<string, unknown>[]): Declaration => ({
  id: 'page.desk',
  kind: 'page',
  body: { page: 'desk', title: 'Desk', requires: ['register.runs'], blocks } as never,
});

const at = (day: number, hour: number): string => new Date(Date.UTC(2026, 8, day, hour)).toISOString();

async function record(rows = true) {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([RUNS])).ok);
  if (rows)
    for (const [what, started, ended, state] of [
      ['Deploy', at(25, 11), undefined, 'blocked'],
      ['Old import', at(23, 8), at(23, 9), 'done'],
      ['Morning build', at(25, 8), at(25, 9), 'done'],
      ['Night sync', at(24, 10), at(24, 13), 'done'],
      ['Tomorrow', at(25, 13), undefined, 'working'],
      ['Never begun', undefined, undefined, 'working'],
    ] as const)
      assert.ok(k.create('runs', { what, state, ...(started ? { started } : {}), ...(ended ? { ended } : {}) }, OWNER).ok, `${what} was not written`);
  return { k, sql };
}

/** The refusal an install answered, or `null` when it installed. */
const refusalOf = (out: { ok: boolean }) => (!out.ok && 'refusal' in out ? (out as { refusal: { code: string; fix: string; at?: string; allowed?: readonly string[] } }).refusal : null);

const block = (b: Record<string, unknown>): PageBlock => b as unknown as PageBlock;
const answerOf = (b: BlockResult): LanesAnswer => b as unknown as LanesAnswer;

const LANES = {
  kind: 'lanes',
  heading: 'The last day',
  source: 'register.runs',
  columns: [{ field: 'what' }, { field: 'started' }, { field: 'ended' }],
};
const TONED = { ...LANES, columns: [...LANES.columns, { field: 'state' }], tones: { blocked: 'bad', done: 'good' } };

test('lanes install, and read the rows that overlap the last day, in start order, with the window they read', async () => {
  const { k, sql } = await record();
  assert.equal(refusalOf(await k.install([pageOf(LANES)])), null, 'lanes over a list were refused at install');
  const read = answerOf(k.block(block(LANES)));
  assert.deepEqual(read.refusals, []);
  assert.deepEqual(read.window, { from: at(24, 12), to: at(25, 12), now: at(25, 12) });
  /* A RUN THAT ENDED INSIDE THE DAY KEEPS THE START IT HAD BEFORE IT, and one still going has no end. */
  assert.deepEqual(read.lanes, [
    { title: 'Night sync', start: at(24, 10), end: at(24, 13), href: '/r/runs/4' },
    { title: 'Morning build', start: at(25, 8), end: at(25, 9), href: '/r/runs/3' },
    { title: 'Deploy', start: at(25, 11), end: null, href: '/r/runs/1' },
  ]);
  assert.equal(read.matched, 3);
  assert.deepEqual(
    read.rows.map((r) => r.fields.what),
    read.lanes.map((l) => l.title),
    'the lanes and the rows are not one order',
  );

  /* `hours:` REACHES FURTHER BACK, and a row that has not started yet, or never did, is still left out. */
  const week = answerOf(k.block(block({ ...LANES, hours: 72 })));
  assert.equal(week.window.from, at(22, 12));
  assert.deepEqual(
    week.lanes.map((l) => l.title),
    ['Old import', 'Night sync', 'Morning build', 'Deploy'],
  );

  /* AND `where:` NARROWS THEM AS IT DOES ANY BLOCK. */
  const open = answerOf(k.block(block({ ...LANES, where: 'state is blocked' })));
  assert.deepEqual(
    open.lanes.map((l) => l.title),
    ['Deploy'],
  );
  sql.close();
});

test('a fourth column picks each lane a tone through tones:, and a value it does not name is neutral', async () => {
  const { k, sql } = await record();
  assert.equal(refusalOf(await k.install([pageOf(TONED)])), null, 'toned lanes were refused at install');
  const read = answerOf(k.block(block({ ...TONED, tones: { blocked: 'bad' } })));
  assert.deepEqual(read.refusals, []);
  assert.deepEqual(
    read.lanes.map((l) => [l.title, l.tone]),
    [
      ['Night sync', undefined],
      ['Morning build', undefined],
      ['Deploy', 'bad'],
    ],
  );
  assert.ok(!('tone' in read.lanes[0]!), 'a neutral lane carried a tone key');
  sql.close();
});

test('lanes take hours up to a week, no limit, tones that are tones, and columns they can place a lane by', async () => {
  const { k, sql } = await record(false);
  for (const hours of [0, HOURS_MOST + 1, 1.5, '24']) {
    const far = refusalOf(await k.install([pageOf({ ...LANES, hours })]));
    assert.equal(far?.code, 'OUT_OF_BOUNDS', `hours: ${JSON.stringify(hours)} installed`);
    assert.match(far?.at ?? '', /blocks\[0\]\.hours$/u);
  }
  assert.equal(refusalOf(await k.install([pageOf({ ...LANES, hours: HOURS_MOST })])), null);

  const cut = refusalOf(await k.install([pageOf({ ...LANES, limit: 5 })]));
  assert.equal(cut?.code, 'DECLARATION_INVALID');
  assert.match(cut?.at ?? '', /blocks\[0\]\.limit$/u);

  const loud = refusalOf(await k.install([pageOf({ ...TONED, tones: { blocked: 'red' } })]));
  assert.equal(loud?.code, 'DECLARATION_INVALID');
  assert.match(loud?.at ?? '', /blocks\[0\]\.tones$/u);
  assert.match(loud?.fix ?? '', /a tone is one of good, warn, bad or info\.$/u);
  assert.deepEqual(loud?.allowed, ['good', 'warn', 'bad', 'info']);

  const unread = refusalOf(await k.install([pageOf({ ...LANES, tones: { blocked: 'bad' } })]));
  assert.match(unread?.at ?? '', /blocks\[0\]\.tones$/u);
  assert.match(unread?.fix ?? '', /by its fourth column/u);

  const two = refusalOf(await k.install([pageOf({ ...LANES, columns: LANES.columns.slice(0, 2) })]));
  assert.equal(two?.code, 'DECLARATION_INVALID');
  assert.match(two?.fix ?? '', /names 2\.$/u);

  /* A DAY AS THE START IS REFUSED AT READ, where the list is in hand, naming the fields that are instants. */
  const day = k.block(block({ ...LANES, columns: [{ field: 'what' }, { field: 'on' }, { field: 'ended' }] }));
  assert.equal(day.rows.length, 0);
  assert.equal(day.refusals[0]?.code, 'DECLARATION_INVALID');
  assert.match(day.refusals[0]?.fix ?? '', /second column is when it started, an instant field, and runs's on is day\.$/u);
  assert.deepEqual(day.refusals[0]?.allowed, ['started', 'ended']);
  /* AND THE REFUSED BLOCK STILL SAYS ITS WINDOW, with no lanes, so a host draws the empty track and the sentence. */
  assert.deepEqual(answerOf(day).lanes, []);
  assert.equal(answerOf(day).window.now, at(25, 12));

  /* A KEY ONLY LANES READ IS REFUSED ON EVERY OTHER KIND. */
  const stray = refusalOf(await k.install([pageOf({ kind: 'note', heading: 'Words', body: 'x', hours: 4 })]));
  assert.match(stray?.fix ?? '', /hours: is read by lanes blocks/u);
  sql.close();
});

test('lanes written out are drawn as written, inside the hours, and one with no start is refused at install', async () => {
  const { k, sql } = await record(false);
  const WRITTEN = {
    kind: 'lanes',
    heading: 'By hand',
    tones: { late: 'warn' },
    authored: [
      { cells: ['Still going', '2026-09-25T10:00:00Z', '', 'late'] },
      { cells: ['Earlier', '2026-09-25T09:00:00+02:00', '2026-09-25T08:00:00Z'] },
      { cells: ['Last week', '2026-09-18T09:00:00Z', '2026-09-18T10:00:00Z'] },
    ],
  };
  assert.equal(refusalOf(await k.install([pageOf(WRITTEN)])), null, 'lanes written out were refused at install');
  const read = answerOf(k.block(block(WRITTEN)));
  assert.deepEqual(read.refusals, []);
  assert.deepEqual(read.lanes, [
    { title: 'Earlier', start: at(25, 7), end: at(25, 8) },
    { title: 'Still going', start: at(25, 10), end: null, tone: 'warn' },
  ]);

  for (const cells of [
    ['No start'],
    ['A day', '2026-09-25'],
    ['No zone', '2026-09-25T10:00:00'],
    ['No such day', '2026-02-30T10:00:00Z'],
    ['Bad end', '2026-09-25T10:00:00Z', 'soon'],
  ]) {
    const said = refusalOf(await k.install([pageOf({ kind: 'lanes', heading: 'By hand', authored: [{ cells }] })]));
    assert.equal(said?.code, 'DECLARATION_INVALID', `${cells[0]} installed`);
    assert.match(said?.at ?? '', /blocks\[0\]\.authored$/u);
  }
  const backwards = refusalOf(await k.install([pageOf({ kind: 'lanes', authored: [{ cells: ['Backwards', '2026-09-25T10:00:00Z', '2026-09-25T09:00:00Z'] }] })]));
  assert.match(backwards?.fix ?? '', /ends after it starts/u);

  /* AND LANES THAT NAME NEITHER A LIST NOR ROWS SAY SO WHERE THEY ARE READ. */
  const bare = k.block(block({ kind: 'lanes' }));
  assert.equal(bare.refusals[0]?.at, 'source');
  sql.close();
});

test('a busy stretch draws its newest lanes, the most there are, and counts the rest; it never refuses', async () => {
  const { k, sql } = await record(false);
  /* MORE RUNS THAN LANES DRAW, each started a minute after the last, so the newest are the last made. */
  const more = 87;
  const minute = (n: number): string => new Date(Date.UTC(2026, 8, 25, 2) + n * 60_000).toISOString();
  for (let i = 0; i < LANES_MOST + more; i++) assert.ok(k.create('runs', { what: `Run ${i}`, started: minute(i), ended: minute(i + 1) }, OWNER).ok);
  const read = answerOf(k.block(block(LANES)));
  assert.deepEqual(read.refusals, []);
  assert.equal(read.lanes.length, LANES_MOST);
  assert.equal(read.rows.length, LANES_MOST);
  assert.equal(read.matched, LANES_MOST + more);
  assert.equal((read as { more?: number }).more, more);
  /* THE NEWEST, IN START ORDER: the first drawn is the oldest of them, the last the newest run of all. */
  assert.equal(read.lanes[0]?.title, `Run ${more}`);
  assert.equal(read.lanes.at(-1)?.title, `Run ${LANES_MOST + more - 1}`);
  assert.deepEqual(read.lanes.map((l) => l.start), [...read.lanes.map((l) => l.start)].sort());

  /* A NARROWER WHERE COUNTS ONE FEWER LEFT OUT, and a stretch that fits draws every row and says no more. */
  const narrowed = answerOf(k.block(block({ ...LANES, where: 'what is not "Run 0"' })));
  assert.equal((narrowed as { more?: number }).more, more - 1);
  const fits = answerOf(k.block(block({ ...LANES, where: 'what is not "Run 0"', hours: 7 })));
  assert.deepEqual(fits.refusals, []);
  assert.equal((fits as { more?: number }).more, undefined);
  assert.equal(fits.lanes.length, fits.matched);
  assert.ok(fits.matched > 0 && fits.matched <= LANES_MOST, String(fits.matched));
  sql.close();
});

test('the window is written in the record\'s zone, and the lanes are the same moments they were', async () => {
  const { k, sql } = await record();
  assert.ok(k.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'studio', name: 'Studio', tz: 'Asia/Kolkata', locale: 'en', owner: { id: 'p_1', name: 'A' } }).ok);
  const read = answerOf(k.block(block(LANES)));
  assert.deepEqual(read.refusals, []);
  /* NOON UTC IS HALF PAST FIVE IN KOLKATA, the same instant, so the same rows overlap it. */
  assert.deepEqual(read.window, { from: '2026-09-24T17:30:00.000+05:30', to: '2026-09-25T17:30:00.000+05:30', now: '2026-09-25T17:30:00.000+05:30' });
  assert.equal(Date.parse(read.window.now), NOW);
  assert.deepEqual(
    read.lanes.map((l) => [l.title, l.start]),
    [
      ['Night sync', at(24, 10)],
      ['Morning build', at(25, 8)],
      ['Deploy', at(25, 11)],
    ],
  );
  sql.close();
});

test('over the list of runs, a run at work has not ended: its lane runs to now, whatever its last heard says', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const run = (doing: string, state: string, startedAgo: number, heardAgo: number) => {
    const made = k.create(
      'session',
      { doing, agent: 'claude', state },
      { actor: 'p_1', stamp: { started: new Date(NOW - startedAgo * 60_000).toISOString(), last_seen: new Date(NOW - heardAgo * 60_000).toISOString() } },
    );
    assert.ok(made.ok, JSON.stringify(made));
  };
  run('Variable axis QA', 'active', 210, 3);
  run('Release notes', 'active', 300, 95);
  run('Invoice check', 'done', 240, 120);
  const read = answerOf(k.block(block({ kind: 'lanes', source: 'register.session', columns: [{ field: 'doing' }, { field: 'started' }, { field: 'last_seen' }] })));
  assert.deepEqual(read.refusals, []);
  const ends = Object.fromEntries(read.lanes.map((l) => [l.title, l.end]));
  /* WORKING BY THE ONE CLOCK, heard three minutes ago: still going, so the host draws it to now and says "Since". */
  assert.equal(ends['Variable axis QA'], null);
  /* GONE QUIET AN HOUR AND A HALF AGO, and done: each ends when it was last heard from. */
  assert.equal(ends['Release notes'], new Date(NOW - 95 * 60_000).toISOString());
  assert.equal(ends['Invoice check'], new Date(NOW - 120 * 60_000).toISOString());
  sql.close();
});
