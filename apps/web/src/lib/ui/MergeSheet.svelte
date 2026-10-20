<!--
  "Merge with another person", from a person's own page: the other person picked from a short list, and one press puts
  the question to Decide (`merge-with.ts`). Nothing is merged here: Decide asks Merge all or Keep apart, with Undo.

  A SHEET, as "Hand to" is (`HandSheet.svelte`): from the bottom of the screen under a thumb, a drawer from 640px. The
  list is read when it opens, each time, since who is on the record changes between two presses, and a name typed in
  the box narrows it.
-->
<script lang="ts">
  import { goto } from '$app/navigation';
  import { apiBase, at } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import { askMerge, othersOf, readOthers } from '$lib/record/merge-with.ts';
  import type { RecordRow } from '$lib/record/remote.ts';
  import Sheet from './Sheet.svelte';
  import Waiting from './Waiting.svelte';
  import { toasts } from './toast.svelte.ts';

  let {
    open = $bindable(false),
    register,
    seq,
    name,
    title,
    mergedInto,
  }: {
    open?: boolean | undefined;
    register: string;
    /** This person's number, which is never offered as the other one. */
    seq: number;
    name: string;
    /** The field a person is named by, and the field a folded person points at the one kept with. */
    title: string;
    mergedInto?: string | undefined;
  } = $props();

  let rows = $state<RecordRow[] | null | undefined>(undefined);
  let typed = $state('');
  let asking = $state(false);

  /* READ WHEN IT OPENS, and each time. */
  $effect(() => {
    if (!open) return;
    typed = '';
    rows = undefined;
    void readOthers(apiBase(), register).then((got) => (rows = got));
  });

  const others = $derived(rows ? othersOf(rows, title, seq, typed, mergedInto) : []);

  async function pick(other: number) {
    if (asking) return;
    asking = true;
    const out = await askMerge(apiBase(), register, seq, other);
    asking = false;
    if (!out.ok) {
      toasts.push(out.fix, { intent: 'warn' });
      return;
    }
    open = false;
    void goto(at(`/decide/${encodeURIComponent(out.question)}`));
  }
</script>

<Sheet bind:open title={copy.mergeSheetTitle(name)}>
  {#if rows === undefined}
    <Waiting rows={3} />
  {:else if rows === null}
    <p class="merge-note">{copy.handReadFailed}</p>
  {:else}
    <input class="merge-find" type="search" autocomplete="off" placeholder={copy.mergeFind} aria-label={copy.mergeFind} bind:value={typed} />
    {#if others.length === 0}
      <p class="merge-note">{typed.trim() === '' ? copy.mergeNobody : copy.mergeNoMatch}</p>
    {:else}
      <ul class="merge-list">
        {#each others as o (o.seq)}
          <li>
            <button type="button" class="merge-one" disabled={asking} data-merge-with={o.seq} onclick={() => void pick(o.seq)}>
              <span class="merge-name">{o.name}</span>
              {#if o.note}<span class="merge-sub">{o.note}</span>{/if}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</Sheet>

<style>
  .merge-note {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-ui);
  }

  .merge-find {
    inline-size: 100%;
    min-block-size: var(--tap);
    margin-block-end: var(--sp-2);
    padding: 0 var(--sp-3);
    background: var(--fill);
    border: 0;
    border-radius: var(--r-md);
    color: var(--ink);
    font: inherit;
    font-size: var(--t-ui);
  }

  .merge-list {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .merge-one {
    display: flex;
    align-items: baseline;
    gap: var(--sp-3);
    inline-size: 100%;
    min-block-size: var(--tap);
    padding: 0 var(--sp-2);
    background: none;
    border: 0;
    border-radius: var(--r-md);
    color: var(--ink);
    font: inherit;
    font-size: var(--t-row);
    font-weight: 500;
    text-align: start;
    cursor: pointer;
    transition: background var(--d-state) var(--ease-out);
  }

  .merge-one:hover,
  .merge-one:focus-visible {
    background: var(--hover-wash);
  }

  .merge-one:disabled {
    cursor: default;
  }

  .merge-name {
    overflow-wrap: anywhere;
  }

  .merge-sub {
    color: var(--dim);
    font-size: var(--t-sm);
    font-weight: 400;
    overflow-wrap: anywhere;
  }

  @media (width < 900px) {
    .merge-one {
      font-size: var(--t-md);
    }
  }
</style>
