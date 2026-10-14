/**
 * A colleague's own agent key: `createOwnToken`, `ownTokens` and `revokeOwnToken` (USE-A11; `docs/20-COLLABORATION.md`
 * §2, tier 0). His words: "A colleague may mint own agent token", "capped at their level", "revocable by" the owner.
 *
 * THE TOKEN'S CONTEXT IS BUILT AS A HOST BUILDS IT, from `verifyToken` and then `access` at every call (the self-host's
 * `bearerFor`, the Worker's `sessionContext`), so "capped at her level" is measured where it holds: her level is read
 * again on the next call, never kept on the token.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PEOPLE } from '../../../fixtures/names.ts';
import { createRecordApi, type CallContext } from '../src/index.ts';
import { OWN_TOKENS_MOST } from '../src/methods/own-tokens.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 14, 9);
const OWNER_ID = 'p_owner';
const HER_ID = 'p_her';
const HER = PEOPLE[5]!;
const owner: CallContext = { principal: { kind: 'person', id: OWNER_ID, level: 'owner' } };

const NOTES = {
  id: 'register.notes',
  kind: 'register',
  body: { id: 'notes', name: 'Notes', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] },
};

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };
const value = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, JSON.stringify(x));
  return x.value as T;
};

async function record() {
  const api = await createRecordApi({ sql: openSqlite(), clock: fixedClock(NOW) });
  value(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'orchardline', name: 'Orchardline', tz: 'UTC', locale: 'en', owner: { id: OWNER_ID } }));
  value(await api.kernel.install([NOTES] as never));
  /* SHE IS INVITED AT "ADDS ONLY" ON THE WHOLE RECORD, as the owner's invitation screen gives it. */
  value(await api.invite({ person: HER_ID, name: HER.name, level: 'append' }, owner));

  /** Her browser session, at what the record says she holds now. */
  const her = (): CallContext => {
    const held = api.kernel.access(HER_ID) ?? assert.fail('she holds nothing on the record');
    return { principal: { kind: 'person', id: HER_ID, level: held.level }, credentialed: true, provedAt: NOW };
  };
  /** Her agent's call: the bearer checked, then her level read again, as both hosts do at every call. */
  const agent = async (bearer: string): Promise<CallContext | null> => {
    const seen = await api.kernel.verifyToken(bearer, 'mcp');
    if (!seen.ok) return null;
    const held = api.kernel.access(seen.value.person_id);
    if (!held) return null;
    return { principal: { kind: 'token', id: seen.value.id, scope: seen.value.scope, person: seen.value.person_id, level: held.level } };
  };
  const mint = async (name: string) => value<{ id: string; bearer: string }>(await api.createOwnToken({ name, scope: 'write' }, her()));
  return { api, her, agent, mint };
}

test('A PERSON MAKES A KEY OF HER OWN, AND A TOKEN CANNOT MAKE ONE', async () => {
  const { api, her, agent, mint } = await record();
  const made = await mint('Claude on my laptop');
  assert.ok(made.bearer.length > 0, 'no key was handed back');

  const listed = value<{ id: string; person_id: string; label: string | null }[]>(await api.ownTokens({}, her()));
  assert.deepEqual(listed.map((t) => [t.id, t.person_id]), [[made.id, HER_ID]], 'her list is not her one key');

  /* A TOKEN MINTING TOKENS outlives its own revocation, so it is refused whatever its scope. */
  const ctx = (await agent(made.bearer)) ?? assert.fail('her key did not verify');
  const out = (await api.createOwnToken({ name: 'Another' }, ctx)) as Out;
  assert.equal(out.ok, false, 'a token made a key');
  assert.equal(out.refusal?.code, 'NEEDS_BROWSER_SESSION', JSON.stringify(out));
  assert.equal(value<unknown[]>(await api.ownTokens({}, her())).length, 1, 'the refused mint left a key behind');
});

test(`THE ${OWN_TOKENS_MOST + 1 === 21 ? 'TWENTY-FIRST' : 'ONE PAST THE CEILING'} WORKING KEY IS REFUSED, and a revoked one frees its place`, async () => {
  const { api, her, mint } = await record();
  const made: string[] = [];
  for (let i = 0; i < OWN_TOKENS_MOST; i++) made.push((await mint(`Agent ${i + 1}`)).id);

  const over = (await api.createOwnToken({ name: 'One too many' }, her())) as Out;
  assert.equal(over.ok, false, `a key past ${OWN_TOKENS_MOST} was made`);
  assert.equal(over.refusal?.code, 'OUT_OF_BOUNDS', JSON.stringify(over));
  assert.match(over.refusal?.fix ?? '', /Revoke one you no longer use/u);

  value(await api.revokeOwnToken({ id: made[0]! }, her()));
  value(await api.createOwnToken({ name: 'In its place' }, her()));
});

test('HER KEY ADDS AND CANNOT READ, whatever scope it was made with', async () => {
  const { api, agent, mint } = await record();
  const ctx = (await agent((await mint('Filing agent')).bearer)) ?? assert.fail('her key did not verify');

  /* A NEW AGENT ADDS AT THE RUNG IT HAS EARNED (`ladder.ts`), which starts at Ask: the add arrives as a question for
     the owner rather than a row, and either way it is in. Refused would be the failure. */
  const added = value<{ id?: string; asked?: { id: string } }>(await api.create({ register: 'notes', fields: { what: 'Receipt for the train' } }, ctx));
  if (added.asked) value(await api.decide({ id: added.asked.id, decide: { option: 'accept', reason: 'Fine.' } } as never, owner));

  for (const [what, read] of [
    ['a list', () => api.list({ register: 'notes' } as never, ctx)],
    ['the boot', () => api.boot(ctx)],
  ] as const) {
    const out = (await read()) as Out;
    assert.equal(out.ok, false, `her write key read ${what}`);
    assert.equal(out.refusal?.code, 'LEVEL_REQUIRED', `${what}: ${JSON.stringify(out)}`);
  }
  /* AND THE OWNER SEES WHAT SHE ADDED, which she cannot. */
  const page = value<{ rows: { fields: { what?: string } }[] }>(await api.list({ register: 'notes' } as never, owner));
  assert.deepEqual(page.rows.map((r) => r.fields.what), ['Receipt for the train']);
});

test('HER LEVEL LOWERED LOWERS HER KEY AT THE NEXT CALL, with nothing done to the key', async () => {
  const { api, agent, mint } = await record();
  const { bearer } = await mint('Filing agent');
  const before = (await agent(bearer)) ?? assert.fail('her key did not verify');
  value(await api.create({ register: 'notes', fields: { what: 'Before' } }, before));

  /* THE OWNER TAKES HER DOWN TO READS. The key is the same row; only her level changed. */
  value(await api.invite({ person: HER_ID, name: HER.name, level: 'read' }, owner));
  const after = (await agent(bearer)) ?? assert.fail('her key stopped working when her level only changed');
  const out = (await api.create({ register: 'notes', fields: { what: 'After' } }, after)) as Out;
  assert.equal(out.ok, false, 'a write key still added after her level went to read');
  assert.equal(out.refusal?.code, 'LEVEL_REQUIRED', JSON.stringify(out));
  /* AND IT READS NOW, since read is what she holds: the intersection, never the token's scope alone. */
  value(await api.list({ register: 'notes' } as never, after));
});

test("THE OWNER'S REVOKE ENDS HER KEY, at the next call", async () => {
  const { api, agent, mint } = await record();
  const made = await mint('Filing agent');
  assert.ok(await agent(made.bearer), 'her key did not verify before the revoke');

  /* HE SEES IT IN HIS OWN LIST, under her person, and revokes it there. */
  const all = value<{ id: string; person_id: string }[]>(await api.listTokens(owner));
  assert.ok(all.some((t) => t.id === made.id && t.person_id === HER_ID), "her key is not in the owner's list");
  value(await api.revokeToken({ id: made.id }, owner));
  assert.equal(await agent(made.bearer), null, "her key still works after the owner's revoke");
});

test('HER OWN REVOKE ENDS HER KEY, and she cannot revoke one that is not hers', async () => {
  const { api, her, agent, mint } = await record();
  const made = await mint('Filing agent');
  value(await api.revokeOwnToken({ id: made.id }, her()));
  assert.equal(await agent(made.bearer), null, 'her key still works after her own revoke');

  const his = value<{ id: string }>(await api.kernel.createToken(OWNER_ID, { scope: 'read', label: 'Owner agent' }));
  const out = (await api.revokeOwnToken({ id: his.id }, her())) as Out;
  assert.equal(out.ok, false, "she revoked the owner's key");
  assert.equal(out.refusal?.code, 'OUT_OF_BOUNDS', JSON.stringify(out));
});
