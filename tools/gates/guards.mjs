/**
 * `guards`: the route table's group and the check the record actually applies, side by side.
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
 * *"ADMIN admits no token principal"*, which is what `admin()` does and what `guard(ctx, 'read')`
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
 *         KEYCHAIN → `keychain(ctx)`    the same ceiling, plus the keychain's own rule
 *         READ+  → `guard` or `scoped`      any token, subject to scope
 *         DATA   → `guard` or `scoped`      the same requirement, and `SCOPED` below says why
 *
 *   c · Every method has one at all, before anything else in its body reads an argument.
 *
 *   d · No method name is written in two of the record's files. The surface is `index.ts`'s methods and then every
 *       file under `methods/`, spread into one object, so the later of two same-named methods wins without a word and
 *       the guard this gate read may be on the one nobody calls.
 *
 * WHERE IT READS, SINCE THE TABLE AND THE SURFACE ARE IN MORE THAN ONE FILE. Routes are the rows of
 * `packages/host/src/index.ts` and of every file under `packages/host/src/routes/`; methods are those of
 * `packages/record/src/index.ts` and of every file under `packages/record/src/methods/`.
 * A folder that is not there holds nothing, which is a tree from before the
 * folders existed, and not a finding: the two index files are what must be there.
 *
 * WHAT IT DOES NOT CHECK, SAID OUT LOUD. It reads the FIRST guard call and not the whole body, so a
 * method that guards correctly and then does something wider is green here. It also cannot tell
 * `guard(ctx, 'read')` from `guard(ctx, 'write')`: which LEVEL a method needs is a decision per
 * method, and a table of them here would be a second copy of the code rather than a check on it.
 * The group is the coarse fact, and the coarse fact is the one that was wrong.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { budget } from './lib.mjs';

/**
 * A FILE THAT IS NOT THERE IS A FINDING, AND IT IS THE SAME FINDING AS AN EMPTY ROUTE TABLE.
 *
 * Both files this reads are committed source. Neither is produced by a command, so a skip could not
 * print the sentence a skip is for, and absence is not "you have not built yet" but "the route table
 * or the surface it is compared against has been moved, renamed or deleted". That is the loudest
 * thing this gate can find, not a reason to stop looking.
 *
 * IT WAS A STACK TRACE, WHICH IS THE WRONG SHAPE OF RED. `run.mjs` reads any non-zero, non-3 exit as
 * a failure, so an absent `packages/host` already went red, but it went red as ten lines of
 * `node:fs` frames that send a person hunting for a defect in the gate. Same exit, same colour, one
 * sentence naming the file.
 *
 * Only ENOENT. A file that is there and cannot be read is a different fact and stays a throw.
 */
const read = (root, ...parts) => {
  try {
    return readFileSync(join(root, ...parts), 'utf8');
  } catch (err) {
    if (err?.code !== 'ENOENT') throw err;
    return null;
  }
};

/**
 * Every `.ts` file of one folder but its tests, sorted, as `{ file, text }` with `file` repository-relative, or none
 * when the folder is not there.
 *
 * AN ABSENT FOLDER IS NOT A FINDING, and that is the difference from `read` above. The index files are the table and the
 * surface, and losing one is losing the gate's subject; `routes/` and `methods/` are where rows and methods written
 * in their own files live, and a tree that has none (every seeded tree under `negative/` written before them) has nothing
 * there to check.
 */
const folder = (root, ...parts) => {
  let names;
  try {
    names = readdirSync(join(root, ...parts));
  } catch (err) {
    if (err?.code !== 'ENOENT') throw err;
    return [];
  }
  return names
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
    .sort()
    .map((name) => ({ file: [...parts, name].join('/'), text: read(root, ...parts, name) ?? '' }));
};

/** A route row, in the one-line shape both halves of the table are written in. */
const ROW = /\{ name: '([a-zA-Z]+)', group: '([A-Z+]+)',/g;

/**
 * ONE LIST, SHARED BY DATA AND `READ+`, BECAUSE THEY SHARE ONE REQUIREMENT.
 *
 * IT USED TO BE TWO LISTS SPELT IDENTICALLY, under a header claiming DATA meant
 * `guard(ctx, …, register)`. The code never asked for the register and the two groups were therefore
 * indistinguishable to this gate, which is the worse half of the defect: a gate whose comment
 * promises a distinction its code does not draw reads to the next person as a check that already
 * exists, so the check nobody wrote looks written. Two bindings holding the same value is also two
 * lines a reader has to compare before learning they are the same. One name, and the reason beside
 * it.
 *
 * `30 §5` GIVES BOTH GROUPS THE SAME REACHABILITY: *"any token, subject to scope"*. What separates
 * them there is how MCP exposes them, the eight tools against the resources, which is a fact about
 * the transport and is `router-groups`'s question rather than this one.
 *
 * AND HOLDING DATA TO A NAMED REGISTER WOULD BE RED ON THREE HONEST METHODS TODAY. `search` is
 * register-blind by design and calls `scoped(ctx, 'read')`, because it searches every register the
 * caller can see; `decide` and `markRead` are about the caller rather than about a register and
 * take none. Which LEVEL and which REGISTER a method needs stays a decision per method, for the
 * reason this file's header already gives: a table of them here would be a second copy of the code
 * rather than a check on it.
 */
const SCOPED = ['guard', 'scoped'];

/**
 * Which guard each group implies. `JOBS` takes `runner` beside the owner's two, because the methods a runner calls
 * (`claimJob`, `postJobEvent`, `readCancel` in `packages/record/src/jobs.ts`) open with `runner(ctx)`, the one guard that
 * admits the runner principal every other guard refuses.
 */
const IMPLIES = {
  /* `approvesDevice` is `admin` with the credential and the fresh proof a device needs on top of it. */
  ADMIN: ['admin', 'team', 'approvesDevice'],
  KEYCHAIN: ['keychain'],
  JOBS: ['keychain', 'admin', 'runner'],
  'READ+': SCOPED,
  DATA: SCOPED,
};

/**
 * `ELSEWHERE` IS GONE, AND WHAT IT COST WAS TWO CHECKS THAT COULD NOT FIRE.
 *
 * It recorded routes served from somewhere other than `packages/record`'s own surface, in the shape
 * `router-groups` uses for the same problem, and it was an empty object: every routed name is a
 * method in that file. So both halves of it were unreachable. The `continue` at the top of the loop
 * below was never taken, and the loop that checked each recorded name is still routed never ran
 * once. Nothing under `negative/` could have seeded either, because the list lives in this file
 * rather than in a fixture tree, so an entry that proved them would also be an entry the real tree
 * has no reason to carry.
 *
 * A ROUTE SERVED ELSEWHERE IS LOUD NOW RATHER THAN WAIVED. It lands on "packages/record's surface
 * has no method by that name", which is the honest report until somebody decides otherwise, and the
 * day one exists `router-groups`'s `UNENUMERATED` is the shape to copy: the entry it gains is then
 * a diff a reviewer sees, rather than a mechanism that was already there asserting nothing.
 */

/**
 * THE CHECK IS A FUNCTION, imported by `run.mjs` rather than spawned: `52 §5.1` step 3, argued in
 * the runner's `IMPORTED OR SPAWNED` header. Nothing in this file happens on import, and everything
 * above this line is a declaration.
 *
 * THE ROOT IS AN ARGUMENT, defaulting to `BRAINDOG_GATE_ROOT`, which is the handle `self-test` aims
 * this gate at a seeded tree with, and then to the repository this file sits in. `run.mjs` passes
 * the root it derived from its own location, because an imported gate shares the runner's working
 * directory and that is wherever the operator was standing. `read` takes it rather than closing
 * over a module constant, because a module constant is the root of whoever imported this first.
 *
 * IT RETURNS 1 AND FALLS OFF THE END FOR A PASS, which is what `self-test`'s `silent-pass` grep
 * rests on: a pass is the end of the function and never a statement inside it.
 */
export default function guards(
  root = process.env.BRAINDOG_GATE_ROOT ?? join(fileURLToPath(new URL('.', import.meta.url)), '..', '..'),
) {
  const findings = [];

  /* ── the route table, as data: `table.ts`'s rows (they were `index.ts`'s until the client needed them without the host's
     doors), then each file under `routes/` ── */
  const index = read(root, 'packages', 'host', 'src', 'index.ts');
  const host = index === null ? null : index + (read(root, 'packages', 'host', 'src', 'table.ts') ?? '');
  const routes =
    host === null
      ? []
      : [host, ...folder(root, 'packages', 'host', 'src', 'routes').map((f) => f.text)].flatMap((text) =>
          [...text.matchAll(ROW)].map((m) => ({
            name: m[1],
            group: m[2],
          })),
        );

  /**
   * NO ROUTE TABLE IS A FINDING ON PURPOSE, AND THIS IS THE PLACE TO SAY WHY, because the line reads
   * like an unhandled absence and it is a decision.
   *
   * The two ways to get here are both defects and neither is a missing prerequisite. Either the table
   * really is empty, which means nothing is routed and the product has no surface; or the table is
   * there and the regex above no longer matches its shape, which means THIS GATE HAS GONE BLIND while
   * still printing a line. The second is the one that happens, it is the failure `self-test.mjs`
   * exists for, and a skip would make a gate that can no longer see look exactly like a tree that has
   * nothing to look at. `bundle` answers the identical question the identical way about a workspace
   * with no `app.html`: a gate that found nothing to read must not report that it read everything.
   */
  if (host === null) findings.push('packages/host/src/index.ts is not there, so this gate read no route table at all');
  else if (routes.length === 0) findings.push('packages/host/src/index.ts has no route table this gate can read');

  /* ── the record's surface, as data ───────────────────────────────────────── */
  const surface = read(root, 'packages', 'record', 'src', 'index.ts');
  if (surface === null) findings.push('packages/record/src/index.ts is not there, so this gate read no authorisation check for any route');

  /* FOUR SPACES AND THEN A NAME, which is the indentation of the returned object's own methods and of
     nothing else in the file: the guard helpers sit at two, and everything inside a body at six or
     more. Anchoring on the shape rather than on a list is what makes a method added tomorrow visible
     to this gate without anybody remembering to add it. A file under `methods/` is written in the same
     shape, a function returning an object of methods at four spaces, and is read the same way, each
     file on its own so that no body runs on into the next file's. */
  /* AND `jobs.ts`, WHERE THE JOBS METHODS LIVE, read in the same shape as a file under
     `methods/` when it is there. */
  const jobs = read(root, 'packages', 'record', 'src', 'jobs.ts');
  const surfaces =
    surface === null
      ? []
      : [
          { file: 'packages/record/src/index.ts', text: surface },
          ...(jobs === null ? [] : [{ file: 'packages/record/src/jobs.ts', text: jobs }]),
          ...folder(root, 'packages', 'record', 'src', 'methods'),
        ];

  const bodies = new Map();
  const homes = new Map();
  for (const { file, text } of surfaces) {
    /* A METHOD MAY TAKE TYPE PARAMETERS, `inbox<const A extends InboxArgs | undefined>(`, and it is still that
       method: the list between the name and its `(` is read past, so its body is its own and not the tail of the
       method above it. */
    const starts = [...text.matchAll(/^ {4}(?:async )?([a-zA-Z]+)(?:<[^()\n]*>)?\((.*)$/gm)].map((m) => ({
      name: m[1],
      at: m.index,
      /* A LINE ENDING IN `;` IS A CALL AT FOUR SPACES (a helper's body can hold one), NOT A METHOD, so it
         is never a name `d` compares. It is still a start, as every match always was. */
      defines: !m[2].trimEnd().endsWith(';'),
    }));
    starts.forEach((m, i) => {
      const end = i + 1 < starts.length ? starts[i + 1].at : text.length;
      bodies.set(m.name, text.slice(m.at, end));
      if (!m.defines) return;
      /* d · THE SAME NAME DEFINED IN TWO FILES. Within one file a second match is a helper's own shape and
         the last one read is kept, as it always was; across two it is two methods, and the spread keeps one. */
      const home = homes.get(m.name);
      if (home !== undefined && home !== file)
        findings.push(`${m.name} is a method in ${home} and in ${file}, and the record's surface keeps only one of them`);
      homes.set(m.name, file);
    });
  }

  /** The first authorisation call in a body, ignoring the comments that explain why it is that one. */
  const guardOf = (body) => {
    const stripped = body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    return /\b(admin|team|keychain|guard|scoped|runner|approvesDevice)\(\s*ctx\b/.exec(stripped)?.[1] ?? null;
  };

  /* ONE SENTENCE FOR AN ABSENT SURFACE, NOT EIGHTY-TWO. Without the file every route would land on
     "the surface has no method by that name", which is true of each and useless as a report: the one
     fact a person can act on would be spread across eighty-two lines that all say it. */
  for (const route of surface === null ? [] : routes) {
    const body = bodies.get(route.name);
    if (body === undefined) {
      findings.push(
        `${route.name} is routed and packages/record's surface has no method by that name, so this gate read no check for it`,
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

  /**
   * AND THE ONE ROUTE A KEY KEPT OUTSIDE ANY BROWSER CALLS AS OFTEN AS IT LIKES IS BUDGETED, as `budgets.json` says.
   *
   * A report key lives in a project's environment, where a credential is most likely to leak, and `report` wrote a hundred
   * rows a call with no limit on the calls. `REPORT_ROWS_PER_MINUTE` in `packages/record/src/report.ts` is what the record
   * enforces, the Worker cannot read a file under `tools`, so the number lives in both places and this holds them equal,
   * and holds `report`'s body to spending it. Read only when `report` is routed, so a tree without one has nothing to hold.
   */
  if (routes.some((r) => r.name === 'report')) {
    const R = budget('report');
    /* `report` IS ROUTED AND ITS LIMIT IS NOT THERE, which is the worst of the three states this
       block can be in: the route exists, the key that reaches it exists, and the number that stops it
       writing without end does not. Named as the file rather than left to fall through as
       "REPORT_ROWS_PER_MINUTE at nothing", which reads as a typo in a file somebody could open. */
    const code = read(root, 'packages', 'record', 'src', 'report.ts');
    if (code === null) findings.push('report is routed and packages/record/src/report.ts is not there, so nothing holds its rows-per-minute limit');
    const said = code === null ? undefined : /export const REPORT_ROWS_PER_MINUTE = ([\d_]+);/.exec(code)?.[1];
    const enforced = said === undefined ? null : Number(said.split('_').join(''));
    if (code !== null && enforced !== R.rowsPerMinute)
      findings.push(`packages/record/src/report.ts holds REPORT_ROWS_PER_MINUTE at ${enforced ?? 'nothing'}, and budgets.json's report.rowsPerMinute is ${R.rowsPerMinute}`);
    const body = (bodies.get('report') ?? '').replace(/\/\*[\s\S]*?\*\//g, '');
    if (!/\breportBudget\(/.test(body)) findings.push('report is routed and its body spends no reportBudget(), so a report key has no limit');
  }

  /**
   * A READER THAT NARROWS BY THE GRANT ALONE CANNOT SEE A ROW ITS MAKER KEPT PRIVATE. `kernel.scope(ctx, list)` is the
   * one read-scope helper (the grant and the private rows together), so a record reader that asks `whereFor(ctx.wheres, ...)`
   * itself has forgotten the second half; a new reader cannot, because this finds it.
   */
  for (const file of [{ file: 'packages/record/src/index.ts', text: surface ?? '' }, ...folder(root, 'packages', 'record', 'src', 'methods'), ...folder(root, 'packages', 'record', 'src', 'sources')]) {
    const code = file.text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    if (/\bwhereFor\(\s*ctx\.wheres\b/.test(code)) findings.push(`${file.file} reads a list through whereFor(ctx.wheres, ...), which leaves out no private row: ask kernel.scope(ctx, list)`);
  }

  if (findings.length === 0) {
    const shape = Object.keys(IMPLIES)
      .map((g) => [g, routes.filter((r) => r.group === g).length])
      .filter(([, n]) => n > 0)
      .map(([g, n]) => `${n} ${g}`)
      .join(' · ');
    console.log(`  guards: ${routes.length} routes, every one guarded as its group says: ${shape}`);
  } else {
    console.error(`\n  guards: ${findings.length} finding(s) (30 §10)\n`);
    for (const f of [...new Set(findings)]) console.error(`    ${f}`);
    console.error(
      '\n  The group in ROUTES gates nothing at runtime: authorisation is in the record, in one\n' +
        '  place, so the CLI answers the same ladder as the browser. A group the record does not\n' +
        '  apply is a ceiling published to everybody and enforced on nobody.\n',
    );
    return 1;
  }
}

/* AND IT IS STILL A SCRIPT, because `self-test` spawns it at its seeded trees with
   `BRAINDOG_GATE_ROOT`, and the header documents the command line. `?? 0` because a pass returns
   nothing. */
if (import.meta.main) process.exitCode = guards() ?? 0;
