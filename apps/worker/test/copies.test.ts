/**
 * The Cloud's copies as the record's `Snapshots` port, and going back to one through PITR.
 *
 * THE RESTORE HALF RUNS AGAINST A FAKE STORAGE, AND THAT IS A LIMIT OF THE TOOL AND NOT A CHOICE.
 * Local workerd cannot do point-in-time recovery: in miniflare `5.20260903.0-alpha` a Durable Object
 * answered `getCurrentBookmark`, and `getBookmarkForTime` and `onNextSessionRestoreBookmark` threw
 * "This Durable Object's storage back-end does not implement point-in-time recovery"
 * (measured). So what is proved here is everything on this side
 * of the platform: which bookmark is handed over, what is put first, what is refused and what is
 * kept. Whether the object then comes back at that bookmark is proved on alpha, by one restore of an
 * alpha record, and nowhere else. No Durable Object is faked: the storage below is the three PITR
 * methods and nothing more, which is all the port is given.
 *
 * THE RECORD IS REAL, as in `test/snapshots.test.ts`: `createRecordApi` over `node:sqlite` with the
 * Worker's keys and signer, and the port handed to it the way `Record$` will, so the `before-restore`
 * copy and the order of the calls are the record's own and not a script of what it might do.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { checkBrainl } from '@braindog/kernel';
import { createRecordApi } from '@braindog/record';
import type { Snapshot } from '@braindog/ports';

import { fixedClock, openSqlite } from '../../../packages/kernel/test/sqlite.ts';
import { keyStoreOf, recordKeys, type KeyStore } from '../src/keys.ts';
import { workerSigner } from '../src/sign.ts';
import { dumpOf, KEEP, LATEST, prefixOf, type Blobs, type Dump } from '../src/snapshots.ts';
import { cloudSnapshots, WINDOW, type CloudCopy } from '../src/copies.ts';
import { ageOpen, identity } from './age-open.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const OWNER = 'p_01JZ8QK3F7R2M9V4XN6TCB5HAO';
const NOW = Date.UTC(2026, 8, 23, 3, 17);
const DAY = 86_400_000;
const PREFIX = prefixOf(REC);
const owner = { principal: { kind: 'person' as const, id: OWNER, level: 'owner' as const } };

/** What the port's sentences are refused as, when the record carries them back. */
type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string } };

const testStore = async (): Promise<KeyStore> =>
  (await keyStoreOf(Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex'))) ?? assert.fail('no store');

/**
 * R2's five methods over a Map, with one log the storage below writes to as well.
 *
 * `customMetadata` COMES BACK FROM `list` ONLY WHEN IT WAS ASKED FOR, as R2's does: without the
 * `include` option an R2 listing carries keys and sizes and nothing else. A bucket that always
 * answered with the metadata would let a `list` that never asked for it pass here and show no
 * bookmark on the Cloud, which is the gap that was measured before this.
 */
function bucket(log: string[], fail?: (key: string) => boolean) {
  const held = new Map<string, { bytes: Uint8Array; meta: Record<string, string> }>();
  const blobs: Blobs & { held: typeof held } = {
    held,
    put(key, value, options) {
      if (fail?.(key)) return Promise.reject(new Error(`the bucket refused ${key}`));
      const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value);
      held.set(key, { bytes, meta: options?.customMetadata ?? {} });
      log.push(`put ${key.slice(PREFIX.length)}`);
      return Promise.resolve(null);
    },
    get(key) {
      const object = held.get(key);
      return Promise.resolve(object ? { size: object.bytes.length, text: () => Promise.resolve(new TextDecoder().decode(object.bytes)) } : null);
    },
    list(options) {
      const prefix = options?.prefix ?? '';
      const meta = options?.include?.includes('customMetadata') ?? false;
      const objects = [...held.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, object]) => ({ key, size: object.bytes.length, ...(meta ? { customMetadata: object.meta } : {}) }))
        .sort((a, b) => (a.key < b.key ? -1 : 1));
      return Promise.resolve({ objects, truncated: false as const });
    },
    delete(keys) {
      for (const key of typeof keys === 'string' ? [keys] : keys) held.delete(key);
      return Promise.resolve();
    },
  };
  return blobs;
}

/**
 * The three PITR methods of `ctx.storage`, and not the object they belong to.
 *
 * `getBookmarkForTime` IS HERE SO THAT NOT CALLING IT IS SOMETHING A TEST CAN SEE. A copy is gone
 * back to by the bookmark it recorded when it was taken; looking one up by the copy's instant would
 * land a moment after the dump, on whatever was written while the copy was being put.
 */
function pitr(log: string[], o: { none?: boolean } = {}) {
  let n = 0;
  const asked: unknown[] = [];
  const storage = {
    getCurrentBookmark(): Promise<string> {
      if (o.none) return Promise.reject(new Error("This Durable Object's storage back-end does not implement point-in-time recovery"));
      return Promise.resolve(`bm-${String(++n).padStart(4, '0')}`);
    },
    getBookmarkForTime(at: number | Date): Promise<string> {
      asked.push(at);
      return Promise.resolve('bm-by-time');
    },
    onNextSessionRestoreBookmark(bookmark: string): Promise<string> {
      log.push(`arm ${bookmark}`);
      return Promise.resolve(`undo-${bookmark}`);
    },
  };
  return { storage, asked };
}

/** A record with its keys wrapped and the Worker's signer, and the port handed in as `Record$` will. */
async function record(o: { recipient?: string; none?: boolean; fail?: (key: string) => boolean } = {}) {
  const log: string[] = [];
  const blobs = bucket(log, o.fail);
  const { storage, asked } = pitr(log, o.none ? { none: true } : {});
  let now = NOW;
  const sql = openSqlite();
  const store = await testStore();
  /* THE PORT IS BUILT BEFORE THE RECORD IT DUMPS, because `createRecordApi` takes it, so the dump
     reaches the record through a variable filled in one line later. `Record$` has the same order. */
  let dumped: { kernel: Parameters<typeof dumpOf>[0]['kernel'] } | undefined;
  const port = cloudSnapshots(blobs, storage, (at, bookmark) => dumpOf(dumped ?? assert.fail('dumped before the record existed'), at, bookmark), {
    record: REC,
    now: () => now,
    ...(o.recipient ? { recipient: o.recipient } : {}),
  });
  const api = await createRecordApi({
    sql,
    clock: { now: () => now } as ReturnType<typeof fixedClock>,
    sign: workerSigner(sql, () => Promise.resolve(store), () => REC),
    snapshots: port,
  });
  dumped = api;
  const made = await api.createRecord({
    id: REC,
    slug: 'the-studio',
    name: 'The Studio',
    tz: 'UTC',
    locale: 'en',
    owner: { id: OWNER, email: 'ada@example.com', name: 'Ada' },
    keys: await recordKeys(store, REC),
  });
  assert.ok(made.ok, JSON.stringify(made));
  return { api, sql, port, blobs, log, asked, later: (ms: number) => void (now += ms) };
}

/** The same port over a dump that costs nothing, for the tests that take forty copies. */
function cheap(blobs: Blobs, storage: ReturnType<typeof pitr>['storage'], clock: { now: number }) {
  const dump = (at: string, bookmark: string | undefined): Promise<Dump> =>
    Promise.resolve({ text: `#dogl 1\n["${at}"]`, rows: 1, at, ...(bookmark === undefined ? {} : { bookmark }) });
  return cloudSnapshots(blobs, storage, dump, { record: REC, now: () => clock.now });
}

test('A COPY IS LISTED WITH THE BOOKMARK IT WAS TAKEN AT, ITS ROWS AND ITS INSTANT, read from its own metadata', async () => {
  // MEASURED BEFORE THIS: `r2Snapshots(...).list` answered
  // `{"id":"nightly-2026-09-23","at":"2026-09-23T00:00:00.000Z","bytes":9141}`, midnight and no
  // bookmark, because it read keys only. A restore through PITR needs the bookmark, and it is in the
  // object's `customMetadata`, which an R2 listing carries only when asked.
  const { api, port, blobs } = await record();
  const took = (await api.snapshot({ label: 'nightly' }, owner)) as Out;
  assert.ok(took.ok, JSON.stringify(took));

  const listed = (await port.list()) as CloudCopy[];
  assert.equal(listed.length, 1);
  const [copy] = listed;
  assert.equal(copy?.id, 'nightly-2026-09-23');
  assert.equal(copy?.at, new Date(NOW).toISOString(), 'the instant is the one the copy was taken at, not the midnight of its key');
  assert.equal(copy?.bookmark, 'bm-0001');
  assert.equal(copy?.label, 'nightly');
  const meta = blobs.held.get(`${PREFIX}nightly-2026-09-23.brainl`)?.meta ?? assert.fail('the nightly copy is not where the walk writes it');
  assert.equal(String(copy?.rows), meta.rows);
  assert.ok(blobs.held.has(`${PREFIX}${LATEST}`), 'a nightly copy taken through the port moved latest, as the walk does');
});

test('A LABELLED COPY IS SEALED UNDER ITS OWN NAME, OPENS TO A FILE THAT IMPORTS, AND LEAVES LATEST ALONE', async () => {
  const id = identity();
  const { api, blobs } = await record({ recipient: id.recipient });
  const took = (await api.snapshot({ label: 'now' }, owner)) as Out;
  assert.ok(took.ok, JSON.stringify(took));
  assert.equal((took.value as Snapshot).id, 'now-2026-09-23');

  assert.deepEqual([...blobs.held.keys()], [`${PREFIX}now-2026-09-23.brainl.age`], 'a copy taken by hand is one object, and latest is still last night');
  const stored = blobs.held.get(`${PREFIX}now-2026-09-23.brainl.age`)?.bytes ?? new Uint8Array(0);
  assert.equal((took.value as Snapshot).bytes, stored.length, 'take and list must agree on how large a copy is');
  assert.equal(Buffer.from(stored.subarray(0, 22)).toString(), 'age-encryption.org/v1\n');
  const sound = await checkBrainl(ageOpen(stored, id).toString('utf8').split('\n'));
  assert.ok(sound.ok, JSON.stringify(sound));
});

test('ONLY NIGHTLY COPIES COUNT TOWARD THE THIRTY NIGHTS, and a copy taken by hand is never what pushes one out', async () => {
  const log: string[] = [];
  const blobs = bucket(log);
  const { storage } = pitr(log);
  const clock = { now: Date.UTC(2026, 7, 1, 3, 17) };
  const port = cheap(blobs, storage, clock);

  await port.take('now');
  for (let n = 0; n < KEEP + 5; n++) {
    await port.take('nightly');
    clock.now += DAY;
  }
  const listed = (await port.list()) as CloudCopy[];
  assert.equal(listed.filter((c) => c.label === 'nightly').length, KEEP);
  assert.ok(listed.some((c) => c.id === 'now-2026-08-01'), 'thirty-five nights pruned the copy taken by hand');
  assert.equal(listed[0]?.id, `nightly-${new Date(clock.now - DAY).toISOString().slice(0, 10)}`, 'the newest is first');

  /* AND THE OTHERS ARE THIRTY OF THEIR OWN, as on the self-host, or a record whose owner takes a
     copy before every big change would grow without end in a bucket nobody looks at. A copy taken
     just before a restore prunes nothing, so the copy being gone back to is never the one it
     pushes out. */
  for (let n = 0; n < KEEP; n++) await port.take('now');
  const others = ((await port.list()) as CloudCopy[]).filter((c) => c.label !== 'nightly');
  assert.equal(others.length, KEEP);
  assert.ok(!others.some((c) => c.id === 'now-2026-08-01'), 'the oldest copy taken by hand outlived thirty newer ones');
  /* AND THE THIRTY NEWER ONES PUSHED OUT NO NIGHT. Without this line the test passed with the
     `nightly` filter taken out of the prune of the others: thirty copies taken by hand were then the
     thirty newest objects under the prefix, and every night went. */
  assert.equal(((await port.list()) as CloudCopy[]).filter((c) => c.label === 'nightly').length, KEEP, 'thirty copies taken by hand pruned the nights');
  await port.take('before-restore');
  assert.equal(((await port.list()) as CloudCopy[]).filter((c) => c.label !== 'nightly').length, KEEP + 1);
});

test('TWO COPIES WITH ONE LABEL ON ONE DAY ARE TWO COPIES, so a second restore keeps the first one\'s undo', async () => {
  // The key is `<label>-<date>`, and a day is long. Two restores in one afternoon (the wrong copy,
  // then the right one) took two `before-restore` copies under one key, and the second overwrote
  // the first: the state before either restore, which is the one worth having, was gone.
  const log: string[] = [];
  const blobs = bucket(log);
  const { storage } = pitr(log);
  const port = cheap(blobs, storage, { now: NOW });
  const first = await port.take('before-restore');
  const second = await port.take('before-restore');
  assert.deepEqual([first.id, second.id], ['before-restore-2026-09-23', 'before-restore-2026-09-23-2']);
  assert.deepEqual(
    ((await port.list()) as CloudCopy[]).map((c) => [c.id, c.bookmark]),
    [
      ['before-restore-2026-09-23-2', 'bm-0002'],
      ['before-restore-2026-09-23', 'bm-0001'],
    ],
  );
});

test('GOING BACK: THE RECORD AS IT IS IS PUT FIRST, THEN THE CHOSEN COPY\'S OWN BOOKMARK IS ARMED, AND THE UNDO IS KEPT', async () => {
  const { api, sql, port, blobs, log, asked, later } = await record();
  assert.ok(((await api.snapshot({ label: 'nightly' }, owner)) as Out).ok);
  later(DAY);
  log.length = 0;

  const out = (await api.restore({ bookmark: 'nightly-2026-09-23' }, owner)) as Out;
  assert.ok(out.ok, JSON.stringify(out));
  assert.equal((out.value as { kept: string }).kept, 'before-restore-2026-09-24');
  /* NOTHING IS WRITTEN INTO THE OBJECT AFTER IT IS ARMED, because PITR throws this object's rows away
     when it reopens. Before the port said `reopens`, the record took it for one that puts rows back
     in place and wrote `restore.pitr` here, one row, into the object about to be replaced. */
  assert.equal(sql.one<{ n: number }>("SELECT count(*) AS n FROM event WHERE kind = 'restore.pitr'")?.n, 0, 'the object PITR is about to replace was written to');

  const receipt = log.find((line) => line.startsWith('put restore-')) ?? assert.fail(`no receipt in ${log.join(', ')}`);
  assert.deepEqual(log, ['put before-restore-2026-09-24.brainl', 'arm bm-0001', receipt], 'the copy of what the record was is put before anything is armed');
  assert.deepEqual(asked, [], 'a copy was looked up by its time and not by the bookmark it recorded');

  /* THE UNDO SURVIVES THE ABORT BECAUSE IT IS IN THE BUCKET. The object's own storage is what is
     about to be rewound, and its memory goes with the restart, so R2 is the one place that keeps it. */
  const kept = blobs.held.get(`${PREFIX}${receipt.slice('put '.length)}`) ?? assert.fail('the receipt was not kept');
  assert.deepEqual(JSON.parse(new TextDecoder().decode(kept.bytes)), {
    to: 'nightly-2026-09-23',
    bookmark: 'bm-0001',
    undo: 'undo-bm-0001',
    before: 'before-restore-2026-09-24',
    at: new Date(NOW + DAY).toISOString(),
  });
  assert.equal(kept.meta.undo, 'undo-bm-0001');
  assert.ok(!((await port.list()) as CloudCopy[]).some((c) => c.id.startsWith('restore-')), 'a receipt was listed as a copy somebody could go back to');
});

test('A COPY WITH NO BOOKMARK, OR ONE PAST THE THIRTY DAYS, IS REFUSED IN A SENTENCE AND NOTHING IS ARMED', async () => {
  // A deployment whose storage has no PITR still writes copies (`Record$.dump` says so), and they
  // carry no bookmark. Past thirty days the platform no longer holds the point a bookmark names.
  // Either one armed would restart the object into whatever the platform does with a bookmark it
  // cannot honour, which nobody here can measure, so neither is ever handed over.
  const bare = await record({ none: true });
  assert.ok(((await bare.api.snapshot({ label: 'nightly' }, owner)) as Out).ok);
  assert.equal(((await bare.port.list()) as CloudCopy[])[0]?.bookmark, undefined);
  await assert.rejects(() => bare.port.restore('nightly-2026-09-23'), /no point-in-time bookmark/u);
  const through = (await bare.api.restore({ bookmark: 'nightly-2026-09-23' }, owner)) as Out;
  assert.equal(through.refusal?.code, 'OUT_OF_BOUNDS');
  assert.match(through.refusal?.fix ?? '', /no point-in-time bookmark/u);
  assert.ok(!bare.log.some((line) => line.startsWith('arm ')), 'a copy with no bookmark armed a restore');

  const old = await record();
  assert.ok(((await old.api.snapshot({ label: 'nightly' }, owner)) as Out).ok);
  old.later(WINDOW + 60_000);
  await assert.rejects(() => old.port.restore('nightly-2026-09-23'), /thirty days/u);
  await assert.rejects(() => old.port.restore('nightly-1999-01-01'), /not one of the copies/u);
  assert.ok(!old.log.some((line) => line.startsWith('arm ')), 'a copy past the window armed a restore');
});

test('A RECEIPT THE BUCKET REFUSED DISARMS THE RESTORE, so a refusal never leaves one waiting for the next restart', async () => {
  // `onNextSessionRestoreBookmark` does not restore now; it restores whenever the object next
  // starts. So a throw after it was called, with nothing undone, would tell the owner "that did not
  // go through" and then put the record back anyway at some later eviction. Arming the undo
  // bookmark it handed back points the next start at the moment just before, which is now.
  const { port, log } = await record({ fail: (key) => key.includes('/restore-') });
  await port.take('nightly');
  log.length = 0;
  await assert.rejects(() => port.restore('nightly-2026-09-23'), /nothing will change/u);
  assert.deepEqual(log, ['arm bm-0001', 'arm undo-bm-0001']);
});
