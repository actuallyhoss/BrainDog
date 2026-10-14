/**
 * The second mode of `/packs/share`: an add-on from what a person made. The record's `exportPack` offers its own
 * things with no `declarations` (`{ offered: [{ id, kind, title }] }`), and with the ticked ones writes the file and
 * says what it would add (`{ file, text, adds, brings: [{ id, why }] }`). This file reads both answers into what the
 * screen draws: the ticks by kind, the preview's lines and the file's name.
 *
 * NAMES, NEVER IDS. A thing is said by the title the record gives it. A thing the file brings that was not offered (a
 * script a ticked page runs) is said by its own title when the answer carries one, by its handle in words when that
 * reads as one, and otherwise as "one more thing it needs": a ULID is never put in front of a person.
 *
 * DECLARATIONS ONLY. The screen sends the ticked ids and a title, never `rows`: what a person keeps stays at home.
 *
 * PLAIN NODE LOADS THIS FILE: no import.
 */

export const words = {
  modeGroup: 'What to share',
  modeUseCase: 'The whole setup',
  modeAddon: 'An add-on from what you made',
  sentence: 'Tick what you made and download it as an add-on. It carries how each thing is set up, never what you keep in it.',
  cannot: 'This BrainDog cannot make an add-on yet.',
  nothing: 'Nothing of your own yet. Make a list, a page or an automation and it shows here.',
  reading: 'Reading what you made',
  picks: 'What goes in',
  title: 'What the add-on is called',
  preview: 'What it would add',
  previewNone: 'Tick something to see what it would add.',
  drafting: 'Writing the add-on',
  download: 'Download the add-on',
  downloaded: (file: string): string => `Saved as ${file}.`,
  untitledAddon: 'My add-on',
  needed: 'one more thing it needs',
} as const;

/** The groups the ticks are drawn in, in this order; a kind the record names that is not here goes last. */
export const KINDS = ['lists', 'pages', 'figures', 'automations'] as const;
export type Kind = (typeof KINDS)[number];

const KIND_WORDS: Record<Kind, { heading: string; one: string }> = {
  lists: { heading: 'Lists', one: 'the list' },
  pages: { heading: 'Pages', one: 'the page' },
  figures: { heading: 'Figures', one: 'the figure' },
  automations: { heading: 'Automations', one: 'the automation' },
};
const OTHER = { heading: 'Other things', one: '' };

/** The query that opens this mode, so the Add-ons screen's offer links straight to it. */
export const MODE_PARAM = 'mode';
export const ADDON_MODE = 'addon';
export const addonHref = `/packs/share?${MODE_PARAM}=${ADDON_MODE}`;
export type Mode = 'usecase' | 'addon';
export const modeOf = (search: URLSearchParams): Mode => (search.get(MODE_PARAM) === ADDON_MODE ? 'addon' : 'usecase');

/** One of the record's own things as it is offered. */
export type Offered = { id: string; kind: string; title: string };

/** `list` and `lists` are one group: the record may name a kind either way. */
export function kindOf(kind: string): Kind | null {
  const k = kind.trim().toLowerCase();
  const plural = k.endsWith('s') ? k : `${k}s`;
  return (KINDS as readonly string[]).includes(plural) ? (plural as Kind) : null;
}

const isMap = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** The record's offer, each id once, and nothing that has no name to be said by. */
export function offeredOf(value: unknown): Offered[] {
  const raw = isMap(value) && Array.isArray(value.offered) ? value.offered : [];
  const seen = new Set<string>();
  const out: Offered[] = [];
  for (const o of raw) {
    if (!isMap(o)) continue;
    const id = text(o.id);
    const title = text(o.title);
    if (id === '' || title === '' || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, kind: text(o.kind), title });
  }
  return out;
}

/** The offer in its groups, in `KINDS` order and the record's own order inside each; empty groups are left out. */
export function groupsOf(offered: readonly Offered[]): { kind: Kind | 'other'; heading: string; items: Offered[] }[] {
  const by = new Map<Kind | 'other', Offered[]>();
  for (const o of offered) {
    const k = kindOf(o.kind) ?? 'other';
    by.set(k, [...(by.get(k) ?? []), o]);
  }
  return [...KINDS, 'other' as const].flatMap((k) => {
    const items = by.get(k);
    return items ? [{ kind: k, heading: k === 'other' ? OTHER.heading : KIND_WORDS[k].heading, items }] : [];
  });
}

/** The ticked things as the record is asked for them: offered ids only, each once, in the offer's order. */
export function picked(offered: readonly Offered[], ticks: Iterable<string>): string[] {
  const on = new Set(ticks);
  return offered.filter((o) => on.has(o.id)).map((o) => o.id);
}

/** An add-on's id from its title: lower case words joined by hyphens, as a pack id is written. */
export function addonId(title: string): string {
  const id = title
    .normalize('NFKD')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, '-')
    .replaceAll(/^-+|-+$/gu, '')
    .slice(0, 40)
    .replace(/-+$/u, '');
  return id === '' ? 'my-add-on' : id;
}

/** The file an add-on is saved as: `<id>-<version>.pack.json`. */
export const fileName = (id: string, version = '1.0.0'): string => `${id}-${version}.pack.json`;

/** What the screen sends `exportPack`: the ticked ids and a title. Never rows. */
export function argsOf(offered: readonly Offered[], ticks: Iterable<string>, title: string, version = '1.0.0') {
  return { declarations: picked(offered, ticks), title: title.trim() || words.untitledAddon, version };
}

/** The record's answer once ticks are sent, or null when it is not one. */
export type Written = { file: string; text: string; adds: unknown[]; brings: { id: string; why: string; title?: string }[] };
export function writtenOf(value: unknown, fallbackFile: string): Written | null {
  if (!isMap(value) || typeof value.text !== 'string') return null;
  const brings = (Array.isArray(value.brings) ? value.brings : []).flatMap((b) =>
    isMap(b) && text(b.id) !== '' ? [{ id: text(b.id), why: text(b.why), ...(text(b.title) ? { title: text(b.title) } : {}) }] : [],
  );
  return { file: text(value.file) || fallbackFile, text: value.text, adds: Array.isArray(value.adds) ? value.adds : [], brings };
}

const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/iu;

/** A handle in words: "rent-reminder" reads "Rent reminder"; a ULID or a number is not a name, so null. */
function handleSaid(id: string): string | null {
  const tail = id.split(/[:/#]/u).pop() ?? '';
  if (tail === '' || ULID.test(tail) || /^\d+$/u.test(tail)) return null;
  const said = tail.replaceAll(/[-_.]+/gu, ' ').trim();
  return said === '' ? null : said.charAt(0).toUpperCase() + said.slice(1);
}

/** How one thing of the answer is said: its offered title, its own title, its handle in words, or "one more thing". */
function nameOf(id: string, offered: readonly Offered[], own?: string): string {
  return offered.find((o) => o.id === id)?.title ?? (own || handleSaid(id) || words.needed);
}

/** One line of the preview: what it says, and the reason under it for a thing brought along. */
export type Line = { text: string; detail?: string };

/**
 * The preview's lines: each thing it adds ("Adds the page Rent"), then each thing it brings because a ticked one needs
 * it ("Also brings Rent reminder", with the record's reason under it). A thing both added and brought is said once.
 */
export function previewLines(written: Pick<Written, 'adds' | 'brings'>, offered: readonly Offered[]): Line[] {
  const said = new Set<string>();
  const lines: Line[] = [];
  for (const a of written.adds) {
    const id = typeof a === 'string' ? a : isMap(a) ? text(a.id) : '';
    if (id === '' || said.has(id)) continue;
    said.add(id);
    const known = offered.find((o) => o.id === id);
    const kind = kindOf(known?.kind ?? (isMap(a) ? text(a.kind) : ''));
    const name = nameOf(id, offered, isMap(a) ? text(a.title) : undefined);
    lines.push({ text: kind ? `Adds ${KIND_WORDS[kind].one} ${name}` : `Adds ${name}` });
  }
  for (const b of written.brings) {
    if (said.has(b.id)) continue;
    said.add(b.id);
    lines.push({ text: `Also brings ${nameOf(b.id, offered, b.title)}`, ...(b.why ? { detail: b.why } : {}) });
  }
  return lines;
}

/** A host with no `exportPack` (an older one, or one built over a record without it) says one quiet line. */
export function quietOf(refusal: { code: string } | null | undefined): string | null {
  return refusal && (refusal.code === 'ROUTE_UNKNOWN' || refusal.code === 'NOT_IN_THIS_BUILD') ? words.cannot : null;
}
