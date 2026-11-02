/**
 * The grammar of an automation, as one answer: every trigger and every step, each with its arguments, and the ceilings.
 *
 * ONE DEFINITION, TWO EDITORS. The web drew its step menu, its `once_per` hint and its depth from its own copy
 * of `flow-lint.ts`'s tables, and the copy drifted: it never learnt `meet` or `run_job`. This reads the lint's own
 * tables, so a verb added there is a verb here, and the record answers it as the read `flowGrammar` for the canvas and
 * for an agent alike.
 *
 * `required` IS WHAT THE LINT REFUSES WHEN IT IS LEFT OUT, and nothing a card would like to have. `flow-grammar.test.ts`
 * holds it: for every trigger and step, a body giving only the required arguments installs, and one missing any of them
 * is refused. Where the lint wants one of several and none in particular (`meet`'s who), the step says so in `oneOf`.
 * Whether a named list, door, call or figure exists is the lint's to ask against the record (`checkAutomation`); `from`
 * says what an argument picks from, so an editor offers names and never asks anybody to type an id.
 */

import { MONTHS } from './clock.ts';
import {
  ACTIONS,
  CHANNELS,
  DEPTH_CEILING,
  FLOW,
  MEET_KEYS,
  ONCE,
  OPS,
  ROW_VERBS,
  RUN_JOB_KEYS,
  RUNS_PER_DAY_CEILING,
  SHAPES,
  STEP_CEILING,
  TRIGGERS,
  VARS_CEILING,
  VERBS,
} from './flow-lint.ts';

/**
 * What an argument holds. `text` may hold `{{…}}` the run fills; `name` is an answer's name, read back as `{{vars.x}}`;
 * `span` is the clock grammar (`2h`), `later` a schedule's (`14d`, where `m` is a month), `clock` a span or a count of
 * months (`1mo`); `time` is HH:MM and `day` a weekday or a day of the month; `condition` is a `when` sentence; `steps` a
 * list of steps; `list` is text a line and `map` names to text; `true` is the word true and nothing else; `choice` is
 * one of `values`; `crossing` is `target`, `{ lte: n }` or `{ gte: n }`.
 */
export type ArgType = 'text' | 'name' | 'span' | 'later' | 'clock' | 'time' | 'day' | 'condition' | 'steps' | 'list' | 'map' | 'number' | 'boolean' | 'true' | 'choice' | 'crossing';

/** What a picked argument is the id of, so an editor lists names to choose from. */
export type ArgFrom = 'list' | 'field' | 'person' | 'call' | 'script' | 'door' | 'figure' | 'job';

/**
 * One argument. `name` is where it sits, dotted: under the step for a step (`ask_person.question`, or `wait` for a step
 * whose value is the argument), under `on` for a trigger (`written.register`, `every`, `at`).
 */
export type Arg = { name: string; type: ArgType; required: boolean; from?: ArgFrom; values?: readonly string[]; of?: string };

export type Verb = (typeof ACTIONS)[number] | (typeof FLOW)[number];
export type Trigger = (typeof TRIGGERS)[number];

export type GrammarStep = {
  verb: Verb;
  /** `action` for the twelve a rule had before steps, `flow` for the verbs only a step has. */
  group: 'action' | 'flow';
  /** Acts on the run's row, so a trigger with none (`every`, `metric`, `manual`) refuses it. */
  row: boolean;
  /** Needs `once_per` on a trigger about a row. */
  once: boolean;
  args: readonly Arg[];
  /** At least one of these is given, where the lint asks for one and none in particular. */
  oneOf?: readonly string[];
};

export type FlowGrammar = {
  triggers: { id: Trigger; args: readonly Arg[] }[];
  steps: GrammarStep[];
  ceilings: { steps: number; depth: number; runsPerDay: number; vars: number };
};

const need = (name: string, type: ArgType, from?: ArgFrom, values?: readonly string[]): Arg => ({ name, type, required: true, ...(from ? { from } : {}), ...(values ? { values } : {}) });
const may = (name: string, type: ArgType, from?: ArgFrom, values?: readonly string[]): Arg => ({ name, type, required: false, ...(from ? { from } : {}), ...(values ? { values } : {}) });

/** A field argument whose list another argument picks: `of` is that argument's name (`link.to.by` of `link.to.register`). */
const of = (arg: Arg, picker: string): Arg => ({ ...arg, of: picker });

/**
 * THE TABLES ARE MADE ON FIRST ASK, NOT AS THIS FILE LOADS. They read `flow-lint.ts`'s words, and `flow-lint.ts` reaches
 * `change-kind.ts` through its own imports, which reaches this file through `automation-kind.ts`: a process that loads
 * `flow-lint.ts` first met these tables before its words were set.
 */
let tables: { TRIGGER_ARGS: Record<Trigger, readonly Arg[]>; STEP_ARGS: Record<Verb, readonly Arg[]> } | null = null;
function argTables(): { TRIGGER_ARGS: Record<Trigger, readonly Arg[]>; STEP_ARGS: Record<Verb, readonly Arg[]> } {
  if (tables !== null) return tables;
  /** Each trigger's keys, as `shapeFault` and `calendarFault` read them. Typed by `TRIGGERS`, so a new one needs a line. */
  const TRIGGER_ARGS: Record<Trigger, readonly Arg[]> = {
    written: [need('written.register', 'text', 'list'), may('written.op', 'list', undefined, OPS), of(may('written.fields', 'list', 'field'), 'written.register'), may('written.from_rules', 'boolean')],
    arrival: [may('arrival.ingest', 'text', 'door'), may('arrival.channel', 'choice', undefined, CHANNELS), may('arrival.state', 'list'), may('arrival.unverified', 'boolean')],
    /* `day`, `at` AND `month` ARE REQUIRED ONLY OF SOME CLOCKS (a week needs a day, months need a day and a time), so
       they are optional here and the lint says which on the card. */
    every: [need('every', 'clock'), may('at', 'time'), may('day', 'day'), may('month', 'choice', undefined, MONTHS), may('late', 'span')],
    metric: [need('metric.id', 'text', 'figure'), need('metric.crosses', 'crossing')],
    decided: [may('decided.about', 'text'), may('decided.option', 'text')],
    manual: [need('manual', 'true')],
  };

  /** `meet`'s keys from `MEET_KEYS`: text each, `keys` a list, `kind` and `only` a choice, and `where` always. */
  const MEET_ARGS: readonly Arg[] = MEET_KEYS.map((k) =>
    k === 'where'
      ? need('meet.where', 'text')
      : k === 'keys'
        ? may('meet.keys', 'list')
        : k === 'kind'
          ? may('meet.kind', 'choice', undefined, ['person', 'organisation'])
          : k === 'only'
            ? may('meet.only', 'choice', undefined, ['known'])
            : may(`meet.${k}`, 'text'),
  );

  /** `run_job`'s keys from `RUN_JOB_KEYS`. */
  const RUN_JOB_ARGS: readonly Arg[] = RUN_JOB_KEYS.map((k) => (k === 'kind' ? need('run_job.kind', 'text', 'job') : k === 'args' ? may('run_job.args', 'map') : may('run_job.as', 'name')));

  /**
   * Each step's arguments, as `stepFault`, `fillFault`, `writeFault` and `declare.ts`'s action checks read them. Typed by
   * the lint's verbs, so a verb added to `ACTIONS` or `FLOW` without a line here does not compile.
   */
  const STEP_ARGS: Record<Verb, readonly Arg[]> = {
    if: [need('if', 'condition'), need('then', 'steps'), may('else', 'steps')],
    set_var: [need('set_var.name', 'name'), need('set_var.to', 'text')],
    script: [need('script.id', 'text', 'script'), may('script.input', 'map'), may('script.as', 'name')],
    call: [need('call.ingest', 'text', 'call'), may('call.as', 'name')],
    ask_slash: [
      need('ask_slash.question', 'text'),
      may('ask_slash.shape', 'choice', undefined, SHAPES),
      may('ask_slash.choices', 'list'),
      may('ask_slash.about', 'list', 'field'),
      need('ask_slash.as', 'name'),
    ],
    ask_person: [need('ask_person.question', 'text'), need('ask_person.options', 'list'), may('ask_person.to', 'text', 'person'), need('ask_person.as', 'name'), may('ask_person.wait', 'span')],
    wait: [need('wait', 'span')],
    meet: MEET_ARGS,
    run_job: RUN_JOB_ARGS,
    tag: [need('tag', 'text')],
    untag: [need('untag', 'text')],
    set: [need('set.field', 'text', 'field'), need('set.to', 'text')],
    move: [need('move', 'text')],
    link: [
      may('link.field', 'text', 'field'),
      may('link.to.register', 'text', 'list'),
      of(may('link.to.by', 'text', 'field'), 'link.to.register'),
      need('link.to.value', 'text'),
      may('link.to.where', 'condition'),
      of(may('link.to.take', 'text', 'field'), 'link.to.register'),
      of(may('link.to.also', 'text', 'field'), 'link.to.register'),
    ],
    note: [need('note', 'text')],
    notify: [need('notify.say', 'text'), may('notify.because', 'text'), may('notify.tone', 'text'), may('notify.urgent', 'boolean')],
    schedule: [need('schedule.in', 'later'), need('schedule.note', 'text'), may('schedule.kind', 'text')],
    create: [may('create.register', 'text', 'list'), of(may('create.each', 'list', 'field'), 'create.register'), need('create.bound', 'number'), may('create.fields', 'map')],
    suggest: [need('suggest.question', 'text'), may('suggest.options', 'list')],
    run: [need('run', 'text', 'call')],
    stop: [may('stop', 'true')],
  };
  tables = { TRIGGER_ARGS, STEP_ARGS };
  return tables;
}

/** Somebody named, by any of these: `stepFault`'s `meet` case. An organisation may be named by its domain too. */
const MEET_WHO: readonly string[] = ['meet.name', 'meet.email', 'meet.handle', 'meet.keys'];

/** The grammar, in the lint's own order: triggers as `TRIGGERS` lists them, steps as `VERBS` does. */
export function flowGrammar(): FlowGrammar {
  const { TRIGGER_ARGS, STEP_ARGS } = argTables();
  return {
    triggers: TRIGGERS.map((id) => ({ id, args: TRIGGER_ARGS[id] })),
    steps: (VERBS as readonly Verb[]).map((verb) => ({
      verb,
      group: (ACTIONS as readonly string[]).includes(verb) ? ('action' as const) : ('flow' as const),
      row: ROW_VERBS.includes(verb),
      once: ONCE.includes(verb),
      args: STEP_ARGS[verb],
      ...(verb === 'meet' ? { oneOf: MEET_WHO } : {}),
    })),
    ceilings: { steps: STEP_CEILING, depth: DEPTH_CEILING, runsPerDay: RUNS_PER_DAY_CEILING, vars: VARS_CEILING },
  };
}
