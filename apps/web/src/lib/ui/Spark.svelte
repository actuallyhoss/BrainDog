<!--
  Spark: the agent, as a place rather than as a mode.

  The mark moved here from the top of the rail, and the move is the point. A logo at the top of a
  sidebar is decoration — it tells you which product you are in, which you already know, and it
  occupies the most valuable 60 pixels on the screen to do it. The same drawing on a floating button
  in the corner is an AFFORDANCE: it is the one thing on every screen that will answer a question,
  and it is in the corner every product has trained people to look in for exactly that.

  It is a BUTTON AND A PANEL, not a chat window pinned to the side. A conversation that permanently
  occupies a third of the viewport says the agent is the product; a corner button that opens over
  the work says the record is the product and the agent is how you talk to it. Closing it returns
  you to exactly what you were reading, which is the behaviour a side panel cannot offer.

  The panel opens ABOVE the button and anchored to the same corner, so the thing you clicked does
  not move and does not disappear under what it opened.
-->
<script lang="ts">
  import { copy } from '../copy.ts';
  import Icon from './Icon.svelte';
  import Mark from './Mark.svelte';

  let { open = $bindable(false) }: { open?: boolean } = $props();

  let field = $state<HTMLInputElement | null>(null);

  /** Four openings, not a blank box. A prompt field with nothing in it is a test of what the thing
      can do, and most people decline to take it (19 §4). These are the questions the record can
      actually answer, phrased the way somebody would say them out loud. */
  const openings = [copy.sparkOne, copy.sparkTwo, copy.sparkThree, copy.sparkFour];

  $effect(() => {
    if (open) field?.focus();
  });

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && open) {
      open = false;
      e.stopPropagation();
    }
  }
</script>

<svelte:window {onkeydown} />

<div class="corner">
  {#if open}
    <!-- Labelled by the button that owns it, so the relationship survives with the panel closed. -->
    <section class="panel" aria-label={copy.spark}>
      <header class="panel-head">
        <Mark height={20} />
        <h2 class="panel-title">{copy.spark}</h2>
        <button type="button" class="close tap" onclick={() => (open = false)} aria-label={copy.close}>
          <Icon name="close" size="s" />
        </button>
      </header>

      <ul class="openings">
        {#each openings as opening}
          <li><button type="button" class="opening">{opening}</button></li>
        {/each}
      </ul>

      <div class="field">
        <input
          bind:this={field}
          class="field-input"
          type="text"
          placeholder={copy.sparkPlaceholder}
          aria-label={copy.sparkPlaceholder}
        />
        <!-- Disabled, and it is a MOCK-UP rather than a broken control: nothing here writes. -->
        <button type="button" class="send" disabled aria-label={copy.sparkSend}>
          <Icon name="arrow" size="s" />
        </button>
      </div>

      <!-- The one thing worth saying about an agent that can write to the record. Not an
           explanation of the interface — a statement about what happens to your data. -->
      <p class="note">{copy.sparkNote}</p>
    </section>
  {/if}

  <button
    type="button"
    class="fab tap"
    aria-expanded={open}
    aria-label={copy.spark}
    onclick={() => (open = !open)}
  >
    <Mark height={24} />
    <span class="fab-name">{copy.spark}</span>
  </button>
</div>

<style>
  .corner {
    position: fixed;
    inset-block-end: var(--sp-5);
    inset-inline-end: var(--sp-5);
    z-index: var(--z-hint);
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: var(--sp-3);
    pointer-events: none;
  }

  .corner > :global(*) {
    pointer-events: auto;
  }

  /* The one control in the product that is allowed to float, and the one place a shadow is allowed
     to say so. Everything else is flat because everything else is IN the page; this is over it, and
     a thing over the page that casts nothing reads as a thing stuck to the glass. */
  .fab {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: 44px;
    padding: 0 var(--sp-4) 0 var(--sp-3);
    background: var(--s3);
    border: 1px solid var(--edge);
    border-radius: 999px;
    box-shadow: var(--e2);
    color: var(--ink);
    font-family: var(--font-display);
    font-size: var(--t-ui);
    font-weight: 600;
    letter-spacing: -0.012em;
    cursor: pointer;
    transition:
      background var(--d-state) var(--ease-out),
      border-color var(--d-state) var(--ease-out);
  }

  .fab:hover {
    background: var(--s2);
    border-color: var(--ink2);
  }

  .fab[aria-expanded='true'] {
    background: var(--s2);
  }

  .panel {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    inline-size: min(380px, calc(100vw - var(--sp-6)));
    padding: var(--sp-4);
    background: var(--s1);
    border: 1px solid var(--edge);
    border-radius: var(--r-lg);
    box-shadow: var(--e3);
  }

  .panel-head {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }

  .panel-title {
    flex: 1;
    font-family: var(--font-display);
    font-size: var(--t-md);
    font-weight: 600;
    letter-spacing: -0.016em;
  }

  .close {
    display: grid;
    place-items: center;
    inline-size: 26px;
    block-size: 26px;
    background: none;
    border: 0;
    border-radius: var(--r-sm);
    color: var(--dim);
    cursor: pointer;
  }

  .close:hover {
    background: color-mix(in srgb, var(--ink) 8%, transparent);
    color: var(--ink);
  }

  .openings {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .opening {
    inline-size: 100%;
    min-block-size: 32px;
    padding: var(--sp-2) var(--sp-3);
    background: none;
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    color: var(--ink2);
    font-size: var(--t-sm);
    text-align: start;
    cursor: pointer;
    transition:
      background var(--d-state) var(--ease-out),
      border-color var(--d-state) var(--ease-out);
  }

  .opening:hover {
    background: var(--s2);
    border-color: var(--edge);
    color: var(--ink);
  }

  .field {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    padding: 0 var(--sp-2) 0 var(--sp-3);
    min-block-size: var(--ctl-h);
    background: var(--s3);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
  }

  .field:focus-within {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent);
  }

  .field-input {
    flex: 1;
    min-inline-size: 0;
    border: 0;
    background: none;
    color: var(--ink);
    font-size: var(--t-ui);
  }

  .send {
    display: grid;
    place-items: center;
    inline-size: 26px;
    block-size: 26px;
    background: var(--accent);
    border: 0;
    border-radius: var(--r-sm);
    color: var(--accent-ink);
    cursor: pointer;
  }

  .send:disabled {
    background: var(--line);
    color: var(--dim);
    cursor: not-allowed;
  }

  .note {
    color: var(--dim);
    font-size: var(--t-xs);
  }

  /* The tab bar owns the bottom of a phone. A floating button on top of it covers the fifth tab. */
  @media (width < 900px) {
    .corner {
      inset-block-end: calc(var(--tap) + var(--sp-5));
      inset-inline-end: var(--sp-3);
    }

    .fab-name {
      display: none;
    }

    .fab {
      padding: 0;
      inline-size: 48px;
      justify-content: center;
    }
  }
</style>
