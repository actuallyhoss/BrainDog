<!--
  Keys: who is asking to open them, what they are, and which machines may.

  FOUR SECTIONS, IN THE ORDER OF URGENCY. A request waiting for
  its six digits is time-boxed, so it leads, and it is drawn only while there is one. Then the Keys
  index, then the keychain password that guards them (`Passphrase.svelte`, an owner's only), then the
  machines holding a keychain access, each with Revoke. While the passphrase is on, opening or putting a
  key asks for it, and it goes with that one request and is not kept.

  NEVER A VALUE, A CODE OR A HANDLE. A key row says whether a value is sealed, how often it was opened
  and when; the six digits are typed here and never printed; a machine is named by its label.

  THE APPROVAL IS SETTINGS', NOT A COPY OF IT. `record/keychain.ts` holds the one `approve`, the one
  `answerLine` and the one `reprove`, and `/settings/agents` calls the same three.

  THE INDEX AND THE MACHINES HAVE TWO DIFFERENT CEILINGS, AND THAT IS THE DECISION. What the registers
  index is what a key OPENS and never the key, and a credential never goes in the record, so reading
  the index is not reading a secret: a colleague at `read` may have it, and `/r/credentials` already
  gives it to them. Who may open keys, and the acts on this screen, stay owner-only. Refusing one of
  those two is not an answer about the other, and this screen used to draw the first refusal it got
  as the whole page. `said.ts` holds what the record said and what is drawn from it.

  `/keychain` carries NOTHING in its query string, ever. A credential id in the address is an entry in
  browser history and in URL-bar autocomplete (19 §5).

  THE LOOK, as the design system draws Keychain. The sentence under the title says how many keys and how often they
  were opened, and a machine asking is its one red phrase. A request waiting for its six digits is a tile at the top.
  Then two tiles side by side: "Opens by key", the one figure here with its bars and its reading line, and the passphrase,
  a control with the trade it makes. The keys and the machines are lists on the ground in one row shape: a well, the name,
  what it opens and where it applies, the count at the end, and the verbs on hover.
-->
<script lang="ts">
  import { flip } from 'svelte/animate';
  import { dismiss, lineIn } from '$lib/motion';
  import { settle } from '$lib/ui/motion.ts';
  import { apiBase, at, signInFirst } from '$lib/at.ts';
  import { onDestroy, onMount } from 'svelte';
  import { page } from '$app/state';
  import { createClient } from '@braindog/client';
  import { since, relative, TONES } from 'braindog-render';
  import { titleOf } from '$lib/title.ts';
  import { copy } from '$lib/copy.ts';
  import { CODE_DIGITS, type Answer, type DeviceRow } from '$lib/record/device.ts';
  import {
    answerLine, approve, asks, daysFor, holders, keysOf, lastUsers, retiredOf, lockOf, namesOf, readAll, reconnectFrom, reconnectOf, reprove, revoke, runPath,
    scopeName, wantsPassphrase, withPassphrase, words, RECONNECT_STATE,
    type GrantState, type KeyRow, type Lock, type ProjectMark, type UsedByRun,
  } from '$lib/record/keychain.ts';
  import { words as actionWords } from '$lib/record/actions.ts';
  import { read } from '$lib/data/record.ts';
  import { methods, passkeySignIn, support } from '$lib/auth.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import KeyViews from './KeyViews.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import Bars from '$lib/viz/Bars.svelte';
  import ScopeChip from '$lib/ui/ScopeChip.svelte';
  import CodeLine from '$lib/ui/CodeLine.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import { closed, drew, opened } from '../../lib/ui/screen.svelte.ts';
  import { countSaid, machinesTellOf, mayAct, plainOr, saidOf, tellOf, words as tells, type Said } from './said.ts';
  import Menu from '$lib/ui/Menu.svelte';
  import PassField from './PassField.svelte';
  import Passphrase from './Passphrase.svelte';
  import AskTile from './AskTile.svelte';
  import AccessSheet from './AccessSheet.svelte';
  import { accessWords } from './access.ts';
  import {
    cameFromOf, changedSaid, dated, expiresSaid, foldsOpen, groupsOf, hintOf, keysFor, opensInWords, opensOf, rowAction, rowPath, sentenceOf, sharedState, SORTS, sortKeys, stateOf, twinsOf, usesOf,
    words as tileWords, type KeyGroup, type SortBy, type UseSources,
  } from './tiles.ts';
  import { createIdle, lockAfterOf, LOCK_AFTER_MINUTES, type Idle } from '$lib/record/keychain-idle.ts';
  /* TYPES ONLY: the note's code and its component are a dynamic import (`scopeNote`), never in this screen's own chunk. */
  import type { Call, ScopeProposal } from './scope-note.ts';
  import { recordToday } from '$lib/record/zone.ts';
  import { keyName } from '$lib/market/key-names.ts';

  /**
   * Whether the record has answered yet. THERE IS NO THIRD STATE: this screen drew the sample's grants and keys,
   * dated by the sample's clock, wherever a 401 or an unreachable host came back with no slug, and the sample has
   * gone. Those two refusals are now said like any other.
   */
  let from = $state<'reading' | 'live'>('reading');
  let machines = $state<DeviceRow[]>([]);
  let keys = $state<KeyRow[]>([]);
  /** How many of the Keys list's rows are retired, said beside the count so it adds up to the list's (`isKey`). */
  let retired = $state(0);
  /* WHAT THE ADDRESS ASKED FOR (`?q=`, a service's page links here with its name), and the keys grouped by project and
     then by who they are with (`groupsOf`), the asked-for ones alone while it asks. */
  const asked = $derived(page.url.searchParams.get('q')?.trim() || null);
  /* AND WHAT IS TYPED IN THE BOX: 176 keys in one list were found by scrolling 22,900 px on a phone. */
  let findText = $state('');
  const finding = $derived(findText.trim() || asked || '');
  /* HOW THE KEYS ARE ORDERED: this screen's own choice, kept out of the address. */
  let sortBy = $state<SortBy>('name');
  /** How many things a key's line names before they are a fold of their own. */
  const USES_SAID = 3;
  const shownKeys = $derived(sortKeys(keysFor(keys, finding), sortBy));
  /* WHAT NAMES A KEY (actions, tools, scripts), read once after the keys drew, for each key's details. */
  let useFrom = $state.raw<UseSources>({});
  /* WHEN THE KEYS WERE READ, so the counts say how old they are (P24). */
  let readAt = $state(Date.now());
  const groups = $derived(groupsOf(shownKeys));
  const severalGroups = $derived(groups.length > 1 || (groups[0]?.services.length ?? 0) > 1);
  /* EACH PROJECT FOLDS UNDER ITS NAME AND COUNT, and opens while a search is typed (`foldsOpen`). */
  const unfolded = $derived(foldsOpen(groups, finding));
  /* THE WORD EVERY KEY WITHOUT A VALUE HERE SHARES, said once over the list rather than under every row. */
  const shared = $derived(sharedState(shownKeys));
  /* THE KEYS THE RECORD HOLDS TWICE, by its own `heldTwice`, marked on their rows as Health counts them. */
  let twins = $state<ReadonlySet<string>>(new Set());
  /** Where each key came from, by its row id, for the rows that say so (`cameFromOf`). */
  let cameFrom = $state<ReadonlyMap<string, string>>(new Map());
  /** Whether the record holds keys past the ones read: a page refused part way, or a read that met its ceiling. */
  let moreKeys = $state(false);
  /** The run that opened each key last, by the key's row id, from `usedBy`. A key missing here says only its counts. */
  let lastBy = $state<ReadonlyMap<string, UsedByRun>>(new Map());
  let names: ReadonlyMap<string, string> & { marks?: ReadonlyMap<string, ProjectMark> } = $state(new Map());
  /* RAW, as a client is a thing to call and not data to follow inside; the passphrase box is handed it once it is made. */
  let client = $state.raw<ReturnType<typeof createClient> | null>(null);

  /**
   * WHAT THE RECORD SAID TO THREE OF THE FOUR READS, kept rather than dropped.
   *
   * A fresh self-host answers `REGISTER_UNKNOWN` to both lists and this screen drew "No keys yet."
   * over them; a colleague at `read` is refused the machines and this screen drew that one sentence
   * as the whole page, although the same person may read the Keys index on `/r/credentials`.
   * `said.ts` has the measurements and the reasoning.
   *
   * THE FOURTH READ, `things`, IS THE ONE WITH NOTHING TO SAY, so it is not kept: a project the
   * record would not name is drawn as the chip "A project" by `scopeName` and `keysOf`, which is
   * already this screen declining to guess, and a second sentence about it would say no more.
   */
  let devices = $state<Said>({ kind: 'held' });
  let index = $state<Said>({ kind: 'held' });
  let counted = $state<Said>({ kind: 'held' });

  const waiting = $derived(asks(machines));
  const holding = $derived(holders(machines));
  /** Adding, replacing, revealing, retiring and approving: the acts, which the machines read stands for. */
  const acts = $derived(from === 'live' && mayAct(devices));
  /**
   * The sentence for an act that is not this person's: the record's own, or nothing.
   *
   * THE INDEX'S REFUSAL IS ASKED SECOND, because an owner refused nothing is still refused a key form
   * over a register the record does not hold, and `devices` has no sentence about that half.
   *
   * NOTHING IS WHAT A PRESS BEFORE THE RECORD ANSWERED GETS. The fallback was the demo's sentence, and with the
   * sample gone the only way to reach it is a control pressed while both reads are still `held` from the start,
   * which is a screen still reading and not a refusal; that sentence there would have told an owner their record
   * was the demo.
   */
  const cannot = (): string | null =>
    devices.kind !== 'held' ? plainOr(devices.fix, tells.actHow) : index.kind !== 'held' ? plainOr(index.fix, tells.keysHow) : null;
  function refuse() {
    const line = cannot();
    if (line) toasts.push(line, { intent: 'warn' });
  }
  const indexTell = $derived(tellOf(index));
  const machinesTell = $derived(machinesTellOf(devices));
  /** Whether `listGrants` answered, so a row may say how often it was opened rather than guessing never. */
  const counts = $derived(counted.kind === 'held');

  /**
   * THE LINE UNDER THE TITLE, drawn once the record has answered: how many keys, how often opened, and a machine asking
   * as its red phrase. The machines clause only for a reader the record let list them.
   */
  /** Words of the usual length for the line under the title, set unseen while it is on its way so it holds their room. */
  const HELD_LIKE = '3 have no value yet.';
  let asksRead = $state(false);
  /* A RECORD THE SHELL SAYS HOLDS NO KEYS HOLDS NO LINE FOR A SENTENCE (nojump, 2 Nov): it says nothing once read, and the
     held line gave its 32px back then, lifting the page on a phone. The shell lists a list only once it holds a row. */
  const noKeys = $derived(((page.data as { index?: { registers?: { id: string; count: number }[] } } | undefined)?.index?.registers ?? []).every((r) => r.id !== 'credentials' || r.count === 0));
  const sentence = $derived(
    from === 'live'
      ? sentenceOf({ keys, listed: index.kind === 'held', counts, asking: waiting.length, seesMachines: devices.kind === 'held', retired, titled: true })
      : null,
  );
  /** "Opens by key": the one figure on this screen, or nothing where no count came back. */
  const opens = $derived(opensOf(keys, lastBy, counts, Date.now()));
  /** Where the record said why no count came back, said once over the list rather than on every row. */
  const uncounted = $derived(!counts && keys.some((k) => k.sealed) ? countSaid(counted) : '');
  /** "Opened 12 times", a row's count at its end, with the capital a line of its own starts with. */
  const openedSaid = (n: number): string => {
    const line = words.opened(n);
    return line.charAt(0).toUpperCase() + line.slice(1);
  };

  /** One row of a list as this screen reads it. */
  type Row = { id: string; seq: number | null; fields: Record<string, unknown>; state: string | null };
  /** How many rows one page asks for; `readAll` asks for pages until the record says there are no more. */
  const PAGE = 200;
  /** Every row of one of the record's lists, a page at a time, with the refusal that stopped it where one did. */
  const everyRow = (register: string) =>
    readAll(async (cursor: string | null) => {
      const out = await client!.list({ register, limit: PAGE, ...(cursor === null ? {} : { cursor }) });
      return out.ok ? { ok: true as const, value: { rows: out.value.rows as Row[], cursor: out.value.cursor } } : out;
    });

  onMount(() => {
    void read(async () => {
      client = createClient({ base: apiBase() });
      const listed = await client.listDevices();
      /* A SIGN-IN THAT LAPSED SINCE THE SHELL BOOTED goes where the shell would have sent it, by the shell's own
         rule, rather than drawing the sample as it did or a page of refusals nobody can act on. Every other
         refusal is about one half of this screen and is said there. */
      const signIn = !listed.ok && 'refusal' in listed ? signInFirst(listed.refusal.code, location) : null;
      if (signIn) {
        location.assign(signIn);
        return false;
      }
      /**
       * THE INDEX IS READ WHATEVER THE MACHINES SAID. `listDevices` is about who may open keys and is
       * owner-only; the Keys index is about what a key OPENS, which is ordinary metadata a reader may
       * have, and `/r/credentials` already draws it to them. Refusing one is not an answer about the other.
       */
      devices = saidOf(listed);
      if (listed.ok) machines = listed.value;
      /* A record without the agents pack has no Keys register, and it says so rather than answering an empty index. */
      /* EVERY PAGE OF BOTH LISTS (`readAll`), so a record with more than 200 keys lists every one of them. */
      const [projects, credentials, grants] = await Promise.all([everyRow('things'), everyRow('credentials'), client.listGrants()]);
      /* A REFUSAL IS THE SECTION'S ANSWER ONLY WHERE NOTHING WAS READ. A page refused part way leaves real keys, which
         are drawn, with one line under them saying more stand. */
      index = credentials.refused !== null && credentials.rows.length === 0 ? saidOf(credentials.refused) : { kind: 'held' };
      counted = saidOf(grants);
      /* A RECORD WITH NO PROJECTS LIST NAMES NO PROJECT, and the chips say "A project" where a scope
         points at one this screen cannot name, which is this screen saying where the record said nothing. */
      names = projects.rows.length > 0 ? namesOf(projects.rows) : new Map();
      keys = keysOf(credentials.rows, grants.ok ? (grants.value as GrantState[]) : [], names);
      retired = retiredOf(credentials.rows);
      cameFrom = cameFromOf(credentials.rows);
      moreKeys = credentials.more && credentials.rows.length > 0;
      forConnectors = connectorGrants(grants.ok ? grants.value : []);
      void whoOpened();
      void twinsRead();
      void usesRead();
      readAt = Date.now();
      from = 'live';
      accessTick++;
      void readLockAfter();
      void scopeNote();
      /* THE PASSPHRASE IS NOT ASKED ABOUT ON OPEN: the only question that says is a write,
         `clearKeychainPassphrase` with none, and opening a page writes nothing. A key door that wants one says so
         (`wantsPassphrase`), and the switch asks when it is pressed (`Passphrase.svelte`, `onask`). */
      reconnect();
      /* The screen has an answer if either half answered; a screen refused both halves is a refused screen. */
      return devices.kind === 'held' || index.kind === 'held';
    });
  });
  $effect(() => drew('ready'));

  /* WHAT A KEY'S "…" MENU IS CALLED TO A SCREEN READER, by the key's name, as a flow card's menu is (`flow.ts`). */
  const moreFor = (label: string) => `More for: ${label}`;

  /* ── keys that look like they belong to a project ── */

  /**
   * THE ONE LINE IN THE KEYS TILE, AND ITS BUTTON (`scope-note.ts`, `ScopeNote.svelte`), both loaded by a dynamic import
   * only once the screen has drawn its reads, so the Keychain's first paint and what every screen loads do not grow by
   * them. Asked only where the index was read and holds keys; nothing comes back on a refusal or at nought.
   */
  let scope = $state.raw<{ Note: typeof import('./ScopeNote.svelte').default; found: ScopeProposal; call: Call } | null>(null);
  async function scopeNote() {
    const c = client;
    if (!c || index.kind !== 'held' || keys.length === 0) return;
    try {
      const [note, view] = await Promise.all([import('./scope-note.ts'), import('./ScopeNote.svelte')]);
      const call: Call = (name, args) => c.call(name, args);
      const found = await note.readScopeNote(call);
      if (found) scope = { Note: view.default, found, call };
    } catch {
      /* A chunk that would not load is a note not drawn, never a screen refused. */
    }
  }

  /* ── the passphrase ── */

  /**
   * WHETHER THE KEYCHAIN IS BEHIND A PASSPHRASE, which decides whether opening or putting a key asks for it. `lockOf` says
   * how it is found out, and is asked only when the switch is pressed; a key door that answers "type the passphrase"
   * moves it to on, so a Keychain behind one asks at the next press rather than failing twice. `reading` until either.
   */
  let lock = $state<Lock>({ state: 'reading' });
  async function probe(): Promise<Lock> {
    if (!client) return lock;
    lock = await lockOf(client);
    return lock;
  }

  /* ── the code ── */
  let typed = $state('');
  let approving = $state(false);
  let answer = $state<Answer | null>(null);
  let reproving = $state(false);
  const said = $derived(answerLine(answer));

  function retype(value: string) {
    typed = value;
    answer = null;
  }

  async function tryCode(e?: SubmitEvent) {
    e?.preventDefault();
    if (approving) return;
    approving = true;
    const at = opened();
    answer = await approve(typed, client);
    closed(true, at);
    approving = false;
    /* THE CODE STAYS IN THE FIELD ON A REFUSAL: six digits with one wrong is a thing to correct. */
    if (answer.kind === 'approved' && client) {
      typed = '';
      const again = await client.listDevices();
      if (again.ok) machines = again.value;
    }
  }

  async function signInAgain() {
    if (reproving) return;
    reproving = true;
    const back = await reprove({ support, methods, passkeySignIn }, (href) => location.assign(href));
    reproving = false;
    if (back) await tryCode();
  }

  /**
   * A REQUEST TURNED AWAY. The record's revoke takes a grant that is still pending as well as one in use, so "Deny" is
   * the same one call as Revoke, sent before the six digits rather than after.
   */
  async function deny(row: DeviceRow) {
    if (!acts || !client) {
      refuse();
      return;
    }
    const at = opened();
    const out = await revoke(client, machines, row.handle);
    closed(true, at);
    if (!out.ok) {
      toasts.push(out.fix, { intent: 'warn' });
      return;
    }
    machines = out.rows;
    toasts.push(tileWords.denied(row.label ?? copy.unnamedMachine), { intent: 'good' });
  }

  async function revokeRow(row: DeviceRow) {
    if (!acts || !client) {
      refuse();
      return;
    }
    const at = opened();
    const out = await revoke(client, machines, row.handle);
    closed(true, at);
    if (out.ok) machines = out.rows;
    else toasts.push(out.fix, { intent: 'warn' });
  }
  /**
   * A KEY OUT OF SERVICE. `revokeGrant` is KEYCHAIN, so this reaches the record only from a browser session proved in
   * the last fifteen minutes; the bytes are destroyed and the row stays, because what it opened is a fact.
   *
   * THE INDEX IS READ AGAIN rather than patched here, so the line a person reads is the record and not a guess.
   */
  async function retireKey(k: KeyRow) {
    if (!acts || !client || !k.grant) {
      refuse();
      return;
    }
    const at = opened();
    const out = await client.revokeGrant({ id: k.grant });
    closed(true, at);
    if (!out.ok) {
      toasts.push('refusal' in out ? out.refusal.fix : copy.writeRaced, { intent: 'warn' });
      return;
    }
    toasts.push(copy.keyRevoked(k.label), { intent: 'good' });
    await reread();
  }

  /** The index, read again from the record rather than patched here, so the line a person reads is the record. */
  async function reread() {
    if (!client) return;
    const [credentials, grants] = await Promise.all([everyRow('credentials'), client.listGrants()]);
    /* A read refused before its first key leaves the keys as they were drawn, as one refused page always did. */
    if (credentials.refused === null || credentials.rows.length > 0) {
      keys = keysOf(credentials.rows, grants.ok ? (grants.value as GrantState[]) : [], names);
      retired = retiredOf(credentials.rows);
      cameFrom = cameFromOf(credentials.rows);
      moreKeys = credentials.more;
    }
    if (grants.ok) forConnectors = connectorGrants(grants.value);
    readAt = Date.now();
    void whoOpened();
  }

  /* WHO NAMES EACH KEY, from three reads that already exist; a refused one names nobody rather than failing the page. */
  async function usesRead() {
    const c = client;
    if (!c) return;
    /* TOOLS COME FROM THE RECORD'S `keyUses`, which names the Tools list so the web need not (web-lists). */
    const [actions, scripts, keyUses] = await Promise.all([c.actions().catch(() => null), c.scripts().catch(() => null), c.keyUses().catch(() => null)]);
    useFrom = { ...(actions?.ok ? { actions: actions.value } : {}), ...(scripts?.ok ? { scripts: scripts.value } : {}), ...(keyUses?.ok ? { keyUses: keyUses.value } : {}) };
  }

  /* WHO OPENED EACH KEY LAST, asked after the index is drawn, so a slow answer never holds the keys back; the line
     appears under a key when its answer does. */
  async function whoOpened() {
    if (!client) return;
    lastBy = await lastUsers(client, keys);
  }

  /* THE TWINS, ASKED ONCE AFTER THE KEYS DREW: a refusal or a record that keeps no twins marks none. */
  async function twinsRead() {
    if (!client) return;
    const out = await client.call('heldTwice', { register: 'credentials' }).catch(() => null);
    const seqs = out?.ok ? (out.value as { seqs?: unknown } | null)?.seqs : null;
    twins = twinsOf(keys, Array.isArray(seqs) ? seqs.filter((n): n is number => typeof n === 'number') : []);
  }

  /* ── putting a key in, and reading one back ── */

  /**
   * THE TWO DOORS THIS SECTION USES ARE NOT RECORD METHODS. `/api/keys/put` and `/api/keys/open` are a step on
   * the host in front of the record: this page sends a value once, the host seals it with its own key store, and
   * the record is handed sealed bytes and never a credential (ADR-062). They take a browser session, refuse every
   * bearer, and want an owner whose last sign-in is under fifteen minutes old, which is the record's own rule.
   */
  let sheet = $state<{ mode: 'add' } | { mode: 'replace'; row: KeyRow } | null>(null);
  const blank = () => ({ label: '', opens: '', kind: 'api_token', project: '', value: '', connector: false, passphrase: '' });

  /**
   * WHICH KEYS A SCHEDULED CONNECTOR CAN OPEN, by grant id, from `listGrants`' `sealed_under`.
   *
   * READ SO A REPLACED VALUE STAYS WHERE IT WAS. A replacement is sealed again under the key the sheet asks for, so a
   * connector's key replaced with the toggle unset would come back as one only a person can open, and the connector
   * would stop on its next run. The toggle starts where the key already is.
   */
  let forConnectors = $state<ReadonlySet<string>>(new Set());
  const connectorGrants = (grants: unknown): ReadonlySet<string> =>
    new Set(
      (Array.isArray(grants) ? (grants as { id?: unknown; sealed_under?: unknown }[]) : [])
        .filter((g) => g.sealed_under === 'connector' && typeof g.id === 'string')
        .map((g) => g.id as string),
    );

  /* THE SHEET'S OWN WORDS for the one control this unit adds, kept beside it rather than in the Keychain's shared list. */
  const connectorWords = {
    field: 'For a scheduled connector',
    hint: 'A connector that runs on a schedule, with nobody signed in, opens only a key added for it. Leave this off for a key you use yourself.',
  };
  let form = $state(blank());
  let saving = $state(false);
  let sheetSaid = $state('');
  /* A KEY WITH NO VALUE IS GIVEN ONE, and only one with a value has it replaced: "Replace Fenwick Cloud recovery codes"
     over a key that held nothing said there was something to replace. */
  const sheetTitle = $derived(
    sheet === null ? words.addKey : sheet.mode === 'replace' ? (sheet.row.sealed ? words.replaceTitle(sheet.row.label) : words.addValueTitle(sheet.row.label)) : words.addKey,
  );
  const sheetHint = $derived(sheet?.mode === 'replace' && sheet.row.sealed ? words.valueAgain : words.valueHint);

  /**
   * THE ONE KEY ON THE SCREEN, and the two timers that take it away: it hides itself after thirty seconds, and a
   * copy leaves the clipboard a minute later (`12 §6` rule 2). Only one is ever shown, so revealing a second puts
   * the first away rather than leaving two of them on the page.
   */
  const HIDE_S = 30;
  const CLIP_MS = 60_000;
  let shown = $state<{ id: string; label: string; value: string; left: number } | null>(null);
  let revealing = $state('');
  let ticker: ReturnType<typeof setInterval> | null = null;
  let clipboard: ReturnType<typeof setTimeout> | null = null;

  function forget() {
    if (ticker) clearInterval(ticker);
    ticker = null;
    shown = null;
  }

  /* AND LEAVING THE SCREEN PUTS IT AWAY. A route change destroys this component, and a timer still holding the
     last value would be a value alive in a tab nobody is looking at. */
  /**
   * THE IDLE LOCK (`keychain-idle.ts`): after the lock time with no input every value is put away, anything typed into a
   * sheet is dropped, and the screen says Locked until the sign-in is proved again. The 30 s hide above and the 60 s
   * clipboard clear run as they did. The lock time is the record's where it says one, else fifteen minutes.
   */
  let locked = $state(false);
  /* WHO LOCKED IT: Lock now says you did, not that it locked itself after a while. */
  let lockedByYou = $state(false);
  let unlocking = $state(false);
  let idle: Idle | null = null;
  /* THE LOCK WINDOW is the record's (`keyAccess`), fifteen minutes until it has said. */
  let lockAfter = $state(lockAfterOf(undefined));
  const rebuildIdle = () => {
    idle?.stop();
    idle = createIdle(lockAfter * 60_000, lockScreen);
  };
  /* WHAT THE ASK TILE AND THE ACCESS SHEET READ AGAIN FOR: bumped when this screen's own data is read. */
  let accessTick = $state(0);
  /* The key whose access sheet is open, by spoken id (else row id), and the ask an alert linked to. */
  let accessFor = $state<KeyRow | null>(null);
  const askFocus = $derived(page.url.searchParams.get('ask'));
  async function readLockAfter() {
    const out = await client?.keyAccess().catch(() => null);
    if (out && out.ok) {
      lockAfter = lockAfterOf(out.value.lock_after);
      if (!locked) rebuildIdle();
    }
  }
  async function chooseLockAfter(e: Event) {
    const minutes = lockAfterOf((e.currentTarget as HTMLSelectElement).value);
    const out = await client?.setLockAfter(minutes as 5 | 15 | 60).catch(() => null);
    if (out && out.ok) lockAfter = lockAfterOf(out.value.lock_after);
    else toasts.push(out && 'refusal' in out ? out.refusal.fix : accessWords.accessRefused, { intent: 'warn' });
    if (!locked) rebuildIdle();
  }
  function lockScreen() {
    forget();
    shut();
    shutAsk();
    form = blank();
    askPass = '';
    locked = true;
    /* THE SERVER'S PROOF GOES STALE TOO, not only this screen. */
    void client?.lockKeychain().catch(() => null);
  }
  onMount(() => {
    rebuildIdle();
    const touch = () => idle?.touch();
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
    for (const e of events) window.addEventListener(e, touch, { passive: true });
    return () => {
      for (const e of events) window.removeEventListener(e, touch);
      idle?.stop();
    };
  });
  const lockNow = () => {
    lockedByYou = true;
    idle?.lockNow();
  };
  async function unlock() {
    if (unlocking) return;
    unlocking = true;
    /* THE SAME RE-PROOF A STALE SIGN-IN GETS: a passkey here, or the sign-in page and back. */
    const proved = await reprove({ support, methods, passkeySignIn }, (href) => location.assign(href));
    unlocking = false;
    if (!proved) return;
    locked = false;
    lockedByYou = false;
    rebuildIdle();
    accessTick++;
  }

  onDestroy(() => {
    forget();
    if (clipboard) clearTimeout(clipboard);
  });

  const shut = () => {
    sheet = null;
    resumeAfter = null;
  };

  /**
   * AND THE BUTTON IS NOT THE ONLY DOOR INTO THIS SHEET. `reconnect()` below calls it straight from the
   * address, and `reconnectOf` hands back `{ mode: 'add' }` for any label the index does not hold,
   * which on an index that came back absent or refused is EVERY label: the Add button is drawn only
   * where `index.kind === 'held'`, and this path walked round it into an eight-field sheet whose save
   * the record would refuse. The guard is here as well as on the button, so both doors answer alike.
   */
  function openAdd() {
    if (!acts || !client || index.kind !== 'held') {
      refuse();
      return;
    }
    if (locked) return;
    sheetSaid = '';
    form = blank();
    sheet = { mode: 'add' };
  }

  /**
   * A PAUSED ACTION'S "Reconnect key" LANDS HERE, on the sheet for the key it named: Replace when the Keychain holds it, Add with
   * the name filled in when it does not. The action it came from is resumed once the key is saved, so the row that said
   * "Reconnect the key and it runs again" is true after one save rather than a save and a trip back to press Resume.
   */
  let resumeAfter: string | null = null;
  function reconnect() {
    /* THE NAVIGATION'S STATE FIRST, which is how "Reconnect key" arrives with nothing after `/keychain`; the address
       second, for a link made before that. A reload drops the state, and the plain Keychain shows. */
    const carried = (page.state as Record<string, unknown>)[RECONNECT_STATE] ?? (history.state as Record<string, unknown> | null)?.[RECONNECT_STATE];
    const asked = reconnectFrom(carried, keys) ?? reconnectOf(new URL(location.href).searchParams, keys);
    if (!asked) return;
    resumeAfter = asked.then;
    if (asked.mode === 'replace') return openReplace(asked.row);
    openAdd();
    form = { ...blank(), label: asked.label };
  }

  function openReplace(row: KeyRow) {
    if (!acts || !client) {
      refuse();
      return;
    }
    if (locked) return;
    sheetSaid = '';
    form = { ...blank(), connector: row.grant !== null && forConnectors.has(row.grant) };
    sheet = { mode: 'replace', row };
  }

  /**
   * A KEY PUT IN, OR ONE ROW'S VALUE REPLACED.
   *
   * THE RECORD'S OWN SENTENCE IS SHOWN IN THE SHEET rather than as a toast, because what it is about is a field
   * that is still on the screen, and a sheet that closes on a refusal is a sheet that throws away the typing.
   *
   * THE KEY ITSELF IS EMPTIED AS IT IS SENT, WHATEVER COMES BACK (RF4), as the passphrase is and as the install sheet's
   * key is: a refusal keeps the sheet and every other field open, and the secret is pasted again rather than held on
   * the screen while the sentence is read.
   */
  async function saveKey(e?: SubmitEvent) {
    e?.preventDefault();
    if (sheet === null || saving) return;
    if (!acts || !client) {
      refuse();
      return;
    }
    const mode = sheet.mode;
    saving = true;
    sheetSaid = '';
    const at = opened();
    /* `sealed_under` ONLY WHEN THE TOGGLE IS ON, so a key for a person sends the body it always sent. */
    const under = form.connector ? { sealed_under: 'connector' as const } : {};
    /* THE PASSPHRASE GOES WITH THIS ONE REQUEST and is emptied from the sheet whatever comes back (`12 §6`). */
    const unlock = withPassphrase(lock, form.passphrase);
    form.passphrase = '';
    const args =
      sheet.mode === 'add'
        ? { label: form.label, opens: form.opens, kind: form.kind, value: form.value, ...(form.project === '' ? {} : { project: form.project }), ...under, ...unlock }
        : { label: sheet.row.label, opens: sheet.row.opens, credential: sheet.row.id, value: form.value, ...under, ...unlock };
    form.value = '';
    const out = await client.putKey(args);
    closed(true, at);
    saving = false;
    if (!out.ok) {
      /* A KEYCHAIN TURNED ON SINCE THIS SCREEN ASKED says so here, and the sheet grows the field it needs. */
      if (wantsPassphrase(out)) lock = { state: 'on' };
      sheetSaid = 'refusal' in out ? out.refusal.fix : copy.writeRaced;
      return;
    }
    /* THE FIRST KEY GIVES THE RECORD A KEY OF ITS OWN, which is what a passphrase is put on, so the switch asks again. */
    if (lock.state === 'none') void probe();
    toasts.push(mode === 'add' ? words.keyAdded(out.value.label) : words.keyReplaced(out.value.label), { intent: 'good' });
    form = blank();
    sheet = null;
    await reread();
    if (resumeAfter !== null) {
      const ingest = resumeAfter;
      resumeAfter = null;
      const back = await client.call('resumeAction', { ingest });
      if (back.ok) toasts.push(actionWords.resumed(ingest), { intent: 'good' });
      else toasts.push('refusal' in back ? back.refusal.fix : copy.writeRaced, { intent: 'warn' });
    }
  }

  /**
   * THE SHEET THAT ASKS FOR THE PASSPHRASE BEFORE A KEY IS OPENED, while the Keychain is behind one. The passphrase goes
   * with the one request it was typed for and the field is emptied whatever comes back, so nothing on this screen
   * holds it between two keys.
   */
  let asking = $state<KeyRow | null>(null);
  let askPass = $state('');
  let askSaid = $state('');
  function openAsk(k: KeyRow) {
    askPass = '';
    askSaid = '';
    asking = k;
  }
  function shutAsk() {
    asking = null;
    askPass = '';
    askSaid = '';
  }
  function askGo(e?: SubmitEvent) {
    e?.preventDefault();
    if (asking === null || askPass === '') return;
    void revealKey(asking, askPass);
  }

  /**
   * ONE KEY, READ BACK ONCE. The record counts it as a `grant.read`, so revealing is an act and not an address:
   * nothing here is reachable by a URL, nothing is written into the query string, and nothing is kept.
   */
  async function revealKey(k: KeyRow, passphrase = '') {
    if (!acts || !client) {
      refuse();
      return;
    }
    if (revealing !== '' || locked) return;
    /* BEHIND A PASSPHRASE, REVEAL ASKS FOR IT FIRST, in a sheet of its own, rather than sending a request it knows the
       record will refuse. */
    if (lock.state === 'on' && passphrase === '') {
      openAsk(k);
      return;
    }
    revealing = k.id;
    const at = opened();
    const out = await client.openKey({ credential: k.id, ...withPassphrase(lock, passphrase) });
    closed(true, at);
    revealing = '';
    askPass = '';
    if (!out.ok) {
      const fix = 'refusal' in out ? out.refusal.fix : copy.writeRaced;
      if (wantsPassphrase(out)) {
        lock = { state: 'on' };
        openAsk(k);
      }
      /* A REFUSAL WHILE THE SHEET IS UP IS SAID IN IT, a wrong passphrase above all, so the next try is one field away. */
      if (asking !== null) askSaid = fix;
      else toasts.push(fix, { intent: 'warn' });
      return;
    }
    shutAsk();
    forget();
    shown = { id: k.id, label: out.value.label, value: out.value.value, left: HIDE_S };
    ticker = setInterval(() => {
      if (shown === null) return;
      const left = shown.left - 1;
      if (left <= 0) forget();
      else shown = { ...shown, left };
    }, 1000);
  }

  /** A copy, and the clipboard cleared a minute later whatever is on the screen by then (`12 §6` rule 2). */
  async function copyShown() {
    if (shown === null) return;
    try {
      await navigator.clipboard.writeText(shown.value);
    } catch {
      /* A browser that will not write to the clipboard says so by doing nothing, and the value is still on screen. */
      return;
    }
    toasts.push(words.copied, { intent: 'good' });
    if (clipboard) clearTimeout(clipboard);
    clipboard = setTimeout(() => void navigator.clipboard.writeText('').catch(() => undefined), CLIP_MS);
  }
</script>


<svelte:head><title>{titleOf(copy.keychain)}</title></svelte:head>

<!-- THE SENTENCE ON ITS WAY HOLDS THE ROOM A USUAL ONE TAKES (`HELD_LIKE`): held empty, the line took no width, Add a key
     stood beside it on a phone, and the page dropped 32px when the words came and pushed the buttons under them. -->
<PageHead icon="vault" title={copy.keychain} count={index.kind === 'held' ? keys.length : undefined} sentence={sentence?.text ?? (noKeys || from === 'live' ? '' : undefined)} needs={sentence?.needs} heldLines={1} heldText={HELD_LIKE}>
  {#snippet actions()}
    <!-- ONE KEYS PLACE (AG16): the list of the same rows is this place's Table view. -->
    <KeyViews on="keys" />
    <!-- ON A PHONE "Add a key" IS THE TOOLBAR'S CIRCLE: ink while it is the one thing to press, glass
         while a request waiting for its digits holds the screen's one primary. At a desk it is the list's own pill. -->
    <!-- AND ITS PLACE HELD, UNSEEN, WHILE THE KEYS ARE READ: drawn only once they landed, the circle widened the row
         and pushed the buttons under the sentence, and the page dropped 32px on a phone (0.28 of its layout shift). -->
    {#if (acts && index.kind === 'held') || from === 'reading'}
      <span class="add-phone" style:visibility={acts && index.kind === 'held' ? undefined : 'hidden'} aria-hidden={acts && index.kind === 'held' ? undefined : 'true'}>
        <!-- INK, NEVER THE RED (live check, 1 Nov): with Unlock, an empty list's Add a key or a request's Allow once on the
             screen, the circle made two red buttons on a phone. The screen's one red is the one that needs him. -->
        <Button weight={waiting.length ? 'glass' : 'add'} aria-label={tileWords.addKey} title={tileWords.addKey} onclick={openAdd}>
          <Icon name="plus" size="l" />
        </Button>
      </span>
    {/if}
  {/snippet}
</PageHead>

<!-- WHAT IS UNDER THE ASKS WAITS UNSEEN FOR THEIR FIRST READ (nojump, 2 Nov): a machine's ask landed over the keys a beat
     after the page and pushed them down 188px on a phone. Never longer than 2.5s. -->
<div class="page" data-asking={acts && !asksRead ? '' : undefined}>
  {#if acts}<AskTile {client} refresh={accessTick} focus={askFocus} paused={locked} {acts} onread={() => (asksRead = true)} />{/if}
  {#if waiting.length}
    <!--
      THE REQUEST LEADS, AND ONLY WHILE THERE IS ONE: it is time-boxed, so it is the one tile that is about now. Amber and
      not red, because it waits on him rather than being late; the sentence over the page carries the red.
    -->
    <Tile icon="lock" title={tileWords.askingTitle} count={waiting.length > 1 ? waiting.length : undefined} data-part="asking">
      <ul class="ledger ledger-lead whos">
        {#each waiting as d (d.handle)}
          <li class="who" data-intent="warn" data-needs in:lineIn out:dismiss animate:flip={settle()}>
            <div class="line line-tall">
              <span class="line-mark"><IconWell name="session" size="l" /></span>
              <span class="line-main">
                <span class="line-title who-name" data-own={d.label ? '' : undefined}>{d.label ?? copy.unnamedMachine}</span>
                <span class="line-detail who-detail"
                  ><span class="state"><span class="dot" data-tone="warn" role="img" aria-label={TONES.warn.label}></span>{tileWords.waiting}</span
                  ><span class="sep" aria-hidden="true">{' · '}</span>{scopeName(d.scope, names)}<span class="sep" aria-hidden="true">{' · '}</span>{words.days(
                    daysFor(d.scope),
                  )}</span
                >
              </span>
              <span class="line-when">{copy.endsWhen(since(d.expires, Date.now()))}</span>
              {#if acts}
                <span class="line-verbs"><Button size="sm" onclick={() => void deny(d)}>{tileWords.deny}</Button></span>
              {/if}
            </div>
          </li>
        {/each}
      </ul>

      <form class="code-form" onsubmit={tryCode} novalidate>
        <label class="field-label" for="keychain-code">{copy.codeLabel}</label>
        <div class="code-row">
          <div class="field code-field">
            <input
              class="field-input code-input"
              id="keychain-code"
              type="text"
              inputmode="numeric"
              autocomplete="one-time-code"
              autocapitalize="off"
              spellcheck="false"
              placeholder={'0'.repeat(CODE_DIGITS)}
              value={typed}
              oninput={(e) => retype((e.currentTarget as HTMLInputElement).value)}
              aria-describedby="keychain-code-said"
              aria-invalid={said?.tone === 'bad' ? 'true' : undefined}
            />
          </div>
          <Button weight="primary" type="submit" disabled={approving}>{copy.codeGo}</Button>
        </div>
        <p class="code-said" id="keychain-code-said" role="status" data-intent={said?.tone}>
          {#if said}<span class="code-glyph" role="img" aria-label={TONES[said.tone].label}>{TONES[said.tone].glyph}</span>{said.line}{/if}
        </p>
        {#if answer?.kind === 'signin'}
          <div class="row-actions">
            <Button weight="quiet" disabled={reproving} onclick={() => void signInAgain()}>{copy.signInAgain}</Button>
          </div>
        {/if}
      </form>
    </Tile>
  {/if}

  {#if locked}
    <!-- LOCKED: nothing is shown and nothing can be revealed until the sign-in is proved again. Calm, not an error. -->
    <Tile icon="lock" title={dated.locked} data-part="locked">
      <p class="said">{lockedByYou ? dated.lockedByYou : dated.lockedWhy}</p>
      <div class="row-actions"><Button weight="primary" disabled={unlocking} onclick={() => void unlock()}>{dated.unlock}</Button></div>
    </Tile>
  {/if}

  <Tile icon="key" class="section keys-tile" data-surface="tile" title={words.keys}>
    {#snippet actions()}
      {#if acts && !locked}
        <label class="vh" for="lock-after">{accessWords.lockAfter}</label>
        <div class="field lock-field">
          <select class="field-input" id="lock-after" value={String(lockAfter)} onchange={(e) => void chooseLockAfter(e)}>
            {#each LOCK_AFTER_MINUTES as m (m)}<option value={String(m)}>{accessWords.lockAfter} {accessWords.minutes(m)}</option>{/each}
          </select>
        </div>
        <Button weight="quiet" onclick={lockNow}>{dated.lockNow}</Button>
      {/if}
      <!-- AND NO FORM OVER A LIST THAT IS NOT THERE: an eight-field sheet whose save the record would refuse. -->
      <!-- NOT OVER AN EMPTY LIST, whose own Add a key stands under it (live check of 2 Nov: two Add a key, one above the other). -->
      {#if acts && index.kind === 'held' && !(indexTell === null && from !== 'reading' && keys.length === 0)}
        <span class="add-desk"><Button onclick={openAdd}>{words.addKey}</Button></span>
      {/if}
    {/snippet}
    <div class="section-body">
      {#if indexTell}
        <!--
          WHAT THE RECORD SAID, RATHER THAN "No keys yet." OVER IT. A record with no Keys register and a
          record that will not hand the index over are two different states, and both used to be drawn as
          the third, an index that came back empty.
        -->
        <Empty kind={indexTell.kind} title={indexTell.title} body={indexTell.body}>
          {#snippet actions()}
            {#if index.kind === 'absent'}<Button weight="primary" href="/plugins">{tells.browse}</Button>{/if}
          {/snippet}
        </Empty>
      {:else if from !== 'reading' && keys.length === 0}
        <Empty kind="no-data-yet" glyph="key" title={words.noKeys} body={words.noKeysHow}>
          {#snippet actions()}
            <!-- THE RED IS UNLOCK'S WHILE IT IS LOCKED: the screen's one red is the one that needs him. -->
            {#if acts && index.kind === 'held'}<Button weight={locked ? undefined : 'primary'} onclick={openAdd}>{words.addKey}</Button>{/if}
          {/snippet}
        </Empty>
        <div class="agent-add">
          <p>{words.noKeysAgent}</p>
          <CodeLine text={words.noKeysCommand} />
        </div>
      {/if}
      <!-- A COUNT THE RECORD WOULD NOT GIVE IS SAID ONCE, in the record's own words, and never drawn as "never opened". -->
      {#if uncounted}<p class="said">{uncounted}</p>{/if}
      <!-- KEYS THE RECORD HOLDS PAST THE ONES READ ARE SAID, so a list that stopped short never reads as all of them. -->
      {#if moreKeys}<p class="said">{tileWords.moreKeys(keys.length)}</p>{/if}
      <!-- KEYS THAT LOOK LIKE THEY BELONG TO A PROJECT: one line and one button that puts the move on Decide. Loaded after
           the screen drew; nothing here at nought or on a refusal. -->
      {#if scope}<scope.Note found={scope.found} call={scope.call} />{/if}
      {#if asked}<p class="said">{tileWords.searched(asked, shownKeys.length)} <a href={at('/keychain')}>{tileWords.everyKey}</a></p>{/if}
      <!-- THE BOX THAT FINDS A KEY AS IT IS TYPED: its name, what it opens or who it is with. -->
      {#if keys.length > 1}
        <div class="find">
          <label class="vh" for="key-find">{tileWords.find}</label>
          <div class="field find-field"><input class="field-input find-input" id="key-find" type="search" autocomplete="off" placeholder={tileWords.find} bind:value={findText} /></div>
          <label class="vh" for="key-sort">{dated.sortLabel}</label>
          <div class="field sort-field">
            <select class="field-input" id="key-sort" bind:value={sortBy}>
              {#each SORTS as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
            </select>
          </div>
        </div>
      {/if}
      {#if findText.trim() !== '' && shownKeys.length === 0}<p class="said">{tileWords.searched(findText.trim(), 0)}</p>{/if}
      {#if shared}<p class="said">{tileWords.sharedSaid(shared)}</p>{/if}
      {#each groups as g (g.name)}
      {#if severalGroups}
        <details class="key-group" open={unfolded} aria-label={g.name}>
          <summary class="group-head">{#if g.scope}<ScopeChip scope={g.scope} inline />{:else}{g.name}{/if} <span class="group-count">{tileWords.keysIn(g.services.reduce((n, sv) => n + sv.keys.length, 0))}</span></summary>
          {@render groupKeys(g)}
        </details>
      {:else}
        <section class="key-group" aria-label={g.name}>{@render groupKeys(g)}</section>
      {/if}
      {/each}
    </div>
  </Tile>

  {#snippet groupKeys(g: KeyGroup)}
      {#each g.services as sv (sv.provider ?? '')}
      {#if severalGroups && sv.provider}<h3 class="service-head">{sv.provider}</h3>{/if}
      <ul class="ledger ledger-lead whos keys">
        {#each sv.keys as k (k.id)}
          <!--
            ONE ROW ANATOMY: the key's well, its name (a link to its row), and under it where it applies, what it
            opens and whether a value is sealed here; how often it was opened at the end; Reveal and the "…" menu always drawn at a desk, the "…" alone on a phone.
            Replace and Revoke stay in the key's own menu (design 2.14): neither is what a person comes to the Keychain to do most.

            A SEALED KEY SAYS WHAT IT IS, UNOPENED, after what it opens: the hint the host wrote when it sealed it. A KEY WITH
            NO VALUE HAS "Add value" WHERE A SAVED ONE HAS REVEAL, which opens the sheet Replace opens and seals onto
            this same row. Where the key came from, when its row says, is the first line of its menu.
          -->
          {@const state = stateOf(k)}
          {@const hint = hintOf(k)}
          {@const action = rowAction(k)}
          {@const origin = cameFrom.get(k.id)}
          {@const href = rowPath(k)}
          {@const u = lastBy.get(k.id)}
          <li data-menu-host class="who key" data-selected={shown && shown.id === k.id ? '' : undefined} in:lineIn out:dismiss animate:flip={settle()}>
            <div class="line line-tall">
              <span class="line-mark"><IconWell name="key" size="l" /></span>
              <span class="line-main">
                {#if href}<a class="line-title key-name tap" href={at(href)} data-own>{keyName(k.label)}</a>{:else}<span class="line-title key-name" data-own>{keyName(k.label)}</span>{/if}
                {#if k.account}<span class="line-detail key-account" data-own>{k.account}</span>{/if}
                <!-- WHERE IT APPLIES, THEN WHAT IT OPENS, as words in the meta line: the project's dot and name, or "All
                     projects". A saved value draws nothing; a key with no value says so with the ring and the words. -->
                <!-- WHERE IT APPLIES IS THE GROUP'S HEAD once there are groups, so the line says what it opens, in words:
                     a day as how long ago, a key named by its handle by its name (`opensInWords`). -->
                <span class="line-detail key-meta">
                  {#if !severalGroups}{#if k.scope}<ScopeChip scope={k.scope} inline />{:else}<span class="key-all">{tileWords.allProjects}</span>{/if}{/if}
                  {#if k.opens}{#if !severalGroups}<span class="sep" aria-hidden="true">{' · '}</span>{/if}<span class="key-opens" data-own>{opensInWords(k.opens, keys)}</span>{/if}
                  {#if hint}<span class="key-hint" data-own>{hint}</span>{/if}
                  {#if !state.sealed && state.word !== shared}<span class="sep" aria-hidden="true">{' · '}</span><span class="state" data-warn={state.warn ? '' : undefined}><span class="dot" aria-hidden="true"></span>{state.word}</span>{/if}
                  {#if twins.has(k.id)}<span class="sep" aria-hidden="true">{' · '}</span><span class="twice">{tileWords.twice}</span>{/if}
                </span>
                {#if changedSaid(k, readAt) || expiresSaid(k, readAt)}
                  <span class="line-detail key-dates">
                    {#if changedSaid(k, readAt)}<span class="key-changed">{changedSaid(k, readAt)}</span>{/if}
                    {#if changedSaid(k, readAt) && expiresSaid(k, readAt)}<span class="sep" aria-hidden="true">{' · '}</span>{/if}
                    {#if expiresSaid(k, readAt)}<span class="key-expires" class:key-warn={k.expires && k.expires < recordToday(readAt)}>{expiresSaid(k, readAt)}</span>{/if}
                  </span>
                {/if}
              </span>
              <span class="key-count">
                {#if k.sealed && counts}
                  <span class="key-opened num">{openedSaid(k.opened)}</span>
                  {#if u}
                    {@const run = runPath(u.run)}
                    {@const who = tileWords.lastBy(u.agent ?? u.run, since(u.at, Date.now()))}
                    <span class="key-last who-used">{#if run}<a href={at(run)}>{who}</a>{:else}{who}{/if}</span>
                  {:else if k.lastOpened}
                    <span class="key-last">{words.lastOpened(since(k.lastOpened, Date.now()))}</span>
                  {/if}
                {/if}
              </span>
              {#if acts}
                <span class="line-verbs who-do key-do">
                  {#if action?.act === 'reveal'}
                    <!-- ONLY WHERE THERE IS SOMETHING SEALED TO OPEN: an index row points at no grant. -->
                    <Button size="sm" disabled={revealing === k.id || locked} onclick={() => void revealKey(k)}>
                      {revealing === k.id ? words.revealing : words.reveal}
                    </Button>
                  {:else if action?.act === 'seal'}
                    <Button size="sm" onclick={() => openReplace(k)}>{action.word}</Button>
                  {:else if k.sealed}
                    <Button size="sm" onclick={() => openReplace(k)}>{words.replace}</Button>
                  {/if}
                  <Menu label={moreFor(k.label)} align="end">
                    {#snippet trigger()}
                      <span class="more-trigger"><Icon name="more" size="s" /><span class="vh">{moreFor(k.label)}</span></span>
                    {/snippet}
                    {#if origin}<p class="mi-note">{tileWords.cameFromSaid(origin)}</p>{/if}
                    {#if action?.act === 'reveal'}
                      <button type="button" class="mi" role="menuitem" disabled={revealing === k.id} onclick={() => void revealKey(k)}><Icon name="eye" size="s" />{words.reveal}</button>
                    {/if}
                    <button type="button" class="mi" role="menuitem" onclick={() => openReplace(k)}><Icon name="refresh" size="s" />{k.sealed ? words.replace : tileWords.sealValue}</button>
                    <button type="button" class="mi" role="menuitem" onclick={() => (accessFor = k)}><Icon name="people" size="s" />{accessWords.access}</button>
                    {#if k.grant && k.sealed}
                      <button type="button" class="mi" role="menuitem" data-tone="bad" onclick={() => void retireKey(k)}><Icon name="ban" size="s" />{copy.revokeKey}</button>
                    {/if}
                  </Menu>
                </span>
              {/if}
            </div>
            {#if shown && shown.id === k.id}
              <!--
                THE ONE PLACE A VALUE IS DRAWN. It goes by itself, the countdown says when, and nothing puts it in
                the address, in the page title or in a toast.
              -->
              <div class="shown">
                <output class="shown-value" for={`key-${k.id}`}>{shown.value}</output>
                <div class="shown-do">
                  <Button size="sm" onclick={() => void copyShown()}>{words.copyValue}</Button>
                  <Button size="sm" weight="bare" onclick={forget}>{words.hide}</Button>
                  <span class="shown-left num">{words.hidesIn(shown.left)}</span>
                </div>
              </div>
            {/if}
            <!-- WHAT NAMES THIS KEY, from the actions, tools and scripts already read; no value is read for it. A LINE UNDER
                 THE NAME, OR NOTHING (AF14): a fold said "Used by (1)", and over a key nothing named a bare "Used by" set out
                 left of the rows. The first few are named; the rest are a fold. -->
            {#each [usesOf(k, useFrom)] as uses}
              {#if uses.length > 0 && uses.length <= USES_SAID}
                <p class="key-uses">{dated.usedBy}{#each uses as u, i (u.kind + u.name)}{i === 0 ? ' ' : i === uses.length - 1 ? ' and ' : ', '}{#if u.href}<a href={at(u.href)}>{u.name}</a>{:else}{u.name}{/if}{/each}</p>
              {:else if uses.length > USES_SAID}
                <details class="key-uses key-details">
                  <summary>{dated.usedByMany(uses.length)}</summary>
                  <ul>
                    {#each uses as u (u.kind + u.name)}
                      <li>{#if u.href}<a href={at(u.href)}>{u.name}</a>{:else}{u.name}{/if} <span class="group-count">{u.kind}</span></li>
                    {/each}
                  </ul>
                </details>
              {/if}
            {/each}
          </li>
        {/each}
      </ul>
      {/each}
  {/snippet}

  <Tile icon="monitor" class="section" data-surface="tile" title={words.mayOpen} count={holding.length || undefined}>
    <div class="section-body">
      {#if machinesTell}
        <!-- THE HALF THAT IS OWNER-ONLY SAYS SO IN THE RECORD'S WORDS, and it no longer takes the page with it. -->
        <Empty kind={machinesTell.kind} title={machinesTell.title} body={machinesTell.body} />
      {:else if from !== 'reading' && holding.length === 0}
        <!-- A PART OF THE SCREEN, NOT ITS ANSWER (audit 2, B18): no machine yet beside six keys settled Keys as "empty". -->
        <Empty kind="no-data-yet" title={words.noMachines} compact />
        <p class="said">{words.noMachinesHow}</p>
      {/if}
      <ul class="ledger ledger-lead whos">
        {#each holding as d (d.handle)}
          <!-- THE KEYS' ROW SHAPE, so a machine and a key read as one kind of list: its well, its name, where it may open
               keys and when it was last used, when its grant ends, and Revoke on hover. -->
          <li class="who" in:lineIn out:dismiss animate:flip={settle()}>
            <div class="line line-tall">
              <span class="line-mark"><IconWell name="session" size="l" /></span>
              <span class="line-main">
                <span class="line-title who-name" data-own={d.label ? '' : undefined}>{d.label ?? copy.unnamedMachine}</span>
                <span class="line-detail who-detail"
                  >{scopeName(d.scope, names)}<span class="sep" aria-hidden="true">{' · '}</span>{d.last_used
                    ? copy.usedWhen(since(d.last_used, Date.now()))
                    : copy.neverUsed}</span
                >
              </span>
              <span class="line-when">{copy.endsWhen(relative(d.expires.slice(0, 10), Date.now()))}</span>
              {#if acts}
                <span class="line-verbs who-do">
                  <Button size="sm" weight="bare" tone="bad" onclick={() => void revokeRow(d)}>{copy.revokeKey}</Button>
                </span>
              {/if}
            </div>
          </li>
        {/each}
      </ul>
    </div>
  </Tile>

  {#if opens}
    <!-- THE ONE FIGURE: how often the sealed keys were opened, one bar a key, the most opened in ink.
         Counts and names only; a value never reaches a chart. -->
    <Tile icon="key" title={tileWords.opensTitle} meta={`${tileWords.opensMeta} · ${dated.asOf(new Date(readAt).toLocaleDateString('en', { day: 'numeric', month: 'short' }))}`}>
      <p class="figure num">{opens.total.toLocaleString('en')}<span class="figure-unit">{tileWords.opensUnit(opens.total)}</span></p>
      <Bars items={opens.bars} subject={tileWords.opensTitle} />
      <p class="reading">{opens.reading}</p>
    </Tile>
  {/if}

  <!-- THE PASSPHRASE IS ONE ROW AT THE FOOT, for a person who may act here: the keys come first, since they are what a
       person opens the Keychain for, and how the passphrase works is a fold under it. -->
  {#if acts}
    <Passphrase {lock} {client} keys={keys.length} onask={probe} onturn={(next) => (lock = next)} />
  {/if}

  <AccessSheet {client} credential={accessFor ? (accessFor.spoken ?? accessFor.id) : null} label={accessFor?.label ?? ''} machines={holding} onclose={() => (accessFor = null)} />

  <Sheet open={sheet !== null} title={sheetTitle} subtitle={sheetHint} onclose={shut}>
    <form class="key-form" id="key-form" onsubmit={saveKey} novalidate>
      {#if sheet?.mode === 'add'}
        <label class="field-label" for="key-label">{words.nameField}</label>
        <div class="field"><input class="field-input" id="key-label" type="text" autocomplete="off" bind:value={form.label} /></div>
        <p class="field-hint">{words.nameHint}</p>

        <label class="field-label" for="key-opens">{words.opensAsk}</label>
        <div class="field"><input class="field-input" id="key-opens" type="text" autocomplete="off" bind:value={form.opens} /></div>
        <p class="field-hint">{words.opensHint}</p>

        <label class="field-label" for="key-kind">{words.kindField}</label>
        <div class="field">
          <select class="field-input" id="key-kind" bind:value={form.kind}>
            {#each words.kinds as kind (kind.id)}<option value={kind.id}>{kind.name}</option>{/each}
          </select>
        </div>

        <!--
          ONLY WHERE THERE IS A PROJECT TO PICK. On a record with no projects list the record refuses
          that read, and this select then offered one option, "No project", which is a control that
          cannot change anything.
        -->
        {#if names.size > 0}
          <label class="field-label" for="key-project">{words.projectField}</label>
          <div class="field">
            <select class="field-input" id="key-project" bind:value={form.project}>
              <option value="">{words.projectNone}</option>
              {#each [...names] as [id, name] (id)}<option value={id}>{name}</option>{/each}
            </select>
          </div>
        {/if}
      {/if}

      <label class="field-label" for="key-value">{words.valueField}</label>
      <!-- A PASSWORD FIELD, so it is not drawn while it is typed and no browser offers to remember it. -->
      <div class="field">
        <input class="field-input" id="key-value" type="password" autocomplete="off" spellcheck="false" bind:value={form.value} />
      </div>

      <!-- WHILE THE KEYCHAIN IS BEHIND A PASSPHRASE the key is sealed only with it, so the sheet asks for it here. -->
      {#if lock.state === 'on'}
        <PassField id="key-passphrase" label={words.passField} hint={words.keyPassHint} autocomplete="current-password" bind:value={form.passphrase} />
      {/if}

      <!-- THE WHOLE LINE IS THE TARGET, the box and its words, so a thumb on a phone finds it at the tap height. -->
      <label class="field-toggle" for="key-connector">
        <input id="key-connector" type="checkbox" bind:checked={form.connector} />
        <span>{connectorWords.field}</span>
      </label>
      <p class="field-hint">{connectorWords.hint}</p>
      {#if sheetSaid}<p class="code-said" data-intent="bad" role="status">
          <span class="code-glyph" role="img" aria-label={TONES.bad.label}>{TONES.bad.glyph}</span>{sheetSaid}
        </p>{/if}
    </form>
    {#snippet footer()}
      <Button weight="quiet" onclick={shut}>{words.cancel}</Button>
      <Button weight="primary" type="submit" form="key-form" disabled={saving}>{saving ? words.saving : words.save}</Button>
    {/snippet}
  </Sheet>

  <Sheet open={asking !== null} title={asking ? words.askTitle(asking.label) : words.passField} subtitle={words.askHint} onclose={shutAsk}>
    <form class="key-form" id="ask-form" onsubmit={askGo} novalidate>
      <PassField id="ask-passphrase" label={words.passField} autocomplete="current-password" bind:value={askPass} invalid={askSaid !== ''} />
      {#if askSaid}<p class="code-said" data-intent="bad" role="status">
          <span class="code-glyph" role="img" aria-label={TONES.bad.label}>{TONES.bad.glyph}</span>{askSaid}
        </p>{/if}
    </form>
    {#snippet footer()}
      <Button weight="quiet" onclick={shutAsk}>{words.cancel}</Button>
      <Button weight="primary" type="submit" form="ask-form" disabled={revealing !== '' || askPass === ''}>
        {revealing !== '' ? words.revealing : words.askGo}
      </Button>
    {/snippet}
  </Sheet>
</div>

<style>
  /* TILES 12 APART, THE BOARD'S GAP (Look B): they stood 32 apart here and 12 on every other screen. */
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    padding: var(--page-head-gap) var(--gutter) var(--page-bottom);
    /* THE PAGE'S CAP IS THE TOKEN EVERY SCREEN SHARES (design 6.7), not a width of its own. */
    max-inline-size: var(--page-max);
  }

  /* THE COMMAND AN AGENT ADDS A KEY WITH, under the empty list, on a line of its own with Copy. */
  /* 12 UNDER THE EMPTY STATE'S BUTTON: the section body is a block, so "Or have an agent add one" sat on it at 0. */
  .agent-add {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin-block-start: var(--sp-3);
    max-inline-size: 640px;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  .agent-add p {
    margin: 0;
  }

  /* THE FIGURE, `t-figure`, with its unit in meta beside it. */
  .figure {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
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
    line-height: var(--lead-meta);
    font-weight: 500;
    letter-spacing: 0;
  }

  /* THE ONE LINE THAT READS THE CHART, in ink, under it. */
  .reading {
    margin: 0;
    max-inline-size: var(--measure);
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: calc(20px * var(--type, 1));
  }

  /* THE RECORD'S OWN SENTENCE FOR A COUNT IT WOULD NOT GIVE, once, above the rows it is about. */
  .said {
    margin: 0 0 var(--sp-2);
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: calc(18px * var(--type, 1));
  }

  /* THE GROUPS: a project's name over its keys, then who they are with, quieter, over each service's own. */
  .key-group + .key-group {
    margin-block-start: var(--sp-4);
  }

  .group-head {
    margin: 0 0 var(--sp-1);
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 600;
    line-height: calc(20px * var(--type, 1));
  }

  /* FOLDED PROJECTS SIT AS ONE LIST: rows a hairline apart, not islands 60px apart with nothing
     between them. An open one keeps its room above and below. */
  details.key-group:not([open]) + details.key-group {
    margin-block-start: 0;
    border-block-start: 1px solid var(--rule);
  }

  details.key-group:not([open]) summary.group-head {
    margin-block-end: 0;
  }

  /* THE LAST FOLDED LINE'S AIR IS THE CARD'S PADDING: its words stand in the middle of a 44 line. */
  details.key-group:last-child:not([open]) {
    margin-block-end: -12px;
  }

  /* A FOLDED PROJECT IS A LINE A THUMB OPENS: its name and how many keys, the whole line the target. Its chevron says
     it opens (a flex summary loses the browser's own marker), pointing on while folded and down once open. */
  summary.group-head {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: var(--tap);
    list-style: none;
    cursor: pointer;
  }

  summary.group-head::-webkit-details-marker {
    display: none;
  }

  summary.group-head::after {
    content: '';
    flex: none;
    inline-size: 6px;
    block-size: 6px;
    margin-inline: var(--sp-1) var(--sp-1);
    border: solid var(--ink-3);
    border-width: 0 1.5px 1.5px 0;
    transform: rotate(-45deg);
    transition: transform var(--d-state) var(--ease-out);
  }

  details.key-group[open] > summary.group-head::after {
    transform: rotate(45deg);
  }

  @media (hover: hover) and (pointer: fine) {
    summary.group-head:hover::after {
      border-color: var(--ink);
    }
  }

  .group-count {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
    font-weight: 400;
  }

  .find {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    margin: 0 0 var(--sp-3);
  }

  .find-field {
    flex: 1 1 14rem;
  }

  .sort-field {
    flex: 0 1 12rem;
  }

  /* THE HEADING'S LOCK CHOICE IS A CONTROL, NOT A FIELD: as tall as Lock now beside it and as wide as its words, so the
     heading holds its three controls on one line on a desk. */
  .lock-field {
    flex: none;
    min-block-size: var(--ctl-h);
  }

  .lock-field .field-input {
    min-block-size: var(--ctl-h);
    font-size: var(--fs-ctl);
  }

  /* UNDER A THUMB THE SELECT ITSELF IS THE TARGET: the select is what opens, so the floor is its own and not its box's. */
  @media (pointer: coarse) {
    .lock-field,
    .lock-field .field-input {
      min-block-size: var(--tap);
    }
  }

  /* ON A PHONE THE FINDER AND ITS ORDER SHARE ONE LINE: the order no longer wraps under the box at half its width. */
  @media (width < 640px) {
    .find {
      flex-wrap: nowrap;
    }

    /* THE BOX THE WIDER OF THE TWO: the order's select sized itself to its longest option and left "Find a key" a third
       of the line. */
    .find .sort-field {
      flex: 0 1 8.5rem;
      min-inline-size: 0;
    }

    .find .sort-field .field-input {
      inline-size: 100%;
      min-inline-size: 0;
    }
  }

  .find-input {
    inline-size: 100%;
  }

  /* ON A PHONE THE LOCK CONTROLS TAKE THEIR OWN LINE FROM THE TITLE'S EDGE: wrapped to the right they hung under nothing,
     and the title stood alone above a gap. */
  @media (width < 640px) {
    :global(.keys-tile > .tile-head > .tile-aside) {
      flex-basis: 100%;
      justify-content: flex-start;
      margin-inline-start: 0;
    }
  }

  /* A PROJECT'S NAME ON ITS LINE IS THE SIZE "All projects" IS under it: the inline chip drew it at 13 beside a 15. */
  .group-head :global(.scope-chip[data-inline]) {
    font-size: var(--fs-body);
  }

  /* THE COUNT ON A PROJECT'S LINE SITS AT ITS END, on the column every row's count keeps. */
  .group-count {
    margin-inline-start: auto;
    font-variant-numeric: tabular-nums;
  }

  .key-dates,
  .key-details {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  .key-details {
    padding-block: var(--sp-1);
  }

  /* UNDER THE KEY'S NAME, lined up with it as the revealed value is, never out at the row's edge. */
  .key-uses {
    margin: 0 var(--sp-3) var(--sp-2) calc(var(--well-l) + var(--sp-3) * 2);
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: calc(18px * var(--type, 1));
  }

  .key-uses a {
    color: var(--ink-2);
  }

  .key-details summary {
    cursor: pointer;
    min-block-size: var(--tap);
    display: flex;
    align-items: center;
  }

  .key-details ul {
    margin: 0;
    padding-inline-start: var(--sp-5);
  }

  .key-warn {
    color: var(--warn);
  }

  /* A KEY HELD TWICE, said in words beside what it opens. */
  .twice {
    color: var(--ink-2);
    font-weight: 500;
  }

  .service-head {
    margin: var(--sp-2) 0 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: 500;
    line-height: calc(18px * var(--type, 1));
  }

  /* ── the rows ─────────────────────────────────────────────────────────── */

  /* A ROW THAT IS NOT A LINK STILL TAKES THE WASH under the pointer, and the hairlines either side of it
     step aside, as `rows.css` does for a link's row, so the fill is one clean shape. */
  @media (hover: hover) and (pointer: fine) {
    .whos > li:hover > .line {
      background: var(--hover);
    }

    .whos > li:hover > .line::after,
    .whos > li:hover + li > .line::after {
      opacity: 0;
    }
  }

  /* THE NAME, a link to the key's own row that looks like a title until it is pointed at. */
  .key-name {
    color: var(--ink);
    text-decoration: none;
  }

  @media (hover: hover) and (pointer: fine) {
    a.key-name:hover {
      text-decoration: underline;
      text-decoration-color: color-mix(in srgb, var(--ink) 40%, transparent);
      text-underline-offset: 3px;
    }
  }

  /* THE META LINE: where it applies first, so the chip starts every row's second line, then what it opens, then the
     state. One line at a desk; the parts that do not fit are cut at the end, never wrapped under the name. */
  .key-meta,
  .who-detail {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  .key-meta > :global(*) {
    flex: none;
  }

  .key-opens {
    flex: 0 1 auto;
    min-inline-size: 0;
    overflow: hidden;
    color: var(--ink-2);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* WHAT A SEALED KEY IS, UNOPENED: quieter than what it opens, and whole, since it is the short one of the two. */
  .key-hint {
    color: var(--ink-3);
    white-space: nowrap;
  }

  .sep {
    color: var(--ink-3);
  }

  /* A STATE IS A 6PX DOT AND ITS WORD: ink for a value sealed here, an open ring for a key kept
     elsewhere or out of service, amber for a machine waiting on its six digits. */
  .state {
    display: inline-flex;
    align-items: center;
    gap: calc(6px * var(--dense, 1));
    white-space: nowrap;
  }

  .dot {
    flex: none;
    inline-size: 6px;
    block-size: 6px;
    box-sizing: border-box;
    border: 1.5px solid var(--ink-3);
    border-radius: var(--r-ctl);
  }

  /* NO VALUE YET IS THE ONE STATE THAT NEEDS SOMETHING: a ring in the warn hue, and its words in ink. */
  .state[data-warn] {
    color: var(--ink);
  }

  .state[data-warn] .dot {
    border-color: var(--warn-fill);
  }

  .key-all {
    color: var(--ink-2);
  }

  /* THE KEY'S ONE PRESS IS ALWAYS DRAWN AT A DESK, "Add value" or Reveal, never only under the pointer. */
  .key .key-do {
    opacity: 1;
  }

  .dot[data-tone='warn'] {
    background: var(--warn-fill);
    border-color: var(--warn-fill);
  }

  /* THE COUNT AT THE ROW'S END: how often, tabular, and under it who opened it last. */
  .key-count {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
    min-inline-size: 0;
    text-align: end;
  }

  .key-opened {
    color: var(--ink-2);
    font-size: var(--fs-meta);
    font-weight: 500;
    line-height: calc(18px * var(--type, 1));
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .key-last {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: calc(18px * var(--type, 1));
    white-space: nowrap;
  }

  .who-used a {
    color: inherit;
    text-underline-offset: 3px;
  }

  /* THE "…" TRIGGER, a round control the height of a row's verb. `Menu` puts it in a `.tap` button. */
  .more-trigger {
    display: grid;
    place-items: center;
    inline-size: var(--ctl-h-sm);
    block-size: var(--ctl-h-sm);
    border-radius: var(--r-ctl);
    color: var(--ink-2);
    transition:
      background var(--d-state) var(--ease-out),
      color var(--d-state) var(--ease-out);
  }

  @media (hover: hover) and (pointer: fine) {
    .more-trigger:hover {
      background: var(--tile-2);
      color: var(--ink);
    }
  }

  /* A label for a screen reader only, scoped here because there is no global one. */
  .vh {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* A MENU'S ROW, 32 tall with the verb; `Menu` makes them 48px rows at 16px when it rises as a sheet. */
  .mi {
    display: flex;
    align-items: center;
    inline-size: 100%;
    min-block-size: 32px;
    padding: 0 var(--sp-3);
    background: none;
    border: 0;
    border-radius: var(--r-xs);
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-body);
    text-align: start;
    cursor: pointer;
  }

  .mi:focus-visible {
    background: var(--hover);
  }

  @media (hover: hover) and (pointer: fine) {
    .mi:hover {
      background: var(--hover);
    }
  }


  /* A SENTENCE IN A MENU, not a row: nothing happens when it is pressed. Where the key came from, wrapped, never cut. */
  .mi-note {
    max-inline-size: 280px;
    margin: 0;
    padding: var(--sp-2) var(--sp-3);
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
    overflow-wrap: anywhere;
  }

  /* A DESTRUCTIVE VERB IS ITS WORDS IN INK: red is for what needs him, and a menu item never does. */

  @media (pointer: coarse) {
    .more-trigger {
      inline-size: var(--tap);
      block-size: var(--tap);
    }

    .mi {
      min-block-size: var(--tap);
    }
  }

  /* THE REVEALED VALUE: under its row, lined up with the name, on the tile's own white with a key cap's font. It wraps
     rather than scrolling and is never cut short. */
  .shown {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin: 0 var(--sp-3) var(--sp-3) calc(var(--well-l) + var(--sp-3) * 2);
    padding: var(--sp-3);
    background: var(--tile);
    border-radius: var(--r-pop);
  }

  .shown-value {
    color: var(--ink);
    font-family: var(--font-mono);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
    overflow-wrap: anywhere;
    user-select: all;
  }

  .shown-do {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: calc(6px * var(--dense, 1));
  }

  .shown-left {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
    font-variant-numeric: tabular-nums;
  }

  /* ── the request ──────────────────────────────────────────────────────── */

  .code-form {
    display: flex;
    flex-direction: column;
  }

  .code-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
  }

  /* SIX DIGITS WIDE, in the mono face a code is set in, spaced so each digit reads on its own. */
  .code-field {
    flex: 0 1 16ch;
  }

  .code-input {
    font-family: var(--font-mono);
    font-size: var(--fs-body);
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.18em;
  }

  .code-said {
    display: flex;
    align-items: baseline;
    gap: calc(6px * var(--dense, 1));
    min-block-size: 18px;
    margin: var(--sp-2) 0 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: calc(18px * var(--type, 1));
  }

  .code-said:empty {
    display: none;
  }

  .code-said[data-intent='good'] .code-glyph {
    color: var(--good);
  }

  .code-said[data-intent='bad'] .code-glyph {
    color: var(--red);
  }

  .row-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    margin-block-start: var(--sp-3);
  }

  /* ── the toolbar's add, and the list's ─────────────────────────────────── */

  .add-phone {
    display: none;
  }

  /* ── the sheets ───────────────────────────────────────────────────────── */

  .key-form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .key-form .field-label {
    margin-block-end: 0;
  }

  .field-hint {
    margin: 0 0 var(--sp-2);
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: calc(18px * var(--type, 1));
  }

  /* ONE COLUMN AT ANY WIDTH, the box then its words, which wrap rather than push the sheet sideways. The control is
     ink and not the accent. */
  .field-toggle {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: var(--tap);
    color: var(--ink);
    font-size: var(--fs-body);
    cursor: pointer;
  }

  .field-toggle input {
    flex: none;
    inline-size: 20px;
    block-size: 20px;
    margin: 0;
    accent-color: var(--ink);
  }

  .field-toggle span {
    min-inline-size: 0;
    overflow-wrap: anywhere;
  }

  /* ── a phone ──────────────────────────────────────────────────────────── */

  @media (width < 900px) {
    /* THE ADD MOVES TO THE TOOLBAR as a circle, and the list's own pill goes. */
    .add-phone {
      display: contents;
    }

    .add-phone :global(.btn) {
      inline-size: var(--ctl-h);
      padding: 0;
    }

    .add-desk {
      display: none;
    }
  }

  /**
   * UNDER 640PX A ROW IS TWO LINES BESIDE ITS WELL: the name, then what it is and its count, and the verbs at the end
   * across both. `rows.css` moves a list's main column onto a line of its own at this width, which is a card with an
   * id over it; these rows lead with a well instead, so every part is placed here.
   */
  @media (width < 640px) {
    .whos .line {
      grid-template-columns: var(--well-l) minmax(0, 1fr) auto;
      align-items: center;
      gap: 2px var(--sp-3);
    }

    .whos .line-mark {
      grid-column: 1;
      grid-row: 1 / span 2;
      align-self: start;
      padding-block-start: 2px;
    }

    .whos .line-main {
      grid-column: 2;
      grid-row: 1;
    }

    .whos :is(.key-count, .line-when) {
      grid-column: 2;
      grid-row: 2;
      flex-direction: row;
      flex-wrap: wrap;
      justify-content: flex-start;
      gap: 0 var(--sp-2);
      text-align: start;
    }

    .whos .line-verbs {
      grid-column: 3;
      grid-row: 1 / span 2;
    }

    .key-meta,
    .who-detail {
      flex-wrap: wrap;
      row-gap: 2px;
    }

    /* ON A PHONE A KEY'S ROW KEEPS ONLY ITS "⋯", which holds the same presses, so the name keeps its one line. */
    .key-do > :global(.btn) {
      display: none;
    }

    /* WHAT IT OPENS ON A LINE OF ITS OWN TOO, with no dot before it: wrapped, the dot ended the scope's line by itself
       ("All projects ·"). Where it applies, what it opens, its state: three lines, no separators. */
    .key-meta .key-opens {
      flex-basis: 100%;
      white-space: normal;
    }

    .key-meta .sep:has(+ .key-opens) {
      display: none;
    }

    /* THE STATE ON A LINE OF ITS OWN ON A PHONE, with no dot before it: wrapped, the dot began a line by itself. */
    .key-meta .sep:has(+ .state) {
      display: none;
    }

    .key-meta .state {
      flex-basis: 100%;
    }

    .shown {
      margin-inline: var(--sp-3);
    }

    .code-field {
      flex: 1 1 100%;
    }

    .code-row :global(.btn) {
      flex: 1 1 auto;
    }
  }

  /* ON A PHONE THE SENTENCE TAKES ITS OWN LINE (G24): "6 keys. 3 have no value yet." wrapped in a third of the row beside
     Keys | List | +; the views and the circle stand under it, at the row's end. */
  @media (width < 640px) {
    :global(.page-head .head-main:has(.add-phone)) {
      flex-wrap: wrap;
      row-gap: var(--sp-2);
    }

    :global(.page-head .head-main:has(.add-phone) > :first-child) {
      flex: 1 1 100%;
    }

    :global(.page-head .head-main:has(.add-phone) > .head-actions) {
      margin-inline-start: auto;
    }
  }
  .page[data-asking] > :global(*) {
    visibility: hidden;
    animation: asks-wait 0s linear 2.5s forwards;
  }
  @keyframes asks-wait {
    to {
      visibility: visible;
    }
  }
</style>
