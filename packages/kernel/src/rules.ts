/**
 * Rules: a declaration that says what happens when a row looks a certain way.
 *
 * A RULE IS A DOCUMENT, NOT CODE. `when: state is open, due before today` and `then: tag: late` —
 * which is the whole difference between a product whose behaviour a person can read and one whose
 * behaviour is somewhere in a repository they do not have. It also means an agent can write one,
 * and that the record can say what a rule WOULD do before anybody turns it on.
 *
 * IT RUNS INSIDE THE WRITE'S OWN TRANSACTION, and every write it makes re-enters the write path at
 * the top: coercion, required fields, immutability, transitions and permissions all apply again. A
 * rule is not a way around the record's rules; it is a caller like any other, wearing its own name.
 *
 * AND IT DOES NOT CASCADE. A rule's write runs with the rules pass turned off, so one rule cannot
 * trigger another and nothing here can loop. Every product that allowed it grew a depth limit and
 * then a graph explorer to explain the depth limit; the answer is that a rule is one step.
 *
 * ONE `set` PER FIELD PER PASS, and the FIRST rule wins. Two rules setting one field is a
 * disagreement somebody has to resolve, and resolving it by running both leaves whichever ran last
 * — an order nobody declared. The loser is named in the dry run rather than silently dropped.
 *
 * `once_per` IS A SCHEDULE ROW, because that table already has exactly-once as a unique index. A
 * rule that notifies without one notifies on every write of the row it is about, which is how a
 * person learns to ignore the product.
 */

import type { Refusal, Result, Sql } from '@braindog/ports';
import { ok, refused } from '@braindog/ports';
import { jsonPath, compile, isColumn, QUANTIFIERS, type Compiled, type Predicate, type Schema } from '@braindog/where';

import type { Entry } from './index.ts';
import { exponentOf, moneyText } from './ingest.ts';
import { fold } from './ingest.ts';
import { sealedEver } from './declare.ts';
import { instant } from './migrate.ts';
import { spanMs } from './keychain.ts';
import { evaluateMetric, predicateOf, type Aggregation, type EvalContext, type MetricDecl } from './metrics.ts';
import { isMoneyFormat } from './metrics.ts';
import { inlineFault, rowlessCreate } from './flow-lint.ts';
import { alsoFault, linkFault, whereFields } from './rule-link.ts';

export { alsoFault, linkFault };
import { FIGURE } from './figure.ts';
import { observe } from './observe.ts';

/**
 * Where a `link` looks: the list, the field its rows are found by, and the text to find.
 *
 * `where` FILTERS THE ROWS THAT MAY BE FOUND, on every rung and before ties are counted. It is a filter over the
 * LINKED list, written as a filter object, and a text in it is filled from the row being linked, so
 * `{ field: direction, in: ['{{direction}}', either] }` asks for a category that goes the way this row goes. A value
 * the row does not hold is left out of an `in`, and a test on it alone is true of no row (of every row, for `not`).
 *
 * `take` NAMES A FIELD OF THE ROW FOUND, and what that field holds is linked in the row's place: a filing rule is
 * found by its text and the ledger row is given the rule's category. A row found that holds nothing there links
 * nothing, and neither does one that points at a row deleted or in a state its own list calls done (`done:`).
 *
 * `also` NAMES A SECOND FIELD OF THE ROW BEING LINKED, and the row found is written there beside what was taken from
 * it: the ledger row is given the rule's category and, in `also`, the rule that filed it. BOTH OR NEITHER. Two steps
 * were two lookups, and the one with no `take` never asked about the category, so a rule whose category was retired
 * was still written as the rule that filed the row. It is for a link that takes, and the field is a ref to the linked
 * list (`alsoFault`).
 */
export type LinkTo = { register: string; by: string; value: string; where?: Predicate; take?: string; also?: string };

export type RuleAction =
  | { tag: string }
  | { untag: string }
  | { set: { field: string; to: string } }
  | { move: string }
  | { link: { field: string; to: LinkTo } }
  | { note: string }
  | { notify: { say: string; tone?: string; urgent?: boolean } }
  /**
   * Come back to this row later. `07 §6`'s fourth shape, and the one that was missing.
   *
   * IT INSTALLED, MATCHED, AND WAS DROPPED. `RuleAction` did not carry it and the dispatch chain's
   * `if / else if` had no arm for it, so a rule declaring `{ schedule: { in: 14d, note: "check
   * again" } }` fired, did nothing, and did not even appear in `RulesOutcome.fired` — which is the
   * one place somebody would look to find out whether it had.
   *
   * IT IS THE ONLY ACTION THAT REACHES FORWARD IN TIME, which is why it earns its own schedule row
   * rather than a field on the entry: "chase this in a fortnight" is a thing the record does, and a
   * date in a field is a thing somebody has to notice.
   */
  | { schedule: { in: string; kind?: string; note: string } }
  /**
   * A matrix of rows from one row — a size run, a rate card, a schedule of instalments.
   *
   * `bound` IS MANDATORY AND IS THE WHOLE ARGUMENT. A generator with no ceiling is how a rules
   * engine fills a ten-gigabyte object overnight, and the ceiling has to be declared rather than
   * derived because the record cannot know how many colours somebody will add next season.
   */
  | { create: { register: string; each?: string[]; bound: number; fields: Record<string, string> } }
  /** A question for a person, through the gate. It changes nothing by itself. */
  | { suggest: { question: string; options: string[] } }
  /**
   * Queue one run of a declared `call`, sending the fields of this row that the call's `sends:` names.
   *
   * A RULE NAMES AN ACTION, NEVER AN ADDRESS. The host, the key and the fields were declared on the call and approved
   * when it was installed, so a rule can reach nothing the owner did not already see. `once_per` is mandatory, as it
   * is on `notify`, and each action makes at most `RULE_CALLS_PER_DAY` of these a day.
   */
  | { run: string }
  | { stop: true };

/**
 * What starts an automation.
 *
 * ABSENT MEANS `written`, WHICH IS WHAT EVERY RULE MEANT BEFORE THIS TYPE EXISTED. That is the whole reason an automation
 * is a rule that grew a trigger rather than a ninth kind: the rules already installed in somebody's record are
 * automations the canvas can open, with no migration and no second engine doing the same job.
 *
 * ONE KEY, and `every` is the only one with companions (`at`, `day`, `month`, `late`). A body naming two triggers is
 * refused rather than read as "either", because nothing downstream could say which one started a run.
 *
 * `day` IS A WEEKDAY ON A WEEKLY CLOCK AND A DAY OF THE MONTH ON A CLOCK OF MONTHS (`every: 1mo`, `3mo`, `1y`): `mon` to
 * `sun` there, and 1 to 31 or `last` here, which is why it is a number or a word. `month` is the month a clock of more
 * than one month counts from (`clock.ts`). `late` is a span: a turn the drain reaches later than that after it was due
 * is recorded as skipped and not taken (`flow.ts`'s `onClock`).
 *
 * `metric` STARTS A RUN WHEN ITS FIGURE CHANGES SIDE of the line `crosses` draws (`target` is the figure's own), read by
 * the hourly sweep. `decided` starts one when a question in Decide is decided: `about` narrows it to the questions one
 * declaration filed or proposes, and `option` to one answer, by its id or its words.
 */
export type Trigger =
  | { written: { register: string; op?: ('create' | 'update' | 'delete')[]; fields?: string[]; from_rules?: boolean } }
  | { arrival: { ingest?: string; channel?: 'webhook' | 'email' | 'paste' | 'api' | 'pull'; state?: string[] } }
  | { every: string; at?: string; day?: string | number; month?: string; late?: string }
  | { metric: { id: string; crosses: 'target' | { lte: number } | { gte: number } } }
  | { decided: { about?: string; option?: string } }
  | { manual: true };

/**
 * One step of an automation: a branch, a transform, something that waits, or any action a rule already has.
 *
 * EVERY STEP IS A CLOSED VERB THAT NAMES A DECLARATION, never an address and never code. `call` names a declared call
 * whose host, key and fields were approved at install, and `script` names a `script.<id>` whose runtime lives
 * elsewhere; that is what keeps 04 §7's security argument an enumeration over closed lists.
 */
export type Step =
  | { if: Predicate | string; then: Step[]; else?: Step[] }
  | { set_var: { name: string; to: string } }
  | { script: { id: string; input?: Record<string, string>; as: string } }
  | { call: { ingest: string; as?: string } }
  | { ask_slash: { question: string; about?: string[]; as: string; shape?: 'text' | 'number' | 'choice'; choices?: string[] } }
  | { ask_person: AskPerson }
  | { wait: string }
  | RuleAction;

/**
 * What a question an automation puts to a person asks for (`ask_person`'s `shape`). ABSENT IS `choice`, which is what
 * every `ask_person` meant before the shape existed, so a rule already installed asks as it did.
 */
export type AskShape = 'choice' | 'amount' | 'number' | 'text' | 'date';

/** The shapes `ask_person` takes, in the order the card form offers them. */
export const ASK_SHAPES: readonly AskShape[] = ['choice', 'amount', 'number', 'text', 'date'];

/** The most a `text` answer holds, in characters. A line, not a document. */
export const ASK_TEXT_CHARS = 500;

/**
 * A question an automation puts to a person, opened in Decide (`flow.ts`'s `ask`), and what the answer is kept as under
 * `as` (`flow.ts`'s `answerStep`).
 *
 * `options` ARE THE ANSWERS OF A `choice`, AND ONLY OF ONE: at least two, each once. Any other shape is answered by
 * typing, and its answer is held to the shape when it comes back, a wrong one refused to the person with a sentence
 * while the run keeps waiting.
 *
 * `amount` IS KEPT AS MONEY, `{ amount: <integer minor units>, currency }`, read as `{{vars.x.amount}}` and
 * `{{money:vars.x}}`. `currency` is a code (`EGP`) or the row's own, `{{trigger.row.<field>}}`, read when the question
 * is asked and filed with it; without one the answer has to say its code. An answer in another currency is refused,
 * never converted. `number` is kept as a number, `date` as `YYYY-MM-DD`, `text` as its words, `ASK_TEXT_CHARS` at most.
 */
export type AskPerson = {
  question: string;
  shape?: AskShape;
  options?: string[];
  currency?: string;
  as: string;
  to?: string;
  wait?: string;
};

/**
 * A rule as the inline pass reads it: a register, a condition and a flat list of actions.
 *
 * `register` AND `then` STAY REQUIRED HERE, because this is the shape `runRules`, `dryRun` and `applyRule` walk, and
 * `flow-lint.ts`'s `pathOf` answers `inline` only for a body that has both. The wider shape a person or an agent may
 * declare is `FlowDecl` below; a body of that shape that is not inline never reaches the pass, since the pass selects
 * rules by their top-level `register` and the lint refuses one on a body that runs as a run.
 */
export type RuleDecl = {
  rule: string;
  register: string;
  when?: string | Predicate;
  then: RuleAction[];
  /** Lower runs first. The default is a hundred, so a pack's rules sit either side of yours. */
  priority?: number;
  /** Which tuple makes this rule's firing unique. Mandatory on `notify`, `create` and `suggest`. */
  once_per?: string[];
  /** What the canvas card says. The id when absent. */
  name?: string;
  /** Absent is `{ written: { register } }`, today's meaning. */
  on?: Trigger;
  /** Exclusive with `then`. */
  steps?: Step[];
  /** A scopes-register row id, as `ActionDecl.project`. Absent is global. */
  project?: string;
  /** Default true. False keeps the version and stops it triggering. */
  enabled?: boolean;
  /** Under ceilings the kernel holds: a declaration can lower them and never raise them. */
  limits?: { runs_per_day?: number; steps_per_run?: number };
};

/** A rule body as it may be declared: `register` is required only on the inline path, and `steps` may stand for `then`. */
export type FlowDecl = Omit<RuleDecl, 'register' | 'then'> & { register?: string; then?: RuleAction[] };

export type Fired = {
  entry: Entry;
  register: string;
  batch: string;
  actor: string;
  /**
   * A run's own paths, where a step of a run is acting through the pass (`flow.ts`'s `act`). The pass then fills them
   * in the same `replace` as the row's fields, so nothing the run wrote is filled again (`filling`). Absent on the
   * inline path, where `{{trigger.…}}` is left as typed.
   */
  run?: RunFill;
};

export type RulesOutcome = {
  fired: { rule: string; actions: string[] }[];
  /** Refusals a rule's own write earned. The triggering write is never undone by one. */
  refused: Refusal[];
  suppressed: string[];
  stopped: boolean;
  /**
   * Every `run` the pass reached, with what became of it: queued, held at the day's ceiling, paused, unknown, or
   * `skipped` where the pass queues no calls at all, which is a bulk apply over rows that were already there.
   */
  calls: { rule: string; ingest: string; outcome: 'queued' | 'held' | 'paused' | 'unknown' | 'skipped'; say: string }[];
};

export type RulesDeps = {
  /**
   * Send one interrupt, if the record has not already had one this hour. `09 §4`.
   *
   * INJECTED, because routing a notification is `digest.ts`'s — it knows what a channel is — and
   * this file is the rule engine. A second copy of the rate limit here would be a second answer to
   * "have we interrupted this person already", and the two would disagree on the day it mattered.
   */
  interrupt: (said: { actor: string; say: string; because?: string; url?: string }) => void;
  /**
   * Arm one `rule` schedule row: come back to this row at that time.
   *
   * KEYED BY THE RULE AND THE ROW, so a rule that fires twice on one row moves the date rather than
   * arming a second reminder — the same idempotence `once_per` gives the firing, applied to the
   * thing the firing arms.
   */
  later: (key: string, atMs: number, payload: unknown) => void;
  sql: Sql;
  rules: (register: string) => RuleDecl[];
  schemaOf: (register: string) => Schema | null;
  /**
   * Which field a register calls its state, or `null` where it has none.
   *
   * `move` WROTE THE LITERAL KEY `state`. A register may call it anything — the seed's projects call
   * it `lane` — and writing `patch.state` on one of those was a silent no-op: the row did not move,
   * the version did not change, and the receipt reported `move live` while the dry run previewed it.
   */
  stateOf: (register: string) => string | null;
  /** The states a list calls finished (`done:`), or none. A `take` links no row its own list calls done. */
  doneOf: (register: string) => readonly string[];
  ctx: EvalContext;
  /** The write path, re-entered. `cascade: false` is what makes a rule one step. */
  write: (register: string, spoken: string | null, patch: Record<string, unknown>, actor: string, batch: string) => Result<Entry>;
  note: (entry: Entry, actor: string, text: string, batch: string) => void;
  /** A generated row: the write path again, with the kernel's own `_rule`/`_parent`/`_each` stamped on. */
  generate: (
    register: string,
    patch: Record<string, unknown>,
    actor: string,
    batch: string,
    stamp: Record<string, string>,
  ) => Result<Entry>;
  /**
   * A question through the gate. It writes a suggestion and changes nothing else.
   *
   * `about` IS THE ROW THE QUESTION IS ABOUT, as `<register>#<seq>` (or the row's id where it has no number), kept on the
   * suggestion's body. Decide's queue reads it (`pages.ts`'s `QueueQuestion.about`), and a run a `decided` trigger starts
   * from the answer reads that row as `{{trigger.row.<field>}}`. Absent for a question no row asked.
   */
  suggest: (question: string, options: string[], actor: string, about?: string) => Result<{ id: string }>;
  /**
   * The project a row belongs to, by its list's scope field, or `null` for a global row. The inline pass reads it for a
   * rule that says `project:`; a caller without it runs no such rule, since a row it cannot place is not the project's.
   */
  projectOf?: (entry: Entry) => string | null;
  schedule: (key: string, payload: unknown, pending: boolean) => boolean;
  /**
   * Queue one call a rule runs (`actions.ts`'s `queueCall`), or leave it out.
   *
   * ABSENT IS DELIBERATE. `applyRule` runs a rule over rows that are already there, and a bulk apply never queues a call:
   * five thousand old invoices are not five thousand posts. The pass counts what it did not queue and says so.
   */
  call?: (ingest: string, fired: { rule: string; entry: Entry; schema: Schema }) => { ingest: string; outcome: 'queued' | 'held' | 'paused' | 'unknown'; say: string };
  /** One row by its id, hydrated — what a dry run walks without writing anything. */
  entry: (id: string) => Entry | null;
  mint: () => string;
  nowMs: number;
  /**
   * WHO A RULE ACTS FOR, BY THE RULE: `null` where it runs as the record does, its maker an owner
   * or nobody; `stop` with the sentence a rule is held by once its maker can no longer reach the record; else the
   * dependencies of its maker's lens (`deps`, writes held to the rows they may change, `bounded` set) and whether a row
   * is one that lens shows them (`sees`). Absent, every rule runs as the record does.
   */
  forRule?: ((rule: string) => { stop: string } | { deps: RulesDeps; sees: (entry: Entry) => boolean } | null) | undefined;
  /**
   * Set on the dependencies of a rule its maker's lens bounds: the sentence a step that reaches past the rows they may
   * read and change is refused in (a link found in another list, a call out of the record).
   */
  bounded?: string | undefined;
};

/**
 * The order rules run in.
 *
 * PRIORITY, THEN THE LONGEST LITERAL, THEN THE ID. The middle one is the interesting one: between
 * two rules of equal priority, the more SPECIFIC should win, and the length of the longest string a
 * rule matches on is a good enough proxy for specificity to be worth having — `provider is Fenwick
 * Cloud` beats `state is live` without anybody having to number them.
 */
export function order(rules: readonly RuleDecl[]): RuleDecl[] {
  const literal = (r: RuleDecl): number => {
    const text = typeof r.when === 'string' ? r.when : JSON.stringify(r.when ?? '');
    return Math.max(0, ...text.split(/\s+|,/).map((w) => w.length));
  };
  return [...rules].sort(
    (a, b) => (a.priority ?? 100) - (b.priority ?? 100) || literal(b) - literal(a) || a.rule.localeCompare(b.rule),
  );
}

/**
 * Run the rules of one register against one row.
 *
 * ONE PATCH PER RULE, applied through the write path. Building a patch and writing it once is what
 * makes `set` and `move` answer to the same transition checks a person's write does — and what
 * makes a rule's refusal a refusal rather than a half-applied row.
 */
export function runRules(deps: RulesDeps, fired: Fired): RulesOutcome {
  const out: RulesOutcome = { fired: [], refused: [], suppressed: [], stopped: false, calls: [] };
  const schema = deps.schemaOf(fired.register);
  if (!schema) return out;

  /* ONE `set` PER FIELD PER PASS, ACROSS RULES. The set is here rather than inside the loop because
     the rule that wins is the first one to reach the field, and a per-rule set would let the second
     one overwrite it. */
  const setFields = new Set<string>();
  /* THE FIELDS OF THIS LIST THAT NEVER LEAVE THE RECORD, read once the first text asks and kept for every rule after. */
  let sealed: Set<string> | null = null;
  const sealedHere = (): Set<string> => (sealed ??= sealedOf(deps.sql, fired.register));

  const outer = deps;
  for (const rule of order(outer.rules(fired.register))) {
    /* A RULE A COLLEAGUE TURNED ON RUNS THROUGH THEIR LENS, NEVER THE OWNER'S: its writes are held
       to the rows they may change, a row they may not see does not start it, and once they can no longer reach the
       record it is held, with an observation saying so. */
    const held = outer.forRule?.(rule.rule) ?? null;
    if (held !== null && 'stop' in held) {
      out.suppressed.push(rule.rule);
      observe(outer.sql, outer.nowMs, [{ kind: 'write.refused', subject: `${fired.register}.rule.${rule.rule}.maker:FORBIDDEN` }]);
      continue;
    }
    if (held !== null && !held.sees(fired.entry)) continue;
    /* THE REST OF THE PASS READS THIS RULE'S OWN DEPENDENCIES under the parameter's name. */
    const deps = held === null ? outer : held.deps;
    /* THE THREE KEYS THE LINT USED TO REFUSE HERE, READ. `enabled: false` stops the rule, `project:` holds it to one
       project's rows, and `limits.runs_per_day` to that many firings in the last twenty-four hours, as a run's is
       counted. Before this the lint refused all three on the inline path as `NOT_IN_THIS_BUILD`, so a plain write rule
       could be retired and never switched off. */
    if (rule.enabled === false) continue;
    if (rule.project !== undefined && (deps.projectOf?.(fired.entry) ?? null) !== rule.project) continue;
    if (!matches(deps, schema, rule, fired.entry)) continue;
    const perDay = rule.limits?.runs_per_day;
    if (perDay !== undefined && firedToday(deps, rule.rule) >= perDay) {
      out.suppressed.push(rule.rule);
      observe(deps.sql, deps.nowMs, [{ kind: 'write.refused', subject: `${fired.register}.rule.${rule.rule}.limits.runs_per_day:OUT_OF_BOUNDS` }]);
      continue;
    }

    /* THE MARKER IS CLAIMED FIRST AND KEPT LAST. Claimed here, because the schedule table's unique
       index is what makes "once" hold against two passes at once and a second mechanism would be a
       second thing that can disagree with the first — and released below if the write is refused,
       because a rule that could not do anything has not fired. */
    /* THE THREE THAT MUST BE ONCE. A `notify` on every write is how a person learns to ignore the
       product; a `create` on every write is the same failure with a worse consequence; and a
       `suggest` on every write fills the gate with the same question. */
    const then = Array.isArray(rule.then) ? rule.then : [];
    const wants = then.some((a) => 'notify' in a || 'create' in a || 'suggest' in a || 'run' in a);
    const key = onceKey(rule, fired.entry);
    if (key !== null) {
      /* `false`, ALWAYS: the marker is a CLAIM and not a job. Inserting it `pending` because the
         rule notifies made the drain claim it, find no `rule` handler, and dead-letter it into a
         system suggestion reading "Nothing in this record handles a rule row" — one per firing, for
         the customer to dismiss. Exactly-once is the unique index on `(kind, key)`, and nothing
         about it needs a turn. */
      if (!deps.schedule(key, { rule: rule.rule, entry: fired.entry.id, batch: fired.batch }, false)) {
        out.suppressed.push(rule.rule);
        continue;
      }
    } else if (wants) {
      /* A `notify` WITHOUT `once_per` NOTIFIES ON EVERY WRITE of the row it is about, which is how
         a person learns to ignore the product. Refused here rather than at install too, because a
         declaration can arrive from a file that was written against an older build. */
      out.refused.push({
        code: 'REQUIRED_MISSING',
        fix: `${rule.rule} notifies and declares no once_per, so it would fire on every write of the row.`,
        at: 'once_per',
      });
      continue;
    }

    const patch: Record<string, unknown> = {};
    const did: string[] = [];
    /* A NOTICE, NOT A STRING. `urgent` was declared, printed in the install diff as "interrupts
       you", and then flattened into the same list a plain `note` goes in — so a rule saying
       "Payment failed" wrote an event and nothing left the record. 09 §4: `true` interrupts. */
    const notes: { text: string; urgent: boolean }[] = [];
    /* HELD LIKE THE NOTES ARE, until the write has happened. A rule whose write the register then
       refuses has not done anything, and a reminder about what it did not do is worse than silence. */
    const later: { in: string; note: string }[] = [];
    const made: { register: string; each?: string[]; bound: number; fields: Record<string, string>; at: string }[] = [];
    const asks: { question: string; options: string[]; at: string }[] = [];
    const runs: string[] = [];
    let stop = false;

    /* A STEP LEFT UNDONE SAYS SO, WHERE IT CAN BE READ. The inline pass's own outcome is dropped by the write, so the
       sentence goes two ways: into `refused`, which a bulk apply hands back and a run fails on; and into one
       `write.refused` observation under the list, since that is the trace a person's refused write leaves too. */
    const undone = (at: string, code: 'NOT_IN_THIS_BUILD' | 'DECLARATION_INVALID', fix: string): void => {
      out.refused.push({ code, fix, at });
      observe(deps.sql, deps.nowMs, [{ kind: 'write.refused', subject: `${fired.register}.rule.${rule.rule}.${at}:${code}` }]);
    };
    const notText = (at: string, word: unknown, what: string): void => {
      const shown = typeof word === 'number' || typeof word === 'boolean' ? String(word) : word === undefined ? 'missing' : JSON.stringify(word);
      undone(
        at,
        'DECLARATION_INVALID',
        `rule.${rule.rule}'s ${at} is ${shown}, and ${what} is written as text. The rule was stored before install refused that, so this step was left out of what the rule wrote.`,
      );
    };
    /* A TEXT THE PASS FILLS, FILLED ONCE, AND REFUSED WHERE IT WOULD CARRY A SECRET OUT. The lint refuses such a text at
       install (`flow-lint.ts`, `copyFault`); this is the second line, for a rule stored before it did, and the only one
       for a run's step, whose values exist only at the run. Measured at HEAD `afb3b1b2` with such a rule written into
       the table, inline and as a run: `note`, `notify`, `schedule` and `suggest` wrote `x hunter2` into the note event,
       the schedule and the question queue. `null` means the step is left out. */
    const said = (text: unknown, at: string, what: string): string | null => {
      const got = filling(text, fired.entry, deps.nowMs, { sealed: sealedHere(), ...(fired.run ? { run: fired.run } : {}) });
      if (got.secret === null) return got.text;
      undone(at, 'DECLARATION_INVALID', copied(rule.rule, got.secret, what));
      return null;
    };

    for (const [i, action] of then.entries()) {
      /* A VERB ONLY A STEP HAS IS NOT ACTED ON, NOR IS WHAT SITS BESIDE IT. `inlineFault` refuses one at install, and a
         body stored before that lint still reaches here: measured, `{ if: 'what is Nothing', then: [], set: note }` set
         the note on a row the condition excluded, because the chain below takes the first action an item carries, and
         `{ wait: 1h, set: note }` wrote the note at once. The lint is asked of the one item, so the pass and the
         install cannot disagree about which verbs those are. */
      const step = inlineFault(`rule.${rule.rule}`, { ...rule, then: [action] } as FlowDecl);
      if (step?.code === 'NOT_IN_THIS_BUILD') {
        const here = `then[${i}]`;
        undone(step.at?.replace('then[0]', here) ?? here, 'NOT_IN_THIS_BUILD', step.fix.replace('then[0]', here));
        continue;
      }
      /* A TAG OR A MOVE THAT IS NOT TEXT IS LEFT OUT OF THE PATCH, since the list refuses it and the rule's whole patch
         went with it: a stored `tag: 5` and `move: 5` each left the Water row without the `set` beside them. No `fill`
         reads either word, so neither has `fill`'s guard. The verb is found in the chain's own order, so the word asked
         about is the one the chain below would act on. */
      const verb = 'tag' in action ? 'tag' : 'untag' in action ? 'untag' : 'set' in action ? 'set' : 'move' in action ? 'move' : null;
      const word = verb === 'tag' || verb === 'untag' || verb === 'move' ? (action as Record<string, unknown>)[verb] : '';
      if (typeof word !== 'string') {
        notText(`then[${i}].${verb}`, word, verb === 'move' ? "a move's state" : 'a tag');
        continue;
      }
      /* FROM THE PATCH IF THIS RULE HAS ALREADY TOUCHED IT, and from the row otherwise. Each branch
         rebuilt the set from the row's PRE-WRITE tags, so `then: [{ tag: late }, { tag: chase }]`
         kept only `chase` — while `did` reported both and the dry run previewed both, which is a
         preview promising a tag the pass does not apply. */
      if ('tag' in action) {
        const tags = new Set(asList(patch.tags ?? fired.entry.fields.tags));
        tags.add(action.tag);
        patch.tags = [...tags];
        did.push(`tag ${action.tag}`);
      } else if ('untag' in action) {
        const tags = new Set(asList(patch.tags ?? fired.entry.fields.tags));
        tags.delete(action.untag);
        patch.tags = [...tags];
        did.push(`untag ${action.untag}`);
      } else if ('set' in action) {
        /* THE EARLIER RULE WON, and this one says so rather than overwriting. */
        if (setFields.has(action.set.field)) continue;
        /* A `set` IS FILLED ONCE AND REFUSED WHERE IT WOULD COPY A SECRET INTO A FIELD THAT MAY LEAVE, as every other
           text here is (`said`), unless the field it writes never leaves either. The lint refuses it at install
           (`flow-lint.ts`, `writeFault`); this is the second line, for a rule stored before it did and for a run's
           step. An earlier build left the `set` out and wrote the copy, holding it back from what leaves (`queueCall`'s
           second line, a run's `-unsent`), because four test files stored such a copy to reach those lines. Measured at
           HEAD `b7409d2d`: `set: { field: memo, to: 'x {{pin}}' }` stored past the lint wrote `x hunter2` into `memo`,
           which every reader of the list sees. The field is left unclaimed, so a later rule may still set it. */
        const to = sealedHere().has(action.set.field)
          ? filling(action.set.to, fired.entry, deps.nowMs, fired.run ? { run: fired.run } : {}).text
          : said(action.set.to, `then[${i}].set.to`, `${action.set.field}, which every reader of ${fired.register} sees`);
        if (to === null) continue;
        setFields.add(action.set.field);
        patch[action.set.field] = to;
        did.push(`set ${action.set.field}`);
      } else if ('move' in action) {
        /* `move` IS A `set` OF THE STATE FIELD, and claiming the field is what stops two rules
           writing it. It bypassed `setFields` entirely, so two rules that both `move` both wrote and
           the last one won — the outcome this file's header calls "an order nobody declared" — while
           `fired` reported both and nothing appeared as suppressed. */
        /* THE REGISTER'S OWN STATE FIELD, not the literal word. A register may call it anything —
           the seed's projects call it `lane` — and writing `patch.state` on one of those was a
           SILENT NO-OP: the row did not move, the version did not change, and `did` reported
           `move live` while the dry run previewed it. Claiming the literal key had the same shape of
           bug in the other direction, so a `set` on `lane` and a `move` did not collide. */
        const field = deps.stateOf(fired.entry.register);
        if (!field) continue;
        if (setFields.has(field)) continue;
        setFields.add(field);
        patch[field] = action.move;
        did.push(`move ${action.move}`);
      } else if ('link' in action) {
        /* EXACTLY ONE MATCH OR NOTHING. Two rows bearing the name is a question about which, and a
           rule that picked one would pick a different one next week. The row is found by the ladder
           (`linkOf`), the one read the dry run below makes too, so what it previews is what this links. */
        const value = said(action.link.to.value, `then[${i}].link.to.value`, 'the value it links by');
        if (value === null) continue;
        /* A FILTER OR A `take` OVER A FIELD THE LINKED LIST DOES NOT HAVE LINKS NOTHING AND SAYS SO, for a rule stored
           before anything refused it. Unfiltered, it would file under the very rows the rule ruled out. */
        const fault = linkFault(deps.schemaOf, { rule: rule.rule, then: [action] }) ?? alsoFault(deps.schemaOf, { rule: rule.rule, register: rule.register, then: [action] });
        if (fault) {
          undone((fault.at ?? 'then[0]').replace('then[0]', `then[${i}]`), 'DECLARATION_INVALID', fault.fix.replace('then[0]', `then[${i}]`));
          continue;
        }
        /* A LINK FOUND IN ANOTHER LIST READS THAT LIST WHOLE, so a rule bound to a colleague's lens does not take one. */
        if (deps.bounded !== undefined) {
          out.refused.push({ code: 'FORBIDDEN', fix: deps.bounded, at: `then[${i}].link` });
          continue;
        }
        const run = fired.run ? { run: fired.run } : {};
        const found = linkOf(deps, linkTo(action.link.to, fired.entry, (text) => filling(text, fired.entry, deps.nowMs, run).text), value);
        if ('id' in found) {
          patch[action.link.field] = found.id;
          did.push(`link ${action.link.field}`);
          /* THE ROW FOUND, BESIDE WHAT WAS TAKEN FROM IT, and only here: a take that links nothing writes neither. */
          if (action.link.to.also !== undefined) {
            patch[action.link.to.also] = found.row;
            did.push(`link ${action.link.to.also}`);
          }
        }
      } else if ('note' in action) {
        /* HELD UNTIL THE WRITE HAS HAPPENED. A rule whose write the register then refuses has not
           done anything, and a notification about what it did not do is worse than silence. */
        const text = said(action.note, `then[${i}].note`, 'a note');
        if (text === null) continue;
        notes.push({ text, urgent: false });
        did.push('note');
      } else if ('notify' in action) {
        const text = said(action.notify.say, `then[${i}].notify.say`, 'a notification');
        if (text === null) continue;
        notes.push({ text, urgent: action.notify.urgent === true });
        did.push('notify');
      } else if ('schedule' in action) {
        const note = said(action.schedule.note, `then[${i}].schedule.note`, 'a reminder');
        if (note === null) continue;
        later.push({ in: action.schedule.in, note });
        did.push(`schedule ${action.schedule.in}`);
      } else if ('create' in action) {
        made.push({ ...action.create, at: `then[${i}]` });
        did.push(`create in ${action.create.register}`);
      } else if ('suggest' in action) {
        asks.push({ ...action.suggest, at: `then[${i}]` });
        did.push('suggest');
      } else if ('run' in action) {
        /* HELD UNTIL THE WRITE HAS HAPPENED, like a note: a call about a row the register then refused is a post
           about something that is not in the record. */
        runs.push(action.run);
        did.push(`run ${action.run}`);
      } else if ('stop' in action) {
        stop = true;
      }
    }

    if (Object.keys(patch).length > 0) {
      /* RE-ENTRANT, and that is the point: `immutable_when`, a transition the register forbids, a
         required field — all of them apply to a rule exactly as they apply to a person. A refusal is
         collected and the pass continues; the triggering write is never undone by a rule's refusal.

         AND IT NAMES THE ROW BY ITS OWN ID. `<register>#<seq>` is not a name a SERIES row has — its
         `seq` is null — and passing null asked the write path to CREATE, so a rule on a series
         register left the row it fired on untouched and made a second one holding only the patch. */
      const wrote = deps.write(fired.register, fired.entry.id, patch, `rule:${rule.rule}`, fired.batch);
      if (!wrote.ok) {
        if (refused(wrote)) out.refused.push(wrote.refusal);
        /* THE MARKER GOES BACK. Keeping it would mark a rule that did nothing as having fired for
           this row for ever — fix the data and it never runs again, with no signal anywhere. */
        if (key !== null) deps.sql.exec("DELETE FROM schedule WHERE kind = 'rule' AND key = ?", key);
        continue;
      }
      fired.entry = wrote.value;
    }

    for (const one of later) {
      const span = spanMs(one.in);
      /* A SPAN THIS RECORD CANNOT READ IS NOT A SILENT NOTHING. `install` refuses one, so reaching
         here means a rule written by an older build — and the row it would have chased is exactly the
         row somebody is trusting it to chase. */
      if (span === null) continue;
      deps.later(`${rule.rule}:${fired.entry.id}`, deps.nowMs + span, {
        entry: fired.entry.id,
        register: fired.entry.register,
        rule: rule.rule,
        note: one.note,
      });
    }

    for (const one of notes)
      /* AN URGENT ONE GOES THROUGH THE ROUTER, which writes the same event and then interrupts —
         once an hour per record, 09 §4. A plain one is the event and nothing else, which is what
         "batch by default" means: it lands in the digest. */
      /* IT OPENS THE ROW'S LIST (`/r/<list>`), a path a push may carry (`PUSH_OPEN`), where `/<id>` was none and every
         such push opened Today; and the list says its kind, so a bill's notice is `money` (`pushKindOf`). */
      if (one.urgent) deps.interrupt({ actor: `rule:${rule.rule}`, say: one.text, url: `/r/${fired.entry.register}` });
      else deps.note(fired.entry, `rule:${rule.rule}`, one.text, fired.batch);

    /* THE EXPANSION IS LAST, and it shares the triggering write's batch — so "undo this expansion"
       is one query rather than an archaeology of timestamps. */
    let happened = Object.keys(patch).length > 0 || notes.length > 0 || later.length > 0;
    for (const spec of made) {
      const grown = expand(deps, rule.rule, spec, { entry: fired.entry, parent: fired.entry.id, register: fired.register, batch: fired.batch, ...(fired.run ? { run: fired.run } : {}) });
      /* A COPY OF A SECRET IS OBSERVED as the other texts' are (`undone`); a bound or an axis is refused as it was. */
      for (const r of grown.refusals)
        if (r.code === 'DECLARATION_INVALID' && /secret or file field/.test(r.fix)) undone(`${spec.at}.create.${r.at ?? 'fields'}`, 'DECLARATION_INVALID', r.fix);
        else out.refused.push(r);
      if (grown.grew) happened = true;
    }
    for (const ask of asks) {
      /* FILLED AFTER THE WRITE, from the row as the write left it, which is what the question has always read. */
      const question = said(ask.question, `${ask.at}.suggest.question`, 'a question in the queue');
      if (question === null) continue;
      /* AND IT NAMES ITS ROW, so Decide can say which one and a `decided` rule's run can read it. */
      const about = fired.entry.seq === null ? fired.entry.id : `${fired.entry.register}#${fired.entry.seq}`;
      const opened = deps.suggest(question, ask.options, `rule:${rule.rule}`, about);
      if (refused(opened)) out.refused.push(opened.refusal);
      else happened = true;
    }
    for (const ingest of runs) {
      /* NO `call` MEANS A BULK APPLY, which queues nothing and says how many it left. The marker is kept, so the next
         edit of an old row does not send it either: rows that were already there are not news. */
      if (deps.call === undefined) {
        out.calls.push({ rule: rule.rule, ingest, outcome: 'skipped', say: `${ingest} is not run for rows that were already there.` });
        happened = true;
        continue;
      }
      const queued = deps.call(ingest, { rule: rule.rule, entry: fired.entry, schema });
      out.calls.push({ rule: rule.rule, ...queued });
      /* HELD COUNTS AS DONE FOR THIS ROW. The day's ceiling said no once, in a sentence, and a second write of the row
         tomorrow is not the moment to send it. A paused action gives the marker back, so the row can run once resumed. */
      if (queued.outcome === 'queued' || queued.outcome === 'held') happened = true;
      else if (queued.outcome === 'unknown')
        out.refused.push({ code: 'DECLARATION_UNKNOWN', fix: queued.say, at: 'then.run' });
    }

    /* AND THE MARKER GOES BACK IF NOTHING HAPPENED. A `create` whose axis was an empty list, or
       whose bound refused it, kept its marker for ever — so filling in the sizes, or fixing the
       bound, could never take effect. A rule that did nothing has not fired. */
    if (key !== null && !happened) deps.sql.exec("DELETE FROM schedule WHERE kind = 'rule' AND key = ?", key);
    /* A FIRING IS COUNTED ONLY WHERE THE RULE DID SOMETHING, as the marker is kept only then: a rule that did nothing has
       not fired, and should not spend its day on it. */
    if (happened && perDay !== undefined) countFiring(deps, rule.rule, fired.batch);
    /* AND THE STANDING COUNT, on the same condition: "how many rows a rule has filed, and never for one that has not".
       A RUN'S STEP COMES THROUGH HERE TOO (`flow.ts`, with `run` set), and is not counted: the run was counted once
       when it started, and a tried run's steps are not firings at all. */
    if (happened && fired.run === undefined) raiseStat(deps.sql, rule.rule, fired.entry.id, deps.nowMs);

    if (did.length) out.fired.push({ rule: rule.rule, actions: did });
    if (stop) {
      out.stopped = true;
      break;
    }
  }

  return out;
}

/** Does this row look the way the rule says? Compiled, so a rule and a list read the same rows. */
function matches(deps: RulesDeps, schema: Schema, rule: RuleDecl, entry: Entry): boolean {
  const said = predicateOf(rule.when, schema, deps.ctx);
  /* A RULE THAT CANNOT BE READ FIRES ON NOTHING. The other direction — firing on everything — is
     what a broken predicate does when nobody checks it, and a rule that tags every row is a rule
     whose author will not find out for a month. */
  if (said.bad.length) return false;
  const w = compile(said.predicate, schema);
  if (w.bad.length) return false;
  return Boolean(deps.sql.one(`SELECT 1 AS x FROM entry WHERE id = ? AND (${w.sql})`, entry.id, ...w.params));
}

const asList = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : []);

/* ── the row a `link` names ──────────────────────────────────────────────── */

/** The rungs a `link` climbs, in order: the whole value, how it starts, anywhere in it, a pattern it fits. */
type LinkRung = 'exact' | 'starts' | 'contains' | 'pattern';

/** The lower rungs by the number the ladder's SQL orders them on. */
const RUNGS: Record<number, LinkRung> = { 2: 'starts', 3: 'contains', 4: 'pattern' };

/** The most characters of a pattern, and the most characters of the text one is tried against. */
const PATTERN_MAX = 120;
const PATTERN_READS = 512;

/** What a `link` links (`id`), the row it found (`row`, another row where the link takes) and the rung it was found
 *  on, or the sentence saying why it links nothing. */
type Linked = { id: string; row: string; rung: LinkRung } | { none: string };

/**
 * The most rows of the linked list the `starts` and `contains` rungs read for one link, longest first on each rung.
 *
 * A CEILING PER LINK, because the lower rungs cannot be asked of an index: every row that says how it starts or
 * where it appears is read and compared. Past this many, the shortest names on the `contains` rung are the ones never
 * tried.
 */
const LADDER_ROWS = 500;

/** What the dry run adds after `link <field>`, by the rung the row was found on. The whole value adds nothing. */
const RUNG_SAID: Record<LinkRung, string> = { exact: '', starts: ', matched by how it starts', contains: ', matched anywhere in it', pattern: ', matched by a pattern' };

/**
 * The one row whose `by` field names `value`, by the ladder: the whole value, then how it starts, then anywhere in it.
 *
 * THE WHOLE VALUE FIRST, AND AS IT ALWAYS WAS. One row whose `by` equals the value is linked, whatever that row says
 * about how it matches, and two such rows link nothing, which is what every `link` did before the ladder.
 *
 * THEN THE LINKED LIST SAYS HOW EACH ROW MATCHES, in a field named for `by` with `_by` after it (`match` and
 * `match_by`), whose value is `exact`, `starts` or `contains`. A bank writes one shop as `FENWICK CLOUD` on Monday and
 * `FENWICK CLOUD LTD 4471` on Friday, and a category that says `starts` files both. A list that declares no such field
 * is linked by the whole value alone, so no list that links today links differently.
 *
 * THE FIRST RUNG THAT FINDS A ROW DECIDES, AND ON IT THE LONGEST `by` WINS. `FENWICK CLOUD LTD` beats `FENWICK` on the
 * same rung, because the longer one is the more particular claim. Two rows of the same longest length on that rung are
 * a tie, and a tie links nothing and asks nothing: a rule that picked one would pick a different one next week.
 *
 * A CASE AWAY ON THE LOWER RUNGS, over the ASCII fold the ingest anchors use (`fold`), compared here rather than in SQL
 * because SQLite's `lower()` can fold more than ASCII where a build carries ICU, and the record runs on more than one
 * build (`node:sqlite` and the Durable Object).
 * Lengths are counted in characters, as SQLite's `length()` orders them.
 *
 * A PATTERN IS THE LAST RUNG. A row that says `pattern` holds a regular expression in `by`, read without regard to
 * case and tried against the first 512 characters of the value, so `TALABAT|TLBT` files both spellings of one shop.
 * The longest pattern wins and two of one length tie, as on the rungs above. One that is not safe to run is never run
 * (`linkPatternFault`).
 *
 * `where` AND `take` ARE `LinkTo`'s, and say there what they do.
 */
function linkOf(deps: Pick<RulesDeps, 'sql' | 'schemaOf' | 'doneOf' | 'ctx'>, to: Pick<LinkTo, 'register' | 'by' | 'where' | 'take'>, value: string): Linked {
  /* THE FILTER IS COMPILED ONCE AND ASKED ON EVERY RUNG, in the SQL that reads the candidates, so a row it leaves out
     is never counted: it cannot win, and it cannot make a tie with the one row that passes. A filter that cannot be
     read links nothing, since the other direction is a link the rule's author ruled out. */
  let only: Only | null = null;
  if (to.where !== undefined) {
    const schema = deps.schemaOf(to.register);
    const said = schema === null ? null : predicateOf(to.where, schema, deps.ctx);
    const w = said === null || said.bad.length ? null : compile(said.predicate, schema!);
    if (w === null || w.bad.length) return { none: "this link's where cannot be read" };
    only = { sql: w.sql, params: w.params };
  }
  const found = climb(deps, to, value, only);
  /* WHY, WHEN THE FILTER IS WHY. A preview that said "nothing bears that name" of a category that plainly does would
     send somebody to retype the name. The ladder is climbed again without the filter only when it found nothing. */
  if ('none' in found && found.none === NOTHING && only !== null) {
    const without = climb(deps, to, value, null);
    if (!('none' in without) || without.none !== NOTHING) {
      const fields: string[] = [];
      whereFields(to.where, fields);
      return { none: `what bears that name is left out by this link's where${fields.length ? ` (${fields.join(', ')})` : ''}` };
    }
  }
  if ('none' in found || to.take === undefined) return found;
  const taken = deps.sql.one<{ said: unknown }>(`SELECT json_extract(fields, '${jsonPath(to.take)}') AS said FROM entry WHERE id = ?`, found.id)?.said;
  if (typeof taken !== 'string' || taken === '') return { none: `the one found has no ${to.take}` };
  /* WHAT IS TAKEN IS A ROW THAT IS STILL THERE. The ladder reads live rows only, and a deleted category reached
     through a filing rule that still points at it would file under something nobody can open. */
  const there = deps.sql.one<{ register: string; state: string | null }>('SELECT register, state FROM entry WHERE id = ? AND deleted_at IS NULL', taken);
  if (!there) return { none: `the ${to.take} of the one found is gone` };
  /* NOR ONE ITS OWN LIST CALLS FINISHED. A retired category is still there to open, and filing under it is what
     retiring it was for stopping. The filter cannot ask this, since it reads the list the rule is found in. */
  if (typeof there.state === 'string' && deps.doneOf(there.register).includes(there.state)) return { none: `the ${to.take} of the one found is ${there.state.replace(/[._-]+/gu, ' ')}` };
  return { id: taken, row: found.row, rung: found.rung };
}

/** A compiled `link.to.where`: the clause and what fills it. */
type Only = Pick<Compiled, 'sql' | 'params'>;

const NOTHING = 'nothing bears that name';

/** The ladder itself, over the rows `only` lets through, or over every live row of the list. */
function climb(deps: Pick<RulesDeps, 'sql' | 'schemaOf'>, to: Pick<LinkTo, 'register' | 'by'>, value: string, only: Only | null): Linked {
  /* `by` IS A FIELD ID FROM A DECLARATION, and it was inlined into the path with no grammar check (see the note on
     `jsonPath`). A rule can arrive in a pack, so it goes through `jsonPath` here, in the one place both readers call. */
  const by = jsonPath(to.by);
  const and = only === null ? '' : ` AND (${only.sql})`;
  const filled = only === null ? [] : only.params;
  const whole = deps.sql.all<{ id: string }>(
    `SELECT id FROM entry WHERE register = ? AND deleted_at IS NULL AND json_extract(fields, '${by}') = ?${and} LIMIT 2`,
    to.register,
    value,
    ...filled,
  );
  if (whole.length === 1) return { id: whole[0]!.id, row: whole[0]!.id, rung: 'exact' };
  if (whole.length > 1) return { none: 'two rows bear that name' };

  /* THE FIELD IS ASKED OF THE LIST'S DECLARATION, never guessed from the rows, so its name is a declared field id and
     `jsonPath` takes it. */
  const how = `${to.by}_by`;
  const schema = deps.schemaOf(to.register);
  if (schema === null || !Object.hasOwn(schema.fields, how)) return { none: NOTHING };
  const rows = deps.sql.all<{ id: string; rung: number; said: string }>(
    `SELECT id, rung, said FROM (
       SELECT id, CASE json_extract(fields, '${jsonPath(how)}') WHEN 'starts' THEN 2 WHEN 'contains' THEN 3 WHEN 'pattern' THEN 4 END AS rung,
              json_extract(fields, '${by}') AS said
       FROM entry WHERE register = ? AND deleted_at IS NULL AND json_type(fields, '${by}') = 'text'${and}
     ) WHERE rung IS NOT NULL AND said <> '' ORDER BY rung, length(said) DESC, id LIMIT ?`,
    to.register,
    ...filled,
    LADDER_ROWS,
  );
  const folded = fold(value);
  const head = [...value].slice(0, PATTERN_READS).join('');
  let won: { id: string; rung: number; long: number } | null = null;
  let unsafe = false;
  for (const row of rows) {
    if (won !== null && won.rung !== row.rung) break;
    if (row.rung === 4) {
      /* A PATTERN STORED PAST THE CHECK IS NEVER RUN: one that can take for ever would take the write with it. */
      if (linkPatternFault(row.said) !== null) {
        unsafe = true;
        continue;
      }
      if (!new RegExp(row.said, 'i').test(head)) continue;
    } else if (!(row.rung === 2 ? folded.startsWith(fold(row.said)) : folded.includes(fold(row.said)))) continue;
    const long = [...row.said].length;
    if (won === null) {
      won = { id: row.id, rung: row.rung, long };
      continue;
    }
    if (won.long === long) return { none: 'two rows match it equally well' };
    break;
  }
  if (won === null) return { none: unsafe ? 'a pattern that might match it is not safe to run, so it was not tried' : NOTHING };
  return { id: won.id, row: won.id, rung: RUNGS[won.rung]! };
}

/** A text that is one `{{field}}` and nothing else, which is how a filter asks for what the row itself holds. */
const WHOLE_FIELD = /^\{\{(\w+)\}\}$/;

/**
 * A `link.to.where` with its texts filled from the row being linked.
 *
 * A VALUE THE ROW DOES NOT HOLD IS NOT COMPARED AS A DASH. `fill` writes a missing value as a dash, which is right in
 * a sentence and wrong in a filter: `direction` has no value called that, so the whole filter would be refused and a
 * row with no direction could never be filed under a category that takes either. So it is dropped from a list of
 * values, and a test on it alone is true of no row, or of every row where the test is `not`.
 */
function whereFor(node: unknown, row: Entry, text: (template: string) => string): unknown {
  if (Array.isArray(node)) return node.map((child) => whereFor(child, row, text));
  if (node === null || typeof node !== 'object') return node;
  const said = node as Record<string, unknown>;
  if (typeof said.field !== 'string') return Object.fromEntries(Object.entries(said).map(([key, value]) => [key, whereFor(value, row, text)]));
  const absent = (value: unknown): boolean => {
    const name = typeof value === 'string' ? WHOLE_FIELD.exec(value)?.[1] : undefined;
    return name !== undefined && name !== 'id' && !present(row.fields[name]);
  };
  const filled = (value: unknown): unknown => (typeof value === 'string' ? text(value) : value);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(said)) {
    if (key === 'field' || key === 'via') out[key] = value;
    else if (Array.isArray(value)) {
      const kept = value.filter((member) => !absent(member)).map(filled);
      if (value.length > 0 && kept.length === 0) return key === 'not_in' ? { all: [] } : { any: [] };
      out[key] = kept;
    } else if (absent(value)) return key === 'not' ? { all: [] } : { any: [] };
    else out[key] = filled(value);
  }
  return out;
}

/** `link.to` as `linkOf` reads it for one row: the filter filled from that row, the rest as declared. */
function linkTo(to: LinkTo, row: Entry, text: (template: string) => string): Pick<LinkTo, 'register' | 'by' | 'where' | 'take'> {
  return to.where === undefined ? to : { ...to, where: whereFor(to.where, row, text) as Predicate };
}

/** A repeat at `i` of `src`: how many characters it is, whether it can go round more than once, and whether it has a
 *  choice of how often. `?` chooses and goes round once; `{3}` goes round and does not choose. */
function repeatAt(src: string, i: number): { long: number; many: boolean; choice: 'none' | 'once' | 'wide' } {
  const c = src[i];
  let said: { long: number; many: boolean; choice: 'none' | 'once' | 'wide' } = { long: 0, many: false, choice: 'none' };
  if (c === '*' || c === '+') said = { long: 1, many: true, choice: 'wide' };
  else if (c === '?') said = { long: 1, many: false, choice: 'once' };
  else {
    const braces = c === '{' ? /^\{(\d+)(?:(,)(\d*))?\}/.exec(src.slice(i)) : null;
    if (braces === null) return said;
    const least = Number(braces[1]);
    const most = braces[2] === undefined ? least : braces[3] === '' ? Infinity : Number(braces[3]);
    said = { long: braces[0].length, many: most > 1, choice: most <= least ? 'none' : most <= 1 ? 'once' : 'wide' };
  }
  /* A `?` after a repeat makes it take as little as it can. It is not a second repeat. */
  if (src[i + said.long] === '?') said.long += 1;
  return said;
}

/** What one open repeat such as `.*` costs, and the most a pattern may spend. A `?`, or a `|` inside brackets, costs 1. */
const WIDE_COST = 5;
const PATTERN_BUDGET = 12;

/**
 * The shape that makes a pattern unsafe to run, or `null`.
 *
 * `nested` REPEATS A GROUP THAT HOLDS A REPEAT, as `(a+)+` and `(\w*\s?)*` do, and `choice` repeats one that holds an
 * either-or or an optional part, as `(a|aa)+` and `(a?a)+` do. Each can be read a number of ways that doubles with
 * every character, so one long text never finishes.
 *
 * `much` IS TOO MANY REPEATS AND CHOICES IN A ROW. `.*.*.*x` nests nothing and still took twenty seconds on 512
 * characters, since each open repeat multiplies the work by the length of the text. Two are let through, with two
 * optional parts beside them, which is a fifth of a second at worst.
 */
function unsafeShape(src: string): 'nested' | 'choice' | 'much' | null {
  /* One entry an open group: what inside it, at any depth, repeats or chooses. */
  const open: { repeats: boolean; chooses: boolean }[] = [];
  let closed: { repeats: boolean; chooses: boolean } | null = null;
  let spent = 0;
  for (let i = 0; i < src.length; ) {
    const c = src[i]!;
    const group = closed;
    closed = null;
    const top = open[open.length - 1];
    if (c === '\\') i += 2;
    else if (c === '[') {
      for (i += 1; i < src.length && src[i] !== ']'; i += src[i] === '\\' ? 2 : 1);
      i += 1;
    } else if (c === '(') {
      open.push({ repeats: false, chooses: false });
      /* `(?:`, `(?=`, `(?<name>`: the `?` says what kind of group it is and repeats nothing. */
      i += src[i + 1] === '?' ? 2 : 1;
    } else if (c === ')') {
      closed = open.pop() ?? null;
      if (closed && top && open.length > 0) {
        const outer = open[open.length - 1]!;
        outer.repeats ||= closed.repeats;
        outer.chooses ||= closed.chooses;
      }
      i += 1;
    } else if (c === '|') {
      if (top) {
        top.chooses = true;
        spent += 1;
      }
      i += 1;
    } else {
      const repeat = repeatAt(src, i);
      if (repeat.many && group?.repeats) return 'nested';
      if (repeat.many && group?.chooses) return 'choice';
      if (repeat.choice === 'wide') spent += WIDE_COST;
      if (repeat.choice === 'once') spent += 1;
      if (top && repeat.long > 0) {
        if (repeat.many) top.repeats = true;
        else if (repeat.choice === 'once') top.chooses = true;
      }
      i += Math.max(1, repeat.long);
    }
  }
  return spent > PATTERN_BUDGET ? 'much' : null;
}

const UNSAFE: Record<'nested' | 'choice' | 'much', string> = {
  nested: 'repeats a group that already holds a repeat, such as (a+)+, which can take for ever on one long text',
  choice: 'repeats a group that holds an either-or or an optional part, such as (a|ab)+, which can take for ever on one long text',
  much: 'has too many repeats and choices to be sure it finishes on a long text, such as .*.*.*: two of * and + is the most',
};

/**
 * Why a `pattern` may not be kept or run, in words that follow "the pattern", or `null` for one that may.
 *
 * A PATTERN IS RUN INSIDE A WRITE, on a text a bank wrote, so one that can take for ever takes the write with it. It is
 * refused when it is longer than 120 characters, when it does not compile, and when its shape is one `unsafeShape`
 * names: a repeated group that holds a repeat or a choice, or too many repeats in a row. `linkOf` asks this of every
 * pattern before it runs one, so a pattern stored past the write is never tried.
 *
 * Exported for whatever writes the row that holds one, so it is refused where it is typed.
 */
export function linkPatternFault(pattern: string): string | null {
  const long = [...pattern].length;
  if (long > PATTERN_MAX) return `is ${long} characters, and a pattern is at most ${PATTERN_MAX}`;
  try {
    new RegExp(pattern, 'i');
  } catch (err) {
    return `cannot be read as a pattern: ${err instanceof Error ? err.message.replace(/^Invalid regular expression: /, '') : 'it does not compile'}`;
  }
  const shape = unsafeShape(pattern);
  return shape === null ? null : UNSAFE[shape];
}

/* ── the sentence a rule writes ──────────────────────────────────────────── */

const DAY_MS = 86_400_000;

/**
 * `{{field}}` and the typed forms, as plain text.
 *
 * THIS IS A SENTENCE IN AN EVENT, not a rendering. `render` owns the display form and carries a
 * locale; this writes the line somebody reads in six weeks, and it is deliberately the same words
 * whoever reads it. A missing value is an em dash rather than the empty string, because a sentence
 * with a hole in it reads as a bug and one with a dash reads as a fact.
 *
 * A TEMPLATE THAT IS NOT TEXT IS WRITTEN AS ITS WORDS, NOT THROWN. The lint refuses one at install (`fillFault` in
 * `flow-lint.ts`), but a rule installed before that lint, or written straight into the declaration row, still holds
 * `set: { to: 5 }` or `note: 7`, and this line was `template.replace`: measured, such a rule threw
 * `template.replace is not a function` out of every write to its list, and the row a person asked for was lost with it.
 */
export function fill(template: string, row: Entry, nowMs = Date.now()): string {
  return filling(template, row, nowMs).text;
}

/**
 * The run's own paths, as a run hands them to the pass: what `{{vars.x}}`, `{{trigger.row.note}}` or `{{metric.total}}`
 * is written as, and whether that path reaches a value a secret or file field gave it. `flow.ts` builds one for each
 * step it acts. A figure's head is `metric` and its path is the figure's id.
 */
export type RunFill = { value: (head: string, path: string, said?: RunSaid) => string; sealed: (head: string, path: string) => boolean };

/**
 * What one run path says besides where it goes: `money` for `{{money:vars.x}}`, which writes an amount a person gave
 * as a sentence writes money, and the words of `{{path or "words"}}`, written where the path reaches nothing.
 */
export type RunSaid = { form?: 'money'; or?: string };

/**
 * A run path as a text spells it: `{{vars.x}}`, `{{trigger.row.note}}`, `{{money:vars.deposit}}`, and any of them with
 * `or "words"` after the path. Groups: 1 the form, 2 the head, 3 the path, 4 the words as typed, a `\"` in them being
 * a quote. Without a form and without `or` it reads exactly what `flow-lint.ts`'s `RUN_PATH` reads, so a text written
 * before either existed fills as it did.
 */
export const RUN_SPELL = /\{\{\s*(?:(money):)?(vars|trigger)\.([A-Za-z0-9_.]+)(?:\s+or\s+"((?:[^"\\]|\\.)*)")?\s*\}\}/g;

/** What a run path's match says besides its head and path (`RUN_SPELL`'s groups 1 and 4). */
export const runSaid = (form: string | undefined, words: string | undefined): RunSaid => ({
  ...(form === 'money' ? { form: 'money' as const } : {}),
  ...(words === undefined ? {} : { or: words.replace(/\\(.)/g, '$1') }),
});

/**
 * What `filling` reads besides the row: the fields of the row that never leave the record, a create's tuple, and the
 * run's paths. Each spelling is left as typed where what fills it is not given. A tuple crossed from a field that never
 * leaves is refused before it is filled (`expand`), so a tuple is never counted here.
 */
export type FillBy = { sealed?: ReadonlySet<string>; each?: readonly string[]; run?: RunFill };

/**
 * Every spelling a text can be filled from, in one pattern: the run's `{{vars.x}}` and `{{trigger.row.pin}}`
 * (`RUN_SPELL`, with its `money:` form and `or "words"`), a figure's `{{metric.total}}` (`figure.ts`), a create's `{{each.0}}`, and the row's
 * `{{field}}`, `{{kind:field}}` and `{{kind:field-other}}`, one money field less another (`moneyLess`).
 */
const SPELLED = new RegExp(`${RUN_SPELL.source}|${FIGURE.source}|\\{\\{each\\.(\\d)\\}\\}|\\{\\{(\\w+)(?::(\\w+)(?:-(\\w+))?)?\\}\\}`, 'g');

/** Whether a field holds anything a fill would write as more than the dash: an empty list holds nothing either. */
export const present = (value: unknown): boolean => value !== null && value !== undefined && value !== '' && !(Array.isArray(value) && value.length === 0);

/**
 * `fill`, IN ONE PASS OVER THE TEXT, and the first spelling in it that reached a value a secret or file field gave it,
 * or `null`.
 *
 * ONE `replace`, SO NOTHING ONE SPELLING WROTE IS READ AGAIN AS ANOTHER. The fills used to run one after the other:
 * `withEach` wrote a create's tuple in, then `fill` read the row's `{{field}}`s out of the result, and `flow.ts` wrote
 * the run's paths into a step before the pass filled it from the row. So a value holding the words `{{pin}}` was filled
 * a second time, as the secret. Measured at HEAD `afb3b1b2`: a `kinds` item `{{pin}}` crossed by `each: [kinds]` into
 * `what: 'x {{each.0}}'` wrote `x hunter2` into a Payments row, and a run's `note: 'is {{trigger.row.note}}'` over a
 * `note` holding `{{pin}}` wrote `is hunter2` into the note event. No lint can see either, since the braces are data.
 *
 * THE SECRET IS NAMED BY WHERE IT WAS READ, NEVER BY WHAT IT HOLDS. A field is counted when `sealed` has it and it holds
 * a value, and a path when the run says so. Comparing the words written against the secret's words would refuse a row
 * whose note happens to say what its pin says, and would miss the pin put in by way of a variable.
 */
export function filling(template: unknown, row: Entry, nowMs: number, by: FillBy = {}): { text: string; secret: string | null } {
  if (typeof template !== 'string') return { text: wordsOf(template), secret: null };
  let secret: string | null = null;
  const text = template.replace(SPELLED, (whole: string, form?: string, runHead?: string, runPath?: string, words?: string, figHead?: string, figId?: string, each?: string, head?: string, tail?: string, less?: string) => {
    /* A FIGURE IS THE RUN'S TO READ, and the inline pass has no run, so there the braces stay as typed and the lint
       refuses them (`figure.ts`): a figure read inside a write would be read over the row that write is still making. */
    if (runHead !== undefined || figHead !== undefined) {
      if (by.run === undefined) return whole;
      const [h, p] = runHead !== undefined ? [runHead, runPath!] : [figHead!, figId!];
      if (by.run.sealed(h, p)) secret ??= whole;
      return runHead !== undefined ? by.run.value(h, p, runSaid(form, words)) : by.run.value(h, p);
    }
    if (each !== undefined) {
      if (by.each === undefined) return whole;
      return by.each[Number(each)] ?? '';
    }
    /* ONLY A MONEY FORM SUBTRACTS. `{{on:due-paid}}` was left as typed before a second field could be spelled, and it
       still is: a day less a field is no sentence, and a form nobody declared has no rule for two fields. */
    if (less !== undefined && head !== 'short' && head !== 'money') return whole;
    const field = tail ?? head!;
    if (head !== 'id' && by.sealed?.has(field) === true && present(row.fields[field])) secret ??= whole;
    if (less !== undefined && by.sealed?.has(less) === true && present(row.fields[less])) secret ??= whole;
    return rowValue(head!, tail, row, nowMs, less);
  });
  return { text, secret };
}

/**
 * The fields of `register` that never leave the record, retired ones included, and a list of either with them
 * (`sealedAs`): every field any version of the list's declaration has typed so.
 *
 * THE DECLARATION AND NOT THE LIVE SCHEMA, which drops a retired field while the rows written before it was retired
 * keep its value. `actions.ts` reads a call's sends the same way, for the same reason.
 *
 * AND EVERY VERSION OF IT, NOT ONLY THE ONE STANDING, which is `declare.ts`'s `sealedEver` and says why. Reading only
 * the standing version lost `pin` the moment it was dropped: measured, `note 'x {{pin}}'`,
 * `note 'x {{trigger.row.pin}}'`, `note 'x {{trigger.row}}'` and `set memo to {{pin}}` installed after the drop each
 * wrote `hunter2`; a field retyped from secret to text by way of a retire wrote it too (measured). The lint reads the
 * same function now and refuses those rules at install, so this line is for a rule stored before it did, or before the
 * field was secret at all (`retired-secret.test.ts`).
 *
 * THE HISTORY AND NOT A REFUSED DROP. A refusal would guard only the drops still to come, and a record that dropped a
 * retired secret before this line exists already, its rows holding the value; reading the history closes those too, and
 * leaves retiring and then dropping the removal it was.
 *
 * KEPT PER LIST AND LATEST VERSION (`sealedKept`), because a rule fire asks this and `sealedEver` parses every version
 * of the list's declaration each time it is asked. Every version is a new row and none is edited, so the answer can
 * change only when a version is added, and a new version is a new key. The caller gets its own copy of the set.
 */
export function sealedOf(sql: Sql, register: string): Set<string> {
  const latest = sql.one<{ version: number; checksum: string }>(
    "SELECT version, checksum FROM declaration WHERE id = ? AND kind = 'register' ORDER BY version DESC LIMIT 1",
    `register.${register}`,
  );
  const key = latest === undefined ? '' : `${latest.version}:${latest.checksum}`;
  let lists = sealedKept.get(sql);
  if (lists === undefined) sealedKept.set(sql, (lists = new Map()));
  const kept = lists.get(register);
  if (kept !== undefined && kept.key === key) return new Set(kept.sealed);
  const sealed = new Set(sealedEver(sql, register).keys());
  lists.set(register, { key, sealed });
  return new Set(sealed);
}

/**
 * `sealedOf`'s answers, per record and per list, each under the version and checksum of the list's newest declaration.
 *
 * THE CHECKSUM AS WELL AS THE VERSION, as `flow.ts`'s `installed` keys its cache, because an install that rolls back
 * leaves the next install the same version number for different bytes. One entry per list the record holds, replaced
 * and never added to, so it grows with the lists and not with the fires.
 */
const sealedKept = new WeakMap<Sql, Map<string, { key: string; sealed: ReadonlySet<string> }>>();

/** One `{{field}}`, `{{kind:field}}` or `{{kind:field-other}}` of the row, as `fill` writes it. */
function rowValue(head: string, tail: string | undefined, row: Entry, nowMs: number, less?: string): string {
  if (head === 'id') return row.seq === null ? row.id : `${row.register}#${row.seq}`;
  const field = tail ?? head;
  const kind = tail ? head : null;
  const held = row.fields[field];
  if (held === null || held === undefined || held === '') return '—';
  const value = less === undefined ? held : moneyLess(held, row.fields[less]);

  if (kind === 'money' || (!kind && isMoney(value)))
    /* THE CURRENCY'S OWN DECIMALS. It was `amount / 100` to two places for every code, so JPY 129,900
       was written `JPY 1299.00` and KWD 1.500 was `KWD 15.00`, into patches, notes and questions. */
    return isMoney(value) ? moneyWords(value) : String(value);
  /* THE TWO FORMS A MESSAGE IS WRITTEN IN. Each reads only what it knows, a money and a day, and anything else falls
     through to the bare value below, as a form nobody declared does. */
  if (kind === 'short' && isMoney(value)) return moneyShort(value);
  if (kind === 'on') {
    const day = dayWords(value, nowMs);
    if (day !== null) return day;
  }
  if (kind === 'quantity' && isQuantity(value)) return `${value.value} ${value.unit}`;
  if (kind === 'until' || kind === 'ago') {
    const at = Date.parse(`${String(value).slice(0, 10)}T12:00:00Z`);
    if (!Number.isFinite(at)) return String(value);
    const days = Math.round((at - nowMs) / DAY_MS);
    if (days === 0) return 'today';
    return days > 0 ? `in ${days} day${days === 1 ? '' : 's'}` : `${-days} day${days === -1 ? '' : 's'} ago`;
  }
  if (kind === 'pct') return `${(Number(value) * 100).toFixed(0)}%`;
  if (Array.isArray(value)) return value.map(String).join(', ');
  return String(value);
}

/**
 * Money as a sentence writes it: `GBP 1,234.50`, `JPY 129,900`, `GBP −39.00`.
 *
 * THE KERNEL'S ONE `moneyText`, AND NOT A SECOND SPELLING OF IT. This wrote `toFixed` with no grouping and a hyphen for
 * a minus, so every question, note and patch a rule filled stored `GBP 2400.00` while a digest (`digest.ts`) wrote the
 * same amount `GBP 2,400.00`, and a screen printed the first verbatim. One function now writes money into every
 * sentence the record keeps: code first, grouped, the currency's own decimals and a true minus. A screen draws it in the
 * record's currency (`moneyInText` in the web's `lib/record/money.ts`); the kernel may not import the renderer that
 * draws figures, which is why `moneyText` lives in `ingest.ts` beside the exponent table it reads.
 */
const moneyWords = (m: { amount: number; currency: string }): string => moneyText(m.amount, m.currency);

/**
 * `{{short:amount-paid_so_far}}`, what is left of one money field when another is taken from it: EGP 12,000 with
 * EGP 4,500 paid is `EGP 7,500`. The template names both fields and the kernel names neither.
 *
 * WHAT WAS WRONG. A template could write a field and could not subtract one, so a drafted chase named the whole amount
 * of an invoice part of which had been paid: true as a sentence, and not the sum anybody is owed.
 *
 * THE FIRST FIELD AS IT STANDS WHERE THE SUM CANNOT BE SAID: two currencies, which are never subtracted; a second field
 * that holds nothing, or no money; and more taken than there was, since a message never asks for an amount under
 * nought. The form then writes what it writes of the first field alone, the sentence the template had before.
 *
 * WHOLE MINOR UNITS AND A CODE ON BOTH SIDES, OR NO SUM. `isMoney` asks only that the two keys are there, so a second
 * field of `{ amount: 100, currency: null }` threw out of the fill and `{ amount: 'abc' }` wrote `EGP NaN`.
 */
function moneyLess(value: unknown, taken: unknown): unknown {
  const sound = (m: unknown): m is { amount: number; currency: string } => isMoney(m) && Number.isSafeInteger(m.amount) && typeof m.currency === 'string';
  if (!sound(value) || !sound(taken) || value.currency.toUpperCase() !== taken.currency.toUpperCase()) return value;
  const amount = value.amount - taken.amount;
  return amount < 0 ? value : { amount, currency: value.currency };
}

/**
 * The currencies a message writes by a sign, each sign one currency's alone: a bare `$` is the US dollar's and every
 * other dollar carries its letters. A currency not here is written by its code, `SAR 12,000`, never by a neighbour's
 * sign. A TABLE AND NOT `Intl`'s, whose signs move with the runtime's data: a sentence the record keeps is the same
 * words whichever machine filled it.
 *
 * A CURRENCY ENGLISH WRITES BY ITS CODE IS NOT HERE, as it has no sign in `braindog-render`'s `money.ts` either: the
 * franc, the riyal and the Egyptian pound are each written by their letters (settled 9 October), and the kernel
 * names no one country's money.
 */
const SIGN: Readonly<Record<string, string>> = {
  GBP: '£', EUR: '€', USD: '$', JPY: '¥', CNY: 'CN¥', INR: '₹', KRW: '₩', ILS: '₪',
  CAD: 'CA$', AUD: 'A$', NZD: 'NZ$', HKD: 'HK$', SGD: 'S$', MXN: 'MX$', BRL: 'R$',
};

/**
 * `{{short:amount}}`, money as a message says it: `£12,000`, `£12,000.50`, `−£39`, `SAR 12,000`.
 *
 * WHOLE UNITS WHEN THE MINOR PART IS NOUGHT, and the currency's own decimals when it is not, so nothing is rounded
 * away: `{{money:amount}}` stays the form a note keeps, with the code and every decimal.
 */
function moneyShort(m: { amount: number; currency: string }): string {
  const code = m.currency.toUpperCase();
  const exp = exponentOf(code);
  const places = m.amount % 10 ** exp === 0 ? 0 : exp;
  const body = (Math.abs(m.amount) / 10 ** exp).toLocaleString('en-u-nu-latn', { minimumFractionDigits: places, maximumFractionDigits: places });
  const minus = m.amount < 0 ? '−' : '';
  const sign = SIGN[code];
  return sign === undefined ? `${code} ${minus}${body}` : `${minus}${sign}${body}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/**
 * `{{on:due}}`, a day as a message says it: `30 Oct`, and `5 Jan 2027` when the year is not the one the fill is made
 * in. `null` for a value that is not a day on the calendar, which the caller then writes as it stands.
 *
 * THE DAY AS WRITTEN, with no zone applied: a date field holds a day, and a moment's first ten characters are the day
 * `{{ago:field}}` already counts from.
 */
function dayWords(value: unknown, nowMs: number): string | null {
  const m = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/.exec(value) : null;
  if (m === null) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const at = new Date(Date.UTC(year, month - 1, day));
  if (at.getUTCFullYear() !== year || at.getUTCMonth() !== month - 1 || at.getUTCDate() !== day) return null;
  const words = `${day} ${MONTHS[month - 1]!}`;
  return year === new Date(nowMs).getUTCFullYear() ? words : `${words} ${year}`;
}

/**
 * `{{metric.<id>}}` as a run's fill writes it: the figure read as a page reads it (`evaluateMetric` with the record's
 * rates), in its own unit, or the dash where the record holds no such figure or the figure refuses to be read.
 *
 * MONEY IS WRITTEN AS A MONEY FIELD IS, `GBP 1,234.50`, so a sentence holding `{{amount}}` and `{{metric.cash-now}}`
 * says both the same way. An earlier draft wrote `1234.50 GBP`; that is the quantity order (`3 h`), and a note that put
 * the currency first for the row and last for the figure would read as two kinds of number. Money in several currencies
 * that no rate adds up is each amount, as a page writes it (`pages.ts`'s `valueAt`).
 *
 * WHETHER THE UNIT IS A CURRENCY IS ASKED OF THE FIELD THE FIGURE ADDS UP, never of the unit's spelling.
 * `metrics.ts`'s `isMoneyFigure` says why: `KGS` is a weight in one list and the Kyrgyz som in another, and a quantity
 * written through `exponentOf` would be a hundredth of itself.
 *
 * THE AGGREGATE ONLY, NEVER A ROW. `value` and its unit are the whole figure; `groups` is never read, so a figure
 * grouped by a field hands no row's word into a run. Over a list with a secret field, measured, `sum`, `min`, `max` and
 * `avg` of the secret are refused at install ("max reads a number, and pin is a secret"), and `count` and `distinct` of
 * it install, which are numbers of rows. So the run's `sealed` answers `false` for a figure: the number of keys a keychain
 * holds is not a key. `group_by` a secret field installs too, and is why `groups` stays unread here.
 */
export function figureText(deps: Pick<RulesDeps, 'sql' | 'ctx'>, id: string): string {
  const row = deps.sql.one<{ body: string }>("SELECT body FROM declaration WHERE id = ? AND kind = 'metric' AND superseded_at IS NULL AND retired = 0", `metric.${id}`);
  if (!row) return '—';
  const decl = JSON.parse(row.body) as MetricDecl;
  const read = evaluateMetric(deps.sql, decl, deps.ctx);
  if (!read.ok) return '—';
  const { value, unit, parts } = read.value;
  if (parts?.length) return parts.map(moneyWords).join(', ');
  if (value === null) return '—';
  if (unit === null) return String(value);
  return addsMoney(decl, deps.ctx) ? moneyWords({ amount: value, currency: unit }) : `${value} ${unit}`;
}

/** Whether any field the figure adds up is typed money in its list, both halves of a ratio or a difference included. */
function addsMoney(decl: MetricDecl, ctx: EvalContext): boolean {
  /* A FIGURE THAT DECLARES ITSELF MONEY IS MONEY, whatever it adds up: a cash figure rolled forward and a walk add up no
     field this could ask the type of, and were written as a bare number of minor units (`money-figures.ts`). */
  if (isMoneyFormat(decl.format)) return true;
  const schema = decl.source.startsWith('register.') ? ctx.schemaOf(decl.source.slice('register.'.length)) : null;
  if (!schema) return false;
  const v = decl.value;
  const halves: Aggregation[] = 'ratio' in v ? [v.ratio.of, v.ratio.per] : 'diff' in v ? [v.diff.of, v.diff.per] : [v];
  return halves.some((agg) => {
    const operand: unknown = Object.values(agg)[0];
    const field = typeof operand === 'string' ? operand : (operand as { product?: unknown[] } | undefined)?.product?.[0];
    return typeof field === 'string' && schema.fields[field]?.type === 'money';
  });
}

/** A value that is not text, as `fill` would write it had it been a field: a dash for nothing, a list by its items. */
const wordsOf = (value: unknown): string =>
  value === null || value === undefined
    ? '—'
    : Array.isArray(value)
      ? value.map(String).join(', ')
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value);

const isMoney = (v: unknown): v is { amount: number; currency: string } =>
  typeof v === 'object' && v !== null && 'amount' in v && 'currency' in v;
const isQuantity = (v: unknown): v is { value: number; unit: string } =>
  typeof v === 'object' && v !== null && 'value' in v && 'unit' in v;

/** The `rule` schedule row's marker, through the one insertion path. `false` means suppressed. */
/** The ceiling on any one expansion, whatever a declaration says. */
export const CREATE_CEILING = 500;

/**
 * One row becomes a matrix of rows.
 *
 * THE BOUND IS CHECKED BEFORE ANYTHING IS WRITTEN, and the whole expansion is refused rather than
 * truncated. Half a size run is worse than none: the missing SKUs look like sizes nobody stocks,
 * and the person who has to notice is the one placing the order.
 *
 * AND RE-RUNNING IS A NO-OP. Every generated row carries `_rule`, `_parent` and `_each` under one
 * partial unique index, so the same tuple twice is one row — which means adding a colour next
 * season creates only the new combinations, and that is the behaviour a size run actually wants.
 * The key is the RULE and not the register: the worked example writes into an ordinary register,
 * which has no `key:` of its own to be idempotent on.
 */
function expand(deps: RulesDeps, name: string, spec: CreateSpec, from: Standing): { refusals: Refusal[]; grew: boolean } {
  const nothing = (refusal: Refusal) => ({ refusals: [refusal], grew: false });

  const bound = Math.floor(spec.bound);
  if (!Number.isFinite(bound) || bound < 1 || bound > CREATE_CEILING)
    return nothing(
      {
        code: 'OUT_OF_BOUNDS',
        fix: `${name} declares a bound of ${String(spec.bound)}, and a bound is between 1 and ${CREATE_CEILING}.`,
        at: 'bound',
      },
    );

  /* WHAT ONLY A ROW COULD FILL IS REFUSED WHERE THERE IS NONE, before anything is written. Crossed against no row,
     `each:` made no tuple, so nothing was created and nothing was said; a row's `{{field}}` would have written the dash
     into the task a person reads. The lint refuses both on a clock or a button at install, in this sentence
     (`rowlessCreate`); this line is for an arrival that wrote nothing, and a rule stored before the lint did. */
  if (from.entry === null) {
    const alone = rowlessCreate(`rule.${name}`, spec, 'this run');
    if (alone) return nothing({ code: 'DECLARATION_INVALID', fix: `${alone.fix} Nothing was created.`, at: alone.at });
  }
  const row: Entry = from.entry ?? { id: '', register: '', seq: null, fields: {}, state: null, version: 0, created_at: '', updated_at: '', deleted_at: null };

  const axes = (spec.each ?? []).map((f) => asValues(row.fields[f]));
  if (axes.length > 2)
    return nothing({
      /* TWO IS A MATRIX. Three is a cube, and nobody has ever wanted a cube. */
      code: 'OUT_OF_BOUNDS',
      fix: `${name} crosses ${axes.length} fields, and two is the most a matrix can be.`,
      at: 'each',
    });

  const tuples: string[][] = axes.length === 0 ? [[]] : axes.length === 1 ? axes[0]!.map((a) => [a]) : axes[0]!.flatMap((a) => axes[1]!.map((b) => [a, b]));
  if (tuples.length > bound)
    return nothing({
      code: 'OUT_OF_BOUNDS',
      fix: `${name} would make ${tuples.length} rows in ${spec.register}, and its bound is ${bound}. Nothing was created.`,
      at: 'bound',
    });

  /* WITH NO ROW TO STAND ON, THE BOUND IS A DAY'S, as the grammar says it. On a row the bound caps one matrix, and the
     row's `once_per` keeps it to one matrix a row; a clock or a button has no row, so a bound per run capped nothing
     that mattered: measured, `bound: 1` on a fifteen-minute clock made 200 rows in 50 hours. Counted over the rows this
     rule made in any list, read by the `_rule` the unique index leads with, less the ones this parent made, so a turn
     taken again finds its own rows and not a spent day.

     A CLOCK'S DAY IS THE DAY BEFORE ITS TURN, NOT BEFORE THE WALL CLOCK. A drain that comes back after three months off
     takes every missed monthly turn in one pass (`flow.ts`'s `onClock`), all at one wall instant, so a day counted by
     `created_at` let the first turn make its row and refused every later one: the missed months' tasks still not made,
     only now failed with a sentence. A clocked parent is `<rule>@<turn>`, the turn an ISO instant, and every ISO
     instant sorts as its time does, so the rows whose parent falls between this turn less a day and this turn are the
     ones the turns of that day made. Anything else (a button, an arrival) has no turn and is counted by when its rows
     were made. */
  if (from.entry === null) {
    const turn = from.parent.startsWith(`${name}@`) ? Date.parse(from.parent.slice(name.length + 1)) : NaN;
    const made =
      (Number.isFinite(turn)
        ? deps.sql.one<{ n: number }>(
            "SELECT count(*) AS n FROM entry WHERE json_extract(fields, '$._rule') = ? AND json_extract(fields, '$._parent') > ? AND json_extract(fields, '$._parent') < ?",
            name,
            `${name}@${instant(turn - DAY_MS)}`,
            from.parent,
          )
        : deps.sql.one<{ n: number }>(
            "SELECT count(*) AS n FROM entry WHERE json_extract(fields, '$._rule') = ? AND json_extract(fields, '$._parent') <> ? AND created_at > ?",
            name,
            from.parent,
            instant(deps.nowMs - DAY_MS),
          )
      )?.n ?? 0;
    if (made + tuples.length > bound)
      return nothing({
        code: 'OUT_OF_BOUNDS',
        fix: `${name} has made ${made} ${made === 1 ? 'row' : 'rows'} in the day before this ${Number.isFinite(turn) ? 'turn' : 'run'} with no row to stand on, and its bound of ${bound} is the most it makes in a day that way. Nothing was created.`,
        at: 'bound',
      });
  }

  /* A SECRET OR FILE FIELD IS COPIED INTO NO ROW THIS MAKES, unless into a field of the other list that never leaves
     either. Crossing one copies its values whatever the fields say, into `{{each.0}}` and into the `_each` every
     generated row carries, so that is refused first. Checked before anything is written, for the bound's reason: a
     half-made matrix looks like sizes nobody stocks. The lint refuses both at install (`flow-lint.ts`, `copyFault`),
     and this is the second line, for a rule stored before it did and for a run's step, whose values exist only at the
     run. */
  const own = from.register === null ? new Set<string>() : sealedOf(deps.sql, from.register);
  const theirs = sealedOf(deps.sql, spec.register);
  const crossed = (spec.each ?? []).find((f) => own.has(f) && present(row.fields[f]));
  if (crossed !== undefined)
    return nothing({ code: 'DECLARATION_INVALID', fix: copied(name, `each: ${crossed}`, `every ${spec.register} row it creates`), at: 'each' });
  for (const [id, template] of Object.entries(spec.fields)) {
    const secret = filling(template, row, deps.nowMs, { sealed: own, ...(from.run ? { run: from.run } : {}) }).secret;
    if (secret !== null && !theirs.has(id)) return nothing({ code: 'DECLARATION_INVALID', fix: copied(name, secret, `${id} of the ${spec.register} row it creates`), at: `fields.${id}` });
  }

  const out: Refusal[] = [];
  let grew = false;
  for (const tuple of tuples) {
    /* THE TARGET REGISTER IS PART OF THE TUPLE. Without it, two `create` actions in one rule shared
       a key — the second one's read found the first one's row and skipped, so the rule wrote half
       of what it declared and refused nothing. */
    const each = JSON.stringify([spec.register, ...tuple]);
    /* A ROW THAT IS ALREADY THERE IS THE POINT, not a failure — which is why this is a read rather
       than a caught constraint. Adding a colour next season creates only the new combinations, and
       a re-run that reported forty refusals would make the feature unusable. */
    if (
      /* `deleted_at IS NULL`, AND THE REGISTER. Without the first, a generated row somebody deleted
         by mistake could never come back — the re-run found the tombstone, skipped, and the header's
         promise that "adding a colour next season creates only the new combinations" quietly meant
         "and never restores one". Without the second this was a full scan of every register on an
         unindexed path. */
      deps.sql.one(
        `SELECT 1 AS x FROM entry WHERE register = ? AND deleted_at IS NULL
         AND json_extract(fields, '$._rule') = ?
         AND json_extract(fields, '$._parent') = ? AND json_extract(fields, '$._each') = ?`,
        spec.register,
        name,
        from.parent,
        each,
      )
    )
      continue;

    /* A VALUE THAT IS NOT TEXT GOES THROUGH AS IT WAS WRITTEN. `withEach` called `.replace` on each one, so a create
       holding `tags: ["late"]`, installed before the lint refused it, threw out of every write to the parent's list
       (measured). Passed through, the list reads it as its own type, or refuses it as it would any other value.

       AND THE TUPLE IS FILLED IN THE SAME PASS AS THE ROW. `withEach` wrote it in first and `fill` then read the
       result, so a `kinds` item holding the words `{{pin}}` became the secret (`filling` says what was measured). */
    const fields: Record<string, unknown> = {};
    for (const [id, template] of Object.entries(spec.fields))
      fields[id] = typeof template === 'string' ? filling(template, row, deps.nowMs, { each: tuple, ...(from.run ? { run: from.run } : {}) }).text : template;

    const made = deps.generate(spec.register, fields, `rule:${name}`, from.batch, {
      _rule: name,
      _parent: from.parent,
      _each: each,
    });
    if (refused(made)) out.push(made.refusal);
    else grew = true;
  }
  return { refusals: out, grew };
}

/** What a `create` declares, as `expand` reads it. */
type CreateSpec = { register: string; each?: string[]; bound: number; fields: Record<string, string> };

/**
 * Where a create stands: the row that fired it, or none, and the id its rows name as their `_parent`. On a row the parent
 * is the row; with no row it is the clock's turn or the run (`createAlone`).
 */
type Standing = { entry: Entry | null; parent: string; register: string | null; batch: string; run?: RunFill };

/**
 * A `create` step taken by a run that has no row: a clock, a button, an arrival that wrote nothing.
 *
 * MEASURED BEFORE THIS: such a create installed, armed, ran on time and failed every run with "this run has none to act
 * on", because `flow.ts`'s `act` sent every step with no subject away from `runRules`, and `runRules` is the only thing
 * that reached `expand`. So a rule could not make the next task each month, which is the one thing a monthly clock with
 * a create is for (`clock-monthly.test.ts`).
 *
 * THE TURN IS THE PARENT ON A CLOCK, AND THE RUN ANYWHERE ELSE. `expand` makes a tuple once per parent, and on a row
 * the parent is the row. A clock has none, and a parent of the rule alone would make the first month's task and then
 * find it already there every month after. The run was the parent at first, one per turn, and a turn delivered twice
 * got two rows: two runs, two parents. So a clocked run passes `parent` as `<rule>@<turn>` (`flow.ts`'s `advance`), and
 * two runs of one turn find each other's row. A button or an arrival has no turn, so its run stays the parent, and the
 * same run taken again from its create after a drain died between the write and the save finds the row it made
 * (`clock-create.test.ts`). The bound, the ceiling and the refusal of a copied secret are `expand`'s, as they are on a
 * row.
 */
export function createAlone(deps: RulesDeps, rule: string, spec: CreateSpec, run: string, by?: RunFill, parent: string = run): { refusals: Refusal[]; grew: boolean } {
  return expand(deps, rule, spec, { entry: null, parent, register: null, batch: run, ...(by ? { run: by } : {}) });
}

/**
 * The sentence for a step the pass leaves out because it would copy a secret or file field. It names the spelling and
 * never the value, since the sentence is read by whoever reads the run or the list's refusals.
 */
const copied = (rule: string, spelled: string, into: string): string =>
  `rule.${rule} would put ${spelled} into ${into}, and ${spelled} reads what a secret or file field holds, which is copied only into another secret or file field. That step was not taken.`;

/** A `list` is its items, an `enum` is its one value, and anything else is nothing to cross. */
const asValues = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(String) : typeof value === 'string' && value ? [value] : [];

/**
 * The `once_per` key, and the ONE place it is spelled.
 *
 * JSON RATHER THAN `join(':')`, because a separator that can appear in a value is not a separator:
 * `(Acme, INV:2026)` and `(Acme:INV, 2026)` came to one key, and one of those two rows never fired.
 *
 * AND A TOKEN THE ROW HAS NO VALUE FOR FALLS BACK TO THE ROW. Every row missing every named field
 * used to share the single key `<rule>::`, so the rule fired for the first of them and was
 * suppressed for all the rest for ever. Once-per-row is the safe reading: it still dedupes, and it
 * cannot collapse two rows onto one key.
 *
 * `null` MEANS THE RULE DECLARED NO `once_per` — which is a different thing from a key it could not
 * compute, and the caller treats the two differently.
 */
export function onceKey(rule: RuleDecl, entry: Entry): string | null {
  if (!rule.once_per?.length) return null;
  const parts = rule.once_per.map((t) => {
    if (t === 'entry') return entry.id;
    const value = entry.fields[t];
    return value === undefined || value === null || value === '' ? entry.id : String(value);
  });
  return JSON.stringify([rule.rule, ...parts]);
}

export function marker(sql: Sql, mint: () => string, nowMs: number, key: string, payload: unknown, pending: boolean): boolean {
  if (sql.one("SELECT 1 AS x FROM schedule WHERE kind = 'rule' AND key = ?", key)) return false;
  sql.exec(
    `INSERT INTO schedule (id, due_at, kind, key, payload, state, attempts) VALUES (?, ?, 'rule', ?, ?, ?, 0)`,
    mint(),
    instant(nowMs),
    key,
    JSON.stringify(payload),
    pending ? 'pending' : 'done',
  );
  return true;
}

/**
 * The key of one firing of an inline rule that declares `limits.runs_per_day`. `flow.` because a rule's id cannot hold
 * a dot, so no reminder (`<rule>:<row>`) and no `once_per` key (a JSON array) can fall in the range `firedToday` reads.
 */
const FIRED = 'flow.fired:';
const firedFrom = (rule: string): string => `${FIRED}${rule}:`;
/** The first key past every key of `firedFrom(rule)`: `;` is the character after `:`. */
const firedTo = (rule: string): string => `${FIRED}${rule};`;

/**
 * How many times an inline rule fired in the last twenty-four hours, as a run's day is counted (`flow.ts`'s `startRun`).
 *
 * A `schedule` ROW PER FIRING, DONE AND NEVER DUE, for the reason `once_per` is one: the table's unique `(kind, key)`
 * index is the one this reads by, and an inline firing leaves no run row to count. Only a rule that declares the limit
 * writes one, at most its limit a day, and `pruneFirings` takes them once a day old.
 */
export function firedToday(deps: Pick<RulesDeps, 'sql' | 'nowMs'>, rule: string): number {
  return (
    deps.sql.one<{ n: number }>(
      "SELECT count(*) AS n FROM schedule WHERE kind = 'rule' AND key >= ? AND key < ? AND due_at > ?",
      firedFrom(rule),
      firedTo(rule),
      instant(deps.nowMs - DAY_MS),
    )?.n ?? 0
  );
}

/**
 * ONE KEY PER FIRING, NOT PER BATCH. Keyed by the batch alone, a batch that fired the rule on every row it wrote was
 * counted as one firing, so `runs_per_day` held nothing back from a bulk write. A minted id makes every
 * firing its own row; a batch that rolls back takes its rows with it, since they are written inside it.
 */
function countFiring(deps: RulesDeps, rule: string, batch: string): void {
  marker(deps.sql, deps.mint, deps.nowMs, `${firedFrom(rule)}${batch}:${deps.mint()}`, {}, false);
}

/**
 * One more firing on a rule's standing count (`rule_stat`, migration 34), with when and on which row.
 *
 * NOT THE DAY'S MARKERS ABOVE. Those are kept only for a rule with a limit and pruned after a day; this is one row per
 * rule, kept for ever, so the Automations page can say how many rows a rule has filed and the word "never" for one
 * that has filed none. An inline firing raises it where the pass did something, and a run where `startRun` opens one;
 * a tried run (`flow-try.ts`) goes through `openRun` alone and counts nothing.
 */
export function raiseStat(sql: Sql, rule: string, row: string | null, nowMs: number): void {
  const at = instant(nowMs);
  sql.exec(
    `INSERT INTO rule_stat (rule, fired, last_at, last_row) VALUES (?, 1, ?, ?)
     ON CONFLICT (rule) DO UPDATE SET fired = fired + 1, last_at = excluded.last_at, last_row = excluded.last_row`,
    rule,
    at,
    row,
  );
  /* AND THE SAME FIRING ON ITS MONTH'S COUNT (`rule_month`, migration 48), the UTC month of the instant, so "this month"
     over a rule is a count of this month and not the whole count's last date. */
  sql.exec(
    'INSERT INTO rule_month (rule, month, fired) VALUES (?, ?, 1) ON CONFLICT (rule, month) DO UPDATE SET fired = fired + 1',
    rule,
    at.slice(0, 7),
  );
}

/** Every firing counted more than a day ago, which no limit reads any more. The hourly sweep calls it. */
export function pruneFirings(sql: Sql, nowMs: number): void {
  sql.exec("DELETE FROM schedule WHERE kind = 'rule' AND key >= ? AND key < ? AND due_at <= ?", FIRED, 'flow.fired;', instant(nowMs - DAY_MS));
}

/* ── what it would do ─────────────────────────────────────────── */

export type DryRun = {
  /** Rows the candidate's `when` selects at all. */
  matches: number;
  /** Rows it walked. A ceiling, so a register of a million does not become a request of a million. */
  rows: number;
  /** Rows where it is the first to set its field — or where it sets none, and simply fires. */
  won: number;
  /** Rows where an earlier rule had already set that field. */
  lost: number;
  /** Which rule took them, by name. This is the whole answer to "why did nothing happen". */
  takenBy: Record<string, number>;
  /** Rows whose `once_per` marker already exists, so it would fire on none of them again. */
  suppressed: number;
  /**
   * Rows it would fill: not taken by an earlier rule, not already fired for, and with the field it sets still empty
   * (every such row, for a rule that sets no field). What a "run again" sheet says before the press.
   */
  filled: number;
  /** The rest of `matches`: taken by another rule, already fired for, or already holding a value. The two add up. */
  left: number;
  /** The first twenty, with what it would do to each. */
  sample: { spoken: string; would: string[]; reason?: string }[];
};

/**
 * What a rule WOULD do, without doing any of it.
 *
 * THIS IS THE FEATURE, not a debugging aid. A rule is a thing that changes rows while nobody is
 * looking, and the honest way to introduce one is to say "this matches 38 rows, wins on 31, loses 7
 * to `chase-late`, and here are the first twenty with what it would do" — BEFORE it is turned on.
 * Every product that ships rules without this ships a feature people are afraid of.
 *
 * IT RANKS THE CANDIDATE AMONG THE REAL RULES, with the id it would have. Which rules run before it
 * is the whole of what it will and will not get to do, and a preview that ignored the others would
 * be a preview of a record with one rule in it.
 *
 * NO WRITES, and not merely that they are skipped: nothing here calls the write path at all, so
 * there is no path by which a preview becomes a change.
 *
 * `reads` IS WHO IS ASKING, AS `list` TAKES IT, AND IT NARROWS THE CANDIDATE ALONE. A `ref` value in the candidate's
 * `when` is a title the compiler looks up in the list the ref points at, and with the plain context it looked there
 * whoever asked: measured, a member held to `append` on Clients could preview `client is Acme Holdings` over Money as
 * `matches 1 of 1` and `client is Bolt Ltd` as `0 of 1`, one guess per call at which client her rows belong to, while
 * `list` answered 0 rows for both.
 *
 * AND THE RULES IT IS RANKED AGAINST ARE ASKED WITH THE SAME `reads`. They were left on the pass's context, on the
 * grounds that an installed rule runs on every write whoever makes it, but this walk is not a write: it names, row by
 * row, which rule takes each one. Measured: `rule.acme` (`client is Acme Holdings`, setting `note`) was installed after
 * three Billed rows were written, so it had run on none of them, and a member refused Clients previewing a rule that
 * sets `note` read `takenBy: { acme: 1 }` and "acme sets note first" on `billed#1` alone: the Acme row among three,
 * told apart by a title she may not read. Asked with her reads, the installed rule's `when` answers her what `list`
 * answers her, and the preview says the same whether that title is on a row or on none. Counting such a row as
 * `withheld` instead would not do, since a count of rows withheld is the count of Acme's rows.
 */
export function dryRun(deps: RulesDeps, candidate: RuleDecl, limit = PREVIEW, reads?: (register: string) => boolean): Result<DryRun> {
  const schema = deps.schemaOf(candidate.register);
  if (!schema)
    return {
      ok: false,
      refusal: { code: 'REGISTER_UNKNOWN', fix: `There is no register called ${candidate.register}.`, at: 'register' },
    };

  const asker: RulesDeps = reads === undefined ? deps : { ...deps, ctx: { ...deps.ctx, reads } };
  const said = predicateOf(candidate.when, schema, asker.ctx);
  if (said.bad.length) return { ok: false, refusal: said.bad[0]! };
  /* A PREVIEW OF A BODY THE INSTALL REFUSES IS THE PREVIEW BEING WRONG: measured after the fill guard, note: 5 and
     notify.say: true were previewed as "note 5" and "notify true" for bodies install refuses. */
  const linted = inlineFault(`rule.${candidate.rule}`, candidate as FlowDecl);
  if (linted) return { ok: false, refusal: linted };
  /* AND A LINK'S FILTER IS ASKED OF THE LIST IT FILTERS, so a field that list does not have is said here and not
     previewed as "nothing bears that name" on every row. */
  const unlinked = linkFault(deps.schemaOf, candidate) ?? alsoFault(deps.schemaOf, candidate);
  if (unlinked) return { ok: false, refusal: unlinked };

  /* The candidate takes its place among the others by the same ordering the pass uses — replacing a
     rule of its own name, because previewing a CHANGE to a live rule is the common case. */
  const others = deps.rules(candidate.register).filter((r) => r.rule !== candidate.rule);
  const ranked = order([...others, candidate]);
  const setField = (r: RuleDecl): string | null => {
    for (const a of Array.isArray(r.then) ? r.then : []) if ('set' in a) return a.set.field;
    return null;
  };
  const mine = setField(candidate);

  const out: DryRun = { matches: 0, rows: 0, won: 0, lost: 0, takenBy: {}, suppressed: 0, filled: 0, left: 0, sample: [] };
  /* THE KEYS THIS WALK WOULD MINT, not only the ones already in the table. Three rows sharing a
     party is one notification, and a preview whose whole job is to say what will happen promised
     three — which is the preview being wrong about the feature it exists to explain. */
  const minted = new Set<string>();

  const rows = deps.sql.all<{ id: string }>(
    'SELECT id FROM entry WHERE register = ? AND deleted_at IS NULL ORDER BY seq LIMIT ?',
    candidate.register,
    /* CLAMPED AT BOTH ENDS, and it was clamped at one. `Math.max(1, …)` stopped a limit of zero and
       let a limit of a billion through: the caller sends the rule AND the ceiling, and this loop
       calls `deps.entry(id)` and `matches` per row on a single-threaded object. `applyRule` below
       has taken `Math.min(…, MOST)` since it was written; this is the same clamp on the read half.
       A preview of more rows than a person will read is not a preview. */
    Math.min(Math.max(1, Math.floor(limit)), PREVIEW),
  );

  for (const { id } of rows) {
    const entry = deps.entry(id);
    if (!entry) continue;
    out.rows++;
    if (!matches(asker, schema, candidate, entry)) continue;
    out.matches++;

    /* WHO GOT THERE FIRST. Walking the rules ahead of the candidate with the same precedence the
       pass uses is the only way to answer "why did nothing happen" with a name rather than a shrug. */
    let taken: string | null = null;
    let why = '';
    for (const r of ranked) {
      if (r.rule === candidate.rule) break;
      if (!matches(asker, schema, r, entry)) continue;
      /* AN EARLIER `stop` ENDS THE PASS, and a preview that ignored it promised changes that never
         happen — the preview being wrong about the pass it exists to explain. It is checked before
         the field contest, because a rule that stops takes the row whether or not it sets anything. */
      if ((Array.isArray(r.then) ? r.then : []).some((a) => 'stop' in a)) {
        taken = r.rule;
        why = `${r.rule} stops the pass first`;
        break;
      }
      if (mine && setField(r) === mine) {
        taken = r.rule;
        why = `${r.rule} sets ${mine} first`;
        break;
      }
    }

    if (taken) {
      out.lost++;
      out.takenBy[taken] = (out.takenBy[taken] ?? 0) + 1;
    } else out.won++;

    let suppressed: string | null = null;
    const key = onceKey(candidate, entry);
    if (key !== null) {
      if (minted.has(key)) suppressed = 'an earlier row in this preview takes the same once_per key';
      else if (deps.sql.one("SELECT 1 AS x FROM schedule WHERE kind = 'rule' AND key = ?", key))
        suppressed = 'it has already fired for this key';
      if (suppressed) out.suppressed++;
      else minted.add(key);
    }
    /* A ROW ALREADY HOLDING THE VALUE IS LEFT, as `applyRule` leaves it: somebody put it there. */
    const held = mine !== null && entry.fields[mine] !== undefined && entry.fields[mine] !== null && entry.fields[mine] !== '';
    if (taken || suppressed || held) out.left++;
    else out.filled++;

    if (out.sample.length < 20)
      out.sample.push({
        spoken: entry.seq === null ? entry.id : `${entry.register}#${entry.seq}`,
        would: taken || suppressed ? [] : describe(deps, candidate, entry),
        ...(taken
          ? { reason: why }
          : suppressed
            ? { reason: suppressed }
            : {}),
      });
  }

  return { ok: true, value: out };
}

/** What the actions would come to on one row, in the words a person would use. */
function describe(deps: RulesDeps, rule: RuleDecl, entry: Entry): string[] {
  const out: string[] = [];
  for (const a of Array.isArray(rule.then) ? rule.then : []) {
    if ('tag' in a) out.push(`tag ${a.tag}`);
    else if ('untag' in a) out.push(`untag ${a.untag}`);
    else if ('set' in a) out.push(`set ${a.set.field} to ${fill(a.set.to, entry, deps.nowMs)}`);
    else if ('move' in a) out.push(`move to ${a.move}`);
    else if ('note' in a) out.push(`note ${fill(a.note, entry, deps.nowMs)}`);
    else if ('notify' in a) out.push(`notify ${fill(a.notify.say, entry, deps.nowMs)}`);
    else if ('schedule' in a) out.push(`in ${a.schedule.in}, ${fill(a.schedule.note, entry, deps.nowMs)}`);
    else if ('stop' in a) out.push('stop');
    else if ('run' in a) out.push(`run ${a.run}, which a rule applied to rows already there does not send`);
    else if ('create' in a) out.push(`create up to ${a.create.bound} rows in ${a.create.register}`);
    else if ('link' in a) {
      /* A LINK THAT CANNOT BE MADE IS NAMED HERE, because the preview is where somebody finds out
         that half their rows name a party nobody has a row for. */
      /* THE SAME READ AS THE PASS ITSELF (`linkOf`), so a rung the pass would climb is one the preview climbs. An exact
         link reads as it always has; a link found further down says how, since that is what a person checks before
         turning a `starts` or `contains` category on. */
      const found = linkOf(deps, linkTo(a.link.to, entry, (text) => fill(text, entry, deps.nowMs)), fill(a.link.to.value, entry, deps.nowMs));
      /* ONE LINE FOR A LINK THAT WRITES TWO FIELDS, since it writes both or neither. */
      const fields = typeof a.link.to.also === 'string' ? `${a.link.field} and ${a.link.to.also}` : a.link.field;
      out.push('id' in found ? `link ${fields}${RUNG_SAID[found.rung]}` : `link ${fields}: ${found.none}`);
    }
  }
  return out;
}

/* ── the bulk recategorise ────────────────────────────────────────────────── */

export type Applied = {
  rule: string;
  /** Rows the rule matched and had not already fired on. */
  matched: number;
  /** Rows it actually changed. `0` when `dry`. */
  applied: number;
  /** Rows it matched and left alone, because the field it sets already has a value. */
  kept: number;
  /** Matched rows past the ceiling. Run it again to take the next page. */
  remaining: number;
  /** What it did, in the words a person would use, for the first twenty. */
  sample: { spoken: string; would: string[] }[];
  refusals: Refusal[];
  /** Calls the rule would have run on these rows and did not, because a bulk apply sends nothing. Absent when none. */
  calls_skipped?: number;
  /** Rows it filled, or would fill when `dry`. */
  filled: number;
  /** Every other row it matched: already holding a value, past the page, or refused. `filled + left` is `matched + kept`. */
  left: number;
};

/** One page of a bulk apply. Past it, run it again — a `while` nobody can stop is not a feature. */
const PAGE = 200;
const MOST = 1000;

/**
 * The most rows a preview reads, and its default: the same number, so the parameter narrows and
 * never widens.
 *
 * HIGHER THAN `MOST` BECAUSE IT WRITES NOTHING. A preview's cost is one scan; an apply's cost is a
 * scan and a write per match, and a notification per match after that.
 */
const PREVIEW = 5000;

/**
 * Run one rule over the rows that are already there.
 *
 * THE PREDECESSOR'S BULK RECATEGORISE, and the reason it is a separate verb: a rule fires on a
 * write, so a rule written today has never seen the four hundred rows written before it. Without
 * this, turning one on means editing every one of those rows by hand to make it fire.
 *
 * IT ONLY FILLS GAPS. A row whose field the rule would set ALREADY HAS A VALUE is left alone, and
 * counted, because somebody put that value there — the write path's own PINNED rule says a mechanism
 * may not overwrite what a person set, and a bulk apply that ignored it would be the one way round
 * it.
 *
 * THE DRY RUN COMES FIRST, and it is the same walk with nothing written. That is why `dry` is a parameter here
 * rather than a second method: two code paths would be two answers.
 *
 * `batch` IS ONE PRESS. Given, every row's write goes under it, so one Undo of that batch takes the lot back; without
 * it each row is its own batch, as an install's walk over old rows has always been.
 */
export function applyRule(deps: RulesDeps, rule: RuleDecl, opts: { dry?: boolean; limit?: number; batch?: string } = {}): Result<Applied> {
  const schema = deps.schemaOf(rule.register);
  if (!schema)
    return { ok: false, refusal: { code: 'REGISTER_UNKNOWN', fix: `There is no register called ${rule.register}.`, at: 'register' } };

  const said = predicateOf(rule.when, schema, deps.ctx);
  if (said.bad.length) return { ok: false, refusal: said.bad[0]! };

  const limit = Math.min(Math.max(1, Math.floor(opts.limit ?? PAGE)), MOST);
  const out: Applied = { rule: rule.rule, matched: 0, applied: 0, kept: 0, remaining: 0, sample: [], refusals: [], filled: 0, left: 0 };

  /* THE FIELD IT SETS, if it sets one. A rule that only tags or notifies has no gap to fill, so
     every row it matches is one it would act on. */
  const mine = (Array.isArray(rule.then) ? rule.then : []).find((a) => 'set' in a) as { set?: { field: string } } | undefined;
  const field = mine?.set?.field ?? null;

  /* ONE RULE, and the pass is the ordinary one. Filtering the declarations rather than copying the
     action loop is what stops this becoming a second definition of what a rule does. */
  /* AND NO `call`. Rows that were already there are not news to anybody, so a bulk apply queues no calls. */
  const { call: _sendsNothing, ...quiet } = deps;
  const only: RulesDeps = { ...quiet, rules: (register) => deps.rules(register).filter((r) => r.rule === rule.rule) };
  const runsPerRow = (Array.isArray(rule.then) ? rule.then : []).filter((a) => 'run' in a).length;
  let skipped = 0;

  for (const { id } of deps.sql.all<{ id: string }>(
    'SELECT id FROM entry WHERE register = ? AND deleted_at IS NULL ORDER BY seq',
    rule.register,
  )) {
    const entry = deps.entry(id);
    if (!entry || !matches(deps, schema, rule, entry)) continue;

    /* A ROW WHOSE FIELD ALREADY HAS A VALUE IS LEFT ALONE. Somebody put it there, and the write
       path's PINNED rule says a mechanism may not overwrite what a person set — a bulk apply that
       ignored that would be the one way round it. */
    if (field !== null && entry.fields[field] !== undefined && entry.fields[field] !== null && entry.fields[field] !== '') {
      out.kept++;
      continue;
    }

    out.matched++;
    if (out.matched > limit) {
      out.remaining++;
      continue;
    }

    const spoken = entry.seq === null ? entry.id : `${entry.register}#${entry.seq}`;
    if (out.sample.length < 20) out.sample.push({ spoken, would: describe(deps, rule, entry) });
    if (opts.dry) {
      skipped += runsPerRow;
      out.filled++;
      continue;
    }

    const outcome = runRules(only, { entry, register: rule.register, batch: opts.batch ?? deps.mint(), actor: `rule:${rule.rule}` });
    out.refusals.push(...outcome.refused);
    skipped += outcome.calls.filter((c) => c.outcome === 'skipped').length;
    if (outcome.fired.length) out.applied++;
  }

  if (!opts.dry) out.filled = out.applied;
  out.left = out.matched + out.kept - out.filled;
  return ok(skipped > 0 ? { ...out, calls_skipped: skipped } : out);
}
