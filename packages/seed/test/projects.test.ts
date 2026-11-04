/**
 * Projects as a pack, on a real record: the figures its Overview leads with, the queue of projects somebody said are not
 * going well, an agent taking a project, saying where it stands and proposing to park it through the same write and
 * proposal path an agent's tools use, with the page saying who did each thing, and the rule that asks about a missed day.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { openRecord, type Kernel, type PageResult } from '@braindog/kernel';
import type { Param, Row, Sql } from '@braindog/ports';
import { sayOf } from '@braindog/ports';

import { NOW, PAGES, TASKS, THINGS, firstPartyDocument, firstPartyManifest, installSeed } from '../src/index.ts';
import { PORTFOLIO_REGISTERS, PROJECT_METRICS } from '../src/modules/portfolio.ts';

function openSqlite(): Sql {
  const db = new DatabaseSync(':memory:');
  let depth = 0;
  return {
    exec: (text, ...params) => {
      if (params.length === 0) db.exec(text);
      else db.prepare(text).run(...(params as never[]));
    },
    all: <T = Row>(text: string, ...params: Param[]) => db.prepare(text).all(...(params as never[])) as T[],
    one: <T = Row>(text: string, ...params: Param[]) => db.prepare(text).get(...(params as never[])) as T | undefined,
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
  };
}

async function seeded(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), { now: () => NOW });
  const out = await installSeed(k);
  assert.ok(out.ok, sayOf(out));
  return k;
}

const opened = (k: Kernel, slug: string): PageResult => {
  const out = k.page(slug);
  assert.ok(out.ok, `${slug}: ${sayOf(out)}`);
  return out.value;
};

/* THE ONE THE RECORD DREW, WHERE TWO SHARE A HEADING: since portfolio 1.15.0 the Overview declares what it holds under an
   open heading and again under a folded one, on one figure, and a record reads exactly one of each pair. */
const block = (p: PageResult, heading: string) => {
  const b = p.blocks.find((x) => x.heading === heading && x.drawn !== false) ?? p.blocks.find((x) => x.heading === heading);
  assert.ok(b, `${p.slug ?? 'the page'} has no ${heading}`);
  assert.deepEqual(b.refusals, [], `${heading}: ${JSON.stringify(b.refusals)}`);
  return b;
};

/**
 * THE PARKED PROJECTS AS THE OVERVIEW DRAWS THEM (proj F5): the cards of In play whose lane
 * is parked, which the app draws under the lane bar's Parked, where a table under Parked and finished listed them.
 */
const parkedOf = (p: PageResult) => {
  const b = block(p, 'In play');
  assert.deepEqual([b.kind, b.drawn !== false], ['cards', true]);
  return b.rows.filter((r) => r.fields.lane === 'parked');
};

const names = (rows: readonly { fields: Record<string, unknown> }[]) => rows.map((r) => String(r.fields.name));

/** One of the Overview's figures, read as the record reads it. */
const figure = (k: Kernel, id: string): number | null => {
  const out = k.metric(PROJECT_METRICS[id] as never);
  assert.ok(out.ok, `${id}: ${sayOf(out)}`);
  return out.value.value;
};
const TODAY = new Date(NOW).toISOString().slice(0, 10);
const inPlay = (t: (typeof THINGS)[number]) => t.lane === 'building' || t.lane === 'earning';

test('THE OVERVIEW AND EVERY PROJECT PAGE OPEN ON THE SAMPLE WITH NO BLOCK REFUSED, and the figures count the sample’s projects', async () => {
  const k = await seeded();
  for (const slug of ['portfolio', 'kiln', 'marlow-co', 'portage']) for (const b of opened(k, slug).blocks) assert.deepEqual(b.refusals, [], `${slug} ${b.heading}`);

  const overview = opened(k, 'portfolio');
  /* IN PLAY IS THE LINE'S, SINCE portfolio 1.10.0, beside what needs you, and what aims within thirty days is a figure
     the fold's Coming up is drawn under. */
  /* AND SINCE portfolio 1.12.0 THE LINE NAMES THEM, which need a push and which are on track, from the rows. */
  /* SINCE portfolio 1.30.0 NO LINE IS SAID FROM HEALTH over projects in play: the board leads with what is late, due,
     quiet, asked and renewing, by name, and a line read off health alone said "Nothing needs a push" over late work. */
  assert.deepEqual(
    overview.blocks.filter((b) => (b as { lead?: boolean }).lead === true && b.drawn !== false).map((b) => (b as { body?: string }).body),
    [],
    'a line is said over the board',
  );
  assert.equal(figure(k, 'projects-live'), THINGS.filter(inPlay).length);
  assert.equal(
    figure(k, 'projects-aim-30d'),
    THINGS.filter((t) => inPlay(t) && typeof t.aim === 'string' && t.aim >= TODAY && t.aim <= new Date(NOW + 30 * 86_400_000).toISOString().slice(0, 10)).length,
  );
  /* NEED YOU IS THE LINE'S, SINCE portfolio 1.8.0, said once, and SINCE portfolio 1.11.0 the cards in play say which:
     each carries its health and its next step, so a table of the same projects said them again. */
  assert.ok(!overview.blocks.some((b) => b.heading === 'Needs you'), 'Needs you says again what the cards say');
  const atRisk = block(overview, 'In play').rows.filter((r) => r.fields.health === 'at_risk' || r.fields.health === 'off_track');
  assert.deepEqual(names(atRisk).sort(), ['Kiln', 'Portage']);
  const byHealth = k.metric(PROJECT_METRICS['projects-by-health'] as never);
  assert.ok(byHealth.ok, sayOf(byHealth));
  const parts = byHealth.value.groups ?? [];
  assert.equal(parts.reduce((n, g) => n + Number(g.value), 0), THINGS.filter(inPlay).length, 'every project in play is a part');
  /* NO BAR OF THEM SINCE portfolio 1.31.2 (fdc1b185b): each card in play says its own health, and the bar said it again. The figure stays, for what else reads it. */
  assert.ok(!overview.blocks.some((b) => b.heading === 'How they are going'), 'How they are going is drawn again');
  assert.deepEqual(names(parkedOf(overview)), ['Tallow']);

  /* WHO HOLDS IT IS ON ITS CARD (proj F5), where a table With an agent said it again. */
  assert.ok(!overview.blocks.some((b) => b.heading === 'With an agent'), 'With an agent says again what the cards say');
  const held = block(overview, 'In play').rows.filter((r) => typeof r.fields.agent === 'string' && r.fields.agent !== '');
  assert.deepEqual(held.map((r) => [r.fields.name, r.fields.agent]), [['Kiln', 'claude'], ['Marlow & Co', 'cursor']]);
});

test('AN AGENT TAKES A PROJECT, SAYS IT IS OFF TRACK, AND A PERSON PUTS IT RIGHT, and the page says who did each', async () => {
  const k = await seeded();
  const agent = { actor: 'agent:codex' };
  const person = { actor: 'p_1' };
  const seq = THINGS.findIndex((t) => t.name === 'Marlow & Co') + 1;
  const ref = `things#${seq}`;

  /* TAKE, AND SAY WHERE IT STANDS. */
  assert.ok(k.update('things', ref, { agent: 'codex', health: 'off_track', next: 'Halden says nothing is due yet. Ask when their terms end.', progress: 80 }, agent).ok);
  /* THE CARD SAYS WHO HOLDS IT AND HOW IT IS GOING (proj F5); who wrote each is the row's history. */
  const card = () => block(opened(k, 'portfolio'), 'In play').rows.find((r) => r.fields.name === 'Marlow & Co');
  assert.equal(card()?.fields.agent, 'codex', 'the agent that took it is not on its card');
  assert.equal(card()?.fields.health, 'off_track', 'what the agent said is not on its card');

  /* A PERSON READS IT AND SAYS IT IS ON TRACK: its card says so. */
  assert.ok(k.update('things', ref, { health: 'on_track' }, person).ok);
  assert.equal(card()?.fields.health, 'on_track');

  /* AND THE PROJECT'S OWN PAGE SAYS WHERE IT STANDS. */
  const stands = block(opened(k, 'marlow-co'), 'Where it stands');
  assert.deepEqual(stands.rows.map((r) => [r.fields.health, r.fields.agent]), [['on_track', 'codex']]);
});

test('AN AGENT PROPOSES PARKING A PROJECT, NOTHING CHANGES UNTIL A PERSON ACCEPTS, and then it folds away as theirs', async () => {
  const k = await seeded();
  const seq = THINGS.findIndex((t) => t.name === 'Portage') + 1;
  const row = k.get(`things#${seq}`)!;
  const filed = k.propose(
    {
      question: 'Park Portage until the sending domain is chosen?',
      body_kind: 'rowset',
      body: { register: 'things', rows: [{ at: `things#${seq}`, version: row.version, patch: { lane: 'parked', next: 'Pick it up once the sending domain is chosen' } }] },
    },
    'agent:claude',
  );
  assert.ok(filed.ok, sayOf(filed));
  assert.ok(names(block(opened(k, 'portfolio'), 'In play').rows).includes('Portage'), 'a proposal changed the project before anybody answered');

  const decided = k.decide(filed.value.id, { decide: { option: 'accept', reason: 'Nothing moves on it until the domain is chosen' } }, 'p_1');
  assert.ok(decided.ok, sayOf(decided));
  const overview = opened(k, 'portfolio');
  /* PARKED IS A LANE OF THE CARDS (proj F5): Portage is drawn under it, and no longer in play. */
  assert.ok(!block(overview, 'In play').rows.some((r) => r.fields.name === 'Portage' && r.fields.lane !== 'parked'), 'Portage is still in play');
  assert.deepEqual(names(parkedOf(overview)), ['Portage', 'Tallow']);
});

/**
 * A PAGE WITH NOTHING IN PLAY SAYS SO IN ITS LINE, SINCE portfolio 1.13.0, and Parked and finished counts what it folds
 * without reading it. "Every project in play is on track" was the line over a page with none, while In play said its own
 * empty line under it; and the section read every parked project whole, notes and all, for the one number it draws.
 */
test('WITH NOTHING IN PLAY THE LINE SAYS SO AND HOW TO START, and the parked are the cards', async () => {
  const k = await seeded();
  for (const [n, t] of THINGS.entries()) if (inPlay(t)) assert.ok(k.update('things', `things#${n + 1}`, { lane: 'parked' }, { actor: 'p_1' }).ok);
  const overview = opened(k, 'portfolio');
  const leads = overview.blocks.filter((b) => b.kind === 'note' && (b as { lead?: boolean }).lead === true) as { body?: string; drawn?: boolean }[];
  /* THE FIRST IS THE RECORD WITH NO PROJECT AT ALL, SINCE portfolio 1.27.0, which this is not. */
  assert.equal(leads[0]!.drawn, false, 'a record with parked projects says it has none');
  assert.equal(leads[1]!.drawn !== false, true, 'a page with nothing in play does not say so');
  assert.equal(leads[1]!.body, 'No project is in play. Add one, or set a parked one building.');
  /* THE LINES SAID FROM HEALTH ARE GONE, SINCE portfolio 1.30.0: the board says what is late, due and quiet. */
  assert.equal(leads.length, 2, 'the page declares a line said from health again');
  assert.deepEqual(
    leads.filter((b) => b.drawn !== false).map((b) => b.body),
    ['No project is in play. Add one, or set a parked one building.'],
    'a page with nothing in play says two lines',
  );
  const first = leads.find((b) => b.drawn !== false);
  assert.doesNotMatch(String(first?.body), /\{\{/u, `the nightly line is asked of a line of noughts: ${first?.body}`);
  /* THE PARKED ARE THE CARDS UNDER THE LANE BAR'S PARKED (proj F5), so a page with
     nothing in play still shows what could be set building. */
  assert.equal(parkedOf(overview).length, THINGS.length);
  assert.ok(!overview.blocks.some((b) => b.heading === 'Parked and finished'), 'Parked and finished is drawn again');

  /* A FINISHED PROJECT IS A ROW OF THE BOARD, SINCE portfolio 1.30.0, which counts it on its date line and folds it into
     its last strip; it is never parked. */
  assert.ok(k.create('things', { name: 'Fathom', lane: 'retired' } as never, { actor: 'p_1' }).ok);
  const longer = opened(k, 'portfolio');
  assert.equal(parkedOf(longer).length, THINGS.length);
  assert.deepEqual(
    block(longer, 'In play').rows.filter((r) => r.fields.name === 'Fathom').map((r) => r.fields.lane),
    ['retired'],
    'the board does not hold the finished project',
  );
});

/**
 * WHAT EACH ONE EARNS ALONE, AND NO FOLD (proj F5). The Overview held the cards, then a
 * heading over what each earns, what agents hold and what is coming up, then the parked and finished as a table: every
 * one of those is on a card now (who holds it, how far along, the day it aims for, and Parked as a lane), so the page is
 * the cards and the split, the split only while two or more say what they earn.
 */
test('PROJECTS IS THE CARDS AND WHAT EACH EARNS, with no heading over them and nothing folded, short or long', async () => {
  const k = await seeded();
  const gone = ['Earnings, agents and dates', 'With an agent', 'Coming up', 'Parked and finished', 'Not in play'];
  const short = opened(k, 'portfolio');
  for (const b of short.blocks) assert.deepEqual(b.refusals, [], String(b.heading));
  assert.deepEqual(short.blocks.filter((b) => gone.includes(String(b.heading))).map((b) => b.heading), [], 'a tile the cards say is declared again');
  assert.ok(!short.blocks.some((b) => b.drawn !== false && (b as { fold?: unknown }).fold === true), 'Projects ends on a folded heading');
  /* WHAT EACH ONE EARNS IS THE BOARD'S, SINCE portfolio 1.30.0, a month at a time beside its headline. */
  assert.ok(!short.blocks.some((b) => b.heading === 'What each one earns'), 'the split of the year each one typed is declared again');

  /* PAST FOUR, STILL NOTHING FOLDS: the cards are the page however many there are. */
  for (const name of ['Fathom', 'Quire']) assert.ok(k.create('things', { name, lane: 'building', aim: TODAY } as never, { actor: 'p_1' }).ok);
  for (const name of ['Ember', 'Latch', 'Marrow', 'Nettle']) assert.ok(k.create('things', { name, lane: 'parked' } as never, { actor: 'p_1' }).ok);
  const long = opened(k, 'portfolio');
  for (const b of long.blocks) assert.deepEqual(b.refusals, [], String(b.heading));
  assert.ok(!long.blocks.some((b) => b.drawn !== false && (b as { fold?: unknown }).fold === true), 'a long Projects folds its cards');
  assert.equal(parkedOf(long).length, 5);

  /* WITH NONE SAYING WHAT IT EARNS, NO SPLIT IS DRAWN. */
  const bare = await seeded();
  for (const n of THINGS.keys()) assert.ok(bare.update('things', `things#${n + 1}`, { lane: 'building', revenue: null, agent: null, aim: null } as never, { actor: 'p_1' }).ok);
  const ends = opened(bare, 'portfolio');
  assert.equal(block(ends, 'In play').rows.length, THINGS.length);
  const said = (ends.blocks as (PageResult['blocks'][number] & { body?: string })[]).filter((b) => typeof b.body === 'string' && b.body.includes('say what they earned'));
  assert.deepEqual(said, [], 'the page declares the line again');
});

test('A PROJECT PAST THE DAY IT AIMED FOR IS ASKED ABOUT ON DECIDE, once, and nothing is written', async () => {
  const k = await seeded();
  const seq = THINGS.findIndex((t) => t.name === 'Kiln') + 1;
  const yesterday = new Date(NOW - 86_400_000).toISOString().slice(0, 10);
  assert.ok(k.update('things', `things#${seq}`, { aim: yesterday }, { actor: 'p_1' }).ok);
  for (let i = 0; i < 2; i++) assert.ok(k.applyRule('project-past-aim').ok);

  const open = k.governance('suggestion', { status: 'open' });
  assert.ok(open.ok, sayOf(open));
  const asked = open.value.filter((r) => r.opened_by === 'rule:project-past-aim');
  assert.equal(asked.length, 1, 'asked once per project and day');
  assert.equal(k.question(String(asked[0]!.id)), 'Kiln was aiming for 1 day ago. Move the day, or park it?');
  assert.equal(k.get(`things#${seq}`)!.fields.lane, 'earning', 'the rule wrote nothing');
  assert.equal(figure(k, 'projects-aim-30d'), 1, 'a missed day is no longer ahead');
});

test('PROJECTS INSTALLS ALONE: a record with only projects, its Overview opens and a project written by hand is on it', async () => {
  const { install, normalise, plan } = await import('@braindog/declare');
  const k = await openRecord(openSqlite(), { now: () => NOW });
  assert.deepEqual(firstPartyManifest('portfolio').requires, [], 'Projects needs no other module');
  assert.ok(firstPartyManifest('portfolio').provides.includes('page.portfolio'));

  const doc = firstPartyDocument('portfolio', { holds: ['things'], seeds: [] })!;
  const packed = await normalise(doc, { kind: 'local' });
  assert.ok(packed.ok, sayOf(packed));
  const state = { format: 1, primitives: 1, record_version: k.version(), packs: k.packs(), declarations: k.declarations(), rows: k.census() } as Parameters<typeof plan>[1];
  const diff = await plan(packed.value, state);
  const put = await install(
    packed.value,
    diff,
    {
      count: (register) => k.count(register),
      stage: (batch) => k.stageInstall(batch as never),
      transaction: (fn) => k.transaction(fn),
      reload: () => k.reload(),
      retire: (ids) => k.retire(ids),
      seed: (register, fields) => k.create(register, { ...fields, tags: ['example'] }, { actor: 'p_seed', cascade: false }) as never,
      remember: (row) => k.rememberPack(row),
      forget: (id) => k.forgetPack(id),
      claimed: (pack) => k.packClaims(pack),
    },
    diff.planHash,
  );
  assert.ok(put.ok, sayOf(put));

  assert.ok(k.create('things', { name: 'Learn to bind books', lane: 'building', health: 'on_track', next: 'Buy the linen thread', progress: 10 }, { actor: 'p_1' }).ok);
  const overview = opened(k, 'portfolio');
  for (const b of overview.blocks) assert.deepEqual(b.refusals, [], `portfolio ${b.heading}`);
  assert.deepEqual(names(block(overview, 'In play').rows), ['Learn to bind books']);
});

/* ── the new look (portfolio 1.6.0) ─────────────────────────────────────────── */

test('THE OVERVIEW OPENS WITH ONE SENTENCE AND DRAWS HOW THE PROJECTS IN PLAY ARE GOING AS ONE TRACK, and each card says what its project is', async () => {
  const k = await seeded();
  const overview = opened(k, 'portfolio');

  /* EXACTLY ONE OPENING SENTENCE DRAWS, the one its figure says: two projects on the sample are at risk or off track.
     THE FIRST, SINCE portfolio 1.27.0, is the record with no project at all, and the second, since 1.13.0,
     the page with nothing in play; the sample is neither. */
  const leads = overview.blocks.filter((b) => b.kind === 'note' && (b as { lead?: boolean }).lead === true);
  /* SINCE portfolio 1.30.0 THE TWO LINES SAID FROM HEALTH ARE GONE, and the board leads (`key: board`). */
  assert.equal(leads.length, 2, 'the Overview declares its two opening sentences for a record with nothing in play');
  assert.deepEqual(leads.map((b) => b.drawn !== false), [false, false], 'a line is drawn over projects in play');
  assert.equal((block(overview, 'In play') as { key?: unknown }).key, 'board', 'the cards are not the board');

  /* EVERY PROJECT IN PLAY IS A PART OF HOW THEY ARE GOING, and Where they are, which said the line again, is gone
     (portfolio 1.11.0). */
  assert.ok(!overview.blocks.some((b) => b.heading === 'Where they are'), 'Where they are is declared again');
  const read = k.metric(PROJECT_METRICS['projects-by-health'] as never);
  assert.ok(read.ok, sayOf(read));
  const health = read.value.groups ?? [];
  assert.equal(health.reduce((n, g) => n + Number(g.value), 0), THINGS.filter(inPlay).length, 'a project in play is in no part');

  /* WHAT EACH ONE EARNS IS THE BOARD'S, SINCE portfolio 1.30.0. */
  assert.ok(!overview.blocks.some((b) => b.heading === 'What each one earns'), 'What each one earns is declared again');

  /* A CARD CARRIES THE PROJECT'S LINE, MARK AND HUE, read off the project's own row. */
  const cards = block(overview, 'In play');
  const kiln = cards.rows.find((r) => r.fields.name === 'Kiln')!;
  const sample = THINGS.find((t) => t.name === 'Kiln')!;
  assert.deepEqual([kiln.fields.about, kiln.fields.mark, kiln.fields.hue], [sample.about, sample.mark, sample.hue]);
  assert.ok(THINGS.every((t) => typeof t.about === 'string' && t.about !== ''), 'a sample project says nothing about what it is');
});

test('THE PAGE IS CALLED WHAT THE TOP BAR CALLS IT, its statuses start with a capital, and its first row is one whole tile', async () => {
  /* SINCE portfolio 1.9.0 the title is Projects and the statuses read Building and Earning. SINCE portfolio 1.10.0 Right
     now is gone into the line: a third of the row beside two splits a third its height ended the row at three heights. */
  const page = PAGES.portfolio!;
  assert.equal(page.title, (page.nav as { section?: string } | undefined)?.section);
  const lane = PORTFOLIO_REGISTERS.things!.fields.find((f) => f.id === 'lane') as unknown as { values: readonly string[]; labels?: Record<string, string> };
  assert.deepEqual(lane.values.map((v) => lane.labels?.[v]), ['Building', 'Earning', 'Parked', 'Closed']);
  const blocks = page.blocks as { kind: string; heading?: string; span?: number; when?: unknown; lead?: boolean }[];
  assert.ok(!blocks.some((b) => b.heading === 'Right now'), 'Right now is drawn beside the line that says its figure');
  /* SINCE portfolio 1.11.0 the row was one track of how they are going; SINCE portfolio 1.30.0 WHERE THEY ARE IS GONE (the board's date line
     counts the lanes), and SINCE 1.31.2 (fdc1b185b) SO IS THE TRACK: each card in play says its own health. */
  assert.deepEqual(blocks.filter((b) => ['Where they are', 'How they are going'].includes(String(b.heading))).map((b) => b.heading), [], 'a track is drawn over the cards');
  /* NO STRIP UNDER THE LINE SINCE BATCH 6: "In play 3, Earning 2" was a whole row for what the line says. */
  assert.ok(!blocks.some((b) => b.heading === 'In play and earning'), 'the strip is drawn again');
  /* THE ADD A PROJECT BOX COMES BEFORE THE BOARD, SINCE portfolio 1.27.0, drawn only while none is in play. */
  assert.equal(blocks.find((b) => !b.lead && b.kind !== 'capture')?.heading, 'In play', 'the board is not the first under the line');

  const k = await seeded();
  for (const name of ['Bindery', 'Lantern']) assert.ok(k.create('things', { name, lane: 'building', health: 'on_track' } as never, { actor: 'p_test' }).ok);
  const board = opened(k, 'portfolio').blocks;
  assert.ok(!board.some((b) => b.heading === 'How they are going'), 'a track is drawn over five projects');
  assert.equal(block({ blocks: board } as never, 'In play').rows.find((r) => r.fields.name === 'Lantern')?.fields.health, 'on_track', 'a card in play does not carry its health');
});

test('A PROJECT PAGE OPENS ON ONE LINE, its next step unless work waits to be checked, and says the step once', async () => {
  /* SINCE portfolio 1.9.0. Kiln has open work and none of it handed back, which drew no line at all before. */
  const k = await seeded();
  const page = opened(k, 'kiln');
  const leads = page.blocks.filter((b) => b.kind === 'note' && (b as { lead?: boolean }).lead === true && b.drawn !== false);
  assert.equal(leads.length, 1, 'not exactly one line');
  /* THE PROJECT'S SHAPE OPENS THE PAGE, SINCE founder 3.3.0 and team 2.25.0, and the line comes straight
     after it, as it was drawn under the shape when the shape was drawn by hand. */
  assert.deepEqual(page.blocks.slice(0, 2).map((b) => b.kind), ['project', 'project'], 'the page does not open on its shape');
  assert.equal(page.blocks.find((b) => b.drawn !== false && b.kind !== 'project'), leads[0], 'the line is not the first thing drawn after the shape');
  const kiln = THINGS.find((t) => t.name === 'Kiln')!;
  /* THE NEXT STEP ALONE, SINCE portfolio 1.12.0: the title already names the project. */
  assert.equal((leads[0] as { body?: string }).body, String(kiln.next));
  const stands = block(page, 'Where it stands') as { columns?: { field?: string }[] };
  assert.ok(!(stands.columns ?? []).some((c) => c.field === 'next'), 'Where it stands says the line again');

  /* AND A TASK HANDED BACK IS THE LINE INSTEAD, never both. */
  const kilnRow = k.get(`things#${THINGS.findIndex((t) => t.name === 'Kiln') + 1}`)!;
  const made = k.create('tasks', { what: 'Check the specimen proof', thing: kilnRow.id, state: 'review' } as never, { actor: 'p_test' });
  assert.ok(made.ok, sayOf(made));
  const back = opened(k, 'kiln').blocks.filter((b) => b.kind === 'note' && (b as { lead?: boolean }).lead === true && b.drawn !== false);
  assert.deepEqual(back.map((b) => (b as { body?: string }).body), ['Work on Kiln has been handed back, and it waits for you to check it.']);
});

test('A PROJECT PAGE KEEPS WHERE IT STANDS IN ONE COLUMN BESIDE ITS PLAN, and lists its open work once', async () => {
  /* SINCE portfolio 1.10.0: Where it stands was five twelfths beside a chart twice its height, Handed back seven beside
     What is open, and What is open listed the tasks the plan under it draws again. */
  const k = await seeded();
  const page = opened(k, 'kiln');
  const of = (heading: string) => block(page, heading) as ReturnType<typeof block> & { area?: string; span?: number };
  assert.deepEqual(['At a glance', 'Where it stands'].map((h) => of(h).area), ['rail', 'rail']);
  /* AND NO CHART BESIDE THEM SINCE founder 2.3.0 and team 2.18.0: the plan leads the main column, the whole of it. */
  assert.ok(!page.blocks.some((b) => b.heading === 'Done, by week'), 'the weeks are a tile of their own again');
  assert.deepEqual([of('The plan').area, of('The plan').span], [undefined, 12]);
  assert.ok(!page.blocks.some((b) => b.heading === 'What is open'), 'the open tasks are listed twice');
  /* WHAT IS HANDED BACK OR BLOCKED IS THE WORK TILE'S WITH YOU, SINCE founder 3.3.0 and team 2.25.0: its
     tile, drawn only where the shape was not, went for the shape's parts, which the page declares. */
  assert.ok(!page.blocks.some((b) => b.heading === 'Handed back or blocked'), 'what is handed back is said twice');
  const work = page.blocks.find((b) => b.kind === 'project' && ((b as unknown as { parts?: string[] }).parts ?? []).includes('what-is-open'));
  assert.ok(work && work.drawn !== false, 'the page declares no Work part');
});

test('A PROJECT PAGE SAYS WHAT WAS FINISHED THIS WEEK AT A GLANCE, ITS MONEY BY THE MONTH, AND WHAT IT RUNS ON UNDER MORE ABOUT IT', async () => {
  const k = await seeded();
  /* THE SAMPLE MOVED NO MONEY ON KILN THIS MONTH, so two movements are written today, one each way, and the month's
     figures are asked about money that is there rather than three noughts that agree with anything. */
  const kilnRow = k.get(`things#${THINGS.findIndex((t) => t.name === 'Kiln') + 1}`)!;
  const account = k.get('accounts#1')!;
  const moved = (direction: 'in' | 'out', minor: number) =>
    k.create('transactions', { what: `Kiln, ${direction}`, on: TODAY, direction, amount: { amount: minor, currency: 'GBP' }, account: account.id, thing: kilnRow.id, state: 'cleared' } as never, { actor: 'p_test' });
  assert.ok(moved('in', 50_000).ok && moved('out', 12_000).ok);
  const page = opened(k, 'kiln');
  const glance = Object.fromEntries((block(page, 'At a glance').readings ?? []).map((r) => [r.metric, r.reading?.value]));

  /* WHAT WAS FINISHED ON IT IS A FIGURE OF AT A GLANCE, SINCE founder 2.3.0 and team 2.18.0, and no chart of its own:
     Done, by week was a tile 280px tall for bars of 1 and 2 (the second design review's fix 5). The last of the four
     figures, counted over Kiln's own tasks finished in the last seven days, and no other project's. */
  assert.ok(!page.blocks.some((b) => b.heading === 'Done, by week' || (b.kind === 'series' && b.heading !== 'Money by month')), 'a project page charts its finished work by the week again');
  assert.deepEqual((block(page, 'At a glance').readings ?? []).map((r) => r.label), ['Open', 'Still to come in', 'Costs a year', 'Done this week']);
  const kiln = THINGS.findIndex((t) => t.name === 'Kiln') + 1;
  const done = k.list({ register: 'tasks', where: 'state is done, done_on after -8d', limit: 50 } as never);
  assert.ok(done.ok, sayOf(done));
  const finished = done.value.rows.filter((r) => r.fields.thing === kilnRow.id).length;
  assert.ok(finished > 0 && finished < done.value.rows.length, 'the sample finished nothing on Kiln this week, or nothing on any other project, so the figure agrees with anything');
  assert.equal(glance['project-done-7d:Kiln'], finished);
  assert.ok(TASKS.some((t) => t.thing === kiln && t.state === 'done'));
  /* IT ASKS FOR ITS FOUR WEEKS AS A LINE (`trend:`), and the record answers a line only for a figure it keeps a night's
     series of. It keeps none for a figure read a project at a time, so the cell is the figure alone and nothing is
     refused; the day the record keeps one, the line is drawn with no word changed here. */
  const cells = (PAGES.project!.blocks as { heading?: string; cells?: { metric: string; trend?: string }[] }[]).find((b) => b.heading === 'At a glance')!.cells!;
  assert.deepEqual(cells.at(-1), { metric: 'project-done-7d:{{name}}', label: 'Done this week', trend: '4w' });
  assert.deepEqual(block(page, 'At a glance').refusals, []);
  assert.ok(glance['project-open:Kiln'] !== undefined);
  /* AND THE WEEKS THEMSELVES ARE STILL DRAWN, on the project's card on Projects, from the figure the chart drew. */
  const cards = block(opened(k, 'portfolio'), 'In play');
  const line = cards.trends?.[cards.rows.findIndex((r) => r.fields.name === 'Kiln')];
  assert.ok(Array.isArray(line) && line.reduce((n: number, v) => n + (v ?? 0), 0) > 0, 'nothing finished on Kiln in the weeks its card draws');

  /* THIS MONTH IS THE NEWEST MONTH OF THE MONEY TILE'S BARS, SINCE portfolio 1.8.0, and not a tile beside it saying it
     again: in and out to the minor unit, over the same rows. THE MONEY PART DRAWS THEM SINCE founder 3.3.0 and team
     2.25.0, from the two figures Money by month drew, so they are read here as that chart read them. */
  assert.ok(!page.blocks.some((b) => b.heading === 'Money by month'), 'the months are drawn twice');
  const byMonth = k.block({
    kind: 'series',
    series: [
      { metric: 'project-in-by-month:Kiln', label: 'Money in' },
      { metric: 'project-out-by-month:Kiln', label: 'Money out', dir: 'out' },
    ],
    back: 12,
    net: true,
  } as never);
  assert.deepEqual(byMonth.refusals, []);
  assert.deepEqual(byMonth.bars?.values.map((line) => Math.abs(line.at(-1) ?? 0)), [50_000, 12_000]);
  assert.ok(!page.blocks.some((b) => b.heading === 'This month so far'), 'the month so far is said beside the chart that draws it');

  /* WHAT IT RUNS ON IS CARDS, what renews first first, and the dates are weeks above the plan. IN THE MAIN COLUMN SINCE
     work 1.15.0, a part of the one More about tile, where it was folded shut in the rail. */
  const alive = page.blocks.find((b) => b.heading === 'Services')!;
  assert.deepEqual([alive.kind, (alive as { area?: string }).area], ['cards', undefined]);
  const renews = alive.rows.map((r) => String(r.fields.renews ?? '')).filter((d) => d !== '');
  assert.deepEqual(renews, [...renews].sort());
  /* EACH DATE IS DRAWN ONCE, SINCE portfolio 1.8.0, on the plan: a calendar above it drew the same tasks again. */
  const headings = page.blocks.map((b) => b.heading);
  assert.ok(!headings.includes('Dates') && headings.includes('The plan'), 'the dated work is drawn twice');
  assert.equal((page.blocks.find((b) => b.heading === 'Waiting on you') as { tiles?: boolean }).tiles, true, 'the questions are not tiles');
});

test('A PROJECT PAGE ON A RECORD WITH NO MONEY HAS NO MONTH OF MONEY, rather than At a glance said a second time', async () => {
  const { projectTemplate } = await import('../src/modules/portfolio.ts');
  const team = projectTemplate(['things', 'tasks', 'people']);
  const headings = (team.blocks as { heading?: string }[]).map((b) => b.heading);
  assert.ok(!headings.includes('This month so far'), 'a row of money figures was made up from the tasks instead');
  assert.ok(!headings.includes('Money by month') && !headings.includes('Services'));
  assert.ok(!headings.includes('Done, by week') && headings.includes('The plan'), 'what a record without Money still has');
  /* AND AT A GLANCE IS MADE UP FROM ITS TASKS, what was finished this week last, with its line, as on a record with
     Money: Open, what falls due soon and what is handed back before it. */
  const glance = (team.blocks as { heading?: string; cells?: { metric: string; label: string; trend?: string }[] }[]).find((b) => b.heading === 'At a glance')!.cells!;
  assert.deepEqual(glance.map((c) => c.label), ['Open', 'Due soon', 'In review', 'Done this week']);
  assert.equal(glance.at(-1)!.trend, '4w');
  /* A RECORD WITH BILLS AND NO SERVICES LOSES ONE FIGURE, and what was finished is still the last of four. */
  const some = projectTemplate(['things', 'tasks', 'people', 'obligations', 'transactions']);
  assert.deepEqual(
    (some.blocks as { heading?: string; cells?: { label: string }[] }[]).find((b) => b.heading === 'At a glance')!.cells!.map((c) => c.label),
    ['Open', 'Still to come in', 'Due soon', 'Done this week'],
  );
  /* AND NO FOLDED HEADING OVER NOTHING: the Money section goes with the blocks it held. */
  assert.ok(!headings.includes('Money'), 'a record without Money draws a Money section with nothing under it');
  /* AND A FULL RECORD'S PAGE LEAVES A USE CASE THREE BLOCKS UNDER THE CEILING OF TWENTY-FOUR. */
  assert.ok((projectTemplate(['things', 'tasks', 'people', 'obligations', 'transactions', 'services']).blocks as unknown[]).length <= 21);
});

/**
 * EACH CARD IN PLAY DRAWS ITS WEEKS, since portfolio 1.7.0: the work finished on that project by the week, over Work's
 * `project-done-by-week`, one line a card. A record that will not hold Work's tasks has no such figure, so the column
 * is left out of the document it installs and the block is not refused for a line it could never draw.
 */
test('A PROJECT’S CARD DRAWS ITS FINISHED WORK BY THE WEEK, and a record without Work is given no such line', async () => {
  const k = await seeded();
  const cards = block(opened(k, 'portfolio'), 'In play') as ReturnType<typeof block> & { trends?: readonly (readonly (number | null)[] | null)[] };
  assert.equal(cards.trends?.length, cards.rows.length, 'one line a card, or none');
  assert.ok(cards.trends.some((t) => Array.isArray(t) && t.some((v) => (v ?? 0) > 0)), 'no project on the sample finished anything in these weeks');

  const columnsOf = (holds: string[]) =>
    (firstPartyDocument('portfolio', { holds })!.declarations as { page?: string; blocks?: { heading?: string; columns?: { metric?: string; as?: string }[] }[] }[])
      .find((d) => d.page === 'portfolio')!
      .blocks!.find((b) => b.heading === 'In play')!.columns ?? [];
  const trendOf = (holds: string[]) => columnsOf(holds).some((c) => c.metric !== undefined && c.as === 'trend');
  assert.equal(trendOf(['things', 'tasks']), true);
  assert.equal(trendOf(['things']), false, 'Projects alone is given a line over a figure it will not hold');
  /* THE WHEN IS THE RECORD'S OWN FIGURE SINCE portfolio 1.26.0 (Z7 of 25 October), its tasks and its runs together, so
     Projects alone keeps it: a record with no tasks still has runs. */
  assert.ok(columnsOf(['things']).some((c) => c.metric === 'project-worked:{{name}}' && c.as === 'when'));
});
