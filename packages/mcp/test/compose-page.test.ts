/**
 * An agent composes a launch desk from a description, over MCP, and the owner's accept installs it.
 *
 * THE TOOL CALLS A MODEL WOULD MAKE, IN THE ORDER IT WOULD MAKE THEM, against a real record: read the page grammar,
 * try the desk whole over sample rows with a part page drawn over one part, file its lists, let the owner accept, read
 * a schema, file the pages, and read them back installed. Nothing here calls the kernel to install anything; the only
 * writes that are not `propose` are the owner's presses in Decide and the rows she types in.
 *
 * FROM THE DECLARATION THE LAUNCH DESK SHIPS, `packs/launch-desk/launch-desk.pack.json`, read as it is on disk each run, with
 * the pad's list of notes from `packs/pad/pad.pack.json`, which the desk requires. `declarationOf` turns a pack's
 * declaration into a change's the way `readPack` stores it. Which blocks to look at is found by heading, never by
 * position, so the pack may grow a block without this file being told.
 *
 * RED BEFORE THE LAYOUT WORDS, MEASURED. This file and the two pack files, run against a record that did not yet read
 * them, failed at the lists: accepting them was refused `DECLARATION_INVALID` at
 * `steps`, "steps says its rows are steps. Say which ref field names the row each belongs to and which bool field says
 * it is done, as { of: thing, done: done }.", since `steps: { order }` is itself one of those words. With `order` taken
 * off, each page's preview was refused whole, one sentence each, since the lint answers its first fault only: the desk
 * `ENUM_VALUE_UNKNOWN "page.desk.blocks[8]: \"next\" is not a role on a card."`, the part template the same for
 * `"reply"`, and Numbers `KIND_UNKNOWN "page.numbers.blocks[1]: kind \"inputs\" is not a kind this build draws, and no
 * block declares it."`. With those taken off too, the previews drew, and `layout` was NOT refused: it came back in the
 * page's keys, unread. `area`, `box`, `tiles` and `range` were refused on their blocks only, `DECLARATION_INVALID "area:
 * is not a key this record reads."`, and `about is {{name}}` on the queue `FIELD_UNKNOWN "governance has no field
 * called about."`. So of `layout`, `area`, `next`, `range` and `inputs`, the preview refused four, and `layout` was
 * admitted silently.
 *
 * THREE THINGS THIS FLOW NEEDS THAT THE RECORD DID NOT DO, measured here. Two are fixed, and the
 * third is still worked around in the open:
 *   1. FIXED: a page could not be tried before its lists existed. `previewPage` holds one page to the install's lint,
 *      and the lint refuses a `requires` naming a list nobody installed, so the lists were filed and accepted before
 *      any page was seen. `propose` with `try` on a bundle now answers `change_preview`
 *      (`packages/record/src/preview-change.ts`), which installs the lists, figures and pages together inside the
 *      kernel's rehearsal, writes the sample rows and throws all of it away. So the agent tries the Desk whole, its page and its page per part
 *      with every list and figure they read, in one call before anything is filed. A preview takes at most
 *      `PREVIEW_DECLARATIONS_MOST` declarations, and the whole pack with the pad's notes is more, so Numbers, which
 *      reads a different set of figures, is its own try.
 *   2. STILL WORKED AROUND: a bundle filed under a list's name may carry no other list (`govern.ts` `namesFault`), and
 *      the refusal says to propose each other list as a change of its own. The agent files it under a figure's name
 *      instead, which the record asks only whoever reads the whole record about; the sentence does not say that this
 *      is allowed.
 *   3. FIXED: a template (`for:`) was tried as written, `{{name}}` and all, so every block that filtered by a ref was
 *      refused `REF_UNKNOWN`, and the agent filled it over a row it read by hand. `try` now takes `about`, the spoken
 *      id of a row, a sample row among them, and the record draws the page per row over it the way the install fills
 *      it.
 *
 * Every row here is invented, for a small product launch in parts. Nothing names a person, a label or a place.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createRecordApi, type CallContext } from '@braindog/record';

import { tools } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 25, 12);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
/** The agent: a token that may propose and read, on the owner's behalf, and nothing more. */
const agent: CallContext = { principal: { kind: 'token', id: 'tok_1', scope: 'propose', person: 'p_1', level: 'owner' } };

type Refusal = { code: string; fix: string; at?: string };
type Out = { ok: boolean; value?: unknown; refusal?: Refusal };
type Decl = Record<string, unknown>;
type Question = { question: string; about?: string; options: { shows?: unknown }[] };
type Drawn = {
  kind: string;
  heading?: string;
  where?: unknown;
  refusals?: Refusal[];
  rows: { fields: Record<string, unknown> }[];
  matched: number;
  nexts?: unknown[];
  rings?: unknown[];
  done_now?: boolean[];
  short_now?: boolean[];
  next?: number;
  types?: Record<string, string>;
  queue?: Question[];
};
/** A page `change_preview` drew: the record's `PreviewedPage`, read here for what this file asserts. */
type Previewed = { id: string; slug: string; title: string; about: string | null; blocks: Drawn[] };

const said = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};

/* ── the desk, as the pack ships it ──────────────────────────────────────────────────────────────── */

const packOf = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as { declarations: Decl[] };
const DESK_PACK = packOf('../../../packs/launch-desk/launch-desk.pack.json').declarations;
const NOTES = packOf('../../../packs/pad/pad.pack.json').declarations.find((d) => d.register === 'notes')!;

/** What the pages read: the lists, the figures and the rule and script that add the costs up, and the pad's notes. */
const LISTS: Decl[] = [...DESK_PACK.filter((d) => typeof d.page !== 'string'), NOTES];
const PAGES: Decl[] = DESK_PACK.filter((d) => typeof d.page === 'string');
const pageNamed = (slug: string): Decl => PAGES.find((p) => p.page === slug)!;

/**
 * A pack's declarations as a change's, the way `readPack` stores them: the kind is the first key, the id is the kind
 * and that key's value, and a register's own word becomes `id`.
 */
const declarationOf = (d: Decl): { id: string; kind: string; body: Decl } => {
  const kind = Object.keys(d)[0]!;
  const name = String(d[kind]);
  if (kind !== 'register') return { id: `${kind}.${name}`, kind, body: d };
  const { register: _named, ...rest } = d;
  return { id: `register.${name}`, kind, body: { id: name, ...rest } };
};

/** Declarations of the pack by kind and name, the pad's notes among them. */
const named = (kind: string, ...names: string[]): Decl[] =>
  names.map((n) => {
    const found = [...DESK_PACK, NOTES].find((d) => d[kind] === n);
    assert.ok(found, `the desk has no ${kind} called ${n}`);
    return found;
  });

/** The Desk whole: its page and its page per part, with every list and figure they read. */
const DESK_WHOLE = (): Decl[] => [
  ...named('register', 'parts', 'steps', 'contacts', 'lessons', 'notes'),
  ...named('metric', 'essentials', 'essentials-done', 'essentials-share'),
  ...named('page', 'desk', 'part'),
];

/** Numbers, with its two lists, the parts a budget line points at, and every figure its notes read. */
const NUMBERS_WHOLE = (): Decl[] => [
  ...named('register', 'parts', 'checks', 'lines'),
  ...named('metric', 'price', 'priced', 'price-free', 'price-unjudged'),
  ...named('page', 'numbers'),
];

/**
 * Sample rows the agent writes into its try, invented for a small launch: two parts in their own colours, an essential
 * and a lesser step under the box, one step done, most of them with a day they are due, and a thought on the pad. A
 * ref names its row by spoken id, which is the seq the rehearsal gives it.
 */
const SAMPLES = {
  parts: [
    { name: 'Product', what: 'The first piece', big: true, hue: 210 },
    { name: 'Box', what: 'What it ships in', hue: 30 },
  ],
  steps: [
    { what: 'Cut the pattern', part: 'parts#1', done: true, priority: 'essential', rank: 1, due: '2026-09-10' },
    { what: 'Sample the fit', part: 'parts#1', done: false, priority: 'essential', rank: 2, due: '2026-10-05' },
    { what: 'Box quote', part: 'parts#2', done: false, priority: 'should', rank: 3, due: '2026-10-12' },
    { what: 'Box sample', part: 'parts#2', done: false, priority: 'essential', rank: 4, due: '2026-09-28' },
  ],
  notes: [{ text: 'Maybe fewer parts to start with.' }],
};

/** One page as a change an agent tries: `try` beside `to`. */
const tried = (page: Decl) => {
  const to = declarationOf(page);
  return { question: `Add ${String(page.title)}?`, body_kind: 'change', body: { declaration_id: to.id, to, try: true } };
};

/** Several declarations as one change, filed under the id `named` (the first one's when none is said). */
const bundle = (question: string, decls: Decl[], named?: string) => {
  const members = decls.map(declarationOf);
  return { question, body_kind: 'change', body: { declaration_id: named ?? members[0]!.id, to: { declarations: members } } };
};

/**
 * Several declarations as one change an agent tries, over the sample rows and the row `about` names when it says one,
 * named as it would be filed, under a figure, so the try and the filing are the same change.
 */
const triedBundle = (question: string, decls: Decl[], named: string, how: { rows?: unknown; about?: string } | true) => {
  const b = bundle(question, decls, named);
  return { ...b, body: { ...b.body, try: how } };
};

/** The drawn block under a heading, which says which block it is whatever its place on the page. */
const headed = (blocks: Drawn[], heading: string): Drawn => {
  const found = blocks.find((b) => b.heading === heading);
  assert.ok(found, `no block headed ${heading} among ${JSON.stringify(blocks.map((b) => b.heading ?? b.kind))}`);
  return found;
};

/* ── the record ──────────────────────────────────────────────────────────────────────────────────── */

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'launch', name: 'Launch', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  const mcp = tools(api);
  const accept = async (id: string) => said(await api.decide({ id, decide: { option: 'accept', reason: 'Yes.' } } as never, owner));
  const pageIds = () => api.kernel.declarations().filter((d) => d.kind === 'page').map((d) => d.id);
  return { sql, api, mcp, accept, pageIds };
}

/**
 * The owner's own rows, typed in once the lists are there: two parts, their steps, a lesson, a helper, a price check,
 * a budget line and a note. `cost` is written with the three it adds up, since no script host runs here to add them.
 */
async function rows(api: Awaited<ReturnType<typeof createRecordApi>>) {
  const make = async (register: string, fields: Record<string, unknown>) => said<{ id: string }>(await api.create({ register, fields } as never, owner));
  const product = await make('parts', { name: 'Product', what: 'The first piece', big: true, hue: 210 });
  const box = await make('parts', { name: 'Box', what: 'What it ships in', hue: 30 });
  await make('steps', { what: 'Cut the pattern', part: product.id, done: true, priority: 'essential', rank: 1 });
  await make('steps', { what: 'Sample the fit', part: product.id, done: false, priority: 'essential', rank: 2, due: '2026-10-05' });
  await make('steps', { what: 'Box quote', part: box.id, done: false, priority: 'should', rank: 3, due: '2026-10-12' });
  await make('lessons', { lesson: 'Ask for a sample first', body: 'The first run was the wrong weight.', part: product.id });
  await make('contacts', { name: 'A printer', part: box.id, status: 'asked' });
  await make('checks', { what: 'First price', price: 1000, making: 200, packing: 50, sending: 50 });
  await make('lines', { item: 'Fabric', part: product.id, low: 100, high: 300, spent: 120 });
  await make('notes', { text: 'Maybe fewer parts to start with.' });
}

/* ── the tests ───────────────────────────────────────────────────────────────────────────────────── */

test('THE GRAMMAR AN AGENT READS FIRST NAMES inputs AMONG THE KINDS, so the one new kind is learnable before any refusal', async () => {
  const { sql, mcp } = await record();
  const grammar = said<{ block: { kind: string[] } }>(await mcp.read('braindog:grammar/page', agent));
  assert.ok(grammar.block.kind.includes('inputs'), JSON.stringify(grammar.block.kind));
  sql.close();
});

/**
 * AND THE REST OF THE LAYOUT WORDS, SAID BEFORE ANY REFUSAL. `braindog:grammar/page` (`packages/record/src/grammar.ts`)
 * lists the kinds from the renderer, so `inputs` arrived with it, and its page, block and card-role lines were written
 * before the layout words: measured then, split into words, it held `inputs` and none of `layout`, `sticky`,
 * `area`, `tabs`, `lead`, `first`, `next`, `reply`, `range`, `tiles` or `box`, nor an option's `shows` and
 * `about`. A model that reads only the grammar wrote none of them. Desk 2.0 adds the words it wears:
 * `short` on its path, `hue` and `picture` on a part's card, and its `calendar` with `back` and `ahead`.
 */
test('THE GRAMMAR SAYS EVERY WORD THE DESK USES, so a model can write it before its first refusal', async () => {
  const { sql, mcp } = await record();
  const words = new Set(JSON.stringify(said(await mcp.read('braindog:grammar/page', agent))).split(/[^A-Za-z_]+/));
  const missing = [
    ...['layout', 'sticky', 'area', 'tabs', 'lead', 'first', 'next', 'reply', 'range', 'tiles', 'box', 'shows', 'about', 'inputs'],
    ...['short', 'hue', 'picture', 'calendar', 'back', 'ahead'],
  ].filter((w) => !words.has(w));
  sql.close();
  assert.deepEqual(missing, []);
});

test('AN AGENT TRIES THE DESK WHOLE IN ONE CALL, OVER SAMPLE ROWS AND ONE PART, AND EVERY BLOCK ANSWERS BEFORE ANYTHING IS FILED', async () => {
  const { sql, api, mcp, accept, pageIds } = await record();
  const DESK = pageNamed('desk');
  const governance = async () => JSON.stringify(said(await api.governance({ status: 'open' } as never, owner)));
  const nothingBefore = await governance();

  /* A PAGE ALONE, BEFORE ANY LIST EXISTS, is still held to the install's lint, which names the first list it requires
     and nobody installed: a single page is tried as `page_preview` always was. The desk is tried as a bundle below. */
  const early = (await mcp.call('propose', tried(DESK), agent)) as Out;
  assert.equal(early.ok, false, 'a page over lists nobody installed was drawn');
  assert.equal(early.refusal?.code, 'DEPENDENCY_UNRESOLVED', JSON.stringify(early));
  assert.match(early.refusal?.fix ?? '', /register\.parts/);

  /* THE WHOLE PACK AS ONE TRIED BUNDLE is more than one preview takes (`PREVIEW_DECLARATIONS_MOST`), so it is refused
     on its size, at the declarations, in a sentence that says how to split it. */
  const everything = [...LISTS, ...PAGES];
  const triedAll = (await mcp.call('propose', triedBundle('Add the launch desk?', everything, 'metric.essentials', true), agent)) as Out;
  assert.equal(triedAll.refusal?.code, 'OUT_OF_BOUNDS', JSON.stringify(triedAll));
  assert.equal(triedAll.refusal?.at, 'to.declarations');
  assert.match(triedAll.refusal?.fix ?? '', new RegExp(`and this change has ${everything.length}\\. Try its lists and figures first, then its pages\\.`));

  /* THE DESK WHOLE, IN ONE TRY: its lists, its figures, the Desk and the page per part, over the sample rows, with the
     page per part drawn over the box, a row that exists only inside the try. Nothing was installed before it. */
  const desked = said<{ change_preview: { pages: Previewed[] }; proposed: boolean }>(
    await mcp.call('propose', triedBundle('Add the launch desk?', DESK_WHOLE(), 'metric.essentials', { rows: SAMPLES, about: 'parts#2' }), agent),
  );
  assert.equal(desked.proposed, false);
  assert.deepEqual(desked.change_preview.pages.map((p) => p.id), ['page.desk', 'page.part']);
  /* A TOKEN THAT ONLY ASKS CANNOT ADD, so a capture box is held from it, as it is once installed (`heldBlock`): it reads
     nothing, so that is the only thing it says. Every other block answers. */
  for (const page of desked.change_preview.pages)
    page.blocks.forEach((b, i) => {
      if (b.kind === 'capture') assert.deepEqual(b.refusals?.map((r) => r.code), ['FORBIDDEN'], `${page.id}.blocks[${i}] (capture)`);
      else assert.deepEqual(b.refusals, [], `${page.id}.blocks[${i}] (${b.kind}) was refused`);
    });
  /* AND TRIED BY A TOKEN THAT MAY ADD, THE SAME DESK ANSWERS WHOLE, the box included. */
  const writer: CallContext = { principal: { kind: 'token', id: 'tok_2', scope: 'write', person: 'p_1', level: 'owner' } };
  const wrote = said<{ change_preview: { pages: Previewed[] } }>(
    await mcp.call('propose', triedBundle('Add the launch desk?', DESK_WHOLE(), 'metric.essentials', { rows: SAMPLES, about: 'parts#2' }), writer),
  );
  assert.ok(wrote.change_preview.pages.some((p) => p.blocks.some((b) => b.kind === 'capture')), 'the desk drew no capture box, so this proves nothing');
  for (const page of wrote.change_preview.pages)
    page.blocks.forEach((b, i) => assert.deepEqual(b.refusals, [], `${page.id}.blocks[${i}] (${b.kind}) was refused a token that may add`));
  const [deskDrawn, boxDrawn] = desked.change_preview.pages as [Previewed, Previewed];
  assert.equal(deskDrawn.blocks.length, (DESK.blocks as unknown[]).length);

  /* THE DESK'S WORDS ANSWERED, NOT ONLY ADMITTED: the next move across every part, each part carded in its own colour
     with its ring and its next step, the lead part first, and the open steps on the days they are due, earliest first,
     the done one left off. */
  assert.deepEqual(headed(deskDrawn.blocks, 'Next move').rows.map((r) => r.fields.what), ['Sample the fit']);
  const parts = deskDrawn.blocks.find((b) => b.kind === 'cards' && b.nexts !== undefined)!;
  assert.deepEqual(parts.rows.map((r) => r.fields.name), ['Product', 'Box']);
  assert.deepEqual(parts.rows.map((r) => r.fields.hue), [210, 30]);
  assert.deepEqual(parts.rings, [50, 0]);
  assert.deepEqual(parts.nexts, ['Sample the fit', 'Box quote']);
  const calendar = deskDrawn.blocks.find((b) => b.kind === 'calendar')!;
  assert.deepEqual(calendar.rows.map((r) => [r.fields.what, r.fields.due]), [
    ['Box sample', '2026-09-28'],
    ['Sample the fit', '2026-10-05'],
    ['Box quote', '2026-10-12'],
  ]);

  /* THE PAGE PER PART DRAWN OVER THE BOX, as the install would fill it: its title is the part's name, and its path is
     the box's open steps, with the essential one marked for the short view. */
  assert.deepEqual([boxDrawn.title, boxDrawn.about], ['Box', 'parts#2']);
  const path = headed(boxDrawn.blocks, 'The path');
  assert.deepEqual(path.rows.map((r) => r.fields.what), ['Box quote', 'Box sample']);
  assert.deepEqual(path.short_now, [false, true]);

  /* NUMBERS, WITH EVERY FIGURE IT READS, IN A SECOND TRY, over a price check and a budget line. */
  const counted = said<{ change_preview: { pages: Previewed[] } }>(
    await mcp.call(
      'propose',
      triedBundle('Add the numbers of the launch desk?', NUMBERS_WHOLE(), 'metric.price', {
        rows: {
          parts: [{ name: 'Product', what: 'The first piece' }],
          checks: [{ what: 'First price', price: 1000, making: 200, packing: 50, sending: 50 }],
          lines: [{ item: 'Fabric', part: 'parts#1', low: 100, high: 300, spent: 120 }],
        },
      }),
      agent,
    ),
  ).change_preview.pages;
  assert.deepEqual(counted.map((p) => p.id), ['page.numbers']);
  counted[0]!.blocks.forEach((b, i) => assert.deepEqual(b.refusals, [], `page.numbers.blocks[${i}] (${b.kind}) was refused`));
  assert.deepEqual(counted[0]!.blocks.find((b) => b.kind === 'inputs')!.types, { price: 'decimal', making: 'decimal', packing: 'decimal', sending: 'decimal', times_cost: 'decimal', cost: 'decimal', least: 'decimal', room: 'decimal' });
  assert.equal(counted[0]!.blocks.find((b) => b.kind === 'progress')!.matched, 1);

  /* AND NOTHING OF EITHER TRY STAYED: no list, no page, no question in Decide. */
  assert.equal(api.kernel.declarations().some((d) => d.id === 'register.parts'), false, 'a try installed a list');
  assert.deepEqual(pageIds(), [], 'a try installed a page');
  assert.equal(await governance(), nothingBefore, 'a try put a question in Decide');

  /* SO THE LISTS AND FIGURES GO FIRST, AS ONE CHANGE. Under the first list's name it is refused, since whoever reads
     Parts would read Steps in it; under a figure's name the record asks only whoever reads the whole record. Nothing
     is installed until the owner says so. */
  const underList = (await mcp.call('propose', bundle('Add the lists a launch desk keeps?', LISTS), agent)) as Out;
  assert.equal(underList.refusal?.code, 'VALUE_MALFORMED', JSON.stringify(underList));
  assert.match(underList.refusal?.fix ?? '', /also installs register\.steps/);
  const lists = said<{ id: string }>(await mcp.call('propose', bundle('Add the lists a launch desk keeps?', LISTS, 'metric.essentials'), agent));
  assert.equal(api.kernel.declarations().some((d) => d.id === 'register.parts'), false, 'a proposal installed a list');
  await accept(lists.id);
  for (const id of ['register.parts', 'register.steps', 'register.contacts', 'register.checks', 'register.notes', 'metric.price-unjudged'])
    assert.ok(api.kernel.declarations().some((d) => d.id === id), `${id} was not installed by the accept`);

  /* THE AGENT CAN NOW READ WHAT IT BUILT, as a model would before it writes a where. */
  const schema = said<{ fields: { id: string }[] }>(await mcp.call('schema', { register: 'steps' }, agent));
  for (const field of ['part', 'done', 'priority', 'rank', 'due']) assert.ok(schema.fields.some((f) => f.id === field), field);

  await rows(api);

  /* AND ONE CALL FOR THE OWNER, each option shown as what it is and the question said to be about the Box. */
  said(
    await mcp.call(
      'propose',
      {
        question: 'Which lining for the box?',
        body_kind: 'options',
        body: {
          about: 'Box',
          options: [
            { id: 'sand', label: 'Sand', because: 'It matches the card.', recommended: true, shows: { swatch: ['#d8c3a5'] } },
            { id: 'ink', label: 'Ink', because: 'It hides wear.', shows: { figure: '2 weeks longer' } },
          ],
        },
      },
      agent,
    ),
  );

  /* FILED AS ONE CHANGE, UNDER A PAGE'S NAME, ACCEPTED, INSTALLED: the pages the tries drew, now over the owner's rows. */
  const pages = said<{ id: string }>(await mcp.call('propose', bundle('Add the launch desk?', PAGES), agent));
  assert.deepEqual(pageIds(), [], 'filing a page installed it');
  await accept(pages.id);
  assert.deepEqual(pageIds().sort(), ['page.desk', 'page.numbers', 'page.part']);

  /* READ BACK INSTALLED, through the resource an agent reads a page with: the desk, one tab per part, and Numbers. */
  const listed = (await mcp.resources(agent)).map((r) => r.uri);
  for (const slug of ['desk', 'numbers', 'product', 'box']) {
    assert.ok(listed.includes(`braindog:page/${slug}`), `braindog:page/${slug} is not among ${JSON.stringify(listed)}`);
    const page = said<{ blocks: Drawn[] }>(await mcp.read(`braindog:page/${slug}`, agent));
    /* A BLOCK NOTHING REFUSED CARRIES NO `refusals` IN A READ, which leaves out every empty list it can. And this token only
       asks, so a capture box is held from it installed, as it was in the try. */
    page.blocks.forEach((b, i) => {
      if (b.kind === 'capture') assert.deepEqual(b.refusals?.map((r) => r.code), ['FORBIDDEN'], `${slug}.blocks[${i}] (capture)`);
      else assert.deepEqual(b.refusals ?? [], [], `${slug}.blocks[${i}] (${b.kind}) was refused installed`);
    });
  }
  const installed = said<{ layout?: unknown; nav?: unknown }>(await mcp.read('braindog:page/desk', agent));
  assert.deepEqual(installed.layout, { rail: 4, sticky: true });
  assert.deepEqual(installed.nav, { section: 'Launch', order: 10, tabs: true });
  const tab = async (slug: string) => said<{ blocks: Drawn[] }>(await mcp.read(`braindog:page/${slug}`, agent)).blocks;
  const desk = await tab('desk');
  const move = headed(desk, 'Next move');
  assert.deepEqual(move.rows.map((r) => r.fields.what), ['Sample the fit'], 'the next move is the first open step');
  assert.deepEqual([move.matched, move.done_now, move.next], [3, [false], 0]);
  /* THE CALL FOR THE OWNER AS TILES, each option shown as what it is. */
  const tiles = headed(desk, 'Calls waiting on you').queue!;
  assert.deepEqual(tiles.map((q) => q.question), ['Which lining for the box?']);
  assert.deepEqual(tiles[0]!.options.map((o) => o.shows), [{ swatch: ['#d8c3a5'] }, { figure: '2 weeks longer' }]);
  const productPath = headed(await tab('product'), 'The path');
  assert.deepEqual(productPath.rows.map((r) => r.fields.what), ['Sample the fit'], "the product's path, its one open step");
  assert.deepEqual(productPath.done_now, [false]);
  assert.deepEqual(productPath.short_now, [true], 'the essential step is in the short view');
  /* THE CALL ABOUT THE BOX IS ON THE BOX'S TAB AND NOT THE PRODUCT'S, by the option body's `about`. */
  assert.deepEqual(headed(await tab('box'), 'Calls about this part').queue!.map((q) => q.question), ['Which lining for the box?']);
  assert.deepEqual(headed(await tab('product'), 'Calls about this part').queue, []);
  sql.close();
});
