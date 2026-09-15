/**
 * The palette, the results page and the cursor — the three places a search says a number.
 *
 * `find.test.ts` covers the matcher. This covers what the SCREENS do with it, and every assertion
 * here exists because a review found the same failure three times over: a count that is not a count
 * of the thing beside it. The palette announced *14 of 484* over twelve hits; `/search` drew
 * *Decide 14* over ten rows with nothing saying so; the register's head read *2,000 of 2,614* three
 * inches above a line reading *Showing 2,000 of 2,545*.
 *
 * Two of these read the source text rather than running the component, which is the honest thing to
 * say out loud: a `.svelte` file cannot be imported by `node --test`. A regex over source proves the
 * shape and not the behaviour, so each one is written to fail on the exact edit that caused the
 * defect rather than on formatting.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PAGE, list, search } from './api.ts';
import { ftsQuery } from '@braindog/kernel';
import { ROWS } from './data.ts';
import type { Entry } from './schema.ts';

const src = (...parts: string[]) => readFileSync(join(fileURLToPath(new URL('../../', import.meta.url)), ...parts), 'utf8');

/* ── the cursor carries the question, and the same question is one question ── */

const CURSOR_Q = 'obligations';

const page = (opts: Record<string, unknown>) => list(CURSOR_Q, { limit: 2, ...opts } as never);

test('THE SAME QUESTION BUILT IN A DIFFERENT KEY ORDER IS THE SAME QUESTION', () => {
  /**
   * `questionKey` hashed `JSON.stringify` over the options as handed in, and `JSON.stringify`
   * preserves key order — so `{ field, op, values }` and `{ op, values, field }` were two questions
   * over the same rows in the same order, and a cursor from one was `stale` in the other.
   *
   * The consequence is not a wrong page, it is an infinite one: `more()` gets `stale`, refetches
   * page one, keeps the new cursor, the observer fires, `stale` again. A loop that never advances a
   * row, reached by any caller that rebuilds its options object rather than reusing it.
   */
  const first = page({ filters: [{ field: 'state', op: 'in', values: ['open', 'part', 'paid'] }] });
  assert.ok(first.cursor, 'the fixture no longer pages, so this proves nothing');

  const same: Record<string, unknown>[] = [
    { filters: [{ op: 'in', values: ['open', 'part', 'paid'], field: 'state' }] },
    { filters: [{ field: 'state', op: 'in', values: ['paid', 'part', 'open'] }] },
    { filters: [{ values: ['paid', 'open', 'part'], field: 'state', op: 'in' }] },
  ];
  for (const opts of same) {
    const next = page({ ...opts, cursor: first.cursor });
    assert.equal(next.stale, false, `a cursor was stale for a question spelled ${JSON.stringify(opts)}`);
    assert.ok(next.entries.length > 0, 'the recovered page was empty');
    assert.notDeepEqual(next.entries.map((e: Entry) => e.seq), first.entries.map((e: Entry) => e.seq), 'it resumed at the start');
  }

  /* AND THE ORDER, which is the third of the three shapes measured and the one a `sort` object is
     most likely to be rebuilt in — it is two keys, so half of every hand-written literal spells it
     the other way. */
  const sorted = list(CURSOR_Q, { limit: 2, sort: { field: 'due', dir: 'asc' } });
  assert.ok(sorted.cursor, 'the sorted fixture no longer pages');
  const again = list(CURSOR_Q, { limit: 2, sort: { dir: 'asc', field: 'due' }, cursor: sorted.cursor });
  assert.equal(again.stale, false, 'the same order spelled `{ dir, field }` was a different question');
  assert.ok(again.entries.length > 0);
});

test('and a genuinely different question still refuses the cursor', () => {
  /* The guard has to keep refusing, or normalising the key would have replaced one silent wrong
     answer with another. Four ways to be different: the filter, the query, the order, the field. */
  const first = page({ filters: [{ field: 'state', op: 'in', values: ['open'] }] });
  assert.ok(first.cursor);
  for (const opts of [
    { filters: [{ field: 'state', op: 'in', values: ['paid'] }] },
    { filters: [{ field: 'state', op: 'in', values: ['open'] }], q: 'kiln' },
    { filters: [{ field: 'state', op: 'in', values: ['open'] }], sort: { field: 'due', dir: 'desc' as const } },
    { filters: [{ field: 'direction', op: 'in', values: ['open'] }] },
  ])
    assert.equal(page({ ...opts, cursor: first.cursor }).stale, true, `a cursor resolved into ${JSON.stringify(opts)}`);
});

test('EVERY PART OF THE QUESTION IS IN THE KEY, AND THREE OF THEM WERE NOT CHECKED', () => {
  /**
   * A review dropped `register`, dropped `q`, and dropped the filter `.sort()` from `questionKey`
   * one at a time and every test stayed green. The `q` case looked covered by the test above and was
   * not: adding `q: 'kiln'` SHRINKS the answer, so the cursor row is gone and `cursorAt` returns
   * `-1` whatever the key says. The assertion was true and proved nothing — the third time that
   * shape has appeared on this tree.
   *
   * A question that differs ONLY in the part being tested, over a set that still contains the cursor
   * row, is the check. Each pair below matches the same rows in the same order.
   */
  /* `limit: 1`, so the cursor lands on a row BOTH queries below contain — the whole point of the
     fixture is that `cursorAt` can resolve it either way. */
  const wide = list('obligations', { limit: 1, q: 'r' });
  assert.ok(wide.cursor, 'the fixture no longer pages');

  /* `register`: the same cursor, the same shape of question, a different list. */
  assert.equal(list('services', { limit: 1, q: 'r', cursor: wide.cursor }).stale, true, '`register` is not in the key');

  /* `q`: TWO QUERIES THAT BOTH CONTAIN THE CURSOR ROW, so `cursorAt` can find it either way and only
     the key can tell them apart. That is what the assertion above could not do — adding a query
     shrank the answer, the row was gone, and `-1` came back whatever the key said. */
  const held = wide.entries[wide.entries.length - 1]!;
  const other = list('obligations', { limit: 200, q: 'a' });
  assert.ok(other.entries.some((e: Entry) => e.seq === held.seq), 'the two queries do not overlap on the cursor row, so this proves nothing');
  assert.equal(list('obligations', { limit: 1, q: 'a', cursor: wide.cursor }).stale, true, '`q` is not in the key');

  /* TWO FILTERS, because one cannot detect a sort. The same pair in both orders is the same
     question, and a key that does not sort them makes it two. */
  const pair = [
    { field: 'state', op: 'in' as const, values: ['open', 'part', 'paid'] },
    { field: 'direction', op: 'in' as const, values: ['owed_to_me', 'owed_by_me'] },
  ];
  const asIs = list('obligations', { limit: 2, filters: pair });
  assert.ok(asIs.cursor, 'the two-filter fixture no longer pages');
  const flipped = list('obligations', { limit: 2, filters: [pair[1]!, pair[0]!], cursor: asIs.cursor });
  assert.equal(flipped.stale, false, 'the same two filters in the other order were a different question');
  assert.ok(flipped.entries.length > 0);
});

test('an ordering flip is still stale, which is the row-skip this guard was built for', () => {
  const up = list(CURSOR_Q, { limit: 2, sort: { field: 'seq', dir: 'asc' } });
  assert.ok(up.cursor);
  assert.equal(list(CURSOR_Q, { limit: 2, sort: { field: 'seq', dir: 'desc' }, cursor: up.cursor }).stale, true);
});

/* ── the palette ──────────────────────────────────────────────────────────── */

const PALETTE = src('lib', 'palette', 'Palette.svelte');

test('`⇥` CANNOT LAND ON A ROW THAT IS NOT A COMPLETION', () => {
  /**
   * Repro: `⌘K`, type `ren`, `↓` onto *All 484 matches for “ren”*, press `⇥` → the box became that
   * sentence and the list fell to *Nothing matches*. The comment above the row asserted this could
   * not happen — *"completion reads `flat[cursor]` only when the row carries a `title` a query can
   * become"* — describing a guard that had never been written. `onkeydown` was an unconditional
   * `if (top) q = (parsed.prefix ?? '') + top.title`.
   *
   * This file's own header names losing a half-typed query as the Raycast failure it exists to
   * avoid, and `19 §7` is why `⇥` is here at all.
   */
  assert.match(PALETTE, /top\?\.complete !== undefined/u, 'Tab no longer checks whether the row is completable');
  assert.doesNotMatch(PALETTE, /q = \(parsed\.prefix \?\? ''\) \+ top\.title/u, 'Tab completes a row title again');

  /* AND THE OVERFLOW ROW DOES NOT CARRY ONE. The guard is only worth having while the row it was
     written for stays outside it. */
  const overflow = /id: 'all',[\s\S]{0,400}?\}\);/u.exec(PALETTE);
  assert.ok(overflow, 'the overflow row is gone');
  assert.doesNotMatch(overflow[0], /complete/u, 'the overflow row became completable again');
});

test('the announced count is the record’s answer when there is one, and the list when there is not', () => {
  /* `flat.length` counted the command rows, the register destinations and the overflow row itself —
     the sentence whose whole job is to say the answer was cut, counted as one of the things it was
     counting. And then `drawn === 0 ? ''` went too far the other way: `>` and `/` never produce a
     record hit, so a dialog full of results announced nothing at all, permanently. */
  assert.match(PALETTE, /drawn > 0 \? copy\.showingOf\(drawn, total\)/u, 'the status line counts rows again');
  assert.match(PALETTE, /flat\.length > 0 \? copy\.showingOf\(flat\.length, flat\.length\)/u, 'a list of pages or commands announces nothing');
  assert.doesNotMatch(PALETTE, /const said = flat\.length === 0/u);
});

test('and `@` compares against people, not against the whole record', () => {
  /* `@ha` announced *2 of 5*: the prefix had narrowed the list to people and the denominator still
     counted the rows it had just excluded. The honest answer is *2 of 2*. */
  assert.match(PALETTE, /prefix === '@'\s*\?\s*\(?found\.groups\.find/u, 'the `@` total is the record-wide one again');
});

test('a capped `@` list is not silent', () => {
  /* The overflow row was suppressed for `@` — so the branch where the cap bites SOONEST, because the
     filter throws most of the budget away, was the one branch with nothing on screen saying the list
     was partial. That is the defect the row was added for, on the prefix it skipped. */
  assert.doesNotMatch(PALETTE, /if \(prefix !== '@' && found\.total > kept\.length\)/u);
  assert.match(PALETTE, /if \(total > drawn\)/u);
});

test('A TYPED QUERY THAT CANNOT BE ONE MATCHES NOTHING, AND AN EMPTY ONE IS NOT A QUERY', () => {
  /**
   * `answers()` returns `true` when a query tokenises to nothing, and that is right for the box on a
   * register — no query is no filter, and a cleared box shows the list. The palette inherited it and
   * meant the opposite: typing `?` or `-` or `.` matched every command, page, saved view and
   * register, and the dialog filled with twenty rows announcing "20".
   *
   * The difference is whether anything was typed, and both halves are here: nothing typed is the
   * default list and announces nothing; something typed that cannot be a query matches nothing,
   * which is the same answer `ftsQuery` gives the record.
   */
  assert.match(PALETTE, /if \(!want\) return text\.trim\(\) === '';/u, 'a punctuation-only query matches everything again');
  assert.match(PALETTE, /const said = !parsed\.text \? ''/u, 'an unopened question is answered with a number');
  /* And the record agrees: a query with no letters and no digits is not a query. */
  assert.equal(ftsQuery('?'), null);
  assert.equal(search('?', 9_999).total, 0);
  assert.equal(search('', 9_999).total, 0);
});

test('`/search` is a destination the palette teaches', () => {
  /* `g s` was bound, the `?` sheet advertised it, and the route appeared in no nav and not in
     `COMMANDS`. Typing `sear` found nothing, and on a phone the route was reachable only from the
     overflow row, which is to say only from inside the cap it exists to relieve.

     THE BINDING IS NO LONGER PRINTED BESIDE IT, and this assertion used to require that it was.
     Every destination row carried its chord — `g h`, `g d`, `g i` — two letters and no explanation
     of what two letters are, on the one surface a person reaches for when they do not know their
     way around. The chords still work; `?` and Settings → Keyboard are where they are taught. What
     this test is actually about is that `/search` is REACHABLE from the palette, and that is what
     it checks. */
  /* THE LIST MOVED TO `admit.ts`, so the rule that decides what is in it could be RUN rather than
     described: a palette command has to pass three tests, and a rule written in prose beside a list
     is a rule nothing applies. Both claims here are unchanged and both are still about the same
     declaration, one file over. */
  const ADMIT = src('lib', 'palette', 'admit.ts');
  assert.match(ADMIT, /id: 'c-search'[^\n]*href: '\/search'/u);
  assert.doesNotMatch(ADMIT, /keys: 'g /u, 'a chord is printed beside a destination again');
});

test('the count is styled on every screen, not only on a phone', () => {
  /* The rule was written INSIDE `@media (pointer: coarse), (width < 640px)`, so on a desktop the
     number rendered at `--t-ui` and lost `tabular-nums` — the one property a figure that changes on
     every keystroke needs, because proportional digits make it twitch. */
  const at = PALETTE.indexOf('.p-count {');
  const media = PALETTE.indexOf('@media (pointer: coarse)');
  assert.ok(at > 0 && media > 0, 'the palette lost one of the two');
  assert.ok(at < media, '`.p-count` is inside the phone media block again');
});

/* ── the results page ─────────────────────────────────────────────────────── */

const SEARCH = src('routes', 'search', '+page.svelte');

test('A CAPPED GROUP SAYS SO WHETHER OR NOT IT HAS A DOOR', () => {
  /* `group.href && group.total > PER_LIST` — and the questions group's `href` is `null` by
     construction, because `/decide` is not a filtered list. With fourteen matching decisions the
     page drew ten rows under a count of fourteen and said nothing: the exact defect this route was
     built to fix, one door along. */
  assert.doesNotMatch(SEARCH, /\{#if group\.href && group\.total > PER_LIST\}/u);
  assert.match(SEARCH, /\{#if group\.total > PER_LIST\}/u);
  assert.match(SEARCH, /copy\.showingOf\(PER_LIST, group\.total\)/u, 'a doorless group has no disclosure');
});

test('the questions group really is the doorless one, so that branch is reachable', () => {
  /* An assertion about an unreachable branch is decoration. `search()` gives every register group a
     door and gives the questions group none, which is what makes the branch above real. */
  const found = search('a', 9_999);
  const doorless = found.groups.filter((g) => g.href === null);
  assert.equal(doorless[0]?.kind, 'Decide', 'the shape of `groups` changed');
  /* The pages group has no door either, because `/p/*` is not a filtered list, and `a` finds Agents. */
  const pagesGroup = (g: (typeof found.groups)[number]) => g.hits.every((h) => h.href.startsWith('/p/'));
  assert.equal(doorless.filter((g) => !pagesGroup(g)).length, 1, 'a doorless group that is neither the questions nor the pages');
  for (const g of found.groups) if (g.kind !== 'Decide' && !pagesGroup(g)) assert.ok(g.href, `${g.kind} lost its door`);
});

test('the debounced URL write does not land on the next page', () => {
  /* Neither timer was cancelled, so a `goto` fired 150 ms after you had clicked away, on whatever
     route you had arrived at: typing `rent` in a register and clicking a nav link gave
     `/inbox?q=rent`, and clicking on gave `/r/services?q=rent` — a list filtered by a word typed
     into a different one, showing its empty state. */
  for (const [what, text] of [
    ['/search', SEARCH],
    ['the register', src('routes', 'r', '[register]', '+page.svelte')],
  ] as const)
    assert.match(text, /onDestroy\(\(\) => clearTimeout\(/u, `${what} still leaks its debounce across a navigation`);
});

/* ── the register's two numbers ───────────────────────────────────────────── */

const REGISTER = src('routes', 'r', '[register]', '+page.svelte');

test('THE HEAD AND THE CAP LINE COUNT AGAINST THE SAME NUMBER', () => {
  /* At the cap under `?q=a` the head read *2,000 of 2,614* — the register's size — and the cap line
     read *Showing 2,000 of 2,545* — the answer's. Each was defensible alone; the pair was two
     answers to one question, three inches apart, and the desktop had drawn no cap line in that state
     before, so the contradiction was new.
     `50 §5.2` step 6 settles it: while filtering, the denominator is the answer.

     AND UNFILTERED IT IS THE REGISTER PLUS WHAT THIS TAB HAS ADDED. `result.total` is the record's
     count and a row somebody has just typed is not in it yet, while `drawn` is, so after any add
     the head read "39 of 38". The filtered half is unchanged: `result.matched` already counts the
     pending rows, because they are merged into the answer before it is counted. */
  assert.match(
    REGISTER,
    /const denominator = \$derived\(filters\.length \|\| q \? result\.matched : result\.total \+ pending\.of\(id\)\.length\)/u,
  );
  assert.match(REGISTER, /total=\{denominator\}/u);
  assert.doesNotMatch(REGISTER, /total=\{result\.total\}/u, 'the head counts against the register again');
  assert.match(REGISTER, /<CapLine shown=\{drawn\} total=\{result\.matched\} \/>/u);
});

test('one cap line per body on the saved view, not two', () => {
  /* The cards branch drew one unconditionally and the route drew a second at the cap, so at 2,000
     rows on a phone the same sentence appeared twice — and with different numbers, because one
     carried `shown.length` and the other `DOM_CAP`. */
  const view = src('routes', 'v', '[view]', '+page.svelte');
  assert.equal((view.match(/<CapLine/gu) ?? []).length, 1, 'the saved view draws more than one cap line');
});

test('the phone body has a sentinel again', () => {
  /* Added the day paging was built and removed the next, as collateral in a change about the cap
     line — so `Table`'s own surviving comment about `cap` deciding whether there is a sentinel to
     observe was true of one body out of two. The first caller to pass `onmore` and read it on a
     phone gets a list that stops at page one, silently. */
  const table = readFileSync(join(fileURLToPath(new URL('../../../../../packages/render/svelte/p/Table.svelte', import.meta.url))), 'utf8');
  assert.equal((table.match(/class="sentinel"/gu) ?? []).length, 2, 'one of `Table`’s two bodies cannot page');
});

test('and the page size the whole thing rests on is still 200', () => {
  assert.equal(PAGE, 200);
  assert.ok((ROWS.obligations ?? []).length > 0);
});
