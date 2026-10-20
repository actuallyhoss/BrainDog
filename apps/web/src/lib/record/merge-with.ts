/**
 * "Merge with...", from a person's own page: pick the other person, and the record puts the question to Decide.
 *
 * IT ASKS AND MERGES NOTHING. The press is `sameOne`, the same door the list's bulk bar uses for two or more picked
 * people: the one question on Decide, with Merge all, Keep apart and Undo. Decide stays the only place a merge is made.
 *
 * PURE APART FROM THE TWO CALLS, so a test reads the choosing without a page.
 */

import { createClient } from '@braindog/client';

import { copy } from '../copy.ts';
import type { RecordRow } from './remote.ts';
import type { Fetch } from './row-live.ts';

/** One other person as the sheet lists them: the row's number, its name and the line under it. */
export type Other = { seq: number; name: string; note: string };

/** How many people the sheet reads: a page is the whole of People on all but the largest records. */
export const OTHERS_READ = 500;

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** The people the sheet offers: everybody but this one, never one folded into another, by name, the name typed first. */
export function othersOf(rows: readonly RecordRow[], title: string, seq: number, typed = '', mergedInto?: string): Other[] {
  const want = typed.trim().toLowerCase();
  return rows
    .filter((r) => typeof r.seq === 'number' && r.seq !== seq && !(mergedInto && text(r.fields?.[mergedInto]) !== ''))
    .map((r) => ({ seq: r.seq as number, name: text(r.fields?.[title]), note: text(r.fields?.email) }))
    .filter((o) => o.name !== '' && (want === '' || o.name.toLowerCase().includes(want) || o.note.toLowerCase().includes(want)))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The people of a list this caller may read, or `null` when it may not. */
export async function readOthers(base: string, register: string, io?: Fetch): Promise<RecordRow[] | null> {
  try {
    const got = await createClient({ base, ...(io ? { fetch: io } : {}) }).list({ register, limit: OTHERS_READ });
    return got.ok ? (got.value.rows as RecordRow[]) : null;
  } catch {
    return null;
  }
}

/** What a press answers: the question to open on Decide, or the record's own sentence for why not. */
export type Asked = { ok: true; question: string } | { ok: false; fix: string };

/** HIS PRESS: ask whether this person and the other are one. The question's id on success; the record's sentence otherwise. */
export async function askMerge(base: string, register: string, mine: number, other: number, io?: Fetch): Promise<Asked> {
  try {
    const out = await createClient({ base, ...(io ? { fetch: io } : {}) }).sameOne({ register, rows: [`${register}#${mine}`, `${register}#${other}`] });
    if (!out.ok) return { ok: false, fix: 'conflict' in out ? copy.writeNotReached : out.refusal.fix };
    return { ok: true, question: out.value.question };
  } catch {
    return { ok: false, fix: copy.writeNotReached };
  }
}
