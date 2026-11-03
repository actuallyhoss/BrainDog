/**
 * Money's first open: when nobody has chosen a home currency or there is no account yet, Money's home opens on a short
 * setup (the currency, a first account, and which Money add-ons to switch on) in place of an empty board.
 *
 * ONCE. Finishing it or skipping it is kept as one of this person's dismissals (`nav-prefs.svelte.ts`, `pen.dismissed`),
 * which the record keeps for every device they use, so it never opens again, whatever the record holds after.
 *
 * WHICH PAGE IS MONEY'S HOME IS READ, NEVER NAMED: the first page of its section in the nav, on a page that draws the
 * ledger or its accounts (`pageOfLedger`). Which add-ons are Money's is the store's own word: an add-on on the money
 * shelf that brings a page of its own and calls out to nowhere, so a bank's connector is not among them.
 *
 * PURE, so `node --test` reads it. The gate is `SetupGate.svelte`, the steps `MoneySetup.svelte`.
 */

import type { CatalogueEntry, CatalogueIndex } from '@braindog/declare/catalogue';
import { exponentOf } from 'braindog-render';

/** The dismissal Money's setup is kept under once it is done or skipped. */
export const SETUP_KEY = 'setup:first-open';

/** What the gate asks of the screen it is on. */
export type SetupFacts = {
  /** The person owns the record: only they set its currency and turn add-ons on. */
  owner: boolean;
  /** The record answered: never over the sample or a copy drawn offline. */
  live: boolean;
  /** This page is Money's home. */
  home: boolean;
  /** The record's home currency, `null` where nobody chose one. */
  currency: string | null;
  /** How many accounts the record holds. */
  accounts: number;
  /** Done or skipped already, here or on another device. */
  dismissed: boolean;
};

/** Whether Money's home opens on the setup. */
export const setupDue = (f: SetupFacts): boolean => f.owner && f.live && f.home && !f.dismissed && (f.currency === null || f.accounts === 0);

/** A nav entry as the gate reads it. */
type Nav = { id: string; section: string; order: number; row?: true | undefined };

/** Whether a page is the first of its section in the nav: Money's home, among Money's pages. */
export function headsSection(nav: readonly Nav[], slug: string): boolean {
  const own = nav.find((n) => n.id === slug && n.row !== true);
  if (!own) return false;
  return nav.filter((n) => n.section === own.section && n.row !== true).every((n) => n.order >= own.order);
}

/* ── the add-ons ───────────────────────────────────────────────────────── */

/** One Money add-on the setup offers. */
export type Addon = { id: string; title: string; summary: string; icon: string | null; version: string; needs: string[] };

/** The shelf the store puts Money's add-ons on (`packs/listed.json`). */
const SHELF = 'money';

const latestOf = (e: CatalogueEntry) => e.versions.find((v) => v.version === e.latest && v.yanked === undefined) ?? e.versions.find((v) => v.yanked === undefined) ?? null;

/**
 * THE MONEY ADD-ONS A PERSON MAY SWITCH ON HERE, in the store's order: on the money shelf, listed, with a version to
 * install, bringing a page of their own and calling out to nowhere. `needs` is what else of these each stands on, so
 * one is put in after what it needs.
 */
export function moneyAddons(index: CatalogueIndex | null): Addon[] {
  const out: Addon[] = [];
  for (const e of index?.entries ?? []) {
    const shelf = (e as CatalogueEntry & { shelf?: string }).shelf;
    if (e.kind !== 'pack' || shelf !== SHELF || e.unlisted === true) continue;
    const v = latestOf(e);
    if (!v || v.reach.pages.length === 0 || v.reach.calls_out.length > 0) continue;
    out.push({ id: e.id, title: e.title, summary: e.summary, icon: (e as CatalogueEntry & { icon?: string }).icon ?? null, version: v.version, needs: v.reach.modules });
  }
  const ids = new Set(out.map((a) => a.id));
  return out.map((a) => ({ ...a, needs: a.needs.filter((m) => ids.has(m)) }));
}

/**
 * THE THREE A STARTER IS LIKELIEST TO WANT, by its use case (audit 31 Oct h, AH32): fifteen add-ons in long paragraphs,
 * Zakat and Savings circle among them, were a wall for a shop. These lead, each in one line, and the rest wait under
 * More. One the store does not list is passed over.
 */
const LIKELY: Readonly<Record<string, readonly string[]>> = {
  shop: ['card-alerts', 'receipts', 'count-cash'],
  business: ['subscriptions', 'receipts', 'tax-set-aside'],
  founder: ['subscriptions', 'tax-set-aside', 'receipts'],
  personal: ['card-alerts', 'subscriptions', 'goals'],
  student: ['card-alerts', 'splits', 'subscriptions'],
  team: ['subscriptions', 'receipts', 'splits'],
};
const LIKELY_ANY: readonly string[] = ['card-alerts', 'subscriptions', 'receipts'];

/** The add-ons split into the three a starter likeliest wants, in that order, and the rest in the store's order. */
export function likelyFirst(addons: readonly Addon[], usecase: string | null): { first: Addon[]; more: Addon[] } {
  const want = (usecase !== null ? LIKELY[usecase] : undefined) ?? LIKELY_ANY;
  const first = want.flatMap((id) => addons.filter((a) => a.id === id)).slice(0, 3);
  return { first, more: addons.filter((a) => !first.includes(a)) };
}

/** An add-on's summary as one line: its first sentence. */
export const oneLine = (summary: string): string => {
  const m = /^(.+?[.!?])(?:\s|$)/u.exec(summary.trim());
  return (m?.[1] ?? summary).trim();
};

/**
 * The chosen add-ons in the order they go in: each after the ones it needs, and an add-on chosen without one it needs
 * brings that one with it, since the record would refuse it alone.
 */
export function installOrder(chosen: readonly string[], addons: readonly Addon[], installed: ReadonlySet<string> = new Set()): Addon[] {
  const byId = new Map(addons.map((a) => [a.id, a]));
  const out: Addon[] = [];
  const visit = (id: string, seen: Set<string>): void => {
    const a = byId.get(id);
    if (!a || installed.has(id) || out.includes(a) || seen.has(id)) return;
    seen.add(id);
    for (const n of a.needs) visit(n, seen);
    out.push(a);
  };
  for (const id of chosen) visit(id, new Set());
  return out;
}

/**
 * A balance as typed, in minor units of `currency`: grouping ignored, one point the decimal mark, a minus for a card
 * that is owed on. Zero is a balance. `null` for anything else, or for more places than the currency holds.
 */
export function balanceOf(typed: string, currency: string): number | null {
  const said = typed.replace(/[\s,  ]/gu, '');
  const m = /^([-−]?)(\d*)(?:\.(\d*))?$/u.exec(said);
  if (!m || (m[2] === '' && (m[3] ?? '') === '')) return null;
  const exp = exponentOf(currency);
  const fraction = m[3] ?? '';
  if (fraction.length > exp) return null;
  const minor = Number(`${m[2] || '0'}${fraction.padEnd(exp, '0')}`);
  if (!Number.isSafeInteger(minor)) return null;
  return m[1] === '' || minor === 0 ? minor : -minor;
}

/* ── the words ─────────────────────────────────────────────────────────── */

/** Kept here, so the setup owns its words. Plain, sentence case. */
export const words = {
  title: 'Set up Money',
  /* NO COUNT OF STEPS (first-hour audit E10): "Step 1 of 2" stood over "Three short steps", and the first run counts none. */
  lead: 'A few short questions. You can change any of it later.',
  currency: 'Home currency',
  currencyLine: 'Totals in other currencies are added up in this one.',
  account: 'First account',
  accountLine: 'Where money is kept: a bank account, cash or a card.',
  name: 'Name',
  namePlaceholder: 'Current account',
  kind: 'Type',
  balance: (code: string) => `Balance today (${code})`,
  accountIn: 'Its currency',
  addons: 'Plugins',
  addonsLine: 'Switch on what you keep. Each one adds its own page to Money.',
  moreAddons: (n: number) => `More plugins (${String(n)})`,
  installed: 'On',
  rates: 'Keep rates current',
  ratesLine: 'Fetches exchange rates once a day. You say where from next.',
  noStore: 'The plugins could not be listed here. They are all in Plugins.',
  openAddons: 'Open Plugins',
  back: 'Back',
  next: 'Next',
  finish: 'Finish',
  /* A BANK ACCOUNT'S LINES COME NEXT, from the statement its bank exports. */
  finishImport: 'Finish and import a statement',
  finishing: 'Setting up…',
  skip: 'Skip setup',
  needName: 'Give the account a name.',
  needBalance: 'Type the balance, or 0.',
  needCurrency: 'Choose a currency.',
  done: 'Money is set up.',
  doneSome: 'Money is set up. A few things need you:',
  openOne: (title: string) => `Open ${title} to finish adding it`,
  setRates: 'Set up rates',
  toMoney: 'Open Money',
  currencyNotSet: 'The currency was not saved.',
  accountNotMade: 'The account was not added.',
} as const;
