/**
 * The written brief (DIRECTION 45, decision 4): two or three plain sentences on where things stand, which a small model
 * rewrites only when the rows the brief reads change, and which Today then shows at once.
 *
 * Pure: nothing here reads a table or holds a kernel. A caller hands the facts it gathered (`briefFactsFor`), the
 * record's version, the instant, and a pref's get and set. Opening Today asks no model: the read only resolves what was
 * kept against the facts as they are now (`writtenShown`).
 *
 * KEPT AS PARTS, NEVER AS FINISHED TEXT. A sentence is stored as runs of words, a figure naming the row it is about and
 * the figure's name, and a thing's name naming its row. The read fills each from the record as it is, so "3 days late"
 * is today's count and each figure opens its own row. A part whose row is gone, or whose figure or name moved, voids the
 * whole brief and the rules speak until the model writes again: a bill paid a minute ago is never said late.
 *
 * WHEN IT IS WRITTEN. The record's version is the mark: a tick that finds it unmoved, on the same day, does nothing at
 * all. A moved version gathers the facts; facts whose basis equals the kept brief's cost nothing more. A basis that
 * differs is "dirty", and the model is asked only once it has stayed the same for `WRITTEN_QUIET_MS` (a debounce), at
 * most `WRITTEN_ASKS_DAY` times a day, and a failed ask is not repeated at that basis for `WRITTEN_RETRY_MS`.
 */

import { BRIEF_RULES_MOST, briefBasis, briefCandidates, briefInput, rulesBrief, type BriefCard, type BriefFact, type BriefInput } from './briefing.ts';
import { SYSTEM_WORDS, holesOf, numbersIn } from './headlines.ts';

/** The prefs, of Slash's own holder, the kept brief and the tick's state live under. */
export const WRITTEN_KEPT = 'briefing.written';
export const WRITTEN_STATE = 'briefing.written.state';

/** How many sentences make the brief, and the most characters one runs to once its figures are in. */
export const WRITTEN_SENTENCES_MOST = 3;
export const WRITTEN_SENTENCE_MOST = 220;

/** How many things that need the owner stand under the sentences. */
export const WRITTEN_NEEDS_MOST = 5;

/** The kinds of fact that wait on the owner: a question, something that stopped, a step a run left. */
export const WRITTEN_NEED_KINDS = ['asked', 'exception', 'step'] as const;

/** How long a changed basis must stand still before the model is asked: a debounce, so a burst of edits is one ask. */
export const WRITTEN_QUIET_MS = 60_000;

/** How long after a failed ask the same basis is left alone. */
export const WRITTEN_RETRY_MS = 30 * 60_000;

/** At most this many asks a day, however much changes. */
export const WRITTEN_ASKS_DAY = 24;

/** An ask that began and has not settled blocks another for this long. */
const INFLIGHT_MS = 2 * 60_000;

/** One run of a kept sentence: plain words, or a figure of a row (`figure`), or a thing's name for a row (`row` alone). */
export type WrittenPart = { text: string; row?: string; figure?: string };

/** The brief as it is kept: the basis it was written from, when, and its sentences as parts. */
export type KeptWritten = { basis: string; at: string; sentences: { parts: WrittenPart[] }[] };

/** What the read hands Today: each run's words as they are now and the row it opens, `null` for plain words. */
export type WrittenRead = {
  at: string;
  sentences: { parts: { text: string; row: string | null }[] }[];
  needs: BriefCard[];
};

/** What the model is handed: the brief's facts by handle, and how many sentences it may write. */
export type WrittenInput = BriefInput & { sentences: number };

/** How a brief is asked for, through the meter: what the model said, or the sentence saying why it was not asked. */
export type WrittenAsk = (input: WrittenInput) => Promise<{ raw: unknown } | { spent: string }>;

/** The tick's state: the version last looked at, the day, the debounce, the day's asks, and the last failure. */
export type WrittenState = {
  version: number;
  looked: string | null;
  day: string;
  asks: number;
  dirty: { basis: string; since: number } | null;
  inflight: number | null;
  failed: { basis: string; at: number; why: string } | null;
};

/**
 * A figure as a sentence says it. `days` is gathered as a bare count and a sentence cannot add the unit without typing a
 * number's word, so it is said here with its unit: "1 day", "3 days". Every other figure is said as it is held.
 */
export function figureText(f: BriefFact, name: string): string {
  const v = (f.figures[name] ?? '').trim();
  return name === 'days' && /^\d+$/u.test(v) ? `${v} ${v === '1' ? 'day' : 'days'}` : v;
}

const HOLE = /\{\{\s*([^{}\s]+)\s*\}\}/gu;

/** The facts the brief may be written of: those that open a row, so every figure and name it says can be linked. */
const usable = (facts: readonly BriefFact[]): BriefFact[] => facts.filter((f) => f.row !== '');

/** The facts one ask is handed, cut as every briefing's are. */
export const writtenCandidates = (facts: readonly BriefFact[]): BriefFact[] => briefCandidates(usable(facts));

/** The basis a written brief is written from. */
export const writtenBasis = (facts: readonly BriefFact[]): string => briefBasis(writtenCandidates(facts));

/** The one ask: the briefing's facts, and the sentences wanted. */
export const writtenInput = (facts: readonly BriefFact[], today: string): WrittenInput => ({ ...briefInput(writtenCandidates(facts), today), sentences: WRITTEN_SENTENCES_MOST });

/**
 * What needs the owner, from the same facts: the questions (already one a cause, so alike ones come as one), what
 * stopped and the steps runs left, in the rules' own sentences, `WRITTEN_NEEDS_MOST` at most. The rules word them so a
 * need is always true of the record as it is, whether or not the model has written yet.
 */
export function needsOf(facts: readonly BriefFact[]): BriefCard[] {
  const needs = usable(facts).filter((f) => (WRITTEN_NEED_KINDS as readonly string[]).includes(f.kind));
  return rulesBrief(needs).slice(0, Math.min(WRITTEN_NEEDS_MOST, BRIEF_RULES_MOST));
}

/** Why one sentence is not kept, in a sentence for the log, or the parts it is kept as. */
function sentenceOf(line: unknown, byHandle: ReadonlyMap<string, BriefFact>, titles: readonly string[]): { parts: WrittenPart[] } | string {
  if (typeof line !== 'string' || line.trim() === '') return 'The model wrote an empty sentence.';
  const text = line.trim();
  const figures = new Map<string, { fact: BriefFact; figure: string }>();
  for (const hole of holesOf(text)) {
    const cut = hole.lastIndexOf('.');
    const fact = cut > 0 ? byHandle.get(hole.slice(0, cut)) : undefined;
    const figure = hole.slice(cut + 1);
    if (fact === undefined || figure === '' || figureText(fact, figure) === '') return `A sentence asked for a figure, ${hole}, that was not handed.`;
    figures.set(hole, { fact, figure });
  }
  /* WHAT THE MODEL TYPED is the line without its holes and without the names it was handed: a name may hold a digit. */
  let own = text.replace(HOLE, ' ');
  for (const t of titles) own = own.split(t).join(' ');
  if (/[\n\r{}[\]*`<>]/u.test(own) || !/\p{L}/u.test(own)) return 'A sentence was not plain words.';
  if (/\d/u.test(own) || numbersIn(own).length > 0) return 'A sentence typed a number rather than leaving a hole for it.';
  if (SYSTEM_WORDS.test(own)) return "A sentence used the system's words rather than the person's.";
  const parts: WrittenPart[] = [];
  const plain = (chunk: string): void => {
    let rest = chunk;
    while (rest !== '') {
      let best: { at: number; title: string } | null = null;
      for (const t of titles) {
        const at = rest.indexOf(t);
        if (at >= 0 && (best === null || at < best.at || (at === best.at && t.length > best.title.length))) best = { at, title: t };
      }
      if (best === null) {
        parts.push({ text: rest });
        return;
      }
      if (best.at > 0) parts.push({ text: rest.slice(0, best.at) });
      const fact = [...byHandle.values()].find((f) => f.title.trim() === best!.title)!;
      parts.push({ text: best.title, row: fact.row });
      rest = rest.slice(best.at + best.title.length);
    }
  };
  let last = 0;
  for (const m of text.matchAll(HOLE)) {
    plain(text.slice(last, m.index));
    const got = figures.get(m[1]!)!;
    parts.push({ text: figureText(got.fact, got.figure), row: got.fact.row, figure: got.figure });
    last = m.index + m[0].length;
  }
  plain(text.slice(last));
  if (!parts.some((p) => p.row !== undefined)) return 'A sentence was about nothing in the record.';
  if (parts.map((p) => p.text).join('').length > WRITTEN_SENTENCE_MOST) return `A sentence ran past ${WRITTEN_SENTENCE_MOST} characters.`;
  return { parts };
}

/**
 * The sentences of a model's answer that pass, as parts, and a sentence for the log about the first that did not.
 * An answer is `{ sentences: ["...{{<handle>.<figure>}}..."] }`. Past `WRITTEN_SENTENCES_MOST` is cut, a sentence said
 * twice is kept once.
 */
export function writtenOf(answer: unknown, facts: readonly BriefFact[]): { sentences: { parts: WrittenPart[] }[]; fault: string | null } {
  const lines = answer !== null && typeof answer === 'object' && !Array.isArray(answer) ? (answer as { sentences?: unknown }).sentences : undefined;
  if (!Array.isArray(lines) || lines.length === 0) return { sentences: [], fault: 'The model wrote no brief.' };
  const handed = writtenCandidates(facts);
  const byHandle = new Map(handed.map((f) => [f.h, f] as const));
  const titles = [...new Set(handed.map((f) => f.title.trim()).filter((t) => t !== ''))].sort((a, b) => b.length - a.length);
  const sentences: { parts: WrittenPart[] }[] = [];
  let fault: string | null = null;
  for (const line of lines as unknown[]) {
    const got = sentenceOf(line, byHandle, titles);
    if (typeof got === 'string') {
      fault ??= got;
      continue;
    }
    const said = got.parts.map((p) => p.text).join('');
    if (sentences.some((s) => s.parts.map((p) => p.text).join('') === said)) continue;
    if (sentences.length < WRITTEN_SENTENCES_MOST) sentences.push(got);
  }
  return { sentences, fault };
}

/** A kept brief read back from its pref, or `null` for anything else. */
export function writtenKeptOf(value: unknown): KeptWritten | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Partial<KeptWritten>;
  if (typeof v.basis !== 'string' || typeof v.at !== 'string' || !Array.isArray(v.sentences)) return null;
  const sentences: KeptWritten['sentences'] = [];
  for (const s of v.sentences as unknown[]) {
    const parts = s !== null && typeof s === 'object' ? (s as { parts?: unknown }).parts : undefined;
    if (!Array.isArray(parts) || parts.length === 0) return null;
    const out: WrittenPart[] = [];
    for (const p of parts as unknown[]) {
      if (p === null || typeof p !== 'object') return null;
      const { text, row, figure } = p as Partial<WrittenPart>;
      if (typeof text !== 'string' || (row !== undefined && typeof row !== 'string') || (figure !== undefined && typeof figure !== 'string')) return null;
      out.push({ text, ...(row === undefined ? {} : { row }), ...(figure === undefined ? {} : { figure }) });
    }
    sentences.push({ parts: out });
  }
  return sentences.length === 0 ? null : { basis: v.basis, at: v.at, sentences };
}

/**
 * The kept brief as Today draws it, or `null`. Each part is resolved against the facts as THIS caller reads them: a
 * figure is the fact's figure now, a name is its title now, and a row this caller was not handed, or a figure or name
 * that moved, voids the whole brief, so nothing stale and nothing about what they cannot read is ever said.
 */
export function writtenShown(kept: unknown, facts: readonly BriefFact[]): WrittenRead | null {
  const k = writtenKeptOf(kept);
  if (k === null) return null;
  const byRow = new Map<string, BriefFact>();
  for (const f of usable(facts)) if (!byRow.has(f.row)) byRow.set(f.row, f);
  const sentences: WrittenRead['sentences'] = [];
  for (const s of k.sentences) {
    const parts: WrittenRead['sentences'][number]['parts'] = [];
    for (const p of s.parts) {
      if (p.row === undefined) {
        parts.push({ text: p.text, row: null });
        continue;
      }
      const fact = byRow.get(p.row);
      if (fact === undefined) return null;
      if (p.figure === undefined) {
        if (fact.title.trim() !== p.text) return null;
        parts.push({ text: p.text, row: p.row });
      } else {
        const now = figureText(fact, p.figure);
        if (now === '') return null;
        parts.push({ text: now, row: p.row });
      }
    }
    sentences.push({ parts });
  }
  return { at: k.at, sentences, needs: needsOf(facts) };
}

/** The tick's state as kept, or a clean one for a new day or anything that is not one. */
export function writtenStateOf(value: unknown, day: string): WrittenState {
  const none: WrittenState = { version: -1, looked: null, day, asks: 0, dirty: null, inflight: null, failed: null };
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return none;
  const v = value as Partial<WrittenState>;
  const num = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
  const failed = v.failed !== null && typeof v.failed === 'object' && typeof v.failed.basis === 'string' && num(v.failed.at) && typeof v.failed.why === 'string' ? v.failed : null;
  const dirty = v.dirty !== null && typeof v.dirty === 'object' && typeof v.dirty.basis === 'string' && num(v.dirty.since) ? v.dirty : null;
  return {
    version: num(v.version) ? v.version : -1,
    looked: typeof v.looked === 'string' ? v.looked : null,
    day,
    asks: v.day === day && num(v.asks) && v.asks > 0 ? v.asks : 0,
    dirty,
    inflight: num(v.inflight) ? v.inflight : null,
    failed,
  };
}

/** The day, in the reader's zone, as `YYYY-MM-DD`. A zone nobody knows is read as UTC. */
function dayIn(now: number, zone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
  } catch {
    return new Date(now).toISOString().slice(0, 10);
  }
}

/**
 * One tick of the written brief. It asks the model only when the brief is out of date (`facts` hash differently from the
 * kept brief's basis), has stayed so for `WRITTEN_QUIET_MS`, the day has asks left and a failure is not too fresh. It
 * keeps what came back, or the failure (`why`) which the read turns into the paused line. `facts` is lazy so a tick that
 * finds the version unmoved gathers nothing.
 */
export async function writtenTick(args: {
  version: number;
  facts: () => readonly BriefFact[];
  now: number;
  zone: string;
  read: (key: string) => unknown;
  write: (key: string, value: unknown) => void;
  ask: WrittenAsk;
}): Promise<{ asked: boolean; dropped: string | null }> {
  const { now, read, write } = args;
  const idle = { asked: false, dropped: null };
  const day = dayIn(now, args.zone);
  const st = writtenStateOf(read(WRITTEN_STATE), day);
  const save = (next: Partial<WrittenState>): WrittenState => {
    const s = { ...st, ...next };
    write(WRITTEN_STATE, s);
    return s;
  };
  /* NOTHING MOVED SINCE THE LAST LOOK, AND IT IS THE SAME DAY (figures such as days late move at midnight): no gathering. */
  if (st.version === args.version && st.looked === day && st.dirty === null) return idle;
  if (st.inflight !== null && now - st.inflight < INFLIGHT_MS) return idle;
  const facts = args.facts();
  const handed = writtenCandidates(facts);
  if (handed.length === 0) {
    save({ version: args.version, looked: day, dirty: null });
    return idle;
  }
  const basis = briefBasis(handed);
  const kept = writtenKeptOf(read(WRITTEN_KEPT));
  /* THE KEPT BRIEF WAS WRITTEN FROM THESE SAME FACTS. */
  if (kept !== null && kept.basis === basis) {
    save({ version: args.version, looked: day, dirty: null, failed: null });
    return idle;
  }
  if (st.dirty === null || st.dirty.basis !== basis) {
    save({ version: args.version, looked: day, dirty: { basis, since: now } });
    return idle;
  }
  save({ version: args.version, looked: day });
  if (now - st.dirty.since < WRITTEN_QUIET_MS) return idle;
  if (st.failed !== null && st.failed.basis === basis && now - st.failed.at < WRITTEN_RETRY_MS) return idle;
  if (st.asks >= WRITTEN_ASKS_DAY) return idle;
  /* COUNTED BEFORE THE MODEL IS ASKED, answered or not, so a tick that comes in meanwhile never asks the same again. */
  save({ asks: st.asks + 1, inflight: now });
  let sentences: { parts: WrittenPart[] }[] = [];
  let why: string | null = null;
  try {
    const got = await args.ask(writtenInput(facts, day));
    if ('spent' in got) why = got.spent;
    else {
      const out = writtenOf(got.raw, facts);
      sentences = out.sentences;
      if (sentences.length === 0) why = out.fault ?? 'The model wrote no brief.';
    }
  } catch {
    why = 'The model did not answer.';
  }
  /* RE-READ, for a state another tick may have moved while the model was awaited. */
  const now2 = writtenStateOf(read(WRITTEN_STATE), day);
  if (sentences.length > 0) {
    write(WRITTEN_KEPT, { basis, at: new Date(now).toISOString(), sentences } satisfies KeptWritten);
    write(WRITTEN_STATE, { ...now2, dirty: null, inflight: null, failed: null });
    return { asked: true, dropped: null };
  }
  write(WRITTEN_STATE, { ...now2, inflight: null, failed: { basis, at: now, why: why ?? 'The model wrote no brief.' } });
  return { asked: true, dropped: `${why ?? 'The model wrote no brief.'} The rules wrote the brief.` };
}

/** Whether the last ask failed, for the read to say the written brief is paused. */
export const writtenFailed = (value: unknown): boolean => writtenStateOf(value, '').failed !== null;
