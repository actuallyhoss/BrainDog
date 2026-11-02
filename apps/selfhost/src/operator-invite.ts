/**
 * `invite <email> [--as <level>] [--record <name>]`: the server's operator lets somebody new join a self-host that cannot
 * send mail (2 Nov decision, loop/selfhost-2026-11-02/REPORT.md, "For Sam").
 *
 * JOINING ASKS FOR A PROOF THAT THE ADDRESS IS THE PERSON'S, and on the Cloud and a self-host with SMTP that proof rides in
 * a mail. With no mail there was no way for a second person to join at all. Whoever runs the server can already read and
 * change every byte of it, so their word for an address is no weaker than a mailbox's: this mints the same proof the
 * mail would carry, beside a fresh link for the invitation the owner made, and prints the one link that holds both.
 *
 * ONLY HERE, AT A SHELL ON THE SERVER. No route reaches it: a proof handed out over HTTP is an account in somebody's name
 * for whoever asked. The link goes to this terminal (stderr) and nowhere else: not a file, not the server's log, not the
 * record. It is spent once and dies in a day, and the next link made for the address withdraws it.
 *
 * WHAT THE OWNER CHOSE STAYS WHAT THEY CHOSE. A waiting invitation is minted again with its own level and lists and
 * under the name of whoever made it, which withdraws the link they hold (one live link an address, as always). With
 * none waiting, `--as` says the level and it is made under the first owner's name.
 *
 * AND THE RECORD SAYS WHO VOUCHED. The proof carries `operator`, and the line in Activity that gives the person access
 * reads "Invited by the server's operator" (`acceptInvitation` in packages/kernel/src/invitations.ts).
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { deriveSessionKey } from '@braindog/host/auth';
import { createRecordApi } from '@braindog/record';
import { createDirectory } from '@braindog/record/directory';
import { fixOf } from '@braindog/ports';

import { commandFor, originOf, serverKeyOf } from './how.ts';
import { openKeyStore } from './keys.ts';
import { openSqlite } from './server.ts';

const LEVELS = ['read', 'append', 'write', 'decide', 'owner'] as const;
type Level = (typeof LEVELS)[number];

/** Each level as the app says it (`apps/web/src/lib/sharing/roles.ts`). */
const LEVEL_WORDS: Record<Level, string> = { owner: 'Owner', decide: 'Can decide', write: 'Can edit', append: 'Can add', read: 'Can view' };

const ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

/** The same question the server asks (`KNOWN` in server.ts): an address that already signs in here signs in first. */
const KNOWN = `SELECT 1 AS x FROM dir_person p WHERE lower(p.email) = lower(?)
  AND (EXISTS (SELECT 1 FROM dir_passkey k WHERE k.person = p.id) OR EXISTS (SELECT 1 FROM dir_member m WHERE m.person = p.id))`;

export type OperatorDeps = {
  data: string;
  env: Record<string, string | undefined>;
  /** The record files this data folder serves, by name (`recordsIn` and `recordIn` in main.ts). */
  records: () => string[];
  fileOf: (slug: string) => string | null;
  say: (line: string) => void;
  refuse: (line: string) => never;
};

/** The flag's value after `name`, or `undefined`; a flag with nothing after it is refused by the caller. */
function flag(args: readonly string[], name: string): string | undefined {
  const at = args.indexOf(name);
  return at === -1 ? undefined : (args[at + 1] ?? '');
}

export async function operatorInvite(args: readonly string[], deps: OperatorDeps): Promise<void> {
  const { data, env, say, refuse } = deps;
  const usage = commandFor('invite <their email> [--as <level>] [--record <name>]');
  const email = (args.find((a, i) => !a.startsWith('--') && (i === 0 || !['--as', '--record'].includes(args[i - 1]!))) ?? '').trim();
  if (!email) return refuse(`invite needs the address of the person joining: ${usage}.`);
  if (email.length > 254 || !ADDRESS.test(email)) return refuse(`${email} is not an email address.`);
  const asked = flag(args, '--as');
  if (asked !== undefined && !(LEVELS as readonly string[]).includes(asked))
    return refuse(`--as takes one of ${LEVELS.map((l) => `${l} (${LEVEL_WORDS[l]})`).join(', ')}.`);

  /* SIGN-IN HAS TO BE ON, or the link leads to a page that cannot sign anybody in: a Directory, and a server key. */
  const dirFile = join(data, 'directory.sqlite');
  const serverKey = serverKeyOf(env).value?.trim();
  if (!existsSync(dirFile) || !serverKey)
    return refuse(`Nobody can sign in to this BrainDog yet (it needs ${existsSync(dirFile) ? 'BRAINDOG_SERVER_KEY set' : `a record made with ${commandFor('init <name> --owner <email>')}`}), so an invitation would lead nowhere.`);

  const slugs = deps.records();
  const named = flag(args, '--record');
  if (named === '') return refuse(`--record takes the name of the BrainDog: ${slugs.join(', ') || 'none here'}.`);
  const slug = named ?? (slugs.length === 1 ? slugs[0] : undefined);
  if (slug === undefined) return refuse(slugs.length === 0 ? `There is no record in ${data}.` : `${data} holds ${slugs.join(', ')}. Say which with --record <name>.`);
  if (!slugs.includes(slug)) return refuse(`There is no BrainDog called ${slug} in ${data}${slugs.length ? `; it holds ${slugs.join(', ')}` : ''}.`);
  const file = deps.fileOf(slug);
  if (file === null) return refuse(`There is no record file for ${slug} in ${data}.`);

  const clock = { now: () => Date.now() };
  const sql = openSqlite(file);
  const dirSql = openSqlite(dirFile);
  try {
    const api = await createRecordApi({ sql, clock });
    const stopped = api.kernel.refused();
    if (stopped) return refuse(`${slug} cannot be opened by this build: ${stopped.fix}`);

    /* THE OWNER'S CHOICE, WHERE THEY MADE ONE: the newest invitation still waiting for this address. */
    const waiting = api.kernel.listInvitations().find((i) => i.email.toLowerCase() === email.toLowerCase());
    if (!waiting && asked === undefined)
      return refuse(
        `No invitation waits for ${email} on ${slug}. Invite them from People in the app and choose what they can do, then run this again; or say it here with --as <level> (${LEVELS.join(', ')}).`,
      );
    const owner = sql.one<{ id: string }>("SELECT person_id AS id FROM member WHERE register = '*' AND level = 'owner' ORDER BY person_id LIMIT 1")?.id;
    const by = waiting?.invited_by ?? owner;
    if (!by) return refuse(`${slug} has no owner to make the invitation under.`);
    const level = (asked as Level | undefined) ?? waiting?.level ?? undefined;
    const registers = asked !== undefined ? {} : (waiting?.registers ?? {});
    const minted = await api.kernel.createInvitation(by, {
      email,
      ...(level ? { level } : {}),
      ...(Object.keys(registers).length > 0 ? { registers } : {}),
    });
    if (!minted.ok) return refuse(fixOf(minted));
    const token = minted.value.token;

    /* THE ORIGIN THE SERVER ANSWERS AT, as `serve` works it out; `BRAINDOG_ORIGIN` wins. */
    const port = Number(env.PORT ?? 8080);
    const tls = env.BRAINDOG_TLS_CERT !== undefined && env.BRAINDOG_TLS_KEY !== undefined;
    const origin = new URL(originOf(env, port, tls) ?? `${tls ? 'https' : 'http'}://localhost:${port}`).origin;

    const what = level ? LEVEL_WORDS[level] : 'what is shared with them';
    const lists = Object.keys(registers).length;
    say(`Invitation for ${email} on ${slug}: ${what}${lists ? `, on ${lists} ${lists === 1 ? 'list' : 'lists'}` : ''}.${waiting ? ' The link the app made for them before no longer works.' : ''}`);

    let link = `${origin}/invite#${token}`;
    if (dirSql.one(KNOWN, email)) {
      say(`${email} already signs in here, so this is the plain link: they sign in, then open it.`);
    } else {
      /* THE DIRECTORY'S OWN PROOF, MINTED UNDER THE KEY THE SERVER CHECKS IT WITH: the key file's, or
         `BRAINDOG_SESSION_SECRET`'s, exactly as `serve` derives it. `magic` is on for this one call alone. */
      const store = await openKeyStore(env.BRAINDOG_KEK_FILE ?? join(data, 'kek'), say);
      const secret = env.BRAINDOG_SESSION_SECRET;
      const mac = secret === undefined ? store.sessionKey : await deriveSessionKey(new TextEncoder().encode(secret));
      const directory = createDirectory(dirSql, clock, { mac, magic: true, key: { serverKey } }, { sells: false });
      const proving = await directory.auth({ flow: 'invite.prove', email, invite: token, operator: true });
      mac.fill(0);
      store.sessionKey.fill(0);
      store.shareKey.fill(0);
      if (proving.status !== 200 || !proving.mail || !('link' in proving.mail)) {
        const why = 'refusal' in proving && proving.refusal ? proving.refusal.fix : 'the Directory would not mint a proof.';
        return refuse(`The invitation was made, but its proof was not: ${why}`);
      }
      link = `${origin}/invite#${token}&proof=${proving.mail.link}`;
      if (!sql.one('SELECT 1 AS x FROM member LIMIT 1') || !dirSql.one('SELECT 1 AS x FROM dir_passkey LIMIT 1'))
        say('The owner has no passkey yet, and nobody else can join until they add one (Settings, Signing in). The link lasts a day, so it works once they have.');
    }
    say('Send them this link yourself. It is printed here only, works once, and runs out in a day:');
    say('');
    say(`  ${link}`);
    say('');
    say(`When they join, Activity says they were invited by the server's operator.${env.BRAINDOG_ORIGIN ? '' : ` If they reach this server at another address than ${origin}, change the start of the link to it.`}`);
  } finally {
    sql.close();
    dirSql.close();
  }
}
