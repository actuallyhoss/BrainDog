<!--
  The page menu in a declared page's head: one "⋯" beside Share, holding "Change this page", "How this is built" and
  Edit layout.

  ONE MENU AT EVERY WIDTH. The head drew four controls side by side from 900px up (How this is built, Share, Change this
  page, Edit layout), which is chrome a reader meets on every page and uses on few (DIRECTION §35: fewer things on
  screen). Share stays out in the row, because it is the one a reader reaches for; the rest are one press away here.
  Edit layout is offered from 900px only, since authoring is a desktop surface (13 §10); a phone still changes a page
  by describing it, and still reads how it is built.

  ITS OWN FILE, NOT LINES IN `PageView.svelte`, which several units write: the head's actions region there is one line
  that mounts this, and the styles for the trigger and the menu live here with them.
-->
<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { MediaQuery } from 'svelte/reactivity';
  import { copy } from '$lib/copy.ts';
  import { changeWords as words } from '$lib/record/slash.ts';
  import Icon from '$lib/ui/Icon.svelte';
  import Menu from '$lib/ui/Menu.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import AskPage from './AskPage.svelte';

  let {
    slug,
    title,
    showSource,
    reread,
    onarrange = null,
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
  } = $props();

  let open = $state(false);
  let menu = $state(false);

  /* THE SAME FACT THE PALETTE'S SLASH ROW STANDS ON: whether this host has a model behind Slash. */
  const model = $derived(page.data.slash === true);

  /* ONLY AN OWNER MAY ASK SLASH TO DRAFT, as the record's `slashDraft` holds, so a member is not offered a press that
     is always refused. A reader of the sample has no person, and is shown it, since the sheet says why nothing drafts. */
  const mayChange = $derived(page.data.me?.owner !== false);

  /* EDIT LAYOUT FROM 900px, the width the arranging mode is drawn for. Read as the menu is drawn, so a window narrowed
     with the menu shut offers it no more. */
  const wide = new MediaQuery('(width >= 900px)', false);

  /* THE SOURCE KEEPS THE REST OF THE ADDRESS, as ⇧E does, so on /?work it stays on Work, filters and all. */
  function source(on: boolean) {
    const q = new URLSearchParams(page.url.searchParams);
    q.set('src', on ? '1' : '0');
    void goto(`?${q}`, { replaceState: true, noScroll: true });
  }

  function toSource() {
    open = false;
    source(true);
  }
</script>

<!-- `page-more` and `data-arrange` NAME THE WAY INTO EDIT LAYOUT for a gate, which opened it from its own button. -->
<span class="page-more">
<Menu label={words.more(title)} align="end" bind:open={menu}>
  {#snippet trigger()}
    <span class="change-more"><Icon name="more" size="s" /><span class="change-vh">{words.more(title)}</span></span>
  {/snippet}
  {#if mayChange}<button type="button" class="mi" role="menuitem" onclick={() => (open = true)}><Icon name="ask" size="s" />{words.change}</button>{/if}
  <button type="button" class="mi" role="menuitem" onclick={() => source(!showSource)}
    ><Icon name="code" size="s" />{showSource ? copy.pageBack : copy.pageSource}</button
  >
  {#if onarrange && wide.current}
    <button type="button" class="mi" role="menuitem" data-arrange onclick={() => onarrange?.()}><Icon name="grid" size="s" />{copy.arrange}</button>
  {/if}
</Menu>
</span>

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

  .change-vh {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
