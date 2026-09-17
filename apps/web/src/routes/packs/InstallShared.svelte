<!--
  Install a use case somebody shared: a file from this computer or an https address (`sharing.ts`).

  THE FILE IS READ HERE AND PLANNED BY THE RECORD. `readShared` runs in this tab first, so a file too large, a
  credential in it or a block kind nothing draws is said at once; the record then reads it through the same door and
  plans it, and what is drawn is that plan. On the sample nothing is planned, and the sentence says so.
-->
<script lang="ts">
  import type { createClient } from '@braindog/client';
  import { copy } from '$lib/copy.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { packDocument, type PackState } from '$lib/record/packs.ts';
  import SharedPlan from './SharedPlan.svelte';
  import { installShared, planShared, readAddress, type SharedPlan as Plan } from './sharing.ts';

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
  let plan = $state<Plan | null>(null);
  let last: { text: string; source: 'local' | 'url'; ref?: string } | null = null;

  async function planText(text: string, source: 'local' | 'url', ref?: string) {
    said = null;
    plan = null;
    last = { text, source, ...(ref === undefined ? {} : { ref }) };
    if (!live || !client) {
      const { readShared } = await import('@braindog/declare');
      const read = await readShared(text);
      said = read.ok ? copy.notWritten(copy.shareInstall(read.value.usecase.title)) : 'refusal' in read ? read.refusal.fix : copy.writeRaced;
      return;
    }
    const out = await planShared(client, { text, source, ...(ref === undefined ? {} : { ref }) }, installed, (id, held) => packDocument(id, held));
    if (out.ok) plan = out.plan;
    else said = out.fix;
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
      const read = await readAddress(address);
      if (!read.ok) {
        said = read.fix;
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
      const out = await installShared(client, plan);
      if (out.ok) {
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
  {#if said}<p class="shared-said" role="status">{said}</p>{/if}
  {#if plan}<SharedPlan {plan} {busy} oninstall={() => void install()} oncancel={() => (plan = null)} />{/if}
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
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-sm);
  }
</style>
