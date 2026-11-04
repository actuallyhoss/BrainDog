/**
 * The rule that decides what is in the command surface, and what the command surface can reach.
 *
 * `search.test.ts` covers the counts the palette says. This covers the two things the palette is
 * actually about: an admission rule with three tests that is enforced rather than described,
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

import '../record/fixtures/fill.ts';
import { ACTS, COMMANDS, UNDO_LAST, admits, commands, type Command } from './admit.ts';
import { QUIET_HREF, customise, lookSaid, type Here, type Offer, type Place } from './customise.ts';
import { BINDINGS, type Binding } from '../a11y/bindings.ts';
import { copy } from '../copy.ts';
import { METRICS } from '../record/declared.ts';
import { isTemplate, unreadable } from '../record/metrics.ts';
import { REGISTERS } from '../record/api.ts';
import { entry, metric, search } from '../record/fixtures/readers.ts';
import { AUDIT, QUESTIONS, VIEWS } from '../record/fixtures/sample.ts';

const src = (...parts: string[]) => readFileSync(join(fileURLToPath(new URL('../', import.meta.url)), ...parts), 'utf8');


/** A command that passes, so a fixture below can fail on one property at a time. */
const good: Command = { id: 'fixture', title: 'Open the Keychain', href: '/keychain', group: 'Go to', icon: 'vault' };

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
  assert.equal(admits({ ...good, title: 'Keychain' }), null);
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
  const idle = commands({ undoable: false, creation: null }).map((c) => c.id);
  const armed = commands({ undoable: true, creation: null }).map((c) => c.id);
  assert.ok(!idle.includes('c-undo'), 'undo is offered with nothing to undo');
  assert.ok(armed.includes('c-undo'), 'undo is not offered when there is something to undo');
  /* And nothing else moved: the standing rule takes one row away, not the list. */
  assert.deepEqual(armed.filter((id) => id !== 'c-undo'), idle);
});

test('THE ROW THAT MAKES SOMETHING is declared, admitted, and there only while the query is a whole sentence', () => {
  /* TWENTY-TWO, with Import contacts; twenty-one with Slash conversations; twenty with Import a statement; nineteen before it, and sixteen before the three money rows; it was fifteen: `New page` joined the add row and `Customise` (`new-page.test.ts`). The
     count is exact on purpose, because a row added or lost here is a change to what every screen can reach, and it
     should arrive with the line that says so. */
  assert.equal(COMMANDS.length, 22, `the palette declares ${COMMANDS.length} rows`);
  const add = COMMANDS.find((c) => c.id === 'c-add');
  assert.ok(add, 'no row adds anything');
  assert.equal(admits(add), null, `the add row is refused: ${admits(add)}`);
  assert.equal(add.act, 'add');
  /* THE STANDING RULE, ON A ROW WITH AN ARGUMENT. With nothing to add there is nothing to press, so the row is absent,
     and the moment the box holds a list and a title it is there. Nothing else moves either way. */
  const idle = commands({ undoable: false, creation: null }).map((c) => c.id);
  const armed = commands({ undoable: false, creation: { register: 'tasks', title: 'buy milk' } }).map((c) => c.id);
  assert.ok(!idle.includes('c-add'), 'the add row is offered with nothing to add');
  assert.ok(armed.includes('c-add'), 'the add row is not offered for a whole sentence');
  assert.deepEqual(armed.filter((id) => id !== 'c-add'), idle);
});

test('an act that names no binding passes test 2 only when it carries its own target', () => {
  /* Undo means the same thing from every screen because the keymap binds it at the document. Add means the same thing
     because the list is in its own words: `Add to Tasks` is Tasks from the inbox and from a page. An act with neither is
     a remote control for the screen underneath, and is still refused. */
  assert.equal(admits({ ...good, href: null, act: 'undo' }), 'not-everywhere');
  assert.equal(admits({ ...good, href: null, act: 'add' }), null);
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
    /* The quick add's `+` is a page-scope key, bound by the host that draws the sheet, so it is the one allowed to be so. */
    const want = c.binding === 'money-add' ? 'page' : 'document';
    assert.equal(registryRow(c.binding).scope, want, `${c.id} names the binding "${c.binding}", which is not a ${want}-level one`);
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
  assert.ok(kinds.has('Needs you'), 'no decision is reachable by typing');
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
  /* A COUNT PER A DISTINCT OF ITS OWN ROWS reads no value while it counts no row (money-core's `repeating-overdue`,
     batch 74; since batch 78 its rows are the matched lines, so it reads no value only with no matched line at all),
     and the sample holds no matched line: a figure with nothing to say has no row here, as it has no door. */
  const silentWhenNone = (d: { value?: unknown }): boolean => {
    const ratio = (d.value as { ratio?: { per?: object } } | undefined)?.ratio;
    return ratio !== undefined && ratio.per !== undefined && 'distinct' in ratio.per;
  };
  const drawn = Object.entries(METRICS).filter(
    ([, d]) => !isTemplate(d) && unreadable(d).length === 0 && d.source !== 'register.books' && d.source !== 'register.kpis' && !silentWhenNone(d),
  );
  /* THE SAMPLE KEEPS NO BOOK, so a figure over books has no row to open and the palette rightly gives it no door. NOR
     ANY KEY NUMBER, Portfolio's since 1.19.0, for the same reason. */
  assert.ok(drawn.length >= 5, 'the figures group would be all but empty');
  for (const [id, decl] of drawn) {
    const read = metric(id);
    assert.equal(read.label, decl.name, `${id} draws under a name that is not its own`);
    assert.ok(read.value.trim().length > 0, `${id} has no reading to print`);
    /* A SUM OVER ROWS THE SAMPLE HOLDS NONE OF IS UNSAID (`unsaidFigure`): the sample keeps no weekly or yearly budget,
       so Money's weekly and yearly totals read "nothing matched" and have no door, as a page draws them. */
    if (read.unsaid === true) continue;
    assert.match(read.href ?? '', /^\//u, `${id} has nowhere to go, so the palette would drop it`);
    /* A MONEY CEILING STARTS EMPTY SINCE money-core 3.0.0 (`MONEY_TARGET_SETTINGS`), and empty is no target: until a
       person types a sum the figure has no line to hold it to and no verdict, so a bare figure there is the truth. */
    const target = (decl.target ?? {}) as { lte?: unknown; gte?: unknown };
    if (typeof target.lte !== 'number' && typeof target.gte !== 'number') {
      assert.equal(read.tone, undefined, `${id} carries a verdict against a target nobody typed`);
      continue;
    }
    /* A LIMIT KEPT SAYS NOTHING (`targetLine`): "Limit 5" under a 2 is a rule nobody broke. A broken one always says how
       far over, and a floor says its line, but for a floor of zero, which nothing can be under. */
    if (typeof target.lte === 'number' && read.tone === 'good') continue;
    if (target.gte === 0) continue;
    /* AND A DAY HAS NO LINE: its bound is a day nobody set, and the tone says which side of it the day is on. */
    if (decl.format === 'day') continue;
    assert.ok(read.note.trim().length > 0, `${id} prints a bare figure, which is a number you look at`);
  }
  /* AND THE ONES IT DROPS REALLY ARE UNREADABLE, so the filter is not throwing away rows that work. */
  for (const [id, decl] of Object.entries(METRICS))
    if (isTemplate(decl)) {
      /* A walk's parameter is in its legs and its opening and not in a `where` (`book-lasts-until`), a tree's is in
         the tree (`kpi-stale`), and a sum's is in the figures it adds (`account-gap`). */
      const walk = decl as { legs?: unknown; opening?: unknown; value?: unknown };
      assert.match(JSON.stringify([decl.where ?? null, walk.legs ?? null, walk.opening ?? null, walk.value ?? null]), /\{\{/u, `${id} is dropped as a template and carries no parameter`);
    }
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
  assert.deepEqual([...ACTS], ['undo', 'add', 'customise', 'page', 'money']);
  for (const c of COMMANDS) {
    if (c.href !== null) continue;
    assert.ok(c.act !== undefined && (ACTS as readonly string[]).includes(c.act), `${c.id} acts, and does not say what it does`);
  }
});

/* ── customising the app in words ─────────────────────────── */

const place = (href: string, name: string, more: Partial<Place> = {}): Place => ({ href, name, own: name, icon: 'doc', hide: true, rename: true, ...more });

/** A fresh device on a record with a Money page, a Money flow page, Inbox and the app's own screens. */
const fresh: Here = {
  look: {},
  places: [
    place('/', 'Today', { hide: false, rename: false }),
    place('/decide', 'Needs you', { hide: false, rename: false }),
    place('/inbox', 'Inbox', { rename: false }),
    place('/p/money', 'Money'),
    place('/p/money-flow', 'Money flow'),
    place('/r/invoices', 'Invoices', { hide: false, rename: false }),
  ],
  hidden: [],
  home: null,
  pageMenu: false,
};

const kinds = (offers: Offer[]) => offers.map((o) => o.change.kind);

test('AN EMPTY QUERY DRAWS NO CUSTOMISE ROW, so a freshly opened palette looks as it did', () => {
  for (const q of ['', '   ']) assert.deepEqual(customise(q, { ...fresh, pageMenu: true }), []);
  /* AND THE DECLARATION IS ABSENT WITH NOTHING TO DRAW, by the standing rule, so `commands()` with no offers is the list
     it always was. */
  const idle = commands({ undoable: false, creation: null }).map((c) => c.id);
  assert.ok(!idle.includes('c-customise'), 'the customise row is offered with nothing typed');
  assert.deepEqual(commands({ undoable: false, creation: null, customise: [] }).map((c) => c.id), idle);
  const armed = commands({ undoable: false, creation: null, customise: customise('dark', fresh) }).map((c) => c.id);
  assert.deepEqual(armed.filter((id) => id !== 'c-customise'), idle);
  assert.ok(armed.includes('c-customise'));
});

test('the customise declaration passes the three tests, as an act that names its own target', () => {
  const row = COMMANDS.find((c) => c.id === 'c-customise');
  assert.ok(row);
  assert.equal(admits(row), null, `the customise row is refused: ${admits(row)}`);
  assert.equal(admits({ ...good, href: null, act: 'customise' }), null);
});

test('"dark", "compact", "open on money" and "hide inbox" each offer exactly one row, and the right one', () => {
  const dark = customise('dark', fresh);
  assert.equal(dark.length, 1, `"dark" offers ${dark.map((o) => o.title).join(', ')}`);
  assert.deepEqual(dark[0]?.change, { kind: 'look', key: 'scheme', value: 'dark', name: dark[0]?.title });

  const compact = customise('compact', fresh);
  assert.equal(compact.length, 1, `"compact" offers ${compact.map((o) => o.title).join(', ')}`);
  assert.deepEqual(compact[0]?.change, { kind: 'look', key: 'density', value: 'compact', name: compact[0]?.title });

  /* MONEY AND NOT MONEY FLOW TOO: a name typed whole picks the page called that. */
  const money = customise('open on money', fresh);
  assert.equal(money.length, 1, `"open on money" offers ${money.map((o) => o.title).join(', ')}`);
  assert.deepEqual(money[0]?.change, { kind: 'home', href: '/p/money', name: 'Money' });
  assert.equal(money[0]?.title, 'Open on Money');

  const inbox = customise('hide inbox', fresh);
  assert.equal(inbox.length, 1, `"hide inbox" offers ${inbox.map((o) => o.title).join(', ')}`);
  assert.deepEqual(inbox[0]?.change, { kind: 'hide', href: '/inbox', name: 'Inbox' });

  /* CASE AND SPACING ARE NOT PART OF THE SENTENCE. */
  assert.deepEqual(customise('  Open   on  MONEY ', fresh).map((o) => o.id), money.map((o) => o.id));
});

test('a row that would change nothing is absent: already dark, already hidden, already the page it opens on', () => {
  assert.deepEqual(customise('dark', { ...fresh, look: { scheme: 'dark' } }), []);
  assert.deepEqual(customise('compact', { ...fresh, look: { density: 'compact' } }), []);
  assert.deepEqual(customise('hide inbox', { ...fresh, hidden: ['/inbox'] }), []);
  assert.deepEqual(customise('open on money', { ...fresh, home: '/p/money' }), []);
  /* TODAY IS WHERE A FRESH RECORD OPENS, so opening on it is offered only once something else is first. */
  assert.deepEqual(customise('open on today', fresh), []);
  assert.deepEqual(kinds(customise('open on today', { ...fresh, home: '/p/money' })), ['home']);
  /* AND "match the system" ONLY ONCE THE DEVICE HAS A SCHEME OF ITS OWN. */
  assert.ok(!customise('system', fresh).some((o) => o.id === 'cz-scheme-system'));
  assert.ok(customise('system', { ...fresh, look: { scheme: 'dark' } }).some((o) => o.id === 'cz-scheme-system'));
  /* A HIDDEN PAGE IS SHOWN AGAIN BY NAME, and only a hidden one. */
  assert.deepEqual(kinds(customise('show inbox', { ...fresh, hidden: ['/inbox'] })), ['show']);
  assert.deepEqual(customise('show inbox', fresh), []);
});

test('a verb that takes a page draws nothing until a page is named, and a page the nav cannot hide is not offered', () => {
  for (const q of ['hide', 'open on', 'rename', 'open on nowhere', 'hide nothing at all']) assert.deepEqual(customise(q, fresh), [], q);
  /* TODAY, DECIDE AND A LIST ARE NOT ROWS OF THE NAV A PERSON CAN TAKE AWAY. */
  assert.deepEqual(customise('hide today', fresh), []);
  assert.deepEqual(customise('hide invoices', fresh), []);
  /* AND A NAME THAT IS ONLY A PREFIX REACHES EVERY PAGE IT STARTS. */
  assert.deepEqual(customise('open on mon', fresh).map((o) => o.title), ['Open on Money', 'Open on Money flow']);
});

test('one or two letters draw nothing, so the rows never crowd a query that is still being typed', () => {
  for (const q of ['d', 'da', 'c', 'co', '?']) assert.deepEqual(customise(q, fresh), [], q);
  assert.deepEqual(kinds(customise('dar', fresh)), ['look']);
  /* A WORD NONE OF THEM SAYS DRAWS NONE OF THEM. */
  assert.deepEqual(customise('invoice from acme', fresh), []);
});

test('rename asks for the new name, then renames, in the person\'s own capitals', () => {
  const ask = customise('rename money', fresh);
  assert.equal(ask.length, 1);
  assert.deepEqual(ask[0]?.change, { kind: 'fill', text: 'Rename Money to ' });
  /* THE BOX AFTER THE PRESS STILL MAKES THE SAME ROW, so pressing it again cannot go anywhere new. */
  assert.deepEqual(kinds(customise('Rename Money to ', fresh)), ['fill']);
  const done = customise('rename money to Cash', fresh);
  assert.equal(done.length, 1);
  assert.deepEqual(done[0]?.change, { kind: 'rename', href: '/p/money', own: 'Money', from: 'Money', to: 'Cash' });
  assert.equal(done[0]?.title, 'Rename Money to Cash');
  /* A NAME THE NAV CANNOT CARRY IS NOT OFFERED: Inbox and the lists keep their own. */
  assert.deepEqual(customise('rename inbox to Mail', fresh), []);
  /* A PAGE WHOSE OWN NAME HOLDS "to" IS STILL NAMED. */
  assert.deepEqual(kinds(customise('rename back to work', { ...fresh, places: [place('/p/back', 'Back to work')] })), ['fill']);
});

test('customise this page is offered only over a page that has its menu, and quiet hours go to Notifications', () => {
  assert.deepEqual(customise('customise this page', fresh), []);
  assert.deepEqual(kinds(customise('customise this page', { ...fresh, pageMenu: true })), ['page']);
  assert.deepEqual(kinds(customise('edit layout', { ...fresh, pageMenu: true })), ['page']);
  const quiet = customise('quiet hours', fresh);
  assert.equal(quiet.length, 1);
  assert.deepEqual(quiet[0]?.change, { kind: 'go', href: QUIET_HREF });
  assert.equal(QUIET_HREF, '/settings/notifications');
});

test('every customise row is named in words a person reads, and says where the change lands', () => {
  const all = [
    ...customise('scheme', { ...fresh, look: { scheme: 'dark' } }),
    ...customise('text size', fresh),
    ...customise('density', fresh),
    ...customise('open on mon', fresh),
    ...customise('hide inbox', fresh),
    ...customise('rename money to Cash', fresh),
    ...customise('customise', { ...fresh, pageMenu: true }),
    ...customise('quiet', fresh),
  ];
  assert.ok(all.length >= 12, `only ${all.length} rows were drawn`);
  for (const o of all) {
    assert.ok(o.title.trim() && o.detail.trim(), `${o.id} has no title or no line under it`);
    /* §35: THE WORDS NAME THE PERSON'S OWN THINGS, never the system's. */
    assert.doesNotMatch(`${o.title} ${o.detail}`, /\b(row|rows|list item|entity)\b/iu, `${o.id} says "${o.title} · ${o.detail}"`);
    /* AND TEST 3 OF `admit.ts`: typing a row's own title finds the row. A rename's sentence is typed, not found. */
    if (o.complete !== undefined) assert.equal(admits({ ...good, title: o.title }), null, `${o.title} is not a name anybody could type`);
  }
});

test('a look row and its toast say where the change is kept: this record, this device for now, or this device', () => {
  const where = (kept: Here['kept']) => customise('dark', { ...fresh, ...(kept ? { kept } : {}) })[0]?.detail;
  assert.equal(where('record'), 'Yours in this BrainDog, on every device');
  assert.equal(where('pending'), 'On this device for now');
  assert.equal(where('device'), 'On this device');
  /* NOTHING SAID IS THE CLAIM THAT IS NEVER WRONG. */
  assert.equal(where(undefined), 'On this device');
  /* AND ONLY THE LOOK ROWS: a page's place in the nav is the person's on the record whatever the look does. */
  assert.equal(customise('hide inbox', { ...fresh, kept: 'record' })[0]?.detail, 'From your nav. Nothing is deleted.');

  assert.equal(lookSaid({ from: 'kept' }, 'Dark mode'), 'Dark mode, in this BrainDog on every device you open it on.');
  assert.equal(lookSaid({ from: 'pending' }, 'Dark mode'), 'Dark mode, on this device for now. It reaches your BrainDog the next time it can.');
  assert.equal(lookSaid({ from: 'device' }, 'Dark mode'), 'Dark mode, on this device.');
  assert.equal(lookSaid({ from: 'refused', fix: 'key is one of nav.order.' }, 'Dark mode'), 'Dark mode, on this device.');
  for (const s of [where('record'), lookSaid({ from: 'kept' }, 'Dark mode'), lookSaid({ from: 'pending' }, 'Dark mode')])
    assert.doesNotMatch(s ?? '', /\u2014/u, 'an em dash in a look line');
});

test("the palette is clear glass at the sheet radius over a scrim, centred, and the solid tile where it cannot blur or less transparency is asked for (ops look, 440f496b4)", () => {
  const code = readFileSync(new URL('./Palette.svelte', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//gu, '');
  const style = code.slice(code.indexOf('<style>'));
  /* GLASS ONLY ON THE SKIN'S TOKENS, the tile under each one where the skin has none, and the modal shadow on its edge. */
  assert.match(style, /\.palette \{[^}]*background: var\(--glass-regular, var\(--tile\)\);[^}]*backdrop-filter: var\(--glass-filter, none\);/u);
  assert.match(style, /\.palette \{[^}]*box-shadow: var\(--glass-edge, inset 0 0 0 1px var\(--rule-strong\)\), var\(--elev-modal, none\);/u);
  /* WHERE IT CANNOT BLUR, OR LESS TRANSPARENCY IS ASKED FOR, NOTHING BEHIND IT READS THROUGH. */
  assert.match(style, /@supports not \(backdrop-filter: blur\(1px\)\) \{\s*\.palette \{\s*background: var\(--tile\);/u);
  assert.match(style, /@media \(prefers-reduced-transparency: reduce\) \{\s*\.palette \{\s*background: var\(--tile\);\s*backdrop-filter: none;/u);
  /* THE SCRIM UNDER IT. */
  assert.match(style, /\.palette::backdrop \{[^}]*background: var\(--scrim\);/u);
  assert.doesNotMatch(style, /box-shadow: var\(--e\d\)/u);
  /* CENTRED, 640 WIDE OR THE SCREEN LESS 16 A SIDE, 12% FROM THE TOP. */
  assert.match(style, /\.palette \{[^}]*inset-block-start: 12vh;[^}]*inline-size: min\(640px, calc\(100vw - 2 \* var\(--sp-4\)\)\);[^}]*margin: 0 auto;/u);
});
