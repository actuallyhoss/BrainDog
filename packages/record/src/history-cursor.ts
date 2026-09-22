/**
 * The cursor a caller held to named lists pages the log with, in place of the event's rowid.
 *
 * THE ROWID COUNTED WHAT SHE WAS NOT SHOWN. `loop/research-history-cursor.md` measured a member invited to Obligations
 * reading her two lines as rowids 7 and 3, three events she was never shown between them, and removing `rowid` from
 * the line would not have closed it: the cursor out was the same number, a whole number in was a probe (stepping
 * `cursor` from 3 to 10 changed the answer at 4 and at 8, so her lines were 3 and 7 whatever the line carried), and
 * `markRead` answered the rowid it walked to. So what she is handed and what she may hand back are strings.
 *
 * `e.<event id>` IS THE ORDINARY CASE, AND IT SAYS NOTHING THE LINE DID NOT. The id is already on every line she is
 * shown, so a cursor naming the last one is a pointer she could have written herself; the record resolves it through
 * the event table's primary key and checks she was shown that event before walking from it. It needs no key, and it
 * survives a restart, a deploy and an eviction.
 *
 * `s.<sealed>` IS THE ONE CASE IT CANNOT COVER: the walk ran out. A call walks at most 5,000 lines, and when her page
 * is still short there the next call has to start at the event the walk stopped on, which is one she was not shown.
 * Its id would hand her its ULID, whose first ten characters are its millisecond; the last line she was shown loops,
 * because the next call walks the same 5,000 again; and an offset from that line is the count again. So that rowid
 * goes out sealed, AES-GCM with a fresh nonce each time, so the same stop point sealed twice cannot even be compared.
 *
 * THE KEY IS THIS INSTANCE'S AND DIES WITH IT, deliberately. The record has no table for a secret of its own and a
 * self-host started without a key has no `KEK` to wrap one under, so nothing could keep it. Losing it costs one thing:
 * an *Older entries* press that straddles a restart, on a page the cap cut short, is refused, and `/audit` draws the
 * refusal, which tells her to start again from the newest page. Nothing reloads that page for her.
 *
 * WEBCRYPTO AND NOTHING ELSE, as `packages/host/src/sealing.ts` explains: `crypto.subtle` is in Node and in the Worker,
 * so one file serves both. Base64url is written out here for the same reason: `Buffer` is Node's.
 */

type Key = Awaited<ReturnType<typeof crypto.subtle.importKey>>;

/** What a caller held to named lists pages with. */
export type HistoryCursors = {
  /** `e.<id>`: the cursor that names a line the caller was shown. */
  mint(id: string): string;
  /** `s.<sealed>`: a stop point the caller was not shown, which only this instance can open. */
  seal(rowid: number): Promise<string>;
  /** The event id an `e.` cursor names, the rowid an `s.` cursor seals, or `null` for anything else. */
  open(text: string): Promise<{ id: string } | { rowid: number } | null>;
};

const NONCE = 12;

/** The digits of `Number.MAX_SAFE_INTEGER`, which every sealed rowid is padded to. */
const ROWID_WIDTH = 16;

const toBase64url = (bytes: Uint8Array): string => {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');
};

/** `null` for anything that is not base64url, rather than the throw `atob` answers with. */
const fromBase64url = (text: string): Uint8Array<ArrayBuffer> | null => {
  if (!/^[A-Za-z0-9_-]+$/u.test(text)) return null;
  try {
    const bin = atob(text.replace(/-/gu, '+').replace(/_/gu, '/'));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
};

/** An event id as the kernel mints them (`e.` and a ULID), and nothing longer, so a cursor is never a query. */
const EVENT_ID = /^[0-9A-Za-z]{1,40}$/u;

/** One instance's cursors, with a key drawn now and held in memory for as long as the instance lives. */
export async function historyCursors(): Promise<HistoryCursors> {
  /* A SYMMETRIC KEY, SAID TO THE TYPES. Node's lib narrows `generateKey` by its algorithm and the Workers types do not, so
     the Worker's typecheck read this as `CryptoKey | CryptoKeyPair`; AES-GCM only ever gives the first. */
  const key = (await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])) as Key;
  return {
    mint: (id) => `e.${id}`,
    async seal(rowid) {
      const iv = crypto.getRandomValues(new Uint8Array(NONCE));
      /* SIXTEEN DIGITS, WHATEVER THE ROWID. AES-GCM keeps the plaintext's length, and `String(rowid)` made the cursor 41
         characters for rowid 7, 45 for 1000 and 48 for 100000 (`loop/research-batch-nineteen-audit.md`, finding 6), so
         the cursor she is handed past the walk cap told her the log's size to a power of ten. Sixteen is the width of
         `Number.MAX_SAFE_INTEGER`, so no rowid this file will open is wider; every cursor is now 61 characters. */
      const plain = String(rowid).padStart(ROWID_WIDTH, '0');
      const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain)));
      const out = new Uint8Array(NONCE + sealed.length);
      out.set(iv);
      out.set(sealed, NONCE);
      return `s.${toBase64url(out)}`;
    },
    async open(text) {
      if (text.startsWith('e.')) {
        const id = text.slice(2);
        return EVENT_ID.test(id) ? { id } : null;
      }
      if (!text.startsWith('s.')) return null;
      const raw = fromBase64url(text.slice(2));
      /* A NONCE AND AT LEAST THE 16-BYTE TAG, or it is not something this file sealed. */
      if (raw === null || raw.length <= NONCE + 16) return null;
      try {
        const plain = new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.subarray(0, NONCE) }, key, raw.subarray(NONCE)));
        const rowid = /^\d{16}$/u.test(plain) ? Number(plain) : Number.NaN;
        return Number.isSafeInteger(rowid) && rowid > 0 ? { rowid } : null;
      } catch {
        /* A TAG THAT DOES NOT MATCH: another instance's key, a key lost to a restart, or a byte changed in flight. */
        return null;
      }
    },
  };
}
