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
  import type { Entry, RegisterDecl } from '$lib/record/schema.ts';
  import RowMenu from '$lib/ui/RowMenu.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Kbd from '$lib/ui/Kbd.svelte';

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
    archive: (seq: number) => void;
  } = $props();
</script>

<RowMenu {open} at={rect} label={copy.rowMenu} {onclose}>
  {#if row}
    {@const seq = row.seq}
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
    {#if states.length > 0}
      <hr class="mi-rule" />
      {#each states.filter((v) => v !== rowAt(seq)?.fields[decl.state ?? '']) as state}
        <button class="mi" role="menuitem" type="button" onclick={() => setRowState(seq, state)}>
          <Icon name="check" size="s" />
          <span class="mi-name">{copy.setTo(saidInLine(decl?.state ?? '', state))}</span>
        </button>
      {/each}
      <hr class="mi-rule" />
    {/if}
    <button class="mi" role="menuitem" type="button" onclick={() => peek(seq)}>
      <Icon name="eye" size="s" />
      <span class="mi-name">{copy.peek}</span><Kbd keys="p" />
    </button>
    <!-- AND THE ONE VERB THAT UNLOCKS THE OTHER FOUR. Selection was `x` alone, so the bulk bar
         (copy ids, set state, archive them) could not be reached at all without a keyboard. One
         row selected is enough to make it appear, and the bar takes it from there. -->
    <button class="mi" role="menuitem" type="button" onclick={() => toggleSelect(seq, false)}>
      <Icon name="check" size="s" />
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
    <hr class="mi-rule" />
    <button class="mi" role="menuitem" type="button" onclick={() => archive(seq)}>
      <Icon name="archive" size="s" />
      <span class="mi-name">{copy.archive}</span><Kbd keys="⌫" />
    </button>
  {/if}
</RowMenu>

<style>
  /* The menu rows: the same 34px, the same tint-on-hover, and each printing the key it stands in
     for, so using the menu teaches the key that replaces it. */
  .mi {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    inline-size: 100%;
    min-block-size: 34px;
    padding: 0 var(--sp-3);
    background: none;
    border: 0;
    border-radius: var(--r-sm);
    color: var(--ink2);
    font: inherit;
    font-size: var(--t-ui);
    text-align: start;
    text-decoration: none;
    cursor: pointer;
  }

  /* THE MENU IS A KEYBOARD CHEAT SHEET ON A DEVICE WITH NO KEYBOARD. Six of its nine items printed a
     chip, `Enter`, `p`, `y`, `Shift+Y`, `x` and the delete glyph, to somebody holding a phone.
     `/start` hid its digit badges under a coarse pointer for exactly this reason in the thirtieth
     pass and the same rule was never applied here. The bindings are untouched; what goes is the
     advertisement to a reader who cannot press them. */
  @media (pointer: coarse) {
    .mi :global(kbd) {
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

  .mi-rule {
    margin: 4px 0;
    border: 0;
    border-block-start: 1px solid var(--line);
  }

  /* 44 UNDER A THUMB: `.mi` is 34 and lives inside a menu the layout gate does not open. `13 §7`. */
  @media (pointer: coarse) {
    .mi {
      min-block-size: var(--tap);
    }
  }
</style>
