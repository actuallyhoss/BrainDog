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
 *   3. Nobody signed in, and the address is new here. The person is made, with the name the page sent if it sent
 *      one, put on the record and given a session, and the page asks them to add a passkey so they can come back.
 *
 * NOTHING HERE LOGS, and nothing is mailed. The token is in one request body and nowhere else.
 *
 * NO VALUE IS IMPORTED FROM `auth.ts`, which imports this file, for the reason `device.ts` gives.
 */

import type { Auth, AuthResult, Methods, Refusal, Result, Who } from '@braindog/ports';

import type { AuthRoute } from './auth.ts';
import { httpStatus } from './index.ts';

/** The one flow. It is not an `AuthCall`: the Directory hears only the calls it already knows. */
export type InviteFlow = 'invite';

/** The route, as data, appended to `AUTH_ROUTES`. */
export const INVITE_ROUTES: readonly AuthRoute[] = [
  { path: '/auth/invite', method: 'POST', flow: 'invite', on: 'both', needs: 'nothing', what: 'An invitation link, looked at or accepted: the person signed in, then put on the record it names.' },
];

/** The host's half: the record the token names, and the Directory. In process on the self-host. */
export type InviteDoor = {
  /** The live invitation behind a token: the address it is for, and when it runs out. */
  look(token: string): Promise<Result<{ email: string; expires_at: string }>>;
  /** Spend it for a verified person, and give them the record in the Directory. */
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
   symbol by category but a blank cell on every screen. The audit stored five of these as names. */
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
/* A JOINER IS SPELLING ONLY WHERE A SCRIPT SPELLS WITH IT. The exemption above was for every script, so the audit
   stored `Bob\u200cSmith` and `a`, 98 joiners and `b` (`loop/research-batch-sixteen-audit.md` finding 6). A joiner is
   kept after a letter or mark of a script that writes with one (Script_Extensions, so an Arabic vowel mark counts as
   Arabic), or as ZWJ between two emoji, which is how a family or the rainbow flag is written. Each joiner must follow
   one of those itself, so a second joiner in a row follows a joiner and is refused: no script needs a run of them. */
const JOINS_WITH = String.raw`[\p{scx=Arabic}\p{scx=Syriac}\p{scx=Nko}\p{scx=Mongolian}\p{scx=Devanagari}\p{scx=Bengali}\p{scx=Gurmukhi}\p{scx=Gujarati}\p{scx=Oriya}\p{scx=Tamil}\p{scx=Telugu}\p{scx=Kannada}\p{scx=Malayalam}\p{scx=Sinhala}\p{scx=Khmer}\p{scx=Myanmar}]`;
const JOINER_SPELLING = new RegExp(
  String.raw`(?<=${JOINS_WITH})[\u200c\u200d]|(?<=[\p{Extended_Pictographic}\p{Emoji_Modifier}\ufe0f])\u200d(?=\p{Extended_Pictographic})`,
  'gv',
);
/* WHAT IS VISIBLE AND STILL NO NAME (finding 7). A mark with no letter under it, at the start or after a space, draws
   a floating accent. A run of more than `MARKS_MAX` marks is the audit's letter carrying 99 of them, and a variation
   selector is a mark too, so the same run refuses 90 of those. The longest run in the names
   `invite-names-drawn.test.ts` keeps is three, a Tibetan stack, but a Burmese syllable such as `ချွှေး` carries five
   (every sign after the first letter is a mark), so six is the tightest bound that keeps it. Private use draws
   whatever one font chose, or a box. A noncharacter is not text at all. */
const MARKS_MAX = 6;
const NOISE = new RegExp(String.raw`(?:^|\p{White_Space})\p{M}|\p{M}{${MARKS_MAX + 1}}|[\p{Co}\p{Noncharacter_Code_Point}]`, 'u');
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
 * character (NUL, CR, LF, BEL, ESC, tab, DEL, C1), a bidi control (an override makes the stored `Bo nimda` draw as `Bo admin`), an
 * invisible character between two visible ones, a joiner outside the scripts and emoji that spell with one, a mark
 * with no letter under it or more than `MARKS_MAX` in a row, private use, a noncharacter, a lone surrogate (stored as
 * U+FFFD), and more than `NAME_MAX`. The one thing cleaned inside is a run of spaces, which draws as a gap between
 * the words the person typed and hides nothing, so it becomes one space as the edges already become none.
 *
 * `NAME_MAX` IS 100 CODE POINTS. A person's name needs far less, and the audit's 60,000-character name would have
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
  return { ok: true, value: name.replace(SPACE_RUN, '$1') };
}

/** The part of a host's `AuthDoor` this route reads. */
type Door = { on: 'selfhost' | 'worker'; ip: string; auth: Auth; invite?: InviteDoor | undefined };

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

/** What the page is told before anybody accepts: the address, when it runs out, and who is signed in. */
export type InviteSeen = { email: string; expires_at: string; signedInAs: string | null };

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
  const { email, expires_at } = found.value;

  const seen = sid === undefined ? null : await door.auth({ flow: 'session', sid });
  const live = seen !== null && seen.status === 200 ? (seen as Extract<AuthResult, { status: 200 }>) : null;
  const who = live ? (live.body as Who) : null;

  if (body.accept !== true) {
    const value: InviteSeen = { email, expires_at, signedInAs: who?.email ?? null };
    return live ? finish({ ...live, body: value }) : reply(200, { ok: true, value });
  }

  /* 1. SIGNED IN: the address is the invitation's or nothing happens, and the link is not spent. */
  if (live && who) {
    if (who.email.toLowerCase() !== email.toLowerCase())
      return refusal(403, { code: 'FORBIDDEN', fix: 'This invitation is for another address. Sign out, then open the link again.', at: 'email' });
    const out = await invite.accept(token, { id: who.person, email: who.email });
    if (!out.ok) return reply(httpStatus(out), out);
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

  /* THE NAME IS READ HERE AND NOWHERE EARLIER, because path 3 is the only one that makes a person, and it is refused
     before the person is made and before the link is spent, so a refused name costs the person a retry and nothing
     else. */
  const asked = personName(body.name);
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
