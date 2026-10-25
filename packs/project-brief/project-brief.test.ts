/**
 * The project brief as a pack: a stage and what is in the way laid on Portfolio's projects by `extends`, a list of plan
 * steps under each project, and a page of its own over every project in play.
 *
 * THE BRIEF WAS ONE NOTE. A founder's tracker commonly keeps a one-liner, a plan and blockers on every project, and a
 * record imported from one holds them on nearly every project, written into `note` as markdown, so an agent asking
 * "what is in the way on marrow" read the whole note to find one line. 1.x gave them three fields of text.
 *
 * 2.0.0 (REC-C09): THE ONE LINE IS PORTFOLIO'S ABOUT, which it has had since 1.6.0, so `summary` is retired and two
 * fields no longer mean the same. THE PLAN IS STEPS ("the ordered queue, position is priority"), a list declaring
 * `steps: { of: thing, done: done, order: rank }`, so the project's ring counts them and a step linked to a task or a
 * thread is ticked when that is done. THE STAGE IS AN ENUM, because "an enum makes drift a refusal". A brief written on
 * 1.x keeps its words in the retired fields, and one press of Bring briefs over moves them.
 *
 * A PACK AND NOT A FIELD IN `packages/seed`, because a feature like this is data on the record's primitives, never code
 * in the shell that knows about one person. Everything here is the pack file and the record's own install path,
 * `planPack` then `installPack`, the road a person takes from the app, and its scripts run in QuickJS through the
 * runner the self-host builds.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { readPackFile } from '../../packages/declare/src/catalogue.ts';
import { scriptReads, scriptRunner } from '../../packages/host/src/script.ts';
import { createRecordApi, type CallContext } from '../../packages/record/src/index.ts';
import { fixedClock, openSqlite } from '../../packages/kernel/test/sqlite.ts';
import { runInQuickJs } from '../../packages/script/src/quickjs.ts';
import { FIRST_PARTY, PAGES, firstPartyDocument } from '../../packages/seed/src/index.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const NOW = Date.UTC(2026, 8, 24, 12);

type Refusal = { code: string; fix: string; at?: string; allowed?: unknown[] };
type Out = { ok: boolean; value?: unknown; refusal?: Refusal };
const said = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};

type Api = Awaited<ReturnType<typeof createRecordApi>>;
type Diff = { planHash: string; approve: unknown[]; conflicts: unknown[]; extends: { id: string; adds: string[] }[] };
type Field = { id: string; type: string; of?: string; label?: string; values?: string[]; retired?: boolean };
type Block = { kind: string; heading?: string; added?: string; rows: { id: string; fields: Record<string, unknown> }[]; refusals: unknown[]; rings?: (number | null)[]; nexts?: (string | null)[] };
type Page = { title: string; blocks: Block[] };

/** The file as it ships, read fresh each time so no test can hand the next one a copy it changed. */
const PACK_FILE = new URL('./project-brief.pack.json', import.meta.url);
const brief = (): Record<string, unknown> => JSON.parse(readFileSync(PACK_FILE, 'utf8')) as Record<string, unknown>;
/** A published version, as the catalogue serves it to a record that installed it then. */
const published = (version: string): Record<string, unknown> =>
  JSON.parse(readFileSync(new URL(`../../apps/web/static/catalogue/packs/project-brief/${version}.pack.json`, import.meta.url), 'utf8')) as Record<string, unknown>;

/**
 * A fresh record holding every module `page.project` itself requires (portfolio.ts's `project` declaration), with the
 * page laid on top the way the starter lays it. The project template reads tasks, money and services at once, so it
 * sits in none of the five first-party packs; a record that only ever installs Portfolio never holds it, which is why
 * the brief's blocks had nowhere to land until this record held the rest too. Work is one of the five, and the brief
 * needs it: a step links to a task or a thread.
 */
async function portfolio(): Promise<{ api: Api; close: () => void; clock: ReturnType<typeof fixedClock> }> {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  for (const id of FIRST_PARTY) said(await put(api, firstPartyDocument(id, { seeds: [] })));
  said(await api.kernel.install([{ id: 'page.project', kind: 'page', body: PAGES.project as never }]));
  return { api, close: () => sql.close(), clock };
}

const planOf = async (api: Api, doc: unknown): Promise<Diff> =>
  said<{ diff: Diff }>(await api.planPack({ doc, source: { kind: 'local' } } as never, owner)).diff;

/** Plan and install with exactly what the plan asked to be approved, which for an additive pack is nothing. */
async function put(api: Api, doc: unknown): Promise<Out> {
  const diff = await planOf(api, doc);
  return (await api.installPack({ doc, source: { kind: 'local' }, planHash: diff.planHash, approve: diff.approve } as never, owner)) as Out;
}

const fieldsOf = (api: Api): Field[] => {
  const d = api.kernel.declarations().find((x) => x.id === 'register.things')!;
  return (JSON.parse(d.body) as { fields: Field[] }).fields;
};

const make = (api: Api, register: string, fields: Record<string, unknown>): string =>
  said<{ id: string }>(api.kernel.create(register, fields as never, { actor: 'p_1' })).id;
const pageOf = async (api: Api, slug: string): Promise<Page> => said<Page>(await api.page({ slug }, owner));
const blockOf = (page: Page, heading: string): Block => page.blocks.find((b) => b.heading === heading)!;

/**
 * The pack's scripts taken to the end the way a host takes them: the rules' runs drained, then the actions, with each
 * script run in QuickJS by the runner the self-host builds. None of them fetches, so every door out refuses.
 */
async function settle(api: Api): Promise<void> {
  const refuse = async (): Promise<never> => {
    throw new Error('the brief fetches nothing');
  };
  const run = scriptRunner({ run: runInQuickJs, send: refuse, pin: refuse, openKey: refuse, grantOf: () => null, reads: scriptReads(api), now: () => NOW } as never);
  for (let i = 0; i < 3; i++) {
    await api.kernel.drain();
    const ran = (await api.kernel.runActions(refuse as never, { script: run, limit: 50 })) as { refused: number; failed: number };
    assert.deepEqual([ran.refused, ran.failed], [0, 0], 'a script of the brief was refused or failed');
  }
}

/** Bring briefs over, the button a record that wrote briefs on 1.x presses once, and its scripts run. */
async function bringOver(api: Api): Promise<void> {
  said(api.kernel.automationRun('project_brief_bring_over', 'p_1'));
  await settle(api);
}

/** A project's steps as the page draws them, in its order: what, what it gains, and done. */
const stepsOn = async (api: Api, slug: string): Promise<[unknown, unknown, unknown][]> =>
  blockOf(await pageOf(api, slug), 'Plan steps').rows.map((r) => [r.fields.what, r.fields.gain ?? null, r.fields.done]);

test('BEFORE THE PACK: Projects has no stage and no plan steps, and a write carrying a stage is refused', async () => {
  const { api, close } = await portfolio();
  const ids = fieldsOf(api).map((f) => f.id);
  for (const id of ['stage', 'blockers']) assert.ok(!ids.includes(id), `things already has ${id}`);
  const r = api.kernel.create('things', { name: 'Kiln', lane: 'earning', stage: 'building' } as never, { actor: 'p_1' }) as Out;
  assert.equal(r.ok, false);
  assert.equal(r.refusal?.code, 'FIELD_UNKNOWN');
  assert.ok(!api.kernel.declarations().some((d) => d.id === 'register.plan_steps'), 'a step exists before the pack');
  close();
});

test('the plan lays what is in the way and the stage on Projects, adds the steps, and asks nobody to press anything', async () => {
  const { api, close } = await portfolio();
  const diff = await planOf(api, brief());
  const things = diff.extends.find((e) => e.id === 'register.things')!;
  for (const id of ['blockers', 'stage']) assert.ok(things.adds.includes(id), `the plan does not lay ${id}`);
  assert.deepEqual(diff.approve, [], 'an optional field and a new list are additive, and an additive change needs no approval');
  assert.deepEqual(diff.conflicts, []);
  close();
});

test('installed, a project holds a stage and what is in the way, the one line is About, and the old fields take no new words', async () => {
  const { api, close } = await portfolio();
  said(await put(api, brief()));
  const laid = new Map(fieldsOf(api).map((f) => [f.id, f]));
  assert.deepEqual([laid.get('blockers')?.type, laid.get('blockers')?.of, laid.get('blockers')?.label], ['list', 'text', 'In the way']);
  assert.deepEqual(laid.get('stage')?.values, ['raw', 'researched', 'designed', 'building', 'ready', 'live', 'blocked']);
  /* PARKED AND RETIRED ARE LANES, NOT STAGES, and two fields saying where a project is would drift apart. */
  for (const lane of ['parked', 'retired']) assert.ok(!laid.get('stage')?.values?.includes(lane), `${lane} is a stage`);
  const kiln = make(api, 'things', { name: 'Kiln', lane: 'earning', about: 'A type foundry', stage: 'building', blockers: ['The licence text'] });
  assert.deepEqual(
    (({ about, stage, blockers }) => [about, stage, blockers])(api.kernel.get(kiln)!.fields),
    ['A type foundry', 'building', ['The licence text']],
  );
  /* RETIRED, SO ONE LINE AND THE PLAN ARE NOT A SECOND PLACE TO WRITE: About is the one line, and the plan is steps. */
  for (const field of ['summary', 'plan']) {
    const r = api.kernel.update('things', kiln, { [field]: field === 'plan' ? ['A line'] : 'A line' } as never, { actor: 'p_1' }) as Out;
    assert.equal(r.ok, false, `${field} still takes new words`);
  }
  close();
});

test('A STAGE TYPED AS "researching" IS REFUSED with the stages it may be named', async () => {
  const { api, close } = await portfolio();
  said(await put(api, brief()));
  const kiln = make(api, 'things', { name: 'Kiln', lane: 'building' });
  const r = api.kernel.update('things', kiln, { stage: 'researching' } as never, { actor: 'p_1' }) as Out;
  assert.equal(r.ok, false);
  assert.equal(r.refusal?.code, 'ENUM_VALUE_UNKNOWN');
  assert.deepEqual(r.refusal?.allowed, ['raw', 'researched', 'designed', 'building', 'ready', 'live', 'blocked']);
  said(api.kernel.update('things', kiln, { stage: 'researched' } as never, { actor: 'p_1' }));
  close();
});

test('THREE STEPS, ONE LINKED TO A TASK: finishing the task ticks it, and the plan reads 1 of 3 done, in order', async () => {
  const { api, close } = await portfolio();
  said(await put(api, brief()));
  const kiln = make(api, 'things', { name: 'Kiln', lane: 'building' });
  const task = make(api, 'tasks', { what: 'Cut the variable axis', thing: kiln, state: 'open' });
  /* WRITTEN OUT OF ORDER, so the order drawn is the rank and not the order they went in. */
  make(api, 'plan_steps', { what: 'Raise the price', gain: 'Margin', thing: kiln, rank: 3 });
  make(api, 'plan_steps', { what: 'Ship the variable axis', gain: 'First sale', thing: kiln, rank: 1, task });
  make(api, 'plan_steps', { what: 'Write the licence', thing: kiln, rank: 2 });
  /* BEFORE: nothing is done, and the ring under Where it stands has nothing typed to draw but the steps. */
  assert.deepEqual(await stepsOn(api, 'kiln'), [
    ['Ship the variable axis', 'First sale', false],
    ['Write the licence', null, false],
    ['Raise the price', 'Margin', false],
  ]);
  said(api.kernel.update('tasks', task, { state: 'done' } as never, { actor: 'p_1' }));
  await settle(api);
  const steps = await stepsOn(api, 'kiln');
  assert.deepEqual(steps.map((s) => s[2]), [true, false, false], 'finishing the task did not tick its step');
  assert.equal(`${steps.filter((s) => s[2] === true).length} of ${steps.length} done`, '1 of 3 done');
  /* THE PROJECT'S RING COUNTS THE STEPS, through the list's steps: declaration and nothing on Portfolio's side. */
  const plan = blockOf(await pageOf(api, 'briefs'), 'The plan');
  const at = plan.rows.findIndex((r) => r.fields.name === 'Kiln');
  assert.equal(plan.rings?.[at], 33);
  assert.equal(plan.nexts?.[at], 'Write the licence', 'the next step is the first open one by rank');
  close();
});

test('a thread moved to done ticks the steps linked to it, and a task reopened before the run ticks nothing', async () => {
  const { api, close } = await portfolio();
  said(await put(api, brief()));
  const kiln = make(api, 'things', { name: 'Kiln', lane: 'building' });
  const thread = make(api, 'tracks', { name: 'Licensing', thing: kiln, state: 'open' });
  const task = make(api, 'tasks', { what: 'Ask the lawyer', thing: kiln, state: 'open' });
  make(api, 'plan_steps', { what: 'Settle the licence', thing: kiln, rank: 1, track: thread });
  make(api, 'plan_steps', { what: 'Send the contract', thing: kiln, rank: 2, task });
  said(api.kernel.update('tracks', thread, { state: 'done' } as never, { actor: 'p_1' }));
  said(api.kernel.update('tasks', task, { state: 'done' } as never, { actor: 'p_1' }));
  said(api.kernel.update('tasks', task, { state: 'open' } as never, { actor: 'p_1' }));
  await settle(api);
  assert.deepEqual((await stepsOn(api, 'kiln')).map((s) => s[2]), [true, false]);
  close();
});

test('A RECORD ON 1.2.1 TAKES THE BRIEF AS IT SHIPS WITH EVERY WORD KEPT, and one press brings the one line into About and the plan into steps', async () => {
  const { api, close } = await portfolio();
  said(await put(api, published('1.2.1')));
  const marrow = make(api, 'things', {
    name: 'Marrow',
    lane: 'earning',
    summary: 'A recipe book',
    plan: ['Print the second run (stock for Christmas)', 'Ship v2 (beta) (first reviews)', 'Find a distributor', 'Reprint (cover (matte))'],
    blockers: ['The printer quote'],
  });
  /* ABOUT ALREADY WRITTEN WINS: a line somebody wrote on Portfolio is not overwritten by the older one. */
  const tallow = make(api, 'things', { name: 'Tallow', lane: 'building', about: 'Hand-poured candles', summary: 'Candles' });
  const diff = await planOf(api, brief());
  assert.deepEqual(diff.conflicts, []);
  said(await put(api, brief()));
  assert.equal(api.kernel.packs().find((p) => p.id === 'project-brief')?.version, brief().version);
  /* NOTHING IS MOVED BY THE UPDATE ITSELF: the words stay in the retired fields until the person presses the button. */
  const kept = api.kernel.get(marrow)!.fields;
  const words = [kept.summary, kept.plan, kept.blockers];
  assert.deepEqual(words, ['A recipe book', ['Print the second run (stock for Christmas)', 'Ship v2 (beta) (first reviews)', 'Find a distributor', 'Reprint (cover (matte))'], ['The printer quote']]);
  assert.deepEqual(await stepsOn(api, 'marrow'), []);

  await bringOver(api);
  assert.equal(api.kernel.get(marrow)!.fields.about, 'A recipe book');
  assert.equal(api.kernel.get(tallow)!.fields.about, 'Hand-poured candles');
  /* SPLIT AT THE LAST BRACKET, so a bracket inside the step stays in the step, a bracket inside the gain stays in the
     gain, and a line with none gains nothing: no word is dropped on the way. */
  const steps: [unknown, unknown, unknown][] = [
    ['Print the second run', 'stock for Christmas', false],
    ['Ship v2 (beta)', 'first reviews', false],
    ['Find a distributor', null, false],
    ['Reprint', 'cover (matte)', false],
  ];
  assert.deepEqual(await stepsOn(api, 'marrow'), steps);
  /* AND THE OLD WORDS ARE STILL THERE AFTER THE PRESS, so nothing is lost if a split reads a line wrong. */
  const after = api.kernel.get(marrow)!.fields;
  assert.deepEqual([after.summary, after.plan, after.blockers], words);
  /* A SECOND PRESS WRITES NOTHING TWICE. */
  await bringOver(api);
  assert.deepEqual(await stepsOn(api, 'marrow'), steps);
  close();
});

test('the Briefs page draws what is in the way, what each one is and the plan, each over the projects in play', async () => {
  const { api, close } = await portfolio();
  said(await put(api, brief()));
  const marrow = make(api, 'things', { name: 'Marrow', lane: 'earning', about: 'A recipe book', stage: 'live', blockers: ['The printer quote'] });
  make(api, 'things', { name: 'Tallow', lane: 'building', about: 'Hand-poured candles', stage: 'designed' });
  const ember = make(api, 'things', { name: 'Ember', lane: 'parked', about: 'A kiln timer', blockers: ['No buyer'] });
  make(api, 'plan_steps', { what: 'Print the second run', thing: marrow, rank: 1 });
  make(api, 'plan_steps', { what: 'Find a buyer', thing: ember, rank: 1 });

  assert.ok(said<{ slug: string }[]>(await api.pages(owner)).some((p) => p.slug === 'briefs'));
  const page = await pageOf(api, 'briefs');
  assert.equal(page.title, 'Briefs');
  for (const b of page.blocks) assert.deepEqual(b.refusals, [], `${b.heading} was refused`);
  const names = (heading: string): unknown[] => blockOf(page, heading).rows.map((r) => r.fields.name);
  /* A PARKED PROJECT IS NOT IN PLAY (REC-C08's lane filters), so its blocker is not in the way of anything he works on. */
  assert.deepEqual(names('In the way'), ['Marrow']);
  assert.deepEqual(names('What each one is'), ['Marrow', 'Tallow']);
  assert.deepEqual(blockOf(page, 'What each one is').rows.map((r) => [r.fields.about, r.fields.stage]), [['A recipe book', 'live'], ['Hand-poured candles', 'designed']]);
  const plan = blockOf(page, 'The plan');
  assert.deepEqual(plan.rows.map((r) => r.fields.name), ['Marrow', 'Tallow']);
  assert.deepEqual(plan.nexts, ['Print the second run', null]);
  close();
});

test('the project page draws the brief and its steps after where it stands, and Portfolio\'s own page declaration is left as it was', async () => {
  const { api, close } = await portfolio();
  const before = api.kernel.declarations().find((d) => d.id === 'page.project')!.body;
  const diff = await planOf(api, brief());
  assert.deepEqual(
    (diff as { page_adds?: { page: string; line: string; unresolved?: true }[] }).page_adds?.map((a) => [a.page, a.unresolved ?? null]),
    [['page.project', null], ['page.project', null], ['page.project', null]],
  );
  said(await put(api, brief()));
  const marrow = make(api, 'things', { name: 'Marrow', lane: 'earning', about: 'A recipe book', stage: 'blocked', blockers: ['The printer quote'] });
  make(api, 'plan_steps', { what: 'Print the second run', gain: 'Stock for Christmas', thing: marrow, rank: 1 });
  const page = await pageOf(api, 'marrow');
  const headings = page.blocks.map((b) => b.heading);
  const at = headings.indexOf('The brief');
  /* AFTER PORTFOLIO 1.16.0'S FIRST "WHERE IT STANDS", the card a person who said where it stands reads, and before the
     figures drawn in its place while nobody has; the brief and its steps come in the order the pack gives them. */
  assert.equal(headings[at - 1], 'Where it stands');
  assert.equal(headings[at + 1], 'Stopped working for this project');
  assert.equal(headings[at + 2], 'Plan steps');
  assert.equal(headings[at + 3], 'Where it stands');
  /* NOTHING HAS STOPPED FOR MARROW, so the block is answered and not drawn: the empty rule, never a tile saying so. */
  const stopped = page.blocks[at + 1] as Block & { about?: string; drawn?: boolean; why?: string };
  assert.deepEqual([stopped.added, stopped.about, stopped.rows, stopped.refusals], ['project-brief', 'things#1', [], []]);
  assert.deepEqual([stopped.drawn, stopped.why], [false, 'empty']);
  const added = page.blocks[at]!;
  assert.equal(added.added, 'project-brief');
  assert.deepEqual(added.refusals, []);
  assert.deepEqual([added.rows[0]?.fields.about, added.rows[0]?.fields.stage, added.rows[0]?.fields.blockers], ['A recipe book', 'blocked', ['The printer quote']]);
  assert.deepEqual(page.blocks[at + 1]!.refusals, []);
  assert.equal(api.kernel.declarations().find((d) => d.id === 'page.project')!.body, before, 'the addition was written into Portfolio\'s page');
  /* TAKING THE PACK OUT TAKES ITS BLOCKS OFF THE PAGE, because they lived in its manifest and nowhere else. */
  said(await api.uninstallPack({ id: 'project-brief' } as never, owner));
  const after = await pageOf(api, 'marrow');
  assert.ok(!after.blocks.some((b) => ['The brief', 'Plan steps', 'Stopped working for this project'].includes(b.heading ?? '')));
  close();
});

test('a pack adding to a page the record lacks plans it as unresolved and does not install', async () => {
  const { api, close } = await portfolio();
  const doc = { ...brief(), adds: [{ page: 'page.nowhere', block: { kind: 'note', heading: 'Lost', body: 'Nothing' } }] };
  const planned = (await api.planPack({ doc, source: { kind: 'local' } } as never, owner)) as Out;
  /* A PLAN THAT ANSWERS SAYS THE PAGE IS MISSING, and one the record refuses at the plan refuses it for that page. */
  if (planned.ok) {
    const diff = (planned.value as { diff: Diff & { page_adds?: { unresolved?: true }[] } }).diff;
    assert.equal(diff.page_adds?.[0]?.unresolved, true);
    const r = (await api.installPack({ doc, source: { kind: 'local' }, planHash: diff.planHash, approve: diff.approve } as never, owner)) as Out;
    assert.equal(r.ok, false);
    assert.equal(r.refusal?.code, 'PAGE_UNKNOWN');
  } else assert.equal(planned.refusal?.code, 'PAGE_UNKNOWN');
  assert.ok(!api.kernel.declarations().some((d) => d.id === 'page.briefs'), 'the pack installed');
  close();
});

test('BRING BRIEFS OVER REACHES PAST FIFTY PROJECTS, and a step somebody added first does not keep the old plan out', async () => {
  const { api, close } = await portfolio();
  said(await put(api, published('1.2.1')));
  /* A SCRIPT'S LIST ANSWERS ONE PAGE OF FIFTY. Read whole, it brought over fifty projects of sixty and left ten. */
  const ids = Array.from({ length: 60 }, (_, i) =>
    make(api, 'things', { name: `Project ${i + 1}`, lane: 'building', summary: `Line ${i + 1}`, plan: [`Step ${i + 1} (gain ${i + 1})`] }),
  );
  said(await put(api, brief()));
  make(api, 'plan_steps', { what: 'Added by hand', thing: ids[0], rank: 1 });
  await bringOver(api);
  assert.deepEqual(ids.filter((id) => api.kernel.get(id)!.fields.about === undefined), [], 'a project was left without its one line');
  assert.deepEqual(await stepsOn(api, 'project-60'), [['Step 60', 'gain 60', false]]);
  assert.deepEqual(await stepsOn(api, 'project-1'), [['Added by hand', null, false], ['Step 1', 'gain 1', false]]);
  await bringOver(api);
  const all = said<{ rows: unknown[] }>(await api.list({ register: 'plan_steps', limit: 200 } as never, owner)).rows;
  assert.equal(all.length, 61, 'a second press wrote a step twice');
  close();
});

test('a step is found by search, which is what an agent asking "which project is waiting on the printer" reaches for', async () => {
  const { api, close } = await portfolio();
  said(await put(api, brief()));
  const marrow = make(api, 'things', { name: 'Marrow', lane: 'earning' });
  make(api, 'plan_steps', { what: 'Get the printer quote', gain: 'A price for the second run', thing: marrow, rank: 1 });
  const found = said<{ hits: { register: string; title: string }[] }>(await api.search({ q: 'printer' }, owner));
  assert.deepEqual(found.hits.map((h) => [h.register, h.title]), [['plan_steps', 'Get the printer quote']]);
  close();
});

test('on a record without Portfolio the plan is refused, naming the module to install first', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  const r = (await api.planPack({ doc: brief(), source: { kind: 'local' } } as never, owner)) as Out;
  assert.equal(r.ok, false);
  assert.match(`${r.refusal?.code} ${r.refusal?.fix}`, /portfolio/u);
  sql.close();
});

test('installing it twice changes nothing, and uninstalling it keeps every brief already written', async () => {
  const { api, close } = await portfolio();
  said(await put(api, brief()));
  const kiln = make(api, 'things', { name: 'Kiln', lane: 'earning', stage: 'ready', blockers: ['The licence text'] });
  const again = await planOf(api, brief());
  assert.deepEqual(again.extends.map((e) => [e.id, e.adds]), [['register.things', []]]);
  assert.deepEqual([again.approve, again.conflicts], [[], []]);
  said(await put(api, brief()));
  /* WHAT HE WROTE IS HIS, NOT THE PACK'S. Taking the pack away takes its page; the fields stay as the record's own. */
  said(await api.uninstallPack({ id: 'project-brief' } as never, owner));
  assert.deepEqual([api.kernel.get(kiln)!.fields.stage, api.kernel.get(kiln)!.fields.blockers], ['ready', ['The licence text']]);
  assert.ok(!said<{ slug: string }[]>(await api.pages(owner)).some((p) => p.slug === 'briefs'));
  close();
});

test('the same file passes as an add-on somebody opens from disk, and 2.1.0 is 2.0.0 with one block more', async () => {
  const text = readFileSync(PACK_FILE, 'utf8');
  const file = said<{ pack: { manifest: { pack: string; version: string; extends?: unknown } } }>(await readPackFile(text));
  assert.deepEqual([file.pack.manifest.pack, file.pack.manifest.version], ['project-brief', '2.1.1']);
  assert.deepEqual(Object.keys(file.pack.manifest.extends as object), ['register.things']);
  /* 2.0.0 IS RELEASED, so the file in packs/ is it with the stopped block laid in and its own version and changes line,
     and nothing else of 2.0.0 moved. */
  const { icon: _icon, ...now } = brief() as { adds: { block: { source?: string } }[] } & Record<string, unknown>;
  const was = published('2.0.0');
  assert.deepEqual(
    { ...now, version: was.version, changes: was.changes, adds: now.adds.filter((a) => a.block.source !== 'actions.blocking') },
    was,
    '2.1.0 changed more of 2.0.0 than its one block',
  );
  /* THE CATALOGUE'S 2.1.0 IS WRITTEN BY tools/catalogue/from-packs.mjs, and once written it is this file. */
  const shipped = new URL('../../apps/web/static/catalogue/packs/project-brief/2.1.0.pack.json', import.meta.url);
  if (existsSync(shipped)) assert.deepEqual(published('2.1.1'), brief(), 'the catalogue\'s 2.1.1 is not the file in packs/; run tools/catalogue/from-packs.mjs');
  /* NO ID, NO EM DASH AND NO "ROW" IN WHAT A PERSON READS: the labels, headings, empty lines and the button's name. */
  const words = JSON.stringify(brief(), (k, v: unknown) => (k === 'source' ? undefined : v));
  assert.doesNotMatch(words, /—|\brows?\b|\b[0-9A-HJKMNP-TV-Z]{26}\b/u);
});

test('a step added through the record\'s own create, the door an agent\'s create reaches, is read back in its place in the plan', async () => {
  const { api, close } = await portfolio();
  said(await put(api, brief()));
  const kiln = make(api, 'things', { name: 'Kiln', lane: 'building' });
  make(api, 'plan_steps', { what: 'Ship the variable axis', thing: kiln, rank: 1 });
  make(api, 'plan_steps', { what: 'Raise the price', thing: kiln, rank: 3 });
  said(await api.create({ register: 'plan_steps', fields: { what: 'Write the licence', gain: 'Studios can buy it', thing: kiln, rank: 2 } as never }, owner));
  const read = said<{ rows: { fields: Record<string, unknown> }[] }>(
    await api.list({ register: 'plan_steps', where: { field: 'thing', is: kiln }, order: [{ field: 'rank', dir: 'asc' }] } as never, owner),
  );
  const order = ['Ship the variable axis', 'Write the licence', 'Raise the price'];
  assert.deepEqual(read.rows.map((r) => r.fields.what), order);
  assert.deepEqual((await stepsOn(api, 'kiln')).map((s) => s[0]), order);
  close();
});

/* ── 2.1.0: what runs by itself and has stopped, on the project's page (SHL-C01) ─────────────────────────────────── */

const STOPPED = 'Stopped working for this project';

/** One action that runs by itself every hour for one project, by its spoken id, filing what it reads in a list of notes. */
const pollFor = (project: string) => [
  {
    id: 'register.notes',
    kind: 'register',
    body: { id: 'notes', name: 'Notes', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] },
  },
  {
    id: 'ingest.balance',
    kind: 'ingest',
    body: {
      ingest: 'balance',
      channel: 'poll',
      description: 'Kiln sales',
      url: 'https://api.example.test/v1/balance',
      every: '1h',
      grant: 'example read',
      project,
      extract: { what: { after: 'balance ' } },
      writes: { register: 'notes' },
    },
  },
];
const answer = (status: number, body = '') => async () => ({ status, body, bytes: body.length, ms: 3, requests: 1 });

test('A RECORD ON 2.0.0 TAKES 2.1.0 WITH EVERY BRIEF AND STEP KEPT, and the project page gains the stopped block', async () => {
  const { api, close } = await portfolio();
  said(await put(api, published('2.0.0')));
  const kiln = make(api, 'things', { name: 'Kiln', lane: 'earning', about: 'A type foundry', stage: 'building', blockers: ['The licence text'] });
  make(api, 'plan_steps', { what: 'Ship the variable axis', gain: 'First sale', thing: kiln, rank: 1 });
  const before = (await pageOf(api, 'kiln')).blocks.map((b) => b.heading);
  assert.ok(!before.includes(STOPPED), 'the block is on the page before 2.1.0');
  const diff = await planOf(api, brief());
  /* ONE BLOCK MORE ON A PAGE IS ADDITIVE: nothing to approve and nothing in conflict. */
  assert.deepEqual([diff.approve, diff.conflicts], [[], []]);
  said(await put(api, brief()));
  assert.equal(api.kernel.packs().find((p) => p.id === 'project-brief')?.version, '2.1.1');
  const fields = api.kernel.get(kiln)!.fields;
  assert.deepEqual([fields.about, fields.stage, fields.blockers], ['A type foundry', 'building', ['The licence text']]);
  assert.deepEqual(await stepsOn(api, 'kiln'), [['Ship the variable axis', 'First sale', false]]);
  const page = await pageOf(api, 'kiln');
  const at = page.blocks.findIndex((b) => b.heading === 'The brief');
  assert.equal(page.blocks[at + 1]?.heading, STOPPED);
  for (const b of page.blocks.filter((x) => x.added === 'project-brief')) assert.deepEqual(b.refusals, [], `${b.heading} was refused`);
  close();
});

test('AN ACTION THAT STOPPED FOR KILN IS NAMED ON KILN\'S PAGE with why and since, and Tallow\'s page draws nothing', async () => {
  const { api, close, clock } = await portfolio();
  said(await put(api, brief()));
  const kiln = make(api, 'things', { name: 'Kiln', lane: 'earning' });
  make(api, 'things', { name: 'Tallow', lane: 'building' });
  const spoken = `things#${api.kernel.get(kiln)!.seq}`;
  said(api.kernel.bindGrant({ label: 'example read', opens: 'api.example.test', kind: 'api_token', ciphertext: new Uint8Array([1, 2, 3]), nonce: new Uint8Array([9, 9, 9]), kdf: 'hkdf', wrapped_by: 'kek', kek_id: 'kek_2f' } as never, 'p_1'));
  said(await api.kernel.install(pollFor(spoken) as never));
  /* ONE GOOD RUN: nothing has stopped, and the block is answered with nothing and not drawn. */
  await api.kernel.runActions(answer(200, 'balance 120') as never);
  const quiet = blockOf(await pageOf(api, 'kiln'), STOPPED) as Block & { drawn?: boolean };
  assert.deepEqual([quiet.rows, quiet.refusals, quiet.drawn], [[], [], false]);
  /* THE PROVIDER REFUSES THE KEY, so the action pauses, and Kiln's page names it. */
  clock.advance(2 * 3_600_000);
  await api.kernel.runActions(answer(401, 'no') as never);
  const stopped = blockOf(await pageOf(api, 'kiln'), STOPPED) as Block & { drawn?: boolean };
  assert.deepEqual(stopped.refusals, []);
  assert.deepEqual(stopped.rows.map((r) => [r.fields.name, r.fields.why]), [['Kiln sales', 'paused']]);
  /* SINCE IS WHEN IT LAST WORKED: the good run two hours before. */
  assert.equal(Date.parse(String(stopped.rows[0]?.fields.since)), NOW);
  assert.notEqual(stopped.drawn, false, 'a block with an action in it was not drawn');
  /* ANOTHER PROJECT: the same action is not in its way. */
  const other = blockOf(await pageOf(api, 'tallow'), STOPPED) as Block & { drawn?: boolean };
  assert.deepEqual([other.rows, other.refusals, other.drawn], [[], [], false]);
  close();
});
