/**
 * The words a read says before it is a screen: `ReadState.svelte`'s, one sentence per state (ARC-5).
 *
 * A NEW AREA FILE OF THE COPY AGGREGATE (ARC-8). `lib/copy.ts` spreads it into `copy`, and `ReadState` reads every key
 * here as a literal `copy.<key>`, so `dead-copy` sees each one rendered. Plain Node loads this file through the
 * aggregate (`passkey.mjs`), so it imports nothing.
 *
 * WAITING HAS NO SENTENCE HERE. A read that is still out draws `Waiting`, which holds the final geometry in bars and
 * says only its hidden status word (`copy.waiting`), because loading on this product has no visible words
 * (design-brief §8).
 */

/* ── ARC-5: one way to read ─────────────────────────────────────────────── */

export const read = {
  /** A read that answered with nothing, on a screen with no truer sentence of its own. */
  readEmpty: 'Nothing here yet',
  /** A refusal that came without the record's own sentence; the record's is drawn whenever it gave one. */
  readRefused: 'BrainDog could not open this',
  /** DSN-12's sentence, word for word and with its full stop, because it is a sentence and not a title. */
  readOffline: 'BrainDog could not reach this record.',
  /** The one action an offline read offers. */
  readRetry: 'Retry',
  /** The fold that holds the technical reason, so it is there for whoever asks and never the content. */
  readDetails: 'Details',
} as const;
