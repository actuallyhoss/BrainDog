/**
 * What reaches a screen of a look Slash composed, through the real record (ENG-B09), and the one number `context`
 * gains (AGT-C18 job c).
 *
 * A LOOK IS READ OVER THE PAGE AS IT READS WHEN IT IS WRITTEN, not as it read when the model was asked. The ask hands
 * only the parts the page drew, so a lead the model names was drawn then; a step finished while the model was
 * answering empties it, and the look that leads with it is refused. The whole answer is refused with it: the line the
 * same answer composed is not said, and the page keeps the line its rules wrote. `test/compose-rehearse-wired.test.ts`
 * holds the same for a page that prints a fault.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { staleNow } from '@braindog/kernel';

import { createRecordApi, lookRefusedKey, REFUSALS_MOST, type CallContext, type Context, type HeadlineInput, type SlashHeld, type SlashMeter, type SlashModel } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const OWNER: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };
const DAY = 86_400_000;
const T0 = Date.UTC(2026, 8, 1, 12);

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value?: unknown; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value as T;
};

const TASKS = {
  id: 'register.tasks',
  kind: 'register' as const,
  body: { id: 'tasks', name: 'Tasks', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'state', type: 'enum', values: ['open', 'done'] }], state: 'state', done: ['done'] } as never,
};

/** A page with a lead line, what is finished, what is open and all of it. Open is not the first part, so naming it leads. */
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
      { kind: 'table', heading: 'Finished', span: 12, source: 'register.tasks', where: 'state is done' },
      { kind: 'table', heading: 'Open', span: 12, source: 'register.tasks', where: 'state is open' },
      { kind: 'table', heading: 'Every step', span: 12, source: 'register.tasks', columns: [{ field: 'what' }] },
    ],
  } as never,
};

type Asked = HeadlineInput['pages'][number];
type Drawn = { key?: string; kind: string; heading?: string; drawn?: boolean; said?: string };
type Read = { blocks: Drawn[]; look?: { by?: string; lead?: string; hide?: string[] } };

/** The key the ask handed for the part under this heading. */
const keyOf = (p: Asked, heading: string): string => (p.blocks ?? []).find((b) => b.heading === heading)?.key ?? assert.fail(`${heading} was not handed`);

const held = (): { ok: true; value: SlashHeld } => ({ ok: true, value: { settle: () => {}, release: () => {} } });
const METER: SlashMeter = { hold: async () => held(), background: async () => held() };

/** A record with two steps finished and one open, and a model whose answer and whose moment are the test's to set. */
async function record() {
  const sql = openSqlite();
  const clock = fixedClock(T0);
  const heard: HeadlineInput[] = [];
  const set: { answer: (p: Asked) => unknown; meanwhile: () => void } = { answer: () => null, meanwhile: () => {} };
  const model: SlashModel = {
    name: 'test model',
    draft: async () => ({ drafts: [] }),
    headline: async (input) => {
      heard.push(input);
      const lines = Object.fromEntries(input.pages.map((p) => [p.page, set.answer(p)]));
      /* WHAT HAPPENS ON THE RECORD WHILE THE MODEL ANSWERS. */
      set.meanwhile();
      return { lines };
    },
  };
  const api = await createRecordApi({ sql, clock, slashModel: model, slashMeter: METER });
  assert.ok((await api.kernel.install([TASKS, DESK])).ok);
  for (const what of ['Sample the fit', 'Press the seams']) value(await api.create({ register: 'tasks', fields: { what, state: 'done' } }, OWNER));
  const open = value<{ id: string }>(await api.create({ register: 'tasks', fields: { what: 'Cut the pattern', state: 'open' } }, OWNER));
  clock.set(T0 + 20 * DAY);
  const move = (state: 'open' | 'done') => value(api.kernel.update('tasks', open.id, { state } as never, { actor: 'p_owner' }));
  const looks = () => api.kernel.declarations().filter((d) => d.kind === 'look');
  const page = async () => value<Read>(await api.page({ slug: 'desk' }, OWNER));
  const refused = () => (api.kernel.prefsOf('slash')[lookRefusedKey('desk')] ?? null) as { basis: string; times: number } | null;
  return { sql, clock, api, heard, set, move, looks, page, refused };
}

/** The line the model composes: the page's own figure in a sentence the rules did not write. */
const LINE = (p: Asked): string => `{{${p.figures[0]!.id}}} steps on the desk, and the pattern is next to cut.`;
const leadNote = (read: Read): Drawn => read.blocks.find((b) => b.kind === 'note') ?? assert.fail('no lead line');

test('A LOOK THAT LEADS WITH A PART THAT DRAWS NOTHING IS NOT WRITTEN, and the page keeps the line its rules wrote', async () => {
  const { sql, api, heard, set, move, looks, page, refused } = await record();
  set.answer = (p) => ({ headline: LINE(p), lead: keyOf(p, 'Open') });
  /* THE LAST OPEN STEP IS FINISHED WHILE THE MODEL ANSWERS, so the part it leads with reads nothing by the time it is written. */
  set.meanwhile = () => move('done');
  const out = await api.slashTick();
  assert.ok(out.ran);
  assert.equal(heard.length, 1);
  assert.equal(looks().length, 0, 'a look was written that leads the page with an empty part');
  const said = out.dropped.find((d) => /Launch desk/u.test(d) && /was not kept/u.test(d));
  assert.ok(said, JSON.stringify(out.dropped));
  assert.match(said, /Open leads the page and draws nothing\./u);
  assert.doesNotMatch(said, /[0-9A-HJKMNP-TV-Z]{26}|—|\{\{|\bk[0-9a-z]{7}\b/u);
  assert.equal(refused()?.times, 1);
  /* THE PAGE AS IT READS: arranged by its rules, and the line of the refused answer is not said over the lead. */
  const read = await page();
  assert.notEqual(read.look?.by, 'slash');
  assert.equal(leadNote(read).said, undefined, 'the line of a refused answer was said');
  sql.close();
});

test(`A SECOND REFUSAL FOR ONE BASIS WRITES NOTHING UNTIL THE BASIS MOVES: ${String(REFUSALS_MOST)} are held as a pref, and a clean look for the same basis is left`, async () => {
  const { sql, api, clock, set, move, looks, page, refused } = await record();
  set.answer = (p) => ({ headline: LINE(p), lead: keyOf(p, 'Open') });
  set.meanwhile = () => move('done');
  await api.slashTick();
  const basis = refused()?.basis;
  assert.equal(typeof basis, 'string');
  /* THE SAME BASIS, ASKED AGAIN: the step is opened and finished once more, so the count of steps never moved. The line
     pref is cleared so the page is owed the same ask again, as `compose-rehearse-wired.test.ts` does. */
  const again = async (day: number) => {
    move('open');
    api.kernel.setPref('slash', 'headline.desk', null);
    clock.set(T0 + day * DAY);
    return api.slashTick();
  };
  await again(21);
  assert.deepEqual(refused(), { basis, times: REFUSALS_MOST });
  assert.equal(looks().length, 0);
  /* A THIRD ANSWER FOR THAT BASIS WOULD PRINT CLEAN, and is still not written: the page is left to its rules. */
  set.meanwhile = () => {};
  const third = await again(22);
  assert.ok(third.ran);
  assert.ok(third.dropped.some((d) => /refused twice/u.test(d)), JSON.stringify(third.dropped));
  assert.equal(looks().length, 0);
  assert.deepEqual(refused(), { basis, times: REFUSALS_MOST });
  assert.equal(leadNote(await page()).said, undefined, 'a page left to its rules said the line of the answer it refused');
  /* ANOTHER STEP IS ADDED: the basis moved, the look is rehearsed afresh and written, and the count is forgotten. */
  value(await api.create({ register: 'tasks', fields: { what: 'Sew the hem', state: 'open' } }, OWNER));
  clock.set(T0 + 23 * DAY);
  const fourth = await api.slashTick();
  assert.ok(fourth.ran);
  assert.equal(looks().length, 1, JSON.stringify(fourth.dropped));
  /* AND ITS LINE IS SAID, now that a look for what it was composed from is written. */
  assert.equal(leadNote(await page()).said, '4 steps on the desk, and the pattern is next to cut.');
  assert.equal(refused(), null);
  sql.close();
});

test('A CLEAN LOOK WITH A LEAD AND A PART LEFT OUT IS WRITTEN, and the page reads under it with its line', async () => {
  const { sql, api, set, looks, page, refused } = await record();
  let lead = '';
  let hidden = '';
  set.answer = (p) => {
    lead = keyOf(p, 'Open');
    hidden = keyOf(p, 'Every step');
    return { headline: LINE(p), lead, hide: [hidden] };
  };
  const out = await api.slashTick();
  assert.ok(out.ran);
  assert.equal(looks().length, 1, JSON.stringify(out.dropped));
  const body = JSON.parse(looks()[0]!.body as unknown as string) as { by: string; lead?: string; hide?: string[]; headline?: string };
  assert.equal(body.by, 'slash');
  assert.equal(body.lead, lead);
  assert.deepEqual(body.hide, [hidden]);
  assert.equal(refused(), null);
  const read = await page();
  assert.equal(read.look?.by, 'slash');
  assert.equal(read.look?.lead, lead);
  assert.deepEqual(read.look?.hide, [hidden]);
  assert.equal(read.blocks.find((b) => b.heading === 'Every step')?.drawn, false);
  /* OPEN LEADS: the first part under the page's own line. */
  assert.equal(read.blocks.filter((b) => b.kind !== 'note' && b.drawn !== false)[0]?.heading, 'Open');
  assert.equal(leadNote(read).said, '3 steps on the desk, and the pattern is next to cut.');
  sql.close();
});

test('A REFUSAL IS OF THE ANSWER IT REFUSED: a later answer for the same basis that is a line and arranges nothing is said', async () => {
  const { sql, api, clock, set, move, looks, page, refused } = await record();
  set.answer = (p) => ({ headline: LINE(p), lead: keyOf(p, 'Open') });
  set.meanwhile = () => move('done');
  await api.slashTick();
  assert.equal(refused()?.times, 1);
  assert.equal(leadNote(await page()).said, undefined);
  /* THE SAME BASIS, ASKED AGAIN, and this time the model writes a line and leaves the page as its rules arrange it. */
  move('open');
  api.kernel.setPref('slash', 'headline.desk', null);
  clock.set(T0 + 21 * DAY);
  set.answer = (p) => `{{${p.figures[0]!.id}}} steps on the desk, and the hem is still to sew.`;
  set.meanwhile = () => {};
  const out = await api.slashTick();
  assert.ok(out.ran);
  assert.equal(looks().length, 0);
  /* THE COUNT FOR THE BASIS IS STILL HELD, for the next look composed from it, and it is not what stops a line. */
  assert.equal(refused()?.times, 1);
  assert.equal(leadNote(await page()).said, '3 steps on the desk, and the hem is still to sew.', JSON.stringify(out.dropped));
  sql.close();
});

/* ── `context.stale` ────────────────────────────────────────────────────── */

/** A run left waiting with a step forty days ago and a question open fifteen days, written where the finders read. */
function staled(sql: ReturnType<typeof openSqlite>, now: number): void {
  const left = new Date(now - 40 * DAY).toISOString();
  sql.exec(
    "INSERT INTO entry (id, register, seq, fields, state, version, created_at, updated_at) VALUES ('RUN9001', 'session', 9001, ?, 'handoff', 1, ?, ?)",
    JSON.stringify({ doing: 'Fit the launch page', state: 'handoff', started: left, last_seen: left, next: 'Ship it', next_at: left }),
    left,
    left,
  );
  sql.exec("INSERT INTO suggestion (id, body_kind, body, status, opened_by, opened_at) VALUES ('SGQ9001', 'options', '{}', 'open', 'p_owner', ?)", new Date(now - 15 * DAY).toISOString());
}

test('`context` ANSWERS ONE NUMBER, `stale`, WHICH IS WHAT THE READ `stale` LISTS THE SAME CALLER: 0 on a fresh record, and never what a narrower caller may not read', async () => {
  const { sql, clock, api } = await record();
  type Told = { lines: { kind: string; count: number }[]; count: number };
  const fresh = value<Context>(await api.context({}, OWNER));
  assert.equal(fresh.stale, 0);
  assert.equal(value<Told>(await api.stale({}, OWNER)).count, 0);
  staled(sql, clock.now());
  assert.ok(staleNow(sql, clock.now()) >= 2, 'the finders count the run and the question');
  const told = value<Told>(await api.stale({}, OWNER));
  assert.ok(told.count >= 1, JSON.stringify(told.lines));
  const here = value<Context>(await api.context({}, OWNER));
  /* THE NUMBER AN AGENT STARTS WITH IS THE NUMBER IT IS THEN TOLD ONE BY ONE, never a second count beside it. */
  assert.equal(here.stale, told.count);
  /* A CALLER HELD TO ONE LIST is counted nothing from the lists they may not read. */
  const member = { principal: { kind: 'person', id: 'p_member', level: 'read' }, registers: ['tasks'] } as CallContext;
  const narrow = value<Context>(await api.context({}, member));
  assert.equal(narrow.stale, 0);
  sql.close();
});
