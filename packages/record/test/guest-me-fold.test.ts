/**
 * A guest's row is the guest's: joining under another person's name and a look-alike address never folds it into
 * theirs, so the guest's sign-in key, and `$me` in their share with it, stays on their own row.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { shareMeOf } from '@braindog/kernel';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { testSigner } from '../../kernel/test/signer.ts';

const NOW = Date.UTC(2026, 9, 20, 12);
const UNTIL = new Date(Date.UTC(2026, 11, 1, 12)).toISOString();

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const PACK = {
  pack: 'contacts-pack',
  version: '1.0.0',
  summary: 'Contacts.',
  author: 'BrainDog',
  license: 'MIT',
  requires: { format: 1, primitives: 1, packs: {} },
  declarations: [
    {
      register: 'contacts',
      name: 'Contacts',
      title: 'full_name',
      meets: { name: 'full_name', email: 'mail', handles: 'accounts', met: 'seen', merged_into: 'folded_into', self: 'me' },
      fields: [
        { id: 'full_name', type: 'text', required: true },
        { id: 'mail', type: 'email', unique: true, index: true },
        { id: 'accounts', type: 'list', of: 'text' },
        { id: 'seen', type: 'list', of: 'text' },
        { id: 'folded_into', type: 'ref', to: 'contacts' },
        { id: 'me', type: 'bool' },
      ],
    },
    {
      register: 'jobs',
      name: 'Jobs',
      title: 'what',
      fields: [
        { id: 'what', type: 'text', required: true },
        { id: 'assignee', type: 'ref', to: 'contacts' },
      ],
    },
  ],
};

const OWNER = 'p_lead';
const owner: CallContext = { principal: { kind: 'person', id: OWNER, level: 'owner' }, credentialed: true, provedAt: NOW } as CallContext;

async function setup(guestName: string, guestEmail: string) {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW), sign: testSigner(), invitations: () => null });
  value(api.kernel.createRecord({ id: 'rec_01JABCDEFGHJKMNPQRSTVWXYZ0', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: OWNER, email: 'lead@studio.example', name: 'Lea Lead' } }));
  const planned = value<{ diff: { planHash: string } }>(await api.planPack({ doc: PACK, source: { kind: 'local' } } as never, owner));
  value(await api.installPack({ doc: PACK, source: { kind: 'local' }, planHash: planned.diff.planHash, approve: [] } as never, owner));

  /* THE VICTIM: a contact the owner typed, with a task assigned to them. */
  const sam = value<{ id: string }>(await api.create({ register: 'contacts', fields: { full_name: 'Sam Rivera', mail: 'sam.rivera@acme.example' } }, owner));
  value(await api.create({ register: 'jobs', fields: { what: 'VICTIM-ONLY: payroll export', assignee: sam.id } }, owner));

  /* THE GUEST: shared "jobs where assignee is $me", invited by their own address, joined under the name they gave. */
  value(await api.share({ share: { who: { kind: 'email', id: guestEmail }, what: { list: 'jobs', where: { field: 'assignee', is: '$me' } }, can: 'view', when: { until: UNTIL } } }, owner));
  const { token } = value<{ token: string }>(await api.invite({ email: guestEmail }, owner));
  value(await api.acceptInvite({ token, person: { id: 'p_guest', email: guestEmail, name: guestName } }));
  return { api, sql, sam: sam.id };
}

test('A GUEST JOINING UNDER ANOTHER PERSON\'S NAME KEEPS THEIR OWN ROW, and `$me` is never that person', async () => {
  const { api, sql, sam } = await setup('Sam Rivera', 'samrivera@guest.example');
  const me = shareMeOf(sql as never, 'p_guest', 'contacts');
  assert.ok(me.length > 0, 'the guest was met as nobody, so this proves nothing');
  assert.ok(!me.includes(sam), 'the guest was folded into the person they named themselves after');
  assert.equal(sql.one<{ deleted_at: string | null }>('SELECT deleted_at FROM entry WHERE id = ?', sam)?.deleted_at, null);
  /* AND SO THE GUEST'S SHARE READS NONE OF SAM'S JOBS, which is what the fold would have handed over. */
  const held = api.kernel.access('p_guest')!;
  const guest = { principal: { kind: 'person', id: 'p_guest', level: held.level }, registers: held.registers ?? '*', levels: held.levels, wheres: held.wheres } as CallContext;
  const jobs = await api.list({ register: 'jobs' }, guest);
  assert.doesNotMatch(JSON.stringify(jobs), /VICTIM-ONLY/u, "the guest read the rows of the person they named themselves after");
  sql.close();
});
