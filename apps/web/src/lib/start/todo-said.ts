/**
 * A DRAFTED TO-DO IS KEPT ONLY WHERE ITS WORDS ARE THE PERSON'S (2 Nov, onboarding10: Priya said "deadlines" in one
 * answer and "Brightside" in another, and Today offered "Set up deadlines for Brightside", which she never said). The
 * same guard as `fitsTheKind` in `propose.ts`, held over every to-do drawn before Today shows it: the rules' first
 * to-dos (`todosFor` in `chat.ts`) and the model's (`draftsOf` in `first-drafts.ts`).
 *
 * THE VERB IN FRONT IS OURS, THE REST IS THEIRS: "Send", "Write down", "Pay" say what to do with a thing, and every other
 * word of the to-do, the thing and whoever it is for, must stand together in one sentence of what they typed. "Send
 * Fenwick's invoice" holds where they wrote "three clients, Fenwick, Brightside and Acme, and invoice them every month";
 * "Set up deadlines for Brightside" does not where "deadlines" and "Brightside" were said apart.
 *
 * A plain `.ts` with no imports, so the sign-up, `/start` and Today's lazy reader can all hold it.
 */

/** The verbs a to-do starts with, longest first so "write down" is one verb and not "write" and a word. */
const LEADING =
  /^(?:write down|set up|follow up(?: on| with)?|reply to|pick up|drop off|look at|keep track of|send|write|list|add|log|pay|call|email|text|book|buy|finish|fix|file|renew|cancel|chase|ask|meet|submit|sign|post|ship|review|update|prepare|check|plan|order|invoice|bill|record|note|track)\b\s*/iu;

/** Words that carry no thing of theirs: the small words, and the "this month's" a drawn to-do is dated by. */
const FRAME = new Set([
  'a', 'an', 'the', 'this', 'that', 'these', 'those', 'next', 'last', 'each', 'every', 'all', 'any', 'some', 'new',
  'for', 'at', 'of', 'to', 'and', 'or', 'with', 'on', 'in', 'from', 'by', 'about', 'up', 'down', 'out', 'into', 'over',
  'my', 'our', 'your', 'their', 'them', 'it', 'its', 'me', 'us',
  'month', 'months', 'week', 'weeks', 'today', 'tomorrow', 'now', 'first',
]);

/** One word as it is compared: no case, no possessive, and the first five letters of a long one ("invoice", "invoices"). */
function stem(w: string): string {
  const s = w.toLowerCase().replace(/['’]s$/u, '').replace(/['’]/gu, '');
  if (s.length > 5) return s.slice(0, 5);
  return s.length > 3 && s.endsWith('s') ? s.slice(0, -1) : s;
}

const wordsOf = (s: string): string[] => s.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? [];

/** The words of a to-do that must be theirs: everything after its leading verb but the small words. */
export function todoWords(title: string): string[] {
  const rest = title.trim().replace(/[.!]+$/u, '').replace(LEADING, '');
  return wordsOf(rest)
    .map((w) => w.replace(/['’]s$/u, ''))
    .filter((w) => !FRAME.has(w.toLowerCase()));
}

/**
 * Whether a to-do says only what the person said: every word of it but its verb and the small words is found in one
 * sentence of `said`. A to-do with nothing of theirs left ("Write down this month's") is no to-do.
 */
export function saidTodo(title: string, said: string): boolean {
  const need = todoWords(title).map(stem);
  if (need.length === 0) return false;
  return said
    .split(/(?<=[.!?;])\s+|\n+/u)
    .some((sentence) => {
      const have = new Set(wordsOf(sentence).map(stem));
      return need.every((w) => have.has(w));
    });
}
