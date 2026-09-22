/**
 * Every declaration a bundle installs lands against the version it was drawn from, not only the one it is filed under.
 *
 * `loop/research-batch-thirty-four-audit.md` finding 2, measured at `eafe8c20` with `drawn.mts`: `propose` stamped
 * `from_version` for `declaration_id` alone, and `decide` turned it into ONE `expect`, so every other member of
 * `{ declarations: [...] }` installed with no version at all. A change filed under a metric carrying a Projects body read
 * at v1 erased the `domain` another accepted change had added at v2, and a change filed under Projects at its live
 * version carried a stale metric over somebody else's edit to it. Both decisions read "accept".
 *
 * Each case drives the kernel the way `record`'s `land` does: `decide`, then `install` of what it hands back against the
 * `expect` it names. No row holds a `domain` value, for the reason `record/test/schema-add.test.ts` gives: with one,
 * `WOULD_ORPHAN` would refuse the erasure on its own and these would pass with no version at all.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { codeOf, fixOf, type Result } from '@braindog/ports';

import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 22, 12);

const FIELDS = [
  { id: 'name', type: 'text', required: true },
  { id: 'lane', type: 'enum', values: ['building', 'earning', 'parked'], required: true },
];
const THINGS: Declaration = { id: 'register.things', kind: 'register', body: { id: 'things', name: 'Projects', title: 'name', fields: FIELDS } as never };
const WITH_DOMAIN: Declaration = { ...THINGS, body: { ...(THINGS.body as object), fields: [...FIELDS, { id: 'domain', type: 'url' }] } as never };
const metric = (where: string, name = 'Earning'): Declaration => ({
  id: 'metric.earning',
  kind: 'metric',
  body: { metric: 'earning', name, source: 'register.things', value: { count: 'id' }, format: 'int', target: { gte: 0 }, window: '30d', where } as never,
});

type Conflict = { version: number; current: { id?: string } | null };

async function record() {
  const sql: NodeSql = openSqlite();
  const k: Kernel = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([THINGS, metric('lane is earning')])).ok);
  const file = (declaration_id: string, to: unknown, from_version?: unknown) =>
    k.propose({ question: 'Change this?', body_kind: 'change', body: { declaration_id, to, ...(from_version === undefined ? {} : { from_version }) } }, 'p_1');
  /** Accept, then install as `record`'s `land` does: what `decide` hands back, against the `expect` it names. */
  const accept = async (id: string): Promise<Result<unknown>> => {
    const out = k.decide(id, { decide: { option: 'accept', reason: 'yes' } }, 'p_owner');
    if (!out.ok) return out;
    return k.install([out.value.install as never], out.value.expect);
  };
  const idOf = (out: Result<{ id: string }>): string => {
    assert.ok(out.ok, fixOf(out));
    return out.value.id;
  };
  const live = (id: string) => {
    const d = k.declarations().find((x) => x.id === id)!;
    return { version: d.version, body: JSON.parse(d.body) as { fields?: { id: string }[]; name?: string; where?: string } };
  };
  const fieldsOf = () => live('register.things').body.fields!.map((f) => f.id);
  const status = (id: string) => sql.one<{ status: string }>('SELECT status FROM suggestion WHERE id = ?', id)!.status;
  const stored = (id: string) => JSON.parse(sql.one<{ body: string }>('SELECT body FROM suggestion WHERE id = ?', id)!.body) as Record<string, unknown>;
  return { sql, k, file, accept, idOf, live, fieldsOf, status, stored };
}

/** Whether `out` is a conflict naming `id` at `version`, and what it was otherwise, for the failure message. */
const conflictOn = (out: Result<unknown>, id: string, version: number): string | null => {
  const c = !out.ok && 'conflict' in out ? (out.conflict as Conflict) : null;
  if (c !== null && c.version === version && c.current?.id === id) return null;
  return out.ok ? 'accepted and installed' : c !== null ? `conflict on ${String(c.current?.id)} at ${c.version}` : `${codeOf(out)}: ${fixOf(out)}`;
};

test('B, AS THE AUDIT RAN IT: a bundle filed under the metric carrying Projects as read at v1 comes back, and domain survives', async () => {
  const { sql, file, accept, idOf, fieldsOf, status, live } = await record();
  assert.ok((await accept(idOf(file('register.things', WITH_DOMAIN, 1)))).ok);
  assert.equal(live('register.things').version, 2);

  /* THE PROPOSER SAYS WHICH READING EACH MEMBER CAME FROM, one entry per declaration, as it says it for a single one. */
  const b = idOf(file('metric.earning', { declarations: [metric('lane is earning', 'Earning (renamed)'), THINGS] }, { 'metric.earning': 1, 'register.things': 1 }));
  const out = await accept(b);
  assert.equal(conflictOn(out, 'register.things', 2), null, `Projects is now ${fieldsOf().join(', ')}`);
  assert.equal(status(b), 'open');
  assert.deepEqual(fieldsOf(), ['name', 'lane', 'domain']);
  assert.equal(live('metric.earning').body.name, 'Earning', 'the metric half of a refused bundle installed');
  sql.close();
});

test('B, FILED BEFORE THE OTHER CHANGE LANDED, with a version for the metric only: Projects is held to the version live at filing', async () => {
  /* THE RACE schema-add B1 CLOSED FOR ONE DECLARATION, OPEN FOR THE REST OF A BUNDLE. This is the audit's own body, from
     `from_version: 1` under the metric, filed while Projects was still v1. The proposer said nothing about Projects, so
     the version live at filing is the one it is held to, as an absent `from_version` is for a single declaration. */
  const { sql, file, accept, idOf, fieldsOf, status, stored } = await record();
  const b = idOf(file('metric.earning', { declarations: [metric('lane is earning', 'Earning (renamed)'), THINGS] }, 1));
  assert.ok((await accept(idOf(file('register.things', WITH_DOMAIN, 1)))).ok);

  const out = await accept(b);
  assert.equal(conflictOn(out, 'register.things', 2), null, `Projects is now ${fieldsOf().join(', ')}`);
  assert.equal(status(b), 'open');
  assert.deepEqual(fieldsOf(), ['name', 'lane', 'domain']);
  assert.deepEqual(stored(b).from_version, { 'metric.earning': 1, 'register.things': 1 });
  sql.close();
});

test('C: a bundle filed under Projects at its live version, carrying the metric as first read, comes back naming the metric', async () => {
  const { sql, file, accept, idOf, live, status } = await record();
  assert.ok((await accept(idOf(file('metric.earning', metric('lane is parked'), 1)))).ok);
  assert.equal(live('metric.earning').version, 2);

  const c = idOf(file('register.things', { declarations: [THINGS, metric('lane is earning')] }, { 'register.things': 1, 'metric.earning': 1 }));
  const out = await accept(c);
  assert.equal(conflictOn(out, 'metric.earning', 2), null, `the metric now reads ${String(live('metric.earning').body.where)}`);
  assert.equal(status(c), 'open');
  assert.equal(live('metric.earning').body.where, 'lane is parked');
  sql.close();
});

test('a bundle whose every member is where it was read is accepted, and installs every member', async () => {
  const { sql, file, accept, idOf, live, fieldsOf } = await record();
  const out = await accept(idOf(file('register.things', { declarations: [WITH_DOMAIN, metric('lane is building')] }, { 'register.things': 1, 'metric.earning': 1 })));
  assert.ok(out.ok, fixOf(out));
  assert.deepEqual(fieldsOf(), ['name', 'lane', 'domain']);
  assert.equal(live('metric.earning').body.where, 'lane is building');
  sql.close();
});

test('and decide hands back every member with its version, for an install that can ask them all where it writes', async () => {
  const { sql, k, file, idOf } = await record();
  const out = k.decide(idOf(file('metric.earning', { declarations: [metric('lane is building'), THINGS] }, 1)), { decide: { option: 'accept', reason: 'yes' } }, 'p_owner');
  assert.ok(out.ok, fixOf(out));
  assert.deepEqual(out.value.expect, { id: 'metric.earning', version: 1 });
  assert.deepEqual(out.value.expects, [{ id: 'metric.earning', version: 1 }, { id: 'register.things', version: 1 }]);
  sql.close();
});

test('EACH MEMBER IS STAMPED AS A SINGLE DECLARATION IS: kept when it has been live, the live one above it or absent', async () => {
  const { sql, file, idOf, stored } = await record();
  const both = { declarations: [THINGS, metric('lane is building')] };
  assert.deepEqual(stored(idOf(file('register.things', both, { 'register.things': 7 }))).from_version, { 'register.things': 1, 'metric.earning': 1 });
  assert.deepEqual(stored(idOf(file('register.things', both, { 'metric.earning': null }))).from_version, { 'register.things': 1, 'metric.earning': 1 });
  assert.deepEqual(stored(idOf(file('register.things', both))).from_version, { 'register.things': 1, 'metric.earning': 1 });
  /* A MEMBER THE RECORD HAS NEVER HELD IS DRAWN FROM NOTHING, which `install`'s check spells 0. */
  const fresh: Declaration = { id: 'metric.building', kind: 'metric', body: { ...(metric('lane is building').body as object), metric: 'building' } as never };
  assert.deepEqual(stored(idOf(file('register.things', { declarations: [THINGS, fresh] }))).from_version, { 'register.things': 1, 'metric.building': 0 });
  sql.close();
});

test('and a map that is not versions of what the bundle installs is refused when it is filed', async () => {
  const { sql, file } = await record();
  const both = { declarations: [THINGS, metric('lane is building')] };
  const wrong: string[] = [];
  for (const given of [{ 'metric.earning': '1' }, { 'metric.earning': -1 }, { 'metric.earning': 1.5 }, { 'register.other': 1 }, [1, 1]]) {
    const out = file('register.things', both, given);
    if (out.ok || codeOf(out) !== 'VALUE_MALFORMED' || (out as { refusal: { at?: string } }).refusal.at !== 'body.from_version')
      wrong.push(`${JSON.stringify(given)}: ${out.ok ? 'filed' : `${codeOf(out)} ${fixOf(out)}`}`);
  }
  /* A MAP FOR ONE DECLARATION IS REFUSED TOO: a single declaration has one version, and a map there is a proposer that
     has misread what it is changing. */
  const single = file('register.things', WITH_DOMAIN, { 'register.things': 1 });
  if (single.ok || codeOf(single) !== 'VALUE_MALFORMED') wrong.push(`a map for one declaration: ${single.ok ? 'filed' : codeOf(single)}`);
  assert.deepEqual(wrong, []);
  assert.equal(sql.all('SELECT 1 FROM suggestion').length, 0);
  sql.close();
});

test('A RACING INSTALL BETWEEN DECIDE AND THE INSTALL IS CAUGHT FOR EVERY MEMBER, in the transaction that writes', async () => {
  /* `decide` asks each member's version when it runs, and `install` awaits hashing before its transaction, so an install
     landing in between slipped past both: only the named member was asked again where the write happens. `install` now
     takes every member's `expect`, and asks them all inside the transaction. */
  const { sql, k, file, idOf, fieldsOf, live } = await record();
  const b = idOf(file('metric.earning', { declarations: [metric('lane is earning', 'Earning (renamed)'), THINGS] }, { 'metric.earning': 1, 'register.things': 1 }));
  const decided = k.decide(b, { decide: { option: 'accept', reason: 'yes' } }, 'p_owner');
  assert.ok(decided.ok, fixOf(decided));
  assert.ok((await k.install([WITH_DOMAIN])).ok, 'the racing install');
  const out = await k.install([decided.value.install as never], decided.value.expects);
  assert.equal(conflictOn(out, 'register.things', 2), null, `Projects is now ${fieldsOf().join(', ')}`);
  assert.deepEqual(fieldsOf(), ['name', 'lane', 'domain']);
  assert.equal(live('metric.earning').body.name, 'Earning', 'the metric half of a refused bundle installed');
  sql.close();
});
