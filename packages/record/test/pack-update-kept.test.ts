/**
 * A record on money-core 1.5.0 whose owner edited one money-core declaration in the app, offered the current version
 * (three probes made into assertions). The first probe was offered 1.6.0. 1.6.0 was never released, so a record on
 * 1.5.0 is now offered 1.7.0 directly, and what is kept and what is refused is the same.
 *
 * THE UPDATE WAS OFFERED AND THEN REFUSED. `arrangement` compared versions and offered 1.6.0; `propose` planned it, found
 * the edited `spent-30d` with `pack_id` null, called it `PROVIDES_CONFLICT`, and told the owner to retire the figure they
 * had edited. Measured on the probe: `received-30d`, which nobody touched, stayed at `-31d`, and the four bank wordings
 * never arrived. The same happened to an owner who had only moved a block on the Money page. The record kept the fact
 * that settles it: the superseded row still says `pack_id = 'money-core'`.
 *
 * SO AN EDIT OF THE PACK'S OWN DECLARATION IS KEPT, NAMED, AND LEFT OUT OF WHAT IS STAGED. Four cases still refuse: a
 * declaration written in the app that was never the pack's, one another pack owns, a kept page reading a figure the
 * update retires, and a kept list the update changes, whose new field a new metric would sum over nothing.
 *
 * THE CURRENT VERSION IS READ FROM `FIRST_PARTY_VERSIONS`, NOT WRITTEN HERE, and the versions made up to be offered are
 * the minor steps above it, so the next raise of money-core does not turn these tests red for a reason that is not theirs.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { FIRST_PARTY, FIRST_PARTY_VERSIONS, firstPartyDocument } from '../../seed/src/index.ts';
import { seedCatalogue } from '../../seed/src/usecases/catalogue.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const agent: CallContext = { principal: { kind: 'token', id: 't', scope: 'propose', person: 'p_1', level: 'owner' } };

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };
const said = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};
const refused = (r: unknown): { code: string; fix: string } => {
  const x = r as Out;
  assert.equal(x.ok, false, `expected a refusal, got ${JSON.stringify(x).slice(0, 300)}`);
  return x.refusal!;
};

type Doc = { version: string; declarations: Record<string, unknown>[]; config?: unknown };
type Diff = { planHash: string; approve: string[]; conflicts: { id: string; pack: string }[]; kept?: { id: string }[]; changes: { id: string }[]; adds: { id: string }[] };
const NOW = Date.UTC(2026, 8, 22, 12);

/** The version the first-party document is, and the made-up versions above it that the refusals below are offered. */
const CURRENT = FIRST_PARTY_VERSIONS['money-core'];
const [major, minor] = CURRENT.split('.').map(Number) as [number, number];
const NEXT = `${major}.${minor + 1}.0`;
const AFTER = `${major}.${minor + 2}.0`;
/** The refusal's "leave money-core at <version>", with the dots of the version taken literally. */
const leaveAt = (version: string) => new RegExp(`leave money-core at ${version.replaceAll('.', '\\.')}`, 'u');

/**
 * The only bank patterns 1.5.0 had. Every other one, mail pattern or SMS twin, arrived with a later version. Since
 * money-core 3.0.0 the card patterns live in `packs/card-alerts`, so the current document carries none and `BANK` is
 * empty: the "did not arrive" loop below guards the day a pattern comes back, and checks nothing today.
 */
const IN_150 = ['bank-card-in', 'bank-card-out'];
const BANK = (firstPartyDocument('money-core') as unknown as Doc).declarations
  .map((x) => x.ingest)
  .filter((i): i is string => typeof i === 'string' && !IN_150.includes(i));

/**
 * AN OLDER money-core STANDING IN FOR 1.5.0, rebuilt from the current document: called 1.5.0, every bank pattern but
 * the two 1.5.0 had taken out, and Spent and Received counting 31 days again. It was once exactly 1.5.0 (fingerprint
 * `6442babb13c81d12`, measured against the document built from `aeef01c5^`). It is no longer: the current document has
 * no bank pattern to take out, and 3.0.0 changed the figures (each money target is now a setting), so this is today's
 * declarations under an older number and the two older windows. That is all these tests need: an installed version
 * below the current one, and a `spent-30d` whose `where` the update would rewrite.
 */
const v150 = (): Doc => {
  const d = structuredClone(firstPartyDocument('money-core')) as unknown as Doc;
  d.version = '1.5.0';
  d.declarations = d.declarations
    .filter((x) => x.ingest === undefined || IN_150.includes(String(x.ingest)))
    .map((x) => (typeof x.where === 'string' && ['spent-30d', 'received-30d'].includes(String(x.metric)) ? { ...x, where: x.where.replace('on after -30d', 'on after -31d') } : x));
  return d;
};

/** Every first-party pack installed as the owner, money-core at `money`, and `edit` changed through `setDeclaration`. */
async function recordWith(money: Doc | null, edit: string | null, catalogue = seedCatalogue()) {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW), catalogue });
  for (const id of FIRST_PARTY) {
    const doc = id === 'money-core' && money ? money : firstPartyDocument(id);
    const planned = said<{ diff: Diff }>(await api.planPack({ doc, source: { kind: 'local' } } as never, owner));
    said(await api.installPack({ doc, source: { kind: 'local' }, planHash: planned.diff.planHash, approve: planned.diff.approve } as never, owner));
  }
  if (edit) {
    const r = api.kernel.declarations().find((x) => x.id === edit)!;
    const kind = edit.split('.')[0]!;
    const own = edit.slice(kind.length + 1);
    const b = JSON.parse(r.body) as Record<string, unknown>;
    const body = kind === 'page' ? { page: own, ...b, title: 'My money' } : kind === 'register' ? { register: own, ...b, name: 'My rates' } : { [kind]: own, ...b, name: 'Spent, last month' };
    said(await api.setDeclaration({ body, version: r.version } as never, owner));
  }
  return { sql, api, k: api.kernel };
}

const row = (k: { declarations: () => { id: string; version: number; pack_id: string | null; body: string }[] }, id: string) => {
  const r = k.declarations().find((x) => x.id === id);
  return r ? { version: r.version, pack: r.pack_id, body: JSON.parse(r.body) as Record<string, unknown> } : null;
};

/** A next version of money-core on offer, so the refusals are driven through `propose` as an agent reaches them. */
const offering = (doc: Doc) => seedCatalogue().map((e) => (e.id === 'money-core' ? { ...e, version: doc.version, doc: () => structuredClone(doc) as never } : e));

for (const [edit, name] of [
  ['metric.spent-30d', 'Spent, last month'],
  ['page.money', 'My money'],
] as const)
  test(`edited ${edit}: the current version is offered naming what it keeps, accepted, and takes everything else`, async () => {
    const { sql, api, k } = await recordWith(v150(), edit);

    const ar = said<{ updates?: unknown }>(await api.arrangement({}, agent));
    assert.deepEqual(ar.updates, [{ id: 'money-core', from: '1.5.0', to: CURRENT, keeps: [edit] }]);

    const planned = said<{ diff: Diff }>(await api.planPack({ doc: firstPartyDocument('money-core'), source: { kind: 'local' } } as never, owner));
    assert.deepEqual(planned.diff.conflicts, [], 'the owner Install button is disabled while conflicts is not empty');
    assert.deepEqual(planned.diff.kept, [{ id: edit }]);

    const filed = said<{ id: string }>(await api.propose({ question: 'Update money?', body_kind: 'pack', body: { install: 'money-core' } } as never, agent));
    const asked = said<{ body: { plan: { pack: string; keeps?: string[]; changes?: string[] }[]; names?: Record<string, string> } }>(await api.governance({ id: filed.id }, owner));
    const step = asked.body.plan.find((s) => s.pack === 'money-core');
    assert.deepEqual(step?.keeps, [edit]);
    assert.ok(!(step?.changes ?? []).includes(edit), 'a kept declaration is listed as changed');
    assert.equal(asked.body.names?.[edit], name, 'Decide names the kept declaration by the name the owner gave it');

    said(await api.decide({ id: filed.id, decide: { option: 'accept', reason: 'yes' } } as never, owner));
    assert.equal(k.packStates().find((p) => p.id === 'money-core')?.version, CURRENT);
    assert.match(String(row(k, 'metric.received-30d')?.body.where), /on after -30d/u);
    for (const b of BANK) assert.ok(row(k, `ingest.${b}`), `ingest.${b} did not arrive`);
    const kept = row(k, edit)!;
    assert.equal(kept.version, 2);
    assert.equal(kept.pack, null, 'a later uninstall of money-core could take the edit');
    assert.equal(kept.body.name ?? kept.body.title, name);
    if (edit === 'metric.spent-30d') assert.match(String(kept.body.where), /on after -31d/u, 'the update rewrote what the owner wrote');
    else assert.match(String(row(k, 'metric.spent-30d')?.body.where), /on after -30d/u);
    const after = said<{ updates?: unknown }>(await api.arrangement({}, agent));
    assert.equal(after.updates, undefined);
    sql.close();
  });

test('a declaration written in the app that was never the pack’s is still a conflict, in today’s sentence', async () => {
  const mine = { metric: 'fx-spread', name: 'My spread', source: 'register.fx', value: { count: true }, format: 'int', target: { lte: 100 }, window: '30d', compare: 'previous' };
  const next = structuredClone(firstPartyDocument('money-core')) as unknown as Doc;
  next.version = NEXT;
  next.declarations.push({ ...mine, name: 'Spread' });
  const { sql, api, k } = await recordWith(null, null, offering(next));
  said(await api.setDeclaration({ body: mine } as never, owner));

  const planned = said<{ diff: Diff }>(await api.planPack({ doc: next, source: { kind: 'local' } } as never, owner));
  assert.deepEqual(planned.diff.conflicts, [{ id: 'metric.fx-spread', pack: '(this record)' }]);
  assert.deepEqual(planned.diff.kept, []);
  const put = refused(await api.installPack({ doc: next, source: { kind: 'local' }, planHash: planned.diff.planHash, approve: planned.diff.approve } as never, owner));
  assert.equal(put.code, 'PROVIDES_CONFLICT');
  assert.match(put.fix, /metric\.fx-spread was made here/u);
  const filed = refused(await api.propose({ question: 'Update money?', body_kind: 'pack', body: { install: 'money-core' } } as never, agent));
  assert.equal(filed.code, 'PROVIDES_CONFLICT');
  assert.match(filed.fix, /money-core would take over metric\.fx-spread, which \(this record\) holds/u);
  assert.equal(row(k, 'metric.fx-spread')?.body.name, 'My spread');
  sql.close();
});

test('a declaration another pack owns is still a conflict', async () => {
  const { sql, api, k } = await recordWith(null, null);
  const theirs = k.declarations().find((d) => d.pack_id !== null && d.pack_id !== 'money-core' && d.pack_id !== 'kernel' && d.kind === 'page')!;
  const next = structuredClone(firstPartyDocument('money-core')) as unknown as Doc;
  next.version = NEXT;
  next.declarations.push({ page: theirs.id.slice('page.'.length), ...(JSON.parse(theirs.body) as object) });
  const planned = said<{ diff: Diff }>(await api.planPack({ doc: next, source: { kind: 'local' } } as never, owner));
  assert.deepEqual(planned.diff.conflicts, [{ id: theirs.id, pack: theirs.pack_id }]);
  const put = refused(await api.installPack({ doc: next, source: { kind: 'local' }, planHash: planned.diff.planHash, approve: planned.diff.approve } as never, owner));
  assert.equal(put.code, 'PROVIDES_CONFLICT');
  assert.match(put.fix, new RegExp(`belongs to ${theirs.pack_id}`, 'u'));
  sql.close();
});

/* The second probe's case, which the conflict used to hide: the page stays the owner's, and the update drops the figure
   its first tile reads. Measured before the guard, the install succeeded and the page drew a tile for a figure that no
   longer existed. Both shapes of the next version: one still shipping the page (so the page is kept), and the probe's,
   which ships none. */
for (const ships of [true, false])
  test(`a kept page reading a figure the update retires is refused, and nothing is written (next version ${ships ? 'ships' : 'drops'} the page)`, async () => {
    const next = structuredClone(firstPartyDocument('money-core')) as unknown as Doc;
    next.version = NEXT;
    next.declarations = next.declarations.filter((x) => x.metric !== 'cash-now' && (ships || x.page !== 'money'));
    const { sql, api, k } = await recordWith(null, 'page.money', offering(next));
    assert.ok(row(k, 'page.money')!.body.blocks && JSON.stringify(row(k, 'page.money')!.body).includes('cash-now'));
    const before = k.version();

    const planned = said<{ diff: Diff }>(await api.planPack({ doc: next, source: { kind: 'local' } } as never, owner));
    const put = refused(await api.installPack({ doc: next, source: { kind: 'local' }, planHash: planned.diff.planHash, approve: planned.diff.approve } as never, owner));
    assert.equal(put.code, 'PROVIDES_CONFLICT');
    assert.match(put.fix, /no longer has metric\.cash-now/u);
    assert.match(put.fix, /which you changed, reads it/u);
    assert.match(put.fix, leaveAt(CURRENT));
    const filed = refused(await api.propose({ question: 'Update money?', body_kind: 'pack', body: { install: 'money-core' } } as never, agent));
    assert.equal(filed.code, 'PROVIDES_CONFLICT');
    assert.match(filed.fix, /no longer has metric\.cash-now, and your My money page, which you changed, reads it/u);
    assert.equal(k.version(), before, 'a refused update wrote something');
    assert.ok(row(k, 'metric.cash-now'), 'the figure the page reads was retired');
    assert.equal(k.packStates().find((p) => p.id === 'money-core')?.version, CURRENT);
    sql.close();
  });

/* The third probe: a kept LIST the update changes. Left out as the kept rule leaves a declaration, the install went
   through with nothing retired and nothing unresolved, and the record held a live metric summing a field its list did
   not have. The kernel does not catch that either (`sum: 'nosuch'` is also ok), so the kept rule has to. */
test('a kept list the update changes is refused, and nothing is written', async () => {
  const next = structuredClone(firstPartyDocument('money-core')) as unknown as Doc;
  next.version = NEXT;
  const fx = next.declarations.find((x) => x.register === 'fx' && !x.rule && !x.metric)! as { fields: unknown[] };
  fx.fields.push({ id: 'spread', type: 'decimal' });
  next.declarations.push({ metric: 'fx-spread', name: 'Spread', source: 'register.fx', value: { sum: 'spread' }, format: 'decimal', target: { lte: 100 }, window: '30d', compare: 'previous' });
  const { sql, api, k } = await recordWith(null, 'register.fx', offering(next));
  const before = k.version();

  const planned = said<{ diff: Diff }>(await api.planPack({ doc: next, source: { kind: 'local' } } as never, owner));
  assert.deepEqual(planned.diff.kept, []);
  assert.deepEqual(planned.diff.conflicts.map((c) => c.id), ['register.fx']);
  const put = refused(await api.installPack({ doc: next, source: { kind: 'local' }, planHash: planned.diff.planHash, approve: planned.diff.approve } as never, owner));
  assert.equal(put.code, 'PROVIDES_CONFLICT');
  assert.match(put.fix, /changes register\.fx, which you changed/u);
  const filed = refused(await api.propose({ question: 'Update money?', body_kind: 'pack', body: { install: 'money-core' } } as never, agent));
  assert.equal(filed.code, 'PROVIDES_CONFLICT');
  assert.match(filed.fix, /changes your My rates list, which you changed/u);
  assert.equal(k.version(), before, 'a refused update wrote something');
  assert.equal(row(k, 'metric.fx-spread'), null);
  assert.equal(row(k, 'register.fx')?.body.name, 'My rates');
  sql.close();
});

/* The same list kept when the update leaves it as the pack last wrote it: nothing it adds reads a field the owner's list
   lacks, so it is kept like any other edit. */
test('a kept list the update does not change is kept', async () => {
  const next = structuredClone(firstPartyDocument('money-core')) as unknown as Doc;
  next.version = NEXT;
  const { sql, api, k } = await recordWith(null, 'register.fx', offering(next));
  const planned = said<{ diff: Diff }>(await api.planPack({ doc: next, source: { kind: 'local' } } as never, owner));
  assert.deepEqual(planned.diff.conflicts, []);
  assert.deepEqual(planned.diff.kept, [{ id: 'register.fx' }]);
  said(await api.installPack({ doc: next, source: { kind: 'local' }, planHash: planned.diff.planHash, approve: planned.diff.approve } as never, owner));
  assert.equal(k.packStates().find((p) => p.id === 'money-core')?.version, NEXT);
  assert.equal(row(k, 'register.fx')?.body.name, 'My rates');
  assert.equal(row(k, 'register.fx')?.pack, null);
  sql.close();
});

/* An owner who arranges Money twice has two rows with `pack_id` null above the pack's. A rule of "latest earlier
   version" reads the second edit's predecessor, which is the owner's first, and would call the page never the pack's. */
test('a page edited twice is still kept', async () => {
  const { sql, api, k } = await recordWith(v150(), 'page.money');
  const r = k.declarations().find((x) => x.id === 'page.money')!;
  said(await api.setDeclaration({ body: { page: 'money', ...(JSON.parse(r.body) as object), title: 'Money, mine' }, version: r.version } as never, owner));
  const planned = said<{ diff: Diff }>(await api.planPack({ doc: firstPartyDocument('money-core'), source: { kind: 'local' } } as never, owner));
  assert.deepEqual(planned.diff.conflicts, []);
  assert.deepEqual(planned.diff.kept, [{ id: 'page.money' }]);
  sql.close();
});

/* An id the pack retired and the owner then wrote again from nothing is the owner's, not an edit of the pack's: the pack's
   row above it is retired, and `detached()` does not count a retire between the two. Measured with that clause taken out
   of the query, the returning version planned the owner's figure as kept, with no conflict to stop the install. */
test('a figure the pack retired and the owner wrote again is still a conflict when the pack brings it back', async () => {
  const without = structuredClone(firstPartyDocument('money-core')) as unknown as Doc;
  without.version = NEXT;
  without.declarations = without.declarations.filter((x) => x.metric !== 'received-30d' && !JSON.stringify(x).includes('received-30d'));
  const { sql, api, k } = await recordWith(null, null);
  const dropped = said<{ diff: Diff }>(await api.planPack({ doc: without, source: { kind: 'local' } } as never, owner));
  said(await api.installPack({ doc: without, source: { kind: 'local' }, planHash: dropped.diff.planHash, approve: dropped.diff.approve } as never, owner));
  assert.equal(row(k, 'metric.received-30d'), null);
  said(await api.setDeclaration({ body: { metric: 'received-30d', name: 'Mine', source: 'register.fx', value: { count: true }, format: 'int', target: { lte: 100 }, window: '30d', compare: 'previous' } } as never, owner));

  const back = structuredClone(firstPartyDocument('money-core')) as unknown as Doc;
  back.version = AFTER;
  const planned = said<{ diff: Diff }>(await api.planPack({ doc: back, source: { kind: 'local' } } as never, owner));
  assert.deepEqual(planned.diff.kept, []);
  assert.deepEqual(planned.diff.conflicts, [{ id: 'metric.received-30d', pack: '(this record)' }]);
  sql.close();
});

/* The superseded row names the pack the edit started from, and only that pack's update may keep it. An owner's edit of a
   figure another pack wrote is not money-core's to keep: measured with the `was` test taken out, money-core planned the
   other pack's figure as its own kept declaration. */
test('an edit of a declaration another pack wrote first is a conflict for this pack', async () => {
  const fig = { metric: 'fx-count', name: 'Rates', source: 'register.fx', value: { count: true }, format: 'int', target: { lte: 100 }, window: '30d', compare: 'previous' };
  const other = { pack: 'fx-extra', version: '1.0.0', summary: 'A count of rates.', author: 'BrainDog', license: 'MIT', requires: { format: 1, primitives: 1, packs: { 'money-core': '>=1.0.0' } }, declarations: [fig] };
  const { sql, api, k } = await recordWith(null, null);
  const put = said<{ diff: Diff }>(await api.planPack({ doc: other, source: { kind: 'local' } } as never, owner));
  said(await api.installPack({ doc: other, source: { kind: 'local' }, planHash: put.diff.planHash, approve: put.diff.approve } as never, owner));
  const r = k.declarations().find((x) => x.id === 'metric.fx-count')!;
  said(await api.setDeclaration({ body: { ...fig, name: 'My rates' }, version: r.version } as never, owner));

  const next = structuredClone(firstPartyDocument('money-core')) as unknown as Doc;
  next.version = NEXT;
  next.declarations.push(fig);
  const planned = said<{ diff: Diff }>(await api.planPack({ doc: next, source: { kind: 'local' } } as never, owner));
  assert.deepEqual(planned.diff.kept, []);
  assert.deepEqual(planned.diff.conflicts, [{ id: 'metric.fx-count', pack: '(this record)' }]);
  sql.close();
});

/* An owner's edit of a figure held to one of its pack's settings. money-core 3.0.0 holds every money target to a setting,
   and `setDeclaration` reads the body as a one-declaration pack called `in-app`, which declares none: measured before the
   repair, renaming "Spent, 30 days" was refused `FIELD_UNKNOWN` at `metric.spent-30d.target.setting`. The second edit
   stands on a row with `pack_id` null, so the setting is found through the pack whose row the first edit replaced. */
test('a figure held to its pack’s setting can be edited, twice, and a figure written from nothing still cannot name one', async () => {
  const { sql, api, k } = await recordWith(null, 'metric.spent-30d');
  const first = row(k, 'metric.spent-30d')!;
  assert.deepEqual(first.body.target, { setting: 'most_spent_30d' });
  assert.equal(first.pack, null);
  said(await api.setDeclaration({ body: { metric: 'spent-30d', ...first.body, name: 'Spent, mine' }, version: first.version } as never, owner));
  assert.equal(row(k, 'metric.spent-30d')?.body.name, 'Spent, mine');

  const mine = { metric: 'my-spent', name: 'Mine', source: 'register.transactions', value: { sum: 'amount' }, format: 'money', target: { setting: 'most_spent_30d' }, window: '30d', compare: 'previous' };
  const no = refused(await api.setDeclaration({ body: mine } as never, owner));
  assert.equal(no.code, 'FIELD_UNKNOWN');
  assert.equal(row(k, 'metric.my-spent'), null);
  sql.close();
});
