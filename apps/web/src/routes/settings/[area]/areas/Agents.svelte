<!--
  Settings > Agents: each agent he works with and how far it may go, one button that connects an agent, approving a
  machine, everything that is connected, and what Slash may do on its own.

  ONE ROW PER AGENT, DEFAULTS LAST (agents and MCP plan §5.3): Claude Code, Codex, Cursor, other apps, any row he made
  for one key or machine, then Defaults for new agents. Each says in plain words how far it may go (Read, Suggest or
  Write), when it was last heard and where, and opens one sheet (`lib/agents/ProfileSheet.svelte`) with everything that
  agent works under. What it decides is `lib/agents/profile.ts`. Only he changes these: `setAgentProfile` is ADMIN and
  refuses every token, so a colleague is not shown the rows.

  ONE BUTTON, CONNECT AN AGENT, where three boxes of text stood. It opens the connect sheet
  (`lib/agents/ConnectSheet.svelte`), loaded with `import()` on the first press so the entry carries none of it: six
  ways in, each line with its Copy, a script's key made in its own tile, and a live row that says Connected when the
  app makes its first call.

  THE SIX DIGITS LEAD WHILE A MACHINE IS WAITING. A person arriving from a terminal is holding a code and looking for
  the box, so while a machine waits the field is the first thing on the screen; otherwise it is drawn in the sheet under
  the setup line, which is where the code turns up.

  ONE LIST OF WHAT IS CONNECTED. A machine, a key and an app are three ways of letting something act on the record,
  and `connected` in `record/device.ts` folds them into rows that each say what it is, what it can do, when it last
  worked and which run last used it, with Revoke.

  ALL OF IT IS THE OWNER'S. Approving, minting, revoking and listing what can act on the record are ADMIN methods, so a
  colleague is not shown controls the record refuses them. A colleague sees `MyTokens.svelte` instead: keys for their
  own agent, which the record caps by their own levels, and each of which the owner's list names by whose it is.
-->
<script lang="ts">
  import { apiBase, at } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import { read, type Result } from '$lib/data/read.svelte.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import {
    RUNS_READ, connectLines, connected, heardFrom, keyScopeOf, nameOf, reachKey, reachOf, reportKeyOf,
    runName, runsOf, seatsHeard, standing, waiting, type Connection, type DeviceRow, type Heard, type HeardScope, type HeardSeat, type Run, type TokenRow,
  } from '$lib/record/device.ts';
  import { recordNow } from '$lib/record/boot-live.ts';
  import { agentKey, agentName } from '$lib/record/hand.ts';
  import ScopeChip from '$lib/ui/ScopeChip.svelte';
  import { movable, placesIn, scopeFieldOf, type Place } from '$lib/record/scope-move.ts';
  import {
    agentRows, argsOf, chipName, followers, groupRows, heardLine, keepersOf, LEVEL_LINES, LEVEL_WORDS, machinesLine, narrowed, noAgentYet,
    type AgentRow, type ProfileView,
  } from '$lib/agents/profile.ts';
  import ProfileSheet from '$lib/agents/ProfileSheet.svelte';
  import { agentAt, agentHead, agentHref } from '$lib/agents/agent-page.svelte.ts';
  import { goto } from '$app/navigation';
  import ChatAnswer from '$lib/agents/ChatAnswer.svelte';
  import OnWord from '$lib/agents/OnWord.svelte';
  import Bypass from '$lib/agents/Bypass.svelte';
  import Apart from '$lib/agents/Apart.svelte';
  import { page } from '$app/state';
  import { lineOf as appLineOf, madeByOther, partsOf } from '$lib/record/apps.ts';
  import { foldedAdds, planOf, revoke, words as keychainWords, type Plan } from '$lib/record/keychain.ts';
  /* THE SIX-DIGIT FIELD, ONE COMPONENT that Home's connect sheet draws too; it approves through `keychain.ts` `approve`,
     the approval `/keychain` sends, so the screens cannot drift apart. */
  import CodeForm from '$lib/agents/CodeForm.svelte';
  import { approverOf } from '$lib/agents/code-form.ts';
  import { askerOf } from '$lib/agents/approve.ts';
  import { callsOutOf, type CallOut } from '$lib/record/actions.ts';
  import { wrote } from '$lib/record/settings-write.ts';
  import { hostedHere } from '../../billing.ts';
  import CallsOut from '$lib/ui/CallsOut.svelte';
  /* THE AGENTS ADD-ON'S DECLARATION IS ASKED FOR ONLY WHEN IT IS OFFERED (live check, 1 Nov): imported here it rode in
     the area's chunk, which every visit waited on before anything was drawn. */
  type SeedPacks = typeof import('@braindog/seed/packs');
  let seedPacks: SeedPacks | null = null;
  /* Imported here and nowhere in the layout, so the client stays out of the entry chunk. */
  import { createClient } from '@braindog/client';
  import { listenFor } from '$lib/agents/listen.ts';
  import { leavingFetch } from '$lib/ui/leaving.ts';
  import { TONES, relative, since } from 'braindog-render';
  import { isQuiet } from '@braindog/kernel/constants';
  import { liveOf, type RunLive } from '$lib/ui/face.ts';
  import Sheet from '$lib/ui/Sheet.svelte';
  import { flip } from 'svelte/animate';
  import { lineIn, dismiss } from '$lib/motion';
  import { settle } from '$lib/ui/motion.ts';
  import { presenceSaid, stillWord, type RunPresence } from '$lib/ui/presence-words.ts';
  import { untrack } from 'svelte';
  import { closed, opened } from '$lib/ui/screen.svelte.ts';
  import SlashAsks from '$lib/ui/SlashAsks.svelte';
  import SlashModel from '$lib/ui/SlashModel.svelte';
  import SlashBrain from '$lib/ui/SlashBrain.svelte';
  import SlashDaily from '$lib/ui/SlashDaily.svelte';
  import SlashReads from '$lib/ui/SlashReads.svelte';
  import TrustRows from '$lib/ui/TrustRows.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import AgentFace from '$lib/ui/AgentFace.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import ReadState from '$lib/ui/ReadState.svelte';
  import { bareOrigin, settingsState, type AreaProps } from '../settings-state.svelte.ts';
  import MyTokens from './MyTokens.svelte';
  import { words as ownWords } from './my-tokens.ts';

  let { shell }: AreaProps = $props();

  /* THE OWNER QUESTION IS SHARED with every area that has an owner's control (`settings-state.svelte.ts`). */
  const s = settingsState(() => shell);
  const anOwner = $derived(s.anOwner);
  const SLUG = $derived(shell.index.slug);

  let client: ReturnType<typeof createClient> | null = null;
  const leaving = leavingFetch();
  $effect(() => leaving.stop);
  const clientOf = (): ReturnType<typeof createClient> => (client ??= createClient({ base: apiBase(), fetch: leaving.io }));

  /**
   * What the record answered: its machines, its standing keys, the newest runs, which name who used each, and whether
   * each of those runs is at work now, gone quiet or stopped (`RunLive`), which the faces draw as their ring, and the one
   * word each reads as beside it (`RunPresence`): a run that finished reads Ended, not Stopped.
   */
  type Held = {
    machines: DeviceRow[];
    tokens: TokenRow[];
    runs: Run[];
    heard: Heard[];
    /** The Claude Code profiles each kind was heard under, for a row per profile (migration 44). */
    seats: HeardSeat[];
    live: Map<number, RunLive>;
    presence: Map<number, RunPresence>;
    /** His settings rows (`agentProfiles`), Defaults first; `null` from a host older than them. */
    profiles: ProfileView[] | null;
    /** Every project an agent may be held to, or `null` when they could not be read. */
    places: Place[] | null;
  };

  /**
   * Each run's state as its face draws it, from the run's own `state` and when it was last heard from.
   *
   * THE KERNEL'S OWN QUIET, `isQuiet`: an open run not heard from in 15 minutes (`WORKING_MS`) has gone quiet, worked out when read, as
   * the record works it out for its live runs, so a face here and the board of runs never disagree about one run. The
   * 45 minutes of `isStale` is when the record stops joining a call to a run, which is not what a person is shown.
   */
  function livenessOf(rows: readonly unknown[], nowMs: number, words?: Map<number, RunPresence>): Map<number, RunLive> {
    const out = new Map<number, RunLive>();
    for (const row of rows) {
      if (typeof row !== 'object' || row === null) continue;
      const r = row as { seq?: unknown; fields?: unknown };
      if (typeof r.seq !== 'number' || typeof r.fields !== 'object' || r.fields === null) continue;
      const f = r.fields as Record<string, unknown>;
      /* `last_seen` ALONE, which `isQuiet` reads itself: a run that never said it is never shown at work. */
      out.set(r.seq, liveOf(f.state, isQuiet({ fields: f as never }, nowMs)));
      /* AND ITS WORD, the six the record tells apart (`presence-words.ts`): the ring stays the face's three. */
      words?.set(r.seq, presenceSaid((r as { state?: unknown }).state, f, nowMs));
    }
    return out;
  }

  /**
   * THE MACHINES DECIDE WHETHER THE LIST WAS READ; the keys and the runs only add to it. A record that answers the
   * machines and not the keys still has a list worth drawing, and a run that cannot be read only leaves "last run"
   * off a row. There was a `sample` state here, which drew machines nobody connected; with no sample a
   * refusal is the record's sentence like any other.
   */
  async function listed(): Promise<Result<Held>> {
    const c = clientOf();
    /* ASKED TOGETHER, NOT ONE AFTER ANOTHER (live check, 1 Nov: the area stood blank for 4 to 6 seconds while five
       reads went out in turn). His settings rows are among them; a host older than them answers no such method. */
    const [devices, keys, runs, profiles] = await Promise.all([
      c.listDevices(),
      c.listTokens(),
      c.list({ register: 'session', limit: RUNS_READ, order: [{ field: 'last_seen', dir: 'desc' }] }),
      c.agentProfiles().catch(() => null),
    ]);
    if (!devices.ok) return devices;
    /* THE PROJECTS A RUN WAS PLACED IN, by name, so a row says "on Kiln" and never its ref. The list is read off the
       refs the runs hold (`<list>#<n>`), through the one reader of places (`scope-move.ts`); one it cannot read leaves
       the row with no project, never a refusal. */
    const projects = new Map<string, HeardScope>();
    const lists = new Set<string>();
    for (const r of runs.ok ? runs.value.rows : []) {
      const said = (r as { fields?: { project?: unknown } }).fields?.project;
      if (typeof said === 'string' && said.includes('#')) lists.add(said.slice(0, said.indexOf('#')));
    }
    /* THE PROJECTS AN AGENT MAY BE HELD TO are the same list's, or, when no run was placed, the list the first of his
       lists places its rows in, read off its declaration. */
    if (lists.size === 0)
      for (const r of shell.index.registers) {
        const to = scopeFieldOf(r.id);
        if (movable(to)) {
          lists.add(to.to);
          break;
        }
      }
    let places: Place[] | null = null;
    const gotAll = await Promise.all([...lists].map((list) => placesIn(apiBase(), list).catch(() => null)));
    for (const got of gotAll) {
      if (got !== null) places = [...(places ?? []), ...got];
      for (const p of got ?? []) {
        projects.set(p.ref, p);
        projects.set(p.spoken, p);
      }
    }
    const presence = new Map<number, RunPresence>();
    /* THE RECORD'S CLOCK (`recordNow`), so "3 min ago" is the record's and not this browser's. */
    const now = recordNow();
    const value: Held = {
      machines: devices.value,
      tokens: keys.ok ? standing(keys.value as TokenRow[]) : [],
      runs: runs.ok ? runsOf(runs.value.rows) : [],
      heard: runs.ok ? heardFrom(runs.value.rows, now, projects) : [],
      seats: runs.ok ? seatsHeard(runs.value.rows, now) : [],
      live: runs.ok ? livenessOf(runs.value.rows, now, presence) : new Map(),
      presence,
      profiles: profiles !== null && profiles.ok ? (profiles.value as unknown as ProfileView[]) : null,
      places,
    };
    /* THE OFFER IS ASKED ONCE THE LIST IS IN, NOT BEFORE IT IS DRAWN: `offerPack` holds the screen's own mark
       (`opened`/`closed`) while it is out, so the screen still says it is not done, and the agents draw meanwhile. */
    if (!offerAsked && connected(value.machines, value.tokens, value.runs).some((r) => r.live && r.machine?.status !== 'pending')) {
      offerAsked = true;
      void offerPack(c);
    }
    return { ok: true, value };
  }

  /* ASKED ONLY OF AN OWNER, because every one of these reads is an owner's: a colleague asking would be told no, and
     that no would mark the whole screen refused for a question it had no reason to ask. */
  const held = read(() => (anOwner ? `agents:${apiBase()}` : null), listed);
  const rows = $derived(held.value ? connected(held.value.machines, held.value.tokens, held.value.runs) : []);
  const machines = $derived(held.value?.machines ?? []);
  const asking = $derived(waiting(machines, recordNow()));
  const first = $derived(asking.length > 0);

  /**
   * THE AGENTS HEARD FROM IN RUNS that no machine or key row above already names (agents F1): a record whose agents
   * came in without a key drawn here (the seed, an import) still lists Claude and Codex, with when each was last heard
   * and where. No Revoke on these: there is nothing here to revoke.
   */
  const heard = $derived.by(() => {
    const named = new Set(rows.flatMap((c) => (c.run?.agent ? [agentKey(c.run.agent)] : [])));
    return (held.value?.heard ?? []).filter((h) => !named.has(h.agent));
  });
  const count = $derived(rows.length + heard.length);
  /** A host older than the settings rows: the agents heard from stay in the connected list, as they were. */
  const legacy = $derived(held.state === 'ready' && held.value?.profiles === null);

  /* ── his agents and the settings each works under ─────────────────── */

  /** A list or a project by what a settings row holds: its name. */
  const listNames = $derived(new Map(shell.index.registers.map((r) => [r.id, r.name])));
  const nameOfSaid = (said: string): string =>
    listNames.get(said) ?? held.value?.places?.find((p) => p.spoken === said || p.id === said)?.name ?? said;

  /** One row per agent, Defaults last (`profile.ts`); none from a host that keeps no settings rows. */
  const agents = $derived.by((): AgentRow[] => {
    const v = held.value;
    if (!v || v.profiles === null) return [];
    return agentRows({ profiles: v.profiles, heard: v.heard, seats: v.seats, keyScope: (kind) => keyScopeOf(kind, v.runs, v.tokens), nameOf: nameOfSaid });
  });

  /** The rows grouped by agent: each agent's profiles as chips under it (`groupRows`). */
  const groups = $derived(groupRows(agents));

  /**
   * WHAT EACH LEVEL MEANS, ONCE, UNDER THE LIST: one line for each level a row ends with, in the order Write, Suggest,
   * Read. Every row said "Writes; asks for money, keys and deletes. Its key decides for now." under its name, twenty
   * times on a record with five profiles; a row now draws its own sentence only when it is held to less than its level.
   */
  const legend = $derived.by(() => {
    /* DEFAULTS SAYS ITS OWN SENTENCE ON ITS ROW, so its level is not said again here. */
    const used = new Set(agents.filter((a) => a.key !== 'default' && !narrowed(a)).map((a) => a.may).filter((m) => m !== null));
    return (['write', 'propose', 'read'] as const).filter((l) => used.has(l)).map((l) => ({ word: LEVEL_WORDS[l], line: words.levels[l] ?? LEVEL_LINES[l] }));
  });


  /** Whether an agent's newest run is at work now, which its face and its line say. */
  const workingOf = (a: AgentRow): boolean => a.heard?.seq != null && held.value?.live.get(a.heard.seq) === 'working';
  /* HOW MANY ARE AT WORK IS THE RAIL'S NUMBER (`boot`'s `working`), the agents at work by the record's one clock: it
     counted the rows here whose newest run works, and said 5 beside the rail's 12, where one row holds many runs. */
  const atWorkNow = $derived((shell as { working?: readonly unknown[] }).working?.length ?? agents.filter(workingOf).length);

  /** The lists a row may be held to: every list he has, but the record's own two for runs and instructions. */
  const sheetLists = $derived(shell.index.registers.filter((r) => r.id !== 'session' && r.id !== 'instructions').map((r) => ({ id: r.id, name: r.name })));

  /**
   * EACH AGENT ITS OWN PAGE (G14): a row is a link to `/settings/agents/<agent>`, and on that address this area draws
   * the agent's settings in place of the list, so a link to "Claude's settings" exists and Back works. It was a sheet
   * over the list, with no address of its own.
   */
  const agentParam = $derived((page.params as { agent?: string }).agent);
  const picked = $derived(agentParam === undefined ? null : (agentAt(agents, agentParam) ?? null));
  $effect(() => {
    agentHead.name = picked?.name ?? '';
    return () => (agentHead.name = '');
  });
  const backToList = () => void goto(at('/settings/agents'));

  /** Save one row: `setAgentProfile`, his browser only. The list is read again so every row says what now applies. */
  async function saveProfile(args: Record<string, unknown>): Promise<{ ok: true } | { ok: false; fix: string }> {
    const busy = opened();
    /* THE FIRST SAVE OF DEFAULTS KEEPS HIS CURRENT AGENTS AS THEY ARE: each one heard from with nothing stored gets its
       own row first, at what its key allows, so only new agents take the Defaults (`keepersOf`). */
    if (args.id === 'default')
      for (const k of keepersOf(agents)) {
        const kept = wrote(await clientOf().setAgentProfile(argsOf(k, k.draft)));
        if (!kept.ok) {
          closed(true, busy);
          return { ok: false, fix: kept.fix };
        }
      }
    const out = wrote(await clientOf().setAgentProfile(args));
    closed(true, busy);
    if (!out.ok) return { ok: false, fix: out.fix };
    toasts.push(picked?.key === 'default' ? 'Saved the defaults for new agents.' : `Saved the settings for ${picked?.name ?? 'this agent'}.`, { intent: 'good' });
    await held.reread();
    return { ok: true };
  }

  /* ONE APPROVAL OF THE SIX DIGITS over this screen's own client, made when first asked; a refusal keeps the code
     typed, and an approval reads the list again (`CodeForm.svelte`). */
  const approveCode = (typed: string) => approverOf(clientOf())(typed);

  /**
   * HOW FAR AN AGENT THE PERMISSIONS PANEL NAMES MAY GO, read off the same rows this page draws (live check, 1 Nov): the
   * panel said Cursor asked before every change while its row said Write. The ladder names an agent as the record knows
   * it ("Cursor", or a key's own name), so a row is found by its name, or by the agent's name its own starts with.
   */
  const levelOf = (said: string): 'write' | 'propose' | 'read' | null => {
    const low = said.trim().toLowerCase();
    const row =
      agents.find((a) => a.key !== 'default' && a.name.toLowerCase() === low) ??
      agents.find((a) => a.key.startsWith('kind:') && (low.startsWith(`${a.name.toLowerCase()} `) || low === (a.kind ?? '')));
    return row?.may ?? null;
  };

  /* ── the page's shape (UI pass 1 Nov): his agents and the owner's switches lead; the rest opens in a side panel ── */

  /** The agents, Defaults apart: the agents stand two to a row on a wide tile, Defaults under them across the whole. */
  const agentGroups = $derived(groups.filter((g) => g.row.key !== 'default'));
  const defaults = $derived(groups.find((g) => g.row.key === 'default') ?? null);

  /**
   * THE THREE PANELS, each a side drawer on a desk and the bottom sheet on a phone (`Sheet.svelte`): what is connected,
   * with Revoke; what each agent does on its own; and Slash. Read once in a while, so they wait one press away rather
   * than standing on the page every visit. A link to one of Slash's parts (`#slash-…`) opens its panel.
   */
  let connOpen = $state(false);
  let trustOpen = $state(false);
  let slashOpen = $state(false);
  $effect(() => {
    const hash = page.url.hash;
    if (/^#slash/u.test(hash)) untrack(() => (slashOpen = true));
    else if (hash === '#connections') untrack(() => (connOpen = true));
    else if (hash === '#permissions') untrack(() => (trustOpen = true));
  });

  /** What the Connections row says under its name: how many, and how many are at work. */
  const connLine = $derived.by(() => {
    if (held.state !== 'ready' && !legacy) return '';
    const n = legacy ? count : rows.length;
    if (n === 0) return atWorkNow > 0 ? words.noKeysWorking(workingNames, atWorkNow) : words.noKeys;
    const said = `${n} ${n === 1 ? 'machine or key' : 'machines and keys'}`;
    return atWork ? `${said}, ${atWork}` : said;
  });

  /* ONE REVOKE AT A TIME, so a double press sends one. */
  let revoking = $state<string | null>(null);

  /* THE LINES CARRY THE BARE HOST, which only `settings-state.svelte.ts` reads (`lib/at-sites.test.ts`). */
  const origin = bareOrigin();
  /* THE SETUP LINE NAMES THIS RECORD, which the Cloud device flow needs; a shell with no record names none. */
  const lines = $derived(connectLines(origin, shell.live ? SLUG : null));

  /**
   * THE WORDS THE CONNECTED TILE ADDS: what each key can do in two words, at the end of its row, and
   * the line under the list that says what a propose-only key means for the person reading it.
   */
  const words = {
    workHere: 'Agents that work here',
    more: 'Keys, permissions and Slash',
    trust: 'Permissions',
    trustLine: 'What each agent does without asking you',
    slashLine: 'Its model and what it reads',
    /* WHAT EACH LEVEL MEANS, in one line under the list: it was three lines, one a level. */
    levels: { write: 'makes changes; money, keys and deletes still wait', propose: 'asks you first', read: 'changes nothing' } as Record<string, string>,
    yours: 'Your agents',
    noAgent: 'No agent by that name here',
    noAgentWhy: 'It may have been removed, or it has not been heard from yet.',
    allAgents: 'All agents',
    connections: 'Connections',
    noKeys: 'No machines or keys yet',
    noKeysWorking: (who: string, n: number) => `${who} ${n === 1 ? 'runs' : 'run'} without a key`,
    atWorkNow: (n: number) => `${n} at work now.`,
    profiles: (name: string) => `${name}'s profiles`,
    seeThem: 'See their runs',
    /* "yesterday", not "1d ago" (P38). */
    lastHeard: (when: string) => `Last heard ${when === '1d ago' ? 'yesterday' : when}`,
    on: ', on ',
    slash: 'Slash',
    answering: 'Answering',
    scope: { read: 'can read', propose: 'can propose', write: 'can write' } as Record<string, string>,
    /* A GRANT THAT IS NOT A KEY'S SCOPE says what it may do in its own two words, and the sentence under its name says
       for how long; a one-time grant is "once", which is the whole of what makes it one. */
    grant: { login: 'can sign in', runner: 'can run work', vault: 'can open keys', vaultAll: 'can open keys', shape: 'can take scrambled copies' } as Record<string, string>,
    once: 'once',
    report: 'sends numbers',
    allAtWork: 'all at work now',
    atWork: (n: number) => `${n} at work now`,
    proposeOnly: (names: string, one: boolean) =>
      `${names} can only propose, so anything ${one ? 'it' : 'they'} would change waits for you in Needs you.`,
    readOnly: (names: string, one: boolean) => `${names} can only read, so ${one ? 'it changes' : 'they change'} nothing.`,
  };

  /**
   * A MACHINE WAITING FOR SIX DIGITS IS THE ONE ROW THAT WAITS ON THE READER, so its well is amber (waiting
   * on someone); every other state is said in words on the row, and a colour would only repeat them.
   */
  const waitsOnYou = (c: Connection): boolean => c.machine?.status === 'pending';

  /**
   * What a connection may do, in the two words the row ends with, and whether that says all of it.
   *
   * A PLAIN KEY'S SCOPE IS THE WHOLE ANSWER, so its row says it once, at the end. A key that also reads the inbox, a
   * report key and a machine's grant each carry more than two words can say (what it reaches, for how long), so their
   * row keeps `reachOf`'s sentence under the name as well.
   */
  function scopeOf(c: Connection): { word: string | null; whole: boolean } {
    const t = c.token;
    if (t) {
      if (reportKeyOf(t.label)) return { word: words.report, whole: false };
      return { word: words.scope[t.scope] ?? null, whole: !t.reach?.includes('inbox') };
    }
    const m = c.machine;
    if (!m) return { word: null, whole: false };
    return { word: words.grant[reachKey(m.reach, m.scope)] ?? words.once, whole: false };
  }

  /** The run's ring: at work, gone quiet or stopped, from the record's own row for it. */
  const liveOfRun = (run: Run): RunLive => held.value?.live.get(run.seq) ?? 'stopped';

  /** The run's word as the link beside a key: Working now, Gone quiet or Left a step; a finished run is its last run. */
  const wordOfRun = (run: Run): string | null => stillWord(held.value?.presence.get(run.seq));

  /** The reader, by their person id, so a key they made says so and never "made by" their own name. */
  const me = $derived((shell.me as { person?: string | null }).person ?? null);
  const lineOf = (c: Connection, parts: ReturnType<typeof partsOf>): string => appLineOf(c, parts, me);

  /* HOW MANY ARE AT WORK NOW, which is the tile's meta only when some are: "all at work now" when every connection that
     can act has a run working, and the count when only some do. */
  const atWork = $derived.by(() => {
    const working = rows.filter((c) => c.live && c.run !== null && liveOfRun(c.run) === 'working').length;
    if (working === 0) return undefined;
    return working === rows.filter((c) => c.live).length ? words.allAtWork : words.atWork(working);
  });

  /**
   * THE LINE UNDER THE LIST: what the narrowest keys here mean for the reader. A key that can only propose sends every
   * change it would make to Decide, and saying so by name is what makes "can propose" a thing a person understands.
   */
  const LIST = new Intl.ListFormat('en-GB', { type: 'conjunction' });
  /**
   * WHO IS AT WORK WITH NOTHING LISTED UNDER CONNECTIONS, by name. The seed's runs, and a run carried in from elsewhere,
   * came in through no machine or key this record lists, and the tile said "No machine or key is connected yet" under
   * Claude and Codex working now: the contradiction the UI review flagged. It names who works instead.
   */
  const workingNames = $derived(LIST.format(agents.filter(workingOf).map((a) => a.name)));
  const reading = $derived.by(() => {
    const plain = (scope: string): string[] =>
      rows.filter((c) => c.live && c.token?.scope === scope && !reportKeyOf(c.token.label)).map((c) => nameOf(c));
    const proposers = plain('propose');
    if (proposers.length > 0) return words.proposeOnly(LIST.format(proposers), proposers.length === 1);
    const readers = plain('read');
    if (readers.length > 0) return words.readOnly(LIST.format(readers), readers.length === 1);
    return null;
  });

  /**
   * The facts under a row's name, each its own item, so a line that wraps breaks between facts and never leaves a
   * separator leading the next line. A grant that is waiting or finished says only that: "never used"
   * beside "turned away" says nothing more.
   */
  function factsOf(c: Connection, nowMs: number, idle: number | null): string[] {
    if (c.machine?.ended_by === 'operator' || c.token?.ended_by === 'operator') return [copy.endedByOperator];
    const status = c.machine?.status;
    if (status === 'pending' || status === 'expired' || status === 'denied' || status === 'revoked') return [copy.deviceState[status] ?? status];
    const facts: string[] = status === 'approved' ? [copy.deviceState.approved ?? status] : [];
    /* WHOSE KEY IT IS, since a colleague may mint their own: Revoke means something different on a key the
       owner made and on one a colleague's agent runs on. `person_name` is on `listTokens`'s rows and not on the type
       `device.ts` declares, so it is read here as the optional it is. */
    const whose = madeByOther(c, me);
    if (whose) facts.push(ownWords.madeBy(whose));
    /* A CONNECTION GONE QUIET FOR OVER A WEEK SAYS SO IN ITS OWN MARKED WORDS on the row, so not twice here. */
    if (idle === null) facts.push(c.used ? copy.usedWhen(since(c.used, nowMs)) : copy.neverUsed);
    if (c.token?.expires_at) facts.push(copy.endsWhen(relative(c.token.expires_at.slice(0, 10), nowMs)));
    return facts;
  }

  /**
   * Revoke one row, and read the list again whether or not the record agreed.
   *
   * A MACHINE THAT SIGNED IN IS REVOKED AS A MACHINE: the kernel takes the key its grant minted with it
   * (`deviceRevoke`), which is why `connected` drew the two as one row.
   */
  async function revokeRow(c: Connection) {
    if (revoking !== null) return;
    revoking = c.key;
    const busy = opened();
    const out = c.machine ? await revoke(clientOf(), machines, c.machine.handle) : c.token ? wrote(await clientOf().revokeToken({ id: c.token.id })) : null;
    closed(true, busy);
    if (out !== null && !out.ok) toasts.push(out.fix, { intent: 'warn' });
    await held.reread();
    revoking = null;
  }

  /*
   * THE CONNECT SHEET, a chunk of its own: imported on the first press, so nothing of it is in what every screen loads.
   * The key form moved into it (its script tile), with the bearer it shows once.
   */
  let ConnectSheet = $state<typeof import('$lib/agents/ConnectSheet.svelte').default | null>(null);
  let sheetOpen = $state(false);
  let loadingSheet = $state(false);
  async function openSheet() {
    if (ConnectSheet === null) {
      loadingSheet = true;
      const loaded = await import('$lib/agents/ConnectSheet.svelte').catch(() => null);
      loadingSheet = false;
      if (loaded === null) {
        toasts.push(copy.screenFailed, { intent: 'warn' });
        return;
      }
      ConnectSheet = loaded.default;
    }
    sheetOpen = true;
  }

  /* WHAT THE SHEET'S LIVE ROW ASKS every two seconds (`lib/agents/listen.ts`), which Today's first step asks too, over
     this screen's own client, made when first asked. */
  const listen = (keys: boolean) => listenFor(clientOf())(keys);

  /* THE LIST IS READ AGAIN WHEN THE SHEET CLOSES, so what connected while it was open is in it. */
  let sheetWas = false;
  $effect(() => {
    const now = sheetOpen;
    if (!now && sheetWas) untrack(() => void held.reread());
    sheetWas = now;
  });

  /*
   * THE AGENTS ADD-ON, OFFERED ONCE SOMETHING IS CONNECTED, when this record does not have it, and on every visit
   * after that until it is installed or put off: the first connection is when a record starts to have agents worth a
   * page, and a key shown once was the only moment it was offered before. The plan is the record's own `planPack`
   * answer in the Packs screen's words, and Install sends its `planHash` back, so what installs is what was shown.
   * Not now changes nothing.
   */
  let offer = $state<Plan | null>(null);
  /* ASKED ONCE PER VISIT, and never again after Not now: the list is read again after every press, and each read
     would otherwise plan the pack again.

     FROM `listed` AND NOT FROM AN EFFECT ON THE ROWS. The effect ran a frame after the list had come back, so the
     screen said it was drawn in between and `/api/packs` was still out when a reader moved on: WebKit reports that
     cancelled call as refused by access control, on every visit with a machine connected. */
  let offerAsked = false;
  /* THE PLAN'S `calls_out`, beside the plan rather than in it, so `keychain.ts` does not pull in `actions.ts`. */
  let offerCalls = $state<CallOut[]>([]);
  let installing = $state(false);
  let offerSaid = $state('');

  const packName = (kind: 'register' | 'page' | 'metric', id: string): string => {
    const pack = seedPacks?.AGENTS_PACK;
    const named = !pack ? undefined : kind === 'register' ? pack.registers[id]?.name : kind === 'metric' ? pack.metrics[id]?.name : pack.pages[id]?.title;
    return typeof named === 'string' && !named.includes('{{') ? named : id.charAt(0).toUpperCase() + id.slice(1);
  };

  /* THE LINES THE OFFER DRAWS ARE THE LINES INSTALL APPROVES. The record refuses an install that adds a
     call without them, and this screen shows every one through `CallsOut` before Install is pressed. */
  let offerApprove: string[] = [];

  async function offerPack(c: ReturnType<typeof createClient>) {
    const busy = opened();
    const [packs, seed] = await Promise.all([c.packs(), seedPacks ? Promise.resolve(seedPacks) : import('@braindog/seed/packs').catch(() => null)]);
    seedPacks = seed;
    if (seed === null || !packs.ok || packs.value.some((p) => p.id === seed.AGENTS_PACK.manifest.id)) {
      closed(true, busy);
      return;
    }
    const planned = await c.planPack({ doc: seed.agentsPackDocument(), source: { kind: 'local' } });
    closed(true, busy);
    offerSaid = '';
    const diff = planned.ok ? (planned.value as { diff?: { calls_out?: unknown; approve?: unknown } }).diff : undefined;
    offer = planned.ok ? planOf(diff, packName) : null;
    offerCalls = callsOutOf(diff?.calls_out);
    offerApprove = Array.isArray(diff?.approve) ? diff.approve.filter((l): l is string => typeof l === 'string') : [];
  }

  async function installOffer() {
    if (!offer || installing || seedPacks === null) return;
    installing = true;
    const busy = opened();
    const out = wrote(await clientOf().installPack({ doc: seedPacks.agentsPackDocument(), source: { kind: 'local' }, planHash: offer.planHash, ...(offerApprove.length > 0 ? { approve: offerApprove } : {}) }));
    closed(true, busy);
    installing = false;
    if (out.ok) {
      offer = null;
      toasts.push(keychainWords.packInstalled, { intent: 'good' });
    } else if (!out.ok && out.from === 'refused' && out.code === 'PLAN_STALE') {
      /* THE PLAN MOVED UNDER IT, so it is read again and shown again: what installs is what was shown.
         The sentence says the plan moved only when a fresh plan is on screen to approve. */
      await offerPack(clientOf());
      offerSaid = offer ? out.fix : '';
    } else offerSaid = out.fix;
  }
</script>

<!--
  APPROVING, MINTING AND LISTING ARE THE OWNER'S, which this screen once never asked: `deviceApprove`, `createToken`,
  `listDevices` and `listTokens` all need `owner`, and a `read` colleague was offered the six-digit field and its
  Approve button. So everything but Slash's sections is drawn inside this arm, and a colleague is given their own keys.
-->
<!-- THE ONE PRIMARY ON THIS SCREEN, in the first tile's head (agents F21). -->
{#snippet connectButton()}
  <!-- ONE RED ON THE SCREEN (Look B): while a machine waits, Approve is the screen's one main action and this goes ink. -->
  <Button weight={first ? 'ink' : 'primary'} size="sm" disabled={loadingSheet} onclick={() => void openSheet()}>{copy.connectTitle}</Button>
{/snippet}

{#if anOwner}
  <!--
    THE SIX-DIGIT FIELD, drawn once, in one of two places: first on the screen while a machine is waiting, and as the
    setup card's last step otherwise. One component (`CodeForm.svelte`), which Home's connect sheet draws too: a `<form>`,
    so Enter sends it, with paste never blocked and no `maxlength`, since the CLI prints the code in two groups and seven
    digits is refused out loud rather than trimmed to a different code. The sheet takes it as a snippet.
  -->
  {#snippet codeForm()}
    <CodeForm id="user-code" approve={approveCode} onchanged={() => held.reread()} />
  {/snippet}

  {#if first && agentParam === undefined}
    <!-- NOT ON ONE AGENT'S PAGE (skills pass 2 Nov): a machine waiting is about the list, one Back away, and over an
         agent's settings it put a second red beside Save and pushed the agent's own parts under the fold. -->
    <!-- WHO IS WAITING, NAMED ABOVE THE BOXES (`lib/agents/approve.ts`), so the owner reads what the code would approve
         before the sixth digit sends it. -->
    <Tile icon="key" title={copy.approveTitle}>
      <ul class="asking">
        {#each asking.slice(0, 3) as m (m.handle)}
          <li><span class="asking-who" dir="auto">{askerOf(m.label, m.reach)}</span> {copy.codeAsks(copy.reachMeans[reachKey(m.reach, m.scope)] ?? m.reach)}</li>
        {/each}
      </ul>
      <CodeForm id="user-code" approve={approveCode} onchanged={() => held.reread()} />
    </Tile>
  {/if}

  {#snippet agentLine(g: (typeof groups)[number])}
    {@const a = g.row}
    {@const nowMs = recordNow()}
    {@const working = workingOf(a)}
    {@const line = heardLine(a, working, (at) => since(at, nowMs))}
    <!-- THE FACE BESIDE THE BUTTON, NEVER IN IT: a face that names a run is a link to the run, and a link inside a
         button is two controls in one that a screen reader cannot tell apart. The button's press still covers the
         whole row (`.agent::before`), and the face sits over it as its own door. -->
    <div class="agent-row">
      {#if a.kind === null}
        <IconWell name={a.key === 'default' ? 'plus' : 'key'} size="l" />
      {:else}
        <AgentFace agent={a.kind} run={a.heard?.seq != null ? `S${a.heard.seq}` : ''} live={working ? 'working' : 'stopped'} size="m" />
      {/if}
      <a class="agent" data-profile-row={a.key} href={at(agentHref(a))}>
        <span class="who-words">
          <span class="who-name" dir="auto">{a.name}</span>
          <!-- ITS OWN SENTENCE ONLY WHERE IT IS HELD TO LESS THAN ITS LEVEL; Defaults always says what it gives. -->
          {#if a.key === 'default' || narrowed(a)}<span class="agent-says">{a.says}</span>{/if}
          {#if line}
            {@const machine = machinesLine(a.machines)}
            <!-- ONE LINE, CUT WITH AN ELLIPSIS where the row is narrow, the whole of it in its title and in the agent's
                 sheet: wrapped, it left "· MacBook Pro" leading a second line. -->
            <span class="who-detail who-heard agent-heard" title={machine ? `${line} · ${machine}` : line}
              >{line}{#if a.heard?.scope}{words.on}<ScopeChip scope={a.heard.scope} inline />{/if}{#if machine}<span class="sep">{' · '}</span>{machine}{/if}</span
            >
          {/if}
        </span>
        <span class="who-scope agent-may">{a.may ? LEVEL_WORDS[a.may] : ''}</span>
        <Icon name="chevron" size="s" />
      </a>
    </div>
    <!-- ITS PROFILES, ONE CHIP EACH, under the row they belong to: each opens its own sheet. A chip says its level
         only where it is not its agent's, and carries the live dot while its run is at work. -->
    {#if g.chips.length > 0}
      <ul class="chips" aria-label={words.profiles(a.name)}>
        {#each g.chips as c (c.key)}
          {@const on = workingOf(c)}
          <li>
            <a class="chip tap" data-profile-row={c.key} href={at(agentHref(c))}>
              {#if on}<span class="chip-dot" aria-hidden="true"></span>{/if}<span dir="auto">{chipName(c)}</span>{#if c.may && c.may !== a.may}<span class="chip-may">{LEVEL_WORDS[c.may]}</span>{/if}
            </a>
          </li>
        {/each}
      </ul>
    {/if}
  {/snippet}

  <!--
    HIS AGENTS, ONE COMPACT ROW EACH, TWO TO A ROW ON A WIDE TILE, DEFAULTS UNDER THEM: the face (with the live dot while
    its run is at work), the name, when it was last heard and where, and how far it may go in one word at the row's end.
    A row is one button that opens its sheet, which holds everything that agent works under. A host that keeps no
    settings rows draws the agents heard from in the Connections panel, as it did before.
  -->
  {#if agentParam !== undefined}
    <!-- ONE AGENT'S PAGE (G14): everything it works under, each part a tile, Save at the foot; Back is the list. -->
    {#if held.state === 'waiting' || held.state === 'refused' || held.state === 'offline'}
      <Tile icon="session" title={words.yours} data-wide><ReadState state={held.state} refusal={held.refusal} onretry={held.reread} /></Tile>
    {:else if picked === null}
      <Empty kind="error" heading title={words.noAgent} body={words.noAgentWhy}>
        {#snippet actions()}<Button href="/settings/agents">{words.allAgents}</Button>{/snippet}
      </Empty>
    {:else}
      <ProfileSheet
        page
        row={picked}
        places={held.value?.places ?? null}
        lists={sheetLists}
        followers={picked.key === 'default' ? followers(agents) : []}
        keepers={picked.key === 'default' ? keepersOf(agents).map((k) => k.name) : []}
        onsave={saveProfile}
        onclose={backToList}
      />
    {/if}
  {:else}
  {#if !legacy}
    <Tile icon="session" title={words.yours} count={held.state === 'ready' && agentGroups.length > 0 ? agentGroups.length : undefined} actions={connectButton} data-wide data-part="your-agents">
      {#if held.state === 'waiting' || held.state === 'refused' || held.state === 'offline'}
        <ReadState state={held.state} refusal={held.refusal} onretry={held.reread} />
      {:else}
        <!-- NO AGENT IS LISTED UNTIL ONE IS HEARD FROM (`profile.ts`), so a new record says so once, above Defaults. -->
        {@const none = noAgentYet(agents)}
        {#if none}<Empty kind="no-data-yet" compact title={none} />{/if}
        <div class="agents-box">
          <ul class="agents">
            {#each agentGroups as g (g.row.key)}
              <li in:lineIn out:dismiss animate:flip={settle()}>{@render agentLine(g)}</li>
            {/each}
          </ul>
        </div>
        {#if defaults}<div class="agents-default">{@render agentLine(defaults)}</div>{/if}
        {#if legend.length > 0 || atWorkNow > 0}
          <div class="agents-foot">
            {#if atWorkNow > 0}<p class="reading">{words.atWorkNow(atWorkNow)} <a class="run tap" href={at('/r/session')}>{words.seeThem}</a></p>{/if}
            {#if legend.length > 0}
              <p class="legend">{#each legend as l, i (l.word)}{#if i > 0}<span class="sep" aria-hidden="true">{' · '}</span>{/if}<span class="legend-word">{l.word}</span> {l.line}{/each}</p>
            {/if}
          </div>
        {/if}
      {/if}
    </Tile>
  {/if}

  <!-- THE OWNER'S FOUR ANSWERING SWITCHES IN ONE TILE, a row each, second on the page because they are what he comes
       here to change: agents doing everything without asking (`Bypass.svelte`, first, the one that lifts the rest),
       answering from the card in a chat app (`ChatAnswer.svelte`), agents answering on his word (`OnWord.svelte`), and
       agents' suggestions kept apart from Needs you (`Apart.svelte`). -->
  <Tile icon="decide" title={words.answering} data-wide data-part="answering">
    <div class="answering">
      <Bypass prefs={(shell.me as { prefs?: Record<string, unknown> }).prefs} />
      <ChatAnswer prefs={(shell.me as { prefs?: Record<string, unknown> }).prefs} />
      <OnWord prefs={(shell.me as { prefs?: Record<string, unknown> }).prefs} />
      <Apart prefs={(shell.me as { prefs?: Record<string, unknown> }).prefs} />
    </div>
  </Tile>

  <!-- THE AGENTS ADD-ON, OFFERED ONCE SOMETHING IS CONNECTED, in a tile of its own that says what it is:
       its lists and pages by name and its figures as one count, so the offer fits on a phone's screen. -->
  {#if offer}
    {@const folded = foldedAdds(offer)}
    <Tile icon="session" title={keychainWords.offerTitle} data-wide data-part="agents-offer">
      <div class="offer">
        {#if offer.summary}<p class="who-why">{offer.summary}</p>{/if}
        <ul class="plan-adds">
          {#each folded.named as add (add.kind + add.name)}
            <li>
              <Icon name={add.kind === 'list' ? 'rows' : 'doc'} size="s" />
              <span class="plan-name">{add.name}</span>
              <span class="plan-detail">{add.detail}</span>
            </li>
          {/each}
          {#if folded.more}<li><Icon name="observe" size="s" /><span class="plan-detail">{folded.more}</span></li>{/if}
        </ul>
        {#if offer.changes.length || offer.conflicts.length}
          <dl class="plan">
            {#if offer.changes.length}
              <dt>{keychainWords.changesTitle}</dt>
              <dd>{#each offer.changes as c (c)}<p>{c}</p>{/each}</dd>
            {/if}
            {#if offer.conflicts.length}
              <dt>{copy.diffConflicts}</dt>
              <dd>{#each offer.conflicts as c (c)}<p>{c}</p>{/each}</dd>
            {/if}
          </dl>
        {/if}
        {#if offerCalls.length}<dl class="plan"><CallsOut calls={offerCalls} hosted={hostedHere(shell)} /></dl>{/if}
        {#if offer.seeds}<p class="who-why">{offer.seeds}</p>{/if}
        <p class="who-why">{offer.touches}</p>
        <div class="row-actions">
          <Button weight="primary" disabled={installing || offer.conflicts.length > 0} onclick={() => void installOffer()}>{copy.install}</Button>
          <Button weight="bare" onclick={() => (offer = null)}>{keychainWords.notNow}</Button>
        </div>
        <p class="code-said" role="status" data-intent={offerSaid ? 'bad' : undefined}>
          {#if offerSaid}<span role="img" aria-label={TONES.bad.label}>{TONES.bad.glyph}</span> {offerSaid}{/if}
        </p>
      </div>
    </Tile>
  {/if}

  <!-- WHAT CAN ACT ON THE RECORD: every machine, key and connected app, with Revoke, in its own panel. Every row the
       record keeps, denied ones included: "I said no to a request I did not make" (`12 §6.1`). Never a secret, a handle
       or an id: a row is named by what runs on it or the name it was given (`12 §3`). -->
  <Sheet bind:open={connOpen} title={legacy ? words.workHere : words.connections} subtitle={connLine || undefined} wide caret={false}>
    {#if held.state === 'waiting' || held.state === 'refused' || held.state === 'offline'}
      <ReadState state={held.state} refusal={held.refusal} onretry={held.reread} />
    {:else if (legacy ? count : rows.length) === 0}
      <Empty kind="no-data-yet" compact title={legacy ? copy.connectedNone : atWorkNow > 0 ? words.noKeysWorking(workingNames, atWorkNow) : words.noKeys} body={legacy ? copy.connectedNoneWhy : undefined} />
    {:else}
      {@const nowMs = recordNow()}
      <ul class="whos">
        {#each rows as c (c.key)}
          {@const scope = scopeOf(c)}
          {@const parts = partsOf(c, nowMs)}
          <li class="who" data-done={c.live ? undefined : ''} in:lineIn out:dismiss animate:flip={settle()}>
            <!-- A RUN'S FACE WHERE A RUN USED IT, its ring the run's state (at work, quiet, stopped); a well otherwise,
                 amber only on the machine waiting for the reader's six digits. -->
            {#if c.run}
              <AgentFace agent={c.run.agent} run={runName(c.run)} live={liveOfRun(c.run)} />
            {:else}
              <IconWell name={c.machine ? 'session' : 'key'} size="l" tone={waitsOnYou(c) ? 'warn' : undefined} />
            {/if}
            <span class="who-words">
              <!-- `dir="auto"`: an app names itself, in whatever script it chose. -->
              <span class="who-name" dir="auto">{parts.app}</span>
              {#if !scope.whole && !c.machine}<span class="who-detail who-reach">{reachOf(c)}</span>{/if}
              <span class="who-detail who-facts">
                {#if lineOf(c, parts)}<span dir="auto">{lineOf(c, parts)}</span>{/if}
                <!-- UNUSED FOR OVER A WEEK: the warn tone, and its mark beside the words, never the colour alone. -->
                {#if parts.idle !== null}<span class="who-idle"><span role="img" aria-label={TONES.warn.label}>{TONES.warn.glyph}</span> {copy.notUsedFor(parts.idle)}</span>{/if}
                {#each factsOf(c, nowMs, parts.idle).filter((f) => f !== lineOf(c, parts)) as fact}<span>{fact}</span>{/each}
                {#if c.run}<a class="run tap" href={at(`/r/session/${c.run.seq}`)}>{wordOfRun(c.run) ?? copy.lastRun}</a>{/if}
              </span>
            </span>
            {#if c.live && scope.word}<span class="who-scope">{scope.word}</span>{/if}
            <span class="who-do">
              {#if c.live}
                <Button weight="bare" size="sm" tone="bad" disabled={revoking !== null} onclick={() => void revokeRow(c)}>{copy.revokeKey}</Button>
              {/if}
            </span>
          </li>
        {/each}
        {#each legacy ? heard : [] as h (h.agent)}
          <li class="who" data-heard="">
            <AgentFace agent={h.agent} run={`S${h.seq}`} live={held.value?.live.get(h.seq) ?? 'stopped'} size="m" />
            <span class="who-words">
              <span class="who-name">{agentName(h.agent)}</span>
              <span class="who-detail who-heard"
                >{words.lastHeard(since(h.seen, nowMs))}{#if h.scope}{words.on}<ScopeChip scope={h.scope} inline />{/if}</span
              >
            </span>
          </li>
        {/each}
      </ul>
      {#if reading}<p class="reading conn-reading">{reading}</p>{/if}
    {/if}
  </Sheet>

  <!-- HOW FAR EACH AGENT IS TRUSTED ON ITS OWN (`TrustRows`), in its panel; the panel's title names it, so the tile's
       own heading is not drawn twice. -->
  <Sheet bind:open={trustOpen} title={words.trust} subtitle={words.trustLine}>
    <div class="flat flat-headless"><TrustRows {levelOf} /></div>
  </Sheet>

  <!-- CONNECT AN AGENT is the first tile's one primary; the sheet it opens is a chunk of its own, asked for on the first
       press, and the six-digit field rides in it under the setup line while no machine waits above. -->
  {#if ConnectSheet}
    <ConnectSheet bind:open={sheetOpen} {lines} {listen} code={first ? undefined : codeForm} onchanged={() => void held.reread()} />
  {/if}
  {/if}

{:else}
  <!-- A COLLEAGUE CONNECTS THEIR OWN AGENT, with a key of their own capped by their own levels, rather than being shown
       three ways in that the record would refuse them at the end. -->
  <MyTokens />
{/if}

<!--
  THE REST, ONE PRESS AWAY: what is connected, what each agent does on its own, and Slash, each a row that opens its
  panel. They were four more tiles down the page (connections, permissions, Slash, Slash's model), read now and then
  and scrolled past on every visit. A colleague sees Slash alone.
-->
{#if agentParam === undefined}
<Tile icon="sliders-horizontal" title={anOwner ? words.more : words.slash} actions={anOwner && legacy ? connectButton : undefined} data-wide data-part="agents-more">
  <ul class="more">
    {#if anOwner}
      <li>
        <button type="button" class="more-row" aria-haspopup="dialog" onclick={() => (connOpen = true)}>
          <IconWell name="key" size="l" />
          <span class="who-words"><span class="who-name">{legacy ? words.workHere : words.connections}</span>{#if connLine}<span class="who-detail">{connLine}</span>{/if}</span>
          <Icon name="chevron" size="s" />
        </button>
      </li>
      <li>
        <button type="button" class="more-row" aria-haspopup="dialog" onclick={() => (trustOpen = true)}>
          <IconWell name="vault" size="l" />
          <span class="who-words"><span class="who-name">{words.trust}</span><span class="who-detail">{words.trustLine}</span></span>
          <Icon name="chevron" size="s" />
        </button>
      </li>
    {/if}
    <li>
      <button type="button" class="more-row" aria-haspopup="dialog" onclick={() => (slashOpen = true)}>
        <IconWell name="slash" size="l" />
        <span class="who-words"><span class="who-name">{words.slash}</span><span class="who-detail">{words.slashLine}</span></span>
        <Icon name="chevron" size="s" />
      </button>
    </li>
  </ul>
</Tile>
{/if}

<!-- SLASH, IN ITS PANEL: its one line while no model is connected, what a model has when one is, the two switch rows,
     its model and its two depths, with Claude on the owner's Mac while a runner there is live. Never "host": the person
     did not set one up. -->
<Sheet bind:open={slashOpen} title={words.slash} caret={false}>
  <div class="flat slash-panel" data-part="slash">
    <SlashAsks owner={anOwner} bare />
    <SlashDaily link row />
    <SlashReads row />
    <SlashModel owner={anOwner} />
    <SlashBrain owner={anOwner} mac={rows.some((c) => c.live && c.machine?.reach === 'runner')} />
  </div>
</Sheet>

<style>
  /* THE CONNECTED TILE'S ROWS: the face or the 32px well, the name over what is known about it, what it can
     do in two words, and Revoke at the end, at a two-line row's height with a hairline between each. */
  .whos {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .who {
    display: grid;
    grid-template-columns: var(--well-l) minmax(0, 1fr) auto auto;
    align-items: center;
    column-gap: var(--sp-3);
    min-block-size: var(--row-h-2);
    padding-block: var(--sp-2);
  }

  .who + .who {
    border-block-start: 1px solid var(--rule);
  }

  /* A FINISHED GRANT KEEPS SAYING WHAT IT SAID, quieter: it can do nothing, and the rows that can come first. */
  .who[data-done] .who-name {
    color: var(--ink-2);
  }

  /* THE FACE SITS IN THE WELL'S COLUMN, centred, so faces and wells start every name on one edge. */
  .who > :global(.agent-face) {
    justify-self: center;
  }

  .who-words {
    display: grid;
    gap: 2px;
    min-inline-size: 0;
  }

  /* A NAME AN APP OR A MACHINE CHOSE MAY BE ONE LONG WORD, a host name most of all, and it breaks rather than
     pushing the row past the edge at 320. */
  .who-name {
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 500;
    line-height: 20px;
    overflow-wrap: anywhere;
  }

  .who-detail {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: 18px;
  }

  /* WHAT IT WOULD BE ALLOWED TO DO, where two words do not say all of it: the sentence the decision is made from, so
     the second ink rather than the quiet one. */
  .who-reach {
    color: var(--ink-2);
  }

  /* A CONNECTION NOBODY HAS USED FOR OVER A WEEK: worth a look, so the warn tone, with its mark. */
  .who-idle {
    color: var(--warn);
  }

  /* WHAT IT CAN DO, IN TWO WORDS, at the end of the row where the eye runs down the list. */
  .who-scope {
    color: var(--ink-2);
    font-size: var(--fs-meta);
    font-weight: 500;
    white-space: nowrap;
  }

  /* The control sits at the end of the row and never shrinks: a button that wraps its own label is a button somebody
     reads twice. */
  .who-do {
    display: flex;
    flex: none;
    gap: var(--sp-2);
  }

  /* HIS AGENTS: one button a row, the face, the words, the level in one word, and a chevron, a hairline between. TWO TO A
     ROW ON A WIDE TILE (a container query, since the Settings chooser takes a column beside it): eight agents were eight
     rows the height of the screen, and a row reads whole at half the tile. */
  .agents-box {
    container-type: inline-size;
  }

  .agents {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
    column-gap: var(--sp-6);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .agents > li + li {
    border-block-start: 1px solid var(--rule);
  }

  @container (width >= 660px) {
    .agents {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .agents > li:nth-child(2) {
      border-block-start: 0;
    }
  }

  /* DEFAULTS IS NOT AN AGENT: it stands under them across the tile, a hairline above it. */
  .agents-default {
    border-block-start: 1px solid var(--rule);
  }

  .agents-default:first-child {
    border-block-start: 0;
  }

  .agents-foot {
    display: grid;
    gap: var(--sp-1);
  }

  /* THE ROW: the face, then the button, which takes the rest. Hover and focus are the row's, so the row reads as the one
     press it was when the face sat inside the button. */
  .agent-row {
    position: relative;
    display: grid;
    grid-template-columns: var(--well-l) minmax(0, 1fr);
    align-items: center;
    column-gap: var(--sp-3);
    min-block-size: var(--row-h-2);
    padding: var(--sp-3) var(--sp-2);
    margin-inline: calc(-1 * var(--sp-2));
    border-radius: var(--r-ctl);
    transition: background var(--d-state) var(--ease-out);
  }

  .agent-row:has(.agent:hover) {
    background: var(--hover);
  }

  .agent-row > :global(.agent-face) {
    z-index: var(--z-raise);
    justify-self: center;
  }

  .agent {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: center;
    column-gap: var(--sp-3);
    margin: 0;
    padding: 0;
    background: none;
    border: 0;
    color: inherit;
    font: inherit;
    text-align: start;
    text-decoration: none;
    cursor: pointer;
  }

  /* THE PRESS COVERS THE ROW, the face's own door over it. */
  .agent::before {
    position: absolute;
    inset: 0;
    border-radius: var(--r-ctl);
    content: '';
  }

  .agent:focus-visible {
    /* focus-ok: the row's press (`.agent::before`) draws the ring round the whole row, below. */
    outline: none;
  }

  .agent:focus-visible::before {
    outline: 2px solid var(--focus);
    outline-offset: -2px;
  }

  .agent > :global(svg) {
    color: var(--ink-3);
  }

  /* WHAT IT MAY DO, in the second ink: the sentence the row is about. */
  .agent-says {
    color: var(--ink-2);
    text-wrap: pretty;
    font-size: var(--fs-body);
    line-height: 20px;
  }

  .agent-may {
    color: var(--ink);
  }

  /* AN AGENT'S PROFILES, AS CHIPS under its row, starting where its name starts: one press each, to its own sheet. */
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    margin: calc(-1 * var(--sp-1)) 0 var(--sp-3);
    padding: 0 0 0 calc(var(--well-l) + var(--sp-3));
    list-style: none;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    max-inline-size: 100%;
    min-block-size: var(--btn-h-sm);
    padding: 0 var(--sp-2);
    background: var(--tile-2);
    border: 0;
    border-radius: var(--r-ctl);
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-meta);
    font-weight: var(--fw-medium);
    overflow-wrap: anywhere;
    text-align: start;
    text-decoration: none;
    cursor: pointer;
    transition: background var(--d-state) var(--ease-out);
  }

  @media (hover: hover) and (pointer: fine) {
    .chip:hover {
      background: var(--hover);
    }
  }

  /* 32 UNDER A THUMB, its hit box the house's 44 (`.tap`): a chip a full 44 tall made four profiles a third of a phone. */
  @media (pointer: coarse) {
    .chip {
      min-block-size: 32px;
    }
  }

  .chip-dot {
    flex: none;
    inline-size: 6px;
    block-size: 6px;
    border-radius: 50%;
    background: var(--live);
  }

  .chip-may {
    color: var(--ink-3);
  }

  /* WHAT EACH LEVEL MEANS, ONCE, under the list: the level's word in ink, its sentence in the second ink. */
  .legend {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: 18px;
    text-wrap: pretty;
  }

  .legend .sep {
    color: var(--ink-3);
  }

  .legend-word {
    color: var(--ink);
    font-weight: var(--fw-medium);
  }

  @media (width < 640px) {
    .agent-row {
      align-items: start;
    }

    .agent {
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: start;
    }

    .agent-may {
      display: none;
    }

    .agent > :global(svg) {
      align-self: center;
    }
  }

  /* THE ONE WRITTEN LINE under the list, in ink. */
  .reading {
    margin: 0;
    max-inline-size: var(--measure);
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: 20px;
  }

  /* ON A PHONE THE TWO WORDS AND REVOKE GO UNDER THE NAME, starting where the name starts. Beside the name, Revoke took
     a third of a 390px row from the words that say what is being revoked, and a destructive button pressed by mistake
     next to a name is the worst tap on this screen. */
  @media (width < 640px) {
    .who {
      grid-template-columns: var(--well-l) minmax(0, 1fr) auto;
      align-items: start;
      row-gap: var(--sp-1);
      min-block-size: 60px;
    }

    /* WHAT IT CAN DO UNDER THE FACTS, and Revoke at the row's end across both, so the two never take a line each. */
    .who-scope {
      grid-column: 2;
      grid-row: 2;
    }

    .who-do {
      grid-column: 3;
      grid-row: 1 / span 2;
      align-self: center;
    }
  }

  /* THE ADD-ON OFFER, its own tile: what it is, what it adds, and the two buttons, a step apart. */
  .offer {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
  }

  /* A whole sentence, wrapping, under the row it is about. */
  .who-why {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
  }

  /* WHO IS WAITING, one line each, over the six boxes. */
  .asking {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    margin: 0;
    padding: 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: 22px;
    list-style: none;
  }

  .asking-who {
    color: var(--ink);
    font-weight: 500;
  }

  /* WHAT THE ADD-ON WOULD ADD, as label and value on the page with nothing round them: a filled, bordered panel
     inside a section is the box in a box design 6.8.6 rules out. */
  .plan {
    display: grid;
    grid-template-columns: minmax(6ch, max-content) minmax(0, 1fr);
    gap: var(--sp-1) var(--sp-4);
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: var(--lh-body);
  }

  .plan dt {
    color: var(--ink-3);
    font-weight: 600;
  }

  .plan dd,
  .plan dd p {
    margin: 0;
  }

  /* ONE COLUMN ON A PHONE, for the reason the Packs screen's diff gives. */
  @media (width < 640px) {
    .plan {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  .plan-adds {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .plan-adds li {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--sp-2);
  }

  .plan-name {
    color: var(--ink);
  }

  .plan-detail {
    color: var(--ink-3);
    font-size: var(--fs-cap);
  }

  /* THE FACTS UNDER A NAME WRAP AS WHOLE ITEMS, with space between them and no separator to lead a line. */
  .who-facts {
    display: flex;
    flex-wrap: wrap;
    column-gap: var(--sp-3);
  }

  /* A LINK AS EVERY LINK IS DRAWN: ink, with a 1px underline at 40% ink, 3px below. */
  .run {
    color: var(--red);
    text-decoration: underline;
    text-decoration-color: color-mix(in srgb, var(--ink) 40%, transparent);
    text-decoration-thickness: 1px;
    text-underline-offset: 3px;
  }

  .code-said {
    margin: 0;
    color: var(--tone, var(--ink-2));
    font-size: var(--fs-meta);
  }

  /* WRAPPING, for the reason `/audit`'s segmented bar already wraps: two buttons that do not fit
     are two buttons off the edge. */
  .row-actions {
    flex-wrap: wrap;
    display: flex;
    gap: var(--sp-2);
    margin-block-start: var(--sp-3);
  }

  /* "LAST HEARD 3 MIN AGO, ON ● KILN": the dot and the name in the sentence, no box. */
  /* AN AGENT'S HEARD LINE IS ONE LINE: a wrap left "Last heard just now ·" ending one line or "· MacBook Pro" leading
     the next. */
  .who-heard.agent-heard {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .who-heard {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    white-space: pre-wrap;
  }

  /* THE ANSWERING SWITCHES, ONE LIST: each row's own padding, a hairline between (`settings.css`), and no gap of the
     tile's on top of that, which stood each row 28px from the next. */
  .answering {
    display: flex;
    flex-direction: column;
    margin-block: calc(-1 * var(--sp-3));
  }

  /* THE ROWS THAT OPEN A PANEL: a well, the name over one line, and a chevron, one press each, a hairline between. */
  .more {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .more > li + li {
    border-block-start: 1px solid var(--rule);
  }

  .more-row {
    display: grid;
    grid-template-columns: var(--well-l) minmax(0, 1fr) auto;
    align-items: center;
    column-gap: var(--sp-3);
    inline-size: calc(100% + 2 * var(--sp-2));
    min-block-size: var(--row-h-2);
    margin-inline: calc(-1 * var(--sp-2));
    padding: var(--sp-2);
    background: none;
    border: 0;
    border-radius: var(--r-ctl);
    color: inherit;
    font: inherit;
    text-align: start;
    cursor: pointer;
    transition: background var(--d-state) var(--ease-out);
  }

  @media (hover: hover) and (pointer: fine) {
    .more-row:hover {
      background: var(--hover);
    }
  }

  .more-row > :global(svg) {
    color: var(--ink-3);
  }

  /* A TILE A PANEL HOLDS IS ITS HEADING AND ITS ROWS on the panel's surface, never a tile inside it. */
  .flat {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
  }

  .flat > :global(.tile) {
    padding: 0;
    background: none;
    border-radius: 0;
  }

  .flat > :global(.tile + .tile) {
    padding-block-start: var(--sp-5);
    border-block-start: 1px solid var(--rule);
  }

  /* THE PANEL'S TITLE ALREADY NAMES IT, so its one tile's own heading is not said twice. */
  .flat-headless > :global(.tile:first-child > .tile-head) {
    display: none;
  }

  .conn-reading {
    margin-block-start: var(--sp-3);
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: 18px;
  }
</style>
