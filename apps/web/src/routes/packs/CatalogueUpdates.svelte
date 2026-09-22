<!--
  Updates from this BrainDog's catalogue, for what this record holds (`browse/catalogue.ts`, `catalogueUpdates`).

  ONLY ON A LIVE RECORD, AND ONLY WHEN THERE IS SOMETHING TO SAY: no catalogue, or nothing held at an earlier version, draws
  nothing. Each later version is fetched and held to its checksum and signature before it is offered; one that is not is
  said quietly underneath and never offered.

  NOTHING INSTALLS FROM HERE. "Ask on Decide" files a proposal (a use case as its file, an add-on as its id and document),
  and the owner accepts it on Decide, where the record's own plan says what changes. The changes drawn here are the
  catalogue's comparison of the two files, with what it takes away and every host newly called out to said loudly.
-->
<script lang="ts">
  import { at } from '$lib/at.ts';
  import type { createClient } from '@braindog/client';
  import type { CatalogueUpdate, Trust } from '@braindog/declare/catalogue';
  import { copy } from '$lib/copy.ts';
  import type { PackState } from '$lib/record/packs.ts';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { browserStore, fileProposal, keepFirstKey, readHostCatalogue, signedWords, trustForEntry, trustWords, updateProposal, updatesFor } from './browse/catalogue.ts';
  import { moduleTitle } from './sharing.ts';

  let { states, live, client }: { states: readonly PackState[] | null; live: boolean; client: ReturnType<typeof createClient> | null } = $props();

  type Offered = { update: CatalogueUpdate; trust: Trust; filed: string | null; fix: string | null };
  let offered = $state<Offered[]>([]);
  let refused = $state<string[]>([]);
  let busy = $state<string | null>(null);

  const keyOf = (u: CatalogueUpdate) => `${u.entry.kind}:${u.entry.id}`;
  const kindWord = (kind: string) => copy.proposalKind(kind).toLowerCase();
  const hrefOf = (u: CatalogueUpdate) => `/packs/browse/${u.entry.id}?from=catalogue${u.entry.kind === 'pack' ? '&kind=pack' : ''}`;

  $effect(() => {
    const held = states;
    if (!live || !held) return;
    void (async () => {
      const got = await readHostCatalogue(fetch);
      if (!got.ok || !got.index) return;
      const out = await updatesFor(fetch, got.index, held);
      const store = browserStore();
      offered = await Promise.all(out.updates.map(async (update) => ({ update, trust: await trustForEntry(store, update.entry, update.to.version, update.signature, got.index?.keys), filed: null, fix: null })));
      refused = out.refused;
    })();
  });

  async function ask(o: Offered) {
    if (!client || busy !== null) return;
    const c = client;
    busy = keyOf(o.update);
    try {
      const out = await fileProposal((name, args) => c.call(name, args), await updateProposal(o.update));
      if (!out.ok) {
        o.fix = out.code ? `${out.fix} ${copy.refusalCode(out.code)}` : out.fix;
        return;
      }
      o.fix = null;
      o.filed = out.id;
      await keepFirstKey(browserStore(), keyOf(o.update), o.trust);
    } finally {
      busy = null;
    }
  }
</script>

{#if offered.length > 0 || refused.length > 0}
  <section class="updates" aria-labelledby="catalogue-updates-h">
    <h2 class="updates-h" id="catalogue-updates-h">{copy.catalogueUpdatesHeading}</h2>
    {#if offered.length > 0}
      <ul class="list">
        {#each offered as o (keyOf(o.update))}
          {@const u = o.update}
          {@const c = u.changes}
          {@const said = trustWords(o.trust, u.entry.author)}
          <li class="item">
            <header class="head">
              <h3 class="title">{u.entry.title}</h3>
              <span class="move">{copy.catalogueFromTo(u.from, u.to.version)}</span>
            </header>
            <p class="key"><Icon name={u.signature ? 'key' : 'info'} size="s" />{signedWords(u.signature)}</p>
            {#if said.loud}<p class="loud warn" role="alert"><Icon name="alert" size="s" />{said.text}</p>{/if}
            {#if c}
              <dl class="facts">
                {#if c.added.length > 0}<dt>{copy.arrangeAdds}</dt><dd>{c.added.map((x) => `${x.title} (${kindWord(x.kind)})`).join(', ')}</dd>{/if}
                {#if c.removed.length > 0}<dt class="loud">{copy.catalogueRemoved}</dt><dd class="loud">{c.removed.map((x) => `${x.title} (${kindWord(x.kind)})`).join(', ')}</dd>{/if}
                {#if c.changed.length > 0}<dt>{copy.catalogueAltered}</dt><dd>{c.changed.map((x) => `${x.title} (${kindWord(x.kind)})`).join(', ')}</dd>{/if}
                {#if c.modules.added.length > 0}<dt>{copy.catalogueModulesNew}</dt><dd>{c.modules.added.map(moduleTitle).join(', ')}</dd>{/if}
                {#if c.hosts.added.length > 0}<dt class="loud">{copy.catalogueHostsNew}</dt><dd class="loud">{c.hosts.added.join(', ')}</dd>{/if}
                {#if c.hosts.removed.length > 0}<dt>{copy.catalogueHostsGone}</dt><dd>{c.hosts.removed.join(', ')}</dd>{/if}
                {#if c.examples.from !== c.examples.to}<dt>{copy.diffSeeds}</dt><dd>{c.examples.from} → {c.examples.to}</dd>{/if}
                {#if c.words}<dd class="span">{copy.catalogueWords}</dd>{/if}
                {#if c.added.length + c.removed.length + c.changed.length + c.hosts.added.length === 0 && !c.words}<dd class="span">{copy.catalogueNothing}</dd>{/if}
              </dl>
            {:else}
              <p class="quiet">{copy.catalogueChangedGone}</p>
            {/if}
            <footer class="foot">
              {#if o.filed !== null}
                <p class="said" role="status">{copy.catalogueAsked}{#if o.filed}{' '}<a class="tap" href={at(`/decide/${o.filed}`)}>{copy.pollOpenDecide}</a>{/if}</p>
              {:else}
                <Button weight="primary" disabled={busy !== null || !client} onclick={() => void ask(o)}>{copy.catalogueAsk}</Button>
              {/if}
              <Button weight="bare" href={hrefOf(u)}>{copy.browseDetails}</Button>
            </footer>
            {#if o.fix}<p class="said" role="status">{o.fix}</p>{/if}
          </li>
        {/each}
      </ul>
    {/if}
    {#each refused as fix, i (i)}<p class="quiet">{fix}</p>{/each}
  </section>
{/if}

<style>
  .updates {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  .updates-h {
    font-family: var(--font-ui);
    font-size: var(--t-sm);
    font-weight: 600;
    color: var(--ink2);
  }

  .list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr));
    gap: var(--sp-4);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .item {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    min-inline-size: 0;
    padding: var(--sp-4);
    border: 1px solid var(--line-soft);
    border-radius: var(--r-lg);
    background: var(--bg);
  }

  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--sp-2);
  }

  .title {
    min-inline-size: 0;
    font-family: var(--font-ui);
    font-size: var(--t-base);
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  .move {
    color: var(--dim);
    font-family: var(--font-id);
    font-size: var(--t-xs);
  }

  .key,
  .warn {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    min-inline-size: 0;
    margin: 0;
    overflow-wrap: anywhere;
  }

  .key {
    color: var(--ink2);
    font-size: var(--t-xs);
  }

  .warn {
    padding: var(--sp-2) var(--sp-3);
    border: 1px solid var(--warn);
    border-radius: var(--r-md);
    font-size: var(--t-sm);
    line-height: 1.5;
  }

  .quiet,
  .said {
    margin: 0;
    color: var(--dim);
    font-size: var(--t-sm);
    overflow-wrap: anywhere;
  }

  .said {
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

  .loud {
    color: var(--ink);
    font-weight: 600;
  }

  .facts dt.loud {
    color: var(--ink);
  }

  .foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-2);
    margin-block-start: auto;
  }
</style>
