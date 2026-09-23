/**
 * The digest: the record telling you what it knows, on a schedule you set once.
 *
 * BATCH BY DEFAULT, INTERRUPT BY EXCEPTION. Almost nothing needs to reach somebody the moment it
 * happens; almost everything is worth reading once a week in one place. A product that pushes each
 * fact as it arrives is a product people mute, and a muted product knows nothing about you that it
 * can act on.
 *
 * A DIGEST WITH NOTHING IN IT IS NOT SENT. "Nothing needs you this week" is worth saying at most
 * once a month, not weekly — weekly nothing teaches somebody to stop opening it, and then the one
 * that mattered arrives in a folder they no longer read. `omit_when_empty` drops a section rather
 * than printing a heading over nothing, and a digest whose sections all dropped is not a digest.
 *
 * IT NEVER LEAVES THE RECORD. Every channel is an outbox row: the digest is assembled inside the
 * alarm's transaction and delivered by something else, so a slow SMTP server cannot hold a
 * customer's schedule. `prose: spark` is the same shape one step further out — one `infer.prose`
 * row, and the digest finishes on the ack, because a model that takes a minute must not be a minute
 * the alarm is holding.
 */

import type { Refusal, Result, Sql } from '@braindog/ports';
import { refused } from '@braindog/ports';
import type { Predicate, Schema } from '@braindog/where';

import { moneyText } from './ingest.ts';
import { instant } from './migrate.ts';
import type { EvalContext, MetricDecl, Reading } from './metrics.ts';
import { predicateOf } from './metrics.ts';
import type { Entry } from './index.ts';
import type { OutboxKind } from './outbox.ts';
import { sparkMayWrite } from './spark.ts';

export const CHANNELS = ['in-app', 'email', 'push', 'webhook', 'mcp'] as const;
export type Channel = (typeof CHANNELS)[number];

export type DigestSection = {
  heading: string;
  /** `metric.<id>` or `register.<id>`. */
  source: string;
  where?: string;
  /** One of the block kinds in `packages/render/src/kinds.ts`. `table` is the one bound to a source with columns. */
  as?: string;
  columns?: { field: string; label?: string }[];
  omit_when_empty?: boolean;
};

export type DigestDecl = {
  digest: string;
  name?: string;
  /** Weekly with `day`, daily without. `at` is local to the record's timezone. */
  schedule: { day?: string; at: string; tz?: string };
  channels: Channel[];
  sections: DigestSection[];
  /** Only ever `spark`. Omit for a figures-only digest, which costs no neurons and is a good one. */
  prose?: 'spark';
  webhook?: { url: string; grant?: string };
};

export type DigestPart = {
  heading: string;
  /** `register.<id>` or `metric.<id>` — what this section read, so a caller can be held to it. */
  source: string;
  as: string;
  rows: Entry[];
  reading?: Reading;
  columns?: { field: string; label?: string }[];
  refusals: Refusal[];
};

export type DigestDeps = {
  metric: (id: string) => MetricDecl | null;
  read: (decl: MetricDecl) => Result<Reading>;
  list: (q: {
    register: string;
    where?: Predicate | undefined;
    limit?: number;
  }) => Result<{ rows: Entry[]; matched: number }>;
  schemaOf: (register: string) => Schema | null;
  /** A list's title field and what one row of it is called, so a column with no label is headed as a page heads it. */
  listOf?: (register: string) => { title: string; one?: string } | null;
  ctx: EvalContext;
  /** Where an email would go: the owners, by address. Empty means the email channel cannot fire. */
  owners: () => string[];
  outbox: (kind: OutboxKind, payload: unknown) => void;
  note: (actor: string, text: string) => void;
  /**
   * What this deployment can actually deliver.
   *
   * IT DECIDES WHETHER `prose: spark` WAITS OR IS SKIPPED. A kind no host here serves sits `pending`
   * for ever, which is the right answer for a notification — it is still there the day a transport
   * appears — and the wrong one for this, because the `infer.prose` row is not the digest, it is the
   * thing HOLDING the digest. Parking it parks everything behind it, so a self-host with no model
   * would have gone quiet on the morning somebody added two sentences to a declaration, and stayed
   * quiet, with nothing anywhere saying why.
   */
  delivers: readonly OutboxKind[];
  /**
   * Whether this record has already been interrupted within the hour. `09 §4`, `09 §7`.
   *
   * A DEP RATHER THAN A QUERY, because this file holds no SQL — and a rate limit on interruption is
   * a feature: ten rules firing on one write is one afternoon, and ten interruptions is a person who
   * turns notifications off, after which the one that mattered arrives somewhere they no longer look.
   */
  interrupted: () => boolean;
  mint: () => string;
  nowMs: number;
  tz: string;
};

/** How many rows of a register a section carries. A digest is a summary, not a report. */
const SECTION_LIMIT = 50;

/** And how many sections. Twelve headings is already more than anybody reads on a Monday. */
const MAX_SECTIONS = 12;

/**
 * Build the sections, drop the ones that asked to be dropped when empty.
 *
 * A REFUSAL IS A SECTION TOO. A section whose predicate the register cannot answer is kept and says
 * so, because the alternative is a digest quietly missing the thing somebody set it up for.
 */
export function sectionsOf(deps: DigestDeps, decl: DigestDecl): DigestPart[] {
  const out: DigestPart[] = [];

  /* TWELVE SECTIONS, AND THE THIRTEENTH SAYS SO. They used to be sliced off in silence, which is a
     digest quietly without the thing somebody added last — and the person who added it is the one
     least likely to notice its absence. */
  if (decl.sections.length > MAX_SECTIONS)
    out.push({
      heading: 'Not sent',
      source: '',
      as: 'note',
      rows: [],
      refusals: [
        {
          code: 'OUT_OF_BOUNDS',
          fix: `This digest declares ${decl.sections.length} sections and a digest carries ${MAX_SECTIONS}. The rest are not here.`,
          at: 'sections',
        },
      ],
    });

  for (const section of decl.sections.slice(0, MAX_SECTIONS)) {
    const as = section.as ?? 'table';
    const base: DigestPart = { heading: section.heading, source: section.source, as, rows: [], refusals: [] };

    if (section.source.startsWith('metric.')) {
      const found = deps.metric(section.source.slice('metric.'.length));
      if (!found) {
        out.push({ ...base, refusals: [{ code: 'METRIC_UNKNOWN', fix: `There is no metric called ${section.source}.`, at: 'source' }] });
        continue;
      }
      const read = deps.read(found);
      if (!read.ok) {
        out.push({ ...base, refusals: refused(read) ? [read.refusal] : [] });
        continue;
      }
      /* A FIGURE IS NEVER EMPTY IN THE SENSE `omit_when_empty` MEANS. "Nothing overdue" is the good
         news the digest exists to carry, and dropping it would leave a week's digest saying nothing
         on the week everything went right. */
      out.push({ ...base, reading: read.value });
      continue;
    }

    const register = section.source.startsWith('register.') ? section.source.slice('register.'.length) : null;
    const schema = register ? deps.schemaOf(register) : null;
    if (!register || !schema) {
      out.push({ ...base, refusals: [{ code: 'SOURCE_UNKNOWN', fix: `${section.source} is not a source a digest reads.`, at: 'source' }] });
      continue;
    }

    const said = predicateOf(section.where, schema, deps.ctx);
    if (said.bad.length) {
      out.push({ ...base, refusals: said.bad });
      continue;
    }

    const listed = deps.list({ register, where: said.predicate, limit: SECTION_LIMIT });
    if (!listed.ok) {
      out.push({ ...base, refusals: refused(listed) ? [listed.refusal] : [] });
      continue;
    }
    if (listed.value.rows.length === 0 && section.omit_when_empty) continue;

    out.push({ ...base, rows: listed.value.rows, ...(section.columns ? { columns: headed(section.columns, deps.listOf?.(register) ?? null) } : {}) });
  }

  return out;
}

/**
 * THE COLUMNS WITH A HEADING EACH, as a page heads them: a label when one is given, and a column over the list's title
 * with none is headed by what one row is called, so an email reads Task and not `what`. Any other column keeps its id.
 */
function headed(columns: readonly { field: string; label?: string }[], list: { title: string; one?: string } | null): { field: string; label?: string }[] {
  return columns.map((c) => {
    if (typeof c.label === 'string' || !list || list.title !== c.field || typeof list.one !== 'string' || list.one === '') return c;
    return { ...c, label: list.one.charAt(0).toUpperCase() + list.one.slice(1) };
  });
}

export type Sent = { sections: number; channels: Channel[]; skipped: boolean };

/**
 * Assemble and queue one digest.
 *
 * Every channel is an OUTBOX ROW, including the in-app one — which is a `note` event rather than a
 * row in an inbox table, because the event on the record IS the notification and a second table
 * holding the same fact is a second thing that can be wrong about it.
 */
/**
 * The sections worth sending, and the ONE place that is decided.
 *
 * A REFUSED SECTION IS CARRYING SOMETHING. It says the figure could not be computed, which is the
 * one thing whoever declared it needs to know — and a second copy of this filter that forgot it
 * made a "today" screen say the digest was carrying nothing on the morning the digest went out.
 */
export const carryingOf = (sections: readonly DigestPart[]): DigestPart[] =>
  sections.filter((s) => s.rows.length > 0 || s.reading || s.refusals.length > 0);

export function runDigest(deps: DigestDeps, decl: DigestDecl): Sent {
  const sections = sectionsOf(deps, decl);
  const carrying = carryingOf(sections);

  /* NOT SENT, and the schedule still moves on. A digest that skipped is not a digest that failed:
     the next one is due at the same hour next week either way. */
  if (carrying.length === 0) return { sections: 0, channels: [], skipped: true };

  const name = decl.name ?? decl.digest;
  const text = render(name, carrying);
  const channels = [...new Set(decl.channels)].slice(0, 5);

  /* EVERYTHING THE SENDING NEEDS, DECIDED INSIDE THE ALARM'S TRANSACTION. The prose path sends
     later — after a model answers — and a digest re-assembled at that moment would be a different
     digest: rows move between the alarm firing and a model returning, and the one the person reads
     must be the one the record decided to send. */
  const assembled: Assembled = {
    digest: decl.digest,
    name,
    text,
    headline: headline(name, carrying),
    channels,
    sections: carrying,
    ...(decl.webhook?.url ? { webhook: decl.webhook.url } : {}),
    ...(decl.webhook?.url && decl.webhook.grant ? { webhook_grant: decl.webhook.grant } : {}),
  };

  /* `prose: spark` STOPS HERE. One `infer.prose` row carrying the assembled digest, and the sending
     happens on the ack — a model that takes a minute must not be a minute the alarm holds.

     THE ACK WAS NEVER WRITTEN, so this stopped and never started again: every digest declaring
     `prose: spark` queued one row that nothing consumed, and sent nothing, ever, on any channel,
     with no error anywhere. The whole feature was one `return` short of existing. */
  if (decl.prose === 'spark' && deps.delivers.includes('infer.prose')) {
    deps.outbox('infer.prose', assembled);
    return { sections: carrying.length, channels, skipped: false };
  }

  /* AND ON A HOST WITH NO MODEL IT SHIPS AS FIGURES, now rather than never. 46 §5 already says that
     is what a prose call that comes back unusable does; a prose call nobody can make is the same
     fact one step earlier. Two sentences are an accelerant and a digest is not — 11 §3: "Spark is an
     accelerant, never a dependency." */
  /* AND THE RECEIPT NAMES THE CHANNELS IT ACTUALLY USED. This returned the DECLARED list, so a
     digest that sent nothing — `mcp` alone, or `email` on a record whose owners have no address —
     reported the same thing as one that reached somebody. */
  return { sections: carrying.length, channels: sendDigest(deps, assembled), skipped: false };
}



/**
 * A digest, assembled and ready to leave — the whole of what step d needs and nothing else.
 *
 * IT IS A PAYLOAD BEFORE IT IS A TYPE. With `prose: spark` this is what rides the `infer.prose`
 * outbox row, so every field here survives `JSON.stringify` and back, and nothing in it is a
 * reference to something the record would have to look up again later.
 */
export type Assembled = {
  digest: string;
  name: string;
  /** The rendered body, block dialect. */
  text: string;
  /** The one line the in-app note carries. */
  headline: string;
  channels: Channel[];
  /**
   * The sections as they were when the alarm fired — the ARRAY, which is what 45 §5.9 names in the
   * `infer.prose` payload and what 46 §5's prompt reads: *"Its sections, each figure with its
   * path"*. This carried `carrying.length` instead, so a model asked to write two sentences about a
   * digest would have been handed the number `3`. The count the push title needs is `.length`.
   */
  sections: DigestPart[];
  webhook?: string;
  /**
   * The vault label the webhook's POST is signed with, as the declaration's `webhook.grant` says it (09 §6).
   *
   * ON THE ASSEMBLY AND NOT READ AGAIN AT THE SEND, because the prose path sends from this payload after a model
   * answers, and nothing on that path reads the declaration: a grant the alarm did not put here never reached the post
   * (`secret-out.test.ts` measured the `infer.prose` payload with no key for it).
   */
  webhook_grant?: string;
};

/**
 * Step d: the assembled digest onto its channels.
 *
 * ONE FUNCTION FOR BOTH PATHS. `runDigest` calls it directly; the `infer.prose` ack calls it with
 * two sentences in front of the text. A second copy of this loop is how one path grows a channel the
 * other does not have — and the prose path is the one that would have been forgotten, because it is
 * the one nobody sees fail.
 */
export function sendDigest(deps: DigestDeps, sent: Assembled, prose?: string): Channel[] {
  /* 45 §5.10: the text prefixed by the prose, attributed. Attribution is not decoration — two
     sentences of figures written by a model, printed above a record's own numbers with nothing
     saying which is which, is the one place this product would be lying about who said something. */
  const text = prose ? `${prose}

— Spark

${sent.text}` : sent.text;

  /* WHAT ACTUALLY WENT, which is not always what was asked for. An `email` channel on a record whose
     owners have no address sends nothing; `mcp` sends nothing by design. A receipt that names a
     channel it did not use is the same lie as a digest that reports success and sends nothing —
     smaller, and in the one place somebody would go to find out why nothing arrived. */
  const went: Channel[] = [];

  for (const channel of sent.channels) {
    went.push(channel);

    if (channel === 'in-app') {
      /* THE EVENT IS THE NOTIFICATION. There is no inbox table: the unread count is counted over
         these, in one place, on the record rather than per page — a badge per nav section is how a
         product teaches people to ignore badges. */
      deps.note(`digest:${sent.digest}`, sent.headline);
      continue;
    }
    if (channel === 'email') {
      const to = deps.owners();
      if (to.length === 0) {
        went.pop();
        continue;
      }
      deps.outbox('notify.email', { to, subject: sent.name, text });
      continue;
    }
    if (channel === 'push') {
      /* NO CONTENT IN A PUSH. It says how many things and where, and the record is where they are:
         a lock screen is not a place a person chose to read their business on. */
      deps.outbox('notify.push', { title: `${sent.name}: ${sent.sections.length} items`, url: `/digest/${sent.digest}` });
      continue;
    }
    if (channel === 'webhook') {
      /* THE ADDRESS IS DECLARED OR THE CHANNEL IS NOT. `install` refuses a `webhook` channel with no
         `webhook: { url }` (09 §6: egress is declared or it does not happen), so reaching here
         without one is a record written by an older build — and posting nowhere while reporting a
         send is the failure this whole pass is about, not one to repeat quietly.

         AND THE KEY THAT SIGNS IT IS NAMED BESIDE THE BODY, BY ITS LABEL. 09 §6 promises `webhook.grant` is "the vault
         label of the secret that signs the POST", `install` prints it on the CALLS OUT line and the accept refuses a
         digest until the vault holds it, and this queued the url and the body alone: measured 23 September, the
         `notify.webhook` for `grant: 'collector'` held two keys and no deliverer could have signed anything. The label
         is the reference a host resolves, as a call's `pull.fetch` names its key, and the key's value never enters
         the record, so it cannot enter the body; the body is what the endpoint reads. */
      if (sent.webhook)
        deps.outbox('notify.webhook', {
          url: sent.webhook,
          body: JSON.stringify({ digest: sent.digest, sections: sent.sections }),
          ...(sent.webhook_grant ? { grant: sent.webhook_grant } : {}),
        });
      else went.pop();
      continue;
    }

    /* `mcp` SENDS NOTHING, AND THAT IS THE WHOLE OF IT. A digest is already an MCP resource —
       `digest/today`, "what the scheduler would have said" (10 §6) — so an agent reads it by asking
       rather than by being pushed at, and naming the channel says "an agent should see this", which
       an agent can.

       IT IS A CASE RATHER THAN A FALL-THROUGH, because the loop had no `else`: `mcp` dropped out of
       the bottom, the schedule row was marked done and re-armed, and `runDigest` returned
       `{ channels: ['mcp'], skipped: false }` — so every receipt said it went. */
  }

  return went;
}

/**
 * The two sentences 45 §5.10 allows, and never a third.
 *
 * THE CAP IS THE RECORD'S RATHER THAN THE MODEL'S. A host that truncated correctly would make this
 * a no-op and a host that did not would make it the only thing standing between a digest and an
 * essay — and which of the two is on the other end of the ack is not a fact this record has.
 */
export function twoSentences(said: string): string {
  const trimmed = said.trim();
  if (!trimmed) return '';
  const ends = [...trimmed.matchAll(/[.!?](?:["'”’)]+)?(?=\s|$)/g)];
  const second = ends[1];
  return (second === undefined ? trimmed : trimmed.slice(0, second.index + second[0].length)).trim();
}

/** The one line an in-app note carries: the headings and their counts, under 280 characters. */
export function headline(name: string, sections: DigestPart[]): string {
  const parts = sections.map((s) =>
    /* A REFUSED SECTION IS AN EM DASH, NOT A ZERO. It fell through to `rows.length`, so a money
       figure the record had refused to compute was announced as nothing owed — the email said why
       and the notification said zero, and the notification is the one somebody reads first. */
    s.refusals.length
      ? `${s.heading} —`
      : s.reading
        ? `${s.heading} ${figure(s.reading)}`
        : `${s.heading} ${s.rows.length}`,
  );
  return `${name}: ${parts.join(' · ')}`.slice(0, 280);
}

/**
 * A reading as text. MONEY IN ITS OWN DECIMALS: the value is minor units, and it was printed raw, so
 * GBP 10,540.00 went out as `1054000 GBP`. A unit that is not a currency code (`kg`, `h`) is a
 * quantity and stays as it was read.
 */
function figure(r: Reading): string {
  if (r.value === null) return '—';
  if (r.unit && /^[A-Z]{3}$/u.test(r.unit) && Number.isInteger(r.value)) return moneyText(r.value, r.unit);
  return r.unit ? `${r.value} ${r.unit}` : String(r.value);
}

/** The body, as the block dialect — so an email and a page are drawn from the same text. */
export function render(name: string, sections: DigestPart[]): string {
  const out: string[] = [`# ${name}`, ''];
  for (const s of sections) {
    out.push(`## ${s.heading}`);
    if (s.refusals.length) {
      out.push('', s.refusals[0]!.fix, '');
      continue;
    }
    if (s.reading) {
      out.push('', '```stat', `${s.heading} | ${figure(s.reading)}`, '```', '');
      continue;
    }
    const columns = s.columns ?? [];
    out.push('', '```table');
    if (columns.length) out.push(columns.map((c) => c.label ?? c.field).join(' | '));
    for (const row of s.rows)
      /* BOTH BRANCHES THROUGH `cell`. The fallback interpolated raw, so a value with a pipe in it
         split into two columns — in the one branch that exists because nobody said which columns. */
      out.push(
        columns.length
          ? columns.map((c) => cell(row, c.field)).join(' | ')
          : `${cell(row, 'seq')} | ${cell(row, Object.keys(row.fields)[0] ?? '')}`,
      );
    out.push('```', '');
  }
  return out.join('\n');
}

/** One value as text, with the pipe and the backslash escaped so a column break stays one. */
function cell(row: Entry, field: string): string {
  const raw = field === 'seq' ? row.seq : row.fields[field];
  const text =
    raw === null || raw === undefined
      ? ''
      : typeof raw === 'object'
        ? 'amount' in (raw as Record<string, unknown>)
          ? moneyText((raw as { amount: number }).amount, (raw as { currency: string }).currency)
          : JSON.stringify(raw)
        : String(raw);
  return text.replaceAll('\\', '\\\\').replaceAll('|', '\\|');
}

/* ── when it next fires ──────────────────────────────────────────────────── */

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/**
 * The next time a schedule lands, in a timezone, using `Intl` and nothing else.
 *
 * A TABLE OF OFFSETS IS A TABLE THAT IS WRONG THE NEXT TIME A GOVERNMENT MOVES ONE. The runtime
 * already carries the zone data; the walk asks it what the local parts of a candidate instant are
 * and steps a day at a time, which is at most eight steps and always right across a transition.
 */
export function nextOccurrence(schedule: { day?: string; at: string }, fromMs: number, tz: string): number | null {
  /* THE TIME IS CHECKED, not defaulted. `Number('8am')` is `NaN` and `NaN ?? 8` is `NaN`, so a
     malformed `at` silently became "twenty-four hours from now" — a weekly digest arriving at a
     different hour every week, with nothing anywhere saying why. */
  const m = /^(\d{1,2}):(\d{2})$/.exec(schedule.at.trim());
  const hh = m ? Number(m[1]) : NaN;
  const mm = m ? Number(m[2]) : NaN;
  if (!Number.isInteger(hh) || hh > 23 || !Number.isInteger(mm) || mm > 59) return null;

  const wanted = schedule.day === undefined ? -1 : DAYS.indexOf(schedule.day.toLowerCase());
  if (schedule.day !== undefined && wanted < 0) return null;

  for (let step = 0; step <= 8; step++) {
    const probe = fromMs + step * 86_400_000;
    const parts = localParts(probe, tz);
    if (wanted >= 0 && parts.weekday !== wanted) continue;

    /* THE OFFSET IS RE-READ AT THE ANSWER, not only at the probe. The arithmetic converts a local
       wall-clock time using the offset in force at the PROBE, and a transition between the two moves
       the result by an hour — in both directions, so a Sunday digest landed at 07:00 in October and
       09:00 in March. One correction is enough: the residual is the difference between the two
       offsets, and two transitions cannot fall inside one day. */
    let at = probe + (hh - parts.hour) * 3_600_000 + (mm - parts.minute) * 60_000 - parts.second * 1000;
    const landed = localParts(at, tz);
    const drift = (hh - landed.hour) * 3_600_000 + (mm - landed.minute) * 60_000 - landed.second * 1000;
    /* A SPRING-FORWARD HOUR DOES NOT EXIST, and correcting into it would loop. When the corrected
       instant still does not read as the wanted time, the hour was skipped and the first one that
       does exist is the honest answer — which is what the uncorrected value already is. */
    if (drift !== 0) {
      const corrected = at + drift;
      const after = localParts(corrected, tz);
      if (after.hour === hh && after.minute === mm && (wanted < 0 || after.weekday === wanted)) at = corrected;
    }
    if (at > fromMs) return at;
  }
  return null;
}

/** The local parts of an instant, from the runtime's own zone data. */
export function localParts(ms: number, tz: string): { weekday: number; hour: number; minute: number; second: number } {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hourCycle: 'h23',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  return {
    weekday: DAYS.indexOf(String(parts.weekday ?? '').slice(0, 3).toLowerCase()),
    hour: Number(parts.hour ?? 0),
    minute: Number(parts.minute ?? 0),
    second: Number(parts.second ?? 0),
  };
}

/** `22:00`–`08:00` in the record's timezone. A non-urgent notification inside them waits. */
export const inQuietHours = (ms: number, tz: string): boolean => {
  const h = localParts(ms, tz).hour;
  return h >= 22 || h < 8;
};

/** An in-app note, as the event that IS the notification. */
export function noteEvent(sql: Sql, mint: () => string, nowMs: number, actor: string, text: string): void {
  /* A DIGEST'S PROSE IS WRITTEN BY SPARK and its note is not a `note` a model may sign. `prose:
     spark` is the one declaration that puts a model's sentences into a digest, and if the actor of
     that note were ever the model rather than the record, this is where it would land. */
  sparkMayWrite(actor, 'note');
  sql.exec(
    "INSERT INTO event (id, ts, actor, kind, target, target_kind, note) VALUES (?, ?, ?, 'note', NULL, NULL, ?)",
    mint(),
    instant(nowMs),
    actor,
    text.slice(0, 280),
  );
}

/**
 * ONE NOTIFICATION, ROUTED BY `urgent`. `09 §4`, and `45 §5.9` names this helper.
 *
 * `urgent` WAS WRITTEN IN FOUR PLACES AND READ IN NONE. A rule declaring
 * `{ notify: { say: "Payment failed", urgent: true } }`, and a credential expiring inside
 * forty-eight hours, both wrote a `note` event and stopped — so nothing left the record, for either
 * of the two things `09 §5` names as urgent by default. The pack install diff meanwhile told the
 * person it *"interrupts you"*, which made the diff the only honest reader of a key nothing else
 * consumed.
 *
 * `09 §4`: "`true` interrupts — the `note` event **plus a `notify.push` and a `notify.email` outbox
 * row**, at most one interrupt per hour per record; the default, `false`, lands in the digest".
 *
 * THE RATE LIMIT IS PER RECORD AND NOT PER RULE. Ten rules firing on one write is one afternoon, and
 * ten interruptions is a person who turns notifications off — after which the one that mattered
 * arrives somewhere they no longer look. `09 §7` states it as a thing this subsystem must never do.
 *
 * AND QUIET HOURS DO NOT APPLY. `09 §5` rule 3 moves a NON-urgent notification out of 22:00–08:00,
 * and a non-urgent notification is a `note` that lands in the digest — which is already batched, and
 * whose own schedule row decides when it goes. An urgent one is urgent at three in the morning or it
 * was never urgent; holding it until eight would make "a payment failed" a thing you find out about
 * after the retry window closed.
 */
export function notify(deps: DigestDeps, said: Notice): void {
  /* THE EVENT ALWAYS, because it is the record's own memory of the thing having happened, and it is
     what the digest and the unread count are counted over. */
  deps.note(said.actor, said.say.slice(0, 280));
  if (!said.urgent) return;

  /* AT MOST ONE PER HOUR. The check is the caller's because this file holds no SQL — and it is a
     check rather than a queue: an interrupt that waits an hour to arrive is a notification, and the
     record already has one of those. */
  if (deps.interrupted()) return;

  deps.outbox('notify.push', { title: said.say.slice(0, 120), url: said.url ?? '/' });

  /* AND THE EMAIL, WHICH IS THE HALF THAT SURVIVES A PHONE IN A DRAWER. `09 §3` gives push "one
     line, no content" and email "anything with a table in it", so the email carries the reason and
     the push carries the fact. A record with no owner address sends the push alone. */
  const to = deps.owners();
  if (to.length > 0)
    deps.outbox('notify.email', {
      to,
      subject: said.say.slice(0, 120),
      text: said.because ? `${said.say}\n\n${said.because}` : said.say,
    });
}

/** What one interrupt carries. `09 §4`'s six keys, minus the three the caller has already resolved. */
export type Notice = {
  /** Who or what it is about: `rule:chase`, `grant:g_01J…`. The event's actor. */
  actor: string;
  /** One line, and the whole of what a push carries. */
  say: string;
  /** Why, for the email. A push carries no content — a lock screen is not a place somebody chose to read their business on. */
  because?: string | undefined;
  /** Where in the app it is about. */
  url?: string | undefined;
  /** `false` lands in the digest; `true` interrupts, at most once an hour per record. */
  urgent?: boolean | undefined;
};
