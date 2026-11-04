<!--
  The sheets a thing's verbs open: its name, who it is handed to, who it is shared with, who it is merged with. The same
  sheets its page opens, and here since a menu closes on the press and a right-click has no page behind it.
-->
<script lang="ts">
  import Button from '../ui/Button.svelte';
  import Sheet from '../ui/Sheet.svelte';
  import { toasts } from '../ui/toast.svelte.ts';
  import { things } from './asks.svelte.ts';
  import { thingWords } from './verbs.ts';

  const sheet = $derived(things.sheet);
  let open = $state(false);
  let typed = $state('');
  let busy = $state(false);
  let fault = $state<string | null>(null);

  $effect(() => {
    if (sheet) {
      open = true;
      if (sheet.kind === 'rename') {
        typed = sheet.value;
        fault = null;
      }
    }
  });

  async function save(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    if (sheet?.kind !== 'rename' || typed.trim() === '') return;
    busy = true;
    const said = await sheet.save(typed.trim());
    busy = false;
    if (said !== null) {
      fault = said;
      return;
    }
    open = false;
    toasts.push(typed.trim());
  }

  const done = (): void => {
    things.sheet = null;
  };
</script>

{#if sheet?.kind === 'rename'}
  <Sheet bind:open title={sheet.title} onclose={done}>
    <form class="rename" onsubmit={save}>
      <span class="field"><input class="field-input" type="text" aria-label={sheet.label} bind:value={typed} disabled={busy} /></span>
      {#if fault}<p class="fault" role="alert">{fault}</p>{/if}
      <div class="acts">
        <Button weight="primary" type="submit" disabled={busy || typed.trim() === ''}>{thingWords.save}</Button>
        <Button weight="bare" onclick={() => (open = false)}>{thingWords.cancel}</Button>
      </div>
    </form>
  </Sheet>
{:else if sheet?.kind === 'hand'}
  {#await import('../ui/HandSheet.svelte') then loaded}
    <loaded.default bind:open register={sheet.register} row={sheet.row} decl={sheet.decl} />
  {/await}
{:else if sheet?.kind === 'share'}
  {#await import('../sharing/ShareLazy.svelte') then loaded}
    <loaded.default bind:open subject={sheet.subject} />
  {/await}
{:else if sheet?.kind === 'merge'}
  {#await import('../ui/MergeSheet.svelte') then loaded}
    <loaded.default bind:open register={sheet.register} seq={sheet.seq} name={sheet.name} title={sheet.title} mergedInto={sheet.mergedInto} />
  {/await}
{/if}

<style>
  .rename {
    display: grid;
    gap: var(--sp-3);
  }

  .acts {
    display: flex;
    flex-direction: row-reverse;
    justify-content: flex-start;
    gap: var(--sp-2);
  }

  .fault {
    margin: 0;
    color: var(--red);
    font-size: var(--fs-meta);
  }
</style>
