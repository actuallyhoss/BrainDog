/**
 * One row against the record: the live row drawn with its refs as numbers, the record's sentence for
 * every refusal, a row the record does not hold as no row, and nothing sent for a pending one.
 *
 * AND WHAT A ROW THAT IS NOT THERE COSTS, counted against a real kernel at the bottom of this file,
 * because a count taken against a host written in the same file as its own assertion is a count of
 * what this file expects rather than of what the record does.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import { openRecord, type Kernel } from '@braindog/kernel';

import { copy } from '../copy.ts';
import { REGISTERS, ROWS } from './api.ts';
import { rowReader, type Fetch } from './row-live.ts';

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

const record = (url: URL): Response => {
  if (url.pathname === '/api/get')
    return json(200, {
      ok: true,
      value:
        url.searchParams.get('seq') === '99'
          ? null
          : {
              id: '01JROW0000000000000000000',
              register: 'services',
              seq: Number(url.searchParams.get('seq')),
              fields: { ...sampleFields, thing: '01JTHING000000000000000000' },
              state: null,
              version: 7,
              created_at: '2026-09-01T09:00:00.000Z',
              updated_at: '2026-09-10T09:00:00.000Z',
              deleted_at: null,
            },
    });
  if (url.pathname === '/api/list' && url.searchParams.get('register') === 'things')
    /* `Kiln`, WHERE THE SAMPLE'S `things#4` IS `Tallow`. The two differ on purpose: a ref is drawn as
       the name of the row it points at, and the only way to see which record named it is to make the
       two records disagree about what number four is called. */
    return json(200, {
      ok: true,
      value: { rows: [{ id: '01JTHING000000000000000000', seq: 4, fields: { name: 'Kiln' } }], cursor: null, matched: 1 },
    });
  return json(404, { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'There is no such method.' } });
};

test("the record's row is drawn, with a ref as the number a person says", async () => {
  const { io, sent } = host(record);
  const reader = rowReader(BASE, io);
  const out = await reader.read('services', 2);
  assert.equal(out.from, 'live');
  assert.ok(out.entry);
  assert.equal(out.entry.seq, 2);
  assert.equal(out.entry.version, 7);
  assert.equal(out.entry.created, '2026-09-01T09:00:00.000Z');
  assert.equal(out.entry.fields.thing, 4);
  assert.equal(sent[0]!.pathname, '/api/get');
  assert.equal(sent[0]!.searchParams.get('register'), 'services');
  assert.equal(sent[0]!.searchParams.get('seq'), '2');

  /* THE REF MAP IS KEPT, so a second row asks for itself and nothing more. */
  const before = sent.length;
  await reader.read('services', 3);
  assert.equal(sent.length, before + 1);
});

test('a ref is named by THIS record, and never by the sample row of the same number', async () => {
  /**
   * THE NAMES WERE THE SAMPLE'S AND THE NUMBERS WERE THE RECORD'S.
   *
   * A ref is stored as another row's id, turned into that row's number here, and drawn as that row's
   * TITLE — and the only titles `display` had were the built-in sample's. So a live row pointing at
   * this record's `things#4` was drawn as whatever the sample calls number four, which is a name
   * from another business printed under this business's field, with nothing on screen to doubt.
   */
  const { io } = host(record);
  const out = await rowReader(BASE, io).read('services', 2);
  assert.equal(out.from, 'live');
  assert.ok(out.from === 'live');
  assert.equal(out.names.get('things#4'), 'Kiln');
  assert.notEqual(out.names.get('things#4'), ROWS.things!.find((e) => e.seq === 4)!.fields.name);
  /* AND A NUMBER THIS RECORD DID NOT NAME IS NOT IN THE MAP, so `display` draws `things#7` rather
     than reaching for the sample's row of that number. */
  assert.equal(out.names.get('things#7'), undefined);
});

test('a row the record does not hold is no row, not the sample row of that number', async () => {
  const { io } = host(record);
  assert.deepEqual(await rowReader(BASE, io).read('services', 99), { from: 'live', entry: null, names: new Map() });
});

/**
 * A HOST FOR ONE RECORD-DECLARED LIST THAT HOLDS ROWS AND DOES NOT HOLD THE ROW ASKED FOR.
 *
 * `matched: 400` and a row in the answer because the asymmetry only shows on a list that is plainly
 * there: on the record the usability survey drove, `Assignments` held 400 rows in the rail while
 * `/r/assignments/9999` denied the list itself.
 */
function stocked(declared: Record<string, unknown>) {
  return host((url) => {
    const asked = url.searchParams.get('register') ?? '';
    if (url.pathname === '/api/schema') return declared[asked] ? json(200, { ok: true, value: declared[asked] }) : json(404, { ok: false, refusal: { code: 'REGISTER_UNKNOWN', fix: `There is no register called ${asked}.` } });
    if (url.pathname === '/api/get') return json(200, { ok: true, value: null });
    if (url.pathname === '/api/list')
      return json(200, { ok: true, value: { rows: [{ id: '01JTEACHER0000000000000001', seq: 1, fields: { name: 'Mrs Auerbach' } }], cursor: null, matched: 400 } });
    return json(404, { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'There is no such method.' } });
  });
}

/** The two branches of `r/[register]/[seq]/+page.svelte:538`, so the sentence asserted below is the drawn one. */
const sentence = (register: string, seq: number): string => {
  const decl = REGISTERS[register];
  return decl ? copy.noSuchNumber(decl.one, seq) : copy.noSuch('list', register);
};

/**
 * THE SENTENCE CONTRADICTED THE BUTTON UNDER IT, AND THE READING WAS THAT SOMETHING HAD BEEN DESTROYED.
 *
 * `/r/courses/9999` on a student record answered *There is no list called courses.* with *Back to
 * courses* beneath it, while `courses` sat in the rail holding rows. `read` returned at the absent
 * row before `learn` ran, so `REGISTERS[register]` stayed empty, and the page's `decl` was undefined
 * on the one screen that had just proved the list answers: the schema call succeeds, the list call
 * succeeds, only the row is missing. `/r/session/9999` never had the fault because `session` ships in
 * the bundle, which is why one register said *There is no run #9999.* and every record-declared one
 * denied the list. 390 and 1440 are the two numbers the survey typed.
 */
for (const seq of [390, 1440])
  test(`a missing row on a record-declared list names the number, not the list, at ${seq}`, async () => {
    const register = `rl_courses_${seq}`;
    const teachers = `${register}_teachers`;
    /* NO `one` IN THE DECLARATION, because a record does not have to send one and the survey's did not:
       `declOf` folds `Courses` down to `course` itself, and the sentence has to come out right from
       the name alone or it comes out right on nothing real.

       AND ONE REF FIELD, because without it the last assertion below proved nothing. The declaration
       held a single `text` field, so `targetsOf` named no register, and no list was paged whether the
       missing-row return sat above the ref walk or below it: moving that return below the loop in
       `row-live.ts` left all thirteen tests in this file green. With `teacher` declared, the same
       mutation sends `/api/schema` for the target and then `/api/list`, and the assertion goes red. */
    const { io, sent } = stocked({
      [register]: { id: register, name: 'Courses', title: 'name', fields: [{ id: 'name', type: 'text' }, { id: 'teacher', type: 'ref', to: teachers }] },
      [teachers]: { id: teachers, name: 'Teachers', title: 'name', fields: [{ id: 'name', type: 'text' }] },
    });
    assert.deepEqual(await rowReader(BASE, io).read(register, seq), { from: 'live', entry: null, names: new Map() });
    assert.equal(sentence(register, seq), `There is no course #${seq}.`);
    /* AND THE BUTTON UNDERNEATH IS LABELLED FROM THE SAME DECLARATION, so *Back to Courses* now agrees
       with the sentence above it instead of denying it. */
    assert.equal(REGISTERS[register]?.name, 'Courses');
    /* NO REF WALK FOR A ROW THAT IS NOT THERE: there are no fields to draw, so the 400-row list is
       not paged through to name refs nobody will read. Only the row and the declaration are asked.

       THIS ASSERTION WAS REPORTED AS ONE THAT CANNOT FAIL, AND IT FAILS. Moving the missing-row
       return in `row-live.ts` below the ref loop turns the list below into
       `['/api/get', '/api/schema', '/api/schema', '/api/list']` and both runs of this test go red;
       the report was reading the paragraph above, which says a version that never shipped proved
       nothing. What made it bite is the `teacher` field, and the real-record count at the foot of
       this file is the same claim measured rather than mocked. */
    assert.deepEqual(
      sent.map((u) => u.pathname),
      ['/api/get', '/api/schema'],
    );
  });

test('a list the record will not declare still says the list is not there, because that is true', async () => {
  const register = 'rl_nope';
  const { io } = host((url) => (url.pathname === '/api/get' ? json(200, { ok: true, value: null }) : json(404, { ok: false, refusal: { code: 'REGISTER_UNKNOWN', fix: `There is no register called ${register}.` } })));
  assert.deepEqual(await rowReader(BASE, io).read(register, 390), { from: 'live', entry: null, names: new Map() });
  assert.equal(REGISTERS[register], undefined);
  assert.equal(sentence(register, 390), 'There is no list called rl_nope.');
});

/* NO RECORD IS A REFUSAL NOW, NOT THE SAMPLE (DIRECTION 26). Under these three the page drew `entry('services', 2)`,
   the sample business's row, under the address of a row in no record at all. */
test("a 401 at no slug is the record's sentence, not the sample's row", async () => {
  const { io } = host(() => json(401, { ok: false, refusal: { code: 'UNAUTHORIZED', fix: 'Sign in again.' } }));
  assert.deepEqual(await rowReader(BASE, io).read('services', 2), { from: 'refused', fix: 'Sign in again.' });
});

for (const [what, answer] of [
  ['nothing answers', null],
  ['a static host answers a 404 page', () => new Response('<!doctype html><title>Not found</title>', { status: 404 })],
] as const)
  test(`a refusal, and no sample row, when ${what}`, async () => {
    const out = await rowReader(BASE, host(answer).io).read('services', 2);
    assert.equal(out.from, 'refused');
    assert.ok(out.from === 'refused' && out.fix.trim() !== '', 'a refusal with no sentence says nothing to the reader');
  });

test("any other refusal is the record's own sentence", async () => {
  const fix = 'This key may not read services.';
  const { io } = host(() => json(403, { ok: false, refusal: { code: 'FORBIDDEN', fix } }));
  assert.deepEqual(await rowReader(BASE, io).read('services', 2), { from: 'refused', fix });
});

test('a pending row sends nothing, and the record holds no row for it', async () => {
  const { io, sent } = host(record);
  for (const seq of [-1, 0, Number.NaN]) assert.deepEqual(await rowReader(BASE, io).read('services', seq), { from: 'live', entry: null, names: new Map() });
  assert.equal(sent.length, 0);
});

test('the row page draws the live row and its refusal, and nothing of the sample', () => {
  const page = readFileSync(new URL('../../routes/r/[register]/[seq]/+page.svelte', import.meta.url), 'utf8');
  assert.match(page, /from '\$lib\/record\/row-live\.ts'/u);
  /* WHAT POINTS HERE IS THE RECORD'S OR NOTHING. The sample's walk filled this for any row that was not live, which
     after DIRECTION 26 is only ever a row the record does not hold. */
  assert.match(page, /const incoming = \$derived\(linked\?\.from === 'live' \? linked\.groups : \[\]\)/u);
  /* THE READ THAT MAKES THE LEARNED DECLARATION VISIBLE, and it is one `void` away from silence. The
     register table is a plain object, so `$derived(REGISTERS[id])` would depend on `id` alone and
     never notice that `read` has just learned the list; `void got` is the whole reason the sentence
     below the bars is right. Dropping it turns "There is no course #390." back into "There is no list
     called courses." with nothing else changed, and no other test in this tree says a word about it.
     Checked in memory against this file's own text: the pin holds as shipped and fails with the
     `void got` removed. */
  assert.match(page, /const decl = \$derived\.by\(\(\) => \(void got, REGISTERS\[id\]\)\)/u, 'the page must re-read the register table once the row has been read');
  assert.match(page, /\{:else if got\?\.from === 'refused'\}/u);
  assert.match(page, /title=\{got\.fix\}/u);
  assert.match(page, /const written = \$derived\(got\?\.from === 'live' \? \(got\.entry \?\? undefined\) : undefined\)/u, 'a row that is not there falls back to the sample again');
  /* NO ROW THIS TAB TYPED IS HELD APART FROM THE RECORD: `pending` went with the sample (research-no-sample B1), and
     `entry(` was the sample's reader and `values()` the sample's hole answers. */
  assert.doesNotMatch(page, /record\/pending|pending\.of\(/u, 'the row page draws a row the record was not given again');
  assert.doesNotMatch(page, /\bentry\(id, seq\)|\bvalues\(\)|from === 'sample'/u, 'the row page reads the sample again');
});

test("a row on a list this build does not ship draws its link by the linked row's name, not as club_books#2", async () => {
  const declared: Record<string, unknown> = {
    rl_meetings: { id: 'rl_meetings', name: 'Meetings', title: 'what', fields: [{ id: 'what', type: 'text' }, { id: 'book', type: 'ref', to: 'rl_books' }] },
    rl_books: { id: 'rl_books', name: 'Books', title: 'name', fields: [{ id: 'name', type: 'text' }] },
  };
  const BOOK = '01JBOOK000000000000000002';
  const { io } = host((url) => {
    const register = url.searchParams.get('register') ?? '';
    if (url.pathname === '/api/schema') return json(200, { ok: true, value: declared[register] });
    if (url.pathname === '/api/get')
      return json(200, { ok: true, value: { id: '01JMEET000000000000000001', register, seq: 1, fields: { what: 'Stevens and the dinner', book: BOOK }, version: 1, created_at: '2026-09-17T09:00:00.000Z' } });
    if (url.pathname === '/api/list' && register === 'rl_books')
      return json(200, { ok: true, value: { rows: [{ id: BOOK, seq: 2, fields: { name: 'The Remains of the Day' } }], cursor: null } });
    return json(404, { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'There is no such method.' } });
  });
  const out = await rowReader(BASE, io).read('rl_meetings', 1);
  assert.equal(out.from, 'live');
  if (out.from !== 'live') return;
  assert.equal(out.entry?.fields.book, 2);
  assert.equal(out.names.get('rl_books#2'), 'The Remains of the Day');
  const { display } = await import('./api.ts');
  assert.equal(display('rl_meetings', 'book', 2, Date.now(), out.names), 'The Remains of the Day');
});

/**
 * THE COST OF AN ABSENT ROW, COUNTED AGAINST A REAL KERNEL RATHER THAN AGAINST THIS FILE'S OWN HOST.
 *
 * Everything above answers out of `host`, which is thirty lines of this file returning what this
 * file expects, so a count taken there proves the reader agrees with the fixture. The record below
 * is the real one: `openRecord` over `node:sqlite`, the two declarations put in through `install`,
 * and 400 teacher rows written one at a time through `create`, which is the shape the usability
 * survey ran on.
 *
 * ONLY THE HTTP ENVELOPE IS LOCAL, and it is not a mock of an answer: `@braindog/host` is not a
 * dependency of this app and making it one is not this change's to make, so `served` below calls the
 * same three kernel methods `packages/record/src/index.ts` calls for these routes. `schema` is
 * `kernel.register`, `get` is `kernel.get` wrapped in the `{ ok, value }` every route shares, and
 * `list` is `kernel.list` passed through untouched, cursor and all.
 */
function openSqlite(): Parameters<typeof openRecord>[0] {
  const db = new DatabaseSync(':memory:');
  let depth = 0;
  const sql = {
    exec: (text: string, ...params: unknown[]) => {
      if (params.length === 0) db.exec(text);
      else db.prepare(text).run(...(params as never[]));
    },
    all: (text: string, ...params: unknown[]) => db.prepare(text).all(...(params as never[])),
    one: (text: string, ...params: unknown[]) => db.prepare(text).get(...(params as never[])),
    transactionSync<T>(fn: () => T): T {
      if (depth > 0) return fn();
      db.exec('BEGIN');
      depth++;
      try {
        const value = fn();
        db.exec('COMMIT');
        return value;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      } finally {
        depth--;
      }
    },
  };
  return sql as unknown as Parameters<typeof openRecord>[0];
}

/** The record's three read routes over a real kernel, with what was asked and how many rows came back. */
function served(k: Kernel): { io: Fetch; asked: URL[]; carried: number[] } {
  const asked: URL[] = [];
  const carried: number[] = [];
  const io = (async (url: string | URL | Request) => {
    const at = new URL(String(url));
    asked.push(at);
    const register = at.searchParams.get('register') ?? '';
    const cursor = at.searchParams.get('cursor');
    if (at.pathname === '/api/schema') {
      const decl = k.register(register);
      return decl ? json(200, { ok: true, value: decl }) : json(404, { ok: false, refusal: { code: 'REGISTER_UNKNOWN', fix: `There is no register called ${register}.` } });
    }
    if (at.pathname === '/api/get') return json(200, { ok: true, value: k.get({ register, seq: Number(at.searchParams.get('seq')) }) });
    if (at.pathname === '/api/list') {
      const out = k.list({ register, limit: Number(at.searchParams.get('limit') ?? 50), ...(cursor === null ? {} : { cursor }) } as never) as { ok: boolean; value: { rows: unknown[] } };
      if (out.ok) carried.push(out.value.rows.length);
      return json(out.ok ? 200 : 404, out);
    }
    return json(404, { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'There is no such method.' } });
  }) as Fetch;
  return { io, asked, carried };
}

const CLOCK = Date.UTC(2026, 8, 21, 9);

/**
 * A record holding `Courses` with one ref field and `Teachers` with 400 rows in it.
 *
 * ONE RECORD PER CASE, AND THAT IS NOT TIDINESS. `REGISTERS` is one table for the whole process and
 * `learn` fills it on the first read, so asking a second register name of the same pair skips the
 * `schema` call the count is about: with both cases on one pair the absent row asked once, not twice,
 * and the difference the test is measuring was hidden by the test's own first line.
 */
async function shaped(tag: string): Promise<{ k: Kernel; courses: string; teachers: string }> {
  const courses = `mx_${tag}_courses`;
  const teachers = `mx_${tag}_teachers`;
  const k = await openRecord(openSqlite(), { now: () => CLOCK });
  const decls = [
    { id: `register.${teachers}`, kind: 'register', body: { id: teachers, name: 'Teachers', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] } },
    { id: `register.${courses}`, kind: 'register', body: { id: courses, name: 'Courses', title: 'name', fields: [{ id: 'name', type: 'text', required: true }, { id: 'teacher', type: 'ref', to: teachers }] } },
  ];
  for (const decl of decls) assert.ok((await k.install([decl as never])).ok, `${decl.id} would not install`);
  const made: string[] = [];
  for (let n = 0; n < 400; n++) {
    const out = k.create(teachers, { name: `Teacher ${n + 1}` }, { actor: 'p_1' }) as { ok: boolean; value?: { id: string } };
    assert.ok(out.ok, JSON.stringify(out));
    made.push(out.value!.id);
  }
  assert.ok(k.create(courses, { name: 'Ceramics', teacher: made[0] }, { actor: 'p_1' }).ok);
  return { k, courses, teachers };
}

/** Each call as `<route> <courses|teachers>`, so the list below reads without the per-case tag in it. */
const route = (u: URL): string => `${u.pathname.slice('/api/'.length)} ${u.searchParams.get('register')!.endsWith('_teachers') ? 'teachers' : 'courses'}`;

test('a row that is not there costs the row and the declaration, where a row that is there also pages 400 names back', async () => {
  const absent = await shaped('absent');
  const cold = served(absent.k);
  assert.deepEqual(await rowReader(BASE, cold.io).read(absent.courses, 9999), { from: 'live', entry: null, names: new Map() });
  assert.deepEqual(cold.carried, [], 'an absent row paged a target register it has no field to draw');
  assert.deepEqual(cold.asked.map(route), ['get courses', 'schema courses']);

  const present = await shaped('present');
  const warm = served(present.k);
  const out = await rowReader(BASE, warm.io).read(present.courses, 1);
  assert.ok(out.from === 'live' && out.entry, 'the present row did not come back live');
  assert.equal(out.names.get(`${present.teachers}#1`), 'Teacher 1');
  /* THE WALK IS REAL AND THE PRESENT ROW PAYS FOR IT: two more calls than the absent row, and 400
     rows over the wire to name the one ref the row holds. That is what the early return saves, and
     it is why the return is worth an assertion rather than a shrug. */
  assert.deepEqual(warm.asked.map(route), ['get courses', 'schema courses', 'schema teachers', 'list teachers']);
  assert.deepEqual(warm.carried, [400]);
});
