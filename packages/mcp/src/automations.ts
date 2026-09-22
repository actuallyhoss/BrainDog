/**
 * What an automation may say, once, for an agent about to write one (`loop/research-shell-automations.md` sections 3 to 5,
 * Brief D). Served at `braindog:grammar/automations`, never in a tool description, so the turn budget
 * `test/budget.test.ts` holds does not move for it.
 *
 * WHY HERE AND NOT IN THE RECORD, FOR THE SCRIPT GRAMMAR'S REASON (`grammars/script.ts`). The lint is the kernel's
 * `flow-lint.ts`, whose ceilings the kernel does not export, and `31 §2` forbids reaching into it by a relative path from
 * any `src/`. So the numbers below are copies, and `test/automations.test.ts` holds each one to `STEP_CEILING`,
 * `DEPTH_CEILING`, `RUNS_PER_DAY_CEILING`, `VARS_CEILING` and `FLOOR_MS`, and installs both examples on a real record.
 *
 * IT SAYS WHAT DOES NOT RUN YET. A `metric` or `decided` trigger is refused at install, and a `call`, `script`,
 * `ask_spark` or `ask_person` step installs so the canvas can draw it and fails the run that reaches it. An agent told
 * only the grammar would file a rule with an ask in it, and the owner would accept a run that stops there. The same test
 * holds that list to what a real run of the runner does.
 */

export const AUTOMATION_GRAMMAR = {
  declaration: { id: 'rule.<name>', kind: 'rule', body: 'the keys below' },
  propose:
    'propose body_kind change with body {"to":{"id":"rule.<name>","kind":"rule","body":{...}}}. The answer carries dry_run: path, what starts it, and each step as a line. Nothing runs until the owner accepts it on Decide',
  body: {
    rule: 'the name, as in the id: lower-case letters, digits, - and _ (required)',
    name: 'the words its card shows',
    on: 'exactly one trigger; see triggers. Absent means a write to the register below, inside the write',
    register: 'only with no on: and a then: list, for a rule that runs inside the write',
    when: 'a condition on the row, for a write trigger, in the sentence form list takes',
    steps: 'the list of steps; see steps (required, or then:)',
    then: 'the older flat list of actions, which runs inside the write; never beside steps',
    once_per: '["entry"] or field ids: what makes one firing. Required when a write trigger notifies, creates, suggests, runs, calls or asks',
    enabled: 'false stops it starting, and cancels its runs still waiting',
    project: 'a project id: only rows of that project start it',
    limits: '{"runs_per_day","steps_per_run"}, whole numbers, which can only lower the record ceilings',
    priority: 'a number; lower runs first among rules inside one write',
  },
  triggers: {
    written: '{"written":{"register":"<id>","op":["create","update","delete"],"fields":["<field>"],"from_rules":false}}: a row was written. op, fields and from_rules are optional, and any of them makes it run after the write',
    arrival: '{"arrival":{"ingest":"<id>","channel":"webhook","state":["untriaged"],"unverified":false}}: something arrived at a door, each key optional. A redelivery starts nothing, and an arrival nothing verified starts nothing unless unverified is true',
    every: '{"every":"1h"}, no more often than every 15m; {"every":"1d","at":"08:00"}; {"every":"1w","at":"08:00","day":"mon"}',
    manual: '{"manual":true}: a person presses Run now in the app. No agent and no token can press it',
  },
  steps: {
    if: '{"if":"<condition>","then":[...],"else":[...]}: a branch, read over the row and the answers so far',
    set_var: '{"set_var":{"name":"<answer>","to":"<text>"}}: keep a value as an answer',
    wait: '{"wait":"2h"}: a number and one of m, h, d or w',
    call: '{"call":{"ingest":"<declared call>","as":"<answer>"}}: a declared call, never an address',
    script: '{"script":{"id":"<script>","input":{"<name>":"<text>"},"as":"<answer>"}}',
    ask_spark: '{"ask_spark":{"question":"<text>","as":"<answer>","shape":"text"}}: shape is text, number or choice, and choice needs choices',
    ask_person: '{"ask_person":{"question":"<text>","options":["yes","no"],"as":"<answer>","to":"<person>","wait":"2d"}}',
    actions:
      'every action a rule has: {"tag":"x"} {"untag":"x"} {"set":{"field":"f","to":"v"}} {"move":"<state>"} {"link":{"field":"f","to":{"register":"r","by":"f","value":"v"}}} {"note":"text"} {"notify":{"say":"text"}} {"schedule":{"in":"14d","note":"text"}} {"create":{"register":"r","bound":10,"fields":{}}} {"suggest":{"question":"q","options":["a","b"]}} {"run":"<declared call>"} {"stop":true}. tag, untag, set, move, link, note, schedule and run act on a row, so a clock or a button cannot use them',
  },
  context: 'any text in a step may read {{trigger.row.<field>}}, {{trigger.body.<path>}} of a JSON arrival, {{trigger.kind}} and {{vars.<answer>}}',
  not_in_this_build: {
    triggers: ['metric', 'decided'],
    steps: ['call', 'script', 'ask_spark', 'ask_person'],
  },
  not_in_this_build_says:
    'a metric or decided trigger is refused at install. One of those four steps installs, and a run that reaches it fails there with a sentence, after taking every step before it',
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
  ],
} as const;
