<!--
  "Only tasks where...": the condition a share is narrowed by (sharing plan §2.3), one field and its value a line, every
  line together.

  THE PEOPLE EXCEPTION BUILDER'S PIECES. The fields offered are the ones a person can say one value of, and a typed
  value is sent as the field holds it (`ruleValue` in `settings-write.ts`), with a choice's own words and Yes or No for
  a yes-or-no field, as Settings > People narrows a list. Two things differ: a link to another row is not offered,
  because its value is the row's id and a sentence never names one; and there may be up to four lines, which the record
  keeps as one tree with each field by its id, so renaming a value elsewhere never widens the share.

  `where` IS `null` WHILE A LINE IS NOT SAID YET, which keeps Share off rather than sending a condition no row meets.
-->
<script lang="ts">
  import type { ShareWhere } from '@braindog/kernel';
  import { copy } from '$lib/copy.ts';
  import { labelOf } from '$lib/record/api.ts';
  import { REGISTERS } from '$lib/record/held.ts';
  import type { FieldDecl } from '$lib/record/schema.ts';
  import { ruleValue } from '$lib/record/settings-write.ts';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';

  let { list, where = $bindable(null) }: { list: string; where?: ShareWhere | null } = $props();

  /* THE PEOPLE BUILDER'S FIELD TYPES, less a link to a row (an id) and a document, a secret, an amount or a moment. */
  const TYPES: ReadonlySet<string> = new Set(['text', 'enum', 'email', 'url', 'int', 'decimal', 'bool', 'day']);
  const MOST = 4;

  const fields = $derived((REGISTERS[list]?.fields ?? []).filter((f) => !f.retired && TYPES.has(f.type)));
  const fieldOf = (id: string): FieldDecl | undefined => fields.find((f) => f.id === id);

  type Line = { field: string; value: string };
  const uid = $props.id();

  /** The lines a condition this sheet made reads back as: one leaf, or every leaf of an `all`. */
  function linesOf(w: ShareWhere | null): Line[] {
    const leaf = (x: unknown): Line | null => {
      if (typeof x !== 'object' || x === null) return null;
      const o = x as { field?: unknown; is?: unknown };
      return typeof o.field === 'string' && o.is !== undefined && Object.keys(o).length === 2 ? { field: o.field, value: String(o.is) } : null;
    };
    if (w === null) return [];
    const all = (w as { all?: unknown }).all;
    const got = Array.isArray(all) ? all.map(leaf) : [leaf(w)];
    return got.every((l) => l !== null) ? (got as Line[]) : [];
  }

  /** Where a picked field's value starts: a choice's first value and Yes are picked already, words are typed. */
  const startValue = (f: FieldDecl | undefined): string => (f?.type === 'bool' ? 'true' : f?.type === 'enum' ? (f.values?.[0] ?? '') : '');
  const fresh = (): Line => {
    const f = fields[0];
    return { field: f?.id ?? '', value: startValue(f) };
  };

  let lines = $state<Line[]>([]);
  $effect.pre(() => {
    if (lines.length > 0 || fields.length === 0) return;
    const held = linesOf(where);
    if (held.length) lines = held;
    else changed([fresh()]);
  });

  /** The tree the lines say, or `null` while one of them is not a value its field holds. */
  function said(ls: readonly Line[]): ShareWhere | null {
    const leaves: { field: string; is: string | number | boolean }[] = [];
    for (const l of ls) {
      const f = fieldOf(l.field);
      const v = f ? ruleValue(f.type, l.value) : null;
      if (!f || v === null) return null;
      leaves.push({ field: f.id, is: v as string | number | boolean });
    }
    if (leaves.length === 0) return null;
    return (leaves.length === 1 ? leaves[0] : { all: leaves }) as ShareWhere;
  }

  function changed(next: Line[]) {
    lines = next;
    where = said(next);
  }

  const valueSaid = (f: FieldDecl, v: string): string => f.labels?.[v] ?? v;
</script>

<div class="cond">
  {#each lines as line, i (i)}
    {@const f = fieldOf(line.field)}
    <div class="cond-line">
      <select
        class="cond-field"
        aria-label={copy.conditionField}
        value={line.field}
        onchange={(e) => changed(lines.map((l, j) => (j === i ? { field: e.currentTarget.value, value: startValue(fieldOf(e.currentTarget.value)) } : l)))}
      >
        {#each fields as option (option.id)}<option value={option.id}>{labelOf(option)}</option>{/each}
      </select>
      <span class="cond-is" id="{uid}-is-{i}">{copy.conditionIs}</span>
      {#if f?.type === 'enum' && (f.values?.length ?? 0) > 0}
        <select
          class="cond-value"
          aria-labelledby="{uid}-is-{i}"
          value={line.value}
          onchange={(e) => changed(lines.map((l, j) => (j === i ? { ...l, value: e.currentTarget.value } : l)))}
        >
          {#each f.values ?? [] as v (v)}<option value={v}>{valueSaid(f, v)}</option>{/each}
        </select>
      {:else if f?.type === 'bool'}
        <select
          class="cond-value"
          aria-labelledby="{uid}-is-{i}"
          value={line.value}
          onchange={(e) => changed(lines.map((l, j) => (j === i ? { ...l, value: e.currentTarget.value } : l)))}
        >
          <option value="true">{copy.conditionYes}</option>
          <option value="false">{copy.conditionNo}</option>
        </select>
      {:else}
        <span class="field cond-value">
          <input
            class="field-input"
            aria-labelledby="{uid}-is-{i}"
            type={f?.type === 'day' ? 'date' : f?.type === 'email' ? 'email' : f?.type === 'url' ? 'url' : 'text'}
            inputmode={f?.type === 'int' ? 'numeric' : f?.type === 'decimal' ? 'decimal' : undefined}
            autocomplete="off"
            value={line.value}
            oninput={(e) => changed(lines.map((l, j) => (j === i ? { ...l, value: e.currentTarget.value } : l)))}
          />
        </span>
      {/if}
      {#if lines.length > 1}
        <button
          type="button"
          class="cond-out tap"
          aria-label={copy.conditionTakeOut(f ? labelOf(f) : line.field)}
          title={copy.conditionTakeOut(f ? labelOf(f) : line.field)}
          onclick={() => changed(lines.filter((_, j) => j !== i))}><Icon name="close" size="s" /></button
        >
      {/if}
    </div>
  {/each}
  {#if lines.length < MOST && fields.length > 0}
    <span class="cond-more"><Button weight="bare" onclick={() => changed([...lines, fresh()])}><Icon name="plus" size="s" />{copy.conditionAnother}</Button></span>
  {/if}
  {#if where === null}<p class="cond-need">{copy.conditionNeeded}</p>{/if}
</div>

<style>
  .cond {
    display: grid;
    gap: var(--sp-2);
  }

  /* ONE LINE A CONDITION: the field, "is", the value, and the way out of it, wrapping to two lines on a phone. */
  .cond-line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
  }

  .cond-field,
  .cond-value {
    flex: 1 1 10rem;
    min-inline-size: 0;
  }

  .cond-is {
    color: var(--ink2);
    font-size: var(--t-ui);
  }

  .cond-out {
    display: inline-grid;
    place-items: center;
    inline-size: var(--tap);
    block-size: var(--tap);
    padding: 0;
    background: none;
    border: 0;
    border-radius: var(--r-ctl);
    color: var(--dim);
    cursor: pointer;
  }

  .cond-out:hover,
  .cond-out:focus-visible {
    background: var(--hover-wash);
    color: var(--ink);
  }

  .cond-need {
    margin: 0;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  @media (pointer: coarse) {
    .cond-field,
    .cond-value {
      min-block-size: var(--tap);
    }
  }
</style>
