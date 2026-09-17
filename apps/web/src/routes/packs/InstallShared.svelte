<!--
  Install a use case somebody shared: a file from this computer or an https address (`sharing.ts`).

  THE FILE IS READ HERE AND PLANNED BY THE RECORD. `readShared` runs in this tab first, so a file too large, a
  credential in it or a block kind nothing draws is said at once; the record then reads it through the same door and
  plans it, and what is drawn is that plan. On the sample nothing is planned, and the sentence says so.

  AN ADDRESS IS READ BY THE HOST on a live record (`fetchUseCase`), so a site with no CORS header still installs, and a
  private or local address is refused there. A refusal is said in a sentence, with its code beneath it.

  AFTER THE INSTALL, the two steps onboarding takes: the example rows linked, and the rail order the file carries kept.
-->
<script lang="ts">
  import type { createClient } from '@braindog/client';
  import { USE_CASES } from '@braindog/seed/usecases';
  import { copy } from '$lib/copy.ts';
  import * as pref from '$lib/pref.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { packDocument, relabelDocument, type PackState } from '$lib/record/packs.ts';
  import SharedPlan from './SharedPlan.svelte';
  import { afterInstall, installShared, keepVoice, planShared, readAddress, readOnHost, speakingStates, useCaseTitle, voiceQuestion, type SharedPlan as Plan } from './sharing.ts';

  let {
    client,
    live,
    installed,
    oninstalled,
  }: { client: ReturnType<typeof createClient> | null; live: boolean; installed: readonly PackState[]; oninstalled: () => void } = $props();

  let picker = $state<HTMLInputElement | null>(null);
  let address = $state('');
  let busy = $state(false);
  let said = $state<string | null>(null);
  let code = $state<string | null>(null);
  let plan = $state<Plan | null>(null);
  let last: { text: string; source: 'local' | 'url'; ref?: string } | null = null;
  /* WHOSE VOICE THE RECORD KEEPS, asked when another use case speaks now (`sharing.ts` `voiceQuestion`). */
  let asked = $state<{ now: string } | null>(null);
  let choice = $state<'speaks' | 'beside'>('beside');
  let relabel = $state(true);
  let heard: Awaited<ReturnType<typeof speakingStates>> = [];

  async function planText(text: string, source: 'local' | 'url', ref?: string) {
    said = null;
    code = null;
    plan = null;
    last = { text, source, ...(ref === undefined ? {} : { ref }) };
    if (!live || !client) {
      const { readShared } = await import('@braindog/declare');
      const read = await readShared(text);
      said = read.ok ? copy.notWritten(copy.shareInstall(read.value.usecase.title)) : 'refusal' in read ? read.refusal.fix : copy.writeRaced;
      code = !read.ok && 'refusal' in read ? read.refusal.code : null;
      return;
    }
    const out = await planShared(client, { text, source, ...(ref === undefined ? {} : { ref }) }, installed, (id, held, usecase) => packDocument(id, held, usecase), (id, held, usecase) => relabelDocument(id, held, usecase));
    if (out.ok) {
      heard = await speakingStates(client, installed);
      const q = out.plan.packs.some((p) => p.role === 'usecase' && p.installedVersion !== null) ? null : voiceQuestion(heard, out.plan.usecase.id);
      asked = q === null ? null : { now: useCaseTitle(q.now, USE_CASES) };
      choice = q?.rule ?? 'speaks';
      plan = out.plan;
    } else {
      said = out.fix;
      code = out.code;
    }
  }

  async function fromFile(file: File | undefined) {
    if (!file || busy) return;
    busy = true;
    try {
      /* WEIGHED BEFORE IT IS READ, so a huge file is not pulled into the tab to be refused. */
      if (file.size > 300 * 1024) said = copy.shareTooBig(Math.ceil(file.size / 1024));
      else await planText(await file.text(), 'local', file.name);
    } finally {
      busy = false;
      if (picker) picker.value = '';
    }
  }

  async function fromAddress() {
    if (busy || address.trim() === '') return;
    busy = true;
    try {
      const read = live && client ? await readOnHost(client, address) : await readAddress(address);
      if (!read.ok) {
        said = read.fix;
        code = (read as { code?: string | null }).code ?? null;
        plan = null;
      } else await planText(read.text, 'url', address.trim());
    } finally {
      busy = false;
    }
  }

  async function install() {
    if (!client || !plan || busy) return;
    busy = true;
    try {
      const out = await installShared(client, plan, relabel);
      if (out.ok) {
        const after = await afterInstall(client, plan, pref.read().nav ?? []);
        if (asked) await keepVoice(client, heard, plan.usecase.id, choice);
        if (after.nav) pref.write({ nav: after.nav });
        toasts.push(copy.shareInstalled(plan.usecase.title), { intent: 'good' });
        plan = null;
        oninstalled();
        return;
      }
      const fix = out.fix ?? copy.writeRaced;
      toasts.push(out.done.length > 0 ? copy.shareKept(fix, out.done) : fix, { intent: 'warn' });
      if (out.done.length > 0) oninstalled();
      if (out.stale && last) await planText(last.text, last.source, last.ref);
    } finally {
      busy = false;
    }
  }
</script>

<div class="shared-in">
  <div class="shared-row">
    <Button weight="quiet" disabled={busy} onclick={() => picker?.click()}><Icon name="download" size="s" />{copy.chooseFile}</Button>
    <input bind:this={picker} class="file-pick" type="file" accept=".json,application/json" tabindex="-1" aria-hidden="true" onchange={(e) => void fromFile(e.currentTarget.files?.[0])} />
    <form
      class="shared-address"
      onsubmit={(e) => {
        e.preventDefault();
        void fromAddress();
      }}
    >
      <label class="field-label" for="shared-address">{copy.shareAddress}</label>
      <div class="field address"><input id="shared-address" class="field-input" type="url" inputmode="url" autocomplete="off" spellcheck="false" placeholder="https://" bind:value={address} /></div>
      <Button weight="bare" type="submit" disabled={busy || address.trim() === ''}>{busy ? copy.shareReading : copy.readAddress}</Button>
    </form>
  </div>
  {#if said}<p class="shared-said" role="status">{said}{#if code}<span class="shared-code">{copy.refusalCode(code)}</span>{/if}</p>{/if}
  {#if plan}<SharedPlan {plan} {busy} voice={asked} bind:choice bind:relabel oninstall={() => void install()} oncancel={() => (plan = null)} />{/if}
</div>

<style>
  .shared-in {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .shared-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-3);
  }

  .file-pick {
    display: none;
  }

  .shared-address {
    display: flex;
    flex: 1 1 18rem;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  .address {
    flex: 1 1 12rem;
    min-inline-size: 0;
  }

  .shared-said {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  .shared-code {
    color: var(--dim);
    font-family: var(--font-id);
    font-size: var(--t-xs);
  }
</style>
