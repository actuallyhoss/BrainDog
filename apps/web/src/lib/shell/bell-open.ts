/**
 * CLEAR ON OPEN (9 Nov, his words: "if i open the page related to the notification, it should automatically clear it").
 *
 * A line of the bell is read once what it is about is open: its row, on the row's own screen, on the page its list made
 * for it or in the panel beside any list or page (`RowHost.open`); its rule or its script; its question; or whatever
 * page it links to. Nothing is pressed, and the badge drops as the page opens.
 *
 * THE PERSON'S OWN AND ON THE RECORD (`bell.opened`, one of its `PREF_KEYS`), so what was read on the laptop is read on
 * the phone, and in the iPhone and Mac apps, which draw this same page. Each address keeps the time of the newest line
 * read there, the record's own time for that line and never this device's clock, so a slow clock reads the same, and
 * a line that comes after it is new again. The record merges what is sent into what it keeps (`openedKept`).
 *
 * WRITES NOTHING WHERE NOTHING WAS READ: moving about the app sends nothing unless the page opens a line still new.
 */

import { apiBase, here } from '../at.ts';
import { ownPage } from '../record/row-href.ts';
import { frame } from './frame.svelte.ts';
import { unreadIn } from './alerts.ts';

/** A row's own address in the bell (`/r/<list>/<n>`), read into its list and number; `null` for any other address. */
const rowOf = (href: string): { register: string; seq: number } | null => {
  const m = /^\/r\/([a-z][a-z0-9_]*)\/([1-9]\d*)$/u.exec(href);
  return m ? { register: m[1]!, seq: Number(m[2]) } : null;
};

/** The addresses that open a line: a row's own screen and the page its list made for it, else the line's own address. */
export function opensOf(href: string): string[] {
  const row = rowOf(href);
  if (row === null) return [href];
  const page = ownPage(row.register, row.seq, new URLSearchParams());
  return page === null ? [href] : [href, page];
}

/** What an address shown now opens: itself, itself with its query, and the row a list's `?row=` has open beside it. */
export function openNow(url: { pathname: string; search: string }): string[] {
  const path = here(url.pathname);
  const out = [path];
  if (url.search !== '' && url.search !== '?') out.push(`${path}${url.search}`);
  const list = /^\/r\/([a-z][a-z0-9_]*)$/u.exec(path)?.[1];
  const row = new URLSearchParams(url.search).get('row');
  if (list !== undefined && row !== null && /^[1-9]\d*$/u.test(row)) out.push(`/r/${list}/${row}`);
  return out;
}

/**
 * These addresses are open now: every line still new that one of them opens is read, at once on this tab and behind it
 * on the record. A line he wrote himself or a question is not the bell's (`happened`, `others` in `Bell.svelte`).
 */
export function sawPaths(paths: readonly string[]): void {
  if (paths.length === 0 || frame.news.length === 0) return;
  const open = new Set(paths);
  const isNew = unreadIn(frame.readTo, frame.opened);
  const said: Record<string, string> = {};
  for (const n of frame.news) {
    if (n.asked === true || n.by === 'you' || !isNew(n) || !opensOf(n.href).some((p) => open.has(p))) continue;
    const had = said[n.href];
    if (had === undefined || Date.parse(n.at) > Date.parse(had)) said[n.href] = n.at;
  }
  if (Object.keys(said).length === 0) return;
  frame.opened = { ...frame.opened, ...said };
  void keep(said);
}

/** The page shown now, from its address. */
export const sawUrl = (url: { pathname: string; search: string }): void => sawPaths(openNow(url));

/** A row opened in a panel beside a list or a page, which leaves the address as it was. */
export const sawRow = (row: { register: string; seq: number }): void => sawPaths([`/r/${row.register}/${row.seq}`]);

/** Sent to the record, which merges it into what it keeps. Refused or unreached, it stays read on this tab alone. */
async function keep(said: Record<string, string>): Promise<void> {
  try {
    const { createClient } = await import('@braindog/client');
    await createClient({ base: apiBase() }).setPref('bell.opened', said);
  } catch {
    /* Not kept: the next boot says the line again, and opening it again reads it. */
  }
}
