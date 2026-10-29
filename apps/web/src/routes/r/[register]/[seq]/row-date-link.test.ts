/**
 * A date said in a row's note opens that day on the record's Calendar page, and is plain text on a record without one.
 *
 * The row's screen hands the renderer the same answer a declared page does (`day-href.ts` over the pages `boot`
 * listed). Held here two ways: the screen's own source passes it, and the options it passes draw what they should.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { parse, toHTML } from 'braindog-render';

import { at } from '../../../../lib/at.ts';
import { dayHref } from '../../../../lib/record/day-href.ts';
import { rowHref } from '../../../../lib/record/row-href.ts';

const SCREEN = readFileSync(new URL('./+page.svelte', import.meta.url), 'utf8');

/** The options the screen hands `Document`, as far as a link reads them, for a record holding these pages. */
const optsFor = (pages: readonly string[] | undefined) => ({
  link: rowHref,
  dayHref: (iso: string) => dayHref(pages, iso),
  href: (path: string) => at(path, '/acme/r/tasks/7'),
});

const NOTE = parse('Send it by {{date:2026-11-03}}.');
const text = (html: string) => html.replace(/<[^>]+>/gu, '');

test('THE SCREEN HANDS THE RENDERER WHERE A DAY OPENS, read from the pages the record listed', () => {
  assert.match(SCREEN, /import \{ dayHref \} from '\$lib\/record\/day-href\.ts';/);
  /* The answer is built over `boot`'s pages, the ones this caller may open. */
  assert.match(SCREEN, /const dayLink = \(iso: string\) => dayHref\(\(page\.data as unknown as Partial<Shell>\)\.pages, iso\);/);
  /* And it reaches the note's `Document`, beside the row link. */
  const doc = /<Document\s[^>]*?opts=\{\{([^\n]*)\}\}/u.exec(SCREEN);
  assert.ok(doc, 'the screen draws a Document');
  assert.match(doc[1] ?? '', /\blink, dayHref: dayLink,/);
  /* The old word, that no page draws a calendar, is gone. */
  assert.doesNotMatch(SCREEN, /No `dayHref`/);
});

test('WITH A CALENDAR PAGE, a date in the note links to that day on it, under the app', () => {
  const html = toHTML(NOTE, optsFor(['home', 'calendar']));
  assert.match(html, /<a href="\/acme\/p\/calendar\?day=2026-11-03">/);
});

test('WITHOUT ONE, the date is plain text and the words are the same', () => {
  for (const pages of [['home', 'money'], [], undefined]) {
    const html = toHTML(NOTE, optsFor(pages));
    assert.doesNotMatch(html, /<a /);
    assert.doesNotMatch(html, /calendar/);
    assert.equal(text(html), text(toHTML(NOTE, optsFor(['calendar']))));
  }
});

test('A DAY THAT IS NO DAY IS NEVER AN ADDRESS, whatever the note says', () => {
  const html = toHTML(parse('By {{date:2026-02-30}}.'), optsFor(['calendar']));
  assert.doesNotMatch(html, /<a /);
});
