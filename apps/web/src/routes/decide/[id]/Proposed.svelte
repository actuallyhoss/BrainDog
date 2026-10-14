<!--
  What accepting a `change` or a `pattern` would put on the screen (`proposed.ts`): each page, list,
  rule or look by its name, with the facts that say where it lands and what it shows. The accent of a
  look is drawn as a swatch beside its code, because a colour is judged by eye and not by its number.

  A PAGE IS ALSO DRAWN, under its lines, as it will be, beside the page as it is when the change replaces
  one. The record rehearses the whole change (`previewOf`, the record's `previewChange`), so a page over a
  list the same bundle brings is drawn over that list, and each page goes through the one page reader,
  `PageView mode="preview"`, with its rail, its spans and its boxes, and a "Now · After" switch for a page
  that is already there. A preview is handed no writes, so nothing on a page nobody has accepted can be
  ticked or moved.

  A HOST WITHOUT `previewChange` asks for each page alone (`drawnOf`, the record's `previewPage`), and a host
  without that either draws the lines and nothing more, which is what this screen drew before either.

  A PATTERN DRAWS ITS MESSAGES under its rule (`PatternReads.svelte`, loaded only then): who each is from and what the
  rule would take out of it, and how many more like them wait, so a yes is a yes to something seen.
-->
<script lang="ts">
  import { apiBase, at } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import { words as patternWords } from '$lib/pattern/words.ts';
  import PageView from '$lib/page/PageView.svelte';
  import { drawnOf, openedOf, previewOf, words, type Proposed, type Rehearsed, type Tried } from './proposed.ts';

  let { proposed }: { proposed: Proposed } = $props();

  /** What is drawn under one line of the preview: a page, or the record's sentence for why it is not drawn. */
  type Shown = { tried: Tried } | { fix: string };

  /* ONE ANSWER PER PROPOSAL, and a proposal changed under the screen drops the answers it was waiting on rather than
     drawing the last proposal's pages under the next one's title. */
  let rehearsed = $state<Rehearsed | null>(null);
  /* THE FALLBACK'S ANSWERS, ONE PER PAGE BY ITS PLACE IN THE LIST, filled only when the host has no `previewChange`. */
  let alone = $state<(Shown | null)[]>([]);

  $effect(() => {
    const change = proposed.change;
    const appears = proposed.appears;
    let current = true;
    rehearsed = null;
    alone = appears.map(() => null);
    const base = apiBase();
    const each = () =>
      appears.forEach((a, i) => {
        if (!a.page) return;
        const body = a.page;
        const slug = typeof body.page === 'string' && body.page !== '' ? body.page : (a.id ?? '').replace(/^page\./u, '');
        void drawnOf(body, base)
          .then((d) => {
            if (!current) return;
            if (d.from === 'refused') alone[i] = { fix: d.fix };
            else if (d.from === 'live') alone[i] = { tried: { id: a.id ?? '', slug, got: openedOf(body, slug, a.title, d.blocks, d.now), was: null } };
          })
          .catch(() => undefined);
      });
    if (!change) {
      each();
    } else {
      void previewOf(change, base)
        .then((r) => {
          if (!current) return;
          rehearsed = r;
          if (r.from === 'none') each();
        })
        .catch(() => {
          if (current) each();
        });
    }
    return () => {
      current = false;
    };
  });

  /* EACH DRAWN PAGE UNDER THE LINES THAT NAME IT, by its declaration's id; a page the change draws that no line names
     (a page per row the record filled from one declaration twice, say) is drawn after the list, so none is lost. */
  const live = $derived(rehearsed?.from === 'live' ? rehearsed.pages : []);
  const ids = $derived(new Set(proposed.appears.flatMap((a) => (a.id ? [a.id] : []))));
  const loose = $derived(live.filter((p) => !ids.has(p.id)));
  const shownFor = (i: number): Shown[] => {
    const a = proposed.appears[i];
    if (!a?.page) return [];
    if (rehearsed?.from === 'live') return live.filter((p) => a.id !== undefined && p.id === a.id).map((tried) => ({ tried }));
    const one = alone[i];
    return one ? [one] : [];
  };
</script>

{#snippet drawing(tried: Tried)}
  <div class="appear-drawn" role="group" aria-label={words.drawn(tried.got.page.page.title)}>
    <p class="appear-kind">{words.drawnHead}</p>
    <PageView slug={tried.slug} got={tried.got} mode="preview" was={tried.was} />
  </div>
{/snippet}

<ul class="appears">
  {#each proposed.appears as a, i (i)}
    <li class="appear">
      <p class="appear-head">
        <span class="appear-kind">{a.kind}</span>
        <span class="appear-title">{a.title}</span>
      </p>
      {#if a.lines.length}
        <dl class="appear-lines">
          {#each a.lines as line (line.label)}
            <dt>{line.label}</dt>
            <dd data-intent={line.tone}>
              {#if a.accent && line.value === a.accent}<span class="swatch" style:background={a.accent} aria-hidden="true"></span>{/if}
              {line.value}
            </dd>
          {/each}
        </dl>
      {/if}
      {#each shownFor(i) as shown, j (j)}
        {#if 'fix' in shown}
          <p class="appear-note">{shown.fix}</p>
        {:else}
          {@render drawing(shown.tried)}
        {/if}
      {/each}
    </li>
  {/each}
  {#each loose as tried, k (k)}
    <li class="appear">{@render drawing(tried)}</li>
  {/each}
</ul>
<!-- A PATTERN'S MESSAGES, AS ITS RULE READS THEM, under the rule. Imported only for a pattern, so no other question loads it. -->
{#if proposed.pattern}
  {#await import('./PatternReads.svelte') then loaded}
    <loaded.default pattern={proposed.pattern} />
  {/await}
{/if}
<!-- A CHANGE THE RECORD WOULD NOT INSTALL IS SAID ONCE, in its sentence, under the lines that still say what it holds. -->
{#if rehearsed?.from === 'refused'}<p class="appear-note">{rehearsed.fix}</p>{/if}
{#if proposed.samples !== null}<p class="appear-note">{copy.proposalSamples(proposed.samples)}</p>{/if}
{#if proposed.builder}<p class="appear-note"><a href={at(proposed.builder)}>{patternWords.openInBuilder}</a></p>{/if}

<style>
  .appears {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .appear {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    min-inline-size: 0;
  }

  .appear-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--sp-2);
    margin: 0;
    font-size: var(--t-ui);
  }

  .appear-kind {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .appear-title {
    color: var(--ink);
    font-weight: 500;
  }

  /* The same two tracks as a changed field: the fact's name as wide as a short label, then the fact. */
  .appear-lines {
    display: grid;
    grid-template-columns: minmax(8ch, max-content) minmax(0, 1fr);
    gap: var(--sp-1) var(--sp-3);
    margin: 0;
    font-size: var(--t-ui);
  }

  .appear-lines dt {
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: var(--lh-body);
  }

  .appear-lines dd {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin: 0;
    color: var(--ink2);
    overflow-wrap: anywhere;
  }

  /* A KIND THAT WRITES, IN RED: an agent job's line reads as a warning rather than an ordinary fact. */
  .appear-lines dd[data-intent='bad'] {
    color: var(--danger-text);
  }

  .swatch {
    flex: none;
    inline-size: 12px;
    block-size: 12px;
    border-radius: var(--r-sm);
    box-shadow: inset 0 0 0 1px var(--line);
  }

  /* THE DRAWING SITS UNDER THE LINES, RULED OFF FROM THEM, because it is the page and not a fact about it. It is the
     width of the column it is in and never wider, so at 390 it is one column under the question and above Accept, the
     reader stacking the rail under the main column as a phone always does. */
  .appear-drawn {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    margin-block-start: var(--sp-2);
    padding-block-start: var(--sp-3);
    border-block-start: 1px solid var(--line);
    min-inline-size: 0;
  }

  .appear-drawn .appear-kind {
    margin: 0;
  }

  .appear-note {
    margin: var(--sp-2) 0 0;
    color: var(--dim);
    font-size: var(--t-sm);
  }
</style>
