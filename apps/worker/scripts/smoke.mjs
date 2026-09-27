/**
 * `smoke`: after a deploy, ask the two Workers on one hostname whether each path reached the right one.
 *
 *   node apps/worker/scripts/smoke.mjs production
 *   node apps/worker/scripts/smoke.mjs alpha
 *
 * THE ANSWERS IN `loop/research-one-domain.md` SECTION 3.5, ASKED LIVE, FOR WHICHEVER PUSH OF THE MOVE JUST DEPLOYED.
 * Once an environment's site binds this Worker, the app lives on the site's name beside the marketing site: the site
 * holds the name as its Custom Domain, runs its script first on the app's doors (`assets.run_worker_first` in
 * `apps/site/wrangler.jsonc`) and hands each of those requests to this Worker through its `APP` service binding
 * (`loop/research-one-domain-binding.md`). `wrangler deploy` says nothing about whether the site hands over every door,
 * and `deploy-parity` asks one host. A door the site keeps shows up as the site's 404 page answering an API call, which
 * is a healthy-looking response from the wrong Worker, and every check below is written against that answer as much as
 * against the right one. Before the site binds this Worker (push A) the checks are on the Worker's own name, and the
 * one that matters most is that a page load there reaches `/app` rather than `ROUTE_UNKNOWN`.
 *
 * THE HOSTS COME FROM THE TWO `wrangler.jsonc` FILES, NOT FROM A REPOSITORY VARIABLE. `PUBLIC_HOST`, `LEGACY_HOSTS`, the
 * Worker's Custom Domains and the site's binding are what the two Workers were deployed with, so reading them here asks
 * the names the deploys claimed rather than the name somebody typed into the repository settings.
 *
 * `/healthz` IS ASKED ON EVERY NAME THE APP IS ON, AND ITS `kernel` IS HELD TO THIS CHECKOUT (defects H4). It is the
 * door an uptime check reads, so a site that keeps it answers every monitor with its own 404 page; and `kernel` is the
 * count of migrations the serving build carries, which must be the count of files in `packages/kernel/src/migrations/`
 * here, or the version answering is not the one this job built.
 *
 * AND ONE SIGNED-IN QUESTION, WHEN THE OPERATOR HAS MADE A CANARY RECORD FOR IT. With `SMOKE_TOKEN` (a read token) and
 * `SMOKE_SLUG` (its record) both in the environment, `GET /app/<slug>/api/boot` with that token must answer 200 JSON:
 * the only question here that opens a record, so the only one that sees a migration refusing real rows. Without both,
 * one line says the half was skipped. The token goes in the one request's header and in no line this prints.
 *
 * IT WRITES NOTHING. GETs with no cookie and, but for the canary's, no bearer; one GET that must be redirected; and one
 * empty POST to an `/in/` door no record has minted, which `serveIngest` refuses with a 404 before any record is named.
 *
 * EXIT CODES: 0 when every check answers as `checks` says, 1 when one does not, 2 when a host could not
 * be reached at all.
 */

import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { ROOT, hostOf, siteBinding, siteConfig, wranglerConfig } from './provision-check.mjs';

const typeOf = (answer) => answer.headers.get('content-type') ?? '';
const isJson = (answer) => /application\/json/i.test(typeOf(answer));
const isHtml = (answer) => /text\/html/i.test(typeOf(answer));
const bodyOf = (answer) => {
  try {
    return JSON.parse(answer.text ?? '');
  } catch {
    return null;
  }
};

/**
 * The number of kernel migrations this checkout carries: the files in `packages/kernel/src/migrations/` named as one
 * (`0017_automation_watch.ts`), a test beside them not counted. `/healthz` answers `kernel` as `MIGRATIONS.length`, so a
 * file that is here and not registered is a difference this makes red, which is the right colour for it.
 */
export function migrationCount(repo = ROOT) {
  return readdirSync(join(repo, 'packages', 'kernel', 'src', 'migrations')).filter((file) => /^\d{4}_[\w.-]+\.ts$/.test(file) && !file.endsWith('.test.ts')).length;
}

/** A record's name, as the Directory's own `SLUG` reads one (`packages/record/src/directory.ts`). */
const SLUG = /^[a-z][a-z0-9-]{0,30}[a-z0-9]$/;

/**
 * The checks for one environment, read off the shape the two files deploy.
 *
 * THE NAMES COME FROM THE SITE'S BINDING AS WELL AS FROM `PUBLIC_HOST`, BECAUSE THE MOVE GOES OUT IN PUSHES AND EACH ONE
 * PUTS THE WORKER ON A DIFFERENT SET OF NAMES (`loop/research-one-domain-binding.md` section 4). Reading `PUBLIC_HOST`
 * alone, as this once did, asked `https://app.brain.dog/pricing` after push A: that is the Worker's name, where
 * `/pricing` is the Worker's 308 and not the site, so a good dark deploy went red. Now:
 *
 *   - every name the app is on, `PUBLIC_HOST` and each Custom Domain of the site's same environment when that
 *     environment hands this Worker every door (`siteBinding`), is asked for the shell, a 401 at `/api/boot` and
 *     `/healthz` with `kernel` equal to `kernel`, which is this checkout's `migrationCount()` unless a test hands it one;
 *   - a name the site hands over is shared with the site, so it is asked `/pricing` first, which is the check that the
 *     site's `run_worker_first` is not wider than the doors. A name held as this Worker's Custom Domain has no site on
 *     it to ask;
 *   - the old name, `LEGACY_HOSTS`, or before the move the public host itself when it is a Custom Domain, is asked for a
 *     page load's 308 into `/app` on `PUBLIC_HOST`, and for a POST to an `/in/` door that must not be redirected.
 *
 * Push A asks `app.brain.dog` alone; an environment whose site binds this Worker before its flip (alpha in push 1,
 * production in push 3) is asked on both names; and its flip, B1 or B2, is asked the design's answers and `/healthz`.
 * `smoke.test.mjs` holds each list.
 *
 * `site` IS AN INPUT, READ FROM `apps/site/wrangler.jsonc` WHEN IT IS NOT GIVEN, so a test can hand it the site of a
 * push that has not landed and the deploy step asks the site that did.
 */
export function checks(config, name, site = siteConfig(), kernel = migrationCount()) {
  const block = config.env?.[name] ?? {};
  const vars = block.vars ?? {};
  const host = String(vars.PUBLIC_HOST ?? '').toLowerCase();
  if (!host) throw new Error(`env.${name} has no PUBLIC_HOST in apps/worker/wrangler.jsonc`);
  const own = new Set((block.routes ?? []).filter((r) => r.custom_domain).map(hostOf));
  const binding = siteBinding(config, site, name);
  const handed = new Set(binding.names.filter((n) => !own.has(n)));
  /* A PUBLIC HOST THE WORKER IS NOT REACHED ON is a pair of files that cannot deploy a working app, and every answer
     asked of it would be some other server's. Refused before anything is asked, so the sentence names the file and the
     missing key rather than a status. */
  if (!own.has(host) && !handed.has(host))
    throw new Error(
      `env.${name}: PUBLIC_HOST ${host} is not a Custom Domain of this Worker in apps/worker/wrangler.jsonc, and the site does not hand it the doors there: ${binding.why ?? `${host} is not a Custom Domain of the site's env.${name}`}`,
    );
  const legacy = String(vars.LEGACY_HOSTS ?? '').split(/[\s,]+/).map((h) => h.toLowerCase()).filter((h) => h.length > 0)[0] ?? null;
  const old = legacy ?? (own.has(host) ? host : null);

  const list = [];
  for (const on of new Set([host, ...handed])) {
    const shared = handed.has(on);
    if (shared)
      list.push({
        method: 'GET',
        url: `https://${on}/pricing`,
        expects: '200 from the site',
        judge: (a) =>
          a.status === 200 && isHtml(a) ? null
          : isJson(a) ? `answered ${a.status} in JSON, which is this Worker and not the site: the site's run_worker_first is wider than the doors and hands a site path to the app`
          : `answered ${a.status}, so the site did not deploy, or ${on} is not its Custom Domain`,
      });
    list.push(
      {
        method: 'GET',
        url: `https://${on}/app/`,
        expects: '200, the app shell',
        judge: (a) =>
          a.status === 200 && isHtml(a) ? null
          : shared ? `answered ${a.status}${isHtml(a) ? ' as a page' : ''}: the deployed site on ${on} does not hand /app/* to this Worker, or the Worker is older than the /app shell`
          : `answered ${a.status}${isHtml(a) ? ' as a page' : ''} on this Worker's own Custom Domain, so the version serving is older than the /app shell or the build it carries has no build/app/index.html`,
      },
      {
        method: 'GET',
        url: `https://${on}/api/boot`,
        /* ALWAYS 401. The public demo was the one var that made this a 200, and it is gone (`loop/research-no-sample.md`
           A1): a file that still sets it deploys a Worker that reads it nowhere, so a 200 here is a Worker older than that. */
        expects: '401 JSON',
        judge: (a) => {
          if (a.status === 401 && isJson(a)) return null;
          if (a.status === 404 && !isJson(a))
            return shared ? `answered a 404 page, which is the site answering an API call: the deployed site on ${on} does not hand /api/* to this Worker`
            : `answered a 404 page on this Worker's own Custom Domain, which is something other than this Worker answering ${on}`;
          if (a.status === 401 && !isJson(a)) return 'answered 401 without JSON, which is something in front of the Worker refusing rather than the Worker';
          if (a.status === 200 && isJson(a)) return 'answered 200 JSON with no credential, which is a record served to a stranger: a Worker older than the demo removal, or a door nobody meant';
          return `answered ${a.status} where 401 JSON was expected`;
        },
      },
      {
        method: 'GET',
        url: `https://${on}/healthz`,
        expects: `200 JSON, ok with kernel ${kernel}`,
        judge: (a) => {
          if (a.status === 404 && !isJson(a))
            return shared ? `answered a 404 page: the deployed site on ${on} does not hand /healthz to this Worker, so every uptime check there reads the site`
            : `answered a 404 page on this Worker's own Custom Domain, which is something other than this Worker answering ${on}`;
          if (a.status !== 200 || !isJson(a)) return `answered ${a.status}${isJson(a) ? ' in JSON' : ''} where 200 JSON was expected, so the version serving is older than /healthz or is not answering`;
          const body = bodyOf(a);
          if (body?.ok !== true) return 'answered 200 without ok: true, which is not the Worker\'s liveness answer';
          if (body.kernel !== kernel)
            return `answered kernel ${body.kernel ?? 'nothing'}, and this checkout has ${kernel} migration files: the version serving is not the build this job deployed, or a migration file is not registered in MIGRATIONS`;
          return null;
        },
      },
    );
  }
  if (!old) return list;

  const target = `https://${host}/app/r/x`;
  list.push(
    {
      method: 'GET',
      url: `https://${old}/r/x`,
      headers: { accept: 'text/html' },
      expects: `308 to ${target}`,
      judge: (a) => {
        const to = a.headers.get('location') ?? '';
        if (a.status === 308 && to === target) return null;
        if (a.status === 308 || a.status === 301 || a.status === 302 || a.status === 307)
          return `answered ${a.status} to ${to || 'nowhere'}. The move is a 308 to ${target}: a temporary redirect is asked again every time, a Location without /app lands on the site, and one to another name before the move is the flip's vars deployed before the site hands that name the doors`;
        if (old === host)
          return `answered ${a.status}${isJson(a) ? ' in JSON, which is ROUTE_UNKNOWN' : ''}: a page load outside /app on ${host} is not sent into /app on the same name, so the site's "Open the app" and every magic link already mailed land on an error`;
        return `answered ${a.status}, so ${old} still serves the app instead of sending a browser to ${host}. Is LEGACY_HOSTS in the deployed vars?`;
      },
    },
    {
      method: 'POST',
      url: `https://${old}/in/anything`,
      expects: 'not a redirect',
      /* SERVED, NEVER MOVED. A webhook sender does not follow a 3xx and a 301 or 302 turns its POST
         into a GET, so an address handed out on the old name would stop receiving without an error. */
      judge: (a) =>
        a.status >= 300 && a.status < 400 ? `answered a ${a.status} redirect to ${a.headers.get('location') ?? 'nowhere'}, which drops every webhook sent to ${old}`
        : a.status >= 500 ? `answered ${a.status}`
        : null,
    },
  );
  return list;
}

/**
 * The signed-in half: the canary record's `boot`, on `PUBLIC_HOST`, asked with the read token `smoke()` adds.
 *
 * `canary: true` IS WHAT TELLS `smoke()` TO ADD THE HEADER, so the token is never part of a check and a test can build
 * and judge this one holding none. A slug the Directory would not hand out is refused here, before anything is asked,
 * because a mistyped `SMOKE_SLUG` answering the router's refusal would read as the deploy's fault.
 */
export function canary(config, name, slug) {
  const host = String(config.env?.[name]?.vars?.PUBLIC_HOST ?? '').toLowerCase();
  if (!host) throw new Error(`env.${name} has no PUBLIC_HOST in apps/worker/wrangler.jsonc`);
  if (!SLUG.test(String(slug ?? ''))) throw new Error(`SMOKE_SLUG ${JSON.stringify(slug ?? '')} is not a record's name, so the canary cannot be asked`);
  return {
    method: 'GET',
    url: `https://${host}/app/${slug}/api/boot`,
    canary: true,
    expects: '200 JSON, the canary record signed in',
    judge: (a) => {
      if (a.status === 200 && isJson(a)) return null;
      if (a.status === 401 && isJson(a)) return `answered 401: SMOKE_TOKEN is not a live token on ${slug}, which is most often a lapsed, revoked or mistyped token rather than this deploy, so mint a read token there and set it again`;
      if (a.status === 503 && isJson(a)) return 'answered 503: the canary record did not open on this build, which is what a migration refusing real rows looks like';
      if (a.status === 200 && isHtml(a)) return `answered the app shell, so /app/${slug}/api/boot fell to the page router rather than the record`;
      if (a.status === 404 && !isJson(a)) return `answered a 404 page: something other than this Worker answers /app/* on ${host}`;
      return `answered ${a.status}${isJson(a) ? ' in JSON' : ''} where 200 JSON was expected`;
    },
  };
}

/** One check's verdict on one answer: `null` when it is the answer the table expects, or the sentence saying what it means. */
export const judge = (check, answer) => check.judge(answer);

/** How long one question waits before the host counts as unreachable. */
const ASK_MS = 20_000;

/**
 * The whole smoke step. `signedIn` is `{ token, slug }` for the canary, read from `SMOKE_TOKEN` and `SMOKE_SLUG` by the
 * command line; with either missing the canary is skipped, and the step says so.
 */
export default async function smoke(name, config = wranglerConfig(), site = siteConfig(), signedIn = {}) {
  const list = checks(config, name, site);
  let failed = 0;
  const { token, slug } = signedIn;
  let refused = null;
  if (token && slug) {
    try {
      list.push(canary(config, name, slug));
    } catch (err) {
      refused = err instanceof Error ? err.message : String(err);
    }
  }
  console.log('');
  console.log(`  smoke: ${name}, ${list.length} check(s), read-only`);
  if (!list.some((c) => c.url.endsWith('/pricing')))
    console.log(`  ${name}'s site does not hand this Worker its doors, so the site is not asked: ${siteBinding(config, site, name).why ?? 'no name of the site is one this Worker is not already on'}`);
  if (!token || !slug) console.log('  the signed-in half is skipped: SMOKE_TOKEN and SMOKE_SLUG are not both set, so no record is opened');
  if (refused) {
    failed += 1;
    console.log(`  WRONG  ${refused}`);
  }
  for (const check of list) {
    let answer;
    try {
      const got = await fetch(check.url, {
        method: check.method,
        headers: { 'cache-control': 'no-cache', ...(check.headers ?? {}), ...(check.canary ? { authorization: `Bearer ${token}` } : {}) },
        redirect: 'manual',
        signal: AbortSignal.timeout(ASK_MS),
      });
      answer = { status: got.status, headers: got.headers, text: await got.text() };
    } catch (err) {
      console.log(`  UNREACHABLE  ${check.method} ${check.url}: ${err instanceof Error ? err.message : String(err)}`);
      return 2;
    }
    const verdict = judge(check, answer);
    if (verdict) failed += 1;
    console.log(`  ${verdict ? 'WRONG' : 'ok   '}  ${check.method} ${check.url}  expects ${check.expects}${verdict ? `\n         ${verdict}` : ''}`);
  }
  console.log(`  smoke: ${name}, ${failed} wrong`);
  return failed === 0 ? 0 : 1;
}

if (import.meta.main) {
  const name = process.argv[2];
  if (name !== 'production' && name !== 'alpha') {
    console.error('  smoke takes the environment to ask, and has no default: node apps/worker/scripts/smoke.mjs production|alpha');
    process.exitCode = 2;
  } else {
    process.exitCode = await smoke(name, wranglerConfig(), siteConfig(), { token: process.env.SMOKE_TOKEN, slug: process.env.SMOKE_SLUG });
  }
}
