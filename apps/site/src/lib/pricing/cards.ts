/**
 * What the pricing page and the home page's plans draw, worked out from `TABLE` and the words in `copy/pricing.ts`.
 *
 * ONE PLACE PUTS FIGURES INTO WORDS, so `Plans.svelte` and the page type no figure and decide nothing: a card's lines,
 * its button, the table's cells, the extra-use prices and the questions shown are all answered here, for a set of
 * launch flags, and `pricing-page.test.ts` reads these with a copy of `LAUNCH` that has billing on and one that has it
 * off.
 *
 * THE PAID BUTTONS FOLLOW `LAUNCH.billing`. On, "Choose Cloud" and "Choose Cloud Plus" link the plan's
 * own `href` (the app's sign-up with the plan named, `external` because it is the app's). Off, a paid card carries
 * the plain words "Coming soon" where its button would be, and links nothing. Free's button is the shell's `Start`
 * either way.
 */

import { pricing } from '../copy/pricing.ts';
import { PLANS, TABLE, priceOf, type Plan } from '../plans.ts';

const p = pricing.pricing;

/** The launch flags this file reads: `LAUNCH` in `launch.ts`, or a test's copy of it. */
export type Flags = { readonly billing: boolean };

/** The row of `TABLE` a card is made from, by the card's id. */
const ROW = { free: TABLE.free, cloud: TABLE.hosted, plus: TABLE.plus } as const;

/** The table's columns, in the order the cards are: Free, Cloud, Cloud Plus. */
const COLUMNS = PLANS.map((plan) => ROW[plan.id]);

/** What sits at the foot of a card: the shell's Start free, a link to the plan, or the words in its place. */
export type Button = { kind: 'start' } | { kind: 'link'; label: string; href: string } | { kind: 'soon'; label: string };

export type Card = {
  id: Plan['id'];
  name: string;
  /** Free's tag signed out ("Start here") and signed in ("Your plan"); none on a paid card. */
  tag: { out: string; in: string } | null;
  price: string;
  per: string;
  /** A paid card's price is drawn quietly, never as a headline: Free leads (his N2, 1 November, "no $12 headline"). */
  quiet: boolean;
  lines: readonly string[];
  button: Button;
};

/** A paid card's button for these flags: its link while billing is on, "Coming soon" while it is off. */
const paidButton = (plan: Plan, cta: string, flags: Flags): Button =>
  flags.billing ? { kind: 'link', label: cta, href: plan.href } : { kind: 'soon', label: p.cards.soon };

/** The three cards, Free first, for a set of launch flags. */
export function cardsFor(flags: Flags): Card[] {
  return PLANS.map((plan): Card => {
    const row = ROW[plan.id];
    const base = { id: plan.id, name: row.name, price: row.price.month };
    if (plan.id === 'free') {
      const c = p.cards.free;
      return { ...base, tag: { out: c.tag, in: c.mine }, per: c.per, quiet: false, lines: c.lines(row), button: { kind: 'start' } };
    }
    const c = p.cards[plan.id];
    return { ...base, tag: null, per: c.per, quiet: true, lines: c.lines(row), button: paidButton(plan, c.cta, flags) };
  });
}

/** The plans' names over the table, in the cards' order. */
export const columns: readonly string[] = COLUMNS.map((row) => row.name);

/** "What each plan holds": each meter's name and its cell on Free, Cloud and Cloud Plus. */
export const holds: readonly { key: string; name: string; cells: readonly string[] }[] = p.holds.rows.map((r) => ({
  key: r.key,
  name: r.name,
  cells: COLUMNS.map((row) => r.cell(row)),
}));

/** Extra use: each meter's price on Cloud and Cloud Plus, `TABLE.hosted.extra`, said as "$1 per 5,000". */
export const extra: readonly { key: string; name: string; price: string }[] = p.extra.rows.map((r) => {
  const cost = TABLE.hosted.extra![r.key];
  return { key: r.key, name: r.name, price: `${priceOf(cost.cents)} ${r.per(cost.per)}` };
});

/** The questions drawn for these flags: one that rests on billing is left out while billing is off. */
export const faqFor = (flags: Flags): readonly { q: string; a: string }[] =>
  p.faq.questions.filter((item) => !('billing' in item) || flags.billing).map(({ q, a }) => ({ q, a }));
