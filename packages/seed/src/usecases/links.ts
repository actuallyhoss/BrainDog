/**
 * The links between a use case's example rows, made after its pack is installed.
 *
 * A SEED CARRIES NO `ref` VALUE (42 §5.2, D9): a seed is applied inside the install, before any row it could
 * point at has a sequence. So a student's example assignment arrived with no course and a guide's first step with
 * no milestone, and Studies drew an empty Course column. The installer that puts the examples in links them
 * afterwards, by title, through the ordinary write path, as a person would. The kernel knows nothing of it.
 *
 * IT ONLY TOUCHES EXAMPLES. A row is linked when it carries the `example` marker and the field is still empty, and
 * only to a row that is itself an example with that title, so a row somebody wrote or already linked is left alone.
 * A write that is refused is skipped: an unlinked example is not worth failing an install over.
 */

import { useCase } from './index.ts';

/** One link: the example row titled `title` in `register` points its `field` at the example titled `target` in `to`. */
export type ExampleLink = { register: string; title: string; field: string; to: string; target: string };

/** A row as the linker reads it. */
export type LinkRow = { seq: number | null; fields: Record<string, unknown> };

/** What linking needs from whatever holds the record: the browser's client, or the record itself. */
export type LinkIo = {
  /** Every row of a list, or `null` when it cannot be read. A few dozen at most on a new record. */
  rows: (register: string) => Promise<readonly LinkRow[] | null>;
  /** Point one row's field at a row, spoken as `courses#3`. `false` when the write was refused. */
  link: (register: string, seq: number, field: string, spoken: string) => Promise<boolean>;
};

const COURSE = 'Introduction to statistics';
const CYCLE = 'Cycle 1';

const LINKS: Readonly<Record<string, readonly ExampleLink[]>> = {
  student: [
    { register: 'assignments', title: 'Problem set 1: probability', field: 'course', to: 'courses', target: COURSE },
    { register: 'study_sessions', title: 'Go over the lecture on conditional probability', field: 'course', to: 'courses', target: COURSE },
  ],
  guide: [
    { register: 'steps', title: 'Write one sentence about what this is and who it is for', field: 'milestone', to: 'milestones', target: 'Say what it is and who it is for' },
    { register: 'steps', title: 'Name three people who would use it', field: 'milestone', to: 'milestones', target: 'Find the people who want it' },
    { register: 'steps', title: 'Ask one of them what they would want first', field: 'milestone', to: 'milestones', target: 'Find the people who want it' },
    { register: 'choices', title: 'What will it be called?', field: 'milestone', to: 'milestones', target: 'Say what it is and who it is for' },
    { register: 'resources', title: 'Three projects like yours to learn from', field: 'milestone', to: 'milestones', target: 'Plan the smallest first version' },
  ],
  team: [
    { register: 'tickets', title: 'Write the release notes', field: 'cycle', to: 'cycles', target: CYCLE },
    { register: 'tickets', title: 'Agree what goes in the next cycle', field: 'cycle', to: 'cycles', target: CYCLE },
    { register: 'tickets', title: 'Fix the sign-in link that expires too soon', field: 'cycle', to: 'cycles', target: CYCLE },
    { register: 'tickets', title: 'Wait on the design for the settings screen', field: 'cycle', to: 'cycles', target: CYCLE },
    { register: 'tickets', title: 'Tidy the backlog labels', field: 'cycle', to: 'cycles', target: CYCLE },
  ],
};

/** The links a use case makes between its examples, by its id (`student`, or `usecase-student`). None for most. */
export const exampleLinks = (usecase: string): readonly ExampleLink[] => LINKS[usecase.replace(/^usecase-/u, '')] ?? [];

/** The field a list's rows are titled by, read off the pack the use case carries. */
export function titleFieldOf(usecase: string, register: string): string | undefined {
  const declarations = (useCase(usecase.replace(/^usecase-/u, ''))?.pack?.declarations ?? []) as Record<string, unknown>[];
  const title = declarations.find((d) => d.register === register && d.page === undefined)?.title;
  return typeof title === 'string' ? title : undefined;
}

const isExample = (row: LinkRow): boolean => Array.isArray(row.fields.tags) && (row.fields.tags as unknown[]).includes('example');
const empty = (v: unknown): boolean => v === undefined || v === null || v === '';

/** Link a use case's example rows to each other. Answers how many links were made; never throws for a refusal. */
export async function linkExamples(io: LinkIo, usecase: string): Promise<number> {
  const links = exampleLinks(usecase);
  const read = new Map<string, readonly LinkRow[]>();
  const rowsOf = async (register: string): Promise<readonly LinkRow[]> => {
    if (!read.has(register)) read.set(register, (await io.rows(register).catch(() => null)) ?? []);
    return read.get(register) ?? [];
  };
  const find = async (register: string, title: string): Promise<LinkRow | undefined> => {
    const field = titleFieldOf(usecase, register);
    if (field === undefined) return undefined;
    return (await rowsOf(register)).find((r) => isExample(r) && r.fields[field] === title);
  };
  let made = 0;
  for (const l of links) {
    const row = await find(l.register, l.title);
    if (!row || row.seq === null || !empty(row.fields[l.field])) continue;
    const target = await find(l.to, l.target);
    if (!target || target.seq === null) continue;
    if (await io.link(l.register, row.seq, l.field, `${l.to}#${target.seq}`).catch(() => false)) made += 1;
  }
  return made;
}
