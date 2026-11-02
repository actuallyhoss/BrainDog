<!--
  Where this row applies, in its header, and the one press that moves it.

  THE CHIP OPENS A SHORT LIST: "Everywhere", then each project by name, with where the row applies now marked. One press
  on another moves the row as the person, as an ordinary edit whose history line reads "Moved to Kiln"
  (`scope-move.ts`). The list is a `Sheet`, so under 640px it rises from the bottom of the screen under the thumb
  that pressed the chip, and from 640px it is the sheet's drawer.

  OPENING A KEY TO EVERY PROJECT IS ASKED ABOUT FIRST, in one sentence and one button that says what it does; every
  other move lands on the press. A token still cannot widen a row: that is the kernel's refusal, and this screen is a
  person's.

  A ROW ON A LIST WHOSE ROWS SAY NOTHING ABOUT WHERE THEY APPLY DRAWS NOTHING HERE, and a list whose rows name several
  projects draws the chip without the move, since "Everywhere" is not a list of projects.

  ON A LIST IT IS `compact`, AND IT IS THE ONE SHEET FOR EVERY ROW. A list's table and its cards draw each row's chip at
  their own size and call `openFor` with the row pressed; this draws no chip and the same sheet the row's page opens.
  One sheet and not one a row, because a `Sheet` always draws its dialog and its head, which was ten nodes a row against
  the list's 2,000, and a dialog inside a table's cell inherits the cell's line height, which is the row's.
-->
<script lang="ts">
  import { apiBase } from '$lib/at.ts';
  import { labelOf } from '$lib/record/api.ts';
  import { meetsOf, orgRoleOf } from '$lib/record/folk.ts';
  import { REGISTERS } from '$lib/record/held.ts';
  import type { Names } from '$lib/record/remote.ts';
  import type { Entry } from '$lib/record/schema.ts';
  import {
    afterMove,
    choiceOf,
    movable,
    moveScope,
    movesIn,
    placesIn,
    scopeFieldOf,
    scopeOf,
    widens,
    words,
    type Landed,
    type Place,
    type Scope,
  } from '$lib/record/scope-move.ts';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import ScopeChip from '$lib/ui/ScopeChip.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import Waiting from '$lib/ui/Waiting.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';

  let {
    register,
    row,
    names,
    live,
    title,
    compact = false,
    size = 'm',
    onmoved,
  }: {
    register: string;
    /** The row as the page holds it, whose `version` a move is written against. A list's is the row `openFor` names. */
    row?: Entry | undefined;
    /** The record's names and marks for the rows this one points at. */
    names: Names | undefined;
    /** Whether the row is the record's and the reader may write its list, which is the only row a move can be written to. */
    live: boolean;
    /** The row's title, for the sentence a conflict says and under the sheet's title. */
    title?: string | undefined;
    /** On a list's table or cards: no chip of its own, and the one sheet every row's chip opens with `openFor`. */
    compact?: boolean;
    /** The chip's size: `s` in the meta line under a row's name. */
    size?: 's' | 'm';
    /** Called once a move has landed with what landed, or with `null` when the row changed somewhere else first. */
    onmoved?: ((landed: Landed | null) => void) | undefined;
  } = $props();

  /* THE ROW A LIST'S CHIP OPENED THE SHEET FOR, its title, and what to give the focus back to once the sheet closes. */
  let held = $state.raw<{ row: Entry; title: string; from: HTMLElement | null } | null>(null);
  const target = $derived(compact ? held?.row : row);
  const named = $derived((compact ? held?.title : title) ?? '');

  /* THE MOVES THAT LANDED, by row, each standing in for its row until the page has read it again (`afterMove`): on a
     list, two rows moved one after the other are both said where they went. */
  let landed = $state<Record<number, Landed>>({});

  const field = $derived(scopeFieldOf(register));
  const now = $derived(target ? afterMove(target, scopeOf(register, target.fields, names), landed[target.seq]) : undefined);
  const scope = $derived(now?.scope);
  const canMove = $derived(movesIn(register, live));
  const folk = $derived(meetsOf(REGISTERS[register]) !== null || orgRoleOf(REGISTERS[register]) !== null);

  let open = $state(false);
  /* `undefined` while the projects are being read, `null` when the record would not list them. */
  let places = $state<Place[] | null | undefined>(undefined);
  /* THE ONE QUESTION A MOVE ASKS: set when the press would open a key to every project, and answered by the button. */
  let asking = $state(false);
  /* ONE MOVE AT A TIME, so a second press on the list while the first is out writes nothing. */
  let moving = $state(false);

  function openMove() {
    const to = field?.to;
    if (!canMove || !to || !target) return;
    asking = false;
    open = true;
    places = undefined;
    void placesIn(apiBase(), to).then((got) => (places = got));
  }

  /**
   * A list's chip, pressed: the sheet opens for that row. `from` is the chip, or the cell that holds it, which takes the
   * focus back when the sheet closes, so Escape lands where the press began.
   */
  export function openFor(r: Entry, t: string, from: HTMLElement | null = null) {
    if (moving) return;
    held = { row: r, title: t, from };
    openMove();
  }

  /** A press on a place: the row's own place closes the list, a key opened to every project asks first. */
  function choose(to: Place | null) {
    if (moving) return;
    const choice = choiceOf(register, scope ?? null, to);
    if (choice === 'here') open = false;
    else if (choice === 'ask') asking = true;
    else moveTo(to);
  }

  function moveTo(to: Place | null) {
    const r = target;
    if (!r || !now) return;
    void write({ row: r, version: now.version, from: scope ?? null, name: named }, to);
  }

  /* THE ROW IS CARRIED, NOT READ AGAIN, so an Undo pressed after the sheet was opened for another row of the list still
     moves the row it undoes, against the version its own move answered. */
  async function write(at: { row: Entry; version: number; from: Scope | null; name: string }, to: Place | null) {
    const f = field;
    if (moving || !live || !movable(f)) return;
    /* THE WAY BACK IS THE PLACE IT WAS IN, found among the places the menu read. It is offered only where going back
       asks nothing: a way back that would open a key to every project is a move to be made with its question. */
    const from = at.from;
    const back = from === null ? null : places?.find((p) => p.spoken === from.spoken);
    moving = true;
    const out = await moveScope(apiBase(), { register, seq: at.row.seq, version: at.version, field: f.id, to, name: at.name });
    moving = false;
    open = false;
    asking = false;
    if (!out.ok) {
      toasts.push(out.fix, { intent: 'warn' });
      /* A ROW CHANGED SOMEWHERE ELSE FIRST IS READ AGAIN, so what the chip says is what the record holds. */
      if (out.stale) onmoved?.(null);
      return;
    }
    const done: Landed = { seq: at.row.seq, version: out.version, to };
    landed = { ...landed, [done.seq]: done };
    toasts.push(
      words.movedTo(to?.name ?? words.everywhere),
      back !== undefined && !widens(register, to, back) ? { undo: () => void write({ row: at.row, version: out.version, from: to, name: at.name }, back) } : {},
    );
    onmoved?.(done);
  }

  /* ON A LIST, THE FOCUS GOES BACK TO THE CHIP THAT OPENED THE SHEET, or its cell, if it is still on the screen. */
  function closed() {
    asking = false;
    const from = compact ? held?.from : null;
    if (from?.isConnected && document.activeElement !== from) from.focus();
  }

  const isHere = (p: Place | null): boolean => (p === null ? scope === null : scope?.spoken === p.spoken);
</script>

{#snippet confirm()}
  <Button weight="primary" disabled={moving} onclick={() => moveTo(null)}>{words.widenGo}</Button>
{/snippet}

{#snippet place(p: Place | null)}
  <li>
    <button type="button" class="scope-place" aria-current={isHere(p) ? 'true' : undefined} disabled={moving} onclick={() => choose(p)}>
      <ScopeChip scope={p} />
      {#if isHere(p)}<span class="scope-here"><Icon name="check" size="s" title={words.current} /></span>{/if}
    </button>
  </li>
{/snippet}

<!-- A PERSON OR AN ORGANISATION TIED TO NO PROJECT WEARS NO CHIP UNDER ITS NAME unless the chip moves it (31 October,
     AG23): Ada Vine's page read "Everywhere" in front of "Accountant at Pell & Vine", which nobody could press or
     explain. A key's "Everywhere" stays: there it says which machines may open it. -->
{#if !compact && scope !== undefined && (scope !== null || canMove || !folk)}
  <ScopeChip {scope} {size} onmove={canMove ? openMove : undefined} />
{/if}

{#if canMove && field}
  <Sheet bind:open title={labelOf(field)} subtitle={named} footer={asking ? confirm : undefined} onclose={closed}>
    {#if asking}
      <p class="scope-ask">{words.widenKey}</p>
    {:else if places === undefined}
      <!-- ONLY WHILE THE SHEET IS OPEN: a sheet's body is in the page shut too, and a busy placeholder there for good kept
           every page with a movable chip from ever being at rest (audit 31 Oct A30). -->
      {#if open}<Waiting rows={3} />{/if}
    {:else if places === null}
      <p class="scope-said" role="status">{words.noPlaces}</p>
      <!-- A FAILED WALK IS NOT KEPT (`scope-move.ts` `placesIn`), so asking again reads the projects again. -->
      <Button weight="quiet" onclick={openMove}>{words.retry}</Button>
    {:else}
      <ul class="scope-places" aria-label={labelOf(field)}>
        {@render place(null)}
        {#each places as p (p.id)}{@render place(p)}{/each}
      </ul>
    {/if}
  </Sheet>
{/if}

<style>
  /* ROWS WITH SPACE AND NO BOX AROUND THEM, each the whole of its target and 48px tall, which is the
     action sheet's row under a thumb. A hairline between two rows, drawn inset so it runs under the words and never
     under the wash's curve; the row pointed at, and the place the row applies now, take the rounded wash. */
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
    justify-content: space-between;
    gap: var(--sp-3);
    inline-size: 100%;
    min-block-size: var(--sp-7);
    padding-block: var(--sp-1);
    padding-inline: var(--sp-3);
    background: none;
    border: 0;
    border-radius: var(--r-pop);
    color: var(--ink);
    font: inherit;
    text-align: start;
    cursor: pointer;
    transition: background var(--d-state) var(--ease-out);
  }

  .scope-place[aria-current] {
    background: var(--chosen);
  }

  @media (hover: hover) and (pointer: fine) {
    .scope-place:hover {
      background: var(--hover);
    }
  }

  /* A WASHED ROW'S HAIRLINES STEP ASIDE, so the fill is one clean shape. */
  .scope-places > li:has(> .scope-place[aria-current])::after,
  .scope-places > li:has(> .scope-place[aria-current]) + li::after {
    opacity: 0;
  }

  .scope-here {
    display: inline-flex;
    color: var(--ink);
  }

  .scope-ask,
  .scope-said {
    margin: 0;
    max-inline-size: var(--measure);
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
  }
</style>
