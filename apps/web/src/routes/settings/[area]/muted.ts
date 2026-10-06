/**
 * Settings > Notifications, the rules that tell you: which rules write a notice a person can mute, and what their
 * `notify.muted` holds after one switch.
 *
 * A PERSON'S OWN, NOT THE RECORD'S. `notify.muted` is a pref (`PREF_KEYS` in `packages/record/src/index.ts`): the
 * rules, as the actor their notes are signed with (`rule:installment-due-soon`), whose notices leave this person's
 * feed on Today (`unmuted` in `packages/record`). Nobody else's notices move, and an urgent one still shows
 * (`kernel/src/digest.ts` `mutedFor`).
 *
 * PLAIN TYPESCRIPT, SO A TEST CAN LOAD IT IN NODE.
 */

/** The actor a rule's notes are signed with, from its bare id. */
export const actorOf = (rule: string): string => `rule:${rule.replace(/^rule[.:]/u, '')}`;

/**
 * Whether a rule's body tells somebody anything a mute would hold back: a `notify` step anywhere in it, at any depth of
 * branch, that is not urgent, or a `note` (on its own or a `schedule`'s), which the kernel writes as the same plain
 * notice (`rules.ts`). A rule whose every notice is urgent is never muted, so it is not offered a switch that would do
 * nothing.
 */
export function tellsQuietly(body: unknown): boolean {
  if (Array.isArray(body)) return body.some(tellsQuietly);
  if (body === null || typeof body !== 'object') return false;
  for (const [key, value] of Object.entries(body)) {
    if (key === 'note' && typeof value === 'string' && value.trim() !== '') return true;
    if (key === 'notify' && value !== null && typeof value === 'object' && !Array.isArray(value) && (value as { urgent?: unknown }).urgent !== true) return true;
    if (tellsQuietly(value)) return true;
  }
  return false;
}

/** The muted rules a pref holds, each once; anything else it might hold is left out. */
export const mutedOf = (held: unknown): string[] =>
  Array.isArray(held) ? [...new Set(held.filter((a): a is string => typeof a === 'string' && a.startsWith('rule:')))] : [];

/**
 * What `notify.muted` holds once one rule is switched: muted ones are kept newest last, and a list left empty is taken
 * away (`null`) rather than kept as nothing.
 */
export function mutedAfter(muted: readonly string[], actor: string, tells: boolean): string[] | null {
  const next = tells ? muted.filter((a) => a !== actor) : [...muted.filter((a) => a !== actor), actor];
  return next.length === 0 ? null : next;
}
