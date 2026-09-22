/**
 * The hosted record's copies, in R2: `33 §1` port 9 for the Worker, as `apps/selfhost/src/snapshots.ts`
 * is for a machine with a disk.
 *
 * THE SAME ANSWER TO "WHAT IS A BACKUP" AS THE SELF-HOST'S, and where the two differ it is because
 * the platform left no choice. A self-host copies the live file with `VACUUM INTO` and keeps the six
 * `local` tables, because it is backing up an instance. A Durable Object has no file to copy and no
 * `VACUUM INTO`, so the cloud copy is the `.brain` the kernel already writes: the same export, the
 * same three sections that travel, the same manifest, the same Ed25519 signature over it, and the
 * same thirty kept. What a customer can restore from either one is the same record.
 *
 * WHY THE EXPORT AND NOT THE PAGES. The task that asked for this called it a `.dog` export, and a
 * `.dog` is one page's source, one page to one file (`packages/dog/src/index.ts`). A record is a
 * `.brain`, and `03-DOG-FORMAT` §1 spends a paragraph on the rename. A nightly copy of the pages
 * would leave out every row the business is made of.
 *
 * THE RECORD MAKES NO OUTBOUND CALL AND THIS FILE IS PART OF WHY. The Durable Object hands back the
 * bytes it dumped; the put, the list and the prune happen in the Worker with the Worker's binding,
 * the way `deliver.ts` does the outbox's I/O. And nothing here imports `cloudflare:`: R2 arrives as
 * the five methods below and not one more, so every rule worth testing runs in a bare Node process.
 *
 * A NAMED RECIPIENT SEALS, AND A RECIPIENT THAT WILL NOT DO STOPS THE WALK BEFORE IT STARTS.
 * `53 §5.4` wants the cloud copy sealed to `AGE_RECIPIENT`, and `seal.ts` writes age v1 to it. Until
 * that file existed the Worker passed the recipient and no sealer, and every record was refused in
 * turn with the same sentence. Now the recipient is read once, where the copier is built: a real
 * one seals every copy, and the placeholder `wrangler.jsonc` ships with is one refusal naming the
 * variable. Neither is ever a plaintext object in a bucket the operator believes is sealed.
 */

import { fixOf, type Result } from '@braindog/ports';

import { recipientOf, sealStreamTo, type Plain, type Sealed } from './seal.ts';

/** How many dated copies are kept. Thirty, because `apps/selfhost/src/snapshots.ts` keeps thirty (`53 §5.4`). */
export const KEEP = 30;

/**
 * `51 §5.12` step 3's ceiling, in bytes.
 *
 * IT IS A REFUSAL AND NOT A TRUNCATION. Above the ceiling the night's copy fails loudly, with a
 * sentence naming what to do, and the other records still get theirs.
 *
 * AND IT IS CHECKED LATER THAN IT SOUNDS, WHICH IS WORTH KNOWING BEFORE ANYBODY RELIES ON IT. The
 * kernel signs inside `export`, so by the time `take` measures, the Durable Object has already
 * built and signed the whole file and shipped it over RPC. It does NOT stop an out-of-memory inside
 * the object, and nothing here can until the dump streams (`51 §10`).
 *
 * WHAT IT BOUNDS IN THE WORKER IS THE STRING, and that is twice what the name says. The ceiling is
 * bytes of UTF-8, and V8 holds a string at two bytes a character as soon as one character is outside
 * Latin-1, so a dump at the ceiling can be an 80 MiB string. `take` never makes the file beside it on
 * workerd: it encodes one 64 KiB chunk per pull. A two-byte dump at the ceiling, counted from before
 * the string existed, held 120.8 MiB live of the isolate's 122 when the whole file was encoded first
 * (batch-twenty audit, finding 4), and `test/snapshots-peak.test.ts` read 133 MiB peak resident for
 * that code against 93 streamed, 13 above the string. Raising this raises the string first, at up to
 * two bytes of string per byte of file.
 */
export const CEILING = 40 * 1024 * 1024;

/** Unsealed, for a deployment with no `AGE_RECIPIENT`. The sealed copy is `.brainl.age` (`03 §5`). */
const PLAIN = '.brainl';
const SEALED = '.brainl.age';

/** The pointer a restore reaches for without having to know what last night was called. */
export const LATEST = `latest${PLAIN}`;

/** Where one record's copies live. Deletion is one prefix, which is what `51 §5.13` step 3 pages over. */
export const prefixOf = (record: string): string => `${record}/snapshots/`;

/** One night's key. The date sorts, so the newest is the last name in the listing. */
export const snapshotKey = (record: string, at: string, ext: string = PLAIN): string =>
  `${prefixOf(record)}nightly-${at.slice(0, 10)}${ext}`;

/** A dated copy, as against `latest`: `nightly-2026-09-20`. */
const DATED = /^nightly-(\d{4}-\d{2}-\d{2})\.brainl(?:\.age)?$/u;

/**
 * The five methods this needs from `R2Bucket`, and not one more.
 *
 * NAMED STRUCTURALLY SO THE RULES CAN BE TESTED. `@cloudflare/workers-types` is not in the test
 * tsconfig's `types`, deliberately: a module that can only be typechecked with the platform's
 * globals is a module whose tests have to run on the platform.
 */
export type Blobs = {
  put(key: string, value: string | Uint8Array, options?: { customMetadata?: Record<string, string> }): Promise<unknown>;
  /* `body` IS OPTIONAL SO A TEST'S BUCKET NEED NOT HAVE ONE. R2's always does, and it is read only
     where a `Fixed` exists, which is to say in the Worker and in `test/snapshots-stream.test.ts`. */
  get(key: string): Promise<{ size: number; text(): Promise<string>; body?: ReadableStream<Uint8Array> } | null>;
  list(options?: { prefix?: string; cursor?: string }): Promise<{ objects: { key: string; size: number }[]; truncated: boolean; cursor?: string }>;
  delete(keys: string | string[]): Promise<void>;
};

/**
 * A bucket that also takes a stream, which R2 is.
 *
 * A SECOND TYPE AND NOT A WIDER `put` ON `Blobs`. Widening `Blobs.put` was tried first, and
 * `test/snapshots.test.ts` stopped typechecking: its bucket reads `value` as bytes, which is right
 * for a Node bucket that is never handed a stream. A stream is put only where a `Fixed` exists,
 * which is workerd, where the bucket is R2, or a test that hands in both.
 */
export type StreamBlobs = Omit<Blobs, 'put'> & {
  put(key: string, value: string | Uint8Array | ReadableStream<Uint8Array>, options?: { customMetadata?: Record<string, string> }): Promise<unknown>;
};

/** What the kernel dumped, ready to be written. `rows` is counted here so the metadata is not a second count. */
export type Dump = { text: string; rows: number; at: string; bookmark?: string | undefined };

/** What one night left behind. */
export type Kept = { key: string; bytes: number; rows: number; at: string };

/** A copy in the bucket, in the shape `33 §1` port 9 lists them. */
export type Copy = { id: string; at: string; bytes: number };

/** Turns the plaintext file into the bytes that are stored. Absent, nothing is sealed. */
export type Seal = (file: Uint8Array) => Promise<Uint8Array>;

/**
 * Makes a stream R2 will take: the same bytes, with the length promised up front.
 *
 * WHY THIS IS NEEDED AT ALL. R2's `put` refuses a `ReadableStream` whose length it cannot know,
 * and a stream made in the Worker has none. workerd's `FixedLengthStream` is the platform's answer,
 * and it exists only in workerd, so it is found on `globalThis` and a test hands in its own.
 */
export type Fixed = (stream: ReadableStream<Uint8Array>, length: number) => ReadableStream<Uint8Array>;

type Pair = { readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array> };

/** workerd's `FixedLengthStream`, or `undefined` under Node, where `take` falls back to one buffer. */
function platformFixed(): Fixed | undefined {
  const FixedLengthStream = (globalThis as { FixedLengthStream?: new (length: number) => Pair }).FixedLengthStream;
  return FixedLengthStream ? (stream, length) => stream.pipeThrough(new FixedLengthStream(length)) : undefined;
}

/** How much of the dump each pull encodes: one age chunk, so a sealed pull reads exactly one. */
const PIECE = 64 * 1024;

const high = (unit: number): boolean => unit >= 0xd800 && unit <= 0xdbff;
const low = (unit: number): boolean => unit >= 0xdc00 && unit <= 0xdfff;

/**
 * Fills `out` with the next bytes of `text`'s UTF-8, front to back, and says how many it wrote,
 * which is fewer than `out.length` only at the end of the text.
 *
 * THE BYTES ARE `TextEncoder.encode(text)`'S, and the two ways a piece at a time could differ from it
 * are handled here. A character whose bytes do not fit what is left of `out` is encoded on its own
 * and split, the rest carried to the next call, because every age chunk but the last must be exactly
 * 64 KiB. And a slice of the text never ends between the two halves of a surrogate pair, because
 * `encodeInto` would write each half as U+FFFD. `test/snapshots-peak.test.ts` holds both against
 * `TextEncoder` at every offset around a chunk boundary.
 */
function utf8Reader(text: string): (out: Uint8Array) => number {
  const encoder = new TextEncoder();
  let at = 0;
  let carry: Uint8Array = new Uint8Array(0);
  return (out) => {
    let n = Math.min(carry.length, out.length);
    out.set(carry.subarray(0, n));
    carry = carry.subarray(n);
    while (n < out.length && at < text.length) {
      /* ONE UNIT PER BYTE OF ROOM IS ENOUGH, because no character is less than one byte of UTF-8. */
      let end = Math.min(text.length, at + (out.length - n));
      if (end < text.length && high(text.charCodeAt(end - 1))) end--;
      const done = end > at ? encoder.encodeInto(text.slice(at, end), out.subarray(n)) : { read: 0, written: 0 };
      at += done.read;
      n += done.written;
      if (done.read === 0) {
        const width = high(text.charCodeAt(at)) && low(text.charCodeAt(at + 1)) ? 2 : 1;
        const whole = encoder.encode(text.slice(at, at + width));
        const room = out.length - n;
        out.set(whole.subarray(0, room), n);
        carry = whole.subarray(room);
        at += width;
        n = out.length;
      }
    }
    return n;
  };
}

/**
 * The dump as a `Plain`: its UTF-8 length, counted by encoding it once into one scratch piece, and a
 * reader that encodes it again as it is pulled.
 *
 * COUNTED BY THE SAME READER AND NOT BY A SECOND RULE, so the length R2 is promised and the bytes it
 * is sent cannot disagree about a lone surrogate. The count is a second pass over the text for CPU
 * and costs 64 KiB of memory, where `TextEncoder.encode` costs a file as long as the dump.
 */
function plainOf(text: string): Plain {
  const count = utf8Reader(text);
  const scratch = new Uint8Array(PIECE);
  let length = 0;
  for (let n = count(scratch); n > 0; n = count(scratch)) length += n;
  const read = utf8Reader(text);
  return {
    length,
    read(out) {
      const n = read(out);
      if (n !== out.length) throw new Error(`the dump ended ${String(out.length - n)} bytes short of the ${String(length)} it counted`);
    },
  };
}

/** The unsealed dump as a stream of known length, one piece per pull. */
function streamOf(plain: Plain): Sealed {
  let left = plain.length;
  const stream = new ReadableStream<Uint8Array>({
    pull(out) {
      if (left === 0) return out.close();
      const piece = new Uint8Array(Math.min(PIECE, left));
      plain.read(piece);
      left -= piece.length;
      out.enqueue(piece);
    },
  });
  return { length: plain.length, stream };
}

/** A sealed stream read into the one buffer it describes, for a bucket that cannot take a stream. */
async function drain(sealed: Sealed): Promise<Uint8Array> {
  const out = new Uint8Array(sealed.length);
  let at = 0;
  for await (const chunk of sealed.stream) {
    out.set(chunk, at);
    at += chunk.length;
  }
  if (at !== sealed.length) throw new Error(`the sealer wrote ${String(at)} of the ${String(sealed.length)} bytes it promised`);
  return out;
}

/**
 * The sealer a deployment's `AGE_RECIPIENT` names, `undefined` when it names none, and a throw when
 * it names something that is not a recipient.
 *
 * EMPTY IS UNSEALED ON PURPOSE AND A PLACEHOLDER IS NOT. The Worker passes `env.AGE_RECIPIENT ?? ''`,
 * so an operator who has decided against sealing clears the var and gets plaintext copies they
 * know about. `age1<alpha-recipient>` is not that decision, it is a decision nobody has made yet,
 * and treating it as empty would be the quiet plaintext this file exists to refuse.
 */
function sealerOf(recipient: string | undefined): ((file: Uint8Array | Plain) => Promise<Sealed>) | undefined {
  if (!recipient) return undefined;
  const key = recipientOf(recipient);
  if (typeof key === 'string') throw new Error(`The nightly copy did not run: ${key}`);
  return sealStreamTo(key);
}

/**
 * A record's dump, exported and counted.
 *
 * `redactGrants: false` BECAUSE THIS IS A BACKUP AND NOT A HANDOVER. A redacted export drops the
 * sealed bytes of every vault grant, and a copy restored from one would come back with the vault
 * empty and nothing saying which credentials used to be in it. The bytes travel as ciphertext
 * wrapped under a KEK the bucket does not hold, which is the same protection they have at rest.
 *
 * `actor: 'system'` because the walk is not a person, and the `export` event the kernel writes is
 * the answer to "did anything leave" (`12 §6`). It is written to the record and left out of the
 * file on purpose, so the copy does not grow by one row a night on a record nobody touched.
 * Measured on a fresh record: two dumps back to back are 114 lines and 88 counted rows each, and
 * they differ in exactly one field, the signature's `signedAt` (see `sign.ts`). The copies are not
 * byte-identical, and nothing here should be written as though they were.
 */
export async function dumpOf(
  api: { kernel: { export(opts: { redactGrants?: boolean; actor?: string }): Promise<Result<string[]>> } },
  at: string,
  bookmark?: string | undefined,
): Promise<Dump> {
  const out = await api.kernel.export({ redactGrants: false, actor: 'system' });
  if (!out.ok) throw new Error(`the record would not export: ${fixOf(out)}`);
  /* A ROW IS A LINE THAT IS NOT A HEADER. `#dogl <n>` and every `#table` line describe the file;
     what is counted here is what `customMetadata.rows` promises, which is rows of record. */
  const rows = out.value.reduce((n, line) => (line.startsWith('#') ? n : n + 1), 0);
  return { text: out.value.join('\n'), rows, at, ...(bookmark === undefined ? {} : { bookmark }) };
}

/**
 * The copies one bucket holds, for every record on this deployment.
 *
 * `take` IS THE WHOLE OF THE NIGHTLY WRITE and it throws on every failure. Nothing here catches its
 * own error: the caller counts the failure, names the record and says so in the line the morning
 * check reads. A `take` that returned quietly after a refused put would leave yesterday's `latest`
 * in place and a list that looks healthy, which is the one bug in this file nobody would notice
 * until they needed the copy.
 *
 * AND BUILDING IT THROWS when `recipient` is named and is not an `age1` X25519 recipient. That is
 * the one failure that is the deployment's and not a record's, so it is said once, before the walk,
 * and the cron invocation is red with a sentence naming `AGE_RECIPIENT`. `seal` is for a test that
 * needs a transform of its own; the Worker passes the recipient and nothing else. `fixed` is for a
 * test that stands in for workerd's `FixedLengthStream`, and without either `take` writes buffers.
 */
export function r2Snapshots(
  blobs: Blobs | StreamBlobs,
  o: { recipient?: string | undefined; seal?: Seal | undefined; fixed?: Fixed | undefined } = {},
) {
  const seal = o.seal;
  const stream = seal ? undefined : sealerOf(o.recipient);
  const fixed = o.fixed ?? platformFixed();
  const ext = seal || stream ? SEALED : PLAIN;
  const latest = `latest${ext}`;

  /**
   * Everything under one record's prefix, paged, with the key each object actually has.
   *
   * THE KEY IS CARRIED AND NEVER REBUILT, and that is this function's whole reason for existing
   * apart from `list`. `prune` used to reconstruct a key from the parsed date plus the extension
   * this build would write TODAY, which is the same string only while the extension never changes.
   * Measured across one: thirty plaintext nights then eight sealed ones left thirty-eight dated
   * objects, because every delete named a `.brainl.age` that had never been written and R2 takes a
   * delete of an absent key without complaint. Retention stopped and nothing said so, and the
   * objects that survived were the UNSEALED ones, in a bucket somebody had just sealed.
   */
  const held = async (record: string): Promise<{ key: string; name: string; copy?: Copy }[]> => {
    const prefix = prefixOf(record);
    const all: { key: string; name: string; copy?: Copy }[] = [];
    let cursor: string | undefined;
    do {
      const page = await blobs.list({ prefix, ...(cursor === undefined ? {} : { cursor }) });
      for (const object of page.objects) {
        const name = object.key.slice(prefix.length);
        const dated = DATED.exec(name);
        /* THE DATE IN THE KEY IS THE DAY AND NOT THE INSTANT, and the instant is in the object's own
           `customMetadata.at`. Listing with metadata is a second R2 option per page for a field
           nothing on this path reads, so the day is what the list carries. */
        const copy = dated
          ? { id: name.slice(0, name.indexOf('.')), at: `${dated[1] ?? ''}T00:00:00.000Z`, bytes: object.size }
          : undefined;
        all.push({ key: object.key, name, ...(copy ? { copy } : {}) });
      }
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor !== undefined);
    return all;
  };

  const dated = (all: { copy?: Copy }[]): Copy[] =>
    all.flatMap((o) => (o.copy ? [o.copy] : [])).sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));

  const list = async (record: string): Promise<Copy[]> => dated(await held(record));

  const prune = async (record: string, keep = KEEP): Promise<void> => {
    const all = await held(record);
    const old = new Set(dated(all).slice(keep).map((copy) => copy.id));
    /* A DATED COPY PAST THE THIRTIETH, plus any pointer that is not the one this build writes.
       `latest` is outside the count on purpose: it is a pointer at one of the dated copies, so
       counting it would throw away a night every month. But a pointer under the OTHER extension is
       a leftover rather than a pointer, and leaving it is how an unsealed copy of a whole record
       outlives the day sealing was turned on. */
    const doomed = all
      .filter((o) => (o.copy ? old.has(o.copy.id) : (o.name === `latest${PLAIN}` || o.name === `latest${SEALED}`) && o.name !== latest))
      .map((o) => o.key);
    if (doomed.length > 0) await blobs.delete(doomed);
  };

  return {
    list,
    prune,

    async take(record: string, dump: Dump): Promise<Kept> {
      /* THE STRING IS NEVER ENCODED WHOLE ON WORKERD. It stays live for all of `take` whatever is
         done with it: the audit's probe dropped the caller's reference before `take` ran and the
         suspended frame still held the parameter, 120.8 MiB either way. So what can be cut is only
         what is made beside it, and here that is a count and then one 64 KiB piece per pull. */
      const utf8 = plainOf(dump.text);
      if (utf8.length > CEILING)
        throw new Error(
          `snapshot over 40 MiB: this record dumped ${String(utf8.length)} bytes and the Worker signs the whole file in memory. Raise the ceiling or stream it (51 §10).`,
        );

      const key = snapshotKey(record, dump.at, ext);
      const meta = {
        rows: String(dump.rows),
        bytes: String(utf8.length),
        at: dump.at,
        ...(dump.bookmark === undefined ? {} : { bookmark: dump.bookmark }),
      };
      const pointer = `${prefixOf(record)}${latest}`;

      /* THE DATED KEY FIRST AND `latest` SECOND. If the second put fails, `latest` still points at a
         copy that opens; the other order leaves the pointer naming an object nobody finished. */
      if (fixed && !seal) {
        /* SEALED AS R2 READS IT, so the sealed file is never whole in this isolate. Measured by
           `test/snapshots-stream.test.ts` at the 40 MiB ceiling: holding the sealed buffer for both
           puts was 80 MiB live while the bucket read, 40 above the plaintext; streamed it is 2 above
           it, which is a chunk and the queue behind it.

           AND `latest` IS READ BACK FROM THE DATED COPY, NOT SEALED A SECOND TIME. A stream reads
           once, and the binding has no server-side copy. Sealing again would cost the whole cipher
           over again, 1.8 s of CPU at the ceiling by `seal.ts`'s own measure, and would leave a
           pointer whose bytes differ from the copy it points at. One GET streams the same bytes
           through, and a dated copy that R2 did not keep is a throw here and not a pointer at nothing.

           AN UNSEALED COPY STREAMS THE SAME WAY, because it is the same string: putting it as one
           buffer would be the encoded file beside the string, which is the peak this path exists
           to avoid, on the deployments that chose not to seal. */
        const body = stream ? await stream(utf8) : streamOf(utf8);
        const r2 = blobs as StreamBlobs;
        await r2.put(key, fixed(body.stream, body.length), { customMetadata: meta });
        const copy = await r2.get(key);
        if (!copy?.body) throw new Error(`the copy just written to ${key} could not be read back to point latest at it`);
        await r2.put(pointer, fixed(copy.body, copy.size), { customMetadata: meta });
      } else {
        /* NO `FixedLengthStream`, which is Node, or a test's own `seal`: one buffer, put twice, as
           before streaming. */
        const file = new TextEncoder().encode(dump.text);
        const body = stream ? await drain(await stream(file)) : seal ? await seal(file) : file;
        await blobs.put(key, body, { customMetadata: meta });
        await blobs.put(pointer, body, { customMetadata: meta });
      }
      await prune(record);
      return { key, bytes: utf8.length, rows: dump.rows, at: dump.at };
    },
  };
}
