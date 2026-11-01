<!--
  Settings › Add-ons: what this record holds, any updates waiting at the top, and installing from a file or a link
  behind the area's "⋯". The store is `/addons`.

  A pack declares CONTENT AND IDENTITY, never position or visibility. That is Chrome's line, stated most plainly of
  anyone: extension actions are unpinned by default, and `isOnToolbar` is exposed to the extension READ-ONLY. There is
  no `default_area` and no auto-pin (19 §3).

  EVERY INSTALL AND EVERY UPDATE IS READ ON ONE PLAN SHEET (`$lib/market/PlanSheet.svelte`), the record's own plan drawn
  whole: what it adds, changes and takes away with the rows each keeps, which of the owner's edits it carries over, and
  every line it calls out with. `04 §3`: "The diff is shown before it applies … this is the entire trust model." The
  owner in a browser approves it there; anybody else is refused by the record, and the same plan is filed on Decide.

  BROWSING IS THE STORE, `/addons`. This screen used to list what could still be installed under what was, with a guess at
  what each would add; the plan now comes from the record, so it is read where the listing is.

  THE LOOK (agents F8): the name, the sentence saying how many are installed and how
  many have an update (in ink: an update is never urgent), then Installed | Browse under it, full width on a phone. Any
  updates lead in their own tile; then the add-ons themselves as rows in one tile, each with its own place's glyph
  (`glyph.ts`), its line, what it holds ("12 lists and 4 pages"), its "…" and its switch. What it holds is said by
  `$lib/market/describe.ts`, as the add-on's own page and the store say it.
-->
<script lang="ts">
  import { flip } from 'svelte/animate';
  import { dismiss, lineIn, springy } from '$lib/motion/index.ts';
  import { apiBase, at } from '$lib/at.ts';
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { createClient } from '@braindog/client';
  import type { CatalogueEntry, CatalogueIndex, CatalogueUpdate, Trust } from '@braindog/declare/catalogue';
  import { useCase } from '@braindog/seed/usecases';
  import { moduleName } from '@braindog/seed/usecases/names';
  /* THE MODULES THIS BUILD SHIPS, for their names, blurbs and lists, read off each one's own manifest and document. It
     was the sample's `PACKS`, which carried the same six and two add-ons nobody wrote, then a hand copy with
     stale versions. */
  import { firstPartyModules } from '@braindog/seed/packs/modules';
  import { copy } from '$lib/copy.ts';
  import * as pref from '$lib/pref.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { PAGES, REGISTERS } from '$lib/record/held.ts';
  import type { Shell } from '$lib/record/boot-live.ts';
  import { blocked, choose, words as packWords, type Blocked, type PackState, type Refusal, type Source } from '$lib/record/packs.ts';
  import { read } from '$lib/data/record.ts';
  import { describe, listingHolds, moduleHolds } from '$lib/market/describe.ts';
  import { listingsOf, STARTER_ICONS, type ListingKind } from '$lib/market/listing.ts';
  import PlanSheet from '$lib/market/PlanSheet.svelte';
  import { handsOf, holderFirst, inOrder, marked, orderWords } from '$lib/market/update-order.ts';
  import { words as market } from '$lib/market/words.ts';
  import { CORE_PACK, isCore, speakingPack } from '@braindog/declare';
  import { speakingPackNow } from '$lib/voice.svelte.ts';
  import { baseTurnedOn } from '$lib/market/shelves.ts';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import { isGlyph, type IconName } from '$lib/ui/icons.ts';
  import Menu from '$lib/ui/Menu.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import { STORE_AT } from './moved.ts';
  import { drew } from '../../lib/ui/screen.svelte.ts';
  import { hostedHere } from '../settings/billing.ts';
  import InstallShared from './InstallShared.svelte';
  import { catalogueLines, catalogueTitles, fileProposal, keepFirstKey, readHostCatalogue, readShippedCatalogue, trustForEntry, updatesFor, indexForUpdates, withheld } from './catalogue.ts';
  import { recordKeys } from './known-keys.ts';
  import { askOnDecide, diffOf, install, installInTurn, notOwner, planFor, turnWords, type Offered, type OfferClient, type Planned } from './[id]/offer.ts';
  import { installedCount, words } from './words.ts';
  import { glyphOf } from './glyph.ts';
  import { readRemoved, wayBack, type Removed } from './removed.ts';
  /* WHAT BRAINDOG ITSELF HAS IMPROVED, read from the one place Decide reads it too, so the Updates tab and the card on
     Decide never disagree about what waits. */
  import { declarationName, firstPartyUpdates } from '../decide/improved.ts';

  /* ── names ─────────────────────────────────────────────────────────────── */

  /* THE CATALOGUE CARRIES NAMES AND BLURBS; the record carries which packs there are and whether each is on. */
  const byId = new Map(firstPartyModules().map((p) => [p.id, p]));
  /* AN ADD-ON FROM THE KENNEL is not one of the modules, so its catalogue title names it, and its id only when neither knows it. */
  let catalogueNames = $state.raw<Map<string, string>>(new Map());
  /* AND ITS LINE, what the catalogue says it is for, where this build's modules do not know it. */
  let catalogueSays = $state.raw<Map<string, string>>(new Map());
  /* AND THE ICON ITS CATALOGUE ENTRY CARRIES, unlisted entries too, since an installed add-on is one a record holds by id. */
  let catalogueIcons = $state.raw<Map<string, string>>(new Map());
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
  /* THE PUBLISHER KEYS THIS RECORD HAS SEEN are the record's (`packs.known_keys`), so a key trusted on one device is
     known on every other, and a changed key is held back here as on the add-on's own page. */
  const keys = recordKeys((name, args) => (client ?? createClient({ base: apiBase() })).call(name, args));
  /** True once the record answered. Until then, and after a refusal, nothing below the refusal is drawn. */
  const live = $derived(states !== null);
  const installed = $derived(states ?? []);

  async function reread() {
    const again = await source?.packs();
    if (again?.ok) states = again.value;
    void readGone();
  }

  /* ── removed ───────────────────────────────────────────────────────────── */

  /* WHAT WAS UNINSTALLED INSIDE THE RECORD'S THIRTY DAYS (`packsRemoved`), read with the installed list and again after
     every uninstall, put back and install, because each moves what is listed. Its part is fetched only once there is
     something in it, so a record with nothing removed loads nothing more. A refusal is nothing removed. */
  let removed = $state.raw<Removed[]>([]);
  let RemovedPart = $state.raw<typeof import('./Removed.svelte').default | null>(null);
  const gone = $derived(removed.filter((r) => !installed.some((s) => s.id === r.id)));
  /* THE VERSION OF EACH MODULE THIS BUILD SHIPS, which is the one a module is put back at. */
  const shipped = new Map([...byId].map(([id, p]) => [id, p.version]));

  async function readGone() {
    const rows = await readRemoved(client);
    removed = rows;
    if (rows.length > 0 && !RemovedPart) RemovedPart = (await import('./Removed.svelte')).default;
  }

  /* ── install from a file or a link ─────────────────────────────────────── */

  /* OPENED FROM THE "⋯", or by a link that still says `/packs?tab=from` (it lands here with `?from`); it sits over the list until Done. An old
     `?tab=updates` lands on Installed, where the updates now lead. */
  let from = $state(page.url.searchParams.has('from'));

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

  /** An add-on nobody described says what it adds, in a sentence, and never lists names bare. */
  const listsLine = (names: readonly string[]): string =>
    names.length === 0 ? 'An add-on with no lists of its own.' : `Adds the ${names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`} ${names.length === 1 ? 'list' : 'lists'}.`;

  /** The second line of a row: off said as off, else what the add-on or its use case is for, else the lists it keeps. */
  const lineOf = (state: PackState): string =>
    state.disabled_at !== null
      ? copy.packTurnedOff
      : (byId.get(state.id)?.blurb ??
        (state.id.startsWith('usecase-') ? useCase(state.id.slice('usecase-'.length))?.summary : undefined) ??
        catalogueSays.get(state.id) ??
        listsLine(state.registers.map(listName)));

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
    const out = await bringBack(id, name);
    if (out.said) toasts.push(out.said, { intent: out.back ? 'good' : 'warn' });
  }

  /**
   * Put back, from the Removed part: the same plan and install as Undo. Once it is back the toast says so and the part
   * reads again; anything else, a refusal in the record's words or the plan to approve, is said on its row.
   */
  async function putBack(r: Removed, name: string): Promise<string | null> {
    const out = await bringBack(r.id, name);
    if (!out.back) return out.said || null;
    toasts.push(out.said, { intent: 'good' });
    return null;
  }

  /** The one way back for a module: `back` once it is in, and `said`, the line that says how it went. */
  async function bringBack(id: string, name: string): Promise<{ back: boolean; said: string }> {
    if (!client || busy !== null) return { back: false, said: '' };
    const c = client;
    busy = id;
    try {
      await reread();
      const planned = await planFor(c, { kind: 'module', id, source: 'bundled' }, { doc: null, text: null }, installed, copy.packNotInstallable(name));
      if (!planned.ok) return { back: false, said: planned.fix };
      if (planned.planned.kind === 'pack' && planned.planned.approve.length > 0) {
        const p = planned.planned;
        sheet = { diff: diffOf(p), then: () => installOne(p, name, null).then(reread) };
        return { back: false, said: copy.reinstallApprove(name) };
      }
      const out = await install(c, planned.planned, installed, pref.read().nav ?? [], copy.writeRaced);
      if (!out.ok) return { back: false, said: out.fix };
      await reread();
      return { back: true, said: copy.reinstalled(name) };
    } finally {
      busy = null;
    }
  }

  /**
   * Uninstall one. The record takes it out, and the list is read again, so what is drawn is what the record now holds.
   * NOT ASKED FIRST: the record keeps its settings and schedules for thirty days, so Undo installs it again.
   *
   * AN ADD-ON FROM THE STORE HAS NO UNDO IN THE TOAST: it comes back from its own page, where its file is checked and its
   * plan shown, and Removed below links there with Put back (`wayBack`). Its rows stay all the same.
   */
  async function uninstall(id: string, name: string) {
    if (!source || busy !== null) return;
    busy = id;
    try {
      const out = await source.uninstall(id);
      if (out.ok) toasts.push(copy.uninstalled(name), byId.has(id) ? { intent: 'good', undo: () => void reinstall(id, name) } : { intent: 'good' });
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
  /** The catalogue this build ships, read once: it names what the Kennel leaves out, and finds its updates. */
  const shippedIndex: Promise<CatalogueIndex | null> = readShippedCatalogue(fetch);
  let looked = $state(false);
  let updates = $state.raw<Update[] | null>(null);
  /** The Kennel's own sentence for each later version that did not verify, said quietly and never offered. */
  let unverified = $state.raw<string[]>([]);
  /**
   * What the last press on a row said: a refusal, or where it was filed on Decide. `first` is the update to take before
   * this one, by its key, when this one waits on what that one hands over (`update-order.ts`). `went` is the updates
   * a run put in before it stopped here, by title: they are in the record, so the row says so beside what it says.
   */
  let said = $state<Record<string, ({ fix: string; code: string | null; first?: string } | { filed: string }) & { went?: readonly string[] }>>({});

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
    /* AN ADD-ON HELD UNLISTED OR PRIVATE is looked for too, from the catalogue this build ships (`indexForUpdates`). */
    const out = await updatesFor(fetch, await indexForUpdates(index, await shippedIndex, held), held);
    unverified = out.refused;
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
        trust: await trustForEntry(keys, u.entry, u.to.version, u.signature, index.keys),
      })),
    );
    const taken = new Set(fromKennel.map((u) => u.key));
    /* AN UPDATE SIGNED BY A CHANGED, TAKEN BACK OR STRIPPED KEY is not offered (`withheld`). */
    return [...bundled.filter((u) => !taken.has(u.key)), ...fromKennel.filter((u) => !withheld(u.trust))];
  }

  /**
   * The record's plan for one update, read now, so what is approved is what this record would do now. `among` is what
   * else waits: handed in, a plan that waits on one of them comes back with that one's plan beside it (`afterOthers`).
   */
  async function planOf(u: Pick<Offered, 'kind' | 'id' | 'source' | 'file'> & { title?: string }, among?: readonly Update[]): Promise<{ ok: true; planned: Planned } | { ok: false; fix: string; code: string | null }> {
    if (!client) return { ok: false, fix: copy.recordNotReached, code: null };
    const listing = { kind: u.kind, id: u.id, source: u.source, ...(u.title === undefined ? {} : { title: u.title }) };
    return planFor(client, listing, u.file, installed, copy.writeRaced, among && (() => Promise.resolve(among)));
  }

  /**
   * See the plan for one update, on the sheet, with Approve installing that plan.
   *
   * AN UPDATE THAT WAITS ON ANOTHER TAKES IT ALONG, as "Update all" and the listing's own page do: the holder's plan and
   * this one are the one sheet, this one said as going in after it, and Approve puts them in in turn (`installTurn`).
   *
   * IT OPENS NO SHEET IT CANNOT APPROVE. A holder that cannot be taken along, one from the Kennel or one whose plan
   * cannot be read, is named on the row as the step to take first, with the press that opens its plan.
   */
  async function showPlan(u: Update) {
    if (busy !== null) return;
    busy = u.key;
    try {
      const out = await planOf(u, updates ?? []);
      if (!out.ok) return void (said = { ...said, [u.key]: { fix: out.fix, code: out.code } });
      const p = out.planned;
      const along = p.kind === 'pack' && p.after !== undefined && p.after.first.length > 0;
      const holder = along || p.kind !== 'pack' ? null : holderFirst(p.diff, (updates ?? []).filter((o) => o.key !== u.key));
      if (holder) return void (said = { ...said, [u.key]: waitsOn(p, u, holder) });
      sheet = {
        diff: diffOf(p),
        then: async () => {
          if (along) await installTurn(p, u);
          else await installOne(p, u.title, u);
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
      if (u?.entry && u.trust) await keepFirstKey(keys, u.key, u.trust);
      /* AND WHAT THE UPDATE CARRIED INTO A PAGE OR LIST HE CHANGED, in the record's own words (RJ6). */
      toasts.push([words.installed(title), ...(out.said ?? [])].join(' '), { intent: 'good' });
      return true;
    }
    if (u && notOwner(out.code)) await askOwner(u, p);
    else if (u) said = { ...said, [u.key]: { fix: out.fix, code: out.code } };
    else toasts.push(out.fix, { intent: 'warn' });
    return false;
  }

  /**
   * Install an update and the ones it goes in after, in turn, on the one press (`offer.ts` `installInTurn`): each
   * holder, then this one planned again, because only once the holder is in does this plan read clean.
   *
   * WHAT IT ENDS ON IS WHAT HAPPENED. Whole, it names this one and who went in before it, in the listing page's own
   * sentence (`turnWords.installedAfter`). Stopped, the row says what stopped it and nothing is said as good news: a
   * plan that now asks for a line nobody was shown (`turnWords.unread`) is read again from the row, since the holder
   * is in by then; a refusal that says this person may not install here files the refused one on Decide, and this
   * row says what it goes in after.
   *
   * A HOLDER THAT WENT IN IS NAMED WHATEVER STOPPED THE RUN (the refusal's `first`, `offer.ts`): its own row leaves on
   * the reread, so this row is the only place left to say the record moved. A refusal is said in the listing page's
   * sentence (`turnWords.stoppedAfter`); one filed on Decide keeps its own words and the row says who is in before them.
   */
  async function installTurn(p: Planned, u: Update): Promise<boolean> {
    if (!client || p.kind !== 'pack' || !p.after) return false;
    const c = client;
    const first = p.after.first;
    /* WHOSE TURN IT IS, and the plan it was last handed: the first holder's as shown, then each as it is planned again. */
    let at: Offered = first[0]?.of ?? p.after.self;
    let read: Planned = first[0]?.planned ?? p;
    const out = await installInTurn(p, {
      replan: async (o) => {
        at = o;
        const fresh = await planOf(o);
        if (fresh.ok) read = fresh.planned;
        return fresh;
      },
      install: (q) => {
        read = q;
        return install(c, q, installed, pref.read().nav ?? [], copy.writeRaced);
      },
    });
    sheet = null;
    if (out.ok) {
      if (out.nav) pref.write({ nav: out.nav });
      if (u.entry && u.trust) await keepFirstKey(keys, u.key, u.trust);
      toasts.push([out.first ? turnWords.installedAfter(u.title, out.first) : words.installed(u.title), ...(out.said ?? [])].join(' '), { intent: 'good' });
      return true;
    }
    const stopped = (updates ?? []).find((o) => o.key === at.key) ?? u;
    const went = out.first ?? [];
    if (notOwner(out.code)) {
      await askOwner(stopped, read);
      if (stopped.key !== u.key) said = { ...said, [u.key]: waitsOn(p, u, stopped) };
      const mine = said[u.key];
      if (mine && went.length > 0) said = { ...said, [u.key]: { ...mine, went } };
    } else said = { ...said, [u.key]: { fix: went.length > 0 ? turnWords.stoppedAfter(went, out.fix, out.stopped) : out.fix, code: out.code } };
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
   * already brought to its version is passed over, since there is nothing left of it to install, and is named in the
   * line the run ends on so the count never reads one short of what was pressed.
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
          /* A RUN THAT STOPPED SHORT ENDS ON WHAT STOPPED IT, never on good news: a refusal, or a plan that asks again. */
          let whole = false;
          const passed: string[] = [];
          for (const [i, { u, p }] of plans.entries()) {
            const fresh = done === 0 ? { ok: true as const, planned: p } : await planOf(u);
            if (!fresh.ok) {
              said = { ...said, [u.key]: { fix: fresh.fix, code: fresh.code } };
              break;
            }
            whole = i === plans.length - 1;
            if (done > 0 && landed(fresh.planned)) {
              passed.push(u.title);
              continue;
            }
            const asks = fresh.planned.kind === 'pack' ? fresh.planned.approve : fresh.planned.plan.approve;
            if (asks.some((line) => !shown.has(line))) {
              const again = fresh.planned;
              sheet = { diff: diffOf(again), then: () => installOne(again, u.title, u).then(reread) };
              whole = false;
              break;
            }
            if (!(await installOne(fresh.planned, u.title, u))) {
              whole = false;
              break;
            }
            done += 1;
          }
          const ended = whole ? words.updatedAll(done, passed) : null;
          if (ended) toasts.push(ended, { intent: 'good' });
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
   * WHAT EACH INSTALLED ADD-ON HOLDS, SAID AS ITS OWN PAGE AND THE STORE SAY IT: a built-in from its module, a use
   * case or an add-on from outside from its listing, the one the store reads, so the screens never disagree.
   */
  const listed = $derived(listingsOf({ kennel, counts: null }));
  /* ITS OWN ICON, when its manifest names one the app draws: a built-in's, else the one its catalogue entry carries. */
  const iconFor = (id: string): IconName | null => {
    const named = byId.get(id)?.icon ?? catalogueIcons.get(id) ?? (id.startsWith('usecase-') ? STARTER_ICONS[id.slice('usecase-'.length)] : undefined);
    return named !== undefined && isGlyph(named) ? named : null;
  };
  /* THE STARTER THIS RECORD RUNS ON is one tile, never an add-on row, and BrainDog's own parts are one folded line. */
  /* THE ONE THE RECORD SPEAKS IN, as the shell heard it with each pack's `speaks` setting (audit 31 Oct h, AH16): read by
     id alone, a shop with Small business beside it was told its starter was Small business, which sorts first. */
  const starterId = $derived.by(() => {
    const now = speakingPackNow();
    return now !== null && installed.some((s) => s.id === now && s.disabled_at === null) ? now : speakingPack(installed);
  });
  const starter = $derived(starterId === null ? null : (listed.find((l) => l.installedId === starterId) ?? null));
  const coreHeld = $derived(installed.filter((s) => isCore(s.id)));
  /* THE PAGES BRAINDOG KEEPS FOR EVERY RECORD (`core`) ARE NO ADD-ON'S: not a row, and not named in the folded line. */
  const addons = $derived(installed.filter((s) => !isCore(s.id) && s.id !== CORE_PACK && s.id !== starterId));
  /** Why an update waits, in one line: what its version says it changes, or that one is there. */
  const reasonOf = (u: { id: string; kind: ListingKind; to: string; entry: CatalogueEntry | null }): string => {
    const l = listed.find((x) => x.installedId === u.id || (x.kind === u.kind && x.id === u.id));
    const notes = (l?.versions ?? u.entry?.versions ?? []).find((v) => v.version === u.to)?.notes;
    return notes && notes.trim() !== '' ? notes : words.updateAvailable;
  };
  const holdsOn = (id: string): string => {
    const m = byId.get(id);
    if (m) return describe(moduleHolds(m));
    const key = id.startsWith('usecase-') ? `usecase:${id.slice('usecase-'.length)}` : `pack:${id}`;
    const l = listed.find((x) => x.key === key);
    return l ? describe(listingHolds(l, [])) : '';
  };

  /* ── reading ───────────────────────────────────────────────────────────── */

  /**
   * THE LIST IS THE RECORD'S, READ ONCE, and with no record to read it is the record's refusal and nothing else.
   *
   * `data-screen` on `<main id="main">` is what lets anything outside the page tell a drawn screen from a shell that has
   * fetched nothing. The read is bracketed by `read()`, so the attribute stays away while `packs` is out, and
   * `drew('ready')` is the claim for when it has come back.
   */
  onMount(() => {
    /* THE NAMES ARE PART OF THE SCREEN: an installed add-on the build's modules do not know is named and described by the
       Kennel's catalogue, else by the catalogue this build ships, and the screen says it is drawn only once they have
       landed, so it is never drawn as "Bank hsbc eg" over "Holdings". */
    const named = readHostCatalogue(fetch)
      .then(async (got) => {
        kennel = got.ok ? got.index : null;
        looked = true;
        /* THE SHIPPED CATALOGUE UNDER THE KENNEL'S: it holds every pack in `packs/`, unlisted ones too, so an installed add-on the Kennel does not list is still named. */
        const indexes = [await shippedIndex, got.ok ? got.index : null];
        const maps = await Promise.all(indexes.map(async (i) => [await catalogueTitles(i), await catalogueLines(i)] as const));
        catalogueNames = new Map(maps.flatMap(([n]) => [...n]));
        catalogueSays = new Map(maps.flatMap(([, l]) => [...l]));
        catalogueIcons = new Map(indexes.flatMap((i) => (i?.entries ?? []).flatMap((e) => (e.kind === 'pack' && e.icon !== undefined ? [[e.id, e.icon] as const] : []))));
      })
      .catch(() => undefined);
    void read(async () => {
      client = createClient({ base: apiBase() });
      const chosen = await choose(client);
      source = chosen.source;
      if (!chosen.first.ok) {
        refused = chosen.first.refusal;
        return false;
      }
      states = chosen.first.value;
      void readGone();
      await named;
      return true;
    });
  });
  $effect(() => drew('ready'));
</script>

<!-- SETTINGS › ADD-ONS DRAWS THE HEAD: this is the area's body. Its sentence, then the two things the page's "⋯" held,
     installing from a file or a link and sharing your starter, and the way to the store. -->
<div class="area-head">
  <!-- THE SENTENCE COUNTS WHAT "YOUR ADD-ONS" LISTS, so the two agree on one screen: it said 11 over a list of 6, counting
       the starter and BrainDog's own parts, which have a tile and a line of their own. -->
  {#if live}<p class="area-said">{words.sentence(installedCount(states) === null ? 0 : addons.length, updates ? updates.length : null)}</p>{/if}
  <div class="area-acts">
    <Menu label={words.more} align="end">
      {#snippet trigger()}<span class="more"><Icon name="more" size="m" /><span class="vh">{words.more}</span></span>{/snippet}
      <button type="button" class="mi" role="menuitem" onclick={() => (from = true)}><Icon name="download" size="s" />{words.from}</button>
      <a class="mi" role="menuitem" href={at('/addons/share')}><Icon name="share" size="s" />{copy.shareSetup}</a>
    </Menu>
  </div>
</div>

<div class="page">
  <div class="board">
    {#if refused}
      <Empty kind="error" title={refused.fix}>
        {#snippet actions()}<Button weight="primary" onclick={() => location.reload()}>{copy.tryAgain}</Button>{/snippet}
      </Empty>
    {:else}
      {#if from}
        <Tile icon="download" title={words.from}>
          {#snippet actions()}<Button weight="quiet" size="sm" onclick={() => (from = false)}>{words.fromDone}</Button>{/snippet}
          <InstallShared {client} {installed} nameOf={planName} oninstalled={() => void reread()} />
        </Tile>
      {/if}
      {@render updatesTab()}
      {@render installedTab()}
    {/if}
  </div>
</div>

{#snippet installedTab()}
  <!-- A RECORD WITH NOTHING INSTALLED IS THE ORDINARY FIRST STATE OF THIS SCREEN: what an add-on is, and the one press
       that finds one. -->
  {#if states && installed.length === 0}
    <Empty kind="no-data-yet" glyph="packs" title={copy.noPacksYet} body={copy.packBlurb}>
      {#snippet actions()}<Button href={STORE_AT}>{words.browse}</Button>{/snippet}
    </Empty>
  {/if}

  {#if starter && starterId}
    {@const on = baseTurnedOn(starter, moduleName)}
    <!-- YOUR STARTER, ONE TILE: what it is, what it turned on, and the two things to do with it. -->
    <Tile icon={iconFor(starterId) ?? 'projects'} title={words.yourStarter(starter.title)} count={installed.find((x) => x.id === starterId)?.version ?? undefined}>
      {#snippet actions()}
        <Button size="sm" href={`${STORE_AT}?chip=starters`}>{words.changeStarter}</Button>
        <Button size="sm" weight="bare" href="/addons/share">{words.shareStarter}</Button>
      {/snippet}
      <p class="starter-line">{starter.summary}</p>
      {#if on.length > 0}<p class="aside">{words.starterTurnedOn(on)}</p>{/if}
    </Tile>
  {/if}

  {#if addons.length > 0}
    <!-- ONE ROW PER ADD-ON: its well, its name, its line and what it holds, its "…" holding Settings, What this adds and
         Uninstall, destructive last, and its switch. In one tile, a hairline between rows. -->
    <Tile icon="packs" title={words.yoursTitle} count={addons.length}>
      {#snippet actions()}<Button size="sm" href={STORE_AT}>{words.findAddons}</Button>{/snippet}
      <ul class="ledger addons">
        {#each addons as state (state.id)}
          {@const off = state.disabled_at !== null}
          {@const block = blocks[state.id]}
          {@const name = nameOf(state.id)}
          <!-- OFF IS SAID, NEVER ABSENT. Its rows are still in the record, and this row is the only way back to them. A row
               a refusal is waiting on keeps its verbs showing (`data-needs`). -->
          <li class="addon-row" data-off={off ? '' : undefined} data-needs={block ? '' : undefined} in:lineIn out:dismiss animate:flip={springy()}>
            <div class="line addon">
              <span class="line-mark"><IconWell name={iconFor(state.id) ?? glyphOf(byId.get(state.id)?.pages, page.data.nav ?? [])} size="l" /></span>
              <a class="addon-main" href={at(`/addons/${state.id}`)}>
                <span class="line-title addon-name">{name}</span>
                <span class="line-detail addon-line">{lineOf(state)}</span>
                {#if holdsOn(state.id)}<span class="addon-holds num">{holdsOn(state.id)}</span>{/if}
              </a>
              <span class="line-verbs">
                <Menu label={market.more(name)} align="end">
                  {#snippet trigger()}<span class="more"><Icon name="more" size="m" /><span class="vh">{market.more(name)}</span></span>{/snippet}
                  <a class="mi" role="menuitem" href={at(`/addons/${state.id}`)}><Icon name="settings" size="s" />{packWords.settings}</a>
                  <button type="button" class="mi" role="menuitem" onclick={() => showAdds(state.id)}><Icon name="eye" size="s" />{copy.installDiff}</button>
                  <!-- ON AND OFF IN THE "⋯", never a bare switch on the row: what stops it is said under the row. -->
                  <button type="button" class="mi" role="menuitem" aria-label={copy.packSwitch(name)} disabled={busy !== null} onclick={() => turn(state.id, off)}><Icon name={off ? 'check' : 'close'} size="s" />{off ? words.turnOn : words.turnOff}</button>
                  <!-- EVERY ADD-ON UNINSTALLS, one from the store as a built-in does (AG2): the record keeps its rows either way. -->
                  <button type="button" class="mi" role="menuitem" data-tone="bad" disabled={busy !== null} onclick={() => uninstall(state.id, name)}><Icon name="trash" size="s" />{copy.uninstall}</button>
                </Menu>
              </span>
{#if off}<span class="addon-off">{words.off}</span>{/if}
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
    </Tile>
  {/if}

  {#if coreHeld.length > 0}
    <!-- BRAINDOG'S OWN PARTS, FOLDED INTO ONE LINE: always on, updated by themselves, each opening its own page. -->
    <p class="part-of">
      <span class="part-of-h">{words.partOf}</span>
      <span>
        {#each coreHeld as c, i (c.id)}{i === 0 ? '' : i === coreHeld.length - 1 ? ' and ' : ', '}<a class="tap" href={at(`/addons/${c.id}`)}>{nameOf(c.id)}</a>{/each}
        {words.partOfTail(coreHeld.length)}
      </span>
    </p>
  {/if}

  <!-- REMOVED, UNDER WHAT IS INSTALLED: each one uninstalled inside thirty days, what of it stays, and Put back. -->
  {#if RemovedPart && gone.length > 0}
    <RemovedPart rows={gone} now={Date.now()} wayOf={(r) => wayBack(r, shipped, kennel)} nameOf={nameOf} held={busy !== null} onputback={putBack} />
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
  <!-- UPDATES LEAD WHILE THERE ARE ANY, and say nothing while there are none: the sentence already says every one is up
       to date. The same row as an installed add-on, and its one press, which reads the plan. "Update all" is the
       screen's one primary, at the tile's heading. -->
  {#if updates && updates.length > 0}
    <Tile icon="refresh" title={words.waitingTitle} count={updates.length}>
      {#snippet actions()}
        <Button weight="primary" size="sm" disabled={busy !== null || !client} onclick={() => void showAll()}>{busy === 'all' ? words.planning : words.updateAll}</Button>
      {/snippet}
      <ul class="ledger addons">
        {#each updates as u (u.key)}
          {@const s = said[u.key]}
          {@const went = (s?.went ?? []).map((t) => words.installed(t)).join(' ')}
          <li class="addon-row">
            <div class="line addon update">
              <span class="line-mark"><IconWell name="refresh" size="l" /></span>
              <span class="addon-main">
                <span class="line-title addon-name">{u.title} <span class="from-to num">{u.from} → {u.to}</span></span>
                <span class="line-detail addon-line">{reasonOf(u)}{u.entry && u.entry.publisher?.kind !== 'braindog' ? ` ${words.outsideAsks}` : ''}</span>
              </span>
              <Button size="sm" disabled={busy !== null || !client} onclick={() => void showPlan(u)}>{busy === u.key ? words.planning : words.update}</Button>
              {#if s && 'filed' in s}
                <p class="addon-said" role="status">{went}{went ? ' ' : ''}{words.asked}{#if s.filed}{' '}<a class="tap" href={at(`/decide/${s.filed}`)}>{words.openDecide}</a>{/if}</p>
              {:else if s}
                {@const first = s.first ? updates.find((o) => o.key === s.first) : undefined}
                <p class="addon-said" role="status" title={s.code ? copy.refusalCode(s.code) : undefined}>
                  {went}{went ? ' ' : ''}{s.fix}
                  {#if first}{' '}<Button size="sm" disabled={busy !== null || !client} onclick={() => void showPlan(first)}>{orderWords.first(first.title)}</Button>{/if}
                </p>
              {/if}
            </div>
          </li>
        {/each}
      </ul>
    </Tile>
  {/if}
  {#each unverified as fix, i (i)}<p class="aside">{fix}</p>{/each}
{/snippet}

{#if sheet}
  {@const s = sheet}
  <PlanSheet diff={s.diff} nameOf={planName} {hosted} busy={busy !== null} onapprove={approveSheet} oncancel={() => (sheet = null)} />
{/if}

<style>
  .from-to {
    margin-inline-start: var(--sp-2);
    color: var(--ink-3);
    font-weight: 400;
  }

  .starter-line {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: 24px;
  }

  .addon-off {
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .part-of {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--sp-1) var(--sp-3);
    margin: 0;
    padding-inline: var(--sp-1);
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: 18px;
  }

  .part-of-h {
    color: var(--ink);
    font-weight: 600;
  }

  .page {
    display: flex;
    flex-direction: column;
    gap: var(--tile-gap);
  }

  /* THE AREA'S OWN LINE: what it holds, and the way to the store and the "⋯" at its end. */
  .area-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-3);
    margin-block-end: var(--tile-gap);
  }

  .area-said {
    flex: 1 1 auto;
    margin: 0;
    color: var(--ink-2);
  }

  .area-acts {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }

  /* THE BOARD: the page's tiles straight on the ground, 12 apart (`--tile-gap`), as on every other screen. */
  .board {
    display: flex;
    flex-direction: column;
    gap: var(--tile-gap);
    min-inline-size: 0;
  }

  /* WHAT ONE ADD-ON HOLDS, under its line: counts, in the quiet ink. */
  .addon-holds {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: 18px;
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

  /* "OFF" ENDS THE ROW, on the tile's own edge, where the switch was: off is said in words, never by a control alone. */
  .addon > .addon-off {
    justify-self: end;
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
    color: var(--ink-2);
  }

  .more {
    display: inline-grid;
    place-items: center;
    inline-size: var(--ctl-h);
    block-size: var(--ctl-h);
    border-radius: var(--r-ctl);
    color: var(--ink-2);
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
    color: var(--ink-2);
    font: inherit;
    text-align: start;
    text-decoration: none;
    cursor: pointer;
  }

  .mi:hover,
  .mi:focus-visible {
    background: var(--hover);
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
    color: var(--ink-2);
    font-size: var(--fs-meta);
  }

  /* WHAT ONE ADD-ON BRINGS, as rows in the sheet: a well and a name, each opening what it names. */
  .adds-row {
    grid-template-columns: var(--well-l) minmax(0, 1fr);
    column-gap: var(--sp-3);
  }

  .aside {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  /* A ROW THAT IS NOT ITSELF A LINK STILL TAKES THE WASH UNDER THE POINTER, and its hairlines step aside for it, as the
     shared rows' do. */
  @media (hover: hover) and (pointer: fine) {
    .addon:hover {
      background: var(--hover);
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
      background: var(--hover);
      color: var(--ink);
    }
  }

  /* ON A PHONE a row's name is read at the phone's body size, as every row's first line is. */
  @media (width < 900px) {
    .addon {
      min-block-size: 60px;
    }

    .addon-name {
      font-size: var(--fs-body);
    }

  }
  /* A LONG DESCRIPTION WRAPS WHOLE ON A PHONE, where a two-line clamp cut words; wider it keeps to two lines. */
  .addon-line {
    white-space: normal;
    overflow-wrap: break-word;
  }

  @media (width >= 640px) {
    .addon-line {
      display: -webkit-box;
      overflow: hidden;
      text-overflow: clip;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      line-clamp: 2;
    }
  }
</style>
