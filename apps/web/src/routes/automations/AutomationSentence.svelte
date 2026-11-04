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
  import { page } from '$app/state';
  import type { Source, Sentenced } from '$lib/flow/source.ts';
  import type { Shell } from '$lib/record/boot-live.ts';
  import { REGISTERS } from '$lib/record/held.ts';
  import Icon from '$lib/ui/Icon.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import Button from '$lib/ui/Button.svelte';
  import SentenceRead from './SentenceRead.svelte';
  import SentenceSteps from './SentenceSteps.svelte';
  import { askable, composeSentence, exampleOf, keepOf, sentenceWords as w, underSentence } from './sentence.ts';

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

  /* THE EXAMPLE IS THIS RECORD'S, from its lists by the names it gives them and the fields the record has said of each. */
  const example = $derived(
    exampleOf(
      ((page.data as unknown as Partial<Shell>).index?.registers ?? []).map((r) => ({
        name: r.name,
        fields: Object.hasOwn(REGISTERS, r.id) ? REGISTERS[r.id]?.fields : undefined,
      })),
    ),
  );

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
    <div class="say-row">
      <div class="field field-lg">
        <input id="sentence-box" class="field-input" type="text" bind:value={text} placeholder={example} autocomplete="off" disabled={busy !== ''} aria-invalid={fix !== '' ? 'true' : undefined} aria-describedby={fix !== '' ? 'sentence-fix' : undefined} />
      </div>
      <Button weight={read ? 'quiet' : 'primary'} type="submit" disabled={busy !== '' || !askable(text)}>{busy === 'reading' ? w.reading : w.read}</Button>
    </div>
  </form>

  {#if fix !== ''}
    <!-- A REFUSAL READS AS ONE: the warn glyph and the line in red, and the field ringed, so it is never taken for a hint. -->
    <p class="fix" id="sentence-fix" role="alert"><Icon name="alert" size="s" />{fix}</p>
    <p class="hint">{w.hint(example)}</p>
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
    /* THE TILES' OWN PADDING (P34), so its label starts where "On 31" does under it. */
    padding: var(--tile-pad);
    background: var(--tile);
    border-radius: var(--r-tile);
  }

  /* NOT `.row`: the shared rows sheet pads every `.row` 12px at the start, which set the field in from its label. */
  .say-row {
    display: flex;
    gap: var(--sp-2);
    align-items: center;
  }

  .say-row :global(.field) {
    flex: 1;
    min-inline-size: 0;
  }

  /* ON A PHONE THE SENTENCE HAS THE WHOLE WIDTH, so its example is read to its end, and Read it is under it. */
  @media (width < 640px) {
    .say-row {
      flex-wrap: wrap;
    }

    .say-row :global(.field) {
      flex-basis: 100%;
    }

    .say-row > :global(.btn) {
      flex: 1 1 100%;
    }
  }

  .lead,
  .under,
  .hint,
  .fix {
    margin: 0;
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
    color: var(--ink-2);
  }

  .fix {
    display: flex;
    gap: var(--sp-2);
    align-items: flex-start;
    color: var(--red);
  }

  .fix :global(.icon) {
    flex: none;
    margin-block-start: 1px;
  }

  .say-row :global(.field:has(input[aria-invalid='true'])) {
    box-shadow: inset 0 0 0 1px var(--red);
  }

  .said {
    margin: 0;
    font-size: var(--fs-body);
    font-weight: 600;
    line-height: calc(22px * var(--type, 1));
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
