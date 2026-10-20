<!--
  What a byline's Undo will take back, when the change touched more than this row (`byline-undo.ts`): one sentence naming
  what else it touched, the change's lines as the run panel says them, then one press. Put back all of it, Only this one,
  or Keep. Drawn under the row's byline, in the docked panel and in Changed for you, for the row `host.asked` is on.

  A LIST WITHOUT A BOX, at the body size, and no red: taking a change back is a choice, not an alarm.
-->
<script lang="ts">
  import Button from '$lib/ui/Button.svelte';
  import type { RowHost } from './row-host.svelte.ts';
  import { undoAskWords as words } from './byline-undo.ts';
  import { keyOf, type RowAt } from './row-verbs.ts';

  let { host, row }: { host: RowHost; row: RowAt } = $props();

  const a = $derived(host.asked && host.asked.key === keyOf(row) ? host.asked : null);
  const busy = $derived(host.undoing.has(keyOf(row)));
</script>

{#if a}
  <div class="ask" role="group" aria-label={words.group(a.title)}>
    <p class="ask-lead" role="status">{a.ask.lead}</p>
    <ul class="ask-lines">
      {#each a.ask.lines as line}<li class="ask-line">{line}</li>{/each}
    </ul>
    {#if a.ask.more}<p class="ask-note">{a.ask.more}</p>{/if}
    {#if a.ask.left}<p class="ask-note">{a.ask.left}</p>{/if}
    <div class="ask-do">
      <Button size="sm" weight="primary" disabled={busy} onclick={() => void host.undoAll()}>{words.all(a.ask.all)}</Button>
      {#if a.only}
        <Button size="sm" disabled={busy} aria-label={words.onlyNamed(a.title)} onclick={() => void host.undoOnly()}>{words.only}</Button>
      {/if}
      <Button size="sm" weight="bare" onclick={() => host.keepAsked()}>{words.keep}</Button>
    </div>
  </div>
{/if}

<style>
  .ask {
    display: grid;
    gap: var(--sp-2);
    flex: 1 1 100%;
    min-inline-size: 0;
    padding-block: var(--sp-2);
  }

  .ask-lead {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: 1.55;
  }

  .ask-lines {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* ONE CHANGE A LINE, a hairline between, as the run panel's. */
  .ask-line {
    padding-block: var(--sp-1);
    border-block-start: 1px solid var(--rule);
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: 1.55;
    overflow-wrap: anywhere;
  }

  .ask-line:first-child {
    border-block-start: 0;
  }

  .ask-note {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-body);
    line-height: 1.55;
  }

  .ask-do {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
  }
</style>
