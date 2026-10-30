/**
 * The words and the one pure rule of `MyTokens.svelte`, a member's own agent keys (`docs/20-COLLABORATION.md`
 * §2, tier 0).
 *
 * THE WORDS LIVE WITH THE ONE SCREEN THAT DRAWS THEM, as `levels.ts` keeps its own (`lib/copy.ts`, "a `words` object in
 * a module it owns"), and a word two screens share is read from `copy` instead. A person reads "key", never "token".
 *
 * PLAIN `.ts`, so a test loads it in Node without Svelte.
 */

/** What a key's scope lets an agent do, in the member's words. The record caps each by their own levels. */
export const SCOPE_WORDS = {
  read: 'Read',
  propose: 'Suggest',
  write: 'Add and change',
} as const;

export type OwnScope = keyof typeof SCOPE_WORDS;

/** The three, in the order the choice draws them, `write` last as the widest. */
export const OWN_SCOPES: readonly OwnScope[] = ['read', 'propose', 'write'];

export const words = {
  title: 'Your own agent',
  why: 'A key lets an agent you run use your BrainDog as you, and never more than you can. When your access changes, the key changes with it.',
  nameLabel: 'Name it after the agent',
  nameHelp: 'Claude on my laptop, for example. Only you and the owner see it.',
  scopeLabel: 'What it may do',
  make: 'Make a key',
  mine: 'Your keys',
  none: 'No keys yet',
  noneWhy: 'Make one above and give it to your agent. It works until it ends or you revoke it.',
  unnamed: 'A key with no name',
  madeBy: (who: string) => `made by ${who}`,
  agentStep: 'Paste this into Claude Code, or give your agent the key and the header below it.',
  copyAgentLine: 'Copy the line',
} as const;

/** Only the keys still standing are listed: a revoked one can do nothing, and the owner's history keeps it. */
export const standingOnly = <T extends { revoked_at: string | null }>(rows: readonly T[]): T[] =>
  rows.filter((t) => t.revoked_at === null);
