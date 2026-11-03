/**
 * The Kennel holds a publisher to the key they signed with. Once an author signs, every later
 * version under their name, of any id, is signed by that key or a key it rotated to; an unsigned one and one signed by a
 * stranger's key are refused in one sentence, and an author who never signed publishes unsigned as before.
 *
 * Every name and key here is invented; each key is made by `newAuthorKey` for the test that uses it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Result } from '@braindog/ports';

import { addKeyStatement, emptyCatalogue, fileChecksum, newAuthorKey, rotateKey, type CatalogueIndex } from '../src/catalogue.ts';
import { acceptSubmission, reviewVerdict, emptyPublishers, emptyReview, publisherKey, trustIn, type Change, type Identity, type KennelState, type Publishers, type Review } from '../src/kennel.ts';
import { signVersion, type AuthorKey } from '../src/signing.ts';

const NOW = new Date('2026-10-15T10:00:00Z');
const LATER = new Date('2026-10-15T11:00:00Z');
const PLANTS = { register: 'garden', name: 'Plants', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] };

const addon = (id: string, version: string, author: string): string =>
  JSON.stringify({ pack: id, version, title: 'Seed tin', summary: `Seeds you keep, as of ${version}.`, author, license: 'MIT', declarations: [PLANTS] }, null, 2);

const code = (r: Result<unknown>): string => (r.ok ? 'ok' : 'refusal' in r ? r.refusal.code : 'conflict');
const said = (r: Result<unknown>): string => (!r.ok && 'refusal' in r ? r.refusal.fix : '');

/** A Kennel in memory, as `kennel.test.ts` keeps one, whose index a test may also add a key statement to. */
function kennel() {
  let index: CatalogueIndex = emptyCatalogue('Kennel');
  let review: Review = emptyReview();
  let publishers: Publishers = emptyPublishers();
  const files = new Map<string, string>();
  return {
    index: (): CatalogueIndex => index,
    setIndex: (next: CatalogueIndex): void => void (index = next),
    state: (): KennelState => ({ bundled: emptyCatalogue('BrainDog'), reserved: [], index, review, publishers, read: (path) => files.get(path) ?? null }),
    apply(change: Change): void {
      for (const file of change.files) files.set(file.path, file.text);
      if (change.index) index = change.index;
      if (change.move) files.set(change.move.to, files.get(change.move.from) ?? '');
      if (change.review) review = change.review(review);
      for (const path of change.drop) files.delete(path);
    },
    /* Trusted publishers are listed at once, so a claim is in the index without a review step in every test. */
    trust(publisher: string): void {
      publishers = trustIn(publishers, { publisher, trusted: true }, NOW);
    },
  };
}

async function signedBy(key: AuthorKey, text: string, name?: string): Promise<Identity> {
  const doc = JSON.parse(text) as { pack: string; version: string };
  const signed = await signVersion(key, 'pack', doc.pack, doc.version, await fileChecksum(text), NOW);
  assert.ok(signed.ok, JSON.stringify(signed));
  return { kind: 'key', signature: signed.value, ...(name ? { name } : {}) };
}

/**
 * Submits and applies; the submission must be taken. A version that waits (a trusted publisher's first, which reaches
 * everything new) is listed by the operator here, so a claim is in the index as before.
 */
async function publish(k: ReturnType<typeof kennel>, text: string, identity: Identity, now = NOW): Promise<void> {
  const sent = await acceptSubmission(k.state(), text, identity, now);
  assert.ok(sent.ok, JSON.stringify(sent));
  k.apply(sent.value);
  if (sent.value.answer.state !== 'review') return;
  const { kind, id, version } = sent.value.answer;
  const listed = reviewVerdict(k.state(), { kind, id, version, verdict: 'list', reason: '' }, now);
  assert.ok(listed.ok, JSON.stringify(listed));
  k.apply(listed.value);
}

const person = (id: string): Identity => ({ kind: 'person', id });
const keyOf = (key: AuthorKey): string => publisherKey({ kind: 'key', id: key.key_id });

test('the first signed version claims its author for its key', async () => {
  const k = kennel();
  const orla = await newAuthorKey('Orla Fenwick');
  k.trust(keyOf(orla));
  const first = addon('seed-tin', '1.0.0', 'Orla Fenwick');
  await publish(k, first, await signedBy(orla, first));
  const entry = k.index().entries.find((e) => e.id === 'seed-tin');
  assert.equal(entry?.versions[0]?.signature?.key_id, orla.key_id, 'the claim is not kept on the listed version');

  /* The same key goes on publishing, under the same id and under a new one. */
  const next = addon('seed-tin', '1.0.1', 'Orla Fenwick');
  await publish(k, next, await signedBy(orla, next), LATER);
  const other = addon('bulb-box', '1.0.0', 'Orla Fenwick');
  await publish(k, other, await signedBy(orla, other), LATER);
});

test('an unsigned version under a signed author is refused in one sentence, under a new id and under theirs', async () => {
  const k = kennel();
  const orla = await newAuthorKey('Orla Fenwick');
  k.trust(keyOf(orla));
  k.trust(publisherKey({ kind: 'person', id: 'p_mallow' }));
  const first = addon('seed-tin', '1.0.0', 'Orla Fenwick');
  await publish(k, first, await signedBy(orla, first));

  /* Somebody signed in, slipping a version in under her name, spelled in other capitals. */
  const slipped = await acceptSubmission(k.state(), addon('bulb-box', '1.0.0', 'orla  FENWICK'), person('p_mallow'), LATER);
  assert.equal(code(slipped), 'SIGNATURE_INVALID');
  assert.equal(said(slipped), 'Orla Fenwick signs every version, and this one is not signed. Publish it from the app you signed with before.');

  /* Her own id, unsigned, is told the same sentence. */
  const own = await acceptSubmission(k.state(), addon('seed-tin', '1.0.1', 'Orla Fenwick'), person('p_mallow'), LATER);
  assert.equal(said(own), said(slipped));

  /* A file naming another author, but sent under her name as the one readers see, is refused too. */
  const named = await acceptSubmission(k.state(), addon('bulb-box', '1.0.0', 'Juniper Holt'), { kind: 'person', id: 'p_mallow', name: 'Orla Fenwick' }, LATER);
  assert.equal(code(named), 'SIGNATURE_INVALID');
});

test('a version signed by a different key is refused, and names no key', async () => {
  const k = kennel();
  const orla = await newAuthorKey('Orla Fenwick');
  const stranger = await newAuthorKey('Orla Fenwick');
  k.trust(keyOf(orla));
  k.trust(keyOf(stranger));
  const first = addon('seed-tin', '1.0.0', 'Orla Fenwick');
  await publish(k, first, await signedBy(orla, first));

  const foreign = addon('bulb-box', '1.0.0', 'Orla Fenwick');
  const refused = await acceptSubmission(k.state(), foreign, await signedBy(stranger, foreign), LATER);
  assert.equal(code(refused), 'SIGNATURE_INVALID');
  assert.match(said(refused), /^Orla Fenwick signs every version with one key/u);
  assert.ok(!said(refused).includes(stranger.key_id) && !said(refused).includes(orla.key_id), 'the refusal names a key id');
  assert.ok(!said(refused).includes('—'), 'the refusal has an em dash');
});

test('a key the claimed key rotated to is taken, and the old key still counts', async () => {
  const k = kennel();
  const old = await newAuthorKey('Orla Fenwick');
  const next = await newAuthorKey('Orla Fenwick');
  k.trust(keyOf(old));
  k.trust(keyOf(next));
  const first = addon('seed-tin', '1.0.0', 'Orla Fenwick');
  await publish(k, first, await signedBy(old, first));

  const later = addon('bulb-box', '1.0.0', 'Orla Fenwick');
  assert.equal(code(await acceptSubmission(k.state(), later, await signedBy(next, later), LATER)), 'SIGNATURE_INVALID', 'a new key with no rotation was taken');

  const rotation = await rotateKey(old, next);
  assert.ok(rotation.ok, JSON.stringify(rotation));
  const rotated = await addKeyStatement(k.index(), rotation.value);
  assert.ok(rotated.ok, JSON.stringify(rotated));
  k.setIndex(rotated.value);
  await publish(k, later, await signedBy(next, later), LATER);

  /* A rotation another key signed, naming her old key, counts for nothing. */
  const forger = await newAuthorKey('Orla Fenwick');
  const third = await newAuthorKey('Orla Fenwick');
  const forged = await rotateKey(forger, third);
  assert.ok(forged.ok);
  const planted = { ...k.index(), keys: { rotations: [...(k.index().keys?.rotations ?? []), { ...forged.value, from_key_id: old.key_id, from_public_key: old.public_key }], revocations: [] } };
  k.setIndex(planted);
  const sneaked = addon('pot-ledger', '1.0.0', 'Orla Fenwick');
  assert.equal(code(await acceptSubmission(k.state(), sneaked, await signedBy(third, sneaked), LATER)), 'SIGNATURE_INVALID');
});

test('an author who never signed publishes unsigned as before', async () => {
  const k = kennel();
  k.trust(publisherKey({ kind: 'person', id: 'p_tamsin' }));
  const first = addon('seed-tin', '1.0.0', 'Tamsin Vey');
  await publish(k, first, person('p_tamsin'));
  await publish(k, addon('seed-tin', '1.0.1', 'Tamsin Vey'), person('p_tamsin'), LATER);
  await publish(k, addon('bulb-box', '1.0.0', 'Tamsin Vey'), person('p_tamsin'), LATER);

  /* Another author's claim does not reach her name. */
  const orla = await newAuthorKey('Orla Fenwick');
  k.trust(keyOf(orla));
  const signed = addon('pot-ledger', '1.0.0', 'Orla Fenwick');
  await publish(k, signed, await signedBy(orla, signed), LATER);
  await publish(k, addon('bulb-box', '1.0.1', 'Tamsin Vey'), person('p_tamsin'), LATER);

  /* A key that signs under her name later claims it for new ids, but never locks her out of what she published. */
  const namesake = await newAuthorKey('Tamsin Vey');
  k.trust(keyOf(namesake));
  const theirs = addon('rain-gauge', '1.0.0', 'Tamsin Vey');
  await publish(k, theirs, await signedBy(namesake, theirs), LATER);
  await publish(k, addon('seed-tin', '1.0.2', 'Tamsin Vey'), person('p_tamsin'), LATER);
  const fresh = await acceptSubmission(k.state(), addon('trowel-tray', '1.0.0', 'Tamsin Vey'), person('p_tamsin'), LATER);
  assert.equal(code(fresh), 'SIGNATURE_INVALID');
  /* Nor does her own entry let another signed-in person in under her name. */
  k.trust(publisherKey({ kind: 'person', id: 'p_mallow' }));
  assert.equal(code(await acceptSubmission(k.state(), addon('seed-tin', '1.0.3', 'Tamsin Vey'), person('p_mallow'), LATER)), 'SIGNATURE_INVALID');
});

test("the record's stand-in author is claimed by nobody, so a second person's key publishes under it too", async () => {
  const k = kennel();
  const first = await newAuthorKey('a BrainDog owner');
  const second = await newAuthorKey('a BrainDog owner');
  k.trust(keyOf(first));
  k.trust(keyOf(second));
  const one = addon('bean-tin', '1.0.0', 'a BrainDog owner');
  await publish(k, one, await signedBy(first, one));
  const other = addon('rice-tin', '1.0.0', 'a BrainDog owner');
  const sent = await acceptSubmission(k.state(), other, await signedBy(second, other), LATER);
  assert.equal(code(sent), 'ok', said(sent));
  const unsigned = addon('oat-tin', '1.0.0', 'a BrainDog owner');
  assert.equal(code(await acceptSubmission(k.state(), unsigned, person('per_wren'), LATER)), 'ok');
});

test('a key sent from the same signed-in person claims an id that person published unsigned, and nobody else does', async () => {
  const k = kennel();
  k.trust(publisherKey({ kind: 'person', id: 'per_tamsin' }));
  const first = addon('jam-tin', '1.0.0', 'Tamsin Hale');
  await publish(k, first, person('per_tamsin'));
  const tamsin = await newAuthorKey('Tamsin Hale');
  k.trust(keyOf(tamsin));
  const next = addon('jam-tin', '1.0.1', 'Tamsin Hale');
  const stranger = await acceptSubmission(k.state(), next, await signedBy(tamsin, next), LATER);
  assert.equal(code(stranger), 'PROVIDES_CONFLICT', 'a key with no person beside it took an id a person holds');
  const theirs = { ...(await signedBy(tamsin, next)), person: 'per_tamsin' } as Identity;
  const sent = await acceptSubmission(k.state(), next, theirs, LATER);
  assert.equal(code(sent), 'ok', said(sent));
});
