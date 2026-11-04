/**
 * Every route declares its group, and the groups say what `30 §5` says. `52 §5.2`.
 *
 *   node tools/gates/router-groups.mjs
 *
 * `30 §5` splits the RPC surface by WHO MAY REACH IT rather than by convenience, and then states the
 * rule that keeps it honest: *if a screen needs something outside DATA and READ+, it is either a
 * browser-session group (KEYCHAIN, JOBS, ADMIN) or it is a design error. There is no third case, and
 * the router asserts it: every route declares its group, and a CI test walks the router and fails
 * on a route with no group.* This is that test.
 *
 * WHAT IT IS REALLY FOR IS THE SIXTEEN INTERNAL METHODS. `createRecord` writes the `record` row and
 * the owner's `member('*', 'owner')`, so routing it is handing anybody the ability to make themselves
 * the owner of a record. `sealedGrant` returns sealed material to the host. `arrive` is the ingest
 * pipeline with no authorisation of its own, because its callers do it. Each is one line away from
 * being routable, and `UNROUTED` guards exactly one of them.
 *
 * IT READS THE DOCUMENT RATHER THAN A COPY OF IT. The six group lists come out of `30 §5`'s table,
 * so a method moved between groups there and not here is a finding, and so is the reverse. That is
 * the whole value: a route table is code and a group is a decision, and the two are edited by
 * different people looking at different problems.
 *
 * AND THE ROUTES `30 §5` DOES NOT ENUMERATE ARE RECORDED, NOT WAIVED. Ten of the thirty-six are
 * names the document's own list does not carry: `history`, `packs`, `decide`, `members` and the
 * rest. Every one is a real method with a real check, and the divergence is `30 §5`'s enumeration
 * being older than the code rather than a route sneaking in. They are listed below with the group
 * they claim, so adding an eleventh is a diff somebody has to justify, and the day `30 §5` is
 * amended the list shrinks.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The names `30 §5` does not enumerate, and the group each claims.
 *
 * A RECORDED DEVIATION AND NOT A MOVED GOALPOST, in the shape `bundle.mjs` uses for the same
 * problem: the number still prints, the cause is named, and the gate's job becomes catching GROWTH.
 * Each of these is a method the document describes in prose without listing in its table.
 */
const UNENUMERATED = {
  history: 'READ+', //   the writes that made one row: 45's `history`, in 30 §5's prose and not its table
  version: 'READ+', //   `/api/version`, which 33 §4 routes and 30 §5 folds into `whatsNew`
  pages: 'READ+', //     every page, where 30 §5 lists only `page`
  packs: 'READ+', //     which packs are installed; the read half of ADMIN's pack methods
  governance: 'READ+', // 30 §5 calls these "DATA pseudo-registers"; the code has one read for them
  dryRun: 'READ+', //    the candidate-body half of READ+'s `ruleTest`, which takes an installed rule
  decide: 'DATA', //     the answer to a `propose`; no token reaches it (ADR-060)
  members: 'ADMIN', //   the read half of `invite`
  removeMember: 'ADMIN', // the other half of `invite`, which 30 §5 describes and does not name
  retireDeclaration: 'ADMIN', // the other half of `setDeclaration`
};

/**
 * THE CHECK IS A FUNCTION, imported by `run.mjs` rather than spawned: `52 §5.1` step 3, argued in
 * the runner's `IMPORTED OR SPAWNED` header. Nothing in this file happens on import, and everything
 * above this line is a declaration.
 *
 * THE ROOT IS AN ARGUMENT, defaulting to `BRAINDOG_GATE_ROOT`, which is the handle `self-test` aims
 * this gate at a seeded tree with, and then to the repository this file sits in. `run.mjs` passes
 * the root it derived from its own location, because an imported gate shares the runner's working
 * directory and that is wherever the operator was standing. `read` is declared in here for the same
 * reason: at module level it closed over a root fixed at import, whoever did the importing.
 *
 * IT RETURNS 1 AND FALLS OFF THE END FOR A PASS, which is what `self-test`'s `silent-pass` grep
 * rests on: a pass is the end of the function and never a statement inside it. A document this
 * cannot open still throws, as it did when this was a script, and the runner counts a throw as this
 * gate's failure.
 */
export default function routerGroups(
  root = process.env.BRAINDOG_GATE_ROOT ?? join(fileURLToPath(new URL('.', import.meta.url)), '..', '..'),
) {
  const read = (...parts) => readFileSync(join(root, ...parts), 'utf8');
  const findings = [];
  /* THE KEYCHAIN WAS THE VAULT: a document or a route table that still says VAULT, `setVaultPassphrase` or `unlockVault` is read as the same group and method, so the rename can land in either half first. */
  const modern = (name) => name.replace(/VAULT/g, 'KEYCHAIN').replace(/Vault/g, 'Keychain').replace(/^vault/, 'keychain');

  /* ── 30 §5's own table, as data ──────────────────────────────────────────── */
  const blueprint = read('docs/30-BLUEPRINT.md');
  const spec = {};
  const counts = {};
  for (const row of blueprint.matchAll(/^\|\s*\*\*([A-Z+]+)\*\*\s*\((\d+)\)\s*\|(.*?)\|\s*[^|]*\|$/gm)) {
    const group = modern(row[1]);
    counts[group] = Number(row[2]);
    spec[group] = [...row[3].matchAll(/`([a-zA-Z]+)`/g)].map((m) => modern(m[1]));
  }

  const GROUPS = ['DATA', 'READ+', 'KEYCHAIN', 'JOBS', 'ADMIN', 'INTERNAL'];
  for (const group of GROUPS) if (!spec[group]) findings.push(`30 §5 has no ${group} row where this gate looks for it`);

  /* A COUNT IN PROSE IS A CLAIM. `30 §5` writes each group's size in its own heading and the six
     again in a sentence, and the list under each is what they are counting. */
  for (const group of GROUPS) {
    const listed = new Set(spec[group] ?? []);
    if (spec[group] && listed.size !== counts[group])
      findings.push(`30 §5 says ${group} has ${counts[group]} methods and its own row lists ${listed.size}`);
  }
  /* The count word is prose, and it moves every time a method is added. The six numbers are what the gate checks. */
  const total = /\*\*(?:[A-Z][a-z]+(?:-[a-z]+)?) methods: (\d+) · (\d+) · (\d+) · (\d+) · (\d+) · (\d+)\.\*\*/.exec(blueprint);
  if (!total) findings.push("30 §5's counting sentence is not where this gate looks for it");
  else
    GROUPS.forEach((group, i) => {
      if (counts[group] !== undefined && Number(total[i + 1]) !== counts[group])
        findings.push(`30 §5's sentence counts ${total[i + 1]} for ${group} and its table says ${counts[group]}`);
    });

  /* ── the route table, as data. The handlers are never called. ─────────────── */

  /* TWO HALVES: `index.ts`'s own rows, and one file of rows per area under `routes/`, which `index.ts`
     concatenates after its own. A tree with no `routes/` folder has no rows
     there, and that is not a finding: `index.ts` is the file that must be there, and `read` still throws without it. */
  /* `table.ts` holds `index.ts`'s own rows since the client took them without the host's doors; a tree without it has them in `index.ts`. */
  const host = read('packages/host/src/index.ts') + (existsSync(join(root, 'packages', 'host', 'src', 'table.ts')) ? read('packages/host/src/table.ts') : '');
  const routesDir = join(root, 'packages', 'host', 'src', 'routes');
  const extra = existsSync(routesDir)
    ? readdirSync(routesDir)
        .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
        .sort()
        .map((name) => read('packages/host/src/routes', name))
    : [];
  const routes = [host, ...extra].flatMap((text) =>
    [...text.matchAll(/\{ name: '([a-zA-Z]+)', group: '([A-Z+]+)',/g)].map((m) => ({ name: modern(m[1]), group: modern(m[2]) })),
  );
  if (routes.length === 0) findings.push('packages/host/src/index.ts has no route table this gate can read');

  const unrouted = [...(/export const UNROUTED = \[([^\]]*)\]/.exec(host)?.[1] ?? '').matchAll(/'([a-zA-Z]+)'/g)].map((m) => m[1]);

  const byName = new Map(routes.map((r) => [r.name, r]));

  for (const r of routes) {
    if (!GROUPS.includes(r.group)) findings.push(`${r.name} claims the group ${r.group}, which is not one of 30 §5's six`);

    /* NO ROUTE CARRIES `INTERNAL`. It is the host's own surface: `createRecord` makes somebody the
       owner of a record, `sealedGrant` hands out sealed material, `arrive` writes with no authorisation
       of its own because its callers do it. */
    if (r.group === 'INTERNAL') findings.push(`${r.name} is routed as INTERNAL, and INTERNAL is the host's own surface`);

    const said = GROUPS.find((g) => spec[g]?.includes(r.name));
    if (said === undefined) {
      if (UNENUMERATED[r.name] === undefined)
        findings.push(`${r.name} is routed and 30 §5's table does not enumerate it. Add it there, or record it here`);
      else if (UNENUMERATED[r.name] !== r.group)
        findings.push(`${r.name} is routed as ${r.group} and this gate records it as ${UNENUMERATED[r.name]}`);
    } else if (said !== r.group) findings.push(`${r.name} is routed as ${r.group} and 30 §5 puts it in ${said}`);
  }

  /* AND NO METHOD `30 §5` CALLS INTERNAL IS ROUTED, whether or not it is in `UNROUTED`. That list
     guards four names; this guards the sixteen the document names, which is the set that matters. */
  for (const name of spec.INTERNAL ?? [])
    if (byName.has(name)) findings.push(`${name} is one of 30 §5's sixteen INTERNAL methods and it is routed`);

  /* AND `UNROUTED` IS STILL A PROMISE ABOUT NAMES THAT EXIST. A typo in it guards nothing, silently. */
  for (const name of unrouted) {
    const known = GROUPS.some((g) => spec[g]?.includes(name));
    if (!known && UNENUMERATED[name] === undefined)
      findings.push(`UNROUTED names ${name}, which no group in 30 §5 has, a name that guards nothing`);
  }

  /* AND EVERY RECORDED DEVIATION IS STILL A ROUTE. One that was removed leaves a line here claiming a
     waiver for nothing, which is how a list like this rots into an allowlist nobody reads. */
  for (const name of Object.keys(UNENUMERATED))
    if (!byName.has(name)) findings.push(`this gate records ${name} as an unenumerated route and nothing routes it`);

  /* ── the sign-in table, as data: `AUTH_ROUTES` in `packages/host/src/auth.ts` ─────────────────── */

  /**
   * THE SAME RULE, FOR THE OTHER TABLE. Sign-in is none of `30 §5`'s six groups, because nothing in it reaches
   * a record: it is the Directory, and who may call each route is the route's own `needs`. So what is checked
   * is that the table and the `AuthCall` union say the same thing: one route per flow, named by the rule the
   * web app is written against, the two operator routes on the Worker only, and a GET only where nothing
   * changes who is signed in, since a browser may prefetch a GET.
   *
   * A TREE WITH NO `auth.ts` IS A FINDING, AND IT USED TO BE NOTHING AT ALL.
   *
   * WHAT THIS DID. Both halves below were wrapped in `if (existsSync(authFile))` and nothing else, so a tree
   * without the file skipped the fifteen sign-in checks and the account table together, printed neither of the
   * two summary lines (each is guarded on a count that had stayed zero), and exited 0 on the one line about
   * route groups. The run reads exactly like a clean one. Moving `packages/host/src/auth.ts` aside and running
   * this gate on the real tree is the whole demonstration.
   *
   * THERE WAS A GUARD AND IT WAS DEFEATED BY AN ACCIDENT. It fired only when `packages/host/package.json` was
   * present AND exported `./auth`, which is true of the real tree and of no fixture, so the one place the
   * silence could be observed was the one place the guard could not reach. A rule that holds wherever it is
   * not needed is not a rule.
   *
   * WHY A FINDING RATHER THAN A SKIP OR A NOTE. `auth.ts` is checked-in source, not a build artefact: nothing
   * about an environment decides whether it is here, so exit 3 would be reporting an unmet prerequisite that
   * cannot be unmet for an honest reason. And it is not optional either, which is what a note in green would
   * claim: it is the file that says who may sign in and what an account route may read, so a tree that has
   * `packages/host/src/index.ts` and not its sibling has lost sign-in rather than not built it.
   * `no-declarations-in-kernel` makes the same call in the same words, on `inserts !== 1` rather than
   * `inserts > 1`: zero is a mistake and not a thing nobody has written yet.
   */
  const authFile = join(root, 'packages', 'host', 'src', 'auth.ts');
  if (!existsSync(authFile))
    findings.push('packages/host/src/auth.ts is not there, and it is where the sign-in table and the account table are declared');

  let authRoutes = [];
  if (existsSync(authFile)) {
    authRoutes = [...readFileSync(authFile, 'utf8').matchAll(/\{ path: '([^']+)', method: '([A-Z]+)', flow: '([a-z.]+)', on: '([a-z]+)', needs: '([a-z]+)'/g)].map(
      (m) => ({ path: m[1], method: m[2], flow: m[3], on: m[4], needs: m[5] }),
    );
    if (authRoutes.length === 0) findings.push('packages/host/src/auth.ts has no sign-in route table this gate can read');

    const ports = read('packages', 'ports', 'src', 'auth.ts');
    const union = ports.slice(ports.indexOf('export type AuthCall ='), ports.indexOf('export type AuthFlow'));
    const flows = [...new Set([...union.matchAll(/flow: '([a-z.]+)'/g)].map((m) => m[1]))];
    if (flows.length === 0) findings.push("the AuthCall union in packages/ports/src/auth.ts is not where this gate looks for it");

    /* THE TWO HALVES OF AN INVITATION'S PROOF ARE FLOWS WITH NO ROW, AND MUST HAVE NONE: routed on its own,
       `invite.prove` would mail a proof to any address anybody typed, so `/auth/invite` is the one door to both. The
       sign-up rows are declared before the union names their flows (`SignupFlow` in auth.ts). */
    const UNROUTED_FLOWS = ['invite.prove', 'invite.proved'];
    const SIGNUP_FLOWS = ['signup.start', 'signup.verify', 'signup.name'];
    /* SIGNING IN WITH GOOGLE IS TWO ROUTES AND NO FLOW (`GoogleFlow` in auth.ts): the Worker answers both and asks the
       Directory through the two `magic` flows. THEY ARE GETS THAT SIGN SOMEBODY IN, the only two, because a browser
       coming back from Google can arrive no other way; the state cookie the start wrote is what the callback is
       answered against (`apps/worker/src/google.ts`). */
    const GOOGLE_FLOWS = ['google.start', 'google.callback'];
    /* THE MAC APP'S THIRD ROUTE IS A POST, the one place a Google route changes who is signed in: it spends the one-time
       code and sets the cookie (`/auth/google/desktop`, docs/55). It is on the Worker only, like the other two. */
    const GOOGLE_POST = ['google.desktop'];
    /* THE MAC APP'S WAY BACK FROM A BROWSER (`DesktopFlow` in auth.ts): two POSTs on the Worker only, and no flow of the
       Directory's. `desktop.handoff` seals an emailed link to the app's challenge; `desktop` spends it in the app. */
    const DESKTOP_FLOWS = ['desktop', 'desktop.handoff', 'app', 'app.handoff'];

    const READS = ['methods', 'session', 'passkeys', 'sessions', 'signup.name'];
    const paths = new Set();
    for (const r of authRoutes) {
      if (paths.has(r.path)) findings.push(`${r.path} is in the sign-in table twice`);
      paths.add(r.path);
      if (!['GET', 'POST'].includes(r.method)) findings.push(`${r.path} is a ${r.method}, and a sign-in route is a GET or a POST`);
      if (!['both', 'selfhost', 'worker'].includes(r.on)) findings.push(`${r.path} is served on ${r.on}, which is not a host`);
      if (!['nothing', 'session', 'operator'].includes(r.needs)) findings.push(`${r.path} needs ${r.needs}, which no host can check`);
      if (r.flow !== 'provision' && !SIGNUP_FLOWS.includes(r.flow) && !GOOGLE_FLOWS.includes(r.flow) && !GOOGLE_POST.includes(r.flow) && !DESKTOP_FLOWS.includes(r.flow) && !flows.includes(r.flow))
        findings.push(`${r.path} names ${r.flow}, which is not in the AuthCall union`);
      if (UNROUTED_FLOWS.includes(r.flow)) findings.push(`${r.path} routes ${r.flow}, which only /auth/invite may reach`);
      const named = r.flow === 'key.exchange' ? '/auth/token' : `/auth/${r.flow.replaceAll('.', '/')}`;
      if (r.path !== named) findings.push(`${r.flow} is served at ${r.path}, and the rule names it ${named}`);
      if (r.needs === 'operator' && (r.on !== 'worker' || r.method !== 'POST')) findings.push(`${r.path} is an operator route, and those are POSTs on the Worker only`);
      if (GOOGLE_FLOWS.includes(r.flow) && (r.on !== 'worker' || r.method !== 'GET')) findings.push(`${r.path} is a Google route, and those are GETs on the Worker only`);
      if (GOOGLE_POST.includes(r.flow) && (r.on !== 'worker' || r.method !== 'POST')) findings.push(`${r.path} is the Google desktop route, and it is a POST on the Worker only`);
      if (DESKTOP_FLOWS.includes(r.flow) && (r.on !== 'worker' || r.method !== 'POST')) findings.push(`${r.path} is a Mac app route, and those are POSTs on the Worker only`);
      if (r.method === 'GET' && !READS.includes(r.flow) && !GOOGLE_FLOWS.includes(r.flow)) findings.push(`${r.path} changes who is signed in, and it is a GET`);
    }
    for (const flow of flows) {
      if (UNROUTED_FLOWS.includes(flow)) continue;
      const n = authRoutes.filter((r) => r.flow === flow).length;
      if (n !== 1) findings.push(`${flow} is in the AuthCall union and has ${n} sign-in routes`);
    }
  }

  /* ── the account table, as data: `ACCOUNT_ROUTES` in `packages/host/src/auth.ts` ─────────────── */

  /**
   * THE SAME RULE, FOR THE THIRD TABLE. An account route is the Directory's, like sign-in, and none of `30 §5`'s six
   * groups. Its group is its prefix and its door: every row lives under `/account/`, is a GET or a POST served by
   * both hosts or by the Worker alone, and needs the session cookie, except the payment provider's webhook, which is
   * checked by its signature. A row in another shape is a row this
   * gate cannot read, and that is a finding too.
   *
   * AND THE PREFIX HAS TO REACH THE WORKER, by name or under `/*`. Off `run_worker_first`, `/account/usage` is answered by the app shell with
   * a 200 and `index.html`, which looks like a route and is not one. `33 §4` names the prefix and every path.
   */
  let accountRoutes = [];
  if (existsSync(authFile)) {
    const auth = readFileSync(authFile, 'utf8');
    const start = auth.indexOf('export const ACCOUNT_ROUTES');
    if (start < 0 && /export async function serveAccount\b/.test(auth))
      findings.push('packages/host/src/auth.ts serves /account/* and has no ACCOUNT_ROUTES table this gate can read');
    if (start >= 0) {
      const table = auth.slice(start, auth.indexOf('];', start));
      accountRoutes = [...table.matchAll(/\{ path: '([^']+)', method: '([A-Z]+)', on: '([a-z]+)', needs: '([a-z]+)'/g)].map((m) => ({
        path: m[1],
        method: m[2],
        on: m[3],
        needs: m[4],
      }));
      const rows = (table.match(/\{ path:/g) ?? []).length;
      if (rows !== accountRoutes.length) findings.push(`ACCOUNT_ROUTES has ${rows} rows and this gate reads ${accountRoutes.length} of them`);

      const paths = new Set();
      for (const r of accountRoutes) {
        if (paths.has(r.path)) findings.push(`${r.path} is in the account table twice`);
        paths.add(r.path);
        if (!/^\/account\/[a-z][a-z0-9/-]*$/.test(r.path)) findings.push(`${r.path} is in the account table, and an account route lives under /account/`);
        if (!['GET', 'POST'].includes(r.method)) findings.push(`${r.path} is a ${r.method}, and an account route is a GET or a POST`);
        if (!['both', 'worker'].includes(r.on))
          findings.push(`${r.path} is served on ${r.on}, and an account route is served on both hosts or on the Worker`);
        if (!['session', 'stripe'].includes(r.needs))
          findings.push(
            `${r.path} needs ${r.needs}, and an account route reads the session cookie, or the payment provider's signature on its webhook alone`,
          );
        if (r.needs === 'stripe' && (r.path !== '/account/billing/webhook' || r.method !== 'POST' || r.on !== 'worker'))
          findings.push(`${r.path} needs stripe, and only POST /account/billing/webhook on the Worker does`);
      }

      const wrangler = join(root, 'apps', 'worker', 'wrangler.jsonc');
      if (accountRoutes.length > 0 && existsSync(wrangler) && !/"run_worker_first"\s*:\s*\[[^\]]*"\/(?:account\/)?\*"/.test(readFileSync(wrangler, 'utf8')))
        findings.push("apps/worker/wrangler.jsonc does not send /account/* to the Worker first, so the app shell answers every account route");

      const contracts = join(root, 'docs', '33-CONTRACTS.md');
      if (accountRoutes.length > 0 && existsSync(contracts)) {
        const doc = readFileSync(contracts, 'utf8');
        if (!doc.includes('`/account/*`')) findings.push('33 §4 does not list /account/*');
        for (const r of accountRoutes) if (!doc.includes(`\`${r.path}\``)) findings.push(`${r.path} is an account route and 33 §4 does not name it`);
      }
    }
  }

  if (findings.length === 0) {
    const shape = GROUPS.map((g) => `${routes.filter((r) => r.group === g).length} ${g}`).join(' · ');
    console.log(`  router-groups: ${routes.length} routes, every one with a group: ${shape}`);
    /* UNCONDITIONAL, BECAUSE A COUNT THAT HIDES AT ZERO IS A COUNT THAT CANNOT REPORT A DEGENERATE RUN.
       These two were each printed only when their own count was above zero, so the output of a run that
       read both tables and the output of a run that read neither differed by nothing at all. */
    console.log(`  router-groups: ${authRoutes.length} sign-in routes, one per flow, named by the rule`);
    console.log(`  router-groups: ${accountRoutes.length} account route(s), each under /account/ behind the session cookie, the payment webhook behind its signature`);
  } else {
    console.error(`\n  router-groups: ${findings.length} finding(s) (30 §5)\n`);
    for (const f of [...new Set(findings)]) console.error(`    ${f}`);
    console.error(
      '\n  The surface is split by who may reach it. If a screen needs something outside DATA and\n' +
        '  READ+, it is a browser-session group (KEYCHAIN, JOBS, ADMIN) or it is a design error.\n',
    );
    return 1;
  }
}

/* AND IT IS STILL A SCRIPT, because `self-test` spawns it at its seeded trees with
   `BRAINDOG_GATE_ROOT`, and the header documents the command line. `?? 0` because a pass returns
   nothing. */
if (import.meta.main) process.exitCode = routerGroups() ?? 0;
