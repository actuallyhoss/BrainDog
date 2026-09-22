/**
 * The sealed nightly copy reaches R2 as a stream of known length, and `take` never holds it whole.
 *
 * WHY THIS FILE EXISTS. `test/seal-memory.test.ts` got the sealer down to its own output plus a few
 * MiB, and said in its header that the output itself was the floor "until `snapshots.ts` hands R2 a
 * stream". `take` then held that output beside the plaintext for both puts: at the 40 MiB ceiling
 * that is 80 MiB of the Worker's 128 MB before the dump string the Durable Object sent is counted.
 * What is held here is the other half, that the sealed bytes are made one chunk per pull and never
 * gathered, and that what arrives still opens with `age-open.ts`, which shares no code with the sealer.
 *
 * THE BUCKET HERE READS STREAMS AND THE ONE IN `snapshots.test.ts` DOES NOT, on purpose. That one
 * stands for a Node caller with no `FixedLengthStream`, which is every test file but this one, and
 * `take` still hands it bytes. This one stands for R2, which takes a `ReadableStream` only when its
 * length is known in advance, so the wrapper below refuses a stream that ends short or runs long,
 * as workerd's `FixedLengthStream` does.
 *
 * WHAT IS MEASURED IS LIVE MEMORY WHILE THE BUCKET READS, NOT PEAK RESIDENT MEMORY. The first draft
 * of this test used `maxRSS`, as `seal-memory.test.ts` does, and against the buffered `take` it read
 * 3.2 MiB above the plaintext and passed: building the 40 MiB dump had already raised the high-water
 * mark by more than the sealed buffer did. Sampled inside `put` after a collection, the same code
 * held 80 MiB, 40 above the plaintext, which is the sealed copy it was not supposed to have.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';

import { CEILING, r2Snapshots, snapshotKey, type Fixed, type StreamBlobs } from '../src/snapshots.ts';
import { ageOpen, identity } from './age-open.ts';

const MiB = 1024 * 1024;

/* A COLLECTION BEFORE EACH SAMPLE, because what is asked is what `take` HOLDS. The first run of this
   test without one read 32 MiB above the plaintext on the streaming path, and all of it was spent
   chunks and cipher scratch no longer reachable, which V8 had not yet had a reason to collect. A
   sealed buffer that is held survives a collection, and that is the difference this test is for. */
setFlagsFromString('--expose-gc');
const gc = runInNewContext('gc') as () => void;
const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const AT = new Date(Date.UTC(2026, 8, 22, 3, 17)).toISOString();

/** A stand-in for workerd's `FixedLengthStream`: bytes through unchanged, and an error if the count is not the one promised. */
const fixedLength = (declared: number[]): Fixed => (stream, length) => {
  declared.push(length);
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

type Put = { key: string; streamed: boolean; bytes: number; largest: number; held?: Uint8Array };

/**
 * An R2 stand-in that reads a stream the way R2 would, a chunk at a time, and records the largest
 * single piece it was handed. `keep` decides whether the bytes are kept: the memory test cannot
 * keep 40 MiB of them without measuring its own bucket.
 */
function streamingBucket(keep: boolean) {
  const puts: Put[] = [];
  const mark = { held: 0 };
  let pulls = 0;
  const sample = (): void => {
    if (pulls++ % 16 !== 0) return;
    gc();
    const now = process.memoryUsage();
    mark.held = Math.max(mark.held, now.arrayBuffers + now.heapUsed);
  };
  const blobs: StreamBlobs & { puts: Put[]; mark: typeof mark } = {
    puts,
    mark,
    async put(key, value) {
      sample();
      if (typeof value === 'string' || value instanceof Uint8Array) {
        const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
        puts.push({ key, streamed: false, bytes: bytes.length, largest: bytes.length, ...(keep ? { held: bytes } : {}) });
        return null;
      }
      const parts: Uint8Array[] = [];
      let bytes = 0;
      let largest = 0;
      for await (const chunk of value) {
        bytes += chunk.length;
        largest = Math.max(largest, chunk.length);
        sample();
        if (keep) parts.push(chunk);
      }
      puts.push({ key, streamed: true, bytes, largest, ...(keep ? { held: new Uint8Array(Buffer.concat(parts)) } : {}) });
      return null;
    },
    get(key) {
      const put = puts.findLast((p) => p.key === key);
      if (!put) return Promise.resolve(null);
      const size = put.bytes;
      /* WITHOUT `keep` THE BODY IS ZEROS OF THE RIGHT LENGTH. What the memory test measures is what
         `take` holds, and the round trip below is where the bytes of `latest` are checked. */
      const body = put.held
        ? new ReadableStream<Uint8Array>({ start: (c) => (c.enqueue(put.held ?? new Uint8Array(0)), c.close()) })
        : zeros(size);
      return Promise.resolve({ size, text: () => Promise.resolve(''), body });
    },
    list: () => Promise.resolve({ objects: [], truncated: false }),
    delete: () => Promise.resolve(),
  };
  return blobs;
}

const zeros = (size: number): ReadableStream<Uint8Array> => {
  let left = size;
  return new ReadableStream<Uint8Array>({
    pull(c) {
      if (left === 0) return c.close();
      const n = Math.min(left, 64 * 1024);
      left -= n;
      c.enqueue(new Uint8Array(n));
    },
  });
};

test('A SEALED COPY AT THE CEILING PEAKS AT THE PLAINTEXT PLUS A SMALL CONSTANT, NOT THE PLAINTEXT AND ITS CIPHERTEXT', async (t) => {
  const id = identity();
  const declared: number[] = [];
  const blobs = streamingBucket(false);
  const copies = r2Snapshots(blobs, { recipient: id.recipient, fixed: fixedLength(declared) });
  const text = 'x'.repeat(CEILING);
  text.charCodeAt(CEILING - 1);

  gc();
  const start = process.memoryUsage();
  await copies.take(REC, { text, rows: 1, at: AT });
  const peak = blobs.mark.held - (start.arrayBuffers + start.heapUsed);

  const over = (peak - CEILING) / MiB;
  const largest = Math.max(...blobs.puts.map((p) => p.largest));
  const said = `held ${(peak / MiB).toFixed(1)} MiB while the bucket read, ${over.toFixed(1)} above the ${(CEILING / MiB).toFixed(0)} MiB plaintext; largest piece put ${(largest / 1024).toFixed(1)} KiB`;
  t.diagnostic(said);
  assert.ok(blobs.puts.length === 2 && blobs.puts.every((p) => p.streamed), `a sealed copy was put as one buffer: ${said}`);
  assert.ok(largest <= 64 * 1024 + 16, `a piece larger than one age chunk was put: ${said}`);
  assert.ok(over < 16, said);
  assert.deepEqual(declared, [blobs.puts[0]?.bytes, blobs.puts[0]?.bytes], 'the length R2 was promised is not the length it got');
});

test('EVERY LENGTH WITH AN EDGE STILL OPENS, AND LATEST IS THE SAME BYTES AS THE DATED COPY', async () => {
  // The age payload has three edges worth a case each: an empty file is one empty final chunk, an
  // exact multiple of 64 KiB ends on a full chunk that carries the final flag, and one byte past it
  // is a final chunk of one byte. `age-open.ts` refuses the wrong one at each, with OpenSSL's tag check.
  const id = identity();
  for (const length of [0, 1, 64 * 1024, 64 * 1024 + 1, 3 * 64 * 1024 + 5]) {
    const declared: number[] = [];
    const blobs = streamingBucket(true);
    const text = Array.from({ length }, (_, i) => String.fromCharCode(97 + (i % 26))).join('');
    const kept = await r2Snapshots(blobs, { recipient: id.recipient, fixed: fixedLength(declared) }).take(REC, { text, rows: 1, at: AT });

    assert.equal(kept.key, snapshotKey(REC, AT, '.brainl.age'));
    assert.deepEqual(blobs.puts.map((p) => [p.key, p.streamed]), [
      [kept.key, true],
      [`${REC}/snapshots/latest.brainl.age`, true],
    ]);
    const [dated, latest] = blobs.puts.map((p) => p.held ?? new Uint8Array(0));
    assert.equal(ageOpen(dated ?? new Uint8Array(0), id).toString('latin1'), text, `the dated copy of ${String(length)} bytes did not open to the dump`);
    assert.deepEqual(latest, dated, 'latest is not the copy it points at');
  }
});
