/**
 * What the client is told by batch 41's record (record-index-41): the card in `context` with its Next line, the build
 * and the Also-here fields (AGT-B07, AGT-B08), the handoff's take and drop as the client's `handoff` sends them (AGT-C05),
 * and the copies on `boot` (LCH-C03), each named by the client's own types so a screen or the CLI reads what the record
 * said rather than `undefined`.
 *
 * THROUGH THE REAL WIRING, as `boot-shape.test.ts` drives it: `serveApi` over a real record, and each agent's session
 * read from the headers its own request carried (`sessionOf`), so `x-braindog-ahead` travels the way a CLI sends it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { handlersFor, serveApi, sessionOf } from '@braindog/host';

import { createClient, type AlsoHere, type Boot, type BootCopies, type Context } from '../src/index.ts';
import { createRecordApi, type CallContext } from '../../record/src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 12);
const MIN = 60_000;
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

const ok = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

async function wired() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  ok(await api.createRecord({ id: 'rec_01J9Z8Y7X6W5V4T3S2R1Q0P9N8', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1', email: 'ada@example.com', name: 'Ada' } }));
  const handlers = handlersFor(api);
  /** A client that calls as `who`: a person as they are, a key with the session its request's headers say. */
  const as = (who: CallContext, headers: Record<string, string> = {}) =>
    createClient({
      base: 'https://braindog.example',
      fetch: (async (input: string | URL | Request, init?: RequestInit) => {
        const request = new Request(new URL(String(input)), { ...init, headers: { ...Object.fromEntries(new Headers(init?.headers)), ...headers } });
        const ctx = who.principal.kind === 'token' ? { ...who, session: sessionOf(request.headers) } : who;
        return serveApi(request, handlers, ctx);
      }) as typeof globalThis.fetch,
    });
  /** An agent in the repository `kiln` on `studio-mac`, by its own key, with the headers the start hook sends. */
  const agent = async (name: string, more: Record<string, string> = {}) => {
    const key = ok<{ id: string }>(await api.createToken({ scope: 'write', label: name }, owner));
    const who: CallContext = { principal: { kind: 'token', id: key.id, scope: 'write', person: 'p_1', level: 'owner' } };
    return as(who, { 'x-braindog-client': `c-${name}`, 'x-braindog-agent': 'claude', 'x-braindog-host': 'studio-mac', 'x-braindog-repo': 'kiln', ...more });
  };
  return { sql, clock, as, agent };
}

test('CONTEXT CARRIES THE CARD, ITS NEXT LINE, THE BUILD AND WHO ELSE IS HERE, as the client names them', async () => {
  const { sql, clock, agent } = await wired();
  const leaver = await agent('leaver');
  const left = ok<{ spoken: string }>(await leaver.attach({ source: 'startup', doing: 'Kerning pass' }));
  ok(await leaver.handoff({ next: 'Kern the lowercase pairs', state: 'handoff' }));
  clock.advance(10 * MIN);
  const beside = await agent('beside');
  ok(await beside.attach({ source: 'startup', doing: 'Specimen copy' }));
  const starting = await agent('starting', { 'x-braindog-ahead': '3', 'x-braindog-cli': '2026.10.09+abc1234' });
  ok(await starting.attach({ source: 'startup' }));

  const here: Context = ok(await starting.context());
  /* THE STEP, BY WHO LEFT IT, WHAT KIND OF AGENT, WHEN, AND HOW MANY MORE. */
  assert.equal(here.handoff?.from, left.spoken);
  assert.equal(here.handoff?.agent, 'claude');
  assert.equal(here.handoff?.left_at, new Date(NOW).toISOString());
  assert.equal(here.handoff?.earlier, 0);
  /* THE CARD AND ITS NEXT LINE, the ahead header read as commits since. */
  assert.ok((here.card ?? '').startsWith('BrainDog · run '), here.card);
  assert.match(here.card_next ?? '', /Kern the lowercase pairs\..*3 commits since/u);
  assert.match(here.next_lines?.[0] ?? '', /3 commits since/u);
  assert.deepEqual(here.build, { cli: '2026.10.09+abc1234', behind: false });
  /* WHO ELSE IS IN THIS TREE, by name with what each is doing. */
  const also: AlsoHere | null | undefined = here.also_here;
  assert.ok(also, 'nobody else was said to be here');
  assert.ok(also.runs.some((r) => r.doing === 'Specimen copy'), JSON.stringify(also.runs));
  assert.equal(also.lines.length, 2);
  assert.equal(also.lines[0], also.warning);
  /* THE RECORD'S OWN PERSON, ITS ORGANISATIONS AND ITS RED SIGNS travel too, each in the shape the client types. */
  assert.ok('self' in here, 'self is missing');
  assert.ok(Array.isArray(here.organisations), 'organisations is missing');
  assert.ok(Array.isArray(here.signs), 'signs is missing');
  for (const sign of here.signs ?? []) assert.equal(typeof sign.said, 'string');
  sql.close();
});

test('THE CLIENT’S HANDOFF TAKES A STEP AND DROPS ONE, each a call of its own, and a drop with no reason is refused', async () => {
  const { sql, clock, as, agent } = await wired();
  const leaver = await agent('leaver');
  const left = ok<{ spoken: string }>(await leaver.attach({ source: 'startup' }));
  ok(await leaver.handoff({ next: 'Kern the lowercase pairs', state: 'handoff' }));
  clock.advance(5 * MIN);
  const taker = await agent('taker');
  ok(await taker.attach({ source: 'startup', doing: 'Kerning the pairs' }));
  assert.deepEqual(ok(await taker.handoff({ take: left.spoken })), { left: left.spoken, next: 'Kern the lowercase pairs', agent: 'claude' });

  const other = await agent('other', { 'x-braindog-repo': 'site' });
  const gone = ok<{ spoken: string }>(await other.attach({ source: 'startup' }));
  ok(await other.handoff({ next: 'Ship the specimen page', state: 'handoff' }));
  const person = as(owner);
  const bare = await person.handoff({ drop: gone.spoken } as never);
  assert.equal(bare.ok ? 'went through' : 'refusal' in bare ? bare.refusal.code : 'conflict', 'REQUIRED_MISSING');
  assert.deepEqual(ok(await person.handoff({ drop: gone.spoken, why: 'The page shipped yesterday.' })), { left: gone.spoken, next: 'Ship the specimen page' });
  sql.close();
});

test('BOOT CARRIES THE COPIES to an owner, none before the first night, and shape 4', async () => {
  const { sql, as, agent } = await wired();
  const boot: Boot = ok(await as(owner).boot());
  assert.equal(boot.shape, 4);
  const copies: BootCopies | undefined = boot.copies;
  assert.deepEqual(copies, { last_copy_at: null, last_copy_bytes: null, last_export_at: null });
  /* A KEY IS NO BROWSER, and is not told. */
  const key: Boot = ok(await (await agent('reader')).boot());
  assert.equal('copies' in key, false);
  sql.close();
});
