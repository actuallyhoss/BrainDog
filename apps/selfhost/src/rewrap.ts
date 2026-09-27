/**
 * The self-host's re-wrap: as the process starts, the record's keys are moved from the previous key file's key to the
 * current one. `53 §5.6` step 8, `loop/finish/ops.md` OPS-16.
 *
 * WHY AT START AND NOT AT NIGHT. A self-host serves one record from one process, and a new key file only takes effect
 * when the process starts, so the start is the one moment a rotation can have happened. `openKeyStore` (`keys.ts`)
 * already opens `<file>.prev` beside the key file, so every key still opens; this moves the rows, so the previous file
 * can go once no backup from before the change will be restored.
 *
 * THE SAME WALK AS THE WORKER'S (`apps/worker/src/rewrap.ts`), over the record in this process rather than an object
 * over RPC, and over this host's key store. The keys are unwrapped here and never in the record, the record swaps each
 * row only while it still names the old id (`kernel/src/api/keys.ts`), and each unwrapped key is zero-filled as soon as
 * it is wrapped again.
 */

import type { RecordApi } from '@braindog/record';

import { unwrap, wrap, type KeyStore, type Purpose } from './keys.ts';

/** `ok`: every key under the current root key already. `rewrapped`: moved now. `straggler`: a key could not move. */
export type RewrapOutcome = 'ok' | 'rewrapped' | 'straggler';

/** The most rows one record holds under a root key: one per `vault_key.purpose`, which is the table's primary key. */
const REWRAP_ROWS = 3;

/**
 * Re-wrap this process's record under the current key, and say what happened when anything did.
 *
 * A REFUSED RECORD IS LEFT ALONE AND SAID NOTHING OF HERE: its schema disagrees with the code, `serve` already says so,
 * and it is re-wrapped on the first start that opens it. A record with no keys under a root key, or none under an old
 * one, is `ok` and silent.
 */
export async function rewrapAtStart(
  api: Pick<RecordApi, 'kernel' | 'rewrapKeys'>,
  store: KeyStore | undefined,
  say: (line: string) => void = () => {},
): Promise<RewrapOutcome> {
  if (api.kernel.refused()) return 'straggler';
  const held = api.kernel.wrappedKeys();
  if (held.length === 0) return 'ok';
  const record = api.kernel.identity()?.id;
  const stuck = (): RewrapOutcome => {
    say(
      "  some of this record's keys could not be moved under the current key file, because neither key file holds the key they name or they do not open under it. What is stored with them answers WRONG_KEY until the key they were wrapped under is back beside the key file as its .prev.",
    );
    return 'straggler';
  };
  if (!store || !record || held.length > REWRAP_ROWS) return stuck();
  const { kekId: to } = await store.current();
  const stale = held.filter((row) => row.kek_id !== to);
  if (stale.length === 0) return 'ok';

  let left = false;
  /* ONE CALL PER ROOT KEY THE ROWS NAME, which is one after a single rotation; each is re-wrapped on its own compare. */
  for (const from of new Set(stale.map((row) => row.kek_id))) {
    if ((await store.byId(from)) === null) {
      left = true;
      continue;
    }
    /* EVERY ROW UNDER `from` OR NONE, because the record refuses a call that leaves one behind (`rewrapKeys`): bytes that
       do not open under the key they name are not this code's to repair, and moving the rows beside them would leave
       the record naming two root keys. */
    const rows: { purpose: Purpose; wrapped: Uint8Array; nonce: Uint8Array }[] = [];
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
    /* ROWS SOMETHING ELSE MOVED FIRST ARE NOT IN `moved`, and they are under the current key already; a refusal is not. */
    const done = await api.rewrapKeys({ from, to, rows });
    if (!done.ok) left = true;
  }
  if (left) return stuck();
  say("  this record's keys were under the previous key file and are under the current one now.");
  return 'rewrapped';
}
