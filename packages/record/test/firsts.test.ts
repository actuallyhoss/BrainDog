/**
 * The record's firsts (`firsts.ts`): the first hello the door keeps and the first briefing that answered a card, each
 * written once, and `firsts` answering both to the host and to nobody else.
 *
 * WHAT MUST HOLD. A second hello or a second briefing an hour on leaves the first time standing; a hello `heard`
 * refuses keeps nothing; a briefing with no card, or one the host reads for itself, is not a first; and the pref
 * holds the instant alone, never who it was.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Entry } from '@braindog/kernel';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { FIRSTS, firsts, markFirst } from '../src/firsts.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 14, 9);
const HOUR = 3_600_000;

const BILLS = {
  id: 'register.bills',
  kind: 'register' as const,
  body: {
    id: 'bills',
    name: 'Bills',
    title: 'name',
    state: 'status',
    done: ['paid'],
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'due', type: 'day', deadline: true },
      { id: 'status', type: 'enum', values: ['open', 'paid'], default: 'open' },
    ],
  } as never,
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const host: CallContext = { principal: { kind: 'system', id: 'funnel' } };
const agent = (token: string): CallContext => ({
  principal: { kind: 'token', id: token, scope: 'write', person: 'p_1', level: 'owner' },
  session: { client_id: `c-${token}`, agent: 'claude', client: 'claude-code' },
});

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

type Firsts = { agent: number | null; brief: number | null };

async function record() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  value(await api.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-kiln', name: 'The Kiln', tz: 'UTC', locale: 'en', owner: { id: 'p_1', email: 'wren@example.com', name: 'Wren' } }));
  value(await api.kernel.install([BILLS] as never));
  const id = value<{ id: string }>(await api.createToken({ scope: 'write', label: 'Kiln laptop' }, owner)).id;
  value(await api.attach({ source: 'startup' }, agent(id)));
  const read = async (): Promise<Firsts> => value<Firsts>(await api.firsts({}, host));
  return { api, sql, clock, id, read };
}

test('A FRESH RECORD HAS NEITHER FIRST, and only the host is answered them', async () => {
  const { api, sql, read } = await record();
  assert.deepEqual(await read(), { agent: null, brief: null });
  const no = (await api.firsts({}, owner)) as { ok: boolean; refusal?: { code: string; at?: string; fix: string } };
  assert.equal(no.ok, false);
  assert.equal(no.refusal?.code, 'FORBIDDEN');
  assert.ok(!no.refusal!.fix.includes('—'), 'an em dash in a refusal a person reads');
  sql.close();
});

test('THE FIRST HELLO THE DOOR KEEPS IS THE FIRST AGENT, and a second one later leaves it standing', async () => {
  const { api, sql, clock, id, read } = await record();
  value(await api.doorHeard({ kind: 'listed' }, agent(id)));
  assert.equal((await read()).agent, null, 'a mark that is not hello was taken for one');
  assert.equal(((await api.heard({ kind: 'hello' }, agent(id))) as { ok: boolean }).ok, false);
  assert.equal((await read()).agent, null, 'a hello heard refuses was kept as the first');
  value(await api.doorHeard({ kind: 'hello', build: '2026.10.14+abc1234', client: 'claude-code' }, agent(id)));
  assert.equal((await read()).agent, NOW);
  clock.advance(HOUR);
  value(await api.doorHeard({ kind: 'hello' }, agent(id)));
  assert.equal((await read()).agent, NOW, 'the second hello moved the first');
  const kept = sql.one<{ value: string }>("SELECT value FROM pref WHERE person_id = ? AND key = 'first.agent'", FIRSTS)!.value;
  assert.deepEqual(JSON.parse(kept), { at: new Date(NOW).toISOString() }, 'the first keeps the instant and nothing of who');
  sql.close();
});

test('THE FIRST BRIEFING THAT ANSWERS A CARD IS THE FIRST BRIEF, never one with none or one the host read', async () => {
  const { api, sql, clock, read } = await record();
  value(await api.briefing({}, owner));
  assert.equal((await read()).brief, null, 'a briefing with no card was taken for the first');
  value<Entry>(api.kernel.create('bills', { name: 'Glaze order', due: '2026-10-13' } as never, { actor: 'p_1' }));
  const forHost = value<{ cards: unknown[] }>(await api.briefing({}, host));
  assert.ok(forHost.cards.length > 0, 'the late bill is a card');
  assert.equal((await read()).brief, null, 'the host reading the briefing was taken for somebody’s first');
  clock.advance(HOUR);
  value(await api.briefing({}, owner));
  assert.equal((await read()).brief, NOW + HOUR);
  clock.advance(HOUR);
  value(await api.briefing({}, owner));
  assert.equal((await read()).brief, NOW + HOUR, 'the second briefing moved the first');
  sql.close();
});

test('markFirst WRITES ONCE AND firsts READS A HAND-WRITTEN VALUE AS NONE', () => {
  const kept: Record<string, Record<string, unknown>> = {};
  const prefs = {
    prefsOf: (p: string) => ({ ...(kept[p] ?? {}) }),
    setPref: (p: string, key: string, v: unknown) => void ((kept[p] ??= {})[key] = v),
  };
  assert.equal(markFirst(prefs, 'first.brief', NOW), true);
  assert.equal(markFirst(prefs, 'first.brief', NOW + HOUR), false);
  assert.deepEqual(firsts(prefs), { agent: null, brief: NOW });
  kept[FIRSTS]!['first.agent'] = { at: 'yesterday' };
  assert.equal(firsts(prefs).agent, null);
});
