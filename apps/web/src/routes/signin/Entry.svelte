<!--
  The one layout every entry screen stands in: sign in, sign up, start and an invitation (DSN-18).

  THERE WERE FOUR, AND THEY DISAGREED. Sign in centred its logo and floated its slogan in the middle of
  a phone, which left a 170px hole between the slogan and the ways in; /start put its logo at the left;
  sign up and the invitation centred a column in the middle of the screen. A person moves between these
  screens in one sitting (an invitation leads to sign in, sign in to /start), so the brand jumped about
  under them at every step (design §2.13, §4).

  ONE ANSWER NOW: the mark and the name at the top left, on the page's gutter, as the rail puts them
  once the person is in; then the screen's own column under it, starting at the top rather than the
  middle, so on a 390 by 664 phone the title and the first way in are on screen together and nothing
  hangs in empty space. From 900px up the column is centred on the page, still starting near the top,
  so a wide screen does not read as a phone stretched sideways.

  A SCREEN KEEPS ITS OWN COLUMN. What goes inside (the title at `--t-3xl`, the form under it) is each
  screen's markup and style; this file owns only the frame, and `wide` gives /start the room its
  previews need.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { copy } from '$lib/copy.ts';
  import Mark from '$lib/ui/Mark.svelte';

  let { wide = false, children }: { wide?: boolean; children: Snippet } = $props();
</script>

<div class="entry" class:wide>
  <header class="entry-brand">
    <Mark height={32} />
    <span class="entry-word">{copy.product}</span>
  </header>
  <div class="entry-col">{@render children()}</div>
</div>

<style>
  /* THE FRAME STARTS AT THE TOP. The top inset is paid here once, because the app is `viewport-fit=cover` and an entry
     screen has no sticky bar to pay it; the bottom one pads the last control clear of a phone's home indicator. */
  .entry {
    display: grid;
    align-content: start;
    row-gap: var(--sp-7);
    min-block-size: 100dvh;
    padding-block: calc(var(--sp-5) + env(safe-area-inset-top)) calc(var(--sp-7) + env(safe-area-inset-bottom));
    padding-inline: var(--gutter);
  }

  .entry-brand {
    display: flex;
    align-items: center;
    justify-self: start;
    gap: var(--sp-3);
  }

  .entry-word {
    color: var(--ink);
    font-family: var(--font-display);
    font-size: var(--t-lg);
    font-weight: 600;
    letter-spacing: -0.026em;
  }

  /* `min(…, 100%)` so the column never outgrows a phone, and `min-inline-size: 0` so a long word inside it wraps rather
     than widening the track past the screen. */
  .entry-col {
    justify-self: center;
    inline-size: min(400px, 100%);
    min-inline-size: 0;
  }

  .entry.wide .entry-col {
    inline-size: min(640px, 100%);
  }

  /* ON A WIDE SCREEN THE COLUMN SITS A LITTLE LOWER than the brand's row, where the eye lands, and never in the middle. */
  @media (width >= 900px) {
    .entry-col {
      margin-block-start: var(--sp-7);
    }
  }
</style>
