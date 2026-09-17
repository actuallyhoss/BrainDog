/**
 * A catalogue on browse: no catalogue is not an error, a file is held to its checksum, a record's standing against the
 * latest version, and what changed from the version installed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { exportUseCase } from '@braindog/declare';
import { emptyCatalogue, publishTo, type CatalogueIndex } from '@braindog/declare/catalogue';

import { catalogueText, changesSince, readHostCatalogue, standingOf } from './catalogue.ts';

const COURSES = { register: 'courses', name: 'Courses', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] };
const READING = { register: 'reading', name: 'Reading list', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] };

const file = (version: string, declarations: Record<string, unknown>[]) => {
  const built = exportUseCase({ usecase: 'study', version, title: 'Study', summary: 'Courses.', author: 'Halden', license: 'MIT', audience: 'individual', tone: 'plain', modules: [], voice: {}, labels: {}, declarations, examples: [] });
  assert.ok(built.ok);
  return JSON.stringify(built.value);
};

async function served(): Promise<{ index: CatalogueIndex; fetcher: (input: string) => Promise<Response> }> {
  let index = emptyCatalogue('Test');
  const files = new Map<string, string>();
  for (const text of [file('1.0.0', [COURSES]), file('1.1.0', [COURSES, READING])]) {
    const out = await publishTo(index, text, (p) => files.get(p) ?? null);
    assert.ok(out.ok);
    index = out.value.index;
    files.set(out.value.path, text);
  }
  const fetcher = async (input: string) => {
    const path = input.replace(/^\/catalogue\//u, '');
    if (path === 'index.json') return new Response(JSON.stringify(index), { headers: { 'content-type': 'application/json' } });
    const text = files.get(path);
    return text === undefined ? new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } }) : new Response(text, { headers: { 'content-type': 'application/json' } });
  };
  return { index, fetcher };
}

test('a host with no catalogue, or one answering the app shell, lists nothing and says nothing', async () => {
  assert.deepEqual(await readHostCatalogue(async () => new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } })), { ok: true, index: null });
  assert.deepEqual(await readHostCatalogue(async () => new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } })), { ok: true, index: null });
  const bad = await readHostCatalogue(async () => new Response('{"format":9}', { headers: { 'content-type': 'application/json' } }));
  assert.equal(bad.ok, false);
});

test('a version is fetched and held to its checksum', async () => {
  const { fetcher } = await served();
  const read = await readHostCatalogue(fetcher);
  assert.ok(read.ok && read.index);
  const entry = read.index.entries[0]!;
  assert.ok((await catalogueText(fetcher, entry, entry.versions[0]!)).ok);
  const tampered = async (input: string) => (input.endsWith('.usecase.json') ? new Response(file('1.1.0', [COURSES])) : fetcher(input));
  const out = await catalogueText(tampered, entry, entry.versions[0]!);
  assert.equal(!out.ok && out.code, 'CHECKSUM_MISMATCH');
});

test('standing against the latest, and what changed from the version installed', async () => {
  const { index, fetcher } = await served();
  const entry = index.entries[0]!;
  const held = (version: string | null, off = false) => [{ id: 'usecase-study', version, disabled_at: off ? '2026-09-17' : null, registers: [] }];
  assert.deepEqual(await standingOf(entry, []), { kind: 'install' });
  assert.deepEqual(await standingOf(entry, held('1.0.0')), { kind: 'update', from: '1.0.0' });
  assert.deepEqual(await standingOf(entry, held('1.1.0')), { kind: 'current' });
  assert.deepEqual(await standingOf(entry, held('2.0.0')), { kind: 'ahead', at: '2.0.0' });
  assert.equal((await standingOf(entry, held('1.0.0', true))).kind, 'off');
  const changes = await changesSince(fetcher, entry, '1.0.0');
  assert.deepEqual(changes?.added.map((a) => a.title), ['Reading list']);
  assert.equal(changes?.bump, 'minor');
  assert.equal(await changesSince(fetcher, entry, '0.9.0'), null);
});
