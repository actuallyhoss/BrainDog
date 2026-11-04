<!--
  One card of the store: its icon in its shelf's colour, its name, one or two lines of what it does, then at its foot
  who made it when it is not BrainDog ("Reviewed", or its author), and the one cue: Add, Added, Turn on, Update, or
  "Your starter". A suggested card carries its reason from the record above its foot.

  THE WHOLE CARD IS ONE LINK, to the plugin's own page, where its plan is read before anything changes. The cue names
  that page's press and never installs.
-->
<script lang="ts">
  import { at } from '$lib/at.ts';
  import Icon from '$lib/ui/Icon.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import type { Slot } from '$lib/ui/face.ts';
  import type { IconName } from '$lib/ui/icons.ts';
  import { words } from './words.ts';

  let {
    title,
    line,
    href,
    icon,
    hue,
    by = null,
    ours = false,
    cue,
    held = false,
    why = null,
    note = null,
    badge = null,
  }: {
    title: string;
    line: string;
    href: string;
    icon: IconName;
    /** The shelf's colour, a category slot. */
    hue: Slot;
    /** Who made it, when it is not BrainDog: "Reviewed" or its author. */
    by?: string | null;
    /** Made by BrainDog: said with a check. */
    ours?: boolean;
    cue: string;
    /** Already on this record: the cue is words, not a press. */
    held?: boolean;
    /** Why this record is offered it, from the record itself. */
    why?: string | null;
    /** A short second line under the summary, such as what a starter turns on. */
    note?: string | null;
    /** Where it came from, as a small label in place of who made it: "Made here", "Not reviewed". */
    badge?: { text: string; tone: 'good' | 'warn' | 'info' | null } | null;
  } = $props();
</script>

<li class="store-card">
  <h3 class="sc-name"><IconWell name={icon} size="l" slot={hue} /><span>{title}</span></h3>
  <p class="sc-line">{line}</p>
  {#if note}<p class="sc-note">{note}</p>{/if}
  {#if why}<p class="sc-why"><Icon name="info" size="s" /><span>{why}</span></p>{/if}
  <div class="sc-foot">
    <!-- BRAINDOG'S OWN SAYS NOTHING HERE (3 Nov): "By BrainDog" stood on nearly every card, under a shelf already called
         From BrainDog. Somebody else's names its author, so the one that differs is the one that is said. -->
    {#if badge}
      <span class="pill-badge" data-tone={badge.tone ?? undefined}>{badge.text}</span>
    {:else if by && !ours}
      <span class="sc-by">{by}</span>
    {/if}
    <a class="sc-cue" href={at(href)} data-held={held ? '' : undefined}>{cue}<span class="vh">, {title}</span></a>
  </div>
</li>

<style>
  .store-card {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    min-inline-size: 0;
    padding: var(--sp-4);
    background: var(--tile);
    border-radius: var(--r-tile);
    transition: background var(--d-state) var(--ease-out);
  }

  .sc-name {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-inline-size: 0;
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: var(--fw-semi);
    line-height: calc(22px * var(--type, 1));
  }

  .sc-name span {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* WHAT IT DOES, IN TWO LINES AT MOST. */
  .sc-line {
    display: -webkit-box;
    overflow: hidden;
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: calc(18px * var(--type, 1));
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  .sc-note {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: calc(18px * var(--type, 1));
  }

  /* THE REASON FROM THE RECORD, on the soft well, so it reads as the record speaking and not as the add-on's own words. */
  .sc-why {
    display: flex;
    align-items: flex-start;
    gap: var(--sp-2);
    margin: 0;
    padding: var(--sp-2) var(--sp-3);
    background: var(--tile-2);
    border-radius: var(--r-ctl);
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: calc(18px * var(--type, 1));
  }

  .sc-why :global(.icon) {
    flex: none;
    margin-block-start: 1px;
  }

  .sc-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-2);
    margin-block-start: auto;
    padding-block-start: var(--sp-1);
  }

  .sc-by {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    min-inline-size: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  /* THE CUE: a quiet button whose hit box is the whole card. */
  .sc-cue {
    display: inline-flex;
    flex: none;
    align-items: center;
    margin-inline-start: auto;
    min-block-size: var(--ctl-h);
    padding-inline: var(--sp-3);
    background: var(--soft-fill, var(--tile-2));
    border-radius: var(--r-pill, 999px);
    color: var(--ink);
    font-size: var(--fs-ctl);
    font-weight: var(--fw-medium);
    text-decoration: none;
    white-space: nowrap;
  }

  .sc-cue[data-held] {
    background: none;
    color: var(--ink-3);
  }

  .sc-cue::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: var(--r-tile);
  }

  .sc-cue:focus-visible {
    /* focus-ok: the whole card draws the ring below, since the cue's hit box is the card. */
    outline: none;
  }

  .store-card:has(.sc-cue:focus-visible) {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }

  .vh {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  @media (hover: hover) and (pointer: fine) {
    .store-card:hover .sc-cue:not([data-held]) {
      background: var(--hover);
    }

    .store-card:hover .sc-name span {
      text-decoration: underline;
      text-decoration-color: color-mix(in srgb, var(--ink) 40%, transparent);
      text-underline-offset: 3px;
    }
  }

  @media (pointer: coarse) {
    .sc-cue {
      min-block-size: var(--tap);
    }
  }

  /*
   * ON A PHONE A CARD IS A ROW (1 Nov): its well and name, one line of what it does under them, and the cue at the end,
   * level with both. The foot's "By BrainDog" goes, since the shelf already says who makes it. Forty-six cards of 176px
   * made the store 5,866px tall at 390.
   */
  @media (width < 640px) {
    .store-card {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: var(--sp-1) var(--sp-3);
      padding: var(--sp-3) var(--sp-4);
    }

    .sc-name,
    .sc-line,
    .sc-note,
    .sc-why {
      grid-column: 1;
    }

    .sc-line {
      padding-inline-start: calc(32px + var(--sp-3));
      -webkit-line-clamp: 1;
      line-clamp: 1;
    }

    .sc-note {
      padding-inline-start: calc(32px + var(--sp-3));
    }

    .sc-why {
      grid-column: 1 / -1;
    }

    .sc-foot {
      display: contents;
    }

    .sc-by {
      display: none;
    }

    /* WHERE IT CAME FROM STAYS ON A PHONE, under the line on the text's edge: it is the one thing a made-here card says. */
    .sc-foot > .pill-badge {
      grid-column: 1;
      justify-self: start;
      margin-inline-start: calc(32px + var(--sp-3));
    }

    .sc-cue {
      grid-column: 2;
      grid-row: 1 / span 2;
      margin: 0;
    }
  }
</style>
