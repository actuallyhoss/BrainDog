/**
 * An arrangement finds any current add-on in the host's whole catalogue, and settings sent with an
 * install fill it (step 2, first half).
 *
 * The arranger found an add-on only in the host's short list and refused the rest. Here the short list is empty and the
 * catalogue is a signed one built at runtime (`publishTo`), read through `shelfFromCatalogue` as a host reads its folder:
 * the add-on is listed on offer, proposed by its id, held to its checksum, and installed by the owner's press. A file that
 * does not match its checksum is refused, a catalogue that moved after the question was filed is said and installs
 * nothing, and the book sent with the install is in the install. The add-on is made up; nothing here names a real one.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { emptyCatalogue, newAuthorKey, publishTo, type AuthorKey, type CatalogueIndex } from '@braindog/declare/catalogue';
import type { Host, Installed } from '@braindog/declare';
import { openRecord, type Kernel } from '@braindog/kernel';

import { arranger } from '../src/arrange.ts';
import { shelfFromCatalogue } from '../src/catalogue-offers.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 12);
const OWNER = 'p_owner';

const addon = (version: string, summary = 'Payouts and the book they go to.') =>
  JSON.stringify({
    pack: 'ledgerline',
    version,
    title: 'Ledgerline',
    summary,
    author: 'Halden',
    license: 'MIT',
    config: { book: { type: 'text', default: 'Main book', label: 'Book' } },
    declarations: [{ register: 'payouts', name: 'Payouts to {{config:book}}', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] }],
  });

async function catalogue(texts: readonly string[], key: AuthorKey): Promise<{ index: CatalogueIndex; files: Map<string, string> }> {
  let index = emptyCatalogue('Test');
  const files = new Map<string, string>();
  for (const text of texts) {
    const out = await publishTo(index, text, (p) => files.get(p) ?? null, new Date('2026-10-01T10:00:00Z'), key);
    assert.ok(out.ok, JSON.stringify(out));
    index = out.value.index;
    files.set(out.value.path, text);
  }
  return { index, files };
}

/** A record with an empty short list and the catalogue `read` answers from, so `shelf` can be changed under it. */
async function recordOn(shelf: { index: CatalogueIndex; files: Map<string, string> }) {
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
  const read = (path: string) => (path === 'index.json' ? JSON.stringify(shelf.index) : (shelf.files.get(path) ?? null));
  return { k, a: arranger({ kernel: k, catalogue: [], installed, host, shelf: shelfFromCatalogue(read) }) };
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
const nameOf = (k: Kernel, id: string): unknown => (JSON.parse(k.declarations().find((d) => d.id === id)!.body) as { name?: unknown }).name;

test('AN ADD-ON IN THE CATALOGUE AND NOT THE SHORT LIST IS ON OFFER, and installs by its id on the owner’s press', async () => {
  const shelf = await catalogue([addon('1.0.0')], await newAuthorKey('Halden'));
  const { k, a } = await recordOn(shelf);

  const overview = await a.overview([]);
  assert.deepEqual(overview.offer, [{ id: 'ledgerline', summary: 'Payouts and the book they go to.' }]);

  const filed = value<Record<string, unknown>>(await a.prepare('pack', { install: 'ledgerline' }));
  assert.equal(filed.title, 'Ledgerline');
  assert.deepEqual(filed.packs, { install: ['ledgerline'] });
  /* THE DOCUMENT IS NOT FILED: the accept fetches it again and holds it to its checksum again. */
  assert.equal(filed.doc, undefined);

  const done = value<{ installed?: string[] }>(await a.apply('pack', filed, OWNER));
  assert.deepEqual(done.installed, ['ledgerline']);
  assert.deepEqual(
    k.packs().map((p) => [p.id, p.version]),
    [['ledgerline', '1.0.0']],
  );
  assert.equal(nameOf(k, 'register.payouts'), 'Payouts to Main book');
});

test('A FILE THAT DOES NOT MATCH ITS CHECKSUM IS REFUSED, and an id nothing offers is told what is, in one sentence', async () => {
  const shelf = await catalogue([addon('1.0.0')], await newAuthorKey('Halden'));
  const { a } = await recordOn(shelf);

  const unknown = refusal(await a.prepare('arrange', { why: ['x'], packs: { install: ['bookkeeper'] } }));
  assert.equal(unknown.code, 'DECLARATION_UNKNOWN');
  assert.equal(unknown.at, 'body.packs.install[0]');
  assert.equal(unknown.fix, 'There is no plugin called bookkeeper on offer here, and what is on offer is Ledgerline (by id: ledgerline).');

  /* ONE CHANGED WORD IN THE FILE, and the index still gives the old checksum. */
  const path = [...shelf.files.keys()][0]!;
  shelf.files.set(path, addon('1.0.0', 'Payouts, and a quiet call out to somewhere else.'));
  const bad = refusal(await a.prepare('pack', { install: 'ledgerline' }));
  assert.equal(bad.code, 'CHECKSUM_MISMATCH');
  assert.match(bad.fix, /^Ledgerline is in this host's catalogue and was not offered\. /u);
  assert.doesNotMatch(bad.fix, /—/u);
});

test('SETTINGS SENT WITH THE INSTALL FILL IT, and a catalogue that moved since the question was filed installs nothing', async () => {
  const key = await newAuthorKey('Halden');
  const shelf = await catalogue([addon('1.0.0')], key);
  const { k, a } = await recordOn(shelf);

  const body = { why: ['Payouts go to the sales book.'], packs: { install: ['ledgerline'] }, settings: [{ pack: 'ledgerline', values: { book: 'Sales' } }] };
  const filed = value<Record<string, unknown>>(await a.prepare('arrange', body));
  assert.deepEqual(filed.settings, [{ pack: 'ledgerline', values: { book: 'Sales' }, before: { book: 'Main book' } }]);

  /* PUBLISHED AGAIN AFTER THE QUESTION WAS FILED: the owner was shown 1.0.0, so 1.1.0 is not put in on that yes. */
  const moved = await catalogue([addon('1.0.0'), addon('1.1.0')], key);
  const stale = await recordOn(moved);
  const said = refusal(await stale.a.apply('arrange', value<Record<string, unknown>>(await a.prepare('arrange', body)), OWNER));
  assert.equal(said.code, 'PLAN_STALE');
  assert.match(said.fix, /^Ledgerline is at 1\.1\.0 in this host's catalogue now, and this proposal showed 1\.0\.0\./u);
  assert.deepEqual(stale.k.packs(), []);

  const done = value<{ installed?: string[]; settings?: string[] }>(await a.apply('arrange', filed, OWNER));
  assert.deepEqual([done.installed, done.settings], [['ledgerline'], ['ledgerline']]);
  assert.equal(nameOf(k, 'register.payouts'), 'Payouts to Sales');
  const config = k.packConfig('ledgerline');
  assert.ok(config.ok);
  assert.equal(config.value.values.book, 'Sales');
});

test('A FILE CHANGED AFTER THE QUESTION WAS FILED INSTALLS NOTHING, and a document sent for an add-on the catalogue holds is refused', async () => {
  const shelf = await catalogue([addon('1.0.0')], await newAuthorKey('Halden'));
  const { k, a } = await recordOn(shelf);

  const filed = value<Record<string, unknown>>(await a.prepare('arrange', { why: ['x'], packs: { install: ['ledgerline'] } }));
  /* THE OWNER WAS SHOWN THE FILE THE INDEX VOUCHES FOR. Changed under the same version, the yes puts nothing in. */
  const path = [...shelf.files.keys()][0]!;
  shelf.files.set(path, addon('1.0.0', 'Payouts, and a quiet call out to somewhere else.'));
  const bad = refusal(await a.apply('arrange', filed, OWNER));
  assert.equal(bad.code, 'CHECKSUM_MISMATCH');
  assert.deepEqual(k.packs(), []);

  /* A PROPOSER'S OWN DOCUMENT UNDER THE CATALOGUE'S ID is refused, as one for a short-list add-on is. */
  const sent = refusal(await a.prepare('pack', { install: 'ledgerline', doc: JSON.parse(addon('1.0.0', 'Mine.')) }));
  assert.equal(sent.code, 'VALUE_MALFORMED');
  assert.equal(sent.at, 'body.doc');
});

test('AN INSTALL WHOSE CATALOGUE MOVED ON IS ASKED AGAIN AT THE VERSION IT HOLDS NOW, and that yes installs it', async () => {
  const key = await newAuthorKey('Halden');
  const { a } = await recordOn(await catalogue([addon('1.0.0')], key));
  const filed = value<Record<string, unknown>>(await a.prepare('pack', { install: 'ledgerline' }));

  /* PUBLISHED AGAIN BEFORE THE YES: the install is refused as stale, and asked again at 1.1.0 rather than left to an agent. */
  const moved = await recordOn(await catalogue([addon('1.0.0'), addon('1.1.0')], key));
  assert.equal(refusal(await moved.a.apply('pack', filed, OWNER)).code, 'PLAN_STALE');
  const asked = (await moved.a.askAgain('pack', filed))!;
  assert.equal(asked.said, 'Ledgerline is at 1.1.0 in the catalogue now, where this asked for 1.0.0, so it asks for 1.1.0. Read it again, and accept to install it.');
  assert.doesNotMatch(asked.said, /Propose|ledgerline/u);
  const done = value<{ installed?: string[] }>(await moved.a.apply('pack', asked.body, OWNER));
  assert.deepEqual(done.installed, ['ledgerline']);
  assert.deepEqual(moved.k.packs().map((p) => [p.id, p.version]), [['ledgerline', '1.1.0']]);

  /* A PLAN AT THE VERSION ON OFFER IS NOT ASKED AGAIN. */
  const fresh = await recordOn(await catalogue([addon('1.0.0'), addon('1.1.0')], key));
  assert.equal(await fresh.a.askAgain('pack', asked.body), null);
});
