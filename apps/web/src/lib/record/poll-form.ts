/**
 * What the poll form on a project's or an organisation's page files: one address, how often, the key if the address
 * needs one, and which number in its answer is which measure (`lib/page/panels/PollForm.svelte`).
 *
 * ONE BUILDER. The form fills the live feed add-on with its own `fillFeed` over `live-feed.pack.json`, as
 * `braindog feed propose` does (`apps/cli/src/feed.ts`), so what a feed can say is what the add-on says: a number dated
 * from the answer, a number that is money, and an id refused in a sentence that says the limit rather than cut short.
 *
 * THE FORM FILES A PROPOSAL AND INSTALLS NOTHING. A poll calls out on a clock, so the add-on it makes goes in front of
 * the owner on Decide, where the host and the interval are printed and approved once. The record checks the
 * declaration again when the proposal is filed; this file only catches what a person would want told before pressing
 * the button, and the add-on's own refusals are said in its words.
 */

import { FEED_NAME_MOST, FEED_MEASURES_MOST, fillFeed, type FeedMeasure } from '@braindog/pack-live-feed/fill.ts';
import TEMPLATE from '@braindog/pack-live-feed/live-feed.pack.json' with { type: 'json' };

import { copy } from '../copy.ts';

/** How often, as the form offers it. The record's floor is fifteen minutes. */
export const POLL_EVERY = ['15m', '1h', '6h', '1d'] as const;
export type PollEvery = (typeof POLL_EVERY)[number];

/** When a reading is dated: when the answer arrived, or from a day or an instant in the answer. */
export const POLL_DATED = ['arrived', 'day', 'instant'] as const;
export type PollDated = (typeof POLL_DATED)[number];

/** Whether the number is money, and if so whether the answer counts whole units (`42.50`) or cents (`4250`). */
export const POLL_MONEY = ['no', 'whole', 'minor'] as const;
export type PollMoney = (typeof POLL_MONEY)[number];

/**
 * One measure of the form: where the number is, what it is called, its unit, when it is dated and where that date is,
 * and whether it is money. A money measure's unit is its currency.
 */
export type PollRow = { path: string; name: string; unit: string; dated: PollDated; datePath: string; money: PollMoney };

/** `id` names the feed when a person gives one; left out, it is made from the page's title and the address. */
export type PollDraft = { url: string; every: PollEvery; grant: string; rows: PollRow[]; id?: string };

/** The page the form is on: its list, its number and its title, and the organisation that lists a project. */
export type PollEntry = { register: string; seq: number; title: string; organisation?: string | null };

/** The most measures the form fills, one request an interval: the add-on's own `FEED_MEASURES_MOST`. */
export const POLL_ROWS_MOST = FEED_MEASURES_MOST;

const PATH = /^(?:[A-Za-z0-9_-]+|\[-?\d*\])(?:\.[A-Za-z0-9_-]+|\[-?\d*\])*$/u;

/**
 * The fill's two bindings: a reading lands on a project, by the readings' `thing`, or on an organisation, by its
 * `organisation`. These are the add-on's field names, so a list whose readings point at the page by another field
 * gets no form it could not install.
 */
const BINDS: Record<string, { by: 'project' | 'organisation'; field: string }> = {
  things: { by: 'project', field: 'thing' },
  organisations: { by: 'organisation', field: 'organisation' },
};

/** Whether a page of this list carries the form, given the readings' field that points at it, and what it sets. */
export function pollBindsTo(register: string, field?: string): 'project' | 'organisation' | null {
  const bind = BINDS[register];
  return bind && (field === undefined || field === bind.field) ? bind.by : null;
}

/** A blank measure, dated when it arrives and not money. */
export const pollRow = (): PollRow => ({ path: '', name: '', unit: '', dated: 'arrived', datePath: '', money: 'no' });

const slug = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const hostOf = (url: string): string => {
  try {
    return new URL(url.trim()).hostname;
  } catch {
    return '';
  }
};

/**
 * The feed's id, from the page's title and the host: `northwind-stats-northwind`, never longer than the add-on takes.
 * The add-on refuses an id past its poll's name rather than cutting it, so the form's own id is cut here, on a word,
 * to the room the add-on leaves: 27, or less when the measures need a second poll.
 */
export function pollIdOf(title: string, url: string, measures = 1): string {
  const polls = Math.max(1, Math.ceil(measures / FEED_MEASURES_MOST));
  const room = FEED_NAME_MOST - 'feed_'.length - (polls === 1 ? 0 : `_${polls}`.length);
  const whole = slug(`${title} ${hostOf(url)}`);
  if (whole.length <= room) return whole || 'numbers';
  const cut = whole.slice(0, room + 1);
  const word = cut.lastIndexOf('-');
  return (word > 0 ? cut.slice(0, word) : cut.slice(0, room)).replace(/-+$/g, '') || 'numbers';
}

/** The rows a person filled in, with blank ones left out. */
const filled = (rows: readonly PollRow[]): PollRow[] => rows.filter((r) => r.path.trim() !== '' || r.name.trim() !== '');

/** One row as the add-on's measure. A money measure's unit is its currency, so it is not written twice. */
function measureOf(r: PollRow): FeedMeasure {
  const unit = r.unit.trim();
  return {
    name: r.name.trim(),
    path: r.path.trim(),
    ...(r.money === 'no' ? (unit === '' ? {} : { unit }) : { money: { currency: unit.toUpperCase(), ...(r.money === 'minor' ? { minor: true } : {}) } }),
    ...(r.dated === 'arrived' ? {} : { at: { path: r.datePath.trim(), as: r.dated } }),
  };
}

/** The spoken id the readings land on, and the organisation a project is listed by, as the fill takes them. */
function boundOf(entry: PollEntry): { project?: string; organisation?: string } {
  const spoken = `${entry.register}#${entry.seq}`;
  if (pollBindsTo(entry.register) === 'organisation') return { organisation: spoken };
  return { project: spoken, ...(entry.organisation ? { organisation: entry.organisation } : {}) };
}

/** The add-on filled for the draft, or the add-on's own sentence for why it will not be. */
function build(d: PollDraft, entry: PollEntry): { doc: Record<string, unknown>; measures: FeedMeasure[] } | { fix: string } {
  const measures = filled(d.rows).map(measureOf);
  const url = d.url.trim();
  const grant = d.grant.trim();
  const id = d.id?.trim() || pollIdOf(entry.title, url, measures.length);
  try {
    const doc = fillFeed(TEMPLATE as Record<string, unknown>, { id, url, every: d.every, ...(grant === '' ? {} : { grant }), ...boundOf(entry), measures });
    return { doc, measures };
  } catch (e) {
    return { fix: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * What is wrong with the draft, by the field it is about, or `null` when it can be filed. Given the page, the add-on
 * is filled too, so its refusals (a currency that is not three letters, an id past the limit) are said before filing.
 */
export function pollFault(d: PollDraft, entry?: PollEntry): { at: 'url' | 'rows' | 'grant'; fix: string } | null {
  let url: URL | null = null;
  try {
    url = new URL(d.url.trim());
  } catch {
    url = null;
  }
  if (!url || url.protocol !== 'https:') return { at: 'url', fix: copy.pollFaultUrl };
  if (d.grant.trim().length > 40) return { at: 'grant', fix: copy.pollFaultKey };
  const rows = filled(d.rows);
  if (rows.length === 0) return { at: 'rows', fix: copy.pollFaultNone };
  if (rows.length > POLL_ROWS_MOST) return { at: 'rows', fix: copy.pollFaultMost(POLL_ROWS_MOST) };
  for (const r of rows) {
    if (!PATH.test(r.path.trim())) return { at: 'rows', fix: copy.pollFaultPath(r.path.trim()) };
    if (r.name.trim() === '') return { at: 'rows', fix: copy.pollFaultName(r.path.trim()) };
    if (r.dated !== 'arrived' && !PATH.test(r.datePath.trim())) return { at: 'rows', fix: copy.pollFaultDate(r.name.trim()) };
  }
  if (entry === undefined) return null;
  const built = build(d, entry);
  return 'fix' in built ? { at: 'rows', fix: built.fix } : null;
}

/** The proposal the form files for a project or an organisation: the live feed add-on, filled for the address. */
export function pollProposal(d: PollDraft, entry: PollEntry) {
  const built = build(d, entry);
  if ('fix' in built) throw new Error(built.fix);
  const url = d.url.trim();
  return {
    question: copy.pollQuestion(new URL(url).host, copy.pollEveryLabels[d.every] ?? d.every, entry.title, built.measures.map((m) => m.name).join(', ')),
    body_kind: 'pack' as const,
    body: { install: String(built.doc.pack), doc: built.doc },
  };
}
