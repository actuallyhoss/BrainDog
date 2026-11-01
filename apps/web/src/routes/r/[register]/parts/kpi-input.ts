/**
 * A key number's row and its readings as the drawer takes them (`Kpis.svelte`'s `KpiInput`), for the list of key numbers
 * (`ListKpis`, L11) and a key number's own page (`KpiLead`, L25). PURE: the readings are handed in.
 */
import { exponentOf } from 'braindog-render';
import type { KpiInput } from 'braindog-render/svelte';
import { pastOf } from '../../../../lib/kpis/past.ts';
import { isMoney, type Entry, type Fields } from '../../../../lib/record/schema.ts';

/** Money as the record stores it, "USD 8,420.00", the one shape the drawer reads an amount in. */
export function storedOf(m: { amount: number; currency: string }): string {
  const e = exponentOf(m.currency);
  const said = Math.abs(m.amount / 10 ** e).toLocaleString('en-US', { minimumFractionDigits: e, maximumFractionDigits: e });
  return `${m.currency} ${m.amount < 0 ? '−' : ''}${said}`;
}

const text = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined);
const KINDS = ['level', 'flow', 'share', 'progress', 'count'];

/**
 * ONE KEY NUMBER: its settings from its row, and its readings among `readings` (the readings list, refs as the record's
 * ids) of its measure on its project, oldest first. `project` is the project's row id and name; `slot` its colour.
 */
export function kpiInputOf(
  key: string,
  f: Fields,
  readings: readonly Entry[] | null,
  project: { id: string; name: string; slot?: string | undefined } | null,
): KpiInput {
  const name = text(f.name) ?? '';
  const past = readings && project && project.id !== '' ? pastOf(readings, { name, measure: text(f.measure) ?? null }, project, 'thing') : [];
  const points = [...past].reverse().map((p) => (p.money ? { at: p.at, amount: storedOf(p.money) } : { at: p.at, value: p.value }));
  return {
    kpi: key,
    name,
    ...(project && project.name ? { project: project.name, ...(project.slot ? { slot: project.slot } : {}) } : {}),
    ...(text(f.measures) ? { measures: text(f.measures)! } : {}),
    ...(text(f.unit) ? { unit: text(f.unit)! } : {}),
    ...(f.good === 'up' || f.good === 'down' ? { good: f.good } : {}),
    ...(typeof f.target === 'number' || typeof f.target === 'string' ? { target: f.target } : isMoney(f.target_amount) ? { target: storedOf(f.target_amount) } : {}),
    ...(text(f.target_by) ? { target_by: text(f.target_by)! } : {}),
    ...(f.every === '1h' || f.every === '1d' || f.every === '1w' || f.every === '1m' ? { every: f.every } : {}),
    ...(typeof f.kind === 'string' && KINDS.includes(f.kind) ? { kind: f.kind as KpiInput['kind'] } : {}),
    points,
  };
}
