/**
 * The steps Slash takes, as the thread draws them: each with a glyph for what it reads, and one said again is one line with
 * a count (Sam, 4 Nov): "Reading Agent runs (2)", where five of the same line stacked up.
 */

import type { IconName } from '../ui/icons.ts';

export type StepLine = { text: string; times: number; icon: IconName; last: boolean };

/* WHAT THE STEP IS ABOUT PICKS THE GLYPH, the same one that place has in the sidebar. The first that matches wins. */
const ABOUT: readonly (readonly [RegExp, IconName])[] = [
  [/\btoday\b/iu, 'today'],
  [/agent|\bruns?\b|session/iu, 'session'],
  [/\btasks?\b|\bwork\b/iu, 'task'],
  [/project/iu, 'projects'],
  [/money|ledger|bill|invoice|budget|account|cash|transaction|spend|payment/iu, 'money'],
  [/people|person|contact|organisation/iu, 'people'],
  [/decision|question|needs you/iu, 'decide'],
  [/mail|inbox/iu, 'mail'],
  [/calendar|meeting|event/iu, 'calendar'],
  [/\bkeys?\b|keychain|credential/iu, 'key'],
  [/learning/iu, 'learning'],
  [/skill/iu, 'skill'],
  [/plugin/iu, 'plug'],
  [/activity|history|changed/iu, 'history'],
  [/service|domain|renewal/iu, 'service'],
  [/search|find|look(?:ing)? for/iu, 'search'],
];

/* AND WITH NOTHING TO GO ON, WHAT IT IS DOING. */
const DOING: readonly (readonly [RegExp, IconName])[] = [
  [/^reading/iu, 'rows'],
  [/^looking/iu, 'eye'],
  [/^(?:adding|writing|changing|filing|proposing|drafting|setting)/iu, 'edit'],
];

export function stepIcon(text: string): IconName {
  for (const [said, icon] of ABOUT) if (said.test(text)) return icon;
  for (const [said, icon] of DOING) if (said.test(text)) return icon;
  return 'slash';
}

/** The steps in the order first said, each said once with how many times. `last` is the one Slash is on now. */
export function stepLines(steps: readonly string[]): StepLine[] {
  const key = (s: string): string => s.trim().replace(/(?:\.{3}|\u2026)$/u, '');
  const lines = new Map<string, StepLine>();
  for (const step of steps) {
    const text = key(step);
    const held = lines.get(text);
    if (held) held.times += 1;
    else lines.set(text, { text, times: 1, icon: stepIcon(text), last: false });
  }
  const newest = steps.at(-1);
  if (newest !== undefined) lines.get(key(newest))!.last = true;
  return [...lines.values()];
}
