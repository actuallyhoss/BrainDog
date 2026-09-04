<!--
  The Vault: what each key OPENS, and when each was last rotated. Never the value.

  Three things make it safe rather than convenient, and none of them may be relaxed:

    - No agent tool returns a secret. The whole /api/vault surface is refused to agents, because a
      tool reaching every credential in the estate would sit in the system prompt of every session
      on every turn — which is the highest-value thing prompt injection could ask for.
    - Reveal is deliberate and audited, with your name on the row.
    - THE BACKUP BENEFIT AND THE EXFILTRATION PATH ARE THE SAME OBJECT. That sentence is why this
      screen indexes what a key opens and stops there (12 §6).

  `/vault` carries NOTHING in its query string, ever. A credential id in the address is an entry in
  browser history and in URL-bar autocomplete (19 §5).
-->
<script lang="ts">
  import { titleOf } from '$lib/title.ts';
  import { relative } from 'braindog-render';
  import { copy } from '$lib/copy.ts';
  import { NOW, VAULT } from '$lib/record/api.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Chip from '$lib/ui/Chip.svelte';
  import Icon from '$lib/ui/Icon.svelte';

  const stale = $derived(VAULT.filter((c) => c.stale).length);
</script>

<svelte:head><title>{titleOf(copy.vault)}</title></svelte:head>

<PageHead icon="vault" title={copy.vault} count={VAULT.length}>
  {#snippet actions()}
    {#if stale}<Chip label="{stale} not rotated in six months" tone="warn" />{/if}
  {/snippet}
</PageHead>

<div class="page">
  <ul class="ledger">
    {#each VAULT as c}
      <li>
        <div class="line">
          <span class="seq">{c.kind}</span>
          <span class="line-main">
            <span class="line-title">{c.label}</span>
            <span class="line-detail">{copy.opens}: {c.opens}</span>
          </span>
          <span class="line-amount">
            <Button weight="bare">
              <Icon name="eye" size="s" />
              {copy.reveal}
            </Button>
          </span>
          <span class="line-when" data-intent={c.stale ? 'warn' : undefined}>
            {relative(c.rotated, NOW)}
          </span>
        </div>
      </li>
    {/each}
  </ul>

  <p class="note">
    <Icon name="alert" size="s" />
    {copy.revealWarning}
  </p>
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    padding: var(--sp-5) var(--sp-6) var(--sp-9);
    max-inline-size: 1000px;
  }

  .note {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    color: var(--dim);
    font-size: var(--t-xs);
  }

  @media (width < 900px) {
    .page {
      padding: var(--sp-4) var(--sp-4) var(--sp-8);
    }
  }
</style>
