<!--
  Add-ons (`loop/finish/platform.md` PLT-4): three tabs, Installed, Updates and "Install from…".

  A pack declares CONTENT AND IDENTITY, never position or visibility. That is Chrome's line, stated most plainly of
  anyone: extension actions are unpinned by default, and `isOnToolbar` is exposed to the extension READ-ONLY. There is
  no `default_area` and no auto-pin (19 §3).

  EVERY INSTALL AND EVERY UPDATE IS READ ON ONE PLAN SHEET (`$lib/market/PlanSheet.svelte`), the record's own plan drawn
  whole: what it adds, changes and takes away with the rows each keeps, which of the owner's edits it carries over, and
  every line it calls out with. `04 §3`: "The diff is shown before it applies … this is the entire trust model." The
  owner in a browser approves it there; anybody else is refused by the record, and the same plan is filed on Decide.

  BROWSING IS `/packs/browse`. This screen used to list what could still be installed under what was, with a guess at
  what each would add; the plan now comes from the record, so it is read where the listing is.
-->
<script lang="ts">
  import { apiBase, at } from '$lib/at.ts';
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { createClient } from '@braindog/client';
  import type { CatalogueEntry, CatalogueIndex, CatalogueUpdate, Trust } from '@braindog/declare/catalogue';
  import { builtInFile } from '@braindog/seed/usecases/share';
  import { moduleName, ruleName } from '@braindog/seed/usecases/names';
  /* THE MODULES THIS BUILD SHIPS, for their names, blurbs and lists, read off each one's own manifest and document. It
     was the sample's `PACKS`, which carried the same six and two add-ons nobody wrote (wave C1), then a hand copy with
     stale versions (USE-3). */
  import { firstPartyModules } from '@braindog/seed/packs/modules';
  import { titleOf } from '$lib/title.ts';
  import { copy } from '$lib/copy.ts';
  import * as pref from '$lib/pref.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { PAGES, REGISTERS } from '$lib/record/held.ts';
  import { METRICS } from '$lib/record/declared.ts';
  import type { Shell } from '$lib/record/boot-live.ts';
  import { blocked, choose, words as packWords, type Blocked, type PackState, type Refusal, type Source } from '$lib/record/packs.ts';
  import { read } from '$lib/data/record.ts';
  import { actionOf, listingsOf, type ListingKind } from '$lib/market/listing.ts';
  import PlanSheet from '$lib/market/PlanSheet.svelte';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { drew } from '../../lib/ui/screen.svelte.ts';
  import { hostedHere } from '../settings/billing.ts';
  import InstallShared from './InstallShared.svelte';
  import { browserStore, catalogueTitles, fileProposal, keepFirstKey, readHostCatalogue, trustForEntry, updatesFor } from './browse/catalogue.ts';
  import { askOnDecide, diffOf, install, notOwner, planFor, type OfferClient, type Planned } from './browse/[id]/offer.ts';
  import { words } from './words.ts';

  /* ── names ─────────────────────────────────────────────────────────────── */

  /* THE CATALOGUE CARRIES NAMES AND BLURBS; the record carries which packs there are and whether each is on. */
  const byId = new Map(firstPartyModules().map((p) => [p.id, p]));
  /* AN ADD-ON FROM THE KENNEL is not one of the modules, so its catalogue title names it, and its id only when neither knows it. */
  let catalogueNames = $state.raw<Map<string, string>>(new Map());
  /* A USE CASE'S PACK BY ITS USE CASE, "Solo founder", and a module by the name it goes by, never `usecase-founder`. */
  const nameOf = (id: string) => byId.get(id)?.name ?? catalogueNames.get(id) ?? moduleName(id);
  /* A LIST BY THE NAME THIS RECORD GIVES IT: `REGISTERS` holds what this tab has learnt of the record's declarations, and
     a use case's own lists read `datapoints` without the shell's names. */
  const listName = (r: string): string =>
    REGISTERS[r]?.name ??
    ((page.data.lists ?? []) as { id: string; name: string }[]).find((l) => l.id === r)?.name ??
    r.charAt(0).toUpperCase() + r.slice(1).replaceAll('_', ' ');
  /**
   * What the plan sheet names: a declaration id (`register.money`, `page.home`, `metric.cash`, `rule.chase`) by the name
   * this record gives it, and anything else as a pack. The sheet puts the id in words when this knows nothing better.
   */
  const planName = (id: string): string => {
    const dot = id.indexOf('.');
    const kind = dot < 0 ? '' : id.slice(0, dot);
    const bare = id.slice(dot + 1);
    if (kind === 'register') return listName(bare);
    if (kind === 'page') return PAGES[bare]?.title ?? bare;
    if (kind === 'metric') return METRICS[bare]?.name ?? bare;
    if (kind === 'rule') return ruleName(bare) ?? bare;
    return nameOf(id);
  };
  const hosted = $derived(hostedHere(page.data as unknown as Shell));

  /* ── the record ────────────────────────────────────────────────────────── */

  let states = $state<PackState[] | null>(null);
  let refused = $state<Refusal | null>(null);
  let blocks = $state<Record<string, Blocked>>({});
  let busy = $state<string | null>(null);
  let source: Source | null = null;
  let client = $state.raw<OfferClient | null>(null);
  /** True once the record answered. Until then, and after a refusal, nothing below the refusal is drawn. */
  const live = $derived(states !== null);
  const installed = $derived(states ?? []);

  async function reread() {
    const again = await source?.packs();
    if (again?.ok) states = again.value;
  }

  /* ── the tabs ──────────────────────────────────────────────────────────── */

  const TABS = ['installed', 'updates', 'from'] as const;
  type Tab = (typeof TABS)[number];
  /* A LINK MAY OPEN ONE TAB, `/packs?tab=updates`, as the Updates badge elsewhere would. */
  let tab = $state<Tab>(TABS.find((t) => t === page.url.searchParams.get('tab')) ?? 'installed');

  /** Arrow keys move between tabs, as a tab list's do; focus follows the selection. */
  function tabKey(e: KeyboardEvent) {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) return;
    e.preventDefault();
    const next = TABS[(TABS.indexOf(tab) + step + TABS.length) % TABS.length] ?? 'installed';
    tab = next;
    document.getElementById(`packs-tab-${next}`)?.focus();
  }

  /* ── the plan sheet ────────────────────────────────────────────────────── */

  /** A plan somebody is reading: one install or update, or every update at once. `then` is what Approve does. */
  let sheet = $state.raw<{ diff: unknown; then: () => Promise<unknown> } | null>(null);

  function approveSheet() {
    const s = sheet;
    if (!s || busy !== null) return;
    busy = 'sheet';
    void s.then().finally(() => (busy = null));
  }

  /* ── installed ─────────────────────────────────────────────────────────── */

  /**
   * One press of a switch, or of the button a refusal offered.
   *
   * A REFUSAL STAYS ON THE ROW IT BELONGS TO, and a turn that succeeds clears the ones it answered: its own, and any row
   * that was waiting on the pack that just came back on.
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
      /* OFF IS UNDONE, NOT ASKED. Its lists leave the sidebar, which is easy to miss from here, and on is the same call
         over the same rows. The pack pressed comes back first, so a dependent that leans on it can follow. */
      if (!on && out.value.changed) {
        const went = [id, ...out.value.packs.filter((p) => p !== id)];
        toasts.push(copy.packTurnedOffNamed(went.map(nameOf)), { undo: () => void turnBack(went) });
      }
      blocks = Object.fromEntries(Object.entries(blocks).filter(([k, b]) => !turned.has(k) && !(b.kind === 'off' && turned.has(b.pack))));
      await reread();
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
      await reread();
    } finally {
      busy = null;
    }
  }

  /**
   * Undo for Uninstall: plan the module again and install that plan, which puts back its settings and schedules and
   * plants no second set of examples. One that calls other services opens its plan instead, because what it calls out
   * is approved by a press, never by an undo.
   */
  async function reinstall(id: string, name: string) {
    if (!client || busy !== null) return;
    const c = client;
    busy = id;
    try {
      await reread();
      const planned = await planFor(c, { kind: 'module', id, source: 'bundled' }, { doc: null, text: null }, installed, copy.packNotInstallable(name));
      if (!planned.ok) return void toasts.push(planned.fix, { intent: 'warn' });
      if (planned.planned.kind === 'pack' && planned.planned.approve.length > 0) {
        const p = planned.planned;
        sheet = { diff: diffOf(p), then: () => installOne(p, name, null).then(reread) };
        return void toasts.push(copy.reinstallApprove(name), { intent: 'warn' });
      }
      const out = await install(c, planned.planned, installed, pref.read().nav ?? [], copy.writeRaced);
      if (!out.ok) return void toasts.push(out.fix, { intent: 'warn' });
      toasts.push(copy.reinstalled(name), { intent: 'good' });
      await reread();
    } finally {
      busy = null;
    }
  }

  /**
   * Uninstall one. The record takes it out, and the list is read again, so what is drawn is what the record now holds.
   * NOT ASKED FIRST: the record keeps its settings and schedules for thirty days, so Undo installs it again.
   */
  async function uninstall(id: string, name: string) {
    if (!source || busy !== null) return;
    busy = id;
    try {
      const out = await source.uninstall(id);
      if (out.ok) toasts.push(copy.uninstalled(name), { intent: 'good', undo: () => void reinstall(id, name) });
      else toasts.push(out.refusal.code === 'VERSION_STALE' ? copy.writeRaced : out.refusal.fix, { intent: 'warn' });
      if (out.ok || out.refusal.code === 'VERSION_STALE') await reread();
    } finally {
      busy = null;
    }
  }

  /* ── updates ───────────────────────────────────────────────────────────── */

  /**
   * One listing with a newer version than this record holds: a module or a use case this build ships, or anything from
   * the Kennel, fetched and held to its checksum and signature before it is offered (`catalogue.ts` `updatesFor`).
   */
  type Update = {
    key: string;
    kind: ListingKind;
    id: string;
    title: string;
    from: string;
    to: string;
    source: 'bundled' | 'kennel';
    /** The file the plan is read from: a verified Kennel version, a built-in use case, or `null` for a module. */
    file: { doc: Record<string, unknown> | null; text: string | null };
    entry: CatalogueEntry | null;
    trust: Trust | null;
  };

  let kennel = $state.raw<CatalogueIndex | null>(null);
  let looked = $state(false);
  let updates = $state.raw<Update[] | null>(null);
  /** The Kennel's own sentence for each later version that did not verify, said quietly and never offered. */
  let unverified = $state.raw<string[]>([]);
  /** What the last press on a row said: a refusal, or where it was filed on Decide. */
  let said = $state<Record<string, { fix: string; code: string | null } | { filed: string }>>({});

  $effect(() => {
    const held = states;
    const index = kennel;
    if (!held || !looked) return;
    void updatesOf(held, index).then((found) => {
      if (states === held) updates = found;
    });
  });

  async function updatesOf(held: readonly PackState[], index: CatalogueIndex | null): Promise<Update[]> {
    const bundled = listingsOf({ kennel: null, counts: null }).flatMap((l): Update[] => {
      const a = actionOf(l, held);
      if (a.kind !== 'update') return [];
      const built = l.kind === 'usecase' ? builtInFile(l.id) : null;
      if (l.kind === 'usecase' && !built) return [];
      return [{ key: l.key, kind: l.kind, id: l.id, title: l.title, from: a.from, to: a.to, source: 'bundled', file: { doc: null, text: built ? JSON.stringify(built) : null }, entry: null, trust: null }];
    });
    if (!index) return bundled;
    const out = await updatesFor(fetch, index, held);
    unverified = out.refused;
    const store = browserStore();
    const fromKennel = await Promise.all(
      out.updates.map(async (u: CatalogueUpdate): Promise<Update> => ({
        key: `${u.entry.kind}:${u.entry.id}`,
        kind: u.entry.kind,
        id: u.entry.id,
        title: u.entry.title,
        from: u.from,
        to: u.to.version,
        source: 'kennel',
        file: { doc: u.file.kind === 'pack' ? u.file.file.doc : null, text: u.text },
        entry: u.entry,
        trust: await trustForEntry(store, u.entry, u.to.version, u.signature, index.keys),
      })),
    );
    const taken = new Set(fromKennel.map((u) => u.key));
    return [...bundled.filter((u) => !taken.has(u.key)), ...fromKennel];
  }

  /** The record's plan for one update, read now, so what is approved is what this record would do now. */
  async function planOf(u: Update): Promise<{ ok: true; planned: Planned } | { ok: false; fix: string; code: string | null }> {
    if (!client) return { ok: false, fix: copy.recordNotReached, code: null };
    return planFor(client, { kind: u.kind, id: u.id, source: u.source }, u.file, installed, copy.writeRaced);
  }

  /** See the plan for one update, on the sheet, with Approve installing that plan. */
  async function showPlan(u: Update) {
    if (busy !== null) return;
    busy = u.key;
    try {
      const out = await planOf(u);
      if (!out.ok) return void (said = { ...said, [u.key]: { fix: out.fix, code: out.code } });
      const p = out.planned;
      sheet = {
        diff: diffOf(p),
        then: async () => {
          await installOne(p, u.title, u);
          await reread();
        },
      };
    } finally {
      busy = null;
    }
  }

  /**
   * Install one plan that was shown. An update's key is kept on first use once it goes in; a refusal that says this
   * person may not install here files the same thing on Decide instead.
   */
  async function installOne(p: Planned, title: string, u: Update | null): Promise<boolean> {
    if (!client) return false;
    const out = await install(client, p, installed, pref.read().nav ?? [], copy.writeRaced);
    sheet = null;
    if (out.ok) {
      if (out.nav) pref.write({ nav: out.nav });
      if (u?.entry && u.trust) await keepFirstKey(browserStore(), u.key, u.trust);
      toasts.push(words.installed(title), { intent: 'good' });
      return true;
    }
    if (u && notOwner(out.code)) await askOwner(u, p);
    else if (u) said = { ...said, [u.key]: { fix: out.fix, code: out.code } };
    else toasts.push(out.fix, { intent: 'warn' });
    return false;
  }

  /** The same plan filed on Decide, for the owner: a Kennel version as its catalogue asks, a built-in as its file. */
  async function askOwner(u: Update, p: Planned) {
    if (!client) return;
    const c = client;
    if (u.entry) {
      const asked = await askOnDecide(c, u.entry, u.from);
      said = { ...said, [u.key]: asked.ok ? { filed: asked.id } : { fix: asked.fix, code: asked.code } };
      return;
    }
    const question = copy.catalogueQuestion(u.title, u.to, u.from, null);
    const body = p.kind === 'pack' ? { install: u.id, doc: p.doc } : { file: u.file.text ?? '' };
    const filed = await fileProposal((name, args) => c.call(name, args), { question, body_kind: 'pack', body });
    said = { ...said, [u.key]: filed.ok ? { filed: filed.id } : { fix: filed.fix, code: filed.code } };
  }

  /**
   * "Update all": every plan read first and shown on the one sheet, then installed in order on the one press.
   *
   * EACH IS PLANNED AGAIN JUST BEFORE IT GOES IN, because the record's version is in every plan's hash and the update
   * before it moved it. A plan that now asks to approve a calls-out line the sheet did not show stops the run there, and
   * that update opens on its own sheet to be read.
   */
  async function showAll() {
    const all = updates ?? [];
    if (busy !== null || all.length === 0) return;
    busy = 'all';
    try {
      const plans: { u: Update; p: Planned }[] = [];
      for (const u of all) {
        const out = await planOf(u);
        if (out.ok) plans.push({ u, p: out.planned });
        else said = { ...said, [u.key]: { fix: out.fix, code: out.code } };
      }
      if (plans.length === 0) return;
      const shown = new Set(plans.flatMap(({ p }) => (p.kind === 'pack' ? p.approve : p.plan.approve)));
      sheet = {
        diff: plans.map(({ p }) => diffOf(p)),
        then: async () => {
          let done = 0;
          for (const { u, p } of plans) {
            const fresh = done === 0 ? { ok: true as const, planned: p } : await planOf(u);
            if (!fresh.ok) {
              said = { ...said, [u.key]: { fix: fresh.fix, code: fresh.code } };
              break;
            }
            const asks = fresh.planned.kind === 'pack' ? fresh.planned.approve : fresh.planned.plan.approve;
            if (asks.some((line) => !shown.has(line))) {
              const again = fresh.planned;
              sheet = { diff: diffOf(again), then: () => installOne(again, u.title, u).then(reread) };
              break;
            }
            if (!(await installOne(fresh.planned, u.title, u))) break;
            done += 1;
          }
          if (done > 1) toasts.push(words.updated(done), { intent: 'good' });
          await reread();
        },
      };
    } finally {
      busy = null;
    }
  }

  /* ── reading ───────────────────────────────────────────────────────────── */

  /**
   * THE LIST IS THE RECORD'S, READ ONCE, and with no record to read it is the record's refusal and nothing else.
   *
   * `data-screen` on `<main id="main">` is what lets anything outside the page tell a drawn screen from a shell that has
   * fetched nothing. The read is bracketed by `read()`, so the attribute stays away while `packs` is out, and
   * `drew('ready')` is the claim for when it has come back.
   */
  onMount(() => {
    void readHostCatalogue(fetch).then(async (got) => {
      kennel = got.ok ? got.index : null;
      looked = true;
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
</script>

<svelte:head><title>{titleOf(copy.packs)}</title></svelte:head>

<PageHead icon="packs" title={copy.packs}>
  {#snippet actions()}<Button weight="quiet" href="/packs/browse">{words.browse}</Button>{/snippet}
</PageHead>

<div class="page">
  <!-- WHAT A PACK IS, SAID ONCE, WHERE THE WORD IS FIRST MET. -->
  <p class="blurb">{copy.packBlurb}</p>

  <div class="tabs segmented" role="tablist" aria-label={words.tabsLabel} tabindex="-1" onkeydown={tabKey}>
    {#each TABS as t (t)}
      <button
        type="button"
        role="tab"
        class="segment tab"
        id="packs-tab-{t}"
        aria-selected={tab === t}
        aria-controls="packs-panel"
        tabindex={tab === t ? 0 : -1}
        data-on={tab === t ? '' : undefined}
        onclick={() => (tab = t)}
      >
        {words.tabs[t]}{#if t === 'updates' && updates && updates.length > 0}<span class="tab-count">{updates.length}</span>{/if}
      </button>
    {/each}
  </div>

  <div class="panel" id="packs-panel" role="tabpanel" aria-labelledby="packs-tab-{tab}">
    {#if refused}
      <Empty kind="error" title={refused.fix}>
        {#snippet actions()}<Button onclick={() => location.reload()}>{copy.tryAgain}</Button>{/snippet}
      </Empty>
    {:else if tab === 'installed'}
      {@render installedTab()}
    {:else if tab === 'updates'}
      {@render updatesTab()}
    {:else}
      <InstallShared {client} {installed} nameOf={planName} oninstalled={() => void reread()} />
    {/if}
  </div>
</div>

{#snippet installedTab()}
  <!-- A RECORD WITH NOTHING INSTALLED IS THE ORDINARY FIRST STATE OF THIS SCREEN, and the sentence points at browse. -->
  {#if states && installed.length === 0}
    <Empty kind="no-data-yet" title={copy.noPacksYet} body={copy.noPacksBody} />
  {/if}
  <div class="rows">
    {#each installed as state (state.id)}
      {@const pack = byId.get(state.id)}
      {@const off = state.disabled_at !== null}
      {@const block = blocks[state.id]}
      <!-- OFF IS DIMMED AND SAID, NEVER ABSENT. Its rows are still in the record, and this row is the only way back to them. -->
      <article class="pack" data-off={off ? '' : undefined}>
        <header class="pack-head">
          <h2 class="pack-name">{nameOf(state.id)}</h2>
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
          {#each state.registers as r (r)}<li><Icon name="rows" size="s" />{listName(r)}</li>{/each}
          {#each pack?.pages ?? [] as p (p)}<li><Icon name="doc" size="s" />{PAGES[p]?.title ?? p}</li>{/each}
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
          <Button weight="bare" href="/packs/{state.id}">{packWords.settings}</Button>
          {#if pack}
            <Button weight="bare" tone="bad" disabled={busy !== null} onclick={() => uninstall(state.id, pack.name)}>{copy.uninstall}</Button>
          {/if}
        </footer>
      </article>
    {/each}
  </div>
  {#if live}<p class="aside"><a class="tap" href={at('/packs/share')}>{copy.shareSetup}</a></p>{/if}
{/snippet}

{#snippet updatesTab()}
  {#if !updates}
    <p class="aside" role="status">{words.updatesReading}</p>
  {:else if updates.length === 0}
    <Empty kind="cleared" title={words.updatesNone} body={words.updatesNoneBody} />
  {:else}
    <div class="all">
      <Button weight="primary" disabled={busy !== null || !client} onclick={() => void showAll()}>{busy === 'all' ? words.planning : words.updateAll}</Button>
    </div>
    <ul class="rows">
      {#each updates as u (u.key)}
        {@const s = said[u.key]}
        <li class="pack update">
          <header class="pack-head">
            <h2 class="pack-name">{u.title}</h2>
            <span class="pack-version">{words.fromTo(u.from, u.to)}</span>
          </header>
          <footer class="pack-foot">
            <Button weight="quiet" disabled={busy !== null || !client} onclick={() => void showPlan(u)}>{busy === u.key ? words.planning : words.seePlan}</Button>
          </footer>
          {#if s && 'filed' in s}
            <p class="pack-said" role="status">{words.asked}{#if s.filed}{' '}<a class="tap" href={at(`/decide/${s.filed}`)}>{words.openDecide}</a>{/if}</p>
          {:else if s}
            <p class="pack-said" role="status">{s.fix}{#if s.code}<span class="code">{copy.refusalCode(s.code)}</span>{/if}</p>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
  {#each unverified as fix, i (i)}<p class="aside">{fix}</p>{/each}
{/snippet}

{#if sheet}
  {@const s = sheet}
  <PlanSheet diff={s.diff} nameOf={planName} {hosted} busy={busy !== null} onapprove={approveSheet} oncancel={() => (sheet = null)} />
{/if}

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
    padding: var(--sp-5) var(--gutter) var(--sp-9);
    max-inline-size: 1100px;
  }

  /* One sentence saying what the things on this screen are, in the person's words. */
  .blurb {
    max-inline-size: 62ch;
    color: var(--ink2);
    font-size: var(--t-ui);
    line-height: 1.6;
  }

  .tabs {
    align-self: start;
  }

  .tab-count {
    margin-inline-start: var(--sp-1);
    color: var(--dim);
    font-size: var(--t-xs);
    font-variant-numeric: tabular-nums;
  }

  .panel {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    min-inline-size: 0;
  }

  /* ROWS, NOT A WALL OF CARDS (DESIGN-SYSTEM APPENDIX C13): an add-on is a row, its name, version and switch on the first
     line, what it is under it, and its links at the trailing edge, with a hairline between rows as every list has. */
  .rows {
    display: flex;
    flex-direction: column;
    max-inline-size: var(--page-max);
    margin: 0;
    padding: 0;
    list-style: none;
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
    margin-inline-end: auto;
    font-family: var(--font-ui);
    font-size: var(--t-base);
    font-weight: 600;
  }

  /* The switch pulls in on the block axis only, so at 390px its track stays inside the 16px gutter. */
  .pack-head .switch {
    margin-block: calc(var(--sp-2) * -1);
  }

  /* OFF, AND STILL HERE. The contents dim; the switch and what stopped it do not, because they are what a person reads next. */
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

  .code {
    color: var(--dim);
    font-family: var(--font-id);
    font-size: var(--t-xs);
  }

  .pack-version {
    color: var(--dim);
    font-size: var(--t-xs);
    font-variant-numeric: tabular-nums;
  }

  .pack-blurb {
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

  /* THE BODY FACE. These are the names of lists and pages, which a person reads as words. */
  .pack-gives li {
    display: flex;
    align-items: center;
    gap: var(--sp-1);
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .pack > .pack-foot {
    grid-column: 2;
    grid-row: 2 / span 2;
    display: flex;
    gap: var(--sp-1);
    flex-wrap: wrap;
    justify-content: end;
    margin-inline-end: calc(var(--sp-3) * -1);
  }

  .update > .pack-foot {
    grid-row: 2;
  }

  .all {
    display: flex;
  }

  .aside {
    margin: 0;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  /* AT 390PX the tabs are one full-width segmented control, each tab a third of it, and every row is one column. */
  @media (width < 640px) {
    .tabs {
      align-self: stretch;
    }

    .tab {
      flex: 1 1 0;
      min-inline-size: 0;
    }

    .pack {
      grid-template-columns: minmax(0, 1fr);
    }

    .pack > .pack-foot {
      grid-column: 1;
      grid-row: auto;
      justify-content: start;
      margin-inline: calc(var(--sp-3) * -1) 0;
    }

    .update > .pack-foot {
      grid-row: auto;
    }
  }

  @media (width < 900px) {
    .page {
      padding: var(--sp-4) var(--gutter) var(--sp-8);
    }
  }
</style>
