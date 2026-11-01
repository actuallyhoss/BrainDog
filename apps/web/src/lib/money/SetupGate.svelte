<!--
  Money's home, or its first-open setup in the board's place (`setup.ts` says when).

  ONCE OPEN, IT STAYS UNTIL IT IS CLOSED. The setup writes the account and the currency as its last press, and the
  record answering with an account must not take the screen away while it says what still needs the person, so the gate
  holds the setup from the moment it is first due until the setup's own `close` lets it go.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  import { setupDue, type SetupFacts } from './setup.ts';

  let {
    facts,
    keep = false,
    setup,
    children,
  }: {
    /** What the screen knows; `null` where it is not a page this gate can be about. */
    facts: SetupFacts | null;
    /** The page holds what was told before there is an account (AM3): it stays drawn, under the setup. */
    keep?: boolean;
    /** The setup, handed the press that lets it go. */
    setup: Snippet<[() => void]>;
    /** The page as it is. */
    children: Snippet;
  } = $props();

  let closed = $state(false);
  /* A PLAIN FLAG AND NOT STATE: it only ever turns on, and it is turned on by the read that draws it. */
  let held = false;
  const showing = $derived.by(() => {
    if (closed) return false;
    if (facts !== null && setupDue(facts)) held = true;
    return held;
  });
</script>

{#if showing}
  <!-- THE SETUP FIRST, WHAT WAS TOLD UNDER IT (coordinator's live check, 1 Nov): "Set up Money" came a second or two
       late under the bills already drawn, so the first look was a page that then moved. It is the page's first thing. -->
  {@render setup(() => (closed = true))}
  {#if keep}<div class="kept">{@render children()}</div>{/if}
{:else}
  {@render children()}
{/if}

<style>
  /* THE PAGE KEPT UNDER THE SETUP STARTS WHERE ITS FIRST TILE DOES: no room above it between the setup and what was told. */
  .kept :global(.page) {
    padding-block-start: 0;
  }
</style>
