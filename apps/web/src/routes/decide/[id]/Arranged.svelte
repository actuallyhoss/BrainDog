<!--
  A proposal that arranges this BrainDog (`arranged.ts`), drawn as one story and one sitting: why, what it needs from
  you (each key, with a field to put it in), what it changes and adds, what it starts, your choices, then any other
  call out, the packs, what will appear, the words that change, and any other setting.

  THE CALLS OUT AND THE FEEDS ARE NEVER FOLDED. They are the parts of an arrangement that reach outside the record and
  cost egress, and accepting approves them, so the queue draws them as whole as the gate does, with a glyph in the
  warning ink and the host in ink. Everything else folds to one counted line on the queue (`compact`).

  A KEY'S FIELD IS DRAWN ONLY WITH A `client`, which the question's own page hands down by context (`KEYS_CONTEXT`) for
  a reader who may answer.
-->
<script lang="ts">
  import { copy } from '$lib/copy.ts';
  import { fieldChange } from '$lib/decide/card.ts';
  import Icon from '$lib/ui/Icon.svelte';
  import Proposed from './Proposed.svelte';
  import KeyNeeded from './KeyNeeded.svelte';
  import { getContext } from 'svelte';
  import { KEYS_CONTEXT, TICKS_CONTEXT, appearsSaid, ticksOf, type Arranged, type KeysContext, type TicksContext } from './arranged.ts';

  let { arranged, compact = false }: { arranged: Arranged; compact?: boolean } = $props();

  /* THE QUESTION'S OWN PAGE HANDS A CLIENT DOWN (`+page.svelte`); the queue does not, and there a key is only said. */
  const keys = getContext<KeysContext | undefined>(KEYS_CONTEXT);

  /* A TICK PER PART, ON THE QUESTION'S OWN PAGE ONLY, and only where there is something to pick: more
     than one part, or one that waits on a key. A part that is off says why under its name, and a part off for a key or
     for a part it needs cannot be ticked until that is held or ticked. */
  const ticks = getContext<TicksContext | undefined>(TICKS_CONTEXT);
  const takes = $derived(arranged.takes ?? []);
  const taking = $derived(ticksOf(takes, ticks?.unticked));
  const picking = $derived(!compact && ticks !== undefined && (takes.length > 1 || taking.off.size > 0));

  const folded = new Set(['needs', 'changes', 'choices', 'appears', 'words', 'settings', 'rows']);
</script>

<div class="arr" data-compact={compact ? '' : undefined}>
  <!-- ON THE QUEUE THE LEAD CARRIES THE COUNT, and it comes first: what it does, then why, then what it calls out. -->
  {#if compact}
    <p class="arr-summary">{arranged.summary ? copy.arrangeLeadSummary(arranged.lead, arranged.summary) : arranged.lead}</p>
  {:else}
    <!-- ON ITS OWN PAGE, ONE SENTENCE for the whole change, and the parts under it. -->
    <p class="arr-lead">{arranged.said ?? arranged.lead}</p>
  {/if}
  {#if picking && ticks}
    <section class="arr-part" aria-label={copy.arrangeTakesH}>
      <h3 class="arr-h">{copy.arrangeTakesH}</h3>
      <p class="arr-note">{copy.arrangeTakesHint}</p>
      <ul class="arr-lines arr-takes">
        {#each takes as t (t.id)}
          {@const why = taking.off.get(t.id)}
          {@const forced = why !== undefined && why !== ''}
          <li>
            <label class="arr-take" data-off={why !== undefined ? '' : undefined}>
              <input
                type="checkbox"
                checked={why === undefined}
                disabled={forced}
                aria-label={copy.arrangeTake(t.name)}
                aria-describedby={forced ? `take-why-${t.id}` : undefined}
                onchange={(e) => ticks.tick(t.id, e.currentTarget.checked)}
              />
              <span class="arr-title">{t.name}</span>
            </label>
            {#if forced}<p class="arr-take-why" id="take-why-{t.id}"><Icon name={t.keys.length ? 'key' : 'alert'} size="s" />{why}</p>{/if}
          </li>
        {/each}
      </ul>
      {#if taking.parts && taking.parts.length > 0}<p class="arr-note" role="status">{copy.arrangeTakeSome(taking.parts.length, takes.length)}</p>{/if}
    </section>
  {/if}
  {#each arranged.parts as p (p.part)}
    {#if p.part === 'why'}
      <section class="arr-part" aria-label={copy.arrangeWhy}>
        {#if !compact}<h3 class="arr-h">{copy.arrangeWhy}</h3>{/if}
        <ul class="arr-lines arr-why">
          {#each p.lines as line, i (i)}
            <li>{line.text}{#if line.at}<span class="arr-at">{line.at}</span>{/if}</li>
          {/each}
        </ul>
      </section>
    {:else if p.part === 'starts'}
      <section class="arr-part arr-calls" aria-label={copy.arrangeStarts}>
        <h3 class="arr-h arr-calls-h"><Icon name="globe" size="s" />{copy.arrangeStarts}</h3>
        <ul class="arr-lines">
          {#each p.feeds as feed, i (i)}
            <li class="arr-call">
              {#if feed.host}<span class="arr-host">{feed.host}</span>{/if}
              <span class="arr-detail">{feed.detail}</span>
            </li>
          {/each}
        </ul>
        <p class="arr-note">{copy.arrangeStartsNote}</p>
      </section>
    {:else if p.part === 'calls'}
      <section class="arr-part arr-calls" aria-label={copy.arrangeCalls}>
        <h3 class="arr-h arr-calls-h"><Icon name="globe" size="s" />{copy.arrangeCalls}</h3>
        <ul class="arr-lines">
          <!-- WHAT LEAVES, a sentence a call: the key by its label, the host and how often. -->
          {#each p.sends ?? [] as line, i (i)}<li class="arr-sends">{line}</li>{/each}
          {#each p.calls as call, i (i)}
            <li class="arr-call">
              {#if call.host}<span class="arr-host">{call.host}</span>{/if}
              <span class="arr-detail">{call.detail}</span>
            </li>
          {/each}
        </ul>
        <p class="arr-note">{copy.arrangeCallsNote}</p>
      </section>
    {:else if p.part === 'stops'}
      <!-- WHAT STOPS IS NEVER FOLDED: it is what accepting loses, and Accept asks twice for it. -->
      <section class="arr-part arr-calls" aria-label={copy.arrangeStopsH}>
        <h3 class="arr-h arr-calls-h"><Icon name="alert" size="s" />{copy.arrangeStopsH}</h3>
        <ul class="arr-lines">
          {#each p.lines as line, i (i)}<li class="arr-stop">{line}</li>{/each}
        </ul>
        {#if !compact}<p class="arr-note">{copy.arrangeStopsNote}</p>{/if}
      </section>
    {:else if p.part === 'packs'}
      <section class="arr-part" aria-label={copy.arrangePacks}>
        {#if !compact}<h3 class="arr-h">{copy.arrangePacks}</h3>{/if}
        <ul class="arr-lines">
          {#each p.lines as line, i (i)}<li>{line}</li>{/each}
        </ul>
      </section>
    {:else if !(compact && folded.has(p.part))}
      {#if p.part === 'needs'}
        <section class="arr-part" aria-label={copy.arrangeNeeds}>
          <h3 class="arr-h arr-calls-h"><Icon name="key" size="s" />{copy.arrangeNeeds}</h3>
          <ul class="arr-lines arr-needs">
            {#each p.keys as need, i (need.label)}<KeyNeeded {need} at={i} client={compact ? undefined : keys?.client} onheld={keys?.onheld} />{/each}
          </ul>
          {#if p.keys.some((k) => k.held !== 'connector')}<p class="arr-note">{copy.arrangeNeedsNote}</p>{/if}
        </section>
      {:else if p.part === 'changes'}
        <section class="arr-part" aria-label={copy.arrangeChangesH}>
          <h3 class="arr-h">{copy.arrangeChangesH}</h3>
          {#each p.lists as l (l.name)}
            {#if l.name}<h4 class="arr-h">{l.name}</h4>{/if}
            <ul class="arr-lines arr-changes">
              {#each l.changes as change, i (i)}
                <li>
                  <span class="arr-title">{change.title}</span>
                  <dl class="arr-fields">
                    <!-- A VALUE WHERE THERE WAS NONE IS "Set to", not "Now empty" beside what it will be; a field
                         empty on both sides is no change and is not drawn (`card.ts` `fieldChange`). -->
                    {#each change.fields as f, j (j)}
                      {@const how = fieldChange(f.before, f.after, copy.arrangeEmpty)}
                      {#if how !== 'none'}
                        <dt>{f.field}</dt>
                        <dd>
                          {#if how === 'set'}
                            <span class="arr-will"><span class="arr-tag">{copy.arrangeSetTo}</span>{f.after}</span>
                          {:else}
                            <span class="arr-was"><span class="arr-tag">{copy.arrangeBefore}</span>{f.before}</span>
                            <span class="arr-will"><span class="arr-tag">{copy.arrangeAfter}</span>{f.after}</span>
                          {/if}
                        </dd>
                      {/if}
                    {/each}
                  </dl>
                </li>
              {/each}
            </ul>
          {/each}
        </section>
      {:else if p.part === 'choices'}
        <section class="arr-part" aria-label={copy.arrangeChoices}>
          <h3 class="arr-h">{copy.arrangeChoices}</h3>
          {#each p.choices as c, i (i)}
            <p class="arr-question">{c.question}</p>
            <ul class="arr-lines arr-options">
              {#each c.options as o, j (j)}
                <li>
                  <span class="arr-title">{o.name}{#if o.suggested}<span class="arr-suggested">{copy.arrangeSuggested}</span>{/if}</span>
                  {#if o.line}<span class="arr-detail">{o.line}</span>{/if}
                </li>
              {/each}
            </ul>
          {/each}
        </section>
      {:else if p.part === 'appears'}
        {@const said = p.appears.map(appearsSaid)}
        <section class="arr-part" aria-label={copy.proposalWillAppear}>
          <h3 class="arr-h">{copy.proposalWillAppear}</h3>
          <!-- WHAT CAN BE SAID IN A SENTENCE IS; a page drawn, a look's colour or a list's lines stay the preview's. -->
          {#if said.some((x) => x !== null)}
            <ul class="arr-lines arr-said">
              {#each said.flatMap((x) => x ?? []) as line, i (i)}<li>{line}</li>{/each}
            </ul>
          {/if}
          {#if said.some((x) => x === null)}
            <Proposed proposed={{ appears: p.appears.filter((_, i) => said[i] === null), samples: null }} />
          {/if}
          {#if p.examples > 0}<p class="arr-note">{copy.arrangeExamples(p.examples)}</p>{/if}
        </section>
      {:else if p.part === 'words'}
        <section class="arr-part" aria-label={copy.arrangeWords}>
          <h3 class="arr-h">{copy.arrangeWords}</h3>
          <ul class="arr-lines">
            {#each p.lines as line, i (i)}<li>{line}</li>{/each}
          </ul>
        </section>
      {:else if p.part === 'rows'}
        <section class="arr-part" aria-label={copy.arrangeRows}>
          <h3 class="arr-h">{copy.arrangeRows}</h3>
          {#each p.lists as l (l.name)}
            <h4 class="arr-h">{l.name}</h4>
            <ul class="arr-lines">
              {#each l.lines as line, i (i)}<li>{line}</li>{/each}
            </ul>
          {/each}
          <p class="arr-note">{copy.arrangeRowsNote}</p>
        </section>
      {:else if p.part === 'settings'}
        <section class="arr-part" aria-label={copy.arrangeSettings}>
          <h3 class="arr-h">{copy.arrangeSettings}</h3>
          <ul class="arr-lines">
            {#each p.lines as line, i (i)}<li>{line}</li>{/each}
          </ul>
        </section>
      {/if}
    {/if}
  {/each}
</div>

<style>
  .arr {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    min-inline-size: 0;
  }

  .arr[data-compact] {
    gap: var(--sp-3);
  }

  .arr-lead {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 500;
  }

  .arr-part {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  .arr-h {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin: 0;
    color: var(--ink-3);
    font-family: var(--font-ui);
    font-size: var(--fs-meta);
    font-weight: 500;
  }

  .arr-lines {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    margin: 0;
    padding: 0;
    list-style: none;
    color: var(--ink-2);
    font-size: var(--fs-body);
    overflow-wrap: anywhere;
  }

  /* THE REASONS ARE THE PROPOSER'S OWN WORDS, so they read as prose, each on its line. */
  .arr-why li {
    color: var(--ink);
  }

  .arr-at {
    margin-inline-start: var(--sp-2);
    color: var(--ink-3);
    font-family: var(--font-mono);
    font-size: var(--fs-meta);
  }

  /* THE ONE PART THAT LEAVES THE RECORD: the warning glyph leads its heading, and the heading is in ink. */
  .arr-calls-h {
    color: var(--ink);
    font-size: var(--fs-body);
  }

  .arr-calls-h :global(.icon) {
    color: var(--warn);
  }

  .arr-call {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0 var(--sp-2);
  }

  .arr-host {
    color: var(--ink);
    font-family: var(--font-mono);
    font-weight: 400;
  }

  .arr-detail {
    color: var(--ink-2);
  }

  /* WHAT IT CHANGES: each entry's title, then its fields as a definition list, now beside what it will be. */
  .arr-changes,
  .arr-options {
    gap: var(--sp-3);
  }

  .arr-title {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0 var(--sp-2);
    color: var(--ink);
    font-weight: 500;
  }

  .arr-fields {
    display: grid;
    grid-template-columns: minmax(6rem, max-content) minmax(0, 1fr);
    gap: var(--sp-1) var(--sp-3);
    margin: var(--sp-1) 0 0;
  }

  .arr-fields dt {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: 1.6;
  }

  .arr-fields dd {
    display: flex;
    flex-wrap: wrap;
    gap: 0 var(--sp-3);
    margin: 0;
    min-inline-size: 0;
  }

  .arr-was {
    color: var(--ink-3);
  }

  .arr-will {
    color: var(--ink);
  }

  .arr-tag {
    margin-inline-end: var(--sp-1);
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .arr-question {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 600;
  }

  .arr-options li {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
  }

  /* THE SUGGESTED ONE IS SAID IN THE ACCENT'S TEXT, a word and not a colour alone. */
  .arr-suggested {
    color: var(--red);
    font-size: var(--fs-meta);
    font-weight: 500;
  }

  /* WHAT ACCEPT TAKES: a tick and the part's name on one line, and why it is off under it, with its mark. */
  .arr-takes {
    gap: var(--sp-2);
  }

  .arr-take {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: 44px;
    cursor: pointer;
  }

  .arr-take[data-off] .arr-title {
    color: var(--ink-2);
  }

  .arr-take-why {
    display: flex;
    align-items: baseline;
    gap: var(--sp-1);
    margin: 0;
    padding-inline-start: var(--sp-5);
    color: var(--ink-2);
    font-size: var(--fs-meta);
  }

  .arr-take-why :global(.icon) {
    flex: none;
    color: var(--warn);
  }

  .arr-stop {
    color: var(--ink);
  }

  /* WHAT LEAVES IS READ FIRST: a whole sentence in ink, above the calls it does not say. */
  .arr-sends {
    color: var(--ink);
  }

  @media (max-width: 480px) {
    .arr-fields {
      grid-template-columns: minmax(0, 1fr);
      gap: 0;
    }

    .arr-fields dd {
      margin-block-end: var(--sp-2);
    }
  }

  .arr-note,
  .arr-summary {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .arr-summary {
    font-size: var(--fs-body);
    color: var(--ink-2);
  }
</style>
