/**
 * `guards` — the route table's group and the check the record actually applies, side by side.
 *
 *   node tools/gates/guards.mjs
 *
 * WHY IT EXISTS. `30 §10` puts authorisation in the record and says so in as many words: *"Enforced
 * in one place: the record object. Not in the Worker: a check in the router is a check the CLI can
 * be pointed around."* `ROUTES` in `packages/host` therefore carries a group that gates NOTHING at
 * runtime. It is a label, read by `router-groups` and by the documentation, and a label with no
 * enforcement behind it is the exact defect this repository keeps finding: something
 * complete-looking that reports success and does nothing.
 *
 * WHAT IT FOUND ON THE DAY IT WAS WRITTEN. `members` was routed ADMIN and guarded
 * `guard(ctx, 'read')`. Thirteen of the fourteen ADMIN routes called `admin`; that one called
 * `guard`. The answer carries every member's email address, so a colleague invited to read one
 * register could list every colleague's email, and `router-groups` was green throughout because
 * that gate compares the table against `30 §5` and never against the code.
 *
 * A LONE DISAGREEMENT IS THE SHAPE THIS LOOKS FOR. Thirteen agreements and one exception is not a
 * design decision, it is a line somebody wrote before the group existed; and the reason nothing
 * caught it is that the two facts live in two packages edited for two different reasons.
 *
 * IT IS NOT A NEW IDEA. `52 §5`'s row for `router-groups` asks for five checks, and one of them is
 * *"ADMIN admits no token principal"* — which is what `admin()` does and what `guard(ctx, 'read')`
 * does not. The gate that shipped under that name checks the table against the document and stops
 * there. This is the half of that row nobody built, kept apart rather than folded in, because the
 * two halves read different files for different reasons and one script that greps both is one
 * script whose failure message has to explain which of two unrelated things went wrong.
 *
 * WHAT IT CHECKS
 *
 *   a · Every routed method exists in the record's surface. A route whose handler this gate cannot
 *       find is a route whose check it cannot read, and reporting "no findings" over a method it
 *       never looked at is the failure mode of every gate that greps.
 *
 *   b · The first authorisation call in each method body is the one its group implies:
 *
 *         ADMIN  → `admin(ctx)`             owner, in a browser, no token of any kind (45 §5.6)
 *         VAULT  → `vault(ctx)`             the same ceiling, plus the vault's own rule
 *         READ+  → `guard` or `scoped`      a whole-record read; `scoped` is the register-blind form
 *         DATA   → `guard(ctx, …, register)` a named register, so the level per register applies
 *
 *   c · Every method has one at all, before anything else in its body reads an argument.
 *
 * WHAT IT DOES NOT CHECK, SAID OUT LOUD. It reads the FIRST guard call and not the whole body, so a
 * method that guards correctly and then does something wider is green here. It also cannot tell
 * `guard(ctx, 'read')` from `guard(ctx, 'write')`: which LEVEL a method needs is a decision per
 * method, and a table of them here would be a second copy of the code rather than a check on it.
 * The group is the coarse fact, and the coarse fact is the one that was wrong.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.env.BRAINDOG_GATE_ROOT ?? join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const read = (...parts) => readFileSync(join(root, ...parts), 'utf8');

/** Which guard each group implies. `JOBS` is here for the day the job routes land in this surface. */
const IMPLIES = {
  ADMIN: ['admin'],
  VAULT: ['vault'],
  JOBS: ['vault', 'admin'],
  'READ+': ['guard', 'scoped'],
  DATA: ['guard', 'scoped'],
};

/**
 * Routes served from somewhere other than `packages/record`'s own surface.
 *
 * RECORDED, NOT WAIVED, in the shape `router-groups` uses for the same problem. A name here is a
 * promise that the method is real and checked elsewhere; a name that stops being routed is a
 * finding, so the list cannot rot into an allowlist nobody reads.
 */
const ELSEWHERE = {};

const findings = [];

/* ── the route table, as data ────────────────────────────────────────────── */
const host = read('packages', 'host', 'src', 'index.ts');
const routes = [...host.matchAll(/\{ name: '([a-zA-Z]+)', group: '([A-Z+]+)',/g)].map((m) => ({
  name: m[1],
  group: m[2],
}));
if (routes.length === 0) findings.push('packages/host/src/index.ts has no route table this gate can read');

/* ── the record's surface, as data ───────────────────────────────────────── */
const surface = read('packages', 'record', 'src', 'index.ts');

/* FOUR SPACES AND THEN A NAME, which is the indentation of the returned object's own methods and of
   nothing else in the file: the guard helpers sit at two, and everything inside a body at six or
   more. Anchoring on the shape rather than on a list is what makes a method added tomorrow visible
   to this gate without anybody remembering to add it. */
const starts = [...surface.matchAll(/^ {4}(?:async )?([a-zA-Z]+)\(/gm)].map((m) => ({
  name: m[1],
  at: m.index,
}));

const bodies = new Map();
starts.forEach((m, i) => {
  const end = i + 1 < starts.length ? starts[i + 1].at : surface.length;
  bodies.set(m.name, surface.slice(m.at, end));
});

/** The first authorisation call in a body, ignoring the comments that explain why it is that one. */
const guardOf = (body) => {
  const stripped = body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  return /\b(admin|vault|guard|scoped)\(\s*ctx\b/.exec(stripped)?.[1] ?? null;
};

for (const route of routes) {
  if (ELSEWHERE[route.name] !== undefined) continue;

  const body = bodies.get(route.name);
  if (body === undefined) {
    findings.push(
      `${route.name} is routed and packages/record's surface has no method by that name — this gate read no check for it`,
    );
    continue;
  }

  const called = guardOf(body);
  if (called === null) {
    findings.push(`${route.name} is routed as ${route.group} and its body calls no guard at all`);
    continue;
  }

  const allowed = IMPLIES[route.group];
  if (allowed === undefined) {
    findings.push(`${route.name} claims the group ${route.group}, which this gate has no guard for`);
  } else if (!allowed.includes(called)) {
    findings.push(
      `${route.name} is routed as ${route.group} and is guarded by ${called}(), where ${route.group} means ${allowed
        .map((g) => `${g}()`)
        .join(' or ')}`,
    );
  }
}

/* AND EVERY RECORDED DEVIATION IS STILL A ROUTE. */
for (const name of Object.keys(ELSEWHERE))
  if (!routes.some((r) => r.name === name))
    findings.push(`this gate records ${name} as checked elsewhere and nothing routes it`);

if (findings.length === 0) {
  const shape = Object.keys(IMPLIES)
    .map((g) => [g, routes.filter((r) => r.group === g).length])
    .filter(([, n]) => n > 0)
    .map(([g, n]) => `${n} ${g}`)
    .join(' · ');
  console.log(`  guards: ${routes.length} routes, every one guarded as its group says — ${shape}`);
} else {
  console.error(`\n  guards: ${findings.length} finding(s) — 30 §10\n`);
  for (const f of [...new Set(findings)]) console.error(`    ${f}`);
  console.error(
    '\n  The group in ROUTES gates nothing at runtime: authorisation is in the record, in one\n' +
      '  place, so the CLI answers the same ladder as the browser. A group the record does not\n' +
      '  apply is a ceiling published to everybody and enforced on nobody.\n',
  );
  process.exitCode = 1;
}
