/**
 * The "say it as a sentence" box on the Automations tab: its words, and the change that Keep it files.
 *
 * NOTHING HERE RUNS ANYTHING. The record reads the sentence (`automationSentence`) and the person presses Keep it, which is
 * the same change the canvas files on Save, so a sentence is another way to draw an automation and not another way to
 * start one.
 */

import { words as flowWords } from '$lib/flow/flow.ts';
import type { Proposal, Sentenced } from '$lib/flow/source.ts';

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
