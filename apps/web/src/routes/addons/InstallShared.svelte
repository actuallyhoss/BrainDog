<!--
  Install from anywhere: a use case or an add-on somebody shared, from a file on this
  computer, an https address, `git:owner/repo@ref:path`, or its text pasted in.

  THE FILE SAYS WHICH IT IS. `readCatalogueFile` reads it in this tab first, as a use case when it names one and as an
  add-on otherwise, so a file too large, a credential in it or a block kind nothing draws is said at once. The record then
  plans it (`browse/[id]/offer.ts` `planFor`, the path browse takes), and what is drawn is that plan, on the one plan
  sheet every install uses.

  AN ADDRESS IS READ BY THE HOST (`fetchShared`), so a site with no CORS header still installs, a `git:` address is read
  as its raw file on GitHub, and a private or local address is refused there. A refusal is said in a sentence, with its
  code beneath it.

  THE OWNER IN A BROWSER INSTALLS FROM THE SHEET. Anybody else is refused by the record, and the same file is then filed
  in Needs you as a `pack` proposal, where the owner reads the same plan. After a use case's install, the two steps
  onboarding takes: the example rows linked, and the rail order the file carries kept.
-->
<script lang="ts">
  import { at } from '$lib/at.ts';
  import { page } from '$app/state';
  import { USE_CASES } from '@braindog/seed/usecases';
  import { copy } from '$lib/copy.ts';
  import * as pref from '$lib/pref.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import PlanSheet from '$lib/market/PlanSheet.svelte';
  import type { Shell } from '$lib/record/boot-live.ts';
  import type { PackState } from '$lib/record/packs.ts';
  import { hostedHere } from '../settings/billing.ts';
  import { fileProposal } from './catalogue.ts';
  import { diffOf, install, notOwner, planFor, type OfferClient, type Planned } from './[id]/offer.ts';
  import { afterInstall, installShared, keepVoice, readOnHost, relabelled, speakingStates, useCaseTitle, voiceQuestion } from './sharing.ts';
  import { words } from './words.ts';

  let {
    client,
    installed,
    oninstalled,
    nameOf,
  }: {
    client: OfferClient | null;
    installed: readonly PackState[];
    oninstalled: () => void;
    /** A declaration id or a pack id as this record names it, for the plan sheet. */
    nameOf: (id: string) => string;
  } = $props();

  let picker = $state<HTMLInputElement | null>(null);
  let address = $state('');
  let pasted = $state('');
  let busy = $state(false);
  let said = $state<{ fix: string; code: string | null } | null>(null);
  let filed = $state<string | null>(null);
  let planned = $state.raw<Planned | null>(null);
  /** What was read, so a stale plan is read again and a refused install is filed on Decide as the same file. */
  let last: { text: string; source: 'local' | 'url' | 'paste'; ref: string | null; title: string; version: string; id: string } | null = null;

  /* WHOSE VOICE THE RECORD KEEPS, asked when another use case speaks now (`sharing.ts` `voiceQuestion`). */
  let asked = $state<{ now: string; title: string } | null>(null);
  let choice = $state<'speaks' | 'beside'>('beside');
  let relabel = $state(true);
  let heard: Awaited<ReturnType<typeof speakingStates>> = [];
  const updates = $derived(planned?.kind === 'usecase' ? relabelled(planned.plan) : []);

  async function planText(text: string, source: 'local' | 'url' | 'paste', ref: string | null) {
    said = null;
    filed = null;
    planned = null;
    if (!client) return;
    const { readCatalogueFile } = await import('@braindog/declare/catalogue');
    const file = await readCatalogueFile(text, { kind: source, ...(ref === null ? {} : { ref }) });
    if (!file.ok) {
      said = 'refusal' in file ? { fix: file.refusal.fix, code: file.refusal.code } : { fix: copy.writeRaced, code: null };
      return;
    }
    const f = file.value;
    const id = f.kind === 'usecase' ? f.shared.usecase.usecase : f.file.pack.manifest.pack;
    last = {
      text,
      source,
      ref,
      id,
      title: f.kind === 'usecase' ? f.shared.usecase.title : f.file.title,
      version: f.kind === 'usecase' ? f.shared.usecase.version : f.file.pack.manifest.version,
    };
    const out = await planFor(client, { kind: f.kind, id, source: 'file' }, { doc: f.kind === 'pack' ? f.file.doc : null, text }, installed, copy.writeRaced);
    if (!out.ok) {
      said = { fix: out.fix, code: out.code };
      return;
    }
    if (out.planned.kind === 'usecase') {
      const plan = out.planned.plan;
      heard = await speakingStates(client, installed);
      const q = plan.packs.some((p) => p.role === 'usecase' && p.installedVersion !== null) ? null : voiceQuestion(heard, plan.usecase.id);
      asked = q === null ? null : { now: useCaseTitle(q.now, USE_CASES), title: plan.usecase.title };
      choice = q?.rule ?? 'speaks';
      relabel = true;
    } else asked = null;
    planned = out.planned;
  }

  async function run(read: () => Promise<void>) {
    if (busy) return;
    busy = true;
    try {
      await read();
    } finally {
      busy = false;
    }
  }

  function fromFile(file: File | undefined) {
    if (!file) return;
    void run(async () => {
      /* WEIGHED BEFORE IT IS READ, so a huge file is not pulled into the tab to be refused. */
      if (file.size > 256 * 1024) said = { fix: words.tooBig(Math.ceil(file.size / 1024)), code: null };
      else await planText(await file.text(), 'local', file.name);
      if (picker) picker.value = '';
    });
  }

  function fromAddress() {
    if (!client || address.trim() === '') return;
    const c = client;
    void run(async () => {
      const read = await readOnHost(c, address);
      if (!read.ok) {
        said = { fix: read.fix, code: read.code };
        planned = null;
      } else await planText(read.text, 'url', address.trim());
    });
  }

  function fromPaste() {
    if (pasted.trim() === '') return;
    void run(() => planText(pasted, 'paste', null));
  }

  /** The same file, filed on Decide for the owner, when this person may not install it here. */
  async function askOwner(p: Planned) {
    if (!client || !last) return;
    const c = client;
    const question = copy.catalogueQuestion(last.title, last.version, null, null);
    const body = p.kind === 'pack' ? { install: last.id, doc: p.doc } : { file: last.text };
    const out = await fileProposal((name, args) => c.call(name, args), { question, body_kind: 'pack', body });
    if (out.ok) filed = out.id;
    else said = { fix: out.fix, code: out.code };
  }

  function approve() {
    const p = planned;
    if (!client || !p) return;
    const c = client;
    void run(async () => {
      if (p.kind === 'usecase') {
        const out = await installShared(c, p.plan, relabel);
        if (out.ok) {
          const after = await afterInstall(c, p.plan, pref.read().nav ?? []);
          if (asked) await keepVoice(c, heard, p.plan.usecase.id, choice);
          if (after.nav) pref.write({ nav: after.nav });
          toasts.push([words.installed(p.plan.usecase.title), ...(out.said ?? [])].join(' '), { intent: 'good' });
          planned = null;
          oninstalled();
          return;
        }
        if (out.done.length > 0) oninstalled();
        if (out.stale && last) return void (await planText(last.text, last.source, last.ref));
        planned = null;
        const fix = out.fix ?? copy.writeRaced;
        said = { fix: out.done.length > 0 ? copy.shareKept(fix, out.done) : fix, code: null };
        return;
      }
      const out = await install(c, p, installed, pref.read().nav ?? [], copy.writeRaced);
      if (out.ok) {
        toasts.push([words.installed(last?.title ?? ''), ...(out.said ?? [])].join(' '), { intent: 'good' });
        planned = null;
        oninstalled();
        return;
      }
      if (out.code === 'PLAN_STALE' && last) return void (await planText(last.text, last.source, last.ref));
      planned = null;
      if (notOwner(out.code)) await askOwner(p);
      else said = { fix: out.fix, code: out.code };
    });
  }
</script>

<!-- ONE COLUMN, THREE WAYS IN, each a label above its field and a quiet pill to read it. The one
     primary is the plan sheet's Approve, so nothing here is ink. -->
<div class="from">
  <p class="from-blurb">{words.fromBlurb}</p>
  <div class="from-row">
    <Button disabled={busy || !client} onclick={() => picker?.click()}><Icon name="download" size="s" />{copy.chooseFile}</Button>
    <input bind:this={picker} class="from-pick" type="file" accept=".json,application/json" tabindex="-1" aria-hidden="true" onchange={(e) => fromFile(e.currentTarget.files?.[0])} />
  </div>
  <form
    class="from-address"
    onsubmit={(e) => {
      e.preventDefault();
      fromAddress();
    }}
  >
    <label class="field-label" for="from-address">{words.address}</label>
    <div class="from-line">
      <div class="field from-field"><input id="from-address" class="field-input" type="text" inputmode="url" autocomplete="off" spellcheck="false" placeholder="https://" aria-describedby="from-address-hint" bind:value={address} /></div>
      <Button type="submit" disabled={busy || !client || address.trim() === ''}>{busy ? words.reading : words.read}</Button>
    </div>
    <p class="from-hint" id="from-address-hint">{words.addressHint}</p>
  </form>
  <form
    class="from-paste"
    onsubmit={(e) => {
      e.preventDefault();
      fromPaste();
    }}
  >
    <label class="field-label" for="from-paste">{words.paste}</label>
    <textarea id="from-paste" class="from-text" rows="6" spellcheck="false" bind:value={pasted}></textarea>
    <Button type="submit" disabled={busy || !client || pasted.trim() === ''}>{words.readPasted}</Button>
  </form>
  {#if said}<p class="from-said" role="status" title={said.code ? copy.refusalCode(said.code) : undefined}>{said.fix}</p>{/if}
  {#if filed !== null}<p class="from-said" role="status">{words.asked}{#if filed}{' '}<a class="tap" href={at(`/decide/${filed}`)}>{words.openDecide}</a>{/if}</p>{/if}
</div>

{#if planned}
  <PlanSheet diff={diffOf(planned)} {nameOf} hosted={hostedHere(page.data as unknown as Shell)} {busy} onapprove={approve} oncancel={() => (planned = null)}>
    {#snippet extra()}
      {#if updates.length > 0 && planned?.kind === 'usecase'}
        <label class="from-pick-row">
          <input type="checkbox" bind:checked={relabel} disabled={busy} />
          <span>{copy.shareRelabel(updates.map((m) => m.title), planned.plan.usecase.title)}</span>
        </label>
      {/if}
      {#if asked}
        <fieldset class="from-voice">
          <legend class="from-legend">{copy.voiceAsk}</legend>
          {#each [['beside', copy.voiceKeep(asked.now, asked.title)], ['speaks', copy.voiceTake(asked.now, asked.title)]] as [value, line] (value)}
            <label class="from-pick-row">
              <input type="radio" name="from-voice" {value} checked={choice === value} onchange={() => (choice = value as typeof choice)} disabled={busy} />
              <span>{line}</span>
            </label>
          {/each}
        </fieldset>
      {/if}
    {/snippet}
  </PlanSheet>
{/if}

<style>
  .from {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
    max-inline-size: var(--measure);
  }

  .from-blurb {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: var(--lead-ui);
  }

  .from-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-3);
  }

  .from-pick {
    display: none;
  }

  .from-address,
  .from-paste {
    display: flex;
    flex-direction: column;
    align-items: start;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  .from-address .field-label,
  .from-paste .field-label {
    margin: 0;
  }

  /* THE ADDRESS AND ITS PILL ON ONE LINE, the field taking what the pill leaves; on a phone the pill wraps under it. */
  .from-line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
    inline-size: 100%;
  }

  .from-field {
    flex: 1 1 16rem;
    min-inline-size: 0;
  }

  /**
   * THE PASTE BOX IS A FIELD, the same `--tile-2` well with no border and the `--r-pop` corner, full width at every size and
   * growing with what is pasted. Its focus is the field's: the 2px ink ring offset 2.
   */
  .from-text {
    box-sizing: border-box;
    inline-size: 100%;
    min-block-size: 8lh;
    padding: var(--sp-2) var(--sp-3);
    background: var(--tile-2);
    border: 0;
    border-radius: var(--r-pop);
    color: var(--ink);
    font-family: var(--font-mono);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
    resize: vertical;
  }

  .from-hint {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .from-said {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
  }

  .from-voice {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    margin: 0;
    padding: 0;
    border: 0;
  }

  .from-legend {
    margin-block-end: var(--sp-1);
    color: var(--ink);
    font-size: var(--fs-meta);
    font-weight: 600;
  }

  .from-pick-row {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: var(--tap);
    color: var(--ink);
    font-size: var(--fs-meta);
  }
</style>
