<!--
  The trust pages' one skeleton: a band of tiles on the ground. /support and /legal draw with it.

  THE LEAD TILE HOLDS THE PAGE'S HEADING, ITS LEDE AND ITS FIRST PART, as every page's opening tile does (SYSTEM §10),
  so the one thing a reader came for is in the first tile and not under a heading on its own. Every part after it is a
  tile of its own, headed by an icon well, the way every tile on the site is headed.

  ONE FILE FOR THE TRUST PAGES, because they are read and never sold, and a reader arriving from the footer's Trust
  group should meet the same page each time. Each page builds its list of parts from its copy and the launch flags, so
  a part that is not true yet is left out of the list rather than drawn empty.

  THE PROSE IS 17/28 AT A 68CH MEASURE, inside the 45-to-75 band every typographic reference agrees on.
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
    /** The page's one filled button, drawn under the part's words. */
    action?: Link;
    /** How many of the twelve columns the part's tile takes at a desk. Twelve when absent. */
    span?: 5 | 6 | 7;
  };
</script>

<script lang="ts">
  import Icon from '$lib/Icon.svelte';

  let { title, lede, parts }: { title: string; lede?: string; parts: readonly Part[] } = $props();

  const first = $derived(parts[0]);
  const rest = $derived(parts.slice(1));
  const span = (p: Part | undefined): string => (p?.span ? `span-${p.span}` : '');
  const external = (href: string): boolean => /^https?:/.test(href);
</script>

{#snippet content(part: Part)}
  {#each part.body ?? [] as paragraph}
    <p class="part-body">{paragraph}</p>
  {/each}
  {#if part.lines?.length}
    <ol class="part-lines">
      {#each part.lines as line, i}
        <li><span class="line-n num" aria-hidden="true">{i + 1}</span><span>{line}</span></li>
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
    <p class="part-do"><a class="btn btn-primary btn-lg" href={part.action.href}>{part.action.label}</a></p>
  {/if}
{/snippet}

<section class="band" aria-labelledby="page-title">
  <div class="in">
    <div class="tiles">
      <article class="tile lead opening {span(first)}">
        <h1 class="h2" id="page-title">{title}</h1>
        {#if lede}<p class="lede">{lede}</p>{/if}
        {#if first}
          <section class="first" aria-labelledby={first.id}>
            <h2 class="tile-head">
              {#if first.glyph}<span class="well"><Icon name={first.glyph} /></span>{/if}
              <span class="tile-title" id={first.id}>{first.title}</span>
            </h2>
            {@render content(first)}
          </section>
        {/if}
      </article>

      {#each rest as part (part.id)}
        <section class="tile lead {span(part)}" aria-labelledby={part.id}>
          <h2 class="tile-head">
            {#if part.glyph}<span class="well"><Icon name={part.glyph} /></span>{/if}
            <span class="tile-title" id={part.id}>{part.title}</span>
          </h2>
          {@render content(part)}
        </section>
      {/each}
    </div>
  </div>
</section>

<style>
  .opening > .lede {
    max-inline-size: 48ch;
  }

  /* THE FIRST PART SITS UNDER A HAIRLINE in the opening tile, so the heading reads as the page's and the part as its first. */
  .first {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    padding-block-start: var(--sp-5);
    border-block-start: 1px solid var(--line);
  }

  .part-body {
    max-inline-size: 68ch;
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-site-body);
    line-height: var(--lh-site-body);
    overflow-wrap: anywhere;
    text-wrap: pretty;
  }

  /* A CHECKLIST, a line to an item: a small numbered well and the line, with a hairline between. */
  .part-lines {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .part-lines li {
    display: grid;
    grid-template-columns: var(--well) minmax(0, 1fr);
    gap: var(--sp-3);
    align-items: start;
    padding-block: var(--sp-3);
    color: var(--ink);
    font-size: var(--t-site-body);
    line-height: var(--lh-site-body);
    overflow-wrap: anywhere;
    text-wrap: pretty;
  }

  .part-lines li + li {
    border-block-start: 1px solid var(--line);
  }

  .line-n {
    display: grid;
    place-items: center;
    inline-size: var(--well);
    block-size: var(--well);
    background: var(--s1);
    border-radius: var(--r-well);
    color: var(--ink2);
    font-size: var(--t-site-small);
    font-weight: 600;
  }

  /* LINKS AS ROWS, each a whole target: 44 tall, the words and an arrow saying where it goes. */
  .part-links {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .part-links li + li {
    border-block-start: 1px solid var(--line);
  }

  .part-links a {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-3);
    min-block-size: var(--tap);
    color: var(--ink);
    font-size: var(--t-site-small);
    font-weight: 500;
    text-decoration: none;
    overflow-wrap: anywhere;
  }

  .part-links a:hover span {
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .part-links a:active {
    opacity: var(--press-dim);
  }

  .part-do {
    margin: var(--sp-2) 0 0;
  }
</style>
