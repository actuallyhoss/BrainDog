/**
 * A page set whole, against the version it was read at.
 *
 * Two people arranging one page used to each write their reading over the other's, because `setDeclaration` took a
 * body and nothing else. `page` now answers `declared_version`, and a write carrying it lands only if the page is still
 * there; otherwise the answer is a conflict with the body as it now stands.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { conflicted } from '@braindog/ports';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

const body = (...notes: string[]) => ({ page: 'plans', title: 'Plans', blocks: notes.map((n) => ({ kind: 'note', body: n })) });

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 8, 17, 12)) });
  return { api, sql };
}

const versionOf = async (api: Awaited<ReturnType<typeof record>>['api']) => {
  const out = await api.page({ slug: 'plans' }, owner);
  assert.ok(out.ok, JSON.stringify(out));
  return (out.value as { declared_version: number }).declared_version;
};

test('PAGE ANSWERS THE VERSION IT HOLDS, and a write read at it lands', async () => {
  const { api, sql } = await record();
  const first = await api.setDeclaration({ body: body('a', 'b'), version: 0 }, owner);
  assert.ok(first.ok, JSON.stringify(first));
  assert.equal(await versionOf(api), 1);

  const moved = await api.setDeclaration({ body: body('b', 'a'), version: 1 }, owner);
  assert.ok(moved.ok, JSON.stringify(moved));
  assert.deepEqual((moved.value as { version: number }[]).map((d) => d.version), [2]);
  assert.equal(await versionOf(api), 2);
  sql.close();
});

test('A SECOND ARRANGEMENT READ AT THE SAME VERSION IS A CONFLICT, and the first one stands', async () => {
  const { api, sql } = await record();
  await api.setDeclaration({ body: body('a', 'b', 'c') }, owner);
  const seen = await versionOf(api);

  const ada = await api.setDeclaration({ body: body('c', 'b', 'a'), version: seen }, owner);
  assert.ok(ada.ok);
  const bo = await api.setDeclaration({ body: body('b', 'a', 'c'), version: seen }, owner);
  assert.ok(conflicted(bo), `the second write was not a conflict: ${JSON.stringify(bo)}`);
  assert.equal(bo.conflict.version, 2);
  assert.deepEqual((bo.conflict.current as { body: { blocks: { body: string }[] } }).body.blocks.map((b) => b.body), ['c', 'b', 'a']);

  const now = await api.page({ slug: 'plans' }, owner);
  assert.ok(now.ok);
  assert.deepEqual((now.value as { blocks: { body: string }[] }).blocks.map((b) => b.body), ['c', 'b', 'a'], 'the second write landed over the first');
  sql.close();
});

test('TWO WRITES SENT AT ONCE, both read at one version, land once', async () => {
  const { api, sql } = await record();
  await api.setDeclaration({ body: body('a', 'b') }, owner);
  const outs = await Promise.all([
    api.setDeclaration({ body: body('b', 'a'), version: 1 }, owner),
    api.setDeclaration({ body: body('a', 'b', 'c'), version: 1 }, owner),
  ]);
  assert.deepEqual(outs.map((o) => (o.ok ? 'ok' : conflicted(o) ? 'conflict' : 'refused')).sort(), ['conflict', 'ok']);
  sql.close();
});

test('A PAGE THAT IS NOT THERE IS VERSION 0, a version that is not a whole number is refused, and none keeps the old way', async () => {
  const { api, sql } = await record();
  assert.ok(conflicted(await api.setDeclaration({ body: body('a'), version: 3 }, owner)), 'a page nobody declared was written at version 3');
  const bad = await api.setDeclaration({ body: body('a'), version: -1 }, owner);
  assert.equal(!bad.ok && 'refusal' in bad && bad.refusal.code, 'VALUE_MALFORMED');
  assert.ok((await api.setDeclaration({ body: body('a') }, owner)).ok);
  assert.ok((await api.setDeclaration({ body: body('b') }, owner)).ok, 'a write that says no version is refused');
  sql.close();
});

test('A PAGE WHOSE NAME IS NOT ITS SLUG (an underscore) answers its version at its slug, and a write back at the slug is held to it', async () => {
  const { api, sql } = await record();
  const named = (...notes: string[]) => ({ ...body(...notes), page: 'my_plans' });
  assert.ok((await api.setDeclaration({ body: named('a', 'b') }, owner)).ok);

  const read = await api.page({ slug: 'my-plans' }, owner);
  assert.ok(read.ok, JSON.stringify(read));
  const answered = read.value as { page: string; declared_version?: number };
  assert.equal(answered.declared_version, 1);

  /* The app writes back what it read, the page named by its slug, at the version it read. */
  const ada = await api.setDeclaration({ body: { ...named('b', 'a'), page: answered.page }, version: 1 }, owner);
  assert.ok(ada.ok, JSON.stringify(ada));
  const bo = await api.setDeclaration({ body: { ...named('a', 'b', 'c'), page: answered.page }, version: 1 }, owner);
  assert.ok(conflicted(bo), `the second write was not a conflict: ${JSON.stringify(bo)}`);

  const pages = sql.all<{ id: string }>("SELECT id FROM declaration WHERE kind = 'page' AND superseded_at IS NULL AND retired = 0");
  assert.equal(pages.length, 1, `the write made a second page: ${JSON.stringify(pages)}`);
  const now = await api.page({ slug: 'my-plans' }, owner);
  assert.ok(now.ok);
  assert.deepEqual((now.value as { blocks: { body: string }[] }).blocks.map((b) => b.body), ['b', 'a']);
  sql.close();
});
