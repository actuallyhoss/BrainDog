/**
 * All or none within the parts taken (the risk the scope names: "an arrangement half applies"). A yes that
 * stops part way takes back everything it had already done, newest first, so the question reopens holding the whole take
 * with none of it applied, and the next yes starts where the first did.
 *
 * Before, the stop said "Already applied, and kept: tally." and kept it: the reopened question held an add-on that was
 * already in, and the record held half an answer nobody had given. Only what cannot be taken back, an update whose older
 * version the host no longer offers, is still said as kept. The add-ons are made up; nothing here names a real one.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { emptyCatalogue, newAuthorKey, publishTo, type CatalogueIndex } from '@braindog/declare/catalogue';
import type { Host, Installed } from '@braindog/declare';
import { openRecord, type Kernel } from '@braindog/kernel';

import { arranger } from '../src/arrange.ts';
import { shelfFromCatalogue } from '../src/catalogue-offers.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 12);
const OWNER = 'p_owner';

const pack = (id: string, version: string, extra: Record<string, unknown>) =>
  JSON.stringify({ pack: id, version, title: id.charAt(0).toUpperCase() + id.slice(1), summary: 'Made up.', author: 'Halden', license: 'MIT', ...extra });
/* LEDGERLINE'S LIST IS NAMED FROM ITS BOOK, so a change to the book plans it again. */
const ledgerline = (version = '1.0.0', more: unknown[] = []) =>
  pack('ledgerline', version, {
    config: { book: { type: 'text', default: 'Main book', label: 'Book' } },
    declarations: [{ register: 'payouts', name: 'Payouts to {{config:book}}', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] }, ...more],
  });
const books = pack('books', '1.0.0', {
  config: { currency: { type: 'text', default: 'EGP', label: 'Currency' } },
  declarations: [{ register: 'drawers', name: 'Drawers', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] }],
});
const tally = pack('tally', '1.0.0', { declarations: [{ register: 'tallies', name: 'Tallies', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] }] });
const NOTES = { id: 'register.notes', kind: 'register', body: { id: 'notes', name: 'Notes', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } };

async function recordWith(texts: readonly string[]) {
  const key = await newAuthorKey('Halden');
  let index: CatalogueIndex = emptyCatalogue('Test');
  const files = new Map<string, string>();
  const publish = async (text: string) => {
    const out = await publishTo(index, text, (p) => files.get(p) ?? null, new Date('2026-10-01T10:00:00Z'), key);
    assert.ok(out.ok, JSON.stringify(out));
    index = out.value.index;
    files.set(out.value.path, text);
  };
  for (const text of texts) await publish(text);
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
  const read = (path: string) => (path === 'index.json' ? JSON.stringify(index) : (files.get(path) ?? null));
  const a = arranger({ kernel: k, catalogue: [], installed, host, shelf: shelfFromCatalogue(read) });
  for (const id of ['ledgerline', 'books']) value(await a.apply('pack', value<Filed>(await a.prepare('pack', { install: id })), OWNER));
  return { k, a, publish };
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
type Filed = Record<string, unknown> & { rows?: Record<string, unknown>[]; parts?: { id: string }[] };

/** What the record holds that an arrangement could have changed, to compare before and after. */
const held = (k: Kernel) => ({
  packs: k.packs().map((p) => `${p.id} ${p.version}`),
  currency: k.packConfig('books').ok ? (k.packConfig('books') as { value: { values: Record<string, unknown> } }).value.values.currency ?? null : null,
  payouts: k.register('payouts')?.name ?? null,
  notes: k.declarations().some((d) => d.id === 'register.notes'),
  tallies: k.register('tallies') === undefined ? null : k.count('tallies'),
});

const take = {
  why: ['Count the boxes, keep the book and the notes.'],
  packs: { install: ['tally'] },
  settings: [
    { pack: 'ledgerline', values: { book: 'Ops' } },
    { pack: 'books', values: { currency: 'USD' } },
  ],
  declarations: [NOTES],
  rows: [{ register: 'drawers', fields: { what: 'Top drawer' } }],
};

/**
 * THE SAME QUESTION WITH A LAST SETTING ITS ADD-ON REFUSES, as a question filed before a setting was dropped would hold
 * one. Every check at filing passed, so it is refused at the yes, after the add-on, the book, the declaration and the
 * first setting have landed: the case all or none is for.
 */
const spoiled = (filed: Filed): Filed => ({ ...filed, settings: [...((filed.settings as unknown[]) ?? []), { pack: 'books', values: { nosuch: 'x' } }] });

test('A YES THAT STOPS PART WAY TAKES BACK ALL IT DID: the add-on, the book planned again, the setting and the declaration', async () => {
  const { k, a } = await recordWith([ledgerline(), books, tally]);
  const before = held(k);
  const filed = value<Filed>(await a.prepare('arrange', take));
  assert.deepEqual(filed.parts?.map((p) => p.id), ['install:tally', 'setting:ledgerline', 'setting:books', 'rows:drawers', 'declaration:register.notes']);

  const stopped = refusal(await a.apply('arrange', spoiled(filed), OWNER));
  assert.doesNotMatch(stopped.fix, /Already applied, and kept/u, stopped.fix);
  assert.deepEqual(held(k), before, 'something of the take stayed applied');

  assert.equal(k.count('drawers'), 0);

  /* AND THE NEXT YES STARTS WHERE THE FIRST DID: the take as it was filed lands whole. */
  const done = value<Record<string, string[]>>(await a.apply('arrange', filed, OWNER));
  assert.deepEqual(done.installed, ['tally']);
  assert.deepEqual(held(k), { packs: ['books 1.0.0', 'ledgerline 1.0.0', 'tally 1.0.0'], currency: 'USD', payouts: 'Payouts to Ops', notes: true, tallies: 0 });
  assert.equal(k.count('drawers'), 1);
});

test('AN ENTRY A LIST HERE WILL REFUSE IS FOUND BEFORE ANYTHING IS IN: written once, rolled back, and nothing installed', async () => {
  const { k, a } = await recordWith([ledgerline(), books, tally]);
  const before = held(k);
  const filed = value<Filed>(await a.prepare('arrange', { ...take, rows: [{ register: 'drawers', fields: { what: '' } }] }));
  const stopped = refusal(await a.apply('arrange', filed, OWNER));
  assert.match(stopped.at ?? '', /^body\.rows\[0\]/u);
  assert.deepEqual(held(k), before);
  assert.equal(k.count('drawers'), 0, 'the rehearsal kept its entry');
});

test('WHAT CANNOT BE TAKEN BACK IS SAID AS KEPT: an update whose older version the host no longer offers', async () => {
  const { k, a, publish } = await recordWith([ledgerline(), books, tally]);
  await publish(ledgerline('1.1.0', [{ register: 'ledgers', name: 'Ledgers', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] }]));
  const filed = value<Filed>(
    await a.prepare('arrange', { why: ['The newer book, and the boxes.'], packs: { install: ['ledgerline', 'tally'] }, settings: [{ pack: 'books', values: { currency: 'USD' } }] }),
  );
  const stopped = refusal(await a.apply('arrange', spoiled(filed), OWNER));
  assert.match(stopped.fix, / Already applied, and kept: ledgerline\.$/u, stopped.fix);
  assert.deepEqual(held(k).packs, ['books 1.0.0', 'ledgerline 1.1.0'], 'the fresh add-on stayed in');
});
