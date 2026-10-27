<!--
  Who decides this question, in one line, and for an owner a way to name somebody.

  LOADED ONLY BY THE QUESTION'S PAGE, through `import()`, so nothing here reaches what every screen loads. Its words and
  its write are `decider.ts`, where a test reads them.

  THE RECORD HOLDS THE RULE. "Ada decides this" is said before anybody presses; a press by somebody else who may decide
  is still answered by the record, in its own sentence ("This one is Ada's to decide."). Naming somebody who cannot decide
  is refused the same way, and that sentence is drawn under the picker word for word.

  NOBODY NAMED, AND NOT AN OWNER: nothing is drawn, so the question reads as it always did.
-->
<script lang="ts">
  import { page } from '$app/state';
  import { createClient } from '@braindog/client';
  import { apiBase } from '$lib/at.ts';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import type { Shell } from '$lib/record/boot-live.ts';
  import { deciderLine, hand, namer, whoCanDecide, WORDS, type Decided, type Person } from './decider.ts';

  let {
    question,
    owner,
    members,
    me,
    open = $bindable(false),
  }: {
    question: Decided;
    /** Whether the reader owns the record; read from the shell when left out. */
    owner?: boolean | undefined;
    /** The members the page already read; an owner's are read here when the page has none. */
    members?: readonly Person[] | undefined;
    /** The reader's person id; read from the shell when left out. */
    me?: string | undefined;
    /** Whether the owner opened the picker, from the "⋯" at the right of the page's title. */
    open?: boolean;
  } = $props();

  const shell = $derived(page.data as unknown as Partial<Shell>);
  const reader = $derived(me ?? shell.me?.person ?? null);
  const owns = $derived(owner ?? shell.me?.owner === true);

  /* AN OWNER MAY READ THE MEMBERS, so a page that handed none has them read here, once. */
  let read = $state.raw<readonly Person[]>([]);
  $effect(() => {
    if (members || !owns) return;
    void createClient({ base: apiBase() })
      .members()
      .then((out) => {
        if (out.ok && Array.isArray(out.value)) read = out.value as Person[];
      });
  });
  const people = $derived(members ?? read);

  /* WHO DECIDES NOW: the record's answer, then this screen's own hand once the record has taken it. */
  let handed = $state<{ id: string; decider: string | null } | null>(null);
  const decider = $derived(handed && handed.id === question.id ? handed.decider : (question.decider ?? null));
  const nameOf = $derived(namer(people, shell.names ?? {}));
  const line = $derived(deciderLine({ id: question.id, decider }, reader, nameOf));
  const choices = $derived(whoCanDecide(people, reader));

  const field = $derived(`decider-${question.id}`);
  let picked = $state('');
  $effect(() => {
    picked = decider ?? '';
  });
  /* OPENED FROM THE "⋯" BY THE TITLE, THE PICKER IS BROUGHT INTO VIEW: on a phone the side is under the answers, a
     screen or more below the press that opened it. */
  let part = $state<HTMLElement>();
  $effect(() => {
    if (open && part) part.scrollIntoView({ block: 'nearest' });
  });
  let sending = $state(false);
  let refused = $state('');

  async function save() {
    if (sending || picked === (decider ?? '')) return;
    sending = true;
    refused = '';
    const to = picked === '' ? null : picked;
    const out = await hand(apiBase(), question.id, to);
    sending = false;
    if (out.from === 'refused') {
      refused = out.fix;
      return;
    }
    handed = { id: question.id, decider: out.decider };
    toasts.push(out.decider === null ? WORDS.takenBack : WORDS.handed(nameOf(out.decider) ?? WORDS.somebody), { intent: 'good' });
  }
</script>

{#if line || (owns && (open || refused !== ''))}
  <!-- FOLDED BEHIND "⋯" (the 20 October walk): "Anybody who may decide can answer this. Who decides: Nobody [Save]"
       opened every question and pushed the question down. The line stays when somebody is named, since that is news;
       the picker opens from the "⋯" at the right of the page's title, which the page draws, and it opens by itself only
       when the record refused a name.

       IN THE SIDE TILE, BESIDE WHAT THE QUESTION IS ABOUT, and no tile of its own: it is context for the answers, and a
       line and a tile over the question pushed the answers down while the side column stood empty. -->
  <section class="decider" bind:this={part} aria-labelledby="{field}-h">
    <h2 class="decider-h" id="{field}-h">{WORDS.pick}</h2>
    <p class="decider-line">{line ?? WORDS.nobodyLine}</p>
  {#if owns && (open || refused !== '')}
      <div class="decider-pick" id="{field}-pick">
        <label class="decider-label" for={field}>{WORDS.pick}</label>
        <div class="decider-row">
          <select id={field} class="decider-select" bind:value={picked} disabled={sending} aria-invalid={refused !== '' ? 'true' : undefined}>
            <option value="">{WORDS.nobody}</option>
            {#each choices as c (c.id)}
              <option value={c.id}>{c.you ? WORDS.you(c.name) : c.name}</option>
            {/each}
          </select>
          <Button weight="primary" disabled={sending || picked === (decider ?? '')} onclick={save}>{WORDS.save}</Button>
        </div>
        {#if refused}<p class="decider-said" role="alert"><Icon name="alert" size="s" />{refused}</p>{/if}
      </div>
  {/if}
  </section>
{/if}

<style>
  .decider {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  /* THE SIDE'S SMALL HEADING, as why it is asked and what it is about wear theirs. */
  .decider-h {
    margin: 0;
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--fs-body);
    font-weight: var(--fw-semi);
    line-height: var(--lh-head);
  }

  .decider-line {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
  }

  .decider-pick {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  .decider-label {
    color: var(--ink-2);
    font-size: var(--fs-body);
  }

  .decider-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
  }

  .decider-select {
    min-height: 44px;
    min-inline-size: 12rem;
    max-inline-size: 100%;
    padding: 0 var(--sp-3);
    background: var(--tile-2);
    border: 0;
    border-radius: 8px;
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-body);
  }

  /* REFUSED: the deeper red, with its mark and the record's own words. */
  .decider-said {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
    margin: 0;
    color: var(--red);
    font-size: var(--fs-body);
    overflow-wrap: anywhere;
  }
</style>
