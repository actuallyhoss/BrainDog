/**
 * The words a page needs to be laid out the way a person needs it, and the words nobody reads refused where they are
 * written.
 *
 * THE SURVEY MEASURED THREE SILENT DOORS through a pack installed on a fresh record, and each is held shut here: a
 * block key nobody reads (`size: 2`) installed and was refused only when the page was opened; a page key nobody reads
 * (`layout`, `tabs`) installed and was handed to the host unread; `lead: true` on cards and `first: 3` on steps
 * installed and read clean while nothing looked at them; and a page naming `block.pad` reads its rows through the same
 * fall-through an unregistered kind always has, now that a pack's own kind reads like any other.
 *
 * AND THE NEW WORDS ARE ANSWERED, not only admitted: a card's next step, a path's done and next marks and its short
 * view, a question's option shown as what it is, the questions about one thing, and one row's fields to type into.
 * Nothing here knows a person or a label; the lists are invented.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { jcs, openRecord, validateDeclaration, type Declaration, type Json } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 25, 12);
const OWNER = { actor: 'p_1' };

const AREAS: Declaration = {
  id: 'register.areas',
  kind: 'register',
  body: { id: 'areas', name: 'Areas', title: 'name', fields: [{ id: 'name', type: 'text', required: true }, { id: 'what', type: 'text' }] } as never,
};

const STEPS: Declaration = {
  id: 'register.steps',
  kind: 'register',
  body: {
    id: 'steps',
    name: 'Steps',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'area', type: 'ref', to: 'areas' },
      { id: 'done', type: 'bool' },
      { id: 'rank', type: 'int' },
    ],
    steps: { of: 'area', done: 'done', order: 'rank' },
  } as never,
};

const LINES: Declaration = {
  id: 'register.lines',
  kind: 'register',
  body: {
    id: 'lines',
    name: 'Lines',
    title: 'item',
    fields: [
      { id: 'item', type: 'text', required: true },
      { id: 'low', type: 'int' },
      { id: 'high', type: 'int' },
      { id: 'spent', type: 'int' },
      { id: 'area', type: 'ref', to: 'areas' },
    ],
  } as never,
};

const pageOf = (body: Record<string, unknown>): Declaration => ({
  id: 'page.desk',
  kind: 'page',
  body: { page: 'desk', title: 'Desk', requires: ['register.areas', 'register.steps', 'register.lines'], ...body } as never,
});
const blocks = (...b: Record<string, unknown>[]): Declaration => pageOf({ blocks: b });
const lint = (d: Declaration) => validateDeclaration(d);

async function record() {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const out = await k.install([AREAS, STEPS, LINES]);
  assert.ok(out.ok, JSON.stringify(out));
  const made = (register: string, fields: Record<string, unknown>) => {
    const r = k.create(register, fields, OWNER);
    assert.ok(r.ok, JSON.stringify(r));
    return r.value;
  };
  const product = made('areas', { name: 'Product', what: 'The first piece' });
  const box = made('areas', { name: 'Box', what: 'What it ships in' });
  made('steps', { what: 'Cut the pattern', area: product.id, done: true, rank: 1 });
  made('steps', { what: 'Sample the fit', area: product.id, done: false, rank: 2 });
  made('steps', { what: 'Box quote', area: box.id, done: false, rank: 3 });
  made('lines', { item: 'Fabric', low: 100, high: 300, spent: 120 });
  return k;
}

/* ── the lint lines, each a refusal naming the key or an acceptance with a shape check ── */

test('A PAGE NAMING A PACK KIND NOBODY INSTALLED IS REFUSED AT INSTALL, and one a pack declares is admitted', () => {
  const pad = { block: 'pad', title: 'Pad', primitive: 'grid', cells: 3, tone: true, minSpan: 4, purpose: 'figure' };
  const out = validateDeclaration(blocks({ kind: 'block.pad', heading: 'Pad' }), new Map());
  assert.equal(out?.code, 'KIND_UNKNOWN');
  assert.match(out?.fix ?? '', /block\.pad/);
  assert.match(out?.fix ?? '', /no installed pack declares it/);
  /* THE PAGE'S OWN `requires` NEEDS ITS THREE REGISTERS TOO, or this proves nothing about the kind: `pageBody` checks
     every block before it checks `requires` against what is installed (CHECK round 3, "a block-level fault reports
     first"), so leaving them out of `installed` would answer DEPENDENCY_UNRESOLVED here, not the clean admission this
     assertion is about. */
  const withPad = new Map<string, Record<string, Json>>([
    ['block.pad', pad],
    ['register.areas', {}],
    ['register.steps', {}],
    ['register.lines', {}],
  ]);
  assert.equal(validateDeclaration(blocks({ kind: 'block.pad', heading: 'Pad' }), withPad), null);
});

test('A BLOCK KEY NOBODY READS IS REFUSED AT INSTALL, by name, with what to write instead', () => {
  const size = lint(blocks({ kind: 'note', body: 'Hello.', size: 2 }));
  assert.equal(size?.code, 'DECLARATION_INVALID');
  assert.match(size?.fix ?? '', /^page\.desk\.blocks\[0\]: size: is not a key a block has\. A block is made wider with span:/);
  const low = lint(blocks({ kind: 'progress', source: 'register.lines', columns: [{ field: 'item' }, { field: 'spent' }], low: 'low', empty: 'No lines.' }));
  assert.match(low?.fix ?? '', /low: is not a key a block has\. .*range: true/);
  const shows = lint(blocks({ kind: 'queue', source: 'governance.open', shows: 'tiles', empty: 'Nothing waits.' }));
  assert.match(shows?.fix ?? '', /shows: is not a key a block has\. A queue is drawn as tiles with tiles: true/);
});

test('A KEY ONLY A READ ANSWERS IS REFUSED AT INSTALL, and the read still takes it back', async () => {
  /* `{ kind: cards, next: what }` INSTALLED CLEAN AND DREW NOTHING, because the answer's keys were admitted at install
     as well as at read. `next` is what a steps block answers; a card's next step is a column. */
  const next = lint(blocks({ kind: 'cards', source: 'register.areas', next: 'what', empty: 'None.' }));
  assert.equal(next?.code, 'DECLARATION_INVALID');
  assert.equal(next?.at, 'blocks[0].next');
  assert.match(next?.fix ?? '', /next: is not a key a block has. The next step on a card is a column: { field: <a field of the steps list>, as: next }./);
  for (const key of ['rows', 'types', 'queue', 'values', 'done_now', 'matched']) {
    const out = lint(blocks({ kind: 'table', source: 'register.areas', [key]: [], empty: 'None.' }));
    assert.equal(out?.code, 'DECLARATION_INVALID', key);
    assert.match(out?.fix ?? '', new RegExp(`${key}: is not a key a block has\. It is what a read answers`), key);
  }
  /* A BLOCK THAT CAME OUT OF A READ MAY BE READ AGAIN, rows and all, which is why the read keeps the answer's keys. */
  const k = await record();
  const read = k.block({ kind: 'steps', source: 'register.steps', columns: [{ field: 'what' }], empty: 'No steps.' } as never);
  assert.deepEqual(read.refusals, []);
  assert.deepEqual(k.block(read as never).refusals, []);
});

test('A KEY NAMED LIKE ONE EVERY OBJECT INHERITS IS REFUSED IN ITS OWN SENTENCE, with no source code pasted in', () => {
  /* Looked up by bracket, `constructor` found `Object` and the refusal read "constructor: is not a key a block has.
     function Object() { [native code] }". */
  for (const key of ['constructor', 'toString', 'hasOwnProperty', '__proto__']) {
    const block = lint(blocks(JSON.parse(`{ "kind": "note", "body": "x", "${key}": 1 }`)));
    assert.equal(block?.code, 'DECLARATION_INVALID', key);
    assert.match(block?.fix ?? '', new RegExp(`${key}: is not a key a block has\. Take it off;`), key);
    assert.doesNotMatch(block?.fix ?? '', /native code|function/u, key);
    const page = lint({ ...pageOf({ blocks: [{ kind: 'note', body: 'x' }] }), body: JSON.parse(`{ "page": "desk", "title": "Desk", "blocks": [{ "kind": "note", "body": "x" }], "${key}": 1 }`) });
    assert.equal(page?.code, 'DECLARATION_INVALID', key);
    assert.match(page?.fix ?? '', new RegExp(`${key}: is not a key a page has\. Take it off;`), key);
    assert.doesNotMatch(page?.fix ?? '', /native code|function/u, key);
  }
});

test('A KEY ONE KIND READS IS REFUSED ON ANOTHER, naming the kinds that read it', () => {
  const first = lint(blocks({ kind: 'table', source: 'register.steps', first: 3, empty: 'No steps.' }));
  assert.equal(first?.code, 'DECLARATION_INVALID');
  assert.match(first?.fix ?? '', /first: is read by feed, agents and steps blocks, and a table block does nothing with it\. To draw fewer rows, write limit: instead\./);
  assert.equal(lint(blocks({ kind: 'table', source: 'register.steps', tiles: true, empty: 'No steps.' }))?.code, 'DECLARATION_INVALID');
});

test('LEAD ON CARDS AND ON A NOTE, AND FIRST ON STEPS, ARE ADMITTED AND SHAPE-CHECKED', () => {
  assert.equal(lint(blocks({ kind: 'cards', source: 'register.areas', lead: true, columns: [{ field: 'name', as: 'title' }], empty: 'None.' })), null);
  assert.equal(lint(blocks({ kind: 'note', lead: true, body: 'Where things stand.' })), null);
  assert.equal(lint(blocks({ kind: 'cards', source: 'register.areas', lead: 'yes', empty: 'None.' }))?.code, 'DECLARATION_INVALID');
  assert.equal(lint(blocks({ kind: 'steps', source: 'register.steps', first: 3, empty: 'No steps.' })), null);
  assert.equal(lint(blocks({ kind: 'steps', source: 'register.steps', first: 0, empty: 'No steps.' }))?.code, 'OUT_OF_BOUNDS');
});

test('A PAGE KEY NOBODY READS IS REFUSED BY NAME, and tabs are said in nav', () => {
  const tabs = lint(pageOf({ tabs: ['desk', 'numbers'], blocks: [{ kind: 'note', body: 'x' }] }));
  assert.equal(tabs?.code, 'DECLARATION_INVALID');
  assert.match(tabs?.fix ?? '', /tabs: is not a key a page has\. Tabs are a nav section drawn as a strip: nav: \{ section, order, tabs: true \}/);
  assert.equal(lint(pageOf({ nav: { section: 'Launch', order: 10, tabs: true }, blocks: [{ kind: 'note', body: 'x' }] })), null);
  assert.equal(lint(pageOf({ nav: { section: 'Launch', order: 10, tabs: 'yes' }, blocks: [{ kind: 'note', body: 'x' }] }))?.code, 'DECLARATION_INVALID');
  assert.equal(lint(pageOf({ nav: { section: 'Launch', order: 10, tab: true }, blocks: [{ kind: 'note', body: 'x' }] }))?.code, 'DECLARATION_INVALID');
  /* PUBLISHED AND DRAWN BY NOTHING: the repair is a build that draws it, so the code says wait rather than you made it up. */
  assert.equal(lint(pageOf({ filters: [], blocks: [{ kind: 'note', body: 'x' }] }))?.code, 'NOT_IN_THIS_BUILD');
});

test('A LAYOUT IS A RAIL OF THREE TO FIVE TWELFTHS, and a block in the rail needs one', () => {
  const note = { kind: 'note', body: 'x' };
  assert.equal(lint(pageOf({ layout: { rail: 4 }, blocks: [note, { ...note, area: 'rail' }] })), null);
  assert.equal(lint(pageOf({ layout: { rail: 4, sticky: true }, blocks: [note] })), null);
  assert.equal(lint(pageOf({ layout: { rail: 13 }, blocks: [note] }))?.code, 'OUT_OF_BOUNDS');
  assert.equal(lint(pageOf({ layout: { rail: 4, sticky: 'yes' }, blocks: [note] }))?.code, 'DECLARATION_INVALID');
  assert.equal(lint(pageOf({ layout: { rail: 4, gap: 2 }, blocks: [note] }))?.code, 'DECLARATION_INVALID');
  const lost = lint(pageOf({ blocks: [{ ...note, area: 'rail' }] }));
  assert.equal(lost?.code, 'DECLARATION_INVALID');
  assert.match(lost?.fix ?? '', /layout: \{ rail: 4 \}/);
  assert.equal(lint(pageOf({ layout: { rail: 4 }, blocks: [{ ...note, area: 'side' }] }))?.code, 'DECLARATION_INVALID');
});

test('THE NEW WORDS INSTALL: next and reply on a card, box on a section, tiles on a queue, range on progress, and the kind inputs', () => {
  assert.equal(lint(blocks({ kind: 'cards', source: 'register.areas', columns: [{ field: 'name', as: 'title' }, { field: 'what', as: 'next' }, { field: 'what', as: 'reply' }], empty: 'None.' })), null);
  assert.equal(lint(blocks({ kind: 'section', heading: 'Now', box: true })), null);
  assert.equal(lint(blocks({ kind: 'queue', source: 'governance.open', tiles: true, empty: 'Nothing waits.' })), null);
  const range = { kind: 'progress', source: 'register.lines', range: true, empty: 'No lines.' };
  assert.equal(lint(blocks({ ...range, columns: [{ field: 'item' }, { field: 'spent' }, { field: 'low' }, { field: 'high' }] })), null);
  assert.match(lint(blocks({ ...range, columns: [{ field: 'item' }, { field: 'spent' }, { field: 'high' }] }))?.fix ?? '', /four columns: the label, what was spent, the low and the high/);
  assert.equal(lint(blocks({ kind: 'inputs', register: 'lines', columns: [{ field: 'low' }, { field: 'high' }] })), null);
  assert.equal(lint(blocks({ kind: 'inputs', register: 'checks' }))?.code, 'DEPENDENCY_UNRESOLVED');
});

test('A LIST OF STEPS MAY SAY WHICH FIELD ORDERS THEM, and it is a field of the list', () => {
  const ordered = (order: unknown): Declaration => ({ ...STEPS, body: { ...(STEPS.body as object), steps: { of: 'area', done: 'done', order } } as never });
  assert.equal(lint(ordered('rank')), null);
  const wrong = lint(ordered('nosuch'));
  assert.equal(wrong?.code, 'DECLARATION_INVALID');
  assert.match(wrong?.fix ?? '', /order/);
});

/* ── what the record answers ── */

test('A CARD ANSWERS ITS NEXT STEP: the first step under it that is not done, in the order the steps declare', async () => {
  const k = await record();
  const out = k.block({
    kind: 'cards',
    source: 'register.areas',
    order: [{ field: 'seq', dir: 'asc' }],
    columns: [{ field: 'name', as: 'title' }, { field: 'what', as: 'next' }],
    empty: 'No parts yet.',
  } as never);
  assert.deepEqual(out.refusals, []);
  assert.deepEqual(out.nexts, ['Sample the fit', 'Box quote']);
  /* THE ORDER IS THE STEPS LIST'S `order:` AND NOT THE ORDER THEY WERE WRITTEN IN. Every area above has one open step,
     so the answer above held with the rank ignored altogether (measured: `nextSteps` sorting by `seq` alone left this
     test green). A step ranked first and written last is the one that tells them apart. */
  const box = k.list({ register: 'areas', where: { field: 'name', is: 'Box' } });
  assert.ok(box.ok && box.value.rows[0], JSON.stringify(box));
  assert.ok(k.create('steps', { what: 'Pick a board', area: box.value.rows[0].id, done: false, rank: 0 }, OWNER).ok);
  const ranked = k.block({ kind: 'cards', source: 'register.areas', order: [{ field: 'seq', dir: 'asc' }], columns: [{ field: 'name', as: 'title' }, { field: 'what', as: 'next' }], empty: 'None.' } as never);
  assert.deepEqual(ranked.nexts, ['Sample the fit', 'Pick a board']);
  /* A FIELD THE STEPS LIST LACKS IS REFUSED, and it is the steps list that is named, not the list the cards are over. */
  const missing = k.block({ kind: 'cards', source: 'register.areas', columns: [{ field: 'name', as: 'title' }, { field: 'cost', as: 'next' }], empty: 'None.' } as never);
  assert.equal(missing.refusals[0]?.code, 'FIELD_UNKNOWN');
  assert.match(missing.refusals[0]?.fix ?? '', /steps has no field called cost/);
});

test('A PATH ANSWERS WHICH ROWS ARE DONE AND WHICH IS NEXT, and first: n is the short view of the open rows', async () => {
  const k = await record();
  const path = { kind: 'steps', source: 'register.steps', columns: [{ field: 'what' }], order: [{ field: 'rank', dir: 'asc' }], empty: 'No steps.' };
  const long = k.block(path as never);
  assert.deepEqual(long.refusals, []);
  assert.deepEqual(long.done_now, [true, false, false]);
  assert.equal(long.next, 1);
  const short = k.block({ ...path, first: 1 } as never);
  assert.deepEqual(short.refusals, []);
  assert.deepEqual(short.rows.map((r) => r.fields.what), ['Sample the fit']);
  assert.equal(short.matched, 3);
  /* AND HOW MANY OF THOSE ARE OPEN, which the short view's "more" is counted from: `matched` holds the done step too. */
  assert.equal(short.open, 2);
  assert.equal(long.open, undefined, 'a path drawn whole leaves nothing out, and is not asked');
  assert.deepEqual(short.done_now, [false]);
  assert.equal(short.next, 0);
  /* THE OPEN ROWS ARE ASKED FOR BEFORE THE LIMIT CUTS THE READ. Cut after it, `limit: 1` read the done step alone and
     the short view answered no rows while two steps were open. */
  const cut = k.block({ ...path, first: 2, limit: 1 } as never);
  assert.deepEqual(cut.refusals, []);
  assert.deepEqual(cut.rows.map((r) => r.fields.what), ['Sample the fit']);
  assert.equal(cut.matched, 3);
  assert.equal(cut.open, 2, 'the limit cuts the rows read and not the count of the open ones');
  assert.equal(cut.next, 0);
  assert.deepEqual(k.block({ ...path, first: 2 } as never).rows.map((r) => r.fields.what), ['Sample the fit', 'Box quote']);
  /* A LIST THAT SAYS NOTHING IS DONE HAS NO OPEN ROWS TO CUT, so the short view is refused rather than drawn long. */
  const lines = k.block({ kind: 'steps', source: 'register.lines', first: 1, empty: 'None.' } as never);
  assert.equal(lines.refusals[0]?.code, 'DECLARATION_INVALID');
  assert.match(lines.refusals[0]?.fix ?? '', /write limit: instead/);
});

test('THE READ REFUSES A KEY ON A KIND THAT DOES NOT READ IT, as the install does', async () => {
  const k = await record();
  const out = k.block({ kind: 'cards', source: 'register.areas', since: 'seen', empty: 'None.' } as never);
  assert.equal(out.refusals[0]?.at, 'since');
  /* A KEY NAMED LIKE ONE EVERY OBJECT INHERITS IS STILL A KEY NOBODY READS. Looked up by bracket in the kinds table, it
     found `Object.prototype.toString` and the read threw `kinds.includes is not a function` where it used to refuse. */
  for (const key of ['toString', 'constructor', 'hasOwnProperty']) {
    const odd = k.block({ kind: 'note', body: 'x', [key]: 1 } as never);
    assert.equal(odd.refusals[0]?.at, key);
  }
  /* A PACK'S OWN KIND READS LIKE ANY OTHER once its declaration is installed (`declare.ts` `pageBody`), so a
     `block.pad` naming a register draws its rows through the same fall-through a `table` does, with no refusal. */
  const pack = k.block({ kind: 'block.pad', source: 'register.areas' } as never);
  assert.deepEqual(pack.refusals, []);
  assert.ok(pack.rows.length > 0);
});

test('AN OPTION IS SHOWN AS WHAT IT IS, and a question may say what it is about, which a queue filters on', async () => {
  const k = await record();
  const filed = k.propose(
    {
      question: 'Which lining?',
      body_kind: 'options',
      body: {
        about: 'Box',
        options: [
          { id: 'sand', label: 'Sand', because: 'Matches the card', recommended: true, shows: { swatch: ['#d8c3a5'] } },
          { id: 'ink', label: 'Ink', because: 'Hides wear', shows: { figure: '2 weeks longer' } },
        ],
      },
    },
    'slash',
  );
  assert.ok(filed.ok, JSON.stringify(filed));
  const other = k.propose({ question: 'Which fabric?', body_kind: 'options', body: { about: 'Product', options: [{ id: 'a', label: 'A', because: 'x' }, { id: 'b', label: 'B', because: 'y' }] } }, 'slash');
  assert.ok(other.ok, JSON.stringify(other));
  const queue = k.block({ kind: 'queue', source: 'governance.open', where: 'about is Box', tiles: true, empty: 'Nothing waits.' } as never);
  assert.deepEqual(queue.refusals, []);
  assert.deepEqual(queue.queue?.map((q) => q.question), ['Which lining?']);
  assert.equal(queue.queue?.[0]?.about, 'Box');
  assert.deepEqual(queue.queue?.[0]?.options.map((o) => o.shows), [{ swatch: ['#d8c3a5'] }, { figure: '2 weeks longer' }]);
  /* A SWATCH IS A COLOUR FROM DATA, so it is held to the one spelling a drawer can put inside a box and nothing else. */
  const bad = k.propose({ question: 'Which?', body_kind: 'options', body: { options: [{ id: 'a', label: 'A', because: 'x', shows: { swatch: ['red; background: url(x)'] } }, { id: 'b', label: 'B', because: 'y' }] } }, 'slash');
  assert.equal(bad.ok, false);
  assert.match(JSON.stringify(bad), /swatch/);
});

test('INPUTS READ ONE ROW AND SAY EACH FIELD\'S TYPE, the first row of the list when none is named', async () => {
  const k = await record();
  const out = k.block({ kind: 'inputs', register: 'lines', columns: [{ field: 'low' }, { field: 'high' }, { field: 'spent' }] } as never);
  assert.deepEqual(out.refusals, []);
  assert.deepEqual(out.rows.map((r) => r.fields.item), ['Fabric']);
  assert.deepEqual(out.types, { low: 'int', high: 'int', spent: 'int' });
  const named = k.block({ kind: 'inputs', register: 'lines', row: 'lines#1', columns: [{ field: 'low' }] } as never);
  assert.deepEqual(named.rows.map((r) => r.fields.item), ['Fabric']);
  const ref = k.block({ kind: 'inputs', register: 'lines', columns: [{ field: 'area' }] } as never);
  assert.equal(ref.refusals[0]?.code, 'DECLARATION_INVALID');
  /* WITH NO COLUMNS THE TYPABLE FIELDS ARE DRAWN, and the ref a named column is refused for is left out rather than
     handed to the host as a box to type a row id into. */
  const whole = k.block({ kind: 'inputs', register: 'lines' } as never);
  assert.deepEqual(whole.refusals, []);
  assert.deepEqual(whole.types, { item: 'text', low: 'int', high: 'int', spent: 'int' });
});

test("INPUTS SAY THE RECORD'S HOME CURRENCY BESIDE THE TYPES, so a bare figure in an empty money box is written in it and never in GBP", async () => {
  /* MEASURED: an EGP record stored a cost typed 1200 as GBP 1,200.00, because the browser's guess at the home currency
     read rows a shipped build never holds. */
  const k = await record();
  const inputs = { kind: 'inputs', register: 'lines', columns: [{ field: 'low' }] } as never;
  assert.equal(k.block(inputs).home, null, 'a record with no home currency answered one');
  k.rememberPack({
    id: 'money-core',
    version: '1.0.0',
    source: 'local',
    ref: null,
    manifest: jcs({ pack: 'money-core', version: '1.0.0', config: { home_currency: { type: 'text' } } }),
    checksum: 'not-a-real-checksum',
  });
  assert.ok(k.setPackConfig('money-core', { home_currency: 'EGP' }, { actor: 'p_1' }).ok);
  assert.equal(k.block(inputs).home, 'EGP');
});

test('A RANGE READS FIGURES: a column of text where a low should be is refused on the block', async () => {
  const k = await record();
  const ok = k.block({ kind: 'progress', source: 'register.lines', range: true, columns: [{ field: 'item' }, { field: 'spent' }, { field: 'low' }, { field: 'high' }], empty: 'No lines.' } as never);
  assert.deepEqual(ok.refusals, []);
  assert.equal(ok.matched, 1);
  const wrong = k.block({ kind: 'progress', source: 'register.lines', range: true, columns: [{ field: 'item' }, { field: 'spent' }, { field: 'item' }, { field: 'high' }], empty: 'No lines.' } as never);
  assert.equal(wrong.refusals[0]?.code, 'DECLARATION_INVALID');
});
