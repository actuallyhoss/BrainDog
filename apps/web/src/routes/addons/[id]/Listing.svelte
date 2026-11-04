<!--
  One listing on its own page, for every kind: `/addons/<id>?kind=module|usecase|pack`, `usecase` when no kind is
  said so the links written before add-ons had pages still open.

  EVERYTHING HERE IS READ FROM THE THING ITSELF, never written for the page: the summary and who published it, a large
  drawing of each page it adds, what it adds (`$lib/market/adds.ts`, from the document the plan is read from), every line
  it would call out with, its versions with their notes, what it needs first, and its licence. So the page cannot
  promise what installing does not do.

  A KENNEL VERSION IS VERIFIED WHEN THE PAGE OPENS: its checksum, and its author's signature when it has one. One that
  does not verify is refused with its sentence and code and nothing can be pressed. A signed one says, in one line under
  the summary and by the publisher's name (`catalogue.ts` `trustLine`), whether this person has seen that key before:
  the keys seen are kept on their record (`../known-keys.ts`), so a new phone and the command line read the same trust.
  A key its author revoked, or a version that lost the signature earlier ones had, is never offered; a different key is
  not offered until the person presses Trust this key (`trustThisKey`), which keeps it and reads again. The key is kept
  on first use when the install goes through (`keepFirstKey`), and never written over.

  ONE PRIMARY BUTTON: Install, Update, Turn on, or Installed. Install and Update read the record's plan and open the plan
  sheet (`$lib/market/PlanSheet.svelte`); what installs is what the sheet showed (`./offer.ts`). Somebody the
  record will not let install is refused there, and a Kennel entry is then asked for on Decide instead.

  THE LOOK (the design system, and the site's catalogue board): tiles, 12 apart. The lead tile holds what it does, who made it,
  the trust line and the one button; beside it, what it adds as a plan is drawn (a glyph, the kind, its count and
  what each is called, then the hosts it calls); under them its pages drawn large; then its hosts, its versions and its
  details. A trust state is its intent and its glyph, and a key revoked or a signature lost is the danger line.
-->
<script lang="ts">
  import { apiBase, at } from '$lib/at.ts';
  import { onMount, tick, untrack } from 'svelte';
  import { goto, invalidateAll } from '$app/navigation';
  import { page } from '$app/state';
  import { createClient } from '@braindog/client';
  import type { CatalogueIndex, CatalogueVersion, Reach, Trust } from '@braindog/declare/catalogue';
  import { useCase } from '@braindog/seed/usecases';
  import { builtInFile, previewOf } from '@braindog/seed/usecases/share';
  import { titleOf } from '$lib/title.ts';
  import { copy } from '$lib/copy.ts';
  import * as pref from '$lib/pref.ts';
  import { read } from '$lib/data/record.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { choose, packDocument, type PackState } from '$lib/record/packs.ts';
  import type { Shell } from '$lib/record/boot-live.ts';
  import { TONES, type Tone } from 'braindog-render';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import type { IconName } from '$lib/ui/icons.ts';
  import { glyphOf, ownIcon } from '$lib/market/ListingCard.svelte';
  import PlanSheet from '$lib/market/PlanSheet.svelte';
  import Report from '$lib/market/Report.svelte';
  import { words as planWords } from '$lib/market/plan.ts';
  import { keyPut, type KeyPut } from '$lib/market/key-put.ts';
  import { keyName } from '$lib/market/key-names.ts';
  import { methods, passkeySignIn, support } from '$lib/auth.ts';
  import PreviewPage from '$lib/market/PreviewPage.svelte';
  import { addsOf, fieldsOf, namesOf } from '$lib/market/adds.ts';
  import { asksLines, asksWords, placesLines } from '$lib/market/asks.ts';
  import { readCounts } from '$lib/market/counts.ts';
  import { actionOf, compareVersion, entryOf, latestOf, listingKey, listingsOf, unlistedListing, type ListingKind } from '$lib/market/listing.ts';
  import { readVersionPreview, type PreviewRead } from '$lib/market/preview.ts';
  import { words } from '$lib/market/words.ts';
  import { readyFor, readyWords, type Ready } from '$lib/market/update-ready.ts';
  import { drew } from '../../../lib/ui/screen.svelte.ts';
  import { frame } from '$lib/shell/frame.svelte.ts';
  import { STORE_AT } from '../moved.ts';
  import PluginSkeleton from '../PluginSkeleton.svelte';
  import { hostedHere } from '../../settings/billing.ts';
  import { listWords, moduleTitle, oneOf } from '../sharing.ts';
  import Preview from '../Preview.svelte';
  import { miniOf } from '../mini.ts';
  import { glyphOf as placeGlyph } from '../glyph.ts';
  import { isGlyph } from '$lib/ui/icons.ts';
  import { firstPartyModules } from '@braindog/seed/packs/modules';
  import { byBrainDog, callSaid, catalogueText, keepFirstKey, readHostCatalogue, signedLine, trustForEntry, trustSaid, trustThisKey } from '../catalogue.ts';
  import { recordKeys } from '../known-keys.ts';
  import { FIXABLE, hasTheme, stageFix } from '$lib/theme/staged.ts';
  import { askOnDecide, diffOf, firstPageOf, install, keysWanted, notOwner, planFor, sheetWords, turnOn, turnWords, waitingOf, waitsOf, type OfferClient, type Planned } from './offer.ts';

  const KINDS: readonly ListingKind[] = ['module', 'usecase', 'pack'];
  const kind = $derived<ListingKind>(KINDS.find((k) => k === page.url.searchParams.get('kind')) ?? 'usecase');
  const id = $derived(page.params.id ?? '');

  let kennel = $state.raw<CatalogueIndex | null>(null);
  let looked = $state(false);
  let counts = $state.raw<Record<string, number> | null>(null);
  let client = $state.raw<OfferClient | null>(null);
  /** This record's packs, `null` until it answers or when it does not. */
  let states = $state.raw<PackState[] | null>(null);
  let recordRefused = $state<string | null>(null);

  /* AN ADDRESS WITH NO `?kind=` IS READ AS A USE CASE FIRST, for the links written before add-ons had pages, and then as
     whatever else goes by that id: `/addons/reading-list` said "nothing here by that name" for an add-on the
     catalogue lists. A kind that is said is kept to. AND AN ADD-ON THE CATALOGUE HOLDS UNLISTED IS SHOWN BY ITS ID
     (`unlistedListing`): it installs by id, and its address said there was nothing by that name. */
  const listing = $derived.by(() => {
    const all = listingsOf({ kennel, counts });
    const said = page.url.searchParams.has('kind');
    const found = all.find((l) => l.key === listingKey(kind, id)) ?? (said ? undefined : all.find((l) => l.id === id));
    return found ?? unlistedListing(kennel, id, said ? kind : null);
  });
  const entry = $derived(listing ? entryOf(kennel, listing) : null);
  const u = $derived(listing?.kind === 'usecase' && listing.source === 'bundled' ? useCase(listing.id) : undefined);
  const latest = $derived(listing ? latestOf(listing) : null);
  const action = $derived(listing && states ? actionOf(listing, states) : null);
  /**
   * THE VERSION THIS RECORD HELD WHEN THE PAGE OPENED (AN15), so what a newer one changed is said to whoever had an
   * older one, and still after he updates here. Installed fresh on this page, nothing was held, and "Each book keeps its
   * title in Name, as it has since 2.0.0" answered nothing he asked.
   */
  let arrived = $state.raw<PackState[] | null>(null);
  const heldFrom = $derived(listing && arrived ? (arrived.find((s) => s.id === listing.installedId)?.version ?? null) : null);
  const noteFor = (v: CatalogueVersion): boolean => !v.bump || (heldFrom !== null && compareVersion(heldFrom, v.version) < 0);

  /**
   * ITS OWN GLYPH (agents F25): a built-in wears the place it brings (`glyph.ts`), a built-in use case its Home's or its
   * first list's (`mini.ts`), and anything else its category's. It was the add-ons cube on every listing.
   */
  const glyph = $derived.by((): IconName => {
    if (!listing) return 'packs';
    const own = ownIcon(listing);
    if (own) return own;
    if (listing.kind === 'module') {
      const g = placeGlyph(firstPartyModules().find((m) => m.id === listing!.id)?.pages, page.data.nav ?? []);
      if (g !== 'packs') return g;
    }
    if (u) {
      const g = miniOf(u, () => null).glyph;
      if (g && isGlyph(g)) return g;
    }
    return glyphOf(listing);
  });

  /* ── the file, verified ─────────────────────────────────────────────────── */

  /** The document the plan is read from and the page describes, with a use case's file text; `null` until read. */
  let file = $state.raw<{ doc: Record<string, unknown> | null; text: string | null } | null>(null);
  /** What it can reach, computed from the file for a built-in and by the catalogue for a Kennel entry. */
  let reach = $state.raw<Reach | null>(null);
  /**
   * WHAT IT NEEDS FIRST THAT THIS RECORD DOES NOT HOLD (audit 31 Oct h, AH6): BrainDog's own parts its reach names, not
   * installed or switched off here. Debts on a shop with no Money offered Install, and the press answered a line of list
   * and pack ids; now the button adds Money first, and Install follows once it is in.
   */
  const ownParts = firstPartyModules();
  /* AND WHAT THOSE PARTS LEAN ON IN TURN (`leans`): Money stands on Projects, so a shop with neither adds both, in the
     order they go in. */
  const needsFirst = $derived.by((): string[] => {
    const held = states;
    if (action?.kind !== 'install' || held === null || listing?.kind === 'module') return [];
    const here = (id: string): boolean => held.some((s) => s.id === id && s.disabled_at === null);
    const wanted = new Set<string>();
    const visit = (id: string): void => {
      const part = ownParts.find((m) => m.id === id);
      if (!part || here(id) || wanted.has(id)) return;
      wanted.add(id);
      for (const l of part.leans) visit(l);
    };
    for (const m of (reach ?? latest?.reach)?.modules ?? []) visit(m);
    return ownParts.filter((m) => wanted.has(m.id)).map((m) => m.id);
  });
  /** The part being added first, while its plan is on the sheet, so the sheet's yes says that part's name. */
  let addingFirst = $state<string | null>(null);
  /** A Kennel version that did not verify, or a plan or install the record refused. */
  let refused = $state<{ fix: string; code: string | null } | null>(null);
  let trust = $state.raw<Trust | null>(null);
  /* THE KEYS SEEN ARE THE RECORD'S, read through the client the page already makes, with this browser behind it on an
     older record. The client may not be made yet when the file is verified, so one is made for the read. */
  const keys = recordKeys((name, args) => (client ?? createClient({ base: apiBase() })).call(name, args));
  /* BRAINDOG'S OWN SAYS BY BRAINDOG AND NO SIGNATURE LINE: "Nobody signed this version" read as a warning. */
  const ours = $derived(listing ? byBrainDog(listing) : false);
  const said = $derived(trust && listing ? trustSaid(trust, listing.publisher?.name ?? listing.author, ours) : null);
  /* WITHHELD, as `catalogue.ts` `withheld` says: a revoked key, a lost signature, or a different key until pressed. */
  const untrusted = $derived(trust?.kind === 'revoked' || trust?.kind === 'stripped' || trust?.kind === 'changed');
  /**
   * The intent a trust state is drawn in. A key its author revoked, or a version that lost the signature earlier ones
   * had, is never offered, so it is `bad`, the one that needs him; a key that changed is `warn`; a key this person
   * knows is `good`; a first sight, a rotation and an unsigned version are `info`.
   */
  const trustTone = $derived.by((): Tone | null => {
    if (!trust) return null;
    if (trust.kind === 'revoked' || trust.kind === 'stripped') return 'bad';
    if (trust.kind === 'changed') return 'warn';
    return trust.kind === 'known' ? 'good' : 'info';
  });
  let preview = $state.raw<PreviewRead>({ state: 'none' });
  /* WHETHER WHAT IT ADDS HAS BEEN READ, landed or not: until then the tiles after it wait out of sight, since its rows
     grew it from "Reading the plan" and pushed Its pages, Versions and Details down (0.10 at 1512, 0.16 at 390). */
  let planRead = $state(false);
  /** A preview the version says it has and that is still being read, so its tile holds its room. */
  const previewComing = $derived(!u && preview.state === 'none' && !refused && listing?.source === 'kennel' && !!latest?.preview);

  const adds = $derived(file ? addsOf(file.doc ?? (file.text ? safeParse(file.text) : null)) : null);
  const names = $derived(file ? namesOf(file.doc ?? (file.text ? safeParse(file.text) : null)) : new Map<string, string>());
  /* THE FIELDS IT LAYS ON A LIST, BY THEIR LABELS, and a list it adds to by the name this record gives it ("Repeating"),
     so the plan sheet says neither as an id. */
  const fieldLabels = $derived(fieldsOf(file ? (file.doc ?? (file.text ? safeParse(file.text) : null)) : null));
  const heldList = (id: string): string | null =>
    id.startsWith('register.') ? (((page.data.lists ?? []) as { id: string; name: string }[]).find((l) => l.id === id.slice('register.'.length))?.name ?? null) : null;

  /**
   * WHAT IT ADDS, AS THE BOARD'S PLAN ROWS: each kind it brings with its count and what each is called, from the file
   * (`adds`), else from the reach the catalogue computed; then the hosts it calls, said as none when it calls none.
   */
  type PlanRow = { key: string; glyph: IconName; label: string; n: number | null; names: string };
  /** At most this many named on a row, and how many more said after them, so Money's 38 figures are one line. */
  const NAMED_MOST = 4;
  const planRows = $derived.by((): PlanRow[] => {
    const rows: PlanRow[] = [];
    /* THE COUNT IS EVERY ONE; THE NAMES ARE EACH NAME ONCE, so two rules said the same way are not said twice. */
    const push = (key: string, glyph: IconName, label: string, named: readonly string[], sep = ', ') => {
      if (named.length === 0) return;
      const once = [...new Set(named)];
      const shown = once.slice(0, NAMED_MOST).join(sep);
      rows.push({ key, glyph, label, n: named.length, names: once.length > NAMED_MOST ? `${shown} ${words.andMore(once.length - NAMED_MOST)}` : shown });
    };
    const read = adds && adds.lists.length + adds.pages.length + adds.figures.length + adds.rules.length + adds.reads.length > 0 ? adds : null;
    if (read) {
      push('lists', 'rows', words.addsLists, read.lists.map((l) => l.name));
      push('pages', 'doc', words.addsPages, read.pages.map(pageTitle));
      push('figures', 'activity', words.addsFigures, read.figures.map((f) => f.name), '; ');
      push('rules', 'skill', words.addsRules, read.rules, '; ');
      /* WHAT IT READS, ONCE (AH11): Card alerts said "Nothing of its own" over four patterns that file card texts and mail. */
      if (read.reads.length > 0) rows.push({ key: 'reads', glyph: 'mail', label: words.addsReads, n: 1, names: words.readsBy(read.reads) });
    } else if (reach) {
      push('lists', 'rows', words.addsLists, reach.lists);
      push('pages', 'doc', words.addsPages, reach.pages);
      push('rules', 'skill', words.addsRules, reach.rules, '; ');
    }
    /* THE WIDGETS IT SHIPS FOR TODAY AND THE SKILLS IT GIVES YOUR AGENTS, each by name: both are things it adds. */
    push('widgets', 'grid', words.addsWidgets, adds?.widgets ?? []);
    push('skills', 'learning', words.addsSkills, adds?.skills ?? []);
    if (reach) {
      const hosts = [...new Set(reach.calls_out.map((c) => c.host ?? '').filter((h) => h !== ''))];
      /* ONE THAT CALLS NOTHING SAYS SO WITHOUT A NOUGHT (AM20): "Hosts it calls 0" read as a count gone wrong. */
      rows.push(hosts.length > 0 ? { key: 'hosts', glyph: 'globe', label: words.calledHosts, n: hosts.length, names: hosts.join(', ') } : { key: 'hosts', glyph: 'globe', label: words.callsLabel, n: null, names: words.callsNothing });
    }
    return rows;
  });
  /** The declarations of the file the page describes: a pack's own, or a use case file's `pack`. */
  const declared = $derived.by((): Record<string, unknown>[] => {
    const doc = file ? (file.doc ?? (file.text ? safeParse(file.text) : null)) : null;
    const isMap = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
    const at = [doc, isMap(doc) ? doc.pack : null, isMap(doc) && isMap(doc.usecase) ? doc.usecase.pack : null].find((d) => isMap(d) && Array.isArray(d.declarations));
    return isMap(at) ? (at.declarations as unknown[]).filter(isMap) : [];
  });

  /**
   * A PAGE FOR EACH ROW IS TITLED BY THE ROW, `{{name}}`, which names nothing until a row is chosen, so it is said by its
   * list: "A page for each project", as the plan sheet says it (`sharing.ts`).
   */
  function pageTitle(p: { id: string; title: string }): string {
    if (!/\{\{(?!config:)/u.test(p.title)) return p.title;
    const d = declared.find((x) => x.page === p.id);
    const each = d && typeof d.for === 'object' && d.for !== null ? (d.for as { register?: unknown }).register : undefined;
    return typeof each === 'string' ? copy.sharePageEach(oneOf(names.get(each) ?? listWords(each))) : p.title;
  }

  /**
   * WHAT IT ASKS FOR OF YOURS, from the file (`$lib/market/asks.ts`): each list, figure and page it uses that is not its
   * own, then its scripts and its agents' skills; every call it makes is said under them by `callSaid`, one line each.
   * A list is said by the name this record gives it.
   */
  const usedName = (id: string): string => {
    const dot = id.indexOf('.');
    const [kind, rest] = [id.slice(0, dot), id.slice(dot + 1)];
    if (kind === 'register') return heldList(id) ?? names.get(id) ?? listWords(rest);
    return names.get(id) ?? listWords(rest.replaceAll('-', '_'));
  };
  const asks = $derived.by((): string[] | null => {
    const doc = file ? (file.doc ?? (file.text ? safeParse(file.text) : null)) : null;
    if (doc === null) return null;
    const calls = (reach?.calls_out ?? []).map(callSaid);
    const lines = [...asksLines(doc, usedName, { calls: calls.length === 0 }), ...calls];
    return lines.length > 0 ? lines : [asksWords.nothing];
  });

  /** How many things it adds, for the tile's count; `null` until the file or its reach is read. */
  const addsTotal = $derived(planRows.length === 0 ? null : planRows.filter((r) => r.key !== 'hosts').reduce((n, r) => n + (r.n ?? 0), 0));

  function safeParse(text: string): unknown {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  /* READ ONCE PER LISTING AND VERSION. `listingsOf` hands back new objects when the counts arrive, and re-verifying the
     file then would blank the trust sentence and the button under the person reading them. */
  const fileKey = $derived(listing && latest ? `${listing.source}:${listing.key}@${latest.version}` : null);

  $effect(() => {
    const k = fileKey;
    untrack(() => load(k));
  });

  function load(k: string | null) {
    const l = listing;
    const e = entry;
    const v = latest;
    file = null;
    reach = null;
    trust = null;
    refused = null;
    preview = { state: 'none' };
    planRead = false;
    if (!l || !v) return void (planRead = true);
    const still = () => fileKey === k;
    void (async () => {
      const cat = await import('@braindog/declare/catalogue');
      if (l.source === 'kennel' && e) {
        const got = await catalogueText(fetch, e, v);
        if (!still()) return;
        if (!got.ok) {
          refused = { fix: got.fix, code: got.code };
          return;
        }
        const parsed = safeParse(got.text);
        file = { doc: l.kind === 'pack' && parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null, text: got.text };
        reach = v.reach;
        planRead = true;
        const t = await trustForEntry(keys, e, v.version, got.signature, kennel?.keys);
        if (!still()) return;
        trust = t;
        if (!v.preview) return;
        const drawn = await readVersionPreview(fetch, l.kind === 'module' ? 'pack' : l.kind, l.id, v.version);
        if (still()) preview = drawn;
        return;
      }
      /* A BUILT-IN IS ITS OWN FILE, built here as it would be installed, and its reach is computed as the Kennel's is. */
      if (l.kind === 'usecase') {
        const built = builtInFile(l.id);
        if (!built || !still()) return;
        const text = JSON.stringify(built);
        file = { doc: null, text };
        const held = await cat.readCatalogueFile(text, { kind: 'local' });
        if (held.ok && still()) reach = cat.reachOf(held.value);
        return;
      }
      const doc = await packDocument(l.id);
      if (!doc || !still()) return;
      file = { doc, text: null };
      const held = await cat.readPackFile(doc, { kind: 'local' });
      if (held.ok && still()) reach = cat.reachOf(held.value);
    })()
      .catch(() => undefined)
      .finally(() => {
        if (fileKey === k) planRead = true;
      });
  }

  /* A STORE THAT DID NOT ANSWER IS NOT AN ADD-ON THAT IS GONE: it says so, with Try again. */
  let storeRefused = $state<string | null>(null);
  function readStore(): void {
    storeRefused = null;
    void readHostCatalogue(fetch).then((got) => {
      kennel = got.ok ? got.index : null;
      storeRefused = got.ok ? null : got.fix;
      looked = true;
    });
  }

  onMount(() => {
    readStore();
    void readCounts(fetch).then((got) => (counts = got));
    void read(async () => {
      const c = createClient({ base: apiBase() });
      client = c;
      const chosen = await choose(c);
      if (!chosen.first.ok) {
        recordRefused = chosen.first.refusal.fix;
        return false;
      }
      states = chosen.first.value;
      arrived = chosen.first.value;
      return true;
    });
  });

  /* ONLY A LISTING THAT EXISTS SAYS READY. The missing one is `Empty`'s to report. Calling `drew('empty')` from this
     effect would read what it writes and loop (`effect_update_depth_exceeded`), as it once did on this page. */
  $effect(() => {
    if (listing) drew('ready');
  });

  /* THE BAR'S CRUMB IS "Plugins › <name>", the store first, whatever the sidebar lights (3 Nov, Sam). */
  $effect(() => {
    const up = { label: words.plugins, href: STORE_AT };
    frame.up = up;
    return () => {
      if (frame.up === up) frame.up = null;
    };
  });

  async function reread() {
    if (!client) return;
    const again = await choose(client);
    if (again.first.ok) states = again.first.value;
  }

  /**
   * THE SHELL READ AGAIN ONCE SOMETHING WENT IN (first-hour audit E8): the rail is drawn from `boot`, kept for the tab, so
   * Reading list, Debts and Pad went in and neither the rail nor the phone's bar moved until a reload. Forgotten and read
   * again, the rail takes the new page, and the layout says where it came in ("Reading is in your sidebar now").
   */
  async function railAgain() {
    (await import('$lib/record/boot-live.ts')).forget();
    await invalidateAll();
  }

  /* ── an update that is ready ────────────────────────────────────────────── */

  /* WHAT THE NEW VERSION CHANGES, for a record that holds an earlier one of a plugin from outside: read from the two
     files the store holds (`update-ready.ts`), once per listing and pair of versions, and never for a built-in, whose
     update the plan sheet already describes. */
  let ready = $state.raw<Ready | null>(null);
  const readyKey = $derived(listing && listing.source === 'kennel' && action?.kind === 'update' ? `${listing.key}:${action.from}:${action.to}` : null);

  $effect(() => {
    const k = readyKey;
    untrack(() => void loadReady(k));
  });

  async function loadReady(k: string | null) {
    ready = null;
    if (k === null || !listing || action?.kind !== 'update') return;
    const [l, from, to, note] = [listing, action.from, action.to, latest?.notes];
    const out = await readyFor(fetch, l.id, from, to, note, (m) => moduleTitle(m));
    if (readyKey === k) ready = out;
  }

  /* ── the one button ─────────────────────────────────────────────────────── */

  let busy = $state(false);
  let planned = $state.raw<Planned | null>(null);
  /** The sheet open is a plan read again because the one approved changed under it (`approve`). */
  let moved = $state(false);
  $effect(() => {
    if (planned === null) moved = false;
  });
  /** A Kennel entry asked for on Decide: the proposal id, empty when the record named none. */
  let filed = $state<string | null>(null);

  /* WHAT THE INSTALL SENDS AND WHAT WAITS, as sentences under the plan (`offer.ts`): which key goes to which host and how
     often, and the parts left out until the record holds a list. Both are empty for most plugins, and then nothing is
     drawn. */
  const waits = $derived(planned ? waitsOf(planned, (id) => names.get(id) ?? moduleTitle(id)) : []);

  /** Whether the button can be pressed: the record has answered, and a Kennel version verified and is trusted. */
  const pressable = $derived(!busy && client !== null && states !== null && file !== null && (listing?.source !== 'kennel' || (trust !== null && !untrusted)));

  async function press() {
    if (!listing || !client || !states || !file || !pressable || !action) return;
    refused = null;
    busy = true;
    try {
      if (action.kind === 'turn-on') {
        const out = await turnOn(client, listing, states, u ? u.pack !== null : true, copy.writeRaced);
        if (out.ok) toasts.push(listing.kind === 'usecase' ? copy.switchedTo(listing.title) : words.turnedOn(listing.title), { intent: 'good' });
        else refused = out;
        await reread();
        if (out.ok) await railAgain();
        return;
      }
      if (action.kind !== 'install' && action.kind !== 'update') return;
      /* WHAT IT NEEDS FIRST GOES IN FIRST, on its own sheet: the part's plan, and Install for this one after it. */
      const first = needsFirst[0];
      if (first !== undefined) {
        const out = await planFor(client, { kind: 'module', id: first, source: 'bundled', title: moduleTitle(first) }, { doc: null, text: null }, states, copy.writeRaced);
        if (out.ok) {
          planned = out.planned;
          addingFirst = first;
        } else refused = unresolvedSaid(out);
        return;
      }
      /* WHAT ELSE WAITS IS READ ONLY FOR A PLAN THAT HAS SOMETHING TO WAIT FOR (`offer.ts` `afterOthers`): an update
         another one hands something to goes in after it, on the one sheet, instead of a stop nobody can clear here. */
      const held = states;
      const out = await planFor(client, listing, file, held, copy.writeRaced, () => waitingOf(fetch, kennel, held));
      if (out.ok) planned = out.planned;
      else refused = unresolvedSaid(out);
    } finally {
      busy = false;
    }
  }

  /**
   * A KEY IT SENDS IS NOT IN THE KEYS YET, so the sheet reads the plan again while it is open (`PlanSheet` `onrecheck`):
   * once the key is put in from a terminal the fresh plan, with its fresh hash, takes the old one's place and Install
   * opens. Only a plan whose missing keys changed is swapped, so the sheet does not redraw every few seconds.
   */
  async function again() {
    const was = planned;
    if (!listing || !client || !states || !file || !was) return;
    const held = states;
    const out = await planFor(client, listing, file, held, copy.writeRaced, () => waitingOf(fetch, kennel, held));
    if (out.ok && planned === was && keysWanted(out.planned) !== keysWanted(was)) planned = out.planned;
  }

  /**
   * A KEY THE INSTALL SENDS, PUT IN FROM THE SHEET (audit 31 Oct f, AF3): the same host door the Keychain's Add a key
   * uses (`putKey`), so the value is sealed by the host and the record is handed sealed bytes. The plan is read again
   * after it, so the stop lifts and Install opens. A Keychain behind a password asks for it on the sheet.
   *
   * A SIGN-IN OLDER THAN THE KEYCHAIN'S LOCK IS PROVED AGAIN IN PLACE (RF3), as the Keychain page proves it: the record
   * sends back "Sign in again to open the keychain." once the session's proof is older than `lock_after`, fifteen minutes
   * until he sets one, which is the usual case for somebody browsing the Store. Where a passkey can prove it here, it does
   * and the same key is sent once more; anywhere else the sheet offers the sign-in page, which comes back to this listing.
   */
  async function putKey(label: string, value: string, passphrase: string): Promise<KeyPut> {
    const send = () =>
      createClient({ base: apiBase() })
        .putKey({ label, value, ...(passphrase === '' ? {} : { passphrase }) })
        .catch(() => null);
    const out = await keyPut(send, { support, methods, passkeySignIn }, copy.writeRaced);
    if (out.ok) toasts.push(planWords.keyAdded(keyName(label)), { intent: 'good' });
    return out;
  }


  /**
   * THE OWNER'S PRESS ON A KEY THAT CHANGED: the new key is kept beside the ones seen before, on the record, and the
   * version is read again, so the line says "as before" and the button is offered. Nothing is kept by itself.
   */
  let trusting = $state(false);
  async function trustKey() {
    if (!entry || trust?.kind !== 'changed' || trusting) return;
    trusting = true;
    try {
      if (await trustThisKey(keys, `${entry.kind}:${entry.id}`, trust)) load(fileKey);
      else toasts.push('This key could not be kept, so nothing it signed is offered yet.', { intent: 'warn' });
    } finally {
      trusting = false;
    }
  }

  /** A run refused part way still put updates in: they are named beside the refusal, so nobody finds one moved unsaid. */
  function wentIn(out: { fix: string; first?: readonly string[]; stopped?: string }) {
    if (out.first && out.first.length > 0) toasts.push(turnWords.stoppedAfter(out.first, out.fix, out.stopped), { intent: 'warn' });
  }

  async function approve() {
    if (!listing || !client || !states || !planned) return;
    const p = planned;
    /* A FIRST INSTALL OF AN ADD-ON IS UNDONE FROM ITS TOAST: Undo takes it back out, as Uninstall does, keeping what it held. */
    const fresh = addingFirst === null && listing.kind === 'pack' && action?.kind === 'install' ? { id: listing.installedId, title: listing.title } : null;
    busy = true;
    try {
      const out = await install(client, p, states, pref.read().nav ?? [], copy.writeRaced);
      if (out.ok) {
        if (out.nav) pref.write({ nav: out.nav });
        if (entry && trust) await keepFirstKey(keys, `${entry.kind}:${entry.id}`, trust);
        /* A run that took other updates in first names them (`offer.ts` `installInTurn`), so nobody finds one moved unsaid. */
        const title = addingFirst !== null ? moduleTitle(addingFirst) : listing.title;
        /* AND WHAT THE UPDATE CARRIED INTO A PAGE OR LIST HE CHANGED, in the record's own words (RJ6). */
        const undo = fresh && !out.first ? fresh : null;
        toasts.push([out.first ? turnWords.installedAfter(title, out.first) : copy.shareInstalled(title), ...(out.said ?? [])].join(' '), undo ? { intent: 'good', undo: () => void takeBack(undo.id, undo.title) } : { intent: 'good' });
        planned = null;
        const wasFirst = addingFirst !== null;
        addingFirst = null;
        await reread();
        await railAgain();
        /* THE NEXT PART IT NEEDS, OR THE ADD-ON ITSELF, IS THE NEXT SHEET: one press for each, in order. */
        if (wasFirst) setTimeout(() => void press(), 0);
        else await focusOpen();
        return;
      } else if (entry && notOwner(out.code)) {
        wentIn(out);
        planned = null;
        const asked = await askOnDecide(client, entry, action?.kind === 'update' ? action.from : null);
        if (asked.ok) filed = asked.id;
        else refused = asked;
      } else if (out.code === 'PLAN_STALE' && !out.first && file) {
        /* THE PLAN SAYS SOMETHING ELSE NOW: the record installs a plan that only moved in time by itself, so this one
           changed what the plugin would do. Read again and shown, with one line over it, never a refusal to press past. */
        const held = states;
        const fresh = await planFor(client, listing, file, held, copy.writeRaced, () => waitingOf(fetch, kennel, held));
        if (fresh.ok) {
          planned = fresh.planned;
          moved = true;
        } else {
          planned = null;
          refused = fresh;
        }
      } else {
        wentIn(out);
        planned = null;
        refused = unresolvedSaid(out);
      }
      await reread();
    } finally {
      busy = false;
    }
  }

  /** Undo of a first install: the plugin taken back out, its lists and what they hold kept, as Uninstall keeps them. */
  async function takeBack(id: string, title: string) {
    const c = client;
    if (!c) return;
    const out = await c.uninstallPack({ id }).catch(() => null);
    if (out?.ok) toasts.push(copy.uninstalled(title), { intent: 'good' });
    else toasts.push((out && !out.ok && 'refusal' in out ? out.refusal.fix : null) ?? copy.writeRaced, { intent: 'warn' });
    await reread();
    await railAgain();
  }

  /**
   * ONCE IT IS IN, FOCUS GOES TO WHAT TO DO NEXT (AM19): "Open Reading", or the paste box's press, wherever it is drawn
   * (beside the summary, or on the phone's bar); else the page's heading. The sheet closed and left focus on the page.
   */
  async function focusOpen() {
    await tick();
    const shown = (el: Element | null): el is HTMLElement => el instanceof HTMLElement && el.getClientRects().length > 0;
    const next = [...document.querySelectorAll('.act a[href], .act button:not(:disabled)')].find(shown);
    const target = next ?? document.querySelector('h1[tabindex="-1"]');
    if (shown(target)) target.focus();
  }

  /**
   * A PLAN REFUSED FOR A LIST NOTHING HERE HOLDS, IN WORDS (AH6): "debts points at the accounts list
   * (register.debts.fields.account.to)... Install money-core first" named ids a person never sees. The part that declares
   * the list is named by its title when the record named one; else it says only that something must come first.
   */
  function unresolvedSaid<T extends { fix: string; code: string | null }>(out: T): T {
    if (out.code !== 'REGISTER_UNRESOLVED' || !listing) return out;
    const named = /Install (.+?) first:/u.exec(out.fix)?.[1];
    const parts = named ? named.split(/, | and /u).map((id) => moduleTitle(id.trim())) : [];
    return { ...out, fix: parts.length > 0 ? words.needsFirstRefused(listing.title, parts.join(' and ')) : words.needsSomethingFirst(listing.title) };
  }

  const label = $derived(
    busy && planned === null
      ? words.planning
      : needsFirst.length > 0
        ? words.addFirst(needsFirst.map(moduleTitle).join(' and '))
        : action?.kind === 'update'
        ? words.update(action.to)
        : action?.kind === 'turn-on'
          ? words.turnOn(listing?.title ?? '')
          : action?.kind === 'installed'
            ? words.installed
            : action?.kind === 'taken'
              ? words.taken
              : words.install(listing?.title ?? ''),
  );
  /* ONCE IT IS IN, ITS FIRST PAGE, so one press lands on what it brought (`offer.ts` `firstPageOf`). */
  const opens = $derived(adds ? firstPageOf(adds.pages, declared) : null);
  /* AN ADD-ON THAT READS TEXTS AND HAS NO PAGE, ONCE IT IS IN, OPENS THE PASTE BOX (first-hour audit AH10): Card alerts
     said "Installed" and nothing about where an alert goes. What comes in, Texts, takes a bank text pasted in. */
  const pastes = $derived(opens === null && (adds?.reads.includes('texts') ?? false));
  /* SOMETHING TO PRESS: the phone's bar is drawn only then, and never to say "Installed" over the last tile. */
  const doable = $derived(listing !== null && listing !== undefined && filed === null && ((action?.kind !== 'installed' && action?.kind !== 'taken') || opens !== null || pastes) && (trust?.kind === 'changed' || !untrusted));

  const publisherWords = $derived(
    !listing
      ? ''
      : latest?.reviewed
        ? words.reviewed
        : listing.publisher?.kind === 'key'
          ? words.signedBy(listing.publisher.id)
          : words.by(listing.publisher?.name ?? listing.author),
  );
</script>

<svelte:head><title>{titleOf(listing?.title, words.plugins)}</title></svelte:head>

<!-- THE WAY BACK IS THE HEAD'S: a kicker at 1440 and the back link in the phone's bar, on the gutter like every detail
     page's, where a bare button above the lead sat off it. -->
<!-- `sentence=""`: the page says nothing under its name, so no line is held for one and given back when it settles,
     which pulled every tile up by its height (verify6, 2 Nov). -->
{#if !listing && !looked}
  <!-- WHILE THE STORE IS READ, THE CARDS' SHELLS AT THEIR SIZE (3 Nov), never a page of nothing. -->
  <PluginSkeleton kind="listing" />
{:else}
<PageHead icon={glyph} kicker={words.plugins} back={STORE_AT} title={listing?.title ?? words.plugins} sentence="" />

<!-- ONE VERSION ON THE VERSIONS TILE: the newest, and each earlier one under the fold. -->
{#snippet versionRow(v: CatalogueVersion)}
  <li class="log-row" data-yanked={v.yanked ? '' : undefined}>
    <!-- THE VERSION AND ITS TAG ON ONE LINE: "1.13.0  New · Published 2 Sep". -->
    <span class="v-line"><span class="v num">{v.version}</span><span class="quiet">{[v.bump ? words.bump[v.bump] : words.first, v.published_at ? words.published(v.published_at) : ''].filter(Boolean).join(' · ')}</span></span>
    <!-- WHAT A VERSION CHANGED IS SAID TO WHOEVER HAD THE ONE BEFORE IT (AM20): to somebody who never had it, "Each book
         keeps its title in Name, as it has since 2.0.0" answered nothing they asked. A first version's note says what it is. -->
    {#if v.notes && noteFor(v)}<span class="notes">{v.notes}</span>{/if}
    {#if v.yanked}<span class="quiet">{words.yanked(v.yanked.reason)}</span>{/if}
    {#if listing?.source === 'kennel' && signedLine(v.signature, ours)}<span class="quiet">{signedLine(v.signature, ours)}</span>{/if}
  </li>
{/snippet}

{#snippet act()}
  {#if filed !== null}
    <p class="said" role="status">{words.asked}{#if filed}{' '}<a class="tap" href={at(`/decide/${filed}`)}>{words.openDecide}</a>{/if}</p>
  {:else if action?.kind === 'installed' && opens}
    <Button weight="primary" href={at(`/p/${opens.id}`)}>{words.open(opens.title)}</Button>
  {:else if action?.kind === 'installed' && pastes}
    <Button weight="primary" href={at('/settings/ingest#texts')}>{words.pasteText}</Button>
  {:else if action?.kind === 'installed' || action?.kind === 'taken'}
    <Button weight="primary" disabled>{label}</Button>
  {:else if trust?.kind === 'changed'}
    <Button disabled={trusting} onclick={() => void trustKey()}>Trust this key</Button>
  {:else if !untrusted}
    <Button weight="primary" disabled={!pressable || planned !== null} onclick={() => void press()}>{label}</Button>
  {/if}
{/snippet}

<div class="page" data-bar={doable ? '' : undefined}>
  {#if !listing}
    {#if looked && storeRefused}
      <Empty kind="error" title={storeRefused}>
        {#snippet actions()}<Button onclick={readStore}>{copy.tryAgain}</Button>{/snippet}
      </Empty>
    {:else if looked}
      <Empty kind="no-results" title={words.missing} body={words.missingBody}>
        {#snippet actions()}<Button href="/plugins">{copy.browseAll}</Button>{/snippet}
      </Empty>
    {/if}
  {:else}
    {#if recordRefused}<Empty kind="error" title={recordRefused} />{/if}

    <div class="tiles">
      <!-- THE LEAD TILE: what it does, whether it is vouched for, and its one button. Who made it heads
           the tile; its version, licence and signature are the Details tile's. -->
      <div class="lead-cell">
        <Tile lead icon={glyph} title={copy.useCaseFor} meta={words.kinds[listing.kind]} aria-label={copy.useCaseFor}>
          <p class="summary">{listing.summary}</p>
          <p class="byline with-icon">
            <Icon name={ours || latest?.signature || latest?.reviewed ? 'check' : 'info'} size="s" />{publisherWords}
            {#if words.held(listing.count, listing.source)}<span class="num quiet-part">{words.held(listing.count, listing.source)}</span>{/if}
          </p>
          {#if said && trustTone}
            <!-- A TONE IS ITS INTENT AND ITS GLYPH, never colour alone: a key its author revoked, or a version that lost its
                 signature, is the danger line, and a key that changed the warning one. -->
            <p class="trust" data-intent={trustTone} data-loud={said.loud ? '' : undefined} role={said.loud ? 'alert' : undefined}>
              <span class="glyph" role="img" aria-label={TONES[trustTone].label}>{TONES[trustTone].glyph}</span><span>{said.text}</span>
            </p>
          {/if}
          {#if ready}
            <!-- AN UPDATE IS READY: what it changes, said before the press. The press opens the plan, which keeps the
                 owner's own edits or shows them as a conflict; nothing here installs. -->
            <div class="ready" role="status">
              <p class="ready-h">{readyWords.heading}</p>
              <p class="quiet">{readyWords.from(ready.from, ready.to)}</p>
              {#if ready.note}<p class="quiet"><span class="ready-k">{readyWords.author}</span> {ready.note}</p>{/if}
              {#if ready.read}
                {#if ready.lines.length > 0}
                  <ul class="ready-lines" aria-label={readyWords.changes}>
                    {#each ready.lines as line, i (i)}<li>{line}</li>{/each}
                  </ul>
                {:else}
                  <p class="quiet">{readyWords.nothing}</p>
                {/if}
              {:else}
                <p class="quiet">{readyWords.unread}</p>
              {/if}
              <p class="quiet">{readyWords.kept}</p>
              <p class="quiet">{readyWords.asks}</p>
            </div>
          {/if}
          <div class="act wide-only">{@render act()}</div>
          {#if refused}
            <p class="said refused" data-intent="bad" role="status" title={refused.code ? copy.refusalCode(refused.code) : undefined}>
              <span class="glyph" role="img" aria-label={TONES.bad.label}>{TONES.bad.glyph}</span><span>{refused.fix}</span>
            </p>
            <!-- A THEME PACK REFUSED AT INSTALL OFFERS "Fix and install": the editor side, staging and the failing
                 roles selected, is built; this is the one press that reaches it from here. -->
            {#if refused.code && FIXABLE.has(refused.code) && hasTheme(file?.doc)}
              <div>
                <Button onclick={() => { stageFix(file?.doc); void goto(at('/settings/appearance')); }}>{copy.lookFixAndInstall}</Button>
              </div>
            {/if}
          {/if}
        </Tile>
      </div>

      <!-- WHAT IT ADDS, BEFORE ANYTHING CHANGES (the site's board): each kind beside its glyph and its count, and what each
           is called; then every host it calls, or that it calls none. Read from the file, never written for the page. -->
      <div class="adds-cell" aria-busy={planRead ? undefined : 'true'}>
        <!-- NO COUNT OVER NOTHING: "What it adds 0" over the hosts it calls read as a mistake. -->
        <!-- NO TOTAL BESIDE THE NAME: 1 list, 1 page, 4 numbers and 8 rules summed to "17", a count of nothing. -->
        <Tile icon="plus" title={words.adds}>
          {#if addsTotal === 0}<p class="quiet">{words.addsNothing}</p>{/if}
          {#if planRows.length > 0}
            <ul class="plan">
              {#each planRows as r (r.key)}
                <li class="plan-row">
                  <Icon name={r.glyph} size="m" />
                  <span class="plan-label">{r.label}</span>
                  <span class="plan-n num">{r.n ?? ''}</span>
                  <span class="plan-names">{r.names}</span>
                </li>
              {/each}
            </ul>
          {:else if file || reach}
            <p class="quiet">{words.addsNothing}</p>
          {:else}
            <p class="quiet" role="status">{words.planning}</p>
          {/if}
        </Tile>
      </div>

      <!-- WHAT IT ASKS FOR, RIGHT AFTER WHAT IT ADDS (store lane E): it is the decision, so it is read before its pages,
           beside the lead on a desk and next on a phone. In plain words: the lists of yours it reads or changes, what it sends where and with which key,
           its scripts and its agents' skills, read from the file it would install. Nothing else is within its reach. -->
      {#if asks}
        <div class="third-cell calls-cell">
          <Tile icon="lock" title={asksWords.title}>
            <ul class="log">
              {#each asks as line, i (i)}<li class="log-row loud">{line}</li>{/each}
            </ul>
            <p class="quiet">{asksWords.note}</p>
          </Tile>
        </div>
      {:else if reach && reach.calls_out.length > 0}
        <div class="third-cell calls-cell">
          <Tile icon="globe" title={words.calls} count={reach.calls_out.length}>
            <ul class="log">
              {#each reach.calls_out as call, i (i)}<li class="log-row loud">{callSaid(call)}</li>{/each}
            </ul>
          </Tile>
        </div>
      {/if}

      <!-- ITS PAGES, DRAWN: the use case's rail and Home, or a plugin's pages through the real renderer, each on a well of
           the ground's colour inside the tile. A listing with no drawing has no tile for one: what it adds already names
           its pages. A drawing that could not be read says so. -->
      <!-- ITS ROOM HELD WHILE THE PREVIEW IS READ (verify6, 2 Nov): a version that says it has one had the tile land over
           Versions and Details once read, and pushed them down by its height (0.10 to 0.15 of the screen at 1512). -->
      {#if u || preview.state === 'ready' || preview.state === 'refused' || previewComing}
        <div class="wide-cell">
          <!-- AN EXAMPLE, SAID SO (AM9): the drawing holds the plugin's own made-up rows, and "Studio rent £1,650" under
               Its pages read as his own rent, on a record whose rent is EGP 12,000. -->
          <Tile icon="projects" title={words.pages}>
            {#if u || preview.state === 'ready'}<p class="quiet">{words.exampleLine}</p>{/if}
            {#if u}
              <Preview preview={previewOf(u)} large />
            {:else if preview.state === 'ready' && preview.preview.pages.length > 0}
              <PreviewPage preview={preview.preview} large lists={declared.filter((d) => typeof d.register === 'string')} />
            {:else if previewComing}
              <div class="preview-held" aria-hidden="true"></div>
            {:else}
              <p class="quiet">{preview.state === 'refused' ? preview.fix : words.noPreview}</p>
            {/if}
          </Tile>
        </div>
      {/if}

      <div class="third-cell versions-cell">
        <Tile icon="history" title={words.versions} count={listing.versions.length}>
          <!-- THE NEWEST VERSION AND WHAT IT CHANGED, then the earlier ones folded: six versions of notes
               were a wall on a phone, and an old note says what a person no longer needs to read. -->
          <ol class="log versions">
            {#each listing.versions.slice(0, 1) as v (v.version)}{@render versionRow(v)}{/each}
          </ol>
          {#if listing.versions.length > 1}
            <details class="earlier">
              <summary class="tap">{words.earlier(listing.versions.length - 1)}</summary>
              <ol class="log versions">
                {#each listing.versions.slice(1) as v (v.version)}{@render versionRow(v)}{/each}
              </ol>
            </details>
          {/if}
        </Tile>
      </div>

      <div class="third-cell details-cell">
        <Tile icon="info" title={words.details}>
          <dl class="facts">
            {#if latest}<dt>{words.version}</dt><dd class="num">{latest.version}</dd>{/if}
            <dt>{words.licence}</dt>
            <dd>{listing.license}</dd>
            {#if listing.source === 'kennel' && signedLine(latest?.signature, ours)}
              <dt>{words.signature}</dt>
              <dd class="with-icon"><Icon name={latest?.signature ? 'key' : 'info'} size="s" />{signedLine(latest?.signature, ours)}</dd>
            {/if}
            <dt>{words.addsModules}</dt>
            <dd>{(reach ?? latest?.reach)?.modules.map(moduleTitle).join(', ') || words.requiresNothing}</dd>
            <!-- A MODULE ADDED HERE WRITES NO EXAMPLE ROWS (`packDocument`), so it says none rather than its seed's. -->
            {#if listing.kind !== 'module' && (adds ? adds.examples : (reach?.examples ?? 0)) > 0}
              <dt>{words.addsExamples}</dt>
              <dd>{words.examples(adds ? adds.examples : (reach?.examples ?? 0))}</dd>
            {/if}
          </dl>
          <!-- SOMEBODY ELSE'S ADD-ON FROM THE STORE CAN BE REPORTED to the person who reviews it (Lane H). -->
          {#if listing.source === 'kennel' && !ours && listing.kind !== 'module'}
            <Report kind={listing.kind === 'usecase' ? 'usecase' : 'pack'} id={listing.id} version={latest?.version} />
          {/if}
        </Tile>
      </div>
    </div>

    {#if planned}
      <PlanSheet
        diff={diffOf(planned)}
        nameOf={(a: string, b?: string) => ((b ?? a) === listing?.id ? listing.title : undefined) ?? names.get(b ?? a) ?? heldList(b ?? a) ?? moduleTitle(b ?? a)}
        fieldOf={fieldLabels}
        hosted={hostedHere(page.data as unknown as Shell)}
        {busy}
        onapprove={() => void approve()}
        oncancel={() => {
          planned = null;
          addingFirst = null;
        }}
        onrecheck={again}
        onkey={putKey}
        uses={addingFirst === null && file ? placesLines(file.doc ?? (file.text ? safeParse(file.text) : null), usedName) : undefined}
        extra={waits.length > 0 || moved ? told : undefined}
      />
    {/if}

    {#snippet told()}
      {#if moved}
        <p class="told-note" role="status">{sheetWords.planMoved}</p>
      {/if}
      {#if waits.length > 0}
        <section class="told" aria-labelledby="told-waits-h">
          <h3 class="told-h" id="told-waits-h">{sheetWords.waits}</h3>
          <ul class="told-lines">
            {#each waits as line (line)}<li>{line}</li>{/each}
          </ul>
          <p class="told-note">{sheetWords.waitsNote}</p>
        </section>
      {/if}
    {/snippet}

    {#if doable}<div class="act narrow-only">{@render act()}</div>{/if}
  {/if}
</div>
{/if}

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    padding: var(--page-head-gap) var(--gutter) var(--page-bottom);
    min-inline-size: 0;
  }

  /**
   * THE TILES, 12 APART: the lead beside what it adds, its pages across the width under them, then its hosts,
   * versions and details in thirds. One column on a phone, in the order they are read.
   */
  .tiles {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
    gap: var(--tile-gap);
    min-inline-size: 0;
  }

  /* EACH TILE AS TALL AS WHAT IT HOLDS (agents F25): Details stretched to the height of Versions left 700px of nothing. */
  .tiles > * {
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
  }

  @media (width >= 900px) {
    /* TWO COLUMNS, 7 TO 5, ON EVERY ROW: the lead beside what it adds, then Versions beside Details. What it calls out
       to, when it calls anywhere, sits over Details in the narrow column. */
    .tiles {
      grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
      grid-auto-flow: row dense;
    }

    .lead-cell,
    .third-cell:not(.calls-cell, .details-cell) {
      grid-column: 1;
    }

    .adds-cell,
    .calls-cell,
    .details-cell {
      grid-column: 2;
    }

    .wide-cell {
      grid-column: 1 / -1;
    }

    /* THE LEAD HOLDS ITS COLUMN WHILE WHAT IT ADDS AND WHAT IT ASKS FOR STACK BESIDE IT. */
    .tiles:has(.calls-cell) .lead-cell {
      grid-row: span 2;
    }
  }

  /* WHILE WHAT IT ADDS IS READ, what comes after it is held out of sight, at most 2.5 s (`planRead`). */
  .adds-cell[aria-busy='true'] ~ :global(*) {
    visibility: hidden;
    animation: plan-shown 0s linear 2.5s forwards;
  }

  @keyframes plan-shown {
    to {
      visibility: visible;
    }
  }

  /* About the height a drawn preview takes under its line, so Versions and Details stay where they land. */
  .preview-held {
    min-block-size: 300px;
  }

  /* WHAT IT DOES, FIRST AND LARGEST: the lead sentence at 16/24 in ink. */
  .summary {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: calc(24px * var(--type, 1));
    text-wrap: pretty;
  }

  .byline,
  .trust,
  .quiet,
  .said {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
    margin: 0;
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  .byline {
    color: var(--ink-2);
  }

  .quiet-part {
    margin-inline-start: var(--sp-2);
    color: var(--ink-3);
  }

  .quiet,
  .said {
    color: var(--ink-3);
  }

  .with-icon {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
  }

  /* THE TRUST LINE: its dot in the intent's fill and its words in ink; a loud one at 500, and a key revoked or a
     signature lost in the danger ink as well, since it is the one thing on the page that needs him first. */
  .trust {
    color: var(--ink-2);
  }

  /* AN UPDATE IS READY: a plain block in the ink, the changes as a short list under the author's note. */
  .ready {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .ready-h {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 600;
    line-height: var(--lead-ui);
  }

  .ready-k {
    color: var(--ink);
    font-weight: 600;
  }

  .ready-lines {
    margin: 0;
    padding-inline-start: var(--sp-4);
    color: var(--ink);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  .trust[data-loud] {
    color: var(--ink);
    font-weight: 500;
  }

  .trust[data-intent='bad'],
  .refused {
    color: var(--red);
    font-weight: 500;
  }

  .act {
    display: flex;
    margin-block-start: var(--sp-2);
  }

  /* THE PLAN'S ROWS, AS THE BOARD DRAWS THEM: a glyph, the kind, its count at the row size and 600, and what each is
     called, a hairline between two. */
  .plan {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .plan-row {
    display: grid;
    grid-template-columns: var(--icon-m) 7rem 2.5rem minmax(0, 1fr);
    column-gap: var(--sp-3);
    align-items: start;
    padding-block: var(--sp-2);
    color: var(--ink-2);
  }


  /* THE GLYPH SITS ON THE FIRST LINE, level with the kind and its count, however many lines the names take. */
  .plan-row > :global(.icon) {
    margin-block-start: 4px;
    color: var(--ink-2);
  }

  .plan-label {
    font-size: var(--fs-meta);
    line-height: calc(24px * var(--type, 1));
  }

  .plan-n {
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 600;
    line-height: calc(24px * var(--type, 1));
    font-variant-numeric: tabular-nums;
  }

  .plan-names {
    min-inline-size: 0;
    padding-block-start: var(--sp-1);
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  .log {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .log-row {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding-block: var(--sp-2);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  .v-line {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--sp-1) var(--sp-3);
  }


  .loud {
    color: var(--ink);
    font-weight: 500;
    overflow-wrap: anywhere;
  }

  .versions .log-row[data-yanked] .v {
    color: var(--ink-3);
    text-decoration: line-through;
  }

  /* A VERSION IS A FIGURE, in tabular figures of the body face and never the identifier face. */
  .v {
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 600;
  }

  .earlier > summary {
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
    cursor: pointer;
  }

  .earlier[open] > summary {
    margin-block-end: var(--sp-2);
  }

  .notes {
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  .facts {
    display: grid;
    grid-template-columns: minmax(6ch, max-content) minmax(0, 1fr);
    gap: var(--sp-2) var(--sp-4);
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  .facts dt {
    color: var(--ink-3);
  }

  .facts dd {
    margin: 0;
    min-inline-size: 0;
    overflow-wrap: anywhere;
  }

  /* THE TWO SENTENCES UNDER THE PLAN: flat text in the sheet's own column, no card of their own. */
  .told {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
  }
  .told-h {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
    font-weight: 500;
  }
  .told-lines {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    margin: 0;
    padding: 0;
    list-style: none;
    color: var(--ink);
    font-size: var(--fs-body);
    overflow-wrap: anywhere;
  }
  .told-note {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-body);
  }

  .narrow-only {
    display: none;
  }


  @media (width < 640px) {
    /* ON A PHONE THE PLAN'S NAMES GO UNDER THE KIND, so each keeps the width to be read. */
    .plan-row {
      grid-template-columns: var(--icon-m) minmax(0, 1fr) auto;
    }

    .plan-names {
      grid-column: 2 / -1;
    }

    .facts {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--sp-1);
    }

    .facts dd {
      margin-block-end: var(--sp-2);
    }

    .wide-only {
      display: none;
    }

    /* THE BUTTON SITS ON THE TAB BAR, fixed to the window as the list's bulk bar is, on a bar of the board's colour with
       one hairline over it, and only while there is something to press. Sticky, it stood a tab bar's height above
       the tab bar with the page showing through the gap. The page ends the bar's height further down, so
       no tile ends underneath it. */
    .narrow-only {
      position: fixed;
      inset-inline: 0;
      inset-block-end: var(--tabbar, env(safe-area-inset-bottom));
      z-index: var(--z-raise);
      display: flex;
      min-block-size: 68px;
      align-items: center;
      padding: var(--sp-3) var(--gutter);
      background: var(--board);
      box-shadow: inset 0 1px 0 var(--rule);
    }

    .page[data-bar] {
      padding-block-end: calc(68px + var(--tabbar, env(safe-area-inset-bottom)) + var(--sp-8));
    }

    .narrow-only > :global(*) {
      flex: 1;
    }
  }
</style>
