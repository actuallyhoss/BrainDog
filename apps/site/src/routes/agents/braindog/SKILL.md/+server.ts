/**
 * `/agents/braindog/SKILL.md`: BrainDog's Agent Skill, the file an agent is handed to learn when and how to use the record.
 *
 * ONE TEXT, READ FROM WHERE IT IS WRITTEN (contracts X25). OPS-26 owns `skills/braindog/SKILL.md` at the repository's root,
 * `braindog install` places that same file, and a copy in this site's `static/` would be a second text that drifts from it
 * the first time either is edited. So this reads the file through `node:fs` at prerender, the pattern the pack catalogue
 * uses (`lib/packs/read.server.ts`, site.md C9), and an import is not an option because the file is not a module.
 *
 * A MISSING FILE STOPS THE BUILD. The page links here, and an empty answer or a 404 would be a link that goes nowhere,
 * so a build that cannot find the text fails where somebody will see it rather than ship a hole.
 *
 * `text/markdown` IS SAID HERE for the dev server and the prerender. Once built, the file is served by the static host,
 * which names its type from the `.md` on the end, as the docs' raw pages are.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const prerender = true;

/**
 * Where the file sits. A build runs from `apps/site` (`pnpm --filter`), and a script run from the repository's root is
 * the other place anyone starts one; the first that holds the file wins.
 */
const PLACES = ['../../skills/braindog/SKILL.md', 'skills/braindog/SKILL.md'];

export const GET = (): Response => {
  const path = PLACES.map((p) => resolve(process.cwd(), p)).find((p) => existsSync(p));
  if (path === undefined) throw new Error(`The Agent Skill is not at skills/braindog/SKILL.md (looked from ${process.cwd()}).`);
  return new Response(readFileSync(path, 'utf8'), { headers: { 'content-type': 'text/markdown; charset=utf-8' } });
};
