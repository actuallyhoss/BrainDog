/**
 * A project's page gets the model's line too (the thinking scope of 24 October, C4). A page per row's lead is its next
 * step, which the template fills in as words, so it named no figure and the night never asked about it. Now the night
 * asks about pages per row after the pages somebody wrote, from what their tiles count, and the page read carries the
 * line while those tiles still say it; a tile that moves takes the line away until the next ask.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext, type HeadlineInput, type SlashMeter, type SlashModel } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const OWNER: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };
const DAY = 86_400_000;
const T0 = Date.UTC(2026, 8, 1, 9);

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string } };
const value = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value as T;
};

const THINGS = {
  id: 'register.things',
  kind: 'register' as const,
  body: { id: 'things', name: 'Projects', title: 'name', fields: [{ id: 'name', type: 'text', required: true }, { id: 'next', type: 'text' }] } as never,
};
const TASKS = {
  id: 'register.tasks',
  kind: 'register' as const,
  body: {
    id: 'tasks',
    name: 'Tasks',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'thing', type: 'ref', to: 'things' },
      { id: 'state', type: 'enum', values: ['open', 'done'] },
    ],
    state: 'state',
    done: ['done'],
  } as never,
};
const OPEN = {
  id: 'metric.thing-open',
  kind: 'metric' as const,
  body: { metric: 'thing-open', name: 'Open', source: 'register.tasks', where: 'thing is {{it}}, state is open', value: { count: 'id' }, format: 'int', target: { gte: 0 }, window: '30d', compare: 'none' } as never,
};
/** A page per project, opening on its next step and a tile of its open work. */
const PROJECT = {
  id: 'page.project',
  kind: 'page' as const,
  body: {
    page: 'project',
    title: '{{name}}',
    for: { register: 'things' },
    nav: { section: 'Projects', order: 10 },
    requires: ['register.things', 'register.tasks'],
    blocks: [
      { kind: 'note', lead: true, span: 12, body: '{{next}}' },
      { kind: 'stat', span: 12, cells: [{ label: 'Open', metric: 'thing-open:{{name}}' }] },
    ],
  } as never,
};

const meter: SlashMeter = {
  hold: async () => ({ ok: true, value: { settle: () => {}, release: () => {} } }),
  background: async () => ({ ok: true, value: { settle: () => {}, release: () => {} } }),
};

test("A PROJECT'S PAGE IS ASKED ABOUT FROM ITS TILES, carries the line while they hold, and loses it when one moves", async () => {
  const heard: HeadlineInput[] = [];
  const model: SlashModel = {
    name: 'test model',
    draft: async () => ({ drafts: [] }),
    headline: async (input) => {
      heard.push(input);
      return { lines: Object.fromEntries(input.pages.map((p) => [p.page, `{{${p.figures.find((f) => f.id.startsWith('thing-open'))?.id}}} open, and the fit is next.`])) };
    },
  };
  const sql = openSqlite();
  const clock = fixedClock(T0);
  const api = await createRecordApi({ sql, clock, slashModel: model, slashMeter: meter });
  value(await api.kernel.install([THINGS, TASKS, OPEN, PROJECT]));
  value(await api.create({ register: 'things', fields: { name: 'Kiln', next: 'Sample the fit' } }, OWNER));
  value(await api.create({ register: 'tasks', fields: { what: 'Sample the fit', thing: 'things#1', state: 'open' } }, OWNER));
  value(await api.create({ register: 'tasks', fields: { what: 'Cut the pattern', thing: 'things#1', state: 'open' } }, OWNER));
  /* THE OWNER'S OWN USE ON FOUR DAYS, so Slash advises a record past its fortnight. */
  for (const [i, day] of [3, 5, 7, 9].entries()) {
    clock.set(T0 + day * DAY);
    value(api.kernel.update('tasks', 'tasks#1', { what: i % 2 === 0 ? 'Sample the fit.' : 'Sample the fit' }, { actor: 'p_owner', version: i + 1 }));
  }
  clock.set(T0 + 20 * DAY);
  const slug = (api.kernel.pages() as { slug: string; title: string }[]).find((p) => p.title === 'Kiln')!.slug;
  const lead = async (): Promise<{ body?: string; said?: string }> => value<{ blocks: { body?: string; said?: string }[] }>(await api.page({ slug }, OWNER)).blocks[0]!;

  assert.ok((await api.slashTick()).ran);
  /* ASKED, WITH ITS RULES' LINE AS THE PERSON READS IT AND THE TILE'S FIGURE, and nothing named from the whole list. */
  const asked = heard.flatMap((h) => h.pages).find((p) => p.page === slug);
  assert.ok(asked, 'the project page was not asked about');
  assert.equal(asked.rules, 'Sample the fit');
  assert.deepEqual(asked.figures.map((f) => [f.id, f.value]), [['thing-open:Kiln', '2']]);
  assert.equal(asked.items, undefined);
  assert.equal((await lead()).said, '2 open, and the fit is next.');

  /* A TASK IS DONE: the tile moves, the line is not sent, and the next ask writes one from the new figure. */
  value(api.kernel.update('tasks', 'tasks#2', { state: 'done' }, { actor: 'p_owner', version: 1 }));
  assert.equal((await lead()).said, undefined, 'a line written from another count was sent');
  clock.set(T0 + 21 * DAY);
  assert.ok((await api.slashTick()).ran);
  assert.equal((await lead()).said, '1 open, and the fit is next.');
  sql.close();
});
