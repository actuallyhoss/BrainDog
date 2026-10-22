/**
 * Sealed files: `sealedPut`, `sealedGet`, `sealedList` and `sealedDelete`, DATA, the owner's store for bytes this host
 * cannot read (Setup sync; `docs/12-SECURITY.md` §8, "Sealed files").
 *
 * THE HOST NEVER SEES WHAT IS IN THEM. The owner's own machines seal each file with AES-256-GCM under a key only they
 * hold, and this file keeps the bytes as they came: it checks their length and their hash and parses none of them. The
 * sealing is symmetric on purpose. With a public sealing key, a host somebody broke into could seal a file of its own
 * for his machines to place; with a key nobody but his machines holds, no host can forge one.
 *
 * THE OWNER'S ALONE, AS A PERSONAL LIST IS (`personalStop` in `index.ts`). His own session, his own key and the key
 * `braindog login` makes for a machine reach them. An Admin, a member, a share, a link, a runner, an app signed in
 * through OAuth and its hour-long child keys, a key narrowed to less than him, a report key, a job's key, "See as" and
 * an operation grant do not (`sealedStop`). Nor is any of the four an MCP tool: an agent has nothing to do with bytes
 * it cannot open.
 *
 * THE BYTES LIVE WHERE THE HOST KEEPS LARGE BYTES (`SealedStore`), beside the record and never in it: R2 on the Cloud,
 * `blobs/sealed/` beside the record's file on a self-host. The record keeps the index (migration 45): `sealed_file`, what
 * each file is called, its parts, its length and its hash, which travels in every export; and `sealed_part`, which parts
 * this host holds, which does not. No block, source, page or file door reads the store, so a page never serves one.
 *
 * IN PARTS, BECAUSE A CALL IS ONE BODY. A file is at most 25 MiB in at most eight parts of at most 4 MiB, each part
 * base64 in a `sealedPut` of its own, and every part says the whole file's hash, length and count. Part 0 of a file under
 * another hash replaces the one held and lets its parts go; any other part of another file is refused until part 0 has
 * come. The file is whole once every part is here and, read back together, they hash to what each part said; a file
 * whose parts hash to anything else is dropped whole and refused `CHECKSUM_MISMATCH`.
 *
 * COUNTED AGAINST THE RECORD'S STORAGE. A host that meters what one record keeps in a day (the Cloud's `uploadDay`) is
 * asked for each new part's bytes before they are kept, and a part put again under the same hash costs nothing.
 *
 * ONE LINE IN THE LOG PER FILE KEPT WHOLE OR DELETED, naming its key and never its bytes: `grant.add` for a key kept for
 * the first time, `grant.rotate` for one kept again over an older file, `grant.revoke` for a delete, each on
 * `sealed:<key>`. The credential kinds, because a sealed file is the owner's as a key is, and every feed anybody else
 * reads leaves those lines out (`lineOf` in `index.ts`, `activity` in the kernel).
 */

import type { Refusal, Result } from '@braindog/ports';
import { ok } from '@braindog/ports';
import { ulids } from '@braindog/kernel';

import type { CallContext } from '../index.ts';
import type { RecordDeps } from './index.ts';

/** The most one part may be: four mebibytes, decoded. */
export const SEALED_PART_MOST = 4_194_304;

/** The most one file may be: twenty-five mebibytes, every part together. */
export const SEALED_FILE_MOST = 26_214_400;

/** The most parts one file may be in. */
export const SEALED_PARTS_MOST = 8;

/** The longest key. */
export const SEALED_KEY_MOST = 200;

/** A key: lower-case letters and digits, then those and `.`, `_`, `/` and `-`, such as `sync/key` or `carry/<row>/<version>`. */
export const SEALED_KEY = /^[a-z0-9][a-z0-9._/-]*$/;

/** A part's name in a host's store, as `sealedName` makes it: the key's SHA-256, the file's, and the part. */
export const SEALED_NAME = /^[0-9a-f]{64}\.[0-9a-f]{64}\.[0-7]$/;

/** The longest a part's base64 may be: `SEALED_PART_MOST` bytes, written out with padding. */
const BASE64_MOST = Math.ceil(SEALED_PART_MOST / 3) * 4;

const SHA256 = /^[0-9a-f]{64}$/;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

/**
 * Where a host keeps sealed bytes: beside the record, never in it, and never where a page or the file door reads.
 *
 * A PART IS NAMED BY `sealedName`, so no key a caller chose is ever a path or an object's name, and a host checks a name
 * against `SEALED_NAME` before it uses one.
 */
export type SealedStore = {
  /** Keeps one part's bytes under its name, replacing any there. */
  put(name: string, bytes: Uint8Array): Promise<void>;
  /** One part's bytes, or `null` when this host holds nothing under that name. */
  get(name: string): Promise<Uint8Array | null>;
  /** Lets parts go by name. A name this host does not hold is not an error. */
  drop(names: readonly string[]): Promise<void>;
  /** New bytes counted against what this host lets one record keep in a day: `null` to go on, or the seconds to wait. Absent, nothing is counted. */
  spend?: ((bytes: number) => Promise<number | null>) | undefined;
};

/** What `sealedPut` takes. `bytes` is this part's bytes in base64; the other four say the whole file. */
export type SealedPutArgs = { key: string; part: number; parts: number; bytes: string; sha256: string; size: number };

/** What `sealedPut` answers: the part kept, and whether the file is whole now. */
export type SealedPut = { key: string; part: number; parts: number; complete: boolean };

/** One part, as `sealedGet` hands it back, with the whole file's count, length and hash. */
export type SealedPart = { key: string; part: number; parts: number; size: number; sha256: string; bytes: string };

/** One file in `sealedList`. `at` is when it was last written. */
export type SealedFile = { key: string; parts: number; size: number; sha256: string; complete: boolean; at: string };

type FileRow = { key: string; parts: number; size: number; sha256: string; complete: number; updated_at: string };

const hex = (bytes: ArrayBuffer): string => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** A part's name in a host's store: `<sha256 of the key>.<sha256 of the file>.<part>`. */
export async function sealedName(key: string, sha256: string, part: number): Promise<string> {
  return `${hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key)))}.${sha256}.${part}`;
}

/** Base64 as bytes, with or without its padding, or `null` for text that is not base64. */
function fromBase64(text: string): Uint8Array<ArrayBuffer> | null {
  if (!BASE64.test(text) || text.length % 4 === 1) return null;
  let bin: string;
  try {
    bin = atob(text.length % 4 === 0 ? text : `${text}${'='.repeat(4 - (text.length % 4))}`);
  } catch {
    return null;
  }
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

/** Bytes as padded base64, a slice at a time, so four mebibytes never go through one call's arguments. */
function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** A count of bytes as a person reads it. */
const sized = (n: number): string => `${n.toLocaleString('en-GB')} byte${n === 1 ? '' : 's'}`;

/** How long to wait, as a person says it. */
const later = (seconds: number): string =>
  seconds < 120 ? 'in a minute or two' : seconds < 7_200 ? `in ${Math.ceil(seconds / 60)} minutes` : `in ${Math.ceil(seconds / 3_600)} hours`;

export function methods(deps: RecordDeps) {
  const { kernel, sql, guard, no, tail, clock } = deps;
  const mint = ulids(() => clock.now());

  /** Who a write is signed by: the person, or the person a key was made for (`actorOf` in `index.ts`). */
  const actorOf = (ctx: CallContext): string => (ctx.principal.kind === 'token' ? ctx.principal.person : ctx.principal.id);

  const SEALED_ONLY: Refusal = {
    code: 'FORBIDDEN',
    fix: 'Sealed files are personal: only the owner reads or changes them, signed in or with a key of their own, and nobody can be given them.',
    at: 'principal',
  };

  /**
   * The refusal anybody but the owner himself meets, or `null`: `personalStop`'s rule, and the key's own row besides.
   *
   * THE CONTEXT FIRST. "See as" and an operation grant reach nothing here; nor does a call whose context a share, a
   * narrowed key or a child key built, which a host marks with `grant`, `wheres` or a `registers` short of every list
   * (`coverOf`). A child key made at its parent's scope arrives under its parent's id, and that list is how it shows.
   *
   * THEN THE KEY'S ROW, because a key at the owner's level is not always the owner's own: an app's key (`cimd`, `dcr`) and
   * its children, a key narrowed by a lens, a report key and a job's key are each refused by what their row says.
   */
  const sealedStop = (ctx: CallContext): Refusal | null => {
    if (ctx.preview !== undefined) return { code: 'FORBIDDEN', fix: "You're seeing the record as somebody else, and sealed files are only ever the owner's own.", at: 'preview' };
    if (ctx.operation !== undefined) return SEALED_ONLY;
    const p = ctx.principal;
    if (p.kind === 'system') return null;
    if ((p.kind !== 'person' && p.kind !== 'token') || p.level !== 'owner') return SEALED_ONLY;
    if (ctx.grant !== undefined || ctx.wheres !== undefined || (ctx.registers !== undefined && ctx.registers !== '*')) return SEALED_ONLY;
    if (p.kind === 'person') return null;
    const row = sql.one<{ label: string | null; client_kind: string | null; lens: number }>(
      'SELECT label, client_kind, EXISTS (SELECT 1 FROM token_lens l WHERE l.token_id = t.id) AS lens FROM token t WHERE t.id = ?',
      p.id,
    );
    if (row === undefined || Number(row.lens) === 1) return SEALED_ONLY;
    if (row.client_kind === 'cimd' || row.client_kind === 'dcr')
      return { code: 'FORBIDDEN', fix: 'An app signed in through OAuth never reaches sealed files. Use the braindog command, signed in as you.', at: 'principal' };
    const label = row.label ?? '';
    if (label.startsWith('job:') || label.startsWith('report:')) return SEALED_ONLY;
    return null;
  };

  /** A key, checked, or the refusal naming what is wrong with it. */
  const keyOf = (args: unknown): string | Refusal => {
    const key = (args as { key?: unknown } | null | undefined)?.key;
    if (key === undefined || key === null || key === '') return { code: 'REQUIRED_MISSING', fix: 'Name the sealed file by its key, such as sync/key.', at: 'key' };
    if (typeof key !== 'string') return { code: 'VALUE_MALFORMED', fix: 'A key is text, such as sync/key.', at: 'key' };
    if (key.length > SEALED_KEY_MOST) return { code: 'OUT_OF_BOUNDS', fix: `A key is 1 to ${SEALED_KEY_MOST} characters long.`, at: 'key' };
    if (!SEALED_KEY.test(key))
      return { code: 'VALUE_MALFORMED', fix: 'A key is lower-case letters, digits, dots, dashes, underscores and slashes, and starts with a letter or a digit.', at: 'key' };
    return key;
  };

  const fileOf = (key: string): FileRow | undefined =>
    sql.one<FileRow>('SELECT key, parts, size, sha256, complete, updated_at FROM sealed_file WHERE key = ?', key);

  /** The parts this host holds of one file: which, and how long each is. */
  const heldOf = (key: string, sha256: string): Map<number, number> =>
    new Map(sql.all<{ part: number; bytes: number }>('SELECT part, bytes FROM sealed_part WHERE key = ? AND sha256 = ?', key, sha256).map((r) => [Number(r.part), Number(r.bytes)]));

  /** Every part this host holds under one key, whatever its file. Read inside the transaction that lets them go. */
  const partsOf = (key: string): { part: number; sha256: string }[] =>
    sql.all<{ part: number; sha256: string }>('SELECT part, sha256 FROM sealed_part WHERE key = ?', key).map((r) => ({ part: Number(r.part), sha256: r.sha256 }));

  /** Those parts' names in the store. */
  const namesOf = (key: string, parts: readonly { part: number; sha256: string }[]): Promise<string[]> => Promise.all(parts.map((r) => sealedName(key, r.sha256, r.part)));

  const NO_STORE = (what: string): Result<never> => no('NOT_IN_THIS_BUILD', `This BrainDog keeps no sealed files, so ${what}.`, { at: 'host' });

  /** Whether a held file row is the one a call describes. */
  const sameFile = (row: FileRow | undefined, sha256: string, parts: number, size: number): boolean =>
    row !== undefined && row.sha256 === sha256 && Number(row.parts) === parts && Number(row.size) === size;

  /**
   * The log's one line for a file kept whole: `grant.add` the first time its key is kept, `grant.rotate` when it is kept
   * again over an older file. Inside the caller's transaction.
   */
  const kept = (ctx: CallContext, key: string, parts: number, size: number, at: string): void => {
    const target = `sealed:${key}`;
    const last = sql.one<{ kind: string }>('SELECT kind FROM event WHERE target = ? ORDER BY rowid DESC LIMIT 1', target)?.kind;
    sql.exec(
      "INSERT INTO event (id, ts, actor, kind, target, target_kind, note) VALUES (?, ?, ?, ?, ?, 'sealed', ?)",
      mint(),
      at,
      actorOf(ctx),
      last === 'grant.add' || last === 'grant.rotate' ? 'grant.rotate' : 'grant.add',
      target,
      `${key}, ${parts} part${parts === 1 ? '' : 's'}, ${sized(size)}`,
    );
  };

  return {
    /**
     * Keep one part of a sealed file. DATA, the owner's alone; a write, so a POST, and the one `/api` body allowed past a
     * mebibyte (`SEALED_BODY_MOST_BYTES` in `@braindog/host`).
     */
    async sealedPut(args: SealedPutArgs, ctx: CallContext): Promise<Result<SealedPut>> {
      const stop = guard(ctx, 'write') ?? sealedStop(ctx);
      if (stop) return { ok: false, refusal: stop };

      const key = keyOf(args);
      if (typeof key !== 'string') return { ok: false, refusal: key };
      const { part, parts, size, sha256, bytes } = args as Partial<Record<keyof SealedPutArgs, unknown>>;
      if (!Number.isSafeInteger(parts) || (parts as number) < 1 || (parts as number) > SEALED_PARTS_MOST)
        return no('OUT_OF_BOUNDS', `A sealed file is in 1 to ${SEALED_PARTS_MOST} parts.`, { at: 'parts' });
      const count = parts as number;
      if (!Number.isSafeInteger(part) || (part as number) < 0 || (part as number) >= count)
        return no('OUT_OF_BOUNDS', count === 1 ? 'A file in one part has only part 0.' : `A file in ${count} parts has parts 0 to ${count - 1}.`, { at: 'part' });
      const n = part as number;
      if (!Number.isSafeInteger(size) || (size as number) < 0) return no('VALUE_MALFORMED', 'size is the whole sealed file’s length in bytes.', { at: 'size' });
      const length = size as number;
      if (length > SEALED_FILE_MOST)
        return no('OUT_OF_BOUNDS', `A sealed file is at most 25 MB, and this one says it is ${sized(length)}.`, { at: 'size' });
      if (length > count * SEALED_PART_MOST)
        return no('OUT_OF_BOUNDS', `A file of ${sized(length)} needs ${Math.ceil(length / SEALED_PART_MOST)} parts of at most 4 MB, and this one says ${count}.`, { at: 'size' });
      if (typeof sha256 !== 'string' || !SHA256.test(sha256))
        return no('VALUE_MALFORMED', 'sha256 is the whole sealed file’s SHA-256, as 64 lower-case hex characters.', { at: 'sha256' });
      if (bytes === undefined || bytes === null) return no('REQUIRED_MISSING', 'Send this part’s bytes in base64 as bytes.', { at: 'bytes' });
      if (typeof bytes !== 'string') return no('VALUE_MALFORMED', 'bytes is this part’s bytes in base64.', { at: 'bytes' });
      /* WEIGHED BEFORE IT IS DECODED, so text past the most a part can be is never turned into bytes. */
      if (bytes.length > BASE64_MOST) return no('OUT_OF_BOUNDS', 'A part is at most 4 MB before base64. Send the file in more parts.', { at: 'bytes' });
      const body = fromBase64(bytes);
      if (body === null) return no('VALUE_MALFORMED', 'bytes is this part’s bytes in base64.', { at: 'bytes' });
      if (body.byteLength > SEALED_PART_MOST) return no('OUT_OF_BOUNDS', 'A part is at most 4 MB before base64. Send the file in more parts.', { at: 'bytes' });

      const store = deps.sealed;
      if (store === undefined) return NO_STORE('nothing was kept');

      const held = fileOf(key);
      const same = held !== undefined && sameFile(held, sha256, count, length);
      /* ANOTHER FILE'S PART IS REFUSED UNTIL PART 0 HAS COME, because only part 0 says the file is a new one. */
      if (held !== undefined && !same && n !== 0) {
        const at = held.sha256 !== sha256 ? 'sha256' : Number(held.parts) !== count ? 'parts' : 'size';
        return no('OUT_OF_BOUNDS', `${key} is kept as another file. Put part 0 first, which replaces it, then the other parts.`, { at });
      }
      /* A FILE ALREADY WHOLE IS NOT WRITTEN AGAIN: its parts were read back and hashed, and a part put again could only
         undo that. The same call answers what the first did. */
      if (same && Number(held.complete) === 1) return ok({ key, part: n, parts: count, complete: true });

      const kept0 = same ? heldOf(key, sha256) : new Map<number, number>();
      let others = 0;
      for (const [p, b] of kept0) if (p !== n && p < count) others += b;
      if (others + body.byteLength > length)
        return no('OUT_OF_BOUNDS', `The parts of ${key} come to more than the ${sized(length)} its size says.`, { at: 'bytes' });

      /* ONLY NEW BYTES ARE COUNTED against the day: a part put again under the same hash costs nothing. */
      if (store.spend !== undefined && !kept0.has(n)) {
        const wait = await store.spend(body.byteLength);
        if (wait !== null)
          return no('RATE_LIMITED', `This record has kept as many new bytes today as it may. Put the rest ${later(wait)}.`, { at: 'bytes', retry_after: wait });
      }

      const now = new Date(clock.now()).toISOString();
      const by = actorOf(ctx);
      /* A NEW FILE OR A REPLACED ONE: its row says the file each part must match, and the old parts go before the new one
         lands, row first, so the index never names bytes that are gone. Asked again inside the transaction, because
         another part of this same file may have made the row while this one waited, and then nothing is replaced. */
      if (!same) {
        const stale = kernel.transaction(() => {
          if (sameFile(fileOf(key), sha256, count, length)) return [];
          const gone = partsOf(key);
          sql.exec('DELETE FROM sealed_part WHERE key = ?', key);
          sql.exec(
            `INSERT INTO sealed_file (key, parts, size, sha256, complete, made_at, updated_at, made_by) VALUES (?, ?, ?, ?, 0, ?, ?, ?)
             ON CONFLICT (key) DO UPDATE SET parts = excluded.parts, size = excluded.size, sha256 = excluded.sha256, complete = 0,
               made_at = excluded.made_at, updated_at = excluded.updated_at, made_by = excluded.made_by`,
            key,
            count,
            length,
            sha256,
            now,
            now,
            by,
          );
          return gone;
        });
        if (stale.length > 0) await store.drop(await namesOf(key, stale));
      }

      const name = await sealedName(key, sha256, n);
      await store.put(name, body);

      /* AND THE PART IS NAMED ONLY IF ITS FILE IS STILL THE ONE HELD: another call may have replaced or deleted it while
         these bytes were on their way, and then they are let go and the caller is told. */
      const landed = kernel.transaction(() => {
        if (!sameFile(fileOf(key), sha256, count, length)) return false;
        sql.exec(
          `INSERT INTO sealed_part (key, part, sha256, bytes, at) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (key, part) DO UPDATE SET sha256 = excluded.sha256, bytes = excluded.bytes, at = excluded.at`,
          key,
          n,
          sha256,
          body.byteLength,
          now,
        );
        sql.exec('UPDATE sealed_file SET updated_at = ? WHERE key = ?', now, key);
        return true;
      });
      if (!landed) {
        await store.drop([name]);
        return tail(no<SealedPut>('OUT_OF_BOUNDS', `${key} was replaced or deleted while this part was on its way. Put part 0 again.`, { at: 'key' }));
      }

      const have = heldOf(key, sha256);
      const every = [...Array(count).keys()];
      if (!every.every((p) => have.has(p)) || every.reduce((sum, p) => sum + (have.get(p) ?? 0), 0) !== length)
        return tail(ok({ key, part: n, parts: count, complete: false }));

      /* EVERY PART IS HERE: read back together, they hash to what each part said, or the file is not kept. */
      const whole = new Uint8Array(length);
      const missing: number[] = [];
      let at = 0;
      let fits = true;
      for (const p of every) {
        const piece = p === n ? body : await store.get(await sealedName(key, sha256, p));
        if (piece === null) missing.push(p);
        else if (at + piece.byteLength > length) fits = false;
        else {
          whole.set(piece, at);
          at += piece.byteLength;
        }
      }
      /* A PART THE INDEX NAMES AND THE STORE HAS NOT GOT is named no longer, so the next put of it is counted as new. */
      if (missing.length > 0) {
        kernel.transaction(() => {
          for (const p of missing) sql.exec('DELETE FROM sealed_part WHERE key = ? AND part = ? AND sha256 = ?', key, p, sha256);
        });
        return tail(ok({ key, part: n, parts: count, complete: false }));
      }
      if (!fits || at !== length || hex(await crypto.subtle.digest('SHA-256', whole)) !== sha256) {
        const names = await Promise.all([...Array(count).keys()].map((p) => sealedName(key, sha256, p)));
        kernel.transaction(() => {
          if (!sameFile(fileOf(key), sha256, count, length)) return;
          sql.exec('DELETE FROM sealed_part WHERE key = ? AND sha256 = ?', key, sha256);
          sql.exec('DELETE FROM sealed_file WHERE key = ? AND sha256 = ?', key, sha256);
        });
        await store.drop(names);
        return tail(
          no<SealedPut>('CHECKSUM_MISMATCH', `The parts of ${key} do not hash to the sha256 they were sent with, so the file was not kept. Put it again from part 0.`, { at: 'sha256' }),
        );
      }
      /* WHOLE, AND SAID ONCE: two last parts arriving together both read the file back, and only the first writes the line. */
      const complete = kernel.transaction(() => {
        const row = fileOf(key);
        if (row === undefined || !sameFile(row, sha256, count, length)) return false;
        if (Number(row.complete) === 1) return true;
        const then = new Date(clock.now()).toISOString();
        sql.exec('UPDATE sealed_file SET complete = 1, updated_at = ? WHERE key = ?', then, key);
        kept(ctx, key, count, length, then);
        return true;
      });
      return tail(ok({ key, part: n, parts: count, complete }));
    },

    /** One part of a sealed file, as it was put. DATA, the owner's alone. */
    async sealedGet(args: { key: string; part: number }, ctx: CallContext): Promise<Result<SealedPart>> {
      const stop = guard(ctx, 'read') ?? sealedStop(ctx);
      if (stop) return { ok: false, refusal: stop };
      const key = keyOf(args);
      if (typeof key !== 'string') return { ok: false, refusal: key };
      const part = (args as { part?: unknown } | null | undefined)?.part ?? 0;
      if (!Number.isSafeInteger(part) || (part as number) < 0) return no('VALUE_MALFORMED', 'part is a whole number, from 0.', { at: 'part' });
      const n = part as number;
      const store = deps.sealed;
      if (store === undefined) return NO_STORE('there is nothing to read');

      const row = fileOf(key);
      if (row === undefined) return no('NOT_FOUND', `There is no sealed file called ${key} here.`, { at: 'key' });
      const count = Number(row.parts);
      if (n >= count)
        return no('NOT_FOUND', count === 1 ? `${key} is in one part, part 0.` : `${key} is in ${count} parts, numbered 0 to ${count - 1}.`, { at: 'part' });
      if (!heldOf(key, row.sha256).has(n)) return no('NOT_FOUND', `Part ${n} of ${key} has not been put here yet.`, { at: 'part' });
      const bytes = await store.get(await sealedName(key, row.sha256, n));
      if (bytes === null) {
        /* THE INDEX NAMED BYTES THE STORE HAS NOT GOT, as after a copy put back: it says so from now on. */
        kernel.transaction(() => {
          sql.exec('DELETE FROM sealed_part WHERE key = ? AND part = ? AND sha256 = ?', key, n, row.sha256);
          sql.exec('UPDATE sealed_file SET complete = 0 WHERE key = ? AND sha256 = ?', key, row.sha256);
        });
        return no('NOT_FOUND', `Part ${n} of ${key} is not on this host. Put it again from the machine that sealed it.`, { at: 'part' });
      }
      return ok({ key, part: n, parts: count, size: Number(row.size), sha256: row.sha256, bytes: toBase64(bytes) });
    },

    /** Every sealed file the record names, or those whose key starts with `prefix`, by key. DATA, the owner's alone. */
    async sealedList(args: { prefix?: string } | undefined, ctx: CallContext): Promise<Result<{ files: SealedFile[] }>> {
      const stop = guard(ctx, 'read') ?? sealedStop(ctx);
      if (stop) return { ok: false, refusal: stop };
      const prefix = (args as { prefix?: unknown } | null | undefined)?.prefix ?? '';
      if (typeof prefix !== 'string') return no('VALUE_MALFORMED', 'prefix is the start of a key, such as carry/.', { at: 'prefix' });
      if (prefix.length > SEALED_KEY_MOST) return no('OUT_OF_BOUNDS', `A prefix is at most ${SEALED_KEY_MOST} characters long.`, { at: 'prefix' });
      /* `substr` AND NOT `LIKE`: a key holds `_`, which `LIKE` reads as any character. */
      const rows = sql.all<FileRow>(
        'SELECT key, parts, size, sha256, complete, updated_at FROM sealed_file WHERE substr(key, 1, ?) = ? ORDER BY key',
        prefix.length,
        prefix,
      );
      return ok({
        files: rows.map((r) => ({ key: r.key, parts: Number(r.parts), size: Number(r.size), sha256: r.sha256, complete: Number(r.complete) === 1, at: r.updated_at })),
      });
    },

    /** Delete a sealed file and every part of it this host holds. DATA, the owner's alone. The second call says `deleted: false`. */
    async sealedDelete(args: { key: string }, ctx: CallContext): Promise<Result<{ key: string; deleted: boolean }>> {
      const stop = guard(ctx, 'write') ?? sealedStop(ctx);
      if (stop) return { ok: false, refusal: stop };
      const key = keyOf(args);
      if (typeof key !== 'string') return { ok: false, refusal: key };
      const gone = kernel.transaction(() => {
        const held = fileOf(key) !== undefined;
        const parts = partsOf(key);
        if (!held && parts.length === 0) return null;
        sql.exec('DELETE FROM sealed_part WHERE key = ?', key);
        sql.exec('DELETE FROM sealed_file WHERE key = ?', key);
        if (held)
          sql.exec(
            "INSERT INTO event (id, ts, actor, kind, target, target_kind, note) VALUES (?, ?, ?, 'grant.revoke', ?, 'sealed', ?)",
            mint(),
            new Date(clock.now()).toISOString(),
            actorOf(ctx),
            `sealed:${key}`,
            key,
          );
        return { held, parts };
      });
      if (gone === null) return ok({ key, deleted: false });
      /* THE ROWS FIRST, THEN THE BYTES: a store that fails here leaves bytes nothing names, never a name with no bytes. */
      if (gone.parts.length > 0 && deps.sealed !== undefined) await deps.sealed.drop(await namesOf(key, gone.parts));
      return tail(ok({ key, deleted: gone.held }));
    },
  };
}
