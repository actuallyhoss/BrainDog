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
 * customer's schedule. `prose: slash` is the same shape one step further out — one `infer.prose`
 * row, and the digest finishes on the ack, because a model that takes a minute must not be a minute
 * the alarm is holding.
 */

import type { Refusal, Result, Sql } from '@braindog/ports';
import { refused } from '@braindog/ports';
import type { Predicate, Schema } from '@braindog/where';

import { nextCalendar, timeOf } from './clock.ts';
import { moneyText } from './ingest.ts';
import { instant } from './migrate.ts';
import type { EvalContext, MetricDecl, Reading } from './metrics.ts';
import { predicateOf } from './metrics.ts';
import { computedPart, digestSource } from './digest-sources.ts';
import type { Entry } from './index.ts';
import type { OutboxKind } from './outbox.ts';
import type { BlockResult, PageBlock } from './pages.ts';
import { slashMayWrite } from './slash.ts';

export const CHANNELS = ['in-app', 'email', 'push', 'webhook', 'mcp'] as const;
export type Channel = (typeof CHANNELS)[number];

export type DigestSection = {
  heading: string;
  /** `metric.<id>`, `register.<id>`, or a computed source named in `DIGEST_SOURCES` (`governance.open`, `activity`). */
  source: string;
  /** Words, or over a computed source a tree too, as the agents add-on's own blocks say who asked. */
  where?: string | Predicate;
  /** Over a computed source: only what is newer than this, a whole number of hours or days (`15h`, `2d`). */
  within?: string;
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
  /** Only ever `slash`. Omit for a figures-only digest, which costs no neurons and is a good one. */
  prose?: 'slash';
  webhook?: { url: string; grant?: string };
};

export type DigestPart = {
  heading: string;
  /** `register.<id>` or `metric.<id>` — what this section read, so a caller can be held to it. */
  source: string;
  as: string;
  rows: Entry[];
  /** How many the source matched, which `rows` may be fewer than. Absent, `rows` is all of them. */
  matched?: number;
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
  /**
   * One block read as a page reads it (`readBlock`), which a section over a computed source is answered through.
   *
   * OPTIONAL: a host that cannot read one drops a section that said `omit_when_empty`, since it has nothing to say, and
   * refuses one that did not, as it refused every computed source before.
   */
  block?: (block: PageBlock) => BlockResult;
  ctx: EvalContext;
  /** Where an email would go: the owners, by address. Empty means the email channel cannot fire. */
  owners: () => string[];
  /**
   * How many phones a push reaches: the owners' push subscriptions, one `notify.push` row each (`push.ts`'s
   * `ownersPushSubs`). Zero means the push channel cannot fire, as an empty `owners` means for email.
   *
   * OPTIONAL SO A CALLER THAT HAS NOT SAID STILL SENDS AS BEFORE: absent, a push is taken to have gone, which is the
   * receipt this used to write for every record, subscribed or not.
   */
  phones?: () => number;
  outbox: (kind: OutboxKind, payload: unknown) => void;
  /** Write the `note` event. `urgent` marks it (`URGENT_NOTE`), so a person's mute never hides it (`mutedFor`). */
  note: (actor: string, text: string, urgent?: boolean) => void;
  /**
   * What this deployment can actually deliver.
   *
   * IT DECIDES WHETHER `prose: slash` WAITS OR IS SKIPPED. A kind no host here serves sits `pending`
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
  /**
   * The record's quiet hours, read from `record.quiet` (`quietOf`). Inside them no level pushes or mails.
   *
   * OPTIONAL, AND ABSENT HOLDS NOTHING. A caller that has not read the record's window cannot know it is not `'off'`,
   * and what `notify` holds is said again only by a digest that reads `held`: a notice held by a window nobody read
   * would be a failed payment that made no sound at eleven and was in nothing at eight.
   */
  quiet?: QuietWindow;
  /** How many things wait on the person now, which is all an active push says. Absent, it says the one it is about. */
  waiting?: () => number;
  /**
   * Whether a time-sensitive notice for this cause has already pushed or mailed. Once for its cause, however long ago.
   *
   * A DEP FOR THE REASON `interrupted` IS ONE. The push and the mail `notify` queues carry `cause`, so a caller can
   * answer this over them. Absent, or for a notice that names no cause, the hour's limit holds instead, as it did.
   */
  told?: (cause: string) => boolean;
  /**
   * The time-sensitive notices said since the last digest went, each with its instant. The digest keeps the ones said
   * inside quiet hours (`heldIn`), which are the ones that made no sound, and leads with them.
   */
  held?: () => HeldNotice[];
  mint: () => string;
  nowMs: number;
  tz: string;
};

/** How many rows of a register a section carries. A digest is a summary, not a report. */
const SECTION_LIMIT = 50;

/** And how many sections. Twelve headings is already more than anybody reads on a Monday. */
const MAX_SECTIONS = 12;

/** How many lines a section draws; the rest are counted, `And 4 more.` A digest is read on a phone. */
export const SECTION_LINES = 5;

/** And how many words a whole digest says, headings and cells. Past them it ends `More in BrainDog.` */
export const WORDS_MOST = 150;

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

    /* A COMPUTED SOURCE IS READ AS ITS PAGE READS IT, one block, so a digest never says a question the queue would not.
       Cards are handed their columns, which is what has a working run say what it is doing. */
    const computed = digestSource(section.source);
    if (computed) {
      if (!deps.block) {
        if (section.omit_when_empty) continue;
        out.push({ ...base, refusals: [{ code: 'SOURCE_UNKNOWN', fix: `${section.source} is not a source a digest reads here.`, at: 'source' }] });
        continue;
      }
      const columns = section.columns ?? computed.columns;
      const answer = deps.block({
        kind: computed.kind,
        source: section.source,
        ...(section.where !== undefined ? { where: section.where as string } : {}),
        ...(computed.kind === 'cards' ? { columns: columns.map((c) => ({ field: c.field })) } : {}),
        limit: SECTION_LIMIT,
      });
      const part = computedPart(section, answer, deps.nowMs);
      if (part.rows.length === 0 && part.refusals.length === 0 && section.omit_when_empty) continue;
      out.push(part);
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
  /* EXCEPT WHEN SOMETHING WAS HELD. A notice quiet hours kept from sounding is said by the next digest or by nothing,
     so a digest with no section of its own still goes on the morning one waits. */
  const held = deps.held && deps.quiet !== undefined ? heldIn(deps.held(), deps.tz, deps.quiet) : [];
  if (carrying.length === 0 && held.length === 0) return { sections: 0, channels: [], skipped: true };

  const name = decl.name ?? decl.digest;
  const lines = held.map((h) => h.say);
  const text = render(name, carrying, lines);
  const channels = [...new Set(decl.channels)].slice(0, 5);

  /* EVERYTHING THE SENDING NEEDS, DECIDED INSIDE THE ALARM'S TRANSACTION. The prose path sends
     later — after a model answers — and a digest re-assembled at that moment would be a different
     digest: rows move between the alarm firing and a model returning, and the one the person reads
     must be the one the record decided to send. */
  const assembled: Assembled = {
    digest: decl.digest,
    name,
    text,
    headline: headline(name, carrying, lines),
    channels,
    sections: carrying,
    ...(lines.length > 0 ? { held: lines } : {}),
    ...(decl.webhook?.url ? { webhook: decl.webhook.url } : {}),
    ...(decl.webhook?.url && decl.webhook.grant ? { webhook_grant: decl.webhook.grant } : {}),
  };

  /* `prose: slash` STOPS HERE. One `infer.prose` row carrying the assembled digest, and the sending
     happens on the ack — a model that takes a minute must not be a minute the alarm holds.

     THE ACK WAS NEVER WRITTEN, so this stopped and never started again: every digest declaring
     `prose: slash` queued one row that nothing consumed, and sent nothing, ever, on any channel,
     with no error anywhere. The whole feature was one `return` short of existing. */
  if (decl.prose === 'slash' && deps.delivers.includes('infer.prose')) {
    deps.outbox('infer.prose', assembled);
    return { sections: carrying.length, channels, skipped: false };
  }

  /* AND ON A HOST WITH NO MODEL IT SHIPS AS FIGURES, now rather than never. 46 §5 already says that
     is what a prose call that comes back unusable does; a prose call nobody can make is the same
     fact one step earlier. Two sentences are an accelerant and a digest is not — 11 §3: "Slash is an
     accelerant, never a dependency." */
  /* AND THE RECEIPT NAMES THE CHANNELS IT ACTUALLY USED. This returned the DECLARED list, so a
     digest that sent nothing — `mcp` alone, or `email` on a record whose owners have no address —
     reported the same thing as one that reached somebody. */
  return { sections: carrying.length, channels: sendDigest(deps, assembled), skipped: false };
}



/**
 * A digest, assembled and ready to leave — the whole of what step d needs and nothing else.
 *
 * IT IS A PAYLOAD BEFORE IT IS A TYPE. With `prose: slash` this is what rides the `infer.prose`
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
  /** What quiet hours held since the last digest, soonest first, as each was said. It leads the text and the headline. */
  held?: string[];
  webhook?: string;
  /**
   * The keychain label the webhook's POST is signed with, as the declaration's `webhook.grant` says it (09 §6).
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

— Slash

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
      /* `because: 'digest.<id>'` IS THE LAPSE'S OWN MARK (`apps/worker/src/lapse.ts` `lapseDrops`), which drops a
         lapsed record's digests by it before anything ships. Without it a digest email read the same as an
         urgent notice and still went out while the record was read-only. */
      deps.outbox('notify.email', { to, subject: sent.name, text, because: `digest.${sent.digest}` });
      continue;
    }
    if (channel === 'push') {
      /* A RECORD NOBODY HAS SUBSCRIBED ON QUEUES NO PUSH (the kernel's `outbox` dep writes one row per phone), so the
         receipt does not name the channel either: it said `push` went on a record with no phone to ring, which is the
         lie the email arm above already refuses to tell. */
      if (deps.phones !== undefined && deps.phones() === 0) {
        went.pop();
        continue;
      }
      /* NO CONTENT IN A PUSH. It says how many things and where, and the record is where they are:
         a lock screen is not a place a person chose to read their business on. `because` is the same
         `digest.<id>` mark the email arm carries.

         WHERE A TAP OPENS IS THE SUMMARY'S OWN SCREEN (`/agents/summary/<id>` in the app), which draws what it says
         from `digestToday`, so the notice opens what it was about and not the record's home. It is a path
         `pushOpenOf` admits, so it rides the push as its `open`; `lapseDrops` reads a digest's push by it. */
      deps.outbox('notify.push', { title: `${sent.name}: ${sent.sections.length + (sent.held?.length ?? 0)} items`, url: `/agents/summary/${sent.digest}`, because: `digest.${sent.digest}` });
      continue;
    }
    if (channel === 'webhook') {
      /* THE ADDRESS IS DECLARED OR THE CHANNEL IS NOT. `install` refuses a `webhook` channel with no
         `webhook: { url }` (09 §6: egress is declared or it does not happen), so reaching here
         without one is a record written by an older build — and posting nowhere while reporting a
         send is the failure this whole pass is about, not one to repeat quietly.

         AND THE KEY THAT SIGNS IT IS NAMED BESIDE THE BODY, BY ITS LABEL. 09 §6 promises `webhook.grant` is "the keychain
         label of the secret that signs the POST", `install` prints it on the CALLS OUT line and the accept refuses a
         digest until the keychain holds it, and this queued the url and the body alone: measured, the
         `notify.webhook` for `grant: 'collector'` held two keys and no deliverer could have signed anything. The label
         is the reference a host resolves, as a call's `pull.fetch` names its key, and the key's value never enters
         the record, so it cannot enter the body; the body is what the endpoint reads. */
      if (sent.webhook)
        deps.outbox('notify.webhook', {
          url: sent.webhook,
          body: JSON.stringify({ digest: sent.digest, sections: sent.sections }),
          ...(sent.webhook_grant ? { grant: sent.webhook_grant } : {}),
          /* `because` MATCHES THE OTHER TWO CHANNELS, so `lapseDrops` need not fall back to reading
             `body.digest`: it already does, for an older row, but a fresh one carries this first. */
          because: `digest.${sent.digest}`,
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
export function headline(name: string, sections: DigestPart[], held: readonly string[] = []): string {
  const own = sections.map((s) =>
    /* A REFUSED SECTION IS AN EM DASH, NOT A ZERO. It fell through to `rows.length`, so a money
       figure the record had refused to compute was announced as nothing owed — the email said why
       and the notification said zero, and the notification is the one somebody reads first. */
    s.refusals.length
      ? `${s.heading} —`
      : s.reading
        ? `${s.heading} ${figure(s.reading)}`
        : `${s.heading} ${s.matched ?? s.rows.length}`,
  );
  const parts = held.length > 0 ? [`${HELD_HEADING} ${held.length}`, ...own] : own;
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

/** The words a person reads in one line: a fence, a pipe or a heading's marks is none. */
function wordsIn(line: string): number {
  return line.split(/[\s|]+/u).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

const MORE_IN = 'More in BrainDog.';

/**
 * The body, as the block dialect — so an email and a page are drawn from the same text.
 *
 * FIVE LINES A SECTION AND 150 WORDS IN ALL, because a digest is read on a phone: a section draws `SECTION_LINES` and
 * counts the rest, and once the words would pass `WORDS_MOST` nothing more is drawn and it ends `More in BrainDog.`
 * The words counted are the ones a person reads, headings and cells; the closing line's own are kept back for it.
 */
export function render(name: string, sections: DigestPart[], held: readonly string[] = []): string {
  const out: string[] = [`# ${name}`, ''];
  let left = WORDS_MOST - wordsIn(name) - wordsIn(MORE_IN);
  let cut = false;
  /** Whether `line` still fits, counting it when it does. Once one does not, none after it does either. */
  const fits = (line: string): boolean => {
    if (cut) return false;
    const n = wordsIn(line);
    if (n > left) {
      cut = true;
      return false;
    }
    left -= n;
    return true;
  };
  /* WHAT WAS HELD LEADS, because it is the part somebody was meant to hear last night. Five lines and a count of the
     rest: a night that held twenty is a night to open the record, not one to read in a mail. */
  if (held.length > 0 && fits(HELD_HEADING)) {
    out.push(`## ${HELD_HEADING}`, '');
    let said = 0;
    for (const say of held.slice(0, HELD_LINES)) {
      if (!fits(say)) break;
      out.push(`- ${say}`);
      said += 1;
    }
    if (held.length > said && !cut && fits(`And ${held.length - said} more.`)) out.push('', `And ${held.length - said} more.`);
    out.push('');
  }
  for (const s of sections) {
    const from = out.length;
    if (!fits(s.heading)) break;
    out.push(`## ${s.heading}`);
    if (s.refusals.length) {
      if (fits(s.refusals[0]!.fix)) out.push('', s.refusals[0]!.fix, '');
      else out.length = from;
      continue;
    }
    if (s.reading) {
      const stat = `${s.heading} | ${figure(s.reading)}`;
      if (fits(stat)) out.push('', '```stat', stat, '```', '');
      else out.length = from;
      continue;
    }
    const columns = s.columns ?? [];
    out.push('', '```table');
    if (columns.length && !fits(columns.map((c) => c.label ?? c.field).join(' '))) {
      out.length = from;
      break;
    }
    if (columns.length) out.push(columns.map((c) => c.label ?? c.field).join(' | '));
    let drawn = 0;
    for (const row of s.rows.slice(0, SECTION_LINES)) {
      /* BOTH BRANCHES THROUGH `cell`. The fallback interpolated raw, so a value with a pipe in it
         split into two columns — in the one branch that exists because nobody said which columns. */
      const line = columns.length
        ? columns.map((c) => cell(row, c.field)).join(' | ')
        : `${cell(row, 'seq')} | ${cell(row, Object.keys(row.fields)[0] ?? '')}`;
      if (!fits(line)) break;
      out.push(line);
      drawn += 1;
    }
    /* A HEADING OVER NOTHING IS TAKEN BACK: the words ran out before its first line. */
    if (drawn === 0 && s.rows.length > 0) {
      out.length = from;
      break;
    }
    out.push('```');
    const more = (s.matched ?? s.rows.length) - drawn;
    if (more > 0 && fits(`And ${more} more.`)) out.push('', `And ${more} more.`);
    out.push('');
  }
  if (cut) out.push(MORE_IN);
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
 * already carries the zone data, and `clock.ts` is where a wall-clock time on a date becomes an
 * instant, so this walks local dates and hands each one to it.
 *
 * ONE READING OF A SKIPPED OR REPEATED TIME, SHARED WITH THE CALENDAR CLOCK. This walk used to do
 * its own offset arithmetic, and measured in New York it disagreed with `nextCalendar` on both
 * nights a year that matter: 02:30 on 14 March 2027, which the zone skips, came out 01:30 EST where
 * the clock says 03:30 EDT, and 01:30 on 7 November, which the zone says twice, came out the second
 * where the clock takes the first. So a daily digest and a monthly rule both written `at: 02:30`
 * ran an hour apart. London did the same on its own two nights (`test/digest-dst.test.ts`).
 */
export function nextOccurrence(schedule: { day?: string; at: string }, fromMs: number, tz: string): number | null {
  /* THE TIME IS CHECKED, not defaulted. `Number('8am')` is `NaN` and `NaN ?? 8` is `NaN`, so a
     malformed `at` silently became "twenty-four hours from now", a weekly digest arriving at a
     different hour every week with nothing anywhere saying why. `timeOf` is the calendar clock's
     reading of the same `HH:MM`, so the two cannot disagree about what a time is either. */
  const time = timeOf(schedule.at);
  if (time === null) return null;

  const wanted = schedule.day === undefined ? -1 : DAYS.indexOf(schedule.day.toLowerCase());
  if (schedule.day !== undefined && wanted < 0) return null;

  /* THE WALK STEPS THE LOCAL DATE, NEVER 24 HOURS OF INSTANT. It added a day's milliseconds to
     `fromMs` and read the date there, and 24 hours from 23:30 EST on 13 March 2027 is 00:30 EDT on
     the 15th, because the 14th is 23 hours long: a digest re-armed that evening answered the 15th,
     at 09:00 as much as at 02:30. Dates counted in `Date.UTC` have no zone and no short days, and
     today plus seven always reaches the weekday a weekly digest wants. */
  const today = localParts(fromMs, tz);
  for (let step = 0; step <= 7; step++) {
    const date = new Date(Date.UTC(today.year, today.month, today.day + step));
    if (wanted >= 0 && date.getUTCDay() !== wanted) continue;
    const at = wallInstant(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), time.hh, time.mm, tz);
    if (at !== null && at > fromMs) return at;
  }
  return null;
}

/**
 * The instant a wall-clock time on a local date names in a zone, as `clock.ts` reads it.
 *
 * THROUGH `nextCalendar` BECAUSE ITS `instantOf` IS NOT EXPORTED, and a second copy of it here is
 * the disagreement this replaced. A yearly clock pinned to this date and asked from two days before
 * it can only land on this date: two days back is still the same month or the one before, the clock
 * steps forward to the month it names, and the answer on the date is always later than two days
 * before it, so the first candidate is the one returned.
 */
function wallInstant(year: number, month: number, day: number, hh: number, mm: number, tz: string): number | null {
  return nextCalendar({ months: 12, month, day, hh, mm }, Date.UTC(year, month, day) - 2 * 86_400_000, tz);
}

/** The local parts of an instant, from the runtime's own zone data, month from 0. */
export function localParts(
  ms: number,
  tz: string,
): { year: number; month: number; day: number; weekday: number; hour: number; minute: number; second: number } {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year ?? 0),
    month: Number(parts.month ?? 1) - 1,
    day: Number(parts.day ?? 1),
    weekday: DAYS.indexOf(String(parts.weekday ?? '').slice(0, 3).toLowerCase()),
    hour: Number(parts.hour ?? 0),
    minute: Number(parts.minute ?? 0),
    second: Number(parts.second ?? 0),
  };
}

/**
 * The record's quiet hours: a window in its own time zone, or `'off'` (`09 §5` rule 3). `from` and `to` are `HH:MM`,
 * and a window whose `from` is later than its `to` runs across midnight.
 */
export type QuietWindow = { from: string; to: string } | 'off';

/** The window a record holds until its owner says otherwise: 21:00 to 08:00. It was 22:00; a window somebody set is kept as set. */
export const QUIET_DEFAULT: { from: string; to: string } = { from: '21:00', to: '08:00' };

/** One time-sensitive notice as a digest reads it back: when it was said, and its one line. */
export type HeldNotice = { at: number; say: string };

/** The heading a digest leads with when quiet hours held something, and how many lines it draws before it counts. */
const HELD_HEADING = 'Held in quiet hours';
const HELD_LINES = 5;

/**
 * The notices that were said inside quiet hours, soonest first: the ones `notify` wrote and did not sound.
 *
 * BY THE INSTANT EACH WAS SAID AND THE WINDOW AS IT IS NOW. Nothing marks a held notice apart from a sounded one but
 * the hour on its event, so the hour is what is read; a window moved overnight is read as it stands in the morning.
 */
export function heldIn(said: readonly HeldNotice[], tz: string, window: QuietWindow): HeldNotice[] {
  return said.filter((n) => inQuietHours(n.at, tz, window)).sort((a, b) => a.at - b.at);
}

/**
 * What `record.quiet` holds, read as a window (migration 0020).
 *
 * ANYTHING UNREADABLE READS AS THE DEFAULT, never as off. The column is written only by `setQuietHours`, so a value this
 * cannot read is a value somebody wrote by hand, and holding a digest to the hours every record started with is the
 * failure a person notices least; waking them at three in the morning is the one they notice most.
 */
export function quietOf(stored: string | null | undefined): QuietWindow {
  if (stored === null || stored === undefined) return QUIET_DEFAULT;
  if (stored === 'off') return 'off';
  let parsed: unknown;
  try {
    parsed = JSON.parse(stored);
  } catch {
    return QUIET_DEFAULT;
  }
  const w = parsed as { from?: unknown; to?: unknown } | null;
  const from = timeOf(w?.from);
  const to = timeOf(w?.to);
  if (from === null || to === null) return QUIET_DEFAULT;
  return { from: hhmm(from), to: hhmm(to) };
}

/** A time as `HH:MM`, padded, so `8:00` typed and `08:00` stored are one window. */
export const hhmm = (t: { hh: number; mm: number }): string => `${String(t.hh).padStart(2, '0')}:${String(t.mm).padStart(2, '0')}`;

/**
 * Whether an instant falls inside the record's quiet hours. A notification inside them waits, whatever its level.
 *
 * THE WINDOW IS THE RECORD'S, AND ABSENT READS AS THE DEFAULT, so a caller that has not read `record.quiet` keeps the
 * behaviour every record had while this was a constant. A window whose ends are equal holds nothing: `setQuietHours`
 * refuses one, and reading it as "all day" would stop every digest for good.
 */
export const inQuietHours = (ms: number, tz: string, window: QuietWindow = QUIET_DEFAULT): boolean => {
  if (window === 'off') return false;
  const from = timeOf(window.from);
  const to = timeOf(window.to);
  if (from === null || to === null) return false;
  const local = localParts(ms, tz);
  const at = local.hour * 60 + local.minute;
  const start = from.hh * 60 + from.mm;
  const end = to.hh * 60 + to.mm;
  if (start === end) return false;
  return start < end ? at >= start && at < end : at >= start || at < end;
};

/**
 * The instant the quiet hours around `ms` end, which is when a digest held by them goes (`09 §5` rule 3, "moves to the
 * next opening").
 *
 * THE NEXT WALL-CLOCK `to` AFTER `ms`, through `nextOccurrence`, so the opening is found the way a digest's own `at:` is
 * and a short day at a clock change cannot move it by an hour. A window that is off, or an opening that the zone skips
 * entirely, answers an hour on, so the handler asks again rather than holding the digest for a day.
 */
export function quietEnds(ms: number, tz: string, window: QuietWindow): number {
  if (window === 'off') return ms;
  return nextOccurrence({ at: window.to }, ms, tz) ?? ms + 3_600_000;
}

/**
 * What an urgent notice's `note` event carries in `field`, the column a note otherwise leaves empty, as a comment's
 * resolution carries `resolve` there.
 *
 * THE EVENT IS THE ONLY TRACE OF WHICH IT WAS. `notify` routes by its level and the outbox rows it queued drain and go,
 * so a reader of the log later could not tell an interrupt from a note bound for the digest, and a person's mute
 * (`mutedFor`) has to: what interrupts is never muted.
 */
export const URGENT_NOTE = 'urgent';

/**
 * Whether one line of the log is a notice this person muted: a `note` from an actor in their `notify.muted`, and never
 * an urgent one. Only notices are muted, so the rule's own writes to a row still show, and the log keeps every line.
 */
export function mutedFor(line: { kind: string; actor: string; field: string | null }, muted: ReadonlySet<string>): boolean {
  return line.kind === 'note' && line.field !== URGENT_NOTE && muted.has(line.actor);
}

/** An in-app note, as the event that IS the notification. */
export function noteEvent(sql: Sql, mint: () => string, nowMs: number, actor: string, text: string, urgent = false, about?: { target: string; target_kind: string }): void {
  /* A DIGEST'S PROSE IS WRITTEN BY SLASH and its note is not a `note` a model may sign. `prose:
     slash` is the one declaration that puts a model's sentences into a digest, and if the actor of
     that note were ever the model rather than the record, this is where it would land. */
  slashMayWrite(actor, 'note');
  sql.exec(
    "INSERT INTO event (id, ts, actor, kind, target, target_kind, field, note) VALUES (?, ?, ?, 'note', ?, ?, ?, ?)",
    mint(),
    instant(nowMs),
    actor,
    /* WHAT IT IS ABOUT, when a caller says: an add-on's notice names its add-on, so the bell opens its page. */
    about?.target ?? null,
    about?.target_kind ?? null,
    urgent ? URGENT_NOTE : null,
    text.slice(0, 280),
  );
}

/** How loud one notice is. `passive` is the note; `active` adds a push; `time-sensitive` adds a push and a mail. */
export const LEVELS = ['passive', 'active', 'time-sensitive'] as const;
export type Level = (typeof LEVELS)[number];

/** The level a notice asks for. A level said wins; `urgent: true` alone is time-sensitive, as every caller that says it means. */
export const levelOf = (said: { level?: Level | undefined; urgent?: boolean | undefined }): Level =>
  said.level ?? (said.urgent === true ? 'time-sensitive' : 'passive');

/** What an active push says: how many things wait, and never what they are. */
const waitingLine = (n: number): string => (n === 1 ? '1 thing waits for you' : `${n} things wait for you`);

/**
 * ONE NOTIFICATION, ROUTED BY ITS LEVEL. `09 §4`, and `45 §5.9` names this helper.
 *
 * THREE LEVELS, AND THEY DIFFER BY CHANNEL. Passive is the `note` event, which the digest and the unread count are
 * counted over. Active is the note and one push that says how many things wait. Time-sensitive is the note, a push
 * and a mail. A phone cannot always be asked to tell two pushes apart, so what tells the levels apart is what arrives:
 * nothing, a push, a push and a mail.
 *
 * `urgent: true` IS TIME-SENSITIVE. It was once written in four places and read in none: a rule declaring
 * `{ notify: { say: "Payment failed", urgent: true } }` wrote a note and stopped, while the install diff told the
 * person it "interrupts you". Every caller that says it still gets the push and the mail.
 *
 * AN ACTIVE PUSH IS ONE AN HOUR PER RECORD, NOT PER RULE. Ten rules firing on one write is one afternoon, and ten
 * pushes is a person who turns notifications off, after which the one that mattered arrives somewhere they no longer
 * look. `09 §7` states it as a thing this subsystem must never do. So the push carries a count and not a sentence:
 * the one that was swallowed is still in the number the next one says.
 *
 * A TIME-SENSITIVE ONE IS ONCE FOR ITS CAUSE, and is not swallowed by the hour: a failed payment five minutes after
 * a question was filed is still a failed payment. A notice that names no cause, or a caller that cannot say what was
 * told, keeps the hour's limit it always had.
 *
 * AND INSIDE QUIET HOURS NOTHING SOUNDS. This used to let an urgent notice through at three in the morning on the
 * argument that it was urgent then or never. The rule is the other way now: no sound inside them. The note is written,
 * marked as before, and the next digest leads with it (`heldIn`, `runDigest`), so what was held is the first thing
 * read in the morning and not a thing found by scrolling.
 */
export function notify(deps: DigestDeps, said: Notice): void {
  const level = levelOf(said);

  /* THE EVENT ALWAYS, because it is the record's own memory of the thing having happened, and it is
     what the digest and the unread count are counted over. */
  deps.note(said.actor, said.say.slice(0, 280), level === 'time-sensitive');
  if (level === 'passive') return;

  /* HELD, AND BY THE RECORD'S OWN WINDOW ONLY (`DigestDeps.quiet`). Nothing is queued to go later: a push that
     arrives at eight about eleven is a second thing saying what the digest at eight already leads with. */
  if (deps.quiet !== undefined && inQuietHours(deps.nowMs, deps.tz, deps.quiet)) return;

  if (level === 'active') {
    /* AT MOST ONE PER HOUR. The check is the caller's because this file holds no SQL, and it is a check rather than
       a queue: the count the next push carries already holds this one. */
    if (deps.interrupted()) return;
    const waiting = Math.max(1, Math.trunc(deps.waiting?.() ?? 1));
    deps.outbox('notify.push', { title: waitingLine(waiting), url: said.url ?? '/', level });
    return;
  }

  const cause = said.cause !== undefined && said.cause !== '' && deps.told ? said.cause : null;
  if (cause === null ? deps.interrupted() : deps.told?.(cause) === true) return;
  const marked = cause === null ? {} : { cause };

  deps.outbox('notify.push', { title: said.say.slice(0, 120), url: said.url ?? '/', level, ...marked });

  /* AND THE EMAIL, WHICH IS THE HALF THAT SURVIVES A PHONE IN A DRAWER. `09 §3` gives push "one
     line, no content" and email "anything with a table in it", so the email carries the reason and
     the push carries the fact. A record with no owner address sends the push alone. */
  const to = deps.owners();
  if (to.length > 0)
    deps.outbox('notify.email', {
      to,
      subject: said.say.slice(0, 120),
      text: said.because ? `${said.say}\n\n${said.because}` : said.say,
      ...marked,
      /* THE ROW THE NOTICE IS ABOUT, for the mail's button and its quiet link (`rules.ts` `aboutOf`). The Worker makes
         the app's address of `open` and draws both; a payload without them is the mail it always was. */
      ...(said.about?.open ? { open: said.about.open } : {}),
      ...(said.about?.link ? { link: said.about.link, ...(said.about.linkLabel ? { link_label: said.about.linkLabel } : {}) } : {}),
    });
}

/** What one notice carries. `09 §4`'s six keys, minus the three the caller has already resolved. */
export type Notice = {
  /** Who or what it is about: `rule:chase`, `grant:g_01J…`. The event's actor. */
  actor: string;
  /** One line, and the whole of what a time-sensitive push carries. */
  say: string;
  /** Why, for the email. A push carries no content: a lock screen is not a place somebody chose to read their business on. */
  because?: string | undefined;
  /** Where in the app it is about. */
  url?: string | undefined;
  /** How loud it is (`LEVELS`). Unsaid, `urgent` decides. */
  level?: Level | undefined;
  /** `true` is time-sensitive and `false` is passive, for a caller that says no `level`. */
  urgent?: boolean | undefined;
  /**
   * What a time-sensitive notice is about, as a handle the caller keeps stable: it pushes and mails once for it.
   * It rides the queued push and mail so the caller can answer `told`, and is never shown to a person.
   */
  cause?: string | undefined;
  /** The row it is about, for the mail only: its page, and the first link out the row holds (`rules.ts` `aboutOf`). */
  about?: { open?: string; link?: string; linkLabel?: string } | undefined;
};
