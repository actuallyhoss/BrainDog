<!--
  The Slash page: the conversations asked lately, newest first, each one press from going on with it.

  A CONVERSATION IS CONTINUED WHERE IT WAS HAD, in the palette's Ask, opened over this page with the thread read back from
  the record (`openThread`). "New conversation" opens Ask empty. This device keeps the list (`keptThreads`), so a
  conversation had on another device is not listed here.

  UNDER THE LIST, ONE QUIET LINK TO WHAT SLASH SUGGESTED AND WHAT CAME OF IT, the page this was before (`?history`).
-->
<script lang="ts">
  import { since } from 'braindog-render';
  import { at } from '$lib/at.ts';
  import { keptThreads, type KeptThread } from '$lib/palette/slash-chat.ts';
  import { openAsk, openThread, palette } from '$lib/palette/open.svelte.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { drew } from '$lib/ui/screen.svelte.ts';

  const words = {
    title: 'Slash',
    sentence: 'Your conversations with Slash, newest first. Open one to go on with it.',
    none: 'Nothing asked yet. Ask Slash about anything in this BrainDog, and the conversation is kept here.',
    fresh: 'New conversation',
    list: 'Conversations',
    history: 'What Slash suggested, and what came of it',
  } as const;

  let threads = $state<KeptThread[]>([]);
  let now = $state(Date.now());
  /* READ AGAIN EACH TIME THE PALETTE CLOSES, so a conversation just had over this page is listed. */
  $effect(() => {
    if (palette.open) return;
    threads = keptThreads();
    now = Date.now();
    drew('ready');
  });

  async function fresh() {
    const { clear } = await import('$lib/palette/thread.svelte.ts');
    clear();
    openAsk();
  }
</script>

<PageHead icon="slash" title={words.title} sentence={words.sentence} />
<div class="page">
  <div class="lead">
    <Button weight="primary" kbd="⌘J" onclick={fresh}><Icon name="plus" size="m" />{words.fresh}</Button>
  </div>
  {#if threads.length === 0}
    <p class="none">{words.none}</p>
  {:else}
    <ul class="threads" aria-label={words.list}>
      {#each threads as t (t.id)}
        <li>
          <button type="button" class="thread tap" onclick={() => openThread(t.id)}>
            <span class="mark"><Icon name="slash" size="m" /></span>
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

  .none {
    margin: 0;
    max-inline-size: var(--measure);
    color: var(--ink-3);
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

  /* ONE CONVERSATION A ROW: Slash's glyph, the question that opened it, and when it was last asked in. */
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

  .mark {
    display: inline-grid;
    flex: none;
    color: var(--ink-3);
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
