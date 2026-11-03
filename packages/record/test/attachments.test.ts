/**
 * Attachments at the record (`methods/attachments.ts`): a file put on a task, typed by its bytes and name, its words read
 * once for agents, kept as versions signed by who put each, seen by whoever sees the thing and nobody else (the file
 * door's `fileHeld` included), changed only by who may, and put back after a removal.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';

import { createRecordApi, type CallContext, type VisualStore } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { pdfText } from '../../kernel/src/attachment.ts';
import { PEOPLE } from '../../../fixtures/names.ts';

const NOW = Date.UTC(2026, 10, 3, 12);

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
const agent: CallContext = { principal: { kind: 'token', id: 't_write', scope: 'write', person: 'p_owner', level: 'owner' }, session: { agent: 'claude', client_id: 'c-write' } };

const sha = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex');

/** A PDF of one page with two lines of text, its content stream deflated as most writers write one. */
function pdf(lines: string[]): Uint8Array {
  const content = `BT /F1 18 Tf 72 720 Td ${lines.map((l, i) => `${i === 0 ? '' : '0 -24 Td '}(${l}) Tj`).join(' ')} ET`;
  const deflated = deflateSync(Buffer.from(content, 'latin1'));
  const parts = [
    '%PDF-1.4\n',
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n',
    `4 0 obj << /Length ${deflated.length} /Filter /FlateDecode >> stream\n`,
  ];
  const tail = '\nendstream endobj\n5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n';
  return Buffer.concat([Buffer.from(parts.join(''), 'latin1'), deflated, Buffer.from(tail, 'latin1')]);
}

const ARTIFACT = `<!doctype html><html><head><title>Kiln dashboard</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>
<link href="https://fonts.googleapis.com/css2?family=Inter" rel="stylesheet"></head>
<body><h1>Firing schedule</h1><p>Cone 6 on Friday, glaze order due Thursday.</p><canvas id="c"></canvas>
<script>new Chart(document.getElementById('c'), { type: 'bar', data: { labels: ['Mon'], datasets: [{ data: [3] }] } });</script></body></html>`;

/** A host's store in memory: files and pages by hash, as the file door and the page store keep them. */
function memory() {
  const files = new Map<string, Uint8Array>();
  const pages = new Map<string, Uint8Array>();
  const store: VisualStore = {
    putPage: async (hash, bytes) => void pages.set(hash, Uint8Array.from(bytes)),
    getPage: async (hash) => pages.get(hash) ?? null,
    file: async (hash) => (files.has(hash) ? { bytes: files.get(hash)!.byteLength, mime: 'application/octet-stream' } : null),
    getFile: async (hash) => files.get(hash) ?? null,
    putFile: async (hash, bytes) => void files.set(hash, Uint8Array.from(bytes)),
  };
  /** What the file door does on a put: keeps the bytes under their hash, and answers it. */
  const put = (bytes: Uint8Array): string => {
    const h = sha(bytes);
    files.set(h, bytes);
    return h;
  };
  return { store, files, pages, put };
}

async function record() {
  const sql = openSqlite();
  const { store, files, pages, put } = memory();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW), visuals: store });
  value(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAE', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: owner.principal.id } }));
  value(await api.kernel.install([list('tasks', 'Tasks'), list('projects', 'Projects')]));
  value(await api.invite({ person: 'p_reader', name: PEOPLE[3]!.name, registers: { tasks: 'read' } } as never, owner));
  value(await api.invite({ person: 'p_helper', name: PEOPLE[4]!.name, registers: { tasks: 'write' } } as never, owner));
  sql.exec('INSERT INTO token (id, person_id, hash, scope, label, created_at) VALUES (?, ?, ?, ?, ?, ?)', 't_write', 'p_owner', 'h_write', 'write', 'Claude', new Date(NOW).toISOString());
  const as = (id: string): CallContext => {
    const held = api.kernel.access(id)!;
    return { principal: { kind: 'person', id, level: held.level }, ...(held.registers === null ? {} : { registers: held.registers }), levels: held.levels };
  };
  const task = api.kernel.nameOf(value<{ id: string }>(await api.create({ register: 'tasks', fields: { what: 'Fire the kiln' } }, owner)).id)!;
  const project = api.kernel.nameOf(value<{ id: string }>(await api.create({ register: 'projects', fields: { what: 'Spring show' } }, owner)).id)!;
  return { sql, api, files, pages, put, task, project, reader: as('p_reader'), helper: as('p_helper') };
}

type Listed = { id: string; name: string; kind: string; mime: string; bytes: number; sha256: string; version: number; versions: number; by: string; chars: number };
type Read = Listed & { text: string | null; gone: boolean; more: number | null; history: { version: number }[] };

test('A PDF READS TO ITS WORDS: a deflated content stream, the text operators, a line each', async () => {
  const text = await pdfText(pdf(['Kiln brief: fire at cone 6', 'Glaze order due Friday']));
  assert.equal(text, 'Kiln brief: fire at cone 6\nGlaze order due Friday');
  assert.equal(await pdfText(new TextEncoder().encode('not a pdf')), null);
});

test('A PDF ATTACHED TO A TASK: typed by its bytes, its words kept for agents, signed by who put it, in the history', async () => {
  const { api, put, task } = await record();
  const bytes = pdf(['Kiln brief: fire at cone 6', 'Glaze order due Friday']);
  const got = value<{ id: string; kind: string; version: number; said: string }>(await api.attachFile({ on: task, name: 'brief.pdf', sha256: put(bytes) }, owner));
  assert.equal(got.kind, 'pdf');
  assert.equal(got.version, 1);
  assert.equal(got.said, 'Attached brief.pdf to "Fire the kiln" in Tasks.');
  const [one] = value<{ attachments: Listed[] }>(await api.attachments({ on: task }, owner)).attachments;
  assert.deepEqual([one!.name, one!.kind, one!.mime, one!.bytes, one!.by], ['brief.pdf', 'pdf', 'application/pdf', bytes.byteLength, 'p_owner']);
  const read = value<Read>(await api.attachment({ id: got.id }, owner));
  assert.equal(read.text, 'Kiln brief: fire at cone 6\nGlaze order due Friday');
  const row = api.kernel.get(task)!;
  const lines = value<{ note: string | null }[]>(await api.history({ register: row.register, seq: row.seq! }, owner));
  assert.ok(lines.some((l) => l.note === 'Attached brief.pdf.'), JSON.stringify(lines.map((l) => l.note)));
});

test("AN AGENT ATTACHES AN ARTIFACT'S HTML AS TEXT: a page, CDN scripts and all, and its words read for the next agent", async () => {
  const { api, files, project } = await record();
  const got = value<{ id: string; kind: string }>(await api.attachFile({ on: project, name: 'dashboard.html', text: ARTIFACT }, agent));
  assert.equal(got.kind, 'page');
  assert.equal(files.size, 1, 'the bytes went to the file store, not the record');
  const read = value<Read>(await api.attachment({ id: got.id }, agent));
  assert.equal(read.mime, 'text/html');
  assert.match(read.text ?? '', /^Kiln dashboard\n\nFiring schedule\nCone 6 on Friday, glaze order due Thursday\.\n/u);
  assert.match(read.text ?? '', /The page draws itself with script\. Its script:\n\nnew Chart/u, 'a page with few words hands its script on too');
  assert.notEqual(read.by, 'p_owner', "signed by the agent's run, not the person");
});

test('THE SAME NAME AGAIN IS THE NEXT VERSION, the same bytes again write nothing, and only new bytes weigh', async () => {
  const { api, sql, put, task } = await record();
  const a = pdf(['First draft']);
  const b = pdf(['Second draft']);
  const first = value<{ id: string }>(await api.attachFile({ on: task, name: 'brief.pdf', sha256: put(a) }, owner));
  const second = value<{ id: string; version: number }>(await api.attachFile({ on: task, name: 'Brief.PDF', sha256: put(b) }, owner));
  assert.equal(second.id, first.id);
  assert.equal(second.version, 2);
  const again = value<{ unchanged?: true; batch: string | null }>(await api.attachFile({ on: task, name: 'brief.pdf', sha256: sha(b) }, owner));
  assert.equal(again.unchanged, true);
  assert.equal(Number(sql.one<{ n: number }>("SELECT count(*) AS n FROM event WHERE field GLOB 'attached:*'")?.n), 2);
  const v1 = value<Read>(await api.attachment({ id: first.id, version: 1 }, owner));
  assert.equal(v1.text, 'First draft');
  assert.equal(v1.history.length, 2);
  const weight = Number(sql.one<{ next: number }>("SELECT next FROM counter WHERE name = 'attachment-bytes'")?.next);
  assert.equal(weight, a.byteLength + b.byteLength + 'First draft'.length + 'Second draft'.length);
});

test('WHO SEES THE THING SEES ITS FILES, and the file door answers the bytes to nobody else', async () => {
  const { api, put, task, project, reader } = await record();
  const onTask = put(pdf(['On the task']));
  const onProject = put(pdf(['On the project']));
  value(await api.attachFile({ on: task, name: 'task.pdf', sha256: onTask }, owner));
  value(await api.attachFile({ on: project, name: 'project.pdf', sha256: onProject }, owner));
  /* THE READER IS INVITED TO TASKS ALONE. */
  assert.equal(value<{ attachments: Listed[] }>(await api.attachments({ on: task }, reader)).attachments.length, 1);
  const hidden = refused(await api.attachments({ on: project }, reader));
  assert.deepEqual(hidden, refused(await api.attachments({ on: 'Nothing is called this' }, reader)), 'a hidden thing and a missing one are one sentence');
  assert.equal(api.fileHeld(onTask, reader), false, 'the bytes of a file on a task she reads');
  assert.equal(api.fileHeld(onProject, reader), true, 'and not of one on a project she cannot see, though she holds its hash');
  assert.equal(api.fileHeld(onProject, owner), false);
  const id = value<{ attachments: Listed[] }>(await api.attachments({ on: project }, owner)).attachments[0]!.id;
  assert.equal(refused(await api.attachment({ id }, reader)).code, 'REF_UNKNOWN');
});

test("WHO MAY CHANGE ONE: a reader adds and takes off nothing, an agent takes off its own but never a person's file", async () => {
  const { api, put, task, reader, helper } = await record();
  assert.equal(refused(await api.attachFile({ on: task, name: 'x.pdf', sha256: put(pdf(['x'])) }, reader)).code, 'LEVEL_REQUIRED');
  const his = value<{ id: string }>(await api.attachFile({ on: task, name: 'owner.pdf', sha256: put(pdf(['owner'])) }, owner));
  const its = value<{ id: string }>(await api.attachFile({ on: task, name: 'agent.md', text: '# From the agent' }, agent));
  assert.equal(refused(await api.removeAttachment({ id: his.id }, reader)).code, 'LEVEL_REQUIRED');
  assert.equal(refused(await api.removeAttachment({ id: his.id }, agent)).code, 'FORBIDDEN');
  value(await api.removeAttachment({ id: its.id }, agent));
  /* A MEMBER WHO WRITES THE LIST CHANGES ANYBODY'S. */
  value(await api.renameAttachment({ id: his.id, name: 'Kiln notes.pdf' }, helper));
  const names = value<{ attachments: Listed[] }>(await api.attachments({ on: task }, owner)).attachments.map((a) => a.name);
  assert.deepEqual(names, ['Kiln notes.pdf']);
});

test('REMOVED, THEN PUT BACK: the removal leaves the bytes, and Undo is a put back at the version it stood at', async () => {
  const { api, put, task } = await record();
  const got = value<{ id: string }>(await api.attachFile({ on: task, name: 'brief.pdf', sha256: put(pdf(['Kept'])) }, owner));
  value(await api.removeAttachment({ id: got.id }, owner));
  assert.equal(value<{ attachments: Listed[] }>(await api.attachments({ on: task }, owner)).attachments.length, 0);
  assert.equal(value<Read>(await api.attachment({ id: got.id }, owner)).gone, true);
  assert.equal(refused(await api.removeAttachment({ id: got.id }, owner)).code, 'TRANSITION_ILLEGAL');
  value(await api.restoreAttachment({ id: got.id }, owner));
  const back = value<{ attachments: Listed[] }>(await api.attachments({ on: task }, owner)).attachments;
  assert.deepEqual(back.map((a) => [a.name, a.version]), [['brief.pdf', 1]]);
});

test('A FILE THAT HOLDS A KEY IS REFUSED, and a name is a name: no path, no control characters', async () => {
  const { api, put, task } = await record();
  const env = new TextEncoder().encode('STRIPE=sk_live_4eC39HqLyjWDarjtT1zdp7dc\n');
  assert.match(refused(await api.attachFile({ on: task, name: '.env', sha256: put(env) }, owner)).fix, /looks like a key/u);
  const got = value<{ id: string; kind: string }>(await api.attachFile({ on: task, name: '../../notes\u0000.md', text: '# Notes\n\nFire Friday.' }, owner));
  assert.equal(got.kind, 'text');
  assert.equal(value<Read>(await api.attachment({ id: got.id }, owner)).name, 'notes.md');
});

test("AN ERASURE TAKES THE FILE'S BYTES AND ITS WORDS: one named for the person, one whose words name them, and none other", async () => {
  const { sql, api, files, pages, put, task } = await record();
  const named = pdf(['Contract terms', 'Signed 2 Nov']);
  const brief = pdf(['Call notes', 'Mara Quill, 07700 900123']);
  const other = pdf(['Kiln schedule', 'Cone 6 on Friday']);
  const byName = value<{ id: string }>(await api.attachFile({ on: task, name: 'mara-quill-contract.pdf', sha256: put(named) }, owner));
  const byWords = value<{ id: string }>(await api.attachFile({ on: task, name: 'call-notes.pdf', sha256: put(brief) }, owner));
  const kept = value<{ id: string }>(await api.attachFile({ on: task, name: 'kiln.pdf', sha256: put(other) }, owner));
  const pageOf = async (id: string): Promise<string> => {
    const row = sql.one<{ to_v: string }>("SELECT to_v FROM event WHERE id = ?", id)!;
    return (JSON.parse(row.to_v) as { text: { sha256: string } }).text.sha256;
  };
  const pagesBefore = { named: await pageOf(byName.id), brief: await pageOf(byWords.id), other: await pageOf(kept.id) };
  const weighed = Number(sql.one<{ next: number }>("SELECT next FROM counter WHERE name = 'attachment-bytes'")?.next);

  value(await api.erase({ subjects: ['Mara Quill'], basis: 'Article 17 request' }, owner));

  const queued = sql.all<{ payload: string }>("SELECT payload FROM outbox WHERE kind = 'erase.r2'").map((r) => JSON.parse(r.payload) as { key: string; page?: boolean });
  const fileKeys = queued.filter((q) => q.page !== true).map((q) => q.key).sort();
  const pageKeys = queued.filter((q) => q.page === true).map((q) => q.key).sort();
  assert.deepEqual(fileKeys, [sha(named), sha(brief)].sort(), 'both files named or naming her are queued to go, and no other');
  assert.deepEqual(pageKeys, [pagesBefore.named, pagesBefore.brief].sort(), 'and the pages their words were kept in');

  /* THE HOST'S HALF, as both hosts run an `erase.r2` job: the key deleted from the store. */
  for (const q of queued) (q.page === true ? pages : files).delete(q.key);
  assert.equal(files.has(sha(other)), true, 'the file that names nobody stays');
  assert.equal(pages.has(pagesBefore.other), true);

  /* NOTHING IN THE RECORD STILL NAMES HER OR POINTS AT A FILE THAT IS GONE. */
  const left = value<{ attachments: Listed[] }>(await api.attachments({ on: task }, owner)).attachments;
  assert.deepEqual(left.map((a) => a.name), ['kiln.pdf']);
  for (const id of [byName.id, byWords.id]) assert.equal(refused(await api.attachment({ id }, owner)).code, 'REF_UNKNOWN');
  const lines = sql.all<{ to_v: string | null; note: string | null }>("SELECT to_v, note FROM event WHERE field GLOB 'attached:*'");
  for (const l of lines) {
    assert.ok(!`${l.to_v} ${l.note}`.toLowerCase().includes('quill'), `a line still names her: ${l.to_v} ${l.note}`);
    assert.ok(!(l.to_v ?? '').includes(sha(named)) && !(l.to_v ?? '').includes(sha(brief)), 'a line still names erased bytes');
  }
  assert.deepEqual(api.kernel.attachmentTargetsNaming(sha(brief)), [], 'no thing holds the erased bytes, so the door has none to answer');
  const weighs = Number(sql.one<{ next: number }>("SELECT next FROM counter WHERE name = 'attachment-bytes'")?.next);
  assert.ok(weighs < weighed, 'the room they took is room again');
});

test('THE APP\'S UNDO TAKES A FILE ATTACHED OFF AGAIN, puts a removed one back, and takes a rename back', async () => {
  const { api, put, task } = await record();
  const got = value<{ id: string; batch: string }>(await api.attachFile({ on: task, name: 'brief.pdf', sha256: put(pdf(['Kept'])) }, owner));
  const plan = value<{ hash: string; lines: string[] }>(await api.undo({ batch: got.batch, dry: true }, owner));
  assert.deepEqual(plan.lines, ['Takes the file "brief.pdf" off.']);
  value(await api.undo({ batch: got.batch, hash: plan.hash }, owner));
  assert.deepEqual(value<{ attachments: Listed[] }>(await api.attachments({ on: task }, owner)).attachments, [], 'undoing the attach took it off');
  assert.equal(value<Read>(await api.attachment({ id: got.id }, owner)).gone, true, 'its version stays in its history');

  /* AND UNDOING A REMOVAL PUTS IT BACK. */
  value(await api.restoreAttachment({ id: got.id }, owner));
  const removed = value<{ batch: string }>(await api.removeAttachment({ id: got.id }, owner));
  const again = value<{ hash: string; lines: string[] }>(await api.undo({ batch: removed.batch, dry: true }, owner));
  assert.deepEqual(again.lines, ['Puts the file "brief.pdf" back.']);
  value(await api.undo({ batch: removed.batch, hash: again.hash }, owner));
  assert.deepEqual(value<{ attachments: Listed[] }>(await api.attachments({ on: task }, owner)).attachments.map((a) => [a.name, a.version]), [['brief.pdf', 1]]);

  /* AND A RENAME. */
  const renamed = value<{ batch: string }>(await api.renameAttachment({ id: got.id, name: 'Kiln brief.pdf' }, owner));
  const named = value<{ hash: string }>(await api.undo({ batch: renamed.batch, dry: true }, owner));
  value(await api.undo({ batch: renamed.batch, hash: named.hash }, owner));
  assert.deepEqual(value<{ attachments: Listed[] }>(await api.attachments({ on: task }, owner)).attachments.map((a) => a.name), ['brief.pdf']);
});

test("AN AGENT'S OWN UNDO TAKES ITS FILE OFF, and a new version gives way to the one before", async () => {
  const { api, task } = await record();
  const first = value<{ id: string; batch: string }>(await api.attachFile({ on: task, name: 'notes.md', text: '# One' }, agent));
  const second = value<{ id: string; batch: string; version: number }>(await api.attachFile({ on: task, name: 'notes.md', text: '# Two' }, agent));
  assert.equal(second.version, 2);
  const back = value<{ put: number; lines: string[] }>(await api.undoOwn({ batch: second.batch }, agent));
  assert.deepEqual(back.lines, ['Puts the earlier version of the file "notes.md" back.']);
  assert.equal(value<Read>(await api.attachment({ id: first.id }, agent)).text, '# One');
  value(await api.undoOwn({ batch: first.batch }, agent));
  assert.deepEqual(value<{ attachments: Listed[] }>(await api.attachments({ on: task }, agent)).attachments, []);
});
