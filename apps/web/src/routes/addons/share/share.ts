/**
 * What `/packs/share` draws that no other screen does: the words of its publish, its diff and its installer's view
 * (a unit's own `words` object), and the skills it offers, each once, by title.
 *
 * SKILLS BY TITLE, NEVER BY FOLDER NAME, AND EACH ONCE. A skill's `name` is the
 * folder it is written to, so "review-pr" is how the record keys it and not how a person reads it; and a project's skill
 * of the same name replaces the global one where it applies, so the list held "review-pr" twice. The file carries a
 * skill by its name, so one of each name is offered: the one that applies everywhere when there is one.
 *
 * PLAIN NODE LOADS THIS FILE: its one import is the renderer's, for how a handle is said.
 */

import { handleName } from 'braindog-render';

export const words = {
  /* THE PAGE'S SENTENCE (agents F27): what the file is, in the words a person uses for it, and what stays out. */
  what: 'Your plugins, pages and names in one file. Your entries stay out unless you pick them.',
  /* TWO STEPS, SINCE the screens scope of 24 October: name the file, then pick what goes in and send it. */
  about: '1. Name the file',
  send: '2. Pick what goes in, then send it',
  /* THE SKILLS WAIT BEHIND ONE LINE THAT COUNTS THEM: thirty-five rows of them made the page 3,206 tall. */
  skillsPicked: (picked: number, of: number): string => `Skills to include: ${picked} of ${of}`,
  skillsWhy: 'Each goes as its name and when to use it. Its text stays here.',
  /* THE WORDS THAT SUGGEST IT, the first few and how many more, never all forty in a paragraph. */
  signals: (said: readonly string[]): string =>
    said.length <= 2 ? `Include the words that suggest it: ${said.join(', ')}` : `Include the words that suggest it: ${said.slice(0, 2).join(', ')} and ${said.length - 2} more`,
  changesSince: (since: string): string => `What changed since ${since}`,
  sinceShared: (version: string): string => `${version}, as last shared`,
  sinceBuiltIn: (title: string): string => `${title} as BrainDog ships it`,
  sinceInstalled: (version: string): string => `${version}, as installed`,
  changesFirst: 'What goes out',
  firstAll: 'First version, so all of it is new.',
  noChanges: 'Nothing changed since then.',
  drafting: 'Writing the file…',
  unwritten: 'Could not write the file. Change any field to try again.',
  installer: 'As somebody installing it sees it',
} as const;

/** One skill as the share offers it: the row the file carries, its title, and when to use it. */
export type SkillOffer = { seq: number; title: string; trigger: string };

/** A skill's folder name in words, as every screen says it (`handleName`): "review-pr" reads "Review PR", "log-handoff" "Log handoff". */
export const skillTitle = (name: string): string => handleName(name);

/**
 * The skills a share offers, one per name, in the order the record lists them. A retired skill is left out, and of two
 * rows with one name the one with no project wins, since the file names a skill and not where it applies.
 */
export function skillsOnce(rows: readonly { seq: number | null; fields: Readonly<Record<string, unknown>> }[]): SkillOffer[] {
  const byName = new Map<string, { seq: number; trigger: string; global: boolean }>();
  for (const r of rows) {
    const name = r.fields.name;
    if (r.seq === null || typeof name !== 'string' || name.trim() === '' || r.fields.state === 'retired') continue;
    const global = r.fields.project === null || r.fields.project === undefined || r.fields.project === '';
    const had = byName.get(name);
    if (had && (had.global || !global)) continue;
    byName.set(name, { seq: r.seq, trigger: typeof r.fields.trigger === 'string' ? r.fields.trigger : '', global });
  }
  return [...byName].map(([name, s]) => ({ seq: s.seq, title: skillTitle(name), trigger: s.trigger }));
}
