/**
 * The things a person supplies, put into `live-feed.pack.json`. The document is the file; this is only the fill.
 *
 * WHAT A LIVE FEED IS. A project that answers its own numbers at a JSON address, `{"data":{"mrr":4200,"users":128}}`,
 * is polled on a schedule, and each number the owner names becomes a reading in `datapoints`, marked `polled`, on the
 * project it is about. One poll an address and one map a measure, so three measures at one address are one request
 * an interval. A key, when the address needs one, is named by its label in the vault and opened by the host at send
 * time; the pack never holds it, and `SECRET_IN_PACK` refuses one that tries.
 *
 * WHEN A READING IS DATED. By default the moment the answer arrived. A measure that names `at` is dated from the answer
 * instead, a day or an instant at a path, which is what a feed of day counts needs: the count for the 20th asked on the
 * 21st is the 20th's. A feed asked in whole days may say when in the day it is asked (`at`, with `tz`).
 *
 * MONEY IS MONEY. A measure that says `money` writes the reading's `amount`, integer minor units and a currency, in
 * place of its decimal `value`, so the record never has to guess a currency from a unit of text.
 *
 * THE SPEC IS THE SETUP FILE'S POLL, FIELD FOR FIELD: `{ id, url, every, grant, project, organisation, measures }`,
 * which the app's form and the importer hand over as they stand.
 *
 * THE FILL CHECKS WHAT THE PLAN CANNOT SHOW. The line the owner approves is `CALLS OUT <host> · every 1h · grant
 * "<label>"`, and it says nothing about the map or the scheme, so this is the last place that can refuse before he
 * presses the button:
 *   - an address that is not `https://` is refused by the host on every run (`sendAction` in
 *     `packages/host/src/actions.ts`), so it would be approved and then never once be asked;
 *   - no measure is a call out every interval that writes nothing;
 *   - a measure named twice is two readings of one thing at one instant that disagree, and nothing says which is right;
 *   - an id too long for the poll's name, a time of day on a feed not asked in whole days, or a zone with no time, are
 *     each refused by `install` after the approval (`validateDeclaration`).
 */

/**
 * The most measures one poll fills, the record's `POLL_MAPS_MOST` (`packages/kernel/src/declare.ts`). Past it the
 * fill makes a second poll of the same address, `feed_<id>_2`, and the summary says it is 2 requests each time.
 *
 * A HAND COPY, BECAUSE THE NUMBER IS NOT ON THE KERNEL'S SURFACE: its one entry point does not re-export it. What
 * holds the copy is the record's own `validateDeclaration`, asked in `live-feed.test.ts` at twenty and twenty-one.
 */
export const FEED_MEASURES_MOST = 20;

/**
 * The longest name a poll may have, the record's `IDENT` (`packages/kernel/src/declare.ts`). Before 2.0.0 a longer one
 * was cut to this without a word, so two long ids that began alike named one poll.
 */
export const FEED_NAME_MOST = 32;

export type FeedMeasure = {
  /** The measure's name as the Dashboard shows it: `Monthly recurring revenue`. */
  name: string;
  /** Where the number is in the answer: `data.mrr`, `plans[0].count`. */
  path: string;
  /** `USD`, `users`, `%`. */
  unit?: string;
  /** How the number is read. A measure is a decimal; `int` refuses a fraction. */
  type?: 'decimal' | 'int';
  /** Where the reading's date is in the answer, and whether it is a whole day or an instant. Absent, it is dated when the answer arrived. */
  at?: { path: string; as: 'day' | 'instant' };
  /** The number is money in this currency, in whole units (`42.50`) or, with `minor`, in minor units (`4250`). */
  money?: { currency: string; minor?: boolean };
};

export type FeedSpec = {
  /** Names the pack, `feed-<id>`, and its poll. Lower case, digits and hyphens. */
  id: string;
  /** The whole `https://` address. A literal host, never computed. */
  url: string;
  /** How often it is asked. */
  every: string;
  /** The time of day it is asked, `07:00`, for a feed asked in whole days. */
  at?: string;
  /** The zone that time is read in, `Africa/Cairo`. Absent, the record's own. */
  tz?: string;
  /** The label of the key in the vault the request sends as a bearer, or absent for an address that answers anybody. */
  grant?: string;
  /** The project the numbers are about, as a row id or its spoken id (`things#1`). */
  project?: string;
  /** The organisation the numbers are about, as a row id or its spoken id (`organisations#1`). */
  organisation?: string;
  measures: readonly FeedMeasure[];
};

type Entry = Record<string, unknown>;
type Poll = Record<string, unknown> & { map: Entry[] };

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
/** `every` as the record reads it (`intervalMs` in `packages/kernel/src/pull.ts`): whole days are `d` and `w`. */
const WHOLE_DAYS = /^\d{1,4}[dw]$/u;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/u;
const CURRENCY = /^[A-Z]{3}$/u;

/** An id as an identifier: `kiln-stats` is `kiln_stats`. */
const ident = (text: string): string => text.replace(/-/gu, '_');

const present = (text: string | undefined): string | undefined => {
  const t = text?.trim();
  return t === undefined || t === '' ? undefined : t;
};

const isZone = (tz: string): boolean => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

const counted = (n: number): string => (n === 1 ? 'one request' : `${n} requests`);

/** The measures in polls of `FEED_MEASURES_MOST`, each a request an interval. */
const pollsOf = <T>(measures: readonly T[]): T[][] =>
  Array.from({ length: Math.ceil(measures.length / FEED_MEASURES_MOST) }, (_, i) => measures.slice(i * FEED_MEASURES_MOST, (i + 1) * FEED_MEASURES_MOST));

/** The checks one measure is held to, beyond its name and path. */
function measureFault(m: FeedMeasure, name: string): string | null {
  if (m.at !== undefined) {
    if (typeof m.at.path !== 'string' || m.at.path.trim() === '') return `${name} is dated from the answer and names no path to its date.`;
    if (m.at.as !== 'day' && m.at.as !== 'instant') return `${name}'s date is read as a day or as an instant, and ${JSON.stringify(m.at.as)} is neither.`;
  }
  if (m.money !== undefined) {
    const currency = m.money.currency?.trim().toUpperCase() ?? '';
    if (!CURRENCY.test(currency)) return `${name} is money, so it names its currency in three letters, such as USD.`;
    if (m.type !== undefined) return `${name} is money, which is read as money, so it takes no type.`;
    const unit = present(m.unit);
    if (unit !== undefined && unit.toUpperCase() !== currency) return `${name} is money in ${currency} and says its unit is ${unit}, and a reading is in one currency.`;
  }
  return null;
}

/** The pack file filled for one address: `template` is `live-feed.pack.json` as read, and is not changed. */
export function fillFeed(template: Record<string, unknown>, spec: FeedSpec): Record<string, unknown> {
  if (!ID.test(spec.id)) throw new Error(`${spec.id} is not an id: a feed's id is lower case, digits and hyphens.`);
  let url: URL;
  try {
    url = new URL(spec.url);
  } catch {
    throw new Error(`${spec.url} is not a whole https:// address.`);
  }
  if (url.protocol !== 'https:') throw new Error(`${spec.url} is not an https:// address, and the host sends nothing to any other.`);
  if (spec.measures.length === 0) throw new Error('A feed needs at least one measure, or it calls out every interval and writes nothing.');
  const names = new Set<string>();
  for (const m of spec.measures) {
    const name = m.name.trim();
    if (name === '' || m.path.trim() === '') throw new Error('Every measure needs a name and a path to its number in the answer.');
    if (names.has(name)) throw new Error(`${name} is named twice, so each answer would write two readings of it that could disagree.`);
    names.add(name);
    const fault = measureFault(m, name);
    if (fault !== null) throw new Error(fault);
  }

  /* THE POLL'S NAME IS NEVER CUT. Each poll past the first is `<name>_<n>`, so the id has to leave room for that too. */
  const groups = pollsOf(spec.measures);
  const ingest = `feed_${ident(spec.id)}`;
  const suffix = groups.length === 1 ? '' : `_${groups.length}`;
  if (ingest.length + suffix.length > FEED_NAME_MOST) {
    const room = FEED_NAME_MOST - 'feed_'.length - suffix.length;
    throw new Error(`${spec.id} is ${spec.id.length} characters, and a feed's id is ${room} at most${suffix === '' ? '' : ` with ${groups.length} polls`}, because its poll's name is ${FEED_NAME_MOST} at most.`);
  }

  const at = present(spec.at);
  const tz = present(spec.tz);
  if (tz !== undefined && !isZone(tz)) throw new Error(`${tz} is not a time zone. Name one such as Africa/Cairo or Europe/London.`);
  if (tz !== undefined && at === undefined) throw new Error(`${tz} is a zone with no time of day, so it changes nothing. Say when in the day it is asked, such as 07:00.`);
  if (at !== undefined && !TIME.test(at)) throw new Error(`${at} is not a time of day. Write it from 00:00 to 23:59, such as 07:00.`);
  if (at !== undefined && !WHOLE_DAYS.test(spec.every.trim())) throw new Error(`A feed asked every ${spec.every} has no time of day, because one repeats only on whole days. Ask it every 1d, 2d or 1w.`);

  const grant = present(spec.grant);
  const project = present(spec.project);
  const organisation = present(spec.organisation);
  /* `unlisted` and `changes` ARE THE TEMPLATE'S: it is kept off Browse and its release note is about itself, while a
     filled feed is listed nowhere and is nobody's release. */
  const { fill: _marks, unlisted: _template, changes: _notes, ...doc } = structuredClone(template);
  const poll = (doc.declarations as Poll[])[0]!;
  /* THE ROW'S STAMP IS THE FILE'S: every map carries the first map's `source` and `at`, so the file says what a
     polled reading is marked and when it is dated, and the fill only says which numbers and, for a measure that
     names one, where its date is. */
  const { source, at: arrived } = poll.map[0]!;

  const mapOf = (m: FeedMeasure): Entry => {
    const unit = present(m.unit);
    const money = m.money === undefined ? undefined : { currency: m.money.currency.trim().toUpperCase(), minor: m.money.minor === true };
    return {
      name: { value: m.name.trim() },
      ...(money === undefined
        ? { value: { path: m.path.trim(), type: m.type ?? 'decimal' } }
        : { amount: { path: m.path.trim(), type: 'money', currency: money.currency, ...(money.minor ? { minor: true } : {}) } }),
      ...(unit === undefined ? {} : { unit: { value: unit } }),
      ...(project === undefined ? {} : { thing: { value: project } }),
      ...(organisation === undefined ? {} : { organisation: { value: organisation } }),
      source,
      at: m.at === undefined ? arrived : { path: m.at.path.trim(), type: m.at.as },
    };
  };

  doc.pack = `feed-${spec.id}`;
  doc.title = `Numbers from ${url.host}`;
  doc.summary = `Polls ${url.host} every ${spec.every}${at === undefined ? '' : ` at ${at}${tz === undefined ? '' : ` ${tz}`}`}, ${counted(groups.length)} each time, for ${[...names].join(', ')}.`;
  /* THE KEYS IN THE ORDER THE TEMPLATE WRITES THEM, so a filled file reads as the template does. */
  doc.declarations = groups.map(
    (measures, i): Poll => ({
      ingest: i === 0 ? ingest : `${ingest}_${i + 1}`,
      channel: poll.channel,
      url: spec.url,
      every: spec.every,
      ...(at === undefined ? {} : { at }),
      ...(tz === undefined ? {} : { tz }),
      ...(grant === undefined ? {} : { grant }),
      ...(project === undefined ? {} : { project }),
      map: measures.map(mapOf),
      writes: poll.writes,
    }),
  );
  return doc;
}
