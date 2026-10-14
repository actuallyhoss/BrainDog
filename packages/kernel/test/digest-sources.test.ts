/**
 * A digest over the record's computed sources (AGT-C19 job c): what agents asked, what they did, the steps they left
 * and the runs working now, five lines a section and 150 words in all, read through one fake block read.
 *
 * Every block answer here is written by hand in the shape `readBlock` answers, so these say what the digest does with
 * an answer, and `sources/*.test.ts` say what the record answers.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PEOPLE, PROJECTS } from '../../../fixtures/names.ts';
import { headline, render, runDigest, sectionsOf, SECTION_LINES, WORDS_MOST, type DigestDecl, type DigestDeps } from '../src/digest.ts';
import { DIGEST_SOURCES } from '../src/digest-sources.ts';
import type { BlockResult, PageBlock } from '../src/pages.ts';

const NOW = Date.parse('2026-10-14T17:00:00Z');
const hoursAgo = (h: number): string => new Date(NOW - h * 3_600_000).toISOString();

type Queued = { kind: string; payload: unknown };

/** A question as `governance.open` answers one. */
const asked = (i: number, h = 1) => ({
  id: `q${i}`,
  who: `agent:s${i}`,
  at: hoursAgo(h),
  kind: 'update',
  question: `Move ${PROJECTS[i % PROJECTS.length]} to next week ${i}`,
  why: '',
  cost: 'cheap',
  options: [],
  run: { id: `S${i}`, app: 'Claude Code' },
});

/** A burst as an `agents` block answers one. */
const did = (i: number, h: number) => ({
  by: 'agent',
  who: `s${i}`,
  count: 2,
  kind: 'update',
  target: `things#${i}`,
  note: null,
  at: hoursAgo(h),
  thing: `${PROJECTS[i % PROJECTS.length]} plan`,
  run_by: { run: `S${i}`, agent: 'claude', client: 'claude-code', parent: null },
});

const answered = (block: PageBlock, over: Partial<BlockResult>): BlockResult => ({ ...block, rows: [], matched: 0, refusals: [], ...over }) as BlockResult;

function fake(answers: Record<string, Partial<BlockResult>>, over: Partial<DigestDeps> = {}) {
  const queued: Queued[] = [];
  const notes: string[] = [];
  const blocks: PageBlock[] = [];
  const deps: DigestDeps = {
    metric: (id) => (id === 'open-things' ? ({ metric: id } as never) : null),
    read: () => ({ ok: true, value: { value: 3, unit: null, rows: 3, held: 3, delta: null, why: '', met: null, refusals: [] } }) as never,
    list: () => ({
      ok: true,
      value: { rows: [{ id: 'e1', register: 'things', seq: 1, fields: { what: `Call ${PEOPLE[2]!.name}` }, state: null, version: 1, created_at: '', updated_at: '', deleted_at: null }], matched: 1 },
    }),
    schemaOf: (register) => (register === 'things' ? ({ register, fields: { what: { type: 'text' } } } as never) : null),
    block: (b) => {
      blocks.push(b);
      return answered(b, answers[b.source ?? ''] ?? {});
    },
    ctx: {} as never,
    owners: () => [PEOPLE[0]!.email],
    outbox: (kind, payload) => void queued.push({ kind, payload }),
    note: (_actor, text) => void notes.push(text),
    delivers: ['notify.email', 'notify.push'],
    interrupted: () => false,
    mint: () => 'id',
    nowMs: NOW,
    tz: 'UTC',
    ...over,
  };
  return { deps, queued, notes, blocks };
}

const decl = (sections: DigestDecl['sections']): DigestDecl => ({ digest: 'evening', name: 'Evening', schedule: { at: '17:00' }, channels: ['in-app', 'email'], sections });

/** The words a person reads: every line but a fence, split at spaces and pipes, a word being one with a letter or digit. */
const wordsOf = (text: string): number =>
  text
    .split('\n')
    .filter((l) => !l.startsWith('```'))
    .flatMap((l) => l.split(/[\s|]+/u))
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

test('THE QUESTIONS AGENTS ASKED ARE SAID IN THEIR OWN WORDS: five drawn, the rest counted, and the headline counts them all', () => {
  const queue = Array.from({ length: 7 }, (_, i) => asked(i + 1));
  const { deps, blocks } = fake({ 'governance.open': { queue: queue as never, matched: 7 } });
  const [part] = sectionsOf(deps, decl([{ heading: 'Needs you', source: 'governance.open', omit_when_empty: true }]));
  assert.equal(blocks[0]!.kind, 'queue', 'read as the queue its page reads it as');
  assert.equal(part!.rows.length, 7);
  assert.equal(part!.matched, 7);
  assert.deepEqual(Object.keys(part!.rows[0]!.fields).sort(), ['asked', 'at', 'who']);
  assert.equal(part!.rows[0]!.fields.who, 'Claude Code S1', 'a name beside the handle, never the actor id');

  const text = render('Evening', [part!]);
  assert.match(text, /Move Copperleaf to next week 1 \| Claude Code S1\n/);
  assert.equal((text.match(/next week/g) ?? []).length, SECTION_LINES);
  assert.match(text, /And 2 more\./);
  assert.equal(headline('Evening', [part!]), 'Evening: Needs you 7');
});

test('WITHIN KEEPS WHAT IS NEW: a 9h section drops what agents did ten hours ago, and says who did it by name', () => {
  const { deps } = fake({ activity: { feed: [did(1, 2), did(2, 10)] as never, matched: 4 } });
  const [part] = sectionsOf(deps, decl([{ heading: 'Done by agents', source: 'activity', within: '9h' }]));
  assert.equal(part!.rows.length, 1);
  assert.equal(part!.matched, 1, 'a feed counts its lines, not its events');
  assert.equal(part!.rows[0]!.fields.who, 'Claude Code S1');
  assert.equal(part!.rows[0]!.fields.did, '2 update Copperleaf plan');
});

test('WITHIN SAYS HOURS OR DAYS: soon is a refusal on its own section, and the section beside it reads', () => {
  const { deps } = fake({ activity: { feed: [did(1, 2)] as never, matched: 2 } });
  const parts = sectionsOf(deps, decl([{ heading: 'Done by agents', source: 'activity', within: 'soon' }, { heading: 'Open', source: 'register.things' }]));
  assert.equal(parts[0]!.refusals[0]?.code, 'VALUE_MALFORMED');
  assert.equal(parts[0]!.refusals[0]?.at, 'within');
  assert.equal(parts[1]!.rows.length, 1);
});

test('A DIGEST WHOSE COMPUTED SECTIONS ARE ALL EMPTY IS NOT SENT, and one on a host that cannot read them is skipped, not refused', () => {
  const sections: DigestDecl['sections'] = [
    { heading: 'Needs you', source: 'governance.open', omit_when_empty: true },
    { heading: 'Done by agents', source: 'activity', omit_when_empty: true, within: '15h' },
    { heading: 'Stuck', source: 'handoffs.open', omit_when_empty: true, where: 'mark is earlier' },
    { heading: 'Working', source: 'sessions.working', omit_when_empty: true },
  ];
  const empty = fake({});
  assert.deepEqual(runDigest(empty.deps, decl(sections)), { sections: 0, channels: [], skipped: true });
  assert.equal(empty.queued.length + empty.notes.length, 0);
  assert.equal(empty.blocks.find((b) => b.source === 'handoffs.open')?.where, 'mark is earlier');
  assert.deepEqual(empty.blocks.find((b) => b.source === 'sessions.working')?.columns, [{ field: 'agent' }, { field: 'doing_said' }]);

  const blind = fake({});
  delete blind.deps.block;
  assert.deepEqual(runDigest(blind.deps, decl(sections)), { sections: 0, channels: [], skipped: true });
  assert.equal(blind.queued.length, 0);

  const [kept] = sectionsOf(blind.deps, decl([{ heading: 'Needs you', source: 'governance.open' }]));
  assert.equal(kept!.refusals[0]?.code, 'SOURCE_UNKNOWN', 'without the flag it is refused as before');
});

test('A BLOCK THAT REFUSES IS A SECTION THAT SAYS SO, and faults.open is no source a digest reads yet', () => {
  const { deps } = fake({ 'handoffs.open': { refusals: [{ code: 'NOT_IN_THIS_BUILD', fix: 'This record does not read the steps runs left onto a page yet.', at: 'source' }] } });
  const parts = sectionsOf(deps, decl([{ heading: 'Stuck', source: 'handoffs.open', omit_when_empty: true }, { heading: 'Faults', source: 'faults.open' }]));
  assert.equal(parts[0]!.refusals[0]?.code, 'NOT_IN_THIS_BUILD');
  assert.equal(parts[1]!.refusals[0]?.code, 'SOURCE_UNKNOWN');
  assert.deepEqual(Object.keys(DIGEST_SOURCES).sort(), ['activity', 'governance.open', 'handoffs.open', 'sessions.working']);
});

test('A FORTY-LINE DIGEST SAYS 150 WORDS AT MOST AND ENDS More in BrainDog.', () => {
  const step = (i: number) => ({ id: `r${i}`, register: 'session', seq: i, fields: { next: `Write the release notes for ${PROJECTS[i % PROJECTS.length]} and check them twice`, agent: 'Claude Code', left_at: hoursAgo(1), mark: 'earlier', token_id: 'secret' }, state: 'handoff', version: 1, created_at: '', updated_at: '', deleted_at: null });
  const { deps, queued } = fake({ 'handoffs.open': { rows: Array.from({ length: 40 }, (_, i) => step(i)) as never, matched: 40 } });
  const sections = Array.from({ length: 8 }, (_, i) => ({ heading: `Stuck ${i + 1}`, source: 'handoffs.open' }));
  const parts = sectionsOf(deps, decl(sections));
  assert.equal(parts[0]!.rows[0]!.fields.token_id, undefined, 'a line holds only what it draws');
  const text = render('Evening', parts);
  assert.ok(wordsOf(text) <= WORDS_MOST, `${wordsOf(text)} words`);
  assert.ok(text.trimEnd().endsWith('More in BrainDog.'));
  assert.ok(!/## Stuck 8/.test(text), 'the sections past the words are not drawn');

  runDigest(deps, decl(sections));
  const mail = queued.find((q) => q.kind === 'notify.email')!.payload as { text: string };
  assert.ok(wordsOf(mail.text) <= WORDS_MOST);
});

test('A LIST AND A FIGURE READ EXACTLY AS BEFORE, with no block read for either', () => {
  const { deps, blocks } = fake({});
  const parts = sectionsOf(deps, decl([{ heading: 'Open', source: 'register.things', columns: [{ field: 'what' }] }, { heading: 'Count', source: 'metric.open-things' }]));
  assert.equal(blocks.length, 0);
  assert.equal(parts[0]!.matched, undefined);
  const text = render('Evening', parts);
  assert.equal(text, ['# Evening', '', '## Open', '', '```table', 'what', 'Call Teodor Vance', '```', '', '## Count', '', '```stat', 'Count | 3', '```', ''].join('\n'));
  assert.equal(headline('Evening', parts), 'Evening: Open 1 · Count 3');
});
