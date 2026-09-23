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
import { jsonPath, compile, type Predicate, type Schema } from '@braindog/where';

import type { Entry } from './index.ts';
import { exponentOf } from './ingest.ts';
import { instant } from './migrate.ts';
import { spanMs } from './vault.ts';
import { predicateOf, type EvalContext } from './metrics.ts';
import { inlineFault } from './flow-lint.ts';
import { observe } from './observe.ts';

export type RuleAction =
  | { tag: string }
  | { untag: string }
  | { set: { field: string; to: string } }
  | { move: string }
  | { link: { field: string; to: { register: string; by: string; value: string } } }
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
 * What starts an automation. `loop/research-shell-automations.md` §3 and §4.1.
 *
 * ABSENT MEANS `written`, WHICH IS WHAT EVERY RULE MEANT BEFORE THIS TYPE EXISTED. That is the whole reason an automation
 * is a rule that grew a trigger rather than a ninth kind: the rules already installed in somebody's record are
 * automations the canvas can open, with no migration and no second engine doing the same job.
 *
 * ONE KEY, and `every` is the only one with companions (`at`, `day`). A body naming two triggers is refused rather than
 * read as "either", because nothing downstream could say which one started a run.
 */
export type Trigger =
  | { written: { register: string; op?: ('create' | 'update' | 'delete')[]; fields?: string[]; from_rules?: boolean } }
  | { arrival: { ingest?: string; channel?: 'webhook' | 'email' | 'paste' | 'api' | 'pull'; state?: string[] } }
  | { every: string; at?: string; day?: string }
  | { metric: { id: string; crosses: 'target' | { lte: number } | { gte: number } } }
  /** Reserved. A run's own asks resume it without this, and the lint refuses it as not in this build. */
  | { decided: { automation?: string } }
  | { manual: true };

/**
 * One step of an automation: a branch, a transform, something that waits, or any action a rule already has.
 *
 * EVERY STEP IS A CLOSED VERB THAT NAMES A DECLARATION, never an address and never code. `call` names a declared call
 * whose host, key and fields were approved at install, and `script` names a `script.<id>` whose runtime is another
 * brief's; that is what keeps 04 §7's security argument an enumeration over closed lists.
 */
export type Step =
  | { if: Predicate | string; then: Step[]; else?: Step[] }
  | { set_var: { name: string; to: string } }
  | { script: { id: string; input?: Record<string, string>; as: string } }
  | { call: { ingest: string; as?: string } }
  | { ask_spark: { question: string; about?: string[]; as: string; shape?: 'text' | 'number' | 'choice'; choices?: string[] } }
  | { ask_person: { question: string; options: string[]; as: string; to?: string; wait?: string } }
  | { wait: string }
  | RuleAction;

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
  /** A question through the gate. It writes a suggestion and changes nothing else. */
  suggest: (question: string, options: string[], actor: string) => Result<{ id: string }>;
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

  for (const rule of order(deps.rules(fired.register))) {
    if (!matches(deps, schema, rule, fired.entry)) continue;

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
    const said: { text: string; urgent: boolean }[] = [];
    /* HELD LIKE THE NOTES ARE, until the write has happened. A rule whose write the register then
       refuses has not done anything, and a reminder about what it did not do is worse than silence. */
    const later: { in: string; note: string }[] = [];
    const made: { register: string; each?: string[]; bound: number; fields: Record<string, string> }[] = [];
    const asks: { question: string; options: string[] }[] = [];
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

    for (const [i, action] of then.entries()) {
      /* A VERB ONLY A STEP HAS IS NOT ACTED ON, NOR IS WHAT SITS BESIDE IT. `inlineFault` refuses one at install, and a
         body stored before that lint still reaches here (`loop/research-batch-forty-two-audit.md` finding 3): measured
         on 23 September, `{ if: 'what is Nothing', then: [], set: note }` set the note on a row the condition excluded,
         because the chain below takes the first action an item carries, and `{ wait: 1h, set: note }` wrote the note at
         once. The lint is asked of the one item, so the pass and the install cannot disagree about which verbs those are. */
      const step = inlineFault(`rule.${rule.rule}`, { ...rule, then: [action] } as FlowDecl);
      if (step?.code === 'NOT_IN_THIS_BUILD') {
        const here = `then[${i}]`;
        undone(step.at?.replace('then[0]', here) ?? here, 'NOT_IN_THIS_BUILD', step.fix.replace('then[0]', here));
        continue;
      }
      /* A TAG OR A MOVE THAT IS NOT TEXT IS LEFT OUT OF THE PATCH, since the list refuses it and the rule's whole patch
         went with it: a stored `tag: 5` (audit forty-one, finding 3) and `move: 5` (forty-two, finding 3) each left the
         Water row without the `set` beside them. No `fill` reads either word, so neither has `fill`'s guard. The verb is
         found in the chain's own order, so the word asked about is the one the chain below would act on. */
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
        setFields.add(action.set.field);
        patch[action.set.field] = fill(action.set.to, fired.entry, deps.nowMs);
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
           rule that picked one would pick a different one next week. */
        /* `by` IS A FIELD ID FROM A DECLARATION, and it was inlined into the path with no grammar
           check — see the note on `jsonPath`. A rule can arrive in a pack. */
        const found = deps.sql.all<{ id: string }>(
          `SELECT id FROM entry WHERE register = ? AND deleted_at IS NULL AND json_extract(fields, '${jsonPath(action.link.to.by)}') = ? LIMIT 2`,
          action.link.to.register,
          fill(action.link.to.value, fired.entry, deps.nowMs),
        );
        if (found.length === 1) {
          patch[action.link.field] = found[0]!.id;
          did.push(`link ${action.link.field}`);
        }
      } else if ('note' in action) {
        /* HELD UNTIL THE WRITE HAS HAPPENED. A rule whose write the register then refuses has not
           done anything, and a notification about what it did not do is worse than silence. */
        said.push({ text: fill(action.note, fired.entry, deps.nowMs), urgent: false });
        did.push('note');
      } else if ('notify' in action) {
        said.push({ text: fill(action.notify.say, fired.entry, deps.nowMs), urgent: action.notify.urgent === true });
        did.push('notify');
      } else if ('schedule' in action) {
        later.push({ in: action.schedule.in, note: fill(action.schedule.note, fired.entry, deps.nowMs) });
        did.push(`schedule ${action.schedule.in}`);
      } else if ('create' in action) {
        made.push(action.create);
        did.push(`create in ${action.create.register}`);
      } else if ('suggest' in action) {
        asks.push(action.suggest);
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

    for (const one of said)
      /* AN URGENT ONE GOES THROUGH THE ROUTER, which writes the same event and then interrupts —
         once an hour per record, 09 §4. A plain one is the event and nothing else, which is what
         "batch by default" means: it lands in the digest. */
      if (one.urgent) deps.interrupt({ actor: `rule:${rule.rule}`, say: one.text, url: `/${fired.entry.id}` });
      else deps.note(fired.entry, `rule:${rule.rule}`, one.text, fired.batch);

    /* THE EXPANSION IS LAST, and it shares the triggering write's batch — so "undo this expansion"
       is one query rather than an archaeology of timestamps. */
    let happened = Object.keys(patch).length > 0 || said.length > 0 || later.length > 0;
    for (const spec of made) {
      const grown = expand(deps, rule, spec, fired);
      if (grown.refusals.length) out.refused.push(...grown.refusals);
      if (grown.grew) happened = true;
    }
    for (const ask of asks) {
      const opened = deps.suggest(fill(ask.question, fired.entry, deps.nowMs), ask.options, `rule:${rule.rule}`);
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
 * `set: { to: 5 }` or `note: 7`, and this line was `template.replace`: measured on 23 September, such a rule threw
 * `template.replace is not a function` out of every write to its list, and the row a person asked for was lost with it.
 */
export function fill(template: string, row: Entry, nowMs = Date.now()): string {
  if (typeof template !== 'string') return wordsOf(template);
  return template.replace(/\{\{(\w+)(?::(\w+))?\}\}/g, (_whole, head: string, tail?: string) => {
    if (head === 'id') return row.seq === null ? row.id : `${row.register}#${row.seq}`;
    const field = tail ?? head;
    const kind = tail ? head : null;
    const value = row.fields[field];
    if (value === null || value === undefined || value === '') return '—';

    if (kind === 'money' || (!kind && isMoney(value)))
      /* THE CURRENCY'S OWN DECIMALS. It was `amount / 100` to two places for every code, so JPY 129,900
         was written `JPY 1299.00` and KWD 1.500 was `KWD 15.00`, into patches, notes and questions. */
      return isMoney(value) ? `${value.currency} ${(value.amount / 10 ** exponentOf(value.currency)).toFixed(exponentOf(value.currency))}` : String(value);
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
function expand(
  deps: RulesDeps,
  rule: RuleDecl,
  spec: { register: string; each?: string[]; bound: number; fields: Record<string, string> },
  fired: Fired,
): { refusals: Refusal[]; grew: boolean } {
  const nothing = (refusal: Refusal) => ({ refusals: [refusal], grew: false });

  const bound = Math.floor(spec.bound);
  if (!Number.isFinite(bound) || bound < 1 || bound > CREATE_CEILING)
    return nothing(
      {
        code: 'OUT_OF_BOUNDS',
        fix: `${rule.rule} declares a bound of ${String(spec.bound)}, and a bound is between 1 and ${CREATE_CEILING}.`,
        at: 'bound',
      },
    );

  const axes = (spec.each ?? []).map((f) => asValues(fired.entry.fields[f]));
  if (axes.length > 2)
    return nothing({
      /* TWO IS A MATRIX. Three is a cube, and nobody has ever wanted a cube. */
      code: 'OUT_OF_BOUNDS',
      fix: `${rule.rule} crosses ${axes.length} fields, and two is the most a matrix can be.`,
      at: 'each',
    });

  const tuples: string[][] = axes.length === 0 ? [[]] : axes.length === 1 ? axes[0]!.map((a) => [a]) : axes[0]!.flatMap((a) => axes[1]!.map((b) => [a, b]));
  if (tuples.length > bound)
    return nothing({
      code: 'OUT_OF_BOUNDS',
      fix: `${rule.rule} would make ${tuples.length} rows in ${spec.register}, and its bound is ${bound}. Nothing was created.`,
      at: 'bound',
    });

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
        rule.rule,
        fired.entry.id,
        each,
      )
    )
      continue;

    /* A VALUE THAT IS NOT TEXT GOES THROUGH AS IT WAS WRITTEN. `withEach` called `.replace` on each one, so a create
       holding `tags: ["late"]`, installed before the lint refused it, threw out of every write to the parent's list
       (measured on 23 September). Passed through, the list reads it as its own type, or refuses it as it would any
       other value. */
    const fields: Record<string, unknown> = {};
    for (const [id, template] of Object.entries(spec.fields))
      fields[id] = typeof template === 'string' ? fill(withEach(template, tuple), fired.entry, deps.nowMs) : template;

    const made = deps.generate(spec.register, fields, `rule:${rule.rule}`, fired.batch, {
      _rule: rule.rule,
      _parent: fired.entry.id,
      _each: each,
    });
    if (refused(made)) out.push(made.refusal);
    else grew = true;
  }
  return { refusals: out, grew };
}

/**
 * `{{each.0}}` and `{{each.1}}`, resolved before the ordinary template is.
 *
 * A SEPARATE PASS because the tuple is not a field on the row — it is the position in the matrix,
 * which is the only thing the generated row knows that its parent does not.
 */
const withEach = (template: string, tuple: string[]): string =>
  template.replace(/\{\{each\.(\d)\}\}/g, (_w, i: string) => tuple[Number(i)] ?? '');

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
 * whoever asked: `loop/research-batch-thirty-eight-audit.md` finding 1 had a member held to `append` on Clients preview
 * `client is Acme Holdings` over Money as `matches 1 of 1` and `client is Bolt Ltd` as `0 of 1`, one guess per call at
 * which client her rows belong to, while `list` answered 0 rows for both.
 *
 * AND THE RULES IT IS RANKED AGAINST ARE ASKED WITH THE SAME `reads`. They were left on the pass's context, on the
 * grounds that an installed rule runs on every write whoever makes it, but this walk is not a write: it names, row by
 * row, which rule takes each one. `loop/research-batch-forty-audit.md` finding 8 installed `rule.acme` (`client is Acme
 * Holdings`, setting `note`) after three Billed rows were written, so it had run on none of them, and a member refused
 * Clients previewing a rule that sets `note` read `takenBy: { acme: 1 }` and "acme sets note first" on `billed#1`
 * alone: the Acme row among three, told apart by a title she may not read. Asked with her reads, the installed rule's
 * `when` answers her what `list` answers her, and the preview says the same whether that title is on a row or on none.
 * The audit's brief counted such a row as `withheld` instead, and a count of rows withheld is the count of Acme's rows.
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
  /* A PREVIEW OF A BODY THE INSTALL REFUSES IS THE PREVIEW BEING WRONG: measured on 23 September after the fill guard,
     note: 5 and notify.say: true were previewed as "note 5" and "notify true" for bodies install refuses (audit forty,
     finding 6). */
  const linted = inlineFault(`rule.${candidate.rule}`, candidate as FlowDecl);
  if (linted) return { ok: false, refusal: linted };

  /* The candidate takes its place among the others by the same ordering the pass uses — replacing a
     rule of its own name, because previewing a CHANGE to a live rule is the common case. */
  const others = deps.rules(candidate.register).filter((r) => r.rule !== candidate.rule);
  const ranked = order([...others, candidate]);
  const setField = (r: RuleDecl): string | null => {
    for (const a of Array.isArray(r.then) ? r.then : []) if ('set' in a) return a.set.field;
    return null;
  };
  const mine = setField(candidate);

  const out: DryRun = { matches: 0, rows: 0, won: 0, lost: 0, takenBy: {}, suppressed: 0, sample: [] };
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
    else if ('link' in a) {
      /* A LINK THAT CANNOT BE MADE IS NAMED HERE, because the preview is where somebody finds out
         that half their rows name a party nobody has a row for. */
      /* THE SAME GUARD AS THE PASS ITSELF. One of the two call sites was fixed and this one, 418
         lines below it, builds the identical query from the identical declaration value. */
      const found = deps.sql.all<{ id: string }>(
        `SELECT id FROM entry WHERE register = ? AND deleted_at IS NULL AND json_extract(fields, '${jsonPath(a.link.to.by)}') = ? LIMIT 2`,
        a.link.to.register,
        fill(a.link.to.value, entry, deps.nowMs),
      );
      out.push(
        found.length === 1
          ? `link ${a.link.field}`
          : `link ${a.link.field}: ${found.length === 0 ? 'nothing bears that name' : 'two rows bear that name'}`,
      );
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
 * AND THERE IS NO UNDO, BY DESIGN. Sixty writes is not a thing to reverse from a button; the DRY RUN
 * is the undo, and it is the same walk with nothing written. That is why `dry` is a parameter here
 * rather than a second method: two code paths would be two answers.
 */
export function applyRule(deps: RulesDeps, rule: RuleDecl, opts: { dry?: boolean; limit?: number } = {}): Result<Applied> {
  const schema = deps.schemaOf(rule.register);
  if (!schema)
    return { ok: false, refusal: { code: 'REGISTER_UNKNOWN', fix: `There is no register called ${rule.register}.`, at: 'register' } };

  const said = predicateOf(rule.when, schema, deps.ctx);
  if (said.bad.length) return { ok: false, refusal: said.bad[0]! };

  const limit = Math.min(Math.max(1, Math.floor(opts.limit ?? PAGE)), MOST);
  const out: Applied = { rule: rule.rule, matched: 0, applied: 0, kept: 0, remaining: 0, sample: [], refusals: [] };

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
      continue;
    }

    const outcome = runRules(only, { entry, register: rule.register, batch: deps.mint(), actor: `rule:${rule.rule}` });
    out.refusals.push(...outcome.refused);
    skipped += outcome.calls.filter((c) => c.outcome === 'skipped').length;
    if (outcome.fired.length) out.applied++;
  }

  return ok(skipped > 0 ? { ...out, calls_skipped: skipped } : out);
}
