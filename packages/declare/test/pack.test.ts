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
    stage: async (batch) => (log.push(`stage:${batch.length}`), { ok: true, value: () => (log.push('install'), { ok: true, value: null }) }),
    transaction: (fn) => fn(),
    reload: () => log.push('reload'),
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

test('A `provides` THAT DISAGREES WITH THE DECLARATIONS IS REFUSED, and it used to be overwritten', async () => {
  /* `04 §5` line 92: derived, "it may be written out for a reader, and if it is, it must equal the
     derived list, `PROVIDES_MISMATCH` otherwise". This computed the derivation and assigned over
     whatever the manifest said, so a pack could claim to provide something it does not and the
     claim was DELETED rather than refused.

     WHAT THAT COSTS IS THE ONE THING `provides` EXISTS FOR, which `04 §5` states one heading down:
     "`provides` is `kind.id`, and that is what makes conflict detectable". A person reads the
     manifest to decide whether to install a pack; the list they read was the list being thrown
     away. The two agree on an honest pack and differ on exactly the one that matters. */
  const said = refusal(await normalise(DOC({ provides: ['register.obligations', 'rule.chase', 'register.fx'] })));
  assert.equal(said.code, 'PROVIDES_MISMATCH');
  assert.match(said.fix, /provides lists register\.fx; no declaration provides it/u);
  assert.equal(said.at, 'provides');
  assert.deepEqual(said.allowed, ['register.obligations', 'rule.chase']);

  /* AND THE OTHER DIRECTION, which is the one a reader is more likely to meet: a pack that grew a
     declaration and whose written-out list was not updated with it. Silence there would install
     something nobody read about. */
  const short = refusal(await normalise(DOC({ provides: ['register.obligations'] })));
  assert.equal(short.code, 'PROVIDES_MISMATCH');
  assert.match(short.fix, /rule\.chase is declared here and provides does not list it/u);

  /* AND A LIST THAT AGREES IS ACCEPTED, in any order, because a set written down by hand is not an
     ordering somebody chose. */
  const fine = value<Pack>(await normalise(DOC({ provides: ['rule.chase', 'register.obligations'] })));
  assert.deepEqual(fine.manifest.provides, ['register.obligations', 'rule.chase']);

  /* AND A PACK THAT WRITES NONE STILL GETS ONE, because it is derived and the checksum omits it. */
  assert.deepEqual((await packOf()).manifest.provides, ['register.obligations', 'rule.chase']);
});

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
  assert.deepEqual(host.log, ['stage:2', 'install', 'reload', 'seed:obligations', 'pack:studio-books@1.2.0', 'reload']);
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
  /* `reload` LAST, and inside the same `finally` an install uses: the two of them are one
     transaction now, so whichever way it ends the caches are rebuilt from what the record holds. */
  assert.deepEqual(host.log, ['retire:register.obligations,rule.chase', 'forget:studio-books', 'reload']);

  assert.equal(refusal(uninstall('nothing', fakeHost())).code, 'OUT_OF_BOUNDS');
});

test('AND A REFUSED INSTALL CHANGES NOTHING, which four separate commits could not promise', async () => {
  /* A seed the register refused used to land after the declarations and the retires had already
     committed: one declaration retired and another live, from a call that returned a refusal — and
     the pack row still saying the old version, so the next plan of the identical document reported
     an upgrade with an empty diff. */
  const pack = await packOf();
  const diff = await plan(pack, EMPTY);

  const rolled: string[] = [];
  const host = fakeHost({
    transaction: <T,>(fn: () => T): T => {
      try {
        return fn();
      } catch (e) {
        rolled.push('rollback');
        throw e;
      }
    },
    seed: () => ({ ok: false, refusal: { code: 'REQUIRED_MISSING', fix: 'obligations needs what.', at: 'what' } }),
  });

  assert.equal(refusal(await install(pack, diff, host, diff.planHash)).code, 'REQUIRED_MISSING');
  assert.deepEqual(rolled, ['rollback'], 'the transaction was not rolled back');
  assert.equal(host.log.includes('pack:studio-books@1.2.0'), false, 'the pack row was written by a refused install');
});

test('A SEED IS LOOKED AT TOO, and a token in an example row went into the pack’s own checksum', async () => {
  /* The declarations were checked and the seeds were not, so a `token:` in an example row was
     hashed with the file, shared with it, and landed as a live row. */
  const doc = DOC({
    declarations: [
      { register: 'connections', name: 'Connections', title: 'what', fields: [{ id: 'what', type: 'text' }, { id: 'tags', type: 'list', of: 'text' }] },
    ],
    seeds: [{ register: 'connections', fields: { what: 'HSBC feed', token: 'sk-live-41' } }],
  });
  const out = refusal(await normalise(doc));
  assert.equal(out.code, 'SECRET_IN_PACK');
  assert.match(out.fix, /example row carries a token/);
});

test('and `seeds` written as a mapping is a sentence rather than no seeds at all', async () => {
  // The natural YAML mistake. It used to yield a pack with zero seeds and an install that planted
  // nothing while the plan reported `seeds: 0` and looked correct.
  const out = refusal(await normalise(DOC({ seeds: { obligations: { what: 'x' } } })));
  assert.equal(out.code, 'PACK_MALFORMED');
  assert.equal(out.at, 'seeds');
});

test('AND A RANGE THIS DOES NOT UNDERSTAND IS NOT A VERSION', async () => {
  /* `~1.2.0` fell through to an exact compare, and `Number('~1') || 0` made the range the VERSION
     `0.2.0` — refusing the right dependency and accepting the wrong one. */
  assert.equal(satisfies('1.2.3', '~1.2.0'), true);
  assert.equal(satisfies('0.2.0', '~1.2.0'), false);
  assert.equal(satisfies('1.3.0', '~1.2.0'), false);
  assert.equal(satisfies('1.2.0', '?!nonsense'), false, 'a range nobody wrote became a version');

  // A prerelease is below its release, or a dependency check admits what somebody marked unready.
  assert.equal(satisfies('1.0.0-alpha', '>=1.0.0'), false);
  assert.equal(satisfies('1.0.0-alpha', '1.0.0'), false);
  assert.equal(satisfies('2.0.0-rc.1', '^2.0.0'), false);
  assert.equal(satisfies('1.0.0', '>=1.0.0-alpha'), true);

  // And below one, the minor is the compatibility boundary, because nothing there promises anything.
  assert.equal(satisfies('0.9.0', '^0.1.0'), false);
  assert.equal(satisfies('0.1.4', '^0.1.0'), true);
  assert.equal(satisfies('1.10.0', '>=1.9.0'), true, 'the compare is numeric, not lexical');
});

test('and a body this record cannot write down is a refusal, never a throw', async () => {
  // `normalise` takes an `unknown`, and the house rule is that a refusal is a value.
  const circular: Record<string, unknown> = { register: 'loops', name: 'L', title: 'what', fields: [] };
  circular.self = circular;
  assert.equal(refusal(await normalise(DOC({ declarations: [circular], seeds: [] }))).code, 'PACK_MALFORMED');

  const big = { register: 'bigs', name: 'B', title: 'what', fields: [], size: 1n };
  assert.equal(refusal(await normalise(DOC({ declarations: [big], seeds: [] }))).code, 'PACK_MALFORMED');
});

/* ── which version satisfies which range ─────────────────────────────────── */

test('A SPACE-SEPARATED RANGE IS EVERY COMPARATOR, and all of them must hold', () => {
  /* `>=1.0.0 <2.0.0` fell into the `>=` branch whole and `parts()` read `1.0.0 <2.0.0` as `1.0.0`,
     so the upper bound vanished and 3.0.0 satisfied it — a dependency check admitting the major
     version the range exists to exclude. */
  assert.equal(satisfies('1.5.0', '>=1.0.0 <2.0.0'), true);
  assert.equal(satisfies('3.0.0', '>=1.0.0 <2.0.0'), false);
  assert.equal(satisfies('0.9.0', '>=1.0.0 <2.0.0'), false);
});

test('and `x` is a wildcard in the position it sits in', () => {
  // It compared the major only, so `1.2.x` meant `1.x` and admitted 1.9.0: a range written to pin a
  // minor, pinning nothing.
  assert.equal(satisfies('1.2.7', '1.2.x'), true);
  assert.equal(satisfies('1.9.0', '1.2.x'), false);
  assert.equal(satisfies('2.2.0', '1.2.x'), false);
  assert.equal(satisfies('1.9.0', '1.x'), true);
});

test('A PRERELEASE ORDERS BY ITS IDENTIFIERS, numerically where they are numbers', () => {
  /* As a single string `alpha.10 < alpha.9`, so `>=1.0.0-alpha.9` refused `alpha.10` — the later
     version. And `v.split('-')` destructured the second element, so `rc-1` and `rc-2` both became
     `rc` and compared equal: two different prereleases the check could not tell apart. */
  assert.equal(satisfies('1.0.0-alpha.10', '>=1.0.0-alpha.9'), true);
  assert.equal(satisfies('1.0.0-alpha.9', '>=1.0.0-alpha.10'), false);
  assert.equal(satisfies('1.0.0-rc-2', '>1.0.0-rc-1'), true);
  assert.equal(satisfies('1.0.0-rc-1', '>1.0.0-rc-2'), false);
  // A numeric identifier is below an alphanumeric one, and fewer identifiers is below more.
  assert.equal(satisfies('1.0.0-alpha.beta', '>1.0.0-alpha.1'), true);
  assert.equal(satisfies('1.0.0-alpha.1', '>1.0.0-alpha'), true);
});

test('and a prerelease is still below its own release', () => {
  // The rule stripping the tag used to break: it made `1.0.0-alpha` satisfy `>=1.0.0`, a check
  // admitting the version somebody marked as not ready.
  assert.equal(satisfies('1.0.0-alpha', '>=1.0.0'), false);
  assert.equal(satisfies('1.0.0', '>=1.0.0-alpha'), true);
});

test('AND AN UNINSTALL THAT FAILS HALFWAY LEAVES NOTHING HALF-DONE', () => {
  /* `retire` and `forget` each opened their own transaction and nothing wrapped the pair, so a
     failure between them left the declarations retired and the pack row alive: `listPacks` still
     showed a pack whose registers were gone, and retrying was impossible because `claimed` filters
     on `retired = 0`, so the second attempt answered "not installed". An uninstall that can leave
     the record in a state no command can reach is not an uninstall. */
  let rolled = false;
  const host = fakeHost({
    claimed: () => ['register.obligations'],
    count: () => 4,
    forget: () => {
      throw new Error('the pack row would not go');
    },
    transaction: <T,>(fn: () => T): T => {
      try {
        return fn();
      } catch (e) {
        rolled = true;
        throw e;
      }
    },
  });

  assert.throws(() => uninstall('studio-books', host));
  assert.ok(rolled, 'the retire was not inside a transaction the forget could roll back');
});

test('and a space after the comparator is not a second comparator', () => {
  /* Splitting on every space turned `>= 1.0.0` into `>=` and `1.0.0` — so a range written with a
     space after the operator, which is legal and common, blocked every version that satisfies it:
     the same class of wrong answer as the missing upper bound, in the other direction. */
  assert.equal(satisfies('1.2.3', '>= 1.0.0'), true);
  assert.equal(satisfies('0.9.0', '>= 1.0.0'), false);
  assert.equal(satisfies('1.5.0', '>= 1.0.0 < 2.0.0'), true);
  assert.equal(satisfies('3.0.0', '>= 1.0.0 < 2.0.0'), false);
});
