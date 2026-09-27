/**
 * What the first run's preview says the BrainDog will be, read from the declarations it would install and never drawn by
 * hand: its pages, its Home, what each module keeps, whether it has due dates to remind about, and where Money keeps its
 * currency (`loop/finish/modules.md` MOD-6).
 *
 * NOTHING HERE WRITES. A preview may draw examples; nothing writes them (C11). The one call made from here is the
 * record's `previewChange`, which runs inside a rehearsal and keeps nothing (`loop/finish/contracts.md` §2.4).
 */

import { useCase, type UseCase } from '@braindog/seed/usecases';
import { homePageOf, moduleDocument } from '@braindog/seed/usecases/install';
import { builtInFile, previewOf } from '@braindog/seed/usecases/share';

type Body = Record<string, unknown>;

const isMap = (v: unknown): v is Body => typeof v === 'object' && v !== null && !Array.isArray(v);
const bodies = (v: unknown): Body[] => (Array.isArray(v) ? v.filter(isMap) : []);

/** A use case by id, or `null`. */
export const caseOf = (id: string | null): UseCase | null => (id === null ? null : (useCase(id) ?? null));

/**
 * A module as the first run would install it, with no rows, so no day in it is counted from today and the epoch will
 * do for the one argument that says which.
 */
const moduleBody = (id: string): Body | null => moduleDocument(null, id, { today: '1970-01-01' });

/** A module's declarations as the first run would install it. */
const moduleDeclarations = (id: string): Body[] => bodies(moduleBody(id)?.declarations);

/** One section of the rail and the pages under it. */
type Rail = { section: string; pages: string[] }[];

/**
 * THE PAGES A MODULE ADDS TO THE SIDE OF THE SCREEN, read as `previewOf` reads a use case's: a page with a section, in
 * its declared order, and never a page per entry, which appears with the entries it is about.
 */
function moduleRail(id: string): Rail {
  const pages: { section: string; title: string; order: number }[] = [];
  for (const d of moduleDeclarations(id)) {
    const nav: Body = isMap(d.nav) ? d.nav : {};
    const { page, title } = d;
    const { section, order } = nav;
    if (typeof page !== 'string' || d.for !== undefined || typeof section !== 'string') continue;
    pages.push({ section, title: typeof title === 'string' ? title : page, order: typeof order === 'number' ? order : 0 });
  }
  const out: Rail = [];
  for (const p of pages.sort((a, b) => a.order - b.order)) {
    const at = out.find((o) => o.section === p.section);
    if (at) at.pages.push(p.title);
    else out.push({ section: p.section, pages: [p.title] });
  }
  return out;
}

/**
 * The pages the BrainDog will have on the side of the screen, by section: the use cases' own first, then each module's
 * kept, so a proposal with no use case (the modules turned on by hand) still shows the rail it will make.
 */
export function pagesOf(cases: readonly UseCase[], modules: readonly string[]): Rail {
  const out: Rail = [];
  for (const r of [...cases.flatMap((u) => previewOf(u).rail), ...modules.flatMap(moduleRail)]) {
    const at = out.find((o) => o.section === r.section);
    if (at) at.pages.push(...r.pages.filter((p) => !at.pages.includes(p)));
    else out.push({ section: r.section, pages: [...r.pages] });
  }
  return out;
}

/** The headings of a use case's Home, in the words its voice gives them. Empty for one that keeps the house Home. */
export const homeHeadings = (u: UseCase): string[] => previewOf(u).home.flatMap((h) => (h.text === null ? [] : [h.text]));

/**
 * WHETHER WHAT IT KEEPS HAS DUE DATES THAT RING: a field declared with `remind` in the use case's lists or in a module
 * kept. The reminder offer is drawn only then, because a phone told to ring for nothing is a permission asked for nothing.
 */
export function reminds(cases: readonly UseCase[], modules: readonly string[]): boolean {
  const decls = [...cases.flatMap((u) => bodies(u.pack?.declarations)), ...modules.flatMap(moduleDeclarations)];
  return decls.some((d) => bodies(d.fields).some((f) => Array.isArray(f.remind) && f.remind.length > 0));
}

/** Whether a module keeps the record's currency: its settings declare `home_currency`. */
export function keepsCurrency(id: string): boolean {
  const config = moduleBody(id)?.config;
  return isMap(config) && isMap(config.home_currency);
}

/** Every currency the browser knows, each with the name a person reads in their own language. */
export function currencies(locale: string): { code: string; name: string }[] {
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames([locale], { type: 'currency' });
  } catch {
    names = null;
  }
  return Intl.supportedValuesOf('currency').map((code) => ({ code, name: names?.of(code) ?? code }));
}

/** The ceilings `previewChange` holds a call to (`loop/finish/contracts.md` §2.4): declarations, rows a list, rows in all. */
const DECLARATIONS_MOST = 12;
const ROWS_A_LIST = 20;
const ROWS_MOST = 100;

/** A declaration as `previewChange` takes it: its kind and name as one id, and its body. */
type Decl = { id: string; kind: string; body: Body };

/**
 * THE KIND IS THE DECLARATION'S FIRST KEY, as the pack reader takes it (`@braindog/declare` `normalisePack`): a rule
 * names the list it is about, so `{ rule: 'chase', register: 'bills' }` is a rule, and only the order says so.
 */
function declOf(d: Body): Decl | null {
  const kind = Object.keys(d)[0];
  const name = kind === undefined ? undefined : d[kind];
  return kind !== undefined && typeof name === 'string' ? { id: `${kind}.${name}`, kind, body: d } : null;
}

/**
 * A heading that reads the voice, in the voice's own words, so a rehearsal with no settings draws what a person reads.
 * The key is the heading's own text, so it is looked up with `Object.hasOwn`: `voice_constructor` finds nothing.
 */
const voiced = (u: UseCase, text: unknown): unknown =>
  typeof text === 'string'
    ? text.replace(/\{\{config:voice_([a-z_]+)\}\}/gu, (all, key: string) => (Object.hasOwn(u.voice, key) ? (u.voice as Record<string, string | undefined>)[key] : undefined) ?? all)
    : text;

/**
 * What to ask the record to draw a use case's Home with its examples, or `null` when it cannot be asked in one call: a
 * Home that reads a module's list, or more declarations than the call takes. The screen then says the Home's headings.
 */
export function homeAsked(u: UseCase, today: string): { to: { declarations: Decl[] }; rows: Record<string, Body[]> } | null {
  const shipped = builtInFile(u.usecase, today)?.pack;
  const pack = isMap(shipped) ? shipped : null;
  if (!pack) return null;
  const decls = bodies(pack.declarations);
  const home = decls.find((d) => d.page === homePageOf(u.usecase));
  if (!home) return null;
  const lists = decls.filter((d) => typeof d.register === 'string' && d.page === undefined && d.rule === undefined);
  const own = new Set(lists.map((d) => `register.${String(d.register)}`));
  const needs = Array.isArray(home.requires) ? home.requires.filter((r): r is string => typeof r === 'string') : [];
  if (needs.some((r) => !own.has(r))) return null;
  const page = { ...home, blocks: bodies(home.blocks).map((b) => ({ ...b, heading: voiced(u, b.heading), empty: voiced(u, b.empty) })) };
  const declarations = [...lists, page].flatMap((d) => declOf(d) ?? []);
  if (declarations.length > DECLARATIONS_MOST) return null;
  const rows: Record<string, Body[]> = {};
  let total = 0;
  for (const seed of bodies(pack.seeds)) {
    const list = String(seed.register ?? '');
    const fields = isMap(seed.fields) ? seed.fields : null;
    if (!fields || total >= ROWS_MOST || (rows[list]?.length ?? 0) >= ROWS_A_LIST) continue;
    (rows[list] ??= []).push(fields);
    total += 1;
  }
  return { to: { declarations }, rows };
}
