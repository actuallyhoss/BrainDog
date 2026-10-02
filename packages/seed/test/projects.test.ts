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

import { NOW, PAGES, THINGS, firstPartyDocument, firstPartyManifest, installSeed } from '../src/index.ts';
import { PORTFOLIO_REGISTERS } from '../src/modules/portfolio.ts';

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

const block = (p: PageResult, heading: string) => {
  const b = p.blocks.find((x) => x.heading === heading);
  assert.ok(b, `${p.slug ?? 'the page'} has no ${heading}`);
  assert.deepEqual(b.refusals, [], `${heading}: ${JSON.stringify(b.refusals)}`);
  return b;
};

const names = (rows: readonly { fields: Record<string, unknown> }[]) => rows.map((r) => String(r.fields.name));
const TODAY = new Date(NOW).toISOString().slice(0, 10);
const inPlay = (t: (typeof THINGS)[number]) => t.lane === 'building' || t.lane === 'earning';

test('THE OVERVIEW AND EVERY PROJECT PAGE OPEN ON THE SAMPLE WITH NO BLOCK REFUSED, and the figures count the sample’s projects', async () => {
  const k = await seeded();
  for (const slug of ['portfolio', 'kiln', 'marlow-co', 'portage']) for (const b of opened(k, slug).blocks) assert.deepEqual(b.refusals, [], `${slug} ${b.heading}`);

  const overview = opened(k, 'portfolio');
  const figures = Object.fromEntries((block(overview, 'Right now').readings ?? []).map((r) => [r.metric, r.reading?.value]));
  assert.deepEqual(figures, {
    'projects-live': THINGS.filter(inPlay).length,
    'projects-aim-30d': THINGS.filter((t) => inPlay(t) && typeof t.aim === 'string' && t.aim >= TODAY && t.aim <= new Date(NOW + 30 * 86_400_000).toISOString().slice(0, 10)).length,
  });
  /* NEED YOU IS THE LINE'S, SINCE portfolio 1.8.0, said once, and the table under it names them. */
  assert.equal(
    block(overview, 'Needs you').rows.length,
    THINGS.filter((t) => inPlay(t) && (t.health === 'at_risk' || t.health === 'off_track')).length,
  );
  assert.deepEqual(names(block(overview, 'Needs you').rows).sort(), ['Kiln', 'Portage']);
  const parts = block(overview, 'How they are going').readings?.[0]?.reading?.groups ?? [];
  assert.equal(parts.reduce((n, g) => n + Number(g.value), 0), THINGS.filter(inPlay).length, 'every project in play is a part');
  assert.deepEqual((block(overview, 'How they are going') as { tones?: unknown }).tones, { on_track: 'good', at_risk: 'warn', off_track: 'bad' }, 'the record hands each part its intent to the page');
  assert.deepEqual(names(block(overview, 'Not in play').rows), ['Tallow']);

  /* WHO SAID IT: the agent on a project, where it wrote where the project stands, and a person everywhere else. */
  const queue = block(overview, 'Needs you');
  const said = Object.fromEntries(queue.rows.map((r, i) => [String(r.fields.name), queue.changes?.[i]?.who]));
  assert.deepEqual(said, { Kiln: 'agent:claude', Portage: 'p_seed' });
  const held = block(overview, 'With an agent');
  assert.deepEqual(held.rows.map((r, i) => [r.fields.name, held.changes?.[i]?.by]), [['Kiln', 'agent'], ['Marlow & Co', 'agent']]);
});

test('AN AGENT TAKES A PROJECT, SAYS IT IS OFF TRACK, AND A PERSON PUTS IT RIGHT, and the queue says who did each', async () => {
  const k = await seeded();
  const agent = { actor: 'agent:codex' };
  const person = { actor: 'p_1' };
  const seq = THINGS.findIndex((t) => t.name === 'Marlow & Co') + 1;
  const ref = `things#${seq}`;

  /* TAKE, AND SAY WHERE IT STANDS. */
  assert.ok(k.update('things', ref, { agent: 'codex', health: 'off_track', next: 'Halden says nothing is due yet. Ask when their terms end.', progress: 80 }, agent).ok);
  let overview = opened(k, 'portfolio');
  const holds = block(overview, 'With an agent');
  const held = holds.rows.findIndex((r) => r.fields.name === 'Marlow & Co');
  assert.ok(held >= 0, 'the project is not under With an agent');
  assert.equal(holds.rows[held]!.fields.agent, 'codex');
  const queue = block(overview, 'Needs you');
  const at = queue.rows.findIndex((r) => r.fields.name === 'Marlow & Co');
  assert.ok(at >= 0, 'what the agent said is not in the queue');
  assert.deepEqual([queue.changes?.[at]?.by, queue.changes?.[at]?.who], ['agent', 'agent:codex']);

  /* A PERSON READS IT AND SAYS IT IS ON TRACK: it leaves the queue, and the page names them. */
  assert.ok(k.update('things', ref, { health: 'on_track' }, person).ok);
  overview = opened(k, 'portfolio');
  assert.ok(!names(block(overview, 'Needs you').rows).includes('Marlow & Co'));
  const after = block(overview, 'With an agent');
  const now = after.rows.findIndex((r) => r.fields.name === 'Marlow & Co');
  assert.deepEqual([after.changes?.[now]?.by, after.changes?.[now]?.who], ['you', 'p_1']);

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
  assert.ok(names(block(opened(k, 'portfolio'), 'Needs you').rows).includes('Portage'), 'a proposal changed the project before anybody answered');

  const decided = k.decide(filed.value.id, { decide: { option: 'accept', reason: 'Nothing moves on it until the domain is chosen' } }, 'p_1');
  assert.ok(decided.ok, sayOf(decided));
  const overview = opened(k, 'portfolio');
  assert.ok(!names(block(overview, 'In play').rows).includes('Portage'));
  assert.ok(!names(block(overview, 'Needs you').rows).includes('Portage'), 'a parked project is not in the queue');
  assert.equal(block(overview, 'Parked and finished').matched, 2);
  const parked = block(overview, 'Not in play');
  const at = parked.rows.findIndex((r) => r.fields.name === 'Portage');
  assert.deepEqual([parked.changes?.[at]?.by, parked.changes?.[at]?.who], ['you', 'p_1'], 'the change is the person’s who accepted it');
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
  const figures = Object.fromEntries((block(opened(k, 'portfolio'), 'Right now').readings ?? []).map((r) => [r.metric, r.reading?.value]));
  assert.equal(figures['projects-aim-30d'], 1, 'a missed day is no longer ahead');
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
  assert.deepEqual(block(overview, 'Needs you').rows, []);
});

/* ── the new look (portfolio 1.6.0) ─────────────────────────────────────────── */

test('THE OVERVIEW OPENS WITH ONE SENTENCE AND DRAWS WHERE EVERY PROJECT IS AS ONE TRACK, and each card says what its project is', async () => {
  const k = await seeded();
  const overview = opened(k, 'portfolio');

  /* EXACTLY ONE OPENING SENTENCE DRAWS, the one its figure says: two projects on the sample are at risk or off track. */
  const leads = overview.blocks.filter((b) => b.kind === 'note' && (b as { lead?: boolean }).lead === true);
  assert.equal(leads.length, 2, 'the Overview declares its two opening sentences');
  assert.deepEqual(leads.map((b) => b.drawn !== false), [true, false], 'one sentence and not both, or neither');
  assert.match(String((leads[0] as { body?: string }).body), /^\{\{projects-need-you\}\} project\(s\) in play are at risk or off track\.$/u);

  /* EVERY PROJECT IS A PART OF WHERE THEY ARE, parked and finished among them. */
  const lanes = block(overview, 'Where they are').readings?.[0]?.reading?.groups ?? [];
  assert.equal(lanes.reduce((n, g) => n + Number(g.value), 0), THINGS.length, 'a project is in no part');
  assert.deepEqual(Object.fromEntries(lanes.map((g) => [g.key, g.value])), Object.fromEntries([...new Set(THINGS.map((t) => String(t.lane)))].map((lane) => [lane, THINGS.filter((t) => t.lane === lane).length])));

  /* WHAT EACH ONE EARNS IS ONE TRACK, over the rows the Earning tile adds up. */
  const earns = overview.blocks.find((b) => b.heading === 'What each one earns')!;
  assert.equal(earns.kind, 'split');
  assert.deepEqual(earns.refusals, []);

  /* A CARD CARRIES THE PROJECT'S LINE, MARK AND HUE, read off the project's own row. */
  const cards = block(overview, 'In play');
  const kiln = cards.rows.find((r) => r.fields.name === 'Kiln')!;
  const sample = THINGS.find((t) => t.name === 'Kiln')!;
  assert.deepEqual([kiln.fields.about, kiln.fields.mark, kiln.fields.hue], [sample.about, sample.mark, sample.hue]);
  assert.ok(THINGS.every((t) => typeof t.about === 'string' && t.about !== ''), 'a sample project says nothing about what it is');
});

test('THE PAGE IS CALLED WHAT THE TOP BAR CALLS IT, its statuses start with a capital, and Right now is a third of a row', async () => {
  /* SINCE portfolio 1.9.0: the title read Overview under a top bar saying Projects, Where they are printed "earning" and
     "building" as they are stored, and Right now held two numbers across the whole width. */
  const page = PAGES.portfolio!;
  assert.equal(page.title, (page.nav as { section?: string } | undefined)?.section);
  const lane = PORTFOLIO_REGISTERS.things!.fields.find((f) => f.id === 'lane') as unknown as { values: readonly string[]; labels?: Record<string, string> };
  assert.deepEqual(lane.values.map((v) => lane.labels?.[v]), ['Building', 'Earning', 'Parked', 'Finished']);
  const row = (page.blocks as { heading?: string; span?: number; when?: unknown }[]).filter((b) => ['Right now', 'Where they are', 'How they are going'].includes(String(b.heading)));
  assert.deepEqual(row.map((b) => b.span), [4, 4, 4], 'the three do not make one row');
  assert.ok(row.every((b) => JSON.stringify(b.when) === JSON.stringify({ metric: 'projects-live', gt: 0 })), 'part of the row draws when the rest does not');

  const k = await seeded();
  assert.equal(block(opened(k, 'portfolio'), 'Right now').drawn !== false, true);
});

test('A PROJECT PAGE OPENS ON ONE LINE, its next step unless work waits to be checked, and says the step once', async () => {
  /* SINCE portfolio 1.9.0. Kiln has open work and none of it handed back, which drew no line at all before. */
  const k = await seeded();
  const page = opened(k, 'kiln');
  const leads = page.blocks.filter((b) => b.kind === 'note' && (b as { lead?: boolean }).lead === true && b.drawn !== false);
  assert.equal(leads.length, 1, 'not exactly one line');
  assert.equal(page.blocks.find((b) => b.drawn !== false), leads[0], 'the line is not the first thing drawn');
  const kiln = THINGS.find((t) => t.name === 'Kiln')!;
  assert.equal((leads[0] as { body?: string }).body, `Next on Kiln: ${String(kiln.next)}`);
  const stands = block(page, 'Where it stands') as { columns?: { field?: string }[] };
  assert.ok(!(stands.columns ?? []).some((c) => c.field === 'next'), 'Where it stands says the line again');

  /* AND A TASK HANDED BACK IS THE LINE INSTEAD, never both. */
  const kilnRow = k.get(`things#${THINGS.findIndex((t) => t.name === 'Kiln') + 1}`)!;
  const made = k.create('tasks', { what: 'Check the specimen proof', thing: kilnRow.id, state: 'review' } as never, { actor: 'p_test' });
  assert.ok(made.ok, sayOf(made));
  const back = opened(k, 'kiln').blocks.filter((b) => b.kind === 'note' && (b as { lead?: boolean }).lead === true && b.drawn !== false);
  assert.deepEqual(back.map((b) => (b as { body?: string }).body), ['Work on Kiln has been handed back, and it waits for you to check it.']);
});

test('A PROJECT PAGE DRAWS ITS FINISHED WORK BY THE WEEK, SAYS ITS MONEY BY THE MONTH, AND KEEPS WHAT IT RUNS ON IN THE RAIL', async () => {
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

  /* ITS WEEKS ARE ITS OWN, since work 1.10.0: what was finished on Kiln each week, as counts and not money. */
  const weeks = block(page, 'Done, by week');
  assert.equal(weeks.kind, 'series');
  assert.equal(weeks.bars?.bucket, 'week');
  assert.equal(weeks.bars?.unit, null, 'counts, not money');
  assert.ok((weeks.bars?.values[0] ?? []).reduce((n: number, v) => n + (v ?? 0), 0) > 0, 'nothing finished on Kiln in the weeks drawn');
  assert.ok(glance['project-open:Kiln'] !== undefined);

  /* THIS MONTH IS THE CHART'S NEWEST MONTH, SINCE portfolio 1.8.0, and not a tile beside it saying it again: in and out
     to the minor unit, over the same rows. */
  const byMonth = block(page, 'Money by month');
  assert.deepEqual(byMonth.bars?.values.map((line) => Math.abs(line.at(-1) ?? 0)), [50_000, 12_000]);
  assert.ok(!page.blocks.some((b) => b.heading === 'This month so far'), 'the month so far is said beside the chart that draws it');

  /* WHAT IT RUNS ON IS CARDS IN THE RAIL, what renews first first, and the dates are weeks above the plan. */
  const alive = page.blocks.find((b) => b.heading === 'Keeping it alive')!;
  assert.deepEqual([alive.kind, (alive as { area?: string }).area], ['cards', 'rail']);
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
  assert.ok(!headings.includes('Money by month') && !headings.includes('Keeping it alive'));
  assert.ok(headings.includes('Done, by week') && headings.includes('The plan'), 'what a record without Money still has');
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

  const trendOf = (holds: string[]) =>
    ((firstPartyDocument('portfolio', { holds })!.declarations as { page?: string; blocks?: { heading?: string; columns?: { metric?: string }[] }[] }[])
      .find((d) => d.page === 'portfolio')!
      .blocks!.find((b) => b.heading === 'In play')!.columns ?? []).some((c) => c.metric !== undefined);
  assert.equal(trendOf(['things', 'tasks']), true);
  assert.equal(trendOf(['things']), false, 'Projects alone is given a line over a figure it will not hold');
});
