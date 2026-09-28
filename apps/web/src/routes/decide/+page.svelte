<!--
  Every open question, ranked by the COST OF BEING WRONG — never by age.

  Ranking by age is what turns a decision queue into a backlog: the oldest question is usually the
  one nobody has needed to answer. Ranking by what deciding late costs puts the expensive one first
  and makes the order arguable, which is the point (19 §2).

  THE OPTIONS ON A CARD ARE THE ANSWER. One press picks it, and the reason that sends it is asked for after it.
  A card cannot hold a button inside its link, so the anchor and the verbs are SIBLINGS under one
  item, as `RowCards.svelte` does for the register.

  AND IT IS A QUEUE, CLEARED FROM THE KEYBOARD (DESIGN-SYSTEM appendix D). A cursor moves with `j`
  and `k`; a number answers with that option, `a` with the suggested one, `d` defers on the gate, `x`
  selects for one answer to several, and Enter opens the question. Inside a reason, `⌘↵` sends it and
  Esc goes back to the list. A question decided here stays in its place as one line.

  `/decide/<id>` KEEPS EVERYTHING IT HAD. It is where a decision is examined: the cost, the option
  bodies, the recommendation, the defer with its wake date, and a commit that takes a named decider
  and a written reason and cannot be edited afterwards.
-->
<script lang="ts">
  import { apiBase, at } from '$lib/at.ts';
  import { titleOf } from '$lib/title.ts';
  import { tick, untrack } from 'svelte';
  import { page as route } from '$app/state';
  import { goto, invalidateAll } from '$app/navigation';
  import { queueCost, since, symbolText } from 'braindog-render';
  import { copy } from '$lib/copy.ts';
  import { said } from '$lib/voice.svelte.ts';
  import { DOM_CAP } from '$lib/record/api.ts';
  import { targetLine } from '$lib/record/metrics.ts';
  import Changes from './[id]/Changes.svelte';
  import Proposed from './[id]/Proposed.svelte';
  import Arranged from './[id]/Arranged.svelte';
  import Applied from './[id]/Applied.svelte';
  import { updatesOf } from './[id]/changes.ts';
  import { proposedOf } from './[id]/proposed.ts';
  import { appliedLines, arrangedOf, isArranging, partialOf, type Partial } from './[id]/arranged.ts';
  import { answerFor, optionsOf, reasonState, record, setReason, withdraw, type Answer } from '$lib/record/answer.ts';
  import { mayAnswer, whyNotAnswering } from './answering.ts';
  import { dayWord, readViews, WORDS, type Views } from './views.ts';
  import { groupedAddress, groupingOf, type Grouping } from './grouping.ts';
  import type { Shell } from '$lib/record/boot-live.ts';
  import { keepDecided, olderDecisions, plainOf, readQueue, type Queue } from '$lib/record/governance.ts';
  import { answerQuestion } from '$lib/record/decide-write.ts';
  import { covered, silenced, typing } from '$lib/a11y/keys.svelte.ts';
  /* Imported here and nowhere in the layout, so the client stays out of the entry chunk. */
  import { createClient } from '@braindog/client';
  import type { Question } from '$lib/record/schema.ts';
  import { CapLine } from 'braindog-render/svelte';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Section from '$lib/ui/Section.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Waiting from '$lib/ui/Waiting.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Chip from '$lib/ui/Chip.svelte';
  import Kbd from '$lib/ui/Kbd.svelte';
  import AskSheet from '$lib/ui/AskSheet.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { closed, drew, opened } from '../../lib/ui/screen.svelte.ts';

  let { data } = $props();

  /**
   * WHERE THE QUEUE CAME FROM. `live` is the record's open suggestions, through `governance`; `refused`
   * is a host that answered no, and its own sentence is what is drawn. Nothing is drawn while the first
   * read is out. There was a third, `sample`, for a host with no record behind it, which drew fixture
   * questions and let them be answered with nothing sent; it went with the sample record (DIRECTION 26).
   */
  let from = $state<'reading' | 'live' | 'refused'>('reading');
  let live = $state<Queue | null>(null);
  let refusal = $state('');
  let client: ReturnType<typeof createClient> | null = null;

  async function readLive() {
    const at = opened();
    client ??= createClient({ base: apiBase() });
    const [out, more] = await Promise.all([readQueue(client), readViews(client, Date.now())]);
    /* A RE-READ AFTER A CONFLICT KEEPS THE OLDER DECISIONS ALREADY ASKED FOR, which a fresh read answers without. */
    if (out.from === 'live') live = keepDecided(live, out.value);
    if (out.from === 'refused') refusal = out.fix;
    /* THE TWO LISTS UNDER THE QUEUE ARE ITS COMPANY, NOT ITS CONDITION. A host that answers the queue and refuses these
       still has a queue to clear, so a refusal here keeps whatever was drawn before and never settles the screen. */
    if (more.from === 'live') views = more.value;
    from = out.from;
    closed(out.from !== 'refused', at);
  }

  /* WHAT WAS PUT OFF AND WHEN IT COMES BACK, and the calls a prediction was made about (`views.ts`). */
  let views = $state<Views>({ later: [], calls: [] });

  /* ASKING YOURSELF A QUESTION, filed through PGS-19's sheet; the new question is read back into the queue it joins. */
  let asking = $state(false);
  function filed() {
    asking = false;
    void readLive();
  }

  $effect(() => {
    untrack(() => void readLive());
  });

  /* THE DECISIONS BELOW THE ONES READ, a page at a time, added under the ones already drawn so nothing above moves. */
  let loadingOlder = $state(false);
  let olderFix = $state('');
  async function loadOlder() {
    const had = live;
    if (!client || !had?.older || had.older.cursor === null || loadingOlder) return;
    loadingOlder = true;
    olderFix = '';
    try {
      const out = await olderDecisions(client, had.older);
      if (out.from === 'live' && live === had) live = { ...had, decided: [...had.decided, ...out.value.decided], older: out.value.older };
      else if (out.from === 'refused') olderFix = out.fix;
    } finally {
      loadingOlder = false;
    }
  }

  /* THE CLOCK A BAND IS READ AGAINST, taken when the read answers. Nothing reads it before then: the
     queue, the ledger and every press are drawn only once `from` is `live`. */
  const now = $derived(from === 'live' ? Date.now() : 0);

  /**
   * WHETHER THIS READER MAY ANSWER, WHICH THIS SCREEN NEVER ASKED.
   *
   * Measured on 21 September, driving a real self-host as a colleague invited to READ: this screen
   * came back at 279 words and 168 controls, 17 of them buttons that answer a question, and NOT ONE
   * of them disabled — control for control the screen the colleague at `decide` got. The refusal
   * arrived from the record after a press, a typed reason and a second press. `shell.me` has carried
   * the answer since `boot`, and one grep across the app found exactly one line of markup reading
   * `me.level` anywhere, on `/settings/identity`. This is the second.
   */
  const me = $derived((route.data as unknown as Shell).me);
  const answerable = $derived(mayAnswer(me.level, me.owner));
  const whyNot = $derived(whyNotAnswering(me.level, me.lists));

  const open = $derived(from === 'live' ? (live?.open ?? []) : []);
  /* Every decision ever taken on the record. The name is the one the cap test reads. */
  const DECIDED = $derived(from === 'live' ? (live?.decided ?? []) : []);
  /* EVERY DECISION ON THE RECORD, read or not yet, so the heading says how many there are and not how many were read. */
  const decidedTotal = $derived(from === 'live' && live?.older ? Math.max(live.older.total, DECIDED.length) : DECIDED.length);
  /* THE AIM IS THE FIGURE'S TARGET, no more than three open, said as every other target is said. It was read off the
     sample's `metric('open-questions')`, whose note is this same line whenever the sample's queue holds anything. */
  const aim = targetLine({ format: 'int', target: { lte: 3 } } as Parameters<typeof targetLine>[0]);

  /**
   * DECIDED HERE, ON A LIVE RECORD, AND DRAWN WHERE IT WAS.
   *
   * A written answer used to read the whole queue again, so every card under it moved at once and
   * focus fell to the document (DESIGN-SYSTEM D3). The record has the decision; the queue keeps the
   * question in its place as one line saying what was decided, and the cursor moves to the next one.
   * Coming back to the screen reads the queue without it.
   */
  let settledHere = $state(new Map<string, string>());
  const waiting = $derived(open.filter((q) => !settledHere.has(q.id)));

  /* THE AIM'S TONE IS THE RECORD'S OWN COUNT. */
  const aimTone = $derived(waiting.length > 3 ? ('warn' as const) : ('good' as const));

  const rowsetOf = (q: Question) => live?.rowsets[q.id];

  /* THE ROWS A PROPOSAL WOULD CHANGE, drawn on its card, because one press here answers it, from the
     record's own rows and declarations. `open` is empty until the read is live, so `live` is here. */
  const changed = $derived(
    new Map(open.map((q) => [q.id, live ? updatesOf(live.rowsets[q.id], live.registers, live.rows, plainOf(live.registers)) : []])),
  );

  /* WHAT A PAGE, A LIST, A RULE OR A LOOK WOULD PUT ON THE SCREEN, for a proposal that arranges the
     record rather than a row in it (DIRECTION §11: this is where Slash's proposals land). */
  const previews = $derived(
    new Map(
      open.map((q) => {
        const about = live?.about?.[q.id];
        return [q.id, from === 'live' && about ? proposedOf(about.kind, about.body) : null];
      }),
    ),
  );

  /** What a question was filed as: the record's body. */
  const aboutFor = (q: Question) => live?.about?.[q.id];
  const arranging = (q: Question) => isArranging(aboutFor(q)?.kind);

  /* A PACK, A SETTINGS CHANGE OR A WHOLE ARRANGEMENT, as the story `arranged.ts` tells, folded for the queue. */
  const stories = $derived(
    new Map(
      open.map((q) => {
        const about = aboutFor(q);
        return [q.id, about ? arrangedOf(about.kind, about.body, { lists }) : null];
      }),
    ),
  );

  /* WHAT AN ACCEPTED ARRANGEMENT DID, on the line it leaves; and how far one got when the record stopped part way. */
  let appliedHere = $state(new Map<string, string[]>());
  let partHere = $state(new Map<string, Partial>());

  /* THE LISTS BY NAME, for the line that says what a question is about. */
  const lists = $derived(
    new Map<string, string>(((route.data.lists ?? route.data.index?.registers ?? []) as { id: string; name: string }[]).map((l) => [l.id, l.name])),
  );

  /** The sidebar as it is drawn now, by address, so what an accepted arrangement added can be named. */
  const sidebarNow = (): Map<string, string> =>
    new Map(((route.data.nav ?? []) as { href: string; title: string }[]).map((n) => [n.href, n.title]));
  const listName = (register: string) => lists.get(register) ?? copy.valueWord(register);

  /** What a question is about: its entity, or the list its rows are in. Empty when it is about neither. */
  function aboutOf(q: Question): string {
    if (q.entity) return q.entity;
    const set = rowsetOf(q);
    return set ? listName(set.register) : '';
  }

  /* GROUPED BY WHAT IT IS ABOUT, when asked. The rank still orders the groups, by their first question,
     and the questions about nothing in particular come last.

     THE ADDRESS HOLDS IT, NOT THIS FILE. It was a local `$state`, so a grouped queue could not be sent to anybody
     and a reload undid it (REWORK §5). `grouping.ts` reads and writes the parameter; a press replaces the address
     rather than pushing one, because a grouping arranges this queue and is not somewhere Back should return to. */
  const grouping = $derived(groupingOf(route.url));
  const groupBy = (next: Grouping) => void goto(at(groupedAddress(route.url, next)), { replaceState: true, noScroll: true, keepFocus: true });
  const groups = $derived.by(() => {
    if (grouping === 'none') return [{ key: '', name: '', items: open }];
    const out = new Map<string, Question[]>();
    for (const q of open) {
      const k = aboutOf(q);
      out.set(k, [...(out.get(k) ?? []), q]);
    }
    return [...out]
      .sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : 0))
      .map(([key, items]) => ({ key, name: key || copy.decideGroupElse, items }));
  });
  const order = $derived(groups.flatMap((g) => g.items));

  /** What a question takes without a choice: its suggested option, or accepting a change. */
  const approveKey = (q: Question): string | null =>
    q.options.find((o) => o.recommended)?.key ?? (q.options.some((o) => o.key === 'accept') ? 'accept' : null);

  /** What `decide` refused on each card, in the record's own sentence, and the card being sent. */
  let fixes = $state(new Map<string, string>());
  let sending = $state<string | null>(null);

  /**
   * SENDING AN ANSWER, on a live record. `decide` takes no answer without its reason, so the press picks
   * and this sends. A refusal stays on the card and is said as a warning; a conflict reads the queue
   * again, because a row the proposal changes has moved; a decision stays in its place as a line, the
   * cursor moves on, and the shell reads `boot` again so the rail's count follows.
   */
  async function commit(q: Question, a: Answer) {
    if (!client || sending !== null) return;
    sending = q.id;
    const about = aboutFor(q);
    const accepting = a.option === 'accept' && about !== undefined && isArranging(about.kind);
    const had = accepting ? sidebarNow() : null;
    const out = await answerQuestion(apiBase(), q.id, a.option, a.reason);
    sending = null;
    const next = new Map(fixes);
    if (out.from !== 'written') {
      /* AN ARRANGEMENT THAT DID NOT ALL LAND: what was done and kept, what was not, and why, on its card, which
         stays open because the record reopened the question. What did land is in the rail, so the shell reads again. */
      if (accepting && about && out.from === 'refused') {
        const got = partialOf(about.kind, about.body, out.fix) ?? { why: out.fix, done: [], left: [] };
        partHere = new Map(partHere).set(q.id, got);
        answers = withdraw(answers, q.id);
        next.delete(q.id);
        fixes = next;
        toasts.push(got.done.length ? copy.arrangePartial : copy.arrangeNotApplied, { intent: 'warn' });
        await invalidateAll();
        return;
      }
      fixes = next.set(q.id, out.fix);
      toasts.push(out.fix, { intent: 'warn' });
      if (out.from === 'conflict') await readLive();
      return;
    }
    next.delete(q.id);
    fixes = next;
    answers = withdraw(answers, q.id);
    settledHere = new Map(settledHere).set(q.id, a.title);
    toasts.push(copy.decisionRecorded(a.title), { intent: 'good' });
    if (accepting && about && had) {
      /* WHAT IT APPLIED, said back, with the sidebar entries it added once the shell has read the record again. */
      appliedHere = new Map(appliedHere).set(q.id, appliedLines(out.applied ?? {}, about.body));
      const p = new Map(partHere);
      p.delete(q.id);
      partHere = p;
      await advanceFrom(q);
      await invalidateAll();
      const added = [...sidebarNow()].filter(([href]) => !had.has(href)).map(([, title]) => title);
      if (added.length) appliedHere = new Map(appliedHere).set(q.id, appliedLines(out.applied ?? {}, about.body, added));
      return;
    }
    void invalidateAll();
    await advanceFrom(q);
  }

  /* THE SENTENCES LIVE IN `copy.ts`, WHERE EVERY OTHER UI LITERAL IN THIS PRODUCT LIVES. */
  const SAY = {
    answered: copy.answeredOption,
    putBack: copy.takeItBack,
    putBackOf: copy.takeItBackOf,
    whyLabel: copy.whyForLater,
    reasonThin: copy.reasonThinNudge,
  } as const;

  /**
   * ANSWERS PICKED HERE AND NOT SENT YET, KEYED BY QUESTION.
   *
   * A `Map` rather than a field on the question, because the question is the record's and this screen
   * has no business editing it. Re-assigned rather than mutated on every change: Svelte 5 proxies
   * objects and arrays and not `Map`.
   *
   * IT DOES NOT SURVIVE LEAVING THE SCREEN, and that is deliberate. A pick is not a write until its
   * reason sends it, so carrying it across a navigation would be this screen remembering something the
   * record does not know.
   */
  let answers = $state(new Map<string, Answer>());

  /**
   * ONE PRESS ANSWERS THE QUESTION, AND THE REASON IS ASKED FOR AFTERWARDS.
   *
   * The reason is the whole subject of this queue and it is asked for every time; it is not allowed to
   * stop the queue moving. `/decide/<id>` still requires it before the press, because going there is
   * choosing the ceremony. The recommendation is a word inside its option, never filled, moved first or
   * focused, so it is found rather than chosen (`19 §4`, `20 §3`).
   */
  async function take(q: Question, key: string) {
    /* A READER WHO MAY NOT ANSWER IS TOLD SO HERE TOO, because the option buttons are not the only
       way in: `1` to `9` and `a` answer from the keyboard, and a key that silently did nothing would
       be the absence this screen is being repaired for. The words are the standing hint's. */
    if (!answerable) {
      toasts.push(whyNot, { intent: 'warn' });
      return;
    }
    const a = answerFor(q, key, new Date(now).toISOString());
    /* A key this question does not offer answers nothing. */
    if (!a) return;
    answers = record(answers, a);
    cursor = order.findIndex((x) => x.id === q.id);

    /* THE PRESS PICKS AND THE REASON SENDS IT, so focus goes to the reason. */
    await tick();
    document.getElementById(`why-${q.id}`)?.focus();
  }

  /** And taking it back puts the focus on the option that was pressed. */
  async function putBack(q: Question, option: string) {
    answers = withdraw(answers, q.id);
    await tick();
    document.getElementById(`opt-${q.id}-${option}`)?.focus();
  }

  /* ── the cursor ────────────────────────────────────────────────────────────
     One question at a time is the keyboard's, as a row is in a list. It starts on nothing, so the first
     `j` is a change a person can see and a pointer reader never meets a highlight they did not ask for. */
  let cursor = $state(-1);

  async function place(at: number) {
    if (order.length === 0) return;
    cursor = Math.max(0, Math.min(at, order.length - 1));
    await tick();
    const el = document.getElementById(`q-${order[cursor]!.id}`);
    el?.focus({ preventScroll: true });
    el?.scrollIntoView({ block: 'nearest' });
  }

  /** After a decision: the next question still waiting below it, or above it when it was the last. */
  async function advanceFrom(q: Question) {
    const at = order.findIndex((x) => x.id === q.id);
    const below = order.findIndex((x, i) => i > at && !settledHere.has(x.id));
    const above = order.findLastIndex((x, i) => i < at && !settledHere.has(x.id));
    const next = below >= 0 ? below : above;
    if (next >= 0) await place(next);
  }

  function onkeydown(e: KeyboardEvent) {
    /* A KEY THE SHELL ALREADY TOOK is not this page's too: `g` then `d` goes to Decide, and must not
       also defer the question under the cursor. */
    if (e.defaultPrevented || covered()) return;
    if (from !== 'live') return;
    const mod = e.metaKey || e.ctrlKey;

    /* INSIDE A REASON: the chord sends it, and Esc goes back to the list with the answer kept. */
    const field = e.target instanceof HTMLTextAreaElement ? e.target.dataset.why : undefined;
    if (field !== undefined) {
      const q = open.find((x) => x.id === field);
      if (!q) return;
      if (mod && e.key === 'Enter') {
        e.preventDefault();
        const a = answers.get(q.id);
        if (a && a.reason.trim()) void commit(q, a);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        void place(order.findIndex((x) => x.id === q.id));
      }
      return;
    }

    if (typing() || mod || e.altKey) return;
    if (e.key === 'Escape' && picked.size > 0) {
      e.preventDefault();
      picked = new Set();
      return;
    }
    if (silenced(e)) return;

    if (e.key === 'j') {
      e.preventDefault();
      void place(cursor + 1);
      return;
    }
    if (e.key === 'k') {
      e.preventDefault();
      void place(cursor < 0 ? 0 : cursor - 1);
      return;
    }

    const q = order[cursor];
    if (!q || settledHere.has(q.id)) return;
    if (e.key === 'Enter') {
      /* ENTER ON A CONTROL IS THAT CONTROL'S. */
      if ((e.target as Element | null)?.closest?.('button, a, summary, input, [role^="menuitem"]')) return;
      e.preventDefault();
      void goto(at(`/decide/${q.id}`));
      return;
    }
    if (e.key === 'x') {
      e.preventDefault();
      toggle(q.id);
      return;
    }
    if (e.key === 'd') {
      e.preventDefault();
      void goto(at(`/decide/${q.id}?defer`));
      return;
    }
    if (answers.has(q.id)) return;
    const n = Number(e.key);
    if (Number.isInteger(n) && n >= 1 && n <= 9) {
      const option = q.options[n - 1];
      if (option) {
        e.preventDefault();
        void take(q, option.key);
      }
      return;
    }
    if (e.key === 'a') {
      const key = approveKey(q);
      if (key) {
        e.preventDefault();
        void take(q, key);
      }
    }
  }

  /* ── a selection, and one answer to all of it ───────────────────────────── */
  let picked = $state(new Set<string>());
  let batchReason = $state('');
  let batching = $state(false);

  function toggle(id: string) {
    const next = new Set(picked);
    if (!next.delete(id)) next.add(id);
    picked = next;
  }

  const chosen = $derived(order.filter((q) => picked.has(q.id) && !settledHere.has(q.id)));
  /* AN ARRANGEMENT IS NEVER ACCEPTED IN A BATCH: it installs, renames and calls out, and each is read on its own. */
  const approvable = $derived(chosen.filter((q) => approveKey(q) !== null && !answers.has(q.id) && !arranging(q)));
  const heldBack = $derived(chosen.some((q) => arranging(q)));

  /* A PHONE SELECTS TOO. There is no pointer to hover, so `Select` shows every box at a thumb's size until `Done`. */
  let selecting = $state(false);

  /**
   * EVERY SELECTED QUESTION WITH A SUGGESTED ANSWER, ANSWERED WITH IT, AND ONE REASON FOR ALL.
   *
   * A question with no suggestion is left for its own press, and the button's count says how many it
   * will answer. Each is sent in turn; one that is refused keeps the record's sentence on its card
   * and the rest carry on.
   */
  async function answerPicked() {
    /* THE SAME GATE ON THE BATCH, and not only on its button: one answer to eight questions is eight
       decisions, and a control that is off is not a path that is closed. */
    if (!answerable) {
      toasts.push(whyNot, { intent: 'warn' });
      return;
    }
    if (batching || approvable.length === 0) return;
    const at = new Date(now).toISOString();
    const reason = batchReason.trim();
    if (from !== 'live' || reason === '' || !client) return;
    batching = true;
    let done = 0;
    const settled = new Map(settledHere);
    const refused = new Map(fixes);
    for (const q of approvable) {
      const a = answerFor(q, approveKey(q)!, at);
      if (!a) continue;
      const out = await answerQuestion(apiBase(), q.id, a.option, reason);
      if (out.from === 'written') {
        settled.set(q.id, a.title);
        refused.delete(q.id);
        done++;
      } else refused.set(q.id, out.fix);
    }
    batching = false;
    settledHere = settled;
    fixes = refused;
    picked = new Set();
    batchReason = '';
    if (done) toasts.push(copy.decideBatchDone(done), { intent: 'good' });
    void invalidateAll();
  }

  /**
   * DRAWN ONCE THE FIRST READ HAS ANSWERED LIVE. The read is bracketed by `opened()` and `closed()`, so a
   * call still out takes `data-screen` away whatever this says.
   */
  $effect(() => {
    if (from === 'live') drew('ready');
  });
</script>

<svelte:head><title>{titleOf(said('decide'))}</title></svelte:head>
<svelte:window {onkeydown} />

<!-- NO COUNT IN THE HEAD: `Open questions` prints it one line lower, for the same list. -->
<PageHead icon="decide" title={said('decide')}>
  {#snippet actions()}
    <!-- ONE QUIET PRESS, and only for somebody who may answer: a question a reader could ask and never settle is a
         question left in everybody else's queue. -->
    {#if answerable}<Button weight="quiet" onclick={() => (asking = true)}>{WORDS.ask}</Button>{/if}
  {/snippet}
</PageHead>

<AskSheet open={asking} onclose={() => (asking = false)} onfiled={filed} />

{#snippet card(q: Question)}
  {@const said = answers.get(q.id)}
  {@const updates = changed.get(q.id) ?? []}
  {@const preview = previews.get(q.id)}
  {@const about = aboutOf(q)}
  {@const set = rowsetOf(q)}
  {@const decidedHere = settledHere.get(q.id)}
  {@const story = stories.get(q.id)}
  {@const part = partHere.get(q.id)}
  <li
    class="q"
    id="q-{q.id}"
    tabindex="-1"
    aria-labelledby="q-{q.id}-title"
    data-cursor={order[cursor]?.id === q.id ? '' : undefined}
    data-done={decidedHere !== undefined ? '' : undefined}
  >
    {#if decidedHere !== undefined}
      <!-- DECIDED HERE: one line in the question's place, and the way to the decision it became. -->
      <a class="q-receipt" href={at(`/decide/${q.id}`)}>
        <span class="q-tick"><Icon name="check" size="s" /></span>
        <span class="q-receipt-text"><span class="q-title" id="q-{q.id}-title">{q.title}</span> <span class="q-said">{copy.decideDecided(decidedHere)}</span></span>
      </a>
      {@const did = appliedHere.get(q.id)}
      {#if did}<div class="q-applied"><Applied lines={did} /></div>{/if}
    {:else}
      <div class="q-top">
        <a class="q-open" href={at(`/decide/${q.id}`)}>
          <span class="q-body">
            <!-- WHAT IT IS ABOUT LEADS, AND THE ID ENDS THE LINE. -->
            <span class="q-title" id="q-{q.id}-title">{q.title}</span>
            {#if q.cost}<span class="q-cost">{symbolText(q.cost)}</span>{/if}
            <span class="q-head">
              {#if set && updates.length}
                <span class="q-entity">{copy.decideRows(updates.length, listName(set.register))}</span>
              {:else if about && grouping === 'none'}
                <span class="q-entity">{about}</span>
              {/if}
              {#if aboutFor(q)?.by === 'slash'}<span class="q-entity">{copy.fromSlash}</span>{/if}
              <span class="q-age">opened {since(q.opened, now)}</span>
              <!-- What it would cost to get this one wrong, which is why it sits where it sits. The
                   word is `braindog-render`'s, the same one the `queue` block draws. -->
              {#if queueCost(q.band ?? '')}<span class="q-band" data-cost={q.band}>{queueCost(q.band ?? '')}</span>{/if}
              <!-- NO ID ENDS THE LINE, NOT EVEN ONE A READER COULD SAY: the question is named by its words, and a number
                   here counted the questions a one-list member was not shown (rules §2, SYS-3). -->
            </span>
          </span>
        </a>
        <button
          type="button"
          class="pick"
          role="checkbox"
          aria-checked={picked.has(q.id)}
          aria-label={q.title}
          data-on={picked.has(q.id) ? '' : undefined}
          onclick={() => toggle(q.id)}
        >{#if picked.has(q.id)}<Icon name="check" size="s" />{/if}</button>
      </div>

      {#if story}
        <div class="q-changes"><Arranged arranged={story} compact /></div>
      {:else if preview}
        <section class="q-changes" aria-label={copy.proposalWillAppear}><Proposed proposed={preview} /></section>
      {:else if updates.length}
        <div class="q-changes"><Changes {updates} compact /></div>
      {/if}

      {#if part}<Applied partial={part} />{/if}

      <!-- THE VERBS, BESIDE THE LINK AND NOT INSIDE IT: above it opens the question, below it answers it. -->
      <div class="q-act">
        {#if said}
          {@const state = reasonState(said.reason)}
          <div class="said">
            <span class="said-what">{SAY.answered(said.title)}</span>
            <!-- THE ROW STAYS AND OFFERS THE WAY BACK (REWORK §1, §4). -->
            <Button
              weight="bare"
              id="undo-{q.id}"
              aria-label={SAY.putBackOf(q.title)}
              onclick={() => putBack(q, said.option)}
            >{SAY.putBack}</Button>
          </div>

          <div class="why">
            <label class="why-label" for="why-{q.id}">{SAY.whyLabel}</label>
            <textarea
              id="why-{q.id}"
              data-why={q.id}
              class="why-field"
              rows="2"
              placeholder={copy.reasonHint}
              spellcheck="true"
              aria-describedby={state === 'written' ? undefined : `why-note-${q.id}`}
              value={said.reason}
              oninput={(e) => (answers = setReason(answers, q.id, e.currentTarget.value))}
            ></textarea>
            <!-- THE ARGUMENT, STANDING RATHER THAN BLOCKING, until there is a sentence worth reading. -->
            {#if state !== 'written'}
              <p class="why-note" id="why-note-{q.id}">
                {state === 'missing' ? copy.reasonRequired : SAY.reasonThin}
              </p>
            {/if}
            <!-- SENT FROM THE BUTTON OR FROM THE FIELD. -->
            <div class="send">
              <Button weight="primary" disabled={!said.reason.trim() || sending !== null} onclick={() => commit(q, said)}>
                {copy.commit}
              </Button>
              <span class="keys"><Kbd keys="⌘↵" />{copy.decideToSend}<Kbd keys="Esc" />{copy.decideToLeave}</span>
            </div>
          </div>
        {:else}
          <!-- Named by the question, because "Per seat" repeated down a queue is three words with no subject.

               AND OFF FOR A READER WHO MAY NOT ANSWER, each one pointing at the standing sentence
               over the queue that says why. `aria-describedby` rather than a title, so the reason is
               read out with the control and not only seen beside it, which is the shape
               `/settings/people` uses for its last-owner rule. -->
          <div class="q-options" role="group" aria-labelledby="q-{q.id}-title">
            {#each optionsOf(q) as o (o.key)}
              <Button
                id="opt-{q.id}-{o.key}"
                disabled={!answerable}
                aria-describedby={answerable ? undefined : 'cannot-decide'}
                onclick={() => take(q, o.key)}
              >
                {o.title}{#if o.recommended}<span class="rec">{copy.recommended}</span>{/if}
              </Button>
            {/each}
          </div>
        {/if}
        {#if fixes.get(q.id)}
          <p class="why-fix" role="status" data-intent="bad">{fixes.get(q.id)}</p>
        {/if}
      </div>
    {/if}
  </li>
{/snippet}

<div class="page">
  {#if from === 'reading'}
    <!-- Bars, and after 300ms, until the first read answers. -->
    <Waiting />
  {:else if from === 'refused'}
    <Empty kind="error" title={refusal}>
      {#snippet actions()}<Button onclick={() => location.reload()}>{copy.tryAgain}</Button>{/snippet}
    </Empty>
  {:else if open.length === 0}
    <!-- ALL CLEAR, with the last decision's age, and the other queue when something waits in it. -->
    <Empty
      kind="cleared"
      title={said('no_questions')}
      body={DECIDED[0] ? `${copy.lastDecided} ${since(DECIDED[0].decided?.at ?? '', now)}.` : undefined}
    >
      {#snippet actions()}
        {#if Number(route.data.inbox ?? 0) > 0}<Button href="/inbox">{copy.decideOpenInbox}</Button>{/if}
      {/snippet}
    </Empty>
  {:else}
    <!-- THE COUNT IS WHAT STILL WAITS: a question decided here leaves it and keeps its line. -->
    <Section title={copy.openQuestions} count={waiting.length}>
      {#snippet aside()}
        <div class="head-aside">
          <div class="segmented" role="group" aria-label={copy.decideGroup}>
            <button
              type="button"
              class="segment"
              aria-pressed={grouping === 'none'}
              data-on={grouping === 'none' ? '' : undefined}
              onclick={() => groupBy('none')}>{copy.decideGroupNone}</button
            >
            <button
              type="button"
              class="segment"
              aria-pressed={grouping === 'about'}
              data-on={grouping === 'about' ? '' : undefined}
              onclick={() => groupBy('about')}>{copy.decideGroupList}</button
            >
          </div>
          <Chip label={copy.aimFor(aim)} tone={aimTone} />
          <span class="select-toggle">
            <Button
              weight="bare"
              aria-pressed={selecting}
              onclick={() => {
                selecting = !selecting;
                if (!selecting) picked = new Set();
              }}>{selecting ? copy.decideSelectDone : copy.decideSelect}</Button
            >
          </span>
        </div>
      {/snippet}

      <!-- WHY THE ANSWERS ARE OFF, ABOVE THE QUESTIONS AND NOT AFTER A PRESS. It is the record's own
           refusal, said before anybody has typed a word, and it ends by saying that reading is what
           this colleague still holds. Every option button and the batch commit point at it. -->
      {#if !answerable}
        <p class="cannot" id="cannot-decide">{whyNot}</p>
      {/if}

      {#each groups as g (g.key)}
        <div class="group" data-picking={picked.size > 0 || selecting ? '' : undefined}>
          {#if grouping !== 'none'}<h3 class="group-head">{g.name}<span class="group-n">{g.items.length}</span></h3>{/if}
          <!-- THE ORDER IS SAID OUT LOUD, because a list whose order cannot be seen is a list a reader
               assumes is arbitrary, and this one is not: it is dearest-to-get-wrong first. Grouped, the
               heading above already names the list and a second label would be the same list twice. -->
          <ol class="queue" aria-label={grouping === 'none' ? copy.rankedBy : undefined}>
            {#each g.items as q (q.id)}{@render card(q)}{/each}
          </ol>
        </div>
      {/each}

      {#if waiting.length === 0}
        <Empty kind="cleared" compact title={said('no_questions')}>
          {#snippet actions()}
            {#if Number(route.data.inbox ?? 0) > 0}<Button href="/inbox">{copy.decideOpenInbox}</Button>{/if}
          {/snippet}
        </Empty>
      {/if}

      {#if picked.size > 0}
        <!-- THE SELECTION'S BAR, stuck to the foot of the view and drawn after the list, so opening it
             moves nothing above it. -->
        <div class="batch" role="region" aria-label={copy.decideSelected(chosen.length)}>
          <span class="batch-n">{copy.decideSelected(chosen.length)}</span>
          {#if approvable.length > 0}
            <input
              class="batch-why"
              type="text"
              placeholder={copy.decideBatchReason}
              aria-label={copy.decideBatchReason}
              bind:value={batchReason}
              onkeydown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void answerPicked();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  picked = new Set();
                }
              }}
            />
            <Button
              weight="primary"
              disabled={batching || !answerable || (from === 'live' && !batchReason.trim())}
              aria-describedby={answerable ? undefined : 'cannot-decide'}
              onclick={answerPicked}
            >
              {copy.decideAnswerSuggested(approvable.length)}
            </Button>
          {:else if !heldBack}
            <span class="batch-note">{copy.decideNoneSuggested}</span>
          {/if}
          {#if heldBack}<span class="batch-note">{copy.arrangeNotInBatch}</span>{/if}
          <Button
            weight="bare"
            onclick={() => {
              picked = new Set();
              selecting = false;
            }}>{copy.clearSelection}</Button
          >
        </div>
      {/if}
    </Section>
  {/if}

  <!-- WHAT WAS PUT OFF, the soonest back first. The queue above leaves a deferred question out until its day comes, so
       without this list a question put off was a question nobody could find until it reappeared. -->
  {#if from === 'live' && views.later.length}
    <Section title={WORDS.later} count={views.later.length}>
      <ul class="ledger">
        {#each views.later.slice(0, DOM_CAP) as q (q.id)}
          <li>
            <a class="line" href={at(`/decide/${q.id}`)}>
              <span class="line-main">
                <span class="line-title">{q.title}</span>
                {#if q.why}<span class="line-detail">{q.why}</span>{/if}
              </span>
              <span class="line-when">{WORDS.back(dayWord(q.until, now))}</span>
            </a>
          </li>
        {/each}
      </ul>
      <CapLine shown={Math.min(views.later.length, DOM_CAP)} total={views.later.length} />
    </Section>
  {/if}

  <!-- THE CALLS A PREDICTION WAS MADE ABOUT, and whether it came true, so a decision is judged by what followed and
       not by how sure it sounded. The word carries the outcome; the glyph beside it is never the only sign. -->
  {#if from === 'live' && views.calls.length}
    <Section title={WORDS.calls} count={views.calls.length}>
      <ul class="ledger">
        {#each views.calls as c (c.id)}
          {@const when = dayWord(c.at, now)}
          <li>
            {#snippet body()}
              <span class="line-main">
                <span class="line-title">{c.claim}</span>
                <span class="line-detail call-went" data-went={c.went}>
                  {#if c.went === 'met'}<Icon name="check" size="s" />{WORDS.met}{:else if c.went === 'missed'}<Icon name="close" size="s" />{WORDS.missed}{:else if c.went === 'unread'}{WORDS.unread}{:else}<Icon name="clock" size="s" />{WORDS.due(when)}{/if}
                </span>
              </span>
              {#if c.went !== 'due' && when}<span class="line-when">{WORDS.checked(when)}</span>{/if}
            {/snippet}
            {#if c.about}<a class="line" href={at(`/decide/${c.about}`)}>{@render body()}</a>{:else}<div class="line">{@render body()}</div>{/if}
          </li>
        {/each}
      </ul>
    </Section>
  {/if}

  {#if DECIDED.length}
    <Section title={copy.searchDecided} count={decidedTotal}>
      <ul class="ledger">
        {#each DECIDED.slice(0, DOM_CAP) as q}
          <!-- THE OPTION BY ITS LABEL. A live decision keeps the option's id, and its options come from the suggestion it settled. -->
          {@const choseTitle = q.options.find((o) => o.key === q.decided?.option)?.title}
          <li>
            <!-- ON THE LIST'S EDGE, WITH NO TICK AND NO ID: every row here is decided, which the heading says once, and a
                 tick on each pushed every title 32px in from the rows above it. -->
            <a class="line" href={at(`/decide/${q.id}`)}>
              <span class="line-main">
                <span class="line-title">{q.title}</span>
                <span class="line-detail">{#if choseTitle}<span class="decided-choice">{choseTitle}</span> {/if}{q.decided?.reason}</span>
              </span>
              <span class="line-when">{since(q.decided?.at ?? '', now)}</span>
            </a>
          </li>
        {/each}
      </ul>
      <CapLine shown={Math.min(DECIDED.length, DOM_CAP)} total={decidedTotal} />
      {#if from === 'live' && live?.older && live.older.cursor !== null}
        <div class="older">
          <Button weight="quiet" onclick={loadOlder} disabled={loadingOlder}>{copy.olderEntries}</Button>
        </div>
      {/if}
      {#if olderFix}<p class="older-fix" role="status">{olderFix}</p>{/if}
    </Section>
  {/if}
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-7);
    padding: var(--sp-5) var(--gutter) var(--sp-9);
    max-inline-size: var(--page-max);
  }

  .head-aside {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: var(--sp-2) var(--sp-3);
  }

  /* THE STANDING SENTENCE OVER THE QUEUE, at the weight of a hint rather than an alarm: nothing has
     gone wrong, and this reader is doing exactly what they were invited to do. `--measure` because
     it is three sentences and a line that runs the width of the page is a line nobody reads. */
  .cannot {
    margin: 0 0 var(--sp-4);
    max-inline-size: var(--measure);
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: var(--lh-body);
  }

  .group + .group {
    margin-block-start: var(--sp-5);
  }

  .group-head {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
    margin-block-end: var(--sp-1);
    color: var(--ink2);
    font-family: var(--font-ui);
    font-size: var(--t-sm);
    font-weight: 500;
  }

  .group-n {
    color: var(--dim);
    font-variant-numeric: tabular-nums;
  }

  .queue {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /**
   * A QUESTION IS A SECTION OF THE LIST, NOT A CARD. Space and a soft divider separate one from the
   * next. The link is the top of the item and the answers sit under it as siblings, because a button
   * may not live inside a link.
   */
  .q {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    padding-block: var(--sp-5);
    border-block-end: 1px solid var(--line-soft);
    scroll-margin-block: var(--sp-7);
  }

  .q:first-child {
    padding-block-start: var(--sp-2);
  }

  .q:last-child {
    border-block-end: 0;
  }

  /* THE CURSOR IS THE FOCUS RING, drawn round the question with room to breathe, and only while it is
     the keyboard's. A pointer reader never sees it. */
  .q:focus-visible {
    outline: 2px solid var(--focus-in);
    outline-offset: var(--sp-2);
    border-radius: var(--r-sm);
  }

  /* A DECIDED QUESTION IS ONE LINE, and the rule under it stays so the list keeps its rhythm. */
  .q[data-done] {
    padding-block: var(--sp-3);
  }

  .q-receipt {
    display: flex;
    align-items: baseline;
    gap: var(--sp-1) var(--sp-2);
    color: var(--dim);
    font-size: var(--t-ui);
    text-decoration: none;
  }

  .q-receipt-text {
    min-inline-size: 0;
  }

  .q-receipt .q-title {
    min-inline-size: 0;
    color: var(--ink2);
    font-weight: 400;
  }

  .q-tick {
    flex: none;
    align-self: start;
    padding-block-start: 2px;
    color: var(--earn);
  }

  .q-said {
    color: var(--dim);
  }

  .q-said::before {
    content: '·';
    margin-inline: var(--sp-1) var(--sp-2);
  }

  .q-top {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
    gap: var(--sp-3);
  }

  .q-open {
    display: block;
    color: var(--ink);
    text-decoration: none;
  }

  .q-body {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    min-inline-size: 0;
  }

  .q-title {
    color: var(--ink);
    font-size: var(--t-base);
    font-weight: 500;
    letter-spacing: -0.005em;
  }

  .q-open:hover .q-title {
    text-decoration: underline;
    text-decoration-color: var(--line);
    text-underline-offset: 3px;
  }

  .q-cost {
    max-inline-size: var(--measure);
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .q-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
    color: var(--dim);
    font-size: var(--t-xs);
  }

  .q-entity {
    color: var(--ink2);
  }

  /* THE BAND TAKES THE LINE'S OWN SEPARATOR RATHER THAN A PILL. Every other item on this line is a
     word after a dot, and a capsule among them would be the loudest thing in a list of questions —
     which is a ranking arguing for itself. The dearest band takes the darker ink and nothing else:
     the word is what says it, and `data-cost` is matched instead of the English. */
  .q-band[data-cost='undo'] {
    color: var(--ink2);
    font-weight: 500;
  }

  /* Between items, so a question about nothing does not open its line with a dot. */
  .q-head > span + span::before {
    content: '·';
    margin-inline-end: var(--sp-2);
    color: var(--dim);
  }

  /* THE SELECTION BOX, at the trailing edge of the title, and only where it is wanted: under the
     pointer, on the cursor, or once something is selected. It keeps its space when hidden, so showing
     it moves nothing. A thumb selects nothing here; a phone answers one question at a time. */
  .pick {
    display: grid;
    place-items: center;
    inline-size: 16px;
    block-size: 16px;
    margin-block-start: 2px;
    padding: 0;
    background: none;
    border: 1px solid var(--edge);
    border-radius: var(--r-sm);
    color: var(--on-ink);
    cursor: pointer;
    visibility: hidden;
  }

  .pick[data-on] {
    background: var(--on);
    border-color: var(--on);
  }

  .q:hover .pick,
  .q[data-cursor] .pick,
  .pick:focus-visible,
  .group[data-picking] .pick {
    visibility: visible;
  }

  /* ON A PHONE THE BOX IS A THUMB'S: drawn larger, reached through a 44px square round it, and shown only once
     `Select` is pressed, because nothing hovers there to reveal it. */
  .select-toggle {
    display: none;
  }

  /* THE HEADING KEEPS ITS LINE when `Select` joins the aside on a phone; the aside wraps under itself instead. */
  .page :global(.section-title) {
    flex: none;
    white-space: nowrap;
  }

  /* ON A PHONE THE HEAD HOLDS THE COUNT AND `Select`, and the aim, a desk's nicety, gives way to them. */
  @media (width < 640px) {
    .head-aside :global(.chip) {
      display: none;
    }

    .batch .batch-note {
      flex-basis: 100%;
    }
  }

  @media (width < 900px), (pointer: coarse) {
    .select-toggle {
      display: inline-flex;
    }
  }

  @media (pointer: coarse) {
    .pick {
      position: relative;
      inline-size: 24px;
      block-size: 24px;
      margin-block-start: 0;
    }

    /* `::before`, THE PSEUDO-ELEMENT EVERY OTHER HIT AREA IN THE PRODUCT USES (`.tap` in `a11y.css`), so the square
       round the box is the one the layout gate measures. */
    .pick::before {
      content: '';
      position: absolute;
      inset: calc((100% - var(--tap)) / 2);
    }

    /* A QUESTION WITH A ONE-LINE TITLE AND A META LINE WAS 43PX TALL, a pixel under a thumb. */
    .q-open {
      min-block-size: var(--tap);
    }

    .q:hover .pick,
    .q[data-cursor] .pick {
      visibility: hidden;
    }

    .group[data-picking] .pick {
      visibility: visible;
    }
  }

  .q-applied {
    padding-block-start: var(--sp-2);
    padding-inline-start: var(--sp-5);
  }

  .q-changes {
    max-inline-size: var(--measure);
  }

  .q-act {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
  }

  /* Wrapping, not scrolling: every answer stays visible on a phone. */
  .q-options {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  @media (pointer: fine) {
    .q-options :global(.btn.btn) {
      min-block-size: var(--ctl-h-sm);
    }
  }

  /* ON A PHONE EACH OPTION IS A FULL-WIDTH ROW, so a thumb meets one answer at a time and a long label wraps inside its
     own button rather than pushing the next one onto half a line. */
  @media (width < 640px) {
    .q-options {
      flex-direction: column;
      align-items: stretch;
    }

    .q-options :global(.btn) {
      inline-size: 100%;
      justify-content: flex-start;
      text-align: start;
    }
  }

  /* THE SUGGESTION IS A WORD, IN THE QUIET INK, read with the option's name. */
  .rec {
    color: var(--dim);
    font-weight: 400;
  }

  .said {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2) var(--sp-3);
  }

  .said-what {
    color: var(--ink2);
    font-size: var(--t-ui);
  }

  .why {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    max-inline-size: var(--measure);
  }

  .why-label {
    color: var(--dim);
    font-size: var(--t-xs);
  }

  .why-field,
  .batch-why {
    inline-size: 100%;
    min-block-size: var(--ctl-h);
    padding: var(--sp-2) var(--sp-3);
    background: var(--s1);
    border: 1px solid var(--edge);
    border-radius: var(--r-sm);
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--t-ui);
  }

  /* THE REASON STAYS ABOVE THE KEYBOARD, with room under it for Send: a focused field scrolls clear of the sticky bar
     above and of `--kb` below, which is the keyboard's height once it is up and nothing before. */
  .why-field {
    resize: vertical;
    scroll-margin-block-start: calc(var(--sticky) + var(--sp-4));
    scroll-margin-block-end: calc(var(--kb) + var(--ctl-h) + var(--sp-6));
  }

  .why-note {
    max-inline-size: var(--measure);
    color: var(--dim);
    font-size: var(--t-xs);
  }

  .send {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2) var(--sp-4);
  }

  /* The chords, beside the button they stand for. A phone has no keyboard to press them with. */
  .keys {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    color: var(--dim);
    font-size: var(--t-xs);
  }

  .keys :global(.kbd-run + .kbd-run),
  .keys :global(.kbd-run:not(:first-child)) {
    margin-inline-start: var(--sp-3);
  }

  @media (width < 900px), (pointer: coarse) {
    .keys {
      display: none;
    }
  }

  .why-fix {
    max-inline-size: var(--measure);
    font-size: var(--t-ui);
  }

  /* THE PRESS FOR OLDER DECISIONS, under the ledger it adds to. */
  .older {
    display: flex;
    margin-block: var(--sp-3);
  }

  .older-fix {
    color: var(--dim);
    font-size: var(--t-xs);
  }

  /* At the trailing edge, as wide as it needs, so a toast at the leading edge and the bar do not meet. */
  .batch {
    position: sticky;
    inset-block-end: var(--sp-4);
    z-index: var(--z-raise);
    inline-size: fit-content;
    max-inline-size: 100%;
    margin-inline-start: auto;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2) var(--sp-3);
    margin-block-start: var(--sp-4);
    padding: var(--sp-2) var(--sp-3);
    background: var(--s2);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    box-shadow: var(--e2);
  }

  .batch-n {
    color: var(--ink);
    font-size: var(--t-ui);
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }

  .batch-why {
    flex: 0 1 18rem;
    inline-size: 18rem;
    min-inline-size: 0;
  }

  /* A question the cursor lands on clears the bar, which stands over the foot of the view. */
  .group[data-picking] .q {
    scroll-margin-block-end: var(--sp-9);
  }

  .batch-note {
    flex: 1;
    color: var(--ink2);
    font-size: var(--t-ui);
  }

  /* The row shape is `$lib/ui/rows.css`; the decided list uses three of its four columns.

     A DESKTOP TRACK LIST IS A DESKTOP RULE, AND HAS TO SAY SO: `rows.css` turns a row into a two-line
     card below 640px, and this override is more specific than that rule, so without the width query
     it won at every size and left a zero-width track holding a nowrap note. */
  @media (width >= 640px) {
    .ledger :global(.line) {
      grid-template-columns: minmax(0, 1fr) auto;
      min-block-size: 44px;
    }
  }

  /* ON A PHONE THE DAY GOES UNDER THE WORDS, and the words start on the list's edge like every row above them. */
  @media (width < 640px) {
    .ledger :global(.line) {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--sp-1);
    }

    .ledger :global(.line-main) {
      grid-column: 1;
      grid-row: 1;
    }

    .ledger :global(.line-when) {
      grid-column: 1;
      grid-row: 2;
      justify-content: flex-start;
    }
  }

  /* HOW A CALL WENT, AS A WORD WITH ITS GLYPH, in the quiet ink: the outcome is read, never told apart by colour. */
  .call-went {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    color: var(--ink2);
  }

  .decided-choice {
    margin-inline-end: var(--sp-1);
    color: var(--ink2);
    font-weight: 500;
  }

  @media (width < 900px) {
    .page {
      padding: var(--sp-4) var(--gutter) var(--sp-8);
    }

    .head-aside .segmented {
      display: none;
    }

    .batch {
      inset-block-end: calc(var(--tabbar) + var(--sp-3));
    }

  }
</style>
