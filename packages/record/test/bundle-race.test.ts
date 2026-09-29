/**
 * A bundle an owner accepts lands against every member's version in the transaction that installs it (the hole
 * `packages/kernel/test/govern-bundle-version.test.ts` left open at the record).
 *
 * `decide` asks each member's version when it runs, and `land` then awaits `kernel.install`, which hashes before it
 * opens its transaction. The record passed only the named member's `expect`, so an install landing in that gap
 * replaced Projects under a bundle that carried it as read at v1, and `domain` went with the decision reading "accept".
 * The race is made deterministic here by running the other install at the moment `land` calls `install`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 22, 12);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

const FIELDS = [
  { id: 'name', type: 'text', required: true },
  { id: 'lane', type: 'enum', values: ['building', 'earning', 'parked'], required: true },
];
const THINGS = { id: 'register.things', kind: 'register' as const, body: { id: 'things', name: 'Projects', title: 'name', fields: FIELDS } as never };
const WITH_DOMAIN = { ...THINGS, body: { ...(THINGS.body as object), fields: [...FIELDS, { id: 'domain', type: 'url' }] } as never };
const metric = (name: string) => ({
  id: 'metric.earning',
  kind: 'metric' as const,
  body: { metric: 'earning', name, source: 'register.things', value: { count: 'id' }, format: 'int', target: { gte: 0 }, window: '30d', where: 'lane is earning' } as never,
});

type Out = { ok: boolean; value?: { id?: string }; refusal?: { fix: string }; conflict?: { version: number; current: { id?: string } | null } };

test('AN INSTALL THAT RACES AN ACCEPTED BUNDLE TO THE TRANSACTION TURNS IT BACK on the member it changed, and the question reopens', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  assert.ok((await api.kernel.install([THINGS, metric('Earning')])).ok);
  const filed = (await api.propose(
    {
      question: 'Rename the metric?',
      body_kind: 'change',
      body: { declaration_id: 'metric.earning', to: { declarations: [metric('Earning (renamed)'), THINGS] }, from_version: { 'metric.earning': 1, 'register.things': 1 } },
    } as never,
    owner,
  )) as Out;
  assert.ok(filed.ok, JSON.stringify(filed));

  /* THE RACE: somebody else's install lands after `decide` has checked every member and before `land` writes. */
  const install = api.kernel.install;
  api.kernel.install = async (...args: Parameters<typeof install>) => {
    api.kernel.install = install;
    assert.ok((await install([WITH_DOMAIN])).ok, 'the racing install');
    return install(...args);
  };
  const out = (await api.decide({ id: filed.value!.id!, decide: { option: 'accept', reason: 'yes' } }, owner)) as Out;
  assert.equal(api.kernel.install, install, 'land never called install, so this raced nothing');

  const live = (id: string) => JSON.parse(api.kernel.declarations().find((d) => d.id === id)!.body) as { fields?: { id: string }[]; name?: string };
  assert.deepEqual(live('register.things').fields!.map((f) => f.id), ['name', 'lane', 'domain'], JSON.stringify(out));
  assert.equal(live('metric.earning').name, 'Earning', 'the metric half of a refused bundle installed');
  assert.equal(sql.one<{ status: string }>('SELECT status FROM suggestion WHERE id = ?', filed.value!.id!)!.status, 'open');
  /* AND IT SAYS WHICH MEMBER MOVED: the sentence was built from the bundle's own id, which a bundle does not have, and read
     "undefined changed after this was proposed". */
  assert.match(JSON.stringify(sql.all('SELECT * FROM event ORDER BY rowid DESC LIMIT 1')), /register.things changed after this was proposed and is at version 2/);
  sql.close();
});
