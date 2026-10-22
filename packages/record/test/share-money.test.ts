/**
 * What a share shows of the money, said before it is made (as decided on 21 October): `sharePreview` names the
 * money lists a share reaches, whether every amount is hidden, and for a project its own figures, the first amount its
 * row says and each money figure its page's tiles name for it, as the record reads them.
 *
 * WHAT IS HELD: a project shared whole shows Kiln's "Earned in a year" and its "Still to come in", in the page's order,
 * each said as the record writes money; Hide amounts says hidden and no figure; a share that reaches no amount says no
 * money; a figure over a list the share does not reach is not said; and a money figure that reads nothing is said as
 * nothing (`said: null`), so a project with no bills still says what is still to come in.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import type { SharePreview } from '../src/methods/sharing.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 21, 12);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true };

const reg = (body: Record<string, unknown>) => ({ id: `register.${body.id as string}`, kind: 'register' as const, body: body as never });
const metric = (body: Record<string, unknown>) => ({ id: `metric.${body.metric as string}`, kind: 'metric' as const, body: body as never });
const MONEY = { format: 'money.GBP', target: { gte: 0 }, window: '30d', compare: 'none' };

const DECLS = [
  reg({ id: 'things', name: 'Projects', title: 'name', scopes: { repos: 'repos' }, fields: [{ id: 'name', type: 'text', required: true }, { id: 'repos', type: 'list', of: 'text' }, { id: 'revenue', label: 'Earned in a year', type: 'money' }, { id: 'before', label: 'Earned the year before', type: 'money' }] }),
  reg({ id: 'tasks', name: 'Tasks', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'thing', type: 'ref', to: 'things', scope: {} }] }),
  reg({ id: 'bills', name: 'Bills', title: 'payee', fields: [{ id: 'payee', type: 'text', required: true }, { id: 'amount', type: 'money', required: true }, { id: 'thing', type: 'ref', to: 'things', scope: {} }] }),
  reg({ id: 'costs', name: 'Costs', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'cost', type: 'money' }, { id: 'thing', type: 'ref', to: 'things' }] }),
  reg({ id: 'notes', name: 'Notes', title: 'body', fields: [{ id: 'body', type: 'text', required: true }] }),
  metric({ metric: 'project-owed', name: 'Owed', source: 'register.bills', where: 'thing is {{it}}', value: { sum: 'amount' }, ...MONEY }),
  /* OVER A LIST WITH NO PROJECT FIELD A SHARE READS BY, so a project share never reaches it. */
  metric({ metric: 'project-cost', name: 'Costs a year', source: 'register.costs', where: 'thing is {{it}}', value: { sum: 'cost' }, ...MONEY }),
  metric({ metric: 'project-open', name: 'Open', source: 'register.tasks', where: 'thing is {{it}}', value: { count: 'what' }, format: 'int', target: { gte: 0 }, window: '30d', compare: 'none' }),
  {
    id: 'page.project',
    kind: 'page' as const,
    body: {
      page: 'project',
      title: '{{name}}',
      for: { register: 'things' },
      requires: ['register.things', 'register.tasks', 'register.bills', 'register.costs'],
      blocks: [
        {
          kind: 'stat',
          key: 'glance',
          cells: [
            { metric: 'project-open:{{name}}', label: 'Open' },
            { metric: 'project-cost:{{name}}', label: 'Costs a year' },
            { metric: 'project-owed:{{name}}', label: 'Still to come in' },
          ],
        },
      ],
    } as never,
  },
];

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value?: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value as T;
};

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  value(await api.kernel.install(DECLS));
  value(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }));
  const gbp = (amount: number) => ({ amount, currency: 'GBP' });
  const kiln = value<{ id: string }>(await api.create({ register: 'things', fields: { name: 'Kiln', revenue: gbp(1_840_000), before: gbp(1_412_000) } }, owner));
  const mill = value<{ id: string }>(await api.create({ register: 'things', fields: { name: 'Mill' } }, owner));
  value(await api.create({ register: 'tasks', fields: { what: 'Glaze test', thing: kiln.id } }, owner));
  value(await api.create({ register: 'bills', fields: { payee: 'Studio North', amount: gbp(305_000), thing: kiln.id } }, owner));
  value(await api.create({ register: 'bills', fields: { payee: 'Type Weekly', amount: gbp(100_000), thing: kiln.id } }, owner));
  value(await api.create({ register: 'bills', fields: { payee: 'Mill Co', amount: gbp(999_900), thing: mill.id } }, owner));
  value(await api.create({ register: 'costs', fields: { what: 'Hosting', cost: gbp(12_000), thing: kiln.id } }, owner));
  value(await api.create({ register: 'notes', fields: { body: 'Kiln temperatures' } }, owner));
  sql.exec("INSERT INTO person (id, email, name, suspended_at) VALUES ('p_pri', 'priya@example.test', 'Priya', NULL)");
  return { api, kiln: kiln.id, mill: mill.id };
}

const preview = async (api: Awaited<ReturnType<typeof record>>['api'], share: Record<string, unknown>): Promise<SharePreview> =>
  value<SharePreview>(await api.sharePreview({ share: { effect: 'allow', who: { kind: 'person', id: 'p_pri' }, can: 'view', ...share } } as never, owner));

test("A PROJECT SHARED WHOLE SAYS ITS OWN MONEY: what its row leads with, then its page's figures over what the share reaches", async () => {
  const { api, kiln } = await record();
  const got = await preview(api, { what: { project: kiln } });
  assert.deepEqual(got.money, {
    lists: ['Projects', 'Bills'],
    hidden: false,
    /* THE ROW'S FIRST AMOUNT, NOT EVERY ONE, then Still to come in: Costs a year is over a list no project share reaches,
       and Open is no money. */
    figures: [
      { label: 'Earned in a year', said: 'GBP 18,400.00' },
      { label: 'Still to come in', said: 'GBP 4,050.00' },
    ],
  });
});

test('HIDE AMOUNTS SAYS HIDDEN AND NO FIGURE, and a share that reaches no amount says no money', async () => {
  const { api, kiln, mill } = await record();
  assert.deepEqual((await preview(api, { what: { project: kiln }, hide: { types: ['money'] } })).money, { lists: ['Projects', 'Bills'], hidden: true, figures: [] });
  assert.equal((await preview(api, { what: { lists: ['notes'] } })).money, null);
  /* A PROJECT WHOSE ROW SAYS NO AMOUNT LEADS WITH NONE, and its lists with amounts are still said, the row's own among
     them, since an amount written there tomorrow is one she will read. */
  const millSaid = await preview(api, { what: { project: mill } });
  assert.deepEqual(millSaid.money, { lists: ['Projects', 'Bills'], hidden: false, figures: [{ label: 'Still to come in', said: 'GBP 9,999.00' }] });
  /* AND A LIST SHARED WHOLE SAYS ITS MONEY WITH NO FIGURE: figures are a project's. */
  assert.deepEqual((await preview(api, { what: { lists: ['bills'] } })).money, { lists: ['Bills'], hidden: false, figures: [] });
});

test('A MONEY FIGURE THAT READS NOTHING IS SAID AS NOTHING: a project with no bills says nothing is still to come in', async () => {
  const { api } = await record();
  const loom = value<{ id: string }>(await api.create({ register: 'things', fields: { name: 'Loom', revenue: { amount: 250_000, currency: 'GBP' } } }, owner));
  value(await api.create({ register: 'tasks', fields: { what: 'Warp it', thing: loom.id } }, owner));
  const got = await preview(api, { what: { project: loom.id } });
  assert.deepEqual(got.money?.figures, [
    { label: 'Earned in a year', said: 'GBP 2,500.00' },
    { label: 'Still to come in', said: null },
  ]);
});
