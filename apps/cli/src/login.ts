/**
 * `braindog login <host>`: the device grant from the terminal (`docs/48-SPEC-CLI.md` §5.2 and §5.3, `12 §6.1`).
 *
 * THE BEARER ARRIVES IN ONE ANSWER AND GOES STRAIGHT INTO THE HOSTS FILE. It is never printed and never part of a
 * sentence, a failure's included, because stderr ends up in an agent's logs.
 *
 * THE ADDRESS PRINTED IS THE HOST'S OWN. A `verification_uri` on any other origin is refused before a digit is
 * shown: six digits typed into a page somebody else controls are an approval they can spend.
 */

import { hostname } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';

import { hostKey, inTheClear, readHosts, saveHosts } from './http.ts';

export type LoginIo = {
  /** The hosts file the token is kept in. */
  file: string;
  /** One line to stderr. */
  say: (line: string) => void;
  /** Aborted by Ctrl+C. */
  signal?: AbortSignal | undefined;
  fetch?: typeof globalThis.fetch | undefined;
  /** How this machine is named to the person approving it. */
  label?: string | undefined;
  now?: (() => number) | undefined;
};

/** `48 §4.4`: a refusal, a local failure or a stop is 1, and a host that did not answer is 3. */
const REFUSED = 1;
const UNREACHABLE = 3;

type Answer = { status: number; body: Record<string, unknown> | null; retryAfter: number | null };

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** A number of seconds the host sent, within reason, or the fallback. */
const seconds = (x: unknown, fallback: number, max: number): number =>
  typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.min(x, max) : fallback;

/** A bearer is printable ASCII with no spaces; anything else is not one, whatever the host says. */
const BEARER = /^[\x21-\x7e]{16,1024}$/;

export async function login(raw: string, io: LoginIo): Promise<number> {
  const now = io.now ?? Date.now;
  let key: string;
  try {
    key = hostKey(raw);
  } catch (e) {
    io.say(e instanceof Error ? e.message : 'The BrainDog host is not an address.');
    return REFUSED;
  }
  const url = new URL(key);
  if (inTheClear(url)) {
    io.say(`${key} is http, not https. BrainDog signs in only over https, except on this machine.`);
    return REFUSED;
  }
  const slug = url.pathname.replace(/^\/+/, '');
  const where = slug ? { slug } : {};

  /* READ BEFORE ANYTHING IS ASKED, so a broken hosts file is found before somebody approves a device whose token
     would have nowhere to go. */
  try {
    readHosts(io.file);
  } catch (e) {
    io.say(e instanceof Error ? e.message : `${io.file} could not be read.`);
    return REFUSED;
  }

  const label = (io.label ?? `${hostname()} · braindog-cli`).slice(0, 120);
  const again = `Run braindog login ${key} to start again.`;

  /* A REDIRECT IS REFUSED, not followed: the device routes never send one, and following it would hand the poll id
     to an address nobody chose. */
  const send = async (path: string, body: object): Promise<Answer> => {
    const res = await (io.fetch ?? globalThis.fetch)(`${url.origin}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      redirect: 'error',
      ...(io.signal ? { signal: io.signal } : {}),
    });
    let parsed: unknown = null;
    try {
      parsed = await res.json();
    } catch {
      parsed = null;
    }
    const retry = Number(res.headers.get('retry-after'));
    return { status: res.status, body: isObject(parsed) ? parsed : null, retryAfter: Number.isFinite(retry) && retry > 0 ? retry : null };
  };

  /** The one sentence for an answer that is not a success. The host's own sentence where it sent one. */
  const refusedLine = (answer: Answer): string => {
    if (answer.status === 429)
      return `${key} has had too many sign-ins started from this address. Try again in ${Math.max(1, Math.ceil((answer.retryAfter ?? 900) / 60))} minutes.`;
    const refusal = answer.body?.ok === false && isObject(answer.body.refusal) ? answer.body.refusal : null;
    if (refusal?.code === 'DEVICE_CODE_EXPIRED') return `The code expired before anyone approved it. ${again}`;
    if (refusal?.code === 'DEVICE_CODE_TRIES') return `The request was denied after five wrong codes were typed. ${again}`;
    if (typeof refusal?.fix === 'string' && refusal.fix) return refusal.fix.slice(0, 300);
    return `${key} answered in a way this command does not recognise, so nobody was signed in.`;
  };

  try {
    const started = await send('/auth/device', { ...where, reach: 'login', label });
    const code = started.body?.ok === true && isObject(started.body.value) ? started.body.value : null;
    if (!code) {
      io.say(refusedLine(started));
      return REFUSED;
    }

    const uri = typeof code.verification_uri === 'string' ? code.verification_uri : '';
    let at = '';
    try {
      at = new URL(uri).origin;
    } catch {
      at = '';
    }
    if (at !== url.origin) {
      io.say(`${key} gave an address on another site to approve this at, so no code was shown and nobody was signed in.`);
      return REFUSED;
    }
    const userCode = typeof code.user_code === 'string' && /^\d{6}$/.test(code.user_code) ? code.user_code : '';
    const deviceCode = typeof code.device_code === 'string' && code.device_code.length <= 512 ? code.device_code : '';
    if (!userCode || !deviceCode) {
      io.say(`${key} answered in a way this command does not recognise, so nobody was signed in.`);
      return REFUSED;
    }

    const life = seconds(code.expires_in, 600, 1_800) || 600;
    io.say(`Open ${uri} and enter  ${userCode.slice(0, 3)} ${userCode.slice(3)}   (${Math.max(1, Math.round(life / 60))} minutes)`);

    const deadline = now() + life * 1000;
    let wait = seconds(code.interval, 5, 60);
    for (;;) {
      await delay(wait * 1000, undefined, io.signal ? { signal: io.signal } : {});
      if (now() >= deadline) {
        io.say(`The code expired before anyone approved it. ${again}`);
        return REFUSED;
      }
      const polled = await send('/auth/device/token', { ...where, device_code: deviceCode });
      const value = polled.body?.ok === true && isObject(polled.body.value) ? polled.body.value : null;
      if (!value) {
        io.say(refusedLine(polled));
        return REFUSED;
      }
      if (value.pending === true) {
        /* The reply's interval, so a host that asks for slower polling is obeyed. */
        wait = seconds(value.interval, wait, 60);
        continue;
      }

      const bearer = typeof value.bearer === 'string' && BEARER.test(value.bearer) ? value.bearer : '';
      const expires = typeof value.expires === 'string' && !Number.isNaN(Date.parse(value.expires)) ? value.expires : '';
      if (!bearer || !expires) {
        io.say(`${key} answered in a way this command does not recognise, so nobody was signed in.`);
        return REFUSED;
      }

      /* READ AGAIN, because minutes have passed and another command may have written the file since. */
      try {
        const hosts = readHosts(io.file);
        hosts.hosts[key] = { ...hosts.hosts[key], token: { value: bearer, expires, label } };
        hosts.default = key;
        saveHosts(io.file, hosts);
      } catch {
        io.say(`The device was approved and ${io.file} could not be written, so the token was not kept. ${again}`);
        return REFUSED;
      }
      io.say(`logged in to ${key} as ${label} · token expires ${expires.slice(0, 10)}`);
      return 0;
    }
  } catch {
    if (io.signal?.aborted) {
      io.say('Sign-in was stopped before it finished, and nothing was saved.');
      return REFUSED;
    }
    /* The error could quote the request, and the request holds the poll id. */
    io.say(`${key} did not answer, so nobody was signed in.`);
    return UNREACHABLE;
  }
}
