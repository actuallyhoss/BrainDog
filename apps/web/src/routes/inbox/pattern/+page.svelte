<!--
  The ingest pattern builder: a rule made from a few messages that arrived alike, by
  pointing at the words in them, never by writing a pattern.

  THE FLOW BY WHICH THE INBOX LEARNS A SENDER ONCE: what arrived, what the rule reads from it, and what it would take.
  The sample is shown in a tile, and the try is a tile too, with the samples it takes as cells and each field's reads
  as bars, so the answer is seen before it is saved. Fields are the soft wells, and one ink primary.

  FOUR SCREENS IN ONE PLACE. Samples (a counter, a paste box, the list the rows go to); what it reads (a column per
  sample, a row per field, the typed value in each cell and a `3/3` chip per field, and the match as a sentence of
  conditions); point at it (select the words in a sample and pick a way to find them again, scored against every
  sample by `anchorsFor`, or add another way, a fallback, or a condition); try and save (`tryPattern`, then the save).

  AN OWNER'S SAVE INSTALLS THE RULE AT `proposed`, so what it reads waits in Needs you as rowsets, the holding tray the
  kernel already has, until she presses "Trust it now". Anybody else's save files a `pattern` proposal.

  OPENED FROM TWO PLACES, both by address: an Inbox group ("Make a rule from these", its arrivals as `samples`) and a
  `pattern` proposal in Needs you ("Open in the builder", its samples and the ingest it proposes).
-->
<script lang="ts">
  import { apiBase, at } from '$lib/at.ts';
  import { untrack } from 'svelte';
  import { page as route } from '$app/state';
  import { goto } from '$app/navigation';
  import { titleOf } from '$lib/title.ts';
  import { humanize } from '$lib/record/names.ts';
  import { may } from '$lib/record/may.ts';
  import type { Shell } from '$lib/record/boot-live.ts';
  import { schemaOf } from '$lib/record/page-write.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Waiting from '$lib/ui/Waiting.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Chip from '$lib/ui/Chip.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import Bars from '$lib/viz/Bars.svelte';
  import Segments from '$lib/viz/Segments.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { closed, opened } from '$lib/ui/screen.svelte.ts';
  import SampleText from '$lib/pattern/SampleText.svelte';
  import FieldTable from '$lib/pattern/FieldTable.svelte';
  import Segmented from '$lib/ui/Segmented.svelte';
  import { anchorsFor, install, readSamples, suggest, tryPattern, type Anchor, type Sample, type Tried } from '$lib/pattern/api.ts';
  import {
    ASKS,
    TESTS,
    draftOf,
    fallbackValue,
    freshDraft,
    openedFrom,
    takesFallback,
    withAnotherWay,
    withCondition,
    withFallback,
    withReading,
    withoutReading,
    type Ask,
    type Condition,
    type Draft,
    type Test,
  } from '$lib/pattern/draft.ts';
  import { readingSaid, valueSaid, words } from '$lib/pattern/words.ts';

  /** The most samples a rule is made from, as `tryPattern` and `POST /api/slash/pattern` take them. */
  const SAMPLES_MOST = 10;
  /** The most characters of a pasted message, as `tryPattern` takes it. */
  const PASTED_CHARS_MOST = 20_000;

  /** The unit beside the figure of what the rule takes: this screen's own words, as the builder's are `words.ts`'s. */
  const takenOf = (n: number): string => `of ${n.toLocaleString('en-GB')} taken`;

  const shell = $derived(route.data as unknown as Shell);
  const owner = $derived(may(shell, 'owner'));
  const lists = $derived<readonly { id: string; name: string }[]>(shell.lists ?? []);
  const asked = untrack(() => openedFrom(route.url.searchParams, SAMPLES_MOST));

  let samples = $state.raw<Sample[]>([]);
  let missing = $state(0);
  let loadFix = $state<string | null>(null);
  let loaded = $state(false);
  let cantOpen = $state(false);
  let draft = $state.raw<Draft | null>(null);
  let step = $state<1 | 2 | 3 | 4>(1);
  let index = $state(0);
  let pasted = $state(0);
  let pasteText = $state('');

  /* THE SAMPLES, READ ONCE, and a proposal's ingest opened as a draft. `load` is also Retry. */
  function load() {
    const mark = opened();
    let ok = false;
    loadFix = null;
    void readSamples(apiBase(), asked.samples)
      .then((out) => {
        if (!out.ok) return void (loadFix = out.fix);
        samples = out.value.samples;
        missing = out.value.missing;
        if (asked.ingest !== undefined) {
          const made = draftOf(asked.ingest, Date.now());
          if (made === null) cantOpen = true;
          else {
            draft = made;
            step = 2;
          }
        }
        loaded = true;
        ok = true;
      })
      .finally(() => closed(ok, mark));
  }
  $effect(() => untrack(load));

  /* THE FIELDS OF THE LIST THE RULE WRITES INTO, with their names and types, read when the list is picked. */
  type FieldSpec = { id: string; label: string; type: string | undefined };
  let fields = $state.raw<FieldSpec[]>([]);
  const register = $derived(draft?.register ?? '');
  $effect(() => {
    const into = register;
    if (!into) return;
    void schemaOf(apiBase(), into).then((d) => {
      if (into !== register || !d) return;
      fields = d.fields.map((f) => {
        const said = f as { id: string; label?: unknown; type?: unknown };
        return { id: said.id, label: typeof said.label === 'string' && said.label ? said.label : humanize(said.id), type: typeof said.type === 'string' ? said.type : undefined };
      });
    });
  });
  const labelOf = (field: string): string => fields.find((f) => f.id === field)?.label ?? humanize(field);
  const typeOf = (field: string): string | undefined => fields.find((f) => f.id === field)?.type;
  const unread = $derived(fields.filter((f) => !(draft?.readings ?? []).some((r) => r.field === f.id)));

  function pickList(id: string) {
    if (!id) return;
    draft = draft === null ? freshDraft(samples, id, Date.now()) : { ...draft, register: id, readings: draft.register === id ? draft.readings : [] };
  }

  /* THE DRY RUN, again on every change while its answer is on screen. A later answer replaces an earlier one only if it
     is the answer to the latest change, so a slow try never draws over a newer one. */
  let tried = $state.raw<Tried | null>(null);
  let tryFix = $state<string | null>(null);
  let tries = 0;
  $effect(() => {
    const d = draft;
    const s = samples;
    if (d === null || s.length === 0 || (step !== 2 && step !== 4)) return;
    const mine = ++tries;
    void tryPattern(apiBase(), d, s).then((out) => {
      if (mine !== tries) return;
      tried = out.ok ? out.value : null;
      tryFix = out.ok ? null : out.fix;
    });
  });
  const claimed = $derived(tried ? tried.claims.filter(Boolean).length : 0);

  /* SCREEN 1: the pager and the paste box. */
  const current = $derived(samples[Math.min(index, Math.max(0, samples.length - 1))]);
  function addPasted() {
    const body = pasteText.trim();
    if (!body || samples.length >= SAMPLES_MOST) return;
    samples = [...samples, { key: `paste:${pasted++}`, channel: null, from: '', subject: '', body: body.slice(0, PASTED_CHARS_MOST) }];
    pasteText = '';
    index = samples.length - 1;
  }
  function removeSample(key: string) {
    samples = samples.filter((s) => s.key !== key);
    index = Math.max(0, Math.min(index, samples.length - 1));
  }
  const nameOf = (s: Sample, i: number): string => (s.key.startsWith('paste:') ? words.pastedFrom : s.from || words.sampleOf(i + 1, samples.length));

  /* SCREEN 3: one field, a selection in one sample, and the ways to find it again. */
  let pointing = $state<string | null>(null);
  let picked = $state<{ sample: string; start: number; end: number; text: string } | null>(null);
  let anchors = $state.raw<Anchor[] | null>(null);
  let anchorFix = $state<string | null>(null);
  let finding = $state(false);
  let fallback = $state('');
  const hasReading = $derived(pointing !== null && (draft?.readings ?? []).some((r) => r.field === pointing));

  function point(field: string) {
    pointing = field;
    picked = null;
    anchors = null;
    anchorFix = null;
    fallback = '';
    step = 3;
  }
  async function find() {
    const sel = picked;
    const field = pointing;
    if (!sel || !field || finding) return;
    finding = true;
    anchorFix = null;
    try {
      const out = await anchorsFor(apiBase(), samples, { sample: sel.sample, field, start: sel.start, end: sel.end, type: typeOf(field) });
      anchors = out.ok ? out.value : [];
      anchorFix = out.ok ? null : out.fix;
    } finally {
      finding = false;
    }
  }
  function use(a: Anchor, another: boolean) {
    if (!draft || !pointing) return;
    draft = another ? withAnotherWay(draft, pointing, a.how) : withReading(draft, pointing, a.how);
    step = 2;
  }
  function addFallback() {
    if (!draft || !pointing) return;
    const value = fallbackValue(fallback, typeOf(pointing));
    if (value === null) return;
    draft = withFallback(draft, pointing, value);
    step = 2;
  }
  function narrow() {
    if (!draft || !picked) return;
    draft = withCondition(draft, { ask: 'body', test: 'contains', value: picked.text.trim() });
    step = 2;
  }

  /* THE MATCH, as a sentence of conditions the person edits in place. */
  function setCondition(i: number, patch: Partial<Condition>) {
    if (!draft || draft.conditions === null) return;
    draft = { ...draft, conditions: draft.conditions.map((c, j) => (j === i ? { ...c, ...patch } : c)) };
  }
  function addCondition() {
    if (!draft) return;
    draft = { ...draft, conditions: [...(draft.conditions ?? []), { ask: 'body', test: 'contains', value: '' }], match: null };
  }
  function dropCondition(i: number) {
    if (!draft || draft.conditions === null) return;
    draft = { ...draft, conditions: draft.conditions.filter((_, j) => j !== i) };
  }

  /* SCREEN 4: the save. One press at a time, and the owner's "Trust it now" after it. */
  let saving = $state(false);
  let saved = $state<'installed' | 'trusted' | 'suggested' | null>(null);
  let saveFix = $state<string | null>(null);
  const froms = $derived([...new Set(samples.map((s) => s.from).filter(Boolean))]);
  async function save() {
    if (!draft || saving) return;
    if (!owner && samples.every((s) => s.key.startsWith('paste:'))) return void (saveFix = words.needsSample);
    saving = true;
    saveFix = null;
    try {
      if (owner) {
        const out = await install(apiBase(), draft, 'proposed');
        if (!out.ok) saveFix = out.fix;
        else {
          draft = { ...draft, confidence: 'proposed' };
          saved = 'installed';
        }
      } else {
        const out = await suggest(apiBase(), draft, samples, words.question(froms.length === 1 ? froms[0]! : ''));
        if (!out.ok) saveFix = out.fix;
        else if (out.value !== null) await goto(at(`/decide/${encodeURIComponent(out.value)}`));
        else saved = 'suggested';
      }
    } finally {
      saving = false;
    }
  }
  async function trust() {
    if (!draft || saving) return;
    saving = true;
    try {
      const out = await install(apiBase(), draft, 'exact');
      if (!out.ok) toasts.push(out.fix, { intent: 'warn' });
      else {
        draft = { ...draft, confidence: 'exact' };
        saved = 'trusted';
      }
    } finally {
      saving = false;
    }
  }

  const reachable = (n: 1 | 2 | 3 | 4): boolean => n === 1 || (draft !== null && (n !== 3 || pointing !== null));
</script>

<svelte:head><title>{titleOf(words.title)}</title></svelte:head>

<PageHead title={words.title} kicker={words.kicker} back="/inbox" sentence="" />

<div class="page">
  {#if loadFix !== null}
    <Empty kind="error" title={words.unreached} detail={loadFix}>
      {#snippet actions()}<Button weight="primary" onclick={load}>{words.retry}</Button>{/snippet}
    </Empty>
  {:else if !loaded}
    <Waiting rows={4} />
  {:else if cantOpen}
    <Empty kind="no-data-yet" title={words.cantOpen}>
      {#snippet actions()}<Button weight="primary" href="/inbox">{words.toInbox}</Button>{/snippet}
    </Empty>
  {:else}
    <!-- THE FOUR STEPS AS ONE SEGMENTED CONTROL on the ground: the step in hand is the white pill, and a step not yet
         reachable is words that do not press. -->
    <nav class="steps" aria-label={words.title}>
      <Segmented tag="ol" class="steps-track">
        {#each words.steps as name, i (name)}
          {@const n = (i + 1) as 1 | 2 | 3 | 4}
          <li>
            <button
              type="button"
              class="segment step"
              aria-current={step === n ? 'step' : undefined}
              data-on={step === n ? '' : undefined}
              disabled={!reachable(n)}
              onclick={() => (step = n)}
            >
              <span class="step-n num">{n}</span>{name}
            </button>
          </li>
        {/each}
      </Segmented>
    </nav>

    {#if missing > 0}<p class="note">{words.missing(missing)}</p>{/if}

    {#if step === 1}
      <section class="screen" aria-label={words.steps[0]}>
        <!-- WHAT ARRIVED, ONE SAMPLE AT A TIME, in a tile: who sent it, its subject, and its words as plain text, with the
             pager in the tile's heading. -->
        {#if current}
          <Tile icon="inbox" title={words.steps[0]} count={samples.length}>
            {#snippet actions()}
              <Button size="sm" disabled={index === 0} onclick={() => (index -= 1)}>{words.previous}</Button>
              <span class="counter num" aria-live="polite">{words.sampleOf(index + 1, samples.length)}</span>
              <Button size="sm" disabled={index >= samples.length - 1} onclick={() => (index += 1)}>{words.next}</Button>
            {/snippet}
            <div class="sample">
              <p class="sample-from">{nameOf(current, index)}</p>
              {#if !current.key.startsWith('paste:')}<p class="sample-subject">{current.subject || words.noSubject}</p>{/if}
              <p class="sample-body">{current.body}</p>
            </div>
            <div><Button weight="bare" size="sm" onclick={() => removeSample(current.key)}>{words.removeSample}</Button></div>
          </Tile>
        {:else}
          <!-- NO MESSAGE PICKED YET: the paste box below starts a rule as well as a group in the Inbox does. -->
          <p class="note">{words.noSamplesBody} <a href={at('/inbox')}>{words.toInbox}</a></p>
        {/if}

        <div class="form-row">
          <label class="field-label" for="pattern-paste">{words.pasteLabel}</label>
          <textarea id="pattern-paste" class="paste" rows="4" maxlength={PASTED_CHARS_MOST} bind:value={pasteText} disabled={samples.length >= SAMPLES_MOST}></textarea>
          <p class="help">{samples.length >= SAMPLES_MOST ? words.samplesMost(SAMPLES_MOST) : words.pasteHelp}</p>
          <div><Button disabled={pasteText.trim() === '' || samples.length >= SAMPLES_MOST} onclick={addPasted}>{words.pasteAdd}</Button></div>
        </div>

        <div class="form-row">
          <label class="field-label" for="pattern-into">{words.intoLabel}</label>
          <select id="pattern-into" class="select" value={register} onchange={(e) => pickList(e.currentTarget.value)}>
            <option value="" disabled>{words.intoPick}</option>
            {#each lists as l (l.id)}<option value={l.id}>{l.name}</option>{/each}
          </select>
        </div>
      </section>
    {:else if step === 2 && draft}
      <section class="screen" aria-labelledby="pattern-reads">
        <h2 id="pattern-reads" class="screen-title">{words.steps[1]}</h2>

        <div class="match">
          {#if draft.conditions === null}
            <p class="match-lead">{words.matchKept}</p>
            <div><Button onclick={() => draft && (draft = { ...draft, conditions: [], match: null })}>{words.matchReplace}</Button></div>
          {:else}
            <p class="match-lead">{draft.conditions.length === 0 ? words.matchAny : words.matchLead}</p>
            <ul class="conditions">
              {#each draft.conditions as c, i (i)}
                <li class="condition">
                  {#if i > 0}<span class="and">{words.matchAnd}</span>{/if}
                  <select class="select" aria-label={words.conditionAsk} value={c.ask} onchange={(e) => setCondition(i, { ask: e.currentTarget.value as Ask })}>
                    {#each ASKS as a (a)}<option value={a}>{words.asks[a]}</option>{/each}
                  </select>
                  <select class="select" aria-label={words.conditionTest} value={c.test} onchange={(e) => setCondition(i, { test: e.currentTarget.value as Test })}>
                    {#each TESTS as t (t)}<option value={t}>{words.tests[t]}</option>{/each}
                  </select>
                  <input class="input" aria-label={words.conditionValue} value={c.value} oninput={(e) => setCondition(i, { value: e.currentTarget.value })} />
                  <Button weight="bare" onclick={() => dropCondition(i)}>{words.removeCondition}</Button>
                </li>
              {/each}
            </ul>
            <div><Button onclick={addCondition}>{words.addCondition}</Button></div>
          {/if}
          {#if tried}<Chip label={words.takes(claimed, samples.length)} tone={claimed === samples.length ? 'good' : claimed === 0 ? 'bad' : 'warn'} />{/if}
        </div>

        {#if tryFix}<p class="fix" role="alert">{tryFix}</p>{/if}
        {#if draft.readings.length === 0}
          <p class="note">{words.noReadings}</p>
        {:else}
          <FieldTable {samples} readings={draft.readings} {tried} {labelOf} onchange={point} onremove={(f) => draft && (draft = withoutReading(draft, f))} />
        {/if}

        {#if unread.length > 0}
          <div class="form-row">
            <label class="field-label" for="pattern-add">{words.addField}</label>
            <select id="pattern-add" class="select" value="" onchange={(e) => e.currentTarget.value && point(e.currentTarget.value)}>
              <option value="" disabled>{words.addFieldPick}</option>
              {#each unread as f (f.id)}<option value={f.id}>{f.label}</option>{/each}
            </select>
          </div>
        {/if}
      </section>
    {:else if step === 3 && draft && pointing}
      {@const field = pointing}
      <section class="screen" aria-labelledby="pattern-point">
        <h2 id="pattern-point" class="screen-title">{labelOf(field)}</h2>
        <p class="note">{words.selectLead(labelOf(field).toLowerCase())} {words.selectHelp}</p>
        {#if current}
          <div class="pager">
            <Button size="sm" disabled={index === 0} onclick={() => ((index -= 1), (picked = null))}>{words.previous}</Button>
            <span class="counter num" aria-live="polite">{words.sampleOf(index + 1, samples.length)}</span>
            <Button size="sm" disabled={index >= samples.length - 1} onclick={() => ((index += 1), (picked = null))}>{words.next}</Button>
          </div>
          {#key current.key}
            <SampleText body={current.body} label={nameOf(current, index)} onselect={(p) => (picked = { sample: current.key, ...p })} />
          {/key}
        {/if}

        {#if anchorFix}<p class="fix" role="alert">{anchorFix}</p>{/if}
        {#if anchors !== null}
          <h3 class="sub">{words.candidates}</h3>
          {#if anchors.length === 0}
            <p class="note">{words.noCandidates}</p>
          {:else}
            <ul class="anchors">
              {#each anchors as a, i (i)}
                <li class="anchor">
                  <div class="anchor-main">
                    <span class="anchor-said">{readingSaid(a.how)}</span>
                    <span class="anchor-value">{valueSaid(a.value)}</span>
                  </div>
                  <Chip label={words.readsOf(a.hits, a.of)} tone={a.hits === a.of ? 'good' : 'warn'} />
                  <div class="anchor-acts">
                    <Button size="sm" onclick={() => use(a, false)}>{words.use}</Button>
                    {#if hasReading}<Button size="sm" weight="bare" onclick={() => use(a, true)}>{words.anotherWay}</Button>{/if}
                  </div>
                </li>
              {/each}
            </ul>
          {/if}
        {/if}

        {#if picked}
          <div><Button onclick={narrow}>{words.narrow(picked.text.trim().slice(0, 40))}</Button></div>
        {/if}

        {#if hasReading && takesFallback(typeOf(field))}
          <div class="form-row">
            <label class="field-label" for="pattern-fallback">{words.fallbackLabel(labelOf(field).toLowerCase())}</label>
            <input id="pattern-fallback" class="input" bind:value={fallback} />
            <div><Button disabled={fallbackValue(fallback, typeOf(field)) === null} onclick={addFallback}>{words.fallbackAdd}</Button></div>
          </div>
        {/if}
      </section>
    {:else if step === 4 && draft}
      <section class="screen" aria-label={words.tryLead}>
        {#if tryFix}<p class="fix" role="alert">{tryFix}</p>{/if}
        <!-- WHAT IT CLAIMED, in a tile: one cell a sample, ink for each it takes, and each field's reads as bars on the
             same scale, with the line that says it. Bars before the answer, and nothing made up while it is out. -->
        <Tile icon="check" title={words.tryLead}>
          {#if tried}
            <p class="figure num">{claimed}<span class="figure-unit">{takenOf(samples.length)}</span></p>
            <Segments total={samples.length} done={claimed} subject={words.tryLead} />
            {#if tried.fields.length > 0}
              <Bars
                items={tried.fields.map((f) => ({ label: labelOf(f.field), value: f.cells.filter((c) => c.ok).length, tone: f.cells.every((c) => c.ok) ? 'ink' : undefined }))}
                max={samples.length}
                format={(n) => `${n} of ${samples.length}`}
                summary={tried.fields.map((f) => words.fieldRead(labelOf(f.field), f.cells.filter((c) => c.ok).length, samples.length)).join('; ')}
              />
            {/if}
            <!-- NO SENTENCE UNDER THE FIGURE: "It takes 3 of 4 messages." said the figure and the bar a third time (3 Nov). -->
          {:else if !tryFix}
            <Waiting rows={2} />
          {/if}
        </Tile>
        {#if saved === 'installed' || saved === 'trusted'}
          <p class="summary" role="status">{saved === 'trusted' ? words.trustedNote : words.saved}</p>
          <p class="note">{tried?.waited ? words.accepted(tried.waited.accepted, tried.waited.of) : words.noneYet}</p>
        {:else if saved === 'suggested'}
          <p class="summary" role="status">{words.suggested}</p>
        {/if}
        {#if saveFix}<p class="fix" role="alert">{saveFix}</p>{/if}
      </section>
    {/if}

    <!-- THE STEP'S ACTIONS, in one bar: at the foot of the screen at a desk, and floating as glass above the tab bar on a
         phone, where every one is a 44px button. One ink primary. -->
    <div class="bar">
      {#if step === 1}
        {#if !draft}<span class="bar-note">{words.needsList}</span>{/if}
        <Button weight="primary" disabled={!draft || samples.length === 0} onclick={() => (step = 2)}>{words.toTable}</Button>
      {:else if step === 2}
        <Button weight="bare" onclick={() => (step = 1)}>{words.back}</Button>
        <Button weight="primary" disabled={!draft || draft.readings.length === 0} onclick={() => (step = 4)}>{words.toTry}</Button>
      {:else if step === 3}
        <Button weight="bare" onclick={() => (step = 2)}>{words.back}</Button>
        <Button weight="primary" disabled={!picked || finding} onclick={find}>
          {finding ? words.finding : picked ? words.find(picked.text.trim().slice(0, 24)) : words.pointAt}
        </Button>
      {:else if step === 4}
        <Button weight="bare" onclick={() => (step = 2)}>{words.back}</Button>
        {#if saved === 'installed'}
          <Button weight="primary" disabled={saving} onclick={trust}>{words.trust}</Button>
        {:else if saved === null}
          <Button weight="primary" disabled={saving || !draft || draft.readings.length === 0} onclick={save}>
            {saving ? words.saving : owner ? words.save : words.suggest}
          </Button>
        {/if}
      {/if}
    </div>
  {/if}
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
    padding: var(--page-head-gap) var(--gutter) var(--page-bottom);
  }

  /* THE STEPS: the house segmented control, at its own width, its numbers in the quiet ink. The track is the part's
     element, so the rule reaches it by the name this page gave it. */
  .steps :global(.steps-track) {
    inline-size: fit-content;
    max-inline-size: 100%;
  }

  .step {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
  }

  .step:disabled {
    color: var(--ink-3);
    cursor: default;
  }

  .step-n {
    color: var(--ink-3);
    font-variant-numeric: tabular-nums;
  }

  .screen {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    min-inline-size: 0;
  }

  .screen-title {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-head);
    font-weight: 600;
    line-height: calc(24px * var(--type, 1));
  }

  .sub {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: 500;
    line-height: calc(18px * var(--type, 1));
  }

  .note,
  .help,
  .bar-note {
    margin: 0;
    max-inline-size: var(--measure);
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: calc(18px * var(--type, 1));
  }

  .fix {
    margin: 0;
    color: var(--red);
    font-size: var(--fs-meta);
    font-weight: 500;
  }

  .summary {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
  }

  .pager {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
  }

  .counter {
    color: var(--ink-2);
    font-size: var(--fs-meta);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  /* THE SAMPLE, INSIDE ITS TILE: who sent it, the subject in the meta ink, and the words as they came. */
  .sample {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
  }

  .sample-from {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 500;
    overflow-wrap: anywhere;
  }

  .sample-subject {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    overflow-wrap: anywhere;
  }

  .sample-body {
    max-block-size: 40dvh;
    margin: var(--sp-2) 0 0;
    overflow-y: auto;
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: 1.6;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  /* THE FIGURE AND THE LINE THAT READS THE CHART. */
  .figure {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    column-gap: var(--sp-2);
    margin: 0;
    color: var(--ink);
    font-family: var(--font-display);
    font-size: var(--fs-figure);
    font-weight: 600;
    line-height: calc(34px * var(--type, 1));
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
  }

  .figure-unit {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: 500;
    line-height: calc(18px * var(--type, 1));
    letter-spacing: 0;
  }

  /* A FIELD IS A SOFT WELL: 40 tall, `--tile-2`, no border, radius 12, its label above it. */
  .form-row {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    max-inline-size: var(--measure);
  }

  .form-row .field-label {
    margin: 0;
  }

  .paste,
  .input,
  .select {
    box-sizing: border-box;
    min-block-size: 40px;
    padding: var(--sp-2) var(--sp-3);
    background-color: var(--tile-2);
    border: 0;
    border-radius: var(--r-pop);
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-body);
  }

  .paste {
    resize: vertical;
    line-height: 1.5;
  }

  .match {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--sp-2);
  }

  .match-lead {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
  }

  .conditions {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .condition {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
  }

  .and {
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  /* THE WAYS TO FIND IT, AS ROWS ON THE GROUND with a hairline between them and no box round them. */
  .anchors {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .anchor {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2) var(--sp-3);
    min-block-size: var(--row-h-2);
    padding: var(--sp-2) 0;
  }

  .anchor + .anchor {
    border-block-start: 1px solid var(--rule);
  }

  .anchor-main {
    display: flex;
    flex: 1 1 16ch;
    flex-direction: column;
    gap: 2px;
    min-inline-size: 0;
  }

  .anchor-said {
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 500;
    overflow-wrap: anywhere;
  }

  .anchor-value {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    overflow-wrap: anywhere;
  }

  .anchor-acts {
    display: flex;
    gap: calc(6px * var(--dense, 1));
  }

  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: var(--sp-2) var(--sp-3);
    padding-block-start: var(--sp-3);
  }


  /* ON A PHONE THE BAR FLOATS AS GLASS UNDER THE THUMB, above the tab bar, and every action in it is 44px
     and shares the width. */
  @media (width < 640px) {
    .bar {
      position: sticky;
      inset-block-end: calc(var(--tabbar) + var(--sp-3));
      z-index: var(--z-raise);
      padding: calc(6px * var(--dense, 1));
      background: var(--tile);
      border-radius: var(--r-tile);
      border: 1px solid var(--rule-strong);
    }


    .bar-note {
      flex-basis: 100%;
      padding: var(--sp-1) var(--sp-2) 0;
    }

    .bar :global(.btn) {
      flex: 1 1 0;
      min-block-size: var(--tap);
    }

    .anchor-acts :global(.btn),
    .pager :global(.btn) {
      min-block-size: var(--tap);
    }
  }

  @media (forced-colors: active) {
    .bar {
      border: 1px solid CanvasText;
    }
  }

  /* A THUMB NEEDS 44px on every press: the menus, and the way back to the Inbox under no message picked yet. */
  @media (pointer: coarse) {
    .paste,
    .input,
    .select {
      min-block-size: var(--tap);
    }

    .note a {
      display: inline-flex;
      align-items: center;
      min-block-size: var(--tap);
    }
  }
</style>
