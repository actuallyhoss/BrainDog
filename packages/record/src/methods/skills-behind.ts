/**
 * Which skills are behind their findings: `skillsBehind` (READ+), AGT-C16 jobs a and b as a read ("and the skills
 * updates with findings and stuff", D0.10; "A change to a skill's text is proposed with its diff", D0.176).
 *
 * BEFORE THIS ONLY THE NIGHTLY DRAFT ASKED IT (`skillBearings` in `../slash.ts`), and the draft needs a model that
 * offers a skill ask, so on a record with no such model nothing said which skills have lessons they do not take in.
 * This says it with no model: "deploy has 2 lessons it does not take in yet", for Home and for every agent.
 *
 * THE RULE, IN `behindOf` AND NOWHERE ELSE, so it is tested alone:
 *   - A lesson bears on a skill when its topic, folded, is the skill's name, folded (case, accents, and a run of
 *     spaces, hyphens or underscores, so `Deploy` and ` deploy ` are one skill).
 *   - And it applies where the skill applies: a lesson of the skill's own project, or a lesson of everywhere, which
 *     holds in every project. A lesson of one project never bears on a skill of another, nor on a skill of everywhere,
 *     whose text every project is handed.
 *   - Only a lesson that stands: in the state its list starts a row in, and not replaced by one that stands (its
 *     `supersedes`, down a chain and never round a loop, as `replacedIn` in `./learnings.ts` walks it).
 *   - Only a skill that stands, and a lesson its "Learnings behind it" already names is in it.
 *
 * MOST BEHIND FIRST, `SKILLS_BEHIND_MOST` AT MOST, and `total` counts every skill behind. Each skill names its lessons
 * oldest first, the order its next text would take them in, `BEHIND_SHOWN` at most, and `count` is all of them.
 *
 * HELD TO WHAT THE CALLER MAY READ. Both lists must be open to her, or the answer is empty: nothing from a list she
 * may not read, and no refusal that says the add-on is there. A grant narrowed to some rows reads only those rows. A
 * project is said by its name only to somebody who reads the list that holds it, and as "A project" otherwise.
 *
 * THE TWO LISTS ARE FOUND BY THE PART THEY PLAY (`listFor` in `../agent-lists.ts`), never by their ids, so the agents
 * add-on can be renamed or replaced and this reads on. A record that keeps neither answers the empty answer.
 *
 * NO ID LEAVES HERE. A skill and a learning are called what a person calls them (`LN12`), each beside its words.
 *
 * IT WRITES NOTHING, ASKS NOTHING AND CALLS NO MODEL. Proposing the next version is an agent's, by `propose`, and
 * taking it is his press on Decide.
 */

import type { Result } from '@braindog/ports';

import { listFor } from '../agent-lists.ts';
import type { CallContext } from '../index.ts';
import type { RecordDeps } from './index.ts';

/** The lesson's field that names the skill it bears on ("Skill or topic it bears on"). */
const TOPIC = 'topic';

/** How many skills one answer names at most, and what `limit` may ask for. */
export const SKILLS_BEHIND_MOST = 20;
/** How many of one skill's lessons are named; `count` says them all. */
export const BEHIND_SHOWN = 10;
/** How long a lesson's first words run before they are cut at a word. */
export const LESSON_WORDS_MOST = 80;
/** The most rows read from one list, which is the most the kernel hands in one read. */
const READ_MOST = 500;

/** A skill as the rule reads it: its row id, its name, where it applies (`null` is everywhere), and what it carries. */
export type SkillIn = { id: string; name: string; project: string | null; because: readonly string[]; standing: boolean };
/** A lesson as the rule reads it: its row id, its words, its topic, where it applies, and the one it replaces. */
export type LessonIn = { id: string; lesson: string; topic: string | null; project: string | null; standing: boolean; supersedes: string | null };
/** One skill behind, with the lessons that bear on it and that it does not carry, oldest first. */
export type Behind = { skill: SkillIn; behind: LessonIn[] };

/** One lesson as a person reads it: the learning by its spoken id, and its first words. */
export type BehindLesson = { learning: string; lesson: string };
/** One skill behind, as `skillsBehind` answers it. */
export type SkillBehind = { skill: string; name: string; project: string | null; behind: BehindLesson[]; count: number };
/** What `skillsBehind` answers: the skills, most behind first, and how many are behind in all. */
export type SkillsBehind = { skills: SkillBehind[]; total: number };

/** A name or a topic as the rule compares them: case, accents, and the space or joiners around and between words. */
export const foldName = (text: string): string =>
  text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[\s_-]+/gu, ' ')
    .trim();

/** The ids that standing lessons replace, down a chain and never round a loop (`replacedIn` in `./learnings.ts`). */
const replacedBy = (lessons: readonly LessonIn[]): Set<string> => {
  const out = new Set<string>();
  const byId = new Map(lessons.map((l) => [l.id, l]));
  const named = (l: LessonIn): string | null => (l.supersedes && l.supersedes !== l.id ? l.supersedes : null);
  const isNamed = new Set(lessons.map(named).filter((id): id is string => id !== null));
  for (const head of lessons) {
    if (isNamed.has(head.id)) continue;
    let at = named(head);
    while (at !== null && at !== head.id && !out.has(at)) {
      out.add(at);
      const next = byId.get(at);
      at = next === undefined ? null : named(next);
    }
  }
  return out;
};

/**
 * Every standing skill with standing lessons that bear on it and that it does not carry, most behind first, then by
 * name. `lessons` are in the order they were made, oldest first, and each skill's are kept in that order. Pure.
 */
export function behindOf(skills: readonly SkillIn[], lessons: readonly LessonIn[]): Behind[] {
  const standing = lessons.filter((l) => l.standing);
  const out = replacedBy(standing);
  const byTopic = new Map<string, LessonIn[]>();
  for (const l of standing) {
    const topic = l.topic === null ? '' : foldName(l.topic);
    if (topic === '' || out.has(l.id) || l.lesson.trim() === '') continue;
    byTopic.set(topic, [...(byTopic.get(topic) ?? []), l]);
  }
  const found: Behind[] = [];
  for (const skill of skills) {
    if (!skill.standing) continue;
    const name = foldName(skill.name);
    if (name === '') continue;
    const carried = new Set(skill.because);
    const behind = (byTopic.get(name) ?? []).filter((l) => !carried.has(l.id) && (l.project === null || l.project === skill.project));
    if (behind.length > 0) found.push({ skill, behind });
  }
  return found.sort((a, b) => b.behind.length - a.behind.length || (a.skill.name < b.skill.name ? -1 : a.skill.name > b.skill.name ? 1 : 0));
}

/** A lesson's first words: one line, cut at a word before `most`, with no em dash. */
export const firstWords = (text: string, most = LESSON_WORDS_MOST): string => {
  const one = text.replace(/\s+/gu, ' ').replace(/\s*—\s*/gu, ', ').trim();
  if (one.length <= most) return one;
  const cut = one.slice(0, most - 1);
  const at = cut.lastIndexOf(' ');
  return `${(at > 0 ? cut.slice(0, at) : cut).replace(/[\s,;:.]+$/u, '')}…`;
};

type Field = { id: string; type?: string; of?: string; to?: string; retired?: boolean; scope?: unknown; default?: unknown };

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value : null);

export function methods(deps: RecordDeps) {
  const { kernel, scoped, readable, no } = deps;

  /**
   * One list's standing rows as the caller's grant admits them, newest 500 read and handed oldest first, with its
   * declaration's fields. `null` when the record does not hold the list or she may not read it.
   */
  const standingRows = (ctx: CallContext, id: string | null) => {
    if (id === null) return null;
    const decl = kernel.register(id);
    if (!decl || readable(ctx, id) !== null) return null;
    const fields = decl.fields as readonly Field[];
    const start = decl.state === undefined ? undefined : fields.find((f) => f.id === decl.state)?.default;
    const where = decl.state !== undefined && typeof start === 'string' ? { field: decl.state, is: start } : undefined;
    const got = kernel.list({ register: id, ...(where ? { where } : {}), order: [{ field: 'seq', dir: 'desc' }], limit: READ_MOST }, kernel.scope(ctx, id));
    if (!got.ok) return null;
    return { decl, fields, rows: got.value.rows.toReversed(), standing: (state: string | null | undefined) => where === undefined || state === start };
  };

  return {
    /**
     * `{ limit? }`: the skills behind their findings, most behind first, `SKILLS_BEHIND_MOST` at most, each with the
     * lessons that bear on it and that its text does not take in yet, and `total`, every skill behind. READ+, empty
     * where either list is closed to the caller, and it changes nothing.
     */
    async skillsBehind(args: { limit?: unknown } | undefined, ctx: CallContext): Promise<Result<SkillsBehind>> {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false, refusal: stop };
      const limit = args?.limit ?? SKILLS_BEHIND_MOST;
      if (typeof limit !== 'number' || !Number.isSafeInteger(limit) || limit < 1 || limit > SKILLS_BEHIND_MOST)
        return no('VALUE_MALFORMED', `limit is a whole number from 1 to ${SKILLS_BEHIND_MOST}.`, { at: 'limit' });
      const none: SkillsBehind = { skills: [], total: 0 };

      const lists = kernel.registers();
      const lessonList = listFor('learnings', lists);
      const lessons = standingRows(ctx, lessonList);
      const skills = lessons === null ? null : standingRows(ctx, listFor('skills', lists));
      if (lessons === null || skills === null) return { ok: true, value: none };
      /* EACH FIELD BY WHAT THE LISTS DECLARE: the one a lesson names its replaced one in points at its own list, where a
         row applies is the field that scopes it, and a skill's lessons are the list of refs to the lessons. */
      const replaces = lessons.fields.find((f) => f.type === 'ref' && f.to === lessonList && !f.retired)?.id;
      const lessonPlace = lessons.fields.find((f) => f.scope !== undefined && !f.retired)?.id;
      const skillPlace = skills.fields.find((f) => f.scope !== undefined && !f.retired)?.id;
      const carries = skills.fields.find((f) => f.type === 'list' && f.of === 'ref' && f.to === lessonList && !f.retired)?.id;
      if (!lessons.fields.some((f) => f.id === TOPIC && !f.retired) || carries === undefined) return { ok: true, value: none };

      const lessonIn: LessonIn[] = lessons.rows.map((row) => ({
        id: row.id,
        lesson: text(row.fields[lessons.decl.title]) ?? '',
        topic: text(row.fields[TOPIC]),
        project: lessonPlace === undefined ? null : text(row.fields[lessonPlace]),
        standing: lessons.standing(row.state),
        supersedes: replaces === undefined ? null : text(row.fields[replaces]),
      }));
      const skillIn: SkillIn[] = skills.rows.map((row) => {
        const held = row.fields[carries];
        return {
          id: row.id,
          name: text(row.fields[skills.decl.title]) ?? '',
          project: skillPlace === undefined ? null : text(row.fields[skillPlace]),
          because: Array.isArray(held) ? held.filter((x): x is string => typeof x === 'string') : [],
          standing: skills.standing(row.state),
        };
      });

      /* A PROJECT BY ITS NAME, to somebody who reads the list that holds it, and never by an id. */
      const projectName = (project: string | null): string | null => {
        if (project === null) return null;
        const row = kernel.get(project);
        const title = row && readable(ctx, row.register) === null ? kernel.titleOfRow(project) : null;
        return text(title) ?? 'A project';
      };
      const found = behindOf(skillIn, lessonIn);
      const said: SkillBehind[] = found.slice(0, limit).map(({ skill, behind }) => ({
        skill: kernel.nameOf(skill.id),
        name: skill.name,
        project: projectName(skill.project),
        behind: behind.slice(0, BEHIND_SHOWN).map((l) => ({ learning: kernel.nameOf(l.id), lesson: firstWords(l.lesson) })),
        count: behind.length,
      }));
      return { ok: true, value: { skills: said, total: found.length } };
    },
  };
}
