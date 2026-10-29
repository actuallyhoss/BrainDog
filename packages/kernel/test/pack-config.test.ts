/**
 * A pack's settings: the closed subset of types, the placeholder a declaration reads one through, and the two record
 * methods over the `pack` row.
 *
 * What is asserted is that a setting is a value a person can read and nothing more. A ref, a secret
 * and a file are refused by type, a default is coerced as a field of that type would be, a body that
 * still carries a placeholder never installs, and setting a value writes one event and touches no
 * declaration.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CONFIG_TYPES,
  configReads,
  configValue,
  fillConfig,
  jcs,
  openRecord,
  readConfig,
  validateDeclaration,
  type Declaration,
  type Kernel,
} from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 15, 12);
const BY = { actor: 'p_1' };

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string; allowed?: readonly string[] } };
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

/* ── the declaration ────────────────────────────────────────────────────── */

test('THE NINE TYPES ARE ACCEPTED, AND EACH DEFAULT IS COERCED AS A FIELD OF THAT TYPE WOULD BE', () => {
  assert.deepEqual([...CONFIG_TYPES], ['text', 'enum', 'bool', 'money', 'day', 'duration', 'number', 'list', 'secret']);
  const read = value<Record<string, { type: string; default?: unknown; values?: string[] }>>(
    readConfig({
      heading: { type: 'text', default: 'Sample invoices', label: 'Heading' },
      cadence: { type: 'enum', values: ['weekly', 'monthly'], default: 'monthly' },
      strict: { type: 'bool', default: 'true' },
      late_fee: { type: 'money', default: { amount: 1250, currency: 'gbp' } },
      starts: { type: 'day', default: '2026-01-05' },
      grace: { type: 'duration', default: 86400, note: 'How long before a reminder.' },
      no_default: { type: 'text' },
    }),
  );
  assert.equal(read.strict?.default, true);
  /* The point of this line is the case: a default is coerced as a field of its type would be, so a
     lower-case code comes back upper-case. It said `xts`, which is ISO 4217's own reserved testing
     code and therefore not a currency `Intl.supportedValuesOf` lists, and `money` now holds a code
     to the list rather than to three letters. */
  assert.deepEqual(read.late_fee?.default, { amount: 1250, currency: 'GBP' });
  assert.deepEqual(read.cadence?.values, ['weekly', 'monthly']);
  assert.equal(read.no_default?.default, undefined);
  assert.deepEqual(value(readConfig(undefined)), {});
});

test('A REF, A FILE AND EVERY OTHER TYPE ARE CONFIG_TYPE_UNSUPPORTED, each with its own sentence', () => {
  const seen = new Set<string>();
  for (const type of ['ref', 'file', 'decimal', 'colour', undefined]) {
    const r = refusal(readConfig({ billing_contact: { type } }));
    assert.equal(r.code, 'CONFIG_TYPE_UNSUPPORTED');
    assert.equal(r.at, 'config.billing_contact.type');
    assert.deepEqual(r.allowed, [...CONFIG_TYPES]);
    assert.ok(!r.fix.includes('\u2014'), 'a sentence carries an em dash');
    seen.add(r.fix.split('.')[0]!);
  }
  assert.ok(refusal(readConfig({ billing_contact: { type: 'ref' } })).fix.includes('never points at a list'));
  assert.ok(refusal(readConfig({ billing_contact: { type: 'file' } })).fix.includes('credential'));
  assert.equal(seen.size, 5);
});

test('A SECRET SETTING HOLDS THE LABEL OF A KEY, never the link or the key itself (round 1030)', () => {
  assert.equal(value<string>(configValue('feed', { type: 'secret' }, 'Calendar address')), 'Calendar address');
  for (const typed of ['https://calendar.example/private.ics', 'webcal://calendar.example/x.ics', 'two\nlines', 'x'.repeat(41)]) {
    const r = refusal(configValue('feed', { type: 'secret' }, typed));
    assert.equal(r.code, 'VALUE_MALFORMED');
    assert.equal(r.at, 'config.feed');
  }
});

test('THE REST OF THE SHAPE IS CHECKED: the map, the names, the keys, an enum, and a default that is not legal', () => {
  const code = (config: unknown) => refusal(readConfig(config)).code;
  assert.equal(code(['heading']), 'PACK_MALFORMED');
  assert.equal(code({ 'Heading-One': { type: 'text' } }), 'PACK_MALFORMED');
  assert.equal(code({ heading: 'text' }), 'PACK_MALFORMED');
  assert.equal(code(Object.fromEntries(Array.from({ length: 65 }, (_, i) => [`setting_${i}`, { type: 'bool' }]))), 'OUT_OF_BOUNDS');
  assert.equal(code({ heading: { type: 'text', widget: 'wide' } }), 'FIELD_UNKNOWN');
  assert.equal(code({ heading: { type: 'text', values: ['a'] } }), 'FIELD_UNKNOWN');
  assert.equal(code({ cadence: { type: 'enum' } }), 'VALUE_MALFORMED');
  assert.equal(code({ cadence: { type: 'enum', values: ['weekly', 'weekly'] } }), 'VALUE_MALFORMED');
  assert.equal(code({ cadence: { type: 'enum', values: ['weekly'], default: 'hourly' } }), 'ENUM_VALUE_UNKNOWN');
  assert.equal(code({ heading: { type: 'text', label: 7 } }), 'VALUE_MALFORMED');
  assert.equal(code({ heading: { type: 'text', default: 'x'.repeat(1025) } }), 'OUT_OF_BOUNDS');
  assert.equal(refusal(readConfig({ starts: { type: 'day', default: '2026-02-30' } })).at, 'config.starts.default');
  assert.equal(refusal(readConfig({ late_fee: { type: 'money', default: 12.5 } })).at, 'config.late_fee.default');
  assert.equal(refusal(configValue('strict', { type: 'bool' }, 'maybe')).at, 'config.strict');
});

/**
 * AND THE SAME RULE ON THE OTHER DECLARATION SURFACE, WHICH DID NOT HOLD IT.
 *
 * The line above asserts a setting declared `enum` with no `values` is refused, because a setting nobody
 * can choose a value for is a control drawn empty. A register field is the same rule written twice in one
 * file, and the field copy tested `type === 'enum'` only. `list` carries its element type in `of`, so
 * `{ type: 'list', of: 'enum' }` is an enum by every rule that matters to a reader: `coerce.ts` coerces
 * each element as a field of type `of`, and the write path checks membership against the same `values`.
 * With none declared it installed, drew a control with nothing in it, and refused every write to it for
 * as long as the pack was there.
 */
/** One register, one ordinary field and one under test, through the real validator. */
const field = (held: Record<string, unknown>) =>
  validateDeclaration({
    id: 'register.samples',
    kind: 'register',
    body: { id: 'samples', name: 'Samples', title: 'what', fields: [{ id: 'what', type: 'text' }, { id: 'chased', ...held }] },
  } as Declaration);

test('AN ENUM LISTS ITS VALUES WHETHER IT IS ONE FIELD OR A LIST OF THEM', () => {
  assert.equal(field({ type: 'enum' })?.code, 'DECLARATION_INVALID', 'the check that already held');
  assert.equal(field({ type: 'enum', values: [] })?.code, 'DECLARATION_INVALID');
  assert.equal(field({ type: 'list', of: 'enum' })?.code, 'DECLARATION_INVALID', 'a list of enum installed with nothing to choose from');
  assert.equal(field({ type: 'list', of: 'enum', values: [] })?.code, 'DECLARATION_INVALID');
  assert.equal(field({ type: 'list', of: 'enum' })?.at, 'chased');

  /* And neither a list of enum that does declare them nor a list of anything else is touched. */
  assert.equal(field({ type: 'list', of: 'enum', values: ['email', 'phone', 'letter'] }), null);
  assert.equal(field({ type: 'list', of: 'text' }), null);
  assert.equal(field({ type: 'enum', values: ['open', 'closed'] }), null);
});

/**
 * AND THE OTHER HALF OF THE SAME FIELD, WHICH THE FIX ABOVE PUT INTO CONTRADICTION.
 *
 * `labelsFault` opens on `f.type !== 'enum'`, so once `{ type: 'list', of: 'enum' }` had its `values`
 * enforced at install and at write, the same declaration was told its values were real and its labels
 * were not: *"is a list, and labels: names the values of an enum"*. One field, one `values` list, two
 * answers about whether it is an enum. A rule that holds through `of` for one key and not for the next
 * is worse than one that holds for neither, because the author has already been told the first half is
 * right. The membership check below it reads `f.values` and nothing else, so it needs no change: the
 * values live on the field whichever way the field reaches them.
 */
test('AND THE WORDS A PERSON READS FOR THEM, WHETHER THE ENUM IS ONE FIELD OR A LIST OF THEM', () => {
  assert.equal(field({ type: 'list', of: 'enum', values: ['email', 'phone'], labels: { email: 'Email' } }), null);
  assert.equal(field({ type: 'enum', values: ['email', 'phone'], labels: { email: 'Email' } }), null, 'the case that already held');

  /* A label for a value the field does not declare is still ENUM_VALUE_UNKNOWN, reached through `of`. */
  const stray = field({ type: 'list', of: 'enum', values: ['email'], labels: { post: 'Post' } });
  assert.equal(stray?.code, 'ENUM_VALUE_UNKNOWN');
  assert.deepEqual(stray?.allowed, ['email']);
  /* And so is a label that reads as another value once case and underscores are folded. */
  assert.equal(field({ type: 'list', of: 'enum', values: ['owed_to_me', 'paid'], labels: { paid: 'Owed to me' } })?.code, 'DECLARATION_INVALID');

  /* A list of anything else still has no values to label, and is still refused. */
  assert.equal(field({ type: 'list', of: 'text', labels: { a: 'A' } })?.code, 'DECLARATION_INVALID');
  assert.equal(field({ type: 'text', labels: { a: 'A' } })?.code, 'DECLARATION_INVALID');
});

/**
 * A `unique:` THE WRITE PATH COULD NOT BIND, WHICH IS THE GUARD ABOVE IT REACHED THROUGH ANOTHER TYPE.
 *
 * `declare.ts` already refuses `unique:` on `money` and `quantity`, and the comment over that loop says
 * exactly why: the write path's clash check binds the field's value as a SQLite parameter, and an object
 * is not a value SQLite takes, so it *"threw a raw TypeError out of `create`, across the boundary this
 * package promises nothing throws over"*. The guard was written as `PARTS[f.type]`, and `PARTS` holds
 * the two types that index in halves. It is not a list of the types that are objects. Driven against a
 * real `create`, one register per row:
 *
 *     { type: 'list', of: 'text', unique: true }   THREW  TypeError: Provided value cannot be bound ...
 *     { type: 'json', unique: true }  with { a: 1 } THREW  the same
 *     { type: 'json', unique: true }  with [1, 2]   THREW  the same
 *     { type: 'file', unique: true }               THREW  the same
 *     { type: 'json', unique: true }  with 'plain'  wrote clean
 *     { type: 'money', unique: true }              refused at install, which is the guard working
 *
 * `json` IS THE WORST OF THE THREE AND NOT THE MILDEST. A `json` field's shape is not declared, so the
 * rule holds for a row that happens to carry a string and takes the write path down for the next row
 * that carries an object. A rule that is enforced or not by what a caller sent is worse than one that
 * never works, because it passes whatever test is written for it. And there is no repair that keeps the
 * key: `json_extract` over a composite returns its JSON text, so even a bindable comparison would not be
 * the comparison the author declared.
 */
test('A UNIQUE ON A TYPE THE ROW CANNOT COMPARE IS REFUSED AT INSTALL, NOT THROWN AT THE FIRST WRITE', () => {
  for (const held of [
    { type: 'list', of: 'text', unique: true },
    { type: 'list', of: 'enum', values: ['a', 'b'], unique: true },
    { type: 'json', unique: true },
    { type: 'file', unique: true },
  ]) {
    const said = field(held);
    assert.equal(said?.code, 'DECLARATION_INVALID', `${held.type} took a unique the write path cannot bind`);
    assert.equal(said?.at, 'chased');
  }
  /* The two the guard already held. */
  assert.equal(field({ type: 'money', unique: true })?.code, 'DECLARATION_INVALID');
  assert.equal(field({ type: 'quantity', unique: true })?.code, 'DECLARATION_INVALID');
  /* And every type the record stores as one value keeps its unique, which is what the key is for. */
  for (const type of ['text', 'int', 'decimal', 'day', 'instant', 'duration', 'url', 'email', 'ref', 'bool'])
    assert.equal(field({ type, unique: true }), null, `${type} lost a unique it could keep`);
  /* An index is not a unique: nothing here is bound, so nothing here throws. */
  assert.equal(field({ type: 'list', of: 'text', index: true }), null);
});

/**
 * ONE RULE ABOUT AN ENUM'S VALUES, NOT TWO THAT DISAGREE.
 *
 * `mappingFault` refuses a `map:` enum whose `values` are not all strings; the field copy checked only
 * that the list was non-empty, so `{ type: 'enum', values: [1, 2] }` installed. Both ends of the record
 * compare an enum by string: `coerce`'s enum case refuses anything that is not a string, and the write
 * path's membership check compares `String(one)` against `f.values`, so a declared `1` is reachable only
 * by a caller who sends the text `"1"` and never by one who sends the number the declaration shows them.
 * Two copies of one rule that disagree is the shape this file keeps paying for, so they are made to
 * agree rather than left to be found again through the other door.
 */
test('AN ENUM DECLARES ITS VALUES AS TEXT, AND THE MAP AND FIELD COPIES OF THAT RULE AGREE', () => {
  assert.equal(field({ type: 'enum', values: [1, 2] })?.code, 'DECLARATION_INVALID');
  assert.equal(field({ type: 'enum', values: ['open', 2] })?.code, 'DECLARATION_INVALID');
  assert.equal(field({ type: 'list', of: 'enum', values: [1] })?.code, 'DECLARATION_INVALID');
  assert.equal(field({ type: 'enum', values: [null] })?.code, 'DECLARATION_INVALID');
  assert.equal(field({ type: 'enum', values: ['1', '2'] }), null, 'the text a caller can actually send');
});

/* ── the placeholder ────────────────────────────────────────────────────── */

test('A WHOLE PLACEHOLDER BECOMES THE TYPED VALUE, AND ONE INSIDE TEXT BECOMES ITS TEXT', () => {
  const body = { name: '{{config:heading}}', fields: [{ id: 'what', label: 'Due in {{config:days}} days', required: '{{config:strict}}' }] };
  assert.deepEqual(
    configReads(body).map((r) => [r.key, r.at, r.whole]),
    [
      ['heading', 'name', true],
      ['days', 'fields[0].label', false],
      ['strict', 'fields[0].required', true],
    ],
  );
  assert.deepEqual(fillConfig(body, { heading: 'Sample invoices', days: 7, strict: true }), {
    name: 'Sample invoices',
    fields: [{ id: 'what', label: 'Due in 7 days', required: true }],
  });
  /* A key with no value is left as it was written, for validate to refuse. */
  assert.deepEqual(fillConfig({ name: '{{config:other}}' }, { heading: 'x' }), { name: '{{config:other}}' });
});

test('A BODY THAT STILL CARRIES A PLACEHOLDER NEVER INSTALLS: nothing outside the pack path fills one', async () => {
  const decl: Declaration = {
    id: 'register.samples',
    kind: 'register',
    body: { id: 'samples', name: '{{config:heading}}', title: 'what', fields: [{ id: 'what', type: 'text' }] },
  };
  const r = validateDeclaration(decl);
  assert.equal(r?.code, 'FIELD_UNKNOWN');
  assert.equal(r?.at, 'name');

  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.equal(refusal(await k.install([decl])).code, 'FIELD_UNKNOWN');
  sql.close();
});

/* ── the record's two methods ───────────────────────────────────────────── */

const CONFIG = {
  heading: { type: 'text', default: 'Sample invoices' },
  cadence: { type: 'enum', values: ['weekly', 'monthly'], default: 'monthly' },
  grace: { type: 'duration' },
};

async function withPack(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  k.rememberPack({
    id: 'sample-ledger',
    version: '1.0.0',
    source: 'local',
    ref: null,
    manifest: jcs({ pack: 'sample-ledger', version: '1.0.0', config: CONFIG }),
    checksum: 'not-a-real-checksum',
  });
  return { k, sql };
}

type Settings = { id: string; version: string | null; values: Record<string, unknown>; config: Record<string, unknown> };
const events = (sql: NodeSql) =>
  sql
    .all<{ kind: string; target_kind: string; from_v: string; to_v: string; actor: string }>(
      "SELECT kind, target_kind, from_v, to_v, actor FROM event WHERE target = 'pack:sample-ledger' AND kind = 'edit' ORDER BY rowid",
    )
    .map((e) => ({ ...e }));

test('PACKCONFIG READS WHAT THE MANIFEST DECLARES AND WHAT EACH SETTING HOLDS', async () => {
  const { k, sql } = await withPack();
  const read = value<Settings>(k.packConfig('sample-ledger'));
  assert.deepEqual(read.values, { heading: 'Sample invoices', cadence: 'monthly', grace: null });
  /* The manifest is stored as JCS, so the settings come back in key order. */
  assert.deepEqual(Object.keys(read.config), ['cadence', 'grace', 'heading']);
  assert.equal(refusal(k.packConfig('no-such-pack')).code, 'DECLARATION_UNKNOWN');

  /* A pack the seed owns by its bodies has no row, and no settings. */
  value(await k.install([{ id: 'register.things', kind: 'register', pack: 'portfolio', body: { id: 'things', name: 'Projects', title: 'name', fields: [{ id: 'name', type: 'text' }] } }]));
  assert.deepEqual(value<Settings>(k.packConfig('portfolio')), { id: 'portfolio', version: null, config: {}, values: {} });
  sql.close();
});

test('SETPACKCONFIG CHECKS EACH VALUE, WRITES ONE EDIT EVENT, AND TOUCHES NO DECLARATION', async () => {
  const { k, sql } = await withPack();
  const declarations = k.declarations();

  const set = value<Settings & { changed: string[]; said: string }>(k.setPackConfig('sample-ledger', { cadence: 'weekly', grace: '3600' }, BY));
  assert.deepEqual(set.changed, ['cadence', 'grace']);
  assert.deepEqual(set.values, { heading: 'Sample invoices', cadence: 'weekly', grace: 3600 });
  assert.ok(set.said.includes('next time sample-ledger is planned and installed'), set.said);
  assert.deepEqual(events(sql), [
    { kind: 'edit', target_kind: 'pack', actor: 'p_1', from_v: jcs({ cadence: 'monthly', grace: null }), to_v: jcs({ cadence: 'weekly', grace: 3600 }) },
  ]);
  const stored = JSON.parse(sql.one<{ manifest: string }>("SELECT manifest FROM pack WHERE id = 'sample-ledger'")!.manifest);
  assert.deepEqual(stored.config_values, { cadence: 'weekly', grace: 3600 });
  assert.deepEqual(stored.config, CONFIG, 'the declared settings were rewritten');
  assert.deepEqual(k.packSettings(), { 'sample-ledger': { cadence: 'weekly', grace: 3600 } });
  assert.deepEqual(k.declarations(), declarations, 'a setting reinstalled something');

  /* The same values again change nothing and write nothing. */
  assert.deepEqual(value<{ changed: string[] }>(k.setPackConfig('sample-ledger', { cadence: 'weekly' }, BY)).changed, []);
  assert.equal(events(sql).length, 1);

  /* null puts a setting back to its default, and the chosen value leaves the row. */
  value(k.setPackConfig('sample-ledger', { cadence: null, grace: null }, BY));
  assert.deepEqual(value<Settings>(k.packConfig('sample-ledger')).values, { heading: 'Sample invoices', cadence: 'monthly', grace: null });
  assert.equal(JSON.parse(sql.one<{ manifest: string }>("SELECT manifest FROM pack WHERE id = 'sample-ledger'")!.manifest).config_values, undefined);
  assert.deepEqual(k.packSettings(), {});
  sql.close();
});

test('AND REFUSES WHAT THE DECLARATION DOES NOT ALLOW, before anything is written', async () => {
  const { k, sql } = await withPack();
  const unknown = refusal(k.setPackConfig('sample-ledger', { colour_scheme: 'dark' }, BY));
  assert.deepEqual([unknown.code, unknown.at, unknown.allowed], ['FIELD_UNKNOWN', 'values.colour_scheme', ['cadence', 'grace', 'heading']]);
  assert.equal(refusal(k.setPackConfig('sample-ledger', { cadence: 'hourly' }, BY)).code, 'ENUM_VALUE_UNKNOWN');
  assert.equal(refusal(k.setPackConfig('sample-ledger', { grace: 'soon' }, BY)).at, 'values.grace');
  assert.equal(refusal(k.setPackConfig('sample-ledger', {}, BY)).code, 'REQUIRED_MISSING');
  assert.equal(refusal(k.setPackConfig('sample-ledger', ['weekly'], BY)).code, 'REQUIRED_MISSING');
  assert.equal(refusal(k.setPackConfig('no-such-pack', { cadence: 'weekly' }, BY)).code, 'DECLARATION_UNKNOWN');
  assert.equal(events(sql).length, 0);
  sql.close();
});
