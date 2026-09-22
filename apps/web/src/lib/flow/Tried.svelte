<!--
  What the drawn automation would do, before it is sent: the record's own `dryRun`, drawn under the column
  (`loop/research-canvas-ux.md` 1.1).

  SEE IT WORK BEFORE YOU TRUST IT. Zapier's Test and n8n's Execute step both put this at the centre of their editors,
  and before this the only way to learn whether "only when due before today" caught anything was to send it, accept it
  on Decide and wait. It writes nothing, here or on the record, and says so under the answer.

  THREE ANSWERS, EACH IN THE RECORD'S OWN TERMS. An inline rule is walked over its list by the kernel, so it says how
  many rows match now and what the first few would get, the row's id last and quiet (DESIGN-SYSTEM 4.4). A run reads no
  row until it runs, so it says what starts it and its steps, a branch's arms indented under it as the record indents
  them. A refusal is the record's sentence, in ink with a glyph and never a wash (4.8).
-->
<script lang="ts">
  import Icon from '$lib/ui/Icon.svelte';
  import type { Answer, Tried } from './source.ts';

  let { tried }: { tried: Answer<Tried> } = $props();

  /** How many walked rows are listed. The record hands back twenty, and a column of twenty under a column of cards buries it. */
  const SHOWN = 5;

  const said = {
    heading: 'If it ran now',
    matches: (n: number, of: number | null) =>
      n === 0 ? 'No row matches it now.' : `${n === 1 ? 'One row matches' : `${n.toLocaleString('en')} rows match`} it now${of === null ? '' : `, of ${of.toLocaleString('en')}`}.`,
    more: (n: number) => `And ${n.toLocaleString('en')} more.`,
    nothing: 'Nothing, on this row.',
    wrote: 'Trying it changes nothing.',
  };

  const cap = (s: string): string => (s === '' ? s : s[0]!.toUpperCase() + s.slice(1));
  /** A line's indent, two spaces a level as `automations.ts` `stepLines` writes it, and the line without it. */
  const depthOf = (line: string): number => Math.floor((line.length - line.trimStart().length) / 2);
</script>

<section class="tried" aria-labelledby="tried-heading">
  <h2 class="tried-heading" id="tried-heading">{said.heading}</h2>
  {#if !tried.ok}
    <p class="tried-refused"><span class="tried-glyph"><Icon name="alert" /></span><span>{tried.refusal.fix}</span></p>
  {:else if tried.value.matches !== null}
    {@const t = tried.value}
    <p class="tried-count num">{said.matches(t.matches ?? 0, t.rows)}</p>
    {#if t.sample.length > 0}
      <ul class="tried-rows">
        {#each t.sample.slice(0, SHOWN) as r (r.spoken)}
          <li>
            <span class="tried-would">{r.would.length > 0 ? cap(r.would.join(', ')) : r.reason ? cap(r.reason) : said.nothing}</span>
            <span class="tried-id">{r.spoken}</span>
          </li>
        {/each}
      </ul>
      {#if (t.matches ?? 0) > SHOWN}<p class="tried-note num">{said.more((t.matches ?? 0) - SHOWN)}</p>{/if}
    {/if}
    <p class="tried-note">{said.wrote}</p>
  {:else}
    {@const t = tried.value}
    <p class="tried-trigger">{t.trigger}</p>
    <ol class="tried-steps">
      {#each t.steps as line, i (i)}
        <!-- `style="--depth: …"` AND NOT `style:--depth`, because `css-rules` finds a custom property's declaration by the
             attribute's spelling and flagged the directive's as a property nobody declares. -->
        <li style="--depth: {depthOf(line)}">{line.trimStart()}</li>
      {/each}
    </ol>
    <p class="tried-note">{said.wrote}</p>
  {/if}
</section>

<style>
  .tried {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    max-inline-size: 720px;
  }

  .tried-heading {
    margin: 0 0 var(--sp-1);
    color: var(--ink);
    font-size: var(--t-base);
    font-weight: 600;
  }

  .tried-count,
  .tried-trigger {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-base);
  }

  .tried-refused {
    display: flex;
    align-items: flex-start;
    gap: var(--sp-2);
    margin: 0;
    color: var(--ink);
    font-size: var(--t-base);
  }

  /* THE GLYPH CARRIES THE INTENT AND THE SENTENCE STAYS INK (DESIGN-SYSTEM 1.2 and 4.8). */
  .tried-glyph {
    display: inline-flex;
    flex: none;
    margin-block-start: 2px;
    color: var(--warn);
  }

  .tried-rows,
  .tried-steps {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .tried-rows li {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0 var(--sp-2);
    padding: var(--sp-1) 0;
    border-block-end: 1px solid var(--line-soft);
    font-size: var(--t-sm);
  }

  .tried-rows li:last-child {
    border-block-end: 0;
  }

  .tried-would {
    flex: 1 1 16rem;
    min-inline-size: 0;
    color: var(--ink2);
    overflow-wrap: anywhere;
  }

  .tried-id {
    color: var(--dim);
    font-size: var(--t-xs);
  }

  .tried-steps {
    gap: var(--sp-1);
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  .tried-steps li {
    padding-inline-start: calc(var(--depth, 0) * var(--sp-4));
    overflow-wrap: anywhere;
  }

  .tried-note {
    margin: 0;
    color: var(--dim);
    font-size: var(--t-xs);
  }
</style>
