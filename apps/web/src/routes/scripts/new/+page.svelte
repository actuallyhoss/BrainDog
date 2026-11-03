<!--
  A new script: `/scripts/new`.

  THE FORM IS `ScriptForm`, SHARED WITH `/scripts/<id>`. This screen reads only what the form may offer (the Keychain's key
  labels, the doors and the ids already taken) and starts it empty. Once the owner's press installs it, the screen
  moves to the installed script, where the next edit is a change to a version rather than a second new script.
-->
<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { apiBase, at } from '$lib/at.ts';
  import { titleOf } from '$lib/title.ts';
  import { read } from '$lib/data/read.svelte.ts';
  import { blank, readPicks, words } from '$lib/record/script-draft.ts';
  import type { Shell } from '$lib/record/boot-live.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import ReadState from '$lib/ui/ReadState.svelte';
  import ScriptForm from '../[id]/ScriptForm.svelte';

  const shell = $derived(page.data as unknown as Shell);
  const owner = $derived(shell.me.level === 'owner');
  const lists = $derived(shell.index.registers.map((r) => ({ id: r.id, name: r.name })));

  const picks = read(
    () => apiBase(page.url),
    () => readPicks(apiBase(page.url)),
  );
</script>

<svelte:head><title>{titleOf(words.newHeading)}</title></svelte:head>

<PageHead icon="code" title={words.newHeading} kicker={words.parent} back="/scripts" sentence="" />
<div class="page">
  {#if picks.state !== 'ready'}
    <ReadState state={picks.state} refusal={picks.refusal} onretry={picks.reread} />
  {:else if picks.value !== null}
    <ScriptForm
      start={blank()}
      fromVersion={null}
      {owner}
      {lists}
      keys={picks.value.keys}
      doors={picks.value.doors}
      taken={picks.value.taken}
      onsent={(script) => void goto(at(`/scripts/${script}`))}
    />
  {/if}
</div>

<style>
  .page {
    padding: var(--page-head-gap) var(--gutter) var(--page-bottom);
    max-inline-size: var(--page-max);
  }
</style>
