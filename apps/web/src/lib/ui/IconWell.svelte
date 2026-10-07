<!--
  An icon in its well: the rounded square that leads a tile's heading, a rail place and a row that is
  not a task or a person. `m` is 28 (a tile heading), `l` is 32 (a row). The icon is
  18 in `--ink2` on `--field`, at the control's 8px corner.

  A TONE IS A MEANING, never decoration. `ink` is the chosen form, the rail's current place: an ink
  fill with the icon in `--on-ink`. `action` is the working accent's tint, for a thing in progress or chosen and a tile of questions waiting on him.
  `danger`, `earn`, `warn` and `live` tint the icon in that intent and fill the well with a 12% tint of it (the `-fill` roles are saturated, so they would draw red on red). Red is for what needs him and nothing else.

  Decorative: the words beside a well say what it means, so the icon is hidden from assistive tech.
-->
<script lang="ts">
  import Icon from './Icon.svelte';
  import type { IconName } from './icons.ts';

  let {
    name,
    size = 'm',
    tone,
  }: {
    name: IconName;
    size?: 'm' | 'l';
    tone?: 'ink' | 'action' | 'danger' | 'earn' | 'live' | 'warn' | undefined;
  } = $props();
</script>

<span class="well" data-size={size} data-tone={tone}><Icon {name} size="l" /></span>

<style>
  .well {
    display: inline-grid;
    place-items: center;
    flex: none;
    inline-size: var(--well);
    block-size: var(--well);
    border-radius: var(--r-ctl);
    background: var(--field);
    color: var(--ink2);
  }
  .well[data-size='l'] {
    inline-size: var(--well-l);
    block-size: var(--well-l);
  }

  /* 18, between the named `--icon-m` (16) and `--icon-l` (20): the design system draws a well's icon at 18. The
     attribute is in the selector so this outranks `Icon`'s own size rule without leaning on source order. */
  .well :global(.icon[data-size]) {
    inline-size: 18px;
    block-size: 18px;
  }

  .well[data-tone='ink'] {
    background: var(--ink);
    color: var(--on-ink);
  }
  .well[data-tone='action'] {
    background: var(--action-tint-1);
    color: var(--action-text);
  }
  .well[data-tone='danger'] {
    background: color-mix(in srgb, var(--danger) 12%, var(--tile));
    color: var(--danger);
  }
  .well[data-tone='earn'] {
    background: color-mix(in srgb, var(--earn) 12%, var(--tile));
    color: var(--earn);
  }
  .well[data-tone='warn'] {
    background: color-mix(in srgb, var(--warn) 12%, var(--tile));
    color: var(--warn);
  }
  .well[data-tone='live'] {
    background: color-mix(in srgb, var(--live) 12%, var(--tile));
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
