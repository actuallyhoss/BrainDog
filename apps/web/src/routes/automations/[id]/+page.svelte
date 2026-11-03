<!--
  One automation on the canvas: `/automations/<id>`, and `/automations/new` for a new one.

  THE TRIGGER CARD ON TOP, THEN THE STEPS IN A COLUMN, and a branch's two arms as two columns under it. That is the
  whole geometry: nothing has an x or a y, so every drag, key and menu entry is a move between lists (`lib/flow`).

  ONE DRAFT, SENT ONCE, AS AN AGENT WOULD SEND IT. A save files a `change` to `rule.<id>` through `propose` with the
  whole body and the version it was opened at (`flow.ts` `proposalOf`), the proposal `packages/mcp` documents for an
  agent, and a canvas edit and an agent's edit are the same thing to review. FOR THE OWNER IT IS ONE PRESS: "Save and
  turn on" files the change and accepts it at once (`decide`), as `record/field-write.ts` does for a new field, so the
  owner never walks to Needs you to approve what they drew a second ago. Anybody else's save waits there for the owner.

  WHAT IS WRONG IS SAID BEFORE THE BUTTON, on the card it is about: the builder's own reading first (`faultsOf`), and
  once that is clear, the record's (`checkAutomation`), which is the install's own lint and names the step by its place
  in the body. The page puts it on the card at that place (`FlowDraft.serve`).

  TRY IT BEFORE SAVING IT. A run is tried by the real runner over a sample picked in the panel (`tryAutomation`), and
  every card is painted with how its step went; an inline rule is walked over its list by the dry run (`Tried.svelte`).
  Neither writes anything.

  THE LIFECYCLE IS IN THE HEAD'S MENU: turn it off and on (`setAutomation`, a new version landed at once), duplicate it
  into a new draft, and delete it (`retireDeclaration`). Rename is offered only once it is saved, since a new draft's
  name is the first field of its trigger's sheet.

  RUNS, VERSIONS AND "AS WRITTEN". Runs pages back through the record's runs, and a run opens in a sheet drawn on the
  canvas of the version it ran under, with Run it again. Versions lists what was installed, what changed from the one
  before in the steps' own words, and puts an older one back on the canvas to be saved. As written is the declaration
  itself, one click away and never the only way to see it (21 §3.1's text lens).

  THE LOOK. The trigger and every step are tiles on the ground, joined by `--rule`
  lines, each with its icon in a well; the card being edited has an ink well and the docked panel beside it
  (`Inspector.svelte`), so the flow stays in view while it is filled in. Try it is a tile under the flow, and Try and
  Save ride in a bar at the foot. Runs opens on a tile of how the last runs went, a bar of their endings and a
  sparkline of how long each took, with the one line that says what they mean, and the runs sit on the ground under
  it; Versions are rows on the ground, and As written is the declaration in a tile. The sentence under the title is the
  last run and the next, and a failed last run is its red phrase.
-->
<script lang="ts">
  /* A VERSION'S CHANGES ARE THE DIFF KIND'S LINES (`kinds/diff.css`), with this screen's own rules over them. */
  import '@braindog/skin/kinds/diff.css';
  import { createClient } from '@braindog/client';
  import { apiBase, at } from '$lib/at.ts';
  import { untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import { MediaQuery } from 'svelte/reactivity';
  import { page } from '$app/state';
  import { since } from 'braindog-render';
  import { titleOf } from '$lib/title.ts';
  import { actor, listName } from '$lib/record/names.ts';
  import { installWords, openActions, type ActionRow, type CallOut } from '$lib/record/actions.ts';
  import CallsOut from '$lib/ui/CallsOut.svelte';
  import { recordNow, type Shell } from '$lib/record/boot-live.ts';
  import { hostedHere } from '../../settings/billing.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import { Sparkline, Stacked } from '$lib/viz/index.ts';
  import Menu from '$lib/ui/Menu.svelte';
  import Segmented from '$lib/ui/Segmented.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { covered, typing } from '$lib/a11y/keys.svelte.ts';
  import { copy } from '$lib/copy.ts';
  import { closed, drew, opened } from '$lib/ui/screen.svelte.ts';
  import FlowList from '$lib/flow/FlowList.svelte';
  import { grammarNow, grammarState, loadGrammar } from '$lib/flow/grammar.ts';
  import Inspector from '$lib/flow/Inspector.svelte';
  import RunView from '$lib/flow/RunView.svelte';
  import Tried from '$lib/flow/Tried.svelte';
  import { FlowDraft } from '$lib/flow/flow.svelte.ts';
  import { ROOT, callsIn, freshId, learnScripts, listsIn, sayInWhole, sayStart, triggerKind, words } from '$lib/flow/flow.ts';
  import { wholeSentence } from '../sentence.ts';
  import { learn } from '$lib/record/remote.ts';
  import {
    diffLines,
    durationOf,
    editWords,
    lasted,
    openAutomations,
    planPlaces,
    sampleOf,
    sayLines,
    stepAnswer,
    type Answer,
    type AutomationRow,
    type Pick,
    type Pickable,
    type RowsRead,
    type RunRow,
    type Source,
    type Tried as TriedAnswer,
    type TryRun,
    type Version,
  } from '$lib/flow/source.ts';
  import { canvasWords, lastRunReading, pageSentence, runDurations, runGroups, runMark, runParts, triggerIcon } from '../hub.ts';
  import { plainSay } from '$lib/flow/plain-fail.ts';
  import { contestLines, contestOf, fieldOf, nameFor } from './run-again.ts';
  import { actorOf, mutedAfter, mutedOf, tellsQuietly } from '../../settings/[area]/muted.ts';

  const flow = new FlowDraft({ slash: () => page.data.slash === true });

  /* WHETHER THIS RULE TELLS HIM, ON ITS OWN PAGE: Settings > Notifications listed every rule that tells you, one
     read each, and now sends here. Off puts the rule in his own `notify.muted` (`../../settings/[area]/muted.ts`), so its
     notices leave his Today feed and nobody else's; an urgent one still shows. */
  const tellWords = { stop: 'Stop telling me', start: 'Tell me again', stopped: 'It no longer tells you', started: 'It tells you again' };
  let mutedNow = $state<string[] | null>(null);
  const mutedList = $derived(mutedNow ?? mutedOf((page.data.me as { prefs?: Record<string, unknown> } | undefined)?.prefs?.['notify.muted']));
  let telling = $state(false);
  async function flipTell(id: string): Promise<void> {
    if (telling) return;
    const actor = actorOf(id);
    const was = mutedList;
    const next = mutedAfter(was, actor, was.includes(actor));
    telling = true;
    mutedNow = next ?? [];
    const out = await createClient({ base: apiBase() })
      .setPref('notify.muted', next)
      .catch(() => null);
    telling = false;
    if (out?.ok) return void toasts.push(was.includes(actor) ? tellWords.started : tellWords.stopped);
    mutedNow = was;
    toasts.push(out && 'refusal' in out ? out.refusal.fix : copy.recordNotReached);
  }

  const cap = (s: string): string => (s === '' ? s : s[0]!.toUpperCase() + s.slice(1));

  /**
   * THE RECORD'S REFUSALS THAT ARE ABOUT THE CALLER OR THE WIRE, NOT THE BODY. A check refused for one of these says
   * nothing about the steps, so it paints no card and holds no save back; the save meets the same answer and says it.
   */
  const QUIET: ReadonlySet<string> = new Set(['UNREACHABLE', 'UNAUTHORIZED', 'ROUTE_UNKNOWN', 'LEVEL_REQUIRED', 'FORBIDDEN']);
  /** How long the canvas rests before the record is asked about it, so a name typed letter by letter is asked once. */
  const CHECK_AFTER = 500;

  let from = $state<'reading' | 'ready' | 'missing' | 'refused'>('reading');
  let source = $state<Source | null>(null);
  let row = $state<AutomationRow | null>(null);
  let taken = $state<string[]>([]);
  /** Every rule's name by its handle, from the list read, so a dry run's "taken by" says names and never handles. */
  let ruleNames = $state<ReadonlyMap<string, string>>(new Map());
  let fix = $state('');
  /* THE PHONE'S HEAD (PageHead under 900px). */
  const phone = new MediaQuery('(width < 900px)', false);
  let tab = $state<'steps' | 'runs' | 'versions' | 'written'>('steps');
  let busy = $state(false);
  /* THE RECORD'S GRAMMAR, read when the editor opens. Over a record older than the app, or one whose grammar could not be
     read, the automation opens read only: one line says why, and nothing is sent or tried. */
  /* THE TAB'S GRAMMAR, FOLLOWED BY ITS OWN SUBSCRIPTION and not `$grammarState`: Svelte's store helpers would go into
     the runtime every screen loads (the entry budget). */
  let grammarRead = $state.raw(grammarNow());
  $effect(() => grammarState.subscribe((s) => (grammarRead = s)));
  const lockedSay = $derived(grammarRead.state === 'older' || grammarRead.state === 'unread' ? grammarRead.say : null);
  $effect(() => void loadGrammar());
  let filed = $state<{ id: string | null } | null>(null);
  let refusal = $state('');
  /** The last dry run of an inline body, and the body it was asked about, so an edit after it hides a stale answer. */
  let tried = $state<{ body: string; answer: Answer<TriedAnswer> } | null>(null);
  /** The last try of a run body, kept the same way. Its steps are painted on the cards as well. */
  let ran = $state<{ body: string; answer: Answer<TryRun> } | null>(null);
  let trying = $state(false);
  /** What a try starts from, bound into the panel so the sticky bar's Try reads the same pick. */
  let pick = $state<Pick>({ from: 'latest', row: '', json: '' });
  let pickRows = $state<Pickable[]>([]);
  /** How far the read of `pickRows` has got (`rowsNote`): a list not read yet, or refused, is not an empty one. */
  let rowsRead = $state<RowsRead>('reading');
  let arrivals = $state<Pickable[]>([]);
  /** What a new draft looked like when it opened, so the page can tell a draft nobody has touched from one being drawn. */
  let startedAs = $state('');

  /* THE RUNS, PAGED. The first page comes with the automation; `older` is the run the next page starts before. */
  let runs = $state<RunRow[]>([]);
  let older = $state<string | null>(null);
  let paging = $state(false);
  let runOpen = $state<RunRow | null>(null);
  let runSheet = $state(false);
  /** The run's sheet body, the way to the sheet's own dialog once it closes (`runGone`). */
  let runBody = $state<HTMLElement>();
  let retrying = $state(false);

  /* THE VERSIONS, read when the tab or a run of an older version first needs them. */
  let versions = $state<Version[] | null>(null);
  let versionsFix = $state('');
  let diffOf = $state<number | null>(null);

  let menuOpen = $state(false);
  let removeSheet = $state(false);
  let removing = $state(false);
  let switching = $state(false);

  const id = $derived(String(page.params.id ?? ''));
  const fresh = $derived(id === 'new');
  const owner = $derived(page.data.me?.owner === true);
  const me = $derived(String(page.data.me?.person ?? ''));
  const names = $derived(new Map(Object.entries((page.data.names ?? {}) as Record<string, string>)));
  /* A LIST BY THE NAME THE RAIL GIVES IT, never its id, in the sentence that says what starts it. */
  const listSaid = (id: string): string =>
    ((page.data.lists ?? page.data.index?.registers ?? []) as { id: string; name: string }[]).find((l) => l.id === id)?.name ?? listName(id);

  /** Take a freshly read automation: its row, its first page of runs, and its body on the canvas. */
  function take(one: AutomationRow) {
    /* WHEN THE LOG LAST HAS IT IS THE LIST'S TO KNOW (`openAutomations`, `acted`), and the read of one automation does
       not carry it, so one read again keeps what the list said rather than going quiet about its last turn. */
    row = one.acted === undefined && row?.id === one.id ? { ...one, acted: row.acted } : one;
    runs = one.runs;
    older = one.older;
    versions = null;
    diffOf = null;
    if (one.body) flow.open(one.id, one.body, one.version);
  }

  /**
   * THE SCREEN'S ONE CALL IS THE WHOLE OPENING, the list and then the one automation. It was
   * closed once the list came back, so with nothing else out the screen said it was ready while `from` was still
   * `reading` and nothing was drawn: the look caught a blank page at 390 dark marked ready at 0.8 s.
   */
  async function load(want: string) {
    const at = opened();
    let ok = false;
    try {
      ok = await openOne(want);
    } finally {
      closed(ok, at);
    }
  }

  /** The opening itself: whether it came back with something to draw, a refusal being the only `false`. */
  async function openOne(want: string): Promise<boolean> {
    const out = await openAutomations((url, init) => fetch(url, init), apiBase(), { acted: true });
    source = out.source;
    const rows = out.first.ok ? out.first.value : [];
    taken = rows.map((r) => r.id);
    ruleNames = new Map(rows.map((r) => [r.id, r.name]));
    if (!out.first.ok && !out.absent) {
      fix = out.first.refusal.fix;
      from = 'refused';
      return false;
    }
    filed = null;
    refusal = '';
    tried = null;
    ran = null;
    startedAs = '';
    runs = [];
    older = null;
    runSheet = false;
    runOpen = null;
    versions = null;
    tab = 'steps';
    if (want === 'new') {
      row = null;
      /* A DUPLICATE OPENS AS A NEW DRAFT WITH THE STEPS OF THE ONE IT CAME FROM, named as a copy, on, and unsaved. The
         id is made from the name at the first save (`freshId`), as for any new one. */
      const copyOf = page.url.searchParams.get('from');
      const origin = copyOf && !out.absent ? await out.source.automation(copyOf) : null;
      if (origin?.ok && origin.value.body) {
        const { enabled: _was, ...body } = origin.value.body;
        flow.open('automation', { ...body, rule: 'automation', name: editWords.copyOf(origin.value.name) }, null);
      } else {
        flow.open('automation', null, null);
        startedAs = JSON.stringify(flow.body);
      }
      from = 'ready';
      return true;
    }
    /* THE LIST CARRIES NO BODY, so the one is asked for by its id. A record without the read cannot open one it has, and
       says so the same way as an id it does not have. */
    const [one] = await Promise.all([out.absent ? null : out.source.automation(want), readScriptTitles()]);
    if (!one?.ok || !one.value.body) {
      row = null;
      from = 'missing';
      return true;
    }
    /* THE LISTS IT NAMES, LEARNT BEFORE ITS STEPS ARE DRAWN, so a field is said by its name ("As the bank wrote it")
       and never its id (`fieldName` in `flow.ts`). A list the record will not describe keeps its id in words. */
    await Promise.all((await listsNamed(out.source, one.value.body)).map((list) => learn(described.schema, list, listsAsked))).catch(() => undefined);
    take({ ...one.value, acted: rows.find((r) => r.id === one.value.id)?.acted });
    from = 'ready';
    return true;
  }

  /**
   * THE LISTS A BODY NAMES, AND THE LIST OF THE RULE WHOSE QUESTION STARTS IT (AJ5). "Mark an invoice as chased" starts
   * when `rule.invoice-late`'s question is answered and names no list itself, so its steps were said with Bills and
   * invoices' ids ("set chased", "State is part") wherever no other screen had learnt that list first: on a phone, every
   * time. The asking rule says which list its rows are in, so it is read too.
   */
  async function listsNamed(src: typeof source, body: unknown): Promise<string[]> {
    const own = listsIn(body);
    const on = (body as { on?: { decided?: { about?: unknown } } } | null)?.on;
    const about = typeof on?.decided?.about === 'string' ? on.decided.about : '';
    if (!about.startsWith('rule.') || src === null) return own;
    const asker = await src.automation(about.slice('rule.'.length)).catch(() => null);
    return [...new Set([...own, ...(asker?.ok ? listsIn(asker.value.body) : [])])];
  }

  /* THE SCRIPTS' TITLES BEFORE THE STEPS ARE DRAWN, so a script step names the script as it declares itself
     (`learnScripts`); a record that cannot answer leaves each step its id in words. */
  const described = createClient({ base: apiBase() });
  const listsAsked = new Map<string, Promise<void>>();

  async function readScriptTitles() {
    const out = await createClient({ base: apiBase() })
      .scripts()
      .catch(() => null);
    if (out?.ok) learnScripts(out.value);
  }

  async function readDeclared() {
    const out = await openActions((url, init) => fetch(url, init), apiBase());
    declared = out.first.ok ? out.first.value : [];
  }

  $effect(() => {
    const want = id;
    untrack(() => void load(want));
  });
  $effect(() => {
    untrack(() => void readDeclared());
  });
  /* READY ONCE IT IS PAINTED, NOT ONCE IT IS DECIDED (the scope of 24 October): said from the effect, the look caught
     an empty main already marked ready. Two frames is the first one after the screen has been drawn, and a screen left
     before then says nothing for the next one. */
  $effect(() => {
    if (from !== 'ready') return;
    let frame = requestAnimationFrame(() => (frame = requestAnimationFrame(() => drew('ready'))));
    return () => cancelAnimationFrame(frame);
  });

  /* THE RECORD'S CLOCK (`recordNow`), as the hub and the Agents page read it: on this browser's clock a run the Agents
     page said ran "just now" read "8w ago" here, on a record whose clock is not the browser's. */
  const now = recordNow();
  const faults = $derived(flow.faults);
  const drawn = $derived(JSON.stringify(flow.body));
  /**
   * A NEW DRAFT NOBODY HAS TOUCHED SAYS NOTHING IS WRONG WITH IT. It has no steps, so the lint says "An automation does at
   * least one step." before anything has been drawn, and the page drew that twice, under the trigger and in the footer,
   * as the first thing a stranger read at `/automations/new`.
   *
   * NOT `flow.dirty`, THE OBVIOUS FLAG, WHICH IS NEVER FALSE HERE. `FlowDraft.open` sets what `dirty` compares
   * against to '' for a new draft ("A new one is always dirty", `flow.svelte.ts`), so `!flow.dirty` would have hidden
   * nothing. The page keeps the blank body it opened and compares against that instead. The button still reads
   * `faults`, so nothing that could not be sent becomes sendable.
   */
  const untouched = $derived(fresh && startedAs !== '' && drawn === startedAs);
  const shown = $derived(untouched ? [] : faults);
  const general = $derived(shown.filter((f) => f.key === null));
  /* THE RECORD'S WORD ON THE BODY DRAWN NOW, from `checkAutomation`. One about a step is on that card (`FlowCard`); one
     about the body as a whole is said here with the builder's own. */
  const served = $derived(untouched ? null : flow.served);
  /** The ids of the faults drawn under the trigger, which the trigger names as what describes it. */
  const faultIds = $derived([...general.map((_, i) => `flow-fault-${i}`), ...(served && served.key === null ? ['flow-fault-served'] : [])]);
  const blocked = $derived(faults.length > 0 || served !== null);
  const triedNow = $derived(tried !== null && tried.body === drawn ? tried.answer : null);
  const ranNow = $derived(ran !== null && ran.body === drawn ? ran.answer : null);
  /* THE DECLARED TITLE, NEVER THE ID: the name typed, else the one the record's row
     carries, which `rowOf` has already worked out from the product's names when the body declares none. */
  const title = $derived(flow.draft.name.trim() || (row ? row.name : fresh ? words.newOne : words.untitled));
  const manual = $derived('manual' in flow.draft.trigger);
  const kind = $derived(triggerKind(flow.draft.trigger));
  const register = $derived('written' in flow.draft.trigger ? flow.draft.trigger.written.register : null);
  const ruleNameOf = $derived(nameFor(ruleNames));
  /* WHICH RULE GETS THERE FIRST on the dry run drawn now, by name. The rule being drawn is never its own rival. */
  const contestNow = $derived.by(() => {
    const c = triedNow?.ok ? contestOf(triedNow.value) : null;
    return c ? contestLines(c, ruleNameOf) : [];
  });
  /* THE FIELD THE INSTALLED RULE SETS, so Run again is offered only where there is a gap to fill. The saved body and not
     the drawing: a run again runs what is live. */
  const againField = $derived(row && row.path === 'inline' && row.enabled ? fieldOf(row.body) : null);
  const saveWord = $derived(busy ? words.saving : !owner ? words.save : row ? editWords.saveChanges : editWords.saveOn);
  /* THE SENTENCE UNDER THE TITLE: the last run and the next, the failed clause red. None for a draft never saved. */
  const said = $derived(pageSentence(row, now));
  /* WHAT IT DOES, WHOLE: the trigger and each step in order, each step said with no title to repeat, so its script is
     named (`sayStep` with no `own`). */
  const whole = $derived(wholeSentence(sayStart(flow.draft, listSaid, ruleNameOf), flow.draft.steps.map((n) => sayInWhole(n))));
  /* THE PLAN THE RUNNER NUMBERS STEPS BY, so "failed at step 3" counts the steps as the canvas draws them. */
  const places = $derived(row?.body ? planPlaces(row.body) : null);
  const durations = $derived(runDurations(runs));

  /* THE RECORD IS ASKED ABOUT THE BODY ONCE THE BUILDER HAS NOTHING TO SAY ABOUT IT, after the canvas rests. Asked
     sooner, it would say the same fault twice in two sets of words. */
  $effect(() => {
    const body = drawn;
    const s = source;
    if (from !== 'ready' || s === null || untouched || faults.length > 0) return;
    const wait = setTimeout(() => {
      void s.check(JSON.parse(body) as Record<string, unknown>).then((out) => {
        if (out.ok) flow.serve(body, null);
        else if (!QUIET.has(out.refusal.code)) flow.serve(body, { say: out.refusal.fix, at: out.refusal.at });
      });
    }, CHECK_AFTER);
    return () => clearTimeout(wait);
  });

  /* WHAT A TRY CAN START FROM: the newest rows of the list a change starts it on, and for an owner the newest arrivals. */
  $effect(() => {
    const list = register;
    const s = source;
    if (s === null || list === null || list === '') {
      pickRows = [];
      rowsRead = s === null ? 'reading' : 'read';
      return;
    }
    rowsRead = 'reading';
    untrack(() => {
      void s
        .rows(list, now)
        .then((out) => {
          if (register !== list) return;
          pickRows = out.ok ? out.value : [];
          rowsRead = out.ok ? 'read' : 'refused';
        })
        .catch(() => {
          if (register === list) rowsRead = 'refused';
        });
    });
  });
  $effect(() => {
    const s = source;
    if (s === null || kind !== 'arrival' || !owner) return;
    untrack(() => {
      void s.arrivals(now).then((out) => {
        arrivals = out.ok ? out.value : [];
      });
    });
  });

  /**
   * THE CALLS IT MAKES, AS DECIDE WILL LIST THEM, drawn from the record's own `actions` read: the host and the key are on
   * each declared call and were approved when it was installed, so the canvas prints them from there and never from
   * anything typed here. A call the read does not list is left out rather than drawn with a host nobody declared; the
   * record works out its own egress lines when the change is filed (`govern.ts`), and those are the ones approved.
   */
  let declared = $state<ActionRow[]>([]);
  const calls = $derived(
    callsIn(flow.draft.steps).flatMap((name): CallOut[] => {
      const a = declared.find((d) => d.ingest === name);
      return a ? [{ ingest: name, channel: a.channel, host: a.host, every: a.channel === 'call' ? '' : a.every, key: a.key, sends: null, trigger: 'rule', perDay: 100 }] : [];
    }),
  );


  /**
   * Save what is drawn. Anybody's save files the change; the owner's is accepted in the same press, so it lands and runs
   * without a trip to Decide. A new one lands on its own page, where Run now and Rename are offered from then on.
   */
  async function save() {
    if (!source || busy || blocked || !flow.dirty || lockedSay !== null) return;
    const isNew = row === null;
    if (isNew) flow.draft = { ...flow.draft, id: freshId(flow.draft.name, taken) };
    busy = true;
    refusal = '';
    const out = await source.propose(flow.proposal());
    if (!out.ok) {
      busy = false;
      refusal = out.refusal.fix;
      return;
    }
    filed = out.value;
    flow.sent();
    if (!owner || out.value.id === null) {
      busy = false;
      toasts.push(words.filed);
      return;
    }
    const accepted = await source.accept(out.value.id);
    busy = false;
    if (!accepted.ok) {
      /* FILED AND NOT ACCEPTED: the change waits on Decide, and the footer says so with the link and the record's reason. */
      refusal = accepted.refusal.fix;
      toasts.push(editWords.filedOnly, { intent: 'warn' });
      return;
    }
    filed = null;
    toasts.push(isNew ? editWords.savedOn : editWords.saved);
    if (isNew) {
      await goto(at(`/automations/${flow.draft.id}`));
      return;
    }
    await reopen();
  }

  /**
   * Try what is drawn now. A run is taken by the real runner over the picked sample and its steps painted on the cards;
   * an inline rule is walked by the dry run. Neither writes anything, so neither needs a fault-free body.
   */
  async function tryIt() {
    if (!source || trying || lockedSay !== null) return;
    const body = flow.body;
    const asked = JSON.stringify(body);
    trying = true;
    if (flow.path === 'inline') {
      const answer = await source.dryRun(body);
      tried = { body: asked, answer };
      ran = null;
      flow.unpaint();
    } else {
      const sample = sampleOf(kind, pick, pickRows, arrivals);
      const answer: Answer<TryRun> = sample.ok ? await source.attempt(body, sample.value) : sample;
      ran = { body: asked, answer };
      tried = null;
      if (answer.ok) flow.paint(asked, answer.value.steps, (s) => stepAnswer(s.verb, s.answer));
      else {
        flow.unpaint();
        /* A REFUSAL THAT NAMES A STEP GOES ON ITS CARD, as the check's does. */
        if (answer.refusal.at !== undefined && !QUIET.has(answer.refusal.code) && answer.refusal.at.includes('['))
          flow.serve(asked, { say: answer.refusal.fix, at: answer.refusal.at });
      }
    }
    trying = false;
  }

  /** Held while Run now is on the wire, so a double press starts one run and not two. */
  let starting = false;

  async function runNow() {
    if (!source || !row || starting) return;
    starting = true;
    const out = await source.run(row.id).finally(() => (starting = false));
    if (!out.ok) return void toasts.push(out.refusal.fix, { intent: 'warn' });
    toasts.push(words.ran);
    await reread();
  }

  async function stop(run: string) {
    if (!source) return;
    const out = await source.cancel(run);
    if (!out.ok) return void toasts.push(out.refusal.fix, { intent: 'warn' });
    toasts.push(words.cancelled);
    await reread();
  }

  /** The runs again, without reopening the draft: a run started or stopped must not throw away what is being drawn. */
  async function reread() {
    if (!source || !row) return;
    const out = await source.automation(row.id);
    if (!out.ok) return;
    row = out.value;
    runs = out.value.runs;
    older = out.value.older;
  }

  /** The automation again, with what was just saved on the canvas as the version now live. */
  async function reopen() {
    if (!source || !row) return;
    const out = await source.automation(row.id);
    if (out.ok) take(out.value);
  }

  /** The page of runs before the last one shown. */
  async function moreRuns() {
    if (!source || !row || older === null || paging) return;
    paging = true;
    const out = await source.automation(row.id, { before: older });
    paging = false;
    if (!out.ok) return void toasts.push(out.refusal.fix, { intent: 'warn' });
    const seen = new Set(runs.map((r) => r.id));
    runs = [...runs, ...out.value.runs.filter((r) => !seen.has(r.id))];
    older = out.value.older;
  }

  async function loadVersions() {
    if (!source || !row || versions !== null) return;
    const out = await source.versions(row.id);
    versions = out.ok ? out.value : [];
    versionsFix = out.ok ? '' : out.refusal.fix;
  }

  /** Open one run's detail, reading the versions when it ran under one that is not live now. */
  function openRun(r: RunRow) {
    runOpen = r;
    runSheet = true;
    if (row && r.version !== null && r.version !== row.version) void loadVersions();
  }

  /**
   * THE RUN IS PUT AWAY ONCE ITS SHEET HAS GONE, and not as it starts to go.
   *
   * `onclose` comes from the dialog's `close` event, the moment the sheet begins its 180ms way out. The sheet was drawn
   * inside `{#if runOpen}`, so clearing the run there took the sheet away one frame into its close, and it vanished
   * rather than going back the way it came. It stays drawn now, and the run it shows goes when the close has played,
   * unless the sheet has opened again on another run in the meantime.
   */
  function runGone() {
    const sheet = runBody?.closest('dialog');
    if (!sheet) return void (runOpen = null);
    void Promise.allSettled(sheet.getAnimations().map((a) => a.finished)).then(() => {
      if (!sheet.open) runOpen = null;
    });
  }

  /** The body a run ran under: the live one, or an older version's once the versions are read, else none. */
  function bodyOfRun(r: RunRow) {
    if (!row) return null;
    if (r.version === null || r.version === row.version) return row.body;
    return versions?.find((v) => v.version === r.version)?.body ?? null;
  }

  async function retry(r: RunRow) {
    if (!source || retrying) return;
    retrying = true;
    const out = await source.retry(r.id);
    retrying = false;
    if (!out.ok) return void toasts.push(out.refusal.fix, { intent: 'warn' });
    toasts.push(editWords.retried);
    /* The sheet closes, and the run goes with it once the close has played (`runGone`). */
    runSheet = false;
    await reread();
  }

  async function switchTo(enabled: boolean) {
    menuOpen = false;
    if (!source || !row || switching) return;
    switching = true;
    const out = await source.setEnabled(row.id, enabled);
    switching = false;
    if (!out.ok) return void toasts.push(out.refusal.fix, { intent: 'warn' });
    flow.switched(out.value.enabled, out.value.version);
    row = { ...row, enabled: out.value.enabled, version: out.value.version };
    versions = null;
    toasts.push(out.value.enabled ? editWords.turnedOn : editWords.turnedOff);
  }

  function duplicate() {
    menuOpen = false;
    if (!row) return;
    void goto(at(`/automations/new?${new URLSearchParams({ from: row.id }).toString()}`));
  }

  async function remove() {
    if (!source || !row || removing) return;
    removing = true;
    const out = await source.retire(row.id);
    removing = false;
    if (!out.ok) return void toasts.push(out.refusal.fix, { intent: 'warn' });
    removeSheet = false;
    toasts.push(editWords.removed);
    await goto(at('/automations'));
  }

  /** Put an older version on the canvas, to be saved over the live one. */
  function putBack(v: Version) {
    flow.restore(v.body);
    tab = 'steps';
    toasts.push(editWords.putBackSaid(v.version));
  }

  /** What one version changed from the one before it, in the steps' own words. */
  function changesOf(i: number) {
    const list = versions ?? [];
    const v = list[i];
    const before = list[i + 1];
    if (!v || !row) return null;
    if (!before) return [];
    return diffLines(sayLines(row.id, before.body), sayLines(row.id, v.body)).filter((d) => d.op !== 'same');
  }

  /* ESCAPE DROPS A DRAG WHERE IT STARTED, and only when nothing is over the page: with the inspector open, Escape is
     the sheet's, and it closes one layer per press (`Sheet.svelte`). */
  function onkeydown(e: KeyboardEvent) {
    if (covered()) return;
    if (e.key === 'Escape' && flow.dragging !== null) {
      e.preventDefault();
      flow.cancelDrag();
    }
  }

  /**
   * Take back the last edit, from the button or the key. SAID IN THE LIVE LINE, because the card that moved back says
   * nothing, and a keyboard user who pressed Mod+Z had no way to hear that it did anything.
   */
  function undo() {
    flow.undo();
    flow.said = copy.flowUndone;
  }

  /** Put the last undo back, from the button or the key. Same reason as `undo`: the card says nothing itself. */
  function redo() {
    flow.redo();
    flow.said = copy.flowRedone;
  }

  /**
   * MOD+Z UNDOES THE LAST EDIT ON THE CANVAS, as the Undo button in the footer does. The shell reads Mod+Z on every
   * screen as "undo the newest toast" (`+layout.svelte`), which here was a record write from some other screen while
   * the step just dragged stayed where it landed. So this listens first, in the capture phase, and takes the key only
   * when the canvas has something to give back; with nothing to undo the shell's meaning stands.
   *
   * NEVER WHILE TYPING, because a field's own undo is the browser's and takes back letters, not steps. Only on the Steps
   * tab, since Runs and Versions draw no canvas to change.
   *
   * MOD+SHIFT+Z AND MOD+Y BOTH REDO, the two spellings a keyboard offers for the move, taken the same way as
   * Mod+Z: first, in the capture phase, and only when the canvas has something to give back.
   */
  $effect(() => {
    function undoKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const key = e.key.toLowerCase();
      const isUndo = key === 'z' && !e.shiftKey;
      const isRedo = (key === 'z' && e.shiftKey) || key === 'y';
      if (!isUndo && !isRedo) return;
      if (tab !== 'steps' || typing()) return;
      if (isUndo && !flow.canUndo) return;
      if (isRedo && !flow.canRedo) return;
      e.preventDefault();
      e.stopPropagation();
      if (isUndo) undo();
      else redo();
    }
    window.addEventListener('keydown', undoKey, { capture: true });
    return () => window.removeEventListener('keydown', undoKey, { capture: true });
  });
</script>

<svelte:head><title>{titleOf(title)}</title></svelte:head>
<svelte:window {onkeydown} />

{#if from === 'refused'}
  <div class="page"><Empty kind="error" heading title={fix} /></div>
{:else if from === 'missing'}
  <div class="page">
    <Empty kind="no-results" heading title={editWords.missing}>
      {#snippet actions()}<Button href="/automations">{words.heading}</Button>{/snippet}
    </Empty>
  </div>
{:else if from === 'ready'}
  <!-- THE WHOLE SCREEN NARROWS BESIDE THE DOCKED INSPECTOR, title row and all: the panel sets `--dock-w` while it is
       open, and this pads by what it takes past the page's own gutter, so nothing sits under the panel. -->
  <div class="screen">
    <!-- RENAME OPENS THE TRIGGER'S PANEL, WHOSE FIRST FIELD IS THE NAME, and the inspector puts the caret in the first
         field it holds. Offered once it is saved: a new draft's panel opens on its trigger anyway, and "Rename" over a
         draft with no name yet named nothing. The lifecycle sits in one "…" menu beside it, destructive last. -->
    <PageHead icon="refresh" kicker={words.heading} back="/automations" {title} sentence={said?.text} needs={said?.needs || undefined}>
      {#snippet actions()}
        {#if row}
          <!-- ON A PHONE THE HEAD HOLDS ONLY THE "⋯", and Rename is its first line. -->
          {#if !phone.current}<Button onclick={() => flow.select('trigger')}>{editWords.rename}</Button>{/if}
          <Menu label={editWords.more(title)} align="end" bind:open={menuOpen}>
            {#snippet trigger()}<span class="more-trigger"><Icon name="more" size="m" /><span class="vh">{editWords.more(title)}</span></span>{/snippet}
            {#if phone.current}
              <button type="button" class="mi" role="menuitem" onclick={() => ((menuOpen = false), flow.select('trigger'))}>{editWords.rename}</button>
            {/if}
            {#if owner}
              <button type="button" class="mi" role="menuitem" disabled={switching} onclick={() => void switchTo(!row?.enabled)}>{row.enabled ? editWords.turnOff : editWords.turnOn}</button>
            {/if}
            {#if tellsQuietly(row.body)}
              <button type="button" class="mi" role="menuitem" disabled={telling} onclick={() => ((menuOpen = false), void flipTell(row!.id))}
                >{mutedList.includes(actorOf(row.id)) ? tellWords.start : tellWords.stop}</button
              >
            {/if}
            <button type="button" class="mi" role="menuitem" onclick={duplicate}>{editWords.duplicate}</button>
            {#if owner}
              <button type="button" class="mi" role="menuitem" data-tone="bad" onclick={() => ((menuOpen = false), (removeSheet = true))}>{editWords.remove}</button>
            {/if}
          </Menu>
        {/if}
      {/snippet}
    </PageHead>
    {#if lockedSay}<p class="locked" role="status">{lockedSay}</p>{/if}
    <div class="page">
      <!-- THE SENTENCE FIRST: the whole automation in words, the script it runs named,
           over the tabs that take it apart. Said from the draft, so an edit on the canvas says itself here too. -->
      {#if whole}<p class="whole">{whole}</p>{/if}
      <Segmented class="tabs" role="group" aria-label={title}>
        <button type="button" class="segment" aria-pressed={tab === 'steps'} data-on={tab === 'steps' ? '' : undefined} onclick={() => (tab = 'steps')}>{words.steps}</button>
        {#if row}
          <button type="button" class="segment" aria-pressed={tab === 'runs'} data-on={tab === 'runs' ? '' : undefined} onclick={() => (tab = 'runs')}>{words.runs}</button>
          <button type="button" class="segment" aria-pressed={tab === 'versions'} data-on={tab === 'versions' ? '' : undefined} onclick={() => ((tab = 'versions'), void loadVersions())}>{editWords.versions}</button>
        {/if}
        <button type="button" class="segment" aria-pressed={tab === 'written'} data-on={tab === 'written' ? '' : undefined} onclick={() => (tab = 'written')}>{words.written}</button>
      </Segmented>

      {#if tab === 'steps'}
        <div class="steps">
        <div class="column flow">
          <div class="canvas">
            <!-- A FAULT ABOUT THE WHOLE AUTOMATION IS READ WITH THE TRIGGER, the card it sits under, so a screen reader
                 that lands on the trigger hears what is wrong before it presses anything (`aria-describedby`). -->
            <button
              type="button"
              class="trigger tap"
              data-selected={flow.selected === 'trigger' ? '' : undefined}
              aria-describedby={faultIds.length > 0 ? faultIds.join(' ') : undefined}
              onclick={() => flow.select('trigger')}
            >
              <IconWell name={triggerIcon(kind)} size="l" tone={flow.selected === 'trigger' ? 'ink' : general.length > 0 || (served !== null && served.key === null) ? 'danger' : undefined} />
              <span class="trigger-main">
                <span class="trigger-kicker">{words.trigger}</span>
                <span class="trigger-said">{sayStart(flow.draft, listSaid, ruleNameOf)}</span>
              </span>
            </button>
            {#each general as f, i (f.say)}<p class="fault" id={`flow-fault-${i}`}><span class="fault-glyph" aria-hidden="true"><Icon name="alert" /></span>{f.say}</p>{/each}
            {#if served && served.key === null}<p class="fault" id="flow-fault-served"><span class="fault-glyph" aria-hidden="true"><Icon name="alert" /></span>{served.say}</p>{/if}
            <FlowList {flow} list={ROOT} nodes={flow.draft.steps} faults={shown} />
          </div>

          <div class="foot">
            <!-- SENT SAYS SO ONLY UNTIL THE NEXT EDIT. Kept after one, the footer read "Sent to Decide" over a draft that
                 was not, and hid the fault line that said why the button had gone grey. -->
            {#if filed && !flow.dirty}
              <p class="said" role="status">
                {words.filed}
                {#if filed.id}<a class="tap" href={at(`/decide/${filed.id}`)}>{words.openDecide}</a>{/if}
              </p>
            {/if}
            {#if refusal}
              <p class="said" data-tone="warn" role="status"><span class="said-glyph" aria-hidden="true"><Icon name="alert" /></span>{refusal}</p>
            {:else if untouched}
              <p class="said">{editWords.start}</p>
            {:else if faults.length > 0}
              <p class="said" data-tone="bad" id="flow-held">{words.faults}: {faults.length === 1 ? faults[0]!.say : copy.flowFaultsOnCards(faults.length)}</p>
            {:else if served}
              <p class="said" data-tone="bad" id="flow-held">{words.faults}: {served.say}</p>
            {/if}
            <!-- A NEW AUTOMATION THAT STARTS ON A PRESS SAYS WHERE THE PRESS WILL BE. Its trigger reads "When you press
                 Run now" and there was no Run now anywhere, because a run needs something saved to run. -->
            {#if manual && !row}
              <p class="said">{copy.flowRunAfterSave}</p>
            {/if}
            <div class="foot-actions">
              <!-- NOT DRAWN UNTIL THERE IS A STEP TO TAKE BACK: greyed, the two read as presses
                   with nothing to take back. Each comes once the canvas holds a change for it. -->
              {#if flow.canUndo || flow.canRedo}
                <Button disabled={!flow.canUndo} kbd={canvasWords.undoKey} onclick={undo}>{copy.undo}</Button>
                <Button disabled={!flow.canRedo} kbd={canvasWords.redoKey} onclick={redo}>{copy.redo}</Button>
              {/if}
              {#if manual && row && row.enabled && !flow.dirty}
                <Button onclick={() => void runNow()}><Icon name="play" size="s" />{words.runNow}</Button>
              {/if}
            </div>
            <!-- TRY AND SAVE, flat at the end of the row at a desk's width; on a phone a bar on the board above the tab bar,
                 held there only while there is a change to save (agents F12). -->
            <div class="bar" data-held={flow.dirty ? '' : undefined}>
              <Button disabled={trying || flow.draft.steps.length === 0 || lockedSay !== null} onclick={() => void tryIt()}>{trying ? editWords.trying : editWords.tryIt}</Button>
              <!-- A GREYED SAVE SAYS WHY, read from the footer's sentence, so its reason is not only somewhere above it. -->
              <Button weight="primary" disabled={busy || blocked || !flow.dirty || lockedSay !== null} aria-describedby={blocked && !untouched && !refusal ? 'flow-held' : undefined} onclick={() => void save()}>{saveWord}</Button>
            </div>
          </div>

        </div>
        <div class="column side">
          {#if flow.draft.steps.length > 0}
            <Tried {kind} path={flow.path} {owner} rows={pickRows} {rowsRead} {arrivals} bind:pick inline={triedNow} run={ranNow} contest={contestNow} />
          {/if}

          <!-- RUN AGAIN OVER WHAT IS ALREADY THERE: the owner's, for a saved inline rule that sets a field, and
               loaded only here, by `import()`, so no other screen carries it. -->
          {#if owner && row && againField !== null}
            {#await import('./RunAgain.svelte') then part}
              <part.default id={row.id} body={row.body} field={againField} register={row.register} nameOf={ruleNameOf} start={page.url.searchParams.get('again') === '1'} />
            {/await}
          {/if}

          {#if calls.length > 0}
            <!-- THE CALLS SAY THEIR OWN HEADING AS THE LIST'S TERM (`CallsOut.svelte`), which the tile's heading already
                 says, so the term is kept for a screen reader and not drawn twice. -->
            <Tile icon="globe" title={installWords.heading}>
              <dl class="calls"><CallsOut {calls} hosted={hostedHere(page.data as unknown as Shell)} /></dl>
            </Tile>
          {/if}

          {#if row && runs.length > 0}
            <!-- THE LAST FIVE RUNS, beside the steps they ran: each its state and when, and the way to all of them. -->
            <Tile icon="history" title={words.runs} count={runs.length}>
              {#snippet actions()}<Button weight="bare" size="sm" onclick={() => (tab = 'runs')}>{canvasWords.allRuns}</Button>{/snippet}
              <ol class="runs ledger">
                <!-- ALIKE RUNS ARE ONE ROW (L48): "Failed 10 times, the last 9 min ago", and why in plain words under it. -->
                {#each runGroups(runs, 5, row.name) as g, i (g.run.id)}
                  {@const r = g.run}
                  <!-- THE NEWEST'S REASON IS THE HEAD'S SENTENCE ALREADY when it failed, so it is not said twice. -->
                  {@const why = i === 0 && said?.needs ? '' : g.why}
                  {@const mark = runMark(r.state)}
                  <li class="run">
                    <button type="button" class="run-open line" class:line-tall={why !== ''} onclick={() => openRun(r)}>
                      <IconWell name={mark.icon} size="l" tone={mark.tone} />
                      <span class="line-main">
                        <span class="line-title">{g.times > 1 ? editWords.runTimes(cap(words.runState[r.state] ?? r.state), g.times, since(r.started, now)) : `${cap(words.runState[r.state] ?? r.state)}, ${since(r.started, now)}`}</span>
                        {#if why}<span class="run-say">{why}</span>{/if}
                      </span>
                    </button>
                  </li>
                {/each}
              </ol>
            </Tile>
          {/if}
        </div>
        </div>
      {:else if tab === 'runs' && row}
        {#if runs.length === 0}
          <Empty kind="no-data-yet" compact title={words.noRuns} />
        {:else}
          <div class="column">
            <!-- A CHART ONLY OF THREE RUNS OR MORE: one or two are read off their rows, and a bar of one said nothing. -->
            {#if runs.length >= 3}
            <Tile icon="refresh" title={canvasWords.lastRuns} meta={canvasWords.lastRunsMeta(runs.length)}>
              {#snippet actions()}
                {#if durations.length > 1}
                  <span class="trend"><Sparkline values={durations} subject={canvasWords.tookSubject} format={(n) => lasted(n * 1000)} /></span>
                {/if}
              {/snippet}
              <Stacked parts={runParts(runs)} subject={canvasWords.runsSubject} />
              <p class="reading">{lastRunReading(runs, places, now)}</p>
            </Tile>
            {/if}

            <ol class="runs ledger ledger-lead">
              {#each runs as r, i (r.id)}
                {@const took = durationOf(r)}
                <!-- A REASON IS SAID ONCE FOR A RUN OF ALIKE ROWS (L48): ten rows of the same sentence read as a wall. -->
                {@const why = r.say ? plainSay(r.say, row.name) : ''}
                {@const sameAsAbove = i > 0 && why !== '' && plainSay(runs[i - 1]!.say, row.name) === why}
                {@const mark = runMark(r.state)}
                <!-- THE STATE AS ITS WELL AND ITS WORD, THEN WHEN, HOW LONG AND WHAT STARTED IT, and no id: a run is opened
                     by the whole row, and its detail is the canvas it ran on (`RunView.svelte`). Stop sits beside the row,
                     outside it, so the two presses never nest. -->
                <li class="run">
                  <button type="button" class="run-open line line-tall" aria-label={`${editWords.openRun}: ${cap(words.runState[r.state] ?? r.state)}, ${since(r.started, now)}`} onclick={() => openRun(r)}>
                    <IconWell name={mark.icon} size="l" tone={mark.tone} />
                    <span class="line-main">
                      <span class="line-title">{cap(words.runState[r.state] ?? r.state)}, {since(r.started, now)}</span>
                      <span class="line-detail run-meta">
                        {#if took !== null}<span>{cap(editWords.took(took))}</span>{/if}
                        {#if r.trigger !== null && editWords.startedBy[r.trigger]}<span>{editWords.startedBy[r.trigger]}</span>{/if}
                      </span>
                      {#if why && !sameAsAbove}<span class="run-say">{why}</span>{/if}
                    </span>
                  </button>
                  {#if r.state === 'pending' || r.state === 'running' || r.state === 'waiting'}
                    <Button weight="bare" size="sm" onclick={() => void stop(r.id)}>{words.cancel}</Button>
                  {/if}
                </li>
              {/each}
            </ol>
            {#if older !== null}
              <div><Button disabled={paging} onclick={() => void moreRuns()}>{editWords.olderRuns}</Button></div>
            {/if}
          </div>
        {/if}
      {:else if tab === 'versions' && row}
        {#if versions === null}
          <p class="said" role="status">{editWords.versions}</p>
        {:else if versionsFix !== ''}
          <p class="said" data-tone="warn" role="status"><span class="said-glyph" aria-hidden="true"><Icon name="alert" /></span>{versionsFix}</p>
        {:else if versions.length === 0}
          <Empty kind="no-data-yet" compact title={editWords.noVersions} />
        {:else}
          <ol class="versions ledger ledger-lead column">
            {#each versions as v, i (v.version)}
              {@const changes = diffOf === v.version ? changesOf(i) : null}
              <li class="version">
                <!-- THE LIVE VERSION'S WELL IS INK, the system's mark for the chosen one, beside the word that says it. -->
                <div class="line line-tall version-line">
                  <IconWell name="history" size="l" tone={v.live ? 'ink' : undefined} />
                  <span class="line-main">
                    <span class="line-title version-head">
                      <span class="version-name">{editWords.versionOf(v.version)}</span>
                      {#if v.live}<span class="version-tag">{editWords.live}</span>{/if}
                      {#if !v.enabled}<span class="version-tag">{editWords.off}</span>{/if}
                    </span>
                    <span class="line-detail version-meta">{since(v.at, now)}{v.by ? `, ${editWords.by(actor(v.by, me, names).name)}` : ''}</span>
                  </span>
                  <span class="version-actions">
                    <Button size="sm" onclick={() => (diffOf = diffOf === v.version ? null : v.version)}>{diffOf === v.version ? editWords.hideChanges : editWords.showChanges}</Button>
                    {#if !v.live}<Button size="sm" onclick={() => putBack(v)}>{editWords.putBack}</Button>{/if}
                  </span>
                </div>
                {#if changes !== null}
                  <div class="version-changes">
                    {#if changes.length === 0}
                      <p class="said">{i === versions.length - 1 ? editWords.firstVersion : editWords.noChanges}</p>
                    {:else}
                      <Tile icon="history" title={canvasWords.changed} count={changes.length}>
                        <ul class="diff">
                          {#each changes as d, j (j)}
                            <!-- A WORD AND A MARK, NOT A COLOUR ALONE: the mark is read out
                                 as added or removed, and the line keeps its indent under a branch. -->
                            <li class="diff-line" data-op={d.op}>
                              <span class="diff-mark" role="img" aria-label={d.op === 'added' ? 'Added' : 'Removed'}>{d.op === 'added' ? '+' : '−'}</span>
                              <span class="diff-said">{d.line}</span>
                            </li>
                          {/each}
                        </ul>
                      </Tile>
                    {/if}
                  </div>
                {/if}
              </li>
            {/each}
          </ol>
        {/if}
      {:else}
        <div class="column">
          <!-- NO HEADING OVER IT: the tab it sits under already says "As written", and the same words twice is a heading
               nobody needs. The tile is named for a screen reader instead. -->
          <Tile aria-label={words.written}>
            <!-- A SCROLLING BOX A KEYBOARD CAN REACH, for `Sheet.svelte`'s reason: a long body scrolls sideways and down,
                 and a box with no focusable node in it cannot be scrolled without a pointer. -->
            <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
            <pre class="written" tabindex="0">{JSON.stringify(flow.body, null, 2)}</pre>
          </Tile>
        </div>
      {/if}

      <p class="vh" role="status" aria-live="polite">{flow.said}</p>
    </div>
  </div>

  <Inspector {flow} />

  <!-- DRAWN WHILE THERE IS AN AUTOMATION, open or not, so a close plays out whole (`runGone`). -->
  {#if row}
    <Sheet bind:open={runSheet} title={editWords.runSheet} subtitle={runOpen ? since(runOpen.started, now) : undefined} onclose={runGone}>
      {#if runOpen}
        {@const shownRun = runOpen}
        <div bind:this={runBody}>
          <RunView run={shownRun} rule={row.id} body={bodyOfRun(shownRun)} {now} {retrying} onretry={owner ? () => void retry(shownRun) : undefined} />
        </div>
      {/if}
    </Sheet>
  {/if}

  {#if row}
    <Sheet bind:open={removeSheet} title={editWords.removeAsk}>
      <p class="said">{editWords.removeWhy}</p>
      {#snippet footer()}
        <Button onclick={() => (removeSheet = false)}>{editWords.keep}</Button>
        <Button tone="bad" weight="primary" disabled={removing} onclick={() => void remove()}>{editWords.removeIt}</Button>
      {/snippet}
    </Sheet>
  {/if}
{/if}

<style>
  /* THE SCREEN GIVES UP WHAT THE DOCKED INSPECTOR TAKES, past the gutter the title row and the page already pad by, and
     in step with the inspector's own slide (`--d-panel` on the sheet curve). */
  .screen {
    min-inline-size: 0;
    padding-inline-end: max(0px, calc(var(--dock-w) - var(--gutter)));
    transition: padding-inline-end var(--d-panel) var(--ease-sheet);
  }

  .page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
    min-inline-size: 0;
    padding: var(--sp-4) var(--gutter) var(--sp-9);
  }

  /* FOUR TABS WRAP RATHER THAN PUSH THE PAGE SIDEWAYS on a 320px screen, where their words do not fit one row. The
     track is `Segmented`'s own element, so the rule reaches it from this page's column. */
  .page :global(.tabs) {
    align-self: flex-start;
    flex-wrap: wrap;
    max-inline-size: 100%;
  }

  /* ON A PHONE THE FOUR STAY ON ONE ROW, each its whole word, and scroll inside the track if a screen is too narrow
     for them: a ragged second row read as a second control. */
  @media (width < 640px) {
    .page :global(.tabs) {
      flex-wrap: nowrap;
      overflow-x: auto;
      scrollbar-width: none;
    }
  }

  /* RUNS, VERSIONS AND AS WRITTEN RUN THE PAGE'S WIDTH, like every other list in the record. */
  .column {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
    min-inline-size: 0;
  }

  /* THE STEPS AND WHAT THEY WOULD DO, SIDE BY SIDE FROM 1100 (agents F12): the flow and its save row on the left, "If it
     ran now", the calls and the last five runs in a 400px column on the right, so the board beside a 720px column is
     no longer empty. Under 1100 the side column follows the flow. */
  .steps {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--sp-5);
    align-items: start;
  }

  @media (width >= 1100px) {
    .steps {
      grid-template-columns: minmax(0, 1fr) 400px;
      gap: var(--sp-4);
    }
  }

  .side:empty {
    display: none;
  }

  .side .runs {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .side .run-open {
    inline-size: 100%;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    text-align: start;
    cursor: pointer;
  }

  .canvas {
    display: flex;
    flex-direction: column;
  }

  /* THE TRIGGER IS THE FIRST NODE: a tile on the ground with what starts it in a 32px well, 12 in from a 22 corner, so
     the well's 9 and the tile's 22 are one curve. Its state is its well's, as a step's is (`FlowCard.svelte`). */
  .trigger {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: var(--sp-3);
    padding: var(--sp-3);
    background: var(--tile);
    border: 0;
    border-radius: var(--r-tile);
    color: inherit;
    font: inherit;
    text-align: start;
    cursor: pointer;
    transition: box-shadow var(--d-state) var(--ease-out);
  }

  .trigger[data-selected] {
  }

  .trigger-main {
    display: grid;
    gap: 2px;
    min-inline-size: 0;
  }

  .trigger-kicker {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: 500;
    line-height: var(--lead-meta);
  }

  .trigger-said {
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 600;
    line-height: var(--lead-ui);
    overflow-wrap: anywhere;
  }

  /* THE AUTOMATION AS ONE SENTENCE, over the tabs, at the reading size and the measure a sentence keeps. */
  .whole {
    max-inline-size: var(--measure);
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
  }

  /* THE ONE LINE SAYING WHY THIS OPENS READ ONLY, under the head, in the head's own muted words. */
  .locked {
    margin: 0 0 var(--sp-3);
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  /* WHAT IS WRONG WITH THE WHOLE OF IT, UNDER THE TRIGGER: red words after the glyph, on the
     ground, lined up with the trigger's words. */
  .fault {
    display: flex;
    align-items: flex-start;
    gap: var(--sp-2);
    margin: var(--sp-2) 0 0;
    padding-inline: calc(var(--sp-3) + var(--well-l) + var(--sp-3)) var(--sp-3);
    color: var(--red);
    font-size: var(--fs-meta);
    font-weight: 500;
  }

  .fault-glyph,
  .said-glyph {
    display: inline-flex;
    flex: none;
    margin-block-start: 1px;
    color: var(--red);
  }

  /* THE CALLS' OWN TERM IS THE TILE'S HEADING ALREADY, so it is kept for a screen reader and not drawn twice. */
  .calls {
    display: grid;
    gap: var(--sp-1);
    margin: 0;
    font-size: var(--fs-meta);
  }

  .calls :global(.calls-h) {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .calls :global(.calls) {
    margin: 0;
  }

  .foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
    padding-block-start: var(--sp-3);
  }

  .said {
    flex: 1 1 16rem;
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    overflow-wrap: anywhere;
  }

  .said a {
    color: var(--ink);
    text-decoration-color: var(--rule);
    text-underline-offset: 3px;
  }

  /* THE RECORD'S NO, IN INK AFTER A RED GLYPH; WHAT HOLDS THE SAVE BACK, IN RED WORDS. */
  .said[data-tone='warn'] {
    display: flex;
    align-items: flex-start;
    gap: var(--sp-2);
    color: var(--ink);
  }

  .said[data-tone='bad'] {
    color: var(--red);
    font-weight: 500;
  }

  .foot-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    margin-inline-start: auto;
  }

  /* UNDO AND REDO PRINT THEIR KEYS WHEN ASKED FOR: under the pointer or with keyboard focus. Without its
     cap a pill takes its even padding back. */
  .foot-actions :global(.btn:not(:hover, :focus-visible) > .btn-kbd) {
    display: none;
  }

  .foot-actions :global(.btn:not(:hover, :focus-visible):has(> .btn-kbd)) {
    padding-inline-end: var(--sp-4);
  }

  /**
   * TRY AND SAVE END THE SAVE ROW, FLAT: no edge, no shadow, the board under them (agents F12). Save is the primary.
   *
   * ON A PHONE, WHILE THERE IS A CHANGE, THEY ARE A BAR ABOVE THE TAB BAR: the board with one hairline over it, 12 by 16
   * in, the whole width, so a change is never more than a thumb away from being saved. With nothing changed they stay
   * in the row, where Try it still is, and the page ends a bar's height past the tab bar so its last tile clears it.
   */
  .bar {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  @media (width < 900px) {
    .page:has(.bar[data-held]) {
      padding-block-end: calc(var(--tabbar) + 72px);
    }

    .bar[data-held] {
      position: sticky;
      inset-block-end: var(--tabbar);
      z-index: var(--z-raise);
      flex-wrap: nowrap;
      inline-size: calc(100% + 2 * var(--gutter));
      margin-inline: calc(-1 * var(--gutter));
      padding: var(--sp-3) var(--sp-4);
      background: var(--board);
      box-shadow: inset 0 1px 0 var(--rule);
    }
  }

  /* ON A PHONE THE TWO BUTTONS SHARE THE ROW, so each is a wide target for a thumb and neither label is cut. */
  @media (width < 640px) {
    .bar > :global(*) {
      flex: 1 1 0;
    }

    /* UNDO AND RUN NOW START AT THE LEFT EDGE ON A PHONE, under the sentence they follow, as every other screen's
       controls do. Pushed to the right they sat alone across the screen from the words above them. */
    .foot-actions {
      margin-inline-start: 0;
    }
  }

  /* FORCED COLOURS DROP THE TILES' FILLS, so each keeps an edge to be told from the ground by. */
  @media (forced-colors: active) {
    .trigger {
      outline: 1px solid CanvasText;
    }

    .trigger[data-selected] {
      outline-width: 3px;
    }
  }

  /* THE HEAD'S "…": a tile-coloured rectangle on the board, as every quiet control beside the name is
     (`PageHead.svelte`): no glass, no edge, no shadow. */
  .more-trigger {
    display: flex;
    align-items: center;
    justify-content: center;
    inline-size: var(--ctl-h);
    min-block-size: var(--ctl-h);
    border-radius: var(--r-ctl);
    background: var(--tile);
    color: var(--ink);
    transition: background var(--d-state) var(--ease-out);
  }

  @media (hover: hover) and (pointer: fine) {
    .more-trigger:hover {
      background: color-mix(in srgb, var(--ink) 5%, var(--tile));
    }
  }

  @media (pointer: coarse) {
    .more-trigger {
      inline-size: var(--tap);
      min-block-size: var(--tap);
    }
  }

  /* THE MENU'S ROWS: `Menu.svelte` gives them their height and rhythm; the colours are the caller's. A destructive verb
     is its words in ink, last in the menu and never red. */
  .mi {
    background: none;
    border: 0;
    color: var(--ink-2);
    font: inherit;
    text-align: start;
    cursor: pointer;
  }

  .mi:hover,
  .mi:focus-visible {
    background: var(--hover);
    color: var(--ink);
  }

  /* ── the Runs tab ─────────────────────────────────────────────────────── */

  /* THE SPARKLINE IN THE TILE'S TOP RIGHT, 120 by 32 with no axes. */
  .trend {
    display: block;
    inline-size: 120px;
  }

  /* THE ONE LINE UNDER THE CHART that says what it means, at body size in ink. */
  .reading {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: var(--lead-ui);
  }

  .run {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }

  /* THE ROW IS THE BUTTON THAT OPENS THE RUN: `rows.css`'s tall row, its wash and its hairline, with its well beside
     both lines at every width (the shared card layout under 640 would put the words under the well). */
  .run-open {
    flex: 1 1 auto;
    grid-template-columns: var(--well-l) minmax(0, 1fr);
    min-inline-size: 0;
    background: none;
    border: 0;
    font: inherit;
    cursor: pointer;
  }

  .run-open .line-main {
    grid-column: 2;
    grid-row: 1;
  }

  .run-meta span + span::before {
    content: ' · ';
  }

  .run-say {
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
    overflow-wrap: anywhere;
  }

  /* ── the Versions tab ─────────────────────────────────────────────────── */

  /* THE WELL, THE WORDS AND THE VERBS ON ONE LINE, the verbs always drawn, since a version is opened to act on it. */
  .version-line {
    grid-template-columns: var(--well-l) minmax(0, 1fr) auto;
  }

  .version-line .line-main {
    grid-column: 2;
    grid-row: 1;
  }

  .version-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    column-gap: var(--sp-2);
  }

  .version-tag {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: 500;
  }

  .version-actions {
    grid-column: 3;
    grid-row: 1;
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 6px;
  }

  /* WHAT A VERSION CHANGED, UNDER ITS ROW AND LINED UP WITH ITS WORDS, in a tile of its own. */
  .version-changes {
    padding: var(--sp-1) var(--sp-3) var(--sp-3) calc(var(--sp-3) + var(--well-l) + var(--sp-3));
  }

  .version-changes .said {
    display: block;
  }

  .diff {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: var(--fs-meta);
  }

  .diff-line {
    display: grid;
    grid-template-columns: 2ch minmax(0, 1fr);
    gap: var(--sp-1);
    color: var(--ink-2);
  }

  .diff-line[data-op='removed'] .diff-said {
    color: var(--ink-3);
    text-decoration: line-through;
  }

  .diff-line[data-op='added'] .diff-said {
    color: var(--ink);
  }

  .diff-mark {
    color: var(--ink-3);
    font-family: var(--font-mono);
    text-align: center;
  }

  .diff-said {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  /* ON A PHONE THE VERSION'S VERBS GO UNDER ITS WORDS, and its changes use the row's whole width. */
  @media (width < 640px) {
    .version-line {
      grid-template-columns: var(--well-l) minmax(0, 1fr);
    }

    .version-actions {
      grid-column: 2;
      grid-row: 2;
      justify-content: flex-start;
    }

    .version-changes {
      padding-inline-start: var(--sp-3);
    }
  }

  /* ── As written ───────────────────────────────────────────────────────── */

  /* THE DECLARATION IN GEIST MONO, in the tile's inner well at the field's corner. */
  .written {
    margin: 0;
    padding: var(--sp-3);
    overflow: auto;
    background: var(--tile-2);
    border-radius: var(--r-pop);
    color: var(--ink-2);
    font-family: var(--font-mono);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .vh {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
