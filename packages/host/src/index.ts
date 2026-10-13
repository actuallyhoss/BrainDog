/**
 * The bit both hosts share: the route table, the status mapping, and the loop that answers.
 *
 * TWO HOSTS EXIST — the Worker and the self-host — and they are the same product. `ADR-064` puts
 * their common half in one platform-neutral package for a reason that is not tidiness: a route that
 * exists in one and not the other is a product that behaves differently depending on where a
 * customer runs it, and nobody finds out until somebody exports a record from one and imports it
 * into the other.
 *
 * STANDARD `Request` AND `Response`, so this file runs in workerd and in Node without a shim. The
 * Worker adds the Durable Object and the self-host adds the filesystem; neither adds a route.
 *
 * THE ROUTE TABLE IS DATA. It is a list of names and what each one needs, so "what can this thing
 * do" is a value the MCP server, the CLI and the docs can all read rather than a switch three of
 * them have to stay in step with.
 */

import type { Conflict, Refusal, Result } from '@braindog/ports';
import { conflicted, refused } from '@braindog/ports';

import { crashed } from './crash.ts';
import { EXTRA_ROUTES } from './routes/index.ts';

export { HINTS, hintsOf, sessionOf, withSession, type SessionHints } from './session.ts';
export { serveVault, servesVault, VAULT_HEADERS, vaultReply, type VaultAsk, type VaultDoor, type VaultGrantSeen, type VaultTokenAsk } from './vault.ts';
export { keysReply, purposeOf, sealedUnderOf, serveKeys, servesKeys, type KeysAsk, type KeysDoor, type SealedUnder } from './keys.ts';
/* THE SHAPE DOOR (PRF-A13), for the vault door's reason: both hosts take the whole surface from this one module. */
export { SHAPE_HEADERS, serveShape, servesShape, type ShapeDoor } from './shape.ts';
/* `POST /api/slash/read` IS A DOOR AND NOT A ROW IN `ROUTES`, and `slash-ask.ts` carries the measurement: `ROUTES` is the
   record's surface, `tools/gates/guards.mjs` looks for every routed name as a method of `packages/record/src/index.ts`, and
   this answer comes out of the engine the HOST built. It is exported from here for the reason the vault, key, session and
   ingest doors are: both hosts import one module to get the whole surface, and a door one host can find and the other cannot
   is the drift this file's header is about. */
export { serveSlash, servesSlash, slashAskDoor, slashReply, type SlashAskDoor, type SlashAskEngine } from './slash-ask.ts';
/* `slashRecordMeter` IS HERE FOR THE SAME REASON, AND IT WAS ONCE MISSING FROM HERE. `d16d9d35` built the meter
   that holds the record's press and first plan in Slash's ledger and exported it from `slash-ask.ts` alone, which no
   app imports, so both hosts built the record without it and every press stayed unmetered.
   `apps/worker/test/slash-press-metered.test.ts` is the press on the Worker that shows it wired. */
export { slashRecordMeter, type SlashLedgerDeps, type SlashRecordMeter } from './slash-ask.ts';
/* THE ENGINE'S HEALTH, for the same reason: both hosts build the read and hand it to the record (ENG-A02). */
export { engineHealthRead, type EngineFacts, type EngineHealth, type EngineHealthDeps, type EngineHealthFns, type EngineHealthRead, type EngineSaid } from './engine-health.ts';
export { engineLedgerRead, mentionsAttached, type EngineLedger, type EngineLedgerCall, type EngineLedgerDeps } from './engine-ledger.ts';
/* `/in/*` IS NOT IN `ROUTES` AND BELONGS HERE ANYWAY. The table below is the record's methods, every one
   of them behind the auth gate at `/api/<name>`; an arrival is above that gate by design (`33 §4`), takes
   no principal, and answers 202 rather than a `Result`. It is exported from this file for the same reason
   the vault, key and session doors are: both hosts import one module to get the whole surface, and a door
   one host can find and the other cannot is exactly the drift this file's header is about. */
export { EMAIL_LIMIT, FILES_HEADER, messageHeaders, serveIngest, servesIngest, type IngestArrival, type IngestChannel, type IngestDoor, type IngestFile, type IngestPath, type IngestVerify } from './ingest.ts';
export { freshNonce, grantAad, grantKey, NONCE_BYTES, openSealed, recordAad, seal, type Bytes, type DerivedKey } from './sealing.ts';
/* `crashed` IS EXPORTED FOR THE OTHER TWO DOORS, the Worker's router and the self-host's outer catch.
   `serveApi` below is the first of three places a crash is answered, and three answers to one crash is the drift this
   file's header is about. */
export { crashed, type CrashLog, type Crashed } from './crash.ts';
/* A SHARED LINK'S DOOR IS NOT A ROW IN `ROUTES` EITHER, for the vault's reason: its credential is `Authorization: Share
   <token>`, which each host checks before any bearer is read, and it opens `sharedPage` and nothing else. Exported from
   here so both hosts sign and check a link with one function; the owner's methods for links are rows in
   `routes/shares.ts`. */
export {
  deriveShareKey,
  linkOpened,
  NO_SHARE_KEY,
  opensShare,
  readShareToken,
  serveShared,
  servesShared,
  SHARE_INFO,
  SHARE_TOKEN_MOST,
  sharedNone,
  shareOf,
  shareToken,
  withShareLinks,
  type ShareClaim,
  type ShareClosed,
  type ShareContext,
  type SharedDoor,
  type SharedLink,
  type ShareLink,
  type ShareOpened,
  type ShareRow,
  type ShareSigner,
} from './share.ts';
/* A RUNNER'S BEARER IS NOT A ROW IN `ROUTES` EITHER, and its methods are (`routes/agents.ts`): what is shared here
   is how a host turns the bearer into the runner's context, which both hosts ask where a bearer on `/api` is not a
   token's, and the wait a claim may be held for. Exported from here, for the vault's reason, so neither host can reach
   one without the other. */
export { CLAIM_ASKS_MOST, CLAIM_EVERY_MS, CLAIM_WAIT_MOST_MS, claimIdle, claimWaitMs, holdClaim, runnerContext } from './jobs.ts';
/* THE VAULT PASSPHRASE'S HOST HALF, for the vault's reason: both hosts derive the key from a passphrase and wrap the
   record key under it with one function, so a record exported from one opens on the other with the same passphrase.
   Its two methods are rows in `routes/vault-passphrase.ts`, answered through `withVaultPassphrase`. */
export {
  openUnderPassphrase,
  PASSPHRASE_ITERATIONS,
  PASSPHRASE_LEAST,
  PASSPHRASE_MOST,
  PASSPHRASE_SALT_BYTES,
  passphraseOf,
  unlockedKey,
  withVaultPassphrase,
  wrapUnderPassphrase,
  type PassphraseMethods,
  type PassphraseRewrap,
  type PassphraseUnlock,
  type RecordWrapping,
  type RootKeys,
  type VaultPassphrase,
  type WrappingChange,
} from './passphrase.ts';

/**
 * What one argument IS, so the text a stranger typed becomes the value the handler was written for.
 *
 * THREE, AND NOT A SCHEMA. `text` is taken verbatim, `integer` is a whole number or a refusal, and
 * `json` is a structure that had to be encoded to survive a query string at all. Everything a read
 * route takes today is one of the three, and the one thing this vocabulary must not become is a
 * validator: what a register is called, what a slug may contain and what a predicate may ask are
 * the record's own questions, answered by the record with its own sentences. This says only what
 * shape the value arrives in, which is the one question the record cannot answer, because by the
 * time it is asked the text has already been guessed at.
 */
export type ArgType = 'text' | 'integer' | 'json';

/**
 * The six groups `30 §5` splits the surface into, and it splits it by WHO MAY REACH IT rather than
 * by convenience — which is what makes ADR-018's "the web app is a client of the agent API"
 * enforceable rather than aspirational.
 *
 * `INTERNAL` IS HERE SO IT CAN BE REFUSED. It is the host's own surface and not routable from
 * outside; naming it in the type is what lets `router-groups` say "no route carries this" instead of
 * hoping nobody adds one.
 */
export const GROUPS = ['DATA', 'READ+', 'VAULT', 'JOBS', 'ADMIN', 'INTERNAL'] as const;
export type Group = (typeof GROUPS)[number];

/** One method the host exposes: its name, its group, and what it does to the record. */
export type Route = {
  /** The name a caller sends. `record.list`, and the dot is the group. */
  name: string;
  /**
   * Which of `30 §5`'s six.
   *
   * EVERY ROUTE DECLARES ONE, and `30 §5` asks for exactly this: "the router asserts it — every
   * route declares its group, and a CI test walks the router and fails on a route with no group".
   * The rule it keeps is the one that stops the surface drifting: *if a screen needs something
   * outside DATA and READ+, it is either a browser-session group — VAULT, JOBS, ADMIN — or it is a
   * design error.* There is no third case, and a group in the table is how a reviewer sees which
   * case a new method is claiming to be.
   */
  group: Group;
  /** Whether it changes anything. A read is safe to retry; a write is not. */
  writes: boolean;
  /**
   * A read sent as a write: it changes nothing, but its arguments are too large for an address, so it goes as a POST.
   * Only `previewPage` is one. The looks that cannot press hand it on, and nothing else reads this mark.
   */
  postRead?: true;
  /** One line, for the CLI's help and the MCP tool description. */
  what: string;
  /**
   * The arguments this route takes, and what each one is. Reads only: a write is a POST and a JSON
   * body already carries its own shapes.
   *
   * EVERY QUERY VALUE WAS JSON-DECODED AND HANDED ON UNCOERCED. `serveApi` tried `JSON.parse` on
   * each one and fell back to the raw text when the parse failed, so the caller chose the SHAPE of
   * every argument and not only its contents, and nothing between here and the SQL driver looked at
   * it again. Fuzzing the read routes with fourteen hostile shapes per argument produced fifty-two
   * GET requests answering 500 `INTERNAL`: `?seq={"a":1}` was "Provided value cannot be bound to
   * SQLite parameter 2", `?register={"length":1}` was "Unknown named parameter 'length'", and
   * `GET /api/search?q=x&limit=1.5`, which is a typo rather than an attack, was "datatype
   * mismatch". A refusal is a value, and a 500 answering a read is the failure this layer exists to
   * prevent.
   *
   * THE RULE WAS ALREADY WRITTEN DOWN AND LANDED ON TWO ROUTES OUT OF SIX.
   * `packages/record/src/index.ts` around line 744 says it in as many words, over `page`'s slug:
   * *"COERCED AT THE EDGE. These arrive from a query string a stranger wrote, and `.split` on an
   * absent one threw a TypeError out of the route."* `metric` had it too. `get`, `history`,
   * `search`, `governance`, `schema` and `list` did not, and a per-route coercion inside the record
   * is four more places to forget. So it is here, as data, in the same line that declares the
   * group: a route added tomorrow says what it takes where a reviewer is already looking.
   *
   * AND IT IS WHAT STOPS A STRING CHANGING TYPE ON THE WIRE. Guessing meant a string whose text is
   * valid JSON stopped being a string: a page really declared at the slug `2026` was listed by
   * `pages` and then answered `REQUIRED_MISSING`, "A page is asked for by its slug", to a caller
   * that had sent one. `text` is the answer to that, and it is the same answer for a browser
   * following the link as for the client.
   */
  takes?: Readonly<Record<string, ArgType>>;
};

/**
 * The rows written in this file. NOBODY ADDS ONE HERE ANY MORE: a new route is a row in `routes/<unit>.ts`, registered in
 * `routes/index.ts`, beside its record method in `packages/record/src/methods/<unit>.ts`. These stay where they are, because moving every one of them would be a diff every reader has to check for a
 * changed group and nothing would be gained by it.
 */
const CORE_ROUTES: readonly Route[] = [
  { name: 'boot', group: 'READ+', writes: false, what: 'What this record holds, and how many rows are in each register.' },
  { name: 'schema', group: 'READ+', writes: false, what: 'What one register holds: its fields, their types, and what each may take.',
    takes: { register: 'text' } },
  { name: 'get', group: 'DATA', writes: false, what: 'One row, by the number a person says out loud: tasks#3, or S1.',
    takes: { register: 'text', seq: 'integer', spoken: 'text', values: 'json' } },
  { name: 'list', group: 'DATA', writes: false, what: 'Rows of one register, narrowed by a predicate, newest first.',
    /* `cursor` IS `text` AND NOT `json`, and it is the one argument where that matters. A keyset
       cursor is `<when>|<id>`, which is not valid JSON, so it survived the guessing by accident;
       reading it as the text the record minted is the same answer on purpose.

       `includeDeleted` IS `json` SO A GET CAN ASK FOR DELETED ROWS AT ALL. The kernel reads it as `=== true`, and
       undeclared it arrived as the four letters "true": measured at afb3b1b2, `GET /api/list?includeDeleted=true`
       answered the live rows alone, 200, nothing said, while the same read as a POST answered the deleted ones too.
       The CLI's import sent that POST by hand for want of this line. Decoded, `true` is `true`; a value that is not
       true or false is the record's to refuse (`record.list`), because read as false it is the same silent answer. */
    takes: { register: 'text', where: 'json', limit: 'integer', cursor: 'text', order: 'json', includeDeleted: 'json' } },
  /* ONE READ FOR EVERY PILL OF A FIELD: the list screen asked `list` once a value, a dozen requests before it settled. */
  { name: 'countBy', group: 'DATA', writes: false, what: 'How many entries of one list hold each value of one field.',
    takes: { register: 'text', by: 'text', where: 'json' } },
  { name: 'history', group: 'READ+', writes: false, what: 'The writes that made one row, in order, each with who and when.',
    takes: { register: 'text', seq: 'integer' } },
  { name: 'backlinks', group: 'READ+', writes: false, what: 'What points at one row: the rows of other lists whose reference fields name it, a page at a time.',
    takes: { register: 'text', seq: 'integer', limit: 'integer', cursor: 'text' } },
  /* `cursor` IS NOT DECLARED ON THESE TWO, SO IT ARRIVES AS THE TEXT IT WAS SENT on a GET and as itself in a POST. It
     was `integer`, and a member held to named lists is now handed `e.<event id>` rather than the event's rowid
     (the rowid between two of her lines counted the events she was not shown), so
     the host refused her own cursor with a 422 before the record could read it. `text` would refuse the owner's rowid
     in a POST body, which is a number there. The record checks both spellings and says what it wanted. */
  { name: 'whatsNew', group: 'READ+', writes: false, what: 'What changed since you last read, newest first, held to what you may see.',
    takes: {} },
  { name: 'recentHistory', group: 'READ+', writes: false, what: 'Every change to this record, newest first, a page at a time, held to what you may see.',
    takes: { limit: 'integer' } },
  /* `state` IS DECLARED BECAUSE THE RECORD TAKES IT. It was missing, so the table told a reader the inbox answered only
     what waits on a person, when `?state=skipped` and `?state=all` already reached the record as undeclared text.
     `repeats` IS JSON, as `includeDeleted` on list is: undeclared, `?repeats=true` reached the record as the text "true",
     which it refuses, so the Inbox's "Held as repeats" read always came back empty. */
  { name: 'inbox', group: 'READ+', writes: false, what: 'What arrived and no rule filed, newest first, a page at a time, in one state or all of them, with a count for each. An owner reads it, and so does a token for the whole record that its owner gave the inbox reach. No other token does.',
    takes: { state: 'text', cursor: 'integer', limit: 'integer', repeats: 'json' } },
  { name: 'search', group: 'DATA', writes: false, what: 'Rows whose text matches, across every register you can see, best first.',
    takes: { q: 'text', limit: 'integer' } },
  { name: 'version', group: 'READ+', writes: false, what: "The record's version, to tell whether anything you may see has changed. An owner who reads every list gets the newest event's rowid and may ask what changed since; anybody else gets a number that is only equal or not, never larger or smaller." },
  { name: 'whoami', group: 'READ+', writes: false, what: 'Who you are to this record, and which verbs you reach.' },
  { name: 'sessionsLive', group: 'READ+', writes: false, what: 'The runs that are live now, with how long since each was heard from.' },
  { name: 'context', group: 'READ+', writes: false, what: 'Where an agent stands: its run, its project, the last handoff, who is live, what waits, and what applies here.' },
  { name: 'digestToday', group: 'READ+', writes: false, what: 'What the digest would say if it went now. It sends nothing.',
    takes: { digest: 'text' } },
  { name: 'pages', group: 'READ+', writes: false, what: 'Every page this record can draw, templates expanded.' },
  /* THE PAGES CENSUS AND THE PATHS CHECK (PGS-A01, REC-A12): two reads beside `pages`, writing nothing. `checkPaths` takes a
     whole document, so a caller sends it as a POST body; a read may arrive either way. `register` is the list the document
     is written into, whose fields a page made for its rows fills. */
  { name: 'pagesCensus', group: 'READ+', writes: false, what: 'Each page you can open, counted: what it holds, what it could not show you, each placeholder that names nothing and each dash where a value goes. It changes nothing.',
    takes: {} },
  { name: 'checkPaths', group: 'READ+', writes: false, what: 'Each placeholder a document holds, and whether your record has anything by that name. It changes nothing.',
    takes: { document: 'text', register: 'text' } },
  /* `filter` IS THE READER'S OWN CHOICE over the page's declared filters, a field to the value chosen, so it is JSON: on a
     GET it is `?filter={"project":"bake"}`. What it may name is the record's question (`kernel.page`), not this table's.
     `walk` IS HOW FAR A FORECAST LOOKS when the reader asks past the two years walked unasked: `?walk=1825` or
     `?walk=last`. It is text because one answer is a word; the record turns a digit string into days. */
  { name: 'page', group: 'READ+', writes: false, what: 'One page, with every block run: rows and figures, never markup. A filter narrows it to what you chose.',
    takes: { slug: 'text', filter: 'json', walk: 'text' } },
  { name: 'metric', group: 'READ+', writes: false, what: 'One figure, with its target and how it compares.',
    takes: { metric: 'text' } },
  /* EVERY FIGURE, AND NOT ONLY A DRAWN ONE. `metric` reads an id already known and `page`
     names the figures its blocks draw, which on money-core as it ships was 18 of 36; nothing routed listed the rest, so
     neither could MCP's `record_index`. It takes nothing and evaluates nothing. */
  { name: 'figures', group: 'READ+', writes: false, what: 'Every figure you may read: its id, its name, how it is written, its list, its pack and whether it takes a parameter. Never a reading.' },
  { name: 'listGrants', group: 'VAULT', writes: false, what: 'What each credential opens. Never the credential.' },
  { name: 'revokeGrant', group: 'VAULT', writes: true, what: 'Take a credential out of service. The bytes go; the row stays, because what it opened is a fact.' },
  { name: 'dryRun', group: 'READ+', writes: false, what: 'What a rule would do, before anybody turns it on. It writes nothing.',
    takes: { rule: 'json', limit: 'integer' } },
  /* A DRAFT SCRIPT, RUN NOW (`script-try.ts`). READ+ AND NOT ADMIN, because `admin` refuses every token and the caller
     this exists for is an agent trying a script before it proposes one,
     at `propose`'s rung, as `dryRun` is READ+ for a rule. What READ+ would otherwise let through is held elsewhere: a
     token's trial opens no key, its reads are the caller's own and never `system`'s, and the allowance is asked first.
     `writes: true` ALTHOUGH IT WRITES NOTHING TO THE RECORD, because the flag is what makes a route a POST and a trial
     is not safe to repeat: it spends a run of the plan and may send a POST of its own to a provider. As a GET it would
     also carry the whole source in a query string, and a prefetched link could run it. */
  { name: 'scriptTry', group: 'READ+', writes: true, what: 'Run a draft script now and answer the writes it would make, its log and any refusal. It writes nothing, and it is counted as a run.' },
  /* A PROPOSED PAGE, DRAWN BEFORE ANYBODY ACCEPTS IT. READ+ beside `page`, since it draws what
     `page` draws and holds each block to the caller the same way. `writes: true` ALTHOUGH IT WRITES NOTHING, for one of
     `scriptTry`'s reasons: a page body of up to twenty blocks is no query string. It also kept a caller-written body
     that walks a list off the Cloud's public demo, which answered any GET to anybody; that door is gone,
     and the flag stays for the first reason. */
  { name: 'previewPage', group: 'READ+', writes: true, postRead: true, what: 'Draw a page body nobody has installed, as page would draw it, each block held to what you may read. It installs nothing and writes nothing.' },
  { name: 'governance', group: 'READ+', writes: false, what: 'What has been proposed, what was decided, and what was predicted.',
    takes: { register: 'text', id: 'text', status: 'text', limit: 'integer', cursor: 'text' } },
  { name: 'propose', group: 'DATA', writes: true, what: 'Put a question in front of a person. It changes nothing by itself.' },
  { name: 'decide', group: 'DATA', writes: true, what: 'Answer one, with the reason. No token reaches this.' },
  { name: 'packs', group: 'READ+', writes: false, what: 'Which packs this record has, and at what version.' },
  { name: 'packConfig', group: 'READ+', writes: false, what: "One pack's settings, and the value each holds now.",
    takes: { id: 'text' } },
  { name: 'arrangement', group: 'READ+', writes: false, what: 'How this BrainDog is arranged and what may be proposed about it: packs, the catalogue, voice and pages; one page declaration; or a grammar.',
    takes: { page: 'text', grammar: 'text' } },
  { name: 'pageVersions', group: 'READ+', writes: false, what: "One page's versions, newest first, each with its source, when it was applied and by whom.",
    takes: { page: 'text' } },
  { name: 'exportUseCase', group: 'READ+', writes: false, what: "This BrainDog's arrangement as a use-case file: modules, its own lists and pages, voice and labels, and only the example rows named.",
    takes: { usecase: 'text', title: 'text', summary: 'text', version: 'text', audience: 'text', author: 'text', examples: 'json', step: 'text', nav: 'json', signals: 'json', skills: 'json' } },
  { name: 'actions', group: 'READ+', writes: false, what: "Every scheduled action: what it calls, how often, whether it is paused and why, and this month's runs." },
  /* THE AUTOMATIONS, READ BY THE CANVAS AND BY AN AGENT THROUGH ONE METHOD. With
     no `rule` it is the list; with one it is that automation with its last ten runs, each step's outcome beside it, and
     `before` and `limit` page that rule's older runs (the method widened, not a new row). */
  { name: 'automations', group: 'READ+', writes: false, what: 'Every automation: what starts it, when it runs next and how its runs went; or one, with its last ten runs step by step, and older runs a page at a time.',
    takes: { rule: 'text', before: 'text', limit: 'integer' } },
  /* THE SCRIPTS, WHICH NOTHING LISTED. `resumeScript` was routed and no read named what it could resume: `actions` stops at
     `pull`, `call` and `poll`. Held by the record to the lists each script reads and writes. */
  { name: 'scripts', group: 'READ+', writes: false, what: 'Every installed script: what it may read, write and fetch, whether it is paused, its last run and its refused runs in a row.' },
  { name: 'planPack', group: 'ADMIN', writes: false, what: 'What installing a pack would do to this record. It writes nothing.',
    takes: { doc: 'json', source: 'json' } },
  { name: 'slash', group: 'ADMIN', writes: false, what: 'What Slash noticed about how this BrainDog is used, and the arrangement proposals it would file. It writes nothing.' },
  { name: 'slashPropose', group: 'ADMIN', writes: true, what: "Put Slash's proposals on Decide, through propose's checks. Given asked, a description of what to build, and page, the page it is about, it files what slashDraft would answer for it instead. It changes nothing until the owner accepts one.",
    takes: { asked: 'text', page: 'text' } },
  { name: 'slashDaily', group: 'ADMIN', writes: true, what: 'Whether Slash looks once a day on its own and puts what it finds on Decide. On unless the owner turns it off.' },
  { name: 'slashForm', group: 'ADMIN', writes: true, what: "Ask Slash's model for a first plan from what the owner said a project is, and put it on Decide as rows. Nothing is made until the owner accepts it.",
    takes: { usecase: 'text', said: 'text' } },
  { name: 'planUseCase', group: 'ADMIN', writes: false, what: 'What installing a shared use-case file would do, pack by pack. It writes nothing.',
    takes: { doc: 'json', text: 'text', source: 'json', modules: 'json' } },
  { name: 'fetchShared', group: 'ADMIN', writes: false, what: 'The text of a shared use-case or add-on file at an https address or git:owner/repo@ref:path, read by the host with no credentials. It writes nothing.',
    takes: { url: 'text' } },
  { name: 'fetchUseCase', group: 'ADMIN', writes: false, what: 'The text of a shared use-case file at an https address, read by the host with no credentials. It writes nothing.',
    takes: { url: 'text' } },
  /* THE WHOLE FIRST RUN AS ONE CALL (USE-B04). The browser ran it as a script of a dozen calls, so a closed tab left a
     record part made. ADMIN as `installPack` is: it installs add-ons, and only the owner in a browser may. */
  { name: 'setup', group: 'ADMIN', writes: true, what: 'Make this record from what its owner accepted, in one call: the add-ons in order, then their name, their words, the settings and what they asked to start with. It answers what was done and what was not, and asked with again it writes only what is missing.' },
  { name: 'installPack', group: 'ADMIN', writes: true, what: 'Apply the plan somebody approved, with the calls-out lines it asks for. A browser session only.' },
  { name: 'uninstallPack', group: 'ADMIN', writes: true, what: 'Take one back out. Its declarations go; its rows stay.' },
  { name: 'disablePack', group: 'ADMIN', writes: true, what: 'Turn a pack off. It stays listed, its rows stay, and what leans on it is named first.' },
  { name: 'enablePack', group: 'ADMIN', writes: true, what: 'Turn a pack back on, over the rows it kept.' },
  { name: 'resumeAction', group: 'ADMIN', writes: true, what: 'Start a paused scheduled action again, now. A refused key pauses one, and nothing else restarts it.' },
  { name: 'resumeScript', group: 'ADMIN', writes: true, what: 'Start a script paused by three refused runs in a row again, now. Nothing else restarts it, and three more refused runs pause it again.' },
  /* A BROWSER SESSION ONLY, as `installPack` is: a run writes rows as the rule and notifies, so pressing Run now is a
     person's decision, and an agent's way to one is `propose`. */
  { name: 'automationRun', group: 'ADMIN', writes: true, what: 'Run an automation now, one that declares a Run now button. A browser session only.' },
  { name: 'cancelRun', group: 'ADMIN', writes: true, what: 'Stop a run that has not finished. A run stopped while it waits never resumes.' },
  { name: 'fileArrival', group: 'ADMIN', writes: true, what: 'File one arrival from the inbox as a row in a list. The row is written like any other, and the arrival leaves the inbox.' },
  { name: 'archiveArrival', group: 'ADMIN', writes: true, what: 'Take one arrival out of the inbox without filing it. Its bytes are kept, and asking twice is the same answer.' },
  { name: 'setPackConfig', group: 'ADMIN', writes: true, what: "Change a pack's settings. They are read the next time the pack is planned and installed." },
  { name: 'setDeclaration', group: 'ADMIN', writes: true, what: 'Set one declaration from the app, through the same lint a pack gets.' },
  { name: 'retireDeclaration', group: 'ADMIN', writes: true, what: 'Retire one. Its rows stay; a declaration is a shape.' },
  /* SLASH'S LOOK OVER A PAGE, ANSWERED BY THE PERSON WHO SAW IT LAND (DIRECTION §37's Undo). ADMIN for
     `setDeclaration`'s reason: a look is a declaration, and what it puts back or keeps is the page everybody opens. */
  { name: 'undoLook', group: 'ADMIN', writes: true, what: 'Put a page back the way it was before Slash arranged it. Only while that arrangement is still the one Slash wrote.' },
  { name: 'keepLook', group: 'ADMIN', writes: true, what: 'Keep how Slash arranged a page once its Undo has passed, so the page says who kept it. The arrangement itself is not changed.' },
  /* UNDO ON THE SERVER (DIRECTION §37's trust ladder): one batch of changes or one decision, and every change one run
     made. ADMIN for `restore`'s reason, a person in a browser: what is put back is the record everybody reads, and no
     token reaches either, so an agent cannot quietly take back what a person saw. `dry` answers the plan in names and
     the hash that applying it needs, so what is put back is the plan the person read and nothing that moved since. */
  { name: 'undo', group: 'ADMIN', writes: true, what: 'Put back one set of changes, or what one decision did. Ask with dry first to read what would go back; a change somebody has made since is left alone.' },
  { name: 'undoRun', group: 'ADMIN', writes: true, what: 'Put back every change one agent run made. Ask with dry first to read what would go back; a change somebody has made since is left alone.' },
  { name: 'ruleApply', group: 'ADMIN', writes: true, what: 'Run one rule over the entries already there, as one batch one Undo takes back. `dry` first, to see what it would change.' },
  { name: 'examples', group: 'ADMIN', writes: false, what: 'The example rows setting up planted that nobody has touched, counted by list. It writes nothing.' },
  { name: 'clearExamples', group: 'ADMIN', writes: true, what: 'Delete every example row nobody has touched. A row somebody edited, or one a row of theirs points at, stays.' },
  { name: 'members', group: 'ADMIN', writes: false, what: 'Who is on this record, at what level, and where.' },
  { name: 'invite', group: 'ADMIN', writes: true, what: 'Put somebody on, or move them. A level per register. An address alone mints a single-use link, sent by nobody.' },
  { name: 'invitations', group: 'ADMIN', writes: false, what: 'Every invitation nobody has used or withdrawn, the ones that ran out marked expired. Never a link.' },
  { name: 'revokeInvite', group: 'ADMIN', writes: true, what: 'Withdraw an invitation. Its link stops working at once.' },
  { name: 'removeMember', group: 'ADMIN', writes: true, what: 'Take somebody off. Never the last owner.' },
  { name: 'listTokens', group: 'ADMIN', writes: false, what: 'Every agent token, with when it was last used. Never the token.' },
  { name: 'createToken', group: 'ADMIN', writes: true, what: 'Mint one. The secret is in the answer and is stored nowhere.' },
  { name: 'revokeToken', group: 'ADMIN', writes: true, what: 'Revoke one. The second call says the same as the first.' },
  { name: 'createReportKey', group: 'ADMIN', writes: true, what: 'Mint a report key: a token that sends rows to one list, with the fields it always carries, and reaches nothing else. The secret is in the answer only.' },
  { name: 'reportKeys', group: 'ADMIN', writes: false, what: 'Every report key, with the list it sends rows to and the fields it fixes. Never the key.' },
  { name: 'deviceApprove', group: 'ADMIN', writes: true, what: 'Let in the device showing these six digits. A sign-in in the last fifteen minutes.' },
  { name: 'listDevices', group: 'ADMIN', writes: false, what: 'Every device grant by its handle, with when it was last heard from. Never the id it polls with.' },
  { name: 'revokeDevice', group: 'ADMIN', writes: true, what: 'Revoke one device by its handle. A login grant takes its token with it.' },
  /* THE SHORTCUT'S DOOR, AND AN OWNER'S IN A BROWSER for `deviceApprove`'s reason: whoever holds the token can put a
     bank line of their choosing into the ledger at `exact`. Unrouted, the mint was reachable from a test and from
     nothing a person could open: `packages/host/test/ingest-shortcut.test.ts` (8) answered 404 `ROUTE_UNKNOWN`. */
  { name: 'ingestMint', group: 'ADMIN', writes: true, what: "Make the token a webhook ingest's address carries, and answer that address. It is shown once, only its digest is kept, and minting again replaces it." },
  /* THE DOORS THIS RECORD DECLARES, so the screen that mints their tokens learns them from the record and names none of
     its own. An owner's, for the mint's reason; the digest is never in it. */
  { name: 'doors', group: 'ADMIN', writes: false, what: 'Every webhook door this record declares: what it is, how it is verified, whether a token is held for it and the list it writes. Never the token.' },
  /* `writes: true` BECAUSE IT WRITES. An export appends an `export` event — 12 §6's rule that a
     vault whose reads are not audited cannot say whether anything got out — and a GET that mutates
     the record is a GET a proxy may replay and a browser may prefetch. */
  { name: 'export', group: 'ADMIN', writes: true, what: 'The record as a file: line per row, and it imports back.' },
  /* `replace` IS A RESTORE AND NOT A MERGE: the file must be this record's own copy, and it replaces every row that travels.
     Anything else into a record that holds rows is still refused `IMPORT_NOT_EMPTY` (`packages/kernel/src/index.ts`, `import`). */
  { name: 'import', group: 'ADMIN', writes: true, what: 'A file into an EMPTY record, or with replace, the record put back from its own copy, what it was kept first where this host keeps copies. Anything else is a merge nobody asked for.' },
  { name: 'snapshot', group: 'ADMIN', writes: true, what: 'A copy of the whole record, now, kept by this host. A host that keeps none says so.' },
  { name: 'snapshots', group: 'ADMIN', writes: false, what: 'The copies this host keeps, newest first, each with when it was taken and its size.' },
  { name: 'restore', group: 'ADMIN', writes: true, what: 'Put the record back to one kept copy. What it was is kept as a copy first.' },
  { name: 'erase', group: 'ADMIN', writes: true, what: 'Erase a person: every value naming them, in one transaction, and one event that names them only as a hash.' },
  { name: 'deleteRecord', group: 'ADMIN', writes: true, what: 'Delete this record, with its name typed to confirm. There is no undo.' },
  { name: 'markRead', group: 'DATA', writes: true, what: 'How far you have read, named as an event. A person only, and never an event of its own.' },
  { name: 'setPref', group: 'DATA', writes: true, what: 'One of your own settings: the rail order, the pages hidden from it, the navigation shape, whether new pages are suggested, or what you dismissed. A person only, and not an event.' },
  /* A PHONE ASKING TO BE TOLD, AND TELLING IT TO STOP. READ+ because they are verbs over no row, as `boot`
     and `whoami` are; POSTs because each keeps or removes a `push_sub` row. Only a person's own, and never an event. */
  { name: 'subscribePush', group: 'READ+', writes: true, what: 'This browser asks to be told when something needs you. A person only, their own, and not an event.' },
  { name: 'unsubscribePush', group: 'READ+', writes: true, what: 'This browser stops being told. Only your own subscription is taken away.' },
  { name: 'log', group: 'DATA', writes: true, what: 'A note against a row. It changes nothing and is still a write.' },
  { name: 'create', group: 'DATA', writes: true, what: 'Add a row. The record allocates its number.' },
  { name: 'report', group: 'DATA', writes: true, what: 'Rows a project sends with its report key, one or up to a hundred, into the list the key is bound to. A report key reaches this and nothing else.' },
  { name: 'update', group: 'DATA', writes: true, what: 'Change a row, against the version you read.' },
  { name: 'attach', group: 'DATA', writes: true, what: 'Say which run this agent is and where it stands. A token only: a person is never a run.' },
  { name: 'handoff', group: 'DATA', writes: true, what: "Keep a run's handoff true: the next step, what was tried, a note, its state." },
  { name: 'meet', group: 'DATA', writes: true, what: 'Someone or some organisation met in the work: matched by a key (email, handle, domain), or added; a name alone is only noted.' },
  /* THE SAVED VIEWS. Reading one is READ+ and held to the list it belongs to, because a view names
     that list's fields and the values somebody filtered on; saving and retiring one change what the
     list offers everybody who opens it, which is the ADMIN argument `setDeclaration` already makes. */
  { name: 'views', group: 'READ+', writes: false, what: 'The saved ways of looking at one list, or at every list you can read.',
    takes: { register: 'text' } },
  { name: 'view', group: 'READ+', writes: false, what: 'One saved view: its filter, what it searched for, its order and its columns.',
    takes: { register: 'text', id: 'text' } },
  { name: 'saveView', group: 'ADMIN', writes: true, what: 'Save the way this list is being looked at, under a name. Saving over one replaces it.' },
  { name: 'retireView', group: 'ADMIN', writes: true, what: 'Take a saved view off a list. Its rows are untouched: a view is a question, not a row.' },
];

/** Every route: the rows above, then the ones under `routes/` (`routes/index.ts`). */
export const ROUTES: readonly Route[] = [...CORE_ROUTES, ...EXTRA_ROUTES];

/**
 * The two vault methods that CARRY sealed material are DELIBERATELY NOT HERE.
 *
 * BOTH HOSTS CAN NOW PROVE A SESSION. `withSession` puts `provedAt` on the context from the session
 * row and from nowhere else, so the record's vault gate refuses every bearer `NEEDS_BROWSER_SESSION`
 * and sends a session older than fifteen minutes back to sign in (`12 §6` rules 2 and 3). That is why
 * `listGrants` and `revokeGrant` are routed: neither carries a byte of a credential in either
 * direction, and `revokeGrant` takes an id and destroys bytes.
 *
 * `openGrant` AND `bindGrant` STILL ARE NOT, and a session is not what they are waiting for. They are
 * the two ends of the sealed shape: `openGrant` answers sealed material a browser cannot open, and
 * `bindGrant` takes sealed material a browser cannot make, because the key store is the host's and the
 * record never sees a plaintext credential (ADR-062). What a screen needs is a host step that seals and
 * opens for a session, and since 2026-09-16 there is one: `/api/keys/put` and `/api/keys/open`, in
 * `keys.ts`, which take a browser session, no bearer of any kind, and an `Origin` this host answers for.
 *
 * THAT IS A SECOND DOOR AND NOT A LOOSENING OF THE FIRST. `/api/vault/deposit` and `/api/vault/open`
 * still take a vault grant's bearer and still refuse any request carrying an `Origin`, which every page
 * sends (`12 §6` rule 9). The two doors share the host's key step and no credential at all, so neither
 * one is a way round the other.
 */
export const UNROUTED = [
  'openGrant',
  'bindGrant',
  'createRecord',
  'deviceStart',
  'devicePoll',
  /* Whoever calls it with a person puts that person on the record. `/auth/invite` calls it, after a sign-in. */
  'acceptInvite',
  'vaultGrant',
  /* The key doors' record half: `vault.ts` calls them after `vaultGrant`, with sealed bytes only. */
  'depositGrant',
  'openForGrant',
  /* The shape door's record half (PRF-A13): host shape.ts hands it the bearer, and it reads the grant before a row. */
  'shapeGrant',
  'shapeExport',
  /* `operationGrant`, `signingKey` AND `restored` ARE INTERNAL TOO AND ARE NOT LISTED YET. `router-groups.mjs`
     refuses a name here that `30 §5`'s INTERNAL row does not carry, and that row has not been amended for them. None of
     the three is in `ROUTES`, and `packages/record/test/file-doors.test.ts` fails if one is added. */
] as const;

const BY_NAME = new Map(ROUTES.map((r) => [r.name, r]));

/* A NAME ROUTED TWICE IS ONE ROW HIDING ANOTHER. `BY_NAME` keeps the later row, so with the table in two places now a row
   under `routes/` reusing a name here would publish one group and verb and serve another. Thrown at load, as the
   `UNROUTED` check below is, so neither host starts with it. */
if (BY_NAME.size !== ROUTES.length) {
  const twice = ROUTES.find((r, i) => ROUTES.findIndex((s) => s.name === r.name) !== i)?.name;
  throw new TypeError(`${twice} is in ROUTES twice. Each method is routed once, in this file or under routes/.`);
}

/**
 * The list above is a promise, and this is the thing that keeps it.
 *
 * `UNROUTED` WAS READ BY NOTHING — declared, documented, and enforced by no line in the repository.
 * Adding `openGrant` to `ROUTES` and to the handler map would have passed both of the assertions
 * `handlersFor` makes, and started returning sealed bytes over HTTP to anything holding a token.
 * The comment above it argues exactly why that must not happen; this is the argument in code.
 */
for (const name of UNROUTED)
  if (BY_NAME.has(name))
    throw new TypeError(`${name} is in UNROUTED and in ROUTES. One of the two is wrong, and it is not the vault.`);

/**
 * The answer's HTTP status, from its SHAPE.
 *
 * `422` FOR ANY REFUSAL AND `409` FOR A CONFLICT, and the distinction is structural rather than a
 * lookup by code (30 §6). This was a table of forty codes, and a table has two failure modes a
 * shape does not: a code nobody remembered to add came back as a 500 — an ordinary "you typed the
 * wrong enum value" arriving as "the server is broken" — and a code somebody guessed at got a 409,
 * which tells a client to re-read a row that never moved and retry a write that will be refused
 * again forever.
 *
 * SO ONLY THE EXCEPTIONS ARE ENUMERATED, and each is a different INSTRUCTION to the caller: 401 says
 * the credential is wrong, 403 says it is the wrong kind and retrying will never work, 503 says the
 * build and the schema disagree and a deploy fixes it, 409 says somebody else got there first and a
 * re-read will. Everything else is a value the caller can fix, which is a 422.
 */
const NOT_422: Readonly<Record<string, number>> = {
  UNAUTHORIZED: 401,
  /* A CREDENTIAL PAST ITS BUDGET FOR NOW. Not 422, because nothing about the request is wrong: the same call succeeds
     after `retry_after` seconds, which `serveApi` also sends as `Retry-After`. */
  RATE_LIMITED: 429,
  FORBIDDEN: 403,
  /* A BROWSER SESSION IS NOT A SCOPE PROBLEM. 403 with the envelope, because the sentence is the
     part that tells somebody what to do about it — 30 §6's own row. */
  NEEDS_BROWSER_SESSION: 403,
  /* THE REFINEMENTS OF `FORBIDDEN`, AND THERE WERE THREE. 30 §6 has one code for "a credential
     outside its scope, level or ceiling", and this file answered with which of the three it was,
     because "get a bigger token" and "this belongs to a person and a token is not one" are different
     instructions and a caller that cannot tell them apart retries the one that can never work. They
     are a strict refinement, so they take `FORBIDDEN`'s status.

     THE INSTRUCTION IS RIGHT AND THE REMEDY WAS WRONG, and `PERSON_REQUIRED` has gone because of it.
     `30 §6`'s `FORBIDDEN` row already carries three separate facts — a `slash` principal writing a
     row, a runner posting out of `seq` order, the scope case — each told apart by its SENTENCE. A
     code is what a caller branches on; "ask a person to sign in" is what it acts on, and minting a
     code per remedy grows the vocabulary at the speed of the copywriting (`10 §7`).
     `LEVEL_REQUIRED` is in the registry and stays. `SCOPE_INSUFFICIENT` was the last invention of
     the three and has followed `PERSON_REQUIRED`: `record`'s `allows` answers a token whose scope is
     short with `FORBIDDEN` and the remedy in the sentence, so its row here went with it rather than
     staying on as a status for a code nothing emits. */
  LEVEL_REQUIRED: 403,
  SCHEMA_MISMATCH: 503,
  SCHEMA_NEWER: 503,
  /* A RECORD NOBODY MAY ACT ON IS NOT A REFUSAL OF THE CALLER'S INPUT. Every owner suspended is the
     record's problem, at 503, and it answered 422 for as long as its code was outside the registry
     and therefore outside this table — `49 §5.1` step 5.3, and the self-host's `NOBODY`. */
  RECORD_UNAVAILABLE: 503,
  /* The router's own four, which no method returns — `30 §6`'s host and client family, except
     `INTERNAL`, which is a crash rather than a refusal and is discussed at the catch below. */
  ROUTE_UNKNOWN: 404,
  BODY_MALFORMED: 400,
  /* 501 FOR "PUBLISHED, NOT BUILT". A metric declaring `median`, a block naming a computed source,
     an `infer.prose` job on a host that wired no sender: the declaration is right and this build is
     behind, which is what 501 means and what 422 would deny. It was `UNIMPLEMENTED`, a code in no
     registry; `30 §6` now has `NOT_IN_THIS_BUILD` beside `FORMAT_NEWER_THAN_READER`, which is the
     same sentence about a version number. */
  NOT_IN_THIS_BUILD: 501,
  INTERNAL: 500,
};

/**
 * One code's exception, or 422 because there is not one.
 *
 * `Object.hasOwn`, BECAUSE `Refusal.code` IS A `string`. This read `NOT_422[code]` off a bare
 * object literal, so a refusal whose code was an inherited name returned a FUNCTION where a number
 * is declared, and `?? 422` never fired because a function is not nullish: `constructor` gave
 * `Object`, `toString` gave `Object.prototype.toString`. `serveApi` then handed that to `new
 * Response` and got a `RangeError`, thrown from the line after the try whose own comment promises
 * nothing throws across this boundary. Nothing lets a caller choose a code today, so it was latent
 * rather than live, and `packages/record/src/index.ts:358` had already made exactly this repair one
 * layer in for exactly this reason: *"`Object.hasOwn`, BECAUSE THE KEY COMES FROM THE CALLER."*
 * The field is typed `string` until `packages/ports`'s refusal-code budget reaches zero, so this
 * stays true for as long as that does.
 */
const exception = (code: string): number => (Object.hasOwn(NOT_422, code) ? (NOT_422[code] ?? 422) : 422);

export const httpStatus = (r: Result<unknown>): number =>
  r.ok ? 200 : conflicted(r) ? 409 : refused(r) ? exception(r.refusal.code) : 500;

export type Handler = (args: Record<string, unknown>, ctx: unknown) => Promise<Result<unknown>>;

/**
 * The handlers, built once from the record's surface.
 *
 * THE WIRING IS SHARED, not just the table. A test could assert that two hosts wire the same routes;
 * this makes it impossible for them not to — the Worker and the self-host both call this, so a route
 * cannot exist in one and not the other, and "the product behaves differently depending on where you
 * run it" stops being a thing anybody has to remember.
 *
 * It takes the surface structurally rather than importing `@braindog/record`, so `host` stays under
 * `record` in the package graph (`31-STACK` §2) and the acyclicity argument still holds.
 */
export type RecordSurface = {
  boot(ctx: never): Promise<Result<unknown>>;
  version(ctx: never): Promise<Result<unknown>>;
  schema(args: never, ctx: never): Promise<Result<unknown>>;
  get(args: never, ctx: never): Promise<Result<unknown>>;
  list(args: never, ctx: never): Promise<Result<unknown>>;
  /** OPTIONAL as `scriptTry` is: a host built over a record without the method answers `NOT_IN_THIS_BUILD`. */
  countBy?(args: never, ctx: never): Promise<Result<unknown>>;
  history(args: never, ctx: never): Promise<Result<unknown>>;
  backlinks(args: never, ctx: never): Promise<Result<unknown>>;
  whatsNew(args: never, ctx: never): Promise<Result<unknown>>;
  recentHistory(args: never, ctx: never): Promise<Result<unknown>>;
  inbox(args: never, ctx: never): Promise<Result<unknown>>;
  search(args: never, ctx: never): Promise<Result<unknown>>;
  pages(ctx: never): Promise<Result<unknown>>;
  /** OPTIONAL as `scriptTry` is, for the same reason: the routes land before the record registers the methods. */
  pagesCensus?(args: never, ctx: never): Promise<Result<unknown>>;
  checkPaths?(args: never, ctx: never): Promise<Result<unknown>>;
  page(args: never, ctx: never): Promise<Result<unknown>>;
  metric(args: never, ctx: never): Promise<Result<unknown>>;
  figures(ctx: never): Promise<Result<unknown>>;
  listGrants(ctx: never): Promise<Result<unknown>>;
  revokeGrant(args: never, ctx: never): Promise<Result<unknown>>;
  dryRun(args: never, ctx: never): Promise<Result<unknown>>;
  /**
   * OPTIONAL, as `pagesCensus` and `checkPaths` are. The route lands before the record's method does, and a required member here
   * would stop both hosts compiling until it did; `handlersFor` answers `NOT_IN_THIS_BUILD` meanwhile, which is the
   * truth, where calling a method that is not there would be a 500.
   */
  scriptTry?(args: never, ctx: never): Promise<Result<unknown>>;
  previewPage(args: never, ctx: never): Promise<Result<unknown>>;
  whoami(ctx: never): Promise<Result<unknown>>;
  digestToday(args: never, ctx: never): Promise<Result<unknown>>;
  markRead(args: { upTo?: number | string } | undefined, ctx: never): Promise<Result<unknown>>;
  setPref(args: never, ctx: never): Promise<Result<unknown>>;
  subscribePush(args: never, ctx: never): Promise<Result<unknown>>;
  unsubscribePush(args: never, ctx: never): Promise<Result<unknown>>;
  log(args: never, ctx: never): Promise<Result<unknown>>;
  governance(args: never, ctx: never): Promise<Result<unknown>>;
  propose(args: never, ctx: never): Promise<Result<unknown>>;
  decide(args: never, ctx: never): Promise<Result<unknown>>;
  packs(ctx: never): Promise<Result<unknown>>;
  planPack(args: never, ctx: never): Promise<Result<unknown>>;
  planUseCase(args: never, ctx: never): Promise<Result<unknown>>;
  fetchShared(args: never, ctx: never): Promise<Result<unknown>>;
  fetchUseCase(args: never, ctx: never): Promise<Result<unknown>>;
  exportUseCase(args: never, ctx: never): Promise<Result<unknown>>;
  /** OPTIONAL as `countBy` is: the route lands in the same wave as the record's method, and both hosts compile either way. */
  setup?(args: never, ctx: never): Promise<Result<unknown>>;
  installPack(args: never, ctx: never): Promise<Result<unknown>>;
  uninstallPack(args: never, ctx: never): Promise<Result<unknown>>;
  disablePack(args: never, ctx: never): Promise<Result<unknown>>;
  enablePack(args: never, ctx: never): Promise<Result<unknown>>;
  resumeAction(args: never, ctx: never): Promise<Result<unknown>>;
  resumeScript(args: never, ctx: never): Promise<Result<unknown>>;
  fileArrival(args: never, ctx: never): Promise<Result<unknown>>;
  archiveArrival(args: never, ctx: never): Promise<Result<unknown>>;
  packConfig(args: never, ctx: never): Promise<Result<unknown>>;
  arrangement(args: never, ctx: never): Promise<Result<unknown>>;
  /** OPTIONAL as `pagesCensus` is: the route lands with the record's method, and an older record answers it is not in this build. */
  pageVersions?(args: never, ctx: never): Promise<Result<unknown>>;
  slash(args: never, ctx: never): Promise<Result<unknown>>;
  slashPropose(args: never, ctx: never): Promise<Result<unknown>>;
  slashDaily(args: never, ctx: never): Promise<Result<unknown>>;
  slashForm(args: never, ctx: never): Promise<Result<unknown>>;
  actions(ctx: never): Promise<Result<unknown>>;
  automations(args: never, ctx: never): Promise<Result<unknown>>;
  scripts(args: never, ctx: never): Promise<Result<unknown>>;
  automationRun(args: never, ctx: never): Promise<Result<unknown>>;
  cancelRun(args: never, ctx: never): Promise<Result<unknown>>;
  setPackConfig(args: never, ctx: never): Promise<Result<unknown>>;
  setDeclaration(args: never, ctx: never): Promise<Result<unknown>>;
  retireDeclaration(args: never, ctx: never): Promise<Result<unknown>>;
  undoLook(args: never, ctx: never): Promise<Result<unknown>>;
  keepLook(args: never, ctx: never): Promise<Result<unknown>>;
  undo(args: never, ctx: never): Promise<Result<unknown>>;
  undoRun(args: never, ctx: never): Promise<Result<unknown>>;
  ruleApply(args: never, ctx: never): Promise<Result<unknown>>;
  examples(args: never, ctx: never): Promise<Result<unknown>>;
  clearExamples(args: never, ctx: never): Promise<Result<unknown>>;
  members(ctx: never): Promise<Result<unknown>>;
  invite(args: never, ctx: never): Promise<Result<unknown>>;
  invitations(ctx: never): Promise<Result<unknown>>;
  revokeInvite(args: never, ctx: never): Promise<Result<unknown>>;
  removeMember(args: never, ctx: never): Promise<Result<unknown>>;
  listTokens(ctx: never): Promise<Result<unknown>>;
  createToken(args: never, ctx: never): Promise<Result<unknown>>;
  revokeToken(args: never, ctx: never): Promise<Result<unknown>>;
  createReportKey(args: never, ctx: never): Promise<Result<unknown>>;
  reportKeys(ctx: never): Promise<Result<unknown>>;
  deviceApprove(args: never, ctx: never): Promise<Result<unknown>>;
  listDevices(ctx: never): Promise<Result<unknown>>;
  revokeDevice(args: never, ctx: never): Promise<Result<unknown>>;
  ingestMint(args: never, ctx: never): Promise<Result<unknown>>;
  doors(ctx: never): Promise<Result<unknown>>;
  export(args: never, ctx: never): Promise<Result<unknown>>;
  import(args: never, ctx: never): Promise<Result<unknown>>;
  snapshot(args: never, ctx: never): Promise<Result<unknown>>;
  snapshots(ctx: never): Promise<Result<unknown>>;
  restore(args: never, ctx: never): Promise<Result<unknown>>;
  erase(args: never, ctx: never): Promise<Result<unknown>>;
  deleteRecord(args: never, ctx: never): Promise<Result<unknown>>;
  create(args: never, ctx: never): Promise<Result<unknown>>;
  report(args: never, ctx: never): Promise<Result<unknown>>;
  update(args: never, ctx: never): Promise<Result<unknown>>;
  attach(args: never, ctx: never): Promise<Result<unknown>>;
  handoff(args: never, ctx: never): Promise<Result<unknown>>;
  sessionsLive(args: never, ctx: never): Promise<Result<unknown>>;
  context(args: never, ctx: never): Promise<Result<unknown>>;
  meet(args: never, ctx: never): Promise<Result<unknown>>;
  views(args: never, ctx: never): Promise<Result<unknown>>;
  view(args: never, ctx: never): Promise<Result<unknown>>;
  saveView(args: never, ctx: never): Promise<Result<unknown>>;
  retireView(args: never, ctx: never): Promise<Result<unknown>>;
};

export function handlersFor(api: RecordSurface): Record<string, Handler> {
  const handlers: Record<string, Handler> = {
    boot: (_a, ctx) => api.boot(ctx as never),
    version: (_a, ctx) => api.version(ctx as never),
    schema: (a, ctx) => api.schema(a as never, ctx as never),
    get: (a, ctx) => api.get(a as never, ctx as never),
    list: (a, ctx) => api.list(a as never, ctx as never),
    countBy: async (a, ctx) =>
      api.countBy
        ? api.countBy(a as never, ctx as never)
        : { ok: false, refusal: { code: 'NOT_IN_THIS_BUILD', fix: 'This BrainDog cannot count a list by a field yet, so nothing was read.' } },
    history: (a, ctx) => api.history(a as never, ctx as never),
    backlinks: (a, ctx) => api.backlinks(a as never, ctx as never),
    whatsNew: (a, ctx) => api.whatsNew(a as never, ctx as never),
    recentHistory: (a, ctx) => api.recentHistory(a as never, ctx as never),
    inbox: (a, ctx) => api.inbox(a as never, ctx as never),
    search: (a, ctx) => api.search(a as never, ctx as never),
    pages: (_a, ctx) => api.pages(ctx as never),
    pagesCensus: async (a, ctx) =>
      api.pagesCensus
        ? api.pagesCensus(a as never, ctx as never)
        : { ok: false, refusal: { code: 'NOT_IN_THIS_BUILD', fix: 'This BrainDog cannot count its pages yet, so nothing was read.' } },
    checkPaths: async (a, ctx) =>
      api.checkPaths
        ? api.checkPaths(a as never, ctx as never)
        : { ok: false, refusal: { code: 'NOT_IN_THIS_BUILD', fix: 'This BrainDog cannot check a document’s placeholders yet, so nothing was read.' } },
    page: (a, ctx) => api.page(a as never, ctx as never),
    metric: (a, ctx) => api.metric(a as never, ctx as never),
    figures: (_a, ctx) => api.figures(ctx as never),
    listGrants: (_a, ctx) => api.listGrants(ctx as never),
    revokeGrant: (a, ctx) => api.revokeGrant(a as never, ctx as never),
    dryRun: (a, ctx) => api.dryRun(a as never, ctx as never),
    scriptTry: async (a, ctx) =>
      api.scriptTry
        ? api.scriptTry(a as never, ctx as never)
        : { ok: false, refusal: { code: 'NOT_IN_THIS_BUILD', fix: 'This BrainDog cannot try a script yet, so nothing ran. Propose it, and the owner reads the source in Decide.' } },
    previewPage: (a, ctx) => api.previewPage(a as never, ctx as never),
    whoami: (_a, ctx) => api.whoami(ctx as never),
    digestToday: (a, ctx) => api.digestToday(a as never, ctx as never),
    markRead: (a, ctx) => api.markRead(a as { upTo?: number | string } | undefined, ctx as never),
    setPref: (a, ctx) => api.setPref(a as never, ctx as never),
    subscribePush: (a, ctx) => api.subscribePush(a as never, ctx as never),
    unsubscribePush: (a, ctx) => api.unsubscribePush(a as never, ctx as never),
    log: (a, ctx) => api.log(a as never, ctx as never),
    governance: (a, ctx) => api.governance(a as never, ctx as never),
    propose: (a, ctx) => api.propose(a as never, ctx as never),
    decide: (a, ctx) => api.decide(a as never, ctx as never),
    packs: (_a, ctx) => api.packs(ctx as never),
    planPack: (a, ctx) => api.planPack(a as never, ctx as never),
    planUseCase: (a, ctx) => api.planUseCase(a as never, ctx as never),
    fetchShared: (a, ctx) => api.fetchShared(a as never, ctx as never),
    fetchUseCase: (a, ctx) => api.fetchUseCase(a as never, ctx as never),
    exportUseCase: (a, ctx) => api.exportUseCase(a as never, ctx as never),
    /* `at: 'setup'` IS HOW A CLIENT TELLS THIS FROM THE RECORD'S OWN `NOT_IN_THIS_BUILD` (no backups here, no sign-in
       here), which is an answer about the record and no reason to fall back to the old way. */
    setup: async (a, ctx) =>
      api.setup
        ? api.setup(a as never, ctx as never)
        : { ok: false, refusal: { code: 'NOT_IN_THIS_BUILD', fix: 'This BrainDog cannot set a record up in one call yet, so nothing was written.', at: 'setup' } },
    installPack: (a, ctx) => api.installPack(a as never, ctx as never),
    uninstallPack: (a, ctx) => api.uninstallPack(a as never, ctx as never),
    disablePack: (a, ctx) => api.disablePack(a as never, ctx as never),
    enablePack: (a, ctx) => api.enablePack(a as never, ctx as never),
    resumeAction: (a, ctx) => api.resumeAction(a as never, ctx as never),
    resumeScript: (a, ctx) => api.resumeScript(a as never, ctx as never),
    fileArrival: (a, ctx) => api.fileArrival(a as never, ctx as never),
    archiveArrival: (a, ctx) => api.archiveArrival(a as never, ctx as never),
    packConfig: (a, ctx) => api.packConfig(a as never, ctx as never),
    arrangement: (a, ctx) => api.arrangement(a as never, ctx as never),
    pageVersions: async (a, ctx) =>
      api.pageVersions
        ? api.pageVersions(a as never, ctx as never)
        : { ok: false, refusal: { code: 'NOT_IN_THIS_BUILD', fix: "This BrainDog cannot list a page's versions yet, so nothing was read." } },
    slash: (a, ctx) => api.slash(a as never, ctx as never),
    slashPropose: (a, ctx) => api.slashPropose(a as never, ctx as never),
    slashDaily: (a, ctx) => api.slashDaily(a as never, ctx as never),
    slashForm: (a, ctx) => api.slashForm(a as never, ctx as never),
    actions: (_a, ctx) => api.actions(ctx as never),
    automations: (a, ctx) => api.automations(a as never, ctx as never),
    scripts: (a, ctx) => api.scripts(a as never, ctx as never),
    automationRun: (a, ctx) => api.automationRun(a as never, ctx as never),
    cancelRun: (a, ctx) => api.cancelRun(a as never, ctx as never),
    setPackConfig: (a, ctx) => api.setPackConfig(a as never, ctx as never),
    setDeclaration: (a, ctx) => api.setDeclaration(a as never, ctx as never),
    retireDeclaration: (a, ctx) => api.retireDeclaration(a as never, ctx as never),
    undoLook: (a, ctx) => api.undoLook(a as never, ctx as never),
    keepLook: (a, ctx) => api.keepLook(a as never, ctx as never),
    undo: (a, ctx) => api.undo(a as never, ctx as never),
    undoRun: (a, ctx) => api.undoRun(a as never, ctx as never),
    ruleApply: (a, ctx) => api.ruleApply(a as never, ctx as never),
    examples: (a, ctx) => api.examples(a as never, ctx as never),
    clearExamples: (a, ctx) => api.clearExamples(a as never, ctx as never),
    members: (_a, ctx) => api.members(ctx as never),
    invite: (a, ctx) => api.invite(a as never, ctx as never),
    invitations: (_a, ctx) => api.invitations(ctx as never),
    revokeInvite: (a, ctx) => api.revokeInvite(a as never, ctx as never),
    removeMember: (a, ctx) => api.removeMember(a as never, ctx as never),
    listTokens: (_a, ctx) => api.listTokens(ctx as never),
    createToken: (a, ctx) => api.createToken(a as never, ctx as never),
    revokeToken: (a, ctx) => api.revokeToken(a as never, ctx as never),
    createReportKey: (a, ctx) => api.createReportKey(a as never, ctx as never),
    reportKeys: (_a, ctx) => api.reportKeys(ctx as never),
    deviceApprove: (a, ctx) => api.deviceApprove(a as never, ctx as never),
    listDevices: (_a, ctx) => api.listDevices(ctx as never),
    revokeDevice: (a, ctx) => api.revokeDevice(a as never, ctx as never),
    ingestMint: (a, ctx) => api.ingestMint(a as never, ctx as never),
    doors: (_a, ctx) => api.doors(ctx as never),
    export: (a, ctx) => api.export(a as never, ctx as never),
    import: (a, ctx) => api.import(a as never, ctx as never),
    snapshot: (a, ctx) => api.snapshot(a as never, ctx as never),
    snapshots: (_a, ctx) => api.snapshots(ctx as never),
    restore: (a, ctx) => api.restore(a as never, ctx as never),
    erase: (a, ctx) => api.erase(a as never, ctx as never),
    deleteRecord: (a, ctx) => api.deleteRecord(a as never, ctx as never),
    create: (a, ctx) => api.create(a as never, ctx as never),
    report: (a, ctx) => api.report(a as never, ctx as never),
    update: (a, ctx) => api.update(a as never, ctx as never),
    attach: (a, ctx) => api.attach(a as never, ctx as never),
    handoff: (a, ctx) => api.handoff(a as never, ctx as never),
    sessionsLive: (a, ctx) => api.sessionsLive(a as never, ctx as never),
    context: (a, ctx) => api.context(a as never, ctx as never),
    meet: (a, ctx) => api.meet(a as never, ctx as never),
    views: (a, ctx) => api.views(a as never, ctx as never),
    view: (a, ctx) => api.view(a as never, ctx as never),
    saveView: (a, ctx) => api.saveView(a as never, ctx as never),
    retireView: (a, ctx) => api.retireView(a as never, ctx as never),
  };
  /* THE ROWS UNDER `routes/` ARE WIRED BY THEIR NAMES, since each names a record method of the same name
     (`routes/index.ts`), so a unit adding one writes no line here. The surface is structural, so the method is looked up
     when it is called; a record that has not got it answers `NOT_IN_THIS_BUILD`, as `scriptTry` does above, rather than a
     500 from calling a function that is not there. The name comes from the table, never from a caller. */
  for (const route of EXTRA_ROUTES)
    handlers[route.name] = async (a, ctx) => {
      const method = (api as unknown as Record<string, unknown>)[route.name];
      return typeof method === 'function'
        ? (method as Handler).call(api, a, ctx)
        : { ok: false, refusal: { code: 'NOT_IN_THIS_BUILD', fix: `This BrainDog cannot answer ${route.name} yet, so nothing was read or written.` } };
    };
  /* The table and the wiring, checked against each other where they are both in scope — so adding a
     route to one without the other throws at start rather than 404ing in production. */
  for (const route of ROUTES)
    if (!handlers[route.name]) throw new TypeError(`${route.name} is in the route table and has no handler`);
  for (const name of Object.keys(handlers))
    if (!BY_NAME.has(name)) throw new TypeError(`${name} has a handler and is not in the route table`);
  return handlers;
}

/**
 * Answer one request against a set of handlers.
 *
 * ONE SHAPE FOR EVERY ANSWER — `{ ok, value }` or `{ ok, refusal }` — because a client that has to
 * branch on shape per route is a client that gets one of them wrong. The status carries the same
 * information for anything that reads status codes; the body carries the sentence.
 */
export async function serveApi(
  request: Request,
  handlers: Record<string, Handler>,
  ctx: unknown,
): Promise<Response> {
  const url = new URL(request.url);
  const name = url.pathname.replace(/^\/+api\/+/, '').replace(/\/+$/, '');

  const route = BY_NAME.get(name);
  const handler = handlers[name];
  if (!route || !handler)
    return json(404, {
      ok: false,
      refusal: {
        code: 'ROUTE_UNKNOWN',
        fix: `There is no method called ${name || '(nothing)'}.`,
        allowed: ROUTES.map((r) => r.name),
      },
    });

  /* A WRITE IS A POST. Not decoration: a GET that changes something is a change a browser can make
     by prefetching a link, and a proxy may retry it. */
  if (route.writes && request.method !== 'POST')
    return json(405, {
      ok: false,
      refusal: { code: 'FORBIDDEN', fix: `${name} changes the record, so it is a POST.` },
    });

  /* `Object.create(null)`, FOR THE REASON `packages/record/src/index.ts:358` REACHES FOR
     `Object.hasOwn`: every key here is a word the caller chose. `?__proto__={"limit":1}` set the
     prototype of this object rather than an own key, so `args.limit` was 1 and `Object.keys(args)`
     did not say so. Nothing escaped that far, because `Object.prototype` was untouched and the
     caller could have sent `limit` directly, but an argument bag with no inherited names is one
     fewer thing every reader of it has to know. */
  let args: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  if (request.method === 'POST') {
    /* WEIGHED BEFORE IT IS PARSED, AND BEFORE ANY HANDLER RUNS. This was `request.json()`, which reads to the end
       whatever the end is: on the Cloud the only ceiling was the platform's, and the whole body sat in the record's
       Durable Object before a byte of it was looked at. The method is known by
       now, so the ceiling is chosen per method here, in one place, for both hosts. */
    const cap = name === 'import' ? IMPORT_BODY_MOST_BYTES : API_BODY_MOST_BYTES;
    const text = await textOf(request, cap);
    if (text === null)
      return json(413, {
        ok: false,
        refusal: { code: 'BODY_MALFORMED', fix: `${name} takes a body of at most ${cap} bytes.`, at: 'body' },
      });
    try {
      const body: unknown = JSON.parse(text);
      if (body !== null && typeof body === 'object' && !Array.isArray(body)) args = body as Record<string, unknown>;
      else throw new TypeError('not an object');
    } catch {
      return json(400, {
        ok: false,
        refusal: { code: 'BODY_MALFORMED', fix: `${name} takes a JSON object as its body.` },
      });
    }
    /* A READ MAY ALSO ARRIVE AS A POST, and a JSON body carries its own types rather than earning
       them. So there is nothing to decode and the type is simply the one the table declares: a
       `POST /api/get` with `{"seq":{"a":1}}` was the same 500 as the GET, on the same line of the
       same driver, and reads are the half of the surface either verb may carry. */
    for (const [key, kind] of Object.entries(route.takes ?? {})) {
      if (!Object.hasOwn(args, key)) continue;
      const value = args[key];
      /* AN ABSENT ARGUMENT AND A NULL ONE ARE THE SAME ARGUMENT. `cursor: null` is how a caller
         says "from the beginning", and every optional read argument reads a missing one the same
         way, so refusing `null` here would refuse a sentence the record already understands. */
      if (value === null || value === undefined) continue;
      if (kind === 'text' && typeof value !== 'string') return json(422, { ok: false, refusal: notText(key, value) });
      if (kind === 'integer' && !Number.isSafeInteger(value)) return json(422, { ok: false, refusal: notWhole(key, value) });
    }
  } else {
    /* A READ MAY BE A GET, and its arguments come from the query string, which carries text and
       nothing else. THIS GUESSED. It tried `JSON.parse` on every value and kept the raw text only
       when the parse threw, so `?seq={"a":1}` reached the SQL driver as an object and `?slug=2026`
       stopped being a slug. The table says which arguments are structured, so only those are
       decoded and the rest are the text they were sent as. */
    for (const [key, raw] of url.searchParams) {
      /* `Object.hasOwn`, BECAUSE THE KEY IS A WORD THE CALLER CHOSE. It is the same lesson
         `httpStatus` learned above and `packages/record/src/index.ts:358` learned before either:
         `?constructor=x` would otherwise read a kind of `Object` off the prototype and coerce
         against it. */
      const kind = route.takes !== undefined && Object.hasOwn(route.takes, key) ? route.takes[key] : undefined;
      /* AN ARGUMENT THE TABLE DOES NOT DECLARE REACHES NO HANDLER, so there is nothing to guess at
         and guessing could only be wrong. It is kept, as text, because dropping it would make a
         mistyped argument name look like an argument that was never sent. */
      if (kind === undefined || kind === 'text') {
        args[key] = raw;
        continue;
      }
      if (kind === 'integer') {
        const text = raw.trim();
        const whole = WHOLE.test(text) ? Number(text) : Number.NaN;
        if (!Number.isSafeInteger(whole)) return json(422, { ok: false, refusal: notWhole(key, raw) });
        args[key] = whole;
        continue;
      }
      try {
        args[key] = JSON.parse(raw);
      } catch {
        return json(422, {
          ok: false,
          refusal: {
            code: 'VALUE_MALFORMED',
            fix: `${name} reads ${key} as JSON, and this one does not parse.`,
            at: key,
          },
        });
      }
    }
  }

  /* NOTHING THROWS ACROSS THIS BOUNDARY, and this is where that promise is kept. A handler that
     throws — an argument nobody coerced, a driver error, a bug — used to escape here, and the caller
     never wrote a response at all: the socket stayed open, the request hung, and on the self-host
     the SERVER then never closed. A crash is a 500 with a sentence, not a connection nobody ends. */
  /**
   * `INTERNAL` IS LEFT STANDING, DELIBERATELY, AND IT IS NOT A REFUSAL.
   *
   * `30 §6`'s whole shape is *a refusal names the field and what was expected* — a crash names
   * neither, and there is nothing a caller can fix. So the registry should not carry it, and it is
   * the one code in this file that stays outside on purpose rather than by neglect: a 500 body has
   * to say something, the envelope has one shape, and the shape has a `code`.
   *
   * THE REASON IT IS NOT RENAMED HERE IS THAT THERE ARE THREE OF IT. This catch, the self-host's
   * outer `catch` and the Worker's own — one fact, one word, three files, and the first paragraph of
   * this module is about exactly the failure of the two hosts drifting apart. Moving two of the
   * three would buy a lower number in one gate and a product that answers differently depending on
   * where a customer runs it, which is the trade this file exists to refuse.
   */
  /**
   * THE STATUS AND THE BODY ARE INSIDE THE TRY TOO, because the two lines after it threw.
   *
   * The promise above was kept for the handler and for nothing that read its answer. Measured by
   * handing `serveApi` three answers a handler can really produce: `ok(1n)` came out
   * as `TypeError: Do not know how to serialize a BigInt` from `json`, a value holding itself as
   * `TypeError: Converting circular structure to JSON` from the same line, and a handler answering
   * `undefined` as `TypeError: Cannot read properties of undefined (reading 'ok')` from
   * `httpStatus`. All three escaped `serveApi` with no `Response` ever built, which is the hung
   * socket this catch was written to end. A bigint is not a far-fetched value either: `Param`, what
   * `@braindog/ports` says a driver may hand back, lists it.
   */
  /**
   * THE REASON GOES TO THE LOG, AND THE CALLER GETS A REFERENCE TO IT.
   *
   * This catch wrote the thrown message into the `fix`, and logged nothing. Measured:
   * a handler throwing `SQLITE_AUTH: not authorized, row alice@example.com` answered
   * that sentence, row and all, to whoever asked, and neither host's log had a line about it. `crashed` logs the reason
   * under a new reference and answers the reference alone; `test/crash.test.ts` holds the probe's sentence.
   */
  try {
    const out = await handler(args, ctx);
    return json(httpStatus(out), out);
  } catch (e) {
    return json(500, crashed(`/api/${name}`, e));
  }
}

/**
 * The most an `/api` body may weigh, for every method but `import`: a mebibyte.
 *
 * `51-SPEC-WORKER` HAS SAID 1 MB FOR THE API SINCE IT WAS WRITTEN, and `/mcp` holds exactly this number for the same
 * surface reached another way (`packages/mcp/src/http.ts`, `MAX_BODY_BYTES`). A method's arguments are a row, a query
 * or a declaration, and before this ceiling the Cloud read any body to the end, up to the platform's own limit, before
 * finding out.
 */
export const API_BODY_MOST_BYTES = 1_048_576;

/**
 * The most an `import` body may weigh: sixteen mebibytes, about 147,000 rows.
 *
 * `import` IS THE ONE METHOD WHOSE BODY IS A WHOLE FILE, `{ lines, replace }`, and a flat megabyte would have broken
 * it: a real copy measured 94 rows in 8,941 bytes, 95 bytes a row, so 1 MiB is about
 * 11,000 rows, and his own record is larger than that.
 *
 * THE NUMBER IS SET BY THE DURABLE OBJECT, NOT BY A GUESS AT RECORD SIZES. On the Cloud this runs inside the record's
 * object, which has 128 MB (`docs/01-ARCHITECTURE.md`). Measured in Node 24: a body is held three times
 * over at the peak of reading it, its bytes, the text they decode to, and the parsed lines, each about the body's
 * size (a 16 MiB body added 15.8 MiB decoding and 16.5 MiB parsing); the lines alone, about one body's worth, are what
 * the handler keeps. The kernel's import then buffers the whole file again, and `41-SPEC-KERNEL` §10 puts its own
 * ceiling near 50 MB of `.brainl` in the same 128 MB. So 32 MiB would peak at 96 MiB here before the kernel started,
 * and 16 MiB peaks at 48 MiB and leaves the kernel room for its part. A `.brainl` sent as `lines` weighs 1.20 times
 * the file (measured on 6,108 exported lines: 1,277,928 bytes as a file, 1,533,256 as the body), so sixteen mebibytes
 * of body is about 13.3 MiB of file, which at 95 bytes a row is about 147,000 rows.
 *
 * WHAT IT COSTS, ON EACH HOST. On the Cloud, nothing that worked: by the same arithmetic a body past about 40 MiB
 * already held more than the object has before the kernel began, and the kernel's own ceiling was reached soon after.
 * On the self-host, `BODY_MOST_BYTES` in `apps/selfhost/src/server.ts` is 100 MiB, weighed at the socket before this,
 * so an import between 16 and 100 MiB that a Node process with room could have taken is 413 here now. Both hosts
 * answer it alike, which is this file's first rule, and a self-host record past this size is still put back whole by
 * `braindog init <slug> --from <file.brainl>` (`apps/selfhost/src/main.ts`), which opens the file itself and never
 * comes through this door. The number rises when the kernel's two-pass streaming import (`41 §10`) is built.
 */
export const IMPORT_BODY_MOST_BYTES = 16 * 1_048_576;

/**
 * A POST's body as text, or `null` when it weighs more than `cap`.
 *
 * COUNTED AS IT ARRIVES, AS `packages/mcp/src/http.ts`'s `bytesOf` COUNTS IT, because `Content-Length` is a claim and a
 * chunked body makes none. The claim is checked first so a sender announcing ten megabytes is refused before one is
 * read; the count is the check that holds, and reading stops at the first piece over, so the rest is never held.
 *
 * CANCELLED, NOT LEFT UNREAD: a body nobody reads and nobody cancels holds its socket until a timer ends it.
 *
 * DECODED THE WAY `request.json()` DECODED IT, UTF-8 with a leading byte-order mark dropped and a bad sequence replaced
 * rather than refused, so a body that parsed before still parses. The bytes are not returned, so they can be collected
 * while the text is parsed; the peak `IMPORT_BODY_MOST_BYTES` is argued from is this function's.
 */
async function textOf(request: Request, cap: number): Promise<string | null> {
  if (Number(request.headers.get('content-length') ?? 0) > cap) {
    await request.body?.cancel().catch(() => undefined);
    return null;
  }
  if (!request.body) return '';
  const reader = request.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > cap) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    parts.push(value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const part of parts) {
    bytes.set(part, at);
    at += part.byteLength;
  }
  parts.length = 0;
  return new TextDecoder().decode(bytes);
}

/**
 * A whole number and nothing else: no exponent, no decimal point, no leading `+`.
 *
 * `Number('1.5')` IS A NUMBER AND `Number('')` IS ZERO, which is why the test is the text rather
 * than the parse. `GET /api/search?q=x&limit=1.5` was a 500 saying "datatype mismatch" from inside
 * SQLite, and an empty `?limit=` would have been a silent nothing.
 */
const WHOLE = /^-?\d+$/;

/* The two sentences the table's three kinds can refuse with. `VALUE_MALFORMED` is `30 §6`'s own row
   for a value the caller can see and fix, and it is already in the registry, so nothing here grows
   the vocabulary: a code invented at a boundary is a code no client can look up. */
const notWhole = (key: string, seen: unknown): Refusal => ({
  code: 'VALUE_MALFORMED',
  fix: `${key} is a whole number, and this one is ${JSON.stringify(seen) ?? String(seen)}.`,
  at: key,
});

const notText = (key: string, seen: unknown): Refusal => ({
  code: 'VALUE_MALFORMED',
  fix: `${key} is a piece of text, and this one is ${JSON.stringify(seen) ?? String(seen)}.`,
  at: key,
});

const json = (status: number, body: { ok: boolean; value?: unknown; refusal?: Refusal; conflict?: Conflict }): Response => {
  const wait = body.refusal?.retry_after;
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      /* A record is never a shared cache's business: one customer's answer must never be another's. */
      'cache-control': 'no-store',
      /* A 429 SAYS WHEN, in the header a client already reads, as well as in the envelope. */
      ...(status === 429 && typeof wait === 'number' && Number.isSafeInteger(wait) && wait > 0 ? { 'retry-after': String(wait) } : {}),
    },
  });
};
