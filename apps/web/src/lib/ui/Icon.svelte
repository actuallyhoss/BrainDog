<!--
  About twenty glyphs, inline, `currentColor` only.

  There is no icon component that accepts a `color` prop, because that would be a colour-writing
  component and CI must reject it (22 §9). Size is one of four names, never a number: a literal that
  matches no rule is how an SVG grows to its container.

  Deliberately quiet. The identity in this product is carried by the type, the one red, and the id
  chips — an icon set that also wants attention is one accessory too many.
-->
<script lang="ts" module>
  export const PATHS = {
    home: 'M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-5h-6v5H5a1 1 0 0 1-1-1z',
    decide: 'M12 21v-8m0 0L6 7V3m6 10 6-6V3',
    inbox: 'M5 4h14l2 8v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-7zM3 12h5l1.5 2.5h5L16 12h5',
    search: 'M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14zm5-2 5 5',
    packs: 'M12 3 3 7.5v9L12 21l9-4.5v-9zM3 7.5 12 12l9-4.5M12 12v9',
    vault: 'M12 3 5 6v6c0 4 3 7.5 7 9 4-1.5 7-5 7-9V6zM12 13v3',
    settings: 'M4 7h9m4 0h3M4 12h11m4 0h2M4 17h5m4 0h8',
    plus: 'M12 5v14M5 12h14',
    chevron: 'm9 5 7 7-7 7',
    chevronDown: 'm5 9 7 7 7-7',
    close: 'M6 6l12 12M18 6 6 18',
    check: 'm5 12 5 5L19 6',
    filter: 'M3 5h18l-7 8.2V20l-4-2.2v-4.6z',
    copy: 'M9 9h10v10H9zM15 9V5H5v10h4',
    clock: 'M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zm0-14v5l3 2',
    alert: 'M12 4 2.5 20h19zM12 10v4',
    sun: 'M12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zM12 2v2m0 16v2M4.2 4.2l1.4 1.4m12.8 12.8 1.4 1.4M2 12h2m16 0h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
    moon: 'M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z',
    monitor: 'M3 5h18v11H3zM9 20h6M12 16v4',
    arrow: 'M5 12h14m-6-6 6 6-6 6',
    back: 'M19 12H5m6-6-6 6 6 6',
    external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
    stop: 'M7 7h10v10H7z',
    play: 'M8 5l11 7-11 7z',
  } as const;

  export type IconName = keyof typeof PATHS;
</script>

<script lang="ts">
  let {
    name,
    size = 'm',
    title,
  }: { name: IconName; size?: 's' | 'm' | 'l' | 'xl'; title?: string } = $props();
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
  <path d={PATHS[name]} />
  {#if name === 'vault'}<circle cx="12" cy="10.5" r="1.6" fill="currentColor" stroke="none" />{/if}
  {#if name === 'settings'}
    <circle cx="14.5" cy="7" r="1.7" />
    <circle cx="16.5" cy="12" r="1.7" />
    <circle cx="10.5" cy="17" r="1.7" />
  {/if}
  {#if name === 'alert'}<circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none" />{/if}
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
