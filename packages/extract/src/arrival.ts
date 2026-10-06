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
     `{ field: from_domain, is: bank.example }` and is answered the same here as on the stored arrival. Absent rather
     than empty when the header names no address, for the reason a missing header is. */
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

/**
 * The sender out of a `from` header: the kernel's `senderOf` (`packages/kernel/src/ingest.ts`), rule for rule, because
 * the stored arrival is filled by it and a pattern asked here has to get the stored arrival's answer. Its identity
 * reader `parseFrom` is stricter (one address, a dotted domain, no encoded words), so it would answer a different
 * question. When `@braindog/kernel` exports `senderOf`, this becomes that import.
 */
function senderOf(header: string): { name: string; address: string; domain: string } {
  const parts = header.replace(/\r?\n[ \t]+/g, ' ').split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);
  const first = parts.findIndex((part) => part.includes('@'));
  const text = first === -1 ? '' : parts.slice(0, first + 1).join(',').trim();
  const angled = /<\s*(?:mailto:)?([^<>\s@]+@[^<>\s@]+?)\s*>/i.exec(text);
  const bare = angled === null ? /(?:^|[\s;:("])(?:mailto:)?([^\s<>"(),;:@]+@[^\s<>"(),;:@]+)/i.exec(text) : null;
  const found = (angled?.[1] ?? bare?.[1] ?? '').replace(/\.$/, '').toLowerCase();
  if (found === '') return { name: '', address: '', domain: '' };
  const named = angled !== null ? text.slice(0, angled.index) : (/\(([^()]*)\)/.exec(text.slice((bare?.index ?? 0) + (bare?.[0].length ?? 0)))?.[1] ?? '');
  const unquoted = named.trim().replace(/^"([\s\S]*)"$/, '$1').replace(/\\(.)/g, '$1');
  const name = decodeWords(unquoted).replace(/\s+/g, ' ').trim().replace(/^['"]+|['"]+$/g, '').trim();
  return { name: name.toLowerCase() === found ? '' : name, address: found, domain: found.slice(found.lastIndexOf('@') + 1) };
}

/** RFC 2047's encoded words decoded in a display name, as the kernel's `decodeWords`. One it cannot decode stays as written. */
function decodeWords(text: string): string {
  const WORD = /=\?([^?\s]+)\?([BbQq])\?([^?\s]*)\?=/g;
  return text.replace(/(=\?[^?\s]+\?[BbQq]\?[^?\s]*\?=)\s+(?==\?[^?\s]+\?[BbQq]\?[^?\s]*\?=)/g, '$1').replace(WORD, (word, charset: string, how: string, data: string) => {
    try {
      const bytes =
        how.toUpperCase() === 'B'
          ? Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
          : Uint8Array.from(
              data.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})|[\s\S]/g, (c, hex: string | undefined) => (hex === undefined ? c : String.fromCharCode(parseInt(hex, 16)))),
              (c) => c.charCodeAt(0),
            );
      return new TextDecoder(charset.split('*')[0]!.trim().toLowerCase()).decode(bytes);
    } catch {
      return word;
    }
  });
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
