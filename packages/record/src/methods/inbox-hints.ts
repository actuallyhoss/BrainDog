/**
 * What each arrival waiting in the Inbox is and who it is from: `inboxHints` (READ+), the rules half of ENG-B06 job 4
 * ("Everything that comes in ... is read for who and what it is about", D38.41).
 *
 * BEFORE THIS AN INBOX LINE SAID ONLY ITS OWN TITLE. The scope keeps the model's hint on the arrival, which needs a
 * column the owner's migration has not added. A hint worked out by rules when the Inbox is read needs none, so this
 * read answers one for each arrival asked about, and nothing is stored: the same arrival read twice is worked out twice
 * from the same text and answers the same.
 *
 * WHAT IT IS, BY RULES. `payment` when the money reader finds an amount in its subject or its words (`scanMoney`, the
 * reader every pattern reads money with); `someone writing` when it came from a mail address, or from somebody the
 * record keeps as a person; otherwise nothing, since a guess said as a fact is worse than a line with no hint.
 *
 * WHO, BY A KEY AND NEVER BY A NAME. The sender's address is looked up as the kernel looks up any text (`candidatesFor`),
 * and only a key hit counts: an address or a domain a person or an organisation holds. Its name is the record's for
 * them. A payment the sender names nobody in is looked up again by the keys in its own words, an organisation only,
 * since a payee is one. With no hit, the sender's own display name, and never an address shown as a name or an id.
 *
 * THE AMOUNT IN THE CURRENCY IT WAS WRITTEN IN (`moneyText`): the first amount read, integer minor units, and two
 * amounts are never added, since a bank's text says the charge and then the balance.
 *
 * THE SAME REACH AS THE INBOX. What was sent in is about any list or none, so it goes to an owner, or to a token its
 * owner gave the `inbox` reach, and only to a caller reading the whole record, as `inbox` and `inboxPatterns` hold it.
 * Anybody else asking is answered no hints at all, and an id that is no arrival she may read is left out in silence:
 * she is never told that it exists.
 *
 * IT WRITES NOTHING, FILES NOTHING AND CALLS NO MODEL.
 */

import { scanMoney, type CurrencyTable } from '@braindog/extract';
import { candidatesFor, entityLists, exponentOf, moneyText, senderOf, type AboutDeps } from '@braindog/kernel';
import type { Result } from '@braindog/ports';
import { ok } from '@braindog/ports';

import type { CallContext } from '../index.ts';
import type { RecordDeps } from './index.ts';

/** How many arrivals one call asks about at most: a page of the Inbox. */
export const INBOX_HINTS_MOST = 50;

/** What an arrival is, as a line says it. */
export type HintWhat = 'payment' | 'someone writing';

/** One arrival's hint. Each part is `null` when the rules cannot say it. */
export type InboxHint = { id: string; what: HintWhat | null; who: string | null; amount: string | null };

export type InboxHints = { hints: InboxHint[] };

/** How much of an arrival's words is read for an amount and a key: a bank's text whole, and the head of a long mail. */
const READ_CHARS = 4000;
/** How long a sender's display name may be shown. */
const NAME_CHARS = 60;
/** A row's id, as the record mints one: a display name holding one is not said. */
const ROW_ID = /(?<![0-9A-Za-z])[0-9A-HJKMNP-TV-Z]{26}(?![0-9A-Za-z])/i;

/** Every currency the platform knows, with its exponent, as `createRecordApi` builds the table its money reader takes. */
const CURRENCIES: CurrencyTable = Object.fromEntries(Intl.supportedValuesOf('currency').map((code) => [code, { exponent: exponentOf(code) }]));

const NONE: InboxHints = { hints: [] };

/** A header as text, from the JSON `arrive` stored them as; anything else is no header. */
const headersOf = (text: string | null): Record<string, string> => {
  try {
    const v = JSON.parse(text ?? '{}') as unknown;
    if (v === null || typeof v !== 'object' || Array.isArray(v)) return {};
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === 'string'));
  } catch {
    return {};
  }
};

/** A display name a person can be shown, or `null`: one with a letter, no address and no id in it, cut short. */
const shownName = (said: string): string | null => {
  const name = said.replace(/\s+/g, ' ').trim();
  if (name === '' || name.includes('@') || ROW_ID.test(name) || !/\p{L}/u.test(name)) return null;
  return name.length > NAME_CHARS ? `${name.slice(0, NAME_CHARS - 1)}…` : name;
};

export function methods(deps: RecordDeps) {
  const { kernel, sql, scoped, guard, readable, no } = deps;

  /** Whether the caller reads the record as a whole, as `inboxPatterns` asks it: a level that reads, every list. */
  const whole = (ctx: CallContext): boolean => {
    const p = ctx.principal;
    if (p.kind === 'system') return true;
    if (p.kind !== 'person' && p.kind !== 'token') return false;
    return p.level !== null && p.level !== 'append' && (ctx.registers === undefined || ctx.registers === '*');
  };

  /** A token its owner gave the `inbox` reach, as `inboxReached` in `index.ts` asks it. */
  const reached = (ctx: CallContext): boolean => {
    const p = ctx.principal;
    return p.kind === 'token' && p.level === 'owner' && Array.isArray(p.reach) && p.reach.includes('inbox');
  };

  /** Whether a narrowed grant still admits one row, read again by its own number, as `about` reads it. */
  const admitted = (ctx: CallContext, register: string, id: string): boolean => {
    const rule = kernel.scope(ctx, register);
    if (rule === undefined) return true;
    const seq = kernel.get(id)?.seq ?? null;
    if (seq === null) return false;
    const found = kernel.list({ register, where: { field: 'seq', is: seq }, limit: 1 }, rule);
    return found.ok && found.value.rows.length > 0;
  };

  /**
   * The record's name for whoever a text's keys belong to, and whether that is a person: a key hit only, of the kinds
   * asked for, a person ahead of an organisation. `null` when no key the text holds is anybody's she may read.
   */
  const keyed = (ctx: CallContext, about: AboutDeps, text: string, kinds: readonly ('person' | 'org')[]): { name: string; person: boolean } | null => {
    if (text.trim() === '') return null;
    const handed = candidatesFor(about, text, null);
    const hits = handed.candidates.filter((c) => {
      const row = handed.rows.get(c.h);
      return row !== undefined && row.how === 'key' && (kinds as readonly string[]).includes(c.kind) && admitted(ctx, row.register, row.id);
    });
    const best = hits.find((c) => c.kind === 'person') ?? hits[0];
    const name = best === undefined ? null : shownName(best.name);
    return best === undefined || name === null ? null : { name, person: best.kind === 'person' };
  };

  return {
    /**
     * `{ ids }`: for each arrival named, what it is, who it is from and the amount it says, in the order asked
     * (the file's head). READ+, and it changes nothing.
     */
    async inboxHints(args: { ids?: unknown } | undefined, ctx: CallContext): Promise<Result<InboxHints>> {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false, refusal: stop };
      const extra = Object.keys(args ?? {}).find((k) => k !== 'ids');
      if (extra !== undefined) return no('FIELD_UNKNOWN', `${extra} is not something this takes. It takes ids.`, { at: extra, allowed: ['ids'] });
      const ids: unknown = args?.ids;
      if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string'))
        return no('VALUE_MALFORMED', 'ids is a list of the arrivals to read, each by the id the Inbox gives it.', { at: 'ids' });
      if (ids.length > INBOX_HINTS_MOST) return no('VALUE_MALFORMED', `ids names ${INBOX_HINTS_MOST} arrivals at most, a page of the Inbox.`, { at: 'ids' });

      /* CLOSED TO THE INBOX IS NO HINTS, AND NOT A REFUSAL: the Inbox is not hers, and an answer of nothing tells her
         nothing about what arrived. */
      if ((!reached(ctx) && guard(ctx, 'owner') !== null) || !whole(ctx)) return ok(NONE);

      const asked = [...new Set(ids as string[])].filter((id) => id !== '');
      if (asked.length === 0) return ok(NONE);
      const stored = sql.all<{ id: string; channel: string; headers: string | null; body: string | null }>(
        `SELECT id, channel, headers, body FROM inbox_raw WHERE id IN (SELECT value FROM json_each(?)) AND state <> 'erased'`,
        JSON.stringify(asked),
      );
      const byId = new Map(stored.map((r) => [r.id, r]));
      const about: AboutDeps = { sql, lists: entityLists(kernel.registers().values() as never), reads: (register) => readable(ctx, register) === null };

      const hints: InboxHint[] = [];
      /* A SENDER'S OWN DISPLAY NAME IS WORDS ANYBODY COULD HAVE WRITTEN, so a hint that says one marks its reader as the
         Inbox read does. A name the record keeps for them is the record's, and marks nothing. */
      let untrusted = false;
      for (const id of asked) {
        const raw = byId.get(id);
        if (raw === undefined) continue;
        const headers = headersOf(raw.headers);
        const words = `${headers.subject ?? ''}\n${raw.body ?? ''}`.slice(0, READ_CHARS);
        const money = scanMoney(words, CURRENCIES)[0];
        /* THE SENDER: a mail's first mailbox (`senderOf`), and any other door's own `from`, which is a name or nothing. */
        const mail = senderOf(headers.from);
        const address = mail.address;
        const display = address !== '' ? mail.name : (headers.from ?? '');
        const known = address === '' ? null : keyed(ctx, about, address, ['person', 'org']);
        const payee = known === null && money !== undefined ? keyed(ctx, about, words, ['org']) : null;
        const who = known?.name ?? payee?.name ?? shownName(display);
        if (known === null && payee === null && who !== null) untrusted = true;
        const what: HintWhat | null = money !== undefined ? 'payment' : address !== '' || known?.person === true ? 'someone writing' : null;
        hints.push({ id, what, who, amount: money === undefined ? null : moneyText(money.amount, money.currency) });
      }
      if (untrusted) deps.untrusted?.(ctx, 'the inbox');
      return ok({ hints });
    },
  };
}
