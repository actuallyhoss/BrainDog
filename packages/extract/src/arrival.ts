/**
 * `43 §5.2` — whether a declaration is the one for this arrival, and whether to skip it.
 *
 * TWO QUESTIONS, ONE EVALUATOR, AND THAT IS THE POINT. `match:` asks whether this ingest is the reader of
 * this arrival; `skip:` asks whether a reader that owns it should decline it anyway. They are different
 * decisions and they run the same grammar over the same subject, so an author who can write one can write
 * the other without learning a second vocabulary.
 *
 * THE BODY IS THE ONE AS STORED AND NOT THE NORMALISED ONE. `§5.2` step 1 is explicit, and the reason is
 * that the record may ask this same question in SQL as `instr(lower(body), lower(?))` over the same row.
 * Two answers to "does this arrival match" is the failure that puts an arrival in one place in memory and
 * another on disk. Normalisation belongs to `§5.1` step 4, after this has already decided.
 *
 * A DECLARATION WITH NO `match:` IS TRUE. That is `§5.2` step 2 and it is not a convenience: an ingest bound
 * to a channel that carries one provider needs no predicate, and making it write `{}` to say so would be a
 * ceremony that can be got wrong.
 */

import { senderOf } from '@braindog/kernel';
import { evaluate, INBOX_RAW, type Predicate } from '@braindog/where';

/** `30 §1`'s five. */
export const CHANNELS = ['email', 'webhook', 'pull', 'paste', 'api'] as const;
export type Channel = (typeof CHANNELS)[number];

/** `§4.1`. `headers` keys are lower-cased on arrival, which is what lets `from` be read without a search. */
export type RawArrival = {
  id: string;
  ts: string;
  channel: Channel;
  headers?: Record<string, string>;
  body: string;
};

/** The `§5.2` subset of a declaration. `declare` (42) owns the whole schema and lints it at install. */
export type Matchable = {
  match?: Predicate;
  skip?: { when: Predicate; reason: string }[];
};

/**
 * The fields of `34 §1.9`, built from the arrival: its seven, and the sender read out of `from` as three.
 *
 * `state` IS ALWAYS `untriaged` HERE, because this runs before the arrival has been triaged; that is the
 * whole point of running it. It is in the grammar because the record asks the same questions of rows that
 * have moved on, and a field that exists on one side and not the other is a predicate that means two things.
 *
 * A HEADER THAT IS NOT THERE IS ABSENT AND NOT EMPTY. `34 §1.3` decides what a predicate makes of a missing
 * value, and handing it `''` would answer a different question: `subject is ""` would become true of every
 * webhook, which has no subject at all.
 */
export function subjectOf(raw: RawArrival): Record<string, unknown> {
  const headers = raw.headers ?? {};
  const subject: Record<string, unknown> = {
    body: raw.body,
    channel: raw.channel,
    state: 'untriaged',
    ts: raw.ts,
  };
  for (const name of ['from', 'to', 'subject'] as const)
    if (Object.hasOwn(headers, name)) subject[name] = headers[name];
  /* THE SENDER READ ONCE, BESIDE `from` AND NEVER INSTEAD OF IT, as the record keeps it (`INBOX_RAW`): a pattern says
     `{ field: from_domain, is: bank.example }` and is answered the same here as on the stored arrival. The kernel's own
     `senderOf`, which fills the stored arrival, so the two cannot answer differently; its identity reader `parseFrom`
     is stricter and would answer a different question. Absent rather than empty when the header names no address, for
     the reason a missing header is. */
  if (typeof headers.from === 'string') {
    const sender = senderOf(headers.from);
    if (sender.name !== '') subject.from_name = sender.name;
    if (sender.address !== '') {
      subject.from_address = sender.address;
      subject.from_domain = sender.domain;
    }
  }
  return subject;
}

/** `§5.2` steps 1 and 2. No `match:` is true. */
export function matches(decl: Matchable, raw: RawArrival): boolean {
  return evaluate(decl.match, subjectOf(raw), INBOX_RAW);
}

/**
 * `§5.2` step 3: the first `skip:` whose `when` is true, or `undefined`.
 *
 * DECLARED ORDER AND THE FIRST WINS, rather than the most specific. An author reading their own list top to
 * bottom should be able to say which one fires, and "most specific" is a rule that needs a second rule to
 * say what specific means.
 */
export function skipReason(decl: Matchable, raw: RawArrival): string | undefined {
  if (decl.skip === undefined) return undefined;
  const subject = subjectOf(raw);
  for (const rule of decl.skip) if (evaluate(rule.when, subject, INBOX_RAW)) return rule.reason;
  return undefined;
}
