/**
 * A colleague who joins is a person on the record: accepting an invitation meets them by the address the host
 * verified, into the list that plays `meets`.
 *
 * WHAT MUST HOLD. A join makes one entry under the name they gave, with their address, and it is not marked as the
 * owner's own; an address somebody already holds is matched and makes none; with the list switched off nobody is
 * written and they are a member all the same; the same address joining again makes no second entry; and a join by a
 * shared inbox's address writes no organisation.
 *
 * NOTHING HERE IS STUBBED: a real record, a real invitation, spent the way a host's `/auth/invite` spends it
 * (`acceptInvite` with the person it has just signed in).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Entry } from '@braindog/kernel';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { testSigner } from '../../kernel/test/signer.ts';

const NOW = Date.UTC(2026, 9, 14, 9);

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

/** The list that plays `meets`, under its own field names, with the owner's mark, in a pack so it can be switched off. */
const CONTACTS = {
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
      register: 'firms',
      name: 'Firms',
      title: 'name',
      org: { name: 'name', keys: 'keys', domain: 'domain', merged_into: 'merged_into' },
      fields: [
        { id: 'name', type: 'text', required: true },
        { id: 'keys', type: 'list', of: 'text' },
        { id: 'domain', type: 'text' },
        { id: 'merged_into', type: 'ref', to: 'firms' },
      ],
    },
  ],
};

const OWNER = 'p_lead';
const owner: CallContext = { principal: { kind: 'person', id: OWNER, level: 'owner' } };

async function record() {
  const api = await createRecordApi({ sql: openSqlite(), clock: fixedClock(NOW), sign: testSigner(), invitations: () => null });
  value(api.kernel.createRecord({ id: 'rec_01JABCDEFGHJKMNPQRSTVWXYZ0', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: OWNER, email: 'lead@studio.example' } }));
  const planned = value<{ diff: { planHash: string } }>(await api.planPack({ doc: CONTACTS, source: { kind: 'local' } } as never, owner));
  value(await api.installPack({ doc: CONTACTS, source: { kind: 'local' }, planHash: planned.diff.planHash, approve: [] } as never, owner));
  return api;
}

type Api = Awaited<ReturnType<typeof record>>;

/** Invited by the owner and joined as a host's `/auth/invite` joins them. */
async function join(api: Api, person: { id: string; email: string; name?: string }) {
  const minted = value<{ token: string }>(await api.invite({ email: person.email, level: 'write' }, owner));
  return api.acceptInvite({ token: minted.token, person });
}

const held = (api: Api): Entry[] => value<{ rows: Entry[] }>(api.kernel.list({ register: 'contacts', limit: 500 })).rows;

test('A JOIN MAKES ONE ENTRY, under the name they gave, with their address, and not marked as the owner', async () => {
  const api = await record();
  assert.equal(held(api).length, 0);
  value(await join(api, { id: 'p_dana', email: 'dana@studio.example', name: 'Dana Kovac' }));
  const rows = held(api);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.fields.full_name, 'Dana Kovac');
  assert.equal(rows[0]!.fields.mail, 'dana@studio.example');
  assert.notEqual(rows[0]!.fields.me, true, 'joining marked them as the owner of the record');
  assert.ok(api.kernel.members().some((m) => m.person_id === 'p_dana'));
});

test('AN ADDRESS SOMEBODY ALREADY HOLDS IS MATCHED, and the join makes nobody', async () => {
  const api = await record();
  const typed = value<Entry>(await api.create({ register: 'contacts', fields: { full_name: 'Dana K', mail: 'dana@studio.example' } }, owner));
  value(await join(api, { id: 'p_dana', email: 'Dana@Studio.example', name: 'Dana Kovac' }));
  const rows = held(api);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.id, typed.id);
  assert.notEqual(rows[0]!.fields.me, true);
});

test('WITH THE LIST SWITCHED OFF NOBODY IS WRITTEN, and they are a member all the same', async () => {
  const api = await record();
  value(await api.disablePack({ id: 'contacts-pack' }, owner));
  assert.equal(api.kernel.meetsList(), null);
  value(await join(api, { id: 'p_dana', email: 'dana@studio.example', name: 'Dana Kovac' }));
  assert.ok(api.kernel.members().some((m) => m.person_id === 'p_dana'));
  value(await api.enablePack({ id: 'contacts-pack' }, owner));
  assert.equal(held(api).length, 0, 'somebody was put into a list its owner had switched off');
});

test('THE SAME ADDRESS JOINING AGAIN MAKES NO SECOND ENTRY', async () => {
  const api = await record();
  value(await join(api, { id: 'p_dana', email: 'dana@studio.example', name: 'Dana Kovac' }));
  /* STILL A MEMBER: nobody on the record is invited twice, so there is no second link to spend. */
  assert.equal((await api.invite({ email: 'dana@studio.example', level: 'write' }, owner)).ok, false);
  /* TAKEN OFF AND INVITED BACK: joined again, and found by the address. */
  value(await api.removeMember({ person: 'p_dana' }, owner));
  value(await join(api, { id: 'p_dana', email: 'dana@studio.example', name: 'Dana' }));
  assert.equal(held(api).length, 1);
});

test("A JOIN BY A SHARED INBOX'S ADDRESS WRITES NO ORGANISATION, and they are a member all the same", async () => {
  const api = await record();
  value(await join(api, { id: 'p_dana', email: 'office@studio.example', name: 'Dana Kovac' }));
  assert.ok(api.kernel.members().some((m) => m.person_id === 'p_dana'));
  assert.equal(value<{ rows: Entry[] }>(api.kernel.list({ register: 'firms', limit: 500 })).rows.length, 0, 'a colleague was filed as an organisation');
  assert.equal(held(api).length, 0);
});
