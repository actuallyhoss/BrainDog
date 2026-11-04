/**
 * THE ALARM'S LOOK AND LINT IN SLICES (F35, 30 October). His record's alarm ran 15 to 75 s and was reset five times, and
 * every request ran the same look in its `waitUntil`. A host now hands `slashTick` and `lintTick` a budget, each does a
 * few pages a tick and keeps where it stopped, and a request only asks whether anything is due (`defer`).
 *
 * WHAT THESE HOLD: a look in slices comes to what one tick comes to, and so does the lint's sign; a later tick of the
 * day draws no page while the record has not moved, and draws again once it has; a request's ask writes nothing; and an
 * update pass that began and never ended waits an hour before it is begun again, not the next request.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, tickBudget, TICK_MS, type CallContext, type HeadlineInput, type SlashModel } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { NOW, installSeed } from '../../seed/src/index.ts';

const MIN = 60_000;
const OWNER: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

/** A model that drafts nothing and answers each page it is handed one plain line, keeping what it was handed. */
const writing = () => {
  const heard: HeadlineInput[] = [];
  const model: SlashModel = {
    name: 'test model',
    draft: async () => ({ drafts: [] }),
    headline: async (input) => {
      heard.push(input);
      return { lines: Object.fromEntries(input.pages.map((p) => [p.page, `${p.title} is steady.`])) };
    },
  };
  return { heard, model };
};

async function seeded() {
  const { heard, model } = writing();
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock, slashModel: model });
  assert.ok((await installSeed(api.kernel)).ok);
  clock.advance(5 * MIN);
  return { heard, sql, clock, api };
}

/** A budget of one page a tick, on a clock that never moves: the smallest slice a host can hand. */
const onePage = () => tickBudget(() => 0, TICK_MS, 1);

/** Count every page the record draws while `run` runs. */
async function drawing(api: Awaited<ReturnType<typeof seeded>>['api'], run: () => Promise<unknown>): Promise<number> {
  const kernel = api.kernel as unknown as { page: (...a: unknown[]) => unknown };
  const page = kernel.page;
  let n = 0;
  kernel.page = (...a: unknown[]) => {
    n += 1;
    return page.apply(api.kernel, a);
  };
  try {
    await run();
  } finally {
    kernel.page = page;
  }
  return n;
}

const openQuestions = (api: Awaited<ReturnType<typeof seeded>>['api']): string[] => {
  const open = api.kernel.openSuggestions({ apart: 'with' });
  return open.ok ? open.value.map((s) => String(s.question)).sort() : [];
};

test('THE DAY\'S LOOK IN SLICES COMES TO WHAT ONE TICK COMES TO: the same pages asked once, the same questions, the same prefs', async () => {
  const whole = await seeded();
  const sliced = await seeded();

  const once = await whole.api.slashTick();
  assert.ok(once.ran, JSON.stringify(once));
  assert.equal('more' in once, false, 'one tick with no budget did the whole look');

  let ticks = 0;
  let last: Awaited<ReturnType<typeof sliced.api.slashTick>>;
  do {
    last = await sliced.api.slashTick({ budget: onePage() });
    ticks += 1;
  } while ((last as { more?: true }).more === true && ticks < 2_000);
  assert.ok(ticks > 1, 'a budget of one page did the look in one tick');
  assert.ok(ticks < 2_000, 'the look in slices never ended');

  /* ONE HEADLINE ASK EITHER WAY, of the same pages. */
  assert.equal(sliced.heard.length, whole.heard.length);
  assert.deepEqual(
    sliced.heard.map((h) => h.pages.map((p) => p.page)),
    whole.heard.map((h) => h.pages.map((p) => p.page)),
  );
  const slash = (api: typeof whole.api) => api.kernel.prefsOf('slash');
  assert.equal(slash(sliced.api)['slash.last'], slash(whole.api)['slash.last']);
  assert.deepEqual(slash(sliced.api)['headlines.asked'], slash(whole.api)['headlines.asked']);
  assert.deepEqual(openQuestions(sliced.api), openQuestions(whole.api));
  /* AND THE STEPS ARE ALL DONE, so the next tick is the day's later look and not the look again. */
  assert.equal((slash(sliced.api)['slash.step'] as { next: number }).next, 7);
  assert.deepEqual(await sliced.api.slashTick(), { ran: false, why: 'today' });
});

test('A LATER TICK OF THE DAY DRAWS NO PAGE WHILE NOTHING MOVED, and draws again once a row is written', async () => {
  const { api, clock } = await seeded();
  assert.ok((await api.slashTick()).ran);

  /* THE FIRST LATER TICK MAY WALK (the look may have written since its walk began); the one after it has nothing new. */
  clock.advance(16 * MIN);
  await api.slashTick();
  clock.advance(16 * MIN);
  assert.equal(await drawing(api, () => api.slashTick()), 0, 'a tick over a record nobody wrote to drew its pages again');

  /* A ROW WRITTEN MOVES THE RECORD, so the next tick past the quarter hour reads the pages again. */
  const made = await api.create({ register: 'tasks', fields: { what: 'A new one', state: 'open' } }, OWNER);
  assert.ok(made.ok, JSON.stringify(made));
  clock.advance(16 * MIN);
  assert.ok((await drawing(api, () => api.slashTick())) > 0, 'a tick after a write drew no page');
});

test('A REQUEST\'S ASK (`defer`) DOES NONE OF THE WORK: it says the look is due and writes nothing', async () => {
  const { api, clock, heard } = await seeded();
  const before = JSON.stringify(api.kernel.prefsOf('slash'));
  const asked = await api.slashTick({ defer: true });
  assert.deepEqual(asked, { ran: false, why: 'later' });
  assert.equal(JSON.stringify(api.kernel.prefsOf('slash')), before, 'the ask wrote a pref');
  assert.equal(heard.length, 0, 'the ask asked the model');

  assert.ok((await api.slashTick()).ran);
  /* AND RIGHT AFTER A LATER TICK, NOTHING IS DUE: the quarter hour has not passed. */
  clock.advance(16 * MIN);
  await api.slashTick();
  assert.deepEqual(await api.slashTick({ defer: true }), { ran: false, why: 'today' });
});

test('AN UPDATE PASS THAT BEGAN AND NEVER ENDED IS BEGUN AGAIN AN HOUR LATER, not on the next request', async () => {
  const { api, clock } = await seeded();
  api.kernel.setPref('slash', 'slash.daily', false);
  await api.slashTick();
  const kept = api.kernel.prefsOf('braindog:updates')['first-party'] as { versions: string; day: string };
  assert.equal(typeof kept.versions, 'string');

  /* A PASS CUT BY THE PLATFORM: its start kept, its end never written (the last pass's day is yesterday's). */
  api.kernel.setPref('braindog:updates', 'first-party', { versions: kept.versions, day: '2000-01-01', tried: { versions: kept.versions, day: kept.day, at: clock.now() } });
  assert.deepEqual(await api.slashTick({ defer: true }), { ran: false, why: 'off' }, 'a pass begun a minute ago is due again');
  clock.advance(30 * MIN);
  await api.slashTick();
  assert.equal((api.kernel.prefsOf('braindog:updates')['first-party'] as { day: string }).day, '2000-01-01', 'the pass ran again within the hour');

  clock.advance(31 * MIN);
  assert.deepEqual(await api.slashTick({ defer: true }), { ran: false, why: 'later' });
  await api.slashTick();
  assert.equal((api.kernel.prefsOf('braindog:updates')['first-party'] as { day: string }).day, kept.day, 'the pass did not run again after the hour');
});

test('THE LINT IN SLICES FILES THE SIGN ONE TICK FILES, and keeps where it stopped between ticks', async () => {
  const whole = await seeded();
  const sliced = await seeded();
  const once = await whole.api.lintTick();
  assert.ok(once.ran, JSON.stringify(once));

  let ticks = 0;
  let last: Awaited<ReturnType<typeof sliced.api.lintTick>>;
  do {
    last = await sliced.api.lintTick({ budget: onePage() });
    ticks += 1;
    if (!last.ran && last.why === 'later')
      assert.ok(sliced.api.kernel.prefsOf('braindog:signs')['pages-clean.run'] !== undefined, 'a slice kept nothing to go on from');
  } while (!last.ran && ticks < 2_000);
  assert.ok(ticks > 1, 'a budget of one page did the lint in one tick');
  assert.deepEqual(last, once);

  const reading = (sql: Awaited<ReturnType<typeof seeded>>['sql']) =>
    sql.all<{ state: string; value: number | null; said: string; facts: string }>("SELECT state, value, said, facts FROM sign_reading WHERE sign = 'pages-clean'").map((r) => ({ ...r }));
  assert.deepEqual(reading(sliced.sql), reading(whole.sql));
  assert.deepEqual(sliced.api.kernel.prefsOf('braindog:page-lint')['round'], whole.api.kernel.prefsOf('braindog:page-lint')['round']);
  /* AND NOTHING IS LEFT UNDER WAY, so the next tick is the day's every-tick part alone. */
  assert.equal(sliced.api.kernel.prefsOf('braindog:signs')['pages-clean.run'], undefined);
  /* THE WORDS' WALK IS A SHARE A TICK TOO, after the day's lint, so the ticks say later until it is done (`keepWordsSliced`). */
  let after = await sliced.api.lintTick({ budget: onePage() });
  for (let i = 0; i < 2_000 && !after.ran && after.why === 'later'; i++) after = await sliced.api.lintTick({ budget: onePage() });
  assert.deepEqual(after, { ran: false, why: 'today' });
});

/** Count every slice of the night's walk the record reads while `run` runs. */
async function walking(api: Awaited<ReturnType<typeof seeded>>['api'], run: () => Promise<unknown>): Promise<number> {
  const kernel = api.kernel as unknown as { backfill: (...a: unknown[]) => unknown };
  const backfill = kernel.backfill;
  let n = 0;
  kernel.backfill = (...a: unknown[]) => {
    n += 1;
    return backfill.apply(api.kernel, a);
  };
  try {
    await run();
  } finally {
    kernel.backfill = backfill;
  }
  return n;
}

/** Ticks with a budget of one page until the day's look says it has no more. */
async function sliceThrough(api: Awaited<ReturnType<typeof seeded>>['api']): Promise<number> {
  let ticks = 0;
  let last: Awaited<ReturnType<typeof api.slashTick>>;
  do {
    last = await api.slashTick({ budget: onePage() });
    ticks += 1;
  } while ((last as { more?: true }).more === true && ticks < 2_000);
  return ticks;
}

test('THE NIGHT\'S WALK IN SLICES KEEPS WHAT IT WROTE AS ONE WALK, and ends kept as ended', async () => {
  const whole = await seeded();
  const sliced = await seeded();
  assert.ok((await whole.api.slashTick()).ran);
  await sliceThrough(sliced.api);
  const slash = (api: typeof whole.api) => api.kernel.prefsOf('slash');
  assert.deepEqual(slash(sliced.api)['understand.next'], slash(whole.api)['understand.next']);
  assert.equal((slash(sliced.api)['understand.undo'] as unknown[] | undefined)?.length, (slash(whole.api)['understand.undo'] as unknown[] | undefined)?.length);
  /* ONE TICK WITH NO BUDGET KEEPS NOTHING BETWEEN; A WALK IN SLICES ENDS KEPT AS ENDED, with nothing of it left to file. */
  assert.equal(slash(whole.api)['understand.run'], undefined);
  assert.deepEqual(slash(sliced.api)['understand.run'], { day: slash(sliced.api)['slash.last'], begun: 5, end: true, asked: [], held: [], batches: [], dropped: [] });
});

test('A WALK CUT AFTER ITS LAST SLICE GOES ON WITHOUT WALKING AGAIN, and one cut partway goes on from where it stopped', async () => {
  const { api } = await seeded();
  assert.ok((await api.slashTick()).ran);
  const today = api.kernel.prefsOf('slash')['slash.last'] as string;
  const understanding = 4;
  const cutAt = (begun: number, end: boolean): void => {
    api.kernel.setPref('slash', 'slash.step', { day: today, next: understanding, by: 'rules', large: false });
    api.kernel.setPref('slash', 'understand.run', { day: today, begun, end, asked: [], held: [], batches: [], dropped: [] });
  };

  /* EVERY SLICE OF THE NIGHT BEGUN: the next tick reads none of them again, and the look goes on to its next step. */
  cutAt(5, false);
  assert.equal(await walking(api, () => sliceThrough(api)), 0, 'a walk with no slice left walked again');
  assert.equal((api.kernel.prefsOf('slash')['slash.step'] as { next: number }).next, 7);

  /* ONE SLICE BEGUN: the walk goes on for the slices it has left, and no more. */
  cutAt(1, false);
  const walked = await walking(api, () => sliceThrough(api));
  assert.ok(walked >= 1 && walked <= 4, `the walk read ${walked} slices with four left`);

  /* A WALK OF ANOTHER DAY THAT NEVER ENDED is begun afresh tonight. */
  api.kernel.setPref('slash', 'slash.step', { day: today, next: understanding, by: 'rules', large: false });
  api.kernel.setPref('slash', 'understand.run', { day: '2000-01-01', begun: 5, end: false, asked: [], held: [], batches: [], dropped: [] });
  assert.ok((await walking(api, () => sliceThrough(api))) >= 1, 'a walk of another day held tonight back');
});

/** The headlines walk's place as an object keeps it (`headlines.walk`). */
type Walk = { day: string; again: boolean; order: string[]; at: number; stamp: string; owed: string[]; drawing?: string; cuts?: number };
const walkOf = (api: Awaited<ReturnType<typeof seeded>>['api']): Walk | undefined => api.kernel.prefsOf('slash')['headlines.walk'] as Walk | undefined;

/**
 * Ticks one page a tick until the walk begins to draw a page `pick` takes, then puts the walk's place back as it stood
 * then: what an object reset in that draw leaves behind. Answers that place, or `null` when no such page was drawn.
 */
async function goneWhileDrawing(api: Awaited<ReturnType<typeof seeded>>['api'], pick: (w: Walk) => boolean): Promise<Walk | null> {
  const kernel = api.kernel as unknown as { page: (...a: unknown[]) => unknown };
  const page = kernel.page;
  let at: Walk | null = null;
  kernel.page = (...a: unknown[]) => {
    const w = walkOf(api);
    if (at === null && w !== undefined && w.drawing === String(a[0]) && pick(w)) at = structuredClone(w);
    return page.apply(api.kernel, a);
  };
  try {
    for (let ticks = 0; at === null && ticks < 2_000; ticks++) {
      const last = await api.slashTick({ budget: onePage() });
      if ((last as { more?: true }).more !== true) break;
    }
  } finally {
    kernel.page = page;
  }
  if (at !== null) api.kernel.setPref('slash', 'headlines.walk', at);
  return at;
}

/** A new object over the same record, with nothing in memory, counting each page it draws while the walk keeps a place. */
async function freshObject(s: Awaited<ReturnType<typeof seeded>>, onDraw: (slug: string) => void = () => {}) {
  const { heard, model } = writing();
  const api = await createRecordApi({ sql: s.sql, clock: s.clock, slashModel: model });
  const drawn = new Map<string, number>();
  const kernel = api.kernel as unknown as { page: (...a: unknown[]) => unknown };
  const page = kernel.page;
  kernel.page = (...a: unknown[]) => {
    const slug = String(a[0]);
    if (walkOf(api) !== undefined) {
      drawn.set(slug, (drawn.get(slug) ?? 0) + 1);
      onDraw(slug);
    }
    return page.apply(api.kernel, a);
  };
  return { api, heard, drawn };
}

/** Ticks one page a tick until the look says it has no more, keeping every line its log said. */
async function tickThrough(api: Awaited<ReturnType<typeof seeded>>['api']): Promise<{ ticks: number; said: string[] }> {
  const said: string[] = [];
  let ticks = 0;
  let last: Awaited<ReturnType<typeof api.slashTick>>;
  do {
    last = await api.slashTick({ budget: onePage() });
    if (last.ran) said.push(...last.dropped);
    ticks += 1;
  } while ((last as { more?: true }).more === true && ticks < 2_000);
  return { ticks, said };
}

/* R3 (review of 30 October): the walk was kept in memory alone, so an object reset while drawing one page began again
   from Home in the next, reached the same page and was reset again, and the day's look stalled on its headlines. */
test('A HEADLINES WALK WHOSE OBJECT WAS RESET MID-PAGE GOES ON PAST THAT PAGE IN THE NEXT OBJECT, says so, and asks once', async () => {
  const s = await seeded();
  const kept = await goneWhileDrawing(s.api, (w) => w.again === false && w.at >= 2 && w.at < w.order.length);
  assert.ok(kept !== null, 'the walk never kept its place');
  /* THE PAGE BEING DRAWN WHEN THE OBJECT WENT: its place is already past it, and it is named as under way. */
  const bad = kept.drawing!;
  assert.equal(bad, kept.order[kept.at - 1]);

  const fresh = await freshObject(s);
  const { ticks, said } = await tickThrough(fresh.api);
  assert.ok(ticks < 2_000, 'the look never ended in the new object');
  assert.equal(fresh.drawn.get(bad) ?? 0, 0, `the new object drew ${bad} again, the page its walk was drawing when the object went`);
  const title = s.api.kernel.pages().find((p) => p.slug === bad)!.title;
  assert.ok(said.some((line) => line.startsWith(`${title} was cut off`)), `the log said nothing of the page left out: ${JSON.stringify(said)}`);
  assert.ok(fresh.heard.length <= 1, 'the walk asked more than once');
  assert.equal(walkOf(fresh.api), undefined, 'the walk kept its place after it ended');
});

/* Q1 (second review of 30 October): a resumed walk drew every page it had found owed in one step, with no budget, so the
   alarm that resumed it ran as long as the one cut and was cut in the same place, and the pref never moved. */
test('A RESUMED WALK DRAWS AGAIN WHAT IT HAD FOUND OWED A SLICE AT A TIME, keeping its place before each, and leaves out the page it went in', async () => {
  const s = await seeded();
  const kept = await goneWhileDrawing(s.api, (w) => w.again === false && w.at < w.order.length);
  assert.ok(kept !== null, 'the walk never kept its place');
  const pages = s.api.kernel.pages().filter((p) => p.nav !== null && p.slug !== 'home' && p.about === null);
  assert.ok(pages.length >= 4, 'the seed has too few pages to walk');
  const [went, first, second, third] = pages.map((p) => p.slug) as [string, string, string, string];
  const redo = [first, second, third];

  /* AN OBJECT WENT WHILE DRAWING `went` AGAIN, with three more found owed and none left on the rail. */
  s.api.kernel.setPref('slash', 'headlines.walk', { ...kept, at: kept.order.length, owed: [went, ...redo], drawing: went } satisfies Walk);

  /* EACH PAGE DRAWN AGAIN IS NAMED AS UNDER WAY BEFORE IT IS DRAWN, so a reset in it is not drawn again by the next. */
  const under: (string | undefined)[] = [];
  const fresh = await freshObject(s, (slug) => {
    if (redo.includes(slug)) under.push(walkOf(fresh.api)?.drawing);
  });
  const tick = await fresh.api.slashTick({ budget: onePage() });
  assert.equal((tick as { more?: true }).more, true, 'a tick of one page drew every page owed again');
  assert.equal(redo.reduce((n, slug) => n + (fresh.drawn.get(slug) ?? 0), 0), 1, 'a tick of one page drew more than one page again');
  /* A TICK THAT SPENT ITS SHARE KEEPS ITS PLACE WITH NO PAGE UNDER WAY, the pages still to draw again in it. */
  const between = walkOf(fresh.api);
  assert.equal(between?.drawing, undefined, 'a tick that spent its share left a page named as under way');
  assert.ok(between !== undefined && second !== undefined && between.owed.includes(second) && between.owed.includes(third), 'the place lost the pages still to draw again');
  assert.ok(tick.ran && tick.dropped.some((line) => line.startsWith(`${pages[0]!.title} was cut off`)), `the log said nothing of the page left out: ${JSON.stringify(tick)}`);

  const { ticks } = await tickThrough(fresh.api);
  assert.ok(ticks >= 2 && ticks < 2_000, `the rest took ${ticks} ticks`);
  assert.equal(fresh.drawn.get(went) ?? 0, 0, `${went} was drawn again after the object went in it`);
  for (const slug of redo) assert.equal(fresh.drawn.get(slug) ?? 0, 1, `${slug} was drawn again ${fresh.drawn.get(slug) ?? 0} times`);
  assert.deepEqual(under, redo, 'a page drawn again was not named as under way while it drew');
  assert.ok(fresh.heard.length <= 1, 'the walk asked more than once');
  assert.equal(walkOf(fresh.api), undefined, 'the walk kept its place after it ended');
});
