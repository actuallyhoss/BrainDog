<!--
  The rows a proposal would change, field by field (`changes.ts`). A document or a long text is the
  render package's `Diff`; any other field is its value before and after, each named, so the change is
  read as words and not as an arrow.
-->
<script lang="ts">
  import { Diff } from 'braindog-render/svelte';
  import { words, type Updated } from './changes.ts';

  let { updates }: { updates: readonly Updated[] } = $props();
</script>

<ul class="changes">
  {#each updates as u (u.at)}
    <li class="change">
      <p class="change-row">
        <span class="change-title">{u.title}</span>
        <span class="change-id">{u.at}</span>
      </p>
      {#each u.changes as c (c.field)}
        <div class="change-field">
          <p class="change-label">{c.label}</p>
          {#if c.long}
            <Diff block={c.block} />
          {:else}
            <dl class="plain">
              <dt>{words.before}</dt>
              <dd class="was">{c.before ?? words.empty}</dd>
              <dt>{words.after}</dt>
              <dd class="now">{c.after ?? words.empty}</dd>
            </dl>
          {/if}
        </div>
      {/each}
    </li>
  {/each}
</ul>

<style>
  .changes {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .change {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  .change-row {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--sp-2);
    margin: 0;
  }

  .change-title {
    color: var(--ink);
    font-weight: 500;
  }

  .change-id {
    color: var(--dim);
    font-family: var(--font-id);
    font-size: var(--t-xs);
  }

  .change-field {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    min-inline-size: 0;
  }

  .change-label {
    margin: 0;
    color: var(--dim);
    font-size: var(--t-xs);
  }

  .plain {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: var(--sp-1) var(--sp-3);
    margin: 0;
    font-size: var(--t-ui);
  }

  .plain dt {
    color: var(--dim);
  }

  .plain dd {
    margin: 0;
    overflow-wrap: anywhere;
  }

  .was {
    color: var(--ink2);
  }

  .now {
    color: var(--ink);
  }
</style>
