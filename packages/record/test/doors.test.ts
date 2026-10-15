/**
 * The record says where a door is and which doors it has.
 *
 * MEASURED BEFORE THIS WAS WRITTEN: `ingestMint` answered `{ ingest, token }`, and no read in the record answered the
 * record id the address needs, so on a live record the owner's press never yielded a URL and the Shortcut screen showed
 * a bare token with `copy.shortcutNoAddress`. The screen could also mint one ingest, named in the app, because nothing
 * listed the doors a record declares. Doors are set up at run time by a person or an agent, so the app has to learn
 * them from the record rather than from its own source.
 *
 * `<rec>` IS `kernel.identity().id` ON BOTH HOSTS, read before this answered it: the self-host compares the URL's
 * segment to it (`apps/selfhost/src/server.ts` `arrivalDoor`), and the Worker reaches the object named by the segment,
 * which `provision` created under the same id it gave `createRecord` and the Directory (`apps/worker/src/index.ts`).
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createHash } from 'node:crypto';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { ROUTES, handlersFor } from '../../host/src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 22, 12);
const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';

const owner: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };

const NOTES = {
  id: 'register.notes',
  kind: 'register' as const,
  body: { id: 'notes', name: 'Notes', title: 'body', fields: [{ id: 'body', type: 'text', required: true }] } as never,
};

/** A door somebody set up at run time: nothing about it is in the shipped packs. */
const door = (id: string, extra: Record<string, unknown> = {}) => ({
  id: `ingest.${id}`,
  kind: 'ingest' as const,
  body: {
    ingest: id,
    channel: 'webhook',
    verify: { kind: 'path' },
    description: `Texts posted by ${id}.`,
    map: { body: { path: '$.text', type: 'text' } },
    writes: { register: 'notes' },
    ...extra,
  } as never,
});

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  const made = await api.createRecord({ id: REC, slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_owner', email: 'ada@example.com', name: 'Ada' } });
  assert.ok(made.ok, JSON.stringify(made));
  const put = await api.kernel.install([NOTES, door('my-phone'), door('open-hook', { verify: undefined }), door('laptop')]);
  assert.ok(put.ok, JSON.stringify(put));
  return { sql, api };
}

test('THE MINT ANSWERS THE ADDRESS, built from the record id both hosts route by', async () => {
  const { sql, api } = await record();
  const minted = await api.ingestMint({ ingest: 'my-phone' }, owner);
  assert.ok(minted.ok, JSON.stringify(minted));
  const answer = minted.value as { ingest: string; token: string; rec?: string; path?: string };
  assert.equal(answer.rec, REC);
  assert.equal(answer.path, `/in/webhook/${REC}/my-phone/${answer.token}`);
  assert.deepEqual(Object.keys(answer).sort(), ['ingest', 'path', 'rec', 'token']);
  sql.close();
});

test('DOORS LISTS EVERY LIVE WEBHOOK INGEST, whether a token is held for it, and never the digest', async () => {
  const { sql, api } = await record();
  const minted = await api.ingestMint({ ingest: 'my-phone' }, owner);
  assert.ok(minted.ok);
  const digest = createHash('sha256').update(minted.value.token).digest('hex');

  const listed = await (api as unknown as { doors?: (ctx: CallContext) => Promise<{ ok: boolean; value?: unknown }> }).doors?.(owner);
  assert.ok(listed?.ok, `doors answered ${JSON.stringify(listed)}`);
  /* EACH DOOR WITH ITS FACTS (`door-switch.ts` `doorFacts`): on, and nothing arrived or turned away yet. */
  const ON = { on: true, offSince: null, lastArrival: null, arrivals: 0, turnedAway: 0 };
  assert.deepEqual(listed.value, [
    { id: 'laptop', description: 'Texts posted by laptop.', verify: 'path', held: false, register: 'notes', ...ON },
    { id: 'my-phone', description: 'Texts posted by my-phone.', verify: 'path', held: true, register: 'notes', ...ON },
    { id: 'open-hook', description: 'Texts posted by open-hook.', verify: 'none', held: false, register: 'notes', ...ON },
  ]);
  assert.doesNotMatch(JSON.stringify(listed), new RegExp(digest), 'the digest was answered');
  sql.close();
});

test('DOORS IS AN OWNER READ, IN A BROWSER, routed ADMIN', async () => {
  const { sql, api } = await record();
  const route = ROUTES.find((r) => r.name === 'doors') ?? assert.fail('doors is not routed');
  assert.equal(route.group, 'ADMIN');
  assert.equal(route.writes, false);
  assert.ok(typeof handlersFor(api as never).doors === 'function');
  const doors = (api as unknown as { doors: (ctx: CallContext) => Promise<{ ok: boolean; refusal?: { code: string } }> }).doors;
  const agent = await doors({ principal: { kind: 'token', id: 't_1', scope: 'write', person: 'p_owner', level: 'owner' } });
  assert.equal(agent.refusal?.code, 'NEEDS_BROWSER_SESSION');
  const member = await doors({ principal: { kind: 'person', id: 'p_2', level: 'decide' } });
  assert.equal(member.ok, false);
  sql.close();
});
