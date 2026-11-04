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

/** The Board's board, which has worn no heading since work 1.16.0: the page is called Board and each column says its status. */
const boardOf = (p: PageResult) => {
  const b = p.blocks.find((x) => x.kind === 'board');
  assert.ok(b, `${p.slug ?? 'the page'} has no board`);
  assert.deepEqual(b.refusals, [], `the board: ${JSON.stringify(b.refusals)}`);
  assert.equal(b.heading, undefined, 'the board says By status under a page called Board again');
  return b;
};

const TODAY = new Date(NOW).toISOString().slice(0, 10);
const live = (t: (typeof TASKS)[number]) => t.state !== 'done' && t.state !== 'dropped';
/** What Open counts: work in play that is not kept for later. */
const open = (t: (typeof TASKS)[number]) => live(t) && t.state !== 'backlog';

test('WORK’S OVERVIEW AND BOARD OPEN ON THE SAMPLE WITH NO BLOCK REFUSED, and the figures count the sample’s rows', async () => {
  const k = await seeded();
  for (const slug of ['work', 'work-board']) for (const b of opened(k, slug).blocks) assert.deepEqual(b.refusals, [], `${slug} ${b.heading}`);

  /* NO AT A GLANCE (proj F10): Open is the head's count, and what is late and what
     waits on you are the line's. THE FIGURES THE HEAD, THE LINE AND THE BANDS ARE DRAWN ON still count the sample. */
  assert.ok(!opened(k, 'work').blocks.some((b) => b.heading === 'At a glance'), 'At a glance is drawn again');
  const read = (id: string) => {
    const out = k.metric(METRICS[id] as never);
    assert.ok(out.ok, sayOf(out));
    return out.value.value;
  };
  /* THE HEAD COUNTS OPEN WORK, kept for later left out, as the rail does; and since work 1.20.0 (Q6 of 29 October) the
     project chips count the same open tasks (`counts:` on the filter), where they counted Later too and read 67 over an
     Open of 57. */
  assert.equal((opened(k, 'work').head as { count?: { value?: number } } | undefined)?.count?.value, TASKS.filter(open).length, 'the head does not count what the rail counts');
  const chips = (opened(k, 'work') as { filters?: { values: { count: number }[] }[] }).filters?.[0]?.values ?? [];
  if (chips.length > 0) assert.equal(chips.reduce((n, v) => n + v.count, 0), TASKS.filter(open).length, 'the chips do not add up to what Open counts');
  assert.equal(read('tasks-done-7d'), TASKS.filter((t) => t.state === 'done' && String(t.done_on) > new Date(NOW - 8 * 86_400_000).toISOString().slice(0, 10)).length);
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
     line has no heading: it is the sentence in the page's title, two of them on one figure since work 1.13.0, of which one
     is drawn, and a third since work 1.14.0 for a list with nothing open. SINCE the screens scope of 24 October the
     bands are four, half the row each, in his order: Late, Waiting on you, This week, With an agent. */
  assert.deepEqual(
    headings,
    [
      /* ONE LINE SINCE work 1.26.1 (7438cc7e8), FOR A LIST WITH NOTHING OPEN: the counts over the bands went, each band says its own. And Your work this week since 4daeed99c. */
      undefined, 'What needs doing?', 'Questions for you', 'Late', 'Waiting on you', 'Your work this week', 'With an agent',
      'Not this week', 'After this week', 'No due day', 'Later', 'Needs a project', 'With no project',
      'Not moved in three months', 'Untouched for 90 days', 'Done lately', 'Done recently',
    ],
    headings.join(', '),
  );
  /* NO HALF-EMPTY TILE: the four bands half the row each, two rows, and the three folded groups each a heading across the page, as a section is. */
  const spans = Object.fromEntries((PAGES.work!.blocks as { heading?: string; span?: number }[]).filter((b) => b.heading).map((b) => [b.heading, b.span]));
  assert.deepEqual([spans['Late'], spans['Waiting on you'], spans['Your work this week'], spans['With an agent']], [6, 6, 6, 6]);
  assert.deepEqual([spans['Not this week'], spans['Needs a project'], spans['Done lately']], [12, 12, 12]);
  assert.ok(!('Today' in spans), 'Today is a band of its own again');
  /* THE LINE TO TYPE INTO IS THE HEADER'S, SINCE work 1.16.0, which a page says by where it puts it: the first block the
     record draws after the page's sentence, a capture into tasks, with no heading or surface round it and nothing
     before it. A host holds such a line beside the page's name, as it holds Today's. And Late's whole row is written
     down, which is what keeps it a strip on a screen wide enough to set two tiles side by side. */
  const drawn = page.blocks.filter((b) => b.drawn !== false);
  const opening = drawn.findIndex((b) => !(b.kind === 'note' && (b as { lead?: boolean }).lead === true));
  /* FIRST OF ALL WITH TASKS OPEN, SINCE work 1.26.1 (7438cc7e8) took the line over it. */
  assert.equal(opening, 0, 'something stands before the capture line');
  assert.deepEqual(
    [drawn[opening]!.kind, (drawn[opening] as { register?: string }).register, (drawn[opening] as { box?: boolean }).box],
    ['capture', 'tasks', undefined],
  );
  assert.ok(!drawn.some((b) => b.kind === 'section' && (b as { box?: boolean }).box === true), 'a boxed section would take the capture line onto its surface');
  assert.equal(Object.hasOwn((PAGES.work!.blocks as { heading?: string }[]).find((b) => b.heading === 'Late')!, 'span'), true, 'Late names no width of its own');
  /* LATER AND NO DUE DAY LIST WHAT HAS NO DAY NEWEST FIRST: a backlog task rarely has one, so Later is by its day where
     it has one, then newest first. */
  const orderOf = (heading: string) => (PAGES.work!.blocks as { heading?: string; order?: unknown }[]).find((b) => b.heading === heading)?.order;
  assert.deepEqual(orderOf('Later'), [{ field: 'by', dir: 'asc' }, { field: 'created_at', dir: 'desc' }]);
  assert.deepEqual(orderOf('No due day'), [{ field: 'created_at', dir: 'desc' }]);
  for (const folded of ['Not this week', 'Needs a project', 'Not moved in three months', 'Done lately'])
    assert.equal((page.blocks.find((b) => b.heading === folded) as { fold?: boolean }).fold, true, `${folded} is not folded`);

  /* PAST ITS DATE IS LATE, AND FIRST, because it is still the next thing to do. The sample's is four days late. This
     week holds the rest of the week, by the day, and nothing late. */
  const late = block(page, 'Late');
  assert.equal(late.kind, 'todo');
  assert.deepEqual(late.rows.map((r) => r.fields.what), ['Turn auto-renew back on for kilnfonts.example']);
  const soon = block(page, 'Your work this week');
  assert.equal(soon.kind, 'todo');
  assert.ok(soon.rows.every((r) => String(r.fields.by) >= TODAY), 'a late task is drawn under This week');
  const week = soon.rows.map((r) => String(r.fields.by));
  assert.deepEqual(week, [...week].sort(), 'This week is not by the day first');
  /* EVERY TASK SAYS ITS PROJECT (proj F10), in the line under it after its day. */
  for (const b of [late, soon]) assert.deepEqual((b.columns ?? []).map((c) => String(c.field)), ['what', 'by', 'thing']);

  /* DONE RECENTLY IS THE LAST SEVEN DAYS, NEWEST FIRST. */
  const done = block(page, 'Done recently').rows.map((r) => String(r.fields.done_on));
  assert.ok(done.length > 0 && done.every((d) => d > new Date(NOW - 8 * 86_400_000).toISOString().slice(0, 10)), done.join(', '));
  assert.deepEqual(done, [...done].sort().reverse(), 'not newest first');

  /* BUT WITH NO PROJECT, SINCE work 1.19.0: a table under its own fold of tasks drawn and ticked in a list
     above, there to be given a project. As a list that ticks it would draw each of them twice
     (work-overview-twice.test.ts). AND UNTOUCHED FOR 90 DAYS, SINCE C32 (the old Work screen retired), for the same
     reason: a table of tasks drawn and ticked in their band above, there to be done, dated or dropped. */
  const untickable = page.blocks
    .filter((b) => b.kind !== 'todo' && b.heading !== 'With no project' && b.heading !== 'Untouched for 90 days')
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
  assert.ok(boardOf(opened(k, 'work-board')).rows.some((r) => r.fields.state === 'backlog'), 'no Later column on the board');
});

test('THE BOARD HAS A COLUMN FOR WORK AN AGENT HANDED BACK, and progress is counted by the week work was finished', async () => {
  const k = await seeded();
  const board = boardOf(opened(k, 'work-board'));
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
  const done = k.metric(METRICS['tasks-done-7d'] as never);
  assert.ok(done.ok, sayOf(done));
  assert.equal(done.value.value, TASKS.filter((t) => t.state === 'done' && String(t.done_on) > new Date(NOW - 8 * 86_400_000).toISOString().slice(0, 10)).length + 1);
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

/**
 * A CARD ON THE BOARD SAYS WHEN ITS TASK IS DUE AND WHO HOLDS IT, SINCE work 1.17.0, where its one fact was the project.
 * The day stands before the holder, so on a record without People the holder goes and the day stays where it was.
 */
test('A CARD ON THE BOARD SAYS THE DAY ITS TASK IS DUE AND WHO HOLDS IT, and keeps the day on a record without People', async () => {
  const k = await seeded();
  const board = opened(k, 'work-board').blocks.find((b) => b.kind === 'board')!;
  assert.deepEqual(board.refusals, []);
  assert.deepEqual(board.columns?.map((c) => c.field), ['state', 'what', 'by', 'owner']);
  /* EACH CARD'S OWN DAY AND HOLDER, as the row holds them. */
  const dated = TASKS.find((t) => t.state === 'doing' && typeof t.by === 'string' && typeof t.owner === 'number')!;
  const card = board.rows.find((r) => r.fields.what === dated.what)!;
  assert.equal(card.fields.by, dated.by);
  assert.ok(typeof card.fields.owner === 'string' && card.fields.owner !== '', 'the card has no holder to say');

  const alone = firstPartyDocument('work', { holds: ['things', 'tasks', 'tracks', 'updates'], seeds: [] })!;
  const page = (alone.declarations as { page?: string; blocks?: { kind: string; columns?: { field: string }[] }[] }[]).find((d) => d.page === 'work-board')!;
  assert.deepEqual(page.blocks!.find((b) => b.kind === 'board')!.columns!.map((c) => c.field), ['state', 'what', 'by']);
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
  /* AND ONE SENTENCE, SINCE work 1.14.0: the line says nothing is open, and no band says it is empty. */
  const lines = fresh.blocks.filter((b) => b.kind === 'note' && (b as { lead?: boolean }).lead === true && b.drawn !== false) as { body?: string }[];
  assert.ok(lines.some((b) => b.body === 'Nothing is open right now'), lines.map((b) => b.body).join(' / '));
  const empties = (PAGES.work!.blocks as { lead?: boolean; empty?: string; heading?: string }[]).filter((b) => !b.lead && b.empty !== undefined);
  assert.deepEqual(empties.map((b) => b.heading), [], 'a band of Work draws its own empty line');
  /* FIRST OF THE LINES THE RECORD DRAWS, on Work and on the Board, since the counts are drawn too with nothing late. The
     nightly line is written for the first line a page draws (`leadBlockOf` in `packages/record/src/headlines.ts`), and
     asked of the counts at nought the model would say nothing is open in its own words, over this sentence saying it
     again. */
  for (const slug of ['work', 'work-board']) {
    const first = opened(k, slug).blocks.find((b) => b.kind === 'note' && (b as { lead?: boolean }).lead === true && b.drawn !== false) as { body?: string } | undefined;
    assert.equal(first?.body, 'Nothing is open right now', `${slug}'s nightly line is asked of ${first?.body}`);
  }

  assert.ok(k.create('tasks', { what: 'Problem set 3', state: 'open', by: TODAY }, { actor: 'p_1' }).ok);
  const overview = opened(k, 'work');
  for (const b of overview.blocks) assert.deepEqual(b.refusals, [], `work ${b.heading}`);
  assert.ok(block(overview, 'Your work this week').rows.some((r) => r.fields.what === 'Problem set 3'));
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
/* NO LINE OF COUNTS SINCE work 1.26.1 (7438cc7e8, 3 Nov, "i dont like those briefs at all"): each band and each column counts itself. A line is said only while there is nothing to count. */
test('WORK AND THE BOARD OPEN ON NO LINE OF COUNTS, only one for nothing open, and every tile with a heading wears a glyph', async () => {
  const k = await seeded();
  for (const slug of ['work', 'work-board']) {
    const page = opened(k, slug);
    const counts = page.blocks.find(
      (b) => (b as { lead?: boolean }).lead === true && /\{\{(open-tasks|tasks-late-yours)\}\} (open task\(s\)|late)/u.test(String((b as { body?: string }).body)),
    );
    assert.equal(counts, undefined, `${slug} says a line of its counts again`);
    assert.deepEqual(page.blocks.filter((b) => (b as { lead?: boolean }).lead === true && b.drawn !== false).map((b) => (b as { body?: string }).body), [], `${slug}: a line is said over tasks that are there`);
    const bare = page.blocks.filter((b) => typeof b.heading === 'string' && typeof (b as { icon?: unknown }).icon !== 'string').map((b) => b.heading);
    assert.deepEqual(bare, [], `${slug}: a heading with no glyph`);
  }
  /* FEWER TILES: what drew the same tasks or the same finished work twice is gone, and so are the chart of the weeks,
     the bar by project and the queue of questions, which the figures, a project's page and Decide draw. */
  const headings = opened(k, 'work').blocks.map((b) => b.heading);
  for (const gone of ['Next two weeks', 'Done, 12 weeks', 'Done, and due ahead', 'Open work by project', 'Agents suggest'])
    assert.ok(!headings.includes(gone), `${gone} is still drawn`);
});

/* NO STRIP ON WORK DRAWS DONE THIS WEEK (proj F10), so the nights it remembers are read
   where they are kept, for the tiles a person or a use case puts it on, as Open's are. */
test('DONE THIS WEEK IS REMEMBERED EACH NIGHT, so a tile that draws it has its last seven days', async () => {
  let now = NOW;
  const sql = openSqlite();
  const k = await openRecord(sql, { now: () => now });
  const out = await installSeed(k);
  assert.ok(out.ok, sayOf(out));
  now = NOW + 86_400_000;
  await k.drain();
  const points = sql.all<{ value: number }>("SELECT value FROM metric_point WHERE series IN ('tasks-done-7d', 'series.tasks-done-7d') ORDER BY at");
  assert.ok(points.length > 0, 'Done this week remembers no night after the first');
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
test('NO BAND OF WORK IS DRAWN EMPTY, and no line says again what Late holds', async () => {
  const k = await seeded();
  /* EACH BAND IS DRAWN ON THE FIGURE THAT COUNTS IT, and holds what it counts. */
  const gates: Record<string, string[]> = { Late: ['tasks-late-yours'], 'Your work this week': ['tasks-this-week-yours'], 'With an agent': ['tasks-with-agents'] };
  const check = () => {
    const page = opened(k, 'work');
    for (const [heading, metrics] of Object.entries(gates)) {
      const b = block(page, heading);
      const counted = metrics.reduce((n, metric) => {
        const read = k.metric(METRICS[metric] as never);
        assert.ok(read.ok, sayOf(read));
        return n + Number(read.value.value);
      }, 0);
      assert.equal(counted, b.matched ?? b.rows.length, `${heading} holds what ${metrics.join(' and ')} do not count`);
      assert.equal(b.drawn !== false, (b.matched ?? b.rows.length) > 0, `${heading} is drawn ${b.drawn === false ? 'hidden over tasks' : 'empty'}`);
    }
    /* NO LINE COUNTS WHAT IS LATE SINCE work 1.26.1 (7438cc7e8): Late is drawn with what it holds, and a figure in a line over it said the same twice. */
    assert.ok(!page.blocks.some((b) => b.kind === 'note' && /\{\{tasks-late-yours\}\} late/u.test(String((b as { body?: string }).body))), 'a line counts what is late again');
  };
  check();
  const yesterday = new Date(NOW - 86_400_000).toISOString().slice(0, 10);
  for (const by of [TODAY, yesterday]) assert.ok(k.create('tasks', { what: `An agent's task due ${by}`, state: 'open', agent: 'claude', by }, { actor: 'p_1' }).ok);
  check();
});

/* ── whose work, and what has not moved (the old Work screen retired) ── */

test('WORK NARROWS TO YOURS OR THE AGENTS’, AND FOLDS WHAT HAS NOT MOVED IN THREE MONTHS, as the old screen did', async () => {
  let now = NOW - 120 * 86_400_000;
  const k = await openRecord(openSqlite(), { now: () => now });
  const out = await installSeed(k);
  assert.ok(out.ok, sayOf(out));
  assert.ok(k.create('tasks', { what: 'Left since the spring', state: 'open' }, { actor: 'p_1' }).ok);
  now = NOW;
  const page = opened(k, 'work');
  const whose = ((page.filters ?? []) as { field: string; values: { label: string; count: number }[] }[]).find((f) => f.field === 'whose');
  assert.ok(whose, 'Work has no filter by whose work it is');
  assert.deepEqual(whose.values.map((v) => v.label), ['Yours', 'Agents']);
  assert.ok(whose.values.every((v) => v.count > 0), 'the sample holds work of both');
  const stale = block(page, 'Untouched for 90 days');
  assert.notEqual(stale.drawn, false);
  assert.ok(stale.rows.some((r) => r.fields.what === 'Left since the spring'), 'the task untouched for four months is not under Untouched for 90 days');
  assert.ok(stale.rows.every((r) => Date.parse(String(r.updated_at)) < NOW - 90 * 86_400_000), 'a task written lately is drawn as untouched');

  const agents = k.page('work', { whose: 'agents' });
  assert.ok(agents.ok, sayOf(agents));
  for (const b of agents.value.blocks.filter((x) => x.kind === 'todo' && x.source === 'register.tasks'))
    assert.ok(b.rows.every((r) => typeof r.fields.agent === 'string' && r.fields.agent !== ''), `${String(b.heading)} draws work no agent holds under Agents`);
});

/**
 * THE BOARD'S LINE ADDS UP TO ITS COLUMNS, AND THE BOARD IS ITS ONE LIST. The board read its
 * rows by tier and day with done work among them, fifty at most, so on a record with many urgent tasks finished the
 * read ran out inside Open: the line said 36 open while the columns held 34 of them. And the page drew every open task
 * a second time under the board, as Everything open.
 */
test('THE BOARD HOLDS EVERY TASK IN PLAY BEFORE ANY DONE ONE, Later among them, with no line of counts over it and no list repeating it', async () => {
  const k = await seeded();
  const person = { actor: 'p_1' };
  /* SIXTY URGENT TASKS FINISHED, INVENTED: each would be read before an open task of a lower tier. */
  for (let n = 1; n <= 60; n++) assert.ok(k.create('tasks', { what: `Glaze test tile ${n}`, state: 'done', priority: 'urgent', done_on: TODAY }, person).ok);
  for (let n = 1; n <= 12; n++) assert.ok(k.create('tasks', { what: `Sand the kiln shelf ${n}`, state: 'open', priority: 'low' }, person).ok);
  const read = (id: string) => {
    const out = k.metric(METRICS[id] as never);
    assert.ok(out.ok, sayOf(out));
    return Number(out.value.value);
  };
  const page = opened(k, 'work-board');
  const board = boardOf(page);
  const inPlay = board.rows.filter((r) => r.fields.state !== 'done').length;
  assert.equal(inPlay, read('open-tasks') + read('tasks-later'), 'a task in play is missing from the board');
  assert.ok(board.rows.some((r) => r.fields.state === 'done'), 'the board keeps a Done column to drop a card on');
  /* NO LINE COUNTS THE COLUMNS SINCE work 1.26.1 (3 Nov, "i dont like those briefs at all, remove them"): "12 open, 3 for
     later" said what the columns count themselves. */
  assert.equal(page.blocks.find((b) => /\{\{(open-tasks|tasks-later)\}\}/u.test(String((b as { body?: string }).body ?? ''))), undefined, 'the board still opens on a line of counts');
  assert.ok(!page.blocks.some((b) => b.kind === 'table'), 'the board page lists its tasks a second time');
});
