/**
 * Every sentence on brain.dog, gathered from one file per page under `copy/`.
 *
 * THIS FILE TYPES NO SENTENCE. It spreads the nine area files into `site` and re-exports the
 * addresses from `links.ts`, so every import in the site and its tests reads as it always has. A page
 * may import its own area file directly. Nobody adds a line here: a new key goes in its area's file.
 *
 * THE VOICE, in five rules:
 *   - Say what it does. Never sell it, never adjective it, never "powerful" or "seamless".
 *   - A CTA is Verb + Noun. Never "Get Started", never "Learn More".
 *   - A number is a real number or it is absent. No "10x", no "up to".
 *   - Say the limits out loud. A page that lists only strengths is a page nobody believes twice.
 *   - NO EM DASHES, anywhere a person reads. Write two sentences, or use a colon.
 *
 * AND A SIXTH, THE OWNER'S (`loop/DIRECTION.md` §19): a figure earns its place by answering a question
 * the reader was already asking. The home page counts none of the product's own parts; `/agents` may,
 * because a reader arrives there to ask exactly that.
 *
 * The site describes the finished product in the present tense (`loop/DIRECTION.md` §33). A sentence
 * that is true only after launch reads a flag in `launch.ts`.
 */
import { agents } from './copy/agents.ts';
import { cases } from './copy/cases.ts';
import { changelog } from './copy/changelog.ts';
import { forPages } from './copy/for.ts';
import { home } from './copy/home.ts';
import { packs } from './copy/packs.ts';
import { pricing } from './copy/pricing.ts';
import { shell } from './copy/shell.ts';
import { trust } from './copy/trust.ts';

export { APP, BUILD, CLI_INSTALL, DOCS, FEED, MCP, MCP as MCP_URL, PACKS, SECURITY, SIGNIN, SIGNUP, SKILL, SOURCE, STATUS, SUPPORT, SUPPORT_EMAIL } from './links.ts';
export { LAUNCH } from './launch.ts';

export const site = {
  ...shell,
  ...home,
  ...cases,
  ...pricing,
  ...agents,
  ...packs,
  ...forPages,
  ...trust,
  ...changelog,
} as const;
