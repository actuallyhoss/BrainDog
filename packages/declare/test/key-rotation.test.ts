/**
 * Key rotation and revocation: a new key is trusted only on a statement signed by the old one, a revoked key is untrusted
 * whatever a reader saw before, and a thief holding a revoked key cannot rotate it to their own. Every key here is made at
 * runtime and thrown away; none is kept in the repository.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  addKeyStatement,
  catalogueUpdates,
  emptyCatalogue,
  keyToKeep,
  newAuthorKey,
  publishTo,
  readCatalogue,
  rememberKey,
  revokeKey,
  rotateKey,
  trustOf,
  verifiedStatements,
  type CatalogueIndex,
} from '../src/catalogue.ts';

const BOOKS = { register: 'library', name: 'Books', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] };
const SHELF = { page: 'shelf', title: 'Shelf', requires: ['register.library'], blocks: [{ kind: 'table', source: 'register.library', span: 12 }] };
const addon = (version: string, summary = 'Books you own.') => JSON.stringify({ pack: 'bookshelf', version, title: 'Bookshelf', summary, author: 'Halden', license: 'MIT', declarations: version === '1.0.0' ? [BOOKS] : [BOOKS, SHELF] });

test('a rotation is signed by the old key, and only the old key; a revocation only by the key it revokes', async () => {
  const old = await newAuthorKey('Halden');
  const next = await newAuthorKey('Halden');
  const mallory = await newAuthorKey('Halden');

  const rotation = await rotateKey(old, next);
  assert.ok(rotation.ok, JSON.stringify(rotation));
  assert.equal(rotation.value.from_key_id, old.key_id);
  assert.equal(rotation.value.to_key_id, next.key_id);
  assert.equal(JSON.stringify(rotation.value).includes(old.private_key), false);

  /* Anybody else signing "old moves to mine" is not old's word. */
  const forged = await rotateKey(mallory, next);
  assert.ok(forged.ok);
  const passedOff = { ...forged.value, from_key_id: old.key_id, from_public_key: old.public_key };
  assert.equal((await verifiedStatements({ rotations: [passedOff], revocations: [] })).rotations.length, 0);
  const retargeted = { ...rotation.value, to_key_id: mallory.key_id, to_public_key: mallory.public_key };
  assert.equal((await verifiedStatements({ rotations: [retargeted], revocations: [] })).rotations.length, 0);

  assert.equal((await rotateKey(old, old)).ok, false);
  assert.equal((await rotateKey(old, await newAuthorKey('Mallory'))).ok, false);

  const revocation = await revokeKey(old, 'The laptop it was on was stolen.', next.key_id);
  assert.ok(revocation.ok);
  assert.equal((await revokeKey(old, '  ')).ok, false);
  const notMine = { ...revocation.value, key_id: next.key_id, public_key: next.public_key };
  assert.equal((await verifiedStatements({ rotations: [], revocations: [notMine] })).revocations.length, 0);
  assert.equal((await verifiedStatements({ rotations: [], revocations: [revocation.value] })).revocations.length, 1);
});

test('a reader trusts a new key only with the old key\'s statement, and never a revoked one', async () => {
  const old = await newAuthorKey('Halden');
  const next = await newAuthorKey('Halden');
  const mallory = await newAuthorKey('Mallory');
  const sig = (k: typeof old) => ({ alg: 'ed25519' as const, key_id: k.key_id, public_key: k.public_key, sig: 'x', signed_at: '2026-09-17T00:00:00.000Z' });
  const known = rememberKey({}, 'Halden', old.key_id);

  assert.equal(trustOf(known, 'Halden', sig(next)).kind, 'changed');
  const rotation = await rotateKey(old, next);
  assert.ok(rotation.ok);
  const statements = await verifiedStatements({ rotations: [rotation.value], revocations: [] });
  const rotated = trustOf(known, 'Halden', sig(next), statements);
  assert.deepEqual(rotated, { kind: 'rotated', key_id: next.key_id, from: old.key_id });
  assert.equal(keyToKeep(rotated), next.key_id);
  assert.equal(trustOf(known, 'Halden', sig(mallory), statements).kind, 'changed');
  /* A reader who never trusted the old key is not handed the new one by the statement: it is a first key to them. */
  assert.equal(trustOf({}, 'Halden', sig(next), statements).kind, 'first');

  /* A chain of two rotations is followed. */
  const third = await newAuthorKey('Halden');
  const again = await rotateKey(next, third);
  assert.ok(again.ok);
  assert.equal(trustOf(known, 'Halden', sig(third), await verifiedStatements({ rotations: [rotation.value, again.value], revocations: [] })).kind, 'rotated');

  /* Revoked: untrusted even for a reader who knew it, said with the author's reason, and never kept. */
  const revoked = await revokeKey(old, 'Leaked in a backup.');
  assert.ok(revoked.ok);
  const withRevocation = await verifiedStatements({ rotations: [], revocations: [revoked.value] });
  const said = trustOf(known, 'Halden', sig(old), withRevocation);
  assert.deepEqual(said, { kind: 'revoked', key_id: old.key_id, reason: 'Leaked in a backup.' });
  assert.equal(keyToKeep(said), null);

  /* Whoever took a revoked key cannot rotate it to their own: only the successor the revocation names counts. */
  const thief = await newAuthorKey('Halden');
  const stolen = await rotateKey(old, thief);
  assert.ok(stolen.ok);
  const named = await revokeKey(old, 'Moved to a new key.', next.key_id);
  assert.ok(named.ok);
  const both = await verifiedStatements({ rotations: [rotation.value, stolen.value], revocations: [named.value] });
  assert.equal(trustOf(known, 'Halden', sig(thief), both).kind, 'changed');
  assert.equal(trustOf(known, 'Halden', sig(next), both).kind, 'rotated');
  const none = await verifiedStatements({ rotations: [rotation.value, stolen.value], revocations: [revoked.value] });
  assert.equal(trustOf(known, 'Halden', sig(next), none).kind, 'changed');
});

async function signedCatalogue() {
  const old = await newAuthorKey('Halden');
  const files = new Map<string, string>();
  const first = await publishTo(emptyCatalogue('Keys'), addon('1.0.0'), () => null, new Date(), old);
  assert.ok(first.ok);
  files.set(first.value.path, addon('1.0.0'));
  return { old, files, index: first.value.index };
}

test('a catalogue carries statements in its index; a later version may be signed by the rotated key, and never by a revoked one', async () => {
  const { old, files, index } = await signedCatalogue();
  const next = await newAuthorKey('Halden');
  const read = (p: string) => files.get(p) ?? null;

  const refusedBefore = await publishTo(index, addon('1.1.0'), read, new Date(), next);
  assert.ok(!refusedBefore.ok && 'refusal' in refusedBefore && /rotation/u.test(refusedBefore.refusal.fix));

  const rotation = await rotateKey(old, next);
  assert.ok(rotation.ok);
  const withRotation = await addKeyStatement(index, rotation.value);
  assert.ok(withRotation.ok);
  assert.equal((await addKeyStatement(withRotation.value, rotation.value)).ok, false);
  const tampered = await addKeyStatement(index, { ...rotation.value, to_key_id: old.key_id });
  assert.ok(!tampered.ok && 'refusal' in tampered && tampered.refusal.code === 'SIGNATURE_INVALID');

  /* The index round-trips through its reader with the statement kept. */
  const back = readCatalogue(JSON.parse(JSON.stringify(withRotation.value)));
  assert.ok(back.ok && back.value.keys?.rotations.length === 1);
  assert.equal(readCatalogue({ ...JSON.parse(JSON.stringify(withRotation.value)), keys: { rotations: [{ nope: 1 }], revocations: [] } }).ok, false);

  const later = await publishTo(back.value, addon('1.1.0'), read, new Date(), next);
  assert.ok(later.ok, JSON.stringify(later));
  assert.equal(later.value.version.signature?.key_id, next.key_id);
  files.set(later.value.path, addon('1.1.0'));

  const revocation = await revokeKey(old, 'Retired.', next.key_id);
  assert.ok(revocation.ok);
  const withRevocation = await addKeyStatement(later.value.index, revocation.value);
  assert.ok(withRevocation.ok);
  const byRevoked = await publishTo(withRevocation.value, addon('1.1.1', 'Books you own, and lend.'), read, new Date(), old);
  assert.ok(!byRevoked.ok && 'refusal' in byRevoked && /revoked/u.test(byRevoked.refusal.fix));
});

test('an update signed by a revoked key is not offered, and the reason is said plainly', async () => {
  const { old, files, index } = await signedCatalogue();
  const read = (p: string) => files.get(p) ?? null;
  const out = await publishTo(index, addon('1.1.0'), read, new Date(), old);
  assert.ok(out.ok);
  files.set(out.value.path, addon('1.1.0'));
  const held = [{ id: 'bookshelf', version: '1.0.0' }];
  assert.equal((await catalogueUpdates(out.value.index, held, read)).updates.length, 1);

  const revocation = await revokeKey(old, 'The key was copied off a shared machine.');
  assert.ok(revocation.ok);
  const revoked = (await addKeyStatement(out.value.index, revocation.value)) as { ok: true; value: CatalogueIndex };
  const offered = await catalogueUpdates(revoked.value, held, read);
  assert.equal(offered.updates.length, 0);
  assert.equal(offered.refused.length, 1);
  assert.equal(offered.refused[0]!.fix, `Bookshelf 1.1.0 is signed by key ${old.key_id}, which its author revoked, so it is not trusted. Their reason: The key was copied off a shared machine.`);

  /* A revocation someone else wrote into the index counts for nothing. */
  const other = await newAuthorKey('Mallory');
  const fake = await revokeKey(other, 'Not yours.');
  assert.ok(fake.ok);
  const planted = { ...out.value.index, keys: { rotations: [], revocations: [{ ...fake.value, key_id: old.key_id, public_key: old.public_key }] } };
  assert.equal((await catalogueUpdates(planted, held, read)).updates.length, 1);
});

test('a version arriving unsigned after signed ones is said loudly and never offered, and trust is kept by entry, not by the author the index names', async () => {
  const { keysSignedBefore, trustSubject } = await import('../src/catalogue.ts');
  const { old, files, index } = await signedCatalogue();
  const read = (p: string) => files.get(p) ?? null;
  const entry = index.entries[0]!;
  const subject = trustSubject(entry);
  assert.equal(subject, 'pack:bookshelf');

  /* An edited index lists 1.1.0 with no signature: the file is served, the checksum holds, and nothing signed it. */
  const text = addon('1.1.0');
  const signedOut = await publishTo(index, text, read, new Date(), old);
  assert.ok(signedOut.ok);
  files.set(signedOut.value.path, text);
  const { signature: _s, ...bare } = signedOut.value.version;
  const stripped: CatalogueIndex = { ...signedOut.value.index, entries: [{ ...signedOut.value.entry, versions: [bare, ...signedOut.value.entry.versions.slice(1)] }] };
  const before = await keysSignedBefore(stripped.entries[0]!, '1.1.0');
  assert.deepEqual(before, [old.key_id]);

  /* A reader who never saw a key still hears it loudly, from the index's own earlier signatures. */
  const fresh = trustOf({}, subject, null, undefined, before);
  assert.deepEqual(fresh, { kind: 'stripped', before: [old.key_id] });
  /* A reader who kept the key hears it even when the index strips every signature. */
  assert.equal(trustOf(rememberKey({}, subject, old.key_id), subject, null).kind, 'stripped');
  assert.equal(trustOf({}, subject, null).kind, 'unsigned');
  assert.equal(keyToKeep(fresh), null);

  const offered = await catalogueUpdates(stripped, [{ id: 'bookshelf', version: '1.0.0' }], read);
  assert.equal(offered.updates.length, 0);
  assert.match(offered.refused[0]?.fix ?? '', /unsigned, and earlier versions were signed by key/u);

  /* A signature from another key on a fresh reader, where the index shows earlier versions signed by the author's key, is changed, not first. */
  const mallory = await newAuthorKey('Halden');
  const sigOf = signedOut.value.version.signature!;
  assert.equal(trustOf({}, subject, { ...sigOf, key_id: mallory.key_id, public_key: mallory.public_key }, undefined, before).kind, 'changed');

  /* Renaming the author in an edited index does not make a kept key a first use: trust is keyed by kind and id. */
  const known = rememberKey({}, subject, old.key_id);
  const renamed = { ...entry, author: 'Someone Else' };
  assert.equal(trustOf(known, trustSubject(renamed), { ...sigOf, key_id: mallory.key_id }).kind, 'changed');
});

test('a file whose own id or version is not the entry it is listed under is refused, never offered', async () => {
  const { catalogueFile, fileChecksum, heldToEntry, readCatalogueFile } = await import('../src/catalogue.ts');
  const named = (pack: string, version: string) => JSON.stringify({ pack, version, title: pack === 'alpha' ? 'Alpha' : 'Beta', summary: 'Books.', author: 'Halden', license: 'MIT', declarations: [BOOKS] });
  const files = new Map<string, string>();
  const read = (p: string) => files.get(p) ?? null;
  let index = emptyCatalogue('Mixed');
  for (const text of [named('alpha', '1.0.0'), named('alpha', '1.1.0')]) {
    const out = await publishTo(index, text, read);
    assert.ok(out.ok);
    index = out.value.index;
    files.set(out.value.path, text);
  }
  /* An unsigned index points Alpha 1.1.0 at Beta's file, with Beta's checksum. */
  const beta = named('beta', '1.1.0');
  files.set(catalogueFile('alpha', '1.1.0', 'pack'), beta);
  const entry = index.entries[0]!;
  const edited: CatalogueIndex = { ...index, entries: [{ ...entry, versions: [{ ...entry.versions[0]!, checksum: await fileChecksum(beta) }, entry.versions[1]!] }] };
  const offered = await catalogueUpdates(edited, [{ id: 'alpha', version: '1.0.0' }], read);
  assert.equal(offered.updates.length, 0);
  assert.match(offered.refused[0]?.fix ?? '', /is listed as Alpha 1\.1\.0 and the file inside is beta 1\.1\.0/u);

  const file = await readCatalogueFile(named('alpha', '1.2.0'));
  assert.ok(file.ok);
  assert.equal(heldToEntry(entry, '1.2.0', file.value).ok, true);
  assert.equal(heldToEntry(entry, '1.1.0', file.value).ok, false);
});
