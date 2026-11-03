/**
 * A summary as a person reads it: the record's digests, the two a day at 08:00 and 17:00 above all, drawn as what
 * they would say now (`digestToday`, the same assembly the scheduled one sends), so the phone's tap has a screen to
 * open and Settings can say which summaries this record sends.
 *
 * PURE, SO `node --test` CAN IMPORT IT. `routes/agents/summary` and Settings > Notifications read `digestToday`; this
 * holds the answer to its shape and words each line from the section's own columns, in the order the digest declared
 * them. A section the record refused, or one with nothing in it, is left out, as the digest itself leaves it out.
 */

export const summaryWords = {
  heading: 'Summary',
  parent: 'Agents',
  all: 'Summaries',
  nothing: 'Nothing to send now.',
  none: 'No summaries yet.',
  offer: 'Two a day, at 08:00 and 17:00, from Agent notes.',
  getIt: 'Get Agent notes',
  /* WHAT THE STORE IS SEARCHED FOR, the add-on's name as a person would type it, so the button lands on whichever
     add-on goes by it today and the web holds no add-on's id. */
  findIt: 'agent notes',
  open: 'Open',
  decide: 'Open Decide',
  upNext: 'Open Agents',
  sentAt: 'Held through quiet hours.',
  more: (n: number) => `and ${n} more`,
} as const;

/** Where the offer goes: the store, searched for the add-on that sends the summaries. */
export const offerHref = `/plugins?q=${encodeURIComponent(summaryWords.findIt)}`;

export type SummaryLine = { key: string; text: string; detail: string | null; at: string | null };
export type SummarySection = { heading: string; source: string; lines: SummaryLine[]; more: number; href: string | null };
export type Summary = { id: string; name: string; headline: string; sections: SummarySection[] };

type Raw = Record<string, unknown>;

const isObj = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : typeof v === 'number' ? String(v) : null);

/** Where a section's door goes: the questions to Decide, the steps and runs to Agents, and nothing for the rest. */
const doorOf = (source: string): string | null =>
  source.startsWith('governance.') ? '/decide' : source === 'handoffs.open' || source === 'sessions.working' ? '/p/agents' : null;

/** One section's lines: the first column is the line, the rest its detail, each as the record said it. */
function sectionOf(raw: unknown): SummarySection | null {
  if (!isObj(raw) || typeof raw.heading !== 'string' || typeof raw.source !== 'string') return null;
  if (Array.isArray(raw.refusals) && raw.refusals.length > 0) return null;
  const rows = Array.isArray(raw.rows) ? raw.rows.filter(isObj) : [];
  const columns = (Array.isArray(raw.columns) ? raw.columns.filter(isObj) : []).flatMap((c) => (typeof c.field === 'string' ? [c.field] : []));
  const lines: SummaryLine[] = rows.flatMap((r, i) => {
    const fields = isObj(r.fields) ? r.fields : {};
    const keys = columns.length > 0 ? columns : Object.keys(fields);
    const said = keys.map((k) => str(fields[k])).filter((s): s is string => s !== null);
    if (said.length === 0) return [];
    return [{ key: typeof r.id === 'string' ? r.id : `${raw.source}:${i}`, text: said[0]!, detail: said.length > 1 ? said.slice(1).join(' · ') : null, at: str(r.created_at) }];
  });
  if (lines.length === 0) return null;
  const matched = typeof raw.matched === 'number' && Number.isInteger(raw.matched) ? raw.matched : lines.length;
  return { heading: raw.heading, source: raw.source, lines, more: Math.max(0, matched - lines.length), href: doorOf(raw.source) };
}

/** `digestToday`'s answer as summaries, each with the sections that carry something; anything else is none. */
export function summariesOf(answer: unknown): Summary[] {
  const list = isObj(answer) && answer.ok === true ? answer.value : Array.isArray(answer) ? answer : null;
  if (!Array.isArray(list)) return [];
  return list.flatMap((d) => {
    if (!isObj(d) || typeof d.digest !== 'string') return [];
    const name = str(d.name) ?? d.digest;
    const sections = (Array.isArray(d.sections) ? d.sections : []).map(sectionOf).filter((s): s is SummarySection => s !== null);
    return [{ id: d.digest, name, headline: str(d.headline) ?? name, sections }];
  });
}

/** The address of one summary's screen, which a push for it opens. */
export const summaryHref = (id: string): string => `/agents/summary/${id}`;
