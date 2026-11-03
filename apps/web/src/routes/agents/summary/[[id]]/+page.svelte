<!--
  A summary: `/agents/summary/<id>`, what a phone's tap on the 08:00 or 17:00 notice opens, and `/agents/summary` for
  every summary this record sends.

  WHAT IT WOULD SAY NOW, from the record's `digestToday`, the same assembly the scheduled one sends, held to what this
  reader may read: what waits for you, what your agents did, and what is stuck, each section with the door to where it
  is answered. A section with nothing in it is left out, as the summary itself leaves it out. The words are
  `$lib/agents/summary.ts`.
-->
<script lang="ts">
  import { page } from '$app/state';
  import { createClient } from '@braindog/client';
  import { apiBase, at } from '$lib/at.ts';
  import { read } from '$lib/data/read.svelte.ts';
  import { titleOf } from '$lib/title.ts';
  import { agentsPlace, heldHref } from '$lib/nav/rail.ts';
  import { offerHref, summariesOf, summaryHref, summaryWords as words, type Summary } from '$lib/agents/summary.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import ReadState from '$lib/ui/ReadState.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';

  const id = $derived(typeof page.params.id === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/u.test(page.params.id) ? page.params.id : null);

  const held = read<Summary[]>(
    () => `summary:${apiBase()}:${id ?? '*'}`,
    async () => {
      const out = (await createClient({ base: apiBase() }).call('digestToday', id === null ? {} : { digest: id })) as { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };
      if (!out.ok) return out as never;
      return { ok: true as const, value: summariesOf(out.value) };
    },
  );

  /* THE WAY BACK AND THE DOORS GO ONLY TO PAGES THE RECORD HOLDS: the agents page, else Settings › Agents (`agentsPlace`). */
  const pages = $derived((page.data as { pages?: readonly string[] }).pages);
  const summaries = $derived(held.value ?? []);
  const title = $derived(id !== null && summaries.length === 1 ? summaries[0]!.name : words.all);
</script>

<svelte:head><title>{titleOf(title)}</title></svelte:head>

<PageHead icon="bell" {title} kicker={words.parent} back={agentsPlace(pages)} sentence={summaries.length > 0 ? words.sentAt : undefined} />
<div class="page">
  {#if held.state === 'waiting' || held.state === 'refused' || held.state === 'offline'}
    <ReadState state={held.state} refusal={held.refusal} onretry={held.reread} />
  {:else if summaries.length === 0}
    <!-- THE HOUSE EMPTY STATE: what will be here and the one step that brings it, never "No summaries yet." alone. -->
    <Empty kind="no-data-yet" glyph="bell" title={words.none.replace(/\.$/u, '')} body={words.offer}>
      {#snippet actions()}<Button href={offerHref}>{words.getIt}</Button>{/snippet}
    </Empty>
  {:else}
    {#each summaries as s (s.id)}
      <Tile icon={id === null ? "bell" : undefined} title={id === null ? s.name : undefined}>
        {#if id === null}<p class="said quiet"><a href={at(summaryHref(s.id))}>{s.headline}</a></p>{/if}
        {#if s.sections.length === 0}
          <p class="said quiet">{words.nothing}</p>
        {:else}
          {#each s.sections as sec (sec.source + sec.heading)}
            <section class="sec">
              <h2 class="sec-head">{sec.heading}</h2>
              <ul class="lines">
                {#each sec.lines as l (l.key)}
                  <li class="said-line">
                    <span class="line-text" dir="auto">{l.text}</span>
                    {#if l.detail}<span class="line-detail" dir="auto">{l.detail}</span>{/if}
                  </li>
                {/each}
                {#if sec.more > 0}<li class="said-line line-detail">{words.more(sec.more)}</li>{/if}
              </ul>
              <!-- A DOOR ONLY TO A PAGE THE RECORD HOLDS (`heldHref`): the runs' door is the agents page, which a new BrainDog has not. -->
              {#if sec.href !== null && heldHref(pages, sec.href)}
                {@const door = sec.href}
                <div class="foot"><Button size="sm" href={door}>{door === '/decide' ? words.decide : words.upNext}</Button></div>
              {/if}
            </section>
          {/each}
        {/if}
      </Tile>
    {/each}
  {/if}
</div>

<style>
  .page {
    display: grid;
    gap: var(--sp-4);
    padding: var(--page-head-gap) var(--gutter) var(--page-bottom);
  }

  .said {
    margin: 0;
    max-inline-size: var(--measure);
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: 22px;
  }

  .quiet {
    color: var(--ink-2);
  }

  .sec + .sec {
    margin-block-start: var(--sp-4);
  }

  .sec-head {
    margin: 0 0 var(--sp-1);
    color: var(--ink-2);
    font-size: var(--fs-meta);
    font-weight: 500;
  }

  .lines {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .said-line {
    display: grid;
    gap: 2px;
    padding-block: var(--sp-2);
    min-inline-size: 0;
  }

  .said-line + .said-line {
    border-block-start: 1px solid var(--rule);
  }

  .line-text {
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: 22px;
    overflow-wrap: anywhere;
  }

  .line-detail {
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: 18px;
  }

  .foot {
    margin-block-start: var(--sp-2);
  }
</style>
