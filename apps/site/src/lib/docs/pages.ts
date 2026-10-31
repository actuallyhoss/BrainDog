/**
 * What the docs decide, as plain functions over their text: which file is which page, its title and
 * summary, the `##` headings a reader can jump to, the order the pages are read in, and what a search
 * finds.
 *
 * KEPT OUT OF `index.ts` AND THE COMPONENTS for the reason `lib/app/page.ts` keeps its plans out of
 * `Page.svelte`: none of it is markup or Vite, so a Node test can import it and check it without a
 * build. `index.ts` is the one file that asks Vite for the pages.
 */
import { parse, type Segment } from 'braindog-render';

/** The sections, in the order the docs are read. A folder is `NN-<section>`, numbered from 01. */
export const SECTIONS = ['start', 'use', 'agents', 'api', 'dialect', 'packs'] as const;
export type Section = (typeof SECTIONS)[number];

/** Where the pages live in the repository, for the link that edits one. */
export const DOCS_DIR = 'apps/site/src/docs/';

/** The most results a search draws. A query of one letter matches most pages, and a list that long helps nobody. */
export const MAX_HITS = 12;

export type Heading = { id: string; text: string };

export type Doc = {
  section: Section;
  slug: string;
  /** The path from `DOCS_DIR`, as `01-start/01-welcome.md`. */
  file: string;
  /** The page's address, as `/docs/start/welcome`. The raw text is the same address with `.md` on the end. */
  path: string;
  title: string;
  /** The first paragraph, as written, inline marks and all. */
  summary: string;
  headings: readonly Heading[];
  /** The whole file, title line included: what an agent reads at the `.md` address. */
  src: string;
};

/** A piece of a page's body: a heading this site draws with its anchor, or a segment the renderer draws. */
export type Part = { t: 'heading'; id: string; text: string } | { t: 'segment'; segment: Segment };

/** One page as the search knows it: words only, with the inline marks taken out. */
export type Entry = { path: string; title: string; section: string; summary: string; headings: readonly Heading[] };

/** One result: where it goes, and the line that matched under the page's title. */
export type Hit = { href: string; title: string; section: string; line: string };

/* The byte-order mark an editor on Windows may put before line one, which would hide the title from `TITLE`. */
const BOM = String.fromCharCode(0xfeff);

const FILE = /^\/src\/docs\/(\d{2})-([a-z0-9-]+)\/(\d{2})-([a-z0-9-]+)\.md$/;
const TITLE = /^#\s+(.+)$/;
/* A `#` after the title is drawn as a section too, because a page has one title and it is line one. */
const HEADING = /^#{1,2}\s+(.+)$/;

/**
 * The ids the page frame uses itself, so a heading called "Main" or "Contents" never gives two elements
 * one id, which would send its anchor to whichever the browser finds first.
 */
const TAKEN = ['main', 'doc-title', 'doc-contents', 'docs-search', 'docs-search-phone'] as const;

/** The folder a section lives in: `01-start` for the first. */
export const folderOf = (section: Section): string => `${String(SECTIONS.indexOf(section) + 1).padStart(2, '0')}-${section}`;

const isSection = (name: string): name is Section => (SECTIONS as readonly string[]).includes(name);

/** Text with its inline marks taken out: a link keeps its words, code keeps its letters. */
export function plainOf(text: string): string {
  return text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The anchor a heading's words make: lower case, letters and digits, a hyphen between words. */
export function slugOf(text: string): string {
  const slug = plainOf(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return slug === '' ? 'part' : slug;
}

/**
 * The launch flags a page may hold a part back on, as `LAUNCH` in `lib/launch.ts` has them. Only the flag's value is
 * read here, so a Node test can hand in its own.
 */
export type LaunchFlags = Readonly<Record<string, boolean>>;

/* A PART HELD UNTIL LAUNCH: a line `<!-- launch: repo -->`, the part, and a line `<!-- /launch -->`. Each marker is a
   line of its own, so a fence's text never opens or closes one. `<!-- launch: !codex -->` is the other way round: the
   part shows while the flag is off, so a sentence can have its words for before and after. */
const HELD_OPEN = /^<!-- launch: (!?)([a-z]+) -->$/;
const HELD_CLOSE = /^<!-- \/launch -->$/;

/**
 * A page's text with its held parts as the flags say: a part whose flag is true is kept and loses its two markers, and
 * one whose flag is false is taken out, so neither the page, its `.md` address, its headings nor the search holds it.
 *
 * THE DOCS HOLD BACK WHAT THE SITE HOLDS BACK (`LAUNCH`): the plugin line named a private repository, and a stranger
 * who followed it met a 404 (door audit D10). A marker naming no flag, or one left open, stops the build with a sentence
 * naming the file, as a broken page does.
 */
export function launched(key: string, src: string, launch: LaunchFlags): string {
  const out: string[] = [];
  let open: string | null = null;
  let shown = false;
  /* A PART TAKEN OUT LEAVES A BLANK LINE ON EACH SIDE; the one after it goes too, so one paragraph break stays. */
  let dropped = false;
  for (const line of src.split('\n')) {
    if (dropped) {
      dropped = false;
      if (line.trim() === '' && (out.at(-1) ?? '').trim() === '') continue;
    }
    const start = HELD_OPEN.exec(line.trim());
    if (start) {
      const flag = start[2] ?? '';
      if (open !== null) throw new Error(`${key} opens a launch part inside another. Close the first with <!-- /launch --> before the next.`);
      if (!(flag in launch)) throw new Error(`${key} holds a part on "${flag}", which is not a launch flag. The flags are ${Object.keys(launch).join(', ')}.`);
      open = flag;
      shown = (launch[flag] === true) !== (start[1] === '!');
      continue;
    }
    if (HELD_CLOSE.test(line.trim())) {
      if (open === null) throw new Error(`${key} closes a launch part it never opened.`);
      dropped = !shown;
      open = null;
      continue;
    }
    if (open === null || shown) out.push(line);
  }
  if (open !== null) throw new Error(`${key} leaves the launch part on "${open}" open. Close it with <!-- /launch -->.`);
  return out.join('\n');
}

/** The file without its title line. A file with nothing after the title has an empty body. */
export function bodyOf(src: string): string {
  const end = src.indexOf('\n');
  return end === -1 ? '' : src.slice(end + 1);
}

/**
 * A page's body cut into what is drawn: each `##` line becomes a heading with an anchor, and the prose
 * between them and every fence stay the renderer's.
 *
 * THE HEADINGS ARE CUT OUT OF THE PROSE HERE because the renderer draws a heading with no id (it has no
 * page to anchor to), and the contents list needs one. Only prose is read for them, so a `##` inside a
 * fence stays the fence's text. The ids are unique on the page: a second "Examples" is `examples-2`.
 */
export function partsOf(body: string): { parts: Part[]; headings: Heading[] } {
  const parts: Part[] = [];
  const headings: Heading[] = [];
  const used = new Set<string>(TAKEN);
  const unique = (base: string): string => {
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
    used.add(id);
    return id;
  };

  for (const segment of parse(body, { page: true })) {
    if (segment.type !== 'markdown') {
      parts.push({ t: 'segment', segment });
      continue;
    }
    let chunk: string[] = [];
    const flush = () => {
      const text = chunk.join('\n');
      if (text.trim() !== '') parts.push({ t: 'segment', segment: { type: 'markdown', text, start: segment.start, end: segment.end } });
      chunk = [];
    };
    for (const line of segment.text.split('\n')) {
      const h = HEADING.exec(line.trim());
      if (!h) {
        chunk.push(line);
        continue;
      }
      flush();
      const text = (h[1] ?? '').trim();
      const id = unique(slugOf(text));
      parts.push({ t: 'heading', id, text });
      headings.push({ id, text });
    }
    flush();
  }
  return { parts, headings };
}

/**
 * The first paragraph of the body's prose: the page's summary. A heading, a list or a rule
 * is not a paragraph, so the summary is the first run of ordinary lines, joined as the renderer joins them.
 */
export function summaryOf(body: string): string {
  const first = parse(body, { page: true }).find((s) => s.type === 'markdown');
  if (!first || first.type !== 'markdown') return '';
  let para: string[] = [];
  for (const raw of first.text.split('\n')) {
    const line = raw.trim();
    const other = line === '' || /^#{1,4}\s/.test(line) || /^[-*]\s/.test(line) || /^([-*_])\1{2,}$/.test(line);
    if (!other) {
      para.push(line);
      continue;
    }
    if (para.length > 0) break;
    para = [];
  }
  return para.join(' ');
}

/**
 * One file as a page. `key` is the glob's, `/src/docs/01-start/01-welcome.md`.
 *
 * A FILE THAT BREAKS THE SHAPE STOPS THE BUILD with a sentence naming it, rather than being left out:
 * a page quietly missing from the docs is found by a reader, and a failed build is found by its author.
 */
export function docOf(key: string, src: string, launch: LaunchFlags = {}): Doc {
  const m = FILE.exec(key);
  const section = m?.[2] ?? '';
  if (!m || !isSection(section) || folderOf(section) !== `${m[1]}-${section}`) {
    throw new Error(`${key} is not in a docs section folder. The folders are ${SECTIONS.map(folderOf).join(', ')}, each holding NN-slug.md files.`);
  }
  const text = launched(key, (src.startsWith(BOM) ? src.slice(1) : src).replace(/\r\n/g, '\n'), launch);
  const title = TITLE.exec((text.split('\n', 1)[0] ?? '').trim())?.[1]?.trim() ?? '';
  if (title === '') throw new Error(`${key} does not open with its title. Line one of a docs page is "# Title".`);

  const body = bodyOf(text);
  const slug = m[4] ?? '';
  return {
    section,
    slug,
    file: `${m[1]}-${section}/${m[3]}-${slug}.md`,
    path: `/docs/${section}/${slug}`,
    title,
    summary: summaryOf(body),
    headings: partsOf(body).headings,
    src: text,
  };
}

/** The reading order: section by section, then by each file's number. */
export const byOrder = (a: Doc, b: Doc): number => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0);

/** The pages before and after one, across section ends, so the last page of a section leads into the next. */
export function neighbours(docs: readonly Doc[], doc: Doc): { prev: Doc | null; next: Doc | null } {
  const at = docs.findIndex((d) => d.path === doc.path);
  return { prev: at > 0 ? (docs[at - 1] ?? null) : null, next: at >= 0 ? (docs[at + 1] ?? null) : null };
}

/**
 * The pages a query finds, best first.
 *
 * EVERY WORD MUST APPEAR, in the title, a heading or the summary, so adding a word narrows the list the
 * way a reader expects. A title that holds them all ranks first, then a heading that does, which the
 * result links to by its anchor, then the rest.
 */
export function search(entries: readonly Entry[], query: string): Hit[] {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w !== '');
  if (words.length === 0) return [];
  const has = (text: string): boolean => {
    const low = text.toLowerCase();
    return words.every((w) => low.includes(w));
  };

  const ranked: { hit: Hit; rank: number }[] = [];
  for (const e of entries) {
    if (!has([e.title, e.summary, ...e.headings.map((h) => h.text)].join(' '))) continue;
    const heading = e.headings.find((h) => has(h.text));
    const rank = has(e.title) ? 0 : heading ? 1 : 2;
    ranked.push({
      rank,
      hit: {
        href: rank === 1 && heading ? `${e.path}#${heading.id}` : e.path,
        title: e.title,
        section: e.section,
        line: rank === 1 && heading ? heading.text : e.summary,
      },
    });
  }
  return ranked
    .sort((a, b) => a.rank - b.rank)
    .slice(0, MAX_HITS)
    .map((r) => r.hit);
}
