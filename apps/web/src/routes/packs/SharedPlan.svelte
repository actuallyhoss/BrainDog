<!--
  What installing a shared use case would do, as the record planned it (`sharing.ts`).

  ONE PLAN, PACK BY PACK, IN THE ORDER THEY GO IN. The modules it builds on first, then its own pack. Each says what it
  adds, what an update changes or takes away, what it calls out and how many example rows come with it, and a
  conflict with a list already here is said beside the pack it belongs to and keeps Install from being pressed.
-->
<script lang="ts">
  import { copy } from '$lib/copy.ts';
  import { DEPLOYMENT } from '$lib/record/api.ts';
  import { installWords } from '$lib/record/actions.ts';
  import CallsOut from '$lib/ui/CallsOut.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { words as vaultWords } from '$lib/record/vault.ts';
  import { installable, moduleTitle, nothingElse, relabelled, type SharedPlan } from './sharing.ts';

  let {
    plan,
    busy,
    oninstall,
    oncancel,
    voice = null,
    choice = $bindable('beside'),
    relabel = $bindable(true),
  }: {
    plan: SharedPlan;
    busy: boolean;
    oninstall: () => void;
    oncancel: () => void;
    /** Whose voice the record keeps, asked when another use case speaks now: that use case's title. */
    voice?: { now: string } | null;
    choice?: 'speaks' | 'beside';
    /** Whether the modules already here that the use case gives words and targets to are updated with it. */
    relabel?: boolean;
  } = $props();

  const own = $derived(plan.packs.find((p) => p.role === 'usecase') ?? null);
  const modules = $derived(plan.packs.filter((p) => p.role === 'module' && p.installedVersion === null));
  const updates = $derived(relabelled(plan));
  const updating = $derived(own !== null && own.installedVersion !== null);
  const same = $derived(own !== null && own.direction === 'reinstall' && own.adds.length === 0 && own.changes.length === 0 && own.retires.length === 0);
</script>

<section class="plan" aria-label={copy.sharePlanTitle(plan.usecase.title, plan.usecase.version)}>
  <header class="plan-head">
    <h3 class="plan-title">{copy.sharePlanTitle(plan.usecase.title, plan.usecase.version)}</h3>
    <span class="plan-by">{copy.shareBy(plan.usecase.author)}</span>
  </header>
  <p class="plan-summary">{plan.usecase.summary}</p>

  <dl class="diff">
    {#if plan.enable.length > 0}
      <dt>{copy.shareTurnsOn}</dt>
      <dd>{plan.enable.map(moduleTitle).join(', ')}</dd>
    {/if}
    {#if modules.length > 0}
      <dt>{copy.shareInstallsFirst}</dt>
      <dd>
        <ul class="diff-adds">
          {#each modules as m (m.id)}
            <li><Icon name="packs" size="s" /><span class="diff-name">{m.title}</span><span class="diff-detail">{m.adds.map((a) => a.name).join(', ')}</span></li>
          {/each}
        </ul>
      </dd>
    {/if}
    {#if updates.length > 0}
      <dt>{copy.shareRelabelFor(plan.usecase.title)}</dt>
      <dd>
        <label class="voice-pick">
          <input type="checkbox" bind:checked={relabel} disabled={busy} />
          <span>{copy.shareRelabel(updates.map((m) => m.title), plan.usecase.title)}</span>
        </label>
        {#if updates.some((m) => m.changes.length > 0)}<span class="diff-detail">{updates.flatMap((m) => m.changes).join(', ')}</span>{/if}
      </dd>
    {/if}
    {#if own}
      {#if updating && own.installedVersion}
        <dt>{copy.shareUpdates(own.installedVersion, own.version)}</dt>
        <dd>{#if same}{copy.shareSameVersion}{:else if nothingElse(plan)}{copy.shareNothingElse}{/if}</dd>
      {/if}
      {#if own.adds.length > 0}
        <dt>{copy.diffAdds}</dt>
        <dd>
          <ul class="diff-adds">
            {#each own.adds as add (add.kind + add.name)}
              <li><Icon name={add.kind === 'list' ? 'rows' : 'doc'} size="s" /><span class="diff-name">{add.name}</span></li>
            {/each}
          </ul>
        </dd>
      {/if}
      {#if own.changes.length > 0}
        <dt>{copy.shareChanges}</dt>
        <dd>{own.changes.join(', ')}</dd>
      {/if}
      {#if own.retires.length > 0}
        <dt>{copy.shareTakesAway}</dt>
        <dd>{own.retires.join(', ')}</dd>
      {/if}
    {/if}
    {#each plan.packs as p (p.id)}
      {#if p.conflicts.length > 0}
        <dt>{copy.diffConflicts}</dt>
        <dd>{#each p.conflicts as c (c)}<p>{c}</p>{/each}</dd>
      {/if}
    {/each}
    <CallsOut calls={plan.packs.flatMap((p) => p.calls)} hosted={DEPLOYMENT.kind !== 'self-host'} note={installWords.asksOnce} />
    {#if voice}
      <dt>{copy.voiceAsk}</dt>
      <dd>
        <fieldset class="voice" aria-label={copy.voiceAsk}>
          {#each [['beside', copy.voiceKeep(voice.now, plan.usecase.title)], ['speaks', copy.voiceTake(voice.now, plan.usecase.title)]] as [value, words] (value)}
            <label class="voice-pick">
              <input type="radio" name="voice-{plan.usecase.id}" {value} bind:group={choice} disabled={busy} />
              <span>{words}</span>
            </label>
          {/each}
        </fieldset>
      </dd>
    {/if}
    {#if plan.packs.some((p) => p.examples > 0)}
      <dt>{copy.diffSeeds}</dt>
      <dd>{plan.packs.reduce((n, p) => n + p.examples, 0)}</dd>
    {/if}
  </dl>
  <div class="plan-actions">
    <Button weight="primary" disabled={busy || !installable(plan) || same} onclick={oninstall}>
      {updating ? copy.shareUpdate(plan.usecase.title) : copy.shareInstall(plan.usecase.title)}
    </Button>
    <Button weight="bare" disabled={busy} onclick={oncancel}>{vaultWords.notNow}</Button>
  </div>
</section>

<style>
  .plan {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    padding-block: var(--sp-3);
    border-block-start: 1px solid var(--line-soft);
  }

  .plan-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--sp-2);
  }

  .plan-title {
    font-family: var(--font-ui);
    font-size: var(--t-base);
    font-weight: 600;
  }

  .plan-by,
  .plan-summary {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .plan-summary {
    margin: 0;
  }

  .diff {
    display: grid;
    grid-template-columns: minmax(6ch, max-content) minmax(0, 1fr);
    gap: var(--sp-1) var(--sp-4);
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-sm);
    line-height: 1.6;
  }

  .diff dt {
    color: var(--dim);
    font-weight: 600;
  }

  .diff dd {
    margin: 0;
  }

  .diff dd p {
    margin: 0;
  }

  .diff-adds {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .diff-adds li {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
  }

  .diff-name {
    color: var(--ink);
  }

  .diff-detail {
    color: var(--dim);
    font-size: var(--t-xs);
  }

  .voice {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    margin: 0;
    padding: 0;
    border: 0;
  }

  .voice-pick {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
    color: var(--ink);
    cursor: pointer;
  }

  .plan-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  @media (width < 640px) {
    .diff {
      grid-template-columns: minmax(0, 1fr);
    }

    .diff dd + dt {
      margin-block-start: var(--sp-2);
    }
  }
</style>
