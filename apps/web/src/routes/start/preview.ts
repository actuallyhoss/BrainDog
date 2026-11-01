/**
 * What the first run's preview says the BrainDog will be, read from the declarations it would install and never drawn by
 * hand: its pages, its Home, what each module keeps, whether it has due dates to remind about, and where Money keeps its
 * currency.
 *
 * NOTHING HERE WRITES. What is asked of the record from here is its `previewChange`, which runs inside a rehearsal and
 * keeps nothing, and every page the proposal makes is drawn by it, not Home alone.
 *
 * NOTHING IS DRAWN THAT NOBODY TYPED. A page is drawn over the person's own name, the entries their sentence
 * filled and the first entries of the files they brought (`ownRows`), and a page none of those reach is its name and one
 * line of what it will hold (`pageShown`). No example, and no sample row Slash drafted, is ever drawn as theirs.
 */

import { useCase, type UseCase } from '@braindog/seed/usecases';
import { carriedDocument, homePageOf, moduleDocument } from '@braindog/seed/usecases/install';
import { previewOf } from '@braindog/seed/usecases/share';

import { PEOPLE } from '../../lib/who.ts';

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

/** The ceilings `previewChange` holds a call to: declarations, rows a list, rows in all. */
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


/** One call to `previewChange`: the declarations it rehearses and the person's own rows it draws them over, by list. */
export type Asked = { to: { declarations: Decl[] }; rows: Record<string, Body[]> };

/** A page the proposal makes, with the lists it reads by declaration id. */
type Made = { decl: Decl; needs: string[] };

/**
 * WHAT TO ASK THE RECORD TO DRAW EVERY PAGE THE PROPOSAL MAKES, in as few calls as the method's ceilings allow, and
 * over no rows: the use cases' and the modules' examples are never asked for, so a call carries only the lists and pages,
 * and the person's own rows are laid over it where it is drawn (`withOwn`).
 *
 * ONLY LISTS AND PAGES ARE ASKED FOR. A rule or an automation draws nothing, and every declaration it would take is one
 * a page cannot. A page goes into a call with the lists it reads, and a new call is opened when the next page and its
 * lists would pass `DECLARATIONS_MOST`, so a use case with many pages is drawn in several calls rather than not at all.
 * A page that reads a list nothing here declares is left out of the drawing: the record would refuse the whole call for
 * it, and the pages above still say it is made.
 *
 * A PAGE PER ENTRY IS NOT DRAWN (`for`), as the rail leaves it out: it appears with the entries it is about.
 */
export function changesAsked(cases: readonly UseCase[], modules: readonly string[], today: string): Asked[] {
  const lists = new Map<string, Decl>();
  const made: Made[] = [];
  const speaks = cases[0] ?? null;

  const take = (doc: Body | null, home: string | null) => {
    for (const d of bodies(doc?.declarations)) {
      const one = declOf(d);
      if (one === null) continue;
      if (one.kind === 'register') {
        if (!lists.has(one.id)) lists.set(one.id, one);
        continue;
      }
      if (one.kind !== 'page' || d.for !== undefined || made.some((m) => m.decl.id === one.id)) continue;
      const nav = isMap(d.nav) ? d.nav : null;
      if (typeof nav?.section !== 'string' && d.page !== home) continue;
      const needs = Array.isArray(d.requires) ? d.requires.filter((r): r is string => typeof r === 'string' && r.startsWith('register.')) : [];
      const body = speaks
        ? { ...d, title: voiced(speaks, d.title), blocks: bodies(d.blocks).map((b) => ({ ...b, heading: voiced(speaks, b.heading), empty: voiced(speaks, b.empty) })) }
        : d;
      made.push({ decl: { ...one, body }, needs });
    }
  };

  /* THE USE CASES' OWN PAGES FIRST, then each module's, so a page both declare is drawn as the use case words it. */
  for (const u of cases) take(carriedDocument(u, today, null), homePageOf(u.usecase));
  for (const id of modules) take(moduleDocument(cases.find((u) => u.modules.includes(id)) ?? null, id, { today }), null);

  const calls: { ids: Set<string>; decls: Decl[] }[] = [];
  for (const m of made) {
    if (m.needs.some((n) => !lists.has(n))) continue;
    const last = calls.at(-1);
    const fresh = last ? m.needs.filter((n) => !last.ids.has(n)) : m.needs;
    const into = last && last.ids.size + fresh.length + 1 <= DECLARATIONS_MOST ? last : null;
    if (!into && m.needs.length + 1 > DECLARATIONS_MOST) continue;
    const call = into ?? { ids: new Set<string>(), decls: [] };
    if (!into) calls.push(call);
    for (const n of into ? fresh : m.needs) {
      const list = lists.get(n);
      if (list) {
        call.ids.add(n);
        call.decls.push(list);
      }
    }
    call.ids.add(m.decl.id);
    call.decls.push(m.decl);
  }

  return calls.map((call) => ({ to: { declarations: call.decls }, rows: {} }));
}

/**
 * What Slash drafted for a business outside the catalogue, as one call to `previewChange`: its lists and pages, and never
 * its sample rows, which nobody typed.
 */
export const draftAsked = (draft: { change: { to: unknown } }): Body => ({ to: draft.change.to });

/** An entry as the person gave it: the list it goes into and what fills it. */
export type Own = { register: string; fields: Body };


/**
 * THE ROWS A PREVIEW PAGE DRAWS, AND NO OTHERS: the person's name as their own entry in People, the entries their
 * sentence filled, then the first entries of each file they brought as it maps them, by list, within the ceilings
 * `previewChange` holds a call to. An entry with nothing in it is no entry. Nothing answered here is a row nobody typed.
 */
export function ownRows(typed: readonly Own[], mapped: Readonly<Record<string, readonly Body[]>>, name: string | null): Record<string, Body[]> {
  const out: Record<string, Body[]> = {};
  let total = 0;
  const put = (list: string, fields: Body) => {
    if (list === '' || Object.keys(fields).length === 0 || total >= ROWS_MOST) return;
    const at = (out[list] ??= []);
    if (at.length >= ROWS_A_LIST) return;
    at.push(fields);
    total += 1;
  };
  const me = name?.trim() ?? '';
  if (me !== '' && !typed.some((t) => t.register === PEOPLE && t.fields.name === me)) put(PEOPLE, { name: me });
  for (const t of typed) put(t.register, t.fields);
  for (const [list, rows] of Object.entries(mapped)) for (const r of rows) put(list, r);
  return out;
}

/** The lists a call declares, by id, as `register.<id>` names them. */
const listsIn = (call: Body): Map<string, Body> => {
  const to = isMap(call.to) ? call.to : {};
  const out = new Map<string, Body>();
  for (const d of bodies(to.declarations)) {
    const body = isMap(d.body) ? d.body : d;
    if (typeof body.register === 'string') out.set(body.register, body);
  }
  return out;
};

/** The rows the calls already carry, by list: once examples are never asked, only a file's own mapped entries. */
export function mappedOf(asked: readonly Body[]): Record<string, Body[]> {
  const out: Record<string, Body[]> = {};
  for (const a of asked) for (const [list, rows] of Object.entries(isMap(a.rows) ? a.rows : {})) (out[list] ??= []).push(...bodies(rows));
  return out;
}

/** Each call with its rows replaced by the person's own, for the lists it declares, and only those. */
export function withOwn(asked: readonly Body[], own: Readonly<Record<string, readonly Body[]>>): Body[] {
  return asked.map((a) => {
    const rows: Record<string, Body[]> = {};
    for (const list of listsIn(a).keys()) if ((own[list]?.length ?? 0) > 0) rows[list] = [...(own[list] ?? [])];
    return { ...a, rows };
  });
}

/** The lists one page of a call reads, in the order its `requires` names them. */
export function readsOf(call: Body, slug: string): Body[] {
  const to = isMap(call.to) ? call.to : {};
  const page = bodies(to.declarations).map((d) => (isMap(d.body) ? d.body : d)).find((d) => d.page === slug);
  const lists = listsIn(call);
  const needs: unknown[] = Array.isArray(page?.requires) ? page.requires : [];
  return needs.flatMap((n): Body[] => {
    const list = typeof n === 'string' && n.startsWith('register.') ? lists.get(n.slice('register.'.length)) : undefined;
    return list ? [list] : [];
  });
}

/** How a page is shown: drawn over the person's own rows, or its name and one line of what it will hold. */
export type Shown = { drawn: true; title: string; rows: Record<string, Body[]> } | { drawn: false; title: string; line: string };

/**
 * A PAGE IS DRAWN ONLY OVER WHAT THE PERSON GAVE IT. Where none of their rows reaches a list it reads, it is its name and
 * one line of what it will hold, in the list's own words for that (`holds`), and never a page of invented entries.
 */
export function pageShown(title: string, reads: readonly Body[], own: Readonly<Record<string, readonly Body[]>>): Shown {
  const rows: Record<string, Body[]> = {};
  for (const l of reads) {
    const list = typeof l.register === 'string' ? l.register : '';
    if ((own[list]?.length ?? 0) > 0) rows[list] = [...(own[list] ?? [])];
  }
  if (Object.keys(rows).length > 0) return { drawn: true, title, rows };
  const holds = reads.map((l) => l.holds).find((h): h is string => typeof h === 'string' && h.trim() !== '');
  return { drawn: false, title, line: holds ? words.holds(holds.trim()) : words.holdsNothingYet };
}

/** The words this preview adds to the first run's own (`lib/first-run.ts`). */
export const words = {
  /** Said while Slash drafts lists and pages for a business no use case fits. */
  drafting: 'Slash is drafting lists and pages made for this.',
  /** Over what Slash drafted, before the question it would put on Decide. */
  drafted: 'Made for what you said',
  /** A drafted change that could not be made, as the list of what was not made says it. */
  notDrafted: 'The lists and pages Slash drafted were not made.',
  /** A drafted change filed on Decide and not kept, for somebody who may not decide there. */
  draftWaits: 'The lists and pages Slash drafted are waiting in Needs you.',
  /** The button a page's card is, for a screen reader. */
  openPage: (title: string) => `Open ${title} as it would look`,
  /** The button that closes a page opened from its card. */
  closePage: 'Close this page',
  /** Under a page's title on its card, where it has no section of its own. */
  home: 'Today',
  /** Under a page none of the person's entries reaches: what it will hold, in its list's own words. */
  holds: (what: string) => `It will hold ${what}.`,
  /** The same, for a page that reads no list. */
  holdsNothingYet: 'Empty until you add to it.',
  /** Over a page opened from its card: what it is drawn with. */
  yours: 'Drawn with only what you gave it. Nothing is kept until you keep it.',
  /** Under the first pages, the door to the rest. */
  morePages: (n: number) => `${n} more ${n === 1 ? 'page' : 'pages'}`,
  /** Where the record cannot draw the pages: the rail above still says what is made. */
  undrawn: 'These pages could not be drawn here. They are made as shown above.',
} as const;
