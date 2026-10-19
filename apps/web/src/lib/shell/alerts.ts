/**
 * Which new things earn a Mac notification: a question that lands in Needs you, or an agent handing a run off.
 * Pure on purpose; the layout feeds it what `boot` said and the shell door does the ringing.
 */

export type Alert = { id: string; title: string; body: string; goto: string };

/** The first hearing only seeds what is already there, so opening the app never rings for old questions. */
export function sift(seen: ReadonlySet<string> | null, items: readonly Alert[]): { seen: Set<string>; fresh: Alert[] } {
  const next = new Set(seen ?? []);
  const fresh: Alert[] = [];
  for (const a of items) {
    if (next.has(a.id)) continue;
    next.add(a.id);
    if (seen !== null) fresh.push(a);
  }
  return { seen: next, fresh };
}

/** A waiting question as boot lists it (`waiting`), sent to Needs you. */
export const questionAlert = (w: { id: string; question?: string | undefined }): Alert => ({
  id: `q:${w.id}`,
  title: 'Needs you',
  body: w.question || 'A question is waiting',
  goto: '/app/decide',
});

/** A handoff line from the record's recent events, sent to Agents. Anything else is not one. */
export function handoffAlert(e: { id: string; kind: string; actor?: string; title?: string | null; note?: string | null }): Alert | null {
  if (e.kind !== 'handoff') return null;
  return {
    id: `h:${e.id}`,
    title: 'Handed off',
    body: e.note || e.title || `${e.actor ?? 'An agent'} handed off a run`,
    goto: '/app/p/agents',
  };
}

export type Ring = { on: () => boolean; focused: () => boolean; send: (title: string, body: string, goto: string) => void };

/** Ring once per new item, and not at all while the window is in front or the switch is off. Returns the seen set to keep. */
export function ring(seen: ReadonlySet<string> | null, items: readonly Alert[], door: Ring): Set<string> {
  const out = sift(seen, items);
  if (door.on() && !door.focused()) for (const a of out.fresh) door.send(a.title, a.body, a.goto);
  return out.seen;
}
