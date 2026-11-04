/**
 * The new answers a built page gets, from the record through this app to the fence the renderer draws (the app half).
 *
 * WHAT THIS FILE MEASURED AGAINST THE TREE BEFORE IT, over the record below. The kernel already answered every one
 * of these (`nexts`, `done_now` and `next`, `shows`, `range`, `types`), and the renderer already drew every form
 * (`cards lead`, `steps path`, `queue tiles`, `progress range`, `note lead`, `inputs`), and nothing between them wrote
 * a single one. Run against that `blocks.ts`, every fence came back with no form at all; the lead note read
 * "1 essential step(s) done"; the `inputs` block, which has no `source:`, drew "Nothing matched." over the row the
 * kernel had handed it; and once the forms were written, the card's `as: next` column still reached the fence as
 * `fact: Next` over the card's own `what`, "The first piece" where the record answered "Sample the fit", because
 * `page-live.ts` dropped the two roles added before it.
 *
 * EVERY BLOCK GOES THROUGH THE RECORD'S OWN PAGE READ, `blockOf` AND `draw`, because a hand-made answer would pass
 * while the page read, the app's narrowing or the fence writer threw a key away. The lists are invented and name
 * nobody.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { openRecord, type Declaration } from '@braindog/kernel';
import { toHTML, type Block } from 'braindog-render';

import { REGISTERS } from './held.ts';
import { blockOf, resolverOf, type LiveBlock } from './page-live.ts';
import { draw } from './blocks.ts';

const NOW = Date.UTC(2026, 8, 25, 12);
const OWNER = { actor: 'p_1' };

type Sql = Parameters<typeof openRecord>[0];

/** The same shim the other cross-engine tests in this directory open a record on. */
function openSqlite(): Sql {
  const db = new DatabaseSync(':memory:');
  let depth = 0;
  return {
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
  } as unknown as Sql;
}

const AREAS = { id: 'areas', name: 'Areas', one: 'area', title: 'name', fields: [{ id: 'name', type: 'text', required: true }, { id: 'what', type: 'text' }] };
const STEPS = {
  id: 'steps',
  name: 'Steps',
  one: 'step',
  title: 'what',
  fields: [
    { id: 'what', type: 'text', required: true },
    { id: 'area', type: 'ref', to: 'areas' },
    { id: 'done', type: 'bool' },
    { id: 'rank', type: 'int' },
  ],
  steps: { of: 'area', done: 'done', order: 'rank' },
};
const LINES = {
  id: 'lines',
  name: 'Lines',
  one: 'line',
  title: 'item',
  fields: [
    { id: 'item', type: 'text', required: true },
    { id: 'spent', type: 'money' },
    { id: 'low', type: 'money' },
    { id: 'high', type: 'money' },
  ],
};
const CHECKS = {
  id: 'checks',
  name: 'Checks',
  one: 'check',
  title: 'name',
  fields: [
    { id: 'name', type: 'text', required: true },
    { id: 'price', type: 'money' },
    { id: 'stage', type: 'enum', values: ['idea', 'sample', 'made'] },
    { id: 'launched', type: 'bool' },
  ],
};

const register = (body: { id: string }): Declaration => ({ id: `register.${body.id}`, kind: 'register', body: body as never });

/* THE FIGURES A LEAD SENTENCE SAYS, each a count over the steps. */
const metric = (id: string, where: string | undefined): Declaration => ({
  id: `metric.${id}`,
  kind: 'metric',
  body: { metric: id, name: id, source: 'register.steps', ...(where ? { where } : {}), value: { count: 'what' }, format: 'int', target: { gte: 0 }, window: '30d' } as never,
});

const pound = (major: number) => ({ amount: Math.round(major * 100), currency: 'GBP' });

const DESK: Record<string, unknown>[] = [
  { kind: 'note', lead: true, heading: 'Lead', body: '{{must-done}} essential step(s) done' },
  { kind: 'note', lead: true, heading: 'Two figures', body: '{{must-done}} of the {{must-all}} essential step(s) are done, {{must-done}} ticked' },
  { kind: 'cards', lead: true, heading: 'Parts', source: 'register.areas', order: [{ field: 'seq', dir: 'asc' }], columns: [{ field: 'name', as: 'title' }, { field: 'what', as: 'next', label: 'Next' }], empty: 'No parts.' },
  { kind: 'steps', heading: 'Path', source: 'register.steps', columns: [{ field: 'what' }], empty: 'No steps.' },
  { kind: 'steps', heading: 'Short', source: 'register.steps', first: 1, columns: [{ field: 'what' }], empty: 'No steps.' },
  { kind: 'queue', heading: 'Calls', source: 'governance.open', tiles: true, empty: 'Nothing waits.' },
  { kind: 'progress', heading: 'Budget', source: 'register.lines', range: true, order: [{ field: 'seq', dir: 'asc' }], columns: [{ field: 'item' }, { field: 'spent' }, { field: 'low' }, { field: 'high' }], empty: 'No lines.' },
  { kind: 'inputs', heading: 'Check', register: 'checks', columns: [{ field: 'price' }, { field: 'stage' }, { field: 'launched' }] },
];

async function desk(done: boolean): Promise<LiveBlock[]> {
  const k = await openRecord(openSqlite(), { now: () => NOW });
  const page: Declaration = {
    id: 'page.desk',
    kind: 'page',
    body: { page: 'desk', title: 'Desk', requires: ['register.areas', 'register.steps', 'register.lines', 'register.checks'], blocks: DESK } as never,
  };
  const out = await k.install([register(AREAS), register(STEPS), register(LINES), register(CHECKS), metric('must-done', 'done is true'), metric('must-all', undefined), page]);
  assert.ok(out.ok, JSON.stringify(out));
  const made = (reg: string, fields: Record<string, unknown>) => {
    const r = k.create(reg, fields, OWNER);
    assert.ok(r.ok, JSON.stringify(r));
    return r.value as { id: string };
  };
  const product = made('areas', { name: 'Product', what: 'The first piece' });
  const box = made('areas', { name: 'Box', what: 'What it ships in' });
  made('steps', { what: 'Cut the pattern', area: product.id, done, rank: 1 });
  made('steps', { what: 'Sample the fit', area: product.id, done: false, rank: 2 });
  made('steps', { what: 'Box quote', area: box.id, done: false, rank: 3 });
  made('lines', { item: 'Fabric', spent: pound(120.5), low: pound(100), high: pound(300) });
  made('lines', { item: 'Print', low: pound(40), high: pound(80) });
  made('checks', { name: 'Price check', price: pound(1200), stage: 'sample', launched: false });
  const filed = k.propose(
    {
      question: 'Which lining?',
      body_kind: 'options',
      body: {
        options: [
          { id: 'sand', label: 'Sand', because: 'Matches the card', recommended: true, shows: { swatch: ['#d8c3a5'] } },
          { id: 'ink', label: 'Ink', because: 'Hides wear', shows: { figure: '2 weeks longer' } },
        ],
      },
    },
    'slash',
  );
  assert.ok(filed.ok, JSON.stringify(filed));

  for (const decl of [AREAS, STEPS, LINES, CHECKS]) REGISTERS[decl.id] = decl as never;
  const read = k.page('desk') as { ok: boolean; value: { blocks: Record<string, unknown>[] } };
  assert.ok(read.ok, JSON.stringify(read));
  return read.value.blocks.map((b) => blockOf(b as never, new Map(), NOW));
}

const named = (blocks: LiveBlock[], heading: string): LiveBlock => {
  const found = blocks.find((b) => b.heading === heading);
  assert.ok(found, `no block called ${heading}`);
  assert.deepEqual(found.refusals, [], `${heading} was refused: ${found.refusals.join(' ')}`);
  return found;
};

/** The one fence a block draws, as the renderer parsed it. */
function fence(block: LiveBlock): Block {
  const { segments, refusal } = draw(block);
  assert.equal(refusal, null, `${block.heading} drew a refusal: ${JSON.stringify(refusal)}`);
  const drawn = segments.filter((s): s is Block => s.type === 'block');
  assert.equal(drawn.length, 1, `${block.heading} drew ${JSON.stringify(segments)}`);
  return drawn[0]!;
}

const cells = (b: Block): string[][] => b.rows.map((r) => r.cells.map((c) => c.trim()));

/* ── the lead sentence ──────────────────────────────────────────────────── */

test('A LEAD NOTE SAYS ITS FIGURES AS A SENTENCE: one step, not one step(s), and a clause of noughts goes', async () => {
  /* THE SENTENCE AS A READER HEARS IT: the renderer wraps each figure in its own span, which is drawing, not words. */
  const said = (block: LiveBlock) => toHTML([fence(block)], { resolve: resolverOf(block.values) } as never).replace(/<(?!\/?p>)[^>]+>/gu, '');
  const one = named(await desk(true), 'Lead');
  assert.match(said(one), /<p>1 essential step done\.<\/p>/u);
  assert.equal(fence(one).form, 'lead', 'the lead note is drawn as the lead form');

  /* THE NUMBER BEFORE THE WORD IS THE ONE THAT COUNTS IT, and "of the 3 essential" is three steps, whatever came first. */
  assert.match(said(named(await desk(true), 'Two figures')), /<p>1 of the 3 essential steps are done, 1 ticked\.<\/p>/u);

  /* WITH NONE DONE THE CLAUSE GOES, and here it is the whole sentence, so the note has nothing to say. */
  const none = await desk(false);
  const gone = named(none, 'Lead');
  assert.equal(gone.drawn, false, 'a lead with nothing left to say is not drawn, as a note whose when: said no is not');
  assert.doesNotMatch(toHTML(draw(gone).segments), /essential/u);
  assert.match(said(named(none, 'Two figures')), /<p>0 of the 3 essential steps are done\.<\/p>/u, 'only the clause whose every figure is nought goes');
});

/* ── the next step on a card, and the lead card ─────────────────────────── */

test('A CARD SAYS ITS NEXT STEP, from the record\'s nexts, and the first card is the lead', async () => {
  const b = fence(named(await desk(true), 'Parts'));
  assert.equal(b.form, 'lead');
  assert.deepEqual(cells(b), [
    ['title: Area', 'next: Next'],
    ['[Product](/r/areas/1)', 'Sample the fit'],
    ['[Box](/r/areas/2)', 'Box quote'],
  ]);
});

/* ── the path ───────────────────────────────────────────────────────────── */

test('A PATH MARKS ITS STEPS DONE AND NEXT from the record, and its short view counts the rest', async () => {
  const blocks = await desk(true);
  const long = fence(named(blocks, 'Path'));
  assert.equal(long.form, 'path');
  assert.deepEqual(cells(long), [
    ['Cut the pattern', '', 'done'],
    ['Sample the fit', '', 'next'],
    ['Box quote', '', ''],
  ]);
  const short = named(blocks, 'Short');
  /* ONE OF THE THREE IS DONE, SO ONE OPEN STEP IS LEFT OUT. It said 2, the whole list less the one drawn, which counted
     the done step as a step still to come. */
  assert.deepEqual(cells(fence(short)), [
    ['Sample the fit', '', 'next'],
    ['more', '1'],
  ]);
  /* THE COUNT IS THE PATH'S OWN, so the page's "Showing 1 of 3" is not said under it a second time. */
  assert.equal(short.shown, short.total, 'the path says how many more itself');
});

test('THE SHORT VIEW\'S "more" COUNTS THE OPEN STEPS IT LEFT OUT, and a done step is never one of them', async () => {
  /* MEASURED ON THE TREE BEFORE THIS: 5 steps with 2 done under `first: 2` drew S3 and S4 and `more | 3`, where only S5
     was left out, and 2 steps all done under `first: 1` drew only `more | 2`. The renderer says the number is how many
     open steps the short view left out (`render/src/path.ts`), so the record now says how many are open (`open`). */
  const path = async (done: boolean[], first: number): Promise<LiveBlock> => {
    const k = await openRecord(openSqlite(), { now: () => NOW });
    const page: Declaration = {
      id: 'page.path',
      kind: 'page',
      body: { page: 'path', title: 'Path', requires: ['register.areas', 'register.steps'], blocks: [{ kind: 'steps', heading: 'Short', source: 'register.steps', first, columns: [{ field: 'what' }], empty: 'No steps left.' }] } as never,
    };
    const out = await k.install([register(AREAS), register(STEPS), page]);
    assert.ok(out.ok, JSON.stringify(out));
    const area = k.create('areas', { name: 'Product' }, OWNER);
    assert.ok(area.ok);
    done.forEach((d, i) => assert.ok(k.create('steps', { what: `S${i + 1}`, area: (area.value as { id: string }).id, done: d, rank: i + 1 }, OWNER).ok));
    for (const decl of [AREAS, STEPS]) REGISTERS[decl.id] = decl as never;
    const read = k.page('path') as { ok: boolean; value: { blocks: Record<string, unknown>[] } };
    assert.ok(read.ok, JSON.stringify(read));
    return named(read.value.blocks.map((b) => blockOf(b as never, new Map(), NOW)), 'Short');
  };
  assert.deepEqual(cells(fence(await path([true, true, false, false, false], 2))), [
    ['S3', '', 'next'],
    ['S4', '', ''],
    ['more', '1'],
  ]);
  /* NONE LEFT OUT, NO COUNT. */
  assert.deepEqual(cells(fence(await path([true, false, false], 2))), [
    ['S2', '', 'next'],
    ['S3', '', ''],
  ]);
  /* EVERY STEP DONE: nothing open, so nothing more, and no count of done steps standing alone. */
  const all = draw(await path([true, true], 1));
  assert.doesNotMatch(JSON.stringify(all.segments), /more/u);
});

/* ── an option shown as what it is ──────────────────────────────────────── */

test('AN OPTION CARRIES WHAT IT IS in its seventh cell, and tiles are the queue\'s form', async () => {
  const b = fence(named(await desk(true), 'Calls'));
  assert.equal(b.form, 'tiles');
  const opts = cells(b).filter((c) => c[0] === 'opt');
  assert.deepEqual(opts.map((c) => [c[2], c[6]]), [['sand', 'swatch:#d8c3a5'], ['ink', 'figure:2 weeks longer']]);
});

/* ── ranges against spend ───────────────────────────────────────────────── */

test('A RANGE IS WRITTEN label, spent, low and high, each figure the record\'s own', async () => {
  const b = fence(named(await desk(true), 'Budget'));
  assert.equal(b.form, 'range');
  /* THE FIGURES ARE THE RECORD'S MINOR UNITS SAID ONCE: 12050 pence is £120.50, and a line with nothing spent says
     nothing rather than nought, which the drawer reads as "Not spent". The page says money as every other cell on it
     does (`symbolText`), and a currency that is not the home's is said by its own sign and no code (b77e6330c).
     A RANGE IS NOT A LEDGER, so a round figure is said without its ".00", as a sentence says it: only a table keeps its
     pence (`exactness` in `blocks.ts`). */
  const gbp = (figure: string) => `£${figure}`;
  assert.deepEqual(cells(b), [
    ['Fabric', gbp('120.50'), gbp('100'), gbp('300')],
    ['Print', '', gbp('40'), gbp('80')],
  ]);
  const html = toHTML([b]);
  assert.match(html, /£120\.50 spent/u);
  assert.match(html, /£140\.00 to £380\.00/u, 'the total line adds the lows and the highs of the rows as written');
  /* ONE SCALE, THE LARGEST FIGURE, £300: the fabric's band runs from a third of it to the end, and its spend sits at 0.40. */
  assert.match(html, /--from:0\.33;--to:1\.00"><span class="progress-band"><\/span><span class="progress-at" style="--at:0\.40">/u);
});

/**
 * One range over a list of budget lines typed as the caller says, read through the record's page, `blockOf` and `draw`,
 * and said as a reader hears it.
 */
async function budget(types: { spent: string; low: string; high: string }, lines: Record<string, unknown>[]): Promise<{ refusals: unknown[]; words: string; html: string }> {
  const LEDGER = { ...LINES, fields: [{ id: 'item', type: 'text', required: true }, ...(['spent', 'low', 'high'] as const).map((id) => ({ id, type: types[id] }))] };
  const k = await openRecord(openSqlite(), { now: () => NOW });
  const page: Declaration = {
    id: 'page.budget',
    kind: 'page',
    body: { page: 'budget', title: 'Budget', requires: ['register.lines'], blocks: [DESK.find((b) => b.heading === 'Budget')] } as never,
  };
  const out = await k.install([register(LEDGER), page]);
  assert.ok(out.ok, JSON.stringify(out));
  for (const line of lines) assert.ok(k.create('lines', line, OWNER).ok);
  REGISTERS.lines = LEDGER as never;
  const read = k.page('budget') as { ok: boolean; value: { blocks: Record<string, unknown>[] } };
  assert.ok(read.ok, JSON.stringify(read));
  const block = blockOf(read.value.blocks[0] as never, new Map(), NOW);
  REGISTERS.lines = LINES as never;
  const html = toHTML([fence(block)]);
  return { refusals: block.refusals, words: html.replace(/<[^>]+>/gu, ' ').replace(/\s+/gu, ' ').trim(), html };
}

test('THE LAUNCH DESK\'S BUDGET TOTAL IS THE SUM OF ITS LINES, drawn to the place of the finest one', async () => {
  /* THE LINES THE AUDIT TYPED INTO THE SHIPPED DESK, whose budget fields are decimals. The Numbers page drew
     `Total 181 spent 251 to 421`, the sum rounded to the first line's whole number, where the lines add to 181.499,
     250.989 and 421.499. */
  const decimal = { spent: 'decimal', low: 'decimal', high: 'decimal' };
  const { words } = await budget(decimal, [
    { item: 'Wax', low: 150, high: 300, spent: 180 },
    { item: 'Labels', low: 99.99, high: 120.5, spent: 0.5 },
    { item: 'Boxes', low: 0.333, high: 0.333, spent: 0.333 },
    { item: 'Ribbon', low: 0.333, high: 0.333, spent: 0.333 },
    { item: 'Card', low: 0.333, high: 0.333, spent: 0.333 },
  ]);
  assert.match(words, /Total 181\.499 spent 250\.989 to 421\.499$/u);
});

test('A RANGE OF MONEY BESIDE PLAIN NUMBERS IS SAID TO BE ONE, not drawn as if nothing were spent', async () => {
  /* MEASURED AT HEAD: the record answered this block with no refusal (`rangeFault` compares currencies only among money
     values), and the page drew every spent mark at `0.00` and a total of dashes. The record still answers it, so the
     drawing is where it is refused. */
  const { refusals, words, html } = await budget({ spent: 'money', low: 'int', high: 'int' }, [
    { item: 'Wax', spent: pound(120.5), low: 10000, high: 30000 },
    { item: 'Box', spent: pound(50), low: 4000, high: 8000 },
  ]);
  assert.deepEqual(refusals, [], 'the record answers this block, so the drawing is the only place it is refused');
  assert.doesNotMatch(html, /progress-track|data-total/u);
  assert.match(words, /not all in one unit, money beside plain numbers or two currencies, so they are not drawn on one scale or added up\.$/u);
});

/* ── inputs ─────────────────────────────────────────────────────────────── */

test('INPUTS ARE ONE ROW\'S FIELDS, field, label, type and value, and each row names the record row it edits', async () => {
  const block = named(await desk(true), 'Check');
  const b = fence(block);
  assert.deepEqual(cells(b), [
    ['price', 'Price', 'money', 'GBP 1,200.00'],
    ['stage', 'Stage', 'enum:idea,sample,made', 'sample'],
    ['launched', 'Launched', 'bool', 'false'],
  ]);
  assert.deepEqual(b.rows.map((r) => r.ref && [r.ref.register, r.ref.seq, r.ref.version]), [['checks', 1, 1], ['checks', 1, 1], ['checks', 1, 1]]);
  /* AND THE RECORD'S HOME CURRENCY, as the kernel answers it beside the types, which a bare figure is written in: none is set here. */
  assert.equal(block.home, null);
});

/* ── who was in touch ───────────────────────────────────────────────────── */

test('A HEAT WITH who: true IS DRAWN A LINE A PERSON, its rows the day and then who', async () => {
  const CONTACTS = {
    id: 'contacts',
    name: 'Contacts',
    one: 'contact',
    title: 'name',
    fields: [{ id: 'name', type: 'text', required: true }, { id: 'in_touch', type: 'day' }],
  };
  const k = await openRecord(openSqlite(), { now: () => NOW });
  const page: Declaration = {
    id: 'page.circle',
    kind: 'page',
    body: {
      page: 'circle',
      title: 'Circle',
      requires: ['register.contacts'],
      blocks: [
        { kind: 'heat', heading: 'In touch', who: true, source: 'register.contacts', columns: [{ field: 'in_touch' }, { field: 'name' }], empty: 'Nobody.' },
      ],
    } as never,
  };
  const out = await k.install([register(CONTACTS), page]);
  assert.ok(out.ok, JSON.stringify(out));
  for (const [name, in_touch] of [['Ada', '2026-09-22'], ['Bo', '2026-09-03']]) assert.ok(k.create('contacts', { name, in_touch }, OWNER).ok);
  REGISTERS.contacts = CONTACTS as never;
  const read = k.page('circle') as { ok: boolean; value: { blocks: Record<string, unknown>[] } };
  assert.ok(read.ok, JSON.stringify(read));
  const b = fence(named(read.value.blocks.map((x) => blockOf(x as never, new Map(), NOW)), 'In touch'));
  assert.equal(b.form, 'who');
  assert.deepEqual(cells(b).map((c) => c[1]).sort(), ['Ada', 'Bo']);
  const html = toHTML([b], { today: '2026-09-25' } as never);
  assert.match(html, /data-form="who"/u);
  assert.match(html, /class="heat-who">Ada</u);
});
