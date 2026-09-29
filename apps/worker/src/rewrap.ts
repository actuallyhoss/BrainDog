/**
 * The nightly re-wrap: one record's keys moved from the root key they were wrapped under to the current one.
 * `53 §5.6` step 5.
 *
 * WHY IT EXISTS. After a rotation `KEK` holds the new key and the old one (`keys.ts`), so every record still opens, and
 * that is only safe for as long as the old key is kept. `rewrapRecord` is the nightly walk's step for one record, and the
 * walk calls it for every record. A record whose keys are all under the current key
 * answers `ok` and costs one read; a record still under the old one is re-wrapped; a record under a key the secret no
 * longer holds is a `straggler`, for the walk to count and to tell the operator of before the old key is retired
 * (`53 §5.6` step 6).
 *
 * THE KEYS ARE UNWRAPPED HERE AND NEVER IN THE RECORD. The object hands out its wrapped rows and takes back rows wrapped
 * under the new key (`kernel/src/api/keys.ts`, `rewrapKeys`), which swaps them only while each still names the old id,
 * so two walks over one record move each row once. Each unwrapped key is zero-filled as soon as it is wrapped again.
 *
 * ITS OWN FILE, free of `cloudflare:`, so it is tested in Node. Nothing here logs: the walk says the outcome, and the
 * outcome names no byte.
 */

import type { Result } from '@braindog/ports';

import { keyStoreOf, unwrap, wrap, type KekBinding, type KeyStore, type Purpose } from './keys.ts';

/** One key as the record holds it under a root key (`wrappedKeys` in `kernel/src/api/keys.ts`). */
export type HeldKey = { purpose: Purpose; wrapped: Uint8Array; nonce: Uint8Array; kek_id: string };

/**
 * What a record hands the re-wrap: the id its wrappings are bound to (the additional data names it), and its keys under
 * a root key. `record` is `null` for an object nobody has created, which holds no keys.
 */
export type HeldKeys = { record: string | null; rows: HeldKey[] };

/** What `rewrapKeys` takes: the root key the rows name now, the one they go under, and the new bytes. */
export type RewrapArgs = { from: string; to: string; rows: { purpose: Purpose; wrapped: Uint8Array; nonce: Uint8Array }[] };

/** Which rows a `rewrapKeys` call moved. */
export type Rewrapped = { moved: Purpose[] };

/**
 * The record's two RPCs the re-wrap needs, on `Record$`: its keys, or `null` for a record this build refuses, and the
 * swap.
 */
export type Rewrappable = {
  keysHeld(): Promise<HeldKeys | null>;
  rewrapKeys(args: RewrapArgs): Promise<Result<Rewrapped>>;
};

/** `ok`: every key under the current root key already. `rewrapped`: moved tonight. `straggler`: a key could not move. */
export type RewrapOutcome = 'ok' | 'rewrapped' | 'straggler';

/**
 * The most rows one record holds under a root key: one per `vault_key.purpose`, which is the table's primary key. A
 * record answering more is not one this code understands, and it is counted rather than written to.
 */
export const REWRAP_ROWS = 3;

/**
 * One record's re-wrap, over a store and the record's two RPCs. `store` is `null` when `KEK` is not bound.
 *
 * A REFUSED RECORD IS A STRAGGLER, because nothing can tell whether its keys moved, and the runbook's usual cause of a
 * straggler is exactly that record (`53 §5.6` step 6). A record with no keys under a root key is `ok` whatever the
 * store holds, including none.
 */
export async function rewrapHeld(store: KeyStore | null, object: Rewrappable): Promise<RewrapOutcome> {
  const held = await object.keysHeld();
  if (held === null) return 'straggler';
  if (held.rows.length === 0) return 'ok';
  if (store === null || held.record === null || held.rows.length > REWRAP_ROWS) return 'straggler';
  const record = held.record;
  const { kekId: to } = await store.current();
  const stale = held.rows.filter((row) => row.kek_id !== to);
  if (stale.length === 0) return 'ok';

  let left = false;
  /* ONE CALL PER ROOT KEY THE ROWS NAME, which is one after a single rotation. Two would be a record that missed a
     night between two rotations; each is re-wrapped on its own compare, so neither can overwrite the other. */
  for (const from of new Set(stale.map((row) => row.kek_id))) {
    if ((await store.byId(from)) === null) {
      left = true;
      continue;
    }
    /* EVERY ROW UNDER `from` OR NONE, because the record refuses a call that leaves one behind (`rewrapKeys`): bytes that
       do not open under the key they name are not this code's to repair, and moving the rows beside them would leave
       the record naming two root keys. */
    const rows: RewrapArgs['rows'] = [];
    let whole = true;
    for (const row of stale) {
      if (row.kek_id !== from) continue;
      const plain = await unwrap(store, record, row.purpose, { wrapped: row.wrapped, nonce: row.nonce, kek_id: from, wrapped_by: 'kek' });
      if (plain === null) {
        whole = false;
        break;
      }
      try {
        const again = await wrap(store, record, row.purpose, plain);
        if (again.kek_id === to) rows.push({ purpose: row.purpose, wrapped: again.wrapped, nonce: again.nonce });
        else whole = false;
      } finally {
        plain.fill(0);
      }
      if (!whole) break;
    }
    if (!whole || rows.length === 0) {
      left = true;
      continue;
    }
    /* ROWS ANOTHER RE-WRAP MOVED FIRST ARE NOT IN `moved`, AND THAT IS NOT A STRAGGLER: whoever moved them wrapped them
       under the current key too, since a re-wrap wraps under nothing else. A refusal is one. */
    const done = await object.rewrapKeys({ from, to, rows });
    if (!done.ok) left = true;
  }
  return left ? 'straggler' : 'rewrapped';
}

/** What `rewrapRecord` reads from the Worker's environment: the root key binding, and the record objects by name. */
export type RewrapEnv<Id> = {
  KEK?: KekBinding | undefined;
  RECORD: { idFromName(name: string): Id; get(id: Id): unknown };
};

/**
 * One record's re-wrap, by the record's name: what the nightly walk is to call for each record it visits, and the name
 * is the one the walk addresses the record's object by, its record id.
 *
 * A `KEK` THAT IS NOT KEYS THROWS, as it does at every other door, so the walk's line for the record carries the
 * sentence rather than a count of stragglers that hides a deployment fault.
 */
export async function rewrapRecord<Id>(env: RewrapEnv<Id>, record: string): Promise<RewrapOutcome> {
  /* THE STUB'S TYPE IS THE PLATFORM'S RPC WRAPPING OF `Record$`, and this file is not where that class is named, so the
     two RPCs are named here instead, as `index.ts` names its own over the same stub. */
  const object = env.RECORD.get(env.RECORD.idFromName(record)) as Rewrappable;
  return rewrapHeld(await keyStoreOf(env.KEK), object);
}
