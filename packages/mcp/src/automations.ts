/**
 * What an automation may say, once, for an agent about to write one. Served at `braindog:grammar/automations`, never
 * in a tool description, so the turn budget
 * `test/budget.test.ts` holds does not move for it.
 *
 * WHY HERE AND NOT IN THE RECORD, FOR THE SCRIPT GRAMMAR'S REASON (`grammars/script.ts`). The lint is the kernel's
 * `flow-lint.ts`, whose ceilings the kernel does not export, and `31 §2` forbids reaching into it by a relative path from
 * any `src/`. So the numbers below are copies, and `test/automations.test.ts` holds each one to `STEP_CEILING`,
 * `DEPTH_CEILING`, `RUNS_PER_DAY_CEILING`, `VARS_CEILING` and `FLOOR_MS`, and installs both examples on a real record.
 *
 * IT SAYS WHAT DOES NOT RUN YET, AND READS THAT FROM THE KERNEL'S ONE TABLE (`capabilities.ts`, through
 * `@braindog/record/automations`), which the lint and the runner read too. So `not_in_this_build` and its sentence are
 * never a list written here by hand: this file once listed `script` after `e6010208` made the runner queue the script
 * and go on, and an agent reading it would not file the step Work's `rule.close_follow_ups` is built on. A step whose
 * row installs and does not run is said as one that fails the run that reaches it, as `call` was until the runner
 * parked a run on its answer; one whose row does not install, or does not on this host (`ask_slash` where nothing
 * answers Slash), as refused at install. On a host that answers Slash that host is served `ANSWERED_GRAMMAR` below.
 *
 * A `call` AND A QUESTION PUT TO ONE MEMBER ARE SAID AS THE RUNNER TAKES THEM (`flow.ts`): the run waits up to a day on
 * a call and reads into its JSON answer by path, and `ask_person`'s `to:` holds the answer to that member or an owner
 * (`govern.ts`'s `decide`). `propose` says how a body is tried over a sample before anybody accepts it.
 *
 * `meet` AND `run_job` ARE SAID AS THE RUNNER TAKES THEM TOO: `meet` goes through the kernel's own `meet`, so its match,
 * its dated line and its merge question are an agent's, and `run_job` waits on the job for a day at most and keeps how it
 * ended (`RUN_JOB_WAIT_MS` in `flow.ts`, copied as the other waits are). Each has an example below, installed with the
 * rest by `test/automations.test.ts`.
 *
 * THE `script` ENTRY SAYS WHAT THE RECORD'S DRY RUN SAYS (`said` in `packages/record/src/automations.ts`): the run does
 * not wait, `as:` is the queued run's id and not the script's answer, and the three things that stop it are each on the
 * script's own row.
 */

import { CAPABILITIES, notInThisBuild, serves, type Capability } from '@braindog/record/automations';

/** How the sentence names one row: a trigger, a step, or one key of a step. */
const named = (c: Capability): string => {
  if (c.of === 'trigger') return `a ${c.name} trigger`;
  const [verb, key] = c.name.split('.');
  const article = /^[aeiou]/u.test(verb ?? '') ? 'an' : 'a';
  return key === undefined ? `${article} ${c.name} step` : `the ${key}: key of ${article} ${verb} step`;
};

const joined = (items: readonly string[]): string => (items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)!}`);
const opening = (text: string): string => `${text.slice(0, 1).toUpperCase()}${text.slice(1)}`;

/**
 * What the grammar says does not run, on a host that answers Slash or one that does not, from the table's rows: what is
 * refused at install, then what installs and fails the run that reaches it.
 */
function unbuiltSaid(answersSlash: boolean): string {
  const refused = CAPABILITIES.filter((c) => !c.installs || !serves(c, answersSlash)).map(named);
  const failing = CAPABILITIES.filter((c) => c.installs && serves(c, answersSlash) && !c.runs).map(named);
  const said: string[] = [];
  if (refused.length > 0) said.push(`${opening(joined(refused))} ${refused.length === 1 ? 'is' : 'are'} refused at install`);
  if (failing.length > 0)
    said.push(
      `${opening(joined(failing))} ${failing.length === 1 ? 'installs, and a run that reaches it fails' : 'install, and a run that reaches one fails'} there with a sentence, after taking every step before it`,
    );
  return said.length > 0 ? said.join('. ') : 'Every trigger and step above installs and runs';
}

export const AUTOMATION_GRAMMAR = {
  declaration: { id: 'rule.<name>', kind: 'rule', body: 'the keys below' },
  propose:
    'propose body_kind change with body {"to":{"id":"rule.<name>","kind":"rule","body":{...}}}. The answer carries dry_run: path, what starts it, and each step as a line. Nothing runs until the owner accepts it on Decide. Add "try":{"sample":{"row":"<row id, or its fields>","payload":"<what arrived, or a figure\'s value>","at":"<instant>"}} to a rule that runs as a run and the steps are taken over the sample, rolled back, and answered as automation_try, each step done, would, waiting, failed or skipped; nothing is filed or sent',
  body: {
    rule: 'the name, as in the id: lower-case letters, digits, - and _ (required)',
    name: 'the words its card shows',
    on: 'exactly one trigger; see triggers. Absent means a write to the register below, inside the write',
    register: 'only with no on: and a then: list, for a rule that runs inside the write',
    when: 'a condition in the sentence form list takes: on the written row for a write trigger; on the row an arrival files, or on the top-level keys of its JSON body when it files none. A write trigger whose when names a day relative to today (today, -7d) and that says once_per is read again each hour, one run per row and key',
    steps: 'the list of steps; see steps (required, or then:)',
    then: 'the older flat list of actions, which runs inside the write; never beside steps',
    once_per: '["entry"] or field ids: what makes one firing. Required when a write trigger notifies, creates, suggests, runs, calls or asks',
    enabled: 'false stops it starting, and cancels its runs still waiting',
    project: 'a project id: only rows of that project start it',
    limits: '{"runs_per_day","steps_per_run"}, whole numbers, which can only lower the ceilings BrainDog sets',
    priority: 'a number; lower runs first among rules inside one write',
  },
  triggers: {
    written: '{"written":{"register":"<id>","op":["create","update","delete"],"fields":["<field>"],"from_rules":false}}: a row was written. op, fields and from_rules are optional, and any of them makes it run after the write',
    arrival: '{"arrival":{"ingest":"<id>","channel":"webhook","state":["untriaged"],"unverified":false}}: something arrived at a door, each key optional. A redelivery starts nothing, and an arrival nothing verified starts nothing unless unverified is true',
    every:
      '{"every":"1h"}, no more often than every 15m; {"every":"1d","at":"08:00"}; {"every":"1w","at":"08:00","day":"mon"}; {"every":"1mo","day":"last","at":"09:00"}. Every turn missed while the host was away is taken, each as its own run; "late":"6h" beside every records a turn reached later than that as skipped instead',
    metric:
      '{"metric":{"id":"<metric>","crosses":{"lte":0}}}: read each hour; a run starts when the figure moves to the other side of the line, and the first reading only sets the side. crosses is target, {"lte":n} or {"gte":n}, n in the figure\'s own units (minor units for money). The run reads {{trigger.value}} and {{trigger.side}}, above or below',
    decided:
      '{"decided":{"about":"rule.<name>","option":"<answer>"}}: a question in Decide was decided, once per question. about is the declaration that filed or proposes it and option the chosen answer\'s words, each optional. The run reads {{trigger.option}} and the row the question is about as {{trigger.row.<field>}}',
    manual: '{"manual":true}: a person presses Run now in the app. An agent runs it with act {"call":"automationRun","args":{"rule":"<name>"}} only while the owner lets agents do everything without asking; otherwise it is refused and stays his to press',
  },
  steps: {
    if: '{"if":"<condition>","then":[...],"else":[...]}: a branch, read over the row and the answers so far',
    set_var: '{"set_var":{"name":"<answer>","to":"<text>"}}: keep a value as an answer',
    wait: '{"wait":"2h"}: a number and one of m, h, d or w',
    call: '{"call":{"ingest":"<declared call>","as":"<answer>"}}: a declared call, never an address. The run waits up to 1d for its answer and keeps it under as as the JSON it came back as, so {{vars.<answer>.<path>}} reads into it: {{vars.a.rate}} is 48.5 from {"rate":48.5}. A refused, held or failed call stops the run with its sentence. A call that sends fields of a row needs a trigger with that row; one that sends none may run on a clock',
    script:
      '{"script":{"id":"<script>","input":{"<name>":"<text>"},"as":"<answer>"}}: starts the script and goes on without waiting for it; what it writes lands when this host runs it. as keeps the id of its queued run, never what the script answers. The run stops here if the script is not installed, does not say runs: { rule: true }, or is paused',
    ask_slash: '{"ask_slash":{"question":"<text>","as":"<answer>","shape":"text"}}: shape is text, number or choice, and choice needs choices',
    ask_person: '{"ask_person":{"question":"<text>","options":["yes","no"],"as":"<answer>","wait":"2d","to":"<member>"}}: two options or more, each once. The question opens in Decide. to is optional: the id of one member, typed or filled from a field of the row, and only that member or an owner answers it; without to, anyone who decides answers it. The run waits 7d when wait is left out, and stops if nobody answers',
    meet: '{"meet":{"kind":"person","name":"<text>","email":"<text>","handle":"<site>:<name>","keys":["<kind>:<value>"],"where":"<text>"}}: meets one person, or with kind organisation one organisation, as the rule. Matched by a key (email, handle, or keys such as bank:{{trigger.row.counterparty_text}} or domain:<site>), never by name: a name with no key is only noted; added when no key matches; where is kept as a dated line, such as mail: {{trigger.body.subject}}; a doubtful match opens one question in Decide. A key that fills with nothing is left out, and when every one does, nobody is met and the run goes on',
    run_job:
      '{"run_job":{"kind":"job.<id>","args":{"<arg>":"<text>"},"as":"<answer>"}}: queues one job of a kind the owner approved in Decide, to run on the owner\'s own machine, with args filling the kind\'s own. The run waits up to 1d for it to end and keeps ok, needs_decision or error under as. A kind not approved, or args it does not take, stops the run with its sentence; a write trigger needs once_per',
    actions:
      'every action a rule has: {"tag":"x"} {"untag":"x"} {"set":{"field":"f","to":"v"}} {"move":"<state>"} {"link":{"field":"f","to":{"register":"r","by":"f","value":"v"}}} {"note":"text"} {"notify":{"say":"text"}} {"schedule":{"in":"14d","note":"text"}} {"create":{"register":"r","bound":10,"fields":{}}} {"suggest":{"question":"q","options":["a","b"]}} {"run":"<declared call>"} {"stop":true}. tag, untag, set, move, link, note, schedule and run act on a row, so a clock, a figure or a button cannot use them. A create with no row to stand on counts its bound over a day, not a run',
  },
  context: 'any text in a step may read {{trigger.row.<field>}}, {{trigger.body.<path>}} of a JSON arrival, {{trigger.kind}}, {{vars.<answer>}} and {{vars.<answer>.<path>}} of a call\'s answer. Braces are always two: one brace around a word fills nothing and is refused at install, and so is {{vars.<answer>}} in a rule that runs inside the write, which has no run',
  not_in_this_build: notInThisBuild(false),
  not_in_this_build_says: unbuiltSaid(false),
  limits: {
    steps: 50,
    depth: 3,
    runs_per_day: 1000,
    answers: 64,
    shortest_clock: '15m',
  },
  reads: 'braindog:automations lists every automation with what starts it, when it runs next and how its runs went; braindog:automation/<name> is one with its last ten runs, each step with its outcome',
  examples: [
    {
      id: 'rule.morning-look',
      kind: 'rule',
      body: {
        rule: 'morning-look',
        name: 'Morning look at what is due',
        on: { every: '1d', at: '08:00' },
        steps: [{ notify: { say: 'Look at what is due today before anything else.' } }],
      },
    },
    {
      id: 'rule.chase-new',
      kind: 'rule',
      body: {
        rule: 'chase-new',
        name: 'Chase a new bill after three days',
        on: { written: { register: 'obligations', op: ['create'] } },
        once_per: ['entry'],
        steps: [{ wait: '3d' }, { if: 'state is open', then: [{ notify: { say: 'Still open after three days: {{trigger.row.what}}' } }] }],
      },
    },
    /* AN ARRIVAL NAMES NO LIST, SO THE ROW DECIDES: an arrival filed into a list with no counterparty meets nobody and
       the run goes on (`flow.ts`'s `meetOne`), so this meets the other side of each transaction an arrival files.
       AN ORGANISATION BY ITS BANK PAYEE, NEVER A PERSON BY NAME. It met `{{trigger.row.counterparty}}` as a name, and
       every card payment made a person of its merchant, one new row a transaction: "GEIDEA*CHILLOUT 4" and "Chillout"
       were two people. The payee is a key the record folds (`bank:` drops the processor's prefix and the trailing city
       and digits), so five spellings of one shop meet one organisation, and a private payee is never made a person. */
    {
      id: 'rule.meet-counterparty',
      kind: 'rule',
      body: {
        rule: 'meet-counterparty',
        name: 'Meet the business on the other side of each filed transaction',
        on: { arrival: { state: ['matched'] } },
        steps: [
          {
            meet: {
              kind: 'organisation',
              name: '{{trigger.row.counterparty_text}}',
              keys: ['bank:{{trigger.row.counterparty_text}}'],
              where: 'bank text: {{trigger.row.what}}',
            },
          },
        ],
      },
    },
    {
      id: 'rule.weekly-notes',
      kind: 'rule',
      body: {
        rule: 'weekly-notes',
        name: 'Weekly notes on braindog, every Friday',
        on: { every: '1w', at: '16:00', day: 'fri' },
        steps: [{ run_job: { kind: 'job.weekly-notes', args: { project: 'braindog' }, as: 'notes' } }],
      },
    },
  ],
} as const;

/**
 * The same grammar on a host that answers Slash, which `version` says as `slash: true`: what does not run is read from
 * the same table for that host, so `ask_slash` is not in it and the sentence says nothing of it.
 *
 * MEASURED BEFORE THIS, ON A RECORD OPENED WITH `answersSlash: true`: a rule asking Slash installed and parked on its
 * question, and this resource still listed `ask_slash` under `not_in_this_build` and said it "is refused at install". An
 * agent reading that would not file the one step the host serves (`test/automations.test.ts`, "ON A HOST THAT ANSWERS").
 *
 * AND THE STEP ITSELF IS SAID IN FULL HERE, because the flag-off entry above was all this host served of it: question,
 * as and shape, with no word of `about:`, which is the only way a field of the row goes with the question unless the
 * question's braces name it, and no word of the wait, where `ask_person`'s entry states its week. The day is
 * `flow.ts`'s `ASK_SLASH_WAIT_MS`, copied for the reason the limits are and held by the same test, which also installs
 * the step as written.
 */
export const ANSWERED_GRAMMAR = {
  ...AUTOMATION_GRAMMAR,
  steps: {
    ...AUTOMATION_GRAMMAR.steps,
    ask_slash:
      '{"ask_slash":{"question":"<text>","about":["<field>"],"as":"<answer>","shape":"text"}}: shape is text, number or choice, and choice needs choices. about is optional: the fields of the run\'s row that go with the question, so it needs a trigger with a row, and a secret or file field is refused in about and in the question alike. The run waits 1d for this host\'s model to answer, and stops if none comes',
  },
  not_in_this_build: notInThisBuild(true),
  not_in_this_build_says: unbuiltSaid(true),
} as const;
