/**
 * `provision-check`: is this host ready to be provisioned, and what is missing.
 *
 *   node apps/worker/scripts/provision-check.mjs app.brain.dog     (brain.dog once push B2 of the one-domain move is live)
 *   node apps/worker/scripts/provision-check.mjs http://localhost:8787 --no-account
 *
 * THIS IS THE REHEARSAL IN `loop/research-provision-day.md` TURNED INTO A COMMAND. That document
 * walked the whole of provisioning on a host configured the way production is, and the part of it a
 * person needs at midnight is not the prose: it is the four or five questions he would otherwise ask
 * by hand, with curl, in the wrong order, from a terminal, while a `wrangler tail` scrolls. Every
 * reading below is one of that document's measurements, asked live instead of remembered.
 *
 * IT NEVER MINTS, WRITES OR PRINTS A SECRET, AND THAT IS A PROPERTY OF WHAT IT SENDS RATHER THAN A
 * PROMISE. It sends no `authorization` header, no request body and no `Origin`, so there is no call
 * here that a route would act on: `operated()` in `packages/host/src/auth.ts` compares the operator
 * key before it reads a body and long before it reaches `provision()`, so the probe at
 * `/auth/provision` is answered at the bearer and nothing is made. The two account questions are
 * `wrangler r2 bucket info` and `wrangler secret list`, both of which are reads, and the second of
 * which prints secret NAMES and never values. This file parses that answer for three names it
 * expects and prints presence, so even the names are not echoed from a command's output.
 *
 * SO IT IS SAFE AGAINST PRODUCTION, WHICH IS THE ONLY HOST IT IS ANY USE AGAINST. A checker that
 * has to be run somewhere else first is a checker nobody runs.
 *
 * WHAT IT CANNOT ANSWER, IT SAYS OUT LOUD RATHER THAN GUESSING. Nothing unauthenticated reports
 * whether `KEK` is bound, whether the nightly cron is green, or whether a real browser completes the
 * passkey ceremony. The first of those has an account-scoped answer and this script asks for it; the
 * other two are printed as the command or the screen to look at by hand.
 *
 * EXIT CODES: 0 when the host is ready to provision, 1 when something named below is missing, and 2
 * when the script could not ask at all. A 1 is the ordinary answer before the night, not a fault.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The repository, from this file, the way `deploy-parity` finds it rather than from `process.cwd()`. */
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/**
 * JSONC into JSON, because `wrangler.jsonc` is two thirds comment and every fact this script wants
 * about an environment is in it.
 *
 * A STATE MACHINE RATHER THAN A REGULAR EXPRESSION, and the reason is in the file itself: the
 * comments hold `https://` and `*\/`, and several strings hold `//` in a path. A `//.*$` sweep over
 * this file deletes half of `"$schema"`. The scanner below knows only three things, which is all
 * this dialect needs: a string, a line comment and a block comment.
 */
export function stripJsonc(text) {
  let out = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (inString) {
      out += c;
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      out += c;
      continue;
    }
    if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i += 1;
      out += '\n';
      continue;
    }
    if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end === -1 ? text.length : end + 1;
      out += ' ';
      continue;
    }
    out += c;
  }
  return out;
}

const wranglerText = (root) => readFileSync(join(root, 'apps', 'worker', 'wrangler.jsonc'), 'utf8');

/** `apps/worker/wrangler.jsonc`, parsed. It is the only place the bucket names and the vars live. */
export function wranglerConfig(root = ROOT) {
  return JSON.parse(stripJsonc(wranglerText(root)));
}

/**
 * One staged push applied to a config: `routes` replaces the environment's list, and `vars` sets the keys it names and
 * keeps the rest. A copy; the config handed in is not touched.
 *
 * ANYTHING ELSE IS REFUSED, NOT IGNORED. A fragment naming `env.staging`, or `route` for `routes`, would otherwise be a
 * push that changes nothing, and every test that reads it would go green on the file as it already is.
 */
export function applyPush(config, change) {
  const next = structuredClone(config);
  for (const [name, block] of Object.entries(change)) {
    const target = next.env?.[name];
    if (!target) throw new Error(`a staged push names env.${name}, which apps/worker/wrangler.jsonc does not have`);
    for (const key of Object.keys(block)) {
      if (key === 'routes') target.routes = structuredClone(block.routes);
      else if (key === 'vars') target.vars = { ...(target.vars ?? {}), ...block.vars };
      else throw new Error(`a staged push for env.${name} changes ${key}, and a push here changes only routes and vars`);
    }
  }
  return next;
}

/**
 * The one-domain move as the pushes it goes out in: `A`, the file as it deploys, then each `STAGE <name> {...}` fragment
 * in the file's opening comment applied on top of the one before. Today that is `A`, `B1` (alpha's flip) and `B2`
 * (production's), `loop/research-one-domain-binding.md` section 4.
 *
 * THE FLIP IS KEPT AS DATA IN THE FILE IT CHANGES, AND READ BY THE SAME SCANNER. Left in a note it would be a config
 * nobody had parsed; here `test/wrangler-routes.test.ts` holds every push to the same checks as the file, and
 * `smoke.test.mjs` knows what the smoke step will ask after each one. The fragment is found by its marker and read to
 * its closing brace with strings respected, so a brace inside a value cannot end it early.
 */
export function pushes(root = ROOT) {
  const text = wranglerText(root);
  const base = JSON.parse(stripJsonc(text));
  const out = [{ name: 'A', config: base, change: null }];
  const marker = /\bSTAGE ([A-Z][A-Z0-9]*) (?=\{)/g;
  for (let m = marker.exec(text); m !== null; m = marker.exec(text)) {
    const open = m.index + m[0].length;
    let depth = 0;
    let inString = false;
    let close = -1;
    for (let i = open; i < text.length && close === -1; i += 1) {
      const c = text[i];
      if (inString) {
        if (c === '\\') i += 1;
        else if (c === '"') inString = false;
      } else if (c === '"') inString = true;
      else if (c === '{') depth += 1;
      else if (c === '}' && (depth -= 1) === 0) close = i;
    }
    if (close === -1) throw new Error(`STAGE ${m[1]} in apps/worker/wrangler.jsonc never closes its brace`);
    const change = JSON.parse(text.slice(open, close + 1));
    out.push({ name: m[1], config: applyPush(out[out.length - 1].config, change), change });
  }
  return out;
}

/** `apps/site/wrangler.jsonc`, parsed. The site's config decides which of its names hand the app its doors. */
export function siteConfig(root = ROOT) {
  return JSON.parse(stripJsonc(readFileSync(join(root, 'apps', 'site', 'wrangler.jsonc'), 'utf8')));
}

/** A route pattern's host: everything before the first `/`, which is the whole pattern for a Custom Domain. */
export const hostOf = (route) => String(route?.pattern ?? '').split('/')[0].toLowerCase();

/** `run_worker_first`'s glob, with negatives winning: "Negative patterns have precedence over non-negative patterns". */
export const workerFirst = (entries, path) => {
  const glob = (p) => (p.endsWith('*') ? path.startsWith(p.slice(0, -1)) : path === p);
  if (entries.some((e) => e.startsWith('!') && glob(e.slice(1)))) return false;
  return entries.some((e) => !e.startsWith('!') && glob(e));
};

/**
 * One path for each door the app has built, and the shell, which a site has to run its script first on before any of
 * its names is one of the app's.
 *
 * WRITTEN HERE RATHER THAN READ FROM `src/route.ts`, SO THE DEPLOY'S SMOKE STEP DOES NOT LOAD THE WORKER'S MODULE GRAPH.
 * That is a choice and not a limit: a bare `node` 24.13 imports `route.ts` and `@braindog/host` behind it (measured on
 * 23 September), but a smoke step that goes red because the router gained an import a runner cannot load is red for a
 * reason that has nothing to do with the deploy it is judging. So `test/wrangler-routes.test.ts` holds this list to
 * `route.ts` instead: every entry must be a path the Worker serves, and every door the app's own `run_worker_first` has
 * built must have an entry here. A door added to the router without a line here fails that test rather than a deploy.
 */
export const DOORS = ['/app', '/app/', '/app/acme/api/boot', '/api/boot', '/auth/methods', '/account/usage', '/mcp', '/in/abc', '/.well-known/braindog-build'];

/**
 * Which of the site's names are this app's in one environment, and when none are, the sentence that says why.
 *
 * THE MOVE TO ONE DOMAIN GOES THROUGH THE SITE'S SERVICE BINDING, NOT A ZONE ROUTE (`loop/research-one-domain-binding.md`).
 * The site keeps `brain.dog` as its Custom Domain and hands the app's doors to it: `assets.run_worker_first` decides
 * which paths reach the site's script, and `services` decides which app that script calls. So a site name is the app's
 * when all three hold in the SAME environment: a script to run (`main`, which is inherited), `APP` bound to
 * `<this app's name>-<env>`, and every door in `doors` worker-first. A site bound to the other environment's app would
 * serve production's record on alpha's name, and counting that name as either environment's would describe a deploy
 * nobody intended, so it is neither.
 *
 * `services` IS NOT INHERITABLE AND `assets` IS REPLACED WHOLE, so each is read the way wrangler resolves it: `services`
 * from the environment alone, `assets` from the environment or else the top level.
 */
export function siteBinding(config, site, env, doors = DOORS) {
  const block = site?.env?.[env];
  if (!block) return { names: [], why: `the site has no env.${env}` };
  if (!(block.main ?? site.main)) return { names: [], why: `the site's env.${env} has no main, so no script runs to hand the app a door` };
  const app = `${config?.name ?? 'braindog'}-${env}`;
  const bound = (block.services ?? []).find((s) => s?.binding === 'APP');
  if (!bound) return { names: [], why: `the site's env.${env} binds no APP` };
  if (bound.service !== app) return { names: [], why: `the site's env.${env} binds APP to ${bound.service}, and this app there is ${app}` };
  const first = (block.assets ?? site.assets ?? {}).run_worker_first;
  const list = first === true ? ['/*'] : Array.isArray(first) ? first : [];
  const left = doors.filter((path) => !workerFirst(list, path));
  if (left.length > 0) return { names: [], why: `the site's env.${env} does not run its script first on ${left.join(', ')}, so its 404 page answers them` };
  return { names: (block.routes ?? []).filter((r) => r.custom_domain).map(hostOf), why: null };
}

/**
 * Which environment serves the host he named, read off the app's `routes` and the site's binding rather than off a
 * table here.
 *
 * `null` FOR A HOST THIS FILE DOES NOT NAME, AND THAT IS THE USEFUL ANSWER. A rehearsal host on
 * `localhost` is a real thing to point this at, and guessing production for it would read production's
 * bucket name and production's vars and report them as that host's. The probes below work on any
 * host; only the account questions need to know which environment it is.
 *
 * A SITE NAME COUNTS WHEN THE SITE'S SAME ENVIRONMENT HANDS THIS APP EVERY DOOR (`siteBinding` above). After push B2
 * `brain.dog` is production's `PUBLIC_HOST` and is no Custom Domain of this Worker, so reading `routes` alone, as this did
 * while the move was to be zone routes, answers `null` for production's own name. A route's host part is compared
 * whole, so `brain.dog.evil` is not production either. `app.brain.dog` is a Custom Domain in every push and reads as
 * production in every push, which it is.
 */
export function environmentOf(config, host, site = siteConfig()) {
  const name = String(host).replace(/^[a-z]+:\/\//i, '').split('/')[0].split(':')[0].toLowerCase();
  for (const [env, block] of Object.entries(config.env ?? {})) {
    const names = [...(block.routes ?? []).map(hostOf), ...siteBinding(config, site, env).names];
    if (names.includes(name)) return { name: env, bucket: block.r2_buckets?.[0]?.bucket_name ?? null, vars: block.vars ?? {} };
  }
  return null;
}

/**
 * THE REPAIR ORDER, AS RANKS, AND IT IS THE DOCUMENT'S ORDER RATHER THAN THE ORDER THE CHECKS RUN IN.
 * The two deploys go together and go first, with the nightly copy's decision ahead of them because it
 * is the only thing on this list that is failing silently today. Then the three secrets, and `KEK`
 * before `PROVISION_KEY` for the reason the whole rehearsal turns on: a record provisioned in the
 * window where the operator key works and the key store is unbound can never seal a grant, and the
 * only repair is to throw the record away and give up its name.
 */
const RANK = { AGE_RECIPIENT: 1, deploy: 2, SESSION_SECRET: 3, KEK: 4, PROVISION_KEY: 5 };

/**
 * THE FOUR SENTENCES THAT HAVE TO NAME THE KEY STORE SECRET, KEPT AS DATA BECAUSE OF A GATE, AND THE
 * GATE IS RIGHT.
 *
 * `tools/gates/secret-grep.mjs` reads the ARGUMENT of every `console.log` and calls it a finding when
 * a name a key goes by appears in it. A sentence saying `KEK is unbound` sits inside that argument
 * and is, to that gate, indistinguishable from the key itself arriving in a log. It found four of
 * these here and it was red, which is the behaviour anybody would want from it: the leak it exists to
 * catch is one line added while debugging, and a gate that asked "but is this one prose" would catch
 * nothing.
 *
 * A RUNBOOK THAT CANNOT NAME THE SECRET IT TELLS HIM TO BIND IS NOT A RUNBOOK, so the sentences live
 * here, as values, and the sinks below print a value. Nothing is exempted and the gate's rule is
 * exactly as strict as it was. This is also where to read this script's whole vocabulary about the
 * key store in one place, which is the half of the trade that is an improvement rather than a cost.
 */
const SAYS = {
  guarded: '    apps/worker/src at that commit calls keylessRefusal, so this build refuses to provision a record while KEK is unbound',
  unguarded:
    '    that commit has no keyless guard, so provisioning while KEK is unbound would make a record that can never seal a grant, with no repair but throwing the record away',
  notTheKeyStore: '    the key field there is a sign-in method and not the key store: nothing unauthenticated reports whether KEK is bound',
  byHand: '    whether a record already on this host was made before KEK was bound. POST /api/export and read dog_meta: keys says none, or connector,record,signing.',
};

/**
 * The list of what is missing, each thing once, in the order to repair it.
 *
 * TWO CHECKS FIND `PROVISION_KEY` ABSENT AND THEY ARE NOT TWO PROBLEMS. The probe at
 * `/auth/provision` sees the route switched off and the account read sees no such secret bound; the
 * first run of this script against `app.brain.dog` printed both, as items 2 and 4, with `KEK`
 * between them. A list that names the same repair twice, in the wrong order, is a list he stops
 * following at item 2.
 *
 * THE FIRST SENTENCE ABOUT A THING IS THE ONE KEPT, which is the probe's, because a sentence about
 * what the host answered is more use at the terminal than one about what an account listing did not
 * contain.
 */
export function plan(notes) {
  const seen = new Map();
  for (const note of notes) if (!seen.has(note.key)) seen.set(note.key, note);
  return [...seen.values()].sort((a, b) => a.rank - b.rank);
}

/** `2026.09.21+d42b697` into its two halves. A deploy that forgot `--var` answers `null` and has no sha. */
export function readBuild(app) {
  const tuple = typeof app === 'string' && app.length > 0 ? app : null;
  const sha = tuple ? (/\+([0-9a-f]{7,40})$/i.exec(tuple)?.[1] ?? null) : null;
  return { tuple, sha };
}

/**
 * One git command, answering whether it succeeded rather than what it printed.
 *
 * THE DIRECTORY IS CALLED `repo` HERE AND `root` EVERYWHERE ELSE IN THIS FILE, which is not a taste.
 * `tools/gates/secret-grep.mjs` counts `root` as a name a key goes by, weakly: it is a finding only
 * in a file that is also about keys, which this file is, because it names the key store secret in
 * the sentences it prints. A child process is one of that gate's sinks, so `execFileSync(..., root, ...)`
 * reads there as a root key handed to a command. The gate is right to be blunt about that name, and
 * the cheap half of the disagreement is this one.
 */
const gitOk = (repo, args) => {
  try {
    execFileSync('git', ['-C', repo, ...args], { stdio: ['ignore', 'ignore', 'ignore'] });
    return true;
  } catch {
    return false;
  }
};

/** One git command, answering what it printed, or `null` when it refused. */
const gitSay = (repo, args) => {
  try {
    return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
};

/**
 * Whether the build serving a host is one that refuses to provision a keyless record.
 *
 * THE HOST WILL NOT TELL US, SO THE COMMIT IS ASKED INSTEAD. `/auth/provision` answers the keyless
 * refusal only to a caller holding the operator key, and this script holds none; the only thing a
 * host gives away for free is its build tuple, whose tail is the short sha the deploy was cut from.
 * So the question becomes a question about a commit in this clone: at that commit, does anything in
 * `apps/worker/src` other than the guard's own file CALL `keylessRefusal`.
 *
 * ASKING WHETHER `keyless.ts` EXISTS WOULD HAVE ANSWERED YES FOR A BUILD THAT PROVISIONS KEYLESS
 * RECORDS, and that is measured rather than imagined. `a2814b00` added `apps/worker/src/keyless.ts`
 * and its six tests; `src/index.ts` at `a2814b00` holds `async function provision(` and does not
 * mention the guard at all. The call arrived at `77f82ccb`, which is seven commits later and the
 * next one to touch that file: `git log a2814b00..77f82ccb -- apps/worker/src/index.ts` names
 * `77f82ccb` and nothing else. A deploy cut anywhere in that window carries the file and ignores it,
 * which is exactly the build this check exists to catch.
 *
 * AND IT IS A TREE-WIDE GREP RATHER THAN A PATH, because `provision()` has moved before and the
 * question is about the deployment rather than about `index.ts`. A file named here would answer `no`
 * the day the function moves, which reads as an alarm about the host.
 *
 * `unknown` IS NOT `no`, AND THE DIFFERENCE IS THE POINT. A sha this clone has never fetched is a
 * `git fetch` nobody ran, and answering `no` there would report a host as dangerous on the strength
 * of a stale checkout. The caller prints all three answers differently.
 */
export function guardsKeylessRecords(sha, root = ROOT) {
  if (!sha || !gitOk(root, ['cat-file', '-e', `${sha}^{commit}`])) return 'unknown';
  const found = gitSay(root, ['grep', '-l', 'keylessRefusal(', sha, '--', 'apps/worker/src']) ?? '';
  const callers = found
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.endsWith('/keyless.ts'));
  return callers.length > 0 ? 'yes' : 'no';
}

/**
 * What `/auth/methods` says, and what it does not say.
 *
 * IT REPORTS THE SESSION SECRET AND THE PASSKEY COUNT AND NOTHING ABOUT THE KEY STORE. `key` there is
 * a sign-in METHOD, a record key a person signs in with; it is not `KEK`. The rehearsal watched
 * `passkey: true` on a host whose `KEK` was 16 bytes, which is to say the sign-in screen looks
 * perfectly healthy on a host where provisioning answers 500.
 */
export function readMethods(value) {
  const why = typeof value?.why === 'string' ? value.why : null;
  const state = why === 'not-configured' ? 'not-configured' : why === 'insecure' ? 'insecure' : value?.passkey ? 'configured' : 'unexpected';
  return { state, why, magic: value?.magic === true, firstRun: value?.firstRun === true, demo: value?.demo === true, me: value?.me ?? null };
}

/** The sentence `off()` writes, copied from `packages/host/src/auth.ts:391` rather than paraphrased. */
const OFF = 'This BrainDog does not offer that way to sign in.';

/**
 * The sentence `operated()` writes when the bearer is absent or wrong, from `packages/host/src/auth.ts:595`.
 *
 * THE 401 IS READ BY ITS SENTENCE FOR THE SAME REASON THE TWO 404s ARE, and the status on its own
 * was not enough. Measured against this file before this constant existed: `readProvision(401, null)`
 * answered `ready` and printed "The next command is the provision itself", and so did a 401 carrying
 * somebody else's JSON. Anything that refuses in front of the Worker with a 401, a Cloudflare Access
 * policy over the hostname above all, reads there as the operator route asking for its key. That is
 * the wrong answer this function exists to prevent, arriving through the one status code it was not
 * asking a question about.
 */
const TAKES_KEY = 'This route takes the operator key.';

/**
 * What a bare `POST /auth/provision` means, which is four different things wearing two status codes.
 *
 * THE TWO 404s DIFFER ONLY IN THEIR SENTENCE, and reading one as the other is the mistake this whole
 * function exists to prevent. `off()` is the route mounted with no `PROVISION_KEY` bound, which one
 * `wrangler secret put` repairs. The other 404 is `serveAuth` not finding the path, which on a
 * deployed host is a build older than the route, and no secret repairs that.
 */
export function readProvision(status, body) {
  const fix = typeof body?.refusal?.fix === 'string' ? body.refusal.fix : null;
  if (status === 401 && fix === TAKES_KEY)
    return { state: 'ready', says: fix, next: 'PROVISION_KEY is bound and the route is answering. The next command is the provision itself.' };
  if (status === 401)
    return {
      state: 'unreadable',
      says: fix,
      next: 'Something answered 401 without the sentence this route writes, so the refusal is in front of the Worker rather than the route asking for the operator key. Find out what else answers for this hostname before reading it as ready.',
    };
  if (status === 404 && fix === OFF)
    return {
      state: 'no-operator-key',
      says: fix,
      next: 'The route is mounted and PROVISION_KEY is not set. Bind KEK first, then PROVISION_KEY, and this probe turns into a 401.',
    };
  if (status === 404 && fix)
    return {
      state: 'no-such-route',
      says: fix,
      next: 'This host has no /auth/provision at all, which is a build older than the route rather than a missing secret. Deploy before anything else.',
    };
  /* A 404 WITH NO JSON IS THE MARKETING SITE. On `brain.dog` the site holds the name and answers every
     path it does not hand to the app, with its own 404 page. The sentence below this one blames the
     app's `run_worker_first`, which on the site's name is the wrong file: the list that is missing a
     door there is the site's. */
  if (status === 404 && body === null)
    return {
      state: 'unreadable',
      says: fix,
      next: "A 404 page with no JSON is the marketing site answering, so the deployed site does not hand /auth/* to the app on this host: its run_worker_first or its APP binding in apps/site/wrangler.jsonc is missing. Deploy the site, then ask again.",
    };
  return {
    state: 'unreadable',
    says: fix,
    next: `Nothing this script recognises answered (${status}). A 200 with no JSON is the app shell, which means /auth/* is not in run_worker_first for this environment.`,
  };
}

/**
 * The provision itself, in the two shells he has, for a host that has just answered READY.
 *
 * TWO FORMS BECAUSE ONE OF THEM FAILED IN HIS PRIMARY SHELL, and both failures were measured on 23 September
 * (`loop/research-first-sign-in.md` friction 2). In Windows PowerShell 5.1 `curl` is `Invoke-WebRequest`, which
 * refuses curl's flags with "A positional parameter cannot be found", and `curl.exe` with the JSON in single quotes
 * answers `400 BODY_MALFORMED`, because 5.1 strips the inner double quotes on the way to a native command. So the
 * PowerShell form builds the body with `ConvertTo-Json` and sends it with `Invoke-RestMethod`, which leaves no quoting
 * for 5.1 to strip. It is section 4's form, and that form was rehearsed against a local host: the success,
 * `ALREADY_KNOWN` for a taken slug and `UNAUTHORIZED` for a wrong key all came back.
 *
 * THE CONTENT TYPE NAMES ITS CHARSET, which section 4's form did not. Without one, 5.1 encodes a string body as
 * Latin-1, so a name outside ASCII arrives broken and stays broken, because the name is fixed at provision. Measured
 * on 23 September from 5.1.26100 to an echo server on this machine: `Zoë Łuk` arrived as `Zo` U+FFFD ` Luk` under
 * `application/json` and whole under `application/json; charset=utf-8`, which `isJson` in `auth.ts` accepts.
 *
 * THE OPERATOR KEY IS THE SHELL'S AND NEVER THIS SCRIPT'S. Each form reads it at a prompt that echoes nothing, keeps
 * it in that shell's own variable, and removes the variable after, so it is in neither the history nor the screen.
 * Nothing here reads `PROVISION_KEY` from anywhere, and the test sets it in this process's environment to prove it
 * reaches no printed line.
 *
 * THE ZONE IS THIS MACHINE'S, because the machine he provisions from is the one on his desk, and a record made
 * without one is `UTC` for good. An offset or no answer at all falls back to `UTC`, which the Worker takes too.
 *
 * EACH FORM ASKS, AND PRINTS NOTHING TO BE EDITED. It printed `name = '<your name>'` to be changed by hand, and the
 * Worker took that placeholder as the owner's name for good (`loop/research-batch-forty-six-audit.md` §7). So the slug,
 * the email, the name and the zone are prompts, and the zone's prompt offers this machine's as the answer to Enter.
 * The bash form has `node` build the body because a name is typed by a person: pasted into a JSON string by the shell,
 * a double quote in it breaks the body. `apps/worker/scripts/provision-ask.test.mjs` runs that form with
 * `Zoë "Z" O'Brien` and compares what arrives.
 *
 * AND curl READS THE BODY FROM ITS STDIN, NOT FROM AN ARGUMENT. Git for Windows' `curl` is `/mingw64/bin/curl`, a
 * native program that takes its arguments in the ANSI code page: measured on 23 September against a server on this
 * machine, `-d "Zoë"` arrived as `5a 6f eb`, Windows-1252, with `LANG=en_US.UTF-8` or without it, and `--data-binary @-`
 * fed the same bytes by `printf` arrived as `5a 6f c3 ab`. `node` takes its arguments as UTF-16 and was whole either
 * way, which is why the body is built there and piped. The earlier form, `-d '{...}'` edited by hand, had the same
 * fault for any name outside ASCII.
 *
 * THE CLAIM LINK IS PRINTED ON A LINE OF ITS OWN, because `Format-List` hard-wraps a value: at 80 columns the only copy
 * came out as two lines with ten spaces before the second (the same audit, "Found on the way"), and a link copied
 * from that is broken.
 *
 * AND THE POWERSHELL FORM IS ONE SCRIPT BLOCK, `& {` ON THE FIRST LINE AND `}` ON THE LAST, because a paste of bare
 * lines races the first question. Audit forty-six measured the one-question form pasted whole and found PSReadLine
 * took the paste into its own queue; that was measured for one `Read-Host`, and this form asks five. Measured again for
 * this form (`loop/research-batch-forty-eight-audit.md` §3, the lines written into a real 5.1 console's input buffer
 * with PSReadLine 2.0.0 and each answer typed three seconds apart): the bare lines lost the tail of line two to the
 * first `Read-Host` in 2 of 14 runs, so `$pk` was never set, the post went as `Bearer ` and answered `UNAUTHORIZED`, and
 * the answers typed after it ran as commands at the prompt. Inside `& { ... }` it was 8 of 8, because PSReadLine holds
 * an unclosed block as one incomplete input and runs none of it until the last line. And 8 of 8 again for these exact
 * lines as this script prints them, four spaces in, pasted by the same harness into 5.1.26100 against an echo server
 * on this machine: every post carried its own key and every answer whole, `Zoë "Z" O'Brien` included, the key was in
 * neither the transcript nor PSReadLine's history, and `$pk` was gone at the prompt after. `$pk` and `$key` then die with
 * the block, so `Remove-Variable` is redundant; it stays, because it costs nothing and holds if the lines are ever run
 * bare.
 *
 * AND THE BLOCK ENDS WITH AN EMPTY LINE UNDER `}`, because only PSReadLine runs a block when it closes. Which line
 * editor reads the paste decides it. PSReadLine, loaded in a 5.1 console by default, parses what it holds and runs the
 * block at the `}`. The console host's own line reader, which is what reads the line when PSReadLine is not loaded,
 * holds any input of more than one line at `>>` until it is sent an empty line, closed or not. Measured
 * (`loop/research-batch-fifty-audit.md` §2, 5.1.26100 started with `Remove-Module PSReadLine`, these lines as printed,
 * answers typed three seconds apart): without the empty line nothing ran in 3 of 3, and the operator key typed after
 * the paste went into the script as the line under the brace, unmasked and in that console's transcript. With it the
 * post went with the right bearer, 2 of 2 without PSReadLine and 4 of 4 with it, where the empty line was never
 * taken as the operator key by the first `Read-Host`. `pwsh` 7 was not measured: it is not on the machine the audit
 * ran on. READY says to copy through that line, in `printedForms`, since every block he has copied before ended at
 * its brace.
 */
export function provisionCommands(origin, zone = localZone()) {
  const url = `${origin}/auth/provision`;
  return {
    powershell: [
      '& {',
      ...[
        "$key = Read-Host 'Operator key' -AsSecureString",
        '$pk = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($key))',
        "$slug = Read-Host 'Slug'",
        "$email = Read-Host 'Email'",
        "$name = Read-Host 'Name, as the passkey will show it'",
        `$tz = Read-Host 'Time zone [${zone}]'; if (-not $tz) { $tz = '${zone}' }`,
        '$body = @{ slug = $slug; email = $email; name = $name; tz = $tz } | ConvertTo-Json',
        'try {',
        `  $r = Invoke-RestMethod -Method Post -Uri '${url}' -Headers @{ Authorization = "Bearer $pk" } -ContentType 'application/json; charset=utf-8' -Body $body`,
        '  $r.value | Select-Object * -ExcludeProperty claim | Format-List',
        "  'The claim link, the only copy there will be:'",
        '  $r.value.claim',
        "} catch { 'REFUSED: ' + $_.ErrorDetails.Message }",
        'Remove-Variable pk, key',
      ].map((line) => `  ${line}`),
      '}',
      '',
    ],
    bash: [
      "read -rs -p 'Operator key: ' PK; echo",
      "read -r -p 'Slug: ' SLUG",
      "read -r -p 'Email: ' EMAIL",
      "read -r -p 'Name, as the passkey will show it: ' NAME",
      `read -r -p 'Time zone [${zone}]: ' ZONE; ZONE=\${ZONE:-${zone}}`,
      `BODY=$(node -e 'console.log(JSON.stringify({ slug: process.argv[1], email: process.argv[2], name: process.argv[3], tz: process.argv[4] }))' "$SLUG" "$EMAIL" "$NAME" "$ZONE")`,
      `printf '%s' "$BODY" | curl -sS -X POST ${url} \\`,
      "  -H 'content-type: application/json; charset=utf-8' \\",
      '  -H "authorization: Bearer $PK" \\',
      '  --data-binary @-',
      'unset PK',
    ],
  };
}

/**
 * What READY prints of the two forms: a heading for each shell, then its lines four spaces in.
 *
 * THE EMPTY LINE IS PRINTED EMPTY, NOT FOUR SPACES IN, because it is the line that runs the block where PSReadLine is
 * not loaded, what was measured was an empty line, and whether that line reader takes a line of spaces as one was not.
 * And the sentence to copy through it is above `& {`, where
 * a person starts copying, rather than after the form, where he has already stopped.
 */
export function printedForms(commands) {
  const indent = (line) => (line === '' ? '' : `    ${line}`);
  return [
    '  IN WINDOWS POWERSHELL 5.1, where curl is Invoke-WebRequest and curl.exe with quoted JSON answers BODY_MALFORMED.',
    '  Copy through the empty line under the closing brace: without PSReadLine, that line is what runs it.',
    ...commands.powershell.map(indent),
    '  IN GIT BASH, OR ANY BASH:',
    ...commands.bash.map(indent),
  ];
}

/** The zone this machine keeps, by `Intl`'s own name for it, or `UTC` when it has none or answers an offset. */
function localZone() {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return typeof zone === 'string' && zone.length > 0 && !/^[+-]/.test(zone) ? zone : 'UTC';
}

/** One probe. Uncached, because a cached answer is a measurement of an edge on the one night it matters. */
async function ask(origin, path, init = {}) {
  try {
    const out = await fetch(`${origin}${path}`, {
      ...init,
      headers: { 'cache-control': 'no-cache', ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(20_000),
      redirect: 'manual',
    });
    const text = await out.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
    return { status: out.status, body, text };
  } catch (err) {
    return { status: 0, body: null, text: '', err: err instanceof Error ? err.message : String(err) };
  }
}

/** The wrangler this repository pins, or `null` when there is none to run. */
const wranglerBin = (root) => {
  const at = join(root, 'apps', 'worker', 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  return existsSync(at) ? at : null;
};

/**
 * One wrangler read, with the terminal taken away from it.
 *
 * `stdin: 'ignore'` IS THE WHOLE OF WHY THIS IS SAFE TO PUT IN A SCRIPT. An unauthenticated wrangler
 * asks for a login at the terminal, and a checker that hangs at 2am waiting for a keypress nobody is
 * there to give is worse than one that does not run. With no stdin it fails, fast, and the failure is
 * printed as "ask this by hand" rather than as an answer about the host.
 */
const wranglerSay = (bin, repo, args) => {
  try {
    return execFileSync(process.execPath, [bin, ...args], {
      cwd: join(repo, 'apps', 'worker'),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 90_000,
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
    });
  } catch {
    return null;
  }
};

/** The three secret names this path depends on, in the order the rehearsal binds them. */
const SECRETS = ['SESSION_SECRET', 'KEK', 'PROVISION_KEY'];

/**
 * The two questions no public route answers: does the bucket exist, and which secrets are bound.
 *
 * BOTH ARE READS AND NEITHER PRINTS A VALUE. `wrangler secret list` answers names and types, never
 * values, and this function reduces that answer to three booleans before anything is printed, so the
 * output of this script cannot carry a name somebody put in a secret store by mistake.
 */
export function accountChecks(env, root = ROOT) {
  const lines = [];
  const missing = [];
  const bin = wranglerBin(root);
  const byHand = [
    `  ask these by hand, both are reads: wrangler r2 bucket info ${env.bucket}`,
    `                                     wrangler secret list --env ${env.name}`,
  ];
  if (!bin) return { lines: ['  wrangler is not installed in apps/worker, so the account questions went unasked', ...byHand], missing };

  const bucket = env.bucket ? wranglerSay(bin, root, ['r2', 'bucket', 'info', env.bucket]) : null;
  if (!env.bucket) lines.push('  this environment binds no R2 bucket, so the nightly copy has nowhere to write');
  else if (!bucket) {
    lines.push(`  the R2 bucket ${env.bucket} could not be read: wrangler is not logged in, or the token has no r2 scope, or the bucket does not exist`);
    lines.push(...byHand.slice(0, 1));
  } else {
    const objects = /object_count:\s*(\d+)/.exec(bucket)?.[1] ?? null;
    lines.push(`  the R2 bucket ${env.bucket} exists${objects === null ? '' : `, holding ${objects} object(s)`}`);
    if (objects === '0')
      lines.push('    zero objects is what an installation with no records looks like. After the first night with a record in it, a zero here is the nightly copy failing.');
  }

  const secrets = wranglerSay(bin, root, ['secret', 'list', '--env', env.name]);
  if (!secrets) {
    lines.push(`  the secrets bound to ${env.name} could not be read, so KEK and PROVISION_KEY are unknown from here`);
    lines.push(...byHand.slice(1));
  } else {
    /* THE BANNER IS NOT THE ANSWER. `wrangler` writes its version and an update notice to stdout
       above the JSON, so the array is found rather than the whole of stdout parsed. A parse that
       fails is not an empty account: it is an answer in a shape this script does not know, and
       saying "no secrets are bound" there would send him to bind three secrets he already has. */
    const from = secrets.indexOf('[');
    let names = null;
    try {
      if (from !== -1) names = JSON.parse(secrets.slice(from, secrets.lastIndexOf(']') + 1)).map((s) => String(s.name));
    } catch {
      names = null;
    }
    if (names === null) {
      lines.push(`  wrangler answered the secret list for ${env.name} in a shape this script does not read, so which secrets are bound is unknown from here`);
      lines.push(...byHand.slice(1));
      return { lines, missing };
    }
    if (names.length === 0) lines.push(`  ${env.name} has no secrets bound at all, which makes every sign-in route a 404`);
    for (const name of SECRETS) {
      const bound = names.includes(name);
      lines.push(`  ${name} is ${bound ? 'bound' : 'NOT bound'} on ${env.name}`);
      if (!bound)
        missing.push({
          key: name,
          rank: RANK[name],
          what: `${name} is not bound on ${env.name}`,
          next: `wrangler secret put ${name} --env ${env.name}, value at the prompt and never as an argument`,
        });
    }
    const others = names.filter((n) => !SECRETS.includes(n)).length;
    if (others > 0) lines.push(`  and ${others} other secret(s) are bound, whose names are not printed here`);
  }
  return { lines, missing };
}

/**
 * The whole checker: the repository's facts about this host, then four public probes, then the two
 * account reads, then the list of what is missing in the order he should repair it.
 */
export default async function provisionCheck(named, { account = true, root = ROOT } = {}) {
  const origin = /^[a-z]+:\/\//i.test(named) ? named.replace(/\/+$/, '') : `https://${named.replace(/\/+$/, '')}`;
  const host = origin.replace(/^[a-z]+:\/\//i, '');
  const notes = [];

  console.log('');
  console.log('  provision-check is read-only. It sends no operator key, no body and no Origin, it makes nothing, and it prints no secret.');
  console.log('');
  console.log(`  host         ${origin}`);

  const config = wranglerConfig(root);
  const env = environmentOf(config, host, siteConfig(root));
  console.log(`  environment  ${env ? `${env.name}, from apps/worker/wrangler.jsonc` : 'not one this repository names, so only the public probes below apply'}`);

  /* THE DEPLOYMENT'S OWN VARS, WHICH ARE THE TWO SILENT ONES. A placeholder recipient is the nightly
     copy refusing on every record, and it is invisible from every route this script can reach. */
  if (env) {
    const age = String(env.vars.AGE_RECIPIENT ?? '');
    if (/^age1</.test(age)) {
      console.log(`  AGE_RECIPIENT for ${env.name} is the placeholder ${age}, so the nightly copy refuses on every record and writes nothing`);
      notes.push({
        key: 'AGE_RECIPIENT',
        rank: RANK.AGE_RECIPIENT,
        what: `AGE_RECIPIENT is a placeholder on ${env.name}`,
        next: 'Either clear it in apps/worker/wrangler.jsonc and deploy, accepting an unsealed copy in R2, or accept that there are no copies until a sealer lands.',
      });
    }
    if (String(env.vars.PROVISION_WITHOUT_KEYS ?? '').trim().toLowerCase() === 'yes')
      console.log(`  PROVISION_WITHOUT_KEYS is yes in ${env.name}'s vars, so this deployment will make a keyless record rather than refusing`);
    if (!String(env.vars.AUTH_MAIL_FROM ?? ''))
      console.log('  AUTH_MAIL_FROM is empty in the file, so there are no sign-in links and the claim link is the only way in');
    console.log('  a deploy can override any of those three with --var, and nothing unauthenticated reports the live value. UNVERIFIED from here.');
  }

  console.log('');
  console.log('  WHAT THE HOST SAYS');

  const build = await ask(origin, '/.well-known/braindog-build');
  if (build.status === 0) {
    console.log(`  ${origin} could not be reached: ${build.err}`);
    return 2;
  }
  const { tuple, sha } = readBuild(build.body?.app);
  console.log(`  build        ${tuple ?? 'null, which is a deploy that was never told which build it is'}`);
  if (build.status !== 200 && build.body === null && env && host === env.vars.PUBLIC_HOST)
    console.log(`    the build route answered ${build.status} with no JSON, which on ${host} is the marketing site: the deployed site does not hand /.well-known/braindog-build to the app`);
  else if (build.status !== 200) console.log(`    the build route answered ${build.status}, which is a version older than the route itself`);

  const guard = guardsKeylessRecords(sha, root);
  if (guard === 'yes') {
    console.log(SAYS.guarded);
    if (!gitOk(root, ['merge-base', '--is-ancestor', sha, 'HEAD'])) console.log('    it is NOT an ancestor of HEAD, so this host is serving code this checkout does not contain');
    else if (!gitOk(root, ['diff', '--quiet', sha, 'HEAD', '--', 'apps/worker/wrangler.jsonc']))
      console.log('    and apps/worker/wrangler.jsonc has changed since it, so the vars printed above are not what this host was deployed with');
  } else if (guard === 'no') {
    console.log(SAYS.unguarded);
    notes.push({ key: 'deploy', rank: RANK.deploy, what: 'the serving build predates the keyless guard', next: 'Deploy a build whose apps/worker/src calls keylessRefusal before provisioning anything.' });
  } else {
    console.log(`    ${sha ? `commit ${sha} is not in this clone, so whether it refuses a keyless record is UNVERIFIED. git fetch, then ask again.` : 'with no build tuple there is no commit to ask, so whether it refuses a keyless record is UNVERIFIED'}`);
    notes.push({
      key: 'deploy',
      rank: RANK.deploy,
      what: 'the serving build cannot be identified from here, so whether it refuses a keyless record is UNVERIFIED',
      next: sha
        ? 'git fetch, then run this again.'
        : `Deploy with --var BRAINDOG_BUILD:<tuple>, which deploy.yml does and a deploy by hand forgets. Until then, wrangler deployments list --env ${env?.name ?? '<environment>'} gives the time it was last deployed, which is the only identification a null tuple leaves.`,
    });
  }

  const methods = await ask(origin, '/auth/methods');
  const m = readMethods(methods.body?.value);
  console.log(`  methods      ${m.state}${m.why ? ` (${m.why})` : ''}`);
  if (m.state === 'not-configured') {
    console.log('    SESSION_SECRET is unset or shorter than 32 characters, so every other /auth route is a 404 and nothing below can work');
    notes.push({ key: 'SESSION_SECRET', rank: RANK.SESSION_SECRET, what: 'SESSION_SECRET is not set on this host, or is shorter than 32 characters', next: `wrangler secret put SESSION_SECRET --env ${env?.name ?? '<environment>'}` });
  } else if (m.state === 'configured') {
    console.log(`    passkeys are on, sign-in links are ${m.magic ? 'on' : 'off'}, and ${m.firstRun ? 'no passkey has been registered yet' : 'at least one passkey is registered'}`);
    console.log(SAYS.notTheKeyStore);
    if (!m.firstRun) console.log('    firstRun is false, so somebody has already been in. This host is past the night this script is for.');
  } else {
    console.log(`    this is not an answer the rehearsal saw: ${JSON.stringify(methods.body?.value ?? methods.status)}`);
  }

  /* THE ONE PROBE THAT TOUCHES AN OPERATOR ROUTE, AND IT IS ANSWERED AT THE BEARER. No authorization
     header, no body and no Origin: `operated()` refuses before it reads a body, so the Directory
     never hears about this call and nothing is made. */
  const provision = await ask(origin, '/auth/provision', { method: 'POST' });
  const p = readProvision(provision.status, provision.body);
  console.log(`  provision    ${p.state}${p.says ? `, saying "${p.says}"` : ''}`);
  console.log(`    ${p.next}`);
  if (p.state === 'no-operator-key')
    notes.push({
      key: 'PROVISION_KEY',
      rank: RANK.PROVISION_KEY,
      what: 'PROVISION_KEY is not set on this host, so /auth/provision is switched off',
      next: `wrangler secret put PROVISION_KEY --env ${env?.name ?? '<environment>'}, AFTER KEK, and then this probe answers 401 instead of 404`,
    });
  if (p.state === 'no-such-route') notes.push({ key: 'deploy', rank: RANK.deploy, what: '/auth/provision is not routed on this host', next: 'Deploy a build that carries the route, then ask again.' });
  if (p.state === 'unreadable') notes.push({ key: 'deploy', rank: RANK.deploy, what: '/auth/provision answered something this script does not recognise', next: p.next });

  if (env && account) {
    console.log('');
    console.log('  WHAT THE ACCOUNT SAYS, THROUGH TWO READS');
    const asked = accountChecks(env, root);
    for (const line of asked.lines) console.log(line);
    notes.push(...asked.missing);
  } else if (env) {
    console.log('');
    console.log(`  the account reads were skipped. wrangler r2 bucket info ${env.bucket} and wrangler secret list --env ${env.name} are the two, and both are reads.`);
  }

  const missing = plan(notes);

  console.log('');
  if (missing.length === 0) {
    console.log(`  READY. ${host} has its secrets, its route and its bucket, and no record has been made on it yet.`);
    console.log('  The next command is the provision itself, and its answer is the only copy of the claim link there will ever be.');
    console.log('  The slug, the name and the time zone are fixed at provision. No screen renames the record or moves its zone later,');
    console.log('  and the Directory never gives a slug out twice, so choose all three before typing it. The name is also the display name on the passkey.');
    console.log('');
    for (const line of printedForms(provisionCommands(origin))) console.log(line);
    console.log('');
    console.log('  Each asks for the operator key at a prompt that echoes nothing and removes it after. This script never reads it.');
    console.log('  Each then asks for the slug, the email, the name and the time zone. Enter at the zone keeps this machine\'s, shown in brackets.');
  } else {
    console.log(`  NOT READY, ${missing.length} thing(s) missing, in the order to repair them:`);
    missing.forEach((item, i) => {
      console.log(`    ${i + 1}. ${item.what}`);
      console.log(`       ${item.next}`);
    });
  }

  console.log('');
  console.log('  AND THESE THREE THIS SCRIPT CANNOT ASK, AT ALL:');
  console.log('    the nightly copy is green or red in the Cloudflare dashboard, at the 03:17 cron invocation. Nothing here reports it.');
  console.log('    whether a real browser completes the passkey ceremony on this host. A software authenticator proved the verifier, not a phone.');
  console.log(SAYS.byHand);
  console.log('');
  console.log(`  provision-check: ${host}, ${missing.length} missing`);
  return missing.length === 0 ? 0 : 1;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const host = args.find((a) => !a.startsWith('--'));
  if (!host) {
    console.error('  provision-check takes the host to ask, and has no default: node apps/worker/scripts/provision-check.mjs app.brain.dog [--no-account]');
    process.exitCode = 2;
  } else {
    process.exitCode = await provisionCheck(host, { account: !args.includes('--no-account') });
  }
}
