<!--
  The Slash page: ask, and the conversations asked lately.

  ONE COMPOSER, ON THE PAGE. At rest it leads the page, focused at a desk, with what is waiting and three questions fitted
  to where he came from under it. Asked, the conversation is drawn here (`Conversation.svelte`) and the composer docks
  at its foot. The thread is the palette's own (`thread.svelte.ts`), so ⌘J goes on with it anywhere.

  THE ADDRESS SAYS WHICH: `/slash` is a new one, `/slash?t=<id>` a conversation (read back from the record, its rows
  named, `read-back.ts`), and `/slash?with=people%2320` opens with those rows mentioned in the sentence (`with.ts`), the field
  focused: the "Ask about this" link every row page can give (`askAboutHref` in `$lib/query/slash.ts`). `?q=` puts a
  question in the field, to send or change.

  THE CONVERSATIONS ARE A LIST BESIDE IT AT A DESK, grouped by day, the open one marked; on a phone they are under the
  composer at rest and a Back away in a conversation. It is the panel's list (`conversations.svelte.ts`, `ThreadList`), and
  what is half typed is the panel's too, so a change in either is already in the other. If the panel moves the open
  conversation while this page is under it, the address follows.

  WITH NO MODEL BEHIND SLASH, one line says so with the way to connect one, and the composer waits, greyed.

  "PAST SUGGESTIONS", what Slash suggested and what came of it, is `?history`, one quiet link under the list.
-->
<script lang="ts">
  import { page } from '$app/state';
  import { afterNavigate, goto, replaceState } from '$app/navigation';
  import { tick, untrack } from 'svelte';
  import { MediaQuery } from 'svelte/reactivity';
  import { apiBase, at } from '$lib/at.ts';
  import { now as nowLines, pageOf, starters, threadsKey, threadWords, type NowLine, type PageContext } from '$lib/palette/slash-chat.ts';
  import { ask, askingAs, clear, convo, open as openThread, wake } from '$lib/palette/thread.svelte.ts';
  import { draftOf, keepDraft, keepScroll, kept, NEW, scrollOf } from '$lib/palette/conversations.svelte.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { drew } from '$lib/ui/screen.svelte.ts';
  import { copy } from '$lib/copy.ts';
  import Composer from './Composer.svelte';
  import Conversation from './Conversation.svelte';
  import ThreadList from './ThreadList.svelte';
  import { namesOf } from './read-back.ts';
  import { withOf } from './with.ts';
  import type { SentMention } from '$lib/mention/mention.ts';

  const words = {
    title: 'Slash',
    list: 'Conversations',
    fresh: 'New',
    freshLabel: 'New conversation',
    history: 'Past suggestions',
    placeholder: 'Ask anything. Type @ to add an item.',
    followUp: 'Ask a follow-up',
    waiting: 'Waiting on you',
    try: 'Try asking',
    about: 'About',
    needs: 'Slash needs a model to answer. Connect one to ask.',
    connect: 'Connect a model',
  } as const;

  const base = $derived(apiBase());
  const modelHere = $derived(page.data.slash === true);
  const desk = new MediaQuery('(width >= 1100px)', true);

  /* EACH LIST'S GLYPH, by its id, for the rows mentioned and the rows an answer names. */
  const icons = $derived(
    new Map(((page.data as { index?: { registers?: { id: string; icon: string }[] } }).index?.registers ?? []).map((r) => [r.id, String(r.icon)] as const)),
  );

  /* WHOSE THREADS THESE ARE: the person the shell names on this BrainDog (sec-follow M4), as the palette keeps them. */
  const keptAt = $derived(threadsKey(base, (page.data as { me?: { person?: string | null } }).me?.person));
  $effect(() => {
    askingAs(keptAt);
  });

  const threads = $derived(kept.items);
  let listQuery = $state('');

  /* ONLY A HOST WITH A MODEL BEHIND SLASH KEEPS CONVERSATIONS: one with none answers the door refused. */
  let waked = false;
  $effect(() => {
    void keptAt;
    if (modelHere && !waked) {
      waked = true;
      /* NOT THE ONE LEFT OPEN: this address says which, and `/slash` at rest is a new one. */
      wake(base, false);
    }
    drew('ready');
  });

  /* WHERE HE CAME FROM, for the starters and what the ask is sent with. */
  let from = $state<PageContext | null>(null);
  afterNavigate(({ from: f }) => {
    const path = f?.url?.pathname;
    if (path && !/\/slash$/u.test(path)) from = pageOf(path, '');
  });

  /* THE CONVERSATION IN THE ADDRESS, opened as the panel opens one; a new one is drawn here as soon as it is asked. */
  const current = $derived(page.url.searchParams.get('t'));
  let live = $state(false);
  let gone = $state(false);
  let shown: string | null = null;

  $effect(() => {
    const id = current;
    if (id === shown) return;
    shown = id;
    gone = false;
    if (id === null) {
      live = false;
      return;
    }
    live = true;
    placed = null;
    void openThread(id, base).then((ok) => {
      if (shown === id && !ok) gone = true;
    });
  });

  /* THE ADDRESS FOLLOWS THE CONVERSATION: one just given its id gets it, so a reload or a share opens it again, and if the
     panel over this page moved to another, or deleted this one, the page says so. */
  $effect(() => {
    const id = convo.id;
    const empty = convo.turns.length === 0 && !convo.loading;
    if (!live || gone || shown !== current) return;
    if (id !== null && id !== current) {
      shown = id;
      replaceState(at(`/slash?t=${encodeURIComponent(id)}`), {});
    } else if (id === null && empty) {
      shown = null;
      live = false;
      replaceState(at('/slash'), {});
    }
  });

  /* A CONVERSATION'S WORDS ARE THE PANEL'S TOO (`draftOf`), and a new one's until the record names it. */
  const typed = $derived(draftOf(live ? (convo.id ?? NEW) : NEW));
  $effect(() => {
    const d = typed;
    const key = live ? (convo.id ?? NEW) : NEW;
    void d.text;
    void d.mentions;
    untrack(() => keepDraft(key, d));
  });

  /* THE ROWS AN ADDRESS ATTACHES (`?with=`): mentions at the head of the sentence, once their names are read. */
  let withSeen = '';
  let composer = $state<ReturnType<typeof Composer> | null>(null);
  $effect(() => {
    const refs = withOf(page.url);
    const key = refs.join(',');
    if (key === withSeen) return;
    withSeen = key;
    if (refs.length === 0) return;
    const had = new Set(typed.mentions.map((m) => m.ref));
    const added = refs.filter((r) => !had.has(r));
    queueMicrotask(() => composer?.focus());
    void namesOf(base, added).then((names) => {
      for (const ref of [...added].reverse()) composer?.put({ ref, label: names.get(ref) ?? ref.replace('#', ' ') });
      composer?.focus();
    });
  });
  /* ROWS A STARTER WAS PRESSED WITH: its words do not mention them, so they stay with the conversation by name. */
  let carried: string[] = [];

  /* A QUESTION AN ADDRESS CARRIES (`?q=`), put in the field to send or change, never sent for him. */
  let qSeen = '';
  $effect(() => {
    const q = page.url.searchParams.get('q') ?? '';
    if (q === qSeen) return;
    qSeen = q;
    if (q.trim() === '') return;
    typed.text = q.trim().slice(0, 500);
    queueMicrotask(() => composer?.focus());
  });
  let conversation = $state<ReturnType<typeof Conversation> | null>(null);

  /** Where the ask is sent from: the page he came from, so "this" means what he was looking at. */
  const here = (): PageContext => from ?? { path: '/slash', title: words.title };

  /** `sent` is what the field's sentence mentions; a starter has no sentence, and goes with what the field held. */
  async function send(text: string, sent?: readonly SentMention[]) {
    if (convo.busy || convo.loading) return;
    const d = typed;
    if (sent === undefined) carried = [...new Set([...carried, ...d.mentions.map((m) => m.ref)])];
    if (!live || gone) {
      clear();
      live = true;
      gone = false;
    }
    d.text = '';
    d.mentions = [];
    pinned = true;
    placed = null;
    await ask(text, here(), base, { attach: carried, mentions: sent ?? [] });
  }

  function fresh() {
    clear();
    carried = [];
    withSeen = '';
    void goto(at('/slash')).then(() => composer?.focus());
  }

  /* WHAT IS WAITING, from the record (`now`), and three questions fitted to where he came from or to the first mention. */
  let waiting = $state<NowLine[] | null>(null);
  $effect(() => {
    if (!modelHere) return;
    const stop = new AbortController();
    void nowLines(base, stop.signal).then((lines) => (waiting = lines));
    return () => stop.abort();
  });
  const first = $derived(typed.mentions[0]);
  const tries = $derived(
    first
      ? starters({ path: `/r/${first.ref.replace('#', '/')}`, title: first.label, row: first.ref })
      : starters(from ?? { path: '/' }),
  );

  /* THE NEWEST WORDS STAY IN VIEW while they stream, unless he scrolled up to read something older; and a conversation
     opened goes back to where it was left, as the panel's does. */
  let pinned = true;
  let placed: string | null = null;
  const scroller = (): HTMLElement | null => (document.getElementById('main') as HTMLElement | null) ?? (document.scrollingElement as HTMLElement | null);
  function toEnd() {
    void tick().then(() => {
      const el = scroller();
      if (el && pinned) el.scrollTop = el.scrollHeight;
    });
  }
  $effect(() => {
    const el = scroller();
    if (!el) return;
    const on = () => {
      pinned = el.scrollHeight - el.scrollTop - el.clientHeight < 96;
      if (live && placed !== null && placed === convo.id) keepScroll('page', placed, pinned ? null : el.scrollTop);
    };
    el.addEventListener('scroll', on, { passive: true });
    return () => el.removeEventListener('scroll', on);
  });
  $effect(() => {
    const id = convo.id;
    const ready = live && !convo.loading && convo.turns.length > 0;
    untrack(() => {
      if (!ready || id === null || id === placed) return;
      const to = scrollOf('page', id);
      pinned = to === null;
      void tick().then(() => {
        const el = scroller();
        if (!el || convo.id !== id) return;
        el.scrollTop = to ?? el.scrollHeight;
        placed = id;
      });
    });
  });
  $effect(() => {
    const t = convo.turns.at(-1);
    void convo.turns.length;
    void (t?.role === 'slash' ? t.text.length + t.steps.length + t.actions.length + (t.streaming ? 1 : 0) : 0);
    if (live && pinned) toEnd();
  });

  const left = $derived(convo.left !== null && convo.left <= 10 ? threadWords.left(convo.left) : null);
</script>

{#snippet head()}
  {#if live && !desk.current}
    <Button weight="glass" aria-label={words.freshLabel} onclick={fresh}><Icon name="plus" size="m" />{words.fresh}</Button>
  {/if}
{/snippet}

<PageHead icon="slash" title={words.title} actions={head} kicker={live && !desk.current ? words.list : undefined} back={live && !desk.current ? '/slash' : undefined} />

<div class="slash" data-live={live ? '' : undefined} data-listed={threads.length > 0 ? '' : undefined}>
  <section class="main">
    {#if live}
      <div class="talk">
        {#if gone}
          <p class="gone">{threadWords.gone}</p>
        {:else}
          <Conversation bind:this={conversation} {base} {icons} onretry={(q, sent) => void send(q, sent)} />
        {/if}
      </div>
      <div class="dock">
        <Composer
          bind:this={composer}
          bind:value={typed.text}
          bind:mentions={typed.mentions}
          docked
          busy={convo.busy || convo.loading}
          disabled={!modelHere}
          needs={modelHere ? null : { label: words.connect, href: at('/settings/agents') }}
          placeholder={modelHere ? words.followUp : words.needs}
          hint={left}
          onsend={(q, sent) => void send(q, sent)}
          onempty={(k) => (k === 'enter' ? (conversation?.enter() ?? false) : (conversation?.escape() ?? false))}
        />
      </div>
    {:else}
      <Composer
        bind:this={composer}
        bind:value={typed.text}
        bind:mentions={typed.mentions}
        autofocus
        busy={convo.busy}
        disabled={!modelHere}
        needs={modelHere ? null : { label: words.connect, href: at('/settings/agents') }}
        placeholder={modelHere ? words.placeholder : words.needs}
        hint={left}
        onsend={(q, sent) => void send(q, sent)}
      />

      {#if modelHere}
        <div class="ideas">
          {#if waiting && waiting.length > 0 && !first}
            <p class="ideas-head caps-label">{words.waiting}</p>
            <ul class="ideas-list">
              {#each waiting as w (w.text)}
                <li>
                  {#if w.href}
                    <a class="idea tap" href={at(w.href)}><Icon name="arrow" size="s" /><span>{w.text}</span></a>
                  {:else}
                    <button type="button" class="idea tap" onclick={() => void send(w.text)}><Icon name="ask" size="s" /><span>{w.text}</span></button>
                  {/if}
                </li>
              {/each}
            </ul>
          {/if}
          <p class="ideas-head caps-label">{first ? `${words.about} ${first.label}` : words.try}</p>
          <ul class="ideas-list">
            {#each tries as q (q)}
              <li><button type="button" class="idea tap" onclick={() => void send(q)}><Icon name="slash" size="s" /><span>{q}</span></button></li>
            {/each}
          </ul>
        </div>
      {/if}
    {/if}
  </section>

  {#if threads.length > 0 && (desk.current || !live)}
    <aside class="side">
      {#if !desk.current}<h2 class="side-head">{words.list}</h2>{/if}
      {#if live}<button type="button" class="new tap" onclick={fresh}><Icon name="plus" size="s" />{words.freshLabel}</button>{/if}
      <ThreadList {threads} current={live ? (convo.id ?? current) : null} now={kept.now} label={words.list} bind:query={listQuery} />
      <a class="past tap" href={at('/slash?history')}><Icon name="history" size="s" />{words.history}</a>
    </aside>
  {:else if !live}
    <p class="past-alone"><a class="past tap" href={at('/slash?history')}><Icon name="history" size="s" />{words.history}</a></p>
  {/if}
</div>

<style>
  /* ONE COLUMN ON A PHONE AND A TABLET, the composer first; AT A DESK the conversations beside it, on the left. */
  .slash {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--sp-6);
    padding: var(--page-head-gap, 24px) var(--gutter) var(--page-bottom, 64px);
  }

  @media (width >= 1100px) {
    .slash[data-listed] {
      grid-template-columns: 264px minmax(0, 1fr);
      gap: var(--sp-6);
    }

    .slash[data-listed] .side {
      grid-row: 1;
      grid-column: 1;
      position: sticky;
      inset-block-start: var(--sp-4);
      align-self: start;
      max-block-size: calc(100dvh - 140px);
      overflow: hidden;
      margin-inline-start: calc(-1 * var(--title-inset, 12px));
    }

    /* THE LIST SCROLLS, AND ONLY THE LIST: the button above it and Past suggestions under it stay put, and a long list can no longer run over the link. */
    .slash[data-listed] .side :global(.side-list) {
      flex: 1 1 auto;
      min-block-size: 0;
    }

    .slash[data-listed] .side :global(.t-list) {
      flex: 1 1 auto;
      min-block-size: 0;
      overflow-y: auto;
      overscroll-behavior: contain;
    }

    .slash[data-listed] .side .past {
      flex: none;
    }

    .slash[data-listed] .main {
      grid-column: 2;
    }
  }

  .main {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
    inline-size: 100%;
    max-inline-size: 760px;
    min-inline-size: 0;
  }

  .slash[data-live] .main {
    min-block-size: calc(100dvh - 180px);
  }

  .talk {
    flex: 1;
  }

  /* THE COMPOSER DOCKED AT THE FOOT OF A CONVERSATION, over a fade of the board so the words slide under it. */
  .dock {
    position: sticky;
    inset-block-end: 0;
    z-index: 5;
    margin-block-start: auto;
    padding-block: var(--sp-4);
  }

  /* WHAT SCROLLS UNDER IT IS BLURRED AWAY, fading in over its first 24px: the ground shows through, no band of colour. */
  .dock::before {
    content: '';
    position: absolute;
    inset: 0 calc(-1 * var(--sp-3));
    z-index: -1;
    -webkit-backdrop-filter: var(--g-bf);
    backdrop-filter: var(--g-bf);
    -webkit-mask-image: linear-gradient(to bottom, transparent, #000 var(--sp-5));
    mask-image: linear-gradient(to bottom, transparent, #000 var(--sp-5));
  }

  @media (width < 900px) {
    .dock {
      inset-block-end: var(--tabbar, 72px);
      padding-block-end: var(--sp-3);
    }
  }

  .side-head {
    margin: 0;
    padding-inline: var(--title-inset, 12px);
    color: var(--ink);
    font: var(--t-head, 600 17px/22px var(--font-ui));
    letter-spacing: var(--track-head, -0.01em);
  }

  /* WHAT TO ASK: two short lists under the composer, each line one press. */
  .ideas {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
  }

  .ideas-head {
    margin: var(--sp-3) 0 0;
    padding-inline: var(--title-inset, 12px);
    color: var(--ink-3);
  }

  .ideas-head:first-child {
    margin-block-start: 0;
  }

  .ideas-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .idea {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    inline-size: 100%;
    min-block-size: 40px;
    padding: 8px var(--title-inset, 12px);
    border: 0;
    border-radius: var(--r-ctl);
    background: none;
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-body);
    text-align: start;
    text-decoration: none;
    cursor: pointer;
  }

  .idea :global(svg) {
    flex: none;
    color: var(--ink-3);
  }

  @media (hover: hover) {
    .idea:hover {
      background: var(--row-wash);
    }
  }

  @media (pointer: coarse) {
    .idea {
      min-block-size: 44px;
    }
  }

  .side {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  /* NEW CONVERSATION, the list's first line at a desk while one is open. */
  .new {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: 36px;
    padding-inline: var(--title-inset, 12px);
    border: 0;
    border-radius: var(--r-ctl);
    background: var(--soft-fill);
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-ctl);
    font-weight: var(--fw-medium);
    cursor: pointer;
  }

  @media (hover: hover) {
    .new:hover {
      background: var(--row-wash-press, var(--soft-fill));
    }
  }

  .past {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    align-self: flex-start;
    min-block-size: 32px;
    padding-inline: var(--title-inset, 12px);
    color: var(--ink-3);
    font-size: var(--fs-ctl);
    text-decoration: none;
  }

  .past:hover {
    color: var(--ink);
  }

  .past-alone {
    margin: 0;
  }

  .gone {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
  }
</style>
