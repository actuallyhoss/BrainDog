/**
 * One headline ask holds no more pages than their longest answers fit (`HEADLINE_ANSWER_TOKENS`, `lookAnswerMost`).
 *
 * WHY. The night's headline ask once carried every page in the rail, up to 24, and each may answer a whole look: a line,
 * a lead, an order of every key it was handed, a hide, a next and a group. On the Cloud that answer has 2,048 tokens and
 * shares them with the model's thinking, and on 23 October the night's asks stopped at that ceiling, so every page kept
 * its rules' line. RED BEFORE: one ask was handed all twelve pages below, whose longest answers run past the room.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, HEADLINE_ANSWER_TOKENS, HEADLINE_PAGES_MOST, type CallContext, type HeadlineInput, type HeadlinePage, type SlashModel } from '../src/index.ts';
import { lookAnswerMost } from '../src/compose-look.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const OWNER: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };
const DAY = 86_400_000;
const MINUTE = 60_000;
const T0 = Date.UTC(2026, 8, 1, 9);

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string } };
const value = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value as T;
};

/** A page at the bounds the ask hands: twelve blocks by their default key, five rows, and one part grouped by a field. */
const atTheBounds = (page: string): HeadlinePage => ({
  page,
  title: 'Harbourview',
  rules: '{{a}} things are open.',
  figures: [{ id: 'a', value: '3' }],
  blocks: Array.from({ length: 12 }, (_, i) => ({ key: `k${String(i).padStart(7, '0')}`, kind: i === 0 ? 'note' : 'cards', ...(i === 0 ? { lead: true as const } : {}), ...(i === 1 ? { group: ['state', 'owner'] } : {}) })),
  rows: Array.from({ length: 5 }, (_, i) => ({ row: `tasks#${100 + i}`, title: `Copperleaf step ${i}` })),
});

test('THE ONE ASK OVER EVERY PAGE COULD NEVER FIT THE CEILING, and one page at the bounds fits the room at least twice', () => {
  const most = lookAnswerMost(atTheBounds('harbourview-desk'));
  assert.ok(most * HEADLINE_PAGES_MOST > 2_048, `${HEADLINE_PAGES_MOST} pages answer up to ${most * HEADLINE_PAGES_MOST} tokens, which a 2,048 ceiling cuts off`);
  assert.ok(most * 2 <= HEADLINE_ANSWER_TOKENS, `one page answers up to ${most} tokens, so an ask may hold at least two`);
  /* HOME IS HANDED NO BLOCKS AND ANSWERS THE BARE LINE, so it costs a line's room and no more. */
  const home = lookAnswerMost({ page: 'home', title: 'Today', rules: 'Nothing waits.', figures: [{ id: 'needs-you', value: '0' }] });
  assert.ok(home < most / 2 && home > 0);
});

const TASKS = {
  id: 'register.tasks',
  kind: 'register' as const,
  body: {
    id: 'tasks',
    name: 'Tasks',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'state', type: 'enum', values: ['open', 'done'] },
    ],
    state: 'state',
    done: ['done'],
  } as never,
};

const DONE_STEPS = {
  id: 'metric.done-steps',
  kind: 'metric' as const,
  body: { metric: 'done-steps', name: 'Done steps', source: 'register.tasks', where: 'state is done', value: { count: 'id' }, format: 'int', target: { gte: 0 }, window: '30d', compare: 'none' } as never,
};

/** Twelve pages in the rail, each opening on a lead line from two figures, with six parts beside it. */
const PAGES = Array.from({ length: 12 }, (_, n) => ({
  id: `page.lantern-${n}`,
  kind: 'page' as const,
  body: {
    page: `lantern-${n}`,
    title: `Lanternfish ${n}`,
    nav: { section: 'Work', order: 10 + n },
    requires: ['register.tasks'],
    blocks: [
      { kind: 'note', lead: true, span: 12, body: '{{done-steps}} of {{tasks.count}} step(s) are done.' },
      ...Array.from({ length: 6 }, (_, i) => ({ kind: 'table', span: 12, source: 'register.tasks', heading: `Part ${i}`, empty: 'Nothing yet.' })),
    ],
  } as never,
}));

test('THE NIGHT ASKS AS MANY PAGES AS FIT, AND A LATER TICK OF THE DAY ASKS THE REST, so no answer runs past its room', async () => {
  const heard: HeadlineInput[] = [];
  const model: SlashModel = {
    name: 'test model',
    draft: async () => ({ drafts: [] }),
    headline: async (input) => {
      heard.push(input);
      return { lines: Object.fromEntries(input.pages.map((p) => [p.page, `{{${p.figures[0]!.id}}} steps are done.`])) };
    },
  };
  const sql = openSqlite();
  const clock = fixedClock(T0);
  const api = await createRecordApi({ sql, clock, slashModel: model });
  assert.ok((await api.kernel.install([TASKS, DONE_STEPS, ...PAGES])).ok);
  value(await api.create({ register: 'tasks', fields: { what: 'Sample the fit', state: 'open' } }, OWNER));
  value(await api.create({ register: 'tasks', fields: { what: 'Cut the pattern', state: 'done' } }, OWNER));
  /* THE OWNER'S OWN USE ON FIVE DAYS, so Slash advises a record past its fortnight (HD.410). */
  for (const [i, day] of [3, 5, 7, 9].entries()) {
    clock.set(T0 + day * DAY);
    value(api.kernel.update('tasks', 'tasks#1', { what: i % 2 === 0 ? 'Sample the fit.' : 'Sample the fit' }, { actor: 'p_owner', version: i + 1 }));
  }
  const night = T0 + 20 * DAY;
  clock.set(night);

  assert.ok((await api.slashTick()).ran);
  assert.equal(heard.length, 1);
  const first = heard[0]!.pages;
  const room = (pages: readonly HeadlinePage[]): number => pages.reduce((n, p) => n + lookAnswerMost(p), 0);
  assert.ok(first.length > 1 && first.length < PAGES.length, `the night asked ${first.length} of ${PAGES.length} pages`);
  assert.ok(room(first) <= HEADLINE_ANSWER_TOKENS, `the night's answer may run to ${room(first)} tokens`);
  /* IN THE RAIL'S ORDER, so the first pages a person reaches are the first written. */
  assert.deepEqual(first.map((p) => p.page), PAGES.slice(0, first.length).map((p) => p.body as unknown as { page: string }).map((p) => p.page));

  /* A LATER TICK NOTES THE PAGES LEFT OVER AS OWED, AND ONE PAST `HEADLINE_OWED_MS` ASKS THEM, each ask within its room. */
  for (let at = night + MINUTE; heard.flatMap((h) => h.pages).length < PAGES.length && at < night + DAY / 2; at += 16 * MINUTE) {
    clock.set(at);
    await api.slashTick();
  }
  const asked = heard.flatMap((h) => h.pages.map((p) => p.page));
  assert.deepEqual([...asked].sort(), PAGES.map((p) => (p.body as unknown as { page: string }).page).sort(), 'every page is asked once');
  for (const h of heard) assert.ok(room(h.pages) <= HEADLINE_ANSWER_TOKENS || h.pages.length === 1, `an ask's answer may run to ${room(h.pages)} tokens`);
  sql.close();
});
