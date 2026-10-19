<!--
  "Say it as a sentence": one input on the Automations tab. The person writes "When ..., ...", the record reads it
  (`automationSentence`: the rule parser first, the model only if the parser cannot), and it is shown back as the sentence
  BrainDog understood, with what it would have done over the last 30 days of real rows. Nothing runs until Keep it.

  EVERY PART OF THE READ-BACK CAN BE PRESSED (`SentenceRead`) and the steps of one that does several things can be put in
  another order (`SentenceSteps`). Either returns a new sentence, which is read again by the record, so the 30-day look
  always belongs to the sentence on the screen.

  KEEP IT IS THE CANVAS'S SAVE: the same change, filed for anybody and accepted in the same press for an owner. A kept
  automation is listed by its sentence, which is its name.
-->
<script lang="ts">
  import type { Source, Sentenced } from '$lib/flow/source.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import Button from '$lib/ui/Button.svelte';
  import SentenceRead from './SentenceRead.svelte';
  import SentenceSteps from './SentenceSteps.svelte';
  import { askable, composeSentence, keepOf, sentenceWords as w, underSentence } from './sentence.ts';

  let {
    source,
    owner = false,
    onkept,
  }: {
    source: Source | null;
    owner?: boolean;
    /** Called once it is kept, so the list reads again and shows it. */
    onkept: () => void;
  } = $props();

  let text = $state('');
  let busy = $state<'' | 'reading' | 'keeping'>('');
  let read = $state<Sentenced | null>(null);
  let fix = $state('');

  async function ask(e?: Event) {
    e?.preventDefault();
    if (!source || busy !== '' || !askable(text)) return;
    busy = 'reading';
    fix = '';
    read = null;
    const out = await source.sentence(text);
    busy = '';
    if (out.ok) read = out.value;
    else fix = out.refusal.fix;
  }

  /* A PART PRESSED OR A STEP MOVED: the sentence it makes is read again, and the old reading stays up until the new one
     comes, so the page does not blank under the pointer. A refusal leaves the old reading and says why. */
  async function reread(next: string) {
    if (!source || busy !== '') return;
    busy = 'reading';
    fix = '';
    const out = await source.sentence(next, read?.rule);
    busy = '';
    if (out.ok) {
      read = out.value;
      text = next;
    } else fix = out.refusal.fix;
  }

  const restep = (steps: string[]) => {
    if (read?.parts) void reread(composeSentence(read.parts.trigger.map((p) => p.text), steps));
  };

  async function keep() {
    if (!source || !read || busy !== '') return;
    busy = 'keeping';
    const filed = await source.propose(keepOf(read));
    if (!filed.ok) {
      busy = '';
      fix = filed.refusal.fix;
      return;
    }
    /* AN OWNER'S PRESS LANDS IT; anybody else's waits on Needs you, as on the canvas. */
    const landed = owner && filed.value.id !== null ? await source.accept(filed.value.id) : null;
    busy = '';
    if (landed !== null && !landed.ok) {
      fix = landed.refusal.fix;
      return void toasts.push(w.filed, { intent: 'warn' });
    }
    toasts.push(landed === null ? w.filed : w.kept);
    read = null;
    text = '';
    onkept();
  }

  function change() {
    read = null;
    fix = '';
  }
</script>

<section class="sentence" aria-label={w.label}>
  <form onsubmit={ask}>
    <label class="field-label" for="sentence-box">{w.label}</label>
    <div class="row">
      <div class="field field-lg">
        <input id="sentence-box" class="field-input" type="text" bind:value={text} placeholder={w.placeholder} autocomplete="off" disabled={busy !== ''} />
      </div>
      <Button weight={read ? 'quiet' : 'primary'} type="submit" disabled={busy !== '' || !askable(text)}>{busy === 'reading' ? w.reading : w.read}</Button>
    </div>
  </form>

  {#if fix !== ''}
    <p class="fix" role="alert">{fix}</p>
    <p class="hint">{w.hint}</p>
  {/if}

  {#if read}
    <div class="read">
      <p class="lead">{w.asRead}</p>
      {#if read.parts}
        <SentenceRead parts={read.parts} disabled={busy !== ''} onchange={(next) => void reread(next)} />
        <SentenceSteps steps={read.parts.actions} options={read.parts.options} disabled={busy !== ''} onchange={restep} />
      {:else}
        <p class="said">{read.said}</p>
      {/if}
      {#each underSentence(read) as line, i (i)}
        <p class="under">{line}</p>
      {/each}
      <div class="actions">
        <Button weight="primary" onclick={keep} disabled={busy !== ''}>{busy === 'keeping' ? w.keeping : w.keep}</Button>
        <Button onclick={change} disabled={busy !== ''}>{w.again}</Button>
      </div>
    </div>
  {/if}
</section>

<style>
  .sentence {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    padding: var(--inset);
    background: var(--tile);
    border-radius: var(--r-tile);
  }

  .row {
    display: flex;
    gap: var(--sp-2);
    align-items: center;
  }

  .row :global(.field) {
    flex: 1;
    min-inline-size: 0;
  }

  .lead,
  .under,
  .hint,
  .fix {
    margin: 0;
    font-size: var(--t-sm);
    line-height: 18px;
    color: var(--ink2);
  }

  .fix {
    color: var(--ink);
  }

  .said {
    margin: 0;
    font-size: var(--t-base);
    font-weight: 600;
    line-height: 22px;
    color: var(--ink);
  }

  .read {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .actions {
    display: flex;
    gap: var(--sp-2);
    margin-block-start: var(--sp-2);
  }
</style>
