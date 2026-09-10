<!--
  What `?` draws, read FROM THE REGISTRY.

  Which is the whole point: the sheet cannot drift from what is bound, because it is not a second
  list. A cheat sheet maintained by hand is a cheat sheet that is wrong by the second release.

  AND IT NOW READS THE ONE COLUMN OF THE REGISTRY THAT NOTHING READ. `Binding.bare` is written on
  all forty-five rows and, until this, its only consumer was the test that recomputes it from
  `binding.key` and asserts the two agree: a hand-maintained duplicate of a value the test derives,
  justified by a sentence claiming the switch reads it. The switch reads `e.key.length === 1` and
  the cookie. So the flag was true of nothing.

  The switch it describes is the app's WCAG 2.1.4 conformance, and a reader who turns it off loses
  nine of the rows below including `?`, `/` and `g`. A sheet that goes on printing them as though
  they work is the same defect as the flag: complete-looking, and saying nothing.
-->
<script lang="ts">
  import Icon from './Icon.svelte';
  import { BINDINGS, SCOPE_ORDER, type Scope } from '../a11y/keys.svelte.ts';
  import { copy } from '../copy.ts';
  import * as pref from '../pref.ts';
  import Kbd from './Kbd.svelte';

  /* THE SWITCH'S STATE, AND THE CALLER MAY OWN IT. `/settings/keyboard` draws this sheet directly
     under the control, where the reader is pressing On and Off: reading the cookie there would show
     the previous answer until the page reloaded. The sheet in `?` has no such control beside it, so
     the cookie is the right default. */
  let { silenced = pref.read().chars === false }: { silenced?: boolean } = $props();

  const TITLE: Record<Scope, string> = {
    document: copy.scopeDocument,
    grid: copy.scopeGrid,
    board: copy.scopeBoard,
    page: copy.scopePage,
    gate: copy.scopeGate,
    palette: copy.scopePalette,
    nav: copy.scopeNav,
  };

  /* One glyph per scope, so the groups read as places rather than as paragraphs. */
  const GLYPH = {
    document: 'home',
    grid: 'rows',
    board: 'board',
    page: 'doc',
    gate: 'decide',
    palette: 'search',
    nav: 'settings',
  } as const;

  const groups = SCOPE_ORDER.map((scope) => [scope, BINDINGS.filter((b) => b.scope === scope)] as const);
</script>

{#if silenced}
  <p class="silenced">{copy.keymapSilenced}</p>
{/if}

{#each groups as [scope, bindings]}
  <section class="scope">
    <h3 class="scope-title"><Icon name={GLYPH[scope]} size="s" />{TITLE[scope]}</h3>
    <dl class="keys">
      {#each bindings as binding}
        <dt class:off={silenced && binding.bare}><Kbd keys={binding.key} /></dt>
        <dd>
          {binding.label}{#if silenced && binding.bare}<span class="tag">{copy.keymapRowOff}</span>{/if}
        </dd>
      {/each}
    </dl>
  </section>
{/each}

<style>
  .scope + .scope {
    margin-block-start: var(--sp-5);
  }

  .scope-title {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin-block-end: var(--sp-2);
    color: var(--dim);
    font-family: var(--font-ui);
    font-size: var(--t-sm);
    font-weight: 600;
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

  /* THE MARK IS NOT COLOUR ALONE. A silenced row is dimmed AND carries the word, because
     `19 §4` is an accessibility control and the one reader most likely to have turned it on is the
     one least served by a change in opacity. */
  .silenced {
    margin: 0 0 var(--sp-4);
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  dt.off {
    opacity: 0.45;
  }

  .tag {
    margin-inline-start: var(--sp-2);
    padding: 0 var(--sp-1);
    border: 1px solid var(--line);
    border-radius: var(--r-sm);
    color: var(--dim);
    font-family: var(--font-ui);
    font-size: var(--t-sm);
  }
</style>
