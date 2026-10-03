<!--
  Peek: the row beside the list, for triage. `p`, and Peek on the row's menu.

  THE DOCKED PANEL: from 900px up it stands at the window's end edge, 440 wide, and the list narrows
  beside it and stays in view, so `j` and `k` go on walking the list and `p` peeks the next row. Its head is glass (the
  close circle, the row's title, and "Open the row" with its key); its body is white. Below 900px it is a bottom sheet.
  It is a `<dialog>` either way, so what reads an open peek as `dialog[open]` still finds one.

  It needs a VISIBLE affordance: Linear's own docs admit the flaw that Peek can only be launched with
  the keyboard shortcut, and users do not press `?` to discover what they do not know exists (19 §4).
  The row menu is that affordance. WHICH ROW IS PEEKED IS IN THE ADDRESS (`?row=7`), so the page reads
  it and writes it, and closing this is the page's `peek(null)`.
-->
<script lang="ts">
  import { MISSING } from 'braindog-render';
  import { copy } from '$lib/copy.ts';
  import { dirOf, display, labelOf, readableFields } from '$lib/record/api.ts';
  import type { Names } from '$lib/record/remote.ts';
  import type { Entry } from '$lib/record/schema.ts';
  import Button from '$lib/ui/Button.svelte';
  import Panel from '$lib/ui/Panel.svelte';
  import Icon from '$lib/ui/Icon.svelte';

  let {
    register,
    seq,
    entry,
    title,
    now,
    names,
    peek,
  }: {
    register: string;
    /** The peeked row's number, or null when nothing is peeked. */
    seq: number | null;
    entry: Entry | undefined;
    /** The field that titles a row. */
    title: string;
    now: number;
    names: Names | undefined;
    peek: (seq: number | null) => void;
  } = $props();
</script>

<!-- WHAT IT SHOWS IS THE ROW, by its number and not by its title (`Panel` `shows`): a title still on its way read as a
     switch, and a peek moved between two rows that share one did not. -->
<Panel open={seq !== null} title={(entry ? display(register, title, entry.fields[title], now, names) : null) ?? ''} shows={seq} onclose={() => peek(null)}>
  {#snippet verbs()}
    <Button weight="primary" size="sm" href="/r/{register}/{seq}" kbd="↵"><Icon name="external" size="s" />{copy.openRow}</Button>
  {/snippet}
  {#if entry}
    <!-- FORMATTED, through the same `display` every other surface goes through.

         This drew `peekedEntry.fields[f.id]` straight out of the row, which is how the drawer
         came to show `amount 480000`, `party 1` and `due 2026-07-27` beside a table showing
         `GBP 4,800.00`, `Halden Type Co` and `27 Jul 2026` for the same row. Money in minor units
         on a screen a person reads is the one formatting bug this product cannot ship, and a
         `ref` rendered as the integer it is stored as is a row nobody can identify.

         Labels go through `labelOf` for the same reason: the drawer was printing raw field ids. -->
    <dl class="peek">
      {#each readableFields(register) as f}
        <div>
          <dt>{labelOf(f)}</dt>
          <dd dir={dirOf(register, f.id)}>{display(register, f.id, entry.fields[f.id], now, names) ?? MISSING}</dd>
        </div>
      {/each}
    </dl>
  {/if}
</Panel>

<style>
  /* LABEL OVER VALUE, one field under another: 13/500 in the quiet ink over the value at the body size, 16 between
     fields. A two-column grid in a 440 panel left the values a third of it. */
  .peek {
    display: grid;
    gap: var(--sp-4);
    margin: 0;
  }

  .peek > div {
    display: grid;
    gap: 2px;
    min-inline-size: 0;
  }

  .peek dt {
    color: var(--dim);
    font-size: var(--t-sm);
    font-weight: 500;
    line-height: 18px;
  }

  .peek dd {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-base);
    line-height: 20px;
    overflow-wrap: anywhere;
  }
</style>
