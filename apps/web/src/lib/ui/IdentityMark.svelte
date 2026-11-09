<!--
  A thing's mark and its name: the mark in its square (`IconWell`), then the name.

  THE MARK IS `markOf`'s, the same answer the card drawers give (`braindog-render`'s `cards.ts`): the glyph the row's
  mark names when it may be one, else the first letter of the row's own name, so Oxbow.gg with the mark `cake` wears the
  gift and never the "C" of a word. A stored shape (`●`) gives way to the letter too.

  ITS COLOUR IS ITS SLOT. The row's frozen hue picks the nearest of the eight category slots (`slotOf` in `face.ts`),
  each solved to clear 4.5:1 on the tile and on its own tint in light and dark; a retired row is the neutral slot.
  Never the only signal: the name always sits beside it.

  ITS PICTURE, its logo, where the row holds one (`Identity.picture`), is drawn in the well in place of the mark, and
  `change` (handed where the reader may write the row) makes the well the picture changer's button.
-->
<script lang="ts">
  import { markOf } from 'braindog-render';
  import type { PictureTarget } from '$lib/picture/picture.ts';
  import type { Identity } from '../record/api.ts';
  import { slotOf } from './face.ts';
  import IconWell from './IconWell.svelte';
  import { isGlyph, type IconName } from './icons.ts';

  let { identity, size = 'sm', change }: { identity: Identity; size?: 'sm' | 'md'; change?: PictureTarget | null | undefined } = $props();

  const mark = $derived(markOf(identity.mark, identity.name));
  /* A mark longer than one letter is a glyph's name: `markOf` answers a letter or a name the set holds. */
  const glyph = $derived(mark !== null && mark.length > 1 && isGlyph(mark) ? (mark as IconName) : undefined);
  const letter = $derived(glyph === undefined && mark ? mark : undefined);
</script>

<span class="thing" data-size={size} data-retired={identity.retired ? '' : undefined}>
  <IconWell name={glyph} {letter} size={size === 'md' ? 'l' : 'm'} slot={identity.retired ? 'slate' : slotOf(identity.hue)} picture={identity.picture} {change} />
  <span class="name">{identity.name}</span>
</span>

<style>
  .thing {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* A retired row reads as gone: its name in the quiet ink beside the neutral well. */
  .thing[data-retired] .name {
    color: var(--ink-3);
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
</style>
