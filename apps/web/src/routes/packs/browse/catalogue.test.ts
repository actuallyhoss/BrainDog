/**
 * A catalogue on browse: no catalogue is not an error, a file is held to its checksum, a record's standing against the
 * latest version, and what changed from the version installed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { exportUseCase } from '@braindog/declare';
import { emptyCatalogue, newAuthorKey, publishTo, type AuthorKey, type CatalogueIndex } from '@braindog/declare/catalogue';

import {
  askForVersion,
  catalogueText,
  catalogueTitles,
  changesSince,
  keepFirstKey,
  KNOWN_KEYS,
  loadKnownKeys,
  readHostCatalogue,
  signedWords,
  standingOf,
  trustFor,
  trustWords,
  updateProposal,
  updatesFor,
  type KeyStore,
} from './catalogue.ts';

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

const BOOKS = { register: 'books', name: 'Books', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] };
const SHELF = { page: 'shelf', title: 'Shelf', requires: ['register.books'], blocks: [{ kind: 'table', source: 'register.books', span: 12 }] };
const addon = (version: string, declarations: Record<string, unknown>[]) =>
  JSON.stringify({ pack: 'bookshelf', version, title: 'Bookshelf', summary: 'Books you own.', author: 'Halden', license: 'MIT', declarations });

/** An add-on at two versions, each signed by `key`, served as the self-host serves a catalogue folder. */
async function servedAddon(key: AuthorKey) {
  let index = emptyCatalogue('Signed');
  const files = new Map<string, string>();
  for (const text of [addon('1.0.0', [BOOKS]), addon('1.1.0', [BOOKS, SHELF])]) {
    const out = await publishTo(index, text, (p) => files.get(p) ?? null, new Date(), key);
    assert.ok(out.ok, JSON.stringify(out));
    index = out.value.index;
    files.set(out.value.path, text);
  }
  const fetcher = async (input: string) => {
    const text = files.get(input.replace(/^\/catalogue\//u, ''));
    return text === undefined ? new Response('', { status: 404 }) : new Response(text, { headers: { 'content-type': 'application/json' } });
  };
  return { index, fetcher, entry: index.entries[0]! };
}

const memoryStore = (): KeyStore & { held: Map<string, string> } => {
  const held = new Map<string, string>();
  return { held, getItem: (k) => held.get(k) ?? null, setItem: (k, v) => void held.set(k, v) };
};

test('an add-on is fetched by its kind, verified with its signature, and stands by its own id', async () => {
  const key = await newAuthorKey('Halden');
  const { entry, fetcher } = await servedAddon(key);
  assert.equal(entry.kind, 'pack');
  const got = await catalogueText(fetcher, entry, entry.versions[0]!);
  assert.ok(got.ok && got.signature?.key_id === key.key_id);
  assert.equal(signedWords(got.ok ? got.signature : null), `Signed by key ${key.key_id}`);
  assert.equal(signedWords(null), 'Unsigned');

  const forged = { ...entry.versions[0]!, signature: { ...entry.versions[0]!.signature!, sig: entry.versions[1]!.signature!.sig } };
  const bad = await catalogueText(fetcher, entry, forged);
  assert.equal(!bad.ok && bad.code, 'SIGNATURE_INVALID');

  assert.deepEqual(await standingOf(entry, [{ id: 'bookshelf', version: '1.0.0', disabled_at: null, registers: [] }]), { kind: 'update', from: '1.0.0' });
  assert.deepEqual(await standingOf(entry, [{ id: 'usecase-bookshelf', version: '1.0.0', disabled_at: null, registers: [] }]), { kind: 'install' });
  const changes = await changesSince(fetcher, entry, '1.0.0');
  assert.deepEqual(changes?.added.map((a) => a.title), ['Shelf']);
});

test('trust on first use: kept when asked for, said loudly for a different key, never written over, and fine without storage', async () => {
  const key = await newAuthorKey('Halden');
  const { entry } = await servedAddon(key);
  const signature = entry.versions[0]!.signature!;
  const store = memoryStore();

  const first = await trustFor(store, 'Halden', signature);
  assert.equal(first.kind, 'first');
  assert.equal(trustWords(first, 'Halden').loud, false);
  assert.equal(await keepFirstKey(store, 'Halden', first), true);
  assert.equal((await trustFor(store, 'Halden', signature)).kind, 'known');

  const other = await newAuthorKey('Mallory');
  const changed = await trustFor(store, 'Halden', { ...signature, key_id: other.key_id });
  assert.equal(changed.kind, 'changed');
  const said = trustWords(changed, 'Halden');
  assert.ok(said.loud && said.text.includes(key.key_id));
  assert.equal(await keepFirstKey(store, 'Halden', changed), false);
  assert.deepEqual(await loadKnownKeys(store), { Halden: [key.key_id] });

  /* A version with no signature where a key is kept is said as stripped, and one where none is kept as unsigned. */
  assert.equal((await trustFor(store, 'Halden', null)).kind, 'stripped');
  assert.equal((await trustFor(memoryStore(), 'Halden', null)).kind, 'unsigned');
  store.held.set(KNOWN_KEYS, 'not json');
  assert.deepEqual(await loadKnownKeys(store), {});
  const blocked = (): never => {
    throw new Error('blocked');
  };
  const broken: KeyStore = { getItem: blocked, setItem: blocked };
  assert.equal((await trustFor(broken, 'Halden', signature)).kind, 'first');
  assert.equal(await keepFirstKey(broken, 'Halden', first), false);
  assert.equal(await keepFirstKey(null, 'Halden', first), false);
});

test('asking on Decide files an add-on as its id and document, a use case as its text, and nothing for a file that does not verify', async () => {
  const key = await newAuthorKey('Halden');
  const { entry, fetcher } = await servedAddon(key);
  const filed: Record<string, unknown>[] = [];
  const call = async (_name: string, args: Record<string, unknown>) => {
    filed.push(args);
    return { ok: true as const, value: { id: 'P7' } };
  };

  const asked = await askForVersion(fetcher, call, entry, entry.versions[0]!, '1.0.0');
  assert.ok(asked.ok && asked.id === 'P7' && asked.signature?.key_id === key.key_id);
  const body = filed[0]!.body as { install: string; doc: { pack: string } };
  assert.equal(filed[0]!.body_kind, 'pack');
  assert.equal(body.install, 'bookshelf');
  assert.equal(body.doc.pack, 'bookshelf');
  assert.ok(String(filed[0]!.question).includes('Update Bookshelf from 1.0.0 to 1.1.0') && String(filed[0]!.question).includes(key.key_id));

  const tampered = async (input: string) => (input.endsWith('1.1.0.pack.json') ? new Response(addon('1.1.0', [BOOKS])) : fetcher(input));
  const refused = await askForVersion(tampered, call, entry, entry.versions[0]!, null);
  assert.equal(!refused.ok && refused.code, 'CHECKSUM_MISMATCH');
  assert.equal(filed.length, 1);

  const study = await served();
  const uc = study.index.entries[0]!;
  const ucAsked = await askForVersion(study.fetcher, call, uc, uc.versions[0]!, null);
  assert.ok(ucAsked.ok && ucAsked.signature === null);
  assert.equal(typeof (filed[1]!.body as { file: unknown }).file, 'string');
  assert.ok(String(filed[1]!.question).includes('Nobody signed it'));

  const no = await askForVersion(study.fetcher, async () => ({ ok: false as const, refusal: { fix: 'Only the owner can ask.', code: 'FORBIDDEN' } }), uc, uc.versions[0]!, null);
  assert.deepEqual(no, { ok: false, fix: 'Only the owner can ask.', code: 'FORBIDDEN' });
});

test('updates on offer for what a record holds, with what changed, and a proposal for each', async () => {
  const key = await newAuthorKey('Halden');
  const { index, fetcher } = await servedAddon(key);
  const held = [{ id: 'bookshelf', version: '1.0.0', disabled_at: null, registers: [] }];
  const { updates, refused } = await updatesFor(fetcher, index, held);
  assert.equal(refused.length, 0);
  assert.equal(updates.length, 1);
  assert.deepEqual(updates[0]!.changes?.added.map((a) => a.title), ['Shelf']);
  const proposal = await updateProposal(updates[0]!);
  assert.equal((proposal.body as { install: string }).install, 'bookshelf');

  const gone = await updatesFor(fetcher, index, [{ ...held[0]!, version: '0.9.0' }]);
  assert.equal(gone.updates[0]!.changes, null);
  assert.equal((await updatesFor(fetcher, index, [{ ...held[0]!, version: '1.1.0' }])).updates.length, 0);
  const missing = await updatesFor(async () => new Response('', { status: 404 }), index, held);
  assert.equal(missing.updates.length, 0);
  assert.equal(missing.refused.length, 1);
});

test('browse is named for both kinds it lists, and /packs names a catalogue entry by its title', async () => {
  const { copy } = await import('../../../lib/copy.ts');
  const { readFileSync } = await import('node:fs');
  const at = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
  assert.match(copy.browseTitle, /use cases/iu);
  assert.match(copy.browseTitle, /add-ons/iu);
  assert.match(copy.browseAll, /use cases/iu);
  assert.match(copy.browseAll, /add-ons/iu);
  assert.match(at('./+page.svelte'), /title=\{copy\.browseTitle\}/u);
  assert.match(at('./[id]/+page.svelte'), /\{copy\.browseAll\}/u);
  assert.doesNotMatch(at('./[id]/+page.svelte'), /copy\.useCase(s|All)\b/u);

  const key = await newAuthorKey('Halden');
  const { index } = await servedAddon(key);
  const study = await served();
  const titles = await catalogueTitles({ ...index, entries: [...index.entries, ...study.index.entries] });
  assert.equal(titles.get('bookshelf'), 'Bookshelf');
  assert.equal(titles.get('usecase-study'), 'Study');
  assert.equal((await catalogueTitles(null)).size, 0);
  assert.match(at('../+page.svelte'), /catalogueNames\.get\(id\)/u);
});

test('a use case on its catalogue page is asked for on Decide, as an add-on is, and never installed from the page', async () => {
  const { readFileSync } = await import('node:fs');
  const detail = readFileSync(new URL('./[id]/CatalogueDetail.svelte', import.meta.url), 'utf8');
  assert.doesNotMatch(detail, /InstallShared/u);
  assert.doesNotMatch(detail, /entry\.kind === 'pack'\}/u);
  assert.match(detail, /askForVersion\(/u);
});

test('a browser that kept an old key trusts and keeps the key it rotated to, and a revoked key is said plainly and never offered', async () => {
  const { addKeyStatement, revokeKey, rotateKey } = await import('@braindog/declare/catalogue');
  const old = await newAuthorKey('Halden');
  const next = await newAuthorKey('Halden');
  const { index, entry, fetcher } = await servedAddon(next);
  const signature = entry.versions[0]!.signature!;
  const store = memoryStore();
  store.setItem(KNOWN_KEYS, JSON.stringify({ Halden: [old.key_id] }));

  assert.equal((await trustFor(store, 'Halden', signature, index.keys)).kind, 'changed');
  const rotation = await rotateKey(old, next);
  assert.ok(rotation.ok);
  const rotated = await addKeyStatement(index, rotation.value);
  assert.ok(rotated.ok);
  const trust = await trustFor(store, 'Halden', signature, rotated.value.keys);
  assert.deepEqual(trust, { kind: 'rotated', key_id: next.key_id, from: old.key_id });
  const said = trustWords(trust, 'Halden');
  assert.ok(!said.loud && said.text.includes(old.key_id));
  assert.equal(await keepFirstKey(store, 'Halden', trust), true);
  assert.deepEqual(await loadKnownKeys(store), { Halden: [old.key_id, next.key_id] });

  /* A rotation someone else signed, planted in the index, counts for nothing. */
  const mallory = await newAuthorKey('Halden');
  const forged = await rotateKey(mallory, next);
  assert.ok(forged.ok);
  const planted = { rotations: [{ ...forged.value, from_key_id: old.key_id, from_public_key: old.public_key }], revocations: [] };
  assert.equal((await trustFor(memoryStore(), 'Halden', signature, planted)).kind, 'first');
  const fresh = memoryStore();
  fresh.setItem(KNOWN_KEYS, JSON.stringify({ Halden: [old.key_id] }));
  assert.equal((await trustFor(fresh, 'Halden', signature, planted)).kind, 'changed');

  const revocation = await revokeKey(next, 'The key was copied off a shared machine.');
  assert.ok(revocation.ok);
  const revoked = await addKeyStatement(rotated.value, revocation.value);
  assert.ok(revoked.ok);
  const untrusted = await trustFor(store, 'Halden', signature, revoked.value.keys);
  assert.equal(untrusted.kind, 'revoked');
  const notice = trustWords(untrusted, 'Halden');
  assert.ok(notice.loud);
  assert.equal(notice.text, 'Halden revoked the key that signed this version, so it is not trusted and cannot be asked for. Their reason: The key was copied off a shared machine.');
  assert.equal(await keepFirstKey(store, 'Halden', untrusted), false);

  const held = [{ id: 'bookshelf', version: '1.0.0', disabled_at: null, registers: [] }];
  const offered = await updatesFor(fetcher, revoked.value, held);
  assert.equal(offered.updates.length, 0);
  assert.match(offered.refused[0] ?? '', /which its author revoked, so it is not trusted/u);

  const { readFileSync } = await import('node:fs');
  const detail = readFileSync(new URL('./[id]/CatalogueDetail.svelte', import.meta.url), 'utf8');
  assert.match(detail, /trust\?\.kind !== 'revoked'/u);
});

test('a version arriving unsigned after signed ones is said loudly, cannot be asked for, and is not offered on /packs', async () => {
  const { keysSignedBefore, trustSubject } = await import('@braindog/declare/catalogue');
  const key = await newAuthorKey('Halden');
  const { index, entry, fetcher } = await servedAddon(key);
  const { signature: _s, ...bare } = entry.versions[0]!;
  const strippedEntry = { ...entry, versions: [bare, ...entry.versions.slice(1)] };
  const stripped = { ...index, entries: [strippedEntry] };
  const subject = trustSubject(entry);

  const trust = await trustFor(memoryStore(), subject, null, stripped.keys, await keysSignedBefore(strippedEntry, '1.1.0'));
  assert.equal(trust.kind, 'stripped');
  const said = trustWords(trust, 'Halden');
  assert.ok(said.loud && said.text.includes(key.key_id));

  const calls: string[] = [];
  const asked = await askForVersion(fetcher, async (name) => (calls.push(name), { ok: true, value: { id: '1' } }), strippedEntry, bare, '1.0.0');
  assert.equal(asked.ok, false);
  assert.deepEqual(calls, []);

  const offered = await updatesFor(fetcher, stripped, [{ id: 'bookshelf', version: '1.0.0', disabled_at: null, registers: [] }]);
  assert.equal(offered.updates.length, 0);
  assert.match(offered.refused[0] ?? '', /is unsigned, and earlier versions were signed/u);

  const { readFileSync } = await import('node:fs');
  const detail = readFileSync(new URL('./[id]/CatalogueDetail.svelte', import.meta.url), 'utf8');
  assert.match(detail, /trust\?\.kind !== 'stripped'|trust\?\.kind === 'stripped'/u);
  assert.doesNotMatch(detail, /trustFor\(browserStore\(\), entry\.author/u);
  const updates = readFileSync(new URL('../CatalogueUpdates.svelte', import.meta.url), 'utf8');
  assert.doesNotMatch(updates, /entry\.author, /u);
});
