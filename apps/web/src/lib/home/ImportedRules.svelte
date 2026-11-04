<!--
  Imported automations as filing rules, as one tile at the end of the board. REC-B10, job 7: the
  automations an import made to file Ledger entries by their description, offered as filing rules in one press.

  AN OFFER HE PRESSES AND NEVER A QUESTION. The tile says how many and what the press does; nothing is written until
  the press. After it the tile says how many rules it made and holds the one Undo, which takes every rule back and
  switches every automation on again; after that the offer is back.

  A REFUSAL IS SAID IN THE TOAST, the record's own sentence with the field it was about named, and the tile stays as it
  was for another try. Nothing at nought: Home mounts this only when `loadImported` found some.

  The button is a rectangle, the primary weight in the red accent (`ui/Button.svelte`).
-->
<script lang="ts">
  import { apiBase } from '$lib/at.ts';
  import { reread } from '$lib/data/live.svelte.ts';
  import Button from '$lib/ui/Button.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { acceptImported, undoImported, WORDS, type Accepted, type ImportedFound } from './imported-rules.ts';

  let { found }: { found: ImportedFound } = $props();

  const n = $derived(found.rules.length);
  let done = $state.raw<Accepted | null>(null);
  let busy = $state(false);

  async function press() {
    if (busy || n === 0) return;
    busy = true;
    try {
      const out = await acceptImported(apiBase(), found);
      if (out.ok) {
        done = out.value;
        void reread();
      } else toasts.push(out.fix, { intent: 'warn' });
    } finally {
      busy = false;
    }
  }

  async function undo() {
    if (busy || done === null) return;
    busy = true;
    try {
      const out = await undoImported(apiBase(), done);
      if (out.ok) {
        done = null;
        toasts.push(WORDS.undone, { intent: 'good' });
        void reread();
      } else toasts.push(out.fix, { intent: 'warn' });
    } finally {
      busy = false;
    }
  }
</script>

{#if n > 0}
  <section class="imported" aria-labelledby="imported-h" aria-live="polite" data-imported-rules>
    {#if done}
      <h2 class="i-head" id="imported-h">{WORDS.made(done.made, done.off.length)}</h2>
      <div class="i-act">
        <Button disabled={busy} aria-busy={busy} data-imported-undo onclick={() => void undo()}>{WORDS.undo}</Button>
      </div>
    {:else}
      <h2 class="i-head" id="imported-h">{WORDS.ask(n)}</h2>
      <p class="i-why">{WORDS.why}</p>
      <div class="i-act">
        <Button weight="primary" disabled={busy} aria-busy={busy} data-imported-press onclick={() => void press()}>{WORDS.press(n)}</Button>
      </div>
    {/if}
  </section>
{/if}

<style>
  /* A TILE OF ITS OWN, the whole row of the board: flat, no border, no shadow, the board's own radius. */
  .imported {
    grid-column: 1 / -1;
    min-inline-size: 0;
    padding: var(--tile-pad, 20px);
    background: var(--tile);
    border-radius: var(--r-tile, 16px);
  }

  .i-head {
    margin: 0;
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--fs-body);
    font-weight: 500;
    line-height: 1.4;
  }

  .i-why {
    margin: var(--sp-2) 0 0;
    color: var(--ink-3);
    font-size: var(--fs-body, 15px);
    line-height: calc(22px * var(--type, 1));
  }

  .i-act {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    margin-block-start: var(--sp-3);
  }

  @media (forced-colors: active) {
    .imported {
      border: 1px solid CanvasText;
    }
  }
</style>
