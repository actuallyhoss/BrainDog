/**
 * The New project guide on a real record (`usecases/guide.ts`, `guide-kinds.ts`): the plan formed around what the project
 * is, the Guide page saying where you are, what is next, what is stuck and what waits on you, agents taking steps and
 * recording choices with who did what, and the step from the idea stage to running the project.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SEEDS_PER_REGISTER, install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Kernel } from '@braindog/kernel';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { NOW } from '../src/index.ts';
import { GUIDE, GUIDE_GROWS } from '../src/usecases/guide.ts';
import { GENERAL_GUIDE, GUIDE_KINDS, formGuide, guideKindOf, planFor } from '../src/usecases/guide-kinds.ts';
import { useCase } from '../src/usecases/index.ts';
import { carriedDocument, dayOf, formedFor } from '../src/usecases/install.ts';
import { linkExamples, type LinkIo } from '../src/usecases/links.ts';

const TODAY = dayOf(NOW);
const guide = useCase('guide')!;

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string; at?: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value;
};

const hostFor = (k: Kernel): Host => ({
  count: (register) => k.count(register),
  stage: (batch) => k.stageInstall(batch as never),
  transaction: (fn) => k.transaction(fn),
  reload: () => k.reload(),
  retire: (ids) => k.retire(ids),
  /* THE TAGS A ROW CARRIES ARE KEPT, as the record's own host keeps them (`packHost`), so a formed row is still `formed`. */
  seed: (register, fields) => k.create(register, { ...fields, tags: [...new Set([...(Array.isArray(fields.tags) ? fields.tags.map(String) : []), 'example'])] }, { actor: 'p_seed', cascade: false }) as never,
  remember: (row) => k.rememberPack(row),
  forget: (id) => k.forgetPack(id),
  claimed: (pack) => k.packClaims(pack),
});

const stateOf = (k: Kernel): Installed => ({
  format: 1,
  primitives: 1,
  record_version: k.version(),
  packs: k.packs(),
  declarations: k.declarations() as Installed['declarations'],
  rows: k.census(),
  config: k.packSettings(),
});

async function put(k: Kernel, doc: unknown): Promise<void> {
  const pack = value<Pack>(await normalise(doc, { kind: 'local' }));
  const diff = await plan(pack, stateOf(k));
  value(await install(pack, diff, hostFor(k), diff.planHash));
}

type Row = { id: string; seq: number | null; fields: Record<string, unknown> };
const rows = (k: Kernel, register: string): Row[] => value<{ rows: Row[] }>(k.list({ register, limit: 200 })).rows;
const byTitle = (k: Kernel, register: string, field: string, title: string): Row => {
  const row = rows(k, register).find((r) => r.fields[field] === title);
  assert.ok(row, `no ${register} row titled ${title}`);
  return row;
};

const ioOf = (k: Kernel): LinkIo => ({
  rows: async (register) => rows(k, register),
  link: async (register, seq, field, spoken) => k.update(register, `${register}#${seq}`, { [field]: spoken }, { actor: 'p_owner' }).ok,
});

/** A guide record made the way onboarding makes one from a sentence: the pack, formed around it, and its examples linked. */
async function guideFor(said: string, examples = false): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  await put(k, carriedDocument(guide, TODAY, said, { examples }));
  const formed = formedFor(guide, said);
  await linkExamples(ioOf(k), 'guide', formed ? { links: formed.links } : undefined);
  return k;
}

type Drawn = { heading?: string; kind: string; drawn?: boolean; refusals?: unknown[]; rows?: Row[]; matched?: number; readings?: { metric: string; reading: { value: number | null } }[]; changes?: ({ who: string } | null)[] };
const pageOf = (k: Kernel, slug: string): Drawn[] => value<{ blocks: Drawn[] }>(k.page(slug)).blocks;
const block = (blocks: Drawn[], heading: string): Drawn => {
  const b = blocks.find((x) => x.heading === heading);
  assert.ok(b, `no block headed ${heading}: ${blocks.map((x) => x.heading).join(', ')}`);
  return b;
};
const figure = (k: Kernel, metric: string): number | null => {
  const decl = k.metricDecl(metric);
  assert.ok(decl, `no metric ${metric}`);
  return value<{ value: number | null }>(k.metric(decl)).value;
};

test('WHAT THE PROJECT IS PICKS ITS PLAN, the same way every time, and a sentence naming no kind forms the general plan', () => {
  const cases: [string, string | null][] = [
    ["I want to start a podcast and don't know where to begin", 'podcast'],
    ['I have an idea for a YouTube channel', 'video'],
    ['starting a newsletter from scratch', 'newsletter'],
    ['writing my first novel, step by step', 'book'],
    ['we are a band and want to record an album', 'music'],
    ['organising a small festival next summer', 'event'],
    ['a book club for my neighbourhood community', 'community'],
    ['I want to build an app for dog walkers', 'app'],
    ['opening an Etsy shop for handmade candles', 'shop'],
    ['I want to teach an online course on pottery', 'course'],
    ['starting a charity fundraiser for the local shelter', 'cause'],
    ["I'm starting something new", null],
    ['A new project', null],
    ['I want to restore an old wooden boat and sail it next summer', null],
  ];
  for (const [said, kind] of cases) {
    assert.equal(guideKindOf(said)?.kind.kind ?? null, kind, said);
    assert.equal(formGuide(said)?.kind, kind ?? 'general', `${said} forms ${kind ?? 'the general'} plan`);
    assert.deepEqual(formGuide(said), formGuide(said), 'the same sentence forms the same plan');
  }
  /* A SENTENCE THAT SAYS NOTHING FORMS NOTHING: there is no project to plan. */
  assert.equal(formGuide('   '), null);
  assert.equal(formedFor(guide, ''), null);
  assert.deepEqual(guideKindOf('Starting a PODCAST')?.heard, ['PODCAST'], 'the phrase is said back as it was written');
  assert.equal(formedFor(useCase('student')!, 'a podcast about my coursework'), null, 'only a use case that forms a plan forms one');
});

test('EVERY KIND OPENS ON SIX MILESTONES FROM THE IDEA ON, first steps, choices and what helps, each pointing at a milestone it has', () => {
  const stages = ['idea', 'plan', 'build', 'launch', 'grow'];
  const kinds = new Set<string>();
  for (const kind of [...GUIDE_KINDS, GENERAL_GUIDE]) {
    assert.ok(!kinds.has(kind.kind), `${kind.kind} twice`);
    kinds.add(kind.kind);
    assert.equal(kind.milestones.length, 6, kind.kind);
    const order = kind.milestones.map(([s]) => stages.indexOf(s));
    assert.deepEqual([...order].sort((a, b) => a - b), order, `${kind.kind}'s milestones run from the idea to growing it`);
    assert.equal(order[0], 0);
    assert.equal(order.at(-1), 4);
    const formed = planFor(kind);
    const per = new Map<string, number>();
    for (const s of formed.seeds) per.set(String(s.register), (per.get(String(s.register)) ?? 0) + 1);
    for (const [register, n] of per) assert.ok(n <= SEEDS_PER_REGISTER, `${kind.kind} seeds ${register} ${n} times`);
    assert.ok((per.get('steps') ?? 0) >= 3 && (per.get('choices') ?? 0) >= 1 && (per.get('resources') ?? 0) >= 1, kind.kind);
    const titles = new Set(kind.milestones.map(([, w]) => w));
    for (const l of formed.links) assert.ok(titles.has(l.target), `${kind.kind}: ${l.title} points at a milestone it does not have`);
    for (const text of [...titles, ...kind.steps.map((s) => s.what), ...kind.choices.map((c) => c.question), ...kind.resources.map((r) => r.name)])
      assert.doesNotMatch(text, /[\u2013\u2014]/u, `no dash in ${text}`);
  }
});

test('A PODCAST OPENS ON A PODCAST PLAN, linked: its milestone underway, its first steps each under their milestone', async () => {
  const k = await guideFor('I want to start a podcast about local history');
  const milestones = rows(k, 'milestones');
  assert.equal(milestones.length, 6);
  assert.deepEqual(milestones.filter((m) => m.fields.state === 'underway').map((m) => m.fields.what), ['Say what the show is about and who will listen']);
  const steps = rows(k, 'steps');
  assert.equal(steps.length, 5);
  for (const s of [...steps, ...rows(k, 'choices'), ...rows(k, 'resources')]) assert.ok(s.fields.milestone, `${JSON.stringify(s.fields)} has no milestone`);
  assert.ok(steps.every((s) => Array.isArray(s.fields.tags) && (s.fields.tags as string[]).includes('formed')), 'a formed plan is marked as formed');
  assert.ok(steps.every((s) => typeof s.fields.by === 'string' && s.fields.by > TODAY), 'each first step is due after today');

});

/* A PROJECT OF NO KNOWN KIND IS PLANNED TOO. Until the general plan was a kind, a boat, a thesis or a wedding
   formed nothing and the guide opened on empty lists, since its own example rows are never written. */
const BOAT = 'I want to restore an old wooden boat and sail it next summer';

test('A BOAT FORMS THE GENERAL PLAN: six milestones, the first underway, three first steps, each under its milestone', async () => {
  const formed = formedFor(guide, BOAT);
  assert.equal(formed?.kind, 'general');
  /* FORMED LIKE ANY KIND'S, in the document the first run installs, so the preview shows them before the person accepts. */
  const seeds = (carriedDocument(guide, TODAY, BOAT)?.seeds ?? []) as { register: string; fields: { tags?: string[] } }[];
  assert.equal(seeds.length, 11);
  assert.ok(seeds.every((s) => s.fields.tags?.includes('formed')), 'every row of the general plan is formed');

  const k = await guideFor(BOAT);
  const milestones = rows(k, 'milestones');
  assert.deepEqual(milestones.map((m) => m.fields.what).sort(), GENERAL_GUIDE.milestones.map(([, what]) => what).sort());
  assert.deepEqual(milestones.filter((m) => m.fields.state === 'underway').map((m) => m.fields.what), ['Say what it is and who it is for']);
  const steps = rows(k, 'steps');
  assert.equal(steps.length, 3);
  for (const s of [...steps, ...rows(k, 'choices'), ...rows(k, 'resources')]) {
    assert.ok(s.fields.milestone, `${JSON.stringify(s.fields)} has no milestone`);
    assert.ok((s.fields.tags as string[]).includes('formed'), `${JSON.stringify(s.fields)} is not formed`);
  }
  assert.ok(steps.every((s) => typeof s.fields.by === 'string' && s.fields.by > TODAY), 'each first step is due after today');

  /* AND THE GUIDE'S HOME DRAWS THE PATH, the next steps and what helps, as it does for a known kind. */
  const home = pageOf(k, 'home-guide');
  for (const b of home) assert.deepEqual(b.refusals ?? [], [], `${b.heading} was refused`);
  /* NO LINE OVER THE PATH SINCE guide 1.8.0 (3 Nov): it counted the milestones, steps and choices the lists show. */
  assert.deepEqual(home.filter((b) => b.drawn !== false).map((b) => b.heading), ['Where you are', 'Next three steps', 'Waiting on you', 'Resources']);
  assert.equal(home[0]!.rows?.length, 6, 'the path draws the six milestones');

  /* A KNOWN KIND STILL FORMS ITS OWN, never the general plan. */
  const shop = await guideFor('opening an Etsy shop for handmade candles');
  assert.equal(formedFor(guide, 'opening an Etsy shop for handmade candles')?.kind, 'shop');
  assert.ok(!rows(shop, 'milestones').some((m) => m.fields.what === 'Say what it is and who it is for'), 'a shop opens on a shop plan');
});

test('THE GUIDE CARRIES NO EXAMPLE ROWS: asked for its examples with no sentence, it plants nothing', async () => {
  assert.equal((GUIDE.pack as { seeds?: unknown[] }).seeds, undefined);
  const plain = await guideFor('', true);
  assert.deepEqual(rows(plain, 'milestones'), []);
});

test('THE GUIDE SAYS WHERE YOU ARE AND WHAT IS NEXT, and says nothing about what has not happened yet', async () => {
  const k = await guideFor('opening an Etsy shop for handmade candles');
  const blocks = pageOf(k, 'guide');
  for (const b of blocks) assert.deepEqual(b.refusals ?? [], [], `${b.heading} was refused: ${JSON.stringify(b.refusals)}`);
  const hidden = blocks.filter((b) => b.drawn === false).map((b) => b.heading);
  assert.deepEqual(hidden, ['Blocked', 'Steps done, by week', 'Taken by agents', 'Choices made', 'Done lately']);
  /* SO FAR WAS THE PAGE'S LINE FROM guide 1.5.0 TO 1.8.0 (3 Nov, "i dont like those briefs at all, remove them"): the
     page opens on Where you are now, and the figures it said are still the record's. */
  assert.deepEqual(blocks[0]!.kind, 'table');
  assert.equal(blocks.some((b) => (b as { lead?: boolean }).lead === true), false, 'the guide still opens on a line');
  assert.deepEqual(['guide-milestones-reached', 'guide-steps-open', 'guide-steps-done-7d', 'guide-choices-open'].map((m) => figure(k, m)), [0, 5, 0, 2]);
  assert.equal(block(blocks, 'Where you are').rows?.length, 1);
  assert.equal(block(blocks, 'Your next steps').rows?.length, 5);
  assert.equal(block(blocks, 'What helps').rows?.length, 3);

  /* THE MILESTONE UNDERWAY HAS ITS OWN PAGE, with what helps with it. */
  const slugs = (k.pages() as { slug: string }[]).map((p) => p.slug);
  const own = slugs.find((s) => s.startsWith('say-what-you-will-sell'));
  assert.ok(own, `no page for the milestone underway: ${slugs.join(', ')}`);
  const page = pageOf(k, own);
  for (const b of page) assert.deepEqual(b.refusals ?? [], [], `${b.heading} was refused`);
  assert.deepEqual(block(page, 'What helps').rows?.map((r) => r.fields.name), ['Three shops like yours to learn from']);
  assert.equal(block(page, 'Steps').rows?.length, 2);

  const home = pageOf(k, 'home-guide');
  for (const b of home) assert.deepEqual(b.refusals ?? [], [], `${b.heading} was refused`);
  /* AND NO BAND FOR A DECISION WHILE NONE IS ASKED, SINCE guide 1.5.0. */
  assert.deepEqual(home.filter((b) => b.drawn === false).map((b) => b.heading), ['A decision waiting', 'Blocked']);
});

test('AN AGENT TAKES A STEP, RECORDS A CHOICE WITH ITS REASON AND ADDS WHAT HELPED, and the Guide says who did each', async () => {
  const k = await guideFor('I want to start a podcast');
  const agent = { actor: 'agent:claude' };
  const owner = { actor: 'p_owner' };
  const listen = byTitle(k, 'steps', 'what', 'Listen to three shows like yours and note what works');
  value(k.update('steps', `steps#${listen.seq}`, { agent: 'claude', state: 'doing' }, agent));
  const ideas = byTitle(k, 'steps', 'what', 'List ten episode ideas');
  value(k.update('steps', `steps#${ideas.seq}`, { agent: 'claude', state: 'done' }, agent));
  const test = byTitle(k, 'steps', 'what', 'Record a ten-minute test with the gear you have');
  value(k.update('steps', `steps#${test.seq}`, { state: 'blocked', waiting_on: 'A microphone to arrive' }, owner));
  const format = byTitle(k, 'choices', 'question', 'Alone, with a co-host, or with guests?');
  value(k.update('choices', `choices#${format.seq}`, { state: 'made', picked: 'With a guest each episode', why: 'Guests bring their own listeners, and it is easier to talk than to monologue.' }, agent));
  const pilot = byTitle(k, 'milestones', 'what', 'Record and edit a pilot episode');
  value(k.create('resources', { name: 'A guide to recording remote interviews', kind: 'guide', link: 'https://example.org/remote-interviews', milestone: pilot.id }, agent));

  const blocks = pageOf(k, 'guide');
  for (const b of blocks) assert.deepEqual(b.refusals ?? [], [], `${b.heading} was refused`);
  assert.deepEqual(blocks.filter((b) => b.drawn === false).map((b) => b.heading), [], 'every block has something to say now');
  const said = (b: Drawn) => (b.rows ?? []).map((r, i) => [r.fields.what ?? r.fields.question, b.changes?.[i]?.who ?? null]);
  assert.deepEqual(said(block(blocks, 'Taken by agents')), [['Listen to three shows like yours and note what works', 'agent:claude']]);
  assert.deepEqual(said(block(blocks, 'Choices made')), [['Alone, with a co-host, or with guests?', 'agent:claude']]);
  assert.deepEqual(said(block(blocks, 'Blocked')), [['Record a ten-minute test with the gear you have', 'p_owner']]);
  const done = block(blocks, 'Done lately');
  assert.deepEqual(said(done), [['List ten episode ideas', 'agent:claude']]);
  assert.equal(done.rows?.[0]?.fields.done_on, TODAY, 'the record fills the day a step was done');
  assert.deepEqual(['guide-milestones-reached', 'guide-steps-open', 'guide-steps-done-7d', 'guide-choices-open'].map((m) => figure(k, m)), [0, 3, 1, 1]);
  assert.equal(figure(k, 'guide-steps-blocked'), 1);
  assert.equal(block(blocks, 'Steps done, by week').refusals?.length ?? 0, 0);
  assert.ok(block(blocks, 'What helps').rows?.some((r) => r.fields.name === 'A guide to recording remote interviews'));
});

test('ONCE THE IDEA STAGE IS DONE THE GUIDE SAYS SO, by the figures Slash reads to ask about running the project', async () => {
  const k = await guideFor('I want to build an app for dog walkers');
  const holds = () => GUIDE_GROWS.when.every((w) => {
    const v = figure(k, w.metric) ?? 0;
    return 'is' in w ? v === w.is : v > w.gt;
  });
  assert.equal(holds(), false, 'a new guide is in its idea stage');
  const idea = rows(k, 'milestones').filter((m) => m.fields.stage === 'idea');
  assert.equal(idea.length, 2);
  value(k.update('milestones', `milestones#${idea[0]!.seq}`, { state: 'reached' }, { actor: 'p_owner' }));
  assert.equal(holds(), false, 'one idea milestone is still to reach');
  value(k.update('milestones', `milestones#${idea[1]!.seq}`, { state: 'reached' }, { actor: 'p_owner' }));
  assert.equal(holds(), true);
  assert.equal(rows(k, 'milestones').find((m) => m.seq === idea[1]!.seq)?.fields.reached_on, TODAY);
  assert.deepEqual([...GUIDE_GROWS.install], ['portfolio', 'work']);
});
