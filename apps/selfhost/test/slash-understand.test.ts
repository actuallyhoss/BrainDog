/**
 * Who is who on a self-host (`src/slash.ts` `slashModelJobs`): the model-jobs pass's two asks, the doubtful pairs of
 * `infer.resolve` and the night's notes, over this host's endpoint and held in the Slash ledger beside every other ask.
 *
 * BEFORE THIS, `slashModelJobs` ANSWERED A DRAFT AND A DIGEST'S PROSE ONLY, so `infer.resolve` waited `pending` and the
 * notes were never read. Each ask is now one background row under `UNDERSTAND_ASK`. The endpoint is a test double;
 * nothing leaves the machine.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { slashRecordMeter } from '@braindog/host';
import { SLASH_RESOLVE_INSTRUCTIONS, UNDERSTAND_ASK } from '@braindog/host/understand';

import { openSqlite } from '../../../packages/kernel/test/sqlite.ts';
import { slashEngineFor, slashModelJobs, type SlashConfig } from '../src/slash.ts';

const clock = { now: () => Date.UTC(2026, 9, 6, 9) };
const noGrants = () => ({ kernel: { grants: () => [] } }) as never;

const PAIRS = {
  pairs: [{ id: 'p1', a: { name: 'Ada Lovelace', kind: 'person' as const, domain: 'kiln.example' }, b: { name: 'Ada L.', kind: 'person' as const, domain: 'kiln.example' } }],
};

test('THE ENDPOINT JUDGES A PAIR, told the resolve instructions, and the ask is one background row under UNDERSTAND_ASK', async () => {
  const told: string[] = [];
  const config: SlashConfig = {
    url: 'http://127.0.0.1:11434/v1/chat/completions',
    model: 'local',
    send: async (_url, init) => {
      const body = JSON.parse(String(init.body)) as { messages: { role: string; content: string }[] };
      told.push(body.messages.find((m) => m.role === 'system')?.content ?? '');
      return Response.json({ choices: [{ message: { role: 'assistant', content: '{"verdicts":{"p1":0.2}}' } }] });
    },
  };
  const sql = openSqlite();
  const meter = slashRecordMeter({ sql, clock, engine: () => slashEngineFor(config, noGrants, undefined, { sql, clock }), model: 'glm-5.3-flash' });
  const jobs = slashModelJobs(config, noGrants, undefined, { sql, clock }, meter);
  assert.ok(jobs?.resolve && jobs.mentions, 'a self-host with a model offered no reading of who is who');

  const judged = await jobs.resolve(PAIRS);
  assert.deepEqual(judged, { ok: true, value: { verdicts: { p1: 0.2 } } });
  assert.deepEqual(told, [SLASH_RESOLVE_INSTRUCTIONS]);
  const rows = sql.all<{ kind: string; question: string; status: string }>('SELECT kind, question, status FROM slash_call').map((r) => ({ ...r }));
  assert.deepEqual(rows, [{ kind: 'pattern', question: UNDERSTAND_ASK, status: 'ok' }]);
});

test('NO ENDPOINT IS NO READING: a self-host with no model offers no jobs at all', () => {
  const sql = openSqlite();
  const meter = slashRecordMeter({ sql, clock, engine: async () => undefined, model: 'glm-5.3-flash' });
  assert.equal(slashModelJobs(undefined, noGrants, undefined, { sql, clock }, meter), undefined);
});
