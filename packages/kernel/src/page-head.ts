/**
 * THE PAGE'S HEAD: what a declared page may say above its tiles, beside its title and its one sentence (PGS-A14,
 * `loop/scope/area-pages-a.md` "The page's head").
 *
 * Until this file `header` was in the spec and refused (`block-keys.ts` `PAGE_UNBUILT`), so every screen that wanted a
 * kicker, a count, a state in words, one primary button, a search or a way back built its own head by hand, and that
 * was one reason screens stayed hand-written. A page now says `header:` with up to seven parts, each checked here when
 * the page is installed and resolved here when it is read, so every page's head is drawn the same way.
 *
 * PURE, AS `row-actions.ts` IS: a table and three functions, so `declare.ts` and `pages.ts` can both ask it without
 * importing each other. Nothing here reads the record; the read hands `resolveHead` what it needs as functions.
 *
 * FEWER THINGS, NOT MORE (DIRECTION 39). Every part is optional, and a part with nothing to say is left out of the
 * answer rather than drawn empty: a count whose figure reads nothing, a state whose figure says no tone the page has
 * words for, a way back to a page that is gone.
 */

import type { Refusal, Result } from '@braindog/ports';
import { no, ok } from '@braindog/ports';

import { ACTION_VERBS, BLOCK_VERBS, actionsBody, type DeclaredAction } from './row-actions.ts';

/** The parts a head may carry, in the order a host draws them. */
export const HEADER_KEYS = ['kicker', 'count', 'state', 'action', 'search', 'back', 'byline'] as const;
export type HeaderKey = (typeof HEADER_KEYS)[number];

/** A kicker's length in bytes: the one short line over a title. */
export const KICKER_MOST = 60;
/** What a state says, in bytes: one line beside its mark. */
export const STATE_SAYS_MOST = 80;
/** The kicker that is today's date, said in the record's own zone. */
export const KICKER_DAY = 'day';

/** The three tones a state may be in. A host draws each with its own mark and its words, never colour alone. */
export const HEAD_TONES = ['good', 'warn', 'bad'] as const;
export type HeadTone = (typeof HEAD_TONES)[number];

/** A head as a page declares it, cleaned. */
export type DeclaredHeader = {
  kicker?: string;
  count?: { metric: string };
  state?: { metric: string; says: Partial<Record<HeadTone, string>> };
  action?: DeclaredAction;
  search?: { param: string };
  back?: { page: string } | { list: string };
  byline?: true;
};

/**
 * What the check knows of the page. `figures` are the figures the record holds and `fields` the fields the page's
 * lists hold; either is `null` where the caller cannot say, and then the names are checked for their shape alone.
 */
export type HeaderContext = { figures: ReadonlySet<string> | null; fields: ReadonlySet<string> | null };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const bytes = (s: string): number => new TextEncoder().encode(s).length;

/** A figure's id, as `declare.ts` spells a metric's. */
const FIGURE = /^[a-z][a-z0-9._-]{0,63}$/u;
/** An address parameter: one lower-case word. */
const PARAM = /^[a-z][a-z0-9_]{0,31}$/u;
/** A page's or a list's id. */
const SLUG = /^[a-z0-9][a-z0-9_-]{0,63}$/u;
/** A line is drawn as it is said, so a break or markup would be drawn as written. */
const NOT_A_LINE = /[\n\r{}[\]*`<>]/u;

/**
 * A page's `header` checked, or the refusal that names the part and the fix.
 *
 * THE ACTION IS A BLOCK'S, checked by `actionsBody` as a block's own `actions` are: a head acts on no one row, so a
 * row's verb is refused here as it is on a block. It is one action, the page's one primary button, never a list.
 */
export function headerBody(raw: unknown, ctx: HeaderContext): Result<DeclaredHeader> {
  const bad = (fix: string, at: string, allowed?: readonly string[]): Result<DeclaredHeader> =>
    no('DECLARATION_INVALID', fix, { at, ...(allowed ? { allowed } : {}) });
  if (!isRecord(raw)) return bad(`header is a map of the parts over the page's title: ${HEADER_KEYS.join(', ')}.`, 'header', HEADER_KEYS);
  const stray = Object.keys(raw).find((k) => !(HEADER_KEYS as readonly string[]).includes(k));
  if (stray !== undefined) return bad(`header has ${stray}, which a head does not draw. A head says ${HEADER_KEYS.join(', ')}.`, `header.${stray}`, HEADER_KEYS);
  const out: DeclaredHeader = {};

  const line = (v: unknown, most: number): string | null => {
    const said = typeof v === 'string' ? v.trim() : '';
    return said && bytes(said) <= most && !NOT_A_LINE.test(said) ? said : null;
  };
  const figure = (v: unknown, at: string): Result<string> => {
    if (typeof v !== 'string' || !FIGURE.test(v)) return no('DECLARATION_INVALID', `${at} names a figure by its id, such as open-tasks.`, { at });
    if (ctx.figures && !ctx.figures.has(v))
      return no('METRIC_UNKNOWN', `${at} names ${v}, and the record has no figure called that. Name one it holds.`, { at, allowed: [...ctx.figures] });
    return ok(v);
  };

  if (raw.kicker !== undefined) {
    const said = raw.kicker === KICKER_DAY ? KICKER_DAY : line(raw.kicker, KICKER_MOST);
    if (said === null)
      return bad(`header.kicker is one plain line over the title, 1 to ${KICKER_MOST} bytes, or ${KICKER_DAY} for today's date.`, 'header.kicker');
    out.kicker = said;
  }
  if (raw.count !== undefined) {
    if (!isRecord(raw.count) || Object.keys(raw.count).some((k) => k !== 'metric'))
      return bad('header.count is { metric }: the figure the count beside the title reads.', 'header.count', ['metric']);
    const m = figure(raw.count.metric, 'header.count.metric');
    if (!m.ok) return m as Result<never>;
    out.count = { metric: m.value };
  }
  if (raw.state !== undefined) {
    const s = raw.state;
    if (!isRecord(s) || Object.keys(s).some((k) => k !== 'metric' && k !== 'says') || !isRecord(s.says))
      return bad('header.state is { metric, says: { good, warn, bad } }: a figure, and what the page says in each case.', 'header.state', ['metric', 'says']);
    const m = figure(s.metric, 'header.state.metric');
    if (!m.ok) return m as Result<never>;
    const says: Partial<Record<HeadTone, string>> = {};
    for (const [tone, words] of Object.entries(s.says)) {
      if (!(HEAD_TONES as readonly string[]).includes(tone))
        return bad(`header.state.says has ${tone}; a state is ${HEAD_TONES.join(', ')}.`, `header.state.says.${tone}`, HEAD_TONES);
      const said = line(words, STATE_SAYS_MOST);
      if (said === null) return bad(`header.state.says.${tone} is one plain line, 1 to ${STATE_SAYS_MOST} bytes.`, `header.state.says.${tone}`);
      says[tone as HeadTone] = said;
    }
    if (Object.keys(says).length === 0) return bad('header.state.says names at least one of good, warn and bad, with the words for it.', 'header.state.says', HEAD_TONES);
    out.state = { metric: m.value, says };
  }
  if (raw.action !== undefined) {
    if (Array.isArray(raw.action)) return bad('header.action is one action, the page\'s one primary button: { verb, label }. Put the rest on the blocks.', 'header.action');
    const verb = isRecord(raw.action) ? raw.action.verb : undefined;
    if (typeof verb === 'string' && Object.hasOwn(ACTION_VERBS, verb) && !BLOCK_VERBS.has(verb))
      return bad(`header.action's verb ${verb} acts on one row, and a head sits over no row. Put it under a block's row_actions.`, 'header.action.verb', [...BLOCK_VERBS]);
    /* THE ONE CHECK A BLOCK'S `actions` MEET, with its words moved onto the head: a refusal there says `actions[0]`. */
    const checked = actionsBody([raw.action], { fields: ctx.fields ?? new Set(), key: 'actions' });
    if (!checked.ok) {
      if (!('refusal' in checked)) return checked as Result<never>;
      const moved = (s: string): string => s.replaceAll('actions[0]', 'header.action');
      const r = checked.refusal;
      return { ok: false, refusal: { ...r, fix: moved(r.fix), ...(typeof r.at === 'string' ? { at: moved(r.at) } : {}) } };
    }
    out.action = checked.value[0]!;
  }
  if (raw.search !== undefined) {
    if (!isRecord(raw.search) || Object.keys(raw.search).some((k) => k !== 'param') || typeof raw.search.param !== 'string' || !PARAM.test(raw.search.param))
      return bad('header.search is { param }: the one word the address holds what is typed under, such as q.', 'header.search', ['param']);
    out.search = { param: raw.search.param };
  }
  if (raw.back !== undefined) {
    const b = raw.back;
    const keys = isRecord(b) ? Object.keys(b) : [];
    const to = keys.length === 1 && isRecord(b) ? b[keys[0]!] : undefined;
    if (keys.length !== 1 || (keys[0] !== 'page' && keys[0] !== 'list') || typeof to !== 'string' || !SLUG.test(to))
      return bad('header.back is { page } or { list }: the one place a way back leads to.', 'header.back', ['page', 'list']);
    out.back = keys[0] === 'page' ? { page: to } : { list: to };
  }
  if (raw.byline !== undefined) {
    if (raw.byline !== true) return bad('header.byline is true or left off.', 'header.byline', ['true']);
    out.byline = true;
  }
  return ok(out);
}

/** The refusal in a page's `header`, or `null`: what `declare.ts` asks when a page is installed. */
export function headerFault(raw: unknown, ctx: HeaderContext): Refusal | null {
  const out = headerBody(raw, ctx);
  return out.ok ? null : 'refusal' in out ? out.refusal : { code: 'DECLARATION_INVALID', fix: 'header could not be read.', at: 'header' };
}

/** One figure as the read has it: its number, how the page writes it, and where it knows, the tone its target puts it in. */
export type HeadFigure = { value: number | null; said: string; tone?: HeadTone | null };

/** What `resolveHead` reads, handed over by the page read so this file reads nothing itself. */
export type HeadRead = {
  figure(id: string): HeadFigure | null;
  /** The read's instant, as an ISO string, and the record's zone, which a kicker of `day` is said in. */
  now: string;
  zone: string;
  /** A page's title and a list's name, or `null` when the record no longer has it. */
  pageTitle(id: string): string | null;
  listName(id: string): string | null;
};

/** A head as a read answers it: only the parts with something to say. */
export type ResolvedHead = {
  kicker?: string;
  count?: { value: number; said: string };
  state?: { tone: HeadTone; words: string };
  action?: DeclaredAction;
  search?: { param: string };
  back?: { href: string; label: string };
  byline?: true;
};

/** Today in the record's zone, as a person says it ("Wednesday 15 October"), or `null` for an instant or zone it cannot read. */
function dayOf(now: string, zone: string): string | null {
  const at = new Date(now);
  if (Number.isNaN(at.getTime())) return null;
  try {
    return new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: zone }).format(at);
  } catch {
    return null;
  }
}

/**
 * A page's head, resolved for one read.
 *
 * A PART WITH NOTHING TO SAY IS LEFT OUT. A count whose figure reads no number, a state whose figure says no tone or a
 * tone the page wrote no words for, and a way back to a page or list the record no longer has are not drawn at all,
 * rather than drawn as a blank, a nought or an id. The action is the declared one: the read cuts it to its reader
 * (`cutActions`), because who may press it is the read's to know.
 */
export function resolveHead(header: DeclaredHeader, read: HeadRead): ResolvedHead {
  const out: ResolvedHead = {};
  if (header.kicker !== undefined) {
    const said = header.kicker === KICKER_DAY ? dayOf(read.now, read.zone) : header.kicker;
    if (said) out.kicker = said;
  }
  if (header.count) {
    const f = read.figure(header.count.metric);
    if (f && typeof f.value === 'number' && Number.isFinite(f.value)) out.count = { value: f.value, said: f.said };
  }
  if (header.state) {
    const tone = read.figure(header.state.metric)?.tone;
    const words = tone ? header.state.says[tone] : undefined;
    if (tone && words) out.state = { tone, words };
  }
  if (header.action) out.action = header.action;
  if (header.search) out.search = { param: header.search.param };
  if (header.back) {
    const label = 'page' in header.back ? read.pageTitle(header.back.page) : read.listName(header.back.list);
    const href = 'page' in header.back ? `/p/${header.back.page}` : `/r/${header.back.list}`;
    if (label) out.back = { href, label };
  }
  if (header.byline) out.byline = true;
  return out;
}
