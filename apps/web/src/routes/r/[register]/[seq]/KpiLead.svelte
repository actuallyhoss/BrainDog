<!--
  A key number's page leads with its latest reading and its chart, the target a line across it (1 Nov, L25), drawn as a
  project's lead number is (`Kpis.svelte`, its project form). It led with "Target amount $10,000", which is what good
  looks like and not where the number is.

  ITS READINGS ARE THE TAB'S WALK of the readings list (`rowsSaid`), held to its measure on its project; its project's
  row id is read off the key numbers' own walk, since this page's row holds the project as its number. Until both are in
  the tile keeps its height and says nothing; a number with no readings yet says so in the drawer's own words.
-->
<script lang="ts">
  import '@braindog/skin/blocks-kinds.css';
  import { createClient } from '@braindog/client';
  import { Kpis } from 'braindog-render/svelte';
  import { apiBase } from '$lib/at.ts';
  import { rowsSaid } from '$lib/data/ref-rows.ts';
  import { homeCurrency, identityOf } from '$lib/record/api.ts';
  import { READINGS } from '$lib/record/reporting.ts';
  import { entryOf, type Names, type RecordRow } from '$lib/record/remote.ts';
  import type { Entry, Fields } from '$lib/record/schema.ts';
  import { slotOf } from '$lib/ui/face.ts';
  import Tile from '$lib/ui/Tile.svelte';
  import { kpiInputOf } from '../parts/kpi-input.ts';

  let { register, seq, fields, names, now }: { register: string; seq: number; fields: Fields; names: Names | undefined; now: number } = $props();

  let readings = $state<Entry[] | null>(null);
  let projectId = $state<string | null>(null);
  $effect(() => {
    const base = apiBase();
    const client = createClient({ base });
    const asked = seq;
    let gone = false;
    void Promise.all([rowsSaid(client, base, READINGS), rowsSaid(client, base, register)]).then(([r, k]) => {
      if (gone) return;
      readings = r.ok ? r.rows.map((x) => entryOf(READINGS, x as RecordRow, new Map())) : [];
      const own = k.ok ? k.rows.find((x) => x.seq === asked) : undefined;
      projectId = typeof own?.fields.thing === 'string' ? own.fields.thing : '';
    });
    return () => {
      gone = true;
    };
  });

  const ident = $derived(identityOf(register, 'thing', fields.thing, names));
  const input = $derived(
    kpiInputOf(`${register}#${seq}`, fields, readings, projectId === null ? null : { id: projectId, name: ident?.name ?? '', slot: ident ? slotOf(ident.hue) : undefined }),
  );
</script>

<Tile aria-label={input.name}>
  <div class="kpi-lead" data-reading={readings === null || projectId === null ? '' : undefined}>
    <Kpis kpis={[{ ...input, headline: true }]} form="project" home={homeCurrency()} {now} />
  </div>
</Tile>

<style>
  /* THE LEAD NUMBER ALONE: no hairline over a grid of others under it, since there are none here. */
  .kpi-lead :global(.kpis) {
    margin: 0;
  }

  .kpi-lead :global(:is(.kpi-figure, .kpi-meta, .kpi-stale, .kpi-target, .kpi-plot, .kpi-ring, .kpi-bar)) {
    transition: opacity var(--d-state) var(--ease-out);
  }

  .kpi-lead[data-reading] :global(:is(.kpi-figure, .kpi-meta, .kpi-stale, .kpi-target, .kpi-plot, .kpi-ring, .kpi-bar)) {
    opacity: 0;
  }

  @media (prefers-reduced-motion: reduce) {
    .kpi-lead :global(:is(.kpi-figure, .kpi-meta, .kpi-stale, .kpi-target, .kpi-plot, .kpi-ring, .kpi-bar)) {
      transition: none;
    }
  }
</style>
