/**
 * What the Kennel never does, held in one file: no rating, no price, no remote asset, no listing before review.
 *
 * A CONFORMANCE FILE, so each rule is one test named for the rule, and a change that lets one through fails by that
 * name. The Kennel is in memory, as `kennel.test.ts` holds it: an index, a review file and a map of files.
 *
 * THE DOOR MAKES THE ADDRESS CHECK ITSELF (`acceptSubmission` in `src/kennel.ts`), and the check and the sentence it
 * says are held here beside it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Result } from '@braindog/ports';

import { addressFault, listingFault } from '../src/address.ts';
import { emptyCatalogue, fileChecksum, newAuthorKey, type CatalogueIndex } from '../src/catalogue.ts';
import { acceptSubmission, emptyPublishers, emptyReview, mergeIndexes, publisherKey, reviewVerdict, trustIn, type Change, type Identity, type KennelState, type Publishers, type Review } from '../src/kennel.ts';
import { signVersion, type AuthorKey } from '../src/signing.ts';

const NOW = new Date('2026-10-13T10:00:00Z');
const BOOKS = { register: 'library', name: 'Books', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] };
const shelf = (...more: Record<string, unknown>[]): Record<string, unknown> => ({
  page: 'shelf',
  title: 'Shelf',
  requires: ['register.library'],
  blocks: [{ kind: 'table', source: 'register.library', span: 12 }, ...more],
});

const addon = (extra: Record<string, unknown> = {}, page: Record<string, unknown> = shelf()): string =>
  JSON.stringify({ pack: 'bookshelf', version: '1.0.0', title: 'Bookshelf', summary: 'Books you own.', author: 'Halden', license: 'MIT', declarations: [BOOKS, page], ...extra }, null, 2);

const BUNDLED: CatalogueIndex = { format: 1, name: 'BrainDog', entries: [] };
const LISTED_AT = 'packs/bookshelf/1.0.0.pack.json';

const refusal = (r: Result<unknown>): { code: string; at: string; fix: string } | null =>
  !r.ok && 'refusal' in r ? { code: r.refusal.code, at: r.refusal.at ?? '', fix: r.refusal.fix } : null;

/** A Kennel in memory, each change applied in `Change`'s order, as the Worker applies it to its bucket. */
function kennel() {
  let index: CatalogueIndex = emptyCatalogue('Kennel');
  let review: Review = emptyReview();
  let publishers: Publishers = emptyPublishers();
  const files = new Map<string, string>();
  return {
    files,
    index: (): CatalogueIndex => index,
    review: (): Review => review,
    state: (): KennelState => ({ bundled: BUNDLED, reserved: [], index, review, publishers, read: (path) => files.get(path) ?? null }),
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

async function signedBy(key: AuthorKey, text: string): Promise<Identity> {
  const doc = JSON.parse(text) as { pack: string; version: string };
  const signed = await signVersion(key, 'pack', doc.pack, doc.version, await fileChecksum(text), NOW);
  assert.ok(signed.ok, JSON.stringify(signed));
  return { kind: 'key', signature: signed.value, name: 'Halden Books' };
}

/** A Kennel and a publisher it trusts, so nothing but the file stands between a submission and a listing. */
async function trusted() {
  const k = kennel();
  const key = await newAuthorKey('Halden');
  k.trust(publisherKey({ kind: 'key', id: key.key_id }));
  return { k, key };
}

/** Every key anywhere in a value, so a listing can be asked whether it says a word at all. */
function keysOf(v: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) for (const x of v) keysOf(x, out);
  else if (v !== null && typeof v === 'object')
    for (const [k, x] of Object.entries(v)) {
      out.add(k.toLowerCase());
      keysOf(x, out);
    }
  return out;
}

/** A file whose manifest says `key` is refused at the door by that name, by a publisher the Kennel trusts, and nothing is written. */
async function refusedByName(key: string, value: unknown, says: RegExp): Promise<void> {
  const { k, key: author } = await trusted();
  const text = addon({ [key]: value });
  assert.match(listingFault(JSON.parse(text))?.fix ?? '', says, `${key} is not refused in its own sentence`);

  const sent = await acceptSubmission(k.state(), text, await signedBy(author, text), NOW);
  const r = refusal(sent);
  assert.equal(r?.code, 'PACK_MALFORMED', `a file that says ${key} was taken`);
  assert.equal(r?.at, key);
  assert.match(r?.fix ?? '', new RegExp(`\\b${key}\\b`, 'u'), `the refusal does not name ${key}`);
  assert.equal(k.index().entries.length, 0);
  assert.equal(k.files.size, 0);
  assert.equal(k.review().pending.length, 0);
}

test('NO RATING: a file that says rating or stars is refused by that name, and a listing holds neither', async () => {
  await refusedByName('rating', 4.5, /keeps no ratings/u);
  await refusedByName('stars', 5, /keeps no ratings/u);

  const { k, key } = await trusted();
  const text = addon();
  const sent = await acceptSubmission(k.state(), text, await signedBy(key, text), NOW);
  assert.ok(sent.ok, JSON.stringify(sent));
  k.apply(sent.value);
  const said = keysOf(mergeIndexes(BUNDLED, k.index()));
  for (const word of ['rating', 'ratings', 'stars', 'score', 'reviews']) assert.ok(!said.has(word), `the listing says ${word}`);
});

test('NO PRICE: a file that says price or paid is refused by that name, and a listing holds neither', async () => {
  await refusedByName('price', { amount: 500, currency: 'USD' }, /nothing for sale/u);
  await refusedByName('paid', true, /nothing for sale/u);

  const { k, key } = await trusted();
  const text = addon();
  const sent = await acceptSubmission(k.state(), text, await signedBy(key, text), NOW);
  assert.ok(sent.ok, JSON.stringify(sent));
  k.apply(sent.value);
  const said = keysOf(mergeIndexes(BUNDLED, k.index()));
  for (const word of ['price', 'paid', 'cost', 'currency']) assert.ok(!said.has(word), `the listing says ${word}`);
});

const PICTURE = shelf({ kind: 'note', body: 'Our shelf ![](https://cdn.example/logo.png)' });

test('NO REMOTE ASSET: a file with an image address in a page note is refused REMOTE_ASSET, naming the page and the key', () => {
  const r = addressFault(JSON.parse(addon({}, PICTURE)));
  assert.equal(r?.code, 'REMOTE_ASSET');
  assert.equal(r?.at, 'page.shelf.blocks[1].body');
  assert.match(r?.fix ?? '', /loads nothing from elsewhere/u);
  assert.equal(addressFault(JSON.parse(addon({}, shelf({ kind: 'note', body: '![](data:image/png;base64,iVBORw0KGgo=)' }))))?.code, 'REMOTE_ASSET');
  /* AND A PLACE TO GO IS NOT AN ASSET: a link block's address is what the same file may say. */
  assert.equal(addressFault(JSON.parse(addon({}, shelf({ kind: 'link', authored: [{ cells: ['Our shop', 'https://halden.example'] }] })))), null);
});

test('NO REMOTE ASSET AT THE DOOR: a trusted publisher submitting that file is refused, and nothing is listed', async () => {
  const { k, key } = await trusted();
  const text = addon({}, PICTURE);
  const sent = await acceptSubmission(k.state(), text, await signedBy(key, text), NOW);
  assert.equal(refusal(sent)?.code, 'REMOTE_ASSET');
  assert.equal(refusal(sent)?.at, 'page.shelf.blocks[1].body');
  assert.equal(k.index().entries.length, 0);
});

test('NO LISTING BEFORE REVIEW: a file from a key nobody has trusted waits, is served nowhere, and is listed only by a verdict', async () => {
  const k = kennel();
  const key = await newAuthorKey('Halden');
  const text = addon();

  const sent = await acceptSubmission(k.state(), text, await signedBy(key, text), NOW);
  assert.ok(sent.ok, JSON.stringify(sent));
  assert.equal(sent.value.answer.state, 'review');
  assert.equal(sent.value.index, null, 'the submission changed the index before anybody read it');
  k.apply(sent.value);
  assert.equal(k.index().entries.length, 0);
  assert.equal(mergeIndexes(BUNDLED, k.index()).entries.length, 0, 'a waiting add-on is in what Browse reads');
  assert.ok(!k.files.has(LISTED_AT), 'a waiting file sits where a reader is served');
  assert.equal(k.review().pending.length, 1);

  /* REFUSED, IT IS NEVER LISTED, and its waiting file goes. */
  const no = reviewVerdict(k.state(), { kind: 'pack', id: 'bookshelf', version: '1.0.0', verdict: 'refuse', reason: 'It does not say what it is for.' }, NOW);
  assert.ok(no.ok, JSON.stringify(no));
  k.apply(no.value);
  assert.equal(k.index().entries.length, 0);
  assert.ok(!k.files.has(LISTED_AT));
  assert.equal(k.review().pending.length, 0);

  /* LISTED BY A VERDICT, it says when it was reviewed. */
  const again = addon({ summary: 'Books you own, and where each one is.' });
  const second = await acceptSubmission(k.state(), again, await signedBy(key, again), NOW);
  assert.ok(second.ok, JSON.stringify(second));
  assert.equal(second.value.answer.state, 'review', 'a publisher whose file was refused is listed unread the next time');
  k.apply(second.value);
  const yes = reviewVerdict(k.state(), { kind: 'pack', id: 'bookshelf', version: '1.0.0', verdict: 'list', reason: 'Read it through.' }, NOW);
  assert.ok(yes.ok, JSON.stringify(yes));
  k.apply(yes.value);
  const version = k.index().entries.find((e) => e.id === 'bookshelf')?.versions[0];
  assert.equal(version?.reviewed, NOW.toISOString());
  assert.equal(k.files.get(LISTED_AT), again);
});

test('A VERDICT NEVER HANDS A LISTED ID TO ANOTHER PUBLISHER, when a stranger\'s version waited while the owner listed the id first', async () => {
  const { k, key: owner } = await trusted();
  const stranger = await newAuthorKey('Mallory');
  const first = addon();
  const later = addon({ version: '2.0.0' });
  /* BOTH READ THE KENNEL BEFORE EITHER WROTE: the id was free to each of them. */
  const before = k.state();
  const listed = await acceptSubmission(before, first, await signedBy(owner, first), NOW);
  const waiting = await acceptSubmission(before, later, await signedBy(stranger, later), NOW);
  assert.ok(listed.ok && waiting.ok, JSON.stringify([listed, waiting]));
  /* A TRUSTED PUBLISHER'S FIRST VERSION WAITS TOO (it reaches everything new), and the operator lists it first. */
  assert.equal(listed.value.answer.state, 'review');
  assert.equal(waiting.value.answer.state, 'review');
  k.apply(listed.value);
  const owners = reviewVerdict(k.state(), { kind: 'pack', id: 'bookshelf', version: '1.0.0', verdict: 'list', reason: '' }, NOW);
  assert.ok(owners.ok, JSON.stringify(owners));
  k.apply(owners.value);
  k.apply(waiting.value);

  const verdict = reviewVerdict(k.state(), { kind: 'pack', id: 'bookshelf', version: '2.0.0', verdict: 'list', reason: 'Read it through.' }, NOW);
  assert.equal(refusal(verdict)?.code, 'PROVIDES_CONFLICT', JSON.stringify(verdict));
  const entry = k.index().entries.find((e) => e.id === 'bookshelf');
  assert.equal(entry?.publisher?.id, owner.key_id, 'the entry passed to the stranger');
  assert.equal(entry?.latest, '1.0.0');

  /* REFUSING IT STILL WORKS, and takes it off the list. */
  const no = reviewVerdict(k.state(), { kind: 'pack', id: 'bookshelf', version: '2.0.0', verdict: 'refuse', reason: 'Listed under another publisher.' }, NOW);
  assert.ok(no.ok, JSON.stringify(no));
});
