/**
 * Turn 1 of the first run, "Who are you?", read without a model (`loop/research-modular.md` §2.2).
 *
 * DETERMINISTIC ON PURPOSE, and for longer than the business turn will be: the answer becomes the
 * first People row, and a wrong guess about a name is worse than no guess. So a name is only taken
 * where the sentence puts one unmistakably, and everything after it is kept verbatim as the bio.
 * The screen shows what was heard before anything is written, so a miss costs one edit.
 *
 * A plain `.ts` so `node --test` can hold it; the screen only calls it.
 */

export type Heard = { name: string | null; bio: string };

/** What `meet` is sent from onboarding. */
export type Introduction = { name: string; email?: string; where: 'onboarding' };

/* A capitalised word, any script: `Sam`, `Élodie`, `O'Neill`, `Jean-Luc`. */
const CAP = "\\p{Lu}[\\p{L}\\p{M}'’.-]*";
/* Any word, for the one place a lowercase name is taken: before a comma at the very start. */
const WORD = "\\p{L}[\\p{L}\\p{M}'’.-]*";

/* Up to three words, and never the pronoun `I` as the second or third: "I'm Sam I freelance". */
const NAME = `${CAP}(?:\\s+(?!I\\b)${CAP}){0,2}`;

const GREETING = /^(?:hi|hello|hey)\b[\s,.!]*/iu;
/* Case spelled out rather than the `i` flag, which would let `\p{Lu}` match lowercase letters and
   read "I'm part of a team" as somebody called Part. */
const SAYS_NAME = new RegExp(`^(?:[Ii]['’]?m|[Ii] am|[Mm]y name is|[Tt]his is)\\s+(${NAME})(?=$|[\\s,.;:!])`, 'u');
const BEFORE_COMMA = new RegExp(`^(${WORD}(?:\\s+${WORD}){0,2})\\s*[,;:–-]\\s*`, 'u');
const BEFORE_I = new RegExp(`^(${NAME})\\s+(?=I\\b)`, 'u');
const ALONE = new RegExp(`^(${NAME})[.!]?$`, 'u');

/* Words that open a sentence without being anybody's name. Checked on the first word only. */
const NOT_A_NAME = new Set(['i', "i'm", 'im', 'we', 'me', 'my', 'our', 'so', 'well', 'yes', 'yeah', 'no', 'ok', 'okay', 'sure', 'and', 'but', 'also', 'just', 'currently', 'basically', 'honestly', 'hi', 'hello', 'hey']);

const oneLine = (s: string): string => s.replace(/\s+/g, ' ').trim();
const lead = (s: string): string => s.replace(/^[\s,.;:!–-]+/u, '');
const named = (name: string): boolean => !NOT_A_NAME.has((name.split(' ')[0] ?? '').toLowerCase().replace('’', "'"));

/** A name, if the sentence gives one, and the rest of it as a one-line bio. */
export function hear(sentence: string): Heard {
  const said = oneLine(sentence);
  const body = said.replace(GREETING, '');

  const m = SAYS_NAME.exec(body) ?? BEFORE_COMMA.exec(body) ?? BEFORE_I.exec(body) ?? ALONE.exec(body);
  /* A word may hold a dot for an initial, `S. Marchetti`, so the full stop ending the sentence is taken off. */
  const name = m?.[1]?.replace(/[.'’-]+$/u, '');
  if (m && name && named(name)) return { name, bio: lead(body.slice(m[0].length)) };
  return { name: null, bio: said };
}

/** What a chip appends: its words after what is there, as a new clause. */
export function withChip(text: string, chip: string): string {
  const was = text.trimEnd();
  if (!was) return chip;
  return /[.!?,;:]$/.test(was) ? `${was} ${chip}` : `${was}, ${chip}`;
}

/**
 * The `meet` call onboarding makes, or `null` when it makes none.
 *
 * NONE WITHOUT A NAME, because a People row needs one. NONE WHEN PEOPLE IS OFF OR ABSENT: the turn
 * still ran and the name was still shown back, and the identity the person signed in with is
 * kernel's, not the pack's (`research-modular.md` §2.3), so there is nothing to report as missing.
 */
export function introduce(heard: Heard, email: string | null, packs: readonly { id: string; disabled_at: string | null }[] | null): Introduction | null {
  if (!heard.name) return null;
  const people = packs?.find((p) => p.id === 'people');
  if (!people || people.disabled_at !== null) return null;
  return { name: heard.name, ...(email ? { email } : {}), where: 'onboarding' };
}

/**
 * The same person as a demo row, with the bio in `note`.
 *
 * WITHOUT `met`: a waiting row holds scalar fields only, and `met` is a list. `meet` writes that
 * line on a live record.
 */
export function personRow(asked: Introduction, bio: string): Record<string, string> {
  return { name: asked.name, ...(asked.email ? { email: asked.email } : {}), ...(bio ? { note: bio } : {}) };
}
