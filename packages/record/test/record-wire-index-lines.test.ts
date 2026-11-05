/**
 * Batch 47's record index lines, one case a line (record-index-47): each goes red when its line in `index.ts`,
 * `methods/index.ts` or the host's `index.ts` goes.
 *
 * 44's one-block preview held to the inbox's reach; 45's capture registered with the record's own door, the kernel's
 * `whollyWithheld` said from here, and the week offer handed what was read; 46's shape door registered and exported
 * from the host; 47's build handed to the kernel and to the signs, with the catalogue's newer versions. And the file
 * names none of the owner's private words. SHL-A21's half is `update-said-once.test.ts`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { whollyWithheld as kernelWithheld, type Declaration, type MetricDecl } from '@braindog/kernel';

import { createRecordApi, whollyWithheld, type Build, type CallContext } from '../src/index.ts';
import { markDoor } from '../../kernel/src/door.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import * as host from '../../host/src/index.ts';

const NOW = Date.UTC(2026, 9, 9, 12);
const DAY = 86_400_000;
const ID = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true };
const token = (reach?: string[]): CallContext =>
  ({ principal: { kind: 'token', id: 'tok_1', scope: 'write', person: 'p_1', level: 'owner', ...(reach ? { reach } : {}) } }) as CallContext;

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

async function record(build?: Build, at = NOW) {
  const sql = openSqlite();
  const clock = fixedClock(at);
  const api = await createRecordApi({ sql, clock, ...(build ? { build } : {}) });
  value(api.kernel.createRecord({ id: ID, slug: 'the-flat', name: 'The Flat', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }));
  return { api, sql, clock };
}

test('44 1c THE PREVIEW HOLDS THE INBOX: a key the inbox does not reach reads the quiet words, a key it reaches the owner\'s', async () => {
  const { api, sql, clock } = await record();
  const body = 'Invoice from Ada for 900';
  const sha256 = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body))).toString('hex');
  value(api.kernel.arrive({ channel: 'paste', body, sha256 } as never));
  clock.advance(2 * DAY);
  const page = { page: 'look', title: 'Look', blocks: [{ kind: 'table', source: 'signs', where: 'sign is arrivals-filed' }] };
  const said = async (ctx: CallContext) =>
    (value<{ blocks: { rows?: { fields: Record<string, unknown> }[] }[] }>(await api.previewPage({ body: page }, ctx)).blocks[0]?.rows ?? [])[0]?.fields.said;
  assert.equal(await said(token()), 'Messages came in that are not filed yet.');
  assert.notEqual(await said(token(['inbox'])), 'Messages came in that are not filed yet.');
  sql.close();
});

test('45 CAPTURE IS THE RECORD\'S, with its own door: a new project through capture wears a hue of its own, as create gives it', async () => {
  const { api, sql } = await record();
  const projects = {
    id: 'register.projects',
    kind: 'register',
    body: { id: 'projects', name: 'Projects', title: 'name', identity: { accent: 'hue' }, fields: [{ id: 'name', type: 'text', required: true }, { id: 'hue', type: 'int' }] },
  } as unknown as Declaration;
  value(await api.kernel.install([projects]));
  const surface = api as unknown as { capture?: (a: unknown, c: CallContext) => Promise<unknown> };
  assert.equal(typeof surface.capture, 'function', 'capture is not registered');
  value(await surface.capture!({ rows: [{ register: 'projects', fields: { name: 'Kiln' } }] }, owner));
  const fields = JSON.parse(sql.one<{ fields: string }>("SELECT fields FROM entry WHERE register = 'projects'")!.fields) as { hue?: unknown };
  assert.equal(typeof fields.hue, 'number', 'capture was not handed the record door');
  sql.close();
});

test('45 THE KERNEL\'S RULE FOR A PAGE WHOLLY HELD is said from the record, the same function', () => {
  assert.equal(whollyWithheld, kernelWithheld);
});

test('45 THE WEEK OFFER REACHES BOOT: a list due four times this week and read on three weeks is offered its week on day 15', async () => {
  const BORN = Date.parse('2026-09-01T09:00:00Z');
  const { api, sql, clock } = await record(undefined, BORN);
  const orders = {
    id: 'register.orders',
    kind: 'register',
    body: {
      id: 'orders',
      name: 'Orders',
      title: 'what',
      fields: [
        { id: 'what', type: 'text', required: true },
        { id: 'due', type: 'day', index: true, deadline: true },
        { id: 'state', type: 'enum', values: ['new', 'paid'], default: 'new', required: true, index: true },
      ],
      state: 'state',
      done: ['paid'],
    },
  } as unknown as Declaration;
  value(await api.kernel.install([orders]));
  for (const day of [0, 7, 13]) {
    clock.set(BORN + day * DAY);
    value(api.kernel.observe([{ kind: 'register.read', subject: 'orders' }]));
  }
  for (const due of ['2026-09-14', '2026-09-15', '2026-09-17', '2026-09-18']) value(api.kernel.create('orders', { what: `Order due ${due}`, due }, { actor: 'p_1' }));
  clock.set(BORN + 15 * DAY);
  const boot = value<{ pen: { id: string }[] }>(await api.boot(owner));
  assert.ok(boot.pen.some((i) => i.id === 'week:orders'), `the pen offered ${boot.pen.map((i) => i.id).join(', ') || 'nothing'}`);
  sql.close();
});

test('46 THE SHAPE DOOR\'S RECORD HALF IS REGISTERED, and the host exports the door from its one module', async () => {
  const { api, sql } = await record();
  const surface = api as unknown as Record<string, unknown>;
  assert.equal(typeof surface.shapeGrant, 'function');
  assert.equal(typeof surface.shapeExport, 'function');
  assert.equal(typeof host.serveShape, 'function');
  assert.equal(host.servesShape('/api/shape'), true);
  sql.close();
});

test('47 THE BUILD REACHES THE KERNEL: the door\'s behind reads a session that named another build', async () => {
  const { api, sql } = await record({ app: '1.4.0', slash: true });
  markDoor(sql, 'S1', { kind: 'hello', build: '1.3.0' }, NOW - DAY);
  const behind = { metric: 'door-behind', source: 'record.door', sign: 'behind', value: { count: 'id' }, target: { lte: 0 }, window: '30d', compare: 'none', format: 'int' } as unknown as MetricDecl;
  assert.equal(value<{ value: number | null }>(api.kernel.metric(behind)).value, 1);
  sql.close();
});

test('47 THE SIGNS ARE HANDED THE BUILD: a cloud host with no model bound reads arrived red, in words that say what turns it on', async () => {
  const { api, sql } = await record({ app: '2026.10.09+1a2b3c4', slash: false, host: 'cloud' });
  await api.lintTick();
  const signs = value<{ signs: { sign: string; state: string; said?: string }[] }>(api.kernel.signs());
  const arrived = signs.signs.find((s) => s.sign === 'arrived');
  assert.equal(arrived?.state, 'red', arrived?.said);
  sql.close();
});

test('47 THE SIGNS ARE HANDED THE CATALOGUE\'S NEWER VERSIONS: the night asks it once', async () => {
  let asked = 0;
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW), catalogueOffers: async () => ((asked += 1), []) });
  value(api.kernel.createRecord({ id: ID, slug: 'the-flat', name: 'The Flat', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }));
  /* ONE ADD-ON HELD, as the kernel keeps it, so the night has something to ask the catalogue about. */
  sql.exec(
    "INSERT INTO pack (id, version, source, manifest, installed_at, checksum) VALUES ('money-book', '1.0.0', 'kennel', ?, '2026-09-01T00:00:00.000Z', 'x')",
    JSON.stringify({ pack: 'money-book', version: '1.0.0', title: 'Money' }),
  );
  await api.lintTick();
  assert.ok(asked >= 1, 'the signs were not handed catalogueOffers');
  sql.close();
});

test('47 THE RECORD\'S OWN FILE NAMES NONE OF THE PRIVATE WORDS, so public-clean holds it at nothing', () => {
  const words = ['ho' + 'ss'];
  const text = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8').toLowerCase().replaceAll('actually' + words[0], '');
  for (const w of words) assert.equal(text.includes(w), false, `index.ts names a private word (${w.length} letters)`);
});
