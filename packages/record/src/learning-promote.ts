/**
 * One lesson learned twice: the finder and its question, AGT-D15 jobs 2 and 3 ("Promoted when it holds beyond the
 * project (the four-part test, `32 §5`), as a proposal"; "making a project's learning hold everywhere is a
 * proposal").
 *
 * WHAT WAS THERE BEFORE. A project's learning was handed only inside its project, so a session in another one never
 * saw it, and when a second project learned the same thing the hard way nothing noticed. An agent may not widen a
 * learning (`scopeFault` in the kernel): widening is the owner's, and nothing ever put it to him.
 *
 * THE RULE, AND ALL OF IT. Two active learnings in two different projects, with the same topic once case and spaces
 * are folded, whose lessons share at least four words in five once folded, are one lesson learned twice. The five is
 * counted on the shorter lesson's words, each word once, the commonest small words left out (`SMALL`), so "Run the
 * import twice" and "Always run imports twice" are the same three words. A lesson of fewer than `WORDS_LEAST` words
 * that count is too short to tell, and is never paired. One with no topic is never paired either: the topic is what
 * says two lessons are about one thing, and counting words alone would pair any two lessons that say "the record".
 *
 * PURE. It reads the rows it is handed and the project each is in, and answers pairs, older first in each and the
 * pairs by their older row. Who may read which, and what is filed, are `methods/learnings.ts`'s.
 *
 * NO ID IN WHAT A PERSON READS. The question names the two projects as `names` calls them and quotes the lesson.
 */

/** One learning as the finder reads it: its row id, its lesson and topic, whether it stands, and when it was made. */
export type Lesson = { id: string; lesson: string; topic: string | null; active: boolean; made: string; because?: string | null };

/** One lesson learned twice: the older and the newer row, the project each is in, and the words they share of how many. */
export type Promotion = { older: Lesson; newer: Lesson; olderProject: string; newerProject: string; shared: number; of: number };

/** What the question says: its one line, and the four parts of the test written under it. */
export type PromotionQuestion = { question: string; parts: readonly [string, string, string, string] };

/** The fewest words that count a lesson must hold before it is paired at all. */
export const WORDS_LEAST = 3;
/** Four words in five: `shared / of` at least this. */
export const SHARED_PART = 4 / 5;
/** The longest a question is, as a proposal's question is held. */
const QUESTION_MOST = 280;

/** The commonest small words, which say nothing about what was learned. */
const SMALL = new Set(
  'a an the and or but if then than so of to in on at by for from with without into onto over under as is are was were be been being it its this that these those there here do does did not no never always only every each any all some one two before after when where which who what how why should must can may will would i you your we our they them their he she his her'.split(' '),
);

/** A topic as two are compared: lower case, spaces gathered into one, ends trimmed. Empty is no topic. */
export const foldTopic = (topic: string | null | undefined): string => (topic ?? '').normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim();

/**
 * A lesson's words as two are compared: lower case, accents off, split at anything not a letter or a digit, a final
 * plural `s` off a word of four letters or more, and the small words left out. Each word once.
 */
export function foldWords(lesson: string): Set<string> {
  const words = lesson.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().split(/[^\p{L}\p{N}]+/u);
  const out = new Set<string>();
  for (const w of words) {
    if (w === '' || SMALL.has(w)) continue;
    out.add(w.length >= 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);
  }
  return out;
}

/** How many words the shorter lesson shares with the longer, and of how many; `null` when one is too short to tell. */
export function sharedWords(a: string, b: string): { shared: number; of: number } | null {
  const [x, y] = [foldWords(a), foldWords(b)];
  const [short, long] = x.size <= y.size ? [x, y] : [y, x];
  if (short.size < WORDS_LEAST) return null;
  let shared = 0;
  for (const w of short) if (long.has(w)) shared += 1;
  return { shared, of: short.size };
}

/** Older first: by the instant it was made, and then by its row id, which is in the order rows were made. */
const older = (a: Lesson, b: Lesson): number => (a.made === b.made ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : a.made < b.made ? -1 : 1);

/**
 * Every lesson learned twice among `rows`. `projectOf` is the project a learning applies in, or `null` for one that
 * applies everywhere already, which is never paired: it is already what the question would make it.
 */
export function promotionsFor(rows: readonly Lesson[], projectOf: (row: Lesson) => string | null): Promotion[] {
  const byTopic = new Map<string, { row: Lesson; project: string }[]>();
  for (const row of rows) {
    if (!row.active) continue;
    const topic = foldTopic(row.topic);
    const project = projectOf(row);
    if (topic === '' || project === null) continue;
    byTopic.set(topic, [...(byTopic.get(topic) ?? []), { row, project }]);
  }
  const out: Promotion[] = [];
  for (const group of byTopic.values()) {
    group.sort((a, b) => older(a.row, b.row));
    for (let i = 0; i < group.length; i += 1)
      for (let j = i + 1; j < group.length; j += 1) {
        const [a, b] = [group[i]!, group[j]!];
        if (a.project === b.project) continue;
        const words = sharedWords(a.row.lesson, b.row.lesson);
        if (words === null || words.shared < words.of * SHARED_PART) continue;
        out.push({ older: a.row, newer: b.row, olderProject: a.project, newerProject: b.project, ...words });
      }
  }
  return out.sort((a, b) => older(a.older, b.older) || older(a.newer, b.newer));
}

/** A sentence's end, so a lesson quoted inside one is not given two full stops. */
const ended = (s: string): string => (/[.!?]$/u.test(s.trim()) ? s.trim() : `${s.trim()}.`);

/**
 * The question one pair is put as, and the four parts of the test under it (`docs/32-PARITY.md` §5): it changes what a
 * session does, it holds beyond one project, a session without it gets something wrong, and it has no other home.
 * `names` is a project's name as the person reads it.
 */
export function promotionQuestion(pair: Promotion, names: (project: string) => string): PromotionQuestion {
  const [a, b] = [names(pair.olderProject), names(pair.newerProject)];
  const question = `${a} and ${b} learned the same thing. Keep it once, for everywhere?`;
  const because = pair.older.because?.trim() || pair.newer.because?.trim() || '';
  return {
    question: question.length <= QUESTION_MOST ? question : 'Two projects learned the same thing. Keep it once, for everywhere?',
    parts: [
      `It changes what a session does: ${ended(pair.older.lesson)}`,
      `It holds beyond one project: ${a} and ${b} each learned it on their own.`,
      because === '' ? 'A session without it gets it wrong, as both of them did first.' : `A session without it gets it wrong: ${ended(because)}`,
      `It has no other home: kept once with no project, every session in every project is handed it, and the copy from ${b} is marked replaced.`,
    ],
  };
}

/** The reason the newer row is marked replaced with, word for word as the unit says it. */
export const PROMOTED_WHY = 'The same lesson, kept once for everywhere';
