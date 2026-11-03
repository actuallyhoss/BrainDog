/**
 * `smoke`: after a deploy, ask the two Workers on one hostname whether each path reached the right one.
 *
 *   node apps/worker/scripts/smoke.mjs production
 *   node apps/worker/scripts/smoke.mjs alpha
 *
 * THE ONE-DOMAIN MOVE'S ANSWERS, ASKED LIVE, FOR WHICHEVER PUSH OF THE MOVE JUST DEPLOYED.
 * Once an environment's site binds this Worker, the app lives on the site's name beside the marketing site: the site
 * holds the name as its Custom Domain, runs its script first on the app's doors (`assets.run_worker_first` in
 * `apps/site/wrangler.jsonc`) and hands each of those requests to this Worker through its `APP` service binding
 * `wrangler deploy` says nothing about whether the site hands over every door,
 * and `deploy-parity` asks one host. A door the site keeps shows up as the site's 404 page answering an API call, which
 * is a healthy-looking response from the wrong Worker, and every check below is written against that answer as much as
 * against the right one. Before the site binds this Worker (push A) the checks are on the Worker's own name.
 *
 * THE APP IS AT THE ROOT OF ITS NAME SINCE 29 OCT, and every address under `/app` is one 308 to the same address without
 * it, on the app's own name and on the site's. Both are asked, with a query on the address, because a link already
 * mailed is `…/app/signin?next=…#magic=…` and the query is what sends him back to the page he was on.
 *
 * THE HOSTS COME FROM THE TWO `wrangler.jsonc` FILES, NOT FROM A REPOSITORY VARIABLE. `PUBLIC_HOST`, `LEGACY_HOSTS`, the
 * Worker's Custom Domains and the site's binding are what the two Workers were deployed with, so reading them here asks
 * the names the deploys claimed rather than the name somebody typed into the repository settings.
 *
 * `/healthz` IS ASKED ON EVERY NAME THE APP IS ON, AND ITS `kernel` IS HELD TO THIS CHECKOUT. It is the
 * door an uptime check reads, so a site that keeps it answers every monitor with its own 404 page; and `kernel` is the
 * count of migrations the serving build carries, which must be the count of files in `packages/kernel/src/migrations/`
 * here, or the version answering is not the one this job built.
 *
 * AND THE SIGNED-IN HALF, WHEN THE OPERATOR HAS MADE A CANARY RECORD FOR IT. With `SMOKE_TOKEN` (a token at
 * `propose`) and `SMOKE_SLUG` (its record) both in the environment, the canary is opened the way a first draw opens a
 * record: `boot` 200; `version` 401 without the bearer and 200 with it; the same token at a second name no record
 * holds refused, the answer naming nothing of the canary; and every read of the app's first screens 200, the list
 * read from `apps/web/src/lib/record/first-draw.ts`, which the web app's own test holds to its route loaders, so the
 * two cannot drift. A 500 on any is red, which arms the rollback. `/account/usage` is not asked: it opens for a
 * browser session and never for a record's token, and its own line says so. Without both, one line says the half
 * was skipped. The token goes in each signed-in request's header and in no line this prints.
 *
 * IT WRITES NOTHING. GETs with no cookie and, but for the canary's, no bearer; the GETs that must be redirected; one
 * empty POST to an `/in/` door no record has minted, which `serveIngest` refuses with a 404 before any record is named;
 * and the canary's `previewPage`, a POST because its body is long, which draws a page and installs nothing. The one
 * exception is the fence's (`fence.mjs`): on the canary alone, a 1x1 picture put at its own hash, the same
 * bytes every run, and three puts the fence must refuse or file by their bytes. A fault already scoped and not yet
 * fixed is printed HELD, said and not counted, so a deploy is not red for it.
 *
 * EXIT CODES: 0 when every check answers as `checks` says, 1 when one does not, 2 when a host could not
 * be reached at all.
 */

import { randomBytes } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { FIRST_DRAW } from '../../web/src/lib/record/first-draw.ts';
import { ROOT, hostOf, siteBinding, siteConfig, wranglerConfig } from './provision-check.mjs';
import { fenceChecks, heldOf } from './fence.mjs';

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
 * What a record's read answered: the `value` of the host's `{ ok: true, value }`, or `null`. THE HOST WRAPS EVERY
 * ANSWER, as `packages/client` reads it (`answered`), so naming the next read from the bare body found no list, no
 * add-on and no page on any real canary, and every read after the bare four was skipped while the step said ok.
 */
const valueOf = (answer) => {
  const body = bodyOf(answer);
  return body && typeof body === 'object' && body.ok === true && Object.hasOwn(body, 'value') ? body.value : null;
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
 * PUTS THE WORKER ON A DIFFERENT SET OF NAMES. Reading `PUBLIC_HOST`
 * alone, as this once did, asked `https://app.brain.dog/pricing` after push A: that is the Worker's name, where
 * `/pricing` is the Worker's 308 and not the site, so a good dark deploy went red. Now:
 *
 *   - every name the app is on, `PUBLIC_HOST` and each Custom Domain of the site's same environment when that
 *     environment hands this Worker every door (`siteBinding`), is asked for the shell at `/` and at `/signin`, the
 *     old `/app/signin` sent on with one 308, a 401 at `/api/boot` and `/healthz` with `kernel` equal to `kernel`,
 *     which is this checkout's `migrationCount()` unless a test hands it one;
 *   - a name the site hands over is shared with the site, so it is asked `/slash` first (a page the site always shows; `/pricing` is held until BrainDog is priced), which is the check that the
 *     site's `run_worker_first` is not wider than the doors. A name held as this Worker's Custom Domain has no site on
 *     it to ask;
 *   - the old name, `LEGACY_HOSTS`, or with none the public host itself when it is a Custom Domain, is asked for a page
 *     load under `/app` and its one 308 to the same page at the root of `PUBLIC_HOST`, and for a POST to an `/in/` door
 *     that must not be redirected.
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

  const legacyNames = new Set(String(vars.LEGACY_HOSTS ?? '').split(/[\s,]+/).map((h) => h.toLowerCase()).filter((h) => h.length > 0));
  const list = [];
  for (const on of new Set([host, ...handed])) {
    const shared = handed.has(on);
    /* A SHARED NAME THAT IS A LEGACY HOST (the shared name after the app went back to its own): the site hands it the
       doors, so its page loads reach this Worker and are sent on, and its API doors are served. `/slash` is still the
       site's, and `/app/signin` asked as a browser asks is ONE 308 to `/signin` at the root of the app's name, query
       kept, and never to `/app/signin` there and then again. */
    const sentOn = shared && legacyNames.has(on) && on !== host;
    if (shared)
      list.push({
        method: 'GET',
        url: `https://${on}/slash`,
        expects: '200 from the site',
        judge: (a) =>
          a.status === 200 && isHtml(a) ? null
          : isJson(a) ? `answered ${a.status} in JSON, which is this Worker and not the site: the site's run_worker_first is wider than the doors and hands a site path to the app`
          : `answered ${a.status}, so the site did not deploy, or ${on} is not its Custom Domain`,
      });
    const signin = `https://${host}/signin?from=smoke`;
    const once = (a) => {
      const to = a.headers.get('location') ?? '';
      if (a.status === 308 && to === signin) return null;
      if (a.status === 308 && to === `https://${host}/app/signin?from=smoke`)
        return `answered a 308 to ${to}, which is the app's old address and a second hop: the Worker serving is older than the app at the root`;
      if (a.status === 404 && isHtml(a)) return `answered the site's 404 page: the deployed site on ${on} does not hand /app/* to this Worker, so every saved link there is dead`;
      if (a.status === 200 && isHtml(a)) return `answered the shell where a 308 to ${signin} was expected: the Worker serving still draws the app under /app`;
      return `answered ${a.status}${to ? ` to ${to}` : ''} where one 308 to ${signin} was expected${sentOn ? '. Is LEGACY_HOSTS in the deployed vars?' : ''}`;
    };
    /* THE OLD ADDRESS IS ASKED WHERE IT IS SENT ON: the app's own name and a legacy name the site hands over. A name the
       site hands over that is neither (the app sharing the site's name, a push of the one-domain move) is the site's at
       its root, so neither the redirect nor the shell is asked there. */
    const moves = on === host || sentOn;
    list.push(
      ...(moves ?
        [
          {
            method: 'GET',
            url: `https://${on}/app/signin?from=smoke`,
            headers: { accept: 'text/html' },
            expects: `308 to ${signin}`,
            judge: once,
          },
        ]
      : []),
      ...(on !== host ?
        []
      : ['/', '/signin'].map((path) => ({
          method: 'GET',
          url: `https://${on}${path}`,
          headers: { accept: 'text/html' },
          expects: '200, the app shell',
          judge: (a) =>
            a.status === 200 && isHtml(a) ? null
            : a.status === 308 ? `answered a 308 to ${a.headers.get('location') ?? 'nowhere'}: the Worker serving is older than the app at the root and sends ${path} into /app`
            : shared ? `answered ${a.status}${isHtml(a) ? ' as a page' : ''}: the deployed site on ${on} does not hand ${path} to this Worker`
            : `answered ${a.status}${isHtml(a) ? ' as a page' : ''} on this Worker's own Custom Domain, so the build it carries has no build/index.html`,
        }))),
      {
        method: 'GET',
        url: `https://${on}/api/boot`,
        /* ALWAYS 401. The public demo was the one var that made this a 200, and it is gone: a file that still sets it deploys a Worker that reads it nowhere, so a 200 here is a Worker older than that. */
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

  /* THE PAGE LOAD ASKED IS ONE UNDER `/app`, because that is the old address on every name: a legacy name the site
     holds has no other page that reaches this Worker (the site answers those), and the app's own name moves nothing
     else. It lands at the root, with the `/app` taken off. */
  const target = `https://${host}/r/x`;
  const askedPath = '/app/r/x';
  list.push(
    {
      method: 'GET',
      url: `https://${old}${askedPath}`,
      headers: { accept: 'text/html' },
      expects: `308 to ${target}`,
      judge: (a) => {
        const to = a.headers.get('location') ?? '';
        if (a.status === 308 && to === target) return null;
        if (a.status === 308 || a.status === 301 || a.status === 302 || a.status === 307)
          return `answered ${a.status} to ${to || 'nowhere'}. The move is one 308 to ${target}: a temporary redirect is asked again every time, a Location still under /app is a second hop, and one to another name before the move is the flip's vars deployed before the site hands that name the doors`;
        if (old === host)
          return `answered ${a.status}${isHtml(a) ? ', the shell' : ''}: a page load under /app on ${host} is not sent to the root of the same name, so every link and magic link already mailed opens the old address`;
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
    url: `https://${host}/${slug}/api/boot`,
    canary: true,
    expects: '200 JSON, the canary record signed in',
    judge: (a) => {
      if (a.status === 200 && isJson(a)) return null;
      if (a.status === 401 && isJson(a)) return `answered 401: SMOKE_TOKEN is not a live token on ${slug}, which is most often a lapsed, revoked or mistyped token rather than this deploy, so mint a read token there and set it again`;
      if (a.status === 503 && isJson(a)) return 'answered 503: the canary record did not open on this build, which is what a migration refusing real rows looks like';
      if (a.status === 200 && isHtml(a)) return `answered the app shell, so /${slug}/api/boot fell to the page router rather than the record`;
      if (a.status === 404 && !isJson(a)) return `answered a 404 page: something other than this Worker answers /${slug}/* on ${host}`;
      return `answered ${a.status}${isJson(a) ? ' in JSON' : ''} where 200 JSON was expected`;
    },
  };
}

/** A name no record holds, for the refused question: `SLUG`-shaped, and random so nobody can have made it first. */
export const nowhereSlug = () => `nobody-${randomBytes(8).toString('hex')}`;

/**
 * What a first-draw read is asked about on the canary, from what the bare reads answered (`said`, by method), or why
 * it cannot be: `{ args }` or `{ skip }`. `said` holds every answer so far, so `get` opens the row `list` answered. A canary that holds no list, no add-on or no page has nothing to name, and
 * that is said, not counted wrong; a canary in use holds all three.
 */
export function argsFor(read, said) {
  const registers = Array.isArray(said.boot?.registers) ? said.boot.registers.filter((r) => typeof r?.id === 'string' && r.id !== 'session') : [];
  const register = (registers.find((r) => Number(r.count) > 0) ?? registers[0])?.id ?? null;
  if (read.ask === 'bare') return { args: {} };
  if (read.ask === 'every') return { args: { every: true } };
  if (read.ask === 'list' || read.ask === 'body') {
    if (!register) return { skip: 'the canary holds no list to name' };
    if (read.ask === 'body') return { args: { body: { page: 'smoke', title: 'Smoke', blocks: [{ kind: 'table', source: `register.${register}` }] } } };
    return { args: read.method === 'list' ? { register, limit: 1 } : { register } };
  }
  if (read.ask === 'pack') {
    const on = Array.isArray(said.packs) ? said.packs.find((p) => typeof p?.id === 'string' && p.disabled_at == null) : undefined;
    return on ? { args: { id: on.id } } : { skip: 'the canary has no plugin switched on' };
  }
  if (read.ask === 'page') {
    const first = Array.isArray(said.pages) ? said.pages.map((p) => p?.slug ?? p?.page).find((s) => typeof s === 'string') : undefined;
    return first ? { args: { slug: first } } : { skip: 'the canary has no page' };
  }
  if (read.ask === 'row') {
    const row = Array.isArray(said.list?.rows) ? said.list.rows.find((r) => Number.isInteger(r?.seq)) : undefined;
    return row && register ? { args: { register, seq: row.seq } } : { skip: 'the canary has no row to open' };
  }
  return { skip: `${read.method} is asked as ${read.ask}, which this smoke does not know` };
}

/** One first-draw read on the canary, as the client sends it: a GET's arguments in the address, a POST's in its body. */
export function readCheck(config, name, slug, read, args = {}) {
  const host = String(config.env?.[name]?.vars?.PUBLIC_HOST ?? '').toLowerCase();
  const url = new URL(`https://${host}/${slug}/api/${read.method}`);
  if (!read.post) for (const [k, v] of Object.entries(args)) url.searchParams.set(k, typeof v === 'string' ? v : JSON.stringify(v));
  return {
    method: read.post ? 'POST' : 'GET',
    url: url.toString(),
    ...(read.post ? { body: JSON.stringify(args), headers: { 'content-type': 'application/json' } } : {}),
    canary: true,
    expects: `200 JSON, read by ${read.by}`,
    judge: (a) => {
      if (a.status === 200 && isJson(a)) return null;
      if (a.status >= 500) return `answered ${a.status}: ${read.by} breaks on this build`;
      if (a.status === 401 && isJson(a)) return `answered 401: SMOKE_TOKEN is not a live token on ${slug}, so mint one at propose and set it again`;
      return `answered ${a.status}${isJson(a) ? ' in JSON' : ''} where 200 JSON was expected, so ${read.by} draws a refusal`;
    },
  };
}

/**
 * The two questions about who may open what: `version` with no bearer is 401, and the canary's token at a second name
 * no record holds is refused with nothing of the canary in the answer. `nowhere` is that name.
 */
export function refusals(config, name, slug, nowhere, token = '') {
  const host = String(config.env?.[name]?.vars?.PUBLIC_HOST ?? '').toLowerCase();
  if (!SLUG.test(String(nowhere ?? '')) || nowhere === slug) throw new Error(`the second name ${JSON.stringify(nowhere ?? '')} is not a record's name apart from the canary's`);
  const minted = String(token).split('.')[0] ?? '';
  return [
    {
      method: 'GET',
      url: `https://${host}/${slug}/api/version`,
      expects: '401 JSON without the bearer',
      judge: (a) =>
        a.status === 401 && isJson(a) ? null
        : a.status === 200 ? "answered 200 with no token, so the record's version is told to a stranger"
        : `answered ${a.status}${isJson(a) ? ' in JSON' : ''} where 401 JSON was expected`,
    },
    {
      method: 'GET',
      url: `https://${host}/${nowhere}/api/boot`,
      canary: true,
      expects: "refused at a second name, naming nothing of the canary's",
      judge: (a) => {
        if (a.status === 200) return "answered 200: the canary's token opened a record it was not minted for";
        if (a.status >= 500) return `answered ${a.status} where a refusal was expected`;
        if (!isJson(a) || a.status < 400) return `answered ${a.status}${isJson(a) ? ' in JSON' : ''} where a refusal in JSON was expected`;
        const text = String(a.text ?? '').split(nowhere).join('');
        const body = bodyOf(a);
        if (text.includes(slug) || (minted.length > 3 && text.includes(minted))) return "the refusal names the canary's record";
        const held = (o) => o !== null && typeof o === 'object' && ['rows', 'registers', 'record', 'pages'].some((k) => Object.hasOwn(o, k));
        if (held(body) || held(body?.value)) return 'the refusal carries what a record holds';
        return null;
      },
    },
  ];
}

/** One check's verdict on one answer: `null` when it is the answer the table expects, or the sentence saying what it means. */
export const judge = (check, answer) => check.judge(answer);

/** How long one question waits before the host counts as unreachable. */
const ASK_MS = 20_000;

/**
 * The whole smoke step. `signedIn` is `{ token, slug }` for the canary, read from `SMOKE_TOKEN` and `SMOKE_SLUG` by the
 * command line; with either missing the canary is skipped, and the step says so. `io` is for a test: its `fetch`, its
 * `log`, the second name (`nowhere`) and the reads (`reads`, the first-draw list by default).
 *
 * THE BARE READS GO FIRST, because what the others are about is read from their answers: the first list `boot` names,
 * the first add-on `packs` answers, the first page `pages` answers.
 */
export default async function smoke(name, config = wranglerConfig(), site = siteConfig(), signedIn = {}, io = {}) {
  const ask = io.fetch ?? fetch;
  const log = io.log ?? console.log;
  const reads = io.reads ?? FIRST_DRAW;
  const list = checks(config, name, site);
  let failed = 0;
  const { token, slug } = signedIn;
  let refused = null;
  let first = [];
  if (token && slug) {
    try {
      first = [canary(config, name, slug), ...refusals(config, name, slug, io.nowhere ?? nowhereSlug(), token), ...fenceChecks(config, name, slug, token)];
    } catch (err) {
      refused = err instanceof Error ? err.message : String(err);
    }
  }
  log('');
  log(`  smoke: ${name}, ${list.length + first.length} check(s)${first.length ? ` and ${reads.length - 1} more first-draw read(s) on the canary` : ''}, read-only${first.length ? " but for the fence's file puts on the canary" : ''}`);
  if (!list.some((c) => c.url.endsWith('/slash')))
    log(`  ${name}'s site does not hand this Worker its doors, so the site is not asked: ${siteBinding(config, site, name).why ?? 'no name of the site is one this Worker is not already on'}`);
  /* A CANARY NAMED WITH NO KEY TO OPEN IT IS RED, NOT A SKIP: the canary exists, so a missing token is a mistake. */
  if (slug && !token) {
    failed += 1;
    log(`  WRONG  SMOKE_SLUG names the canary ${slug} and SMOKE_TOKEN is not set, so the signed-in half cannot run; the canary exists, so this is red and not a skip`);
  } else if (!token || !slug) log('  the signed-in half is skipped: SMOKE_TOKEN and SMOKE_SLUG are not both set, so no record is opened');
  else log('  /account/usage is not asked signed in: it opens for a browser session, never for a record\'s token, so the fence asks it with no key');
  if (refused) {
    failed += 1;
    log(`  WRONG  ${refused}`);
  }

  /** Asks one check and prints its line: the answer, or `null` when the host could not be reached. */
  async function run(check) {
    let answer;
    try {
      const got = await ask(check.url, {
        method: check.method,
        headers: { 'cache-control': 'no-cache', ...(check.headers ?? {}), ...(check.canary ? { authorization: `Bearer ${token}` } : {}) },
        ...(check.body === undefined ? {} : { body: check.body }),
        redirect: 'manual',
        signal: AbortSignal.timeout(ASK_MS),
      });
      answer = { status: got.status, headers: got.headers, text: await got.text() };
    } catch (err) {
      log(`  UNREACHABLE  ${check.method} ${check.shown ?? check.url}: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
    const verdict = judge(check, answer);
    /* HELD IS A KNOWN FAULT WAITING ON ITS FIX (`fence.mjs`): said, and not counted. `shown` is a file's address in words. */
    const held = verdict ? heldOf(check, answer, io.held) : null;
    if (verdict && !held) failed += 1;
    log(`  ${held ? 'HELD ' : verdict ? 'WRONG' : 'ok   '}  ${check.method} ${check.shown ?? check.url}  expects ${check.expects}${verdict ? `\n         ${verdict}` : ''}${held ? `\n         held: ${held}` : ''}`);
    return answer;
  }

  for (const check of list) if ((await run(check)) === null) return 2;

  if (first.length) {
    /* `boot` IS `canary()`'s, whose sentences tell a lapsed token from a record that will not open, and its answer
       names what the reads after it are about. */
    const said = {};
    const [boot, ...rest] = first;
    const booted = await run(boot);
    if (booted === null) return 2;
    said.boot = booted.status === 200 ? valueOf(booted) : null;
    for (const check of rest) if ((await run(check)) === null) return 2;
    for (const read of reads.filter((r) => r.method !== 'boot')) {
      const named = argsFor(read, said);
      if (named.skip) {
        log(`  skip   ${read.method}: ${named.skip}`);
        continue;
      }
      const answer = await run(readCheck(config, name, slug, read, named.args));
      if (answer === null) return 2;
      said[read.method] = answer.status === 200 ? valueOf(answer) : null;
    }
  }
  log(`  smoke: ${name}, ${failed} wrong`);
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
