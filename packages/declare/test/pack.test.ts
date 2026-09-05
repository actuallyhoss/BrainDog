/**
 * A pack: a business's shape as a file somebody can read, share and take back out.
 *
 * WHAT IS ASSERTED HERE IS THAT THE PLAN IS THE TRUTH. Everything else in this module is in service
 * of one property: what a person approved is what happened. So the tests are about the ways a plan
 * and an install can disagree — a record that moved, a pack edited between the two, a declaration
 * another pack owns, rows that would be left under a register that went away — and about the two
 * things a pack must never be: a credential, or a way to lose a row.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, satisfies, uninstall, type Diff, type Host, type Installed, type Pack } from '../src/index.ts';

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const refusal = (r: unknown) => {
  const x = r as { ok: boolean; refusal: { code: string; fix: string; at?: string } };
  assert.equal(x.ok, false, 'this was supposed to be refused');
  return x.refusal;
};

const DOC = (over: Record<string, unknown> = {}) => ({
  pack: 'studio-books',
  version: '1.2.0',
  summary: 'What a small studio owes and is owed.',
  author: 'Halden',
  license: 'MIT',
  requires: { format: 1, primitives: 1, packs: {} },
  declarations: [
    {
      register: 'obligations',
      name: 'Obligations',
      title: 'what',
      fields: [
        { id: 'what', type: 'text', required: true },
        { id: 'tags', type: 'list', of: 'text' },
      ],
    },
    {
      rule: 'chase',
      register: 'obligations',
      when: 'state is open',
      once_per: ['entry'],
      then: [{ notify: { say: 'chase', urgent: true } }],
    },
  ],
  seeds: [{ register: 'obligations', fields: { what: 'Invoice 41' }, note: 'an example' }],
  ...over,
});

const EMPTY: Installed = { format: 1, primitives: 1, record_version: 7, packs: [], declarations: [], rows: {} };

function fakeHost(over: Partial<Host> = {}): Host & { log: string[] } {
  const log: string[] = [];
  return {
    log,
    count: () => 0,
    install: async (batch) => (log.push(`install:${batch.length}`), { ok: true, value: null }),
    retire: (ids) => (log.push(`retire:${ids.join(',')}`), { ok: true, value: null }),
    seed: (register) => (log.push(`seed:${register}`), { ok: true, value: { id: 'x' } }),
    remember: (row) => log.push(`pack:${row.id}@${row.version}`),
    forget: (id) => log.push(`forget:${id}`),
    claimed: () => [],
    ...over,
  };
}

const packOf = async (over: Record<string, unknown> = {}): Promise<Pack> => value<Pack>(await normalise(DOC(over)));

/* ── reading the document ────────────────────────────────────────────────── */

test('A PACK IS A DOCUMENT, and its kind is the key that is there', async () => {
  /* `{ register: 'obligations', … }` — the word is both the kind and the name, which is what makes
     a pack readable as a document rather than as a serialisation. */
  const pack = await packOf();
  assert.deepEqual(
    pack.declarations.map((d) => [d.kind, d.id]),
    [
      ['register', 'register.obligations'],
      ['rule', 'rule.chase'],
    ],
  );
  assert.deepEqual(pack.manifest.provides, ['register.obligations', 'rule.chase']);
  assert.equal(pack.checksum.length, 64);

  // And two declarations that are two things, or none, are neither.
  // A rule names the register it is about, so the ORDER is what says which word is the kind.
  assert.equal(value<Pack>(await normalise(DOC({ declarations: [{ rule: 'a', register: 'b', then: [] }], seeds: [] }))).declarations[0]?.kind, 'rule');
  assert.match(refusal(await normalise(DOC({ declarations: [{ name: 'a', register: 'b' }], seeds: [] }))).fix, /begins with name/);
  assert.equal(refusal(await normalise(DOC({ declarations: [{ name: 'a' }], seeds: [] }))).code, 'PACK_MALFORMED');
  assert.equal(refusal(await normalise(DOC({ declarations: [], seeds: [] }))).at, 'declarations');
  assert.equal(refusal(await normalise(DOC({ pack: 'Studio Books' }))).at, 'pack');
  assert.equal(refusal(await normalise(DOC({ version: '1.2' }))).at, 'version');
  assert.equal(refusal(await normalise(DOC({ license: '  ' }))).at, 'license');
});

test('AND A CREDENTIAL IS NEVER IN ONE, because a pack is a file people email each other', async () => {
  /* A `token:` inside a pack has been published to everybody who has ever had a copy. Refused at
     the door, by key name, before anything is stored — and at any depth, because the place it
     actually appears is inside a connector three levels down. */
  const withSecret = DOC({
    declarations: [
      { ingest: 'hsbc', channel: 'pull', every: '1h', auth: { headers: { api_key: 'sk-live-41' } }, extract: {}, writes: { register: 'x' } },
    ],
    seeds: [],
  });
  const out = refusal(await normalise(withSecret));
  assert.equal(out.code, 'SECRET_IN_PACK');
  assert.match(out.fix, /a pack is a file people share/);

  // An empty one is a placeholder, not a credential.
  assert.ok((await normalise(DOC({ declarations: [{ ingest: 'hsbc', channel: 'pull', token: '' }], seeds: [] }))).ok);
});

test('and a seed is one example row in the pack’s own register', async () => {
  assert.equal(refusal(await normalise(DOC({ seeds: [{ register: 'ghosts', fields: {} }] }))).at, 'seeds');
  const twice = DOC({ seeds: [{ register: 'obligations', fields: {} }, { register: 'obligations', fields: {} }] });
  assert.match(refusal(await normalise(twice)).fix, /seeds obligations twice/);
});

test('and one document written two ways is one checksum', async () => {
  // A pack from two places is one pack, so the source is metadata and is never hashed.
  const a = value<Pack>(await normalise(DOC(), { kind: 'kennel' }));
  const b = value<Pack>(await normalise(DOC(), { kind: 'paste', ref: 'clipboard' }));
  assert.equal(a.checksum, b.checksum);
  assert.notEqual(a.checksum, (await packOf({ version: '1.3.0' })).checksum);
});

/* ── the plan ────────────────────────────────────────────────────────────── */

test('THE PLAN SAYS WHAT WOULD HAPPEN, and refuses none of it', async () => {
  /* A plan of a pack that cannot be installed is the most useful thing here: it names the conflict,
     the missing dependency and the rows that would be orphaned in one screen. */
  const diff = await plan(await packOf(), EMPTY);

  assert.equal(diff.direction, 'install');
  assert.equal(diff.installed_version, null);
  assert.deepEqual(diff.adds.map((a) => a.id), ['register.obligations', 'rule.chase']);
  assert.equal(diff.adds[0]?.summary, '2 fields');
  assert.deepEqual(diff.changes, []);
  assert.deepEqual(diff.retires, []);
  assert.equal(diff.seeds.count, 1);
  assert.deepEqual(diff.interrupts, ['chase'], 'a rule that would interrupt somebody is not mentioned');
  assert.deepEqual(diff.touches, { rows_read: 0, rows_written: 0 });
  assert.equal(diff.orphans, 0);
  assert.match(diff.planHash, /^7\.[0-9a-f]{64}$/);
});

test('and it says what a pack would DO, before anybody has to read the file', async () => {
  const doc = DOC({
    declarations: [
      { register: 'skus', name: 'SKUs', title: 'code', fields: [{ id: 'code', type: 'text' }] },
      {
        rule: 'expand',
        register: 'styles',
        once_per: ['entry'],
        when: 'state is approved',
        then: [{ create: { register: 'skus', each: ['sizes'], bound: 60, fields: { code: 'x' } } }],
      },
      { ingest: 'npm', channel: 'pull', every: '6h', grant: 'g_1', extract: {}, writes: { register: 'skus' } },
    ],
    seeds: [],
  });
  const diff = await plan(value<Pack>(await normalise(doc)), EMPTY);

  assert.deepEqual(diff.spawns, [{ rule: 'expand', register: 'skus', bound: 60, when: 'state is approved' }]);
  assert.deepEqual(diff.calls_out, [{ ingest: 'npm', every: '6h', grant: 'g_1' }]);
  assert.ok(diff.warnings.some((w) => w.say.includes('arrives empty')));
});

test('AND A REGISTER WITH AN EXAMPLE AND NO `tags` IS REFUSED AT THE DOOR', async () => {
  /* The `example` marker IS the value `example` in a `list<text>` field called `tags`. A seeded
     register without one is a record whose examples cannot be told from its real rows, and nobody
     deletes what they cannot identify — so it is refused where a sentence fits rather than halfway
     through an install. */
  const doc = DOC({
    declarations: [{ register: 'obligations', name: 'O', title: 'what', fields: [{ id: 'what', type: 'text' }] }],
  });
  const out = refusal(await normalise(doc));
  assert.equal(out.code, 'FIELD_UNKNOWN');
  assert.equal(out.at, 'tags');

  // And a register nobody seeds needs none.
  assert.ok((await normalise(DOC({ declarations: doc.declarations, seeds: [] }))).ok);
});

test('and an upgrade names what changes and what goes', async () => {
  const first = await packOf();
  const state: Installed = {
    ...EMPTY,
    record_version: 20,
    packs: [{ id: 'studio-books', version: '1.2.0' }],
    declarations: [
      { id: 'register.obligations', version: 1, kind: 'register', pack_id: 'studio-books', body: first.declarations[0]!.canonical, checksum: 'a' },
      { id: 'rule.chase', version: 1, kind: 'rule', pack_id: 'studio-books', body: 'something else', checksum: 'b' },
      { id: 'page.old', version: 1, kind: 'page', pack_id: 'studio-books', body: '{}', checksum: 'c' },
    ],
    rows: { obligations: 4 },
  };

  const diff = await plan(await packOf({ version: '1.3.0' }), state);
  assert.equal(diff.direction, 'upgrade');
  assert.equal(diff.installed_version, '1.2.0');
  assert.deepEqual(diff.adds, []);
  assert.deepEqual(diff.changes.map((c) => c.id), ['rule.chase']);
  assert.deepEqual(diff.retires, [{ id: 'page.old', rows: 0 }]);
  assert.equal(diff.orphans, 0, 'a page carries no rows');

  const down = await plan(await packOf({ version: '1.0.0' }), state);
  assert.equal(down.direction, 'downgrade');
  assert.equal((await plan(await packOf(), state)).direction, 'reinstall');
});

test('and a range is a range', () => {
  assert.equal(satisfies('1.2.0', '>=1.0.0'), true);
  assert.equal(satisfies('1.2.0', '>=1.3.0'), false);
  assert.equal(satisfies('1.2.0', '^1.0.0'), true);
  assert.equal(satisfies('2.0.0', '^1.0.0'), false);
  assert.equal(satisfies('1.2.0', '1.x'), true);
  assert.equal(satisfies('1.2.0', '1.2.0'), true);
  assert.equal(satisfies('1.2.0', '*'), true);
  assert.equal(satisfies(null, '*'), false, 'a pack nobody has satisfies nothing');
});

/* ── the install ─────────────────────────────────────────────────────────── */

test('A PLAN IS A PROMISE ABOUT ONE MOMENT, and installing a different one is refused', async () => {
  /* The integer half catches a record that moved; the hash half catches a PACK edited between the
     plan and the install, which no version number can see — and which is exactly what happens when
     the thing being approved is a file in somebody's editor. */
  const pack = await packOf();
  const diff = await plan(pack, EMPTY);
  const host = fakeHost();

  assert.equal(refusal(await install(pack, diff, host, 'nonsense')).code, 'PLAN_STALE');
  assert.equal(refusal(await install(pack, diff, host, `8.${diff.planHash.split('.')[1]}`)).code, 'PLAN_STALE');
  assert.deepEqual(host.log, [], 'a stale plan wrote something');

  // The pack edited, the record still: a different checksum is a different hash.
  const edited = await packOf({ summary: 'Something else entirely.' });
  const same = await plan(edited, EMPTY);
  assert.notEqual(same.planHash, diff.planHash);

  const done = value<{ declarations: number; seeds: number }>(await install(pack, diff, host, diff.planHash));
  assert.equal(done.declarations, 2);
  assert.equal(done.seeds, 1);
  assert.deepEqual(host.log, ['install:2', 'seed:obligations', 'pack:studio-books@1.2.0']);
});

test('AND ROWS ARE NEVER THE PRICE OF AN UPGRADE', async () => {
  /* A pack that dropped a register somebody has been writing into for a year would take the year
     with it, and there is no `--force` because there is no sentence that makes that a good idea. */
  const state: Installed = {
    ...EMPTY,
    packs: [{ id: 'studio-books', version: '1.0.0' }],
    declarations: [
      { id: 'register.invoices', version: 1, kind: 'register', pack_id: 'studio-books', body: '{}', checksum: 'a' },
    ],
    rows: { invoices: 412 },
  };
  const pack = await packOf();
  const diff = await plan(pack, state);
  assert.equal(diff.orphans, 412);

  const out = refusal(await install(pack, diff, fakeHost(), diff.planHash));
  assert.equal(out.code, 'WOULD_ORPHAN');
  assert.match(out.fix, /412 rows in it/);
});

test('and two packs cannot own one declaration', async () => {
  const state: Installed = {
    ...EMPTY,
    declarations: [{ id: 'rule.chase', version: 1, kind: 'rule', pack_id: 'somebody-else', body: '{}', checksum: 'a' }],
  };
  const pack = await packOf();
  const diff = await plan(pack, state);
  assert.deepEqual(diff.conflicts, [{ id: 'rule.chase', pack: 'somebody-else' }]);

  const out = refusal(await install(pack, diff, fakeHost(), diff.planHash));
  assert.equal(out.code, 'PROVIDES_CONFLICT');
  assert.match(out.fix, /belongs to somebody-else/);
});

test('and a dependency it does not have is a refusal with the version in it', async () => {
  const pack = await packOf({ requires: { format: 9, primitives: 1, packs: {} } });
  const format = await plan(pack, EMPTY);
  assert.equal(format.requires.format.ok, false);
  assert.match(refusal(await install(pack, format, fakeHost(), format.planHash)).fix, /needs format 9 and this record is at 1/);

  const needs = await packOf({ requires: { format: 1, primitives: 1, packs: { 'studio-core': '>=2.0.0' } } });
  const diff = await plan(needs, { ...EMPTY, packs: [{ id: 'studio-core', version: '1.0.0' }] });
  assert.equal(diff.requires.packs[0]?.ok, false);
  assert.match(refusal(await install(needs, diff, fakeHost(), diff.planHash)).fix, /needs studio-core >=2.0.0, and this record has 1.0.0/);
});

test('and a seed the register refuses stops the install rather than becoming a row nothing could make', async () => {
  const pack = await packOf();
  const diff = await plan(pack, EMPTY);
  const host = fakeHost({ seed: () => ({ ok: false, refusal: { code: 'REQUIRED_MISSING', fix: 'obligations needs what.', at: 'what' } }) });
  assert.equal(refusal(await install(pack, diff, host, diff.planHash)).code, 'REQUIRED_MISSING');
});

/* ── and out again ───────────────────────────────────────────────────────── */

test('TAKING A PACK OUT KEEPS THE ROWS, and says how many are left where', async () => {
  /* A register retired is a shape nobody writes to any more, not a year of somebody's invoices
     deleted because they changed their mind about a pack. */
  const host = fakeHost({ claimed: () => ['register.obligations', 'rule.chase'], count: () => 412 });
  const out = value<{ declarations: number; rows_kept: Record<string, number> }>(uninstall('studio-books', host));

  assert.equal(out.declarations, 2);
  assert.deepEqual(out.rows_kept, { obligations: 412 });
  assert.deepEqual(host.log, ['retire:register.obligations,rule.chase', 'forget:studio-books']);

  assert.equal(refusal(uninstall('nothing', fakeHost())).code, 'OUT_OF_BOUNDS');
});
