/**
 * What the sealer costs in memory at the snapshot ceiling, measured rather than argued.
 *
 * WHY THIS IS A TEST AND NOT A NOTE. A Worker has 128 MB, and `snapshots.ts` lets a dump reach
 * 40 MiB before it refuses. Measured on Node 24 against the sealer as it was, a 40 MiB dump raised
 * the process's peak resident memory by 86 MiB above the plaintext it was handed, and 80 MiB of
 * buffers were still held when `seal` returned: every chunk's ciphertext was kept in an array and
 * then copied once more into the file. Plaintext plus that is about 126 MiB, which is the whole
 * Worker. Nothing about a sealer that works makes the number go back up, so it is held here.
 *
 * WHY PEAK RESIDENT MEMORY AND NOT A SAMPLER. The sealing loop is synchronous, so a timer on this
 * thread never fires inside it, and `process.memoryUsage()` read afterwards sees only what survived.
 * `process.resourceUsage().maxRSS` is the operating system's own high-water mark, on Windows and
 * Linux alike, and `node --test` runs this file in a process of its own, so the mark before the seal
 * is this file's and nobody else's.
 *
 * WHAT CANNOT GO: the sealed file itself. `Seal` returns one buffer, and a buffer as long as the dump
 * is the floor until `snapshots.ts` hands R2 a stream. So the figure held is the peak above the
 * plaintext AND the output, and the bound is loose on purpose: after the change it measured 3.6
 * MiB, before it measured 49, and 16 sits well clear of both.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CEILING } from '../src/snapshots.ts';
import { recipientOf, sealTo } from '../src/seal.ts';
import { ageOpen, identity } from './age-open.ts';

const MiB = 1024 * 1024;

test('SEALING A DUMP AT THE CEILING PEAKS AT ITS OWN OUTPUT PLUS A SMALL CONSTANT, NOT A MULTIPLE OF THE DUMP', async (t) => {
  const id = identity();
  const seal = sealTo(recipientOf(id.recipient) as Uint8Array);
  /* Filled, so every page of the plaintext is resident before the mark is read. */
  const plain = new Uint8Array(CEILING);
  for (let i = 0; i < plain.length; i += 4096) plain[i] = i & 0xff;

  const before = process.resourceUsage().maxRSS * 1024;
  const heldBefore = process.memoryUsage();
  const sealed = await seal(plain);
  const peak = process.resourceUsage().maxRSS * 1024 - before;
  const heldAfter = process.memoryUsage();
  const held = heldAfter.arrayBuffers + heldAfter.heapUsed - (heldBefore.arrayBuffers + heldBefore.heapUsed);

  const over = (peak - sealed.length) / MiB;
  const kept = (held - sealed.length) / MiB;
  const said = `peak ${(peak / MiB).toFixed(1)} MiB, ${over.toFixed(1)} above the ${(sealed.length / MiB).toFixed(1)} MiB output; still held ${kept.toFixed(1)} MiB beyond it`;
  assert.ok(over < 16, said);
  assert.ok(kept < 16, said);
  t.diagnostic(said);

  /* AND IT STILL OPENS. A sealer made lean by writing something else is not the sealer. */
  assert.deepEqual(ageOpen(sealed, id), Buffer.from(plain));
});
