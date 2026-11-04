<!--
  "CHOOSE WHAT SHOWS ON TODAY": every live key number, grouped by project, and the few chosen on top in their order. Choosing is
  pinning (`today: pinned`, with `order`), through the app's row writer and with one Undo, so what the record ranks (`kpi-rank.ts`:
  pins first in their order, four at most, two on a phone) is what was chosen here. A number taken off goes back to Today's own
  choosing; one hidden says so, and choosing it brings it back. The order is by drag, or the arrows for a keyboard and a thumb.
-->
<script lang="ts">
  import { copy } from '$lib/copy.ts';
  import type { KpiWrite } from '$lib/page/block-menu.ts';
  import type { Entry } from '$lib/record/schema.ts';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';

  let {
    open = $bindable(false),
    rows,
    names,
    showing,
    onsave,
  }: {
    open?: boolean;
    rows: readonly Entry[];
    /** Each project's name, by its row id. */
    names: ReadonlyMap<string, string>;
    /** The numbers Today draws now, by row id, for the mark on the ones it picked by itself. */
    showing: readonly (string | undefined)[];
    onsave: (writes: readonly KpiWrite[]) => Promise<void>;
  } = $props();

  /** Today shows this many at most (`KPI_TODAY_MOST`, the record's). */
  const MOST = 4;

  const nameOf = (r: Entry): string => (typeof r.fields.name === 'string' ? r.fields.name : '');
  const liveRows = $derived(rows.filter((r) => r.fields.draft !== true && r.fields.state !== 'retired' && (r.fields.deleted_at ?? null) === null));
  const orderOf = (r: Entry): number => (typeof r.fields.order === 'number' ? r.fields.order : Number.POSITIVE_INFINITY);

  let chosen = $state.raw<number[]>([]);
  let saving = $state(false);
  let full = $state(false);
  let dragging = $state<number | null>(null);

  /* EACH OPENING STARTS FROM WHAT THE RECORD HOLDS. */
  let was = false;
  $effect(() => {
    if (open && !was) {
      chosen = liveRows
        .filter((r) => r.fields.today === 'pinned')
        .sort((a, b) => orderOf(a) - orderOf(b) || nameOf(a).localeCompare(nameOf(b)))
        .map((r) => r.seq);
      full = false;
    }
    was = open;
  });

  const bySeq = $derived(new Map(liveRows.map((r) => [r.seq, r])));
  const groups = $derived.by(() => {
    const out = new Map<string, Entry[]>();
    for (const r of liveRows) {
      const thing = typeof r.fields.thing === 'string' || typeof r.fields.thing === 'number' ? String(r.fields.thing) : '';
      const key = names.get(thing) || copy.kpiChooseGeneral;
      out.set(key, [...(out.get(key) ?? []), r]);
    }
    return [...out.entries()].sort(([a], [b]) => a.localeCompare(b));
  });

  function toggle(seq: number): void {
    if (chosen.includes(seq)) {
      chosen = chosen.filter((s) => s !== seq);
      full = false;
    } else if (chosen.length >= MOST) full = true;
    else chosen = [...chosen, seq];
  }

  function move(seq: number, step: -1 | 1): void {
    const at = chosen.indexOf(seq);
    const to = at + step;
    if (at < 0 || to < 0 || to >= chosen.length) return;
    const next = [...chosen];
    next.splice(at, 1);
    next.splice(to, 0, seq);
    chosen = next;
  }

  function dropOn(seq: number): void {
    if (dragging === null || dragging === seq) return;
    const next = chosen.filter((s) => s !== dragging);
    next.splice(next.indexOf(seq), 0, dragging);
    chosen = next;
    dragging = null;
  }

  /** The writes that make the record say what was chosen: nothing for a row already saying it. */
  function writesOf(): KpiWrite[] {
    const out: KpiWrite[] = [];
    chosen.forEach((seq, i) => {
      const r = bySeq.get(seq);
      if (!r) return;
      const today = typeof r.fields.today === 'string' ? r.fields.today : 'auto';
      const order = typeof r.fields.order === 'number' ? r.fields.order : null;
      if (today !== 'pinned' || order !== i + 1) out.push({ seq, version: r.version, patch: { today: 'pinned', order: i + 1 }, undo: { today, order } });
    });
    for (const r of liveRows) {
      if (r.fields.today === 'pinned' && !chosen.includes(r.seq)) out.push({ seq: r.seq, version: r.version, patch: { today: 'auto' }, undo: { today: 'pinned' } });
    }
    return out;
  }

  async function save(): Promise<void> {
    saving = true;
    try {
      await onsave(writesOf());
      open = false;
    } finally {
      saving = false;
    }
  }
</script>

<Sheet bind:open title={copy.kpiMenuChoose} subtitle={copy.kpiChooseHint}>
  <div class="ch" data-kpi-chooser>
    <h3 class="ch-head">{copy.kpiChooseShown} <span class="num">{chosen.length}/{MOST}</span></h3>
    {#if chosen.length === 0}<p class="ch-none">{copy.kpiChooseNone}</p>{/if}
    <ol class="ch-order">
      {#each chosen as seq, i (seq)}
        {@const r = bySeq.get(seq)}
        {#if r}
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <li class="ch-pick" draggable="true" data-dragging={dragging === seq ? '' : undefined} ondragstart={() => (dragging = seq)} ondragend={() => (dragging = null)} ondragover={(e) => e.preventDefault()} ondrop={(e) => { e.preventDefault(); dropOn(seq); }}>
            <span class="ch-grip" aria-hidden="true"><Icon name="drag" size="s" /></span>
            <span class="ch-n num">{i + 1}</span>
            <span class="ch-name" dir="auto">{nameOf(r)}</span>
            <button type="button" class="ch-do tap" aria-label={copy.kpiChooseUp(nameOf(r))} disabled={i === 0} onclick={() => move(seq, -1)}><Icon name="arrowUp" size="s" /></button>
            <button type="button" class="ch-do tap" aria-label={copy.kpiChooseDown(nameOf(r))} disabled={i === chosen.length - 1} onclick={() => move(seq, 1)}><Icon name="arrowDown" size="s" /></button>
            <button type="button" class="ch-do tap" aria-label={copy.kpiChooseOut(nameOf(r))} onclick={() => toggle(seq)}><Icon name="close" size="s" /></button>
          </li>
        {/if}
      {/each}
    </ol>
    {#if full}<p class="ch-full" role="status">{copy.kpiChooseFull}</p>{/if}

    {#each groups as [project, list] (project)}
      <h3 class="ch-head">{project}</h3>
      <ul class="ch-all">
        {#each list as r (r.seq)}
          <li>
            <label class="ch-row">
              <input type="checkbox" checked={chosen.includes(r.seq)} onchange={(e) => { toggle(r.seq); e.currentTarget.checked = chosen.includes(r.seq); }} />
              <span class="ch-name" dir="auto">{nameOf(r)}</span>
              {#if r.fields.today === 'hidden' && !chosen.includes(r.seq)}<span class="ch-mark">{copy.kpiChooseHidden}</span>
              {:else if !chosen.includes(r.seq) && r.id && showing.includes(r.id)}<span class="ch-mark" data-on="">{copy.kpiChooseToday}</span>{/if}
            </label>
          </li>
        {/each}
      </ul>
    {/each}
  </div>
  {#snippet footer()}
    <Button weight="primary" disabled={saving} onclick={() => void save()}>{copy.kpiChooseSave}</Button>
    <Button weight="bare" onclick={() => (open = false)}>{copy.kpiChooseCancel}</Button>
  {/snippet}
</Sheet>

<style>
  .ch {
    display: grid;
    gap: var(--sp-2);
  }

  .ch-head {
    margin: var(--sp-3) 0 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    font-weight: var(--fw-semi);
  }

  .ch-none,
  .ch-full {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
  }

  .ch-order,
  .ch-all {
    display: grid;
    gap: var(--sp-1);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .ch-pick {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: var(--tap);
    padding-inline: var(--sp-2);
    background: var(--tile-2);
    border-radius: var(--r-ctl);
    cursor: grab;
  }

  .ch-pick[data-dragging] {
    opacity: 0.5;
  }

  .ch-grip {
    display: inline-flex;
    color: var(--ink-3);
  }

  .ch-n {
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .ch-name {
    flex: 1;
    min-inline-size: 0;
    overflow-wrap: anywhere;
  }

  .ch-do {
    display: grid;
    place-items: center;
    inline-size: var(--tap);
    block-size: var(--tap);
    padding: 0;
    background: none;
    border: 0;
    border-radius: var(--r-ctl);
    color: var(--ink-2);
    cursor: pointer;
  }

  .ch-do:disabled {
    color: var(--ink-3);
    cursor: default;
  }

  .ch-row {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: var(--tap);
    cursor: pointer;
  }

  .ch-mark {
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .ch-mark[data-on] {
    color: var(--ink-2);
    font-weight: var(--fw-medium);
  }
</style>
