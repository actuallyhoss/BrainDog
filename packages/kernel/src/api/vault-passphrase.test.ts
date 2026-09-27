/**
 * The vault passphrase, the kernel's half (`api/vault-passphrase.ts` over `vault.ts`; `loop/finish/platform.md` §4.0 V).
 *
 * THE HOST'S STEP IS A STAND-IN HERE, because the kernel never holds a key and a kernel test cannot import a host: it
 * hands back bytes of the right shape, or the refusal a host would give. What is proved is the record's half: exactly
 * one wrapping of the record key before and after, the other two keys untouched, one `grant.rotate` on
 * `vault_key:record` for each change, and a wrong passphrase counted before it is compared, with the vault waiting once
 * `PASSPHRASE_TRIES` have been spent, and a change made against a wrapping since replaced answered as a conflict. The crypto is `packages/host/src/passphrase.ts`'s, and the extension is called
 * straight from its file, so this holds whether or not it has been registered in `api/index.ts` yet.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Result } from '@braindog/ports';
import { no, ok } from '@braindog/ports';

import { openRecord } from '../index.ts';
import type { KernelParts } from '../parts.ts';
import { PASSPHRASE_SALT_BYTES, PASSPHRASE_TRIES, PASSPHRASE_WAIT_MS, type RecordWrapping, type WrappingChange } from '../vault.ts';
import { fixedClock, openSqlite } from '../../test/sqlite.ts';
import { testSigner } from '../../test/signer.ts';
import { extension } from './vault-passphrase.ts';

const NOW = Date.UTC(2026, 8, 26, 12);
const ID = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const ROOT = 'a1a1a1a1a1a1a1a1a1';
const bytes = (n: number, fill: number): Uint8Array => new Uint8Array(n).fill(fill);

type Row = { purpose: string; wrapped: Uint8Array; wrapped_by: string; kek_id: string | null; salt: Uint8Array | null };

async function vault() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock, { sign: testSigner() });
  const made = k.createRecord({
    id: ID,
    slug: 'the-studio',
    name: 'The Studio',
    tz: 'UTC',
    locale: 'en',
    owner: { id: 'p_1', name: 'Ada' },
    keys: {
      record: { wrapped: bytes(48, 1), nonce: bytes(12, 2), kek_id: ROOT },
      connector: { wrapped: bytes(48, 3), nonce: bytes(12, 4), kek_id: ROOT },
      signing: { wrapped: bytes(64, 5), nonce: bytes(12, 6), kek_id: ROOT },
    },
  });
  assert.ok(made.ok, 'the record was not made');
  let minted = 0;
  const parts = {
    sql,
    clock,
    mint: () => `01JZ8QK3F7R2M9V4XN6TC${String(++minted).padStart(5, '0')}`,
    transaction: <T>(fn: () => T): T => fn(),
  } as unknown as KernelParts;
  const rows = () =>
    new Map(
      sql
        .all<Row>('SELECT purpose, wrapped, wrapped_by, kek_id, salt FROM vault_key ORDER BY purpose')
        .map((r) => [r.purpose, { ...r, wrapped: new Uint8Array(r.wrapped), salt: r.salt === null ? null : new Uint8Array(r.salt) }]),
    );
  const rotations = () =>
    sql
      .all<{ actor: string; field: string; from_v: string; to_v: string }>(
        "SELECT actor, field, from_v, to_v FROM event WHERE kind = 'grant.rotate' AND target = 'vault_key:record' ORDER BY rowid",
      )
      .map((r) => ({ actor: r.actor, field: r.field, from_v: r.from_v, to_v: r.to_v }));
  return { x: extension(parts), clock, rows, rotations };
}

/** A host's step putting the key behind a passphrase: new bytes and a salt, with what it was handed kept. */
const toPassphrase = (seen: RecordWrapping[]) => async (held: RecordWrapping): Promise<Result<WrappingChange>> => {
  seen.push(held);
  return ok({ to: 'passphrase', wrapped: bytes(48, 7), nonce: bytes(12, 8), salt: bytes(PASSPHRASE_SALT_BYTES, 9) });
};

/** A host's step taking it off: the passphrase was right, and the key goes back under the root key it names. */
const toRoot = async (held: RecordWrapping): Promise<Result<WrappingChange>> =>
  ok({ to: 'kek', wrapped: bytes(48, 10), nonce: bytes(12, 11), kek_id: held.beside ?? 'none' });

/** A host's step that did not open the key with what was typed. */
const wrongOnce = async (): Promise<Result<WrappingChange>> => no('WRONG_KEY', 'That is not this vault’s passphrase, so it stays on.', { at: 'passphrase' });

test('PUTTING IT ON LEAVES ONE WRAPPING OF THE RECORD KEY, THE PASSPHRASE’S, AND TOUCHES NOTHING ELSE', async () => {
  const { x, rows, rotations } = await vault();
  const seen: RecordWrapping[] = [];
  const out = await x.changeVaultWrapping('passphrase', toPassphrase(seen), 'p_1');
  assert.deepEqual(out, { ok: true, value: { on: true } });

  const [handed] = seen;
  assert.equal(handed?.wrapped_by, 'kek', 'the step was not handed the root key’s wrapping');
  assert.equal(handed?.kek_id, ROOT);
  assert.equal(handed?.beside, ROOT, 'the step was not told which root key the other keys are under');

  const after = rows();
  const own = after.get('record');
  assert.equal(own?.wrapped_by, 'passphrase');
  assert.equal(own?.kek_id, null, 'a key behind a passphrase still names a root key');
  assert.deepEqual(own?.wrapped, bytes(48, 7), 'the root key’s wrapping is still there');
  assert.equal(own?.salt?.length, PASSPHRASE_SALT_BYTES);
  for (const purpose of ['connector', 'signing']) {
    assert.equal(after.get(purpose)?.wrapped_by, 'kek', `the ${purpose} key moved`);
    assert.equal(after.get(purpose)?.kek_id, ROOT);
  }
  assert.deepEqual(rotations(), [{ actor: 'p_1', field: 'wrapped_by', from_v: 'kek', to_v: 'passphrase' }]);

  /* ONCE ON, PUTTING IT ON AGAIN IS REFUSED BEFORE THE STEP IS ASKED ANYTHING. */
  const again = await x.changeVaultWrapping('passphrase', toPassphrase(seen), 'p_1');
  assert.equal(again.ok, false);
  assert.equal(!again.ok && 'refusal' in again ? again.refusal.code : '', 'ALREADY_KNOWN');
  assert.equal(seen.length, 1, 'the step ran for a vault that already had a passphrase');
});

test('TAKING IT OFF PUTS THE KEY BACK UNDER THE ROOT KEY BESIDE IT, AND ONLY A PASSPHRASE CAN TAKE IT OFF', async () => {
  const { x, rows, rotations } = await vault();
  await x.changeVaultWrapping('passphrase', toPassphrase([]), 'p_1');
  const off = await x.changeVaultWrapping('kek', toRoot, 'p_1');
  assert.deepEqual(off, { ok: true, value: { on: false } });
  const own = rows().get('record');
  assert.equal(own?.wrapped_by, 'kek');
  assert.equal(own?.kek_id, ROOT);
  assert.equal(own?.salt, null, 'the salt outlived the passphrase it salted');
  assert.deepEqual(
    rotations().map((r) => `${r.from_v}>${r.to_v}`),
    ['kek>passphrase', 'passphrase>kek'],
  );

  const none = await x.changeVaultWrapping('kek', toRoot, 'p_1');
  assert.equal(!none.ok && 'refusal' in none ? none.refusal.code : '', 'ALREADY_KNOWN');
});

test('A WRONG PASSPHRASE IS COUNTED BEFORE IT IS COMPARED, AND PAST THE LIMIT THE VAULT WAITS WITHOUT COMPARING', async () => {
  const { x, clock, rows } = await vault();
  await x.changeVaultWrapping('passphrase', toPassphrase([]), 'p_1');
  let compared = 0;
  const wrong = async (): Promise<Result<WrappingChange>> => {
    compared++;
    return wrongOnce();
  };
  for (let i = 0; i < PASSPHRASE_TRIES; i++) {
    const out = await x.changeVaultWrapping('kek', wrong, 'p_1');
    assert.equal(!out.ok && 'refusal' in out ? out.refusal.code : '', 'WRONG_KEY');
  }
  const locked = await x.changeVaultWrapping('kek', toRoot, 'p_1');
  assert.equal(!locked.ok && 'refusal' in locked ? locked.refusal.code : '', 'RATE_LIMITED');
  assert.ok(!locked.ok && 'refusal' in locked && (locked.refusal.retry_after ?? 0) > 0, 'a locked vault said nothing about when to ask again');
  assert.equal(compared, PASSPHRASE_TRIES, 'a passphrase was compared past the limit');
  assert.equal(rows().get('record')?.wrapped_by, 'passphrase', 'the right passphrase got through a locked vault');

  /* AND ONCE THE WAIT IS OVER, THE RIGHT ONE OPENS IT, and the count starts again from nothing. */
  clock.advance(PASSPHRASE_WAIT_MS + 1_000);
  const off = await x.changeVaultWrapping('kek', toRoot, 'p_1');
  assert.deepEqual(off, { ok: true, value: { on: false } });
});

test('A REFUSAL THAT COMPARED NOTHING HANDS ITS STRIKE BACK', async () => {
  const { x } = await vault();
  await x.changeVaultWrapping('passphrase', toPassphrase([]), 'p_1');
  const missing = async (): Promise<Result<WrappingChange>> => no('REQUIRED_MISSING', 'Type the vault’s passphrase to take it off.', { at: 'passphrase' });
  for (let i = 0; i < PASSPHRASE_TRIES * 2; i++) {
    const out = await x.changeVaultWrapping('kek', missing, 'p_1');
    assert.equal(!out.ok && 'refusal' in out ? out.refusal.code : '', 'REQUIRED_MISSING', 'a request with no passphrase locked the vault');
  }
});

test('THE KEY DOORS: NOTHING TO UNLOCK ON THE ROOT KEY, AN AGENT OPENS NOTHING BEHIND A PASSPHRASE, AND A PERSON’S TRY IS COUNTED', async () => {
  const { x } = await vault();
  let asked = 0;
  const unlock = (answer: boolean | null) => async (): Promise<boolean | null> => {
    asked++;
    return answer;
  };
  assert.deepEqual(await x.unlockVault(unlock(true), true), { ok: true, value: { on: false } });
  assert.deepEqual(await x.unlockVault(unlock(true), false), { ok: true, value: { on: false } });
  assert.equal(asked, 0, 'a vault on the root key asked for a passphrase');

  await x.changeVaultWrapping('passphrase', toPassphrase([]), 'p_1');
  const agent = await x.unlockVault(unlock(true), false);
  assert.equal(!agent.ok && 'refusal' in agent ? agent.refusal.code : '', 'WRONG_KEY');
  assert.equal(asked, 0, 'an agent’s grant was handed the record key’s wrapping');

  const bare = await x.unlockVault(unlock(null), true);
  assert.equal(!bare.ok && 'refusal' in bare ? bare.refusal.code : '', 'REQUIRED_MISSING');
  const wrong = await x.unlockVault(unlock(false), true);
  assert.equal(!wrong.ok && 'refusal' in wrong ? wrong.refusal.code : '', 'WRONG_KEY');
  assert.deepEqual(await x.unlockVault(unlock(true), true), { ok: true, value: { on: true } });
  assert.equal(asked, 3);
});

test('A SLOW CHANGE MADE AGAINST A PASSPHRASE SINCE REPLACED IS A CONFLICT, AND THE NEW PASSPHRASE STAYS ON', async () => {
  const { x, rows, rotations } = await vault();
  await x.changeVaultWrapping('passphrase', toPassphrase([]), 'p_1');

  /* WHILE THE FIRST STEP IS STILL AWAITING ITS CRYPTO, another request takes the old passphrase off and puts a new one
     on, with a new nonce, as every wrapping draws. The slow one then answers with the old passphrase's re-wrap. */
  const slow = async (held: RecordWrapping): Promise<Result<WrappingChange>> => {
    const off = await x.changeVaultWrapping('kek', toRoot, 'p_1');
    assert.deepEqual(off, { ok: true, value: { on: false } });
    const on = await x.changeVaultWrapping(
      'passphrase',
      async () => ok({ to: 'passphrase', wrapped: bytes(48, 13), nonce: bytes(12, 14), salt: bytes(PASSPHRASE_SALT_BYTES, 15) }),
      'p_2',
    );
    assert.deepEqual(on, { ok: true, value: { on: true } });
    return toRoot(held);
  };
  const stale = await x.changeVaultWrapping('kek', slow, 'p_1');
  assert.equal(stale.ok, false);
  assert.ok(!stale.ok && 'conflict' in stale, 'a change made against a replaced passphrase was not a conflict');

  const own = rows().get('record');
  assert.equal(own?.wrapped_by, 'passphrase', 'a stale request took the new passphrase off');
  assert.deepEqual(own?.wrapped, bytes(48, 13));
  assert.deepEqual(
    rotations().map((r) => `${r.from_v}>${r.to_v}`),
    ['kek>passphrase', 'passphrase>kek', 'kek>passphrase'],
  );
});
