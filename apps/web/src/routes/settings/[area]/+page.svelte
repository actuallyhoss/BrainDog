<!--
  Settings.

  The theme control is a THREE-WAY SEGMENT, not a toggle offering the opposite. The predecessor's
  had three states and a one-way UI: once a person chose light or dark, only clearing local storage
  restored "match the system". "Match the system" must stay reachable (19 §4).

  Density switches on POINTER, never on width — a small laptop window is not a phone. Width may
  change layout; only the pointer may change size (05 §6).

  And `Character keys: off` disables the entire bare-letter namespace while leaving every modifier
  chord working. It is GitHub's checkbox, and the only shipped WCAG 2.1.4 conformance mechanism
  found across eleven precedents (19 §4).
-->
<script lang="ts">
  import { page } from '$app/state';
  import { copy } from '$lib/copy.ts';
  import { PACKS, PAGES, PEOPLE_ACCESS, REGISTERS } from '$lib/record/api.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Section from '$lib/ui/Section.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Chip from '$lib/ui/Chip.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Empty from '$lib/ui/Empty.svelte';

  const AREAS = [
    'appearance',
    'identity',
    'recovery',
    'people',
    'agents',
    'ingest',
    'keyboard',
    'navigation',
    'notifications',
    'backups',
    'billing',
    'export',
  ] as const;

  const area = $derived(page.params.area ?? 'appearance');

  const set = (key: string, value: string) => document.documentElement.setAttribute(`data-${key}`, value);

  let scheme = $state<'light' | 'system' | 'dark'>('system');
  let text = $state<'sm' | 'base' | 'md'>('base');
  let density = $state<'compact' | 'comfortable' | 'roomy'>('comfortable');
  let chars = $state(true);

  function pickScheme(v: 'light' | 'system' | 'dark') {
    scheme = v;
    if (v === 'system') document.documentElement.removeAttribute('data-scheme');
    else set('scheme', v);
  }

  const pen = Object.values(PAGES).filter((p) => p.placed === false);
</script>

<PageHead kicker={copy.settings} title={area.replace(/^./, (c) => c.toUpperCase())} />

<div class="shell">
  <nav class="areas" aria-label={copy.settings}>
    {#each AREAS as a}
      <a class="area" href="/settings/{a}" aria-current={a === area ? 'page' : undefined}>
        {a === 'people' ? 'People & sharing' : a.replace(/^./, (c) => c.toUpperCase())}
      </a>
    {/each}
  </nav>

  <div class="body">
    {#if area === 'appearance'}
      <Section title={copy.scheme}>
        <div class="segment" role="group" aria-label={copy.scheme}>
          {#each [['light', copy.schemeLight, 'sun'], ['system', copy.schemeSystem, 'monitor'], ['dark', copy.schemeDark, 'moon']] as const as [v, label, icon]}
            <button type="button" class="seg" data-on={scheme === v ? '' : undefined} onclick={() => pickScheme(v)}>
              <Icon name={icon} size="s" />
              {label}
            </button>
          {/each}
        </div>
        <p class="hint">System is always one press away, in both directions.</p>
      </Section>

      <Section title={copy.textSize}>
        <div class="segment" role="group" aria-label={copy.textSize}>
          {#each [['sm', copy.textSmall], ['base', copy.textNormal], ['md', copy.textLarge]] as const as [v, label]}
            <button
              type="button"
              class="seg"
              data-on={text === v ? '' : undefined}
              onclick={() => ((text = v), set('text', v))}>{label}</button
            >
          {/each}
        </div>
        <p class="hint">
          The scale is fixed at eight steps and this picks the body one. Raising a type scale is not
          a fix for a hard-to-read screen — the fault is in what it says and how it is arranged.
        </p>
      </Section>

      <Section title={copy.density}>
        <div class="segment" role="group" aria-label={copy.density}>
          {#each [['compact', copy.densityCompact], ['comfortable', copy.densityComfortable], ['roomy', copy.densityRoomy]] as const as [v, label]}
            <button
              type="button"
              class="seg"
              data-on={density === v ? '' : undefined}
              onclick={() => ((density = v), set('density', v))}>{label}</button
            >
          {/each}
        </div>
        <p class="hint">Row height only. Target size follows the pointer, never the width.</p>
      </Section>
    {:else if area === 'keyboard'}
      <Section title={copy.characterKeys}>
        <div class="segment" role="group" aria-label={copy.characterKeys}>
          <button type="button" class="seg" data-on={chars ? '' : undefined} onclick={() => (chars = true)}>{copy.on}</button>
          <button type="button" class="seg" data-on={!chars ? '' : undefined} onclick={() => (chars = false)}>{copy.off}</button>
        </div>
        <p class="hint">{copy.characterKeysHint}</p>
      </Section>
      <Section title="The keymap">
        <p class="hint">
          Press <kbd class="k">?</kbd> anywhere. The sheet is read from the binding registry, so it cannot
          drift from what is bound.
        </p>
      </Section>
    {:else if area === 'navigation'}
      <Section title="Suggested pages" count={pen.length}>
        {#if pen.length === 0}
          <Empty kind="cleared" title="Nothing waiting." />
        {:else}
          <ul class="ledger">
            {#each pen as p}
              <li>
                <div class="line">
                  <span class="seq">{p.origin}</span>
                  <span class="line-main">
                    <span class="line-title">{p.title}</span>
                    <span class="line-detail">{copy.holdingPen} Derived from {p.requires[0]}.</span>
                  </span>
                  <span class="line-amount"></span>
                  <span class="line-when"><Button weight="quiet">Place in nav</Button></span>
                </div>
              </li>
            {/each}
          </ul>
        {/if}
        <p class="hint">
          The system never writes nav order after first install. A controlled study measured static
          menus faster than adaptive ones, and Microsoft shipped the alternative and withdrew it.
        </p>
      </Section>
    {:else if area === 'people'}
      <Section title="Who can see this record" count={PEOPLE_ACCESS.length}>
        <ul class="ledger">
          {#each PEOPLE_ACCESS as p}
            <li>
              <div class="line">
                <span class="seq">{p.id}</span>
                <span class="line-main"><span class="line-title">{p.name}</span></span>
                <span class="line-amount"><Chip label={p.level} tone={p.level === 'owner' ? 'good' : undefined} /></span>
                <span class="line-when">{REGISTERS ? Object.keys(REGISTERS).length : 0} registers</span>
              </div>
            </li>
          {/each}
        </ul>
      </Section>
    {:else if area === 'export'}
      <Section title="Your data">
        <p class="hint">
          A single file you can open with tooling you already have. <code class="k">.dog</code> is a
          SQLite database with an application id, and self-hosting is a real option.
        </p>
        <div class="row-actions"><Button>Export the record</Button><Button weight="bare">Verify a `.dog`</Button></div>
      </Section>
      <Section title="Danger">
        <div class="danger">
          <p class="danger-title">Delete this record</p>
          <p class="hint">
            Re-authentication, and the slug typed to confirm. There is no undo and no thirty-day
            grace: the export above is the grace.
          </p>
          <Button tone="bad">Delete the studio</Button>
        </div>
      </Section>
    {:else}
      <Section title={area.replace(/^./, (c) => c.toUpperCase())}>
        <Empty
          kind="no-data-yet"
          title="Nothing configured yet."
          body="This area is part of the shell and is not wired in the mock-up."
        />
      </Section>
    {/if}

    <p class="mock">{copy.mockNotice} {PACKS.length} packs, {Object.keys(REGISTERS).length} registers.</p>
  </div>
</div>

<style>
  .shell {
    display: grid;
    grid-template-columns: 200px minmax(0, 1fr);
    gap: var(--sp-5);
    padding: var(--sp-4) var(--sp-5) var(--sp-7);
    max-inline-size: 1100px;
  }

  .areas {
    display: flex;
    flex-direction: column;
    position: sticky;
    inset-block-start: calc(var(--sticky) + var(--sp-4));
  }

  .area {
    min-block-size: 30px;
    display: flex;
    align-items: center;
    padding: 0 var(--sp-2);
    border-radius: var(--r-sm);
    color: var(--dim);
    font-size: var(--t-ui);
    text-decoration: none;
  }

  .area:hover {
    color: var(--ink2);
  }

  .area[aria-current='page'] {
    background: var(--s1);
    box-shadow: var(--raise);
    color: var(--ink);
  }

  .body {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
  }

  .segment {
    display: inline-flex;
    gap: 3px;
    padding: 3px;
    background: var(--sunk);
    border: 1px solid var(--line);
    border-radius: var(--r-sm);
  }

  .seg {
    display: flex;
    align-items: center;
    gap: 6px;
    min-block-size: 28px;
    padding: 0 var(--sp-3);
    background: none;
    border: 0;
    border-radius: 4px;
    color: var(--dim);
    font-size: var(--t-ui);
    cursor: pointer;
    transition: background var(--d-state) var(--ease-out);
  }

  .seg:hover {
    color: var(--ink2);
  }

  .seg[data-on] {
    background: var(--s2);
    box-shadow: var(--raise);
    color: var(--ink);
  }

  .hint {
    margin-block-start: var(--sp-2);
    max-inline-size: var(--measure);
    color: var(--dim);
    font-size: var(--t-ui);
  }

  .k {
    padding: 1px 5px;
    background: var(--sunk);
    border: 1px solid var(--line);
    border-radius: var(--r-sm);
    font-family: var(--font-id);
    font-size: var(--t-xs);
  }

  .row-actions {
    display: flex;
    gap: var(--sp-2);
    margin-block-start: var(--sp-3);
  }

  .danger {
    padding: var(--sp-4);
    background: var(--s1);
    border: 1px solid color-mix(in srgb, var(--danger) 40%, var(--line));
    border-radius: var(--r-md);
  }

  .danger-title {
    color: var(--danger);
    font-weight: 500;
  }

  .danger :global(.btn) {
    margin-block-start: var(--sp-3);
  }

  .mock {
    color: var(--dim);
    font-size: var(--t-xs);
  }

  @media (width < 900px) {
    .shell {
      grid-template-columns: minmax(0, 1fr);
      padding: var(--sp-3) var(--sp-3) var(--sp-7);
    }

    .areas {
      position: static;
      flex-direction: row;
      overflow-x: auto;
    }
  }
</style>
