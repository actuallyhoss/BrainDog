/**
 * `/docs`: the seven sections as cards, and the search over every page.
 *
 * A SERVER LOAD, so the pages' text is read at build time and only the list of titles and the search's
 * index ride in the prerendered page, never the text of every page in a script.
 */
import { searchIndex, sections } from '$lib/docs/index.ts';
import type { PageServerLoad } from './$types';

export const prerender = true;

export const load: PageServerLoad = () => ({ sections: sections(), index: searchIndex() });
