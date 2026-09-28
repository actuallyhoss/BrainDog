<!--
  One listing on its own page, for every kind: `/packs/browse/<id>?kind=module|usecase|pack`, `usecase` when no kind is
  said so the links written before add-ons had pages still open (`loop/finish/platform.md` PLT-3, §4.0 L).

  EVERYTHING HERE IS READ FROM THE THING ITSELF, never written for the page: the summary and who published it, a large
  drawing of each page it adds, what it adds (`$lib/market/adds.ts`, from the document the plan is read from), every line
  it would call out with, its versions with their notes, what it needs first, and its licence. So the page cannot
  promise what installing does not do.

  A KENNEL VERSION IS VERIFIED WHEN THE PAGE OPENS: its checksum, and its author's signature when it has one. One that
  does not verify is refused with its sentence and code and nothing can be pressed. A signed one says whether this
  browser has seen that key for its author before, loudly when it is a different key; a key its author revoked, or a
  version that lost the signature earlier ones had, is never offered. The key is kept on first use when the install goes
  through (`catalogue.ts` `keepFirstKey`), and never written over.

  ONE PRIMARY BUTTON: Install, Update, Turn on, or Installed. Install and Update read the record's plan and open the plan
  sheet (`$lib/market/PlanSheet.svelte`, PLT-4's); what installs is what the sheet showed (`./offer.ts`). Somebody the
  record will not let install is refused there, and a Kennel entry is then asked for on Decide instead.
-->
<script lang="ts">
  import { apiBase, at } from '$lib/at.ts';
  import { onMount, untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { createClient } from '@braindog/client';
  import type { CatalogueIndex, Reach, Trust } from '@braindog/declare/catalogue';
  import { useCase } from '@braindog/seed/usecases';
  import { builtInFile, previewOf } from '@braindog/seed/usecases/share';
  import { titleOf } from '$lib/title.ts';
  import { copy } from '$lib/copy.ts';
  import * as pref from '$lib/pref.ts';
  import { read } from '$lib/data/record.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { choose, packDocument, type PackState } from '$lib/record/packs.ts';
  import type { Shell } from '$lib/record/boot-live.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import PlanSheet from '$lib/market/PlanSheet.svelte';
  import PreviewPage from '$lib/market/PreviewPage.svelte';
  import { addsOf, namesOf } from '$lib/market/adds.ts';
  import { readCounts } from '$lib/market/counts.ts';
  import { actionOf, entryOf, latestOf, listingKey, listingsOf, type ListingKind } from '$lib/market/listing.ts';
  import { readVersionPreview, type PreviewRead } from '$lib/market/preview.ts';
  import { words } from '$lib/market/words.ts';
  import { drew } from '../../../../lib/ui/screen.svelte.ts';
  import { hostedHere } from '../../../settings/billing.ts';
  import { moduleTitle } from '../../sharing.ts';
  import Preview from '../Preview.svelte';
  import { browserStore, catalogueText, keepFirstKey, readHostCatalogue, signedWords, trustForEntry, trustWords } from '../catalogue.ts';
  import { FIXABLE, hasTheme, stageFix } from '$lib/theme/staged.ts';
  import { askOnDecide, diffOf, install, notOwner, planFor, turnOn, type OfferClient, type Planned } from './offer.ts';

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
     whatever else goes by that id: `/packs/browse/launch-desk` said "nothing here by that name" for an add-on the
     catalogue lists (design.md §2.8). A kind that is said is kept to. */
  const listing = $derived.by(() => {
    const all = listingsOf({ kennel, counts });
    const exact = all.find((l) => l.key === listingKey(kind, id));
    if (exact || page.url.searchParams.has('kind')) return exact ?? null;
    return all.find((l) => l.id === id) ?? null;
  });
  const entry = $derived(listing ? entryOf(kennel, listing) : null);
  const u = $derived(listing?.kind === 'usecase' && listing.source === 'bundled' ? useCase(listing.id) : undefined);
  const latest = $derived(listing ? latestOf(listing) : null);
  const action = $derived(listing && states ? actionOf(listing, states) : null);

  /* ── the file, verified ─────────────────────────────────────────────────── */

  /** The document the plan is read from and the page describes, with a use case's file text; `null` until read. */
  let file = $state.raw<{ doc: Record<string, unknown> | null; text: string | null } | null>(null);
  /** What it can reach, computed from the file for a built-in and by the catalogue for a Kennel entry. */
  let reach = $state.raw<Reach | null>(null);
  /** A Kennel version that did not verify, or a plan or install the record refused. */
  let refused = $state<{ fix: string; code: string | null } | null>(null);
  let trust = $state.raw<Trust | null>(null);
  const said = $derived(trust && listing ? trustWords(trust, listing.author) : null);
  const untrusted = $derived(trust?.kind === 'revoked' || trust?.kind === 'stripped');
  let preview = $state.raw<PreviewRead>({ state: 'none' });

  const adds = $derived(file ? addsOf(file.doc ?? (file.text ? safeParse(file.text) : null)) : null);
  const names = $derived(file ? namesOf(file.doc ?? (file.text ? safeParse(file.text) : null)) : new Map<string, string>());

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
        const t = await trustForEntry(browserStore(), e, v.version, got.signature, kennel?.keys);
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

  onMount(() => {
    void readHostCatalogue(fetch).then((got) => {
      kennel = got.ok ? got.index : null;
      looked = true;
    });
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

  /* ── the one button ─────────────────────────────────────────────────────── */

  let busy = $state(false);
  let planned = $state.raw<Planned | null>(null);
  /** A Kennel entry asked for on Decide: the proposal id, empty when the record named none. */
  let filed = $state<string | null>(null);

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
        return;
      }
      if (action.kind !== 'install' && action.kind !== 'update') return;
      const out = await planFor(client, listing, file, states, copy.writeRaced);
      if (out.ok) planned = out.planned;
      else refused = out;
    } finally {
      busy = false;
    }
  }

  async function approve() {
    if (!listing || !client || !states || !planned) return;
    const p = planned;
    busy = true;
    try {
      const out = await install(client, p, states, pref.read().nav ?? [], copy.writeRaced);
      if (out.ok) {
        if (out.nav) pref.write({ nav: out.nav });
        if (entry && trust) await keepFirstKey(browserStore(), `${entry.kind}:${entry.id}`, trust);
        toasts.push(copy.shareInstalled(listing.title), { intent: 'good' });
        planned = null;
      } else if (entry && notOwner(out.code)) {
        planned = null;
        const asked = await askOnDecide(client, entry, action?.kind === 'update' ? action.from : null);
        if (asked.ok) filed = asked.id;
        else refused = asked;
      } else {
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

<svelte:head><title>{titleOf(listing?.title ?? copy.browseTitle)}</title></svelte:head>

<!-- THE WAY BACK IS THE HEAD'S: a kicker at 1440 and the back link in the phone's bar, on the gutter like every detail
     page's, where a bare button above the lead sat off it (design.md §2.8). -->
<PageHead icon="packs" kicker={copy.browseTitle} back="/packs/browse" title={listing?.title ?? copy.browseTitle} />

{#snippet act()}
  {#if filed !== null}
    <p class="said" role="status">{words.asked}{#if filed}{' '}<a class="tap" href={at(`/decide/${filed}`)}>{words.openDecide}</a>{/if}</p>
  {:else if action?.kind === 'installed'}
    <Button weight="primary" disabled>{label}</Button>
  {:else if !untrusted}
    <Button weight="primary" disabled={!pressable || planned !== null} onclick={() => void press()}>{label}</Button>
  {/if}
{/snippet}

<div class="page">
  {#if !listing}
    {#if looked}
      <Empty kind="no-results" title={words.missing} body={words.missingBody}>
        {#snippet actions()}<Button href="/packs/browse">{copy.browseAll}</Button>{/snippet}
      </Empty>
    {/if}
  {:else}
    {#if recordRefused}<Empty kind="error" title={recordRefused} />{/if}

    <!-- IT LEADS WITH WHAT IT DOES AND ITS ONE BUTTON (design.md DSN-17); who made it and whether that is vouched for
         follow on one line, and its version, licence and signature are the Details section's. -->
    <section class="lead" aria-label={copy.useCaseFor}>
      <p class="summary">{listing.summary}</p>
      {#if said}<p class="trust" data-loud={said.loud ? '' : undefined} role={said.loud ? 'alert' : undefined}>{#if said.loud}<Icon name="alert" size="s" />{/if}{said.text}</p>{/if}
      <div class="act wide-only">{@render act()}</div>
      <p class="meta">
        <span>{words.kinds[listing.kind]}</span>
        <span class="with-icon"><Icon name={listing.source === 'bundled' || latest?.signature || latest?.reviewed ? 'check' : 'info'} size="s" />{publisherWords}</span>
        {#if listing.count !== null}<span class="num">{words.installs(listing.count)}</span>{/if}
      </p>
      {#if refused}
        <p class="said" role="status">{refused.fix}{#if refused.code}<span class="code">{copy.refusalCode(refused.code)}</span>{/if}</p>
        <!-- A THEME PACK REFUSED AT INSTALL OFFERS "Fix and install" (GAP-3): the editor side, staging and the failing
             roles selected, is built; this is the one press that reaches it from here. -->
        {#if refused.code && FIXABLE.has(refused.code) && hasTheme(file?.doc)}
          <Button onclick={() => { stageFix(file?.doc); void goto(at('/settings/appearance')); }}>{copy.lookFixAndInstall}</Button>
        {/if}
      {/if}
    </section>

    {#if planned}
      <PlanSheet
        diff={diffOf(planned)}
        nameOf={(a: string, b?: string) => names.get(b ?? a) ?? moduleTitle(b ?? a)}
        hosted={hostedHere(page.data as unknown as Shell)}
        {busy}
        onapprove={() => void approve()}
        oncancel={() => (planned = null)}
      />
    {/if}

    <!-- SECTIONS, NOT PANELS: a heading and what it heads, on the page's own ground, so the drawing is the one surface. -->
    <section class="panel drawing" aria-labelledby="d-pages">
      <h2 class="panel-h" id="d-pages">{words.pages}</h2>
      {#if u}
        <Preview preview={previewOf(u)} large />
      {:else if preview.state === 'ready' && preview.preview.pages.length > 0}
        <PreviewPage preview={preview.preview} large />
      {:else}
        <p class="quiet">{preview.state === 'refused' ? preview.fix : words.noPreview}</p>
      {/if}
    </section>

    <div class="grid">
      <section class="panel" aria-labelledby="d-adds">
        <h2 class="panel-h" id="d-adds">{words.adds}</h2>
        {#if adds && adds.lists.length + adds.pages.length + adds.figures.length + adds.rules.length > 0}
          <dl class="facts">
            {#if adds.lists.length > 0}
              <dt>{words.addsLists}</dt>
              <dd>
                <ul class="names">
                  {#each adds.lists as l (l.id)}<li><Icon name="rows" size="s" /><span class="name">{l.name}</span>{#if l.fields.length > 0}<span class="small">{l.fields.join(', ')}</span>{/if}</li>{/each}
                </ul>
              </dd>
            {/if}
            {#if adds.pages.length > 0}
              <dt>{words.addsPages}</dt>
              <dd>
                <ul class="names">
                  {#each adds.pages as p (p.id)}<li><Icon name="doc" size="s" />{p.title}</li>{/each}
                </ul>
              </dd>
            {/if}
            {#if adds.figures.length > 0}
              <dt>{words.addsFigures}</dt>
              <dd>
                <ul class="names">
                  {#each adds.figures as f (f.id)}<li><span class="name">{f.name}</span>{#if f.target || f.window}<span class="small">{[f.target, f.window].filter(Boolean).join(', ')}</span>{/if}</li>{/each}
                </ul>
              </dd>
            {/if}
            {#if adds.rules.length > 0}
              <dt>{words.addsRules}</dt>
              <dd>
                <ul class="names">
                  {#each adds.rules as r, i (i)}<li>{r}</li>{/each}
                </ul>
              </dd>
            {/if}
            <dt>{words.addsExamples}</dt>
            <dd>{words.examples(adds.examples)}</dd>
          </dl>
        {:else if reach && reach.lists.length + reach.pages.length > 0}
          <dl class="facts">
            {#if reach.lists.length > 0}<dt>{words.addsLists}</dt><dd>{reach.lists.join(', ')}</dd>{/if}
            {#if reach.pages.length > 0}<dt>{words.addsPages}</dt><dd>{reach.pages.join(', ')}</dd>{/if}
            <dt>{words.addsExamples}</dt><dd>{words.examples(reach.examples)}</dd>
          </dl>
        {:else}
          <p class="quiet">{words.addsNothing}</p>
        {/if}
      </section>

      <section class="panel" aria-labelledby="d-calls">
        <h2 class="panel-h" id="d-calls">{words.calls}</h2>
        {#if reach && reach.calls_out.length > 0}
          <ul class="names">
            {#each reach.calls_out as call, i (i)}<li class="loud"><Icon name="globe" size="s" />{call.line}</li>{/each}
          </ul>
        {:else if reach}
          <p class="quiet with-icon"><Icon name="check" size="s" />{words.callsNothing}</p>
        {/if}
      </section>

      <section class="panel" aria-labelledby="d-versions">
        <h2 class="panel-h" id="d-versions">{words.versions}</h2>
        <ol class="versions">
          {#each listing.versions as v (v.version)}
            <li data-yanked={v.yanked ? '' : undefined}>
              <span class="v num">{v.version}</span>
              <span class="quiet">{v.bump ? words.bump[v.bump] : words.first}{#if v.published_at}{' · '}{words.published(v.published_at)}{/if}</span>
              {#if v.notes}<span class="notes">{v.notes}</span>{/if}
              {#if v.yanked}<span class="quiet">{words.yanked(v.yanked.reason)}</span>{/if}
              {#if listing.source === 'kennel'}<span class="quiet small">{signedWords(v.signature)}</span>{/if}
            </li>
          {/each}
        </ol>
      </section>

      <section class="panel" aria-labelledby="d-details">
        <h2 class="panel-h" id="d-details">{words.details}</h2>
        <dl class="facts">
          {#if latest}<dt>{words.version}</dt><dd class="num">{latest.version}</dd>{/if}
          <dt>{words.licence}</dt>
          <dd>{listing.license}</dd>
          {#if listing.source === 'kennel'}
            <dt>{words.signature}</dt>
            <dd class="with-icon"><Icon name={latest?.signature ? 'key' : 'info'} size="s" />{signedWords(latest?.signature)}</dd>
          {/if}
          <dt>{words.addsModules}</dt>
          <dd>{(reach ?? latest?.reach)?.modules.map(moduleTitle).join(', ') || words.requiresNothing}</dd>
        </dl>
      </section>
    </div>

    <div class="act narrow-only">{@render act()}</div>
  {/if}
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--sp-4);
    padding: var(--sp-5) var(--gutter) var(--sp-9);
    max-inline-size: var(--page-max);
    min-inline-size: 0;
  }

  .page > :global(*) {
    max-inline-size: 100%;
  }

  .lead {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    inline-size: 100%;
    max-inline-size: 70ch;
  }

  .quiet,
  .said {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
    margin: 0;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  /* META WRAPS AS WHOLE ITEMS, with space between them and no separator glyph to lead a wrapped line. */
  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    column-gap: var(--sp-4);
    row-gap: var(--sp-1);
    margin: 0;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .with-icon {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
  }

  /* WHAT IT DOES, FIRST AND LARGEST: the page's lead sentence at the section-title size. */
  .summary {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-md);
    line-height: var(--lh-body);
    text-wrap: pretty;
  }

  .trust {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  .trust[data-loud] {
    color: var(--ink);
    font-weight: 600;
  }

  .code {
    color: var(--dim);
    font-family: var(--font-id);
    font-size: var(--t-xs);
  }

  .act {
    margin-block: var(--sp-2);
  }

  .drawing {
    inline-size: 100%;
    margin-block-start: var(--sp-4);
  }

  /* TWO COLUMNS OF SECTIONS FROM 640PX, one on a phone, with the section gap between them and no edge around any. */
  .grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--sp-6) var(--sp-7);
    inline-size: 100%;
    margin-block-start: var(--sp-4);
  }

  .panel {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  /* A SECTION TITLE, as `Section.svelte` draws one: the body face at the section size, 600, in ink. */
  .panel-h {
    font-family: var(--font-ui);
    font-size: var(--t-md);
    font-weight: 600;
    color: var(--ink);
  }

  .facts {
    display: grid;
    grid-template-columns: minmax(6ch, max-content) minmax(0, 1fr);
    gap: var(--sp-2) var(--sp-4);
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-sm);
    line-height: 1.5;
  }

  .facts dt {
    color: var(--dim);
    font-weight: 500;
  }

  .facts dd {
    margin: 0;
    min-inline-size: 0;
  }

  .names,
  .versions {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .names li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  .name {
    color: var(--ink);
  }

  .small {
    inline-size: 100%;
    color: var(--dim);
    font-size: var(--t-xs);
  }

  .loud {
    color: var(--ink);
    font-weight: 600;
  }

  .versions li {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
  }

  .versions li[data-yanked] .v {
    text-decoration: line-through;
    color: var(--dim);
  }

  /* A VERSION IS A FIGURE, in tabular figures of the body face and never the identifier face (design-brief §11.4). */
  .v {
    color: var(--ink);
    font-size: var(--t-sm);
    font-weight: 500;
  }

  .notes {
    color: var(--ink2);
    font-size: var(--t-sm);
    line-height: 1.5;
  }

  .narrow-only {
    display: none;
  }

  @media (width < 640px) {
    .grid {
      grid-template-columns: minmax(0, 1fr);
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

    /* THE BUTTON STICKS TO THE BOTTOM OF THE SCREEN, above the tab bar and the home indicator (`--tabbar`), for as long
       as the page scrolls: it is last in the page so a sticky bottom holds it there, and settles under the last section.
       Its bar is the button and a step of space each side, no taller than `--sticky`. */
    .narrow-only {
      position: sticky;
      inset-block-end: var(--tabbar, env(safe-area-inset-bottom));
      display: flex;
      inline-size: 100%;
      padding-block: var(--sp-1);
      background: var(--bg);
      border-block-start: 1px solid var(--line-soft);
    }

    .narrow-only > :global(*) {
      flex: 1;
    }
  }
</style>
