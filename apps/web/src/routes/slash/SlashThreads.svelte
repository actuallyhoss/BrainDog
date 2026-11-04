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
  composer at rest and a Back away in a conversation. The record lists them (`threads`), so one had on another device is
  here too; this device's own list fills in when the record cannot be reached.

  WITH NO MODEL BEHIND SLASH, one line says so with the way to connect one, and the composer waits, greyed.

  "PAST SUGGESTIONS", what Slash suggested and what came of it, is `?history`, one quiet link under the list.
-->
<script lang="ts">
  import { page } from '$app/state';
  import { afterNavigate, goto, replaceState } from '$app/navigation';
  import { MediaQuery } from 'svelte/reactivity';
  import { apiBase, at } from '$lib/at.ts';
  import { keptThreads, now as nowLines, pageOf, starters, threadsKey, threadWords, threads as recordThreads, type KeptThread, type NowLine, type PageContext } from '$lib/palette/slash-chat.ts';
  import { ask, askingAs, clear, convo } from '$lib/palette/thread.svelte.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { drew } from '$lib/ui/screen.svelte.ts';
  import { copy } from '$lib/copy.ts';
  import Composer from './Composer.svelte';
  import Conversation from './Conversation.svelte';
  import ThreadList from './ThreadList.svelte';
  import { readBack, namesOf } from './read-back.ts';
  import { withOf } from './with.ts';
  import type { Mention, SentMention } from '$lib/mention/mention.ts';

  const words = {
    title: 'Slash',
    list: 'Conversations',
    fresh: 'New',
    freshLabel: 'New conversation',
    history: 'Past suggestions',
    placeholder: 'Ask anything. Type @ to add a row.',
    followUp: 'Ask a follow-up',
    waiting: 'Waiting on you',
    try: 'Try asking',
    about: 'About',
    needs: 'Slash needs a model to answer. Connect one to ask.',
    connect: 'Connect a model',
    reading: 'Reading the conversation back',
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

  let threads = $state<KeptThread[]>([]);
  let now = $state(Date.now());

  function loadThreads() {
    threads = keptThreads(keptAt);
    now = Date.now();
    /* ONLY A HOST WITH A MODEL BEHIND SLASH KEEPS CONVERSATIONS: one with none answers the door refused. */
    if (!modelHere) return;
    void recordThreads(base).then((kept) => {
      if (!kept) return;
      const byId = new Map(keptThreads(keptAt).map((t) => [t.id, t]));
      for (const t of kept) byId.set(t.id, { ...t, title: t.title || byId.get(t.id)?.title || '' });
      threads = [...byId.values()].sort((a, b) => b.at - a.at);
      now = Date.now();
    });
  }

  $effect(() => {
    void keptAt;
    void modelHere;
    loadThreads();
    drew('ready');
  });

  /* WHERE HE CAME FROM, for the starters and what the ask is sent with. */
  let from = $state<PageContext | null>(null);
  afterNavigate(({ from: f }) => {
    const path = f?.url?.pathname;
    if (path && !/\/slash$/u.test(path)) from = pageOf(path, '');
  });

  /* THE CONVERSATION IN THE ADDRESS, read back once; a new one is drawn here as soon as it is asked. */
  const current = $derived(page.url.searchParams.get('t'));
  let live = $state(false);
  let reading = $state(false);
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
    if (convo.id === id && convo.turns.length > 0) return;
    reading = true;
    void readBack(base, id).then((t) => {
      if (shown !== id) return;
      reading = false;
      if (!t) {
        gone = true;
        return;
      }
      clear();
      convo.id = t.id;
      convo.turns = t.turns;
      pinned = true;
      toEnd();
    });
  });

  /* A NEW CONVERSATION GETS ITS ADDRESS once the record names it, so a reload or a share opens it again. */
  let minted = false;
  $effect(() => {
    const id = convo.id;
    if (!minted || !live || id === null || id === current) return;
    minted = false;
    shown = id;
    replaceState(at(`/slash?t=${encodeURIComponent(id)}`), {});
  });

  /* THE ROWS AN ADDRESS ATTACHES (`?with=`): mentions at the head of the sentence, once their names are read. */
  let mentions = $state<Mention[]>([]);
  let withSeen = '';
  let composer = $state<ReturnType<typeof Composer> | null>(null);
  $effect(() => {
    const refs = withOf(page.url);
    const key = refs.join(',');
    if (key === withSeen) return;
    withSeen = key;
    if (refs.length === 0) return;
    const had = new Set(mentions.map((m) => m.ref));
    const added = refs.filter((r) => !had.has(r));
    queueMicrotask(() => composer?.focus());
    void namesOf(base, added).then((names) => {
      for (const ref of [...added].reverse()) composer?.put({ ref, label: names.get(ref) ?? ref.replace('#', ' ') });
      composer?.focus();
    });
  });
  /* ROWS A STARTER WAS PRESSED WITH: its words do not mention them, so they stay with the conversation by name. */
  let carried: string[] = [];

  let draft = $state('');
  /* A QUESTION AN ADDRESS CARRIES (`?q=`), put in the field to send or change, never sent for him. */
  let qSeen = '';
  $effect(() => {
    const q = page.url.searchParams.get('q') ?? '';
    if (q === qSeen) return;
    qSeen = q;
    if (q.trim() === '') return;
    draft = q.trim().slice(0, 500);
    queueMicrotask(() => composer?.focus());
  });
  let conversation = $state<ReturnType<typeof Conversation> | null>(null);

  /** Where the ask is sent from: the page he came from, so "this" means what he was looking at. */
  const here = (): PageContext => from ?? { path: '/slash', title: words.title };

  /** `sent` is what the field's sentence mentions; a starter has no sentence, and goes with what the field held. */
  async function send(text: string, sent?: readonly SentMention[]) {
    if (convo.busy) return;
    if (sent === undefined) carried = [...new Set([...carried, ...mentions.map((m) => m.ref)])];
    if (!live || gone) {
      clear();
      live = true;
      gone = false;
      minted = true;
    }
    draft = '';
    mentions = [];
    pinned = true;
    await ask(text, here(), base, { attach: carried, mentions: sent ?? [] });
    loadThreads();
  }

  function fresh() {
    clear();
    mentions = [];
    carried = [];
    draft = '';
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
  const first = $derived(mentions[0]);
  const tries = $derived(
    first
      ? starters({ path: `/r/${first.ref.replace('#', '/')}`, title: first.label, row: first.ref })
      : starters(from ?? { path: '/' }),
  );

  /* THE NEWEST WORDS STAY IN VIEW while they stream, unless he scrolled up to read something older. */
  let pinned = true;
  const scroller = (): HTMLElement | null => (document.getElementById('main') as HTMLElement | null) ?? (document.scrollingElement as HTMLElement | null);
  function toEnd() {
    queueMicrotask(() => {
      const el = scroller();
      if (el && pinned) el.scrollTop = el.scrollHeight;
    });
  }
  $effect(() => {
    const el = scroller();
    if (!el) return;
    const on = () => {
      pinned = el.scrollHeight - el.scrollTop - el.clientHeight < 96;
    };
    el.addEventListener('scroll', on, { passive: true });
    return () => el.removeEventListener('scroll', on);
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
        {#if reading}
          <div class="ghost" aria-label={words.reading} role="status">
            <span class="ghost-you"></span>
            <span class="ghost-line"></span><span class="ghost-line short"></span>
            <span class="ghost-you"></span>
            <span class="ghost-line"></span>
          </div>
        {:else if gone}
          <p class="gone">{threadWords.gone}</p>
        {:else}
          <Conversation bind:this={conversation} {base} {icons} onretry={(q, sent) => void send(q, sent)} />
        {/if}
      </div>
      <div class="dock">
        <Composer
          bind:this={composer}
          bind:value={draft}
          bind:mentions
          docked
          busy={convo.busy}
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
        bind:value={draft}
        bind:mentions
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
      <ThreadList {threads} current={live ? (convo.id ?? current) : null} {now} label={words.list} />
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
      overflow-y: auto;
      overscroll-behavior: contain;
      margin-inline-start: calc(-1 * var(--title-inset, 12px));
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
    -webkit-backdrop-filter: blur(14px);
    backdrop-filter: blur(14px);
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

  /* READING A CONVERSATION BACK: its shape, still, the size of what will come. */
  .ghost {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
  }

  .ghost span {
    display: block;
    border-radius: 9px;
    background: var(--soft-fill);
  }

  .ghost-you {
    align-self: flex-end;
    inline-size: 40%;
    block-size: 42px;
    border-radius: 18px !important;
    margin-block: var(--sp-3);
  }

  .ghost-line {
    inline-size: 86%;
    block-size: 14px;
    margin-inline-start: 40px;
  }

  .ghost-line.short {
    inline-size: 52%;
  }
</style>
