/**
 * The `where:` evaluator, whose failure mode is the reason it exists.
 *
 * A filter that does not understand its own predicate must return NOTHING. The version this
 * replaces returned everything: five `String.includes` checks, and any predicate outside them was
 * silently ignored, so a block drew the whole register and looked exactly like a block that had
 * filtered. An agent writing a declaration cannot see that. It writes a page, the page renders,
 * every figure on it is about the wrong rows, and the only person who could catch it is the one who
 * trusted the agent.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

/* THE RECORD ITSELF, not a description of it. The differential at the bottom of this file opens a
   real SQLite record, installs the same seed into it and asks it the same sentences; `engines.test.ts`
   wires a kernel the same way and for the same reason. */
import { openRecord, type Kernel } from '@braindog/kernel';
import { installSeed } from '@braindog/seed';

import { applyFilters, display, labelOf } from './api.ts';
import { saidPlainly } from './blocks.ts';
import { NOW, PAGES, REGISTERS, ROWS, VIEWS } from './data.ts';
import { resolvePages } from './pages.ts';
import type { Fields, Filter, PageDecl } from './schema.ts';
import { compile, explain, matches, registerHref, resolveDay } from './where.ts';

const keep = (register: string, where: string) => {
  const w = compile(register, where);
  return (ROWS[register] ?? []).filter((e) => matches(e, w, NOW));
};

const all = (register: string) => (ROWS[register] ?? []).length;

/* ── the failure that motivated it ───────────────────────────────────────── */

test('a filter it cannot parse matches NOTHING, never everything', () => {
  const out = keep('services', 'this is not a filter at all');
  assert.equal(out.length, 0, 'an unparseable filter passed rows through');
  /* AND IT SAYS SO IN THE KERNEL'S WORDS. `13 §6`: the app renders the server's `fix` verbatim, and
     this file had its own — "not a predicate", a verdict with no instruction, using the schema's
     word for a thing whose button says Filter. */
  const said = compile('services', 'nonsense here').bad[0] ?? '';
  assert.match(said, /not something a filter can say/);
  assert.ok(!/predicate/.test(said), 'the schema is talking about itself in a refusal');
});

test('one bad clause poisons the whole predicate rather than being skipped', () => {
  // Half a filter is more dangerous than none: the block looks filtered and is not.
  assert.equal(keep('services', 'state is live, wat').length, 0);
});

test('an empty predicate keeps everything, which is the one safe pass-through', () => {
  assert.equal(keep('services', '').length, all('services'));
});

/* ── the grammar ─────────────────────────────────────────────────────────── */

test('one value', () => {
  const out = keep('services', 'state is live');
  assert.ok(out.length > 0 && out.length < all('services'));
  for (const e of out) assert.equal(e.fields.state, 'live');
});

test('several values, read as "or"', () => {
  const live = keep('services', 'state is live').length;
  const lapsing = keep('services', 'state is lapsing').length;
  assert.equal(keep('services', 'state is live or lapsing').length, live + lapsing);
});

test('clauses are ANDed', () => {
  const out = keep('services', 'state is live, cycle is monthly');
  assert.ok(out.length > 0, 'the seed needs a live monthly service for this to mean anything');
  for (const e of out) {
    assert.equal(e.fields.state, 'live');
    assert.equal(e.fields.cycle, 'monthly');
  }
  assert.ok(out.length < keep('services', 'state is live').length, 'the second clause did nothing');
});

test('negation', () => {
  const out = keep('services', 'state is not live');
  for (const e of out) assert.notEqual(e.fields.state, 'live');
  assert.equal(out.length, all('services') - keep('services', 'state is live').length);
});

/* ── values are read the way they are SHOWN ──────────────────────────────── */

test('an enum matches the words a reader sees, not the identifier it stores', () => {
  // `owed_to_me` on the row, "owed to me" on the screen, and the predicate is written the second
  // way — which is the entire argument for having a readable predicate.
  const out = keep('obligations', 'direction is owed to me');
  assert.ok(out.length > 0);
  for (const e of out) assert.equal(e.fields.direction, 'owed_to_me');
});

test('a ref matches the NAME of the row it points at', () => {
  // The declaration says `thing is Kiln`, never `thing is 1`.
  const out = keep('tasks', 'thing is Kiln');
  assert.ok(out.length > 0);
  const kiln = (ROWS.things ?? []).find((t) => t.fields.name === 'Kiln')?.seq;
  for (const e of out) assert.equal(e.fields.thing, kiln);
});

test('and the stored form still matches, so an agent may write either', () => {
  assert.equal(keep('obligations', 'direction is owed_to_me').length, keep('obligations', 'direction is owed to me').length);
});

/* ── dates ───────────────────────────────────────────────────────────────── */

test('before and after are exclusive, and take an ISO day', () => {
  const before = keep('obligations', 'due before 2026-09-01');
  const after = keep('obligations', 'due after 2026-09-01');
  for (const e of before) assert.ok(String(e.fields.due) < '2026-09-01');
  for (const e of after) assert.ok(String(e.fields.due) > '2026-09-01');
  // Neither contains the boundary, so the two cannot overlap.
  assert.equal(before.filter((e) => after.includes(e)).length, 0);
});

test('`today` resolves against the record clock, not the wall clock', () => {
  const overdue = keep('obligations', 'due before today');
  assert.ok(overdue.length > 0, 'the seed has overdue rows');
  const today = new Date(NOW).toISOString().slice(0, 10);
  for (const e of overdue) assert.ok(String(e.fields.due) < today);
});

test('`due is not today` IS A DAY AND NOT THE WORD, and it used to return the whole register', () => {
  /* `is not` over a dated field had nowhere to go and fell through to the string branch, where the
     comparison is "the due field does not hold the text `today`" — true of every row that has a
     date and of every row that has none. The whole register came back and looked like an answer.
     The kernel's structured form resolved it all along, so the two renderings of one grammar gave
     different answers over the same rows. */
  /**
   * A RELATIVE WORD, AND A DAY THE SEED ACTUALLY HAS A ROW ON.
   *
   * Both halves matter. `today` is a day this record may hold nothing on, and "nothing is excluded"
   * is exactly the answer the defect gives, so a literal `today` cannot tell the two apart. And an
   * ISO literal cannot either: the string branch compares it against the stored date and happens to
   * be right, so only a word that has to be RESOLVED reaches the defect. `-38d` is a word.
   */
  const dated = (ROWS.obligations ?? []).filter((e) => typeof e.fields.due === 'string' && e.fields.due);
  const day = String(dated[0]?.fields.due ?? '').slice(0, 10);
  assert.ok(day, 'the seed has no dated obligation, so this asserts nothing');
  const off_days = Math.round((Date.parse(`${day}T12:00:00Z`) - Date.parse(`${new Date(NOW).toISOString().slice(0, 10)}T12:00:00Z`)) / 86_400_000);
  const said = `${off_days >= 0 ? '+' : '-'}${Math.abs(off_days)}d`;
  assert.equal(resolveDay(said, NOW), day, 'the relative word does not name the day it was built from');

  const on = keep('obligations', `due is ${said}`);
  const off = keep('obligations', `due is not ${said}`);

  assert.ok(on.length > 0, 'the day chosen matches no row, so the negation cannot be checked');
  assert.ok(off.length < all('obligations'), 'every row matched the negation, which is the defect');
  for (const e of off) assert.notEqual(String(e.fields.due).slice(0, 10), day);
  /* AND THE TWO HALVES ADD UP OVER EVERY ROW, undated ones included. `34 §6`: every positive
     operator is false on a missing value, and `not` is how a person says "and the empty ones". A
     negation that quietly drops the undated rows is a different bug wearing the same shape as the
     fix. */
  assert.equal(on.length + off.length, all('obligations'));
});

test('a row with no value for a dated field is not silently included', () => {
  // A missing date is not "before" anything. Counting it would put rows with no due date into an
  // overdue list, which is the sort of thing somebody acts on.
  const rows = (ROWS.tasks ?? []).filter((t) => !t.fields.by);
  const w = compile('tasks', 'by before today');
  for (const e of rows) assert.equal(matches(e, w, NOW), false);
});

/* ── the refusal names what to write instead ─────────────────────────────── */

test('the predicate TREE the docs also show is refused, not thrown on', () => {
  // `06-PAGES` §1 writes `where: { all: [...] }` and `21-AUTHORING` §4.5 says the sentence is the
  // read-only restatement of it. An agent following either is following the documentation, and the
  // object reached `.split`, threw, and took the whole page with it.
  const w = compile('obligations', { all: [{ field: 'state', in: ['open'] }] } as unknown as string);
  assert.equal(w.clauses.length, 0);
  assert.match(w.bad[0] ?? '', /sentence/);
  assert.match(w.bad[0] ?? '', /state is open/, 'a refusal that does not show the shape is a dead end');
});

test('an operator the build does not read is named as an operator, not matched as a value', () => {
  // `21-AUTHORING` §4.2 publishes eleven and four are implemented. `amount is at least 10000` parsed
  // as `is` against the literal string "at least 10000", matched nothing, and drew the author's own
  // "nothing matched" sentence — the one state that must be kept apart from a filter that failed.
  /* `note is empty` WAS THE SECOND ROW HERE AND IS NOW A CLAUSE. `empty` and `present` came off
     `UNIMPLEMENTED` because this engine reads them: they are the two published operators that take
     no operand, the kernel beside it has compiled both since its first draft, and refusing the
     sentence for a predicate the JSON form accepts is the two-languages failure both files are
     held against. The rest of the list is still published and still unread. */
  for (const [text, word] of [
    ['amount is at least 10000', 'at least'],
    ['note is more than 10', 'more than'],
    ['amount is between 1 and 2', 'between'],
  ] as const) {
    const w = compile('obligations', text);
    assert.ok(w.bad.length, `${text} was accepted`);
    assert.match(w.bad[0] ?? '', new RegExp(word));
    assert.match(w.bad[0] ?? '', /is not/, 'the refusal has to say what does work');
  }
});

test('and an operator word that is a real value is still a value', () => {
  // The check runs after the declared set, so an enum that genuinely holds one of those words
  // resolves. `state is open` is the case that matters, and `present`/`in` are the ones at risk.
  assert.deepEqual(compile('obligations', 'state is open').bad, []);
  assert.deepEqual(compile('services', 'state is live').bad, []);
});

test('an unparseable clause says which operators exist, in the words to type', () => {
  /* THE SENTENCE IS THE KERNEL'S, BYTE FOR BYTE (`packages/where/src/sentence.ts`). It used to be
     `This build reads: is · is not · before · after` — middle dots a person cannot type, and the
     software describing itself.
     SIX WORDS NOW, NOT FOUR. The kernel's sentence names `has` and `lacks`, and while this compiler
     read four the refusal was teaching an agent that two operators the record answers do not exist. */
  const said = compile('obligations', 'what contains invoice').bad[0] ?? '';
  assert.match(said, /Write is, is not, before, after, has or lacks\./);
  assert.ok(!/This build/.test(said), 'the software is describing itself in a refusal');
});

/* ── shape ───────────────────────────────────────────────────────────────── */

test('whitespace and case are not part of the grammar', () => {
  assert.equal(keep('services', '  STATE   IS   Live  ').length, keep('services', 'state is live').length);
});

test('an unknown field matches nothing rather than everything', () => {
  assert.equal(keep('services', 'nope is live').length, 0);
});

/* ── operands are CHECKED, not just parsed ───────────────────────────────── */

test('a date operand that is not a date is refused, not compared as a string', () => {
  // Every one of these parsed cleanly in the first version and then string-compared: `'2026-08-01'
  // > '-7d'` is true because '2' sorts after '-', so a "this week" block drew the whole register.
  for (const bad of ['-7d ago', 'soon', 'last tuesday', 'next month']) {
    const w = compile('obligations', `due after ${bad}`);
    assert.ok(w.bad.length, `${bad} was accepted as a date`);
    assert.equal(keep('obligations', `due after ${bad}`).length, 0);
  }
});

test('the temporal literals resolve, and are not all the same day', () => {
  const days = ['today', 'tomorrow', 'yesterday', 'bow', 'bom', 'eom', 'boy', 'eoy', '+30d', '-7d', '+2w', '+1m'];
  const seen = new Set<string>();
  for (const d of days) {
    const out = resolveDay(d, NOW);
    assert.ok(out && /^\d{4}-\d{2}-\d{2}$/.test(out), `${d} did not resolve`);
    seen.add(out);
  }
  assert.ok(seen.size >= 9, 'several literals collapsed onto the same day');
});

test('a month is a calendar month, and it clamps rather than overflowing', () => {
  // One month after 31 January is the last day of February. Adding to the month number rolls into
  // March, which is not what anybody means by "in a month".
  const jan31 = Date.parse('2026-01-31T12:00:00Z');
  assert.equal(resolveDay('+1m', jan31), '2026-02-28');
  assert.equal(resolveDay('-1m', Date.parse('2026-03-31T12:00:00Z')), '2026-02-28');
});

test('a relative window actually narrows, in the direction it says', () => {
  const soon = keep('obligations', 'due before +30d');
  const later = keep('obligations', 'due before +365d');
  assert.ok(soon.length > 0, '+30d matched nothing, which is the old failure in the other direction');
  assert.ok(soon.length < later.length, 'a wider window did not admit more rows');
  assert.ok(later.length <= all('obligations'));
});

test('a value the field cannot hold is refused, and says which', () => {
  // `done` is a TASK state. Obligations have none, so `state is not done` was true of all 38 —
  // a negation over a typo passing the whole register through.
  const w = compile('obligations', 'state is not done');
  assert.ok(w.bad.length, 'an impossible value was accepted');
  assert.match(w.bad[0] ?? '', /state has no value done/);
  assert.equal(keep('obligations', 'state is not done').length, 0);
});

test('a ref value that names no row is refused', () => {
  const w = compile('tasks', 'thing is Atlantis');
  assert.ok(w.bad.length);
  assert.equal(keep('tasks', 'thing is Atlantis').length, 0);
});

test('every value in an `or` is checked, not just the first', () => {
  const w = compile('obligations', 'state is open or nonsense');
  assert.ok(w.bad.length, 'a bad value hid behind a good one');
});

test('explain says what was wrong, because the refusal is the teacher', () => {
  const w = compile('obligations', 'state is not done, due after soon');
  assert.equal(explain(w).length, 2);
  for (const line of explain(w)) assert.ok(line.length > 10, 'a refusal that explains nothing is a dead end');
});

/* ── the address of the rows it did not draw ─────────────────────────────── */

test('the register href carries the predicate the surface filtered by', () => {
  /* THE BLOCK PRINTED ITS FILTER AND LINKED PAST IT. `/p/marlow-co`'s Money block reads
     `Filter state is open, direction is owed to me` and its provenance link went to `/r/obligations`
     bare — all 38 rows, the filter the reader had just been shown thrown away on the way through. */
  const href = registerHref('obligations', 'state is open, direction is owed to me');
  assert.match(href, /^\/r\/obligations\?/);
  assert.match(href, /f=state:in:open/);
  /* AS THE FIELD DECLARES THEM, because the control at the other end compares strings: the
     predicate says `owed to me` and the register stores `owed_to_me`. */
  assert.match(href, /f=direction:in:owed_to_me/);
  assert.ok(!href.includes('%20'), 'a URL carried a spoken value with spaces in it');
});

test('a dated clause survives the trip, and a negation becomes not-in', () => {
  /* THE WORD, NOT THE DAY IT RESOLVES TO. `+90d` travels; `2026-12-06` is the window frozen at the
     moment the link was rendered, and a bookmark to "renews in 90 days" that means a fixed December
     afternoon is a bookmark that quietly stops answering its own question. The chip parser hands it
     back to `compile`, which resolves it against the record's clock on arrival. */
  const dated = registerHref('services', 'renews before +90d');
  assert.match(dated, /f=renews:before:%2B90d/, 'the + did not survive encoding');

  /* NOT the enum's complement: the complement is only writable while the field's values are fixed,
     and a URL that lists them breaks the day a pack adds one. */
  const negated = registerHref('services', 'state is not cancelled');
  assert.match(negated, /f=state:not-in:cancelled/);
});

test('a predicate it could not read opens the register UNFILTERED, and does not pretend', () => {
  /* The alternative is a URL narrowed by the half of the sentence that parsed — a list that looks
     filtered and is not, which is the one failure `compile` exists to prevent. */
  const href = registerHref('obligations', 'state is open, ackamarackus');
  assert.equal(href, '/r/obligations');
  assert.equal(registerHref('obligations', undefined), '/r/obligations');
});


/* ── the sentence on the screen is a sentence the record takes ───────────── */

/**
 * A SCREEN'S RESTATEMENT OF A DECLARATION HAS TO BE A DECLARATION.
 *
 * Every declared page prints its own filter through `saidPlainly`, which swaps each field id for the
 * label the same screens render and each `+90d` for the phrase it means. That sentence is the one
 * thing on the page that says what the block is about — it is what a person reads when they ask what
 * a page filters on, and what an agent copies when it asks the same question. Six of the seed's
 * twelve declared filters did not survive one trip back through the compiler: `kind is domain` came
 * back as `type is domain — there is no field called type`, and `renews before +90d` as
 * `90 days from now is not a date`.
 *
 * The fix was on the compiler's side, not the printer's, and the file already argued for it:
 * `declaredValue` exists so "the stored form and the readable form have to be the same thing, or the
 * predicate is a second language somebody has to learn". A field's VALUE had been taught both
 * spellings and its NAME and its DATE never had.
 *
 * THE ASSERTION IS THE MATCHED SET, not the parse tree — `+90d` and `90 days from now` are stored as
 * written and resolved at match time, so two identical filters hold different literals. What has to
 * be equal is the rows.
 */

const rowsFor = (register: string, where: string): string => {
  const w = compile(register, where);
  return (ROWS[register] ?? [])
    .filter((e) => matches(e, w, NOW))
    .map((e) => e.seq)
    .join(',');
};

/**
 * What one declared filter did, and it used to be a `boolean` that said `false` to two different
 * things.
 *
 * "NOBODY CHECKED THIS ONE" AND "THE RECORD CANNOT READ IT" ARE NOT THE SAME ANSWER, and collapsing
 * them cost both callers below. The page test read a refusal as an absence and turned it into an
 * off-by-one against a hard-coded number, which names neither the page nor the filter; the saved
 * view test discards the return altogether, so a view whose filter the record refuses was reported
 * by nobody at all. A refusal is its own verdict now and each caller prints the ones it found.
 */
type Verdict = 'checked' | 'held' | 'refused';

const roundTrips = (register: string, where: string, from: string): Verdict => {
  /* A `{{field}}` LEFT IN THE SENTENCE MEANS NOBODY CHECKED THIS ONE, and skipping it used to be the
     end of the matter. `for:` fills these from the row before anything draws, so both callers below
     now walk the EXPANDED pages, and a placeholder that survives the expansion is a filter with no
     reader rather than a filter that is not due yet. Testing for the placeholder is still right
     rather than testing whether it compiles: most do not compile unexpanded, but
     `project is {{spoken}}` does, as a literal on a text field. */
  if (/\{\{\w+\}\}/.test(where)) return 'held';
  const first = compile(register, where);
  if (first.bad.length) return 'refused';
  const said = saidPlainly(register, where);
  const back = compile(register, said);
  assert.deepEqual(back.bad, [], `${from}: the record refuses its own sentence — "${said}"`);
  assert.equal(
    rowsFor(register, said),
    rowsFor(register, where),
    `${from}: "${where}" and the "${said}" it prints select different rows`,
  );
  return 'checked';
};

/**
 * Every `where:` the record actually draws, walked, with the refusals kept rather than counted.
 *
 * `for:` IS EXPANDED FIRST, AND THAT IS THE HOLE IT CLOSES. This read the declarations, where nine
 * of the thirty-eight page filters hold a `{{name}}` only `for:` can fill, and it skipped all nine
 * with a comment saying so. Those nine are every block of the project template, which is to say
 * every filter on `/p/kiln`, `/p/marlow-co` and `/p/portage`: the three pages a reader opens most
 * were narrowed by sentences no test had ever compiled. Resolved, the nine become twenty-seven real
 * ones and the walk covers 58 filters over the 16 pages there are, all of which the record reads
 * back.
 *
 * It takes the declarations instead of reading `PAGES` itself so that the test below can walk pages
 * the record certainly cannot read through this exact code. A detector nobody has seen detect
 * anything is the shape this test has already shipped twice.
 */
/**
 * Which register a block's rows come from, as the page reader decides it.
 *
 * `sessions.live` IS A REGISTER UNDER ANOTHER NAME, and the bare `startsWith('register.')` this
 * replaces left the last two page filters out of the walk. `/p/agents` draws `state is active` and
 * `state is idle or handoff, next is set` over live agent runs; `page-live.ts`'s `registerOf` turns
 * that source into the `session` register and `filterForBlock` hands the sentence to the same
 * `compile` as every other block, so both are filters the record reads and neither had ever been
 * read back. The other sources a block may name (`forecast.runway`, `metric.*`, `governance.open`)
 * carry no `where:` and have no register to compile one against, so they remain nothing here.
 */
const registerFor = (source: string): string | null => {
  if (source === 'sessions.live') return 'session';
  return source.startsWith('register.') ? source.slice('register.'.length) : null;
};

const walkPages = (declared: Record<string, PageDecl>) => {
  const pages = resolvePages(declared);
  const checked: string[] = [];
  const refused: string[] = [];
  const held: string[] = [];
  const unfiltered: string[] = [];
  const unnarrowed: string[] = [];
  for (const [slug, page] of Object.entries(pages)) {
    for (const block of page.blocks) {
      const source = String(block.source ?? '');
      const register = registerFor(source);
      if (register === null) continue;
      const at = `/p/${slug} ${source}`;
      if (!block.where) {
        /* A DELETED FILTER LEAVES NO FILTER TO CHECK, which is the half of this walk that cannot be
           done by walking the filters that are there. A block with no `where` draws the whole
           register, and the two callers keep that fact apart because only one of them can judge it:
           a page ABOUT ONE ROW that draws a whole register is wrong however it got that way
           (`/p/kiln` without its `thing is Kiln` lists all 27 tasks in the record under one
           project's heading), while a hand-written page may mean it, so those are named in the test
           instead. A `diff` block is neither: it narrows by naming its row outright
           (`row: {{spoken}}`), which is why the four skill pages are not in either list. */
        if (block.row) continue;
        if (page.identity ?? page.param) unfiltered.push(`${at}: a page about one row draws the register unfiltered`);
        else unnarrowed.push(`${at}${block.heading ? ` "${block.heading}"` : ''}`);
        continue;
      }
      const verdict = roundTrips(register, block.where, at);
      if (verdict === 'checked') checked.push(`${at}: ${block.where}`);
      if (verdict === 'held') held.push(`${at}: "${block.where}" still holds a placeholder that for: did not fill`);
      if (verdict === 'refused') refused.push(`${at}: "${block.where}" is ${explain(compile(register, block.where)).join('; ')}`);
    }
  }
  /* AND A TEMPLATE THAT EXPANDS TO NO PAGE TAKES ITS FILTERS OUT OF THE WALK ALTOGETHER, which is
     the way this could go quiet again: `resolvePages` drops a template whose own `for:` predicate
     is refused or matches no row, so the nine filters below it would simply stop being counted
     rather than start failing. The expansions carry the declaration's own `for` object by
     reference, so a template with none of them left is one nobody is reading. */
  const barren = Object.values(declared)
    .filter((decl) => decl.for && !Object.values(pages).some((page) => page.for === decl.for))
    .map((decl) => `/p/${decl.page}: for: ${decl.for?.where ?? 'everything'} over ${decl.for?.register} expands to no page, so its filters are checked by nobody`);
  return { checked, refused, held, unfiltered, unnarrowed, barren };
};

/**
 * The same filters, counted by a pass that does not know the walk exists.
 *
 * THE COMPARISON IS BETWEEN TWO LISTS AND NOT BETWEEN A COUNT AND A CONSTANT. A floor cannot tell
 * "this filter was checked" from "this filter was quietly not walked", and that is the only thing
 * the page test has ever been for: put a `continue` in the loop above, or let a filter slide into a
 * verdict nobody asserts on, and the two lists disagree by name rather than by five.
 */
const filtersOn = (declared: Record<string, PageDecl>): string[] =>
  Object.entries(resolvePages(declared)).flatMap(([slug, page]) =>
    page.blocks
      .filter((block) => block.where && registerFor(String(block.source ?? '')) !== null)
      .map((block) => `/p/${slug} ${block.source}: ${block.where}`),
  );

/** One page, one block, for the teeth below: the shortest declaration `resolvePages` will take. */
const onePage = (page: Record<string, unknown>, block: Record<string, unknown>): Record<string, PageDecl> => ({
  nowhere: { page: 'nowhere', title: 'Nowhere', requires: [], blocks: [{ kind: 'table', span: 12, ...block }], ...page } as unknown as PageDecl,
});

test('every filter a declared page prints is one the record reads back', () => {
  /**
   * THE NUMBER WAS THE TEST, THE NUMBER WENT STALE FIVE FILTERS AGO, AND THE FLOOR THAT REPLACED IT
   * PROVED FIVE FILTERS LESS THAN IT LOOKED.
   *
   * `assert.equal(checked, 24)` was failing on a tree where every declared filter compiles, so it
   * became `checked >= 24` against a measured 29. That is four filters of slack plus the one the
   * ledger pack was about to add: five page filters could be deleted, or turn into templates
   * through a typo'd `{{x}}` and be skipped, and this stayed green while naming nothing.
   *
   * THE THIRD OPTION IS THE PROPERTY. What the walk checked is compared against what the pages
   * carry, list against list, so a filter that goes missing from the walk is named, and a filter
   * somebody adds is counted on both sides and needs no edit here. The lists below say WHICH way a
   * filter can stop being read: the record refuses it, a placeholder survived expansion, a template
   * expanded into no page at all, a page about one row lost its filter, or a block that never had
   * one appeared on a hand-written page.
   */
  const walk = walkPages(PAGES);
  assert.deepEqual(walk.refused, [], `a page filters on something the record cannot read:\n${walk.refused.join('\n')}`);
  assert.deepEqual(walk.held, [], `a filter reached the record with a placeholder still in it:\n${walk.held.join('\n')}`);
  assert.deepEqual(walk.barren, [], `a template's filters are read by nobody:\n${walk.barren.join('\n')}`);
  assert.deepEqual(walk.unfiltered, [], `a page about one row draws a register unfiltered:\n${walk.unfiltered.join('\n')}`);

  /**
   * AND THE BLOCKS THAT MEAN THE WHOLE REGISTER ARE NAMED, which is the only way a walk of the
   * filters that exist can see a filter that was deleted. Five blocks on hand-written pages carry
   * no `where`, and each of their headings says as much. Delete `/p/portfolio`'s five
   * `lane is building or earning` clauses and the page draws every project under headings about
   * some of them: nothing above notices, because there is no longer a sentence to read back, and
   * this list grows by five.
   *
   * A block added here is a block whose author has decided a reader should see every row of a
   * register. That is a rarer edit than adding a filter, and a louder one, which is why this is a
   * list of names rather than the count it replaces.
   */
  assert.deepEqual(
    walk.unnarrowed,
    ['/p/money register.accounts "Accounts"', '/p/ledger register.snapshots "Night by night"', '/p/estate register.services "What it is made of"', '/p/estate register.services "Everything"', '/p/people register.people "Everyone"'],
    'a page block draws a whole register where it did not before, or one that meant to has lost its heading',
  );

  /* THE FLOOR IS OF ASSERTIONS, NOT OF BLOCKS, which is the older lesson and still the right one.
     `checked` once incremented once per block whether or not `roundTrips` asserted anything, so a
     floor of eight was satisfied by twelve blocks of which only eight were tested. It now holds the
     filters that were carried through `saidPlainly` and compared row for row, by name, and
     `filtersOn` counts the same blocks without going through the walk at all. */
  assert.deepEqual([...walk.checked].sort(), [...filtersOn(PAGES)].sort(), 'a filter the pages carry was not round-tripped');
  assert.ok(walk.checked.length > 0, 'no declared page filters on anything, so this walk proved nothing');

  /**
   * AND THE WALK IS MADE TO CATCH ONE OF EACH, because an empty list is worth reading only if
   * something lands in it. Measured on the way in: with `is not` taken out of `where.ts`'s
   * `CLAUSE`, `refused` prints the declared filters that negate, three of `/p/work`'s among them,
   * each with the refusal the record gave it, where the count gave the bare `29 !== 24` for a tree
   * with nothing wrong in it at all.
   */
  const unreadable = walkPages(onePage({}, { source: 'register.tasks', where: 'frobnicate is wobbly' }));
  assert.deepEqual(unreadable.checked, [], 'a filter naming a field no register declares was walked through as readable');
  assert.match(unreadable.refused[0] ?? '', /no field called frobnicate/, 'the walk does not say what it refused');

  /* THE TEMPLATE IS WALKED AS THE PAGE IT BECOMES, which is the assertion the old skip made
     impossible: `thing is {{name}} Ltd` compiles as a literal, expands into a ref no row answers
     to, and is caught only after `for:` has run. */
  const expanded = walkPages(onePage({ for: { register: 'things' } }, { source: 'register.obligations', where: 'thing is {{name}} Ltd' }));
  assert.deepEqual(expanded.checked, [], 'a template that expands into an unreadable filter was walked through as readable');
  assert.match(expanded.refused[0] ?? '', /thing is Kiln Ltd/, 'the walk read the template rather than the page it expands into');

  /* A PLACEHOLDER NO ROW FILLED IS NOT A FILTER AND NOT AN ABSENCE. `fill` leaves an unresolved
     `{{x}}` exactly as written, on purpose, so it reaches a reader as the path it is. */
  const heldOpen = walkPages(onePage({}, { source: 'register.tasks', where: 'state is {{missing}}' }));
  assert.deepEqual(heldOpen.checked, []);
  assert.match(heldOpen.held[0] ?? '', /still holds a placeholder/, 'a filter nothing filled was counted as checked');

  /* A TEMPLATE OVER A PREDICATE NO ROW ANSWERS DRAWS NO PAGE, and its filters would otherwise leave
     the walk without leaving a mark. */
  const noRows = walkPages(onePage({ for: { register: 'things', where: 'name is Atlantis' } }, { source: 'register.tasks', where: 'state is open' }));
  assert.deepEqual(noRows.checked, []);
  assert.match(noRows.barren[0] ?? '', /checked by nobody/, 'a template that expands to nothing went unreported');

  /* AND A BLOCK WITH NO FILTER ON IT AT ALL, judged one way on a page about one row and the other
     way on a page that may have meant it. */
  const bare = walkPages(onePage({ for: { register: 'things' } }, { source: 'register.tasks' }));
  assert.match(bare.unfiltered[0] ?? '', /draws the register unfiltered/, 'a deleted filter left a page about one row drawing everything');
  assert.deepEqual(bare.unnarrowed, [], 'a page about one row was let off as a page that meant it');

  const everything = walkPages(onePage({}, { source: 'register.tasks', heading: 'Everything' }));
  assert.deepEqual(everything.unnarrowed, ['/p/nowhere register.tasks "Everything"'], 'a block drawing a whole register went unnamed');
  assert.deepEqual(everything.unfiltered, []);
});

/**
 * Every saved view's filter, said as a sentence and put through the same round trip.
 *
 * A VIEW'S REFUSAL WAS REPORTED BY NOBODY, and then its ABSENCE was not either. The first version
 * discarded `roundTrips`' answer, so a view whose filter the record cannot read asserted nothing;
 * the second kept the refusals and put a `checked > 0` floor under a record that ships two views,
 * so either one could lose its filters entirely and the other would carry the test on its own.
 *
 * A VIEW IS A REGISTER AND A PREDICATE. One with no predicate is the whole register under a name,
 * which is a defect and not an absence, so it is reported here rather than skipped by a `continue`,
 * and the count it is held to is every view the record ships.
 */
const walkViews = (views: Record<string, { register: string; name: string; filters: readonly Filter[] }>) => {
  const checked: string[] = [];
  const refused: string[] = [];
  const held: string[] = [];
  const unfiltered: string[] = [];
  for (const [id, view] of Object.entries(views)) {
    const where = view.filters
      .map((f) => `${f.field} ${f.op === 'in' ? 'is' : f.op} ${f.values.join(' or ')}`)
      .join(', ');
    if (!where) {
      unfiltered.push(`/v/${id}: "${view.name}" declares no filter, so it is the whole register under a name`);
      continue;
    }
    const verdict = roundTrips(view.register, where, `/v/${id}`);
    if (verdict === 'checked') checked.push(`/v/${id}`);
    if (verdict === 'held') held.push(`/v/${id}: "${where}" holds a placeholder, and no view is a template`);
    if (verdict === 'refused') refused.push(`/v/${id}: "${where}" is ${explain(compile(view.register, where)).join('; ')}`);
  }
  return { checked, refused, held, unfiltered };
};

test('and every filter a saved view prints', () => {
  const walk = walkViews(VIEWS);
  assert.deepEqual(walk.refused, [], `a saved view filters on something the record cannot read:\n${walk.refused.join('\n')}`);
  assert.deepEqual(walk.held, [], `a saved view filters on a placeholder:\n${walk.held.join('\n')}`);
  assert.deepEqual(walk.unfiltered, [], `a saved view has no predicate left:\n${walk.unfiltered.join('\n')}`);
  /* EVERY VIEW, BY NAME, rather than at least one of them. */
  assert.deepEqual(walk.checked, Object.keys(VIEWS).map((id) => `/v/${id}`), 'a saved view was not round-tripped');
  assert.ok(walk.checked.length > 0, 'the record ships no saved view, so nothing was proved');

  /* AND THE WALK IS MADE TO CATCH ALL THREE, on views the record does not have. `held` is the one
     that looks unreachable: no saved view is a template, so nothing fills a `{{x}}` in one. That is
     exactly why it is asserted. A view is a row a reader wrote, and a value pasted out of a page
     declaration would arrive here as a placeholder nothing will ever fill, which `roundTrips` must
     not be allowed to call checked. */
  const teeth = walkViews({
    unreadable: { register: 'tasks', name: 'Unreadable', filters: [{ field: 'frobnicate', op: 'in', values: ['wobbly'] }] },
    bare: { register: 'tasks', name: 'Bare', filters: [] },
    pasted: { register: 'tasks', name: 'Pasted', filters: [{ field: 'state', op: 'in', values: ['{{state}}'] }] },
  });
  assert.deepEqual(teeth.checked, [], 'a view the record refuses was walked through as readable');
  assert.match(teeth.refused[0] ?? '', /no field called frobnicate/, 'the walk does not say what it refused');
  assert.match(teeth.unfiltered[0] ?? '', /"Bare" declares no filter/, 'a view with no predicate went unreported');
  assert.match(teeth.held[0] ?? '', /holds a placeholder/, 'a view filtering on a placeholder was counted as checked');
});

test('a clause written with the label the screen shows is the same clause', () => {
  /* THE SWEEP, rather than the eight the seed happens to declare. Every enum field of every
     register, said both ways, must select the same rows — which is the promise the round trip above
     depends on and the one that quietly breaks the first time somebody adds a `label:`. */
  let pairs = 0;
  for (const [id, decl] of Object.entries(REGISTERS)) {
    for (const field of decl.fields) {
      if (field.type !== 'enum' || !field.values?.length) continue;
      const label = labelOf(field);
      if (label.toLowerCase() === field.id) continue;
      const value = field.values[0]!;
      assert.equal(
        rowsFor(id, `${label} is ${value}`),
        rowsFor(id, `${field.id} is ${value}`),
        `${id}: "${label} is ${value}" and "${field.id} is ${value}" disagree`,
      );
      assert.deepEqual(compile(id, `${label} is ${value}`).bad, [], `${id}: ${label} is not read as a field`);
      pairs++;
    }
  }
  assert.ok(pairs > 0, 'no register labels a field differently from its id, so nothing was proved');
});

test('the id wins over a label, so one field cannot answer for another', () => {
  /**
   * THE COLLISION IS MADE, NOT WAITED FOR.
   *
   * The first version of this walked the seed looking for a field whose LABEL is another field's
   * ID, found none — no register declares one — and asserted
   * `compile(…).register === 'obligations'`, which is a tautology because `compile` echoes its
   * first argument straight into that key. Putting the label branch ahead of the id branch, the
   * exact defect this test is named for, left it green. A review that broke it on purpose found
   * that out; nothing else could have.
   *
   * So the register is made to declare the collision and put back. `due` is labelled `state`, and
   * `state is open` must still be the ENUM field — which it is only while the id branch runs first.
   */
  const decl = REGISTERS.obligations!;
  const due = decl.fields.find((f) => f.id === 'due')!;
  const kept = due.label;
  try {
    (due as { label?: string }).label = 'state';
    const w = compile('obligations', 'state is open');
    assert.deepEqual(w.bad, [], 'a label collision made a real field unreadable');
    assert.deepEqual(
      w.clauses.map((c) => c.field),
      ['state'],
      'a label took a predicate away from the field whose id it borrowed',
    );
    /* AND THE LABEL STILL RESOLVES WHERE THERE IS NO ID TO BEAT, or the id-first rule has simply
       switched labels off. The value is read out of the record so the clause is about the field
       rather than about whether a name was typed correctly. */
    const one = ROWS.obligations![0]!;
    const party = display('obligations', 'party', one.fields.party)!;
    const byLabel = compile('obligations', `Party is ${party}`);
    assert.deepEqual(byLabel.bad, [], `the label Party did not reach the field party`);
    assert.deepEqual(byLabel.clauses.map((c) => c.field), ['party']);
  } finally {
    if (kept === undefined) delete (due as { label?: string }).label;
    else (due as { label?: string }).label = kept;
  }
});

test('the prose day is the machine day, to the day', () => {
  for (const [prose, machine] of [
    ['90 days from now', '+90d'],
    ['1 day from now', '+1d'],
    ['7 days ago', '-7d'],
    ['2 weeks from now', '+2w'],
    ['1 week ago', '-1w'],
    ['3 months from now', '+3m'],
    ['6 months ago', '-6m'],
  ] as const) {
    assert.equal(resolveDay(prose, NOW), resolveDay(machine, NOW), `${prose} is not ${machine}`);
  }
});

test('a year is not a day, in either direction', () => {
  /* `spokenDay`'s table dropped `y` and its PATTERN kept it, so `+2y` matched, missed the table and
     fell to `?? 'day'`: "2 years from now" became **"2 days from now"**, which then compiled. It had
     been loudly wrong and became silently wrong, resolving to a date two years out. `34 §1.1`'s
     EBNF is `unit = "d" | "w" | "m"`, so a unit this build does not read passes through untouched
     and is refused by name. */
  assert.equal(saidPlainly('services', 'renews before +2y'), 'renews before +2y');
  assert.equal(resolveDay('+2y', NOW), null);
  assert.equal(resolveDay('2 years from now', NOW), null);
  assert.deepEqual(compile('services', 'renews before +2y').clauses, []);
});

test('and nothing else in English is a day', () => {
  /* IT IS A COMPILER, NOT A PARSER OF ENGLISH. The closed set is exactly what `saidPlainly` emits;
     anything else has to be `null`, or an unrecognised operand goes back to being string-compared,
     which is the bug this whole module was rewritten to kill. */
  for (const word of ['soon', 'next week', 'in 90 days', '90 days', 'days from now', '90 years from now', '1 fortnight ago', '90 days from then'])
    assert.equal(resolveDay(word, NOW), null, `"${word}" resolved to a day`);
});

/* ── the field holds nothing, or it holds something ──────────────────────── */

test('`is empty` AND `is set` ARE SENTENCES, and the record has rows only one of them can find', () => {
  /**
   * THE OPERATOR PAIR THAT WAS PUBLISHED, COMPILED BY THE KERNEL, AND UNSAYABLE HERE.
   *
   * `38 §2.1` lists `empty` and `present` among the nineteen operators and `packages/where`
   * compiles both, in SQL and in memory. This engine had them on `UNIMPLEMENTED`, so
   * `points_at is empty` was refused as *"an operator this build does not read"* while the same
   * question written as JSON was answered. A filter one of the two engines can express and the
   * other cannot is the two-languages failure both files are held against, and it was blocking a
   * real declaration: the estate page carries a warn note headed "Points at nothing" whose gate
   * counts the LAPSING services instead, because the set it means could not be said.
   *
   * THE EMPTY STRING IS THE CASE THAT MATTERS. `34 §6` counts `null`, `''` and `[]` as missing,
   * and the shipped record's services hold `points_at: ''` rather than nothing at all. Reading
   * only `null` would have found none of the rows the question is asked about.
   */
  const nothing = keep('services', 'points at is empty');
  const something = keep('services', 'points at is set');
  const blank = (ROWS.services ?? []).filter((e) => e.fields.points_at === '');

  assert.ok(blank.length > 0, 'the shipped record no longer has a service pointing at nothing');
  assert.deepEqual(nothing.map((e) => e.seq), blank.map((e) => e.seq), 'the empty string was read as a value');
  assert.equal(nothing.length + something.length, all('services'), 'a row was in neither half');
  for (const e of something) assert.ok(String(e.fields.points_at).length > 0);

  /* AND THE NEGATION INVERTS. `is not empty` is `set` and `is not set` is `empty`, which is the one
     thing that must not be got wrong: a negation compiled as its own positive answers the opposite
     of the question and looks like an answer. */
  assert.deepEqual(keep('services', 'points at is not empty').map((e) => e.seq), something.map((e) => e.seq));
  assert.deepEqual(keep('services', 'points at is not set').map((e) => e.seq), nothing.map((e) => e.seq));

  /* `present` IS THE FORMAT'S WORD FOR `set`, and an agent writing from `38 §2.1` writes it. */
  assert.deepEqual(keep('services', 'points at is present').map((e) => e.seq), something.map((e) => e.seq));

  /* AND A MISSING VALUE IS MISSING TOO, which is the `null` of the three: a service on no project. */
  const unattached = keep('services', 'thing is empty');
  assert.ok(unattached.length > 0, 'the shipped record no longer has a service on no project');
  for (const e of unattached) assert.ok(e.fields.thing === null || e.fields.thing === undefined);

  /* AND IT IS AN ORDINARY CLAUSE, so it ANDs on the comma and narrows what is beside it. */
  const live = keep('services', 'state is live, points at is empty');
  assert.ok(live.length > 0 && live.length < nothing.length + 1);
  for (const e of live) assert.equal(e.fields.state, 'live');
});

test('and a text field full of empty strings is the case the sentence could not reach', () => {
  /* `obligations.note` is `''` on most rows and a paragraph on a few, which is exactly the shape a
     person asks about: "which of these has a note". It was `"empty" is not an operator this build
     reads`, while `{field: 'note', empty: true}` was answered by the record. */
  const blank = keep('obligations', 'note is empty');
  const written = keep('obligations', 'note is set');
  assert.ok(blank.length > 0 && written.length > 0, 'the seed no longer has both kinds of note');
  assert.equal(blank.length + written.length, all('obligations'));
  for (const e of written) assert.ok(String(e.fields.note).length > 0);
  for (const e of blank) assert.equal(e.fields.note ?? '', '');
});

test('and the link the surface hands over asks the register the same question', () => {
  /**
   * ONE PREDICATE, TWO PRODUCTS: the rows a surface draws and the address of the rest of them. An
   * absence has no value to put in a chip, so it travels as the sentence that says it,
   * `points_at:is:empty`, which is what the chip parser and `whereOf` already know how to carry.
   * A minted chip operator would have come back through `whereOf`'s fallback as
   * `points_at is true` and opened a list that contradicts the filter it came from.
   */
  const href = registerHref('services', 'points at is empty');
  assert.match(href, /f=points_at:is:empty/);
  assert.match(registerHref('services', 'points at is set'), /f=points_at:is:set/);

  /* THE REGISTER ROUTE'S OWN READING OF THE CHIPS, verbatim, so this is the round trip rather than
     an assertion about a string. */
  const filters = new URL(href, 'https://x').searchParams.getAll('f').map((raw) => {
    const [field = '', op = 'is', values = ''] = raw.split(':');
    return { field, op, values: values.split(',') };
  });
  assert.deepEqual(
    applyFilters('services', ROWS.services ?? [], filters).map((e) => e.seq),
    keep('services', 'points at is empty').map((e) => e.seq),
    'the link opened a different set of rows from the one the surface drew',
  );
});

/* ── an operator belongs to a type ───────────────────────────────────────── */

test('`before` and `after` are about dates, and were accepted on EVERY field type', () => {
  /**
   * THE CLAUSE THAT QUIETLY MATCHES EVERY ROW, REACHED THROUGH THE ONE OPERATOR PAIR THE HEADER
   * DOES NOT LIST.
   *
   * `compile` asked only whether the OPERAND resolved as a day. It never asked what the FIELD was,
   * and `matches` then ran `raw.slice(0, 10) < day` over whatever the column held: a string
   * comparison against a date. `state after today` was `'open' > '2026-09-03'`, true of all
   * thirty-eight obligations; `what after 2026-01-01` was true of all thirty-eight as well, because
   * a letter sorts after a digit. The record refuses both: *"state is a enum, and after is about
   * dates."*
   */
  assert.equal(keep('obligations', 'state after today').length, 0, 'an enum was compared as a date');
  assert.equal(keep('obligations', 'what after 2026-01-01').length, 0, 'text was compared as a date');
  assert.match(compile('obligations', 'state after today').bad[0] ?? '', /state is a enum, and after is about dates/);
  assert.match(compile('obligations', 'what before today').bad[0] ?? '', /what is a text, and before is about dates/);

  /* AND A DATED FIELD IS UNTOUCHED, which is the half that makes the refusal a rule rather than a
     removal. */
  assert.deepEqual(compile('obligations', 'due before today').bad, []);
  assert.deepEqual(compile('services', 'renews after yesterday').bad, []);
});

test('and the rule holds over every field of every register, not just the two probed', () => {
  /* THE SWEEP, because the defect was 1,470 of a differential pass's 3,563 sentences: every
     `before` or `after` over every field in the record that is not a date. One register proves the
     branch; the sweep proves nobody can add a field type back into it. */
  let checked = 0;
  for (const [id, decl] of Object.entries(REGISTERS)) {
    for (const field of decl.fields) {
      const dated = field.type === 'day' || field.type === 'instant';
      for (const op of ['before', 'after'] as const) {
        const w = compile(id, `${field.id} ${op} today`);
        if (dated) {
          assert.deepEqual(w.bad, [], `${id}.${field.id} is a ${field.type} and ${op} was refused`);
          continue;
        }
        assert.ok(w.bad.length, `${id}.${field.id} is a ${field.type} and took ${op}`);
        assert.equal(
          (ROWS[id] ?? []).filter((e) => matches(e, w, NOW)).length,
          0,
          `${id}.${field.id} ${op} today matched rows`,
        );
        checked++;
      }
    }
  }
  assert.ok(checked > 40, `${checked} undated field/operator pairs, which is too few to be the sweep`);
});

/* ── a day that is not a day ─────────────────────────────────────────────── */

test('an ISO SHAPE is not an ISO DAY, and the impossible ones matched every row', () => {
  /* `ISO` is `^\d{4}-\d{2}-\d{2}$`, which says a string looks like a day and nothing about whether
     that day exists. `resolveDay` returned the word unchanged and `matches` compared it as a
     string: every stored date sorts below `9999-99-99`, so `due before 9999-99-99` was 38 of 38,
     and above `0000-00-00`, so `due after 0000-00-00` was 38 of 38 as well. The record refuses all
     of these as `VALUE_MALFORMED`. */
  for (const word of ['9999-99-99', '0000-00-00', '2026-13-45', '2026-02-30', '2026-00-10', '2026-04-31'])
    assert.equal(resolveDay(word, NOW), null, `"${word}" resolved to a day`);

  for (const [register, sentence] of [
    ['obligations', 'due before 9999-99-99'],
    ['obligations', 'due after 0000-00-00'],
    ['obligations', 'due before 2026-13-45'],
    ['services', 'renews before 9999-99-99'],
  ] as const) {
    assert.ok(compile(register, sentence).bad.length, `${sentence} was accepted`);
    assert.equal(keep(register, sentence).length, 0, `${sentence} matched rows`);
  }

  /* AND A REAL DAY STILL PASSES, INCLUDING THE LEAP ONE. A round trip that refuses 29 February in a
     leap year would be a date test that is wrong about dates. */
  assert.equal(resolveDay('2028-02-29', NOW), '2028-02-29');
  assert.equal(resolveDay('2026-12-31', NOW), '2026-12-31');
  assert.deepEqual(compile('obligations', 'due before 2026-10-01').bad, []);
});

/* ── a refusal the record gives is a refusal here ────────────────────────── */

test('a value the field CANNOT HOLD is a refusal, not a silent empty list', () => {
  /**
   * FIVE SENTENCES THE RECORD REFUSES AND THIS FILE ANSWERED.
   *
   * `allowed` closes an `enum` by its values and a `ref` by the titles it points at, and returned
   * `null` for everything else, so on a `day` or a `money` field any word compiled clean, went to
   * `formsOf`, matched nothing, and drew the author's own "nothing matched" sentence, which is the
   * state `blocks.ts` exists to keep apart from a filter that was never understood.
   *
   * `amount is not today` IS THE ONE THAT BITES, and it is the shape this whole file exists to
   * stop: on a field that cannot hold the value at all, `is not <anything>` excludes no row and
   * hands back the entire register looking like an answer. It was 38 of 38.
   */
  for (const [sentence, says] of [
    ['due is banana', /banana is not a value due can hold/],
    ['due before 2026-02-30', /2026-02-30 is not a date/],
    ['amount is 480000', /amount is money, so this comparison needs a currency/],
    ['what is not', /is not what\?/],
    ['amount is not today', /amount is money, so this comparison needs a currency/],
  ] as const) {
    const w = compile('obligations', sentence);
    assert.ok(w.bad.length, `${sentence} was accepted, and the record refuses it`);
    assert.match(w.bad[0] ?? '', says);
    assert.equal(keep('obligations', sentence).length, 0, `${sentence} matched rows`);
  }
});

test('and the widenings that were built against a measured failure are still there', () => {
  /* A REFUSAL THAT TAKES THE WORKING SENTENCES WITH IT IS NOT A FIX. Each of these compiles clean
     and selects rows, and each was checked against the branch it goes through: a declared enum
     value, a ref by the name a person reads, a ref by the number a URL carries, a money value the
     way `display()` writes it, a relative day, and the prose day every declared page prints. */
  for (const [register, sentence] of [
    ['obligations', 'direction is owed to me'],
    ['obligations', 'thing is Kiln'],
    ['obligations', 'thing is 1'],
    ['obligations', 'amount is GBP 960.00'],
    ['obligations', 'due is not -38d'],
    ['services', 'renews before 90 days from now'],
  ] as const)
    assert.deepEqual(compile(register, sentence).bad, [], `${sentence} was refused`);

  /* An operator in the value slot is still named as an operator rather than reported as a value the
     field cannot hold, on a money field as much as on a text one. */
  assert.match(compile('obligations', 'amount is at least 10000').bad[0] ?? '', /"at least" is not an operator/);
});

test('A LABELLED VALUE IS FOUND BY ITS LABEL, as the record finds it, and by its id and words as before', () => {
  const byLabel = keep('obligations', 'direction is money in').length;
  const byWords = keep('obligations', 'direction is owed to me').length;
  assert.deepEqual(compile('obligations', 'direction is money in').bad, []);
  assert.ok(byLabel > 0);
  assert.equal(byLabel, byWords);
});

/* ── the two engines over one grammar ────────────────────────────────────── */

/**
 * `has` AND `lacks`, ASKED OF BOTH ENGINES OVER THE SAME ROWS.
 *
 * `21-AUTHORING` §4.2 publishes eleven operators; this file's compiler read four of them, so
 * `repos has portage` came back from the browser as *"that is not something a filter can say"* while
 * the record beside it answered `rows [3]`. A sentence one rendering of a grammar takes and the
 * other refuses is two languages, which is the failure the whole module is written against — and no
 * assertion this file could make against itself would have seen it, because the mirror agreed with
 * the mirror.
 *
 * SO THE RECORD IS DRIVEN, NOT DESCRIBED. A real SQLite record is opened, the same seed installed
 * into it, and every sentence below goes to `k.list` and to `compile`/`matches`, and the two answers
 * are compared. `data.ts` numbers `SEED_ROWS` by position and `installSeed` writes the same array in
 * the same order, so `seq` is the same number on both sides; measured over all nineteen registers
 * before this was written, every register's unfiltered set of `seq` is identical, which is what makes
 * a set comparison mean anything at all.
 */
function openSqlite(): Parameters<typeof openRecord>[0] {
  const db = new DatabaseSync(':memory:');
  let depth = 0;
  const sql = {
    exec: (text: string, ...params: unknown[]) => {
      if (params.length === 0) db.exec(text);
      else db.prepare(text).run(...(params as never[]));
    },
    all: (text: string, ...params: unknown[]) => db.prepare(text).all(...(params as never[])),
    one: (text: string, ...params: unknown[]) => db.prepare(text).get(...(params as never[])),
    transactionSync<T>(fn: () => T): T {
      if (depth > 0) return fn();
      db.exec('BEGIN');
      depth++;
      try {
        const value = fn();
        db.exec('COMMIT');
        return value;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      } finally {
        depth--;
      }
    },
  };
  return sql as unknown as Parameters<typeof openRecord>[0];
}

const record = (async () => {
  const k = await openRecord(openSqlite(), { now: () => NOW });
  const out = await installSeed(k);
  assert.ok(out.ok, JSON.stringify(out));
  return k;
})();

/** One engine's answer: the refusal it gave, or the `seq` of every row it admitted. */
type Answer = { refused: string | null; seqs: number[] };

const askIn = async (k: Kernel, register: string, sentence: string): Promise<Answer> => {
  /* 500 IS THE CEILING `list` CLAMPS TO, and its default is 50: a page of the answer held against
     the whole of the browser's would read as a disagreement about the predicate. */
  const out = k.list({ register, where: sentence, limit: 500 });
  /* A `Result` CARRIES A REFUSAL OR A CONFLICT, and only one of the two is a fact about a filter. A
     read cannot produce a conflict, so this names the shape rather than reaching for a key that may
     not be there: `out.refusal.fix` on the other arm does not typecheck, and coercing it would hide
     the day a read grows a second way of saying no. */
  if (!out.ok) return { refused: 'refusal' in out ? out.refusal.fix : 'the record answered with a conflict, which a read cannot', seqs: [] };
  /* `Entry.seq` IS `number | null` IN THE KERNEL'S TYPE, and a row without one cannot be held against
     the browser's mirror at all — `data.ts` numbers the seed by position, so `seq` IS the identity
     here. Every seeded row has one, which is asserted rather than coerced: a `?? 0` would compare a
     row against nothing and pass. */
  const seqs = out.value.rows.map((r) => r.seq).filter((n): n is number => n !== null);
  assert.equal(seqs.length, out.value.rows.length, `${register}: a row came back with no seq, so it cannot be compared`);
  return { refused: null, seqs: seqs.sort((a, b) => a - b) };
};

/** The same question of the seeded record, which is what almost every sentence here is asked of. */
const askRecord = async (register: string, sentence: string): Promise<Answer> => askIn(await record, register, sentence);

const askBrowser = (register: string, sentence: string): Answer => {
  const w = compile(register, sentence);
  return w.bad.length
    ? { refused: w.bad[0] ?? '', seqs: [] }
    : { refused: null, seqs: (ROWS[register] ?? []).filter((e) => matches(e, w, NOW)).map((e) => e.seq).sort((a, b) => a - b) };
};

/** Both engines asked one sentence, and held to the same answer. */
async function agree(register: string, sentence: string): Promise<Answer> {
  const theirs = await askRecord(register, sentence);
  const ours = askBrowser(register, sentence);
  assert.equal(
    ours.refused === null,
    theirs.refused === null,
    `${register}: "${sentence}" — the record ${theirs.refused === null ? 'answered' : `refused: ${theirs.refused}`}, the browser ${ours.refused === null ? 'answered' : `refused: ${ours.refused}`}`,
  );
  assert.deepEqual(ours.seqs, theirs.seqs, `${register}: "${sentence}" drew different rows`);
  return theirs;
}

/**
 * Every list field in the mirror, with the values its rows really hold.
 *
 * A `list<ref>` IS PROBED BY THE TITLE AND NEVER BY THE NUMBER. The browser holds a ref as the
 * target's `seq` and the record holds it as a ULID, so the elements themselves are not comparable;
 * what both engines take is the row's TITLE, which is `thing is Kiln`'s argument one type along.
 * Measured: the record answers `because has 4` with *"there is no learnings called 4"*.
 */
function listProbes(): { register: string; field: string; held: string[]; miss: string }[] {
  const out: { register: string; field: string; held: string[]; miss: string }[] = [];
  const titleOf = (register: string, seq: unknown): string | null => {
    const title = REGISTERS[register]?.title ?? '';
    const row = (ROWS[register] ?? []).find((e) => e.seq === Number(seq));
    const said = row?.fields[title];
    return typeof said === 'string' ? said : null;
  };
  for (const [register, decl] of Object.entries(REGISTERS)) {
    for (const f of decl.fields) {
      if (f.type !== 'list') continue;
      const seen = new Set<string>();
      for (const row of ROWS[register] ?? []) {
        const value = row.fields[f.id];
        if (!Array.isArray(value)) continue;
        for (const one of value) {
          const said = f.of === 'ref' && f.to ? titleOf(f.to, one) : one;
          /* A COMMA IS THE CLAUSE SEPARATOR IN BOTH ENGINES, so a value holding one is not a probe of
             this operator: both would split it and both would refuse, which proves nothing. */
          if (typeof said !== 'string' || said.includes(',')) continue;
          seen.add(said);
        }
      }
      /**
       * AND THE VALUE NOTHING HOLDS HAS TO BE ONE THE FIELD COULD HOLD.
       *
       * On a `list<ref>` an invented word is not a miss, it is a REFUSAL — the record answers
       * `projects has a value no row holds` with *"there is no things called …"* — so a sweep that
       * fed one in would be asking the same question as the refusal sweep below and would never test
       * the operator that resolves and finds nothing. The miss on a ref is a real title of the
       * register it points at, which is exactly the shape somebody types and gets no rows for.
       */
      const miss =
        f.of === 'ref' && f.to
          ? ((ROWS[f.to] ?? []).map((e) => titleOf(f.to!, e.seq)).find((t) => t !== null && !t.includes(',') && !seen.has(t)) ?? 'a value no row of this register holds')
          : 'a value no row of this register holds';
      out.push({ register, field: f.id, held: [...seen], miss });
    }
  }
  return out;
}

test('`has` and `lacks` reach every list field in the mirror, and both engines admit the same rows', async () => {
  const probes = listProbes();
  assert.ok(probes.length >= 11, `${probes.length} list fields, which is fewer than the mirror declares`);
  let asked = 0;
  for (const { register, field, held, miss } of probes) {
    /* A VALUE NOTHING HOLDS IS PART OF THE SWEEP, because a filter that matched nothing and a filter
       that was not understood look identical on a screen and are opposite facts about a page. */
    for (const value of [...held.slice(0, 3), miss]) {
      const has = await agree(register, `${field} has ${value}`);
      const lacks = await agree(register, `${field} lacks ${value}`);
      /* `has not` IS `lacks`, IN BOTH ENGINES. A negation compiled as its own positive is the one
         defect this grammar keeps being bitten by. */
      const hasNot = await agree(register, `${field} has not ${value}`);
      assert.deepEqual(hasNot.seqs, lacks.seqs, `${register}.${field}: "has not" and "lacks" parted company`);
      /* AND THE TWO PARTITION THE REGISTER, whenever the value resolved at all: every row either holds
         it or does not, so a pair that leaves a row out of both, or puts one in both, is a comparison
         that answered a third thing. A refused sentence has no rows on either side and is not one. */
      if (has.refused === null)
        assert.deepEqual(
          [...has.seqs, ...lacks.seqs].sort((a, b) => a - b),
          (ROWS[register] ?? []).map((e) => e.seq).sort((a, b) => a - b),
          `${register}.${field}: has and lacks do not partition the register`,
        );
      asked += 3;
    }
  }
  /* NINETY-NINE, MEASURED: eleven list fields, up to three values each that a row really holds plus
     one it does not, and three sentences per value. The floor is named so that a field quietly losing
     its values is a red test rather than a shorter sweep nobody reads the tally of. */
  assert.ok(asked >= 99, `${asked} sentences, which is fewer than the sweep drove when it was written`);
});

test('a value one row holds is a value that FINDS it, rather than a clause that matches nothing', async () => {
  /* THE SWEEP ABOVE WOULD PASS ON TWO ENGINES THAT BOTH ANSWERED NOTHING, which is the shared
     mistake a differential pass cannot see. These are rows the seed really holds. */
  assert.deepEqual((await agree('things', 'repos has portage')).seqs, [3]);
  /**
   * AND THE ROW THAT HOLDS TWO, which is the case the `is` branch used to get wrong while getting the
   * line above right. `formsOf` reads a list through `String()` and through `display()`, and a list of
   * ONE stringifies to exactly its element: measured over these four rows, `repos is portage` matched
   * row 3 and `repos is git.kiln.example/type/kiln-type` matched nothing at all, because row 1's stored
   * form was both of its repositories in one string. `has` asks the elements, so the arity of the row
   * stops being part of the answer.
   */
  assert.deepEqual((await agree('things', 'repos has git.kiln.example/type/kiln-type')).seqs, [1]);
  assert.deepEqual((await agree('tools', 'hosts has kiln-mbp')).seqs, [1, 3, 5]);
  assert.deepEqual((await agree('people', 'handles has git:jokonkwo')).seqs, [3]);
  /* A `list<ref>` BY THE NAME A PERSON READS, which is the one element type that is not the word in
     the column: the browser holds `1` there and the record holds a ULID, and both take the title. */
  assert.deepEqual((await agree('skills', 'because has Run the mastering pass before signing off an axis instance.')).seqs, [2]);
  /* AND THE FIELD BY THE LABEL THE SCREEN SHOWS, which is what a declared page prints its filter as. */
  assert.deepEqual((await agree('things', 'Repositories has portage')).seqs, [3]);
  /* CASE-SENSITIVELY, which is what the record does: `json_each.value = ?` is not `NOCASE`, and its
     evaluator compares with `===`. Measured: the record answers `repos has Portage` with no rows. */
  assert.deepEqual((await agree('things', 'repos has Portage')).seqs, []);
});

test('AN OPERATOR BELONGS TO A TYPE, and a list takes neither `is` nor `before`', async () => {
  /**
   * `operatorAllowed` IS ONE RELATION IN THE RECORD AND IT CANNOT BE IMPORTED HERE: `@braindog/where`
   * is not a dependency of this app and `@braindog/kernel` does not re-export it. So the relation is
   * held by driving it rather than by copying it — `is`, `is not`, `in` and `not_in` refused on a
   * `list`, `has` and `lacks` refused on every other type, in both engines, over every field of every
   * register.
   */
  let refused = 0;
  for (const [register, decl] of Object.entries(REGISTERS)) {
    for (const f of decl.fields) {
      const answer = await agree(register, `${f.id} has something`);
      if (f.type !== 'list') {
        assert.ok(answer.refused, `${register}.${f.id} is a ${f.type} and took has`);
        refused++;
        continue;
      }
      /* AND THE FOUR A LIST REFUSES. One value is `is`, several is `in`, and each has its negation:
         the record names the structured operator it refused, so the browser names the same one. */
      for (const sentence of [`${f.id} is x`, `${f.id} is not x`, `${f.id} is x or y`, `${f.id} is not x or y`, `${f.id} before today`]) {
        assert.ok((await agree(register, sentence)).refused, `${register}: "${sentence}" was accepted on a list`);
        refused++;
      }
      /* `is empty` AND `is set` ARE THE EXCEPTION, and they are why the refusal above cannot simply
         be "a list takes no `is`": `34 §1.2` admits absence on every type there is. */
      assert.equal((await agree(register, `${f.id} is set`)).refused, null);
      assert.equal((await agree(register, `${f.id} is empty`)).refused, null);
    }
  }
  assert.ok(refused > 100, `${refused} refusals, which is too few to be the sweep`);
});

test('and the refusals say the same thing, because a refusal is the teacher', async () => {
  /* `10 §7`'s fourth rule: an agent handed an empty block learns nothing, and an agent told what is
     wrong fixes it on the next call. Each sentence below is read off the record here. */
  for (const [register, sentence, says] of [
    ['obligations', 'state has open', /state is a enum, and has is about lists/],
    ['obligations', 'due has today', /due is a day, and has is about lists/],
    ['things', 'repos is portage', /repos is a list, which cannot be asked "is"/],
    ['things', 'repos is not portage', /repos is a list, which cannot be asked "not"/],
    ['things', 'repos is a or b', /repos is a list, which cannot be asked "in"/],
    ['things', 'repos is not a or b', /repos is a list, which cannot be asked "not_in"/],
    ['things', 'repos has a or b', /has takes one value to look for in the list/],
    ['things', 'repos has', /has what\?/],
    ['things', 'repos has not', /has not what\?/],
    ['skills', 'because has Kiln', /there is no learnings called Kiln/],
  ] as const) {
    const ours = askBrowser(register, sentence);
    const theirs = await askRecord(register, sentence);
    assert.ok(theirs.refused, `the record answered "${sentence}", so this row asserts the wrong fact`);
    assert.match(theirs.refused ?? '', says, `the record no longer says this about "${sentence}"`);
    assert.match(ours.refused ?? '', says, `the browser's refusal for "${sentence}"`);
  }

  /* AND THE SENTENCE THAT NAMES THE OPERATORS NAMES ALL SIX NOW. It named four while the record named
     six, which is a refusal teaching an agent that two of the operators it has just read in the
     published grammar do not exist. */
  assert.match(compile('services', 'nonsense here').bad[0] ?? '', /Write is, is not, before, after, has or lacks/);
});

test('an operand that is not there is a question back, on every operator that takes one', async () => {
  /* MEASURED BEFORE IT WAS CHANGED: the browser answered "that is not something a filter can say" to
     all four of these, because `CLAUSE` demanded at least one character after the operator, and the
     record answers with the one thing that is missing. */
  for (const [register, sentence, says] of [
    ['obligations', 'state is', /is what\?/],
    ['obligations', 'due before', /\(nothing\) is not a date/],
    ['things', 'repos has', /has what\?/],
    ['things', 'repos lacks not', /lacks not what\?/],
  ] as const) {
    assert.match(askBrowser(register, sentence).refused ?? '', says, `the browser's refusal for "${sentence}"`);
    assert.ok((await askRecord(register, sentence)).refused, `the record answered "${sentence}"`);
  }
});

test('a list filter hands over the honest wide address, because no chip can carry it yet', () => {
  /**
   * ONE PREDICATE, TWO PRODUCTS, AND THE SECOND CANNOT BE WRITTEN YET. A chip is
   * `<field>:<op>:<values>`, and `whereOf` in `api.ts` reads four operators back out of one — `in`,
   * `not-in`, `before`, `after` — with everything else falling through to `<field> is <value>`. So a
   * minted `repos:has:portage` would come back as `repos is portage`, which the record and this
   * compiler now both REFUSE, and the link would open an empty grid under a filter that drew three
   * rows. `registerHref`'s own paragraph is the rule: dropping the clause it cannot carry produces a
   * list that looks narrowed and is not, so the whole register is the honest address until `whereOf`
   * learns the operator.
   */
  assert.equal(registerHref('things', 'repos has portage'), '/r/things');
  assert.equal(registerHref('things', 'lane is earning, repos has portage'), '/r/things');
  /* AND THE HALF THAT CAN BE CARRIED IS STILL CARRIED, when nothing in the sentence is a list. */
  assert.match(registerHref('things', 'lane is earning'), /f=lane:in:earning/);
});

test('and the printer says the clause back in words the record still reads', () => {
  /**
   * A PARSER WIDER THAN ITS PRINTER IS THE SAME DEFECT AS A PRINTER WIDER THAN ITS PARSER.
   *
   * `saidPlainly` read four operators because this compiler did, so a block filtered on `repos has
   * portage` printed the schema's own field id under a column headed Repositories. It prints the label
   * now — and the round trip is the assertion, not the string: what a page prints is what somebody
   * types back and what an agent copies, so it has to compile.
   */
  const printed = saidPlainly('things', 'repos has portage');
  assert.equal(printed, 'repositories has portage');
  assert.deepEqual(compile('things', printed).bad, [], `the printed filter does not compile: ${printed}`);
  assert.deepEqual(keep('things', printed).map((e) => e.seq), keep('things', 'repos has portage').map((e) => e.seq));

  /**
   * AND AN UNDERSCORE IN A LIST'S VALUE SURVIVES, which the enum swap beside it would have eaten.
   * `tools.needs` holds `BRAINDOG_TOKEN`; measured against the record, `needs has BRAINDOG_TOKEN`
   * answers `rows [1]` and `needs has BRAINDOG TOKEN` answers nothing, so printing the second under a
   * block drawing the first is a sentence a reader cannot act on.
   */
  const keys = saidPlainly('tools', 'needs has BRAINDOG_TOKEN');
  assert.equal(keys, 'keys it needs has BRAINDOG_TOKEN');
  assert.deepEqual(keep('tools', keys).map((e) => e.seq), [1]);
});

test('and a SHOUTED operator is the same operator in the printer as it is in the parser', () => {
  /**
   * ONE SENTENCE, TWO READINGS, AND THE PRINTER'S DREW NO ROWS.
   *
   * `compile` folds the operator once, `op = said.toLowerCase()`, and has done since `STATE IS NOT
   * Live` compiled to its own opposite. So `needs HAS BRAINDOG_TOKEN` is a sentence this build reads
   * and it draws row 1. `saidPlainly` tested the UNFOLDED word, so the shouted spelling missed the
   * list branch and fell to the enum swap beside it: measured, it printed `keys it needs HAS BRAINDOG
   * TOKEN`, which compiles clean, refuses nothing and draws NO rows, under a block that drew one.
   * What a page prints is what somebody types back, so a print that quietly narrows to nothing is
   * the one thing this printer must not do, and it is the same argument the underscore above makes
   * one spelling along.
   */
  const shouted = saidPlainly('tools', 'needs HAS BRAINDOG_TOKEN');
  assert.deepEqual(compile('tools', shouted).bad, [], `the printed filter does not compile: ${shouted}`);
  assert.deepEqual(
    keep('tools', shouted).map((e) => e.seq),
    keep('tools', 'needs HAS BRAINDOG_TOKEN').map((e) => e.seq),
    `the shouted sentence and its printed form drew different rows: ${shouted}`,
  );

  /* AND THE FOLD IS THE FIX FOR THE PAIR BESIDE IT AS WELL, which was wrong before `has` arrived:
     `before` and `after` were read unfolded on the same line, so `due BEFORE +30d` printed the
     relative word a person typed where `due before +30d` printed the days it means. */
  assert.equal(saidPlainly('obligations', 'due BEFORE +30d'), saidPlainly('obligations', 'due before +30d'));
});

/**
 * A LIST OF EVERY ELEMENT TYPE, DECLARED INTO BOTH ENGINES, because the seed has only two.
 *
 * All eleven list fields the sample mirrors are `list<text>` or `list<ref>`, so the sweeps above leave
 * the enum, the integer, the day, the boolean and the money element untouched — and a live record can
 * send every one of them: `lib/data/record.ts` installs a real register's declaration straight into
 * `REGISTERS` when it meets one, and `schema.ts`'s own header names `list<int>` and `list<day>` as
 * shapes the record has had since it was written. Asserting those branches against the mirror alone
 * would be the mirror agreeing with the mirror, which is the whole thing this section exists not to
 * do, so the register is DECLARED INTO THE RECORD as well and the same sentences are put to both.
 *
 * `prices` IS A `list<money>` AND IS HERE TO BE REFUSED. A money is `{ amount, currency }` and this
 * grammar has no literal for one; without the refusal the record compiled `prices has GBP 10.00` to
 * real SQL comparing those characters against an object, matching nothing, for ever.
 */
const TODAY = new Date(NOW).toISOString().slice(0, 10);

const ELEMENTS = {
  id: 'zz_lists',
  name: 'Element types',
  one: 'Row',
  title: 'name',
  mobile: ['name', 'name', 'name'] as const,
  fields: [
    { id: 'name', type: 'text', required: true },
    /* `Derailed` RATHER THAN `off track`, WHICH IS A LABEL THAT PROVES NOTHING. The words path already
       turns `off_track` into `off track`, so a label spelt that way passes whether the label is read
       or not: measured, deleting the label lookup from `elementValue` left every assertion here green.
       A label a reader could not have guessed from the id is the only one that tests the branch. */
    { id: 'moods', type: 'list', of: 'enum', values: ['off_track', 'on_track'], labels: { off_track: 'Derailed' } },
    { id: 'counts', type: 'list', of: 'int' },
    /* AND A DECIMAL, WHOSE ROUND TRIP IS THE WHOLE OF IT: the record resolves `3.50` to the number
       `3.5` and the column holds `3.5`, so a branch that handed the typed characters back would
       compare `3.50` against `3.5` and find nothing. Deleting that branch also left this file green
       until this field was here. */
    { id: 'rates', type: 'list', of: 'decimal' },
    { id: 'days', type: 'list', of: 'day' },
    { id: 'flags', type: 'list', of: 'bool' },
    { id: 'prices', type: 'list', of: 'money' },
  ],
} as const;

/** The three rows, written into the record in this order so `seq` is 1, 2, 3 on both sides. */
const ELEMENT_ROWS: Fields[] = [
  { name: 'one', moods: ['off_track'], counts: [3], rates: [3.5], days: [TODAY], flags: [true] },
  { name: 'two', moods: ['on_track'], counts: [4, 5], rates: [0.25], days: ['2026-01-01'], flags: [false] },
  { name: 'three' },
];

test('every element type a list can hold resolves the same way in both engines', async () => {
  /* A SECOND RECORD, so the shared one above keeps the registers the sweeps counted. Nothing is
     seeded into it: this register is the whole subject. */
  const k = await openRecord(openSqlite(), { now: () => NOW });
  const declared = await k.install([{ id: 'register.zz_lists', kind: 'register', body: ELEMENTS } as never]);
  assert.ok(declared.ok, JSON.stringify(declared));
  for (const fields of ELEMENT_ROWS) {
    const made = k.create('zz_lists', fields as never, { actor: 'p_test' });
    assert.ok(made.ok, JSON.stringify(made));
  }

  /* AND THE SAME DECLARATION IN THE BROWSER'S MIRROR, which is what `record.ts` does when a live
     record answers `schema`. It is put back in `finally` so a failing assertion cannot leave a
     register behind for whatever test runs next. */
  REGISTERS.zz_lists = ELEMENTS as unknown as (typeof REGISTERS)[string];
  ROWS.zz_lists = ELEMENT_ROWS.map((fields, i) => ({ seq: i + 1, fields, version: 1, created: '2026-01-01T00:00:00Z', by: 'p_test' }));
  try {
    for (const [sentence, seqs] of [
      /* AN ENUM ELEMENT BY ITS DECLARED VALUE, BY THE WORDS, AND BY ITS LABEL — the three spellings the
         scalar `is` already takes, which is what keeps `has` from being a second language. */
      ['moods has off_track', [1]],
      ['moods has off track', [1]],
      ['moods has Derailed', [1]],
      ['moods lacks Derailed', [2, 3]],
      ['moods has on_track', [2]],
      ['moods lacks off_track', [2, 3]],
      /* A DECIMAL BY THE SPELLING A PERSON WRITES rather than the one the column holds: the record
         resolves `3.50` to `3.5` and so does this, which is what makes the two answers comparable. */
      ['rates has 3.50', [1]],
      ['rates has 3.5', [1]],
      ['rates has .25', [2]],
      /* AN INTEGER IS A NUMBER IN THE COLUMN AND A WORD IN THE SENTENCE. `counts has 4` has to find the
         row holding `[4, 5]`, which a string compared against a JSON number never would. */
      ['counts has 3', [1]],
      ['counts has 4', [2]],
      ['counts has 5', [2]],
      /* A DAY RESOLVED AGAINST THE CLOCK, which is the operand check `before` has always had and the
         value branch of `is` only got later. */
      ['days has today', [1]],
      [`days has ${TODAY}`, [1]],
      ['days has 2026-01-01', [2]],
      /* A BOOLEAN ELEMENT IS A BOOLEAN. The column holds `true` and a person writes `yes`. */
      ['flags has yes', [1]],
      ['flags has true', [1]],
      ['flags has no', [2]],
      ['flags lacks yes', [2, 3]],
    ] as const) {
      const theirs = await askIn(k, 'zz_lists', sentence);
      const ours = askBrowser('zz_lists', sentence);
      assert.equal(theirs.refused, null, `the record refused "${sentence}": ${theirs.refused}`);
      assert.deepEqual(theirs.seqs, [...seqs], `the record's own answer to "${sentence}" is not what this asserts`);
      assert.deepEqual(ours.seqs, theirs.seqs, `"${sentence}" drew different rows`);
    }

    /* AND THE VALUES NO ELEMENT TYPE CAN MEAN, each with the sentence that names which kind of wrong
       it is: a declared set, a shape, or a value that has no literal at all. */
    for (const [sentence, says] of [
      ['moods has nope', /moods has no value nope/],
      ['counts has 3px', /3px is not a value counts can hold/],
      ['days has banana', /banana is not a value days can hold/],
      ['flags has maybe', /maybe is not a value flags can hold/],
      ['prices has GBP 10.00', /prices is a list of money, and this grammar has no way to write one/],
    ] as const) {
      const theirs = await askIn(k, 'zz_lists', sentence);
      assert.match(theirs.refused ?? '', says, `the record no longer says this about "${sentence}"`);
      assert.match(askBrowser('zz_lists', sentence).refused ?? '', says, `the browser's refusal for "${sentence}"`);
    }
  } finally {
    delete REGISTERS.zz_lists;
    delete ROWS.zz_lists;
  }
});
