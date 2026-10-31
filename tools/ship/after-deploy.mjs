#!/usr/bin/env node
/**
 * The after-deploy check: five questions asked of production from outside, each said as one plain line.
 *
 *   node tools/ship/after-deploy.mjs                 ask what is live, expect no build in particular
 *   node tools/ship/after-deploy.mjs --sha <sha>     and hold the live build to that commit
 *   node tools/ship/after-deploy.mjs --env alpha     ask alpha's names instead
 *
 * WHY IT EXISTS. The smoke's signed-in half and the sandbox smoke run only on the canary record `OPS_RECORD` names, and
 * that has been empty since the canary sitting, so after a deploy nothing proved a stranger could reach the product.
 * This needs no record, no token and no key: it asks what anybody on the internet can ask.
 *
 *   1. health   `/healthz` on the app's name answers ok, and with `--sha`, a build that ends in that commit
 *   2. kernel   `/healthz`'s `kernel` is the count of migrations in this checkout, so the build serving is this one
 *   3. sign-in  `/signin` draws the app's page, and `/auth/methods` says sign-in is set up
 *   4. mcp      a POST to `/mcp` on the site's name is refused 401 pointing at its sign-in metadata, and that
 *               metadata answers with the resource and who signs it in
 *   5. site     the site's home page draws
 *
 * THE NAMES COME FROM THE TWO `wrangler.jsonc` FILES, as the smoke reads them: `PUBLIC_HOST` for the app and the site's
 * first Custom Domain for the site, so the check asks the names the deploy claimed.
 *
 * IT WRITES NOTHING. GETs and one POST with no credential, which the host refuses before any record is named.
 *
 * EXIT CODES: 0 when all five are green, 1 when one is red, 2 when the names could not be read.
 */

import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { ROOT, hostOf, siteConfig, wranglerConfig } from '../../apps/worker/scripts/provision-check.mjs';

const ASK_MS = 15_000;

/** The migrations this checkout carries, as `/healthz` counts them (`smoke.mjs` `migrationCount`). */
export function migrationCount(repo = ROOT) {
  return readdirSync(join(repo, 'packages', 'kernel', 'src', 'migrations')).filter((f) => /^\d{4}_[\w.-]+\.ts$/.test(f) && !f.endsWith('.test.ts')).length;
}

/** The app's name and the site's, for one environment, from the two files that deploy them. */
export function namesOf(env = 'production', worker = wranglerConfig(), site = siteConfig()) {
  const app = String(worker.env?.[env]?.vars?.PUBLIC_HOST ?? '').toLowerCase();
  const own = (site.env?.[env]?.routes ?? []).filter((r) => r.custom_domain).map(hostOf);
  if (!app) throw new Error(`env.${env} has no PUBLIC_HOST in apps/worker/wrangler.jsonc`);
  if (own.length === 0) throw new Error(`env.${env} of apps/site/wrangler.jsonc has no Custom Domain`);
  return { app, site: own[0] };
}

/** One request, never thrown: the status, the headers and the body's text, or `error` with why it was not answered. */
async function ask(url, init = {}, fetcher = fetch) {
  try {
    const res = await fetcher(url, { redirect: 'manual', signal: AbortSignal.timeout(ASK_MS), ...init });
    return { status: res.status, headers: res.headers, text: await res.text() };
  } catch (e) {
    return { status: 0, headers: new Headers(), text: '', error: e instanceof Error ? e.message : String(e) };
  }
}

const jsonOf = (a) => {
  try {
    return JSON.parse(a.text);
  } catch {
    return null;
  }
};
const isHtml = (a) => /text\/html/i.test(a.headers.get('content-type') ?? '');
const why = (a) => (a.status === 0 ? `could not be reached (${a.error})` : `answered ${a.status}`);

/**
 * The five checks, each `{ name, ok, said }`. `sha` holds the build to a commit; `kernel` is the count to expect.
 */
export async function afterDeploy({ env = 'production', sha = null, kernel = migrationCount(), names = namesOf(env), fetcher = fetch } = {}) {
  const out = [];
  const { app, site } = names;

  const health = await ask(`https://${app}/healthz`, {}, fetcher);
  const h = jsonOf(health);
  const build = typeof h?.app === 'string' ? h.app : null;
  const short = sha ? sha.slice(0, 7) : null;
  if (health.status !== 200 || h?.ok !== true) out.push({ name: 'health', ok: false, said: `${app}/healthz ${why(health)}${h && h.ok !== true ? ', not ok' : ''}` });
  else if (short && !(build ?? '').endsWith(`+${short}`)) out.push({ name: 'health', ok: false, said: `${app} answers, but runs ${build ?? 'an unnamed build'}, not ${short}` });
  else out.push({ name: 'health', ok: true, said: `${app} answers, build ${build ?? 'unnamed'}` });

  if (h === null || typeof h.kernel !== 'number') out.push({ name: 'kernel', ok: false, said: `${app}/healthz says no kernel version` });
  else if (h.kernel !== kernel) out.push({ name: 'kernel', ok: false, said: `kernel ${h.kernel} is live, and this checkout has ${kernel} migrations` });
  else out.push({ name: 'kernel', ok: true, said: `kernel ${h.kernel}, the same as this checkout` });

  const page = await ask(`https://${app}/signin`, { headers: { accept: 'text/html' } }, fetcher);
  const methods = await ask(`https://${app}/auth/methods`, { headers: { accept: 'application/json' } }, fetcher);
  const m = jsonOf(methods);
  /* SIGN-IN IS ON WHEN A WAY IN IS OFFERED: a passkey, a mailed link or Google. A host with none answers all three false. */
  const configured = m?.ok === true && [m.value?.passkey, m.value?.magic, m.value?.google].some((w) => w === true || w === 'down');
  if (page.status !== 200 || !isHtml(page)) out.push({ name: 'sign-in', ok: false, said: `${app}/signin ${why(page)}${page.status === 200 ? ', not a page' : ''}` });
  else if (!configured) out.push({ name: 'sign-in', ok: false, said: `the sign-in page draws, but ${app}/auth/methods ${methods.status === 200 ? 'offers no way in' : why(methods)}` });
  else out.push({ name: 'sign-in', ok: true, said: `the sign-in page draws, with sign-in by ${[m.value.passkey && 'passkey', m.value.magic && 'mailed link', m.value.google && 'Google'].filter(Boolean).join(' and ')}` });

  const mcp = await ask(
    `https://${site}/mcp`,
    { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }) },
    fetcher,
  );
  const challenge = mcp.headers.get('www-authenticate') ?? '';
  const meta = /resource_metadata="([^"]+)"/i.exec(challenge)?.[1] ?? null;
  if (mcp.status !== 401 || meta === null) out.push({ name: 'mcp', ok: false, said: `${site}/mcp ${why(mcp)}${mcp.status === 401 ? ' with no sign-in metadata named' : ' where a 401 asking for sign-in was expected'}` });
  else {
    const doc = await ask(meta, { headers: { accept: 'application/json' } }, fetcher);
    const d = jsonOf(doc);
    const servers = Array.isArray(d?.authorization_servers) ? d.authorization_servers : [];
    if (doc.status !== 200 || typeof d?.resource !== 'string' || servers.length === 0) out.push({ name: 'mcp', ok: false, said: `${meta} ${why(doc)}${doc.status === 200 ? ' without a resource and who signs it in' : ''}` });
    else out.push({ name: 'mcp', ok: true, said: `${site}/mcp asks for sign-in, and its metadata names ${d.resource}, signed in at ${servers[0]}` });
  }

  const home = await ask(`https://${site}/`, { headers: { accept: 'text/html' } }, fetcher);
  if (home.status !== 200 || !isHtml(home)) out.push({ name: 'site', ok: false, said: `${site} ${why(home)}${home.status === 200 ? ', not a page' : ''}` });
  else out.push({ name: 'site', ok: true, said: `${site} draws its home page` });

  return out;
}

/** The lines a person reads: one a check, then the count. */
export function linesOf(checks) {
  const lines = checks.map((c) => `  ${c.ok ? 'ok  ' : 'RED '}  ${c.name.padEnd(8)} ${c.said}`);
  const red = checks.filter((c) => !c.ok).length;
  lines.push(red === 0 ? `  after-deploy: all ${checks.length} green` : `  after-deploy: ${red} of ${checks.length} red`);
  return lines;
}

if (import.meta.main) {
  let values;
  try {
    ({ values } = parseArgs({ args: process.argv.slice(2), options: { sha: { type: 'string' }, env: { type: 'string' }, help: { type: 'boolean', short: 'h' } } }));
  } catch {
    values = { help: true };
  }
  if (values.help) {
    console.log('node tools/ship/after-deploy.mjs [--sha <commit>] [--env production|alpha]');
    process.exit(0);
  }
  let names;
  try {
    names = namesOf(values.env ?? 'production');
  } catch (e) {
    console.error(`  after-deploy: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(2);
  }
  const checks = await afterDeploy({ env: values.env ?? 'production', sha: values.sha ?? null, names });
  for (const line of linesOf(checks)) console.log(line);
  process.exitCode = checks.every((c) => c.ok) ? 0 : 1;
}
