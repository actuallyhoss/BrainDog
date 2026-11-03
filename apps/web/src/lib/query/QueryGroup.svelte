<!--
  One group of the filter: how its rows join, the rows, and the two ways it grows.

  THE ROOT IS A GROUP TOO, so one condition, a stack of them and nested groups are one component at every level
  (`docs/21 §4.1`). A nested group is indented one step and ruled on its leading edge, so which rows a join governs is
  a shape and not a guess. The join is a select only where the surface allows more than a flat "and" (`edits.depth`
  above 1): the list's address cannot say "any", so the list is never offered it.

  AT THE DEPTH CAP ADD A GROUP DISABLES AND THE METER SAYS WHY, never an error: a control that refuses after it is
  pressed is a question the screen could have answered before.
-->
<script lang="ts">
  import { copy } from '$lib/copy.ts';
  import Icon from '$lib/ui/Icon.svelte';
  import QueryGroup from './QueryGroup.svelte';
  import QueryRow from './QueryRow.svelte';
  import { JOINS, type Edits, type Grp, type Join } from './tree.ts';

  let { group, level, edits, first = 1 }: { group: Grp; level: number; edits: Edits; first?: number } = $props();

  const joinSaid: Record<Join, string> = { all: copy.queryAll, any: copy.queryAny, none: copy.queryNone };
  const capped = $derived(level >= edits.depth);

  /** Each row's number as a person counts them, top to bottom through every group. */
  function numbered(): number[] {
    const out: number[] = [];
    let at = first;
    for (const item of group.items) {
      out.push(at);
      at += item.kind === 'cond' ? 1 : count(item);
    }
    return out;
  }
  const count = (g: Grp): number => g.items.reduce((n, i) => n + (i.kind === 'cond' ? 1 : count(i)), 0);
  const numbers = $derived(numbered());
</script>

<div class="q-group" data-nested={level > 1 ? '' : undefined} data-proposed={group.proposed ? '' : undefined}>
  {#if edits.depth > 1 && (level > 1 || group.items.length > 1)}
    <div class="q-join">
      <label class="q-join-label">
        <span>{copy.queryJoin}</span>
        <select value={group.join} onchange={(e) => edits.set(group.key, { join: e.currentTarget.value as Join })}>
          {#each JOINS as j (j)}
            <option value={j}>{joinSaid[j]}</option>
          {/each}
        </select>
      </label>
      {#if level > 1}
        <button type="button" class="q-drop tap" aria-label={copy.queryRemoveGroup} onclick={() => edits.remove(group.key)}>
          <Icon name="close" size="s" />
        </button>
      {/if}
    </div>
  {/if}

  <ul class="q-items">
    {#each group.items as item, i (item.key)}
      <li class="q-item">
        {#if item.kind === 'cond'}
          <QueryRow cond={item} n={numbers[i] ?? i + 1} {edits} />
        {:else}
          <QueryGroup group={item} level={level + 1} {edits} first={numbers[i] ?? i + 1} />
        {/if}
      </li>
    {/each}
  </ul>

  <div class="q-grow">
    <button type="button" class="q-add" onclick={() => edits.addCond(group.key)}>
      <Icon name="plus" size="s" />{copy.queryAddCondition}
    </button>
    {#if edits.depth > 1}
      <button type="button" class="q-add" disabled={capped} onclick={() => edits.addGroup(group.key)}>
        <Icon name="plus" size="s" />{copy.queryAddGroup}
      </button>
      {#if capped || level === 1}
        <label class="q-meter">
          <span>{copy.queryDepth(edits.deepest, edits.depth)}</span>
          <meter min="0" max={edits.depth} value={edits.deepest}></meter>
        </label>
      {/if}
    {/if}
  </div>
</div>

<style>
  .q-group {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  /* A NESTED GROUP IS ONE STEP IN, with a rule down its leading edge: the shape that says which rows the join governs. */
  .q-group[data-nested] {
    padding-inline-start: var(--sp-3);
    border-inline-start: 2px solid var(--rule);
  }

  .q-group[data-proposed] {
    border-inline-start-style: dashed;
  }

  .q-join {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }

  .q-join-label {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  .q-items {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .q-item {
    min-inline-size: 0;
  }

  .q-grow {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
  }

  .q-add,
  .q-drop {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: var(--ctl-h);
    padding-inline: var(--sp-2);
    background: none;
    border: 0;
    border-radius: var(--r-xs);
    color: var(--ink-2);
    font: inherit;
    font-weight: 500;
    cursor: pointer;
  }

  .q-add:disabled {
    color: var(--ink-3);
    cursor: default;
  }

  @media (hover: hover) and (pointer: fine) {
    .q-add:not(:disabled):hover,
    .q-drop:hover {
      background: var(--hover);
      color: var(--ink);
    }
  }

  .q-meter {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  .q-meter meter {
    inline-size: 4rem;
  }
</style>
