/**
 * Which of its fourteen states `/signin` is in, from what it has been told. Pure, so every state is
 * reachable in a test without a host, a browser or a passkey.
 *
 * THE SCREEN DRAWS ONLY WAYS THAT CAN ACT. A way the host does not offer, or this browser cannot use,
 * is not in `Ways` at all, so the screen has nothing to grey out (`23 §3.1`).
 */

import type { Failure, Link, Methods, Said, Who } from './auth.ts';

/** What a press asked for. */
export type How = 'passkey' | 'key' | 'send' | 'link' | 'add' | 'out';

/** What the last press is doing, or did. `when` is when its answer came back, for the lockout clock. */
export type Step =
  | { at: 'idle' }
  | { at: 'asking'; how: How }
  | { at: 'failed'; how: How; failure: Failure; when: number }
  | { at: 'sent'; email: string }
  | { at: 'added' }
  | { at: 'out' };

export type Seen = {
  /** `GET /auth/methods`, or `null` while it is out. */
  methods: Said<Methods> | null;
  /** Who a press on this screen signed in, and how, which the methods answer cannot know. */
  entered: { who: Who; via: 'passkey' | 'key' | 'link' } | null;
  /** A link that arrived in the address and has not been spent. */
  link: Link | null;
  step: Step;
  secure: boolean;
  webauthn: boolean;
  now: number;
};

/** The ways in that can act here. `lead` is the one filled button; `null` when none can. */
export type Ways = {
  passkey: boolean;
  magic: boolean;
  key: boolean;
  lead: 'passkey' | 'magic' | 'key' | null;
  /** The server key's block starts open: on first run, or when it is the only way in. */
  keyOpen: boolean;
};

export type State =
  | { name: 'loading' }
  | { name: 'no-host' }
  | { name: 'unreachable' }
  | { name: 'open' }
  | { name: 'not-configured' }
  | { name: 'insecure' }
  | { name: 'signed-out'; ways: Ways | null; note: 'cancelled' | 'unsupported' | 'out' | null }
  | { name: 'asking'; ways: Ways | null; how: How }
  | { name: 'rejected'; ways: Ways | null; fix: string | null; closed: boolean }
  | { name: 'locked'; ways: Ways | null; how: How; minutes: number }
  | { name: 'link-sent'; ways: Ways | null; email: string }
  | { name: 'link-landing'; link: Link; asking: boolean }
  | { name: 'link-expired'; ways: Ways | null; link: Link['kind'] }
  | {
      name: 'signed-in';
      who: Who;
      /** "Add a passkey on this device", and what became of it. `absent` when it cannot act here. */
      add: 'absent' | 'offer' | 'asking' | 'added' | 'cancelled' | 'exists' | 'failed';
      /** Which of the two is the filled button: adding a passkey on first run, opening the app otherwise. */
      lead: 'add' | 'open';
      out: 'idle' | 'asking' | 'failed';
      /**
       * A link that arrived while somebody was in, kept for Sign out to hand to the landing. The address no longer
       * holds it, because `takeLink` clears the fragment before anything else, so this is the only thing on the
       * screen that can say it came.
       */
      link: Link | null;
    };

function waysOf(it: Methods, webauthn: boolean): Ways | null {
  if (!it.passkey && !it.magic && !it.key) return null;
  const first = it.firstRun === true;
  /* No passkey exists yet on first run, so a passkey button could not sign anybody in. */
  const passkey = it.passkey && webauthn && !first;
  const lead = passkey ? 'passkey' : it.key && first ? 'key' : it.magic ? 'magic' : it.key ? 'key' : null;
  return { passkey, magic: it.magic, key: it.key, lead, keyOpen: it.key && (first || lead === 'key') };
}

function signedIn(who: Who, it: Methods, s: Seen): State {
  const step = s.step;
  /* Somebody who just used this device's passkey already has one on it. */
  const can = it.passkey && s.webauthn && s.secure && s.entered?.via !== 'passkey';
  let add: Extract<State, { name: 'signed-in' }>['add'] = can ? 'offer' : 'absent';
  if (can && step.at === 'asking' && step.how === 'add') add = 'asking';
  else if (can && step.at === 'added') add = 'added';
  else if (can && step.at === 'failed' && step.how === 'add')
    add = step.failure.kind === 'cancelled' ? 'cancelled' : step.failure.kind === 'exists' ? 'exists' : 'failed';
  const out = step.at === 'asking' && step.how === 'out' ? 'asking' : step.at === 'failed' && step.how === 'out' ? 'failed' : 'idle';
  const lead = it.firstRun === true && add !== 'absent' && add !== 'added' ? 'add' : 'open';
  return { name: 'signed-in', who, add, lead, out, link: s.link };
}

/** A press that came back without a session, or `null` when its moment has passed. */
function afterFailure(f: Failure, how: How, when: number, s: Seen, ways: Ways | null): State | null {
  switch (f.kind) {
    case 'locked': {
      const left = when + f.retryAfter * 1000 - s.now;
      return left > 0 ? { name: 'locked', ways, how, minutes: Math.ceil(left / 60_000) } : null;
    }
    case 'cancelled':
      return { name: 'signed-out', ways, note: 'cancelled' };
    case 'unsupported':
      return { name: 'signed-out', ways, note: 'unsupported' };
    case 'unreachable':
    case 'no-host':
      return { name: 'unreachable' };
    case 'refused':
    case 'absent':
      if (how === 'link' && s.link) return { name: 'link-expired', ways, link: s.link.kind };
      return { name: 'rejected', ways, fix: f.kind === 'refused' ? f.fix : null, closed: false };
    default:
      return { name: 'rejected', ways, fix: null, closed: f.kind === 'closed' };
  }
}

export function stateOf(s: Seen): State {
  const m = s.methods;
  if (m === null) return { name: 'loading' };
  if (!m.ok) return m.kind === 'no-host' || m.kind === 'absent' ? { name: 'no-host' } : { name: 'unreachable' };
  const it = m.value;

  const who = s.entered?.who ?? it.me;
  if (who) return signedIn(who, it, s);
  if (it.open) return { name: 'open' };
  /* Off a secure context there is no WebAuthn and no cookie, so no way in can finish. The host says the
     same when the origin it serves is one it cannot set a cookie on. */
  if (!s.secure || it.why === 'insecure') return { name: 'insecure' };

  const ways = waysOf(it, s.webauthn);
  const step = s.step;

  if (step.at === 'failed') {
    const after = afterFailure(step.failure, step.how, step.when, s, ways);
    if (after) return after;
  }
  /* `out` LANDS TOO, because a link kept through Sign out is the reason somebody pressed it: the signed-in screen
     said one had arrived and that signing out uses it. Without this the step `leave()` sets drew "You are signed
     out." over the ways in, and the link sat in state with nothing on screen to spend it. */
  if (s.link && (step.at === 'idle' || step.at === 'out' || (step.at === 'asking' && step.how === 'link')))
    return { name: 'link-landing', link: s.link, asking: step.at === 'asking' };
  if (step.at === 'asking') return { name: 'asking', ways, how: step.how };
  if (step.at === 'sent') return { name: 'link-sent', ways, email: step.email };
  if (!ways) return { name: 'not-configured' };
  return { name: 'signed-out', ways, note: step.at === 'out' ? 'out' : ways.lead === null ? 'unsupported' : null };
}
