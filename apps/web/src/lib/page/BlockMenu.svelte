<!--
  A BLOCK'S OWN MENU (PGS-B08): Move up, Move down, the other column, its width, Hide, from the block's head, at every
  width. Each press is one kept change to the page's look by key and one line with Undo; the rows are `block-menu.ts`'s.

  THE PAGE IS READ AS THE MENU IS REACHED, not handed down: the head knows its own block, and the order, widths and
  columns of the rest are the record's, read once a pointer or the keyboard comes near (`ahead`) and shared by every
  block's menu on the page until a press changes it.

  ON A POINTER THE MARK WAITS for the tile's hover or focus, as the source link does (DIRECTION §35), so a page at rest
  shows none. ON TOUCH IT IS ALWAYS THERE, the last thing in the head, 44 square.
-->
<script module lang="ts">
  /* ONE READ A PAGE, shared by every menu on it, and dropped when a press writes. */
  let held: { slug: string; at: number; got: Promise<unknown> } | null = null;
  const FRESH = 10_000;
</script>

<script lang="ts">
  import { createClient } from '@braindog/client';
  import { apiBase } from '../at.ts';
  import { copy } from '$lib/copy.ts';
  import { lookUndo, lookOfArrangement } from '$lib/record/arrange-look.ts';
  import { spanOf, stepsFor } from '$lib/record/arrange.ts';
  import { blockWords } from '$lib/record/block-edit.ts';
  import { lookOf, type LiveBlock, type LiveLook } from '$lib/record/page-live.ts';
  import Icon from '$lib/ui/Icon.svelte';
  import Menu from '$lib/ui/Menu.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { actionsFor, editOf, hideBody, laidAfter, laidOf, placeOf, saidOf, words, type Action, type Laid, type MenuBlock } from './block-menu.ts';
  import { layoutOf } from './layout.ts';
  import { retireLook, writeLook } from './look.ts';

  let {
    block,
    slug,
    name,
    reread,
  }: {
    /** The block whose head the menu sits in; it has a key a look may name, or the menu is not drawn. */
    block: LiveBlock & { key: string };
    /** The page's address, which it is read by and its look written under. */
    slug: string;
    /** The block's name as its head says it, which the menu and its lines name it by. */
    name: string;
    /** Reads the page again after a press, without blanking it. */
    reread: () => Promise<void>;
  } = $props();

  let open = $state(false);
  type Read = { laid: Laid[]; live: LiveLook | null; rail: boolean };
  let read = $state.raw<Read | null>(null);

  const kindName = $derived((copy.kindNames[block.kind] ?? blockWords.kindNames[block.kind] ?? 'block').toLowerCase());
  const mine = $derived<MenuBlock>({
    key: block.key,
    kind: block.kind,
    columns: block.columns.length,
    span: read?.laid.find((l) => l.key === block.key)?.span ?? spanOf(block.kind, block.span, block.columns.length),
    name,
    kindName,
  });
  const place = $derived(read ? placeOf(read.laid, block.key, read.rail) : null);
  const rows = $derived(
    actionsFor(mine, {
      owner: true,
      area: place?.area ?? null,
      first: place?.first ?? false,
      last: place?.last ?? false,
      hidden: false,
      steps: stepsFor(block.kind, block.columns.length),
    }),
  );
  const moves = $derived(rows.filter((a) => a.span === undefined && a.id !== 'hide' && a.id !== 'show'));
  const widths = $derived(rows.filter((a) => a.span !== undefined));
  const last = $derived(rows.filter((a) => a.id === 'hide' || a.id === 'show'));

  /** The page as the record answers it now, read once for every menu on it. */
  function readPage(fresh = false): Promise<unknown> {
    if (!fresh && held && held.slug === slug && Date.now() - held.at < FRESH) return held.got;
    const got = createClient({ base: apiBase() })
      .page(slug)
      .then((out) => (out.ok ? out.value : null))
      .catch(() => null);
    held = { slug, at: Date.now(), got };
    return got;
  }

  async function laid(fresh = false): Promise<Read | null> {
    const page = (await readPage(fresh)) as { blocks?: unknown; look?: unknown } | null;
    if (!page || !Array.isArray(page.blocks)) return null;
    const got: Read = { laid: laidOf(page.blocks, page), live: lookOf(page.look), rail: layoutOf(page) !== null };
    read = got;
    return got;
  }

  /* READ AS THE POINTER OR THE KEYBOARD COMES NEAR, so the rows are the page's by the time the menu opens. */
  let near = $state<HTMLElement>();
  $effect(() => {
    const el = near;
    if (!el) return;
    const ahead = () => void laid();
    el.addEventListener('pointerenter', ahead);
    el.addEventListener('focusin', ahead);
    return () => {
      el.removeEventListener('pointerenter', ahead);
      el.removeEventListener('focusin', ahead);
    };
  });
  $effect(() => {
    if (open) void laid();
  });

  let busy = false;

  /** A press: the next look written, the page read again, and the line that says so with its way back. */
  async function press(action: Action) {
    open = false;
    if (busy || action.disabled) return;
    busy = true;
    try {
      const now = await laid();
      if (!now) return void toasts.push(copy.recordNotReached, { intent: 'warn' });
      const edit = editOf(action, mine, { laid: now.laid });
      if (!edit) return;
      const body =
        'hide' in edit
          ? hideBody(slug, now.live, block.key, edit.hide)
          : lookOfArrangement(slug, now.live, laidAfter(now.laid, block.key, edit));
      const out = await writeLook(apiBase(), body);
      if (!out.ok) return void toasts.push(out.fix, { intent: 'warn' });
      held = null;
      await reread();
      toasts.push(saidOf(edit, name, action.id), { undo: () => void undo(now.live) });
    } finally {
      busy = false;
    }
  }

  /** Undo: the look before written again, or the look retired where there was none to put back. */
  async function undo(live: LiveLook | null) {
    const back = lookUndo(slug, live);
    const out = 'write' in back ? await writeLook(apiBase(), back.write) : await retireLook(apiBase(), back.retire);
    held = null;
    if (!out.ok) toasts.push(out.fix, { intent: 'warn' });
    await reread();
  }
</script>

{#snippet item(a: Action, role: 'menuitem' | 'menuitemradio')}
  <button
    type="button"
    class="bm-item"
    {role}
    aria-checked={role === 'menuitemradio' ? a.current === true : undefined}
    aria-disabled={a.disabled ? 'true' : undefined}
    title={a.why}
    onclick={() => void press(a)}
  >
    <span class="bm-label">{a.label}</span>
    {#if a.current}<Icon name="check" size="s" />{/if}
    {#if a.why}<span class="bm-why">{a.why}</span>{/if}
  </button>
{/snippet}

<span class="block-menu" data-open={open ? '' : undefined} bind:this={near}>
  <Menu label={words.menu(name)} align="end" bind:open>
    {#snippet trigger()}<span class="bm-mark"><Icon name="more" size="s" /><span class="sr-only">{words.menu(name)}</span></span>{/snippet}
    {#each moves as a (a.id)}{@render item(a, 'menuitem')}{/each}
    <p class="bm-group" role="none">{words.width}</p>
    {#each widths as a (a.id)}{@render item(a, 'menuitemradio')}{/each}
    {#each last as a (a.id)}{@render item(a, 'menuitem')}{/each}
  </Menu>
</span>

<style>
  /* THE LAST THING IN THE HEAD, at its right end: after the source link where there is one, which holds the end. */
  .block-menu {
    flex: none;
    margin-inline-start: auto;
  }

  .bm-mark {
    display: grid;
    place-items: center;
    inline-size: var(--sp-6);
    block-size: var(--sp-6);
    border-radius: var(--r-ctl);
    color: var(--dim);
    transition:
      background var(--d-state) var(--ease-out),
      color var(--d-state) var(--ease-out);
  }

  .bm-mark:hover,
  .block-menu:has(:focus-visible) .bm-mark,
  .block-menu[data-open] .bm-mark {
    background: var(--hover-wash);
    color: var(--ink);
  }

  /* ON A POINTER IT WAITS FOR THE TILE, and fades rather than folds, so the heading row never moves under it. Open, or
     reached by the keyboard, it stays. */
  @media (hover: hover) and (pointer: fine) {
    :global(.block-source) ~ .block-menu {
      margin-inline-start: 0;
    }

    .block-menu {
      opacity: 0;
      transition: opacity var(--d-state) var(--ease-out);
    }

    :global(.block-slot:is(:hover, :focus-within)) .block-menu,
    .block-menu:focus-within,
    .block-menu[data-open] {
      opacity: 1;
    }
  }

  /* UNDER A THUMB A TARGET IS 44 SQUARE, the mark drawn in its middle. */
  @media not ((hover: hover) and (pointer: fine)) {
    .bm-mark {
      inline-size: 44px;
      block-size: 44px;
    }
  }

  .bm-group {
    margin: var(--sp-2) var(--sp-2) var(--sp-1);
    color: var(--dim);
    font-size: var(--t-sm);
    font-weight: 500;
  }

  /* THE ROWS: `Menu.svelte` gives them their height and rhythm; the colours are these. */
  .bm-item {
    background: none;
    border: 0;
    color: var(--ink2);
    font: inherit;
    text-align: start;
    cursor: pointer;
  }

  .bm-item:hover,
  .bm-item:focus-visible {
    background: var(--hover-wash);
    color: var(--ink);
  }

  .bm-item[aria-checked='true'] {
    color: var(--ink);
  }

  /* A WIDTH TOO NARROW FOR THE BLOCK IS GREYED AND SAYS WHY, beside its name. */
  .bm-item[aria-disabled='true'] {
    color: var(--dim);
    cursor: default;
  }

  .bm-item[aria-disabled='true']:hover {
    background: none;
  }

  .bm-why {
    margin-inline-start: auto;
    font-size: var(--t-sm);
  }
</style>
