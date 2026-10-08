/**
 * The look's screens are picked from the record's own answers, never from an id somebody typed.
 *
 * A STUBBED RECORD, so the picking is checked with no server and no browser: two records with different ids, and the
 * same set must open each one's own oldest question, busiest project and biggest list. A pick hard-coded to the
 * seed's `SG5` or `kiln` goes red on the second record by itself.
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { keyOf, leadOf, pick, screensOf, SETS } from './screens.mjs';

/** A record as `ask` reads it: one answer per method, chosen by the body where the answer depends on it. */
function stub({ questions, projects, registers, rows = {}, tasks = true, agents = true }) {
  const pages = [
    { slug: 'cash', title: 'Money', nav: { section: 'Money', order: 10 }, about: null, list: null },
    { slug: 'all-projects', title: 'Projects', nav: { section: 'Projects', order: 5 }, about: null, list: null },
    ...projects.map((p) => ({ slug: p.slug, title: p.title, nav: { section: 'Projects', order: 10 }, about: { register: 'things', seq: p.seq }, list: null })),
    { slug: 'team', title: 'People', nav: { section: 'People', order: 10 }, about: null, list: null },
    ...(agents ? [{ slug: 'runs', title: 'Agents', nav: { section: 'Agents', order: 10 }, about: null, list: null }] : []),
  ];
  const asked = [];
  const ask = async (method, body = {}) => {
    asked.push(method);
    switch (method) {
      case 'boot':
        return { pages, registers: tasks ? registers : registers.filter((r) => r.id !== 'tasks'), record: { name: 'A record' } };
      case 'governance': {
        /* Two pages of open questions, so a pick that reads only the first misses the oldest. */
        const from = body.cursor ? questions.findIndex((q) => q.id === body.cursor) + 1 : 0;
        return questions.slice(from, from + body.limit);
      }
      case 'backlinks': {
        /* What points at a project comes a page at a time; `later` is on the second page only. */
        const p = projects.find((x) => x.seq === body.seq);
        if (body.cursor) return { from: [{ matched: p?.later ?? 0 }], cursor: null };
        return { from: [{ matched: p?.points ?? 0 }], cursor: p?.later ? 'next' : null };
      }
      case 'list':
        return { rows: rows[body.register] ?? [] };
      default:
        return [];
    }
  };
  return { ask, asked };
}

const many = (n, first) =>
  Array.from({ length: n }, (_, i) => ({ id: `Q${first + i}`, opened_at: `2026-10-${String(9 - (i % 9)).padStart(2, '0')}T10:00:00.000Z`, question: 'Chase it?' }));

const recordA = {
  /* 150 open questions, and the oldest is on the second page. */
  questions: [...many(120, 1), { id: 'Q900', opened_at: '2026-08-01T09:00:00.000Z', question: 'Was this paid?' }, ...many(29, 200)],
  projects: [
    { slug: 'small', title: 'Small', seq: 1, points: 3 },
    { slug: 'busy', title: 'Busy', seq: 2, points: 40 },
  ],
  registers: [
    { id: 'tasks', name: 'Tasks', count: 9 },
    { id: 'transactions', name: 'Ledger', count: 412 },
  ],
  rows: { transactions: [{ seq: 412, fields: { what: 'Coffee beans' } }] },
};

const recordB = {
  questions: [{ id: 'SG2', opened_at: '2026-10-01T00:00:00.000Z' }, { id: 'SG7', opened_at: '2026-09-01T00:00:00.000Z' }],
  projects: [
    { slug: 'alpha', title: 'Alpha', seq: 4, points: 9 },
    { slug: 'beta', title: 'Beta', seq: 5, points: 2, later: 3 },
    { slug: 'gamma', title: 'Gamma', seq: 6, points: 1, later: 30 },
  ],
  registers: [
    { id: 'people', name: 'People', count: 30 },
    { id: 'tasks', name: 'Tasks', count: 3 },
  ],
  rows: { people: [{ seq: 30, fields: { name: 'Mara' } }] },
};

test('six opens the places where the rail opens them, and the busiest project', async () => {
  const { screens, missing } = await screensOf('six', await pick(stub(recordA).ask));
  assert.deepEqual(missing, []);
  assert.deepEqual(
    screens.map((s) => [s.key, s.path]),
    [
      ['today', '/'],
      ['decide', '/decide'],
      ['money', '/p/cash'],
      ['projects', '/p/all-projects'],
      ['project', '/p/busy'],
      ['agents', '/p/runs'],
    ],
  );
  assert.equal(screens.find((s) => s.key === 'project').name, 'Busy');
});

test('nine picks the oldest question across pages, and the biggest list and its first entry', async () => {
  const { screens } = await screensOf('nine', await pick(stub(recordA).ask));
  const at = Object.fromEntries(screens.map((s) => [s.key, s.path]));
  assert.deepEqual(screens.map((s) => s.key), SETS.nine);
  assert.equal(at.question, '/decide/Q900');
  assert.equal(at.work, '/?work');
  assert.equal(at.list, '/r/transactions');
  assert.equal(at.row, '/r/transactions/412');
  assert.equal(at.people, '/p/team');
  assert.equal(screens.find((s) => s.key === 'row').name, 'Coffee beans');
});

test('another record gets its own samples, so no pick is a typed id', async () => {
  const a = await pick(stub(recordA).ask);
  const b = await pick(stub(recordB).ask);
  assert.notEqual(a.question.id, b.question.id);
  assert.equal(b.question.id, 'SG7');
  assert.equal(b.project.slug, 'gamma', 'what points at a project is counted past its first page');
  assert.equal(b.list.register, 'people');
  assert.equal(b.row.seq, 30);
});

test('a screen the record cannot show is said with a reason, not dropped', async () => {
  const { screens, missing } = await screensOf(
    'nine',
    await pick(stub({ questions: [], projects: [], registers: [{ id: 'notes', name: 'Notes', count: 0 }], tasks: false, agents: false }).ask),
  );
  const gone = Object.fromEntries(missing.map((m) => [m.key, m.missing]));
  for (const key of ['question', 'project', 'list', 'row', 'work']) assert.ok(gone[key], `${key} should be missing`);
  assert.ok(!screens.some((s) => s.path === undefined));
  for (const m of missing) assert.doesNotMatch(m.missing, /\b(row|entity|list item)\b/iu);
});

test('all holds the named screens once each, and the routes the record fills take its picks', async () => {
  const { screens } = await screensOf('all', await pick(stub(recordB).ask));
  const paths = screens.map((s) => s.path);
  assert.equal(new Set(paths).size, paths.length);
  assert.equal(new Set(screens.map((s) => s.key)).size, screens.length);
  for (const key of new Set([...SETS.six, ...SETS.nine])) assert.ok(screens.some((s) => s.key === key), key);
  assert.ok(paths.includes('/SG7'), 'the address resolver opens the picked question');
  assert.ok(!paths.some((p) => /\/SG5\b|\/p\/money$|\/r\/obligations/u.test(p)), "no gate sample stands in for the record's own");
  assert.ok(paths.includes('/settings/appearance'), 'a settings area names nothing the record holds and keeps its address');
});

test('the lead page and the image names', () => {
  const pages = [
    { slug: 'b', title: 'Second', nav: { section: 'Money', order: 20 } },
    { slug: 'k', title: 'Kept', nav: { section: 'Money', order: 5 }, about: { register: 'x', seq: 1 } },
    { slug: 'a', title: 'First', nav: { section: ' money ', order: 10 } },
  ];
  assert.equal(leadOf(pages, 'money').slug, 'a');
  assert.equal(leadOf([...pages, { slug: 'o', title: 'Overview', nav: { section: 'Money', order: 99 } }], 'money').slug, 'o');
  assert.equal(keyOf('/'), 'today');
  assert.equal(keyOf('/r/transactions/412'), 'r-transactions-412');
});

test("a screen the live source cannot draw is known by its name, and raw text is counted", async () => {
  const { cannotOf, rawIn } = await import('./capture.mjs');
  const { CANNOT } = await import('./sources/live.mjs');
  const source = { cannot: CANNOT };
  for (const name of ['Usage', 'Settings: billing', 'Settings: agents']) assert.ok(cannotOf(source, { name }), name);
  for (const name of ['Money', 'Settings: appearance', 'Today']) assert.equal(cannotOf(source, { name }), undefined, name);
  const raw = rawIn('Revenue {{revenue.monthly}} since 2026-10-06T19:07:01.610Z by 01M1KJ7RG0E5SK0YR8JDBAVKZT in tools#8, then NaN');
  assert.deepEqual(Object.keys(raw).sort(), ['handles', 'ids', 'instants', 'placeholders', 'stuck']);
  assert.deepEqual(rawIn('Cash is £33,850 across 2 accounts, 6 days late.'), {});
});
