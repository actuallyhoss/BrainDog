<!--
  ADD ONE READING TO A KEY NUMBER (the KPI plan of 21 October, 2.3 "typed" and K4-B): the fix a stale number offers when
  no agent keeps it. One field and Save, in the shared sheet (`Sheet.svelte`), a side panel from 900px up and a bottom
  sheet on a phone.

  THE ROW IS ONE READING IN THE READINGS LIST (Numbers), under the number's own measure, on its project, at this moment,
  as `stale-fix.ts` `readingOf` makes it: a plain value with its unit, or money in minor units of its currency. The list
  is found by its shape and learnt before the write, so the row writer turns the project's number into its id. A done
  write closes the sheet and leaves a toast naming the number with Undo; what the record refuses is said in the foot.
-->
<script lang="ts">
  import { tick } from 'svelte';
  import { apiBase } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import { REGISTERS } from '$lib/record/held.ts';
  import { rowWriter, type RowWriter } from '$lib/record/rows-write.ts';
  import Button from '$lib/ui/Button.svelte';
  import Field from '$lib/ui/Field.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import '$lib/ui/forms.css';
  import { projectFieldOf, readingOf, type ReadingFor } from './stale-fix.ts';

  let {
    open = $bindable(false),
    list,
    projects,
    project,
    kpi,
    now,
    onsaved,
  }: {
    open?: boolean | undefined;
    /** The readings list, found by its shape (`kpi-rows.ts` `findReadingList`). */
    list: string;
    /** The projects list its link points at. */
    projects: string | null;
    /** The project the number is on: its number and its name. */
    project: { seq: number; name: string };
    kpi: ReadingFor;
    now: () => number;
    onsaved?: (() => void) | undefined;
  } = $props();

  const uid = $props.id();
  let typed = $state('');
  let fault = $state<string | null>(null);
  let refused = $state<string | null>(null);
  let busy = $state(false);

  let was = false;
  $effect(() => {
    if (open && !was) {
      typed = '';
      fault = null;
      refused = null;
      busy = false;
    }
    was = open;
  });

  const unit = $derived((kpi.unit ?? '').trim());
  let own: RowWriter | undefined;
  const writer = (): RowWriter => (own ??= rowWriter(apiBase()));

  async function save(e?: SubmitEvent) {
    e?.preventDefault();
    if (busy) return;
    const decl = REGISTERS[list];
    const field = decl ? projectFieldOf(decl.fields as never, projects) : null;
    if (!decl || !field) return void (refused = copy.kpiReadingNoList);
    const source = decl.fields.find((f) => f.id === 'source') as { values?: readonly unknown[] } | undefined;
    const out = readingOf(kpi, typed, { project: project.seq, field, now: now(), sources: source?.values, amount: decl.fields.some((f) => f.id === 'amount') });
    if (!out.ok) {
      fault = out.fault;
      await tick();
      document.getElementById(`${uid}-value`)?.focus();
      return;
    }
    fault = null;
    busy = true;
    refused = null;
    const w = writer();
    const made = await w.create(list, out.fields);
    busy = false;
    if (!made.ok) return void (refused = made.fix);
    open = false;
    const entry = made.entry;
    toasts.push(copy.kpiReadingAdded(kpi.name), {
      undo: () =>
        void w.archive(list, entry.seq, entry.version).then((b) => {
          toasts.push(b.ok ? copy.kpiUndone : b.fix, b.ok ? {} : { intent: 'bad' });
          onsaved?.();
        }),
    });
    onsaved?.();
  }
</script>

<Sheet bind:open title={copy.kpiReadingTitle} subtitle={`${kpi.name} · ${project.name}`}>
  <form class="rd-form" id="{uid}-form" novalidate onsubmit={save}>
    <Field id="{uid}-value" label={unit ? `${copy.kpiReadingValue} (${unit})` : copy.kpiReadingValue} error={fault}>
      {#snippet children(c)}
        <div class="field">
          <input
            id="{uid}-value"
            class="field-input"
            type="text"
            inputmode="decimal"
            autocomplete="off"
            enterkeyhint="done"
            placeholder={copy.kpiReadingPlaceholder}
            aria-describedby={c.describedBy}
            aria-invalid={c.invalid ? 'true' : undefined}
            bind:value={typed}
          />
        </div>
      {/snippet}
    </Field>
  </form>

  {#snippet footer()}
    {#if refused}<p class="rd-refused" role="alert"><Icon name="alert" size="s" /><span>{refused}</span></p>{/if}
    <Button weight="quiet" disabled={busy} onclick={() => (open = false)}>{copy.kpiCancel}</Button>
    <Button weight="primary" type="submit" form="{uid}-form" disabled={busy}>{copy.kpiSave}</Button>
  {/snippet}
</Sheet>

<style>
  .rd-form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
  }

  .rd-refused {
    display: flex;
    align-items: flex-start;
    gap: var(--sp-2);
    margin: 0;
    color: var(--red);
    font-size: var(--fs-body);
  }

  .rd-refused :global(svg) {
    flex: none;
    margin-block-start: 0.2em;
  }
</style>
