<!--
  Share this setup: `/plugins/share`.

  WHAT GOES IN THE FILE IS SAID BEFORE THE BUTTON, and none of the record's rows go in unless one is ticked here. The
  record writes the file (`exportUseCase`), reading it back through the door a stranger's file comes in by, so a row
  holding a credential is refused on this screen rather than on somebody else's record.

  THE VERSION COUNTS ON FROM THE LAST SHARE. Once a file is downloaded or published its version is kept as the use
  case's `shared_version` setting, and the form offers a patch or a minor after the later of that and the version
  installed. The rail goes out in the order this person sees it (`drawnOrder`), and the words that suggest the use case
  and its skills go in only when ticked.

  WHAT GOES OUT IS SHOWN AS A DIFF, AND AS AN INSTALLER SEES IT. While the form is filled the record
  writes the file again after each pause (`exportUseCase` writes nothing), and the screen says what it changes against
  the version it counts on from: the one last published, else the use case as BrainDog ships it, else the one installed.
  Under that, the file is drawn as browse draws a use case (`previewOf`), so the author sees the rail and Home a
  stranger will be offered. "Publish to the store" sits beside Download and sends the same file as the signed-in
  person (`lib/market/publish.ts`); its answer is one sentence with a link.

  ONE COLUMN, read top to bottom, never two ragged columns. The page runs the window's width like every other; the
  fields keep `--measure` inside it.

  THE LOOK: what goes in the file is the title row's sentence, and the way back to the add-ons is the
  head's. The form is groups on the ground, each field's label above it; what changes and what an installer sees are two
  tiles, the second drawing the use case on a well of the ground's colour. Download is the one primary.
-->
<script lang="ts">
  import { apiBase, at } from '$lib/at.ts';
  import { onMount, untrack } from 'svelte';
  import { page } from '$app/state';
  import type { Changes } from '@braindog/declare/catalogue';
  import { createClient } from '@braindog/client';
  import { useCase } from '@braindog/seed/usecases';
  import { useCaseName } from '@braindog/seed/usecases/names';
  import { builtInFile, previewOf } from '@braindog/seed/usecases/share';
  import { catalogueTitles, readShippedCatalogue } from '../../addons/catalogue.ts';
  import { changeLines, changesSince, kennelFetch, publishedHref, publishedLink, publishedSaid, publishedText, publishWords, submitToKennel, type Submitted } from '$lib/market/publish.ts';
  import { titleOf } from '$lib/title.ts';
  import { copy } from '$lib/copy.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { read } from '$lib/data/record.ts';
  import { saveDog } from '$lib/dog/source.ts';
  import { choose, type PackState } from '$lib/record/packs.ts';
  import { arrange, orderLists } from '$lib/nav.ts';
  import * as pref from '$lib/pref.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import '$lib/ui/forms.css';
  import { drew } from '../../../lib/ui/screen.svelte.ts';
  import Preview from '../../addons/Preview.svelte';
  import { drawnOrder, exportShared, listWords, moduleTitle, offeredVersion, rowTitle, speakingOf, speakingStates } from '../../addons/sharing.ts';
  import { skillsOnce, words, type SkillOffer } from '../../addons/share/share.ts';
  import { goto } from '$app/navigation';
  import Segmented from '$lib/ui/Segmented.svelte';
  import AddonFrom from '../../addons/share/AddonFrom.svelte';
  import { ADDON_MODE, MODE_PARAM, modeOf, words as addonWords, type Mode } from '../../addons/share/addon-from.ts';

  /* TWO MODES, ONE SCREEN: the whole setup as a use case, or an add-on from what the person made. The Add-ons
     screen's offer opens the second by `?mode=addon`, and a switch keeps the address in step without a reload. By
     `goto` in place, as every other screen's choice in the address is kept: Kit's shallow `replaceState`, used here
     alone, sat in the chunk every screen loads. A navigation unsettles the screen (`leaving`), so it is drawn again
     once the address has moved. */
  let mode = $state<Mode>(modeOf(page.url.searchParams));
  function switchTo(next: Mode) {
    if (next === mode) return;
    mode = next;
    const q = new URLSearchParams(page.url.searchParams);
    if (next === 'addon') q.set(MODE_PARAM, ADDON_MODE);
    else q.delete(MODE_PARAM);
    void goto(`?${q}`, { replaceState: true, noScroll: true, keepFocus: true }).then(
      () => drew('ready'),
      () => undefined,
    );
  }

  const AUDIENCES = ['individual', 'founder', 'team', 'starter', 'other'] as const;
  const EXAMPLES_MOST = 8;
  /** How long the form rests before the file is written again for the diff: one read per pause, never one per key. */
  const DRAFT_WAIT_MS = 600;

  let client = $state.raw<ReturnType<typeof createClient> | null>(null);
  /** True once the record answered. Download is only pressed then: the record writes the file. */
  let live = $state(false);
  let refused = $state<string | null>(null);
  let states = $state<PackState[]>([]);
  let rows = $state<Record<string, { seq: number; title: string }[]>>({});
  let picked = $state<Record<string, number[]>>({});
  /** Each list by the word this record gives it, so a list renamed Modules is picked from under Modules. */
  let names = $state<Record<string, string>>({});
  let title = $state('');
  let version = $state('');
  let summary = $state('');
  let audience = $state('');
  let busy = $state(false);
  let wrong = $state<string | null>(null);
  let step = $state<'patch' | 'minor'>('patch');
  let lastShared = $state<string | null>(null);
  /** Whether the file says the words that suggest this use case, and which skills it carries, by row number. */
  let withSignals = $state(false);
  let skillRows = $state<SkillOffer[]>([]);
  let skillsPicked = $state<number[]>([]);
  /** The file as it would go out now, what it changes and what it counts on from; `null` until the first is written. */
  let draft = $state.raw<
    | { state: 'reading' }
    | { state: 'ready'; doc: Record<string, unknown>; since: string | null; changes: Changes }
    | { state: 'refused'; fix: string }
    | null
  >(null);
  let publishing = $state(false);
  let sent = $state.raw<(Submitted & { title: string }) | null>(null);

  const speaking = $derived(speakingOf(states));
  const own = $derived(states.find((s) => s.id === `usecase-${speaking}`) ?? null);
  const count = $derived(Object.values(picked).reduce((n, seqs) => n + seqs.length, 0));
  const installedVersion = $derived(own?.version ?? null);
  const signals = $derived(speaking === null ? [] : (useCase(speaking)?.signals ?? []));
  /* THE VERSION FOLLOWS THE STEP UNTIL SOMEBODY TYPES ONE. */
  let typed = $state(false);
  /* WHAT IT IS FOR AND WHO FOR START AS THE SETUP SAYS THEM, until somebody writes their own. */
  let wrote = $state(false);
  $effect(() => {
    if (wrote || speaking === null) return;
    const u = useCase(speaking);
    if (!u) return;
    summary = u.summary;
    audience = (copy.shareAudiences as Record<string, string>)[u.audience] ?? '';
  });
  $effect(() => {
    const next = speaking === null ? '1.0.0' : offeredVersion(installedVersion, lastShared, step);
    if (!typed) version = next;
  });

  /* A PACK THE BUILD HAS NO MODULE FOR IS NAMED BY THE CATALOGUE THIS BUILD SHIPS (, never ). */
  let shippedTitles = $state<ReadonlyMap<string, string>>(new Map());
  const titleOfModule = (id: string): string => shippedTitles.get(id) ?? moduleTitle(id);

  onMount(() => {
    void readShippedCatalogue(fetch).then((index) => catalogueTitles(index)).then((m) => (shippedTitles = m)).catch(() => undefined);
    void read(async () => {
      client = createClient({ base: apiBase() });
      /* WITH NO RECORD THIS SAID "This is the sample, so the file is made from a record of your own" over a form whose
         Download could not be pressed. The record's refusal is the page now. */
      const chosen = await choose(client);
      if (!chosen.first.ok) {
        refused = chosen.first.refusal.fix;
        return false;
      }
      /* WHO SPEAKS IS WHO WAS CHOSEN TO, when two use cases are on, so the file is made from that one. */
      states = await speakingStates(client, chosen.first.value);
      live = true;
      const id = speakingOf(states);
      if (id !== null) title = useCaseName(id);
      if (states.some((s) => s.registers.includes('skills') && s.disabled_at === null)) {
        const listed = await client.list({ register: 'skills', limit: 50 });
        skillRows = listed.ok ? skillsOnce(listed.value.rows as { seq: number | null; fields: Record<string, unknown> }[]) : [];
      }
      if (own) {
        const config = await client.packConfig({ id: own.id });
        const values = config.ok ? ((config.value as { values?: Record<string, unknown> }).values ?? {}) : {};
        lastShared = typeof values.shared_version === 'string' && values.shared_version !== '' ? values.shared_version : null;
        names = Object.fromEntries(own.registers.flatMap((r) => (typeof values[`label_${r}`] === 'string' && values[`label_${r}`] !== '' ? [[r, values[`label_${r}`] as string]] : [])));
        const out: typeof rows = {};
        for (const register of own.registers) {
          const listed = await client.list({ register, limit: 50 });
          out[register] = listed.ok ? (listed.value.rows as { seq: number | null; fields: Record<string, unknown> }[]).flatMap((r) => (r.seq === null ? [] : [{ seq: r.seq, title: rowTitle(r.fields) }])) : [];
        }
        rows = out;
      }
      return true;
    });
  });
  $effect(() => drew('ready'));

  function toggle(register: string, seq: number, on: boolean) {
    const now = picked[register] ?? [];
    picked = { ...picked, [register]: on ? [...now, seq].slice(0, EXAMPLES_MOST) : now.filter((n) => n !== seq) };
  }

  /** What the form asks the record to write, read from every field; the draft and both buttons send the same. */
  function argsOf() {
    const examples = Object.fromEntries(Object.entries(picked).filter(([, seqs]) => seqs.length > 0));
    /* THE RAIL AS IT IS DRAWN HERE: the pages in the reader's arrangement, then the lists in theirs. */
    const arrangement = pref.read().nav ?? [];
    const shell = page.data as { nav?: { section: string; href: string; order: number }[]; lists?: { id: string }[] };
    const nav = drawnOrder(
      arrange(shell.nav ?? [], arrangement).flatMap(([, entries]) => entries),
      orderLists(shell.lists ?? [], arrangement),
    );
    return {
      ...(title.trim() ? { title: title.trim() } : {}),
      ...(version.trim() ? { version: version.trim() } : {}),
      ...(summary.trim() ? { summary: summary.trim() } : {}),
      ...(audience.trim() ? { audience: audience.trim() } : {}),
      step,
      ...(Object.keys(examples).length > 0 ? { examples } : {}),
      ...(nav.length > 0 ? { nav } : {}),
      ...(withSignals && signals.length > 0 ? { signals: [...signals] } : {}),
      ...(skillsPicked.length > 0 ? { skills: [...skillsPicked] } : {}),
    };
  }

  /* KEPT AS THE USE CASE'S SETTING, so the next share offers the version after this one. A pack installed before the
     setting existed refuses it, and the form then counts from the installed version as it did. */
  async function keepShared(shared: string | null) {
    if (!client || !own || !shared) return;
    const kept = await client.setPackConfig({ id: own.id, values: { shared_version: shared } });
    if (kept.ok) {
      lastShared = shared;
      typed = false;
    }
  }

  async function download() {
    if (!client || busy || !live) return;
    busy = true;
    wrong = null;
    try {
      const out = await exportShared(client, argsOf());
      if (!out.ok) {
        wrong = out.fix;
        return;
      }
      saveDog(out.file, out.text);
      await keepShared(/-(\d+\.\d+\.\d+)\.usecase\.json$/u.exec(out.file)?.[1] ?? null);
      toasts.push(copy.shareDownloaded(out.file, count), { intent: 'good' });
    } finally {
      busy = false;
    }
  }

  /** The same file as Download, sent to the Kennel as the signed-in person. One press sends one. */
  async function publish() {
    if (!client || busy || publishing || !live) return;
    publishing = true;
    wrong = null;
    sent = null;
    try {
      const out = await exportShared(client, argsOf());
      if (!out.ok) {
        wrong = out.fix;
        return;
      }
      const answer = await submitToKennel(kennelFetch, out.text);
      if (!answer.ok) {
        wrong = answer.fix;
        return;
      }
      const doc = JSON.parse(out.text) as { title?: unknown };
      sent = { ...answer.value, title: typeof doc.title === 'string' && doc.title !== '' ? doc.title : title.trim() };
      await keepShared(answer.value.version);
    } finally {
      publishing = false;
    }
  }

  /* ── the draft: what goes out, against what it counts on from ─────────── */

  /** Each draft carries its number, so an answer that arrives after a later one began is dropped. */
  let drafts = 0;

  /** The version this share counts on from, as text, and how the screen names it; `null` for a first version. */
  async function baselineOf(id: string | null): Promise<{ text: string; since: string } | null> {
    if (id !== null && lastShared !== null) {
      const text = await publishedText(kennelFetch, 'usecase', id, lastShared);
      if (text !== null) return { text, since: words.sinceShared(lastShared) };
    }
    const shipped = speaking === null ? null : builtInFile(speaking);
    if (speaking !== null && shipped !== null) return { text: JSON.stringify(shipped), since: words.sinceBuiltIn(useCaseName(speaking)) };
    if (id !== null && installedVersion !== null) {
      const text = await publishedText(kennelFetch, 'usecase', id, installedVersion);
      if (text !== null) return { text, since: words.sinceInstalled(installedVersion) };
    }
    return null;
  }

  async function redraft(args: ReturnType<typeof argsOf>) {
    if (!client) return;
    const mine = ++drafts;
    if (draft === null) draft = { state: 'reading' };
    /* NEVER LEFT READING: a write, a read of the last version or a diff that throws ends
       in a sentence, not in "Reading the file" for as long as the page stays open. */
    try {
      const out = await exportShared(client, args);
      if (mine !== drafts) return;
      if (!out.ok) {
        draft = { state: 'refused', fix: out.fix };
        return;
      }
      const doc = JSON.parse(out.text) as Record<string, unknown>;
      const base = await baselineOf(typeof doc.usecase === 'string' ? doc.usecase : null);
      const diff = await changesSince(base?.text ?? null, out.text);
      if (mine !== drafts) return;
      /* A FILE ITS OWN DOOR REFUSES IS SAID HERE, with the door's sentence, before anybody downloads or sends it. */
      draft = diff.ok ? { state: 'ready', doc, since: base?.since ?? null, changes: diff.changes } : { state: 'refused', fix: diff.fix };
    } catch {
      if (mine === drafts) draft = { state: 'refused', fix: words.unwritten };
    }
  }

  /* THE FILE IS WRITTEN AGAIN ONCE THE FORM RESTS. `argsOf` reads every field here, so a change to any one of them
     restarts the wait, and leaving the screen clears it. */
  $effect(() => {
    if (!client || !live) return;
    const args = argsOf();
    /* THE FIRST FILE IS WRITTEN AT ONCE: there is nothing typed to wait for, and the wait was what a reader saw. */
    const timer = setTimeout(() => void redraft(args), untrack(() => draft === null) ? 0 : DRAFT_WAIT_MS);
    return () => clearTimeout(timer);
  });

  const lines = $derived(draft?.state === 'ready' ? changeLines(draft.changes, titleOfModule) : []);
  /* THE INSTALLER'S VIEW, drawn as browse draws a use case. A file this build cannot draw is simply not drawn: the
     diff above it still says what goes out. */
  const installerView = $derived.by(() => {
    if (draft?.state !== 'ready') return null;
    try {
      const doc = { labels: {}, voice: {}, skills: [], modules: [], pack: null, ...draft.doc };
      return previewOf(doc as unknown as Parameters<typeof previewOf>[0]);
    } catch {
      return null;
    }
  });
</script>

<svelte:head><title>{titleOf(copy.shareSetup)}</title></svelte:head>

<PageHead icon="packs" kicker={copy.packs} back="/settings/addons" title={copy.shareSetup} sentence={mode === 'addon' ? addonWords.sentence : words.what} />

<div class="page">
  <Segmented class="modes" role="group" aria-label={addonWords.modeGroup} full>
    {#each [['usecase', addonWords.modeUseCase], ['addon', addonWords.modeAddon]] as const as [m, label] (m)}
      <button type="button" class="segment" aria-pressed={mode === m} data-on={mode === m ? '' : undefined} onclick={() => switchTo(m)}>{label}</button>
    {/each}
  </Segmented>
  {#if mode === 'addon'}
    <AddonFrom />
  {:else if refused}
    <Empty kind="error" title={refused} />
  {:else}
    {#if live && speaking === null}<p class="note">{copy.shareNoUseCase}</p>{/if}

    <!-- TWO COLUMNS FROM 1100: what goes in the file on the left, what it changes and how an installer sees it
         on the right; the submit row inside the last tile of the first column, primary first. -->
    <form
      class="share-form form-two"
      onsubmit={(e) => {
        e.preventDefault();
        void download();
      }}
    >
      <div class="share-col">
        <Tile class="section" data-surface="tile" title={words.about}>
          <div class="section-body">
            <div class="fields">
              <div class="pair">
                <label class="field-label" for="share-title">{copy.shareTitle}</label>
                <div class="field"><input class="field-input" id="share-title" type="text" autocomplete="off" bind:value={title} /></div>
              </div>
              <div class="pair">
                <label class="field-label" for="share-version">{copy.shareVersion}</label>
                <div class="field"><input class="field-input" id="share-version" type="text" inputmode="decimal" autocomplete="off" bind:value={version} oninput={() => (typed = true)} /></div>
                {#if lastShared}<p class="note">{copy.shareLastShared(lastShared)}</p>{:else if installedVersion}<p class="note">{copy.shareFromInstalled(installedVersion)}</p>{:else}<p class="note">{copy.shareFirstVersion}</p>{/if}
              </div>
              <fieldset class="pair steps">
                <legend class="field-label">{copy.shareStep}</legend>
                <label class="row-pick"><input type="radio" name="share-step" value="patch" checked={step === 'patch'} onchange={() => ((step = 'patch'), (typed = false))} /><span>{copy.shareStepPatch}</span></label>
                <label class="row-pick"><input type="radio" name="share-step" value="minor" checked={step === 'minor'} onchange={() => ((step = 'minor'), (typed = false))} /><span>{copy.shareStepMinor}</span></label>
              </fieldset>
              <div class="pair">
                <label class="field-label" for="share-summary">{copy.shareSummary}</label>
                <div class="field"><input class="field-input" id="share-summary" type="text" autocomplete="off" placeholder={copy.shareSummaryHint} bind:value={summary} oninput={() => (wrote = true)} /></div>
              </div>
              <div class="pair">
                <label class="field-label" for="share-audience">{copy.shareAudience}</label>
                <div class="field">
                  <input class="field-input" id="share-audience" type="text" autocomplete="off" list="share-audience-suggestions" placeholder={copy.shareAudienceHint} bind:value={audience} oninput={() => (wrote = true)} />
                </div>
                <datalist id="share-audience-suggestions">
                  {#each AUDIENCES as a (a)}<option value={copy.shareAudiences[a]}></option>{/each}
                </datalist>
              </div>
            </div>
          </div>
        </Tile>

        {#if live && own && own.registers.length > 0}
          <Tile class="section" data-surface="tile" title={copy.shareExamples}>
            <div class="section-body">
              <p class="note">{count === 0 ? copy.shareExamplesNone : copy.shareExamplesPicked(count)} {copy.shareExamplesMost}</p>
              {#each own.registers as register (register)}
                <fieldset class="rows">
                  <legend class="rows-h">{names[register] ?? listWords(register)}</legend>
                  {#each rows[register] ?? [] as row (row.seq)}
                    {@const on = (picked[register] ?? []).includes(row.seq)}
                    <label class="row-pick">
                      <input type="checkbox" checked={on} disabled={!on && (picked[register]?.length ?? 0) >= EXAMPLES_MOST} onchange={(e) => toggle(register, row.seq, e.currentTarget.checked)} />
                      <span>{row.title}</span>
                    </label>
                  {:else}
                    <p class="note">{copy.shareNoRows}</p>
                  {/each}
                </fieldset>
              {/each}
            </div>
          </Tile>
        {/if}

        <Tile class="section" data-surface="tile" title={words.send}>
          <div class="section-body">
            <p class="note">{copy.shareRailOrder}</p>
            {#if signals.length > 0}
              <label class="row-pick"><input type="checkbox" bind:checked={withSignals} /><span>{words.signals([...signals])}</span></label>
            {/if}
            <!-- THE SKILLS BEHIND ONE LINE THAT COUNTS THEM, shut until opened. -->
            <details class="skills-pick">
              <summary class="rows-h tap">{words.skillsPicked(skillsPicked.length, skillRows.length)}</summary>
            <fieldset class="rows">
              <legend class="note">{words.skillsWhy}</legend>
              {#each skillRows as skill (skill.seq)}
                <label class="row-pick">
                  <input
                    type="checkbox"
                    checked={skillsPicked.includes(skill.seq)}
                    onchange={(e) => (skillsPicked = e.currentTarget.checked ? [...skillsPicked, skill.seq] : skillsPicked.filter((n) => n !== skill.seq))}
                  />
                  <span class="pick-text">
                    <span data-own>{skill.title}</span>
                    {#if skill.trigger}<span class="pick-detail" data-own>{skill.trigger}</span>{/if}
                  </span>
                </label>
              {:else}
                <p class="note">{copy.shareNoSkills}</p>
              {/each}
            </fieldset>
            </details>
          </div>
          {#if wrong}<p class="wrong" role="alert">{wrong}</p>{/if}
          {#if sent}
            <p class="sent" role="status">{publishedSaid(sent)} <a href={at(publishedHref(sent))}>{publishedLink(sent)}</a></p>
          {/if}
          <div class="actions form-submit">
            <Button weight="primary" type="submit" disabled={busy || !live}>{copy.shareDownload}</Button>
            <Button disabled={publishing || !live} aria-busy={publishing ? 'true' : undefined} onclick={() => void publish()}>
              {publishing ? publishWords.publishing : publishWords.publish}
            </Button>
          </div>
        </Tile>
      </div>

      {#if draft}
        <div class="share-col">
          <Tile icon="refresh" title={draft.state === 'ready' && draft.since !== null ? words.changesSince(draft.since) : words.changesFirst} count={draft.state === 'ready' && lines.length > 0 ? lines.length : undefined}>
            {#if draft.state === 'reading'}
              <p class="note" role="status">{words.drafting}</p>
            {:else if draft.state === 'refused'}
              <p class="note">{draft.fix}</p>
            {:else}
              {#if draft.since === null}<p class="note">{words.firstAll}</p>{/if}
              {#if lines.length > 0}
                <ul class="changes">
                  {#each lines as line, i (i)}<li>{line}</li>{/each}
                </ul>
              {:else if draft.since !== null}
                <p class="note">{words.noChanges}</p>
              {/if}
            {/if}
          </Tile>
          {#if installerView}
            <Tile icon="eye" title={words.installer}>
              <Preview preview={installerView} large />
            </Tile>
          {/if}
        </div>
      {/if}
    </form>
  {/if}
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
    padding: var(--page-head-gap) var(--gutter) var(--page-bottom);
  }

  /* THE TWO KINDS OF FILE TAKE THEIR WORDS' WIDTH, never a grey band across the page (agents F27). */
  :global(.segmented.modes) {
    align-self: start;
    inline-size: fit-content;
    max-inline-size: 100%;
  }

  /* ON A PHONE THE PAGE'S OWN CONTROL, THE WHOLE WIDTH: at its words' width the second
     choice wrapped under the first. */
  @media (width < 640px) {
    :global(.segmented.modes) {
      inline-size: 100%;
    }
  }

  .note {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  /* ONE COLUMN, EVERY FIELD THE SAME WIDTH: the page runs the whole window and the fields keep the reading measure
     inside it, so a title box is never 1,600 wide. Groups sit 28 apart, so each reads as its own heading and what it
     heads. */
  .share-form {
    align-items: start;
    min-inline-size: 0;
  }

  /* EACH COLUMN IS ITS TILES, 20 apart; the second is what the file changes and how an installer sees it. */
  .share-col {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
    min-inline-size: 0;
  }

  .fields {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    max-inline-size: var(--measure);
    padding-block-start: var(--sp-2);
  }

  /* A FIELD'S LABEL ABOVE IT, 8 apart. */
  .pair {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  .pair .field-label {
    margin: 0;
  }

  .steps {
    display: flex;
    flex-wrap: wrap;
    gap: 0 var(--sp-4);
    margin: 0;
    padding: 0;
    border: 0;
  }

  .steps legend {
    inline-size: 100%;
    padding: 0;
  }

  .rows {
    display: flex;
    flex-direction: column;
    margin: var(--sp-3) 0 0;
    padding: 0;
    border: 0;
  }

  .rows-h {
    padding: 0;
    margin-block-end: var(--sp-1);
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 600;
    line-height: var(--lead-ui);
  }

  /* A PICK IS A ROW: the box, then its words, 44 tall so the whole row is the target. */
  .row-pick {
    display: flex;
    align-items: flex-start;
    padding-block: var(--sp-2);
    gap: var(--sp-3);
    min-block-size: var(--tap);
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: var(--lead-ui);
  }

  /* THE WORDS SIT BESIDE THE BOX, never under it, and a pick has air above it and the disclosure below. */
  .row-pick > span {
    flex: 1;
    min-inline-size: 0;
  }

  .row-pick input {
    flex: none;
    margin-block-start: 2px;
  }

  .skills-pick {
    margin-block-start: var(--sp-3);
  }

  /* THE DISCLOSURE DRAWS ITS OWN ARROW, not the browser's black triangle. */
  .skills-pick > summary {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    list-style: none;
    cursor: pointer;
  }

  .skills-pick > summary::-webkit-details-marker {
    display: none;
  }

  .skills-pick > summary::after {
    content: '';
    inline-size: 7px;
    block-size: 7px;
    border: solid var(--ink-3);
    border-width: 0 1.5px 1.5px 0;
    transform: rotate(45deg);
    margin-block-end: 3px;
  }

  .skills-pick[open] > summary::after {
    transform: rotate(225deg);
    margin-block-end: -3px;
  }

  .pick-text {
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
  }

  .pick-detail {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  /* WHAT CHANGES, ONE LINE EACH, a hairline between two. */
  .changes {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: var(--lead-ui);
  }

  .changes li {
    padding-block: var(--sp-2);
  }

  .changes li + li {
    border-block-start: 1px solid var(--rule);
  }

  .wrong {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
  }

  /* The answer is one sentence, and its link is ink and underlined: red is never a link here. */
  .sent {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    overflow-wrap: anywhere;
  }

  .sent a {
    color: var(--ink);
    text-decoration: underline;
  }

  /* THE SUBMIT ROW AT THE FOOT OF THE LAST TILE (`.form-submit`), 24 under what it sends. */
  .actions {
    margin-block-start: var(--sp-5);
  }

</style>
