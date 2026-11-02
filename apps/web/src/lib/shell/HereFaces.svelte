<!--
  WHO ELSE IS ON THIS PAGE (collab pass 2, 2 Nov): up to three small faces before the bell, and "+2" past them, with every
  name said on hover and to a screen reader ("Mira Chen and Sam Okafor are here too").

  HEARD ON THE POLL EVERY OPEN TAB ALREADY SENDS (`live.here`, `version` with `at`): no socket, no new door, nothing
  written. Drawn only for the page it was heard for (`live.hereAt`), so moving to another page draws nobody until the
  next poll says who is there. Nothing at all when nobody else is.
-->
<script lang="ts">
  import { page } from '$app/state';
  import { live } from '$lib/data/live.svelte.ts';
  import Face from '$lib/ui/Face.svelte';

  const SHOWN = 3;
  const names = $derived(live.hereAt === page.url.pathname ? live.here : []);
  const said = $derived(
    names.length === 0 ? '' : `${names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`} ${names.length === 1 ? 'is' : 'are'} here too`,
  );
</script>

{#if names.length > 0}
  <span class="here" role="img" aria-label={said} title={said}>
    {#each names.slice(0, SHOWN) as n (n)}<span class="here-face"><Face name={n} size="s" kind="person" /></span>{/each}
    {#if names.length > SHOWN}<span class="here-more num" aria-hidden="true">+{names.length - SHOWN}</span>{/if}
  </span>
{/if}

<style>
  /* A ROW OF SMALL DISCS SIDE BY SIDE, 2 apart: laid over each other, their tinted fills muddied the letters. */
  .here {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding-inline: var(--sp-1);
  }

  .here-face {
    display: inline-flex;
  }

  .here-more {
    margin-inline-start: var(--sp-1);
    color: var(--ink-3);
    font-size: var(--fs-cap);
    font-weight: var(--fw-medium);
  }
</style>
