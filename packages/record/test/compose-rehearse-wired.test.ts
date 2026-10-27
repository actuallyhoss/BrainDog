/**
 * The rehearsal, reached by the record's own nightly ask (`compose-rehearse.ts` wired in `index.ts`).
 *
 * THROUGH THE REAL RECORD: `slashTick` asks a model that arranges a page, and the look it answers is laid over the page
 * as it reads now and read as the page lint reads a page, before anything is written. One over a page that would print
 * a fault (here a cell holding a raw time) is not written, is said in the tick's log in a person's words, and is
 * counted against the basis it was composed from; after two for one basis the page is left to its rules. A look that
 * prints clean is written as before.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, lookRefusedKey, REFUSALS_MOST, type CallContext, type HeadlineInput, type SlashHeld, type SlashMeter, type SlashModel } from '../src/index.ts';
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
  body: { id: 'tasks', name: 'Tasks', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'seen', type: 'text' }, { id: 'state', type: 'enum', values: ['open', 'done'] }], state: 'state', done: ['done'] } as never,
};

/** A page with a lead line, the open steps and all of them. */
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
      { kind: 'table', heading: 'Open', span: 12, source: 'register.tasks', where: 'state is open', empty: 'Nothing open.' },
      { kind: 'table', heading: 'Every step', span: 12, source: 'register.tasks', columns: [{ field: 'what' }, { field: 'seen' }], empty: 'No steps yet.' },
    ],
  } as never,
};

/** When a step was last seen, kept as a raw time, which a page prints as it is. */
const RAW = '2026-10-07T12:00:00Z';

/** A model that drafts nothing and arranges each page it is handed: the same blocks, the last one first after the lead. */
const arranging = () => {
  const heard: HeadlineInput[] = [];
  const model: SlashModel = {
    name: 'test model',
    draft: async () => ({ drafts: [] }),
    headline: async (input) => {
      heard.push(input);
      return {
        lines: Object.fromEntries(
          input.pages.map((p) => {
            const keys = (p.blocks ?? []).map((b) => b.key);
            return [p.page, { headline: `{{${p.figures[0]!.id}}} steps in all.`, order: [keys[0]!, ...keys.slice(1).reverse()] }];
          }),
        ),
      };
    },
  };
  return { heard, model };
};

/** A meter that counts a background ask, which is the only allowance a headline ask is made on. */
const held = (): { ok: true; value: SlashHeld } => ({ ok: true, value: { settle: () => {}, release: () => {} } });
const METER: SlashMeter = { hold: async () => held(), background: async () => held() };

async function record(seen: string) {
  const sql = openSqlite();
  const clock = fixedClock(T0);
  const { heard, model } = arranging();
  const api = await createRecordApi({ sql, clock, slashModel: model, slashMeter: METER });
  assert.ok((await api.kernel.install([TASKS, DESK])).ok);
  const first = value<{ id: string }>(await api.create({ register: 'tasks', fields: { what: 'Sample the fit', seen, state: 'open' } }, OWNER));
  clock.set(T0 + 20 * DAY);
  const looks = () => api.kernel.declarations().filter((d) => d.kind === 'look').length;
  return { sql, clock, api, heard, looks, first };
}

test('A LOOK OVER A PAGE THAT WOULD PRINT A FAULT IS NOT WRITTEN: the tick says why in names, and the refusal is counted for its basis', async () => {
  const { sql, api, heard, looks } = await record(RAW);
  const out = await api.slashTick();
  assert.ok(out.ran);
  assert.equal(heard.length, 1);
  assert.equal(looks(), 0, 'a look was written over a page that prints a raw time');
  const said = out.dropped.find((d) => /Launch desk/u.test(d) && /was not kept/u.test(d));
  assert.ok(said, JSON.stringify(out.dropped));
  assert.doesNotMatch(said, /[0-9A-HJKMNP-TV-Z]{26}|—|\{\{/u);
  const kept = api.kernel.prefsOf('slash')[lookRefusedKey('desk')] as { basis: string; times: number };
  assert.equal(kept.times, 1);
  assert.equal(typeof kept.basis, 'string');
  /* THE PAGE STILL READS, under its rules. */
  assert.ok((await api.page({ slug: 'desk' }, OWNER)).ok);
  sql.close();
});

test(`AFTER ${String(REFUSALS_MOST)} REFUSALS FOR ONE BASIS THE PAGE IS LEFT TO ITS RULES, and a new basis is rehearsed again`, async () => {
  const { sql, api, clock, looks, first } = await record(RAW);
  await api.slashTick();
  /* THE SAME BASIS, ASKED AGAIN: counted on. The line pref is cleared so the page is owed the same ask again. */
  const again = async (day: number) => {
    api.kernel.setPref('slash', 'headline.desk', null);
    clock.set(T0 + day * DAY);
    return api.slashTick();
  };
  await again(21);
  assert.equal((api.kernel.prefsOf('slash')[lookRefusedKey('desk')] as { times: number }).times, REFUSALS_MOST);
  const third = await again(22);
  assert.ok(third.ran);
  assert.ok(third.dropped.some((d) => /refused twice/u.test(d)), JSON.stringify(third.dropped));
  assert.equal(looks(), 0);
  /* THE TIME IS WRITTEN AS A DAY AND ANOTHER STEP IS ADDED: the page prints clean, the basis moved, and the look is written and
     the count forgotten. */
  value(api.kernel.update('tasks', first.id, { seen: '7 October' } as never, { actor: 'p_owner' }));
  value(await api.create({ register: 'tasks', fields: { what: 'Cut the pattern', state: 'open' } }, OWNER));
  clock.set(T0 + 23 * DAY);
  const fourth = await api.slashTick();
  assert.ok(fourth.ran);
  assert.equal(looks(), 1, JSON.stringify(fourth.dropped));
  assert.equal(api.kernel.prefsOf('slash')[lookRefusedKey('desk')] ?? null, null);
  sql.close();
});

test('A LOOK THAT PRINTS CLEAN IS WRITTEN AS BEFORE, with nothing counted', async () => {
  const { sql, api, looks } = await record('7 October');
  const out = await api.slashTick();
  assert.ok(out.ran);
  assert.equal(looks(), 1, JSON.stringify(out.dropped));
  assert.equal(api.kernel.prefsOf('slash')[lookRefusedKey('desk')] ?? null, null);
  sql.close();
});
