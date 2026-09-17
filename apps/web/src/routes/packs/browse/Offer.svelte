<!--
  What a use case offers on this record, and the plan when Install is pressed: one component for a browse card and a use
  case's own page, so both install the same way (`sharing.ts`).

  INSTALL IS THE SAME PLAN A SHARED FILE GETS. The built-in use case is handed to the record as the file it would be
  (`builtInFile`), planned by `planUseCase` and installed pack by pack through `installPack`; then its example rows are
  linked and the rail order it carries is kept, the two steps onboarding takes after an install (`afterInstall`).
-->
<script lang="ts">
  import type { createClient } from '@braindog/client';
  import { USE_CASES, type UseCase } from '@braindog/seed/usecases';
  import { builtInFile, modulesToInstall } from '@braindog/seed/usecases/share';
  import { copy } from '$lib/copy.ts';
  import * as pref from '$lib/pref.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { packDocument, relabelDocument, type PackState } from '$lib/record/packs.ts';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import SharedPlan from '../SharedPlan.svelte';
  import { afterInstall, installShared, keepVoice, offerFor, planShared, speakingStates, switchTo, useCaseTitle, voiceQuestion, type SharedPlan as Plan } from '../sharing.ts';

  let {
    u,
    client,
    live,
    states,
    onchanged,
  }: { u: UseCase; client: ReturnType<typeof createClient> | null; live: boolean; states: readonly PackState[]; onchanged: () => Promise<void> } = $props();

  const carries = $derived(u.pack !== null);
  /* THE STATES WITH WHO WAS CHOSEN TO SPEAK, so a use case put in beside another offers Switch to, not In use. */
  let spoken = $state.raw<Awaited<ReturnType<typeof speakingStates>>>([]);
  $effect(() => {
    const held = states;
    spoken = [...held];
    if (live && client) void speakingStates(client, held).then((read) => (states === held ? (spoken = read) : null));
  });
  const offer = $derived(offerFor(u.usecase, spoken, carries, modulesToInstall(u), u.version));
  let busy = $state(false);
  let plan = $state<Plan | null>(null);
  let refused = $state<{ fix: string; code: string | null } | null>(null);
  /* WHOSE VOICE THE RECORD KEEPS, asked when another use case speaks now, with the rule's answer picked to begin with. */
  let asked = $state<{ now: string } | null>(null);
  let choice = $state<'speaks' | 'beside'>('beside');
  let relabel = $state(true);
  let heard: Awaited<ReturnType<typeof speakingStates>> = [];

  async function offerInstall() {
    if (busy) return;
    if (!live || !client) {
      toasts.push(copy.notWritten(copy.shareInstall(u.title)), { intent: 'warn' });
      return;
    }
    busy = true;
    refused = null;
    try {
      const file = builtInFile(u.usecase);
      if (!file) return;
      const out = await planShared(client, { text: JSON.stringify(file), source: 'local' }, states, (m, held, id) => packDocument(m, held, id), (m, held, id) => relabelDocument(m, held, id));
      if (out.ok) {
        heard = await speakingStates(client, states);
        /* AN UPDATE ASKS NOTHING: the use case is already here, speaking or beside, and stays as it was. */
        const q = offer === 'update' ? null : voiceQuestion(heard, u.usecase);
        asked = q === null ? null : { now: useCaseTitle(q.now, USE_CASES) };
        choice = q?.rule ?? 'speaks';
        plan = out.plan;
      } else refused = { fix: out.fix, code: out.code };
    } finally {
      busy = false;
    }
  }

  async function install() {
    if (!client || !plan || busy) return;
    const p = plan;
    busy = true;
    try {
      const out = await installShared(client, p, relabel);
      if (out.ok) {
        const after = await afterInstall(client, p, pref.read().nav ?? []);
        if (asked) await keepVoice(client, heard, p.usecase.id, choice);
        if (after.nav) pref.write({ nav: after.nav });
        toasts.push(copy.shareInstalled(p.usecase.title), { intent: 'good' });
        plan = null;
      } else toasts.push(out.done.length > 0 ? copy.shareKept(out.fix ?? copy.writeRaced, out.done) : (out.fix ?? copy.writeRaced), { intent: 'warn' });
      await onchanged();
    } finally {
      busy = false;
    }
  }

  async function switchOver() {
    if (busy) return;
    if (!live || !client) {
      toasts.push(copy.notWritten(copy.switchTo(u.title)), { intent: 'warn' });
      return;
    }
    busy = true;
    try {
      const out = await switchTo(client, u.usecase, states, carries);
      toasts.push(out.ok ? copy.switchedTo(u.title) : out.fix, { intent: out.ok ? 'good' : 'warn' });
      await onchanged();
    } finally {
      busy = false;
    }
  }
</script>

<div class="offer">
  <div class="offer-row">
    {#if offer === 'in-use'}
      <span class="in-use"><Icon name="check" size="s" />{copy.inUse}</span>
    {:else if offer === 'update'}
      <Button weight="quiet" disabled={busy || plan !== null} onclick={() => void offerInstall()}>
        {busy && plan === null ? copy.packPlanning : copy.updateTo(u.version)}
      </Button>
    {:else if offer === 'switch'}
      <Button weight="quiet" disabled={busy} onclick={() => void switchOver()}>{copy.switchTo(u.title)}</Button>
    {:else}
      <Button weight="quiet" disabled={busy || plan !== null} onclick={() => void offerInstall()}>
        {busy && plan === null ? copy.packPlanning : copy.shareInstall(u.title)}
      </Button>
    {/if}
  </div>
  {#if refused}
    <p class="refused" role="status">{refused.fix}{#if refused.code}<span class="code">{copy.refusalCode(refused.code)}</span>{/if}</p>
  {/if}
  {#if plan}
    <SharedPlan {plan} {busy} voice={asked} bind:choice bind:relabel oninstall={() => void install()} oncancel={() => (plan = null)} />
  {/if}
</div>

<style>
  .offer {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  .offer-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
  }

  .in-use {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .refused {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  .code {
    color: var(--dim);
    font-family: var(--font-id);
    font-size: var(--t-xs);
  }
</style>
