/**
 * Visuals at the record (`methods/visuals.ts`): a page hung on a task or a question with the pictures it names, kept as
 * versions signed by who made each, found by its spoken id or its name, held to the frame's rules in words, and put back
 * by the undo its receipt names.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext, type VisualStore } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { PEOPLE } from '../../../fixtures/names.ts';

const NOW = Date.UTC(2026, 9, 23, 12);

const list = (id: string, name: string) => ({
  id: `register.${id}`,
  kind: 'register' as const,
  body: { id, name, title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never,
});

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };
const value = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};
const refused = (r: unknown): { code: string; fix: string; at?: string } => {
  const x = r as Out;
  assert.equal(x.ok, false, `expected a refusal, got ${JSON.stringify(x.value)?.slice(0, 200)}`);
  return x.refusal!;
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' }, credentialed: true };
const agent = (scope: 'propose' | 'write' = 'write'): CallContext => ({
  principal: { kind: 'token', id: `t_${scope}`, scope, person: 'p_owner', level: 'owner' },
  session: { agent: 'claude', client_id: `c-${scope}` },
});

const SHOT = 'a'.repeat(64);
const BIG = 'b'.repeat(64);

/** A host's store in memory: pages by hash, and the file store's pictures by what it says of each. */
function memory() {
  const pages = new Map<string, Uint8Array>();
  const files = new Map<string, { bytes: number; mime: string }>([
    [SHOT, { bytes: 40_000, mime: 'image/png' }],
    [BIG, { bytes: 21 * 1024 * 1024, mime: 'image/jpeg' }],
    ['c'.repeat(64), { bytes: 900, mime: 'application/pdf' }],
  ]);
  const store: VisualStore = {
    putPage: async (hash, bytes) => void pages.set(hash, Uint8Array.from(bytes)),
    getPage: async (hash) => pages.get(hash) ?? null,
    file: async (hash) => files.get(hash) ?? null,
  };
  return { store, pages };
}

async function record() {
  const sql = openSqlite();
  const { store, pages } = memory();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW), visuals: store });
  value(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAE', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: owner.principal.id } }));
  value(await api.kernel.install([list('tickets', 'Tickets'), list('payables', 'Payables')]));
  value(await api.invite({ person: 'p_reader', name: PEOPLE[3]!.name, registers: { tickets: 'read' } } as never, owner));
  for (const scope of ['propose', 'write'] as const)
    sql.exec('INSERT INTO token (id, person_id, hash, scope, label, created_at) VALUES (?, ?, ?, ?, ?, ?)', `t_${scope}`, 'p_owner', `h_${scope}`, scope, 'Claude', new Date(NOW).toISOString());
  const held = api.kernel.access('p_reader')!;
  const reader: CallContext = { principal: { kind: 'person', id: 'p_reader', level: held.level }, ...(held.registers === null ? {} : { registers: held.registers }), levels: held.levels };
  const ticket = api.kernel.nameOf(value<{ id: string }>(await api.create({ register: 'tickets', fields: { what: 'The upload page times out' } }, owner)).id)!;
  const payable = api.kernel.nameOf(value<{ id: string }>(await api.create({ register: 'payables', fields: { what: 'Studio rent for November' } }, owner)).id)!;
  return { sql, api, pages, reader, ticket, payable };
}

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Upload audit</title>
<style>body{font:15px system-ui} .shot{background:url("img/shot.png")}</style></head>
<body><h1>Upload audit</h1><img src="img/shot.png" alt="before"><a href="#fix">The fix</a><p id="fix">Import the proxy settings.</p>
<script>document.querySelector('h1').textContent += ' (drawn)';</script></body></html>`;

type Attached = { visual: string; version: number; title: string; on: string; pictures: number; batch: string | null; said: string; unchanged?: true };
type Listed = { id: string; title: string; version: number; versions: number; by: string; pictures: { name: string }[] };

test('A PAGE AND ITS PICTURE HANG ON A TASK, signed by who made it, its title from the page, its bytes in the store', async () => {
  const { api, pages, ticket } = await record();
  const got = value<Attached>(await api.attachVisual({ on: ticket, page: PAGE, pictures: [{ name: 'img/shot.png', sha256: SHOT }] }, owner));
  assert.equal(got.title, 'Upload audit');
  assert.equal(got.version, 1);
  assert.match(got.said, /^Put "Upload audit" on "The upload page times out" in Tickets, with one picture\.$/u);
  assert.equal(pages.size, 1, 'the page went to the store and not into the record');

  const [one] = value<{ visuals: Listed[] }>(await api.visuals({ on: ticket }, owner)).visuals;
  assert.deepEqual([one!.title, one!.version, one!.versions, one!.by, one!.pictures.map((p) => p.name)], ['Upload audit', 1, 1, 'p_owner', ['img/shot.png']]);
  const read = value<{ page: string; on: string }>(await api.visual({ id: one!.id }, owner));
  assert.ok(read.page.includes('<h1>Upload audit</h1>') && !read.page.includes('<meta'), 'kept whole, its meta tags taken out');
  /* AND IT IS IN THE THING'S OWN HISTORY, a note anybody reading the task reads. */
  const row = api.kernel.get(ticket)!;
  const lines = value<{ note: string | null }[]>(await api.history({ register: row.register, seq: row.seq! }, owner));
  assert.ok(lines.some((l) => l.note === 'Added the visual "Upload audit".'), JSON.stringify(lines.map((l) => l.note)));
});

test('THE SAME TITLE AGAIN IS THE NEXT VERSION, the same page again writes nothing, and each version stays readable', async () => {
  const { api, sql, ticket } = await record();
  const first = value<Attached>(await api.attachVisual({ on: ticket, page: PAGE, pictures: [{ name: 'img/shot.png', sha256: SHOT }] }, owner));
  const second = value<Attached>(await api.attachVisual({ on: ticket, page: '<h1>Upload audit, fixed</h1>', title: 'upload  AUDIT' }, owner));
  assert.equal(second.visual, first.visual);
  assert.equal(second.version, 2);
  const again = value<Attached>(await api.attachVisual({ on: ticket, page: '<h1>Upload audit, fixed</h1>', title: 'upload  AUDIT' }, owner));
  assert.equal(again.unchanged, true);
  assert.equal(again.batch, null);
  assert.equal(Number(sql.one<{ n: number }>("SELECT count(*) AS n FROM event WHERE field GLOB 'visual:*'")?.n), 2, 'the third hand-in wrote no line');
  const v1 = value<{ page: string; version: number; versions: unknown[] }>(await api.visual({ id: first.visual, version: 1 }, owner));
  assert.equal(v1.version, 1);
  assert.equal(v1.versions.length, 2);
  assert.ok(v1.page.includes('img/shot.png'));
  /* ONLY NEW BYTES WEIGH: the page twice, the picture once. */
  const weight = Number(sql.one<{ next: number }>("SELECT next FROM counter WHERE name = 'visual-bytes'")?.next);
  assert.equal(weight, 40_000 + new TextEncoder().encode(PAGE.replace(/<meta\b[^>]*>/gu, '')).byteLength + new TextEncoder().encode('<h1>Upload audit, fixed</h1>').byteLength);
});

test('BY ITS NAME: one thing called that is it, and a name nothing has is the sentence a hidden thing gets', async () => {
  const { api, reader, payable } = await record();
  value(await api.attachVisual({ on: 'the upload page TIMES out', page: '<p>Seen.</p>', title: 'Note' }, owner));
  const hidden = refused(await api.visuals({ on: payable }, reader));
  const missing = refused(await api.visuals({ on: 'Nothing is called this' }, reader));
  assert.equal(hidden.code, 'REF_UNKNOWN');
  assert.deepEqual(hidden, missing);
  value(await api.create({ register: 'tickets', fields: { what: 'Twice' } }, owner));
  value(await api.create({ register: 'tickets', fields: { what: 'Twice' } }, owner));
  assert.equal(refused(await api.attachVisual({ on: 'Twice', page: '<p>x</p>', title: 'x' }, owner)).code, 'NAME_AMBIGUOUS');
});

test('THE PAGE IS HELD TO THE FRAME IN WORDS: no address off it, no network in its script, and only pictures that were kept', async () => {
  const { api, ticket } = await record();
  const no = async (page: string, pictures: { name: string; sha256: string }[] = []) => refused(await api.attachVisual({ on: ticket, page, title: 'T', pictures }, owner));
  assert.match((await no('<img src="https://example.com/x.png">')).fix, /^This page cannot be kept because its src names https:\/\/example\.com\/x\.png/u);
  assert.match((await no('<a href="other.html">More</a>')).fix, /its href names other\.html/u);
  assert.match((await no('<link rel="stylesheet" href="https://fonts.example/css">')).fix, /loads a stylesheet or a font from elsewhere/u);
  assert.match((await no('<script>fetch("/api/boot")</script>')).fix, /calls the network/u);
  assert.match((await no('<div style="background:url(img/gone.png)"></div>')).fix, /url\(\) in it names img\/gone\.png/u);
  assert.equal((await no('<img src="img/x.png">', [{ name: 'img/x.png', sha256: 'd'.repeat(64) }])).code, 'REF_UNKNOWN');
  assert.match((await no('<img src="doc.pdf">', [{ name: 'doc.pdf', sha256: 'c'.repeat(64) }])).fix, /not a picture a visual shows/u);
  assert.match((await no('<img src="big.jpg">', [{ name: 'big.jpg', sha256: BIG }])).fix, /come to 21\.0 MB/u);
  assert.equal((await no('<img src="../x.png">', [{ name: '../x.png', sha256: SHOT }])).at, 'pictures');
  /* PROSE THAT SAYS "IMPORT" OR NAMES AN ADDRESS IS PROSE, and is kept. */
  value(await api.attachVisual({ on: ticket, page: '<p>We import data from https://example.com every night.</p>', title: 'Prose' }, owner));
});

test('WHO MAY: a reader of the list may not, an agent at propose may on a question and not on a task', async () => {
  const { api, reader, ticket } = await record();
  assert.equal(refused(await api.attachVisual({ on: ticket, page: '<p>x</p>', title: 'x' }, reader)).code, 'LEVEL_REQUIRED');
  const asks = agent('propose');
  assert.ok(!(await api.attachVisual({ on: ticket, page: '<p>x</p>', title: 'x' }, asks)).ok);
  const q = value<{ id: string }>(
    await api.propose({ question: 'Which upload fix?', body_kind: 'options', body: { options: [{ id: 'a', label: 'Proxy', because: 'It times out there.' }, { id: 'b', label: 'Page', because: 'It is slow.' }] } } as never, asks),
  );
  const got = value<Attached>(await api.attachVisual({ on: q.id, page: '<p>Proxy against page, side by side.</p>', title: 'The two fixes' }, asks));
  assert.equal(got.on, 'the question "Which upload fix?"');
  const [one] = value<{ visuals: Listed[] }>(await api.visuals({ on: q.id }, owner)).visuals;
  assert.match(one!.by, /^S\d+$/u, 'an agent signs as its run');
});

test('THE RECEIPT TAKES IT BACK: an agent undoes its own visual, and a new version goes back to the one before', async () => {
  const { api, ticket } = await record();
  const writes = agent('write');
  const first = value<Attached>(await api.attachVisual({ on: ticket, page: '<h1>One</h1>', title: 'Plan' }, writes));
  const second = value<Attached>(await api.attachVisual({ on: ticket, page: '<h1>Two</h1>', title: 'Plan' }, writes));
  assert.equal(second.version, 2);

  const back = value<{ put: number; lines: string[] }>(await api.undoOwn({ batch: second.batch! }, writes));
  assert.equal(back.put, 1);
  assert.deepEqual(back.lines, ['Puts the earlier version of the visual "Plan" back.']);
  const [now] = value<{ visuals: Listed[] }>(await api.visuals({ on: ticket }, owner)).visuals;
  assert.equal(now!.version, 1, 'it stands at its first version again');
  assert.equal(value<{ page: string }>(await api.visual({ id: first.visual }, owner)).page, '<h1>One</h1>');
  assert.equal(value<{ put: number }>(await api.undoOwn({ batch: second.batch! }, writes)).put, 0, 'undone once');

  value(await api.undoOwn({ batch: first.batch! }, writes));
  assert.deepEqual(value<{ visuals: Listed[] }>(await api.visuals({ on: ticket }, owner)).visuals, [], 'taken away');
  /* EVERY VERSION STAYS IN ITS HISTORY, readable by number. */
  assert.equal(value<{ page: string }>(await api.visual({ id: first.visual, version: 2 }, owner)).page, '<h1>Two</h1>');
  assert.equal(refused(await api.visual({ id: first.visual }, owner)).at, 'version');
});

test("THE OWNER'S UNDO PUTS IT BACK TOO, and leaves it when somebody drew on it since", async () => {
  const { api, ticket } = await record();
  const mine = value<Attached>(await api.attachVisual({ on: ticket, page: '<h1>Mine</h1>', title: 'Plan' }, owner));
  value(await api.attachVisual({ on: ticket, page: '<h1>Theirs</h1>', title: 'Plan' }, agent('write')));
  const plan = value<{ steps: unknown[]; skipped: { why: string }[] }>(await api.undo({ batch: mine.batch!, dry: true }, owner));
  assert.equal(plan.steps.length, 0);
  assert.match(plan.skipped[0]!.why, /has changed it since/u);
});

test('EACH VERSION NAMES THE WRITE IT WAS MADE IN, so the app undoes the newest from the visual alone', async () => {
  const { api, ticket } = await record();
  const first = value<Attached>(await api.attachVisual({ on: ticket, page: '<h1>One</h1>', title: 'Plan' }, owner));
  const second = value<Attached>(await api.attachVisual({ on: ticket, page: '<h1>Two</h1>', title: 'Plan' }, owner));
  const read = value<{ versions: { version: number; batch: string | null }[] }>(await api.visual({ id: first.visual }, owner));
  assert.deepEqual(read.versions.map((v) => [v.version, v.batch]), [[1, first.batch], [2, second.batch]]);
  const plan = value<{ hash: string; steps: unknown[] }>(await api.undo({ batch: read.versions[1]!.batch!, dry: true }, owner));
  assert.equal(plan.steps.length, 1);
});
