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

import { NOW, THINGS, firstPartyDocument, firstPartyManifest, installSeed } from '../src/index.ts';

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
    'projects-need-you': THINGS.filter((t) => inPlay(t) && (t.health === 'at_risk' || t.health === 'off_track')).length,
    'projects-aim-30d': THINGS.filter((t) => inPlay(t) && typeof t.aim === 'string' && t.aim >= TODAY && t.aim <= new Date(NOW + 30 * 86_400_000).toISOString().slice(0, 10)).length,
    'projects-parked': THINGS.filter((t) => t.lane === 'parked').length,
  });
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

test('A PROJECT PAGE TALLIES ITS OPEN WORK BY PRIORITY, SAYS THIS MONTH’S MONEY, AND KEEPS WHAT IT RUNS ON IN THE RAIL', async () => {
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

  /* THE TALLY ADDS UP TO OPEN, because it counts Open's own rows by priority and a task with none is counted too. */
  const tally = block(page, 'Open, by priority');
  assert.equal(tally.kind, 'chips');
  assert.equal(tally.matched, glance['project-open:Kiln'], 'the tally is over other rows than Open');

  /* KEPT IS IN LESS OUT, TO THE MINOR UNIT, because it is one figure over the same rows, signed by direction. */
  const month = Object.fromEntries((block(page, 'This month so far').readings ?? []).map((r) => [r.metric.split(':')[0], r.reading?.value ?? 0]));
  assert.deepEqual(month, { 'project-in-month': 50_000, 'project-out-month': 12_000, 'project-kept-month': 38_000 });

  /* WHAT IT RUNS ON IS CARDS IN THE RAIL, what renews first first, and the dates are weeks above the plan. */
  const alive = page.blocks.find((b) => b.heading === 'Keeping it alive')!;
  assert.deepEqual([alive.kind, (alive as { area?: string }).area], ['cards', 'rail']);
  const renews = alive.rows.map((r) => String(r.fields.renews ?? '')).filter((d) => d !== '');
  assert.deepEqual(renews, [...renews].sort());
  const headings = page.blocks.map((b) => b.heading);
  assert.ok(headings.indexOf('Dates') >= 0 && headings.indexOf('Dates') < headings.indexOf('The plan'), 'the weeks come before the plan');
  assert.equal((page.blocks.find((b) => b.heading === 'Waiting on you') as { tiles?: boolean }).tiles, true, 'the questions are not tiles');
});

test('A PROJECT PAGE ON A RECORD WITH NO MONEY HAS NO MONTH OF MONEY, rather than At a glance said a second time', async () => {
  const { projectTemplate } = await import('../src/modules/portfolio.ts');
  const team = projectTemplate(['things', 'tasks', 'people']);
  const headings = (team.blocks as { heading?: string }[]).map((b) => b.heading);
  assert.ok(!headings.includes('This month so far'), 'a row of money figures was made up from the tasks instead');
  assert.ok(!headings.includes('Money by month') && !headings.includes('Keeping it alive'));
  assert.ok(headings.includes('Open, by priority') && headings.includes('Dates'), 'what a record without Money still has');
  /* AND A FULL RECORD'S PAGE LEAVES A USE CASE THREE BLOCKS UNDER THE CEILING OF TWENTY-FOUR. */
  assert.ok((projectTemplate(['things', 'tasks', 'people', 'obligations', 'transactions', 'services']).blocks as unknown[]).length <= 21);
});
