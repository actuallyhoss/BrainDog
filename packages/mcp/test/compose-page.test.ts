/**
 * An agent composes a launch desk from a description, over MCP, and the owner's accept installs it
 * (`loop/research-dynamic-layouts.md` section 6 brief D9, section 7, `loop/DIRECTION.md` sections 11, 22 and 28).
 *
 * THE TOOL CALLS A MODEL WOULD MAKE, IN THE ORDER IT WOULD MAKE THEM, against a real record: read the page grammar,
 * try a page, mend what the record refused, file, let the owner accept, read a schema, try every page again with rows
 * under it, file the pages, and read them back installed. Nothing here calls the kernel to install anything; the only
 * writes that are not `propose` are the owner's presses in Decide and the rows she types in.
 *
 * FROM THE DECLARATION BRIEF D8 SHIPS, `packs/launch-desk/launch-desk.pack.json`, read as it is on disk each run, with
 * the pad's list of notes from `packs/pad/pad.pack.json`, which the desk requires. `declarationOf` turns a pack's
 * declaration into a change's the way `readPack` stores it. Which blocks to look at is found by heading, never by
 * position, so the pack may grow a block without this file being told.
 *
 * RED BEFORE WAVE ONE, MEASURED. This file and the two pack files, run on September 25th against `6eda2f46` (the
 * survey's commit, the last before wave one), failed at the lists: accepting them was refused `DECLARATION_INVALID` at
 * `steps`, "steps says its rows are steps. Say which ref field names the row each belongs to and which bool field says
 * it is done, as { of: thing, done: done }.", since `steps: { order }` is itself a wave-one word. With `order` taken
 * off, each page's preview was refused whole, one sentence each, since the lint answers its first fault only: the desk
 * `ENUM_VALUE_UNKNOWN "page.desk.blocks[8]: \"next\" is not a role on a card."`, the part template the same for
 * `"reply"`, and Numbers `KIND_UNKNOWN "page.numbers.blocks[1]: kind \"inputs\" is not a kind this build draws, and no
 * block declares it."`. With those taken off too, the previews drew, and `layout` was NOT refused: it came back in the
 * page's keys, unread. `area`, `box`, `tiles` and `range` were refused on their blocks only, `DECLARATION_INVALID "area:
 * is not a key this record reads."`, and `about is {{name}}` on the queue `FIELD_UNKNOWN "governance has no field
 * called about."`. So the brief's red line, that the preview refused `layout`, `area`, `next`, `range` and `inputs`, was
 * right for four of the five and wrong for `layout`, which was admitted silently (the survey's finding 1).
 *
 * THREE THINGS THE BRIEF ASSUMED THAT THE RECORD DOES NOT DO, each measured here rather than worked around quietly:
 *   1. A page cannot be tried before its lists exist. `previewPage` holds a body to the install's lint, and the lint
 *      refuses a `requires` naming a list nobody installed, so the lists are filed and accepted first, and every page
 *      is tried and filed after. And a `{ declarations: [...] }` bundle cannot be tried at all: `try` reads one page or
 *      one script.
 *   2. A bundle filed under a list's name may carry no other list (`govern.ts` `namesFault`), and the refusal says to
 *      propose each other list as a change of its own. The agent files it under a figure's name instead, which the
 *      record asks only whoever reads the whole record about; the sentence does not say that this is allowed.
 *   3. A template (`for:`) is tried as written, `{{name}}` and all, never over a row (`previewPage`'s header), so every
 *      block that filters by a ref is refused `REF_UNKNOWN`. The agent tries it over one row it read instead.
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
  refusals: Refusal[];
  rows: { fields: Record<string, unknown> }[];
  matched: number;
  nexts?: unknown[];
  rings?: unknown[];
  done_now?: boolean[];
  next?: number;
  types?: Record<string, string>;
  queue?: Question[];
};

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

/**
 * A template as it would be for one row: every `{{field}}` filled from the row and `for:` taken off, under the slug
 * the row would give it. What an agent tries in place of the template, which a preview draws only as written.
 */
const overRow = (page: Decl, fields: Record<string, unknown>): Decl => {
  const { for: _for, ...rest } = page;
  const filled = JSON.parse(JSON.stringify(rest).replace(/\{\{(\w+)\}\}/g, (_, f: string) => String(fields[f] ?? ''))) as Decl;
  return { ...filled, page: `${String(page.page)}-${String(fields.name).toLowerCase()}` };
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
  const product = await make('parts', { name: 'Product', what: 'The first piece', big: true });
  const box = await make('parts', { name: 'Box', what: 'What it ships in' });
  await make('steps', { what: 'Cut the pattern', part: product.id, done: true, priority: 'essential', rank: 1 });
  await make('steps', { what: 'Sample the fit', part: product.id, done: false, priority: 'essential', rank: 2 });
  await make('steps', { what: 'Box quote', part: box.id, done: false, priority: 'should', rank: 3 });
  await make('lessons', { lesson: 'Ask for a sample first', body: 'The first run was the wrong weight.', part: product.id });
  await make('contacts', { name: 'A printer', part: box.id, status: 'asked' });
  await make('checks', { what: 'First price', price: 1000, making: 200, packing: 50, sending: 50, cost: 300 });
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
 * AND THE REST OF WAVE ONE'S WORDS, SAID BEFORE ANY REFUSAL. `braindog:grammar/page` (`packages/record/src/grammar.ts`)
 * lists the kinds from the renderer, so `inputs` arrived with it, and its page, block and card-role lines were written
 * before wave one: measured on September 25th, split into words, it held `inputs` and none of `layout`, `sticky`,
 * `area`, `tabs`, `lead`, `first`, `next`, `reply`, `range`, `tiles` or `box`, nor an option's `shows` and
 * `about`. A model that reads the grammar and not the survey wrote none of them.
 */
test('THE GRAMMAR SAYS EVERY WORD THE DESK USES, so a model can write it before its first refusal', async () => {
  const { sql, mcp } = await record();
  const words = new Set(JSON.stringify(said(await mcp.read('braindog:grammar/page', agent))).split(/[^A-Za-z_]+/));
  const missing = ['layout', 'sticky', 'area', 'tabs', 'lead', 'first', 'next', 'reply', 'range', 'tiles', 'box', 'shows', 'about', 'inputs'].filter((w) => !words.has(w));
  sql.close();
  assert.deepEqual(missing, []);
});

test('AN AGENT TRIES THE DESK, IS TOLD ITS LISTS ARE MISSING, FILES THEM, AND EVERY BLOCK OF EVERY PAGE ANSWERS BEFORE A PAGE IS FILED', async () => {
  const { sql, api, mcp, accept, pageIds } = await record();
  const DESK = pageNamed('desk');
  const PART = pageNamed('part');
  const NUMBERS = pageNamed('numbers');

  /* FIRST TRY, BEFORE ANY LIST EXISTS. The lint names the first list the page requires and nobody installed. */
  const early = (await mcp.call('propose', tried(DESK), agent)) as Out;
  assert.equal(early.ok, false, 'a page over lists nobody installed was drawn');
  assert.equal(early.refusal?.code, 'DEPENDENCY_UNRESOLVED', JSON.stringify(early));
  assert.match(early.refusal?.fix ?? '', /register\.parts/);

  /* AND THE WHOLE DESK AS ONE TRIED BUNDLE, which is the one change the brief would have sent, is refused outright. */
  const whole = bundle('Add the launch desk?', [...LISTS, ...PAGES], 'metric.essentials');
  const triedWhole = (await mcp.call('propose', { ...whole, body: { ...whole.body, try: true } }, agent)) as Out;
  assert.equal(triedWhole.refusal?.code, 'VALUE_MALFORMED', JSON.stringify(triedWhole));
  assert.match(triedWhole.refusal?.fix ?? '', /Only a script or a page change can be tried/);

  /* SO THE LISTS AND FIGURES GO FIRST, AS ONE CHANGE. Under the first list's name it is refused, since whoever reads
     Parts would read Steps in it; under a figure's name the record asks only whoever reads the whole record. Nothing
     is installed until the owner says so. */
  const underList = (await mcp.call('propose', bundle('Add the lists a launch desk keeps?', LISTS), agent)) as Out;
  assert.equal(underList.refusal?.code, 'VALUE_MALFORMED', JSON.stringify(underList));
  assert.match(underList.refusal?.fix ?? '', /also installs register\.steps/);
  const lists = said<{ id: string }>(await mcp.call('propose', bundle('Add the lists a launch desk keeps?', LISTS, 'metric.essentials'), agent));
  assert.equal(api.kernel.declarations().some((d) => d.id === 'register.parts'), false, 'a proposal installed a list');
  await accept(lists.id);
  for (const id of ['register.parts', 'register.steps', 'register.contacts', 'register.checks', 'register.notes', 'metric.cost-share', 'rule.launch_desk_cost', 'script.launch_desk_cost'])
    assert.ok(api.kernel.declarations().some((d) => d.id === id), `${id} was not installed by the accept`);

  /* THE AGENT CAN NOW READ WHAT IT BUILT, as a model would before it writes a where. */
  const schema = said<{ fields: { id: string }[] }>(await mcp.call('schema', { register: 'steps' }, agent));
  for (const field of ['part', 'done', 'priority', 'rank']) assert.ok(schema.fields.some((f) => f.id === field), field);

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
  const openBefore = JSON.stringify(said(await api.governance({ status: 'open' } as never, owner)));

  /* THE TEMPLATE TRIED AS WRITTEN IS REFUSED ON EXACTLY THE BLOCKS THAT FILTER BY A REF, each in the same sentence. If a
     preview ever learns to draw a template over a row, these lines are the ones to change. */
  const literal = said<{ page_preview: { blocks: Drawn[] } }>(await mcp.call('propose', tried(PART), agent)).page_preview.blocks;
  const refField = (list: unknown, field: string): boolean =>
    ((LISTS.find((d) => d.register === list)?.fields ?? []) as Decl[]).some((f) => f.id === field && f.type === 'ref');
  const byRef = (PART.blocks as Decl[]).flatMap((b, i) => {
    const list = typeof b.source === 'string' ? b.source.replace(/^register\./, '') : b.register;
    return typeof b.where === 'string' && b.where.includes('{{') && refField(list, b.where.split(' ')[0]!) ? [i] : [];
  });
  assert.ok(byRef.length >= 3, JSON.stringify(byRef));
  assert.deepEqual(literal.flatMap((b, i) => (b.refusals.length > 0 ? [i] : [])), byRef);
  for (const i of byRef) {
    assert.deepEqual(literal[i]!.refusals.map((r) => r.code), ['REF_UNKNOWN'], `block ${i}`);
    assert.ok(literal[i]!.refusals[0]!.fix.startsWith(`${String((PART.blocks as Decl[])[i]!.where)}: there is no `), literal[i]!.refusals[0]!.fix);
  }

  /* SO THE AGENT TRIES IT OVER ONE PART IT READ. `list` hands the agent a row's spoken id, which is what the pad's
     `about is {{spoken}}` is filled with, by the agent here and by the install's `fill` alike. */
  const parts = said<{ rows: { spoken: string; fields: Record<string, unknown> }[] }>(await mcp.call('list', { register: 'parts' }, agent)).rows;
  const product = parts.find((r) => r.fields.name === 'Product')!;

  /* EVERY PAGE TRIED, EVERY BLOCK ANSWERED, NOTHING FILED. */
  const previews = new Map<string, Drawn[]>();
  for (const page of [DESK, overRow(PART, { ...product.fields, spoken: product.spoken }), NUMBERS]) {
    const out = said<{ page_preview: { blocks: Drawn[] }; proposed: boolean }>(await mcp.call('propose', tried(page), agent));
    assert.equal(out.proposed, false);
    assert.equal(out.page_preview.blocks.length, (page.blocks as unknown[]).length, String(page.page));
    out.page_preview.blocks.forEach((b, i) => assert.deepEqual(b.refusals, [], `${String(page.page)}.blocks[${i}] (${b.kind}) was refused`));
    previews.set(String(page.page), out.page_preview.blocks);
  }
  assert.equal(JSON.stringify(said(await api.governance({ status: 'open' } as never, owner))), openBefore, 'a preview put a question in Decide');
  assert.deepEqual(pageIds(), [], 'a preview installed a page');

  /* AND THE NEW WORDS ARE ANSWERED IN THE PREVIEW, not only admitted. */
  const desk = previews.get('desk')!;
  const move = headed(desk, 'Next move');
  assert.deepEqual(move.rows.map((r) => r.fields.what), ['Sample the fit'], 'the next move is the first open step');
  assert.deepEqual([move.matched, move.done_now, move.next], [3, [false], 0]);
  const cards = desk.find((b) => b.kind === 'cards' && b.nexts !== undefined)!;
  assert.deepEqual(cards.nexts, ['Sample the fit', 'Box quote'], 'the next step on each part, the lead part first');
  assert.deepEqual(cards.rings, [50, 0], 'each part ringed by its own steps');
  const tiles = headed(desk, 'Calls waiting on you').queue!;
  assert.deepEqual(tiles.map((q) => q.question), ['Which lining for the box?']);
  assert.deepEqual(tiles[0]!.options.map((o) => o.shows), [{ swatch: ['#d8c3a5'] }, { figure: '2 weeks longer' }]);
  const inputs = previews.get('numbers')!.find((b) => b.kind === 'inputs')!;
  assert.deepEqual(inputs.types, { price: 'decimal', making: 'decimal', packing: 'decimal', sending: 'decimal' });
  assert.equal(previews.get('numbers')!.find((b) => b.kind === 'progress')!.matched, 1);

  /* FILED AS ONE CHANGE, UNDER A PAGE'S NAME, ACCEPTED, INSTALLED. */
  const pages = said<{ id: string }>(await mcp.call('propose', bundle('Add the launch desk?', PAGES), agent));
  assert.deepEqual(pageIds(), [], 'filing a page installed it');
  await accept(pages.id);
  assert.deepEqual(pageIds().sort(), ['page.desk', 'page.numbers', 'page.part']);

  /* READ BACK INSTALLED, through the resource an agent reads a page with: the desk, one tab per part, and Numbers. */
  const listed = (await mcp.resources(agent)).map((r) => r.uri);
  for (const slug of ['desk', 'numbers', 'product', 'box']) {
    assert.ok(listed.includes(`braindog:page/${slug}`), `braindog:page/${slug} is not among ${JSON.stringify(listed)}`);
    const page = said<{ blocks: Drawn[] }>(await mcp.read(`braindog:page/${slug}`, agent));
    page.blocks.forEach((b, i) => assert.deepEqual(b.refusals, [], `${slug}.blocks[${i}] (${b.kind}) was refused installed`));
  }
  const installed = said<{ layout?: unknown; nav?: unknown }>(await mcp.read('braindog:page/desk', agent));
  assert.deepEqual(installed.layout, { rail: 4, sticky: true });
  assert.deepEqual(installed.nav, { section: 'Launch', order: 10, tabs: true });
  const tab = async (slug: string) => said<{ blocks: Drawn[] }>(await mcp.read(`braindog:page/${slug}`, agent)).blocks;
  const path = headed(await tab('product'), 'The path');
  assert.deepEqual(path.rows.map((r) => r.fields.what), ['Sample the fit'], "the product's path, the open step in its short view");
  assert.deepEqual(path.done_now, [false]);
  /* THE CALL ABOUT THE BOX IS ON THE BOX'S TAB AND NOT THE PRODUCT'S, by the option body's `about`. */
  assert.deepEqual(headed(await tab('box'), 'Calls about this part').queue!.map((q) => q.question), ['Which lining for the box?']);
  assert.deepEqual(headed(await tab('product'), 'Calls about this part').queue, []);
  sql.close();
});
