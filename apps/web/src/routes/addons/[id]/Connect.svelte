<!--
  An add-on's connect recipe on its page (`connect.ts`): the steps to set its sender up somewhere else, a press that
  makes the door's address, and the files to paste with that address already in them, each with its own Copy.

  THE ADDRESS IS MADE HERE THE WAY SETTINGS, INGEST MAKES IT (`webhook-doors.ts`), with the same ask before a new
  address replaces one in use and the same sign-in again when the record wants a fresh one. It is shown once and kept
  in this component's state only, so leaving the page takes it away.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { apiBase } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import * as clipboard from '$lib/clipboard.ts';
  import { callerAt, listDoors, mintDoor, type Door, type Said } from '$lib/ui/webhook-doors.ts';
  import { reprove } from '$lib/record/keychain.ts';
  import { methods, passkeySignIn, support } from '$lib/auth.ts';
  import Tile from '$lib/ui/Tile.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { filled, readerZone, type Recipe } from './connect.ts';

  /* `quiet`: the page offers Connect Google as its main way in, so this press is not a second primary. */
  let { recipe, quiet = false }: { recipe: Recipe; quiet?: boolean } = $props();

  const call = () => callerAt(apiBase());
  let door = $state<Door | null>(null);
  let said = $state<Said | null>(null);
  let busy = $state(false);
  let asking = $state(false);
  let reproving = $state(false);
  const zone = readerZone();

  $effect(() => {
    const want = recipe.ingest;
    untrack(() => {
      void listDoors(call()).then((listed) => {
        if (listed.kind === 'doors') door = listed.doors.find((d) => d.id === want) ?? null;
      });
    });
  });

  function press() {
    if (busy) return;
    if (door?.held && !asking && said?.kind !== 'minted') {
      asking = true;
      return;
    }
    void mint();
  }

  async function mint() {
    busy = true;
    asking = false;
    said = await mintDoor(call(), location.origin, recipe.ingest);
    if (said.kind === 'minted' && door) door = { ...door, held: true };
    busy = false;
  }

  async function signInAgain() {
    if (reproving) return;
    reproving = true;
    const back = await reprove({ support, methods, passkeySignIn }, (href) => location.assign(href));
    reproving = false;
    if (back) await mint();
  }

  const address = $derived(said?.kind === 'minted' ? said.url : null);
  const line = $derived(said && said.kind !== 'minted' ? said.fix : '');
</script>

<Tile icon="plug" class="section" data-surface="tile" title={recipe.title}>
  <!-- THE OTHER WAY IN, FOLDED, while the page offers Connect Google as its main one (3 Nov): four steps of a script
       stood open under the card that already does it. An address being made or shown keeps it open. -->
  {#if quiet && !address && !asking}
    <details class="section-body alt">
      <summary class="tap">{copy.connectOther}</summary>
      <div class="connect">{@render body()}</div>
    </details>
  {:else}
    <div class="section-body connect">{@render body()}</div>
  {/if}
</Tile>

{#snippet body()}
    {#if recipe.says}<p class="hint">{recipe.says}</p>{/if}
    {#if recipe.steps.length}
      <ol class="steps">
        {#each recipe.steps as step, i (i)}<li>{step}</li>{/each}
      </ol>
    {/if}

    {#if address}
      <p class="code-label">Your address, already in the script below. It is shown once, so copy the files now.</p>
      <p class="mono wrap">{address}</p>
      {#each recipe.files as file (file.name)}
        {@const body = filled(file.text, address, zone)}
        <div class="file">
          <div class="file-head">
            <p class="file-name">{file.name}</p>
            <Button size="sm" weight="primary" onclick={() => void clipboard.put(body, `${file.name} copied`, `${file.name} copied`)}>Copy {file.name}</Button>
          </div>
          <pre class="media" tabindex="0" role="group" aria-label={file.name}><code>{body}</code></pre>
        </div>
      {/each}
      {#if recipe.after}<p class="hint">{recipe.after}</p>{/if}
    {:else if asking}
      <p class="code-said">{copy.doorsReplaceAsk}</p>
      <div class="row-actions">
        <Button weight="primary" tone="bad" disabled={busy} onclick={() => void mint()}>{copy.doorsReplace}</Button>
        <Button weight="bare" disabled={busy} onclick={() => (asking = false)}>{copy.doorsKeep}</Button>
      </div>
    {:else}
      {#if door?.held}<p class="hint">An address is in use. Make a new one only to set the script up again.</p>{/if}
      <div class="row-actions">
        <Button weight={door?.held || quiet ? 'quiet' : 'primary'} disabled={busy} onclick={press}>
          {busy ? copy.doorsMinting : door?.held ? copy.doorsRemint : copy.doorsMint}
        </Button>
      </div>
    {/if}

    <p class="code-said" role="status" data-tone={line ? 'bad' : undefined}>{#if line}<span class="glyph" aria-hidden="true"><Icon name="alert" /></span>{/if}{line}</p>
    {#if said?.kind === 'signin'}
      <div class="row-actions">
        <Button weight="quiet" disabled={reproving} onclick={() => void signInAgain()}>{copy.signInAgain}</Button>
      </div>
    {/if}
{/snippet}

<style>
  .connect {
    display: grid;
    gap: var(--sp-3);
  }

  .alt > summary {
    inline-size: fit-content;
    cursor: pointer;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    font-weight: var(--fw-medium);
    line-height: var(--lead-meta);
  }

  .alt[open] > summary {
    margin-block-end: var(--sp-3);
  }
  .steps {
    margin: 0;
    padding-inline-start: var(--sp-5);
    display: grid;
    gap: var(--sp-2);
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
  }
  .file {
    display: grid;
    gap: var(--sp-2);
    min-inline-size: 0;
  }
  .file-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-3);
    flex-wrap: wrap;
  }
  .file-name {
    margin: 0;
    color: var(--ink);
    font-family: var(--font-mono);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
    font-weight: var(--fw-medium);
  }
  .file pre {
    margin: 0;
    max-block-size: 240px;
    overflow: auto;
    padding: var(--sp-3);
    border-radius: var(--r-ctl);
    background: var(--tile-2);
    color: var(--ink);
    font-family: var(--font-mono);
    font-size: var(--fs-meta);
    line-height: calc(20px * var(--type, 1));
  }
  .wrap {
    overflow-wrap: anywhere;
    margin: 0;
  }
  .hint,
  .code-label,
  .code-said {
    margin: 0;
  }
  .row-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
</style>
