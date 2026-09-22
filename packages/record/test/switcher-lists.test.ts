/**
 * The switcher, for a colleague invited to one list on somebody else's record who also owns a record of their own.
 *
 * `research-invite-landing.md` finding 2, `probe3`. The colleague owns `books-co`, accepts an invitation to the
 * Expenses list on `the-studio`, and the Cloud's switcher then listed `books-co` and nothing else: `kernel.access`
 * answers `level: null` for somebody holding lists and no record-wide row, and `switcherRows` read that null as "not on
 * this record". So a person the record had just admitted had no row to press, and `Open BrainDog` opened their own.
 *
 * NOTHING HERE IS A STUBBED LEVEL. The probe handed `switcherRows` an `ask` that answered `{ level: null }` by hand;
 * this builds the real record, mints the real invitation, spends it the way `/auth/invite` does (the record's
 * `acceptInvite`, then the Directory's `join`), and asks the record through `switcherAsk`, which is the function
 * `Record$.switcherRow` on the Worker and the self-host's `records` callback both call.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { createDirectory, switcherAsk, type Named, type Person } from '../src/directory.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { testSigner } from '../../kernel/test/signer.ts';

const NOW = Date.UTC(2026, 8, 21, 12);

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const EXPENSES = {
  id: 'register.expenses',
  kind: 'register' as const,
  body: { id: 'expenses', name: 'Expenses', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never,
};
const PAYROLL = {
  id: 'register.payroll',
  kind: 'register' as const,
  body: { id: 'payroll', name: 'Payroll', title: 'who', fields: [{ id: 'who', type: 'text', required: true }] } as never,
};

/**
 * The Directory with two records in it, the studio's record behind `the-studio`, and the colleague.
 *
 * `own` is not opened as a record of its own: the switcher asks it through a record that answers `owner` for the
 * colleague, the same answer `provision` makes true, so the one record whose answer is under test is the studio's.
 */
async function world(grant: { level: 'read' } | { registers: Record<string, 'write'> }) {
  const clock = fixedClock(NOW);
  const d = createDirectory(openSqlite(), clock);
  value<Person>(d.person$('owner@the-studio.example'));
  const books = value<Person>(d.person$('books@books-co.example'));
  const studio = value<Named & { person: string }>(d.provision({ slug: 'the-studio', email: 'owner@the-studio.example' }));
  const own = value<Named & { person: string }>(d.provision({ slug: 'books-co', email: 'books@books-co.example' }));

  const api = await createRecordApi({ sql: openSqlite(), clock, sign: testSigner(), invitations: () => null });
  assert.ok((await api.kernel.install([EXPENSES, PAYROLL])).ok);
  assert.ok(
    api.kernel.createRecord({ id: studio.record, slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: studio.person, email: 'owner@the-studio.example' } })
      .ok,
  );
  const owner: CallContext = { principal: { kind: 'person', id: studio.person, level: 'owner' } };

  /* ACCEPTED AS `/auth/invite` ACCEPTS IT: the record spends the link, then the Directory is told. */
  const minted = value<{ token: string }>(await api.invite({ email: 'books@books-co.example', ...grant }, owner));
  value(await api.acceptInvite({ token: minted.token, person: { id: books.id, email: books.email } }));
  value(d.join(studio.record, books.id));

  const ask = (record: string) =>
    record === studio.record ? switcherAsk(api.kernel, books.id) : { level: 'owner', name: 'Books Co' };
  return { d, api, books, own, studio, ask };
}

test('A COLLEAGUE INVITED TO ONE LIST KEEPS THE ROW, with no record-wide level and the list they hold', async () => {
  const { d, api, books, ask } = await world({ registers: { expenses: 'write' } });
  assert.equal(api.kernel.access(books.id)?.level, null, 'the colleague this file is about holds no record-wide level');

  const rows = await d.switcherRows(books.id, ask);
  assert.deepEqual(
    rows,
    [
      { slug: 'books-co', name: 'Books Co', level: 'owner' },
      { slug: 'the-studio', name: 'The Studio', level: null, lists: ['expenses'], held: 'Some lists' },
    ],
    'the record the colleague was just admitted to has no row in their switcher',
  );
});

test('THE SAME COLLEAGUE INVITED AT READ is unchanged: a level, and no list field to draw', async () => {
  const { d, books, ask } = await world({ level: 'read' });
  assert.deepEqual(await d.switcherRows(books.id, ask), [
    { slug: 'books-co', name: 'Books Co', level: 'owner' },
    { slug: 'the-studio', name: 'The Studio', level: 'read' },
  ]);
});

test('A RECORD THAT ANSWERS AN EMPTY LIST OF LISTS is "not on this record", not a row that holds nothing', async () => {
  /* `switcherAsk` never answers `lists: []`, because `kernel.access` answers `null` for a person with no rows, but a
     host is free to answer the switcher some other way. Measured: with the `length > 0` guard loosened to `>= 0`,
     every test above still passed, and this one is the only thing that noticed. */
  const { d, books, studio } = await world({ registers: { expenses: 'write' } });
  const rows = await d.switcherRows(books.id, (record) =>
    record === studio.record ? { level: null, name: 'The Studio', lists: [] } : { level: 'owner', name: 'Books Co' },
  );
  assert.deepEqual(rows.map((r) => r.slug), ['books-co']);
});

test('REMOVED FROM THE RECORD, the row goes, although the Directory still lists them', async () => {
  /* The case the old null existed for. `removeMember` writes the record's `member` table and nothing writes the
     Directory's in the same transaction, so `dir_member` still names the colleague and the row must not survive it. */
  const { d, api, books, studio, ask } = await world({ registers: { expenses: 'write' } });
  value(await api.removeMember({ person: books.id }, { principal: { kind: 'person', id: studio.person, level: 'owner' } }));
  assert.equal(api.kernel.access(books.id), null);
  assert.deepEqual((await d.switcherRows(books.id, ask)).map((r) => r.slug), ['books-co']);
});
