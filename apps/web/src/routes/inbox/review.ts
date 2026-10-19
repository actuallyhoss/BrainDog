/**
 * To review: the doubtful arrivals BrainDog suggested a filing for and did not make (DIRECTION §45). Each is a
 * suggestion whose body says `review`, which Needs you leaves out; the inbox lists them with one line each.
 *
 * Route-only, like `shapes.ts`. The fetch is the client's, so a test drives the reading with a plain value.
 */

import { createClient } from '@braindog/client';

/** One arrival waiting for a look: the question it is, the list it would be filed in, and the arrivals it holds. */
export type Review = { id: string; line: string; register: string; raws: readonly string[] };

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** A governance row read as a review line, or `null` when it is not one the inbox can draw. */
export function reviewOf(row: unknown): Review | null {
  if (typeof row !== 'object' || row === null) return null;
  const r = row as Record<string, unknown>;
  const body = (typeof r.body === 'string' ? (() => { try { return JSON.parse(r.body) as unknown; } catch { return null; } })() : r.body) as Record<string, unknown> | null;
  const id = text(r.id);
  const register = text(body?.register);
  if (id === '' || register === '' || body?.review !== true) return null;
  const raws = Array.isArray(body.raws) ? body.raws.filter((x): x is string => typeof x === 'string') : [];
  const line = text(r.question) || text(body.context) || id;
  return { id, line, register, raws };
}

/** Every open one, as the record answers `governance` with `review: 'only'`; an unreachable or refused read is none. */
export async function readToReview(base: string): Promise<Review[]> {
  const out = await createClient({ base }).governance({ register: 'suggestion', status: 'open', review: 'only', limit: 100 });
  if (!out.ok || !Array.isArray(out.value)) return [];
  return out.value.flatMap((row) => {
    const one = reviewOf(row);
    return one === null ? [] : [one];
  });
}

/** The arrivals To review holds, so the plain list below does not draw them twice. */
export const heldRaws = (reviews: readonly Review[]): ReadonlySet<string> => new Set(reviews.flatMap((r) => r.raws));
