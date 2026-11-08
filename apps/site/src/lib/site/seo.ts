/**
 * What a search engine, a link preview and an AI search tool read about a page, said once for the whole site.
 *
 * `Seo.svelte` draws a page's head from these: its title, description, canonical address, Open Graph and Twitter
 * cards with a picture made for that page, and the structured data (JSON-LD) that names the company, the site and the
 * app. Every page passes its own words; nothing here is a sentence a reader sees on the page.
 *
 * THE PICTURES are drawn by `scripts/product.mjs` from `CARDS` below, at 1200 by 630, into `static/shots/`: the hero's
 * night ground with the mark's thin line behind, the red mark and the wordmark, and the page's own headline and the
 * line under it, read from `copy/`. A designed card, never a capture of the page. A docs page takes the docs card, a
 * plugin's page the plugins card, and any other page the home card.
 *
 * THE COMPANY is Quartz Apps LLC, the name the Terms and the Privacy Policy give (`legal/`). The offers are the plans
 * the pricing page sells (`plans.ts`): Free alone until `LAUNCH.billing`, then Free, Cloud and Cloud Plus by the month.
 */
import { SUPPORT_EMAIL, SOURCE, PLUGINS } from '../links.ts';
import { CURRENCY, TABLE } from '../plans.ts';
import { LAUNCH } from '../launch.ts';
import { home } from '../copy/home.ts';
import { agents } from '../copy/agents.ts';
import { pricing } from '../copy/pricing.ts';
import { slashPage } from '../copy/slash.ts';
import { trust } from '../copy/trust.ts';
import { packs } from '../copy/packs.ts';
import { changelog } from '../copy/changelog.ts';
import { forPages } from '../copy/for.ts';
import { shell } from '../copy/shell.ts';
import { docsWords } from '../docs/words.ts';

export const ORIGIN = 'https://brain.dog';

/** A card: the file it is drawn to, and the page's headline and the line under it, as the page says them. */
export type Card = { image: string; title: string; sub: string };

const p = pricing.pricing;
const who = forPages.person.who;
const texts = trust.legal.texts;

/**
 * Every page with a card of its own, by path, home first. The file names are literals so `scripts/shots.test.mjs` can
 * see every file the site asks for.
 */
const HOME: Card = { image: '/shots/og-home.png', title: home.hero.title, sub: home.hero.sub };

const CARDS: Record<string, Card> = {
  '/': HOME,
  '/agents': { image: '/shots/og-agents.png', title: agents.agents.title, sub: agents.agents.lead },
  '/pricing': LAUNCH.billing
    ? { image: '/shots/og-pricing.png', title: p.title, sub: p.sub }
    : { image: '/shots/og-pricing.png', title: p.early.title, sub: p.early.lede },
  '/slash': { image: '/shots/og-slash.png', title: slashPage.head.title, sub: slashPage.head.lead },
  '/security': { image: '/shots/og-security.png', title: trust.security.title, sub: trust.security.lede },
  '/support': { image: '/shots/og-support.png', title: trust.support.title, sub: trust.support.lede },
  '/docs': { image: '/shots/og-docs.png', title: docsWords.title, sub: docsWords.lede },
  '/download': { image: '/shots/og-download.png', title: shell.downloadHead.title, sub: shell.downloadHead.lead },
  '/plugins': { image: '/shots/og-plugins.png', title: packs.packs.title, sub: packs.packs.lede },
  '/changelog': { image: '/shots/og-changelog.png', title: changelog.changelog.title, sub: changelog.changelog.lede },
  '/for/founders': { image: '/shots/og-for-founders.png', title: who.founder.tag, sub: who.founder.said },
  '/for/teams': { image: '/shots/og-for-teams.png', title: who.team.tag, sub: who.team.said },
  '/for/personal': { image: '/shots/og-for-personal.png', title: who.personal.tag, sub: who.personal.said },
  '/legal': { image: '/shots/og-legal.png', title: trust.legal.title, sub: trust.legal.lede },
  '/legal/terms': { image: '/shots/og-legal-terms.png', title: texts.terms.title, sub: texts.terms.description },
  '/legal/privacy': { image: '/shots/og-legal-privacy.png', title: texts.privacy.title, sub: texts.privacy.description },
  '/legal/processing': { image: '/shots/og-legal-processing.png', title: texts.processing.title, sub: texts.processing.description },
};

/** The paths `scripts/product.mjs` draws a card for, home first. */
export const CARD_PATHS: readonly string[] = Object.keys(CARDS);

/** The card a path is shown with: its own, else its section's (docs, plugins), else home's. */
export function cardFor(path: string): Card {
  const section = path.startsWith('/docs/') ? '/docs' : path.startsWith(`${PLUGINS}/`) ? PLUGINS : '/';
  return CARDS[path] ?? CARDS[section] ?? HOME;
}

/** The card's address, absolute, as `og:image` and `twitter:image` name it. */
export const cardOf = (path: string): string => `${ORIGIN}${cardFor(path).image}`;

/**
 * The line under a headline as a card prints it: its first sentences while they come to about 120 characters, whole,
 * never cut mid-word. A lead whose first sentence is already longer keeps that one sentence.
 */
export function cardSub(sub: string, max = 120): string {
  const plain = sub.replace(/\s+/g, ' ').trim();
  const sentences = plain.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [plain];
  let out = '';
  for (const s of sentences) {
    if (out && (out + s).trim().length > max) break;
    out += s;
  }
  return out.trim();
}

/** What the card shows, said in words, for `og:image:alt`. */
export const cardAlt = (path: string): string => {
  const c = cardFor(path);
  return `BrainDog. ${c.title.replace(/([^.!?])$/, '$1.')} ${cardSub(c.sub)}`;
};

const ORG_ID = `${ORIGIN}/#org`;
const SITE_ID = `${ORIGIN}/#site`;
const APP_ID = `${ORIGIN}/#app`;

/** The company behind BrainDog. */
export const organization = {
  '@type': 'Organization',
  '@id': ORG_ID,
  name: 'BrainDog',
  legalName: 'Quartz Apps LLC',
  url: `${ORIGIN}/`,
  logo: `${ORIGIN}/icon-512.png`,
  email: SUPPORT_EMAIL,
  ...(SOURCE ? { sameAs: [SOURCE] } : {}),
  contactPoint: { '@type': 'ContactPoint', contactType: 'customer support', email: SUPPORT_EMAIL },
};

/** The site itself. */
export const website = {
  '@type': 'WebSite',
  '@id': SITE_ID,
  name: 'BrainDog',
  url: `${ORIGIN}/`,
  inLanguage: 'en-GB',
  publisher: { '@id': ORG_ID },
};

/** One plan as a schema.org offer: its price by the month, in the table's currency. */
const offerOf = (row: (typeof TABLE)[keyof typeof TABLE]) => ({
  '@type': 'Offer',
  name: row.name,
  price: (row.cents.month / 100).toFixed(2),
  priceCurrency: CURRENCY,
  ...(row.cents.month > 0
    ? {
        priceSpecification: {
          '@type': 'UnitPriceSpecification',
          price: (row.cents.month / 100).toFixed(2),
          priceCurrency: CURRENCY,
          billingDuration: 'P1M',
          unitCode: 'MON',
        },
      }
    : {}),
  availability: 'https://schema.org/InStock',
  url: `${ORIGIN}/pricing`,
});

/**
 * The app, with the offers the pricing page makes. While billing is off that is one: Free, at $0. The paid plans join
 * as offers the day `LAUNCH.billing` is on and the pricing page prices them.
 */
export const application = {
  '@type': 'SoftwareApplication',
  '@id': APP_ID,
  name: 'BrainDog',
  url: `${ORIGIN}/`,
  image: cardOf('/'),
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web, Windows, iOS',
  description:
    'One place for your projects, decisions and money that every agent you use reads before it starts and writes to when it stops, with one list of what needs you and every change signed and undoable.',
  publisher: { '@id': ORG_ID },
  offers: (LAUNCH.billing ? [TABLE.free, TABLE.hosted, TABLE.plus] : [TABLE.free]).map(offerOf),
};

/**
 * A summary cut to what a search result shows, about 155 characters: its first sentences while they fit, else its
 * words up to the limit and an ellipsis. A docs page's summary is a paragraph, and a search result cuts it anyway.
 */
export function snippetOf(text: string, max = 155): string {
  const plain = text.replace(/\s+/g, ' ').trim();
  if (plain.length <= max) return plain;
  const sentences = plain.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [];
  let out = '';
  for (const s of sentences) {
    if ((out + s).trim().length > max) break;
    out += s;
  }
  if (out.trim().length >= 60) return out.trim();
  const cut = plain.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:]$/, '')}…`;
}

/** A page's questions, as the FAQPage a page with a real list of questions on it carries. */
export const faqOf = (questions: readonly { q: string; a: string }[]) => ({
  '@type': 'FAQPage',
  mainEntity: questions.map((x) => ({ '@type': 'Question', name: x.q, acceptedAnswer: { '@type': 'Answer', text: x.a } })),
});

/** A breadcrumb trail from home, for a page under another. */
export const crumbsOf = (trail: readonly { name: string; path: string }[]) => ({
  '@type': 'BreadcrumbList',
  itemListElement: trail.map((t, i) => ({ '@type': 'ListItem', position: i + 1, name: t.name, item: `${ORIGIN}${t.path}` })),
});

/** The JSON-LD block for these nodes, safe to put inside a `<script>`: no `<` survives to close it early. */
export const ldOf = (nodes: readonly object[]): string =>
  `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': nodes }).replace(/</g, '\\u003c')}</script>`;
