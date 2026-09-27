<!--
  Where this row applies, in its header, and the one press that moves it (agents C8, AGT-11).

  THE CHIP OPENS A SHORT LIST: "Everywhere", then each project by name, with where the row applies now marked. One press
  on another moves the row as the person, as an ordinary edit whose history line reads "Moved to Kiln"
  (`scope-move.ts`). The list is a `Sheet`, so under 640px it rises from the bottom of the screen under the thumb
  that pressed the chip, and from 640px it is the sheet's drawer.

  OPENING A KEY TO EVERY PROJECT IS ASKED ABOUT FIRST, in one sentence and one button that says what it does; every
  other move lands on the press. A token still cannot widen a row: that is the kernel's refusal, and this screen is a
  person's.

  A ROW ON A LIST WHOSE ROWS SAY NOTHING ABOUT WHERE THEY APPLY DRAWS NOTHING HERE, and a list whose rows name several
  projects draws the chip without the move, since "Everywhere" is not a list of projects.
-->
<script lang="ts">
  import { apiBase } from '$lib/at.ts';
  import { labelOf } from '$lib/record/api.ts';
  import type { Names } from '$lib/record/remote.ts';
  import type { Entry } from '$lib/record/schema.ts';
  import { movable, moveScope, placesIn, scopeFieldOf, scopeOf, widens, words, type Place } from '$lib/record/scope-move.ts';
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
    onmoved,
  }: {
    register: string;
    /** The row as the page holds it, whose `version` a move is written against. */
    row: Entry;
    /** The record's names and marks for the rows this one points at. */
    names: Names | undefined;
    /** Whether the row is the record's, which is the only row a move can be written to. */
    live: boolean;
    /** The row's title, for the sentence a conflict says. */
    title: string;
    /** Called once a move has landed, so the page reads the row and its history again. */
    onmoved: () => void;
  } = $props();

  const field = $derived(scopeFieldOf(register));
  const scope = $derived(scopeOf(register, row.fields, names));
  const canMove = $derived(live && movable(field));

  let open = $state(false);
  /* `undefined` while the projects are being read, `null` when the record would not list them. */
  let places = $state<Place[] | null | undefined>(undefined);
  /* THE ONE QUESTION A MOVE ASKS: set when the press would open a key to every project, and answered by the button. */
  let asking = $state(false);
  /* ONE MOVE AT A TIME, so a second press on the list while the first is out writes nothing (defects U2). */
  let moving = $state(false);

  function openMove() {
    const to = field?.to;
    if (!canMove || !to) return;
    asking = false;
    open = true;
    places = undefined;
    void placesIn(apiBase(), to).then((got) => (places = got));
  }

  /** A press on a place: the row's own place closes the list, a key opened to every project asks first. */
  function choose(to: Place | null) {
    if (moving) return;
    if ((to === null && scope === null) || (to !== null && scope?.spoken === to.spoken)) {
      open = false;
      return;
    }
    if (widens(register, scope ?? null, to)) {
      asking = true;
      return;
    }
    void moveTo(to);
  }

  async function moveTo(to: Place | null) {
    const f = field;
    if (moving || !live || !movable(f)) return;
    const from = scope ?? null;
    /* THE WAY BACK IS THE PLACE IT WAS IN, found among the places the menu read. It is offered only where going back
       asks nothing: a way back that would open a key to every project is a move to be made with its question. */
    const back = from === null ? null : places?.find((p) => p.spoken === from.spoken);
    moving = true;
    const out = await moveScope(apiBase(), { register, seq: row.seq, version: row.version, field: f.id, to, name: title });
    moving = false;
    open = false;
    asking = false;
    if (!out.ok) {
      toasts.push(out.fix, { intent: 'warn' });
      /* A ROW CHANGED SOMEWHERE ELSE FIRST IS READ AGAIN, so what the chip says is what the record holds. */
      if (out.stale) onmoved();
      return;
    }
    toasts.push(words.movedTo(to?.name ?? words.everywhere), back !== undefined && !widens(register, to, back) ? { undo: () => void moveTo(back) } : {});
    onmoved();
  }

  const isHere = (p: Place | null): boolean => (p === null ? scope === null : scope?.spoken === p.spoken);
</script>

{#snippet confirm()}
  <Button weight="primary" disabled={moving} onclick={() => void moveTo(null)}>{words.widenGo}</Button>
{/snippet}

{#snippet place(p: Place | null)}
  <li>
    <button type="button" class="scope-place" aria-current={isHere(p) ? 'true' : undefined} disabled={moving} onclick={() => choose(p)}>
      <ScopeChip scope={p} />
      {#if isHere(p)}<span class="scope-here"><Icon name="check" size="s" title={words.current} /></span>{/if}
    </button>
  </li>
{/snippet}

{#if scope !== undefined}
  <ScopeChip {scope} size="m" onmove={canMove ? openMove : undefined} />
{/if}

{#if canMove && field}
  <Sheet bind:open title={labelOf(field)} subtitle={title} footer={asking ? confirm : undefined} onclose={() => (asking = false)}>
    {#if asking}
      <p class="scope-ask">{words.widenKey}</p>
    {:else if places === undefined}
      <Waiting rows={3} />
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
  /* ROWS WITH SPACE AND NO BOX AROUND THEM (design-brief §1), each the whole of its target and 48px tall, which is the
     action sheet's row under a thumb. */
  .scope-places {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .scope-place {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-3);
    inline-size: 100%;
    min-block-size: var(--sp-7);
    padding-block: var(--sp-1);
    padding-inline: var(--sp-2);
    background: none;
    border: 0;
    border-block-end: 1px solid var(--line-soft);
    border-radius: 0;
    color: var(--ink);
    font: inherit;
    text-align: start;
    cursor: pointer;
  }

  .scope-place[aria-current] {
    background: var(--selected);
  }

  @media (hover: hover) and (pointer: fine) {
    .scope-place:hover {
      background: var(--hover-wash);
    }
  }

  .scope-here {
    display: inline-flex;
    color: var(--ink);
  }

  .scope-ask,
  .scope-said {
    margin: 0;
    max-inline-size: var(--measure);
    color: var(--ink2);
    font-size: var(--t-md);
    line-height: var(--lh-body);
  }
</style>
