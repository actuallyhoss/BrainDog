<!--
  BrainDog's own page updates, as one card on Decide (DIRECTION §37): "BrainDog improved 4 of your pages", what changes
  on each, and Accept.

  ONE CARD AND NOT FOUR QUESTIONS. Each update is one line under the heading, the page and the newest thing it changes,
  and everything each one changes is folded under "See each change". Accept plans each with the record now and installs
  them in turn. A plan that asks to be read first (it would stop, call another service, take something away or move it
  on) opens on the plan sheet instead, which is where Add-ons approves the same thing (`improved.ts` `readFirst`).

  DRAWN AS A QUESTION IS DRAWN, in the queue's own classes (`kinds/queue.css`), so it reads as one more thing waiting on
  Decide and not as a notice: who asks, the question, what it does, and the answer.

  ONLY FOR THE OWNER, the one person a browser installs for (`offer.ts`); Decide does not draw it for anybody else.
-->
<script lang="ts">
  import { apiBase, at } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import * as pref from '$lib/pref.ts';
  import { createClient } from '@braindog/client';
  import type { PackState } from '$lib/record/packs.ts';
  import PlanSheet from '$lib/market/PlanSheet.svelte';
  import Face from '$lib/ui/Face.svelte';
  import '$lib/decide/form.css';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { diffOf, install, planFor, type OfferClient, type Planned } from '../packs/browse/[id]/offer.ts';
  import { changeLine, ledBy, readFirst, type Improved } from './improved.ts';
  import { words } from './words.ts';

  let {
    updates,
    held,
    nameOf,
    hosted,
    ondone,
  }: {
    updates: readonly Improved[];
    /** The packs the record holds, as Add-ons reads them, which every plan is made against. */
    held: readonly PackState[];
    /** A declaration or a pack by the name this record gives it, for the plan sheet. */
    nameOf: (id: string) => string;
    /** Whether this record counts runs against a monthly allowance, for the sheet's estimate. */
    hosted: boolean;
    /** Once one has gone in, so the page reads the record again and the card counts what is left. */
    ondone: () => void;
  } = $props();

  let busy = $state(false);
  let fix = $state('');
  /* THIS BUILD COULD NOT DRAW A PLAN HERE, so the card says where it is shown whole. */
  let elsewhere = $state(false);
  /** The plans being read on the sheet, and what its Approve does. */
  let sheet = $state.raw<{ diff: unknown; then: () => Promise<unknown> } | null>(null);
  let client: OfferClient | null = null;

  /** The calls-out lines a plan asks to approve. */
  const asksOf = (p: Planned): string[] => (p.kind === 'pack' ? p.approve : p.plan.approve);

  const planOf = (c: OfferClient, u: Improved) => planFor(c, { kind: u.kind, id: u.id, source: 'bundled' }, u.file, held, copy.writeRaced);

  /**
   * Accept: every plan made now, then installed on this press when nothing in them asks to be read, and opened on the
   * sheet when something does.
   */
  async function accept() {
    if (busy || updates.length === 0) return;
    busy = true;
    fix = '';
    elsewhere = false;
    client ??= createClient({ base: apiBase() });
    const c = client;
    try {
      const plans: { u: Improved; p: Planned }[] = [];
      for (const u of updates) {
        const out = await planOf(c, u);
        if (!out.ok) return void (fix = out.fix);
        plans.push({ u, p: out.planned });
      }
      const diffs = plans.map(({ p }) => diffOf(p));
      const first = readFirst(diffs, plans.flatMap(({ p }) => asksOf(p)), nameOf);
      if (!first.read) return void (await installAll(c, plans));
      if (!first.sheet) return void (elsewhere = true);
      fix = words.improvedRead;
      sheet = { diff: diffs.length === 1 ? diffs[0] : diffs, then: () => installAll(c, plans) };
    } finally {
      busy = false;
    }
  }

  /**
   * EACH PLAN IN TURN, PLANNED AGAIN JUST BEFORE IT GOES IN, because the record's version is in every plan's hash and the
   * one before it moved it. A plan that now asks to approve a line nobody was shown stops there, as "Update all" does.
   */
  async function installAll(c: OfferClient, plans: readonly { u: Improved; p: Planned }[]) {
    const shown = new Set(plans.flatMap(({ p }) => asksOf(p)));
    let done = 0;
    for (const { u, p } of plans) {
      const fresh = done === 0 ? { ok: true as const, planned: p } : await planOf(c, u);
      if (!fresh.ok) {
        fix = fresh.fix;
        break;
      }
      if (asksOf(fresh.planned).some((line) => !shown.has(line))) {
        fix = words.improvedRead;
        break;
      }
      const out = await install(c, fresh.planned, held, pref.read().nav ?? [], copy.writeRaced);
      if (!out.ok) {
        fix = out.fix;
        break;
      }
      if (out.nav) pref.write({ nav: out.nav });
      done += 1;
    }
    sheet = null;
    if (done === plans.length) fix = '';
    if (done > 0) {
      toasts.push(words.improvedDone(done), { intent: 'good' });
      ondone();
    }
  }

  function approve() {
    const s = sheet;
    if (!s || busy) return;
    busy = true;
    void s.then().finally(() => (busy = false));
  }
</script>

<article class="queue-card improved" aria-labelledby="improved-title" aria-busy={busy}>
  <p class="queue-by"><Face name={words.by} kind="system" size="s" /><span class="queue-who">{words.by}</span></p>
  <h3 class="queue-question" id="improved-title">{words.improved(updates.length)}</h3>
  <p class="queue-why">{words.improvedKeeps}</p>
  <!-- WHAT CHANGES, one line a page: its name, then the newest thing it does, the name said once where the line opens
       with it (`ledBy`). -->
  <ul class="queue-does improved-lines">
    {#each updates as u (u.key)}
      {@const line = ledBy(u.title, changeLine(u))}
      <li class="queue-does-line">{#if line.name}<span class="improved-name">{line.name}</span>{' '}{/if}{line.said}</li>
    {/each}
  </ul>
  <!-- NOT DISABLED WHILE IT WORKS: a pressed button that turns disabled drops the focus it holds to the page, so a second
       press waits on `busy` instead, and the card says it is busy. -->
  <div class="dc-actions">
    <button type="button" class="dc-btn" data-weight="primary" onclick={accept}>{words.accept}</button>
  </div>
  {#if updates.some((u) => u.notes.length > 1)}
    <details class="queue-ways queue-reasons">
      <summary class="queue-ways-toggle">{words.seeEach}</summary>
      <ul class="queue-reasons-list">
        {#each updates as u (u.key)}
          {#each u.notes as note, i (i)}
            {@const line = ledBy(u.title, note)}
            <li class="queue-reason">{#if line.name}<span class="queue-reason-label">{line.name}</span>{' '}{/if}{line.said}</li>
          {/each}
        {/each}
      </ul>
    </details>
  {/if}
  {#if fix}<p class="improved-said" role="status">{fix}</p>{/if}
  {#if elsewhere}
    <p class="improved-said" role="status">{words.improvedOnAddons} <a class="improved-link" href={at('/packs?tab=updates')}>{words.openAddons}</a></p>
  {/if}
</article>

{#if sheet}
  {@const s = sheet}
  <PlanSheet diff={s.diff} {nameOf} {hosted} {busy} onapprove={approve} oncancel={() => (sheet = null)} />
{/if}

<style>
  /* THE PAGE'S NAME LEADS ITS LINE, in the line's own ink a step stronger, so the lines read as a list of pages. */
  .improved-name {
    color: var(--ink);
    font-weight: 500;
  }

  /* THE BODY SIZE, as every sentence on Decide is, and not the skin's small line under a question's answers. */
  .improved-lines {
    font-size: var(--fs-body);
    line-height: var(--lh-body);
  }

  .improved-said {
    margin: 0;
    max-inline-size: var(--measure);
    color: var(--ink2);
    font-size: var(--t-base);
    line-height: var(--lh-body);
  }

  .improved-link {
    color: var(--action-text);
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 3px;
  }
</style>
