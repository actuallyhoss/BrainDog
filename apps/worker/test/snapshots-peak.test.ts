/**
 * The nightly `take` at the snapshot ceiling, counted from before the dump string exists.
 *
 * WHY THIS FILE AND NOT ANOTHER CASE IN `snapshots-stream.test.ts`. That test builds its 40 MiB of
 * `x` before it takes a baseline, so the string the Durable Object hands the Worker is never in its
 * figure, and its text is all Latin-1, which V8 keeps at one byte a character. What that
 * leaves out was measured: with one U+2014 in the dump V8 holds the string at two
 * bytes a character, 80 MiB, and `take` encoded all of it into a 40 MiB file beside it, 120.8 MiB of
 * a 128 MB (122 MiB) isolate. A real record's dump has a dash or a curly quote in it somewhere, so
 * the two-byte string is the ordinary case and not the pathological one.
 *
 * WHY PEAK RESIDENT MEMORY, AS `seal-memory.test.ts` DOES. The string is the one thing here that
 * cannot be sampled away: it is live for the whole of `take`, so the operating system's own
 * high-water mark sees the string and everything held beside it at once. The baseline is the
 * current resident size after a collection, taken BEFORE the string is built, and the figure is
 * the high-water mark afterwards less that. It can only overstate, never hide a peak.
 *
 * ONE MEASUREMENT IN THIS FILE, AND IT RUNS FIRST. `maxRSS` never comes back down, so a second
 * measurement in the same process would be read against the first one's mark. The byte-identity
 * cases below are small and run after it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';

import { CEILING, r2Snapshots, type Fixed, type StreamBlobs } from '../src/snapshots.ts';
import { ageOpen, identity } from './age-open.ts';

setFlagsFromString('--expose-gc');
const gc = runInNewContext('gc') as () => void;

const MiB = 1024 * 1024;
/** A Worker's memory, 128 MB, in the unit everything else here is in. */
const ISOLATE = 128e6 / MiB;
const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const AT = new Date(Date.UTC(2026, 8, 22, 3, 17)).toISOString();

/** workerd's `FixedLengthStream`, standing in: the bytes through unchanged, and a throw if the count is not the one promised. */
const fixed: Fixed = (stream, length) => {
  let seen = 0;
  return stream.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, out) {
        seen += chunk.length;
        if (seen > length) throw new Error(`the stream ran past the ${String(length)} bytes it promised`);
        out.enqueue(chunk);
      },
      flush() {
        if (seen !== length) throw new Error(`the stream ended at ${String(seen)} of the ${String(length)} bytes it promised`);
      },
    }),
  );
};

/** An R2 stand-in that reads every stream through. `keep` holds the bytes, which the memory case cannot afford to. */
function bucket(keep: boolean) {
  const puts: { key: string; bytes: number; streamed: boolean; held?: Uint8Array }[] = [];
  const blobs: StreamBlobs = {
    async put(key, value) {
      if (typeof value === 'string' || value instanceof Uint8Array) {
        const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
        puts.push({ key, bytes: bytes.length, streamed: false, ...(keep ? { held: bytes } : {}) });
        return null;
      }
      const parts: Uint8Array[] = [];
      let bytes = 0;
      for await (const chunk of value) {
        bytes += chunk.length;
        if (keep) parts.push(chunk);
      }
      puts.push({ key, bytes, streamed: true, ...(keep ? { held: new Uint8Array(Buffer.concat(parts)) } : {}) });
      return null;
    },
    get(key) {
      const put = puts.findLast((p) => p.key === key);
      if (!put) return Promise.resolve(null);
      let left = put.bytes;
      const held = put.held;
      /* WITHOUT `keep` THE BODY IS ONE PIECE OF ZEROS ENQUEUED OVER AND OVER. A fresh piece per pull
         was tried first and read 41.4 MiB above the string on one run and 32.8 on the next: 40 MiB
         of the bucket's own garbage the collector had not reached, which is this stand-in's cost
         and not `take`'s. Nothing downstream keeps a piece, so one is enough. */
      const zeros = new Uint8Array(64 * 1024);
      const body = held
        ? new ReadableStream<Uint8Array>({ start: (c) => (c.enqueue(held), c.close()) })
        : new ReadableStream<Uint8Array>({
            pull(c) {
              if (left === 0) return c.close();
              const n = Math.min(left, zeros.length);
              left -= n;
              c.enqueue(zeros.subarray(0, n));
            },
          });
      return Promise.resolve({ size: put.bytes, text: () => Promise.resolve(''), body });
    },
    list: () => Promise.resolve({ objects: [], truncated: false }),
    delete: () => Promise.resolve(),
  };
  return { blobs, puts };
}

test('A SEALED COPY OF A TWO-BYTE DUMP AT THE CEILING PEAKS WELL INSIDE THE ISOLATE, THE STRING COUNTED', async (t) => {
  const id = identity();
  const { blobs, puts } = bucket(false);
  const copies = r2Snapshots(blobs, { recipient: id.recipient, fixed });

  gc();
  const before = process.memoryUsage().rss;
  /* ONE U+2014 PER MiB, so the file is exactly the ceiling and the string is two bytes a character.
     Built by `repeat` from a 1 MiB unit and not by appending one dash to 40 MiB of `x`, because
     flattening that would hold the one-byte original and the two-byte copy at once, 120 MiB of
     this test's own making before `take` is called. */
  const text = `—${'x'.repeat(MiB - 3)}`.repeat(CEILING / MiB);
  text.charCodeAt(text.length - 1);
  await copies.take(REC, { text, rows: 1, at: AT });
  const peak = (process.resourceUsage().maxRSS * 1024 - before) / MiB;

  const string = (text.length * 2) / MiB;
  const said = `peak ${peak.toFixed(1)} MiB above nothing, ${(peak - string).toFixed(1)} above the ${string.toFixed(1)} MiB string, against a ${ISOLATE.toFixed(1)} MiB isolate`;
  t.diagnostic(said);
  assert.equal(puts[0]?.streamed, true, 'the sealed copy was put as one buffer');
  /* THE STRING IS THE FLOOR: the Durable Object sent it and nothing in the Worker can make it
     smaller. Encoding the whole file beside it measured 133.1 and 133.7 MiB here, 53 above the
     string, which is the file plus the sealed chunks the collector had not yet reached. Streamed
     from the string it measured 93.2 to 93.7, 13 above, and most of that is the same unreached
     chunks, which a peak resident figure counts and a live one would not. The bounds sit between
     the two, and the second is the one that matters: room left in the isolate, string included. */
  assert.ok(peak - string < 24, said);
  assert.ok(peak < ISOLATE - 16, said);
});

test('THE BYTES STREAMED FROM THE STRING ARE THE BYTES `TextEncoder` WRITES, WHEREVER A CHARACTER STRADDLES A CHUNK', async () => {
  // A character that does not fit the rest of a 64 KiB chunk has to be split across two of them,
  // byte by byte, and a surrogate pair split between two slices of the string must not become two
  // replacement characters. Each case puts one of those at, or one either side of, the boundary.
  const id = identity();
  const K = 64 * 1024;
  const cases = [
    '',
    'a',
    `${'a'.repeat(K - 1)}—tail`,
    `${'a'.repeat(K - 2)}—tail`,
    `${'a'.repeat(K - 1)}\u{1F600}tail`,
    `${'a'.repeat(K - 3)}\u{1F600}tail`,
    `${'a'.repeat(K - 1)}é`,
    `${'—'.repeat(K)}\u{1F600}`,
    `${'\u{1F600}'.repeat(K / 2 + 3)}`,
    `lone \ud800 high, lone \udc00 low, ${'b'.repeat(K)}\ud83d`,
    'z'.repeat(3 * K),
  ];
  for (const text of cases) {
    const expected = new TextEncoder().encode(text);

    const sealed = bucket(true);
    const kept = await r2Snapshots(sealed.blobs, { recipient: id.recipient, fixed }).take(REC, { text, rows: 1, at: AT });
    assert.equal(kept.bytes, expected.length, `the byte count of a ${String(text.length)}-unit dump is not TextEncoder's`);
    const [dated, latest] = sealed.puts.map((p) => p.held ?? new Uint8Array(0));
    assert.deepEqual(new Uint8Array(ageOpen(dated ?? new Uint8Array(0), id)), expected, `a sealed ${String(text.length)}-unit dump did not open to its UTF-8`);
    assert.deepEqual(latest, dated, 'latest is not the copy it points at');

    const plain = bucket(true);
    await r2Snapshots(plain.blobs, { fixed }).take(REC, { text, rows: 1, at: AT });
    assert.deepEqual(plain.puts.map((p) => p.streamed), [true, true], 'an unsealed copy on workerd was put as one buffer');
    assert.deepEqual(plain.puts[0]?.held, expected, `an unsealed ${String(text.length)}-unit dump is not its UTF-8`);
  }
});
