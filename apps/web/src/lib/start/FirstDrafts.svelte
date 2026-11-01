<!--
  "From what you wrote": the drafts the model read in a stranger's first words, at the top of their first Today
  (`first-drafts.ts` says what a draft is; `first-drafts.svelte.ts` holds them for the tab).

  EACH ONE KEPT WITH ONE PRESS, CHANGED IN PLACE, OR LET GO. Keep writes it through the record's capture, with the one
  Undo every write has; Change opens its words in a field, where Enter keeps it as typed and Escape puts it back; Not this
  lets it go. Keep all, where there are two or more. Nothing is written until a press, and the card says so.

  TELL'S OWN READING FIRST, THE MODEL'S AS IT COMES. The words are read on the device as if told to Today, at once, and
  what is concrete becomes drafts (`draftsFromTold`); the model's read joins them when it answers (`mergeDrafts`). While
  it reads, a line and a bar that fills, never a spinner: the read has twenty seconds at most. A host with no model is
  Tell's drafts alone, and with none of those either the card is never drawn (the build already stands).

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
  import type { TellOptions } from '$lib/tell/read.ts';
  import Button from '$lib/ui/Button.svelte';
  import Money from '$lib/ui/Money.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import type { FirstDraft } from './first-drafts.ts';
  import { closeDrafts, firstDrafts, restoreDrafts, settleDrafts } from './first-drafts.svelte.ts';

  let {
    options,
  }: {
    /** What Today reads a told line against (`tellOptions`): the same lists, people and day, for Tell's own reading of the words. */
    options: TellOptions;
  } = $props();

  /** The card's own words. */
  const say = {
    title: 'From what you wrote',
    sub: 'A few more things in your words. Nothing is added until you keep it.',
    reading: 'Reading what you wrote once more, for people, projects, to-dos and money.',
    readingMore: 'Still reading for anything else.',
    where: (list: string) => `In ${list}`,
    keep: 'Keep',
    keepAll: (n: number) => (n === 2 ? 'Keep both' : `Keep all ${n}`),
    change: 'Change',
    notThis: 'Not this',
    cancel: 'Cancel',
    changeLabel: (list: string) => `What to call it in ${list}`,
    /* THE ONE THING A DRAFT STILL NEEDS, asked in place (Tell's own words for it, "the day it is due"). */
    needs: (what: string) => `It needs ${what}`,
    kept: (title: string, list: string) => `Kept “${title}” in ${list}`,
    keptAll: (n: number) => `Kept ${n} things from what you wrote`,
    raced: 'That did not reach your BrainDog. It is back on the card.',
    /* A LIST BY THE PERSON'S OWN WORD: the line under the new name, and its field's label. */
    renameWhat: (was: string) => `What you call ${was}`,
    notLoaded: 'That could not be kept just now. Try it again.',
  } as const;

  const base = apiBase();
  const kept = $derived(firstDrafts.now !== null && firstDrafts.now.base === base ? firstDrafts.now : null);
  const reading = $derived(kept?.state === 'reading');

  /* TELL'S OWN READING OF THE WORDS, ON THIS DEVICE AND AT ONCE (`draftsFromTold`): the fallback that needs no model, and
     what the card opens with while the model reads. Its code and the reader come after the card, as Tell's own do. */
  let rules = $state.raw<FirstDraft[]>([]);
  let merge = $state.raw<((m: readonly FirstDraft[], r: readonly FirstDraft[]) => FirstDraft[]) | null>(null);
  let fill = $state.raw<((d: FirstDraft, value: string) => FirstDraft) | null>(null);
  $effect(() => {
    const said = kept?.begin.said ?? '';
    const built = kept?.begin.built ?? [];
    const me = kept?.begin.me ?? null;
    const opts = options;
    if (said === '') return;
    let gone = false;
    void Promise.all([import('$lib/tell/read.ts'), import('./first-drafts.ts')]).then(([{ tellRead }, d]) => {
      if (gone) return;
      merge = d.mergeDrafts;
      fill = d.filled;
      rules = d.draftsFromTold(
        d.clausesOf(said).map((c) => ({ said: c.said, told: tellRead(c.text, opts) })),
        opts.lists,
        { built, me },
      );
    });
    return () => (gone = true);
  });

  /** A draft's words as changed here, by key, laid over it until it is kept. */
  let edits = $state.raw<Record<string, FirstDraft>>({});
  const drafts = $derived.by(() => {
    if (kept === null) return [];
    const all = merge === null ? [...kept.drafts, ...rules] : merge(kept.drafts, rules);
    /* NOR ANYTHING THIS BRAINDOG ALREADY HOLDS BY THAT NAME: somebody added since, or kept from Tell a moment ago. */
    const held = (d: FirstDraft): boolean => {
      /* A LIST ALREADY CALLED WHAT THE DRAFT WOULD CALL IT has nothing left to keep. */
      if (d.rename) return (options.lists.find((l) => l.id === d.rename!.list)?.name ?? '').trim().toLowerCase() === d.rename.name.trim().toLowerCase();
      const register = d.rows[d.main]?.register ?? '';
      const t = d.title.trim().toLowerCase();
      const known = [...(options.titled?.[register] ?? []), ...(register === 'people' ? (options.people ?? []) : [])];
      return known.some((k) => k.name.trim().toLowerCase() === t);
    };
    /* A RENAME SAYS THE NAME THE LIST HAS NOW, as Today's lists say it, so Undo puts back what was there. */
    const now = (d: FirstDraft): FirstDraft => {
      const was = d.rename ? options.lists.find((l) => l.id === d.rename!.list)?.name : undefined;
      return d.rename && was ? { ...d, list: was, detail: say.renameWhat(was), rename: { ...d.rename, was } } : d;
    };
    return all.filter((d) => !kept.gone.includes(d.key) && !held(d)).map((d) => now(edits[d.key] ?? d));
  });

  /* NOTHING LEFT, NOTHING READING: the card says it is done, so Today stops loading it. Only once Tell's reading is in. */
  $effect(() => {
    if (kept !== null && !reading && merge !== null && drafts.length === 0) closeDrafts(base);
  });

  /** What was typed for a draft's one missing field, by key. */
  let needVals = $state<Record<string, string>>({});
  /** The drafts Keep all keeps: every one that needs nothing more. */
  const ready = $derived(drafts.filter((d) => d.needs === undefined));

  /** A draft with what it needed, kept; with nothing typed yet, its field takes the focus. */
  function keepNeeded(d: FirstDraft): void {
    const next = fill === null ? d : fill(d, needVals[d.key] ?? '');
    if (next.needs !== undefined) {
      list?.querySelector<HTMLInputElement>(`[data-draft="${CSS.escape(d.key)}"] .draft-needs input`)?.focus();
      return;
    }
    void keep([next]);
  }

  let busy = $state(false);
  let editing = $state<string | null>(null);
  let editText = $state('');
  let list = $state<HTMLElement | undefined>(undefined);

  /* AFTER A PRESS, THE NEXT DRAFT'S KEEP TAKES THE FOCUS, so a keyboard goes down the card without starting over. */
  function focusNext(): void {
    requestAnimationFrame(() => list?.querySelector<HTMLElement>('[data-draft] button')?.focus());
  }

  /**
   * A LIST RENAMED BY THE PERSON'S OWN WORD, through the record's `renameList`: off the card at once, back on it if the
   * record says no, and the toast's Undo is the same call with the name it had.
   */
  async function keepRename(d: FirstDraft): Promise<void> {
    const r = d.rename;
    if (!r) return;
    const { renameListNow } = await import('$lib/record/list-name.ts');
    settleDrafts(base, [d.key]);
    const out = await renameListNow(base, r.list, r.name);
    if (!out.ok) {
      restoreDrafts(base, [d.key]);
      toasts.push(out.fix, { intent: 'warn' });
      return;
    }
    void reread();
    void invalidateAll();
    const was = out.renamed.was;
    toasts.push(out.renamed.said, {
      undo: () =>
        void renameListNow(base, r.list, was).then((back) => {
          if (!back.ok) return void toasts.push(back.fix, { intent: 'warn' });
          restoreDrafts(base, [d.key]);
          void invalidateAll();
          void reread();
        }),
    });
  }

  async function keep(all: readonly FirstDraft[]): Promise<void> {
    if (busy || all.length === 0) return;
    busy = true;
    editing = null;
    for (const d of all) if (d.rename) await keepRename(d);
    const these = all.filter((d) => !d.rename);
    if (these.length === 0) {
      busy = false;
      focusNext();
      return;
    }
    const run = await import('$lib/data/optimistic.svelte.ts').then((m) => m.run).catch(() => null);
    if (run === null) {
      busy = false;
      toasts.push(say.notLoaded, { intent: 'warn' });
      return;
    }
    const client = createClient({ base });
    const keys = these.map((d) => d.key);
    /* EACH DRAFT'S ENTRIES IN ONE CAPTURE, each `$row` pointed again past the drafts before it. */
    const sent: { register: string; fields: Record<string, unknown> }[] = [];
    for (const d of these) {
      const from = sent.length;
      for (const r of d.rows)
        sent.push({
          register: r.register,
          fields: Object.fromEntries(
            Object.entries(r.fields).map(([k, v]) => [k, typeof v === 'object' && v !== null && '$row' in v && typeof (v as { $row: unknown }).$row === 'number' ? { $row: from + (v as { $row: number }).$row } : v]),
          ),
        });
    }
    await run({
      /* OFF THE CARD AT ONCE, back on it if the record says no. */
      apply: () => settleDrafts(base, keys),
      revert: () => restoreDrafts(base, keys),
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
      /* THE TOAST'S UNDO TAKES THEM BACK OUT OF THE RECORD AND PUTS THE DRAFTS BACK ON THE CARD: the record's undo reads
         the screen again through this, and only once it has put them back. */
      reread: () => {
        restoreDrafts(base, keys);
        void invalidateAll();
        return reread();
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
    const named = retitled(d, editText);
    if (named !== d) edits = { ...edits, [d.key]: named };
    /* STILL NEEDING ITS ONE FIELD: the new words are kept on the draft, and the field is asked for before it goes in. */
    if (named.needs !== undefined) {
      editing = null;
      keepNeeded(named);
      return;
    }
    await keep([named]);
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
  <Button size="sm" weight="primary" disabled={busy} onclick={() => void keep(ready)}>{say.keepAll(ready.length)}</Button>
{/snippet}

{#if reading || drafts.length > 0}
  <Tile icon="slash" title={say.title} class="first-drafts" data-forming="drafts" data-state={reading ? 'reading' : 'ready'} actions={ready.length > 1 ? keepAllAction : undefined}>
    {#if drafts.length === 0}
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
                    aria-label={d.rename ? `New name for ${d.list}` : say.changeLabel(d.list)}
                    bind:value={editText}
                    onkeydown={(e) => editKey(e, d)}
                  /></span
                >
              {:else}
                <p class="draft-title">{d.title}</p>
              {/if}
              <p class="draft-where">
                {#if d.rename}{d.detail}{:else if d.detail}{d.detail.charAt(0).toUpperCase() + d.detail.slice(1)}{:else}{say.where(d.list)}{#if d.day}, {dayShort(d.day)}{/if}{#if d.amount}<span
                      class="draft-amount num"><Money minor={d.amount.minor} currency={d.amount.currency} home={d.amount.currency} /></span
                    >{/if}{/if}
              </p>
              {#if d.needs}
                {@const n = d.needs}
                <label class="draft-needs">
                  <span class="draft-needs-say">{say.needs(n.label)}</span>
                  <span class="field"
                    ><input
                      class="field-input"
                      type={n.type === 'day' ? 'date' : n.type === 'number' ? 'number' : 'text'}
                      bind:value={needVals[d.key]}
                      onkeydown={(e) => {
                        if (e.key === 'Enter' && !e.isComposing) {
                          e.preventDefault();
                          keepNeeded(d);
                        }
                      }}
                    /></span
                  >
                </label>
              {/if}
            </div>
            <div class="draft-acts">
              {#if editing === d.key}
                <Button size="sm" weight="primary" disabled={busy} onclick={() => void keepChanged(d)}>{say.keep}</Button>
                <Button size="sm" weight="bare" onclick={() => (editing = null)}>{say.cancel}</Button>
              {:else}
                <Button
                  size="sm"
                  weight={drafts.length > 1 ? 'quiet' : 'primary'}
                  disabled={busy || (d.needs !== undefined && (needVals[d.key] ?? '').trim() === '')}
                  onclick={() => (d.needs === undefined ? void keep([d]) : keepNeeded(d))}>{say.keep}</Button
                >
                <Button size="sm" weight="quiet" onclick={() => change(d)}>{say.change}</Button>
                <Button size="sm" weight="bare" onclick={() => letGo(d)}>{say.notThis}</Button>
              {/if}
            </div>
          </li>
        {/each}
      </ul>
      <!-- THE MODEL STILL READING BESIDE TELL'S DRAFTS: one quiet line and the bar, and its drafts join the list. -->
      {#if reading}
        <p class="drafts-more" role="status">{say.readingMore}</p>
        <div class="bar" aria-hidden="true"><span class="bar-fill"></span></div>
      {/if}
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

  }

  @keyframes drafts-fill {
    from {
      transform: scaleX(0.06);
    }
    to {
      transform: scaleX(0.92);
    }
  }

  .drafts-more {
    margin: var(--sp-3) 0 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: 18px;
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

  .draft-needs {
    display: grid;
    gap: 4px;
    margin-block: 4px;
    max-inline-size: 16rem;
  }

  .draft-needs-say {
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: 18px;
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
