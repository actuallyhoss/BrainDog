/**
 * The look's writes: an owner's save installs it, a member's save proposes it, and the house look is one press.
 *
 * THROUGH THE DOOR A PACK'S THEME TAKES. `setDeclaration` wraps the one declaration as a pack and reads it through
 * `normaliseChecked` (`packages/record/src/theme-check.ts`), so a look saved here is solved and checked exactly
 * as a theme installed from a file is, and refused in the same words. The editor's gate ran the same checks first, so a
 * refusal here is a record that moved on under the editor, not a gate that let something through.
 *
 * A MEMBER'S SAVE IS A QUESTION ON DECIDE. `setDeclaration` is the owner's; anybody else files a `change` to the same
 * declaration, the shape `action-draft.ts`'s `changeOf` sends, and the owner's accept installs it.
 */

import { createClient, type ClientOptions } from '@braindog/client';

import { copy } from '../copy.ts';
import { declarationOf, OWN, type Draft } from './look.ts';

type Fetch = NonNullable<ClientOptions['fetch']>;

export type Saved = { from: 'installed' } | { from: 'proposed' } | { from: 'refused'; fix: string; code: string | null };

/** What a refused write says, in the words the rest of the app uses for the same answers. */
function refusedAs(out: unknown): Saved {
  if (out === null || typeof out !== 'object' || !('refusal' in out)) return { from: 'refused', fix: copy.recordNotReached, code: null };
  const r = (out as { refusal: { code?: unknown; fix?: unknown } }).refusal;
  const code = typeof r.code === 'string' ? r.code : null;
  if (code === 'UNREACHABLE') return { from: 'refused', fix: copy.recordNotReached, code };
  if (code === 'UNAUTHORIZED') return { from: 'refused', fix: copy.signInAgain, code };
  /* A PALETTE REFUSAL IS SAID IN THE EDITOR'S WORDS, not the theme author's ratio: the code travels, and `lookWhy`
     has a sentence for each one a look can earn. */
  const why = code !== null && Object.hasOwn(copy.lookWhy, code) ? copy.lookWhy[code] : undefined;
  return { from: 'refused', fix: why ?? (typeof r.fix === 'string' ? r.fix : copy.lookWhyElse), code };
}

/**
 * Save a draft as the record's look: installed for an owner, proposed for anybody else.
 *
 * `id` IS THE DECLARATION'S NAME: `own` for a look made here, and the pack's own for Fix and install, so the fixed theme
 * lands under the name its pack gave it.
 */
export async function saveLook(base: string, draft: Draft, owner: boolean, id: string = OWN, io?: Fetch): Promise<Saved> {
  const client = createClient({ base, ...(io ? { fetch: io } : {}) });
  const doc = declarationOf(draft, id);
  if (owner) {
    const out = await client.call('setDeclaration', { body: doc });
    return out.ok ? { from: 'installed' } : refusedAs(out);
  }
  /* THE KERNEL'S FORM OF THE SAME DECLARATION: its id and kind beside a body without the kind's own key. */
  const { theme: _named, ...body } = doc;
  const declared = { id: `theme.${id}`, kind: 'theme', body };
  const out = await client.call('propose', {
    question: copy.lookProposeQuestion,
    body_kind: 'change',
    body: { declaration_id: declared.id, to: declared },
  });
  return out.ok ? { from: 'proposed' } : refusedAs(out);
}

/** Retire the record's own look, so the house look (or a pack's) is drawn again. The owner's. */
export async function houseLook(base: string, io?: Fetch): Promise<Saved> {
  const client = createClient({ base, ...(io ? { fetch: io } : {}) });
  const out = await client.call('retireDeclaration', { id: `theme.${OWN}` });
  return out.ok ? { from: 'installed' } : refusedAs(out);
}
