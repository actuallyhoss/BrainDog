/**
 * `smoke`: after a deploy, ask the two Workers on one hostname whether each path reached the right one.
 *
 *   node apps/worker/scripts/smoke.mjs production
 *   node apps/worker/scripts/smoke.mjs alpha
 *
 * THE ANSWERS IN `loop/research-one-domain.md` SECTION 3.5, ASKED LIVE, FOR WHICHEVER OF THE THREE
 * PUSHES JUST DEPLOYED. Once the zone routes land the app lives on `brain.dog` beside the marketing
 * site: the site holds the name as its Custom Domain and this Worker takes zone routes on it, which
 * Cloudflare runs first ("Routes can `fetch()` Custom Domains and take precedence if configured on the
 * same hostname", developers.cloudflare.com/workers/configuration/routing/routes). `wrangler deploy`
 * says nothing about whether a route landed, and `deploy-parity` asks one host. A route that did not
 * land shows up as the site's 404 page answering an API call, which is a healthy-looking response from
 * the wrong Worker, and every check below is written against that answer as much as against the right
 * one. Before the routes land (push A) the checks are on the Worker's own name, and the one that
 * matters most is that a page load there reaches `/app` rather than `ROUTE_UNKNOWN`.
 *
 * THE HOSTS COME FROM `wrangler.jsonc`, NOT FROM A REPOSITORY VARIABLE. `PUBLIC_HOST`, `LEGACY_HOSTS`
 * and the routes are what the Worker was deployed with, so reading them here asks the names the deploy
 * claimed rather than the name somebody typed into the repository settings.
 *
 * IT WRITES NOTHING. GETs with no cookie and no bearer, one GET that must be redirected, and one empty
 * POST to an `/in/` door no record has minted, which `serveIngest` refuses with a 404 before any record
 * is named.
 *
 * EXIT CODES: 0 when every check answers as `checks` says, 1 when one does not, 2 when a host could not
 * be reached at all.
 */

import { wranglerConfig } from './provision-check.mjs';

/**
 * `src/route.ts`'s record id shape, copied because this is plain JavaScript and cannot import it.
 * `demoRecord` there opens nothing for a value of any other shape, so a malformed `DEMO_RECORD` is
 * still the 401, and this check has to agree with it or it reports a correct deploy as broken.
 */
const REC_ID = /^rec_[0-9A-HJKMNP-TV-Z]{26}$/;

const typeOf = (answer) => answer.headers.get('content-type') ?? '';
const isJson = (answer) => /application\/json/i.test(typeOf(answer));
const isHtml = (answer) => /text\/html/i.test(typeOf(answer));

/** A route pattern's host: everything before the first `/`, which is the whole pattern for a Custom Domain. */
const hostOf = (route) => String(route.pattern ?? '').split('/')[0].toLowerCase();

/**
 * The checks for one environment, read off the shape the file deploys.
 *
 * THE NAMES COME FROM THE ROUTES AS WELL AS FROM `PUBLIC_HOST`, BECAUSE THE MOVE GOES OUT IN THREE PUSHES AND EACH ONE
 * PUTS THE WORKER ON A DIFFERENT SET OF NAMES (`loop/research-one-domain-cutover.md` §2.3, §5). Reading `PUBLIC_HOST`
 * alone, as this did, asked `https://app.brain.dog/pricing` after push A: that is the Worker's name, where `/pricing` is
 * the Worker's 308 and not the site, so a good dark deploy went red. Now:
 *
 *   - every name the app is on, `PUBLIC_HOST` and each zone route's host, is asked for the shell and a 401 at `/api/boot`;
 *   - a name held by a zone route is shared with the site, so it is asked `/pricing` first, which is the check that a
 *     route is not wider than the doors. A name held as this Worker's Custom Domain has no site on it to ask;
 *   - the old name, `LEGACY_HOSTS`, or before the move the public host itself when it is a Custom Domain, is asked for a
 *     page load's 308 into `/app` on `PUBLIC_HOST`, and for a POST to an `/in/` door that must not be redirected.
 *
 * Push A is four questions on `app.brain.dog`, A2 is seven across both names, and B is the design's five.
 */
export function checks(config, name) {
  const block = config.env?.[name] ?? {};
  const vars = block.vars ?? {};
  const host = String(vars.PUBLIC_HOST ?? '').toLowerCase();
  if (!host) throw new Error(`env.${name} has no PUBLIC_HOST in apps/worker/wrangler.jsonc`);
  const routes = block.routes ?? [];
  const own = new Set(routes.filter((r) => r.custom_domain).map(hostOf));
  const zoned = new Set(routes.filter((r) => !r.custom_domain).map(hostOf));
  /* A PUBLIC HOST THE WORKER IS NOT ON is a file that cannot deploy a working app, and every answer asked of it would
     be some other server's. Refused before anything is asked, so the sentence names the file rather than a status. */
  if (!own.has(host) && !zoned.has(host))
    throw new Error(`env.${name}: PUBLIC_HOST ${host} is neither a Custom Domain nor a zone route of this Worker in apps/worker/wrangler.jsonc`);
  const legacy = String(vars.LEGACY_HOSTS ?? '').split(/[\s,]+/).map((h) => h.toLowerCase()).filter((h) => h.length > 0)[0] ?? null;
  const old = legacy ?? (own.has(host) ? host : null);
  const demo = REC_ID.test(String(vars.DEMO_RECORD ?? ''));

  const list = [];
  for (const on of new Set([host, ...zoned])) {
    const shared = zoned.has(on);
    if (shared)
      list.push({
        method: 'GET',
        url: `https://${on}/pricing`,
        expects: '200 from the site',
        judge: (a) =>
          a.status === 200 && isHtml(a) ? null
          : isJson(a) ? `answered ${a.status} in JSON, which is this Worker and not the site: a zone route is wider than the doors and has taken a site path`
          : `answered ${a.status}, so the site did not deploy, or ${on} is not its Custom Domain`,
      });
    list.push(
      {
        method: 'GET',
        url: `https://${on}/app/`,
        expects: '200, the app shell',
        judge: (a) =>
          a.status === 200 && isHtml(a) ? null
          : shared ? `answered ${a.status}${isHtml(a) ? ' as a page' : ''}: the zone route for ${on}/app/* is missing and the site answered, or the Worker is older than the /app shell`
          : `answered ${a.status}${isHtml(a) ? ' as a page' : ''} on this Worker's own Custom Domain, so the version serving is older than the /app shell or the build it carries has no build/app/index.html`,
      },
      {
        method: 'GET',
        url: `https://${on}/api/boot`,
        expects: demo ? '200 JSON, the pinned demo' : '401 JSON',
        judge: (a) => {
          const want = demo ? 200 : 401;
          if (a.status === want && isJson(a)) return null;
          if (a.status === 404 && !isJson(a))
            return shared ? `answered a 404 page, which is the site answering an API call: the zone route for ${on}/api/* is missing`
            : `answered a 404 page on this Worker's own Custom Domain, which is something other than this Worker answering ${on}`;
          if (a.status === 401 && !isJson(a)) return 'answered 401 without JSON, which is something in front of the Worker refusing rather than the Worker';
          if (demo && a.status === 401) return 'answered 401 where the file pins a demo record, which is a deploy that did not carry DEMO_RECORD';
          return `answered ${a.status} where ${want} JSON was expected`;
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
          return `answered ${a.status} to ${to || 'nowhere'}. The move is a 308 to ${target}: a temporary redirect is asked again every time, a Location without /app lands on the site, and one to another name before the move is the flip's vars deployed without its routes`;
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

/** One check's verdict on one answer: `null` when it is the answer the table expects, or the sentence saying what it means. */
export const judge = (check, answer) => check.judge(answer);

/** The whole smoke step. */
export default async function smoke(name, config = wranglerConfig()) {
  const list = checks(config, name);
  let failed = 0;
  console.log('');
  console.log(`  smoke: ${name}, ${list.length} check(s), read-only`);
  if (!list.some((c) => c.url.endsWith('/pricing')))
    console.log(`  ${name} has no zone route, so the site is not asked: no name of this Worker's is shared with it yet`);
  for (const check of list) {
    let answer;
    try {
      answer = await fetch(check.url, {
        method: check.method,
        headers: { 'cache-control': 'no-cache', ...(check.headers ?? {}) },
        redirect: 'manual',
        signal: AbortSignal.timeout(20_000),
      });
      await answer.arrayBuffer();
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
    process.exitCode = await smoke(name);
  }
}
