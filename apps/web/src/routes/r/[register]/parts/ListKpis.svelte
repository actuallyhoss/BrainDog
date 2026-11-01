<!--
  The key numbers as what a person opens the list for (1 Nov, L11): each one's latest reading, its change and a small
  chart, the way Today draws them (`Kpis.svelte`, its `today` form), where the table showed their settings (Unit, Shape)
  as columns.

  THE READINGS ARE ONE WALK of the readings list (`rowsSaid`, kept for the tab), each number given those of its measure
  on its project (`pastOf`, as the number's sheet reads them). Until the walk is in, each number is drawn with its name and
  project and no figure yet; the figures fill in where they stand, nothing moves.

  A ROW OPENS THE NUMBER'S OWN PAGE, which leads with the same reading and its chart (L25).
-->
<script lang="ts">
  import '@braindog/skin/blocks-kinds.css';
  import { createClient } from '@braindog/client';
  import { exponentOf } from 'braindog-render';
  import { Kpis, type KpiInput } from 'braindog-render/svelte';
  import { apiBase, at } from '$lib/at.ts';
  import { rowsSaid } from '$lib/data/ref-rows.ts';
  import { pastOf } from '$lib/kpis/past.ts';
  import { homeCurrency, identityOf } from '$lib/record/api.ts';
  import { READINGS } from '$lib/record/reporting.ts';
  import { entryOf, type Names, type RecordRow } from '$lib/record/remote.ts';
  import { isMoney, type Entry, type RegisterDecl } from '$lib/record/schema.ts';
  import { slotOf } from '$lib/ui/face.ts';

  let {
    register,
    decl,
    entries,
    now,
    names,
    more,
  }: {
    register: string;
    decl: RegisterDecl;
    entries: readonly Entry[];
    now: number;
    names: Names | undefined;
    more: boolean;
  } = $props();

  /* THE READINGS, once per list drawn: the rows of the readings list as entries, refs kept as the record's ids. */
  let readings = $state<Entry[] | null>(null);
  $effect(() => {
    let gone = false;
    void rowsSaid(createClient({ base: apiBase() }), apiBase(), READINGS).then((got) => {
      if (!gone && got.ok) readings = got.rows.map((r) => entryOf(READINGS, r as RecordRow, new Map()));
    });
    return () => {
      gone = true;
    };
  });

  /* MONEY AS THE RECORD STORES IT, "USD 8,420.00", which is the one shape the drawer reads an amount in. */
  const storedOf = (m: { amount: number; currency: string }): string => {
    const e = exponentOf(m.currency);
    const said = Math.abs(m.amount / 10 ** e).toLocaleString('en-US', { minimumFractionDigits: e, maximumFractionDigits: e });
    return `${m.currency} ${m.amount < 0 ? '−' : ''}${said}`;
  };
  const text = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined);
  /* THE PROJECT'S ROW ID, which a reading names it by: the list's row holds the project's number, and the names the page
     carries map each id the record answered back to its number. */
  const projectIdOf = (seq: unknown): string | null => {
    const ref = decl.fields.find((f) => f.id === 'thing');
    if (!ref?.to || !names?.ids) return null;
    for (const [key, n] of names.ids) if (n === Number(seq) && key.startsWith(`${ref.to} `)) return key.slice(ref.to.length + 1);
    return null;
  };

  const inputs = $derived.by((): { k: KpiInput; seq: number }[] =>
    entries.map((e) => {
      const f = e.fields;
      const ident = identityOf(register, 'thing', f.thing, names);
      const name = text(f.name) ?? '';
      const project = { id: projectIdOf(f.thing) ?? '', name: ident?.name ?? '' };
      const past = readings && project.id !== '' ? pastOf(readings, { name, measure: text(f.measure) ?? null }, project, 'thing') : [];
      const points = [...past].reverse().map((p) =>
        p.money ? { at: p.at, amount: storedOf(p.money) } : { at: p.at, value: p.value },
      );
      const k: KpiInput = {
        kpi: e.id ?? `${register}#${e.seq}`,
        name,
        ...(ident ? { project: ident.name, slot: slotOf(ident.hue) } : {}),
        ...(text(f.measures) ? { measures: text(f.measures)! } : {}),
        ...(text(f.unit) ? { unit: text(f.unit)! } : {}),
        ...(f.good === 'up' || f.good === 'down' ? { good: f.good } : {}),
        ...(typeof f.target === 'number' || typeof f.target === 'string'
          ? { target: f.target }
          : isMoney(f.target_amount)
            ? { target: storedOf(f.target_amount) }
            : {}),
        ...(text(f.target_by) ? { target_by: text(f.target_by)! } : {}),
        ...(f.every === '1h' || f.every === '1d' || f.every === '1w' || f.every === '1m' ? { every: f.every } : {}),
        ...(typeof f.kind === 'string' && ['level', 'flow', 'share', 'progress', 'count'].includes(f.kind) ? { kind: f.kind as KpiInput['kind'] } : {}),
        points,
      };
      return { k, seq: e.seq };
    }),
  );
  const seqOf = $derived(new Map(inputs.map((x) => [x.k.kpi, x.seq])));
  const fours = $derived(Array.from({ length: Math.ceil(inputs.length / 4) }, (_, i) => inputs.slice(i * 4, i * 4 + 4).map((x) => x.k)));
</script>

<!-- FOUR TO A ROW, AS TODAY DRAWS THEM: the drawer's Today form holds four, so a longer list is drawn four at a time, one
     row of the same grid under the other. -->
<div class="kpi-list" data-reading={readings === null ? '' : undefined}>
  {#each fours as four, i (i)}
    <Kpis kpis={four} form="today" home={homeCurrency()} {now} href={(k) => (seqOf.has(k.kpi) ? at(`/r/${register}/${seqOf.get(k.kpi)}`) : null)} />
  {/each}
</div>

{#if more}
  <div class="sentinel" aria-hidden="true"></div>
{/if}

<style>
  .kpi-list {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
  }

  /* WHILE THE READINGS ARE READ a number has no figure yet, and saying "No value yet" then would be wrong: its name and
     project stand, the rest is held back and fades in where it stands. */
  .kpi-list :global(:is(.kpi-figure, .kpi-meta, .kpi-stale, .kpi-target, .kpi-plot, .kpi-ring, .kpi-bar)) {
    transition: opacity var(--d-state) var(--ease-out);
  }

  .kpi-list[data-reading] :global(:is(.kpi-figure, .kpi-meta, .kpi-stale, .kpi-target, .kpi-plot, .kpi-ring, .kpi-bar)) {
    opacity: 0;
  }

  @media (prefers-reduced-motion: reduce) {
    .kpi-list :global(:is(.kpi-figure, .kpi-meta, .kpi-stale, .kpi-target, .kpi-plot, .kpi-ring, .kpi-bar)) {
      transition: none;
    }
  }
</style>
