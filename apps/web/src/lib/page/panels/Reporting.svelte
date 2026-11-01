<!--
  Send numbers here: a key a project reports its numbers with, and the one line that uses it.

  UNDER AN ORGANISATION'S OR A PROJECT'S "Send numbers here". The key is bound to the row the page is about
  (`lib/record/reporting.ts`), made by the owner and shown once, then listed by name with when it was last used and a
  Revoke. A record with no list of readings draws nothing here at all, and a reader who cannot make keys still sees
  the line, with the record's own sentence about why there is no button.

  POLLING IS A FORM THAT FILES A PROPOSAL, on a project's or an organisation's page (`PollForm.svelte`), the two
  places the live feed add-on can land a reading (`pollBindsTo`). A poll calls out and costs
  money, so nothing is fetched until the owner approves the address and the interval once, on Decide.

  ON A LIVED ROW IT FOLDS TO ONE LINE (`setupFolded`, `foldedLine`): a row with a live key, a reading that names it, or
  made before today draws what arrives here in one sentence and a button that opens the whole of this in place, so the
  page opens on its own tiles. Only a row made today that holds nothing opens on setup. Open or shut is decided once a
  visit and never saved, and a key just made opens it and keeps it open while it is shown.

  THE KEYS ARE READ AGAIN when the reader comes back to the tab and every half minute while it is in view, so a key
  the project has just used stops saying it never was.

  A HOST PANEL (`panel-of.ts`): drawn under a section that declares `panel: reporting`, by the page reader's
  `BlockSlot.svelte` only, so nothing here reaches the entry chunk.
-->
<script lang="ts">
  import { getContext, untrack } from 'svelte';
  import { createClient, type ReportKeyRow } from '@braindog/client';
  import { SHAPE_KEY, type ShapeBox } from '../shape-key.ts';
  import { closed, opened } from '$lib/ui/screen.svelte.ts';
  import { apiBase } from '$lib/at.ts';
  import { rowsOf as tabRows } from '$lib/data/ref-rows.ts';
  import { since } from 'braindog-render';
  import { copy } from '$lib/copy.ts';
  import * as clipboard from '$lib/clipboard.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import Button from '$lib/ui/Button.svelte';
  import PollForm from './PollForm.svelte';
  import { pollBindsTo } from '$lib/record/poll-form.ts';
  import {
    FOLD_WORDS,
    READINGS,
    bindable,
    bindingOf,
    curlLine,
    dayOf,
    foldedLine,
    keyFor,
    organisationOf,
    setupFolded,
    type Binding,
  } from '$lib/record/reporting.ts';

  let { register, seq, title }: { register: string; seq: number; title: string } = $props();
  /* THE PAGE'S OWN ANSWER OF ITS PROJECT, where this panel is under a project's page (`shape-key.ts`). */
  const shapeBox = getContext<ShapeBox | undefined>(SHAPE_KEY);

  let from = $state<'reading' | 'absent' | 'ready'>('reading');
  let binding = $state<Binding | null>(null);
  let field = $state('');
  let keys = $state<ReportKeyRow[]>([]);
  /** Why this reader cannot list or make keys, in the record's words, or '' when they can. */
  let cannot = $state('');
  let minted = $state<string | null>(null);
  let busy = $state(false);
  let origin = $state('');
  /** The organisation that lists this project, which its readings name too, or null. */
  let listedBy = $state<string | null>(null);
  /** How many readings name this row, and the newest one's time. */
  let readings = $state(0);
  let lastReading = $state<string | null>(null);
  /** Whether the whole of setup is drawn, or only the one line it folds to. Per visit, never saved. */
  let open = $state(false);
  /** Whether there is a list of readings to report to, known before the rest is read: the folded line's place is held. */
  let held = $state(false);

  const spoken = $derived(`${register}#${seq}`);
  const line = $derived(curlLine(origin, minted, copy.reportPlaceholder));
  const bodyId = $derived(`report-${register}-${seq}`);
  /** The newest time any of this row's keys was used, or null. */
  const lastUsed = $derived(keys.reduce<string | null>((a, k) => (k.last_used_at && (!a || k.last_used_at > a) ? k.last_used_at : a), null));
  const folded = $derived(foldedLine({ keys: keys.length, lastUsed, readings, lastReading }));

  /*
   * ONE ROUND TRIP AFTER THE DECLARATION, NOT FIVE: whether there is a list of readings is the one thing the rest waits
   * on, and the declaration is usually in already (`schemas`). The row, the organisations, the readings and the keys
   * are then asked together; one after another they landed a second after the page and pushed the blocks under them down.
   * While they are out the folded line's place is held (`held`), as it is drawn on a lived row.
   */
  /*
   * HELD OPEN AS ONE OF THE SCREEN'S CALLS (`screen.svelte.ts`), and a read that fails draws nothing: the page said it was
   * drawn while this was still out, so a look of his record caught "Send numbers here" over an empty card on every
   * project, and a read that threw left the held place empty for good.
   */
  async function load() {
    const at = opened();
    try {
      await read();
    } catch {
      from = 'absent';
      held = false;
    } finally {
      closed(true, at);
    }
  }

  async function read() {
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
    held = true;
    /* THE ROW ITSELF, for the day it was made (whether setup folds) and, on a project, its id; A PROJECT AN ORGANISATION
       LISTS reports for that organisation too, so its numbers are on the organisation's page; and HOW MANY READINGS NAME
       THIS ROW, and when the newest is dated: one row read, and its count. */
    const listsOrgs = register === 'things' && bound.field !== 'organisation';
    /* THE ROW IS THE PAGE'S, where the page answered its project (scope 2026-10-24 A21): its id and the day it was made
       came with the page, so it is asked for only on a page that did not carry it. */
    const answered = (await shapeBox?.hold?.taken(spoken).catch(() => null)) ?? null;
    const [row, orgs, read, keyed] = await Promise.all([
      answered !== null ? Promise.resolve({ ok: true as const, value: answered.row }) : client.get(register, seq),
      /* THE TAB'S WALK OF ORGANISATIONS (`ref-rows.ts`), which the page beside this walked already to name its refs (scope
         2026-10-24 A21), and not a read of its own. */
      listsOrgs ? tabRows(client, apiBase(), 'organisations') : Promise.resolve(null),
      client.list({ register: READINGS, where: { field: bound.field, is: spoken }, order: [{ field: 'at', dir: 'desc' }], limit: 1 }),
      client.reportKeys(),
    ]);
    const made = row.ok ? (row.value as { created_at?: unknown } | null)?.created_at : null;
    let organisation: string | null = null;
    if (listsOrgs) {
      const id = row.ok ? (row.value as { id?: unknown } | null)?.id : null;
      if (typeof id === 'string' && orgs) organisation = organisationOf(orgs as never, id);
    }
    listedBy = bound.links.includes('organisation') ? organisation : null;
    binding = bindingOf(bound.field, spoken, { source: bound.source, organisation, links: bound.links });
    readings = read.ok ? read.value.matched : 0;
    const newest = read.ok ? (read.value.rows[0] as { fields?: { at?: unknown } } | undefined)?.fields?.at : null;
    lastReading = typeof newest === 'string' ? newest : null;
    keysFrom(keyed);
    /* OPEN OR SHUT IS DECIDED ONCE A VISIT, here, and never saved: a key read again later does not fold it under the reader. */
    open = !setupFolded({ keys: keys.length, readings, madeDay: dayOf(typeof made === 'string' ? made : null), today: dayOf(Date.now())! });
    from = 'ready';
  }

  function keysFrom(out: Awaited<ReturnType<ReturnType<typeof createClient>['reportKeys']>>) {
    if (out.ok) {
      keys = out.value.filter((k) => !k.revoked_at && keyFor(k.fixed, field, spoken));
      cannot = '';
    } else cannot = 'refusal' in out ? out.refusal.fix : copy.reportUnread;
  }

  async function list(client = createClient({ base: apiBase() })) {
    keysFrom(await client.reportKeys());
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
    open = true;
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
    <!-- SETUP FOLDS TO ONE LINE on a lived row (`setupFolded`), so the page's own tiles hold the first screen. The
         button opens today's whole panel in place; a key just made keeps it open while it is shown once. -->
    <div class="report-fold">
      <p class="report-folded">{folded}</p>
      {#if !minted}
        <Button weight="bare" aria-expanded={open} aria-controls={bodyId} onclick={() => (open = !open)}>{open ? FOLD_WORDS.hide : FOLD_WORDS.show}</Button>
      {/if}
    </div>

    <div class="report-body" id={bodyId} hidden={!open}>
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

      {#if pollBindsTo(register, field)}<PollForm {register} {seq} {title} organisation={listedBy} />{/if}
    </div>
  </section>
{:else if held}
  <!-- THE FOLDED LINE'S PLACE, while what it says is read: its words and its button as they are drawn, and nothing in it to press. -->
  <section class="report" aria-hidden="true" inert data-held-line>
    <div class="report-fold">
      <p class="report-folded">&nbsp;</p>
      <Button weight="bare" disabled>{FOLD_WORDS.show}</Button>
    </div>
  </section>
{/if}

<style>
  .report {
    display: grid;
    gap: var(--sp-2);
    max-inline-size: var(--measure);
    margin-block-start: var(--sp-3);
  }

  .report[data-held-line] {
    visibility: hidden;
  }

  .report-fold {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2) var(--sp-3);
  }

  /* THE PRESS FOLLOWS THE SENTENCE, quiet words and not a filled button, so it no longer floats mid-row beside a short
     line (the lists review, L33). */
  .report-folded {
    flex: 0 1 auto;
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
    text-wrap: pretty;
  }

  /* THE PANEL ITSELF, today's whole of it, drawn only while open; `hidden` keeps the poll form's half-typed fields. */
  .report-body:not([hidden]) {
    display: grid;
    gap: var(--sp-2);
  }

  .report-why {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
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
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .report-code {
    margin: 0;
    padding: var(--sp-2) var(--sp-3);
    border: 1px solid var(--rule);
    border-radius: var(--r-xs);
    background: var(--tile-2);
    color: var(--ink);
    font-family: var(--font-mono);
    font-size: var(--fs-meta);
    overflow-wrap: anywhere;
  }

  .report-do {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  .report-said {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
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
    border-block-end: 1px solid var(--rule);
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
    color: var(--ink-3);
    font-size: var(--fs-meta);
    white-space: nowrap;
  }
</style>
