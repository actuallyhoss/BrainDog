<!--
  The Slash page: the conversations asked lately, newest first, each one press from going on with it.

  A CONVERSATION IS CONTINUED WHERE IT WAS HAD, in the palette's Ask, opened over this page with the thread read back from
  the record (`openThread`). "New conversation" opens Ask empty. The record lists its conversations (`threads`), so one
  had on another device is here too; this device's own list fills in when the record cannot be reached.

  UNDER THE LIST, ONE QUIET LINK TO WHAT SLASH SUGGESTED AND WHAT CAME OF IT, the page this was before (`?history`).
-->
<script lang="ts">
  import { page } from '$app/state';
  import { since } from 'braindog-render';
  import { apiBase, at } from '$lib/at.ts';
  import { keptThreads, threadsKey, threads as recordThreads, type KeptThread } from '$lib/palette/slash-chat.ts';
  import { openAsk, openThread, palette } from '$lib/palette/open.svelte.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { drew } from '$lib/ui/screen.svelte.ts';

  const words = {
    title: 'Slash',
    /* A FIGURE AND ITS AGE, or nothing: what the list is for is the list. */
    sentence: (n: number, ago: string) => `${n} ${n === 1 ? 'conversation' : 'conversations'}, the last ${ago}.`,
    /* WHAT WILL BE HERE AND HOW IT GETS THERE (Look B's empty state), never "Nothing asked yet" alone. */
    none: 'Your conversations with Slash',
    noneWhy: 'Ask about your work, your money or your people. Each conversation is kept here, to pick up later.',
    fresh: 'New conversation',
    list: 'Conversations',
    history: 'Past suggestions',
  } as const;

  let threads = $state<KeptThread[]>([]);
  let now = $state(Date.now());
  /* READ AGAIN EACH TIME THE PALETTE CLOSES, so a conversation just had over this page is listed. */
  /* THIS PERSON'S THREADS ON THIS BRAINDOG, never the device's whole list (sec-follow M4). */
  const keptAt = $derived(threadsKey(apiBase(), (page.data as { me?: { person?: string | null } }).me?.person));
  $effect(() => {
    if (palette.open) return;
    threads = keptThreads(keptAt);
    now = Date.now();
    drew('ready');
    /* ONLY A HOST WITH A MODEL BEHIND SLASH KEEPS CONVERSATIONS (`slash` in the shell): one with none answers the door
       refused, which the browser writes to the console, and there is nothing it could list. */
    if (page.data.slash !== true) return;
    void recordThreads(apiBase()).then((kept) => {
      if (!kept) return;
      const mine = keptThreads(keptAt);
      const byId = new Map(mine.map((t) => [t.id, t]));
      for (const t of kept) byId.set(t.id, { ...t, title: t.title || byId.get(t.id)?.title || '' });
      threads = [...byId.values()].sort((a, b) => b.at - a.at);
    });
  });

  async function fresh() {
    const { clear } = await import('$lib/palette/thread.svelte.ts');
    clear();
    openAsk();
  }
</script>

{#snippet start()}
  <Button weight="primary" kbd="⌘J" onclick={fresh}><Icon name="plus" size="m" />{words.fresh}</Button>
{/snippet}

<PageHead icon="slash" title={words.title} sentence={threads[0] ? words.sentence(threads.length, since(new Date(threads[0].at).toISOString(), now)) : undefined} />
<div class="page">
  <!-- EMPTY, ONE TILE: what will be here, how it gets there, and the one way to start; with conversations, the button
       leads the list. -->
  {#if threads.length === 0}
    <Empty kind="no-data-yet" glyph="slash" title={words.none} body={words.noneWhy}>
      {#snippet actions()}{@render start()}{/snippet}
    </Empty>
  {:else}
    <div class="lead">{@render start()}</div>
    <ul class="threads" aria-label={words.list}>
      {#each threads as t (t.id)}
        <li>
          <button type="button" class="thread tap" onclick={() => openThread(t.id)}>
            <span class="q" dir="auto">{t.title}</span>
            <span class="when">{since(new Date(t.at).toISOString(), now)}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
  <p class="more"><a class="tap" href={at('/slash?history')}>{words.history}</a></p>
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    padding: var(--sp-4) var(--gutter) var(--sp-8);
  }

  .lead {
    display: flex;
  }

  .threads {
    margin: 0;
    padding: 0;
    list-style: none;
    border-block-start: 1px solid var(--rule);
  }

  .threads li {
    border-block-end: 1px solid var(--rule);
  }

  /* ONE CONVERSATION A ROW: the question that opened it, and when it was last asked in. */
  .thread {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    inline-size: 100%;
    min-block-size: var(--row-h-2);
    padding: var(--sp-2) var(--sp-2);
    border: 0;
    background: none;
    color: var(--ink);
    font: inherit;
    text-align: start;
    cursor: pointer;
    transition: background var(--d-state) var(--ease-out);
  }

  @media (hover: hover) and (pointer: fine) {
    .thread:hover {
      background: var(--hover);
    }
  }

  .q {
    flex: 1;
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .when {
    flex: none;
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .more {
    margin: 0;
    font-size: var(--fs-ctl);
  }

  .more a {
    color: var(--ink-2);
    text-decoration: underline;
    text-decoration-color: color-mix(in srgb, var(--ink) 40%, transparent);
    text-underline-offset: 3px;
  }
</style>
