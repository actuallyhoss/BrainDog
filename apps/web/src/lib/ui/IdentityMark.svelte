<!--
  A thing's mark: its picture or its letter, one frozen hue, and the name beside it.

  THE MARK IS `markOf`'s, the same answer the card drawers give (`braindog-render`'s `cards.ts`): the glyph the
  row's mark names when it may be one, else the first letter of the row's own name, so Crumb.gg with the mark
  `cake` wears the gift and never the "C" of a word. A stored shape (`●`) gives way to the letter too.

  The hue is the ONE non-token colour the rendered-DOM gate admits, and only here: `oklch(L C h)`
  where `h` is the row's frozen `identity.accent` and `L`/`C` are the theme's two mark constants,
  `0.72 0.12` in dark and `0.55 0.09` in light. Chosen so every hue at that lightness is inside sRGB
  and clears 3:1 on every surface (13 §2.1b, 22 §7 gate 3).

  Never the only signal. The name always sits beside it, and past four marks the name is what
  carries identity anyway — which is why the generator stops looking for a fifth colour and starts
  trusting the word.
-->
<script lang="ts">
  import { markOf } from 'braindog-render';
  import type { Identity } from '../record/api.ts';
  import Icon from './Icon.svelte';
  import { isGlyph } from './icons.ts';

  let { identity, size = 'sm' }: { identity: Identity; size?: 'sm' | 'md' } = $props();

  const mark = $derived(markOf(identity.mark, identity.name));
  /* A mark longer than one letter is a glyph's name: `markOf` answers a letter or a name the set holds. */
  const glyph = $derived(mark !== null && mark.length > 1 && isGlyph(mark) ? mark : null);
</script>

<span class="thing" data-size={size} data-retired={identity.retired ? '' : undefined}>
  <span class="mark" data-shape={identity.mark} data-glyph={glyph ?? undefined} style="--hue:{identity.hue}" aria-hidden="true"
    >{#if glyph}<Icon name={glyph} size={size === 'md' ? 'l' : 'm'} />{:else if mark}{mark}{/if}</span
  >
  <span class="name">{identity.name}</span>
</span>

<style>
  .thing {
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
    min-inline-size: 0;
  }

  /* ONE SQUARE SLOT FOR A PICTURE OR A LETTER, so names beside marks start on one edge whichever a row has. */
  .mark {
    display: inline-grid;
    place-items: center;
    inline-size: var(--icon-m);
    block-size: var(--icon-m);
    color: oklch(var(--mark-l) var(--mark-c) var(--hue));
    font-size: var(--t-sm);
    font-weight: 600;
    line-height: 1;
    align-self: center;
    flex: none;
  }

  /* A retired row is achromatic. */
  .thing[data-retired] .mark {
    color: var(--dim);
  }

  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* IT IS A NAME, SO IT WRAPS RATHER THAN LOSING ITS END. At 320 `Marlow & Co` came back as
     `Marlow & C` — a project's name, one character short, on the row that is about that project. */
  @media (width < 400px) {
    .name {
      overflow: visible;
      text-overflow: clip;
      white-space: normal;
    }
  }

  .thing[data-size='md'] .mark {
    inline-size: var(--icon-l);
    block-size: var(--icon-l);
    font-size: var(--t-base);
  }
</style>
