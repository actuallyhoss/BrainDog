<!--
  An icon in its well: the rounded square that leads a tile's heading, a rail place and a row that is
  not a task or a person (SYSTEM §6, §12.2). `m` is 28 (a tile heading), `l` is 32 (a row). The icon is
  18 in `--ink2` on `--s1`.

  A TONE IS A MEANING, never decoration. `ink` is the chosen form, the rail's current place: an ink
  fill with the icon in `--on-ink`. `danger`, `earn`, `warn` and `live` tint the icon in that intent and
  fill the well with a 12% tint of it (the `-fill` roles are saturated, so they would draw red on red). Red is for what needs him and nothing else (SYSTEM §2).

  Decorative: the words beside a well say what it means, so the icon is hidden from assistive tech.
-->
<script lang="ts">
  import Icon from './Icon.svelte';
  import type { IconName } from './icons.ts';

  let {
    name,
    size = 'm',
    tone,
  }: { name: IconName; size?: 'm' | 'l'; tone?: 'ink' | 'danger' | 'earn' | 'live' | 'warn' | undefined } = $props();
</script>

<span class="well" data-size={size} data-tone={tone}><Icon {name} size="l" /></span>

<style>
  .well {
    display: inline-grid;
    place-items: center;
    flex: none;
    inline-size: var(--well);
    block-size: var(--well);
    border-radius: var(--r-well);
    background: var(--s1);
    color: var(--ink2);
  }
  .well[data-size='l'] {
    inline-size: var(--well-l);
    block-size: var(--well-l);
  }

  /* 18, between the named `--icon-m` (16) and `--icon-l` (20): SYSTEM §6 draws a well's icon at 18. The
     attribute is in the selector so this outranks `Icon`'s own size rule without leaning on source order. */
  .well :global(.icon[data-size]) {
    inline-size: 18px;
    block-size: 18px;
  }

  .well[data-tone='ink'] {
    background: var(--ink);
    color: var(--on-ink);
  }
  .well[data-tone='danger'] {
    background: color-mix(in srgb, var(--danger) 12%, var(--bg));
    color: var(--danger);
  }
  .well[data-tone='earn'] {
    background: color-mix(in srgb, var(--earn) 12%, var(--bg));
    color: var(--earn);
  }
  .well[data-tone='warn'] {
    background: color-mix(in srgb, var(--warn) 12%, var(--bg));
    color: var(--warn);
  }
  .well[data-tone='live'] {
    background: color-mix(in srgb, var(--live) 12%, var(--bg));
    color: var(--live);
  }

  /* Forced colours drop the fill, so the chosen well keeps an edge to be told from the rest by. */
  @media (forced-colors: active) {
    .well[data-tone='ink'] {
      outline: 1px solid CanvasText;
      outline-offset: -1px;
    }
  }
</style>
