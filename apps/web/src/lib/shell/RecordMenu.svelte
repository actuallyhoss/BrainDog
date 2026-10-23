<!--
  "BrainDog ▾" (frame A, 23 October): the mark and the product's name, and under them the record you are in and the
  others to switch to. On the desk's bar and the phone's head alike; it moved here from the More sheet, the one place
  that held it.
-->
<script lang="ts">
  import { at } from '../at.ts';
  import { copy } from '../copy/frame.ts';
  import { levelWord } from '../record/switcher.ts';
  import Icon from '../ui/Icon.svelte';
  import Mark from '../ui/Mark.svelte';
  import Menu from '../ui/Menu.svelte';
  import { frame } from './frame.svelte.ts';

  let { phone = false }: { phone?: boolean } = $props();

  const words = { product: 'BrainDog', records: 'Records', opens: (name: string) => `Open ${name}` } as const;
  const others = $derived(frame.records.filter((r) => r.name !== frame.record));
</script>

<div class="rm" data-phone={phone ? '' : undefined}>
  <Menu label={words.records} align="start">
    {#snippet trigger()}
      <span class="rm-face">
        <Mark height={20} />
        <span class="rm-word">{words.product}</span>
        <span class="rm-caret" aria-hidden="true"><Icon name="chevronDown" size="s" /></span>
      </span>
    {/snippet}
    {#if frame.record}
      <a class="rm-mi" role="menuitem" aria-current="true" href={at('/')}><span class="rm-tile" aria-hidden="true">{frame.record.slice(0, 1)}</span><span class="mi-name">{frame.record}</span></a>
    {/if}
    {#each others as r (r.slug)}
      {@const word = levelWord(r)}
      <button type="button" class="rm-mi" role="menuitem" onclick={() => frame.open?.(r)}>
        <span class="rm-tile" aria-hidden="true">{r.name.slice(0, 1)}</span><span class="mi-name">{words.opens(r.name)}</span>
        {#if word !== null}<span class="rm-level">{word}</span>{/if}
      </button>
    {/each}
    {#if frame.refused}<span class="rm-mi" role="menuitem" aria-disabled="true">{frame.refused}</span>{/if}
    <hr />
    <a class="rm-mi" role="menuitem" href={at('/settings/signing-in')}><Icon name="settings" size="s" />{copy.recordSettings}</a>
  </Menu>
</div>

<style>
  .rm {
    flex: none;
    min-inline-size: 0;
  }

  /* THE FACE: the mark at 20 and "BrainDog" in the display face at 17/600, a quiet caret after it. */
  .rm-face {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: 40px;
    padding-inline: var(--sp-2);
    color: var(--ink);
  }

  .rm[data-phone] .rm-face {
    min-block-size: var(--tap);
    padding-inline: 0 var(--sp-2);
  }

  .rm-word {
    font-family: var(--font-display);
    font-size: var(--fs-head);
    font-weight: var(--fw-semi);
    letter-spacing: -0.01em;
    white-space: nowrap;
  }

  .rm-caret {
    display: inline-grid;
    color: var(--ink-3);
  }

  @media (hover: hover) and (pointer: fine) {
    .rm :global(.menu-trigger:hover) {
      background: var(--hover);
    }
  }

  .rm-mi {
    color: var(--ink-2);
    text-decoration: none;
    cursor: pointer;
  }

  .rm-mi :global(.icon) {
    color: var(--ink-3);
  }

  .rm-level {
    margin-inline-start: auto;
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  /* A RECORD'S TILE: ink with the ground's letter. */
  .rm-tile {
    display: grid;
    place-items: center;
    flex: none;
    inline-size: 20px;
    block-size: 20px;
    background: var(--ink);
    border-radius: var(--r-xs);
    color: var(--tile);
    font-size: var(--fs-cap);
    font-weight: var(--fw-semi);
    line-height: 1;
  }
</style>
