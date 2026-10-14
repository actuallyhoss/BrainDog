/**
 * The computed sources a digest's section may read, beside a figure and a list: what agents asked, what they did, the
 * steps they left and the runs working now (AGT-C19, "Phone: three alert levels", "digests at 08:00 and 17:00").
 *
 * A DIGEST READS THEM AS A PAGE DOES, through the one block read (`readBlock`, handed in as `DigestDeps.block`), so a
 * digest never says a question the Needs you tile would not, nor counts a run the Working tile leaves out. This file
 * only turns each answer into the lines a digest draws: one line an item, in plain fields, with the time it is about.
 *
 * NO `faults.open`. The record has no such source yet (`faults-open` is only a figure, `tidy.ts`), and a section naming
 * it is refused `SOURCE_UNKNOWN` as any other unknown source is, rather than drawn empty as if nothing had failed.
 *
 * IT IMPORTS ONLY TYPES, so the digest stays a leaf of the page layer at run time.
 */

import type { Refusal } from '@braindog/ports';

import type { DigestPart, DigestSection } from './digest.ts';
import type { Entry, Json } from './index.ts';
import type { BlockResult, FeedRow, PageRow, QueueQuestion } from './pages.ts';

/** Where an answer keeps its items: `queue` on a queue, `feed` on an agents block, `rows` on cards. */
type Item = QueueQuestion | FeedRow | PageRow;

export type DigestSource = {
  /** The block kind the source is read as, the kind the agents add-on's own pages read it as. */
  kind: 'queue' | 'cards' | 'agents';
  /** The field of a line that says when, which `within` measures. */
  at: string;
  /** What a section that names no columns draws, each with the heading a person reads. */
  columns: readonly { field: string; label: string }[];
  /** One item of the answer as the fields of one line. */
  line: (item: Item) => { fields: Record<string, Json> };
};

/** Words for an app's id as the run holds it (`claude-code`), so a line says Claude Code and never the id. */
const spoken = (id: string): string => id.split(/[-_]+/u).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

/** Who asked: the run's name, else the app it ran in beside its handle, else whoever the record says. */
function asker(q: QueueQuestion): string {
  if (q.run?.name) return q.run.name;
  if (q.run?.app) return `${q.run.app} ${q.run.id}`;
  return q.who;
}

/** Who did it: a run's app beside its handle, as a page says it, else the kind of actor the feed groups by. */
function doer(r: FeedRow): string {
  if (r.run_by) return `${spoken(r.run_by.client ?? r.run_by.agent)} ${r.run_by.run}`;
  return r.by === 'you' ? 'You' : r.by === 'rule' ? 'A rule' : (r.who ?? 'An agent');
}

/** What it did, as one phrase: how many, what kind, and to what. A folded remainder says how many more. */
function deed(r: FeedRow): string {
  if (r.kind === null) return `${r.count} more`;
  const thing = r.things?.length ? r.things.join(', ') : (r.thing ?? '');
  return [String(r.count), r.kind, thing].filter((w) => w !== '').join(' ');
}

const own = (item: Item): { fields: Record<string, Json> } => ({ fields: { ...(item as PageRow).fields } });

/** The computed sources a digest reads, by the name a section's `source:` says. Looked up only through `digestSource`. */
export const DIGEST_SOURCES: Readonly<Record<string, DigestSource>> = Object.freeze({
  'governance.open': Object.freeze({
    kind: 'queue',
    at: 'at',
    /* `asked` AND NOT THE QUESTION'S OWN KEY, which is a field an add-on declares and so no word the core spells. */
    columns: [{ field: 'asked', label: 'Asked' }, { field: 'who', label: 'By' }],
    line: (item: Item) => {
      const q = item as QueueQuestion;
      return { fields: { asked: q.question, who: asker(q), at: q.at } };
    },
  }),
  'handoffs.open': Object.freeze({ kind: 'cards', at: 'left_at', columns: [{ field: 'next', label: 'Step' }, { field: 'agent', label: 'Left by' }], line: own }),
  'sessions.working': Object.freeze({ kind: 'cards', at: 'last_seen', columns: [{ field: 'agent', label: 'Agent' }, { field: 'doing_said', label: 'Doing' }], line: own }),
  activity: Object.freeze({
    kind: 'agents',
    at: 'at',
    columns: [{ field: 'who', label: 'Who' }, { field: 'did', label: 'Did' }],
    line: (item: Item) => {
      const r = item as FeedRow;
      return { fields: { who: doer(r), did: deed(r), at: r.at } };
    },
  }),
} satisfies Record<string, DigestSource>);

/** The computed source called `name`, or `undefined` for a figure, a list or nothing. Never read by bracket. */
export function digestSource(name: string): DigestSource | undefined {
  return Object.hasOwn(DIGEST_SOURCES, name) ? DIGEST_SOURCES[name] : undefined;
}

/** How far back `within` reaches, in ms: a whole number of hours or days (`15h`, `2d`), else `null`. */
export function withinMs(within: string): number | null {
  const m = /^([1-9]\d{0,3})([hd])$/u.exec(within);
  if (!m) return null;
  return Number(m[1]) * (m[2] === 'h' ? 3_600_000 : 86_400_000);
}

/**
 * One section over a computed source, from the block's answer: a line an item, with the block's own refusals and how
 * many it matched, so a digest that draws five can say how many more there are.
 *
 * `within` KEEPS WHAT IS NEW, measured from `nowMs`: an evening digest says what agents did today and not last week.
 * Any other value than hours or days is a refusal on the section, never a section read without it.
 *
 * A LINE HOLDS ONLY WHAT IS DRAWN, its columns and its time. A run's row holds its token and its host, and the webhook
 * channel posts the sections whole.
 */
export function computedPart(section: DigestSection, answer: BlockResult, nowMs: number): DigestPart {
  const as = section.as ?? 'table';
  const source = digestSource(section.source);
  const columns = section.columns ?? source?.columns.map((c) => ({ ...c })) ?? [];
  const base: DigestPart = { heading: section.heading, source: section.source, as, rows: [], refusals: [], columns };
  if (!source) return { ...base, refusals: [{ code: 'SOURCE_UNKNOWN', fix: `${section.source} is not a source a digest reads.`, at: 'source' }] };

  const reach = section.within === undefined ? null : withinMs(section.within);
  if (section.within !== undefined && reach === null)
    return { ...base, refusals: [{ code: 'VALUE_MALFORMED', fix: `within: says hours or days, such as 15h or 2d, and not ${section.within}.`, at: 'within' }] };

  const refusals: Refusal[] = [...(answer.refusals ?? [])];
  if (refusals.length) return { ...base, refusals };

  const items: readonly Item[] = source.kind === 'queue' ? (answer.queue ?? []) : source.kind === 'agents' ? (answer.feed ?? []) : answer.rows;
  const keep = new Set([...columns.map((c) => c.field), source.at]);
  const lines: Entry[] = items.map((item, i) => {
    const said = source.line(item).fields;
    const fields = Object.fromEntries(Object.entries(said).filter(([k]) => keep.has(k)));
    const at = typeof said[source.at] === 'string' ? (said[source.at] as string) : '';
    return { id: `${section.source}:${i + 1}`, register: section.source, seq: null, fields, state: null, version: 1, created_at: at, updated_at: at, deleted_at: null };
  });

  const since = reach === null ? null : nowMs - reach;
  const kept = since === null ? lines : lines.filter((l) => Date.parse(l.created_at) >= since);
  /* A FEED'S `matched` COUNTS EVENTS AND ITS LINES ARE BURSTS, so its count is its lines; a queue's or a list's is the
     answer's, less the ones `within` took off. */
  const matched = source.kind === 'agents' ? kept.length : Math.max(kept.length, answer.matched - (lines.length - kept.length));
  return { ...base, rows: kept, matched };
}
