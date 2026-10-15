/**
 * One list, one offer, one place: the pen and Slash's growing list never offer the same list a page at once, and an
 * answer given in one holds in the other (USE-B03 job 7).
 *
 * WHAT WAS SEEN BEFORE: on a record twenty days old whose Tasks grew on three days, `boot`'s pen held `page:tasks` and a
 * plain press of Slash filed "Give Tasks a page of its own?" on Decide beside it, so the same question stood in two
 * places, and turning one down left the other asking.
 *
 * THE PEN'S SIDE HOLDS HERE (`emergent.ts` `slashAsked`): a list Slash asked a page for, waiting or turned down, is not
 * offered one in the pen. SLASH'S SIDE (`slash.ts` `noticeWhole` reading `pen.dismissed` and what the pen holds) and
 * Decide's (declining Slash's page question writes `page:<list>` into `pen.dismissed`) are other files'. Their cases run
 * as `todo` until those lines land, and then the `todo` comes off.
 *
 * WHAT SLASH LEAVES TO THE PEN WAITS IN THE ONE QUEUE (ENG-B14): three at most are shown, and the rest wait their turn,
 * asked in no second place (`emergent-queue.test.ts`).
 *
 * USER, THEN ADD-ON, THEN AN OFFER (`29 §6`: "User > pack > derived"). A page the person wrote carries no `pack`, an
 * add-on's carries its pack, and a page the pen offers carries `origin: derived` and `derived_from` (`block-keys.ts`
 * `PAGE_KEYS`). One list with the person's page and an add-on's draws the person's, the add-on's next, and the pen offers
 * it no page; and a saved view of that list opened often is offered its place after both, never in front of either.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Declaration } from '@braindog/kernel';

import { createRecordApi, type Boot, type CallContext } from '../src/index.ts';
import { pageSignatures, pageSpokenFor, signatureOf } from '../src/emergent.ts';
import { VIEWS_SECTION } from '../src/emergent-views.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const OWNER: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };
const DAY = 86_400_000;
const T0 = Date.UTC(2026, 8, 1, 9);

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};
type Filed = { filed: { id: string; question: string }[]; skipped: { question: string; why: string }[] };

const TASKS: Declaration = {
  id: 'register.tasks',
  kind: 'register',
  body: { id: 'tasks', name: 'Tasks', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] },
} as never;

/** A record `ageDays` old whose Tasks grew by six on three separate days in the last month, and no page draws it. */
async function growing(ageDays = 20) {
  const sql = openSqlite();
  const clock = fixedClock(T0);
  const api = await createRecordApi({ sql, clock });
  value(await api.kernel.install([TASKS]));
  for (const day of [0, ageDays - 3, ageDays - 3, ageDays - 2, ageDays - 2, ageDays - 1]) {
    clock.set(T0 + day * DAY);
    value(await api.create({ register: 'tasks', fields: { what: `Step on day ${day}` } }, OWNER));
  }
  /* AND THE FIRST STEP EDITED BY HAND ON DAY 5: the owner's own use on five days, so Slash advises it (HD.410). */
  clock.set(T0 + 5 * DAY);
  value(api.kernel.update('tasks', 'tasks#1', { what: 'Step on day 0, checked' }, { actor: 'p_owner', version: 1 }));
  clock.set(T0 + ageDays * DAY);
  return { sql, clock, api };
}

type Api = Awaited<ReturnType<typeof growing>>['api'];
const penOf = async (api: Api): Promise<string[]> => value<Boot>(await api.boot(OWNER)).pen.map((i) => i.id);
const press = async (api: Api): Promise<Filed> => value<Filed>(await api.slashPropose({}, OWNER));
const asksForTasks = (out: Filed): { id: string; question: string }[] => out.filed.filter((f) => f.question.startsWith('Give Tasks a page of its own?'));
/** Where Tasks is offered a page now: the pen, and each of Slash's questions about it still waiting on Decide. */
const placesOf = async (api: Api, sql: ReturnType<typeof openSqlite>): Promise<string[]> => [
  ...(await penOf(api)).filter((id) => (pageSignatures('tasks') as readonly string[]).includes(id)).map(() => 'pen'),
  ...sql
    .all<{ body: string }>("SELECT body FROM suggestion WHERE opened_by = 'slash' AND status = 'open'")
    .filter((s) => s.body.includes('"requires":["register.tasks"]'))
    .map(() => 'Decide'),
];

test('ONE SIGNATURE: the pen and Slash name a list\'s page the same way, and either a held or a dismissed one speaks for it', () => {
  assert.equal(signatureOf('page', 'tasks'), 'page:tasks');
  assert.deepEqual(pageSignatures('tasks'), ['page:tasks', 'week:tasks']);
  assert.equal(pageSpokenFor('tasks', new Set(['week:tasks'])), true, 'a week offer held did not speak for the list');
  assert.equal(pageSpokenFor('tasks', new Set(), new Set(['page:tasks'])), true, 'a dismissal did not speak for the list');
  assert.equal(pageSpokenFor('tasks', new Set(['page:tasks-done', 'block:tasks:calendar:tasks'])), false, 'another subject spoke for Tasks');
});

test('ONE PLACE: once Slash files a page for a growing list on Decide, the pen stops offering it', async () => {
  const { sql, api } = await growing();
  assert.deepEqual(await penOf(api), ['page:tasks'], 'the control failed: the pen did not offer Tasks before Slash was pressed');

  const out = await press(api);
  if (asksForTasks(out).length > 0) assert.deepEqual(await penOf(api), [], 'Tasks was offered by the pen and by Slash at once');
  assert.deepEqual(await placesOf(api, sql), asksForTasks(out).length > 0 ? ['Decide'] : ['pen'], 'Tasks was offered a page in more than one place');
  sql.close();
});

test('DECLINED STAYS DECLINED: Slash\'s page turned down on Decide is not offered again by the pen, that day or a week on', async () => {
  const { sql, clock, api } = await growing();
  /* SLASH ASKS ONLY WHERE THE PEN DOES NOT HOLD THE OFFER: here the pen is off while Slash asks, and on again after. */
  value(await api.setPref({ key: 'pen.suggest', value: false }, OWNER));
  const asked = asksForTasks(await press(api));
  assert.equal(asked.length, 1, 'the control failed: Slash did not ask for a page for Tasks');
  value(await api.decide({ id: asked[0]!.id, resolved_as: 'wont-fix', reason: 'Not now.' }, OWNER));
  value(await api.setPref({ key: 'pen.suggest', value: null }, OWNER));

  assert.deepEqual(await penOf(api), [], 'a page turned down on Decide came back in the pen');
  clock.set(T0 + 27 * DAY);
  for (const i of [1, 2, 3]) value(await api.create({ register: 'tasks', fields: { what: `Later ${i}` } }, OWNER));
  assert.deepEqual(await penOf(api), [], 'a page turned down on Decide came back in the pen a week on');
  sql.close();
});

test('A LIST A PAGE ALREADY DRAWS IS OFFERED NO PAGE BY EITHER: the person\'s page is the one drawn', async () => {
  const { sql, api } = await growing();
  value(
    await api.kernel.install([
      { id: 'page.my-tasks', kind: 'page', body: { page: 'my-tasks', title: 'My tasks', blocks: [{ kind: 'table', source: 'register.tasks', empty: 'Nothing yet.' }] } } as never,
    ]),
  );
  assert.deepEqual((await penOf(api)).filter((id) => (pageSignatures('tasks') as readonly string[]).includes(id)), []);
  assert.deepEqual(asksForTasks(await press(api)), [], 'Slash asked for a second page of a list a page already draws');
  sql.close();
});


test('NOT NOW IN THE PEN HOLDS ON SLASH: a dismissed page:tasks is never filed on Decide', async () => {
  const { sql, clock, api } = await growing();
  value(await api.setPref({ key: 'pen.dismissed', value: ['page:tasks'] }, OWNER));
  assert.deepEqual(await penOf(api), []);
  assert.deepEqual(asksForTasks(await press(api)), [], 'Slash filed the page the person dismissed in the pen');
  clock.set(T0 + 27 * DAY);
  assert.deepEqual(asksForTasks(await press(api)), [], 'Slash filed the dismissed page a week on');
  sql.close();
});

test('WHILE THE PEN HOLDS THE OFFER, SLASH DOES NOT DRAFT IT: the offer stays where the person is', async () => {
  const { sql, api } = await growing();
  assert.deepEqual(asksForTasks(await press(api)), [], 'Slash filed a page the pen already offers');
  assert.deepEqual(await penOf(api), ['page:tasks']);
  sql.close();
});

test('NO ON DECIDE IS NOT NOW IN THE PEN: declining Slash\'s page writes page:tasks into pen.dismissed', async () => {
  const { sql, api } = await growing();
  value(await api.setPref({ key: 'pen.suggest', value: false }, OWNER));
  const asked = asksForTasks(await press(api));
  assert.equal(asked.length, 1);
  value(await api.decide({ id: asked[0]!.id, resolved_as: 'wont-fix', reason: 'Not now.' }, OWNER));
  const prefs = value<Boot>(await api.boot(OWNER)).me.prefs;
  assert.ok(prefs?.['pen.dismissed']?.includes('page:tasks'), `pen.dismissed holds ${JSON.stringify(prefs?.['pen.dismissed'] ?? [])}`);
  sql.close();
});

/** A page over Tasks: the person's (no `pack`), an add-on's (`pack`), or a saved view under Views. */
const tasksPage = (slug: string, title: string, nav: { section: string; order: number }, pack?: string): Declaration =>
  ({
    id: `page.${slug}`,
    kind: 'page',
    ...(pack ? { pack } : {}),
    body: { page: slug, title, nav, requires: ['register.tasks'], blocks: [{ kind: 'table', source: 'register.tasks', empty: 'Nothing yet.' }] },
  }) as never;
const MY_TASKS = tasksPage('my-tasks', 'My tasks', { section: 'Tasks', order: 10 });
const CHORES = tasksPage('chore-board', 'Chore board', { section: 'Tasks', order: 20 }, 'chore-kit');
/** Where the rail draws the pages over Tasks: in its section, by the order each declares. */
const railOf = async (api: Api): Promise<string[]> =>
  value<Boot>(await api.boot(OWNER))
    .pages.filter((p) => p.list === 'tasks' && p.nav !== null && p.nav.section !== VIEWS_SECTION)
    .sort((a, b) => a.nav!.order - b.nav!.order)
    .map((p) => p.slug);
const offeredForTasks = async (api: Api): Promise<string[]> =>
  value<Boot>(await api.boot(OWNER)).pen.filter((i) => i.register === 'tasks').map((i) => i.id);

test('AN ADD-ON\'S PAGE BEATS AN OFFER: alone it takes the offer\'s place, and beside the person\'s it is drawn next', async () => {
  const control = await growing();
  assert.deepEqual(await offeredForTasks(control.api), ['page:tasks'], 'the control failed: Tasks with no page was offered none');
  control.sql.close();

  const alone = await growing();
  value(await alone.api.kernel.install([CHORES]));
  assert.deepEqual(await offeredForTasks(alone.api), [], 'Tasks was offered a page beside the one its add-on gives it');
  alone.sql.close();

  const { sql, api } = await growing();
  value(await api.kernel.install([CHORES]));
  value(await api.kernel.install([MY_TASKS]));
  assert.deepEqual(await railOf(api), ['my-tasks', 'chore-board'], 'the person\'s page was not drawn first and the add-on\'s next');
  assert.deepEqual(await offeredForTasks(api), [], 'Tasks was offered a page beside the person\'s and the add-on\'s');
  assert.deepEqual(asksForTasks(await press(api)), [], 'Slash asked for a page of a list two pages already draw');
  sql.close();
});

test('A VIEW\'S PLACE NEVER PUSHES IN FRONT: a saved view opened often is offered the place after the person\'s page and the add-on\'s', async () => {
  const { sql, clock, api } = await growing();
  value(await api.kernel.install([MY_TASKS, CHORES, tasksPage('urgent', 'Urgent', { section: VIEWS_SECTION, order: 900 })]));
  for (const day of [16, 17, 18, 19, 20]) {
    clock.set(T0 + day * DAY);
    value(api.kernel.observe([{ kind: 'page.render', subject: 'urgent' }]));
  }
  const place = value<Boot>(await api.boot(OWNER)).pen.find((i) => i.id === signatureOf('place', 'urgent'));
  assert.ok(place, `the view opened five times was not offered its place: the pen held ${JSON.stringify(await offeredForTasks(api))}`);
  assert.deepEqual(place.change.to.body.nav, { section: 'Tasks', order: 30 });

  value(await api.kernel.install([{ id: place.change.to.id, kind: 'page', body: place.change.to.body } as never]));
  assert.deepEqual(await railOf(api), ['my-tasks', 'chore-board', 'urgent'], 'the kept place moved a page in front of it');
  assert.deepEqual(await offeredForTasks(api), [], 'a place kept was offered again');
  sql.close();
});
