<!--
  The trust pages' one skeleton: a head band, then one band per part, on the site's two grounds with
  a hairline at each seam.

  ONE FILE FOR /support, /security AND /legal, because the three are read and never sold, and a reader
  arriving from the footer's Trust group should meet the same page three times. Each page builds its
  list of parts from its copy and the launch flags, so a part that is not true yet is left out of the
  list rather than drawn empty.

  THE PROSE KEEPS A 68CH MEASURE inside bands that run the column's width, as /legal always has: inside
  the 45-to-75 band every typographic reference agrees on. At 390 the gutters are the site's `.in`.
-->
<script lang="ts" module>
  export type Link = { label: string; href: string };
  export type Part = {
    /** Unique on the page: the heading's id, which the band is labelled by. */
    id: string;
    title: string;
    body?: readonly string[];
    /** One line each, with a hairline between: the facts on /security, the checklist on /support. */
    lines?: readonly string[];
    links?: readonly Link[];
  };
</script>

<script lang="ts">
  let { title, lede, parts }: { title: string; lede?: string; parts: readonly Part[] } = $props();
</script>

<section class="band head" data-ground="sunk">
  <div class="in">
    <h1 class="title">{title}</h1>
    {#if lede}
      <p class="lede">{lede}</p>
    {/if}
  </div>
</section>

{#each parts as part, i (part.id)}
  <section class="band" data-ground={i % 2 === 0 ? 'page' : 'sunk'} aria-labelledby={part.id}>
    <div class="in part">
      <h2 class="part-title" id={part.id}>{part.title}</h2>
      {#each part.body ?? [] as paragraph}
        <p class="part-body">{paragraph}</p>
      {/each}
      {#if part.lines?.length}
        <ul class="part-lines">
          {#each part.lines as line}
            <li>{line}</li>
          {/each}
        </ul>
      {/if}
      {#if part.links?.length}
        <ul class="part-links">
          {#each part.links as link}
            <li><a href={link.href}>{link.label}</a></li>
          {/each}
        </ul>
      {/if}
    </div>
  </section>
{/each}

<style>
  /* The same air the other pages' bands carry. The head takes less at the top because the header
     above it already has its own. */
  .band {
    padding-block: var(--sp-8);
  }

  .band + .band {
    border-block-start: 1px solid var(--line);
  }

  .head {
    padding-block: var(--sp-7) var(--sp-8);
  }

  .title {
    font-family: var(--font-display);
    font-size: clamp(2.375rem, 4.7vw, 4.25rem);
    font-weight: 600;
    line-height: 1.04;
    letter-spacing: -0.04em;
    text-wrap: balance;
  }

  .lede {
    max-inline-size: 68ch;
    margin-block-start: var(--sp-4);
    color: var(--ink2);
    font-size: var(--t-md);
    line-height: 1.5;
    text-wrap: pretty;
  }

  .part {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .part > * {
    max-inline-size: 68ch;
  }

  .part-title {
    max-inline-size: none;
    font-size: var(--t-lg);
    font-weight: 600;
    line-height: var(--lh-tight);
    letter-spacing: var(--tr-tight);
  }

  .part-body {
    color: var(--ink2);
    font-size: var(--t-base);
    line-height: 1.6;
    text-wrap: pretty;
  }

  /* A fact to a line, as the brief for /security asks: a hairline between lines and none around the
     list, like every list on the site. An address inside a line wraps rather than pushing sideways. */
  .part-lines {
    margin: 0;
    /* `padding-inline: 0` is load-bearing: base.css resets a list's MARGIN and not its padding. */
    padding-inline: 0;
    list-style: none;
  }

  .part-lines li {
    padding-block: var(--sp-3);
    color: var(--ink);
    font-size: var(--t-base);
    line-height: 1.55;
    overflow-wrap: anywhere;
    text-wrap: pretty;
  }

  .part-lines li + li {
    border-block-start: 1px solid var(--line-soft);
  }

  .part-links {
    display: flex;
    flex-wrap: wrap;
    gap: 0 var(--sp-5);
    margin: 0;
    padding-inline: 0;
    list-style: none;
  }

  /* 36 under a mouse and 44 under a thumb, like every other row of links on this site. An address
     is one long word, so it may break anywhere before it pushes the page sideways at 320. */
  .part-links a {
    display: inline-flex;
    align-items: center;
    min-block-size: var(--ctl-h);
    color: var(--ink);
    font-size: var(--t-base);
    font-weight: 500;
    text-decoration: underline;
    text-underline-offset: 3px;
    overflow-wrap: anywhere;
  }

  .part-links a:active {
    opacity: var(--press-dim);
  }

  @media (width < 640px) {
    .band {
      padding-block: var(--sp-7);
    }
  }
</style>
