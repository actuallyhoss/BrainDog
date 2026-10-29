/**
 * The pen as a view of the one queue: "max 3 waiting" (HD.224), "every proposal states a deadline"
 * (HD.579), "a recommendation lands in the holding pen §4 already defines".
 *
 * WHAT WAS SEEN BEFORE: the pen ranked its own offers to 24 and showed three and any list opened lately beside them, so
 * the rail said "4 suggested" where the Slash page listed seven. Now `boot`'s pen is what `queueOf(recommend(...))`
 * holds: three at most, each with the day it lapses, on a real record.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Declaration } from '@braindog/kernel';

import { createRecordApi, type Boot, type CallContext } from '../src/index.ts';
import { LAPSE_DAYS, WAITING_MOST } from '../src/design-agent.ts';
import { PEN_SHOWN, penFor, penQueued, penRanked, type PenDeps } from '../src/emergent.ts';
import { PROJECTS } from '../../../fixtures/names.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const OWNER: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };
const DAY = 86_400_000;
const T0 = Date.UTC(2026, 8, 1, 9);
const dayOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const listOf = (id: string, name: string): Declaration =>
  ({ id: `register.${id}`, kind: 'register', body: { id, name, title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } }) as never;

/** Five lists that grow, by five to nine entries on three separate days of the last month, and none drawn by a page. */
const GROWING = ['anvils', 'barrels', 'crates', 'drums', 'easels'] as const;

async function fiveGrowing() {
  const sql = openSqlite();
  const clock = fixedClock(T0);
  const api = await createRecordApi({ sql, clock });
  value(await api.kernel.install(GROWING.map((id) => listOf(id, id.charAt(0).toUpperCase() + id.slice(1)))));
  for (const [at, id] of GROWING.entries())
    for (let i = 0; i < 5 + at; i++) {
      clock.set(T0 + (10 + (i % 3)) * DAY);
      value(await api.create({ register: id, fields: { what: `${PROJECTS[i % PROJECTS.length]} ${i + 1}` } }, OWNER));
    }
  clock.set(T0 + 20 * DAY);
  return { sql, clock, api };
}

type Api = Awaited<ReturnType<typeof fiveGrowing>>['api'];
const penOf = async (api: Api) => value<Boot>(await api.boot(OWNER)).pen;
const deps = (api: Api, sql: ReturnType<typeof openSqlite>, nowMs: number, more: Partial<PenDeps> = {}): PenDeps => ({
  kernel: api.kernel,
  reads: () => true,
  pages: api.kernel.pages(),
  dismissed: new Set(),
  use: { sql, nowMs },
  ...more,
});

test('FIVE LISTS GROW: three wait at most, the ones that grew most, each saying the day it lapses fourteen days on', async () => {
  const { sql, clock, api } = await fiveGrowing();
  const pen = await penOf(api);
  assert.equal(PEN_SHOWN, WAITING_MOST);
  assert.deepEqual(pen.map((i) => i.id), ['page:easels', 'page:drums', 'page:crates'], 'the queue did not hold the three that grew most, strongest first');
  const lapses = dayOf(clock.now() + LAPSE_DAYS * DAY);
  assert.equal(LAPSE_DAYS, 14);
  for (const item of pen) {
    assert.equal(item.lapses, lapses, `${item.id} did not lapse fourteen days on`);
    assert.match(item.lapses, /^\d{4}-\d{2}-\d{2}$/u);
    assert.doesNotMatch(`${item.title} ${item.why}`, /—|\brows?\b|ULID|#/u);
  }
  assert.equal(pen[0]!.title, 'Easels', 'a page offer lost its list\'s name as its title');
  assert.equal(pen[0]!.why, 'Easels grew by 9 in the last thirty days, and no page shows it yet.', 'the reason was not the recommender\'s');

  /* WHAT SLASH YIELDS is every offer the pen makes, the shown ones first, so the two waiting their turn are asked nowhere else. */
  assert.deepEqual(penRanked(deps(api, sql, clock.now())).map((i) => i.id), ['page:easels', 'page:drums', 'page:crates', 'page:barrels', 'page:anvils']);
  sql.close();
});

test('A LIST A PAGE DRAWS IS NOT OFFERED A PAGE, and the next that grows takes its place', async () => {
  const { sql, clock, api } = await fiveGrowing();
  value(
    await api.kernel.install([
      { id: 'page.my-easels', kind: 'page', body: { page: 'my-easels', title: 'My easels', blocks: [{ kind: 'table', source: 'register.easels', empty: 'Nothing yet.' }] } } as never,
    ]),
  );
  const pen = await penOf(api);
  assert.deepEqual(pen.map((i) => i.id), ['page:drums', 'page:crates', 'page:barrels']);
  assert.ok(!penRanked(deps(api, sql, clock.now())).some((i) => i.id === 'page:easels'), 'a list with a page was held for a page');
  sql.close();
});

test('DISMISSED STAYS GONE: a list that grows a little more after its offer is dismissed is not offered again', async () => {
  const { sql, clock, api } = await fiveGrowing();
  value(await api.setPref({ key: 'pen.dismissed', value: ['page:easels'] }, OWNER));
  assert.deepEqual((await penOf(api)).map((i) => i.id), ['page:drums', 'page:crates', 'page:barrels'], 'the next did not take its turn');

  /* EASELS GROWS BY THREE MORE, far less than the basis it was turned down at would need to move. */
  for (const i of [1, 2, 3]) value(await api.create({ register: 'easels', fields: { what: `Later ${i}` } }, OWNER));
  clock.set(clock.now() + DAY);
  const pen = await penOf(api);
  assert.ok(!pen.some((i) => i.id === 'page:easels'), 'a dismissed offer came back when its list grew');
  assert.equal(pen.length, 3);
  sql.close();
});

test('A LAPSED OFFER IS SIMPLY NOT SHOWN: an open one past its day gives up its place, and one still waiting keeps its day', async () => {
  const { sql, clock, api } = await fiveGrowing();
  const now = clock.now();
  const held = { class: 'arrange' as const, rank: 4009, basis: 'grows@9' };
  const yesterday = dayOf(now - DAY);
  const late = penQueued(deps(api, sql, now, { open: [{ key: 'page:easels', ...held, lapses: yesterday }] }));
  assert.deepEqual(late.waiting.map((i) => i.id), ['page:drums', 'page:crates', 'page:barrels'], 'a lapsed offer was still shown');
  assert.deepEqual(late.lapsed, ['page:easels']);
  assert.ok(late.ranked.some((i) => i.id === 'page:easels'), 'a lapsed offer was let go to Slash, to be asked in a second place');

  /* SHOWN A WEEK AGO, IT KEEPS THE DAY IT WAS GIVEN: waiting does not push its day out. */
  const given = dayOf(now + 7 * DAY);
  const open = penFor(deps(api, sql, now, { open: [{ key: 'page:easels', ...held, lapses: given }] }));
  assert.equal(open[0]?.id, 'page:easels');
  assert.equal(open[0]?.lapses, given, 'an open offer was given a new day');
  assert.equal(open[1]?.lapses, dayOf(now + LAPSE_DAYS * DAY));
  sql.close();
});

test('A LIST THE PERSON HAS OPEN WAITS WITH THE REST: opening the fourth makes no fourth, and every one shown is one Slash yields', async () => {
  const { sql, clock, api } = await fiveGrowing();
  value(await api.list({ register: 'anvils' }, OWNER));
  const pen = await penOf(api);
  assert.equal(pen.length, 3, 'an opened list was shown past the three');
  const ranked = penRanked(deps(api, sql, clock.now())).map((i) => i.id);
  assert.deepEqual(pen.filter((i) => !ranked.includes(i.id)), [], 'the pen shows an offer Slash does not yield');
  sql.close();
});

test('A LIST THAT HOLDS ENTRIES AND DOES NOT GROW IS STILL OFFERED, below every list that grows', async () => {
  const { sql, clock, api } = await fiveGrowing();
  value(await api.kernel.install([listOf('flasks', 'Flasks')]));
  value(await api.create({ register: 'flasks', fields: { what: 'One flask' } }, OWNER));
  const ranked = penRanked(deps(api, sql, clock.now()));
  assert.equal(ranked.at(-1)?.id, 'page:flasks', 'a list that does not grow outranked one that does');
  assert.equal(ranked.at(-1)?.why, 'Flasks opens as a plain list of 1 entry. A page of its own would lay it out.');
  assert.ok(!(await penOf(api)).some((i) => i.id === 'page:flasks'));
  sql.close();
});
