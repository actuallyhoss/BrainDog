<!--
  Packs, and the Kennel.

  A pack declares CONTENT AND IDENTITY — never position or visibility. That is Chrome's line, stated
  most plainly of anyone: extension actions are unpinned by default, and `isOnToolbar` is exposed to
  the extension READ-ONLY. There is no `default_area` and no auto-pin (19 §3).

  Selecting a pack means reading an install diff written in the language of metrics and nav order,
  which is why pack selection is the SECOND screen and never the first: asking a brand-new user to
  approve four schema reviews before they have seen one of their own rows is worse than a tour.
-->
<script lang="ts">
  import { titleOf } from '$lib/title.ts';
  import { copy } from '$lib/copy.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { PAGES, REGISTERS, PACKS, packDiff, pages } from '$lib/record/api.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Section from '$lib/ui/Section.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import type { PackInfo } from '$lib/record/schema.ts';

  const installed = PACKS.filter((p) => p.installed);
  const available = PACKS.filter((p) => !p.installed);

  let diff = $state<string | null>(null);
</script>

<!--
  ONE DIFF, TWO LISTS.

  It existed only under the packs you ALREADY HAVE. The three you could install carried an `Install`
  button whose toast said the plan "would be shown before anything applied" and showed none — so the
  before-and-after was offered for the decision already made and withheld from the one still open.
  `04 §3`: "The diff is shown before it applies … this is the entire trust model."
-->
{#snippet plan(pack: PackInfo)}
  {@const d = packDiff(pack)}
  <dl class="diff">
    <dt>{copy.diffAdds}</dt>
    <dd>
      <ul class="diff-adds">
        {#each d.adds as add}
          <li>
            <Icon name={add.kind === 'list' ? 'rows' : 'doc'} size="s" />
            <span class="diff-name">{add.name}</span>
            {#if add.detail}<span class="diff-detail">{add.detail}</span>{/if}
          </li>
        {/each}
      </ul>
      <!-- WHAT IS NOT KNOWN, SAID AS NOT KNOWN. A pack this record has not installed declares lists
           and pages it does not have, so there is no field count to give — and the previous version
           printed one anyway. -->
      {#if d.unread}<p class="diff-note">{copy.diffUnread}</p>{/if}
    </dd>

    <!-- `04 §4`: a pack may place a page it owns and may never move yours, and an update that would
         is SHOWN and then ignored. Nothing in this record does, so the line is absent rather than
         printed empty — `06 §1`, a warning that does not apply teaches people to ignore warnings. -->
    {#if d.changes.length}
      <dt>{copy.diffChanges}</dt>
      <dd>{#each d.changes as c}<p>{c} — {copy.diffNavKept}</p>{/each}</dd>
    {/if}
    {#if d.conflicts.length}
      <dt>{copy.diffConflicts}</dt>
      <dd>{#each d.conflicts as c}<p>{c}</p>{/each}</dd>
    {/if}

    <dt>{copy.diffSeeds}</dt>
    <dd>{d.seeds}</dd>
    <dt>{copy.diffTouches}</dt>
    <dd>{d.touches}</dd>
  </dl>
{/snippet}

<svelte:head><title>{titleOf(copy.packs)}</title></svelte:head>

<PageHead icon="packs" title={copy.packs} />

<div class="page">
  <!-- WHAT A PACK IS, SAID ONCE, WHERE THE WORD IS FIRST MET. `packBlurb` existed and rendered
       nowhere, so this screen listed things by name and version with nothing saying what installing
       one would do to the record. -->
  <p class="blurb">{copy.packBlurb}</p>
  <!-- A RECORD WITH NOTHING INSTALLED IS THE ORDINARY FIRST STATE OF THIS SCREEN, and it drew an
       empty `Section` under a `0`. `19 §6` again — and here the sentence has somewhere obvious to
       point, because the list of packs that are NOT installed is directly below it. -->
  <Section title={copy.installed} count={installed.length}>
    <div class="grid-packs">
      {#if installed.length === 0}
        <Empty kind="no-data-yet" title={copy.noPacksYet} body={copy.noPacksBody} />
      {/if}
      {#each installed as pack}
        <article class="pack">
          <header class="pack-head">
            <h3 class="pack-name">{pack.name}</h3>
            <span class="pack-version">{pack.version}</span>
          </header>
          <p class="pack-blurb">{pack.blurb}</p>
          <ul class="pack-gives">
            <!-- Names, not ids. A pack's feature list said `obligations` and `money` where the rest
                 of the product says Obligations and Overview, on the one screen whose whole job is
                 to tell somebody what they are about to install. A pack that is NOT installed names
                 things this record does not have yet, so the id is the honest fallback there. -->
            {#each pack.registers as r}<li><Icon name="rows" size="s" />{REGISTERS[r]?.name ?? r}</li>{/each}
            {#each pack.pages as p}<li><Icon name="doc" size="s" />{pages()[p]?.title ?? PAGES[p]?.title ?? p}</li>{/each}
          </ul>
          <footer class="pack-foot">
            <Button weight="bare" onclick={() => (diff = diff === pack.id ? null : pack.id)}>
              {copy.installDiff}
            </Button>
            <!-- IT HAD NO HANDLER AT ALL, on all five installed packs, while its sibling one line up
                 fires the mock toast. A control that does nothing forever with no feedback is the
                 one shape of dead thing a person retries. -->
            <Button
              weight="bare"
              tone="bad"
              onclick={() =>
                toasts.push(
                  copy.notWritten(`${pack.name} and everything it declares would be removed, with the diff shown first — the rows it created stay`),
                  { intent: 'warn' },
                )}
            >{copy.uninstall}</Button>
          </footer>
          {#if diff === pack.id}{@render plan(pack)}{/if}
        </article>
      {/each}
    </div>
  </Section>

  <Section title={copy.browse} count={available.length}>
    <ul class="ledger">
      {#each available as pack}
        <li>
          <div class="line">
            <span class="seq">{pack.author}</span>
            <span class="line-main">
              <span class="line-title">{pack.name}</span>
              <span class="line-detail">{pack.blurb}</span>
            </span>
            <span class="line-amount">
              {#if pack.stars}<span class="stars"><Icon name="star" size="s" />{pack.stars}</span>{/if}
            </span>
            <span class="line-when">
              <Button weight="bare" onclick={() => (diff = diff === pack.id ? null : pack.id)}>{copy.installDiff}</Button>
              <!-- A PACK THAT COLLIDES CANNOT BE INSTALLED, and the button says so rather than
                   promising a transaction that would be refused. `02 §5` warns that a disabled
                   control "invites a question the UI cannot answer" — this one is answered directly
                   below it, in the CONFLICTS section the button points at, which is the same shape
                   the row form uses for its own disabled submit. -->
              <Button
                weight="quiet"
                disabled={Boolean(pack.conflicts?.length)}
                aria-describedby={pack.conflicts?.length ? `conflict-${pack.id}` : undefined}
                onclick={() =>
                  toasts.push(copy.notWritten(`${pack.name} would be installed in one transaction, after this plan`), { intent: 'warn' })}
              >{copy.install}</Button>
            </span>
          </div>
          <!-- THE REASON IS BESIDE THE BUTTON, NOT INSIDE THE DISCLOSURE. `02 §5`'s objection to a
               disabled control is that it "invites a question the UI cannot answer" — which is
               exactly what it would be if the answer lived behind a panel that is closed by
               default. One sentence, always, next to the control it disables. -->
          {#if pack.conflicts?.length}
            <p class="pack-refused" id="conflict-{pack.id}">
              {copy.diffRefused(pack.conflicts.map((id) => REGISTERS[id]?.name ?? id))}
            </p>
          {/if}
          {#if diff === pack.id}{@render plan(pack)}{/if}
        </li>
      {/each}
    </ul>
  </Section>
</div>

<style>
  /* One sentence saying what the things on this screen are, in the person's words. */
  .blurb {
    margin-block-end: var(--sp-4);
    max-inline-size: 62ch;
    color: var(--ink2);
    font-size: var(--t-ui);
    line-height: 1.6;
  }

  .page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
    padding: var(--sp-5) var(--sp-6) var(--sp-9);
    max-inline-size: 1100px;
  }

  .grid-packs {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--sp-3);
  }

  .pack {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    padding: var(--sp-4);
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    box-shadow: var(--raise);
    transition: border-color var(--d-state) var(--ease-out);
  }

  .pack:hover {
    border-color: var(--edge);
  }

  .pack-head {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
  }

  .pack-name {
    font-family: var(--font-ui);
    font-size: var(--t-md);
    font-weight: 500;
  }

  .pack-version {
    margin-inline-start: auto;
    color: var(--dim);
    font-family: var(--font-id);
    font-size: var(--t-xs);
  }

  .pack-blurb {
    flex: 1;
    color: var(--dim);
    font-size: var(--t-ui);
  }

  .pack-gives {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .pack-gives li {
    display: flex;
    align-items: center;
    gap: 5px;
    color: var(--dim);
    font-family: var(--font-id);
    font-size: var(--t-xs);
  }

  /* A hairline, and the card's own padding pulled back over it, so the actions read as the card's
     FOOTER rather than as two more lines of its body. Without it "What this adds" sits at the same
     level as the blurb above it and the card has no bottom. */
  .pack-foot {
    display: flex;
    gap: var(--sp-1);
    margin-block-start: auto;
    padding-block-start: var(--sp-3);
    margin-inline: calc(var(--sp-4) * -1);
    padding-inline: calc(var(--sp-4) - var(--sp-3));
    border-block-start: 1px solid var(--line);
  }

  /* A DEFINITION LIST, NOT A CODE BLOCK. It was a `<pre>` in the id face with its own horizontal
     scrollbar, so on a phone the only line that fitted was half of one — and what a person is doing
     here is deciding whether to trust something, which is reading rather than diffing. The sections
     are `04 §3`'s, the words are theirs, and it wraps. */
  .diff {
    display: grid;
    grid-template-columns: minmax(6ch, max-content) minmax(0, 1fr);
    gap: var(--sp-1) var(--sp-4);
    margin: 0;
    padding: var(--sp-3);
    background: var(--sunk);
    border: 1px solid var(--line);
    border-radius: var(--r-sm);
    color: var(--ink2);
    font-size: var(--t-sm);
    line-height: 1.6;
  }

  .diff dt {
    color: var(--dim);
    font-size: var(--t-xs);
    font-weight: 600;
    letter-spacing: 0.09em;
    text-transform: uppercase;
  }

  .diff dd {
    margin: 0;
  }

  .diff dd p {
    margin: 0;
  }

  .diff-adds {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .diff-adds li {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
  }

  .diff-name {
    color: var(--ink);
  }

  .diff-detail {
    color: var(--dim);
    font-size: var(--t-xs);
  }

  .pack-refused {
    margin: 0 0 var(--sp-2);
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .diff-note {
    margin-block-start: var(--sp-2);
    color: var(--dim);
    font-size: var(--t-xs);
  }

  .stars {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    color: var(--dim);
    font-size: var(--t-xs);
  }

  @media (width < 1200px) {
    .grid-packs {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (width < 900px) {
    .page {
      padding: var(--sp-4) var(--sp-4) var(--sp-8);
    }

    .grid-packs {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
