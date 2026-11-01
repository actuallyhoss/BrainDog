/**
 * The docs, found in the tree: every `src/docs/<NN-section>/<NN-slug>.md` as a page, in reading order.
 *
 * THE GLOB IS THE LIST, so adding a page adds a file and edits nothing here, and each section owns its
 * own folder. The files are read raw at build time.
 *
 * ONLY SERVER LOADS AND ENDPOINTS IMPORT THIS, so the text of every page rides in the prerendered files
 * and never in a script the browser loads for a page that shows one of them.
 *
 * A PART HELD UNTIL LAUNCH (`<!-- launch: repo -->` … `<!-- /launch -->`, `launched` in `pages.ts`) is read with the
 * site's own `LAUNCH`, so it is in the page, its text and the search on the day its flag is, and not before.
 *
 * EMPTY UNDER PLAIN NODE, where Vite has not replaced `import.meta.env` and `import.meta.glob` does not
 * exist, for the reason `lib/nav.ts` gives: a test can import this file without a build.
 */
import { SECTIONS, byOrder, docOf, plainOf, type Doc, type Entry, type Section } from './pages.ts';
import { docsWords } from './words.ts';
import { LAUNCH } from '../launch.ts';
import { CODEX_LISTED } from '../agents.ts';

const files: Record<string, string> = import.meta.env
  ? import.meta.glob<string>('/src/docs/**/*.md', { query: '?raw', import: 'default', eager: true })
  : {};

/** Every page, in the order the docs are read. */
export const DOCS: readonly Doc[] = Object.entries(files)
  .map(([key, src]) => docOf(key, src, { ...LAUNCH, codex: CODEX_LISTED }))
  .sort(byOrder);

/** The page at `/docs/<section>/<slug>`, or `null`. */
export const find = (section: string, slug: string): Doc | null =>
  DOCS.find((d) => d.section === section && d.slug === slug) ?? null;

/** A link to one page: all a list of pages needs, without the text. */
export type PageLink = { path: string; title: string };

/** A section as the landing page and the nav draw it: its words and its pages in order. */
export type SectionCard = { id: Section; label: string; blurb: string; glyph: (typeof docsWords.sections)[Section]['glyph']; pages: readonly PageLink[] };

/** Every section, in order, with the pages it has today. A section with none is still drawn, as a card saying so. */
export const sections = (): SectionCard[] =>
  SECTIONS.map((id) => ({
    id,
    ...docsWords.sections[id],
    pages: DOCS.filter((d) => d.section === id).map((d) => ({ path: d.path, title: d.title })),
  }));

/**
 * The search's index: titles, headings and summaries of every page, with the marks taken out, built at
 * prerender and handed to the page as data. A few words a page, so it is small enough to ride with each.
 */
export const searchIndex = (): Entry[] =>
  DOCS.map((d) => ({
    path: d.path,
    title: d.title,
    section: docsWords.sections[d.section].label,
    summary: plainOf(d.summary),
    headings: d.headings.map((h) => ({ id: h.id, text: plainOf(h.text) })),
  }));
