/**
 * BrainDog's own add-on from the catalogue, on the record's tick: an update that would take something away is asked once
 * on Decide, in Needs you and never on the agents' shelf, and a yes installs it; an update that goes in by itself reads
 * "What shipped has arrived" again at once, so the sign does not say it is missing until the next night.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { apartIds } from '@braindog/kernel';

import { createRecordApi, type CallContext, type CatalogueOffer } from '../src/index.ts';
import { ARRIVED_BEHIND, ARRIVED_HOLDER } from '../src/signs.ts';
import { openSqlite } from '../../kernel/test/sqlite.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true };

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };
const value = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};

const BOOKS = { register: 'books', name: 'Books', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] };
const SHELF = { page: 'shelf', title: 'Shelf', nav: { section: 'Shelf', order: 10 }, requires: ['register.books'], blocks: [{ kind: 'table', source: 'register.books', span: 12, empty: 'No books.' }] };
const LOANS = { register: 'loans', name: 'Loans', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] };
const doc = (version: string, declarations: unknown[]) => ({ pack: 'bookshelf', version, title: 'Bookshelf', summary: 'Books.', author: 'BrainDog', license: 'MIT', requires: { format: 1, primitives: 1, packs: {} }, declarations });

/** A record holding Bookshelf 1.0.0, and a catalogue offering `next` as BrainDog's own while the record holds less. */
async function record(next: ReturnType<typeof doc>, now: { at: number }) {
  const sql = openSqlite();
  const offers = async (held: readonly { id: string; version: string; on: boolean }[]): Promise<CatalogueOffer[]> => {
    const has = held.find((h) => h.id === 'bookshelf');
    return has === undefined || has.version === next.version
      ? []
      : [{ id: 'bookshelf', title: 'Bookshelf', from: has.version, to: next.version, body: { install: 'bookshelf', doc: next }, signedBy: null, installedSignedBy: null, rotated: false, hostsAdded: [], removed: [], changesKnown: true, firstParty: true }];
  };
  const api = await createRecordApi({ sql, clock: { now: () => now.at } as never, catalogueOffers: offers });
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  const first = value<{ id: string }>(await api.propose({ question: 'Install Bookshelf?', body_kind: 'pack', body: { install: 'bookshelf', doc: doc('1.0.0', [BOOKS, SHELF]) } }, owner));
  value(await api.decide({ id: first.id, decide: { option: 'accept', reason: 'yes' } } as never, owner));
  /* FROM THE STORE, as the app installs a store add-on (`kennel`): a file a proposal carries goes in as made here, which
     the store never updates (`updatesFromStore`). */
  sql.exec("UPDATE pack SET source = 'kennel' WHERE id = 'bookshelf'");
  return { api, sql };
}

const version = (sql: ReturnType<typeof openSqlite>) => sql.all<{ version: string }>("SELECT version FROM pack WHERE id = 'bookshelf'")[0]?.version;

test('AN ADD-ON UPDATE THAT TAKES SOMETHING AWAY IS ASKED ONCE IN NEEDS YOU, and a yes installs it', async () => {
  const now = { at: Date.UTC(2026, 9, 28, 3) };
  const { api, sql } = await record(doc('1.1.0', [BOOKS]), now);
  await api.slashTick();
  assert.equal(version(sql), '1.0.0', 'an update that takes a page away went in unasked');
  const open = sql.all<{ id: string; opened_by: string }>("SELECT id, opened_by FROM suggestion WHERE status = 'open' AND body_kind = 'pack'");
  assert.equal(open.length, 1, JSON.stringify(open));
  assert.equal(api.kernel.question(open[0]!.id), 'Bookshelf has a newer version. Updating it would take away Shelf. Update Bookshelf?');
  assert.equal(open[0]!.opened_by, 'system');
  /* IN NEEDS YOU, NOT ON THE AGENTS' SHELF. */
  assert.ok(!apartIds({ sql, nowMs: now.at }).includes(open[0]!.id), 'the update question waits on the agents\' shelf');
  /* ONCE: the next night does not ask again while it waits. */
  now.at += 86_400_000;
  await api.slashTick();
  assert.equal(sql.all("SELECT 1 FROM suggestion WHERE body_kind = 'pack' AND status = 'open'").length, 1);
  value(await api.decide({ id: open[0]!.id, decide: { option: 'accept', reason: 'yes' } } as never, owner));
  assert.equal(version(sql), '1.1.0');
  sql.close();
});

test('A NO IS KEPT FOR THAT VERSION: neither the night nor Slash asks about it again', async () => {
  const now = { at: Date.UTC(2026, 9, 28, 3) };
  const { api, sql } = await record(doc('1.1.0', [BOOKS]), now);
  await api.slashTick();
  const [asked] = sql.all<{ id: string }>("SELECT id FROM suggestion WHERE status = 'open' AND body_kind = 'pack'");
  assert.ok(asked);
  value(await api.decide({ id: asked.id, decide: { option: 'reject', reason: 'not now' } } as never, owner));
  for (let night = 0; night < 2; night++) {
    now.at += 86_400_000;
    await api.slashTick();
    value(await api.slashPropose({}, owner));
  }
  assert.equal(sql.all("SELECT 1 FROM suggestion WHERE body_kind = 'pack' AND status = 'open'").length, 0);
  assert.equal(version(sql), '1.0.0');
  sql.close();
});

test('AN ADD-ON UPDATE THAT GOES IN BY ITSELF READS WHAT SHIPPED HAS ARRIVED AGAIN AT ONCE', async () => {
  const now = { at: Date.UTC(2026, 9, 28, 3) };
  const { api, sql } = await record(doc('1.1.0', [BOOKS, SHELF, LOANS]), now);
  /* BEHIND FOR THREE NIGHTS, AND THE NIGHT'S SIGNS FILED RED before the tick. */
  api.kernel.setPref(ARRIVED_HOLDER, ARRIVED_BEHIND, { bookshelf: { to: '1.1.0', since: '2026-10-25' } });
  await api.lintTick();
  const arrived = () => value<{ signs: { sign: string; state: string; said?: string }[] }>(api.kernel.signs()).signs.find((s) => s.sign === 'arrived');
  assert.equal(arrived()?.state, 'red', JSON.stringify(arrived()));
  await api.slashTick();
  assert.equal(version(sql), '1.1.0');
  assert.notEqual(arrived()?.state, 'red', JSON.stringify(arrived()));
  sql.close();
});
