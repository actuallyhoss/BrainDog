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
  import { apiBase } from '$lib/at.ts';
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { createClient } from '@braindog/client';
  import { titleOf } from '$lib/title.ts';
  import { copy } from '$lib/copy.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { packDiff } from '$lib/record/api.ts';
  /* THE MODULES THIS BUILD SHIPS, for their names, blurbs and lists. It was the sample's `PACKS`, which carried the same
     six and two add-ons nobody wrote (wave C1, `modules.ts`). */
  import { MODULES } from '$lib/record/modules.ts';
  import { PAGES, REGISTERS } from '$lib/record/held.ts';
  import CallsOut from '$lib/ui/CallsOut.svelte';
  import type { Shell } from '$lib/record/boot-live.ts';
  import { hostedHere } from '../settings/billing.ts';
  import { installWords } from '$lib/record/actions.ts';
  import { blocked, choose, installPlanned, moduleUpdates, packDocument, planInstall, words, type Blocked, type Offer, type PackState, type Refusal, type Source } from '$lib/record/packs.ts';
  import { words as vaultWords } from '$lib/record/vault.ts';
  import { read } from '$lib/data/record.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Section from '$lib/ui/Section.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import type { PackInfo } from '$lib/record/schema.ts';
  import { drew } from '../../lib/ui/screen.svelte.ts';
  import InstallShared from './InstallShared.svelte';
  import CatalogueUpdates from './CatalogueUpdates.svelte';
  import { browseable } from './browseable.ts';
  import { catalogueTitles, readHostCatalogue } from './browse/catalogue.ts';
  import { moduleName } from '@braindog/seed/usecases/names';

  /* THE CATALOGUE CARRIES NAMES AND BLURBS; the record carries which packs there are and whether each is on. */
  const byId = new Map(MODULES.map((p) => [p.id, p]));
  /* AN ADD-ON FROM THIS BRAINDOG'S CATALOGUE is not in `MODULES`, so its catalogue title names it, and its id only when neither knows it. */
  let catalogueNames = $state.raw<Map<string, string>>(new Map());
  /* A USE CASE'S PACK BY ITS USE CASE, "Solo founder", and a module by the name it goes by, never `usecase-founder`. */
  const nameOf = (id: string) => byId.get(id)?.name ?? catalogueNames.get(id) ?? moduleName(id);
  /* A LIST BY THE NAME THIS RECORD GIVES IT: `REGISTERS` holds what this tab has learnt of the record's declarations (it
     is still filled with the seed's before that, which wave B's `held.ts` brief takes away), and a use case's own lists
     read `datapoints` without the shell's names. */
  const listName = (r: string): string =>
    REGISTERS[r]?.name ??
    ((page.data.lists ?? []) as { id: string; name: string }[]).find((l) => l.id === r)?.name ??
    r.charAt(0).toUpperCase() + r.slice(1).replaceAll('_', ' ');
  /* The first-party author reads as the product's name. */
  const authorName = (a: string): string => (a === 'braindog' ? copy.product : a);

  let states = $state<PackState[] | null>(null);
  let refused = $state<Refusal | null>(null);
  let blocks = $state<Record<string, Blocked>>({});
  let busy = $state<string | null>(null);
  let source: Source | null = null;
  let client = $state.raw<ReturnType<typeof createClient> | null>(null);
  /** True once the record answered. Until then, and after a refusal, nothing below the refusal is drawn. */
  const live = $derived(states !== null);

  const installed = $derived(states ?? []);
  /* ONLY WHAT THIS BUILD SHIPS, and only once the record has said what it holds (`browseable.ts`). */
  const available = $derived(states ? browseable(MODULES, states) : []);

  let diff = $state<string | null>(null);

  /* A MODULE ON AT AN OLDER VERSION THAN THIS BUILD SHIPS, offered here through the same plan an install gets, so a module
     turned on by itself, with no use case to update it through browse, still reaches its newer version. */
  let updates = $state.raw<Map<string, { from: string; to: string }>>(new Map());
  $effect(() => {
    const held = states;
    if (!live || !held) return;
    void moduleUpdates(held).then((found) => {
      if (states === held) updates = new Map(found.map((u) => [u.id, u]));
    });
  });

  /** The record's plan for one add-on, drawn under it until Install or Not now. */
  let offer = $state<Offer | null>(null);

  /** A plan names registers and pages by id; the reader is asked about names. */
  const planName =
    (pack: PackInfo) =>
    (kind: 'register' | 'page', key: string): string =>
      pack.titles?.[key] ?? (kind === 'register' ? REGISTERS[key]?.name : PAGES[key]?.title) ?? key.charAt(0).toUpperCase() + key.slice(1);

  /**
   * Install, first press: the record's plan for this add-on, drawn under it. An entry nothing ships a document for is
   * said as not installable yet.
   */
  async function offerInstall(pack: PackInfo) {
    if (!client || busy !== null) return;
    busy = pack.id;
    try {
      const doc = await packDocument(pack.id, installed);
      if (!doc) {
        toasts.push(copy.packNotInstallable(pack.name), { intent: 'warn' });
        return;
      }
      const out = await planInstall(client, pack.id, doc, planName(pack));
      if (!out.ok) {
        toasts.push(out.refusal.fix, { intent: 'warn' });
        return;
      }
      offer = out.value;
      diff = null;
    } finally {
      busy = null;
    }
  }

  /** Install, second press: the plan that is on screen. A plan the record has moved past is planned and drawn again. */
  /**
   * Undo for Uninstall: plan the add-on again and install that plan, which puts back its settings and schedules and
   * plants no second set of examples. A pack that calls other services is shown with its plan instead, because what it
   * calls out is approved by a press, never by an undo.
   */
  async function reinstall(pack: PackInfo) {
    if (!client || !source || busy !== null) return;
    busy = pack.id;
    try {
      const again = await source.packs();
      if (again.ok) states = again.value;
      const doc = await packDocument(pack.id, installed);
      if (!doc) return void toasts.push(copy.packNotInstallable(pack.name), { intent: 'warn' });
      const planned = await planInstall(client, pack.id, doc, planName(pack));
      if (!planned.ok) return void toasts.push(planned.refusal.fix, { intent: 'warn' });
      if (planned.value.approve.length > 0) {
        offer = planned.value;
        return void toasts.push(copy.reinstallApprove(pack.name), { intent: 'warn' });
      }
      const out = await installPlanned(client, planned.value, planName(pack));
      if (!out.ok) {
        toasts.push(out.fix, { intent: 'warn' });
        if (out.again) offer = out.again;
        return;
      }
      toasts.push(copy.reinstalled(pack.name), { intent: 'good' });
      const now = await source.packs();
      if (now.ok) states = now.value;
    } finally {
      busy = null;
    }
  }

  async function installOffer(pack: PackInfo) {
    if (!client || !source || !offer || busy !== null) return;
    busy = pack.id;
    try {
      const out = await installPlanned(client, offer, planName(pack));
      if (!out.ok) {
        toasts.push(out.fix, { intent: 'warn' });
        if (out.again) offer = out.again;
        return;
      }
      offer = null;
      toasts.push(copy.packInstalledNamed(pack.name), { intent: 'good' });
      const again = await source.packs();
      if (again.ok) states = again.value;
    } finally {
      busy = null;
    }
  }

  /**
   * THE LIST IS THE RECORD'S, READ ONCE, and with no record to read it is the record's refusal and nothing else. It
   * was the sample's six add-ons, with switches that moved in the tab, until DIRECTION 26.
   *
   * `data-screen` on `<main id="main">` is what lets anything outside the page tell a drawn screen
   * from a shell that has fetched nothing. The read is bracketed by `read()`, so the attribute stays
   * away while `packs` is out, and `drew('ready')` is the claim for when it has come back.
   */
  onMount(() => {
    void readHostCatalogue(fetch).then(async (got) => {
      if (got.ok) catalogueNames = await catalogueTitles(got.index);
    });
    void read(async () => {
      client = createClient({ base: apiBase() });
      const chosen = await choose(client);
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
      /* OFF IS UNDONE, NOT ASKED. Its lists leave the sidebar, which is easy to miss from here, and on is the same
         call over the same rows. The pack pressed comes back first, so a dependent that leans on it can follow. */
      if (!on && out.value.changed) {
        const went = [id, ...out.value.packs.filter((p) => p !== id)];
        toasts.push(copy.packTurnedOffNamed(went.map(nameOf)), { undo: () => void turnBack(went) });
      }
      blocks = Object.fromEntries(Object.entries(blocks).filter(([k, b]) => !turned.has(k) && !(b.kind === 'off' && turned.has(b.pack))));
      const again = await source.packs();
      if (again.ok) states = again.value;
    } finally {
      busy = null;
    }
  }

  /** Undo for a switch turned off: each pack on again, in the order they went. */
  async function turnBack(ids: readonly string[]) {
    if (!source || busy !== null) return;
    busy = ids[0] ?? null;
    try {
      for (const id of ids) {
        const out = await source.enable(id);
        if (!out.ok) {
          blocks = { ...blocks, [id]: blocked(id, out.refusal) };
          break;
        }
      }
      const again = await source.packs();
      if (again.ok) states = again.value;
    } finally {
      busy = null;
    }
  }


  /**
   * Uninstall one. The record takes it out, and the list is read again, so what is drawn is what the record now holds.
   * A refusal is the record's sentence, and a race reads again.
   */
  async function uninstall(pack: PackInfo) {
    const { id, name } = pack;
    if (!source || busy !== null) return;
    busy = id;
    try {
      const out = await source.uninstall(id);
      /* NOT ASKED FIRST: the record keeps its settings and schedules for thirty days, so Undo installs it again. */
      if (out.ok) toasts.push(copy.uninstalled(name), { intent: 'good', undo: () => void reinstall(pack) });
      else toasts.push(out.refusal.code === 'VERSION_STALE' ? copy.writeRaced : out.refusal.fix, { intent: 'warn' });
      if (out.ok || out.refusal.code === 'VERSION_STALE') {
        const again = await source.packs();
        if (again.ok) states = again.value;
      }
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
  {@const d = packDiff(pack, installed.some((s) => s.id === pack.id))}
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

    <CallsOut calls={d.calls} hosted={hostedHere(page.data as unknown as Shell)} note={installWords.asksOnce} />

    <dt>{copy.diffSeeds}</dt>
    <dd>{d.seeds}</dd>
    <dt>{copy.diffTouches}</dt>
    <dd>{d.touches}</dd>
  </dl>
{/snippet}

<!-- THE RECORD'S PLAN FOR ONE ADD-ON, under its row to install it or under its card to update it. -->
{#snippet offered(pack: PackInfo)}
  {#if offer}
    <!-- THE RECORD'S OWN PLAN, the lines Install approves and nothing else. -->
    <dl class="diff">
      <dt>{copy.diffAdds}</dt>
      <dd>
        {#if offer.plan.summary}<p>{offer.plan.summary}</p>{/if}
        <ul class="diff-adds">
          {#each offer.plan.adds as add (add.kind + add.name)}
            <li>
              <Icon name={add.kind === 'list' ? 'rows' : 'doc'} size="s" />
              <span class="diff-name">{add.name}</span>
              {#if add.detail}<span class="diff-detail">{add.detail}</span>{/if}
            </li>
          {/each}
        </ul>
      </dd>
      {#if offer.plan.conflicts.length}
        <dt>{copy.diffConflicts}</dt>
        <dd>{#each offer.plan.conflicts as c (c)}<p>{c}</p>{/each}</dd>
      {/if}
      <CallsOut calls={offer.calls} hosted={hostedHere(page.data as unknown as Shell)} note={installWords.asksOnce} />
      {#if offer.plan.seeds}
        <dt>{copy.diffSeeds}</dt>
        <dd>{offer.plan.seeds}</dd>
      {/if}
      <dt>{copy.diffTouches}</dt>
      <dd>{offer.plan.touches}</dd>
    </dl>
    <div class="offer-actions">
      <Button weight="primary" disabled={busy !== null || offer.plan.conflicts.length > 0} onclick={() => void installOffer(pack)}>{copy.install}</Button>
      <Button weight="bare" disabled={busy !== null} onclick={() => (offer = null)}>{vaultWords.notNow}</Button>
    </div>
  {/if}
{/snippet}

<svelte:head><title>{titleOf(copy.packs)}</title></svelte:head>

<PageHead icon="packs" title={copy.packs} />

<div class="page">
  <!-- WHAT A PACK IS, SAID ONCE, WHERE THE WORD IS FIRST MET. `packBlurb` existed and rendered
       nowhere, so this screen listed things by name and version with nothing saying what installing
       one would do to the record. -->
  <p class="blurb">{copy.packBlurb}</p>
  <CatalogueUpdates {states} {live} {client} />
  <!-- A RECORD WITH NOTHING INSTALLED IS THE ORDINARY FIRST STATE OF THIS SCREEN, and it drew an
       empty `Section` under a `0`. `19 §6` again — and here the sentence has somewhere obvious to
       point, because the list of packs that are NOT installed is directly below it. -->
  <Section title={copy.installed} count={installed.length}>
    <div class="grid-packs">
      {#if refused}
        <Empty kind="error" title={refused.fix}>
          {#snippet actions()}<Button onclick={() => location.reload()}>{copy.tryAgain}</Button>{/snippet}
        </Empty>
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
            <button
              type="button"
              class="switch"
              role="switch"
              aria-checked={!off}
              aria-label={copy.packSwitch(nameOf(state.id))}
              disabled={busy !== null}
              onclick={() => turn(state.id, off)}
            ><span class="switch-track"></span></button>
          </header>
          {#if pack}<p class="pack-blurb">{pack.blurb}</p>{/if}
          <ul class="pack-gives">
            <!-- Names, not ids. A pack's feature list said `obligations` and `money` where the rest
                 of the product says Obligations and Overview, on the one screen whose whole job is
                 to tell somebody what they are about to install. A pack that is NOT installed names
                 things this record does not have yet, so the id is the honest fallback there. -->
            {#each state.registers as r}<li><Icon name="rows" size="s" />{listName(r)}</li>{/each}
            {#each pack?.pages ?? [] as p}<li><Icon name="doc" size="s" />{PAGES[p]?.title ?? p}</li>{/each}
          </ul>
          <!-- WHAT STOPPED THE SWITCH, AND THE ONE THING TO PRESS NEXT. The cascade is that press, never the first. -->
          {#if block}
            <p class="pack-said" role="status">
              {#if block.kind === 'required'}
                <span>{copy.packNeededBy(block.also.map(nameOf))}</span>
                <Button weight="quiet" tone="bad" disabled={busy !== null} onclick={() => turn(block.id, false, block.also)}>{copy.packOffTogether(block.also.length)}</Button>
              {:else if block.kind === 'scopes'}
                <span>{copy.packScopesInUse(block.registers.map(listName))}</span>
              {:else if block.kind === 'off'}
                <span>{copy.packIsOff(nameOf(block.pack))}</span>
                <Button weight="quiet" disabled={busy !== null} onclick={() => turn(block.pack, true)}>{copy.packTurnOn(nameOf(block.pack))}</Button>
              {:else}
                <span>{block.fix}</span>
              {/if}
            </p>
          {/if}
          <footer class="pack-foot">
            <!-- EVERY INSTALLED ADD-ON HAS THIS, catalogued or not: whether it declares settings is the page's to say. -->
            <Button weight="bare" href="/packs/{state.id}">{words.settings}</Button>
          {#if pack && updates.has(state.id)}
            <Button weight="quiet" disabled={busy !== null || offer?.id === pack.id} onclick={() => void offerInstall(pack)}>
              {busy === pack.id && offer?.id !== pack.id ? copy.packPlanning : copy.updateTo(updates.get(state.id)?.to ?? '')}
            </Button>
          {/if}
          {#if pack}
            <Button weight="bare" onclick={() => (diff = diff === pack.id ? null : pack.id)}>
              {copy.installDiff}
            </Button>
            <!-- IT HAD NO HANDLER AT ALL, on all five installed packs, while its sibling one line up
                 fires the mock toast. A control that does nothing forever with no feedback is the
                 one shape of dead thing a person retries. -->
            <Button
              weight="bare"
              tone="bad"
              disabled={busy !== null}
              onclick={() => uninstall(pack)}
            >{copy.uninstall}</Button>
          {/if}
          </footer>
          {#if pack && offer?.id === pack.id}{@render offered(pack)}{:else if pack && diff === pack.id}{@render plan(pack)}{/if}
        </article>
      {/each}
    </div>
  </Section>

  <!-- USE CASES: a whole arrangement as one file, browsed, shared and installed through the same plan as an add-on
       (`loop/research-spark.md` S14). NOT UNDER A REFUSAL: a record that would not list its add-ons will not plan a
       file either, and the sentence above is the one thing to read. -->
  {#if !refused}
  <Section title={copy.useCases}>
    <p class="blurb">{copy.useCasesBlurb}</p>
    <div class="usecase-links">
      <Button weight="quiet" href="/packs/browse">{copy.browseUseCases}</Button>
      <Button weight="bare" href="/packs/share">{copy.shareSetup}</Button>
    </div>
    <h3 class="usecase-sub">{copy.installFromFile}</h3>
    <InstallShared
      {client}
      {installed}
      oninstalled={async () => {
        const again = await source?.packs();
        if (again?.ok) states = again.value;
      }}
    />
  </Section>
  {/if}

  <!-- AND THIS HALF HAD NONE, eleven lines under the half that does it right. A record that has
       installed everything got the heading, a `0` and a hole where the list had been, which is the
       failure `19 §6` names and the fix was one branch away in the same file. It is `cleared` and
       not `no-data-yet`: having them all is finishing rather than not having started, and there is
       no action on it, because what fills this list is somebody else publishing to it.

       AND ONLY ONCE THE RECORD HAS SAID WHAT IT HOLDS. Before that, and under a refusal, this list was the sample's two
       pictured add-ons with their star counts, which nobody wrote and nothing installs. -->
  {#if live}
  <Section title={copy.browse} count={available.length}>
    {#if available.length === 0}
      <Empty kind="cleared" title={copy.allInstalled} body={copy.allInstalledWhy} />
    {:else}
      <ul class="ledger">
        {#each available as pack}
          <li>
            <div class="line">
              <span class="seq">{authorName(pack.author)}</span>
              <span class="line-main">
                <span class="line-title">{pack.name}</span>
                <span class="line-detail">{pack.blurb}</span>
              </span>
              <span class="line-amount">
                {#if pack.stars}<span class="stars"><Icon name="star" size="s" />{pack.stars}</span>{/if}
              </span>
              <span class="line-when">
                <Button weight="bare" onclick={() => (diff = diff === pack.id ? null : pack.id)}>{copy.installDiff}</Button>
                <!-- THE RECORD'S PLAN IS WHAT SAYS A PACK COLLIDES, in its conflicts, under this row and
                     before Install can be pressed. The sample's own conflicts, and the toast saying what an
                     install "would" do, went with the sample. -->
                <Button
                  weight="quiet"
                  disabled={busy !== null || offer?.id === pack.id}
                  onclick={() => void offerInstall(pack)}
                >{busy === pack.id && offer?.id !== pack.id ? copy.packPlanning : copy.install}</Button>
              </span>
            </div>
            {#if offer?.id === pack.id}{@render offered(pack)}
            {:else if diff === pack.id}{@render plan(pack)}{/if}
          </li>
        {/each}
      </ul>
    {/if}
  </Section>
  {/if}
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

  .usecase-links {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    margin-block-end: var(--sp-4);
  }

  .usecase-sub {
    margin-block-end: var(--sp-2);
    font-family: var(--font-ui);
    font-size: var(--t-sm);
    font-weight: 600;
    color: var(--ink2);
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
    padding: var(--sp-5) var(--gutter) var(--sp-9);
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
  /* ROWS, NOT A WALL OF CARDS (DESIGN-SYSTEM APPENDIX C13). Six bordered cards with a switch and a
     ruled footer each read as a marketplace grid, and put six accent shapes side by side. An installed
     add-on is a row: its name, version and switch on the first line, what it is under it, and its
     three links at the trailing edge, with a hairline between rows as every list has. */
  .grid-packs {
    display: flex;
    flex-direction: column;
    max-inline-size: var(--page-max);
  }

  .pack {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    column-gap: var(--sp-6);
    row-gap: var(--sp-1);
    align-items: start;
    padding-block: var(--sp-4);
    border-block-end: 1px solid var(--line-soft);
  }

  .pack > :global(*) {
    grid-column: 1;
  }

  .pack > .pack-head {
    grid-column: 1 / -1;
  }

  .pack-head {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }

  .pack-name {
    font-family: var(--font-ui);
    font-size: var(--t-base);
    font-weight: 600;
  }

  /* The switch sits at the end of the head line and pulls in on the block axis only. It pulled in on
     the inline axis too, by more than the space around its track, so at 390px the track crossed the
     16px gutter; its hit area now ends at the card's edge. */
  .pack-head .switch {
    margin-block: calc(var(--sp-2) * -1);
  }

  .pack-name {
    margin-inline-end: auto;
  }

  /* OFF, AND STILL HERE. The contents dim; the switch and what stopped it do not, because they are
     what a person reads next. */
  .pack[data-off] :is(.pack-name, .pack-version, .pack-blurb, .pack-gives) {
    opacity: 0.55;
  }

  .pack-off {
    color: var(--dim);
    font-size: var(--t-xs);
    font-weight: 600;
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
    color: var(--dim);
    font-size: var(--t-xs);
    font-variant-numeric: tabular-nums;
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
  .pack > .pack-foot {
    grid-column: 2;
    grid-row: 2 / span 2;
    display: flex;
    gap: var(--sp-1);
    flex-wrap: wrap;
    justify-content: end;
    margin-inline-end: calc(var(--sp-3) * -1);
  }

  @media (width < 640px) {
    .pack {
      grid-template-columns: minmax(0, 1fr);
    }

    .pack > .pack-foot {
      grid-column: 1;
      grid-row: auto;
      justify-content: start;
      margin-inline: calc(var(--sp-3) * -1) 0;
    }
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
    /* UNBOXED, as every other list is: the row's own inline padding, so the words line up with the row
       above them instead of a sunk panel wider than the row it opened from. */
    padding: var(--sp-2) var(--sp-3) var(--sp-3);
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

  /* ONE COLUMN ON A PHONE: beside a label as wide as "Calls other services", each line wrapped to four. */
  @media (width < 640px) {
    .diff {
      grid-template-columns: minmax(0, 1fr);
    }

    .diff dd + dt {
      margin-block-start: var(--sp-2);
    }
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

  .offer-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    padding: 0 var(--sp-3) var(--sp-3);
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
      padding: var(--sp-4) var(--gutter) var(--sp-8);
    }
  }
</style>
