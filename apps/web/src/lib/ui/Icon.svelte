<!--
  Draws one glyph, inline, `currentColor` only: the app's own from `icons.ts`, or any of the 251 in
  `braindog-render/glyphs`, resolved in that order by `pathOf`.

  There is no icon component that accepts a `color` prop, because that would be a colour-writing
  component and CI must reject it (22 §9). Size is one of four names, never a number: a literal that
  matches no rule is how an SVG grows to its container.

  The paths themselves are next door and not in this file's module block, so that code which is not
  a component can name an icon without dragging a `.svelte` import into a test runner.
-->
<script lang="ts" module>
  /* The paths live in `icons.ts` so non-component code can read them; see the note there. Imported
     AND re-exported, not bare re-exported: a pass-through `export ... from` puts the names in the
     module's public surface without putting them in its scope, and the markup below needs them. */
  import { PATHS, glyphSet, glyphSetNow, pathOf, type IconName } from './icons.ts';

  export { PATHS, type IconName };
</script>

<script lang="ts">
  let {
    name,
    size = 'm',
    title,
  }: { name: IconName; size?: 's' | 'm' | 'l' | 'xl'; title?: string } = $props();

  /* A NAME ONLY THE SET HOLDS DRAWS NOTHING UNTIL THE SET ARRIVES, then its path. The set is a chunk
     of its own (`glyphs/index.ts` says why), so the first `Icon` to need it starts the fetch and every
     one mounted after it finds the set in hand through `glyphSetNow`. Before this, any name outside
     the app's own map drew `<path>` with no `d`, an empty box, and kept drawing it. */
  let set = $state(glyphSetNow());
  const d = $derived(pathOf(name, set));

  $effect(() => {
    if (d === undefined && set === undefined) void glyphSet().then((arrived) => (set = arrived));
  });
</script>

<svg
  class="icon"
  data-size={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.6"
  stroke-linecap="round"
  stroke-linejoin="round"
  role={title ? 'img' : 'presentation'}
  aria-label={title}
  aria-hidden={title ? undefined : 'true'}
>
  {#if d}<path {d} />{/if}
  {#if name === 'vault'}<circle cx="12" cy="10.5" r="1.6" fill="currentColor" stroke="none" />{/if}
  {#if name === 'settings'}
    <circle cx="14.5" cy="7" r="1.7" />
    <circle cx="16.5" cy="12" r="1.7" />
    <circle cx="10.5" cy="17" r="1.7" />
  {/if}
  {#if name === 'alert'}<circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none" />{/if}
  {#if name === 'money'}
    <circle cx="12" cy="12" r="2.6" />
    <circle cx="6.5" cy="9.5" r="0.7" fill="currentColor" stroke="none" />
    <circle cx="17.5" cy="14.5" r="0.7" fill="currentColor" stroke="none" />
  {/if}
  {#if name === 'tag'}<circle cx="7.2" cy="7.2" r="1.2" fill="currentColor" stroke="none" />{/if}
  <!-- Six dots, drawn as dots. A `M9 5h.01` with a round cap paints a dot in every browser, but a
       real circle is what a screen magnifier resamples cleanly. -->
  {#if name === 'drag'}
    {#each [5, 12, 19] as y}
      <circle cx="9" cy={y} r="1.4" fill="currentColor" stroke="none" />
      <circle cx="15" cy={y} r="1.4" fill="currentColor" stroke="none" />
    {/each}
  {/if}
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
