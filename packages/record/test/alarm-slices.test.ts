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
  assert.deepEqual(await sliced.api.lintTick({ budget: onePage() }), { ran: false, why: 'today' });
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

/* R3 (review of 30 October): the walk was kept in memory alone, so an object reset while drawing one page began again
   from Home in the next, reached the same page and was reset again, and the day's look stalled on its headlines. */
test('A HEADLINES WALK WHOSE OBJECT WAS RESET MID-PAGE GOES ON PAST THAT PAGE IN THE NEXT OBJECT, and asks once', async () => {
  const s = await seeded();
  let kept: { order: string[]; at: number; again: boolean } | undefined;
  for (let ticks = 0; ticks < 2_000; ticks++) {
    const last = await s.api.slashTick({ budget: onePage() });
    kept = s.api.kernel.prefsOf('slash')['headlines.walk'] as typeof kept;
    if (kept !== undefined && kept.at >= 2) break;
    assert.equal((last as { more?: true }).more, true, 'the look ended before its headlines walk was kept');
  }
  assert.ok(kept !== undefined && kept.again === false, 'the walk never kept its place');
  /* THE PAGE BEING DRAWN WHEN THE OBJECT WENT: its place is already past it. */
  const bad = kept.order[kept.at - 1]!;

  /* A NEW OBJECT OVER THE SAME RECORD, with nothing in memory. */
  const { heard, model } = writing();
  const fresh = await createRecordApi({ sql: s.sql, clock: s.clock, slashModel: model });
  const seen: string[] = [];
  const kernel = fresh.kernel as unknown as { page: (...a: unknown[]) => unknown };
  const page = kernel.page;
  kernel.page = (...a: unknown[]) => {
    if (heard.length === 0) seen.push(String(a[0]));
    return page.apply(fresh.kernel, a);
  };
  let ticks = 0;
  let last: Awaited<ReturnType<typeof fresh.slashTick>>;
  do {
    last = await fresh.slashTick({ budget: onePage() });
    ticks += 1;
  } while ((last as { more?: true }).more === true && ticks < 2_000);
  kernel.page = page;
  assert.ok(ticks < 2_000, 'the look never ended in the new object');
  assert.ok(!seen.includes(bad), `the new object drew ${bad} again, the page its walk was drawing when the object went`);
  assert.ok(heard.length <= 1, 'the walk asked more than once');
  assert.equal(fresh.kernel.prefsOf('slash')['headlines.walk'], undefined, 'the walk kept its place after it ended');
});
