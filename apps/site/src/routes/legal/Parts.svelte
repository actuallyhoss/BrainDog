<!--
  The trust pages' one skeleton: the night head, then a board of tiles. /support and /legal draw with it.

  THE HEAD IS `PageHead`: the page's name and its one line on the night ground, as every page of the
  site opens. Under it is one flat board (Look B), and every part is a tile on it: flat and opaque, radius 16, no edge
  and no shadow, headed by its glyph and its title.

  ONE FILE FOR THE TRUST PAGES, because they are read and never sold, and a reader arriving from the footer's Trust
  group should meet the same page each time. Each page builds its list of parts from its copy and the launch flags, so
  a part that is not true yet is left out of the list rather than drawn empty.

  THE PROSE IS 16/26 AT A 68CH MEASURE, inside the 45-to-75 band every typographic reference agrees on. A part's
  action is an outlined button and never red: the one solid red a page carries is "Start free".
-->
<script lang="ts" module>
  import type { IconName } from '$lib/icons.ts';

  export type Link = { label: string; href: string };
  export type Part = {
    /** Unique on the page: the heading's id, which the tile is labelled by. */
    id: string;
    title: string;
    glyph?: IconName;
    body?: readonly string[];
    /** One line each, with a hairline between: the checklist on /support. */
    lines?: readonly string[];
    links?: readonly Link[];
    /** The part's one button, drawn under its words. */
    action?: Link;
    /** How many of the twelve columns the part's tile takes at a desk. Twelve when absent. */
    span?: 5 | 6 | 7;
  };
</script>

<script lang="ts">
  import Icon from '$lib/Icon.svelte';
  import PageHead from '$lib/site/PageHead.svelte';
  import type { Snippet } from 'svelte';

  let { title, lede, parts, head }: { title: string; lede?: string; parts: readonly Part[]; head?: Snippet } = $props();

  const external = (href: string): boolean => /^https?:/.test(href);
</script>

<PageHead {title} {...(lede === undefined ? {} : { lead: lede })} {...(head === undefined ? {} : { children: head })} />

<section class="board" aria-label={title}>
  <div class="wrap parts">
    {#each parts as part (part.id)}
      <section
        class="part"
        class:span-5={part.span === 5}
        class:span-6={part.span === 6}
        class:span-7={part.span === 7}
        class:span-12={part.span === undefined}
        aria-labelledby={part.id}
      >
        <h2 class="part-head">
          {#if part.glyph}<span class="glyph"><Icon name={part.glyph} /></span>{/if}
          <span id={part.id}>{part.title}</span>
        </h2>
        {#each part.body ?? [] as paragraph}
          <p class="part-body">{paragraph}</p>
        {/each}
        {#if part.lines?.length}
          <ol class="part-lines">
            {#each part.lines as line, i}
              <li><span class="line-n" aria-hidden="true">{i + 1}</span><span>{line}</span></li>
            {/each}
          </ol>
        {/if}
        {#if part.links?.length}
          <ul class="part-links">
            {#each part.links as link}
              <li>
                <a href={link.href} rel={external(link.href) ? 'external' : undefined}
                  ><span>{link.label}</span><Icon name={external(link.href) ? 'arrow-up-right' : 'arrow'} size="m" /></a
                >
              </li>
            {/each}
          </ul>
        {/if}
        {#if part.action}
          <p class="part-do"><a class="btn line" href={part.action.href}>{part.action.label}</a></p>
        {/if}
      </section>
    {/each}
  </div>
</section>

<style>
  /* THE BOARD: one flat ground under the head, the tiles on it a gap apart. It runs on to the footer with no strip of
     the page's white between: its own padding is the room at the page's end. */
  .board {
    margin-block-end: 0;
    padding-block: var(--first-pad) var(--band-pad);
    background: var(--board);
  }

  /* TWELVE COLUMNS AT A DESK, a part saying how many it takes and each as tall as what it holds: a short part drawn
     as tall as the long one beside it stood mostly empty. One column below 900. */
  .parts {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 16px;
    align-items: start;
  }

  @media (width >= 900px) {
    .parts {
      grid-template-columns: repeat(12, minmax(0, 1fr));
    }

    .span-5 {
      grid-column: span 5;
    }

    .span-6 {
      grid-column: span 6;
    }

    .span-7 {
      grid-column: span 7;
    }

    .span-12 {
      grid-column: span 12;
    }
  }

  /* A TILE: flat and opaque, radius 16, no edge and no shadow, padded as every tile is. */
  .part {
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-inline-size: 0;
    padding: var(--site-tile-pad);
    background: var(--tile);
    border-radius: 16px;
    color: var(--ink);
  }

  .part-head {
    display: flex;
    align-items: center;
    gap: 12px;
    color: var(--ink);
    font-size: var(--t-card);
    line-height: 1.2;
    letter-spacing: -0.02em;
  }

  /* THE GLYPH'S SQUARE: 32 on the board's own fill, at the control radius every well takes. */
  .glyph {
    display: inline-grid;
    flex: none;
    place-items: center;
    inline-size: 32px;
    block-size: 32px;
    background: var(--board);
    border-radius: var(--r-ctl);
    color: var(--ink2);
  }

  .part-body {
    max-inline-size: 68ch;
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-text);
    line-height: 1.6;
    overflow-wrap: anywhere;
    text-wrap: pretty;
  }

  /* A CHECKLIST, a line to an item: a small numbered square and the line, with a hairline between. */
  .part-lines {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .part-lines li {
    display: grid;
    grid-template-columns: 32px minmax(0, 1fr);
    gap: 12px;
    align-items: start;
    padding-block: 12px;
    color: var(--ink);
    font-size: var(--t-text);
    line-height: 1.6;
    overflow-wrap: anywhere;
    text-wrap: pretty;
  }

  /* The line level with its number's square on its first line. */
  .part-lines li > span:last-child {
    padding-block-start: calc((32px - 1.6em) / 2);
  }

  .part-lines li + li {
    border-block-start: 1px solid var(--rule);
  }

  .line-n {
    display: grid;
    place-items: center;
    inline-size: 32px;
    block-size: 32px;
    background: var(--board);
    border-radius: var(--r-ctl);
    color: var(--ink2);
    font-size: var(--t-meta);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  /* LINKS, each a whole target: 44 tall, the words and an arrow saying where it goes. */
  .part-links {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .part-links li + li {
    border-block-start: 1px solid var(--rule);
  }

  .part-links a {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-block-size: var(--tap);
    color: var(--ink);
    font-size: var(--t-text);
    font-weight: 500;
    text-decoration: none;
    overflow-wrap: anywhere;
  }

  @media (hover: hover) {
    .part-links a:hover span {
      text-decoration: underline;
      text-underline-offset: 3px;
    }
  }

  .part-do {
    margin: 4px 0 0;
  }

  /* An address can be long; on a narrow phone it wraps inside its button rather than pushing past the window. */
  .part-do .btn {
    max-inline-size: 100%;
    block-size: auto;
    min-block-size: 48px;
    white-space: normal;
    overflow-wrap: anywhere;
  }

</style>
