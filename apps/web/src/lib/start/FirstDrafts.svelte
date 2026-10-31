<!--
  "From what you wrote": the drafts the model read in a stranger's first words, at the top of their first Today
  (`first-drafts.ts` says what a draft is; `first-drafts.svelte.ts` holds them for the tab).

  EACH ONE KEPT WITH ONE PRESS, CHANGED IN PLACE, OR LET GO. Keep writes it through the record's capture, with the one
  Undo every write has; Change opens its words in a field, where Enter keeps it as typed and Escape puts it back; Not this
  lets it go. Keep all, where there are two or more. Nothing is written until a press, and the card says so.

  WHILE THE MODEL READS, a line and a bar that fills, never a spinner: the read has twenty seconds at most, and a read that
  finds nothing, or a host with no model, draws nothing at all (the rules' build already stands).

  STABLE WRAPPERS FOR THE MOTION LANE: the card is `data-forming="drafts"`, each draft `data-forming="draft"` keyed by
  `data-draft`, so a draft arriving and a draft kept can be animated after the merge. Here only plain fades, and none
  under reduced motion.
-->
<script lang="ts">
  import { createClient } from '@braindog/client';
  import { invalidateAll } from '$app/navigation';
  import { dayShort } from 'braindog-render';

  import { apiBase } from '$lib/at.ts';
  import { reread } from '$lib/data/live.svelte.ts';
  import Button from '$lib/ui/Button.svelte';
  import Money from '$lib/ui/Money.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import type { FirstDraft } from './first-drafts.ts';
  import { firstDrafts, replaceDraft, restoreDrafts, settleDrafts } from './first-drafts.svelte.ts';

  /** The card's own words. */
  const say = {
    title: 'From what you wrote',
    sub: 'A few more things in your words. Nothing is added until you keep it.',
    reading: 'Reading what you wrote once more, for people, projects, to-dos and money.',
    where: (list: string) => `In ${list}`,
    keep: 'Keep',
    keepAll: (n: number) => (n === 2 ? 'Keep both' : `Keep all ${n}`),
    change: 'Change',
    notThis: 'Not this',
    cancel: 'Cancel',
    changeLabel: (list: string) => `What to call it in ${list}`,
    kept: (title: string, list: string) => `Kept “${title}” in ${list}`,
    keptAll: (n: number) => `Kept ${n} things from what you wrote`,
    raced: 'That did not reach your BrainDog. It is back on the card.',
    notLoaded: 'That could not be kept just now. Try it again.',
  } as const;

  const base = apiBase();
  const kept = $derived(firstDrafts.now !== null && firstDrafts.now.base === base ? firstDrafts.now : null);
  const drafts = $derived(kept?.state === 'ready' ? kept.drafts : []);
  const reading = $derived(kept?.state === 'reading');

  let busy = $state(false);
  let editing = $state<string | null>(null);
  let editText = $state('');
  let list = $state<HTMLElement | undefined>(undefined);

  /* AFTER A PRESS, THE NEXT DRAFT'S KEEP TAKES THE FOCUS, so a keyboard goes down the card without starting over. */
  function focusNext(): void {
    requestAnimationFrame(() => list?.querySelector<HTMLElement>('[data-draft] button')?.focus());
  }

  async function keep(these: readonly FirstDraft[]): Promise<void> {
    if (busy || these.length === 0) return;
    busy = true;
    editing = null;
    const run = await import('$lib/data/optimistic.svelte.ts').then((m) => m.run).catch(() => null);
    if (run === null) {
      busy = false;
      toasts.push(say.notLoaded, { intent: 'warn' });
      return;
    }
    const client = createClient({ base });
    const sent = these.map((d) => ({ register: d.register, fields: d.fields }));
    await run({
      /* OFF THE CARD AT ONCE, back on it if the record says no. */
      apply: () => settleDrafts(base, these.map((d) => d.key)),
      revert: () => restoreDrafts(base, these),
      send: async () => {
        const answer = await client.capture({ rows: sent });
        if (answer.ok) return { ok: true as const, value: answer.value };
        return { ok: false as const, fix: 'refusal' in answer ? answer.refusal.fix : say.raced };
      },
      said: () => (these.length === 1 ? say.kept(these[0]!.title, these[0]!.list) : say.keptAll(these.length)),
      settle: () => {
        void reread();
        void invalidateAll();
      },
    });
    busy = false;
    focusNext();
  }

  function letGo(d: FirstDraft): void {
    if (editing === d.key) editing = null;
    settleDrafts(base, [d.key]);
    focusNext();
  }

  function change(d: FirstDraft): void {
    editing = d.key;
    editText = d.title;
    requestAnimationFrame(() => {
      const f = list?.querySelector<HTMLInputElement>(`[data-draft="${CSS.escape(d.key)}"] input`);
      f?.focus();
      f?.select();
    });
  }

  /** The words as changed, kept as the draft's own, then kept in the record. */
  async function keepChanged(d: FirstDraft): Promise<void> {
    const { retitled } = await import('./first-drafts.ts');
    const next = retitled(d, editText);
    if (next !== d) replaceDraft(base, next);
    await keep([next]);
  }

  function editKey(e: KeyboardEvent, d: FirstDraft): void {
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      void keepChanged(d);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      editing = null;
      focusNext();
    }
  }
</script>

{#snippet keepAllAction()}
  <Button size="sm" weight="primary" disabled={busy} onclick={() => void keep(drafts)}>{say.keepAll(drafts.length)}</Button>
{/snippet}

{#if reading || drafts.length > 0}
  <Tile icon="slash" title={say.title} class="first-drafts" data-forming="drafts" data-state={reading ? 'reading' : 'ready'} actions={drafts.length > 1 ? keepAllAction : undefined}>
    {#if reading}
      <p class="drafts-line" role="status">{say.reading}</p>
      <div class="bar" aria-hidden="true"><span class="bar-fill"></span></div>
    {:else}
      <p class="drafts-line">{kept?.summary ?? say.sub}</p>
      <ul class="drafts" bind:this={list}>
        {#each drafts as d (d.key)}
          <li class="draft" data-forming="draft" data-draft={d.key}>
            <div class="draft-said">
              {#if editing === d.key}
                <span class="field"
                  ><input
                    class="field-input"
                    type="text"
                    maxlength="200"
                    aria-label={say.changeLabel(d.list)}
                    bind:value={editText}
                    onkeydown={(e) => editKey(e, d)}
                  /></span
                >
              {:else}
                <p class="draft-title">{d.title}</p>
              {/if}
              <p class="draft-where">
                {say.where(d.list)}{#if d.day}, {dayShort(d.day)}{/if}{#if d.amount}<span class="draft-amount num"
                    ><Money minor={d.amount.minor} currency={d.amount.currency} home={d.amount.currency} /></span
                  >{/if}
              </p>
            </div>
            <div class="draft-acts">
              {#if editing === d.key}
                <Button size="sm" weight="primary" disabled={busy} onclick={() => void keepChanged(d)}>{say.keep}</Button>
                <Button size="sm" weight="bare" onclick={() => (editing = null)}>{say.cancel}</Button>
              {:else}
                <Button size="sm" weight={drafts.length > 1 ? 'quiet' : 'primary'} disabled={busy} onclick={() => void keep([d])}>{say.keep}</Button>
                <Button size="sm" weight="quiet" onclick={() => change(d)}>{say.change}</Button>
                <Button size="sm" weight="bare" onclick={() => letGo(d)}>{say.notThis}</Button>
              {/if}
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </Tile>
{/if}

<style>
  .drafts-line {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: 22px;
    text-wrap: pretty;
  }

  /* THE READ'S BAR: it fills toward the end over the read's usual time and stops short of it, so it is progress and
     never a promise. Still, and half full, under reduced motion. */
  .bar {
    block-size: 4px;
    margin-block-start: var(--sp-3);
    overflow: hidden;
    background: var(--tile-2);
    border-radius: 2px;
  }

  .bar-fill {
    display: block;
    block-size: 100%;
    background: var(--ink-3);
    transform: scaleX(0.5);
    transform-origin: left center;
  }

  @media (prefers-reduced-motion: no-preference) {
    .bar-fill {
      animation: drafts-fill 9s cubic-bezier(0.15, 0.6, 0.3, 1) both;
    }

    .draft {
      animation: drafts-in var(--d-page) var(--ease-out) both;
    }
  }

  @keyframes drafts-fill {
    from {
      transform: scaleX(0.06);
    }
    to {
      transform: scaleX(0.92);
    }
  }

  @keyframes drafts-in {
    from {
      opacity: 0;
    }
  }

  .drafts {
    display: grid;
    margin: var(--sp-3) 0 0;
    padding: 0;
    list-style: none;
  }

  .draft {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-2) var(--sp-4);
    padding-block: var(--sp-3);
    border-block-start: 1px solid var(--rule);
    min-inline-size: 0;
  }

  .draft:first-child {
    border-block-start: 0;
    padding-block-start: 0;
  }

  .draft-said {
    display: grid;
    gap: 2px;
    flex: 1 1 14rem;
    min-inline-size: 0;
  }

  .draft-said .field {
    inline-size: 100%;
  }

  .draft-title {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 500;
    line-height: 22px;
    overflow-wrap: anywhere;
  }

  .draft-where {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: 18px;
  }

  .draft-amount {
    margin-inline-start: var(--sp-2);
    color: var(--ink-2);
  }

  .draft-acts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }
</style>
