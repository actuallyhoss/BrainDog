/**
 * What a search engine, a link preview and an AI search tool read about a page, said once for the whole site.
 *
 * `Seo.svelte` draws a page's head from these: its title, description, canonical address, Open Graph and Twitter
 * cards with a picture made for that page, and the structured data (JSON-LD) that names the company, the site and the
 * app. Every page passes its own words; nothing here is a sentence a reader sees on the page.
 *
 * THE PICTURES are drawn by `scripts/product.mjs` out of each built page's own head (its h1 and the line under it), at
 * 1200 by 630, into `static/shots/`. A page with none of its own uses the home card.
 *
 * THE COMPANY is Quartz Apps LLC, the name the Terms and the Privacy Policy give (`legal/`). The offer is the one the
 * pricing page says today: free while in early access, so `price` is 0 and no paid plan is named until billing is live.
 */
import { SUPPORT_EMAIL } from '../links.ts';
import { TABLE } from '../plans.ts';
import { LAUNCH } from '../launch.ts';

export const ORIGIN = 'https://brain.dog';

/** The page's own card where it has one, by path; every other page uses the home card. */
const CARDS: Record<string, string> = {
  '/': '/shots/home-light.png',
  '/pricing': '/shots/og-pricing.png',
  '/agents': '/shots/og-agents.png',
  '/slash': '/shots/og-slash.png',
  '/security': '/shots/og-security.png',
  '/support': '/shots/og-support.png',
  '/docs': '/shots/og-docs.png',
  '/for/founders': '/shots/og-for-founders.png',
};

/** The paths `scripts/product.mjs` draws a card for, home first. */
export const CARD_PATHS: readonly string[] = Object.keys(CARDS);

/** The card a path is shown with, as an absolute address: a docs page takes the docs card. */
export function cardOf(path: string): string {
  const own = CARDS[path] ?? (path.startsWith('/docs/') ? CARDS['/docs'] : CARDS['/']);
  return `${ORIGIN}${own}`;
}

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

/**
 * The app, with the offer the pricing page makes. While billing is off that is one: Free, at $0. The paid
 * plans join as offers the day `LAUNCH.billing` is on and the pricing page prices them.
 */
export const application = {
  '@type': 'SoftwareApplication',
  '@id': APP_ID,
  name: 'BrainDog',
  url: `${ORIGIN}/`,
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web, Windows',
  description:
    'One place for your projects, decisions and money that every agent you use reads before it starts and writes to when it stops, with one list of what needs you and every change signed and undoable.',
  publisher: { '@id': ORG_ID },
  offers: LAUNCH.billing
    ? [TABLE.free, TABLE.hosted, TABLE.plus].map((row) => ({
        '@type': 'Offer',
        name: row.name,
        price: (row.cents.month / 100).toFixed(2),
        priceCurrency: 'USD',
        url: `${ORIGIN}/pricing`,
      }))
    : [{ '@type': 'Offer', name: TABLE.free.name, price: '0', priceCurrency: 'USD', url: `${ORIGIN}/pricing` }],
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
