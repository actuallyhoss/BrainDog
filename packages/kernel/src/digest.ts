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

import type { Refusal, Sql } from '@braindog/ports';
import type { Predicate, Schema } from '@braindog/where';

import { instant } from './migrate.ts';
import type { EvalContext, MetricDecl, Reading } from './metrics.ts';
import { predicateOf } from './metrics.ts';
import type { Entry } from './index.ts';
import type { OutboxKind } from './outbox.ts';

export const CHANNELS = ['in-app', 'email', 'push', 'webhook', 'mcp'] as const;
export type Channel = (typeof CHANNELS)[number];

export type DigestSection = {
  heading: string;
  /** `metric.<id>` or `register.<id>`. */
  source: string;
  where?: string;
  /** One of the sixteen block kinds. `table` is the one bound to a source with columns. */
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
  as: string;
  rows: Entry[];
  reading?: Reading;
  columns?: { field: string; label?: string }[];
  refusals: Refusal[];
};

export type DigestDeps = {
  metric: (id: string) => MetricDecl | null;
  read: (decl: MetricDecl) => { ok: true; value: Reading } | { ok: false; refusal: Refusal };
  list: (q: {
    register: string;
    where?: Predicate | undefined;
    limit?: number;
  }) => { ok: true; value: { rows: Entry[]; matched: number } } | { ok: false; refusal: Refusal };
  schemaOf: (register: string) => Schema | null;
  ctx: EvalContext;
  /** Where an email would go: the owners, by address. Empty means the email channel cannot fire. */
  owners: () => string[];
  outbox: (kind: OutboxKind, payload: unknown) => void;
  note: (actor: string, text: string) => void;
  mint: () => string;
  nowMs: number;
  tz: string;
};

/** How many rows of a register a section carries. A digest is a summary, not a report. */
const SECTION_LIMIT = 50;

/**
 * Build the sections, drop the ones that asked to be dropped when empty.
 *
 * A REFUSAL IS A SECTION TOO. A section whose predicate the register cannot answer is kept and says
 * so, because the alternative is a digest quietly missing the thing somebody set it up for.
 */
export function sectionsOf(deps: DigestDeps, decl: DigestDecl): DigestPart[] {
  const out: DigestPart[] = [];

  for (const section of decl.sections.slice(0, 12)) {
    const as = section.as ?? 'table';
    const base: DigestPart = { heading: section.heading, as, rows: [], refusals: [] };

    if (section.source.startsWith('metric.')) {
      const found = deps.metric(section.source.slice('metric.'.length));
      if (!found) {
        out.push({ ...base, refusals: [{ code: 'METRIC_UNKNOWN', fix: `There is no metric called ${section.source}.`, at: 'source' }] });
        continue;
      }
      const read = deps.read(found);
      if (!read.ok) {
        out.push({ ...base, refusals: [read.refusal] });
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
      out.push({ ...base, refusals: [listed.refusal] });
      continue;
    }
    if (listed.value.rows.length === 0 && section.omit_when_empty) continue;

    out.push({ ...base, rows: listed.value.rows, ...(section.columns ? { columns: section.columns } : {}) });
  }

  return out;
}

export type Sent = { sections: number; channels: Channel[]; skipped: boolean };

/**
 * Assemble and queue one digest.
 *
 * Every channel is an OUTBOX ROW, including the in-app one — which is a `note` event rather than a
 * row in an inbox table, because the event on the record IS the notification and a second table
 * holding the same fact is a second thing that can be wrong about it.
 */
export function runDigest(deps: DigestDeps, decl: DigestDecl): Sent {
  const sections = sectionsOf(deps, decl);
  const carrying = sections.filter((s) => s.rows.length > 0 || s.reading || s.refusals.length > 0);

  /* NOT SENT, and the schedule still moves on. A digest that skipped is not a digest that failed:
     the next one is due at the same hour next week either way. */
  if (carrying.length === 0) return { sections: 0, channels: [], skipped: true };

  const name = decl.name ?? decl.digest;
  const text = render(name, carrying);
  const channels = [...new Set(decl.channels)].slice(0, 5);

  /* `prose: spark` STOPS HERE. One `infer.prose` row carrying the digest and its channels, and the
     sending happens on the ack — a model that takes a minute must not be a minute the alarm holds. */
  if (decl.prose === 'spark') {
    deps.outbox('infer.prose', { digest: decl.digest, name, text, channels, sections: carrying.length });
    return { sections: carrying.length, channels, skipped: false };
  }

  for (const channel of channels) {
    if (channel === 'in-app') {
      /* THE EVENT IS THE NOTIFICATION. There is no inbox table: the unread count is counted over
         these, in one place, on the record rather than per page — a badge per nav section is how a
         product teaches people to ignore badges. */
      deps.note(`digest:${decl.digest}`, headline(name, carrying));
      continue;
    }
    if (channel === 'email') {
      const to = deps.owners();
      if (to.length === 0) continue;
      deps.outbox('notify.email', { to, subject: name, text });
      continue;
    }
    if (channel === 'push') {
      /* NO CONTENT IN A PUSH. It says how many things and where, and the record is where they are:
         a lock screen is not a place a person chose to read their business on. */
      deps.outbox('notify.push', { title: `${name}: ${carrying.length} items`, url: `/digest/${decl.digest}` });
      continue;
    }
    if (channel === 'webhook' && decl.webhook?.url)
      deps.outbox('notify.webhook', { url: decl.webhook.url, body: JSON.stringify({ digest: decl.digest, sections: carrying }) });
  }

  return { sections: carrying.length, channels, skipped: false };
}

/** The one line an in-app note carries: the headings and their counts, under 280 characters. */
export function headline(name: string, sections: DigestPart[]): string {
  const parts = sections.map((s) =>
    s.reading ? `${s.heading} ${s.reading.value === null ? '—' : s.reading.value}` : `${s.heading} ${s.rows.length}`,
  );
  return `${name}: ${parts.join(' · ')}`.slice(0, 280);
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
      out.push('', '```stat', `${s.heading} | ${s.reading.value === null ? '—' : s.reading.value}${s.reading.unit ? ` ${s.reading.unit}` : ''}`, '```', '');
      continue;
    }
    const columns = s.columns ?? [];
    out.push('', '```table');
    if (columns.length) out.push(columns.map((c) => c.label ?? c.field).join(' | '));
    for (const row of s.rows)
      out.push(
        columns.length
          ? columns.map((c) => cell(row, c.field)).join(' | ')
          : `${row.seq ?? ''} | ${String(Object.values(row.fields)[0] ?? '')}`,
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
          ? `${(raw as { currency: string }).currency} ${(raw as { amount: number }).amount}`
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
export function nextOccurrence(schedule: { day?: string; at: string }, fromMs: number, tz: string): number {
  const [hh, mm] = schedule.at.split(':').map((n) => Number(n));
  const wanted = DAYS.indexOf((schedule.day ?? '').toLowerCase());

  for (let step = 0; step <= 8; step++) {
    const probe = fromMs + step * 86_400_000;
    const parts = localParts(probe, tz);
    if (wanted >= 0 && parts.weekday !== wanted) continue;
    /* The local wall-clock time, converted back by the offset the runtime reports for that instant
       — so an hour that does not exist on a spring-forward morning lands on the next one that does. */
    const at = probe + ((hh ?? 8) - parts.hour) * 3_600_000 + ((mm ?? 0) - parts.minute) * 60_000 - parts.second * 1000;
    if (at > fromMs) return at;
  }
  return fromMs + 86_400_000;
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
  sql.exec(
    "INSERT INTO event (id, ts, actor, kind, target, target_kind, note) VALUES (?, ?, ?, 'note', NULL, NULL, ?)",
    mint(),
    instant(nowMs),
    actor,
    text.slice(0, 280),
  );
}
