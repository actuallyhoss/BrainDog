/**
 * `where.ts`: the record's sentence, read by the record's own parser, and printed back as an address.
 *
 * WHAT THIS FILE USED TO HOLD AND WHY MOST OF IT WENT. It held the browser's second compiler and its matcher to the
 * record, sentence by sentence and row by row, because two engines read one grammar. `compile` is `parseWhere` now and
 * the matcher is deleted with the browser's engine, so the cases that
 * counted rows through `matches` went with it, and so did the differential against a real kernel, which would have
 * compared the record's parser with itself. What a sentence means is `packages/where`'s to test, and is tested there.
 *
 * WHAT IS LEFT IS WHAT THE BROWSER STILL DOES WITH THE PARSE: turn it into the clauses its readers take, keep the words
 * a day was said in, refuse in the record's words, and print the address of the rows a surface drew.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { chipsOf, display, labelOf, whereOf } from './api.ts';
import { saidPlainly } from './blocks.ts';
import { NOW } from './fixtures/sample.ts';
import { REGISTERS, ROWS } from './held.ts';
import { compile, explain, registerHref, resolveDay } from './where.ts';
/* THE SAMPLE'S DECLARATIONS AND ROW NAMES, which a live tab learns from the record. */
import './fixtures/fill.ts';

/* ── a refusal is a refusal ──────────────────────────────────────────────── */

test('a filter it cannot read is refused, never read as everything', () => {
  const w = compile('services', 'this is not a filter at all');
  assert.equal(w.clauses.length, 0);
  assert.ok(w.bad.length, 'an unreadable filter was accepted');
  assert.ok(!/predicate/.test(w.bad[0] ?? ''), 'the schema is talking about itself in a refusal');
});

test('one bad clause poisons the whole predicate rather than being skipped', () => {
  // Half a filter is more dangerous than none: the block looks filtered and is not.
  const w = compile('services', 'state is live, wat');
  assert.ok(w.bad.length);
  assert.deepEqual(w.clauses, []);
});

test('an empty predicate says nothing, which is the one safe pass-through', () => {
  assert.deepEqual(compile('services', ''), { register: 'services', clauses: [], bad: [] });
  assert.deepEqual(compile('services', undefined), { register: 'services', clauses: [], bad: [] });
});

/* ── the grammar, as the clauses its readers take ────────────────────────── */

test('one value, several values, a conjunction and a negation', () => {
  assert.deepEqual(compile('services', 'state is live').clauses, [{ field: 'state', op: 'is', values: ['live'] }]);
  assert.deepEqual(compile('services', 'state is live or lapsing').clauses, [{ field: 'state', op: 'is', values: ['live', 'lapsing'] }]);
  assert.deepEqual(compile('services', 'state is live, cycle is monthly').clauses, [
    { field: 'state', op: 'is', values: ['live'] },
    { field: 'cycle', op: 'is', values: ['monthly'] },
  ]);
  assert.deepEqual(compile('services', 'state is not live').clauses, [{ field: 'state', op: 'is not', values: ['live'] }]);
});

test('whitespace and case are not part of the grammar', () => {
  assert.deepEqual(compile('services', '  STATE   IS   Live  ').clauses, compile('services', 'state is live').clauses);
});

test('an enum is read in the words a reader sees, and stored as the value it declares', () => {
  const said = compile('obligations', 'direction is owed to me');
  assert.deepEqual(said.clauses, [{ field: 'direction', op: 'is', values: ['owed_to_me'] }]);
  assert.deepEqual(compile('obligations', 'direction is owed_to_me').clauses, said.clauses, 'the stored form is the same clause');
});

test('a ref is read by the NAME of the row it points at, and held as the row number this tab knows', () => {
  const kiln = (ROWS.things ?? []).find((t) => t.fields.name === 'Kiln')?.seq;
  assert.ok(kiln, 'the sample no longer holds a project called Kiln');
  assert.deepEqual(compile('tasks', 'thing is Kiln').clauses, [{ field: 'thing', op: 'is', values: [String(kiln)] }]);
  /* AND BY THE NUMBER A CHIP CARRIES, which is the address a link keeps when a row is renamed. */
  assert.deepEqual(compile('tasks', `thing is ${kiln}`).clauses, compile('tasks', 'thing is Kiln').clauses);
  assert.ok(compile('tasks', 'thing is Atlantis').bad.length, 'a name no row bears was accepted');
});

test('a day keeps the words it was said in, which is what an address carries', () => {
  assert.deepEqual(compile('obligations', 'due before today').clauses, [{ field: 'due', op: 'before', day: 'today' }]);
  assert.deepEqual(compile('obligations', 'due after 2026-09-01').clauses, [{ field: 'due', op: 'after', day: '2026-09-01' }]);
  assert.deepEqual(compile('obligations', 'due is today').clauses, [{ field: 'due', op: 'on', day: 'today' }]);
  assert.deepEqual(compile('obligations', 'due is not -38d').clauses, [{ field: 'due', op: 'not on', day: '-38d' }]);
  assert.deepEqual(compile('services', 'renews before 90 days from now').clauses, [{ field: 'renews', op: 'before', day: '90 days from now' }]);
  /* A RANGE OF DAYS IS ITS TWO ENDS, each in its own words, as the record spells it. */
  assert.deepEqual(compile('obligations', 'due between today and +30d').clauses, [
    { field: 'due', op: 'gte', day: 'today' },
    { field: 'due', op: 'lte', day: '+30d' },
  ]);
});

test('an absence is a clause with no operand', () => {
  assert.deepEqual(compile('services', 'points at is empty').clauses, [{ field: 'points_at', op: 'empty', values: [] }]);
  assert.deepEqual(compile('services', 'points at is set').clauses, [{ field: 'points_at', op: 'present', values: [] }]);
  assert.deepEqual(compile('services', 'points at is not empty').clauses, [{ field: 'points_at', op: 'present', values: [] }]);
});

test('an order over money holds its bound in minor units, with the currency', () => {
  assert.deepEqual(compile('obligations', 'amount at least GBP 2400').clauses, [
    { field: 'amount', op: 'gte', values: ['GBP 2400.00'], bounds: [{ n: 240000, currency: 'GBP' }] },
  ]);
});

/* ── the refusal is the record's ─────────────────────────────────────────── */

test('the predicate TREE the docs also show is refused, not thrown on', () => {
  const w = compile('obligations', { all: [{ field: 'state', in: ['open'] }] } as unknown as string);
  assert.equal(w.clauses.length, 0);
  assert.match(w.bad[0] ?? '', /sentence/);
});

test('an operand that is not a day is refused, not compared as a string', () => {
  for (const bad of ['-7d ago', 'soon', 'last tuesday', 'next month', '9999-99-99', '2026-02-30'])
    assert.ok(compile('obligations', `due after ${bad}`).bad.length, `${bad} was accepted as a date`);
  assert.deepEqual(compile('obligations', 'due before 2026-10-01').bad, []);
});

test('a value the field cannot hold is refused, and says which', () => {
  // `done` is a TASK state. Obligations have none, so `state is not done` would be true of every row.
  assert.match(compile('obligations', 'state is not done').bad[0] ?? '', /has no value done/);
  assert.ok(compile('obligations', 'state is open or nonsense').bad.length, 'a bad value hid behind a good one');
  assert.ok(compile('services', 'nope is live').bad.length, 'an unknown field was accepted');
});

test('explain says what was wrong, one line for each condition, because the refusal is the teacher', () => {
  const w = compile('obligations', 'state is not done, due after soon');
  assert.equal(explain(w).length, 2);
  for (const line of explain(w)) assert.ok(line.length > 10, 'a refusal that explains nothing is a dead end');
});

/* ── a day ───────────────────────────────────────────────────────────────── */

test('the temporal literals resolve, and are not all the same day', () => {
  const seen = new Set<string>();
  for (const d of ['today', 'tomorrow', 'yesterday', 'bow', 'bom', 'eom', 'boy', 'eoy', '+30d', '-7d', '+2w', '+1m']) {
    const out = resolveDay(d, NOW);
    assert.ok(out && /^\d{4}-\d{2}-\d{2}$/.test(out), `${d} did not resolve`);
    seen.add(out);
  }
  assert.ok(seen.size >= 9, 'several literals collapsed onto the same day');
});

test('a month is a calendar month, and it clamps rather than overflowing', () => {
  assert.equal(resolveDay('+1m', Date.parse('2026-01-31T12:00:00Z')), '2026-02-28');
  assert.equal(resolveDay('-1m', Date.parse('2026-03-31T12:00:00Z')), '2026-02-28');
});

test('a year is not a day, in either direction', () => {
  assert.equal(saidPlainly('services', 'renews before +2y'), 'renews before +2y');
  assert.equal(resolveDay('+2y', NOW), null);
  assert.equal(resolveDay('2 years from now', NOW), null);
  assert.deepEqual(compile('services', 'renews before +2y').clauses, []);
});

/* ── a label ─────────────────────────────────────────────────────────────── */

test('a clause written with the label the screen shows is the same clause', () => {
  let pairs = 0;
  for (const [id, decl] of Object.entries(REGISTERS)) {
    for (const field of decl.fields) {
      if (field.type !== 'enum' || !field.values?.length) continue;
      const label = labelOf(field);
      if (label.toLowerCase() === field.id) continue;
      const value = field.values[0]!;
      const byLabel = compile(id, `${label} is ${value}`);
      assert.deepEqual(byLabel.bad, [], `${id}: ${label} is not read as a field`);
      assert.deepEqual(byLabel.clauses, compile(id, `${field.id} is ${value}`).clauses, `${id}: "${label} is ${value}" is another clause`);
      pairs++;
    }
  }
  assert.ok(pairs > 0, 'no register labels a field differently from its id, so nothing was proved');
});

test('the id wins over a label, so one field cannot answer for another', () => {
  /* THE COLLISION IS MADE, NOT WAITED FOR: `due` is labelled `state`, and `state is open` must still be the enum field. */
  const due = REGISTERS.obligations!.fields.find((f) => f.id === 'due')!;
  const kept = due.label;
  try {
    (due as { label?: string }).label = 'state';
    const w = compile('obligations', 'state is open');
    assert.deepEqual(w.bad, [], 'a label collision made a real field unreadable');
    assert.deepEqual(w.clauses.map((c) => c.field), ['state'], 'a label took a predicate away from the field whose id it borrowed');
    /* AND THE LABEL STILL RESOLVES WHERE THERE IS NO ID TO BEAT. */
    const one = ROWS.obligations![0]!;
    const party = display('obligations', 'party', one.fields.party)!;
    const byLabel = compile('obligations', `Party is ${party}`);
    assert.deepEqual(byLabel.bad, [], 'the label Party did not reach the field party');
    assert.deepEqual(byLabel.clauses.map((c) => c.field), ['party']);
  } finally {
    if (kept === undefined) delete (due as { label?: string }).label;
    else (due as { label?: string }).label = kept;
  }
});

/* ── the address of the rows it did not draw ─────────────────────────────── */

test('the register href carries the predicate the surface filtered by, as the field declares it', () => {
  const href = registerHref('obligations', 'state is open, direction is owed to me');
  assert.match(href, /^\/r\/obligations\?/);
  assert.match(href, /f=state:in:open/);
  assert.match(href, /f=direction:in:owed_to_me/);
  assert.ok(!href.includes('%20'), 'a URL carried a spoken value with spaces in it');
});

test('a dated clause travels as its word, and a negation becomes not-in', () => {
  /* THE WORD, NOT THE DAY IT RESOLVES TO: a bookmark to "renews in 90 days" that means a fixed afternoon quietly stops
     answering its own question. */
  assert.match(registerHref('services', 'renews before +90d'), /f=renews:before:%2B90d/, 'the + did not survive encoding');
  assert.match(registerHref('services', 'state is not cancelled'), /f=state:not-in:cancelled/);
});

test('a predicate the record refuses opens the register UNFILTERED, and does not pretend', () => {
  assert.equal(registerHref('obligations', 'state is open, ackamarackus'), '/r/obligations');
  assert.equal(registerHref('obligations', undefined), '/r/obligations');
});

test('a list filter mints the narrow address, and it reads back as the clause it was minted from', () => {
  const href = registerHref('things', 'repos has portage');
  assert.equal(href, '/r/things?f=repos:has:portage');
  const back = whereOf(chipsOf(new URL(href, 'http://x').searchParams));
  assert.equal(back, 'repos has portage');

  /* AND THE OTHER HALF OF THE SENTENCE TRAVELS WITH IT. */
  const both = registerHref('things', 'lane is earning, repos has portage');
  assert.match(both, /f=lane:in:earning/);
  assert.match(both, /f=repos:has:portage/);
  assert.deepEqual(
    compile('things', whereOf(chipsOf(new URL(both, 'http://x').searchParams))).clauses,
    compile('things', 'lane is earning, repos has portage').clauses,
  );

  /* `lacks` TRAVELS AS ITSELF, because `whereOf` reads the word and there is no `not-has` for it to read. */
  assert.equal(registerHref('things', 'repos lacks portage'), '/r/things?f=repos:lacks:portage');

  /* AND A `list<ref>` CARRIES THE TITLE WHERE IT CAN, the readable one of its two spellings. */
  const ref = registerHref('skills', 'because has Run the mastering pass before signing off an axis instance.');
  assert.match(ref, /f=because:has:Run%20the%20mastering/, `the title did not reach the URL: ${ref}`);
  const asked = whereOf(chipsOf(new URL(ref, 'http://x').searchParams));
  assert.deepEqual(compile('skills', asked).bad, [], `the minted address does not compile: ${asked}`);
});

test('a negated date chip comes back negated, rather than as its own complement', () => {
  const href = registerHref('obligations', 'due is not today');
  assert.ok(!href.includes(' '), `a raw space reached a URL: ${href}`);
  assert.equal(href, '/r/obligations?f=due:not-on:today');
  const back = whereOf(chipsOf(new URL(href, 'http://x').searchParams));
  assert.deepEqual(compile('obligations', back).clauses, compile('obligations', 'due is not today').clauses);
  /* AND THE POSITIVE IS UNCHANGED: `due:on:today` reads back as `due is today`, which IS the `on` clause. */
  assert.equal(registerHref('obligations', 'due is today'), '/r/obligations?f=due:on:today');
});

/* ── the printer ─────────────────────────────────────────────────────────── */

test('the printer says the clause back in words the record still reads', () => {
  const printed = saidPlainly('things', 'repos has portage');
  assert.equal(printed, 'repositories has portage');
  assert.deepEqual(compile('things', printed).clauses, compile('things', 'repos has portage').clauses);

  /* AND AN UNDERSCORE IN A LIST'S VALUE SURVIVES, which the enum swap beside it would have eaten. */
  assert.equal(saidPlainly('tools', 'needs has BRAINDOG_TOKEN'), 'keys it needs has BRAINDOG_TOKEN');
});

test('and a SHOUTED operator is the same operator in the printer as it is in the parser', () => {
  const shouted = saidPlainly('tools', 'needs HAS BRAINDOG_TOKEN');
  assert.deepEqual(compile('tools', shouted).bad, [], `the printed filter does not compile: ${shouted}`);
  assert.deepEqual(compile('tools', shouted).clauses, compile('tools', 'needs HAS BRAINDOG_TOKEN').clauses);
  assert.equal(saidPlainly('obligations', 'due BEFORE +30d'), saidPlainly('obligations', 'due before +30d'));
});
