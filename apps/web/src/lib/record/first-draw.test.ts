/**
 * The first-draw list, held to the code that makes the reads.
 *
 * THE LIST IS WRITTEN BY HAND, SO THIS READS THE CODE. Every route loader (each `+layout.ts` and `+page.ts` under
 * `routes/`, found by name) and each file `READERS` names is read for the client methods it calls. A name that is
 * neither a first-draw read nor in `AFTER_DRAW` with its reason is a read the deploy's smoke would not ask, and the day
 * a loader adds one this goes red here rather than on a record after a green deploy.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClient } from '@braindog/client';

import { AFTER_DRAW, FIRST_DRAW, READERS, methodsIn } from './first-draw.ts';

const SRC = fileURLToPath(new URL('../../', import.meta.url));
const LOADER = /^\+(?:layout|page)\.ts$/;

/** Every route loader, repo-relative under `apps/web/src`. */
function loaders(dir = join(SRC, 'routes'), at = 'routes'): string[] {
  return readdirSync(dir).flatMap((name) =>
    statSync(join(dir, name)).isDirectory() ? loaders(join(dir, name), `${at}/${name}`) : LOADER.test(name) ? [`${at}/${name}`] : [],
  );
}

/** The names a set of sources call that the list does not account for. */
const unaccounted = (sources: Record<string, string>): string[] =>
  Object.entries(sources).flatMap(([file, text]) =>
    methodsIn(text)
      .filter((m) => !FIRST_DRAW.some((r) => r.method === m) && !Object.hasOwn(AFTER_DRAW, m))
      .map((m) => `${file}: ${m}`),
  );

const scanned = (): Record<string, string> =>
  Object.fromEntries([...loaders(), ...READERS].map((file) => [file, readFileSync(join(SRC, file), 'utf8')]));

test('the scan finds the root loader, and each file it names is there', () => {
  const files = loaders();
  assert.ok(files.includes('routes/+layout.ts'), files.join(', '));
  for (const file of READERS) assert.ok(statSync(join(SRC, file)).isFile(), file);
});

test('every read a loader or the home page makes is on the list, or set aside with a reason', () => {
  assert.deepEqual(unaccounted(scanned()), []);
});

test('a loader that adds a read the list lacks is caught', () => {
  const planted = { 'routes/inbox/+page.ts': "const out = await client.inbox({ state: 'open' });" };
  assert.deepEqual(unaccounted(planted), ['routes/inbox/+page.ts: inbox']);
  const chained = { 'routes/+layout.ts': 'createClient({ base, fetch }).usage()' };
  assert.deepEqual(unaccounted(chained), ['routes/+layout.ts: usage']);
});

test('no entry is stale: each read on the list is still made by a scanned file', () => {
  const made = new Set(Object.values(scanned()).flatMap(methodsIn));
  for (const read of FIRST_DRAW) assert.ok(made.has(read.method), `${read.method} is on the list and no first screen asks it`);
  for (const name of Object.keys(AFTER_DRAW)) assert.ok(!FIRST_DRAW.some((r) => r.method === name), `${name} is set aside and listed`);
});

test('the names are read in each form the app writes them', () => {
  const text = [
    'const out = await client.boot();',
    "const drawn = await client.call<{ read_at?: unknown; blocks?: unknown }>('previewPage', { body });",
    "client.call<unknown>('page', { slug })",
    '.then(({ createClient }) => createClient({ base: origin, fetch }).version())',
  ].join('\n');
  assert.deepEqual(methodsIn(text), ['boot', 'page', 'previewPage', 'version']);
});

test('each read is a method the client knows, sent with the verb the list says', async () => {
  const sent: string[] = [];
  const stub = (async (input: string | URL | Request, init?: RequestInit) => {
    sent.push(`${init?.method ?? 'GET'} ${new URL(String(input)).pathname}`);
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  const client = createClient({ base: 'https://example.test/acme', fetch: stub });
  for (const read of FIRST_DRAW) {
    sent.length = 0;
    const out = await client.call(read.method, {});
    assert.ok(out.ok || !('refusal' in out) || out.refusal.code !== 'ROUTE_UNKNOWN', `${read.method} is not a method of the client`);
    assert.deepEqual(sent, [`${read.post ? 'POST' : 'GET'} /acme/api/${read.method}`], read.method);
  }
});

test('a read named from another comes after the one it is named from, and boot comes first', () => {
  const at = (m: string) => FIRST_DRAW.findIndex((r) => r.method === m);
  assert.equal(FIRST_DRAW[0]!.method, 'boot');
  for (const [i, read] of FIRST_DRAW.entries()) {
    if (read.ask === 'pack') assert.ok(at('packs') < i, read.method);
    if (read.ask === 'page') assert.ok(at('pages') < i, read.method);
    if (read.ask === 'row') assert.ok(at('list') < i, read.method);
    if (read.ask !== 'bare') assert.ok(at('boot') < i, read.method);
  }
  assert.equal(new Set(FIRST_DRAW.map((r) => r.method)).size, FIRST_DRAW.length, 'a read is listed twice');
});
