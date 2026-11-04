/**
 * Rule sheet: fourteen pages in one tabbed section, Values, Blocks, Counts, Layout and Tab 5 to Tab 14, and a page for
 * the project called Rule sheet holding the Counts ring as a project draws it. Each block is written to show one rule of a value, a block or a
 * layout, so a gate (`tools/gates/rule-sheet.mjs`) can open the pages on a real record and read each rule where a person
 * sees it, by the facts in `expect.json`.
 *
 * WHAT THIS FILE HOLDS IS THAT THE SHEET IS WHAT IT SAYS: it installs on a fresh record with nothing to approve, every
 * page reads, the one block written to be refused is refused and nothing else is, both write-ups parse into the blocks
 * and values the rules name, the rings count what the brief says they count, and a heading of 81 bytes, which is not in
 * the add-on, is refused when somebody tries to install it.
 *
 * NOTHING HERE IS ABOUT ANYBODY. The tasks written below are invented, and the sheet reads whatever tasks a record holds.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { readCatalogueFile, readPackFile } from '../../packages/declare/src/catalogue.ts';
import { checkInScratch } from '../../apps/cli/src/scratch.ts';
import { createRecordApi, type CallContext } from '../../packages/record/src/index.ts';
import { fixedClock, openSqlite } from '../../packages/kernel/test/sqlite.ts';
import { firstPartyDocument } from '../../packages/seed/src/index.ts';
import { parse, type Segment } from '../../packages/render/src/parse.ts';
import { inline } from '../../packages/render/src/inline.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

type Refusal = { code: string; fix: string; at?: string };
type Out = { ok: boolean; value?: unknown; refusal?: Refusal };
const said = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};

type Api = Awaited<ReturnType<typeof createRecordApi>>;
type Diff = { planHash: string; approve: unknown[]; conflicts: unknown[] };
type Answered = {
  kind: string;
  heading?: string;
  body?: string;
  refusals: Refusal[];
  rows: { fields: Record<string, unknown> }[];
  values?: Record<string, unknown>;
  drawn?: boolean;
  why?: string;
};
type Decl = { page: string; title: string; nav?: { section: string; order: number; tabs?: boolean }; for?: unknown; blocks: Answered[] };
type Pack = { pack: string; title: string; declarations: Decl[] };

/** The file as it ships, read fresh each time so no test can hand the next one a copy it changed. */
const PACK_FILE = new URL('./rule-sheet.pack.json', import.meta.url);
const pack = (): Pack => JSON.parse(readFileSync(PACK_FILE, 'utf8')) as Pack;
const declared = (id: string): Decl => pack().declarations.find((d) => d.page === id)!;

/** 9 October 2026, noon: the day the tasks below are dated around. */
const NOW = Date.UTC(2026, 9, 9, 12);

/** The fourteen pages of the section, in the order the tabs draw them. */
const SECTION = ['rule-sheet-values', 'rule-sheet-blocks', 'rule-sheet-counts', 'rule-sheet-layout', ...Array.from({ length: 10 }, (_, i) => `rule-sheet-tab-${i + 5}`)];

/** A fresh record holding Work and the two lists Work links a task to, as `packs/roadmap` makes one. */
async function fresh(): Promise<{ api: Api; close: () => void }> {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  for (const id of ['portfolio', 'people', 'work']) said(await put(api, firstPartyDocument(id, { seeds: [] })));
  return { api, close: () => sql.close() };
}

const planOf = async (api: Api, doc: unknown): Promise<Out> => (await api.planPack({ doc, source: { kind: 'local' } } as never, owner)) as Out;

/** Plan and install with exactly what the plan asked to be approved, or the plan's refusal. */
async function put(api: Api, doc: unknown): Promise<Out> {
  const plan = await planOf(api, doc);
  if (!plan.ok) return plan;
  const diff = (plan.value as { diff: Diff }).diff;
  return (await api.installPack({ doc, source: { kind: 'local' }, planHash: diff.planHash, approve: diff.approve } as never, owner)) as Out;
}

/**
 * Two projects and six tasks: two on Rule sheet (one done), one on Portage (open, with no due day), and three on no project
 * (two done, one of those with no due day). Rule sheet is parked, so Portfolio draws no page of its own for it.
 */
function seed(api: Api): void {
  said(api.kernel.create('things', { name: 'Rule sheet', lane: 'parked' }, { actor: 'p_1' }));
  said(api.kernel.create('things', { name: 'Portage', lane: 'building' }, { actor: 'p_1' }));
  for (const fields of [
    { what: 'Fire the test tiles', state: 'done', thing: 'things#1', by: '2026-10-01', done_on: '2026-10-01' },
    { what: 'Glaze the second batch', state: 'open', thing: 'things#1', by: '2026-10-20' },
    { what: 'Order more clay', state: 'done', by: '2026-10-02', done_on: '2026-10-03' },
    { what: 'Write the price list', state: 'done', done_on: '2026-10-05' },
    { what: 'Book the winter fair', state: 'open', by: '2026-11-20' },
    { what: 'Sand the new floor', state: 'open', thing: 'things#2' },
  ])
    said(api.kernel.create('tasks', fields, { actor: 'p_1' }));
}

async function pageOf(api: Api, slug: string): Promise<{ title: string; blocks: Answered[] }> {
  return said<{ title: string; blocks: Answered[] }>(await api.page({ slug }, owner));
}

const block = (page: { blocks: Answered[] }, heading: string): Answered => {
  const found = page.blocks.find((b) => b.heading === heading);
  assert.ok(found, `no block is headed ${heading}`);
  return found;
};

/** A write-up's body as it ships, parsed as a page's note draws it (`apps/web` `drawSegments`). */
const segments = (page: string): Segment[] => parse(declared(page).blocks[0]!.body!, { page: true });

test('BEFORE THE ADD-ON: a record with Work has no Rule sheet page', async () => {
  const { api, close } = await fresh();
  seed(api);
  const slugs = said<{ slug: string }[]>(await api.pages(owner)).map((p) => p.slug);
  assert.ok(!slugs.some((s) => s.startsWith('rule-sheet')), 'a rule sheet page answered before the add-on was installed');
  close();
});

test('THE FILE IS ONE SECTION, "Rule sheet", drawn as tabs over fourteen pages, and reads as an add-on from disk', async () => {
  const file = pack();
  assert.equal(file.title, 'Rule sheet');
  const tabbed = file.declarations.filter((d) => d.nav);
  assert.deepEqual(tabbed.map((d) => d.page), SECTION);
  assert.ok(tabbed.every((d) => d.nav?.section === 'Rule sheet' && d.nav.tabs === true), 'a page of the section is not a tab');
  const orders = tabbed.map((d) => d.nav!.order);
  assert.deepEqual(orders, [...orders].sort((a, b) => a - b), 'the tabs are not in the order the pages are written');
  /* THE PROJECT'S PAGE HAS NO PLACE IN THE SECTION, so the strip stays fourteen tabs however many projects there are. */
  assert.deepEqual(file.declarations.filter((d) => !d.nav).map((d) => d.page), ['rule-sheet-project']);
  const read = said<{ pack: { manifest: { pack: string; title: string } } }>(await readPackFile(readFileSync(PACK_FILE, 'utf8')));
  assert.deepEqual([read.pack.manifest.pack, read.pack.manifest.title], ['rule-sheet', 'Rule sheet']);
});

test('IT INSTALLS ON A FRESH RECORD with nothing to approve, and every page of the section is listed', async () => {
  const { api, close } = await fresh();
  const plan = said<{ diff: Diff }>(await planOf(api, pack())).diff;
  assert.deepEqual(plan.approve, [], 'pages over a list the record already has need no approval');
  assert.deepEqual(plan.conflicts, []);
  said(await put(api, pack()));
  seed(api);
  const slugs = said<{ slug: string }[]>(await api.pages(owner)).map((p) => p.slug);
  for (const slug of SECTION) assert.ok(slugs.includes(slug), `${slug} is not listed`);
  assert.ok(slugs.includes('rule-sheet'), 'the project called Rule sheet has no page of its own');
  assert.ok(!slugs.includes('portage'), 'a project not called Rule sheet was given a page');
  close();
});

test('EVERY PAGE READS, and the one block written to be refused is the only refusal on the sheet', async () => {
  const { api, close } = await fresh();
  said(await put(api, pack()));
  seed(api);
  const refused: string[] = [];
  for (const slug of [...SECTION, 'rule-sheet']) {
    const page = await pageOf(api, slug);
    for (const b of page.blocks) if (b.refusals.length) refused.push(`${slug}: ${b.heading} ${b.refusals[0]!.code}`);
  }
  assert.deepEqual(refused, ['rule-sheet-blocks: A filter that cannot be read ENUM_VALUE_UNKNOWN']);
  /* AN UNREADABLE FILTER MATCHES NOTHING AND SAYS SO, never dropped to show every task. */
  const unread = block(await pageOf(api, 'rule-sheet-blocks'), 'A filter that cannot be read');
  assert.deepEqual(unread.rows, []);
  close();
});

test('VALUES: every path form names what the record holds, and a long field or a name of nothing is not read', async () => {
  const { api, close } = await fresh();
  said(await put(api, pack()));
  seed(api);
  const note = block(await pageOf(api, 'rule-sheet-values'), 'Values in text');
  assert.deepEqual(note.values, {
    'open-tasks': 3,
    'open-tasks.first': 'Sand the new floor',
    'tasks.count': 6,
    'tasks.open': 3,
    'tasks#1.what': 'Fire the test tiles',
    'tasks#1.by': '2026-10-01',
  });
  close();
});

test('VALUES: every typed form with a literal draws, and a loose or broken one stays as typed, marked', () => {
  const nodes = inline(declared('rule-sheet-values').blocks[0]!.body!.replace(/\n/g, ' '), { now: NOW, resolve: () => null }) as {
    type: string;
    form?: string;
    text?: string;
    kind?: string;
    source?: string;
    name?: string;
  }[];
  const typed = nodes.filter((n) => n.type === 'typed').map((n) => `${n.form} ${n.text}`);
  assert.deepEqual(typed, [
    /* A DAY AND HOW FAR OFF IT IS ARE JOINED AS A SENTENCE WRITES THEM, SINCE 30 October (7717c524a), where a dot stood. */
    'date 24 Dec 2030, in 4 years',
    'day 10 Apr 2020, 6 years ago',
    'until in 3 years',
    'ago 7 years ago',
    'money EGP 1,299.00',
    'money GBP −42.00',
    'money CLF 100.0000',
    'money UYW 12.3456',
    'money JPY 900,719,925,474,099,312',
    'quantity 1.4 m',
    'quantity −2.5 kg',
    'quantity −1,299',
    'pct −46.3%',
    'ref #1',
  ]);
  assert.deepEqual(nodes.filter((n) => n.type === 'unresolved').map((n) => n.text), ['12 %', '12.50 GBP', '2026-13-45']);
  assert.deepEqual(nodes.filter((n) => n.type === 'code').map((n) => n.text), ['{{open-tasks}}']);
  assert.deepEqual(nodes.filter((n) => n.type === 'icon').map((n) => n.name), ['rocket']);
  assert.deepEqual(
    nodes.filter((n) => n.type === 'evidence').map((n) => `${n.kind}${n.source ? `: ${n.source}` : ''}`),
    ['verified', 'verified: the bank statement', 'inferred', 'inferred: two invoices', 'estimate', "estimate: last quarter's pace", 'unknown', 'unknown: nobody has asked'],
  );
  assert.ok(nodes.some((n) => n.type === 'path' && (n as { path?: string }).path === 'no-such-figure'), 'the name of nothing was not kept as written');
});

test('BLOCKS: the write-up parses into the blocks each rule names, and a block written wrongly is shown with what is wrong', () => {
  const parts = segments('rule-sheet-blocks').filter((s) => s.type !== 'markdown');
  const said = parts.map((s) => (s.type === 'block' ? `${s.kind} ${s.heading} ${s.rows.length}` : `${s.code} ${s.raw.split('\n')[0]}`));
  assert.deepEqual(said, [
    'stat Six figures 6',
    'DIALECT_ARITY ```stat | Seven figures',
    'chips Chips 4',
    'bar Hours by project 3',
    'chips Tone aliases 4',
    'note A note 3',
    'ring Five parts 5',
    'DIALECT_ARITY ```ring | Six parts',
  ]);
  const at = (heading: string) => parts.find((s) => s.type === 'block' && s.heading === heading) as Extract<Segment, { type: 'block' }>;
  /* THE FOUR COLOUR WORDS ARE READ AS THE TONES THEY STAND FOR, not refused. */
  assert.deepEqual(at('Tone aliases').rows.map((r) => r.tone), ['good', 'bad', 'info', 'warn']);
  /* AN EMPTY CELL KEEPS ITS PLACE: the chip with no number and the one with no word each still hold three cells. */
  assert.deepEqual(at('Chips').rows.map((r) => r.cells.length), [3, 3, 3, 3]);
  /* THE BLOCK INSIDE THE NOTE DID NOT NEST: its opening line is the note's text, and the line after its closing marks is
     outside the note. */
  assert.equal(at('A note').rows[1]!.cells[0], '```stat | Inside the note');
  const after = segments('rule-sheet-blocks').findIndex((s) => s.type === 'block' && s.heading === 'A note') + 1;
  const next = segments('rule-sheet-blocks')[after]!;
  assert.ok(next.type === 'markdown' && next.text.includes('This line is outside the note'), 'the line after the inner block was swallowed');
});

/** A ring's one reading, as `label value of target`. */
const ring = (b: Answered): string => {
  assert.deepEqual(b.refusals, [], `${b.heading} was refused`);
  const f = b.rows[0]?.fields ?? {};
  return `${String(f.label)} ${String(f.value)} of ${String(f.target)}`;
};

test('COUNTS: a ring counts within its own scope, of: names another whole, and on a project it counts that project', async () => {
  const { api, close } = await fresh();
  said(await put(api, pack()));
  seed(api);
  const counts = await pageOf(api, 'rule-sheet-counts');
  /* THE WHERE IS THE PART AND THE LIST THE WHOLE: three of six tasks are done. The label is the heading, never the sentence. */
  assert.equal(ring(block(counts, 'Tasks done')), 'Tasks done 3 of 6');
  /* OF: IS ANOTHER WHOLE, AND THE PART STAYS INSIDE IT: of the four with a due day, two are done. */
  assert.equal(ring(block(counts, 'Done of the dated')), 'Done of the dated 2 of 4');
  /* THE SAME RING ON A PROJECT'S PAGE INHERITS IT: the project's two and the three on no project, and never Portage's. */
  const project = await pageOf(api, 'rule-sheet');
  assert.equal(project.title, 'Counts on Rule sheet');
  assert.equal(ring(block(project, 'Tasks done here')), 'Tasks done here 3 of 5');
  /* THE HEAT IS A DAY A TASK WAS FINISHED, inside its own twelve weeks. */
  const heat = block(counts, 'Finished, by day');
  assert.deepEqual(heat.refusals, []);
  assert.equal(heat.rows.length, 3);
  close();
});

test('LAYOUT: a rail whose only block is held back by when: is not drawn, and every other block is', async () => {
  const { api, close } = await fresh();
  said(await put(api, pack()));
  seed(api);
  const layout = await pageOf(api, 'rule-sheet-layout');
  const rail = block(layout, 'Only in the rail');
  assert.deepEqual([rail.drawn, rail.why], [false, 'when']);
  assert.deepEqual(layout.blocks.filter((b) => b !== rail && b.drawn === false).map((b) => b.heading ?? b.kind), []);
  /* THE WIDTHS THE RULE NAMES ARE ALL ON THE PAGE, each block saying its own. */
  const spans = declared('rule-sheet-layout').blocks.map((b) => (b as { span?: number }).span);
  for (const span of [3, 4, 6, 8, 12]) assert.ok(spans.includes(span), `no block is ${span} wide`);
  close();
});

/** Eighty-one bytes: one past the most a heading may hold (`HEADING_BYTES` in `packages/kernel/src/declare.ts`). */
const H81 = 'A heading of eighty-one bytes, one byte past what a heading may hold, is refused.';
const withHeading = (heading: string): Pack => {
  const doc = pack();
  doc.declarations.find((d) => d.page === 'rule-sheet-blocks')!.blocks.push({ kind: 'note', heading, body: 'Never installed.' } as never);
  return doc;
};

test('A HEADING OF 81 BYTES IS NOT IN THE ADD-ON: installing one is refused, and one of 80 installs', async () => {
  assert.equal(Buffer.byteLength(H81), 81);
  assert.ok(!JSON.stringify(pack()).includes(H81));
  const { api, close } = await fresh();
  const refused = await put(api, withHeading(H81));
  assert.equal(refused.ok, false, 'a heading of 81 bytes installed');
  assert.equal(refused.refusal?.code, 'OUT_OF_BOUNDS', JSON.stringify(refused.refusal));
  assert.match(String(refused.refusal?.fix), /heading measures 81 bytes, and the ceiling is 80/u);
  said(await put(api, withHeading(H81.slice(0, 80))));
  close();
});

test('IT CHECKS AS braindog pack check CHECKS IT: installed in a scratch record after the modules, and no warning', async () => {
  const read = await readCatalogueFile(readFileSync(PACK_FILE, 'utf8'));
  if (!read.ok) assert.fail('refusal' in read ? `${read.refusal.code}: ${read.refusal.fix}` : 'rule-sheet.pack.json did not read.');
  const checked = await checkInScratch(read.value, false, NOW);
  assert.ok(checked.ok, checked.lines.join('\n'));
  assert.deepEqual(checked.lines.filter((line) => line.includes('Warning')), [], 'a key in the manifest is one the Kennel does not take');
});

test('EXPECT.JSON NAMES ONLY PAGES THE SHEET HAS, and every rule says where to look and what to read there', () => {
  type Rule = { rule: string; page: string; selector: string; count?: number; text?: string; attr?: string; style?: string; is?: string };
  const file = JSON.parse(readFileSync(new URL('./expect.json', import.meta.url), 'utf8')) as { pages?: Record<string, string>; rules: Rule[] };
  const titles = new Set([...pack().declarations.filter((d) => d.nav).map((d) => d.title), ...Object.keys(file.pages ?? {})]);
  assert.deepEqual(file.pages, { 'Counts on Rule sheet': '/p/rule-sheet' });
  for (const r of file.rules) {
    assert.ok(titles.has(r.page), `${r.rule} is read on ${r.page}, which the sheet does not draw`);
    assert.ok(r.selector.trim() !== '', `${r.rule} names no selector`);
    assert.ok(['count', 'text', 'attr', 'style'].some((k) => k in r), `${r.rule} says nothing to read`);
    assert.ok(!r.rule.includes('—'), `${r.rule} holds an em dash`);
  }
  /* EVERY PAGE OF THE SHEET IS READ, and the tab page that stands for the ten. */
  for (const page of ['Values', 'Blocks', 'Counts', 'Layout', 'Tab 5', 'Counts on Rule sheet'])
    assert.ok(file.rules.some((r) => r.page === page), `no rule is read on ${page}`);
});

/* ── 1.1.0: a project's own values, and a day in two zones (PGS-B03 job d) ──────────────── */

/** 1.0.0 as the catalogue published it at 63423720, never changed in place: the version an update starts from. */
const RELEASED = new URL('../../apps/web/static/catalogue/packs/rule-sheet/1.0.0.pack.json', import.meta.url);

/** The invented project of expect.json's example, the one row the gate's own-value lines are read off. */
const EXAMPLE = (JSON.parse(readFileSync(new URL('./expect.json', import.meta.url), 'utf8')) as { example: Record<string, { list: string; fields: Record<string, unknown> }> }).example['Counts on Rule sheet']!;

/** A body as a page's note reads it: each value drawn as text, a value with nothing to show as the dash. */
const drawn = (body: string, values: Record<string, unknown>, now = NOW, zone?: string): string =>
  (inline(body.replace(/\n/g, ' '), { now, ...(zone ? { zone } : {}), resolve: (p) => (p in values ? (values[p] === null ? null : String(values[p])) : null) }) as { type: string; text?: string; resolved?: string | null }[])
    .map((n) => (n.type === 'path' ? (n.resolved ?? '—') : (n.text ?? '')))
    .join('');

test('AN UPDATE FROM 1.0.0 INSTALLS WITH NO REFUSAL AND KEEPS EVERY ROW, and the project page gains its own values', async () => {
  const was = JSON.parse(readFileSync(RELEASED, 'utf8')) as Pack & { version: string };
  assert.equal(was.version, '1.0.0');
  assert.equal((pack() as Pack & { version: string }).version, '1.1.2');
  const { api, close } = await fresh();
  said(await put(api, was));
  seed(api);
  const names = (register: string): unknown[] => said<{ rows: { fields: Record<string, unknown> }[] }>(api.kernel.list({ register, limit: 50 })).rows.map((r) => r.fields.name ?? r.fields.what);
  const held = [names('things'), names('tasks')];
  const before = (await pageOf(api, 'rule-sheet')).blocks.map((b) => b.heading);
  assert.ok(!before.includes('Its own values'), '1.0.0 already drew its own values');
  const plan = said<{ diff: Diff }>(await planOf(api, pack())).diff;
  assert.deepEqual(plan.conflicts, []);
  said(await put(api, pack()));
  /* THE ROWS ARE THE RECORD'S, never the add-on's: two projects and six tasks before, the same after. */
  assert.deepEqual([names('things'), names('tasks')], held);
  assert.deepEqual(held.map((l) => l.length), [2, 6]);
  assert.equal(block(await pageOf(api, 'rule-sheet-values'), 'Values in text').values?.['tasks.count'], 6);
  const project = await pageOf(api, 'rule-sheet');
  assert.equal(ring(block(project, 'Tasks done here')), 'Tasks done here 3 of 5');
  assert.deepEqual(block(project, 'Its own values').refusals, []);
  close();
});

test('OWN VALUES: on the example project its own next step, its two counts and its day fill, and the gate reads each line', async () => {
  const { api, close } = await fresh();
  said(await put(api, pack()));
  assert.equal(EXAMPLE.list, 'things');
  said(api.kernel.create(EXAMPLE.list, EXAMPLE.fields, { actor: 'p_1' }));
  const own = block(await pageOf(api, 'rule-sheet'), 'Its own values');
  assert.deepEqual(own.refusals, []);
  /* A PLAIN FIELD IS WRITTEN INTO THE BODY ON THE SERVER; a count and a typed day travel as values the page draws. */
  assert.match(own.body!, /field of Rule sheet, .*Its next step: Glaze the second batch\./su);
  assert.deepEqual(own.values, { 'domains.count': 2, 'repos.count': 0, aim: '2026-12-01' });
  const text = drawn(own.body!, own.values!);
  assert.ok(!text.includes('—'), `a value of the project drew as a dash: ${text}`);
  /* EVERY OWN-VALUE LINE OF EXPECT.JSON IS IN WHAT THE PAGE DRAWS, so the gate passes on the example and on nothing else. */
  const lines = (JSON.parse(readFileSync(new URL('./expect.json', import.meta.url), 'utf8')) as { rules: { block?: string; text?: string }[] }).rules;
  const wanted = lines.filter((r) => r.block === 'Its own values' && r.text !== undefined).map((r) => r.text!);
  assert.equal(wanted.length, 4);
  for (const want of wanted) assert.ok(text.includes(want), `the page draws "${text}", which does not hold "${want}"`);
  close();
});

test('OWN VALUES: a project with none of them draws the dash and nought, never a hole or a figure of the same name', async () => {
  const { api, close } = await fresh();
  said(await put(api, pack()));
  seed(api);
  const own = block(await pageOf(api, 'rule-sheet'), 'Its own values');
  assert.deepEqual(own.values, { 'domains.count': 0, 'repos.count': 0 });
  assert.deepEqual((own as { unnamed?: string[] }).unnamed ?? [], [], 'a field of the project was read as a word nobody knows');
  assert.match(drawn(own.body!, own.values!), /Its next step: —\.\s+.*domains: 0\. How many repositories: 0\.\s+The day it aims for: —\./u);
  close();
});

test('A DAY IN TWO ZONES: at 22:30 in Greenwich on the 14th the 15th is a day off there and today in Cairo, as expect.json says', () => {
  const body = declared('rule-sheet-values').blocks.find((b) => b.heading === 'A day in two zones')!.body!;
  const lines = (JSON.parse(readFileSync(new URL('./expect.json', import.meta.url), 'utf8')) as { rules: { block?: string; zone?: string; at?: string; text?: string }[] }).rules.filter((r) => r.block === 'A day in two zones');
  assert.deepEqual(lines.map((r) => r.zone), ['UTC', 'Africa/Cairo']);
  for (const r of lines) assert.ok(drawn(body, {}, Date.parse(r.at!), r.zone).includes(r.text!), `in ${r.zone} at ${r.at} the day does not read ${r.text}`);
  /* THE SAME MOMENT, TWO ANSWERS: a day that moved with the reader's zone, or stopped moving, fails one of the two. */
  const [utc, cairo] = lines.map((r) => drawn(body, {}, Date.parse(r.at!), r.zone));
  assert.notEqual(utc, cairo);
});

test('EVERY NEW EXPECT LINE NAMES A BLOCK THE ADD-ON DECLARES on the page it is read on', () => {
  type Line = { rule: string; page: string; block?: string };
  const file = JSON.parse(readFileSync(new URL('./expect.json', import.meta.url), 'utf8')) as { pages: Record<string, string>; rules: Line[] };
  const slugOf = (page: string): string => (file.pages[page] ? 'rule-sheet-project' : pack().declarations.find((d) => d.title === page)!.page);
  const named = file.rules.filter((r) => r.block !== undefined);
  assert.ok(named.length >= 7, 'the own-value and two-zone lines name no block');
  for (const r of named) {
    const headings = declared(slugOf(r.page)).blocks.map((b) => b.heading);
    assert.ok(headings.includes(r.block), `${r.rule} names ${r.block}, which ${r.page} does not declare`);
  }
});
