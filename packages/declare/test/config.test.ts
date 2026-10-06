/**
 * A pack's settings and the lists it points at, through `normalise`, `plan` and `install`.
 *
 * What is asserted is that the plan still tells the truth. A setting is written into a declaration
 * when the pack is planned and installed, so the plan compares filled bodies and names the ones a
 * changed setting would change; and a pack pointing at a list nothing holds is refused with a
 * sentence that says what to install first.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FIRST_PARTY_LISTS, install, normalise, plan, unresolvedFault, type Host, type Installed, type Pack } from '../src/index.ts';
import { openRecord, type Kernel } from '@braindog/kernel';
import { fixedClock, openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';
import { FIRST_PARTY, agentsPackDocument, firstPartyDocument } from '../../seed/src/index.ts';

const NOW = Date.UTC(2026, 8, 15, 12);

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

const DOC = (over: Record<string, unknown> = {}) => ({
  pack: 'sample-ledger',
  version: '1.0.0',
  summary: 'A made-up ledger for tests.',
  author: 'Test Author',
  license: 'MIT',
  requires: { format: 1, primitives: 1, packs: {} },
  config: {
    heading: { type: 'text', default: 'Sample invoices' },
    days: { type: 'enum', values: ['3', '7', '14'], default: '7' },
    strict: { type: 'bool', default: false },
  },
  declarations: [
    {
      register: 'samples',
      name: '{{config:heading}}',
      title: 'what',
      fields: [
        { id: 'what', type: 'text', label: 'Due in {{config:days}} days', required: '{{config:strict}}' },
        { id: 'tags', type: 'list', of: 'text' },
      ],
    },
  ],
  ...over,
});

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  return { k: await openRecord(sql, fixedClock(NOW)), sql };
}

const hostFor = (k: Kernel): Host => ({
  count: (register) => k.count(register),
  stage: (batch) => k.stageInstall(batch as never),
  transaction: (fn) => k.transaction(fn),
  reload: () => k.reload(),
  retire: (ids) => k.retire(ids),
  seed: (register, fields) => k.create(register, { ...fields, tags: ['example'] }, { actor: 'p_seed', cascade: false }) as never,
  remember: (row) => k.rememberPack(row),
  forget: (id) => k.forgetPack(id),
  claimed: (pack) => k.packClaims(pack),
});

const stateOf = (k: Kernel): Installed => ({
  format: 1,
  primitives: 1,
  record_version: k.version(),
  packs: k.packs(),
  declarations: k.declarations() as Installed['declarations'],
  rows: k.census(),
  config: k.packSettings(),
});

async function put(k: Kernel, doc: unknown) {
  const pack = value<Pack>(await normalise(doc, { kind: 'local' }));
  const diff = await plan(pack, stateOf(k));
  return { diff, applied: await install(pack, diff, hostFor(k), diff.planHash) };
}

const bodyOf = (k: Kernel, id: string) => JSON.parse(k.declarations().find((d) => d.id === id)!.body) as Record<string, unknown>;

/* ── reading the settings ───────────────────────────────────────────────── */

test('A SETTING OF A TYPE NO SETTING TAKES IS REFUSED WHEN THE PACK IS READ', async () => {
  for (const type of ['ref', 'secret', 'file']) {
    const r = refusal(await normalise(DOC({ config: { billing_contact: { type } } })));
    assert.deepEqual([r.code, r.at], ['CONFIG_TYPE_UNSUPPORTED', 'config.billing_contact.type']);
  }
});

test('EVERY PLACEHOLDER NAMES A DECLARED SETTING WITH A DEFAULT, and a money setting fills a whole value', async () => {
  const undeclared = refusal(await normalise(DOC({ config: {} })));
  assert.deepEqual([undeclared.code, undeclared.at], ['FIELD_UNKNOWN', 'register.samples.name']);

  const bare = refusal(await normalise(DOC({ config: { heading: { type: 'text' }, days: { type: 'text', default: '7' }, strict: { type: 'bool', default: false } } })));
  assert.deepEqual([bare.code, bare.at], ['REQUIRED_MISSING', 'config.heading.default']);

  /* A REAL CURRENCY, because this case is about a money setting standing where text was wanted and
     not about the currency. It said `XTS`, ISO 4217's reserved testing code, which `money` now
     refuses as `CURRENCY_UNKNOWN` before the placeholder is ever looked at. */
  const money = DOC({ config: { heading: { type: 'money', default: { amount: 500, currency: 'GBP' } }, days: { type: 'text', default: '7' }, strict: { type: 'bool', default: false } } });
  (money.declarations[0] as { name: string }).name = 'Fee of {{config:heading}}';
  assert.equal(refusal(await normalise(money)).code, 'VALUE_MALFORMED');
});

test('A PACK WITHOUT SETTINGS KEEPS ITS CHECKSUM: an empty config is not written into the manifest', async () => {
  const plain = { ...DOC(), declarations: [{ register: 'samples', name: 'Samples', title: 'what', fields: [{ id: 'what', type: 'text' }] }] };
  const { config: _none, ...without } = plain;
  const a = value<Pack>(await normalise(without));
  const b = value<Pack>(await normalise({ ...without, config: {} }));
  assert.equal(a.checksum, b.checksum);
  assert.equal(b.manifest.config, undefined);
});

/* ── planning and installing ────────────────────────────────────────────── */

test('THE PLAN AND THE INSTALL WRITE EACH SETTING INTO THE DECLARATION, typed where it is the whole value', async () => {
  const { k, sql } = await record();
  const { diff, applied } = await put(k, DOC());
  value(applied);
  assert.deepEqual(diff.config, [
    { key: 'heading', type: 'text', value: 'Sample invoices', from: 'default' },
    { key: 'days', type: 'enum', value: '7', from: 'default' },
    { key: 'strict', type: 'bool', value: false, from: 'default' },
  ]);
  const body = bodyOf(k, 'register.samples');
  assert.equal(body.name, 'Sample invoices');
  assert.deepEqual((body.fields as Record<string, unknown>[])[0], { id: 'what', type: 'text', label: 'Due in 7 days', required: false });

  /* Planned again with nothing changed, the filled body is not a change. */
  const again = await plan(value<Pack>(await normalise(DOC())), stateOf(k));
  assert.deepEqual(again.changes, []);
  sql.close();
});

test('A CHANGED SETTING IS READ THE NEXT TIME THE PACK IS PLANNED AND INSTALLED, and not before', async () => {
  const { k, sql } = await record();
  value((await put(k, DOC())).applied);
  const pack = value<Pack>(await normalise(DOC()));
  const before = await plan(pack, stateOf(k));

  value(k.setPackConfig('sample-ledger', { heading: 'Renamed samples', strict: true }, { actor: 'p_1' }));
  assert.equal(bodyOf(k, 'register.samples').name, 'Sample invoices', 'setting a value reinstalled the declaration');

  const after = await plan(pack, stateOf(k));
  assert.notEqual(after.planHash, before.planHash, 'a plan made before the change is still current');
  assert.deepEqual(after.changes.map((c) => c.id), ['register.samples']);
  assert.deepEqual(after.config.map((c) => [c.key, c.value, c.from]), [
    ['heading', 'Renamed samples', 'kept'],
    ['days', '7', 'default'],
    ['strict', true, 'kept'],
  ]);
  value(await install(pack, after, hostFor(k), after.planHash));
  const body = bodyOf(k, 'register.samples');
  assert.equal(body.name, 'Renamed samples');
  assert.equal((body.fields as Record<string, unknown>[])[0]?.required, true);
  /* The chosen values stay with the pack row through the install. */
  assert.deepEqual(k.packSettings(), { 'sample-ledger': { heading: 'Renamed samples', strict: true } });
  sql.close();
});

test('A CHOSEN VALUE THE NEXT VERSION DOES NOT ACCEPT FALLS BACK TO THAT VERSION’S DEFAULT', async () => {
  const { k, sql } = await record();
  value((await put(k, DOC())).applied);
  value(k.setPackConfig('sample-ledger', { days: '14' }, { actor: 'p_1' }));

  const next = DOC({
    version: '1.1.0',
    config: { heading: { type: 'text', default: 'Sample invoices' }, days: { type: 'enum', values: ['30', '60'], default: '30' }, strict: { type: 'bool', default: false } },
  });
  const { diff, applied } = await put(k, next);
  value(applied);
  assert.deepEqual(diff.config.find((c) => c.key === 'days'), { key: 'days', type: 'enum', value: '30', from: 'default' });
  assert.equal((bodyOf(k, 'register.samples').fields as Record<string, unknown>[])[0]?.label, 'Due in 30 days');
  assert.deepEqual(k.packSettings(), {});
  sql.close();
});

test('A COLOUR A SETTING PUTS INTO A BODY IS REFUSED AT INSTALL, as one written there would be', async () => {
  const { k, sql } = await record();
  const doc = DOC({ config: { heading: { type: 'text', default: 'Sample invoices' }, days: { type: 'text', default: '7' }, strict: { type: 'bool', default: false }, shade: { type: 'text', default: 'plain' } } });
  /* A key named colour is refused whatever it holds, so the setting fills a value under another key. */
  ((doc.declarations[0] as { fields: Record<string, unknown>[] }).fields[1] as Record<string, unknown>).label = '{{config:shade}}';
  const pack = value<Pack>(await normalise(doc));
  const diff = await plan(pack, { ...stateOf(k), config: { 'sample-ledger': { shade: '#ff00aa' } } });
  const r = refusal(await install(pack, diff, hostFor(k), diff.planHash));
  assert.equal(r.code, 'COLOUR_OUTSIDE_THEME');
  assert.ok(r.at?.startsWith('register.samples.'), r.at);
  assert.equal(k.packs().length, 0, 'a refused install wrote a pack row');
  sql.close();
});

/* ── the lists a pack points at ─────────────────────────────────────────── */

const LEANING = (to: string) =>
  DOC({
    config: {},
    declarations: [
      {
        register: 'samples',
        name: 'Samples',
        title: 'what',
        fields: [
          { id: 'what', type: 'text' },
          { id: 'contact', type: 'ref', to },
        ],
      },
    ],
  });

test('A FIELD POINTING AT A LIST NOTHING HOLDS IS REGISTER_UNRESOLVED, naming the first-party pack that declares it', async () => {
  const { k, sql } = await record();
  const pack = value<Pack>(await normalise(LEANING('people')));
  const diff = await plan(pack, stateOf(k));
  assert.deepEqual(diff.unresolved, [{ register: 'people', at: 'register.samples.fields.contact.to', provider: 'people' }]);
  const fault = unresolvedFault(diff)!;
  assert.equal(fault.code, 'REGISTER_UNRESOLVED');
  assert.equal(
    fault.fix,
    'sample-ledger points at the people list (register.samples.fields.contact.to), which this record does not hold and sample-ledger does not declare. Install people first: it declares people.',
  );
  const r = refusal(await install(pack, diff, hostFor(k), diff.planHash));
  assert.deepEqual([r.code, r.at], ['REGISTER_UNRESOLVED', 'register.samples.fields.contact.to']);
  assert.equal(k.packs().length, 0, 'a refused install wrote a pack row');
  sql.close();
});

test('A LIST NO FIRST-PARTY PACK DECLARES IS NAMED WITH THE GENERAL REPAIR, and a page or a metric counts too', async () => {
  const empty: Installed = { format: 1, primitives: 1, record_version: 1, packs: [], declarations: [], rows: {} };
  const widgets = await plan(value<Pack>(await normalise(LEANING('widgets'))), empty);
  assert.equal(
    unresolvedFault(widgets)?.fix,
    'sample-ledger points at the widgets list (register.samples.fields.contact.to), which this record does not hold and sample-ledger does not declare. Install the pack that declares widgets first, or declare it in sample-ledger.',
  );

  const page = DOC({
    config: {},
    declarations: [
      { register: 'samples', name: 'Samples', title: 'what', fields: [{ id: 'what', type: 'text' }] },
      { page: 'samples', title: 'Samples', requires: ['register.samples', 'register.gadgets'], blocks: [{ kind: 'table', span: 12, source: 'register.gadgets' }] },
      { metric: 'gadget-count', source: 'register.sprockets', fn: 'count' },
    ],
  });
  const planned = await plan(value<Pack>(await normalise(page)), empty);
  assert.deepEqual(
    planned.unresolved.map((u) => [u.register, u.at]),
    [
      ['gadgets', 'page.samples.requires'],
      ['sprockets', 'metric.gadget-count.source'],
    ],
  );

  /* Its own list, and the kernel's session, are always held. */
  assert.deepEqual((await plan(value<Pack>(await normalise(LEANING('samples'))), empty)).unresolved, []);
  assert.deepEqual((await plan(value<Pack>(await normalise(LEANING('session'))), empty)).unresolved, []);
});

test('MONEY ALONE ON AN EMPTY RECORD IS REFUSED, and the first-party five still install in order', async () => {
  const alone = await record();
  const money = value<Pack>(await normalise(firstPartyDocument('money-core')));
  const diff = await plan(money, stateOf(alone.k));
  /* `organisations` TOO, which a ledger row's party points at, and People declares since 3.0.0. */
  assert.deepEqual(diff.unresolved.map((u) => u.register).sort(), ['organisations', 'people', 'things']);
  const r = refusal(await install(money, diff, hostFor(alone.k), diff.planHash));
  assert.equal(r.code, 'REGISTER_UNRESOLVED');
  assert.ok(/Install (people and portfolio|portfolio and people) first: they declare/.test(r.fix), r.fix);
  alone.sql.close();

  const ordered = await record();
  for (const id of FIRST_PARTY) value((await put(ordered.k, firstPartyDocument(id))).applied);
  ordered.sql.close();
});

test('THE FIRST-PARTY MAP AGREES WITH THE SEED: every list names the pack that declares it, the agents pack among them', () => {
  const lists: [string, string][] = [];
  for (const id of FIRST_PARTY) {
    const doc = firstPartyDocument(id) as { declarations: Record<string, unknown>[] };
    /* A RULE NAMES THE LIST IT WATCHES WITH `register:` TOO, and declares none. */
    for (const d of doc.declarations) if (typeof d.register === 'string' && d.rule === undefined) lists.push([d.register, id]);
  }
  /* AGENTS WAS LEFT OUT OF THE HAND-WRITTEN MAP, and an add-on declaring `skills` read as fine because of it. The
     agents pack is not one of `FIRST_PARTY`, so its lists are read off its own document. */
  const agents = agentsPackDocument() as { declarations: Record<string, unknown>[] };
  for (const d of agents.declarations) if (typeof d.register === 'string' && d.rule === undefined) lists.push([d.register, 'agents']);
  assert.deepEqual([...FIRST_PARTY_LISTS].sort(), lists.sort());
});

/* ── where a setting reaches, and where it does not ─────────────────────── */

test('AN EXAMPLE ROW READS A SETTING THE WAY A DECLARATION DOES, and is refused the same three ways', async () => {
  const withSeed = (fields: Record<string, unknown>, over: Record<string, unknown> = {}) =>
    DOC({ seeds: [{ register: 'samples', fields: { tags: ['example'], ...fields } }], ...over });

  const unknown = refusal(await normalise(withSeed({ what: '{{config:nobody_declares_this}}' })));
  assert.deepEqual([unknown.code, unknown.at], ['FIELD_UNKNOWN', 'seeds.samples.what']);

  const bare = refusal(await normalise(withSeed({ what: '{{config:shade}}' }, { config: { ...DOC().config, shade: { type: 'text' } } })));
  assert.deepEqual([bare.code, bare.at], ['REQUIRED_MISSING', 'config.shade.default']);

  const money = refusal(
    await normalise(withSeed({ what: 'Fee of {{config:fee}}' }, { config: { ...DOC().config, fee: { type: 'money', default: { amount: 500, currency: 'GBP' } } } })),
  );
  assert.deepEqual([money.code, money.at], ['VALUE_MALFORMED', 'seeds.samples.what']);

  const note = refusal(
    await normalise(DOC({ seeds: [{ register: 'samples', fields: { what: 'A sample', tags: ['example'] }, note: 'Made up in {{config:nobody_declares_this}}' }] })),
  );
  assert.deepEqual([note.code, note.at], ['FIELD_UNKNOWN', 'seeds.samples.note']);
});

test('THE SETTING IS WRITTEN INTO THE EXAMPLE ROW THE INSTALL PLANTS, the default and the chosen value alike', async () => {
  const doc = DOC({ seeds: [{ register: 'samples', fields: { what: '{{config:heading}}', tags: ['example'] } }] });

  const plain = await record();
  value((await put(plain.k, doc)).applied);
  const planted = value<{ rows: { fields: Record<string, unknown> }[] }>(plain.k.list({ register: 'samples' }));
  assert.equal(planted.rows[0]?.fields.what, 'Sample invoices');
  plain.sql.close();

  const chosen = await record();
  const pack = value<Pack>(await normalise(doc));
  const diff = await plan(pack, { ...stateOf(chosen.k), config: { 'sample-ledger': { heading: 'Renamed samples' } } });
  value(await install(pack, diff, hostFor(chosen.k), diff.planHash));
  const renamed = value<{ rows: { fields: Record<string, unknown> }[] }>(chosen.k.list({ register: 'samples' }));
  assert.equal(renamed.rows[0]?.fields.what, 'Renamed samples');
  chosen.sql.close();
});

test('A SETTING FILLS AT ANY DEPTH IN A DECLARATION, and the manifest around it is not walked at all', async () => {
  const { k, sql } = await record();
  const doc = DOC({
    summary: 'A made-up ledger for {{config:heading}}.',
    declarations: [
      ...DOC().declarations,
      { page: 'samples', title: 'Samples', requires: ['register.samples'], blocks: [{ kind: 'table', span: 12, source: 'register.samples', heading: 'Due in {{config:days}} days' }] },
    ],
  });
  const { diff, applied } = await put(k, doc);
  value(applied);
  const blocks = bodyOf(k, 'page.samples').blocks as Record<string, unknown>[];
  assert.equal(blocks[0]?.heading, 'Due in 7 days', 'a placeholder three deep in a body was left standing');
  /* THE MANIFEST IS NOT WALKED, so the summary a person reads on the install screen keeps its braces. */
  assert.equal(diff.pack.summary, 'A made-up ledger for {{config:heading}}.');
  sql.close();
});

/* MEASURED BEFORE THE RULE WAS WRITTEN: `normalise` accepted `note: '{{config:fee}}'` because the
   placeholder was the whole string, `filledWith` then called `String()` on the money object it filled
   with, and the row the install planted carried the note `[object Object]`. */
test('A MONEY SETTING IS REFUSED IN AN EXAMPLE ROW’S NOTE, whole or not, because a note has no value to fill', async () => {
  const money = { config: { ...DOC().config, fee: { type: 'money', default: { amount: 500, currency: 'GBP' } } } };
  const fields = { what: 'A sample', tags: ['example'] };

  const whole = refusal(await normalise(DOC({ ...money, seeds: [{ register: 'samples', fields, note: '{{config:fee}}' }] })));
  assert.deepEqual([whole.code, whole.at], ['VALUE_MALFORMED', 'seeds.samples.note']);

  const inside = refusal(await normalise(DOC({ ...money, seeds: [{ register: 'samples', fields, note: 'Paid {{config:fee}} on the day' }] })));
  assert.deepEqual([inside.code, inside.at], ['VALUE_MALFORMED', 'seeds.samples.note']);

  /* AND THE SAME PLACEHOLDER IN A FIELD IS STILL ALLOWED WHOLE, which is what a money value is for. */
  const field = value<Pack>(await normalise(DOC({ ...money, seeds: [{ register: 'samples', fields: { ...fields, what: '{{config:fee}}' } }] })));
  assert.equal(field.seeds[0]?.fields.what, '{{config:fee}}');
});
