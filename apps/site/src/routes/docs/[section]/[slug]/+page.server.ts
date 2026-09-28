/**
 * `/docs/<section>/<slug>`: one docs page, with the nav, the page before and after it, and the search.
 *
 * EVERY PAGE IS NAMED BY `entries`, which reads the same glob the page does, so the strict prerender
 * writes each one whether or not another page links to it, and never an address with no file.
 *
 * A SERVER LOAD, so the page's text rides in its own prerendered HTML and data, and the other pages'
 * text stays out of it: the nav and the search carry titles, headings and summaries only.
 */
import { error } from '@sveltejs/kit';
import { DOCS, find, searchIndex, sections } from '$lib/docs/index.ts';
import { neighbours } from '$lib/docs/pages.ts';
import type { EntryGenerator, PageServerLoad } from './$types';

export const prerender = true;

export const entries: EntryGenerator = () => DOCS.map((d) => ({ section: d.section, slug: d.slug }));

export const load: PageServerLoad = ({ params }) => {
  const doc = find(params.section, params.slug);
  if (!doc) error(404, 'No docs page at this address.');
  const { prev, next } = neighbours(DOCS, doc);
  const link = (d: typeof doc | null) => (d ? { path: d.path, title: d.title } : null);
  return { doc, prev: link(prev), next: link(next), sections: sections(), index: searchIndex() };
};
