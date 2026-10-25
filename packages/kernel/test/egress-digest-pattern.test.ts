/**
 * What a digest's webhook and a pattern's poll send reaches the owner, in the approval lines a proposal is filed with.
 *
 * `propose` worked out a proposal's egress for a `change` alone, and `egressOf` read an ingest or a script and no other
 * kind. Both, filed from nobody in particular with the stored body read back, showed it: a digest posting a table of
 * Notes to `https://collector.example.com/in` carried `approve: null`, and so did a `pattern` whose ingest polls
 * `api.goldapi.io` every hour on the key `goldapi`. The owner pressing accept on either read a title, and nothing of
 * where it sends or with which key.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf } from '@braindog/ports';

import { egressOf, openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 23, 12);
const ID = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';

const NOTES: Declaration = {
  id: 'register.notes',
  kind: 'register',
  body: { id: 'notes', name: 'Notes', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never,
};

/** A weekly digest whose one channel posts a table of Notes to an address outside the record. */
const HOOK = (over: Record<string, unknown> = {}) => ({
  digest: 'out',
  schedule: { day: 'mon', at: '08:00' },
  channels: ['webhook'],
  webhook: { url: 'https://collector.example.com/in' },
  sections: [{ heading: 'Rows', source: 'register.notes', as: 'table', columns: [{ field: 'what' }] }],
  ...over,
});

/** An ingest that polls the gold price every hour, sending the keychain's `goldapi`. */
const POLL = {
  id: 'ingest.gold',
  kind: 'ingest',
  body: { ingest: 'gold', channel: 'poll', url: 'https://api.goldapi.io/v1/xau', every: '1h', grant: 'goldapi', extract: { what: { after: 'rate ' } }, writes: { register: 'notes' } },
};

const KEY = { label: 'goldapi', opens: 'api.goldapi.io', kind: 'api_token' as const, ciphertext: new Uint8Array([1]), nonce: new Uint8Array([9]), kdf: 'hkdf', wrapped_by: 'kek' as const, kek_id: 'kek_2f' };

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok(k.createRecord({ id: ID, slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  assert.ok((await k.install([NOTES])).ok);
  return { k, sql };
}

const filedBody = (sql: NodeSql, id: string) =>
  JSON.parse(sql.one<{ body: string }>('SELECT body FROM suggestion WHERE id = ?', id)!.body) as { approve?: string[]; egress?: { channel: string; line: string }[] };

const file = (k: Kernel, body_kind: 'change' | 'pattern', body: Record<string, unknown>): string => {
  const out = k.propose({ question: 'Install this?', body_kind, body }, 'p_2');
  assert.ok(out.ok, fixOf(out));
  return (out.value as { id: string }).id;
};

test("A DIGEST'S WEBHOOK IS EGRESS, said as where it posts, when, and what it carries", () => {
  assert.equal(egressOf(HOOK())?.line, 'CALLS OUT collector.example.com · weekly on mon at 08:00 · a table of register.notes');
  assert.equal(egressOf(HOOK({ webhook: { url: 'https://collector.example.com/in', grant: 'collector' } }))?.line, 'CALLS OUT collector.example.com · weekly on mon at 08:00 · a table of register.notes · grant "collector"');
  assert.equal(egressOf(HOOK({ webhook: { url: 'https://collector.example.com/in', grant: 'collector' } }))?.key, 'collector');
  /* A DIGEST THAT STAYS INSIDE THE RECORD CALLS NOTHING OUT. In-app and email go to the owner, whom nobody approves. */
  assert.equal(egressOf(HOOK({ channels: ['in-app', 'email'], webhook: undefined })), null);
  assert.equal(egressOf(HOOK({ schedule: { at: '07:30' }, sections: [{ heading: 'Done', source: 'metric.done', as: 'stat' }, { heading: 'Rows', source: 'register.notes' }] }))?.line, 'CALLS OUT collector.example.com · daily at 07:30 · a stat of metric.done and a table of register.notes');
});

test('A CHANGE TO A DIGEST THAT POSTS OUT IS FILED WITH THE LINE THE OWNER APPROVES, and asks nothing again once it is in', async () => {
  const { k, sql } = await record();
  const decl = { id: 'digest.out', kind: 'digest', body: HOOK() };
  const filed = filedBody(sql, file(k, 'change', { declaration_id: 'digest.out', to: decl }));
  assert.ok(filed.approve?.some((l) => l.includes('collector.example.com')), `the approval lines were ${JSON.stringify(filed.approve ?? null)}`);
  assert.equal(filed.egress?.[0]?.channel, 'digest');

  /* THE SAME DIGEST AGAIN IS NOTHING NEW, and a new address is. */
  assert.ok((await k.install([decl as Declaration])).ok);
  assert.equal(filedBody(sql, file(k, 'change', { declaration_id: 'digest.out', to: { ...decl, body: HOOK({ name: 'Out' }) } })).approve, undefined);
  const moved = filedBody(sql, file(k, 'change', { declaration_id: 'digest.out', to: { ...decl, body: HOOK({ webhook: { url: 'https://elsewhere.example.net/in' } }) } }));
  assert.ok(moved.approve?.some((l) => l.includes('elsewhere.example.net')), `a new address asked nothing: ${JSON.stringify(moved.approve ?? null)}`);
  sql.close();
});

test("A PATTERN WHOSE INGEST POLLS IS FILED WITH ITS LINE AND ITS KEY, worked out here and never taken from the proposer", async () => {
  const { k, sql } = await record();
  const filed = filedBody(sql, file(k, 'pattern', { ingest: POLL, samples: ['raw_1'], approve: ['CALLS OUT nowhere'], egress: [] }));
  assert.ok(filed.approve?.some((l) => l.includes('api.goldapi.io') && l.includes('goldapi')), `the approval lines were ${JSON.stringify(filed.approve ?? null)}`);
  assert.equal(filed.approve?.includes('CALLS OUT nowhere'), false, "the proposer's own line was kept");

  /* AND THE BARE BODY SLASH FILES, which has no id to look an installed copy up by, says what it would send too. */
  const bare = filedBody(sql, file(k, 'pattern', { ingest: POLL.body, samples: ['raw_1'] }));
  assert.ok(bare.approve?.some((l) => l.includes('api.goldapi.io')), `a bare poll was filed with ${JSON.stringify(bare.approve ?? null)}`);

  /* AND DROPPED WHEN THE INGEST CALLS NOTHING OUT, where no line of the record's stands in for the proposer's. The case
     above cannot see the drop, because a poll's own lines overwrite whatever was written: measured with the drop taken
     out, it still passed, and this one stored `approve: ["CALLS OUT nowhere"]`, which the accept then writes into the
     decision as the lines that press approved and Decide draws as the filed line. */
  const quiet = filedBody(sql, file(k, 'pattern', {
    ingest: { id: 'ingest.mail', kind: 'ingest', body: { ingest: 'mail', channel: 'email', writes: { register: 'notes' } } },
    samples: ['raw_1'],
    approve: ['CALLS OUT nowhere'],
    egress: [{ ingest: 'mail', channel: 'email', line: 'CALLS OUT nowhere', key: null }],
  }));
  assert.deepEqual([quiet.approve, quiet.egress], [undefined, undefined], "a proposer's own lines were kept on a pattern that sends nothing");
  sql.close();
});

test('AND ITS KEY IS IN THE KEYCHAIN BEFORE IT IS ACCEPTED, and the decision keeps the lines that press approved', async () => {
  const { k, sql } = await record();
  const id = file(k, 'pattern', { ingest: POLL, samples: ['raw_1'] });
  const missing = k.decide(id, { decide: { option: 'accept', reason: 'It is the gold price.' } }, 'p_1');
  assert.equal(missing.ok, false, 'a poll whose key is not in the keychain was accepted, to be armed and paused on its first run');
  if (!missing.ok && 'refusal' in missing) assert.match(missing.refusal.fix, /"goldapi"/u);
  assert.equal(k.governanceRow('suggestion', id)?.status, 'open');

  assert.ok(k.bindGrant(KEY, 'p_1').ok);
  assert.ok(k.decide(id, { decide: { option: 'accept', reason: 'It is the gold price.' } }, 'p_1').ok);
  const said = JSON.parse(sql.one<{ to_v: string }>("SELECT to_v FROM event WHERE kind = 'decide' ORDER BY rowid DESC LIMIT 1")!.to_v) as { approved?: string[] };
  assert.ok(said.approved?.some((l) => l.includes('api.goldapi.io')), `the decision kept ${JSON.stringify(said)}`);
  sql.close();
});
