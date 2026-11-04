<!--
  A thing's items in a menu, in their groups: the same rows whichever menu holds them. A state wears its dot and the one it is
  in is ticked at the end; a going verb looks it, and comes last. What is still being read says so in one quiet row, and what
  could not be read says that, with a way to ask again: its link's three above it need nothing.
-->
<script lang="ts">
  import Icon from '../ui/Icon.svelte';
  import StateDot from '../ui/StateDot.svelte';
  import { at } from '../at.ts';
  import { thingWords, VERB_ICONS } from './verbs.ts';
  import type { ThingItem } from './menu-of.ts';

  let {
    items,
    status = 'ready',
    onagain,
    onclose,
  }: { items: readonly ThingItem[]; status?: 'ready' | 'reading' | 'failed'; onagain?: (() => void) | undefined; onclose?: (() => void) | undefined } = $props();

  /** Whether the others are shown under the state it is in; a row in no state yet shows them all. */
  let states = $state(false);
  const folds = $derived(items.some((i) => i.state !== undefined && i.now));
</script>

{#each items as it, i (it.id)}
  {#if i > 0 && items[i - 1]!.group !== it.group}<hr />{/if}
  {#if it.href !== undefined}
    <a role="menuitem" href={at(it.href)} target={it.newTab ? '_blank' : undefined} rel={it.newTab ? 'noopener' : undefined} data-link-verb={it.linkVerb ? '' : undefined} data-verb={it.id}>
      <Icon name={it.icon} size="s" /><span class="mi-name">{it.label}</span>
    </a>
  {:else if it.state !== undefined && it.now && folds}
    <!-- ITS STATE, SAID, AND THE OTHERS ONE PRESS AWAY: a list with six states made a project's menu taller than a laptop's screen. A
         checkable item, so the menu stays open as they unfold. -->
    <button type="button" role="menuitemcheckbox" aria-checked={states} data-verb="states" onclick={() => (states = !states)}>
      <span class="mi-dot"><StateDot state={it.state as 'open' | 'part' | 'done'} /></span><span class="mi-name">{it.label}</span>
      <span class="mi-on" data-open={states ? '' : undefined}><Icon name="chevronDown" size="s" /></span>
    </button>
  {:else if it.state !== undefined}
    {#if states || !folds}
      <button
        type="button"
        role="menuitemradio"
        aria-checked={it.now ? 'true' : 'false'}
        data-verb={it.id}
        onclick={() => {
          it.run?.();
          onclose?.();
        }}
      >
        <span class="mi-dot"><StateDot state={it.state as 'open' | 'part' | 'done'} /></span><span class="mi-name">{it.label}</span>
        {#if it.now}<span class="mi-on"><Icon name="check" size="s" /></span>{/if}
      </button>
    {/if}
  {:else}
    <button type="button" role="menuitem" data-tone={it.tone} data-link-verb={it.linkVerb ? '' : undefined} data-verb={it.id} onclick={() => it.run?.()}>
      <Icon name={it.icon} size="s" /><span class="mi-name">{it.label}</span>{#if it.from}<span class="mi-from">{it.from}</span>{/if}
    </button>
  {/if}
{/each}
{#if status === 'reading'}
  <span class="mi-quiet" role="menuitem" aria-disabled="true" aria-busy="true"><span class="mi-slot"></span>{thingWords.reading}</span>
{:else if status === 'failed'}
  <span class="mi-quiet" role="menuitem" aria-disabled="true"><span class="mi-slot"></span>{thingWords.unread}</span>
  <button type="button" role="menuitemcheckbox" aria-checked="false" onclick={() => onagain?.()}><Icon name={VERB_ICONS.refresh} size="s" /><span class="mi-name">{thingWords.again}</span></button>
{/if}

<style>
  .mi-dot,
  .mi-slot {
    display: inline-grid;
    place-items: center;
    inline-size: 20px;
    flex: none;
  }

  .mi-on {
    display: inline-flex;
    color: var(--ink);
  }

  .mi-on[data-open] {
    transform: rotate(180deg);
  }

  .mi-from {
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .mi-quiet {
    color: var(--ink-3);
  }
</style>
