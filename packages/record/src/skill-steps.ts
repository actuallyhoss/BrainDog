/**
 * A skill's steps, from what agents' runs wrote when they handed off.
 *
 * A SKILL IS OFFERED ONLY WITH STEPS. Slash offered a skill a use case only names with the body "Its steps are not
 * written yet.", so what the owner was asked to accept was a name (`slash.ts`). A step is what at least three different
 * runs wrote: a command in backticks, a file path, or a sentence, each said in their handoffs. Fewer than three runs
 * alike is a habit of one or two, and no skill.
 *
 * EVERY STEP IS A QUOTE. A step is the sentence of the first handoff that says it, word for word, or the command as that
 * handoff wrote it when the sentence is too long to show. Nothing is reworded, so a step can always be found in what a
 * run left. A quote holding what reads as a key or an id is never a step (`quoteOf`, `looksLikeCredential`).
 *
 * IT IS PURE. It reads no table and asks no model: the caller hands the handoffs, oldest first.
 */

import { looksLikeCredential } from '@braindog/kernel';

import { QUOTE_MOST, foldStep, namedSteps, quoteOf } from './reach.ts';

/** One run's handoff: the run's spoken name and what it wrote. */
export type Handoff = { run: string; text: string };

/** The fewest different runs a step is written by before it is a step. */
export const STEP_RUNS = 3;
/** The most steps a skill is drafted with. */
export const STEPS_MOST = 6;
/** A sentence of fewer words is a remark ("Done."), not a step. */
const SENTENCE_WORDS = 3;

const LIST_MARK = /^(?:[-*•]|\d+[.)])\s+/u;
/** A path written bare: folders and a file with an extension, `packages/record/src/slash.ts`. */
const PATH = /(?<![\w`/.-])(?:\.{1,2}\/)?(?:[\w.-]+\/)+[\w.-]+\.[a-z]{1,6}(?![\w/-])/giu;
/** A sentence ends at a stop followed by a capital, a backtick, a quote or a bracket, as `quoteOf` reads one. */
const SENTENCE = /(?<=[.!?])\s+(?=[\p{Lu}`"(])/u;

const shown = (step: string): boolean => step.split(/\s+/u).every((w) => w === '' || !looksLikeCredential(w.replace(/^[`"'(]+|[`"'),.;:!?]+$/gu, '')));

type Said = { fold: string; step: string | null };

/** What one line of a handoff says, in the order it says it: its commands and files, its bare paths, then its sentences. */
function saidIn(line: string): Said[] {
  const out: Said[] = [];
  const quoted = (text: string): string | null => {
    const quote = quoteOf(line, text);
    if (quote !== null) return quote;
    const bare = `\`${text}\``;
    return bare.length <= QUOTE_MOST && !looksLikeCredential(text) ? bare : null;
  };
  for (const n of namedSteps(line)) out.push({ fold: n.fold, step: quoted(n.text) });
  const unticked = line.replace(/`[^`\n]*`/gu, ' ');
  for (const m of unticked.matchAll(PATH)) out.push({ fold: foldStep(m[0]), step: quoted(m[0]) });
  for (const raw of line.split(SENTENCE)) {
    const sentence = raw.trim();
    const fold = foldStep(sentence);
    if (fold.split(' ').length < SENTENCE_WORDS || !/\p{L}/u.test(fold)) continue;
    out.push({ fold: `sentence:${fold}`, step: sentence.length <= QUOTE_MOST ? sentence : null });
  }
  return out;
}

/**
 * The steps at least `STEP_RUNS` different runs' handoffs share, in the order they were first said, each quoted from
 * the first handoff that said it, at most `most`; `null` when no step is shared by that many runs.
 */
export function stepsFrom(handoffs: readonly Handoff[], most = STEPS_MOST): string[] | null {
  const seen = new Map<string, { runs: Set<string>; step: string | null; order: number }>();
  let order = 0;
  for (const h of handoffs) {
    const run = h.run.trim();
    if (run === '' || typeof h.text !== 'string') continue;
    const here = new Set<string>();
    for (const raw of h.text.split(/\r?\n/u)) {
      const line = raw.trim().replace(LIST_MARK, '');
      if (line === '') continue;
      for (const s of saidIn(line)) {
        if (here.has(s.fold)) continue;
        here.add(s.fold);
        const was = seen.get(s.fold);
        if (was === undefined) seen.set(s.fold, { runs: new Set([run]), step: s.step, order: order++ });
        else {
          was.runs.add(run);
          /* THE FIRST QUOTE FIT TO SHOW, so a step first said in a sentence too long to show is quoted from the next run. */
          if (was.step === null) was.step = s.step;
        }
      }
    }
  }
  const steps: string[] = [];
  for (const s of [...seen.values()].sort((a, b) => a.order - b.order)) {
    if (s.runs.size < STEP_RUNS || s.step === null || !shown(s.step) || steps.includes(s.step)) continue;
    steps.push(s.step);
    if (steps.length >= most) break;
  }
  return steps.length === 0 ? null : steps;
}
