/**
 * The scope of what has none, proposed with its reasons (AGT-D04 job 1): each of decision 5's four votes alone, two
 * that agree, two that disagree, a row already placed, a declined pair, the rows a finished project strands, and the
 * question's line at nought, one and many.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  proposalLine,
  proposalsFor,
  strandedAnswers,
  strandedFor,
  strandedLine,
  type ScopeEvidence,
  type ScopeProject,
  type ScopeRow,
} from '../src/scope-propose.ts';

const OXBOW: ScopeProject = { id: 'p-oxbow', name: 'Oxbow.gg', repos: ['https://github.com/sam/oxbow.git'], folders: ['/Users/sam/Developer/oxbow'] };
const DRIFTWOOD: ScopeProject = { id: 'p-driftwood', name: 'Driftwood', repos: ['git@github.com:sam/driftwood'] };
const OLD: ScopeProject = { id: 'p-old', name: 'Harbour', finished: true };
const PROJECTS = [OXBOW, DRIFTWOOD, OLD];

const key = (over: Partial<ScopeRow> = {}): ScopeRow => ({ id: 'k1', list: 'credentials', name: 'Payments key', project: null, ...over });
const uses = (n: number, project: string | null, at = '2026-10-01'): NonNullable<ScopeEvidence['uses']> =>
  Array.from({ length: n }, (_, i) => ({ row: 'k1', run: `S${i + 1}`, project, at }));

/** Every id a person could read, which no sentence may hold. */
const IDS = /p-oxbow|p-driftwood|p-old|k1|S\d|github|\/Users/;
const sentences = (rows: ScopeRow[], ev: ScopeEvidence): string[] => proposalsFor(rows, ev, PROJECTS).flatMap((p) => p.reasons);

test('NEEDED ALONE: every tool that needs the key is in one project, so it is proposed there', () => {
  const ev: ScopeEvidence = { namers: [{ row: 'k1', by: 'Stripe sync', project: 'p-oxbow' }] };
  assert.deepEqual(proposalsFor([key()], ev, PROJECTS), [{ row: 'k1', list: 'credentials', project: 'p-oxbow', reasons: ['Needed by Stripe sync in Oxbow.gg'] }]);
  const two: ScopeEvidence = { namers: [{ row: 'k1', by: 'Stripe sync', project: 'p-oxbow' }, { row: 'k1', by: 'Refunds', project: 'p-oxbow' }] };
  assert.deepEqual(proposalsFor([key()], two, PROJECTS)[0]?.reasons, ['Needed by Stripe sync and 1 more, all in Oxbow.gg']);
});

test('NEEDED BY A TOOL PLACED NOWHERE is needed everywhere, so it makes no vote', () => {
  const ev: ScopeEvidence = { namers: [{ row: 'k1', by: 'Stripe sync', project: 'p-oxbow' }, { row: 'k1', by: 'Shell', project: null }] };
  assert.deepEqual(proposalsFor([key()], ev, PROJECTS), []);
});

test('USED ALONE: three runs in one project in the window is a strong vote, two is not', () => {
  const [p] = proposalsFor([key()], { uses: uses(4, 'p-oxbow') }, PROJECTS);
  assert.deepEqual(p?.reasons, ['Used by 4 runs in Oxbow.gg in the last 90 days']);
  assert.deepEqual(proposalsFor([key()], { uses: uses(2, 'p-oxbow') }, PROJECTS), []);
  /* One run using the key many times is one run. */
  const same = Array.from({ length: 5 }, () => ({ row: 'k1', run: 'S1', project: 'p-oxbow' }));
  assert.deepEqual(proposalsFor([key()], { uses: same }, PROJECTS), []);
});

test('USED BEFORE THE WINDOW is not read, and a run placed nowhere breaks the vote', () => {
  assert.deepEqual(proposalsFor([key()], { since: '2026-07-16', uses: uses(4, 'p-oxbow', '2026-05-01') }, PROJECTS), []);
  assert.deepEqual(proposalsFor([key()], { uses: [...uses(4, 'p-oxbow'), { row: 'k1', run: 'S9', project: null }] }, PROJECTS), []);
});

test('SAID ALONE or MADE ALONE is a weak vote, and one weak vote proposes nothing', () => {
  assert.deepEqual(proposalsFor([key({ name: 'Oxbow.gg Stripe' })], {}, PROJECTS), []);
  assert.deepEqual(proposalsFor([key()], { made: [{ row: 'k1', project: 'p-oxbow' }] }, PROJECTS), []);
});

test('TWO WEAK VOTES THAT AGREE propose the project, each with its reason', () => {
  const row = key({ texts: [{ label: 'Came from', text: 'the .mcp.json in /Users/sam/Developer/oxbow' }] });
  const [p] = proposalsFor([row], { made: [{ row: 'k1', project: 'p-oxbow', by: 'Claude Code' }] }, PROJECTS);
  assert.equal(p?.project, 'p-oxbow');
  assert.deepEqual(p?.reasons, ['“Came from” names a folder of Oxbow.gg', 'Added by Claude Code in Oxbow.gg']);
  const byRepo = key({ texts: [{ label: 'Note', text: 'deploy token for sam/oxbow' }] });
  assert.deepEqual(proposalsFor([byRepo], { made: [{ row: 'k1', project: 'p-oxbow' }] }, PROJECTS)[0]?.reasons, [
    '“Note” names a repository of Oxbow.gg',
    'Added by a run in Oxbow.gg',
  ]);
});

test('A STRONG AND A WEAK VOTE THAT AGREE give the strong reason first', () => {
  const ev: ScopeEvidence = { uses: uses(3, 'p-oxbow'), made: [{ row: 'k1', project: 'p-oxbow' }] };
  assert.deepEqual(proposalsFor([key({ name: 'Oxbow.gg Stripe' })], ev, PROJECTS)[0]?.reasons, [
    'Used by 3 runs in Oxbow.gg in the last 90 days',
    'Its name says Oxbow.gg',
    'Added by a run in Oxbow.gg',
  ]);
});

test('TWO VOTES THAT DISAGREE are a tie, and a tie proposes nothing', () => {
  assert.deepEqual(proposalsFor([key()], { uses: uses(5, 'p-oxbow'), made: [{ row: 'k1', project: 'p-driftwood' }] }, PROJECTS), []);
  /* Runs in two projects say the key is shared, even with a strong vote beside them. */
  const shared: ScopeEvidence = { namers: [{ row: 'k1', by: 'Stripe sync', project: 'p-oxbow' }], uses: [{ row: 'k1', run: 'S7', project: 'p-driftwood' }] };
  assert.deepEqual(proposalsFor([key()], shared, PROJECTS), []);
  /* Words naming two projects are no vote and two rivals. */
  assert.deepEqual(proposalsFor([key({ name: 'Oxbow.gg and Driftwood' })], { uses: uses(3, 'p-oxbow') }, PROJECTS), []);
});

test('A LONGER NAME IS NOT ALSO READ AS A SHORTER ONE inside it', () => {
  const oxbow = { id: 'p-b', name: 'Oxbow' };
  const [p] = proposalsFor([key({ name: 'Oxbow.gg Stripe' })], { made: [{ row: 'k1', project: 'p-oxbow' }] }, [...PROJECTS, oxbow]);
  assert.equal(p?.project, 'p-oxbow');
});

test('A ROW ALREADY PLACED is never touched, so nothing is ever widened or moved', () => {
  const ev: ScopeEvidence = { uses: uses(5, 'p-driftwood'), namers: [{ row: 'k1', by: 'Stripe sync', project: 'p-driftwood' }] };
  assert.deepEqual(proposalsFor([key({ project: 'p-oxbow' })], ev, PROJECTS), []);
  assert.deepEqual(proposalsFor([key({ retired: true })], ev, PROJECTS), []);
});

test('A DECLINED PAIR is not proposed again, and the same row may still go elsewhere', () => {
  const ev: ScopeEvidence = { uses: uses(3, 'p-oxbow') };
  assert.deepEqual(proposalsFor([key()], ev, PROJECTS, new Set(['k1:p-oxbow'])), []);
  assert.equal(proposalsFor([key()], ev, PROJECTS, new Set(['k1:p-driftwood'])).length, 1);
});

test('A FINISHED PROJECT is never proposed, and evidence for it is no rival', () => {
  assert.deepEqual(proposalsFor([key()], { uses: uses(3, 'p-old') }, PROJECTS), []);
  const ev: ScopeEvidence = { uses: uses(3, 'p-oxbow'), made: [{ row: 'k1', project: 'p-old' }] };
  assert.equal(proposalsFor([key()], ev, PROJECTS)[0]?.project, 'p-oxbow');
  /* A project not handed in cannot be named, so it is a rival and never proposed. */
  assert.deepEqual(proposalsFor([key()], { uses: uses(3, 'p-gone') }, PROJECTS), []);
});

test('NO EVIDENCE proposes nothing, and every sentence says names, never ids', () => {
  assert.deepEqual(proposalsFor([key()], {}, PROJECTS), []);
  const row = key({ name: 'Oxbow.gg Stripe', texts: [{ label: 'Came from', text: 'https://github.com/sam/oxbow' }] });
  const all = sentences([row], { uses: uses(3, 'p-oxbow'), namers: [{ row: 'k1', by: 'Stripe sync', project: 'p-oxbow' }], made: [{ row: 'k1', project: 'p-oxbow' }] });
  assert.equal(all.length, 4);
  for (const s of all) assert.doesNotMatch(s, IDS);
});

test('STRANDED ROWS are the live ones placed in a finished project', () => {
  const rows = [key({ id: 'a', project: 'p-old' }), key({ id: 'b', project: 'p-oxbow' }), key({ id: 'c', project: null }), key({ id: 'd', project: 'p-old', retired: true })];
  assert.deepEqual(strandedFor(rows, PROJECTS).map((r) => r.id), ['a']);
  assert.deepEqual(strandedFor(rows, [OXBOW, DRIFTWOOD]), []);
});

test('THE LINE is empty at nought, singular at one, and counts many', () => {
  const keys = { name: 'Keys', one: 'key' };
  assert.equal(proposalLine(0, keys), '');
  assert.equal(proposalLine([], keys), '');
  assert.equal(proposalLine(1, keys), 'Move 1 key to the project it belongs to?');
  assert.equal(proposalLine(52, keys), 'Move 52 keys to the projects they belong to?');
  assert.equal(strandedLine(0, keys), '');
  assert.equal(strandedLine(1, keys), '1 key belongs to a finished project.');
  assert.equal(strandedLine(3, keys), '3 keys belong to finished projects.');
  assert.deepEqual(strandedAnswers(1), ['Retire it', 'Keep it for every project', 'Leave it']);
  assert.deepEqual(strandedAnswers(3), ['Retire them', 'Keep them for every project', 'Leave them']);
});
