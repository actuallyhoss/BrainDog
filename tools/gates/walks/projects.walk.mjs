/**
 * Projects and a project's own page, walked in a real browser: where every project stands, the strip, and the tools that
 * are the project's own.
 *
 *   node tools/gates/walks/projects.walk.mjs
 *
 * WHY THIS EXISTS (PGS-C17's and PGS-C31's guard). The declaration's test (`packages/seed/test/projects-page.test.ts`)
 * holds Where they are, the In play and earning strip and the health split through the record, and
 * `packages/seed/test/portfolio-runs-on.test.ts` holds a project's Tools and servers to its own. NOTHING HAD LOOKED AT
 * THEM. A split the app does not draw, a strip that renders as nothing, or a project page that lists every tool of
 * everybody's passes each of those tests, and the first person to find it would be the person whose projects they are.
 *
 * WHAT IT WALKS: on the seeded record with six more projects, five in play over Building and Earning and one parked, one of them
 * saying how it is going, and three tools that apply everywhere and one of the first project's own. Open Projects: it opens
 * on a headline that is a fact, with the Earning, a month tile, the This week strip of four counts, the one list of the
 * projects in play under an Earning group and a Building group, and the parked one as a chip. Open the first project: Tools
 * and servers names its own tool. Open the second: no Tools and servers, since nothing there is its own. At the phone's
 * width and the desk's (`WIDTHS` says why the desk is 1512 and not the 1440 the scope names).
 *
 * TWO HALVES, as `row-drawer.walk.mjs` has. `judge` is a pure function of what was read, so each promise taken away is
 * red in the words of what was missing; the drive below it only presses and reads.
 *
 * NO BUILD, NO RUN. It says it walked nothing and returns 3, which `run.mjs` counts as a skip and never as a pass. ITS
 * OWN EPHEMERAL PORT (`server.listen(0)`), and every handle it opens is given back in one `finally`.
 */

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, STATUS_CODES } from 'node:http';
import { extname, join, normalize } from 'node:path';

import { chromium } from '@playwright/test';

import { APP_BASE, appShell, budget, openPage, readiness } from '../lib.mjs';
import { answers, forward, forwards, serverKeyFor, startRecord } from '../record.mjs';

/* THE PREREQUISITE IS THE RUNNER'S QUESTION (`52 §5.1` step 2): it reads this line before it calls the walk. */
export const needs = ['web-build'];

/** The phone's width and the desk's, the two every screen is audited at (`budgets.json`, `a11y.widths`). */
export const WIDTHS = budget('a11y').widths;

/** The headings and words the pages declare, read off the screen by their words. */
export const EARNING = 'Earning, a month';
export const WEEK = 'This week';
export const WEEK_CELLS = ['Late', 'Due in 7 days', 'Numbers gone quiet', 'Renewals, 60 days'];
/** The list's groups: the earning ones first, then the building ones; the group names open the heading's words. */
export const GROUPS = ['Earning', 'Building'];
export const TOOLS = 'Tools and servers';

/** Six invented projects: five in play over two lanes and one parked, so three lanes; the fourth says how it is going. */
export const PROJECTS = [
  { name: 'Bindery', lane: 'building' },
  { name: 'Lantern', lane: 'building' },
  { name: 'Saltmarsh', lane: 'building' },
  { name: 'Quill', lane: 'earning', health: 'on_track' },
  { name: 'Orchard', lane: 'earning' },
  { name: 'Harbour', lane: 'parked' },
];

/** The project with a tool of its own, the one with none, and the tools: three that apply everywhere, one of the first's. */
export const FIRST = PROJECTS[0].name;
export const SECOND = PROJECTS[1].name;
export const EVERYWHERE = ['ripgrep', 'jq', 'httpie'];
export const OWN_TOOL = 'bindery-cli';
/** HOW THE PAGE SAYS IT: a name typed as a slug is said in words (`wordsOf`), so the tool is read as "Bindery cli". */
export const OWN_TOOL_SAID = 'Bindery cli';

/** A project's page address, from its name as the record makes a slug of a title. */
const slugOf = (name) => name.toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '');

/**
 * What one walk fell short of, each as a sentence that starts with its width. An empty list is a pass.
 *
 * `seen` is `{ width, headline, earning, week, cells: { [label]: visible }, groups: string[] | null, listed: { [name]: visible },
 * parked, first: { tools, own }, second: { tools } }`: the headline's words, the group headings' words, and booleans the
 * drive read, or `null` where it could not read it. `null` is never a pass.
 */
export function judge(seen) {
  const out = [];
  const say = (line) => out.push(`${seen.width}: ${line}`);
  if (typeof seen.headline !== 'string' || !/[a-z].*\.$/u.test(seen.headline.trim())) say(`Projects opens on no headline sentence (read ${JSON.stringify(seen.headline)}).`);
  if (seen.earning !== true) say(`Projects draws no "${EARNING}" tile with two projects earning.`);
  if (seen.week !== true) say(`Projects draws no "${WEEK}" strip with projects in play.`);
  else for (const c of WEEK_CELLS) if (seen.cells?.[c] !== true) say(`"${WEEK}" does not say "${c}".`);
  if (!Array.isArray(seen.groups)) say('Projects draws no list of the projects in play.');
  else {
    for (const g of GROUPS) if (!seen.groups.some((h) => h.startsWith(g))) say(`the list of projects in play has no "${g}" group with five projects in play over two lanes (read ${JSON.stringify(seen.groups)}).`);
    for (const p of PROJECTS.filter((x) => x.lane !== 'parked')) if (seen.listed?.[p.name] !== true) say(`the list of projects in play does not name ${p.name}.`);
  }
  if (seen.parked !== true) say(`Projects does not show ${PROJECTS.find((x) => x.lane === 'parked').name} among the parked.`);
  if (seen.first?.tools !== true) say(`${FIRST}'s page draws no "${TOOLS}" though ${OWN_TOOL} is its own.`);
  else if (seen.first?.own !== true) say(`${FIRST}'s "${TOOLS}" does not name ${OWN_TOOL} (drawn "${OWN_TOOL_SAID}"), its own tool.`);
  if (seen.second?.tools !== false) say(`${SECOND}'s page draws "${TOOLS}" though no tool is its own: it lists what applies everywhere as its own.`);
  return out;
}

/** One write through the record's own door with the gate's key, as a person's own writes are. Its new entry's id. */
async function create(record, register, fields) {
  const said = await fetch(new URL('/api/create', record.base), {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${serverKeyFor(record.base)}` },
    body: JSON.stringify({ register, fields }),
  })
    .then((r) => r.json())
    .catch(() => null);
  if (said?.ok !== true) throw new Error(`the record would not take a new entry in ${register}: ${said?.refusal?.fix ?? 'it did not answer'}`);
  return said.value.id;
}

/** The six projects, the three tools of everybody's and the first project's own. */
async function writeProjects(record) {
  const ids = {};
  for (const p of PROJECTS) ids[p.name] = await create(record, 'things', p);
  for (const name of EVERYWHERE) await create(record, 'tools', { name, kind: 'cli' });
  await create(record, 'tools', { name: OWN_TOOL, kind: 'cli', project: ids[FIRST] });
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json' };
const NOT_FOUND = Number(Object.keys(STATUS_CODES).find((code) => STATUS_CODES[code] === 'Not Found'));

/** The build's own files, the record's doors handed to the record, and the app's shell for every other address. */
function serve(ROOT, record) {
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (forwards(url.pathname)) return forward(req, res, record.base);
    const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
    for (const candidate of rel.includes('..') ? [] : [rel, `${rel}.html`, join(rel, 'index.html')]) {
      const file = join(ROOT, candidate);
      if (!(await stat(file).catch(() => null))?.isFile()) continue;
      res.setHeader('content-type', TYPES[extname(file)] ?? 'application/octet-stream');
      return createReadStream(file).pipe(res);
    }
    if (Object.hasOwn(TYPES, extname(rel)) && extname(rel) !== '.html') {
      res.statusCode = NOT_FOUND;
      return res.end();
    }
    res.setHeader('content-type', TYPES['.html']);
    return createReadStream(appShell(ROOT)).pipe(res);
  });
}

/** Whether `words` is in sight on the page, as its own words. */
const visible = (page, words) => page.getByText(words, { exact: true }).first().isVisible().catch(() => false);

/** Whether `words` comes into sight within `timeout`. */
const arrives = (page, words, timeout) => page.getByText(words, { exact: true }).first().waitFor({ state: 'visible', timeout }).then(() => true, () => false);

/** Projects at one width: the headline, the earning tile, the week's four tiles, the list's groups and the parked. Nothing here decides. */
async function readProjects(page, seen, timeout) {
  seen.earning = await arrives(page, EARNING, timeout);
  const head = page.locator('.b-head').first();
  seen.headline = (await head.isVisible().catch(() => false)) ? ((await head.textContent().catch(() => '')) ?? '') : null;
  seen.week = await page.locator('.b-week').first().isVisible().catch(() => false);
  seen.cells = Object.fromEntries(await Promise.all(WEEK_CELLS.map(async (c) => [c, await visible(page, c)])));
  const list = page.locator('section[aria-label="Projects in play"]');
  const drawn = await list.first().isVisible().catch(() => false);
  seen.groups = drawn ? (await list.locator('h3').allTextContents()).map((t) => t.trim()) : null;
  seen.listed = Object.fromEntries(
    await Promise.all(PROJECTS.map(async (p) => [p.name, drawn && (await list.getByText(p.name, { exact: true }).first().isVisible().catch(() => false))])),
  );
  const parked = PROJECTS.find((x) => x.lane === 'parked').name;
  seen.parked = await page.locator('section[aria-label="Parked and finished"]').getByText(parked, { exact: true }).first().isVisible().catch(() => false);
}

/** A project's page at one width: whether Tools and servers is drawn, and whether it names the project's own tool. */
async function readProject(page, timeout, own) {
  const tools = await arrives(page, TOOLS, timeout);
  return own === undefined ? { tools } : { tools, own: tools && (await visible(page, own)) };
}

/** THE WHOLE WALK, AS A FUNCTION THE RUNNER CALLS. It returns 1 or 3 and falls off the end for a pass. */
export default async function projects(root = join(import.meta.dirname, '..', '..', '..')) {
  const ROOT = join(root, 'apps', 'web', 'build');
  if (!(await stat(ROOT).catch(() => null))?.isDirectory()) {
    console.log('  projects: no apps/web/build to walk, so nothing was opened. Run `pnpm --filter @braindog/web build` first.');
    return 3;
  }
  const findings = [];
  let record = null;
  let server = null;
  let browser = null;
  try {
    /* THE SEEDED RECORD AND NOT A FRESH ONE: a fresh record holds no list of tools (`freshen` installs the seed's lists
       alone, and Tools is the agents pack's), so the project's own tool would have nowhere to go. The sample's four
       projects stand beside the six written here, and none of their tools is Bindery's or Lantern's. */
    record = await startRecord(0);
    await writeProjects(record);
    server = serve(ROOT, record);
    await new Promise((r) => server.listen(0, r));
    const ORIGIN = `http://127.0.0.1:${server.address().port}`;
    await answers(ORIGIN);
    const settle = budget('ready').settleTimeoutMs;
    const ready = readiness('projects', settle, ROOT);
    browser = await chromium.launch();
    for (const width of WIDTHS) {
      const seen = { width, headline: null, earning: null, week: null, cells: {}, groups: null, listed: {}, parked: null, first: null, second: null };
      /* THREE PAGES A WIDTH, each in a context of its own and each given back however its read ends. */
      const visit = async (path, read) => {
        let opened = null;
        try {
          opened = await openPage(browser, `${ORIGIN}${APP_BASE}${path}`, { width, record, ready, waitUntil: 'networkidle' });
          const unmeasured = ready.check(`projects ${path} at ${width}`, path, opened.state);
          if (unmeasured) findings.push(unmeasured);
          await read(opened.page);
          for (const e of opened.errors.filter((e) => e.kind === 'uncaught')) findings.push(`${width}: ${path} threw while it was walked: ${e.text.split('\n')[0]}`);
        } catch (e) {
          findings.push(`${width}: the walk of ${path} stopped: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
        } finally {
          await opened?.context.close().catch(() => {});
        }
      };
      await visit('/p/portfolio', (page) => readProjects(page, seen, settle));
      await visit(`/p/${slugOf(FIRST)}`, async (page) => (seen.first = await readProject(page, settle, OWN_TOOL_SAID)));
      await visit(`/p/${slugOf(SECOND)}`, async (page) => (seen.second = await readProject(page, settle)));
      findings.push(...judge(seen));
    }
    const blind = ready.nothingDrawn();
    if (blind) findings.push(blind);
    if (findings.length === 0) {
      console.log(`projects: at ${WIDTHS.join(' and ')}, Projects drew a headline, ${EARNING}, ${WEEK}, the list and the parked, ${FIRST} named its own tool and ${SECOND} drew no ${TOOLS}.`);
    } else {
      console.error('\n  Projects and a project page, walked in a real browser:');
      for (const f of findings) console.error(`      ${f}`);
      return 1;
    }
  } finally {
    await browser?.close().catch(() => {});
    if (server !== null) await new Promise((r) => server.close(() => r()));
    await record?.close().catch(() => {});
  }
}

/* AND IT IS STILL A SCRIPT, for a person running the file by hand. `?? 0` because a pass returns nothing. */
if (import.meta.main) process.exitCode = (await projects()) ?? 0;
