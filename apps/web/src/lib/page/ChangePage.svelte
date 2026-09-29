<!--
  "Change this page" in a declared page's head, and the page menu that holds it on a phone.

  FROM 900px IT IS A BUTTON beside "How this is built" and Edit layout. Below 900px those two are not drawn, since
  authoring is a desktop surface (13 §10), so the head gains one 44px "More" button whose menu holds "Change this page"
  and "How this is built": a phone changes a page by describing it, and still reads how it is built full screen.

  ITS OWN FILE, NOT LINES IN `PageView.svelte`, which several units write: the head's actions region there is one line
  that mounts this, and the styles for the button and the menu live here with them.
-->
<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { copy } from '$lib/copy.ts';
  import { changeWords as words } from '$lib/record/slash.ts';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Menu from '$lib/ui/Menu.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import AskPage from './AskPage.svelte';

  let {
    slug,
    title,
    showSource,
    reread,
  }: {
    /** The page's address, which the description is about. */
    slug: string;
    /** The page's title, which names the menu for a screen reader. */
    title: string;
    /** Whether the page is drawn as how it is built (`?src=1`), which the menu's second entry toggles. */
    showSource: boolean;
    /** Reads the page again once a change is kept, so it is drawn as it now stands. */
    reread: () => Promise<void>;
  } = $props();

  let open = $state(false);
  let menu = $state(false);

  /* THE SAME FACT THE PALETTE'S SLASH ROW STANDS ON: whether this host has a model behind Slash. */
  const model = $derived(page.data.slash === true);

  /* ONLY AN OWNER MAY ASK SLASH TO DRAFT, as the record's `slashDraft` holds, so a member is not offered a press that
     is always refused. A reader of the sample has no person, and is shown it, since the sheet says why nothing drafts. */
  const mayChange = $derived(page.data.me?.owner !== false);

  const source = (on: boolean) => void goto(`?src=${on ? '1' : '0'}`, { replaceState: true, noScroll: true });

  function toSource() {
    open = false;
    source(true);
  }
</script>

{#if mayChange}
  <span class="change-wide">
    <Button weight="bare" onclick={() => (open = true)}>
      <Icon name="ask" size="s" />
      {words.change}
    </Button>
  </span>
{/if}

<span class="change-narrow">
  <Menu label={words.more(title)} align="end" bind:open={menu}>
    {#snippet trigger()}
      <span class="change-more"><Icon name="more" size="s" /><span class="change-vh">{words.more(title)}</span></span>
    {/snippet}
    {#if mayChange}<button type="button" class="mi" role="menuitem" onclick={() => (open = true)}>{words.change}</button>{/if}
    <button type="button" class="mi" role="menuitem" onclick={() => source(!showSource)}>{showSource ? copy.pageBack : copy.pageSource}</button>
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
  .change-narrow {
    display: none;
  }

  .change-more {
    display: flex;
    align-items: center;
    justify-content: center;
    inline-size: var(--ctl-h);
    min-block-size: var(--ctl-h);
  }

  .change-vh {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* BELOW 900px THE MENU TAKES THE BUTTON'S PLACE, as "How this is built" beside it is hidden there too. */
  @media (width < 900px) {
    .change-wide {
      display: none;
    }

    .change-narrow {
      display: contents;
    }
  }
</style>
