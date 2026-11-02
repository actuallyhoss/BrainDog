<!--
  One line split across categories, on the line's own page: each part's category, amount and note, and the way to split
  the line, change the split or take it off.

  THE RECORD KEEPS THE RULE. The parts are written in one go as the line's `parts`, and the record refuses parts that do
  not add up to the line, in a sentence this tile shows under the parts (`row-parts.ts`). What is said here before the
  save, how much is left to place, is only so nobody has to be refused first.
-->
<script lang="ts">
  import { writeAmount } from 'braindog-render';
  import { homeCurrency } from '$lib/record/api.ts';
  import { leftOf, partsOf, partsPatch, splitWords as words, type Part, type SplitAt } from '$lib/record/split.ts';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import { grouped, minorOf, typedOf, type Option } from './quick.ts';
  import { readSplit, type SplitHeld } from './read.ts';

  let {
    base,
    register,
    at,
    fields,
    changes,
    onsave,
  }: {
    base: string;
    register: string;
    at: SplitAt;
    fields: Readonly<Record<string, unknown>>;
    /** Whether the reader may change the line. */
    changes: boolean;
    /** Writes the parts, or takes them off with `null`; answers the record's sentence when it says no. */
    onsave: (parts: Record<string, unknown>[] | null) => Promise<string | null>;
  } = $props();

  /* `undefined` WHILE IT IS READ, `null` where the list has nothing to split by. */
  let held = $state<SplitHeld | null | undefined>(undefined);
  $effect(() => {
    const asked = register;
    void readSplit(base, asked).then((h) => {
      if (asked === register) held = h;
    });
  });

  const line = $derived(fields[at.of] as { amount?: number; currency?: string } | undefined);
  const minor = $derived(typeof line?.amount === 'number' ? line.amount : 0);
  const currency = $derived(typeof line?.currency === 'string' ? line.currency : '');
  /* THE PARTS ARE THE ROW'S OWN, so they are counted before the categories are read; only their names wait for them. */
  const parts = $derived(partsOf(fields, at, held ? held.by : ''));
  const reading = $derived(held === undefined);
  const home = $derived(homeCurrency());
  const said = (m: number): string => writeAmount({ minor: m, currency }, home, 'exact')?.text ?? '';

  /* THE CATEGORIES A PART MAY TAKE: those that go the line's way, and those that go either. */
  const way = $derived(held ? String(fields[held.way.field] ?? '') : '');
  const offered = $derived<Option[]>(held ? held.categories.filter((c) => c.way === null || c.way === undefined || c.way === way || held!.either.includes(c.way)) : []);
  const nameOf = (id: string | null): string => (reading ? '' : id === null ? words.pick : (held?.categories.find((c) => c.id === id)?.name ?? words.pick));

  /* ── the editor ─────────────────────────────────────────────────────── */
  let editing = $state(false);
  let saving = $state(false);
  let fix = $state<string | null>(null);
  let drafts = $state<{ by: string | null; typed: string; note: string }[]>([]);

  const typed = $derived<Part[]>(drafts.map((d) => ({ by: d.by, minor: (currency ? minorOf(d.typed, currency) : null) ?? 0, note: d.note })));
  const left = $derived(leftOf(minor, typed));

  function start() {
    fix = null;
    if (parts.length > 0) drafts = parts.map((p) => ({ by: p.by, typed: typedOf(p.minor, currency), note: p.note }));
    else {
      const own = held ? (fields[held.by] as string | undefined) : undefined;
      const first = typeof own === 'string' && own !== '' ? own : (offered[0]?.id ?? null);
      drafts = [
        { by: first, typed: typedOf(minor, currency), note: '' },
        { by: offered.find((c) => c.id !== first)?.id ?? null, typed: '', note: '' },
      ];
    }
    editing = true;
  }

  async function save(e: Event) {
    e.preventDefault();
    if (!held || saving) return;
    const kept = typed.filter((p) => p.minor > 0);
    if (kept.length < 2) return void (fix = words.needTwo);
    if (kept.some((p) => p.by === null)) return void (fix = words.needCategory);
    saving = true;
    const said = await onsave(partsPatch(kept, at, held.by, currency));
    saving = false;
    fix = said;
    if (said === null) editing = false;
  }

  async function remove() {
    if (saving) return;
    saving = true;
    const said = await onsave(null);
    saving = false;
    fix = said;
    if (said === null) editing = false;
  }
</script>

<!-- DRAWN WITH THE ROW, NOT AFTER IT (leftovers9): the tile waited for the list's categories, about 250 ms after the row
     was drawn, then pushed Activity down 124px (0.023 at 390, 0.025 at 1512). Whether there is a tile is the row's to say,
     its parts or its amount, so the tile stands at once at its own height, and only its buttons and the parts' names wait
     for the categories. -->
{#if held !== null && (parts.length > 0 || (changes && minor > 0))}
  <Tile icon="tag" title={words.heading} meta={parts.length > 0 && !editing ? said(minor) : undefined}>
    {#if editing}
      <form class="split-form" onsubmit={save}>
        {#each drafts as d, i (i)}
          <div class="split-part">
            <div class="field split-cat">
              <select class="field-input" aria-label={words.category} bind:value={d.by}>
                <option value={null}>{words.pick}</option>
                {#each offered as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
              </select>
            </div>
            <div class="field split-amount">
              <input class="field-input num" inputmode="decimal" aria-label={words.amount} placeholder="0.00" value={d.typed} oninput={(e) => (d.typed = grouped(e.currentTarget.value))} />
            </div>
            <div class="field split-note">
              <input class="field-input" type="text" aria-label={words.note} placeholder={words.note} bind:value={d.note} />
            </div>
            {#if drafts.length > 2}
              <button type="button" class="split-x tap" aria-label={words.drop} title={words.drop} onclick={() => (drafts = drafts.filter((_, j) => j !== i))}><Icon name="close" size="s" /></button>
            {/if}
          </div>
        {/each}
        <p class="split-left" data-over={left < 0 ? '' : undefined}>
          {left > 0 ? words.left(said(left)) : left < 0 ? words.over(said(-left)) : words.even}
          {#if drafts.length < 8}
            <button type="button" class="split-link" onclick={() => (drafts = [...drafts, { by: null, typed: left > 0 ? typedOf(left, currency) : '', note: '' }])}>{words.add}</button>
          {/if}
        </p>
        {#if fix}<p class="split-fix" role="alert">{fix}</p>{/if}
        <div class="split-actions">
          <Button type="submit" weight="primary" disabled={saving || left !== 0}>{words.save}</Button>
          <Button weight="bare" onclick={() => ((editing = false), (fix = null))}>{words.cancel}</Button>
        </div>
      </form>
    {:else if parts.length > 0}
      <ul class="split-list">
        {#each parts as p, i (i)}
          <li class="split-row">
            <span class="split-name">{nameOf(p.by)}</span>
            {#if p.note}<span class="split-said">{p.note}</span>{/if}
            <span class="split-sum num">{said(p.minor)}</span>
          </li>
        {/each}
      </ul>
      {#if fix}<p class="split-fix" role="alert">{fix}</p>{/if}
      {#if changes}
        <div class="split-actions">
          <Button size="sm" disabled={reading} onclick={start}>{words.change}</Button>
          <Button size="sm" weight="bare" disabled={saving || reading} onclick={remove}>{words.remove}</Button>
        </div>
      {/if}
    {:else}
      <div class="split-actions">
        <Button size="sm" disabled={reading} onclick={start}>{words.start}</Button>
      </div>
    {/if}
  </Tile>
{/if}

<style>
  .split-list {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .split-row {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
    padding-block: var(--sp-2);
    border-block-end: 1px solid var(--rule);
  }

  .split-row:last-child {
    border-block-end: 0;
  }

  .split-name {
    color: var(--ink);
    font-weight: var(--fw-medium);
  }

  .split-said {
    overflow: hidden;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .split-sum {
    margin-inline-start: auto;
    color: var(--ink);
  }

  .split-form {
    display: grid;
    gap: var(--sp-2);
  }

  .split-part {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
  }

  .split-cat {
    flex: 3 1 9rem;
  }

  .split-amount {
    flex: 2 1 6rem;
  }

  .split-note {
    flex: 3 1 9rem;
  }

  .split-x {
    display: grid;
    place-items: center;
    inline-size: var(--tap);
    block-size: var(--tap);
    border: 0;
    background: none;
    color: var(--ink-3);
  }

  .split-left {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-3);
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
  }

  .split-left[data-over] {
    color: var(--red);
  }

  .split-link {
    padding: 0;
    border: 0;
    background: none;
    color: var(--ink-2);
    font: inherit;
    font-weight: var(--fw-medium);
    text-decoration: underline;
    text-underline-offset: 3px;
    text-decoration-color: var(--rule-strong);
    cursor: pointer;
  }

  .split-fix {
    margin: 0;
    color: var(--red);
    font-size: var(--fs-meta);
  }

  .split-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }
</style>
