<!--
  Add-ons: three tabs, Installed, Updates and "Install from…".

  A pack declares CONTENT AND IDENTITY, never position or visibility. That is Chrome's line, stated most plainly of
  anyone: extension actions are unpinned by default, and `isOnToolbar` is exposed to the extension READ-ONLY. There is
  no `default_area` and no auto-pin (19 §3).

  EVERY INSTALL AND EVERY UPDATE IS READ ON ONE PLAN SHEET (`$lib/market/PlanSheet.svelte`), the record's own plan drawn
  whole: what it adds, changes and takes away with the rows each keeps, which of the owner's edits it carries over, and
  every line it calls out with. `04 §3`: "The diff is shown before it applies … this is the entire trust model." The
  owner in a browser approves it there; anybody else is refused by the record, and the same plan is filed on Decide.

  BROWSING IS `/packs/browse`. This screen used to list what could still be installed under what was, with a guess at
  what each would add; the plan now comes from the record, so it is read where the listing is.

  THE LOOK: the three tabs are a glass segmented control in the title row's toolbar, beside Browse, and
  the sentence under the title says how many are installed and how many have an update, in ink (an update is never
  urgent). Installed leads with one tile, what the add-ons hold between them as a stacked bar of lists, pages and rules
  with its reading line; then the add-ons themselves as 56px rows on the ground, each with its own place's glyph (`glyph.ts`), its switch,
  and its "…" on hover. The counts are read from each add-on's own document (`$lib/market/adds.ts`), the reader the
  plan sheet's summary uses, and a list is counted from what the record says the add-on holds.
-->
<script lang="ts">
  import { apiBase, at } from '$lib/at.ts';
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { createClient } from '@braindog/client';
  import type { CatalogueEntry, CatalogueIndex, CatalogueUpdate, Trust } from '@braindog/declare/catalogue';
  import { useCase } from '@braindog/seed/usecases';
  import { builtInFile } from '@braindog/seed/usecases/share';
  import { moduleName } from '@braindog/seed/usecases/names';
  /* THE MODULES THIS BUILD SHIPS, for their names, blurbs and lists, read off each one's own manifest and document. It
     was the sample's `PACKS`, which carried the same six and two add-ons nobody wrote, then a hand copy with
     stale versions. */
  import { firstPartyModules } from '@braindog/seed/packs/modules';
  import { titleOf } from '$lib/title.ts';
  import { copy } from '$lib/copy.ts';
  import * as pref from '$lib/pref.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { PAGES, REGISTERS } from '$lib/record/held.ts';
  import type { Shell } from '$lib/record/boot-live.ts';
  import { blocked, choose, packDocument, words as packWords, type Blocked, type PackState, type Refusal, type Source } from '$lib/record/packs.ts';
  import { read } from '$lib/data/record.ts';
  import { addsOf } from '$lib/market/adds.ts';
  import type { ListingKind } from '$lib/market/listing.ts';
  import PlanSheet from '$lib/market/PlanSheet.svelte';
  import { handsOf, holderFirst, inOrder, marked, orderWords } from '$lib/market/update-order.ts';
  import { words as market } from '$lib/market/words.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import Menu from '$lib/ui/Menu.svelte';
  import Section from '$lib/ui/Section.svelte';
  import Segmented from '$lib/ui/Segmented.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import Stacked from '$lib/viz/Stacked.svelte';
  import { drew } from '../../lib/ui/screen.svelte.ts';
  import { hostedHere } from '../settings/billing.ts';
  import InstallShared from './InstallShared.svelte';
  import { browserStore, catalogueTitles, fileProposal, keepFirstKey, readHostCatalogue, trustForEntry, updatesFor } from './browse/catalogue.ts';
  import { askOnDecide, diffOf, install, notOwner, planFor, type OfferClient, type Planned } from './browse/[id]/offer.ts';
  import { words } from './words.ts';
  import { glyphOf } from './glyph.ts';
  /* WHAT BRAINDOG ITSELF HAS IMPROVED, read from the one place Decide reads it too, so the Updates tab and the card on
     Decide never disagree about what waits. */
  import { declarationName, firstPartyUpdates } from '../decide/improved.ts';

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
  /* A PAGE BY ITS TITLE, and one this tab has not read yet by its address put in words, never `money-overview`. */
  const pageName = (p: string): string => PAGES[p]?.title ?? p.charAt(0).toUpperCase() + p.slice(1).replaceAll(/[-_]/g, ' ');
  /**
   * What the plan sheet names: a declaration id (`register.money`, `page.home`, `metric.cash`, `rule.chase`) by the name
   * this record gives it, and anything else as a pack. The sheet puts the id in words when this knows nothing better.
   */
  const planName = (id: string): string => declarationName(id, (page.data.lists ?? []) as { id: string; name: string }[], nameOf);
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
   * THE ADD-ON WHOSE CONTENTS THE SHEET IS SHOWING. A row says what an add-on is in one line; what it brings, list by
   * list and page by page, is a press on its "…" away, so the list stays one row per add-on at every width.
   */
  let addsFor = $state<string | null>(null);
  let addsOpen = $state(false);
  const addsState = $derived(installed.find((s) => s.id === addsFor) ?? null);

  function showAdds(id: string) {
    addsFor = id;
    addsOpen = true;
  }

  /** The second line of a row: off said as off, else what the add-on or its use case is for, else the lists it keeps. */
  const lineOf = (state: PackState): string =>
    state.disabled_at !== null
      ? copy.packTurnedOff
      : (byId.get(state.id)?.blurb ?? (state.id.startsWith('usecase-') ? useCase(state.id.slice('usecase-'.length))?.summary : undefined) ?? state.registers.map(listName).join(', '));

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
  /**
   * What the last press on a row said: a refusal, or where it was filed on Decide. `first` is the update to take before
   * this one, by its key, when this one waits on what that one hands over (`update-order.ts`).
   */
  let said = $state<Record<string, { fix: string; code: string | null; first?: string } | { filed: string }>>({});

  $effect(() => {
    const held = states;
    const index = kennel;
    if (!held || !looked) return;
    void updatesOf(held, index).then((found) => {
      if (states === held) updates = found;
    });
  });

  async function updatesOf(held: readonly PackState[], index: CatalogueIndex | null): Promise<Update[]> {
    const bundled = firstPartyUpdates(held).map((u): Update => ({ key: u.key, kind: u.kind, id: u.id, title: u.title, from: u.from, to: u.to, source: 'bundled', file: u.file, entry: null, trust: null }));
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

  /**
   * See the plan for one update, on the sheet, with Approve installing that plan.
   *
   * AN UPDATE THAT WAITS ON ANOTHER OPENS NO SHEET IT CANNOT APPROVE. When the record would refuse it over something
   * another waiting update hands to it, the row says so and offers that update's plan instead.
   */
  async function showPlan(u: Update) {
    if (busy !== null) return;
    busy = u.key;
    try {
      const out = await planOf(u);
      if (!out.ok) return void (said = { ...said, [u.key]: { fix: out.fix, code: out.code } });
      const p = out.planned;
      const holder = holderFirst(diffOf(p), (updates ?? []).filter((o) => o.key !== u.key));
      if (holder) return void (said = { ...said, [u.key]: waitsOn(p, u, holder) });
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

  /** The row's sentence for an update that goes in after `holder`'s: what moves, by its name, and from whom. */
  function waitsOn(p: Planned, u: Update, holder: Update): { fix: string; code: string | null; first: string } {
    const conflicts = p.kind === 'pack' && typeof p.diff === 'object' && p.diff !== null && 'conflicts' in p.diff && Array.isArray(p.diff.conflicts) ? (p.diff.conflicts as { id?: unknown }[]) : [];
    const handed = Object.keys(handsOf(holder.file));
    const id = conflicts.map((c) => (typeof c?.id === 'string' ? c.id : '')).find((c) => handed.includes(c)) ?? '';
    /* A NAME, NEVER AN ID: a figure this build holds no name for is its id read as words, as the sheet reads it. */
    const bare = id.slice(id.indexOf('.') + 1);
    const known = planName(id);
    const what = known !== bare && known !== id ? known : (bare.charAt(0).toUpperCase() + bare.slice(1)).replace(/[_-]/gu, ' ');
    return { fix: orderWords.waits(u.title, what, holder.title), code: 'PROVIDES_CONFLICT', first: holder.key };
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
   *
   * A HOLDER GOES IN BEFORE THE ONE IT HANDS TO (`inOrder`), and the one that waits is drawn as going in after it
   * rather than as a stop (`marked`): by the time it is planned again the holder has landed. One the holder's own plan
   * already brought to its version is passed over, since there is nothing left of it to install.
   */
  async function showAll() {
    const all = inOrder(updates ?? []);
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
        diff: plans.map(({ p }) => marked(diffOf(p), all, plans.map((x) => x.u))),
        then: async () => {
          let done = 0;
          for (const { u, p } of plans) {
            const fresh = done === 0 ? { ok: true as const, planned: p } : await planOf(u);
            if (!fresh.ok) {
              said = { ...said, [u.key]: { fix: fresh.fix, code: fresh.code } };
              break;
            }
            if (done > 0 && landed(fresh.planned)) continue;
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

  /** A plan for a version the record already holds: an earlier update of the same run brought it in. */
  function landed(p: Planned): boolean {
    if (p.kind !== 'pack' || typeof p.diff !== 'object' || p.diff === null) return false;
    const d = p.diff as { installed_version?: unknown; pack?: { version?: unknown } };
    return typeof d.installed_version === 'string' && d.installed_version === d.pack?.version;
  }

  /* ── what they hold ────────────────────────────────────────────────────── */

  /**
   * What each installed add-on holds: its lists as the record counts them (`registers`), and its pages and rules read
   * from its own document by `addsOf`, the reader the plan sheet's summary uses. A module's document is the seed's,
   * loaded here after the list is drawn; a built-in use case's is its own file; an add-on from the Kennel is read off the
   * catalogue's reach for the version installed. One with no document to read counts its lists and nothing else, so the
   * tile never says a page or a rule it cannot see.
   */
  type Holds = { id: string; lists: number; pages: number; rules: number };
  let holds = $state.raw<Holds[] | null>(null);

  $effect(() => {
    const held = states;
    const index = kennel;
    if (!held || !looked) return;
    void holdsOf(held, index).then((found) => {
      if (states === held) holds = found;
    });
  });

  const documentOf = async (id: string): Promise<unknown> =>
    byId.has(id) ? packDocument(id) : id.startsWith('usecase-') ? builtInFile(id.slice('usecase-'.length)) : null;

  async function holdsOf(held: readonly PackState[], index: CatalogueIndex | null): Promise<Holds[]> {
    return Promise.all(
      held.map(async (s): Promise<Holds> => {
        const doc = await documentOf(s.id).catch(() => null);
        if (doc) {
          const a = addsOf(doc);
          return { id: s.id, lists: s.registers.length, pages: a.pages.length, rules: a.rules.length };
        }
        const entry = index?.entries.find((e) => e.kind === 'pack' && e.id === s.id);
        const reach = (entry?.versions.find((v) => v.version === s.version) ?? entry?.versions[0])?.reach;
        return { id: s.id, lists: s.registers.length, pages: reach?.pages.length ?? 0, rules: reach?.rules.length ?? 0 };
      }),
    );
  }

  /** The tile's chart and its one line, or `null` when there is nothing to draw. */
  const holding = $derived.by(() => {
    if (!holds || holds.length === 0) return null;
    const sum = (k: 'lists' | 'pages' | 'rules') => holds!.reduce((n, h) => n + h[k], 0);
    const all = [
      { label: words.holdsLists(sum('lists')), value: sum('lists') },
      { label: words.holdsPages(sum('pages')), value: sum('pages') },
      { label: words.holdsRules(sum('rules')), value: sum('rules') },
    ].filter((p) => p.value > 0);
    if (all.length === 0) return null;
    /* THE LARGEST IS NAMED ONLY WHEN IT IS ONE: a tie names nobody. */
    const size = (h: Holds) => h.lists + h.pages + h.rules;
    const top = [...holds].sort((a, b) => size(b) - size(a));
    const first = top[0];
    const largest = first && holds.length > 1 && size(first) > size(top[1] ?? { id: '', lists: 0, pages: 0, rules: 0 }) ? nameOf(first.id) : null;
    return { parts: all, line: words.holds(all.map((p) => p.label), holds.length === 1, largest) };
  });

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

<PageHead icon="packs" title={copy.packs} count={live ? installed.length : undefined} sentence={live ? words.sentence(installed.length, updates ? updates.length : null) : undefined}>
  {#snippet actions()}
    <!-- THE TABS ARE THE TOOLBAR'S SEGMENTED CONTROL, glass on the ground, and a tab list still: the arrows
         move between them and the panel they control is the content under the title. -->
    <Segmented class="tabs" role="tablist" aria-label={words.tabsLabel} tabindex={-1} onkeydown={tabKey}>
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
          {words.tabs[t]}{#if t === 'updates' && updates && updates.length > 0}<span class="tab-count num">{updates.length}</span>{/if}
        </button>
      {/each}
    </Segmented>
    <Button weight="glass" href="/packs/browse"><Icon name="search" size="s" />{words.browse}</Button>
  {/snippet}
</PageHead>

<div class="page">
  <div class="tabpanel" id="packs-panel" role="tabpanel" aria-labelledby="packs-tab-{tab}">
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
  <!-- A RECORD WITH NOTHING INSTALLED IS THE ORDINARY FIRST STATE OF THIS SCREEN: what an add-on is, and the one press
       that finds one. -->
  {#if states && installed.length === 0}
    <Empty kind="no-data-yet" glyph="packs" title={copy.noPacksYet} body={copy.packBlurb}>
      {#snippet actions()}<Button href="/packs/browse">{words.browse}</Button>{/snippet}
    </Empty>
  {/if}

  <!-- WHAT THEY HOLD BETWEEN THEM: one tile, its chart and the line reading it. Drawn once every add-on's document has
       been read, and not at all when there is nothing to count. -->
  {#if holding}
    <Tile icon="packs" title={words.holdsTitle}>
      <Stacked parts={holding.parts} subject={words.holdsTitle} summary={holding.line} />
      <p class="reading">{holding.line}</p>
    </Tile>
  {/if}

  {#if installed.length > 0}
    <!-- ONE ROW PER ADD-ON: its well, its name and one line, its switch, and one "…" holding Settings,
         What this adds and Uninstall, destructive last. On the ground, no box, a hairline between rows. -->
    <Section title={words.installedTitle} count={installed.length}>
      {#snippet aside()}<Button weight="bare" size="sm" href="/packs/share">{copy.shareSetup}</Button>{/snippet}
      <ul class="ledger addons">
        {#each installed as state (state.id)}
          {@const pack = byId.get(state.id)}
          {@const off = state.disabled_at !== null}
          {@const block = blocks[state.id]}
          {@const name = nameOf(state.id)}
          <!-- OFF IS SAID, NEVER ABSENT. Its rows are still in the record, and this row is the only way back to them. A row
               a refusal is waiting on keeps its verbs showing (`data-needs`). -->
          <li class="addon-row" data-off={off ? '' : undefined} data-needs={block ? '' : undefined}>
            <div class="line addon">
              <span class="line-mark"><IconWell name={glyphOf(byId.get(state.id)?.pages, page.data.nav ?? [])} size="l" /></span>
              <a class="addon-main" href={at(`/packs/${state.id}`)}>
                <span class="line-title addon-name">{name}</span>
                <span class="line-detail addon-line">{lineOf(state)}</span>
              </a>
              <span class="line-verbs">
                <Menu label={market.more(name)} align="end">
                  {#snippet trigger()}<span class="more"><Icon name="more" size="m" /><span class="vh">{market.more(name)}</span></span>{/snippet}
                  <a class="mi" role="menuitem" href={at(`/packs/${state.id}`)}><Icon name="settings" size="s" />{packWords.settings}</a>
                  <button type="button" class="mi" role="menuitem" onclick={() => showAdds(state.id)}><Icon name="eye" size="s" />{copy.installDiff}</button>
                  {#if pack}
                    <button type="button" class="mi" role="menuitem" data-tone="bad" disabled={busy !== null} onclick={() => uninstall(state.id, pack.name)}><Icon name="trash" size="s" />{copy.uninstall}</button>
                  {/if}
                </Menu>
              </span>
              <!-- THE SWITCH IS LAST, on the tile's own edge, so six of them make one column down the right of the tile.
                   It sat inside the "…" that only shows under the pointer, 45px in from the edge with nothing after it. -->
              <button
                type="button"
                class="switch"
                role="switch"
                aria-checked={!off}
                aria-label={copy.packSwitch(name)}
                disabled={busy !== null}
                onclick={() => turn(state.id, off)}
              ><span class="switch-track"></span></button>
              <!-- WHAT STOPPED THE SWITCH, AND THE ONE THING TO PRESS NEXT. The cascade is that press, never the first. -->
              {#if block}
                <p class="addon-said" role="status">
                  {#if block.kind === 'required'}
                    <span>{copy.packNeededBy(block.also.map(nameOf))}</span>
                    <Button size="sm" tone="bad" disabled={busy !== null} onclick={() => turn(block.id, false, block.also)}>{copy.packOffTogether(block.also.length)}</Button>
                  {:else if block.kind === 'scopes'}
                    <span>{copy.packScopesInUse(block.registers.map(listName))}</span>
                  {:else if block.kind === 'off'}
                    <span>{copy.packIsOff(nameOf(block.pack))}</span>
                    <Button size="sm" disabled={busy !== null} onclick={() => turn(block.pack, true)}>{copy.packTurnOn(nameOf(block.pack))}</Button>
                  {:else}
                    <span>{block.fix}</span>
                  {/if}
                </p>
              {/if}
            </div>
          </li>
        {/each}
      </ul>
    </Section>
  {/if}

  <!-- WHAT ONE ADD-ON BRINGS, each list and page a row that opens it. Settings says the same on the add-on's own page. -->
  <Sheet bind:open={addsOpen} title={copy.installDiff} subtitle={addsState ? nameOf(addsState.id) : undefined} onclose={() => (addsFor = null)}>
    {#if addsState}
      {@const pages = byId.get(addsState.id)?.pages ?? []}
      {#if addsState.registers.length + pages.length === 0}
        <p class="aside">{market.addsNothing}</p>
      {:else}
        <ul class="ledger adds">
          {#each addsState.registers as r (r)}
            <li><a class="line adds-row" href={at(`/r/${r}`)}><span class="line-mark"><IconWell name="rows" size="l" /></span><span class="line-title">{listName(r)}</span></a></li>
          {/each}
          {#each pages as p (p)}
            <li><a class="line adds-row" href={at(`/p/${p}`)}><span class="line-mark"><IconWell name="doc" size="l" /></span><span class="line-title">{pageName(p)}</span></a></li>
          {/each}
        </ul>
      {/if}
    {/if}
  </Sheet>
{/snippet}

{#snippet updatesTab()}
  {#if !updates}
    <p class="aside" role="status">{words.updatesReading}</p>
  {:else if updates.length === 0}
    <Empty kind="cleared" title={words.updatesNone} body={words.updatesNoneBody} />
  {:else}
    <!-- THE SAME ROW AS AN INSTALLED ADD-ON: its well, its name, the versions it moves between in its tooltip, and its one
         press, which reads the plan. "Update all" is the screen's one primary, at the group's heading. -->
    <Section title={words.updatesTitle} count={updates.length}>
      {#snippet aside()}
        <Button weight="primary" disabled={busy !== null || !client} onclick={() => void showAll()}>{busy === 'all' ? words.planning : words.updateAll}</Button>
      {/snippet}
      <ul class="ledger addons">
        {#each updates as u (u.key)}
          {@const s = said[u.key]}
          <li class="addon-row">
            <div class="line addon update">
              <span class="line-mark"><IconWell name="refresh" size="l" /></span>
              <span class="addon-main">
                <span class="line-title addon-name">{u.title}</span>
                <span class="line-detail addon-line" title={words.fromTo(u.from, u.to)}>{words.updateAvailable}</span>
              </span>
              <Button size="sm" disabled={busy !== null || !client} onclick={() => void showPlan(u)}>{busy === u.key ? words.planning : words.seePlan}</Button>
              {#if s && 'filed' in s}
                <p class="addon-said" role="status">{words.asked}{#if s.filed}{' '}<a class="tap" href={at(`/decide/${s.filed}`)}>{words.openDecide}</a>{/if}</p>
              {:else if s}
                {@const first = s.first ? updates.find((o) => o.key === s.first) : undefined}
                <p class="addon-said" role="status" title={s.code ? copy.refusalCode(s.code) : undefined}>
                  {s.fix}
                  {#if first}{' '}<Button size="sm" disabled={busy !== null || !client} onclick={() => void showPlan(first)}>{orderWords.first(first.title)}</Button>{/if}
                </p>
              {/if}
            </div>
          </li>
        {/each}
      </ul>
    </Section>
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
    gap: var(--tile-gap);
    padding: var(--sp-4) var(--gutter) var(--sp-9);
  }

  /* NOT `.panel`, which `blocks.css` draws as a page block's box: the tab's content sits straight on the ground. ITS
     TILES ARE 12 APART, the board's one gap (`--tile-gap`), as on every other screen; they were 32. */
  .tabpanel {
    display: flex;
    flex-direction: column;
    gap: var(--tile-gap);
    min-inline-size: 0;
  }

  /* THE TABS IN THE TOOLBAR. The count on Updates is a plain number in the quiet ink: an update
     does not need him, so it is never the red square. */
  .tab {
    white-space: nowrap;
  }

  .tab-count {
    margin-inline-start: var(--sp-1);
    color: var(--dim);
    font-variant-numeric: tabular-nums;
  }

  /* IN THE COMPACT BAR THE TABS DROP THEIR OWN GLASS, as the bar's buttons do: the bar is glass, and glass never holds
     glass. Only where the bar is drawn, from 900px up. */
  @media (width >= 900px) {
    :global(.head[data-under] .segmented.tabs) {
      background: transparent;
      box-shadow: none;
      backdrop-filter: none;
    }

    /* Safari before 18 knows the blur only by its prefixed name, and lightningcss folds a same-rule pair into one. */
    @supports (-webkit-backdrop-filter: none) {
      :global(.head[data-under] .segmented.tabs) {
        -webkit-backdrop-filter: none;
      }
    }
  }

  /* THE TILE'S ONE LINE: what the chart means, in the body size under it. */
  .reading {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-base);
    line-height: 20px;
  }

  /**
   * AN ADD-ON'S ROW: the 32px well, the name over its line, the switch, and the "…" at the trailing edge, 56 tall on the
   * ground. Its own grid rather than the list's id column, because a row here is a thing with a switch
   * and not a line of a register; the wash, the hairline and the verbs' show-on-hover are the shared `rows.css` ones.
   */
  .addon {
    grid-template-columns: var(--well-l) minmax(0, 1fr) auto auto;
    column-gap: var(--sp-3);
    row-gap: 0;
    min-block-size: var(--row-h-2);
  }

  .update {
    grid-template-columns: var(--well-l) minmax(0, 1fr) auto;
  }

  /* THE TRACK ENDS ON THE ROW'S EDGE AT EVERY TARGET SIZE: under a thumb the button is 44 wide round a 36px track, and
     centred in it the track would sit four pixels inside the edge the tile's other rows end on. */
  .addon > .switch {
    justify-items: end;
  }

  /* THE NAME AND ITS LINE ARE ONE TARGET, the add-on's own page, so a thumb anywhere on the words opens it. */
  .addon-main {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-inline-size: 0;
    padding-block: var(--sp-1);
    color: inherit;
    text-decoration: none;
  }

  /* OFF, AND STILL HERE. The name steps down to secondary ink and the line says "Turned off"; nothing is faded below
     the contrast a person needs to read it, and the switch keeps full strength because it is the way back. Never red. */
  .addon-row[data-off] .addon-name {
    color: var(--ink2);
  }

  .more {
    display: inline-grid;
    place-items: center;
    inline-size: var(--ctl-h);
    block-size: var(--ctl-h);
    border-radius: var(--r-pill);
    color: var(--ink2);
    transition:
      background var(--d-state) var(--ease-out),
      color var(--d-state) var(--ease-out);
  }

  .vh {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* A MENU ROW: the menu draws its rhythm (32 tall, an icon and the word); the row keeps its own ink. */
  .mi {
    background: none;
    border: 0;
    color: var(--ink2);
    font: inherit;
    text-align: start;
    text-decoration: none;
    cursor: pointer;
  }

  .mi:hover,
  .mi:focus-visible {
    background: var(--hover-wash);
    color: var(--ink);
  }

  /* A DESTRUCTIVE VERB IS ITS WORDS IN INK: Uninstall is one more item, last in the menu, and never red. */

  /* WHAT STOPPED THE SWITCH sits under the name, across the rest of the row. */
  .addon-said {
    display: flex;
    grid-column: 2 / -1;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
    margin: 0;
    padding-block: 0 var(--sp-2);
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  /* WHAT ONE ADD-ON BRINGS, as rows in the sheet: a well and a name, each opening what it names. */
  .adds-row {
    grid-template-columns: var(--well-l) minmax(0, 1fr);
    column-gap: var(--sp-3);
  }

  .aside {
    margin: 0;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  /* A ROW THAT IS NOT ITSELF A LINK STILL TAKES THE WASH UNDER THE POINTER, and its hairlines step aside for it, as the
     shared rows' do. */
  @media (hover: hover) and (pointer: fine) {
    .addon:hover {
      background: var(--hover-wash);
    }

    .addons > li:has(> .addon:hover) > .addon::after,
    .addons > li:has(> .addon:hover) + li > .addon::after {
      opacity: 0;
    }

    .addon-main:hover .addon-name {
      text-decoration: underline;
      text-decoration-color: color-mix(in srgb, var(--ink) 40%, transparent);
      text-underline-offset: 3px;
    }

    .more:hover {
      background: var(--hover-wash);
      color: var(--ink);
    }
  }

  /* ON A PHONE the tabs take the toolbar's whole line, each a third of it, and a row's name is read at the phone's body
     size, as every row's first line is. */
  @media (width < 900px) {
    .page {
      padding: var(--sp-4) var(--gutter) var(--sp-8);
    }

    /* The track is `Segmented`'s own element, so the rule reaches it by this page's name for it. */
    :global(.segmented.tabs) {
      flex: 1 1 100%;
    }

    /* EACH TAB AS WIDE AS ITS WORD, the room left shared between them, so "Install from…" is never cut. */
    .tab {
      flex: 1 1 auto;
    }

    .addon {
      min-block-size: 60px;
    }

    .addon-name {
      font-size: var(--t-md);
    }
  }
</style>
