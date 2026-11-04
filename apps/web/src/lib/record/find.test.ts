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
 * the only shape that catches the NEXT drift: the kernel/screen split is still open, and both halves of this one were written from the same documents and
 * disagreed anyway.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DatabaseSync } from 'node:sqlite';

import { ftsQuery, projectedText } from '@braindog/kernel';

import './fixtures/fill.ts';
import { answers, projected, searchable, terms, tokensOf, why } from './find.ts';
import { REGISTERS, display } from './api.ts';
import { applyFilters, search } from './fixtures/readers.ts';
import { QUESTIONS, DECIDED, ROWS } from './fixtures/sample.ts';
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

  /* AND THE FLAG IS `=== true`, not truthy, and not ignored. Dropping the `search` test entirely or
     loosening it to `!!f.search` both stayed green, because every field in the seed either declares
     `true` or declares nothing — so a probe field is what makes the difference visible. */
  const decl = REGISTERS.services!;
  const held = decl.fields;
  (decl as { fields: unknown }).fields = [...held, { id: 'probe', type: 'text' }, { id: 'probe2', type: 'secret', search: true }];
  try {
    const ids = searchable('services').map((f) => f.id);
    assert.ok(!ids.includes('probe'), 'a field declaring nothing was searched');
    assert.ok(!ids.includes('probe2'), 'a SECRET declaring `search: true` was searched, and it would be printed on a results page');
  } finally {
    (decl as { fields: unknown }).fields = held;
  }
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
   * values, collapses whitespace and joins with newlines. This runs the same walk in the browser,
   * text as stored (a screen may say it more calmly, 57a8634c9, and the record still finds it by what
   * it holds), and for every searchable field in the seed the two are the same string, which is a
   * fact worth asserting rather than assuming. A searchable `money` or `ref` field would fail here on the day it was declared, which
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

/**
 * FOLDING, WHICH THE RECORD DOES ONE LAYER LOWER THAN `ftsQuery`.
 *
 * `0001_kernel.ts` builds `entry_fts` with `tokenize = 'unicode61 remove_diacritics 2'`, so FTS5
 * strips the marks off both the stored text and the query at match time; `ftsQuery` only quotes the
 * words. A browser with no tokeniser has to do it itself, before the words are terms — so the
 * comparison is against `ftsQuery` OF THE FOLDED QUERY, which is the string FTS5 is effectively
 * matching. Comparing against the raw one asserts that the browser does not fold, which is the
 * defect.
 *
 * THIS USED TO BE A COPY OF `find.ts`'S OWN FOLD, which made the assertion a tautology over the
 * app's assumption — it could only ever prove that this file agrees with itself. The test below
 * replaces it with the real thing.
 */
const folded = (q: string) =>
  q
    .toLowerCase()
    .normalize('NFD')
    .replace(/(\p{L})(\p{M}+)/gu, (whole, base: string) => (/^[a-z]$/u.test(base) ? base : whole));

test('the tokeniser is the kernel’s too', () => {
  /* `ftsQuery` is the whole of what the record does with what was typed: lower-case, strip
     everything that is not a letter/number/space, split, and prefix-match each word. Comparing
     against the query STRING it builds is the honest check — a reimplementation that drifted on
     punctuation or on the empty case would still look right beside a prose description of it. */
  for (const q of ['ren', 'Kiln', 'kiln.example', 're-new', '  spaced  out ', 'owed to me', 'ünicode', 'Zürich café', '2026', '']) {
    const mine = terms(q);
    const theirs = ftsQuery(folded(q));
    if (mine === null) {
      assert.equal(theirs, null, `\`${q}\`: the browser found no query and the record found one`);
      continue;
    }
    assert.equal(mine.map((w) => `"${w}"*`).join(' AND '), theirs, `\`${q}\` tokenises differently`);
  }
});

test('AND THE FOLD IS THE RECORD\u2019S FOLD, MEASURED AGAINST A REAL FTS5 TABLE', () => {
  /**
   * Two defects in opposite directions, and the second arrived inside the fix for the first.
   *
   * The browser did not fold at all, so *Zürich* was findable only by typing the umlaut. Then it
   * folded EVERY `\p{M}`, which is more than `remove_diacritics 2` does — and a browser more
   * permissive than the record is a palette that draws a row whose `All N →` door lands on an empty
   * page, which is the exact class of defect one matcher exists to end.
   *
   * SO THE ASSERTION IS THE DATABASE. Every pair below is run through the same virtual table the
   * migration declares, and the browser has to agree with whatever it answers — not with a
   * description of it, and not with a copy of the browser's own rule.
   */
  const db = new DatabaseSync(':memory:');
  db.exec("CREATE VIRTUAL TABLE t USING fts5(x, tokenize='unicode61 remove_diacritics 2')");
  const insert = db.prepare('INSERT INTO t (x) VALUES (?)');
  const match = db.prepare('SELECT count(*) AS n FROM t WHERE x = ? AND t MATCH ?');

  /* Latin marks fold; Arabic harakat, Greek tonos and `Ł` do not. The comment about Arabic and
     English in one record is on the migration, which makes the third row the one that matters. */
  /* BOTH NORMALISATION FORMS OF EVERY QUERY. The browser folds through NFD and `unicode61`
     normalises nothing, so a decomposed paste — which is what macOS produces — tokenised as two
     words in the record and one in the browser: `mañana` typed decomposed matched here and not
     there. `ftsQuery` composes first now, and this is the check that says both spellings are one
     query on both sides. */
  const pairs: [string, string][] = [
    ['mañana', 'mañana'],
    ['mañana', 'mañana'],
    ['mañana', 'manana'],
    ['Ωμέγα', 'ωμέγα'],
    ['Kraków', 'kraków'],
    ['Zurich cafe', 'zurich'],
    ['Zürich café', 'zurich'],
    ['Zürich café', 'cafe'],
    ['Zürich café', 'café'],
    ['Zürich café', 'zurick'],
    ['Việt Nam', 'viet'],
    ['مُحَمَّد', 'محمد'],
    ['محمد', 'محمد'],
    ['Ωμέγα', 'ωμεγα'],
    ['Ωμέγα', 'ωμέγα'],
    ['Łódź', 'lodz'],
    ['Łódź', 'łodz'],
  ];
  for (const [text] of pairs) insert.run(text);

  let checked = 0;
  for (const [text, q] of pairs) {
    const query = ftsQuery(q);
    const theirs = query === null ? true : (match.get(text, query) as { n: number }).n > 0;
    const mine = answers('obligations', rows({ what: text })[0]!, q);
    assert.equal(mine, theirs, `\`${q}\` over \`${text}\`: the browser says ${mine} and the record says ${theirs}`);
    checked += 1;
  }
  db.close();
  assert.equal(checked, pairs.length);
});

test('and `tokensOf` is the same function as `terms`, rather than a copy that says it is', () => {
  /* The comment claimed both sides tokenise identically, `terms` was pinned against `ftsQuery`, and
     this one was pinned by nothing — so the half the questions group uses could drift on
     punctuation, on case or on folding while the assertion above stayed green. */
  for (const text of ['Renewals due', 'kiln.example', 'Zürich café', '  ', '', 'owed_to_me'])
    assert.deepEqual(tokensOf(text), terms(text) ?? []);
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

test('why() NAMES THE FIELD THAT ANSWERED, not the first one it looked at', () => {
  /**
   * Five of six mutations to `why()` survived, and the reason is one register: `services` has
   * exactly one non-title searchable field, so *"the first one"* and *"the one that matched"* were
   * the same string and nothing could tell them apart. A fixture with TWO of them can.
   *
   * `why()` also has to use the same matcher as `answers()`. A row is in the list because `answers`
   * put it there; if `why` decides with `includes` or with `some` instead of `every`, it explains
   * the row with a field that did not answer — which is the two-matchers-disagreeing failure this
   * whole file exists to end, one function further in.
   */
  const decl = REGISTERS.services!;
  const held = decl.fields;
  /* A second searchable non-title field, put back at the end. The alternative is asserting against
     whichever register happens to have two, which is a fixture nothing guarantees. */
  (decl as { fields: unknown }).fields = [...held, { id: 'note', type: 'text', label: 'Note', search: true }];
  try {
    const row = rows({ name: 'kiln.example', provider: 'Nordhaven Registry', note: 'renewed by Tallow in March' })[0]!;
    assert.equal(why('services', row, 'nordhaven', 'kiln.example'), 'Nordhaven Registry');
    /* THE SECOND ONE, which is the assertion that could not fail before. */
    assert.equal(why('services', row, 'tallow', 'kiln.example'), 'renewed by Tallow in March', 'it named the first searchable field rather than the one that matched');
    /* Both terms must be in ONE field, the way `answers` requires them in one row — no, in one row:
       a reason that spans two fields is not a reason either of them gives. */
    assert.equal(why('services', row, 'nordhaven tallow', 'kiln.example'), null, 'it offered a field that answered half the query');
    /* A PREFIX, never a substring: `answers` finds `ren` in `renewed` and not in `children`, and a
       reason found by `includes` would explain rows that are not in the list. */
    assert.equal(why('services', row, 'allow', 'kiln.example'), null, '`why` matched the middle of a token');
    assert.equal(why('services', row, 'kiln', 'kiln.example'), null, 'the title answered and it explained anyway');
  } finally {
    (decl as { fields: unknown }).fields = held;
  }
  const plain = rows({ name: 'kiln.example', provider: 'Nordhaven Registry', note: 'renewed by hand' })[0]!;
  assert.equal(why('services', plain, 'renewed', 'kiln.example'), null, '`note` is not searchable and was offered as the reason');
});

test('a retired field answers nothing, in the browser as in the record', () => {
  /* `fts.ts`: `if (!f.search || f.retired) continue`. The app's `FieldDecl` had no `retired` key at
     all, so a retired searchable field went on answering here and stopped answering there. */
  const decl = REGISTERS.services!;
  const held = decl.fields;
  (decl as { fields: unknown }).fields = [...held, { id: 'note', type: 'text', search: true, retired: true }];
  try {
    assert.ok(!searchable('services').some((f) => f.id === 'note'), 'a retired field is still searched');
    assert.equal(answers('services', rows({ name: 'kiln.example', note: 'tallow' })[0]!, 'tallow'), false);
  } finally {
    (decl as { fields: unknown }).fields = held;
  }
});

/* ── and the words are the same words everywhere ──────────────────────────── */

test('THE QUESTIONS GROUP ANSWERS THE SAME QUERY THE SAME WAY', () => {
  /**
   * A question is not a register row and has no declaration to read. It used `includes()` while every
   * other group read the declaration, so one query meant two things on one screen — and the test
   * written for that could not fail: it asserted every `ren` hit starts a token, and no question
   * title on the seed contains `ren` mid-word, so `includes` and `startsWith` gave the same answer.
   *
   * A query that IS a mid-word substring of a question title is the whole check.
   */
  const mid = [...QUESTIONS, ...DECIDED].flatMap((q) =>
    tokensOf(q.title).flatMap((tok) => (tok.length > 4 ? [tok.slice(2, 5)] : [])),
  );
  assert.ok(mid.length > 0, 'no question title has a word long enough to have a middle');
  for (const q of mid.slice(0, 12)) {
    const decide = search(q, 9_999).groups.find((g) => g.kind === 'Needs you');
    for (const h of decide?.hits ?? [])
      assert.ok(
        tokensOf(h.title).some((tok) => tok.startsWith(q)),
        `\`${q}\` matched the middle of a word in a question title: ${h.title}`,
      );
  }

  /* AND A QUESTION IS STILL FOUND BY ITS SPOKEN ID, whole, which is the one thing about that group
     that is not a text match — and was untested. */
  const one = [...QUESTIONS, ...DECIDED][0]!;
  const byId = search(one.id, 9_999).groups.find((g) => g.kind === 'Needs you');
  assert.ok(byId?.hits.some((h) => h.spoken === one.id), `${one.id} does not resolve as a spoken id`);
});

test('display() is what is searched, so an enum reads as the words it shows', () => {
  /* The one thing worth keeping from the behaviour this replaced. `owed_to_me` renders as `owed to
     me`, and a searchable enum must be findable by the words on screen rather than by the
     identifier underneath — nobody has ever read `owed_to_me` off this screen. It is moot on the
     shipped seed, where every searchable field is text, and it is one declaration away from not
     being moot. */
  assert.equal(display('obligations', 'direction', 'owed_to_me'), 'Money in');
  const some = rows({ what: 'Kiln retainer' });
  assert.equal(projected('obligations', some[0]!), 'Kiln retainer');
});
