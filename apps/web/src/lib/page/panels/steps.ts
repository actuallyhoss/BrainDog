/**
 * The steps left for the next run, as the Agents page's Up next draws them (`StepsPanel.svelte`), read off the record's
 * `handoffs.open` cards and folded: A STEP LEFT THREE TIMES IS ONE LINE, with every run that left it, so Drop closes
 * all of them and the line says how many times it was left.
 *
 * WHAT A ROW CARRIES is the record's (`sources/handoffs-open.ts` in the kernel): the run that left it by its spoken name
 * (`run`, a key and never a word on screen), the agent by name, the step in its words and in the words a card prints
 * (`next_said`), when it was left, and whether it is the next one or one left earlier. The project it was left in is
 * the block's `scopes`, one a row, by name, as every block that reads a list of projects says it.
 *
 * PURE, AND NODE LOADS IT.
 */

/** One step as the panel draws it: its words, its project, who left it last and when, every run that left it, and whether it is old. */
export type Step = { key: string; next: string; project: string | null; agent: string; at: string; runs: string[]; earlier: boolean };

const isBag = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
/** The words two steps are told apart by: case and runs of spaces do not make a second step. */
const foldOf = (said: string): string => said.toLowerCase().replace(/\s+/gu, ' ').replace(/[.\s]+$/u, '');

/** The steps a `handoffs.open` cards block answered, newest first as it came, each step once. */
export function stepsOf(block: unknown): Step[] {
  const rows = isBag(block) && Array.isArray(block.rows) ? block.rows : [];
  const scopes = isBag(block) && Array.isArray(block.scopes) ? block.scopes : [];
  const out = new Map<string, Step>();
  rows.forEach((r, i) => {
    if (!isBag(r) || !isBag(r.fields)) return;
    const f = r.fields;
    const next = text(f.next_said) || text(f.next);
    const run = text(f.run);
    if (next === '' || !/^S[1-9][0-9]*$/u.test(run)) return;
    const key = foldOf(next);
    const had = out.get(key);
    if (had) {
      had.runs.push(run);
      return;
    }
    out.set(key, { key, next, project: text(scopes[i]) || null, agent: text(f.agent), at: text(f.left_at), runs: [run], earlier: text(f.mark) === 'earlier' });
  });
  return [...out.values()];
}

/** A key's label as a person says it: "mercury-secret" is "Mercury", its kind of secret left out. */
function keyNamed(label: string): string {
  const parts = label.split(/[-_]+/u).filter((w) => w !== '');
  const kept = parts.filter((w) => !/^(?:secret|token|key|api|apikey|pat)$/iu.test(w));
  const name = (kept.length > 0 ? kept : parts).join(' ');
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * A STEP IN PLAIN WORDS (the pass of 27 October, UX39), as Up next prints it: a step one run left for him opens with
 * his name ("Sam: answer 2 questions"), which on his own screen is noise, and names a key as the keychain stores it
 * ("the sealed mercury-secret key"). The name is dropped and the key said by what it opens ("the Mercury key"). The
 * step's own words stay what Take hands on and what Drop is keyed by.
 */
export function stepSaid(next: string): string {
  let said = next.trim();
  const addressed = /^[A-Z][\p{L}'-]{1,30}:\s+(?=\p{Ll})/u.exec(said);
  if (addressed) said = said.slice(addressed[0].length);
  said = said.replace(/\b(?:the\s+)?(?:sealed\s+)?([a-z0-9]+(?:[-_][a-z0-9]+)+)\s+key\b/gu, (_m, label: string) => `the ${keyNamed(label)} key`);
  said = said.replace(/\bthe sealed\s+(\S+)\s+key\b/giu, 'the $1 key');
  return said.charAt(0).toUpperCase() + said.slice(1);
}
