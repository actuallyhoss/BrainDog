<!--
  THE VERBS A SELECTION IS FOR, above the rows they act on and nowhere else.

  The anchor-extend model was implemented, drawn, and consumed by nothing: a selection you can make
  and cannot use is a mode you enter and cannot leave usefully. It appears with the selection and
  goes with it: a permanently visible bulk bar is a row of disabled controls, which tells you a thing
  exists and refuses to say why it will not work.

  THE VERBS BELONG TO THE LIST, NOT TO ONE OF ITS TWO BODIES. Putting the body's branch in the markup
  rather than in the stylesheet once swallowed this into the card arm, so a desktop selection raised
  no bulk bar at all. The page draws it whichever body is on the screen.

  IT TAKES THE TOOLBAR'S PLACE (money F7). It floated at the bottom of the window with a
  border and a shadow, over the rows it acts on, and covered the Due cell of the row under it. While anything is picked
  it is the tile's first row instead, the toolbar's height, flat: how many are picked, then the verbs, every one the
  same quiet button, then Clear at the end. ON A PHONE it docks above the tab bar as a flat strip the screen's width,
  and the list keeps 72px under its last row so the strip never covers it. It arrives as opacity alone, over
  `--d-swap`.

  Every verb is the page's write (`copyIds`, `setPickedState`, `archiveSelected`), and `count` is the
  selection cut to the answer on screen, so what a verb acts on is what the reader is looking at.

  TWO VERBS ARE WRITTEN HERE, on `picked`, the same cut the page counts. "Move to…" is on the bar of a list whose things
  say where they apply (a key, a tool, a skill, a learning): one sheet of places, one press, every one picked moved,
  one sentence and one Undo (`scope-move.ts` `moveMany`). Keys going to Everywhere are asked about first, as one key is
  on its own page. "Fold into one" is on the bar of the list that keeps people, for two to twelve picked: it asks on
  Decide whether they are the same one and opens that question, and folds nobody itself. On a list that says what makes
  two of its things the same (a skill, a key, a learning), it is there for two or more picked: one question folds just
  the ones picked with what they are here twice with, and the answer in Needs you has one Undo.

  "SEND N TO…" opens the send sheet with every one picked attached (`$lib/send`), hung from the button. Sending changes
  nothing on the list, so it is on the bar of a reader who may not change it too.
-->
<script lang="ts">
  import { copy } from '$lib/copy.ts';
  import { goto } from '$app/navigation';
  import { createClient } from '@braindog/client';
  import { apiBase, at } from '$lib/at.ts';
  import type { RegisterDecl } from '$lib/record/schema.ts';
  import { movable, moveMany, movedSaid, moverAt, placesIn, putBackSaid, scopeFieldOf, words, type MovedMany, type MoveRow, type Place } from '$lib/record/scope-move.ts';
  import Button from '$lib/ui/Button.svelte';
  import Menu from '$lib/ui/Menu.svelte';
  import { menuAt } from '$lib/ui/context-menu.ts';
  import Icon from '$lib/ui/Icon.svelte';
  import Kbd from '$lib/ui/Kbd.svelte';
  import ScopeChip from '$lib/ui/ScopeChip.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import Waiting from '$lib/ui/Waiting.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { foldAsk, sameOf } from '../twice-fold.ts';
  import { openSheet } from '$lib/send/open.ts';
  import SendItem from '$lib/send/SendItem.svelte';
  import { sendWords, type Attached } from '$lib/send/send.ts';

  let {
    count,
    decl,
    states,
    stateLabel,
    saidInLine,
    copyIds,
    setPickedState,
    archiveSelected,
    onclear,
    picked,
    onmoved,
    send = [],
  }: {
    count: number;
    decl: RegisterDecl | undefined;
    /** The register's own states, so the menu is the vocabulary rather than a list typed here. */
    states: readonly string[];
    /** The register's own name for its state column, so the verb over the menu says what the header says. */
    stateLabel: string;
    saidInLine: (field: string, value: string) => string;
    copyIds: () => void;
    setPickedState: (state: string) => void;
    /** Absent for a caller whose level cannot change the list, and Archive is then not on the bar. */
    archiveSelected?: (() => void) | undefined;
    onclear: () => void;
    /**
     * The ones picked, each with the version the list read and its title, for the two verbs written here. Absent for a
     * caller whose level cannot change the list, and neither verb is then on the bar.
     */
    picked?: readonly MoveRow[] | undefined;
    /** Called once a move has landed or been put back, so the page reads the list again. */
    onmoved?: (() => void) | undefined;
    /** The ones picked as the send sheet attaches them. */
    send?: readonly Attached[] | undefined;
  } = $props();

  /* THE SELECTION'S MENU: the bar's verbs, opened where a right-click or a held thumb lands on a picked row
     (`SELECTION_MENU`), so the rows are acted on where they are. */
  let menuRect = $state<{ x: number; y: number; height: number } | null>(null);
  let menuOpen = $state(false);
  const heard = menuAt((p) => {
    menuRect = { x: p.x, y: p.y, height: p.height };
    menuOpen = true;
  });

  /* This part's own words: the short Clear at the bar's end, whose name says what it clears. */
  const barWords = { clear: 'Clear' } as const;

  /* ── MOVE TO… ── */
  const field = $derived(decl ? scopeFieldOf(decl.id) : undefined);
  const canMove = $derived(picked !== undefined && picked.length > 0 && movable(field));

  let open = $state(false);
  /* `undefined` while the projects are being read, `null` when the record would not list them. */
  let places = $state<Place[] | null | undefined>(undefined);
  /* THE ONE QUESTION A MOVE ASKS: how many keys the press would open to every project, answered by the button. */
  let asking = $state<number | null>(null);
  /* ONE MOVE AT A TIME, so a second press on the sheet while the first is out writes nothing. */
  let moving = $state(false);

  function openMove() {
    const to = field?.to;
    if (!canMove || !to) return;
    asking = null;
    open = true;
    places = undefined;
    void placesIn(apiBase(), to).then((got) => (places = got));
  }

  /** What a move or its way back answered, said once: the sentence, the Undo where there is one, and the list read again. */
  function say(out: Extract<MovedMany, { ask: false }>, line: string) {
    const undo = out.undo;
    toasts.push(line, {
      ...(undo ? { undo: () => void undo().then((back) => !back.ask && say(back, putBackSaid(back))) } : {}),
      ...(out.failed > 0 ? { intent: 'warn' as const } : {}),
    });
    if (out.moved.length > 0 || out.stale.length > 0) onmoved?.();
  }

  async function moveTo(to: Place | null, confirmed = false) {
    const id = decl?.id;
    if (moving || !id || !picked || !canMove) return;
    moving = true;
    const out = await moveMany(moverAt(apiBase()), id, picked, to, { confirmed });
    moving = false;
    if (out.ask) {
      asking = out.widening;
      return;
    }
    open = false;
    asking = null;
    say(out, movedSaid(out, to));
  }

  /* ── FOLD INTO ONE ── the list that keeps people (`meets:`), and as many as one question asks about; or a list that
     says what makes two of its things the same (`same:`), where the picked are folded with what they are here twice
     with, in one question (`foldAsk`). A host with no such fold takes the button away. */
  const FOLD_MOST = 12;
  const sameList = $derived(sameOf(decl) !== null);
  let foldGone = $state<string | null>(null);
  const canFold = $derived(
    picked !== undefined &&
      picked.length >= 2 &&
      (decl?.meets !== undefined ? picked.length <= FOLD_MOST : sameList && foldGone !== decl?.id),
  );
  let folding = $state(false);

  async function fold() {
    const id = decl?.id;
    if (folding || !id || !picked || !canFold) return;
    folding = true;
    if (sameList) {
      const asked = await foldAsk((name, args) => createClient({ base: apiBase() }).call(name, args), id, picked.map((r) => r.seq));
      folding = false;
      if (!asked.ok) {
        toasts.push(asked.said, { intent: 'warn' });
        if (asked.gone) foldGone = id;
        return;
      }
      void goto(at(asked.href));
      return;
    }
    const out = await createClient({ base: apiBase() }).sameOne({ register: id, rows: picked.map((r) => `${id}#${r.seq}`) });
    folding = false;
    if (!out.ok) {
      toasts.push('conflict' in out ? copy.writeNotReached : out.refusal.fix, { intent: 'warn' });
      return;
    }
    void goto(at(`/decide/${encodeURIComponent(out.value.question)}`));
  }
</script>

<!-- It wraps rather than scrolls, so the verbs survive a narrow tile. On a phone it is placed on the window, above the
     tab bar, which `data-fixed` tells the shell's rail slide (`+layout.svelte`). -->
<div class="picked-bar" data-fixed data-selection-menu role="toolbar" aria-label="{count} {copy.selected}" {@attach heard}>
  <span class="picked-n"><span class="num">{count}</span> {copy.selected}</span>
  {#if states.length}
    <Menu label={copy.setState(stateLabel)}>
      {#snippet trigger()}<span class="picked-verb"><Icon name="edit" size="s" />{copy.setState(stateLabel)}<Icon name="chevronDown" size="s" /></span>{/snippet}
      {#each states as state}
        <button role="menuitem" type="button" onclick={() => setPickedState(state)}><Icon name="check" size="s" />
          <span class="mi-name">{saidInLine(decl?.state ?? '', state)}</span>
        </button>
      {/each}
    </Menu>
  {/if}
  {#if archiveSelected}
    <Button weight="quiet" onclick={() => archiveSelected?.()}>
      <Icon name="archive" size="s" />{copy.archiveSelected}
    </Button>
  {/if}
  <Button weight="quiet" onclick={() => copyIds()}>
    <Icon name="copy" size="s" />{copy.copyIds}
  </Button>
  {#if send.length > 0}
    <Button weight="quiet" aria-haspopup="dialog" onclick={(e: MouseEvent) => void openSheet({ kind: decl?.id ?? '', attach: [...send], anchor: e.currentTarget instanceof Element ? e.currentTarget : null })}>
      <Icon name="slash" size="s" />{sendWords.sendMany(send.length)}
    </Button>
  {/if}
  {#if canMove}
    <Button weight="quiet" onclick={openMove}>
      <Icon name="arrow" size="s" />{words.moveMany}
    </Button>
  {/if}
  {#if canFold}
    <Button weight="quiet" disabled={folding} onclick={() => void fold()}>
      <Icon name="link" size="s" />{words.foldMany}
    </Button>
  {/if}
  <button type="button" class="picked-clear tap" aria-label={copy.clear} onclick={() => onclear()}>
    <Icon name="close" size="s" />{barWords.clear}<span class="picked-esc" aria-hidden="true"><Kbd keys="Esc" /></span>
  </button>
</div>

<Menu label="{count} {copy.selected}" bind:open={menuOpen} at={menuRect} onclose={() => (menuRect = null)}>
  {#if send.length > 0}<SendItem kind={decl?.id ?? ''} attach={send} />{/if}
  {#each states as state}
    <button role="menuitem" type="button" onclick={() => setPickedState(state)}>
      <Icon name="edit" size="s" /><span class="mi-name">{copy.setTo(saidInLine(decl?.state ?? '', state))}</span>
    </button>
  {/each}
  {#if states.length}<hr />{/if}
  <button role="menuitem" type="button" onclick={() => copyIds()}>
    <Icon name="copy" size="s" /><span class="mi-name">{copy.copyIds}</span>
  </button>
  {#if canMove}
    <button role="menuitem" type="button" onclick={openMove}>
      <Icon name="arrow" size="s" /><span class="mi-name">{words.moveMany}</span>
    </button>
  {/if}
  {#if canFold}
    <button role="menuitem" type="button" disabled={folding} onclick={() => void fold()}>
      <Icon name="link" size="s" /><span class="mi-name">{words.foldMany}</span>
    </button>
  {/if}
  {#if archiveSelected}
    <button role="menuitem" type="button" onclick={() => archiveSelected?.()}>
      <Icon name="archive" size="s" /><span class="mi-name">{copy.archiveSelected}</span>
    </button>
  {/if}
  <hr />
  <button role="menuitem" type="button" onclick={() => onclear()}>
    <Icon name="close" size="s" /><span class="mi-name">{copy.clear}</span>
  </button>
</Menu>

{#snippet confirm()}
  <Button weight="primary" disabled={moving} onclick={() => void moveTo(null, true)}>{words.widenGo}</Button>
{/snippet}

{#snippet place(p: Place | null)}
  <li>
    <button type="button" class="scope-place" disabled={moving} onclick={() => void moveTo(p)}>
      <ScopeChip scope={p} />
    </button>
  </li>
{/snippet}

<!-- THE SHEET IS BESIDE THE BAR, NOT IN IT, so it is placed on the window as the row page's is (`[seq]/ScopeMove.svelte`,
     whose list of places this is). -->
{#if canMove}
  <Sheet bind:open title={words.moveMany} subtitle={words.picked(count)} footer={asking !== null ? confirm : undefined} onclose={() => (asking = null)}>
    {#if asking !== null}
      <p class="scope-said">{words.widenKeys(asking)}</p>
    {:else if places === undefined}
      <Waiting rows={3} />
    {:else if places === null}
      <p class="scope-said" role="status">{words.noPlaces}</p>
      <Button weight="quiet" onclick={openMove}>{words.retry}</Button>
    {:else}
      <ul class="scope-places" aria-label={words.moveMany}>
        {@render place(null)}
        {#each places as p (p.id)}{@render place(p)}{/each}
      </ul>
    {/if}
  </Sheet>
{/if}

<style>
  /**
   * THE TOOLBAR'S ROW, FLAT: the tile's own colour, no edge and no shadow, the toolbar's 40px, the count first and Clear
   * at the end. Every verb is the same quiet button, the state's menu among them.
   */
  .picked-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: 40px;
    color: var(--ink-2);
    font-size: var(--fs-ctl);
    animation: picked-in var(--d-swap) var(--ease-out);
  }

  @keyframes picked-in {
    from {
      opacity: 0;
    }
  }

  .picked-n {
    margin-inline-end: var(--sp-2);
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: var(--fw-semi);
    font-variant-numeric: tabular-nums;
  }

  /* THE STATE'S MENU READS AS THE BUTTONS BESIDE IT: a capsule in the soft fill, the control's height, its chevron after
     the words. */
  .picked-verb {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: var(--ctl-h);
    padding: 0 calc(14px * var(--dense, 1));
    background: var(--soft-fill, var(--tile-2));
    border-radius: var(--r-pill, var(--r-ctl));
    color: var(--ink);
    font-weight: var(--fw-medium);
    transition: background var(--d-state) var(--ease-out);
  }

  @media (hover: hover) and (pointer: fine) {
    :global(.menu-trigger):hover > .picked-verb {
      background: var(--soft-fill-hover, var(--hover));
    }
  }

  /* LET GO: Clear at the end, with the Esc cap beside it, the key that does the same. */
  .picked-clear {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: var(--ctl-h);
    margin-inline-start: auto;
    padding: 0 var(--sp-3);
    background: none;
    border: 0;
    border-radius: var(--r-pill, var(--r-ctl));
    color: var(--ink-2);
    font: inherit;
    font-weight: var(--fw-medium);
    cursor: pointer;
    transition: background var(--d-state) var(--ease-out);
  }

  @media (hover: hover) and (pointer: fine) {
    .picked-clear:hover {
      background: var(--soft-fill, var(--hover));
      color: var(--ink);
    }
  }

  .picked-esc {
    display: inline-flex;
  }

  @media (pointer: coarse) {
    .picked-esc {
      display: none;
    }

    .picked-verb {
      min-block-size: var(--tap);
    }
  }

  /* THE PLACES, as the row page lists them: each the whole of its target and 48 tall, a hairline between two. */
  .scope-places {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .scope-places > li {
    position: relative;
  }

  .scope-places > li + li::after {
    content: '';
    position: absolute;
    inset-block-start: 0;
    inset-inline: var(--sp-3);
    block-size: 1px;
    background: var(--rule);
    pointer-events: none;
  }

  .scope-place {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    inline-size: 100%;
    min-block-size: 48px;
    padding-block: var(--sp-1);
    padding-inline: var(--sp-3);
    background: none;
    border: 0;
    border-radius: var(--r-ctl);
    color: var(--ink);
    font: inherit;
    text-align: start;
    cursor: pointer;
    transition: background var(--d-state) var(--ease-out);
  }

  @media (hover: hover) and (pointer: fine) {
    .scope-place:hover {
      background: var(--row-wash, var(--hover));
    }
  }

  .scope-said {
    margin: 0;
    max-inline-size: var(--measure);
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
  }

  /**
   * ON A PHONE, A STRIP ABOVE THE TAB BAR: the screen's width, flat in the tile's colour, 56 tall above the safe area,
   * one 1px rule over it where it meets the list. The page keeps 72px under the last row while it shows.
   */
  @media (width < 640px) {
    .picked-bar {
      position: fixed;
      inset-inline: 0;
      inset-block-end: var(--tabbar);
      z-index: var(--z-sheet);
      flex-wrap: nowrap;
      gap: var(--sp-1);
      min-block-size: 56px;
      padding: 0 var(--sp-3);
      overflow-x: auto;
      background: var(--glass-chrome, var(--tile));
      -webkit-backdrop-filter: var(--glass-filter, none);
      backdrop-filter: var(--glass-filter, none);
      border-block-start: 0;
      box-shadow: var(--glass-edge, inset 0 1px 0 var(--rule)), var(--elev-chrome, none);
      scrollbar-width: none;
    }

    .picked-bar > :global(*) {
      flex: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .picked-bar {
      animation-duration: 120ms;
    }
  }
</style>
