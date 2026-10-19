/**
 * What an agent session and its commits say was finished, read against the project's open tasks.
 *
 * A SESSION'S WORDS (what it did, its notes, what it was doing) and a commit's subject are each matched to the open
 * tasks of the one project the run works in, by the words of the task's title. A task is closed only when the words
 * clearly name exactly one open task (`SURE`); a weaker match asks in To review (`WEAK`). Both lines are the record's
 * own, with an undo, and never a question in Needs you. Pure: the kernel writes (`index.ts`).
 *
 * THE CLAIM COMES FIRST. A sentence closes nothing unless it says something was done and says nothing against it
 * ("still", "not yet", "next", "needs to"), so a step left for the next run never closes the task it names.
 *
 * THE HEADER CARRIES THE COMMITS. The `authors` hint is `Name <email>, ... || abc1234 Subject || def5678 Subject`: the
 * authors first, then the last few commits, newest first, each a hash and its subject. Older clients send only authors.
 */

/** The most commits one session's hint is read for. */
export const MOST_COMMITS = 5;

/** The words of a title that must be found in a sentence for it to name the task outright. All but a tenth, so a short title needs all of them. */
export const SURE = 0.9;
/** The share of a title's words that makes a sentence worth asking about. */
export const WEAK = 0.6;
/** A title with fewer distinct content words than this names nothing on its own ("Fix", "Tidy up"). */
export const LEAST_WORDS = 2;

/** The separator between the authors and each commit in the hint. */
export const HINT_SEP = ' || ';

export type CommitSubject = { hash: string; subject: string };

/** The commits a hint names, newest first, a hash and its subject each, at most `MOST_COMMITS`; unreadable entries left out. */
export function commitSubjects(said: string | undefined): CommitSubject[] {
  const out: CommitSubject[] = [];
  const parts = (said ?? '').split(/\s*\|\|\s*/u).slice(1);
  for (const part of parts) {
    const m = /^([0-9a-f]{7,40})\s+(\S.*)$/iu.exec(part.trim());
    if (!m) continue;
    if (out.some((c) => c.hash === m[1]!.toLowerCase())) continue;
    out.push({ hash: m[1]!.toLowerCase(), subject: m[2]!.trim() });
    if (out.length === MOST_COMMITS) break;
  }
  return out;
}

const STOP = new Set([
  'the', 'a', 'an', 'to', 'of', 'for', 'and', 'or', 'in', 'on', 'with', 'up', 'it', 'is', 'be', 'at', 'by', 'from', 'as', 'this', 'that', 'its', 'our', 'my',
  'into', 'out', 'all', 'new', 'now', 'then', 'also', 'so', 'we', 'i', 'was', 'were', 'has', 'have', 'had', 'do', 'did', 'done',
]);

/** A word with the endings that do not change what it names taken off, so "wired" and "wire", "pages" and "page" meet. */
function stem(word: string): string {
  let w = word;
  if (w.length > 5 && w.endsWith('ing')) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith('ed')) w = w.slice(0, -2);
  else if (w.length > 4 && w.endsWith('es')) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
  /* The silent e last, so "wire" and "wired" both end as "wir". */
  if (w.length > 3 && w.endsWith('e')) w = w.slice(0, -1);
  return w;
}

/** The distinct content words of some text, lower-cased and stemmed. */
export function wordsOf(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/u)) {
    if (raw.length < 2 || STOP.has(raw)) continue;
    out.add(stem(raw));
  }
  return out;
}

/** How much of a title a sentence names: the share of the title's content words it holds, 0 for a title too short to name anything. */
export function nameScore(title: string, sentence: string): number {
  const t = wordsOf(title);
  if (t.size < LEAST_WORDS) return 0;
  const s = wordsOf(sentence);
  let held = 0;
  for (const w of t) if (s.has(w)) held += 1;
  return held / t.size;
}

const DONE = /\b(?:done|finish(?:ed)?|complet(?:e|ed)|ship(?:ped)?|fix(?:ed)?|merg(?:e|ed)|land(?:ed)?|resolv(?:e|ed)|clos(?:e|ed)|deploy(?:ed)?|built|added|implement(?:ed)?|wired|releas(?:e|ed)|publish(?:ed)?|sorted|live)\b/iu;
/** Words that turn a claim into something not yet true, or only partly so. */
const AGAINST = /\b(?:not|never|still|yet|todo|remaining|need(?:s|ed)? to|next|should|will|would|could|might|blocked|failed|broken|unfinished|incomplete|partial(?:ly)?|half|wip|pending|but|except|left to|if)\b|n't/iu;
/** A commit that is a step toward a task and not the end of it. */
const STEP = /\b(?:wip|partial(?:ly)?|part|start(?:s|ed)?|begin|begins|towards?|prep|prepare|draft|initial|first|step|scaffold|stub|progress)\b/iu;

/** The sentences of some text, split where a person would, empty ones dropped. */
export function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?;])\s+|\n+|\s+-\s+/u)
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

/** A sentence that claims something was finished, and says nothing against it. */
export const claims = (sentence: string): boolean => DONE.test(sentence) && !AGAINST.test(sentence);

export type Open = { id: string; title: string };
export type Named = { task: Open; score: number; said: string };
export type Read = { sure: Named[]; weak: Named[] };

/**
 * The open tasks some sentences name. `needsClaim` is true for a session's words (a sentence must say it was done) and
 * false for a commit subject, which says what was done in the imperative and is blocked only by the words of a step.
 *
 * ONE TASK, OR NONE. A sentence that names two tasks equally well names neither outright: both fall to the weak list
 * only if it reaches the weak bar, and a sentence whose best two are tied is dropped. A task named twice keeps its best.
 */
export function readNames(said: readonly string[], open: readonly Open[], needsClaim: boolean): Read {
  const best = new Map<string, Named>();
  for (const text of said) {
    for (const s of needsClaim ? sentences(text) : [text]) {
      if (needsClaim ? !claims(s) : STEP.test(s) || AGAINST.test(s)) continue;
      const scored = open
        .map((task) => ({ task, score: nameScore(task.title, s), said: s }))
        .filter((x) => x.score >= WEAK)
        .sort((a, b) => b.score - a.score);
      const [top, next] = scored;
      if (!top) continue;
      if (next && next.score === top.score) continue;
      /* A RUNNER-UP THAT IS NEARLY AS GOOD MAKES THE TOP ONLY A GUESS, so it asks even when it is high. */
      const alone = !next || next.score < WEAK;
      const kept = alone ? top : { ...top, score: Math.min(top.score, SURE - 0.01) };
      const had = best.get(kept.task.id);
      if (!had || kept.score > had.score) best.set(kept.task.id, kept);
    }
  }
  const all = [...best.values()];
  return { sure: all.filter((n) => n.score >= SURE), weak: all.filter((n) => n.score < SURE) };
}

/** A sentence cut to a line a card can hold. */
export const cutLine = (text: string, most = 80): string => (text.length <= most ? text : `${text.slice(0, most - 1).trimEnd()}…`);

/** The actors that are not a person: a run (`S12`), the record itself and what it files. Anyone else wrote by hand. */
export function byMachine(actor: string, runPrefix: string): boolean {
  return actor === 'system' || actor.startsWith('rule:') || actor.startsWith('ingest:') || new RegExp(`^${runPrefix}[1-9][0-9]*$`, 'u').test(actor);
}

/**
 * Whether a project's `next` may be refreshed from a session: it was last written by a machine, or it is empty and
 * nobody ever wrote it. A value with no line in the history (set when the row was made) is kept, as a hand's.
 */
export function mayRefreshNext(current: unknown, lastWriter: string | null, runPrefix: string): boolean {
  const empty = typeof current !== 'string' || current.trim() === '';
  if (lastWriter === null) return empty;
  return byMachine(lastWriter, runPrefix);
}
