/**
 * A record whose dump is over the 32 MiB one Workers RPC value may be is still copied every night.
 *
 * MEASURED ON 22 OCT AT 03:17 UTC: the walk asked the owner's record for its dump as one value and the platform refused
 * it, "Serialized RPC arguments or return values are limited to 32MiB, but the size of this value was: 39667171 bytes",
 * and every night after. The object now streams its own copy into the bucket and hands back only what it came to, so
 * the stub below refuses any value over the limit, as workerd does, and the record is grown past it first.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { serialize } from 'node:v8';

import { checkBrainl, RecordChanged, type Signer } from '@braindog/kernel';
import type { Param, Sql } from '@braindog/ports';
import { createRecordApi } from '@braindog/record';

import { exportBrainl, signBrainl, streamBrainl, type PageSize, type Section } from '../../../packages/kernel/src/brainl.ts';
import { fixedClock, openSqlite } from '../../../packages/kernel/test/sqlite.ts';
import { keyStoreOf, recordKeys, type KeyStore } from '../src/keys.ts';
import { workerSigner } from '../src/sign.ts';
import { LATEST, prefixOf, r2Snapshots, steady, streamDumpOf, TRIES, type Fixed, type StreamBlobs } from '../src/snapshots.ts';
import { ageOpen, identity } from './age-open.ts';
import { cloud, type RecordStorage } from './cloud-harness.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const MiB = 1024 * 1024;
/** workerd's ceiling on one serialized RPC value. */
const RPC_MOST = 32 * MiB;
const AT = new Date(Date.UTC(2026, 9, 23, 3, 17)).toISOString();

type Held = Map<string, { bytes: Uint8Array; meta: Record<string, string> }>;

/** workerd's `FixedLengthStream`, standing in: the bytes through unchanged, and an error if the count is not the one promised. */
class FixedLengthStream extends TransformStream<Uint8Array, Uint8Array> {
  constructor(length: number) {
    let seen = 0;
    super({
      transform(chunk, out) {
        seen += chunk.length;
        if (seen > length) throw new Error(`the stream ran past the ${String(length)} bytes it promised`);
        out.enqueue(chunk);
      },
      flush() {
        if (seen !== length) throw new Error(`the stream ended at ${String(seen)} of the ${String(length)} bytes it promised`);
      },
    });
  }
}
const fixed: Fixed = (stream, length) => stream.pipeThrough(new FixedLengthStream(length));

/** R2's `put` and `get` over a Map: a stream is read through as R2 reads it, the largest piece noted, and kept only whole. */
function streaming(held: Held, largest: Map<string, number>) {
  return {
    async put(key: string, value: string | Uint8Array | ReadableStream<Uint8Array>, options?: { customMetadata?: Record<string, string> }) {
      let bytes: Uint8Array;
      if (value instanceof ReadableStream) {
        const parts: Uint8Array[] = [];
        let most = 0;
        for await (const chunk of value) {
          parts.push(chunk);
          most = Math.max(most, chunk.length);
        }
        bytes = new Uint8Array(Buffer.concat(parts));
        largest.set(key, most);
      } else bytes = typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value);
      held.set(key, { bytes, meta: options?.customMetadata ?? {} });
      return null;
    },
    async get(key: string) {
      const object = held.get(key);
      if (!object) return null;
      const body = new ReadableStream<Uint8Array>({ start: (c) => (c.enqueue(object.bytes), c.close()) });
      return { size: object.bytes.length, text: async () => new TextDecoder().decode(object.bytes), body };
    },
  };
}

/** What workerd answers for a value over the limit, word for word but the number. */
const refused = (n: number): string => `Serialized RPC arguments or return values are limited to 32MiB, but the size of this value was: ${String(n)} bytes.`;

/**
 * A record namespace whose stubs clone every argument and every answer at the boundary, with V8's own structured
 * serializer, and refuse one over the limit. `seen.largest` is the biggest value that crossed.
 */
function limited(namespace: { idFromName(name: string): string; get(id: string): object }) {
  const seen = { largest: 0 };
  const cross = (value: unknown): void => {
    let n: number;
    try {
      n = serialize(value).length;
    } catch {
      return;
    }
    seen.largest = Math.max(seen.largest, n);
    if (n > RPC_MOST) throw new Error(refused(n));
  };
  return {
    seen,
    cross,
    idFromName: (name: string) => namespace.idFromName(name),
    get: (id: string) =>
      new Proxy(namespace.get(id), {
        get(target, key) {
          const value: unknown = Reflect.get(target, key, target);
          if (typeof value !== 'function') return value;
          return async (...args: unknown[]) => {
            cross(args);
            const out: unknown = await (value as (...a: unknown[]) => Promise<unknown>).apply(target, args);
            cross(out);
            return out;
          };
        },
      }),
  };
}

/** The `Sql` port over a harness object's storage, for the whole-file export the copy is held to. */
const portOf = (storage: RecordStorage): Sql => ({
  exec: (text: string, ...params: Param[]) => void storage.sql.exec(text, ...(params as never[])),
  all: <T>(text: string, ...params: Param[]): T[] => storage.sql.exec(text, ...(params as never[])).toArray() as T[],
  one: <T>(text: string, ...params: Param[]): T | undefined => storage.sql.exec(text, ...(params as never[])).toArray()[0] as T | undefined,
  transactionSync: <T>(fn: () => T): T => storage.transactionSync(fn),
});

/** A body of about `n` units with what a real one holds: a dash, accents, an emoji, quotes, a backslash, a newline, a control. */
const bodyOf = (i: number, n: number): string => {
  const unit = `arrival ${String(i)} — “quoted” é ü 😀 \\ "x" \n\t\u0001 and plain words to carry the line `;
  return unit.repeat(Math.ceil(n / unit.length));
};

test('A RECORD WHOSE DUMP IS OVER 32 MiB IS COPIED BY THE NIGHT, AND NOTHING THAT CROSSES RPC COMES NEAR THE LIMIT', async () => {
  const id = identity();
  const kek = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex');
  const c = await cloud({ KEK: kek, AGE_RECIPIENT: id.recipient });
  const store = (await keyStoreOf(kek)) ?? assert.fail('no key store');
  await c.provision(REC, 'studio', 'ada@example.test', { keys: await recordKeys(store, REC) });

  /* GROWN PAST THE LIMIT IN ONE TABLE, a row of about 60 KB at a time, as raw arrivals grow a real record. */
  const storage = c.storages.get(REC) ?? assert.fail('the record has no storage');
  let grown = 0;
  for (let i = 0; grown < RPC_MOST + 4 * MiB; i++) {
    const body = bodyOf(i, 60_000);
    storage.sql.exec(
      "INSERT INTO inbox_raw (id, ts, channel, headers, body, sha256, state) VALUES (?, ?, 'api', ?, ?, ?, 'untriaged')",
      ...([`raw_${String(i).padStart(6, '0')}`, AT, '{"subject":"a big arrival"}', body, String(i).padStart(64, '0')] as never[]),
    );
    grown += Buffer.byteLength(body);
  }
  /* THE FILE THE WHOLE-FILE EXPORT MAKES OF IT, read before the night, which is what the copy must hold row for row. */
  const expected = await exportBrainl(portOf(storage), (fn) => storage.transactionSync(fn));

  const held = c.blobs.held;
  const largest = new Map<string, number>();
  Object.assign(c.blobs, streaming(held, largest));
  const rpc = limited(c.env['RECORD'] as { idFromName(name: string): string; get(id: string): object });
  c.env['RECORD'] = rpc;

  const said: Record<string, unknown>[] = [];
  const quiet = [console.log, console.error] as const;
  const platform = globalThis as { FixedLengthStream?: unknown };
  platform.FixedLengthStream = FixedLengthStream;
  console.log = console.error = (line: unknown) => {
    try {
      said.push(JSON.parse(String(line)) as Record<string, unknown>);
    } catch {
      /* Not one of the walk's lines. */
    }
  };
  try {
    await (c.bundle.default as unknown as { scheduled(c: object, env: object, ctx: object): Promise<void> }).scheduled({}, c.env, { waitUntil: () => {} });
  } finally {
    [console.log, console.error] = quiet;
    delete platform.FixedLengthStream;
  }

  const line = said.find((l) => l['op'] === 'walk' && l['rec'] === REC) ?? assert.fail(`the walk said nothing of the record: ${JSON.stringify(said)}`);
  assert.equal(line['backup'], 'ok', JSON.stringify(line));
  const key = `${prefixOf(REC)}nightly-${new Date().toISOString().slice(0, 10)}.brainl.age`;
  const kept = held.get(key) ?? assert.fail(`no night was kept: ${[...held.keys()].join(', ')}`);
  const plain = new Uint8Array(ageOpen(kept.bytes, id));
  assert.ok(plain.length > RPC_MOST, `the copy is ${String(plain.length)} bytes, which never tested the limit`);
  assert.equal(line['bytes'], plain.length, 'the walk line counts some other bytes than the copy holds');
  assert.equal(String(line['rows']), kept.meta['rows'], 'the walk line and the copy disagree on the rows');
  assert.equal(kept.meta['bytes'], String(plain.length));
  assert.match(kept.meta['bookmark'] ?? '', /^bm-/u, 'the copy was put without the bookmark it was taken at');
  assert.deepEqual(held.get(`${prefixOf(REC)}latest.brainl.age`)?.bytes, kept.bytes, 'latest is not the copy it points at');
  assert.ok(!held.has(`${prefixOf(REC)}${LATEST}`), 'a plaintext copy was put beside the sealed one');

  /* WHAT CROSSED RPC WAS THE ANSWER AND NOT THE FILE, and the file reached the bucket in pieces of one age chunk. */
  assert.ok(rpc.seen.largest < MiB, `${String(rpc.seen.largest)} bytes crossed RPC in one value`);
  assert.ok((largest.get(key) ?? Infinity) <= 64 * 1024 + 16, `a piece of ${String(largest.get(key))} bytes was put`);

  /* AND IT IS THE RECORD: the importer's own check passes, signature and manifest, and it is the whole-file export row
     for row, less the signature, which only the record's signer can add. */
  const lines = new TextDecoder().decode(plain).split('\n');
  const sound = await checkBrainl(lines);
  assert.ok(sound.ok, JSON.stringify(sound));
  const sig = lines.findIndex((l) => l.startsWith('#table dog_sig '));
  assert.ok(sig > 0 && lines.length === sig + 2, 'the copy does not end on one signature');
  const got = [...lines.slice(0, sig + 1), ...lines.slice(sig + 2)];
  const differs = got.findIndex((l, i) => l !== expected[i]);
  assert.ok(differs === -1 && got.length === expected.length, `the copy is not the whole-file export from line ${String(differs)}, ${String(got.length)} lines against ${String(expected.length)}`);

  /* AND THE LIMIT IS REAL HERE: the old shape, the whole file as one value, is refused by the stub the night went through. */
  assert.throws(() => rpc.cross({ text: expected.join('\n'), rows: 1, at: AT }), /limited to 32MiB/u);
});

/** A signature that is the same every time, so a streamed file and a whole one can be held to each other byte for byte. */
const sameSig: Signer = async (bytes) => ({
  keyId: '0123456789abcdef',
  publicKey: 'not-a-key',
  sig: createHash('sha256').update(bytes).digest('hex'),
  signedAt: '2026-10-23T03:17:00.000Z',
});

const testStore = async (): Promise<KeyStore> =>
  (await keyStoreOf(Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex'))) ?? assert.fail('no store');

/** A record over `node:sqlite` with its keys and the Worker's signer, as `test/snapshots.test.ts` makes one. */
async function made() {
  const sql = openSqlite();
  const store = await testStore();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.parse(AT)), sign: workerSigner(sql, () => Promise.resolve(store), () => REC) });
  const out = await api.createRecord({
    id: REC,
    slug: 'the-studio',
    name: 'The Studio',
    tz: 'UTC',
    locale: 'en',
    owner: { id: 'p_01JZ8QK3F7R2M9V4XN6TCB5HAO', email: 'ada@example.com', name: 'Ada' },
    keys: await recordKeys(store, REC),
  });
  assert.ok(out.ok, JSON.stringify(out));
  return { api, sql };
}

test('THE STREAMED FILE IS THE WHOLE-FILE EXPORT BYTE FOR BYTE, at every page size, redacted or not, a section or all', async () => {
  // Every edge the pages have: a key that is NULL at the end of a look, a full-text table read by rowid in id order, a
  // table without rowids read by range, a row larger than a slice, sealed bytes blanked, and pieces read at odd sizes.
  const { sql } = await made();
  const tx = <T>(fn: () => T): T => sql.transactionSync(fn);
  sql.exec("INSERT INTO dog_meta (key, value) VALUES (NULL, 'a value with no key')");
  for (const [rowid, entry] of [[90_011, 'e5'], [90_012, 'e1'], [90_013, 'e3'], [90_014, 'e2'], [90_015, 'e4']] as const)
    sql.exec('INSERT INTO entry_fts (rowid, id, register, text) VALUES (?, ?, ?, ?)', rowid, entry, 'notes', `text of ${entry} — é 😀`);
  for (let n = 0; n < 7; n++)
    sql.exec(
      "INSERT INTO metric_point (series, grain, at, value, unit, n, source, wrote_at) VALUES (?, 'day', ?, ?, 'count', NULL, 'test', ?)",
      `s${String(n % 3)}`,
      `2026-10-${String(10 + n)}`,
      n,
      AT,
    );
  for (let n = 0; n < 3; n++)
    sql.exec(
      "INSERT INTO inbox_raw (id, ts, channel, headers, body, sha256, state) VALUES (?, ?, 'paste', NULL, ?, ?, 'untriaged')",
      `raw_${String(n)}`,
      AT,
      bodyOf(n, n === 1 ? 5_000 : 30),
      `sha_${String(n)}`,
    );
  sql.exec(
    "INSERT INTO grant (id, label, opens, kind, ciphertext, nonce, kdf, wrapped_by, kek_id, created_at) VALUES ('g_1', 'A key', 'https://example.test', 'api_token', ?, ?, 'none', 'kek', 'k_1', ?)",
    new Uint8Array([1, 2, 3]),
    new Uint8Array([4, 5, 6]),
    AT,
  );

  const pages: PageSize[] = [{ look: 1, slice: 1 }, { look: 2, slice: 40 }, { look: 3, slice: 100_000 }];
  const asks: { sections?: Section[]; redactGrants?: boolean }[] = [{}, { redactGrants: true }, { sections: ['data'] }, { sections: ['origin', 'governance'] }];
  for (const page of pages)
    for (const ask of asks) {
      const whole = (await signBrainl(await exportBrainl(sql, tx, ask), sameSig)).join('\n');
      const file = await streamBrainl(sql, tx, { ...ask, sign: sameSig, page });
      const bytes = new Uint8Array(file.length);
      for (let at = 0; at < bytes.length; ) {
        const n = Math.min(bytes.length - at, 1 + (at % 977));
        file.read(bytes.subarray(at, at + n));
        at += n;
      }
      const said = `${JSON.stringify(ask)} at ${JSON.stringify(page)}`;
      assert.equal(new TextDecoder().decode(bytes), whole, said);
      const lines = whole.split('\n');
      const manifest: [string, number][] = [];
      for (const line of lines.slice(lines.findIndex((l) => l.startsWith('#table dog_manifest ')) + 1)) {
        if (line.startsWith('#')) break;
        const [name, rows] = JSON.parse(line) as [string, number];
        manifest.push([name, rows]);
      }
      assert.deepEqual(file.tables.map((t) => [t.name, t.rows]).sort(), manifest.sort(), `the counts handed back are not the manifest's, ${said}`);
    }
});

test('A WRITE BETWEEN THE TWO READS STOPS THAT COPY AND THE NEXT TRY KEEPS ONE; A RECORD THAT NEVER HOLDS STILL PUTS NOTHING', async () => {
  const { api, sql } = await made();
  const id = identity();
  const held: Held = new Map();
  const blobs: StreamBlobs = { ...streaming(held, new Map()), list: async () => ({ objects: [], truncated: false }), delete: async () => {} };
  const note = (n: number): void =>
    sql.exec("INSERT INTO event (id, ts, actor, kind, note) VALUES (?, ?, 'system', 'note', 'written between the two reads')", `ev_${String(n)}`, AT);

  let tries = 0;
  const kept = await steady(async () => {
    tries++;
    const dump = await streamDumpOf(api, AT);
    if (tries === 1) note(tries);
    return r2Snapshots(blobs, { recipient: id.recipient, fixed }).take(REC, dump);
  });
  assert.equal(tries, 2, 'the copy that saw the record change was kept, or no second try was made');
  const opened = new TextDecoder().decode(ageOpen(held.get(kept.key)?.bytes ?? assert.fail('no copy was kept'), id));
  const sound = await checkBrainl(opened.split('\n'));
  assert.ok(sound.ok, JSON.stringify(sound));
  assert.ok(opened.includes('"ev_1"'), 'the copy kept is not the record as it stood after the write');

  held.clear();
  let n = 0;
  await assert.rejects(
    steady(async () => {
      const dump = await streamDumpOf(api, AT);
      note(100 + ++n);
      return r2Snapshots(blobs, { recipient: id.recipient, fixed }).take(REC, dump);
    }),
    (e: unknown) => e instanceof RecordChanged && /changed while it was being copied \(event\)/u.test(e.message),
  );
  assert.equal(n, TRIES);
  assert.deepEqual([...held.keys()], [], 'a copy that saw the record change was put anyway');
});
