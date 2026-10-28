/**
 * The Kennel's reserved `probe-` prefix (`PROBE_PREFIX` in `src/kennel.ts`): an id that begins with it
 * is refused, with a sentence, from every publisher until the operator trusts one with `probe`
 * (`braindog kennel review trust <publisher> --probe`), and from that one it is taken only as an unlisted add-on.
 *
 * THE HOST IS A FEW LINES HERE, as in `kennel.test.ts`: each change applied to an index, a review file and a map of files.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Result } from '@braindog/ports';

import { emptyCatalogue, fileChecksum, listedEntries, newAuthorKey, type CatalogueIndex } from '../src/catalogue.ts';
import {
  acceptSubmission,
  emptyPublishers,
  emptyReview,
  PROBE_PREFIX,
  probePublisher,
  publisherKey,
  readPublishers,
  readTrust,
  reviewVerdict,
  trustIn,
  type Change,
  type Identity,
  type KennelState,
  type Publishers,
  type Review,
} from '../src/kennel.ts';
import { signVersion, type AuthorKey } from '../src/signing.ts';

const NOW = new Date('2026-10-09T03:00:00Z');
const BOOKS = { register: 'library', name: 'Books', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] };
const PROBE_ID = `${PROBE_PREFIX}2026-10-09`;

const addon = (id: string, extra: Record<string, unknown> = {}): string =>
  JSON.stringify({ pack: id, version: '1.0.0', title: 'Probe shelf', summary: 'A shelf the nightly probe publishes.', author: 'Kennel probe', license: 'MIT', declarations: [BOOKS], ...extra }, null, 2);

const refusal = (r: Result<unknown>): { code: string; fix: string } => {
  assert.ok(!r.ok, 'a probe publish was taken where it should have been refused');
  assert.ok('refusal' in r, JSON.stringify(r));
  return { code: r.refusal.code, fix: r.refusal.fix };
};

/** A Kennel in memory with an empty bundled catalogue and the trust file the operator writes. */
function kennel() {
  let index: CatalogueIndex = emptyCatalogue('Kennel');
  let review: Review = emptyReview();
  let publishers: Publishers = emptyPublishers();
  const files = new Map<string, string>();
  return {
    files,
    index: (): CatalogueIndex => index,
    publishers: (): Publishers => publishers,
    state: (): KennelState => ({ bundled: emptyCatalogue('BrainDog'), reserved: [], index, review, publishers, read: (path) => files.get(path) ?? null }),
    apply(change: Change): void {
      for (const file of change.files) files.set(file.path, file.text);
      if (change.index) index = change.index;
      if (change.move) files.set(change.move.to, files.get(change.move.from) ?? '');
      if (change.review) review = change.review(review);
      for (const path of change.drop) files.delete(path);
    },
    trust(publisher: string, probe?: boolean): void {
      publishers = trustIn(publishers, { publisher, trusted: true, probe }, NOW);
    },
  };
}

async function signedBy(key: AuthorKey, text: string): Promise<Identity> {
  const doc = JSON.parse(text) as { pack: string; version: string };
  const signed = await signVersion(key, 'pack', doc.pack, doc.version, await fileChecksum(text), NOW);
  assert.ok(signed.ok, JSON.stringify(signed));
  return { kind: 'key', signature: signed.value, name: 'Kennel probe' };
}

test('a probe- id is refused with a sentence from a key nobody trusted, and from one trusted without probe', async () => {
  const k = kennel();
  const key = await newAuthorKey('Kennel probe');
  const text = addon(PROBE_ID, { unlisted: true });

  const stranger = refusal(await acceptSubmission(k.state(), text, await signedBy(key, text), NOW));
  assert.equal(stranger.code, 'PROVIDES_CONFLICT');
  assert.match(stranger.fix, /kept for the Kennel's own nightly probe\. Give this one another id\./);
  assert.doesNotMatch(stranger.fix, /—/, 'a refusal a person reads has an em dash');
  assert.equal(k.files.size, 0, 'a refused probe left a file behind');

  /* TRUSTED TO LIST AT ONCE IS NOT THE PROBE: the prefix still holds. */
  k.trust(publisherKey({ kind: 'key', id: key.key_id }));
  assert.equal(refusal(await acceptSubmission(k.state(), text, await signedBy(key, text), NOW)).code, 'PROVIDES_CONFLICT');

  /* A KEY THE KENNEL ALREADY KNOWS, one whose add-on the operator listed, is still not the probe. */
  const known = await newAuthorKey('Halden');
  const shelf = JSON.stringify({ ...(JSON.parse(addon('reading-shelf')) as Record<string, unknown>), title: 'Reading shelf', author: 'Halden' });
  const sent = await acceptSubmission(k.state(), shelf, await signedBy(known, shelf), NOW);
  assert.ok(sent.ok, JSON.stringify(sent));
  k.apply(sent.value);
  const listed = reviewVerdict(k.state(), { kind: 'pack', id: 'reading-shelf', version: '1.0.0', verdict: 'list', reason: '' }, NOW);
  assert.ok(listed.ok, JSON.stringify(listed));
  k.apply(listed.value);
  assert.equal(k.index().entries.find((e) => e.id === 'reading-shelf')?.publisher?.id, known.key_id);
  assert.equal(refusal(await acceptSubmission(k.state(), text, await signedBy(known, text), NOW)).code, 'PROVIDES_CONFLICT');

  /* A person signed in is refused the same way. */
  const person = refusal(await acceptSubmission(k.state(), text, { kind: 'person', id: 'person-halden', name: 'Halden' }, NOW));
  assert.equal(person.code, 'PROVIDES_CONFLICT');
});

test('the key trusted with probe publishes a probe- add-on that says unlisted, and it is listed nowhere', async () => {
  const k = kennel();
  const key = await newAuthorKey('Kennel probe');
  const who = publisherKey({ kind: 'key', id: key.key_id });
  k.trust(who, true);
  assert.ok(probePublisher(k.publishers(), { kind: 'key', id: key.key_id }));

  /* A probe that would be listed is refused: it would sit in Browse and in the count of add-ons from outside. */
  const listed = addon(PROBE_ID);
  const loud = refusal(await acceptSubmission(k.state(), listed, await signedBy(key, listed), NOW));
  assert.equal(loud.code, 'PACK_MALFORMED');
  assert.match(loud.fix, /unlisted: true/);

  const text = addon(PROBE_ID, { unlisted: true });
  const sent = await acceptSubmission(k.state(), text, await signedBy(key, text), NOW);
  assert.ok(sent.ok, JSON.stringify(sent));
  assert.equal(sent.value.answer.state, 'listed', 'the probe key waited for review although it is trusted');
  k.apply(sent.value);
  const entry = k.index().entries.find((e) => e.id === PROBE_ID);
  assert.equal(entry?.unlisted, true);
  assert.equal(k.files.get(`packs/${PROBE_ID}/1.0.0.pack.json`), text);
  assert.ok(!listedEntries(k.index()).some((e) => e.id === PROBE_ID), 'the probe is offered in a listing');

  /* Any other key is still refused the prefix while the probe key holds it. */
  const other = await newAuthorKey('Halden');
  const theirs = addon(`${PROBE_PREFIX}mine`, { unlisted: true });
  assert.equal(refusal(await acceptSubmission(k.state(), theirs, await signedBy(other, theirs), NOW)).code, 'PROVIDES_CONFLICT');
});

test('the probe flag reads back from the trust file, and trusting again without it takes it away', () => {
  const who = 'key:abcdef0123456789';
  const probe = trustIn(emptyPublishers(), { publisher: who, trusted: true, probe: true }, NOW);
  const back = readPublishers(JSON.parse(JSON.stringify(probe)));
  assert.ok(back !== null);
  assert.equal(back.trusted[who]?.probe, true);

  const plain = trustIn(probe, { publisher: who, trusted: true }, NOW);
  assert.equal(plain.trusted[who]?.probe, undefined, 'trusting the key again without probe kept it the probe');
  const untrusted = trustIn(probe, { publisher: who, trusted: false, probe: true }, NOW);
  assert.equal(untrusted.trusted[who]?.probe, undefined, 'an untrusted key stayed the probe');

  const asked = readTrust({ publisher: who, trusted: true, probe: true });
  assert.ok(asked.ok && asked.value.probe === true);
  const wrong = readTrust({ publisher: who, trusted: false, probe: true });
  assert.ok(!wrong.ok, 'an untrusted probe was taken');
});
