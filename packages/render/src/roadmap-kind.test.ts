/**
 * `roadmap` as a kind: the fence a person or the record writes, what `toHTML` draws from it, and the
 * patch a drop on one of its bars means.
 *
 * `roadmap.test.ts` holds the packing and the month bands, which were written before the kind existed.
 * This file is the half that reads a task: a row is `title | by | effort`, the two fields a task already
 * carries (`packages/seed/src/modules/work.ts`), and a drag answers with those two fields changed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { KINDS, isKind } from './kinds.ts';
import { parse, type Block } from './parse.ts';
import { toHTML } from './html.ts';
import { DAY_SECONDS, ROADMAP_NONE, dragPatch, roadmapPlan, roadmapRow, roadmapShare, type DragMode } from './roadmap.ts';
import { addDays } from './forecast.ts';
import { day } from './format.ts';

const NOW = Date.UTC(2026, 8, 22, 12); // 2026-09-22
const TODAY = '2026-09-22';
const D = DAY_SECONDS;

/* ── the kind ─────────────────────────────────────────────────────────────── */

test('roadmap is a kind, a list with dates as the README has always called it, grouped with the plans', () => {
  assert.equal(isKind('roadmap'), true);
  const spec = KINDS.roadmap;
  assert.equal(spec.primitive, 'list');
  assert.equal(spec.purpose, 'plan');
  assert.equal(spec.tone, true);
  /* A WRITE-UP CAN CARRY ONE. Its rows are dates somebody can type, not the record's own activity. */
  assert.equal(spec.pageOnly, undefined);
});

test('a row is title, due day and effort, and a trailing tone word is read even when the effort is left off', () => {
  const [seg] = parse('```roadmap | Autumn\nBuild | 2026-09-10 | 10\nLaunch | 2026-09-30 | good\nRegate | 2026-10-05 | 3 | warn\n```');
  assert.equal(seg?.type, 'block');
  const rows = (seg as Block).rows;
  assert.deepEqual(rows.map((r) => [r.cells, r.tone]), [
    [['Build', '2026-09-10', '10'], undefined],
    [['Launch', '2026-09-30'], 'good'],
    [['Regate', '2026-10-05', '3'], 'warn'],
  ]);
});

/* ── a task as a window ───────────────────────────────────────────────────── */

test('a window ends on its due day and is as many whole days long as its effort, rounded up', () => {
  assert.deepEqual(roadmapRow('Build', '2026-09-10', '10'), { start: '2026-09-01', end: '2026-09-10', title: 'Build' });
  /* `display()` in the web writes a duration as `1.5 d`, so the unit is read as well as the bare number. A day and a
     half of work is in hand on two days, and a fifth of a day on one: the seed's tasks are mostly fractions. */
  assert.equal(roadmapRow('A', '2026-09-10', '1.5 d').start, '2026-09-09');
  assert.equal(roadmapRow('A', '2026-09-10', '0.2').start, '2026-09-10');
  assert.equal(roadmapRow('A', '2026-09-10', '3d').start, '2026-09-08');
});

test('no effort, or none at all, is a single date, and an effort that does not read is skipped rather than guessed', () => {
  assert.equal(roadmapRow('Due', '2026-09-10', '').start, '');
  assert.equal(roadmapRow('Due', '2026-09-10', '0').start, '');
  const plan = roadmapPlan(
    [
      roadmapRow('ok', '2026-09-10', '2'),
      roadmapRow('backwards', '2026-09-10', '-3'),
      roadmapRow('words', '2026-09-10', 'a while'),
      roadmapRow('no day', 'soon', '2'),
      roadmapRow('date', '2026-09-12', ''),
    ],
    TODAY,
  );
  assert.deepEqual(plan.skipped, [1, 2, 3]);
  assert.deepEqual(plan.bars.map((b) => b.row), [0]);
  assert.deepEqual(plan.stems.map((s) => s.row), [4]);
});

/* ── the drop ─────────────────────────────────────────────────────────────── */

test('a move shifts the due day and leaves the effort alone, on a window and on a date', () => {
  assert.deepEqual(dragPatch({ by: '2026-09-10', effort: 10 * D }, 'move', 3), { by: '2026-09-13' });
  assert.deepEqual(dragPatch({ by: '2026-09-10' }, 'move', -2), { by: '2026-09-08' });
  assert.deepEqual(dragPatch({ by: '2026-09-10', effort: null }, 'move', 30), { by: '2026-10-10' });
});

test('the start edge changes only the effort, and the end edge the due day and the effort together', () => {
  assert.deepEqual(dragPatch({ by: '2026-09-10', effort: 10 * D }, 'start', 2), { effort: 8 * D });
  assert.deepEqual(dragPatch({ by: '2026-09-10', effort: 10 * D }, 'start', -3), { effort: 13 * D });
  assert.deepEqual(dragPatch({ by: '2026-09-10', effort: 10 * D }, 'end', 4), { by: '2026-09-14', effort: 14 * D });
  assert.deepEqual(dragPatch({ by: '2026-09-10', effort: 10 * D }, 'end', -2), { by: '2026-09-08', effort: 8 * D });
});

test('an edge dragged past the other stops at a window of one day, never an end before its start', () => {
  assert.deepEqual(dragPatch({ by: '2026-09-10', effort: 10 * D }, 'start', 20), { effort: D });
  assert.deepEqual(dragPatch({ by: '2026-09-10', effort: 10 * D }, 'end', -20), { by: '2026-09-01', effort: D });
});

test('a fraction of a day of effort survives a resize, so a drag never rounds away what the record said', () => {
  /* 1.5 d is two days drawn. Pulling the start a day earlier adds a day of work, 2.5 d, three days drawn. Pushing
     it as far as it goes leaves one day drawn and the half day that was always there. */
  assert.deepEqual(dragPatch({ by: '2026-09-10', effort: 1.5 * D }, 'start', -1), { effort: 2.5 * D });
  assert.deepEqual(dragPatch({ by: '2026-09-10', effort: 1.5 * D }, 'start', 5), { effort: 0.5 * D });
  assert.deepEqual(dragPatch({ by: '2026-09-10', effort: 1.5 * D }, 'end', -5), { by: '2026-09-09', effort: 0.5 * D });
});

test('a drop that means no write answers null, so an undo is never spent on nothing', () => {
  assert.equal(dragPatch({ by: '2026-09-10', effort: 10 * D }, 'move', 0), null);
  /* Already one day: the start cannot go later and the end cannot go earlier. */
  assert.equal(dragPatch({ by: '2026-09-10', effort: D }, 'start', 1), null);
  assert.equal(dragPatch({ by: '2026-09-10', effort: 0.2 * D }, 'end', -1), null);
  /* A date has no edges to pull. */
  assert.equal(dragPatch({ by: '2026-09-10' }, 'start', -2), null);
  assert.equal(dragPatch({ by: '2026-09-10', effort: 0 }, 'end', 2), null);
  /* What the roadmap would not have drawn cannot have been dropped. */
  assert.equal(dragPatch({ by: 'soon', effort: D }, 'move', 1), null);
  assert.equal(dragPatch({ by: '2026-09-10', effort: -3 * D }, 'move', 1), null);
  assert.equal(dragPatch({ by: '2026-09-10', effort: Number.NaN }, 'move', 1), null);
  /* A drag lands on whole days; the drawer rounds the pointer, this does not round for it. */
  assert.equal(dragPatch({ by: '2026-09-10', effort: D }, 'move', 1.5), null);
});

test('EVERY PATCH REDRAWS AS THE DRAG SAID: the edge that moved moved by the days, the other stayed, and nothing reversed', () => {
  /* Not a restatement of the arithmetic: the patch is fed back through `roadmapRow`, the same reading the drawer
     makes of the record, and the window it draws is compared with the window before. Effort as the seed writes it. */
  const efforts = [0.2, 0.5, 1, 1.5, 2, 3, 10];
  const modes: DragMode[] = ['move', 'start', 'end'];
  let checked = 0;
  for (const days of efforts)
    for (const mode of modes)
      for (let shift = -12; shift <= 12; shift++) {
        const row = { by: '2026-09-15', effort: Math.round(days * D) };
        const before = roadmapRow('t', row.by, String(days));
        const patch = dragPatch(row, mode, shift);
        const next = { ...row, ...(patch ?? {}) };
        const after = roadmapRow('t', next.by, String(next.effort / D));
        assert.ok(after.start <= after.end, `${days} d ${mode} ${shift}: drew ${after.start} after ${after.end}`);
        const want =
          mode === 'move'
            ? { start: addDays(before.start, shift), end: addDays(before.end, shift) }
            : mode === 'start'
              ? { start: shift > 0 && addDays(before.start, shift) > before.end ? before.end : addDays(before.start, shift), end: before.end }
              : { start: before.start, end: shift < 0 && addDays(before.end, shift) < before.start ? before.start : addDays(before.end, shift) };
        assert.deepEqual({ start: after.start, end: after.end }, want, `${days} d ${mode} ${shift}`);
        assert.equal(patch === null, want.start === before.start && want.end === before.end, `${days} d ${mode} ${shift}: a no-op wrote, or a change did not`);
        checked++;
      }
  assert.equal(checked, 7 * 3 * 25);
});

/* ── the drawing ──────────────────────────────────────────────────────────── */

const FENCE = [
  '```roadmap | Autumn',
  'Build the kiln page | 2026-09-10 | 10',
  'Regate window | 2026-10-05 | 3 | warn',
  'Launch | 2026-09-30',
  'Someday | soon',
  '```',
].join('\n');

test('toHTML draws each row on its own track, its bar, its date and today where the plan put them', () => {
  const segments = parse(FENCE);
  assert.equal(segments.length, 1);
  assert.equal(segments[0]?.type, 'block', 'the fence degraded instead of drawing');
  const html = toHTML(segments, { now: NOW });
  assert.match(html, /data-kind="roadmap"/u);
  assert.match(html, /data-primitive="list"/u);

  const plan = roadmapPlan(
    [roadmapRow('Build the kiln page', '2026-09-10', '10'), roadmapRow('Regate window', '2026-10-05', '3', 'warn'), roadmapRow('Launch', '2026-09-30', ''), roadmapRow('Someday', 'soon', '')],
    TODAY,
  );
  /* `--at` AND `--span` ARE SHARES OF THE TRACK, as the stylesheet multiplies them by 100%. */
  const placed = [...html.matchAll(/<li class="roadmap-item"[^>]*style="--at:([^;]+);--span:([^"]+)"/gu)].map((m) => [m[1], m[2]]);
  assert.deepEqual(
    placed.filter(([, span]) => span !== '0'),
    plan.bars.map((b) => [roadmapShare(b.x), roadmapShare(b.width)]),
  );
  assert.ok(placed.every(([at]) => Number(at) >= 0 && Number(at) < 1));
  assert.equal([...html.matchAll(/data-date=""/gu)].length, 1, 'Launch is a date, a dot on its day');
  assert.equal([...html.matchAll(/class="roadmap-bar"/gu)].length, 3, 'every placed row has its mark on its track');
  assert.match(html, new RegExp(`<li class="roadmap-today" style="--at:${roadmapShare(plan.today!).replace('.', '\\.')}">Today</li>`, 'u'));
  /* Five weeks of work are named by the week, each Monday a day and a month. */
  assert.match(html, /<ol class="roadmap-axis" data-weekly="" aria-hidden="true"><li class="roadmap-tick" style="--at:[\d.]+">7 Sep<\/li>/u);
  assert.match(html, />5 Oct</u);
});

test('THE TIMELINE IS ONE LIST, NOT A STRETCHED DRAWING: no name is placed over another, and the list is named', () => {
  /* The names sat in a layer over a box drawn with `preserveAspectRatio="none"`, placed beside their bars, and at
     every width some ran into a bar, a line or each other. A row is a line of its own now, its name in
     a column, so the drawing has nothing to collide. */
  const html = toHTML(parse(FENCE), { now: NOW });
  assert.equal(html.includes('<svg'), false);
  assert.doesNotMatch(html, /roadmap-names|roadmap-chart/u);
  assert.match(html, /<ol class="roadmap-list" aria-label="[^"]+: 2 windows and 1 date\.">/u);
  assert.match(html, /<div class="roadmap" style="--rows:3">/u);
});

test('the rows are also a lane list a screen reader reads, each with its span of days, and the tone keeps its glyph', () => {
  const html = toHTML(parse(FENCE), { now: NOW });
  assert.match(html, /<span class="roadmap-item-title"[^>]*>Build the kiln page<\/span> <span class="roadmap-item-when num">1 – 10 Sep<\/span>/u);
  assert.match(html, /<span class="roadmap-item-title"[^>]*>Launch<\/span> <span class="roadmap-item-when num">30 Sep<\/span>/u);
  assert.doesNotMatch(html, /roadmap-table/u, 'no three-column table to break a name inside its words on a phone');
  assert.match(html, /Regate window<span class="glyph" role="img" aria-label="watch this">⚠︎<\/span>/u);
});

test('A ROW CARRIES ITS STATE, so a late one is drawn red and says so with its named dot', () => {
  const html = toHTML(parse('```roadmap | Kiln\nTurn auto-renew back on | 2026-09-10 | 1 | bad\nWrite the page | 2026-09-30 | 2\nShipped | 2026-09-12 | 2 | good\n```'), { now: NOW });
  assert.match(html, /<li class="roadmap-item" data-intent="bad"[^>]*><span class="roadmap-item-title"[^>]*>Turn auto-renew back on<span class="glyph" role="img" aria-label="wrong">/u);
  assert.match(html, /<li class="roadmap-item" data-intent="good"/u);
  assert.match(html, /<li class="roadmap-item"(?! data-intent)[^>]*><span class="roadmap-item-title"[^>]*>Write the page<\/span>/u, 'work in hand wears no intent');
});

test('THE TABLE KEEPS THE ORDER THE ROWS CAME IN, a date written first read first', () => {
  /* The plan hands back bars and then stems, so a table built in that order put every window ahead of every date.
     Removing the sort left the test above green, because its fence writes its date after its windows (measured). */
  const html = toHTML(parse('```roadmap | Order\nLaunch | 2026-09-30\nBuild | 2026-09-10 | 10\n```'), { now: NOW });
  assert.deepEqual([...html.matchAll(/<span class="roadmap-item-title"[^>]*>([^<]+)<\/span>/gu)].map((m) => m[1]), ['Launch', 'Build']);
});

test('a row that could not be placed is named under the drawing, never drawn somewhere it does not belong', () => {
  const html = toHTML(parse(FENCE), { now: NOW });
  assert.match(html, /<p class="roadmap-skipped">[^<]*Someday[^<]*<\/p>/u);
  assert.equal(/<span class="roadmap-item-title"[^>]*>Someday/u.test(html), false);
});

/* ── a date the calendar cannot say ───────────────────────────────────────── */

test('AN EFFORT TOO LONG FOR THE CALENDAR IS A ROW SKIPPED, NOT A DOCUMENT THROWN AWAY', () => {
  /* `999999999` days reads as an effort, and the start it gives is past what a `Date` holds, so `toISOString`
     threw a RangeError out of `toHTML`: the paragraph above the fence, and every other block, went with it
     (measured). One cell somebody typed has to cost that row and nothing else. */
  const fence = (effort: string): string => `Before\n\n\`\`\`roadmap | X\nToo long | 2026-09-10 | ${effort}\nFine | 2026-09-12 | 2\n\`\`\``;
  for (const effort of ['999999999', '1' + '0'.repeat(400)]) {
    const html = toHTML(parse(fence(effort)), { now: NOW });
    assert.match(html, /Before/u);
    assert.match(html, /<p class="roadmap-skipped">[^<]*Too long[^<]*<\/p>/u);
    assert.match(html, /<span class="roadmap-item-title"[^>]*>Fine<\/span>/u);
  }
});

test('A DROP THAT WOULD LAND OFF THE CALENDAR WRITES NOTHING, rather than a due day nothing can read back', () => {
  /* A day after 9999-12-31 came back as `+010000-01`, a `by` the roadmap then skipped, and a shift past what a
     `Date` holds threw. Both are drops that mean no write the roadmap could draw again. */
  assert.equal(dragPatch({ by: '9999-12-31', effort: D }, 'move', 1), null);
  assert.equal(dragPatch({ by: '9999-12-31', effort: D }, 'end', 1), null);
  assert.equal(dragPatch({ by: '2026-09-10', effort: D }, 'move', 1e9), null);
});

test('EVERY YEAR A DATE CAN SAY IS DRAWN AT A NUMBER, never at NaN', () => {
  /* `nextMonth` wrote the year unpadded, so the month after `0950-03` was `950-04-01`, which no date reads, and
     every position in the box came out `NaN`. December 9999 has no first of the month after it at all, so a row
     there is skipped, as any date the span cannot be built around is. */
  const early = toHTML(parse('```roadmap | Old\nA | 0950-03-01\nB | 0950-05-10 | 3\n```'), { now: NOW });
  assert.match(early, /class="roadmap-bar"/u);
  assert.equal(early.includes('NaN'), false, 'a year before 1000 drew at NaN');
  const last = toHTML(parse('```roadmap | Far\nA | 2026-09-10 | 2\nB | 9999-12-31\n```'), { now: NOW });
  assert.equal(last.includes('NaN'), false, 'December 9999 drew at NaN');
  assert.match(last, /<p class="roadmap-skipped">[^<]*B[^<]*<\/p>/u);
});

test('A CLOCK THAT IS NOT A DATE COSTS TODAY\'S LINE AND NOTHING ELSE', () => {
  /* `roadmapToday` guards `toISOString` against a host clock that is `NaN` or past what a `Date` holds, and no test
     asked it to: with the guard taken out every test in this package stayed green while `now: NaN` threw a
     RangeError out of `toHTML`, taking the paragraph above the fence with it (measured). */
  for (const now of [Number.NaN, Number.POSITIVE_INFINITY, 9e15]) {
    const html = toHTML(parse(`Before\n\n${FENCE}`), { now });
    assert.match(html, /Before/u, `now: ${now}`);
    assert.match(html, /class="roadmap-bar"/u, `now: ${now}`);
    assert.equal(html.includes('roadmap-today'), false, `now: ${now}`);
  }
});

test('A ROW SKIPPED FOR ITS EFFORT IS NOT TOLD ITS DATE IS WRONG', () => {
  /* The sentence under the drawing said "because the date does not read" for every skipped row, and a row is also
     skipped when its date is a good day and its effort is not a number of days: `2 days`, or `1,200 d` as the web's
     `display()` groups a four-figure effort. `Glaze | 2026-09-20 | 2 days` was told its date did not read, which
     sends the author to fix the one cell that was right (measured). */
  const html = toHTML(parse('```roadmap | X\nGlaze | 2026-09-20 | a fortnight\nFine | 2026-09-12 | 2\n```'), { now: NOW });
  const said = /<p class="roadmap-skipped">([^<]*)<\/p>/u.exec(html)?.[1] ?? '';
  assert.match(said, /Glaze/u);
  assert.match(said, /effort/u, `the sentence blames only the date: ${said}`);
  /* `2 days` IS AN EFFORT SINCE 242b4b2d2, as the list now says one, so that row draws and nothing is said of it. */
  const days = toHTML(parse('```roadmap | X\nGlaze | 2026-09-20 | 2 days\nFine | 2026-09-12 | 2\n```'), { now: NOW });
  assert.doesNotMatch(days, /roadmap-skipped/u);
  assert.match(days, /title="Glaze">Glaze<\/span> <span class="roadmap-item-when num">19 – 20 Sep/u);
});

test('with nothing to draw the block is its sentence, and today outside the span draws no line', () => {
  const none = toHTML(parse('```roadmap | Later\nSomeday | soon\n```'), { now: NOW });
  assert.equal(none.includes('<svg'), false);
  assert.ok(none.includes(ROADMAP_NONE));
  const later = toHTML(parse('```roadmap | Next year\nKiln | 2027-07-20 | 5\n```'), { now: NOW });
  assert.match(later, /class="roadmap-bar"/u);
  assert.equal(later.includes('roadmap-today'), false);
});

/* ── a roadmap bound to a list ────────────────────────────────────────────── */

/**
 * The fence the web's page reader wrote for `kind: roadmap, source: register.tasks` over three tasks, copied from
 * the probe: the record's own answer, through `blockOf` in `page-live.ts` and `draw` in `blocks.ts`. The reader
 * projects every cell through `display()`, and `display()` writes a `day` field with this package's `day()`, so
 * the due day arrives as `10 Oct 2026` and never as `2026-10-10`.
 */
const BOUND = ['```roadmap', 'Ship | 10 Oct 2026 | ', 'Fire | 5 Oct 2026 | 1.5 d', 'Glaze | 20 Sep 2026 | 2 d', '```'].join('\n');

test('A ROADMAP BOUND TO A LIST DRAWS ITS ROWS, read from the day this package writes and not only the day a person types', () => {
  /* MEASURED BEFORE THE FIX: the page drew `Nothing here has a date that can be drawn.` over three tasks that all had
     a due day, and named all three under it as rows whose date did not read. `roadmapRow` read `YYYY-MM-DD` alone,
     so no row the record projected onto a page could ever be placed. */
  const html = toHTML(parse(BOUND, { page: true }), { now: NOW });
  assert.equal(html.includes(ROADMAP_NONE), false, `the bound roadmap drew its sentence: ${html}`);
  assert.equal(html.includes('roadmap-skipped'), false, 'a row the record wrote was named as unreadable');
  assert.equal([...html.matchAll(/<li class="roadmap-item"(?![^>]*data-date)[^>]*>/gu)].length, 2, 'Fire and Glaze carry an effort and are windows');
  assert.equal([...html.matchAll(/data-date=""/gu)].length, 1, 'Ship carries none and is a date');
  /* And each is placed where its typed twin is, so the two spellings are one day and not merely both accepted. */
  assert.deepEqual(roadmapRow('Fire', '5 Oct 2026', '1.5 d'), roadmapRow('Fire', '2026-10-05', '1.5 d'));
  assert.deepEqual(roadmapRow('Ship', '10 Oct 2026', ''), roadmapRow('Ship', '2026-10-10', ''));
});

test('EVERY DAY `day()` WRITES READS BACK AS THE SAME DAY, so the formatter and the roadmap cannot drift apart', () => {
  /* Each month's first and last, a leap day, and the edges of what four digits say: a change to `day()` that the
     roadmap does not follow fails here instead of blanking every bound roadmap on every page. */
  const days = ['0001-01-01', '0950-03-15', '2024-02-29', '2026-09-01', '2026-12-31', '9999-11-30'];
  for (let m = 1; m <= 12; m += 1) days.push(`2026-${String(m).padStart(2, '0')}-01`, addDays(`${m === 12 ? 2027 : 2026}-${String((m % 12) + 1).padStart(2, '0')}-01`, -1));
  for (const iso of days) assert.equal(roadmapRow('A', day(iso), '').end, iso, `${day(iso)} did not read back as ${iso}`);
  /* And what is not a day stays unread, rather than being rolled into one: 30 February is skipped, as its ISO
     spelling is, and a month name nobody writes is not guessed. */
  for (const wrong of ['30 Feb 2026', '10 Sept 2026', '10 oct 2026', 'Oct 10 2026', '10 Oct 26'])
    assert.deepEqual(roadmapPlan([roadmapRow('A', wrong, '')], TODAY).skipped, [0], `${wrong} was placed`);
});
