<!--
  The trust pages' one skeleton: the head, then the app's tiles. /support and /legal draw with it.

  THE HEAD IS `PageHead`: the page's name and its one line on the board, as every page of the site opens (the redo of
  2 November). Under it every part is one of the app's tiles: flat and opaque, radius 16, no edge and no shadow,
  headed the app's way, its glyph in a well and its name at 17/600.

  ONE FILE FOR THE TRUST PAGES, because they are read and never sold, and a reader arriving from the footer's Trust
  group should meet the same page each time. Each page builds its list of parts from its copy and the launch flags, so
  a part that is not true yet is left out of the list rather than drawn empty.

  THE PROSE IS 16/26 AT A 68CH MEASURE, inside the 45-to-75 band every typographic reference agrees on. A part's
  action is a plain button and never red: red is kept for the start button.
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
        class="tile lead part"
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
          <p class="part-do"><a class="btn" href={part.action.href}>{part.action.label}</a></p>
        {/if}
      </section>
    {/each}
  </div>
</section>

<style>
  /* THE BOARD: one flat ground under the head, the tiles on it a gap apart. It runs on to the footer with no strip of
     the page's white between: its own padding is the room at the page's end. */
  .board {
    padding-block: clamp(32px, 2vw + 24px, 48px) clamp(48px, 4vw + 32px, 96px);
  }

  /* TWELVE COLUMNS AT A DESK, a part saying how many it takes; one column below 900. */
  .parts {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--tile-gap);
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

  /* A TILE (`app.css`): flat and opaque, radius 16, no edge and no shadow. */
  .part {
    gap: var(--sp-4);
  }

  /* THE APP'S HEADING ROW: the glyph in its well and the name at 17/600. */
  .part-head {
    display: flex;
    align-items: center;
    gap: 12px;
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--fs-head);
    line-height: 24px;
  }

  .glyph {
    display: inline-grid;
    flex: none;
    place-items: center;
    inline-size: var(--well-l);
    block-size: var(--well-l);
    background: var(--tile-2);
    border-radius: var(--r-ctl);
    color: var(--ink-2);
  }

  .part-body {
    max-inline-size: 68ch;
    margin: 0;
    color: var(--ink-2);
    font-size: var(--t-site-body);
    line-height: var(--lh-site-body);
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
    font-size: var(--t-site-body);
    line-height: var(--lh-site-body);
    overflow-wrap: anywhere;
    text-wrap: pretty;
  }

  .part-lines li + li {
    border-block-start: 1px solid var(--rule);
  }

  .line-n {
    display: grid;
    place-items: center;
    inline-size: 32px;
    block-size: 32px;
    background: var(--tile-2);
    border-radius: var(--r-ctl);
    color: var(--ink-2);
    font-size: var(--t-site-small);
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
    font-size: var(--t-site-16);
    font-weight: 500;
    text-decoration: none;
    overflow-wrap: anywhere;
  }

  .part-links a:hover span {
    text-decoration: underline;
    text-underline-offset: 3px;
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
