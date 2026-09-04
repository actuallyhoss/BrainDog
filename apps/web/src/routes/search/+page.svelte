<!--
  The structured fallback, for when the palette's ranked list was not enough.

  It is a fallback and not the front door: a palette is an accelerator OVER visible navigation, and
  search is what you reach for when you know a word and not a place (19 §2).
-->
<script lang="ts">
  import { titleOf } from '$lib/title.ts';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { copy } from '$lib/copy.ts';
  import { search } from '$lib/record/api.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Icon from '$lib/ui/Icon.svelte';

  const q = $derived(page.url.searchParams.get('q') ?? '');
  const hits = $derived(search(q, 60));

  const groups = $derived.by(() => {
    const out = new Map<string, typeof hits>();
    for (const h of hits) {
      if (!out.has(h.kind)) out.set(h.kind, []);
      out.get(h.kind)!.push(h);
    }
    return [...out];
  });
</script>

<svelte:head><title>{titleOf(q && `“${q}”`, copy.search)}</title></svelte:head>

<PageHead title={copy.search} count={q ? hits.length : undefined} />

<div class="page">
  <label class="field field-lg">
    <Icon name="search" size="m" />
    <input
      class="field-input"
      type="search"
      value={q}
      placeholder="A name, a word, or a spoken id"
      spellcheck="false"
      oninput={(e) => goto(`/search?q=${encodeURIComponent((e.currentTarget as HTMLInputElement).value)}`, { replaceState: true, keepFocus: true, noScroll: true })}
    />
  </label>

  {#if !q}
    <p class="prompt">Type to search every register at once. A spoken id, such as <code>D41</code>, <code>SG31</code>, <code>tasks#7</code>, resolves straight to its row.</p>
  {:else if hits.length === 0}
    <Empty kind="no-results" title="Nothing matching “{q}”." query={q}>
      {#snippet actions()}<a class="clear" href="/search">Clear</a>{/snippet}
    </Empty>
  {:else}
    {#each groups as [kind, rows]}
      <section>
        <h2 class="group">{kind}<span class="group-n">{rows.length}</span></h2>
        <ul class="ledger">
          {#each rows as hit}
            <li>
              <a class="line line-short" href={hit.href}>
                <span class="seq">{hit.spoken ?? ''}</span>
                <span class="line-main"><span class="line-title">{hit.title}</span></span>
                <span class="line-amount"></span>
                <span class="line-when">{hit.detail}</span>
              </a>
            </li>
          {/each}
        </ul>
      </section>
    {/each}
  {/if}
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    padding: var(--sp-5) var(--sp-6) var(--sp-9);
    max-inline-size: 900px;
  }

  .prompt {
    color: var(--dim);
    max-inline-size: var(--measure);
  }

  .prompt code {
    padding: 1px 5px;
    background: var(--sunk);
    border-radius: 3px;
    font-family: var(--font-id);
    font-size: var(--t-xs);
  }

  .group {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
    margin-block-end: var(--sp-2);
    color: var(--ink2);
    font-family: var(--font-ui);
    font-size: var(--t-ui);
    font-weight: 500;
  }

  .group-n {
    color: var(--dim);
    font-family: var(--font-id);
    font-size: var(--t-xs);
  }

  .clear {
    color: var(--accent-text);
  }

  @media (width < 900px) {
    .page {
      padding: var(--sp-4) var(--sp-4) var(--sp-8);
    }
  }
</style>
