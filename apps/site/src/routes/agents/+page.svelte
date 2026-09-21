<!--
  For agents and services.

  THE PAGE THE HOME PAGE'S TECHNICAL MATERIAL MOVED TO. `loop/DIRECTION.md` §19 is the owner's own
  instruction: the counted figures and the tool grid come off the home page, and what is worth
  keeping goes on a page a curious reader reaches on purpose. For one hour on 21 September there was
  no such page and the material sat in `copy.ts` comments, drawn nowhere.

  IT COUNTS THINGS, AND THAT IS THE POINT OF IT. The rule that a figure must not be counted at a
  stranger is a rule about a stranger: somebody who arrived at a headline and is being shown a
  number they did not ask for. A reader who opens a page called For agents has asked. Every figure
  here is read off a declaration and the file it came from is in the comment beside its copy.

  NO PICTURES. The other pages carry the product's own screens because a screen is the argument
  there. The argument here is a list of names and limits, and a screenshot of a terminal would be a
  decoration standing where the reader wants a specification.
-->
<script lang="ts">
  import { SOURCE, site } from '$lib/copy.ts';

  const a = site.agents;
</script>

<svelte:head>
  <title>{site.meta.agents.title}</title>
  <meta name="description" content={site.meta.agents.description} />
  <link rel="canonical" href="https://brain.dog/agents" />
  <meta property="og:url" content="https://brain.dog/agents" />
  <meta property="og:title" content={site.meta.agents.title} />
  <meta property="og:description" content={site.meta.agents.description} />
</svelte:head>

<section class="band head" data-ground="page">
  <div class="in">
    <p class="band-mark">
      <span class="band-seq">0001</span>
      <span class="band-rule"></span>
      <span class="band-tag">{a.tag}</span>
    </p>
    <h1 class="display">{a.title}</h1>
    <p class="lead">{a.lead}</p>
  </div>
</section>

<section class="band" data-ground="sunk" aria-labelledby="mcp-title">
  <div class="in">
    <p class="band-mark">
      <span class="band-seq">0002</span>
      <span class="band-rule"></span>
      <span class="band-tag">{a.mcp.tag}</span>
    </p>
    <h2 class="title" id="mcp-title">{a.mcp.title}</h2>
    <p class="lead">{a.mcp.lead}</p>

    <div class="sets">
      <div class="set">
        <h3 class="set-title">{a.mcp.readsTitle}</h3>
        <ul class="names">
          {#each a.mcp.reads as name (name)}<li class="name mono">{name}</li>{/each}
        </ul>
      </div>
      <div class="set">
        <h3 class="set-title">{a.mcp.writesTitle}</h3>
        <ul class="names">
          {#each a.mcp.writes as name (name)}<li class="name mono">{name}</li>{/each}
        </ul>
      </div>
    </div>

    <h3 class="set-title wide">{a.mcp.resourcesTitle}</h3>
    <dl class="rows">
      {#each a.mcp.resources as one (one.uri)}
        <div class="row">
          <dt class="mono">{one.uri}</dt>
          <dd>{one.said}</dd>
        </div>
      {/each}
    </dl>
  </div>
</section>

<section class="band" data-ground="page" aria-labelledby="report-title">
  <div class="in">
    <p class="band-mark">
      <span class="band-seq">0003</span>
      <span class="band-rule"></span>
      <span class="band-tag">{a.report.tag}</span>
    </p>
    <h2 class="title" id="report-title">{a.report.title}</h2>
    <p class="lead">{a.report.lead}</p>
    <dl class="rows">
      {#each a.report.limits as limit (limit.what)}
        <div class="row">
          <dt>{limit.what}</dt>
          <dd>{limit.said}</dd>
        </div>
      {/each}
    </dl>
  </div>
</section>

<section class="band" data-ground="sunk" aria-labelledby="cannot-title">
  <div class="in">
    <p class="band-mark">
      <span class="band-seq">0004</span>
      <span class="band-rule"></span>
      <span class="band-tag">{a.cannot.tag}</span>
    </p>
    <h2 class="title" id="cannot-title">{a.cannot.title}</h2>
    <p class="lead">{a.cannot.lead}</p>
    <dl class="rows">
      {#each a.cannot.rows as one (one.what)}
        <div class="row">
          <dt>{one.what}</dt>
          <dd>{one.said}</dd>
        </div>
      {/each}
    </dl>
    {#if SOURCE}
      <p class="source"><a href={SOURCE}>{site.nav.source}</a></p>
    {/if}
  </div>
</section>

<style>
  .band {
    padding-block: var(--sp-8);
  }

  /* The seam the other pages draw, for the reason the pricing page records: `--sunk` against `--bg`
     is 1.07:1, which the eye adapts to rather than reads as an edge. */
  .band + .band {
    border-block-start: 1px solid var(--line);
  }

  .head {
    padding-block: var(--sp-7) var(--sp-8);
  }

  .lead {
    max-inline-size: 62ch;
    margin-block-start: var(--sp-4);
    color: var(--ink2);
  }

  .title {
    margin-block-start: var(--sp-4);
  }

  /* TWO COLUMNS AND NOT SIXTEEN CHIPS IN A GRID. The grid on the home page was the shape the owner
     called an ai-looking stat: a wall of names with no claim on it. Split by what they do, the same
     names make one, which is that two thirds of the surface cannot change anything. */
  .sets {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 22ch), 1fr));
    gap: var(--sp-6);
    margin-block-start: var(--sp-6);
  }

  .set-title {
    font-size: var(--t-sm);
    color: var(--ink2);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .set-title.wide {
    margin-block-start: var(--sp-7);
  }

  .names {
    list-style: none;
    margin: var(--sp-3) 0 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  .name {
    border: 1px solid var(--line);
    border-radius: var(--r-lg);
    padding: var(--sp-1) var(--sp-3);
    font-size: var(--t-sm);
  }

  .rows {
    margin: var(--sp-4) 0 0;
    border-block-start: 1px solid var(--line);
  }

  .row {
    display: grid;
    grid-template-columns: minmax(0, 20ch) minmax(0, 1fr);
    gap: var(--sp-5);
    padding-block: var(--sp-4);
    border-block-end: 1px solid var(--line);
  }

  .row dt {
    font-weight: 600;
  }

  .row dd {
    margin: 0;
    color: var(--ink2);
  }

  .source {
    margin-block-start: var(--sp-6);
  }

  @media (width < 760px) {
    .row {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--sp-2);
    }
  }
</style>
