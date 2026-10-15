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

/** The table of parked and finished projects as the Overview drew it: the block straight under the heading it drew. */
const notInPlay = (p: PageResult) => {
  const at = p.blocks.findIndex((x) => x.heading === 'Parked and finished' && x.drawn !== false);
  assert.ok(at >= 0, 'the Overview draws no Parked and finished');
  const b = p.blocks[at + 1]!;
  assert.deepEqual([b.kind, b.drawn !== false, b.refusals], ['table', true, []]);
  return b;
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
  const line = overview.blocks.find((b) => (b as { lead?: boolean }).lead === true && b.drawn !== false) as { values?: Record<string, unknown> };
  /* NEWEST MADE FIRST, the order a list that declares none reads in (PGS-B06): the sample's projects in reverse. */
  const named = (ok: (t: (typeof THINGS)[number]) => boolean) => THINGS.filter((t) => inPlay(t) && ok(t)).map((t) => String(t.name)).reverse();
  const and = (list: string[]) => (list.length < 2 ? list[0] : `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`);
  assert.deepEqual(line.values, {
    'questions-open-in:things': 0,
    'projects-need-you.names': and(named((t) => t.health === 'at_risk' || t.health === 'off_track')),
    'projects-on-track.names': and(named((t) => t.health === 'on_track')),
  });
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
  assert.deepEqual((block(overview, 'How they are going') as { tones?: unknown }).tones, { on_track: 'good', at_risk: 'warn', off_track: 'bad' }, 'the record hands each part its intent to the page');
  assert.deepEqual(names(notInPlay(overview).rows), ['Tallow']);

  /* WHO SAID IT: the agent on a project, where it wrote where the project stands. */
  const held = block(overview, 'With an agent');
  assert.deepEqual(held.rows.map((r, i) => [r.fields.name, held.changes?.[i]?.by]), [['Kiln', 'agent'], ['Marlow & Co', 'agent']]);
});

test('AN AGENT TAKES A PROJECT, SAYS IT IS OFF TRACK, AND A PERSON PUTS IT RIGHT, and the page says who did each', async () => {
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
  assert.deepEqual([holds.changes?.[held]?.by, holds.changes?.[held]?.who], ['agent', 'agent:codex']);
  const card = () => block(opened(k, 'portfolio'), 'In play').rows.find((r) => r.fields.name === 'Marlow & Co');
  assert.equal(card()?.fields.health, 'off_track', 'what the agent said is not on its card');

  /* A PERSON READS IT AND SAYS IT IS ON TRACK: its card says so, and the page names them. */
  assert.ok(k.update('things', ref, { health: 'on_track' }, person).ok);
  overview = opened(k, 'portfolio');
  assert.equal(card()?.fields.health, 'on_track');
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
  assert.ok(names(block(opened(k, 'portfolio'), 'In play').rows).includes('Portage'), 'a proposal changed the project before anybody answered');

  const decided = k.decide(filed.value.id, { decide: { option: 'accept', reason: 'Nothing moves on it until the domain is chosen' } }, 'p_1');
  assert.ok(decided.ok, sayOf(decided));
  const overview = opened(k, 'portfolio');
  assert.ok(!names(block(overview, 'In play').rows).includes('Portage'));
  const parked = notInPlay(overview);
  assert.deepEqual(names(parked.rows), ['Portage', 'Tallow']);
  const at = parked.rows.findIndex((r) => r.fields.name === 'Portage');
  assert.deepEqual([parked.changes?.[at]?.by, parked.changes?.[at]?.who], ['you', 'p_1'], 'the change is the person’s who accepted it');
});

/**
 * A PAGE WITH NOTHING IN PLAY SAYS SO IN ITS LINE, SINCE portfolio 1.13.0, and Parked and finished counts what it folds
 * without reading it. "Every project in play is on track" was the line over a page with none, while In play said its own
 * empty line under it; and the section read every parked project whole, notes and all, for the one number it draws.
 */
test('WITH NOTHING IN PLAY THE LINE SAYS SO AND HOW TO START, and Parked and finished is a count', async () => {
  const k = await seeded();
  for (const [n, t] of THINGS.entries()) if (inPlay(t)) assert.ok(k.update('things', `things#${n + 1}`, { lane: 'parked' }, { actor: 'p_1' }).ok);
  const overview = opened(k, 'portfolio');
  const leads = overview.blocks.filter((b) => b.kind === 'note' && (b as { lead?: boolean }).lead === true) as { body?: string; drawn?: boolean }[];
  assert.equal(leads[0]!.drawn !== false, true, 'a page with nothing in play does not say so');
  assert.equal(leads[0]!.body, 'No project is in play. Add one, or set a parked one building.');
  /* THE ONE SAYING NOTHING NEEDS YOU IS SAID OF THE PROJECTS IN PLAY ALONE, so the writer leaves its one clause out over
     none. The record still draws it, so it comes after the line with no figure: the nightly line is written for the
     first line a page draws (`leadBlockOf` in `packages/record/src/headlines.ts`), and asked of "across 0 projects" the
     model's line would be drawn over this one saying the same. */
  assert.equal(leads[2]!.body, 'Nothing needs a push, {{questions-open-in:things}} question(s) for you', 'the quiet line is not the one that leaves In play to the strip');
  const first = leads.find((b) => b.drawn !== false);
  assert.doesNotMatch(String(first?.body), /\{\{/u, `the nightly line is asked of a line of noughts: ${first?.body}`);
  assert.equal(block(overview, 'In play').drawn, false, 'In play is drawn over nothing');

  /* FOUR OR FEWER ARE AN OPEN TILE, SINCE portfolio 1.15.0, the projects themselves and no count over them. */
  assert.equal(THINGS.length, 4, 'the sample is no longer four projects, so the open tile is not what this opens');
  assert.equal(notInPlay(overview).rows.length, THINGS.length);

  /* PAST FOUR THE HEADING FOLDS AND COUNTS, reading one project where it read every one whole. */
  assert.ok(k.create('things', { name: 'Fathom', lane: 'retired' } as never, { actor: 'p_1' }).ok);
  const longer = opened(k, 'portfolio');
  const parked = block(longer, 'Parked and finished');
  assert.equal((parked as { fold?: unknown }).fold, true, 'five parked projects are not folded');
  assert.equal(parked.matched, THINGS.length + 1, 'the count is not every project parked or finished');
  assert.ok(parked.rows.length <= 1, `the section read ${parked.rows.length} projects to say one number`);
  assert.equal(notInPlay(longer).rows.length, THINGS.length + 1, 'the projects themselves are the table under it');
});

/**
 * NO FOLDED HEADING OVER A SHORT LIST, SINCE portfolio 1.15.0 (the second design review's fix 6). The sample's Projects
 * ended on two headings 56px tall, each a name and a Show button, over 240px of empty page. With four projects or fewer
 * under it a heading is an open tile (`box`), and past four it folds as it did. One figure decides each, so a record
 * reads one heading of the pair and the tiles under it, never both and never neither.
 */
test('PROJECTS OPENS WHAT IT HOLDS WHILE IT IS SHORT, and folds it only past four projects', async () => {
  const k = await seeded();
  type Read = PageResult['blocks'][number] & { fold?: unknown; box?: unknown; span?: number };
  const pair = (p: PageResult, heading: string) => p.blocks.filter((b) => b.heading === heading) as Read[];
  const under = (p: PageResult, heading: string): Read[] => {
    const at = p.blocks.findIndex((b) => b.heading === heading && b.drawn !== false);
    const rest = p.blocks.slice(at + 1);
    const end = rest.findIndex((b) => b.kind === 'section');
    return (end < 0 ? rest : rest.slice(0, end)) as Read[];
  };

  /* THE SAMPLE: three projects in play and one parked, so both are open tiles and nothing on the page is folded. */
  const short = opened(k, 'portfolio');
  for (const b of short.blocks) assert.deepEqual(b.refusals, [], String(b.heading));
  for (const heading of ['Earnings, agents and dates', 'Parked and finished']) {
    const [open, folded] = pair(short, heading);
    assert.deepEqual([open!.drawn !== false, open!.box, open!.fold], [true, true, undefined], `${heading}: not an open tile`);
    assert.deepEqual([folded!.drawn, folded!.fold], [false, true], `${heading}: folded over a short list`);
  }
  assert.ok(!short.blocks.some((b) => b.drawn !== false && (b as Read).fold === true), 'a short Projects still ends on a folded heading');
  /* THE FOLDED TILES KEEP THE KEYS THEY HAD BEFORE 1.15.0, which a look a person saved names them by: the open ones
     declare their own, so no folded tile is the second of two alike and takes `-2`. */
  const keyOf = (b: unknown) => String((b as { key?: unknown }).key);
  const twice = short.blocks.filter((b) => ['Earnings, agents and dates', 'What each one earns', 'With an agent', 'Coming up'].includes(String(b.heading)));
  assert.deepEqual(twice.filter((b) => keyOf(b).startsWith('open-')).map(keyOf), ['open-earnings', 'open-earns', 'open-with-agent', 'open-coming-up']);
  assert.deepEqual(twice.filter((b) => /-\d+$/u.test(keyOf(b))).map(keyOf), [], 'a folded tile lost its key to the open one');
  const looked = under(short, 'Earnings, agents and dates');
  assert.deepEqual(looked.map((b) => [b.heading, b.drawn !== false, b.span]), [
    ['What each one earns', true, 12],
    /* SINCE portfolio 1.16.0, the line under it: how many of those in play say what they earned. */
    [undefined, true, 12],
    ['With an agent', true, 6],
    ['Coming up', true, 6],
  ]);
  assert.deepEqual(names(looked[0]!.rows).sort(), THINGS.filter((t) => inPlay(t) && t.revenue !== undefined && t.revenue !== null).map((t) => String(t.name)).sort());
  /* HALF A ROW HOLDS THREE COLUMNS: the project, who holds it and who changed it last. Its next step is on its card. */
  assert.deepEqual(looked[2]!.columns?.map((c) => c.field), ['name', 'agent', 'changed']);
  /* THE PARKED ARE THE TABLE ITSELF, under the tile's heading and none of its own. */
  assert.deepEqual(under(short, 'Parked and finished').map((b) => [b.kind, b.heading, names(b.rows)]), [['table', undefined, ['Tallow']]]);
  /* AND WHAT THE FOLDED HEADINGS HELD IS NOT READ AT ALL: a tile nobody sees costs no query. */
  const hidden = short.blocks.filter((b) => b.drawn === false && ['What each one earns', 'With an agent', 'Coming up', 'Not in play'].includes(String(b.heading)));
  assert.deepEqual(hidden.map((b) => [b.heading, b.rows.length]), [['What each one earns', 0], ['With an agent', 0], ['Coming up', 0], ['Not in play', 0]]);

  /* PAST FOUR, EACH FOLDS AS IT DID: two more in play that say what they earn, and four more parked. */
  for (const name of ['Fathom', 'Quire']) assert.ok(k.create('things', { name, lane: 'building', aim: TODAY } as never, { actor: 'p_1' }).ok);
  for (const name of ['Ember', 'Latch', 'Marrow', 'Nettle']) assert.ok(k.create('things', { name, lane: 'parked' } as never, { actor: 'p_1' }).ok);
  const long = opened(k, 'portfolio');
  for (const b of long.blocks) assert.deepEqual(b.refusals, [], String(b.heading));
  for (const heading of ['Earnings, agents and dates', 'Parked and finished']) {
    const [open, folded] = pair(long, heading);
    assert.equal(open!.drawn, false, `${heading}: an open tile over a long list`);
    assert.deepEqual([folded!.drawn !== false, folded!.fold], [true, true], `${heading}: not folded past four`);
  }
  assert.deepEqual(under(long, 'Earnings, agents and dates').map((b) => [b.heading, b.drawn !== false, b.span]), [
    ['What each one earns', true, 12],
    [undefined, true, 12],
    ['With an agent', true, 12],
    ['Coming up', true, 12],
  ]);
  assert.deepEqual(under(long, 'Parked and finished').map((b) => [b.heading, b.rows.length]), [['Not in play', 5]]);
  assert.equal(block(long, 'Parked and finished').matched, 5);

  /* WITH NOTHING UNDER EITHER, neither heading is drawn, open or folded. From portfolio 1.16.0 the open tile of
     earnings, agents and dates still was, holding one line that none of the projects in play says what it earned.
     SINCE 1.17.0 that line is drawn only while one says, so with none saying the tile has nothing under it. */
  const bare = await seeded();
  for (const n of THINGS.keys()) assert.ok(bare.update('things', `things#${n + 1}`, { lane: 'building', revenue: null, agent: null, aim: null } as never, { actor: 'p_1' }).ok);
  const ends = opened(bare, 'portfolio');
  assert.equal(block(ends, 'In play').rows.length, THINGS.length);
  assert.deepEqual(pair(ends, 'Parked and finished').map((b) => b.drawn), [false, false], 'Parked and finished: a heading over nothing');
  assert.deepEqual(pair(ends, 'Earnings, agents and dates').map((b) => b.drawn !== false), [false, false]);
  /* AND THE LINE IT HELD IS NOT DRAWN EITHER. Read off the page, since `under` starts from a heading that is drawn. */
  const said = (ends.blocks as (Read & { body?: string })[]).filter((b) => typeof b.body === 'string' && b.body.includes('say what they earned'));
  assert.ok(said.length > 0, 'the page no longer declares the line');
  assert.deepEqual(said.map((b) => b.drawn !== false), said.map(() => false));
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
     THE FIRST, SINCE portfolio 1.13.0, is the page with nothing in play, which the sample is not. */
  const leads = overview.blocks.filter((b) => b.kind === 'note' && (b as { lead?: boolean }).lead === true);
  assert.equal(leads.length, 3, 'the Overview declares its three opening sentences');
  assert.deepEqual(leads.map((b) => b.drawn !== false), [false, true, false], 'one sentence and not two, or none');
  assert.match(String((leads[1] as { body?: string }).body), /^\{\{questions-open-in:things\}\} question\(s\) for you, \{\{projects-need-you\.names\}\} need\(s\) a push, \{\{projects-on-track\.names\}\} is on track$/u);

  /* EVERY PROJECT IN PLAY IS A PART OF HOW THEY ARE GOING, and Where they are, which said the line again, is gone
     (portfolio 1.11.0). */
  assert.equal(block(overview, 'Where they are').drawn, false, 'Where they are is drawn over three projects in play');
  const read = k.metric(PROJECT_METRICS['projects-by-health'] as never);
  assert.ok(read.ok, sayOf(read));
  const health = read.value.groups ?? [];
  assert.equal(health.reduce((n, g) => n + Number(g.value), 0), THINGS.filter(inPlay).length, 'a project in play is in no part');

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

test('THE PAGE IS CALLED WHAT THE TOP BAR CALLS IT, its statuses start with a capital, and its first row is one whole tile', async () => {
  /* SINCE portfolio 1.9.0 the title is Projects and the statuses read Building and Earning. SINCE portfolio 1.10.0 Right
     now is gone into the line: a third of the row beside two splits a third its height ended the row at three heights. */
  const page = PAGES.portfolio!;
  assert.equal(page.title, (page.nav as { section?: string } | undefined)?.section);
  const lane = PORTFOLIO_REGISTERS.things!.fields.find((f) => f.id === 'lane') as unknown as { values: readonly string[]; labels?: Record<string, string> };
  assert.deepEqual(lane.values.map((v) => lane.labels?.[v]), ['Building', 'Earning', 'Parked', 'Finished']);
  const blocks = page.blocks as { kind: string; heading?: string; span?: number; when?: unknown; lead?: boolean }[];
  assert.ok(!blocks.some((b) => b.heading === 'Right now'), 'Right now is drawn beside the line that says its figure');
  /* SINCE portfolio 1.11.0 the row is one track of how they are going, the whole width: Where they are said the line
     again beside it. */
  const row = blocks.filter((b) => ['Where they are', 'How they are going'].includes(String(b.heading)));
  assert.deepEqual(row.map((b) => [b.heading, b.span]), [['Where they are', 12], ['How they are going', 12]], 'a split is not one whole tile');
  /* ONLY PAST FOUR IN PLAY, SINCE portfolio 1.12.0: three projects drew three equal thirds, which the line and the cards
     already say. */
  assert.equal(JSON.stringify(row[0]!.when), JSON.stringify({ metric: 'projects-live', gt: 4 }), 'the lanes draw over a few projects');
  assert.equal(JSON.stringify(row[1]!.when), JSON.stringify({ all: [{ metric: 'projects-live', gt: 4 }, { metric: 'projects-with-health', gt: 0 }] }), 'the track draws over a few projects, or over none that says');
  assert.equal(blocks.find((b) => !b.lead)?.heading, 'In play and earning', 'the strip is not the first under the line');

  const k = await seeded();
  const going = () => opened(k, 'portfolio').blocks.find((b) => b.heading === 'How they are going')!;
  assert.equal(going().drawn, false, 'the track is drawn over three projects');
  for (const name of ['Bindery', 'Lantern']) assert.ok(k.create('things', { name, lane: 'building', health: 'on_track' } as never, { actor: 'p_test' }).ok);
  assert.notEqual(going().drawn, false, 'the track is not drawn over five projects');
});

test('A PROJECT PAGE OPENS ON ONE LINE, its next step unless work waits to be checked, and says the step once', async () => {
  /* SINCE portfolio 1.9.0. Kiln has open work and none of it handed back, which drew no line at all before. */
  const k = await seeded();
  const page = opened(k, 'kiln');
  const leads = page.blocks.filter((b) => b.kind === 'note' && (b as { lead?: boolean }).lead === true && b.drawn !== false);
  assert.equal(leads.length, 1, 'not exactly one line');
  assert.equal(page.blocks.find((b) => b.drawn !== false), leads[0], 'the line is not the first thing drawn');
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

test('A PROJECT PAGE KEEPS WHERE IT STANDS AND WHAT IS HANDED BACK IN ONE COLUMN BESIDE ITS PLAN, and lists its open work once', async () => {
  /* SINCE portfolio 1.10.0: Where it stands was five twelfths beside a chart twice its height, Handed back seven beside
     What is open, and What is open listed the tasks the plan under it draws again. */
  const k = await seeded();
  const page = opened(k, 'kiln');
  const of = (heading: string) => block(page, heading) as ReturnType<typeof block> & { area?: string; span?: number };
  assert.deepEqual(['At a glance', 'Where it stands', 'Handed back or blocked'].map((h) => of(h).area), ['rail', 'rail', 'rail']);
  /* AND NO CHART BESIDE THEM SINCE founder 2.3.0 and team 2.18.0: the plan leads the main column, the whole of it. */
  assert.ok(!page.blocks.some((b) => b.heading === 'Done, by week'), 'the weeks are a tile of their own again');
  assert.deepEqual([of('The plan').area, of('The plan').span], [undefined, 12]);
  assert.ok(!page.blocks.some((b) => b.heading === 'What is open'), 'the open tasks are listed twice');
  /* KILN HAS A BLOCKED TASK, so what is handed back is drawn; a project with none draws no tile saying so. */
  assert.notEqual(of('Handed back or blocked').drawn, false);
  for (const slug of ['kiln', 'marlow-co', 'portage']) {
    const held = block(opened(k, slug), 'Handed back or blocked');
    assert.equal(held.drawn !== false, held.rows.length > 0, `${slug}: drawn over nothing, or hidden over a task`);
  }
  const portage = THINGS.findIndex((t) => t.name === 'Portage') + 1;
  const open = k.list({ register: 'tasks', where: `thing is things#${portage}, state is review or blocked` } as never);
  assert.ok(open.ok, sayOf(open));
  for (const t of open.value.rows) assert.ok(k.update('tasks', t.id, { state: 'open' } as never, { actor: 'p_1', version: t.version } as never).ok);
  assert.equal(block(opened(k, 'portage'), 'Handed back or blocked').drawn, false, 'a tile saying nothing is handed back');
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

  /* THIS MONTH IS THE CHART'S NEWEST MONTH, SINCE portfolio 1.8.0, and not a tile beside it saying it again: in and out
     to the minor unit, over the same rows. */
  const byMonth = block(page, 'Money by month');
  assert.deepEqual(byMonth.bars?.values.map((line) => Math.abs(line.at(-1) ?? 0)), [50_000, 12_000]);
  assert.ok(!page.blocks.some((b) => b.heading === 'This month so far'), 'the month so far is said beside the chart that draws it');

  /* WHAT IT RUNS ON IS CARDS, what renews first first, and the dates are weeks above the plan. IN THE MAIN COLUMN SINCE
     work 1.15.0, a part of the one More about tile, where it was folded shut in the rail. */
  const alive = page.blocks.find((b) => b.heading === 'Keeping it alive')!;
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
  assert.ok(!headings.includes('Money by month') && !headings.includes('Keeping it alive'));
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

  const trendOf = (holds: string[]) =>
    ((firstPartyDocument('portfolio', { holds })!.declarations as { page?: string; blocks?: { heading?: string; columns?: { metric?: string }[] }[] }[])
      .find((d) => d.page === 'portfolio')!
      .blocks!.find((b) => b.heading === 'In play')!.columns ?? []).some((c) => c.metric !== undefined);
  assert.equal(trendOf(['things', 'tasks']), true);
  assert.equal(trendOf(['things']), false, 'Projects alone is given a line over a figure it will not hold');
});
