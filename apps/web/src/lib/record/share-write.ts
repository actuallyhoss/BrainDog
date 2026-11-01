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
 * aggregate would be one more line in a file other units write.
 */

import { createClient } from '@braindog/client';

import type { Fetch } from './boot-live.ts';
import type { Measure } from './measures.ts';
import { layoutOf, type Layout } from '../page/layout.ts';
import { wrote, type Wrote } from './settings-write.ts';

/**
 * `openShare` as the owner receives it, and one link as `shares` lists it.
 *
 * WRITTEN OUT, NOT IMPORTED: they are `@braindog/host`'s (`share.ts`), which the client names and this app does not
 * depend on. The client's calls are typed with the host's, so a drift between the two is a type error at the call.
 */
export type ShareLink = { id: string; slug: string; expires_at: string; token: string; url: string };
export type ShareRow = { id: string; slug: string; title: string; opened_at: string; expires_at: string; closed_at: string | null; money?: boolean };

export const words = {
  shareOpen: 'Share',
  shareTitle: 'Share a read-only link',
  shareLead: 'Anybody with the link can read this page as it is now. They cannot change anything or open any other page.',
  shareDays: 'Works for',
  shareMake: 'Make the link',
  /* THE ONE TICK ON A LINK: amounts are left off it unless it is ticked. */
  shareMoney: 'Include money',
  shareMoneyWhy: 'Amounts, bills and money figures. Left off, they are not on the link at all.',
  shareMaking: 'Making the link',
  shareOnce: 'This is the only time the link is shown. Copy it now.',
  shareLinkLabel: 'Read-only link',
  /* THE LINK MADE, SAID AS READY AND NEVER SPELT OUT (AM21); its address is under Show the link. */
  shareReady: 'Link ready',
  shareShow: 'Show the link',
  /* A PAGE WHOSE LINK WOULD SHOW NOTHING, said before it is made (AM21). */
  shareEmpty: 'Nothing on this page yet, so the link would show nothing.',
  /* A PAGE OF MONEY WITH THE TICK OFF (AN14): it has things on it, and the link would show none of them. */
  shareEmptyMoney: 'With money left off, the link would show nothing.',
  shareCopy: 'Copy the link',
  shareCopied: 'Link copied',
  shareUntil: (day: string) => `It works until ${day}, or until you close it in Settings, under People and sharing.`,
  shareAnother: 'Make another link',
  shareDone: 'Done',
  shareAsking: 'Checking whether this BrainDog makes links',
  shareOff: 'Read-only links are switched off on this BrainDog.',
  /* WHERE THE HOST MAKES NO LINKS (AH12): the link half is hidden and this is said, never "switched off on this
     BrainDog", which a new person read as something they had done and had nowhere to undo. */
  shareComing: 'Read-only links are coming.',
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
  /* MADE, NOT OPENED (AN21): "opened just now" read as somebody having read it. */
  linksOpened: (when: string) => `made ${when}`,
  /* WHETHER AMOUNTS ARE ON IT, said beside each link, since two links to Money read the same otherwise. */
  linksMoney: (on: boolean) => (on ? 'shows amounts' : 'no amounts'),
  sharedChip: 'Shared, read only',
  sharedUntil: (day: string) => `This link works until ${day}.`,
  sharedDead: 'This page is not shared.',
  sharedDeadBody: 'Ask whoever sent the link for a new one.',
  sharedUnreached: 'BrainDog could not be reached.',
  sharedRetry: 'Try again',
  sharedDetails: 'Details',
  sharedMade: 'Made with BrainDog',
  /* UNDER A LIST THE LINK SHOWS PART OF: how many more there are, since a stranger has no way to the rest (AF18). */
  sharedMore: (more: number) => `and ${more} more`,
  sharedNoRows: 'Nothing here yet',
  sharedNoFigure: 'No figure',
  sharedNothing: 'This page has nothing a link can show.',
  sharedYes: 'Yes',
  sharedNo: 'No',
} as const;

/** How long a link can be made for, in days, as `openShare` takes it: 1 to 90, and 30 unless said. */
export const SHARE_DAYS = [1, 7, 30, 90] as const;
export const SHARE_DAYS_DEFAULT = 30;

/** The choices as a person reads them. */
export const daysSaid = (n: number): string => (n === 1 ? '1 day' : `${n} days`);

const clientOf = (base: string, io?: Fetch) => createClient({ base, ...(io ? { fetch: io } : {}) });

/**
 * Open a link to one page. The link is in the answer once, and nowhere after it. `money` says whether its amounts, money
 * figures and money lists go on it, which the sharer ticks as "Include money" (AF18); the record leaves them off unsaid.
 */
export async function openLink(base: string, slug: string, days: number, money: boolean, io?: Fetch): Promise<Wrote<ShareLink>> {
  return wrote(await clientOf(base, io).openShare({ slug, days, money }));
}

/** Close one link for good. Sharing the page again makes a new link. */
export async function closeLink(base: string, id: string, io?: Fetch): Promise<Wrote<{ id: string; closed_at: string }>> {
  return wrote(await clientOf(base, io).closeShare(id));
}

/**
 * Whether this BrainDog can make a read-only link, and why not, as `shareable` answers it.
 *
 * ASKED BEFORE THE PRESS IS DRAWN, so the Share sheet never offers a link the host cannot make. Through the client's
 * generic `call`, since the method is a read the client names no type for. A refusal is a no in the record's own
 * sentence (a member is told what every owner's method tells her); a host too old to know the method is a no in the
 * record's sentence for links switched off, never "There is no method called shareable".
 */
export type Shareable = { can: boolean; why?: string };

/** What a host that does not know `shareable` is said to be: one that makes no links, in the record's own words. */
export const SHARES_OFF: string = words.shareOff;

type Caller = { call: <T>(name: string, args?: Record<string, unknown>) => Promise<Wire<T>> };
type Wire<T> = { ok: true; value: T } | { ok: false; refusal: { code: string; fix: string } } | { ok: false; conflict: unknown };

/** Whether a no is the host's links being off, which the sheet says as coming, and not a sentence for this person. */
export const linksOff = (s: Shareable): boolean => !s.can && (s.why ?? SHARES_OFF) === SHARES_OFF;

/**
 * `readShareable`, asked once for each record address and kept for the page's life (AH27): the sheet and the menu read
 * the same answer, and the ask is never said on screen.
 */
const known = new Map<string, Promise<Shareable>>();
export function shareableOnce(base: string, client: Caller): Promise<Shareable> {
  let p = known.get(base);
  if (!p) {
    p = readShareable(client);
    known.set(base, p);
  }
  return p;
}

export async function readShareable(client: Caller): Promise<Shareable> {
  const out = await client.call<unknown>('shareable');
  if (!out.ok) {
    if (!('refusal' in out) || out.refusal.code === 'ROUTE_UNKNOWN') return { can: false, why: SHARES_OFF };
    return { can: false, why: out.refusal.fix };
  }
  const v = isObject(out.value) ? out.value : {};
  if (v.can === true) return { can: true };
  return { can: false, why: typeof v.why === 'string' && v.why.trim() !== '' ? v.why : SHARES_OFF };
}

/**
 * WHETHER A LINK TO A PAGE WOULD SHOW NOTHING (AM21), as `shareable` answers when asked with the page and the money tick.
 * Anything but a plain yes is no, so a record too old to say, or one that refused, never warns.
 */
export async function linkEmpty(client: Caller, slug: string, money: boolean): Promise<boolean> {
  const out = await client.call<unknown>('shareable', { slug, money }).catch(() => null);
  if (out === null || !out.ok || !isObject(out.value)) return false;
  if (out.value.empty === true) return true;
  /* THE RECORD KEEPS BLOCKS THE LINK'S PAGE DRAWS NOTHING OF (AN14), so the page it would open is judged as `/s` judges
     it (`shownBlocks`): with nothing to draw, the link reads "This page has nothing a link can show". */
  const page = isObject(out.value.page) ? pageOf(out.value.page) : null;
  if (page === null) return false;
  if (page.empty !== null) return true;
  const { shownBlocks } = await import('../../routes/s/reading.ts');
  const t = page.read_at === null ? Number.NaN : Date.parse(page.read_at);
  return shownBlocks(page.blocks, { language: page.language, zone: page.zone, now: Number.isFinite(t) ? t : Date.now(), home: page.home }).blocks.length === 0;
}

/** The links this record opened, newest first. Never a link itself, which nobody keeps. */
export async function readLinks(base: string, io?: Fetch): Promise<Wrote<ShareRow[]>> {
  return wrote(await clientOf(base, io).shares());
}

/**
 * The link as the owner copies it: whole, with this origin in front of it.
 *
 * A HOST WITH NO PUBLIC ORIGIN WRITES THE ADDRESS FROM THE ROOT (`linkOpened` in `@braindog/host`), `/s#<token>`,
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

/**
 * One cell of a shared row as the record sends it (`SharedCell` in `@braindog/record`): the field's type, its value,
 * and for a choice the word the owner reads for it. Money is `{ amount, currency }` in minor units, whole, and a list
 * says the type of what it holds. WRITTEN OUT, NOT IMPORTED, as the link's own types above are.
 */
export type SharedCell = { type: string; of?: string; value: unknown; label?: string; unit?: string };

/**
 * A column a shared block keeps: the field it draws, the label the owner reads, its role, a money column's sign, and the
 * field it reads where its own holds nothing (`or`, the Ledger's name: who was paid, else the line's own words).
 */
export type SharedColumn = { field: string; or?: string; label?: string; as?: string; sign?: { field: string; minus: string }; deadline?: true; ref?: true };

/**
 * One row as a link shows it: each drawn field's typed cell, the same row as plain values for a record that sends no
 * cells, and its state. No id, no list and no number.
 */
export type SharedRow = {
  cells: Record<string, SharedCell>;
  fields: Record<string, unknown>;
  state: string | null;
  /** A card's trend, when the record sent its cards' runs (`trends`, one a row): oldest first, a gap `null`. */
  trend?: (number | null)[];
  /**
   * What a budget's category spent, in its figure's minor units, when the record sent the budgets' parts (`spent_rows`);
   * on a block of goals (`SharedBlock.toward`), what was logged toward the goal, in its own units.
   */
  spent?: number;
};

/** One part of a figure that is cut by something (an account, a plan, a category): its words and its value. */
export type SharedPart = { key: string; label?: string; value: number | null };

/**
 * One figure a block read, with the label the owner reads for it, and how it moved: `trend` is the record's run of it, one
 * value a day oldest first, a day with no point `null` (`trendOf` in `@braindog/kernel`'s `pages.ts`). Absent where the
 * owner's cell drew no trend, or the record sent none.
 */
export type SharedReading = {
  metric: string;
  label?: string;
  value: number | null;
  unit: string | null;
  trend?: (number | null)[];
  /** How the figure is declared to be written (`day`, `days`, `pct`, `int`, `money.GBP`...): a day is held as days since 1970. */
  format?: string;
  /** Its parts, for a figure cut by something ("What each account holds", parts paid by plan), as the record named them. */
  groups?: SharedPart[];
  /** The way its money goes, as the owner's tile signs it: "+" coming in, "−" going out (AO9). */
  sign?: 'in' | 'out';
};

/**
 * One block as the reader draws it, narrowed from what the record sent.
 *
 * NARROWED HERE AND NOT TRUSTED, like `blockOf` in `page-live.ts`: a key that is not the shape it claims is left off,
 * and the block draws without it rather than throwing and taking the page with it.
 */
export type SharedBlock = {
  kind: string;
  heading: string | null;
  /** The page's opening line (`lead: true` on a note), said under the title rather than in a tile of its own. */
  lead: boolean;
  body: string | null;
  empty: string | null;
  span: number | null;
  refused: string | null;
  columns: SharedColumn[];
  rows: SharedRow[];
  matched: number;
  readings: SharedReading[];
  authored: unknown[][];
  /** Which area of a page with a rail the block sits in (`layout` on the page); `main` on a page with none. */
  area: 'main' | 'rail';
  /** The states the block's lists count as finished (their declared `done:`), or `null` from a record that sends none. */
  done: string[] | null;
  /** What a card's trend is, its figure's name ("Done, by week"), sent beside the cards' runs (`SharedRow.trend`). */
  trendLabel?: string | null;
  /** A `progress` block's rows are goals, each set against what was logged toward it (`SharedRow.spent`), not budgets. */
  toward?: boolean;
  /** A `lines` block's measures as the record read them, a line a measure (`measures` on the block), when it sent any. */
  measures?: Measure[];
};

/**
 * The page one link opens. `language` (a BCP 47 tag) and `zone` (an IANA name) are the record's, which every number
 * and day on it is read in, so a stranger's device never decides how they read; `empty` is the one calm line the record
 * says when no block of the page can be shown, and `null` while one can.
 */
export type SharedPage = {
  title: string;
  expires_at: string;
  read_at: string | null;
  language: string;
  zone: string;
  /** The record's home currency, whose amounts are written by their sign alone, or `null` (an older record sends none). */
  home: string | null;
  empty: string | null;
  /** The page's two columns, as the owner's page lays them: the rail's width in twelfths, or `null` for one column. */
  layout: Layout | null;
  blocks: SharedBlock[];
};

/** What the reader draws: the page, a link that does not open, or a record it could not reach. */
export type SharedRead = { from: 'live'; page: SharedPage } | { from: 'shut' } | { from: 'unreached'; why: string };

/** A run of numbers as a measure holds one: a number, or `null` for a bucket with no reading. */
const runOf = (x: unknown): (number | null)[] | null =>
  Array.isArray(x) ? x.map((v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)) : null;

/**
 * A `lines` block's measures, each kept only whole: its name, unit, bucket, its days and the two runs aligned with them,
 * and the newest reading when it has one. Anything else is no measure, and is left out rather than drawn wrong.
 */
function measuresOf(x: unknown): Measure[] {
  if (!Array.isArray(x)) return [];
  return x.flatMap((m): Measure[] => {
    if (!isObject(m) || typeof m.name !== 'string' || typeof m.unit !== 'string' || (m.bucket !== 'day' && m.bucket !== 'week')) return [];
    const keys = Array.isArray(m.keys) && m.keys.every((k) => typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(k)) ? (m.keys as string[]) : null;
    const now = runOf(m.now);
    const was = runOf(m.was);
    if (keys === null || now === null || was === null || now.length !== keys.length || was.length !== keys.length) return [];
    const l = m.latest;
    const latest = isObject(l) && typeof l.value === 'number' && typeof l.at === 'string' && typeof l.day === 'string' ? { value: l.value, at: l.at, day: l.day } : undefined;
    return [
      {
        name: m.name,
        unit: m.unit,
        bucket: m.bucket,
        keys,
        now,
        was,
        ...(typeof m.of === 'string' ? { of: m.of } : {}),
        ...(typeof m.group === 'string' ? { group: m.group } : {}),
        latest: latest ?? null,
      } as Measure,
    ];
  });
}

function isObject(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}
const text = (x: unknown): string | null => (typeof x === 'string' && x.trim() !== '' ? x : null);

/**
 * `{{path}}` in the owner's words, filled from the plain values sent beside them, for a record that still sends them
 * (the record fills its own now, and sends none). A `{{path}}` with nothing to fill prints nothing, never its braces.
 */
export const filled = (said: string | null, values: Record<string, unknown>): string | null => {
  if (said === null || !said.includes('{{')) return said;
  const out = said
    .replace(/\{\{\s*([^}]*?)\s*\}\}/gu, (_whole, key: string) => {
      const v = Object.hasOwn(values, key) ? values[key] : undefined;
      return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? String(v) : '';
    })
    .replace(/[ \t]{2,}/gu, ' ')
    .trim();
  return out === '' ? null : out;
};

const readingOf = (x: unknown): SharedReading | null => {
  if (!isObject(x) || typeof x.metric !== 'string') return null;
  const r = isObject(x.reading) ? x.reading : {};
  const value = typeof r.value === 'number' && Number.isFinite(r.value) ? r.value : null;
  const unit = typeof r.unit === 'string' && r.unit !== '' ? r.unit : null;
  /* THE TREND RIDES BESIDE THE READING, as the record sends it (`shares.ts`); a point that is not a number is a gap. */
  const trend = Array.isArray(x.trend) ? x.trend.map((v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)) : null;
  /* ITS PARTS, by the words the record keyed them by (`readingShown` keys none by a row's id), so a link draws an
     account a row and a plan a track, as the app does (AL6, AL12). A part with no words is no part. */
  const groups = Array.isArray(r.groups)
    ? r.groups.flatMap((g): SharedPart[] =>
        isObject(g) && typeof g.key === 'string' && (g.key.trim() !== '' || (typeof g.label === 'string' && g.label.trim() !== ''))
          ? [{ key: g.key, ...(typeof g.label === 'string' && g.label.trim() !== '' ? { label: g.label } : {}), value: typeof g.value === 'number' && Number.isFinite(g.value) ? g.value : null }]
          : [],
      )
    : null;
  return {
    metric: x.metric,
    ...(typeof x.label === 'string' && x.label !== '' ? { label: x.label } : {}),
    value,
    unit,
    ...(groups === null ? {} : { groups }),
    ...(trend !== null && trend.some((v) => v !== null) ? { trend } : {}),
    ...(typeof x.format === 'string' && /^[a-z][a-z.A-Z]{0,15}$/u.test(x.format) ? { format: x.format } : {}),
    ...(x.sign === 'in' || x.sign === 'out' ? { sign: x.sign } : {}),
  };
};

const cellOf = (x: unknown): SharedCell | null =>
  isObject(x) && typeof x.type === 'string' && Object.hasOwn(x, 'value')
    ? {
        type: x.type,
        value: x.value,
        ...(typeof x.of === 'string' ? { of: x.of } : {}),
        ...(typeof x.label === 'string' && x.label !== '' ? { label: x.label } : {}),
        ...(typeof x.unit === 'string' && x.unit !== '' ? { unit: x.unit } : {}),
      }
    : null;

const cellsOf = (x: unknown): Record<string, SharedCell> => {
  const out: Record<string, SharedCell> = {};
  if (!isObject(x)) return out;
  for (const [field, raw] of Object.entries(x)) {
    const c = cellOf(raw);
    if (c !== null) out[field] = c;
  }
  return out;
};

const columnOf = (c: unknown): SharedColumn[] => {
  if (!isObject(c) || typeof c.field !== 'string') return [];
  const sign = isObject(c.sign) && typeof c.sign.field === 'string' && typeof c.sign.minus === 'string' ? { field: c.sign.field, minus: c.sign.minus } : null;
  return [
    {
      field: c.field,
      ...(typeof c.or === 'string' && c.or !== '' && c.or !== c.field ? { or: c.or } : {}),
      /* AN EMPTY LABEL IS KEPT EMPTY (SB4): the owner's pack left the fact unnamed, as the app draws it. */
      ...(typeof c.label === 'string' ? { label: c.label.trim() === '' ? '' : c.label } : {}),
      ...(typeof c.as === 'string' ? { as: c.as } : {}),
      ...(c.deadline === true ? { deadline: true as const } : {}),
      ...(c.ref === true ? { ref: true as const } : {}),
      ...(sign === null ? {} : { sign }),
    },
  ];
};

export function blockShared(x: unknown): SharedBlock {
  const b = isObject(x) ? x : {};
  const values = isObject(b.values) ? b.values : {};
  const refusals = Array.isArray(b.refusals) ? b.refusals : [];
  const first = refusals[0];
  /* A CARD'S TREND RIDES ON ITS ROW HERE, aligned as the record sent them (`trends`, one a row), so a row left out on the
     way to the screen takes its line with it. A list of another length is no answer, and draws no line. */
  const sentRows = Array.isArray(b.rows) ? b.rows : [];
  const trends = Array.isArray(b.trends) && b.trends.length === sentRows.length ? b.trends : null;
  const trendAt = (n: number): (number | null)[] | null => {
    const run = trends?.[n];
    if (!Array.isArray(run)) return null;
    const line = run.map((v) => (typeof v === 'number' && Number.isFinite(v) ? v : null));
    return line.some((v) => v !== null) ? line : null;
  };
  /* AND A BUDGET'S SPENDING, one a row in the same way (`spent_rows`, AL6). */
  const spents = Array.isArray(b.spent_rows) && b.spent_rows.length === sentRows.length ? b.spent_rows : null;
  const rows = sentRows.flatMap((r, n): SharedRow[] => {
    if (!isObject(r) || !(isObject(r.cells) || isObject(r.fields))) return [];
    const trend = trendAt(n);
    const spent = spents?.[n];
    return [
      {
        cells: cellsOf(r.cells),
        fields: isObject(r.fields) ? r.fields : {},
        state: typeof r.state === 'string' ? r.state : null,
        ...(trend === null ? {} : { trend }),
        ...(typeof spent === 'number' && Number.isFinite(spent) ? { spent } : {}),
      },
    ];
  });
  const authored = (Array.isArray(b.authored) ? b.authored : []).map((r) =>
    isObject(r) && Array.isArray(r.cells) ? r.cells.map((c) => (typeof c === 'string' ? (filled(c, values) ?? '') : c)) : [],
  );
  return {
    kind: typeof b.kind === 'string' ? b.kind : '',
    heading: filled(text(b.heading), values),
    lead: b.lead === true,
    body: filled(text(b.body), values),
    empty: filled(text(b.empty), values),
    span: typeof b.span === 'number' && Number.isInteger(b.span) && b.span >= 1 && b.span <= 12 ? b.span : null,
    refused: isObject(first) && typeof first.fix === 'string' ? first.fix : null,
    columns: (Array.isArray(b.columns) ? b.columns : []).flatMap(columnOf),
    rows,
    matched: typeof b.matched === 'number' && Number.isFinite(b.matched) ? b.matched : rows.length,
    readings: (Array.isArray(b.readings) ? b.readings : []).map(readingOf).filter((r) => r !== null),
    authored,
    area: b.area === 'rail' ? 'rail' : 'main',
    done: Array.isArray(b.done) ? b.done.filter((d): d is string => typeof d === 'string') : null,
    trendLabel: rows.some((r) => r.trend !== undefined) ? text(b.trend_label) : null,
    ...(b.toward === true ? { toward: true } : {}),
    ...((m) => (m.length === 0 ? {} : { measures: m }))(measuresOf(b.measures)),
  };
}

/** A tag `Intl` takes, or `en`, so a record's odd tag never throws while a stranger reads its page. */
const languageOf = (tag: unknown): string => {
  try {
    return typeof tag === 'string' && tag !== '' ? (Intl.getCanonicalLocales(tag)[0] ?? 'en') : 'en';
  } catch {
    return 'en';
  }
};

/** A zone `Intl` knows, or UTC. */
const zoneOf = (name: unknown): string => {
  if (typeof name !== 'string' || name === '') return 'UTC';
  try {
    new Intl.DateTimeFormat('en', { timeZone: name });
    return name;
  } catch {
    return 'UTC';
  }
};

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
    /* THE REASON GOES UNDER DETAILS, never as the sentence. */
    const detail = (out.refusal as { detail?: unknown }).detail;
    return { from: 'unreached', why: typeof detail === 'string' ? detail : out.refusal.fix };
  }
  const page = pageOf(isObject(out.value) ? out.value : {});
  return page === null ? { from: 'shut' } : { from: 'live', page };
}

/** A page as the record sends it, each part kept only in its shape, or `null` for an answer that is not one. */
function pageOf(v: Record<string, unknown>): SharedPage | null {
  if (typeof v.title !== 'string' || typeof v.expires_at !== 'string') return null;
  return {
    title: v.title,
    expires_at: v.expires_at,
    read_at: typeof v.read_at === 'string' ? v.read_at : null,
    language: languageOf(v.language),
    zone: zoneOf(v.zone),
    home: typeof v.home === 'string' && /^[A-Z]{3}$/u.test(v.home) ? v.home : null,
    empty: text(v.empty),
    layout: layoutOf(v),
    blocks: (Array.isArray(v.blocks) ? v.blocks : []).map(blockShared),
  };
}

/** A field id said as words, for a column the owner gave no label: `due_on` is "Due on". */
export const fieldSaid = (id: string): string => {
  const spaced = id.replace(/[_-]+/gu, ' ').trim();
  return spaced === '' ? id : spaced[0]!.toUpperCase() + spaced.slice(1);
};
