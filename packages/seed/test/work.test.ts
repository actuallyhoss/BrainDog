/**
 * Work as a pack, on a real record: the figures its Overview leads with, the queue that waits on a person, and an
 * agent taking, splitting, handing back and finishing a task through the same write path an agent's tools use, with
 * the page saying who did each thing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { fill, openRecord, type Kernel, type PageResult } from '@braindog/kernel';
import type { Param, Row, Sql } from '@braindog/ports';
import { sayOf } from '@braindog/ports';

import { METRICS, NOW, PAGES, TASKS, firstPartyDocument, firstPartyManifest, installSeed } from '../src/index.ts';

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

const TODAY = new Date(NOW).toISOString().slice(0, 10);
const live = (t: (typeof TASKS)[number]) => t.state !== 'done' && t.state !== 'dropped';
/** What Open counts: work in play that is not kept for later. */
const open = (t: (typeof TASKS)[number]) => live(t) && t.state !== 'backlog';

test('WORK’S OVERVIEW AND BOARD OPEN ON THE SAMPLE WITH NO BLOCK REFUSED, and the figures count the sample’s rows', async () => {
  const k = await seeded();
  for (const slug of ['work', 'work-board']) for (const b of opened(k, slug).blocks) assert.deepEqual(b.refusals, [], `${slug} ${b.heading}`);

  const figures = Object.fromEntries((block(opened(k, 'work'), 'How fast it moves').readings ?? []).map((r) => [r.metric, r.reading?.value]));
  /* ONE FIGURE SINCE work 1.11.0, how much was finished, folded under Done lately: how much is open is the line's. */
  assert.deepEqual(figures, {
    'tasks-done-7d': TASKS.filter((t) => t.state === 'done' && String(t.done_on) > new Date(NOW - 8 * 86_400_000).toISOString().slice(0, 10)).length,
  });
  /* AND THE FIGURES THE BANDS ARE DRAWN ON, which the line says too. */
  const read = (id: string) => {
    const out = k.metric(METRICS[id] as never);
    assert.ok(out.ok, sayOf(out));
    return out.value.value;
  };
  assert.equal(read('open-tasks'), TASKS.filter(open).length);
  assert.equal(read('tasks-waiting'), TASKS.filter((t) => t.state === 'review' || t.state === 'blocked').length);
  assert.equal(read('tasks-due-7d'), TASKS.filter((t) => live(t) && String(t.by) >= TODAY && String(t.by) < new Date(NOW + 8 * 86_400_000).toISOString().slice(0, 10)).length);
  assert.ok(Number(read('tasks-waiting')) > 0, 'the sample shows a queue');
});

/**
 * WORK'S OVERVIEW LEADS WITH WHAT TO DO, AS LISTS THAT TICK. It drew every
 * list as a `table`, so a task could be finished from the Board and from a project's page, which declares a `todo` over
 * the same register, and not from Work's own Overview: the tick the host already wires onto a `todo` row had nothing
 * on this page to land on.
 */
test('WORK’S OVERVIEW LEADS WITH WHAT IS DUE, AS LISTS THAT TICK, and no task in play on it is drawn where it cannot be ticked', async () => {
  const k = await seeded();
  const page = opened(k, 'work');
  const headings = page.blocks.map((b) => b.heading);
  /* THE PAGE'S LINE, THEN THE CAPTURE LINE, so a task is written down before anything else is read, then the Work
     screen's bands of what is still to do top to bottom, and what is further off and what was finished folded shut. The
     line has no heading: it is the sentence in the page's title. SINCE work 1.12.0 Today is the whole width over Late and
     This week, which share a row. */
  assert.deepEqual(
    headings,
    [
      undefined, 'What needs doing?', 'Today', 'Late', 'This week', 'With an agent', 'Waiting on you',
      'Not this week', 'After this week', 'No due day', 'Later',
      'Done lately', 'How fast it moves', 'Done recently',
    ],
    headings.join(', '),
  );
  /* LATE AND THIS WEEK SHARE A ROW, SINCE work 1.12.0, half each, and every other band is the whole width. */
  const spans = Object.fromEntries((PAGES.work!.blocks as { heading?: string; span?: number }[]).filter((b) => b.heading).map((b) => [b.heading, b.span]));
  assert.deepEqual([spans.Today, spans.Late, spans['This week'], spans['With an agent']], [12, 6, 6, 12]);
  for (const folded of ['Not this week', 'Done lately'])
    assert.equal((page.blocks.find((b) => b.heading === folded) as { fold?: boolean }).fold, true, `${folded} is not folded`);

  /* PAST ITS DATE IS LATE, AND ON TOP, because it is still the next thing to do. The sample's is four days late. */
  const late = block(page, 'Late');
  assert.equal(late.kind, 'todo');
  assert.deepEqual(late.rows.map((r) => r.fields.what), ['Turn auto-renew back on for kilnfonts.example']);
  assert.ok(!block(page, 'This week').rows.some((r) => String(r.fields.by) <= TODAY), 'This week holds what is late or due today');

  /* DONE RECENTLY IS THE LAST SEVEN DAYS, NEWEST FIRST. */
  const done = block(page, 'Done recently').rows.map((r) => String(r.fields.done_on));
  assert.ok(done.length > 0 && done.every((d) => d > new Date(NOW - 8 * 86_400_000).toISOString().slice(0, 10)), done.join(', '));
  assert.deepEqual(done, [...done].sort().reverse(), 'not newest first');

  const untickable = page.blocks
    .filter((b) => b.kind !== 'todo')
    .flatMap((b) => b.rows.filter((r) => typeof r.fields.what === 'string' && !['done', 'dropped'].includes(String(r.fields.state))).map((r) => `${b.heading}: ${String(r.fields.what)}`));
  assert.deepEqual(untickable, [], 'a task in play drawn in a block with no tick');
});

test('OPEN LEAVES OUT WORK KEPT FOR LATER AND SAYS IT BESIDE, and the sample board draws a Later column', async () => {
  const k = await seeded();
  const later = TASKS.filter((t) => t.state === 'backlog').length;
  assert.ok(later > 0, 'the sample keeps a task for later');
  assert.ok(TASKS.filter(live).length > TASKS.filter(open).length);
  /* KEPT FOR LATER HAS ITS OWN BAND, folded under Not this week, since work 1.10.0 cut the figures to two. */
  assert.equal(block(opened(k, 'work'), 'Later').rows.length, later, 'what is kept for later is not under Later');
  const read = k.metric(METRICS['tasks-later'] as never);
  assert.ok(read.ok, sayOf(read));
  assert.equal(read.value.value, later);
  assert.ok(block(opened(k, 'work-board'), 'By status').rows.some((r) => r.fields.state === 'backlog'), 'no Later column on the board');
});

test('THE BOARD HAS A COLUMN FOR WORK AN AGENT HANDED BACK, and progress is counted by the week work was finished', async () => {
  const k = await seeded();
  const board = block(opened(k, 'work-board'), 'By status');
  assert.ok(board.rows.some((r) => r.fields.state === 'review'));
  /* THE WEEKS ARE THE FIGURE'S, read whole, since the page draws them as Done in 7 days' line and a project's page draws
     its own (`project-done-by-week`). */
  const weeks = k.metric(METRICS['tasks-done-by-week'] as never);
  assert.ok(weeks.ok, sayOf(weeks));
  const counted = (weeks.value.groups ?? []).reduce((n, g) => n + Number(g.value ?? 0), 0);
  assert.ok(counted > 0, 'nothing finished in the weeks counted');
});

test('AN AGENT TAKES A TASK, SPLITS IT, HANDS IT BACK AND A PERSON FINISHES IT, and the page says who did each', async () => {
  const k = await seeded();
  const agent = { actor: 'agent:claude' };
  const person = { actor: 'p_1' };
  const title = 'Rotate the Fenwick deploy key';
  const seq = TASKS.findIndex((t) => t.what === title) + 1;
  const ref = `tasks#${seq}`;

  /* TAKE: the agent sets itself on the task and starts it. */
  assert.ok(k.update('tasks', ref, { agent: 'claude', state: 'doing' }, agent).ok);
  let overview = opened(k, 'work');
  assert.ok(block(overview, 'With an agent').rows.some((r) => r.fields.what === title));

  /* SPLIT: two steps, each part of the task. */
  for (const what of ['Issue the new Fenwick key', 'Revoke the old Fenwick key'])
    assert.ok(k.create('tasks', { what, state: 'open', parent: ref, agent: 'claude', by: TODAY }, agent).ok);
  const all = k.list({ register: 'tasks', limit: 200 });
  assert.ok(all.ok);
  const parent = all.value.rows.find((r) => r.seq === seq)!;
  assert.equal(all.value.rows.filter((r) => r.fields.parent === parent.id).length, 2, 'both steps are part of the task');

  /* HAND BACK: the agent finishes its part and it waits on a person, with what the agent said as the reason.
     UNTIL WORK 1.6.0 THE QUEUE ALSO NAMED WHO CHANGED IT, in a Changed by column, and this asserted `agent:claude`
     there. The queue is a `todo` now so that it can be ticked, a `todo` draws the task and one detail, and the design
     gives that detail to the note. Who handed it back is still on the row's history, not on this page. */
  assert.ok(k.update('tasks', ref, { state: 'review', note: 'New key issued and the old one revoked. Check the deploy.' }, agent).ok);
  overview = opened(k, 'work');
  const queue = block(overview, 'Waiting on you');
  const at = queue.rows.findIndex((r) => r.fields.what === title);
  assert.ok(at >= 0, 'the handed-back task is not in the queue');
  assert.equal(queue.rows[at]!.fields.note, 'New key issued and the old one revoked. Check the deploy.');

  /* FINISH: a person checks it and marks it done, the record dates it, and it leaves the queue for Done recently. */
  assert.ok(k.update('tasks', ref, { state: 'done' }, person).ok);
  assert.equal(k.get(ref)!.fields.done_on, TODAY, 'the record fills the day it was finished');
  overview = opened(k, 'work');
  assert.ok(!block(overview, 'Waiting on you').rows.some((r) => r.fields.what === title));
  assert.ok(block(overview, 'Done recently').rows.some((r) => r.fields.what === title));
  const done = (block(overview, 'How fast it moves').readings ?? []).find((r) => r.metric === 'tasks-done-7d');
  assert.equal(done?.reading?.value, TASKS.filter((t) => t.state === 'done' && String(t.done_on) > new Date(NOW - 8 * 86_400_000).toISOString().slice(0, 10)).length + 1);
});

test('WORK NEEDS NO PEOPLE: who holds a task is a link, left out on a record without People', () => {
  const manifest = firstPartyManifest('work');
  assert.ok(!manifest.requires.includes('register.people'), manifest.requires.join(', '));
  assert.ok(manifest.links.includes('register.people'));
  const doc = firstPartyDocument('work', { holds: ['things', 'tasks', 'tracks', 'updates'] })!;
  const tasks = (doc.declarations as { register?: string; fields?: { id: string }[] }[]).find((d) => d.register === 'tasks')!;
  assert.ok(!tasks.fields!.some((f) => f.id === 'owner'));
  assert.ok(tasks.fields!.some((f) => f.id === 'agent'), 'the agent is the pack’s own field and stays');
});

test('WORK INSTALLS ALONE: a homework list with no Projects and no People, its pages open and a task is written', async () => {
  const { install, normalise, plan } = await import('@braindog/declare');
  const k = await openRecord(openSqlite(), { now: () => NOW });
  assert.deepEqual(firstPartyManifest('work').requires, [], 'Work needs no other module');

  const doc = firstPartyDocument('work', { holds: ['tasks', 'tracks', 'updates'], seeds: [] })!;
  const packed = await normalise(doc, { kind: 'local' });
  assert.ok(packed.ok, sayOf(packed));
  const state = {
    format: 1,
    primitives: 1,
    record_version: k.version(),
    packs: k.packs(),
    declarations: k.declarations(),
    rows: k.census(),
  } as Parameters<typeof plan>[1];
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

  const tasks = (doc.declarations as { register?: string; fields?: { id: string }[] }[]).find((d) => d.register === 'tasks')!;
  assert.ok(!tasks.fields!.some((f) => f.id === 'thing' || f.id === 'owner'), 'no project and no owner on a record without them');

  /* A NEW LIST IS THE CAPTURE LINE: every band waits for something to hold, and what is further off stays folded. */
  const fresh = opened(k, 'work');
  assert.deepEqual(
    fresh.blocks.filter((b) => b.drawn !== false && b.kind !== 'note' && b.kind !== 'section' && b.heading !== 'After this week' && b.heading !== 'No due day' && b.heading !== 'Later').map((b) => b.heading),
    ['What needs doing?'],
  );

  assert.ok(k.create('tasks', { what: 'Problem set 3', state: 'open', by: TODAY }, { actor: 'p_1' }).ok);
  const overview = opened(k, 'work');
  for (const b of overview.blocks) assert.deepEqual(b.refusals, [], `work ${b.heading}`);
  assert.ok(block(overview, 'Today').rows.some((r) => r.fields.what === 'Problem set 3'));
  for (const b of opened(k, 'work-board').blocks) assert.deepEqual(b.refusals, [], `work-board ${b.heading}`);
});

/* NO TILE ON WORK DRAWS OPEN'S LINE SINCE work 1.11.0, since the line says Open once, so the nights it remembers are read
   where they are kept, for the tiles a person or a use case puts it on. */
test('OPEN IS REMEMBERED EACH DAY, so its figure draws a line once the record has run a night', async () => {
  let now = NOW;
  const sql = openSqlite();
  const k = await openRecord(sql, { now: () => now });
  const out = await installSeed(k);
  assert.ok(out.ok, sayOf(out));
  const points = () => sql.all<{ value: number }>("SELECT value FROM metric_point WHERE series IN ('open-tasks', 'series.open-tasks') ORDER BY at");
  assert.deepEqual(points(), [], 'a night is remembered before a snapshot has run');

  /* THE NEXT NIGHT: the snapshot armed at install runs, and yesterday's count is written. */
  now = NOW + 86_400_000;
  await k.drain();
  assert.ok(points().length > 0, 'Open remembers no night after the first');
  assert.equal(points().at(-1)!.value, TASKS.filter(open).length, 'the last point is the day before, counted as it stood');
});

/**
 * THE CALMER PAGE, since work 1.10.0: one line in the title said from the figures, a glyph on every tile's heading, and
 * a line on every figure once the record has run a night.
 */
test('WORK OPENS ON ONE LINE SAID FROM ITS FIGURES, and every tile with a heading wears a glyph', async () => {
  const k = await seeded();
  for (const slug of ['work', 'work-board']) {
    const page = opened(k, slug);
    const lead = page.blocks[0]!;
    assert.equal(lead.kind, 'note', `${slug} does not open on its line`);
    assert.equal((lead as { lead?: boolean }).lead, true);
    assert.match(String((lead as { body?: string }).body), /\{\{open-tasks\}\} open task\(s\)/u);
    const bare = page.blocks.filter((b) => typeof b.heading === 'string' && typeof (b as { icon?: unknown }).icon !== 'string').map((b) => b.heading);
    assert.deepEqual(bare, [], `${slug}: a heading with no glyph`);
  }
  /* FEWER TILES: what drew the same tasks or the same finished work twice is gone, and so are the chart of the weeks,
     the bar by project and the queue of questions, which the figures, a project's page and Decide draw. */
  const headings = opened(k, 'work').blocks.map((b) => b.heading);
  for (const gone of ['Next two weeks', 'Done, 12 weeks', 'Done, and due ahead', 'Open work by project', 'Agents suggest'])
    assert.ok(!headings.includes(gone), `${gone} is still drawn`);
});

test('THE FIGURE ON HOW FAST IT MOVES IS REMEMBERED EACH NIGHT, so its tile draws a line', async () => {
  let now = NOW;
  const k = await openRecord(openSqlite(), { now: () => now });
  const out = await installSeed(k);
  assert.ok(out.ok, sayOf(out));
  now = NOW + 86_400_000;
  await k.drain();
  const cells = block(opened(k, 'work'), 'How fast it moves').readings ?? [];
  assert.equal(cells.length, 1);
  for (const c of cells) assert.ok(c.trend, `${c.metric} draws no line after a night`);
});

test('A PROJECT’S FINISHED WORK IS COUNTED BY THE WEEK, one project at a time, for the line its page draws', async () => {
  const k = await seeded();
  /* FILLED AS A PAGE FILLS `project-done-by-week:Kiln`, through the kernel's own `fill`. */
  const read = k.metric(fill(METRICS['project-done-by-week'], null, 'Kiln') as never);
  assert.ok(read.ok, sayOf(read));
  const kiln = TASKS.filter((t) => t.thing === 1 && t.state === 'done' && String(t.done_on ?? TODAY) > new Date(NOW - 63 * 86_400_000).toISOString().slice(0, 10)).length;
  const counted = (read.value.groups ?? []).reduce((n, g) => n + Number(g.value ?? 0), 0);
  assert.ok(kiln > 1, 'the sample finished more than one Kiln task in nine weeks');
  assert.equal(counted, kiln, JSON.stringify(read.value.groups));
});

/**
 * NO BAND IS DRAWN EMPTY, since work 1.10.0: Late, Today, This week and With an agent are each drawn on a figure over the
 * band's own clauses, so a band is drawn exactly while it holds a task, and the line's 'late' is the Late band's count.
 * An agent's task due today or past its day is drawn with the agent, and no band of yours is drawn for it.
 */
test('NO BAND OF WORK IS DRAWN EMPTY, and the line’s late is the Late band’s count', async () => {
  const k = await seeded();
  const gates: Record<string, string> = { Late: 'tasks-late-yours', Today: 'tasks-today-yours', 'This week': 'tasks-week-yours', 'With an agent': 'tasks-with-agents' };
  const check = () => {
    const page = opened(k, 'work');
    for (const [heading, metric] of Object.entries(gates)) {
      const b = block(page, heading);
      const read = k.metric(METRICS[metric] as never);
      assert.ok(read.ok, sayOf(read));
      assert.equal(read.value.value, b.matched ?? b.rows.length, `${heading} holds what ${metric} does not count`);
      assert.equal(b.drawn !== false, (b.matched ?? b.rows.length) > 0, `${heading} is drawn ${b.drawn === false ? 'hidden over tasks' : 'empty'}`);
    }
    const lead = page.blocks[0] as { body?: string; values?: Record<string, unknown> };
    assert.match(String(lead.body), /\{\{tasks-late-yours\}\} late/u);
    assert.equal(lead.values?.['tasks-late-yours'] ?? 0, block(page, 'Late').matched ?? block(page, 'Late').rows.length);
  };
  check();
  const yesterday = new Date(NOW - 86_400_000).toISOString().slice(0, 10);
  for (const by of [TODAY, yesterday]) assert.ok(k.create('tasks', { what: `An agent's task due ${by}`, state: 'open', agent: 'claude', by }, { actor: 'p_1' }).ok);
  check();
});
