/**
 * The jobs for one project, under a section that says `panel: job` on the project's page: the last three runs that
 * name it, where each stands in words, and one line to type what to do with a Start beside it.
 *
 * THE JOBS SCREEN'S READERS, NOT A COPY OF THEM. The runs come in the record's order and are put in the order Jobs puts
 * them (`ordered`: the live ones on top, then newest first), the kinds are the ones "Run a job" offers
 * (`readHeldKinds`), and a run's state is the word Jobs says for it (`statusOf`), save one: a run a machine has taken
 * reads "Working" here, since the page says what is being done to the project rather than naming the queue's state.
 *
 * A RUN IS FOR THE PROJECT WHEN ITS `about` NAMES IT, by the project's spoken id, which `createJob` checks is a row of
 * this record. A run started here says it (`startForProject`), so this page and Jobs show the same run.
 *
 * NOTHING STARTS BY ITSELF. `startForProject` is called from the panel's Start and from nowhere else. While no machine
 * is listening the panel says the line Jobs says and offers no Start, so nothing waits a day unseen.
 *
 * PURE, apart from the one call at the foot, which takes its client as an argument, so `node --test` reads it whole.
 */

import { isLive, ordered, runName, statusOf, toolName, words as jobWords, type Answer, type JobKind, type JobRow, type JobStatus, type Step, type Tone } from '../../record/jobs.ts';
import { PAGE_ARG } from '../../record/page-jobs.ts';

/** How many of the project's runs the panel shows. */
export const SHOWN = 3;
/** The most characters a running job's newest line is said in, so a long thought stays one line on a phone. */
export const LINE_MOST = 140;

export const panelWords = {
  working: 'Working',
  none: (title: string) => `No jobs have run for ${title} yet`,
  whatHint: 'Add a line to the readme',
  which: 'Which job',
  start: 'Start',
  open: 'Open',
  started: (title: string) => `${title} is waiting for your computer to pick it up.`,
  unreached: 'BrainDog could not be reached. Try again in a moment.',
  conflict: 'Something changed while this was asked. Try again.',
} as const;

/** The project the page is drawn for: its spoken id, which a run's `about` names, and its title. */
export type ForProject = { spoken: string; title: string };

/** One run as the panel draws it. `id` is the handle its Open goes to, never shown. */
export type PanelJob = { id: string; title: string; state: string; tone: Tone; live: boolean };

export type JobPanel = {
  jobs: PanelJob[];
  /** Said when the project has no runs yet. */
  none: string | null;
  /** The kinds Start may be pressed for, by their titles. */
  kinds: JobKind[];
  /** Whether Start is drawn at all. */
  canStart: boolean;
  /** The one line said in Start's place: nobody listening, or no kind approved. */
  line: string | null;
};

/** Where one run stands, as the panel says it. */
export function stateOf(row: { status: JobStatus; lost: boolean; cancel: boolean }): { word: string; tone: Tone } {
  if (row.status === 'claimed' && !row.lost && !row.cancel) return { word: panelWords.working, tone: 'info' };
  return statusOf(row.status, row.lost, row.cancel);
}

/**
 * The kinds a person may start from one typed line: those that take no argument or one, which the line fills.
 *
 * A KIND THAT TAKES A PAGE IS SLASH'S (`page-jobs.ts`), offered where a page is composed, so it is left out here, as is
 * one that takes two or more things one line cannot say.
 */
export function lineKinds(kinds: readonly JobKind[]): JobKind[] {
  return kinds.filter((k) => k.args.length === 0 || (k.args.length === 1 && k.args[0]?.id !== PAGE_ARG));
}

/**
 * The panel for one project: its last three runs in Jobs' order, the kinds Start offers, and the line said instead.
 *
 * `listening` IS WHETHER ANY MACHINE WILL TAKE A JOB NOW, or `null` when that is not known (the reader may not list the
 * machines, or the host is older than the read). Unknown says nothing and leaves Start to the record, which refuses a
 * caller who may not start a job in its own sentence; known to be nobody, Start is not drawn.
 */
export function jobPanel(rows: readonly JobRow[], kinds: readonly JobKind[], listening: boolean | null, project: ForProject): JobPanel {
  const jobs = ordered(rows, null)
    .filter((r) => r.about === project.spoken)
    .slice(0, SHOWN)
    .map((r) => {
      const said = stateOf(r);
      return { id: r.id, title: runName(r), state: said.word, tone: said.tone, live: isLive(r.status) };
    });
  const offered = lineKinds(kinds);
  const line = listening === false ? jobWords.nobodyListening : offered.length === 0 ? jobWords.noKinds : null;
  return { jobs, none: jobs.length === 0 ? panelWords.none(project.title) : null, kinds: offered, canStart: line === null, line };
}

/** The values one typed line starts a kind with: the line, trimmed and cut to the kind's own most, in its one argument. */
export function argsOf(kind: JobKind, typed: string): Record<string, string> {
  const arg = kind.args[0];
  return arg === undefined ? {} : { [arg.id]: typed.trim().slice(0, arg.max) };
}

/** Whether Start may be pressed: a kind chosen, and the line typed when the kind takes one. */
export const ready = (kind: JobKind | null, typed: string): boolean => kind !== null && (kind.args.length === 0 || typed.trim() !== '');

/**
 * A running job's newest line, from the steps its transcript holds: the last thing it said, or the tool it last called,
 * cut to one line. `null` before a machine has said anything.
 */
export function newestLine(steps: readonly Step[]): string | null {
  for (let n = steps.length - 1; n >= 0; n -= 1) {
    const step = steps[n];
    if (!step) continue;
    const said = (step.tool ? toolName(step.tool.name) : step.text).replace(/\s+/gu, ' ').trim();
    if (said === '') continue;
    return said.length > LINE_MOST ? `${said.slice(0, LINE_MOST - 1).trimEnd()}…` : said;
  }
  return null;
}

/* ── the one call ───────────────────────────────────────────────────────── */

/** The client method Start calls, apart from the client so a test hands in its own. */
export type JobPanelClient = {
  createJob(args: { kind: string; args?: Record<string, unknown>; about?: string }): Promise<Answer<{ id: string }>>;
};

/**
 * Start one run of a kind for the project: its id, or the record's own sentence when it refuses.
 *
 * THE PRESS, AND ONLY THAT. `about` names the project, so the run is this page's and Jobs' at once. `startJob` in
 * `jobs.ts` sends no `about` yet, so the client's own `createJob` is called here until it does.
 */
export async function startForProject(client: JobPanelClient, kind: JobKind, typed: string, project: ForProject): Promise<{ ok: true; id: string } | { ok: false; fix: string }> {
  try {
    const got = await client.createJob({ kind: kind.id, args: argsOf(kind, typed), about: project.spoken });
    if (got.ok) return { ok: true, id: got.value.id };
    return { ok: false, fix: 'refusal' in got ? got.refusal.fix : panelWords.conflict };
  } catch {
    return { ok: false, fix: panelWords.unreached };
  }
}
