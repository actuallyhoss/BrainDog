<!--
  Where the Share sheet answers `braindog:share-sheet`: the Sharing page asks for the sheet by an
  event (`askSheet` in `sharing.ts`) rather than importing it, and this listens, loads the sheet by `import()` the first
  time it is asked, and opens it on what was asked: a share to change, or a new share of anything on the record, with
  somebody already picked when the ask names them. The sheet says `braindog:shared` once it kept one.
-->
<script lang="ts">
  import { copy } from '$lib/copy.ts';
  import { SHEET_EVENT, type SheetAsk } from './sharing.ts';
  import type { Subject } from './share-state.ts';

  let ask = $state<SheetAsk | null>(null);
  let open = $state(false);

  $effect(() => {
    const on = (e: Event) => {
      ask = (e as CustomEvent<SheetAsk | undefined>).detail ?? {};
      open = true;
    };
    addEventListener(SHEET_EVENT, on);
    return () => removeEventListener(SHEET_EVENT, on);
  });

  const subject = $derived.by((): Subject => {
    const share = ask?.share;
    return share
      ? { kind: 'held', id: share.id, target: share.what as Extract<Subject, { kind: 'held' }>['target'], name: share.subject }
      : { kind: 'record', name: copy.shareRecordName };
  });
</script>

{#if ask}
  {#await import('./ShareSheet.svelte') then { default: ShareSheet }}
    <ShareSheet bind:open {subject} change={ask.share} who={ask.who} />
  {/await}
{/if}
