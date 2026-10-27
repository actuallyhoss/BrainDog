/**
 * A field a share hides is hidden from what is said about it too: the briefing's late and due cards, and the stale
 * line that counts how long since a thing was confirmed, each said the day the reader was not shown.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { sessionContext, type HeldAccess } from '../../host/src/auth.ts';
import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 22, 12);
const UNTIL = new Date(Date.UTC(2026, 11, 1, 12)).toISOString();
const owner = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true, provedAt: NOW } as CallContext;
const reg = (body: Record<string, unknown>) => ({ id: `register.${body.id as string}`, kind: 'register' as const, body: body as never });
const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T };
  assert.ok(x.ok, JSON.stringify(x));
  return x.value;
};

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  value(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAG', slug: 'the-yard', name: 'The Yard', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }));
  value(
    await api.kernel.install([
      reg({ id: 'bills', name: 'Bills', title: 'payee', fields: [{ id: 'payee', type: 'text', required: true }, { id: 'due', type: 'day', deadline: true }] }),
      reg({ id: 'facts', name: 'Facts', one: 'fact', title: 'what', fade: { field: 'confirmed_on', after: '90d' }, fields: [{ id: 'what', type: 'text', required: true }, { id: 'confirmed_on', type: 'day' }] }),
    ]),
  );
  sql.exec("INSERT INTO person (id, email, name, suspended_at) VALUES ('p_r', 'r@example.test', 'Rea', NULL)");
  value(await api.create({ register: 'bills', fields: { payee: 'Water', due: '2026-10-19' } }, owner));
  value(await api.create({ register: 'bills', fields: { payee: 'Rent', due: '2026-10-24' } }, owner));
  value(await api.create({ register: 'facts', fields: { what: 'Kiln vendor', confirmed_on: '2026-05-01' } }, owner));
  return { sql, api };
}

const asReader = (api: Awaited<ReturnType<typeof createRecordApi>>) =>
  sessionContext({ person: 'p_r', email: 'r@example.test', record: 'rec', provedAt: NOW }, api.kernel.access('p_r') as HeldAccess) as CallContext;

test('A READER THE DAYS ARE HIDDEN FROM IS TOLD NOTHING LATE, DUE OR UNCONFIRMED BY THEM', async () => {
  const { sql, api } = await record();
  value(await api.share({ share: { who: { kind: 'person', id: 'p_r' }, what: { lists: ['bills', 'facts'] }, can: 'view', hide: { bills: ['due'], facts: ['confirmed_on'] }, when: { until: UNTIL } } } as never, owner));
  const rea = asReader(api);
  const brief = JSON.stringify(await api.briefing({}, rea));
  assert.ok(!brief.includes('Water') && !brief.includes('Rent'), `the briefing told the hidden days: ${brief.slice(0, 400)}`);
  const stale = JSON.stringify(await api.stale({}, rea));
  assert.ok(!stale.includes('Kiln vendor'), `stale told the hidden day: ${stale.slice(0, 400)}`);
  sql.close();
});

test('AND A READER WHO SEES THEM IS STILL TOLD', async () => {
  const { sql, api } = await record();
  value(await api.share({ share: { who: { kind: 'person', id: 'p_r' }, what: { lists: ['bills', 'facts'] }, can: 'view', when: { until: UNTIL } } } as never, owner));
  const rea = asReader(api);
  assert.ok(JSON.stringify(await api.briefing({}, rea)).includes('Water'), 'a reader who sees the day was told nothing');
  assert.ok(JSON.stringify(await api.stale({}, rea)).includes('Kiln vendor'));
  sql.close();
});
