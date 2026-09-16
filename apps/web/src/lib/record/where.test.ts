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

import { applyFilters, display, labelOf } from './api.ts';
import { saidPlainly } from './blocks.ts';
import { NOW, PAGES, REGISTERS, ROWS, VIEWS } from './data.ts';
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

test('an unparseable clause says which four operators exist, in the words to type', () => {
  /* THE SENTENCE IS THE KERNEL'S, BYTE FOR BYTE (`packages/where/src/sentence.ts`). It used to be
     `This build reads: is · is not · before · after` — middle dots a person cannot type, and the
     software describing itself. */
  const said = compile('obligations', 'what contains invoice').bad[0] ?? '';
  assert.match(said, /Write is, is not, before or after\./);
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
  const days = ['today', 'tomorrow', 'yesterday', 'bom', 'eom', 'boy', 'eoy', '+30d', '-7d', '+2w', '+1m'];
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

/** Whether it actually asserted anything — see the count at the call site. */
const roundTrips = (register: string, where: string, from: string): boolean => {
  /* A TEMPLATE'S `{{field}}` IS NOT A FILTER YET. `for:` expands it per row before anything draws.
     Most do not compile unexpanded, but `project is {{spoken}}` does, as a literal on a text field,
     so it is the placeholder that is checked and not whether it happens to compile. */
  if (/\{\{\w+\}\}/.test(where)) return false;
  const first = compile(register, where);
  if (first.bad.length) return false;
  const said = saidPlainly(register, where);
  const back = compile(register, said);
  assert.deepEqual(back.bad, [], `${from}: the record refuses its own sentence — "${said}"`);
  assert.equal(
    rowsFor(register, said),
    rowsFor(register, where),
    `${from}: "${where}" and the "${said}" it prints select different rows`,
  );
  return true;
};

test('every filter a declared page prints is one the record reads back', () => {
  /* THE COUNT IS OF ASSERTIONS, NOT OF BLOCKS. It incremented once per block whether or not
     `roundTrips` asserted anything — and `roundTrips` returns early on a filter that does not
     compile, which four of the twelve do because they are templates holding `{{name}}`. So the
     floor of eight was satisfied by twelve blocks of which only eight were tested, and making every
     filter in the seed refuse to compile left this green. `roundTrips` reports what it did. */
  let checked = 0;
  for (const [slug, page] of Object.entries(PAGES)) {
    for (const block of page.blocks ?? []) {
      const source = String(block.source ?? '');
      if (!block.where || !source.startsWith('register.')) continue;
      if (roundTrips(source.slice('register.'.length), block.where, `/p/${slug}`)) checked++;
    }
  }
  assert.equal(checked, 11, `${checked} declared page filters round-tripped; eleven compile today, Home's own among them`);
});

test('and every filter a saved view prints', () => {
  for (const [id, view] of Object.entries(VIEWS)) {
    const where = view.filters
      .map((f) => `${f.field} ${f.op === 'in' ? 'is' : f.op} ${f.values.join(' or ')}`)
      .join(', ');
    if (where) roundTrips(view.register, where, `/v/${id}`);
  }
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
