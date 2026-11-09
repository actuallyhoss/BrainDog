/**
 * RENAMING A THING FROM WHEREVER IT IS DRAWN, which a double click asks (`lib/ui/dbl.ts`): a card, a line, a sidebar row,
 * a link that stands for the thing. Nothing here draws a box of its own:
 *   - A LINK'S PRESS HAS ALREADY GONE TO THE THING'S PAGE, so that page renames it, as its own "…" would there: a row's
 *     page puts its title in its box, a list's opens Rename this list, a project's page opens the row's Rename sheet
 *     (`askPage`'s `rename`, which each page answers with `answerVerbs`).
 *   - A ROW NO PAGE IS OPENED FOR (a task on Today, which a press ticks and does not open) is renamed in the sheet its
 *     menu's Rename opens (`ThingSheets.svelte`), with the same write: `renameSheetOf` is that sheet, for both.
 * Whether a thing may be renamed is asked before the press is taken (`renamable`), by the questions its menu asks.
 */

import { page } from '$app/state';
import { apiBase } from '../at.ts';
import { REGISTERS } from '../record/held.ts';
import { may } from '../record/may.ts';
import { opensOnPage } from '../record/project.ts';
import { ownPage, rowScreen, saidRowPages } from '../record/row-href.ts';
import { rowReader } from '../record/row-live.ts';
import { rowWriter, type RowWriter } from '../record/rows-write.ts';
import type { Shell } from '../record/boot-live.ts';
import type { Entry, RegisterDecl } from '../record/schema.ts';
import { ownsRecord, type Me } from '../../routes/settings/levels.ts';
import { askSheet, type SheetAsk } from './asks.svelte.ts';
import { askPage, isHere } from './page-verbs.ts';
import { inIosApp } from '../shell.ts';
import { thingOf } from './thing.ts';
import { thingWords } from './verbs.ts';
import { dbl } from '../ui/dbl.ts';
import { appAddress } from '../ui/context-menu.ts';

/** The row a page is about, by its slug: a project's page, a person's, an account's. */
export function aboutOf(slug: string): { list: string; seq: number } | null {
  const p = saidRowPages().pages.find((x) => x.slug === slug);
  if (p?.about && typeof p.about.seq === 'number') return { list: p.about.register, seq: p.about.seq };
  const spoken = /^([a-z][a-z0-9_]*)#([1-9]\d*)$/u.exec(slug);
  return spoken ? { list: spoken[1]!, seq: Number(spoken[2]) } : null;
}

/** Whether the thing an address stands for can be renamed by this reader, asked as its menu asks. */
export function renamable(address: string): boolean {
  const shell = page.data as unknown as Partial<Shell>;
  if (!shell.me) return false;
  const t = thingOf(address);
  switch (t.kind) {
    case 'row':
      return may(shell as Shell, 'write', t.list);
    case 'list':
      return ownsRecord(shell.me as unknown as Me) && t.list !== 'keys';
    case 'page': {
      const about = aboutOf(t.slug);
      return about !== null && may(shell as Shell, 'write', about.list);
    }
    case 'automation':
      return true;
    default:
      return false;
  }
}

/**
 * Rename the thing an address stands for, on its own page: the page its link opened, or opens now. `field` asks a row's
 * page for that value's box in place of its title (a cell of a list's table).
 * A ROW WITH A PAGE OF ITS OWN (an account, a bill) is renamed on that page, where its address lands, and a value of it
 * is changed on the row's screen, where its fields are written (`rowScreen`): asked of `/r/…` it went on to the page,
 * and the page it named never answered.
 */
export function renameAt(address: string, field?: string): void {
  const t = thingOf(address);
  let to = address;
  if (t.kind === 'row') {
    const own = opensOnPage(REGISTERS[t.list]) ? ownPage(t.list, t.seq, new URLSearchParams()) : null;
    if (own !== null) to = field ? rowScreen(t.list, t.seq) : own;
  }
  /* IN THE IPHONE APP THE FIRST TAP ON A LINK IS A NATIVE PUSH (`shellVisit`): the page it opens is on a screen of its
     own, so the screen left under it is not sent there too. Only what is renamed where it is drawn changes there. */
  if (inIosApp && !isHere(to)) return;
  askPage(to, field ? `edit:${field}` : 'rename');
}

/**
 * `{@attach renames(href)}`: A CARD, A LINE OR A SIDEBAR ROW THAT OPENS A THING, renamed by a double click there. Its
 * single press has opened the thing's page already; the page renames it. Nothing is taken for a thing this reader may
 * not rename, so the press is the browser's.
 */
export const renames = (href: string, field?: string) => dbl(() => renameAt(href, field), { can: () => renamable(href) });

/** The link a press landed in, where it stands for a row or a page about one: what a double click on it renames. */
export function rowLinkOf(from: Element): string | null {
  const link = from.closest('a[href]');
  const address = link ? appAddress(link) : null;
  if (!address) return null;
  const t = thingOf(address);
  return t.kind === 'row' || (t.kind === 'page' && aboutOf(t.slug) !== null) ? address : null;
}

/**
 * `{@attach renamesLinks}`: A SCREEN WHOSE LINES ARE LINKS TO ROWS (a row's page, with the rows it is tied to), each
 * renamed by a double click on its link, as `renames` renames one. A link to anything else keeps its own double click.
 */
export const renamesLinks = dbl(
  (from) => {
    const to = rowLinkOf(from);
    if (to) renameAt(to);
  },
  {
    can: (from) => {
      const to = rowLinkOf(from);
      return to !== null && renamable(to);
    },
    through: 'a[href]',
  },
);

/** The sheet a row's menu opens for Rename, over the row as it was read, written through the list's own writer. */
export function renameSheetOf(list: string, seq: number, decl: RegisterDecl, row: Entry, write: RowWriter = rowWriter(apiBase())): SheetAsk {
  return {
    kind: 'rename',
    title: thingWords.renameThis(decl.one),
    label: thingWords.nameField,
    value: String(row.fields[decl.title] ?? ''),
    save: async (value) => {
      const wrote = await write.update(list, seq, { [decl.title]: value }, row.version);
      return wrote.ok ? null : wrote.fix;
    },
  };
}

/** Read the row and open its Rename sheet, as its menu's Rename does. Whether it opened. */
export async function askRename(list: string, seq: number): Promise<boolean> {
  const decl = REGISTERS[list] as RegisterDecl | undefined;
  const shell = page.data as unknown as Partial<Shell>;
  if (!decl || !shell.me || !may(shell as Shell, 'write', list)) return false;
  const got = await rowReader(apiBase()).read(list, seq);
  if (got.from !== 'live' || !got.entry || (got.entry as { deleted_at?: unknown }).deleted_at != null) return false;
  askSheet(renameSheetOf(list, seq, decl, got.entry));
  return true;
}
