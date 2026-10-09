/**
 * An arrangement carries the whole list (REC-A06 job 4, the record half): its rows may be patches of entries already
 * here, a setting a declaration reads plans its add-on again, the keys it needs are the record's to say, and every part
 * has an id an accept can name.
 *
 * A patch is `{ register, at, version, patch }`, checked as a rowset's update is, and filed with `before`, what the entry
 * says now. A version that moved refuses the whole question, at filing and again at the owner's yes before anything is
 * installed, naming the entry by its title. The add-ons are made up; nothing here names a real one.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { emptyCatalogue, newAuthorKey, publishTo, type CatalogueIndex } from '@braindog/declare/catalogue';
import type { Host, Installed } from '@braindog/declare';
import { openRecord, type Kernel } from '@braindog/kernel';

import { arranger, needsOf } from '../src/arrange.ts';
import { shelfFromCatalogue } from '../src/catalogue-offers.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 12);
const OWNER = 'p_owner';

/* LEDGERLINE'S LIST IS NAMED FROM ITS BOOK, so a later change to the book is one a declaration reads. */
const ledgerline = JSON.stringify({
  pack: 'ledgerline',
  version: '1.0.0',
  title: 'Ledgerline',
  summary: 'Payouts and the book they go to.',
  author: 'Halden',
  license: 'MIT',
  config: { book: { type: 'text', default: 'Main book', label: 'Book' } },
  declarations: [{ register: 'payouts', name: 'Payouts to {{config:book}}', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'note', type: 'text' }] }],
});
/* TALLY'S SETTING IS READ BY NOTHING. */
const tally = JSON.stringify({
  pack: 'tally',
  version: '1.0.0',
  title: 'Tally',
  summary: 'Counts of things.',
  author: 'Halden',
  license: 'MIT',
  config: { unit: { type: 'text', default: 'pieces', label: 'Unit' } },
  declarations: [{ register: 'tallies', name: 'Tallies', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] }],
});

async function recordWith(texts: readonly string[]) {
  const key = await newAuthorKey('Halden');
  let index: CatalogueIndex = emptyCatalogue('Test');
  const files = new Map<string, string>();
  for (const text of texts) {
    const out = await publishTo(index, text, (p) => files.get(p) ?? null, new Date('2026-10-01T10:00:00Z'), key);
    assert.ok(out.ok, JSON.stringify(out));
    index = out.value.index;
    files.set(out.value.path, text);
  }
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
  return { k, a };
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
type Filed = Record<string, unknown> & { rows?: Record<string, unknown>[]; parts?: Record<string, unknown>[]; plan?: Record<string, unknown>[] };

/** A record with Ledgerline in and one payout, Rent, written by the owner. */
async function withRent(texts: readonly string[] = [ledgerline, tally]) {
  const r = await recordWith(texts);
  value(await r.a.apply('pack', value<Filed>(await r.a.prepare('pack', { install: 'ledgerline' })), OWNER));
  const made = r.k.create('payouts', { what: 'Rent' } as never, { actor: OWNER });
  assert.ok(made.ok);
  return { ...r, at: r.k.nameOf(made.value.id), version: made.value.version };
}

/** What a person reads: no em dash, no "row", no id of a record. */
const plain = (said: string) => {
  assert.doesNotMatch(said, /—/u);
  assert.doesNotMatch(said, /\brows?\b/iu);
  assert.doesNotMatch(said, /[0-9A-HJKMNP-TV-Z]{26}/u);
};

test('A PATCH IS FILED WITH WHAT THE ENTRY SAYS NOW, and the owner’s yes writes it at the version shown', async () => {
  const { k, a, at, version } = await withRent();
  const filed = value<Filed>(await a.prepare('arrange', { why: ['March rent is paid.'], rows: [{ register: 'payouts', at, version, patch: { note: 'Paid in March' }, before: { what: 'Not this' } }] }));
  /* `before` IS THE RECORD'S, never the proposer's. */
  assert.deepEqual(filed.rows, [{ register: 'payouts', at, version, patch: { note: 'Paid in March' }, before: { what: 'Rent' } }]);
  assert.deepEqual(filed.parts, [{ id: 'rows:payouts', kind: 'rows', label: 'Changes to Payouts to Main book', register: 'payouts' }]);

  const done = value<{ rows?: string[] }>(await a.apply('arrange', filed, OWNER));
  assert.deepEqual(done.rows, [at]);
  assert.equal(k.get(at)?.fields.note, 'Paid in March');
});

test('A STALE VERSION REFUSES THE WHOLE QUESTION, naming the entry, at filing and again at the yes before anything is installed', async () => {
  const { k, a, at, version } = await withRent();
  const body = { why: ['Count the pieces, and note the rent.'], packs: { install: ['tally'] }, rows: [{ register: 'payouts', at, version, patch: { note: 'Paid' } }] };
  const filed = value<Filed>(await a.prepare('arrange', body));

  /* THE ENTRY MOVES AFTER THE QUESTION WAS FILED. */
  assert.ok(k.update('payouts', at, { note: 'Changed by hand' } as never, { actor: OWNER, version }).ok);
  const late = refusal(await a.apply('arrange', filed, OWNER));
  assert.equal(late.code, 'VERSION_STALE');
  assert.equal(late.fix, 'Rent in Payouts to Main book changed after this was read, so none of it is taken. Read it again and propose with what it says now.');
  plain(late.fix);
  assert.deepEqual(k.packs().map((p) => p.id), ['ledgerline'], 'Tally went in on a yes that was refused');
  assert.equal(k.get(at)?.fields.note, 'Changed by hand');

  /* AND FILED AGAINST THE OLD VERSION, it is refused at once, the same words. */
  const early = refusal(await a.prepare('arrange', body));
  assert.equal(early.code, 'VERSION_STALE');
  assert.equal(early.at, 'body.rows[0].version');
  assert.equal(early.fix, late.fix);
});

test('A PATCH IS CHECKED AS A ROWSET’S CHANGE IS: a version, a patch of fields the list has, one change an entry, nothing beside', async () => {
  const { a, at, version } = await withRent();
  const one = (row: Record<string, unknown>) => a.prepare('arrange', { why: ['x'], rows: [row] });

  const missing = refusal(await one({ register: 'payouts', at, patch: { note: 'x' } }));
  assert.deepEqual([missing.code, missing.at], ['REQUIRED_MISSING', 'body.rows[0].version']);
  const field = refusal(await one({ register: 'payouts', at, version, patch: { colour: 'red' } }));
  assert.deepEqual([field.code, field.at], ['FIELD_UNKNOWN', 'body.rows[0].patch.colour']);
  const empty = refusal(await one({ register: 'payouts', at, version, patch: {} }));
  assert.deepEqual([empty.code, empty.at], ['VALUE_MALFORMED', 'body.rows[0].patch']);
  const extra = refusal(await one({ register: 'payouts', at, version, patch: { note: 'x' }, fields: { what: 'y' } }));
  assert.deepEqual([extra.code, extra.at], ['FIELD_UNKNOWN', 'body.rows[0].fields']);
  const nowhere = refusal(await one({ register: 'payouts', at: 'payouts#99', version, patch: { note: 'x' } }));
  assert.deepEqual([nowhere.code, nowhere.at], ['VALUE_MALFORMED', 'body.rows[0].at']);

  const twice = refusal(await a.prepare('arrange', { why: ['x'], rows: [{ register: 'payouts', at, version, patch: { note: 'a' } }, { register: 'payouts', at, version, patch: { note: 'b' } }] }));
  assert.deepEqual([twice.code, twice.at], ['VALUE_MALFORMED', 'body.rows[1].at']);
  assert.equal(twice.fix, 'Rent in Payouts to Main book is changed twice. Put both changes in one patch.');
  plain(twice.fix);
});

test('A SETTING A DECLARATION READS PLANS ITS ADD-ON AGAIN, as one change on the same yes; one nothing reads is only set', async () => {
  const { k, a } = await withRent();
  value(await a.apply('pack', value<Filed>(await a.prepare('pack', { install: 'tally' })), OWNER));
  const nameOf = (id: string) => (JSON.parse(k.declarations().find((d) => d.id === id)!.body) as { name?: unknown }).name;

  const filed = value<Filed>(await a.prepare('arrange', { why: ['Payouts go to the sales book now.'], settings: [{ pack: 'ledgerline', values: { book: 'Sales' } }, { pack: 'tally', values: { unit: 'boxes' } }] }));
  assert.equal(filed.plan?.length, 1, 'only the add-on whose declaration reads the setting is planned again');
  assert.equal(filed.plan?.[0]?.pack, 'ledgerline');
  assert.equal(filed.plan?.[0]?.replan, true);
  assert.deepEqual(filed.plan?.[0]?.changes, ['register.payouts']);
  assert.equal(filed.packs && (filed.packs as Record<string, unknown>).install, undefined, 'planned again, not installed as new');
  assert.deepEqual(
    filed.parts?.map((p) => [p.id, p.label]),
    [
      ['setting:ledgerline', 'Settings of Ledgerline'],
      ['setting:tally', 'Settings of Tally'],
    ],
  );
  /* BEFORE THE YES, the setting is read by nothing new. */
  assert.equal(nameOf('register.payouts'), 'Payouts to Main book');

  const done = value<{ installed?: string[]; settings?: string[] }>(await a.apply('arrange', filed, OWNER));
  assert.equal(done.installed, undefined);
  assert.deepEqual(done.settings, ['ledgerline', 'tally']);
  assert.equal(nameOf('register.payouts'), 'Payouts to Sales');
  const unit = k.packConfig('tally');
  assert.ok(unit.ok && unit.value.values.unit === 'boxes');
  assert.ok(k.get('payouts#1') !== null, 'the entry under the list planned again is still there');

  /* THE SETTINGS DOOR DOES THE SAME. */
  const alone = value<Filed>(await a.prepare('settings', { pack: 'ledgerline', values: { book: 'Ops' } }));
  assert.equal(alone.plan?.[0]?.replan, true);
  value(await a.apply('settings', alone, OWNER));
  assert.equal(nameOf('register.payouts'), 'Payouts to Ops');
});

test('THE KEYS IT NEEDS ARE THE RECORD’S TO SAY, from what it calls out; a proposer’s own list is not read', async () => {
  assert.deepEqual(
    needsOf([
      'CALLS OUT hooks.example.test · every 15m · grant "Hook key"',
      'CALLS OUT hooks.example.test · when a rule runs it, at most 100 a day · grant "Rule key" · sends invoices.what',
      'CALLS OUT a.example and b.example · daily · key "Rates" to fx.example, key "Bank" to a.example',
      'CALLS OUT quiet.example · no key',
      'CALLS OUT fast.example · every 900s · grant "Fast key"',
      'Turning this on deletes nothing.',
    ]),
    [
      { label: 'Hook key', opens: 'hooks.example.test', scheduled: true },
      { label: 'Rule key', opens: 'hooks.example.test', scheduled: false },
      { label: 'Rates', opens: 'fx.example', scheduled: true },
      { label: 'Bank', opens: 'a.example', scheduled: true },
      { label: 'Fast key', opens: 'fast.example', scheduled: true },
    ],
  );

  const { a } = await withRent();
  const filed = value<Filed>(await a.prepare('arrange', { why: ['x'], packs: { install: ['tally'] }, needs: [{ label: 'Stripe', opens: 'api.stripe.com', scheduled: true }] }));
  assert.equal(filed.needs, undefined, 'a key nothing in it opens was asked for');
});

test('EVERY PART HAS AN ID AN ACCEPT CAN NAME, a label in words, and what it cannot be taken without', async () => {
  const { a, at, version } = await withRent();
  const page = { page: 'tallied', title: 'Tallied', requires: ['register.tallies'], blocks: [{ kind: 'table', source: 'register.tallies', span: 12, empty: 'Nothing yet.' }] };
  const choice = {
    id: 'cadence',
    question: 'How often should the book be checked?',
    suggested: 'weekly',
    options: [
      { id: 'daily', label: 'Every day', does: 'Checks the book each morning.' },
      { id: 'weekly', label: 'Every week', does: 'Checks the book on Mondays.' },
    ],
  };
  const filed = value<Filed>(
    await a.prepare('arrange', {
      why: ['Count the pieces.'],
      packs: { install: ['tally'] },
      settings: [{ pack: 'tally', values: { unit: 'boxes' } }, { pack: 'ledgerline', values: { book: 'Sales' } }],
      pages: [{ id: 'page.tallied', kind: 'page', body: page }],
      rows: [{ register: 'payouts', fields: { what: 'Boxes' } }, { register: 'payouts', at, version, patch: { note: 'Paid' } }],
      choices: [choice],
    }),
  );
  assert.deepEqual(filed.parts, [
    { id: 'install:tally', kind: 'install', label: 'Add Tally', pack: 'tally' },
    { id: 'setting:ledgerline', kind: 'setting', label: 'Settings of Ledgerline', pack: 'ledgerline' },
    { id: 'rows:payouts', kind: 'rows', label: 'Additions and changes to Payouts to Main book', register: 'payouts' },
    { id: 'page:tallied', kind: 'page', label: 'The Tallied page', page: 'page.tallied', requires: ['install:tally'] },
    { ...choice, id: 'choice:cadence', kind: 'choice', label: 'How often should the book be checked?' },
  ]);
  for (const p of filed.parts ?? []) plain(String(p.label));

  const one = refusal(await a.prepare('arrange', { why: ['x'], packs: { install: ['tally'] }, choices: [{ ...choice, options: [choice.options[0]] }] }));
  assert.deepEqual([one.code, one.at], ['VALUE_MALFORMED', 'body.choices[0].options']);
  const unsuggested = refusal(await a.prepare('arrange', { why: ['x'], packs: { install: ['tally'] }, choices: [{ ...choice, suggested: 'monthly' }] }));
  assert.deepEqual([unsuggested.code, unsuggested.at], ['VALUE_MALFORMED', 'body.choices[0].suggested']);
});
