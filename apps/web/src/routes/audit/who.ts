/**
 * WHO A LOG LINE IS BY, AND WHO IT IS ABOUT, on a record with more than one person on it.
 *
 * `/audit` printed raw person ids in three places, and nobody caught it because every earlier pass
 * drove a record with one person on it, whose lines are all signed
 * `you`. Driven in process against a real record with eight people put on it by the record's own
 * `invite` (a scratch script, not a fixture: `createRecord` then seven `invite` calls then one
 * `acceptInvite`), `recentHistory` came back with 8 lines, and every one of the 8 `access.grant`
 * rows had a person id where the screen prints a name:
 *
 *   - the ACTOR column ran `named(actorOf(e.by))`, and `actorOf` returns a `p_` id unchanged, so
 *     `named` capitalised its first letter and the column read `P_01M1KJ7RG0TYYA0AX15QPGJJ4`. The
 *     `Face` beside it took its initials from the same string.
 *   - the WHO filter chips are built from the same call, so a record with seven colleagues on it
 *     offered seven chips each labelled with a mangled id, and the `no-results` state quoted one.
 *   - the TARGET of an access row IS the person, and `targetOf` let anything it did not recognise
 *     through unchanged, so the line read `Gave access p_01M1KJ7RG0TYYA0AX15QPGJJ4` and linked it
 *     to `/p_01M1KJ7RG0TYYA0AX15QPGJJ4`, which the spoken-id resolver resolves to nothing.
 *
 * THE RULE ALREADY EXISTED AND THIS SCREEN WAS THE ONE PLACE NOT KEEPING IT. `actor` in
 * `lib/record/names.ts` is the product's own answer: the reader is You, a person the record has a
 * name for is that name, and any other person is Someone on this record, never their id. Home's
 * feed goes through it by way of `whoDid`. This module asks it directly, wearing the three extra
 * facts this screen needs: that an actor which is NOT a person starts a line with a capital
 * however `actor` words it (Slash, BrainDog, a rule's name), that a rule says it is one ("A rule:
 * Renewal", because a rule's name reads like a task and "Renewal" alone could be a person), and
 * that a person is not a destination, so their line carries no link.
 *
 * WHAT IT CANNOT DO IS INVENT A NAME. Measured on that same record: `members()` returned
 * `name: null` for all eight people and `boot.names` came back `{}`, because nothing in the product
 * ever writes `member.name`. So today every line goes down the Someone branch, which is the
 * honest reading of a record that does not know. Where a name arrives, this says it, with no
 * further change here.
 */

import { actor, nameWords, type ActorKind, type RunBy } from '../../lib/record/names.ts';
import type { AuditEvent } from '../../lib/record/schema.ts';

/** The words this file says of its own: a rule is named as one, beside the rule glyph its face wears. */
export const whoWords = {
  /* A RULE IS SAID AS THE RULE IT IS, by its title in quotation marks: "The rule “Weekly review”". It read "A rule:
     Weekly review", a label and a colon opening the line (audit of 31 October, A18). One of his imported rules, whose
     own name is a code, is already a sentence and is said as it is. */
  rule: (name: string): string =>
    name.trim().toLowerCase() === 'ladder' ? 'The trust rule' : name.trim() === nameWords.importedRule ? name.trim() : `The rule “${name.trim()}”`,
  /* A RULE INSIDE A SENTENCE, by its title in quotation marks, since a rule's title is a sentence of its own: "The rule
     “Chase late payments” closed it". */
  ruleIn: (name: string): string => (name.trim().toLowerCase() === 'ladder' ? 'The trust rule' : `The rule “${name.trim()}”`),
  /* A QUESTION A RULE ASKED THAT WAS ANSWERED IN THE SAME MOMENT is one line, and says both: "The rule “Categorise what
     cleared” asked, BrainDog decided it". The second half keeps its own sentence, its "You" in lower case mid-line. */
  askedThen: (asker: string, rest: string): string => `${asker} asked, ${rest.startsWith('You ') ? `you ${rest.slice(4)}` : rest}`,
  /* WHO DID IT AND WHAT, where the line's title already said what was done (`lineSaid`'s `done`): "BrainDog closed it",
     and not "A rule: Handled · closed". A verb with its own object ("gave access") takes no "it". */
  did: (who: string, done: string): string => {
    const verb = done.trim();
    if (/\s/u.test(verb)) return `${who} ${verb}`;
    /* A QUESTION IS ASKED ABOUT WHAT IT NAMES: "The rule … asked about it", never "asked it". */
    return verb === 'asked' ? `${who} asked about it` : `${who} ${verb} it`;
  },
} as const;

/**
 * A PERSON REACHES THIS SCREEN AS A TARGET IN TWO SPELLINGS, and the second one is not a typo.
 *
 * `invite` and `removeMember` write `target = <person id>` with `target_kind = 'member'`
 * (`packages/kernel/src/members.ts`, the `event` helper). The founding owner's own grant, the one
 * `createRecord` writes so that every record's log says how its owner got there, writes
 * `target = person:<person id>` with `target_kind = 'person'`
 * (`packages/kernel/src/provision.ts:132`). Both were measured on the driven record: seven of the
 * first shape and one of the second.
 *
 * `AuditEvent` carries neither `target_kind` nor `field`, so the shape of the string is all this
 * screen has to go on. That is enough, because a `p_` id is unambiguous: `30 §3` closes the actor
 * grammar and no row, page or governance id can be spelt like one.
 */
const PERSON_TARGET = /^(?:person:)?(p_[0-9A-Z]{20,})$/u;

/** The person a target names, or `null` when the target is a row, a page, a key or a governance id. */
export const personIn = (target: string): string | null => PERSON_TARGET.exec(target)?.[1] ?? null;

/** What this screen says about one person: the words, and whether the record actually knew them. */
export type Said = {
  /** The words the column prints. Never an id. */
  name: string;
  /** True when this is the reader, which is what draws their own face differently. */
  you: boolean;
  /** True when the subject is a person at all, as opposed to a rule, an agent, the assistant or the record itself. */
  person: boolean;
  /** What acted, as `actor` says it, which is what `Face` draws: a rule its glyph, an agent its face. */
  kind: ActorKind;
};

/** `actor`'s answer as this screen holds it. */
function saidOf(by: string, me: string | null, names: ReadonlyMap<string, string>, run_by: RunBy | null = null): Said {
  const said = actor(by, me, names, run_by);
  const you = said.kind === 'you';
  return { name: said.name, you, person: you || said.kind === 'person', kind: said.kind };
}

/**
 * A ROW'S LEAD AND A FILTER CHIP STAND ALONE, SO THEY START WITH A CAPITAL, which is what the
 * `named` helper in the page was for. It was applied to the result of `actorOf` and therefore to
 * person ids as well, which is how `P_01M…` got onto the screen. Here it is applied only to the
 * branch it was written for: an actor that is not a person.
 */
const lead = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Who wrote the line, for the actor column and the `by` filter.
 *
 * `by` IS ALREADY `actorFor`'s ANSWER: `news-live.ts` turns the reader's own id into `you` before
 * the screen sees it, and `actor` takes `you` as itself, so the sample and a live record go through
 * one call.
 *
 * `run_by` IS THE LINE'S OWN (`AuditEvent.run_by`), so a run reads as the app it ran in ("Claude Code") where the record
 * said which, and "An agent" where it did not. `actor` reads it for a run's handle and for nobody else.
 */
export function actorSaid(by: string, me: string | null, names: ReadonlyMap<string, string>, run_by: RunBy | null = null): Said {
  const said = saidOf(by, me, names, run_by);
  if (said.person) return said;
  return { ...said, name: said.kind === 'rule' ? whoWords.rule(lead(said.name)) : lead(said.name) };
}

/**
 * WHAT A RULE OR A SCRIPT THAT RAN IS CALLED, bare, for the line that leads with it ("Ran Weekly review"): its name as
 * `actor` says it, without "The rule" around it or "script" after it, since the line says which beside its face.
 */
export function ranName(by: string): string {
  return lead(actor(by).name).replace(/ script$/u, '');
}

/**
 * WHO DID IT, AS A SENTENCE, for a line whose title already says what was done ("Filed 2 payments under Software"): the
 * verb goes after who did it, "You closed it", "BrainDog closed it", "The rule “Chase late payments” closed it". It was
 * the actor's label, a dot and the verb: "A rule: Handled · closed" (recheck of 30 October).
 */
export function didSaid(by: string, me: string | null, names: ReadonlyMap<string, string>, run_by: RunBy | null, done: string): string {
  const said = saidOf(by, me, names, run_by);
  const who = said.kind === 'rule' && said.name !== nameWords.importedRule ? whoWords.ruleIn(lead(said.name)) : said.person ? said.name : lead(said.name);
  return whoWords.did(who, done);
}

/**
 * BRAINDOG IS ONE ACTOR TO A READER however the record signed it: `system`, the seed, and the rules it answers for itself
 * with (`rule:handled`), which `actor` all says "BrainDog".
 */
const isBrainDog = (by: string): boolean => {
  const kind = actor(by).kind;
  return kind === 'system' || kind === 'sample';
};

/** Whether a line signed `by` is one the `by` filter set to `who` keeps: the same actor, or BrainDog under either name. */
export const byMatches = (by: string, who: string): boolean => by === who || (isBrainDog(by) && isBrainDog(who));

/**
 * Who the line is ABOUT, when that is a person rather than a row.
 *
 * `null` for every other target, and the caller then words it as it always did: a row keeps its
 * spoken id, because `19 §2` is explicit that a row has a number you can say out loud, and a page
 * keeps its title.
 */
export function targetSaid(target: string, me: string | null, names: ReadonlyMap<string, string>): Said | null {
  const person = personIn(target);
  return person === null ? null : saidOf(person, me, names);
}

/**
 * WHICH ACTORS THE `by` FILTER CAN HONESTLY OFFER, which is not all of them.
 *
 * The screen's own rule for this bar is that *"a choice appears when there is one to make"*: one
 * actor is a fact about the record and a control over it changes nothing. Saying who by name rather
 * than by id extends that rule rather than breaking it, because two people the record has no name
 * for are said with the same four words. A chip reading "Someone on this record" that filters to
 * one of seven is worse than the mangled id it replaced: the id was useless and looked it, whereas
 * this looks like it means all of them and quietly hides six.
 *
 * SO A CHIP IS DRAWN WHERE THE WORDS PICK OUT ONE ACTOR, and nowhere else. On a record whose people
 * have no names that leaves the record itself, the assistant, the rules and the agents, which are
 * exactly the actors this screen can still tell apart. The chips come back on their own the day
 * anybody sets a name, with no further change here.
 *
 * THE FILTER ITSELF IS UNTOUCHED, and that is deliberate: `19 §5` says what defines which rows you
 * are looking at must be shareable, so a `?by=p_…` somebody already pasted still narrows the log.
 * What is withheld is the offer, not the ability.
 *
 * `runs` IS `runsIn`'s ANSWER, so two runs the record can name apart ("Claude Code", "Codex") are each offered; with
 * none handed over every run is "An agent" and none is, as before.
 */
export function offeredActors(
  all: readonly string[],
  me: string | null,
  names: ReadonlyMap<string, string>,
  runs: ReadonlyMap<string, RunBy> = new Map(),
): string[] {
  /* THE SEED, THE RECORD ITSELF AND BRAINDOG'S OWN RULES ARE ALL SAID "BrainDog" (`actor`), so a live record whose log
     holds two of them offered neither. They are one actor to a reader, so one chip stands for them all (the record's
     own, `system`, where the log holds it) and `byMatches` keeps every one of their lines under it. */
  const own = all.filter(isBrainDog);
  const one = own.includes('system') ? 'system' : own[0];
  const offered = all.filter((by) => !isBrainDog(by) || by === one);
  const seen = new Map<string, number>();
  for (const by of offered) {
    const said = actorSaid(by, me, names, runs.get(by) ?? null).name;
    seen.set(said, (seen.get(said) ?? 0) + 1);
  }
  return offered.filter((by) => seen.get(actorSaid(by, me, names, runs.get(by) ?? null).name) === 1);
}

/**
 * WHO EACH RUN IN THE LOG IS, by the handle its lines are signed with, so the `by` filter can say a run as its lines do.
 *
 * The filter holds a handle and no line, so it has no `run_by` of its own to read: this is the one the run's lines
 * carry. A run the record sent nothing for is left out, and reads "An agent" in the filter as it does on the line. Two
 * runs of one app are said alike, so `offeredActors` offers neither, as it does two people with no name.
 */
export function runsIn(events: readonly AuditEvent[]): Map<string, RunBy> {
  const runs = new Map<string, RunBy>();
  for (const e of events) if (e.run_by && !runs.has(e.by)) runs.set(e.by, e.run_by);
  return runs;
}
