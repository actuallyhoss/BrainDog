/**
 * THE TWO LIST OPERATORS, CARRIED BY A URL AND BY A SAVED VIEW, not only by a typed sentence.
 *
 * `where.ts` learned `has` and `lacks` and nothing outside it could spell them. A chip is
 * `<field>:<op>:<values>` and `whereOf` read four operators back out of one, with everything else
 * falling through to `<field> is <value>`, so `repos:has:portage` arrived at the compiler as
 * `repos is portage` and was refused by both engines: *"repos is a list, which cannot be asked
 * \"is\""*. Measured before the fix, on the shipped mirror's `things`: one row holds `portage`, and
 * the chip opened NONE of them, under a block that had drawn it.
 *
 * `clauseOf` in `views-live.ts` is the same hole from the record's side: a saved view whose filter
 * is `{ field: 'repos', has: 'portage' }` came back `null`, which takes the whole Filter line with
 * it, so the view drew its rows under no sentence at all.
 *
 * THE TESTS DRIVE THE PAGE'S OWN READER AND NOT A COPY OF IT. Six tests in this directory carry
 * their own four-line chip parser (`api.test.ts` twice, `metrics.test.ts`, `pages.test.ts`,
 * `where.test.ts`), which is how a parser can be wrong in the route and right in every test of it.
 * `chipsOf` is that parser, exported from `api.ts` and imported by the route, so what is driven here
 * is what the register page reads.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { chipsOf, whereOf } from './api.ts';
import { applyFilters, list } from './fixtures/readers.ts';
import { REGISTERS, ROWS } from './fixtures/sample.ts';
import { clausesOf } from './views-live.ts';
import { compile, registerHref } from './where.ts';
/* THE SAMPLE'S ROW NAMES, which a live tab learns from the record and this test asks the mirror about by name. */
import './fixtures/fill.ts';

/* THE LIST SCREEN IS ITS PAGE AND ITS PARTS: the chips are parsed in the page and drawn by `ChipsBar`, read as one text. */
const route = ['+page.svelte', 'parts/ChipsBar.svelte']
  .map((at) => readFileSync(new URL(`../../routes/r/[register]/${at}`, import.meta.url), 'utf8'))
  .join('\n');

/** The seqs of the rows whose list field actually holds this element, read off the seed directly. */
const holding = (register: string, field: string, element: unknown): number[] =>
  (ROWS[register] ?? [])
    .filter((e) => Array.isArray(e.fields[field]) && (e.fields[field] as unknown[]).some((v) => v === element))
    .map((e) => e.seq);

/** The address a link would write, read back the way the register route reads one. */
const opened = (href: string): { register: string; seqs: number[] } => {
  const url = new URL(href, 'http://x');
  const register = url.pathname.split('/')[2] ?? '';
  return { register, seqs: list(register, { filters: chipsOf(url.searchParams) }).entries.map((e) => e.seq) };
};

test('a list chip is a sentence both engines take, and it opens the rows the block drew', () => {
  /* `things.repos` IS THE FIELD THE RECORD MEASURED ITS OWN SIDE ON: `repos has portage` answered
     `rows [3]` there and *"that is not something a filter can say"* here. */
  const held = holding('things', 'repos', 'portage');
  assert.deepEqual(held, [3], 'the seed no longer has exactly one thing holding portage');

  const chip = { field: 'repos', op: 'has', values: ['portage'] };
  assert.equal(whereOf([chip]), 'repos has portage');
  assert.deepEqual(compile('things', whereOf([chip])).bad, []);
  assert.deepEqual(
    applyFilters('things', ROWS.things ?? [], [chip]).map((e) => e.seq),
    held,
  );

  /* AND THE NEGATION IS THE COMPLEMENT AND NOT AN EMPTY GRID, which is the half a reader reaches
     for when they mean "and the ones with none": a row with nothing in the field lacks everything. */
  const all = (ROWS.things ?? []).map((e) => e.seq);
  assert.deepEqual(
    applyFilters('things', ROWS.things ?? [], [{ field: 'repos', op: 'lacks', values: ['portage'] }]).map((e) => e.seq),
    all.filter((seq) => !held.includes(seq)),
  );
});

test('the chip the URL carries is the chip the page reads, colons and all', () => {
  /**
   * A LIST ELEMENT IS NOT A WORD, AND TWO OF THE MIRROR'S ELEVEN LIST FIELDS PROVE IT.
   *
   * `people.handles` holds `git:jokonkwo` and `tools.needs` holds
   * `header:Authorization=credentials#1`: every value of both carries a colon. The route split the
   * chip on EVERY colon and took the third piece, so `handles:has:git:jokonkwo` parsed as the value
   * `git` and lost the name. `git` is held by nobody, so the grid came back empty, which is the one
   * answer indistinguishable from a filter that worked.
   *
   * `registerHref` writes the value through `encodeURIComponent`, which spells a colon `%3A`, and
   * `URLSearchParams` hands it straight back, so the encoding never reached the split. The chip is
   * three pieces at the first two colons now, and the rest of the string is the value.
   */
  const chip = `handles:has:${encodeURIComponent('git:jokonkwo')}`;
  assert.ok(chip.includes('%3A'), 'the colon was not encoded, so this proves nothing');

  const url = new URL(`/r/people?f=${chip}`, 'http://x');
  assert.deepEqual(chipsOf(url.searchParams), [{ field: 'handles', op: 'has', values: ['git:jokonkwo'] }]);
  assert.deepEqual(opened(url.toString()).seqs, holding('people', 'handles', 'git:jokonkwo'));
});

test('a two-piece `field:empty` or `field:set` chip reads as `is empty` and `is set`, never as an operator (audit 31 Oct A36)', () => {
  const url = new URL('/r/transactions?f=payee:empty&f=category:set&f=direction:is:out', 'http://x');
  assert.deepEqual(chipsOf(url.searchParams), [
    { field: 'payee', op: 'is', values: ['empty'] },
    { field: 'category', op: 'is', values: ['set'] },
    { field: 'direction', op: 'is', values: ['out'] },
  ]);
  assert.equal(whereOf(chipsOf(url.searchParams)), 'payee is empty, category is set, direction is out');
});

test('EVERY ELEMENT OF EVERY LIST FIELD IN THE MIRROR SURVIVES THE ROUND TRIP', () => {
  /**
   * The sweep, because one field is an anecdote. Eleven list fields over five registers, nine
   * `list<text>` and two `list<ref>`, and each element of each of them is written into a chip the
   * way a link would write it, read back by the route's own parser, and the rows it opens held
   * against the rows the seed says hold that element.
   *
   * A `list<ref>` ELEMENT IS WRITTEN AS THE TITLE AND STORED AS THE NUMBER, which is `elementValue`'s
   * one departure from the scalar `is` beside it: no chip could carry `has` at all, so there is no
   * number arriving from anywhere and the record refuses `because has 4` with *"there is no
   * learnings called 4"*. Written here the way a person writes it, and compared against the rows
   * holding the seq.
   */
  let swept = 0;
  for (const [register, decl] of Object.entries(REGISTERS)) {
    for (const field of decl.fields) {
      if (field.type !== 'list') continue;
      const elements = [...new Set((ROWS[register] ?? []).flatMap((e) => (Array.isArray(e.fields[field.id]) ? (e.fields[field.id] as unknown[]) : [])))];
      for (const element of elements) {
        /* The word somebody would type: a ref is its row's title, everything else is itself. */
        const said =
          field.of === 'ref' && field.to
            ? String((ROWS[field.to] ?? []).find((e) => e.seq === Number(element))?.fields[REGISTERS[field.to]?.title ?? ''] ?? '')
            : String(element);
        /* A COMMA IS THE ONE ELEMENT NEITHER LANGUAGE CAN CARRY, and `where.ts` says so where it
           splits the sentence on one: "a known limitation rather than a silent one". The test
           below is what holds it to being loud. */
        if (!said || said.includes(',')) continue;
        swept += 1;
        const href = `/r/${register}?f=${field.id}:has:${encodeURIComponent(said)}`;
        assert.deepEqual(opened(href).seqs, holding(register, field.id, element), `${register}.${field.id} has ${said}`);
      }
    }
  }
  assert.ok(swept >= 20, `only ${swept} elements were swept, so this test stopped measuring anything`);
});

test('an element carrying a comma is refused by name, in both languages, rather than matching quietly', () => {
  /**
   * THE ONE LIMITATION THE SWEEP ABOVE STEPS OVER, MEASURED RATHER THAN ASSUMED.
   *
   * `compile` splits a predicate on the comma, and `chipsOf` splits a chip's values on it, so an
   * element holding one is cut in half by both. `skills.because` points at `learnings`, whose
   * titles are sentences: `Attach what a proposal read to it, or it is refused.` is held by
   * two rows and cannot be asked for from either side.
   *
   * IT LANDS IN `bad`, WHICH IS THE WHOLE DIFFERENCE. `where.ts` promises the halves fail to
   * resolve rather than filtering on half a name, and that promise had never been driven through
   * an operator whose value is a title. Measured: the chip and the typed sentence both answer
   * *"there is no learnings called Attach what a proposal read to it"* and NO rows, which is the
   * refusal `matches` turns into an empty answer rather than a wrong one.
   */
  const title = 'Attach what a proposal read to it, or it is refused.';
  assert.equal(holding('skills', 'because', (ROWS.learnings ?? []).find((e) => e.fields[REGISTERS.learnings?.title ?? ''] === title)?.seq).length, 2);

  const chips = chipsOf(new URL(`/r/skills?f=because:has:${encodeURIComponent(title)}`, 'http://x').searchParams);
  const said = compile('skills', whereOf(chips));
  assert.equal(said.bad.length, 1);
  /* THE RECORD'S OWN SENTENCE, full stop and all, since `compile` is the record's parser. */
  assert.match(said.bad[0] ?? '', /there is no learnings called Attach what a proposal read to it\.$/);
  assert.deepEqual(list('skills', { filters: chips }).entries, []);
});

test('the register page reads its chips through chipsOf, and draws a control for each list clause', () => {
  /* THE PARSER IS IMPORTED RATHER THAN RETYPED. It was four lines in a `$derived.by`, which is why
     the colon defect above could not be reached by any test in this directory: the thing under test
     was a copy of it. */
  assert.match(route, /\bchipsOf\b[^\n]*from '\$lib\/record\/api\.ts'/, 'the route no longer imports the shared chip parser');
  assert.match(route, /\$derived\(chipsOf\(page\.url\.searchParams\)\)/, 'the route parses its own chips again');
  assert.doesNotMatch(route, /raw\.split\(':'\)/, 'the route kept its own copy of the chip parser');

  /**
   * AND THE CLAUSE IS ON SCREEN WITH A WAY OUT OF IT.
   *
   * A list's values are not a declared set, so there is no pill row to light: `isOn` answers about
   * an enum's values, and every control in the bar is drawn from `f.values ?? []`. Arriving at
   * `?f=repos:has:portage` therefore narrowed the grid from four rows to one with nothing above it
   * saying so and no way back but the address bar. The bar's own rule is that which filters are on
   * is the whole of what the grid underneath is showing.
   */
  /* EVERY CLAUSE IS ITS OWN RECTANGLE NOW (money F7), a list clause among them: the page
     words each one that is on (`chipRects`) and the bar draws a press that takes it off. */
  assert.match(route, /const chipRects = \$derived/, 'the bar does not know which clauses are on');
  assert.match(route, /\{#each chips as/, 'the bar draws no control for a clause');
  assert.match(route, /dropFilter\(/, 'a list clause cannot be taken off');
});

test('AND THE ADDRESS A BLOCK HANDS OVER IS ONE OF THOSE CHIPS NOW, for every list field in the mirror', () => {
  /**
   * THE HALF THE READER ABOVE WAS BUILT FOR, AND IT WAS STILL REFUSED.
   *
   * `registerHref` answered the bare `/r/<register>` for any predicate carrying a list clause, with
   * the reason written beside it: nothing could read `<field>:<op>:<value>` back, so minting one would
   * have opened an empty grid under a block that had drawn rows. The tests above are that reader, and
   * they round-tripped the chip from a link, from a metric and from a saved view. The assertion this
   * one adds is the other end: the address the block itself writes.
   *
   * IT IS DRIVEN THROUGH THE ROUTE'S OWN PARSER and never through a copy of it, which is the rule the
   * rest of this file keeps: `opened()` reads the href exactly as `/r/[register]` reads one, and the
   * rows it answers are held against the rows the seed says hold that element. A URL asserted against
   * a literal string would be a test of how `registerHref` spells a chip; this is a test that the door
   * opens the list the block promised.
   */
  let minted = 0;
  for (const [register, decl] of Object.entries(REGISTERS)) {
    for (const field of decl.fields) {
      if (field.type !== 'list') continue;
      const elements = [...new Set((ROWS[register] ?? []).flatMap((e) => (Array.isArray(e.fields[field.id]) ? (e.fields[field.id] as unknown[]) : [])))];
      for (const element of elements.slice(0, 3)) {
        /* A `list<ref>` IS WRITTEN AS THE TITLE, because that is the word both engines take: the
           compiled clause holds the target's `seq`, and `registerHref` has to say it back as a name or
           the chip refuses on arrival with "there is no things called 1". */
        const said =
          field.of === 'ref' && field.to
            ? String((ROWS[field.to] ?? []).find((e) => e.seq === Number(element))?.fields[REGISTERS[field.to]?.title ?? ''] ?? '')
            : String(element);
        /* THE COMMA IS THE ONE ELEMENT NEITHER LANGUAGE CARRIES, and the sentence cannot even be
           written: `compile` splits the predicate on it, so no `has` clause over such a value reaches
           `registerHref` at all. The test below holds that refusal to being loud. */
        if (!said || said.includes(',')) continue;
        minted += 1;
        const href = registerHref(register, `${field.id} has ${said}`);
        assert.notEqual(href, `/r/${register}`, `${register}.${field.id} still hands over the wide address`);
        assert.ok(!href.includes(' '), `a raw space reached a URL: ${href}`);
        assert.deepEqual(opened(href).seqs, holding(register, field.id, element), `${register}.${field.id} has ${said}`);
      }
    }
  }
  assert.ok(minted >= 11, `only ${minted} list clauses were minted, so this test stopped measuring anything`);

  /* AND `lacks` IS THE COMPLEMENT BEHIND THE DOOR TOO, which is the half a reader reaches for when
     they mean "and the ones with none". */
  const lacking = registerHref('things', 'repos lacks portage');
  const rest = (ROWS.things ?? []).map((e) => e.seq).filter((seq) => !holding('things', 'repos', 'portage').includes(seq));
  assert.deepEqual(opened(lacking).seqs, rest);
});

test('a saved view filtered on a list comes back as chips rather than as no Filter line at all', () => {
  /* THE RECORD'S LEAF IS `{ field, has }`, and `clauseOf` read eight operators. A view whose filter
     is a list clause therefore answered `null`, which the route reads as "not something the chips
     can say" and prints nothing for: safe, and a view drawing rows under no sentence. */
  assert.deepEqual(clausesOf({ all: [{ field: 'repos', has: 'portage' }] }), [{ field: 'repos', op: 'has', values: ['portage'] }]);
  assert.deepEqual(clausesOf({ all: [{ field: 'repos', lacks: 'portage' }] }), [{ field: 'repos', op: 'lacks', values: ['portage'] }]);

  /* AND THE CHIPS IT ANSWERS WITH ARE THE ONES THE READER RUNS, which is the whole point of them
     being chips: the route ANDs a view's own filters with the URL's and hands the lot to `whereOf`. */
  const filters = clausesOf({ all: [{ field: 'repos', has: 'portage' }] });
  assert.ok(filters);
  assert.equal(whereOf(filters), 'repos has portage');
  assert.deepEqual(
    applyFilters('things', ROWS.things ?? [], filters).map((e) => e.seq),
    holding('things', 'repos', 'portage'),
  );
});
