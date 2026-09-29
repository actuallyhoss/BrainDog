/**
 * `/docs/<section>/<slug>.md`: a docs page as the dialect text it is written in, for an agent to read.
 *
 * THE FILE AS WRITTEN, title line and fences included, so an agent reads what a person sees drawn and
 * can write a page of its own from the same grammar. Prerendered like the page beside it, from the same
 * glob, so the two addresses exist together or not at all.
 *
 * `text/markdown` IS SAID HERE for the dev server and the prerender. Once built, the file is served by
 * the static host, which names its type from the `.md` on the end.
 */
import { error } from '@sveltejs/kit';
import { DOCS, find } from '$lib/docs/index.ts';
import type { EntryGenerator, RequestHandler } from './$types';

export const prerender = true;

export const entries: EntryGenerator = () => DOCS.map((d) => ({ section: d.section, slug: d.slug }));

export const GET: RequestHandler = ({ params }) => {
  const doc = find(params.section, params.slug);
  if (!doc) error(404, 'No docs page at this address.');
  return new Response(doc.src, { headers: { 'content-type': 'text/markdown; charset=utf-8' } });
};
