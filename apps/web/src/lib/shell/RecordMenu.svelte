<!--
  The record switcher, at the head of the sidebar: the record's mark and its name ("Acme ▾"), never the product's, and
  under them the record you are in and the others to switch to. `bare` draws the mark alone, for the sidebar's narrow
  rail; `phone` sizes it for a thumb, at the head of the phone's Menu.
-->
<script lang="ts">
  import { at } from '../at.ts';
  import { copy } from '../copy/frame.ts';
  import { levelWord } from '../record/switcher.ts';
  import Icon from '../ui/Icon.svelte';
  import Menu from '../ui/Menu.svelte';
  import { frame } from './frame.svelte.ts';
  import RecordMark from './RecordMark.svelte';

  let { phone = false, bare = false }: { phone?: boolean; bare?: boolean } = $props();

  const words = { records: 'Records', record: 'Record', opens: (name: string) => `Open ${name}` } as const;
  const others = $derived(frame.records.filter((r) => r.name !== frame.record));
  const name = $derived(frame.record || words.record);
</script>

<div class="rm" data-phone={phone ? '' : undefined} data-bare={bare ? '' : undefined}>
  <Menu label={bare ? `${words.records}: ${name}` : words.records} align="start">
    {#snippet trigger()}
      <span class="rm-face">
        <RecordMark size={bare ? 24 : 20} />
        {#if !bare}
          <span class="rm-word" dir="auto">{name}</span>
          <span class="rm-caret" aria-hidden="true"><Icon name="chevronDown" size="s" /></span>
        {/if}
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
    flex: 0 1 auto;
    min-inline-size: 0;
  }

  .rm :global(.menu-trigger) {
    max-inline-size: 100%;
    border-radius: var(--r-ctl);
  }

  /* THE FACE: the record's mark at 20 and its name in the display face at 16/600, a quiet caret after it. */
  .rm-face {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    min-inline-size: 0;
    min-block-size: 36px;
    padding-inline: var(--sp-1) var(--sp-2);
    color: var(--ink);
  }

  .rm[data-bare] .rm-face {
    justify-content: center;
    inline-size: 40px;
    block-size: 40px;
    padding: 0;
  }

  .rm[data-phone] .rm-face {
    min-block-size: var(--tap);
  }

  .rm-word {
    min-inline-size: 0;
    overflow: hidden;
    font-family: var(--font-display);
    font-size: var(--fs-ctl);
    font-weight: var(--fw-semi);
    letter-spacing: -0.01em;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .rm[data-phone] .rm-word {
    font-size: var(--fs-head);
  }

  .rm-caret {
    display: inline-grid;
    flex: none;
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
