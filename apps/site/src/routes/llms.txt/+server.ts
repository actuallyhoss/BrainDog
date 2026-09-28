/**
 * `/llms.txt`: the docs as a list an agent reads first, in the shape llmstxt.org proposes.
 *
 * A TITLE, A ONE-LINE SUMMARY AS A QUOTE, A PARAGRAPH, THEN ONE `##` LIST PER SECTION, each line a
 * link to a page's raw text and its summary. The links are to the `.md` addresses (site.md C7), so an
 * agent that follows one reads the page as written rather than the HTML drawn from it. A section with
 * no page yet is left out, so every link here answers.
 *
 * PRERENDERED from the same glob as the pages, so it names exactly the pages the build wrote. No type
 * is set: a string body is served as text, and once built the static host names the type from `.txt`.
 */
import { DOCS } from '$lib/docs/index.ts';
import { SECTIONS, plainOf } from '$lib/docs/pages.ts';
import { docsWords } from '$lib/docs/words.ts';
import { MCP } from '$lib/links.ts';

export const prerender = true;

const ORIGIN = 'https://brain.dog';

export const GET = (): Response => {
  const w = docsWords.llms;
  const lines = [`# ${w.title}`, '', `> ${w.summary}`, '', w.about, ''];

  for (const section of SECTIONS) {
    const docs = DOCS.filter((d) => d.section === section);
    if (docs.length === 0) continue;
    lines.push(`## ${docsWords.sections[section].label}`, '');
    for (const d of docs) {
      const summary = plainOf(d.summary);
      lines.push(`- [${d.title}](${ORIGIN}${d.path}.md)${summary === '' ? '' : `: ${summary}`}`);
    }
    lines.push('');
  }

  lines.push(`## ${w.connect}`, '', `- [MCP](${MCP}): ${w.mcp}`, '');

  return new Response(lines.join('\n'));
};
