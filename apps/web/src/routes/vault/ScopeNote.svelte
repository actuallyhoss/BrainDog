<!--
  One quiet line inside the Keys tile: how many keys look like they belong to a project, and one button that puts the
  move in Needs you and opens it there (`scope-note.ts`). No tile of its own, no border, no shadow: the board's own text
  colours, the line at body size, and a rectangle button.

  NOTHING DRAWN AT NOUGHT OR ON A REFUSAL. The screen hands this the record's answer only when there is one; `noteOf`
  says none for anything else, and none draws nothing.

  THE PRESS ONLY ASKS. Nothing moves until he answers the question on Decide, which is why the button opens it.
-->
<script lang="ts">
  import { goto } from '$app/navigation';
  import { at } from '$lib/at.ts';
  import Button from '$lib/ui/Button.svelte';
  import { askMove, noteOf, type Call, type ScopeProposal } from './scope-note.ts';

  let { found, call }: { found: ScopeProposal | null; call: Call } = $props();

  const note = $derived(noteOf(found));
  let asking = $state(false);
  /** The record's sentence when a press did not file, said under the line until the next press. */
  let refused = $state<string | null>(null);

  async function review() {
    if (!found || asking) return;
    asking = true;
    refused = null;
    const moved = await askMove(call, found.list);
    asking = false;
    if (moved.ok) await goto(at(moved.href));
    else refused = moved.line;
  }
</script>

{#if note}
  <div class="scope-note" data-part="scope-note">
    <p class="scope-line">{note.line}</p>
    <Button disabled={asking} onclick={() => void review()}>{note.button}</Button>
  </div>
  {#if refused}<p class="scope-said" role="status">{refused}</p>{/if}
{/if}

<style>
  .scope-note {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2) var(--sp-3);
    margin: 0 0 var(--sp-3);
  }

  .scope-line {
    flex: 1 1 16rem;
    margin: 0;
    color: var(--ink2);
    font-size: var(--fs-body);
    line-height: 1.45;
  }

  .scope-said {
    margin: 0 0 var(--sp-3);
    color: var(--dim);
    font-size: var(--fs-body);
  }
</style>
