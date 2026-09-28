/**
 * The one correct place a point is written, as `apps/worker/src/telemetry.ts` writes it, so the seeded file beside it
 * is the second call and this one is what a right point looks like: it passes checks 2 and 3 on its own.
 */

export type Blobs = [kind: string, surface: string, tool: string, outcome: string, record: string];

export type Doubles = [ms: number];

export function point(dataset: AnalyticsEngineDataset, kind: string, surface: string, tool: string, outcome: string, hash: string, ms: number): void {
  const blobs: Blobs = [kind, surface, tool, outcome, hash];
  const doubles: Doubles = [ms];
  dataset.writeDataPoint({ blobs, doubles });
}
