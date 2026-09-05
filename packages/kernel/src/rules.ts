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
import { compile, type Predicate, type Schema } from '@braindog/where';

import type { Entry } from './index.ts';
import { instant } from './migrate.ts';
import { predicateOf, type EvalContext } from './metrics.ts';

export type RuleAction =
  | { tag: string }
  | { untag: string }
  | { set: { field: string; to: string } }
  | { move: string }
  | { link: { field: string; to: { register: string; by: string; value: string } } }
  | { note: string }
  | { notify: { say: string; tone?: string; urgent?: boolean } }
  | { stop: true };

export type RuleDecl = {
  rule: string;
  register: string;
  when?: string | Predicate;
  then: RuleAction[];
  /** Lower runs first. The default is a hundred, so a pack's rules sit either side of yours. */
  priority?: number;
  /** Which tuple makes this rule's firing unique. Mandatory on `notify`. */
  once_per?: string[];
};

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
};

export type RulesDeps = {
  sql: Sql;
  rules: (register: string) => RuleDecl[];
  schemaOf: (register: string) => Schema | null;
  ctx: EvalContext;
  /** The write path, re-entered. `cascade: false` is what makes a rule one step. */
  write: (register: string, spoken: string | null, patch: Record<string, unknown>, actor: string, batch: string) => Result<Entry>;
  note: (entry: Entry, actor: string, text: string, batch: string) => void;
  schedule: (key: string, payload: unknown, pending: boolean) => boolean;
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
  const out: RulesOutcome = { fired: [], refused: [], suppressed: [], stopped: false };
  const schema = deps.schemaOf(fired.register);
  if (!schema) return out;

  /* ONE `set` PER FIELD PER PASS, ACROSS RULES. The set is here rather than inside the loop because
     the rule that wins is the first one to reach the field, and a per-rule set would let the second
     one overwrite it. */
  const setFields = new Set<string>();

  for (const rule of order(deps.rules(fired.register))) {
    if (!matches(deps, schema, rule, fired.entry)) continue;

    /* THE MARKER FIRST, so a rule that will notify does not notify twice for one row. It is a
       schedule row because that table already carries exactly-once as a unique index, and a second
       uniqueness mechanism is a second thing that can disagree with the first. */
    const wants = rule.then.some((a) => 'notify' in a);
    if (rule.once_per?.length) {
      const key = `${rule.rule}:${rule.once_per
        .map((t) => (t === 'entry' ? fired.entry.id : String(fired.entry.fields[t] ?? '')))
        .join(':')}`;
      if (!deps.schedule(key, { rule: rule.rule, entry: fired.entry.id, batch: fired.batch }, wants)) {
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
    let stop = false;

    for (const action of rule.then) {
      if ('tag' in action) {
        const tags = new Set(asList(fired.entry.fields.tags));
        tags.add(action.tag);
        patch.tags = [...tags];
        did.push(`tag ${action.tag}`);
      } else if ('untag' in action) {
        const tags = new Set(asList(fired.entry.fields.tags));
        tags.delete(action.untag);
        patch.tags = [...tags];
        did.push(`untag ${action.untag}`);
      } else if ('set' in action) {
        /* THE EARLIER RULE WON, and this one says so rather than overwriting. */
        if (setFields.has(action.set.field)) continue;
        setFields.add(action.set.field);
        patch[action.set.field] = fill(action.set.to, fired.entry);
        did.push(`set ${action.set.field}`);
      } else if ('move' in action) {
        patch.state = action.move;
        did.push(`move ${action.move}`);
      } else if ('link' in action) {
        /* EXACTLY ONE MATCH OR NOTHING. Two rows bearing the name is a question about which, and a
           rule that picked one would pick a different one next week. */
        const found = deps.sql.all<{ id: string }>(
          `SELECT id FROM entry WHERE register = ? AND deleted_at IS NULL AND json_extract(fields, '$.${action.link.to.by}') = ? LIMIT 2`,
          action.link.to.register,
          fill(action.link.to.value, fired.entry),
        );
        if (found.length === 1) {
          patch[action.link.field] = found[0]!.id;
          did.push(`link ${action.link.field}`);
        }
      } else if ('note' in action) {
        deps.note(fired.entry, `rule:${rule.rule}`, fill(action.note, fired.entry), fired.batch);
        did.push('note');
      } else if ('notify' in action) {
        deps.note(fired.entry, `rule:${rule.rule}`, fill(action.notify.say, fired.entry), fired.batch);
        did.push('notify');
      } else if ('stop' in action) {
        stop = true;
      }
    }

    if (Object.keys(patch).length > 0) {
      /* RE-ENTRANT, and that is the point: `immutable_when`, a transition the register forbids, a
         required field — all of them apply to a rule exactly as they apply to a person. A refusal is
         collected and the pass continues; the triggering write is never undone by a rule's refusal. */
      const wrote = deps.write(
        fired.register,
        fired.entry.seq === null ? null : `${fired.register}#${fired.entry.seq}`,
        patch,
        `rule:${rule.rule}`,
        fired.batch,
      );
      if (!wrote.ok) out.refused.push(wrote.refusal);
      else fired.entry = wrote.value;
    }

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
 */
export function fill(template: string, row: Entry, nowMs = Date.now()): string {
  return template.replace(/\{\{(\w+)(?::(\w+))?\}\}/g, (_whole, head: string, tail?: string) => {
    if (head === 'id') return row.seq === null ? row.id : `${row.register}#${row.seq}`;
    const field = tail ?? head;
    const kind = tail ? head : null;
    const value = row.fields[field];
    if (value === null || value === undefined || value === '') return '—';

    if (kind === 'money' || (!kind && isMoney(value)))
      return isMoney(value) ? `${value.currency} ${(value.amount / 100).toFixed(2)}` : String(value);
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

const isMoney = (v: unknown): v is { amount: number; currency: string } =>
  typeof v === 'object' && v !== null && 'amount' in v && 'currency' in v;
const isQuantity = (v: unknown): v is { value: number; unit: string } =>
  typeof v === 'object' && v !== null && 'value' in v && 'unit' in v;

/** The `rule` schedule row's marker, through the one insertion path. `false` means suppressed. */
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
 */
export function dryRun(deps: RulesDeps, candidate: RuleDecl, limit = 5000): Result<DryRun> {
  const schema = deps.schemaOf(candidate.register);
  if (!schema)
    return {
      ok: false,
      refusal: { code: 'REGISTER_UNKNOWN', fix: `There is no register called ${candidate.register}.`, at: 'register' },
    };

  const said = predicateOf(candidate.when, schema, deps.ctx);
  if (said.bad.length) return { ok: false, refusal: said.bad[0]! };

  /* The candidate takes its place among the others by the same ordering the pass uses — replacing a
     rule of its own name, because previewing a CHANGE to a live rule is the common case. */
  const others = deps.rules(candidate.register).filter((r) => r.rule !== candidate.rule);
  const ranked = order([...others, candidate]);
  const setField = (r: RuleDecl): string | null => {
    for (const a of r.then) if ('set' in a) return a.set.field;
    return null;
  };
  const mine = setField(candidate);

  const out: DryRun = { matches: 0, rows: 0, won: 0, lost: 0, takenBy: {}, suppressed: 0, sample: [] };

  const rows = deps.sql.all<{ id: string }>(
    'SELECT id FROM entry WHERE register = ? AND deleted_at IS NULL ORDER BY seq LIMIT ?',
    candidate.register,
    Math.max(1, Math.floor(limit)),
  );

  for (const { id } of rows) {
    const entry = deps.entry(id);
    if (!entry) continue;
    out.rows++;
    if (!matches(deps, schema, candidate, entry)) continue;
    out.matches++;

    /* WHO GOT THERE FIRST. Walking the rules ahead of the candidate with the same precedence the
       pass uses is the only way to answer "why did nothing happen" with a name rather than a shrug. */
    let taken: string | null = null;
    if (mine)
      for (const r of ranked) {
        if (r.rule === candidate.rule) break;
        if (setField(r) === mine && matches(deps, schema, r, entry)) {
          taken = r.rule;
          break;
        }
      }

    if (taken) {
      out.lost++;
      out.takenBy[taken] = (out.takenBy[taken] ?? 0) + 1;
    } else out.won++;

    let suppressed = false;
    if (candidate.once_per?.length) {
      const key = `${candidate.rule}:${candidate.once_per
        .map((t) => (t === 'entry' ? entry.id : String(entry.fields[t] ?? '')))
        .join(':')}`;
      suppressed = Boolean(deps.sql.one("SELECT 1 AS x FROM schedule WHERE kind = 'rule' AND key = ?", key));
      if (suppressed) out.suppressed++;
    }

    if (out.sample.length < 20)
      out.sample.push({
        spoken: entry.seq === null ? entry.id : `${entry.register}#${entry.seq}`,
        would: taken || suppressed ? [] : describe(deps, candidate, entry),
        ...(taken
          ? { reason: `${taken} sets ${mine} first` }
          : suppressed
            ? { reason: 'it has already fired for this row' }
            : {}),
      });
  }

  return { ok: true, value: out };
}

/** What the actions would come to on one row, in the words a person would use. */
function describe(deps: RulesDeps, rule: RuleDecl, entry: Entry): string[] {
  const out: string[] = [];
  for (const a of rule.then) {
    if ('tag' in a) out.push(`tag ${a.tag}`);
    else if ('untag' in a) out.push(`untag ${a.untag}`);
    else if ('set' in a) out.push(`set ${a.set.field} to ${fill(a.set.to, entry, deps.nowMs)}`);
    else if ('move' in a) out.push(`move to ${a.move}`);
    else if ('note' in a) out.push(`note ${fill(a.note, entry, deps.nowMs)}`);
    else if ('notify' in a) out.push(`notify ${fill(a.notify.say, entry, deps.nowMs)}`);
    else if ('stop' in a) out.push('stop');
    else if ('link' in a) {
      /* A LINK THAT CANNOT BE MADE IS NAMED HERE, because the preview is where somebody finds out
         that half their rows name a party nobody has a row for. */
      const found = deps.sql.all<{ id: string }>(
        `SELECT id FROM entry WHERE register = ? AND deleted_at IS NULL AND json_extract(fields, '$.${a.link.to.by}') = ? LIMIT 2`,
        a.link.to.register,
        fill(a.link.to.value, entry, deps.nowMs),
      );
      out.push(
        found.length === 1
          ? `link ${a.link.field}`
          : `link ${a.link.field} — ${found.length === 0 ? 'nothing bears that name' : 'two rows bear that name'}`,
      );
    }
  }
  return out;
}
