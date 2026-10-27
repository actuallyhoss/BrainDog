/**
 * AGENT NAMES SAY "verified" WHEN THE APP PROVES IT.
 *
 * A run whose key `braindog setup` made for Claude Code ("MacBook · Claude Code", approved by the owner) reads
 * "Claude Code · MacBook · verified" and its presence row says `verified`; a run on the machine's own login
 * ("MacBook · braindog-cli") reads without it; and a key that came by a client document checked at its host is proven too.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import type { PresenceRow } from '../src/methods/agents.ts';
import { runLabel, verifiedBy } from '../src/run-verified.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { NOW, installSeed } from '../../seed/src/index.ts';

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};
const owner: CallContext = { principal: { kind: 'person', id: 'p_seed', level: 'owner' } };

test('A RUN ON A KEY MADE FOR CLAUDE CODE IS VERIFIED, AND ONE ON THE MACHINE\'S LOGIN IS NOT', async () => {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  value(await api.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_seed', email: 'teo@vance-studio.example', name: 'Teodor' } } as never));
  value(await installSeed(api.kernel));
  clock.advance(60_000);
  const forClaude = value<{ id: string }>(await api.createToken({ scope: 'write', label: 'MacBook · Claude Code', days: 30 } as never, owner)).id;
  const machine = value<{ id: string }>(await api.createToken({ scope: 'write', label: 'MacBook · braindog-cli', days: 30 } as never, owner)).id;
  const ctx = (token: string, client: string): CallContext => ({
    principal: { kind: 'token', id: token, scope: 'write', person: 'p_seed', level: 'owner' },
    session: { host: 'kiln-mbp', repo: 'portage', agent: 'claude', client_id: client },
  });
  const a = value<{ spoken: string }>(await api.attach({ source: 'startup', doing: 'Working' }, ctx(forClaude, 'c-claude'))).spoken;
  const b = value<{ spoken: string }>(await api.attach({ source: 'startup', doing: 'Working' }, ctx(machine, 'c-machine'))).spoken;
  const rows = value<PresenceRow[]>(await api.presence({}, owner));
  assert.equal(rows.find((r) => r.run === a)?.verified, true, JSON.stringify(rows.map((r) => [r.run, r.verified])));
  assert.equal(rows.find((r) => r.run === b)?.verified, false);
  sql.close();
});

test('THE NAME: "Claude Code · MacBook · verified", without the mark on a bare key, and a checked client document is proven', () => {
  const run = { agent: 'claude', host: 'MacBook' };
  assert.equal(runLabel(run, { label: 'MacBook · Claude Code' }), 'Claude Code · MacBook · verified');
  assert.equal(runLabel(run, { label: 'MacBook · braindog-cli', client: { kind: 'device', host: 'MacBook' } }), 'Claude Code · MacBook');
  assert.equal(runLabel(run, null), 'Claude Code · MacBook');
  assert.equal(runLabel({ agent: 'claude', client: 'Claude' }, { label: 'Claude', client: { kind: 'cimd', host: 'claude.ai' } }), 'Claude · claude.ai · verified');
  /* AN APP THAT NAMED ITSELF PROVES NOTHING, nor does a key made for another app. */
  assert.equal(verifiedBy(run, { label: 'Claude', client: { kind: 'dcr', host: null } }), false);
  assert.equal(verifiedBy(run, { label: 'MacBook · Codex' }), false);
});
