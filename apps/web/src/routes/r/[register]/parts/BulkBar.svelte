<!--
  THE VERBS A SELECTION IS FOR, above the rows they act on and nowhere else.

  The anchor-extend model was implemented, drawn, and consumed by nothing: a selection you can make
  and cannot use is a mode you enter and cannot leave usefully. It appears with the selection and
  goes with it: a permanently visible bulk bar is a row of disabled controls, which tells you a thing
  exists and refuses to say why it will not work.

  THE VERBS BELONG TO THE LIST, NOT TO ONE OF ITS TWO BODIES. Putting the body's branch in the markup
  rather than in the stylesheet once swallowed this into the card arm, so a desktop selection raised
  no bulk bar at all. The page draws it whichever body is on the screen.

  IT FLOATS: a bar at the bottom centre of the window, over the list, with the count, the verbs and Esc to let go. It
  is the tile's colour with a hairline and the second level's shadow, a rectangle and no glass (DIRECTION 39). Its
  surface is on a pseudo-element, which keeps the bar itself free of anything that would place the state menu inside
  it rather than on the window. The verbs in it are
  the quiet buttons.

  Every verb is the page's write (`copyIds`, `setPickedState`, `archiveSelected`), and `count` is the
  selection cut to the answer on screen, so what a verb acts on is what the reader is looking at.

  TWO VERBS ARE WRITTEN HERE, on `picked`, the same cut the page counts. "Move to…" is on the bar of a list whose things
  say where they apply (a key, a tool, a skill, a learning): one sheet of places, one press, every one picked moved,
  one sentence and one Undo (`scope-move.ts` `moveMany`). Keys going to Everywhere are asked about first, as one key is
  on its own page. "Fold into one" is on the bar of the list that keeps people, for two to twelve picked: it asks on
  Decide whether they are the same one and opens that question, and folds nobody itself.
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
  import Icon from '$lib/ui/Icon.svelte';
  import Kbd from '$lib/ui/Kbd.svelte';
  import ScopeChip from '$lib/ui/ScopeChip.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import Waiting from '$lib/ui/Waiting.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';

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
  } = $props();

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

  /* ── FOLD INTO ONE ── the list that keeps people (`meets:`), and as many as one question asks about. */
  const FOLD_MOST = 12;
  const canFold = $derived(picked !== undefined && decl?.meets !== undefined && picked.length >= 2 && picked.length <= FOLD_MOST);
  let folding = $state(false);

  async function fold() {
    const id = decl?.id;
    if (folding || !id || !picked || !canFold) return;
    folding = true;
    const out = await createClient({ base: apiBase() }).sameOne({ register: id, rows: picked.map((r) => `${id}#${r.seq}`) });
    folding = false;
    if (!out.ok) {
      toasts.push('conflict' in out ? copy.writeNotReached : out.refusal.fix, { intent: 'warn' });
      return;
    }
    void goto(at(`/decide/${encodeURIComponent(out.value.question)}`));
  }
</script>

<!-- It wraps rather than scrolls, so the verbs survive a phone. `data-fixed` because it is placed on the window, which
     the shell's rail slide has to know so it does not carry the bar along with the work (`+layout.svelte`). -->
<div class="picked-bar" data-fixed role="toolbar" aria-label="{count} {copy.selected}">
  <span class="picked-n num">{count}</span>
  <span class="picked-word">{copy.selected}</span>
  <Button weight="quiet" onclick={() => copyIds()}>
    <Icon name="copy" size="s" />{copy.copyIds}
  </Button>
  {#if states.length}
    <Menu label={copy.setState(stateLabel)}>
      {#snippet trigger()}<span class="picked-verb"><Icon name="edit" size="s" />{copy.setState(stateLabel)}</span>{/snippet}
      {#each states as state}
        <button
          class="mi"
          role="menuitem"
          type="button"
          onclick={() => setPickedState(state)}
        >
          <span class="mi-name">{saidInLine(decl?.state ?? '', state)}</span>
        </button>
      {/each}
    </Menu>
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
  {#if archiveSelected}
    <Button weight="quiet" onclick={() => archiveSelected?.()}>
      <Icon name="archive" size="s" />{copy.archiveSelected}
    </Button>
  {/if}
  <button type="button" class="picked-clear tap" aria-label={copy.clear} title={copy.clear} onclick={() => onclear()}>
    <Icon name="close" size="s" /><span class="picked-esc" aria-hidden="true"><Kbd keys="Esc" /></span>
  </button>
</div>

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
  /* THE FLOATING BAR: bottom centre, 12 above the window's edge twice over, and above the phone's tab bar there. The
     surface is the `::before`, so the state menu inside it places itself on the window. */
  .picked-bar {
    position: fixed;
    inset-inline: 0;
    inset-block-end: calc(env(safe-area-inset-bottom) + var(--inset) * 2);
    z-index: var(--z-sheet);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 6px;
    inline-size: fit-content;
    max-inline-size: calc(100vw - 2 * var(--inset));
    margin-inline: auto;
    padding: 6px 6px 6px var(--sp-4);
    border-radius: var(--r-md);
    color: var(--ink2);
    font-size: var(--t-sm);
    animation: picked-in var(--d-enter) var(--ease-out);
  }

  .picked-bar::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    border-radius: inherit;
    background: var(--tile);
    box-shadow: 0 0 0 1px var(--rule), var(--e2);
    pointer-events: none;
  }

  @keyframes picked-in {
    from {
      transform: translateY(12px);
    }
  }

  .picked-word {
    margin-inline-end: var(--sp-2);
  }

  .picked-verb {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
  }

  .picked-n {
    color: var(--ink);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
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
    background: var(--line);
    pointer-events: none;
  }

  .scope-place {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    inline-size: 100%;
    min-block-size: var(--sp-7);
    padding-block: var(--sp-1);
    padding-inline: var(--sp-3);
    background: none;
    border: 0;
    border-radius: var(--r-md);
    color: var(--ink);
    font: inherit;
    text-align: start;
    cursor: pointer;
    transition: background var(--d-state) var(--ease-out);
  }

  @media (hover: hover) and (pointer: fine) {
    .scope-place:hover {
      background: var(--hover-wash);
    }
  }

  .scope-said {
    margin: 0;
    max-inline-size: var(--measure);
    color: var(--ink2);
    font-size: var(--t-md);
    line-height: var(--lh-body);
  }

  /* LET GO: a close with the Esc cap beside the glyph, the key that does the same. */
  .picked-clear {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-block-size: var(--ctl-h);
    padding: 0 var(--sp-2) 0 var(--sp-3);
    background: none;
    border: 0;
    border-radius: var(--r-ctl);
    color: var(--ink2);
    font: inherit;
    cursor: pointer;
    transition: background var(--d-state) var(--ease-out);
  }

  @media (hover: hover) and (pointer: fine) {
    .picked-clear:hover {
      background: var(--field);
      color: var(--ink);
    }
  }

  .picked-esc {
    display: inline-flex;
  }

  /* The menu rows: 32 tall with the same wash on hover as every menu row. */
  .mi {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    inline-size: 100%;
    min-block-size: 32px;
    padding: 0 var(--sp-3);
    background: none;
    border: 0;
    border-radius: var(--r-md);
    color: var(--ink2);
    font: inherit;
    font-size: var(--t-ui);
    text-align: start;
    text-decoration: none;
    cursor: pointer;
  }

  /* 44 UNDER A THUMB, measured at 34 on a phone. `13 §7` is the rule. */
  @media (pointer: coarse) {
    .mi {
      min-block-size: var(--tap);
    }

    .picked-esc {
      display: none;
    }
  }

  .mi:hover,
  .mi:focus-visible {
    background: var(--hover-wash);
    color: var(--ink);
  }

  .mi-name {
    flex: 1;
  }

  /* NO RAIL BELOW 900PX, AND THE FLOATING TAB BAR OWNS THE BOTTOM EDGE, so the pill stands over it and over the toast
     that sits on it. */
  @media (width < 900px) {
    .picked-bar {
      inset-block-end: calc(var(--tabbar) + var(--inset) * 3 + var(--tap));
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .picked-bar {
      animation-name: picked-fade;
    }
  }

  @keyframes picked-fade {
    from {
      opacity: 0.6;
    }
  }

  @media (forced-colors: active) {
    .picked-bar::before {
      border: 1px solid CanvasText;
    }
  }
</style>
