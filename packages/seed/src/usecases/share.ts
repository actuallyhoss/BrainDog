/**
 * The built-in use cases as the files they would be if somebody shared them, and what a card shows of one
 * (`loop/research-spark.md` S14, the browse screen).
 *
 * ONE INSTALL PATH FOR A BUILT-IN AND A SHARED FILE. The browse screen installs Student the way it installs a file from
 * somebody else: the file goes to the record's `planUseCase`, the owner reads the plan, and each pack goes in through
 * `installPack`. So a built-in is handed out as a file here, with its example days counted from today.
 *
 * A PREVIEW IS READ FROM THE DECLARATIONS, never drawn by hand: the rail is the pages' own `nav`, the lists are the
 * pack's registers under their labels, and Home is the headings of the use case's Home page, a heading that reads the
 * voice given as the voice key it reads, so the screen can say it in the house voice when the use case leaves it out.
 */

import type { UseCase, VoiceKey } from '@braindog/declare';

import { dated, dayOf } from './dates.ts';
import { listsOf, pagesOf, useCase } from './index.ts';
import { homePageOf } from './install.ts';
import { exampleLinks } from './links.ts';

type Body = Record<string, unknown>;

/**
 * THE HOUSE SETUP'S MODULES, for a use case that carries no pack and names none (Small business): what onboarding installs
 * for a business when the sentence names nothing in particular, less the agents pack, which is added when agents are
 * mentioned. Browse installs these, so the house setup is installed like the others rather than only switched to.
 */
export const HOUSE_MODULES: readonly string[] = ['portfolio', 'people', 'money-core', 'estate', 'work'];

/** The modules browse installs for a use case: its own, or the house setup's for one that carries nothing. */
export const modulesToInstall = (u: UseCase): readonly string[] => (u.pack === null && u.modules.length === 0 ? HOUSE_MODULES : u.modules);

/** A built-in use case as a shared file's document, its examples dated from `today`. `null` for an id that is not one. */
export function builtInFile(id: string, today: string = dayOf(Date.now())): Body | null {
  const u = useCase(id);
  if (!u) return null;
  /* ITS LINKS GO IN THE FILE, so a built-in use case is linked by the same declared path as one somebody shared. */
  const links = exampleLinks(id);
  return { ...u, modules: [...modulesToInstall(u)], pack: u.pack === null ? null : dated(u.pack, today), ...(links.length > 0 ? { links: [...links] } : {}) } as unknown as Body;
}

/** What a use case's detail page says it installs, read from the file: modules, lists, pages, example rows and skills. */
export type Installs = { modules: string[]; lists: string[]; pages: { title: string; section: string | null }[]; examples: number; skills: { name: string; trigger: string }[] };

export function installsOf(u: UseCase): Installs {
  const seeds = Array.isArray(u.pack?.seeds) ? (u.pack.seeds as unknown[]).length : 0;
  return {
    modules: [...modulesToInstall(u)],
    lists: listsOf(u).map((l) => u.labels[l.id] ?? l.name),
    pages: pagesOf(u).map((p) => ({ title: p.title, section: p.section })),
    examples: seeds,
    skills: u.skills.map((k) => ({ name: k.name, trigger: k.trigger })),
  };
}

export type Heading = { text: string } | { voice: VoiceKey; text: string | null };

export type Preview = {
  /** The rail a use case adds, by section, in its pages' order. */
  rail: { section: string; pages: string[] }[];
  /** Its own lists, by the name a person will read. */
  lists: string[];
  /** The headings of its Home, in order. Empty for a use case that keeps the house Home. */
  home: Heading[];
  /** What the rail's spine is called, where the voice renames it. */
  spine: Partial<Record<'home' | 'decide' | 'inbox' | 'lists', string>>;
};

const PLACEHOLDER = /^\{\{config:voice_([a-z_]+)\}\}$/u;

/** What a card shows of a use case: its rail, its lists, its Home, and the spine's names. */
export function previewOf(u: UseCase): Preview {
  const rail: Preview['rail'] = [];
  const orders = new Map<string, number>();
  for (const d of (u.pack?.declarations ?? []) as Body[]) {
    const nav = d.nav as { order?: unknown } | undefined;
    if (typeof d.page === 'string') orders.set(d.page, typeof nav?.order === 'number' ? nav.order : 0);
  }
  for (const p of [...pagesOf(u)].sort((a, b) => (orders.get(a.page) ?? 0) - (orders.get(b.page) ?? 0))) {
    if (p.section === null) continue;
    const at = rail.find((r) => r.section === p.section);
    if (at) at.pages.push(p.title);
    else rail.push({ section: p.section, pages: [p.title] });
  }
  const lists = listsOf(u).map((l) => u.labels[l.id] ?? l.name);
  const page = ((u.pack?.declarations ?? []) as Body[]).find((d) => d.page === homePageOf(u.usecase));
  const home: Heading[] = [];
  for (const block of Array.isArray(page?.blocks) ? (page.blocks as Body[]) : []) {
    if (typeof block.heading !== 'string') continue;
    const m = PLACEHOLDER.exec(block.heading);
    if (m) home.push({ voice: m[1] as VoiceKey, text: u.voice[m[1] as VoiceKey] ?? null });
    else home.push({ text: block.heading });
  }
  const spine: Preview['spine'] = {};
  for (const key of ['home', 'decide', 'inbox', 'lists'] as const) if (u.voice[key]) spine[key] = u.voice[key];
  return { rail, lists, home, spine };
}
