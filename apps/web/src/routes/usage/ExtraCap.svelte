<!--
  Extra usage on one paid record: off, or on under a monthly cap the owner types.

  OFF BY DEFAULT, AND SAID SO: at the allowance a record's actions wait for next month. On, they run on past it at the
  plans' rates until the month comes to the cap, and then wait with the cap named. What the month came to is charged on
  the next invoice, never more than the cap.

  THE WORKER DECIDES, NOT THIS: a press asks `/account/billing/extra`, and its refusal is the sentence under the field.
  Drawn only where `extraOffered` says the host sells it and the record is paid for, so nothing here is a door that is
  not there.
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
    onset,
  }: {
    record: string;
    /** Whether a cap stands now. */
    on: boolean;
    /** The cap that stands, in cents; 0 when off. */
    cap: number;
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
  } as const;

  const id = $derived(`extra-cap-${record}`);
  let typed = $state('');
  let error = $state<string | null>(null);
  let busy = $state(false);

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
  <p class="extra-said">{on ? words.on(centsSaid(cap)) : words.off}</p>
  {#if !on}<p class="extra-how">{words.offHow}</p>{/if}
  <form
    class="extra-form"
    onsubmit={(e) => {
      e.preventDefault();
      save();
    }}
  >
    <Field {id} label={words.label} help={words.help} {error}>
      {#snippet children({ describedBy, invalid })}
        <input {id} class="input extra-input num" inputmode="decimal" autocomplete="off" bind:value={typed} aria-describedby={describedBy} aria-invalid={invalid} disabled={busy} />
      {/snippet}
    </Field>
    <div class="extra-buttons">
      <Button weight="primary" type="submit" disabled={busy}>{on ? words.save : words.turnOn}</Button>
      {#if on}<Button weight="quiet" disabled={busy} onclick={() => void keep(0)}>{words.turnOff}</Button>{/if}
    </div>
  </form>
</div>

<style>
  .extra-cap {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    padding-block-start: var(--sp-3);
    border-block-start: 1px solid var(--rule);
  }

  .extra-said,
  .extra-how {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  .extra-said {
    color: var(--ink);
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
