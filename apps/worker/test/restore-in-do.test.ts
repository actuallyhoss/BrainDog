/**
 * The Worker wired to its copies (ROADMAP W55-7, `loop/research-restore.md` §9): the record's `Snapshots` port, going back
 * through `51 D15`'s two calls, a delete that sweeps the bucket, and a night that copies the Directory and expires what
 * deleted records left.
 *
 * WHAT WAS MEASURED BEFORE THIS FILE, AT 07ba6dbd. `copies.ts`, `destroy.ts` and `directory-copy.ts` were committed and
 * green in their own tests, and `src/index.ts` called none of them: `Record$` handed `createRecordApi` no `snapshots`, so
 * a signed-in owner's `/api/snapshots` was 501 `NOT_IN_THIS_BUILD`; `destroy` passed `destroyRecord` no bucket, so a
 * deleted record's copies stayed in R2; and `nightly()` never asked the Directory for a dump or for its closed records.
 * Every case below was run against that tree first and failed for that reason, and the report says how.
 *
 * DRIVEN THROUGH THE BUNDLE, the Worker's own `fetch` and `scheduled`, with a real Directory and real records
 * (`cloud-harness.ts`). The one thing faked is the rewind: PITR does not run locally, so the object that comes back
 * after `ctx.abort()` holds the rows it held before. What this proves is the order of the calls and where the event
 * lands. THAT THE OBJECT COMES BACK AT THE ARMED BOOKMARK IS PROVED ON ALPHA ONLY, by one restore of an alpha record,
 * which is his step (`loop/research-restore.md` §8).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { prefixOf } from '../src/snapshots.ts';
import { DIRECTORY_COPIES } from '../src/directory-copy.ts';
import { cloud } from './cloud-harness.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const GONE = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HZZ';
const OWNER = 'ada@example.test';
const SLUG = 'studio';
const PREFIX = prefixOf(REC);
const DAY = 86_400_000;

type Out = { ok: boolean; value?: Record<string, unknown> & { id?: string; kept?: string; bookmark?: string }; refusal?: { code: string; fix: string } };

async function owned() {
  const c = await cloud();
  await c.provision(REC, SLUG, OWNER);
  const cookie = await c.signIn(OWNER);
  return { ...c, cookie };
}

test('A SIGNED-IN OWNER TAKES A COPY AND LISTS IT, with the bookmark it was taken at, where the Worker answered 501', async () => {
  const c = await owned();
  const taken = await c.ask('/api/snapshot', { method: 'POST', cookie: c.cookie, body: JSON.stringify({ label: 'now' }) });
  const took = (await taken.json()) as Out;
  assert.equal(taken.status, 200, JSON.stringify(took));
  const id = String(took.value?.id);
  assert.match(id, /^now-\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(c.blobs.keys(PREFIX), [`${PREFIX}${id}.brainl`], 'the copy is not under the record prefix');

  const listed = (await (await c.ask('/api/snapshots', { cookie: c.cookie })).json()) as { ok: boolean; value?: { id: string; bookmark?: string }[] };
  assert.ok(listed.ok, JSON.stringify(listed));
  assert.deepEqual(listed.value?.map((s) => s.id), [id]);
  assert.match(String(listed.value?.[0]?.bookmark), /^bm-/, 'the copy carries no bookmark, so it could not be gone back to');
});

test('RESTORE IS 51 D15\'S TWO CALLS: the bookmark armed, the object reset, and restore.pitr written on the object that came back', async () => {
  const c = await owned();
  const took = (await (await c.ask('/api/snapshot', { method: 'POST', cookie: c.cookie, body: JSON.stringify({ label: 'now' }) })).json()) as Out;
  assert.ok(took.ok, JSON.stringify(took));
  const id = String(took.value?.id);
  const bookmark = (c.blobs.held.get(`${PREFIX}${id}.brainl`)?.meta ?? {})['bookmark'];
  assert.ok(bookmark, 'the copy was put with no bookmark');
  const first = c.objects.get(REC);

  /* THE EVENT MUST NOT BE WRITTEN BEFORE THE RESET: PITR rewinds everything written after the copy, the event included. */
  let atAbort = -1;
  const storage = c.storages.get(REC)!;
  const armed = storage.onNextSessionRestoreBookmark.bind(storage);
  storage.onNextSessionRestoreBookmark = async (b: string) => {
    const undo = await armed(b);
    atAbort = c.events(REC, 'restore.pitr');
    return undo;
  };

  const res = await c.ask('/api/restore', { method: 'POST', cookie: c.cookie, body: JSON.stringify({ bookmark: id }) });
  const out = (await res.json()) as Out;
  assert.equal(res.status, 200, JSON.stringify(out));
  assert.equal(out.value?.bookmark, id);
  assert.match(String(out.value?.kept), /^before-restore-/, 'no copy of the record as it was was kept first');

  assert.deepEqual(storage.pitr.armed, [bookmark], 'the object was armed with some other bookmark than the copy\'s own');
  assert.equal(atAbort, 0, 'restore.pitr was written before the object was reset, where the rewind would take it');
  assert.deepEqual(c.log, [`abort ${REC}`], 'the object was not reset, so the restore waits for whatever eviction comes next');
  assert.notEqual(c.objects.get(REC), first, 'the second call went to the object that was reset');
  assert.equal(c.events(REC, 'restore.pitr'), 1, 'restore.pitr is not on the object that came back');

  /* AND THE RECORD THAT CAME BACK ANSWERS. */
  assert.equal((await c.ask('/api/boot', { cookie: c.cookie })).status, 200);
});

test('A RECORD ARMED TO GO BACK ANSWERS NOTHING UNTIL IT IS RESET, so no write lands that the rewind would take', async () => {
  const c = await cloud();
  const person = await c.provision(REC, SLUG, OWNER);
  /* THE OBJECT ALONE, NOT THROUGH THE WORKER, which would reset it straight after: this is the gap between the two calls. */
  const object = c.record(REC);
  const owner = { principal: { kind: 'person', id: person, level: 'owner' }, credentialed: true, provedAt: Date.now() };
  const call = (path: string, body?: unknown) =>
    object.fetch(
      new Request(`https://app.example.test${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { 'x-braindog-ctx': JSON.stringify(owner), 'content-type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    );
  /* A WRITE THAT LANDS WHEN NOTHING IS ARMED. This was a `create` into a `people` register a fresh record does not
     have, which the record refused 400 `REGISTER_UNKNOWN` whether or not it was armed, so with the guard taken out the
     test failed on a status and never showed a write landing. `setPref` is a write every owner's record takes. */
  const write = () => call('/api/setPref', { key: 'nav.hidden', value: [] });
  const before = await write();
  assert.equal(before.status, 200, `the write is refused before any restore: ${await before.clone().text()}`);
  const took = (await (await call('/api/snapshot', { label: 'now' })).json()) as Out;
  assert.ok(took.ok, JSON.stringify(took));
  const restored = await call('/api/restore', { bookmark: took.value?.id });
  assert.equal(restored.status, 200, await restored.clone().text());
  const after = await write();
  const said = (await after.json()) as Out;
  assert.equal(after.status, 503, `a write was answered by an object about to be rewound: ${JSON.stringify(said)}`);
  assert.equal(said.refusal?.code, 'RECORD_UNAVAILABLE');
});

test('A WRITE THAT ARRIVES WHILE THE RECEIPT IS BEING PUT IS REFUSED, because the bookmark is armed before the answer', async () => {
  const c = await cloud();
  const person = await c.provision(REC, SLUG, OWNER);
  const object = c.record(REC);
  const owner = { principal: { kind: 'person', id: person, level: 'owner' }, credentialed: true, provedAt: Date.now() };
  const call = (path: string, body: unknown) =>
    object.fetch(
      new Request(`https://app.example.test${path}`, {
        method: 'POST',
        headers: { 'x-braindog-ctx': JSON.stringify(owner), 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );
  const took = (await (await call('/api/snapshot', { label: 'now' })).json()) as Out;
  assert.ok(took.ok, JSON.stringify(took));
  /* THE GAP THE PLATFORM LEAVES OPEN. `copies.ts` arms the bookmark and then puts its receipt to R2, and a Durable
     Object's input gate stays shut for its own storage and not for a bucket, so a second request can be delivered in
     between. Measured by the checker: with the object marked armed only once `restore` had answered, a `setPref` sent
     from inside that put was answered 200, and the rewind the object was already armed for would have taken it. */
  const put = c.blobs.put.bind(c.blobs);
  let between: Response | undefined;
  c.blobs.put = async (key, value, options) => {
    if (key.includes('/restore-')) between = await call('/api/setPref', { key: 'nav.hidden', value: [] });
    return put(key, value, options);
  };
  const restored = await call('/api/restore', { bookmark: took.value?.id });
  assert.equal(restored.status, 200, await restored.clone().text());
  assert.ok(between, 'the receipt was never put, so nothing was sent in the gap');
  assert.equal(between.status, 503, `a write was answered 200 after the bookmark was armed: ${await between.clone().text()}`);
});

test('A RESTORE CALLED OFF AFTER IT WAS ARMED STILL RESETS THE OBJECT, so the way back is taken now and not at some eviction', async () => {
  const c = await owned();
  const took = (await (await c.ask('/api/snapshot', { method: 'POST', cookie: c.cookie, body: JSON.stringify({ label: 'now' }) })).json()) as Out;
  assert.ok(took.ok, JSON.stringify(took));
  /* THE RECEIPT REFUSED, SO `copies.ts` CALLS IT OFF BY ARMING THE UNDO BOOKMARK. That bookmark is the moment of the
     first arm, and `onNextSessionRestoreBookmark` has no way to disarm, so the object is still set to go back at its
     next start: every write it accepted between this answer and an eviction would be taken by that rewind. Measured by
     the checker: the Worker reset nothing for a refused restore, and the object went on answering writes. */
  const put = c.blobs.put.bind(c.blobs);
  c.blobs.put = async (key, value, options) => {
    if (key.includes('/restore-')) throw new Error('the bucket is having a day');
    return put(key, value, options);
  };
  const res = await c.ask('/api/restore', { method: 'POST', cookie: c.cookie, body: JSON.stringify({ bookmark: took.value?.id }) });
  assert.notEqual(res.status, 200, await res.clone().text());
  c.blobs.put = put;
  assert.equal(c.storages.get(REC)?.pitr.armed.length, 2, 'the restore was not armed and then called off, so this case never ran');
  assert.deepEqual(c.log, [`abort ${REC}`], 'an object armed to go back was left running, and the writes it takes next are lost at its next start');
  assert.equal(c.events(REC, 'restore.pitr'), 0, 'a restore that was called off was recorded as done');
  assert.equal((await c.ask('/api/boot', { cookie: c.cookie })).status, 200, 'the object that came back does not answer');
});

test('DELETING A RECORD LEAVES ITS FINAL COPY AND NOTHING ELSE UNDER ITS PREFIX, where the bucket kept every night', async () => {
  const c = await owned();
  await c.blobs.put(`${PREFIX}nightly-2026-09-22.brainl`, 'a night');
  await c.blobs.put(`${PREFIX}latest.brainl`, 'a night');
  const res = await c.ask('/api/deleteRecord', { method: 'POST', cookie: c.cookie, body: JSON.stringify({ slug: SLUG }) });
  assert.equal(res.status, 200, await res.clone().text());
  const left = c.blobs.keys(PREFIX);
  assert.equal(left.length, 1, `the prefix holds ${JSON.stringify(left)}`);
  assert.match(left[0] ?? '', /\/snapshots\/final-\d{4}-\d{2}-\d{2}\.brainl$/);
  assert.equal(await c.directory.knows(REC), false, 'the Directory still knows the record');
});

test('A SWEEP THE BUCKET REFUSES DELETES NOTHING, AND THE RECORD STILL ANSWERS, so asking again runs the same steps', async () => {
  const c = await owned();
  await c.blobs.put(`${PREFIX}nightly-2026-09-22.brainl`, 'a night');
  const refuse = c.blobs.delete.bind(c.blobs);
  c.blobs.delete = async () => {
    throw new Error('the bucket is having a day');
  };
  const res = await c.ask('/api/deleteRecord', { method: 'POST', cookie: c.cookie, body: JSON.stringify({ slug: SLUG }) });
  assert.notEqual(res.status, 200, `a delete whose sweep failed was answered as done: ${await res.clone().text()}`);
  assert.equal((await c.ask('/api/boot', { cookie: c.cookie })).status, 200, 'the record answers as deleted though nothing of it was');
  assert.equal(await c.directory.knows(REC), true);
  c.blobs.delete = refuse;
});

test('THE NIGHT COPIES THE DIRECTORY, WHICH LOADS BACK INTO AN EMPTY ONE, AND EMPTIES WHAT A RECORD CLOSED A MONTH AGO LEFT', async () => {
  const c = await owned();
  /* A RECORD DELETED FORTY DAYS AGO, BEFORE DELETION SWEPT: its night and `latest` are still in the bucket. */
  c.directory.prepare('old-studio', 'bo@example.test', null);
  assert.equal(c.directory.nameRecord('old-studio', 'bo@example.test', GONE), null);
  assert.equal(c.directory.close(GONE), null);
  c.dirStorage.sql.exec('UPDATE dir_record SET closed_at = ? WHERE id = ?', new Date(Date.now() - 40 * DAY).toISOString() as never, GONE as never);
  await c.blobs.put(`${prefixOf(GONE)}nightly-2026-08-01.brainl`, 'left');
  await c.blobs.put(`${prefixOf(GONE)}latest.brainl`, 'left');

  const worker = c.bundle.default as unknown as { scheduled(controller: object, env: object, ctx: object): Promise<void> };
  await worker.scheduled({}, c.env, { waitUntil: () => {} });

  const today = new Date().toISOString().slice(0, 10);
  assert.deepEqual(c.blobs.keys(prefixOf(GONE)), [], 'a record closed forty days ago still has objects in the bucket');
  assert.ok(c.blobs.keys(PREFIX).includes(`${PREFIX}nightly-${today}.brainl`), 'the open record got no copy');
  assert.deepEqual(c.blobs.keys(DIRECTORY_COPIES), [`${DIRECTORY_COPIES}latest.dirl`, `${DIRECTORY_COPIES}nightly-${today}.dirl`]);

  /* THE COPY IS WORTH SOMETHING ONLY IF IT LOADS: into an empty Directory, where the slug then means the record. */
  const lines = new TextDecoder().decode(c.blobs.held.get(`${DIRECTORY_COPIES}nightly-${today}.dirl`)?.bytes).split('\n');
  const fresh = await cloud();
  const loaded = (await (fresh.directory as unknown as { load(l: string[]): Promise<Out> }).load(lines)) as Out;
  assert.ok(loaded.ok, JSON.stringify(loaded));
  assert.deepEqual(await fresh.directory.resolve(SLUG), { record: REC, slug: SLUG });
});
