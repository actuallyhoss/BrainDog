/**
 * The kinds of push, as the phone says them and Settings > Notifications switches them: the kernel's `PUSH_KINDS`.
 *
 * A PUSH CARRIES WHERE IT OPENS AND ITS KIND, NEVER A WORD OF WHAT (`09 §3`): the line on the lock screen is one of these
 * fixed sentences, chosen by the kind, so "An agent needs your answer" and never the question. A push from a record
 * older than the kinds names none, and says the one line every push said before.
 *
 * PLAIN NODE CAN LOAD THIS FILE, because the service worker imports it and `push.test.ts` runs the worker.
 */

/** The kernel's `PUSH_KINDS`, in the order Settings draws them. */
export const PUSH_KINDS = ['needs', 'people', 'agents', 'money', 'summary'] as const;
export type PushKind = (typeof PUSH_KINDS)[number];

/** A kind as it came, or `null`. */
export const kindIn = (v: unknown): PushKind | null => ((PUSH_KINDS as readonly unknown[]).includes(v) ? (v as PushKind) : null);

/** The person's `push.off` as kinds, dropping anything that is not one. */
export const kindsOff = (v: unknown): PushKind[] => (Array.isArray(v) ? v.map(kindIn).filter((k): k is PushKind => k !== null) : []);

/** The line a push says, from its kind and where it opens. */
export function pushLine(kind: PushKind | null, path: string | null): string {
  const at = path ?? '';
  if (kind === 'summary' || at.includes('/agents/summary/')) return 'Your BrainDog summary is ready';
  if (kind === 'agents') return at.includes('/decide') ? 'An agent needs your answer' : 'An agent finished what you gave it';
  if (kind === 'money') return 'Something in your money is coming due';
  /* A COLLEAGUE'S DOING (collab pass 2): handed you a row (opens its question), named you on a row (opens the row), or
     joined from your invitation (opens People). Told apart by where it opens, never by anything it says. */
  if (kind === 'people') {
    if (at.startsWith('/decide/')) return 'Someone handed you something';
    if (/^\/r\/[^/]+\/[^/]+$/u.test(at)) return 'Someone mentioned you in a comment';
    return 'Someone you invited joined';
  }
  return 'Something in your BrainDog needs you';
}

/** Settings > Notifications' words for the switches. */
export const KINDS = {
  title: 'What rings your phone',
  how: 'Each is for every phone you turned notifications on. Quiet hours still hold them all.',
  rows: [
    { kind: 'needs', icon: 'decide', title: 'Needs you', line: 'A question waiting on you, or something urgent' },
    { kind: 'people', icon: 'people', title: 'People', line: 'Someone hands you something, mentions you, or joins from your invitation' },
    { kind: 'agents', icon: 'message-circle', title: 'Agents', line: 'An agent asks you something, or finishes what you gave it' },
    { kind: 'money', icon: 'receipt-text', title: 'Bills due', line: 'A bill or an instalment coming due' },
    { kind: 'summary', icon: 'sun', title: 'Summaries', line: 'The morning and evening summary' },
  ] as const satisfies readonly { kind: PushKind; icon: string; title: string; line: string }[],
} as const;
