<!--
  The one sheet a declared action's press opens before it runs, or after it, where the press needs one (`act-sheet.ts`
  `stepOf`): the loss named in the action's own sentence, sign in again, a value shown once, or what will change and
  then Do it. Mounted by `openSheet` on the first press that needs it and taken down when it answers, so no page loads
  it before then.

  ANSWERS ONCE. `done(true)` is the yes (the action's own label, Do it, a sign-in that worked); every other way out
  (Keep it, Escape, the scrim, a sign-in that did not) is `done(false)`, and the press runs nothing.

  SHOWN ONCE MEANS NOT KEPT. The value is a prop of this sheet alone: it is drawn, it can be copied, and when the sheet
  closes the component and the value go with it. Nothing writes it to a store, a toast or the page.

  THE BUTTONS ARE THE SHEET'S FOOT, the yes first in the reading order and the accent's only fill, the way out beside it.
-->
<script lang="ts">
  import { methods, passkeySignIn, support } from '$lib/auth.ts';
  import { reprove } from '$lib/record/keychain.ts';
  import Button from '$lib/ui/Button.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import { actWords, type SheetAsk } from './act-sheet.ts';

  let { ask, done }: { ask: SheetAsk; done: (yes: boolean) => void } = $props();

  let open = $state(true);
  let answered = false;
  let busy = $state(false);
  let copied = $state(false);

  function answer(yes: boolean): void {
    if (answered) return;
    answered = true;
    open = false;
    done(yes);
  }

  async function signIn(): Promise<void> {
    busy = true;
    const ok = await reprove({ support, methods, passkeySignIn }, (href) => location.assign(href)).catch(() => false);
    busy = false;
    answer(ok);
  }

  async function copyValue(value: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      copied = true;
    } catch {
      copied = false;
    }
  }

  const title = $derived(
    ask.kind === 'confirm' ? ask.label : ask.kind === 'again' ? actWords.againTitle : ask.kind === 'once' ? actWords.onceTitle(ask.label) : actWords.lookTitle,
  );
</script>

<Sheet bind:open {title} onclose={() => answer(ask.kind === 'once')}>
  <div class="act-sheet" data-act-sheet={ask.kind}>
    {#if ask.kind === 'confirm'}
      <p class="act-said">{ask.said}</p>
    {:else if ask.kind === 'again'}
      <p class="act-said">{actWords.againSaid}</p>
    {:else if ask.kind === 'once'}
      {#if ask.value === null}
        <p class="act-said">{actWords.onceNone}</p>
      {:else}
        <p class="act-said">{actWords.onceSaid}</p>
        <output class="act-value">{ask.value}</output>
      {/if}
    {:else}
      <ul class="act-look">
        {#each ask.lines as line, i (i)}<li>{line}</li>{/each}
      </ul>
    {/if}
  </div>
  {#snippet footer()}
    <div class="act-foot">
      {#if ask.kind === 'confirm'}
        <Button weight="primary" onclick={() => answer(true)}>{ask.label}</Button>
        <Button weight="quiet" onclick={() => answer(false)}>{actWords.keep}</Button>
      {:else if ask.kind === 'again'}
        <Button weight="primary" disabled={busy} onclick={() => void signIn()}>{actWords.againPress}</Button>
        <Button weight="quiet" onclick={() => answer(false)}>{actWords.cancel}</Button>
      {:else if ask.kind === 'once'}
        {#if ask.value !== null}
          {@const value = ask.value}
          <Button weight="quiet" onclick={() => void copyValue(value)}>{copied ? actWords.copied : actWords.copy}</Button>
        {/if}
        <Button weight="primary" onclick={() => answer(true)}>{actWords.close}</Button>
      {:else}
        <Button weight="primary" onclick={() => answer(true)}>{actWords.doIt}</Button>
        <Button weight="quiet" onclick={() => answer(false)}>{actWords.cancel}</Button>
      {/if}
    </div>
  {/snippet}
</Sheet>

<style>
  .act-sheet {
    display: grid;
    gap: 12px;
  }
  .act-said,
  .act-look {
    margin: 0;
    font-size: var(--fs-body);
    line-height: 1.5;
    color: var(--ink);
  }
  .act-look {
    padding-inline-start: 20px;
    display: grid;
    gap: 4px;
  }
  /* THE VALUE ON A FLAT FIELD, in the mono face and broken anywhere, so a long key is read whole on a phone. */
  .act-value {
    display: block;
    padding: 12px;
    border-radius: var(--r-field, var(--r-ctl));
    background: var(--tile-2);
    font-family: var(--font-mono);
    font-size: var(--fs-body);
    overflow-wrap: anywhere;
    user-select: all;
  }
  .act-foot {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: flex-end;
  }
</style>
