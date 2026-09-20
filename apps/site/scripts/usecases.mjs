/**
 * The "Who it's for" screenshots on brain.dog: one fresh self-hosted record per use case, set up the
 * way a stranger would set it up, through /start, and photographed on the page that use case opens on.
 *
 *   node scripts/usecases.mjs              # every use case that exists
 *   node scripts/usecases.mjs student team # just these
 *
 * WHAT THE SITE ACTUALLY SERVES TODAY IS ONE OF THESE: usecase-founder-dashboard-<scheme>.webp, in
 * the band about projects reporting their own numbers. The five use cases are drawn on the home
 * page by a switcher now rather than by five photographs, because five pictures of five
 * arrangements of the same application, each painted below full size, were five pictures a reader
 * could not read and could not tell apart. This script still takes all of them: they are the
 * cheapest way to see what a stranger actually gets out of /start, and that is worth keeping
 * whether or not a page serves the result. Do not commit the ones no page asks for.
 *
 * Writes static/shots/usecase-<id>-<scheme>.webp at 1440 by 900 (2x) and
 * static/shots/usecase-<id>-phone-<scheme>.webp at 390 by 844 (3x), plus any further page a use case
 * lists under `more` (the founder's dashboard) as usecase-<id>-<page>[-phone]-<scheme>.webp.
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
const OUT = join(import.meta.dirname, '..', 'static', 'shots');
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
    /* AND THE DASHBOARD, which the founder section of the site draws beside the story of numbers arriving. */
    more: [{ name: 'dashboard', route: '/p/dashboard' }],
    prime: reportNumbers,
  },
  { id: 'team', slug: 'platform', chip: 'Team board', who: 'Priya Nair, product manager', about: 'Tickets for our team, the current cycle, and the work our agents take on.' },
  { id: 'guide', slug: 'podcast', chip: 'New project guide', who: 'Alex Moreno', about: 'I am starting a podcast from scratch and do not know where to begin.' },
];

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

/** `--png=<dir>` also keeps each PNG there, for a person to look at before the WebPs ship. */
const PNG = process.argv.find((a) => a.startsWith('--png='))?.slice('--png='.length) ?? null;
const wanted = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const cases = wanted.length ? CASES.filter((c) => wanted.includes(c.id)) : CASES;

/** A port the OS says is free, and never one the gates or the dev server hold. */
async function freePort() {
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

await import('node:fs/promises').then((fs) => fs.mkdir(OUT, { recursive: true }));
const browser = await chromium.launch();
const encoder = await browser.newPage();

async function webp(png, file) {
  const b64 = await encoder.evaluate(async (src) => {
    const img = new Image();
    img.src = `data:image/png;base64,${src}`;
    await img.decode();
    const canvas = new OffscreenCanvas(img.naturalWidth, img.naturalHeight);
    canvas.getContext('2d').drawImage(img, 0, 0);
    const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/webp', quality: 0.88 })).arrayBuffer());
    let out = '';
    for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(out);
  }, png.toString('base64'));
  await writeFile(file, Buffer.from(b64, 'base64'));
}

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
            { name: 'bd_pref', value: encodeURIComponent(JSON.stringify({ scheme, sampleSaid: true, defined: ['row', 'page', 'block'] })), url: host.base },
          ]);
          const page = await context.newPage();
          for (const view of [{ name: '', route: '/' }, ...(c.more ?? [])]) {
            await page.goto(`${host.base}${view.route}`, { waitUntil: 'networkidle' });
            await page.waitForSelector('main#main[data-screen]', { timeout: 10000 }).catch(() => {});
            await page.addStyleTag({ content: '.rowgroup{content-visibility:visible !important}' });
            await page.waitForTimeout(400);
            const png = await page.screenshot();
            const name = `usecase-${c.id}${view.name ? `-${view.name}` : ''}${size.suffix}-${scheme}`;
            await webp(png, join(OUT, `${name}.webp`));
            if (PNG) await writeFile(join(PNG, `${name}.png`), png);
            console.log(`  static/shots/${name}.webp`);
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
