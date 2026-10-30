/**
 * `/legal/terms`, `/legal/privacy` and `/legal/processing`: the owner's texts, read at build time.
 *
 * THE PAGES EXIST BEFORE THE TEXTS DO, so the strict prerender passes on any day and the address a
 * text will live at never changes. Until `LAUNCH.legal` the page says one sentence and carries
 * `noindex`; after it, it draws `apps/site/legal/<name>.md`.
 *
 * THE FOLDER IS OUTSIDE `src` so a company's name in a legal text never meets the `shell-words` gate.
 * Vite reads it through the glob below at build time, which is why a missing file is an absent key
 * and not a failed import: the owner drafts the files, and this page is built before them.
 *
 * A SERVER LOAD, so the texts ride in the prerendered HTML and never in a script the browser loads.
 */
import { error } from '@sveltejs/kit';
import { LAUNCH } from '$lib/launch.ts';
import type { EntryGenerator, PageServerLoad } from './$types';

export const prerender = true;

/** The texts drawn, the same three `LEGAL_TEXTS` names for the sitemap. `acceptable-use` and `refunds` sit in the folder too and are not drawn yet. */
const NAMES = ['terms', 'privacy', 'processing'] as const;
type Name = (typeof NAMES)[number];

const isName = (name: string): name is Name => (NAMES as readonly string[]).includes(name);

export const entries: EntryGenerator = () => NAMES.map((name) => ({ name }));

const files = import.meta.glob<string>('../../../../legal/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** One piece of a text, drawn as Svelte elements and never as HTML, so nothing in a file can script the page. */
type Block =
  | { kind: 'h2' | 'h3' | 'p'; text: string }
  | { kind: 'ul'; items: string[] };

/**
 * The plain Markdown a legal text is written in: headings, paragraphs and bullet lists.
 *
 * A `#` title is dropped, because the page's own heading already names the text. Emphasis marks are
 * dropped and a link keeps its words with its address after them, which is what a legal text needs
 * and all this page draws; anything richer reads as a paragraph rather than failing the build.
 */
const blocks = (source: string): Block[] => {
  const inline = (text: string): string =>
    text
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
      .replace(/(\*\*|__|\*|_)(\S(?:.*?\S)?)\1/g, '$2')
      .trim();
  const out: Block[] = [];
  let para: string[] = [];
  let list: string[] | null = null;
  const flush = (): void => {
    if (para.length) out.push({ kind: 'p', text: inline(para.join(' ')) });
    para = [];
    if (list) out.push({ kind: 'ul', items: list });
    list = null;
  };
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    const item = /^[-*+]\s+(.*)$/.exec(line) ?? /^\d+[.)]\s+(.*)$/.exec(line);
    if (line === '') {
      flush();
    } else if (heading) {
      flush();
      const depth = heading[1]?.length ?? 1;
      if (depth > 1) out.push({ kind: depth === 2 ? 'h2' : 'h3', text: inline(heading[2] ?? '') });
    } else if (item) {
      if (para.length) flush();
      list ??= [];
      list.push(inline(item[1] ?? ''));
    } else if (list && raw.startsWith(' ')) {
      /* A wrapped list item continues the item above it. */
      list.push(`${list.pop() ?? ''} ${inline(line)}`);
    } else {
      if (list) flush();
      para.push(line);
    }
  }
  flush();
  return out;
};

export const load: PageServerLoad = ({ params }) => {
  if (!isName(params.name)) error(404, 'Not found');
  const source = LAUNCH.legal ? files[`../../../../legal/${params.name}.md`] : undefined;
  return { name: params.name, text: source === undefined ? null : blocks(source) };
};
