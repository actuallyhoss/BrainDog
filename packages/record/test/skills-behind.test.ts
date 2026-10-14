/**
 * `skillsBehind`: which skills have lessons about them that their text does not take in yet (`src/methods/
 * skills-behind.ts`, AGT-C16 jobs a and b, as a read). It writes nothing, asks nothing and calls no model.
 *
 * `behindOf` is the rule, tested alone first. Then the read through the real record on a real kernel in memory, with
 * the seed and the agents add-on installed as any add-on is. The seed's own learnings are taken back first, so every
 * lesson an assertion counts is one this file wrote. Its projects take invented names from `fixtures/names.ts`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { no, type Result } from '@braindog/ports';
import type { Entry } from '@braindog/kernel';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { behindOf, firstWords, foldName, methods, SKILLS_BEHIND_MOST, type LessonIn, type SkillIn, type SkillsBehind } from '../src/methods/skills-behind.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { NOW as SEEDED, installAgentsPack, installSeed } from '../../seed/src/index.ts';
import { PROJECTS } from '../../../fixtures/names.ts';

const [HERE, THERE] = [PROJECTS[1], PROJECTS[4]] as const;

/* ── the rule alone ───────────────────────────────────────────────────────────────────────────────────────────── */

const skill = (id: string, name: string, project: string | null = 'p1', because: string[] = [], standing = true): SkillIn => ({ id, name, project, because, standing });
const lesson = (id: string, topic: string | null, project: string | null = 'p1', more: Partial<LessonIn> = {}): LessonIn => ({
  id,
  lesson: `Lesson ${id} said in words.`,
  topic,
  project,
  standing: true,
  supersedes: null,
  ...more,
});
const shown = (got: ReturnType<typeof behindOf>) => got.map((b) => [b.skill.id, b.behind.map((l) => l.id)]);

test('THE RULE: a topic that folds to the skill\'s name bears on it, and one its because already names does not', () => {
  const got = behindOf([skill('s1', 'deploy', 'p1', ['l1'])], [lesson('l1', 'deploy'), lesson('l2', ' Deploy '), lesson('l3', 'déploy'), lesson('l4', 'release')]);
  assert.deepEqual(shown(got), [['s1', ['l2', 'l3']]]);
  assert.equal(foldName('Ship_a  Release'), foldName('ship-a-release'));
});

test('THE RULE: a lesson applies in its own project and, from everywhere, in every one; never across projects', () => {
  const skills = [skill('s1', 'deploy', 'p1'), skill('s2', 'deploy', null)];
  const got = behindOf(skills, [lesson('l1', 'deploy', 'p2'), lesson('l2', 'deploy', null), lesson('l3', 'deploy', 'p1')]);
  assert.deepEqual(shown(got), [['s1', ['l2', 'l3']], ['s2', ['l2']]], 'most behind first; a project\'s lesson is not the everywhere skill\'s');
});

test('THE RULE: only lessons and skills that stand, and a lesson a standing one replaces is out, down a chain', () => {
  const lessons = [
    lesson('a', 'deploy'),
    lesson('b', 'deploy', 'p1', { supersedes: 'a' }),
    lesson('c', 'deploy', 'p1', { supersedes: 'b' }),
    lesson('d', 'deploy', 'p1', { standing: false }),
    lesson('e', 'deploy', 'p1', { lesson: '   ' }),
  ];
  assert.deepEqual(shown(behindOf([skill('s1', 'deploy'), skill('s2', 'deploy', 'p1', [], false)], lessons)), [['s1', ['c']]]);
  assert.deepEqual(shown(behindOf([skill('s1', 'deploy')], [lesson('x', 'deploy', 'p1', { supersedes: 'y' }), lesson('y', 'deploy', 'p1', { supersedes: 'x' })])), [['s1', ['x', 'y']]], 'a loop puts nothing out');
});

test('FIRST WORDS: cut at a word, one line, no em dash', () => {
  assert.equal(firstWords('Short — and plain.'), 'Short, and plain.');
  const long = firstWords('Run every migration against a copy of the record before the deploy goes out to anybody at all today', 40);
  assert.ok(long.length <= 40 && long.endsWith('…') && !/\s…$/u.test(long), long);
  assert.equal(long, 'Run every migration against a copy of…');
});

/* ── through the real record ──────────────────────────────────────────────────────────────────────────────────── */

const DAY = 86_400_000;
const NOW = SEEDED + 30 * DAY;
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true };
/** A member who reads the projects and the skills, and not the learnings. */
const shut: CallContext = { principal: { kind: 'person', id: 'p_3', level: 'read' }, registers: ['things', 'skills'] };

type Api = Awaited<ReturnType<typeof createRecordApi>>;
type Made = { api: Api; sql: ReturnType<typeof openSqlite>; clock: ReturnType<typeof fixedClock>; here: string; there: string };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

async function record(): Promise<Made> {
  const sql = openSqlite();
  const clock = fixedClock(SEEDED);
  const api = await createRecordApi({ sql, clock });
  value(await installSeed(api.kernel));
  value(await installAgentsPack(api.kernel));
  const seeded = value<{ rows: Entry[] }>(await api.list({ register: 'learnings', limit: 50 }, owner)).rows;
  for (const row of seeded)
    if (row.state === 'active') value(await api.update({ register: 'learnings', seq: row.seq!, patch: { state: 'reverted', why: 'Taken off so this file counts only what it wrote.' } }, owner));
  const project = async (name: string) => value<Entry>(await api.create({ register: 'things', fields: { name, lane: 'building' } }, owner)).id;
  const [here, there] = [await project(HERE), await project(THERE)];
  clock.set(NOW);
  return { api, sql, clock, here, there };
}

let made = 0;
/** One lesson about `topic`, in a project or everywhere, made a day after the one before, and its row. */
async function learn(r: Made, topic: string, project: string | null, words: string, more: Record<string, unknown> = {}): Promise<Entry> {
  r.clock.set(NOW + (made += 1) * 60_000);
  const row = value<Entry>(
    await r.api.create(
      { register: 'learnings', fields: { lesson: words, because: `It went wrong once, and this is the note of how: ${words}`, kind: 'method', topic, ...(project ? { project } : {}), ...more } },
      owner,
    ),
  );
  return row;
}

async function teach(r: Made, name: string, project: string | null, because: string[] = []): Promise<Entry> {
  return value<Entry>(
    await r.api.create(
      { register: 'skills', fields: { name, trigger: `When the work calls for ${name}.`, kind: 'skill', body: `# ${name}\n\nThe steps.\n`, ...(project ? { project } : {}), because } },
      owner,
    ),
  );
}

const events = (r: Made): number => r.sql.one<{ n: number }>('SELECT count(*) AS n FROM event')!.n;

/**
 * THE METHOD AS THE RECORD SERVES IT once `methods/index.ts` joins it; until then the file's own `methods`, handed the
 * real kernel and storage, and a ladder that reads `registers` as the record's `guard` does for a member. So the read
 * is green before the join, and the same tests run through the record's own guards after it.
 */
const skillsBehindOf = (r: Made) => {
  const served = (r.api as unknown as { skillsBehind?: (a: unknown, c: CallContext) => Promise<Result<SkillsBehind>> }).skillsBehind;
  if (typeof served === 'function') return served.bind(r.api);
  const shutTo = (ctx: CallContext, register: string) =>
    ctx.registers === undefined || ctx.registers.includes(register) ? null : ({ code: 'FORBIDDEN', fix: `You may not read ${register}.` } as never);
  const own = methods({ kernel: r.api.kernel, sql: r.sql, scoped: () => null, readable: shutTo, no } as never);
  return own.skillsBehind;
};
const behind = async (r: Made, ctx: CallContext = owner, args: unknown = {}): Promise<SkillsBehind> => value<SkillsBehind>(await skillsBehindOf(r)(args as never, ctx));

test('TWO LESSONS ON DEPLOY, ONE ALREADY IN ITS BECAUSE: the skill is behind by one, named by its words', async () => {
  const r = await record();
  const taken = await learn(r, 'deploy', r.here, 'Tag the release before the deploy starts.');
  const fresh = await learn(r, 'Deploy', r.here, 'Run the migrations against a copy of the record before every deploy, never after it.');
  const deploy = await teach(r, 'deploy', r.here, [taken.id]);
  const got = await behind(r);
  assert.deepEqual(got, {
    skills: [
      {
        skill: r.api.kernel.nameOf(deploy.id),
        name: 'deploy',
        project: HERE,
        behind: [{ learning: r.api.kernel.nameOf(fresh.id), lesson: firstWords('Run the migrations against a copy of the record before every deploy, never after it.') }],
        count: 1,
      },
    ],
    total: 1,
  });
  assert.doesNotMatch(JSON.stringify(got), /[0-9A-HJKMNP-TV-Z]{26}/u, 'no row id leaves the read');
});

test('A LESSON IN ANOTHER PROJECT DOES NOT BEAR, and one from everywhere does', async () => {
  const r = await record();
  await teach(r, 'deploy', r.here);
  await learn(r, 'deploy', r.there, `Deploy ${THERE} only from its own branch.`);
  assert.deepEqual(await behind(r), { skills: [], total: 0 });
  const wide = await learn(r, 'deploy', null, 'Say in the channel before any deploy begins.');
  assert.deepEqual((await behind(r)).skills.map((s) => s.behind.map((b) => b.learning)), [[r.api.kernel.nameOf(wide.id)]]);
});

test('A SUPERSEDED LESSON DOES NOT BEAR, and neither does one a standing lesson replaces', async () => {
  const r = await record();
  await teach(r, 'deploy', r.here);
  const old = await learn(r, 'deploy', r.here, 'Deploy on a Friday afternoon is fine.');
  value(await r.api.update({ register: 'learnings', seq: old.seq!, patch: { state: 'superseded', why: 'A Friday deploy broke the weekend twice in a row.' } }, owner));
  assert.deepEqual(await behind(r), { skills: [], total: 0 });
  const was = await learn(r, 'deploy', r.here, 'Deploy before noon on any weekday.');
  const now = await learn(r, 'deploy', r.here, 'Deploy before noon, and never on a Friday.', { supersedes: was.id });
  assert.deepEqual((await behind(r)).skills[0]!.behind.map((b) => b.learning), [r.api.kernel.nameOf(now.id)]);
});

test('A RETIRED SKILL IS NOT LISTED, and the most behind comes first', async () => {
  const r = await record();
  const deploy = await teach(r, 'deploy', r.here);
  await teach(r, 'review', r.here);
  await learn(r, 'deploy', r.here, 'Tag the release before the deploy starts.');
  await learn(r, 'review', r.here, 'Read the whole change before the first comment.');
  await learn(r, 'review', r.here, 'Run the checks yourself before you approve.');
  assert.deepEqual((await behind(r)).skills.map((s) => [s.name, s.count]), [['review', 2], ['deploy', 1]]);
  value(await r.api.update({ register: 'skills', seq: deploy.seq!, patch: { state: 'retired' } }, owner));
  const got = await behind(r);
  assert.deepEqual([got.skills.map((s) => s.name), got.total], [['review'], 1]);
  assert.deepEqual((await behind(r, owner, { limit: 1 })).skills.length, 1);
});

test('A MEMBER CLOSED TO THE LEARNINGS HEARS NOTHING, and a limit out of range is refused at limit', async () => {
  const r = await record();
  await teach(r, 'deploy', r.here);
  await learn(r, 'deploy', r.here, 'Tag the release before the deploy starts.');
  assert.equal((await behind(r)).total, 1);
  assert.deepEqual(await behind(r, shut), { skills: [], total: 0 });
  for (const limit of [0, SKILLS_BEHIND_MOST + 1, 'many', 2.5]) {
    const got = (await skillsBehindOf(r)({ limit } as never, owner)) as { ok: boolean; refusal?: { code: string; at?: string } };
    assert.ok(!got.ok && got.refusal?.code === 'VALUE_MALFORMED' && got.refusal.at === 'limit', JSON.stringify(got));
  }
});

test('NOTHING IS WRITTEN: the log is as long after three reads as before', async () => {
  const r = await record();
  await teach(r, 'deploy', r.here);
  await learn(r, 'deploy', r.here, 'Tag the release before the deploy starts.');
  const before = events(r);
  await behind(r);
  await behind(r, shut);
  await behind(r, owner, { limit: 3 });
  assert.equal(events(r), before);
});
