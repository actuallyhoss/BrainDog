/**
 * Settings as a place, DECLARED: every area this build draws, the index as a page body the one reader draws, and how
 * a declared index is read back into the groups the chooser beside an open area draws.
 *
 * THE INDEX IS A PAGE LIKE ANY OTHER ("every page is declared"). It was a hand-written list of rows in
 * `+page.svelte`, the same for everybody and changed by nobody. It is `SETTINGS_INDEX` now: one `link` block for each
 * group, each area a row written out (its name, its address and its one line), drawn by `PageView`. A record that
 * holds a page called `settings` is read in its place, so a person reorders the groups, moves an area from one to
 * another, renames one or leaves one out by arranging that page, and an agent proposes the same change as any other
 * page change. Nothing about it is anybody's own record (§27): every record starts from this body.
 *
 * LEFT OUT IS NOT GONE. An area the index does not list still opens at its address, so a link somebody shares still
 * lands and Delete is never lost with its row.
 *
 * ADDRESSES, NOT IDS, ARE WRITTEN HERE: an area's id is its address less `/settings/`, so the rows a person edits are
 * the links they read, and two of the ids (`people`, `agents`) are spelled like lists the web may not name in a string.
 *
 * PLAIN TYPESCRIPT, SO A TEST CAN LOAD IT IN NODE.
 */

import type { IconName } from '../../../lib/ui/icons.ts';
import type { PageBlock } from '../../../lib/record/schema.ts';

/** The page a record declares to reshape its Settings index. */
export const SETTINGS_PAGE = 'settings';

/** Where every area lives; an area's id is what follows. */
export const AREA_AT = '/settings/';

/** One area, as the index and the chooser beside an open area draw it. */
export type Area = {
  readonly id: string;
  readonly label: string;
  readonly icon: IconName;
  /** One line saying what the area holds, drawn on the index and never beside an open area. */
  readonly line: string;
};

/** One group of the index: its heading, its icon, and its areas in the order drawn. */
export type AreaGroup = { readonly title: string; readonly icon: IconName; readonly areas: readonly Area[] };

const area = (address: string, label: string, icon: IconName, line: string): Area => ({ id: address.slice(AREA_AT.length), label, icon, line });

/**
 * THE AREAS, AND THE GROUPS THEY START IN. A unit adding an area writes its row here, and its arm in `+page.svelte`.
 *
 * THE LINE IS WHAT A PERSON SCANNING THE INDEX READS to find the area, so it names what is there and never how it
 * works, and it stays short enough to be read on a phone whole.
 *
 * WHAT A PERSON CHANGES FOR THEMSELVES COMES FIRST, and what changes the record for everybody last, so the one
 * irreversible act (deleting the record) is the last row of the last group rather than a neighbour of the colour
 * scheme.
 */
export const DEFAULT_GROUPS: readonly AreaGroup[] = [
  /* FIVE ON TOP, SINCE BATCH 6 (call 6): what a person changes for themselves and reaches for. Appearance holds the theme,
     the density and the accent; Navigation the phone bar and the order; Words what the lists are called; Notifications
     when BrainDog interrupts; Agents the machines that work here. Sixteen areas stood in four groups before, against the
     five agreed. */
  {
    title: 'You',
    icon: 'sliders-horizontal',
    areas: [
      area('/settings/appearance', 'Appearance', 'sun', 'Theme, text size, density and accent'),
      area('/settings/navigation', 'Navigation', 'rows', 'The phone bar, its order and hidden pages'),
      area('/settings/words', 'Words and money', 'tag', 'What your lists are called, and your currency'),
      area('/settings/notifications', 'Notifications', 'bell', 'When BrainDog interrupts you'),
      area('/settings/agents', 'Agents', 'session', 'Machines and agents that work here'),
    ],
  },
  /* THE REST UNDER MORE, SEVEN SINCE THE UI PASS OF 20 OCTOBER (agents F14) less Delete: signing in (who you are, passkeys, where you
     are signed in and the records you can open, which were three half-empty areas), sharing, what comes in, the keys, and what
     the record keeps and costs. Pages is Navigation's now: the phone bar, the order and every page. Eight since Health
     came off Today (23 October). */
  {
    title: 'More',
    icon: 'archive',
    areas: [
      area('/settings/signing-in', 'Signing in', 'key', 'You, your passkeys and where you are signed in'),
      /* PEOPLE & SHARING HOLDS WHAT PEOPLE DID, roles and invites, and every share beside them (sharing plan §3.2). The
         sharing address opens it too (`MOVED`). */
      area('/settings/people', 'People & sharing', 'user-plus', 'Who can see this record, and what you share'),
      area('/settings/ingest', 'What comes in', 'inbox', 'Mail and sources that feed this record'),
      area('/settings/keyboard', 'Keyboard', 'keyboard', 'Character keys and shortcuts'),
      /* ITS OWN GLYPH, NOT ITS GROUP'S: a copy to go back to is the clock turned back. */
      area('/settings/backups', 'Backups', 'history', 'Copies of this record to restore from'),
      /* THE RECORD'S HOUSEKEEPING, WHICH LEFT TODAY (the audit of 22 October, U3): what it found wrong in its own pages
         and notes, what went stale, what it matched and learned. Read only when it is opened. */
      area('/settings/health', 'Health', 'heart-pulse', 'What the record found to tidy in itself'),
      area('/settings/billing', 'Billing', 'money', 'What this record costs'),
      area('/settings/export', 'Export', 'download', 'Take a signed copy of your data'),
    ],
  },
  /* THE ONE IRREVERSIBLE ACT IN A GROUP OF ITS OWN, LAST (UI audit of 22 October, 18). It was the last row of More, one
     hairline under Export and Billing, and read as one more thing to look at. Its heading says what sets it apart. It
     was the last section of `Export` before that: a destructive act reached by somebody looking for a backup is reached
     by the person least expecting it. */
  {
    title: 'Cannot be undone',
    icon: 'alert',
    areas: [area('/settings/delete', 'Delete this record', 'trash', 'Removes the record for good')],
  },
];

/**
 * THE DESIGN BOOK IS NOT A SETTING, SINCE BATCH 6 (call 6), AND NOT UNDER SETTINGS SINCE THE UI PASS OF 20 OCTOBER (agents
 * F29): it lives at `/design`, reached from the index's "⋯ › Design book", and `/settings/look` goes there.
 */
export const OFF_INDEX: readonly Area[] = [];

/**
 * ADDRESSES THAT MOVED, each to the area that holds it now: a link somebody shared, or a menu that still says the old
 * address, lands on the area it means. Identity, Recovery and Sessions are Signing in; Pages is Navigation; Sharing is
 * People & sharing.
 */
export const MOVED: ReadonlyMap<string, string> = new Map([
  ['identity', 'signing-in'],
  ['recovery', 'signing-in'],
  ['sessions', 'signing-in'],
  ['pages', 'navigation'],
  /* BY ITS ADDRESS, as every area here is (`area` above): the area's id is the address less `/settings/`. */
  ['sharing', '/settings/people'.slice(AREA_AT.length)],
]);

/** The area an id names, a moved one by where it lives now. */
export const areaOf = (id: string): Area | undefined => AREAS.get(MOVED.get(id) ?? id);

/** Every area this build draws, by id, whatever a declared index lists. */
export const AREAS: ReadonlyMap<string, Area> = new Map([...DEFAULT_GROUPS.flatMap((g) => g.areas), ...OFF_INDEX].map((a) => [a.id, a] as const));

/**
 * THE AREAS A PHONE'S INDEX LEAVES OUT.
 *
 * Keyboard is a table of keys, and a phone has none to press: offering it there is a visible key hint on a screen
 * with no keyboard. Its address still opens, so a link somebody shares still lands.
 */
export const ONLY_WIDE: ReadonlySet<string> = new Set(['keyboard']);

/** A page body as `drawnOf` and `setBody` take it. */
export type IndexBody = { page: string; title: string; blocks: PageBlock[] };

/**
 * THE INDEX, DECLARED: a `link` tile for each group, the page wide, the five on top and the rest under More, one under another. Each row is written out as `[name, address, line, icon]`: the shape a `link` row
 * takes, and the area's own glyph after it, so the index draws each area with the well the chooser beside an open area
 * draws it with. A reader that draws three cells leaves the fourth unread.
 */
export function indexBody(groups: readonly AreaGroup[] = DEFAULT_GROUPS): IndexBody {
  return {
    page: SETTINGS_PAGE,
    title: 'Settings',
    blocks: groups.map((g) => ({
      kind: 'link',
      heading: g.title,
      icon: g.icon,
      /* HALF THE PAGE EACH (agents F28): You and More side by side where the page is wide, one under another on a phone. */
      span: 6,
      authored: g.areas.map((a) => ({ cells: [a.label, `${AREA_AT}${a.id}`, a.line, a.icon] })),
    })),
  };
}

export const SETTINGS_INDEX: IndexBody = indexBody();

/** A block as the reader answers it, narrowed to what reading an index back needs. */
export type IndexBlock = { kind: string; heading?: string; icon?: string; drawn?: boolean; authored?: readonly { cells: readonly unknown[] }[] };

/** The area an address names, `/settings/<id>` with the base path or a query in front or behind it, or none. */
function areaAt(address: unknown): Area | undefined {
  if (typeof address !== 'string') return undefined;
  const m = /\/settings\/([a-z-]+)\/?(?:[?#].*)?$/u.exec(address.trim());
  return m ? areaOf(m[1]!) : undefined;
}

/**
 * A DECLARED INDEX, READ BACK INTO GROUPS: what the chooser beside an open area draws, so it keeps the order, the
 * names and the leaving out a person gave the index.
 *
 * Only `link` blocks are read, in their order, and only rows whose address is an area this build draws. A row's name
 * is the person's (a renamed area keeps the name they gave it); its icon is the area's own. An area listed twice is
 * drawn where it is first listed, a block not drawn is left out, and a group left with no area draws no heading.
 *
 * AN INDEX THAT NAMES NO AREA AT ALL IS READ AS THE DEFAULT, because a chooser with nothing in it is a person stranded
 * in one area with no way to the next, and nothing on the page would say why.
 */
export function groupsOf(blocks: readonly IndexBlock[]): readonly AreaGroup[] {
  const seen = new Set<string>();
  const groups: AreaGroup[] = [];
  for (const b of blocks) {
    if (b.kind !== 'link' || b.drawn === false || !Array.isArray(b.authored)) continue;
    const areas: Area[] = [];
    for (const row of b.authored) {
      const cells = Array.isArray(row?.cells) ? row.cells : [];
      const known = areaAt(cells[1]);
      if (!known || seen.has(known.id)) continue;
      seen.add(known.id);
      const named = typeof cells[0] === 'string' && cells[0].trim() !== '' ? cells[0].trim() : known.label;
      const line = typeof cells[2] === 'string' ? cells[2].trim() : known.line;
      areas.push({ ...known, label: named, line });
    }
    if (areas.length === 0) continue;
    const home = DEFAULT_GROUPS.find((g) => g.title === b.heading);
    groups.push({ title: b.heading?.trim() || areas[0]!.label, icon: (b.icon as IconName | undefined) ?? home?.icon ?? areas[0]!.icon, areas });
  }
  return groups.length > 0 ? groups : DEFAULT_GROUPS;
}

/** The label an area is drawn under on this index, the person's name for it where they gave one. */
export function labelIn(groups: readonly AreaGroup[], id: string): string | undefined {
  for (const g of groups) for (const a of g.areas) if (a.id === id) return a.label;
  return areaOf(id)?.label;
}
