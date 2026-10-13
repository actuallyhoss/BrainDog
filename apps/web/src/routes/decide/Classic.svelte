<!--
  DECIDE AS IT WAS, kept at `/decide?classic` until the declared page (`+page.svelte`, `views.ts` `decideHome`) does
  everything it did, as Today's old screen is kept at `/?classic`. It is loaded only when it is asked for.

  Every open question, ranked by the COST OF BEING WRONG — never by age.

  Ranking by age is what turns a decision queue into a backlog: the oldest question is usually the
  one nobody has needed to answer. Ranking by what deciding late costs puts the expensive one first
  and makes the order arguable, which is the point (19 §2).

  THE OPTIONS ON A CARD ARE THE ANSWER. One press picks it, and the reason that sends it is asked for after it.
  A card cannot hold a button inside its link, so the anchor and the verbs are SIBLINGS under one
  item, as `RowCards.svelte` does for the register.

  AND IT IS A QUEUE, CLEARED FROM THE KEYBOARD. A cursor moves with `j`
  and `k`; a number answers with that option, `a` with the suggested one, `d` defers on the gate, `x`
  selects for one answer to several, and Enter opens the question. Inside a reason, `⌘↵` sends it and
  Esc goes back to the list. A question decided here stays in its place as one line.

  `/decide/<id>` KEEPS EVERYTHING IT HAD. It is where a decision is examined: the cost, the option
  bodies, the recommendation, the defer with its wake date, and a commit that takes a named decider
  and a written reason and cannot be edited afterwards.

  THE LOOK, as the design system draws Decide. The title row says how many wait and what the first
  one suggests. The first question in the ranking is OPEN in a lead tile: what accepting does, the suggestion and why,
  the share its reason claims drawn as squares, and its options with their keys. Beside it a tile draws how long each
  question has waited, and under that the rest of the queue sits on the ground as rows. What accepting would change is
  a tile of its own under the lead. What comes back, how the calls went and what was decided lately are lists on the
  ground. The lead is the same card as every row, inside its own `ol.queue`, so the cursor, the ids and the answers are
  one code path, and the rows start after it: no question is drawn twice.
-->
<script lang="ts">
  import { apiBase, at } from '$lib/at.ts';
  import { titleOf } from '$lib/title.ts';
  import { tick, untrack } from 'svelte';
  import { page as route } from '$app/state';
  import { goto, invalidateAll } from '$app/navigation';
  import { since, symbolText } from 'braindog-render';
  import { copy } from '$lib/copy.ts';
  import { said } from '$lib/voice.svelte.ts';
  import { DOM_CAP, whoDid } from '$lib/record/api.ts';
  import { targetLine } from '$lib/record/metrics.ts';
  import { figuresIn, reasonIn } from '$lib/cite.ts';
  import Changes from './[id]/Changes.svelte';
  import Proposed from './[id]/Proposed.svelte';
  import Arranged from './[id]/Arranged.svelte';
  import Applied from './[id]/Applied.svelte';
  import { updatesOf, words as changeWords } from './[id]/changes.ts';
  import { AIM, DECIDED_FIRST, evidenceIn, sentenceOf, waitedOf, waitedWords, WORDS as LEAD } from './lead.ts';
  import { proposedOf } from './[id]/proposed.ts';
  import { appliedLines, arrangedOf, isArranging, partialOf, type Partial } from './[id]/arranged.ts';
  import { answerFor, reasonState, record, setReason, withdraw, type Answer } from '$lib/record/answer.ts';
  import { mayAnswer, whyNotAnswering } from './answering.ts';
  import { dayWord, readViews, WORDS, type Views } from './views.ts';
  import { groupedAddress, groupingOf, type Grouping } from './grouping.ts';
  import type { Shell } from '$lib/record/boot-live.ts';
  import { keepDecided, olderDecisions, plainOf, readQueue, type Queue } from '$lib/record/governance.ts';
  import { answerQuestion } from '$lib/record/decide-write.ts';
  import { covered, silenced, typing } from '$lib/a11y/keys.svelte.ts';
  /* Imported here and nowhere in the layout, so the client stays out of the entry chunk. */
  import { createClient } from '@braindog/client';
  import { doesOf as sendsSaid } from '@braindog/kernel';
  import type { Question } from '$lib/record/schema.ts';
  import { CapLine } from 'braindog-render/svelte';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Section from '$lib/ui/Section.svelte';
  import Segmented from '$lib/ui/Segmented.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Waiting from '$lib/ui/Waiting.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import Cited from '$lib/ui/Cited.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Kbd from '$lib/ui/Kbd.svelte';
  import AskSheet from '$lib/ui/AskSheet.svelte';
  import type { IconName } from '$lib/ui/icons.ts';
  import Bars from '$lib/viz/Bars.svelte';
  import Waffle from '$lib/viz/Waffle.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { closed, drew, opened } from '../../lib/ui/screen.svelte.ts';
  import DecisionCard from '$lib/decide/DecisionCard.svelte';
  import { queueOf } from '$lib/decide/card.ts';

  let { data } = $props();

  /**
   * WHERE THE QUEUE CAME FROM. `live` is the record's open suggestions, through `governance`; `refused`
   * is a host that answered no, and its own sentence is what is drawn. Nothing is drawn while the first
   * read is out. Every question drawn is the record's own, and every answer is sent to it.
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

  /* ASKING YOURSELF A QUESTION, filed through `AskSheet`; the new question is read back into the queue it joins. */
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
   * Measured driving a real self-host as a colleague invited to READ: this screen
   * came back at 279 words and 168 controls, 17 of them buttons that answer a question, and NOT ONE
   * of them disabled, control for control the screen the colleague at `decide` got. The refusal
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
     sample's `metric('open-questions')`, whose note is this same line whenever the sample's queue holds anything. It was
     a chip beside the count; it is said now in the sentence (over it, in red) and under the chart of how long each has
     waited, where a reader asks how full the queue should be. */
  const aim = targetLine({ format: 'int', target: { lte: AIM } } as Parameters<typeof targetLine>[0]);

  /**
   * DECIDED HERE, ON A LIVE RECORD, AND DRAWN WHERE IT WAS.
   *
   * A written answer used to read the whole queue again, so every card under it moved at once and
   * focus fell to the document. The record has the decision; the queue keeps the
   * question in its place as one line saying what was decided, and the cursor moves to the next one.
   * Coming back to the screen reads the queue without it.
   */
  let settledHere = $state(new Map<string, string>());
  const waiting = $derived(open.filter((q) => !settledHere.has(q.id)));

  const rowsetOf = (q: Question) => live?.rowsets[q.id];

  /* THE ROWS A PROPOSAL WOULD CHANGE, drawn on its card, because one press here answers it, from the
     record's own rows and declarations. `open` is empty until the read is live, so `live` is here. */
  const changed = $derived(
    new Map(open.map((q) => [q.id, live ? updatesOf(live.rowsets[q.id], live.registers, live.rows, plainOf(live.registers)) : []])),
  );

  /* WHAT A PAGE, A LIST, A RULE OR A LOOK WOULD PUT ON THE SCREEN, for a proposal that arranges the
     record rather than a row in it: this is where Slash's proposals land. */
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
     and a reload undid it. `grouping.ts` reads and writes the parameter; a press replaces the address
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

  /**
   * THE OPEN QUESTION: the first in the ranking, drawn whole in the lead tile, and only on the ranked queue. Grouped, the
   * groups are the arrangement and none of them leads. It stays the lead once it is decided here, as a one-line receipt
   * in the same place, so nothing under it moves.
   */
  const lead = $derived(grouping === 'none' ? order[0] : undefined);

  /** Who asked, by name, for the meta line and the sentence; nothing for a question nobody is named on, or for you. */
  const shell = $derived(route.data as unknown as Shell);
  const names = $derived(new Map(Object.entries(shell.names ?? {})));
  function askerOf(q: Question): string {
    const by = aboutFor(q)?.by ?? '';
    if (by === '') return '';
    if (by === 'slash') return 'Slash';
    const who = whoDid(by, me.person || null, names);
    return who.you ? '' : who.name;
  }

  /* THE SENTENCE UNDER THE TITLE, about what still waits and what the first of it suggests (`lead.ts`). */
  const firstWaiting = $derived(order.find((q) => !settledHere.has(q.id)));
  const sentence = $derived(from === 'live' ? sentenceOf(waiting, firstWaiting, firstWaiting ? askerOf(firstWaiting) : '', now, shell.lateDays ?? null) : null);

  /* HOW LONG EACH HAS WAITED, in the queue's order, the open one in ink and anything past two weeks in red. */
  const waited = $derived(waitedOf(waiting, lead?.id, now, shell.lateDays ?? null));

  /**
   * THE SUGGESTION ON THE OPEN QUESTION, AND WHY: the suggested option's reason as it was filed, braces and all, so its
   * rows are links (`Cited`), and the one share the question's body gives in its `evidence` field, drawn as squares. The
   * share is never read out of the reason's words, so a body with no `evidence` draws words and no chart.
   */
  const leadWhy = $derived.by(() => {
    if (!lead || from !== 'live') return null;
    const option = lead.options.find((o) => o.recommended);
    if (!option) return null;
    const body = aboutFor(lead)?.body;
    const text = reasonIn(body, option.key) ?? option.body;
    const figures = figuresIn(body);
    return { option, text, figures, evidence: evidenceIn(body, now) };
  });

  /**
   * WHAT ACCEPTING THE OPEN QUESTION DOES, in a line each: the arrangement's lead, what a proposal puts in place, or the
   * rows it changes; then what deciding late costs, as whoever asked wrote it. The whole of each is the tile under the
   * lead; these are its headlines, above the options that approve it.
   *
   * AN INSTALL THAT SENDS A KEY OUT SAYS SO HERE, in the sentence the plan sheet says before an install: the key by its
   * label, the host and how often (the kernel's `doesOf` over the body's `calls_out` or `egress`). Turning an add-on on
   * or off arms nothing new, and a body that carries no calls adds no line.
   */
  function doesOf(q: Question): { icon: IconName; text: string }[] {
    const out: { icon: IconName; text: string }[] = [];
    const story = stories.get(q.id);
    const preview = previews.get(q.id);
    const updates = changed.get(q.id) ?? [];
    const set = rowsetOf(q);
    if (story) out.push({ icon: 'settings', text: story.summary ? copy.arrangeLeadSummary(story.lead, story.summary) : story.lead });
    else if (preview) for (const a of preview.appears.slice(0, 3)) out.push({ icon: 'doc', text: `${a.kind}: ${a.title}` });
    else if (set && updates.length) out.push({ icon: 'rows', text: copy.decideRows(updates.length, listName(set.register)) });
    const about = aboutFor(q);
    const sends = about?.kind === 'pack' && typeof about.body.install === 'string' ? sendsSaid('install', about.body) : '';
    if (sends) out.push({ icon: 'key', text: sends });
    if (q.cost) out.push({ icon: 'clock', text: symbolText(q.cost) });
    return out;
  }

  /* DECIDED LATELY IS THE FIRST FEW, and "All decisions" draws the whole ledger in place, capped as every list is. */
  let allDecided = $state(false);
  const decidedShown = $derived(allDecided ? DECIDED.slice(0, DOM_CAP) : DECIDED.slice(0, DECIDED_FIRST));

  /** What a question takes without a choice: its suggested option, or accepting a change. */
  const approveKey = (q: Question): string | null => {
    const suggested = q.options.find((o) => o.recommended);
    /* A SUGGESTED ANSWER THAT IS ITSELF HARD TO UNDO IS NOBODY'S TO TAKE WITHOUT CHOOSING IT, alone or in a batch. */
    if (suggested?.hard === true) return null;
    return suggested?.key ?? (q.options.some((o) => o.key === 'accept') ? 'accept' : null);
  };

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

  /**
   * WHAT THE KEYS ACT ON: the cursor's question, or the open one while the cursor is on nothing. The lead prints its
   * keys, 1 2 3, so they have to answer it before anybody has pressed `j`; the first `j` still puts the cursor on it,
   * which is the change a person can see.
   */
  const keyed = $derived(order[cursor] ?? (cursor < 0 ? lead : undefined));

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

    const q = keyed;
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
        /* A NUMBER NEVER GIVES AN ANSWER THAT CANNOT BE TAKEN BACK: it opens the question, where Decide says so. */
        if (option.hard === true) void goto(at(`/decide/${q.id}`));
        else void take(q, option.key);
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

<!-- THE SENTENCE SAYS HOW MANY WAIT, in words with the first question's suggestion, so the title carries no count. The
     group control and Select are glass and only drawn when there are two questions to group or pick between, or while
     picking, so the way out stays; asking yourself a question is the one ink pill, and only for somebody who may
     answer: a question a reader could ask and never settle is a question left in everybody else's queue. -->
<PageHead icon="decide" title={said('decide')} sentence={sentence?.text} needs={sentence?.needs || undefined}>
  {#snippet actions()}
    {#if from === 'live' && (open.length > 1 || selecting)}
      <Segmented class="group-by" role="group" aria-label={copy.decideGroup}>
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
      </Segmented>
      <Button
        weight="glass"
        aria-pressed={selecting}
        onclick={() => {
          selecting = !selecting;
          if (!selecting) picked = new Set();
        }}>{selecting ? copy.decideSelectDone : copy.decideSelect}</Button
      >
    {/if}
    {#if answerable}<Button weight="primary" onclick={() => (asking = true)}>{WORDS.ask}</Button>{/if}
  {/snippet}
</PageHead>

<AskSheet open={asking} onclose={() => (asking = false)} onfiled={filed} />

<!-- ONE CARD FOR THE OPEN QUESTION AND FOR EVERY ROW. `open` is the lead tile's: what accepting does, the suggestion
     and why, and its evidence, above the options. A row carries its previews in place instead, because the calls an
     arrangement makes are read before it is accepted, wherever it is accepted from. -->
{#snippet card(q: Question, isLead: boolean)}
  {@const said = answers.get(q.id)}
  {@const updates = changed.get(q.id) ?? []}
  {@const preview = previews.get(q.id)}
  {@const decidedHere = settledHere.get(q.id)}
  {@const story = stories.get(q.id)}
  {@const part = partHere.get(q.id)}
  <li
    class="q"
    id="q-{q.id}"
    tabindex="-1"
    aria-label={q.title}
    data-lead={isLead ? '' : undefined}
    data-keys={keyed?.id === q.id ? '' : undefined}
    data-cursor={order[cursor]?.id === q.id ? '' : undefined}
    data-done={decidedHere !== undefined ? '' : undefined}
  >
    {#if decidedHere !== undefined}
      <!-- DECIDED HERE: one line in the question's place, and the way to the decision it became. -->
      <a class="q-receipt" href={at(`/decide/${q.id}`)}>
        <span class="q-tick"><Icon name="check" size="s" /></span>
        <span class="q-receipt-text"><span class="q-title">{q.title}</span> <span class="q-said">{copy.decideDecided(decidedHere)}</span></span>
      </a>
      {@const did = appliedHere.get(q.id)}
      {#if did}<div class="q-applied"><Applied lines={did} /></div>{/if}
    {:else}
      <!-- THE ONE DECISION CARD (`lib/decide/DecisionCard.svelte`), as every other screen draws a question: why first, who
           asked, what it moves, the suggestion as an outline with a small dot. This screen answers its presses itself
           (`take`), so a press picks and the reason under it sends, as it always has here; the card writes nothing. -->
      <div class="q-top">
        <IconWell name="decide" size="l" />
        <div class="q-card">
          <DecisionCard
            question={queueOf(q, aboutFor(q))}
            may={answerable}
            n={1}
            keys={keyed?.id === q.id}
            link
            idOf={(key) => `opt-${q.id}-${key}`}
            onpress={(key) => void take(q, key)}
          />
        </div>
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

      {#if isLead}
        {@const does = doesOf(q)}
        {#if does.length}
          <ul class="q-does">
            {#each does as line, i (i)}
              <li><Icon name={line.icon} size="m" /><span>{line.text}</span></li>
            {/each}
          </ul>
        {/if}
        <!-- THE SUGGESTION, WHY, AND THE SHARE ITS REASON CLAIMS: shown, never pre-selected. The option below it is not
             filled, moved first or focused, so it is found rather than chosen (19 §4, 20 §3). -->
        {#if leadWhy}
          <section class="q-rec" aria-labelledby="q-{q.id}-rec">
            <h3 class="q-rec-h" id="q-{q.id}-rec">{LEAD.suggested(leadWhy.option.title)}</h3>
            {#if leadWhy.evidence}
              {@const ev = leadWhy.evidence}
              <div class="q-ev">
                <Waffle
                  parts={[
                    { label: '', value: ev.value, tone: 'ink' },
                    { label: '', value: ev.max - ev.value, tone: 'g3' },
                  ]}
                  summary={ev.said}
                />
                <p class="q-ev-key num">{LEAD.ofMax(ev.value.toLocaleString('en-GB'), ev.max.toLocaleString('en-GB'))}</p>
              </div>
            {/if}
            {#if leadWhy.text.trim() !== ''}
              <p class="q-rec-why"><Cited text={leadWhy.text} figures={leadWhy.figures} {now} /></p>
            {/if}
          </section>
        {/if}
      {:else if story}
        <div class="q-changes"><Arranged arranged={story} compact /></div>
      {:else if preview}
        <section class="q-changes" aria-label={copy.proposalWillAppear}><Proposed proposed={preview} /></section>
      {:else if updates.length}
        <div class="q-changes"><Changes {updates} compact /></div>
      {/if}

      {#if part}<div class="q-part"><Applied partial={part} /></div>{/if}

      <!-- THE VERBS, BESIDE THE LINK AND NOT INSIDE IT: above it opens the question, below it answers it. -->
      <div class="q-act">
        {#if said}
          {@const state = reasonState(said.reason)}
          <div class="said">
            <span class="said-what">{SAY.answered(said.title)}</span>
            <!-- THE ROW STAYS AND OFFERS THE WAY BACK. -->
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
        {/if}
        {#if fixes.get(q.id)}
          <p class="why-fix" role="status" data-intent="bad">{fixes.get(q.id)}</p>
        {/if}
      </div>
    {/if}
  </li>
{/snippet}

<!-- THE REST OF THE QUEUE, ON THE GROUND. Ranked, it starts after the open question; grouped, every question is a row
     under the heading of what it is about. The keys show once the keyboard is in the queue. -->
{#snippet waitingList()}
  <Section title={LEAD.waiting}>
    {#snippet aside()}
      {#if waiting.length > 1}<span class="hint" aria-hidden="true"><Kbd keys="j" /><Kbd keys="k" /><span>{LEAD.switch}</span></span>{/if}
    {/snippet}
    {#if grouping === 'none'}
      <div class="group" data-picking={picked.size > 0 || selecting ? '' : undefined}>
        <!-- THE ORDER IS SAID OUT LOUD, because a list whose order cannot be seen is a list a reader assumes is
             arbitrary, and this one is not: it is dearest-to-get-wrong first. -->
        <ol class="queue" start={2} aria-label={copy.rankedBy}>
          {#each order.slice(1) as q (q.id)}{@render card(q, false)}{/each}
        </ol>
      </div>
    {:else}
      {#each groups as g (g.key)}
        <div class="group" data-picking={picked.size > 0 || selecting ? '' : undefined}>
          <h3 class="group-head">{g.name}<span class="group-n num">{g.items.length}</span></h3>
          <ol class="queue">
            {#each g.items as q (q.id)}{@render card(q, false)}{/each}
          </ol>
        </div>
      {/each}
    {/if}

    {#if waiting.length === 0}
      <Empty kind="cleared" compact title={said('no_questions')}>
        {#snippet actions()}
          {#if Number(route.data.inbox ?? 0) > 0}<Button href="/inbox">{copy.decideOpenInbox}</Button>{/if}
        {/snippet}
      </Empty>
    {/if}
  </Section>
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
    <!-- WHY THE ANSWERS ARE OFF, ABOVE THE QUESTIONS AND NOT AFTER A PRESS. It is the record's own
         refusal, said before anybody has typed a word, and it ends by saying that reading is what
         this colleague still holds. Every option button and the batch commit point at it. -->
    {#if !answerable}
      <p class="cannot" id="cannot-decide">{whyNot}</p>
    {/if}

    <div class="decide-grid">
      <div class="col">
        {#if lead}
          <!-- THE OPEN QUESTION, whole, in the lead tile: its own `ol.queue`, so the cursor, the ids and the answers are
               the rows' own. -->
          <Tile lead aria-labelledby="q-{lead.id}-title">
            <div class="group" data-picking={picked.size > 0 || selecting ? '' : undefined}>
              <ol class="queue queue-lead">{@render card(lead, true)}</ol>
            </div>
          </Tile>

          <!-- WHAT ACCEPTING IT WOULD CHANGE, whole, under it: the rows it changes, what it puts in place, or the
               arrangement with every call it makes. Gone once it is decided, since there is nothing left to approve. -->
          {#if !settledHere.has(lead.id)}
            {@const story = stories.get(lead.id)}
            {@const preview = previews.get(lead.id)}
            {@const updates = changed.get(lead.id) ?? []}
            {@const set = rowsetOf(lead)}
            {#if story}
              <Tile icon="settings" title={LEAD.does}><Arranged arranged={story} /></Tile>
            {:else if preview}
              <Tile icon="doc" title={copy.proposalWillAppear}><Proposed proposed={preview} /></Tile>
            {:else if updates.length}
              <Tile icon="rows" title={changeWords.heading} count={updates.length}>
                <Changes {updates} compact />
                {#if set}<p class="reading">{copy.decideRows(updates.length, listName(set.register))}.</p>{/if}
              </Tile>
            {/if}
          {/if}
        {:else}
          {@render waitingList()}
        {/if}
      </div>

      <div class="col">
        <!-- HOW LONG EACH HAS WAITED: a chart only when there is more than one to compare, and its one reading line. -->
        {#if waiting.length > 1}
          <Tile icon="clock" title={LEAD.waited}>
            <Bars items={waited.items} format={waitedWords} subject={LEAD.waited} />
            <p class="reading">{waited.reading} {copy.aimFor(aim)}.</p>
          </Tile>
        {/if}
        {#if lead && (order.length > 1 || waiting.length === 0)}
          <div class="side-list">{@render waitingList()}</div>
        {/if}
      </div>
    </div>

    {#if picked.size > 0}
      <!-- THE SELECTION'S BAR, glass chrome floating at the foot of the view, drawn after the queue so opening it moves
           nothing above it. -->
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
  {/if}

  <!-- WHAT WAS PUT OFF, the soonest back first. The queue above leaves a deferred question out until its day comes, so
       without this list a question put off was a question nobody could find until it reappeared. -->
  {#if from === 'live' && views.later.length}
    <Section title={WORDS.later}>
      <ul class="ledger ledger-lead">
        {#each views.later.slice(0, DOM_CAP) as q (q.id)}
          <li>
            <a class="line line-tall" href={at(`/decide/${q.id}`)}>
              <span class="line-mark"><IconWell name="clock" size="l" /></span>
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
    <Section title={WORDS.calls}>
      <ul class="ledger ledger-lead">
        {#each views.calls as c (c.id)}
          {@const when = dayWord(c.at, now)}
          <li>
            {#snippet body()}
              <span class="line-mark"><IconWell name="observe" size="l" tone={c.went === 'met' ? 'earn' : undefined} /></span>
              <span class="line-main">
                <span class="line-title">{c.claim}</span>
                <span class="line-detail call-went" data-went={c.went}>
                  {#if c.went === 'met'}<Icon name="check" size="s" />{WORDS.met}{:else if c.went === 'missed'}<Icon name="close" size="s" />{WORDS.missed}{:else if c.went === 'unread'}{WORDS.unread}{:else}<Icon name="clock" size="s" />{WORDS.due(when)}{/if}
                </span>
              </span>
              {#if c.went !== 'due' && when}<span class="line-when">{WORDS.checked(when)}</span>{/if}
            {/snippet}
            {#if c.about}<a class="line line-tall" href={at(`/decide/${c.about}`)}>{@render body()}</a>{:else}<div class="line line-tall">{@render body()}</div>{/if}
          </li>
        {/each}
      </ul>
    </Section>
  {/if}

  <!-- DECIDED LATELY: the answer each one got and the reason it kept, the newest first. The first few, then the whole
       ledger in place under "All decisions", capped and paged as it always was. -->
  {#if DECIDED.length}
    <Section title={LEAD.decided} count={decidedTotal}>
      {#snippet aside()}
        {#if !allDecided && decidedTotal > DECIDED_FIRST}
          <Button weight="bare" size="sm" onclick={() => (allDecided = true)}>{LEAD.allDecided}<Icon name="arrow" size="s" /></Button>
        {/if}
      {/snippet}
      <ul class="ledger ledger-lead">
        {#each decidedShown as q}
          <!-- THE OPTION BY ITS LABEL. A live decision keeps the option's id, and its options come from the suggestion it settled. -->
          {@const choseTitle = q.options.find((o) => o.key === q.decided?.option)?.title}
          <li>
            <a class="line line-tall" href={at(`/decide/${q.id}`)}>
              <span class="line-mark"><IconWell name="check" size="l" tone="earn" /></span>
              <span class="line-main">
                <span class="line-title">{q.title}</span>
                <span class="line-detail">{#if choseTitle}<span class="decided-choice">{choseTitle}</span> {/if}{q.decided?.reason}</span>
              </span>
              <span class="line-when">{since(q.decided?.at ?? '', now)}</span>
            </a>
          </li>
        {/each}
      </ul>
      {#if allDecided}
        <!-- THE WHOLE LEDGER IS `DECIDED.slice(0, DOM_CAP)`, and the line under it says when it holds more. -->
        <CapLine shown={Math.min(DECIDED.length, DOM_CAP)} total={decidedTotal} />
        {#if from === 'live' && live?.older && live.older.cursor !== null}
          <div class="older">
            <Button weight="quiet" onclick={loadOlder} disabled={loadingOlder}>{copy.olderEntries}</Button>
          </div>
        {/if}
        {#if olderFix}<p class="older-fix" role="status">{olderFix}</p>{/if}
      {/if}
    </Section>
  {/if}
</div>

<style>
  .page {
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    gap: var(--sp-7);
    padding: var(--sp-4) var(--gutter) var(--sp-9);
  }

  /* THE STANDING SENTENCE OVER THE QUEUE, at the weight of a hint rather than an alarm: nothing has
     gone wrong, and this reader is doing exactly what they were invited to do. `--measure` because
     it is three sentences and a line that runs the width of the page is a line nobody reads. */
  .cannot {
    margin: 0;
    max-inline-size: var(--measure);
    color: var(--ink2);
    font-size: var(--t-base);
    line-height: var(--lh-body);
  }

  /* ── the layout: the open question and what it changes, beside how long each has waited and the rest ─────── */

  /* ONE COLUMN UNTIL THE CONTENT IS WIDE ENOUGH FOR TWO, measured on the content and not the window, so a docked panel
     or a narrow window gets the single column rather than a squeezed second one. */
  .decide-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
    gap: var(--sp-3);
  }

  @container (inline-size >= 60rem) {
    .decide-grid {
      grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
      column-gap: var(--sp-5);
    }
  }

  .col {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  /* A LIST UNDER A TILE stands a little further off than two tiles do, so it reads as the ground and not a third tile. */
  .side-list:not(:first-child) {
    margin-block-start: var(--sp-4);
  }

  /* THE ONE WRITTEN LINE UNDER A CHART OR A TABLE, saying what it means. */
  .reading {
    margin: 0;
    max-inline-size: var(--measure);
    color: var(--ink);
    font-size: var(--t-base);
    line-height: var(--lh-body);
  }

  /* ── the hints and the groups ──────────────────────────────────────────── */

  /* THE KEYS SHOW ONCE THE KEYBOARD IS IN THE COLUMN, never standing: a click or a tap never brings them, and `?` lists
     them all. */
  .hint {
    display: none;
    align-items: center;
    gap: var(--sp-1);
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .col:has(:focus-visible) .hint {
    display: inline-flex;
  }

  .hint > span {
    margin-inline-start: 2px;
  }

  .group + .group {
    margin-block-start: var(--sp-5);
  }

  /* A GROUP'S HEADING, a step under the section's: the row size at 600, its count in the quiet ink, and a hairline. */
  .group-head {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
    margin: 0 0 var(--sp-1);
    padding-block: var(--sp-2);
    border-block-end: 1px solid var(--line);
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--t-row);
    font-weight: 600;
  }

  .group-n {
    color: var(--dim);
    font-weight: 500;
  }

  /* ── a question ─────────────────────────────────────────────────────────── */

  /* THE ROWS REACH A STEP PAST THE TEXT COLUMN, as `rows.css` has them, so a title lines up with the heading above it
     and its rounded wash still has somewhere to be. The lead's list is inside a tile and sits on its padding. */
  .queue {
    display: flex;
    flex-direction: column;
    margin: 0 calc(-1 * var(--sp-3));
    padding: 0;
    list-style: none;
  }

  .queue-lead {
    margin: 0;
  }

  /**
   * A QUESTION IS A ROW ON THE GROUND, NOT A CARD. The link is the top of the item and the answers sit under it as
   * siblings, because a button may not live inside a link. Hover and the cursor are the rounded wash; a hairline runs
   * between two rows and steps aside for a washed one, so the fill is one clean shape.
   */
  .q {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    padding: var(--sp-3);
    border-radius: var(--r-md);
    scroll-margin-block: var(--sp-7);
    transition: background var(--d-state) var(--ease-out);
  }

  .queue > .q + .q::after {
    content: '';
    position: absolute;
    inset-block-start: 0;
    inset-inline: var(--sp-3);
    block-size: 1px;
    background: var(--line);
    pointer-events: none;
    transition: opacity var(--d-state) var(--ease-out);
  }

  .q:not([data-lead])[data-cursor] {
    background: var(--hover-wash);
  }

  .q[data-cursor]::after,
  .q[data-cursor] + .q::after {
    opacity: 0;
  }

  @media (hover: hover) and (pointer: fine) {
    .q:not([data-lead]):hover {
      background: var(--hover-wash);
    }

    .q:not([data-lead]):hover::after,
    .q:not([data-lead]):hover + .q::after {
      opacity: 0;
    }
  }

  /* THE CURSOR IS THE FOCUS RING while it is the keyboard's, drawn round the question. A pointer reader never sees it. */
  .q:focus-visible {
    outline: 2px solid var(--focus-in);
    outline-offset: 2px;
  }

  .q[data-lead] {
    gap: var(--sp-4);
    padding: 0;
  }

  .q[data-lead]:focus-visible {
    outline-offset: var(--sp-3);
    border-radius: var(--r-md);
  }

  /* A DECIDED QUESTION IS ONE LINE, and the rule over it stays so the list keeps its rhythm. */
  .q[data-done] {
    padding-block: var(--sp-3);
  }

  .q-receipt {
    display: flex;
    align-items: baseline;
    gap: var(--sp-1) var(--sp-2);
    color: var(--dim);
    font-size: var(--t-base);
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

  /* THE WELL, THE WORDS AND THE SELECTION CHECK, and everything under them starts on the words' edge. */
  .q-top {
    display: grid;
    grid-template-columns: var(--well-l) minmax(0, 1fr) auto;
    align-items: start;
    gap: var(--sp-3);
  }

  .q:not([data-lead], [data-done]) > :not(.q-top) {
    margin-inline-start: calc(var(--well-l) + var(--sp-3));
  }

  /* THE CARD BESIDE THE WELL answers the width it is given, and sits in the row with no hairline or air of its own:
     the row draws both. */
  .q-card {
    min-inline-size: 0;
    container-type: inline-size;
  }

  .q-card > :global(.queue-card) {
    padding-block: 0;
    border-block-start: 0;
  }

  .q-title {
    color: var(--ink);
    font-size: var(--t-row);
    font-weight: 500;
    line-height: 20px;
  }

  /* ── what accepting does, the suggestion, and its evidence (the open question only) ───────────────────── */

  .q-does {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    margin: 0;
    margin-inline-start: calc(var(--well-l) + var(--sp-3));
    padding: 0;
    list-style: none;
    color: var(--ink);
    font-size: var(--t-base);
    line-height: var(--lh-body);
  }

  .q-does > li {
    display: flex;
    align-items: start;
    gap: var(--sp-3);
  }

  .q-does :global(.icon) {
    flex: none;
    margin-block-start: 2px;
    color: var(--ink2);
  }

  .q-rec {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    padding-block-start: var(--sp-4);
    border-block-start: 1px solid var(--line);
  }

  .q-rec-h {
    margin: 0;
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--t-row);
    font-weight: 600;
    line-height: 20px;
  }

  .q-rec-why {
    margin: 0;
    max-inline-size: var(--measure);
    color: var(--ink);
    font-size: var(--t-base);
    line-height: var(--lh-body);
  }

  .q-ev {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    margin-block-start: var(--sp-1);
  }

  .q-ev-key {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  /* ── the selection check ───────────────────────────────────────────────── */

  /* A 20PX ROUND CHECK at the trailing edge of the title, and only where it is wanted: under the pointer, on the
     cursor, or once something is selected. It keeps its space when hidden, so showing it moves nothing. */
  .pick {
    display: grid;
    place-items: center;
    box-sizing: border-box;
    inline-size: 20px;
    block-size: 20px;
    margin-block-start: 2px;
    padding: 0;
    background: none;
    border: 1.5px solid var(--dim);
    border-radius: var(--r-pill);
    color: var(--on-ink);
    cursor: pointer;
    visibility: hidden;
    transition:
      background var(--d-state) var(--ease-out),
      border-color var(--d-state) var(--ease-out);
  }

  .pick[data-on] {
    background: var(--ink);
    border-color: var(--ink);
  }

  .q:hover .pick,
  .q[data-cursor] .pick,
  .pick:focus-visible,
  .group[data-picking] .pick {
    visibility: visible;
  }

  /* ON A PHONE THE CHECK IS A THUMB'S: larger, reached through a 44px square round it, and shown only once `Select` is
     pressed, because nothing hovers there to reveal it. */
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

  /* ── the answers ───────────────────────────────────────────────────────── */

  .q-act {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
  }

  .said {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2) var(--sp-3);
  }

  .said-what {
    color: var(--ink2);
    font-size: var(--t-base);
  }

  .why {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    max-inline-size: var(--measure);
  }

  .why-label {
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  /* A FIELD IS 40 ON `--s1` IN A TILE AND ON THE TILE'S OWN WHITE ON THE GROUND, radius 12, and no border: the fill is
     its edge. */
  .why-field {
    inline-size: 100%;
    min-block-size: 40px;
    padding: 10px var(--sp-3);
    background: var(--bg);
    border: 0;
    border-radius: var(--r-md);
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--t-ui);
    line-height: var(--lh-body);
    resize: vertical;
    /* THE REASON STAYS ABOVE THE KEYBOARD, with room under it for Send: a focused field scrolls clear of the sticky bar
       above and of `--kb` below, which is the keyboard's height once it is up and nothing before. */
    scroll-margin-block-start: calc(var(--sticky) + var(--sp-4));
    scroll-margin-block-end: calc(var(--kb) + var(--ctl-h) + var(--sp-6));
  }

  .q[data-lead] .why-field {
    background: var(--s1);
  }

  .why-note {
    margin: 0;
    max-inline-size: var(--measure);
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .send {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2) var(--sp-4);
  }

  /* The chords, beside the button they stand for, while the reason is being written. A phone has no keyboard to press
     them with. */
  .keys {
    display: none;
    align-items: center;
    gap: var(--sp-1);
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .why:focus-within .keys {
    display: inline-flex;
  }

  .keys :global(.kbd-run + .kbd-run),
  .keys :global(.kbd-run:not(:first-child)) {
    margin-inline-start: var(--sp-3);
  }

  .why-fix {
    margin: 0;
    max-inline-size: var(--measure);
    font-size: var(--t-base);
  }

  /* ── the selection's bar: glass chrome at the foot of the view ─────────────────────────────── */

  /* AT THE TRAILING EDGE, as wide as it needs, so a toast at the leading edge and the bar do not meet. Level two: the
     strong glass, its hairline pair and the floating shadow; its field is the wash on glass the rail's ask field is. */
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
    padding: 6px 6px 6px var(--sp-4);
    background: var(--glass-strong);
    backdrop-filter: var(--glass-blur);
    border-radius: var(--r-lg);
    box-shadow: var(--glass-edge), var(--e2);
  }

  /* Safari before 18 knows the blur only by its prefixed name, and lightningcss folds a same-rule pair into one. */
  @supports (-webkit-backdrop-filter: none) {
    .batch {
      -webkit-backdrop-filter: var(--glass-blur);
    }
  }

  .batch-n {
    color: var(--ink);
    font-size: var(--t-base);
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }

  .batch-why {
    flex: 0 1 18rem;
    inline-size: 18rem;
    min-inline-size: 0;
    min-block-size: var(--ctl-h);
    padding: 0 var(--sp-3);
    background: var(--hover-wash);
    border: 0;
    border-radius: var(--r-md);
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--t-ui);
  }

  /* A question the cursor lands on clears the bar, which stands over the foot of the view. */
  .group[data-picking] .q {
    scroll-margin-block-end: var(--sp-9);
  }

  .batch-note {
    flex: 1;
    color: var(--ink2);
    font-size: var(--t-base);
  }

  /* ── the lists under the queue ─────────────────────────────────────────── */

  /* THE PRESS FOR OLDER DECISIONS, under the ledger it adds to. */
  .older {
    display: flex;
    margin-block: var(--sp-3);
  }

  .older-fix {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  /* A WELL, THE WORDS, AND WHEN, on every width. `rows.css` gives a lead column; on a phone the when goes under the
     words and the well stands beside both, so every title starts on one edge. */
  .ledger :global(.line) {
    grid-template-columns: var(--well-l) minmax(0, 1fr) auto;
    gap: var(--sp-1) var(--sp-3);
  }

  @media (width < 640px) {
    .ledger :global(.line) {
      grid-template-columns: var(--well-l) minmax(0, 1fr);
      align-items: start;
    }

    .ledger :global(.line-mark) {
      grid-column: 1;
      grid-row: 1 / span 2;
    }

    .ledger :global(.line-main) {
      grid-column: 2;
      grid-row: 1;
    }

    .ledger :global(.line-when) {
      grid-column: 2;
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
    color: var(--ink);
    font-weight: 500;
  }

  /* THE COMPACT BAR IS GLASS ALREADY, and glass never holds glass: the segmented track drops its own there. */
  :global(.head[data-under] .segmented.group-by) {
    background: transparent;
    box-shadow: none;
    backdrop-filter: none;
  }

  @supports (-webkit-backdrop-filter: none) {
    :global(.head[data-under] .segmented.group-by) {
      -webkit-backdrop-filter: none;
    }
  }

  /* NO KEY IS PRINTED WHERE THERE IS NO KEYBOARD, and the group control, a desk's nicety, gives way on a phone. */
  @media (width < 900px), (pointer: coarse) {
    .why:focus-within .keys,
    .col:has(:focus-visible) .hint {
      display: none;
    }
  }

  @media (width < 900px) {
    .page {
      gap: var(--sp-6);
      padding: var(--sp-4) var(--gutter) var(--sp-8);
    }

    :global(.segmented.group-by) {
      display: none;
    }

    /* A PHONE'S ROW IS 60, and the bar sits above the tab bar. */
    .q:not([data-lead]) {
      min-block-size: 60px;
    }

    .batch {
      inset-block-end: calc(var(--tabbar) + var(--sp-3));
    }

    .batch .batch-note {
      flex-basis: 100%;
    }
  }
</style>
