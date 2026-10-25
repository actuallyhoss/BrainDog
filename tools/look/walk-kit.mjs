/**
 * What the said-change walks share: the gates' seed with a stand-in model on the host's wire, the app served over it,
 * and a step runner that prints pass or fail with timings. SEED ONLY, never a person's record.
 */
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { argv } from 'node:process';
import { randomBytes } from 'node:crypto';
import { chromium } from '@playwright/test';

import { start } from '../../apps/selfhost/src/server.ts';
import { NOW, installSeed } from '../../packages/seed/src/index.ts';
import { IDENTITY } from '../gates/record.mjs';
import { ROOT, serve } from './run.mjs';
import { sourceOf } from './walk-moment5.mjs';

export const OWNER = { principal: { kind: 'person', id: 'p_self', level: 'owner' } };

/** The seed in memory with `model` (a `send(url, init)` stand-in) behind Slash; `after(kernel)` may add rows. */
export async function seeded(model, after) {
  const key = randomBytes(32).toString('base64url');
  const running = await start({
    file: ':memory:', directory: ':memory:', port: 0, host: '127.0.0.1', now: NOW, pollMs: 0,
    sessionKey: new Uint8Array(randomBytes(32)),
    kennel: { kennel: 'off', fetch: () => Promise.reject(new Error('the walk reads no Kennel')), now: () => NOW },
    token: key,
    slash: { url: 'http://127.0.0.1:9/v1/chat/completions', model: 'stand-in', send: model },
  });
  const k = running.api.kernel;
  if (!k.createRecord(IDENTITY).ok) throw new Error('the walk could not name its record');
  const s = await installSeed(k);
  if (!s.ok) throw new Error(`the seed did not install: ${s.refusal?.fix}`);
  if (!running.directory.person$('owner@the-studio.example', 'Owner').ok) throw new Error('the walk could not name its owner');
  if (after) await after(k);
  const base = `http://127.0.0.1:${running.server.address().port}`;
  return { base, key, api: running.api, kernel: k, close: () => running.close() };
}

/** A wire answer carrying one set of drafts. */
export const answer = (drafts) =>
  new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: JSON.stringify({ drafts }) } }], usage: { prompt_tokens: 900, completion_tokens: 200 } }), { status: 200 });

/** What the record handed the model as the user's message. */
export const inputOf = (init) => {
  const said = JSON.parse(String(init.body)).messages?.at(-1)?.content ?? '{}';
  return JSON.parse(typeof said === 'string' ? said : '{}');
};

/**
 * Run a walk: `body({ page, app, record, step, shot })`. Each `step(name, fn)` prints pass or fail with its time; a
 * failed step stops the walk. Exit code 1 on any failure.
 */
export async function walk(name, model, after, body) {
  const at = argv.indexOf('--out');
  const out = resolve(at > 0 ? argv[at + 1] : join(ROOT, 'loop', 'proof', 'looks', `${name}-${new Date().toISOString().slice(0, 16).replace(':', '-')}`));
  mkdirSync(out, { recursive: true });
  const record = await seeded(model, after);
  const served = await serve(sourceOf(record));
  const browser = await chromium.launch({ headless: !argv.includes('--headed') });
  const page = await browser.newPage({ viewport: { width: 1512, height: 982 } });
  let failed = null;
  let n = 0;
  const step = async (label, fn) => {
    const t = Date.now();
    try {
      const r = await fn();
      console.log(`  PASS ${name} · ${label} · ${Date.now() - t} ms`);
      return r;
    } catch (e) {
      console.log(`  FAIL ${name} · ${label} · ${Date.now() - t} ms · ${e instanceof Error ? e.message.split('\n')[0] : e}`);
      failed = label;
      throw e;
    }
  };
  const shot = (s) => page.screenshot({ path: join(out, `${++n}-${s}.png`) }).catch(() => {});
  try {
    await body({ page, app: served.app, record, step, shot, browser });
  } catch {
    await shot('failed');
  } finally {
    await browser.close();
    await served.close();
    await record.close();
  }
  console.log(`  ${name}: ${failed ? `FAILED at ${failed}` : 'all steps passed'} · ${out}`);
  process.exit(failed ? 1 : 0);
}

/** Open the page's "Change this page" sheet from its head menu and type what is said. */
export async function openChange(page, pageLabel, said) {
  await page.locator('main[data-screen]').first().waitFor({ timeout: 30_000 });
  const more = page.getByRole('button', { name: new RegExp(`^More for ${pageLabel}$`, 'u') }).first();
  await more.hover().catch(() => {});
  await more.click();
  await page.getByRole('menuitem', { name: 'Change this page' }).click();
  await page.locator('#page-described').fill(said);
}
