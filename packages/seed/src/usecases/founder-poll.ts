/**
 * A project the record polls: one JSON address, and which number in it is which measure.
 *
 * WHAT THE FOUNDER'S `poll-setup` SKILL MAKES (`founder.ts`). A project that answers its numbers at an address,
 * `{"data":{"mrr":4200,"users":128}}`, is polled on a schedule, and each number the owner names becomes a datapoint
 * the dashboard draws, marked `polled`, dated the moment the answer arrived.
 *
 * IT IS AN ORDINARY PACK, so it is installed the way every pack is: planned, and approved once by the owner, whose
 * plan names the host, how often, and the key it sends. Nothing here calls anything; the
 * runner does, from the declaration, and refuses a private or local address as it refuses every other.
 *
 * ONE POLL PER ADDRESS. Its `map` is a list, one map a measure, so three measures at one address are one request
 * an interval, and each number becomes its own datapoint from that one answer. The plan prints one line for it.
 *
 * A KEY ONLY WHEN THE ADDRESS NEEDS ONE. An address that answers anybody is polled with no key, so nothing has to be
 * put in the vault for it. The owner's approval at install and the refusal of a private address are the same either way.
 */

export type PolledMeasure = {
  /** The measure's name as the dashboard shows it: `Monthly recurring revenue`. */
  name: string;
  /** Where the number is in the answer, `43 §4.4`: `data.mrr`, `plans[0].count`. */
  path: string;
  /** `GBP`, `users`, `%`. */
  unit?: string;
  /** How the number is read. A measure is a decimal; `int` refuses a fraction. */
  type?: 'decimal' | 'int';
};

export type PollSpec = {
  /** Names the pack, `poll-<id>`, and each poll in it. Lower case, digits and hyphens. */
  id: string;
  /** The whole `https://` address. A literal host, never computed. */
  url: string;
  /** The label of the key in the vault the request sends, or absent for an address that needs none. */
  grant?: string;
  /** `15m` or longer. */
  every: string;
  /** The project the numbers are about, as a row id or its spoken id (`things#1`). */
  project?: string;
  /** The organisation the numbers are about, as a row id or its spoken id (`organisations#1`). */
  organisation?: string;
  measures: readonly PolledMeasure[];
};

/** A measure's name as an identifier: `Monthly recurring revenue` is `monthly_recurring_revenue`. */
const ident = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');

/**
 * The pack document for one polled address.
 *
 * `project` goes on the declaration too, so the meter counts the runs against that project, and the datapoint's
 * `thing` is the same project; `organisation` only fills the row.
 */
export function pollPack(spec: PollSpec): Record<string, unknown> {
  const declarations = [
    {
      ingest: `poll_${ident(spec.id).slice(0, 27) || 'project'}`.replace(/_+$/g, ''),
      channel: 'poll',
      url: spec.url,
      every: spec.every,
      ...(spec.grant === undefined || spec.grant.trim() === '' ? {} : { grant: spec.grant.trim() }),
      ...(spec.project === undefined ? {} : { project: spec.project }),
      map: spec.measures.map((m) => ({
        name: { value: m.name },
        value: { path: m.path, type: m.type ?? 'decimal' },
        ...(m.unit === undefined || m.unit === '' ? {} : { unit: { value: m.unit } }),
        ...(spec.project === undefined ? {} : { thing: { value: spec.project } }),
        ...(spec.organisation === undefined ? {} : { organisation: { value: spec.organisation } }),
        source: { value: 'polled' },
        at: { arrived: true },
      })),
      writes: { register: 'datapoints' },
    },
  ];
  return {
    pack: `poll-${spec.id}`,
    version: '1.0.0',
    summary: `Polls ${hostOf(spec.url)} every ${spec.every} for ${spec.measures.map((m) => m.name).join(', ')}.`,
    author: 'BrainDog',
    license: 'MIT',
    requires: { format: 1, primitives: 1, packs: { 'usecase-founder': '^1.0.0' } },
    declarations,
  };
}

const hostOf = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};
