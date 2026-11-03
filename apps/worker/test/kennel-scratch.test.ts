/**
 * The Kennel's scratch install (`src/kennel-scratch.ts`): a submitted add-on is installed into an empty record
 * with the modules it requires and every page it brings is read, before the Kennel lists it.
 *
 * THE RECORD IS A REAL ONE, `createRecordApi` over an in-memory SQLite, so a refusal here is the record's own sentence and
 * not a copy of it. Every scratch a test opens is counted, and each must be closed by the time its answer is back.
 * The add-ons are invented: a bookshelf, a reading room and a set of shelf labels.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fileChecksum, newAuthorKey, signVersion, type CatalogueIndex } from '@braindog/declare/catalogue';
import { createRecordApi } from '@braindog/record';

import { kennelRequired, serveKennel, type KennelBucket, type KennelDeps } from '../src/kennel.ts';
import { recordScratch, scratchInstall, type Doc, type ScratchDeps } from '../src/kennel-scratch.ts';
import { fixedClock, openSqlite, type NodeSql } from '../../../packages/kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 15, 12);

const BOOKS = { register: 'library', name: 'Books', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] };
const SHELF = { page: 'shelf', title: 'Shelf', requires: ['register.library'], blocks: [{ kind: 'table', heading: 'On the shelf', source: 'register.library', span: 12 }] };
const LIBRARY: Doc = { pack: 'bookshelf', version: '1.0.0', title: 'Bookshelf', summary: 'Books you own.', author: 'Halden', license: 'MIT', declarations: [BOOKS, SHELF] };

/** A page over a list of magazines this add-on never declares. */
const READING_ROOM: Doc = {
  pack: 'reading-room',
  version: '1.0.0',
  title: 'Reading room',
  summary: 'Books and magazines in one place.',
  author: 'Halden',
  license: 'MIT',
  declarations: [BOOKS, { page: 'reading-room', title: 'Reading room', requires: ['register.magazines'], blocks: [{ kind: 'table', heading: 'Magazines', source: 'register.magazines', span: 12 }] }],
};

/** A page over the bookshelf's own list, whose table shows a column that list does not have: it installs, and does not draw. */
const SPINES: Doc = {
  ...LIBRARY,
  pack: 'spines',
  title: 'Spines',
  declarations: [BOOKS, { page: 'spines', title: 'Spines', requires: ['register.library'], blocks: [{ kind: 'table', heading: 'By colour', source: 'register.library', columns: [{ field: 'colour' }], span: 12 }] }],
};

/** Labels over the bookshelf's list, which it requires rather than brings. */
const LABELS: Doc = {
  pack: 'shelf-labels',
  version: '1.0.0',
  title: 'Shelf labels',
  summary: 'A page of the books to label.',
  author: 'Halden',
  license: 'MIT',
  requires: { format: 1, primitives: 1, packs: { bookshelf: '^1.0.0' } },
  declarations: [{ page: 'labels', title: 'Labels', requires: ['register.library'], blocks: [{ kind: 'table', heading: 'To label', source: 'register.library', span: 12 }] }],
};

/** A scratch over a fresh in-memory record, and every database it opened, so a test can ask that each was dropped. */
function scratchOf(held: readonly Doc[] = []): { deps: ScratchDeps; opened: NodeSql[]; asked: string[][] } {
  const opened: NodeSql[] = [];
  const asked: string[][] = [];
  return {
    opened,
    asked,
    deps: {
      open: async () => {
        const sql = openSqlite();
        opened.push(sql);
        const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
        return recordScratch(api, () => sql.close());
      },
      required: async (ids) => {
        asked.push([...ids]);
        return held.filter((d) => ids.includes(d.pack as string));
      },
    },
  };
}

const dropped = (opened: readonly NodeSql[]): boolean => opened.every((sql) => !sql.db.isOpen);

test('a page that names a list the add-on does not bring is refused with the record\'s code and the page\'s name', async () => {
  const { deps, opened } = scratchOf();
  const refused = await scratchInstall(READING_ROOM, deps);
  assert.equal(refused?.code, 'REGISTER_UNRESOLVED', JSON.stringify(refused));
  assert.match(refused!.fix, /^The page Reading room does not install on an empty record: /u);
  assert.match(refused!.fix, /magazines/u, 'the record\'s own sentence, naming the list, is kept');
  assert.equal(opened.length, 1);
  assert.ok(dropped(opened), 'the scratch is dropped once the answer is known');
});

test('a page that installs and does not draw is refused at its read, naming the page and its part', async () => {
  const { deps, opened } = scratchOf();
  const refused = await scratchInstall(SPINES, deps);
  assert.equal(refused?.code, 'FIELD_UNKNOWN', JSON.stringify(refused));
  assert.match(refused!.fix, /^On an empty record the page Spines does not draw its part By colour: /u);
  assert.equal(refused!.at, 'page.spines.blocks[0].columns');
  assert.ok(dropped(opened));
});

test('a good add-on answers nothing, asks for no module, and leaves no scratch behind', async () => {
  const { deps, opened, asked } = scratchOf();
  assert.equal(await scratchInstall(LIBRARY, deps), null);
  assert.deepEqual(asked, [], 'an add-on that requires nothing asks for nothing');
  assert.equal(opened.length, 1);
  assert.ok(dropped(opened));
});

test('a required module is installed first; one nobody holds is refused by name before any scratch opens', async () => {
  const held = scratchOf([LIBRARY]);
  assert.equal(await scratchInstall(LABELS, held.deps), null, 'the labels draw over the bookshelf they require');
  assert.deepEqual(held.asked, [['bookshelf']]);
  assert.ok(dropped(held.opened));

  const missing = scratchOf([]);
  const refused = await scratchInstall(LABELS, missing.deps);
  assert.equal(refused?.code, 'DEPENDENCY_UNRESOLVED');
  assert.equal(refused?.at, 'requires.packs.bookshelf');
  assert.match(refused!.fix, /^Shelf labels requires bookshelf, /u);
  assert.equal(missing.opened.length, 0, 'nothing is installed for an add-on whose modules are not all there');
});

test('a use case\'s own modules are installed before its document', async () => {
  const { deps, asked, opened } = scratchOf([LIBRARY]);
  const own: Doc = { ...LABELS, pack: 'usecase-reader', requires: { format: 1, primitives: 1, packs: {} } };
  assert.equal(await scratchInstall(own, deps, ['bookshelf']), null);
  assert.deepEqual(asked, [['bookshelf']]);
  assert.ok(dropped(opened));
});

test('a scratch that throws is dropped all the same', async () => {
  let drops = 0;
  const deps: ScratchDeps = {
    open: () => ({
      planPack: async () => {
        throw new Error('the scratch record went away');
      },
      installPack: async () => ({ ok: true, value: null }),
      pages: async () => ({ ok: true, value: [] }),
      page: async () => ({ ok: true, value: { blocks: [] } }),
      drop: () => {
        drops += 1;
      },
    }),
    required: async () => [],
  };
  await assert.rejects(scratchInstall(LIBRARY, deps), /went away/u);
  assert.equal(drops, 1);
});

/* ── at the door ─────────────────────────────────────────────────────────── */

const HOST = 'https://kennel.example.test';
const OPERATOR = 'the-operator-key-of-this-test';
const operator = { authorization: `Bearer ${OPERATOR}` };

/** R2 as a map with an etag per write, as `kennel.test.ts` holds it. */
function bucket(): { blobs: KennelBucket; files: Map<string, string> } {
  const files = new Map<string, string>();
  const etags = new Map<string, string>();
  let writes = 0;
  const blobs: KennelBucket = {
    async get(key) {
      const text = files.get(key);
      return text === undefined ? null : { etag: etags.get(key)!, text: async () => text };
    },
    async put(key, value, options) {
      const want = options?.onlyIf?.etagMatches;
      if (want !== undefined && etags.get(key) !== want) return null;
      writes += 1;
      files.set(key, value);
      etags.set(key, `etag-${writes}`);
      return {};
    },
    async delete(key) {
      files.delete(key);
      etags.delete(key);
    },
  };
  return { blobs, files };
}

const EMPTY_INDEX: CatalogueIndex = { format: 1, name: 'BrainDog', entries: [] };
const assets = {
  fetch: async (request: Request): Promise<Response> =>
    new URL(request.url).pathname === '/catalogue/index.json'
      ? new Response(JSON.stringify(EMPTY_INDEX), { headers: { 'content-type': 'application/json' } })
      : new Response('<!doctype html><title>BrainDog</title>', { headers: { 'content-type': 'text/html' } }),
};

const depsOf = (blobs: KennelBucket, scratch: ScratchDeps | undefined): KennelDeps => ({
  blobs,
  assets,
  operator: OPERATOR,
  origin: HOST,
  session: async () => ({ status: 401, refusal: { code: 'UNAUTHORIZED', fix: 'That did not sign you in.' } }),
  bearer: { knows: async () => false, verify: async () => null, access: async () => null },
  scratch,
  now: () => new Date(NOW),
});

const get = (path: string): Request => new Request(`${HOST}/api/kennel/v1/${path}`);
const post = (path: string, body: unknown, headers: Record<string, string> = {}): Request =>
  new Request(`${HOST}/api/kennel/v1/${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

type Envelope = { ok: boolean; value?: Record<string, unknown>; refusal?: { code: string; fix: string; at?: string } };

async function signed(doc: Doc, key: Awaited<ReturnType<typeof newAuthorKey>>): Promise<Record<string, unknown>> {
  const text = JSON.stringify(doc, null, 2);
  const signature = await signVersion(key, 'pack', doc.pack as string, doc.version as string, await fileChecksum(text), new Date(NOW));
  assert.ok(signature.ok, JSON.stringify(signature));
  return { text, signature: signature.value, publisher: { name: 'Halden Books' } };
}

const listedIds = (files: Map<string, string>): string[] => {
  const index = files.get('kennel/index.json');
  return index === undefined ? [] : (JSON.parse(index) as CatalogueIndex).entries.map((e) => e.id);
};

test('a trusted publisher\'s page that names a list it does not bring is refused 422 at the door, and nothing is listed or kept', async () => {
  const { blobs, files } = bucket();
  const { deps: scratch, opened } = scratchOf();
  const deps = depsOf(blobs, scratch);
  const key = await newAuthorKey('Halden');
  assert.equal((await serveKennel(post('publisher', { publisher: `key:${key.key_id}`, trusted: true }, operator), deps)).status, 200);
  const before = new Map(files);

  const refused = await serveKennel(post('submit', await signed(READING_ROOM, key)), deps);
  const said = (await refused.json()) as Envelope;
  assert.equal(refused.status, 422, JSON.stringify(said));
  assert.equal(said.refusal?.code, 'REGISTER_UNRESOLVED');
  assert.match(said.refusal!.fix, /The page Reading room does not install on an empty record/u);
  assert.deepEqual(files, before, 'the refused version wrote nothing: no index line, no file, no review');
  assert.ok(dropped(opened));

  const good = await serveKennel(post('submit', await signed(LIBRARY, key)), deps);
  const listed = (await good.json()) as Envelope;
  assert.equal(good.status, 200, JSON.stringify(listed));
  assert.equal(listed.value?.state, 'listed');
  assert.deepEqual(listedIds(files), ['bookshelf']);
  assert.equal(opened.length, 2, 'one scratch for each submission');
  assert.ok(dropped(opened));
});

test('a publisher who is not trusted passes the same scratch before the version waits for review', async () => {
  const { blobs, files } = bucket();
  const { deps: scratch, opened } = scratchOf();
  const deps = depsOf(blobs, scratch);
  const key = await newAuthorKey('Halden');
  const refused = await serveKennel(post('submit', await signed(SPINES, key)), deps);
  assert.equal(refused.status, 422);
  assert.equal(((await refused.json()) as Envelope).refusal?.code, 'FIELD_UNKNOWN');
  assert.equal(files.size, 0, 'nothing waits for review');
  const waits = (await (await serveKennel(post('submit', await signed(LIBRARY, key)), deps)).json()) as Envelope;
  assert.equal(waits.value?.state, 'review', JSON.stringify(waits));
  assert.ok(dropped(opened));
});

test('a file the door refuses is told the door\'s sentence, and no scratch opens for it', async () => {
  const { blobs } = bucket();
  const { deps: scratch, opened } = scratchOf();
  const key = await newAuthorKey('Halden');
  for (const [doc, said] of [
    [{ ...LIBRARY, title: '' }, /title/u],
    [{ ...LIBRARY, price: 5 }, /price/u],
  ] as const) {
    const out = (await (await serveKennel(post('submit', await signed(doc, key)), depsOf(blobs, scratch))).json()) as Envelope;
    assert.equal(out.refusal?.code, 'PACK_MALFORMED', JSON.stringify(out));
    assert.match(out.refusal!.fix, said);
  }
  assert.equal(opened.length, 0);
});

test('a signature that does not verify is told so, and no scratch opens for it', async () => {
  const { blobs, files } = bucket();
  const { deps: scratch, opened } = scratchOf();
  const key = await newAuthorKey('Halden');
  /* The signature over the good bookshelf, sent with the reading room: its checksum is not this file's. */
  const forged = { ...(await signed(LIBRARY, key)), text: JSON.stringify(READING_ROOM, null, 2) };
  const out = (await (await serveKennel(post('submit', forged), depsOf(blobs, scratch))).json()) as Envelope;
  assert.equal(out.refusal?.code, 'SIGNATURE_INVALID', JSON.stringify(out));
  assert.equal(opened.length, 0, 'a forged signature costs no install');
  assert.equal(files.size, 0);
});

test('with no scratch handed in the door answers as before, and says so in its log once', async () => {
  const { blobs } = bucket();
  const lines: string[] = [];
  const was = console.log;
  console.log = (line: unknown) => void lines.push(String(line));
  try {
    const key = await newAuthorKey('Halden');
    const deps = depsOf(blobs, undefined);
    const first = (await (await serveKennel(post('submit', await signed(READING_ROOM, key)), deps)).json()) as Envelope;
    assert.equal(first.value?.state, 'review', 'as today: no scratch, so the page that does not draw waits for review');
    await serveKennel(post('submit', await signed(LIBRARY, key)), deps);
  } finally {
    console.log = was;
  }
  const said = lines.filter((l) => l.includes('"scratch":"none"'));
  assert.equal(said.length, 1, `said ${said.length} times`);
  assert.ok(said.every((l) => !l.includes('Reading room') && !l.includes('Halden')), 'the line carries no value a caller sent');
});

test('what a scratch requires is read from BrainDog\'s own modules and from what the Kennel lists', async () => {
  const { blobs } = bucket();
  const { deps: scratch, opened } = scratchOf();
  const deps = depsOf(blobs, scratch);
  const key = await newAuthorKey('Halden');
  await serveKennel(post('publisher', { publisher: `key:${key.key_id}`, trusted: true }, operator), deps);
  /* A TRUSTED PUBLISHER'S FIRST VERSION WAITS, and the operator lists it. */
  assert.equal(((await (await serveKennel(post('submit', await signed(LIBRARY, key)), deps)).json()) as Envelope).value?.state, 'review');
  const verdict = await serveKennel(post('review', { kind: 'pack', id: 'bookshelf', version: String(LIBRARY.version), verdict: 'list', reason: '' }, operator), deps);
  assert.equal(((await verdict.json()) as Envelope).value?.state, 'listed');

  const found = await kennelRequired({ blobs, assets }, ['people', 'bookshelf', 'nobody-lists-this'], new Date(NOW));
  assert.deepEqual(
    found.map((d) => d.pack),
    ['people', 'bookshelf'],
  );
  /* And the labels, which require the bookshelf, pass the scratch with the Kennel's copy of it. */
  const real: ScratchDeps = { open: scratch.open, required: (ids) => kennelRequired({ blobs, assets }, ids, new Date(NOW)) };
  assert.equal(await scratchInstall(LABELS, real), null);
  const leaning: Doc = { ...LIBRARY, pack: 'shelf-friends', title: 'Shelf friends', requires: { format: 1, primitives: 1, packs: { people: `^${String(found[0]!.version)}` } } };
  assert.equal(await scratchInstall(leaning, real), null, 'an add-on over BrainDog\'s own module installs it first');
  assert.ok(dropped(opened));
});

test('a scratch hands back the pages the add-on brought, as they drew', async () => {
  const { deps, opened } = scratchOf();
  const drawn: unknown[] = [];
  assert.equal(await scratchInstall(LIBRARY, deps, [], drawn), null);
  assert.equal(drawn.length, 1);
  assert.equal((drawn[0] as { page?: string }).page, 'shelf');
  assert.ok(dropped(opened));
});

test('approving a waiting add-on with no picture draws one from its own pages, and a pageless add-on lists without one', async () => {
  const { blobs } = bucket();
  const { deps: scratch } = scratchOf();
  const deps = depsOf(blobs, scratch);
  const key = await newAuthorKey('Halden');
  const waiting = await (await serveKennel(post('submit', await signed(LIBRARY, key)), deps)).json();
  assert.equal((waiting as Envelope).value?.state, 'review');
  const listed = await serveKennel(post('review', { kind: 'pack', id: 'bookshelf', version: '1.0.0', verdict: 'list', reason: '' }, operator), deps);
  assert.equal(listed.status, 200);
  const picture = await serveKennel(get('packs/bookshelf/1.0.0.preview.json'), deps);
  assert.equal(picture.status, 200);
  const preview = (await picture.json()) as { pages: { page: string }[] };
  assert.deepEqual(
    preview.pages.map((p) => p.page),
    ['shelf'],
  );

  const bare: Doc = { ...LIBRARY, pack: 'only-lists', title: 'Only lists', declarations: [BOOKS] };
  await serveKennel(post('submit', await signed(bare, key)), deps);
  assert.equal((await serveKennel(post('review', { kind: 'pack', id: 'only-lists', version: '1.0.0', verdict: 'list', reason: '' }, operator), deps)).status, 200);
  assert.equal((await serveKennel(get('packs/only-lists/1.0.0.preview.json'), deps)).status, 404);
});
