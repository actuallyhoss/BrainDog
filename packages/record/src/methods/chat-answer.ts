/**
 * A question answered by the person's own press on the decision card inside Claude or ChatGPT: `chatApp`,
 * `chatAnswerMint` and `chatAnswer`, all INTERNAL, which only the MCP door in the host calls (`packages/mcp/src/answer.ts`).
 *
 * AGENTS SUGGEST AND THE PERSON DECIDES, AND NO TOKEN REACHES `decide` (ADR-060). A card in a chat app is drawn by the app
 * from a tool's answer, and its buttons are pressed by the person; the model reads the tool's text and never the card.
 * So the door mints, beside every decision card it draws, a grant the card holds and the model is never shown (it rides
 * in the answer's `_meta`, which both apps hand to the card and keep from the model), and a press sends it back. The
 * grant is the press's only standing: without one the answer path refuses, and tells the model to show the card.
 *
 * ONE GRANT, ONE CARD, ONE PRESS. A grant is sealed with AES-GCM under a key this instance draws and holds in memory
 * (`history-cursor.ts`'s reason: the record has no table for a secret of its own), so it is opaque and nobody can make
 * one. It names the person, the key the chat app holds, the question, the options the card showed and the question's
 * version (a hash of its body and state), and it lapses in fifteen minutes. A press spends it, once; a second press, a
 * grant held by another key, a question that moved or was answered, an option the card did not show, an hour later, or
 * an instance that restarted between the two, is refused, and the card says to answer in BrainDog.
 *
 * ONLY WHERE THE MODEL CANNOT HOLD THE KEY. A grant is minted only for a key a chat app holds after the person signed in
 * to it (`client_kind` `cimd` or `dcr`, at Claude's or ChatGPT's own address): the key lives on the app's servers and the
 * model never sees it. A key on a machine (`device`, `key`) is held where an agent with a shell can read it, and could
 * then ask the door for a grant and press with it, so it is never minted one; its cards keep linking to BrainDog.
 *
 * ONLY WHEN HE TURNED IT ON, AND ONLY FOR WHAT A PRESS MAY DO. The owner's own `agents.answer_in_chat` (Settings > Agents,
 * off until he turns it on); the key's person owns the record; the question is open, one he sees, and a choice of options
 * or a set of rows. A pack, an arrangement, settings, a pattern or a change are installs, which stay a browser session's.
 * The press runs the record's own `decide` as the person (`pressedIn`), so every check a press in the app meets it meets
 * too, and `admin` and `vault` refuse it. The decision then keeps where it was pressed (`answeredIn`): History says
 * "Answered in Claude, on the card."
 */

import { costRows, pickCost } from '@braindog/kernel';
import { ok, type Result } from '@braindog/ports';

import type { CallContext } from '../index.ts';
import type { RecordDeps } from './index.ts';

/** How long a card's grant answers a press: fifteen minutes from the card being drawn. */
export const GRANT_FOR = 15 * 60_000;

/** The prefix every grant carries, so a grant from a later shape is told apart rather than misread. */
const PREFIX = 'ca1.';

/** The kinds of question a press may answer: a choice among options, or a set of rows. Everything else installs. */
const PRESSABLE = new Set(['options', 'rowset']);

/** What a rowset question takes besides its own two: a merge question's answers (`mergeAnswer` in `index.ts`). */
const ROWSET_ANSWERS = new Set(['accept', 'reject', 'merge', 'apart']);

/** The words each of a rowset's answers is said in, as Decide says them. */
const ROWSET_SAID: Record<string, string> = { accept: 'Accept', reject: 'Decline', merge: 'Merge them', apart: 'Keep apart' };

/** What the door is answered when it asks for a card's grant. `hard` is the options a press must make twice. */
export type Minted = { grant: string; until: string; app: string; hard: string[] };

/** What a press answers: the decision it made, what was chosen, and the line the card says. */
export type Pressed = { decision: string | null; question: string; option: string; app: string; said: string };

/** What a grant holds once opened. */
type Grant = { p: string; t: string; d: string; o: string[]; v: string; x: number; j: string };

const toBase64url = (bytes: Uint8Array): string => {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');
};

const fromBase64url = (text: string): Uint8Array<ArrayBuffer> | null => {
  if (!/^[A-Za-z0-9_-]+$/u.test(text)) return null;
  try {
    const bin = atob(text.replace(/-/gu, '+').replace(/_/gu, '/'));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
};

const NONCE = 12;

/**
 * The chat app a key is held by, from the address the door proved for it (`token.host`, `packages/host/src/oauth.ts`
 * `sourceOf`), or `null` for any other: a key on a machine, an app on the person's own computer, or an app of an address
 * this does not name. Only these two draw a card a person presses.
 */
export function appOf(kind: string | null, host: string | null): string | null {
  if ((kind !== 'cimd' && kind !== 'dcr') || host === null) return null;
  const h = host.toLowerCase().replace(/:\d+$/u, '');
  const at = (d: string): boolean => h === d || h.endsWith(`.${d}`);
  if (at('claude.ai') || at('claude.com')) return 'Claude';
  if (at('chatgpt.com') || at('openai.com')) return 'ChatGPT';
  return null;
}

type Typed<T> = Result<T>;

/* A SYMMETRIC KEY, SAID TO THE TYPES, for `history-cursor.ts`'s reason: the Workers types read `generateKey` wider. */
type Key = Awaited<ReturnType<typeof crypto.subtle.importKey>>;

export function methods(deps: RecordDeps) {
  const { kernel, sql, scoped, sightOf, no, tail, clock } = deps;

  /* THIS INSTANCE'S KEY, drawn on the first card and held in memory for as long as the instance lives. */
  let keyOf: Promise<Key> | null = null;
  const key = (): Promise<Key> => (keyOf ??= crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']) as Promise<Key>);

  /** The grants already pressed, until each would have lapsed anyway. */
  const spent = new Map<string, number>();
  const sweep = (now: number): void => {
    for (const [j, x] of spent) if (x <= now) spent.delete(j);
  };

  async function seal(g: Grant): Promise<string> {
    const iv = crypto.getRandomValues(new Uint8Array(NONCE));
    const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(), new TextEncoder().encode(JSON.stringify(g))));
    const out = new Uint8Array(NONCE + sealed.length);
    out.set(iv);
    out.set(sealed, NONCE);
    return `${PREFIX}${toBase64url(out)}`;
  }

  async function open(text: unknown): Promise<Grant | null> {
    if (typeof text !== 'string' || !text.startsWith(PREFIX) || text.length > 4_000) return null;
    const raw = fromBase64url(text.slice(PREFIX.length));
    if (raw === null || raw.length <= NONCE + 16) return null;
    try {
      const plain = new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.subarray(0, NONCE) }, await key(), raw.subarray(NONCE)));
      const g = JSON.parse(plain) as Grant;
      return typeof g.p === 'string' && typeof g.t === 'string' && typeof g.d === 'string' && Array.isArray(g.o) && typeof g.v === 'string' && typeof g.x === 'number' && typeof g.j === 'string' ? g : null;
    } catch {
      /* Another instance's key, a key lost to a restart, or a byte changed on the way: not a grant this one made. */
      return null;
    }
  }

  /** A question's version: its kind, its body and its state, hashed, so a question that moved is a different one. */
  async function versionOf(row: Record<string, unknown>): Promise<string> {
    const said = JSON.stringify([row.body_kind, row.status, row.body]);
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(said)));
    return toBase64url(hash.subarray(0, 18));
  }

  /** The key's chat app, and why not when it has none. */
  function appFor(ctx: CallContext): string | null {
    if (ctx.principal.kind !== 'token') return null;
    const t = sql.one<{ client_kind: string | null; host: string | null; revoked_at: string | null }>(
      'SELECT client_kind, host, revoked_at FROM token WHERE id = ?',
      ctx.principal.id,
    );
    return t === undefined || t === null || t.revoked_at !== null ? null : appOf(t.client_kind, t.host);
  }

  /** Why this key's person may not press a card now, or `null` when they may: they own the record and turned it on. */
  function personFault(person: string): string | null {
    if (kernel.access(person)?.level !== 'owner') return 'Only an owner answers a question on the card. Answer it in BrainDog.';
    if (kernel.prefsOf(person)['agents.answer_in_chat'] !== true)
      return 'Answering from inside chat apps is off. Turn it on in Settings > Agents, or answer this one in BrainDog.';
    return null;
  }

  /** The answers a press may give this question, from its body and the ones the card shows; empty when none may. */
  function pressable(row: Record<string, unknown>, shown: readonly string[]): string[] {
    const kind = String(row.body_kind ?? '');
    if (!PRESSABLE.has(kind)) return [];
    const body = typeof row.body === 'object' && row.body !== null ? (row.body as Record<string, unknown>) : {};
    if (kind === 'options') {
      const ids = new Set((Array.isArray(body.options) ? body.options : []).flatMap((o) => (typeof o === 'object' && o !== null && typeof (o as { id?: unknown }).id === 'string' ? [(o as { id: string }).id] : [])));
      return [...new Set(shown)].filter((o) => ids.has(o)).sort();
    }
    return [...new Set(shown)].filter((o) => ROWSET_ANSWERS.has(o) || /^pick:\S{1,80}$/u.test(o)).sort();
  }

  /** The words one answer is said in on the card, as the question names it. */
  function labelOf(row: Record<string, unknown>, option: string): string {
    const body = typeof row.body === 'object' && row.body !== null ? (row.body as Record<string, unknown>) : {};
    const own = (Array.isArray(body.options) ? body.options : []).find((o) => typeof o === 'object' && o !== null && (o as { id?: unknown }).id === option) as
      | { label?: unknown }
      | undefined;
    if (typeof own?.label === 'string' && own.label.trim() !== '') return own.label.trim();
    return ROWSET_SAID[option] ?? (option.startsWith('pick:') ? 'That one' : option);
  }

  /** The option a pick is weighed as: a merge or a pick accepts, keeping apart declines. */
  const weighedAs = (kind: string, option: string): string =>
    kind !== 'rowset' ? option : option === 'apart' || option === 'reject' ? 'reject' : 'accept';

  return {
    /**
     * Which chat app holds the caller's key, when it is one a card may be pressed in: the door asks it before it lists
     * `answer`, so a key on a machine is never shown the tool. It says nothing of the switch, which may be turned on after
     * the list is kept. INTERNAL, as the other two.
     */
    async chatApp(_args: unknown, ctx: CallContext): Promise<Typed<{ app: string }>> {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false, refusal: stop };
      const app = appFor(ctx);
      return app === null ? no('FORBIDDEN', 'Only Claude or ChatGPT, signed in to BrainDog, carries a card you can answer in.', { at: 'principal' }) : ok({ app });
    },

    /**
     * A grant for one decision card, or the reason none is given: the door asks it beside a card it draws, with the
     * question's id and the options the card shows. INTERNAL: no route reaches it, so no key asks for a grant itself.
     */
    async chatAnswerMint(args: { id?: unknown; options?: unknown } | undefined, ctx: CallContext): Promise<Typed<Minted>> {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false, refusal: stop };
      if (ctx.principal.kind !== 'token') return no('FORBIDDEN', 'A card is drawn for a chat app, and this is not one.', { at: 'principal' });
      const app = appFor(ctx);
      if (app === null) return no('FORBIDDEN', 'Only Claude or ChatGPT, signed in to BrainDog, carries a card you can answer in. Answer it in BrainDog.', { at: 'principal' });
      const person = ctx.principal.person;
      const fault = personFault(person);
      if (fault !== null) return no('FORBIDDEN', fault, { at: 'principal' });
      if (typeof args?.id !== 'string' || args.id.trim() === '') return no('REQUIRED_MISSING', 'Which question? Name it by its id.', { at: 'id' });
      const id = args.id.trim();
      const row = kernel.governanceRow('suggestion', id);
      /* A QUESTION THIS KEY MAY NOT SEE IS ANSWERED AS A MISSING ONE, as `decide` answers it. */
      if (row === null || sightOf(ctx, `suggestion:${id}`) === null) return no('OUT_OF_BOUNDS', `There is no suggestion called ${id}.`, { at: 'id' });
      if (row.status !== 'open') return no('TRANSITION_ILLEGAL', 'This question is already answered.', { at: 'id' });
      const shown = Array.isArray(args.options) ? args.options.filter((o): o is string => typeof o === 'string' && o.length > 0 && o.length <= 120) : [];
      const options = pressable(row, shown);
      if (options.length === 0) return no('FORBIDDEN', 'This question is answered in BrainDog, where what it installs is shown whole.', { at: 'id' });
      const now = clock.now();
      sweep(now);
      const kind = String(row.body_kind);
      const rows = costRows(sql);
      const hard = options.filter((o) => pickCost(kind, row.body, weighedAs(kind, o), rows) === 'undo');
      const grant: Grant = { p: person, t: ctx.principal.id, d: id, o: options, v: await versionOf(row), x: now + GRANT_FOR, j: crypto.randomUUID() };
      return ok({ grant: await seal(grant), until: new Date(grant.x).toISOString(), app, hard });
    },

    /**
     * One press on a card: the grant it was drawn with and the option pressed, answered as the person's own `decide`.
     * INTERNAL, like the mint: the door's `answer` tool is the one way in, and it refuses a call that brings no grant.
     */
    async chatAnswer(args: { grant?: unknown; option?: unknown } | undefined, ctx: CallContext): Promise<Typed<Pressed>> {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false, refusal: stop };
      const g = await open(args?.grant);
      /* NO GRANT, OR ONE THIS KEY DID NOT DRAW: the model asking, or a grant carried somewhere else. Nothing is answered. */
      if (g === null || ctx.principal.kind !== 'token' || g.t !== ctx.principal.id || g.p !== ctx.principal.person)
        return no('LEVEL_REQUIRED', 'Only the person answers, by pressing an option on the decision card. Show them the card: call governance with the question’s id.', {
          at: 'grant',
        });
      const now = clock.now();
      sweep(now);
      if (g.x <= now) return no('VERSION_STALE', 'This card is older than 15 minutes. Ask for it again, or answer in BrainDog.', { at: 'grant' });
      if (spent.has(g.j)) return no('TRANSITION_ILLEGAL', 'This card was already pressed. Its answer is in BrainDog.', { at: 'grant' });
      const option = typeof args?.option === 'string' ? args.option : '';
      if (!g.o.includes(option)) return no('ENUM_VALUE_UNKNOWN', 'Press one of the options on the card.', { at: 'option', allowed: g.o });
      const app = appFor(ctx);
      if (app === null) return no('FORBIDDEN', 'This key no longer carries a card you can answer in. Answer it in BrainDog.', { at: 'principal' });
      const fault = personFault(g.p);
      if (fault !== null) return no('FORBIDDEN', fault, { at: 'principal' });
      const row = kernel.governanceRow('suggestion', g.d);
      if (row === null || row.status !== 'open') return no('TRANSITION_ILLEGAL', 'This question is already answered.', { at: 'grant' });
      if ((await versionOf(row)) !== g.v) return no('VERSION_STALE', 'This question changed since the card was drawn. Ask for it again, or answer in BrainDog.', { at: 'grant' });
      if (deps.decideAs === undefined) return no('NOT_IN_THIS_BUILD', 'Answering on the card is not in this build. Answer it in BrainDog.', { at: 'grant' });
      /* SPENT BEFORE IT IS USED, so two presses at once answer once, and a press the record refuses is not tried again. */
      spent.set(g.j, g.x);
      /* THE PERSON, AS THEY HOLD THE RECORD NOW, PRESSING IN THIS APP: `decide` asks every check it asks of a press in the
         app, and `admin` and `vault` refuse `pressedIn`, so nothing this press reaches is an install or a key. */
      const pressed: CallContext = {
        principal: { kind: 'person', id: g.p, level: 'owner' },
        registers: '*',
        credentialed: true,
        pressedIn: app,
      };
      const out = await deps.decideAs({ id: g.d, decide: { option, reason: '' } }, pressed);
      if (!out.ok) return out as Typed<Pressed>;
      const decided = (typeof out.value === 'object' && out.value !== null ? out.value : {}) as { decision?: unknown; batch?: unknown };
      const decision = typeof decided.decision === 'string' ? decided.decision : null;
      if (decision !== null) kernel.answeredIn(decision, app, g.p, typeof decided.batch === 'string' ? decided.batch : undefined);
      const said = `Answered: ${labelOf(row, option)}. BrainDog keeps it as answered in ${app}.`;
      return tail(ok({ decision, question: g.d, option, app, said }));
    },
  };
}
