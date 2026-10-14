/**
 * SLASH'S REACH: TOOLS AND SKILLS, AND TONE (ENG-B20 job 1, `loop/scope/area-engine-b.md`).
 *
 * His words: "spark basically organizes and designs the tone of your braindog to fit your exact product." and "the
 * pages you see, the extensions, the pages, the tools, everything." The one recommender (`design-agent.ts`) weighs the
 * navigation, pages, blocks and icons. This file is two more sources for the same queue.
 *
 * A SKILL IS OFFERED ONLY WITH STEPS. The counting rules offer a skill whose body says its steps are not written yet,
 * so what is offered is a name (`slash.ts`). Here a skill is drafted from the handoffs of three or more runs in one
 * project that did the same thing, and every step quotes the handoff it came from, word for word, with the run that
 * wrote it. A step with nothing to quote is not a step.
 *
 * A TONE DRAFT IS KEPT ONLY IN HIS OWN WORDS. The model may answer labels and voice lines; `toneKept` keeps a label only
 * when every word of it is a word of his own titles and first lines, and a voice line only when it holds no digit.
 *
 * IT IS PURE. It files nothing, asks no model, opens no table and does not know the day: the caller hands the runs, the
 * skills, the draft and `nowMs`. Nothing here names an add-on, a use case or anybody's list.
 */

import { LAPSE_DAYS, queueOf } from './design-agent.ts';
import type { Held, Offer, OfferChange, Queue } from './design-agent.ts';

/** A skill drafted from what runs did: its name, the project it is for, and each step with the handoff words it rests on. */
export type SkillChange = {
  kind: 'skill';
  name: string;
  project: string | null;
  /** `text` is the step as a run wrote it, `quote` the sentence of the handoff that says it, `from` that run's name. */
  steps: { text: string; quote: string; from: string }[];
};

/** `design-agent.ts`'s `Offer`, with one more kind of change. */
export type ReachOffer = Omit<Offer, 'change'> & { change: OfferChange | SkillChange };

/** A run as the caller reads it: its spoken name, its project, and its handoff as written. */
export type ReachRun = { spoken: string; project: string | null; handoff: string };
/** A live skill: one not retired. The caller hands only those. */
export type ReachSkill = { name: string; project: string | null; body: string };

/** The runs that must have done the same thing before a skill is offered (the scope: "at least three runs"). */
export const SKILL_RUNS = 3;
/** The commands or files those runs must share. */
export const SKILL_STEPS = 3;
/** The fewest quoted steps a skill is offered with: one step is a note, not a skill. */
export const SKILL_STEPS_KEPT = 2;
/** The longest quote shown. A longer sentence is a paragraph, and is not quoted. */
export const QUOTE_MOST = 240;
/** The runs of one project read at once, the last ones handed. Three runs at a time are weighed, so this bounds the work. */
const RUNS_READ = 60;
/**
 * A skill ranks under the blocks a list has earned on a page and over a column (`design-agent.ts`'s tiers: block 3000,
 * column 2000). A skill shapes how agents work here, which a column on one table does not.
 */
const SKILL_TIER = 2500;

const DAY_MS = 86_400_000;
const dayOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const count = (n: number): string => n.toLocaleString('en');
const within = (strength: number): number => Math.max(0, Math.min(499, Math.floor(strength)));

/* ── what a handoff names ───────────────────────────────────────────────────────────────────────────────────────── */

/** A step folded for matching: lower case, one space, no prompt, no closing punctuation. */
export const foldStep = (s: string): string =>
  s
    .normalize('NFKC')
    .trim()
    .replace(/^\$\s+/u, '')
    .replace(/\s+/gu, ' ')
    .replace(/[.,;:]+$/u, '')
    .toLowerCase();

/**
 * Whether a span reads as a command or a file: it has arguments, a path or an extension. A bare word in backticks
 * (`Offer`, `null`) is a name in passing, and three runs saying it did not do anything the same.
 */
const isCommandOrFile = (s: string): boolean => /\s/u.test(s) || /\S\/\S/u.test(s) || /\.[\p{L}]{1,6}$/u.test(s);

/** A line that starts with a command: a prompt, or a lower-case program followed by a flag, a path or a file. */
const startsWithCommand = (line: string): boolean => {
  if (/^\$\s+\S/u.test(line)) return true;
  if (!/^[a-z][a-z0-9._-]*\s+\S/u.test(line) || /[.!?]$/u.test(line)) return false;
  return /\s--?[a-z]/u.test(line) || /\S\/\S/u.test(line) || /\.[a-z]{1,6}(\s|$)/u.test(line);
};

/**
 * What reads as a key or an id: a run of 24 or more letters, digits, `_` or `-` holding both a letter and a digit. A
 * quote holding one is never shown, so a key a run pasted is not carried into a skill, and nobody reads a ULID.
 */
const holdsKeyOrId = (s: string): boolean => (s.match(/[A-Za-z0-9_-]{24,}/gu) ?? []).some((t) => /\d/u.test(t) && /[A-Za-z]/u.test(t));

const LIST_MARK = /^(?:[-*•]|\d+[.)])\s+/u;

type Named = { fold: string; text: string; line: string; at: number };

/** The commands and files one handoff names, each once, in the order it names them, with the line that says it. */
export function namedSteps(handoff: string): Named[] {
  const out = new Map<string, Named>();
  let at = 0;
  const add = (text: string, line: string): void => {
    const clean = text.trim().replace(/^\$\s+/u, '');
    const fold = foldStep(clean);
    if (fold.length < 2 || fold.length > 160 || !/\p{L}/u.test(fold) || out.has(fold)) return;
    out.set(fold, { fold, text: clean, line, at: at++ });
  };
  for (const raw of handoff.split(/\r?\n/u)) {
    const line = raw.trim().replace(LIST_MARK, '');
    if (line === '') continue;
    const spans = [...line.matchAll(/`([^`\n]+)`/gu)].map((m) => m[1]!);
    for (const s of spans) if (isCommandOrFile(s.trim())) add(s, line);
    if (spans.length === 0 && startsWithCommand(line)) add(line, line);
  }
  return [...out.values()];
}

/**
 * The sentence of `line` that says `text`, as written, or `null` when there is none fit to show: longer than
 * `QUOTE_MOST`, or holding what reads as a key or an id.
 */
export function quoteOf(line: string, text: string): string | null {
  const sentences = line.split(/(?<=[.!?])\s+(?=[\p{Lu}`"(])/u);
  const want = foldStep(text);
  const said = sentences.find((s) => foldStep(s).includes(want)) ?? line;
  const quote = said.trim();
  if (quote === '' || quote.length > QUOTE_MOST || holdsKeyOrId(quote)) return null;
  return quote;
}

/* ── a skill from what runs did ─────────────────────────────────────────────────────────────────────────────────── */

/** A short fingerprint of a skill's steps, so its key is the same across readings and two skills' keys differ. */
const fingerprint = (s: string): string => {
  let h = 0x811c9dc5;
  for (const c of s) h = Math.imul(h ^ c.codePointAt(0)!, 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
};

/** The words a step's text is cut to for a skill's name. */
const headOf = (text: string): string => (text.length <= 48 ? text : `${text.slice(0, 48).replace(/\s+\S*$/u, '')}...`);

type Read = { run: ReachRun; named: Map<string, Named> };

/**
 * The skills the runs earn, strongest first. THREE OR MORE RUNS IN ONE PROJECT whose handoffs name the same three or
 * more commands or files (backticked spans, and lines that start with a command, folded), none of which a live skill
 * of that project or of every project already says, make one offer. Each step quotes the handoff it came from, and is
 * dropped when no run of them says it in a sentence fit to show; with fewer than `SKILL_STEPS_KEPT` left, no offer.
 *
 * THE STEPS ARE THE MOST RUNS AGREE ON. Every three runs are weighed (the last `RUNS_READ` of a project), what they all
 * name is a candidate, and a candidate grows to all that its runs share. The one with the most runs is offered first,
 * and a candidate that shares a step with one offered in its project is not offered beside it.
 *
 * THE KEY IS THE STEPS, THE BASIS IS HOW MANY RUNS DID THEM. A fourth run that does them moves the basis, so an offer
 * turned down at three comes back at four (`design-agent.ts` `basisMoved`: a basis with no measure moves when it is
 * another).
 */
export function skillOffers(runs: readonly ReachRun[], skills: readonly ReachSkill[], nowMs: number): ReachOffer[] {
  const lapses = dayOf(nowMs + LAPSE_DAYS * DAY_MS);
  const projectOf = (p: string | null): string | null => (typeof p === 'string' && p.trim() !== '' ? p.trim() : null);
  const groups = new Map<string, { project: string | null; runs: ReachRun[] }>();
  for (const run of runs) {
    const project = projectOf(run.project);
    const at = project === null ? '' : `:${project}`;
    const g = groups.get(at) ?? { project, runs: [] };
    g.runs.push(run);
    groups.set(at, g);
  }

  const out: ReachOffer[] = [];
  for (const { project, runs: all } of groups.values()) {
    /* WHAT A LIVE SKILL HERE ALREADY SAYS is not a step to offer again: one of this project, or one for every project. */
    const said = skills.filter((s) => projectOf(s.project) === null || projectOf(s.project) === project).map((s) => foldStep(s.body));
    const isSaid = (fold: string): boolean => said.some((body) => body.includes(fold));
    const read: Read[] = all
      .slice(-RUNS_READ)
      .map((run) => ({ run, named: new Map(namedSteps(run.handoff).filter((n) => !isSaid(n.fold)).map((n) => [n.fold, n])) }))
      .filter((r) => r.named.size >= SKILL_STEPS);
    if (read.length < SKILL_RUNS) continue;

    /* EVERY THREE RUNS, and what all three name. */
    const candidates = new Map<string, string[]>();
    for (let i = 0; i < read.length; i++)
      for (let j = i + 1; j < read.length; j++) {
        const pair = [...read[i]!.named.keys()].filter((f) => read[j]!.named.has(f));
        if (pair.length < SKILL_STEPS) continue;
        for (let k = j + 1; k < read.length; k++) {
          const three = pair.filter((f) => read[k]!.named.has(f)).sort();
          if (three.length >= SKILL_STEPS) candidates.set(three.join('\n'), three);
        }
      }

    /* EACH GROWS TO ALL ITS RUNS SHARE, so the same runs make one candidate and not one for every three of them. */
    const grown = new Map<string, { steps: string[]; by: Read[] }>();
    for (const steps of candidates.values()) {
      const by = read.filter((r) => steps.every((f) => r.named.has(f)));
      const shared = [...by[0]!.named.keys()].filter((f) => by.every((r) => r.named.has(f))).sort();
      grown.set(shared.join('\n'), { steps: shared, by });
    }
    const ranked = [...grown.entries()].sort(([ka, a], [kb, b]) => b.by.length - a.by.length || b.steps.length - a.steps.length || (ka < kb ? -1 : ka > kb ? 1 : 0));

    const taken = new Set<string>();
    for (const [signature, { steps, by }] of ranked) {
      if (steps.some((f) => taken.has(f))) continue;
      /* IN THE ORDER THE FIRST OF THEM DID THEM, each quoted from the first run that says it fit to show. */
      const first = by[0]!.named;
      const quoted: SkillChange['steps'] = [];
      for (const f of [...steps].sort((a, b) => first.get(a)!.at - first.get(b)!.at))
        for (const r of by) {
          const n = r.named.get(f)!;
          const quote = holdsKeyOrId(n.text) ? null : quoteOf(n.line, n.text);
          if (quote === null) continue;
          quoted.push({ text: n.text, quote, from: r.run.spoken });
          break;
        }
      if (quoted.length < SKILL_STEPS_KEPT) continue;
      for (const f of steps) taken.add(f);
      const head = headOf(quoted[0]!.text);
      const name = project === null ? head : `${project}: ${head}`;
      out.push({
        key: `skill:${project ?? ''}:${fingerprint(signature)}`,
        class: 'arrange',
        rank: SKILL_TIER + within(by.length * steps.length),
        basis: `runs-${by.length}`,
        lapses,
        title: project === null ? 'A skill for agents' : `A skill for agents in ${project}`,
        why: project === null ? `${count(by.length)} runs did these steps.` : `${count(by.length)} runs in ${project} did these steps.`,
        change: { kind: 'skill', name, project, steps: quoted },
      });
    }
  }
  /* A STABLE SORT, so the same runs answer the same offers in the same order. */
  return out.sort((a, b) => b.rank - a.rank);
}

/* ── tone in his own words ──────────────────────────────────────────────────────────────────────────────────────── */

/** The words of a text, folded: lower case, split at anything not a letter, a digit or an apostrophe inside a word. */
const wordsOf = (s: string): string[] =>
  s
    .normalize('NFKC')
    .toLowerCase()
    .split(/[^\p{L}\p{N}'’]+/u)
    .map((w) => w.replace(/^['’]+|['’]+$/gu, ''))
    .filter((w) => w !== '');

/**
 * What of a tone draft is kept. `own` is his own titles and first lines, as the caller read them. A LABEL IS KEPT ONLY
 * WHEN EVERY WORD OF IT IS ONE OF HIS, folded, so a label never says a word he did not; a VOICE LINE ONLY WHEN IT HOLDS
 * NO DIGIT, so it never states a count it cannot keep true. `dropped` is each label and line left out, as proposed,
 * for the caller to say what was left out. A draft is the model's answer, so a value that is not text is dropped too.
 */
export function toneKept(draft: { labels?: Record<string, string>; voice?: string[] }, own: readonly string[]): { labels: Record<string, string>; voice: string[]; dropped: string[] } {
  const his = new Set(own.flatMap(wordsOf));
  const kept: [string, string][] = [];
  const voice: string[] = [];
  const dropped: string[] = [];
  const labels: unknown = draft.labels;
  if (labels !== null && typeof labels === 'object')
    for (const [key, value] of Object.entries(labels)) {
      const text = typeof value === 'string' ? value.trim() : '';
      const words = wordsOf(text);
      if (words.length > 0 && words.every((w) => his.has(w))) kept.push([key, text]);
      else dropped.push(String(value));
    }
  for (const line of Array.isArray(draft.voice) ? (draft.voice as unknown[]) : []) {
    const text = typeof line === 'string' ? line.trim() : '';
    if (text !== '' && !/\p{Nd}/u.test(text)) voice.push(text);
    else dropped.push(String(line));
  }
  /* `fromEntries`, so a label keyed `__proto__` is a label and not the object's prototype. */
  return { labels: Object.fromEntries(kept), voice, dropped };
}

/* ── the one queue ──────────────────────────────────────────────────────────────────────────────────────────────── */

export type ReachQueue = Omit<Queue, 'waiting' | 'fresh'> & { waiting: (ReachOffer | Held)[]; fresh: ReachOffer[] };

/**
 * `design-agent.ts`'s `queueOf` for offers that may be a skill: the same gate, the same cap of three and the same day it
 * lapses. `queueOf` reads only what an offer holds in the queue (key, class, rank, basis, lapses) and hands back the
 * offers it was given, so a skill offer goes through it whole and comes back as it went in.
 */
export function reachQueue(offers: readonly ReachOffer[], open: readonly Held[], dismissed: readonly Pick<Held, 'key' | 'basis'>[], nowMs: number): ReachQueue {
  return queueOf(offers as readonly Offer[], open, dismissed, nowMs) as ReachQueue;
}
