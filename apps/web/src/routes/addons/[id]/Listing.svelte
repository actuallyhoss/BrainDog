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
  import { onMount, untrack } from 'svelte';
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
  import { words as planWords } from '$lib/market/plan.ts';
  import { wantsPassphrase } from '$lib/record/keychain.ts';
  import PreviewPage from '$lib/market/PreviewPage.svelte';
  import { addsOf, fieldsOf, namesOf } from '$lib/market/adds.ts';
  import { readCounts } from '$lib/market/counts.ts';
  import { actionOf, entryOf, latestOf, listingKey, listingsOf, unlistedListing, type ListingKind } from '$lib/market/listing.ts';
  import { readVersionPreview, type PreviewRead } from '$lib/market/preview.ts';
  import { words } from '$lib/market/words.ts';
  import { readyFor, readyWords, type Ready } from '$lib/market/update-ready.ts';
  import { drew } from '../../../lib/ui/screen.svelte.ts';
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
  type PlanRow = { key: string; glyph: IconName; label: string; n: number; names: string };
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
    const read = adds && adds.lists.length + adds.pages.length + adds.figures.length + adds.rules.length > 0 ? adds : null;
    if (read) {
      push('lists', 'rows', words.addsLists, read.lists.map((l) => l.name));
      push('pages', 'doc', words.addsPages, read.pages.map(pageTitle));
      push('figures', 'activity', words.addsFigures, read.figures.map((f) => f.name), '; ');
      push('rules', 'skill', words.addsRules, read.rules, '; ');
    } else if (reach) {
      push('lists', 'rows', words.addsLists, reach.lists);
      push('pages', 'doc', words.addsPages, reach.pages);
      push('rules', 'skill', words.addsRules, reach.rules, '; ');
    }
    if (reach) {
      const hosts = [...new Set(reach.calls_out.map((c) => c.host ?? '').filter((h) => h !== ''))];
      rows.push({ key: 'hosts', glyph: 'globe', label: words.calledHosts, n: hosts.length, names: hosts.length > 0 ? hosts.join(', ') : words.callsNothing });
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

  /** How many things it adds, for the tile's count; `null` until the file or its reach is read. */
  const addsTotal = $derived(planRows.length === 0 ? null : planRows.filter((r) => r.key !== 'hosts').reduce((n, r) => n + r.n, 0));

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
    if (!l || !v) return;
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
    })();
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
      return true;
    });
  });

  /* ONLY A LISTING THAT EXISTS SAYS READY. The missing one is `Empty`'s to report. Calling `drew('empty')` from this
     effect would read what it writes and loop (`effect_update_depth_exceeded`), as it once did on this page. */
  $effect(() => {
    if (listing) drew('ready');
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

  /* WHAT THE NEW VERSION CHANGES, for a record that holds an earlier one of an add-on from outside: read from the two
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
     often, and the parts left out until the record holds a list. Both are empty for most add-ons, and then nothing is
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
      /* WHAT ELSE WAITS IS READ ONLY FOR A PLAN THAT HAS SOMETHING TO WAIT FOR (`offer.ts` `afterOthers`): an update
         another one hands something to goes in after it, on the one sheet, instead of a stop nobody can clear here. */
      const held = states;
      const out = await planFor(client, listing, file, held, copy.writeRaced, () => waitingOf(fetch, kennel, held));
      if (out.ok) planned = out.planned;
      else refused = out;
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
   */
  async function putKey(label: string, value: string, passphrase: string): Promise<{ ok: true } | { ok: false; fix: string; pass?: boolean }> {
    const out = await createClient({ base: apiBase() })
      .putKey({ label, value, ...(passphrase === '' ? {} : { passphrase }) })
      .catch(() => null);
    if (out?.ok) {
      toasts.push(planWords.keyAdded(label), { intent: 'good' });
      return { ok: true };
    }
    if (out && 'refusal' in out) return { ok: false, fix: out.refusal.fix, ...(wantsPassphrase(out) ? { pass: true } : {}) };
    return { ok: false, fix: copy.writeRaced };
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
    busy = true;
    try {
      const out = await install(client, p, states, pref.read().nav ?? [], copy.writeRaced);
      if (out.ok) {
        if (out.nav) pref.write({ nav: out.nav });
        if (entry && trust) await keepFirstKey(keys, `${entry.kind}:${entry.id}`, trust);
        /* A run that took other updates in first names them (`offer.ts` `installInTurn`), so nobody finds one moved unsaid. */
        toasts.push(out.first ? turnWords.installedAfter(listing.title, out.first) : copy.shareInstalled(listing.title), { intent: 'good' });
        planned = null;
        await reread();
        await railAgain();
        return;
      } else if (entry && notOwner(out.code)) {
        wentIn(out);
        planned = null;
        const asked = await askOnDecide(client, entry, action?.kind === 'update' ? action.from : null);
        if (asked.ok) filed = asked.id;
        else refused = asked;
      } else if (out.code === 'PLAN_STALE' && !out.first && file) {
        /* THE PLAN SAYS SOMETHING ELSE NOW: the record installs a plan that only moved in time by itself, so this one
           changed what the add-on would do. Read again and shown, with one line over it, never a refusal to press past. */
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
        refused = out;
      }
      await reread();
    } finally {
      busy = false;
    }
  }

  const label = $derived(
    busy && planned === null
      ? words.planning
      : action?.kind === 'update'
        ? words.update(action.to)
        : action?.kind === 'turn-on'
          ? words.turnOn(listing?.title ?? '')
          : action?.kind === 'installed'
            ? words.installed
            : words.install(listing?.title ?? ''),
  );
  /* ONCE IT IS IN, ITS FIRST PAGE, so one press lands on what it brought (`offer.ts` `firstPageOf`). */
  const opens = $derived(adds ? firstPageOf(adds.pages, declared) : null);
  /* SOMETHING TO PRESS: the phone's bar is drawn only then, and never to say "Installed" over the last tile. */
  const doable = $derived(listing !== null && listing !== undefined && filed === null && (action?.kind !== 'installed' || opens !== null) && (trust?.kind === 'changed' || !untrusted));

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

<svelte:head><title>{titleOf(listing?.title, copy.packs)}</title></svelte:head>

<!-- THE WAY BACK IS THE HEAD'S: a kicker at 1440 and the back link in the phone's bar, on the gutter like every detail
     page's, where a bare button above the lead sat off it. -->
<PageHead icon={glyph} kicker={copy.packs} back="/addons" title={listing?.title ?? copy.packs} />

<!-- ONE VERSION ON THE VERSIONS TILE: the newest, and each earlier one under the fold. -->
{#snippet versionRow(v: CatalogueVersion)}
  <li class="log-row" data-yanked={v.yanked ? '' : undefined}>
    <!-- THE VERSION AND ITS TAG ON ONE LINE: "1.13.0  New · Published 2 Sep". -->
    <span class="v-line"><span class="v num">{v.version}</span><span class="quiet">{[v.bump ? words.bump[v.bump] : words.first, v.published_at ? words.published(v.published_at) : ''].filter(Boolean).join(' · ')}</span></span>
    {#if v.notes}<span class="notes">{v.notes}</span>{/if}
    {#if v.yanked}<span class="quiet">{words.yanked(v.yanked.reason)}</span>{/if}
    {#if listing?.source === 'kennel' && signedLine(v.signature, ours)}<span class="quiet">{signedLine(v.signature, ours)}</span>{/if}
  </li>
{/snippet}

{#snippet act()}
  {#if filed !== null}
    <p class="said" role="status">{words.asked}{#if filed}{' '}<a class="tap" href={at(`/decide/${filed}`)}>{words.openDecide}</a>{/if}</p>
  {:else if action?.kind === 'installed' && opens}
    <Button weight="primary" href={at(`/p/${opens.id}`)}>{words.open(opens.title)}</Button>
  {:else if action?.kind === 'installed'}
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
        {#snippet actions()}<Button href="/addons">{copy.browseAll}</Button>{/snippet}
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
      <div class="adds-cell">
        <!-- NO COUNT OVER NOTHING: "What it adds 0" over the hosts it calls read as a mistake. -->
        <Tile icon="plus" title={words.adds} count={addsTotal || undefined}>
          {#if addsTotal === 0}<p class="quiet">{words.addsNothing}</p>{/if}
          {#if planRows.length > 0}
            <ul class="plan">
              {#each planRows as r (r.key)}
                <li class="plan-row">
                  <Icon name={r.glyph} size="m" />
                  <span class="plan-label">{r.label}</span>
                  <span class="plan-n num">{r.n}</span>
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

      <!-- ITS PAGES, DRAWN: the use case's rail and Home, or an add-on's pages through the real renderer, each on a well of
           the ground's colour inside the tile. A listing with no drawing has no tile for one: what it adds already names
           its pages. A drawing that could not be read says so. -->
      {#if u || preview.state === 'ready' || preview.state === 'refused'}
        <div class="wide-cell">
          <Tile icon="projects" title={words.pages}>
            {#if u}
              <Preview preview={previewOf(u)} large />
            {:else if preview.state === 'ready' && preview.preview.pages.length > 0}
              <PreviewPage preview={preview.preview} large lists={declared.filter((d) => typeof d.register === 'string')} />
            {:else}
              <p class="quiet">{preview.state === 'refused' ? preview.fix : words.noPreview}</p>
            {/if}
          </Tile>
        </div>
      {/if}

      {#if reach && reach.calls_out.length > 0}
        <div class="third-cell calls-cell">
          <Tile icon="globe" title={words.calls} count={reach.calls_out.length}>
            <ul class="log">
              {#each reach.calls_out as call, i (i)}<li class="log-row loud">{callSaid(call)}</li>{/each}
            </ul>
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
        </Tile>
      </div>
    </div>

    {#if planned}
      <PlanSheet
        diff={diffOf(planned)}
        nameOf={(a: string, b?: string) => names.get(b ?? a) ?? heldList(b ?? a) ?? moduleTitle(b ?? a)}
        fieldOf={fieldLabels}
        hosted={hostedHere(page.data as unknown as Shell)}
        {busy}
        onapprove={() => void approve()}
        oncancel={() => (planned = null)}
        onrecheck={again}
        onkey={putKey}
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

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    padding: var(--sp-5) var(--gutter) var(--sp-9);
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

    .tiles:has(.calls-cell) .versions-cell {
      grid-row: span 2;
    }
  }

  /* WHAT IT DOES, FIRST AND LARGEST: the lead sentence at 16/24 in ink. */
  .summary {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: 24px;
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
    line-height: 18px;
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
    line-height: 20px;
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
    line-height: 18px;
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

  .plan-row + .plan-row {
    border-block-start: 1px solid var(--rule);
  }

  /* THE GLYPH SITS ON THE FIRST LINE, level with the kind and its count, however many lines the names take. */
  .plan-row > :global(.icon) {
    margin-block-start: 4px;
    color: var(--ink-2);
  }

  .plan-label {
    font-size: var(--fs-meta);
    line-height: 24px;
  }

  .plan-n {
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 600;
    line-height: 24px;
    font-variant-numeric: tabular-nums;
  }

  .plan-names {
    min-inline-size: 0;
    padding-block-start: var(--sp-1);
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: 18px;
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
    line-height: 18px;
  }

  .v-line {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--sp-1) var(--sp-3);
  }

  .log-row + .log-row {
    border-block-start: 1px solid var(--rule);
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
    cursor: pointer;
  }

  .earlier[open] > summary {
    margin-block-end: var(--sp-2);
  }

  .notes {
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: 18px;
  }

  .facts {
    display: grid;
    grid-template-columns: minmax(6ch, max-content) minmax(0, 1fr);
    gap: var(--sp-2) var(--sp-4);
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-meta);
    line-height: 18px;
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

  @media (width < 900px) {
    .page {
      padding: var(--sp-4) var(--gutter) var(--sp-8);
    }
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
