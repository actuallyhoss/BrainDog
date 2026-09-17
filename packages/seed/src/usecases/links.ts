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

import { FIRST_PARTY, firstPartyDocument } from '../packs/first-party.ts';
import { useCase } from './index.ts';
import { PERSONAL_CARRIED, PERSONAL_LOG_LINKS, PERSONAL_STEP_PROJECTS } from './personal.ts';
import { BACKLOG_KEPT_IN, TEAM_PLAN_LINKS, TICKETS_MOVED_IN, backlogAgain, moveTickets } from './team.ts';

/** One link: the example row titled `title` in `register` points its `field` at the example titled `target` in `to`. */
export type ExampleLink = { register: string; title: string; field: string; to: string; target: string };

/**
 * WHAT A FILE SAYS OF ITS OWN LINKS (`UseCase.links`), and the declarations it installs, so a use case shared under an id
 * this build has never heard of links its examples too. The lists' title fields are read from those declarations first.
 */
export type DeclaredLinks = { links: readonly ExampleLink[]; declarations?: readonly Record<string, unknown>[] };

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

const LINKS: Readonly<Record<string, readonly ExampleLink[]>> = {
  /* A PERSON'S STEPS POINT AT PROJECTS AND A GOAL AT AN ACCOUNT, lists Money and Projects hold, so their examples are the
     ones `install.ts` gives those modules for this use case. */
  personal: [
    ...PERSONAL_STEP_PROJECTS.map(([title, project]) => ({ register: 'project_steps', title, field: 'thing', to: 'things', target: project })),
    { register: 'savings_goals', title: 'Rainy day fund', field: 'account', to: 'accounts', target: 'Savings account' },
    ...PERSONAL_LOG_LINKS,
  ],
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
  /* A TEAM'S PLANNED TICKETS POINT AT THE TICKET, one of Work's tasks, and at the example cycle. */
  team: TEAM_PLAN_LINKS,
};

/** The links a use case makes between its examples, by its id (`student`, or `usecase-student`). None for most. */
export const exampleLinks = (usecase: string): readonly ExampleLink[] => LINKS[usecase.replace(/^usecase-/u, '')] ?? [];

/** The field a list's rows are titled by, read off the pack the use case carries or a first-party module it builds on. */
export function titleFieldOf(usecase: string, register: string, carried: readonly Record<string, unknown>[] = []): string | undefined {
  const u = useCase(usecase.replace(/^usecase-/u, ''));
  const declarations = [
    ...carried,
    ...((u?.pack?.declarations ?? []) as Record<string, unknown>[]),
    ...(u?.modules ?? []).flatMap((m) => (firstPartyDocument(m)?.declarations ?? []) as Record<string, unknown>[]),
  ];
  const found = declarations.find((d) => d.register === register && d.page === undefined && typeof d.title === 'string')?.title;
  /* A LIST OF A MODULE THE USE CASE DOES NOT NAME, which a shared file under its own id may still link to. */
  const title = found ?? (FIRST_PARTY as readonly string[]).flatMap((m) => (firstPartyDocument(m)?.declarations ?? []) as Record<string, unknown>[]).find((d) => d.register === register && d.page === undefined)?.title;
  return typeof title === 'string' ? title : undefined;
}

const isExample = (row: LinkRow): boolean => Array.isArray(row.fields.tags) && (row.fields.tags as unknown[]).includes('example');
const empty = (v: unknown): boolean => v === undefined || v === null || v === '';

/**
 * Link a use case's example rows to each other: by the links its file declares, or else the built-in ones for its id.
 * Answers how many links were made; never throws for a refusal.
 */
export async function linkExamples(io: LinkIo, usecase: string, declared?: DeclaredLinks): Promise<number> {
  const links = declared && declared.links.length > 0 ? declared.links : exampleLinks(usecase);
  const carried = declared?.declarations ?? [];
  const read = new Map<string, readonly LinkRow[]>();
  const rowsOf = async (register: string): Promise<readonly LinkRow[]> => {
    if (!read.has(register)) read.set(register, (await io.rows(register).catch(() => null)) ?? []);
    return read.get(register) ?? [];
  };
  const find = async (register: string, title: string): Promise<LinkRow | undefined> => {
    const field = titleFieldOf(usecase, register, carried);
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

/* ── carrying typed progress forward on an update ──────────────────────── */

/** One typed number moved into a list of rows: `from`'s `field` becomes a row of `to` pointing back through `link`. */
export type CarriedMove = { from: string; field: string; to: string; link: string; amount: string; what: string };

/** What a use case moves when a record updates to it from before `before`, by its id. None for most. */
const CARRIED: Readonly<Record<string, { before: string; moves: readonly CarriedMove[] }>> = { personal: PERSONAL_CARRIED };

/** What carrying forward needs: the rows of a list, a row written, and a field emptied. */
export type CarryIo = LinkIo & {
  create: (register: string, fields: Record<string, unknown>) => Promise<boolean>;
  clear: (register: string, seq: number, field: string) => Promise<boolean>;
};

const olderThan = (a: string, b: string): boolean => {
  const parse = (v: string) => /^(\d+)\.(\d+)\.(\d+)/u.exec(v)?.slice(1).map(Number) ?? null;
  const x = parse(a);
  const y = parse(b);
  if (!x || !y) return false;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return (x[i] as number) < (y[i] as number);
  return false;
};

/** A typed amount worth carrying: a number above zero, or money whose amount is. */
const carried = (v: unknown): boolean =>
  (typeof v === 'number' && v > 0) || (typeof v === 'object' && v !== null && typeof (v as { amount?: unknown }).amount === 'number' && (v as { amount: number }).amount > 0);

/**
 * On an update from `fromVersion`, move what the use case's older version kept typed into the rows its newer one reads,
 * one row a goal, dated `today`, then empty the typed number. Answers how many were moved; a refused write is skipped, and
 * a number is only emptied once its row is written.
 */
export async function carryForward(io: CarryIo, usecase: string, fromVersion: string | null, today: string): Promise<number> {
  /* A TEAM FROM BEFORE ITS TICKETS WERE WORK'S TASKS copies each one across (`team.ts` `moveTickets`), and one that copied
     them at 2.0.0 puts its backlog tickets back in the backlog (`backlogAgain`). */
  if (usecase.replace(/^usecase-/u, '') === 'team') {
    if (fromVersion === null) return 0;
    if (olderThan(fromVersion, TICKETS_MOVED_IN)) return moveTickets(io).catch(() => 0);
    return olderThan(fromVersion, BACKLOG_KEPT_IN) ? backlogAgain(io).catch(() => 0) : 0;
  }
  const plan = CARRIED[usecase.replace(/^usecase-/u, '')];
  if (!plan || fromVersion === null || !olderThan(fromVersion, plan.before)) return 0;
  let moved = 0;
  for (const m of plan.moves) {
    for (const row of (await io.rows(m.from).catch(() => null)) ?? []) {
      const value = row.fields[m.field];
      if (row.seq === null || !carried(value)) continue;
      const made = await io.create(m.to, { what: m.what, [m.link]: `${m.from}#${row.seq}`, [m.amount]: value, on: today }).catch(() => false);
      if (!made) continue;
      await io.clear(m.from, row.seq, m.field).catch(() => false);
      moved += 1;
    }
  }
  return moved;
}
