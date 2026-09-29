<!--
  Every page the first run would make, drawn before it is made: one row a page in a tile, each opening the page as the
  record would draw it, with its layout, its rail and its tabs, over examples that are marked and never saved
  (`loop/finish/pages.md` PGS-20).

  THE RECORD DRAWS THEM, IN A REHEARSAL. Each call in `asked` is `previewChange`, which installs its lists and pages with
  the examples inside a transaction it throws away (`loop/finish/contracts.md` `previewChange`), and each page it answers
  goes through Decide's own conversion (`previewOf`) into the one page reader, in its inert `preview` mode. Nothing is
  kept, and nothing is written before the press beside the preview.

  A TILE WITH A FIGURE HOLDS A CHART (SYSTEM §6): the count of pages, a stacked bar of where they sit on the side of the
  screen, and one line saying so. The pages are rows inside it, never cards in a tile. The page the record opens on is
  named first, as the one it opens on.

  ONE PAGE OPEN AT A TIME. A page drawn twice on one screen writes its ids twice, so a row opens its page on its own: the
  whole screen on a phone, a wide sheet above 640px.

  WHERE THE RECORD CANNOT DRAW THEM, THE RAIL STANDS. A host without the method, or a change it refuses to rehearse,
  leaves the sections and page names `rail` carries, with one quiet line, and never a refusal drawn as though something
  had gone wrong.
-->
<script lang="ts">
  import { apiBase } from '$lib/at.ts';
  import { overlays } from '$lib/a11y/keys.svelte.ts';
  import { firstRun } from '$lib/first-run.ts';
  import PageView from '$lib/page/PageView.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import { Stacked } from '$lib/viz';
  import type { Tried } from '../decide/[id]/proposed.ts';
  import { words as said } from './building.ts';
  import { words } from './preview.ts';

  let {
    asked,
    rail = [],
  }: {
    asked: readonly Record<string, unknown>[];
    /** The sections of the side of the screen and the pages under each, as the declarations say them. */
    rail?: readonly { section: string; pages: readonly string[] }[];
  } = $props();

  /** The pages drawn, in the order the calls answered them; `null` while they are asked for, `[]` when none could be. */
  let drawn = $state.raw<Tried[] | null>(null);
  /** Whether any call came back with nothing drawn, which is when the quiet line says so. */
  let short = $state(false);
  let shown = $state<number | null>(null);
  let el = $state<HTMLDialogElement>();
  let held = false;

  /* EACH ASK IS NUMBERED, so pages that arrive after the proposal changed are not drawn under it. */
  let turn = 0;

  $effect(() => {
    const all = asked;
    const mine = ++turn;
    drawn = null;
    short = false;
    shown = null;
    if (all.length === 0) {
      drawn = [];
      return;
    }
    void (async () => {
      /* LOADED ON THE FIRST PROPOSAL, not with the screen, as the page sheet loads it (`AskPage.svelte`). */
      const { previewOf } = await import('../decide/[id]/proposed.ts');
      const got = await Promise.all(all.map((a) => previewOf(a, apiBase()).catch(() => ({ from: 'none' as const }))));
      if (mine !== turn) return;
      const pages: Tried[] = [];
      for (const r of got) {
        if (r.from !== 'live') continue;
        for (const p of r.pages) if (!pages.some((q) => q.slug === p.slug)) pages.push(p);
      }
      /* THE PAGE IT OPENS ON FIRST: the one with no place of its own on the side of the screen. */
      pages.sort((a, b) => Number(Boolean(a.got.page.page.nav?.section)) - Number(Boolean(b.got.page.page.nav?.section)));
      short = got.some((r) => r.from !== 'live');
      drawn = pages;
    })();
  });

  const open = $derived(shown === null ? null : (drawn?.[shown] ?? null));

  /** The name of the section a page sits under in the rail, or `null` for the one it opens on. */
  const sectionOf = (p: Tried): string | null => p.got.page.page.nav?.section ?? null;

  /* WHERE THE PAGES SIT, from what the record drew where it drew them, else from the declarations. */
  const places = $derived.by(() => {
    const out = new Map<string, number>();
    if (drawn && drawn.length > 0) for (const p of drawn) out.set(sectionOf(p) ?? words.home, (out.get(sectionOf(p) ?? words.home) ?? 0) + 1);
    else for (const r of rail) out.set(r.section, (out.get(r.section) ?? 0) + r.pages.length);
    return [...out].map(([label, value]) => ({ label, value }));
  });
  const total = $derived(places.reduce((n, p) => n + p.value, 0));

  $effect(() => {
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      overlays.open();
      held = true;
    } else if (!open && el.open) {
      el.close();
    }
  });

  /* THE LOCK IS GIVEN BACK WHEN THIS GOES, whatever took the page away, as the sheet gives it back (`Sheet.svelte`). */
  $effect(() => () => {
    if (held) {
      overlays.close();
      held = false;
    }
  });

  /** The one notifier: Escape and the close button both end in the element's own `close` event. */
  function closed() {
    shown = null;
    if (held) {
      overlays.close();
      held = false;
    }
  }
</script>

{#if total > 0}
  <Tile icon="doc" title={firstRun.minePages} count={total}>
    {#if places.length > 1}
      <Stacked parts={places} subject={firstRun.minePages} />
    {/if}
    {#if drawn && drawn.length > 0}
      <ul class="pages">
        {#each drawn as p, i (p.slug)}
          {@const where = sectionOf(p)}
          <li>
            <button type="button" class="card" aria-label={words.openPage(p.got.page.page.title)} onclick={() => (shown = i)}>
              <IconWell name={where ? 'doc' : 'home'} size="l" />
              <span class="card-main">
                <span class="card-title">{p.got.page.page.title}</span>
                <span class="card-where">{where ?? `${firstRun.mineHome}, ${said.opensFirst}`}</span>
              </span>
              <Icon name="arrow" size="m" />
            </button>
          </li>
        {/each}
      </ul>
      <p class="reading">{said.pagesIn(drawn.length, places.length)} {firstRun.mineExamples}</p>
    {:else}
      <ul class="pages">
        {#each rail as r (r.section)}
          <li class="rail-row">
            <IconWell name="doc" size="l" />
            <span class="card-main">
              <span class="card-title">{r.section}</span>
              <span class="card-where">{firstRun.and([...r.pages])}</span>
            </span>
          </li>
        {/each}
      </ul>
      {#if drawn && short}<p class="reading">{words.undrawn}</p>{/if}
    {/if}
  </Tile>
{/if}

<dialog class="opened" bind:this={el} onclose={closed} aria-label={open?.got.page.page.title ?? words.home}>
  {#if open}
    <div class="opened-head">
      <span class="opened-title">{open.got.page.page.title}</span>
      <button type="button" class="opened-close tap" aria-label={words.closePage} title={words.closePage} onclick={() => el?.close()}><Icon name="close" size="m" /></button>
    </div>
    <p class="reading">{firstRun.mineExamples}</p>
    <div class="opened-body">
      <PageView slug={open.slug} got={open.got} mode="preview" was={open.was} />
    </div>
  {/if}
</dialog>

<style>
  .pages {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* A ROW, NOT A CARD (a tile never holds tiles): a 32px well, the page and where it sits, and the whole row the
     target, with the rounded wash under a pointer (SYSTEM §6). */
  .card,
  .rail-row {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    box-sizing: border-box;
    inline-size: calc(100% + 2 * var(--sp-2));
    min-block-size: var(--row-h-2);
    padding: var(--sp-1) var(--sp-2);
    margin-inline: calc(-1 * var(--sp-2));
    border: 0;
    border-radius: var(--r-md);
    background: none;
    color: var(--ink);
    font: inherit;
    text-align: start;
  }

  .card {
    cursor: pointer;
    transition: background var(--d-state) var(--ease-out);
  }

  .card > :global(.icon) {
    color: var(--dim);
  }

  @media (hover: hover) and (pointer: fine) {
    .card:hover {
      background: var(--hover-wash);
    }
  }

  .card-main {
    display: grid;
    flex: 1;
    min-inline-size: 0;
  }

  .card-title {
    overflow: hidden;
    font-size: var(--t-row);
    font-weight: 500;
    line-height: 20px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .card-where {
    overflow: hidden;
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: 18px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* THE ONE WRITTEN LINE under the chart and its rows (SYSTEM §6). */
  .reading {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-sm);
    line-height: 18px;
  }

  /* A PAGE OPENED FROM ITS ROW FILLS A PHONE'S SCREEN, clear of the top and bottom insets, and is a wide sheet from
     640px up: the tile's fill at radius 22, level two, over the plain scrim (SYSTEM §6, sheets and dialogs). */
  .opened {
    box-sizing: border-box;
    inline-size: 100%;
    max-inline-size: 100%;
    block-size: 100dvh;
    max-block-size: 100dvh;
    margin: 0;
    padding: env(safe-area-inset-top) var(--sp-4) env(safe-area-inset-bottom);
    border: 0;
    background: var(--bg);
    color: var(--ink);
    overflow-y: auto;
  }

  .opened[open] {
    display: grid;
    align-content: start;
    gap: var(--sp-3);
  }

  .opened::backdrop {
    background: var(--scrim);
  }

  @media (min-width: 640px) {
    .opened {
      inline-size: min(64rem, calc(100% - 2 * var(--sp-6)));
      block-size: auto;
      max-block-size: calc(100dvh - 2 * var(--sp-6));
      margin: auto;
      padding: var(--sp-4) var(--sp-5) var(--sp-5);
      border-radius: var(--r-lg);
      box-shadow: var(--e3);
    }
  }

  .opened-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-3);
    min-block-size: var(--sticky);
  }

  .opened-title {
    min-inline-size: 0;
    overflow-wrap: anywhere;
    font-size: var(--t-group);
    font-weight: 600;
    line-height: 24px;
  }

  .opened-close {
    display: inline-grid;
    place-items: center;
    flex: none;
    inline-size: var(--ctl-h);
    block-size: var(--ctl-h);
    border: 0;
    border-radius: var(--r-pill);
    background: var(--s1);
    color: var(--ink2);
    cursor: pointer;
  }

  .opened-body {
    min-inline-size: 0;
  }

  @media (forced-colors: active) {
    .opened {
      border: 1px solid CanvasText;
    }
  }
</style>
