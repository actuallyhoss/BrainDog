/**
 * Every route declares its group, and the groups say what `30 §5` says. `52 §5.2`.
 *
 *   node tools/gates/router-groups.mjs
 *
 * `30 §5` splits the RPC surface by WHO MAY REACH IT rather than by convenience, and then states the
 * rule that keeps it honest: *if a screen needs something outside DATA and READ+, it is either a
 * browser-session group — VAULT, JOBS, ADMIN — or it is a design error. There is no third case, and
 * the router asserts it — every route declares its group, and a CI test walks the router and fails
 * on a route with no group.* This is that test.
 *
 * WHAT IT IS REALLY FOR IS THE SIXTEEN INTERNAL METHODS. `createRecord` writes the `record` row and
 * the owner's `member('*', 'owner')` — routing it is handing anybody the ability to make themselves
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
 * names the document's own list does not carry — `history`, `packs`, `decide`, `members` and the
 * rest. Every one is a real method with a real check, and the divergence is `30 §5`'s enumeration
 * being older than the code rather than a route sneaking in. They are listed below with the group
 * they claim, so adding an eleventh is a diff somebody has to justify, and the day `30 §5` is
 * amended the list shrinks.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.env.BRAINDOG_GATE_ROOT ?? join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const read = (...parts) => readFileSync(join(root, ...parts), 'utf8');

/**
 * The names `30 §5` does not enumerate, and the group each claims.
 *
 * A RECORDED DEVIATION AND NOT A MOVED GOALPOST, in the shape `bundle.mjs` uses for the same
 * problem: the number still prints, the cause is named, and the gate's job becomes catching GROWTH.
 * Each of these is a method the document describes in prose without listing in its table.
 */
const UNENUMERATED = {
  history: 'READ+', //   the writes that made one row — 45's `history`, in 30 §5's prose and not its table
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

const findings = [];

/* ── 30 §5's own table, as data ──────────────────────────────────────────── */
const blueprint = read('docs/30-BLUEPRINT.md');
const spec = {};
const counts = {};
for (const row of blueprint.matchAll(/^\|\s*\*\*([A-Z+]+)\*\*\s*\((\d+)\)\s*\|(.*?)\|\s*[^|]*\|$/gm)) {
  const group = row[1];
  counts[group] = Number(row[2]);
  spec[group] = [...row[3].matchAll(/`([a-zA-Z]+)`/g)].map((m) => m[1]);
}

const GROUPS = ['DATA', 'READ+', 'VAULT', 'JOBS', 'ADMIN', 'INTERNAL'];
for (const group of GROUPS) if (!spec[group]) findings.push(`30 §5 has no ${group} row where this gate looks for it`);

/* A COUNT IN PROSE IS A CLAIM. `30 §5` writes each group's size in its own heading and the six
   again in a sentence, and the list under each is what they are counting. */
for (const group of GROUPS) {
  const listed = new Set(spec[group] ?? []);
  if (spec[group] && listed.size !== counts[group])
    findings.push(`30 §5 says ${group} has ${counts[group]} methods and its own row lists ${listed.size}`);
}
const total = /\*\*Sixty-four methods: (\d+) · (\d+) · (\d+) · (\d+) · (\d+) · (\d+)\.\*\*/.exec(blueprint);
if (!total) findings.push("30 §5's counting sentence is not where this gate looks for it");
else
  GROUPS.forEach((group, i) => {
    if (counts[group] !== undefined && Number(total[i + 1]) !== counts[group])
      findings.push(`30 §5's sentence counts ${total[i + 1]} for ${group} and its table says ${counts[group]}`);
  });

/* ── the route table, as data. The handlers are never called. ─────────────── */
const host = read('packages/host/src/index.ts');
const routes = [...host.matchAll(/\{ name: '([a-zA-Z]+)', group: '([A-Z+]+)',/g)].map((m) => ({ name: m[1], group: m[2] }));
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
      findings.push(`${r.name} is routed and 30 §5's table does not enumerate it — add it there, or record it here`);
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
    findings.push(`UNROUTED names ${name}, which no group in 30 §5 has — a name that guards nothing`);
}

/* AND EVERY RECORDED DEVIATION IS STILL A ROUTE. One that was removed leaves a line here claiming a
   waiver for nothing, which is how a list like this rots into an allowlist nobody reads. */
for (const name of Object.keys(UNENUMERATED))
  if (!byName.has(name)) findings.push(`this gate records ${name} as an unenumerated route and nothing routes it`);

if (findings.length === 0) {
  const shape = GROUPS.map((g) => `${routes.filter((r) => r.group === g).length} ${g}`).join(' · ');
  console.log(`  router-groups: ${routes.length} routes, every one with a group — ${shape}`);
} else {
  console.error(`\n  router-groups: ${findings.length} finding(s) — 30 §5\n`);
  for (const f of [...new Set(findings)]) console.error(`    ${f}`);
  console.error(
    '\n  The surface is split by who may reach it. If a screen needs something outside DATA and\n' +
      '  READ+, it is a browser-session group — VAULT, JOBS, ADMIN — or it is a design error.\n',
  );
  process.exitCode = 1;
}
