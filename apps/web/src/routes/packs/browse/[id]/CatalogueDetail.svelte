<!--
  One use case or add-on from this BrainDog's catalogue, on its own page: `/packs/browse/<id>?from=catalogue`, with
  `&kind=pack` for an add-on (`../catalogue.ts`).

  WHAT IT CAN REACH, WHAT CHANGED, AND EVERY VERSION, each read from the files as the catalogue published them: the
  modules it installs first, its lists, pages and rules, example rows and skills, and every line it would call out with.
  An update says what moved from the version installed here, when the catalogue still holds that version.

  THE LATEST FILE IS VERIFIED WHEN THE PAGE OPENS: its checksum, and its author's signature when it has one. One that does
  not verify is refused with its sentence and code, and nothing can be asked for. A signed one says whether this browser
  has seen that key for its author before, and loudly when it is a different key; the key is kept on first use, or when a
  key already seen named it in the catalogue's rotation statement, when the person asks for the version, and never written
  over. A key its author revoked is said with their reason, and nothing it signed can be asked for.

  EITHER KIND IS ASKED FOR ON DECIDE, as an update is: the file is fetched and verified again, read, and filed as a
  proposal (a use case as its file, an add-on as its id and document) the owner accepts there, where the record's own plan
  says what it adds and every line it calls out with. The sample says what it would ask and files nothing.
-->
<script lang="ts">
  import { at } from '$lib/at.ts';
  import type { createClient } from '@braindog/client';
  import type { CatalogueEntry, Changes, KeyStatements, Trust } from '@braindog/declare/catalogue';
  import { copy } from '$lib/copy.ts';
  import type { PackState } from '$lib/record/packs.ts';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { moduleTitle } from '../../sharing.ts';
  import { askForVersion, browserStore, catalogueText, changesSince, keepFirstKey, signedWords, standingOf, trustForEntry, trustWords, type Standing } from '../catalogue.ts';

  let {
    entry,
    client,
    live,
    states,
    keys,
  }: { entry: CatalogueEntry; client: ReturnType<typeof createClient> | null; live: boolean; states: readonly PackState[]; keys?: KeyStatements | undefined } = $props();

  const latest = $derived(entry.versions[0]);
  const reach = $derived(latest?.reach);
  const audience = $derived(entry.kind === 'pack' ? copy.catalogueAddon : ((copy.shareAudiences as Record<string, string>)[entry.audience] ?? copy.shareAudiences.other));
  const kindWord = (kind: string) => copy.proposalKind(kind).toLowerCase();

  let standing = $state<Standing | null>(null);
  let changes = $state<Changes | null>(null);
  let refused = $state<{ fix: string; code: string | null } | null>(null);
  let busy = $state(false);
  /** The latest file checked when the page opens: `null` until then. */
  let checked = $state<{ ok: boolean } | null>(null);
  let trust = $state<Trust | null>(null);
  const said = $derived(trust ? trustWords(trust, entry.author) : null);
  /** A version asked for: the proposal id, empty when the record named none. */
  let filed = $state<string | null>(null);
  let would = $state<string | null>(null);

  $effect(() => {
    const held = states;
    void standingOf(entry, held).then(async (s) => {
      standing = s;
      changes = s.kind === 'update' && s.from !== '' ? await changesSince(fetch, entry, s.from) : null;
    });
  });

  $effect(() => {
    const version = latest;
    if (!version) return;
    void catalogueText(fetch, entry, version).then(async (got) => {
      if (!got.ok) {
        refused = { fix: got.fix, code: got.code };
        checked = { ok: false };
        return;
      }
      trust = await trustForEntry(browserStore(), entry, version.version, got.signature, keys);
      checked = { ok: true };
    });
  });

  /** The version installed here, for an update's question. */
  const from = (): string | null => (standing?.kind === 'update' && standing.from !== '' ? standing.from : null);

  async function ask() {
    if (!latest || busy || trust?.kind === 'revoked' || trust?.kind === 'stripped') return;
    refused = null;
    if (!live || !client) {
      would = copy.catalogueWouldAsk(entry.title, latest.version);
      return;
    }
    const c = client;
    busy = true;
    try {
      const out = await askForVersion(fetch, (name, args) => c.call(name, args), entry, latest, from());
      if (!out.ok) {
        refused = { fix: out.fix, code: out.code };
        return;
      }
      filed = out.id;
      const now = await trustForEntry(browserStore(), entry, latest.version, out.signature, keys);
      trust = now;
      await keepFirstKey(browserStore(), `${entry.kind}:${entry.id}`, now);
    } finally {
      busy = false;
    }
  }

</script>

<section class="lead" aria-label={copy.useCaseFor}>
  <p class="for">{audience} · {copy.catalogueHeading}</p>
  <p class="summary">{entry.summary}</p>
  <p class="meta">{copy.useCaseVersion(entry.latest, entry.author, entry.license)}</p>
  <p class="meta key"><Icon name={latest?.signature ? 'key' : 'info'} size="s" />{signedWords(latest?.signature)}</p>
  {#if said}<p class="trust" data-loud={said.loud ? '' : undefined} role={said.loud ? 'alert' : undefined}>{#if said.loud}<Icon name="alert" size="s" />{/if}{said.text}</p>{/if}
  <p class="meta">{copy.catalogueBlurb}</p>
  <div class="offer">
    {#if standing?.kind === 'current'}
      <p class="said"><Icon name="check" size="s" />{copy.catalogueCurrent(entry.latest)}</p>
    {:else if standing?.kind === 'ahead'}
      <p class="said">{copy.catalogueAhead(standing.at)}</p>
    {:else if standing?.kind === 'off'}
      <p class="said">{copy.catalogueOff}</p>
    {:else if standing && checked?.ok && trust?.kind !== 'revoked' && trust?.kind !== 'stripped'}
      {#if filed !== null}
        <p class="said" role="status">{copy.catalogueAsked}{#if filed}{' '}<a class="tap" href={at(`/decide/${filed}`)}>{copy.pollOpenDecide}</a>{/if}</p>
      {:else}
        <Button weight="primary" disabled={busy} onclick={() => void ask()}>
          {standing.kind === 'update' ? copy.catalogueAskUpdate(entry.latest) : copy.catalogueAsk}
        </Button>
      {/if}
      {#if would}<p class="said" role="status">{would}</p>{/if}
    {/if}
    {#if refused}<p class="said" role="status">{refused.fix}{#if refused.code}<span class="code">{copy.refusalCode(refused.code)}</span>{/if}</p>{/if}
  </div>
</section>

<div class="grid">
  {#if standing?.kind === 'update'}
    <section class="panel wide" aria-labelledby="cat-changed">
      <h2 class="panel-h" id="cat-changed">{copy.catalogueChanged(standing.from, entry.latest)}</h2>
      {#if changes}
        <dl class="facts">
          {#if changes.added.length > 0}<dt>{copy.arrangeAdds}</dt><dd>{changes.added.map((c) => `${c.title} (${kindWord(c.kind)})`).join(', ')}</dd>{/if}
          {#if changes.removed.length > 0}<dt class="loud">{copy.catalogueRemoved}</dt><dd class="loud">{changes.removed.map((c) => `${c.title} (${kindWord(c.kind)})`).join(', ')}</dd>{/if}
          {#if changes.changed.length > 0}<dt>{copy.catalogueAltered}</dt><dd>{changes.changed.map((c) => `${c.title} (${kindWord(c.kind)})`).join(', ')}</dd>{/if}
          {#if changes.modules.added.length > 0}<dt>{copy.catalogueModulesNew}</dt><dd>{changes.modules.added.map(moduleTitle).join(', ')}</dd>{/if}
          {#if changes.hosts.added.length > 0}<dt class="loud">{copy.catalogueHostsNew}</dt><dd class="loud">{changes.hosts.added.join(', ')}</dd>{/if}
          {#if changes.hosts.removed.length > 0}<dt>{copy.catalogueHostsGone}</dt><dd>{changes.hosts.removed.join(', ')}</dd>{/if}
          {#if changes.examples.from !== changes.examples.to}<dt>{copy.diffSeeds}</dt><dd>{changes.examples.from} → {changes.examples.to}</dd>{/if}
          {#if changes.words}<dd class="span">{copy.catalogueWords}</dd>{/if}
          {#if changes.added.length + changes.removed.length + changes.changed.length + changes.hosts.added.length === 0 && !changes.words}<dd class="span">{copy.catalogueNothing}</dd>{/if}
        </dl>
      {:else}
        <p class="quiet">{copy.catalogueChangedUnknown}</p>
      {/if}
    </section>
  {/if}

  {#if reach}
    <section class="panel" aria-labelledby="cat-reach">
      <h2 class="panel-h" id="cat-reach">{copy.catalogueReach}</h2>
      <dl class="facts">
        {#if reach.modules.length > 0}<dt>{copy.useCaseModulesFirst}</dt><dd>{reach.modules.map(moduleTitle).join(', ')}</dd>{/if}
        <dt>{copy.browseLists}</dt><dd>{reach.lists.join(', ') || '0'}</dd>
        <dt>{copy.useCasePages}</dt><dd>{reach.pages.join(', ') || '0'}</dd>
        {#if reach.rules.length > 0}<dt>{copy.catalogueRules}</dt><dd>{reach.rules.join(', ')}</dd>{/if}
        <dt>{copy.diffSeeds}</dt><dd>{copy.useCaseExamples(reach.examples)}</dd>
        {#if reach.skills.length > 0}<dt>{copy.useCaseSkills}</dt><dd>{reach.skills.join(', ')}</dd>{/if}
        {#if reach.calls_out.length === 0}
          <dd class="span with-icon"><Icon name="check" size="s" />{copy.catalogueCallsNothing}</dd>
        {:else}
          {#each reach.calls_out as call, i (i)}<dd class="span loud call with-icon"><Icon name="globe" size="s" />{call.line}</dd>{/each}
        {/if}
      </dl>
    </section>
  {/if}

  <section class="panel" aria-labelledby="cat-versions">
    <h2 class="panel-h" id="cat-versions">{copy.catalogueVersions}</h2>
    <ol class="versions">
      {#each entry.versions as v (v.version)}
        <li>
          <span class="v">{v.version}</span>
          <span class="quiet">{v.bump ? copy.catalogueBump[v.bump] : copy.catalogueFirst}</span>
          <span class="quiet small">{copy.cataloguePublished(v.published_at.slice(0, 10), v.checksum)}</span>
          <span class="quiet small key">{signedWords(v.signature)}</span>
        </li>
      {/each}
    </ol>
  </section>
</div>

<style>
  .lead {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    inline-size: 100%;
    max-inline-size: 70ch;
  }

  .for,
  .meta,
  .quiet,
  .said {
    margin: 0;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .said {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    color: var(--ink2);
  }

  .key {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    min-inline-size: 0;
    overflow-wrap: anywhere;
  }

  .trust {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-sm);
    line-height: 1.5;
    overflow-wrap: anywhere;
  }

  .trust[data-loud] {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    padding: var(--sp-2) var(--sp-3);
    border: 1px solid var(--warn);
    border-radius: var(--r-md);
    color: var(--ink);
    font-weight: 600;
  }

  .code {
    color: var(--dim);
    font-family: var(--font-id);
    font-size: var(--t-xs);
  }

  .summary {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-base);
    line-height: 1.6;
  }

  .offer {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--sp-3);
    margin-block-start: var(--sp-2);
    inline-size: 100%;
  }

  .offer > :global(*) {
    max-inline-size: 100%;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--sp-4);
    inline-size: 100%;
  }

  .panel {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    min-inline-size: 0;
    padding: var(--sp-4);
    border: 1px solid var(--line-soft);
    border-radius: var(--r-lg);
    background: var(--bg);
  }

  .wide {
    grid-column: 1 / -1;
  }

  .panel-h {
    font-family: var(--font-ui);
    font-size: var(--t-sm);
    font-weight: 600;
    color: var(--ink2);
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
    font-weight: 600;
  }

  .facts dd {
    margin: 0;
    min-inline-size: 0;
    overflow-wrap: anywhere;
  }

  .facts .span {
    grid-column: 1 / -1;
  }

  .facts .loud {
    color: var(--ink);
    font-weight: 600;
  }

  .facts .with-icon {
    display: flex;
    align-items: flex-start;
    gap: 6px;
  }

  .call {
    font-family: var(--font-id);
    font-size: var(--t-xs);
  }

  .versions {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .versions li {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .v {
    color: var(--ink);
    font-family: var(--font-id);
    font-size: var(--t-sm);
  }

  .small {
    font-size: var(--t-xs);
  }

  @media (width < 720px) {
    .grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
