/**
 * The the old tool import, offered to a real record: a self-host, onboarded, with the packs in, and
 * the planner's own rows written through the API it writes through in the field.
 *
 *   node tools/gates/import.mjs
 *
 * WHY THIS EXISTS. `apps/cli/src/import.ts` is the one command that moves somebody's whole working
 * life out of the old tool and into this product, and until this gate there was nothing repeatable
 * behind it. Its 499 lines of test drive an IN-MEMORY FAKE door (`apps/cli/test/import.test.ts`
 * `memoryRecord`) and one stub HTTP server that answers `{ok:true}` to every method. Neither
 * validates anything, so every one of those tests passes against a planner emitting nonsense: a
 * field the founder pack never declared, an amount in the wrong shape, a lesson under the length
 * the agents pack requires. The rehearsals that would have caught it were done by hand on the 17th
 * of September and are gone.
 *
 * WHAT IT MEASURES, AND IT IS ONE QUESTION. Do the real declarations accept the fields the real
 * planner emits. A REFUSAL FROM THE RECORD IS THE FINDING THIS GATE EXISTS TO CATCH, and it is
 * reported with the record's own sentence, because that sentence is what the owner would read at
 * the moment the switch failed.
 *
 * HOW, END TO END, WITH NOTHING FAKED IN THE MIDDLE:
 *
 *   1. `apps/selfhost/src/server.ts`'s `start`, in memory, on an ephemeral port, behind a bearer.
 *      The same `start` `record.mjs` gives the browser gates and the same one `braindog serve`
 *      runs, so what answers is the record's own route table over the record's own kernel.
 *   2. Onboarding, in the order `apps/selfhost/src/main.ts` `init` does it: a person in the
 *      Directory, then `createRecord`, then `provision`. A record with no owner has nobody for a
 *      write to be attributed to, and the import writes as that owner.
 *   3. The packs, through the door the owner uses: a `pack` proposal on Decide and the owner
 *      accepting it, which is `packages/record/src/usecase.ts`'s path and not a private one. Three
 *      of them, because between them they declare every list `legacy.ts` `PROVIDED_BY` names:
 *      Solo founder carries Projects, People, Money and Work under it and adds organisations and
 *      datapoints, Estate adds services, and the agents pack adds learnings, skills, tools and the
 *      key index. `session` is the kernel's own.
 *   4. The plan, built here from the same export through the same two readers the command uses,
 *      BEFORE the command runs, so that a list the packs above did not put in is a finding of its
 *      own rather than forty-two rows apparently refused by a record that was never asked.
 *   5. `importCommand` itself, with the synthetic export on disk and `BRAINDOG_HOST` pointed at the
 *      port. Not `applyPlan` with a door this file built: the client, the HTTP hop, the bearer, the
 *      route table's verbs and the JSON both ways are all part of what has never been exercised
 *      against a record that can say no.
 *   6. The record, read back through the kernel. Every planned row is looked for by the key the
 *      import files it under, which is the same key a second run finds it by, and every question
 *      and every poll is looked for on Decide.
 *   7. And the import again, because "re-running updates, it never adds a second row" is a claim
 *      this command's header makes and only the fake had ever been asked to keep.
 *
 * THE EXPORT IS `apps/cli/test/legacy-export.ts`'s, deliberately. `52 §1` lets a gate import a
 * package's source directly and `spark-actor` already imports `packages/kernel/test/sqlite.ts` for
 * the same kind of reason: the synthetic export is the fixture those 499 lines of test drive, so
 * running THAT one through a real record is what turns them from assertions about a fake into
 * assertions about this product. A second export written here would make this gate assert its own
 * fixture, and the day the planner changed, the two would drift apart quietly.
 *
 * IT IS RED WHEN THE PLAN IS EMPTY, which is the same vacuity `spark-actor` guards against by
 * writing a `spark` event before running the query. "Every planned row was accepted" is true of a
 * plan with no rows in it, and a planner that stopped emitting anything would read here as a clean
 * bill of health.
 *
 * IT ASSERTS NO NUMBER, so `budgets.json` gains no key. `52 §4` puts every number a gate asserts in
 * that file and `self-test` holds every key there to being read; the counts this prints are read
 * from the plan and from the record, which is `34 §6`'s rule that a count is never a budget. The
 * port is 0, so nothing here queues for a socket with the browser gates.
 *
 * WHAT IT DELIBERATELY DOES NOT COVER: `--dry-run`, `--draft-setup`, the hosts file, and every
 * refusal path that is about the file rather than the record. Those are the unit tests' and they
 * do not need a record to be true.
 */

import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const started = performance.now();

/**
 * Node's opinion of `node:sqlite` is not this gate's output.
 *
 * `52 §4`: "nothing else is printed by a gate". Opening the record emits an `ExperimentalWarning` on
 * stderr, and a gate whose output carries two lines of somebody else's warning is a gate people
 * learn to read past. Only that class is dropped; anything else Node has to say still prints.
 */
process.removeAllListeners('warning');
process.on('warning', (w) => {
  if (w.name !== 'ExperimentalWarning') console.warn(w);
});

const root = process.env.BRAINDOG_GATE_ROOT ?? join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const at = (...parts) => join(root, ...parts);
const load = (...parts) => import(pathToFileURL(at(...parts)).href);

/** The four modules this gate is about, and a tree missing one has nothing for it to measure. */
const SERVER = ['apps', 'selfhost', 'src', 'server.ts'];
const IMPORT = ['apps', 'cli', 'src', 'import.ts'];
const PLANNER = ['apps', 'cli', 'src', 'legacy.ts'];
const EXPORT = ['apps', 'cli', 'test', 'legacy-export.ts'];

/**
 * Exit 3 is a SKIP and not a pass (`run.mjs`), and this is the only thing that earns one.
 *
 * A tree with no importer and no host has no switch to rehearse, and there is no smaller honest
 * thing to check. Everything below this line is red instead, including a record that will not
 * onboard: a host that cannot be stood up is a finding about the host and not an absence of one.
 */
const absent = [SERVER, IMPORT, PLANNER, EXPORT].filter((parts) => !existsSync(at(...parts)));
if (absent.length > 0) {
  console.log(
    `  import: no ${absent.map((parts) => parts.join('/')).join(' and no ')}, ` +
      'so there is no import to rehearse and nothing was checked. Run it from a tree that holds apps/cli and apps/selfhost.',
  );
  process.exit(3);
}

const findings = [];

/**
 * What the green line gets to claim, filled in as the gate earns each part.
 *
 * DECLARED HERE BECAUSE THE GATE CAN STOP EARLY. Onboarding and the pack install both end the run
 * before there is a record to read, and a reporter reaching for a binding that has not been
 * evaluated yet crashes with a `ReferenceError` instead of printing the finding it was called to
 * print, which is a gate failing loudly about the wrong thing.
 */
let running = null;
let scratch = null;
let lists = 0;
let planned = 0;
let held = 0;
let asks = 0;
let polls = 0;
let exit = null;
let again = null;

/** The one owner this record has, and the address every write is attributed to. */
const OWNER = 'owner@example.test';
const RECORD_ID = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const SLUG = 'rehearsal';

/**
 * The bearer, in this process and never printed.
 *
 * AN OPEN SELF-HOST WOULD PROVE LESS. Without a token a request carrying nothing is the owner, and
 * the import would then be exercising a door the field never has. It is a constant rather than a
 * random value because it is not a secret: it guards a record that lives in this process for about
 * a second, and a constant is one fewer thing in the output to explain.
 */
const TOKEN = 'gate-import-bearer-not-a-secret';

/**
 * The day the rehearsal happens on, pinned.
 *
 * THE PLANNER TAKES TODAY AND USES IT. A date in the export that has passed is carried differently
 * from one that has not (a question put off until a later day is left out until that day arrives),
 * so a gate reading the wall clock would be two runs disagreeing about one tree, and the disagreement
 * would arrive on some arbitrary morning months from now. This is the day the export was taken
 * against, which is what a real switch would have been run on.
 */
const TODAY = '2026-09-17';

/**
 * The three packs, and between them every list the planner writes to.
 *
 * INSTALLED THROUGH DECIDE, which is how the owner installs one: `propose` files the pack and
 * `decide` accepts it. Solo founder pulls Projects, People, Money and Work in under itself, so
 * naming those four here would be naming the same install twice.
 */
const PACKS = ['usecase-founder', 'estate', 'agents'];

/** Every row of one register, page by page, so this file holds no page size of its own. */
function rowsOf(kernel, register) {
  const out = [];
  let cursor = null;
  for (;;) {
    const got = kernel.list({ register, ...(cursor === null ? {} : { cursor }) });
    if (!got.ok) return out;
    out.push(...got.value.rows);
    cursor = got.value.cursor;
    if (cursor === null || got.value.rows.length === 0) return out;
  }
}

/**
 * THE RUN, IN ONE BLOCK, SO THAT A FINDING CAN END IT.
 *
 * SOME OF THE FINDINGS BELOW MAKE EVERYTHING AFTER THEM MEANINGLESS: a record that will not onboard
 * has no lists to import into, a pack that will not install leaves the rows of its lists missing for
 * a reason that is not the planner's, and a plan that cannot be read has nothing to compare against.
 * Each of those breaks out of here and the reporter runs once, at the bottom, with what it has.
 *
 * AND THE REPORTER DOES NOT CALL `process.exit`, WHICH IS WHY THIS IS A BLOCK RATHER THAN A RETURN.
 * Measured on Windows: exiting from inside the reporter while the host is still tearing its sockets
 * down aborts the process with `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)` and an exit
 * code of 127, which `run.mjs` reports as a failure with no sentence a reader can act on. Draining
 * the loop instead costs nothing: both the real run and the seeded one end within a tick of the
 * last line being printed.
 */
rehearsal: {
  /* ── 1 · a self-host, onboarded ─────────────────────────────────────────────────────────────────── */

  const { start } = await load(...SERVER);
  const { importCommand } = await load(...IMPORT);
  const { KEY_PREFIX, planLegacyTool, readLegacyTool, readSetup } = await load(...PLANNER);
  const { syntheticExport, syntheticSetup } = await load(...EXPORT);

  running = await start({ file: ':memory:', directory: ':memory:', port: 0, host: '127.0.0.1', pollMs: 0, token: TOKEN });

  const person = running.directory.person$(OWNER, 'Owner');
  if (!person.ok) {
    findings.push(`the Directory would not hold an owner for the record: ${said(person)}`);
    break rehearsal;
  }

  const made = await running.api.createRecord({
    id: RECORD_ID,
    slug: SLUG,
    name: 'Rehearsal',
    tz: 'UTC',
    locale: 'en',
    owner: { id: person.value.id, email: OWNER, name: 'Owner' },
  });
  if (!made.ok) {
    findings.push(`the self-host would not create a record to import into: ${said(made)}`);
    break rehearsal;
  }

  const named = running.directory.provision({ slug: SLUG, email: OWNER, record: RECORD_ID, plan: 'selfhost' });
  if (!named.ok) {
    findings.push(`the Directory would not name the record: ${said(named)}`);
    break rehearsal;
  }

  /* THE OWNER, AS THE APP CALLS IN. Onboarding is the owner's, in a browser session, which is what
     `import.ts` says in its own header: "Installing Solo founder and Agents is the owner's, in the
     app". The import below comes in the other door, over HTTP with the bearer. */
  const ownerCtx = { principal: { kind: 'person', id: person.value.id, level: 'owner' } };

  /* ── 2 · the packs, accepted on Decide ──────────────────────────────────────────────────────────── */

  for (const pack of PACKS) {
    const filed = await running.api.propose({ question: `Install ${pack}?`, body_kind: 'pack', body: { install: pack } }, ownerCtx);
    if (!filed.ok) {
      findings.push(`${pack} could not be offered to this record, so the lists it declares are not here: ${said(filed)}`);
      continue;
    }
    const accepted = await running.api.decide({ id: filed.value.id, decide: { option: 'accept', reason: 'the rehearsal installs it' } }, ownerCtx);
    if (!accepted.ok) findings.push(`${pack} was offered and would not install: ${said(accepted)}`);
  }
  if (findings.length > 0) break rehearsal;

  lists = running.api.kernel.registers().size;

  /* ── 3 · what the planner means to write ────────────────────────────────────────────────────────── */

  scratch = mkdtempSync(join(tmpdir(), 'braindog-gate-import-'));
  const exported = syntheticExport();
  const setup = syntheticSetup();
  writeFileSync(join(scratch, 'export.json'), JSON.stringify(exported));
  writeFileSync(join(scratch, 'setup.json'), JSON.stringify(setup));

  /**
   * The plan, built the way `importCommand` builds it, and BEFORE the import rather than after.
   *
   * READ THROUGH THE SAME TWO READERS, not from the two objects above. `readSetup` normalises a
   * setup file and `readLegacyTool` checks the export's shape, and a plan built from the raw objects
   * would be a DIFFERENT plan from the one that is about to be applied. The whole of this gate is a
   * comparison between what was planned and what the record then holds, and the two sides have to be
   * the same plan.
   */
  const read = readLegacyTool(JSON.stringify(exported));
  const asked = readSetup(JSON.stringify(setup));
  if (!read.ok || !asked.ok) {
    findings.push(`the synthetic export or its setup is not readable as one, so this run planned nothing: ${read.fix ?? asked.fix}`);
    break rehearsal;
  }
  const plan = planLegacyTool(read.value, TODAY, asked.value);
  planned = plan.rows.length;
  asks = plan.asks.length;
  polls = plan.polls.length;

  /* A PLAN WITH NO ROWS SATISFIES "EVERY ROW WAS ACCEPTED" THE WAY AN EMPTY LIST SATISFIES ANYTHING,
     which is the silence `self-test.mjs` exists to break. `spark-actor` guards the same hole by
     writing the one event its query is about before running the query. */
  if (planned === 0) {
    findings.push('the export planned no rows at all, so this gate offered the record nothing and asserts nothing about it');
    break rehearsal;
  }

  /**
   * AND THE LISTS THE PLAN NEEDS ARE ON THIS RECORD BEFORE A ROW IS SENT.
   *
   * A LIST THAT IS NOT HERE IS A DIFFERENT FINDING FROM A ROW THAT WAS REFUSED, and telling them
   * apart is the difference between "the planner and the declarations disagree" and "this gate
   * installed the wrong packs". `import.ts` leaves the rows of an absent list out with a reason and
   * never sends them, so without this check they would be reported below as rows the record turned
   * away, which is a sentence about the record that the record never said.
   */
  const declared = new Set(running.api.kernel.registers().keys());
  const nowhere = [...new Set(plan.rows.map((row) => row.register))].filter((register) => !declared.has(register));
  if (nowhere.length > 0) {
    for (const register of nowhere)
      findings.push(
        `${PACKS.join(', ')} declare no ${register} list on this record, so the ` +
          `${String(plan.rows.filter((row) => row.register === register).length)} row(s) planned for it were never offered`,
      );
    break rehearsal;
  }

  /* ── 4 · the import, over the API, as the owner's agent ─────────────────────────────────────────── */

  const base = `http://127.0.0.1:${String(running.server.address().port)}`;
  const out = [];
  const io = {
    env: { BRAINDOG_HOST: base, BRAINDOG_TOKEN: TOKEN, BRAINDOG_HOSTS: join(scratch, 'hosts.json') },
    cwd: scratch,
    home: scratch,
    out: (line) => out.push(line),
    say: (line) => out.push(line),
    /* The CLI's own session headers, which a self-host behind a bearer does not need. */
    headers: async () => ({}),
  };

  exit = await importCommand(['legacy', 'export.json', '--setup', 'setup.json'], io, TODAY);

  /* ── 5 · what the record actually holds ─────────────────────────────────────────────────────────── */

  const kernel = running.api.kernel;
  const keyed = new Map();
  for (const register of kernel.registers().keys())
    for (const row of rowsOf(kernel, register)) {
      const fields = row.fields ?? {};
      const tags = Array.isArray(fields.tags) ? fields.tags : [];
      /* An agent run carries its key in `client_id`; every other row carries it in its tags. This is
         `import.ts` `keyOf`, read back from the other side. */
      const key =
        register === 'session'
          ? typeof fields.client_id === 'string' && fields.client_id.startsWith(KEY_PREFIX)
            ? fields.client_id
            : null
          : (tags.find((t) => typeof t === 'string' && t.startsWith(KEY_PREFIX)) ?? null);
      if (key !== null) keyed.set(key, register);
    }
  held = keyed.size;

  /**
   * The record's own sentence for a row it turned away, by the label the report names it under.
   *
   * READ OUT OF WHAT THE COMMAND PRINTED, because that is the only place it survives: `importCommand`
   * returns an exit code and the refusal reaches the person as a line under "Refused by the record".
   * The finding below names the row from the PLAN and the reason from here, so a row that vanished
   * without a refusal at all is still a finding, with the absence said out loud.
   *
   * AND IN TWO SENTENCES RATHER THAN ONE. The fallback used to be glued to the same opening clause,
   * which read *"the record refused never-sent (things): and the command printed no refusal for it"*
   * when it fired: one half naming a refusal and the other half denying there was one. Measured by
   * planning a row the command never sends, which is the branch nothing else reaches.
   */
  const refusals = new Map();
  {
    const from = out.indexOf('Refused by the record:');
    if (from >= 0)
      for (const line of out.slice(from + 1)) {
        if (line === '') break;
        const parts = /^- (.+?) \((.+?)\): (.+)$/u.exec(line);
        if (parts) refusals.set(parts[1], parts[3]);
      }
  }

  for (const row of plan.rows)
    if (!keyed.has(row.key)) {
      const why = refusals.get(row.label);
      findings.push(
        why === undefined
          ? `the record does not hold ${row.label} (${row.register}), and the command printed no refusal for it, so the row was planned, sent and is not there`
          : `the record refused ${row.label} (${row.register}): ${why}`,
      );
    }

  /* ── 6 · the questions and the polls, which are rows on Decide ──────────────────────────────────── */

  const governance = await running.api.governance({ register: 'suggestion', status: 'all' }, ownerCtx);
  const filed = { from: new Set(), install: new Set() };
  if (governance.ok && Array.isArray(governance.value))
    for (const s of governance.value) {
      const body = s?.body;
      if (body && typeof body === 'object') {
        if (typeof body.from === 'string') filed.from.add(body.from);
        if (typeof body.install === 'string') filed.install.add(body.install);
      }
    }
  else findings.push(`Decide could not be read back, so nothing here says the questions were asked: ${said(governance)}`);

  for (const ask of plan.asks) if (!filed.from.has(ask.key)) findings.push(`the question ${ask.label} was planned and is not on Decide`);
  for (const poll of plan.polls) if (!filed.install.has(`poll-${poll.id}`)) findings.push(`the poll ${poll.label} was planned and is not filed on Decide as a pack to install`);

  /* ── 7 · and again, which must add nothing ──────────────────────────────────────────────────────── */

  /**
   * `import.ts`: *"RE-RUNNING UPDATES, IT NEVER ADDS A SECOND ROW."*
   *
   * ONLY THE FAKE HAD EVER BEEN ASKED TO KEEP THAT. It is the claim the whole recovery story rests on
   * (the command's own advice when a host stops answering part way is "run the import again"), and
   * the way it fails is by adding forty-two duplicates to somebody's record, which is not a state a
   * person can undo by hand.
   *
   * AND DECIDE IS COUNTED SEPARATELY, BECAUSE THE ROW CENSUS CANNOT SEE IT. Measured on this
   * record: `registers()` holds twenty-one lists and none of them is `suggestion`, which lives in
   * its own table, so a question asked a second time moves no count below. The command guards it
   * (it reads Decide before it proposes, and five suggestions after the first run were still five
   * after the second), and until this line nothing said so: a duplicate question is the same
   * unpickable mess as a duplicate row, arriving in the one place the owner is asked to act.
   */
  const before = [...kernel.registers().keys()].reduce((n, register) => n + kernel.count(register), 0);
  const onDecide = governance.ok && Array.isArray(governance.value) ? governance.value.length : null;
  again = await importCommand(['legacy', 'export.json', '--setup', 'setup.json'], { ...io, out: () => {}, say: () => {} }, TODAY);
  const after = [...kernel.registers().keys()].reduce((n, register) => n + kernel.count(register), 0);
  if (after !== before)
    findings.push(`the same export imported twice left ${String(after - before)} more row(s) in the record, and re-running is what this command tells somebody to do when a host stops answering`);

  const onDecideAgain = onDecide === null ? null : await running.api.governance({ register: 'suggestion', status: 'all' }, ownerCtx);
  if (onDecideAgain !== null && onDecideAgain.ok && Array.isArray(onDecideAgain.value) && onDecideAgain.value.length !== onDecide)
    findings.push(
      `the same export imported twice left ${String(onDecideAgain.value.length - onDecide)} more suggestion(s) on Decide, which is the one place the owner is asked to answer something`,
    );

  /* AND THE EXIT CODE, LAST, because a code with no row behind it is the least useful way to say what
     is wrong. `importCommand` returns 1 when anything was refused and 3 when the host stopped
     answering, and either with every row present is a disagreement worth a sentence of its own. */
  if (exit !== 0 && findings.length === 0) findings.push(`the import exited ${String(exit)} and every planned row is in the record, so the code and the record disagree`);
  if (again !== 0 && findings.length === 0) findings.push(`the second import exited ${String(again)} over a record that already holds every row of it`);

}

await report();

/* ── The line ───────────────────────────────────────────────────────────────────────────────────── */

/** A refusal said the way the record says it, for a call this gate made itself. */
function said(r) {
  const why = r?.refusal ?? r?.conflict ?? {};
  return `${why.code ?? 'no code'}, ${why.fix ?? 'no reason given'}`;
}

/**
 * One line, and the census is on it.
 *
 * `graph` and `spark-actor` both argue this and it is the same argument here: "every planned row was
 * accepted" is the same sentence whether the plan held forty-two rows or none, and a run whose
 * onboarding quietly collapsed would look exactly like a clean bill of health. The two numbers that
 * tell them apart are the rows planned and the rows found, and both are 0 on a gate that has stopped
 * examining anything.
 */
async function report() {
  const ms = Math.round(performance.now() - started);
  try {
    await running?.close();
  } catch {
    /* A host that will not close is not a finding about the import, and it is in memory. */
  }
  if (scratch !== null) rmSync(scratch, { recursive: true, force: true });

  if (findings.length === 0) {
    console.log(
      `  import: ${String(planned)} planned rows written into a self-host holding ${String(lists)} list(s) from ` +
        `${String(PACKS.length)} packs, ${String(held)} found in the record by their key, ${String(asks)} question(s) and ` +
        `${String(polls)} poll(s) on Decide, and a second import added nothing, in ${String(ms)}ms`,
    );
  } else {
    /* AND THE HEADER DOES NOT CLAIM A PLAN IT NEVER BUILT. Several of the findings above stop the
       run before a row has been planned at all, and "over 42 planned rows" on one of those is the
       gate overstating what it read, on the line a reader takes as the summary. */
    const over = planned === 0 ? 'before a row was planned' : `over ${String(planned)} planned row(s),`;
    console.error(`\n  import: ${String(findings.length)} finding(s) ${over} in ${String(ms)}ms, loop/research-switch.md §4\n`);
    for (const f of [...new Set(findings)]) console.error(`    ${f}`);
    console.error(
      '\n  The import is the switch. Its own tests drive an in-memory fake door and a stub server that\n' +
        '  answers ok to everything, so a field the founder, agents or estate declarations do not accept\n' +
        '  passes every one of them and fails on the day somebody moves their record. A refusal here is\n' +
        '  the planner and the declarations disagreeing, and the record has said which.\n',
    );
    process.exitCode = 1;
  }
}
