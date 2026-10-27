<!--
  A project's mark in its square, drawn by `IconWell`: 40 on its card (`s`), and on
  its page's hero 56, or 48 on a phone (`l` and `xl`).

  THE PROJECT'S COLOUR IS ITS SLOT. Its stored hue picks the nearest of the eight category slots (`slotOf` in
  `face.ts`), and the well is the slot's tint with the mark in the slot's colour, each pair solved to 4.5:1 in light
  and dark. A project with no hue is the neutral slot.

  THE MARK IS `markOf`'s: the glyph the row names when it may be one, else the first letter of the project's name.
  Decoration: the name is always written beside it, so it is hidden from a screen reader.
-->
<script lang="ts">
  import { markOf } from 'braindog-render';
  import { slotOf } from './face.ts';
  import IconWell from './IconWell.svelte';
  import { isGlyph, type IconName } from './icons.ts';

  let { mark, name, hue, size = 's' }: { mark: string; name: string; hue: number | null; size?: 's' | 'l' | 'xl' } = $props();

  const said = $derived(markOf(mark, name));
  const glyph = $derived(said !== null && said.length > 1 && isGlyph(said) ? (said as IconName) : undefined);
  const letter = $derived(glyph === undefined && said ? said : undefined);
</script>

<IconWell name={glyph} {letter} size={size === 's' ? 'card' : 'xl'} slot={slotOf(hue)} />
