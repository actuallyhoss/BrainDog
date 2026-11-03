<!--
  Report an add-on from the store (DESIGN.md §8, Lane H): a line saying what is wrong with it, sent to the Kennel's
  `report` door as the signed-in person, for the operator to read beside the review queue. Folded away under one quiet
  line, since almost nobody needs it, and nothing here changes the add-on for anyone: the operator decides.
-->
<script lang="ts">
  import Button from '$lib/ui/Button.svelte';
  import { KENNEL_AT } from './counts.ts';

  let { kind = 'pack', id, version }: { kind?: 'pack' | 'usecase'; id: string; version?: string | undefined } = $props();

  let why = $state('');
  let busy = $state(false);
  let said = $state<{ text: string; bad: boolean } | null>(null);

  async function send(): Promise<void> {
    const text = why.trim();
    if (text === '') {
      said = { text: 'Say what is wrong with it in a line, so the reviewer can look.', bad: true };
      return;
    }
    busy = true;
    said = null;
    try {
      const res = await fetch(`${KENNEL_AT}report`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ kind, id, ...(version === undefined ? {} : { version }), why: text }),
      });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; refusal?: { fix?: string } } | null;
      if (res.ok && body?.ok === true) {
        why = '';
        said = { text: 'Sent. The person who reviews the store reads it. Nothing changes for anyone until they decide.', bad: false };
      } else said = { text: body?.refusal?.fix ?? 'The store did not take it just now. Try again in a moment.', bad: true };
    } catch {
      said = { text: 'The store did not answer. Try again in a moment.', bad: true };
    } finally {
      busy = false;
    }
  }
</script>

<details class="report">
  <summary class="tap">Report this add-on</summary>
  <label class="field">
    <span>What is wrong with it</span>
    <textarea rows="3" maxlength="1000" bind:value={why}></textarea>
  </label>
  <div class="row">
    <Button size="sm" disabled={busy} onclick={() => void send()}>Send report</Button>
  </div>
  {#if said}<p class="said" class:bad={said.bad} role="status">{said.text}</p>{/if}
</details>

<style>
  .report > summary {
    color: var(--ink-2);
    font-size: var(--fs-meta);
    cursor: pointer;
  }

  .report[open] > summary {
    margin-block-end: var(--sp-2);
  }

  .field {
    display: grid;
    gap: var(--sp-1);
    font-size: var(--fs-meta);
    color: var(--ink-2);
  }

  textarea {
    inline-size: 100%;
    font: inherit;
    font-size: var(--fs-body);
    color: var(--ink);
  }

  .row {
    margin-block-start: var(--sp-2);
  }

  .said {
    margin-block-start: var(--sp-2);
    font-size: var(--fs-meta);
    color: var(--ink-2);
  }

  .said.bad {
    color: var(--bad, var(--ink));
  }
</style>
