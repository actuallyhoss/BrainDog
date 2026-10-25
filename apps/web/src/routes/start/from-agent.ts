/**
 * The first run from a person's own agent (USE-B12), what `/start?agent=1` decides with no runes: how to plug an agent
 * in, the one line to paste into it, the build that agent proposes once it is filed, and the press that makes it.
 *
 * MODELLED ON POSTHOG'S INSTALL STEP (`docs/19-INTERFACE.md`, "The first run from your own agent"): one line the same
 * for any agent, the build drawn as waiting before it arrives, the line giving way to the build when it does, and
 * asking that stops when the page is left. Where PostHog's agent finishes on its own, this one only proposes: nothing
 * is made until the person presses Make it mine.
 *
 * PURE, SO `node --test` CAN IMPORT IT. `FromAgent.svelte` draws these; the record, the clock and the timers are handed
 * in.
 *
 * THE LINES ARE SETTINGS, AGENTS' OWN. The address and the setup command come from `connectLines`
 * (`lib/record/device.ts`) and the words from the connect sheet's "Any other app" and setup tiles (`lib/agents/connect.ts`),
 * so a change there is a change here. No app is named, and no line carries a key: the agent signs in through the
 * browser, or `braindog setup` starts its own six digits.
 */

import { createClient } from '@braindog/client';
import { moduleName } from '@braindog/seed/usecases/names';

import { approverOf, type Approve } from '../../lib/agents/code-form.ts';
import { connectWords, copyOf, lineOf as lineText, type LineId, type PollHost } from '../../lib/agents/connect.ts';
import { BASE } from '../../lib/at.ts';
import { copy } from '../../lib/copy.ts';
import type { Os } from '../../lib/device.ts';
import { firstRun } from '../../lib/first-run.ts';
import { connectLines as settingsLines, type ConnectLines } from '../../lib/record/device.ts';
import { answer, everyGovernance, type Governor, type Sent } from '../../lib/record/governance.ts';
import type { Approver } from '../../lib/record/keychain.ts';
import type { Place } from '../../lib/start/propose.ts';

type Row = Record<string, unknown>;
type Fetch = typeof fetch;

const isRow = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

/** The page's own words. The ones Settings, Agents already says are its, and are not copied. */
export const words = {
  title: 'Set it up from your own agent',
  headline: 'Your agent asks who you are and proposes a BrainDog. You see it here, and nothing is made until you say so.',
  plugIn: 'Plug in your agent',
  paste: 'Then paste this into it',
  /** THE ONE LINE, word for word as the unit has it (USE-B12). */
  line: 'Set up my BrainDog. Ask me who I am, then propose it.',
  copyLine: 'Copy the line',
  lineCopied: copy.lineCopied,
  build: 'What your agent proposes',
  waiting: "Waiting for your agent's proposal",
  waitingWhy: 'It shows here once your agent sends it. Keep this page open.',
  arrived: 'Your agent proposed this',
  makeIt: firstRun.makeIt,
  makingIt: firstRun.makingIt,
  /** The reason the record keeps beside the decision, which Decide's ledger reads. */
  reason: 'Made it mine on the first run.',
  notMade: 'It was not made',
  byHand: 'Or set it up here instead',
} as const;

/** One line to copy: what it is, the line itself, and what its Copy says. */
export type Line = { id: LineId; label: string; text: string; copy: string };

/** One way to plug in: one sentence on what to do, then its lines. */
export type Way = { hint: string; lines: Line[] };

const lineOf = (id: LineId, lines: ConnectLines, os: Os): Line => ({
  id,
  label: connectWords.step[id],
  text: lineText(id, lines, os),
  copy: copyOf(id),
});

/**
 * How to plug in, for any agent and none by name, from the lines Settings, Agents shows (`connectLines`): the address
 * any app takes where it asks for a server, and the setup command for an agent that runs on the computer.
 */
export function connectLines(settingsAgents: ConnectLines, os: Os = 'unix'): Way[] {
  return [
    { hint: connectWords.otherHint, lines: [lineOf('other', settingsAgents, os)] },
    { hint: connectWords.setupHint, lines: [lineOf('install', settingsAgents, os), lineOf('setup', settingsAgents, os)] },
  ];
}

/**
 * The host and the record a page's API base names: `https://brain.dog/app/mara` is `https://brain.dog` and `mara`, and
 * a base with no record is the host alone. So the setup line names the record, as Settings' does, without this page
 * reading the bare origin itself (`lib/at-sites.test.ts`).
 */
export function hostOf(base: string): { origin: string; slug: string | null } {
  const at = base.indexOf(`${BASE}/`, base.indexOf('//') + 2);
  if (at < 0) return { origin: base.replace(/\/+$/u, ''), slug: null };
  const slug = base.slice(at + BASE.length + 1).split('/')[0] ?? '';
  return { origin: base.slice(0, at), slug: slug === '' ? null : slug };
}

/** The lines for the record a page's API base names. */
export const linesFor = (base: string, os: Os = 'unix'): Way[] => {
  const { origin, slug } = hostOf(base);
  return connectLines(settingsLines(origin, slug), os);
};

/**
 * THE SIX DIGITS `braindog setup` SHOWS ARE APPROVED HERE, as Settings, Agents and Home's sheet approve them
 * (`CodeForm.svelte`): the setup hint says so, and a page that showed the command without the field left the person
 * holding a code with nowhere to type it.
 */
export const approverFor = (base: string, io: { client?: Approver; fetch?: Fetch } = {}): Approve =>
  approverOf(io.client ?? (createClient({ base, ...(io.fetch ? { fetch: io.fetch } : {}) }) as unknown as Approver));

/** The build an agent proposed, as the page draws it: the question it answers, and the places it would make. */
export type Waiting = {
  id: string;
  /** What the agent said it is for, its first reason in its own words, or `null`. */
  why: string | null;
  /** Today first, then each add-on it turns on, by its name (the start page's own `Place`). */
  places: Place[];
};

const today: Place = { kind: 'today', id: 'today', name: 'Today', phrase: null, at: null };

/** The add-ons an arrangement turns on, in the order the record planned them, each once, use cases aside. */
function modulesIn(body: Row): string[] {
  const packs = isRow(body.packs) ? body.packs : {};
  const ids = [packs.install, packs.enable].flatMap((v) => (Array.isArray(v) ? v : [])).filter((v): v is string => typeof v === 'string');
  return [...new Set(ids)].filter((id) => !id.startsWith('usecase-'));
}

/**
 * THE FIRST OPEN ARRANGEMENT among the record's open questions, as `governance` answers them, or `null`: a question
 * with `body_kind` `arrange` (`packages/record/src/arrange.ts`, `waiting`). A question decided or set aside is not open
 * and is passed over; so is any other kind of question, which Decide asks.
 */
export function waitingBuild(questions: readonly unknown[]): Waiting | null {
  for (const q of questions) {
    if (!isRow(q) || q.body_kind !== 'arrange') continue;
    if (q.status !== undefined && q.status !== 'open') continue;
    const id = text(q.id);
    if (id === null) continue;
    const body = isRow(q.body) ? q.body : {};
    const places = modulesIn(body).map((m): Place => ({ kind: 'module', id: m, name: moduleName(m), phrase: null, at: null }));
    /* AN ARRANGEMENT SAYS WHY AS A LIST of one to a few reasons, each a sentence or `{ text, at }` when it cites an
       entry (`packages/kernel/src/govern.ts`): the first is drawn. A lone sentence is read too. */
    const reasons = Array.isArray(body.why) ? body.why : [body.why];
    const first = reasons.map((r) => text(isRow(r) ? r.text : r)).find((r) => r !== null) ?? null;
    return { id, why: first, places: [today, ...places] };
  }
  return null;
}

/** The client a read or a press goes through: the page's own, else one made over `base`. */
export type Io = { client?: Pick<Governor, 'governance' | 'call'>; fetch?: Fetch };

const clientFor = (base: string, io: Io): Pick<Governor, 'governance' | 'call'> =>
  io.client ?? (createClient({ base, ...(io.fetch ? { fetch: io.fetch } : {}) }) as unknown as Governor);

/** Ask the record once: the build waiting, `null` for none, or `undefined` when it did not answer. */
export async function askBuild(base: string, io: Io = {}): Promise<Waiting | null | undefined> {
  const got = await everyGovernance(clientFor(base, io), { status: 'open' }).catch(() => null);
  return got?.ok ? waitingBuild(got.value) : undefined;
}

/**
 * MAKE IT MINE: the arrangement accepted, as Decide accepts one (`decide`, option accept, with the reason the record
 * requires). The start page's own press (`accept.ts`) writes the page's proposal through `setup`; an agent's proposal is
 * already a question on the record, so its press is the answer to that question, and the record applies it.
 */
export const makeItMine = (base: string, id: string, io: Io = {}): Promise<Sent> =>
  answer(clientFor(base, io) as Governor, id, 'accept', words.reason).catch(() => ({ ok: false as const, fix: copy.recordNotReached }));

/** Never asked faster than this: the build is watched for, and five seconds is what the unit allows (USE-B12). */
export const ASK_EVERY = 5_000;

/**
 * Ask every `ASK_EVERY` while the tab is shown: once at once, then on the interval; stopped while the tab is hidden and
 * started again, with an ask at once, when it is shown. What it answers stops it for good, which the page calls when it
 * is left.
 */
export function watch(tick: () => void, host: PollHost = globalThis as unknown as PollHost, every: number = ASK_EVERY): () => void {
  const gap = Math.max(every, ASK_EVERY);
  const doc = host.document;
  let timer: unknown = null;
  const halt = (): void => {
    if (timer !== null) host.clearInterval(timer);
    timer = null;
  };
  const start = (): void => {
    if (timer !== null || doc?.visibilityState === 'hidden') return;
    tick();
    timer = host.setInterval(tick, gap);
  };
  const seen = (): void => (doc?.visibilityState === 'hidden' ? halt() : start());
  doc?.addEventListener('visibilitychange', seen);
  start();
  return () => {
    halt();
    doc?.removeEventListener('visibilitychange', seen);
  };
}
