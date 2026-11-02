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

/**
 * A row of the index that opens a page outside Settings (Keychain, Add-ons the store, Usage its own page): its
 * name, its address, its line and its glyph, and the area it stands before, or the group's end.
 */
export type Outside = { readonly label: string; readonly href: string; readonly icon: IconName; readonly line: string; readonly before?: string };

/**
 * One group of the index: its heading, its icon, its areas in the order drawn, the rows that open a page elsewhere, and
 * how much of the page's width it takes (half, unless it says the whole).
 */
export type AreaGroup = { readonly title: string; readonly icon: IconName; readonly areas: readonly Area[]; readonly outside?: readonly Outside[]; readonly span?: number };

/** One drawn row of a group: an area, at its address, or an outside row, at its own. */
export type IndexRow = { readonly label: string; readonly href: string; readonly icon: IconName; readonly line: string; readonly id?: string };

/** A group's rows in the order drawn: its areas, each outside row placed before the area it names or at the end. */
export function rowsOf(g: AreaGroup): IndexRow[] {
  const out: IndexRow[] = [];
  const placed = new Set<Outside>();
  for (const a of g.areas) {
    for (const o of g.outside ?? []) if (o.before === a.id) (out.push(o), placed.add(o));
    out.push({ label: a.label, href: `${AREA_AT}${a.id}`, icon: a.icon, line: a.line, id: a.id });
  }
  for (const o of g.outside ?? []) if (!placed.has(o)) out.push(o);
  return out;
}

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
  /* FIVE GROUPS SINCE 1 NOVEMBER ("perfect the ui"): three groups of six read as three long lists, and This BrainDog
     held agents, people, mail, keys, add-ons and the vital signs under one name that said none of them. Now each group
     is named by what it holds: you, how it looks, agents and add-ons, people and billing, and your data. The first four
     stand two by two, three or four rows each; Your data runs the whole width under them, with Delete its last row. No
     area moved address, so every link still lands. */
  {
    title: 'You',
    icon: 'user',
    areas: [
      area('/settings/signing-in', 'Signing in', 'key', 'Passkeys, devices'),
      area('/settings/notifications', 'Notifications', 'bell', 'Quiet hours, summaries'),
      area('/settings/keyboard', 'Keyboard', 'keyboard', 'Shortcuts'),
    ],
  },
  {
    title: 'How it looks',
    icon: 'sliders-horizontal',
    areas: [
      area('/settings/appearance', 'Appearance', 'sun', 'Theme, density, phone bar'),
      area('/settings/navigation', 'Pages', 'rows', 'Sidebar and bar'),
      area('/settings/words', 'Time and money', 'tag', 'Time zone, currency, list names'),
    ],
  },
  /* WHAT PLUGS INTO THIS BRAINDOG: the agents, the keys they are given, what comes in by mail and feed, and the add-ons. */
  {
    title: 'Agents and add-ons',
    icon: 'plug',
    areas: [
      area('/settings/agents', 'Agents', 'session', 'Connections, permissions, Slash'),
      area('/settings/ingest', 'What comes in', 'inbox', 'Mail and feeds'),
      /* ADD-ONS IS AN AREA OF SETTINGS, with the rail beside it, as the store is the place to find more (`/addons`). It
         was a row opening `/packs`, a page of its own with no Settings rail. */
      area('/settings/addons', 'Add-ons', 'packs', 'Installed, updates'),
    ],
    /* ONE NAME FOR IT: the page is Keychain, and this row said Keys. */
    outside: [{ label: 'Keychain', href: '/keychain', icon: 'vault', line: 'Keys for agents', before: 'ingest' }],
  },
  /* WHO IS IN IT AND WHAT IT COSTS. PEOPLE & SHARING HOLDS WHAT PEOPLE DID, roles and invites, and every share beside
     them; the sharing address opens it too (`MOVED`). */
  {
    title: 'People and billing',
    icon: 'users',
    areas: [
      area('/settings/people', 'People and sharing', 'user-plus', 'Colleagues, invites, shares'),
      /* WHAT EACH ROLE AND EACH SHARE LETS SOMEBODY DO, side by side (collab pass, 2 Nov). */
      area('/settings/roles', 'Who can do what', 'user-check', 'Roles and shares, side by side'),
      area('/settings/billing', 'Billing', 'money', 'Plan'),
    ],
    outside: [{ label: 'Usage', href: '/usage', icon: 'observe', line: 'This month', before: 'billing' }],
  },
  /* WHAT THE RECORD KEEPS, AND THE ONE IRREVERSIBLE ACT AS ITS LAST ROW, drawn in red. ONE HEALTH: the record's vital
     signs, its Health page, with the count Today and the sentence above this index say. */
  {
    title: 'Your data',
    icon: 'archive',
    span: 12,
    areas: [
      /* THE RECORD'S HOUSEKEEPING, WHICH LEFT TODAY: what it found wrong in its own pages and notes, what went stale,
         what is here twice. Called Health until 25 October, beside a Health page that counted something else;
         `/settings/health` still lands. */
      area('/settings/tidy', 'Tidy up', 'filter', 'Stale and doubled'),
      /* ITS OWN GLYPH, NOT ITS GROUP'S: a copy to go back to is the clock turned back. */
      area('/settings/backups', 'Backups', 'history', 'Nightly copies'),
      area('/settings/export', 'Export', 'download', 'A signed copy'),
      area('/settings/delete', 'Delete my BrainDog', 'trash', 'For good'),
    ],
    outside: [{ label: 'Health', href: '/p/health', icon: 'heart-pulse', line: 'Vital signs', before: 'tidy' }],
  },
];

/**
 * THE DESIGN BOOK IS NOT A SETTING, SINCE BATCH 6 (call 6), AND NOT UNDER SETTINGS (agents
 * F29): it lives at `/design`, reached from the index's "⋯ › Design book", and `/settings/look` goes there.
 */
export const OFF_INDEX: readonly Area[] = [];

/**
 * ADDRESSES THAT MOVED, each to the area that holds it now: a link somebody shared, or a menu that still says the old
 * address, lands on the area it means. Identity, Recovery and Sessions are Signing in; Pages is Navigation; Sharing is
 * People & sharing; Health, the housekeeping, is Tidy up.
 */
export const MOVED: ReadonlyMap<string, string> = new Map([
  ['identity', 'signing-in'],
  ['recovery', 'signing-in'],
  ['sessions', 'signing-in'],
  ['pages', 'navigation'],
  /* BY ITS ADDRESS, as every area here is (`area` above): the area's id is the address less `/settings/`. */
  ['sharing', '/settings/people'.slice(AREA_AT.length)],
  ['health', 'tidy'],
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
      /* HALF THE PAGE EACH (agents F28): You and This BrainDog side by side where the page is wide, one under another on
         a phone; Data the whole width under them. */
      span: g.span ?? 6,
      authored: rowsOf(g).map((r) => ({ cells: [r.label, r.href, r.line, r.icon] })),
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
    groups.push({ title: b.heading?.trim() || areas[0]!.label, icon: (b.icon as IconName | undefined) ?? home?.icon ?? areas[0]!.icon, areas, ...(home?.outside ? { outside: home.outside } : {}) });
  }
  return groups.length > 0 ? groups : DEFAULT_GROUPS;
}

/** The label an area is drawn under on this index, the person's name for it where they gave one. */
export function labelIn(groups: readonly AreaGroup[], id: string): string | undefined {
  for (const g of groups) for (const a of g.areas) if (a.id === id) return a.label;
  return areaOf(id)?.label;
}
