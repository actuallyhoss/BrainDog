<!--
  SEVERAL LINKED THINGS, ONE CHIP EACH, WRAPPING (ui-perfect, 3 Nov): what an add-on may read, the projects a person is
  on, the lists a key reaches. Never "Lists: Mail, Events." as a sentence.

    <ChipList items={[{ label: 'Mail', href: '/r/mail', icon: 'mail' }, { label: 'Events', href: '/r/events' }]} />
    <ChipList items={names.map((label) => ({ label }))} label="Lists it reads" most={6} />

  A list (`ul`), so a screen reader counts them; `label` names it when nothing on screen does. Chips 8 apart both ways,
  wrapping onto as many lines as they need and never past the card's edge. `most` draws that many and a "N more" chip
  that opens the rest in place. `empty` is the line drawn when there are none (nothing at all when absent).
-->
<script lang="ts">
  import type { Tone } from 'braindog-render';
  import Chip from './Chip.svelte';
  import type { IconName } from './icons.ts';

  type Item = { label: string; href?: string | undefined; icon?: IconName | undefined; tone?: Tone | undefined; key?: string | undefined };

  let {
    items,
    label,
    most,
    empty,
  }: {
    items: readonly Item[];
    /** The list's name for a screen reader, when no heading on screen names it. */
    label?: string | undefined;
    /** How many to draw before a "N more" chip. All when absent. */
    most?: number | undefined;
    /** Said when there are none. */
    empty?: string | undefined;
  } = $props();

  let all = $state(false);
  const shown = $derived(all || most === undefined || items.length <= most + 1 ? items : items.slice(0, most));
  const rest = $derived(items.length - shown.length);
</script>

{#if items.length === 0}
  {#if empty}<p class="chips-none">{empty}</p>{/if}
{:else}
  <ul class="chips" aria-label={label}>
    {#each shown as item, i (item.key ?? `${item.href ?? ''}|${item.label}|${i}`)}
      <li><Chip label={item.label} href={item.href} icon={item.icon} tone={item.tone} /></li>
    {/each}
    {#if rest > 0}
      <li><button type="button" class="chips-more tap" onclick={() => (all = true)}>{rest.toLocaleString('en-GB')} more</button></li>
    {/if}
  </ul>
{/if}

<style>
  .chips {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
    min-inline-size: 0;
    max-inline-size: 100%;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .chips > li {
    display: flex;
    min-inline-size: 0;
    max-inline-size: 100%;
  }

  .chips-more {
    box-sizing: border-box;
    min-block-size: var(--btn-h-sm);
    padding-inline: var(--ctl-pad-sm, 12px);
    border: 0;
    border-radius: var(--r-pill);
    background: none;
    color: var(--ink-2);
    font: inherit;
    font-size: var(--fs-ctl);
    font-weight: var(--fw-medium);
    cursor: pointer;
  }

  @media (hover: hover) and (pointer: fine) {
    .chips-more:hover {
      background: var(--row-wash);
      color: var(--ink);
    }
  }

  .chips-none {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }
</style>
