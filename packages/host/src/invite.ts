/**
 * Opening an invitation link: `POST /auth/invite`. `12 §3`, `30 §5`.
 *
 * THE LINK IS `<origin>/invite#<token>`, and the token lives in the fragment, as a sign-in link's does, so it never
 * reaches a server log, a proxy or a `Referer`. The page reads the fragment, clears it, and posts the token here.
 *
 * THREE WAYS THROUGH, and which one is decided by who is already here:
 *
 *   1. Somebody signed in. Their address must be the invitation's, and they go on the record.
 *   2. Nobody signed in, and the address already has a sign-in on this host. They sign in first and open the link
 *      again, because a link that signed somebody in as an existing person would be a way into their other records.
 *   3. Nobody signed in, and the address is new here. The address proves it is somebody's own mailbox first: the
 *      accept answers `202 { proving: true, to }` and a link is mailed to the invited address. That link opens this
 *      page again with the proof beside the invitation, and accepting with both makes the person, with the name the
 *      page sent when it asked, puts them on the record and gives them a session. The page then asks them to add a
 *      passkey so they can come back.
 *
 * PATH 3 MADE THE PERSON AT ONCE, AND THAT WAS AN ACCOUNT IN SOMEBODY ELSE'S NAME. Whoever held the link typed a name
 * and became the person at the invited address, so a forwarded or leaked invitation signed a stranger in as the
 * invitee. A host that cannot send mail cannot prove anything, so it says so in one
 * sentence and makes nobody.
 *
 * NOTHING HERE LOGS. The invitation is in request bodies and in the one mail that proves the address, and nowhere else.
 *
 * NO VALUE IS IMPORTED FROM `auth.ts`, which imports this file, for the reason `device.ts` gives.
 */

import type { Auth, AuthBodies, AuthResult, Methods, Refusal, Result, Who } from '@braindog/ports';
import type { Level } from '@braindog/record';

import type { AuthDoor, AuthRoute } from './auth.ts';
import { httpStatus } from './index.ts';

/** The one flow. It is not an `AuthCall`: the Directory hears only the calls it already knows. */
export type InviteFlow = 'invite';

/** The route, as data, appended to `AUTH_ROUTES`. */
export const INVITE_ROUTES: readonly AuthRoute[] = [
  { path: '/auth/invite', method: 'POST', flow: 'invite', on: 'both', needs: 'nothing', what: 'An invitation link, looked at or accepted: the person signed in, then put on the BrainDog it names.' },
];

/** The host's half: the record the token names, and the Directory. In process on the self-host. */
export type InviteDoor = {
  /** The live invitation behind a token: the address it is for, when it runs out, and what it opens. */
  look(token: string): Promise<Result<InviteLook>>;
  /**
   * Spend it for a verified person, and give them the record in the Directory.
   *
   * `{ slug }` OF THE RECORD JOINED, WHERE A HOST HOLDS MORE THAN ONE, and a signed-in person's session is moved
   * onto it. The Worker answers it; the self-host holds one record, so there is nowhere else a session could be,
   * and it answers what it always did.
   */
  accept(token: string, person: { id: string; email: string; name?: string }): Promise<Result<unknown>>;
  /** Whether this address can already sign in here, and so must, before a link is spent for it. */
  known(email: string): Promise<boolean>;
  /**
   * The Directory's person for a new address, made now, under the name the page sent if it sent one.
   *
   * THE NAME REACHES THE ROW ONLY WHERE THE ROW IS BEING MADE. `person$` returns the row it finds before it
   * looks at the name it was handed (`packages/record/src/directory.ts:650`), so every later invitation for the
   * same address is a lookup and the name on it is dropped. Measured against a real Directory: somebody who has
   * since named themselves keeps their name, and somebody still unnamed is left unnamed rather than named by
   * whatever a second invitation typed. An invitation is somebody else's typing about a person, so a name that
   * arrives after the row exists is not written here at all.
   */
  person(email: string, name?: string): Promise<Result<{ id: string; email: string; name?: string | null }>>;
};

/** The longest name `personName` takes, in code points. */
export const NAME_MAX = 100;

/* WHAT DRAWS NOTHING: white space, every Default_Ignorable_Code_Point (the zero-width space, the word joiner, both
   Hangul fillers, the soft hyphen, the byte order mark), every format character, and the braille blank, which is a
   symbol by category but a blank cell on every screen. Five of these were once stored as names. */
const DRAWS_NOTHING = String.raw`[\p{White_Space}\p{Default_Ignorable_Code_Point}\p{Cf}\u2800]`;
/* LESS WHAT A SCRIPT SPELLS WITH: ZWNJ and ZWJ, which are spelling in Persian and the Indic scripts, and the
   variation selectors, which choose a glyph. Trimmed off the edges, these would cut the last letter off a
   Malayalam chillu. */
const SPELLS_WITH = String.raw`[\u200C\u200D\uFE00-\uFE0F\u{E0100}-\u{E01EF}]`;
const INVISIBLE = new RegExp(DRAWS_NOTHING, 'gv');
const EDGE = `[${DRAWS_NOTHING}--${SPELLS_WITH}]`;
const INVISIBLE_EDGE = new RegExp(`^${EDGE}+|${EDGE}+$`, 'gv');
/* AND WHAT MAY NOT SIT INSIDE A NAME. White space between words is a name; a zero-width space or a filler between
   them is two names drawn as one, or a gap nobody can see is there. */
const INVISIBLE_INSIDE = new RegExp(String.raw`[[\p{Default_Ignorable_Code_Point}\p{Cf}\u2800]--${SPELLS_WITH}]`, 'v');
/* A JOINER IS SPELLING ONLY WHERE A SCRIPT SPELLS WITH IT. The exemption above was for every script, so a probe
   stored `Bob\u200cSmith` and `a`, 98 joiners and `b`. A joiner is
   kept after a letter or mark of a script that writes with one (Script_Extensions, so an Arabic vowel mark counts as
   Arabic), or as ZWJ between two emoji, which is how a family or the rainbow flag is written. Each joiner must follow
   one of those itself, so a second joiner in a row follows a joiner and is refused: no script needs a run of them.
   ADLAM AND HANIFI ROHINGYA ARE ON IT TOO. Both are cursive scripts with living users (Fula, Rohingya), a joiner is
   spelling there as it is in Arabic, and leaving them off newly refused `\u{1E900}\u200d\u{1E901}`.
   THE SCRIPT ASKED IS THE BASE LETTER'S, NOT THE MARK'S. Asking the character just before the joiner let one borrowed
   mark stand in for a script: `Bob`, one haraka, ZWNJ, `Smith` passed as Arabic, a candrabindu as Devanagari, and once
   Adlam was on the list an Adlam mark as Adlam, three ways to split a Latin name unseen.
   The lookbehind now steps back over every mark to the letter under
   them and asks that letter, so a Persian `\u0645\u0650` or a Malayalam chillu keeps its joiner and `b` with a haraka does not.
   It does not step over a joiner, so a mark after a joiner has no base and cannot carry a second one. */
const JOINS_WITH = String.raw`[\p{scx=Arabic}\p{scx=Syriac}\p{scx=Nko}\p{scx=Adlam}\p{scx=Hanifi_Rohingya}\p{scx=Mongolian}\p{scx=Devanagari}\p{scx=Bengali}\p{scx=Gurmukhi}\p{scx=Gujarati}\p{scx=Oriya}\p{scx=Tamil}\p{scx=Telugu}\p{scx=Kannada}\p{scx=Malayalam}\p{scx=Sinhala}\p{scx=Khmer}\p{scx=Myanmar}]`;
const JOINER_SPELLING = new RegExp(
  String.raw`(?<=[${JOINS_WITH}--\p{M}]\p{M}*)[\u200c\u200d]|(?<=[\p{Extended_Pictographic}\p{Emoji_Modifier}\ufe0f])\u200d(?=\p{Extended_Pictographic})`,
  'gv',
);
/* WHAT IS VISIBLE AND STILL NO NAME. A mark with no letter under it, at the start or after a space, draws
   a floating accent. A run of more than `MARKS_MAX` marks is the probe's letter carrying 99 of them, and a variation
   selector is a mark too, so the same run refuses 90 of those. The longest run in the names
   `invite-names-drawn.test.ts` keeps is three, a Tibetan stack, but a Burmese syllable such as `ချွှေး` carries five
   (every sign after the first letter is a mark), so six is the tightest bound that keeps it. Private use draws
   whatever one font chose, or a box. A noncharacter is not text at all.
   THE RUN IS COUNTED THROUGH A JOINER. `\p{M}{7}` alone ended the run at a joiner, and a joiner is kept after any mark
   of a joining script, so a ZWJ after every sixth candrabindu stored one Devanagari letter carrying 84 of them, 99
   code points, and a ZWNJ every sixth haraka did the same in Arabic. A joiner between two marks now counts as nothing, so the bound is marks per letter. One joiner is enough to
   step over, because a second in a row is already refused above. */
const MARKS_MAX = 6;
const NOISE = new RegExp(
  String.raw`(?:^|\p{White_Space})\p{M}|\p{M}(?:[\u200c\u200d]?\p{M}){${MARKS_MAX}}|[\p{Co}\p{Noncharacter_Code_Point}]`,
  'u',
);
/* A RUN OF WHITE SPACE IS ONE, AND THE FIRST OF THE RUN IS THE ONE KEPT, so a Japanese name keeps its ideographic
   space. Run after the controls are refused, because a tab and a line feed are white space too. */
const SPACE_RUN = /(\p{White_Space})\p{White_Space}+/gu;

/**
 * The name a person typed for themselves: `null` for none, or refused with `VALUE_MALFORMED` at `name`.
 *
 * NOTHING VISIBLE IS NO NAME, as spaces already were: the column is NULL for everybody invited by address alone, a
 * screen asks it "is there a name" before it draws one, and `String.prototype.trim` left `\u200B`, `\u2060`,
 * `\u3164` and `\u2800` in place, so five invisible names answered yes and drew nothing. Anything that is not a
 * string is a page sending the wrong shape, which is not a name either.
 *
 * SOMETHING VISIBLE AND SOMETHING DANGEROUS IS REFUSED, NOT CLEANED. `node:sqlite` stored `Bo\u0000Tanner` as `Bo`
 * at the bind, and nobody was told; cleaning here would be the same silence one layer up. Refused: a control
 * character (NUL, CR, LF, BEL, ESC, tab, DEL), a bidi control (an override makes the stored `Bo nimda` draw as `Bo admin`), an
 * invisible character between two visible ones, a joiner outside the scripts and emoji that spell with one, a mark
 * with no letter under it or more than `MARKS_MAX` in a row, private use, a noncharacter, a lone surrogate (stored as
 * U+FFFD), and more than `NAME_MAX`. The one thing cleaned inside is a run of spaces, which draws as a gap between
 * the words the person typed and hides nothing, so it becomes one space as the edges already become none.
 *
 * `NAME_MAX` IS 100 CODE POINTS. A person's name needs far less, and a probe's 60,000-character name would have
 * been the passkey chooser's `displayName` (`packages/record/src/identity.ts:413`). Code points and not UTF-16
 * units, so a name in an astral script is not refused at half the length of one in Latin.
 */
export function personName(raw: unknown): Result<string | null> {
  if (typeof raw !== 'string') return { ok: true, value: null };
  const malformed = (fix: string): Result<string | null> => ({ ok: false, refusal: { code: 'VALUE_MALFORMED', fix, at: 'name' } });
  if (!raw.isWellFormed()) return malformed('That name has a broken character in it. Type it again.');
  const name = raw.replace(INVISIBLE_EDGE, '');
  if (name.replace(INVISIBLE, '') === '') return { ok: true, value: null };
  if ([...name].length > NAME_MAX) return malformed(`A name is at most ${NAME_MAX} characters.`);
  /* `\p{Zl}` AND `\p{Zp}` BESIDE THE CONTROLS: U+2028 and U+2029 are white space, not controls, and a check for
     `\p{Cc}` alone stored `Bo Tanner` as a name drawn on two lines. */
  if (/[\p{Cc}\p{Zl}\p{Zp}\p{Bidi_Control}]/u.test(name) || INVISIBLE_INSIDE.test(name) || /[\u200C\u200D]/.test(name.replace(JOINER_SPELLING, '')))
    return malformed('That name has a hidden character in it, such as a line break or a direction mark. Type it again without it.');
  if (NOISE.test(name)) return malformed('That name has a character in it that draws no letter, such as an accent on its own. Type it again without it.');
  /* A NAME NOBODY TYPED IS REFUSED, NOT STORED: a form filled from a template stored
     `{{first_name}} {{last_name}}` as a person's name, and every place the name is drawn said it for good. A merge
     field is a doubled bracket around a word, `${first}`, `*|FNAME|*` or `%FIRST_NAME%`; a single bracket inside a
     name stays a name. */
  if (/[\p{Ps}]{2}[^\p{Ps}\p{Pe}]*[\p{Pe}]{2}/u.test(name) || /\$\{[^}]*\}/u.test(name) || /\*\|[^|]*\|\*/u.test(name) || /%[\p{L}_]+%/u.test(name))
    return malformed('That name is a template field nobody filled in, such as {{first_name}}. Type the name itself.');
  return { ok: true, value: name.replace(SPACE_RUN, '$1') };
}

/**
 * The part of a host's `AuthDoor` this route reads.
 *
 * `origin` AND `mail` ARE FOR PATH 3 ALONE: the proof is mailed as a link to this origin's invitation page. A door
 * with no `mail` proves nothing, and path 3 answers `NO_MAIL`.
 */
type Door = { on: 'selfhost' | 'worker'; origin: string; ip: string; auth: Auth; invite?: InviteDoor | undefined; mail?: AuthDoor['mail'] };

/** What path 3 says on a host that cannot send mail, whose Directory therefore proves no address. */
export const NO_MAIL =
  'This BrainDog cannot send mail, so a new address cannot be proved here. Ask the owner to invite an address that can already sign in.';

/** What a proof that is spent, run out, or minted for another invitation or address is told. */
const PROOF_GONE = 'That link from your mail has been used, has run out, or is for another invitation. Accept again to be sent a new one.';

/**
 * The page a proof is mailed to: the invitation's own page, with the invitation and the proof in the fragment.
 *
 * BOTH IN THE FRAGMENT, for the reason the invitation link keeps its token there: a fragment never reaches a server,
 * a log or a link scanner's request. The page reads the two, clears the address, and posts them together on a press.
 * `&proof=` cannot appear inside either value, which are base64url.
 */
const proofLink = (origin: string, inviteToken: string, proof: string): string => `${origin}/invite#${inviteToken}&proof=${proof}`;

type Header = readonly [string, string];

const HEADERS: readonly Header[] = [
  ['content-type', 'application/json; charset=utf-8'],
  ['cache-control', 'no-store'],
  ['x-content-type-options', 'nosniff'],
];

function reply(status: number, payload: object): Response {
  const headers = new Headers();
  for (const [k, v] of HEADERS) headers.append(k, v);
  return new Response(JSON.stringify(payload), { status, headers });
}

const refusal = (status: number, refused: Refusal): Response => reply(status, { ok: false, refusal: refused });

/** The slug an `accept` answered, or `null` for a host that answered none. */
function joinedSlug(value: unknown): string | null {
  const slug = typeof value === 'object' && value !== null ? (value as { slug?: unknown }).slug : undefined;
  return typeof slug === 'string' && slug !== '' ? slug : null;
}

/**
 * What the record answers about a link before anybody accepts it: `acceptInvite({ token })` with no person.
 *
 * WHAT IT OPENS, SAID BEFORE THE PRESS. The page could say only the address and the date, so somebody accepted a record
 * they could not name, at a level they had not been told, and found out what they held by opening it. `record` is the
 * record's own name, `null` for one never named; `level` is what the link gives on the whole record, `null` where it
 * gives named lists alone; `lists` is each list it gives something on, by the list's name, with the level there; and
 * `shared` is what is shared with the address, in sentences.
 *
 * THE THREE ARE OPTIONAL HERE AND ONLY HERE. A record older than them answers the address and the date alone, and on the
 * Worker that answer crosses an RPC whose type is a cast, so this type says what can arrive and `InviteSeen` says what
 * the page is always sent.
 */
export type InviteLook = {
  email: string;
  expires_at: string;
  record?: string | null;
  level?: Level | null;
  lists?: { id: string; name: string; level: Level }[];
  /**
   * WHAT IS SHARED WITH THE ADDRESS, said from the share's own sentences: "Ada shared Pottery with you.
   * You can edit tasks in Pottery until 1 Dec." Names, never ids. `null` or absent when nothing is shared with it.
   */
  shared?: string | null;
  /** Who made the invitation, by name, or `null`/absent for a record older than it or a person it holds no name for. */
  by?: string | null;
};

/** What the page is told before anybody accepts: the address, when it runs out, what it opens, and who is signed in. */
export type InviteSeen = {
  email: string;
  expires_at: string;
  record: string | null;
  level: Level | null;
  lists: { id: string; name: string; level: Level }[];
  shared: string | null;
  by: string | null;
  signedInAs: string | null;
};

/**
 * The page's answer, built field by field from the record's.
 *
 * WHAT AN OLDER RECORD LEFT OUT IS SENT AS ITS EMPTY VALUE, never as a key that is not there, which the page would read
 * as `undefined` and draw as a record with no name.
 */
function seenOf(look: InviteLook, signedInAs: string | null): InviteSeen {
  return {
    email: look.email,
    expires_at: look.expires_at,
    record: look.record ?? null,
    level: look.level ?? null,
    lists: look.lists ?? [],
    shared: typeof look.shared === 'string' && look.shared !== '' ? look.shared : null,
    by: typeof look.by === 'string' && look.by !== '' ? look.by : null,
    signedInAs,
  };
}

/**
 * Answer `/auth/invite`. `serveAuth` has matched the route, checked the origin and read the body, and has already
 * turned away a host that holds no sessions.
 *
 * `finish` IS `serveAuth`'s OWN ANSWER, so a session this sets, or rotates, reaches the cookie by the one path every
 * other sign-in does. `{ accept: true }` accepts; anything else only looks.
 */
export async function serveInvite(
  body: Record<string, unknown>,
  sid: string | undefined,
  door: Door,
  finish: (out: AuthResult) => Response,
): Promise<Response> {
  const invite = door.invite;
  if (!invite) return refusal(404, { code: 'ROUTE_UNKNOWN', fix: 'This BrainDog does not take invitations.' });

  const token = typeof body.inviteToken === 'string' ? body.inviteToken : '';
  if (!token) return refusal(400, { code: 'REQUIRED_MISSING', fix: 'Open the whole invitation link, as it was sent.', at: 'inviteToken' });

  const found = await invite.look(token);
  if (!found.ok) return reply(httpStatus(found), found);
  const { email } = found.value;

  const seen = sid === undefined ? null : await door.auth({ flow: 'session', sid });
  const live = seen !== null && seen.status === 200 ? (seen as Extract<AuthResult, { status: 200 }>) : null;
  const who = live ? (live.body as Who) : null;

  /* 0. SENT BY MAIL, BY WHOEVER MADE IT (collab pass, 2 Nov). The owner copied the link and sent it himself, and the person
     then joined, waited for a second mail proving their address, and opened that: two hops and a paste. Now the person
     signed in who holds the link (the one the record just handed it to) asks this host to mail it to the address it is
     for, and for an address new here the proof rides inside it, so opening the mail is the proof and Join is one press.
     It mails the invited address and nobody else, which is what path 3a below already does for anybody holding the
     link, so holding the link opens nothing more than it did; a session is asked for so a stranger cannot make it
     mail at all. An address that can already sign in gets the plain link: it signs in first, as path 2 says. */
  if (body.send === true) {
    if (!live || !who) return refusal(401, { code: 'UNAUTHORIZED', fix: 'Sign in to send an invitation.', at: 'session' });
    const send = door.mail;
    if (!send) return refusal(501, { code: 'NOT_IN_THIS_BUILD', fix: NO_MAIL, at: 'email' });
    const vars = { ...(found.value.record ? { record: found.value.record } : {}), ...(found.value.by ? { from: found.value.by } : {}) };
    let link = `${door.origin}/invite#${token}`;
    /* EVERY SEND IS COUNTED AGAINST THE ADDRESS (security pass, 2 Nov), a known one too: the proof flow is what keeps
       the count (`mailKey` in the Directory), and a known address was mailed the plain link without it, so whoever held
       the link could mail somebody who already signs in here thirty times in a row. For a known address the proof
       minted is never sent and opens nothing: path 2 asks them to sign in before any proof is read. */
    const proving = await door.auth({ flow: 'invite.prove', email, invite: token });
    if (proving.status === 404) return refusal(501, { code: 'NOT_IN_THIS_BUILD', fix: NO_MAIL, at: 'email' });
    if (proving.status !== 200) return finish(proving);
    if (!(await invite.known(email))) {
      const mail = proving.mail;
      if (!mail || !('link' in mail)) return reply(503, { ok: false });
      link = proofLink(door.origin, token, mail.link);
    }
    try {
      send(email, link, 'invite.sent', vars);
    } catch {
      /* A failed send is the host's to report; the page says it was sent, and the link is still there to copy. */
    }
    return finish({ ...live, body: { sent: true, to: email } });
  }

  if (body.accept !== true) {
    const value = seenOf(found.value, who?.email ?? null);
    return live ? finish({ ...live, body: value }) : reply(200, { ok: true, value });
  }

  /* 1. SIGNED IN: the address is the invitation's or nothing happens, and the link is not spent. */
  if (live && who) {
    if (who.email.toLowerCase() !== email.toLowerCase())
      return refusal(403, { code: 'FORBIDDEN', fix: 'This invitation is for another address. Sign out, then open the link again.', at: 'email' });
    const out = await invite.accept(token, { id: who.person, email: who.email });
    if (!out.ok) return reply(httpStatus(out), out);
    /* AND THE SESSION MOVES ONTO THE RECORD JUST JOINED, where the host names one. This answered `live` as it was,
       so a colleague who owns a record of their own was told "You are on the record." and `Open BrainDog` opened
       theirs: the session row still named it, and a fresh sign-in picks an owned record first.
       THE ROTATED COOKIE IS CARRIED BACK BY HAND. The `session` call
       above rotates a day-old cookie, and the switch answers no cookie of its own, so an answer built from the
       switch alone left the browser holding an id that dies a minute later (`test/invite-session-move.test.ts`
       went red on exactly that). The switch is sent with the new id as well, though the old one, inside its
       minute of grace, was measured to move the row just the same. A switch the Directory refuses leaves them on
       the record they were on, which is where they were before, and the invitation is spent all the same. */
    const slug = joinedSlug(out.value);
    if (slug !== null) {
      const rotated = live.session !== undefined && live.session !== 'clear' ? live.session : undefined;
      const moved = await door.auth({ flow: 'switch', sid: rotated?.sid ?? sid ?? '', slug });
      if (moved.status === 200) return finish({ ...moved, ...(rotated ? { session: rotated } : {}) });
    }
    return finish({ ...live, body: who });
  }

  /* 2. AN ADDRESS THAT CAN ALREADY SIGN IN HERE signs in first. */
  if (await invite.known(email))
    return refusal(401, { code: 'UNAUTHORIZED', fix: 'You already have a sign-in here. Sign in first, then open this link again.', at: 'session' });

  /* 3. A NEW PERSON, and only where sign-in is on and a second person breaks nothing. On a self-host the server key
     signs in only while one person exists, so an owner with no passkey yet would be locked out by this. */
  const ways = await door.auth({ flow: 'methods' });
  const m = ways.status === 200 ? (ways.body as Methods) : null;
  if (!m?.configured) return refusal(404, { code: 'ROUTE_UNKNOWN', fix: 'This BrainDog does not take invitations.' });
  if (door.on === 'selfhost' && m.key && m.firstRun)
    return refusal(409, {
      code: 'FORBIDDEN',
      fix: 'The owner needs to add a passkey before anybody else can join. Ask them to add one in Settings, then open this link again.',
      at: 'passkey',
    });

  /* 3b. THE PROOF CAME BACK FROM THE MAILBOX, beside the invitation it was minted for. */
  if (typeof body.proof === 'string' && body.proof !== '') return provedThen(body.proof, token, email, door, invite, finish, body.name);

  /* 3a. PROVE THE MAILBOX FIRST. THE NAME IS READ HERE, because path 3 is the only one that makes a person: it is
     refused before anything is mailed, so a refused name costs the person a retry and nothing else, and a name that
     passes is carried in the proof and made with the person when the proof comes back. */
  const send = door.mail;
  if (!send) return refusal(501, { code: 'NOT_IN_THIS_BUILD', fix: NO_MAIL, at: 'email' });
  const asked = personName(body.name);
  if (!asked.ok) return reply(httpStatus(asked), asked);
  const proving = await door.auth({ flow: 'invite.prove', email, invite: token, ...(asked.value ? { name: asked.value } : {}) });
  /* A DIRECTORY THAT SENDS NO MAIL answers the flow as a way in it does not offer, which is this host's own sentence. */
  if (proving.status === 404) return refusal(501, { code: 'NOT_IN_THIS_BUILD', fix: NO_MAIL, at: 'email' });
  if (proving.status !== 200) return finish(proving);
  const mail = proving.mail;
  if (!mail || !('link' in mail)) return reply(503, { ok: false });
  try {
    send(mail.to, proofLink(door.origin, token, mail.link), 'invite.prove');
  } catch {
    /* A failed send is the host's to report, as a sign-in link's is; the page says where the link was sent. */
  }
  return reply(202, { ok: true, value: { proving: true, to: mail.to } });
}

/**
 * Path 3's second half: spend the proof, then make the person, put them on the record and sign them in.
 *
 * THE PROOF IS FOR THIS INVITATION AND THIS ADDRESS, OR IT OPENS NOTHING. The Directory hands back the invitation the
 * proof was minted for and the address it was mailed to; either differing from what the page sent and the link names
 * is one refusal, in the same words as a proof that was spent or ran out. It is spent either way, which costs the
 * person one more mail, and a proof minted for one invitation never opens another.
 */
async function provedThen(proof: string, token: string, email: string, door: Door, invite: InviteDoor, finish: (out: AuthResult) => Response, typed?: unknown): Promise<Response> {
  const spent = await door.auth({ flow: 'invite.proved', token: proof });
  if (spent.status === 401) return refusal(401, { code: 'UNAUTHORIZED', fix: PROOF_GONE, at: 'proof' });
  if (spent.status !== 200) return finish(spent);
  const held = spent.body as AuthBodies['invite.proved'];
  if (held.invite !== token || held.email.toLowerCase() !== email.toLowerCase())
    return refusal(401, { code: 'UNAUTHORIZED', fix: PROOF_GONE, at: 'proof' });

  /* THE NAME TYPED WHEN THE PROOF WAS ASKED FOR, held to the same rule again: the Directory kept it as it was sent,
     and this is the last place it is read before it is somebody's name. */
  /* OR TYPED ON THE PAGE THE MAIL OPENED, where the invitation was mailed by whoever made it and no name was asked before
     the proof (`send` above): the person names themselves there, and only a name the proof did not already carry. */
  const asked = personName(held.name ?? typed);
  if (!asked.ok) return reply(httpStatus(asked), asked);
  const made = await invite.person(email, asked.value ?? undefined);
  if (!made.ok) return reply(httpStatus(made), made);
  /* THE NAME GOES ON TO THE RECORD TOO, because the record's own `person` mirror is what People draws
     (`apps/web/src/lib/record/settings-write.ts:49`), and the Directory's row is one table short of it. This handed
     `accept` only `{ id, email }`, so a name reached `dir_person` and People still drew the address; a real record
     behind the door measured `name: null` on the member row. It is the ROW's name and not the one just typed, so a
     second invitation for somebody who has named themselves carries their name and not a stranger's. */
  const named = made.value.name ?? null;
  const out = await invite.accept(token, { id: made.value.id, email: made.value.email, ...(named ? { name: named } : {}) });
  if (!out.ok) return reply(httpStatus(out), out);

  /* THE SESSION IS A CLAIM LINK SPENT AT ONCE, in the Directory, by the same two calls a provisioned owner's first
     sign-in makes. The claim token goes from one call to the next and is never answered, mailed or logged. */
  const claim = await door.auth({ flow: 'claim.mint', email: made.value.email });
  if (claim.status !== 200 || !claim.mail || !('claimToken' in claim.mail)) return finish(claim);
  return finish(await door.auth({ flow: 'magic.redeem', claimToken: claim.mail.claimToken, ip: door.ip }));
}
