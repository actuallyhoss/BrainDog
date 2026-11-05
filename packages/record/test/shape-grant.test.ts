/**
 * The shape copy's record half: an owner's shape grant takes a copy again and again, every other bearer is
 * refused before a row is read, and the copy holds the record's shape and none of its words.
 *
 * THE METHOD FILE OVER A REAL RECORD. `methods/shape.ts` is read on its own, handed the record's kernel and clock, so
 * this holds whether or not `methods/index.ts` has spread it in yet; the grant is asked for, approved and exchanged
 * through the record's own device methods, as the CLI does it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isShape } from '@braindog/kernel';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { methods } from '../src/methods/shape.ts';
import { openSqlite } from '../../kernel/test/sqlite.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const ADDRESS = '203.0.113.7';

/** Words only this record holds. None of them may be in a shape copy. */
const HIS = ['Quillfeather', 'Marrowgate', 'Brindlecombe', 'Ostrakova', 'Vellichor'];

const decl = (id: string, body: Record<string, unknown>) => ({ id: `register.${id}`, kind: 'register', body: { id, ...body } }) as never;

async function record() {
  let now = Date.UTC(2026, 9, 9, 12);
  const api = await createRecordApi({ sql: openSqlite(), clock: { now: () => now } });
  const made = await api.createRecord({ id: REC, slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_owner', email: 'ada@example.com', name: 'Ada' } });
  assert.ok(made.ok, JSON.stringify(made));
  const owner: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' }, credentialed: true, provedAt: now };

  const put = await api.kernel.install([
    decl('clients', { name: 'Clients', title: 'name', fields: [{ id: 'name', type: 'text', required: true }, { id: 'note', type: 'text' }] }),
  ]);
  assert.ok(put.ok, JSON.stringify(put));
  for (const [i, word] of HIS.entries()) {
    const row = await api.create({ register: 'clients', fields: { name: `${word} Holdings`, note: `Met ${word} at the fair, ${i + 3} jars` } }, owner);
    assert.ok(row.ok, JSON.stringify(row));
  }

  /** A device grant of one reach, asked for, approved by the owner and exchanged: the bearer a machine holds. */
  const grant = async (reach: string, scope?: string): Promise<string> => {
    const started = await api.deviceStart({ reach, label: `studio mac · ${reach}`, ...(scope === undefined ? {} : { scope }) }, ADDRESS);
    if (!started.ok) return assert.fail(JSON.stringify(started));
    const looked = await api.deviceLook({ user_code: started.value.user_code }, { ...owner, provedAt: now });
    if (!looked.ok) return assert.fail(JSON.stringify(looked));
    const approved = await api.deviceApprove({ user_code: started.value.user_code, handle: looked.value.handle }, { ...owner, provedAt: now });
    assert.ok(approved.ok, JSON.stringify(approved));
    const polled = await api.devicePoll({ device_code: started.value.device_code });
    if (!polled.ok || polled.value.pending) return assert.fail(JSON.stringify(polled));
    return polled.value.bearer;
  };

  const shape = methods({ kernel: api.kernel, clock: { now: () => now } });
  return { api, owner, grant, shape, advance: (ms: number) => void (now += ms) };
}

test("AN OWNER'S SHAPE GRANT TAKES A COPY, AGAIN AND AGAIN, and the copy is marked as a shape", async () => {
  const r = await record();
  const bearer = await r.grant('shape');

  const who = await r.shape.shapeGrant(bearer);
  assert.ok(who.ok, JSON.stringify(who));
  assert.equal(who.value.person, 'p_owner');

  for (const day of [0, 1]) {
    r.advance(day * 86_400_000);
    const copy = await r.shape.shapeExport(bearer);
    if (!copy.ok) return assert.fail(JSON.stringify(copy));
    assert.ok(isShape(copy.value), 'the copy does not say it is a shape');
    assert.ok(copy.value.length > 20, `a shape copy of ${copy.value.length} lines is not a record`);
  }
});

test('ANY OTHER KEY IS REFUSED, in one sentence, before a row is read', async () => {
  const r = await record();
  const login = await r.grant('login');
  const keychain = await r.grant('vault', '*');
  const token = await r.api.createToken({ scope: 'write', label: 'an agent' }, r.owner);
  if (!token.ok) return assert.fail(JSON.stringify(token));
  const shaped = await r.grant('shape');
  const otherRecord = `rec_01JZ8QK3F7R2M9V4XN6TCB5HAE${shaped.slice(shaped.indexOf('.'))}`;

  for (const [what, bearer] of Object.entries({ login, keychain, token: (token.value as { bearer: string }).bearer, otherRecord, nothing: '', junk: 'not-a-bearer' })) {
    const out = await r.shape.shapeExport(bearer);
    assert.equal(out.ok, false, `a ${what} bearer took a shape copy`);
    const refusal = 'refusal' in out ? out.refusal : null;
    assert.equal(refusal?.code, 'FORBIDDEN', what);
    assert.equal(refusal?.fix, 'That shape grant is not known here.', what);
  }

  /* AND A REVOKED ONE, by its handle, as Settings revokes it. */
  const handle = (await r.shape.shapeGrant(shaped)) as { ok: true; value: { handle: string } };
  const gone = await r.api.revokeDevice({ handle: handle.value.handle }, r.owner);
  assert.ok(gone.ok, JSON.stringify(gone));
  assert.equal((await r.shape.shapeExport(shaped)).ok, false, 'a revoked shape grant still took a copy');
});

test('THE LINES HOLD NO VALUE: no word the record holds, its name, its owner or its address', async () => {
  const r = await record();
  const copy = await r.shape.shapeExport(await r.grant('shape'));
  if (!copy.ok) return assert.fail(JSON.stringify(copy));
  const text = copy.value.join('\n').toLowerCase();

  /* THE CHECK SEES THEM WHEN THEY ARE THERE: the plain export holds every one, so a pass below is not a blind one. */
  const full = await r.api.export({}, r.owner);
  if (!full.ok) return assert.fail(JSON.stringify(full));
  const held = (full.value as string[]).join('\n').toLowerCase();

  for (const word of [...HIS, 'Holdings', 'Met ', 'ada@example.com', 'The Studio', 'the-studio']) {
    assert.ok(held.includes(word.toLowerCase()), `the plain export does not hold ${word}, so the check below proves nothing`);
    assert.ok(!text.includes(word.toLowerCase()), `the shape copy holds ${word}`);
  }
});
