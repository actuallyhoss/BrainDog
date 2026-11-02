/**
 * THE SIGN-UP'S BUILD, AS ONE FUNCTION: what was said before the mail, read again with what was changed and answered laid
 * over it, made into the one press of `/start`'s `accept()` that writes the new record.
 *
 * HERE AND NOT IN THE PAGE so the walk (`tools/people/expect/first-run.mjs`) builds a record the way the page does, by
 * calling this, rather than by a copy of it that can drift: a copy once sent a currency the page never did, and so hid
 * that the page made every record with none.
 */
import { standsOn, type UseCase } from '@braindog/seed/usecases';
import { moduleName } from '@braindog/seed/usecases/names';
import { amend, NO_AMEND, type Amend, type Reply } from '../../lib/first-run.ts';
import { closeOver, INSTALL_ORDER } from '../../lib/shape.ts';
import { nameOfAddress, type Draft } from '../../lib/signup.ts';
import { placesOf, type Proposal } from '../../lib/start/propose.ts';
import { agentsNamed, toolRows } from '../../lib/start/chat.ts';
import { answer } from '../../lib/start/question.ts';
import type { Accepting } from '../start/accept.ts';
import { currencyChoices, type CurrencyEnv } from '../start/building.ts';
import { caseOf, keepsCurrency } from '../start/preview.ts';

/** What this device kept beside the sentence (`amendKept`): the changes made by hand, and the one answer. */
/**
 * THE TWO NAMES THE PAGE SENDS, one place for both, so the page and the people walk (`tools/people`) send the same.
 *
 * `nameSent`, at the start: the person's own name heard in her sentence, which the Directory makes her by ("Mariam").
 *   With none heard, the name her address gives (`nameOfAddress`), the one People already calls her by.
 * `titleSent`, when the record is made: the name she was shown for it ("Mariam's Candles", uc6-walk-50), else what
 * the host already holds. By then she is a person already, so the name the record is made under names the record alone.
 */
export const nameSent = (p: Pick<Proposal, 'name'> | null, email = ''): string => p?.name ?? nameOfAddress(email);
export const titleSent = (p: Pick<Proposal, 'title' | 'name'> | null, held: string | null): string | null => p?.title ?? ownName(held ?? (p?.name || null));

/**
 * THE BRAINDOG'S NAME IS NOT ITS ADDRESS (first hour audit, AH26): with no business or project heard, Sam's BrainDog is
 * "Sam's BrainDog", never "sam" or "lina-2". With no name at all, `null`, and the page says "Your BrainDog".
 */
export const ownName = (person: string | null | undefined): string | null => {
  const n = person?.trim() ?? '';
  return n === '' ? null : `${n}'s BrainDog`;
};

export type Extra = { amend: Amend; reply: Reply | null };

/** Where and when the build is made: the device's currencies, the day, the address signed in with, the rail, the language. */
export type BuildEnv = { device: CurrencyEnv; today: string; email: string | null; nav: readonly string[]; locale: string };

/**
 * THE READING AS THE SCREEN SHOWS IT: the person's changes laid over it, the parts closed over what they stand on and
 * the places said again; then the answer. One function, for the screen and for the build after the link.
 */
export function settle(p: Proposal, a: Amend, r: Reply | null, s: string): Proposal {
  const none = a.out.length === 0 && Object.keys(a.to).length === 0 && a.name === undefined && (a.on ?? []).length === 0 && (a.off ?? []).length === 0;
  const changed = none ? p : amend(p, a, { nameOf: moduleName, caseTitle: caseOf(p.usecase)?.title ?? null });
  const closed = none ? p : { ...changed, modules: closeOver(changed.modules) };
  const placed = none ? p : { ...closed, places: placesOf(closed) };
  return r === null ? placed : answer(placed, r.about, r.value, s);
}

/**
 * THE ONE ANSWER TO LAY OVER THE READING: the one the link carried first, since it travels to any device; then this
 * device's copy; then a currency chosen before the answer was kept at all.
 */
export function replyOf(draft: Draft, extra: Extra | null): Reply | null {
  return draft.reply ?? extra?.reply ?? (draft.currency ? { about: 'currency', value: draft.currency } : null);
}

/**
 * THE USE CASE AND THE ONES BESIDE IT, AND THE MODULES THEY BRING, for the screen and for the build alike, so what the
 * screen lights is what is made (with no reading yet, only the use case picked by hand). A use case picked by hand stands over the one heard, and leaves out the ones beside it,
 * which belong to the reading they were heard with. The modules are every one the words or a use case asked for, in
 * install order (so the record is made in the order `/start` would have made it).
 */
export function picked(p: Pick<Proposal, 'usecase' | 'also' | 'modules'> | null, usecase: string | null): { one: UseCase | null; beside: UseCase[]; modules: string[] } {
  const one = caseOf(usecase ?? p?.usecase ?? null);
  /* ONE KIND PER RECORD (onboarding9, 2 Nov: the shop's money answer, "supplier invoices going out", added Small business
     beside Shop). The use case is the one kind the record is made as; another heard beside it brings no lists of its
     own, and what the words asked for still comes as parts (`p.modules`). */
  const beside: UseCase[] = [];
  /* WHAT EACH USE CASE STANDS ON (`standsOn`, its `needs`), as the record installs it, and not all it may grow into: a
     household is Money and its own lists, and was shown Projects "needed by Personal" (onboarding6). */
  const asked = new Set([...(p?.modules ?? []), ...[one, ...beside].flatMap((c) => (c ? standsOn(c) : []))]);
  return { one, beside, modules: [...new Set([...INSTALL_ORDER, ...asked])].filter((id) => asked.has(id)) };
}

/**
 * THE PRESS THE SIGN-UP MAKES, or `null` when there is nothing to build and the record's own `/start` should ask.
 *
 * THE USE CASE AND THE ONES BESIDE IT and their modules (`picked`), and THE CURRENCY, WHENEVER MONEY IS KEPT: the one
 * kept with the sentence (what the screen showed, on whatever device the words were typed), else the one read again
 * here (typed, answered, or this device's zone), else the one this device points at. A record that keeps money with no
 * currency reads every bare amount told to it later as unsure, so it is never made with none unless the person skipped
 * the question.
 */
export async function accepting(draft: Draft, extra: Extra | null, reading: (said: string) => Promise<Proposal>, env: BuildEnv): Promise<Accepting | null> {
  const r = replyOf(draft, extra);
  const p = settle(await reading(draft.said), extra?.amend ?? NO_AMEND, r, draft.said);
  const { one, beside, modules } = picked(p, draft.usecase);
  if (one === null && modules.length === 0) return null;
  const skipped = r?.about === 'currency' && r.value === null;
  const keepsMoney = modules.some(keepsCurrency);
  /* THE TOOLS AND AI APPS THEY NAMED, as `/start` keeps them (2 Nov, a walk: a stranger who said "Claude, Figma" opened
     an Agents page with no agent and no Figma): the answer to the tools question is said as "I use …" (`saidOf`). */
  const used = modules.includes('agents') ? (/\bI use ([^.]+)\./u.exec(draft.said)?.[1] ?? '') : '';
  const have = new Set(p.rows.map((x) => `${x.register}:${String(x.fields['name'] ?? '').toLocaleLowerCase()}`));
  const tools = used === '' ? [] : toolRows(used).filter((t) => !have.has(`${t.register}:${String(t.fields['name']).toLocaleLowerCase()}`));
  const agents = used === '' ? [] : agentsNamed(used);
  return {
    sentence: draft.said,
    proposal: tools.length === 0 ? p : { ...p, rows: [...p.rows, ...tools] },
    ...(agents.length === 0 ? {} : { agents }),
    usecase: one?.usecase ?? null,
    also: beside.map((b) => b.usecase),
    modules,
    currency: !keepsMoney ? null : (draft.currency ?? p.currency ?? (skipped ? null : currencyChoices(draft.said, env.device).suggested)),
    today: env.today,
    email: env.email,
    nav: env.nav,
    locale: env.locale,
  };
}
