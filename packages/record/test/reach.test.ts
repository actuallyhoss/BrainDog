/**
 * ENG-B20 job 1: Slash's reach, its tools-and-skills and tone sources.
 *
 * WHAT THE OWNER'S RECORD SHOWED: the one skill Slash offered said "Its steps are not written yet.", so what was offered
 * was a name. These hold the rules that end it: a skill is offered only when three runs in one project did the same
 * three things, every step quotes the handoff it came from, a skill that already says them stops the offer, and a tone
 * draft keeps only labels in his own words and voice lines with no digit.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PROJECTS } from '../../../fixtures/names.ts';
import { basisMoved, LAPSE_DAYS } from '../src/design-agent.ts';
import { namedSteps, reachQueue, skillOffers, toneKept } from '../src/reach.ts';
import type { ReachRun, SkillChange } from '../src/reach.ts';

const NOW = Date.UTC(2026, 9, 14, 9);
const LAPSES = '2026-10-28';
const [PROJECT, OTHER] = [PROJECTS[0], PROJECTS[1]];

/** Three handoffs that did the same three things, each said its own way. */
const HANDOFFS = [
  'Built and checked the release.\n- Ran `pnpm build` from the root.\n- Then `pnpm test --filter web` passed.\n- Updated `docs/release-notes.md` with the date.\nNext: ask about the icon.',
  'Release day. `pnpm build` first.\n`pnpm test --filter web` again, all green.\nWrote `docs/release-notes.md` and left the icon.',
  'Same as last time: `pnpm build`, then `pnpm test --filter web`. The notes are in `docs/release-notes.md` now.',
  'Fourth time round. Ran `pnpm build`.\nRan `pnpm test --filter web`.\nTouched `docs/release-notes.md` once more.',
];
const SPOKEN = ['amber-otter', 'brisk-heron', 'quiet-lynx', 'tidal-finch'];
const runsOf = (n: number, project: string | null = PROJECT): ReachRun[] => HANDOFFS.slice(0, n).map((handoff, i) => ({ spoken: SPOKEN[i]!, project, handoff }));
const stepsOf = (change: unknown): SkillChange['steps'] => (change as SkillChange).steps;

test('three runs with the same three commands make one offer with three quoted steps', () => {
  const offers = skillOffers(runsOf(3), [], NOW);
  assert.equal(offers.length, 1);
  const [o] = offers;
  assert.equal(o!.class, 'arrange');
  assert.equal(o!.lapses, LAPSES, `an offer waits ${LAPSE_DAYS} days`);
  assert.equal(o!.why, `3 runs in ${PROJECT} did these steps.`);
  assert.equal(o!.change.kind, 'skill');
  const change = o!.change as SkillChange;
  assert.equal(change.project, PROJECT);
  assert.deepEqual(
    change.steps.map((s) => s.text),
    ['pnpm build', 'pnpm test --filter web', 'docs/release-notes.md'],
  );
  /* EACH STEP QUOTES THE HANDOFF IT CAME FROM, word for word, and names the run that wrote it. */
  for (const s of change.steps) {
    const run = runsOf(3).find((r) => r.spoken === s.from);
    assert.ok(run, `${s.from} is one of the runs`);
    assert.ok(run.handoff.includes(s.quote), `"${s.quote}" is in ${s.from}'s handoff`);
    assert.ok(s.quote.includes(s.text), `"${s.quote}" says ${s.text}`);
  }
  assert.equal(change.steps[0]!.quote, 'Ran `pnpm build` from the root.');
  assert.ok(change.name.startsWith(`${PROJECT}: `));
});

test('two runs make none', () => {
  assert.deepEqual(skillOffers(runsOf(2), [], NOW), []);
});

test('three runs in three projects make none: the same thing is done in one project', () => {
  const runs = runsOf(3).map((r, i) => ({ ...r, project: PROJECTS[i]! }));
  assert.deepEqual(skillOffers(runs, [], NOW), []);
});

test('a skill that already says them makes none, and one of another project does not count', () => {
  const body = '1. Run `pnpm build`.\n2. Run `pnpm test --filter web`.\n3. Update `docs/release-notes.md`.';
  assert.deepEqual(skillOffers(runsOf(3), [{ name: 'Release', project: PROJECT, body }], NOW), []);
  assert.deepEqual(skillOffers(runsOf(3), [{ name: 'Release', project: null, body }], NOW), [], 'a skill for every project says them here too');
  assert.equal(skillOffers(runsOf(3), [{ name: 'Release', project: OTHER, body }], NOW).length, 1);
});

test('a step with no quote is dropped, and an offer left with one step is not made', () => {
  /* A FOURTH STEP every run says only beside what reads as a key: it is never quoted, so it is no step. */
  const keyed = 'Seeded it with `pnpm seed --fresh` and the key 4f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c.';
  const runs = runsOf(3).map((r) => ({ ...r, handoff: `${r.handoff}\n${keyed}` }));
  const [o] = skillOffers(runs, [], NOW);
  assert.ok(o);
  assert.deepEqual(
    stepsOf(o.change).map((s) => s.text),
    ['pnpm build', 'pnpm test --filter web', 'docs/release-notes.md'],
  );
  assert.ok(stepsOf(o.change).every((s) => !/\d{6}/u.test(s.quote)));

  /* TWO OF THREE SAID ONLY IN A SENTENCE TOO LONG TO QUOTE: one step is a note, not a skill. */
  const long = `Ran \`pnpm lint --fix\` and \`pnpm format --write\` ${'and kept going over every file there was '.repeat(6)}`;
  const thin = SPOKEN.slice(0, 3).map((spoken) => ({ spoken, project: PROJECT, handoff: `${long}\nThen \`scripts/ship.sh\` ran.` }));
  assert.deepEqual(skillOffers(thin, [], NOW), []);
});

test('the key and basis are the same across calls, and the basis moves when a fourth run joins', () => {
  const [a] = skillOffers(runsOf(3), [], NOW);
  const [b] = skillOffers(runsOf(3), [], NOW);
  assert.deepEqual(a, b);
  const [four] = skillOffers(runsOf(4), [], NOW);
  assert.equal(four!.key, a!.key, 'the same steps are the same offer');
  assert.notEqual(four!.basis, a!.basis);
  assert.equal(basisMoved(a!.basis, four!.basis), true, 'an offer turned down at three comes back at four');
  assert.equal(four!.why, `4 runs in ${PROJECT} did these steps.`);
});

test('a line that starts with a command is named, and prose and bare words are not', () => {
  const named = namedSteps('$ node --test test/a.test.ts\nthen check the logs\nThe `Offer` type is fine.\n1. pnpm --filter web exec tsc --noEmit');
  assert.deepEqual(
    named.map((n) => n.text),
    ['node --test test/a.test.ts', 'pnpm --filter web exec tsc --noEmit'],
  );
});

test('a skill offer goes through the one queue whole', () => {
  const offers = skillOffers(runsOf(3), [], NOW);
  const q = reachQueue(offers, [], [], NOW);
  assert.equal(q.fresh.length, 1);
  assert.equal(q.fresh[0]!.change.kind, 'skill');
  assert.equal(reachQueue(offers, [], [{ key: offers[0]!.key, basis: offers[0]!.basis }], NOW).fresh.length, 0, 'turned down, it stays down');
});

test('toneKept drops a label with a word not his and a voice line with a digit', () => {
  const own = [`${PROJECT} launch plan`, 'Invoices to send this week', "The client's notes"];
  const kept = toneKept(
    { labels: { heading: 'Launch plan', empty: 'Rocket plan', notes: "Client's notes", blank: '  ' }, voice: ['Calm and short.', 'You have 3 things today.', ''] },
    own,
  );
  assert.deepEqual(kept.labels, { heading: 'Launch plan', notes: "Client's notes" });
  assert.deepEqual(kept.voice, ['Calm and short.']);
  assert.deepEqual(kept.dropped, ['Rocket plan', '  ', 'You have 3 things today.', '']);
  assert.deepEqual(toneKept({}, own), { labels: {}, voice: [], dropped: [] });
});

test('it is pure: it imports the recommender alone, and does not know the day', async () => {
  const { readFile } = await import('node:fs/promises');
  const text = await readFile(new URL('../src/reach.ts', import.meta.url), 'utf8');
  const from = (text.match(/^import\s.*from\s+'([^']+)';$/gmu) ?? []).map((l) => /'([^']+)'/u.exec(l)![1]);
  assert.deepEqual([...new Set(from)], ['./design-agent.ts']);
  assert.ok(!/\bDate\.now\b|\bnew Date\(\)/u.test(text));
});
