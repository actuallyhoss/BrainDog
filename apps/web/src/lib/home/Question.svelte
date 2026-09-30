<!--
  One open question on Today, answered where it is shown, as a row on the ground: a 32px well with the
  Decide glyph, the question, who asked and how long it has waited, the recommendation in one line, and its options as
  pills with their number keys. A press sends the option alone and the record says whether it wants a reason
  (`answerQuestion`); when it does, one line opens under the options, focused, and Enter sends it with the option already
  chosen.

  THE SAME WRITE AND THE SAME WORDS AS A QUEUE CARD (`lib/page/QueueAnswer.svelte`, `queue-answer.ts`), drawn as a row
  rather than a card, because Today is a list and a card per question is three boxes stacked above the tasks.

  THE NUMBER KEYS ARE TODAY'S: with the keyboard's cursor on this row, 1 to 9 press the option (`choose`), so the cap on
  each pill is the key that does it.

  A READER WHO MAY NOT ANSWER READS THE OPTIONS AS WORDS, and the question still opens on Decide.
-->
<script module lang="ts">
  let made = 0;
</script>

<script lang="ts">
  import { tick } from 'svelte';
  import { page as route } from '$app/state';
  import { since } from 'braindog-render';
  import type { QueueQuestion } from '@braindog/kernel';
  import { apiBase, at } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import type { Shell } from '$lib/record/boot-live.ts';
  import { answerQuestion } from '$lib/record/decide-write.ts';
  import { may } from '$lib/record/may.ts';
  import { proposer, queueWords, saidOf, waysOf, type Way } from '$lib/page/queue-answer.ts';
  import IconWell from '$lib/ui/IconWell.svelte';
  import Kbd from '$lib/ui/Kbd.svelte';
  import { ageSaid } from './today-tiles.ts';

  let { question, now, onanswered }: { question: QueueQuestion; now: number; onanswered: () => void } = $props();

  const uid = `tq-${(made += 1)}`;

  /* THE PLAIN WORDS THIS ROW SAYS. */
  const words = {
    waiting: (said: string) => `waiting ${said}`,
    askedBy: (who: string) => `asked by ${who}`,
    recommended: (option: string) => `Recommended: ${/^\p{Lu}\p{Ll}/u.test(option) ? option.charAt(0).toLowerCase() + option.slice(1) : option}.`,
  } as const;

  const shell = $derived(route.data as unknown as Partial<Shell>);
  const me = $derived(shell.me ?? null);
  const names = $derived(new Map(Object.entries(shell.names ?? {})));
  const answerable = $derived(me !== null && (me.owner || may({ me }, 'decide')));
  const asker = $derived(proposer(question.who, me?.person ?? null, names));
  const ways = $derived(waysOf(question));
  const suggested = $derived(ways.find((w) => w.recommended) ?? null);
  /* WHERE IT IS FROM, as the list it is about when it names one: "Decide · Money · asked by Claude". */
  const list = $derived(question.list ? (shell.index?.registers.find((r) => r.id === question.list)?.name ?? null) : null);
  const meta = $derived([copy.decide, list, words.askedBy(asker.name)].filter(Boolean).join(' · '));
  const waited = $derived.by(() => {
    const t = Date.parse(question.at);
    return Number.isFinite(t) ? words.waiting(ageSaid(now - t)) : '';
  });

  let phase = $state<'open' | 'asking' | 'answered'>('open');
  let chosen = $state<Way | null>(null);
  let reason = $state('');
  let fix = $state('');
  let busy = $state(false);
  let field = $state<HTMLInputElement | null>(null);

  async function send(way: Way, said?: string) {
    if (busy) return;
    busy = true;
    fix = '';
    try {
      const out = await answerQuestion(apiBase(), question.id, way.key, said);
      if (out.from === 'written') {
        phase = 'answered';
        onanswered();
        return;
      }
      if (out.from === 'refused' && out.wants === 'reason' && phase !== 'asking') {
        phase = 'asking';
        await tick();
        field?.focus();
        return;
      }
      fix = out.from === 'conflict' ? queueWords.moved : out.fix;
    } finally {
      busy = false;
    }
  }

  function press(way: Way) {
    if (busy) return;
    chosen = way;
    if (phase === 'asking') return field?.focus();
    void send(way);
  }

  /** The option at `i` (from 0), as its number key presses it; a reader who may not answer presses nothing. */
  export function choose(i: number): boolean {
    const way = ways[i];
    if (!way || !answerable || phase === 'answered') return false;
    press(way);
    return true;
  }

  function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!chosen) return;
    if (reason.trim() === '') return field?.focus();
    void send(chosen, reason);
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    phase = 'open';
    fix = '';
  }
</script>

{#if phase === 'answered' && chosen}
  <div class="q q-settled">
    <span class="line-mark"><IconWell name="check" size="l" tone="earn" /></span>
    <p class="done" role="status">{queueWords.answered(chosen.label, since(new Date(now).toISOString(), now))}</p>
  </div>
{:else}
  <div class="q" aria-busy={busy}>
    <span class="line-mark"><IconWell name="decide" size="l" /></span>
    <div class="q-main">
      <div class="q-top">
        <a class="q-text tap" href={at(`/decide/${encodeURIComponent(question.id)}`)} dir="auto">{saidOf(question.question)}</a>
        {#if waited}<span class="q-age">{waited}</span>{/if}
      </div>
      <p class="q-by">{meta}</p>
      {#if suggested}
        <p class="q-rec"><span class="q-rec-lead">{words.recommended(suggested.label)}</span>{#if suggested.because}{' '}<span dir="auto">{suggested.because}</span>{/if}</p>
      {/if}
      <div class="q-opts" role="group" aria-label={saidOf(question.question)}>
        {#each ways as way, i (way.key)}
          {#if answerable}
            <button
              type="button"
              class="opt"
              title={way.because || undefined}
              data-rec={way.recommended ? '' : undefined}
              data-on={chosen?.key === way.key && phase === 'asking' ? '' : undefined}
              aria-pressed={phase === 'asking' ? chosen?.key === way.key : undefined}
              onclick={() => press(way)}
            >
              <span dir="auto">{way.label}</span>{#if i < 9}<span class="opt-key" aria-hidden="true"><Kbd keys={String(i + 1)} /></span>{/if}
            </button>
          {:else}
            <span class="opt-said">{way.label}</span>
          {/if}
        {/each}
      </div>
      {#if phase === 'asking' && chosen}
        <form class="why" onsubmit={submit}>
          <label class="why-label" for="{uid}-why">{queueWords.why}</label>
          <input
            id="{uid}-why"
            class="why-input"
            type="text"
            autocomplete="off"
            enterkeyhint="send"
            required
            bind:value={reason}
            bind:this={field}
            {onkeydown}
          />
          <button type="submit" class="opt">{queueWords.send}<span class="opt-key" aria-hidden="true"><Kbd keys="↵" /></span></button>
        </form>
      {/if}
      {#if fix}<p class="fix" role="status">{fix}</p>{/if}
    </div>
  </div>
{/if}

<style>
  /* THE ROW: the 32px well in the lead column, then the question and what goes with it, 12 in from the wash's edge. */
  .q {
    display: grid;
    grid-template-columns: var(--well-l) minmax(0, 1fr);
    gap: var(--sp-3);
    align-items: start;
    padding: var(--sp-3);
    border-radius: var(--r-md);
    transition: background var(--d-state) var(--ease-out);
  }

  .q-settled {
    align-items: center;
    min-block-size: var(--row-h);
    padding-block: var(--sp-2);
  }

  .line-mark {
    display: grid;
    place-items: center;
  }

  .q-main {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-inline-size: 0;
  }

  .q-top {
    display: flex;
    align-items: baseline;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  /* `t-row`, one line on a laptop; the whole question on a phone, where there is a line to spare. */
  .q-text {
    flex: 1;
    min-inline-size: 0;
    overflow: hidden;
    color: var(--ink);
    font-size: var(--t-row);
    font-weight: 500;
    line-height: 20px;
    text-decoration: none;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (hover: hover) and (pointer: fine) {
    .q-text:hover {
      text-decoration: underline;
      text-decoration-color: color-mix(in srgb, var(--ink) 40%, transparent);
      text-underline-offset: 3px;
    }
  }

  .q-age {
    flex: none;
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: 18px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .q-by {
    margin: 0;
    overflow: hidden;
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: 18px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* THE RECOMMENDATION, ONE LINE IN THE SECOND INK, its lead in `--live`: the one hue for a suggestion. */
  .q-rec {
    margin: 6px 0 0;
    overflow: hidden;
    color: var(--ink2);
    font-size: var(--t-base);
    line-height: 20px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .q-rec-lead {
    color: var(--live);
    font-weight: 500;
  }

  .q-opts,
  .why {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
    margin-block-start: 10px;
  }

  /* A QUIET PILL ON THE GROUND: the wash, ink words, and the option's number key at its end. The one the
     record suggests says so in its weight, not in a colour. */
  .opt {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    box-sizing: border-box;
    min-block-size: var(--ctl-h-sm);
    padding: 0 var(--sp-3);
    background: var(--hover-wash);
    border: 0;
    border-radius: var(--r-pill);
    color: var(--ink);
    font: inherit;
    font-size: var(--t-sm);
    font-weight: 500;
    line-height: 18px;
    text-align: start;
    cursor: pointer;
    transition: background var(--d-state) var(--ease-out);
  }

  .opt:has(.opt-key) {
    padding-inline-end: 5px;
  }

  .opt[data-rec] {
    font-weight: 600;
  }

  @media (hover: hover) and (pointer: fine) {
    .opt:hover:not(:disabled) {
      background: var(--hold-wash);
    }
  }

  .opt[data-on] {
    background: var(--ink);
    color: var(--on-ink);
  }

  .opt[data-on] :global(.kbd) {
    background: color-mix(in srgb, var(--on-ink) 18%, transparent);
    color: var(--on-ink);
  }

  .opt-key {
    display: inline-flex;
    flex: none;
  }

  .opt-said {
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  .why-label {
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  .why-input {
    flex: 1;
    min-inline-size: 12ch;
    min-block-size: var(--ctl-h-sm);
    padding: 0 var(--sp-3);
    background: var(--bg);
    border: 0;
    border-radius: var(--r-md);
    color: var(--ink);
    font: inherit;
    font-size: var(--t-base);
  }

  .fix {
    margin: var(--sp-2) 0 0;
    color: var(--ink);
    font-size: var(--t-sm);
  }

  .done {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-base);
  }

  /* ON A PHONE THE QUESTION IS SAID WHOLE and the options wrap, each a thumb's height, with no key caps: there is no
     keyboard to press them with. */
  @media (width < 640px) {
    .q-top {
      flex-direction: column;
      gap: 2px;
    }

    .q-text,
    .q-by,
    .q-rec {
      overflow: visible;
      white-space: normal;
    }
  }

  @media (pointer: coarse) {
    .opt,
    .why-input {
      min-block-size: var(--tap);
      font-size: var(--t-md);
    }

    .opt-key {
      display: none;
    }

    .opt:has(.opt-key) {
      padding-inline-end: var(--sp-3);
    }
  }

  @media (forced-colors: active) {
    .opt {
      border: 1px solid ButtonText;
    }
  }
</style>
