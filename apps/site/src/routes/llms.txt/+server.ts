/**
 * `/llms.txt`: the docs as a list an agent reads first, in the shape llmstxt.org proposes.
 *
 * A TITLE, A ONE-LINE SUMMARY AS A QUOTE, A PARAGRAPH, THEN THE SITE'S OWN PAGES, each with its search result, THEN
 * ONE `##` LIST PER DOCS SECTION, each line a link to a page's raw text and its summary. The links are to the `.md` addresses, so an
 * agent that follows one reads the page as written rather than the HTML drawn from it. A section with
 * no page yet is left out, so every link here answers.
 *
 * PRERENDERED from the same glob as the pages, so it names exactly the pages the build wrote. No type
 * is set: a string body is served as text, and once built the static host names the type from `.txt`.
 */
import { DOCS } from '$lib/docs/index.ts';
import { SECTIONS, plainOf } from '$lib/docs/pages.ts';
import { docsWords } from '$lib/docs/words.ts';
import { shell } from '$lib/copy/shell.ts';
import { trust } from '$lib/copy/trust.ts';
import { packs } from '$lib/copy/packs.ts';
import { forPages } from '$lib/copy/for.ts';
import { MCP } from '$lib/links.ts';
import { PAGES } from '$lib/nav.ts';

export const prerender = true;

const ORIGIN = 'https://brain.dog';

export const GET = (): Response => {
  const w = docsWords.llms;
  const lines = [`# ${w.title}`, '', `> ${w.summary}`, '', `## ${w.factsTitle}`, '', ...w.facts.map((f) => `- ${f}`), '', w.about, ''];

  /* The site's pages, each only while it is a page the site has (`PAGES` in `nav.ts`). */
  const site = [
    { path: '/', name: w.pages.home, says: shell.meta.home.description },
    { path: '/slash', name: w.pages.slash, says: shell.meta.slash.description },
    { path: '/agents', name: w.pages.agents, says: shell.meta.agents.description },
    { path: '/pricing', name: w.pages.pricing, says: shell.meta.pricing.description },
    { path: '/download', name: w.pages.download, says: shell.meta.download.description },
    { path: '/plugins', name: w.pages.plugins, says: packs.packs.meta.description },
    { path: '/for/founders', name: w.pages.founders, says: forPages.person.who.founder.description },
    { path: '/for/teams', name: w.pages.teams, says: forPages.person.who.team.description },
    { path: '/for/personal', name: w.pages.personal, says: forPages.person.who.personal.description },
    { path: '/security', name: w.pages.security, says: trust.security.meta.description },
    { path: '/support', name: w.pages.support, says: trust.support.meta.description },
    { path: '/docs', name: w.pages.docs, says: docsWords.meta.description },
    { path: '/changelog', name: w.pages.changelog, says: shell.meta.changelog.description },
  ].filter((p) => PAGES.some((q) => q.path === p.path));
  if (site.length > 0) {
    lines.push(`## ${w.site}`, '');
    for (const p of site) lines.push(`- [${p.name}](${ORIGIN}${p.path}): ${p.says}`);
    lines.push('');
  }

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

  lines.push(`## ${w.connect}`, '', `- [${w.address}](${MCP}): ${w.mcp}`, '');

  return new Response(lines.join('\n'));
};
