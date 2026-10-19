/**
 * The "say it as a sentence" box on the Automations tab: its words, and the change that Keep it files.
 *
 * NOTHING HERE RUNS ANYTHING. The record reads the sentence (`automationSentence`) and the person presses Keep it, which is
 * the same change the canvas files on Save, so a sentence is another way to draw an automation and not another way to
 * start one.
 */

import { words as flowWords } from '$lib/flow/flow.ts';
import type { Proposal, Sentenced, SentencePart, TriggerOption } from '$lib/flow/source.ts';

export const sentenceWords = {
  label: 'Say it as a sentence',
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
  hint: 'For example: When a bill is due in 3 days, tell me.',
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
