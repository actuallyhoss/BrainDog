<!--
  Pick a block's glyph from the set, by group: a word to find one, and the glyphs under their group's heading.

  ONE CHOICE, ONE TAB STOP. Each group is a radio group named by its heading, and the glyphs of every group are walked
  as one set: the arrow keys move from the last glyph of a group to the first of the next, Home and End go to the ends,
  and Enter or Space picks. Only the glyph under focus is in the tab order, so Tab leaves the picker in one press.

  THE PICKED ONE CARRIES A MARK AND A WORD, never a colour alone: a check on its tile and the line above the glyphs
  saying "Chosen" and its name. Each glyph is labelled by its name.

  Reached only from `BlockEditor.svelte`, by a dynamic import, so nothing here is in what every screen loads. The groups
  are read by `glyph-pick.ts`, which is tested without this file.
-->
<script lang="ts">
  import { tick } from 'svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import type { IconName } from '$lib/ui/icons.ts';
  import { GLYPH_WORDS, pickerGroups, pickerOrder } from './glyph-pick.ts';

  let {
    value = null,
    onpick,
  }: {
    /** The glyph the block wears now, or `null` for none. */
    value?: string | null;
    /** Called with the glyph picked. */
    onpick: (name: string) => void;
  } = $props();

  const uid = $props.id();

  let query = $state('');
  const groups = $derived(pickerGroups(query));
  const order = $derived(pickerOrder(groups));

  /* THE GLYPH UNDER FOCUS, which is the one tab stop: the picked one when it is shown, else the first. */
  let at = $state<string | null>(null);
  const stop = $derived(at !== null && order.includes(at) ? at : value !== null && order.includes(value) ? value : (order[0] ?? null));

  let grid = $state<HTMLElement | null>(null);

  async function moveTo(name: string) {
    at = name;
    await tick();
    grid?.querySelector<HTMLButtonElement>(`[data-glyph="${CSS.escape(name)}"]`)?.focus();
  }

  function onkey(event: KeyboardEvent, name: string) {
    const i = order.indexOf(name);
    let next: number | null = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = Math.min(order.length - 1, i + 1);
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = Math.max(0, i - 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = order.length - 1;
    else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onpick(name);
      return;
    }
    if (next === null) return;
    event.preventDefault();
    void moveTo(order[next]!);
  }
</script>

<div class="picker">
  <label class="label" for="{uid}-find">{GLYPH_WORDS.find}</label>
  <div class="field">
    <input id="{uid}-find" class="field-input" type="search" bind:value={query} placeholder={GLYPH_WORDS.findHint} autocomplete="off" spellcheck="false" />
  </div>

  {#if value}
    <p class="picked-line"><Icon name="check" size="s" />{GLYPH_WORDS.picked}: <strong>{value}</strong></p>
  {/if}

  {#if groups.length === 0}
    <p class="help" role="status">{GLYPH_WORDS.nothing(query.trim())}</p>
  {:else}
    <div class="groups" bind:this={grid} role="group" aria-label={GLYPH_WORDS.all}>
      {#each groups as group (group.group)}
        <p class="heading" id="{uid}-{group.group}">{group.heading}</p>
        <div class="glyphs" role="radiogroup" aria-labelledby="{uid}-{group.group}">
          {#each group.glyphs as glyph (glyph.name)}
            {@const picked = glyph.name === value}
            <button
              type="button"
              class="glyph"
              role="radio"
              aria-checked={picked ? 'true' : 'false'}
              aria-label={glyph.name}
              title={glyph.aka.length ? `${glyph.name} (${glyph.aka.join(', ')})` : glyph.name}
              tabindex={glyph.name === stop ? 0 : -1}
              data-glyph={glyph.name}
              data-on={picked ? '' : undefined}
              onclick={() => onpick(glyph.name)}
              onfocus={() => (at = glyph.name)}
              onkeydown={(e) => onkey(e, glyph.name)}
            >
              <Icon name={glyph.name as IconName} size="m" />
              {#if picked}<span class="mark"><Icon name="check" size="s" /></span>{/if}
            </button>
          {/each}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .picker {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .label,
  .heading {
    margin: 0;
    color: var(--ink-2);
    font-family: var(--font-ui);
    font-size: var(--fs-meta);
    font-weight: 500;
  }

  .heading {
    margin-block-start: var(--sp-3);
  }

  .help,
  .picked-line {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
  }

  .picked-line {
    display: flex;
    align-items: center;
    gap: var(--sp-1);
    color: var(--ink);
  }

  /* THE GLYPHS SCROLL IN PLACE, so the sheet's Save stays where it was. */
  .groups {
    max-block-size: 22rem;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .glyphs {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(2.75rem, 1fr));
    gap: var(--sp-1);
    margin-block-start: var(--sp-2);
  }

  /* A GLYPH IS A FLAT SQUARE, radius 8 as every button is; the picked one takes the selection wash and a check. */
  .glyph {
    position: relative;
    display: grid;
    place-items: center;
    block-size: 2.75rem;
    padding: 0;
    background: none;
    border: 0;
    border-radius: var(--r-ctl);
    color: var(--ink-2);
    cursor: pointer;
  }

  .glyph:hover {
    background: var(--hover);
    color: var(--ink);
  }

  .glyph[data-on] {
    background: var(--chosen);
    color: var(--link);
  }

  .glyph:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: -2px;
  }

  .mark {
    position: absolute;
    inset-block-start: 2px;
    inset-inline-end: 2px;
    display: grid;
    place-items: center;
    color: var(--red);
  }
</style>
