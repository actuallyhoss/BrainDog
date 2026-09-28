<!--
  Screen 2 of the pattern builder: the rule as a table, one column per sample and a row per field, each cell the typed
  value that field reads from that sample, and a chip per field saying in how many samples it read ("3/3").

  THE TEXT A VALUE CAME FROM IS ONE PRESS AWAY, and a hover at a desk: a cell is a button that shows the words it was
  cut from in place of the value, so a phone reaches it with a press and a mouse with a hover (its `title`).

  BELOW 640px THE TABLE IS A CARD PER FIELD, with the samples stacked inside it, because six columns of samples do not
  fit a phone and a card per field keeps each field's values together, which is what is being checked.
-->
<script lang="ts">
  import Button from '$lib/ui/Button.svelte';
  import Chip from '$lib/ui/Chip.svelte';
  import type { Cell, Sample, Tried } from './api.ts';
  import type { Reading } from './draft.ts';
  import { readingSaid, valueSaid, words } from './words.ts';

  let {
    samples,
    readings,
    tried,
    labelOf,
    onchange,
    onremove,
  }: {
    samples: readonly Sample[];
    readings: readonly Reading[];
    tried: Tried | null;
    labelOf: (field: string) => string;
    onchange: (field: string) => void;
    onremove: (field: string) => void;
  } = $props();

  /* THE CELLS SHOWING THEIR TEXT, by field and sample, replaced whole so the table follows. */
  let showing = $state.raw<ReadonlySet<string>>(new Set());
  const toggle = (key: string) => {
    const next = new Set(showing);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    showing = next;
  };

  const cellsOf = (field: string): readonly Cell[] => tried?.fields.find((f) => f.field === field)?.cells ?? [];
  const hitsOf = (field: string): number => cellsOf(field).filter((c) => c.ok).length;
  const toneOf = (field: string) => {
    const hits = hitsOf(field);
    return hits === samples.length ? 'good' : hits === 0 ? 'bad' : 'warn';
  };
  const sampleName = (s: Sample, i: number): string => (s.key.startsWith('paste:') ? words.pastedFrom : s.from || words.sampleOf(i + 1, samples.length));
</script>

{#snippet cell(field: string, i: number)}
  {@const c = cellsOf(field)[i]}
  {@const key = `${field} ${i}`}
  {#if !tried}
    <span class="unread">{words.unread}</span>
  {:else if !c || c.value === null}
    <span class="unread">{words.notRead}</span>
  {:else}
    <button
      type="button"
      class="value"
      title={c.raw === null ? undefined : words.rawOf(c.raw)}
      aria-pressed={showing.has(key)}
      aria-label={c.raw === null ? valueSaid(c.value) : `${valueSaid(c.value)}. ${words.showRaw}`}
      disabled={c.raw === null}
      onclick={() => toggle(key)}
    >
      {showing.has(key) && c.raw !== null ? c.raw : valueSaid(c.value)}
    </button>
  {/if}
{/snippet}

{#snippet chip(field: string)}
  <span class="chip" aria-label={words.readsLabel(hitsOf(field), samples.length)}>
    <Chip label={tried ? words.readsOf(hitsOf(field), samples.length) : words.readsOf(0, samples.length)} tone={tried ? toneOf(field) : undefined} />
  </span>
{/snippet}

<div class="wide">
  <table class="fields">
    <thead>
      <tr>
        <th scope="col">{words.field}</th>
        <th scope="col">{words.reads}</th>
        {#each samples as s, i (s.key)}
          <th scope="col" class="sample-head">{sampleName(s, i)}</th>
        {/each}
        <th scope="col"><span class="hidden">{words.change}</span></th>
      </tr>
    </thead>
    <tbody>
      {#each readings as r (r.field)}
        <tr>
          <th scope="row">
            <span class="name">{labelOf(r.field)}</span>
            <span class="how">{readingSaid(r.how)}</span>
          </th>
          <td>{@render chip(r.field)}</td>
          {#each samples as s, i (s.key)}
            <td class="num">{@render cell(r.field, i)}</td>
          {/each}
          <td class="acts">
            <Button weight="quiet" onclick={() => onchange(r.field)}>{words.change}</Button>
            <Button weight="bare" onclick={() => onremove(r.field)}>{words.remove}</Button>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<ul class="cards">
  {#each readings as r (r.field)}
    <li class="card">
      <div class="card-head">
        <span class="name">{labelOf(r.field)}</span>
        {@render chip(r.field)}
      </div>
      <p class="how">{readingSaid(r.how)}</p>
      <ul class="stack">
        {#each samples as s, i (s.key)}
          <li class="stacked">
            <span class="from">{sampleName(s, i)}</span>
            <span class="num">{@render cell(r.field, i)}</span>
          </li>
        {/each}
      </ul>
      <div class="card-acts">
        <Button onclick={() => onchange(r.field)}>{words.change}</Button>
        <Button weight="bare" onclick={() => onremove(r.field)}>{words.remove}</Button>
      </div>
    </li>
  {/each}
</ul>

<style>
  .hidden {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .wide {
    overflow-x: auto;
  }

  .fields {
    inline-size: 100%;
    border-collapse: collapse;
    font-size: var(--t-base);
  }

  .fields th,
  .fields td {
    padding: var(--sp-2) var(--sp-3);
    border-block-end: 1px solid var(--line-soft);
    text-align: start;
    vertical-align: top;
  }

  .fields thead th,
  .sample-head {
    color: var(--dim);
    font-size: var(--t-sm);
    font-weight: 500;
    overflow-wrap: anywhere;
  }

  .name {
    display: block;
    color: var(--ink);
    font-weight: 500;
  }

  .how {
    display: block;
    margin: 0;
    color: var(--dim);
    font-size: var(--t-sm);
    font-weight: 400;
    overflow-wrap: anywhere;
  }

  .unread {
    color: var(--dim);
  }

  .value {
    border: 0;
    border-radius: var(--r-sm);
    padding: 0;
    background: none;
    color: var(--ink);
    font: inherit;
    text-align: start;
    overflow-wrap: anywhere;
    cursor: pointer;
  }

  .value:disabled {
    cursor: default;
  }

  .acts {
    white-space: nowrap;
  }

  .cards {
    display: none;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .card {
    padding: var(--sp-3) 0;
    border-block-end: 1px solid var(--line-soft);
  }

  .card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-2);
  }

  .stack {
    margin: var(--sp-2) 0 0;
    padding: 0;
    list-style: none;
  }

  .stacked {
    display: flex;
    justify-content: space-between;
    gap: var(--sp-3);
    min-block-size: var(--tap);
    align-items: center;
  }

  .from {
    color: var(--dim);
    font-size: var(--t-sm);
    overflow-wrap: anywhere;
  }

  .stacked .value {
    min-block-size: var(--tap);
    font-size: var(--t-md);
  }

  .card-acts {
    display: flex;
    gap: var(--sp-3);
    margin-block-start: var(--sp-2);
  }

  @media (width < 640px) {
    .wide {
      display: none;
    }

    .cards {
      display: block;
    }
  }
</style>
