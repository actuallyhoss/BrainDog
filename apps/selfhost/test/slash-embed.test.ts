/**
 * A self-host whose endpoint embeds (`src/slash.ts` `slashModelJobs`'s `embed`): `infer.embed` is leased on the
 * same pass and the same background allowance as the Cloud, each call one `slash_call` row of purpose `embed`, and the
 * vectors land in `entry_vec`.
 *
 * BEFORE THIS, THE SELF-HOST NEVER EMBEDDED: the kernel's hourly sweep queued the job and it waited forever. The endpoint
 * is a test double; nothing leaves the machine and no key is used.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { slashRecordMeter } from '@braindog/host';
import { backgroundMeter, serveModelJobs } from '@braindog/host/model-jobs';
import { createRecordApi } from '@braindog/record';

import { PROJECTS } from '../../../fixtures/names.ts';
import { openSqlite } from '../../../packages/kernel/test/sqlite.ts';
import { slashEngineFor, slashModelJobs, type SlashConfig } from '../src/slash.ts';

const NOW = Date.UTC(2026, 9, 14, 9);
const clock = { now: () => NOW };
const MONTH = new Date(Date.UTC(2026, 9, 1)).toISOString();
const noGrants = () => ({ kernel: { grants: () => [] } }) as never;

/** An endpoint that embeds: a vector of width three for each text, and the batches it was sent. */
const endpoint = (embedModel?: string) => {
  const batches: string[][] = [];
  const config: SlashConfig = {
    url: 'http://127.0.0.1:11434/v1/chat/completions',
    model: 'local',
    ...(embedModel ? { embedModel } : {}),
    send: async (url, init) => {
      const body = JSON.parse(String(init.body)) as { input?: string[] };
      if (!url.pathname.endsWith('/embeddings')) return Response.json({ choices: [{ message: { role: 'assistant', content: '{}' } }] });
      batches.push(body.input ?? []);
      return Response.json({ data: (body.input ?? []).map((_, index) => ({ index, embedding: [index + 1, 0, 1] })), usage: { prompt_tokens: 4 } });
    },
  };
  return { config, batches };
};

const jobsOver = (config: SlashConfig, api: () => never, sql = openSqlite()) => {
  const meter = slashRecordMeter({ sql, clock, engine: () => slashEngineFor(config, api, undefined, { sql, clock }), model: 'glm-5.3-flash' });
  return { sql, jobs: slashModelJobs(config, api, undefined, { sql, clock }, meter) };
};

test('AN ENDPOINT THAT EMBEDS ANSWERS TWO VECTORS, written as one background row of purpose embed', async () => {
  const { config, batches } = endpoint('embedder');
  const { sql, jobs } = jobsOver(config, noGrants);
  assert.ok(jobs?.embed, 'a self-host with an embedding model offered no embed');
  const out = await jobs.embed(['a', 'b']);
  assert.ok(out.ok, JSON.stringify(out));
  assert.equal(out.value.model, 'embedder');
  assert.equal(out.value.dims, 3);
  assert.equal(out.value.vectors.length, 2);
  assert.deepEqual(batches, [['a', 'b']]);
  const rows = sql.all<{ kind: string; purpose: string; spends: string; status: string }>('SELECT kind, purpose, spends, status FROM slash_call').map((r) => ({ ...r }));
  assert.deepEqual(rows, [{ kind: 'embed', purpose: 'embed', spends: 'background', status: 'ok' }]);
  assert.equal(backgroundMeter(sql).of!('embed').spent(MONTH), 1);
});

test('NO EMBEDDING MODEL IS NO EMBED, and the drafts are still answered', () => {
  const { jobs } = jobsOver(endpoint().config, noGrants);
  assert.ok(jobs?.draft);
  assert.equal(jobs.embed, undefined);
});

const NOTE = { id: 'note', type: 'text', required: true, search: true };
const notes = { id: 'register.notes', kind: 'register' as const, body: { id: 'notes', name: 'Notes', title: 'note', fields: [NOTE] } as never };

test('THE PASS FILLS entry_vec: off, nothing is leased and the endpoint is never called; on, the job is acked with vectors', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock });
  assert.ok((await api.kernel.install([notes])).ok);
  for (const name of PROJECTS.slice(0, 2)) assert.ok(api.kernel.create('notes', { note: `Ship ${name} this week` }, { actor: 'p_owner' }).ok);
  api.kernel.purge();
  const job = () => sql.one<{ state: string; attempts: number }>("SELECT state, attempts FROM outbox WHERE kind = 'infer.embed'");
  assert.deepEqual({ ...job() }, { state: 'pending', attempts: 0 }, 'the hourly sweep queued no embedding');

  const { config, batches } = endpoint('embedder');
  const { sql: slashSql, jobs } = jobsOver(config, () => api as never);
  const pass = (on: boolean) =>
    serveModelJobs(api, { inference: jobs, meter: backgroundMeter(slashSql), now: clock.now, log: () => {}, reads: () => on });

  await pass(false);
  assert.deepEqual({ ...job() }, { state: 'pending', attempts: 0 });
  assert.equal(batches.length, 0, 'the endpoint was called with the switch off');
  assert.equal(sql.all('SELECT 1 FROM entry_vec').length, 0);

  await pass(true);
  assert.equal(job()?.state, 'done');
  assert.equal(batches.length, 1);
  assert.equal(batches[0]!.length, 2);
  const vecs = sql.all<{ register: string; dims: number; model: string }>('SELECT register, dims, model FROM entry_vec').map((r) => ({ ...r }));
  assert.deepEqual(vecs, [
    { register: 'notes', dims: 3, model: 'embedder' },
    { register: 'notes', dims: 3, model: 'embedder' },
  ]);
  assert.equal(backgroundMeter(slashSql).of!('embed').spent(MONTH), 1);
});
