/**
 * A read-only link to one page: opening one, closing one, listing them, and reading the page a link opens.
 *
 * A ROUTE-ONLY MODULE, like `settings-write.ts`: the client carries the route table as a value, so only the screens that
 * share load it. It is plain TypeScript with relative imports, so a test can load it in Node.
 *
 * THE OWNER'S THREE ARE ADMIN METHODS (`openShare`, `closeShare`, `shares`), so a browser session at owner; anybody
 * else is refused with the record's own sentence, which is what the screen says. The fourth, `sharedPage`, is asked with
 * the link and nothing else (`client.sharedPage`), because the link is the credential.
 *
 * THE WORDS ARE HERE, in `words`, and not in `lib/copy/`: every screen that draws them is this unit's, and a key in the
 * aggregate would be one more line in a file other units write (`loop/finish/rules.md` §2).
 */

import { createClient } from '@braindog/client';

import type { Fetch } from './boot-live.ts';
import { wrote, type Wrote } from './settings-write.ts';

/**
 * `openShare` as the owner receives it, and one link as `shares` lists it.
 *
 * WRITTEN OUT, NOT IMPORTED: they are `@braindog/host`'s (`share.ts`), which the client names and this app does not
 * depend on. The client's calls are typed with the host's, so a drift between the two is a type error at the call.
 */
export type ShareLink = { id: string; slug: string; expires_at: string; token: string; url: string };
export type ShareRow = { id: string; slug: string; title: string; opened_at: string; expires_at: string; closed_at: string | null };

export const words = {
  shareOpen: 'Share',
  shareTitle: 'Share a read-only link',
  shareLead: 'Anybody with the link can read this page as it is now. They cannot change anything or open any other page.',
  shareDays: 'Works for',
  shareMake: 'Make the link',
  shareMaking: 'Making the link',
  shareOnce: 'This is the only time the link is shown. Copy it now.',
  shareLinkLabel: 'Read-only link',
  shareCopy: 'Copy the link',
  shareCopied: 'Link copied',
  shareUntil: (day: string) => `It works until ${day}, or until you close it in Settings under Links.`,
  shareAnother: 'Make another link',
  shareDone: 'Done',
  linksTitle: 'Links',
  linksLead: 'Read-only links to single pages. Closing one stops it working for good.',
  linksNone: 'No page is shared',
  linksNoneBody: 'A page menu has "Share a read-only link".',
  linksClose: (title: string) => `Close the link to ${title}`,
  linksCloseShort: 'Close link',
  linksClosed: (title: string) => `The link to ${title} is closed`,
  linksOpenUntil: (day: string) => `Open until ${day}`,
  linksRanOut: (day: string) => `Ran out ${day}`,
  linksClosedOn: (day: string) => `Closed ${day}`,
  linksOpened: (when: string) => `opened ${when}`,
  sharedChip: 'Shared, read only',
  sharedUntil: (day: string) => `This link works until ${day}.`,
  sharedDead: 'This page is not shared',
  sharedDeadBody: 'Ask whoever sent the link for a new one.',
  sharedUnreached: 'BrainDog could not reach this record.',
  sharedRetry: 'Try again',
  sharedDetails: 'Details',
  sharedMade: 'Made with BrainDog',
  sharedShowing: (shown: number, of: number) => `Showing ${shown} of ${of}`,
  sharedNoRows: 'Nothing here yet',
  sharedNoFigure: 'No figure',
  sharedYes: 'Yes',
  sharedNo: 'No',
} as const;

/** How long a link can be made for, in days, as `openShare` takes it: 1 to 90, and 30 unless said. */
export const SHARE_DAYS = [1, 7, 30, 90] as const;
export const SHARE_DAYS_DEFAULT = 30;

/** The choices as a person reads them. */
export const daysSaid = (n: number): string => (n === 1 ? '1 day' : `${n} days`);

const clientOf = (base: string, io?: Fetch) => createClient({ base, ...(io ? { fetch: io } : {}) });

/** Open a link to one page. The link is in the answer once, and nowhere after it. */
export async function openLink(base: string, slug: string, days: number, io?: Fetch): Promise<Wrote<ShareLink>> {
  return wrote(await clientOf(base, io).openShare({ slug, days }));
}

/** Close one link for good. Sharing the page again makes a new link. */
export async function closeLink(base: string, id: string, io?: Fetch): Promise<Wrote<{ id: string; closed_at: string }>> {
  return wrote(await clientOf(base, io).closeShare(id));
}

/** The links this record opened, newest first. Never a link itself, which nobody keeps. */
export async function readLinks(base: string, io?: Fetch): Promise<Wrote<ShareRow[]>> {
  return wrote(await clientOf(base, io).shares());
}

/**
 * The link as the owner copies it: whole, with this origin in front of it.
 *
 * A HOST WITH NO PUBLIC ORIGIN WRITES THE ADDRESS FROM THE ROOT (`linkOpened` in `@braindog/host`), `/app/s/<token>`,
 * and a link pasted into a message without its origin opens nothing. So a root-relative address is read against the
 * page it was made on, and a whole one is handed back as it came.
 */
export function linkOf(url: string, origin: string): string {
  if (/^https?:\/\//iu.test(url)) return url;
  return `${origin.replace(/\/+$/u, '')}/${url.replace(/^\/+/u, '')}`;
}

/** Where one link stands at `now`: open, run out or closed. A closed link is closed whatever its day said. */
export function linkState(row: ShareRow, now: number): 'open' | 'ran-out' | 'closed' {
  if (row.closed_at !== null) return 'closed';
  const ends = Date.parse(row.expires_at);
  return Number.isFinite(ends) && ends <= now ? 'ran-out' : 'open';
}

/* ── the page a link opens ────────────────────────────────────────────── */

/** A column a shared block keeps: the field it draws, its label and its role. No list and no type come with it. */
export type SharedColumn = { field: string; label?: string; as?: string };

/** One row as a link shows it: the values of the fields the block draws. No id, no list and no number. */
export type SharedRow = { fields: Record<string, unknown>; state: string | null };

/** One figure a block read, with the metric's own label when it has one. */
export type SharedReading = { metric: string; label?: string; value: number | null; unit: string | null };

/**
 * One block as the reader draws it, narrowed from what the record sent.
 *
 * NARROWED HERE AND NOT TRUSTED, like `blockOf` in `page-live.ts`: a key that is not the shape it claims is left off,
 * and the block draws without it rather than throwing and taking the page with it.
 */
export type SharedBlock = {
  kind: string;
  heading: string | null;
  body: string | null;
  empty: string | null;
  span: number | null;
  refused: string | null;
  columns: SharedColumn[];
  rows: SharedRow[];
  matched: number;
  readings: SharedReading[];
  authored: unknown[][];
};

export type SharedPage = { title: string; expires_at: string; read_at: string | null; blocks: SharedBlock[] };

/** What the reader draws: the page, a link that does not open, or a record it could not reach. */
export type SharedRead = { from: 'live'; page: SharedPage } | { from: 'shut' } | { from: 'unreached'; why: string };

const isObject = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x);
const text = (x: unknown): string | null => (typeof x === 'string' && x.trim() !== '' ? x : null);

/** `{{path}}` in the owner's words, filled from the plain values the record sent beside them. */
const filled = (said: string | null, values: Record<string, unknown>): string | null =>
  said === null
    ? null
    : said.replace(/\{\{\s*([^}]+?)\s*\}\}/gu, (whole, key: string) => {
        const v = Object.hasOwn(values, key) ? values[key] : undefined;
        return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? String(v) : whole;
      });

const readingOf = (x: unknown): SharedReading | null => {
  if (!isObject(x) || typeof x.metric !== 'string') return null;
  const r = isObject(x.reading) ? x.reading : {};
  const value = typeof r.value === 'number' && Number.isFinite(r.value) ? r.value : null;
  const unit = typeof r.unit === 'string' && r.unit !== '' ? r.unit : null;
  return { metric: x.metric, ...(typeof x.label === 'string' ? { label: x.label } : {}), value, unit };
};

export function blockShared(x: unknown): SharedBlock {
  const b = isObject(x) ? x : {};
  const values = isObject(b.values) ? b.values : {};
  const refusals = Array.isArray(b.refusals) ? b.refusals : [];
  const first = refusals[0];
  const columns = (Array.isArray(b.columns) ? b.columns : []).flatMap((c): SharedColumn[] =>
    isObject(c) && typeof c.field === 'string'
      ? [{ field: c.field, ...(typeof c.label === 'string' ? { label: c.label } : {}), ...(typeof c.as === 'string' ? { as: c.as } : {}) }]
      : [],
  );
  const rows = (Array.isArray(b.rows) ? b.rows : []).flatMap((r): SharedRow[] =>
    isObject(r) && isObject(r.fields) ? [{ fields: r.fields, state: typeof r.state === 'string' ? r.state : null }] : [],
  );
  const authored = (Array.isArray(b.authored) ? b.authored : []).map((r) => (isObject(r) && Array.isArray(r.cells) ? r.cells : []));
  return {
    kind: typeof b.kind === 'string' ? b.kind : '',
    heading: filled(text(b.heading), values),
    body: filled(text(b.body), values),
    empty: text(b.empty),
    span: typeof b.span === 'number' && Number.isInteger(b.span) && b.span >= 1 && b.span <= 12 ? b.span : null,
    refused: isObject(first) && typeof first.fix === 'string' ? first.fix : null,
    columns,
    rows,
    matched: typeof b.matched === 'number' && Number.isFinite(b.matched) ? b.matched : rows.length,
    readings: (Array.isArray(b.readings) ? b.readings : []).map(readingOf).filter((r) => r !== null),
    authored,
  };
}

/**
 * The page one link opens.
 *
 * EVERY WAY A LINK FAILS IS ONE ANSWER, `shut`: the hosts answer each as a bare 404 and the client says it as
 * `PAGE_UNKNOWN`, so the screen cannot say why and does not try. Only a host that did not answer is told apart,
 * because trying again can fix that one.
 */
export async function readShared(origin: string, token: string, io?: Fetch): Promise<SharedRead> {
  if (token === '') return { from: 'shut' };
  const out = await clientOf(origin, io).sharedPage(token);
  if (!out.ok) {
    if (!('refusal' in out)) return { from: 'shut' };
    if (out.refusal.code !== 'UNREACHABLE') return { from: 'shut' };
    /* THE REASON GOES UNDER DETAILS, never as the sentence (`loop/finish/rules.md` §2). */
    const detail = (out.refusal as { detail?: unknown }).detail;
    return { from: 'unreached', why: typeof detail === 'string' ? detail : out.refusal.fix };
  }
  const v = isObject(out.value) ? out.value : {};
  if (typeof v.title !== 'string' || typeof v.expires_at !== 'string') return { from: 'shut' };
  return {
    from: 'live',
    page: {
      title: v.title,
      expires_at: v.expires_at,
      read_at: typeof v.read_at === 'string' ? v.read_at : null,
      blocks: (Array.isArray(v.blocks) ? v.blocks : []).map(blockShared),
    },
  };
}

/** A field id said as words, for a column the owner gave no label: `due_on` is "Due on". */
export const fieldSaid = (id: string): string => {
  const spaced = id.replace(/[_-]+/gu, ' ').trim();
  return spaced === '' ? id : spaced[0]!.toUpperCase() + spaced.slice(1);
};
