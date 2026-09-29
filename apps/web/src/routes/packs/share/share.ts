/**
 * What `/packs/share` draws that no other screen does: the words of its publish, its diff and its installer's view
 * (a unit's own `words` object), and the skills it offers, each once, by title.
 *
 * SKILLS BY TITLE, NEVER BY FOLDER NAME, AND EACH ONCE. A skill's `name` is the
 * folder it is written to, so "review-pr" is how the record keys it and not how a person reads it; and a project's skill
 * of the same name replaces the global one where it applies, so the list held "review-pr" twice. The file carries a
 * skill by its name, so one of each name is offered: the one that applies everywhere when there is one.
 *
 * PLAIN NODE LOADS THIS FILE: no import.
 */

export const words = {
  /* THE FORM'S FIRST GROUP: what the file is called, its version, and what and who it is for. */
  about: 'The file',
  changesSince: (since: string): string => `What changed since ${since}`,
  sinceShared: (version: string): string => `${version}, as last shared`,
  sinceBuiltIn: (title: string): string => `${title} as BrainDog ships it`,
  sinceInstalled: (version: string): string => `${version}, as installed`,
  changesFirst: 'What goes out',
  firstAll: 'It is the first version, so everything in it is new.',
  noChanges: 'Nothing changed, so this would be the same file under a new version.',
  drafting: 'Reading the file',
  installer: 'As somebody installing it sees it',
} as const;

/** One skill as the share offers it: the row the file carries, its title, and when to use it. */
export type SkillOffer = { seq: number; title: string; trigger: string };

/** A skill's folder name in words: "review-pr" reads "Review pr". */
export const skillTitle = (name: string): string => {
  const said = name.replaceAll(/[-_]+/gu, ' ').trim();
  return said.charAt(0).toUpperCase() + said.slice(1);
};

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
