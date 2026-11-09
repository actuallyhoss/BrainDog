<!--
  Draws one glyph, inline, `currentColor` only: the app's own from `icons.ts`, or any of the 251 in
  `braindog-render/glyphs`, resolved in that order by `shapesOf`.

  Stroke 1.75 with round caps and joins, for every glyph alike: the app's own (the design system's icon shapes)
  and a Lucide glyph a record names through `icon:`. A glyph is paths, circles,
  ellipses and rounded rects, drawn as the elements they are; a dot is a zero-length path with a round
  cap, and `more` and `drag` carry their own heavier stroke for it.

  There is no icon component that accepts a `color` prop, because that would be a colour-writing
  component and CI must reject it (22 §9). Size is one of four names, never a number: a literal that
  matches no rule is how an SVG grows to its container.

  The shapes themselves are next door and not in this file's module block, so that code which is not
  a component can name an icon without dragging a `.svelte` import into a test runner.
-->
<script lang="ts" module>
  /* The shapes live in `icons.ts` so non-component code can read them; see the note there. Imported
     AND re-exported, not bare re-exported: a pass-through `export ... from` puts the names in the
     module's public surface without putting them in its scope, and the markup below needs them. */
  import { PATHS, glyphSet, glyphSetNow, shapesOf, type IconName } from './icons.ts';

  export { PATHS, type IconName };

  /* A GLYPH THAT POINTS ALONG THE LINE TURNS WITH IT: under right-to-left "next" points left. `a11y.css` does the turning
     (`data-along`), so it holds for every arrow in the product and no screen needs its own rule. */
  const ALONG: ReadonlySet<string> = new Set(['chevron', 'arrow', 'back', 'arrow-right', 'arrow-left', 'chevron-right', 'chevron-left']);
</script>

<script lang="ts">
  let {
    name,
    size = 'm',
    title,
  }: { name: IconName; size?: 's' | 'm' | 'l' | 'xl'; title?: string } = $props();

  /* A NAME ONLY THE SET HOLDS DRAWS NOTHING UNTIL THE SET ARRIVES, then its path. The set is a chunk
     of its own (`glyphs/index.ts` says why), so the first `Icon` to need it starts the fetch and every
     one mounted after it finds the set in hand through `glyphSetNow`. */
  let set = $state(glyphSetNow());
  const shapes = $derived(shapesOf(name, set));

  $effect(() => {
    if (shapes === undefined && set === undefined) void glyphSet().then((arrived) => (set = arrived));
  });
</script>

<svg
  class="icon"
  data-icon={name}
  data-size={size}
  data-along={ALONG.has(name) ? '' : undefined}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.75"
  stroke-linecap="round"
  stroke-linejoin="round"
  role={title ? 'img' : 'presentation'}
  aria-label={title}
  aria-hidden={title ? undefined : 'true'}
>
  {#each shapes ?? [] as s, i (i)}
    {#if s.tag === 'circle'}
      <circle cx={s.attrs.cx} cy={s.attrs.cy} r={s.attrs.r} />
    {:else if s.tag === 'ellipse'}
      <ellipse cx={s.attrs.cx} cy={s.attrs.cy} rx={s.attrs.rx} ry={s.attrs.ry} />
    {:else if s.tag === 'rect'}
      <rect x={s.attrs.x} y={s.attrs.y} width={s.attrs.width} height={s.attrs.height} rx={s.attrs.rx} />
    {:else}
      <path d={s.attrs.d} stroke-width={s.attrs['stroke-width']} />
    {/if}
  {/each}
</svg>

<style>
  .icon {
    flex: none;
    display: block;
  }

  .icon[data-size='s'] {
    inline-size: var(--icon-s);
    block-size: var(--icon-s);
  }
  .icon[data-size='m'] {
    inline-size: var(--icon-m);
    block-size: var(--icon-m);
  }
  .icon[data-size='l'] {
    inline-size: var(--icon-l);
    block-size: var(--icon-l);
  }
  .icon[data-size='xl'] {
    inline-size: var(--icon-xl);
    block-size: var(--icon-xl);
  }
</style>
