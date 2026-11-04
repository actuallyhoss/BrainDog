/**
 * What this person prefers, kept where the shell can read it before it paints.
 *
 * A COOKIE AND NOT `localStorage`, and that is the whole reason this file exists. The app is a
 * STATIC shell — there is no server to write `data-scheme` onto the `<html>` element — so the
 * fourteen bytes of script in `app.html` read this cookie and set the attributes before first
 * paint. `localStorage` is not readable from a synchronous inline script early enough to beat the
 * first frame, so a dark-mode user would see a white flash on every navigation.
 *
 * NOTHING WROTE IT. The parser in `app.html` has been correct since it was written and every
 * preference in this product was lost on refresh: scheme, text size, density, the rail's state,
 * whether bare character keys act. A setting that does not survive a reload is a setting somebody
 * changes once and then stops trusting.
 *
 * MOST OF IT IS PER DEVICE: the rail's width, the columns, what you have read on this screen.
 *
 * THE LOOK FOLLOWS THE PERSON, AND THE COOKIE IS ITS FIRST-PAINT COPY (`35`, "density, theme and accent"). Scheme, text
 * size, density, high contrast and accent were cookies only, so a new laptop opened in the house colours at the house
 * size. The record keeps them now as the person's own `look.*` prefs, `boot` answers them on `me.prefs`, and `adopt`
 * below puts the record's word on the page and back into this cookie. So the cookie still paints first, with no flash,
 * and the record's answer wins the moment it arrives. A record too old to keep a key refuses it, and the cookie is then
 * the whole of that setting, as it always was.
 *
 * AND THE COOKIE SAYS WHOSE LOOK IT HOLDS (`who`) AND WHAT THE RECORD HAS NOT HEARD YET (`unsent`), because it covers the
 * whole host while the look is each record's: `theme/follow.ts` puts the house look back for somebody else, and sends
 * what is owed before it adopts.
 */

export type Pref = {
  scheme?: 'light' | 'dark' | undefined;
  text?: 'sm' | 'base' | 'md' | undefined;
  density?: 'compact' | 'comfortable' | 'roomy' | undefined;
  /**
   * A record's own accent, once a record has one.
   *
   * IT IS NOT AN ATTRIBUTE. `accent.ts` builds a whole palette from it and adopts a stylesheet, so
   * the value is read by JavaScript and by nothing else. `app.html` used to stamp it onto
   * `data-theme` before first paint, which bought nothing (there is no CSS rule anywhere that reads
   * a `data-theme` other than `hc`) and cost the high-contrast palette its own attribute.
   */
  theme?: string | undefined;
  /**
   * The high-contrast palette, which shipped and was unreachable.
   *
   * `packages/theme` solves it against a higher floor, `theme.mjs` writes it into `house.css` behind
   * `html[data-theme='hc']`, and `--check` byte-compares it on every build. Nothing in
   * `apps/web/src` ever set that attribute to `hc`. So a whole generated palette, validated by
   * sixteen checks, could not be turned on by the person it is for.
   *
   * WHAT WAS IN ITS WAY WAS THE ACCENT. `data-theme` carried two meanings, and the one that was
   * written was the one nothing read.
   */
  contrast?: boolean | undefined;
  /**
   * WHERE THE NAVIGATION LIVES. TODAY: `bar` draws the sidebar beside the top bar (the screen calls it Sidebar), and `menu`
   * draws the top bar alone, with one button that opens the sidebar as a panel. The word `bar` stays as it was kept. The
   * history of the choice follows.
   *
   * `undefined` IS THE RAIL, the floating glass card, which `19 §3` makes the default in bold and
   * which was made the default again after a spell of the top bar leading. The three
   * shapes are that section's own table: the rail, sectioned and arrangeable; a top bar, one
   * horizontal strip of spine then declared entries, overflowing into More and SAYING HOW MANY it
   * has put there; and the menu, no persistent nav at all, one button opening the whole sectioned
   * list as a sheet. Below 900px the tab bar stays whatever this says, because a shape choice that
   * lets somebody put an eighteen-entry top bar on a phone is a choice to break their phone.
   *
   * IT IS NOT `sidebar`, AND THE TWO ARE NOT ONE SETTING. `sidebar` is whether the rail is narrow,
   * which is a fact about the screen in front of you: a wide monitor and a laptop honestly want
   * different answers, so it stays per device where it has always been. The shape is a fact about
   * how somebody reads, and it should follow them.
   *
   * THE RECORD KEEPS IT NOW, AND THIS IS ITS FIRST-PAINT COPY. `19 §3`: *"The shape follows the person, so it is the
   * record's, not the cookie's."* The record holds it as `nav.shape` (`setPref`, answered on `boot`'s `me.prefs`), and
   * `nav-prefs.svelte.ts` writes this copy from the record's word so the shell draws the right shape before `boot`
   * answers. It is never read as the truth once the record has spoken.
   *
   * IT WAS `navShape` UNTIL THE TOP BAR BECAME THE DEFAULT. Every boot wrote the rail into that key whether or not
   * anybody chose it, so the old copy is left behind rather than read as a choice.
   *
   * AND THIS ONE CARRIES THE SAME SCAR, the other way round: every boot of the builds that led with the top bar wrote
   * `bar` here, chosen or not. So beside a record that keeps no shape a `bar` is read as nobody's choice and the rail is
   * drawn (`deviceChose` in `nav-prefs.svelte.ts`), and the copy is written from a choice only now, never from the
   * default, so the next change of default meets an empty key instead of a cookie full of the old one.
   */
  shape?: 'rail' | 'bar' | 'menu' | undefined;
  /** Whether bare letters act inside a focused grid. */
  chars?: boolean | undefined;
  /**
   * Whether the record proposes pages at all — `29 §4`'s one global switch.
   *
   * `19 §2` names it as the reason the `navigation` area exists: *"`navigation` was missing too: it
   * holds the *Suggest new pages* switch that `29 §4` places there."* `50 §4.7` has had
   * `suggestPages: boolean` in this type's specification the whole time and the type did not have it
   * — which the `prefs` gate noticed from the other side, listing it among the fields it excused
   * itself from covering while `Pref` had never held it.
   *
   * `undefined` IS ON, and no document states a default. `29 §3`'s trigger table describes them
   * firing, so on is the only reading consistent with the rest of that section — and it is a reading
   * rather than a citation, which is why it is said here rather than assumed.
   *
   * THE RECORD KEEPS IT NOW, AND THIS IS ITS FIRST-PAINT COPY. `19 §3`: *"nav order, hidden pages, pins, dismissals
   * and the *Suggest new pages* switch must survive a change of device, so none of them is a cookie."* The record holds
   * it as `pen.suggest`, and `nav-prefs.svelte.ts` writes this copy from the record's word, so a record's settings
   * screen draws the switch as it stands before `boot` answers, and the sample, which has no record, keeps it here.
   */
  suggestPages?: boolean | undefined;
  /**
   * Whether this person has hidden Today's "When you want more" (`WantMore.svelte`), the next steps the first run used
   * to offer only once, at `/start#made` (planner-45, the onboarding target, step 6).
   *
   * `undefined` IS SHOWN. A first Today offers the next steps until the person says no, and Hide is the one word that
   * says it. Per device, like the rest of this cookie: a hidden offer comes back on a new laptop, which is a nudge, not
   * a loss.
   */
  nextStepsHidden?: boolean | undefined;
  /**
   * How this person's work mostly arrives, the one answer the first run asks when it cannot guess (planner-45, step 3),
   * kept by sign-up's accept. `messages` puts forwarding first among the next steps (`madeSteps` in `start/made.ts`).
   *
   * `undefined` IS UNASKED, and the next steps keep the first run's own order.
   */
  arrivesBy?: 'messages' | 'app' | 'in-person' | undefined;
  /**
   * The instant you last marked the activity feed read.
   *
   * "SINCE YOU WERE AWAY" NEVER ADVANCED. Home's feed reads a module constant and nothing anywhere
   * stored a mark, so the fifth session showed the same six items as the first — a heading making a
   * claim about the reader's own history that is the same claim for ever. `19 §6` calls this half of
   * Home the answer to *"what happened while you were not looking"*, and `copy.markAllRead` had been
   * sitting in `copy.ts` with no call site waiting for it.
   *
   * PER DEVICE, like everything else here, and that is the honest place for it: what you have looked
   * at on this screen is not a fact about the record. The real record has `member.seen_at` for the
   * account-wide version (`33 §2`'s `whatsNew` cursor), and this is the browser's half of it.
   */
  seen?: string | undefined;
  /**
   * Which columns you have hidden, per register.
   *
   * 50 §5.2 names it `prefs.columns[register]`, and the store did not exist — so untick a column,
   * press Done, reload, and it is back. The search, the filters and the sort on that same screen are
   * URL state, which is exactly why a reader expects this to hold too, and the doc comment beside
   * the control named the store it was not writing to.
   *
   * PER DEVICE, LIKE EVERYTHING ELSE HERE. Two people looking at one register may want different
   * columns and neither is editing the record.
   */
  columns?: Record<string, string[]> | undefined;
  /**
   * Your nav order, as a list of addresses.
   *
   * The rail's own header claims *"position lives in a per-user store and wins"*, and there was no
   * store: Move up reordered the list on screen and a reload put it back, silently — while `Hide`,
   * one item below it in the same menu, was honest about writing nothing.
   */
  nav?: string[] | undefined;
  /**
   * Which load-bearing nouns have already been explained to this person.
   *
   * `19 §6` requires a definition "the first time they appear on a screen … and never again", and
   * "never again" is a fact about a person rather than about a screen — so it has to outlive a
   * reload. `50 §4.7` states the preference set and has no slot for it; the URL would put "have you
   * read this" into a shareable address and component state forgets on navigation, so this is the
   * store that is left. One key, named here rather than added quietly.
   */
  defined?: string[] | undefined;
};

/** Look changes owed to the record, by the record's key, each with the word that was sent for it. */
export type Owed = Partial<Record<LookKey, string | boolean | null>>;

/**
 * WHAT THE COOKIE KEEPS ABOUT THE LOOK BESIDE THE LOOK ITSELF. Not a preference, so not a `Pref` field: nobody chooses
 * either, no control sets them, and the `prefs` gate and `flags.test.ts` read `Pref` as the set of things a person
 * picks. They ride in the same cookie because they describe the five look keys in it, and must be written with them.
 */
export type Sync = {
  /**
   * WHOSE LOOK THE FIVE LOOK KEYS ARE: the person `boot` last answered for (`theme/follow.ts`). A handle and never a
   * word anybody reads.
   *
   * THE COOKIE COVERS THE WHOLE HOST, so a second person signing in on this browser met the last person's look for every
   * key their own record had never answered. A stamp that is not theirs now puts the house look back before their
   * record's answer is adopted. The same person in another of their records keeps it, and that record's words are
   * adopted over it. Absent is a cookie from before the stamp, or one nobody has signed in over.
   */
  who?: string | undefined;
  /**
   * LOOK CHANGES THE RECORD HAS NOT KEPT YET, by the record's key, each with the word that was sent for it.
   *
   * A FAILED SEND USED TO BE FORGOTTEN, and the next boot then adopted the record's older word over the cookie, so a
   * dark picked on a train was light again after the reload. A change is written here the moment it is made, taken out
   * once the record keeps or refuses it, and sent again before the next boot's adopt, which leaves these keys alone.
   */
  unsent?: Owed | undefined;
};

const NAME = 'bd_pref';
/** A year. Long enough that it is never the reason something was forgotten. */
const YEAR = 60 * 60 * 24 * 365;

/**
 * THE SHAPE OF EACH SETTING, so a value of the wrong TYPE is dropped and not cast over.
 *
 * The guard below checked that the cookie parsed and that it was an object, and then cast. Every
 * reader after that believed the type: `{"defined":"row"}` threw at MODULE LOAD out of
 * `define.svelte.ts`, and `{"nav":"/x"}` threw inside the shell's own `$derived`. With `ssr = false`
 * a throw in either is a blank screen, on every route, until somebody clears a cookie they cannot
 * see, which is the one failure a preference must never be able to cause.
 *
 * A STORED VALUE IS UNTRUSTED INPUT FROM THE PAST. It was written by a build that no longer exists,
 * by a person with developer tools open, or by a version of this file with a different idea of what
 * `nav` holds. The comment two paragraphs down has said "a cookie this build cannot read is not a
 * crash" since it was written, and it was true only of the ones that fail to parse.
 *
 * ONE BAD KEY DOES NOT LOSE THE OTHERS. Somebody who has chosen a dark scheme and a compact density
 * keeps both when an older build's `nav` is dropped: this reads key by key, because the alternative
 * throws away eleven correct settings to punish one.
 */
const SHAPE: Record<string, (v: unknown) => boolean> = {
  scheme: (v) => v === 'light' || v === 'dark',
  text: (v) => v === 'sm' || v === 'base' || v === 'md',
  density: (v) => v === 'compact' || v === 'comfortable' || v === 'roomy',
  theme: (v) => typeof v === 'string',
  contrast: (v) => typeof v === 'boolean',
  shape: (v) => v === 'rail' || v === 'bar' || v === 'menu',
  chars: (v) => typeof v === 'boolean',
  suggestPages: (v) => typeof v === 'boolean',
  nextStepsHidden: (v) => typeof v === 'boolean',
  arrivesBy: (v) => v === 'messages' || v === 'app' || v === 'in-person',
  seen: (v) => typeof v === 'string',
  nav: (v) => Array.isArray(v) && v.every((x) => typeof x === 'string'),
  defined: (v) => Array.isArray(v) && v.every((x) => typeof x === 'string'),
  who: (v) => typeof v === 'string',
  unsent: (v) =>
    typeof v === 'object' &&
    v !== null &&
    !Array.isArray(v) &&
    Object.entries(v as Record<string, unknown>).every(
      ([k, x]) => (Object.values(LOOK_KEYS) as string[]).includes(k) && (x === null || typeof x === 'string' || typeof x === 'boolean'),
    ),
  columns: (v) =>
    typeof v === 'object' &&
    v !== null &&
    !Array.isArray(v) &&
    Object.values(v as Record<string, unknown>).every((c) => Array.isArray(c) && c.every((x) => typeof x === 'string')),
};

/** What the cookie holds now, or `{}` — including when there is no document at all. */
export function read(): Pref & Sync {
  if (typeof document === 'undefined') return {};
  const raw = new RegExp(`(?:^|; )${NAME}=([^;]*)`).exec(document.cookie)?.[1];
  if (!raw) return {};
  try {
    const out: unknown = JSON.parse(decodeURIComponent(raw));
    if (!out || typeof out !== 'object' || Array.isArray(out)) return {};
    const kept: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(out as Record<string, unknown>))
      /* A KEY THIS BUILD DOES NOT KNOW IS KEPT, and a key it knows with the wrong type is not.
         An unknown key is a setting from a newer build sharing a browser with this one, and
         dropping it would make the two fight over the cookie every time either is opened. */
      if (!Object.hasOwn(SHAPE, key) || SHAPE[key]!(value)) kept[key] = value;
    return kept as Pref & Sync;
  } catch {
    /* A COOKIE THIS BUILD CANNOT READ IS NOT A CRASH. It is a preference from an older version, or
       one somebody edited; the default is the right answer and the next write replaces it. */
    return {};
  }
}

/**
 * Merge one change in and write it back.
 *
 * MERGED, NEVER REPLACED. Each setting is changed by its own control, and a write that carried only
 * the field it knew about would silently reset every other one — which is the shape of bug that
 * makes people think a product forgets things at random.
 */
export function write(change: Pref & Sync): Pref & Sync {
  const next = { ...read(), ...change };
  for (const [key, value] of Object.entries(next)) if (value === undefined) delete (next as Record<string, unknown>)[key];

  if (typeof document !== 'undefined') {
    /* `SameSite=Lax` AND NO `Secure`, deliberately: this is read by the page's own shell and never
       sent anywhere that matters, and a `Secure` cookie is silently dropped on `http://localhost`,
       which is where a self-host is first opened. */
    /* ON brain.dog THE COOKIE IS THE WHOLE DOMAIN'S (2 Nov), so the site at brain.dog wears the scheme the person set
       in the app. The host-only copy an older build wrote is taken away first, so the shell never reads two. */
    const host = typeof location === 'undefined' ? '' : location.hostname;
    const shared = host === 'brain.dog' || host.endsWith('.brain.dog');
    if (shared) document.cookie = `${NAME}=; path=/; max-age=0; samesite=lax`;
    document.cookie = `${NAME}=${encodeURIComponent(JSON.stringify(next))}; path=/; max-age=${YEAR}; samesite=lax${shared ? '; domain=.brain.dog' : ''}`;
  }

  /* NO EVENT ANY MORE. The shell once listened for every write to redraw its shape; it reads the shape from
     `nav-prefs.svelte.ts` now, whose field changes when the shape is set, so there is nobody left to tell. */

  return next;
}

/**
 * Put a preference on the document, and remember it.
 *
 * ONE FUNCTION FOR BOTH HALVES, because they were two and the second one was never written. An
 * attribute set without a cookie is a preference that lasts until the next navigation.
 */
export function apply(key: 'scheme' | 'text' | 'density', value: string | null): Promise<Kept> {
  if (typeof document === 'undefined') return Promise.resolve({ from: 'device' });
  /* THE SCHEME IS ONE EVEN CHANGE (motion F15): the whole window swaps in one view transition, with every other
     transition off for that frame (`app.css` `data-retheme`). Text size and density move the layout, so they change
     in place. */
  if (key === 'scheme') retheme(() => put(key, value));
  else put(key, value);
  /* `system` IS SENT AS A WORD, NOT AS `null`. `null` takes the key off the record, and another device would then keep
     the dark it last heard of; `system` is an answer every device reads as "match this screen". */
  return keep(LOOK_KEYS[key], key === 'scheme' ? (value ?? 'system') : value);
}

/** The attribute and the cookie, and nothing sent: what `apply` does on this page, and what `adopt` does with the record's word. */
function put(key: 'scheme' | 'text' | 'density', value: string | null): void {
  if (value === null) document.documentElement.removeAttribute(`data-${key}`);
  else document.documentElement.setAttribute(`data-${key}`, value);
  write({ [key]: value ?? undefined } as Pref);
}

/**
 * The high-contrast palette, on or off.
 *
 * ITS OWN FUNCTION AND NOT A FOURTH KEY IN `apply`, because the attribute and the preference do not
 * share a name or a shape: the preference is a boolean and the attribute is the literal `hc`. Every
 * other pair above is `data-<key>` carrying the value, and pretending this one is too would mean
 * `apply('contrast', 'hc')` with the caller holding a string that means true.
 *
 * `theme` LEFT `apply` AT THE SAME TIME, and for the mirror reason: it never had an attribute worth
 * setting. `accent.ts` adopts a stylesheet, and `data-theme` is the high-contrast palette's switch.
 */
export function contrast(on: boolean): Promise<Kept> {
  if (typeof document === 'undefined') return Promise.resolve({ from: 'device' });
  retheme(() => putContrast(on));
  return keep('look.contrast', on);
}

/**
 * A CHANGE OF PALETTE AS ONE PICTURE (motion F15): `data-retheme` turns every element's own transition off, and the old
 * picture of the window fades off over the new one. Where the browser has no view transitions, or the person asked for
 * less motion, the change is made at once. The cookie is written inside `set`, so it lands in the same frame either way.
 */
function retheme(set: () => void): void {
  const root = document.documentElement;
  const vt = (document as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<unknown> } }).startViewTransition;
  const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (typeof vt !== 'function' || still) {
    set();
    return;
  }
  root.dataset.retheme = '';
  vt.call(document, set)
    .finished.catch(() => undefined)
    .finally(() => delete root.dataset.retheme);
}

function putContrast(on: boolean): void {
  if (on) document.documentElement.setAttribute('data-theme', 'hc');
  else document.documentElement.removeAttribute('data-theme');
  write({ contrast: on || undefined });
}

/* ── the look, kept by the record ─────────────────────────────────────────── */

/** The record's key for each look setting this cookie holds the first-paint copy of (`PREF_KEYS` in `@braindog/record`). */
export const LOOK_KEYS = {
  scheme: 'look.scheme',
  text: 'look.size',
  density: 'look.density',
  contrast: 'look.contrast',
  theme: 'look.accent',
  shot: 'look.shot',
} as const;
export type LookKey = (typeof LOOK_KEYS)[keyof typeof LOOK_KEYS];

/**
 * What a look change came to: kept by the record; on this device only, with no record listening; `pending`, sent and not
 * kept, so it is held to send again on the next boot; or refused with the record's sentence.
 */
export type Kept = { from: 'kept' } | { from: 'device' } | { from: 'pending' } | { from: 'refused'; fix: string };
/**
 * The record's `setPref`, for one look key. The app's sends to its own record (`theme/follow.ts`); a test's is a fake.
 * `device` from a sender is a send that did not arrive.
 */
export type Send = (key: LookKey, value: string | boolean | null) => Promise<Kept>;

let sender: Send | null = null;
/* ONE CHANGE AT A TIME, so two quick presses arrive in the order they were made and the last one is what is kept. */
let queue: Promise<unknown> = Promise.resolve();
/* THE KEYS THE RECORD REFUSED, which this device then keeps alone. A host older than the `look.*` keys refuses each one. */
const refused = new Set<LookKey>();
/* HOW MANY CHANGES EACH KEY HAS HAD IN THIS TAB, so only the newest answer for a key settles what the cookie still owes:
   a first press kept after a second was made must not mark the second as kept. */
const made = new Map<LookKey, number>();
/* THE KEYS ON THEIR WAY TO THE RECORD NOW, so a second `resend` before the first is answered sends nothing twice. */
const flying = new Map<LookKey, number>();

/**
 * Send look changes to the record from now on, or stop with `null`. Called when `boot` answers with a person in it, so a
 * tab with no record behind it keeps its look on the device and sends nothing.
 */
export function follow(send: Send | null): void {
  sender = send;
  if (send === null) refused.clear();
}

/**
 * Whether a look chosen now reaches the person's other devices: a record is listening and has refused none of the keys.
 * Settings says it in one line, so a person is never told "every device" by a host that cannot keep it.
 */
export const follows = (): boolean => sender !== null && refused.size === 0;

/**
 * Where a look chosen now is kept, in the three words a screen says it in: `record`, on every device this person opens the
 * record on; `pending`, a change the record has not received yet, held here and sent again; `device`, this one alone.
 */
export const whereKept = (): 'record' | 'pending' | 'device' =>
  !follows() ? 'device' : Object.keys(unsent()).length > 0 ? 'pending' : 'record';

/** Every change sent so far, settled: for a screen that says where a choice was kept, and for a test. */
export const settled = (): Promise<unknown> => queue;

/** The look changes this cookie holds that the record has not kept, by the record's key. */
export const unsent = (): Owed => read().unsent ?? {};

/* WHAT THE COOKIE OWES THE RECORD, one key in or out. Out is written as the key's absence, and an empty list as none. */
function owe(key: LookKey, value: string | boolean | null | undefined): void {
  const next: Owed = { ...unsent() };
  if (value === undefined) delete next[key];
  else next[key] = value;
  write({ unsent: Object.keys(next).length > 0 ? next : undefined });
}

/**
 * One look setting, sent to the record. NOTHING IS PUT BACK ON A REFUSAL, which is where this differs from the nav: the
 * cookie has already taken the change, and a record that cannot keep a key leaves the device as the place it lives.
 *
 * OWED UNTIL IT IS KEPT. The change goes into `unsent` before it is sent and leaves it when the record keeps or refuses
 * it, so a send that fails, or a tab closed before the answer, is sent again on the next boot (`resend`). With no record
 * listening it stays owed too, and reaches the record the next time this person's `boot` answers here.
 */
export function keep(key: LookKey, value: string | boolean | null): Promise<Kept> {
  const n = (made.get(key) ?? 0) + 1;
  made.set(key, n);
  owe(key, value);
  const send = sender;
  if (!send) return Promise.resolve({ from: 'device' });
  flying.set(key, (flying.get(key) ?? 0) + 1);
  const out = queue
    .then(() => send(key, value))
    .catch((): Kept => ({ from: 'device' }))
    .then((kept): Kept => {
      flying.set(key, (flying.get(key) ?? 1) - 1);
      if (kept.from === 'refused') refused.add(key);
      else if (kept.from === 'kept') refused.delete(key);
      /* A NEWER CHANGE TO THE SAME KEY SETTLES WHAT IS OWED, by its own answer. */
      if (made.get(key) === n && kept.from !== 'device' && kept.from !== 'pending') owe(key, undefined);
      return kept.from === 'device' ? { from: 'pending' } : kept;
    });
  queue = out;
  return out;
}

/**
 * Send again what an earlier boot could not, in the order it is held, before the record's answer is adopted. Each goes
 * through `keep`, so one that fails again stays owed for the boot after.
 */
export function resend(): void {
  if (sender === null) return;
  for (const [key, value] of Object.entries(unsent()) as [LookKey, string | boolean | null][])
    if ((flying.get(key) ?? 0) === 0) void keep(key, value);
}

/**
 * The look taken off this device: the five keys, their attributes, what is owed and whose they were. For somebody who is
 * not the person the cookie's look belongs to, before their own record's answer is adopted. The accent's sheet is
 * `accent.ts`'s, which `theme/follow.ts` puts back to House beside this.
 */
export function forget(): void {
  if (typeof document === 'undefined') return;
  for (const key of ['scheme', 'text', 'density'] as const) document.documentElement.removeAttribute(`data-${key}`);
  document.documentElement.removeAttribute('data-theme');
  write({ scheme: undefined, text: undefined, density: undefined, contrast: undefined, theme: undefined, unsent: undefined, who: undefined });
}

/**
 * The record's word for the look, put on the page and written over the cookie: `me.prefs` as `boot` answered it.
 *
 * THE RECORD'S ANSWER WINS, AND ONLY WHERE IT HAS ONE. A key the record answers is the person's choice, made on whatever
 * device they made it on, so it stands over this cookie and the cookie is rewritten from it, ready for the next first
 * paint. A key it does not answer is either never chosen or a record too old to keep it, and in both the device's copy
 * stands. A word this build does not know is not an answer.
 *
 * EXCEPT A KEY THIS DEVICE STILL OWES IT. A change the record never received is newer than anything the record holds
 * for that key, so the device's copy stands and `resend` carries it over.
 *
 * NOTHING IS SENT BACK. Adopting is reading; the record learns a look when somebody picks one.
 *
 * THE ACCENT IS NOT HERE: `look.accent` is a swatch's name and the cookie holds its colour, so `accent.ts` adopts it.
 */
export function adopt(prefs: Record<string, unknown>): void {
  if (typeof document === 'undefined') return;
  const owed = unsent();
  const said = (key: LookKey): unknown => (Object.hasOwn(owed, key) ? undefined : prefs[key]);
  const scheme = said('look.scheme');
  if (scheme === 'system') put('scheme', null);
  else if (SHAPE.scheme!(scheme)) put('scheme', scheme as string);
  const size = said('look.size');
  if (SHAPE.text!(size)) put('text', size as string);
  const density = said('look.density');
  if (SHAPE.density!(density)) put('density', density as string);
  const hc = said('look.contrast');
  if (typeof hc === 'boolean') putContrast(hc);
}
