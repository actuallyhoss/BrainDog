/**
 * When a changed setting takes hold, as an add-on's settings page says it under each setting: "Takes effect now." or
 * "Takes effect when Kiln next updates.".
 *
 * WORKED OUT FROM THE ADD-ON'S OWN FILE, never typed per setting. A setting the file fills into a declaration
 * (`{{config:<key>}}`) is stored as it was filled, so a new value waits for the next install or update; any other is
 * read when it is drawn, a figure's `target: { setting }` among them, so a new value takes hold at once. The rule is
 * `takesHold` in `@braindog/declare` (`takes-hold.ts`), read through the same `configReads` the plan fills with, so
 * this screen and the plan cannot disagree about which holes there are.
 *
 * Out of the component so `node --test` can run it, since a Svelte page does not mount there.
 */

import { configReads } from '@braindog/kernel';

/** `now` when a new value is read at once; `next-update` when it is filled in at the next install or update. */
export type TakesHold = 'now' | 'next-update';

/**
 * Each of `keys` with when a change to it takes hold, over the add-on's declarations as its file writes them (a raw
 * file's objects or a read pack's bodies: the reader walks either). A key nothing fills takes hold now.
 */
export function answersIn(declarations: readonly unknown[], keys: readonly string[]): Record<string, TakesHold> {
  const filled = new Set(declarations.flatMap((d) => configReads(d).map((read) => read.key)));
  return Object.fromEntries(keys.map((key) => [key, filled.has(key) ? 'next-update' : 'now'] as const));
}

/** The line under one setting, naming the add-on by its title. */
export const takesHoldSaid = (answer: TakesHold, title: string): string =>
  answer === 'now' ? 'Takes effect now.' : `Takes effect when ${title} next updates.`;

/** Names in a sentence: "Heading", "Heading and Shade", "Heading, Shade and Target". */
const joined = (names: readonly string[]): string =>
  names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

/**
 * WHEN THE SETTINGS TAKE HOLD, SAID ONCE AT THE FOOT: the line under every setting was the same line fourteen
 * times on the Money add-on. Only the ones that wait are named. `null` when nothing is known yet or nothing is set.
 */
export function holdsFoot(holds: Readonly<Record<string, TakesHold>> | null, names: Readonly<Record<string, string>>, title: string): string | null {
  if (holds === null) return null;
  const keys = Object.keys(holds);
  if (keys.length === 0) return null;
  const waiting = keys.filter((k) => holds[k] === 'next-update');
  if (waiting.length === 0) return 'Each setting takes effect as soon as it is saved.';
  if (waiting.length === keys.length) return `Each setting takes effect when ${title} next updates.`;
  const said = joined(waiting.map((k) => names[k] ?? k));
  return `Each setting takes effect as soon as it is saved, but ${said} ${waiting.length === 1 ? 'waits' : 'wait'} until ${title} next updates.`;
}

/**
 * The toast after a save: what was saved, then, when any of it waits, when it takes hold. Settings that take hold now
 * add nothing, since the screen already shows them changed.
 */
export function savedSaid(saved: string, changed: readonly { name: string; answer: TakesHold | undefined }[], title: string): string {
  const waiting = changed.filter((c) => c.answer === 'next-update').map((c) => c.name);
  if (waiting.length === 0) return saved;
  if (waiting.length === changed.length) return `${saved} ${takesHoldSaid('next-update', title)}`;
  return `${saved} ${joined(waiting)} ${waiting.length === 1 ? 'takes' : 'take'} effect when ${title} next updates.`;
}

/**
 * The declarations of the add-on `id` as its file writes them, or `null` when the file cannot be read.
 *
 * WHICH FILE: BrainDog's own modules and use cases are in this build, so they are read from it; anybody else's add-on is
 * read from the catalogue at the version the record holds, as the page reads what waits (`waiting.ts`). EVERY PART IS
 * LOADED WHEN ASKED, so none of it joins what the page loads first.
 */
export async function declarationsOf(id: string, version: string | null, firstParty: boolean): Promise<unknown[] | null> {
  const listed = (doc: Record<string, unknown> | null): unknown[] | null => (doc && Array.isArray(doc.declarations) ? doc.declarations : null);
  if (id.startsWith('usecase-')) {
    const { useCaseDocument } = await import('@braindog/seed/usecases');
    return listed(useCaseDocument(id.slice('usecase-'.length)));
  }
  if (firstParty) {
    const { packDocument } = await import('../../../lib/record/packs.ts');
    return listed(await packDocument(id));
  }
  if (version === null) return null;
  const { kennelFetch, publishedText } = await import('../../../lib/market/publish.ts');
  const text = await publishedText(kennelFetch, 'pack', id, version);
  if (text === null) return null;
  const { readPackFile } = await import('@braindog/declare/catalogue');
  const file = await readPackFile(text);
  return file.ok ? file.value.pack.declarations.map((d) => d.body) : null;
}
