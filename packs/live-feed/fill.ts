/**
 * The things a person supplies, put into `live-feed.pack.json`. The document is the file; this is only the fill.
 *
 * WHAT A LIVE FEED IS. A project that answers its own numbers at a JSON address, `{"data":{"mrr":4200,"users":128}}`,
 * is polled on a schedule, and each number the owner names becomes a reading in `datapoints`, marked `polled`, dated
 * the moment the answer arrived, on the project it is about. One poll an address and one map a measure, so three
 * measures at one address are one request an interval. A key, when the address needs one, is named by its label in
 * the vault and opened by the host at send time; the pack never holds it, and `SECRET_IN_PACK` refuses one that tries.
 *
 * THE SPEC IS THE SETUP FILE'S POLL, FIELD FOR FIELD. `apps/cli/src/legacy.ts` reads `polls` from the setup file an
 * owner writes beside an export, each one `{ id, url, every, grant, project, organisation, measures }`, which is the
 * `PollSpec` of `packages/seed/src/usecases/founder-poll.ts`. So a poll in a setup file fills this file as it stands,
 * and `live-feed.test.ts` holds the filled declaration equal to what that builder makes, but for its name.
 *
 * THE FILL CHECKS WHAT THE PLAN CANNOT SHOW. The line the owner approves is `CALLS OUT <host> · every 1h · grant
 * "<label>"`, and it says nothing about the map or the scheme, so this is the last place that can refuse before he
 * presses the button:
 *   - an address that is not `https://` is refused by the host on every run (`sendAction` in
 *     `packages/host/src/actions.ts`), so it would be approved and then never once be asked;
 *   - no measure, or more than the record's twenty, is refused by `install` after the approval
 *     (`validateDeclaration`, asked at twenty and twenty-one in the test);
 *   - a measure named twice is two readings of one thing at one instant that disagree, and nothing says which is right.
 */

/**
 * The most measures one feed fills, the record's `POLL_MAPS_MOST` (`packages/kernel/src/declare.ts`).
 *
 * A HAND COPY, BECAUSE THE NUMBER IS NOT ON THE KERNEL'S SURFACE: its one entry point does not re-export it. What
 * holds the copy is the record's own `validateDeclaration`, asked in `live-feed.test.ts` at twenty and twenty-one.
 */
export const FEED_MEASURES_MOST = 20;

export type FeedMeasure = {
  /** The measure's name as the Dashboard shows it: `Monthly recurring revenue`. */
  name: string;
  /** Where the number is in the answer: `data.mrr`, `plans[0].count`. */
  path: string;
  /** `USD`, `users`, `%`. */
  unit?: string;
  /** How the number is read. A measure is a decimal; `int` refuses a fraction. */
  type?: 'decimal' | 'int';
};

export type FeedSpec = {
  /** Names the pack, `feed-<id>`, and its poll. Lower case, digits and hyphens. */
  id: string;
  /** The whole `https://` address. A literal host, never computed. */
  url: string;
  /** How often it is asked. */
  every: string;
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

/** An id as an identifier: `kiln-stats` is `kiln_stats`. */
const ident = (text: string): string => text.replace(/-/gu, '_');

const present = (text: string | undefined): string | undefined => {
  const t = text?.trim();
  return t === undefined || t === '' ? undefined : t;
};

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
  if (spec.measures.length > FEED_MEASURES_MOST) throw new Error(`One feed fills ${FEED_MEASURES_MOST} measures at most, and this one names ${spec.measures.length}.`);
  const names = new Set<string>();
  for (const m of spec.measures) {
    const name = m.name.trim();
    if (name === '' || m.path.trim() === '') throw new Error('Every measure needs a name and a path to its number in the answer.');
    if (names.has(name)) throw new Error(`${name} is named twice, so each answer would write two readings of it that could disagree.`);
    names.add(name);
  }

  const grant = present(spec.grant);
  const project = present(spec.project);
  const organisation = present(spec.organisation);
  const { fill: _marks, ...doc } = structuredClone(template);
  const poll = (doc.declarations as Poll[])[0]!;
  /* THE ROW'S STAMP IS THE FILE'S: every map carries the first map's `source` and `at`, so the file says what a
     polled reading is marked and when it is dated, and the fill only says which numbers. */
  const { source, at } = poll.map[0]!;

  doc.pack = `feed-${spec.id}`;
  doc.summary = `Polls ${url.host} every ${spec.every} for ${[...names].join(', ')}.`;
  /* THE KEYS IN THE ORDER THE SEED'S BUILDER WRITES THEM, so the two declarations compare equal as text as well. */
  const filled: Poll = {
    ingest: `feed_${ident(spec.id)}`.slice(0, 32).replace(/_+$/u, ''),
    channel: poll.channel,
    url: spec.url,
    every: spec.every,
    ...(grant === undefined ? {} : { grant }),
    ...(project === undefined ? {} : { project }),
    map: spec.measures.map((m) => {
      const unit = present(m.unit);
      return {
        name: { value: m.name.trim() },
        value: { path: m.path.trim(), type: m.type ?? 'decimal' },
        ...(unit === undefined ? {} : { unit: { value: unit } }),
        ...(project === undefined ? {} : { thing: { value: project } }),
        ...(organisation === undefined ? {} : { organisation: { value: organisation } }),
        source,
        at,
      };
    }),
    writes: poll.writes,
  };
  (doc.declarations as Poll[])[0] = filled;
  return doc;
}
