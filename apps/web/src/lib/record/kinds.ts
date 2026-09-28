/**
 * The block kinds the record's packs declare, as the renderer reads them.
 *
 * THE RECORD CHECKED EVERY ONE AT INSTALL (`packages/kernel/src/declare.ts` `blockBody`), so this holds no second copy
 * of that rule: it takes the `blocks` the `schema` answer carries and keeps the entries shaped like a spec, keyed
 * `block.<id>`, for `RenderOptions.kinds` and `ParseOptions.kinds`. An entry that is not shaped like one is left out
 * rather than guessed at, so it draws as a kind nobody installed, which says so, instead of as a figure with the wrong
 * columns.
 *
 * NOT THE BUILT-IN DRAWER REGISTRY (`$lib/page/kinds/index.ts`), and neither imports the other: that one is the kinds
 * this build compiled in, and this is the ones a record installed after it shipped.
 */

import { PRIMITIVES, isPackKind, type KindSpec } from 'braindog-render';

/** A pack's kind as the `schema` answer carries it: the spec, and the two words the add-block picker lists it by. */
export type InstalledKind = KindSpec & { title: string; purpose: KindSpec['purpose'] };

const PURPOSES: readonly string[] = ['say', 'figure', 'list', 'plan', 'media'];

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

/** One entry of the answer as a spec, or `null` when it is not shaped like one. */
function specOf(raw: unknown): InstalledKind | null {
  if (raw === null || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.primitive !== 'string' || !(PRIMITIVES as readonly string[]).includes(r.primitive)) return null;
  if (!isCount(r.cells) || !isCount(r.minSpan) || typeof r.title !== 'string') return null;
  if (typeof r.purpose !== 'string' || !PURPOSES.includes(r.purpose)) return null;
  return {
    primitive: r.primitive as KindSpec['primitive'],
    cells: r.cells,
    tone: r.tone === true,
    minSpan: r.minSpan,
    purpose: r.purpose as KindSpec['purpose'],
    title: r.title,
    ...(isCount(r.optional) ? { optional: r.optional } : {}),
    ...(isCount(r.rows) ? { rows: r.rows } : {}),
    ...(r.header === true ? { header: true } : {}),
    ...(r.ordered === true ? { ordered: true } : {}),
  };
}

/**
 * The installed kinds from a `schema` answer, keyed `block.<id>`. An answer with no `blocks` is a record with none, or
 * one older than the answer, and both draw every first-party kind as before.
 */
export function installedKinds(schema: { blocks?: unknown } | null | undefined): Record<string, InstalledKind> {
  const out: Record<string, InstalledKind> = {};
  const blocks = schema?.blocks;
  if (blocks === null || typeof blocks !== 'object') return out;
  for (const [kind, raw] of Object.entries(blocks as Record<string, unknown>)) {
    if (!isPackKind(kind)) continue;
    const spec = specOf(raw);
    if (spec) out[kind] = spec;
  }
  return out;
}

/** The installed kinds under one of the add-block picker's groups, by title, for the picker to list beside its own. */
export function installedUnder(kinds: Readonly<Record<string, InstalledKind>>, purpose: KindSpec['purpose']): { kind: string; title: string }[] {
  return Object.entries(kinds)
    .filter(([, spec]) => spec.purpose === purpose)
    .map(([kind, spec]) => ({ kind, title: spec.title }))
    .sort((a, b) => a.title.localeCompare(b.title));
}
