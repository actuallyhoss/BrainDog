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
  import * as pref from '$lib/pref.ts';
  import { ACCENTS, apply as accentApply } from '$lib/accent.ts';
  import { copy } from '$lib/copy.ts';
  import type { PageDecl } from '$lib/record/schema.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { PACKS, PAGES, PEOPLE_ACCESS, REGISTERS, pages } from '$lib/record/api.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Section from '$lib/ui/Section.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Chip from '$lib/ui/Chip.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Empty from '$lib/ui/Empty.svelte';

  /* Twelve rows with a glyph each, because this rail's own CSS says it "IS the same thing" as the
     app's rail, and the app's rail has never had a row without one. A list of twelve bare words is
     the hardest kind of nav to scan: nothing tells you where you are except reading all of them. */
  const AREAS = [
    { id: 'appearance', label: 'Appearance', icon: 'sun' },
    { id: 'identity', label: 'Identity', icon: 'people' },
    { id: 'recovery', label: 'Recovery', icon: 'key' },
    { id: 'people', label: 'People & sharing', icon: 'people' },
    { id: 'agents', label: 'Agents', icon: 'session' },
    { id: 'ingest', label: 'Ingest', icon: 'inbox' },
    { id: 'keyboard', label: 'Keyboard', icon: 'keyboard' },
    { id: 'navigation', label: 'Navigation', icon: 'rows' },
    { id: 'notifications', label: 'Notifications', icon: 'bell' },
    { id: 'backups', label: 'Backups', icon: 'archive' },
    { id: 'billing', label: 'Billing', icon: 'money' },
    { id: 'export', label: 'Export', icon: 'download' },
  ] as const;

  const area = $derived(page.params.area ?? 'appearance');

  /* SET IT AND REMEMBER IT, in one call. These were two things and the second was never written:
     every preference in this product was lost on refresh, and a setting that does not survive a
     reload is a setting somebody changes once and then stops trusting. */
  const set = (key: 'scheme' | 'text' | 'density', value: string) => pref.apply(key, value);

  /* SEEDED FROM WHAT IS REMEMBERED, so the controls show the state the page is already in rather
     than the default the state happens to start at. */
  const held = pref.read();
  let scheme = $state<'light' | 'system' | 'dark'>(held.scheme ?? 'system');
  let text = $state<'sm' | 'base' | 'md'>(held.text ?? 'base');
  let density = $state<'compact' | 'comfortable' | 'roomy'>(held.density ?? 'comfortable');
  let chars = $state(held.chars ?? true);

  let accent = $state<string | null>(held.theme ?? null);
  let accentWrong = $state<string[]>([]);

  function pickAccent(hex: string | null) {
    const out = accentApply(hex);
    if (!out.ok) {
      /* THE FLOOR IT MISSED, NOT "THAT DID NOT WORK". A refusal a person cannot act on is a refusal
         that teaches them the control is broken. */
      accentWrong = out.refusals;
      return;
    }
    accentWrong = [];
    accent = hex;
    toasts.push(hex ? copy.accentSet(ACCENTS.find((a) => a.hex === hex)?.name ?? hex) : copy.accentReset);
  }

  function pickScheme(v: 'light' | 'system' | 'dark') {
    scheme = v;
    /* `system` IS AN ANSWER AND NOT AN ABSENCE, so it is written down: removing the attribute
       without recording the choice would make the next visit read a stale `dark` from the cookie. */
    pref.apply('scheme', v === 'system' ? null : v);
  }

  const pen = $derived(
    Object.values(pages()).filter((p) => p.placed === false && !placed.some((x) => x.page === p.page)),
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
  /* AND THE CHARACTER KEYS TOO. It is the one preference that changes what the keyboard DOES, so
     forgetting it is the one somebody notices within a minute. */
  $effect(() => {
    pref.write({ chars });
  });

  let placed = $state<PageDecl[]>([]);

  function promote(decl: PageDecl) {
    placed = [...placed, decl];
    toasts.push(copy.promoted(decl.title), {
      undo: () => (placed = placed.filter((x) => x.page !== decl.page)),
    });
  }
</script>

<svelte:head><title>{titleOf(area.replace(/^./, (c) => c.toUpperCase()), copy.settings)}</title></svelte:head>

<PageHead icon="settings" kicker={copy.settings} title={area.replace(/^./, (c) => c.toUpperCase())} />

<div class="shell">
  <nav class="areas" aria-label={copy.settings}>
    {#each AREAS as a}
      <a class="area" href="/settings/{a.id}" aria-current={a.id === area ? 'page' : undefined}>
        <Icon name={a.icon} size="s" />
        {a.label}
      </a>
    {/each}
  </nav>

  <div class="body">
    {#if area === 'appearance'}
      <!--
        THE RECORD'S OWN COLOUR. `@braindog/theme` solves an entire coherent palette from one seed
        against every floor it defines, and until now nothing called it with anything but the house
        red — so a bakery and a type foundry looked identical. The swatches are suggestions, not the
        set: any colour that passes goes in, and one that does not says which floor it missed rather
        than being quietly approximated.
      -->
      <Section title={copy.accentTitle}>
        <p class="hint">{copy.accentHint}</p>
        <div class="swatches" role="group" aria-label={copy.accentTitle}>
          {#each ACCENTS as a}
            <button
              type="button"
              class="swatch"
              data-on={accent === a.hex ? '' : undefined}
              style="--swatch:{a.hex}"
              aria-label={a.name}
              onclick={() => pickAccent(a.hex)}
            >
              {#if accent === a.hex}<Icon name="check" size="s" />{/if}
            </button>
          {/each}
          <button type="button" class="swatch swatch-off" data-on={accent === null ? '' : undefined} onclick={() => pickAccent(null)}>
            {copy.accentHouse}
          </button>
        </div>
        {#if accentWrong.length}
          <ul class="wrong">
            {#each accentWrong as line}<li>{line}</li>{/each}
          </ul>
        {/if}
      </Section>

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
                  <span class="seq"><Icon name="doc" size="s" /></span>
                  <span class="line-main">
                    <span class="line-title">{p.title}</span>
                    <!-- `register.people` is the requirement's own qualified id. What a reader
                         wants is which of their lists it was built from. -->
                    <span class="line-detail">
                      {copy.holdingPen} Built from your {REGISTERS[String(p.requires[0] ?? '').replace('register.', '')]?.name ?? 'rows'}.
                    </span>
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
                <!-- This printed the TOTAL number of lists in the record on every person's row,
                     identical for all of them, which reads as a per-person figure and is not one.
                     What the column is for is what this person can reach. -->
                <span class="line-when">{p.level === 'owner' ? 'Everything' : 'Read only'}</span>
              </div>
            </li>
          {/each}
        </ul>
      </Section>
    {:else if area === 'export'}
      <Section title="Your data">
        <!-- THE WHOLE CONTENT OF THIS SCREEN WAS TWO DEAD BUTTONS, on the page that carries the
             product's central promise: take your record and go. They say what they would do. -->
        <div class="row-actions">
          <Button
            onclick={() =>
              toasts.push(copy.notWritten('The whole record would be written to a .dog file, line per row'))}
          >Export the record</Button>
          <Button
            weight="bare"
            onclick={() =>
              toasts.push(copy.notWritten('A .dog file would be checked against its own manifest and signature'))}
          >Verify a `.dog`</Button>
        </div>
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

    <p class="mock">{copy.mockNotice} {PACKS.length} packs, {Object.keys(REGISTERS).length} lists.</p>
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
    gap: var(--sp-3);
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

  /* The hint sits above the control it explains, not beside it: a sentence in a column beside a
     row of swatches is read after the choice has been made. */
  .hint {
    margin: 0 0 var(--sp-3);
    max-width: var(--measure);
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: var(--lh-body);
  }

  .swatches {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  /* A SWATCH IS THE COLOUR, and the tick is drawn ON it rather than beside it: a selected state
     that lives outside the thing selected is a state people read as belonging to the next one. */
  .swatch {
    display: grid;
    place-items: center;
    min-width: var(--tap);
    height: var(--tap);
    padding: 0 var(--sp-2);
    background: var(--swatch, var(--s1));
    /* THE LABEL ON A FILL, which is the token the theme solves for exactly this: a tick drawn in
       white on an ochre swatch is the one place a literal would be wrong twice over. */
    color: var(--accent-ink);
    border: 1px solid var(--line);
    border-radius: var(--r-sm);
    cursor: pointer;
  }

  .swatch[data-on] {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
  }

  .swatch-off {
    background: var(--s1);
    color: var(--ink);
    font-size: var(--t-sm);
  }

  /* A refusal a person cannot act on teaches them the control is broken, so the floor it missed is
     printed rather than a shrug. */
  .wrong {
    margin: var(--sp-3) 0 0;
    padding-inline-start: var(--sp-4);
    color: var(--danger);
    font-size: var(--t-sm);
    line-height: var(--lh-body);
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
