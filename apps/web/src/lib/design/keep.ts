/**
 * Keeping an offer from the holding pen, and putting it back.
 *
 * "Keep it" is the owner's `setDeclaration` of the offer's whole declaration, with Put back. So this
 * reads what stands at that id first, writes the offer against the version it read (a page somebody changed in between
 * is a conflict, said as the page having moved, rather than an overwrite), and hands back the one call that restores
 * what it read: the old body at the version the keep made, or, for a page that was not there, the page retired.
 *
 * A LIST GOES THE WAY EVERY CHANGE TO A LIST GOES FROM THE APP, filed and answered at once by the owner
 * (`field-write.ts` `fileChange`): `schema` answers the record's body with no version to hold a write to, and a filed
 * change is stamped with the version live when it is filed, so a field somebody adds meanwhile is a clash the owner sees.
 */

import { createClient } from '@braindog/client';

import { copy } from '../copy.ts';
import { fileChange } from '../record/field-write.ts';
import { setBody } from '../record/page-write.ts';
import { pagesReader, type PageBody } from '../record/pages-live.ts';
import type { PenItem } from './pen.ts';
import { penWords } from './words.ts';

/** What putting a kept offer back came to. */
export type Undone = { from: 'undone' } | { from: 'refused'; fix: string };

/** What keeping came to: kept, with the one call that puts it back, or refused with the record's sentence. */
export type Kept = { from: 'kept'; putBack: () => Promise<Undone> } | { from: 'refused'; fix: string };

const refusedAs = (out: { from: string; fix?: string }): Undone =>
  out.from === 'written' || out.from === 'added' ? { from: 'undone' } : { from: 'refused', fix: out.fix ?? copy.recordNotReached };

/** Keep one offer: the whole declaration it carries, written. */
export async function keepOffer(base: string, item: PenItem): Promise<Kept> {
  const to = item.change.to;
  if (to.kind === 'register') return keepList(base, item);

  if (to.kind !== 'page') {
    /* A KIND THIS SIDE HAS NO READER FOR is still one declaration, written whole. There is nothing read before it to put
       back, so Put back retires what was written, which is right for a declaration that was not there and is refused by
       the record for one it holds from a pack. */
    const out = await setBody(base, to.body as PageBody);
    if (out.from !== 'written') return { from: 'refused', fix: out.fix };
    return { from: 'kept', putBack: () => retire(base, to.id) };
  }

  const slug = typeof to.body.page === 'string' ? to.body.page : to.id.replace(/^page\./u, '');
  const before = await pagesReader(base).readOne(slug);
  /* A PAGE THAT IS NOT THERE YET IS WHAT AN OFFER OF A NEW PAGE IS FOR, and never a reason to refuse it. */
  const absent = before.from === 'refused' && before.code === 'PAGE_UNKNOWN';
  if (before.from === 'refused' && !absent) return { from: 'refused', fix: before.fix };
  if (before.from === 'expanded') return { from: 'refused', fix: before.expanded.why };
  const was = before.from === 'live' ? before.page : null;

  /* `0` SAYS THERE WAS NO SUCH PAGE TO READ, so a page somebody else placed first is a conflict and not a second copy. */
  const out = await setBody(base, to.body as PageBody, undefined, was === null ? 0 : was.version);
  if (out.from !== 'written') return { from: 'refused', fix: out.fix };
  return {
    from: 'kept',
    putBack: async () => (was === null ? retire(base, to.id) : refusedAs(await setBody(base, was.body, undefined, out.version))),
  };
}

async function retire(base: string, id: string): Promise<Undone> {
  const out = await createClient({ base })
    .call('retireDeclaration', { id })
    .catch(() => null);
  if (out?.ok) return { from: 'undone' };
  return { from: 'refused', fix: out && 'refusal' in out ? out.refusal.fix : copy.recordNotReached };
}

/** A list's offer, filed as a change to that list and answered at once, and put back the same way with the icon taken off. */
async function keepList(base: string, item: PenItem): Promise<Kept> {
  const to = item.change.to;
  const list = item.register || to.id.replace(/^register\./u, '');
  const file = (body: Record<string, unknown>) =>
    fileChange(base, list, penWords.iconQuestion(item.title), { declaration_id: to.id, to: { ...to, body } }, true, penWords.iconReason);
  const out = await file(to.body);
  if (out.from !== 'added') return { from: 'refused', fix: 'fix' in out && out.fix !== undefined ? out.fix : copy.recordNotReached };
  return {
    from: 'kept',
    putBack: async () => {
      /* THE ICON TAKEN OFF, which is what the list had: an offer is made only for a list with no icon the set draws. */
      const without = { ...to.body };
      delete without.icon;
      return refusedAs(await file(without));
    },
  };
}
