/**
 * ENG-A07: the settings door speaks two forms, Included and his own key, on every host.
 *
 * A save of `included` never writes `byo`, whatever `tier` rides beside it; a row a self-host stored on `byo` before is
 * read as Included with its model name and left as it was saved, so its count and its model stay what they were.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createSlash } from '../src/index.ts';
import type { Tier } from '../src/types.ts';
import { canned, fakeRecord, fixedClock, OWNER, openSqlite } from './double.ts';

const build = (tiers?: readonly Tier[]) => {
  const sql = openSqlite();
  const slash = createSlash({ sql, clock: fixedClock(Date.parse('2026-05-04T12:00:00Z')), inference: canned(), record: fakeRecord() }, { tiers });
  const row = () => sql.one<{ tier: string; model: string | null }>('SELECT tier, model FROM slash_settings WHERE singleton = 1');
  return { sql, slash, row };
};

test('a patch that says included with tier byo saves tier a, and keeps the model typed for the host endpoint', () => {
  const { sql, slash, row } = build();
  const out = slash.configure({ source: 'included', tier: 'byo', model: ' qwen-local ' }, OWNER);
  assert.ok(out.ok, JSON.stringify(out));
  assert.equal(out.value.tier, 'a');
  assert.equal(out.value.source, 'included');
  assert.deepEqual({ ...row() }, { tier: 'a', model: 'qwen-local' });
  assert.equal(slash.status().model, 'qwen-local');
  sql.close();
});

test('included alone saves tier a, and a new limit keeps the host model name', () => {
  const { sql, slash, row } = build();
  assert.ok(slash.configure({ source: 'included', model: 'qwen-local' }, OWNER).ok);
  assert.ok(slash.configure({ ask_cap: 5 }, OWNER).ok);
  assert.deepEqual({ ...row() }, { tier: 'a', model: 'qwen-local' });
  sql.close();
});

test('on a host that runs no typed model, included drops the name, as the routing table decides there', () => {
  const { sql, slash, row } = build(['a', 'b']);
  const out = slash.configure({ source: 'included', tier: 'byo', model: 'qwen-local' }, OWNER);
  assert.ok(out.ok, JSON.stringify(out));
  assert.deepEqual({ ...row() }, { tier: 'a', model: null });
  assert.equal(slash.status().model, 'glm-5.3-flash');
  sql.close();
});

test('going back to included from his own key does not carry the key model across', () => {
  const { sql, slash, row } = build();
  assert.ok(slash.configure({ source: 'key', model: 'claude-x', grant_id: 'g_01JRQ8Z0X1Y2Z3A4B5C6D7E8F9' }, OWNER).ok);
  assert.ok(slash.configure({ source: 'included' }, OWNER).ok);
  assert.deepEqual({ ...row() }, { tier: 'a', model: null });
  sql.close();
});

test('a row stored on byo reads as included with its model name, and the read writes nothing', () => {
  const { sql, slash, row } = build();
  sql.exec("UPDATE slash_settings SET tier = 'byo', model = 'qwen-local' WHERE singleton = 1");
  const read = slash.configure({}, OWNER);
  assert.ok(read.ok, JSON.stringify(read));
  assert.equal(read.value.source, 'included');
  assert.equal(read.value.model, 'qwen-local');
  const status = slash.status();
  assert.equal(status.source, 'included');
  assert.equal(status.model, 'qwen-local');
  assert.deepEqual({ ...row() }, { tier: 'byo', model: 'qwen-local' });
  sql.close();
});

test('saving included over a row stored on byo writes tier a and keeps its model name', () => {
  const { sql, slash, row } = build();
  sql.exec("UPDATE slash_settings SET tier = 'byo', model = 'qwen-local' WHERE singleton = 1");
  assert.ok(slash.configure({ source: 'included' }, OWNER).ok);
  assert.deepEqual({ ...row() }, { tier: 'a', model: 'qwen-local' });
  sql.close();
});
