/**
 * The "say it as a sentence" box on the Automations tab: its words, and the change that Keep it files.
 *
 * NOTHING HERE RUNS ANYTHING. The record reads the sentence (`automationSentence`) and the person presses Keep it, which is
 * the same change the canvas files on Save, so a sentence is another way to draw an automation and not another way to
 * start one.
 */

import { words as flowWords } from '../../lib/flow/flow.ts';
import type { Proposal, Sentenced, SentencePart, TriggerOption } from '../../lib/flow/source.ts';

export const sentenceWords = {
  label: 'Say it as a sentence',
  /* THE EXAMPLE WHEN THE RECORD'S OWN LISTS SAY NONE (`exampleOf`): it reads on a record with Bills and invoices. */
  placeholder: 'When a bill is due in 3 days, tell me',
  read: 'Read it',
  reading: 'Reading',
  asRead: 'This is what I read',
  keep: 'Keep it',
  keeping: 'Keeping',
  again: 'Change it',
  byModel: 'Written by the model from your words. Check it reads right.',
  kept: 'Kept. It runs from now on.',
  filed: 'Sent to Needs you. It runs once you accept it there.',
  hint: (example: string) => `For example: ${example}.`,
  noLook: 'I could not look this one back over your rows.',
  steps: 'Steps, in order',
  stepsHint: 'Drag a step, or press Alt with the up and down arrows, to move it.',
  move: (n: number) => `Move step ${n}`,
  remove: (n: number) => `Remove step ${n}`,
  add: 'Add a step',
  pick: (what: string) => `Change ${what}`,
  rereading: 'Reading it again',
} as const;

/** The change that keeps what was read: the rule as a new declaration, under the id the record chose. */
export function keepOf(read: Sentenced): Proposal {
  const id = `rule.${read.rule}`;
  return {
    question: flowWords.proposeNew(read.said),
    body_kind: 'change',
    body: { declaration_id: id, to: { id, kind: 'rule', body: read.body }, from_version: 0 },
  };
}

/** What is shown under the sentence: the look over the last days, then anything it cannot do, then who wrote it. */
export function underSentence(read: Sentenced): string[] {
  return [read.looked?.line ?? sentenceWords.noLook, ...read.notes, ...(read.by === 'model' ? [sentenceWords.byModel] : [])];
}

const JOINS = new Set(['and', 'or', 'of', 'the', 'a', 'an', 'to', 'for', 'in', 'on', '&']);
/** A word as one of it: "bills" is "bill", "categories" is "category", as the record's reader folds a noun. */
const oneOf = (word: string): string => {
  const w = word.toLowerCase();
  if (/ies$/u.test(w)) return `${w.slice(0, -3)}y`;
  if (/(?:s|x|ch|sh)es$/u.test(w)) return w.slice(0, -2);
  if (/[^s]s$/u.test(w)) return w.slice(0, -1);
  return w;
};

/**
 * THE BOX'S EXAMPLE, FROM THIS RECORD'S OWN LISTS (agents F3): the first list with a due date, by the first word of its
 * name, "When a bill is due in 3 days, tell me" for Bills and invoices. The record's reader finds a list by any word of
 * its name, so the example it shows is one it reads. With no such list, the house example.
 */
export function exampleOf(lists: readonly { name: string; fields?: readonly { id: string; type?: string | undefined; deadline?: boolean | undefined }[] | undefined }[]): string {
  for (const l of lists) {
    const due = (l.fields ?? []).some((f) => f.type === 'day' && (f.id === 'due' || f.deadline === true));
    const word = l.name.split(/[\s,/]+/u).find((w) => w !== '' && !JOINS.has(w.toLowerCase()));
    if (!due || word === undefined) continue;
    const noun = oneOf(word);
    return `When ${/^[aeiou]/u.test(noun) ? 'an' : 'a'} ${noun} is due in 3 days, tell me`;
  }
  return sentenceWords.placeholder;
}

/** Whether the box has anything to read yet. */
export const askable = (text: string): boolean => text.trim().length > 0;

/* ── the sentence in pieces you can press ──────────────────────────── */

/** The sentence the pieces make, for the record to read again. No full stop: the reader takes it off. */
export const composeSentence = (trigger: readonly string[], actions: readonly string[]): string => `When ${trigger.join('')}, ${actions.join(' and ')}`;

/** The trigger's texts once an option is picked: each piece it names takes the option's words. */
export function applyOption(trigger: readonly SentencePart[], option: TriggerOption): string[] {
  const set = new Map(Object.entries(option.set).map(([at, text]) => [Number(at), text] as const));
  return trigger.map((p, at) => set.get(at) ?? p.text);
}

/** Whether an option would change nothing, so the picker can mark it as the one in force. */
export const isCurrent = (trigger: readonly SentencePart[], option: TriggerOption): boolean => applyOption(trigger, option).join('') === trigger.map((p) => p.text).join('');

/** The steps with the one at `from` moved to `to`, or the same steps when either is out of range. */
export function moveStep<T>(steps: readonly T[], from: number, to: number): T[] {
  const out = [...steps];
  if (from === to || from < 0 || to < 0 || from >= out.length || to >= out.length) return out;
  out.splice(to, 0, out.splice(from, 1)[0]!);
  return out;
}

/** The steps without the one at `at`; the last step is never taken, since an automation with none does nothing. */
export const dropStep = <T>(steps: readonly T[], at: number): T[] => (steps.length <= 1 ? [...steps] : steps.filter((_, i) => i !== at));

/** The steps with one more at the end, unless that step is already there. */
export const addStep = (steps: readonly string[], text: string): string[] => (steps.includes(text) ? [...steps] : [...steps, text]);

/** The steps with the one at `at` replaced. */
export const swapStep = (steps: readonly string[], at: number, text: string): string[] => steps.map((s, i) => (i === at ? text : s));

/** Where Alt with an arrow key moves a step, or `null` for any other key. */
export function keyMove(key: string, alt: boolean, at: number, of: number): number | null {
  if (!alt) return null;
  if (key === 'ArrowUp') return Math.max(0, at - 1);
  if (key === 'ArrowDown') return Math.min(of - 1, at + 1);
  return null;
}
