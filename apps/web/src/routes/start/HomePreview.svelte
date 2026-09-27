<!--
  The Home a use case would make, drawn before anything is written: its blocks over its own examples, marked as examples
  (`loop/finish/modules.md` MOD-6).

  THE RECORD DRAWS IT, IN A REHEARSAL. `previewChange` installs the Home and the lists it reads with the examples inside a
  transaction it throws away (`loop/finish/contracts.md` §2.4), and the answer is drawn by the one page reader in its
  inert `preview` mode, so what is shown is what the record would draw and nothing is kept.

  AND WHERE IT CANNOT, THE HOME IS SAID: its headings, in the use case's voice. A host without the method, a Home that
  reads a module's list, or one the record refuses to rehearse all land here, so the preview never waits on a call that
  will not answer and never shows a refusal as though something had gone wrong.
-->
<script lang="ts">
  import { createClient } from '@braindog/client';
  import type { UseCase } from '@braindog/seed/usecases';
  import { homePageOf } from '@braindog/seed/usecases/install';
  import { apiBase } from '$lib/at.ts';
  import { firstRun } from '$lib/first-run.ts';
  import PageView from '$lib/page/PageView.svelte';
  import { blockOf, type Opened } from '$lib/record/page-live.ts';
  import { homeAsked, homeHeadings } from './preview.ts';

  let { u, today }: { u: UseCase; today: string } = $props();

  type Answered = Parameters<typeof blockOf>[0];

  let got = $state<Opened | null>(null);
  let said = $state(false);

  $effect(() => {
    const one = u;
    const asked = homeAsked(one, today);
    got = null;
    said = asked === null;
    if (asked === null) return;
    void createClient({ base: apiBase() })
      .call<{ pages?: unknown }>('previewChange', asked)
      .then((out) => {
        if (u !== one) return;
        const pages = out.ok && Array.isArray(out.value.pages) ? (out.value.pages as { id?: unknown; slug?: unknown; blocks?: unknown }[]) : [];
        const home = pages.find((p) => p.slug === homePageOf(one.usecase) || p.id === `page.${homePageOf(one.usecase)}`);
        const blocks = home && Array.isArray(home.blocks) ? (home.blocks as Answered[]) : null;
        if (!blocks) {
          said = true;
          return;
        }
        const now = Date.now();
        /* HOME BY THE NAME ITS VOICE GIVES IT ("Today" for a student), under the preview's own "Its Home". */
        const title = one.voice.home ?? firstRun.mineHome;
        got = { from: 'live', now, page: { page: { page: homePageOf(one.usecase), title }, blocks: blocks.map((b) => blockOf(b, new Map(), now)) } };
      })
      .catch(() => (said = u === one ? true : said));
  });

  const headings = $derived(homeHeadings(u));
</script>

<!-- THE HEADING ONLY OVER SOMETHING. A use case that keeps the house Home, or one whose Home is still being drawn, is
     not given "Its Home" over an empty space. -->
{#if got || (said && headings.length > 0)}
  <h3 class="home-h">{firstRun.mineHome}</h3>
  <div class="home">
    {#if got}
      <p class="home-examples">{firstRun.mineExamples}</p>
      <PageView slug={homePageOf(u.usecase)} {got} mode="preview" />
    {:else}
      <ul class="home-heads">
        {#each headings as h, i (i)}<li>{h}</li>{/each}
      </ul>
    {/if}
  </div>
{/if}

<style>
  .home-h {
    margin-block-start: var(--sp-3);
    color: var(--ink2);
    font-size: var(--t-sm);
    font-weight: 600;
  }

  .home {
    display: grid;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  .home-examples {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .home-heads {
    display: grid;
    gap: var(--sp-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .home-heads li {
    padding-block: var(--sp-2);
    border-block-end: 1px solid var(--line-soft);
    color: var(--ink);
    font-size: var(--t-base);
    font-weight: 500;
  }
</style>
