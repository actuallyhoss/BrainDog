/**
 * A self-host's second endpoint (`src/slash.ts` `slashFromEnv`, `selfhostFacts`, `slashEngineFor`'s route; ENG-A06 and
 * ENG-A07): "Rules are the fallback, not the engine."
 *
 * BEFORE THIS, ONE MODEL AND THEN THE RULES. `SLASH_FALLBACK_ENDPOINT` was read nowhere and `createSlash` was handed no
 * route, so when this host's endpoint did not answer, Slash's rules spoke. Now the three variables, all of them or none,
 * put a second endpoint on the route, asked before the rules.
 *
 * BOTH ENDPOINTS ARE TEST DOUBLES behind one fake `send`, told apart by their address. Nothing leaves the machine, and the
 * key is an invented string, there to be seen arriving at the second endpoint and nowhere in a log.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { routeFor } from '@braindog/host/infer';
import { createRecordApi } from '@braindog/record';

import { openSqlite } from '../../../packages/kernel/test/sqlite.ts';
import { selfhostFacts, slashEngineFor, slashFromEnv, type SlashConfig } from '../src/slash.ts';

const NOW = Date.UTC(2026, 9, 14, 9);
const clock = { now: () => NOW };

const FIRST = 'http://127.0.0.1:11434/v1/chat/completions';
const SECOND = 'https://spare.example/v1/chat/completions';
const SPARE_KEY = 'spare-test-token-0000';
const FROM = 'alerts@payments.example';
const sample = (seq: number, amount: string) => ({
  id: `inbox_raw#${seq}`,
  channel: 'email' as const,
  ts: '2026-10-14T08:00:00Z',
  from: FROM,
  subject: `Paid: EGP ${amount} to Kestrel Supplies`,
  body: `Your payment of EGP ${amount} to Kestrel Supplies went through on 14 Oct.`,
});
const SAMPLES = [sample(1, '120.00'), sample(2, '75.50'), sample(3, '9.00')];
const INGEST = JSON.stringify({
  ingest: {
    match: { from: { is: FROM }, subject: { starts: 'Paid: EGP' } },
    extract: { note: { between: ['to ', ' went'] } },
    writes: { register: 'notes', confidence: 'exact' },
  },
  flagged: false,
});
const NOTE = { id: 'note', type: 'text', required: true, search: true };
const notes = { id: 'register.notes', kind: 'register' as const, body: { id: 'notes', name: 'Notes', title: 'note', fields: [NOTE] } as never };

const ENV = { SLASH_ENDPOINT: FIRST, SLASH_MODEL: 'local' };
const ALL_THREE = { ...ENV, SLASH_FALLBACK_ENDPOINT: SECOND, SLASH_FALLBACK_MODEL: 'spare', SLASH_FALLBACK_KEY: SPARE_KEY };

const ids = (config: SlashConfig | undefined) => routeFor('ask', selfhostFacts(config)!).candidates.map((c) => [c.id, c.model]);

test('NO SECOND ENDPOINT SET IS A ROUTE OF ONE, the endpoint under SLASH_MODEL', () => {
  const lines: string[] = [];
  const config = slashFromEnv(ENV, (line) => lines.push(line));
  assert.equal(config?.fallback, undefined);
  assert.deepEqual(ids(config), [['endpoint', 'local']]);
  assert.deepEqual(lines, []);
  const facts = selfhostFacts(config);
  assert.deepEqual([facts?.form, facts?.large, facts?.machine], ['selfhost', false, false]);
});

test('ALL THREE SET ARE TWO CANDIDATES IN ORDER, the endpoint first, on every purpose but an embedding', () => {
  const lines: string[] = [];
  const config = slashFromEnv(ALL_THREE, (line) => lines.push(line));
  assert.deepEqual(config?.fallback, { url: SECOND, model: 'spare', key: SPARE_KEY });
  assert.deepEqual(ids(config), [['endpoint', 'local'], ['fallback', 'spare']]);
  for (const purpose of ['plan', 'automation', 'pattern', 'prose'] as const)
    assert.deepEqual(routeFor(purpose, selfhostFacts(config)!).candidates.map((c) => c.id), ['endpoint', 'fallback'], purpose);
  assert.deepEqual(lines, []);
});

test('TWO OF THREE IS A ROUTE OF ONE AND ONE LOG LINE, naming the missing variable and holding no value', () => {
  const lines: string[] = [];
  const { SLASH_FALLBACK_MODEL: _model, ...two } = ALL_THREE;
  const config = slashFromEnv(two, (line) => lines.push(line));
  assert.equal(config?.fallback, undefined);
  assert.deepEqual(ids(config), [['endpoint', 'local']]);
  assert.equal(lines.length, 1);
  assert.match(lines[0]!, /SLASH_FALLBACK_MODEL/u);
  for (const value of [SPARE_KEY, SECOND, 'spare.example', FIRST]) assert.ok(!lines[0]!.includes(value), `the log line holds ${value}`);
});

test('ONE OF THREE NAMES BOTH MISSING; AN ADDRESS THAT IS NOT HTTP IS LEFT OFF; NO SLASH_ENDPOINT READS NONE OF IT', () => {
  const lines: string[] = [];
  assert.equal(slashFromEnv({ ...ENV, SLASH_FALLBACK_KEY: SPARE_KEY }, (line) => lines.push(line))?.fallback, undefined);
  assert.match(lines[0]!, /SLASH_FALLBACK_ENDPOINT and SLASH_FALLBACK_MODEL are not set/u);
  assert.ok(!lines[0]!.includes(SPARE_KEY));

  assert.equal(slashFromEnv({ ...ALL_THREE, SLASH_FALLBACK_ENDPOINT: 'ftp://spare.example' }, (line) => lines.push(line))?.fallback, undefined);
  assert.equal(lines.length, 2);
  assert.match(lines[1]!, /SLASH_FALLBACK_ENDPOINT is not an http or https address/u);
  assert.ok(!lines[1]!.includes('spare.example'));

  const { SLASH_ENDPOINT: _endpoint, ...noEndpoint } = ALL_THREE;
  assert.equal(slashFromEnv(noEndpoint, (line) => lines.push(line)), undefined);
  assert.equal(selfhostFacts(undefined), undefined);
  assert.equal(lines.length, 2);
});

/** Two endpoints behind one fake `send`: the first fails as a network does when `down`, the second drafts the pattern. */
const pair = (down: boolean) => {
  const sent: { host: string; model: string; auth: string | null }[] = [];
  const config: SlashConfig = {
    ...slashFromEnv(ALL_THREE, () => {})!,
    send: async (url, init) => {
      const body = JSON.parse(String(init.body)) as { model: string };
      sent.push({ host: url.host, model: body.model, auth: new Headers(init.headers).get('authorization') });
      if (down && url.host === '127.0.0.1:11434') throw new TypeError('fetch failed');
      return Response.json({ choices: [{ message: { role: 'assistant', content: INGEST } }], usage: { prompt_tokens: 40, completion_tokens: 9 } });
    },
  };
  return { config, sent };
};

/** The engine over a record holding one register, and Slash's own SQLite beside it. */
const engineOver = async (config: SlashConfig) => {
  const api = await createRecordApi({ sql: openSqlite(), clock });
  assert.ok((await api.kernel.install([notes])).ok);
  const sql = openSqlite();
  const engine = await slashEngineFor(config, () => api, undefined, { sql, clock });
  assert.ok(engine, 'a configured endpoint built no engine');
  return { sql, engine };
};

type Row = { model: string; status: string; code: string | null; candidate: string | null; spends: string };
const rowsOf = (sql: ReturnType<typeof openSqlite>) =>
  sql.all<Row>('SELECT model, status, code, candidate, spends FROM slash_call ORDER BY rowid').map((r) => ({ ...r }));

test("THE FIRST FAILING, THE SECOND ANSWERS: the draft is the spare's, on its own key, and each attempt is a ledger row", async () => {
  const { config, sent } = pair(true);
  const { sql, engine } = await engineOver(config);
  const out = await engine.draftPattern(SAMPLES);
  assert.ok(out.ok, JSON.stringify(out));
  assert.deepEqual(sent, [
    { host: '127.0.0.1:11434', model: 'local', auth: null },
    { host: 'spare.example', model: 'spare', auth: `Bearer ${SPARE_KEY}` },
  ]);
  const rows = rowsOf(sql);
  assert.equal(rows.length, 2);
  assert.deepEqual([rows[0]!.status, rows[0]!.code, rows[0]!.candidate, rows[0]!.spends], ['error', 'UNREACHABLE', 'endpoint', 'none']);
  assert.deepEqual([rows[1]!.model, rows[1]!.status, rows[1]!.candidate, rows[1]!.spends], ['spare', 'ok', 'fallback', 'background']);
});

test('THE FIRST ANSWERING IS THE ONLY CALL, and the spare is never asked', async () => {
  const { config, sent } = pair(false);
  const { sql, engine } = await engineOver(config);
  const out = await engine.draftPattern(SAMPLES);
  assert.ok(out.ok, JSON.stringify(out));
  assert.deepEqual(sent.map((s) => s.host), ['127.0.0.1:11434']);
  assert.deepEqual(rowsOf(sql).map((r) => [r.status, r.candidate]), [['ok', 'endpoint']]);
});

test('NEVER ON HIS OWN KEY: with his key chosen, the endpoint failing is not sent on to the spare', async () => {
  const { config, sent } = pair(true);
  const { sql, engine } = await engineOver(config);
  sql.exec("UPDATE slash_settings SET tier = 'b', grant_id = 'g_invented', model = 'his-model' WHERE singleton = 1");
  assert.equal((await engine.draftPattern(SAMPLES)).ok, false);
  assert.ok(!sent.some((s) => s.host === 'spare.example'), 'the spare was asked on his own key');
});

test('NO SECOND ENDPOINT AND THE FIRST FAILING IS ONE CALL, and the rules speak as before', async () => {
  const { config, sent } = pair(true);
  const { fallback: _spare, ...alone } = config;
  const { sql, engine } = await engineOver(alone);
  const out = await engine.draftPattern(SAMPLES);
  assert.equal(out.ok, false);
  assert.deepEqual(sent.map((s) => s.host), ['127.0.0.1:11434']);
  assert.deepEqual(rowsOf(sql).map((r) => [r.code, r.candidate]), [['UNREACHABLE', 'endpoint']]);
});
