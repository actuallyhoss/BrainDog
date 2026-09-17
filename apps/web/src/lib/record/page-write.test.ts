/**
 * A declared page's writes: a moved card and a ticked task become one `update` of the row they came from, at the version
 * the page read, and the answer is written, the record's sentence, a conflict, or no record at all.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { copy } from '../copy.ts';
import { REGISTERS } from './data.ts';
import type { Fetch as ClientFetch } from './pages-live.ts';
import { arrangedBody, movePatch, saveArrangement, schemaOf, tickPatch, updateRow, type Fetch } from './page-write.ts';

const BASE = 'http://record.test';

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function host(answer: (() => Response) | null): { io: Fetch; sent: { url: string; init: RequestInit | undefined }[] } {
  const sent: { url: string; init: RequestInit | undefined }[] = [];
  const io: Fetch = async (url, init) => {
    sent.push({ url, init });
    if (!answer) throw new TypeError('fetch failed');
    return answer();
  };
  return { io, sent };
}

/* A register the sample declares with a state and terminal states, whichever it is. */
const withState = Object.values(REGISTERS).find((r) => r.state && (r.done?.length ?? 0) > 0 && r.fields.some((f) => f.id === r.state && (f.values?.length ?? 0) > 1));

test('a ticked task is its register state: the first terminal one, and back to the first that is not', () => {
  assert.ok(withState, 'the sample declares no register with a state and terminal states');
  const field = withState.state!;
  const values = withState.fields.find((f) => f.id === field)!.values!;
  const ref = { register: withState.id, seq: 1, version: 1 };
  assert.deepEqual(tickPatch(ref, true), { [field]: withState.done![0] });
  assert.deepEqual(tickPatch(ref, false), { [field]: values.find((v) => !withState.done!.includes(v)) });
  assert.equal(tickPatch({ register: 'no-such-list', seq: 1, version: 1 }, true), null);
});

test("a moved card's column goes back to the declared value", () => {
  assert.ok(withState);
  const field = withState.state!;
  const declared = withState.fields.find((f) => f.id === field)!.values!.find((v) => v.includes('_')) ?? withState.done![0]!;
  const drawn = declared.replaceAll('_', ' ').toUpperCase();
  assert.deepEqual(movePatch({ register: withState.id, seq: 1, version: 1 }, field, drawn), { [field]: declared });
});

test('A LIST THIS BUILD HAS NEVER HEARD OF IS TICKED AND MOVED BY THE STATES THE RECORD DECLARES FOR IT', async () => {
  const shots = {
    id: 'shots',
    state: 'stage',
    done: ['wrapped', 'cut'],
    fields: [{ id: 'stage', type: 'enum', values: ['to_shoot', 'in_edit', 'wrapped', 'cut'] }],
  };
  const ref = { register: 'shots', seq: 4, version: 2 };
  assert.equal(tickPatch(ref, true), null, 'the fixture is a register the built-in sample declares');
  assert.deepEqual(tickPatch(ref, true, shots), { stage: 'wrapped' });
  assert.deepEqual(tickPatch(ref, false, shots), { stage: 'to_shoot' });
  assert.deepEqual(movePatch(ref, 'stage', 'In edit', shots), { stage: 'in_edit' });

  let asked = 0;
  const io: ClientFetch = async (input) => {
    asked++;
    assert.ok(String(input).endsWith('/api/schema?register=shots'), String(input));
    return json(200, { ok: true, value: shots });
  };
  assert.deepEqual(await schemaOf('http://schema.test', 'shots', io), shots);
  assert.deepEqual(await schemaOf('http://schema.test', 'shots', io), shots);
  assert.equal(asked, 1, 'a register was asked for again on the next gesture');
  const refused: ClientFetch = async () => json(403, { ok: false, refusal: { code: 'FORBIDDEN', fix: 'No.' } });
  assert.equal(await schemaOf('http://schema.test', 'other', refused), null);
});

test('the change is one update of that row at the version the page read, with the session', async () => {
  const { io, sent } = host(() => json(200, { ok: true, value: { id: 'e_1', seq: 4, version: 9 } }));
  const out = await updateRow(BASE, { register: 'tasks', seq: 4, version: 8 }, { state: 'done' }, 'Send the invoice', io);
  assert.deepEqual(out, { from: 'written' });
  assert.equal(sent[0]!.url, `${BASE}/api/update`);
  assert.equal(sent[0]!.init?.method, 'POST');
  assert.equal(sent[0]!.init?.credentials, 'same-origin');
  assert.deepEqual(JSON.parse(String(sent[0]!.init?.body)), { register: 'tasks', seq: 4, patch: { state: 'done' }, version: 8 });
});

test("a refusal is the record's sentence, and a row changed first is a conflict", async () => {
  const fix = 'done is not a state tasks can move to from dropped.';
  const refused = host(() => json(422, { ok: false, refusal: { code: 'TRANSITION_ILLEGAL', fix } }));
  assert.deepEqual(await updateRow(BASE, { register: 'tasks', seq: 4, version: 8 }, {}, 'Send the invoice', refused.io), { from: 'refused', fix });

  const moved = host(() => json(409, { ok: false, conflict: { current: {}, actor: 'p_2' } }));
  assert.deepEqual(await updateRow(BASE, { register: 'tasks', seq: 4, version: 8 }, {}, 'Send the invoice', moved.io), {
    from: 'conflict',
    fix: copy.pageRowConflict('Send the invoice'),
  });
});

test('no record is a calm sentence and never the error text', async () => {
  assert.deepEqual(await updateRow(BASE, { register: 'tasks', seq: 4, version: 8 }, {}, 'x', host(null).io), {
    from: 'unreachable',
    fix: copy.recordNotReached,
  });
});

/* ── arranging a page ─────────────────────────────────────────────────── */

const BODY = {
  page: 'money',
  title: 'Money',
  nav: { section: 'Work', order: 1 },
  blocks: [
    { kind: 'stat', span: 12, cells: ['owed'] },
    { kind: 'table', span: 12, source: 'register.obligations' },
    { kind: 'list', span: 6, source: 'register.tasks' },
  ],
};

test('AN ARRANGED BODY IS THE STORED ONE REORDERED AND RESIZED, with an added block declared where it was put', () => {
  const added = { kind: 'chips', source: 'register.obligations', columns: [{ field: 'state', label: 'State', width: 'minmax(8ch,1fr)', align: 'start' }], rows: [] };
  const out = arrangedBody(BODY, [{ i: 2, span: 12 }, { i: 3, span: 4 }, { i: 0, span: 6 }], [added]);
  assert.deepEqual(out, {
    page: 'money',
    title: 'Money',
    nav: { section: 'Work', order: 1 },
    blocks: [
      { kind: 'list', span: 12, source: 'register.tasks' },
      { kind: 'chips', span: 4, source: 'register.obligations', columns: [{ field: 'state', label: 'State' }] },
      { kind: 'stat', span: 6, cells: ['owed'] },
    ],
  });
  assert.equal(arrangedBody(BODY, [{ i: 9, span: 12 }], []), null, 'a place past both lists was written as a guess');
});

test('DONE READS THE STORED BODY, SETS IT WHOLE, and hands back the one before for undo', async () => {
  const sent: { url: string; body: unknown }[] = [];
  const io: ClientFetch = async (input, init) => {
    const url = String(input);
    sent.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
    if (url.includes('/api/page')) return json(200, { ok: true, value: { nav: BODY.nav, page: BODY.page, title: BODY.title, blocks: BODY.blocks.map((b) => ({ ...b, rows: [], drawn: true })) } });
    return json(200, { ok: true, value: { id: 'page.money' } });
  };
  const out = await saveArrangement(BASE, 'money', 3, [{ i: 1, span: 12 }, { i: 0, span: 12 }, { i: 2, span: 6 }], [], io);
  assert.equal(out.from, 'written');
  assert.deepEqual(out.from === 'written' && out.before.blocks.map((b) => b.kind), ['stat', 'table', 'list']);
  const set = sent.find((s) => s.url.endsWith('/api/setDeclaration'));
  assert.deepEqual((set?.body as { body: { blocks: { kind: string }[] } }).body.blocks.map((b) => b.kind), ['table', 'stat', 'list']);
  assert.ok(!JSON.stringify(set?.body).includes('drawn'), 'the answer was written back as the declaration');
  assert.equal(Object.keys((set?.body as { body: object }).body)[0], 'page', 'the record reads a declaration by its first key, and it was not page');

  /* A page that gained a block since it was drawn is not written over. */
  const moved = await saveArrangement(BASE, 'money', 2, [{ i: 0, span: 12 }], [], io);
  assert.deepEqual(moved, { from: 'refused', fix: copy.arrangeMoved });

  /* A template's answer is one row's expansion, and is never set. */
  const template: ClientFetch = async () => json(200, { ok: true, value: { ...BODY, for: { register: 'projects' }, param: { register: 'projects', seq: 1, title: 'Kiln' } } });
  assert.deepEqual(await saveArrangement(BASE, 'kiln', 3, [], [], template), { from: 'refused', fix: copy.arrangeTemplate });

  const refused: ClientFetch = async (url) =>
    String(url).includes('/api/page') ? json(200, { ok: true, value: BODY }) : json(403, { ok: false, refusal: { code: 'FORBIDDEN', fix: 'Only an owner or an admin sets a declaration.' } });
  assert.deepEqual(await saveArrangement(BASE, 'money', 3, [{ i: 0, span: 12 }], [], refused), { from: 'refused', fix: 'Only an owner or an admin sets a declaration.' });
});

test('DONE WRITES AGAINST THE VERSION THE SCREEN DREW, and a page arranged by somebody else meanwhile is not written over', async () => {
  const sent: { url: string; body: unknown }[] = [];
  let answer: unknown = { ok: true, value: [{ id: 'page.money', version: 5, changed: true }] };
  const io: ClientFetch = async (input, init) => {
    const url = String(input);
    sent.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
    if (url.includes('/api/page')) return json(200, { ok: true, value: { ...BODY, read_at: '2026-09-17T12:00:00.000Z', declared_version: 4 } });
    return json((answer as { ok: boolean }).ok ? 200 : 409, answer);
  };
  const out = await saveArrangement(BASE, 'money', 3, [{ i: 1, span: 12 }, { i: 0, span: 12 }, { i: 2, span: 6 }], [], io, 4);
  assert.deepEqual(out.from === 'written' && out.version, 5, 'the undo was not handed the version the write made');
  const set = sent.find((s) => s.url.endsWith('/api/setDeclaration'))?.body as { version?: number; body: object };
  assert.equal(set.version, 4);
  assert.ok(!('read_at' in set.body) && !('declared_version' in set.body), 'what the answer carried was written back as the declaration');

  /* Drawn at 3 and now at 4: somebody arranged it in between. Nothing is sent. */
  sent.length = 0;
  assert.deepEqual(await saveArrangement(BASE, 'money', 3, [{ i: 0, span: 12 }], [], io, 3), { from: 'refused', fix: copy.arrangeMoved });
  assert.equal(sent.filter((s) => s.url.endsWith('/api/setDeclaration')).length, 0);

  /* Moved between the read and the write: the record's conflict says the same. */
  answer = { ok: false, conflict: { version: 5, current: null, actor: 'in-app' } };
  assert.deepEqual(await saveArrangement(BASE, 'money', 3, [{ i: 0, span: 12 }], [], io, 4), { from: 'refused', fix: copy.arrangeMoved });
});
