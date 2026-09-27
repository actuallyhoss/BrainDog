<!--
  Send numbers here: a key a project reports its numbers with, and the one line that uses it.

  UNDER AN ORGANISATION'S "Send numbers here" AND A PROJECT'S "Runs on". The key is bound to the row the page is about
  (`lib/record/reporting.ts`), made by the owner and shown once, then listed by name with when it was last used and a
  Revoke. A record with no list of readings draws nothing here at all, and a reader who cannot make keys still sees
  the line, with the record's own sentence about why there is no button.

  POLLING IS A FORM THAT FILES A PROPOSAL, on an organisation's page (`PollForm.svelte`). A poll calls out and costs
  money, so nothing is fetched until the owner approves the address and the interval once, on Decide.

  THE KEYS ARE READ AGAIN when the reader comes back to the tab and every half minute while it is in view, so a key
  the project has just used stops saying it never was.

  A HOST PANEL (`panel-of.ts`): drawn under a section that declares `panel: reporting` or `panel: actions`, or under
  either old heading, by the page reader's `BlockSlot.svelte` only, so nothing here reaches the entry chunk.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { createClient, type ReportKeyRow } from '@braindog/client';
  import { apiBase } from '$lib/at.ts';
  import { since } from 'braindog-render';
  import { copy } from '$lib/copy.ts';
  import * as clipboard from '$lib/clipboard.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import Button from '$lib/ui/Button.svelte';
  import PollForm from './PollForm.svelte';
  import { READINGS, bindable, bindingOf, curlLine, keyFor, organisationOf, type Binding } from '$lib/record/reporting.ts';

  let { register, seq, title }: { register: string; seq: number; title: string } = $props();

  let from = $state<'reading' | 'absent' | 'ready'>('reading');
  let binding = $state<Binding | null>(null);
  let field = $state('');
  let keys = $state<ReportKeyRow[]>([]);
  /** Why this reader cannot list or make keys, in the record's words, or '' when they can. */
  let cannot = $state('');
  let minted = $state<string | null>(null);
  let busy = $state(false);
  let origin = $state('');

  const spoken = $derived(`${register}#${seq}`);
  const line = $derived(curlLine(origin, minted, copy.reportPlaceholder));

  async function load() {
    origin = location.origin;
    const client = createClient({ base: apiBase() });
    const schema = await client.schema(READINGS);
    const fields = schema.ok ? ((schema.value as { fields?: unknown }).fields ?? []) : [];
    const bound = Array.isArray(fields) ? bindable(fields, register) : null;
    if (!bound) {
      from = 'absent';
      return;
    }
    field = bound.field;
    /* A PROJECT AN ORGANISATION LISTS reports for that organisation too, so its numbers are on the organisation's page. */
    let organisation: string | null = null;
    if (register === 'things' && bound.field !== 'organisation') {
      const row = await client.get(register, seq);
      const orgs = await client.list({ register: 'organisations', limit: 200 });
      const id = row.ok ? (row.value as { id?: unknown }).id : null;
      if (typeof id === 'string' && orgs.ok) organisation = organisationOf(orgs.value.rows as never, id);
    }
    binding = bindingOf(bound.field, spoken, { source: bound.source, organisation, links: bound.links });
    await list(client);
    from = 'ready';
  }

  async function list(client = createClient({ base: apiBase() })) {
    const out = await client.reportKeys();
    if (out.ok) {
      keys = out.value.filter((k) => !k.revoked_at && keyFor(k.fixed, field, spoken));
      cannot = '';
    } else cannot = 'refusal' in out ? out.refusal.fix : copy.reportUnread;
  }

  $effect(() => {
    void spoken;
    untrack(() => void load());
  });

  /** How often the keys are read again while the page is in view. */
  const RELIST_MS = 30_000;

  $effect(() => {
    const again = () => {
      if (from === 'ready' && !busy && document.visibilityState === 'visible') void list();
    };
    const timer = setInterval(again, RELIST_MS);
    window.addEventListener('focus', again);
    document.addEventListener('visibilitychange', again);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', again);
      document.removeEventListener('visibilitychange', again);
    };
  });

  async function make() {
    if (!binding || busy) return;
    busy = true;
    const out = await createClient({ base: apiBase() }).createReportKey({ register: READINGS, fixed: binding.fixed, stamp: binding.stamp, name: title });
    busy = false;
    if (!out.ok) {
      toasts.push('refusal' in out ? out.refusal.fix : copy.reportUnread, { intent: 'warn' });
      return;
    }
    minted = out.value.bearer;
    await list();
  }

  async function revoke(key: ReportKeyRow) {
    if (busy) return;
    busy = true;
    const out = await createClient({ base: apiBase() }).revokeToken({ id: key.id });
    busy = false;
    if (!out.ok) {
      toasts.push('refusal' in out ? out.refusal.fix : copy.reportUnread, { intent: 'warn' });
      return;
    }
    toasts.push(copy.reportRevoked, { intent: 'good' });
    await list();
  }
</script>

{#if from === 'ready'}
  <section class="report" aria-label={copy.reportHeading}>
    <p class="report-why">{copy.reportWhy(title)}</p>

    {#if minted}
      {@const key = minted}
      <div class="report-once" role="status">
        <p class="report-label">{copy.tokenOnce}</p>
        <p class="report-code">{key}</p>
        <div class="report-do">
          <Button weight="primary" onclick={() => void clipboard.put(key, copy.tokenCopied)}>{copy.copyToken}</Button>
          <Button weight="bare" onclick={() => (minted = null)}>{copy.connectDone}</Button>
        </div>
      </div>
    {/if}

    <p class="report-label">{copy.reportLine}</p>
    <p class="report-code">{line}</p>
    <div class="report-do">
      <Button weight="quiet" onclick={() => void clipboard.put(line, copy.lineCopied)}>{copy.copyLine}</Button>
      {#if !cannot && !minted}
        <Button weight="quiet" disabled={busy} onclick={() => void make()}>{copy.reportMake}</Button>
      {/if}
    </div>
    {#if cannot}<p class="report-said" role="status">{cannot}</p>{/if}

    {#if keys.length}
      <ul class="report-keys" aria-label={copy.reportKeys}>
        {#each keys as key (key.id)}
          <li class="report-key">
            <span class="report-key-name">{key.name ?? title}</span>
            <span class="report-key-when">{key.last_used_at ? copy.usedWhen(since(key.last_used_at)) : copy.neverUsed}</span>
            <Button weight="bare" disabled={busy} aria-label="{copy.revokeKey} {key.name ?? title}" onclick={() => void revoke(key)}>{copy.revokeKey}</Button>
          </li>
        {/each}
      </ul>
    {/if}

    {#if register === 'organisations'}<PollForm {seq} {title} />{/if}
  </section>
{/if}

<style>
  .report {
    display: grid;
    gap: var(--sp-2);
    max-inline-size: var(--measure);
    margin-block-start: var(--sp-3);
  }

  .report-why {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-base);
    text-wrap: pretty;
  }

  .report-once {
    display: grid;
    gap: var(--sp-2);
    padding-block: var(--sp-2);
  }

  .report-label {
    margin: 0;
    margin-block-start: var(--sp-2);
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .report-code {
    margin: 0;
    padding: var(--sp-2) var(--sp-3);
    border: 1px solid var(--line);
    border-radius: var(--r-sm);
    background: var(--s1);
    color: var(--ink);
    font-family: var(--font-id);
    font-size: var(--t-sm);
    overflow-wrap: anywhere;
  }

  .report-do {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  .report-said {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  .report-keys {
    margin: 0;
    margin-block-start: var(--sp-2);
    padding: 0;
    list-style: none;
  }

  .report-key {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-block-size: var(--row-h);
    border-block-end: 1px solid var(--line-soft);
  }

  .report-key-name {
    flex: 1;
    min-inline-size: 0;
    overflow: hidden;
    color: var(--ink);
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .report-key-when {
    color: var(--dim);
    font-size: var(--t-sm);
    white-space: nowrap;
  }
</style>
