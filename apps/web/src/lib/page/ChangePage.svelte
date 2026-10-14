<!--
  The page menu in a declared page's head: one "⋯" beside Share, holding "Change this page", Pin this or Unpin, "How
  this is built" and Edit layout.

  PIN THIS KEEPS THE PAGE AS IT IS DRAWN (DIRECTION §38: a composition is a proposal the person can pin, change or undo,
  and his pins always win): every block in its place, as the person's own look (`look.ts`), so the engine stops
  arranging it. Unpin lets the engine arrange it again. Either says what it did with an Undo. Under them, in a quiet
  line, how the page came to look as it does: "Slash arranged · Mara kept", or that it is pinned. Only the owner pins,
  as only the owner sets a declaration.

  ONE MENU AT EVERY WIDTH. The head drew four controls side by side from 900px up (How this is built, Share, Change this
  page, Edit layout), which is chrome a reader meets on every page and uses on few (DIRECTION §35: fewer things on
  screen). Share stays out in the row, because it is the one a reader reaches for; the rest are one press away here.
  Edit layout is offered from 900px only, since authoring is a desktop surface (13 §10); a phone still changes a page
  by describing it, and still reads how it is built.

  ON A HOME (Today, Decide) THE SAME MENU, with what that home can take: Edit layout always, and Change this page and How
  this is built once the record holds the page, the second at the page's own address since a home draws no source.
  A menu with nothing to offer is not drawn.

  ITS OWN FILE, NOT LINES IN `PageView.svelte`, which several units write: the head's actions region there is one line
  that mounts this, and the styles for the trigger and the menu live here with them.
-->
<script lang="ts">
  import { at } from '$lib/at.ts';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { MediaQuery } from 'svelte/reactivity';
  import { copy } from '$lib/copy.ts';
  import { changeWords as words } from '$lib/record/slash.ts';
  import Icon from '$lib/ui/Icon.svelte';
  import Menu from '$lib/ui/Menu.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { apiBase } from '$lib/at.ts';
  import type { LiveLook } from '$lib/record/page-live.ts';
  import AskPage from './AskPage.svelte';
  import { describeAsked, opensDescribe, withoutDescribe } from './change-open.ts';
  import {
    bodyOf,
    hiddenOf,
    historyOf,
    isPinned,
    keptHere,
    lookPage,
    offerKey,
    pinBody,
    putBack,
    putBackSaid,
    putBackWords,
    retireLook,
    showBody,
    writeLook,
    type Hidden,
    type Headed,
  } from './look.ts';
  import { words as pageWords } from './words.ts';

  let {
    slug,
    title,
    showSource,
    reread,
    onarrange = null,
    source = 'here',
    change = true,
    look = null,
    keys = () => [],
    heads = () => [],
  }: {
    /** The page's address, which the description is about. */
    slug: string;
    /** The page's title, which names the menu for a screen reader. */
    title: string;
    /** Whether the page is drawn as how it is built (`?src=1`), which the menu's second entry toggles. */
    showSource: boolean;
    /** Reads the page again once a change is kept, so it is drawn as it now stands. */
    reread: () => Promise<void>;
    /** Opens Edit layout, or `null` where this reader may not arrange the page or it is drawn as its source. */
    onarrange?: (() => void) | null;
    /** Where How this is built is drawn: `here` toggles it in place, an address goes there, and `null` offers none. */
    source?: 'here' | string | null;
    /** Whether Change this page is offered, for a page the record holds. */
    change?: boolean;
    /** How the engine arranged the page, as the record answered it, or `null` where it sent none. */
    look?: LiveLook | null;
    /** The page's blocks by key, in the order they are drawn now, which Pin this keeps. */
    keys?: () => readonly string[];
    /** The page's blocks by key with their headings, which Hidden names what the look hides by. */
    heads?: () => readonly Headed[];
  } = $props();

  let open = $state(false);
  let menu = $state(false);

  /* THE SAME FACT THE PALETTE'S SLASH ROW STANDS ON: whether this host has a model behind Slash. */
  const model = $derived(page.data.slash === true);

  /* ONLY AN OWNER MAY ASK SLASH TO DRAFT, as the record's `slashDraft` holds, so a member is not offered a press that
     is always refused. A reader of the sample has no person, and is shown it, since the sheet says why nothing drafts. */
  const mayChange = $derived(change && page.data.me?.owner !== false);

  /* A PAGE JUST MADE OPENS ON ITS DESCRIBE FIELD (ENG-B11): the palette opens it at `?describe=1`, and this reads the
     mark once. The sheet opens when this reader may change the page and the host has a model; with none the page opens
     as it always did. Either way the mark leaves the address, replaced and not pushed, so Back and a reload do not open
     the sheet again. `answered` is the address already dealt with, so nothing here runs twice while the address turns. */
  let answered = '';
  $effect(() => {
    if (!describeAsked(page.url) || answered === page.url.href) return;
    answered = page.url.href;
    if (opensDescribe({ asked: true, mayChange, model })) open = true;
    /* THROUGH `at()`, which hands back an address already under the app as it is (`at-sites.test.ts`). */
    void goto(at(withoutDescribe(page.url)), { replaceState: true, noScroll: true, keepFocus: true });
  });

  /* EDIT LAYOUT FROM 900px, the width the arranging mode is drawn for. Read as the menu is drawn, so a window narrowed
     with the menu shut offers it no more. */
  const wide = new MediaQuery('(width >= 900px)', false);

  /* THE SOURCE KEEPS THE REST OF THE ADDRESS, as ⇧E does, so on /?work it stays on Work, filters and all. */
  function toggle(on: boolean) {
    const q = new URLSearchParams(page.url.searchParams);
    q.set('src', on ? '1' : '0');
    void goto(`?${q}`, { replaceState: true, noScroll: true });
  }

  function toSource() {
    open = false;
    if (source === 'here') toggle(true);
    else if (source) void goto(at(source));
  }

  /* ── the pin ───────────────────────────────────────────────────────────────
     THE OWNER'S, as setting any declaration is, and only on a page the record holds. */
  const mayPin = $derived(change && page.data.me?.owner === true);
  const pinned = $derived(isPinned(look));
  /** The page the look is written under: the declaration it is laid over, which a template's pages share. */
  const under = $derived(lookPage(slug, look));
  /* READ AGAIN AS THE MENU OPENS, so an arrangement kept a moment ago in this tab says who kept it (`keptHere`). */
  const history = $derived((void menu, historyOf(look, look ? (keptHere.get(offerKey(under, look)) ?? null) : null)));
  let pinning = false;

  /** Writes the pin, or takes it away, reads the page as it now stands, and says so with the way back. */
  async function pin(on: boolean) {
    if (pinning) return;
    pinning = true;
    const was = look;
    try {
      const at = under;
      const out = on ? await writeLook(apiBase(), pinBody(at, was, keys())) : await retireLook(apiBase(), at);
      if (!out.ok) return void toasts.push(out.fix, { intent: 'warn' });
      await reread();
      toasts.push(on ? pageWords.pinned(title) : pageWords.unpinned(title), {
        /* THE WAY BACK IS THE LOOK AS IT WAS: the one stored before written again, Slash's or the person's, or none where
           the rules arranged the page, since the rules' look is worked out and never stored. The person's comes back
           without the headline and next action the engine filled in around their pins (`mergeLook`), or putting it back
           would freeze the engine's line of that moment as theirs. */
        undo: () =>
          void restore(at, was),
      });
    } finally {
      pinning = false;
    }
  }

  /** Writes the look as it was before a pin or a Show, or retires it where the rules arranged the page, and reads again. */
  async function restore(at: string, was: LiveLook | null) {
    const back = await (was && was.by !== 'rule'
      ? writeLook(apiBase(), bodyOf(at, was.by === 'owner' ? { ...was, headline: null, next: null } : was))
      : retireLook(apiBase(), at));
    if (!back.ok) toasts.push(back.fix, { intent: 'warn' });
    await reread();
  }

  /* ── put back and hidden ───────────────────────────────────────────────────
     PUT BACK IS ONE STEP BACK WHOEVER WROTE THE LOOK, any day after its toast has gone (PGS-B12): named by whose look it
     takes off and the day it was written, when the record says (`look.at`). The owner's, as the pin is. */
  const backLine = $derived(putBackWords(look, look?.at));
  /* WHAT THE LOOK HIDES, read again as the menu opens, offered back one by one (PGS-B08). */
  const hidden = $derived((void menu, hiddenOf(look, heads())));
  let hiddenOpen = $state(false);
  let writing = false;

  async function putBackNow() {
    if (writing) return;
    writing = true;
    try {
      const out = await putBack(apiBase(), under);
      if (!out.ok) return void toasts.push(out.fix, { intent: 'warn' });
      await reread();
      toasts.push(putBackSaid(title, out.restored));
    } finally {
      writing = false;
    }
  }

  /** Shows one hidden block as the person's own look, and says so with the way back. */
  async function show(h: Hidden) {
    if (writing) return;
    writing = true;
    const was = look;
    try {
      const at = under;
      const out = await writeLook(apiBase(), showBody(at, was, h.key));
      if (!out.ok) return void toasts.push(out.fix, { intent: 'warn' });
      await reread();
      toasts.push(`${h.heading} is shown on ${title} again.`, { undo: () => void restore(at, was) });
    } finally {
      writing = false;
    }
  }

  /** Whether the menu holds anything at this width; one that would open on nothing is not drawn. */
  const offers = $derived(mayChange || mayPin || source !== null || (onarrange !== null && wide.current));
</script>

<!-- `page-more` and `data-arrange` NAME THE WAY INTO EDIT LAYOUT for a gate, which opened it from its own button. -->
{#if offers}
<span class="page-more">
<Menu label={words.more(title)} align="end" bind:open={menu}>
  {#snippet trigger()}
    <span class="change-more"><Icon name="more" size="s" /><span class="change-vh">{words.more(title)}</span></span>
  {/snippet}
  {#if mayChange}<button type="button" class="mi" role="menuitem" onclick={() => (open = true)}><Icon name="ask" size="s" />{words.change}</button>{/if}
  {#if mayPin}
    <!-- THE PIN, NAMED BY HOW THE PAGE CAME TO LOOK AS IT DOES, which is drawn under it as a quiet line and said to a
         screen reader as the group's name. -->
    <div role="group" aria-label={history ?? undefined}>
      <button type="button" class="mi" role="menuitem" onclick={() => void pin(!pinned)}
        ><Icon name={pinned ? 'slash' : 'lock'} size="s" />{pinned ? pageWords.unpin : pageWords.pin}</button
      >
      {#if history}<p class="change-history" aria-hidden="true">{history}</p>{/if}
    </div>
    {#if backLine}<button type="button" class="mi" role="menuitem" onclick={() => void putBackNow()}><Icon name="history" size="s" />{backLine}</button>{/if}
    {#if hidden.length > 0}
      <!-- A CHECKABLE ITEM, so opening the short list leaves the menu open; each Show is a verb and closes it. -->
      <button type="button" class="mi" role="menuitemcheckbox" aria-checked={hiddenOpen} onclick={() => (hiddenOpen = !hiddenOpen)}
        ><Icon name="eye" size="s" />Hidden ({hidden.length})</button
      >
      {#if hiddenOpen}
        <div role="group" aria-label="Hidden">
          {#each hidden as h (h.key)}
            <button type="button" class="mi change-hidden" role="menuitem" aria-label={`Show ${h.heading}`} onclick={() => void show(h)}
              ><span class="change-hidden-name">{h.heading}</span><span class="change-show" aria-hidden="true">Show</span></button
            >
          {/each}
        </div>
      {/if}
    {/if}
  {/if}
  {#if source === 'here'}
    <button type="button" class="mi" role="menuitem" onclick={() => toggle(!showSource)}
      ><Icon name="code" size="s" />{showSource ? copy.pageBack : copy.pageSource}</button
    >
  {:else if source}
    <button type="button" class="mi" role="menuitem" onclick={toSource}><Icon name="code" size="s" />{copy.pageSource}</button>
  {/if}
  {#if onarrange && wide.current}
    <button type="button" class="mi" role="menuitem" data-arrange onclick={() => onarrange?.()}><Icon name="grid" size="s" />{copy.arrange}</button>
  {/if}
</Menu>
</span>
{/if}

{#if mayChange}
  <Sheet bind:open title={words.change}>
    <!-- KEYED BY THE PAGE, because the reader is kept across pages and a draft for the last page is not this one's. -->
    {#key slug}
      <AskPage page={slug} {model} onsource={toSource} onkept={reread} />
    {/key}
  </Sheet>
{/if}

<style>
  .page-more {
    display: contents;
  }

  /* A CIRCLE THE TOOLBAR'S HEIGHT, with no fill of its own: the quiet end of the row, beside Share. The wash says it
     can be pressed once the pointer is on it. */
  .change-more {
    display: flex;
    align-items: center;
    justify-content: center;
    inline-size: var(--ctl-h);
    min-block-size: var(--ctl-h);
    border-radius: var(--r-pill);
    color: var(--ink2);
    transition:
      background var(--d-state) var(--ease-out),
      color var(--d-state) var(--ease-out);
  }

  @media (hover: hover) and (pointer: fine) {
    .page-more :global(.menu-trigger:hover > .change-more) {
      background: var(--hover-wash);
      color: var(--ink);
    }
  }

  .page-more :global(.menu-trigger[aria-expanded='true'] > .change-more) {
    background: var(--hover-wash);
    color: var(--ink);
  }

  /* HOW THE PAGE CAME TO LOOK AS IT DOES: a caption under the pin, in the menu's quiet ink, never a control. */
  .change-history {
    margin: 0;
    padding: 0 var(--sp-3) var(--sp-2) calc(var(--sp-3) + 16px + var(--sp-2));
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: 1.45;
  }

  /* WHAT THE LOOK HIDES, one line each under Hidden, set in as the history line is, with Show at the trailing edge in
     the working accent, since it is the verb. */
  .page-more .change-hidden {
    padding-inline-start: calc(var(--sp-3) + 16px + var(--sp-2));
  }

  .change-hidden-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .change-show {
    margin-inline-start: auto;
    padding-inline-start: var(--sp-3);
    color: var(--link);
  }

  .change-vh {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
