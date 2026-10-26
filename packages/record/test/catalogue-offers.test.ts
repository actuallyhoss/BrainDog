/**
 * Slash's catalogue update questions said truthfully (`catalogue-offers.ts`, `slash.ts` `catalogueDrafts`): the key note is
 * held to the key that signed the version installed, the warnings about new hosts and removed lists survive the length cut
 * ahead of the title, and a diff that cannot be made is said rather than left out. Keys are made at runtime and thrown away.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { addKeyStatement, emptyCatalogue, newAuthorKey, publishTo, rotateKey, type AuthorKey, type CatalogueIndex } from '@braindog/declare/catalogue';

import { offersFromCatalogue } from '../src/catalogue-offers.ts';
import { catalogueDrafts } from '../src/slash.ts';

const BOOKS = { register: 'library', name: 'Books', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] };
const LOANS = { register: 'loans', name: 'Loans', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] };
const POLL = { ingest: 'poll_books', channel: 'poll', url: 'https://books.example.org/api/latest', every: '1d', map: [{ name: { path: '$.title' } }], writes: { register: 'library' } };
const addon = (version: string, declarations: unknown[], title = 'Bookshelf') =>
  JSON.stringify({ pack: 'bookshelf', version, title, summary: 'Books.', author: 'Halden', license: 'MIT', declarations });

async function catalogue(steps: { text: string; key?: AuthorKey }[]): Promise<{ index: CatalogueIndex; files: Map<string, string> }> {
  let index = emptyCatalogue('Test');
  const files = new Map<string, string>();
  for (const { text, key } of steps) {
    const out = await publishTo(index, text, (p) => files.get(p) ?? null, new Date('2026-09-17T10:00:00Z'), key);
    assert.ok(out.ok, JSON.stringify(out));
    index = out.value.index;
    files.set(out.value.path, text);
  }
  return { index, files };
}

const reader = (index: CatalogueIndex, files: Map<string, string>) => (path: string) => (path === 'index.json' ? JSON.stringify(index) : (files.get(path) ?? null));
const held = [{ id: 'bookshelf', version: '1.0.0', on: true }];

test('the key note is held to the key that signed the version installed', async () => {
  const author = await newAuthorKey('Halden');
  const { index, files } = await catalogue([{ text: addon('1.0.0', [BOOKS]), key: author }, { text: addon('1.1.0', [BOOKS, LOANS]), key: author }]);
  const same = catalogueDrafts(await offersFromCatalogue(reader(index, files))(held));
  assert.match(same[0]!.question, new RegExp(`signed by key ${author.key_id}, the key that signed the version installed`, 'u'));

  /* An edited index re-signs 1.1.0 with another key: it verifies, and it is not the installed version's key. */
  const mallory = await newAuthorKey('Halden');
  const { index: other, files: otherFiles } = await catalogue([{ text: addon('1.1.0', [BOOKS, LOANS]), key: mallory }]);
  const forged = { ...index, entries: [{ ...index.entries[0]!, versions: [other.entries[0]!.versions[0]!, index.entries[0]!.versions[1]!] }] };
  const drafts = catalogueDrafts(await offersFromCatalogue(reader(forged, new Map([...files, ...otherFiles])))(held));
  assert.match(drafts[0]!.question, new RegExp(`^Update Bookshelf from 1\\.0\\.0 to 1\\.1\\.0\\? Warning: it is signed by key ${mallory.key_id}, not key ${author.key_id} that signed the version installed`, 'u'));

  /* A rotation from the installed key is said as that. */
  const rotation = await rotateKey(author, mallory);
  assert.ok(rotation.ok);
  const rotated = await addKeyStatement(forged, rotation.value);
  assert.ok(rotated.ok);
  const said = catalogueDrafts(await offersFromCatalogue(reader(rotated.value, new Map([...files, ...otherFiles])))(held));
  assert.match(said[0]!.question, new RegExp(`signed by key ${mallory.key_id}, which key ${author.key_id} that signed the version installed named as its successor`, 'u'));
  assert.doesNotMatch(said[0]!.question, /Warning/u);
});

test('warnings about new hosts and removed lists survive a long title, which is shortened instead', async () => {
  const long = 'A very long bookshelf title that goes on and on about the books and the loans and the shelves and the reading'.repeat(2);
  const lists = ['lent', 'wanted', 'gifts'].map((id) => ({ register: id, name: `Books ${id} to friends and family over the years`, title: 'name', fields: [{ id: 'name', type: 'text', required: true }] }));
  const { index, files } = await catalogue([{ text: addon('1.0.0', [BOOKS, LOANS, ...lists], long) }, { text: addon('2.0.0', [BOOKS, POLL], long) }]);
  const drafts = catalogueDrafts(await offersFromCatalogue(reader(index, files))(held));
  const q = drafts[0]!.question;
  assert.ok(q.length <= 280, `${q.length}: ${q}`);
  assert.match(q, /It would newly call out to books\.example\.org\./u);
  assert.match(q, /It takes away Loans, Books lent to friends/u);
  assert.match(q, /Books gifts to friends and family over the years\./u);
  assert.match(q, /^Update A very long/u);
  assert.match(q, /\.\.\. from 1\.0\.0 to 2\.0\.0\?/u);
});

test('when the installed version is gone from the catalogue, the question says what changes is not known', async () => {
  const { index, files } = await catalogue([{ text: addon('1.0.0', [BOOKS]) }, { text: addon('1.1.0', [BOOKS, LOANS]) }]);
  files.delete('packs/bookshelf/1.0.0.pack.json');
  const q = catalogueDrafts(await offersFromCatalogue(reader(index, files))(held))[0]!.question;
  assert.match(q, /This catalogue no longer holds 1\.0\.0, so what it adds, takes away or newly calls out to is not known here/u);
});

test('an add-on BrainDog publishes is first-party, and the same one held private or by anybody else is not', async () => {
  const { index, files } = await catalogue([{ text: addon('1.0.0', [BOOKS]) }, { text: addon('1.1.0', [BOOKS, LOANS]) }]);
  const as = async (entry: Record<string, unknown>) => {
    const changed = { ...index, entries: index.entries.map((e) => ({ ...e, ...entry })) } as CatalogueIndex;
    return (await offersFromCatalogue(reader(changed, files))(held))[0]?.firstParty;
  };
  assert.equal(await as({ publisher: { kind: 'braindog', id: 'braindog', name: 'BrainDog' } }), true);
  assert.equal(await as({ publisher: { kind: 'braindog', id: 'braindog', name: 'BrainDog' }, private: true, unlisted: true }), false);
  assert.equal(await as({}), false);
});
