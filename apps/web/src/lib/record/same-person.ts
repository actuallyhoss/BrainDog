/**
 * SOMEBODY ADDED BY A NAME A PERSON ALREADY HERE ANSWERS TO (audit 31 Oct m, AM18): with Salma, a client with an order,
 * in People, adding "Salma Fathy" made a second person and asked nothing. The add box asks first whether it is the same
 * person, and the answer decides: the same is the one already here (her fuller name kept), someone new is added.
 *
 * Asked only where one person shares the first name and one of the two names is the first name alone ("Salma" and
 * "Salma Fathy"), or the names are the same: "Salma Fathy" beside "Salma Samir" is two people, and two Salmas already
 * here is a question this box cannot put in one line.
 *
 * PURE, so a test reads the answer; the list page only calls it.
 */

export type Twin = { seq: number; name: string; longer: boolean };

const words = (s: string): string[] => s.trim().toLowerCase().split(/\s+/u).filter(Boolean);

/** The one person `typed` may be, or `null`. `longer` when the typed name says more of them than the one kept. */
export function samePerson(typed: string, people: readonly { seq: number; name: string }[]): Twin | null {
  const said = words(typed);
  if (said.length === 0) return null;
  const same = people.filter((p) => {
    const kept = words(p.name);
    if (kept.length === 0 || kept[0] !== said[0]) return false;
    return kept.join(' ') === said.join(' ') || kept.length === 1 || said.length === 1;
  });
  if (same.length !== 1) return null;
  const twin = same[0]!;
  return { seq: twin.seq, name: twin.name.trim(), longer: said.length > words(twin.name).length };
}

/** The question, in a person's words: "Is this Salma, the client already here?" */
export function sameAsked(name: string, role: string | null): string {
  return role ? `Is this ${name}, the ${role.toLowerCase()} already here?` : `Is this the ${name} already here?`;
}
