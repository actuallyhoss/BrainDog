<!--
  "Test the model now", under Slash's health line (health shown). Loaded by `import()` from
  `SlashAsks.svelte` for the owner only, so nothing here reaches what every screen loads.

  ONE BUTTON, THEN WHAT IT SAID. A press asks `engineProbe` once; the lines are `probeSaid`'s, one a candidate, or the
  refusal's own fix and, when the record holds the next press, when it may go. The words carry a failure ("did not
  answer"), so no line leans on colour alone.

  THE LINES' REGION IS ALWAYS IN THE DOCUMENT: a live region inserted with its first sentence is not reliably announced.
-->
<script lang="ts">
  import { apiBase } from '../at.ts';
  import Button from '$lib/ui/Button.svelte';
  import { probe, probeSaid, words } from '$lib/ui/model-probe.ts';

  let busy = $state(false);
  let lines = $state<string[]>([]);

  async function test() {
    if (busy) return;
    busy = true;
    try {
      lines = probeSaid(await probe(apiBase()));
    } finally {
      busy = false;
    }
  }
</script>

<div class="probe">
  <Button onclick={test} disabled={busy} aria-busy={busy ? 'true' : undefined}>{busy ? words.busy : words.button}</Button>
  <div class="probe-said" role="status" data-has={lines.length > 0 ? '' : undefined}>
    {#each lines as line}<p>{line}</p>{/each}
  </div>
</div>

<style>
  .probe {
    grid-column: 1 / -1;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
  }

  /* UNDER A THUMB THE BUTTON ITSELF IS 44 TALL, not only its hit box. */
  @media (pointer: coarse) {
    .probe :global(.btn) {
      min-block-size: 44px;
    }
  }

  .probe-said {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
  }

  .probe-said[data-has] {
    margin-block-start: var(--sp-2);
  }

  .probe-said p {
    margin: 0;
    max-inline-size: var(--measure);
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
    overflow-wrap: anywhere;
  }
</style>
