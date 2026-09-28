<!--
  The first run: one prompt and one accept (`loop/finish/modules.md` MOD-6, `loop/DIRECTION.md` §6 and §9).

  ONE QUESTION, ONE FIELD, FOUR CHIPS. "Who are you?", answered in a sentence, with a chip for each of the four people
  the product is for (§11). The sentence is read without a model (`lib/start/propose.ts`), in any language: one these
  rules cannot read is kept as the person's note, never refused.

  THEN A PREVIEW, AND NOTHING WRITTEN. What was heard and what each phrase became; the BrainDog it makes, every page of it
  drawn by the record with examples that are marked and never saved (`PagesPreview.svelte`); a switch for each thing it
  keeps; the currency, asked only when Money is kept and none was typed; and "Remind me on this phone" where there are
  due dates to ring about.

  A BUSINESS NO USE CASE FITS IS DRAFTED FOR, where a model answers (`loop/finish/pages.md` PGS-20). Slash drafts lists,
  figures and pages made for what was said (`slashDraft`), which files nothing; they are drawn over its sample rows, and
  the same one press files and accepts them. The sample rows are never written.

  THEN ONE PRESS. "Make it mine" writes it all through the install path Browse uses (`accept.ts`) and lands on Home.
  There is no second screen and no one-row form: a list with nothing in it draws its own empty state, and a record with
  no lists is sent here by the root layout.

  NO SKIP, because a record with no lists has no other screen to show (19 §6). A colleague who holds lists and not the
  record, and an owner whose record is already made, are told so before the question, with the way back.
-->
<script lang="ts">
  import { tick } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { createClient } from '@braindog/client';
  import { firstPartyModule, moduleOfList } from '@braindog/seed/packs/modules';
  import { USE_CASES } from '@braindog/seed/usecases';
  import { dayOf } from '@braindog/seed/usecases/install';
  import { moduleName } from '@braindog/seed/usecases/names';
  import { apiBase, at } from '$lib/at.ts';
  import { methods } from '$lib/auth.ts';
  import { copy } from '$lib/copy.ts';
  import { firstRun } from '$lib/first-run.ts';
  import * as pref from '$lib/pref.ts';
  import type { Shell } from '$lib/record/boot-live.ts';
  import { onNoRecord } from '$lib/record/boot-live.ts';
  import { landing } from '$lib/record/landing.ts';
  import { INSTALL_ORDER, LEANS_ON } from '$lib/shape.ts';
  import { byRules, draftChange, type Drafted, type SlashClient } from '$lib/record/slash.ts';
  import { outsideCatalogue, propose, type Proposal } from '$lib/start/propose.ts';
  import { titleOf } from '$lib/title.ts';
  import { drew } from '$lib/ui/screen.svelte.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import Button from '$lib/ui/Button.svelte';
  import Entry from '../signin/Entry.svelte';
  import { PEOPLE, withChip } from '$lib/who.ts';
  import { accept, type NotMade } from './accept.ts';
  import { caseOf, changesAsked, draftAsked, keepsCurrency, pagesOf, reminds, words as drawing } from './preview.ts';
  import Currency from './Currency.svelte';
  import PagesPreview from './PagesPreview.svelte';
  import Remind from './Remind.svelte';
  import NoRecord from './NoRecord.svelte';
  import PasskeyFirst from './PasskeyFirst.svelte';

  /**
   * A COLLEAGUE WHO HOLDS LISTS AND NOT THE RECORD IS NEVER ASKED TO SET ONE UP. A record's shape is its owner's, and
   * every install this screen makes would be refused for them; they are told whose it is and sent to the lists they
   * came for (`landing.ts`).
   */
  const colleague = $derived(Boolean(page.data.live) && (page.data as unknown as Shell).me.lists != null);

  /**
   * SIGNED IN AND ON NO RECORD (OPS-17): a proved mailbox that has not paid yet, or a person whose only record closed.
   * `/app` sends that session here, and the `boot` under it answered 403, so the screen asks for a name and a payment
   * instead of drawing an empty record that says nothing is here.
   */
  const noRecord = $derived(!page.data.live && onNoRecord((page.data as unknown as Shell).refused));
  const notTheirs = $derived(colleague ? landing(page.data as unknown as Shell) : null);

  /**
   * WHETHER THE RECORD BEHIND THIS SCREEN IS ALREADY MADE. The root layout spares `/start` from the redirect that sends
   * an empty record here, which is what lets somebody open it again on a record with pages and lists; they are told so
   * before the question, with the door back.
   */
  const alreadyMade = $derived(Boolean(page.data.live) && (page.data.pages.length > 0 || page.data.index.registers.length > 0));

  /* WHERE AND HOW THE SENTENCE WAS TYPED, for a date such as "on the 1st" and for the currency names. */
  const locale = typeof navigator === 'undefined' ? 'en' : navigator.language;
  const zone = (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
    } catch {
      return null;
    }
  })();

  /* ── the prompt ─────────────────────────────────────────────────────────── */

  /* The sentence stays in memory and never in the address, so it is nowhere a link or a history entry can carry it. */
  let sentence = $state('');
  let field = $state<HTMLTextAreaElement | undefined>(undefined);
  let heardHeading = $state<HTMLHeadingElement | undefined>(undefined);

  /** A chip appends its words as a clause of what is there, and the caret goes back to the end of it. */
  function chip(words: string) {
    sentence = withChip(sentence, words);
    void tick().then(() => {
      field?.focus();
      field?.setSelectionRange(sentence.length, sentence.length);
    });
  }

  /* ENTER READS THE SENTENCE AND SHIFT+ENTER STARTS A NEW LINE, as a chat box does, because the field is one answer. */
  function enter(e: KeyboardEvent) {
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
    e.preventDefault();
    read();
  }

  /* ── the proposal ───────────────────────────────────────────────────────── */

  let proposal = $state<Proposal | null>(null);
  /** The use case chosen, which starts as the one proposed. */
  let chosen = $state<string | null>(null);
  /** The modules the person left on, beside the ones something chosen needs. */
  let kept = $state<string[]>([]);
  let currency = $state<string | null>(null);

  function read() {
    if (sentence.trim() === '') return;
    const p = propose(sentence, { zone, locale });
    proposal = p;
    chosen = p.usecase;
    kept = [...p.modules];
    currency = p.currency;
    failed = null;
    draft = null;
    drafting = false;
    drafts += 1;
    if (model && outsideCatalogue(p)) void draftFor(sentence);
    void tick().then(() => heardHeading?.focus());
  }

  /* ── what Slash drafts for a business outside the catalogue ─────────────── */

  /** Whether this host has a model behind Slash, the same fact the page sheet stands on (`ChangePage.svelte`). */
  const model = $derived(page.data.slash === true);
  /** What Slash drafted for the sentence, `null` when it drafted nothing or was not asked. */
  let draft = $state.raw<Drafted | null>(null);
  let drafting = $state(false);
  /* EACH DRAFT IS NUMBERED, so an answer that arrives after the sentence changed is not drawn under the new words. */
  let drafts = 0;

  /**
   * ASK SLASH FOR LISTS AND PAGES MADE FOR THIS BUSINESS (`slashDraft`), which drafts, repairs and draws them and files
   * nothing. An answer from its own rules, which cannot read a sentence, or one with no draft that drew clean, leaves the
   * proposal as the lexicon made it: its modules, or the use cases to choose from.
   */
  async function draftFor(said: string) {
    const mine = drafts;
    drafting = true;
    try {
      const out = await draftChange(createClient({ base: apiBase() }) as unknown as SlashClient, said);
      if (mine !== drafts) return;
      draft = out.ok && !byRules(out.drafted) ? (out.drafted.drafts[0] ?? null) : null;
    } catch {
      if (mine === drafts) draft = null;
    } finally {
      if (mine === drafts) drafting = false;
    }
  }

  /* THE SENTENCE AGAIN, AS A FIELD. The preview goes with it, so nothing on screen describes words that changed. */
  function edit() {
    proposal = null;
    failed = null;
    draft = null;
    drafting = false;
    drafts += 1;
    void tick().then(() => {
      field?.focus();
      field?.setSelectionRange(sentence.length, sentence.length);
    });
  }

  const u = $derived(caseOf(chosen));
  /* THE USE CASES BESIDE IT belong to the proposal they were heard with, so choosing another use case leaves them out. */
  const also = $derived(proposal && chosen === proposal.usecase ? proposal.also.flatMap((id) => caseOf(id) ?? []) : []);
  const cases = $derived(u ? [u, ...also] : []);

  /**
   * WHY A MODULE CANNOT BE TURNED OFF, or `null` when it can: a use case chosen stands on it, or a module kept leans on
   * it (`LEANS_ON`: Money points at the person an invoice is to), so the record would refuse the one without the other.
   */
  function heldBy(id: string): string | null {
    for (const c of cases) if (c.modules.includes(id)) return c.title;
    for (const m of kept) if (m !== id && (LEANS_ON[m] ?? []).includes(id)) return moduleName(m);
    return null;
  }

  /**
   * EVERY PACK THE PERSON CAN TURN ON HERE: the modules this build ships, in install order, then any other catalogue pack
   * the sentence was heard asking for or a use case chosen stands on (shell.md USE-3), in the order they came.
   */
  const offered = $derived<string[]>([
    ...new Set([...INSTALL_ORDER, ...(proposal?.modules ?? []), ...kept, ...cases.flatMap((c) => c.modules)]),
  ]);

  /** What is installed: every pack kept, and every one something kept or chosen needs, in install order. */
  const modules = $derived<string[]>(offered.filter((id) => kept.includes(id) || heldBy(id) !== null));

  function flip(id: string) {
    if (heldBy(id) !== null) return;
    kept = kept.includes(id) ? kept.filter((m) => m !== id) : [...kept, id];
  }

  /* THE CURRENCY IS ASKED ONLY WHEN MONEY IS KEPT AND THE SENTENCE TYPED NONE; the module that keeps it says so. */
  const money = $derived(modules.find(keepsCurrency) ?? null);
  const asksCurrency = $derived(money !== null && proposal !== null && proposal.currency === null);
  const ring = $derived(proposal !== null && reminds(cases, modules));
  const pages = $derived(pagesOf(cases, modules));

  /* THE DRAFT STANDS ONLY WHILE NO USE CASE IS CHOSEN: choosing one from the chips is choosing its pages instead. */
  const using = $derived(chosen === null ? draft : null);
  const today = dayOf(Date.now());
  /**
   * WHAT THE RECORD IS ASKED TO DRAW: the draft as Slash drew it, over its sample rows, beside the modules kept; or every
   * page of the use cases and modules, over their examples. Every one is a rehearsal that keeps nothing.
   */
  const asks = $derived(using ? [draftAsked(using), ...changesAsked([], modules, today)] : changesAsked(cases, modules, today));
  const entries = $derived(
    (proposal?.rows ?? []).flatMap((r) => {
      const m = moduleOfList(r.register);
      return m && modules.includes(m.id) ? [firstRun.mineIn(String(r.fields.what ?? r.fields.name ?? ''), m.name)] : [];
    }),
  );

  /* ── the accept ─────────────────────────────────────────────────────────── */

  let busy = $state(false);
  /** What could not be made, `null` until a press has come back with something refused. */
  let failed = $state<NotMade[] | null>(null);
  const nothing = $derived(u === null && modules.length === 0 && using === null);
  const ready = $derived(proposal !== null && !busy && !nothing && !(asksCurrency && currency === null));

  async function make() {
    if (!proposal || !ready) return;
    /* WHAT THE PRESS MAKES IS WHAT WAS ON SCREEN WHEN IT LANDED, read once here, before the first call goes out. */
    const asked = {
      sentence,
      proposal,
      usecase: u?.usecase ?? null,
      also: also.map((a) => a.usecase),
      modules,
      currency: money === null ? null : currency,
      today: dayOf(Date.now()),
      nav: pref.read().nav ?? [],
      drafted: using,
    };
    busy = true;
    failed = null;
    try {
      const client = createClient({ base: apiBase() });
      const signed = await methods();
      const out = await accept(client, { ...asked, email: signed.ok ? (signed.value.me?.email ?? null) : null });
      if (out.nav) pref.write({ nav: out.nav });
      /* THE SHELL READS THE RECORD AGAIN, so the rail shows the new pages and speaks in the new voice. */
      (await import('$lib/record/boot-live.ts')).forget();
      if (out.failed.length === 0) {
        toasts.push(firstRun.madeToast, { intent: 'good' });
        await goto(at('/'));
        return;
      }
      /* WHAT WENT IN STAYS IN, AND IS NOT ASKED FOR AGAIN: the proposal keeps only the entries not written, so pressing
         "Make it mine" after a refusal writes only the ones that were not made. */
      if (out.left.length < asked.proposal.rows.length && proposal === asked.proposal) proposal = { ...asked.proposal, rows: out.left };
      /* A DRAFT ON DECIDE IS NOT FILED TWICE: kept, or waiting there, the next press leaves it where it is. */
      if (out.filed && draft === asked.drafted) draft = null;
      failed = out.failed;
    } finally {
      busy = false;
    }
  }

  /* THIS SCREEN DRAWS FROM WHAT IS TYPED, with no read to wait on, so it is ready as soon as it is drawn. */
  $effect(() => drew('ready'));
</script>

<svelte:head><title>{titleOf('Start')}</title></svelte:head>

<!-- THE ENTRY LAYOUT EVERY WAY IN SHARES (`signin/Entry.svelte`), in its wide form for the previews below. -->
<Entry wide>
  <div class="frame">
    {#if noRecord}
      <NoRecord title={copy.noRecordTitle} why={copy.noRecordWhy} />
    {:else if colleague}
      <section class="again" aria-labelledby="again-h">
        <p class="again-h" id="again-h">{copy.startNotYours}</p>
        <p class="again-why">{copy.startNotYoursWhy}</p>
        <div class="actions">
          {#if notTheirs?.kind === 'list'}
            <Button weight="primary" href={notTheirs.href}>{copy.openList(notTheirs.name)}</Button>
          {:else if notTheirs}
            {#each notTheirs.lists as l (l.href)}<Button href={l.href}>{copy.openList(l.name)}</Button>{/each}
          {/if}
        </div>
      </section>
    {:else}
      {#if alreadyMade}
        <section class="again" aria-labelledby="again-h">
          <p class="again-h" id="again-h">{firstRun.againMade}</p>
          <p class="again-why">{firstRun.againMore}</p>
          <div class="actions">
            <Button weight="bare" href="/">{firstRun.againBack}</Button>
          </div>
        </section>
      {/if}

      <!-- A NEW PERSON'S FIRST ASK IS A PASSKEY (OPS-17), and it draws nothing for anybody who has one. -->
      <PasskeyFirst />

      <h1 class="question" id="who-h">{firstRun.whoQuestion}</h1>

      {#if proposal === null}
        <form
          class="prompt"
          onsubmit={(e) => {
            e.preventDefault();
            read();
          }}
        >
          <textarea
            class="prompt-field"
            rows="2"
            autocomplete="off"
            aria-labelledby="who-h"
            placeholder={firstRun.whoPlaceholder}
            bind:this={field}
            bind:value={sentence}
            onkeydown={enter}
          ></textarea>
          <div class="chips" role="group" aria-label={firstRun.whoChipsLabel}>
            {#each firstRun.whoChips as c (c)}
              <!-- A mouse press keeps focus in the field, so the caret stays where the words are going. -->
              <button type="button" class="chip" onmousedown={(e) => e.preventDefault()} onclick={() => chip(c)}>{c}</button>
            {/each}
          </div>
          <div class="actions">
            <Button weight="primary" type="submit" disabled={sentence.trim() === ''}>{firstRun.whoGo}</Button>
          </div>
        </form>
      {:else}
        <!-- AFTER THE PRESS THE SENTENCE IS ONE LINE, and pressing it opens it for editing. -->
        <button type="button" class="said-line" disabled={busy} onclick={edit}><span class="said-text">{sentence}</span><span class="said-edit">{firstRun.whoEdit}</span></button>

        <section class="part" aria-labelledby="heard-h">
          <h2 class="part-h" id="heard-h" tabindex="-1" bind:this={heardHeading}>{firstRun.heardTitle}</h2>
          {#if proposal.name}<p class="heard-name">{firstRun.heardName(proposal.name)}</p>{/if}
          {#if proposal.heard.length > 0}
            <ul class="heard">
              {#each proposal.heard as h, i (i)}
                <li><q class="phrase">{h.phrase}</q> <span class="became"><span aria-hidden="true">→</span> {h.became}</span></li>
              {/each}
            </ul>
          {:else}
            <p class="quiet">{firstRun.heardNone}</p>
            {#if proposal.name && modules.includes(PEOPLE)}<p class="quiet">{firstRun.heardNote}</p>{/if}
          {/if}
          {#if proposal.name && !modules.includes(PEOPLE)}<p class="quiet">{firstRun.nameNotKept}</p>{/if}
        </section>

        <section class="part" aria-labelledby="mine-h">
          <h2 class="part-h" id="mine-h">{firstRun.mineTitle}</h2>
          {#if u}
            <p class="mine-title">{u.title}</p>
            <p class="quiet">{u.summary}</p>
          {:else if using}
            <p class="mine-title">{drawing.drafted}</p>
            <p class="quiet">{using.question}</p>
          {:else if drafting}
            <p class="quiet" role="status">{drawing.drafting}</p>
          {/if}
          <div class="chips" role="group" aria-label={firstRun.mineFor}>
            {#each USE_CASES as one (one.usecase)}
              <button type="button" class="chip" aria-pressed={chosen === one.usecase} onclick={() => (chosen = chosen === one.usecase ? null : one.usecase)}>{one.title}</button>
            {/each}
          </div>

          {#if pages.length > 0}
            <h3 class="sub-h">{firstRun.minePages}</h3>
            <ul class="pages">
              {#each pages as s (s.section)}
                <li><span class="pages-section">{s.section}</span> <span class="quiet">{firstRun.and(s.pages)}</span></li>
              {/each}
            </ul>
          {/if}

          <!-- EVERY PAGE IT MAKES, one card a page under the sentence, each opening as the record would draw it. -->
          <PagesPreview asked={asks} />

          {#if entries.length > 0}
            <h3 class="sub-h">{firstRun.mineEntries}</h3>
            <ul class="entries">
              {#each entries as e, i (i)}<li>{e}</li>{/each}
            </ul>
          {/if}

          <h3 class="sub-h">{firstRun.mineKeeps}</h3>
          <ul class="keeps">
            {#each offered as id (id)}
              {@const by = heldBy(id)}
              {@const blurb = firstPartyModule(id)?.blurb ?? ''}
              <li class="keep">
                <span class="keep-main">
                  <span class="keep-name" id="keep-{id}">{moduleName(id)}</span>
                  <span class="quiet">{by === null ? blurb : firstRun.keepNeeded(by)}</span>
                </span>
                <button
                  type="button"
                  class="switch"
                  role="switch"
                  aria-checked={modules.includes(id)}
                  aria-label={firstRun.keepSwitch(moduleName(id))}
                  disabled={by !== null || busy}
                  onclick={() => flip(id)}><span class="switch-track"></span></button
                >
              </li>
            {/each}
          </ul>

          {#if asksCurrency}<Currency bind:value={currency} {locale} />{/if}
          {#if ring}<Remind />{/if}
        </section>

        {#if failed}
          <section class="part" aria-labelledby="failed-h" role="status">
            <h2 class="part-h" id="failed-h">{firstRun.notAllMade}</h2>
            <ul class="failed">
              {#each failed as f, i (i)}
                <li>
                  {f.said}
                  {#if f.why !== ''}
                    <details class="why"><summary>{firstRun.whyDetails}</summary><p class="quiet">{f.why}</p></details>
                  {/if}
                </li>
              {/each}
            </ul>
            <div class="actions">
              <Button href="/">{firstRun.openHome}</Button>
            </div>
          </section>
        {/if}

        <!-- WHY THE PRIMARY IS OFF sits above the bar, not in it, so the bar a phone keeps on screen stays one button tall. -->
        {#if nothing}<p class="quiet" id="make-why">{firstRun.makeSomething}</p>{/if}
        <!-- ONE PRIMARY, AND ON A PHONE IT RIDES THE BOTTOM EDGE, clear of the home indicator. -->
        <div class="make-bar">
          <Button weight="primary" disabled={!ready} onclick={() => void make()} aria-describedby={nothing ? 'make-why' : undefined}>
            {busy ? firstRun.makingIt : firstRun.makeIt}
          </Button>
        </div>
      {/if}
    {/if}
  </div>
</Entry>

<style>
  /* ONE COLUMN AT EVERY WIDTH. The frame, its gutter and the brand are `signin/Entry.svelte`'s, the same as sign in's;
     `min-inline-size: 0` so a long word cannot widen the column past the screen and take the page sideways. */
  .frame {
    display: grid;
    align-content: start;
    gap: var(--sp-5);
    min-inline-size: 0;
  }

  .question {
    color: var(--ink);
    font-family: var(--font-display);
    font-size: var(--t-3xl);
    font-weight: 600;
    letter-spacing: -0.03em;
    line-height: var(--lh-3xl);
    text-wrap: balance;
  }

  .prompt {
    display: grid;
    gap: var(--sp-3);
  }

  /* THE ONE FIELD, drawn at the size of a sentence rather than a form row, and 16px so a phone does not zoom it. */
  .prompt-field {
    inline-size: 100%;
    padding: var(--sp-3) var(--sp-4);
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    color: var(--ink);
    font: inherit;
    font-size: var(--t-md);
    line-height: var(--lh-body);
    resize: vertical;
    /* IT SCROLLS CLEAR OF THE PHONE'S KEYBOARD with the chips and Continue under it still in view. */
    scroll-margin-block: var(--sp-6) var(--sp-9);
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  .chip {
    min-block-size: var(--tap);
    padding-inline: var(--sp-4);
    background: var(--s1);
    border: 1px solid var(--edge);
    border-radius: var(--r-pill);
    color: var(--ink2);
    font: inherit;
    font-size: var(--t-sm);
    cursor: pointer;
    transition: background var(--d-state) var(--ease-out);
  }

  .chip[aria-pressed='true'] {
    background: var(--selected);
    color: var(--ink);
  }

  @media (hover: hover) and (pointer: fine) {
    .chip:hover {
      background: var(--hover-wash);
    }
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  /* THE SENTENCE, ONE LINE, ELLIPSED WHERE IT RUNS OVER: the whole of it is one press away. */
  .said-line {
    display: flex;
    min-block-size: var(--tap);
    min-inline-size: 0;
    align-items: center;
    gap: var(--sp-3);
    padding-inline: var(--sp-4);
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    color: var(--ink);
    font: inherit;
    font-size: var(--t-md);
    text-align: start;
    cursor: text;
  }

  .said-text {
    flex: 1;
    overflow: hidden;
    min-inline-size: 0;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .said-edit {
    flex: none;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .part {
    display: grid;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  .part-h {
    color: var(--ink);
    font-size: var(--t-md);
    font-weight: 600;
  }

  .sub-h {
    margin-block-start: var(--sp-3);
    color: var(--ink2);
    font-size: var(--t-sm);
    font-weight: 600;
  }

  .heard-name,
  .mine-title {
    color: var(--ink);
    font-size: var(--t-md);
    font-weight: 600;
  }

  .quiet {
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: var(--lh-body);
  }

  .heard,
  .pages,
  .entries,
  .keeps,
  .failed {
    display: grid;
    gap: var(--sp-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .phrase,
  .pages-section {
    color: var(--ink);
    font-weight: 500;
    overflow-wrap: anywhere;
  }

  .became {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  /* A SWITCH BESIDE ITS SENTENCE, never across the screen from it: the words take what they need up to a line's
     measure and the switch sits after them, as Settings lays its switches out. */
  .keep {
    display: grid;
    grid-template-columns: fit-content(var(--measure)) auto;
    align-items: center;
    gap: var(--sp-4);
    min-block-size: var(--row-h-2);
    border-block-end: 1px solid var(--line-soft);
  }

  .keep-main {
    display: grid;
    gap: var(--sp-1);
    min-inline-size: 0;
  }

  .keep-name {
    color: var(--ink);
    font-size: var(--t-base);
    font-weight: 500;
  }

  .why summary {
    min-block-size: var(--tap);
    color: var(--ink2);
    font-size: var(--t-sm);
    cursor: pointer;
  }

  .again {
    display: grid;
    gap: var(--sp-1);
  }

  .again-h {
    color: var(--ink);
    font-size: var(--t-base);
    font-weight: 600;
  }

  .again-why {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  /* THE ONE PRIMARY, AT THE END OF THE PREVIEW at 1440, at the end of the line as a form's primary sits. */
  .make-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: end;
    gap: var(--sp-3);
    padding-block: var(--sp-4) var(--sp-7);
  }

  /* AND ON A PHONE IT RIDES THE BOTTOM EDGE: the button's own 44px and 4px either side, which is the `--sticky` height,
     with the home indicator's inset paid once under it, and the button full width for a thumb. */
  @media (width < 900px) {
    .make-bar {
      position: sticky;
      inset-block-end: 0;
      padding-block: var(--sp-1) calc(var(--sp-1) + env(safe-area-inset-bottom));
      background: var(--bg);
    }

    .make-bar :global(.btn) {
      inline-size: 100%;
    }
  }
</style>
