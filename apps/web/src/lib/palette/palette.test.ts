/**
 * The rule that decides what is in the command surface, and what the command surface can reach.
 *
 * `search.test.ts` covers the counts the palette says. This covers the two things `loop/REWORK.md`
 * §6 is actually about: an admission rule with three tests that is enforced rather than described,
 * and a surface that reaches the OBJECTS the record holds rather than the screens they live on.
 *
 * NOT THE MARKUP. A `.svelte` file cannot be imported by `node --test`, and a regex over source
 * proves a shape rather than a behaviour, so everything here that can run is run: `admits` and
 * `commands` are ordinary functions in `admit.ts` for exactly that reason.
 *
 * TWO ASSERTIONS USED TO READ THE KEYMAP AS TEXT, because the registry lived in a module with runes
 * in it and nothing loadable by `node --test` could import it. The bindings are data and they live
 * in a plain `a11y/bindings.ts` now, so both read the registry itself: a grep over source proves
 * that a string appears in a file, and what these two claims are about is what the product holds.
 *
 * `50 §9` runs these with `node --test` from `apps/web`, like every other test beside them.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ACTS, COMMANDS, UNDO_LAST, admits, commands, type Command } from './admit.ts';
import { BINDINGS, type Binding } from '../a11y/bindings.ts';
import { copy } from '../copy.ts';
import { METRICS } from '../record/declared.ts';
import { isTemplate, unreadable } from '../record/metrics.ts';
import { AUDIT, QUESTIONS, REGISTERS, VIEWS, entry, metric, search } from '../record/api.ts';

const src = (...parts: string[]) => readFileSync(join(fileURLToPath(new URL('../', import.meta.url)), ...parts), 'utf8');


/** A command that passes, so a fixture below can fail on one property at a time. */
const good: Command = { id: 'fixture', title: 'Open the vault', href: '/vault', group: 'Go to', icon: 'vault' };

/* ── the rule, applied to the list ────────────────────────────────────────── */

test('EVERY DECLARED COMMAND PASSES ALL THREE TESTS', () => {
  /* The rule is enforced by a filter, and a filter with nothing watching it turns a mistake into an
     absence nobody notices: a command that fails a test does not break the palette, it quietly
     stops being in it. This is what makes the refusal loud. */
  for (const c of COMMANDS) assert.equal(admits(c), null, `${c.id} ("${c.title}") is declared and refused: ${admits(c)}`);
  assert.ok(COMMANDS.length >= 9, 'the command list emptied out');
});

test('a command that needs an object chosen first is refused', () => {
  /* Test 1. "File this row under Groceries" needs the row first, so it lives on the row. The
     mechanical form is a route with a hole in it, and every spelling of a hole this codebase uses
     is a hole: SvelteKit writes `[register]`, the documents write `:seq`, a page template writes
     `{{it}}`. */
  for (const href of ['/r/:register/:seq', '/r/[register]', '/p/{slug}'])
    assert.equal(admits({ ...good, href }), 'object-first', `${href} was admitted, and it names no target`);
  /* AND THE SAME TEST IS WHAT KEEPS THE PROJECT FIGURES OUT OF THE FIGURES GROUP. `isTemplate` is
     this test asked of a metric declaration rather than of a route, and it has to actually remove
     something or the palette's use of it is decoration. */
  const templates = Object.values(METRICS).filter((d) => isTemplate(d));
  assert.ok(templates.length > 0, 'no metric needs a parameter, so the palette filters nothing');
  assert.ok(templates.length < Object.keys(METRICS).length, 'every metric is a template, so the group would be empty');
});

test('a command that is a remote control for the screen you are on is refused', () => {
  /* Test 2. A period filter on the spending view is a control for a page you are looking at; from
     the palette it would act on a page you cannot see. Anything that is not an absolute address is
     read against whatever route happens to be underneath, which is the definition of not meaning
     the same thing from every screen. */
  for (const href of ['?lane=agent', '#renewals', 'settings/appearance', '../decide'])
    assert.equal(admits({ ...good, href }), 'not-everywhere', `${href} was admitted, and it means a different thing per screen`);
});

test('a command whose name is not a word anybody types is refused', () => {
  /* Test 3. A command whose only honest label is "toggle the thing in the corner" is furniture.
     What a machine can judge is narrower and still worth having: a name the query grammar cannot
     carry back is a row nobody can find by typing its own words at it. */
  for (const title of ['', '···', '»', 'a b'])
    assert.equal(admits({ ...good, title }), 'unsayable', `"${title}" was admitted as a name`);
  /* And it is not simply refusing everything short: two of the shipped rows are one word. */
  assert.equal(admits({ ...good, title: 'Vault' }), null);
});

test('the three tests are taken in order, so a refusal names the first thing wrong with the row', () => {
  /* A row that fails two tests reports the earlier one. Reported the other way round, the fix
     offered to whoever added it would be for the wrong problem. */
  assert.equal(admits({ ...good, href: '?f=[state]', title: '»' }), 'object-first');
  assert.equal(admits({ ...good, href: '?lane=agent', title: '»' }), 'not-everywhere');
});

/* ── the standing rule: a row that cannot run is not there ────────────────── */

test('A ROW THAT CANNOT RUN RIGHT NOW IS ABSENT, NOT GREYED OUT', () => {
  /* Undo is the worked example, and it is the whole of the mechanism: with nothing to reverse the
     row is not built, so nobody reads a dead line asking them to work out what the app thinks they
     last did. There is no disabled state to assert against, which is the point. */
  const idle = commands({ undoable: false }).map((c) => c.id);
  const armed = commands({ undoable: true }).map((c) => c.id);
  assert.ok(!idle.includes('c-undo'), 'undo is offered with nothing to undo');
  assert.ok(armed.includes('c-undo'), 'undo is not offered when there is something to undo');
  /* And nothing else moved: the standing rule takes one row away, not the list. */
  assert.deepEqual(armed.filter((id) => id !== 'c-undo'), idle);
});

test('the standing rule reaches the objects too, not only the commands', () => {
  /* A saved view over a register this record does not hold is a door onto nothing: `/v/<key>` has
     no list to filter. The palette drops those, and the assertion that matters is that the record
     it ships with has none, because a rule proved only by a record that breaks it is a rule nobody
     can tell is working. */
  for (const [key, v] of Object.entries(VIEWS))
    assert.ok(REGISTERS[v.register], `${key} is a saved view over "${v.register}", which this record does not hold`);
  assert.ok(Object.keys(VIEWS).length > 0, 'there are no saved views, so the branch proves nothing');
});

/* ── the keys printed on the rows come out of the registry ────────────────── */

/** The registry's own row for one binding id, so the assertion below reads one binding. */
function registryRow(id: string): Binding {
  const held = BINDINGS.find((b) => b.id === id);
  assert.ok(held, `the registry has no binding called "${id}"`);
  return held;
}

test('every binding a row prints is one the registry actually holds', () => {
  /* `19 §4` makes the keymap "a registry the dispatcher consults" so the `?` sheet cannot drift
     from what is bound. A palette row printing a key it spelled itself would be the second list
     that rule exists to prevent, and it is the list that goes stale first, because a row is edited
     far more often than a binding. The palette names an id and reads the key; this is the half
     that checks the id is real. */
  for (const c of COMMANDS) {
    if (c.binding === undefined) continue;
    assert.equal(registryRow(c.binding).scope, 'document', `${c.id} names the binding "${c.binding}", which is not a document-level one`);
  }
  /* AND THE TWO THE PANEL ITSELF PRINTS ON THE CURSOR ROW. They moved off the footer legend, so if
     the registry loses them the rows go bare and nothing else says so. */
  for (const id of ['palette-run', 'palette-complete'])
    assert.ok(
      BINDINGS.some((b) => b.id === id),
      `the registry lost ${id}`,
    );
});

test('the undo row is labelled by the binding rather than by a copy of it', () => {
  /* THE LABEL WAS TYPED TWICE and this test grepped the registry's source for the copy. It reads
     the binding now, so the only way the two can disagree is if the binding stops existing, which
     is what this asserts. */
  assert.equal(UNDO_LAST, registryRow('undo').label);
  assert.ok(UNDO_LAST.length > 0, 'the undo binding is gone and the row would print an empty label');
});

/* ── the reach: objects, not only destinations ────────────────────────────── */

test('THE SURFACE REACHES ROWS, PAGES AND DECISIONS, not only the screens they live on', () => {
  /* The palette's own record branch is `search()`, and what it can reach is what the palette can
     reach. Three of the four kinds of object are here; the fourth is the figures, below. */
  /* `re` and not `a`: the matcher is strict prefix on a token, so a one-letter query reaches nine
     lists and no page, because no page in this record is called Anything. A query that misses one
     of the four kinds would prove the reach is missing when it is the query that is. */
  const found = search('re', 9_999);
  const kinds = new Set(found.groups.map((g) => g.kind));
  assert.ok(kinds.has('Decide'), 'no decision is reachable by typing');
  assert.ok(kinds.has(copy.pages), 'no page is reachable by typing');
  const registers = new Set(Object.values(REGISTERS).map((r) => r.name));
  assert.ok([...kinds].some((k) => registers.has(k)), 'no register row is reachable by typing');
  /* AND EVERY HIT IS AN ADDRESS. A result that cannot be opened is a result that wastes the one
     press it exists to save. */
  for (const hit of found.hits) assert.match(hit.href, /^\//u, `${hit.title} has no address`);
});

test('a decision is reachable with nothing typed at all, which is what the height is for', () => {
  /* The panel opens on an inventory rather than a menu of screens, and the cut it takes has to come
     out of something. Four questions and a cap of six is the record as it ships. */
  assert.ok(QUESTIONS.length > 0, 'the record holds no open question, so the empty panel lists none');
  for (const q of QUESTIONS) assert.ok(q.id && q.title, 'a question with no id or no title cannot be a row');
});

test('AND IT REACHES THE FIGURES, which no search could reach before', () => {
  /* Six metrics are declared, each with a target and a window, and the only way to any of them was
     to know which page it was a tile on. The palette lists the ones that can be read, drawn with
     the reading and the target beside the name so the row answers without being opened. */
  const drawn = Object.entries(METRICS).filter(([, d]) => !isTemplate(d) && unreadable(d).length === 0);
  assert.ok(drawn.length >= 5, 'the figures group would be all but empty');
  for (const [id, decl] of drawn) {
    const read = metric(id);
    assert.equal(read.label, decl.name, `${id} draws under a name that is not its own`);
    assert.ok(read.value.trim().length > 0, `${id} has no reading to print`);
    assert.ok(read.note.trim().length > 0, `${id} prints a bare figure, which is a number you look at`);
    assert.match(read.href ?? '', /^\//u, `${id} has nowhere to go, so the palette would drop it`);
  }
  /* AND THE ONES IT DROPS REALLY ARE UNREADABLE, so the filter is not throwing away rows that work. */
  for (const [id, decl] of Object.entries(METRICS))
    if (isTemplate(decl)) assert.match(decl.where ?? '', /\{\{/u, `${id} is dropped as a template and carries no parameter`);
});

test('AND IT REACHES THE ROWS YOU CHANGED LAST, off a ledger the record was already keeping', () => {
  /* An open palette listed the commands, the pages, the saved views, the registers, the figures and
     the questions, and not one row of the record: getting back to the obligation you edited ten
     minutes ago meant remembering what it was called and typing it. The panel reads `AUDIT` for
     that group, and nothing new is stored to do it.

     WHAT THIS GUARDS IS AN ABSENCE. The source is a filter over a ledger whose targets are three
     different grammars, a row id and a declaration id and a governance id, and only the first of
     them is a thing with a page to open. If the row targets stopped resolving the group would stop
     being drawn: no error, no empty state, one section of the panel gone. */
  const ROW_TARGET = /^([a-z][a-z0-9_]*)#(\d+)$/u;
  const reached: string[] = [];
  const seen = new Set<string>();
  for (const event of AUDIT) {
    const found = ROW_TARGET.exec(event.target ?? '');
    if (!found) continue;
    const [target, register = '', seq] = found;
    if (seen.has(target)) continue;
    const held = REGISTERS[register];
    const row = entry(register, Number(seq));
    if (!held || !row) continue;
    seen.add(target);
    reached.push(String(row.fields[held.title] ?? '').trim());
  }
  /* Five is the panel's own cap on this group, which lives in the component and cannot be imported
     here. A ledger that reaches four rows draws a short group and says nothing about it. */
  assert.ok(reached.length >= 5, `the ledger reaches ${reached.length} rows and the panel draws five`);
  for (const title of reached) assert.ok(title.length > 0, 'a row the panel would draw has no name to print');
  /* AND NEWEST FIRST, because "recently changed" is a claim about ORDER and `AUDIT` is the only
     thing making it. Sorted the other way the group would draw the five oldest writes in the record
     under a heading that says the opposite, which is a lie no reader could catch. */
  let previous = '';
  for (const event of AUDIT) {
    if (previous !== '') assert.ok(event.at <= previous, 'the ledger is no longer newest first');
    previous = event.at;
  }
});

test('every act the palette can perform is a named one, so no row smuggles in an argument', () => {
  /* A closure hanging off a declaration would let the next acting row take an object, and test 1
     would stop being checkable. The list is closed and the palette switches on the name. */
  assert.deepEqual([...ACTS], ['undo']);
  for (const c of COMMANDS) {
    if (c.href !== null) continue;
    assert.ok(c.act !== undefined && (ACTS as readonly string[]).includes(c.act), `${c.id} acts, and does not say what it does`);
  }
});
