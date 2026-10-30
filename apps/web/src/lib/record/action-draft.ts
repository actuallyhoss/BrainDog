/**
 * A door or a scheduled action, drafted on a sheet and filed as one `change`.
 *
 * A PERSON MADE ONE BY WRITING A FILE. A door was an ingest declaration somebody typed, and a scheduled action was the
 * same declaration with a url, a key's label and an interval; the only way in was an agent or a pack. This holds what
 * the sheet asks, builds the declaration the kernel's lint reads (`ingestBody`, `actionFault` in `kernel/src/declare.ts`,
 * said once in `braindog:grammar/ingest`), and files it the way `field-write.ts` files a field: `propose`, then `decide`
 * at once, so the owner accepts in the same press.
 *
 * THE RECORD STILL DECIDES. Nothing here is a second lint: what this refuses is only what could never be sent (no name,
 * no address), and every other sentence the person reads about a declaration is the record's own `fix`.
 *
 * THE PRESETS ARE HOW A DECLARED PAGE REACHES THE SHEET. A page links to
 * `/<slug>/automations?new=action&preset=<id>`, the hub opens `NewAction.svelte` with that id, and the id is looked
 * up here. A preset is a draft with some boxes filled; it installs nothing on its own.
 */

import { fillRates, RATES_CURRENCIES_MOST, ratesSpecFor } from '@braindog/pack-rates-poll/fill';
import RATES_FILE from '@braindog/pack-rates-poll/rates-poll.pack.json' with { type: 'json' };
import type { Call } from '../ui/webhook-doors.ts';
import { homeCurrency } from './api.ts';
import { forget } from './boot-live.ts';
import { REGISTERS } from './held.ts';
import { listName } from './names.ts';
import { READINGS } from './reporting.ts';
import { KEYS_REGISTER } from './keychain.ts';

/** What the sheet makes. */
export type ActionKind = 'door' | 'action';

/** How a scheduled action reaches out. A door is a webhook, and has none of these. */
export const CHANNELS = ['poll', 'call', 'pull'] as const;
export type Channel = (typeof CHANNELS)[number];

/**
 * How the key is sent ("call and poll `auth.kind`"). `bearer` is what a bare `grant:` has always meant,
 * so it writes no `auth:` on a call or a poll and the declaration reads as it did before the other three existed.
 */
export const AUTH_KINDS = ['bearer', 'header', 'query', 'basic'] as const;
export type AuthKind = (typeof AUTH_KINDS)[number];

/** How often, from the kernel's floor of fifteen minutes up. A shorter one is refused at install, so it is not offered. */
export const EVERY = ['15m', '1h', '6h', '1d', '1w'] as const;
export type Every = (typeof EVERY)[number];

/**
 * One field of the row it writes, and where its value comes from: a place in the answer, or the same words every time.
 */
export type MapLine = { field: string; from: 'answer' | 'fixed' | 'arrived'; text: string };

/** Everything the sheet asks. Every box is a string, so a half-filled sheet is still a draft. */
export type ActionDraft = {
  kind: ActionKind;
  /** What a person calls it. The declaration's name is made from it. */
  name: string;
  channel: Channel;
  url: string;
  auth: AuthKind;
  /** The header or the address parameter the key goes in, for `header` and `query`. */
  keyName: string;
  /** The Keychain key's label, or empty for none. */
  grant: string;
  every: Every;
  /** The list a row lands in, or empty to leave what arrives in the inbox. */
  register: string;
  /** On a pull, where the rows are in each page of the answer. */
  rows: string;
  map: MapLine[];
  /**
   * What an add-on's own filler already made, filed in place of `map` while the draft is still the poll it made.
   *
   * THE RATES FEED IS ONE POLL WITH A ROW A CURRENCY, and `map` is one row, so the sheet cannot say it line by line.
   * `fillRates` (`packs/rates-poll/fill.ts`) is the only maker of a rates feed, so what it made is carried here whole and
   * the boxes keep the rest: the address, how often and the key are still the person's to change.
   */
  filled?: Filled;
};

/** A declaration an add-on's filler made: its ingest name, its maps, the list they write and what it does, in words. */
export type Filled = { ingest: string; register: string; maps: Record<string, unknown>[]; said: string };

/** The words of both sheets, beside the calls they describe, as `fieldWords` is in `field-write.ts`. */
export const actionWords = {
  newDoor: 'New web address',
  newAction: 'New scheduled action',
  doorSub: 'An address another service posts to. What arrives lands in a list, or waits in the inbox.',
  actionSub: 'Something BrainDog does on a clock: reads a number, sends an update or reads pages from a service.',
  name: 'Name',
  namePlaceholder: 'Orders from the shop',
  channel: 'What it does',
  channels: { poll: 'Read one answer', call: 'Send an update', pull: 'Read pages of rows' } satisfies Record<Channel, string>,
  channelHelp: {
    poll: 'Asks the address on a clock and writes what the answer says.',
    call: 'Sends to the address on a clock, with the key.',
    pull: 'Reads a service a page at a time and writes a row for each item.',
  } satisfies Record<Channel, string>,
  url: 'Address',
  urlHelp: 'The whole https:// address.',
  grant: 'Key',
  grantNone: 'No key, the address is public',
  grantHelp: 'A key from the Keychain. It is named here and never shown.',
  grantTyped: 'The key as it is labelled in the Keychain',
  auth: 'Sent as',
  auths: {
    bearer: 'A bearer key',
    header: 'A header you name',
    query: 'A part of the address you name',
    basic: 'A user name and password',
  } satisfies Record<AuthKind, string>,
  keyName: 'Its name',
  every: 'How often',
  everies: { '15m': 'Every 15 minutes', '1h': 'Every hour', '6h': 'Every 6 hours', '1d': 'Every day', '1w': 'Every week' } satisfies Record<Every, string>,
  register: 'Writes to',
  registerNone: 'No list, keep it in the inbox',
  rows: 'Where the rows are',
  rowsHelp: 'The name of the list in each answer, such as data or items.',
  map: 'What each row holds',
  mapHelp: 'For each field, where its value is in the answer, such as total or data.amount, or the words it always holds.',
  fromAnswer: 'From the answer at',
  fromFixed: 'Always',
  fromArrived: 'When it arrived',
  addLine: 'Add a field',
  removeLine: (field: string) => `Remove ${field}`,
  makeDoor: 'Make the address',
  makeAction: 'Save the action',
  making: 'Saving',
  close: 'Close',
  noName: 'Give it a name.',
  noUrl: 'Write the address it uses.',
  notHttps: 'The address starts https://.',
  noKeyName: 'Say the name the key goes under.',
  noKey: 'Pick the key it sends.',
  noRegister: 'Pick the list it writes to.',
  noRows: 'Say where the rows are in each answer.',
  nameTaken: 'That name is already used by a web address or a scheduled action. Pick another, or the one filed under it is replaced.',
  question: (name: string, door: boolean) => (door ? `Make a door called ${name}?` : `Add the scheduled action ${name}?`),
  reason: 'Made on the new-action sheet.',
  filed: 'It is waiting in Needs you. Nothing changes until it is accepted there.',
  saved: (name: string) => `${name} is saved. It runs on its clock from now on.`,
  doorMade: (name: string) => `${name} is ready. Give the address below to whatever posts to it.`,
  changed: 'Something changed while this was open. Try again.',
  ratesName: 'Exchange rates',
  /* THE PROPOSAL NAMES THE HOST AND HOW OFTEN, because a call to another server is the owner's to approve and the plan
     line he approves names nothing else (`packs/rates-poll/fill.ts`). */
  ratesSaid: (host: string, base: string, quoted: readonly string[]) =>
    `Asks ${host} once a day what one ${base} is worth in ${quoted.length < 2 ? quoted.join('') : `${quoted.slice(0, -1).join(', ')} and ${quoted.at(-1)}`}, and writes ${quoted.length < 2 ? 'it' : 'each'} to Exchange rates.`,
} as const;

/** An empty draft of either kind. */
export const blankDraft = (kind: ActionKind): ActionDraft => ({
  kind,
  name: '',
  channel: 'poll',
  url: '',
  auth: 'bearer',
  keyName: '',
  grant: '',
  every: '1h',
  register: '',
  rows: '',
  map: [],
});

/**
 * The presets a page may open the sheet with, by id.
 *
 * `numbers` AND `watch` ARE THE FOUNDER HOME'S TWO BUTTONS, both writing to `datapoints`, which is the list its
 * numbers blocks read; `name` and `value` are that list's fields.
 *
 * `rates` IS "SET UP EXCHANGE RATES" ON MONEY'S PAGE, and is not in this table: it is made from the record each time
 * the sheet opens (`ratesPreset`), because what it fetches is the record's own currencies.
 */
export const PRESETS: Record<string, ActionDraft> = {
  numbers: {
    ...blankDraft('door'),
    name: 'Numbers from a project',
    register: READINGS,
    map: [
      { field: 'name', from: 'answer', text: 'name' },
      { field: 'value', from: 'answer', text: 'value' },
    ],
  },
  watch: {
    ...blankDraft('action'),
    name: 'A number to watch',
    channel: 'poll',
    register: READINGS,
    map: [
      { field: 'name', from: 'fixed', text: '' },
      { field: 'value', from: 'answer', text: '' },
    ],
  },
};

/** What the record holds that a preset is made from: the currencies its money is written in, and its home one. */
export type Held = { currencies: Iterable<string>; home: string | null };

/**
 * The exchange rates action for what a record holds, or `null` when it would fetch for nobody.
 *
 * MADE BY `fillRates(template, ratesSpecFor(...))` AND BY NOTHING ELSE. It was a draft of its own here: one action a
 * currency, at an address whose own documents say it quotes no Egyptian pound (`docs/08` 2.5), with the currency typed
 * twice by the person. Now the add-on file is filled as Browse would fill it, from the record's currencies with the
 * home one as the base, and its one poll becomes the draft: one action for every currency, under the file's own ingest
 * name, so opening it again after a currency is added replaces the poll instead of joining it.
 *
 * NOTHING CALLS OUT UNTIL THE OWNER SAYS YES. This is a draft; the sheet files it and the record asks for the accept,
 * which only the owner can give for a call to another server. Until then figures keep the rate they have.
 */
export function ratesPreset(held: Held): ActionDraft | null {
  const spec = ratesSpecFor(held.currencies, held.home);
  if (spec === null) return null;
  /* MORE CURRENCIES THAN ONE POLL FILLS (`RATES_CURRENCIES_MOST`) IS REFUSED BY THE FILLER, and a throw here would take
     the sheet down as it opens; the sheet opens blank instead, and the person drafts the feed by hand. */
  if (spec.rates.length > RATES_CURRENCIES_MOST) return null;
  const doc = fillRates(RATES_FILE as Record<string, unknown>, spec);
  const poll = (doc.declarations as Record<string, unknown>[])[0]!;
  const register = String((poll.writes as { register?: unknown } | undefined)?.register ?? '');
  return {
    ...blankDraft('action'),
    name: actionWords.ratesName,
    channel: 'poll',
    url: String(poll.url),
    every: EVERY.find((e) => e === poll.every) ?? '1d',
    register,
    filled: {
      ingest: String(poll.ingest),
      register,
      maps: structuredClone(poll.map as Record<string, unknown>[]),
      said: actionWords.ratesSaid(new URL(spec.url).host, spec.base, spec.rates.map((r) => r.currency)),
    },
  };
}

/**
 * The draft a sheet opens with: the preset's, when the id names one of this kind, and a blank one otherwise.
 *
 * `Object.hasOwn`, because the id comes from an address anybody can type, and `?preset=constructor` is not a preset.
 * A COPY, so a sheet typing into its draft never writes into `PRESETS`.
 *
 * `held` IS WHAT THE RATES PRESET IS MADE FROM. A caller that knows the record's currencies hands them in; without them
 * the home currency alone is one currency, which makes no feed, and the sheet opens blank rather than at a guess.
 */
export function presetOf(kind: ActionKind, id: string | null | undefined, held: Held = { currencies: [], home: homeCurrency() }): ActionDraft {
  if (id === 'rates') return (kind === 'action' && ratesPreset(held)) || blankDraft(kind);
  const found = id && Object.hasOwn(PRESETS, id) ? PRESETS[id] : undefined;
  if (!found || found.kind !== kind) return blankDraft(kind);
  return { ...found, map: found.map.map((l) => ({ ...l })) };
}

/**
 * The declaration's name, from what the person called it: `Orders from the shop` is `orders_from_the_shop`.
 *
 * A LETTER FIRST AND AT MOST 32, which every ingest name the product ships keeps to (the live feed's `FEED_NAME_MOST`,
 * `packs/live-feed/fill.ts`). A name with no letter in it at all makes none, and the sheet says to give it one.
 */
export function nameOf(said: string): string | null {
  const id = said
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '_')
    .replace(/^[^a-z]+/u, '')
    .slice(0, 32)
    .replace(/_+$/u, '');
  return /^[a-z][a-z0-9_]*$/u.test(id) ? id : null;
}

/** The lists the sheet offers to write to, by the name a person reads. */
export const listsOffered = (): { id: string; name: string }[] =>
  Object.keys(REGISTERS)
    .map((id) => ({ id, name: listName(id) }))
    .sort((a, b) => a.name.localeCompare(b.name));

/** The fields of a list the map may fill: every one a value can arrive in, so not a secret and not a file. */
export const fieldsOf = (register: string): { id: string; name: string }[] =>
  (Object.hasOwn(REGISTERS, register) ? (REGISTERS[register]?.fields ?? []) : [])
    .filter((f) => f.type !== 'secret' && f.type !== 'document')
    .map((f) => ({ id: f.id, name: f.label ?? f.id.replace(/_/gu, ' ') }));

/* THE TYPES A MAPPED VALUE IS READ AS (`kernel/src/map.ts` `MAP_TYPES`), from the field's own. A link or a list arrives
   as the words that name it, which is text. */
const MAPPED = new Set(['text', 'int', 'decimal', 'money', 'day', 'instant', 'enum', 'bool', 'duration', 'url', 'email']);
const typeOf = (register: string, field: string): string => {
  const f = Object.hasOwn(REGISTERS, register) ? REGISTERS[register]?.fields.find((x) => x.id === field) : undefined;
  return f && MAPPED.has(f.type) ? f.type : 'text';
};

/** The ingest declaration a draft makes. */
export type Declared = { id: string; kind: 'ingest'; body: Record<string, unknown> };

export type Built = { ok: true; decl: Declared; name: string } | { ok: false; fix: string; at: keyof ActionDraft };

/** A `map:` from the lines that say something; a line with no field or no words is left out. */
function mapOf(draft: ActionDraft): Record<string, unknown> | null {
  const map: Record<string, unknown> = {};
  for (const line of draft.map) {
    if (line.field === '') continue;
    if (line.from === 'arrived') {
      map[line.field] = { arrived: true };
      continue;
    }
    const text = line.text.trim();
    if (text === '') continue;
    map[line.field] = line.from === 'fixed' ? { value: text } : { path: text, type: typeOf(draft.register, line.field) };
  }
  return Object.keys(map).length === 0 ? null : map;
}

/**
 * The declaration a draft makes, or the one sentence saying what is missing.
 *
 * A DOOR IS A WEBHOOK WITH A PATH TOKEN, which is the one kind `ingestMint` makes an address for. A POLL AND A CALL
 * carry their url whole; A PULL splits it into the host and the path, because a connector's `base` is a host alone.
 *
 * `taken` IS EVERY INGEST ID THE RECORD ALREADY DECLARES, bare (as `doors()` and `actions()` answer it, never
 * prefixed `ingest.`), so a name that collides is refused here instead of silently replacing what it names.
 *
 * A FILLED DRAFT (`filled`, the rates feed) IS FILED UNDER ITS FILLER'S NAME WITH ITS FILLER'S MAPS, for as long as it
 * is still the poll writing the list it was made for; a person who turns it into something else gets an ordinary draft.
 * It replaces the poll already under that name, which is the point: the record's currencies changed, so its feed does.
 */
export function declarationOf(draft: ActionDraft, taken?: ReadonlySet<string>): Built {
  const said = draft.name.trim();
  const made = draft.kind === 'action' && draft.channel === 'poll' && draft.filled && draft.register === draft.filled.register ? draft.filled : undefined;
  const name = made ? made.ingest : nameOf(said);
  if (said === '' || name === null) return { ok: false, fix: actionWords.noName, at: 'name' };
  if (!made && taken?.has(name)) return { ok: false, fix: actionWords.nameTaken, at: 'name' };
  const body: Record<string, unknown> = { ingest: name, description: said };
  /* A COPY BY JSON AND NOT BY `structuredClone`: the sheet's draft is a `$state` proxy, which `structuredClone` refuses
     to copy, so the save press threw before anything was filed. The maps are plain JSON either way. */
  const map = made ? (JSON.parse(JSON.stringify(made.maps)) as Record<string, unknown>[]) : mapOf(draft);
  const writes = draft.register === '' ? null : { register: draft.register };

  if (draft.kind === 'door') {
    Object.assign(body, { channel: 'webhook', verify: { kind: 'path' } }, writes ? { writes } : {}, writes && map ? { map } : {});
    return { ok: true, decl: { id: `ingest.${name}`, kind: 'ingest', body }, name: said };
  }

  const url = draft.url.trim();
  if (url === '') return { ok: false, fix: actionWords.noUrl, at: 'url' };
  let parsed: URL | null = null;
  try {
    parsed = new URL(url);
  } catch {
    parsed = null;
  }
  if (parsed === null || parsed.protocol !== 'https:') return { ok: false, fix: actionWords.notHttps, at: 'url' };
  const grant = draft.grant.trim();
  /* A CALL ALWAYS SENDS A KEY and a pull reads a service that asks for one; only a poll of a public address sends none. */
  if (grant === '' && draft.channel !== 'poll') return { ok: false, fix: actionWords.noKey, at: 'grant' };
  const named = draft.keyName.trim();
  const needsName = grant !== '' && (draft.auth === 'header' || draft.auth === 'query');
  if (needsName && named === '') return { ok: false, fix: actionWords.noKeyName, at: 'keyName' };
  if (draft.channel !== 'call' && writes === null) return { ok: false, fix: actionWords.noRegister, at: 'register' };

  if (draft.channel === 'pull') {
    const rows = draft.rows.trim();
    if (rows === '') return { ok: false, fix: actionWords.noRows, at: 'rows' };
    const auth = {
      kind: draft.auth === 'query' ? 'query_param' : draft.auth,
      grant,
      ...(needsName ? { name: named } : {}),
    };
    Object.assign(body, {
      channel: 'pull',
      every: draft.every,
      fetch: {
        base: parsed.origin,
        path: `${parsed.pathname}${parsed.search}`,
        auth,
        schedule: { every: draft.every },
        read: { rows },
      },
      writes,
      ...(map ? { map } : {}),
    });
    return { ok: true, decl: { id: `ingest.${name}`, kind: 'ingest', body }, name: said };
  }

  Object.assign(body, {
    channel: draft.channel,
    url,
    every: draft.every,
    ...(grant === '' ? {} : { grant }),
    /* BEARER IS WHAT A BARE `grant:` MEANS, so only the other three write an `auth:`. */
    ...(grant !== '' && draft.auth !== 'bearer' ? { auth: { kind: draft.auth, ...(needsName ? { name: named } : {}) } } : {}),
    ...(writes ? { writes } : {}),
    ...(writes && map ? { map } : {}),
  });
  return { ok: true, decl: { id: `ingest.${name}`, kind: 'ingest', body }, name: said };
}

/** The change `propose` files: the whole declaration, new, under its own id. */
export const changeOf = (decl: Declared) => ({ declaration_id: decl.id, to: decl });

/** What a press came to. */
export type Filed =
  /** Installed now: the owner's accept landed in the same press. */
  | { kind: 'installed' }
  /** On Decide. `fix` is set when the accept was refused, and says why. */
  | { kind: 'filed'; id: string; fix?: string }
  | { kind: 'refused'; fix: string };

type Answered = Awaited<ReturnType<Call>>;
const fixOf = (out: Answered): string => (!out.ok && 'refusal' in out ? out.refusal.fix : actionWords.changed);

/**
 * File the declaration and accept it at once.
 *
 * THE ACCEPT IS ALWAYS ASKED, and the record answers it. A person who may not decide is refused there with the record's
 * own sentence, and the change waits on Decide for somebody who may, which is the same place a member's field goes.
 */
export async function fileDraft(call: Call, decl: Declared, said: string): Promise<Filed> {
  const filed = await call('propose', { question: actionWords.question(said, decl.body.channel === 'webhook'), body_kind: 'change', body: changeOf(decl) });
  if (!filed.ok) return { kind: 'refused', fix: fixOf(filed) };
  const id = String((filed.value as { id?: unknown } | null)?.id ?? '');
  /* THE RAIL'S DECIDE COUNT IS THE KEPT BOOT'S, and it is one higher now whoever filed. */
  forget();
  const accepted = await call('decide', { id, decide: { option: 'accept', reason: actionWords.reason } });
  forget();
  if (!accepted.ok) return { kind: 'filed', id, fix: fixOf(accepted) };
  return { kind: 'installed' };
}

/**
 * The labels of the Keychain's keys, for the key picker. `null` when the Keychain cannot be read here, and the sheet asks for
 * the label as typed text instead, because the declaration names a key by its label and nothing else.
 */
export async function keyLabels(call: Call): Promise<string[] | null> {
  const out = await call('list', { register: KEYS_REGISTER, limit: 200 });
  if (!out.ok) return null;
  const rows = ((out.value as { rows?: unknown } | null)?.rows ?? []) as { fields?: Record<string, unknown>; state?: unknown }[];
  const labels = rows
    .filter((r) => (r.state ?? r.fields?.state) !== 'retired')
    .map((r) => (typeof r.fields?.label === 'string' ? r.fields.label.trim() : ''))
    .filter((l) => l !== '');
  return [...new Set(labels)].sort((a, b) => a.localeCompare(b));
}
