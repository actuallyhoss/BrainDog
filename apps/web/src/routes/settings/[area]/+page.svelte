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
  import { titleOf } from '$lib/title.ts';
  import { page } from '$app/state';
  import { copy } from '$lib/copy.ts';
  import type { PageDecl } from '$lib/record/schema.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
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

  const pen = $derived(
    Object.values(PAGES).filter((p) => p.placed === false && !placed.some((x) => x.page === p.page)),
  );

  /**
   * PROMOTION IS THE ONE VERB THAT ACTUALLY WORKS HERE, and it works because it is client state.
   *
   * 29 §2's three tiers are derived → proposed → placed, and *"Movement is forward-only and needs a
   * user action."* This is the user action. Two rules from §4 are in the four lines below and both
   * are load-bearing:
   *
   *   - It appends AT THE END OF ITS SECTION, never inserted mid-list. Microsoft's Personalized
   *     Menus put items at different distances down the menu each time, and Jensen Harris announced
   *     the reversal in 2006 with that as the first reason.
   *   - Nothing is ever placed WITHOUT it. The system never writes nav order after first install
   *     (06 §3), because Findlater & McGrenere measured static menus faster than adaptive ones.
   *
   * The undo is on the toast rather than a second button, because a promotion is small and
   * reversible and does not deserve a confirm — 23 §4: every extra confirm devalues the one gate
   * that matters.
   */
  let placed = $state<PageDecl[]>([]);

  function promote(decl: PageDecl) {
    placed = [...placed, decl];
    toasts.push(copy.promoted(decl.title), {
      undo: () => (placed = placed.filter((x) => x.page !== decl.page)),
    });
  }
</script>

<svelte:head><title>{titleOf(area.replace(/^./, (c) => c.toUpperCase()), copy.settings)}</title></svelte:head>

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
      </Section>
    {:else if area === 'keyboard'}
      <Section title={copy.characterKeys}>
        <div class="segment" role="group" aria-label={copy.characterKeys}>
          <button type="button" class="seg" data-on={chars ? '' : undefined} onclick={() => (chars = true)}>{copy.on}</button>
          <button type="button" class="seg" data-on={!chars ? '' : undefined} onclick={() => (chars = false)}>{copy.off}</button>
        </div>
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
                  <span class="line-when">
                    <Button weight="quiet" onclick={() => promote(p)}>Place in nav</Button>
                  </span>
                </div>
              </li>
            {/each}
          </ul>
        {/if}
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
        <div class="row-actions"><Button>Export the record</Button><Button weight="bare">Verify a `.dog`</Button></div>
      </Section>
      <Section title="Danger">
        <div class="danger">
          <p class="danger-title">Delete this record</p>
          <Button tone="bad" onclick={() => toasts.push(copy.notWritten('Deleting a record asks you to type its name first'), { intent: 'bad' })}>Delete the studio</Button>
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
    padding: var(--sp-5) var(--sp-6) var(--sp-9);
    max-inline-size: 1100px;
  }

  .areas {
    display: flex;
    flex-direction: column;
    position: sticky;
    inset-block-start: calc(var(--sticky) + var(--sp-4));
  }

  /* The same row as the rail's, because it IS the same thing: a vertical list of places, one of
     which you are in. It read as a different control entirely — a grey box where the rail uses the
     accent — which teaches that "here" looks like two things. */
  .area {
    min-block-size: 32px;
    display: flex;
    align-items: center;
    padding: 0 var(--sp-3);
    border-radius: var(--r-md);
    color: var(--ink2);
    font-size: var(--t-ui);
    font-weight: 500;
    text-decoration: none;
    transition: background var(--d-state) var(--ease-out);
  }

  .area:hover {
    background: color-mix(in srgb, var(--ink) 6%, transparent);
    color: var(--ink);
  }

  .area[aria-current='page'] {
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    color: var(--accent-text);
    font-weight: 600;
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
      padding: var(--sp-4) var(--sp-4) var(--sp-8);
    }

    .areas {
      position: static;
      flex-direction: row;
      overflow-x: auto;
    }
  }
</style>
