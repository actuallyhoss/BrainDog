<!--
  SCREEN 2 OF THE FIRST RUN. `19 §6`: "the register, with their one row in it, and the second choice
  offered inline. Pack selection lives *here*, after there is something to compare against, and it is
  optional forever."

  IT IS THE ONLY PLACE THE WORD *PACK* IS ALLOWED TO APPEAR FIRST. Screen 1 has no pack vocabulary at
  all, because selecting a pack means reading an install diff written in the language of metrics and
  nav order — and asking somebody to approve four schema reviews before they have seen one of their
  own rows is worse than a tour. Here they have seen one. Now the word means something: *the register
  you just made, but somebody else already worked out the fields.*

  AND IT IS INLINE, NOT A SCREEN. There is no step two to complete and nothing to dismiss before the
  product is usable — a person who ignores this for ever has a working record. `19 §6`'s own rule for
  the empty states applies to this too: never manufacture work.

  IT DISAPPEARS ON ITS OWN. The condition is one register and at least one row in it, which stops
  being true the moment somebody adds a second — so nothing has to remember that this was dismissed,
  and nothing can get stuck showing it. A dismissal is a preference to store, a migration to write and
  a state to get wrong; an invariant is none of those.
-->
<script lang="ts">
  import { copy } from '$lib/copy.ts';
  import { firstRun } from '$lib/first-run.ts';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import type { IconName } from '$lib/ui/icons.ts';
  import { goto } from '$app/navigation';

  let { held, register, first = false }: { held: readonly string[]; register: string; first?: boolean } = $props();

  /* THE OTHER STARTERS, and only the ones this record does not already have. Offering a register
     somebody holds is offering to do something that is already done, which is the shape of every
     onboarding people learn to ignore. */
  const rest = $derived(firstRun.firstChoices.filter((c) => c.key !== register && !held.includes(c.key)));

  /**
   * WHEN THIS IS THE SCREEN THEY JUST LANDED ON.
   *
   * `19 §6` calls screen two "the register, with their one row in it" — which is a MOMENT, not a
   * standing property. Reading it off the register count alone made it correct and unreachable: a
   * record with a second list never sees it, which is every record anybody demonstrates, so nothing
   * could show it and no test could reach it.
   *
   * A ONE-REGISTER RECORD STILL SEES IT, because that person genuinely is one register in and the
   * offer is still the right one. Two is somebody who has already done this.
   */
  const show = $derived((first || held.length === 1) && rest.length > 0);
</script>

{#if show}
  <section class="second" aria-labelledby="second-h">
    <h2 id="second-h">{firstRun.secondHeading}</h2>
    <p class="body">{firstRun.secondBody}</p>

    <ul class="rest">
      {#each rest.slice(0, 3) as c (c.key)}
        <li>
          <button type="button" class="one" onclick={() => void goto(`/start?add=${c.key}`)}>
            <Icon name={c.icon as IconName} />
            <span class="label">{c.label}</span>
            <span class="what">{c.body}</span>
          </button>
        </li>
      {/each}
    </ul>

    <!-- AND THE WORD, HERE, FOR THE FIRST TIME. Defined in place in one clause, which is the rule
         every term in this product is introduced under (19 §9). -->
    <p class="packs">
      {firstRun.secondPacks}
      <Button href="/packs" weight="bare">Browse packs</Button>
    </p>
  </section>
{/if}

<style>
  /* A BAND AND NOT A CARD. A card competes with the table above it for the eye, and the table is the
     thing that just became true — this is an aside about what could be next. */
  .second {
    margin-block-start: var(--sp-6);
    padding-block-start: var(--sp-5);
    border-block-start: 1px solid var(--line);
  }

  h2 {
    margin: 0;
    font-size: var(--t-lg);
    font-weight: 600;
    color: var(--ink);
  }

  .body {
    margin-block: var(--sp-2) var(--sp-4);
    max-inline-size: 60ch;
    color: var(--ink2);
  }

  /* THREE ACROSS, WRAPPING TO ONE. The same grid the first screen uses, so the second choice looks
     like the first choice rather than like an advertisement. */
  .rest {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
    gap: var(--sp-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .one {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: var(--sp-1) var(--sp-3);
    inline-size: 100%;
    padding: var(--sp-4);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    background: var(--raise);
    color: inherit;
    font: inherit;
    text-align: start;
    cursor: pointer;
  }

  .one:hover {
    border-color: var(--edge);
    background: var(--sunk);
  }

  .one:focus-visible {
    outline: var(--s1) solid var(--accent);
    outline-offset: 2px;
  }

  .label {
    font-weight: 600;
  }

  .what {
    grid-column: 2;
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  .packs {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-3);
    margin-block: var(--sp-5) 0;
    max-inline-size: 60ch;
    color: var(--ink2);
  }
</style>
