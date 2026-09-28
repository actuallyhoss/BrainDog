/**
 * The automations hub (`loop/finish/shell.md` EDT-3): one place for everything that runs by itself, as five tabs.
 *
 * FIVE KINDS OF THING RAN ON THEIR OWN AND EACH HAD ITS OWN CORNER. Automations were on `/automations`, scheduled
 * actions only under a project's "Runs on", scripts on `/scripts`, and doors inside Settings, Ingest, so "what does this
 * record do by itself" had four answers and nowhere that listed a run of each. The hub is the one address; each tab
 * draws its kind in the words that kind's own screen uses, and Runs lists every run newest first.
 *
 * THE TAB IS IN THE ADDRESS, as `?tab=`, and Runs has its own path because it is the one tab worth linking to by itself.
 * The new-action sheet opens from the address too (`contracts.md` X57), so a declared page links to a sheet already
 * filled in and the hub is the only reader of `?new=`.
 *
 * PURE, so it loads in plain Node: the clock is an argument and every import is a type but `since`.
 */

import { since } from 'braindog-render';

import type { AutomationRow, RunRow } from '../../lib/flow/source.ts';
import type { ActionRow } from '../../lib/record/actions.ts';
import type { Script } from '../../lib/record/scripts.ts';

export type Tab = 'automations' | 'scheduled' | 'scripts' | 'doors' | 'runs';

/** The tabs in the order they are drawn, each with the address that opens it. */
export const TABS: readonly { id: Tab; path: string }[] = [
  { id: 'automations', path: '/automations' },
  { id: 'scheduled', path: '/automations?tab=scheduled' },
  { id: 'scripts', path: '/automations?tab=scripts' },
  { id: 'doors', path: '/automations?tab=doors' },
  { id: 'runs', path: '/automations/runs' },
];

/** What `?new=` asks for: the door sheet, or the scheduled-action sheet with a preset, or nothing. */
export type NewAsk = { kind: 'door' | 'action'; preset: string | null } | null;

export function newOf(params: URLSearchParams): NewAsk {
  const kind = params.get('new');
  /* A DOOR TAKES A PRESET TOO (MOD-18): the founder Home's "Send numbers from a project" links to `?new=door&preset=numbers`
     so the sheet opens already writing to `datapoints`, as a scheduled action's preset already does. */
  if (kind === 'door' || kind === 'action') return { kind, preset: params.get('preset') || null };
  return null;
}

/**
 * The tab the address names. A sheet asked for without a tab opens over the tab its kind lives on, so closing it leaves
 * the person looking at the list the new thing joins rather than at automations.
 */
export function tabOf(params: URLSearchParams): Exclude<Tab, 'runs'> {
  const tab = params.get('tab');
  if (tab === 'scheduled' || tab === 'scripts' || tab === 'doors') return tab;
  const ask = newOf(params);
  if (ask?.kind === 'door') return 'doors';
  if (ask?.kind === 'action') return 'scheduled';
  return 'automations';
}

/** The address with the sheet's two keys taken off, for closing it without leaving the tab it opened over. */
export function withoutNew(url: URL): string {
  const params = new URLSearchParams(url.search);
  params.delete('new');
  params.delete('preset');
  const query = params.toString();
  return `/automations${query ? `?${query}` : ''}`;
}

export const hubWords = {
  tabs: 'Kinds of thing that run by themselves',
  tab: { automations: 'Automations', scheduled: 'Scheduled', scripts: 'Scripts', doors: 'Doors', runs: 'Runs' } as Record<Tab, string>,
  /* THE KIND A RUN BELONGS TO, said after its name on the Runs tab, where the three are mixed. */
  kind: { automation: 'Automation', scheduled: 'Scheduled action', script: 'Script' } as Record<RunKind, string>,
  newAction: 'New scheduled action',
  newScript: 'New script',
  /* AN EMPTY TAB SAYS WHAT THE THING IS AND WHAT TO ASK AN AGENT, as the automations list always has (DIRECTION §22).
     The prompts are examples a person reads and replaces, not features the code ships. */
  scheduledNone: 'No scheduled actions yet',
  scheduledWhy: 'A scheduled action fetches from, calls or watches a web address on a clock, and writes what it gets to a list.',
  scheduledPrompt: 'read my record, then propose a scheduled action that fetches a figure from api.example.com every hour and writes it to a list',
  scheduledAbsent: 'This record does not list its scheduled actions yet',
  scheduledAbsentHow: 'Updating the host brings the list. You can still make one here and send it to Decide.',
  scriptsPrompt: 'read my record, then write a script that runs every morning, reads one of my lists and writes a one-line summary to another, and propose it',
  scriptsMore: 'Logs, versions and what each script may read, write and fetch are on the scripts screen.',
  scriptsOpen: 'Open the scripts screen',
  runsNone: 'Nothing has run yet',
  runsWhy: 'Every run of an automation, a scheduled action or a script is listed here, newest first, with what it said.',
  runsPrompt: 'read my record, then propose an automation that runs every morning and tells me what changed yesterday',
  /* THE LIST IS WHAT EACH THING KEEPS TO HAND, and says so, so a quiet list is not read as a quiet record. */
  runsReach: 'The newest runs each automation and script keeps, and the last run of each scheduled action. Open one to see all of its runs.',
  runsSomeMissing: 'Some runs could not be read just now, so the list below may be missing a few.',
  /* ONE SENTENCE PER WAY A RUN ENDS, the time inside it, so a failed run and a finished one read alike but for the word. */
  ended: {
    done: (when: string) => `Ran ${when}.`,
    ok: (when: string) => `Ran ${when}.`,
    changed: (when: string) => `Ran ${when}, and something changed.`,
    unchanged: (when: string) => `Ran ${when}, and nothing had changed.`,
    failed: (when: string) => `Failed ${when}.`,
    refused: (when: string) => `Refused ${when}.`,
    cancelled: (when: string) => `Stopped ${when}.`,
    dropped: (when: string) => `Dropped ${when}.`,
    held: (when: string) => `Held ${when} by this month's limit.`,
    paused: (when: string) => `Paused ${when}.`,
    running: (when: string) => `Started ${when}, still running.`,
    waiting: (when: string) => `Started ${when}, waiting on a step.`,
    pending: (when: string) => `Queued ${when}.`,
  } as Record<string, (when: string) => string>,
} as const;

/**
 * One row on any tab: a name and what it is on the first line, where it stands on the second.
 *
 * THE SECOND LINE IS NEVER CUT. It is the verdict ("Paused. The key is not in the vault.") and an ellipsis took exactly
 * the part that said what to do, so it wraps; the first line gives way instead, what-it-is before the name.
 */
export type HubRow = {
  key: string;
  name: string;
  what: string;
  said: string;
  /** The one state worth a dot: failed or refused, needing a look, or turned off. The sentence always says it too. */
  dot: 'bad' | 'warn' | 'off' | null;
  /** Where the row opens, or `null` for a row with no screen of its own. */
  path: string | null;
  /** A link under the row that does what its sentence asks, like adding a missing key. */
  fix?: { path: string; label: string } | undefined;
};

export type RunKind = 'automation' | 'scheduled' | 'script';

/** One run on the Runs tab: whose it was, when, the sentence it ended with, and where its owner's screen is. */
export type RunLine = {
  key: string;
  kind: RunKind;
  name: string;
  at: string;
  said: string;
  /** Whether it failed or was refused, which is the only thing the row marks. */
  bad: boolean;
  /** The screen of the thing that ran, or `null` for a scheduled action, which has none of its own. */
  path: string | null;
};

const BAD = new Set(['failed', 'refused']);

/** A run's ending and its own sentence after it, when it said one. */
function saidOf(outcome: string, at: string, say: string | null, now: number): string {
  const when = since(at, now);
  const ended = Object.hasOwn(hubWords.ended, outcome) ? hubWords.ended[outcome] : undefined;
  const line = (ended ?? hubWords.ended.done!)(when);
  return say ? `${line} ${say}` : line;
}

/**
 * Every run the three reads reached, newest first.
 *
 * AN AUTOMATION'S RUNS COME FROM ITS OWN READ, since the list carries only its last, so `runs` is keyed by rule and a
 * rule the hub did not ask about is represented by its last run alone. A scheduled action's ledger keeps no run list,
 * so it is its last run. A script's are the newest its screen found in recent history.
 */
export function runLines(
  automations: readonly AutomationRow[],
  runs: ReadonlyMap<string, readonly RunRow[]>,
  actions: readonly ActionRow[],
  scripts: readonly Script[],
  now: number,
): RunLine[] {
  const out: RunLine[] = [];
  for (const a of automations) {
    const path = `/automations/${encodeURIComponent(a.id)}`;
    const own = runs.get(a.id);
    if (own && own.length > 0) {
      for (const r of own) {
        out.push({ key: `a:${r.id}`, kind: 'automation', name: a.name, at: r.started, said: saidOf(r.state, r.finished ?? r.started, r.say, now), bad: BAD.has(r.state), path });
      }
    } else if (a.last) {
      out.push({ key: `a:${a.id}:last`, kind: 'automation', name: a.name, at: a.last.at, said: saidOf(a.last.state, a.last.at, a.last.say, now), bad: BAD.has(a.last.state), path });
    }
  }
  for (const s of actions) {
    if (!s.last) continue;
    out.push({ key: `s:${s.ingest}`, kind: 'scheduled', name: s.ingest, at: s.last.at, said: saidOf(s.last.outcome, s.last.at, s.last.note || null, now), bad: BAD.has(s.last.outcome), path: null });
  }
  for (const s of scripts) {
    const path = `/scripts/${encodeURIComponent(s.script)}`;
    for (const r of s.recent) {
      out.push({ key: `c:${r.id}`, kind: 'script', name: s.title, at: r.at, said: saidOf(r.outcome, r.at, r.say || null, now), bad: BAD.has(r.outcome), path });
    }
  }
  return out.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}
