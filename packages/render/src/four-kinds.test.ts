/**
 * What the four newer kinds, the two card roles and a path's short view decide, asked of the functions both drawers
 * call, without a DOM. `parity.test.ts` holds the two drawers to one tree over the same shapes; this holds the
 * decisions under them to what `05 §2.1` says they are.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parse } from './parse.ts';
import { toHTML } from './html.ts';
import { CALENDAR_MONTHS_MOST, calendarDay, calendarPlan, calendarSaid } from './calendar.ts';
import { EMBED_PROVIDERS, embedAspect, embedFault, embedOf, embedPlan } from './embed.ts';
import { LINK_ADDRESS, linkFault, linkHost, linkHref, linkPlan } from './links.ts';
import { fileRef, galleryPlan, isPictureMime, pictureSrc } from './gallery.ts';
import { CARD_ROLES, cardFault, cardLayout, hueOf } from './cards.ts';
import { pathFault, pathPlan, pathShort } from './path.ts';

const rows = (...lines: string[][]) => lines.map((cells) => ({ cells }));

/* ── calendar ─────────────────────────────────────────────────────────────── */

test('A CALENDAR READS A DAY IN THE THREE SPELLINGS A PAGE WRITES ONE, and guesses at nothing else', () => {
  assert.equal(calendarDay('2026-09-12'), '2026-09-12');
  assert.equal(calendarDay('2026-09-12T23:30:00Z'), '2026-09-12', 'an instant is its own day as written');
  assert.equal(calendarDay('12 Sep 2026'), '2026-09-12', 'the spelling `day()` writes');
  assert.equal(calendarDay('12 Sep', Date.UTC(2026, 9, 22)), '2026-09-12', 'a day with no year is the reader\'s own');
  assert.equal(calendarDay('30 Feb 2026'), null, 'a day the calendar does not have');
  assert.equal(calendarDay('Sep 12'), null);
  assert.equal(calendarDay('soon'), null);
});

test('EVERY MONTH FROM THE FIRST ROW TO THE LAST IS A GRID, a day names three and counts the rest, and the agenda says all', () => {
  const plan = calendarPlan(
    rows(['A', '2026-09-12'], ['B', '2026-09-12'], ['C', '2026-09-12'], ['D', '2026-09-12'], ['E', '2026-11-02'], ['F', 'soon']),
    '2026-09-12',
  );
  assert.deepEqual(plan.months.map((m) => m.label), ['September 2026', 'October 2026', 'November 2026'], 'an empty month between is still drawn');
  const day = plan.months[0]!.weeks.flat().find((c) => c.day === '2026-09-12')!;
  assert.deepEqual(day.items.map((r) => r.cells[0]), ['A', 'B', 'C']);
  assert.equal(day.more, 1);
  assert.equal(day.count, 4);
  assert.equal(day.today, true);
  assert.ok(plan.months[0]!.weeks.every((w) => w.length === 7), 'whole weeks');
  assert.equal(plan.months[0]!.weeks[0]![0]!.day, '2026-08-31', 'a week starts on Monday, the day before the month outside it');
  assert.equal(plan.months[0]!.weeks[0]![0]!.inside, false);
  assert.deepEqual(plan.days.map((d) => [d.day, d.items.length]), [['2026-09-12', 4], ['2026-11-02', 1]]);
  assert.deepEqual(plan.skipped, [5], 'the row with no day is named, never lost');
});

test('A CALENDAR WITH NO DAY THAT READS IS EMPTY, and one reaching past the most months keeps every row in its agenda', () => {
  assert.equal(calendarPlan(rows(['A', 'soon']), '2026-09-12').empty, true);
  const long = calendarPlan(rows(['A', '2026-01-05'], ['B', '2028-01-05']), '2026-09-12');
  assert.equal(long.months.length, CALENDAR_MONTHS_MOST);
  assert.equal(long.days.length, 2);
  assert.equal(calendarSaid('2026-09-12', '2026-01-01'), 'Sat 12 Sep');
  assert.equal(calendarSaid('2027-09-12', '2026-01-01'), 'Sun 12 Sep 2027', 'another year says its year');
});

test('a calendar fence draws its months as tables and its agenda, and the unread row under them', () => {
  const html = toHTML(parse('```calendar\nKiln launch | 2026-09-12\nSomeday | soon\n```', { page: true }), { now: Date.UTC(2026, 8, 12, 12) });
  assert.match(html, /<table class="calendar-month"><caption class="calendar-caption">September 2026<\/caption>/u);
  assert.match(html, /<td class="calendar-cell" data-today="" data-count="1"><span class="calendar-num num">12<\/span>/u);
  assert.match(html, /<ol class="calendar-agenda"><li class="calendar-day" data-today=""><span class="calendar-date num">Sat 12 Sep<\/span>/u);
  assert.match(html, /<p class="calendar-skipped">Not on the calendar, because the day does not read: Someday\.<\/p>/u);
});

/* ── link ─────────────────────────────────────────────────────────────────── */

test('A LINK IS AN HTTPS ADDRESS, A MAILTO OR A PATH OF THIS BRAINDOG, and anything else is a fault in those words', () => {
  assert.equal(linkHref('https://example.com/a'), 'https://example.com/a');
  assert.equal(linkHref('mailto:hello@example.com'), 'mailto:hello@example.com');
  assert.equal(linkHref('/p/plan'), '/p/plan');
  for (const bad of ['http://example.com', 'javascript:alert(1)', '//evil.example/x', '#top', 'ftp://x']) assert.equal(linkHref(bad), null, bad);
  assert.equal(linkFault([['A', 'https://example.com'], ['B', '', 'no address yet']]), null, 'an empty address is a bookmark nobody filled in');
  assert.equal(linkFault([['A', 'http://example.com']]), `"http://example.com" is not a link here. ${LINK_ADDRESS}`);
});

test('a link says the host it leaves for, the address a mailto writes to, and nothing for a path of this BrainDog', () => {
  assert.equal(linkHost('https://www.example.com/a'), 'example.com');
  assert.equal(linkHost('mailto:hello%40x@example.com?subject=Hi'), 'hello@x@example.com');
  assert.equal(linkHost('/p/plan'), '');
  const [line] = linkPlan(rows(['', 'https://example.org']));
  assert.equal(line?.title, 'https://example.org', 'a row with no title is titled by its address');
  assert.equal(line?.away, true);
});

/* ── gallery and the picture role ─────────────────────────────────────────── */

test('A PICTURE IS A FILE THE HOST SERVES AS A PATH OF ITS OWN, and a file that is not a picture is its name', () => {
  assert.deepEqual(fileRef('file:parts#2/photo'), { row: 'parts#2', field: 'photo' });
  assert.equal(fileRef('photo.png'), null);
  const serves = (row: string, field: string) => (row === 'parts#2' ? `/files/${row}/${field}` : row === 'parts#3' ? 'https://elsewhere.example/x.png' : null);
  assert.equal(pictureSrc('file:parts#2/photo', serves), '/files/parts#2/photo');
  assert.equal(pictureSrc('file:parts#3/photo', serves), null, 'a remote picture is never drawn on a page');
  const tiles = galleryPlan(rows(['Glaze', 'file:parts#2/photo'], ['Quote', 'quote.pdf'], ['', 'file:parts#9/photo'], ['Words', '']), serves);
  assert.deepEqual(
    tiles.map((t) => [t.caption, t.src, t.name]),
    [
      ['Glaze', '/files/parts#2/photo', ''],
      ['Quote', null, 'quote.pdf'],
      ['Words', null, ''],
    ],
    'a tile with nothing to show is left out, and a reference the host cannot serve is never printed',
  );
  assert.equal(isPictureMime('image/png'), true);
  assert.equal(isPictureMime('image/svg+xml'), false, 'a picture that can carry script is a file, not a picture');
  assert.equal(isPictureMime('application/pdf'), false);
});

test('A CARD\'S HUE IS A TURN FROM 0 TO 359 IN DIGITS, and the two roles are roles a card takes once each', () => {
  assert.equal(hueOf('0'), 0);
  assert.equal(hueOf(' 359 '), 359);
  for (const bad of ['360', '-5', '12.5', '1e2', 'red', '120;color:red', '']) assert.equal(hueOf(bad), null, bad);
  assert.ok(CARD_ROLES.includes('hue') && CARD_ROLES.includes('picture'));
  assert.equal(cardFault(['title', 'hue', 'picture']), null);
  assert.equal(cardFault(['title', 'hue', 'hue']), 'more than one hue');
  const L = cardLayout(['title', 'hue', 'picture']);
  assert.deepEqual([L.hue, L.picture], [1, 2]);
  const html = toHTML(parse('```cards\ntitle | hue\nKiln | 120\nSite | 400\n```', { page: true }));
  assert.match(html, /<li class="cards-item" style="--hue:120" data-slot="lime">/u);
  assert.match(html, /<li class="cards-item"><div class="cards-head"><h3 class="cards-title">Site/u, 'no style where the cell is no turn');
  assert.doesNotMatch(html, />120</u, 'a hue is never printed');
});

/* ── embed ────────────────────────────────────────────────────────────────── */

test('AN EMBED FRAMES ONLY A PROVIDER\'S OWN EMBED ADDRESS, built from the id, and nothing else', () => {
  assert.equal(embedOf('https://www.youtube.com/watch?v=dQw4w9WgXcQ')?.src, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  assert.equal(embedOf('https://youtu.be/dQw4w9WgXcQ')?.src, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  assert.equal(embedOf('https://vimeo.com/76979871')?.src, 'https://player.vimeo.com/video/76979871');
  assert.equal(embedOf('https://www.loom.com/share/0123456789abcdef0123456789abcdef')?.src, 'https://www.loom.com/embed/0123456789abcdef0123456789abcdef');
  const figma = 'https://www.figma.com/design/AbC123/Launch';
  assert.equal(embedOf(figma)?.src, `https://www.figma.com/embed?embed_host=braindog&url=${encodeURIComponent(figma)}`);
  assert.equal(embedOf('https://www.google.com/maps/embed?pb=!1m18')?.provider.id, 'google-maps');
  for (const bad of [
    'http://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtube.com.example.net/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/watch?v=short',
    'https://user@vimeo.com/76979871',
    'https://www.google.com/maps/place/Kiln',
    'javascript:alert(1)',
    'not an address',
  ])
    assert.equal(embedOf(bad), null, bad);
  /* EVERY FRAME POINTS AT A PROVIDER'S OWN ORIGIN, which is the list a host's `frame-src` names. */
  const origins = new Set(EMBED_PROVIDERS.map((p) => p.origin));
  for (const url of ['https://youtu.be/dQw4w9WgXcQ', 'https://vimeo.com/1', figma, 'https://www.google.com/maps/embed?pb=x'])
    assert.ok(origins.has(new URL(embedOf(url)!.src).origin), url);
});

test('an embed row is an address, a title and an aspect, and a wrong address or aspect is a fault', () => {
  assert.equal(embedAspect(''), '16:9', 'the first aspect is what a row that says nothing gets');
  assert.equal(embedAspect('9:16'), '9:16');
  assert.equal(embedAspect('21:9'), null);
  assert.equal(embedFault([['https://youtu.be/dQw4w9WgXcQ', 'Film', '4:3']]), null);
  assert.equal(embedFault([]), null, 'an embed with nothing in it yet is not a fault');
  assert.match(embedFault([['https://example.com/film']]) ?? '', /not a YouTube, Vimeo, Loom, Figma or Google Maps link/u);
  assert.match(embedFault([['https://youtu.be/dQw4w9WgXcQ', '', 'tall']]) ?? '', /an aspect "tall"/u);
  assert.equal(embedPlan(rows(['https://youtu.be/dQw4w9WgXcQ', 'Film', 'tall']))?.aspect, '16:9', 'lenient where the fault is strict');
});

/* ── a path's short view ──────────────────────────────────────────────────── */

test('A PATH NAMES ITS SHORT VIEW FIRST, marks each stone in it with `short`, and draws it only when it holds some and not all', () => {
  const short = [['short', 'This week'], ['A', '', 'done short'], ['B', '', 'next short'], ['C', '', ''], ['D', '', 'short']];
  assert.equal(pathFault(short), null);
  const plan = pathPlan(rows(...short));
  assert.equal(plan.name, 'This week');
  assert.deepEqual(plan.stones.map((s) => [s.row.cells[0], s.mark, s.short]), [['A', 'done', true], ['B', 'next', true], ['C', 'later', false], ['D', 'later', true]]);
  assert.equal(pathShort(plan), true);
  assert.equal(pathShort(pathPlan(rows(['short', 'All'], ['A', '', 'short']))), false, 'a view of every stone is no view');
  assert.equal(pathShort(pathPlan(rows(['A', '', 'short'], ['B', '', '']))), false, 'a view nobody named is not offered');

  assert.equal(pathFault([['A', '', ''], ['short', 'Late']]), 'a name for the short view that is not its first row');
  assert.equal(pathFault([['short', '']]), 'a short view with no name');
  assert.equal(pathFault([['A', '', 'short done']]), 'a mark "short done" where done, next or nothing goes', 'one spelling for one fact');
  assert.equal(pathFault([['A', '', 'next short'], ['B', '', 'next']]), 'two steps marked next');
});
