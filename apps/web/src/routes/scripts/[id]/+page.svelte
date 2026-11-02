<!--
  One script, to change: `/scripts/<id>`.

  THE INSTALLED VERSION IS WHAT THE FORM STARTS FROM, AND IT IS HELD. The read asks again whenever the record moves, and
  a form rebuilt from each answer would throw away what somebody was typing. So the first answer is held, the form
  starts from it, and its version is the one the change is filed against: a version accepted by somebody else in the
  meantime makes this change a conflict in Needs you, never a silent replacement. After the owner's own accept the held
  version is let go and the form starts again from the one now installed.

  THE SOURCE MAY NOT BE FOUND. No read answers a script's source; it is looked for in the change that installed it
  (`openScript`), and a script a pack installed opens with its header and an empty box that says why.
-->
<script lang="ts">
  import { page } from '$app/state';
  import { apiBase } from '$lib/at.ts';
  import { titleOf } from '$lib/title.ts';
  import { read } from '$lib/data/read.svelte.ts';
  import type { Result } from '$lib/data/read.ts';
  import { openScript, readPicks, words, type Opened, type Picks } from '$lib/record/script-draft.ts';
  import type { Shell } from '$lib/record/boot-live.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import ReadState from '$lib/ui/ReadState.svelte';
  import ScriptForm from './ScriptForm.svelte';
  import ScriptCard from '../ScriptCard.svelte';
  import { readScripts } from '$lib/record/scripts.ts';
  import { listName } from '$lib/record/names.ts';
  import Button from '$lib/ui/Button.svelte';

  const shell = $derived(page.data as unknown as Shell);
  const owner = $derived(shell.me.level === 'owner');
  const lists = $derived(shell.index.registers.map((r) => ({ id: r.id, name: r.name })));
  const id = $derived(page.params.id ?? '');
  /* A LIST BY THE NAME THIS RECORD GIVES IT, from its own index, else its declared name. */
  const named = $derived.by(() => {
    const names = new Map(lists.map((l) => [l.id, l.name]));
    return (list: string): string => names.get(list) ?? listName(list);
  });

  /* WHERE IT STANDS, from the same read the list is drawn from: its facts, its recent runs, its versions and Resume. */
  const standing = read(
    () => apiBase(page.url),
    () => readScripts(apiBase(page.url)),
    { empty: (v) => v.length === 0 },
  );
  const mine = $derived(standing.value?.find((s) => s.script === id) ?? null);

  /* ONE QUESTION FOR THE SCRIPT AND WHAT THE FORM MAY OFFER, keyed by the record and the script, so moving to another
     script under the same route asks again. */
  const opened = read(
    () => `${apiBase(page.url)} ${id}`,
    async (): Promise<Result<{ script: Opened | null; picks: Picks }>> => {
      const [one, picks] = await Promise.all([openScript(apiBase(page.url), id), readPicks(apiBase(page.url))]);
      if (!one.ok) return one;
      if (!picks.ok) return picks;
      return { ok: true as const, value: { script: one.value, picks: picks.value } };
    },
    { empty: (v) => v.script === null },
  );

  let held = $state<{ id: string; script: Opened } | null>(null);
  /* A SCRIPT OPENS ON WHAT IT DOES (24 October): its card, the sentence of where it stands and its last runs, and
     the form folded under "Change it". A script with no card to say it, or whose code is not kept here, opens on the
     form, since that is the one thing on the page. */
  let changing = $state<string | null>(null);
  const formOpen = $derived(changing === id || !mine);
  /* WHILE THE READ AFTER AN ACCEPT IS OUT, the answer on hand is the version just replaced, and holding it again would
     file the next change against a version that is no longer live. */
  let rereading = $state(false);
  $effect(() => {
    const now = opened.value?.script;
    if (now && !rereading && (held === null || held.id !== id)) held = { id, script: now };
  });

  /* THE OWNER'S ACCEPT INSTALLED A NEW VERSION: let the held one go and start from what is installed now. */
  async function installed() {
    rereading = true;
    held = null;
    await opened.reread();
    rereading = false;
  }
</script>

<svelte:head><title>{titleOf(held?.script.row.title ?? words.parent)}</title></svelte:head>

<PageHead icon="code" title={held?.script.row.title ?? words.parent} kicker={words.parent} back="/scripts" sentence="" />
<div class="page">
  {#if mine}<ScriptCard s={mine} {named} onresumed={() => standing.reread()} />{/if}
  {#if held !== null && held.id === id && opened.value !== null && !formOpen}
    <div class="change"><Button onclick={() => (changing = id)}>{words.change}</Button></div>
  {:else if held !== null && held.id === id && opened.value !== null}
    {#key held}
      <ScriptForm
        start={held.script.draft}
        fromVersion={held.script.row.version}
        found={held.script.found}
        {owner}
        {lists}
        keys={opened.value.picks.keys}
        doors={opened.value.picks.doors}
        taken={opened.value.picks.taken}
        onsent={() => void installed()}
      />
    {/key}
  {:else if opened.state === 'empty'}
    <Empty kind="no-results" title={words.missing} body={words.missingWhy} />
  {:else if opened.state !== 'ready'}
    <ReadState state={opened.state} refusal={opened.refusal} onretry={opened.reread} />
  {/if}
</div>

<style>
  .change {
    display: flex;
  }

  .page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    padding: var(--sp-4) var(--gutter) var(--sp-9);
    max-inline-size: var(--page-max);
  }
</style>
