<!--
  WHERE THE QUICK-ADD SHEET IS DRAWN FROM: the floating + on a money page on a phone, the `+` key, and the sheet itself.

  A DECLARED PAGE MOUNTS ONE (`page/PageView.svelte`), so the key and the palette's three rows work on every page the
  record draws, Today included, and on none of the hand-written screens. Several readers on one screen mount several;
  the first one draws and answers, the rest wait (`quick.svelte.ts`).

  THE LEDGER IS FOUND ONCE A RECORD, from the declarations the tab already holds (`read.ts` `findLedger`), and the sheet
  and its reads arrive only when it is opened.

  THE KEY STANDS DOWN AS THE SHELL'S OWN KEYS DO: while a box has the caret, while anything is open over the page, with a
  modifier held, and when character keys are switched off (`a11y/chars.ts`).
-->
<script lang="ts">
  import { page } from '$app/state';

  import { apiBase } from '$lib/at.ts';
  import { covered, silenced, typing } from '$lib/a11y/keys.svelte.ts';
  import { inField } from '$lib/a11y/typed.ts';
  import Icon from '$lib/ui/Icon.svelte';
  import { words } from './quick.ts';
  import { quick } from './quick.svelte.ts';

  let {
    /** The page draws the ledger or its accounts, so a phone shows the floating +. */
    fab = false,
  }: { fab?: boolean } = $props();

  const lists = $derived((page.data as { lists?: { id: string; kernel?: true }[]; live?: boolean } | undefined)?.lists ?? []);
  const live = $derived((page.data as { live?: boolean } | undefined)?.live === true);

  let ticket = $state<number | null>(null);
  $effect(() => {
    const t = quick.join();
    ticket = t;
    return () => {
      quick.leave(t);
      ticket = null;
    };
  });
  const leads = $derived(ticket !== null && quick.leads(ticket));

  /* THE LEDGER OF THIS RECORD, asked once it is known which lists it holds. A record left for another is asked again. */
  $effect(() => {
    if (!leads || !live || lists.length === 0) return;
    const base = apiBase();
    if (quick.base === base) return;
    quick.found(base, null);
    const asked = lists;
    void import('./read.ts')
      .then((m) => m.findLedger(base, asked))
      .then((l) => {
        if (quick.base === base) quick.found(base, l);
      })
      .catch(() => undefined);
  });

  function onkeydown(e: KeyboardEvent) {
    if (!leads || e.key !== '+' || e.defaultPrevented) return;
    if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
    if (covered() || typing() || inField(e.target) || silenced(e)) return;
    if (!quick.start('out')) return;
    e.preventDefault();
  }

  /* THE + STEPS ASIDE WHILE THE PAGE IS READ DOWNWARDS (30 October, Q35): floating at the end edge it sat on the amounts
     of every row it passed. It comes back the moment the page moves up, and at the page's foot, which the Money look's
     padding keeps clear of it. */
  let away = $state(false);
  /* THE SHELL SCROLLS ITS OWN BODY, NOT THE WINDOW (`+layout.svelte` `.body`), so the move is heard on the way down
     from whatever scrolled, each scroller with the last place it stood. */
  $effect(() => {
    const last = new WeakMap<EventTarget, number>();
    const onscroll = (e: Event): void => {
      const el = e.target instanceof Element ? e.target : document.scrollingElement;
      if (!el) return;
      const y = el.scrollTop;
      /* FROM THE TOP, where every page opens: a scroller's first move was its own baseline, so one fling down (a jump to
         a list) left the + on the amounts it stopped over (recheck of 30 October, 35). */
      const was = last.get(el) ?? 0;
      const foot = el.scrollTop + el.clientHeight >= el.scrollHeight - 8;
      away = !foot && y > was + 2 ? true : y < was - 2 || foot ? false : away;
      last.set(el, y);
    };
    document.addEventListener('scroll', onscroll, { capture: true, passive: true });
    return () => document.removeEventListener('scroll', onscroll, { capture: true });
  });
</script>

<svelte:window {onkeydown} />

{#if leads && fab && quick.ledger && !quick.open}
  <button type="button" class="qa-fab" data-away={away ? '' : undefined} aria-label={words.fab} title={words.fab} aria-keyshortcuts="+" onclick={() => quick.start('out')}>
    <Icon name="plus" size="l" />
  </button>
{/if}

{#if leads && quick.open && quick.ledger && quick.base}
  {#await import('./QuickAdd.svelte') then { default: QuickAdd }}
    <QuickAdd ledger={quick.ledger} base={quick.base} {lists} />
  {/await}
{/if}

<style>
  /* THE FLOATING +, ON A PHONE ONLY: a square of radius 8 as every button is, in the red fill, at the end edge over the tab bar. From 900 up the `+` key
     and the palette are the way in, and a button floating over a desk's tiles would cover them. */
  .qa-fab {
    display: none;
  }

  @media (width < 900px) {
    /* ROOM UNDER THE PAGE FOR THE +, so its last line is never under the button (audit 31 Oct i, AI2): the button's
       height and a gap each side. */
    :global(:root:has(.qa-fab) .page) {
      padding-block-end: calc(56px + 2 * var(--sp-4));
    }

    .qa-fab {
      position: fixed;
      inset-inline-end: var(--sp-4);
      inset-block-end: calc(var(--tabbar) + var(--sp-4));
      z-index: var(--z-raise);
      display: grid;
      place-items: center;
      inline-size: 56px;
      block-size: 56px;
      border: 0;
      border-radius: var(--r-ctl);
      background: var(--red-fill);
      color: var(--on-red);
      cursor: pointer;
    }

    .qa-fab:active {
      background: var(--red-fill-press);
    }

    .qa-fab {
      transition:
        translate var(--d-swap) var(--ease-out),
        opacity var(--d-swap) var(--ease-out);
    }

    .qa-fab[data-away] {
      opacity: 0;
      translate: 0 calc(56px + var(--sp-4));
      pointer-events: none;
    }
  }
</style>
