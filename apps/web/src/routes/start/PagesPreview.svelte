<!--
  Every page the first run would make, drawn before it is made: one card a page, each opening the page as the record
  would draw it, with its layout, its rail and its tabs, over examples that are marked and never saved
  (`loop/finish/pages.md` PGS-20).

  THE RECORD DRAWS THEM, IN A REHEARSAL. Each call in `asked` is `previewChange`, which installs its lists and pages with
  the examples inside a transaction it throws away (`loop/finish/contracts.md` `previewChange`), and each page it answers
  goes through Decide's own conversion (`previewOf`) into the one page reader, in its inert `preview` mode. Nothing is
  kept, and nothing is written before the press below the preview.

  ONE PAGE OPEN AT A TIME. A page drawn twice on one screen writes its ids twice, so the pages are cards, stacked under
  the sentence, and a card opens its page on its own: the whole screen on a phone, a wide dialog above 640px.

  WHERE THE RECORD CANNOT DRAW THEM, THE RAIL ABOVE STANDS. A host without the method, or a change it refuses to
  rehearse, leaves the sections and page names the caller drew, with one quiet line, and never a refusal drawn as though
  something had gone wrong.
-->
<script lang="ts">
  import { apiBase } from '$lib/at.ts';
  import { overlays } from '$lib/a11y/keys.svelte.ts';
  import { firstRun } from '$lib/first-run.ts';
  import PageView from '$lib/page/PageView.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import type { Tried } from '../decide/[id]/proposed.ts';
  import { words } from './preview.ts';

  let { asked }: { asked: readonly Record<string, unknown>[] } = $props();

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
      short = got.some((r) => r.from !== 'live');
      drawn = pages;
    })();
  });

  const open = $derived(shown === null ? null : (drawn?.[shown] ?? null));

  /** The name of the section a page sits under in the rail, or Home for one that sits at the top. */
  const sectionOf = (p: Tried): string => p.got.page.page.nav?.section ?? words.home;

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

{#if drawn && drawn.length > 0}
  <p class="examples">{firstRun.mineExamples}</p>
  <ul class="cards">
    {#each drawn as p, i (p.slug)}
      <li>
        <button type="button" class="card" aria-label={words.openPage(p.got.page.page.title)} onclick={() => (shown = i)}>
          <span class="card-title">{p.got.page.page.title}</span>
          <span class="card-where">{sectionOf(p)}</span>
        </button>
      </li>
    {/each}
  </ul>
{/if}
{#if drawn && short}<p class="examples">{words.undrawn}</p>{/if}

<dialog class="opened" bind:this={el} onclose={closed} aria-label={open?.got.page.page.title ?? words.home}>
  {#if open}
    <div class="opened-head">
      <span class="opened-title">{open.got.page.page.title}</span>
      <button type="button" class="opened-close" aria-label={words.closePage} onclick={() => el?.close()}><Icon name="close" size="m" /></button>
    </div>
    <p class="examples">{firstRun.mineExamples}</p>
    <div class="opened-body">
      <PageView slug={open.slug} got={open.got} mode="preview" was={open.was} />
    </div>
  {/if}
</dialog>

<style>
  .examples {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  /* STACKED CARDS AT EVERY WIDTH, two a row once there is room, and the whole card is the target. */
  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(16rem, 100%), 1fr));
    gap: var(--sp-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .card {
    display: grid;
    gap: var(--sp-1);
    inline-size: 100%;
    min-block-size: var(--row-h-2);
    padding: var(--sp-3) var(--sp-4);
    border: 1px solid var(--edge);
    border-radius: var(--r-md);
    background: var(--bg);
    color: var(--ink);
    text-align: start;
    cursor: pointer;
  }

  .card:focus-visible {
    outline: 2px solid var(--focus-in);
    outline-offset: 2px;
  }

  @media (hover: hover) and (pointer: fine) {
    .card:hover {
      background: var(--hover-wash);
    }
  }

  .card-title {
    overflow: hidden;
    font-size: var(--t-md);
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .card-where {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  /* A PAGE OPENED FROM ITS CARD FILLS A PHONE'S SCREEN, clear of the top and bottom insets, and is a wide centred
     dialog from 640px up, so its rail and tabs are drawn as the page would draw them. */
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
      padding: var(--sp-4) var(--sp-6) var(--sp-6);
      border: 1px solid var(--edge);
      border-radius: var(--r-lg);
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
    font-size: var(--t-lg);
    font-weight: 600;
  }

  .opened-close {
    display: inline-grid;
    place-items: center;
    flex: none;
    inline-size: var(--tap);
    block-size: var(--tap);
    border: 0;
    border-radius: var(--r-pill);
    background: transparent;
    color: var(--ink2);
    cursor: pointer;
  }

  .opened-body {
    min-inline-size: 0;
  }
</style>
