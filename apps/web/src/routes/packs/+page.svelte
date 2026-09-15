<!--
  Packs, and the Kennel.

  A pack declares CONTENT AND IDENTITY — never position or visibility. That is Chrome's line, stated
  most plainly of anyone: extension actions are unpinned by default, and `isOnToolbar` is exposed to
  the extension READ-ONLY. There is no `default_area` and no auto-pin (19 §3).

  Selecting a pack means reading an install diff written in the language of metrics and nav order,
  which is why pack selection is the SECOND screen and never the first: asking a brand-new user to
  approve four schema reviews before they have seen one of their own rows is worse than a tour.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { createClient } from '@braindog/client';
  import { titleOf } from '$lib/title.ts';
  import { copy } from '$lib/copy.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { PAGES, REGISTERS, PACKS, packDiff, pages } from '$lib/record/api.ts';
  import { blocked, choose, type Blocked, type PackState, type Refusal, type Source } from '$lib/record/packs.ts';
  import { read } from '$lib/data/record.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Section from '$lib/ui/Section.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import type { PackInfo } from '$lib/record/schema.ts';
  import { drew } from '../../lib/ui/screen.svelte.ts';

  /* THE CATALOGUE CARRIES NAMES AND BLURBS; the record carries which packs there are and whether each is on. */
  const byId = new Map(PACKS.map((p) => [p.id, p]));
  const nameOf = (id: string) => byId.get(id)?.name ?? id;

  let states = $state<PackState[] | null>(null);
  let refused = $state<Refusal | null>(null);
  let blocks = $state<Record<string, Blocked>>({});
  let busy = $state<string | null>(null);
  let source: Source | null = null;

  const installed = $derived(states ?? []);
  const available = $derived(PACKS.filter((p) => !p.installed && !installed.some((s) => s.id === p.id)));

  let diff = $state<string | null>(null);

  /**
   * THE LIST IS THE RECORD'S NOW, READ ONCE, and the sample's when there is no record to read.
   *
   * `data-screen` on `<main id="main">` is what lets anything outside the page tell a drawn screen
   * from a shell that has fetched nothing. The read is bracketed by `read()`, so the attribute stays
   * away while `packs` is out, and `drew('ready')` is the claim for when it has come back.
   */
  onMount(() => {
    void read(async () => {
      const chosen = await choose(createClient({ base: location.origin }));
      source = chosen.source;
      if (!chosen.first.ok) {
        refused = chosen.first.refusal;
        return false;
      }
      states = chosen.first.value;
      return true;
    });
  });
  $effect(() => drew('ready'));

  /**
   * One press of a switch, or of the button a refusal offered.
   *
   * A REFUSAL STAYS ON THE CARD IT BELONGS TO, and a turn that succeeds clears the ones it answered:
   * its own, and any card that was waiting on the pack that just came back on.
   */
  async function turn(id: string, on: boolean, alsoDisable: readonly string[] = []) {
    if (!source || busy !== null) return;
    busy = id;
    try {
      const out = on ? await source.enable(id) : await source.disable(id, alsoDisable);
      if (!out.ok) {
        blocks = { ...blocks, [id]: blocked(id, out.refusal, alsoDisable) };
        return;
      }
      const turned = new Set([id, ...out.value.packs]);
      blocks = Object.fromEntries(Object.entries(blocks).filter(([k, b]) => !turned.has(k) && !(b.kind === 'off' && turned.has(b.pack))));
      const again = await source.packs();
      if (again.ok) states = again.value;
    } finally {
      busy = null;
    }
  }
</script>

<!--
  ONE DIFF, TWO LISTS.

  It existed only under the packs you ALREADY HAVE. The three you could install carried an `Install`
  button whose toast said the plan "would be shown before anything applied" and showed none — so the
  before-and-after was offered for the decision already made and withheld from the one still open.
  `04 §3`: "The diff is shown before it applies … this is the entire trust model."
-->
{#snippet plan(pack: PackInfo)}
  {@const d = packDiff(pack)}
  <dl class="diff">
    <dt>{copy.diffAdds}</dt>
    <dd>
      <ul class="diff-adds">
        {#each d.adds as add}
          <li>
            <Icon name={add.kind === 'list' ? 'rows' : 'doc'} size="s" />
            <span class="diff-name">{add.name}</span>
            {#if add.detail}<span class="diff-detail">{add.detail}</span>{/if}
          </li>
        {/each}
      </ul>
      <!-- WHAT IS NOT KNOWN, SAID AS NOT KNOWN. A pack this record has not installed declares lists
           and pages it does not have, so there is no field count to give — and the previous version
           printed one anyway. -->
      {#if d.unread}<p class="diff-note">{copy.diffUnread}</p>{/if}
    </dd>

    <!-- `04 §4`: a pack may place a page it owns and may never move yours, and an update that would
         is SHOWN and then ignored. Nothing in this record does, so the line is absent rather than
         printed empty — `06 §1`, a warning that does not apply teaches people to ignore warnings. -->
    {#if d.changes.length}
      <dt>{copy.diffChanges}</dt>
      <dd>{#each d.changes as c}<p>{c}: {copy.diffNavKept}</p>{/each}</dd>
    {/if}
    {#if d.conflicts.length}
      <dt>{copy.diffConflicts}</dt>
      <dd>{#each d.conflicts as c}<p>{c}</p>{/each}</dd>
    {/if}

    <dt>{copy.diffSeeds}</dt>
    <dd>{d.seeds}</dd>
    <dt>{copy.diffTouches}</dt>
    <dd>{d.touches}</dd>
  </dl>
{/snippet}

<svelte:head><title>{titleOf(copy.packs)}</title></svelte:head>

<PageHead icon="packs" title={copy.packs} />

<div class="page">
  <!-- WHAT A PACK IS, SAID ONCE, WHERE THE WORD IS FIRST MET. `packBlurb` existed and rendered
       nowhere, so this screen listed things by name and version with nothing saying what installing
       one would do to the record. -->
  <p class="blurb">{copy.packBlurb}</p>
  <!-- A RECORD WITH NOTHING INSTALLED IS THE ORDINARY FIRST STATE OF THIS SCREEN, and it drew an
       empty `Section` under a `0`. `19 §6` again — and here the sentence has somewhere obvious to
       point, because the list of packs that are NOT installed is directly below it. -->
  <Section title={copy.installed} count={installed.length}>
    <div class="grid-packs">
      {#if refused}
        <Empty kind="error" title={refused.fix} />
      {:else if states && installed.length === 0}
        <Empty kind="no-data-yet" title={copy.noPacksYet} body={copy.noPacksBody} />
      {/if}
      {#each installed as state (state.id)}
        {@const pack = byId.get(state.id)}
        {@const off = state.disabled_at !== null}
        {@const block = blocks[state.id]}
        <!-- OFF IS DIMMED AND SAID, NEVER ABSENT. Its rows are still in the record, and this card is
             the only way back to them. -->
        <article class="pack" data-off={off ? '' : undefined}>
          <header class="pack-head">
            <h3 class="pack-name">{nameOf(state.id)}</h3>
            {#if off}<span class="pack-off">{copy.packTurnedOff}</span>{/if}
            {#if state.version}<span class="pack-version">{state.version}</span>{/if}
          </header>
          {#if pack}<p class="pack-blurb">{pack.blurb}</p>{/if}
          <ul class="pack-gives">
            <!-- Names, not ids. A pack's feature list said `obligations` and `money` where the rest
                 of the product says Obligations and Overview, on the one screen whose whole job is
                 to tell somebody what they are about to install. A pack that is NOT installed names
                 things this record does not have yet, so the id is the honest fallback there. -->
            {#each state.registers as r}<li><Icon name="rows" size="s" />{REGISTERS[r]?.name ?? r}</li>{/each}
            {#each pack?.pages ?? [] as p}<li><Icon name="doc" size="s" />{pages()[p]?.title ?? PAGES[p]?.title ?? p}</li>{/each}
          </ul>
          <div class="segmented" role="group" aria-label={copy.packSwitch(nameOf(state.id))}>
            <button type="button" class="segment" aria-pressed={!off} data-on={off ? undefined : ''} disabled={busy !== null} onclick={() => off && turn(state.id, true)}>{copy.on}</button>
            <button type="button" class="segment" aria-pressed={off} data-on={off ? '' : undefined} disabled={busy !== null} onclick={() => !off && turn(state.id, false)}>{copy.off}</button>
          </div>
          <!-- WHAT STOPPED THE SWITCH, AND THE ONE THING TO PRESS NEXT. The cascade is that press, never the first. -->
          {#if block}
            <p class="pack-said" role="status">
              {#if block.kind === 'required'}
                <span>{copy.packNeededBy(block.also.map(nameOf))}</span>
                <Button weight="quiet" tone="bad" disabled={busy !== null} onclick={() => turn(block.id, false, block.also)}>{copy.packOffTogether(block.also.length)}</Button>
              {:else if block.kind === 'scopes'}
                <span>{copy.packScopesInUse(block.registers.map((r) => REGISTERS[r]?.name ?? r))}</span>
              {:else if block.kind === 'off'}
                <span>{copy.packIsOff(nameOf(block.pack))}</span>
                <Button weight="quiet" disabled={busy !== null} onclick={() => turn(block.pack, true)}>{copy.packTurnOn(nameOf(block.pack))}</Button>
              {:else}
                <span>{block.fix}</span>
              {/if}
            </p>
          {/if}
          {#if pack}
          <footer class="pack-foot">
            <Button weight="bare" onclick={() => (diff = diff === pack.id ? null : pack.id)}>
              {copy.installDiff}
            </Button>
            <!-- IT HAD NO HANDLER AT ALL, on all five installed packs, while its sibling one line up
                 fires the mock toast. A control that does nothing forever with no feedback is the
                 one shape of dead thing a person retries. -->
            <Button
              weight="bare"
              tone="bad"
              onclick={() =>
                toasts.push(
                  copy.notWritten(copy.uninstallWould(pack.name)),
                  { intent: 'warn' },
                )}
            >{copy.uninstall}</Button>
          </footer>
          {#if diff === pack.id}{@render plan(pack)}{/if}
          {/if}
        </article>
      {/each}
    </div>
  </Section>

  <!-- AND THIS HALF HAD NONE, eleven lines under the half that does it right. A record that has
       installed everything got the heading, a `0` and a hole where the list had been, which is the
       failure `19 §6` names and the fix was one branch away in the same file. It is `cleared` and
       not `no-data-yet`: having them all is finishing rather than not having started, and there is
       no action on it, because what fills this list is somebody else publishing to it. -->
  <Section title={copy.browse} count={available.length}>
    {#if available.length === 0}
      <Empty kind="cleared" title={copy.allInstalled} body={copy.allInstalledWhy} />
    {:else}
      <ul class="ledger">
        {#each available as pack}
          <li>
            <div class="line">
              <span class="seq">{pack.author}</span>
              <span class="line-main">
                <span class="line-title">{pack.name}</span>
                <span class="line-detail">{pack.blurb}</span>
              </span>
              <span class="line-amount">
                {#if pack.stars}<span class="stars"><Icon name="star" size="s" />{pack.stars}</span>{/if}
              </span>
              <span class="line-when">
                <Button weight="bare" onclick={() => (diff = diff === pack.id ? null : pack.id)}>{copy.installDiff}</Button>
                <!-- A PACK THAT COLLIDES CANNOT BE INSTALLED, and the button says so rather than
                     promising a transaction that would be refused. `02 §5` warns that a disabled
                     control "invites a question the UI cannot answer" — this one is answered directly
                     below it, in the CONFLICTS section the button points at, which is the same shape
                     the row form uses for its own disabled submit. -->
                <Button
                  weight="quiet"
                  disabled={Boolean(pack.conflicts?.length)}
                  aria-describedby={pack.conflicts?.length ? `conflict-${pack.id}` : undefined}
                  onclick={() =>
                    toasts.push(copy.notWritten(`${pack.name} would be installed all at once, after you have seen what it adds`), { intent: 'warn' })}
                >{copy.install}</Button>
              </span>
            </div>
            <!-- THE REASON IS BESIDE THE BUTTON, NOT INSIDE THE DISCLOSURE. `02 §5`'s objection to a
                 disabled control is that it "invites a question the UI cannot answer" — which is
                 exactly what it would be if the answer lived behind a panel that is closed by
                 default. One sentence, always, next to the control it disables. -->
            {#if pack.conflicts?.length}
              <p class="pack-refused" id="conflict-{pack.id}">
                {copy.diffRefused(pack.conflicts.map((id) => REGISTERS[id]?.name ?? id))}
              </p>
            {/if}
            {#if diff === pack.id}{@render plan(pack)}{/if}
          </li>
        {/each}
      </ul>
    {/if}
  </Section>
</div>

<style>
  /**
   * THE ACTIONS NEED A TRACK WIDE ENOUGH FOR THEM.
   *
   * These rows borrow the ledger shape, whose trailing track is `9ch` — the width of a date, which
   * is what it holds everywhere else. Here it holds two buttons, ~222px of them, in an 81px track:
   * they overflowed left across the stars beside them and painted *through* the label. Two of the
   * three rows read "What this a**214**s" and "What this ad**37**", with the star count sitting
   * inside the word. The third escaped only because it has no stars.
   *
   * `auto` for both trailing tracks, so the buttons take the width they need and the star count
   * takes the width it needs. Scoped to this list: the ledger's own 9ch is right for a date, and
   * changing it there would move every other row in the product to fix one screen.
   *
   * Above 640px only, for the reason `/audit` and `/decide` carry the same guard — below it the row
   * becomes a two-line card and a track list from the desktop wins over the card placements, because
   * a component `<style>` is unlayered and more specific than `@layer components`.
   */
  @media (width >= 640px) {
    .ledger :global(.line) {
      grid-template-columns: 12ch minmax(0, 1fr) auto auto;
    }
  }

  /* One sentence saying what the things on this screen are, in the person's words. */
  .blurb {
    margin-block-end: var(--sp-4);
    max-inline-size: 62ch;
    color: var(--ink2);
    font-size: var(--t-ui);
    line-height: 1.6;
  }

  .page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
    padding: var(--sp-5) var(--sp-6) var(--sp-9);
    max-inline-size: 1100px;
  }

  /**
   * IT WAS THREE TRACKS, WHATEVER THE RECORD HAD IN IT.
   *
   * It was `repeat(3, minmax(0, 1fr))`, so a record with one installed pack drew one card across a
   * third of a 1100px page with two thirds of nothing beside it, and the same at two. The count is
   * a fact about the record and the rule knew nothing about it.
   *
   * `auto-fit` AND NOT `auto-fill`, and the difference is the whole of the fix: both make as many
   * 280px tracks as fit, and only `auto-fit` collapses the ones no card landed in. With `auto-fill`
   * one card still sits in a third, because the two empty tracks keep their `1fr`. The floor is
   * 280px rather than `0` for the reason `/decide`'s `.cards` carries a count: `minmax(0, 1fr)`
   * under `auto-fit` has no width at which to stop, and that grid generated seven tracks for three
   * items before it was told how many it held.
   *
   * AND THE TWO WIDTH OVERRIDES ARE GONE WITH IT. They forced two tracks under 1200px and one under
   * 900, which is what this rule now works out on its own, and while they stood they put a single
   * card back into half a page at every width below 1200.
   */
  .grid-packs {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: var(--sp-3);
  }

  .pack {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    padding: var(--sp-4);
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    box-shadow: var(--raise);
    transition: border-color var(--d-state) var(--ease-out);
  }

  .pack:hover {
    border-color: var(--edge);
  }

  .pack-head {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
  }

  .pack-name {
    font-family: var(--font-ui);
    font-size: var(--t-md);
    font-weight: 500;
  }

  /* OFF, AND STILL HERE. The contents dim; the switch and what stopped it do not, because they are
     what a person reads next. */
  .pack[data-off] :is(.pack-name, .pack-version, .pack-blurb, .pack-gives) {
    opacity: 0.55;
  }

  .pack-off {
    margin-inline-start: auto;
    color: var(--dim);
    font-size: var(--t-xs);
    font-weight: 600;
  }

  .pack-off + .pack-version {
    margin-inline-start: 0;
  }

  .pack-said {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  .pack-version {
    margin-inline-start: auto;
    color: var(--dim);
    font-family: var(--font-id);
    font-size: var(--t-xs);
  }

  .pack-blurb {
    flex: 1;
    color: var(--dim);
    font-size: var(--t-ui);
  }

  .pack-gives {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* THE BODY FACE. These are the names of lists and pages, which a person reads as words; the
     identifier face made a pack's contents look like a manifest. */
  .pack-gives li {
    display: flex;
    align-items: center;
    gap: 5px;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  /* A hairline, and the card's own padding pulled back over it, so the actions read as the card's
     FOOTER rather than as two more lines of its body. Without it "What this adds" sits at the same
     level as the blurb above it and the card has no bottom. */
  .pack-foot {
    display: flex;
    gap: var(--sp-1);
    margin-block-start: auto;
    padding-block-start: var(--sp-3);
    margin-inline: calc(var(--sp-4) * -1);
    padding-inline: calc(var(--sp-4) - var(--sp-3));
    border-block-start: 1px solid var(--line);
  }

  /* A DEFINITION LIST, NOT A CODE BLOCK. It was a `<pre>` in the id face with its own horizontal
     scrollbar, so on a phone the only line that fitted was half of one — and what a person is doing
     here is deciding whether to trust something, which is reading rather than diffing. The sections
     are `04 §3`'s, the words are theirs, and it wraps. */
  .diff {
    display: grid;
    grid-template-columns: minmax(6ch, max-content) minmax(0, 1fr);
    gap: var(--sp-1) var(--sp-4);
    margin: 0;
    padding: var(--sp-3);
    background: var(--sunk);
    border: 1px solid var(--line);
    border-radius: var(--r-sm);
    color: var(--ink2);
    font-size: var(--t-sm);
    line-height: 1.6;
  }

  .diff dt {
    color: var(--dim);
    font-size: var(--t-sm);
    font-weight: 600;
  }

  .diff dd {
    margin: 0;
  }

  .diff dd p {
    margin: 0;
  }

  .diff-adds {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .diff-adds li {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
  }

  .diff-name {
    color: var(--ink);
  }

  .diff-detail {
    color: var(--dim);
    font-size: var(--t-xs);
  }

  .pack-refused {
    margin: 0 0 var(--sp-2);
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .diff-note {
    margin-block-start: var(--sp-2);
    color: var(--dim);
    font-size: var(--t-xs);
  }

  .stars {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    color: var(--dim);
    font-size: var(--t-xs);
  }

  @media (width < 900px) {
    .page {
      padding: var(--sp-4) var(--sp-4) var(--sp-8);
    }
  }
</style>
