<!--
  Extra usage on one paid record: off, or on under a monthly cap the owner types.

  OFF BY DEFAULT, AND SAID SO: at the allowance a record's actions wait for next month. On, they run on past it at the
  plans' rates until the month comes to the cap, and then wait with the cap named. What the month came to is charged on
  the next invoice, never more than the cap.

  THE WORKER DECIDES, NOT THIS: a press asks `/account/billing/extra`, and its refusal is the sentence under the field.
  Drawn only where `extraOffered` says the host sells it and the record is paid for, so nothing here is a door that is
  not there.

  ONE LINE AND ONE PRESS UNTIL IT IS WANTED: what stands now and a button at the foot of the allowance tile, and the field
  opens under them. The form stood open on every visit, a third of the tile for something changed once a year.
-->
<script lang="ts">
  import Button from '$lib/ui/Button.svelte';
  import Field from '$lib/ui/Field.svelte';
  import { centsSaid } from '$lib/record/actions.ts';
  import { capCents, setExtraCap } from '../settings/billing.ts';

  let {
    record,
    on,
    cap,
    said,
    onset,
  }: {
    record: string;
    /** Whether a cap stands now. */
    on: boolean;
    /** The cap that stands, in cents; 0 when off. */
    cap: number;
    /** The month's own line on extra usage, what it has come to so far, which says more than the cap alone. */
    said?: string | null | undefined;
    /** Called once the Worker kept the change, so the page reads the month again. */
    onset: () => void;
  } = $props();

  const words = {
    off: 'Extra usage is off. At the allowance, actions wait until next month.',
    offHow: 'Turn it on with a monthly cap, and past the allowance actions run on at the published rates until the month comes to the cap. It is charged on your next invoice.',
    on: (capSaid: string) => `Extra usage is on, up to ${capSaid} a month.`,
    label: 'Monthly cap',
    help: 'In dollars. Never charged past it.',
    wrong: 'Type a sum in dollars, from 0.01 to 1,000.',
    turnOn: 'Turn on',
    save: 'Save cap',
    turnOff: 'Turn off',
    change: 'Change cap',
    close: 'Cancel',
  } as const;

  const id = $derived(`extra-cap-${record}`);
  let typed = $state('');
  let error = $state<string | null>(null);
  let busy = $state(false);
  let open = $state(false);
  const line = $derived(on ? (said ?? words.on(centsSaid(cap))) : said ? `${words.off} ${said}` : words.off);

  $effect(() => {
    typed = cap > 0 ? (cap % 100 === 0 ? String(cap / 100) : (cap / 100).toFixed(2)) : '';
  });

  async function keep(cents: number): Promise<void> {
    busy = true;
    error = null;
    const out = await setExtraCap(record, cents);
    busy = false;
    if (!out.ok) {
      error = out.refusal.fix;
      return;
    }
    open = false;
    onset();
  }

  function save(): void {
    const cents = capCents(typed);
    if (cents === null) {
      error = words.wrong;
      return;
    }
    void keep(cents);
  }
</script>

<div class="extra-cap">
  <div class="extra-row">
    <p class="extra-said">{line}</p>
    <Button weight="quiet" size="sm" aria-expanded={open} onclick={() => (open = !open)}>{open ? words.close : on ? words.change : words.turnOn}</Button>
  </div>
  {#if open}
  {#if !on}<p class="extra-said">{words.offHow}</p>{/if}
  <form
    class="extra-form"
    onsubmit={(e) => {
      e.preventDefault();
      save();
    }}
  >
    <Field {id} label={words.label} help={words.help} {error}>
      {#snippet children({ describedBy, invalid })}
        <div class="field extra-input"><input {id} class="field-input num" inputmode="decimal" autocomplete="off" bind:value={typed} aria-describedby={describedBy} aria-invalid={invalid} disabled={busy} /></div>
      {/snippet}
    </Field>
    <div class="extra-buttons">
      <Button weight="primary" type="submit" disabled={busy}>{on ? words.save : words.turnOn}</Button>
      {#if on}<Button weight="quiet" disabled={busy} onclick={() => void keep(0)}>{words.turnOff}</Button>{/if}
    </div>
  </form>
  {/if}
</div>

<style>
  .extra-cap {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .extra-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-3);
  }

  .extra-said {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  .extra-form {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: var(--sp-3);
  }

  .extra-input {
    inline-size: 8rem;
  }

  .extra-buttons {
    display: flex;
    gap: var(--sp-2);
  }
</style>
