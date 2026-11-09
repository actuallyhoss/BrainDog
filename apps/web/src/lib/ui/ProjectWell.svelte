<!--
  A project's mark in its square, drawn by `IconWell`: 40 on its card (`s`), and on
  its page's hero 56, or 48 on a phone (`l` and `xl`).

  THE PROJECT'S COLOUR IS ITS SLOT. Its stored hue picks the nearest of the eight category slots (`slotOf` in
  `face.ts`), and the well is the slot's tint with the mark in the slot's colour, each pair solved to 4.5:1 in light
  and dark. A project with no hue is the neutral slot.

  THE MARK IS `markOf`'s: the glyph the row names when it may be one, else the first letter of the project's name. ITS
  PICTURE, its logo, where it holds one, is drawn in place of either (`IconWell`), and what this tab just wrote to it
  first (`pictureNow`); `change` makes it the picture changer's button where the reader may write the project.
  Decoration: the name is always written beside it, so it is hidden from a screen reader.
-->
<script lang="ts">
  import { markOf } from 'braindog-render';
  import { pictureNow } from '$lib/picture/pictures.svelte.ts';
  import type { PictureTarget } from '$lib/picture/picture.ts';
  import { slotOf } from './face.ts';
  import IconWell from './IconWell.svelte';
  import { isGlyph, type IconName } from './icons.ts';

  let {
    mark,
    name,
    hue,
    size = 's',
    picture = null,
    row,
    change,
  }: {
    mark: string;
    name: string;
    hue: number | null;
    size?: 's' | 'l' | 'xl';
    /** The project's picture, by hash, where it holds one. */
    picture?: string | null | undefined;
    /** The project as every screen names it (`things#3`), so a picture this tab just wrote is drawn here at once. */
    row?: string | null | undefined;
    /** The project, handed where the reader may write it: the well changes its picture. */
    change?: PictureTarget | null | undefined;
  } = $props();

  const said = $derived(markOf(mark, name));
  const glyph = $derived(said !== null && said.length > 1 && isGlyph(said) ? (said as IconName) : undefined);
  const letter = $derived(glyph === undefined && said ? said : undefined);
  const drawn = $derived(row ? pictureNow(row, picture) : picture);
</script>

<IconWell name={glyph} {letter} size={size === 's' ? 'card' : 'xl'} slot={slotOf(hue)} picture={drawn} {change} />
