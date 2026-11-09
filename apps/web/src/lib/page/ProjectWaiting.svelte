<!--
  A PROJECT'S PAGE WHILE IT IS READ, IN THE PROJECT'S OWN SHAPE (F4 and fluid F2): its hero as it
  will land, the well with its mark in its colour and its name where the hero puts it, then the frames of the tiles under
  it. What is known is drawn (the sidebar and the Projects cards already hold the name, the mark and the colour); only
  what the record has yet to say is a bar.

  ONE PICTURE FROM THE PRESS TO THE PAGE. Before this a big project opened from Projects drew a blank board, a list
  skeleton that looked nothing like a project, the blank board again, and only then the project. The page's read and
  the shape's read both draw this, so the second loader under the first is the same picture, never a blank between.

  AT ONCE, NOT AFTER 300ms as `Waiting`'s bars come: it carries the project's own name, so it is no flash of shapes.
  THE NAME IS THE PAGE'S `h1` from the first paint (a headless head draws none, and the hero's own `h1` waits on the
  read), so a page caught while it waits still has its heading.
  `role="status"` with the hidden word and `aria-busy`, as `Waiting` says it, so the screen is not called drawn.
-->
<script lang="ts">
  import { copy } from '$lib/copy.ts';
  import { slotStyle } from '$lib/home/project-cards.ts';
  import ProjectWell from '$lib/ui/ProjectWell.svelte';
  import { REGISTERS } from '$lib/record/held.ts';
  import { laneLabelsOf, laneSaid } from '$lib/shell/side.ts';
  import type { KnownProject } from './known-project.ts';

  let { project, tiles = 3 }: { project: KnownProject; tiles?: number } = $props();

  /* ITS LANE AS THE HERO WILL SAY IT, in its list's own words (`laneSaid`): Personal's page opened on "Building" and
     landed on "Active". */
  const lane = $derived(laneSaid(laneLabelsOf(project.list ? REGISTERS[project.list] : undefined), project.lane));

  /* The tiles' own lines, of different lengths, so the frames read as tiles of words and not as a list. */
  const LINES = [
    ['38%', '72%', '54%'],
    ['44%', '63%'],
    ['31%', '58%', '47%', '66%'],
  ];
</script>

<div class="pw" data-shape-waiting role="status" aria-busy="true">
  <span class="said">{copy.waiting}</span>
  <section class="pw-hero" style={slotStyle(project.hue)}>
    <span class="pw-well" aria-hidden="true"><ProjectWell mark={project.mark} name={project.name} hue={project.hue} size="xl" picture={project.picture ?? null} /></span>
    <div class="pw-name">
      <h1 class="pw-title" dir="auto">{project.name}</h1>
      {#if project.lane}<p class="pw-status">{lane}</p>{:else}<span class="bar status"></span>{/if}
    </div>
    <span class="bar news" aria-hidden="true"></span>
  </section>
  {#each { length: tiles } as _, i}
    <div class="pw-tile" aria-hidden="true">
      <span class="pw-head"><span class="well"></span><span class="bar head"></span></span>
      {#each LINES[i % LINES.length]! as w}<span class="bar" style:inline-size={w}></span>{/each}
    </div>
  {/each}
</div>

<style>
  .pw {
    display: grid;
    gap: var(--tile-gap);
  }

  /* THE HERO'S OWN GEOMETRY (`ProjectPart`'s `.hero`): the well, the name at the page's size in the display face, where
     it stands under it, and the line of news across, over the project's colour at its low tint. */
  .pw-hero {
    --ph: var(--ink);
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: var(--sp-3);
    align-items: center;
    padding: var(--sp-4);
    border-radius: var(--r-tile);
    background: color-mix(in oklab, var(--ph) 8%, var(--tile));
  }

  .pw-well {
    display: grid;
  }

  .pw-name {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-inline-size: 0;
  }

  .pw-title {
    min-inline-size: 0;
    margin: 0;
    overflow: hidden;
    color: var(--ink);
    font-family: var(--font-display);
    font-size: var(--fs-page);
    font-weight: 600;
    letter-spacing: -0.02em;
    line-height: calc(34px * var(--type, 1));
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pw-status {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: calc(18px * var(--type, 1));
  }

  .pw-tile {
    display: grid;
    gap: var(--sp-3);
    padding: var(--tile-pad);
    border-radius: var(--r-tile);
    background: var(--tile);
  }

  .pw-head {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-block-size: var(--well);
  }

  .well {
    flex: none;
    inline-size: var(--well);
    block-size: var(--well);
    border-radius: var(--r-ctl);
    background: color-mix(in oklab, var(--ink) 6%, transparent);
  }

  .bar {
    display: block;
    block-size: 10px;
    border-radius: var(--r-xs);
    background: color-mix(in oklab, var(--ink) 9%, transparent);
  }

  .bar.head {
    inline-size: min(180px, 40%);
    block-size: 12px;
  }

  .bar.status {
    inline-size: min(120px, 40%);
  }

  .bar.news {
    grid-column: 1 / -1;
    inline-size: min(420px, 70%);
    block-size: 14px;
  }

  .said {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* SIXTEEN ON A PHONE, as a tile's padding is; wider, the hero's 24 and its name at the hero's size. */
  @media (width < 640px) {
    .pw-tile {
      padding: var(--sp-4);
    }
  }

  @media (width >= 640px) {
    .pw-hero {
      padding: var(--sp-5);
    }

    .pw-title {
      font-size: var(--fs-hero);
      line-height: calc(40px * var(--type, 1));
    }
  }
</style>
