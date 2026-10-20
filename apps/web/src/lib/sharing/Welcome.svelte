<!--
  The first-open line for somebody a share let in (sharing plan §3.4): "Ada shared Kiln with you. You can edit tasks
  until 1 Dec." Once for each share, on this device, with Close.

  ONLY FOR A GUEST: a person whose access shares made (`me.grant`) and who holds no role on the whole record. An owner, a
  member and an agent are never asked. The sentence is the record's (`myShares`, `welcome`), said to them by name.

  IN THE FLOW, AS THE LAPSE BANNER IS: it sits over the screen and pushes it down, so it never covers the tab bar.
-->
<script lang="ts">
  import { apiBase } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import type { Shell } from '$lib/record/boot-live.ts';
  import { untrack } from 'svelte';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { markWelcomed, readMine, welcomed, welcomeOf, type MyShare } from './sharing.ts';

  let { shell }: { shell: Shell } = $props();

  const guest = $derived(!shell.refused && !shell.stale && shell.me.grant !== undefined && !shell.me.owner && shell.me.lists !== null);
  let shown = $state<MyShare | null>(null);
  let base = '';

  $effect(() => {
    if (!guest) return;
    void shell.me.grant?.epoch;
    untrack(() => {
      base = apiBase();
      void import('@braindog/client')
        .then(({ createClient }) => readMine(createClient({ base })))
        .then((out) => {
          if (out.ok) shown = welcomeOf(out.value, welcomed(base));
        })
        .catch(() => undefined);
    });
  });

  function close(): void {
    if (shown) markWelcomed(base, shown.id);
    shown = null;
  }
</script>

{#if shown}
  <div class="welcome" role="status">
    <p class="welcome-text">
      <span class="welcome-glyph"><Icon name="link" size="s" /></span>
      <span>{shown.welcome}</span>
    </p>
    <Button weight="quiet" onclick={close}>{copy.sharingWelcomeClose}</Button>
  </div>
{/if}

<style>
  /* A TILE ON THE GROUND, over whatever screen is open, inside the work's own gutter, as the lapse line is. */
  .welcome {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-2) var(--sp-3);
    margin: var(--inset) var(--gutter) 0;
    padding: var(--sp-3) var(--sp-3) var(--sp-3) var(--sp-5);
    border-radius: var(--r-lg);
    background: var(--bg);
    box-shadow: var(--e1);
    color: var(--ink);
  }

  .welcome-text {
    display: flex;
    flex: 1 1 30ch;
    align-items: baseline;
    gap: var(--sp-2);
    min-inline-size: 0;
    margin: 0;
    font-size: var(--t-base);
    line-height: var(--lh-body);
  }

  .welcome-glyph {
    flex: none;
    color: var(--dim);
  }

  .welcome :global(.btn) {
    min-block-size: var(--tap);
  }
</style>
