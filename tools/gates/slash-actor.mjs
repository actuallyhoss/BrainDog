/**
 * A model proposes, and it writes nothing else into the log. `30 §3`, `52 §5.2`.
 *
 *   node tools/gates/slash-actor.mjs
 *
 * `30 §3` closes the `slash` actor to three kinds and then does something no other row of that
 * table does: it states itself as SQL and calls it *"an invariant with a test"*. `event WHERE
 * actor='slash' AND kind NOT IN ('suggest','propose','predict')` must always be empty. That is
 * `11 §2`'s architectural claim, the one the whole assistant story rests on, written as a query
 * anybody can run against a real record: the assistant proposes and a person decides. A record
 * holding one row a model wrote on its own account has already broken it, and the log is the only
 * place that would say so.
 *
 * `52 §3` gives this gate one input, *"the `corpus` record, materialised"*, one assertion,
 * *"`30 §3`'s query returns 0"*, and 2,000ms to do it in.
 *
 * WHAT IS MATERIALISED HERE, PRECISELY, AND WHAT IS NOT. `52 §5.2` clause 1 says
 * `materialise(SEED.records.corpus, openNodeSqlite(':memory:'))`, and neither the corpus record
 * nor `@braindog/fixtures` exists in this build; `packages/kernel/test/materialise.ts` does not
 * exist either. What does exist is `@braindog/seed`, the record the product is SHOWN with, and
 * `installSeed` puts it through the real write path: eight registers, five pages, nine metrics and
 * ninety-three rows, each one an `event` the kernel wrote rather than a literal somebody typed.
 * That is the record this gate runs the query over. It is a smaller record than the corpus and it
 * is a real one, which is the half that matters: `packages/kernel/test/slash.test.ts` already
 * makes this assertion over a hand-built record of one register, and the day the corpus arrives
 * this gate points at a bigger record rather than becoming a different check.
 *
 * AND THE SEED WRITES NO `slash` EVENT, WHICH IS THE WHOLE DIFFICULTY. Run the query over the
 * record as installed and it returns zero rows because the `event` table has no `slash` row at
 * all, the way an empty list satisfies anything. `apps/web/src/lib/record/ledger.test.ts` had to
 * say the same thing out loud about the browser's ledger, and the Fenwick proposal was written
 * into that seed for exactly this reason. A gate reporting green off an empty table is the silence
 * `self-test.mjs` exists to break, so this one does not run the query over the record as installed.
 * It USES the record first:
 *
 *   1. It makes the one write `30 §3` allows, through the record's own writer: `propose`, which is
 *      the path `45 §5`'s `infer.draft` files a model's answer down. A record that refuses it is a
 *      record where `slash` can write nothing at all, and the invariant is vacuous in the other
 *      direction: a guard that refuses everything passes a test that only tries the refusals.
 *   2. It then offers the record the writes `30 §3` forbids, as `slash`, through the four public
 *      writers that take an actor from outside themselves: `create`, `update`, `log` and `decide`.
 *      Each would write an event if it were accepted, and each is refused by `slashMayWrite` at one
 *      of the two guard sites a `Result`-shaped API cannot hide (it throws: no caller can ASK to be
 *      `slash`, so reaching it is a defect here rather than an event in somebody's business).
 *   3. It installs the one declaration `30 §3` lets a model sign: a look on a page the seed
 *      came with, whose body says it is Slash's. Then it offers an install of a page and of a rule as
 *      `slash`, which the install's own `declare` line must refuse before anything of them lands.
 *   4. Only then does it run `30 §3`'s query, with the one exception the document states. Zero rows,
 *      over a record that holds `slash` events, a `declare` among them, and has been offered six
 *      writes it must not hold.
 *
 * SO THE INPUT THAT MAKES THIS GATE REPORT IS A WRITER THAT SKIPS THE GUARD, which is the one thing
 * a gate can catch that the guard cannot. `packages/kernel/src/slash.ts` says it in its own header:
 * *"The gate is still worth having, it catches a path that bypasses this one, and a rule that only
 * a gate knows is a rule the code does not have."* There are five calls to `slashMayWrite` today
 * and a sixth writer would be a sixth call; forget it, and this gate is what notices, because the
 * write lands and the query sees it.
 *
 * WHAT IT DELIBERATELY DOES NOT COVER, so nobody reads more into a green line than is in it:
 *
 *   · The ingest writer (`ingest.ts`) and the digest's note (`digest.ts`), which are two of the
 *     five guard sites. Both need a declaration and a payload the seed does not carry, and
 *     inventing one here would make this gate assert its own fixture rather than the record.
 *   · `predict`, the third kind `30 §3` allows. Nothing can write one as `slash` today:
 *     `govern.ts` files every prediction under `system`. That is worth knowing and it is not this
 *     gate's finding to make.
 *   · Any host or HTTP path. This is the record, in process, over `node:sqlite`.
 *
 * IT READS ROWS, NOT TEXT. Two gates in this directory were caught counting identifiers that were
 * only ever named in prose, and both were greps; this one has no pattern to be fooled by, because
 * what it examines is a database it built. The one thing it does read is `30 §3` itself, and it
 * reads the QUERY out of the document rather than holding a copy: a gate carrying its own spelling
 * of an invariant is a gate that gets widened by whoever widens the code, silently, in the same
 * commit. So the actor and the three kinds come from the sentence that owns them, and the code's
 * `SLASH_KINDS` is compared against it rather than trusted.
 *
 * IT ASSERTS NO NUMBER, so `budgets.json` gains no key. `52 §4`'s rule is that every number a gate
 * asserts lives there and every key there is read by something; a gate that asserts a count of
 * zero rows and nothing else has no budget to read, and adding one would be a number nobody reads.
 * The 2,000ms of `52 §3` is the runner's, and the run time is printed rather than asserted, for
 * the same reason no other gate here asserts its own wall clock.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Node's opinion of `node:sqlite` is not this gate's output.
 *
 * `52 §4`: "nothing else is printed by a gate". Importing the adapter emits an `ExperimentalWarning`
 * on stderr on every run, and a gate whose output carries two lines of somebody else's warning is a
 * gate people learn to read past. Only that class is dropped; anything else Node has to say still
 * prints, because a warning nobody sees is the failure this whole directory is about.
 *
 * AND THE LISTENERS IT FOUND ARE PUT BACK, which a script never had to do. As a script this process
 * was the gate's alone and ended with it; called by `run.mjs` it is the runner's, and every gate after
 * this one would have run with Node's own warning line taken away. So the filter holds for this call
 * and the answer is a function that undoes it.
 */
function quietExperimental() {
  const kept = process.listeners('warning');
  const quiet = (w) => {
    if (w.name !== 'ExperimentalWarning') console.warn(w);
  };
  process.removeAllListeners('warning');
  process.on('warning', quiet);
  return () => {
    process.off('warning', quiet);
    for (const listener of kept) process.on('warning', listener);
  };
}

/**
 * The three modules a record is made of, and why the adapter is one of them.
 *
 * `31 §1` bans `node:` imports from every source file under `packages/`, so the kernel cannot open
 * a database and the driver lives in `packages/kernel/test/sqlite.ts` on purpose. A gate is on the
 * allowed side of that line the same way a test is, and importing the adapter the tests use is what
 * makes this evidence about the same SQLite the Durable Object runs rather than evidence about a
 * mock this file wrote. `52 §1`: a gate that needs a package imports its `.ts` source directly.
 */
const KERNEL = ['packages', 'kernel', 'src', 'index.ts'];
const ADAPTER = ['packages', 'kernel', 'test', 'sqlite.ts'];
const SEED = ['packages', 'seed', 'src', 'index.ts'];

/**
 * `propose`, as `slash`, which is `45 §5`'s `infer.draft` filing a model's answer.
 *
 * WITHOUT THIS THE QUERY BELOW IS A QUESTION ABOUT AN EMPTY TABLE. The seed writes ninety-three
 * `create` events and all of them are a person's; nothing in it is a model's. The record has to
 * hold a `slash` row before "the query returns zero" is a statement about the filter rather than
 * about the absence of anything to filter.
 *
 * TWO OPTIONS BECAUSE ONE IS NOT A CHOICE, which the governance writer refuses on its own account:
 * "one option is an announcement wearing a question mark".
 */
const PROPOSAL = {
  question: 'Two services on the Fenwick invoice, or one billed twice?',
  body_kind: 'options',
  body: {
    options: [
      { id: 'two', label: 'Two services', because: 'the invoice names two lines' },
      { id: 'one', label: 'One, billed twice', because: 'the second line repeats the first' },
    ],
  },
};

/**
 * THE CHECK IS A FUNCTION, imported by `run.mjs` rather than spawned: `52 §5.1` step 3, argued in the
 * runner's `IMPORTED OR SPAWNED` header. Nothing in this file happens on import, and everything above
 * this line is a declaration.
 *
 * IT RETURNS, AND NEVER CALLS `process.exit`. As a script the reporter ended the process from wherever
 * a finding stopped the run, and inside the runner that would end every gate after this one. So a
 * finding that stops the run returns what the reporter answers: 1 for a finding, and nothing for a pass.
 *
 * THE RECORD IS CLOSED ON EVERY PATH OUT, and so is the warning filter, in the `finally` below, because a
 * throw here is now the runner's to report and the runner goes on to the next gate.
 *
 * THE ROOT IS AN ARGUMENT, defaulting to `BRAINDOG_GATE_ROOT`, which is the handle `self-test` aims this
 * gate at its seeded fixture with, and then to the repository this file sits in.
 */
export default async function slashActor(
  root = process.env.BRAINDOG_GATE_ROOT ?? join(fileURLToPath(new URL('.', import.meta.url)), '..', '..'),
) {
  const started = performance.now();
  const at = (...parts) => join(root, ...parts);
  const read = (...parts) => readFileSync(at(...parts), 'utf8');
  const load = (...parts) => import(pathToFileURL(at(...parts)).href);

  /**
   * Exit 3 is a SKIP and not a pass (`run.mjs`), and this is the only thing that earns one.
   *
   * A tree with no kernel and no seed has no record to materialise, and there is no smaller honest
   * thing to check: the query is a question about rows. Everything below this line is red instead,
   * including a seed that will not install, because a record that cannot be built is a finding about
   * the record and not an absence of one.
   */
  const absent = [KERNEL, ADAPTER, SEED].filter((parts) => !existsSync(at(...parts)));
  if (absent.length > 0) {
    console.log(
      `  slash-actor: no ${absent.map((parts) => parts.join('/')).join(' and no ')}, ` +
        'so there is no record to materialise and nothing was checked.',
    );
    return 3;
  }

  const findings = [];

  /**
   * What the green line gets to claim, filled in as the gate earns each part.
   *
   * DECLARED HERE BECAUSE THE GATE CAN STOP EARLY. Two of the findings below end the run before a
   * record exists at all, and a reporter reaching for a `const` that has not been evaluated yet
   * crashes with a `ReferenceError` instead of printing the finding it was called to print, which is
   * a gate that fails loudly about the wrong thing.
   */
  let sql = null;
  let actor = 'slash';
  let rows = 0;
  let events = 0;
  let mine = 0;
  let guarded = 0;
  let offered = 0;
  let looked = 0;
  let installs = 0;

  /* ── The line ───────────────────────────────────────────────────────────────────────────────────── */

  /**
   * One line, and the census is on both of them.
   *
   * `graph` argues this and it is the same argument here: "the query returns 0" is the same sentence
   * whether the query ran over the whole record or over an empty table, and a materialisation that
   * quietly collapsed would look exactly like a clean bill of health. The counts tell them apart, and
   * the two that matter are the `slash` events the record holds and the forbidden writes it refused:
   * both are 0 on a gate that has stopped examining anything.
   */
  const report = () => {
    const ms = Math.round(performance.now() - started);
    try {
      sql?.close();
    } catch {
      /* A record that will not close is not a finding about `30 §3`, and it is in memory. */
    }
    sql = null;

    if (findings.length === 0) {
      console.log(
        `  slash-actor: ${rows} rows and ${events} events materialised through the write path; ` +
          `${mine} ${actor} event(s) in the record, ${looked} of them the declare of its own look, ` +
          `${guarded} of ${offered} writes 30 §3 forbids refused at the write path, ${installs} of them installs, ` +
          `and the query returns 0, in ${ms}ms`,
      );
      return undefined;
    }
    /* AND THE HEADER DOES NOT CLAIM A RECORD IT NEVER BUILT. Two of the findings above stop the run
       before `installSeed` returns, and "over the materialised seed record" on one of those is the
       gate overstating what it read, on the line a reader takes as the summary. */
    const over = rows === 0 ? 'before a record was materialised' : `over the seed record, ${rows} row(s) materialised,`;
    console.error(`\n  slash-actor: ${findings.length} finding(s) ${over} in ${ms}ms, 30 §3, 52 §5.2\n`);
    for (const f of [...new Set(findings)]) console.error(`    ${f}`);
    console.error(
      '\n  30 §3 closes the `slash` actor to three kinds and calls it "an invariant with a test": a\n' +
        '  model suggests, proposes and predicts, and writes nothing else into the log. That is the\n' +
        '  whole of 11 §2 in one row of one table, and the log is the only place a record that had\n' +
        '  broken it would say so.\n',
    );
    return 1;
  };

  const loud = quietExperimental();
  try {
    /* ── 1 · the invariant, out of the document that owns it ────────────────────────────────────── */

    /* A MISSING DOCUMENT IS A FINDING AND NOT A STACK TRACE. A tree that has a record and no `30` is a
       tree where the invariant has no owner, which is worth a sentence; a gate that answers it with an
       ENOENT is a gate whose output a reader has to decode before they can act on it. */
    const blueprint = (() => {
      try {
        return read('docs', '30-BLUEPRINT.md');
      } catch {
        return '';
      }
    })();
    const from = blueprint.indexOf('## 3 · The `actor` grammar');
    const section = from < 0 ? '' : blueprint.slice(from, blueprint.indexOf('\n## ', from + 1));

    /* THE SENTENCE WRAPS, AND IT WRAPS INSIDE THE BACKTICKS. `30 §3` breaks the line between `NOT IN`
       and its list, so a pattern anchored on a single line matches nothing and the gate would report
       that the invariant is missing from the document that states it. Whitespace is collapsed first. */
    const flat = section.replace(/\s+/g, ' ');
    const stated = /actor\s*=\s*'([a-z]+)'\s+AND\s+kind\s+NOT\s+IN\s*\(([^)]*)\)/.exec(flat);
    /* THE ONE EXCEPTION, READ FROM THE SAME SENTENCE: a `declare` of a look. A document that does not state
       it leaves the query as it was, and the look planted below is then a row the query finds, which is the honest
       answer for a tree whose document and write path disagree. */
    const excepted = /AND\s+NOT\s*\(\s*kind\s*=\s*'([a-z]+)'\s+AND\s+target\s+LIKE\s+'([a-z.:%_]+)'\s*\)/.exec(flat);

    if (!stated) {
      findings.push("30 §3's query is not where this gate looks for it, so the invariant was read from nothing");
      return report();
    }

    actor = stated[1];
    const allowed = [...stated[2].matchAll(/'([^']*)'/g)].map((m) => m[1]);

    /**
     * `30 §3`'s query, built from `30 §3`'s own words.
     *
     * `id` is selected beside `kind` because a finding has to name the row. `52 §4` fixes the failure
     * line's `what` as `slash wrote <kind>` and `52 §5.2` clause 4 says the `where` names the record and
     * the event id, and an id is the difference between "something in here is wrong" and a row somebody
     * can open.
     */
    const QUERY =
      `SELECT id, kind FROM event WHERE actor = '${actor}' ` +
      `AND kind NOT IN (${allowed.map((kind) => `'${kind}'`).join(',')})` +
      (excepted ? ` AND NOT (kind = '${excepted[1]}' AND target LIKE '${excepted[2]}')` : '');

    const kernel = await load(...KERNEL);

    /* AND THE CODE'S COPY IS COMPARED, NOT TRUSTED. `SLASH_KINDS` is the set five writers check against
       and `30 §3` is where the closure is decided; the day they disagree, the record enforces a rule
       the document does not make, which is the drift `event-kinds` and `closed-lists` exist for on the
       two lists big enough to have done it already. */
    if (kernel.SLASH !== actor)
      findings.push(`30 §3 files a model's writing under '${actor}' and SLASH is '${kernel.SLASH}'`);

    const held = [...kernel.SLASH_KINDS].sort();
    if (held.join(' ') !== [...allowed].sort().join(' '))
      findings.push(`30 §3 closes ${actor} to ${allowed.join(', ')} and SLASH_KINDS holds ${held.join(', ')}`);

    /* ── 2 · the record, materialised ───────────────────────────────────────────────────────────── */

    const { openSqlite, fixedClock } = await load(...ADAPTER);
    const seed = await load(...SEED);

    sql = openSqlite();
    const record = await kernel.openRecord(sql, fixedClock(seed.NOW));

    const installed = await seed.installSeed(record);
    if (!installed.ok) {
      const why = installed.refusal ?? installed.conflict ?? {};
      findings.push(`the record would not take the seed: ${why.code ?? 'no code'}, ${why.fix ?? 'no reason given'}`);
      return report();
    }
    rows = Number(installed.value.rows);

    /* THE FIRST REGISTER THAT HOLDS A ROW, not the first declared. Since migration 0002 the kernel's own
       `session` register is declared before the seed's, and it starts empty, so `registers[0]` offered
       nothing to write against and the guard below was never reached. */
    const registers = [...record.registers().keys()];
    let register;
    let listed = null;
    for (const id of registers) {
      /* Not the kernel's own register: it refuses its kernel-written fields before 30 §3's guard is
         reached, so a refusal there would pass this gate for the wrong reason. */
      if (id === 'session') continue;
      const tried = record.list({ register: id, limit: 1 });
      if (tried?.ok && tried.value.rows.length > 0) {
        register = id;
        listed = tried;
        break;
      }
    }
    const row = listed?.ok ? listed.value.rows[0] : undefined;

    /* ── 3 · the write a model is allowed to make: `PROPOSAL`, above ──────────────────────────────── */

    let opened = null;
    try {
      opened = record.propose(PROPOSAL, actor);
    } catch (e) {
      findings.push(`offering ${actor} the write 30 §3 allows threw: ${e.message}`);
    }

    if (opened && !opened.ok) {
      const why = opened.refusal ?? {};
      findings.push(
        `the record refused the one write 30 §3 allows ${actor} to make (${why.code ?? 'no code'}: ` +
          `${(why.fix ?? 'no reason given').replace(/\.$/, '')}), so the query below filters nothing. ` +
          'A guard that refuses everything passes a test that only tries the refusals',
      );
    }

    /* ── 4 · the writes it is not ───────────────────────────────────────────────────────────────── */

    /**
     * The four public writers that take an actor from outside themselves, one forbidden kind each.
     *
     * EACH ONE WOULD WRITE AN EVENT IF IT WERE ACCEPTED, which is the property that makes this an input
     * to the query rather than a second assertion beside it. Measured on this record: `create` writes
     * one, an empty `update` still writes an `edit`, `log` writes a `note`, and `decide` writes two.
     *
     * THE FIELDS COME FROM A ROW THE RECORD ALREADY HOLDS. A `create` with an empty body is refused for
     * `REQUIRED_MISSING` before it reaches the guard at all, which would have made this offer prove
     * nothing while looking exactly like a refusal.
     *
     * TWO GUARD SITES, NOT ONE: `create`, `update` and `log` reach `appendEvent` in the kernel's write
     * path, and `decide` reaches the governance writer's own `event`. Three of the five sites `slash.ts`
     * names are covered by these four offers; the header says which two are not and why.
     */
    const offers = [
      ['create', () => record.create(register, row.fields, { actor })],
      ['edit', () => record.update(register, row.id, {}, { actor })],
      ['note', () => record.log(register, row.seq, { actor }, 'A note no model may sign on its own account.')],
    ];
    if (opened?.ok)
      offers.push([
        'decide',
        () => record.decide(opened.value.id, { decide: { option: PROPOSAL.body.options[0].id, reason: 'the invoice names two lines' } }, actor),
      ]);

    /**
     * AND THE DECLARATIONS. A model arranges a page with a look of its own, and the install signs that
     * line `slash`; a page, a list, a rule, a script and an add-on are a person's to install.
     *
     * THE LOOK IS PLANTED FIRST, THROUGH THE INSTALL, on a page the seed came with, for the reason the proposal is
     * made first: the exception in the query has to pass over a row that is there. THEN A PAGE AND A RULE ARE OFFERED
     * AS SLASH. Each would write a `declare` line if it were accepted, and a line whose target is no look is one the
     * query finds.
     */
    const page = sql.one("SELECT id FROM declaration WHERE kind = 'page' AND retired = 0 AND superseded_at IS NULL ORDER BY id LIMIT 1")?.id;
    const titled = register === undefined ? undefined : (record.registers().get(register)?.title ?? Object.keys(row?.fields ?? {})[0]);
    if (typeof page !== 'string' || !page.startsWith('page.')) {
      findings.push('the materialised record holds no page, so there was nothing for a look of Slash\'s to arrange');
    } else {
      const on = page.slice('page.'.length);
      try {
        const put = await record.install([{ id: `look.${on}`, kind: 'look', body: { look: on, basis: 'gate', by: actor } }], undefined, { actor });
        if (put?.ok) looked = 1;
        else findings.push(`the record refused the one declaration 30 §3 lets ${actor} sign, a look of its own (${put?.refusal?.code ?? 'no code'}: ${put?.refusal?.fix ?? 'no reason given'})`);
      } catch (e) {
        findings.push(`installing ${actor}'s own look threw: ${e.message}`);
      }
      const declares = [
        { id: 'page.gate-slash', kind: 'page', body: { page: 'gate-slash', title: 'Gate', blocks: [{ kind: 'table', source: `register.${register}`, heading: 'All', columns: [{ field: titled }] }] } },
        { id: 'rule.gate-slash', kind: 'rule', body: { rule: 'gate-slash', on: { written: { register, op: ['create'] } }, once_per: ['entry'], steps: [{ notify: { say: 'A rule no model may install.' } }] } },
      ];
      for (const one of declares) {
        offers.push(['declare', () => record.install([one], undefined, { actor }), one.kind]);
        installs++;
      }
    }

    offered = offers.length;

    const accepted = [];
    const elsewhere = [];

    if (row === undefined) {
      findings.push('the materialised record holds no row, so there was nothing to offer a write against');
    } else {
      for (const [kind, offer, of] of offers) {
        try {
          const out = await offer();
          if (out?.ok) accepted.push(kind);
          /* A DECLARATION REFUSED FOR ANOTHER REASON NEVER REACHED THE GUARD, and that is this gate's own offer gone
             stale, said out loud: the page or the rule it hands over has to be one a person could install. */
          else if (of !== undefined) findings.push(`offering ${actor} an install of a ${of} was refused before 30 §3's guard (${out?.refusal?.code ?? 'no code'}: ${out?.refusal?.fix ?? 'no reason given'})`);
          else elsewhere.push(`${kind} (${out?.refusal?.code ?? 'no code'})`);
        } catch (e) {
          /* AND THE THROW HAS TO BE THE RIGHT THROW. `catch {}` counting as a refusal is how a gate
             turns a crash into a pass: a renamed method, a changed signature, a missing register all
             throw, and all three would have read as "the guard held". The guard's sentence names the
             actor and the kind, so that is what is checked. */
          if (String(e?.message ?? '').includes(`${actor} wrote ${kind}`)) guarded++;
          else findings.push(`offering ${actor} a ${kind} threw something that is not 30 §3's refusal: ${e.message}`);
        }
      }
    }

    /* ── 5 · the query ──────────────────────────────────────────────────────────────────────────── */

    const wrote = sql.all(QUERY);
    for (const e of wrote) findings.push(`${actor} wrote ${e.kind}, in the seed record, event ${e.id}`);

    /* AND A WRITE THE RECORD TOOK WITHOUT LOGGING IT IS THE SAME BREACH, QUIETER. The query can only
       find a row that exists; a writer that accepted a model's write and appended no event has broken
       30 §3 in the one way the query is blind to, and the log is the only place either would show. */
    const seen = new Set(wrote.map((e) => e.kind));
    for (const kind of accepted)
      if (!seen.has(kind)) findings.push(`the record accepted a ${kind} from ${actor} and wrote no event saying so`);

    /* ── 6 · and the query was asked of something ───────────────────────────────────────────────── */

    events = Number(sql.one('SELECT count(*) AS n FROM event')?.n ?? 0);
    mine = sql
      .all(`SELECT kind, count(*) AS n FROM event WHERE actor = '${actor}' GROUP BY kind`)
      .reduce((n, r) => n + Number(r.n), 0);

    if (mine === 0)
      findings.push(
        `the record holds no ${actor} event, so 30 §3's query is satisfied the way an empty list satisfies anything`,
      );

    if (guarded === 0 && accepted.length === 0)
      findings.push(
        `no write reached 30 §3's guard, so the query filtered nothing: ${elsewhere.join('; ') || 'none was offered'}`,
      );

    return report();
  } finally {
    /* A THROW ABOVE NEVER REACHED THE REPORTER, so the record it opened is closed here. */
    try {
      sql?.close();
    } catch {
      /* In memory, and the throw is what the runner reports. */
    }
    loud();
  }
}

/* AND IT IS STILL A SCRIPT, because `self-test` spawns it at its seeded fixture with
   `BRAINDOG_GATE_ROOT`, and the header documents the command line. `?? 0` because a pass returns
   nothing. */
if (import.meta.main) process.exitCode = (await slashActor()) ?? 0;
