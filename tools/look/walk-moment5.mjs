/**
 * Moment 5's walk, timed: on Today, "Show the Talabat payments as a calendar", the draft
 * drawn, kept, and Today opened again with no wait.
 *
 *   node tools/look/walk-moment5.mjs [--out <dir>] [--headed]
 *
 * ON THE SEED, NEVER HIS RECORD. The record is the gates' seed in memory with six Talabat payments added, and Slash's
 * model is a stand-in on the host's own wire (`slash.send`) that answers the description with Today and one calendar
 * of those payments. So the numbers are BrainDog's own path, the sheet, the record's draft, try and draw, the keep and
 * the reopen, and not a model's thinking time: that is measured live, where a model answers.
 *
 * THE BARS ARE THE SCOPE'S: composed (the draft drawn in the sheet) within 5 s of Draft it, drawn on Today within 30 s
 * of Keep it, and Today opened again with the calendar on its first paint; then Undo, which must leave the record with
 * no Today page of its own (C25's check). It exits 1 when one is missed, and writes
 * `walk.json` and a picture of each step to `--out`.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { argv, exit } from 'node:process';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

import { start } from '../../apps/selfhost/src/server.ts';
import { NOW, installSeed } from '../../packages/seed/src/index.ts';
import { IDENTITY } from '../gates/record.mjs';
import { ROOT, serve } from './run.mjs';

/** The scope's bars, in milliseconds. */
export const BARS = { composeMs: 5_000, drawnMs: 30_000 };
/** What the person types, word for word as moment 5 says it. */
export const ASKED = 'Show the Talabat payments as a calendar';

/** The calendar the stand-in model adds to the page it was handed. */
export const TALABAT_CALENDAR = {
  kind: 'calendar',
  heading: 'Talabat payments',
  icon: 'calendar',
  span: 12,
  source: 'register.transactions',
  where: 'what contains Talabat',
  columns: [{ field: 'what' }, { field: 'on' }],
  back: 1,
  ahead: 0,
  empty: 'No Talabat payments this month.',
};

/**
 * The stand-in model on the host's wire: it reads the page the record handed it (`input.page`, sent as the user's
 * message) and answers one change, that page with the calendar after its first block.
 */
export function standIn(seen = []) {
  return async (_url, init) => {
    const sent = JSON.parse(String(init.body));
    const said = sent.messages?.at(-1)?.content ?? '{}';
    const input = JSON.parse(typeof said === 'string' ? said : '{}');
    seen.push(input.asked ?? null);
    const page = input.page ?? { id: 'page.home', body: { page: 'home', title: 'Today', blocks: [] } };
    const blocks = Array.isArray(page.body?.blocks) ? page.body.blocks : [];
    const body = { ...page.body, blocks: [...blocks.slice(0, 1), TALABAT_CALENDAR, ...blocks.slice(1)] };
    const content = JSON.stringify({ drafts: [{ question: 'Show the Talabat payments as a calendar on Today?', body_kind: 'change', body: { to: { id: page.id, kind: 'page', body } } }] });
    return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }], usage: { prompt_tokens: 900, completion_tokens: 200 } }), { status: 200 });
  };
}

/** The seed in memory, owned by its server key, with Slash's stand-in and six Talabat payments in its first account. */
export async function seedWithTalabat() {
  const key = randomBytes(32).toString('base64url');
  const seen = [];
  const running = await start({
    file: ':memory:',
    directory: ':memory:',
    port: 0,
    host: '127.0.0.1',
    now: NOW,
    pollMs: 0,
    sessionKey: new Uint8Array(randomBytes(32)),
    kennel: { kennel: 'off', fetch: () => Promise.reject(new Error('the walk reads no Kennel')), now: () => NOW },
    token: key,
    slash: { url: 'http://127.0.0.1:9/v1/chat/completions', model: 'stand-in', send: standIn(seen) },
  });
  const k = running.api.kernel;
  if (!k.createRecord(IDENTITY).ok) throw new Error('the walk could not name its record');
  const seeded = await installSeed(k);
  if (!seeded.ok) throw new Error(`the seed did not install: ${seeded.refusal?.fix}`);
  if (!running.directory.person$('owner@the-studio.example', 'Owner').ok) throw new Error('the walk could not name its owner');
  const accounts = k.list({ register: 'accounts', limit: 1 });
  const accountId = accounts.ok ? accounts.value.rows[0]?.id : undefined;
  if (typeof accountId !== 'string') throw new Error('the seed has no account to put the payments in');
  const day = (n) => new Date(NOW - n * 86_400_000).toISOString().slice(0, 10);
  for (const [n, amount] of [[1, 41500], [4, 28750], [8, 33900], [11, 19500], [15, 46200], [20, 25000]]) {
    const made = k.create('transactions', { what: 'TALABAT', payee: 'Talabat', on: day(n), direction: 'out', amount: { amount, currency: 'GBP' }, account: accountId, state: 'cleared' }, { actor: 'p_self' });
    if (!made.ok) throw new Error(`a Talabat payment was refused: ${made.refusal?.fix}`);
  }
  const port = running.server.address().port;
  const base = `http://127.0.0.1:${port}`;
  return { base, key, api: running.api, seen, close: () => running.close() };
}

/** A source for `serve`: every record path handed to the walk's record with its key, as the gates' forwarder does. */
export function sourceOf(record) {
  return {
    name: 'moment5',
    record: 'the seed with Talabat payments',
    prefix: '',
    async handle(req, res, at) {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const headers = { ...Object.fromEntries(Object.entries(req.headers).filter(([k]) => !['host', 'connection', 'content-length'].includes(k))) };
      if (at.pathname.startsWith('/api')) headers.authorization = `Bearer ${record.key}`;
      const out = await fetch(new URL(`${at.pathname}${at.search}`, record.base), { method: req.method, headers, ...(chunks.length ? { body: Buffer.concat(chunks) } : {}) });
      const back = {};
      out.headers.forEach((v, k) => {
        if (!['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(k)) back[k] = v;
      });
      res.writeHead(out.status, back);
      res.end(Buffer.from(await out.arrayBuffer()));
    },
  };
}

async function main() {
  const at = argv.indexOf('--out');
  const out = resolve(at > 0 ? argv[at + 1] : join(ROOT, 'loop', 'proof', 'looks', `moment5-${new Date().toISOString().slice(0, 16).replace(':', '-')}`));
  mkdirSync(out, { recursive: true });
  const record = await seedWithTalabat();
  const served = await serve(sourceOf(record));
  const browser = await chromium.launch({ headless: !argv.includes('--headed') });
  const steps = {};
  let failed = null;
  const page = await browser.newPage({ viewport: { width: 1512, height: 982 } });
  try {
    const shot = (name) => page.screenshot({ path: join(out, `${name}.png`) });
    await page.goto(`${served.app}/`);
    await page.locator('main[data-screen]').first().waitFor({ timeout: 30_000 });
    await page.locator('.home-page').first().hover();
    await page.getByRole('button', { name: /^More for Today$/u }).first().click();
    await page.getByRole('menuitem', { name: 'Change this page' }).click();
    await page.locator('#page-described').fill(ASKED);
    await shot('1-asked');
    let t = Date.now();
    await page.getByRole('button', { name: 'Draft it' }).click();
    /* COMPOSED IS THE DRAFT DRAWN IN THE SHEET, the calendar among Today's tiles, beside Keep it. */
    const sheet = page.getByRole('dialog');
    await sheet.getByRole('button', { name: 'Keep it' }).waitFor({ timeout: 60_000 });
    await sheet.getByRole('heading', { name: 'Talabat payments' }).first().waitFor({ timeout: 60_000 });
    steps.composeMs = Date.now() - t;
    await shot('2-drafted');
    t = Date.now();
    await sheet.getByRole('button', { name: 'Keep it' }).click();
    await sheet.getByText('Kept. This is how it stands now.').waitFor({ timeout: 60_000 });
    await page.keyboard.press('Escape');
    /* DRAWN IS THE CALENDAR ON TODAY ITSELF, the sheet shut. */
    await page.locator('main .home-page').getByRole('heading', { name: 'Talabat payments' }).first().waitFor({ timeout: 60_000 });
    steps.drawnMs = Date.now() - t;
    await shot('3-kept');
    const held = await record.api.page({ slug: 'home' }, { principal: { kind: 'person', id: 'p_self', level: 'owner' } });
    steps.pageHome = held.ok === true;
    /* THE NEXT MORNING, as near as a walk can: a new tab, Today's first paint, the calendar on it with no wait. */
    const morning = await browser.newPage({ viewport: { width: 1512, height: 982 } });
    t = Date.now();
    await morning.goto(`${served.app}/`);
    await morning.locator('main .home-page').getByRole('heading', { name: 'Talabat payments' }).first().waitFor({ timeout: 30_000 });
    steps.reopenMs = Date.now() - t;
    await morning.screenshot({ path: join(out, '4-next-morning.png') });
    await morning.close();
    /* AND UNDO GOES BACK TO THE BUILT ONE: the toast's Undo retires the page kept, and Today is drawn as built again. */
    await page.getByRole('button', { name: 'Undo' }).first().click({ timeout: 10_000 });
    await page.getByText('is drawn as BrainDog builds it again').first().waitFor({ timeout: 30_000 });
    const back = await record.api.page({ slug: 'home' }, { principal: { kind: 'person', id: 'p_self', level: 'owner' } });
    steps.undone = back.ok === false;
    await shot('5-undone');
    steps.modelAsked = record.seen;
    const missed = Object.entries(BARS).filter(([k, bar]) => !(steps[k] <= bar)).map(([k]) => k);
    if (!steps.pageHome) missed.push('pageHome');
    if (!steps.undone) missed.push('undone');
    if (missed.length > 0) failed = `missed ${missed.join(', ')}`;
  } catch (e) {
    failed = e instanceof Error ? e.message.split('\n')[0] : String(e);
    await page.screenshot({ path: join(out, 'failed.png') }).catch(() => {});
  } finally {
    writeFileSync(join(out, 'walk.json'), `${JSON.stringify({ asked: ASKED, bars: BARS, steps, failed, model: 'stand-in on the host wire' }, null, 2)}\n`);
    await browser.close();
    await served.close();
    await record.close();
  }
  console.log(`  moment 5: ${failed ?? 'kept'} · composed ${steps.composeMs ?? '?'} ms, drawn ${steps.drawnMs ?? '?'} ms, reopened ${steps.reopenMs ?? '?'} ms · ${out}`);
  exit(failed ? 1 : 0);
}

if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) await main();
