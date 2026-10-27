/**
 * A `kpis` block's key numbers as `Kpis.svelte` takes them (`packages/render/svelte/Kpis.svelte`), from what the record
 * answered (the kernel's `sources/kpis.ts`): each with its project's colour slot, the line of why it is on Today only
 * where that line says something, and where its row opens.
 *
 * THE RECORD'S ANSWER IS READ LOOSELY, as every answer is: a number with no name or no points is left out, and a key this
 * file does not read is dropped, so the drawer is handed only what its type says.
 *
 * WHY IT IS ON TODAY IS SAID ONLY FOR A PIN OR A NUMBER OFF TARGET. "Money first" and "Up 34%" under a figure that already
 * says its change read as noise (K1-C), and a stale number says itself in the warn
 * colour under its figure, so the ranking's other reasons order the rows and are not printed.
 *
 * PURE, AND NO SVELTE, so `node --test` reads it.
 */

import type { KpiInput, KpiPoint } from 'braindog-render/svelte';

import { slotOf } from '../ui/face.ts';
import { rowHref, spokenOf } from '../record/row-href.ts';

/** One key number as the record answered it, as far as this file reads it: who keeps it too, for a stale one's fix. */
export type KpiAnswered = KpiInput & { spoken?: string; owner?: string };

/** The reasons a Today row says in words; the others only order the rows. */
const SAID: ReadonlySet<string> = new Set(['pinned', 'off-target']);

const KINDS: readonly string[] = ['level', 'flow', 'share', 'progress', 'count'];
const SOURCES: readonly string[] = ['numbers', 'figure', 'feed', 'agent', 'typed'];
const EVERIES: readonly string[] = ['1h', '1d', '1w', '1m'];

const text = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v : undefined);
const oneOf = <T extends string>(v: unknown, of: readonly string[]): T | undefined => (typeof v === 'string' && of.includes(v) ? (v as T) : undefined);

function pointOf(v: unknown): KpiPoint | null {
  if (v === null || typeof v !== 'object') return null;
  const p = v as Record<string, unknown>;
  if (typeof p.at !== 'string') return null;
  if (typeof p.amount === 'string') return { at: p.at, amount: p.amount };
  if (typeof p.value === 'number' && Number.isFinite(p.value)) return { at: p.at, value: p.value };
  return null;
}

/** One answer as the drawer takes it, or `null` for one it cannot draw. */
export function kpiInputOf(v: unknown): KpiAnswered | null {
  if (v === null || typeof v !== 'object') return null;
  const a = v as Record<string, unknown>;
  const name = text(a.name);
  if (!name || !Array.isArray(a.points)) return null;
  const points = a.points.map(pointOf).filter((p): p is KpiPoint => p !== null);
  const hue = typeof a.hue === 'number' && Number.isFinite(a.hue) ? a.hue : null;
  const kind = oneOf<NonNullable<KpiInput['kind']>>(a.kind, KINDS);
  const source = oneOf<NonNullable<KpiInput['source']>>(a.source, SOURCES);
  const every = oneOf<NonNullable<KpiInput['every']>>(a.every, EVERIES);
  const good = oneOf<'up' | 'down'>(a.good, ['up', 'down']);
  const verdict = oneOf<'met' | 'off'>(a.verdict, ['met', 'off']);
  const why = typeof a.rank === 'string' && SAID.has(a.rank) ? text(a.why) : undefined;
  const target = typeof a.target === 'number' || typeof a.target === 'string' ? a.target : undefined;
  return {
    name,
    points,
    slot: slotOf(hue),
    ...(text(a.kpi) ? { kpi: text(a.kpi)! } : {}),
    ...(text(a.project) ? { project: text(a.project)! } : {}),
    ...(text(a.spoken) ? { spoken: text(a.spoken)! } : {}),
    ...(text(a.owner) ? { owner: text(a.owner)!.trim() } : {}),
    ...(text(a.measures) ? { measures: text(a.measures)! } : {}),
    ...(text(a.unit) ? { unit: text(a.unit)! } : {}),
    ...(kind ? { kind } : {}),
    ...(source ? { source } : {}),
    ...(every ? { every } : {}),
    ...(good ? { good } : {}),
    ...(verdict ? { verdict } : {}),
    ...(target !== undefined ? { target } : {}),
    ...(text(a.target_by) ? { target_by: text(a.target_by)! } : {}),
    ...(a.headline === true ? { headline: true } : {}),
    ...(why ? { why } : {}),
  };
}

/** A block's key numbers, in the order the record answered them. Any block that is not one answers none. */
export function kpisIn(block: { kpis?: unknown }): KpiAnswered[] {
  return Array.isArray(block.kpis) ? block.kpis.map(kpiInputOf).filter((k): k is KpiAnswered => k !== null) : [];
}

/**
 * Where a key number opens: its project's own page where the list made one, else the project's row, as a project card
 * opens (`project-cards.ts`). Record-relative,
 * as every address the record writes; `null` for a number whose project the record did not say.
 */
export function kpiHref(k: Pick<KpiAnswered, 'spoken'>, open: (spoken: string) => string | null = rowHref): string | null {
  const row = k.spoken ? spokenOf(k.spoken) : null;
  if (!row) return null;
  return open(k.spoken!) ?? `/r/${row.register}/${row.seq}`;
}
