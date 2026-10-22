/**
 * Sealed files (`methods/sealed.ts`): the owner's store for bytes the host cannot read, held to the owner himself as a
 * personal list is, in parts, whole only once its parts hash to what each said, and refused past its sizes in a sentence
 * that names `bytes` or `size`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { createRecordApi, SEALED_NAME, sealedName, type CallContext, type SealedStore } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 22, 12);
const AT = new Date(NOW).toISOString();
const OWNER = 'p_own';
const owner: CallContext = { principal: { kind: 'person', id: OWNER, level: 'owner' }, credentialed: true };
const token = (id: string, scope: 'read' | 'propose' | 'write' = 'write'): CallContext => ({ principal: { kind: 'token', id, scope, person: OWNER, level: 'owner' } });

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string; retry_after?: number } };
const value = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};
const refusal = (r: unknown): { code: string; fix: string; at?: string; retry_after?: number } => {
  const x = r as Out;
  assert.ok(!x.ok && x.refusal, `expected a refusal, and the call answered ${JSON.stringify(x.value)?.slice(0, 200)}`);
  return x.refusal!;
};

const sha = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const b64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64');
const bytesOf = (n: number, seed = 7): Uint8Array => Uint8Array.from({ length: n }, (_, i) => (i * 31 + seed) % 251);

/** A host's store in memory, which counts what it was asked. */
function memory(spend?: (n: number) => Promise<number | null>) {
  const held = new Map<string, Uint8Array>();
  const puts: string[] = [];
  const spent: number[] = [];
  const store: SealedStore = {
    put: async (name, bytes) => {
      assert.match(name, SEALED_NAME, 'a name the store was handed is not one sealedName makes');
      puts.push(name);
      held.set(name, Uint8Array.from(bytes));
    },
    get: async (name) => held.get(name) ?? null,
    drop: async (names) => {
      for (const name of names) held.delete(name);
    },
    ...(spend === undefined
      ? {}
      : {
          spend: async (n: number) => {
            spent.push(n);
            return spend(n);
          },
        }),
  };
  return { store, held, puts, spent };
}

async function record(store: SealedStore | null = memory().store) {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW), ...(store === null ? {} : { sealed: store }) });
  value(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAG', slug: 'the-desk', name: 'The Desk', tz: 'UTC', locale: 'en', owner: { id: OWNER } }));
  const key = (id: string, label: string, scope = 'write', client: string | null = null): void =>
    sql.exec('INSERT INTO token (id, person_id, hash, scope, label, created_at, client_kind) VALUES (?, ?, ?, ?, ?, ?, ?)', id, OWNER, `h_${id}`, scope, label, AT, client);
  key('t_own', 'Own key', 'write', 'key');
  key('t_dev', 'braindog on the studio Mac', 'write', 'device');
  key('t_app', 'An app', 'write', 'cimd');
  key('t_kid', 'An app', 'write', 'cimd');
  sql.exec("INSERT INTO token_lens (token_id, parent_id, narrow, made_by, made_at) VALUES ('t_kid', 't_app', NULL, ?, ?)", OWNER, AT);
  key('t_few', 'Narrowed', 'write', 'key');
  sql.exec("INSERT INTO token_lens (token_id, parent_id, narrow, made_by, made_at) VALUES ('t_few', NULL, ?, ?, ?)", JSON.stringify({ lists: ['notes'] }), OWNER, AT);
  key('t_job', 'job:01JZ8QK3F7R2M9V4XN6TCB5HAH', 'propose');
  key('t_rep', 'report:notes', 'write');
  const as = (person: string): CallContext => {
    const held = api.kernel.access(person)!;
    return { principal: { kind: 'person', id: person, level: held.level }, ...(held.registers === null ? {} : { registers: held.registers }), levels: held.levels };
  };
  return { sql, api, as };
}

type Api = Awaited<ReturnType<typeof record>>['api'];

/** A file put whole, in `parts` parts of near-equal length, each part's answer kept. */
async function putFile(api: Api, ctx: CallContext, key: string, file: Uint8Array, parts = 1, order?: number[]) {
  const size = file.byteLength;
  const step = Math.ceil(size / parts) || 1;
  const answers: { complete: boolean }[] = [];
  for (const part of order ?? [...Array(parts).keys()])
    answers.push(value(await api.sealedPut({ key, part, parts, size, sha256: sha(file), bytes: b64(file.subarray(part * step, (part + 1) * step)) }, ctx)));
  return answers;
}

const sealedLines = (sql: ReturnType<typeof openSqlite>) =>
  sql.all<{ kind: string; target: string; note: string | null; actor: string }>("SELECT kind, target, note, actor FROM event WHERE target_kind = 'sealed' ORDER BY rowid");

/* ── who reaches them ─────────────────────────────────────────────────────── */

test('THE OWNER REACHES THEM: in his session, with his own key, and with the key his machine signed in with', async () => {
  const { sql, api } = await record();
  const file = bytesOf(300);
  for (const [i, ctx] of [owner, token('t_own'), token('t_dev')].entries()) {
    const key = `carry/${i}`;
    assert.deepEqual(await putFile(api, ctx, key, file), [{ key, part: 0, parts: 1, complete: true }]);
    const got = value<{ bytes: string; size: number; sha256: string; parts: number }>(await api.sealedGet({ key, part: 0 }, ctx));
    assert.deepEqual(Buffer.from(got.bytes, 'base64'), Buffer.from(file));
    assert.deepEqual([got.size, got.sha256, got.parts], [300, sha(file), 1]);
    assert.ok(value<{ files: { key: string }[] }>(await api.sealedList({}, ctx)).files.some((f) => f.key === key));
    assert.deepEqual(value(await api.sealedDelete({ key }, ctx)), { key, deleted: true });
  }
  sql.close();
});

test('NOBODY ELSE DOES: an Admin, a member, a share, a link, a runner, an app and its child, a narrowed, job or report key, See as or an operation', async () => {
  const { sql, api, as } = await record();
  await putFile(api, owner, 'sync/key', bytesOf(64));
  value(await api.invite({ person: 'p_adm', name: 'Ada', level: 'decide' }, owner));
  value(await api.invite({ person: 'p_mem', name: 'Mo', level: 'write' }, owner));
  const contexts: [string, CallContext][] = [
    ['an Admin', as('p_adm')],
    ['a member who writes', as('p_mem')],
    ['a guest a share let in', { principal: { kind: 'person', id: 'p_gus', level: 'read' }, grant: { epoch: 1, until: null, via: ['sh_1'], agents: false } } as CallContext],
    ['a link to one page', { principal: { kind: 'share', id: 'sh_1', slug: 'home' } } as CallContext],
    ['a runner', { principal: { kind: 'runner', id: 'd_1', name: 'Studio' } } as CallContext],
    ['an app signed in through OAuth', token('t_app')],
    ['an app’s child key, which arrives under its parent', { ...token('t_app'), registers: ['notes'] }],
    ['an app’s narrower child key', token('t_kid', 'read')],
    ['a key narrowed to less than him', { ...token('t_few'), registers: ['notes'] }],
    ['a job’s key', token('t_job', 'propose')],
    ['a report key', token('t_rep')],
    ['the owner seeing as somebody', { ...owner, preview: 'p_adm', previewBy: OWNER }],
    ['an operation grant', { ...owner, operation: 'export' }],
  ];
  const file = bytesOf(32, 3);
  for (const [who, ctx] of contexts) {
    for (const said of [
      refusal(await api.sealedList({}, ctx)),
      refusal(await api.sealedGet({ key: 'sync/key', part: 0 }, ctx)),
      refusal(await api.sealedPut({ key: 'sync/key', part: 0, parts: 1, size: 32, sha256: sha(file), bytes: b64(file) }, ctx)),
      refusal(await api.sealedDelete({ key: 'sync/key' }, ctx)),
    ])
      /* `LEVEL_REQUIRED` IS THE LADDER'S WORD for a person asked to write who reads, and refuses as surely. */
      assert.ok(['FORBIDDEN', 'LEVEL_REQUIRED'].includes(said.code), `${who}: ${said.code} ${said.fix}`);
  }
  const files = value<{ files: { key: string; sha256: string; complete: boolean }[] }>(await api.sealedList({}, owner)).files;
  assert.deepEqual(files.map((f) => [f.key, f.sha256, f.complete]), [['sync/key', sha(bytesOf(64)), true]], 'a refused call changed the file');

  /* AND THE SENTENCES SAY WHY, for the two a person is most likely to meet. */
  assert.ok(refusal(await api.sealedList({}, as('p_adm'))).fix.startsWith('Sealed files are personal'));
  assert.ok(refusal(await api.sealedList({}, token('t_app'))).fix.startsWith('An app signed in through OAuth'));
  sql.close();
});

test('THE LOG SAYS A FILE WAS KEPT OR DELETED, BY KEY AND NEVER BY ITS BYTES, AND ONLY THE OWNER READS THE LINE', async () => {
  const { sql, api, as } = await record();
  const first = bytesOf(40);
  await putFile(api, owner, 'sync/key', first);
  await putFile(api, owner, 'sync/key', first);
  await putFile(api, owner, 'sync/key', bytesOf(41, 9));
  value(await api.sealedDelete({ key: 'sync/key' }, owner));
  assert.deepEqual(
    sealedLines(sql).map((e) => [e.kind, e.target, e.actor]),
    [
      ['grant.add', 'sealed:sync/key', OWNER],
      ['grant.rotate', 'sealed:sync/key', OWNER],
      ['grant.revoke', 'sealed:sync/key', OWNER],
    ],
    'one line a file kept whole and one a delete, and none for the same file put again',
  );
  assert.equal(sealedLines(sql)[0]!.note, 'sync/key, 1 part, 40 bytes');
  for (const e of sealedLines(sql)) assert.ok(!(e.note ?? '').includes(b64(first)));

  value(await api.invite({ person: 'p_adm', name: 'Ada', level: 'decide' }, owner));
  const lines = (r: unknown) => value<{ events: { target: string | null }[] }>(r).events.filter((e) => (e.target ?? '').startsWith('sealed:'));
  assert.equal(lines(await api.recentHistory({ limit: 200 }, owner)).length, 3, 'the owner reads his own lines');
  assert.deepEqual(lines(await api.recentHistory({ limit: 200 }, as('p_adm'))), [], 'an Admin read a sealed file’s line');
  sql.close();
});

/* ── parts, wholes and replacing ──────────────────────────────────────────── */

test('A FILE IN PARTS IS WHOLE WHEN THE LAST PART LANDS, in any order, and each part comes back as it went', async () => {
  const { store, held } = memory();
  const { sql, api } = await record(store);
  const file = bytesOf(1_000);
  assert.deepEqual(
    (await putFile(api, token('t_dev'), 'carry/notes/3', file, 3, [2, 0, 1])).map((a) => a.complete),
    [false, false, true],
  );
  assert.equal(held.size, 3);
  const [listed] = value<{ files: { key: string; parts: number; size: number; complete: boolean; at: string }[] }>(await api.sealedList({ prefix: 'carry/' }, owner)).files;
  assert.deepEqual(listed, { key: 'carry/notes/3', parts: 3, size: 1_000, sha256: sha(file), complete: true, at: AT });
  const back = Buffer.concat(
    await Promise.all([0, 1, 2].map(async (part) => Buffer.from(value<{ bytes: string }>(await api.sealedGet({ key: 'carry/notes/3', part }, owner)).bytes, 'base64'))),
  );
  assert.deepEqual(back, Buffer.from(file));
  assert.deepEqual(value<{ files: unknown[] }>(await api.sealedList({ prefix: 'sync/' }, owner)).files, [], 'a prefix that names none lists none');
  sql.close();
});

test('PART 0 UNDER ANOTHER HASH REPLACES THE FILE AND LETS ITS PARTS GO; another part of another file waits for it', async () => {
  const { store, held } = memory();
  const { sql, api } = await record(store);
  const older = bytesOf(900);
  await putFile(api, owner, 'bundle/7/manifest', older, 3);
  const olderNames = await Promise.all([0, 1, 2].map((p) => sealedName('bundle/7/manifest', sha(older), p)));
  assert.ok(olderNames.every((n) => held.has(n)));

  const newer = bytesOf(500, 11);
  const early = refusal(await api.sealedPut({ key: 'bundle/7/manifest', part: 1, parts: 2, size: 500, sha256: sha(newer), bytes: b64(newer.subarray(250)) }, owner));
  assert.equal(early.code, 'OUT_OF_BOUNDS');
  assert.equal(early.at, 'sha256');
  assert.ok(early.fix.includes('Put part 0 first'), early.fix);

  assert.equal(value<{ complete: boolean }>(await api.sealedPut({ key: 'bundle/7/manifest', part: 0, parts: 2, size: 500, sha256: sha(newer), bytes: b64(newer.subarray(0, 250)) }, owner)).complete, false);
  assert.ok(olderNames.every((n) => !held.has(n)), 'the older file’s parts are still in the store');
  const [listed] = value<{ files: { sha256: string; complete: boolean; parts: number }[] }>(await api.sealedList({}, owner)).files;
  assert.deepEqual([listed!.sha256, listed!.complete, listed!.parts], [sha(newer), false, 2]);
  const notYet = refusal(await api.sealedGet({ key: 'bundle/7/manifest', part: 1 }, owner));
  assert.deepEqual([notYet.code, notYet.at], ['NOT_FOUND', 'part']);

  assert.equal(value<{ complete: boolean }>(await api.sealedPut({ key: 'bundle/7/manifest', part: 1, parts: 2, size: 500, sha256: sha(newer), bytes: b64(newer.subarray(250)) }, owner)).complete, true);
  assert.equal(held.size, 2);
  sql.close();
});

test('A WHOLE FILE PUT AGAIN IS NOT WRITTEN AGAIN, and a part put again before then costs nothing more', async () => {
  const spend = memory(async () => null);
  const { sql, api } = await record(spend.store);
  const file = bytesOf(600);
  const half = (part: number) => ({ key: 'carry/x', part, parts: 2, size: 600, sha256: sha(file), bytes: b64(file.subarray(part * 300, (part + 1) * 300)) });
  value(await api.sealedPut(half(0), owner));
  value(await api.sealedPut(half(0), owner));
  assert.deepEqual(spend.spent, [300], 'a part put again under the same hash was counted again');
  value(await api.sealedPut(half(1), owner));
  const puts = spend.puts.length;
  assert.deepEqual(value(await api.sealedPut(half(1), owner)), { key: 'carry/x', part: 1, parts: 2, complete: true });
  assert.equal(spend.puts.length, puts, 'a whole file was written again');
  sql.close();
});

test('PARTS THAT DO NOT HASH TO WHAT THEY SAID ARE NOT KEPT, AND NOTHING OF THE FILE STAYS', async () => {
  const { store, held } = memory();
  const { sql, api } = await record(store);
  const file = bytesOf(200);
  const said = refusal(await api.sealedPut({ key: 'sync/key', part: 0, parts: 1, size: 200, sha256: sha(bytesOf(200, 99)), bytes: b64(file) }, owner));
  assert.deepEqual([said.code, said.at], ['CHECKSUM_MISMATCH', 'sha256']);
  assert.equal(held.size, 0);
  assert.deepEqual(value<{ files: unknown[] }>(await api.sealedList({}, owner)).files, []);
  assert.deepEqual(sealedLines(sql), []);
  sql.close();
});

test('NOT_FOUND FOR A FILE OR A PART THAT IS NOT HERE, and a part the store lost makes the file not whole again', async () => {
  const { store, held } = memory();
  const { sql, api } = await record(store);
  const none = refusal(await api.sealedGet({ key: 'sync/key', part: 0 }, owner));
  assert.deepEqual([none.code, none.at, none.fix], ['NOT_FOUND', 'key', 'There is no sealed file called sync/key here.']);

  const file = bytesOf(10);
  await putFile(api, owner, 'sync/key', file);
  const past = refusal(await api.sealedGet({ key: 'sync/key', part: 1 }, owner));
  assert.deepEqual([past.code, past.at], ['NOT_FOUND', 'part']);

  held.clear();
  const lost = refusal(await api.sealedGet({ key: 'sync/key', part: 0 }, owner));
  assert.deepEqual([lost.code, lost.at], ['NOT_FOUND', 'part']);
  assert.equal(value<{ files: { complete: boolean }[] }>(await api.sealedList({}, owner)).files[0]!.complete, false);
  assert.equal(value<{ complete: boolean }>(await api.sealedPut({ key: 'sync/key', part: 0, parts: 1, size: 10, sha256: sha(file), bytes: b64(file) }, owner)).complete, true);
  sql.close();
});

test('A HOST WITH NO STORE SAYS SO, AND ITS INDEX STILL LISTS AND DELETES', async () => {
  const { sql, api } = await record(null);
  const file = bytesOf(10);
  const put = refusal(await api.sealedPut({ key: 'sync/key', part: 0, parts: 1, size: 10, sha256: sha(file), bytes: b64(file) }, owner));
  assert.equal(put.code, 'NOT_IN_THIS_BUILD');
  assert.equal(refusal(await api.sealedGet({ key: 'sync/key', part: 0 }, owner)).code, 'NOT_IN_THIS_BUILD');
  sql.exec("INSERT INTO sealed_file (key, parts, size, sha256, complete, made_at, updated_at, made_by) VALUES ('sync/key', 1, 10, ?, 0, ?, ?, ?)", sha(file), AT, AT, OWNER);
  assert.equal(value<{ files: unknown[] }>(await api.sealedList({}, owner)).files.length, 1);
  assert.deepEqual(value(await api.sealedDelete({ key: 'sync/key' }, owner)), { key: 'sync/key', deleted: true });
  assert.deepEqual(value(await api.sealedDelete({ key: 'sync/key' }, owner)), { key: 'sync/key', deleted: false });
  sql.close();
});

test('A HOST THAT METERS A DAY ANSWERS RATE_LIMITED WITH THE WAIT, AND KEEPS NOTHING', async () => {
  const { store, held } = memory(async () => 3_600);
  const { sql, api } = await record(store);
  const file = bytesOf(10);
  const said = refusal(await api.sealedPut({ key: 'sync/key', part: 0, parts: 1, size: 10, sha256: sha(file), bytes: b64(file) }, owner));
  assert.deepEqual([said.code, said.at, said.retry_after], ['RATE_LIMITED', 'bytes', 3_600]);
  assert.equal(held.size, 0);
  assert.deepEqual(value<{ files: unknown[] }>(await api.sealedList({}, owner)).files, []);
  sql.close();
});

/* ── what is refused, and where ───────────────────────────────────────────── */

test('EACH SIZE PAST ITS MOST IS REFUSED AT bytes OR size, and each shape at its own field', async () => {
  const { store, held } = memory();
  const { sql, api } = await record(store);
  const file = bytesOf(10);
  const put = (args: Record<string, unknown>) =>
    api.sealedPut({ key: 'sync/key', part: 0, parts: 1, size: 10, sha256: sha(file), bytes: b64(file), ...args } as never, owner);
  const cases: [Record<string, unknown>, string, string][] = [
    [{ size: 26_214_401, parts: 8 }, 'OUT_OF_BOUNDS', 'size'],
    [{ size: 4_194_305 }, 'OUT_OF_BOUNDS', 'size'],
    [{ bytes: 'A'.repeat(5_592_412) }, 'OUT_OF_BOUNDS', 'bytes'],
    [{ bytes: 'A'.repeat(5_592_408), size: 4_194_306, parts: 2 }, 'OUT_OF_BOUNDS', 'bytes'],
    [{ size: 4 }, 'OUT_OF_BOUNDS', 'bytes'],
    [{ parts: 9 }, 'OUT_OF_BOUNDS', 'parts'],
    [{ parts: 0 }, 'OUT_OF_BOUNDS', 'parts'],
    [{ part: 1 }, 'OUT_OF_BOUNDS', 'part'],
    [{ part: -1 }, 'OUT_OF_BOUNDS', 'part'],
    [{ size: -1 }, 'VALUE_MALFORMED', 'size'],
    [{ sha256: 'ABC' }, 'VALUE_MALFORMED', 'sha256'],
    [{ sha256: sha(file).toUpperCase() }, 'VALUE_MALFORMED', 'sha256'],
    [{ bytes: 'not base64!' }, 'VALUE_MALFORMED', 'bytes'],
    [{ bytes: undefined }, 'REQUIRED_MISSING', 'bytes'],
    [{ key: undefined }, 'REQUIRED_MISSING', 'key'],
    [{ key: 'Sync/Key' }, 'VALUE_MALFORMED', 'key'],
    [{ key: '/sync/key' }, 'VALUE_MALFORMED', 'key'],
    [{ key: 'a'.repeat(201) }, 'OUT_OF_BOUNDS', 'key'],
  ];
  for (const [args, code, at] of cases) {
    const said = refusal(await put(args));
    assert.deepEqual([said.code, said.at], [code, at], `${JSON.stringify(args).slice(0, 80)}: ${said.fix}`);
  }
  assert.equal(held.size, 0, 'a refused part was kept');
  assert.deepEqual(value<{ files: unknown[] }>(await api.sealedList({}, owner)).files, []);
  /* AT ITS MOST, A KEY AND A FILE ARE TAKEN. */
  value(await put({ key: `k${'a'.repeat(199)}` }));
  sql.close();
});
