<!--
  The step-up's hook and its modal, put in by the app's frame (`AppFrame.svelte`) once for the tab.

  It tells `@braindog/client` what to do with a call refused for a sign-in that is not recent enough (`onStepUp`): ask
  in place (`ask.ts`), and when the session is fresh the client sends the same call again. The modal is its own
  chunk, fetched the first time something asks, so no screen that never asks pays for it.
-->
<script lang="ts">
  import { onStepUp } from '@braindog/client';
  import { onAsk, pressed, readyHere, stepUp, type Ask } from './ask.ts';

  let now = $state<Ask | null>(null);

  $effect(() => {
    onAsk((ask) => (now = ask));
    onStepUp((refusal, asked) => stepUp(refusal, asked.writes));
    readyHere(true);
    const press = (e: Event): void => {
      if (e.isTrusted) pressed();
    };
    addEventListener('pointerdown', press, { capture: true, passive: true });
    addEventListener('keydown', press, { capture: true, passive: true });
    return () => {
      onStepUp(null);
      readyHere(false);
      onAsk(() => undefined);
      removeEventListener('pointerdown', press, { capture: true });
      removeEventListener('keydown', press, { capture: true });
    };
  });
</script>

{#if now}
  {#await import('./Reauth.svelte') then { default: Reauth }}<Reauth ask={now} />{/await}
{/if}
