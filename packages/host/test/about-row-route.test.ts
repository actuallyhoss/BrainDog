/**
 * `about` over the wire, asked by the row (`src/routes/about.ts`): the web's "Where it was seen" asks
 * `GET /api/about?row={"register":...,"seq":N}`, and the route took `name` alone, so the row reached the record as a
 * string and was refused at `row` with a 422 on every project page. Through the host's handler on a fresh record: the
 * row form answers the row, the name form still answers, a row with no number is refused at `row` in the record's
 * own sentence, and a key the route does not take still reaches no answer.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { handlersFor, serveApi } from '../src/index.ts';
import { ROUTES as OWN } from '../src/routes/about.ts';
import { createRecordApi, type CallContext } from '@braindog/record';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 14, 12);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

const THINGS = {
  id: 'register.things',
  kind: 'register' as const,
  body: {
    id: 'things',
    name: 'Projects',
    title: 'name',
    search: ['name'],
    scopes: { repos: 'repos' },
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'repos', type: 'list', of: 'text' },
    ],
  } as never,
};

const NOTES = {
  id: 'register.notes',
  kind: 'register' as const,
  body: {
    id: 'notes',
    name: 'Notes',
    title: 'subject',
    search: ['subject', 'body'],
    fields: [
      { id: 'subject', type: 'text', required: true },
      { id: 'body', type: 'text' },
    ],
  } as never,
};

type Body = { ok: boolean; value?: { is: { name: string; register: string; seq: number; seen: { where: string }[] } | null }; refusal?: { code: string; fix: string; at?: string } };

const must = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

/** A project, a note that names it, and the host's handlers over the record. */
async function served() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  must(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-kiln', name: 'The Kiln', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }));
  must(await api.kernel.install([THINGS, NOTES] as never));
  const add = (register: string, fields: Record<string, unknown>) => must<{ seq: number }>(api.kernel.create(register, fields as never, { actor: 'p_1' }));
  add('things', { name: 'Larkspur' });
  const project = add('things', { name: 'Quillmoor', repos: ['git@example.test:kiln/quillmoor.git'] });
  add('notes', { subject: 'Call with the binders', body: 'Quillmoor goes to the binders on Friday.' });
  const handlers = handlersFor(api as never);
  const get = async (query: string) => {
    const res = await serveApi(new Request(`https://x/api/about?${query}`), handlers, owner);
    return { status: res.status, body: (await res.json()) as Body };
  };
  return { sql, project, get };
}

const rowQuery = (row: unknown) => `row=${encodeURIComponent(JSON.stringify(row))}`;

test('THE ROUTE TAKES BOTH FORMS: the name as text, the row as JSON', () => {
  assert.deepEqual(OWN.map((r) => [r.name, r.group, r.writes]), [['about', 'READ+', false]]);
  assert.deepEqual(OWN[0]!.takes, { name: 'text', row: 'json' });
});

test('ASKED BY THE ROW OVER A GET, it answers 200 with `is` naming that row', async () => {
  const { sql, project, get } = await served();
  const { status, body } = await get(rowQuery({ register: 'things', seq: project.seq }));
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.ok, true);
  assert.equal(body.value?.is?.name, 'Quillmoor');
  assert.equal(body.value?.is?.register, 'things');
  assert.equal(body.value?.is?.seq, project.seq);
  assert.deepEqual(body.value?.is?.seen.map((s) => s.where), ['Notes: Call with the binders']);
  sql.close();
});

test('ASKED BY THE NAME, it still answers the same thing', async () => {
  const { sql, project, get } = await served();
  const byName = await get('name=Quillmoor');
  assert.equal(byName.status, 200);
  assert.equal(byName.body.value?.is?.seq, project.seq);
  const byRow = await get(rowQuery({ register: 'things', seq: project.seq }));
  assert.deepEqual(byRow.body, byName.body);
  sql.close();
});

test('A ROW WITH NO NUMBER is refused at `row`, in the record\'s own sentence', async () => {
  const { sql, get } = await served();
  const { status, body } = await get(rowQuery({ register: 'things' }));
  assert.equal(status, 422);
  assert.equal(body.ok, false);
  assert.equal(body.refusal?.code, 'VALUE_MALFORMED');
  assert.equal(body.refusal?.at, 'row');
  assert.match(body.refusal?.fix ?? '', /row names a list by its id and one of its rows by its number/u);
  sql.close();
});

test('A ROW THAT IS NOT JSON is refused at `row` by the route, before the record', async () => {
  const { sql, get } = await served();
  const { status, body } = await get('row=things%233');
  assert.equal(status, 422);
  assert.equal(body.refusal?.code, 'VALUE_MALFORMED');
  assert.equal(body.refusal?.at, 'row');
  sql.close();
});

test('A KEY THE ROUTE DOES NOT TAKE is still refused: it names no form, so the record asks for the name', async () => {
  const { sql, get } = await served();
  const { status, body } = await get('thing=Quillmoor');
  assert.equal(status, 422);
  assert.equal(body.ok, false);
  assert.equal(body.refusal?.at, 'name');
  sql.close();
});
