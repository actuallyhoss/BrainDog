<!--
  One row's verbs in a menu: `⇧F10` and the context-menu key on the grid, the ⋯ at the end of a
  grid row, and the ⋯ on a card, which is the only way to them on a phone.

  ONE MENU FOR EVERY WAY IN, so there is one set of verbs rather than a touch copy of them. It holds
  the row it was opened on (`row`), which the page chose, because `focus.row` is the row the KEYBOARD
  is on and no row at all on a phone. Every verb is the page's (`setRowState`, `peek`, `toggleSelect`,
  `copyId`, `copyLink`, `archive`).
-->
<script lang="ts">
  import { at } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import { display } from '$lib/record/api.ts';
  import SendItem from '$lib/send/SendItem.svelte';
  import type { Entry, RegisterDecl } from '$lib/record/schema.ts';
  import RowMenu from '$lib/ui/RowMenu.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Kbd from '$lib/ui/Kbd.svelte';
  import StateDot from '$lib/ui/StateDot.svelte';
  import { rowsAsCards } from '$lib/ui/body.svelte.ts';
  import { dotOf } from './list.ts';

  let {
    open,
    rect,
    row,
    register,
    decl,
    states,
    selected,
    rowAt,
    saidInLine,
    onclose,
    setRowState,
    peek,
    toggleSelect,
    copyId,
    copyLink,
    archive,
    keepPrivate,
    onhanded,
    share,
  }: {
    open: boolean;
    /** The row's viewport rect, taken when the menu opened. */
    rect: { x: number; y: number; height: number } | null;
    row: Entry | undefined;
    register: string;
    decl: RegisterDecl;
    states: readonly string[];
    selected: ReadonlySet<number>;
    rowAt: (seq: number) => Entry | undefined;
    saidInLine: (field: string, value: string) => string;
    onclose: () => void;
    setRowState: (seq: number, state: string) => void;
    peek: (seq: number) => void;
    toggleSelect: (seq: number, extend: boolean) => void;
    copyId: (seq: number) => void;
    copyLink: (seq: number) => void;
    /** Absent for a caller whose level cannot change the list, and Archive is then not in the menu. */
    archive?: ((seq: number) => void) | undefined;
    /**
     * Keep the row to its maker, or share it again. A list read carries `private` only on a row its reader made, so a row not
     * marked is offered the verb too and the record refuses anybody but the maker, in its own sentence.
     */
    keepPrivate?: ((seq: number, on: boolean) => void) | undefined;
    /** How the row a hand leaves lands back on the grid (`landRow`), on a live record only. */
    onhanded?: ((entry: Entry) => void) | undefined;
    /** Share the row with somebody, for an owner or an Admin; absent for anybody else. */
    share?: ((seq: number) => void) | undefined;
  } = $props();

  /* THE STATE THE ROW IS IN NAMES ITS FIELD ("Status: Open"), so it never reads as the menu's first verb, Open. */
  const stateName = $derived.by(() => {
    const f = decl?.fields.find((x) => x.id === decl.state);
    return f ? (f.label ?? f.id.charAt(0).toUpperCase() + f.id.slice(1)) : '';
  });
</script>

<RowMenu {open} at={rect} label={copy.rowMenu} {onclose} hand={row && onhanded ? { register, row, decl, onhanded } : null}>
  {#if row}
    {@const seq = row.seq}
    <!-- SEND TO… LEADS, the row attached, as its `s` and its page's Send button do. -->
    <SendItem kind={register} attach={[{ ref: `${register}#${seq}`, label: display(register, decl.title, row.fields[decl.title]) ?? copy.thisRow }]} />
    <!-- A glyph per verb. The rail's menu has always had them and this one never did, so four
         rows of identical grey text carried the whole distinction between opening a row and
         throwing it away. -->
    <a class="mi" role="menuitem" href={at(`/r/${register}/${seq}`)}>
      <Icon name="external" size="s" />
      <span class="mi-name">{copy.openRow}</span><Kbd keys="↵" />
    </a>
    <!-- THE REGISTER'S OWN STATES, WHICH THIS MENU DID NOT CARRY.
         Five verbs, and the one a person reaches for most on a list of obligations was not among
         them: the only way to move a row's state was to select it and use the bulk bar, which is
         three presses to change one row. The values come from the declaration rather than from a
         list typed here, so a pack that adds a state gets a menu item.

         NOT THE STATE IT IS ALREADY IN. An item that sets a row to where it already is does
         nothing and looks like it did something, and `19 §6`'s rule for a control that cannot act
         is that it is absent rather than greyed.

         AND THEY COME SECOND, RIGHT AFTER OPEN. They were items six to eight, under Peek, Copy
         id, Copy link and Select, so the verbs that change an invoice were below the tab bar on an
         844px phone when the menu opened from the first card, while two developer verbs sat above
         them. The copy verbs now come last, before Archive, which keeps its own rule. -->
    <!-- EACH STATE WITH ITS OWN DOT, THE ONE IT IS IN TICKED AT THE END (money F8): a tick beside every "Set to" read as
         "this is on". The one it is in is said and does nothing when pressed. -->
    {#if states.length > 0}
      {@const now = String(rowAt(seq)?.fields[decl.state ?? ''] ?? '')}
      <hr class="mi-rule" />
      {#each states as state}
        {@const word = saidInLine(decl?.state ?? '', state)}
        <button
          class="mi"
          role="menuitemradio"
          aria-checked={state === now ? 'true' : 'false'}
          type="button"
          onclick={() => {
            if (state !== now) setRowState(seq, state);
            onclose();
          }}
        >
          <span class="mi-dot"><StateDot state={dotOf(decl, state)} /></span>
          <span class="mi-name">{state === now ? `${stateName}: ${word}` : copy.setTo(word)}</span>
          {#if state === now}<span class="mi-on"><Icon name="check" size="s" /></span>{/if}
        </button>
      {/each}
      <hr class="mi-rule" />
    {/if}
    <!-- PREVIEW ONLY WITH A MOUSE: on a phone Open does the same, a screen away. -->
    {#if !rowsAsCards()}
      <button class="mi" role="menuitem" type="button" onclick={() => peek(seq)}>
        <Icon name="eye" size="s" />
        <span class="mi-name">{copy.peek}</span><Kbd keys="p" />
      </button>
    {/if}
    <!-- AND THE ONE VERB THAT UNLOCKS THE OTHER FOUR. Selection was `x` alone, so the bulk bar
         (copy ids, set state, archive them) could not be reached at all without a keyboard. One
         row selected is enough to make it appear, and the bar takes it from there. -->
    <button class="mi" role="menuitem" type="button" onclick={() => toggleSelect(seq, false)}>
      <span class="mi-box" data-on={selected.has(seq) ? '' : undefined} aria-hidden="true">{#if selected.has(seq)}<Icon name="check" size="s" />{/if}</span>
      <span class="mi-name">{selected.has(seq) ? copy.deselect : copy.select}</span><Kbd keys="x" />
    </button>
    <button class="mi" role="menuitem" type="button" onclick={() => copyId(seq)}>
      <Icon name="copy" size="s" />
      <span class="mi-name">{copy.copyId}</span><Kbd keys="y" />
    </button>
    <button class="mi" role="menuitem" type="button" onclick={() => copyLink(seq)}>
      <Icon name="link" size="s" />
      <span class="mi-name">{copy.copyLink}</span><Kbd keys="⇧Y" />
    </button>
    {#if share}
      <button class="mi" role="menuitem" type="button" onclick={() => share?.(seq)}>
        <Icon name="external" size="s" />
        <span class="mi-name">{copy.shareOpen}</span>
      </button>
    {/if}
    {#if keepPrivate}
      <button class="mi" role="menuitem" type="button" onclick={() => keepPrivate?.(seq, row.private !== true)}>
        <Icon name="lock" size="s" />
        <span class="mi-name">{row.private === true ? copy.rowShareAgain : copy.rowKeepPrivate}</span>
      </button>
    {/if}
    {#if archive}
      <hr class="mi-rule" />
      <button class="mi" role="menuitem" type="button" onclick={() => archive?.(seq)}>
        <Icon name="archive" size="s" />
        <span class="mi-name">{copy.archive}</span><Kbd keys="⌫" />
      </button>
    {/if}
  {/if}
</RowMenu>

<style>
  /* THE ROWS ARE `Menu`'s: 36 tall, 48 in the phone's sheet, a 16px icon in a 20px slot. What is this file's is
     the state's dot in that slot, the tick at the end of the one the row is in, and Select's box. */
  .mi-name {
    flex: 1;
  }

  .mi-dot {
    display: inline-grid;
    place-items: center;
    inline-size: 20px;
    flex: none;
  }

  .mi-on {
    display: inline-flex;
    color: var(--ink);
  }

  /* SELECT'S BOX, the list's picker in small: 14 square, radius 4, the button red once ticked. */
  .mi-box {
    display: inline-grid;
    place-items: center;
    flex: none;
    inline-size: 14px;
    block-size: 14px;
    margin-inline: 3px;
    border: 1.5px solid var(--ink-2);
    border-radius: var(--r-xs);
    color: var(--on-mark);
  }

  .mi-box :global(svg) {
    inline-size: 10px;
    block-size: 10px;
  }

  .mi-box[data-on] {
    background: var(--on);
    border-color: var(--on);
  }

  /* THE MENU IS A KEYBOARD CHEAT SHEET ON A DEVICE WITH NO KEYBOARD: under a thumb the key caps go. */
  @media (pointer: coarse) {
    .mi :global(kbd) {
      display: none;
    }
  }

  .mi-rule {
    margin: var(--sp-1) 0;
    border: 0;
    border-block-start: 1px solid var(--rule);
  }
</style>
