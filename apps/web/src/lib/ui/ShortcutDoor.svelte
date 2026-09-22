<!--
  The Shortcut door in Settings → Ingest: one press that mints the token an iPhone Shortcut posts a bank's text with.

  `e20ed683` BUILT THE DOOR AND NO SCREEN. Both hosts take an SMS at `/in/webhook/<rec>/bank-from-out-sms/<token>` and
  `ingestMint` makes the token, and nothing in this app called it. This section sits under the forwarding address because
  it is the same act for a different sender: a credential minted on a press, shown once, replaced by minting again.

  AN OWNER'S SCREEN, SAID BEFORE THE BUTTON. `ingestMint` wants an owner in a browser with a sign-in from the last fifteen
  minutes, because whoever holds the token can put a debit of their choosing into the book. The page's own `anOwner` is
  handed in, so there is one predicate for who owns the record; the record decides again on the press.

  THE TOKEN LIVES IN `said` AND NOWHERE ELSE. The section is drawn only inside the `ingest` arm, so leaving the area takes
  the component and the token with it, and nothing writes it to a store, a query string or a toast. The rules are
  `shortcut-door.ts`, which the tests hold.
-->
<script lang="ts">
  import { copy } from '$lib/copy.ts';
  import * as clipboard from '$lib/clipboard.ts';
  import { mintShortcut, type Said } from '$lib/ui/shortcut-door.ts';
  import { reprove } from '$lib/record/vault.ts';
  import { methods, passkeySignIn, support } from '$lib/auth.ts';
  import { words as levelWords } from '../../routes/settings/levels.ts';
  import { closed, opened } from '$lib/ui/screen.svelte.ts';
  import Section from '$lib/ui/Section.svelte';
  import Button from '$lib/ui/Button.svelte';

  let { owner = false }: { owner?: boolean } = $props();

  let said = $state<Said | null>(null);
  let busy = $state(false);
  let reproving = $state(false);

  /* EVERY ARM IS A SENTENCE: `sample` is the demo's one line for every act that needs an account, and the rest is the
     record's own `fix`, verbatim (`13 §6`). */
  const line = $derived(
    said === null ? '' : said.kind === 'minted' ? copy.shortcutMade : said.kind === 'sample' ? copy.notOnDemo : said.fix,
  );
  const tone = $derived(said === null || said.kind === 'minted' ? undefined : 'bad');

  async function mint() {
    if (busy) return;
    busy = true;
    const at = opened();
    said = await mintShortcut(location.origin);
    closed(true, at);
    busy = false;
  }

  /* SIGNING IN AGAIN WITHOUT LEAVING, then the same press again: `reprove` is the agents and mail areas' own, so the
     three cannot come to disagree about what a fresh sign-in is. */
  async function signInAgain() {
    if (reproving) return;
    reproving = true;
    const back = await reprove({ support, methods, passkeySignIn }, (href) => location.assign(href));
    reproving = false;
    if (back) await mint();
  }
</script>

<Section title={copy.shortcutTitle}>
  <p class="hint">{copy.shortcutHow}</p>
  {#if !owner}
    <p class="hint">{levelWords.ownersOnly}</p>
  {:else}
    <p class="hint">{copy.shortcutUnknown}</p>
    {#if said?.kind === 'minted'}
      {@const minted = said}
      <!-- SHOWN ONCE, from `said` alone. THE LABEL IS PASSED to `clipboard.put`, because it quotes the text in its own
           toast and the text here is a live credential. -->
      <div class="code-form" role="status">
        <p class="code-label">{copy.shortcutOnce}</p>
        {#if minted.url}
          <p class="mono wrap">{minted.url}</p>
          <div class="row-actions">
            <Button weight="primary" onclick={() => void clipboard.put(minted.url ?? '', copy.shortcutUrlCopied)}>{copy.shortcutCopyUrl}</Button>
          </div>
          <p class="hint">{copy.shortcutIos}</p>
        {:else}
          <!-- NO RECORD ID IN THE ANSWER, SO NO ADDRESS. The token is still the only copy there will be, so it is shown
               rather than thrown away, with the sentence that says why the address is missing. -->
          <p class="mono wrap">{minted.token}</p>
          <div class="row-actions">
            <Button weight="primary" onclick={() => void clipboard.put(minted.token, copy.shortcutTokenCopied)}>{copy.shortcutCopyToken}</Button>
          </div>
          <p class="hint">{copy.shortcutNoAddress}</p>
        {/if}
      </div>
    {/if}
    <div class="row-actions">
      <Button weight="primary" disabled={busy} onclick={() => void mint()}>{busy ? copy.shortcutMinting : copy.shortcutMint}</Button>
    </div>
    <!-- Always in the document: a live region inserted with its first sentence is not reliably announced. -->
    <p class="code-said" role="status" data-intent={tone}>{line}</p>
    {#if said?.kind === 'signin'}
      <div class="row-actions">
        <Button weight="quiet" disabled={reproving} onclick={() => void signInAgain()}>{copy.signInAgain}</Button>
      </div>
    {/if}
    <p class="hint">{copy.shortcutFreshWhy}</p>
  {/if}
</Section>

<style>
  /* THE SETTINGS PAGE'S OWN RULES, REPEATED, because its styles are scoped to it and do not reach inside a component:
     the mail section above this one draws the same shown-once block, and the two must read as one screen. */
  .hint {
    margin: 0 0 var(--sp-3);
    max-inline-size: var(--measure);
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: var(--lh-body);
  }

  .code-form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin-block-start: var(--sp-3);
  }

  .code-label {
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  /* A TOKEN IS ONE 43-CHARACTER WORD and the address is longer, so without this the body scrolls sideways at 320px. */
  .wrap {
    overflow-wrap: anywhere;
  }

  .mono {
    font-family: ui-monospace, 'SF Mono', 'Cascadia Mono', Menlo, Consolas, monospace;
    font-size: var(--t-sm);
    letter-spacing: 0;
  }

  .code-said {
    margin: 0;
    color: var(--tone, var(--ink2));
    font-size: var(--t-sm);
  }

  .row-actions {
    flex-wrap: wrap;
    display: flex;
    gap: var(--sp-2);
    margin-block-start: var(--sp-3);
  }
</style>
