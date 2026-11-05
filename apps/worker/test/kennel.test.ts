/**
 * The Kennel as the Cloud answers it (`src/kennel.ts`), over a map standing in for R2 and a function standing in for
 * the static assets: `index.json` is the bundled catalogue and whatever R2 lists, a signed file from a new key waits
 * for the operator, is listed with who and when, downloads byte for byte and is kept by a cache, and a yank by its key
 * marks it and leaves it downloadable.
 *
 * THE BUCKET HONOURS `onlyIf`, so a write that lost a race is seen to read again rather than write over the winner.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fileChecksum, newAuthorKey, signVersion, type CatalogueEntry, type CatalogueIndex } from '@braindog/declare/catalogue';
import { signYank } from '@braindog/declare/kennel';
import { sessionCookie } from '@braindog/host/auth';

import { serveKennel, type KennelBucket, type KennelDeps } from '../src/kennel.ts';

const NOW = new Date('2026-09-25T10:00:00Z');
const HOST = 'https://brain.example.test';
const OPERATOR = 'the-operator-key-of-this-test';
const BOOKS = { register: 'library', name: 'Books', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] };
const SHELF = { page: 'shelf', title: 'Shelf', requires: ['register.library'], blocks: [{ kind: 'table', source: 'register.library', span: 12 }] };

const addon = (version: string, id = 'bookshelf'): string =>
  JSON.stringify({ pack: id, version, title: 'Bookshelf', summary: `Books you own, as of ${version}.`, author: 'Halden', license: 'MIT', declarations: [BOOKS, SHELF] }, null, 2);

const PAD: CatalogueEntry = {
  kind: 'pack',
  id: 'pad',
  title: 'Pad',
  summary: 'A page to write on.',
  author: 'BrainDog',
  license: 'MIT',
  audience: 'addon',
  latest: '1.0.0',
  versions: [
    { version: '1.0.0', checksum: 'a'.repeat(64), bytes: 10, published_at: NOW.toISOString(), bump: null, reach: { modules: [], lists: [], pages: [], rules: [], examples: 0, skills: [], calls_out: [] } },
  ],
};
const BUNDLED: CatalogueIndex = { format: 1, name: 'BrainDog', entries: [PAD] };

/** The static assets: the bundled index and nothing else, and the app's shell with a 200 for any other path, as they answer. */
const assets = {
  fetch: async (request: Request): Promise<Response> =>
    new URL(request.url).pathname === '/catalogue/index.json'
      ? new Response(JSON.stringify(BUNDLED), { headers: { 'content-type': 'application/json' } })
      : new Response('<!doctype html><title>BrainDog</title>', { headers: { 'content-type': 'text/html' } }),
};

/**
 * R2 as a map, with an etag per write and `onlyIf` honoured; `lose` makes the next conditional write of one key lose,
 * and `fail` makes the next write of one key throw.
 */
function bucket() {
  const files = new Map<string, { text: string; etag: string }>();
  const losing = new Set<string>();
  const failing = new Set<string>();
  let writes = 0;
  const blobs: KennelBucket = {
    async get(key) {
      const file = files.get(key);
      return file === undefined ? null : { etag: file.etag, text: async () => file.text };
    },
    async put(key, value, options) {
      if (failing.delete(key)) throw new Error(`${key} was not written`);
      const want = options?.onlyIf?.etagMatches;
      if (want !== undefined && (losing.delete(key) || files.get(key)?.etag !== want)) return null;
      writes += 1;
      files.set(key, { text: value, etag: `etag-${writes}` });
      return {};
    },
    async delete(key) {
      files.delete(key);
    },
  };
  return { blobs, files, lose: (key: string) => losing.add(key), fail: (key: string) => failing.add(key) };
}

const depsOf = (blobs: KennelBucket | undefined): KennelDeps => ({
  blobs,
  assets,
  operator: OPERATOR,
  origin: HOST,
  session: async (said) =>
    said === 'good' ? { status: 200, body: { person: 'p_ada', email: 'ada@example.org', record: null, provedAt: 0 } } : { status: 401, refusal: { code: 'UNAUTHORIZED', fix: 'That did not sign you in.' } },
  bearer: { knows: async () => false, verify: async () => null, access: async () => null },
  now: () => NOW,
});

const at = (path: string): string => `${HOST}/api/kennel/v1/${path}`;
const get = (path: string, headers: Record<string, string> = {}): Request => new Request(at(path), { headers });
const post = (path: string, body: unknown, headers: Record<string, string> = {}): Request =>
  new Request(at(path), { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const operator = { authorization: `Bearer ${OPERATOR}` };

type Envelope = { ok: boolean; value?: Record<string, unknown>; refusal?: { code: string; at?: string } };
const read = async (res: Response): Promise<Envelope> => (await res.json()) as Envelope;

async function signedSubmission(text: string, key: Awaited<ReturnType<typeof newAuthorKey>>): Promise<Record<string, unknown>> {
  const doc = JSON.parse(text) as { pack: string; version: string };
  const signed = await signVersion(key, 'pack', doc.pack, doc.version, await fileChecksum(text), NOW);
  assert.ok(signed.ok, JSON.stringify(signed));
  return { text, signature: signed.value, publisher: { name: 'Halden Books' } };
}

test('the index is the bundled catalogue and what R2 lists; a signed file waits, is listed by the operator, and downloads as sent', async () => {
  const { blobs } = bucket();
  const deps = depsOf(blobs);

  const first = await serveKennel(get('index.json'), deps);
  assert.equal(first.status, 200);
  assert.equal(first.headers.get('access-control-allow-origin'), null);
  assert.equal(first.headers.get('cache-control'), 'no-store');
  assert.deepEqual(((await first.json()) as CatalogueIndex).entries.map((e) => e.id), ['pad']);

  const key = await newAuthorKey('Halden');
  const text = addon('1.0.0');
  const sent = await serveKennel(post('submit', await signedSubmission(text, key)), deps);
  const said = await read(sent);
  assert.equal(sent.status, 200, JSON.stringify(said));
  assert.deepEqual(said.value, { state: 'review', kind: 'pack', id: 'bookshelf', version: '1.0.0' });
  assert.equal((await serveKennel(get('packs/bookshelf/1.0.0.pack.json'), deps)).status, 404, 'a waiting file is served before review');

  assert.equal((await serveKennel(get('review'), deps)).status, 404);
  const waiting = await read(await serveKennel(get('review', operator), deps));
  assert.equal((waiting.value?.pending as unknown[]).length, 1);
  const shown = await read(await serveKennel(get('review?kind=pack&id=bookshelf&version=1.0.0', operator), deps));
  assert.equal(shown.value?.text, text, 'the operator cannot read a waiting file whole at review');
  assert.equal((await serveKennel(get('review?kind=pack&id=bookshelf', operator), deps)).status, 422);

  const verdict = await serveKennel(post('review', { kind: 'pack', id: 'bookshelf', version: '1.0.0', verdict: 'list', reason: 'Read it through.' }, operator), deps);
  assert.equal(verdict.status, 200, JSON.stringify(await verdict.clone().json()));

  const index = (await (await serveKennel(get('index.json'), deps)).json()) as CatalogueIndex;
  assert.deepEqual(index.entries.map((e) => e.id), ['bookshelf', 'pad']);
  const entry = index.entries.find((e) => e.id === 'bookshelf');
  assert.deepEqual(entry?.publisher, { kind: 'key', id: key.key_id, name: 'Halden Books' });
  assert.equal(entry?.versions[0]?.reviewed, NOW.toISOString());

  const file = await serveKennel(get('packs/bookshelf/1.0.0.pack.json'), deps);
  assert.equal(file.status, 200);
  assert.equal(file.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  assert.equal(await file.text(), text);

  const again = await read(await serveKennel(post('submit', await signedSubmission(text, key)), deps));
  assert.equal(again.refusal?.code, 'ALREADY_KNOWN');
  const pad = addon('1.0.0', 'pad');
  assert.equal((await read(await serveKennel(post('submit', await signedSubmission(pad, key)), deps))).refusal?.code, 'PROVIDES_CONFLICT');
});

test('a yank by the signing key marks the version, which still downloads by its exact version', async () => {
  const { blobs } = bucket();
  const deps = depsOf(blobs);
  const key = await newAuthorKey('Halden');
  const text = addon('1.0.0');
  assert.equal((await serveKennel(post('publisher', { publisher: `key:${key.key_id}`, trusted: true }, operator), deps)).status, 200);
  /* A TRUSTED PUBLISHER'S FIRST VERSION WAITS (it reaches everything new), and the operator lists it. */
  const waited = await read(await serveKennel(post('submit', await signedSubmission(text, key)), deps));
  assert.equal(waited.value?.state, 'review', JSON.stringify(waited));
  const listed = await read(await serveKennel(post('review', { kind: 'pack', id: 'bookshelf', version: '1.0.0', verdict: 'list', reason: '' }, operator), deps));
  assert.equal(listed.value?.state, 'listed', JSON.stringify(listed));
  /* A NEWER VERSION STAYS, so the entry is still in the store with the yanked one marked. */
  assert.equal((await serveKennel(post('submit', await signedSubmission(addon('1.0.1'), key)), deps)).status, 200);

  const reason = 'The shelf page drops rows.';
  const signed = await signYank(key, 'pack', 'bookshelf', '1.0.0', reason, NOW);
  assert.ok(signed.ok);
  const yanked = await serveKennel(post('yank', { kind: 'pack', id: 'bookshelf', version: '1.0.0', reason, signature: signed.value }), deps);
  assert.equal(yanked.status, 200, JSON.stringify(await yanked.clone().json()));

  const index = (await (await serveKennel(get('index.json'), deps)).json()) as CatalogueIndex;
  const entry = index.entries.find((e) => e.id === 'bookshelf');
  assert.deepEqual(entry?.versions.find((v) => v.version === '1.0.0')?.yanked, { reason, at: NOW.toISOString() });
  assert.equal(entry?.versions.find((v) => v.version === '1.0.1')?.yanked, undefined);
  const file = await serveKennel(get('packs/bookshelf/1.0.0.pack.json'), deps);
  assert.equal(file.status, 200);
  assert.equal(await file.text(), text);

  /* EVERY VERSION YANKED, THE ENTRY LEAVES THE STORE (`listedEntries`), and each version still downloads by its own. */
  const last = await signYank(key, 'pack', 'bookshelf', '1.0.1', reason, NOW);
  assert.ok(last.ok);
  assert.equal((await serveKennel(post('yank', { kind: 'pack', id: 'bookshelf', version: '1.0.1', reason, signature: last.value }), deps)).status, 200);
  const after = (await (await serveKennel(get('index.json'), deps)).json()) as CatalogueIndex;
  assert.equal(after.entries.find((e) => e.id === 'bookshelf'), undefined, 'an entry with nothing left to install is still listed');
  for (const version of ['1.0.0', '1.0.1']) assert.equal((await serveKennel(get(`packs/bookshelf/${version}.pack.json`), deps)).status, 200);
});

test('a trusted version whose copy did not land after its listing is served from its waiting copy, byte for byte', async () => {
  const { blobs, files, fail } = bucket();
  const deps = depsOf(blobs);
  const key = await newAuthorKey('Halden');
  assert.equal((await serveKennel(post('publisher', { publisher: `key:${key.key_id}`, trusted: true }, operator), deps)).status, 200);
  /* ITS FIRST VERSION WAITS AND IS LISTED BY THE OPERATOR; THE SECOND, REACHING NOTHING NEW, LISTS AT ONCE. */
  assert.equal((await read(await serveKennel(post('submit', await signedSubmission(addon('1.0.0'), key)), deps))).value?.state, 'review');
  assert.equal((await read(await serveKennel(post('review', { kind: 'pack', id: 'bookshelf', version: '1.0.0', verdict: 'list', reason: '' }, operator), deps))).value?.state, 'listed');
  const text = addon('1.0.1');

  fail('kennel/packs/bookshelf/1.0.1.pack.json');
  const body = await signedSubmission(text, key);
  /* QUIET WHILE IT ANSWERS, because the copy that fails is logged, as it is meant to be. */
  const loud = console.error;
  console.error = () => undefined;
  const listed = await serveKennel(post('submit', body), deps)
    .then(read)
    .finally(() => {
      console.error = loud;
    });
  assert.equal(listed.value?.state, 'listed', JSON.stringify(listed));
  assert.ok(!files.has('kennel/packs/bookshelf/1.0.1.pack.json'));

  const file = await serveKennel(get('packs/bookshelf/1.0.1.pack.json'), deps);
  assert.equal(file.status, 200);
  assert.equal(await file.text(), text);
});

test("an unsigned write is a person's only from this host's own pages, and a write that lost a race reads again", async () => {
  const { blobs, lose } = bucket();
  const deps = depsOf(blobs);
  const text = addon('1.0.0');
  const cookie = (sessionCookie('good', 'secure').split(';')[0] ?? '').trim();

  assert.equal((await serveKennel(post('submit', { text }), deps)).status, 401);
  assert.equal((await serveKennel(post('submit', { text }, { cookie, origin: 'https://elsewhere.example' }), deps)).status, 403);
  const sent = await read(await serveKennel(post('submit', { text }, { cookie, origin: HOST }), deps));
  assert.equal(sent.value?.state, 'review', JSON.stringify(sent));
  const first = await serveKennel(post('review', { kind: 'pack', id: 'bookshelf', version: '1.0.0', verdict: 'list', reason: '' }, operator), deps);
  assert.equal(first.status, 200, JSON.stringify(await first.clone().json()));

  /* THE INDEX EXISTS NOW, so its next write is conditional, and the first try of it loses to a write nobody here made. */
  const next = await read(await serveKennel(post('submit', { text: addon('1.0.1') }, { cookie, origin: HOST }), deps));
  assert.equal(next.value?.state, 'review', JSON.stringify(next));
  lose('kennel/index.json');
  const listed = await serveKennel(post('review', { kind: 'pack', id: 'bookshelf', version: '1.0.1', verdict: 'list', reason: '' }, operator), deps);
  assert.equal(listed.status, 200, JSON.stringify(await listed.clone().json()));
  const index = (await (await serveKennel(get('index.json'), deps)).json()) as CatalogueIndex;
  const entry = index.entries.find((e) => e.id === 'bookshelf');
  assert.equal(entry?.latest, '1.0.1');
  assert.deepEqual(entry?.publisher, { kind: 'person', id: 'p_ada', name: 'Halden' });
  const waiting = await read(await serveKennel(get('review', operator), deps));
  assert.deepEqual(waiting.value?.pending, [], 'a listed version is still waiting for review');
});

test('counts, a missing file, a wrong method, a host with no bucket or no operator key, and a spent write budget each answer as the Kennel says', async () => {
  const deps = depsOf(bucket().blobs);
  const counts = await serveKennel(get('counts.json'), deps);
  assert.equal(counts.status, 200);
  assert.deepEqual(await counts.json(), { at: NOW.toISOString(), counts: {} });

  const missing = await serveKennel(get('packs/nothing/1.0.0.pack.json'), deps);
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get('access-control-allow-origin'), null);
  assert.equal(missing.headers.get('cache-control'), 'no-store');
  assert.equal((await serveKennel(post('index.json', {}), deps)).status, 405);
  assert.equal((await serveKennel(get('../../boot'), deps)).status, 404);

  const bare = depsOf(undefined);
  assert.equal((await serveKennel(get('index.json'), bare)).status, 200);
  const refused = await serveKennel(post('submit', { text: addon('1.0.0') }), bare);
  assert.equal(refused.status, 501);
  assert.equal((await read(refused)).refusal?.code, 'NOT_IN_THIS_BUILD');

  const keyless = await serveKennel(get('review', operator), { ...depsOf(bucket().blobs), operator: undefined });
  assert.equal(keyless.status, 501);
  assert.equal((await read(keyless)).refusal?.code, 'NOT_IN_THIS_BUILD');

  /* THE BUDGET IS ASKED BEFORE THE BODY IS READ, and a read never spends it. */
  const spent = { ...depsOf(bucket().blobs), spend: async () => new Response(JSON.stringify({ ok: false, refusal: { code: 'RATE_LIMITED' } }), { status: 429 }) };
  assert.equal((await serveKennel(post('submit', { text: addon('1.0.0') }), spent)).status, 429);
  assert.equal((await serveKennel(get('index.json'), spent)).status, 200);
});

test('a key asking for its own submissions is told waiting, then declined with the operator\'s words, and nobody else is', async () => {
  const { blobs } = bucket();
  const deps = depsOf(blobs);
  const key = await newAuthorKey('Halden');
  const stranger = await newAuthorKey('Other');
  const asked = async (as: Awaited<ReturnType<typeof newAuthorKey>>): Promise<Record<string, unknown>[]> => {
    const signed = await signYank(as, 'pack', 'mine', '0.0.0', 'mine', NOW);
    assert.ok(signed.ok);
    const out = await read(await serveKennel(post('mine', { signature: signed.value }), deps));
    assert.equal(out.ok, true, JSON.stringify(out));
    return out.value?.rows as Record<string, unknown>[];
  };

  assert.equal((await read(await serveKennel(post('mine', {}), deps))).refusal?.code, 'UNAUTHORIZED', 'nobody signed is nobody');
  /* A SIGNATURE THAT IS NOT ONE IS A MALFORMED BODY, as a submission's is; ONE MADE OVER ANOTHER ASK IS NOBODY. */
  assert.equal((await serveKennel(post('mine', { signature: { alg: 'ed25519' } }), deps)).status, 422);
  const other = await signYank(key, 'pack', 'someone-elses', '0.0.0', 'mine', NOW);
  assert.ok(other.ok);
  assert.equal((await serveKennel(post('mine', { signature: other.value }), deps)).status, 401);

  assert.equal((await serveKennel(post('submit', await signedSubmission(addon('1.0.0'), key)), deps)).status, 200);
  assert.deepEqual((await asked(key)).map((r) => [r.id, r.version, r.state]), [['bookshelf', '1.0.0', 'waiting']]);
  assert.deepEqual(await asked(stranger), []);

  const reason = 'The shelf page shows rows nobody asked for.';
  assert.equal((await serveKennel(post('review', { kind: 'pack', id: 'bookshelf', version: '1.0.0', verdict: 'refuse', reason }, operator), deps)).status, 200);
  const declined = await asked(key);
  assert.deepEqual(declined.map((r) => [r.version, r.state, r.reason]), [['1.0.0', 'declined', reason]]);
  assert.deepEqual(await asked(stranger), []);

  /* THE FIX SENT AS A LATER VERSION REPLACES THE DECLINE IN WHAT THE PUBLISHER READS. */
  assert.equal((await serveKennel(post('submit', await signedSubmission(addon('1.0.1'), key)), deps)).status, 200);
  assert.deepEqual((await asked(key)).map((r) => [r.version, r.state]), [['1.0.1', 'waiting']]);
});

test('a private add-on of the bundled catalogue is never in the public index, and its file still downloads by its path', async () => {
  const BANK: CatalogueEntry = { ...PAD, id: 'bank-x', title: 'A bank', private: true };
  const files: Record<string, string> = {
    '/catalogue/index.json': JSON.stringify({ ...BUNDLED, entries: [PAD, BANK] }),
    '/catalogue/packs/bank-x/1.0.0.pack.json': '{"pack":"bank-x"}',
  };
  const own = {
    fetch: async (request: Request): Promise<Response> => {
      const text = files[new URL(request.url).pathname];
      return text === undefined
        ? new Response('<!doctype html><title>BrainDog</title>', { headers: { 'content-type': 'text/html' } })
        : new Response(text, { headers: { 'content-type': 'application/json' } });
    },
  };
  const deps = { ...depsOf(bucket().blobs), assets: own };
  const index = (await (await serveKennel(get('index.json'), deps)).json()) as CatalogueIndex;
  assert.deepEqual(index.entries.map((e) => e.id), ['pad']);
  assert.equal((await serveKennel(get('packs/bank-x/1.0.0.pack.json'), deps)).status, 200);
});

test('A SIGNED SUBMISSION FROM NOBODY SIGNED IN IS COUNTED BY ITS PLACE: a key is free to make, so the cap per publisher holds nobody', async () => {
  let asked = 0;
  const over = new Response(JSON.stringify({ ok: false, refusal: { code: 'RATE_LIMITED', fix: 'Later.' } }), { status: 429 });
  const deps = { ...depsOf(bucket().blobs), keySubmit: async () => (asked++, over) };
  const key = await newAuthorKey('Halden');
  const refused = await serveKennel(post('submit', await signedSubmission(addon('1.0.0'), key)), deps);
  assert.equal(refused.status, 429);
  assert.equal(asked, 1);
});
