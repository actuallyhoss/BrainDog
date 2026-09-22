/**
 * What points at one row, against the record: the record's groups drawn as the page's sections, the
 * sample when there is no record, the record's sentence for any other refusal, and nothing sent for
 * a row the record could not hold.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { iconFor, REGISTERS, ROWS } from './api.ts';
import { linkReader, type Fetch } from './links-live.ts';

const BASE = 'http://record.test';

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** A fetch that answers by path, and remembers what it was sent. */
function host(answer: ((url: URL) => Response) | null): { io: Fetch; sent: URL[] } {
  const sent: URL[] = [];
  const io = (async (url: string | URL | Request) => {
    const at = new URL(String(url));
    sent.push(at);
    if (!answer) throw new TypeError('fetch failed');
    return answer(at);
  }) as Fetch;
  return { io, sent };
}

const sampleFields = ROWS.services!.find((e) => e.seq === 2)!.fields;

/** One service pointing at `things#4` through its `thing` field, as the record answers it. */
const row = {
  id: '01JROW0000000000000000000',
  register: 'services',
  seq: 2,
  fields: { ...sampleFields, thing: '01JTHING000000000000000000' },
  state: null,
  version: 7,
  created_at: '2026-09-01T09:00:00.000Z',
  updated_at: '2026-09-10T09:00:00.000Z',
  deleted_at: null,
};

const record = (url: URL): Response => {
  if (url.pathname === '/api/backlinks')
    return json(200, {
      ok: true,
      value: {
        to: { register: 'things', seq: 4, id: '01JTHING000000000000000000' },
        from: [{ register: 'services', field: 'thing', matched: 3, rows: [row] }],
        cursor: 'services.thing|2026-09-10T09:00:00.000Z|01JROW0000000000000000000',
      },
    });
  if (url.pathname === '/api/list' && url.searchParams.get('register') === 'things')
    return json(200, { ok: true, value: { rows: [{ id: '01JTHING000000000000000000', seq: 4 }], cursor: null, matched: 1 } });
  return json(404, { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'There is no such method.' } });
};

test("the record's backlinks are drawn as one section per relation, named by the field that points", async () => {
  const { io, sent } = host(record);
  const out = await linkReader(BASE, io).read('things', 4);
  assert.equal(out.from, 'live');
  if (out.from !== 'live') return;

  assert.equal(out.groups.length, 1);
  const group = out.groups[0]!;
  assert.equal(group.register, 'services');
  assert.equal(group.name, 'Services', 'the register is named the way a person says it');
  /* THE FIELD'S OWN LABEL, which is what the relation MEANS and is not the name of the list it
     points at: `services.thing` is declared "Project", so the section reads "Services · Project". */
  assert.equal(group.label, 'Project');
  /* THE WHOLE COUNT, not the number drawn: the section says "All 3" only because it knows there are
     three and has one. */
  assert.equal(group.total, 3);
  assert.equal(group.rows.length, 1);
  assert.equal(group.rows[0]!.key, 'services#2');
  assert.equal(group.rows[0]!.href, '/r/services/2');
  assert.equal(group.href, '/r/services?f=thing:is:4', 'the rest are behind the list, filtered to this row');
  assert.ok(!group.columns.some((c) => c.field === 'thing'), 'the pointing field is a column of one repeated value');
  assert.equal(out.cursor, 'services.thing|2026-09-10T09:00:00.000Z|01JROW0000000000000000000');

  const asked = sent[0]!;
  assert.equal(asked.pathname, '/api/backlinks');
  assert.equal(asked.searchParams.get('register'), 'things');
  assert.equal(asked.searchParams.get('seq'), '4');
  /* THE REFS OF THE POINTING LIST ARE WALKED, so a `ref` column of a drawn row is a number a person
     says and never the ULID it arrived as. */
  assert.ok(sent.some((u) => u.pathname === '/api/list' && u.searchParams.get('register') === 'things'));
});

test('a row nothing points at draws no sections', async () => {
  const { io } = host((url) =>
    url.pathname === '/api/backlinks'
      ? json(200, { ok: true, value: { to: { register: 'things', seq: 4, id: null }, from: [], cursor: null } })
      : json(404, { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'There is no such method.' } }),
  );
  assert.deepEqual(await linkReader(BASE, io).read('things', 4), { from: 'live', groups: [], cursor: null });
});

for (const [what, answer] of [
  ['nothing answers', null],
  ['the record says UNAUTHORIZED', () => json(401, { ok: false, refusal: { code: 'UNAUTHORIZED', fix: 'Sign in again.' } })],
  ['a static host answers a 404 page', () => new Response('<!doctype html><title>Not found</title>', { status: 404 })],
] as const)
  test(`the sample is read when ${what}`, async () => {
    const { io } = host(answer);
    assert.deepEqual(await linkReader(BASE, io).read('things', 4), { from: 'sample' });
  });

test("any other refusal is the record's own sentence", async () => {
  const fix = 'This key may not read things.';
  const { io } = host(() => json(403, { ok: false, refusal: { code: 'FORBIDDEN', fix } }));
  assert.deepEqual(await linkReader(BASE, io).read('things', 4), { from: 'refused', fix });
});

test('a pending row sends nothing', async () => {
  const { io, sent } = host(record);
  for (const seq of [-1, 0, Number.NaN]) assert.deepEqual(await linkReader(BASE, io).read('things', seq), { from: 'sample' });
  assert.equal(sent.length, 0);
});

test('the row page draws what points at the row from the record, and the sample only when there is none', () => {
  const page = readFileSync(new URL('../../routes/r/[register]/[seq]/+page.svelte', import.meta.url), 'utf8');
  assert.match(page, /from '\$lib\/record\/links-live\.ts'/u);
  assert.match(page, /linked\?\.from === 'live'/u, 'the live groups are what the page draws when there are any');
});

test("a pack's own list that points here is drawn under its declared name and labelled columns, not dropped", async () => {
  assert.equal(REGISTERS.study_assignments, undefined, 'the build ships this list, so this proves nothing');
  const COURSES = { id: 'study_courses', name: 'Courses', one: 'course', icon: 'doc', title: 'name', fields: [{ id: 'name', label: 'Course', type: 'text' }] };
  const ASSIGNMENTS = {
    id: 'study_assignments',
    name: 'Assignments',
    one: 'assignment',
    icon: 'task',
    title: 'what',
    mobile: ['what', 'course', 'due'],
    fields: [
      { id: 'what', label: 'Assignment', type: 'text', required: true },
      { id: 'course', label: 'Course', type: 'ref', to: 'study_courses' },
      { id: 'due', label: 'Due', type: 'day', deadline: true },
    ],
  };
  const pointing = { id: '01JASSIGN0000000000000000', seq: 5, fields: { what: 'Problem set 1', course: '01JCOURSE0000000000000000', due: '2026-09-20' }, version: 1, created_at: '2026-09-01T09:00:00.000Z' };
  const { io, sent } = host((url) => {
    if (url.pathname === '/api/backlinks')
      return json(200, {
        ok: true,
        value: { to: { register: 'study_courses', seq: 2, id: '01JCOURSE0000000000000000' }, from: [{ register: 'study_assignments', field: 'course', matched: 1, rows: [pointing] }], cursor: null },
      });
    if (url.pathname === '/api/schema') {
      const r = url.searchParams.get('register');
      return r === 'study_courses' ? json(200, { ok: true, value: COURSES }) : r === 'study_assignments' ? json(200, { ok: true, value: ASSIGNMENTS }) : json(404, { ok: false, refusal: { code: 'REGISTER_UNKNOWN', fix: 'No such list.' } });
    }
    if (url.pathname === '/api/list') return json(200, { ok: true, value: { rows: [{ id: '01JCOURSE0000000000000000', seq: 2, fields: { name: 'Linear algebra' } }], cursor: null } });
    return json(404, { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'There is no such method.' } });
  });
  const out = await linkReader(BASE, io).read('study_courses', 2);
  assert.equal(out.from, 'live');
  if (out.from !== 'live') return;
  assert.equal(out.groups.length, 1, 'the section is drawn, not skipped');
  const group = out.groups[0]!;
  assert.equal(group.name, 'Assignments');
  assert.equal(group.label, 'Course');
  assert.equal(group.icon, iconFor('task', 'rows'));
  assert.deepEqual(
    group.columns.filter((c) => c.field !== 'seq').map((c) => c.label),
    ['Assignment', 'Due'],
  );
  assert.equal(group.rows[0]!.href, '/r/study_assignments/5');
  assert.ok(sent.some((u) => u.pathname === '/api/list' && u.searchParams.get('register') === 'study_courses'), 'its refs are walked');
});

/* A LIST THE BUILD SHIPS IS ASKED ABOUT TOO (DIRECTION §22): a field added to Projects at run time is on the record and
   in no file here, so the reader asks the record for every list it draws, once each for the tab. */
test('a sample list that points here is asked about once for the tab, and one the record will not declare keeps its words', async () => {
  const { io, sent } = host(record);
  const reader = linkReader(BASE, io);
  await reader.read('things', 4);
  await reader.read('things', 4);
  const schemas = sent.filter((u) => u.pathname === '/api/schema').map((u) => u.searchParams.get('register'));
  assert.equal(schemas.filter((r) => r === 'things').length, 1, `Projects was not asked about once: ${schemas.join(', ')}`);
  assert.equal(schemas.filter((r) => r === 'services').length, 1);
  assert.equal(new Set(schemas).size, schemas.length, `a list was asked about twice: ${schemas.join(', ')}`);
  /* THIS MOCK DECLARES NOTHING, so the build's own lists are where they were. */
  assert.equal(REGISTERS.services!.name, 'Services');
});
