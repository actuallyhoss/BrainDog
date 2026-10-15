/**
 * An arrangement whose `usecase` is a use case the host's whole catalogue serves, and no short list holds (USE-A16 job 5).
 *
 * THE FIRST RUN NOW HEARS A CATALOGUE USE CASE BY ITS WORDS (`apps/web/src/lib/arrange.ts`), and what it proposes is
 * accepted as one call, `setup`, which reads it as an arrangement led by that use case. Here the short list is empty and
 * the shelf is a fake one serving an invented rent book and the add-on it stands on, each document read as the real
 * shelf reads one (`readShared` for the use case file). Named, the use case is planned as a built-in is: the add-on
 * first, then its file, both in on one press, the voice rule writing the use case down as the one that speaks, and a press
 * that stops part way taking both back together. An id nothing offers is refused with the one not-offered sentence.
 * Every name here is made up.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readShared, type Host, type Installed } from '@braindog/declare';
import { openRecord, type Kernel } from '@braindog/kernel';

import { arranger, speakingNow, type CatalogueShelf, type ShelfEntry } from '../src/arrange.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 15, 12);
const OWNER = 'p_owner';

/* THE ADD-ON: the flats and who rents each one. */
const ADDON = {
  pack: 'tenancy-desk',
  version: '1.0.0',
  title: 'Tenancy desk',
  summary: 'Flats and the tenants in them.',
  author: 'Halden',
  license: 'MIT',
  config: { notice: { type: 'text', default: 'One month', label: 'Notice' } },
  declarations: [{ register: 'flats', name: 'Flats', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] }],
};

/* THE USE CASE FILE, as `<id>.usecase.json` publishes it: its front, its words, the add-on it stands on, and its own list. */
const RENT_BOOK = {
  usecase: 'rent-book',
  version: '1.0.0',
  title: 'Rent book',
  summary: 'Flats, the tenants in them and the rent each one owes.',
  author: 'Halden',
  license: 'MIT',
  audience: 'individual',
  tone: 'plain and steady',
  signals: ['flats', 'tenants', 'rent'],
  modules: ['tenancy-desk'],
  voice: { home: 'Your flats' },
  pack: {
    pack: 'usecase-rent-book',
    version: '1.0.0',
    title: 'Rent book',
    summary: 'The rent each flat owes.',
    author: 'Halden',
    license: 'MIT',
    declarations: [{ register: 'rent_due', name: 'Rent due', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] }],
  },
};

/** The fake shelf: listed as the real one lists, fetched by the pack id or a use case's short id, and counting fetches. */
async function shelfOf(): Promise<{ shelf: CatalogueShelf; fetched: string[] }> {
  const shared = await readShared(JSON.stringify(RENT_BOOK), { kind: 'paste' });
  assert.ok(shared.ok && shared.value.doc !== null, 'the use case file reads');
  const entries: (ShelfEntry & { doc: Record<string, unknown> })[] = [
    { id: 'tenancy-desk', kind: 'pack', title: ADDON.title, summary: ADDON.summary, version: '1.0.0', modules: [], doc: ADDON },
    { id: 'usecase-rent-book', kind: 'usecase', title: RENT_BOOK.title, summary: RENT_BOOK.summary, version: '1.0.0', modules: shared.value.usecase.modules, doc: shared.value.doc! },
  ];
  const fetched: string[] = [];
  const shelf: CatalogueShelf = {
    listed: async () => entries.map(({ doc: _doc, ...e }) => e),
    fetch: async (id) => {
      fetched.push(id);
      const e = entries.find((x) => x.id === id) ?? entries.find((x) => x.kind === 'usecase' && x.id === `usecase-${id}`);
      return e === undefined ? null : { ok: true, value: structuredClone(e) };
    },
  };
  return { shelf, fetched };
}

async function recordOn(shelf: CatalogueShelf) {
  const k: Kernel = await openRecord(openSqlite(), fixedClock(NOW));
  const host = (actor: string): Host => ({
    count: (register) => k.count(register),
    stage: (batch) => k.stageInstall(batch as never),
    transaction: (fn) => k.transaction(fn),
    reload: () => k.reload(),
    retire: (ids) => k.retire(ids),
    seed: (register, fields) => k.create(register, fields as never, { actor, cascade: false }) as never,
    remember: (row) => k.rememberPack({ ...row, by: actor } as never),
    forget: (id) => k.forgetPack(id),
    claimed: (pack) => k.packClaims(pack),
  });
  const installed = (): Installed => ({
    format: 1,
    primitives: 1,
    record_version: k.version(),
    packs: k.packs(),
    declarations: k.declarations() as Installed['declarations'],
    rows: k.census(),
    config: k.packSettings(),
  });
  return { k, a: arranger({ kernel: k, catalogue: [], installed, host, shelf }) };
}

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };
const value = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};
const refusal = (r: unknown) => {
  const x = r as Out;
  assert.equal(x.ok, false, 'this was supposed to be refused');
  return x.refusal!;
};
type Filed = Record<string, unknown> & { packs?: { install?: string[] }; settings?: unknown[] };

test('A CATALOGUE USE CASE NAMED AS THE LEAD IS PLANNED AS A BUILT-IN: its add-on first, then its file, in on one press', async () => {
  const { shelf, fetched } = await shelfOf();
  const { k, a } = await recordOn(shelf);

  const filed = value<Filed>(await a.prepare('arrange', { why: ['Keep the flats and the rent.'], usecase: 'rent-book' }));
  assert.deepEqual(filed.packs?.install, ['tenancy-desk', 'usecase-rent-book']);
  assert.equal(filed.usecase, 'rent-book');
  assert.deepEqual([...new Set(fetched)].sort(), ['tenancy-desk', 'usecase-rent-book']);
  assert.deepEqual(k.packs(), [], 'filing installs nothing: only the press does');

  const done = value<Record<string, string[]>>(await a.apply('arrange', filed, OWNER));
  assert.deepEqual(done.installed, ['tenancy-desk', 'usecase-rent-book']);
  assert.deepEqual(
    k.packs().map((p) => [p.id, p.version]).sort(),
    [
      ['tenancy-desk', '1.0.0'],
      ['usecase-rent-book', '1.0.0'],
    ],
  );
  assert.ok(k.register('flats'), 'the add-on’s list is in');
  assert.ok(k.register('rent_due'), 'the use case’s own list is in');
  /* THE VOICE RULE READS ITS ID: the use case the arrangement set the record up for is the one that speaks. */
  assert.equal(speakingNow(k), 'usecase-rent-book');
});

test('ONE PRESS, TAKEN BACK WHOLE: a yes that stops part way leaves neither the add-on nor the use case in', async () => {
  const { shelf } = await shelfOf();
  const { k, a } = await recordOn(shelf);
  const filed = value<Filed>(await a.prepare('arrange', { why: ['Keep the flats and the rent.'], usecase: 'rent-book' }));
  /* AN ENTRY ITS LIST REFUSES, as a question filed before the list changed would hold one: entries are written last, so it
     is refused at the yes after both installs have landed. */
  const spoiled: Filed = { ...filed, rows: [{ register: 'flats', fields: {} }] };
  const stopped = refusal(await a.apply('arrange', spoiled, OWNER));
  assert.doesNotMatch(stopped.fix, /Already applied, and kept/u, stopped.fix);
  assert.deepEqual(k.packs().map((p) => p.id), [], 'something of the press stayed in');
  assert.equal(speakingNow(k), null);

  const done = value<Record<string, string[]>>(await a.apply('arrange', filed, OWNER));
  assert.deepEqual(done.installed, ['tenancy-desk', 'usecase-rent-book']);
});

test('THE FIRST RUN’S ONE CALL INSTALLS IT TOO: setup led by the catalogue use case', async () => {
  const { shelf } = await shelfOf();
  const { k, a } = await recordOn(shelf);
  value(await a.setup({ why: ['Keep the flats and the rent.'], usecase: 'rent-book' }, OWNER));
  assert.deepEqual(k.packs().map((p) => p.id).sort(), ['tenancy-desk', 'usecase-rent-book']);
  assert.equal(speakingNow(k), 'usecase-rent-book');
});

test('AN ID NOTHING OFFERS IS REFUSED with the one not-offered sentence, and nothing is in', async () => {
  const { shelf } = await shelfOf();
  const { k, a } = await recordOn(shelf);
  const no = refusal(await a.prepare('arrange', { why: ['Keep the boats.'], usecase: 'boat-log' }));
  assert.equal(no.code, 'DECLARATION_UNKNOWN');
  assert.match(no.fix, /on offer here, and what is on offer is Tenancy desk, Rent book/u, no.fix);
  assert.deepEqual(k.packs(), []);
});
