<!--
  A block's declared actions (PGS-A12), drawn from `actionsPlan` in `../src/actions.ts`: a button, a switch, a choice of
  a few, a copy and a link, at most three of them shown in the order the page declared and the rest in one menu; on a
  phone, one shown and the rest in a sheet.

  A ROW'S ACTIONS (`size="row"`, with its `row`) are drawn from `rowActionsPlan` instead: quiet, the first shown and the
  rest in the row's one menu, on a phone the menu alone, and every control `data-row-action` so a host's Enter on the
  row presses the first.

  WITH NO `onact` IT DRAWS NOTHING, the rule every drawer in this package keeps (`19 §6`): a preview or the mirror has no
  hand to press with, so a control there is absent rather than greyed out. The string drawer prints the labels alone.

  A PRESS IS HANDED ON AND NEVER RUN HERE. The host's `act` holds it with an Undo, asks a `confirm` sentence first, signs
  in again, or shows a value once; this file only says which action was pressed, on which row, and a switch's or a
  choice's new value.
-->
<script lang="ts">
  import { tick } from 'svelte';
  import { ACTIONS_MORE, HARD_MARK, HARD_WORD, actionsPlan, rowActionsPlan, type OnAct, type PlannedAction } from '../src/actions.ts';
  import { rowsAsCards } from './rows-as-cards.svelte.ts';

  let {
    actions,
    row,
    onact,
    narrow,
    size = 'block',
    tabindex,
  }: {
    actions: readonly unknown[] | null | undefined;
    /** The row these actions sit on, handed back with the press. A block's own actions have none. */
    row?: unknown;
    onact?: OnAct | undefined;
    /** A phone's plan where the host knows better than the window; by default the 640px line every list reads. */
    narrow?: boolean | undefined;
    /**
     * `row` IS ONE ROW'S END (`rowActionsPlan`): quiet and compact, no accent fill, the first shown and the rest in the
     * row's one menu. `block` is the line under a block, as it always was.
     */
    size?: 'block' | 'row' | undefined;
    /** A host's roving tab stop (a table's caret): every shown control takes it. Absent, each is in the tab order. */
    tabindex?: number | undefined;
  } = $props();

  const plan = $derived((size === 'row' ? rowActionsPlan : actionsPlan)(actions, { narrow: narrow ?? rowsAsCards() }));
  /* EVERY PRESSABLE CONTROL ON A ROW SAYS SO, so a host's Enter on the row presses its first (`PageBody`). */
  const rowTag = $derived(row !== undefined ? '' : undefined);

  let open = $state(false);
  let more = $state<HTMLButtonElement | undefined>(undefined);
  let menu = $state<HTMLElement | undefined>(undefined);
  let sheet = $state<HTMLDialogElement | undefined>(undefined);

  function press(p: PlannedAction, value?: string): void {
    onact?.(p.action, row, value);
    close(false);
  }

  function close(back: boolean): void {
    if (sheet?.open) sheet.close();
    if (!open) return;
    open = false;
    if (back) more?.focus();
  }

  const items = (): HTMLElement[] => [...(menu?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])];

  async function toggle(): Promise<void> {
    if (plan.fold === 'sheet') {
      sheet?.showModal();
      return;
    }
    open = !open;
    if (open) {
      await tick();
      items()[0]?.focus();
    }
  }

  /* THE MENU'S KEYS: down and up walk its items and stop at the ends, Home and End jump, Escape closes and puts focus
     back on the button that opened it. Tab leaves, and the menu closes behind it. */
  function keys(e: KeyboardEvent): void {
    const all = items();
    const at = all.indexOf(document.activeElement as HTMLElement);
    const to = { ArrowDown: Math.min(at + 1, all.length - 1), ArrowUp: Math.max(at - 1, 0), Home: 0, End: all.length - 1 }[e.key];
    if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
    } else if (e.key === 'Tab') close(false);
    else if (to !== undefined) {
      e.preventDefault();
      all[to]?.focus();
    }
  }

  /* A PRESS OUTSIDE THE MENU CLOSES IT, and only while it is open, so a closed menu listens to nothing. */
  $effect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!menu?.contains(e.target as Node) && !more?.contains(e.target as Node)) close(false);
    };
    window.addEventListener('pointerdown', away);
    return () => window.removeEventListener('pointerdown', away);
  });

  /* A press on the sheet's backdrop is a press on the dialog itself, outside its one child. */
  const backdrop = (e: MouseEvent) => e.target === sheet && close(false);
</script>

{#snippet hard(p: PlannedAction)}
  {#if p.hard}<span class="actions-hard"><span class="actions-hard-mark" aria-hidden="true">{HARD_MARK}</span> {HARD_WORD}</span>{/if}
{/snippet}

<!-- ONE CONTROL, shown on the tile or stacked in the sheet. -->
{#snippet control(p: PlannedAction, ti: number | undefined)}
  {#if p.kind === 'switch'}
    <button type="button" class="switch actions-switch" role="switch" aria-checked={p.action.on === true} data-row-action={rowTag} tabindex={ti} onclick={() => press(p, p.action.on === true ? 'false' : 'true')}
      ><span class="switch-track" aria-hidden="true"></span><span>{p.label}</span>{@render hard(p)}</button
    >
  {:else if p.kind === 'choice'}
    <span class="actions-choice">
      <span class="actions-choice-label">{p.label}</span>
      <span class="segmented" role="group" aria-label={p.label}>
        {#each p.action.choices ?? [] as c}
          <button type="button" class="segment" data-on={c === p.action.value ? '' : undefined} aria-pressed={c === p.action.value} data-row-action={rowTag} tabindex={ti} onclick={() => press(p, c)}>{c}</button>
        {/each}
      </span>
    </span>
  {:else if p.kind === 'link'}
    <a class="actions-btn" href={p.action.href} data-row-action={rowTag} tabindex={ti} onclick={() => press(p)}>{p.label}{@render hard(p)}</a>
  {:else}
    <button type="button" class="actions-btn" data-primary={p.primary ? '' : undefined} data-row-action={rowTag} tabindex={ti} onclick={() => press(p)}>{p.label}{@render hard(p)}</button>
  {/if}
{/snippet}

<!-- ONE ITEM OF THE MENU: the same press, in a menu's roles. A choice is its own few, each a radio of the menu. -->
{#snippet item(p: PlannedAction)}
  {#if p.kind === 'switch'}
    <button type="button" class="switch actions-item" role="menuitemcheckbox" aria-checked={p.action.on === true} tabindex="-1" data-row-action={rowTag} onclick={() => press(p, p.action.on === true ? 'false' : 'true')}
      ><span class="switch-track" aria-hidden="true"></span>{p.label}{@render hard(p)}</button
    >
  {:else if p.kind === 'choice'}
    <div class="actions-item-group" role="group" aria-label={p.label}>
      <span class="actions-choice-label" aria-hidden="true">{p.label}</span>
      {#each p.action.choices ?? [] as c}
        <button type="button" class="actions-item" role="menuitemradio" aria-checked={c === p.action.value} tabindex="-1" data-row-action={rowTag} onclick={() => press(p, c)}>{c}</button>
      {/each}
    </div>
  {:else if p.kind === 'link'}
    <a class="actions-item" role="menuitem" tabindex="-1" href={p.action.href} data-row-action={rowTag} onclick={() => press(p)}>{p.label}{@render hard(p)}</a>
  {:else}
    <button type="button" class="actions-item" role="menuitem" tabindex="-1" data-row-action={rowTag} onclick={() => press(p)}>{p.label}{@render hard(p)}</button>
  {/if}
{/snippet}

<!-- A ROW ON A PHONE SHOWS NONE and keeps the menu alone, so what is drawn is the shown and the folded together. -->
{#if onact && plan.shown.length + plan.menu.length > 0}
  <div class="actions" data-fold={plan.fold} data-size={size}>
    {#each plan.shown as p}{@render control(p, tabindex)}{/each}
    {#if plan.fold}
      <span class="actions-fold">
        <button type="button" class="actions-btn" bind:this={more} data-row-action={rowTag} {tabindex} aria-haspopup={plan.fold === 'sheet' ? 'dialog' : 'menu'} aria-expanded={plan.fold === 'menu' ? open : undefined} onclick={toggle}
          >{ACTIONS_MORE}<span class="actions-count">{plan.menu.length}</span></button
        >
        {#if plan.fold === 'menu' && open}
          <div class="actions-menu" role="menu" tabindex="-1" bind:this={menu} onkeydown={keys}>
            {#each plan.menu as p}{@render item(p)}{/each}
          </div>
        {/if}
      </span>
      {#if plan.fold === 'sheet'}
        <dialog class="actions-sheet" bind:this={sheet} aria-label={ACTIONS_MORE} onclick={backdrop}>
          <div class="actions-sheet-body">
            {#each plan.menu as p}{@render control(p, undefined)}{/each}
            <button type="button" class="actions-btn actions-close" onclick={() => close(false)}>Close</button>
          </div>
        </dialog>
      {/if}
    {/if}
  </div>
{/if}

<style>
  /* THE LABELS ALONE, the line `Block` and `toHTML` print where nothing can be pressed: quiet, under the block. Global,
     because `Block` draws it and a scoped class on it would split the two renderers' trees. */
  :global(.block > .block-actions) {
    margin: var(--sp-3) 0 0;
    color: var(--ink2);
    font-size: var(--fs-body);
  }

  /* ONE LINE UNDER THE BLOCK, the controls at their own widths and wrapping when the tile is narrow. */
  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
    margin-block-start: var(--sp-3);
  }

  /* A ROW'S END: one line that never wraps, at the row's end and on no margin of its own, so the row keeps its height. */
  .actions[data-size='row'] {
    flex-wrap: nowrap;
    justify-content: flex-end;
    gap: var(--sp-1);
    margin-block-start: 0;
  }

  /* QUIET AND COMPACT: no fill until the pointer or the keyboard reaches it, and never the accent's. */
  .actions[data-size='row'] .actions-btn {
    padding: 0 var(--sp-2);
    background: none;
    color: var(--ink2);
  }

  .actions[data-size='row'] .actions-btn:hover,
  .actions[data-size='row'] .actions-btn:focus-visible {
    background: var(--field);
    color: var(--ink);
  }

  /* A RECTANGLE TOLD BY ITS FILL, `Button`'s: no border, radius 8, the label at the control size. */
  .actions-btn,
  .actions-switch {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    box-sizing: border-box;
    min-block-size: var(--btn-h);
    padding: 0 var(--sp-3);
    background: var(--field);
    border: 0;
    border-radius: var(--r-ctl);
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-ctl);
    font-weight: var(--fw-medium);
    text-decoration: none;
    white-space: nowrap;
    cursor: pointer;
  }

  /* THE BLOCK'S ONE PRIMARY takes the working accent's fill; every other control is the field's. */
  .actions-btn[data-primary] {
    background: var(--action);
    color: var(--on-action);
  }

  .actions-choice {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
  }

  .actions-choice-label {
    color: var(--ink2);
    font-size: var(--fs-ctl);
  }

  /* HARD TO UNDO IS A MARK AND A WORD in the deeper red, so it never rests on the colour alone. */
  .actions-hard {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    color: var(--danger-text);
    font-size: var(--fs-meta);
    font-weight: var(--fw-medium);
  }

  .actions-hard-mark {
    font-weight: 700;
  }

  .actions-count {
    padding: 0 6px;
    background: var(--well);
    border-radius: var(--r-pill);
    color: var(--ink2);
    font-size: var(--fs-meta);
  }

  .actions-fold {
    position: relative;
  }

  /* THE MENU IS A FLAT OPAQUE TILE under its button, in the well's colour so it reads off the tile it covers: no border
     and no shadow, the tile's radius. */
  .actions-menu {
    position: absolute;
    inset-block-start: calc(100% + var(--sp-1));
    inset-inline-end: 0;
    z-index: var(--z-sheet);
    display: grid;
    min-inline-size: 200px;
    padding: var(--sp-1);
    background: var(--well);
    border-radius: var(--r-tile);
  }

  .actions-item {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: var(--btn-h);
    padding: 0 var(--sp-3);
    background: none;
    border: 0;
    border-radius: var(--r-ctl);
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-body);
    text-align: start;
    text-decoration: none;
    cursor: pointer;
  }

  .actions-item:focus-visible,
  .actions-item:hover {
    background: var(--field);
  }

  .actions-item[role='menuitemradio'][aria-checked='true'] {
    color: var(--action);
    font-weight: var(--fw-medium);
  }

  .actions-item-group {
    display: grid;
    padding-block: var(--sp-1);
  }

  .actions-item-group > .actions-choice-label {
    padding: var(--sp-1) var(--sp-3);
  }

  /* THE SHEET, on a phone: a dialog along the bottom edge, its controls one a line and each the width of it. The padding
     is the body's, so a press on the sheet's own edge is not taken for a press on the backdrop. */
  .actions-sheet {
    inset-block: auto 0;
    inline-size: 100%;
    max-inline-size: 100%;
    margin: 0;
    padding: 0;
    box-sizing: border-box;
    background: var(--tile);
    border: 0;
    border-radius: var(--r-tile) var(--r-tile) 0 0;
    color: var(--ink);
  }

  .actions-sheet-body {
    display: grid;
    gap: var(--sp-2);
    padding: var(--sp-4);
  }

  .actions-sheet-body > :is(.actions-btn, .actions-switch) {
    justify-content: flex-start;
    inline-size: 100%;
  }

  /* Under the stretch rule above, which outranks a lone class. */
  .actions-sheet-body > .actions-close {
    justify-content: center;
    background: none;
    color: var(--ink2);
  }

  /* EVERY CONTROL TAKES A THUMB: 44 under a coarse pointer, the label at the body size. */
  @media (pointer: coarse) {
    .actions-btn,
    .actions-switch,
    .actions-item,
    .actions-choice :global(.segment) {
      min-block-size: var(--tap);
      font-size: var(--fs-body);
    }
  }

  @media (forced-colors: active) {
    .actions-btn,
    .actions-switch {
      border: 1px solid ButtonText;
    }
  }
</style>
