/**
 * Headlines that name the person's own things, Home's line, and the one extra ask a day (`headlines.ts`, `index.ts`).
 *
 * WHAT THESE HOLD. Each page's ask is handed the titles of what is late or due on its lists and the first question about
 * them, and Home is one more page in the same ask, read from Today inside the record. Home's line is kept as
 * `headline.home` and answered on the read Home makes, `previewPage` of Today's body, while the reading it was written
 * from holds. A line with a number it was not handed is refused. When a page's figures move after the night's ask, the
 * same day asks once more, and never more than `HEADLINE_ASKS_DAY` headline asks are made in a day.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, HEADLINE_ASKS_DAY, type CallContext, type HeadlineInput, type SlashHeld, type SlashMeter, type SlashModel } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const OWNER: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };
const DAY = 86_400_000;
const HOUR = 3_600_000;
const T0 = Date.UTC(2026, 8, 1, 9);

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string } };
const value = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value as T;
};

/** Tasks with a day they are due by, which is what makes one late. */
const TASKS = {
  id: 'register.tasks',
  kind: 'register' as const,
  body: {
    id: 'tasks',
    name: 'Tasks',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'by', type: 'day', deadline: true },
      { id: 'state', type: 'enum', values: ['open', 'done'] },
    ],
    state: 'state',
    done: ['done'],
  } as never,
};
const DESK = {
  id: 'page.desk',
  kind: 'page' as const,
  body: {
    page: 'desk',
    title: 'Launch desk',
    nav: { section: 'Work', order: 10 },
    requires: ['register.tasks'],
    blocks: [
      { kind: 'note', lead: true, span: 12, body: '{{tasks.count}} step(s) in all.' },
      { kind: 'table', span: 12, source: 'register.tasks', empty: 'No steps yet.' },
    ],
  } as never,
};

/** Today's body as the app sends it to be drawn (`todayHome`), cut to its line and the work that is late. */
const TODAY = {
  page: 'today',
  title: 'Today',
  blocks: [
    { kind: 'note', lead: true, body: 'Nothing needs you right now.' },
    { kind: 'todo', heading: 'Late', icon: 'clock', source: 'register.tasks', where: 'state is open', columns: [{ field: 'what' }, { field: 'by' }], limit: 8, empty: 'Nothing is late.' },
  ],
};

const meterOf = () => {
  const rows: { kind: string; state: 'held' | 'settled' | 'released' }[] = [];
  const held = (kind: string): { ok: true; value: SlashHeld } => {
    const row: (typeof rows)[number] = { kind, state: 'held' };
    rows.push(row);
    return { ok: true, value: { settle: () => void (row.state = 'settled'), release: () => void (row.state = 'released') } };
  };
  const meter: SlashMeter = { hold: async (kind) => held(kind), background: async (kind) => held(`background:${kind}`) };
  return { rows, meter };
};

/** A stub model that answers each page `line(page)`, keeping what it was handed. */
const writing = (line: (page: HeadlineInput['pages'][number]) => string) => {
  const heard: HeadlineInput[] = [];
  const model: SlashModel = {
    name: 'test model',
    draft: async () => ({ drafts: [] }),
    headline: async (input) => {
      heard.push(input);
      return { lines: Object.fromEntries(input.pages.map((p) => [p.page, line(p)])) };
    },
  };
  return { heard, model };
};

async function record(model: SlashModel) {
  const sql = openSqlite();
  const clock = fixedClock(T0);
  const { rows, meter } = meterOf();
  const api = await createRecordApi({ sql, clock, slashModel: model, slashMeter: meter });
  assert.ok((await api.kernel.install([TASKS, DESK])).ok);
  /* ON THE NIGHT OF DAY 20: the EDF bill was due two days before, the kiln is due that day (the 21st), the clay later. */
  value(await api.create({ register: 'tasks', fields: { what: 'EDF bill', by: '2026-09-19', state: 'open' } }, OWNER));
  value(await api.create({ register: 'tasks', fields: { what: 'Fire the kiln', by: '2026-09-21', state: 'open' } }, OWNER));
  value(await api.create({ register: 'tasks', fields: { what: 'Order clay', by: '2026-10-30', state: 'open' } }, OWNER));
  clock.set(T0 + 20 * DAY);
  return { sql, clock, rows, api };
}

const homeSaid = async (api: Awaited<ReturnType<typeof record>>['api']): Promise<unknown> =>
  value<{ blocks: { said?: unknown }[] }>(await api.previewPage({ body: TODAY }, OWNER)).blocks[0]!.said;

test("HOME'S LINE NAMES THE LATE THING BY ITS TITLE, is kept as headline.home, and is answered on Today's read while its reading holds", async () => {
  const { heard, model } = writing((p) => (p.page === 'home' ? 'The EDF bill is late, and nothing else is.' : p.rules));
  const { api, sql } = await record(model);
  assert.ok((await api.slashTick()).ran);
  assert.equal(heard.length, 1);
  const home = heard[0]!.pages.find((p) => p.page === 'home');
  /* HANDED THEIR THINGS: the late task by its title, and how many need them, how many are late, how many are working. */
  assert.deepEqual(home?.items, [{ title: 'EDF bill', when: 'late' }]);
  assert.deepEqual(home?.figures.map((f) => [f.id, f.value]), [['needs-you', '1'], ['late', '1'], ['working', '0']]);
  assert.equal(home?.rules, '1 thing needs you, and it is late.');
  /* AND THE PAGE OVER TASKS IS HANDED WHAT IS LATE OR DUE ON IT, most pressing first, not only its figure. */
  assert.deepEqual(heard[0]!.pages.find((p) => p.page === 'desk')?.items, [
    { title: 'EDF bill', when: 'late' },
    { title: 'Fire the kiln', when: 'today' },
  ]);

  assert.equal((api.kernel.prefsOf('slash')['headline.home'] as { text: string }).text, 'The EDF bill is late, and nothing else is.');
  assert.equal(await homeSaid(api), 'The EDF bill is late, and nothing else is.');
  /* ONLY TODAY'S BODY CARRIES IT: another body previewed is drawn as written. */
  assert.equal(value<{ blocks: { said?: unknown }[] }>(await api.previewPage({ body: { ...TODAY, page: 'elsewhere' } }, OWNER)).blocks[0]!.said, undefined);

  /* THE BILL IS PAID: the reading moved, so the line naming it is not sent, and the rules speak. */
  value(await api.update({ register: 'tasks', seq: 1, patch: { state: 'done' } }, OWNER));
  assert.equal(await homeSaid(api), undefined);
  sql.close();
});

test("A HOME LINE WITH A NUMBER IT WAS NOT HANDED IS REFUSED, and Today's read carries nothing", async () => {
  const { model } = writing((p) => (p.page === 'home' ? 'The EDF bill is 2 days late.' : p.rules));
  const { api, sql } = await record(model);
  const out = await api.slashTick();
  assert.ok(out.ran);
  assert.ok(out.dropped.some((d) => /typed 2, where a number is written as the hole of its figure/u.test(d)), JSON.stringify(out.dropped));
  assert.equal(api.kernel.prefsOf('slash')['headline.home'], undefined);
  assert.equal(await homeSaid(api), undefined);
  sql.close();
});

test(`A FIGURE THAT MOVES THE SAME DAY IS ASKED ABOUT EXACTLY ONCE MORE, and headline asks stay within ${HEADLINE_ASKS_DAY} a day`, async () => {
  const { heard, model } = writing((p) => p.rules);
  const { api, clock, rows, sql } = await record(model);
  const headlineAsks = () => rows.filter((r) => r.kind === 'background:headline').length;
  const night = T0 + 20 * DAY;

  assert.ok((await api.slashTick()).ran);
  assert.equal(heard.length, 1);

  /* LATER THAT DAY, NOTHING MOVED: no ask. */
  clock.set(night + HOUR);
  assert.deepEqual(await api.slashTick(), { ran: false, why: 'today' });
  assert.equal(heard.length, 1, 'a page whose figures did not move was asked about again');

  /* A FIGURE MOVES: the tick that sees it notes when and asks nothing, so the writes of one sitting are one ask. */
  value(await api.create({ register: 'tasks', fields: { what: 'Box quote', by: '2026-11-01', state: 'open' } }, OWNER));
  clock.set(night + 2 * HOUR);
  await api.slashTick();
  assert.equal(heard.length, 1, 'a moved figure was asked about before its sitting had ended');
  /* AND THE FIRST TICK A QUARTER OF AN HOUR ON ASKS ONCE MORE, for what moved. */
  clock.set(night + 3 * HOUR);
  await api.slashTick();
  assert.equal(heard.length, 2, 'a moved figure was not asked about again that day');
  assert.equal(heard[1]!.pages.find((p) => p.page === 'desk')?.figures[0]?.value, '4');
  /* A TICK AFTER, with nothing new, asks nothing. */
  clock.set(night + 3.5 * HOUR);
  await api.slashTick();
  assert.equal(heard.length, 2);

  /* IT MOVES AGAIN: with a day's cap of several the second move is asked about too, once, however many ticks follow. */
  value(await api.create({ register: 'tasks', fields: { what: 'Glaze order', by: '2026-11-02', state: 'open' } }, OWNER));
  for (const h of [4, 6, 9]) {
    clock.set(night + h * HOUR);
    await api.slashTick();
  }
  assert.equal(heard.length, 3);
  assert.ok(headlineAsks() <= HEADLINE_ASKS_DAY);
  assert.ok(rows.every((r) => r.kind.startsWith('background:')), 'a headline spent one of the person’s asks');

  /* THE NEXT NIGHT ASKS AGAIN, from a fresh day's count. */
  const before = headlineAsks();
  clock.set(night + DAY);
  assert.ok((await api.slashTick()).ran);
  assert.equal(heard.length, 4);
  assert.equal(heard[3]!.pages.find((p) => p.page === 'desk')?.figures[0]?.value, '5');

  /* AND THE CAP ITSELF HOLDS: a figure moved until the day's asks are spent is asked about no more that day. */
  let at = night + DAY;
  for (let move = 0; move < HEADLINE_ASKS_DAY + 2; move++) {
    value(await api.create({ register: 'tasks', fields: { what: `Order ${String(move)}`, by: '2026-11-03', state: 'open' } }, OWNER));
    for (let tick = 0; tick < 2; tick++) {
      at += HOUR / 3;
      clock.set(at);
      await api.slashTick();
    }
  }
  assert.equal(headlineAsks() - before, HEADLINE_ASKS_DAY);
  sql.close();
});

test('A TICK THAT COMES IN WHILE THE NIGHT IS STILL ASKING asks nothing: the day’s ask is counted before the model answers', async () => {
  const heard: HeadlineInput[] = [];
  let answer: () => void = () => {};
  const model: SlashModel = {
    name: 'test model',
    draft: async () => ({ drafts: [] }),
    headline: async (input) => {
      heard.push(input);
      await new Promise<void>((resolve) => (answer = resolve));
      return { lines: Object.fromEntries(input.pages.map((p) => [p.page, p.rules])) };
    },
  };
  const { api, clock, sql } = await record(model);
  const night = api.slashTick();
  while (heard.length === 0) await new Promise((r) => setTimeout(r, 1));
  /* THE WORKER TICKS AFTER EVERY REQUEST, so another lands while the model is still writing the night's lines. */
  clock.set(T0 + 20 * DAY + HOUR);
  /* IT GOES ON FROM THE STEP THE LOOK KEPT, which is the headlines' walk: it files nothing, and the walk it found under way asks nothing. */
  const during = await api.slashTick();
  assert.deepEqual(during.ran ? during.filed : [], []);
  assert.equal(heard.length, 1, 'a tick during the night’s ask asked the same pages again');
  answer();
  assert.ok((await night).ran);
  assert.equal((api.kernel.prefsOf('slash')['headlines.asked'] as { asks: number }).asks, 1);
  sql.close();
});

test('A PAGE LINE THAT NAMES A THING is not sent to a grant that reads only some of the list it names', async () => {
  const { model } = writing((p) => (p.page === 'desk' ? 'The EDF bill is late, and the kiln is due today.' : p.rules));
  const { api, sql } = await record(model);
  assert.ok((await api.slashTick()).ran);
  const deskSaid = async (ctx: CallContext): Promise<unknown> => value<{ blocks: { said?: unknown }[] }>(await api.page({ slug: 'desk' }, ctx)).blocks[0]!.said;
  assert.equal(await deskSaid(OWNER), 'The EDF bill is late, and the kiln is due today.');
  /* EVERY TASK IS OPEN, so the narrowed count is the owner's and only the narrowing itself holds the line back. */
  const narrowed: CallContext = { ...OWNER, wheres: { tasks: { field: 'state', op: 'eq', value: 'open' } } as never };
  assert.equal(await deskSaid(narrowed), undefined);
  sql.close();
});
