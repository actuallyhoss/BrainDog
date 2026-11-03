/**
 * Slash asking about a newer version in the host's catalogue (`slash.ts` `catalogueDrafts`, `RecordDeps.catalogueOffers`):
 * filed once per version through `prepare`, said with its signature and what it newly reaches, and installed only when the
 * owner accepts it on Decide.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext, type CatalogueOffer } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };
const value = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};

const BOOKS = { register: 'books', name: 'Books', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] };
const SHELF = { page: 'shelf', title: 'Shelf', nav: { section: 'Shelf', order: 10 }, requires: ['register.books'], blocks: [{ kind: 'table', source: 'register.books', span: 12, empty: 'No books.' }] };
const LOANS = { register: 'loans', name: 'Loans', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] };
const doc = (version: string, declarations: unknown[]) => ({ pack: 'bookshelf', version, summary: 'Books.', author: 'Halden', license: 'MIT', requires: { format: 1, primitives: 1, packs: {} }, declarations });

test('a newer catalogue version is asked about once, with who signed it, and nothing installs until it is accepted', async () => {
  const sql = openSqlite();
  let offers: CatalogueOffer[] = [];
  const seenHeld: { id: string; version: string; on: boolean }[][] = [];
  const api = await createRecordApi({
    sql,
    clock: fixedClock(Date.UTC(2026, 8, 17, 12)),
    catalogue: [],
    catalogueOffers: async (held) => (seenHeld.push([...held]), offers),
  });
  const first = value<{ id: string }>(await api.propose({ question: 'Install Bookshelf?', body_kind: 'pack', body: { install: 'bookshelf', doc: doc('1.0.0', [BOOKS, SHELF]) } }, owner));
  value(await api.decide({ id: first.id, decide: { option: 'accept', reason: 'yes' } } as never, owner));
  /* FROM THE STORE, as the app installs a store add-on (`kennel`): a file a proposal carries goes in as made here, which
     the store never offers to update (`updatesFromStore`). */
  sql.exec("UPDATE pack SET source = 'kennel' WHERE id = 'bookshelf'");
  const version = () => sql.all<{ version: string }>("SELECT version FROM pack WHERE id = 'bookshelf'")[0]?.version;
  assert.equal(version(), '1.0.0');

  offers = [{ id: 'bookshelf', title: 'Bookshelf', from: '1.0.0', to: '1.1.0', body: { install: 'bookshelf', doc: doc('1.1.0', [BOOKS, SHELF, LOANS]) }, signedBy: '0123456789abcdef', installedSignedBy: null, rotated: false, hostsAdded: [], removed: [], changesKnown: true }];
  type Filed = { filed: { id: string; question: string }[]; skipped: { question: string; why: string }[] };
  const out = value<Filed>(await api.slashPropose({}, owner));
  assert.ok(seenHeld.at(-1)?.some((h) => h.id === 'bookshelf' && h.version === '1.0.0' && h.on));
  const asked = out.filed.find((f) => /^Update Bookshelf from 1\.0\.0 to 1\.1\.0\?/u.test(f.question));
  assert.ok(asked, JSON.stringify(out));
  assert.match(asked.question, /signed by key 0123456789abcdef/u);
  assert.equal(version(), '1.0.0', 'Slash installed an update');

  /* The same version is not asked again; a later one is. */
  assert.ok(!value<Filed>(await api.slashPropose({}, owner)).filed.some((f) => /Bookshelf/u.test(f.question)));
  value(await api.decide({ id: asked.id, decide: { option: 'accept', reason: 'yes' } } as never, owner));
  assert.equal(version(), '1.1.0');
});
