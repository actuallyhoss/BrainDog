<!--
  THE WIDGETS IN THE DESIGN BOOK (widgets plan §7.2: "the design book prints it"): the starter boards, the widget sheet
  opened on this record, and the suggestion Today would show at its end, drawn by the parts the board uses. A developer
  showcase, as the rest of `/design` is: adding here is said, never written.
-->
<script lang="ts">
  import { STARTER_BOARDS, SIZE_SAID, widgetById, type WidgetOffer } from 'braindog-render';
  import { apiBase } from '$lib/at.ts';
  import Tile from '$lib/ui/Tile.svelte';
  import Button from '$lib/ui/Button.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import WidgetSheet from './WidgetSheet.svelte';
  import SuggestCell from './SuggestCell.svelte';
  import Inspector from './Inspector.svelte';
  import DraftCell from './DraftCell.svelte';
  import { offerOf } from './offer.svelte.ts';

  let open = $state(false);
  let offers = $state<WidgetOffer[]>([]);

  $effect(() => {
    void import('@braindog/client').then(async ({ createClient }) => {
      const out = await createClient({ base: apiBase() }).call<{ offers?: unknown[] }>('widgetSuggest', {});
      offers = out.ok && Array.isArray(out.value.offers) ? out.value.offers.map(offerOf).filter((o): o is WidgetOffer => o !== null) : [];
    });
  });

  /* AN INSPECTOR OVER ONE WIDGET, AND A DRAFT ON THE BOARD: what the board mounts, with its callbacks said, not written. */
  let inspecting = $state(false);
  let sample = $state<{ key: string; block: Record<string, unknown>; size: 'small' | 'wide' | 'tall' | 'large' | 'full' }>({
    key: 'spend',
    block: {
      kind: 'table',
      heading: 'Spending this month',
      icon: 'trending-down',
      source: 'register.transactions',
      where: 'state is cleared, transfer is false, direction is out, on at least bom',
      columns: [{ field: 'on' }, { field: 'what' }, { field: 'amount' }],
      order: [{ field: 'on', dir: 'desc' }],
      limit: 6,
    },
    size: 'tall',
  });
  let drafted = $state<{ key: string; block: Record<string, unknown>; size: 'small' | 'wide' | 'tall' | 'large' | 'full' } | null>(null);

  const said = (add: { block: Record<string, unknown>; size: string }) => toasts.push(`Would add ${String(add.block.heading ?? 'a widget')}, ${add.size}.`);
</script>

<Tile icon="grid" title="Widgets">
  <div class="sw">
    <Button weight="primary" onclick={() => (open = true)}>Add a widget</Button>
    {#each Object.entries(STARTER_BOARDS) as [kind, board] (kind)}
      <div class="sw-start">
        <p class="sw-h">{kind === 'personal' ? 'Personal starter' : 'Business starter'}</p>
        <div class="sw-grid">
          {#each board as w (w.id)}
            <span class="sw-cell" style:--c={SIZE_SAID[w.size].cols} style:--r={SIZE_SAID[w.size].rows}>{widgetById(w.id)?.title ?? w.id}</span>
          {/each}
        </div>
      </div>
    {/each}
    <Button onclick={() => (inspecting = true)}>Change a widget</Button>
    {#if drafted}
      <DraftCell
        key={drafted.key}
        block={drafted.block}
        size={drafted.size}
        onkeep={(_k, b) => (toasts.push(`Would keep ${String(b.heading ?? 'it')}.`), (drafted = null))}
        ondiscard={() => (toasts.push('Would throw it away.'), (drafted = null))}
        onchange={(k, b) => (drafted = { key: k, block: b, size: drafted?.size ?? 'wide' })}
      />
    {/if}
    {#each offers as o (o.key)}
      <SuggestCell offer={o} onadd={said} onremove={(key) => toasts.push(`Would take ${key} off.`)} />
    {/each}
  </div>
</Tile>

<WidgetSheet bind:open onadd={said} onmake={(d) => (drafted = { key: 'draft', block: d.block, size: d.size })} />
<Inspector
  bind:open={inspecting}
  widget={sample}
  onchange={(key, block) => (sample = { ...sample, key, block })}
  onsize={(_k, size) => (sample = { ...sample, size })}
  onremove={(key) => toasts.push(`Would take ${key} off.`)}
  onhidephone={(_k, hidden) => toasts.push(hidden ? 'Would hide it on the phone.' : 'Would show it on the phone.')}
/>

<style>
  .sw {
    display: grid;
    gap: var(--sp-4);
  }

  .sw-h {
    margin: 0 0 8px;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    font-weight: var(--fw-semi);
  }

  .sw-grid {
    display: grid;
    grid-auto-flow: row dense;
    grid-auto-rows: 56px;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
    max-inline-size: 520px;
  }

  .sw-cell {
    display: grid;
    grid-column: span var(--c);
    grid-row: span var(--r);
    place-items: center;
    padding: 6px;
    border: 1px dashed var(--rule-strong);
    border-radius: 12px;
    color: var(--ink-2);
    font-size: var(--fs-cap);
    text-align: center;
  }
</style>
