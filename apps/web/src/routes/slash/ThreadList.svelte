<!--
  The conversations with Slash, newest first, the panel's and the page's one list: grouped by day so a week of them can be
  scanned, one line each, what it is called and a short time, the open one marked. Each is a link (`/slash?t=<id>`), so it
  can be opened in a new tab and Back comes back to it; in the panel `onpick` takes the press and it opens in place.

  A SEARCH OVER THE TITLES, with the rows already here, so it answers on each letter and asks the record nothing.

  RENAME AND DELETE ARE IN THE ROW'S "…", and each happens in the row: its name becomes a field, or its line asks first.
-->
<script lang="ts">
  import { tick } from 'svelte';
  import { at } from '$lib/at.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import Icon from '$lib/ui/Icon.svelte';
  import Menu from '$lib/ui/Menu.svelte';
  import { threadWords, type KeptThread } from '$lib/palette/slash-chat.ts';
  import { matching, renameThread } from '$lib/palette/conversations.svelte.ts';
  import { removeThread } from '$lib/palette/thread.svelte.ts';
  import { dayOf, shortWhen } from './with.ts';

  let {
    threads,
    current,
    now,
    label,
    query = $bindable(''),
    search = $bindable(),
    cursor = null,
    onpick,
    onkey,
  }: {
    threads: readonly KeptThread[];
    current: string | null;
    now: number;
    label: string;
    /** What is typed in the search. */
    query?: string;
    /** The search field, for whoever gives it focus. */
    search?: HTMLInputElement | undefined;
    /** The row the keys are on. */
    cursor?: string | null;
    /** Takes a press on a row, in place of following its link. */
    onpick?: ((id: string) => void) | undefined;
    /** Keys in the search field. */
    onkey?: ((e: KeyboardEvent) => void) | undefined;
  } = $props();

  const NAMES = { today: 'Today', yesterday: 'Yesterday', week: 'This week', earlier: 'Earlier' } as const;

  const shown = $derived(matching(threads, query));
  const groups = $derived.by(() => {
    const out: { key: keyof typeof NAMES; items: KeptThread[] }[] = [];
    for (const t of shown) {
      const key = dayOf(t.at, now);
      const g = out.at(-1);
      if (g && g.key === key) g.items.push(t);
      else out.push({ key, items: [t] });
    }
    return out;
  });

  let renaming = $state<string | null>(null);
  let name = $state('');
  let asking = $state<string | null>(null);
  let nameField = $state<HTMLInputElement>();

  function startRename(t: KeptThread) {
    asking = null;
    renaming = t.id;
    name = t.title;
    void tick().then(() => {
      nameField?.focus();
      nameField?.select();
    });
  }

  async function saveName(id: string) {
    if (renaming !== id) return;
    renaming = null;
    if (!(await renameThread(id, name))) toasts.push(threadWords.renameFailed, { intent: 'warn' });
  }

  function onNameKey(e: KeyboardEvent, id: string) {
    if (e.key === 'Enter') {
      e.preventDefault();
      void saveName(id);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      renaming = null;
    }
  }

  async function remove(id: string) {
    asking = null;
    if (!(await removeThread(id))) toasts.push(threadWords.removeFailed, { intent: 'warn' });
  }

  function onAskKey(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    asking = null;
  }

  function pressed(e: MouseEvent, id: string) {
    if (!onpick || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    onpick(id);
  }

  /* THE ROW THE KEYS ARE ON STAYS IN VIEW. */
  let list = $state<HTMLElement>();
  $effect(() => {
    if (cursor !== null) list?.querySelector('[data-cursor]')?.scrollIntoView({ block: 'nearest' });
  });
</script>

<div class="side-list">
  <span class="find">
    <Icon name="search" size="s" />
    <input bind:this={search} bind:value={query} type="search" placeholder={threadWords.search} aria-label={threadWords.search} autocomplete="off" spellcheck="false" onkeydown={onkey} />
  </span>
  <nav class="t-list" aria-label={label} bind:this={list}>
    {#each groups as g (g.key)}
      <p class="group caps-label">{NAMES[g.key]}</p>
      <ul>
        {#each g.items as t (t.id)}
          <li class="t-line" data-cursor={t.id === cursor ? '' : undefined} data-open={t.id === current ? '' : undefined}>
            {#if renaming === t.id}
              <input class="name tap" bind:this={nameField} bind:value={name} aria-label={threadWords.renameLabel} maxlength="80" onkeydown={(e) => onNameKey(e, t.id)} onblur={() => saveName(t.id)} />
            {:else if asking === t.id}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div class="ask" onkeydown={onAskKey}>
                <p class="ask-said" role="status">{threadWords.removeAsk}</p>
                <span class="ask-do">
                  <button type="button" class="btn danger tap" onclick={() => remove(t.id)}>{threadWords.remove}</button>
                  <button type="button" class="btn tap" onclick={() => (asking = null)}>{threadWords.removeKeep}</button>
                </span>
              </div>
            {:else}
              <a class="thread tap" href={at(`/slash?t=${encodeURIComponent(t.id)}`)} aria-current={t.id === current ? 'page' : undefined} data-thread onclick={(e) => pressed(e, t.id)}>
                <span class="q" dir="auto">{t.title || threadWords.untitled}</span>
                {#if t.answering}<span class="live" title={threadWords.answering}><span class="sr">{threadWords.answering}</span></span>{/if}
                <span class="when num">{shortWhen(t.at, now)}</span>
              </a>
              <span class="more">
                <Menu label={threadWords.actions} align="end">
                  {#snippet trigger()}<span class="more-face"><Icon name="more" size="s" /><span class="sr">{threadWords.actions}</span></span>{/snippet}
                  <button type="button" role="menuitem" onclick={() => startRename(t)}>{threadWords.rename}</button>
                  <button type="button" role="menuitem" onclick={() => (asking = t.id, (renaming = null))}>{threadWords.remove}</button>
                </Menu>
              </span>
            {/if}
          </li>
        {/each}
      </ul>
    {/each}
    {#if shown.length === 0 && query.trim() !== ''}<p class="none">{threadWords.noneFound}</p>{/if}
  </nav>
</div>

<style>
  .side-list {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    min-block-size: 0;
  }

  .find {
    display: flex;
    flex: none;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: 36px;
    padding-inline: var(--title-inset, 12px);
    border-radius: var(--r-ctl);
    background: var(--soft-fill);
    color: var(--ink-3);
  }

  .find :global(svg) {
    flex: none;
  }

  .find input {
    flex: 1;
    min-inline-size: 0;
    padding: 0;
    border: 0;
    /* focus-ok: the row around it says so (`.find:focus-within`). */
    outline: 0;
    background: none;
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-ctl);
    -webkit-appearance: none;
    appearance: none;
  }

  .find:focus-within {
    outline: 1px solid var(--rule-strong);
    outline-offset: -1px;
  }

  .t-list {
    display: flex;
    flex-direction: column;
    min-block-size: 0;
  }

  .group {
    margin: 0;
    padding: var(--sp-3) var(--title-inset, 12px) var(--sp-1);
    color: var(--ink-3);
  }

  .group:first-child {
    padding-block-start: var(--sp-1);
  }

  ul {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* ONE LINE A CONVERSATION: what it is called, and how long ago, on the text edge; the open one in the chosen fill. The
     "…" takes the time's place under the pointer and is always there under a thumb. */
  .t-line {
    position: relative;
    border-radius: var(--r-ctl);
  }

  /* A ROW'S MENU HANGS OVER THE ROWS AFTER IT. */
  .t-line:has(:global([aria-expanded='true'])) {
    z-index: 2;
  }

  .thread {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: 36px;
    padding: 6px var(--title-inset, 12px);
    border-radius: var(--r-ctl);
    color: var(--ink-2);
    font-size: var(--fs-body);
    text-decoration: none;
    transition: background var(--d-state, 120ms) var(--ease-out, ease);
  }

  @media (hover: hover) {
    .thread:hover {
      background: var(--row-wash);
      color: var(--ink);
    }
  }

  .t-line[data-cursor] .thread {
    background: var(--row-wash);
    color: var(--ink);
    outline: 1px solid var(--rule-strong);
    outline-offset: -1px;
  }

  .thread[aria-current='page'] {
    background: var(--chosen);
    color: var(--ink);
    font-weight: var(--fw-medium);
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
    font-size: var(--fs-cap);
    font-weight: var(--fw-regular, 400);
  }

  /* STILL BEING ANSWERED: one small dot, the app's live colour. */
  .live {
    flex: none;
    inline-size: 7px;
    block-size: 7px;
    border-radius: var(--r-round);
    background: var(--live);
  }

  .sr {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }

  .more {
    position: absolute;
    inset-block: 0;
    inset-inline-end: 4px;
    display: flex;
    align-items: center;
    opacity: 0;
  }

  .more-face {
    display: inline-grid;
    place-items: center;
    inline-size: 28px;
    block-size: 28px;
    border-radius: var(--r-ctl);
    background: var(--tile-2);
    color: var(--ink-2);
  }

  .t-line:hover .more,
  .t-line:focus-within .more,
  .more:has(:global([aria-expanded='true'])) {
    opacity: 1;
  }

  /* THE "…" TAKES THE TIME'S PLACE, and the time does not peek out from behind it. */
  @media (hover: hover) and (pointer: fine) {
    .t-line:hover .when,
    .t-line:focus-within .when {
      visibility: hidden;
    }
  }

  @media (hover: none), (pointer: coarse) {
    .thread {
      padding-inline-end: 44px;
    }

    .more {
      opacity: 1;
    }

    .more-face {
      inline-size: 36px;
      block-size: 36px;
      background: none;
    }
  }

  .name {
    inline-size: 100%;
    min-block-size: 36px;
    padding: 6px var(--title-inset, 12px);
    border: 1px solid var(--rule-strong);
    border-radius: var(--r-ctl);
    background: var(--tile);
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-body);
  }

  .ask {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    padding: var(--sp-2) var(--title-inset, 12px);
    border: 1px solid var(--rule);
    border-radius: var(--r-ctl);
    background: var(--tile);
  }

  .ask-said {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-ctl);
  }

  .ask-do {
    display: flex;
    gap: var(--sp-2);
  }

  .btn {
    min-block-size: 32px;
    padding: 0 var(--sp-3);
    border: 1px solid var(--rule);
    border-radius: var(--r-ctl);
    background: var(--tile);
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-ctl);
    cursor: pointer;
  }

  .danger {
    border-color: var(--rule-strong);
    color: var(--red);
    font-weight: var(--fw-medium);
  }

  .none {
    margin: 0;
    padding: var(--sp-3) var(--title-inset, 12px);
    color: var(--ink-3);
    font-size: var(--fs-ctl);
  }

  @media (pointer: coarse) {
    .thread,
    .name,
    .btn {
      min-block-size: 44px;
    }

    .thread {
      font-size: var(--fs-row, 15px);
    }
  }
</style>
