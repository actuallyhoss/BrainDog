/**
 * Every module page carries the five parts (PGS-C18 job 5): its line, a queue of what waits on you about its own list,
 * its figures, the agents at work on it, and the list itself. Work, Projects, People and Services, each with at most six
 * tiles before its fold. And Activity declares the three things a person narrows the log by (PGS-C24 job 3).
 *
 * WHY THIS FILE EXISTS. On the owner's record a page said all was quiet while Decide's badge said 25, People drew no
 * figure, and neither People nor Services showed an agent at work, though agents had met everybody on People. Each page
 * was built one tile at a time, so nothing held the whole of one.
 *
 * WHAT IS HELD. The declarations: each part, where it reads and when it is drawn. A fresh record: every page reads with
 * no refusal and opens on its line, and at most six tiles stand before the fold. And a record at work: one question
 * about a row of each list, a run that made and changed one row of each, and every page draws all five parts. Every
 * name here is invented.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, validateDeclaration, type Kernel } from '@braindog/kernel';
import { sayOf } from '@braindog/ports';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { NOW, PAGES, declarations, metricDeclarations, pageDeclarations } from '../src/index.ts';
import { BASE_PAGES } from '../src/modules/base.ts';
import { SERVICE_NUMBERS } from '../src/modules/estate.ts';
import { PEOPLE_METRICS } from '../src/modules/people.ts';

type When = { metric: string; gt?: number; gte?: number; lt?: number; lte?: number; is?: number };
type Block = {
  kind: string;
  heading?: string;
  lead?: boolean;
  fold?: boolean;
  box?: boolean;
  area?: string;
  when?: When;
  source?: string;
  where?: unknown;
  first?: number;
  cells?: { metric: string; trend?: string }[];
};
type Drawn = Block & { drawn?: boolean; refusals?: unknown[]; queue?: unknown[]; feed?: { who?: string | null }[]; rows?: unknown[] };

/** Each module page, by its slug, and the list it is about. */
const PAGE_LIST = { work: 'tasks', portfolio: 'things', people: 'people', estate: 'services' } as const;
type Slug = keyof typeof PAGE_LIST;
const SLUGS = Object.keys(PAGE_LIST) as Slug[];
const blocksOf = (slug: Slug): Block[] => (PAGES[slug] as unknown as { blocks: Block[] }).blocks;

/** A chart a page draws its figures as, beside a strip of them. */
const CHARTS = new Set(['split', 'bar', 'lines', 'line', 'heat']);
/** What a list is drawn as. */
const LISTED = new Set(['cards', 'table', 'todo', 'timeline', 'params']);

/** The five parts, each as the test on one block that says it is that part. */
const PARTS: Record<string, (b: Block, list: string) => boolean> = {
  lead: (b) => b.kind === 'note' && b.lead === true,
  queue: (b, list) =>
    b.kind === 'queue' && b.source === 'governance.open' && b.where === `list is ${list}` && b.when?.metric === `questions-open-in:${list}` && b.when.gt === 0 && Object.keys(b.when).length === 2,
  figures: (b) => (b.kind === 'stat' && (b.cells ?? []).length > 0) || CHARTS.has(b.kind),
  /* AN AGENT AT WORK: the runs that changed the list, from the log, or the rows of it an agent holds. */
  agents: (b, list) =>
    (b.kind === 'agents' && b.source === 'activity' && typeof b.where === 'string' && b.where.startsWith('list is ') && b.where.slice(8).split(' or ').includes(list)) ||
    (b.source === `register.${list}` && typeof b.where === 'string' && /\bagent is set\b/u.test(b.where)),
  list: (b, list) => LISTED.has(b.kind) && b.source === `register.${list}`,
};

/**
 * Tiles before the fold, as `calm-pages.test.ts` counts them: no line, nothing that stands in for one, a boxed run as
 * one, the rail left out. `drawn` narrows it to what a record drew.
 */
function aboveTheFold(blocks: readonly Drawn[], drawn = false): string[] {
  const leads = blocks.filter((b) => b.lead && b.when !== undefined).map((b) => b.when!);
  const twinOf = (b: Block): boolean =>
    b.kind === 'note' && b.when?.gt !== undefined && blocks.some((o) => o !== b && o.kind === 'note' && o.when?.metric === b.when!.metric && o.when?.is === b.when!.gt);
  const standsIn = (b: Block): boolean =>
    b.when !== undefined && (b.when.lt !== undefined || twinOf(b) || leads.some((w) => w.metric === b.when!.metric && w.lt !== undefined && b.when!.gte === w.lt));
  const opening = blocks.find((b) => !b.lead);
  const main = blocks.filter((b) => b.area !== 'rail' && !(b === opening && b.kind === 'capture') && !(drawn && b.drawn === false));
  const fold = main.findIndex((b) => b.kind === 'section' && b.fold === true);
  let boxed = false;
  return (fold < 0 ? main : main.slice(0, fold))
    .filter((b) => {
      if (b.kind === 'section') return (boxed = b.box === true);
      return !boxed && !b.lead && !standsIn(b);
    })
    .map((b) => b.heading ?? b.kind);
}

/** A record holding every list the modules declare, their figures and their pages, and no row. */
async function fresh(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const out = await k.install([...declarations(), ...metricDeclarations(), ...pageDeclarations()]);
  assert.ok(out.ok, sayOf(out));
  return k;
}

const answered = (k: Kernel, page: string): Drawn[] => {
  const out = k.page(page) as { ok: boolean; value?: { blocks: Drawn[] } };
  assert.ok(out.ok, sayOf(out as never));
  return out.value!.blocks;
};

/** The page's sentence, by the web's rule (`leadIndex` in apps/web): the first block drawn, when it is a lead note. */
const sentenceOf = (blocks: readonly Drawn[]): Drawn | undefined => {
  const first = blocks.find((b) => b.drawn !== false);
  return first && PARTS.lead!(first, '') ? first : undefined;
};

test('EACH MODULE PAGE DECLARES THE FIVE PARTS: its line, one queue over its own list, figures, agents at work, the list', () => {
  for (const slug of SLUGS) {
    const list = PAGE_LIST[slug];
    const blocks = blocksOf(slug);
    assert.ok(PARTS.lead!(blocks[0]!, list), `${slug} does not open on its line`);
    for (const [part, is] of Object.entries(PARTS)) assert.ok(blocks.some((b) => is(b, list)), `${slug} carries no ${part}`);
    assert.equal(blocks.filter((b) => b.kind === 'queue').length, 1, `${slug} carries one queue`);
  }
});

test('PEOPLE AND SERVICES SHOW WHAT AGENTS DID ON THEM, from the log, three to a run, and nothing when no agent did', () => {
  const wanted = { people: 'list is people or organisations', estate: 'list is services' } as const;
  for (const [slug, where] of Object.entries(wanted) as [Slug, string][]) {
    const agents = blocksOf(slug).filter((b) => b.kind === 'agents');
    assert.equal(agents.length, 1, `${slug} carries one agents block`);
    const a = agents[0] as Block & { empty?: string; icon?: string };
    assert.deepEqual([a.heading, a.source, a.where, a.first], ['What agents did', 'activity', where, 3]);
    assert.equal(a.empty, undefined, `${slug}: an empty agents block says nothing rather than a line`);
    assert.equal(a.when, undefined, 'no figure counts the log, so no when');
  }
  /* SERVICES' IS UNDER ITS FOLD, so a founder's page, which lays a sixth tile above it, stays at six. */
  const estate = blocksOf('estate');
  const fold = estate.findIndex((b) => b.kind === 'section' && b.fold === true);
  assert.ok(fold >= 0 && estate.findIndex((b) => b.kind === 'agents') > fold, 'Services draws what agents did above its fold');
});

test('PEOPLE SAYS HOW MANY YOU WERE IN TOUCH WITH, with its month as a line saved each night, and the line says it no more', () => {
  const stat = blocksOf('people').filter((b) => b.kind === 'stat');
  assert.equal(stat.length, 1);
  assert.deepEqual(stat[0]!.cells, [{ metric: 'people-in-touch-30d', label: 'In touch, 30 days', trend: '30d' }]);
  assert.deepEqual(stat[0]!.when, { metric: 'people-count', gt: 0 });
  assert.deepEqual(PEOPLE_METRICS['people-in-touch-30d']!.snapshot, { grain: 'day', into: 'series.people-in-touch-30d' });
  for (const lead of blocksOf('people').filter((b) => b.lead)) assert.doesNotMatch(String((lead as { body?: string }).body), /\{\{people-in-touch-30d\}\}/u);
});

test('AT MOST SIX TILES BEFORE EACH FOLD, as declared, and with the numbers a founder lays on Services', () => {
  for (const slug of SLUGS) {
    const above = aboveTheFold(blocksOf(slug));
    assert.ok(above.length <= 6, `${slug} shows ${above.length} tiles before its fold: ${above.join(', ')}`);
  }
  const estate = [...blocksOf('estate')];
  estate.splice(estate.findIndex((b) => b.heading === SERVICE_NUMBERS.after) + 1, 0, SERVICE_NUMBERS.block as unknown as Block);
  assert.ok(aboveTheFold(estate).length <= 6);
});

test('ON A FRESH RECORD EVERY PAGE READS, opens on its line, and stands at most six tiles before its fold', async () => {
  const k = await fresh();
  for (const slug of SLUGS) {
    const blocks = answered(k, slug);
    for (const b of blocks) assert.deepEqual(b.refusals ?? [], [], `${slug}: ${b.heading ?? b.kind}`);
    assert.ok(sentenceOf(blocks), `${slug} opens on no sentence`);
    assert.ok(aboveTheFold(blocks, true).length <= 6, `${slug}: ${aboveTheFold(blocks, true).join(', ')}`);
    /* NOTHING ASKED AND NO AGENT AT WORK, so neither is drawn: no band saying nothing waits. */
    for (const b of blocks.filter((x) => x.kind === 'queue' || x.kind === 'agents')) assert.equal(b.drawn, false, `${slug} draws ${b.heading} on a fresh record`);
  }
});

test('ACTIVITY DECLARES WHO, WHAT KIND AND WHICH LIST as the three things its log is narrowed by', () => {
  const page = BASE_PAGES.activity as { filters?: unknown };
  assert.deepEqual(page.filters, [
    { field: 'who', control: 'chips' },
    { field: 'kind', control: 'chips' },
    { field: 'list', control: 'chips' },
  ]);
  assert.equal(validateDeclaration({ id: 'page.activity', kind: 'page', body: BASE_PAGES.activity as never, pack: 'people' }), null);
  /* A FILTER IS { field, control }: one that names no control is refused, so the three each say how they are drawn. */
  const bare = { ...BASE_PAGES.activity, filters: [{ field: 'who' }] };
  assert.notEqual(validateDeclaration({ id: 'page.activity', kind: 'page', body: bare as never, pack: 'people' }), null);
});

/** What a run writes, signed by its spoken id as an agent's run signs, so the log reads it as an agent's. */
const RUN = { actor: 'S4' };
const made = <T = { id: string; seq: number }>(out: unknown): T => {
  assert.ok((out as { ok: boolean }).ok, sayOf(out as never));
  return (out as { value: T }).value;
};

/** One question about `about`, signed by the record's own agent, as an automation's would be. */
function ask(k: Kernel, question: string, about: string): void {
  const out = k.propose({ question, body_kind: 'options', body: { options: [{ id: 'yes', label: 'Yes', because: 'It is due.' }, { id: 'no', label: 'No', because: 'It can wait.' }], about } } as never, 'slash');
  assert.ok((out as { ok: boolean }).ok, sayOf(out as never));
}

test('ON A RECORD AT WORK EVERY PAGE DRAWS ALL FIVE: one sentence, its queue, its figures, the run that worked on it, the list', async () => {
  const k = await fresh();
  const project = made(k.create('things', { name: 'Harbour app', lane: 'building', agent: 'claude' }, RUN));
  made(k.create('tasks', { what: 'Ship the harbour sign-up', state: 'open', agent: 'claude', thing: project.id }, RUN));
  const person = made(k.create('people', { name: 'Wren Halloway', in_touch: '2026-03-01' }, RUN));
  made(k.update('people', person.id, { role: 'client' }, RUN));
  made(k.create('organisations', { name: 'Halden Type Co', kind: 'client' }, RUN));
  made(k.create('services', { name: 'harbour.example', provider: 'Cove Domains', kind: 'domain', state: 'live', cycle: 'yearly', cost: { amount: 1_400, currency: 'GBP' }, renews: '2026-04-01', points_at: 'Pages' }, RUN));
  ask(k, 'Move the harbour launch to Friday?', 'tasks#1');
  ask(k, 'Park the harbour app for a month?', 'things#1');
  ask(k, 'Send Wren Halloway the March invoice?', 'people#1');
  ask(k, 'Renew harbour.example for two years?', 'services#1');

  for (const slug of SLUGS) {
    const list = PAGE_LIST[slug];
    const blocks = answered(k, slug);
    for (const b of blocks) assert.deepEqual(b.refusals ?? [], [], `${slug}: ${b.heading ?? b.kind}`);
    const shown = blocks.filter((b) => b.drawn !== false);
    assert.ok(sentenceOf(blocks), `${slug} opens on no sentence`);
    for (const [part, is] of Object.entries(PARTS)) assert.ok(shown.some((b) => is(b, list)), `${slug} draws no ${part}`);
    assert.equal(shown.find((b) => b.kind === 'queue')?.queue?.length, 1, `${slug}'s queue draws its one question`);
    assert.ok(aboveTheFold(blocks, true).length <= 6, `${slug}: ${aboveTheFold(blocks, true).join(', ')}`);
  }
  /* AND ON PEOPLE AND SERVICES, WHO IT WAS: the run, by its handle, over what it changed on that page's lists only. */
  for (const slug of ['people', 'estate'] as const) {
    const agents = answered(k, slug).find((b) => b.kind === 'agents')!;
    assert.ok((agents.feed ?? []).length > 0 && agents.feed!.every((r) => r.who === RUN.actor), `${slug}: ${JSON.stringify(agents.feed)}`);
  }
  const people = answered(k, 'people').find((b) => b.kind === 'agents')!;
  const targets = (people.feed as { target?: string | null }[]).map((r) => r.target).sort();
  assert.deepEqual(targets, ['organisations#1', 'people#1'], "the person and the organisation the run made: never the project's, the task's or the service's");
  const estate = answered(k, 'estate').find((b) => b.kind === 'agents')!;
  assert.deepEqual((estate.feed as { target?: string | null }[]).map((r) => r.target), ['services#1']);
});

test('IN TOUCH IS SAVED EACH NIGHT, and its line is drawn from the nights the record kept', async () => {
  const sql = openSqlite();
  let now = NOW;
  const k = await openRecord(sql, { now: () => now });
  const out = await k.install([...declarations(), ...metricDeclarations(), ...pageDeclarations()]);
  assert.ok(out.ok, sayOf(out));
  const day = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
  for (const name of ['Wren Halloway', 'Orrin Bask']) made(k.create('people', { name, in_touch: day(NOW - 3 * 86_400_000) }, { actor: 'p_1' }));
  const points = () => sql.all<{ value: number }>("SELECT value FROM metric_point WHERE series IN ('people-in-touch-30d', 'series.people-in-touch-30d') ORDER BY at");
  assert.deepEqual(points(), [], 'a night is remembered before a save has run');

  const cell = () => (answered(k, 'people').find((b) => b.kind === 'stat') as Drawn & { readings?: { trend?: (number | null)[] }[] }).readings?.[0];
  assert.equal(cell()?.trend, undefined, 'a line with no night kept');
  for (let n = 1; n <= 3; n++) {
    now = NOW + n * 86_400_000;
    await k.drain();
  }
  assert.ok(points().length >= 3, `three nights kept ${points().length}`);
  /* THE NIGHTS SINCE THEY WERE IN TOUCH COUNT THE TWO: the save counts the figure as it stood each night. */
  assert.deepEqual(points().slice(-3).map((p) => p.value), [2, 2, 2], 'each night since counts the two in touch');
  const trend = cell()?.trend ?? [];
  assert.equal(trend.length, 30, 'a month of nights');
  assert.ok(trend.filter((v) => v !== null).length >= 3, 'the line has its three points');
  assert.deepEqual(trend.slice(-3), [2, 2, 2], 'and its last nights are the two in touch');
  sql.close();
});
