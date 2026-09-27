<!--
  Peek: a drawer, with the list still visible, for triage. `p`, and Peek on the row's menu.

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
  import Sheet from '$lib/ui/Sheet.svelte';
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

<Sheet
  open={seq !== null}
  title={String(entry?.fields[title] ?? '')}
  onclose={() => peek(null)}
>
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
        <dt>{labelOf(f)}</dt>
        <dd dir={dirOf(register, f.id)}>{display(register, f.id, entry.fields[f.id], now, names) ?? MISSING}</dd>
      {/each}
    </dl>
  {/if}
  {#snippet footer()}
    <Button weight="primary" href="/r/{register}/{seq}"><Icon name="external" size="s" />{copy.openRow}</Button>
    <Button weight="bare" onclick={() => peek(null)}><Icon name="close" size="s" />{copy.close}</Button>
  {/snippet}
</Sheet>

<style>
  .peek {
    display: grid;
    grid-template-columns: minmax(0, 12ch) minmax(0, 1fr);
    gap: var(--sp-2) var(--sp-3);
    margin: 0;
  }

  .peek dt {
    color: var(--dim);
    font-size: var(--t-sm);
    font-weight: 500;
  }

  .peek dd {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-ui);
    overflow-wrap: anywhere;
  }
</style>
