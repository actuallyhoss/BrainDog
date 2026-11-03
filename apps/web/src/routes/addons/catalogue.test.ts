/**
 * A catalogue on browse: no catalogue is not an error, a file is held to its checksum, a record's standing against the
 * latest version, and what changed from the version installed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { exportUseCase, MODULES } from '@braindog/declare';
import { emptyCatalogue, newAuthorKey, publishTo, type AuthorKey, type CatalogueEntry, type CatalogueIndex, type CatalogueVersion } from '@braindog/declare/catalogue';

import {
  askForVersion,
  byBrainDog,
  callSaid,
  catalogueText,
  catalogueTitles,
  changesSince,
  keepFirstKey,
  KNOWN_KEYS,
  loadKnownKeys,
  readHostCatalogue,
  STORE_UNREACHED,
  signedWords,
  signedLine,
  standingOf,
  trustFor,
  trustLine,
  trustWords,
  withheld,
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
  /* AT THE KENNEL, which every host answers at the origin (`/api/kennel/v1/`): anything else is the app shell's 404
     page, and the catalogue would quietly read as absent. */
  const fetcher = async (input: string) => {
    if (!input.startsWith('/api/kennel/v1/')) return new Response('<!doctype html>', { status: 404, headers: { 'content-type': 'text/html' } });
    const path = input.slice('/api/kennel/v1/'.length);
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

test('a catalogue that is there and refuses, fails or cannot be reached says so, and is not a host with none', async () => {
  const json = { 'content-type': 'application/json' };
  for (const answer of [
    async () => new Response('{"ok":false}', { status: 403, headers: json }),
    async () => new Response('{"ok":false}', { status: 503, headers: json }),
    async () => {
      throw new TypeError('fetch failed');
    },
  ]) {
    const got = await readHostCatalogue(answer);
    assert.deepEqual(got, { ok: false, fix: STORE_UNREACHED, retry: true });
  }
  assert.match(STORE_UNREACHED, /^The store could not be reached/u);
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

const BOOKS = { register: 'library', name: 'Books', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] };
const SHELF = { page: 'shelf', title: 'Shelf', requires: ['register.library'], blocks: [{ kind: 'table', source: 'register.library', span: 12 }] };
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
    const text = input.startsWith('/api/kennel/v1/') ? files.get(input.slice('/api/kennel/v1/'.length)) : undefined;
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
  assert.equal(signedWords(null), 'Not checked');

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

test('asking in Needs you files an add-on as its id and document, a use case as its text, and nothing for a file that does not verify', async () => {
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

test('browse is Add-ons, starters first, and /packs names a catalogue entry by its title', async () => {
  const { copy } = await import('../../lib/copy.ts');
  const { words: market } = await import('../../lib/market/words.ts');
  const { readFileSync } = await import('node:fs');
  const at = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
  /* ONE PLACE, ONE NAME (agents F9): browse is the other half of Add-ons, and its sections
     name the kinds. */
  assert.equal(copy.packs, 'Plugins');
  /* STARTERS FIRST, THEN SHELVES BY PURPOSE, and never where a thing came from. */
  assert.equal(market.store.starters, 'Starters');
  assert.doesNotMatch(JSON.stringify(market), /From others|"Doors"/u);
  assert.match(copy.browseAll, /starters/iu);
  assert.match(copy.browseAll, /plugins/iu);
  assert.match(at('../plugins/+page.svelte'), /title=\{words\.plugins\}/u);
  assert.match(at('./[id]/Listing.svelte'), /\{copy\.browseAll\}/u);
  assert.doesNotMatch(at('./[id]/Listing.svelte'), /copy\.useCase(s|All)\b/u);

  const key = await newAuthorKey('Halden');
  const { index } = await servedAddon(key);
  const study = await served();
  const titles = await catalogueTitles({ ...index, entries: [...index.entries, ...study.index.entries] });
  assert.equal(titles.get('bookshelf'), 'Bookshelf');
  assert.equal(titles.get('usecase-study'), 'Study');
  assert.equal((await catalogueTitles(null)).size, 0);
  assert.match(at('./Installed.svelte'), /catalogueNames\.get\(id\)/u);
});

test('a listing page installs through the plan sheet, and a Kennel entry is asked for in Needs you by somebody who may not install', async () => {
  const { readFileSync } = await import('node:fs');
  const detail = readFileSync(new URL('./[id]/Listing.svelte', import.meta.url), 'utf8');
  const offer = readFileSync(new URL('./[id]/offer.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(detail, /InstallShared/u);
  assert.match(detail, /<PlanSheet/u);
  assert.match(detail, /notOwner\(out\.code\)/u);
  assert.match(offer, /askForVersion\(/u);
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
  const detail = readFileSync(new URL('./[id]/Listing.svelte', import.meta.url), 'utf8');
  assert.match(detail, /trust\?\.kind === 'revoked'/u);
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
  const detail = readFileSync(new URL('./[id]/Listing.svelte', import.meta.url), 'utf8');
  assert.match(detail, /trust\?\.kind !== 'stripped'|trust\?\.kind === 'stripped'/u);
  assert.doesNotMatch(detail, /trustFor\(browserStore\(\), entry\.author/u);
});

test('a file whose own id is not the entry it is listed under is not asked for', async () => {
  const { entry, fetcher } = await servedAddon(await newAuthorKey('Halden'));
  const { signature: _s, ...bare } = entry.versions[0]!;
  const other = { ...entry, id: 'other', title: 'Other', versions: [bare] };
  const moved = async (input: string) => fetcher(input.replace('/packs/other/', '/packs/bookshelf/'));
  const calls: string[] = [];
  const asked = await askForVersion(moved, async (name) => (calls.push(name), { ok: true, value: { id: '1' } }), other, bare, null);
  assert.ok(!asked.ok && /is listed as Other 1\.1\.0 and the file inside is bookshelf 1\.1\.0/u.test(asked.fix), JSON.stringify(asked));
  assert.deepEqual(calls, []);
});

/* ── the packs in packs/, in the catalogue this app ships ───────────────── */

/*
 * THE PACKS IN `packs/` ARE PUBLISHED. Before this, `static/catalogue/index.json` listed one add-on,
 * `reading-list`, and none of the four packs in `packs/`, so Browse had nothing of theirs to draw and a host could
 * resolve none of their ids. `tools/catalogue/from-packs.mjs` publishes each one into this folder through `publishTo`,
 * the door `braindog pack publish` uses, so a version is never rewritten under readers who hold it to its checksum.
 */
const ROOT = new URL('../../../../../', import.meta.url);
const TOOL = fileURLToPath(new URL('tools/catalogue/from-packs.mjs', ROOT));
const SHIPPED = new URL('apps/web/static/catalogue/', ROOT);

/** Each `packs/<folder>/<folder>.pack.json`, as its text. */
function packFiles(dir: string): { folder: string; text: string }[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(dir, d.name, `${d.name}.pack.json`)))
    .map((d) => ({ folder: d.name, text: readFileSync(join(dir, d.name, `${d.name}.pack.json`), 'utf8') }));
}

test('the catalogue this app ships lists every pack in packs/, at its version, byte for byte', async () => {
  const { catalogueFile, fileChecksum, readCatalogue } = await import('@braindog/declare/catalogue');
  const index = readCatalogue(JSON.parse(readFileSync(new URL('index.json', SHIPPED), 'utf8')));
  assert.ok(index.ok, JSON.stringify(index));
  const packs = packFiles(fileURLToPath(new URL('packs/', ROOT)));
  assert.ok(packs.some((p) => p.folder === 'project-brief'), 'packs/project-brief is gone, so this test proves nothing');
  for (const { folder, text } of packs) {
    const { pack, version } = JSON.parse(text) as { pack: string; version: string };
    /* A MODULE'S OWN FILE WAITS FOR THE MODULE TO GO: the catalogue tool passes it over until then, and it is
       published when the module is taken out, so it is not looked for here. */
    if ((MODULES as readonly string[]).includes(pack)) continue;
    const entry: CatalogueEntry | undefined = index.value.entries.find((e) => e.kind === 'pack' && e.id === pack);
    assert.ok(entry, `packs/${folder} (${pack}) is not in the shipped catalogue, which lists ${index.value.entries.map((e) => e.id).join(', ')}. Run node tools/catalogue/from-packs.mjs.`);
    const listed: CatalogueVersion | undefined = entry.versions.find((v) => v.version === version);
    assert.ok(listed, `packs/${folder} is at ${version} and the catalogue has ${entry.versions.map((v) => v.version).join(', ')}. Run node tools/catalogue/from-packs.mjs.`);
    assert.equal(listed.checksum, await fileChecksum(text), `packs/${folder} changed after ${version} was published. Give it a later version.`);
    assert.equal(readFileSync(new URL(catalogueFile(pack, version, 'pack'), SHIPPED), 'utf8'), text);
  }
});

/** The tool run over a folder of packs into a catalogue folder: its exit code and everything it said. */
/* A RUN WITHOUT `--check` WRITES, whatever the runner sets: the tool checks rather than writes where `CI` is set. */
const { CI: _ci, ...plainEnv } = process.env;

function run(packs: string, to: string, ...flags: string[]): { code: number; said: string } {
  try {
    return { code: 0, said: execFileSync(process.execPath, [TOOL, '--packs', packs, '--to', to, ...flags], { encoding: 'utf8', stdio: 'pipe', env: plainEnv }) };
  } catch (e) {
    const x = e as { status?: number; stdout?: string; stderr?: string };
    return { code: x.status ?? 1, said: `${x.stdout ?? ''}${x.stderr ?? ''}` };
  }
}

/** The least a test file must be for the tool to count it: a call to `test(` that names the pack's own file. */
const testOf = (folder: string) => `import { test } from 'node:test';\n\ntest('${folder}.pack.json installs as it ships', () => {});\n`;

test('from-packs publishes a pack once, leaves it alone after, and refuses one with no test, an empty test or one changed under its version', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-from-packs-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const packs = join(dir, 'packs');
  const to = join(dir, 'catalogue');
  const shelf = (version: string, summary: string) =>
    `${JSON.stringify({ pack: 'shelf', version, title: 'Shelf', summary, author: 'Halden', license: 'MIT', requires: { format: 1, primitives: 1, packs: {} }, declarations: [READING] }, null, 2)}\n`;
  mkdirSync(join(packs, 'shelf'), { recursive: true });
  writeFileSync(join(packs, 'shelf', 'shelf.pack.json'), shelf('1.0.0', 'Books.'));
  writeFileSync(join(packs, 'shelf', 'shelf.test.ts'), testOf('shelf'));
  /* A FOLDER WITH NO PACK FILE IN IT is not a pack, and is passed over: an import adapter lives in `packs/` too. */
  mkdirSync(join(packs, 'adapter'));

  const first = run(packs, to);
  assert.equal(first.code, 0, first.said);
  assert.equal(readFileSync(join(to, 'packs', 'shelf', '1.0.0.pack.json'), 'utf8'), shelf('1.0.0', 'Books.'));
  const index = readFileSync(join(to, 'index.json'), 'utf8');
  assert.match(index, /"id": "shelf"/u);

  /* THE SAME FILE AGAIN WRITES NOTHING, so the index does not take a new date on every build. */
  const again = run(packs, to);
  assert.equal(again.code, 0, again.said);
  assert.equal(readFileSync(join(to, 'index.json'), 'utf8'), index);

  writeFileSync(join(packs, 'shelf', 'shelf.pack.json'), shelf('1.0.0', 'Books, and more.'));
  const changed = run(packs, to);
  assert.equal(changed.code, 1);
  assert.match(changed.said, /packs\/shelf.*a published version never changes/u);
  assert.equal(readFileSync(join(to, 'index.json'), 'utf8'), index);

  writeFileSync(join(packs, 'shelf', 'shelf.pack.json'), shelf('1.0.1', 'Books, and more.'));
  rmSync(join(packs, 'shelf', 'shelf.test.ts'));
  const untested = run(packs, to);
  assert.equal(untested.code, 1);
  assert.match(untested.said, /packs\/shelf has no test/u);
  assert.equal(readFileSync(join(to, 'index.json'), 'utf8'), index);

  /* AN EMPTY FILE WITH A TEST'S NAME IS NO TEST, and is refused in the sentence a missing one gets. It used to publish. */
  writeFileSync(join(packs, 'shelf', 'bands.test.ts'), '');
  const empty = run(packs, to);
  assert.equal(empty.code, 1, empty.said);
  assert.match(empty.said, /packs\/shelf has no test/u);
  assert.equal(readFileSync(join(to, 'index.json'), 'utf8'), index);

  /* NOR IS ONE THAT NAMES THE PACK AND CALLS NO TEST (a regex's `.test(` is not one), or one that calls a test and
     never names the pack. */
  writeFileSync(join(packs, 'shelf', 'bands.test.ts'), "// shelf.pack.json is tested elsewhere\n");
  assert.match(run(packs, to).said, /packs\/shelf has no test/u);
  writeFileSync(join(packs, 'shelf', 'bands.test.ts'), "/shelf/.test('shelf.pack.json');\n");
  assert.match(run(packs, to).said, /packs\/shelf has no test/u);
  writeFileSync(join(packs, 'shelf', 'bands.test.ts'), testOf('aisle'));
  assert.match(run(packs, to).said, /packs\/shelf has no test/u);
  assert.equal(readFileSync(join(to, 'index.json'), 'utf8'), index);

  writeFileSync(join(packs, 'shelf', 'bands.test.ts'), testOf('shelf'));
  const later = run(packs, to);
  assert.equal(later.code, 0, later.said);
  assert.match(readFileSync(join(to, 'index.json'), 'utf8'), /"latest": "1\.0\.1"/u);
});

/*
 * NOTHING IS WRITTEN UNLESS EVERY PACK PASSES. The test above has one pack, so a refusal there is always the first pack
 * and a tool that wrote each pack as it passed would leave the same folder behind. Checked by writing each file and the
 * index inside the per-pack loop: every assertion above still held. Here a good pack sorts before a refused one.
 */
test('from-packs writes nothing when a later pack is refused, not even the good pack before it', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-from-packs-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const packs = join(dir, 'packs');
  const to = join(dir, 'catalogue');
  const pack = (id: string) =>
    `${JSON.stringify({ pack: id, version: '1.0.0', title: id, summary: 'Books.', author: 'Halden', license: 'MIT', requires: { format: 1, primitives: 1, packs: {} }, declarations: [READING] }, null, 2)}\n`;
  for (const id of ['aisle', 'shelf']) {
    mkdirSync(join(packs, id), { recursive: true });
    writeFileSync(join(packs, id, `${id}.pack.json`), pack(id));
  }
  writeFileSync(join(packs, 'aisle', 'aisle.test.ts'), testOf('aisle'));

  const refused = run(packs, to);
  assert.equal(refused.code, 1, refused.said);
  assert.match(refused.said, /packs\/shelf has no test/u);
  assert.equal(existsSync(to), false, 'the refused run wrote into the catalogue');
});

/*
 * `--check` WRITES NOTHING AND SAYS WHAT A RUN WOULD. The build in CI runs the tool this way, so a pack edited without a
 * new version, or one whose test was emptied, fails the build step by name rather than leaving a changed tracked file.
 */
test('from-packs --check writes nothing, exits 1 naming an unpublished change, and 0 once it is published', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-from-packs-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const packs = join(dir, 'packs');
  const to = join(dir, 'catalogue');
  const shelf = (version: string) =>
    `${JSON.stringify({ pack: 'shelf', version, title: 'Shelf', summary: 'Books.', author: 'Halden', license: 'MIT', requires: { format: 1, primitives: 1, packs: {} }, declarations: [READING] }, null, 2)}\n`;
  mkdirSync(join(packs, 'shelf'), { recursive: true });
  writeFileSync(join(packs, 'shelf', 'shelf.pack.json'), shelf('1.0.0'));
  writeFileSync(join(packs, 'shelf', 'shelf.test.ts'), testOf('shelf'));

  const unpublished = run(packs, to, '--check');
  assert.equal(unpublished.code, 1, unpublished.said);
  /* THE BUILT-IN USE CASES ARE PUBLISHED BESIDE EVERY PACK (`from-packs.mjs`), so a fresh catalogue gets them too. */
  assert.match(unpublished.said, /a run would write packs\/shelf\/1\.0\.0\.pack\.json, (?:usecases\/[a-z-]+\/[\d.]+\.usecase\.json, )*index\.json/u);
  assert.equal(existsSync(to), false, '--check wrote into the catalogue');

  assert.equal(run(packs, to).code, 0);
  const index = readFileSync(join(to, 'index.json'), 'utf8');
  const clean = run(packs, to, '--check');
  assert.equal(clean.code, 0, clean.said);
  assert.match(clean.said, /every pack in .* is already in/u);

  writeFileSync(join(packs, 'shelf', 'shelf.pack.json'), shelf('1.0.1'));
  const bumped = run(packs, to, '--check');
  assert.equal(bumped.code, 1, bumped.said);
  assert.match(bumped.said, /packs\/shelf\/1\.0\.1\.pack\.json/u);
  assert.equal(existsSync(join(to, 'packs', 'shelf', '1.0.1.pack.json')), false);
  assert.equal(readFileSync(join(to, 'index.json'), 'utf8'), index);

  /* AND THE REFUSALS ARE THE SAME UNDER --check: an emptied test fails it by the pack's name. */
  writeFileSync(join(packs, 'shelf', 'shelf.test.ts'), '');
  const emptied = run(packs, to, '--check');
  assert.equal(emptied.code, 1);
  assert.match(emptied.said, /packs\/shelf has no test/u);
});

test('the line under an add-on\'s name names its publisher, never a key, in one of three sentences, and a changed key is withheld until pressed', async () => {
  const key = await newAuthorKey('Halden');
  const { entry } = await servedAddon(key);
  const signature = entry.versions[0]!.signature!;
  const store = memoryStore();

  const first = await trustFor(store, 'Halden', signature);
  assert.deepEqual(trustLine(first, 'Halden Press'), { text: 'First plugin you have seen from Halden Press', loud: false });
  assert.equal(withheld(first), false);
  await keepFirstKey(store, 'Halden', first);
  const known = await trustFor(store, 'Halden', signature);
  assert.deepEqual(trustLine(known, 'Halden Press'), { text: 'Signed by Halden Press, as before', loud: false });

  const other = await newAuthorKey('Mallory');
  const changed = await trustFor(store, 'Halden', { ...signature, key_id: other.key_id });
  const said = trustLine(changed, 'Halden Press');
  assert.deepEqual(said, { text: 'Signed by a different key than before', loud: true });
  assert.equal(withheld(changed), true);
  for (const t of [first, known, changed]) assert.doesNotMatch(trustLine(t, 'Halden Press').text, /[0-9a-f]{16}|—/u);
  assert.equal(withheld({ kind: 'revoked', key_id: key.key_id, reason: 'Lost.' }), true);
  assert.equal(withheld({ kind: 'stripped', before: [key.key_id] }), true);
  assert.equal(withheld({ kind: 'rotated', key_id: key.key_id, from: other.key_id }), false);
  assert.equal(withheld(null), false);

  const { readFileSync } = await import('node:fs');
  const detail = readFileSync(new URL('./[id]/Listing.svelte', import.meta.url), 'utf8');
  assert.match(detail, /recordKeys\(/u);
  /* THROUGH `trustSaid`, which is `trustLine` but for BrainDog's own unsigned add-ons. */
  assert.match(detail, /trustSaid\(/u);
  assert.match(detail, /trustThisKey\(/u);
  assert.match(detail, /Trust this key/u);
  assert.doesNotMatch(detail, /trustForEntry\(browserStore\(\)/u);
});

/* A STORE PAGE SAYS WHAT AN ADD-ON CALLS IN A PERSON'S WORDS, never the kernel's line. */

test('what an add-on calls out to is a sentence: the host, how often, and the key by its name', () => {
  assert.equal(callSaid({ host: 'api.kiln.example', key: 'kiln', line: 'CALLS OUT api.kiln.example · every 1h · key "kiln" to the host its Keychain entry opens' }), 'Calls api.kiln.example every hour with your Kiln key');
  assert.equal(callSaid({ host: 'api.kiln.example', key: null, line: 'CALLS OUT api.kiln.example · every 6h · no key' }), 'Calls api.kiln.example every 6 hours');
  assert.equal(
    callSaid({ host: 'glaze.example', key: 'glaze', line: 'CALLS OUT glaze.example · when a rule runs it, at most 100 a day · grant "glaze"' }),
    'Calls glaze.example when a rule runs it, at most 100 a day, with your Glaze key',
  );
  assert.equal(callSaid({ host: null, key: null, line: 'CALLS OUT no host declared · daily · no key' }), 'Calls a service it does not name daily');
  for (const s of [callSaid({ host: 'a.example', key: 'k', line: 'CALLS OUT a.example · every 1h · grant "k"' })]) assert.doesNotMatch(s, /CALLS OUT|grant|·/u);
});

test('BrainDog’s own add-ons say no signature line: By BrainDog is the whole of who made it', () => {
  assert.equal(byBrainDog({ source: 'kennel', author: 'BrainDog', publisher: null }), true);
  assert.equal(byBrainDog({ source: 'kennel', author: 'Mara', publisher: null }), false);
  assert.equal(byBrainDog({ source: 'bundled', author: 'Mara', publisher: null }), true);
  assert.equal(signedLine(null, true), null, 'no "Not checked" under each of its versions');
  assert.equal(signedLine(null, false), signedWords(null));
  assert.equal(signedLine({ key_id: 'k1' } as never, true), signedWords({ key_id: 'k1' } as never));
});
