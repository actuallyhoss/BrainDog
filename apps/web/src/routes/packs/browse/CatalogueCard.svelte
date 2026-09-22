<!--
  One use case or add-on from this BrainDog's catalogue, as a card on browse (`catalogue.ts`).

  THE TRUST FACTS ARE THE FILE'S OWN, read from its latest version as the catalogue computed them when it was published:
  the version and author, the key that signed it or that nothing did, how many lists and pages it adds, and every host it
  would call out to. The signature is the index's claim here; the detail page verifies it before anything is asked for. Nothing on the card is
  written by its author about itself apart from the title and summary, which the card says as theirs.
-->
<script lang="ts">
  import type { CatalogueEntry } from '@braindog/declare/catalogue';
  import { at } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { signedWords } from './catalogue.ts';

  let { entry }: { entry: CatalogueEntry } = $props();

  const latest = $derived(entry.versions[0]);
  const hosts = $derived([...new Set((latest?.reach.calls_out ?? []).map((c) => c.host ?? '').filter((h) => h !== ''))]);
  /* A USE CASE KEEPS ITS LINK; an add-on says its kind, so one sharing an id with a use case is still reachable. */
  const href = $derived(at(`/packs/browse/${entry.id}?from=catalogue${entry.kind === 'pack' ? '&kind=pack' : ''}`));
  const audience = $derived(entry.kind === 'pack' ? copy.catalogueAddon : ((copy.shareAudiences as Record<string, string>)[entry.audience] ?? copy.shareAudiences.other));
</script>

<li class="card">
  <header class="card-head">
    <h3 class="card-title"><a class="card-link tap" {href}>{entry.title}</a></h3>
    <span class="card-for">{audience}</span>
  </header>
  <p class="card-summary">{entry.summary}</p>
  <p class="card-note">{copy.useCaseVersion(entry.latest, entry.author, entry.license)}</p>
  {#if latest}
    <ul class="facts">
      <li><Icon name="rows" size="s" />{copy.catalogueAdds(latest.reach.lists.length, latest.reach.pages.length)}</li>
      <li class="key"><Icon name={latest.signature ? 'key' : 'info'} size="s" />{signedWords(latest.signature)}</li>
      <li data-calls={hosts.length > 0 ? '' : undefined}><Icon name={hosts.length > 0 ? 'globe' : 'check'} size="s" />{hosts.length > 0 ? copy.catalogueCallsOut(hosts) : copy.catalogueCallsNothing}</li>
    </ul>
  {/if}
  <footer class="card-foot">
    <Button weight="bare" {href}>{copy.browseDetails}</Button>
  </footer>
</li>

<style>
  .card {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    min-inline-size: 0;
    padding: var(--sp-4);
    border: 1px solid var(--line-soft);
    border-radius: var(--r-lg);
    background: var(--bg);
  }

  .card-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--sp-2);
  }

  .card-title {
    font-family: var(--font-ui);
    font-size: var(--t-base);
    font-weight: 600;
  }

  .card-link {
    color: inherit;
    text-decoration: none;
  }

  .card-link:hover {
    text-decoration: underline;
  }

  .card-for,
  .card-note {
    margin: 0;
    color: var(--dim);
    font-size: var(--t-xs);
  }

  .card-summary {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-sm);
    line-height: 1.5;
  }

  .facts {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    margin: 0;
    padding: 0;
    list-style: none;
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  .facts li {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    overflow-wrap: anywhere;
  }

  .facts .key {
    font-size: var(--t-xs);
  }

  .facts li[data-calls] {
    color: var(--ink);
    font-weight: 600;
  }

  .card-foot {
    display: flex;
    justify-content: flex-end;
    margin-block-start: auto;
  }
</style>
