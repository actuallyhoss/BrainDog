/**
 * One fresh self-hosted record per use case, set up the way a stranger would set it up, through
 * /start, and photographed on the page that use case opens on, FOR A PERSON TO LOOK AT.
 *
 *   node scripts/usecases.mjs --png=<dir>              # every use case, as PNGs
 *   node scripts/usecases.mjs --png=<dir> student team # just these
 *
 * NOTHING HERE SHIPS. It used to write the founder's dashboard into `static/shots/` for a band on
 * the home page. On 22 September the owner said of the screenshots on that page *i hate those
 * screenshots. they look terrible*; the band went and the page draws the app in HTML and CSS
 * instead, so the WebP pass, its encoder and the list of shipped captures went with it. What is left
 * is the cheapest way to see what a stranger actually gets out of /start, and that is a picture for
 * whoever is checking the drawn app in `src/lib/copy.ts` against the real one.
 *
 * Each capture is taken at 1440 by 900 (2x) and at 390 by 844 (3x) as `-phone`, in both schemes,
 * named usecase-<id>[-<page>][-phone]-<scheme>, where <page> is any further page a use case lists
 * under `more` (the founder's dashboard).
 *
 * WHY A FRESH RECORD AND NOT THE DEMO. The demo is a small business, and these pictures exist to show
 * that a BrainDog is arranged for whoever made it. So each one is a new record, created by the
 * self-host's own `init`, served on a free port (never 5189 or 5317, which the gates and the dev server
 * hold), and given its shape by typing into /start: a name, a sentence, the use case, Make my record.
 * What is photographed is exactly what that person would see next, with the example rows the use case
 * ships and nothing else.
 *
 * IT NEEDS apps/web/build, because the self-host serves that build as its app. Nothing here is a
 * secret: the record is loopback only, so a request carrying nothing is its owner, and the owner's
 * address is example.com. The data directory is a temporary one, removed at the end.
 *
 * A USE CASE THAT IS NOT OFFERED ON /start IS SKIPPED AND SAID, rather than shot as something else.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { chromium } from '@playwright/test';

const REPO = join(import.meta.dirname, '..', '..', '..');
const MAIN = join(REPO, 'apps', 'selfhost', 'src', 'main.ts');
const RESERVED = new Set([5189, 5317]);

/** Each use case: the chip it is offered under on /start, who the person is, and what they said it is for. */
const CASES = [
  { id: 'personal', slug: 'sam', chip: 'Personal', who: 'Sam Reyes', about: 'My own money, bills and savings, and a few passion projects.' },
  { id: 'student', slug: 'maya', chip: 'Student', who: 'Maya Chen, a university student', about: 'My courses, coursework and exams this semester.' },
  {
    id: 'founder',
    slug: 'jordan',
    chip: 'Solo founder',
    who: 'Jordan Hale, founder',
    about: 'I run a few companies and want dashboards for the numbers my apps report.',
    /* AND THE DASHBOARD, the page the founder's reported numbers draw on. */
    more: [{ name: 'dashboard', route: '/p/dashboard' }],
    prime: reportNumbers,
  },
  { id: 'team', slug: 'platform', chip: 'Team board', who: 'Priya Nair, product manager', about: 'Tickets for our team, the current cycle, and the work our agents take on.' },
  { id: 'guide', slug: 'podcast', chip: 'New project guide', who: 'Alex Moreno', about: 'I am starting a podcast from scratch and do not know where to begin.' },
];

/**
 * THE OTHER TWO COMPANIES, BECAUSE HE SAID "A FEW" AND THE PAGE DREW ONE.
 *
 * The founder types "I run a few companies" into /start, and what the dashboard photographed after it
 * was a screen contradicting him: "Across your organisations" over one organisation, "Balance by
 * organisation" as a single bar running the full width (which is what a bar chart of one row is), and
 * "Owed to you, 30 days" reading GBP 0.00 because the use case's example rows carry one invoice and it
 * goes the other way. Three of the four things in the top 900 pixels of the capture were wrong about
 * the person in the same frame as their own sentence.
 *
 * So the priming writes what that sentence implies: two more companies, an account each with a balance
 * somebody would recognise, and five invoices in both directions, due on days 6, 12, 14, 21 and 25 from
 * the day the record is made. With the founder example's own hosting bill at day 9 that is six dated
 * rows inside the thirty days both tiles read. Nothing here is generated: each row is typed out,
 * because a marketing capture is read by a person who will notice five invoices for the same amount on
 * the same day.
 *
 * SYNTHETIC BY THE SAME RULE AS THE SEED (22 §10): invented companies, no real counterparty, and the
 * record it is written into is a temporary directory this script deletes when it is done.
 *
 * WHAT IT DELIBERATELY DOES NOT DO is have the new projects report numbers as well. The dashboard's
 * `lines` block draws one chart a MEASURE across every project, so a second project sending "Monthly
 * recurring revenue" would land in the same series as the first and the chart would read as one
 * company's revenue doubling overnight. The numbers stay with Northwind, where the story is true.
 */
async function aFewCompanies(call) {
  /* `day` type, so an actual date and not the `+9d` the use case's own seeds may use: those are
     resolved by `install.ts` at install time, and this is the raw API. */
  const on = (days) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
  const gbp = (minor) => ({ amount: minor, currency: 'GBP' });
  const companies = [
    {
      org: { name: 'Marchetti Tools Ltd', kind: 'company', country: 'United Kingdom', currency: 'GBP' },
      account: { name: 'Marchetti current account', kind: 'bank', balance: gbp(1_142_000), as_of: on(-1), liquid: true },
      project: { name: 'Marchetti CLI', lane: 'earning', since: on(-620) },
    },
    {
      org: { name: 'Hale Consulting', kind: 'sole_trader', country: 'United Kingdom', currency: 'GBP' },
      account: { name: 'Consulting account', kind: 'bank', balance: gbp(638_000), as_of: on(-3), liquid: true },
      project: { name: 'Retainer work', lane: 'earning', since: on(-280) },
    },
  ];
  for (const c of companies) {
    const account = await call('create', { register: 'accounts', fields: c.account });
    const project = await call('create', { register: 'things', fields: c.project });
    await call('create', {
      register: 'organisations',
      fields: { ...c.org, accounts: [`accounts#${account.seq}`], projects: [`things#${project.seq}`] },
    });
  }
  const invoices = [
    { what: 'Annual plan, Fernwood Group', direction: 'owed_to_me', amount: gbp(480_000), due: on(6), state: 'open' },
    { what: 'Consulting, September', direction: 'owed_to_me', amount: gbp(360_000), due: on(12), state: 'open' },
    { what: 'Annual plan, Bewley & Co', direction: 'owed_to_me', amount: gbp(240_000), due: on(21), state: 'open' },
    { what: 'Contractor, September', direction: 'owed_by_me', amount: gbp(275_000), due: on(14), state: 'open' },
    { what: 'Accountant, quarter to September', direction: 'owed_by_me', amount: gbp(89_000), due: on(25), state: 'open' },
  ];
  for (const fields of invoices) await call('create', { register: 'obligations', fields });
}

/**
 * SIXTY DAYS OF NUMBERS, AS A PROJECT WOULD HAVE SENT THEM. A fresh founder record holds one example
 * number, which the dashboards leave out on purpose, so a dashboard photographed straight after /start is
 * a page of empty states. These rows are what a project reporting once a day for two months leaves behind:
 * `source: reported`, one row per measure per day, written through the record's own `create`. The account
 * the example seeds is listed on the organisation, so its balance is drawn too.
 */
async function reportNumbers(base) {
  const call = async (name, args) => {
    const res = await fetch(`${base}/api/${name}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(args) });
    const body = await res.json().catch(() => null);
    if (!body?.ok) throw new Error(`${name} was refused: ${JSON.stringify(body)}`);
    return body.value;
  };
  await call('update', { register: 'organisations', seq: 1, patch: { accounts: ['accounts#1'], projects: ['things#1'] } });
  await aFewCompanies(call);
  const day = 86_400_000;
  const now = Date.now();
  for (let d = 59; d >= 0; d--) {
    const t = 59 - d;
    const at = new Date(now - d * day - 3 * 3_600_000).toISOString();
    const wave = Math.sin(t / 3.1);
    const rows = [
      { name: 'Monthly recurring revenue', value: Math.round(3400 + t * 22 + wave * 60), unit: 'GBP' },
      { name: 'Signups', value: Math.max(4, Math.round(18 + t * 0.35 + wave * 6 + ((t * 7) % 5))), unit: 'people' },
      { name: 'Active users', value: Math.round(620 + t * 9 + wave * 25), unit: 'people' },
    ];
    for (const r of rows)
      await call('create', { register: 'datapoints', fields: { ...r, thing: 'things#1', organisation: 'organisations#1', at, source: 'reported' } });
  }
}

const SIZES = [
  { suffix: '', width: 1440, height: 900, scale: 2 },
  { suffix: '-phone', width: 390, height: 844, scale: 3 },
];

if (!existsSync(join(REPO, 'apps', 'web', 'build', 'index.html'))) {
  console.error('  no record-app build at apps/web/build. Run "pnpm --filter @braindog/web build" first.');
  process.exit(1);
}

/** `--png=<dir>` is where the PNGs go, and without it there is nothing to do. */
const PNG = process.argv.find((a) => a.startsWith('--png='))?.slice('--png='.length) ?? null;
if (!PNG) {
  console.error('  nothing to write: pass --png=<dir>. This script ships nothing to the site.');
  process.exit(1);
}
const wanted = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const base = (c, view) => `usecase-${c.id}${view.name ? `-${view.name}` : ''}`;
const views = (c) => [{ name: '', route: '/' }, ...(c.more ?? [])];
const cases = wanted.length ? CASES.filter((c) => wanted.includes(c.id)) : CASES;
if (!cases.length) process.exit(0);

/**
 * `--port=<n>` PINS THE SELF-HOST'S PORT, for a run beside the browser gates. An OS-assigned port
 * cannot land on a gate's fixed one on this machine (Windows hands out 49152 and up), but a caller
 * that has been given a port range to stay inside cannot prove that from a random number in a log,
 * and a pinned port that is taken fails at `serve` with the port in the message rather than
 * silently moving. Each use case is served and stopped before the next, so one port is enough.
 */
const PINNED = Number(process.argv.find((a) => a.startsWith('--port='))?.slice('--port='.length)) || null;

/** A port the OS says is free, and never one the gates or the dev server hold. */
async function freePort() {
  if (PINNED) return PINNED;
  for (;;) {
    const port = await new Promise((resolve, reject) => {
      const s = createServer();
      s.once('error', reject);
      s.listen(0, '127.0.0.1', () => {
        const { port: p } = s.address();
        s.close(() => resolve(p));
      });
    });
    if (!RESERVED.has(port)) return port;
  }
}

function run(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [MAIN, ...args], { env, stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    child.stderr.on('data', (d) => (err += d));
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`selfhost ${args[0]} exited ${code}: ${err}`))));
  });
}

async function serve(env, port) {
  const child = spawn(process.execPath, [MAIN, 'serve'], { env: { ...env, PORT: String(port) }, stdio: ['ignore', 'ignore', 'pipe'] });
  let err = '';
  child.stderr.on('data', (d) => (err += d));
  const base = `http://localhost:${port}`;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(`selfhost serve exited: ${err}`);
    const ok = await fetch(`${base}/api/version`).then((r) => r.ok, () => false);
    if (ok) return { base, stop: () => new Promise((r) => (child.exitCode !== null ? r() : (child.once('exit', r), child.kill()))) };
    await new Promise((r) => setTimeout(r, 150));
  }
  child.kill();
  throw new Error(`selfhost serve did not answer on ${base}: ${err}`);
}

/** Types the answers into /start and makes the record. Returns false when the use case is not offered. */
async function setUp(page, base, c) {
  await page.goto(`${base}/start`, { waitUntil: 'networkidle' });
  const who = page.getByRole('textbox', { name: 'Who are you?' });
  await who.fill(c.who);
  await who.press('Enter');
  const about = page.getByRole('textbox', { name: 'What is this BrainDog for?' });
  await about.fill(c.about);
  const chip = page.getByRole('group', { name: 'Make it for' }).getByRole('button', { name: c.chip, exact: true });
  if (!(await chip.waitFor({ timeout: 5000 }).then(() => true, () => false))) return false;
  await chip.click();
  await page.getByRole('button', { name: 'Make my record' }).click();
  await page.locator('.kept').waitFor({ timeout: 20000 });
  return true;
}

await import('node:fs/promises').then((fs) => fs.mkdir(PNG, { recursive: true }));
const browser = await chromium.launch();

const skipped = [];
try {
  for (const c of cases) {
    const data = await mkdtemp(join(tmpdir(), `braindog-${c.id}-`));
    const env = { ...process.env, BRAINDOG_DATA: data, BRAINDOG_KEK_FILE: join(data, 'kek'), NODE_NO_WARNINGS: '1' };
    let host = null;
    try {
      await run(['init', c.slug, '--owner', `${c.slug}@example.com`], env);
      host = await serve(env, await freePort());

      const setup = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
      const offered = await setUp(await setup.newPage(), host.base, c);
      await setup.close();
      if (offered && c.prime) await c.prime(host.base);
      if (!offered) {
        skipped.push(c.id);
        console.log(`  ${c.id}: not offered on /start, skipped`);
        continue;
      }

      for (const size of SIZES)
        for (const scheme of ['light', 'dark']) {
          const context = await browser.newContext({
            viewport: { width: size.width, height: size.height },
            deviceScaleFactor: size.scale,
            colorScheme: scheme,
            reducedMotion: 'reduce',
          });
          await context.addCookies([
            { name: 'bd_pref', value: encodeURIComponent(JSON.stringify({ scheme, defined: ['row', 'page', 'block'] })), url: host.base },
          ]);
          const page = await context.newPage();
          for (const view of views(c)) {
            await page.goto(`${host.base}${view.route}`, { waitUntil: 'networkidle' });
            await page.waitForSelector('main#main[data-screen]', { timeout: 10000 }).catch(() => {});
            await page.addStyleTag({ content: '.rowgroup{content-visibility:visible !important}' });
            await page.waitForTimeout(400);
            const png = await page.screenshot();
            const name = `${base(c, view)}${size.suffix}-${scheme}`;
            await writeFile(join(PNG, `${name}.png`), png);
            console.log(`  ${join(PNG, `${name}.png`)}`);
          }
          await context.close();
        }
    } finally {
      await host?.stop();
      await rm(data, { recursive: true, force: true }).catch(() => {});
    }
  }
} finally {
  await browser.close();
}

if (skipped.length) console.log(`  not shot: ${skipped.join(', ')}`);
