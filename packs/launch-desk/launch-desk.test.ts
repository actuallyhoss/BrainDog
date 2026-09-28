/**
 * A launch desk as a pack: the measure of done of `loop/research-dynamic-layouts.md` section 7 and brief D8
 * (`loop/DIRECTION.md` sections 22, 28 and 31).
 *
 * THE BAR WAS A PAGE ONE PERSON HAD BUILT FOR ONE LAUNCH, and section 28 asks that anybody can build that level of fit
 * over their own lists without anyone writing code for them. So this folder holds a file and nothing else that runs in
 * the shell: six lists, the figures a sentence needs, one script that adds three costs, and three kinds of page (a desk,
 * one page per part, and the numbers), every one of them said in words the kernel already reads. What it proves is the
 * kernel half: the file installs through the record's own door, and every block of every page answers with no refusal.
 * The drawing is the app's (wave three), and is not asserted here.
 *
 * 2.0 WEARS THE PAGE WORDS WAVE THREE ADDED: each part's card carries its own colour and picture (`hue`, `picture`), a
 * part's path opens on its essential steps (`short`), and the Desk puts the open steps on a `calendar` by the day each
 * is due. Each is asserted as the kernel answers it; how a phone draws it is the app's.
 *
 * IT REQUIRES THE PAD (`packs/pad`) FOR ITS NOTES, rather than declaring a notes list of its own, so a record that
 * already keeps a pad keeps one pad. A pack cannot lay blocks on another pack's page, so the desk's rail copies the
 * pad's three blocks, which `packs/pad` holds to standing on their own for exactly this.
 *
 * RED FIRST, MEASURED ON SEPTEMBER 25TH: with no `launch-desk.pack.json` beside it this file failed at its first read,
 * ENOENT, before a single test ran. The first test holds a fresh record to having no desk of its own.
 *
 * Every row here is invented: a small run of candles, launched in four parts. None of it is anybody's.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { readPackFile } from '../../packages/declare/src/catalogue.ts';
import { scriptReads, scriptRunner } from '../../packages/host/src/script.ts';
import { createRecordApi, type CallContext } from '../../packages/record/src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from '../../packages/kernel/test/sqlite.ts';
import { runInQuickJs } from '../../packages/script/src/quickjs.ts';
import { FIRST_PARTY, firstPartyDocument } from '../../packages/seed/src/index.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const NOW = Date.UTC(2026, 8, 25, 12);
const ROOT = new URL('../../', import.meta.url);

type Refusal = { code: string; fix: string; at?: string };
type Out = { ok: boolean; value?: unknown; refusal?: Refusal };
const said = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};

type Api = Awaited<ReturnType<typeof createRecordApi>>;
type Diff = { planHash: string; approve: unknown[]; conflicts: unknown[]; adds: { id: string }[] };
type Row = { id: string; seq: number; version: number; fields: Record<string, unknown> };
type Decl = Record<string, unknown>;
type Block = {
  kind: string;
  heading?: string;
  area?: string;
  rows: Row[];
  matched: number;
  refusals: Refusal[];
  drawn?: boolean;
  values?: Record<string, unknown>;
  rings?: (number | null)[];
  nexts?: (string | null)[];
  done_now?: boolean[];
  short_now?: boolean[];
  window?: { from: string; to: string; today: string };
  next?: number | null;
  types?: Record<string, string>;
  queue?: { question: string; about?: string; options: { label: string; shows?: unknown }[] }[];
  readings?: { metric: string; reading: { value: number | null } | null }[];
  fills?: Record<string, unknown>;
};
type Page = { title: string; layout?: unknown; nav?: unknown; blocks: Block[] };

/** The file as it ships, read fresh each time so no test can hand the next one a copy it changed. */
const TEXT = readFileSync(new URL('./launch-desk.pack.json', import.meta.url), 'utf8');
const desk = (): Decl & { pack: string; version: string; requires: { packs: Record<string, string> }; declarations: Decl[] } => JSON.parse(TEXT) as never;
const PAD = (): unknown => JSON.parse(readFileSync(new URL('../pad/pad.pack.json', import.meta.url), 'utf8'));
const SOURCE = readFileSync(new URL('./cost.js', import.meta.url), 'utf8');

/** A fresh record on a host that answers Slash, which the pad's second opinion needs to install at all. */
async function record(): Promise<{ api: Api; sql: NodeSql }> {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW), answersSlash: true });
  return { api, sql };
}

const planOf = async (api: Api, doc: unknown): Promise<Out> => (await api.planPack({ doc, source: { kind: 'local' } } as never, owner)) as Out;

/** Plan and install with exactly what the plan asked to be approved. */
async function put(api: Api, doc: unknown): Promise<Out> {
  const plan = await planOf(api, doc);
  if (!plan.ok) return plan;
  const diff = (plan.value as { diff: Diff }).diff;
  return (await api.installPack({ doc, source: { kind: 'local' }, planHash: diff.planHash, approve: diff.approve } as never, owner)) as Out;
}

/** The pad, then the desk: the order a person installs them in, since the desk asks for the pad by name. */
async function desked(): Promise<{ api: Api; sql: NodeSql }> {
  const r = await record();
  said(await put(r.api, PAD()));
  said(await put(r.api, desk()));
  return r;
}

const make = (api: Api, register: string, fields: Record<string, unknown>): Row => said<Row>(api.kernel.create(register, fields as never, { actor: 'p_1' }));
const rowOf = (api: Api, id: string): Row => api.kernel.get(id) as unknown as Row;
const pageOf = async (api: Api, slug: string): Promise<Page> => said<Page>(await api.page({ slug }, owner));

/** Every block of a page answers with no refusal, which is the whole of what the kernel half promises. */
function clean(page: Page, slug: string): void {
  for (const [i, b] of page.blocks.entries()) assert.deepEqual(b.refusals, [], `${slug} block ${i} (${b.kind}${b.heading ? `, ${b.heading}` : ''}) was refused`);
}

/** The lead sentences a page draws now: a `note` with `lead: true` that its `when:` did not hold back. */
const leads = (page: Page): string[] =>
  page.blocks.filter((b) => b.kind === 'note' && (b as Decl).lead === true && b.drawn !== false).map((b) => String((b as Decl).body));

/**
 * The cost script's runs, taken to the end the way a host takes them: the rule's outbox drained, then the actions, with
 * the script run in QuickJS by the runner the self-host builds. It fetches nothing, so every door out refuses.
 */
async function settle(api: Api): Promise<void> {
  const refuse = async (): Promise<never> => {
    throw new Error('the cost script fetches nothing');
  };
  const run = scriptRunner({ run: runInQuickJs, send: refuse, pin: refuse, openKey: refuse, grantOf: () => null, reads: scriptReads(api), now: () => NOW } as never);
  for (let i = 0; i < 3; i++) {
    await api.kernel.drain();
    await api.kernel.runActions(refuse as never, { script: run, limit: 50 });
  }
}

/**
 * Four parts of an invented launch, with steps of each priority under them, a question waiting on one part, a helper,
 * a lesson and two budget lines. The box is the part marked big, and is written second so the lead card is chosen by
 * the flag and not by the order the rows went in. Two parts wear a colour and two do not. Most open steps have a day
 * they are due, one of them past the calendar's last month, and one done step has a day too, so the calendar is seen
 * to leave both out.
 */
async function launch(api: Api): Promise<{ candle: Row; box: Row; shop: Row }> {
  const candle = make(api, 'parts', { name: 'The candle', what: 'The wax, the wick and the scent, settled before anything is printed.', hue: 30 });
  const box = make(api, 'parts', { name: 'The box', what: 'What each candle ships in, and the card inside it.', big: true, hue: 200 });
  const shop = make(api, 'parts', { name: 'The shop page', what: 'Where people read about it and buy it.' });
  make(api, 'parts', { name: 'Word of it', what: 'How people hear about it before the day.' });
  make(api, 'steps', { what: 'Pick the wax', part: candle.id, priority: 'essential', done: true, rank: 1, due: '2026-09-10' });
  make(api, 'steps', { what: 'Test the burn time', part: candle.id, priority: 'essential', done: false, rank: 2, due: '2026-10-02' });
  make(api, 'steps', { what: 'Try a second scent', part: candle.id, priority: 'nice', done: false, rank: 3, due: '2027-01-15' });
  make(api, 'steps', { what: 'Ask for a box quote', part: box.id, priority: 'essential', done: true, rank: 1 });
  make(api, 'steps', { what: 'Order a printed sample', part: box.id, priority: 'essential', done: false, rank: 2, due: '2026-09-30' });
  make(api, 'steps', { what: 'Write the card', part: box.id, priority: 'should', done: false, rank: 3, due: '2026-10-20' });
  make(api, 'steps', { what: 'Take the photographs', part: shop.id, priority: 'should', done: true, rank: 1 });
  make(api, 'contacts', { name: 'The box printer', what: 'Quotes and samples', part: box.id, status: 'asked' });
  make(api, 'lessons', { lesson: 'Samples take a week', body: 'Order the printed sample before the card is final.', part: box.id });
  make(api, 'lines', { item: 'Wax and wicks', part: candle.id, low: 150, high: 300, spent: 180 });
  make(api, 'lines', { item: 'Printed boxes', part: box.id, low: 400, high: 900 });
  return { candle, box, shop };
}

/* ── before ───────────────────────────────────────────────────────────── */

test('BEFORE THE PACK: a fresh record with the pad has no desk, no parts and no numbers page', async () => {
  const { api, sql } = await record();
  said(await put(api, PAD()));
  const ids = api.kernel.declarations().map((d) => d.id);
  for (const id of ['register.parts', 'register.steps', 'register.checks', 'page.desk', 'page.part', 'page.numbers'])
    assert.ok(!ids.includes(id), `${id} is already on the record, so this pack would be adding nothing`);
  assert.ok(!said<{ slug: string }[]>(await api.pages(owner)).some((p) => p.slug === 'desk'));
  sql.close();
});

/* ── the file ─────────────────────────────────────────────────────────── */

test('the same file passes as an add-on somebody opens from disk, and asks for the pad by name', async () => {
  const file = said<{ pack: { manifest: { pack: string; requires: { packs: Record<string, string> } } } }>(await readPackFile(TEXT));
  assert.equal(file.pack.manifest.pack, 'launch-desk');
  assert.deepEqual(file.pack.manifest.requires.packs, { pad: '>=1.0.0' });
});

test('THE SCRIPT IN THE FILE IS cost.js, byte for byte, and it reaches nothing but the checks', () => {
  const script = desk().declarations.find((d) => typeof d.script === 'string')!;
  assert.equal(script.source, SOURCE, 'launch-desk.pack.json and cost.js disagree; copy cost.js into the source');
  assert.deepEqual([script.egress, script.keys, script.reads, script.writes], [[], [], ['checks'], ['checks']]);
});

test('WITHOUT THE PAD THE DESK IS REFUSED, at the notes list it points at, and nothing of it is installed', async () => {
  /* MEASURED: the plan meets the desk's page reading `register.notes` before it reaches `requires.packs`, so the sentence
     a person reads names the missing list and says to install the pack that declares it, not the pad by its id. Either
     way nothing is installed, which is the promise; the wording is the plan's. */
  const { api, sql } = await record();
  const out = await put(api, desk());
  assert.equal(out.ok, false, 'the desk installed on a record with nowhere to keep its notes');
  assert.equal(out.refusal?.code, 'REGISTER_UNRESOLVED');
  assert.match(out.refusal?.fix ?? '', /notes list .*Install the pack that declares notes first/u);
  assert.equal(api.kernel.declarations().find((d) => d.id === 'register.parts'), undefined);
  sql.close();
});

test('IT INSTALLS BESIDE EVERY FIRST-PARTY MODULE, asking nobody to press anything and taking no list of theirs', async () => {
  /* MEASURED ON SEPTEMBER 25TH: the survey's list of people, called `people`, is also the People module's list, and on a
     record holding that module the plan answered a conflict over `register.people` rather than an add. A launch's
     helpers are not the record's people, so the desk calls its list `contacts`. */
  const { api, sql } = await record();
  for (const id of FIRST_PARTY) said(await put(api, firstPartyDocument(id)));
  said(await put(api, PAD()));
  const diff = (said<{ diff: Diff }>(await planOf(api, desk()))).diff;
  assert.deepEqual(diff.conflicts, []);
  assert.deepEqual(diff.approve, []);
  said(await put(api, desk()));
  assert.equal(api.kernel.packs().find((p) => p.id === 'launch-desk')?.version, desk().version);
  sql.close();
});

/* ── the desk ─────────────────────────────────────────────────────────── */

test('THE DESK ANSWERS EVERY BLOCK WITH NO REFUSAL, laid out as a main column and a sticky rail holding the pad', async () => {
  const { api, sql } = await desked();
  await launch(api);
  make(api, 'notes', { text: 'Ask the printer whether the box can take a ribbon.' });
  const page = await pageOf(api, 'desk');
  clean(page, 'desk');
  assert.deepEqual(page.layout, { rail: 4, sticky: true });
  const rail = page.blocks.filter((b) => b.area === 'rail');
  assert.deepEqual(rail.map((b) => b.kind), ['section', 'capture', 'cards'], 'the rail is the pad, copied block for block');
  assert.deepEqual(rail[2]!.rows.map((r) => r.fields.text), ['Ask the printer whether the box can take a ribbon.']);
  sql.close();
});

test('THE DESK OPENS ON A SENTENCE FROM ITS OWN FIGURES, and a different one when nothing essential is written or all of it is done', async () => {
  const { api, sql } = await desked();
  assert.deepEqual(leads(await pageOf(api, 'desk')), ['Nothing essential is written down yet. Add the steps this launch cannot go without, and mark them essential.']);

  await launch(api);
  const page = await pageOf(api, 'desk');
  assert.deepEqual(leads(page), ['{{essentials-done}} of the {{essentials}} essential step(s) are done.']);
  const lead = page.blocks.find((b) => (b as Decl).lead === true && b.drawn !== false)!;
  assert.deepEqual(lead.values, { 'essentials-done': 2, essentials: 4 });

  /* EVERY ESSENTIAL STEP TICKED, and the sentence changes rather than reading "4 of the 4". A `when:` reads one figure,
     and the first try held the last two sentences to a count of open essential steps, `gt: 0` and `is: 0`: measured,
     a desk with no essential step at all then said "Nothing essential is written down yet" AND "All 0 essential steps
     are done", since none open is also zero. The share done, an average of a yes or no (`done` defaults to no), is
     three answers in one figure: none when there is nothing to average, below one, and one. */
  const open = said<{ rows: Row[] }>(api.kernel.list({ register: 'steps', where: 'priority is essential, done is not true' } as never)).rows;
  assert.equal(open.length, 2);
  for (const step of open) said(api.kernel.update('steps', step.id, { done: true } as never, { actor: 'p_1', version: step.version }));
  assert.deepEqual(leads(await pageOf(api, 'desk')), ['All {{essentials}} essential step(s) are done.']);
  sql.close();
});

test('THE THREE POINTED COLUMNS: the next open step, the one call waiting, and the last three done', async () => {
  const { api, sql } = await desked();
  await launch(api);
  said(api.kernel.propose({ question: 'Which card stock for the box?', body_kind: 'options', body: { about: 'The box', options: [
    { id: 'kraft', label: 'Brown kraft', because: 'Reads as handmade, and costs least', recommended: true, shows: { swatch: ['#b08d57'] } },
    { id: 'white', label: 'Bright white', because: 'Shows the print sharpest', shows: { swatch: ['#f7f5ef'] } },
  ] } } as never, 'slash'));
  const page = await pageOf(api, 'desk');
  const [move, call, done] = ['Next move', 'Your call', 'Already done'].map((h) => page.blocks.find((b) => b.heading === h)!);
  /* THE SHORT VIEW OF THE PATH IS ONE OPEN STEP, taken in rank order across every part, and the count is of them all. */
  assert.equal(move!.kind, 'steps');
  assert.equal(move!.rows.length, 1);
  assert.equal(move!.rows[0]!.fields.what, 'Test the burn time');
  assert.equal(move!.next, 0);
  assert.equal(call!.kind, 'queue');
  assert.deepEqual(call!.queue?.map((q) => q.question), ['Which card stock for the box?']);
  assert.deepEqual(done!.rows.map((r) => r.fields.what).sort(), ['Ask for a box quote', 'Pick the wax', 'Take the photographs']);
  /* AND THE TILES FURTHER DOWN SHOW EACH OPTION AS WHAT IT IS. */
  const tiles = page.blocks.find((b) => b.kind === 'queue' && (b as Decl).tiles === true)!;
  assert.deepEqual(tiles.queue?.[0]?.options.map((o) => o.shows), [{ swatch: ['#b08d57'] }, { swatch: ['#f7f5ef'] }]);
  sql.close();
});

test('THE PARTS AS CARDS: the big part first, each with its ring and its next open step', async () => {
  const { api, sql } = await desked();
  await launch(api);
  const cards = (await pageOf(api, 'desk')).blocks.find((b) => b.kind === 'cards' && b.area !== 'rail')!;
  assert.equal((cards as Decl).lead, true);
  assert.deepEqual(cards.rows.map((r) => r.fields.name), ['The box', 'The candle', 'The shop page', 'Word of it']);
  /* ONE OF THREE DONE UNDER THE BOX AND UNDER THE CANDLE, the one step under the shop page done, and nothing under the
     last part, whose card says so with no ring rather than an empty one. */
  assert.deepEqual(cards.rings, [33, 33, 100, null]);
  assert.deepEqual(cards.nexts, ['Order a printed sample', 'Test the burn time', null, null]);
  /* EACH PART IN ITS OWN COLOUR, carried on the row as the number it was typed as, and a part with none carries none,
     which the drawer leaves as the plain mark. The picture is read the same way, from the file the part holds. */
  assert.deepEqual(cards.rows.map((r) => r.fields.hue ?? null), [200, 30, null, null]);
  assert.deepEqual(cards.rows.map((r) => r.fields.picture ?? null), [null, null, null, null]);
  sql.close();
});

test('THE CALENDAR PUTS EACH OPEN STEP ON THE DAY IT IS DUE, this month and the next two, earliest first', async () => {
  const { api, sql } = await desked();
  await launch(api);
  const page = await pageOf(api, 'desk');
  clean(page, 'desk');
  const calendar = page.blocks.find((b) => b.kind === 'calendar')!;
  assert.equal(calendar.area, undefined, 'the calendar is in the main column, not the rail that holds the pad');
  assert.deepEqual(calendar.window, { from: '2026-09-01', to: '2026-11-30', today: '2026-09-25' });
  /* THE DONE STEP WITH A DAY, THE STEP PAST NOVEMBER AND THE STEP WITH NO DAY ARE ALL LEFT OFF. */
  assert.deepEqual(
    calendar.rows.map((r) => [r.fields.what, r.fields.due]),
    [
      ['Order a printed sample', '2026-09-30'],
      ['Test the burn time', '2026-10-02'],
      ['Write the card', '2026-10-20'],
    ],
  );
  assert.equal(calendar.matched, 3);
  sql.close();
});

/* ── the tabs ─────────────────────────────────────────────────────────── */

test('ONE TAB SECTION HOLDS THE DESK, ONE PAGE PER PART AND THE NUMBERS, in that order', async () => {
  const { api, sql } = await desked();
  await launch(api);
  const launchPages = api.kernel
    .pages()
    .filter((p) => p.nav?.section === 'Launch')
    .sort((a, b) => a.nav!.order - b.nav!.order);
  /* THE PARTS COME IN THE ORDER THEY WERE WRITTEN, and stay there. They share the template's one `nav.order`, and on
     September 25th the kernel listed a template's pages in its list's default order, the row updated last first: written
     candle, box, shop page, word, they came back word, shop page, box, candle, and a part's tab moved whenever its row
     was edited. A template's pages now keep the list's declared order, or the order the rows were written in. */
  const titles = () => api.kernel.pages().filter((p) => p.nav?.section === 'Launch').sort((a, b) => a.nav!.order - b.nav!.order).map((p) => p.title);
  assert.deepEqual(launchPages.map((p) => p.title), ['Desk', 'The candle', 'The box', 'The shop page', 'Word of it', 'Numbers']);
  const candle = api.kernel.pages().find((p) => p.title === 'The candle')!;
  said(api.kernel.update('parts', `parts#${candle.about!.seq}`, { what: 'Edited last.' } as never, { actor: 'p_1' }));
  assert.deepEqual(titles(), ['Desk', 'The candle', 'The box', 'The shop page', 'Word of it', 'Numbers'], 'editing a part moved its tab');
  assert.ok(launchPages.every((p) => p.nav?.tabs === true), 'a page in the section does not carry tabs, so its strip could disagree');
  sql.close();
});

/* ── a part's page ────────────────────────────────────────────────────── */

test('A PART\'S PAGE ANSWERS EVERY BLOCK: its path, its calls, its pad and its helpers, all of that part only', async () => {
  const { api, sql } = await desked();
  const { box } = await launch(api);
  said(api.kernel.propose({ question: 'Which card stock for the box?', body_kind: 'options', body: { about: 'The box', options: [
    { id: 'kraft', label: 'Brown kraft', because: 'Costs least', recommended: true },
    { id: 'white', label: 'Bright white', because: 'Prints sharpest' },
  ] } } as never, 'slash'));
  said(api.kernel.propose({ question: 'Which scent first?', body_kind: 'options', body: { about: 'The candle', options: [
    { id: 'fig', label: 'Fig', because: 'Sold best at the tasting', recommended: true },
    { id: 'cedar', label: 'Cedar', because: 'Burns cleanest' },
  ] } } as never, 'slash'));
  make(api, 'notes', { text: 'A ribbon on the box, or not?', about: box.id });
  make(api, 'notes', { text: 'Launch in the spring?' });

  const slug = api.kernel.pages().find((p) => p.title === 'The box')!.slug;
  const page = await pageOf(api, slug);
  clean(page, slug);
  assert.deepEqual(page.layout, { rail: 4 });
  const path = page.blocks.find((b) => b.kind === 'steps')!;
  assert.deepEqual(path.rows.map((r) => r.fields.what), ['Order a printed sample', 'Write the card']);
  assert.deepEqual(path.done_now, [false, false]);
  assert.equal(path.next, 0);
  assert.equal(path.matched, 3, 'the short view lost count of the done step it leaves out');
  /* THE ESSENTIALS VIEW IS SAID ROW BY ROW beside every open step, so the switch between it and everything is the
     drawer's alone and asks the record nothing: the sample is essential, and writing the card is only a should. */
  assert.deepEqual((page.blocks.find((b) => b.kind === 'steps') as Decl).short, { where: 'priority is essential', label: 'Essentials' });
  assert.deepEqual(path.short_now, [true, false]);
  const ring = page.blocks.find((b) => b.kind === 'cards')!;
  assert.deepEqual(ring.rings, [33]);
  const calls = page.blocks.find((b) => b.kind === 'queue')!;
  assert.deepEqual(calls.queue?.map((q) => q.question), ['Which card stock for the box?']);
  assert.deepEqual(page.blocks.find((b) => b.heading === 'Who helps')!.rows.map((r) => r.fields.name), ['The box printer']);
  assert.deepEqual(page.blocks.find((b) => b.heading === 'Learned on the way' && b.kind === 'table')!.rows.map((r) => r.fields.lesson), ['Samples take a week']);
  /* THE PAD IN THE RAIL IS THIS PART'S, and a thought typed there is preset to be about it (the next test). */
  const pad = page.blocks.filter((b) => b.area === 'rail' && b.kind === 'cards');
  assert.deepEqual(pad.map((b) => b.rows.map((r) => r.fields.text)), [['A ribbon on the box, or not?']]);
  assert.deepEqual(page.blocks.find((b) => b.kind === 'capture')!.fills, { about: box.id });
  sql.close();
});

test('A CAPTURE PRESETS WHICH PART A NOTE IS ABOUT, so the pad on the page of a part is filtered to the part and keeps what is typed there', async () => {
  /* SECTION 7 SAYS "the pad preset by capture's where". On September 25th, `where: about is {{spoken}}` (the one spelling
     a template fills with the row's own id) answered `fills: {}` on the capture, because a capture preset an enum or a
     text field and never a link, and a cards block filtered the same way would have hidden every thought typed beside it.
     The capture now presets a link named by its spoken id or row id (`captureFills` in `packages/kernel/src/pages.ts`),
     so the pack filters both blocks. */
  const { api, sql } = await desked();
  const { box } = await launch(api);
  const capture = api.kernel.block({ kind: 'capture', register: 'notes', where: `about is parts#${box.seq}` } as never) as unknown as Block;
  assert.deepEqual(capture.refusals, []);
  assert.deepEqual(capture.fills, { about: box.id });
  /* WHAT THE HOST WRITES WITH THOSE FILLS IS WHAT THE PAD BESIDE IT DRAWS. */
  make(api, 'notes', { text: 'Kraft looks warmer.', ...capture.fills });
  const slug = api.kernel.pages().find((p) => p.title === 'The box')!.slug;
  const pad = (await pageOf(api, slug)).blocks.find((b) => b.area === 'rail' && b.kind === 'cards')!;
  assert.deepEqual(pad.rows.map((r) => r.fields.text), ['Kraft looks warmer.']);
  sql.close();
});

/* ── the numbers ──────────────────────────────────────────────────────── */

const TYPE_THEM = 'Type a price and the three costs above, and the verdict is said here.';
const PASSES = 'It passes: the costs are {{cost-share}} of the price.';
const THIN = 'Too thin: the costs are {{cost-share}} of the price. Raise the price or bring a cost down until they are at most two fifths of it.';
const UNJUDGED = 'The costs are not added up yet. They are added whenever a cost is typed, so type one of them again to see the verdict.';
const FREE = 'At a price of 0 there is nothing for the costs to be a share of, and every one sold loses what it cost to make, pack and send. Type the price it sells for.';

/** Every note the numbers page draws now, which is the verdict and nothing else on that page. */
const verdict = (p: Page): string[] => p.blocks.filter((b) => b.kind === 'note' && b.drawn !== false).map((b) => String((b as Decl).body));
/** The figures under the verdict, as the tiles read them. */
const tilesOf = (p: Page): [string, unknown][] => p.blocks.find((b) => b.kind === 'stat')!.readings!.map((r) => [r.metric, r.reading?.value ?? null]);

/**
 * WHAT THE INPUTS WRITE, AS THE APP WRITES IT: one field at a time through the row writer, with the row's version, into
 * the row the inputs block answers. Then the cost script is run to the end, the way a host runs it after a write, unless
 * `settled` is false, which is the page as it reads before the host has run anything: on the Worker, until the Durable
 * Object's alarm.
 */
async function typeIn(api: Api, figures: Record<string, number | null>, settled = true): Promise<Page> {
  const id = (await pageOf(api, 'numbers')).blocks.find((b) => b.kind === 'inputs')!.rows[0]!.id;
  for (const [field, value] of Object.entries(figures)) {
    const row = rowOf(api, id);
    said(api.kernel.update('checks', row.id, { [field]: value } as never, { actor: 'p_1', version: row.version }));
  }
  if (settled) await settle(api);
  return pageOf(api, 'numbers');
}

test('THE NUMBERS: the inputs edit the one check row, and the verdict flips when a price moves the cost share past two fifths', async () => {
  const { api, sql } = await desked();
  await launch(api);
  let page = await pageOf(api, 'numbers');
  clean(page, 'numbers');
  const inputs = page.blocks.find((b) => b.kind === 'inputs')!;
  assert.equal(inputs.rows.length, 1, 'the pack seeds the one row the inputs type into');
  assert.deepEqual(inputs.types, { price: 'decimal', making: 'decimal', packing: 'decimal', sending: 'decimal' });
  assert.deepEqual(verdict(page), [TYPE_THEM]);

  /* A PRICE ALONE IS NOT A VERDICT: with no cost written the share would read nothing as 0 and pass. */
  assert.deepEqual(verdict(await typeIn(api, { price: 30 })), [TYPE_THEM]);
  page = await typeIn(api, { making: 6, packing: 2.5, sending: 1.5 });
  assert.equal(rowOf(api, inputs.rows[0]!.id).fields.cost, 10, 'the script did not add the three costs');
  assert.deepEqual(verdict(page), [PASSES]);
  assert.deepEqual(tilesOf(page), [['price', 30], ['costs', 10], ['cost-share', 1 / 3], ['least-price', 25]]);

  page = await typeIn(api, { price: 20 });
  assert.deepEqual(verdict(page), [THIN]);

  /* THE BUDGET AS RANGES, one band a line and the spend on it, over every line of the launch. */
  const range = page.blocks.find((b) => b.kind === 'progress')!;
  assert.equal((range as Decl).range, true);
  assert.deepEqual(range.rows.map((r) => r.fields.item), ['Wax and wicks', 'Printed boxes']);
  sql.close();
});

test('THE VERDICT READS THE ONE ROW THE INPUTS TYPE INTO, whatever other checks the list holds', async () => {
  /* MEASURED ON 1.0.1 (`loop/research-audit-2026-09-25-layouts.md` finding 5): the figures summed every check while the
     inputs edited only the first, so a first check at 20 and 10, which is half and too thin, beside a second at 100 and
     10 read as 120 and 20, a sixth, and "It passes". The inputs now name their row, `row: checks#1`, and every figure
     under them reads `seq is 1`, so the row typed into and the row judged are the same one by what the file says, not
     by which row happens to sort first. */
  const { api, sql } = await desked();
  assert.deepEqual(verdict(await typeIn(api, { price: 20, making: 6, packing: 2.5, sending: 1.5 })), [THIN]);
  make(api, 'checks', { what: 'A dearer candle', price: 100, making: 6, packing: 2.5, sending: 1.5 });
  await settle(api);
  const page = await pageOf(api, 'numbers');
  assert.deepEqual(verdict(page), [THIN], 'a second check changed the verdict on the first');
  assert.deepEqual(tilesOf(page), [['price', 20], ['costs', 10], ['cost-share', 0.5], ['least-price', 25]]);
  sql.close();
});

/**
 * THE VERDICT IS READ LIVE FROM THE FIGURES BESIDE IT, NEVER FROM A FLAG A SCRIPT STORED. The rework before this one stored
 * `passes` from the cost script, and the script runs after a write (on the Worker, only at the Durable Object's alarm), so
 * between a price typed and that run the page said "It passes" beside a live share of 0.5. The page is read here with no
 * script run after the price is typed, and the verdict is already the one the figures on it say.
 */
test('A PRICE TYPED IS JUDGED AT ONCE, before any script has run: the verdict never disagrees with the share beside it', async () => {
  const { api, sql } = await desked();
  assert.deepEqual(verdict(await typeIn(api, { price: 30, making: 6, packing: 2.5, sending: 1.5 })), [PASSES]);
  assert.ok(!desk().declarations.some((d) => d.register === 'checks' && (d.fields as { type: string }[]).some((f) => f.type === 'bool')), 'the check stores a verdict');

  let page = await typeIn(api, { price: 20 }, false);
  assert.deepEqual(tilesOf(page), [['price', 20], ['costs', 10], ['cost-share', 0.5], ['least-price', 25]]);
  assert.deepEqual(verdict(page), [THIN]);
  page = await typeIn(api, { price: 25 }, false);
  assert.deepEqual(verdict(page), [PASSES], 'two fifths exactly, typed and not yet settled');
  page = await typeIn(api, { price: 24.99 }, false);
  assert.deepEqual(verdict(page), [THIN]);
  /* AND A PRICE OF 0, TYPED AND NOT SETTLED, IS SAID SO AT ONCE. */
  assert.deepEqual(verdict(await typeIn(api, { price: 0 }, false)), [FREE]);
  sql.close();
});

test('NO VERDICT WHILE A COST IS MISSING, and none either when one is cleared after the verdict was given', async () => {
  /* MEASURED ON 1.0.1: with only making typed, 6 on a price of 30, the cost was 6 and the verdict "It passes", and with
     making cleared again the cost kept packing and sending, 4, and still passed. A share of some of the costs is not
     the share of the costs. */
  const { api, sql } = await desked();
  assert.deepEqual(verdict(await typeIn(api, { price: 30, making: 6 })), [TYPE_THEM]);
  const row = (await pageOf(api, 'numbers')).blocks.find((b) => b.kind === 'inputs')!.rows[0]!;
  assert.equal(rowOf(api, row.id).fields.cost ?? null, null, 'one cost of three was added up as if it were all of them');
  assert.deepEqual(verdict(await typeIn(api, { packing: 2.5, sending: 1.5 })), [PASSES]);
  const page = await typeIn(api, { making: null });
  assert.deepEqual(verdict(page), [TYPE_THEM]);
  /* THE TILES READ THE ONE ROW WITH max AND NOT sum. Measured with sum: a row whose cost was cleared drew "Costs
     together 0", since a sum over nothing is 0, and a cost nobody knows is not a cost of nothing. */
  assert.deepEqual(tilesOf(page), [['price', 30], ['costs', null], ['cost-share', null], ['least-price', null]]);
  sql.close();
});

test('A PRICE OF 0 IS SAID SO, rather than leaving the verdict blank and the prompt to type a price hidden', async () => {
  /* MEASURED ON 1.0.1: price 0 with all three costs gave a share of nothing, no verdict, and a count of priced checks of
     1, so the page said nothing at all under the inputs. */
  const { api, sql } = await desked();
  assert.deepEqual(verdict(await typeIn(api, { price: 0, making: 6, packing: 2.5, sending: 1.5 })), [FREE]);
  /* AND AT 0 WITH A COST STILL MISSING, the one thing to say is what to type. */
  assert.deepEqual(verdict(await typeIn(api, { sending: null })), [TYPE_THEM]);
  sql.close();
});

test('TWO FIFTHS EXACTLY PASSES, and a thousandth of a pound over it does not', async () => {
  /* MEASURED ON 1.0.1: making 4.004 on a price of 10 was rounded to a cost of 4 by the script, the share read exactly
     0.4, and it passed. And the share itself is a division of two doubles: 0.14 of 0.35 is two fifths, and divided it
     reads 0.4000000000000001, which a comparison with 0.4 calls too thin (a sweep of every price to 200.00 in pence,
     with the costs just under, at and just over two fifths, found 141 of 59998 judged the wrong way, every one of them
     a share of exactly two fifths). So the script adds the costs in whole numbers and works out the least price, five
     halves of them, the same way, and the verdict is the sign of the price less that least price: two numbers of at most
     fifteen significant digits, which doubles hold apart, so the sign is never a rounding. */
  const { api, sql } = await desked();
  assert.deepEqual(verdict(await typeIn(api, { price: 10, making: 4.004, packing: 0, sending: 0 })), [THIN]);
  const row = (await pageOf(api, 'numbers')).blocks.find((b) => b.kind === 'inputs')!.rows[0]!;
  assert.equal(rowOf(api, row.id).fields.cost, 4.004, 'the costs were rounded before they were compared');
  assert.deepEqual(verdict(await typeIn(api, { making: 4 })), [PASSES]);
  assert.deepEqual(verdict(await typeIn(api, { price: 0.35, making: 0.1, packing: 0.04 })), [PASSES]);
  assert.deepEqual(verdict(await typeIn(api, { packing: 0.041 })), [THIN]);
  /* AND THE THREE ADDED UP EXACTLY, where 0.1 and 0.2 and 0.1 added as doubles are 0.4000000000000001. */
  assert.deepEqual(verdict(await typeIn(api, { price: 1, making: 0.1, packing: 0.2, sending: 0.1 })), [PASSES]);
  assert.equal(rowOf(api, row.id).fields.cost, 0.4);
  assert.equal(rowOf(api, row.id).fields.least, 1);
  sql.close();
});

test('A RECORD ON 1.0.1 TAKES THIS VERSION, and a check it already filled says so until a cost is typed again', async () => {
  /* The published 1.0.1, as the catalogue serves it, with its check filled in and costed by the 1.0.1 script. */
  const { api, sql } = await record();
  said(await put(api, PAD()));
  said(await put(api, JSON.parse(readFileSync(new URL('../../apps/web/static/catalogue/packs/launch-desk/1.0.1.pack.json', import.meta.url), 'utf8'))));
  await typeIn(api, { price: 20, making: 6, packing: 2.5, sending: 1.5 });
  const diff = said<{ diff: Diff }>(await planOf(api, desk())).diff;
  assert.deepEqual(diff.conflicts, []);
  said(await put(api, desk()));
  assert.equal(api.kernel.packs().find((p) => p.id === 'launch-desk')?.version, desk().version);
  /* THE SCRIPT RUNS ON A WRITE AND NOT ON AN UPGRADE, so the row 1.0.1 filled has no least price from it yet, and a price
     is not a cost: the script runs on the three costs alone, so a price typed says the same until a cost is typed. */
  assert.deepEqual(verdict(await pageOf(api, 'numbers')), [UNJUDGED]);
  assert.deepEqual(verdict(await typeIn(api, { price: 25 })), [UNJUDGED]);
  assert.deepEqual(verdict(await typeIn(api, { making: 5 })), [PASSES]);
  sql.close();
});

test('A RECORD ON 1.1.0 TAKES 2.0.0 WITH ITS PARTS AND STEPS KEPT, and a colour and a due day typed after it are drawn', async () => {
  /* The published 1.1.0, as the catalogue serves it, holding a part and a step typed before a part had a colour or a
     step a day. The new fields are added beside the rows, so nothing a person typed is asked about or lost. */
  const { api, sql } = await record();
  said(await put(api, PAD()));
  said(await put(api, JSON.parse(readFileSync(new URL('../../apps/web/static/catalogue/packs/launch-desk/1.1.0.pack.json', import.meta.url), 'utf8'))));
  const box = make(api, 'parts', { name: 'The box', what: 'What each candle ships in.', big: true });
  const step = make(api, 'steps', { what: 'Order a printed sample', part: box.id, priority: 'essential', done: false, rank: 1 });
  const diff = said<{ diff: Diff }>(await planOf(api, desk())).diff;
  assert.deepEqual(diff.conflicts, []);
  said(await put(api, desk()));
  assert.equal(api.kernel.packs().find((p) => p.id === 'launch-desk')?.version, '2.0.0');
  assert.equal(rowOf(api, box.id).fields.name, 'The box');

  said(api.kernel.update('parts', box.id, { hue: 200 } as never, { actor: 'p_1', version: rowOf(api, box.id).version }));
  said(api.kernel.update('steps', step.id, { due: '2026-10-01' } as never, { actor: 'p_1', version: rowOf(api, step.id).version }));
  const page = await pageOf(api, 'desk');
  clean(page, 'desk');
  assert.deepEqual(page.blocks.find((b) => b.kind === 'cards' && b.area !== 'rail')!.rows.map((r) => r.fields.hue), [200]);
  assert.deepEqual(page.blocks.find((b) => b.kind === 'calendar')!.rows.map((r) => r.fields.what), ['Order a printed sample']);
  sql.close();
});

/* ── nothing in the shell knows it ────────────────────────────────────── */

test('NOTHING IN packages/ OR apps/ NAMES THE DESK: not the page this was modelled on, and not the pack\'s own ids', () => {
  /* WORD BY WORD, because `-i -e tima` alone matches "estimate" and "verbatim" (measured: 92 lines, none of them about
     the desk). `git grep` exits 1 when it finds nothing, which is the pass. Untracked files count, so a file written
     today and not yet committed is searched too.
     TWO PLACES ARE LEFT OUT, and neither is the shell knowing the desk. The catalogue the app ships is this pack copied
     by `tools/catalogue/from-packs.mjs` (measured: the first run of this test after publishing found `launch-desk` in
     `apps/web/static/catalogue/index.json`). And a test is allowed to read the file from `packs/`, as brief D9's agent
     test does (`packages/mcp/test/compose-page.test.ts` names this file's path), because installing the pack is how a
     test proves the shell can say it. */
  const grep = (words: readonly string[]): string => {
    try {
      const where = ['packages', 'apps', ':!apps/web/static/catalogue', ':!**/test/**', ':!**/*.test.ts'];
      return execFileSync('git', ['grep', '--untracked', '-n', '-i', '-w', ...words.flatMap((w) => ['-e', w]), '--', ...where], { cwd: fileURLToPath(ROOT), encoding: 'utf8' });
    } catch (e) {
      if ((e as { status?: number }).status === 1) return '';
      throw e;
    }
  };
  /* THE SAME CALL FINDS A WORD THE SHELL DOES SAY, so an empty answer below is a search that ran and found nothing,
     not one that never looked. */
  assert.notEqual(grep(['planPack']), '');
  const found = grep(['tima', 'trunk', "tima's", 'trunk', 'launch-desk', 'essentials-done', 'essentials-share', 'cost-share', 'price-room', 'least-price', 'price-free', 'price-unjudged']);
  assert.equal(found, '', `the shell names the desk:\n${found}`);
});
