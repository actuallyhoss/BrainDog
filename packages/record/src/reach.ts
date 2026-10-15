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
 * AN ADD-ON IS OFFERED FOR WHAT THE RECORD ALREADY HOLDS. The catalogue says, as data, what each add-on's automations
 * write and how often (a script's `writes` and `runs.every`, a poll's `writes.register` and `every`), and which arrivals
 * its doors read. `addonOffers` offers one the record lacks when it holds the thing that add-on keeps current: figures
 * that read a list gone stale, arrivals of a shape it reads, or a list it writes that nothing installed fills. One
 * sentence, with the count and the day it rests on, the add-on by the catalogue's own title.
 *
 * IT IS PURE. It files nothing, asks no model, opens no table and does not know the day: the caller hands the runs, the
 * skills, the draft, the catalogue and `nowMs`. Nothing here names an add-on, a use case or anybody's list: every word
 * an offer says comes from a catalogue entry or the record.
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

/**
 * An add-on to install, by its catalogue id. `design-agent.ts` files no install, so this is the kind: the caller files
 * it as `slash.ts` files every install, `body_kind: 'pack'` with `{ install: pack }`, and the install asks the same
 * approval it always asks, its origins and its key on Decide, before anything of it calls out.
 */
export type AddonChange = { kind: 'install'; pack: string };

/** `design-agent.ts`'s `Offer`, with two more kinds of change. */
export type ReachOffer = Omit<Offer, 'change'> & { change: OfferChange | SkillChange | AddonChange };

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

/* ── an add-on for what the record holds ────────────────────────────────────────────────────────────────────────── */

/** A list an add-on's automations write, and how often they run, in milliseconds, or `null` when it says no clock. */
export type ReachKeeps = { list: string; everyMs: number | null };

/**
 * One catalogue entry as the add-on source reads it: its id and title as the catalogue lists them, the lists it keeps
 * current, the arrival shapes its doors read (`channel:address` as the kernel's `shapeOf` names a shape, or
 * `channel:@domain` for every sender at that domain), and whether any of it sends a key the owner holds.
 */
export type ReachCatalogueEntry = { id: string; title: string; keeps: readonly ReachKeeps[]; shapes: readonly string[]; needsKey: boolean };

/** What the record holds, as the caller reads it for `addonOffers`. */
export type AddonSignals = {
  catalogue: readonly ReachCatalogueEntry[];
  /** Every add-on installed, on or off: one installed is never offered again. */
  installed: readonly string[];
  /** Each list: its handle, the role it plays when it plays one, its name as shown, its newest entry's day and how many it holds. */
  lists: readonly { list: string; role?: string | undefined; name?: string | undefined; newest: string | null; rows: number }[];
  /** Each figure installed: the list it reads, and the day of the oldest input it rests on, when that is known. */
  figures: readonly { id: string; reads: string; oldest: string | null }[];
  /** What waits at a door with no pattern, by shape, and the day the first of them came when the caller knows it. */
  arrivals: readonly { shape: string; waiting: number; since?: string | null | undefined }[];
};

/** An add-on ranks under a page and over the blocks a list has earned (`design-agent.ts` tiers: page 4000, block 3000). */
const ADDON_TIER = 3500;
/** Within the tier: figures that rest on stale input first, then what waits at a door, then a list nothing fills. */
const ADDON_WITHIN = { figures: 300, arrivals: 150, list: 0 } as const;
/** How many of one shape wait before an add-on that reads them is offered: the kernel's own three (`ingest.ts` `PROPOSE_AT`). */
export const ADDON_ARRIVALS = 3;
/** A figure is stale past twice the add-on's clock, and never under a day; a list nobody reads, never under a week. */
export const ADDON_STALE = { runs: 2, figureMs: DAY_MS, listMs: 7 * DAY_MS } as const;

const UNIT_MS: Record<string, number> = { m: 60_000, h: 3_600_000, d: DAY_MS, w: 7 * DAY_MS };

/** `15m`, `1h`, `6h`, `1d` or `1w` in milliseconds, or `null` for anything else. */
export const everyMs = (every: unknown): number | null => {
  const m = typeof every === 'string' ? /^\s*(\d+)\s*([mhdw])\s*$/u.exec(every) : null;
  return m && Number(m[1]) > 0 ? Number(m[1]) * UNIT_MS[m[2]!]! : null;
};

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * A pack's document read for the add-on source. A `{{config:<key>}}` is filled from that setting's default, as the
 * install fills it when nobody chose another. A script keeps its `writes` on `runs.every` and needs a key when it names
 * one; a poll or a pull keeps its `writes.register` on `every`, and needs a key when it names a grant; a door reads the
 * shapes it declares (`shapes`, or `from` beside its channel). A document that is not one reads as keeping nothing.
 */
export function reachEntryOf(entry: { id: string; title: string }, doc: Record<string, unknown> | null): ReachCatalogueEntry {
  const config = isRecord(doc?.config) ? doc.config : {};
  const fill = (v: unknown): unknown =>
    typeof v === 'string'
      ? v.replace(/\{\{config:([^}]+)\}\}/gu, (all, key: string) => {
          const set = config[key.trim()];
          return isRecord(set) && typeof set.default === 'string' ? set.default : all;
        })
      : v;
  const keeps: ReachKeeps[] = [];
  const shapes: string[] = [];
  let needsKey = false;
  const named = (v: unknown): boolean => typeof v === 'string' && v.trim() !== '';
  for (const d of Array.isArray(doc?.declarations) ? doc.declarations : []) {
    if (!isRecord(d)) continue;
    if (typeof d.script === 'string') {
      const every = everyMs(fill(isRecord(d.runs) ? d.runs.every : undefined));
      for (const list of Array.isArray(d.writes) ? d.writes : []) if (named(list)) keeps.push({ list: (list as string).trim(), everyMs: every });
      if (Array.isArray(d.keys) && d.keys.some(named)) needsKey = true;
      continue;
    }
    if (typeof d.ingest !== 'string') continue;
    const channel = typeof d.channel === 'string' ? d.channel : '';
    const register = isRecord(d.writes) ? d.writes.register : undefined;
    if ((channel === 'poll' || channel === 'pull') && named(register)) {
      keeps.push({ list: (register as string).trim(), everyMs: everyMs(fill(d.every)) });
      if (named(d.grant) || named(d.key)) needsKey = true;
    }
    for (const s of Array.isArray(d.shapes) ? d.shapes : []) if (named(s)) shapes.push((s as string).trim().toLowerCase());
    if (channel !== '' && named(d.from)) shapes.push(`${channel}:${(d.from as string).trim().toLowerCase()}`);
  }
  return { id: entry.id, title: entry.title, keeps, shapes: [...new Set(shapes)], needsKey };
}

/** Whether an arrival's shape is one an add-on declares: the same, or a sender at a domain it names as `channel:@domain`. */
export const shapeFits = (declared: string, shape: string): boolean => {
  const want = declared.toLowerCase();
  const got = shape.toLowerCase();
  if (want === got) return true;
  const at = want.indexOf(':@');
  return at > 0 && got.startsWith(want.slice(0, at + 1)) && got.endsWith(want.slice(at + 1));
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** A day as a person says it: `28 September`, with the year when it is not this one. */
const spokenDay = (day: string, nowMs: number): string => {
  const at = new Date(`${day.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(at.getTime())) return day;
  const year = at.getUTCFullYear() === new Date(nowMs).getUTCFullYear() ? '' : ` ${at.getUTCFullYear()}`;
  return `${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]}${year}`;
};

const olderThan = (day: string | null, ms: number, nowMs: number): boolean => day === null || Date.parse(`${day.slice(0, 10)}T00:00:00Z`) < nowMs - ms;

type Why = { reason: keyof typeof ADDON_WITHIN; n: number; day: string | null; said: string };

/**
 * The add-ons the record lacks for what it holds, strongest first, at most one an add-on. For each one not installed:
 *
 * - FIGURES THAT REST ON A LIST IT KEEPS, gone stale: the list's newest entry is older than twice the add-on's clock (a
 *   day at least), and no installed add-on keeps that list. "6 figures here use rates from 28 September."
 * - ARRIVALS OF A SHAPE IT READS: `ADDON_ARRIVALS` or more wait at a door with no pattern.
 * - A LIST IT KEEPS THAT NOTHING FILLS: the record holds entries in it, no installed add-on writes it, and its newest is
 *   a week old or more. An empty list is not offered for, so a fresh record is not sold a feed before it holds anything.
 *
 * ONE ADD-ON A LIST: where several would keep the same list, the one that needs no key comes first, then the one that
 * runs most often, then the catalogue's own order. An add-on that needs a key says so in its sentence. The key is
 * `addon:<id>`, and the basis is the reason, the day and the count (`figures:2026-09-28@6`), so one turned down comes
 * back when the day it rests on moves or the count grows tenfold (`design-agent.ts` `basisMoved`).
 */
export function addonOffers(signals: AddonSignals, nowMs: number): ReachOffer[] {
  const lapses = dayOf(nowMs + LAPSE_DAYS * DAY_MS);
  const installed = new Set(signals.installed);
  const kept = new Set(signals.catalogue.filter((e) => installed.has(e.id)).flatMap((e) => e.keeps.map((k) => k.list)));
  const keeps = (l: AddonSignals['lists'][number], list: string): boolean => l.list === list || l.role === list;
  const filled = (l: AddonSignals['lists'][number]): boolean => kept.has(l.list) || (l.role !== undefined && kept.has(l.role));
  const free = signals.catalogue
    .map((entry, at) => ({ entry, at }))
    .filter(({ entry }) => !installed.has(entry.id))
    .sort((a, b) => Number(a.entry.needsKey) - Number(b.entry.needsKey) || fastest(a.entry) - fastest(b.entry) || a.at - b.at);

  const claimed = new Set<string>();
  const out: ReachOffer[] = [];
  for (const { entry } of free) {
    let best: Why | null = null;
    const better = (w: Why): void => {
      if (best === null || ADDON_WITHIN[w.reason] + w.n > ADDON_WITHIN[best.reason] + best.n) best = w;
    };
    const lists: string[] = [];
    for (const keep of entry.keeps) {
      const clock = Math.max(keep.everyMs ?? DAY_MS, 0) * ADDON_STALE.runs;
      for (const l of signals.lists.filter((x) => keeps(x, keep.list) && !filled(x) && !claimed.has(x.list))) {
        const name = l.name?.trim() || null;
        const what = name === null ? 'what is kept there' : name.toLowerCase();
        const stale = signals.figures.filter((f) => keeps(l, f.reads) && olderThan(f.oldest ?? l.newest, Math.max(clock, ADDON_STALE.figureMs), nowMs));
        if (stale.length > 0 && olderThan(l.newest, Math.max(clock, ADDON_STALE.figureMs), nowMs)) {
          const n = stale.length;
          better({
            reason: 'figures',
            n,
            day: l.newest,
            said: l.newest === null ? `${count(n)} ${n === 1 ? 'figure here reads' : 'figures here read'} ${what}, and none has come in yet` : `${count(n)} ${n === 1 ? 'figure here uses' : 'figures here use'} ${what} from ${spokenDay(l.newest, nowMs)}`,
          });
          lists.push(l.list);
        } else if (keep.everyMs !== null && l.rows > 0 && olderThan(l.newest, Math.max(clock, ADDON_STALE.listMs), nowMs)) {
          better({
            reason: 'list',
            n: l.rows,
            day: l.newest,
            said: `${name ?? 'A list here'} holds ${count(l.rows)} ${l.rows === 1 ? 'entry' : 'entries'}, ${l.newest === null ? 'none dated' : `the newest from ${spokenDay(l.newest, nowMs)}`}, and nothing keeps it current`,
          });
          lists.push(l.list);
        }
      }
    }
    const waiting = signals.arrivals.filter((a) => entry.shapes.some((s) => shapeFits(s, a.shape)));
    const n = waiting.reduce((sum, a) => sum + Math.max(0, Math.floor(a.waiting)), 0);
    if (n >= ADDON_ARRIVALS) {
      const since = waiting.map((a) => a.since ?? null).filter((d): d is string => d !== null).sort()[0] ?? null;
      better({ reason: 'arrivals', n, day: since, said: `${count(n)} messages that came in ${since === null ? '' : `since ${spokenDay(since, nowMs)} `}wait with nothing to read them` });
    }
    const why = best as Why | null;
    if (why === null) continue;
    for (const l of lists) claimed.add(l);
    out.push({
      key: `addon:${entry.id}`,
      class: 'arrange',
      rank: ADDON_TIER + ADDON_WITHIN[why.reason] + Math.min(149, why.n),
      basis: `${why.reason}:${why.day ?? 'none'}@${why.n}`,
      lapses,
      title: `Turn on ${entry.title}?`,
      why: `${why.said}${entry.needsKey ? `, and ${entry.title} needs your key` : ''}.`,
      change: { kind: 'install', pack: entry.id },
    });
  }
  return out.sort((a, b) => b.rank - a.rank);
}

/** How often an add-on's quickest automation runs, for choosing among those that keep one list; no clock is last. */
const fastest = (e: ReachCatalogueEntry): number => Math.min(Number.MAX_SAFE_INTEGER, ...e.keeps.map((k) => k.everyMs ?? Number.MAX_SAFE_INTEGER));

/* ── the one queue ──────────────────────────────────────────────────────────────────────────────────────────────── */

export type ReachQueue = Omit<Queue, 'waiting' | 'fresh'> & { waiting: (ReachOffer | Held)[]; fresh: ReachOffer[] };

/**
 * `design-agent.ts`'s `queueOf` for offers that may be a skill or an add-on: the same gate, the same cap of three and
 * the same day it lapses. `queueOf` reads only what an offer holds in the queue (key, class, rank, basis, lapses) and
 * hands back the offers it was given, so a skill or an add-on offer goes through it whole and comes back as it went in.
 */
export function reachQueue(offers: readonly ReachOffer[], open: readonly Held[], dismissed: readonly Pick<Held, 'key' | 'basis'>[], nowMs: number): ReachQueue {
  return queueOf(offers as readonly Offer[], open, dismissed, nowMs) as ReachQueue;
}
