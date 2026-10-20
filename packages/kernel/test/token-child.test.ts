/**
 * Child keys (sharing plan 2.9): a short key minted under a working one, never more than its parent, dead with it.
 *
 * The parent is proved by its bearer. A child keeps its parent's person, holds at most its scope and life, ANDs its
 * narrowing onto the parent's, has no children, is not an agent the plan counts, lists under its parent, and is let
 * go by the sweep once its time is up. Invented names only.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf, type Result } from '@braindog/ports';

import { access } from '../src/members.ts';
import { applyMigrations } from '../src/migrate.ts';
import {
  AGENTS_KEY,
  createToken,
  liveAgents,
  listTokens,
  mintChild,
  pruneChildren,
  revokeToken,
  verifyToken,
  SCOPES,
  type Scope,
  type TokenDeps,
} from '../src/token.ts';
import type { Narrow } from '../src/lens.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 20, 12);
const MINUTE = 60_000;
const DAY = 86_400_000;
const OWNER = 'p_owner';
const RECORD = 'rec_fake';

const sha256 = async (text: string): Promise<string> =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map((b) => b.toString(16).padStart(2, '0')).join('');

async function setup() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  await applyMigrations(sql, clock);
  sql.exec("INSERT INTO person (id, email, name) VALUES (?, 'ada@example.com', 'Ada')", OWNER);
  sql.exec("INSERT INTO member (person_id, register, level) VALUES (?, '*', 'owner')", OWNER);
  let n = 0;
  let at = NOW;
  const deps = (validFrom?: string): TokenDeps => ({
    sql,
    nowMs: at,
    mint: () => `m_${String(++n).padStart(6, '0')}`,
    recordId: () => RECORD,
    digest: sha256,
    random: (size: number) => crypto.getRandomValues(new Uint8Array(size)),
    ...(validFrom === undefined ? {} : { validFrom }),
  });
  const later = (ms: number) => {
    at += ms;
  };
  return { sql, deps, later };
}

const value = <T>(r: Result<T>): T => {
  assert.ok(r.ok, fixOf(r));
  return r.value;
};

const refusal = <T>(r: Result<T>): { code: string; at?: string } => {
  assert.equal(r.ok, false, 'expected a refusal');
  return (r as { refusal: { code: string; at?: string } }).refusal;
};

test('A CHILD IS REFUSED ON ITS NEXT CALL ONCE ITS PARENT IS REVOKED, and the revoke takes every child with it', async () => {
  const { deps } = await setup();
  const parent = value(await createToken(deps(), OWNER, { scope: 'write', label: 'Invented app', days: 365 }));
  const a = value(await mintChild(deps(), parent.bearer, { minutes: 60 }));
  const b = value(await mintChild(deps(), parent.bearer, { minutes: 60 }));
  assert.equal(value(await verifyToken(deps(), a.bearer)).person_id, OWNER);

  revokeToken(deps(), OWNER, parent.id);
  assert.equal(refusal(await verifyToken(deps(), a.bearer)).code, 'FORBIDDEN');
  assert.equal(refusal(await verifyToken(deps(), b.bearer)).code, 'FORBIDDEN');
  assert.equal(refusal(await mintChild(deps(), parent.bearer, { minutes: 60 })).at, 'parent', 'a revoked parent minted a child');
  const listed = listTokens(deps().sql).find((t) => t.id === parent.id)!;
  assert.ok(listed.children!.every((c) => c.revoked_at !== null), 'a child of a revoked parent is listed as working');
});

test('A CHILD STOPS WITH ITS PARENT’S END, ITS PERSON’S SUSPENSION, AND THE OPERATOR’S CUT-OFF', async () => {
  const { sql, deps, later } = await setup();
  /* A parent with a day left: the child asked for an hour gets it, and stops when the parent does. */
  const short = value(await createToken(deps(), OWNER, { scope: 'read', days: 1 }));
  later(DAY - 30 * MINUTE);
  const child = value(await mintChild(deps(), short.bearer, { minutes: 60 }));
  assert.equal(child.expires_at, short.expires_at, 'a child outlived its parent');
  later(31 * MINUTE);
  assert.equal(refusal(await verifyToken(deps(), child.bearer)).code, 'FORBIDDEN');

  const parent = value(await createToken(deps(), OWNER, { scope: 'write', days: 90 }));
  const kid = value(await mintChild(deps(), parent.bearer, { minutes: 30 }));
  sql.exec('UPDATE person SET suspended_at = ? WHERE id = ?', new Date(NOW).toISOString(), OWNER);
  assert.equal(refusal(await verifyToken(deps(), kid.bearer)).code, 'FORBIDDEN', "a suspended person's child still worked");
  sql.exec('UPDATE person SET suspended_at = NULL WHERE id = ?', OWNER);
  assert.ok((await verifyToken(deps(), kid.bearer)).ok);

  /* The cut-off ends a parent made before it, and so its child made after it. */
  const made = Date.parse(kid.expires_at) - 30 * MINUTE;
  later(MINUTE);
  const after = value(await mintChild(deps(), parent.bearer, { minutes: 30 }));
  const cut = new Date(made + 30_000).toISOString();
  assert.ok((await verifyToken(deps(), after.bearer)).ok);
  assert.equal(refusal(await verifyToken(deps(cut), after.bearer)).code, 'FORBIDDEN', 'a child outlived the cut-off that ended its parent');
});

test("A CHILD'S SCOPE AND LIFE STAY WITHIN ITS PARENT'S, and it is the same person's, one deep", async () => {
  const { deps } = await setup();
  const parent = value(await createToken(deps(), OWNER, { scope: 'propose', days: 90, reach: ['inbox'] }));
  const same = value(await mintChild(deps(), parent.bearer, { minutes: 60 }));
  assert.equal(same.scope, 'propose');
  assert.deepEqual(same.reach, ['inbox'], "a child lost its parent's reach");
  assert.equal(Date.parse(same.expires_at), NOW + 60 * MINUTE, 'an hour is asked and an hour is given');
  assert.equal(value(await mintChild(deps(), parent.bearer, { minutes: 5, scope: 'read' })).scope, 'read');

  assert.equal(refusal(await mintChild(deps(), parent.bearer, { minutes: 60, scope: 'write' })).at, 'scope', 'a child rose above its parent');
  assert.equal(refusal(await mintChild(deps(), parent.bearer, { minutes: 61 })).at, 'minutes', 'a child lived past an hour');
  assert.equal(refusal(await mintChild(deps(), parent.bearer, { minutes: 0 })).at, 'minutes');
  assert.equal(refusal(await mintChild(deps(), same.bearer, { minutes: 10 })).at, 'parent', 'a child had a child');
  assert.equal(refusal(await mintChild(deps(), `${RECORD}.not-a-secret`, { minutes: 10 })).at, 'parent');

  /* Every scope a parent can hold, every scope asked: the child never holds more. */
  for (const held of SCOPES) {
    const p = value(await createToken(deps(), OWNER, { scope: held, days: 30 }));
    for (const asked of SCOPES) {
      const out = await mintChild(deps(), p.bearer, { minutes: 15, scope: asked as Scope });
      const ok = SCOPES.indexOf(asked) <= SCOPES.indexOf(held);
      assert.equal(out.ok, ok, `${held} parent, ${asked} child`);
      if (out.ok) {
        const seen = value(await verifyToken(deps(), out.value.bearer));
        assert.equal(seen.scope, asked);
        assert.equal(seen.person_id, OWNER);
        assert.ok(SCOPES.indexOf(seen.scope) <= SCOPES.indexOf(held));
      }
    }
  }
});

test("A CHILD IS ITS PARENT'S AGENT WHEN IT HOLDS ITS SCOPE, and an agent of its own when it holds less", async () => {
  const { deps } = await setup();
  const parent = value(await createToken(deps(), OWNER, { scope: 'write', days: 90 }));
  const same = value(await mintChild(deps(), parent.bearer, { minutes: 60 }));
  const seen = value(await verifyToken(deps(), same.bearer, 'mcp'));
  assert.equal(seen.id, parent.id, 'an hourly key became a new agent');
  assert.deepEqual(seen.child, { id: same.id, parent: parent.id });
  const listed = listTokens(deps().sql).find((t) => t.id === parent.id)!;
  assert.equal(listed.last_surface, 'mcp', "a child's use did not reach its parent's row");

  const lower = value(await mintChild(deps(), parent.bearer, { minutes: 60, scope: 'read' }));
  assert.equal(value(await verifyToken(deps(), lower.bearer)).id, lower.id);
  assert.equal(value(await verifyToken(deps(), parent.bearer)).child, undefined);
});

test("P9: A KEY'S NARROWING ONLY TAKES AWAY, its child's is ANDed onto its parent's, and access carries the chain", async () => {
  const { sql, deps } = await setup();
  const kiln: Narrow = { project: 'e_kiln' };
  const tasks: Narrow = { lists: ['tasks'] };
  const parent = value(await createToken(deps(), OWNER, { scope: 'write', days: 90, narrow: kiln }));
  assert.deepEqual(value(await verifyToken(deps(), parent.bearer)).narrows, [kiln]);
  assert.deepEqual(listTokens(sql).find((t) => t.id === parent.id)!.narrow, kiln);

  const child = value(await mintChild(deps(), parent.bearer, { minutes: 60, narrow: tasks }));
  const seen = value(await verifyToken(deps(), child.bearer));
  assert.deepEqual(seen.narrows, [kiln, tasks], "the child's narrowing replaced its parent's instead of joining it");
  assert.deepEqual(value(await verifyToken(deps(), value(await mintChild(deps(), parent.bearer, { minutes: 5 })).bearer)).narrows, [kiln]);

  /* The chain rides on the person's own access, which is never widened by it: the person's levels come back as they are. */
  const person = access(sql, OWNER)!;
  const agent = access(sql, OWNER, seen.narrows)!;
  assert.deepEqual({ ...agent, narrows: undefined }, { ...person, narrows: undefined });
  assert.deepEqual(agent.narrows, [kiln, tasks]);

  /* Random well-formed narrows: a key never verifies with fewer links than it was minted with. */
  const shapes: Narrow[] = [{ record: true }, { lists: ['a', 'b'] }, { lists: { has: 'money' } }, { project: 'e_x', lists: ['tasks'] }, { list: 'tasks', rows: ['e_1'] }, { share: 'sh_1' }];
  for (let i = 0; i < 24; i++) {
    const pn = shapes[i % shapes.length]!;
    const cn = shapes[(i * 5 + 1) % shapes.length]!;
    const p = value(await createToken(deps(), OWNER, { scope: 'read', days: 2, narrow: pn }));
    const c = value(await mintChild(deps(), p.bearer, { minutes: 1 + (i % 60), narrow: cn }));
    assert.deepEqual(value(await verifyToken(deps(), c.bearer)).narrows, [pn, cn]);
  }

  assert.equal(refusal(await createToken(deps(), OWNER, { scope: 'read', narrow: { lists: [] } as never })).at, 'narrow');
  assert.equal(refusal(await mintChild(deps(), parent.bearer, { minutes: 5, narrow: { nothing: true } as never })).at, 'narrow');
  /* A narrowing that cannot be read opens nothing. */
  sql.exec("UPDATE token_lens SET narrow = '{\"lists\":[]}' WHERE token_id = ?", parent.id);
  assert.equal(refusal(await verifyToken(deps(), parent.bearer)).code, 'FORBIDDEN');
  assert.equal(refusal(await verifyToken(deps(), child.bearer)).code, 'FORBIDDEN');
});

test('CHILDREN ARE NOT AGENTS THE PLAN COUNTS, list under their parent, and are pruned once their time is up', async () => {
  const { sql, deps, later } = await setup();
  sql.exec('CREATE TABLE IF NOT EXISTS host_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  sql.exec('INSERT INTO host_meta (key, value) VALUES (?, ?)', AGENTS_KEY, JSON.stringify({ agents: 1, plan: 'Free', next: 'Cloud' }));
  const parent = value(await createToken(deps(), OWNER, { scope: 'write', label: 'Invented app', days: 365 }));
  for (let i = 0; i < 3; i++) value(await mintChild(deps(), parent.bearer, { minutes: 60 }));
  assert.equal(liveAgents(deps()), 1, 'a child counted as an agent');

  const rows = listTokens(sql);
  assert.equal(rows.length, 1, 'a child was listed as a key of its own');
  assert.equal(rows[0]!.children!.length, 3);
  assert.ok(rows[0]!.children!.every((c) => c.label === 'Invented app' && c.person_id === OWNER));

  later(30 * MINUTE);
  const fresh = value(await mintChild(deps(), parent.bearer, { minutes: 60 }));
  later(31 * MINUTE);
  assert.equal(pruneChildren(sql, NOW + 61 * MINUTE), 3);
  assert.equal(sql.all('SELECT token_id FROM token_lens WHERE parent_id IS NOT NULL').length, 1);
  assert.deepEqual(listTokens(sql)[0]!.children!.map((c) => c.id), [fresh.id]);
  assert.ok((await verifyToken(deps(), fresh.bearer)).ok);
  assert.ok((await verifyToken(deps(), parent.bearer)).ok, 'the prune took the parent');
});
