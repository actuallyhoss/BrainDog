/**
 * TODAY FROM THE COMMAND LINE (widgets plan §7.5): `braindog today` says the widgets on Today, `braindog today add
 * "<what>" [--size wide]` puts one there made from the words (the record's rules first, the model only when they cannot,
 * as Make your own makes one), and `braindog widget share <name>` makes an add-on of one of Today's widgets
 * (`packFromWidget`, through `addon new --from-widget`).
 *
 * WHO ADDS: the owner's sign-in writes the widget on Today with Undo in the app (`boardSteps`); a sign-in that may not
 * arrange the board lands it as a draft with its reason (`propose`, `body_kind: widget`), for the owner to keep or throw
 * away, and says so. Nothing is ever placed on a Today that is not kept yet: the app keeps it on the first add there.
 */

import { writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { fixOf, refused, type Result } from '@braindog/ports';

import { storedOf } from '@braindog/dog';

import { printable } from './clip.ts';
import { budgetOf, clientFor, hostsPath, target, type Target } from './http.ts';
import { refuse } from './json.ts';
import { isObject, type AgentIo } from './skills.ts';

const SIZES = ['small', 'wide', 'tall', 'large', 'full'] as const;
const USAGE = 'braindog today takes nothing to say Today, or add "<what it shows>" [--size small|wide|tall|large|full], as in braindog today add "my food spending this month".';
const SHARE_USAGE = 'braindog widget share takes the name of a widget on Today, as in braindog widget share "Spending", and [--out <folder>].';

type Block = Record<string, unknown>;

const line = (r: Result<unknown>, to: Target): string => {
  if (!refused(r)) return printable(fixOf(r));
  if (r.refusal.code === 'UNREACHABLE') return `${to.key} did not answer.`;
  if (r.refusal.code === 'ROUTE_UNKNOWN' || r.refusal.code === 'NOT_IN_THIS_BUILD') return 'Your BrainDog is older than this command. It will answer once it is updated.';
  return printable(fixOf(r));
};

/** The client for the host named, or the sentence why there is none. */
function clientOf(host: string | undefined, io: AgentIo): { to: Target; client: ReturnType<typeof clientFor> } | null {
  try {
    const to = target(host, io.env, hostsPath(io.env));
    return { to, client: clientFor(to, async () => ({}), AbortSignal.timeout(budgetOf(io.env))) };
  } catch (e) {
    io.say(e instanceof Error ? e.message : 'No BrainDog host could be read.');
    return null;
  }
}

/** Today's widgets as the record draws it, each with its key, name, size and draft mark. */
async function todayBlocks(client: ReturnType<typeof clientFor>): Promise<Result<Block[]>> {
  const page: Result<unknown> = await client.call('page', { slug: 'home' });
  if (!page.ok) return page as Result<never>;
  const blocks = isObject(page.value) && Array.isArray(page.value.blocks) ? (page.value.blocks as unknown[]).filter(isObject) : [];
  return { ok: true, value: blocks as Block[] };
}

/** Said where Today is still drawn from what the record holds, so there is no board to read or add to yet. */
const NOT_KEPT = 'Today is not kept as a board yet: it is drawn from what your BrainDog holds. Add one widget to it in the app, and then it can be read and added to from here.';

const nameOf = (b: Block): string => (typeof b.heading === 'string' && b.heading.trim() !== '' ? b.heading.trim() : String(b.kind ?? 'A widget'));

/** `braindog today [add "<what>" [--size <size>]] [--host <host>]`. */
export async function todayCommand(args: string[], io: AgentIo): Promise<number> {
  let values: { host?: string | undefined; size?: string | undefined };
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({ args, strict: true, allowPositionals: true, options: { host: { type: 'string' }, size: { type: 'string' } } }));
  } catch {
    io.say(USAGE);
    return 1;
  }
  const [verb, ...rest] = positionals;
  const at = clientOf(values.host, io);
  if (at === null) return 1;
  const { to, client } = at;

  if (verb === undefined) {
    const blocks = await todayBlocks(client);
    if (refused(blocks) && blocks.refusal.code === 'PAGE_UNKNOWN') return refuse(io, blocks, NOT_KEPT);
    if (!blocks.ok) return refuse(io, blocks, line(blocks, to));
    io.answer?.({ value: blocks.value });
    const shown = blocks.value.filter((b) => typeof b.key === 'string');
    if (shown.length === 0) {
      io.out('Today holds no widgets of its own yet. Add one with braindog today add "<what it shows>".');
      return 0;
    }
    for (const b of shown) {
      const draft = isObject(b.draft) && typeof b.draft.by === 'string' ? ` · a draft from ${b.draft.by}` : '';
      io.out(printable(`${nameOf(b)} · ${typeof b.size === 'string' ? b.size : 'wide'}${draft}`));
    }
    return 0;
  }

  if (verb !== 'add' || rest.length !== 1 || rest[0]!.trim() === '') {
    io.say(USAGE);
    return 1;
  }
  const said = rest[0]!.trim();
  if (values.size !== undefined && !(SIZES as readonly string[]).includes(values.size)) {
    io.say(`--size is one of ${SIZES.join(', ')}.`);
    return 1;
  }
  const made: Result<unknown> = await client.call('widgetCompose', { said });
  if (!made.ok) return refuse(io, made, line(made, to));
  const value = isObject(made.value) ? made.value : {};
  const { draft: _draft, ...block } = (isObject(value.block) ? value.block : {}) as Block;
  const size = values.size ?? (typeof value.size === 'string' ? value.size : 'wide');
  const title = typeof value.title === 'string' ? value.title : nameOf(block);
  const key = `w-${Math.random().toString(36).slice(2, 6)}`;
  const wrote: Result<unknown> = await client.call('boardSteps', { page: 'home', steps: [{ add: { ...block, key, size } }] });
  if (wrote.ok) {
    io.answer?.({ value: { added: key, title, size } });
    io.out(printable(`${title} is on Today, ${size}. Undo it in the app, or take it off with Edit on Today.`));
    return 0;
  }
  /* A SIGN-IN THAT MAY NOT ARRANGE THE BOARD LANDS IT AS A DRAFT, with the words as its reason. */
  if (refused(wrote) && (wrote.refusal.code === 'LEVEL_REQUIRED' || wrote.refusal.code === 'FORBIDDEN' || wrote.refusal.code === 'ADMIN_REQUIRED')) {
    const drafted: Result<unknown> = await client.call('propose', { question: `You asked for ${said}.`, body_kind: 'widget', body: { block, size } });
    if (!drafted.ok) return refuse(io, drafted, line(drafted, to));
    io.answer?.({ value: drafted.value });
    io.out(printable(isObject(drafted.value) && typeof drafted.value.said === 'string' ? drafted.value.said : `${title} is on Today as a draft.`));
    return 0;
  }
  if (refused(wrote) && wrote.refusal.at === 'base') return refuse(io, wrote, NOT_KEPT);
  return refuse(io, wrote, line(wrote, to));
}

/** `braindog widget share <name> [--out <folder>] [--host <host>]`: an add-on made from one of Today's widgets. */
export async function widgetCommand(args: string[], io: AgentIo): Promise<number> {
  let values: { host?: string | undefined; out?: string | undefined };
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({ args, strict: true, allowPositionals: true, options: { host: { type: 'string' }, out: { type: 'string' } } }));
  } catch {
    io.say(SHARE_USAGE);
    return 1;
  }
  const [verb, name, ...more] = positionals;
  if (verb !== 'share' || name === undefined || name.trim() === '' || more.length > 0) {
    io.say(SHARE_USAGE);
    return 1;
  }
  const at = clientOf(values.host, io);
  if (at === null) return 1;
  /* THE WIDGET AS TODAY KEEPS IT, not as it was drawn: what it reads and how it draws, never his rows. */
  const arranged: Result<unknown> = await at.client.call('arrangement', { page: 'home' });
  /* A TODAY WITH NO BOARD OF ITS OWN HAS NO DECLARATION, and the record's sentence for that named one and listed every
     page's slug; the person is told what it means here. */
  if (refused(arranged) && arranged.refusal.code === 'PAGE_UNKNOWN') return refuse(io, arranged, NOT_KEPT);
  if (!arranged.ok) return refuse(io, arranged, line(arranged, at.to));
  const stored = storedOf(arranged.value, 'home');
  if ('fix' in stored) {
    io.say(NOT_KEPT);
    return 1;
  }
  const kept = (Array.isArray((stored.body as { blocks?: unknown }).blocks) ? ((stored.body as { blocks: unknown[] }).blocks.filter(isObject) as Block[]) : []).filter((b) => typeof b.key === 'string');
  const want = name.trim().toLowerCase();
  const found = kept.find((b) => nameOf(b).toLowerCase() === want) ?? kept.find((b) => nameOf(b).toLowerCase().includes(want));
  if (found === undefined) {
    const names = kept.map(nameOf);
    io.say(names.length === 0 ? 'Today holds no widgets of its own yet.' : `No widget on Today is called ${name}. Today has ${names.join(', ')}.`);
    return 1;
  }
  const slug = nameOf(found).toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-+|-+$/gu, '').slice(0, 40) || 'my-widget';
  const id = slug.length >= 2 && /^[a-z]/u.test(slug) ? slug : `widget-${slug}`;
  const file = resolve(io.cwd, `${id}.widget.json`);
  if (existsSync(file)) {
    io.say(`${file} is already there, and share never writes over it.`);
    return 1;
  }
  /* WHAT THE PAGE DREW IS LEFT BEHIND: only what the widget is (its kind, what it reads and how it draws) goes. */
  const { key: _k, draft: _d, ...block } = found;
  writeFileSync(file, `${JSON.stringify({ title: nameOf(found), block, sizes: [typeof found.size === 'string' ? found.size : 'wide'] }, null, 2)}\n`);
  io.out(printable(`Wrote ${nameOf(found)} to ${file}.`));
  const { pack } = await import('./catalogue.ts');
  return pack(['new', id, '--from-widget', file, '--out', values.out ?? join(io.cwd, id)], io);
}
