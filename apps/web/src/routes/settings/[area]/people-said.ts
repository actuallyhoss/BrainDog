/**
 * WHO A ROW ON `/settings/people` IS, in the words every other screen uses for a person.
 *
 * THE NAME SLOT PRINTED AN EMAIL. `personOf` (`lib/record/settings-write.ts`) falls back to the
 * address when the record holds no name, because a row has to be called something, and
 * `research-second-person.md` measured that the record holds none for anybody: `boot.names` came
 * back `{}` for seven people, both owners included, since nothing in the product writes
 * `member.name`. So every colleague on a real record was drawn as `ben@ashgrove.co.uk`, initial `B`,
 * with a level control named "What ben@ashgrove.co.uk can do".
 *
 * NOT A NEW RULE. `actorSaid` in `routes/audit/who.ts` is `whoDid`, the product's answer: the reader
 * is You, a person the record has a name for is that name, anybody else is Someone on this record.
 * What this file adds is the one fact this screen has that the others do not: `personOf` has already
 * folded "no name" into the name, so a name that IS the address or the id is read as no name.
 *
 * A plain `.ts` so `node --test` can drive it; the page only calls it.
 */

import { actorSaid } from '../../audit/who.ts';
import { alsoKnown } from '../../../lib/record/settings-write.ts';
import type { Person } from '../../../lib/record/schema.ts';

/** The names the record actually holds, by person id: never a fallback `personOf` put in the name. */
export const namesHeld = (people: readonly Person[]): ReadonlyMap<string, string> =>
  new Map(people.filter((p) => p.name !== '' && p.name !== p.email && p.name !== p.id).map((p) => [p.id, p.name]));

/** What the face, the name slot and the level control call this person. Never an address, never an id. */
export const personSaid = (p: Person, me: string | null, names: ReadonlyMap<string, string>): string =>
  actorSaid(p.id, me, names).name;

/**
 * The line under the name: the address, unless it is already what the name slot says.
 *
 * `alsoKnown` ASKED THAT OF `p.name`, which is the fallback, so once the slot stopped printing the
 * address the address would have vanished from the row altogether. It is asked of what is drawn.
 */
export const secondSaid = (p: Person, said: string): string => alsoKnown({ ...p, name: said });
