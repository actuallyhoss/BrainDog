/**
 * `/mcp` on the Worker: which paths it is, and the bearer path it shares with `/api`.
 *
 * `src/index.ts` imports `cloudflare:workers` and cannot be loaded by `node --test`, so the decisions live in
 * `route.ts` and `session.ts`, tested here, and the lines of `index.ts` that use them are read as text.
 *
 * NO SECRET IS RECORDED. The stub notes which record and which surface it was asked about, never the bearer.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { servesApi, servesAuth, servesMcp } from '../src/route.ts';
import { bearerOf, type BearerDeps, type Held } from '../src/session.ts';

const MINE = 'rec_01J8ZC0000000000000000000B';
const BEARER = `${MINE}.${'s'.repeat(43)}`;
const OWNER: Held = { level: 'write', registers: null, levels: {} };
const SEEN = { id: 'tok_1', person_id: 'p_1', scope: 'propose' };

const at = (headers: Record<string, string> = {}) =>
  new Request('https://app.brain.dog/mcp', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: '{}' });

function deps(o: { knows?: boolean; seen?: typeof SEEN | null; held?: Held | null } = {}) {
  const asked: string[] = [];
  const d: BearerDeps = {
    knows: async (record) => (asked.push(`knows ${record}`), o.knows ?? true),
    verify: async (record, _bearer, surface) => (asked.push(`verify ${record} ${surface}`), o.seen === undefined ? SEEN : o.seen),
    access: async (record, person) => (asked.push(`access ${record} ${person}`), o.held === undefined ? OWNER : o.held),
  };
  return { d, asked };
}

test('/mcp IS ONE PATH, and it is not /api or /auth', () => {
  for (const path of ['/mcp', '/mcp/', '//mcp']) assert.ok(servesMcp(path), path);
  for (const path of ['/mcp/x', '/mcpx', '/api/mcp', '/api/list/mcp', '/', '/auth/mcp']) assert.ok(!servesMcp(path), path);
  assert.ok(!servesApi('/mcp'));
  assert.ok(!servesAuth('/mcp'));
});

test('NOTHING BUT A BEARER IS A CALLER, and the Directory is not asked about a request that carries none', async () => {
  const { d, asked } = deps();
  for (const headers of [{}, { cookie: `__Host-bd_s=${'S'.repeat(43)}` }, { authorization: '' }, { authorization: 'Bearer' }, { authorization: 'Basic abc' }])
    assert.deepEqual(await bearerOf(at(headers), 'mcp', d), { status: 401 }, JSON.stringify(headers));
  /* A record half that is not the shape of a record id is never used as an address. */
  assert.deepEqual(await bearerOf(at({ authorization: 'Bearer rec_nope.secret' }), 'mcp', d), { status: 401 });
  assert.deepEqual(asked, []);
});

test('THE DIRECTORY SAYS WHETHER THE RECORD IS OURS BEFORE ITS OBJECT IS ADDRESSED', async () => {
  const { d, asked } = deps({ knows: false });
  assert.deepEqual(await bearerOf(at({ authorization: `Bearer ${BEARER}` }), 'mcp', d), { status: 401 });
  assert.deepEqual(asked, [`knows ${MINE}`], 'a record the Directory does not know was asked to verify');
});

test('THE RECORD CHECKS THE SECRET AND SAYS WHAT THE PERSON MAY DO, and /mcp is recorded as where it was used', async () => {
  const unknown = deps({ seen: null });
  assert.deepEqual(await bearerOf(at({ authorization: `Bearer ${BEARER}` }), 'mcp', unknown.d), { status: 401 });
  assert.deepEqual(unknown.asked, [`knows ${MINE}`, `verify ${MINE} mcp`]);

  const gone = deps({ held: null });
  assert.deepEqual(await bearerOf(at({ authorization: `Bearer ${BEARER}` }), 'mcp', gone.d), {
    status: 403,
    refusal: { code: 'FORBIDDEN', fix: 'You are not on this record.' },
  });

  const held: Held = { level: 'read', registers: ['obligations'], levels: { obligations: 'write' } };
  const on = deps({ held });
  assert.deepEqual(await bearerOf(at({ authorization: `bearer ${BEARER}` }), 'mcp', on.d), {
    record: MINE,
    ctx: {
      principal: { kind: 'token', id: 'tok_1', scope: 'propose', person: 'p_1', level: 'read' },
      registers: ['obligations'],
      levels: { obligations: 'write' },
    },
  });
  assert.deepEqual(on.asked, [`knows ${MINE}`, `verify ${MINE} mcp`, `access ${MINE} p_1`]);
});

test('/api TAKES THE SAME PATH, and says so as its own surface', async () => {
  const { d, asked } = deps();
  const found = await bearerOf(new Request('https://app.brain.dog/api/list/mcp', { headers: { authorization: `Bearer ${BEARER}` } }), 'api', d);
  assert.ok(!('status' in found));
  assert.ok(asked.includes(`verify ${MINE} api`), 'a path ending in /mcp was recorded as mcp');
});

test('and index.ts routes /mcp before any door, checks the headers before the bearer, and hands the body to serveMcp', () => {
  const src = readFileSync(fileURLToPath(new URL('../src/index.ts', import.meta.url)), 'utf8');
  const route = src.indexOf('async function route(');
  assert.ok(route > 0 && src.indexOf('servesMcp(url.pathname)', route) > 0, 'route() does not branch on /mcp');
  assert.ok(src.indexOf('servesMcp(url.pathname)', route) < src.indexOf('doorOf(request', route), 'a cookie is decided before /mcp is');
  const agent = src.indexOf('async function agent(');
  assert.ok(agent > 0, 'there is no /mcp branch');
  assert.ok(src.indexOf('gate(request)', agent) < src.indexOf("bearerOf(request, 'mcp'", agent), 'the bearer is checked before the headers are');
  assert.match(src, /servesMcp\(new URL\(request\.url\)\.pathname\)\) return serveMcp\(request, api, ctx\)/u, 'the record does not answer /mcp through serveMcp');
  assert.ok(!src.includes('surfaceOf'), 'the surface is read from the path again');
});
