/**
 * `rewrapKeys`: the record's half of rotating the root key, and `wrappedKeys`, what the host re-wraps.
 * `53 §5.6` step 5, `12 §6`.
 *
 * THE RECORD NEVER HOLDS A KEY, SO THE RE-WRAP IS TWO HALVES. The host reads the record's wrapped keys, unwraps each
 * under the old root key and wraps it under the new one (`apps/worker/src/rewrap.ts`, `apps/selfhost/src/rewrap.ts`),
 * and hands this file the new bytes. What happens here is only the swap, and that is where it can go wrong: a nightly
 * walk and a second walk, or a walk and a self-host starting, may both re-wrap one record, and the second must not put
 * bytes wrapped under a key it read before the first moved the row.
 *
 * SO IT IS A COMPARE-AND-SET ON `kek_id`. Each row is replaced only while it still names `from`, all of them in one
 * transaction, so a row somebody else has moved is left as they left it and the answer says which rows this call moved.
 * A second re-wrap with the same arguments moves nothing and writes nothing.
 *
 * AND EVERY ROW UNDER `from` MOVES TOGETHER OR NONE DOES. A call that carries some of them is refused and writes
 * nothing, so the record never names two root keys at once. It matters because the hosts offer `openGrant` the id
 * `wrappingKey` reads, which is whichever row comes first, while `openGrant` compares against the `record` row alone:
 * a record half moved could be offered the moved rows' id and refuse `WRONG_KEY` although both keys were held. A host
 * whose key did not unwrap sends nothing for that root key and counts the record a straggler instead.
 *
 * A KEY BEHIND A PASSPHRASE IS LEFT ALONE. Only a row `wrapped_by = 'kek'` names a root key at all; a passphrase row is
 * the owner's to open, and no root key rotation reaches it.
 *
 * THE DEKS DO NOT CHANGE, so no grant is re-encrypted (`53 §5.6`): a grant is sealed under a key derived from the
 * record's DEK, which is the same bytes before and after. Each grant row's `kek_id` names the root key its DEK was
 * wrapped under when it was sealed, and it moves with the rows, so the record names one root key throughout.
 *
 * ONE EVENT OF A KIND THAT EXISTS: `grant.rotate` with `target_kind = 'vault_key'`, the two ids in `from_v` and `to_v`,
 * signed `system` (`53 §13` #4, `events.ts`). Never a new kind, because the kinds are closed in migration 0001.
 */

import type { Result } from '@braindog/ports';
import { no, ok } from '@braindog/ports';

import { instant } from '../coerce.ts';
import type { KernelParts } from '../parts.ts';

/** What `vault_key.purpose` admits (its CHECK in `0001_kernel.ts`). */
export type KeyPurpose = 'record' | 'connector' | 'signing';

const PURPOSES: readonly KeyPurpose[] = ['record', 'connector', 'signing'];

/** One key as the record holds it under a root key: the sealed bytes, their nonce, and which root key sealed them. */
export type WrappedKeyRow = { purpose: KeyPurpose; wrapped: Uint8Array; nonce: Uint8Array; kek_id: string };

/** One key re-wrapped by the host under `to`: the new sealed bytes and the new nonce. */
export type RewrappedRow = { purpose: KeyPurpose; wrapped: Uint8Array; nonce: Uint8Array };

/** What `rewrapKeys` takes: the root key the rows name now, the one they are wrapped under next, and the new bytes. */
export type RewrapArgs = { from: string; to: string; rows: readonly RewrappedRow[] };

/** Which rows this call moved. A row that no longer named `from` is not among them. */
export type Rewrapped = { moved: KeyPurpose[] };

const isPurpose = (x: unknown): x is KeyPurpose => typeof x === 'string' && (PURPOSES as readonly string[]).includes(x);
const isBytes = (x: unknown): x is Uint8Array => x instanceof Uint8Array && x.length > 0;
const isId = (x: unknown): x is string => typeof x === 'string' && x.length > 0;

export function extension(parts: KernelParts) {
  const { sql } = parts;

  return {
    /**
     * Every key this record holds under a root key, for the host to re-wrap. A key behind a passphrase is not among
     * them, and a record made before its host had a key store holds none.
     *
     * AT MOST ONE ROW PER PURPOSE, because `purpose` is the table's primary key, so this reads no more rows than
     * `PURPOSES` names.
     */
    wrappedKeys(): WrappedKeyRow[] {
      return sql
        .all<{ purpose: string; wrapped: Uint8Array; nonce: Uint8Array; kek_id: string | null }>(
          "SELECT purpose, wrapped, nonce, kek_id FROM vault_key WHERE wrapped_by = 'kek' AND kek_id IS NOT NULL ORDER BY purpose",
        )
        .flatMap((row): WrappedKeyRow[] => {
          const purpose = row.purpose;
          const id = row.kek_id;
          return isPurpose(purpose) && id !== null ? [{ purpose, wrapped: row.wrapped, nonce: row.nonce, kek_id: id }] : [];
        });
    },

    /**
     * Replace each row still wrapped under `from` with the bytes the host wrapped under `to`, in one transaction.
     * INTERNAL: the host calls it after its own re-wrap, and no route reaches it (`docs/30` §5).
     */
    rewrapKeys(args: RewrapArgs): Result<Rewrapped> {
      if (!isId(args.from) || !isId(args.to))
        return no<Rewrapped>('REQUIRED_MISSING', 'A re-wrap names the key id its rows are under now, as from, and the one they go under, as to.', { at: 'from' });
      if (args.from === args.to)
        return no<Rewrapped>('VALUE_MALFORMED', 'A re-wrap moves rows from one key id to another, and from and to are the same id.', { at: 'to' });
      if (!Array.isArray(args.rows) || args.rows.length === 0 || args.rows.length > PURPOSES.length)
        return no<Rewrapped>('VALUE_MALFORMED', 'A re-wrap carries a row for each key it moves, and no more than one for each purpose.', { at: 'rows' });
      const named = new Set<string>();
      for (const row of args.rows) {
        if (!isPurpose(row.purpose) || named.has(row.purpose))
          return no<Rewrapped>('VALUE_MALFORMED', 'Each re-wrapped row names one of record, connector and signing, once.', { at: 'rows' });
        if (!isBytes(row.wrapped) || !isBytes(row.nonce))
          return no<Rewrapped>('VALUE_MALFORMED', `The ${row.purpose} row carries its wrapped bytes and their nonce, as bytes.`, { at: 'rows' });
        named.add(row.purpose);
      }

      const at = instant(parts.clock.now());
      return parts.transaction(() => {
        /* THE COMPARE, INSIDE THE TRANSACTION THAT SETS, so nothing moves a row between the two. A row the call carries
           that does not name `from` (moved already, or behind a passphrase) is not among these and is left alone. */
        const under = sql
          .all<{ purpose: string }>("SELECT purpose FROM vault_key WHERE wrapped_by = 'kek' AND kek_id = ?", args.from)
          .map((r) => r.purpose);
        const carried = new Set<string>(args.rows.map((row) => row.purpose));
        const behind = under.filter((purpose) => !carried.has(purpose));
        if (behind.length > 0)
          return no<Rewrapped>(
            'VALUE_MALFORMED',
            `A re-wrap moves every key under one id together, and this one leaves the ${behind.join(' and ')} key behind, so nothing was moved.`,
            { at: 'rows' },
          );
        const moved: KeyPurpose[] = [];
        for (const row of args.rows) {
          if (!under.includes(row.purpose)) continue;
          sql.exec(
            "UPDATE vault_key SET wrapped = ?, nonce = ?, kek_id = ?, rewrapped_at = ? WHERE purpose = ? AND wrapped_by = 'kek' AND kek_id = ?",
            row.wrapped,
            row.nonce,
            args.to,
            at,
            row.purpose,
            args.from,
          );
          moved.push(row.purpose);
        }
        /* NOTHING MOVED IS NOTHING WRITTEN: no event, and no grant renamed, so a second re-wrap leaves no trace. */
        if (moved.length === 0) return ok<Rewrapped>({ moved });
        sql.exec("UPDATE grant SET kek_id = ? WHERE wrapped_by = 'kek' AND kek_id = ?", args.to, args.from);
        sql.exec(
          "INSERT INTO event (id, ts, actor, kind, target, target_kind, field, from_v, to_v, note) VALUES (?, ?, 'system', 'grant.rotate', 'vault_key', 'vault_key', 'kek_id', ?, ?, ?)",
          parts.mint(),
          at,
          args.from,
          args.to,
          moved.join(' '),
        );
        return ok<Rewrapped>({ moved });
      });
    },
  };
}
