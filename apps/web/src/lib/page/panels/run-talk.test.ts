/**
 * A RUN AS A CONVERSATION, TOP TO BOTTOM (`run-talk.ts`, AGT-C12 build 5): who and where, its stretches, what it said
 * it is doing, what it asked, its dead ends, its helpers and the run whose step it took, each a section that is absent
 * when it has nothing true to say. Read in UTC here, so a time is the same wherever the test runs.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runTalk, readRunParts, TALK_ORDER, type RunParts, type RunRow } from './run-talk.ts';

const NOW = Date.parse('2026-10-14T13:00:00.000Z');
const UTC = 'UTC';

const row = (fields: Record<string, unknown>, state = 'active'): RunRow => ({ seq: 42, state, fields });
const keys = (r: RunRow, parts: RunParts = {}) => runTalk(r, parts, NOW, UTC).map((s) => s.key);
const section = (r: RunRow, parts: RunParts, key: string) => runTalk(r, parts, NOW, UTC).find((s) => s.key === key);

const FULL = row(
  {
    agent: 'claude',
    client: 'Claude Code',
    repo: 'braindog',
    branch: 'main',
    cwd: '/Users/someone/Developer/braindog',
    project: 'projects#3',
    doing: 'Drawing the run panel as a conversation',
    started: '2026-10-14T09:12:00.000Z',
    last_seen: '2026-10-14T12:05:00.000Z',
    tried: ['Reading the plan twice', 'A second heading under the first'],
    took: 'S41',
  },
  'done',
);

const PARTS: RunParts = {
  project: 'BrainDog',
  history: [
    { ts: '2026-10-14T09:12:00.000Z', kind: 'create' },
    { ts: '2026-10-14T10:30:00.000Z', kind: 'state', from: 'active', to: 'idle' },
    { ts: '2026-10-14T11:40:00.000Z', kind: 'state', from: '"idle"', to: '"active"' },
    { ts: '2026-10-14T12:05:00.000Z', kind: 'state', from: 'active', to: 'done' },
  ],
  asked: [
    { words: 'Keep the old archive?', status: 'open' },
    { words: 'Rename the list to Invoices', status: 'accepted' },
    { words: 'Drop the weekly digest?', status: 'declined' },
  ],
  helpers: [{ doing: 'Read the kernel for the run fields' }, { doing: 'Claude Code in BrainDog', client: 'Claude Code' }, { doing: 'Wrote the failing test' }],
  took: { fields: { agent: 'codex', next_at: '2026-10-14T07:12:00.000Z' } },
};

test('the sections come in one fixed order', () => {
  assert.deepEqual(keys(FULL, PARTS), ['who', 'stretches', 'doing', 'asked', 'tried', 'helpers', 'took']);
  assert.deepEqual([...TALK_ORDER], ['who', 'stretches', 'doing', 'asked', 'tried', 'helpers', 'took']);
});

test('who says the app and where, never a path in full or an id', () => {
  assert.deepEqual(section(FULL, PARTS, 'who')?.lines, ['Claude Code, in braindog on main']);
  const pathy = row({ agent: 'claude', repo: '/Users/someone/Developer/braindog', branch: 'main', started: '2026-10-14T09:12:00.000Z' });
  assert.deepEqual(section(pathy, {}, 'who')?.lines, ['Claude, in braindog on main']);
  const placed = row({ agent: 'codex', project: 'projects#3', started: '2026-10-14T09:12:00.000Z' });
  assert.deepEqual(section(placed, { project: 'BrainDog' }, 'who')?.lines, ['Codex, in BrainDog']);
  /* A PROJECT NOBODY COULD NAME is not said by its handle. */
  assert.deepEqual(section(placed, {}, 'who')?.lines, ['Codex']);
  for (const s of runTalk(FULL, PARTS, NOW, UTC)) for (const line of s.lines) assert.doesNotMatch(line, /\/Users|projects#|S4[12]\b/u);
});

test('stretches read the row and its history', () => {
  assert.deepEqual(section(FULL, PARTS, 'stretches')?.lines, ['Started 09:12', 'Came back 11:40', 'Ended 12:05']);
});

test('a run with only a start prints who and one stretch', () => {
  const only = row({ agent: 'claude', client: 'Claude Code', doing: 'Claude Code run', started: '2026-10-14T09:12:00.000Z' });
  const said = runTalk(only, {}, NOW, UTC);
  assert.deepEqual(said.map((s) => s.key), ['who', 'stretches']);
  assert.deepEqual(said[1]?.lines, ['Started 09:12']);
});

test('a stretch on another day says the day', () => {
  const old = row({ agent: 'claude', started: '2026-10-06T09:12:00.000Z' });
  assert.deepEqual(section(old, {}, 'stretches')?.lines, ['Started 6 Oct, 09:12']);
});

test('many returns are counted, not listed', () => {
  const back = (h: number) => ({ ts: `2026-10-14T${String(h).padStart(2, '0')}:00:00.000Z`, kind: 'state', from: 'idle', to: 'active' });
  const lines = section(row({ agent: 'claude', started: '2026-10-14T01:00:00.000Z' }), { history: [2, 3, 4, 5, 6].map(back) }, 'stretches')?.lines;
  assert.deepEqual(lines, ['Started 01:00', 'Came back 5 times, last at 06:00']);
});

test('doing is absent while the name is the placeholder', () => {
  assert.deepEqual(section(FULL, PARTS, 'doing')?.lines, ['Drawing the run panel as a conversation']);
  const names = ['Claude Code in BrainDog', 'Claude Code in braindog', 'Claude Code run', 'Claude run, 14 Oct', 'braindog on main', 'braindog', 'BrainDog, 14 Oct', '  '];
  for (const doing of names) assert.equal(section(row({ ...FULL.fields, doing }), PARTS, 'doing'), undefined, doing);
  /* WORDS AN AGENT WROTE that only look alike are kept. */
  assert.deepEqual(section(row({ ...FULL.fields, doing: 'Claude in the loop' }), PARTS, 'doing')?.lines, ['Claude in the loop']);
});

test('asked says each question by its words and what became of it', () => {
  assert.deepEqual(section(FULL, PARTS, 'asked')?.lines, ['Keep the old archive? Open', 'Rename the list to Invoices. Accepted', 'Drop the weekly digest? Declined']);
  /* A QUESTION WHOSE WORDS COULD NOT BE READ is counted, never said by its handle. */
  const some = section(FULL, { asked: [{ words: 'Keep it?', status: 'open' }, { words: null, status: 'accepted' }, { words: '', status: 'declined' }] }, 'asked');
  assert.deepEqual(some?.lines, ['Keep it? Open', 'and 2 more questions']);
  assert.deepEqual(section(FULL, { asked: [{ words: null, status: 'open' }] }, 'asked')?.lines, ['1 question']);
  assert.equal(section(FULL, { asked: [] }, 'asked'), undefined);
});

test('tried says the dead ends, and nothing when there are none', () => {
  assert.deepEqual(section(FULL, PARTS, 'tried')?.lines, ['Reading the plan twice', 'A second heading under the first']);
  assert.equal(section(row({ agent: 'claude', tried: ['', 7] }), {}, 'tried'), undefined);
});

test('helpers are counted, then each said by what it did', () => {
  assert.deepEqual(section(FULL, PARTS, 'helpers')?.lines, ['3 helpers', 'Read the kernel for the run fields', 'Wrote the failing test']);
  assert.deepEqual(section(FULL, { helpers: [{ doing: 'Checked the words' }] }, 'helpers')?.lines, ['1 helper', 'Checked the words']);
  const many = Array.from({ length: 9 }, (_, i) => ({ doing: `Part ${i + 1}` }));
  const lines = section(FULL, { helpers: many, helpersInAll: 12 }, 'helpers')?.lines ?? [];
  assert.equal(lines[0], '12 helpers');
  assert.equal(lines.at(-1), 'and 6 more');
  assert.equal(section(FULL, { helpers: [] }, 'helpers'), undefined);
});

test('took names the run whose step it took and how much earlier', () => {
  assert.deepEqual(section(FULL, PARTS, 'took')?.lines, ['Took the step Codex left 2h earlier']);
  assert.deepEqual(section(FULL, { took: { fields: { agent: 'codex' } } }, 'took')?.lines, ['Took the step Codex left']);
  /* THE RUN IT TOOK FROM COULD NOT BE READ: said without a name, never by its handle. */
  assert.deepEqual(section(FULL, {}, 'took')?.lines, ['Took the step another run left']);
  assert.equal(section(row({ agent: 'claude' }), {}, 'took'), undefined);
});

/* ── the reads ───────────────────────────────────────────────────────────── */

const json = (value: unknown): Response => new Response(JSON.stringify({ ok: true, value }), { status: 200, headers: { 'content-type': 'application/json' } });

test('readRunParts reads the questions, the helpers and the run it took from', async () => {
  const sent: string[] = [];
  const io = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const name = url.pathname.split('/').pop() ?? '';
    const q = url.searchParams;
    sent.push(name);
    if (name === 'history') return json(PARTS.history);
    if (name === 'schema') return json({ id: 'projects', title: 'name', fields: [] });
    if (name === 'get' && q.get('register') === 'projects') return json({ state: 'open', fields: { name: 'BrainDog' } });
    if (name === 'get' && q.get('register') === 'session') return json({ state: 'handoff', fields: { agent: 'codex', next_at: '2026-10-14T07:12:00.000Z' } });
    if (name === 'list') return json({ rows: [{ fields: { doing: 'Wrote the failing test', parent: 'S42' } }], matched: 1, cursor: null });
    if (name === 'boot') return json({ waiting: [{ id: 'SG7', question: 'Keep the old archive?' }] });
    if (name === 'governance' && q.get('register') === 'decision') return json({ id: 'D3', question: 'Rename the list to Invoices', answer: 'accept' });
    if (name === 'governance')
      return json([
        { id: 'SG7', status: 'open', opened_by: 'S42', body_kind: 'change' },
        { id: 'SG6', status: 'resolved', resolved_as: 'addressed', opened_by: 'S42', body_kind: 'change', decision: 'D3' },
        { id: 'SG5', status: 'open', opened_by: 'S40', body_kind: 'change' },
      ]);
    return new Response('{}', { status: 404 });
  }) as typeof fetch;
  const parts = await readRunParts('https://record.test', FULL, io);
  assert.equal(parts.project, 'BrainDog');
  assert.equal(parts.history?.length, 4);
  /* OLDEST FIRST, as it asked them, and only its own: the third question is another run's. */
  assert.deepEqual(parts.asked, [
    { words: 'Rename the list to Invoices', status: 'accepted' },
    { words: 'Keep the old archive?', status: 'open' },
  ]);
  assert.deepEqual(parts.helpers?.map((h) => h.doing), ['Wrote the failing test']);
  assert.equal(parts.took?.fields.agent, 'codex');
  assert.deepEqual(section(FULL, parts, 'took')?.lines, ['Took the step Codex left 2h earlier']);
});

test('readRunParts answers nothing where every read fails', async () => {
  const io = (async () => new Response('{}', { status: 500 })) as typeof fetch;
  const parts = await readRunParts('https://record.test', FULL, io);
  assert.deepEqual(parts, {});
  const thrown = (async () => {
    throw new Error('offline');
  }) as typeof fetch;
  assert.deepEqual(await readRunParts('https://record.test', FULL, thrown), {});
});
