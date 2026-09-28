<!--
  A passkey, asked for before anything else on a new record's `/start` (`loop/finish/ops.md` OPS-17).

  A PERSON WHO SIGNED UP HAS ONLY THEIR MAILBOX. They proved it with a link, paid, and landed here; without a passkey
  every later sign-in is another email to wait for. So the first thing the new record asks is for a way back in on
  this device, and "Not now" leaves it for Settings > Recovery.

  ASKED ONLY WHEN IT WOULD HELP: the host offers passkeys, this person has none yet (`firstRun` is about THIS person
  once they are signed in, `packages/ports/src/auth.ts`), and this browser can make one. Everybody else never sees it.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { methods, passkeyRegister, support } from '$lib/auth.ts';
  import { copy } from '$lib/copy.ts';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';

  let shown = $state(false);
  let busy = $state(false);
  let said = $state<string | null>(null);

  onMount(() => {
    const can = support();
    if (!can.webauthn || !can.secure) return;
    void methods().then((out) => {
      shown = out.ok && out.value.passkey && out.value.me !== null && out.value.firstRun === true;
    });
  });

  async function add() {
    /* ONE CEREMONY AT A TIME: a second press while the device is asking does nothing. */
    if (busy) return;
    busy = true;
    said = null;
    const out = await passkeyRegister();
    busy = false;
    if (out.ok) {
      shown = false;
      said = copy.passkeyAdded;
      return;
    }
    /* THE SHEET CLOSED ON PURPOSE IS NOT A FAILURE, and the ask stays where it was. */
    if (out.kind !== 'cancelled') said = copy.passkeyFirstFailed;
  }
</script>

{#if shown}
  <section class="first" aria-labelledby="first-h">
    <!-- A PARAGRAPH AND NOT A HEADING, as `/start`'s own "again" note is: it sits above the page's one `h1`. -->
    <p class="first-h" id="first-h">{copy.passkeyFirstTitle}</p>
    <p class="first-why">{copy.passkeyFirstWhy}</p>
    {#if said}<p class="first-said" role="status">{said}</p>{/if}
    <div class="first-go">
      <Button weight="primary" onclick={() => void add()} aria-busy={busy}>
        <Icon name="key" size="m" />{busy ? copy.addingPasskey : copy.addPasskeyHere}
      </Button>
      <Button weight="quiet" onclick={() => (shown = false)}>{copy.passkeyFirstLater}</Button>
    </div>
  </section>
{:else if said}
  <p class="first-said" role="status">{said}</p>
{/if}

<style>
  .first {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    padding: var(--sp-4);
    border: 1px solid var(--line);
    border-radius: var(--r-lg);
    background: var(--s1);
  }

  .first-h {
    color: var(--ink);
    font-size: var(--t-md);
    font-weight: 600;
    line-height: var(--lh-tight);
  }

  .first-why,
  .first-said {
    color: var(--ink2);
    font-size: var(--t-sm);
    line-height: var(--lh-body);
  }

  /* SIDE BY SIDE WHERE THEY FIT, and each the full width of the column on a phone, at the 44px floor. */
  .first-go {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-3);
  }

  .first-go :global(.btn) {
    min-block-size: var(--tap);
  }

  @media (width < 640px) {
    .first-go :global(.btn) {
      inline-size: 100%;
    }
  }
</style>
