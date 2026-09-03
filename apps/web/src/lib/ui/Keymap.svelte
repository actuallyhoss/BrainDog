<!--
  What `?` draws, read FROM THE REGISTRY.

  Which is the whole point: the sheet cannot drift from what is bound, because it is not a second
  list. A cheat sheet maintained by hand is a cheat sheet that is wrong by the second release.
-->
<script lang="ts">
  import { BINDINGS, SCOPE_ORDER, type Scope } from '../a11y/keys.svelte.ts';
  import { copy } from '../copy.ts';
  import Kbd from './Kbd.svelte';

  const TITLE: Record<Scope, string> = {
    document: copy.scopeDocument,
    grid: copy.scopeGrid,
    page: copy.scopePage,
    gate: copy.scopeGate,
    palette: copy.scopePalette,
    nav: copy.scopeNav,
  };

  const groups = SCOPE_ORDER.map((scope) => [scope, BINDINGS.filter((b) => b.scope === scope)] as const);
</script>

{#each groups as [scope, bindings]}
  <section class="scope">
    <h3 class="scope-title">{TITLE[scope]}</h3>
    <dl class="keys">
      {#each bindings as binding}
        <dt><Kbd keys={binding.key} /></dt>
        <dd>{binding.label}</dd>
      {/each}
    </dl>
  </section>
{/each}

<style>
  .scope + .scope {
    margin-block-start: var(--sp-5);
  }

  .scope-title {
    margin-block-end: var(--sp-2);
    color: var(--dim);
    font-family: var(--font-ui);
    font-size: var(--t-xs);
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .keys {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: var(--sp-2) var(--sp-3);
    margin: 0;
    align-items: baseline;
  }

  dt {
    justify-self: start;
  }

  dd {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-sm);
  }
</style>
