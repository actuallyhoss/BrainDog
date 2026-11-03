/**
 * The Kennel's rules, held with no bucket (`src/kennel.ts`): a signed file from a new
 * key waits for review and is listed with who, what and when; the same version twice, an eleventh in a day and an id
 * BrainDog keeps are each refused by name; a yank by the key that signed it marks the version and keeps its file.
 *
 * THE HOST IS A FEW LINES HERE, applying each change in `Change`'s order to an index, a review file and a map of files,
 * which is all the Worker does with R2 (`apps/worker/src/kennel.ts`).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Result } from '@braindog/ports';

import { emptyCatalogue, fileChecksum, newAuthorKey, type CatalogueEntry, type CatalogueIndex } from '../src/catalogue.ts';
import {
  acceptSubmission,
  emptyPublishers,
  emptyReview,
  kennelAsk,
  mergeIndexes,
  publisherKey,
  reviewVerdict,
  roundCount,
  signYank,
  trustIn,
  yankIn,
  type Change,
  type Identity,
  type KennelState,
  type Publishers,
  type Review,
} from '../src/kennel.ts';
import { signVersion, type AuthorKey } from '../src/signing.ts';

const NOW = new Date('2026-09-25T10:00:00Z');
const BOOKS = { register: 'library', name: 'Books', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] };
const SHELF = { page: 'shelf', title: 'Shelf', requires: ['register.library'], blocks: [{ kind: 'table', source: 'register.library', span: 12 }] };

/** An add-on whose summary names its version, so each later version is a patch that changes words. */
const addon = (version: string, extra: Record<string, unknown> = {}, id = 'bookshelf'): string =>
  JSON.stringify({ pack: id, version, title: 'Bookshelf', summary: `Books you own, as of ${version}.`, author: 'Halden', license: 'MIT', declarations: [BOOKS, SHELF], ...extra }, null, 2);

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

const code = (r: Result<unknown>): string => (r.ok ? 'ok' : 'refusal' in r ? r.refusal.code : 'conflict');

/** A Kennel in memory: the three files and the published ones, each change applied as the Worker applies it. */
function kennel() {
  let index: CatalogueIndex = emptyCatalogue('Kennel');
  let review: Review = emptyReview();
  let publishers: Publishers = emptyPublishers();
  const files = new Map<string, string>();
  return {
    files,
    index: (): CatalogueIndex => index,
    review: (): Review => review,
    state: (): KennelState => ({ bundled: BUNDLED, reserved: ['usecase-personal'], index, review, publishers, read: (path) => files.get(path) ?? null }),
    apply(change: Change): void {
      for (const file of change.files) files.set(file.path, file.text);
      if (change.index) index = change.index;
      if (change.move) files.set(change.move.to, files.get(change.move.from) ?? '');
      if (change.review) review = change.review(review);
      for (const path of change.drop) files.delete(path);
    },
    trust(publisher: string): void {
      publishers = trustIn(publishers, { publisher, trusted: true }, NOW);
    },
  };
}

/** The identity a signed submission carries: the author's signature over the file's kind, id, version and checksum. */
async function signedBy(key: AuthorKey, text: string): Promise<Identity> {
  const doc = JSON.parse(text) as { pack: string; version: string };
  const signed = await signVersion(key, 'pack', doc.pack, doc.version, await fileChecksum(text), NOW);
  assert.ok(signed.ok, JSON.stringify(signed));
  return { kind: 'key', signature: signed.value, name: 'Halden Books' };
}

test("a signed add-on from a new key waits for review, and the operator's listing says who, what changed and when", async () => {
  const k = kennel();
  const key = await newAuthorKey('Halden');
  const text = addon('1.0.0', { changes: 'The first shelf.' });

  const sent = await acceptSubmission(k.state(), text, await signedBy(key, text), NOW);
  assert.ok(sent.ok, JSON.stringify(sent));
  assert.equal(sent.value.answer.state, 'review');
  assert.equal(sent.value.index, null, 'a submission from an untrusted key was listed before anybody looked at it');
  k.apply(sent.value);
  assert.equal(k.review().pending.length, 1);
  const waiting = `pending/${await fileChecksum(text)}/packs/bookshelf/1.0.0.pack.json`;
  assert.ok(k.files.has(waiting));
  assert.ok(!k.files.has('packs/bookshelf/1.0.0.pack.json'), 'a waiting file sits where a reader is served');

  /* A second version while the first waits is refused, so no bump is computed against a version that may be refused. */
  const next = addon('1.0.1');
  assert.equal(code(await acceptSubmission(k.state(), next, await signedBy(key, next), NOW)), 'ALREADY_KNOWN');

  const listed = reviewVerdict(k.state(), { kind: 'pack', id: 'bookshelf', version: '1.0.0', verdict: 'list', reason: 'Read it through.' }, NOW);
  assert.ok(listed.ok, JSON.stringify(listed));
  k.apply(listed.value);
  const entry = k.index().entries.find((e) => e.id === 'bookshelf');
  assert.deepEqual(entry?.publisher, { kind: 'key', id: key.key_id, name: 'Halden Books' });
  assert.ok(Array.isArray(entry?.categories), 'the listing has no categories');
  assert.ok(!entry?.categories?.includes('made-by-braindog'), 'a file from outside is listed as made by BrainDog');
  const version = entry?.versions[0];
  assert.equal(version?.notes, 'The first shelf.');
  assert.equal(version?.reviewed, NOW.toISOString());
  assert.equal(version?.signature?.key_id, key.key_id);
  assert.equal(k.files.get('packs/bookshelf/1.0.0.pack.json'), text, 'the listed file is not the one submitted, byte for byte');
  assert.ok(!k.files.has(waiting));
  assert.equal(k.review().pending.length, 0);

  assert.equal(code(await acceptSubmission(k.state(), text, await signedBy(key, text), NOW)), 'ALREADY_KNOWN');
  assert.deepEqual(
    mergeIndexes(BUNDLED, k.index()).entries.map((e) => e.id),
    ['bookshelf', 'pad'],
  );
});

test("a bundled id, another publisher's id, a key nobody named, a stray manifest key and a missing title are each refused", async () => {
  const k = kennel();
  const key = await newAuthorKey('Halden');
  const pad = addon('1.0.0', {}, 'pad');
  assert.equal(code(await acceptSubmission(k.state(), pad, await signedBy(key, pad), NOW)), 'PROVIDES_CONFLICT');

  const first = addon('1.0.0');
  const ada: Identity = { kind: 'person', id: 'p_ada' };
  const sent = await acceptSubmission(k.state(), first, ada, NOW);
  assert.ok(sent.ok, JSON.stringify(sent));
  k.apply(sent.value);
  const listed = reviewVerdict(k.state(), { kind: 'pack', id: 'bookshelf', version: '1.0.0', verdict: 'list', reason: '' }, NOW);
  assert.ok(listed.ok, JSON.stringify(listed));
  k.apply(listed.value);
  assert.deepEqual(k.index().entries[0]?.publisher, { kind: 'person', id: 'p_ada', name: 'Halden' });

  const second = addon('1.0.1');
  assert.equal(code(await acceptSubmission(k.state(), second, { kind: 'person', id: 'p_bea' }, NOW)), 'PROVIDES_CONFLICT');
  assert.equal(code(await acceptSubmission(k.state(), second, await signedBy(key, second), NOW)), 'PROVIDES_CONFLICT');
  const own = await acceptSubmission(k.state(), second, ada, NOW);
  assert.ok(own.ok, JSON.stringify(own));

  const stray = addon('1.0.0', { fill: 'rates' }, 'reading-shelf');
  assert.equal(code(await acceptSubmission(k.state(), stray, ada, NOW)), 'PACK_MALFORMED');
  const { title: _title, ...untitled } = JSON.parse(addon('1.0.0', {}, 'reading-shelf')) as Record<string, unknown>;
  const bare = await acceptSubmission(k.state(), JSON.stringify(untitled), ada, NOW);
  assert.ok(!bare.ok && 'refusal' in bare && bare.refusal.code === 'PACK_MALFORMED' && bare.refusal.at === 'title', JSON.stringify(bare));
  const named = await acceptSubmission(k.state(), addon('1.0.0', { author: 'BrainDog' }, 'reading-shelf'), ada, NOW);
  assert.equal(code(named), 'PROVIDES_CONFLICT', "a file from outside was taken under BrainDog's own name");
});

test('a trusted publisher lists at once a version that reaches nothing new, and an eleventh submission in a day waits until the first is a day old', async () => {
  const k = kennel();
  const key = await newAuthorKey('Halden');
  k.trust(publisherKey({ kind: 'key', id: key.key_id }));
  /* ITS FIRST VERSION REACHES EVERYTHING NEW, so it waits for a person like anybody's, and the operator lists it. */
  const firstText = addon('1.0.0');
  const first = await acceptSubmission(k.state(), firstText, await signedBy(key, firstText), NOW);
  assert.ok(first.ok, JSON.stringify(first));
  assert.equal(first.value.answer.state, 'review');
  k.apply(first.value);
  const looked = reviewVerdict(k.state(), { kind: 'pack', id: 'bookshelf', version: '1.0.0', verdict: 'list', reason: '' }, NOW);
  assert.ok(looked.ok, JSON.stringify(looked));
  k.apply(looked.value);
  for (let i = 1; i < 10; i += 1) {
    const text = addon(`1.0.${i}`);
    const out = await acceptSubmission(k.state(), text, await signedBy(key, text), NOW);
    assert.ok(out.ok, JSON.stringify(out));
    assert.equal(out.value.answer.state, 'listed');
    assert.ok(
      out.value.files.every((f) => f.path.startsWith('pending/')),
      'a trusted submission writes where readers are served before its index is written, so one that loses the race can too',
    );
    k.apply(out.value);
  }
  assert.equal(k.files.get('packs/bookshelf/1.0.0.pack.json'), addon('1.0.0'), 'a trusted listing is not copied to where readers are served');
  assert.ok(![...k.files.keys()].some((path) => path.startsWith('pending/')), 'a trusted listing leaves its waiting copy behind');
  assert.equal(k.index().entries[0]?.latest, '1.0.9');
  assert.equal(k.index().entries[0]?.versions[0]?.reviewed, undefined, 'a trusted listing says it was reviewed');

  const text = addon('1.0.10');
  const eleventh = await acceptSubmission(k.state(), text, await signedBy(key, text), NOW);
  assert.equal(code(eleventh), 'RATE_LIMITED');
  assert.ok(!eleventh.ok && 'refusal' in eleventh && (eleventh.refusal.retry_after ?? 0) > 0, 'the refusal does not say when to send it again');
  const tomorrow = await acceptSubmission(k.state(), text, await signedBy(key, text), new Date(NOW.getTime() + 86_400_001));
  assert.ok(tomorrow.ok, JSON.stringify(tomorrow));
});

test('a yank by the key that signed it marks the version and keeps its file; another key, another reason or another person does not', async () => {
  const k = kennel();
  const key = await newAuthorKey('Halden');
  k.trust(publisherKey({ kind: 'key', id: key.key_id }));
  const text = addon('1.0.0');
  const out = await acceptSubmission(k.state(), text, await signedBy(key, text), NOW);
  assert.ok(out.ok, JSON.stringify(out));
  k.apply(out.value);
  const looked = reviewVerdict(k.state(), { kind: 'pack', id: 'bookshelf', version: '1.0.0', verdict: 'list', reason: '' }, NOW);
  assert.ok(looked.ok, JSON.stringify(looked));
  k.apply(looked.value);
  const asked = { kind: 'pack' as const, id: 'bookshelf', version: '1.0.0', reason: 'The shelf page drops rows.' };

  const other = await newAuthorKey('Mallory');
  const theirs = await signYank(other, 'pack', 'bookshelf', '1.0.0', asked.reason, NOW);
  assert.ok(theirs.ok);
  assert.equal(code(await yankIn(k.index(), { ...asked, by: { kind: 'key', signature: theirs.value } }, NOW)), 'SIGNATURE_INVALID');
  const signed = await signYank(key, 'pack', 'bookshelf', '1.0.0', asked.reason, NOW);
  assert.ok(signed.ok);
  assert.equal(code(await yankIn(k.index(), { ...asked, reason: 'Another reason.', by: { kind: 'key', signature: signed.value } }, NOW)), 'SIGNATURE_INVALID');
  assert.equal(code(await yankIn(k.index(), { ...asked, by: { kind: 'person', id: 'p_ada' } }, NOW)), 'FORBIDDEN');

  const yanked = await yankIn(k.index(), { ...asked, by: { kind: 'key', signature: signed.value } }, NOW);
  assert.ok(yanked.ok, JSON.stringify(yanked));
  k.apply(yanked.value);
  const version = k.index().entries[0]?.versions.find((v) => v.version === '1.0.0');
  assert.deepEqual(version?.yanked, { reason: asked.reason, at: NOW.toISOString() });
  assert.equal(k.files.get('packs/bookshelf/1.0.0.pack.json'), text, 'a yanked version no longer downloads by its exact version');
  assert.equal(code(await yankIn(k.index(), { ...asked, by: { kind: 'operator' } }, NOW)), 'ALREADY_KNOWN');
});

test('the merged index keeps a bundled id for BrainDog, counts round down, and a path is read whole or not at all', () => {
  const squatter: CatalogueEntry = { ...PAD, title: 'Not BrainDog' };
  const theirs: CatalogueIndex = { format: 1, name: 'Kennel', entries: [squatter, { ...PAD, id: 'reading', title: 'Reading' }] };
  const merged = mergeIndexes(BUNDLED, theirs);
  assert.deepEqual(
    merged.entries.map((e) => `${e.id}:${e.title}`),
    ['pad:Pad', 'reading:Reading'],
  );
  assert.deepEqual(mergeIndexes(null, null).entries, []);

  assert.deepEqual([0, 9, 10, 49, 50, 99, 100, 499, 500, 999, 1000, 25_000].map(roundCount), [null, null, 10, 10, 50, 50, 100, 100, 500, 500, 1000, 1000]);

  const base = '/api/kennel/v1/';
  assert.deepEqual(kennelAsk('GET', `${base}index.json`), { ask: 'index' });
  assert.deepEqual(kennelAsk('HEAD', `${base}counts.json`), { ask: 'counts' });
  assert.deepEqual(kennelAsk('GET', `${base}packs/pad/1.2.0.pack.json`), { ask: 'file', path: 'packs/pad/1.2.0.pack.json', kind: 'pack', id: 'pad', version: '1.2.0' });
  assert.deepEqual(kennelAsk('GET', `${base}usecases/study/1.0.0.preview.json`), { ask: 'preview', path: 'usecases/study/1.0.0.preview.json', kind: 'usecase', id: 'study', version: '1.0.0' });
  assert.deepEqual(kennelAsk('GET', `${base}packs/pad/1.2.0.usecase.json`), { wrong: 'path' });
  assert.deepEqual(kennelAsk('GET', `${base}packs/../index.json`), { wrong: 'path' });
  assert.deepEqual(kennelAsk('GET', `${base}pending/packs/pad/1.2.0.pack.json`), { wrong: 'path' });
  assert.deepEqual(kennelAsk('POST', `${base}index.json`), { wrong: 'method', allow: 'GET, HEAD' });
  assert.deepEqual(kennelAsk('GET', `${base}submit`), { wrong: 'method', allow: 'POST' });
  assert.deepEqual(kennelAsk('GET', `${base}review`), { ask: 'review' });
  assert.deepEqual(kennelAsk('POST', `${base}review`), { ask: 'verdict' });
});
