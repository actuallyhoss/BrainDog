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

import { labelOf } from './api.ts';
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
  for (const [text, word] of [
    ['amount is at least 10000', 'at least'],
    ['note is empty', 'empty'],
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

const roundTrips = (register: string, where: string, from: string) => {
  const first = compile(register, where);
  /* A TEMPLATE'S `{{name}}` IS NOT A FILTER YET. `for:` expands it per row before anything draws;
     until then it does not compile on either side of the trip, which is a different finding. */
  if (first.bad.length) return;
  const said = saidPlainly(register, where);
  const back = compile(register, said);
  assert.deepEqual(back.bad, [], `${from}: the record refuses its own sentence — "${said}"`);
  assert.equal(
    rowsFor(register, said),
    rowsFor(register, where),
    `${from}: "${where}" and the "${said}" it prints select different rows`,
  );
};

test('every filter a declared page prints is one the record reads back', () => {
  let checked = 0;
  for (const [slug, page] of Object.entries(PAGES)) {
    for (const block of page.blocks ?? []) {
      const source = String(block.source ?? '');
      if (!block.where || !source.startsWith('register.')) continue;
      roundTrips(source.slice('register.'.length), block.where, `/p/${slug}`);
      checked++;
    }
  }
  assert.ok(checked >= 8, `only ${checked} declared page filters were reachable to check`);
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
  /* A register is free to label one field with another's id. If the label branch ran first, a
     predicate naming a real field would silently be compiled against a different column. */
  const decl = REGISTERS.obligations!;
  const ids = new Set(decl.fields.map((f) => f.id));
  for (const field of decl.fields) {
    const label = labelOf(field).toLowerCase();
    if (!ids.has(label) || label === field.id) continue;
    assert.equal(compile('obligations', `${label} is x`).register, 'obligations');
  }
  /* And the plain statement of it, which holds whatever the seed happens to declare. */
  assert.deepEqual(compile('obligations', 'state is open').bad, []);
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

test('and nothing else in English is a day', () => {
  /* IT IS A COMPILER, NOT A PARSER OF ENGLISH. The closed set is exactly what `saidPlainly` emits;
     anything else has to be `null`, or an unrecognised operand goes back to being string-compared,
     which is the bug this whole module was rewritten to kill. */
  for (const word of ['soon', 'next week', 'in 90 days', '90 days', 'days from now', '90 years from now', '1 fortnight ago', '90 days from then'])
    assert.equal(resolveDay(word, NOW), null, `"${word}" resolved to a day`);
});
