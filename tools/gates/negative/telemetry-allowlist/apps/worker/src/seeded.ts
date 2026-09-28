/**
 * A second place that writes a point, and the point carries the name of a register a customer invented, which `08 §5`
 * lists among the things never written (`52 §9`'s seeded negative for `telemetry-allowlist`).
 *
 * TWO FINDINGS NAME THIS FILE, AND THREE IN ALL. Check 1 names both calls, this one and the correct one beside it, and
 * check 3 names this one for `register`. The tuple is declared and labelled the way the table wants, so check 2 has
 * nothing to say: what is proved is that the gate reads what goes into a well-formed tuple, not only its labels.
 */

type Blobs = [kind: string, surface: string, tool: string, outcome: string, record: string];

export function seeded(dataset: AnalyticsEngineDataset, register: string): void {
  const blobs: Blobs = ['api.call', 'web', '', 'ok', register];
  dataset.writeDataPoint({ blobs });
}
