/**
 * Sentry: the script run alone in QuickJS over a host double that answers Sentry's API in the shapes it answered on
 * 2 November 2026 (the organization's projects, its events table and each project's open issues), and the pack as it
 * ships read by the add-on door. Nothing here reaches Sentry.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { readPackFile } from '../../packages/declare/src/catalogue.ts';
import type { CtxHost, Json, ScriptAnswer, ScriptDecl } from '../../packages/script/src/index.ts';
import { runInQuickJs } from '../../packages/script/src/quickjs.ts';

const HERE = new URL('./', import.meta.url);
const SOURCE = readFileSync(new URL('sentry.js', HERE), 'utf8');
const TEXT = readFileSync(new URL('sentry.pack.json', HERE), 'utf8');
const PACK = JSON.parse(TEXT) as { declarations: Record<string, unknown>[] };
const SCRIPT = PACK.declarations.find((d) => typeof d.script === 'string') as { script: string; egress: string[]; keys: string[]; reads: string[]; writes: string[]; source: string };

const NOW = '2026-11-02T12:00:00.000Z';
const PROJECTS = [
  { id: '11', slug: 'crumb-bot', name: 'crumb-bot', platform: 'node' },
  { id: '12', slug: 'marsh-bot', name: 'marsh-bot', platform: 'node' },
];
const ISSUE = {
  id: '9001',
  shortId: 'MARSH-BOT-272',
  title: 'Discord never showed a reply sent in time',
  culprit: 'POST /interactions',
  permalink: 'https://quartzapps.sentry.io/issues/9001/',
  level: 'error',
  status: 'unresolved',
  substatus: 'escalating',
  priority: 'high',
  count: '40',
  userCount: 25,
  firstSeen: '2026-11-02T10:00:00Z',
  lastSeen: '2026-11-02T11:58:00Z',
  project: { id: '12', slug: 'marsh-bot' },
  stats: { '24h': [[1762077600, 30], [1762081200, 10]] },
};
const THINGS = [
  { id: 't_bake', seq: 1, version: 1, fields: { name: 'Crumb.gg' } },
  { id: 't_isles', seq: 2, version: 1, fields: { name: 'Marsh.gg' } },
];

const decl = (): ScriptDecl => ({ id: SCRIPT.script, version: 1, egress: SCRIPT.egress, keys: ['Sentry token'], reads: SCRIPT.reads, writes: SCRIPT.writes, source: SCRIPT.source });
const host = (): CtxHost =>
  ({
    fetch: async (req: unknown) => {
      const url = new URL(((typeof req === 'string' ? JSON.parse(req) : req) as { url: string }).url);
      const body = url.pathname.endsWith('/projects/') ? PROJECTS : url.pathname.endsWith('/events/') ? { data: [{ project: 'marsh-bot', 'count()': 40, 'count_unique(user)': 25 }] } : url.searchParams.get('project') === '12' ? [ISSUE] : [];
      return { status: 200, headers: { 'X-Hits': Array.isArray(body) ? String(body.length) : '0' }, body: JSON.stringify(body) };
    },
    list: async (register: string) => (register === 'things' ? THINGS : []) as unknown as Json[],
    get: async () => null,
    now: () => NOW,
    clock: () => 0,
    tz: 'UTC',
    input: {},
    config: { token: 'Sentry token', org: 'quartzapps', region: 'us.sentry.io', many_users: 20 },
  }) as unknown as CtxHost;

test('THE PACK CARRIES sentry.js, READS AS AN ADD-ON AND CALLS ONLY SENTRY', async () => {
  assert.equal(SCRIPT.source, SOURCE);
  assert.ok((await readPackFile(TEXT)).ok);
  assert.deepEqual(SCRIPT.egress, ['https://us.sentry.io', 'https://de.sentry.io', 'https://sentry.io']);
});

test('A RUN LINKS BY NAME, WRITES THE ISSUE ONCE WITH ITS ALARM, AND THE NUMBERS ON THE PROJECT', async () => {
  const a = (await runInQuickJs(decl(), host())) as ScriptAnswer;
  assert.ok('writes' in a, JSON.stringify(a));
  const writes = a.writes as unknown as { register: string; fields: Record<string, Json> }[];
  const projects = writes.filter((w) => w.register === 'sentry_projects').map((w) => [w.fields.slug, w.fields.thing]);
  assert.deepEqual(projects, [['crumb-bot', 't_bake'], ['marsh-bot', 't_isles']]);
  const issue = writes.find((w) => w.register === 'sentry_issues')!.fields;
  assert.deepEqual([issue.alarm, issue.wide, issue.thing, issue.events_24h, issue.link], ['escalating-1', true, 't_isles', 40, ISSUE.permalink]);
  assert.ok(writes.some((w) => w.register === 'datapoints' && w.fields.name === 'Open errors' && w.fields.thing === 't_isles' && w.fields.value === 1));
});
