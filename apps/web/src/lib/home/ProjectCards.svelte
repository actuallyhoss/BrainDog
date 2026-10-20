<!--
  The projects that are live, as cards on Today (Today as the desk; the UI pass of 20 October, today F16, proj section 4).

  ONE CARD EVERYWHERE: each live project is `ui/ProjectCard.svelte`, the card Projects draws too, in the one grid (four
  across from 1280, three from 1024, two from 640, one below), and the whole card opens the project's page. A row of
  three ends short rather than stretching, so a card is the same width here as on Projects. Only a draft the record
  formed is drawn here, with its two presses.

  ITS HEAD IS A TILE'S HEAD ON THE BOARD: the grid's glyph in a neutral well, "Projects" and how many, the lanes as one
  segmented control ("In play 3", "Earning 2", "Building 1"), and "All projects" at the end. NOTHING IS DRAWN FOR
  NOTHING: no cards, no section.
-->
<script lang="ts">
  import { page } from '$app/state';
  import { at } from '$lib/at.ts';
  import { decl, labelOf } from '$lib/record/api.ts';
  import { REGISTERS } from '$lib/record/held.ts';
  import { valueSaid } from '$lib/voice.ts';
  import IconWell from '$lib/ui/IconWell.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import ProjectCard from '$lib/ui/ProjectCard.svelte';
  import ProjectWell from '$lib/ui/ProjectWell.svelte';
  import Segmented from '$lib/ui/Segmented.svelte';
  import { apiBase } from '$lib/at.ts';
  import { rowWriter } from '$lib/record/rows-write.ts';
  import Button from '$lib/ui/Button.svelte';
  import { agentsOn, slotStyle, takenBackFree, type ProjectCard as Card } from './project-cards.ts';
  import { projectKept } from '$lib/funnel.ts';
  import { untrack } from 'svelte';
  import { live } from '$lib/data/live.svelte.ts';
  import { latesOf } from './card-late.ts';

  let {
    cards,
    more,
    list,
    name,
    working = [],
  }: { cards: readonly Card[]; more: number; list: string; name: string; working?: readonly { agent: string; project: string | null }[] } = $props();

  const words = {
    formed: "Formed from your agent's first run.",
    keep: 'Keep it',
    notOne: 'Not a project',
    all: 'All projects',
    inPlay: 'In play',
  } as const;

  /* THE TWO PRESSES ON A DRAFT. Keep clears the mark and the card is an ordinary one from then on. "Not a project" takes
     back a row the record made a few minutes ago with no question; an older draft opens its page, where deleting asks
     as it does for any row. The desk reads again when the record moves, so a local note hides the card at once. */
  let gone = $state<ReadonlySet<number>>(new Set());
  let failed = $state<string | null>(null);
  const writer = $derived(rowWriter(apiBase()));
  const hide = (seq: number) => (gone = new Set([...gone, seq]));
  async function keep(c: Card) {
    failed = null;
    const out = await writer.update(list, c.seq, { draft: false });
    if (out.ok) {
      hide(c.seq);
      projectKept();
    } else failed = out.fix;
  }
  async function notOne(c: Card) {
    failed = null;
    const out = await writer.archive(list, c.seq);
    if (out.ok) hide(c.seq);
    else failed = out.fix;
  }
  const shown = $derived(cards.filter((c) => !gone.has(c.seq) || !c.draft));
  /* HOW MUCH OF EACH CARD'S WORK IS LATE, as its page counts it (`card-late.ts`), again when the record moves. */
  let lates = $state.raw<ReadonlyMap<number, number>>(new Map());
  const seqs = $derived(cards.filter((c) => !c.draft).map((c) => c.seq).join(','));
  $effect(() => {
    const said = seqs;
    void live.version;
    if (said === '') return;
    untrack(() => {
      void latesOf(apiBase(), list, said.split(',').map(Number))
        .then((got) => {
          if (said === seqs) lates = got;
        })
        .catch(() => {});
    });
  });
  const label = (c: Card): string => {
    const f = c.figure ? decl(list, c.figure.field) : undefined;
    return f ? labelOf(f) : '';
  };

  /* THE LANES THE CARDS HOLD, In play first: a choice narrows the grid and the count says how many are in each. */
  let lane = $state('play');
  const lanes = $derived.by(() => {
    const d = REGISTERS[list];
    const state = d?.state ? d.fields.find((f) => f.id === d.state) : undefined;
    const counts = new Map<string, number>();
    for (const c of shown) if (c.lane) counts.set(c.lane, (counts.get(c.lane) ?? 0) + 1);
    const ORDER = ['earning', 'building'];
    const named = [...counts.keys()].sort((a, b) => (ORDER.indexOf(a) + 1 || 9) - (ORDER.indexOf(b) + 1 || 9));
    return [{ id: 'play', label: words.inPlay, count: shown.length }, ...named.map((id) => ({ id, label: state ? valueSaid(state as Parameters<typeof valueSaid>[0], id) : id, count: counts.get(id) ?? 0 }))];
  });
  const inLane = $derived(lane === 'play' ? shown : shown.filter((c) => c.lane === lane));
  /* WHERE ALL OF THEM ARE: the record's Projects page where it keeps one, else the list. */
  /* WHERE ALL OF THEM ARE: the page the rail files under the list's own name where the record keeps one, else the list. */
  const allHref = $derived.by(() => {
    const nav = (page.data as { nav?: readonly { id?: string; title?: string }[] } | undefined)?.nav ?? [];
    const kept = nav.find((n) => n.title === name && typeof n.id === 'string');
    return kept ? `/p/${kept.id}` : `/r/${list}`;
  });
</script>

{#if shown.length > 0}
  <section class="projects" aria-labelledby="desk-projects">
    <header class="p-head">
      <span class="p-title-row">
        <IconWell name="grid" />
        <h2 id="desk-projects" class="p-title">{name}</h2>
        <span class="p-count num">{shown.length + more}</span>
      </span>
      {#if lanes.length > 2}
        <Segmented role="group" aria-label={name} class="p-lanes">
          {#each lanes as l (l.id)}
            <button type="button" class="segment" data-on={lane === l.id ? '' : undefined} aria-pressed={lane === l.id} onclick={() => (lane = l.id)}
              >{l.label} <span class="num">{l.count}</span></button
            >
          {/each}
        </Segmented>
      {/if}
      <a class="p-more tap" href={at(allHref)}>{words.all}<Icon name="arrow" size="s" /></a>
    </header>
    <ul class="cards">
      {#each inLane as c (c.key)}
        <li>
          {#if c.draft}
            <div class="draft" style={slotStyle(c.hue)}>
              <a class="d-open" href={at(c.href)}>
                <span class="d-top">
                  <ProjectWell mark={c.mark} name={c.name} hue={c.hue} />
                  <span class="d-name" dir="auto">{c.name}</span>
                </span>
                <span class="d-said">{words.formed}</span>
                {#if c.brief}<span class="d-brief" dir="auto">{c.brief}</span>{/if}
              </a>
              <span class="d-acts">
                <Button onclick={() => keep(c)}>{words.keep}</Button>
                {#if takenBackFree(c, Date.now())}
                  <button type="button" class="d-quiet tap" onclick={() => notOne(c)}>{words.notOne}</button>
                {:else}
                  <a class="d-quiet tap" href={at(c.row)}>{words.notOne}</a>
                {/if}
              </span>
              {#if failed}<span class="d-fail" role="alert">{failed}</span>{/if}
            </div>
          {:else}
            <ProjectCard card={{ ...c, late: lates.get(c.seq) ?? c.late }} label={label(c)} agents={agentsOn(c.name, working)} />
          {/if}
        </li>
      {/each}
    </ul>
  </section>
{/if}

<style>
  .projects {
    display: grid;
    gap: 12px;
    min-inline-size: 0;
  }

  /* A TILE'S HEAD, ON THE BOARD: the well, the name and the count, the lanes, and the way to all of them at the end. */
  .p-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 16px;
    min-block-size: 32px;
  }

  .p-title-row {
    display: inline-flex;
    align-items: center;
    gap: 12px;
  }

  .p-title {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 600;
    line-height: 20px;
  }

  .p-count {
    margin-inline-start: -4px;
    color: var(--ink-3);
    font-size: var(--fs-body);
    font-weight: 500;
  }

  .p-more {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-inline-start: auto;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    font-weight: 500;
    text-decoration: none;
  }

  @media (hover: hover) and (pointer: fine) {
    .p-more:hover {
      color: var(--ink);
    }
  }

  /* ON A PHONE THE LANES TAKE A ROW OF THEIR OWN, under the name, and scroll inside it when they do not fit. */
  @media (width < 640px) {
    .p-head :global(.p-lanes) {
      order: 3;
      flex-basis: 100%;
      overflow-x: auto;
      scrollbar-width: none;
    }
  }

  /* THE ONE GRID (proj section 4): 4 from 1280, 3 from 1024, 2 from 640, 1 below; a row may end short. */
  .cards {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .cards > li {
    display: grid;
    min-inline-size: 0;
  }

  @media (width >= 640px) {
    .cards {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (width >= 1024px) {
    .cards {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  @media (width >= 1280px) {
    .cards {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }

  /* A DRAFT IS THE SAME TILE, with its two presses where the figure would be. */
  .draft {
    display: grid;
    align-content: start;
    gap: 12px;
    padding: 20px;
    border-radius: var(--r-tile);
    background: var(--tile);
  }

  .d-open {
    display: grid;
    gap: 8px;
    color: inherit;
    text-decoration: none;
  }

  .d-top {
    display: flex;
    align-items: center;
    gap: 12px;
    min-inline-size: 0;
  }

  .d-name {
    overflow: hidden;
    font-size: var(--fs-head);
    font-weight: 600;
    line-height: 22px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .d-said {
    color: var(--ink-2);
    font-size: var(--fs-meta);
  }

  .d-brief {
    display: -webkit-box;
    overflow: hidden;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: 18px;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  .d-acts {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
  }

  .d-quiet {
    padding: 0;
    border: 0;
    background: none;
    color: var(--ink-2);
    font: inherit;
    font-size: var(--fs-meta);
    text-decoration: underline;
    cursor: pointer;
  }

  .d-fail {
    color: var(--red);
    font-size: var(--fs-meta);
  }
</style>
