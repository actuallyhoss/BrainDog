/**
 * One matcher, held against the kernel that owns the rule.
 *
 * The browser ran a `search()` over titles and a register box over every rendered value, and the
 * results page drew a door between them: *All 30 in Obligations →* counted the first and landed on
 * the second, which was 37 rows. Neither side was the record's own behaviour — `34 §6`, `29 §5` and
 * `50 §5.2` all say the box is the `matches` operator over the register's `search:` fields, and
 * `packages/kernel/src/fts.ts` is the implementation.
 *
 * SO THE ASSERTIONS RUN AGAINST THE KERNEL'S FUNCTIONS, not against a description of them. That is
 * the only shape that catches the NEXT drift: `REPORT.md` lists closing the kernel/screen split as
 * the second thing left to do, and both halves of this one were written from the same documents and
 * disagreed anyway.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ftsQuery, projectedText } from '@braindog/kernel';

import { answers, projected, searchable, terms, tokensOf, why } from './find.ts';
import { REGISTERS, ROWS, applyFilters, display, search } from './api.ts';
import type { Entry } from './schema.ts';

const rows = (...fields: Record<string, unknown>[]): Entry[] => fields.map((f, i) => ({ seq: i + 1, fields: f }) as Entry);

/* ── the browser reads the same declaration the record does ───────────────── */

test('THE SEARCHABLE FIELDS ARE THE DECLARED ONES, AND THE APP CAN NOW SEE THEM', () => {
  /* The seed declares `search: true` on nine fields and the app's own `FieldDecl` did not have the
     key at all — so the browser could not have read the declaration even if it had tried. A mirror
     missing a key the record uses is the same defect as a record accepting a key it ignores. */
  const found = Object.keys(REGISTERS).map((id) => [id, searchable(id).map((f) => f.id)] as const);
  assert.ok(found.length >= 8, 'the seed lost its registers');
  for (const [id, fields] of found) assert.ok(fields.length > 0, `${id} declares nothing as searchable, so no row in it can be found`);
  /* And it is NOT every field. `services` is the register that proves the flag does something: two
     of its seven fields are searchable, and one of the two is not the title. */
  assert.deepEqual(searchable('services').map((f) => f.id), ['name', 'provider']);
  assert.ok(searchable('services').length < (REGISTERS.services?.fields.length ?? 0));
});

test('A REGISTER WHOSE TITLE IS NOT SEARCHABLE HOLDS ROWS NOBODY CAN FIND BY NAME', () => {
  /* Not a rule any document states, and it follows from two that do: the record finds rows only by
     `search:` fields (`fts.ts`), and the title is the one value every surface in the product prints
     for a row. A register that declares neither is a list you can only reach by scrolling. */
  for (const [id, r] of Object.entries(REGISTERS))
    assert.ok(
      searchable(id).some((f) => f.id === r.title),
      `${id}'s title field \`${r.title}\` is not declared searchable, so its rows cannot be found by the name they are shown under`,
    );
});

test('the projection is the kernel’s, string for string', () => {
  /**
   * `projectedText` walks the declared fields in order, skips `!search` and `retired`, drops empty
   * values, collapses whitespace and joins with newlines. This runs the same walk over the RENDERED
   * value, because those are the words the person typing is looking at — and for every searchable
   * field in the seed the two are the same string, which is a fact worth asserting rather than
   * assuming. A searchable `money` or `ref` field would fail here on the day it was declared, which
   * is the day to find out.
   */
  let checked = 0;
  for (const [id] of Object.entries(REGISTERS)) {
    const fields = searchable(id).map((f) => ({ id: f.id, type: f.type, search: true }));
    for (const e of ROWS[id] ?? []) {
      const mine = projected(id, e);
      const theirs = projectedText(fields, e.fields as Record<string, never>);
      assert.equal(mine, theirs, `${id}#${e.seq}: the browser and the record project different text`);
      checked += 1;
    }
  }
  /* Every row of every register — the seed is small, and a sampled comparison over a small seed
     is a comparison that can miss the one row with an empty searchable field. */
  assert.ok(checked >= 90, `only ${checked} rows were compared, so this proves very little`);
});

test('the tokeniser is the kernel’s too', () => {
  /* `ftsQuery` is the whole of what the record does with what was typed: lower-case, strip
     everything that is not a letter/number/space, split, and prefix-match each word. Comparing
     against the query STRING it builds is the honest check — a reimplementation that drifted on
     punctuation or on the empty case would still look right beside a prose description of it. */
  for (const q of ['ren', 'Kiln', 'kiln.example', 're-new', '  spaced  out ', 'owed to me', 'ünicode', '2026', '']) {
    const mine = terms(q);
    const theirs = ftsQuery(q);
    if (mine === null) {
      assert.equal(theirs, null, `\`${q}\`: the browser found no query and the record found one`);
      continue;
    }
    assert.equal(mine.map((w) => `"${w}"*`).join(' AND '), theirs, `\`${q}\` tokenises differently`);
  }
});

/* ── prefix, not substring ────────────────────────────────────────────────── */

test('a term matches the start of a token and never its middle', () => {
  const some = rows({ what: 'Renewals due' }, { what: 'The children of the estate' });
  assert.equal(answers('obligations', some[0]!, 'ren'), true);
  assert.equal(answers('obligations', some[1]!, 'ren'), false, '`includes()` found `children`, and FTS5 does not');
  assert.equal(answers('obligations', some[1]!, 'child'), true);
});

test('every term must match, and a row with none of them is not a partial hit', () => {
  const some = rows({ what: 'Kiln annual retainer' });
  assert.equal(answers('obligations', some[0]!, 'kiln retainer'), true);
  assert.equal(answers('obligations', some[0]!, 'retainer kiln'), true, 'AND is over the row, not over positions');
  assert.equal(answers('obligations', some[0]!, 'kiln portage'), false);
});

test('an empty query is not a filter', () => {
  /* `ftsQuery` returns `null` rather than an empty match, and the two are opposite answers: no query
     keeps the list, no matches empties it. A box cleared back to nothing must show everything. */
  const some = rows({ what: 'Anything' });
  for (const q of ['', '   ', '!!!', '-']) assert.equal(answers('obligations', some[0]!, q), true, `\`${q}\` emptied the list`);
});

test('a field the register does not declare searchable cannot answer', () => {
  const some = rows({ what: 'Kiln retainer', note: 'paid by transfer from Portage' });
  assert.equal(answers('obligations', some[0]!, 'kiln'), true);
  assert.equal(answers('obligations', some[0]!, 'transfer'), false, '`note` is not searchable and answered anyway');
});

/* ── the door, which is the defect this whole file is about ───────────────── */

test('EVERY GROUP’S COUNT IS THE NUMBER OF ROWS ITS OWN DOOR LANDS ON', () => {
  /**
   * The finding, verbatim: *All 30 in Obligations →* landed on 37 rows, *All 13 in Services* on 16,
   * *All 13 in Tasks* on 14. The page counted one question and linked to another, and **nothing
   * tested the href** — a reviewer replaced it with a bare `/r/<register>` and 1,149 tests stayed
   * green.
   *
   * This asks the door's own question of the register the door points at, which is the only way the
   * two can be held to the same answer without asserting a number that goes stale.
   */
  let doors = 0;
  for (const q of ['a', 're', 'o', 'kiln', 'nordhaven', 'e']) {
    for (const g of search(q, 9_999).groups) {
      if (g.href === null) continue;
      const at = /^\/r\/([a-z0-9_]+)\?q=(.+)$/.exec(g.href);
      assert.ok(at, `a door that is not a register query: ${g.href}`);
      assert.equal(decodeURIComponent(at[2]!), q, 'the door asks a different question than the one that was typed');
      const landing = applyFilters(at[1]!, ROWS[at[1]!] ?? [], [], q).length;
      assert.equal(g.total, landing, `\`${q}\`: ${g.kind} counted ${g.total} and its door lands on ${landing}`);
      doors += 1;
    }
  }
  assert.ok(doors > 20, `only ${doors} doors were checked`);
});

test('and the hits inside a group are that group, not a truncation of it', () => {
  /* Also untested before: truncating every group's `hits` to one entry left all 1,149 green, and
     `/search` renders exactly that field. A count with no rows under it is the same lie as a door
     with the wrong rows behind it. */
  for (const q of ['a', 're', 'kiln']) {
    const found = search(q, 9_999);
    for (const g of found.groups) {
      assert.equal(g.hits.length, g.total, `${g.kind} says ${g.total} and carries ${g.hits.length}`);
      for (const h of g.hits) assert.equal(h.kind, g.kind, 'a hit landed in the wrong group');
    }
    assert.equal(found.groups.reduce((n, g) => n + g.total, 0), found.total);
  }
});

test('a row found by something other than its title says which', () => {
  /**
   * Broadening past the title is the point — `services.provider` is declared searchable and typing
   * `nordhaven` could not find a domain before. But a row arriving under a name that does not
   * contain what was typed is a result somebody cannot connect to their own query, and `13 §5.2`'s
   * argument for saying why an empty state is empty is the same argument.
   */
  const found = search('nordhaven', 9_999);
  const services = found.groups.find((g) => g.kind === 'Services');
  assert.ok(services && services.total > 0, 'the provider is declared searchable and answers nothing');
  for (const h of services.hits) {
    assert.ok(h.why, `${h.title} matched on something the reader cannot see, and does not say what`);
    assert.ok(!h.title.toLowerCase().includes('nordhaven'), 'this row matched on its title and should explain nothing');
  }
  /* And silence when the title itself answered, because then there is nothing to explain. */
  for (const h of search('kiln.example', 9_999).groups.flatMap((g) => g.hits))
    if (h.title.toLowerCase().includes('kiln')) assert.equal(h.why, undefined, `${h.title} explained a match anybody can see`);
});

test('why() names a searchable field and never the title', () => {
  const some = rows({ name: 'kiln.example', provider: 'Nordhaven Registry', note: 'renewed by hand' })!;
  assert.equal(why('services', some[0]!, 'nordhaven', 'kiln.example'), 'Nordhaven Registry');
  assert.equal(why('services', some[0]!, 'kiln', 'kiln.example'), null, 'the title answered and it explained anyway');
  assert.equal(why('services', some[0]!, 'renewed', 'kiln.example'), null, '`note` is not searchable and was offered as the reason');
});

/* ── and the words are the same words everywhere ──────────────────────────── */

test('the questions group answers the same query the same way', () => {
  /* A question is not a register row and has no declaration to read. It used to use `includes()`
     while every other group used the declaration, so one query meant two things on one screen. */
  const found = search('ren', 9_999);
  const decide = found.groups.find((g) => g.kind === 'Decide');
  for (const h of decide?.hits ?? [])
    assert.ok(
      tokensOf(h.title).some((t) => t.startsWith('ren')),
      `a question matched \`ren\` on nothing that starts with it: ${h.title}`,
    );
});

test('display() is what is searched, so an enum reads as the words it shows', () => {
  /* The one thing worth keeping from the behaviour this replaced. `owed_to_me` renders as `owed to
     me`, and a searchable enum must be findable by the words on screen rather than by the
     identifier underneath — nobody has ever read `owed_to_me` off this screen. It is moot on the
     shipped seed, where every searchable field is text, and it is one declaration away from not
     being moot. */
  assert.equal(display('obligations', 'direction', 'owed_to_me'), 'owed to me');
  const some = rows({ what: 'Kiln retainer' });
  assert.equal(projected('obligations', some[0]!), 'Kiln retainer');
});
