/**
 * The kinds of agent a run face tells apart, and the glyph each falls back to, apart from the rest of a face (`face.ts`).
 *
 * A FILE OF ITS OWN, because the rail draws an agent's mark on every screen while it works (`AgentMark.svelte`), and
 * `face.ts` carries the names of every rule a template ships to tell a rule's face from a person's.
 */

import type { IconName } from './icons.ts';

/** The kinds of agent a run face tells apart: each named one by its maker's mark (`@braindog/skin/agent-marks.ts`), the rest by a glyph. */
export type AgentKind = 'claude' | 'codex' | 'cursor' | 'gemini' | 'copilot' | 'windsurf' | 'slash' | 'runner' | 'other';

/**
 * The glyph each kind of agent falls back to, from the app's own set, where there is no mark to draw.
 *
 * A NAMED AGENT WEARS ITS MAKER'S MARK NOW, not this. An earlier rule said "a glyph and never a vendor logo"; the
 * owner overruled it and asked for the real logos, so `AgentMark`
 * draws Claude, Codex, Cursor, Gemini, Copilot and Windsurf as their makers do, and these glyphs are what a runner and
 * an agent nobody names wear, and what a surface too small for a mark falls back to. Slash is not here, because it
 * wears its own mark, the slash `Face` draws.
 */
export const AGENT_GLYPHS = {
  claude: 'bot',
  codex: 'code',
  cursor: 'keyboard',
  gemini: 'bot',
  copilot: 'code',
  windsurf: 'code',
  runner: 'play',
  other: 'session',
} as const satisfies Record<Exclude<AgentKind, 'slash'>, IconName>;
