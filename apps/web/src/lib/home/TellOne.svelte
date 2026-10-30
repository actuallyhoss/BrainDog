<!--
  "Tell it one real thing": a first Today's first act (use case 6, step 5; planner-45, the onboarding target). One
  field; what she types is read on the device (`tellRead`, `lib/tell/read.ts`) into the entries it would become, drawn
  under "That becomes"; one press adds them all under one batch (the record's `capture`), and the receipt's one Undo
  takes them all back (`undoChange`, through `data/optimistic.svelte.ts` `run`, the Undo every write on every screen has).

  NOTHING IS ADDED UNTIL THE PRESS, and the card says so beside the button. An entry the record would refuse (a required
  field the sentence did not give) says what it needs, in words, and stays behind: the press adds the entries that are
  ready (`readyRows`), all or none of those, as the record writes them. The receipt names what went by what each is
  ("Added an order, a client and a payment", `addedSaid`) and what stayed behind with what it needs (`heldSaid`), so
  nothing held is dropped quietly when the card goes.

  ITS WORDS ARE ITS OWN, in `say` below and not in `copy.ts`, as `first-run.ts` keeps the first run's. `first-today.ts`
  says when Today draws it (`showTell`), and home-first-46 mounts it.
-->
<script lang="ts">
  import { createClient } from '@braindog/client';

  import { apiBase } from '$lib/at.ts';
  import { run } from '$lib/data/optimistic.svelte.ts';
  import { reread } from '$lib/data/live.svelte.ts';
  import { tellRead, type TellOptions, type TellRow } from '$lib/tell/read.ts';
  import Button from '$lib/ui/Button.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import { isGlyph } from '$lib/ui/icons.ts';
  import { addedSaid, countWord, heldSaid, readyRows } from './first-today.ts';

  let {
    options,
    onadded,
  }: {
    /** What the sentence is read against: the lists this record holds, the day, its currency, its people (`tellLists`). */
    options: TellOptions;
    /** After the entries are added, so the page can draw them and let this card go. */
    onadded?: (() => void) | undefined;
  } = $props();

  /** The card's own words. */
  const say = {
    title: 'Tell it one real thing',
    field: 'Say it, or paste a message',
    becomes: 'That becomes',
    needs: (what: readonly string[]) => `Needs ${what.join(' and ')}`,
    left: (words: readonly string[]) => `Not placed: ${words.join(', ')}`,
    addOne: 'Add it',
    /* "BOTH" FOR TWO: "Add all two" read as a machine counting (first hour audit, E19). */
    addAll: (n: number) => (n === 2 ? 'Add both' : `Add all ${countWord(n)}`),
    /* Some wait for what they need: the button names only what goes, never "all" over lines that stay. */
    addReady: (n: number) => (n === 1 ? 'Add the one that is ready' : `Add the ${countWord(n)} that are ready`),
    notYet: 'Nothing is added until you press.',
    undoOne: 'One Undo takes it back.',
    undoAll: (n: number) => (n === 2 ? 'One Undo takes both back.' : `One Undo takes all ${countWord(n)} back.`),
    undoAny: 'One Undo takes all of it back.',
    raced: 'Something changed on your BrainDog while this was sent. Press Add again.',
  };

  let typed = $state('');
  let sending = $state(false);

  const told = $derived(typed.trim() === '' ? null : tellRead(typed, options));
  const rows = $derived(told?.rows ?? []);
  /* WHAT CAN BE ADDED NOW: an entry that still needs something stays in the preview, saying what, and the rest go. */
  const ready = $derived(readyRows(rows));

  const iconOf = (r: TellRow) => (isGlyph(r.icon) ? r.icon : 'rows');

  async function add(e: SubmitEvent) {
    e.preventDefault();
    if (sending || ready.length === 0) return;
    sending = true;
    const sent = ready;
    const shown = rows;
    const client = createClient({ base: apiBase() });
    /* THE UNDO IS THE RECORD'S, by the batch the capture answers: `run` offers `undoChange(base, batch)` on the receipt. */
    await run({
      apply: () => {},
      revert: () => {},
      send: async () => {
        const answer = await client.capture({ rows: sent });
        if (answer.ok) return { ok: true as const, value: answer.value };
        return { ok: false as const, fix: 'refusal' in answer ? answer.refusal.fix : say.raced };
      },
      /* EACH ENTRY BY WHAT IT IS, read from the fields it was sent with: the capture answers in the order it was sent. */
      said: (value) =>
        [addedSaid(value.made.map((m, i) => ({ register: m.register, fields: sent[i]?.fields })), options.lists), heldSaid(shown)]
          .filter((line) => line !== '')
          .join('. '),
      settle: () => {
        typed = '';
        void reread();
        onadded?.();
      },
    });
    sending = false;
  }
</script>

<Tile icon="slash" title={say.title} lead class="tell-one" data-tell-one>
  <form class="tell-one-form" onsubmit={add}>
    <textarea class="tell-one-field" name="tell" rows="2" autocomplete="off" placeholder={say.field} aria-label={say.field} bind:value={typed}></textarea>
    {#if rows.length > 0}
      <div class="tell-one-becomes" aria-live="polite">
        <p class="tell-one-quiet">{say.becomes}</p>
        <ul class="tell-one-lines">
          {#each rows as row, i (i)}
            <li class="tell-one-line">
              <IconWell name={iconOf(row)} />
              <span class="tell-one-words">
                <span class="tell-one-said">{row.said}</span>
                {#if row.detail}<span class="tell-one-detail">{row.detail}</span>{/if}
                {#if row.missing.length > 0}<span class="tell-one-needs">{say.needs(row.missing)}</span>{/if}
              </span>
            </li>
          {/each}
        </ul>
        {#if told && told.left.length > 0}<p class="tell-one-quiet">{say.left(told.left)}</p>{/if}
        <Button weight="primary" type="submit" disabled={sending || ready.length === 0}>{ready.length < rows.length && ready.length > 0 ? say.addReady(ready.length) : ready.length <= 1 ? say.addOne : say.addAll(ready.length)}</Button>
      </div>
    {/if}
  </form>
  <p class="tell-one-quiet">{say.notYet} {ready.length > 1 ? say.undoAll(ready.length) : ready.length === 1 ? say.undoOne : say.undoAny}</p>
</Tile>

<style>
  .tell-one-form {
    display: grid;
    gap: var(--sp-4);
    margin: 0;
  }

  /* THE FIELD IS THE CARD'S ONE CONTROL: full width, two lines for a pasted message, 15 or more. */
  .tell-one-field {
    inline-size: 100%;
    min-block-size: 64px;
    padding: var(--sp-3);
    resize: vertical;
    font: inherit;
    font-size: var(--fs-body);
    color: var(--ink);
    background: var(--tile-2);
    border: 0;
    border-radius: var(--r-ctl);
  }

  .tell-one-becomes {
    display: grid;
    gap: var(--sp-3);
    justify-items: start;
  }

  .tell-one-lines {
    display: grid;
    gap: var(--sp-3);
    inline-size: 100%;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .tell-one-line {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: var(--sp-3);
    align-items: center;
  }

  .tell-one-words {
    display: grid;
    gap: 2px;
    min-inline-size: 0;
  }

  .tell-one-said {
    font-size: var(--fs-body);
    font-weight: 500;
  }

  .tell-one-detail,
  .tell-one-quiet {
    margin: 0;
    font-size: var(--fs-body);
    color: var(--ink-2);
  }

  /* WHAT AN ENTRY NEEDS IS SAID IN WORDS, and only tinted: never colour alone. */
  .tell-one-needs {
    font-size: var(--fs-body);
    color: var(--red);
  }
</style>
