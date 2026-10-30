/**
 * A card's line typed on in place: one update of the one field on that row, a refusal said by the field's label, and
 * no writer at all for a reader who may not write the list (`card-writes.ts`).
 *
 * Invented names only: this app may not import `fixtures/names.ts`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Row } from 'braindog-render';
import type { Wrote } from '../record/rows-write.ts';
import type { Entry, Fields } from '../record/schema.ts';
import { CARD_SAID, cardEditsOf, cardWrite, drawnWrite, namedBy, type CardWrites } from './card-writes.ts';

const row = (seq: number, version: number, name: string): Row => ({ cells: [name, 'A line'], ref: { register: 'things', seq, version } });
const entry = (seq: number, version: number, fields: Fields): Entry => ({ seq, version, fields }) as unknown as Entry;

/** A writer that answers each update from `answers` in turn, and keeps what it was sent. */
function stub(answers: Wrote[], held: Fields = {}) {
  const sent: { register: string; seq: number; patch: Fields; version: number | undefined }[] = [];
  let rereads = 0;
  const writes: CardWrites = {
    update: async (register, seq, patch, version) => {
      sent.push({ register, seq, patch, version });
      return answers.shift() ?? { ok: true, entry: entry(seq, (version ?? 0) + 1, patch) };
    },
    held: (_seq, field) => held[field],
    label: (field) => (field === 'about' ? 'About' : field),
    reread: async () => void rereads++,
  };
  return { writes, sent, rereads: () => rereads };
}

test('a card line is written as one update of that one field on that row, at the version drawn', async () => {
  const s = stub([]);
  const write = cardWrite(s.writes, 'things', true);
  assert.ok(write);
  assert.deepEqual(await write(row(4, 7, 'Larkspur'), 'about', '  A tea shop on the corner  '), { ok: true });
  assert.deepEqual(s.sent, [{ register: 'things', seq: 4, patch: { about: 'A tea shop on the corner' }, version: 7 }]);
  assert.equal(s.rereads(), 1);
});

test('a second edit on the same card is sent at the version the first one made', async () => {
  const s = stub([]);
  const write = cardWrite(s.writes, 'things', true)!;
  const r = row(4, 7, 'Larkspur');
  await Promise.all([write(r, 'about', 'One'), write(r, 'about', 'Two')]);
  assert.deepEqual(
    s.sent.map((x) => x.version),
    [7, 8],
  );
});

test("a refusal is said in the record's words, with the field named by its label and never its id", async () => {
  const s = stub([{ ok: false, why: 'refused', fix: 'about takes at most 200 characters. Shorten it.' }]);
  const out = await cardWrite(s.writes, 'things', true)!(row(2, 1, 'Quillon'), 'about', 'x'.repeat(300));
  assert.deepEqual(out, { ok: false, said: 'About takes at most 200 characters. Shorten it.' });
  assert.equal(s.rereads(), 0, 'nothing was written, so nothing is read again');
});

test('a sentence that does not name the field is said after its label', () => {
  assert.equal(namedBy('BrainDog could not be reached.', 'about', 'About'), 'About: BrainDog could not be reached.');
  assert.equal(namedBy('things#2.about is too long', 'about', 'About'), 'About is too long', 'the spoken id goes with the field');
  assert.equal(namedBy('roundabout is not about it', 'about', 'About'), 'roundabout is not About it', 'only the whole word');
});

test('a conflict over another field is sent once more; one over this field is said and not written over', async () => {
  const other = stub([{ ok: false, why: 'conflict', fix: 'stale', entry: entry(3, 9, { about: 'Old line', health: 'at_risk' }) }], { about: 'Old line' });
  assert.deepEqual(await cardWrite(other.writes, 'things', true)!(row(3, 8, 'Brindle'), 'about', 'New line'), { ok: true });
  assert.deepEqual(
    other.sent.map((x) => x.version),
    [8, 9],
  );

  const same = stub([{ ok: false, why: 'conflict', fix: 'stale', entry: entry(3, 9, { about: 'Their line' }) }], { about: 'Old line' });
  const out = await cardWrite(same.writes, 'things', true)!(row(3, 8, 'Brindle'), 'about', 'My line');
  assert.deepEqual(out, { ok: false, said: CARD_SAID.changed('About', 'Their line') });
  assert.equal(same.sent.length, 1);
  assert.equal(same.rereads(), 1, 'the card is read again to show what the record holds');
});

test('a reader who may not write the list, an inert page, or a block over no list gets no writer', () => {
  const s = stub([]);
  assert.equal(cardWrite(s.writes, 'things', false), null);
  assert.equal(cardWrite(null, 'things', true), null);
  assert.equal(cardWrite(s.writes, undefined, true), null);
});

test('a card from no row of the list writes nothing and says so by label', async () => {
  const s = stub([]);
  const out = await cardWrite(s.writes, 'things', true)!({ cells: ['Fennick'] }, 'about', 'A line');
  assert.deepEqual(out, { ok: false, said: CARD_SAID.nowhere('About') });
  assert.equal(s.sent.length, 0);
});

test('a write that throws is said plainly, and the next edit on the card still goes', async () => {
  let calls = 0;
  const s = stub([]);
  const write = cardWrite(
    {
      ...s.writes,
      update: async (register, seq, patch, version) => {
        if (calls++ === 0) throw new Error('fetch failed: ECONNRESET');
        return s.writes.update(register, seq, patch, version);
      },
    },
    'things',
    true,
  )!;
  assert.deepEqual(await write(row(5, 1, 'Marrow'), 'about', 'One'), { ok: false, said: CARD_SAID.failed('About') });
  assert.deepEqual(await write(row(5, 1, 'Marrow'), 'about', 'Two'), { ok: true });
});

test('the drawer is handed, by column, the field a box writes: an edited line of text, and nothing else', () => {
  const types: Record<string, { type: string; max?: number }> = { name: { type: 'text' }, about: { type: 'text', max: 140 }, aim: { type: 'day' }, health: { type: 'enum' } };
  const edits = cardEditsOf(
    [
      { field: 'name', as: 'title' },
      { field: 'about', as: 'reply', edit: true },
      { field: 'aim', as: 'fact', edit: true },
      { field: 'name', or: 'about', edit: true },
      { metric: 'done-by-week', as: 'trend', edit: true },
      { field: 'health', as: 'ring', edit: true },
      { field: 'name', edit: true },
    ],
    (id) => types[id],
  );
  assert.deepEqual(edits, [null, { field: 'about', max: 140 }, null, null, null, null, { field: 'name' }]);
});

test("the drawer's write says the sentence on a refusal and nothing when the line was kept", async () => {
  const s = stub([{ ok: false, why: 'refused', fix: 'about is too long.' }]);
  const write = drawnWrite(cardWrite(s.writes, 'things', true)!);
  assert.equal(await write(row(6, 2, 'Tamsin'), 'about', 'x'), 'About is too long.');
  assert.equal(await write(row(6, 2, 'Tamsin'), 'about', 'y'), null);
});
