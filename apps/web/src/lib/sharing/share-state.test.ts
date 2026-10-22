/**
 * The Share sheet as data (sharing plan slice 11): what somebody chooses in the sheet becomes the share JSON the record
 * keeps, and the sentence the sheet draws before the record answers is the one `sharePreview` answers.
 *
 * AGAINST A REAL RECORD over `node:sqlite`, loaded by a runtime URL as `change-line-real.test.ts` loads it, so the
 * sentence is held to the record's own and not to a copy of it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Share } from '@braindog/kernel';

import { chipsFor } from './templates.ts';
import {
  chipPressed,
  countSaid,
  offersOf,
  ready,
  sentenceOf,
  sharesOf,
  startOf,
  withPicked,
  type Decls,
  type SheetState,
  type Subject,
} from './share-state.ts';

/* LOADED BY A RUNTIME URL so the web's typecheck does not walk the record's sources, which other packages own. */
const at = (p: string) => new URL(`../../../../../packages/${p}`, import.meta.url).href;
const { createRecordApi } = await import(at('record/src/index.ts'));
const { openSqlite } = await import(at('kernel/test/sqlite.ts'));

const NOW = Date.UTC(2026, 9, 20, 12);
const DAY = 86_400_000;

const BODIES = {
  things: { id: 'things', name: 'Things', title: 'name', fields: [{ id: 'name', type: 'text', required: true }, { id: 'repos', type: 'list', of: 'text' }], scopes: { repos: 'repos' } },
  tasks: {
    id: 'tasks',
    name: 'Tasks',
    one: 'task',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'thing', type: 'ref', to: 'things', scope: {} },
      { id: 'stage', type: 'enum', values: ['Doing', 'Review', 'Done'] },
      { id: 'rate', type: 'money' },
    ],
  },
  money: { id: 'money', name: 'Money', title: 'payee', fields: [{ id: 'payee', type: 'text', required: true }, { id: 'amount', type: 'money', required: true }] },
};
const DECLS: Decls = BODIES;

const owner = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true, provedAt: NOW };

type R = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string } };
const value = <T>(r: unknown): T => {
  const x = r as R;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value as T;
};

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: { now: () => NOW } });
  value(await api.kernel.install(Object.values(BODIES).map((body) => ({ id: `register.${body.id}`, kind: 'register', body }))));
  value(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }));
  const kiln = value<{ id: string }>(await api.create({ register: 'things', fields: { name: 'Kiln' } }, owner));
  const mill = value<{ id: string }>(await api.create({ register: 'things', fields: { name: 'Mill' } }, owner));
  const glaze = value<{ id: string; seq: number }>(await api.create({ register: 'tasks', fields: { what: 'Glaze test', thing: kiln.id, stage: 'Review' } }, owner));
  value(await api.create({ register: 'tasks', fields: { what: 'Fire the kiln', thing: kiln.id, stage: 'Doing' } }, owner));
  value(await api.create({ register: 'tasks', fields: { what: 'Oil the mill', thing: mill.id, stage: 'Review' } }, owner));
  sql.exec('INSERT INTO person (id, email, name, suspended_at) VALUES (?, ?, ?, NULL)', 'p_pri', 'priya@example.test', 'Priya');
  value(await api.invite({ person: 'p_pri', name: 'Priya', level: 'read' }, owner));
  return { api, kiln: kiln.id, glaze };
}

/* PRIYA IS ON HIS TEAM HERE, a Viewer of the whole record (`record`), so her amounts are shown unless he hides them. */
const PRIYA = { kind: 'person', id: 'p_pri', name: 'Priya', team: true } as const;

test('THE SHEET BECOMES THE SHARE JSON: Priya can edit tasks in Kiln for 30 days, and only what was chosen is written', () => {
  const kiln: Subject = { kind: 'project', register: 'things', seq: 1, id: 'e_kiln', name: 'Kiln' };
  let s: SheetState = withPicked(startOf(kiln), PRIYA, NOW);
  assert.deepEqual(s.until, { kind: 'none' }, 'somebody on the record is shared with until it is stopped');
  s = { ...s, can: 'edit', what: { kind: 'list', list: 'tasks' }, until: { kind: 'days30' } };
  assert.deepEqual(sharesOf(s, kiln, NOW, DECLS), [
    { effect: 'allow', who: { kind: 'person', id: 'p_pri' }, what: { project: 'e_kiln', lists: ['tasks'] }, can: 'edit', when: { until: new Date(NOW + 30 * DAY).toISOString() } },
  ]);

  /* THE SWITCHES AWAY FROM THEIR DEFAULTS, and only those: agents off, delete off at Edit, weekday hours, once, Amounts. */
  s = { ...s, withAgents: false, remove: false, weekdays: true, once: true, hide: { amounts: true, fields: {} }, until: { kind: 'day', day: '2026-12-01' } };
  assert.deepEqual(sharesOf(s, kiln, NOW, DECLS)[0], {
    effect: 'allow',
    who: { kind: 'person', id: 'p_pri' },
    what: { project: 'e_kiln', lists: ['tasks'] },
    can: 'edit',
    caps: { agents: false, delete: false },
    hide: { types: ['money'] },
    when: { until: '2026-12-01T23:59:59.000Z', hours: { days: [1, 2, 3, 4, 5], from: '09:00', to: '18:00' }, once: true },
  });
  /* DELETE IS NOT A VIEWER'S TO LOSE, so it is not written below Edit. */
  assert.equal(sharesOf({ ...s, can: 'view' }, kiln, NOW, DECLS)[0]!.caps?.delete, undefined);
  /* NAMED FIELDS BESIDE AMOUNTS are the named ones and every money field the browser knows. */
  assert.deepEqual(sharesOf({ ...s, hide: { amounts: true, fields: { tasks: ['stage'] } } }, kiln, NOW, DECLS)[0]!.hide, { tasks: ['stage', 'rate'], money: ['amount'] });
});

test('AN EMAIL ENDS IN 30 DAYS, a condition is a list and its tree, a row is its id, and nothing is ready half-chosen', () => {
  const tasks: Subject = { kind: 'list', list: 'tasks', name: 'Tasks' };
  let s = startOf(tasks);
  assert.equal(ready(s, tasks), false, 'ready with nobody to share with');
  s = withPicked(s, { kind: 'email', email: ' Priya@Studio.co ' }, NOW);
  assert.deepEqual(s.until, { kind: 'day', day: '2026-11-19' });
  s = { ...s, what: { kind: 'where', where: null } };
  assert.equal(ready(s, tasks), false, 'ready before the condition was said');
  s = { ...s, can: 'comment', what: { kind: 'where', where: { field: 'stage', is: 'Review' } } };
  /* AN ADDRESS IS OUTSIDE HIS TEAM, so its amounts start hidden (the owner's call of 21 October). */
  assert.deepEqual(sharesOf(s, tasks, NOW, DECLS), [
    {
      effect: 'allow',
      who: { kind: 'email', id: 'priya@studio.co' },
      what: { list: 'tasks', where: { field: 'stage', is: 'Review' } },
      can: 'comment',
      hide: { types: ['money'] },
      when: { until: '2026-11-19T23:59:59.000Z' },
    },
  ]);
  assert.equal(ready(withPicked(s, { kind: 'email', email: 'priya' }, NOW), tasks), false, 'ready with an address that is not one');

  const row: Subject = { kind: 'row', list: 'tasks', seq: 1, id: 'e_glaze', name: 'Glaze test' };
  assert.deepEqual(sharesOf(withPicked(startOf(row), PRIYA, NOW), row, NOW, DECLS)[0]!.what, { list: 'tasks', rows: ['e_glaze'] });
});

test("A CHIP WRITES ITS TEMPLATE'S BUNDLE, its allow first and carrying the sheet's choices, offered only where it can be filled", () => {
  const kiln: Subject = { kind: 'project', register: 'things', seq: 1, id: 'e_kiln', name: 'Kiln' };
  const tasks: Subject = { kind: 'list', list: 'tasks', name: 'Tasks' };
  assert.deepEqual(chipsFor(offersOf(kiln)).map((t) => t.id), ['accountant', 'contractor', 'assistant']);
  assert.deepEqual(chipsFor(offersOf(tasks)).map((t) => t.id), ['accountant', 'assistant', 'reviewer']);

  const contractor = chipPressed(withPicked(startOf(kiln), PRIYA, NOW), 'contractor', NOW);
  assert.equal(contractor.can, 'edit');
  assert.equal(contractor.remove, false, "Contractor's delete starts off");
  assert.deepEqual(sharesOf(contractor, kiln, NOW, DECLS), [
    { effect: 'allow', who: { kind: 'person', id: 'p_pri' }, what: { project: 'e_kiln' }, can: 'edit', caps: { delete: false }, when: { until: new Date(Date.UTC(2026, 10, 19)).toISOString().slice(0, 10) + 'T23:59:59.000Z' } },
    { effect: 'deny', who: { kind: 'person', id: 'p_pri' }, what: { lists: { has: 'money' } }, can: 'view' },
  ]);
  /* PRESSED AGAIN, IT LETS GO, and the sheet makes one share again. */
  assert.equal(sharesOf(chipPressed(contractor, 'contractor', NOW), kiln, NOW, DECLS).length, 1);

  const reviewer = chipPressed(withPicked(startOf(tasks), PRIYA, NOW), 'reviewer', NOW);
  assert.equal(ready(reviewer, tasks), false, 'Reviewer shared before its condition was said');
  const said = { ...reviewer, what: { kind: 'where' as const, where: { field: 'stage', is: 'Review' } } };
  assert.deepEqual(sharesOf(said, tasks, NOW, DECLS)[0]!.what, { list: 'tasks', where: { field: 'stage', is: 'Review' } });
  assert.equal(sharesOf(said, tasks, NOW, DECLS)[0]!.can, 'comment');
});

test("THE SHEET'S SENTENCE IS sharePreview's, and its count line is drawn from sharePreview's counts", async () => {
  const { api, kiln, glaze } = await record();
  const preview = async (share: Share) => value<{ sentence: string; lists: { list: string; name: string; rows: number }[] }>(await api.sharePreview({ share }, owner));

  const project: Subject = { kind: 'project', register: 'things', seq: 1, id: kiln, name: 'Kiln' };
  const list: Subject = { kind: 'list', list: 'tasks', name: 'Tasks' };
  const row: Subject = { kind: 'row', list: 'tasks', seq: glaze.seq, id: glaze.id, name: 'Glaze test' };
  const cases: [Subject, SheetState][] = [
    [project, { ...withPicked(startOf(project), PRIYA, NOW), can: 'edit', what: { kind: 'list', list: 'tasks' }, until: { kind: 'day', day: '2026-12-01' } }],
    [project, withPicked(startOf(project), PRIYA, NOW)],
    [list, { ...withPicked(startOf(list), PRIYA, NOW), can: 'comment', weekdays: true }],
    [list, { ...withPicked(startOf(list), { kind: 'email', email: 'ana@studio.co' }, NOW), what: { kind: 'where', where: { field: 'stage', is: 'Review' } } }],
    [row, { ...withPicked(startOf(row), PRIYA, NOW), once: true }],
  ];
  const said: string[] = [];
  for (const [subject, s] of cases) {
    const shares = sharesOf(s, subject, NOW, DECLS);
    assert.equal(shares.length, 1);
    const answer = await preview(shares[0]!);
    assert.equal(sentenceOf(shares, s, subject, NOW, DECLS), answer.sentence);
    said.push(answer.sentence);
  }
  assert.deepEqual(said, [
    'Priya can edit tasks in Kiln until 1 Dec.',
    'Priya can view everything in Kiln.',
    'Priya can comment on tasks on weekdays 9 to 6.',
    'ana@studio.co can view some tasks until 19 Nov.',
    'Priya can view Task 1 once, for a day.',
  ]);

  /* THE COUNT: two of Kiln's tasks, and the list's own word for one. */
  const [subject, s] = cases[0]!;
  const counted = await preview(sharesOf(s, subject, NOW, DECLS)[0]!);
  assert.equal(countSaid(s.with!, subject, counted.lists, DECLS), "Priya will see 2 tasks now, and new ones as they're added.");
  const one = await preview(sharesOf(cases[3]![1], list, NOW, DECLS)[0]!);
  assert.equal(countSaid(cases[3]![1].with!, list, one.lists, DECLS), "ana@studio.co will see 2 tasks now, and new ones as they're added.");
  assert.equal(countSaid(PRIYA, list, [{ list: 'tasks', name: 'Tasks', rows: 1 }], DECLS), "Priya will see 1 task now, and new ones as they're added.");
  assert.equal(countSaid(PRIYA, row, [{ list: 'tasks', name: 'Tasks', rows: 1 }], DECLS), null, 'a row shared gains no more');

  /* A CHIP'S BUNDLE IS ONE SENTENCE, its denies after it. */
  const bundle = chipPressed(withPicked(startOf(list), PRIYA, NOW), 'accountant', NOW);
  assert.equal(sentenceOf(sharesOf(bundle, list, NOW, DECLS), bundle, list, NOW, DECLS), 'Priya can view money lists until 18 Jan. No keys.');
});

test('SHARING IS PLUS\'S ON FREE AND CLOUD, and an unknown plan leaves the sheet to open', async () => {
  const { needsPlus } = await import('./may-share.ts');
  const rec = (plan: string) => ({ open: true, records: [{ slug: 'kiln', plan }] });
  assert.equal(needsPlus(rec('free'), 'kiln'), true);
  assert.equal(needsPlus(rec('cloud'), 'kiln'), true);
  assert.equal(needsPlus(rec('plus'), 'kiln'), false);
  assert.equal(needsPlus({ ...rec('free'), open: false }, 'kiln'), false);
  assert.equal(needsPlus(rec('free'), 'other'), false);
  assert.equal(needsPlus(null, 'kiln'), false);
});
