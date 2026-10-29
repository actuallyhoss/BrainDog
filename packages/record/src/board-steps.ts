/**
 * A BOARD'S EDIT STEPS, applied to the page as it stands (the widgets plan of 29 October, §5.5 and §7.3).
 *
 * The editor keeps what he did as steps (move this before that, make this wide, add, remove, keep a draft, the phone's
 * own arrangement), not as the board he ended on, so Done applies them on top of the page as the record holds it now:
 * if an agent added a draft widget while he was arranging, his steps land around it rather than being refused. A step
 * is refused only when the widget it names is gone, in a sentence that says which.
 *
 * PURE: a body in, a body out, nothing read or written. `index.ts` `boardSteps` reads the page and installs the answer.
 */

import { isWidgetSize, widgetSizesOf as sizesOf, type WidgetSize } from '@braindog/kernel';

type Block = Record<string, unknown> & { kind?: unknown; key?: unknown; size?: unknown; draft?: unknown };
export type BoardBody = Record<string, unknown> & { blocks: Block[]; phone?: Phone; requires?: unknown };
type Phone = { order?: string[]; sizes?: Record<string, WidgetSize>; hidden?: string[] };

/** One step of the editor. `before: null` is the board's end. */
export type BoardStep =
  | { move: string; before: string | null }
  | { size: string; to: WidgetSize }
  | { add: Block; before?: string | null }
  | { remove: string }
  | { keep: string }
  | { set: string; block: Block }
  | { phone: Phone | null };

const keyOf = (b: Block): string | null => (typeof b.key === 'string' ? b.key : null);

/** A key no widget of `blocks` has: `w-` and four letters and digits. */
function freshKey(blocks: readonly Block[]): string {
  const taken = new Set(blocks.map(keyOf));
  for (let n = 0; ; n += 1) {
    const k = `w-${(Math.random() * 36 ** 4).toString(36).slice(0, 4).padStart(4, '0')}`;
    if (!taken.has(k) || n > 50) return taken.has(k) ? `w-${Date.now().toString(36)}` : k;
  }
}

/** The register a block reads, `register.<id>`, or `null`. */
const readsOf = (b: Block): string | null => (typeof b.source === 'string' && b.source.startsWith('register.') ? b.source : null);

/**
 * What went wrong with one step, said for a person, with a code of 30 §6: `VERSION_STALE` when its widget left the board
 * after the editor drew it (the board moved under the edit, as a row's CAS does), `VALUE_MALFORMED` for a size it is not
 * drawn at.
 */
export type StepFault = { at: number; code: 'VERSION_STALE' | 'VALUE_MALFORMED'; fix: string };

/**
 * `body` with every step applied in order, or the first fault. Each step names its widget by key; one whose widget is
 * no longer on the board is the fault, since moving or sizing what is gone cannot be done on top of anything.
 */
export function boardStepsOn(body: BoardBody, steps: readonly BoardStep[]): { ok: true; body: BoardBody } | { ok: false; fault: StepFault } {
  const blocks = body.blocks.map((b) => ({ ...b }));
  let phone: Phone | undefined = body.phone ? structuredClone(body.phone) : undefined;
  let requires = Array.isArray(body.requires) ? [...(body.requires as string[])] : undefined;
  const find = (key: string): number => blocks.findIndex((b) => keyOf(b) === key);
  const gone = (at: number, key: string): { ok: false; fault: StepFault } => ({ ok: false, fault: { at, code: 'VERSION_STALE', fix: `The widget ${key} is no longer on the board, so a change to it could not be made. Open Today again and make it there.` } });
  const place = (block: Block, before: string | null | undefined): void => {
    const at = before == null ? -1 : find(before);
    if (at < 0) blocks.push(block);
    else blocks.splice(at, 0, block);
  };
  for (const [i, step] of steps.entries()) {
    if ('move' in step) {
      const at = find(step.move);
      if (at < 0) return gone(i, step.move);
      const [b] = blocks.splice(at, 1);
      /* MOVED BEFORE ITSELF OR BEFORE A WIDGET SINCE GONE, it goes before the next one there is, else the end. */
      place(b!, step.before === step.move ? null : step.before);
    } else if ('size' in step) {
      const at = find(step.size);
      if (at < 0) return gone(i, step.size);
      const kind = String(blocks[at]!.kind ?? '');
      if (!isWidgetSize(step.to) || !sizesOf(kind).includes(step.to)) return { ok: false, fault: { at: i, code: 'VALUE_MALFORMED', fix: `That widget is not drawn ${String(step.to)}.` } };
      blocks[at] = { ...blocks[at]!, size: step.to };
    } else if ('add' in step) {
      const add = { ...step.add };
      if (typeof add.key !== 'string' || find(add.key) >= 0) add.key = freshKey(blocks);
      if (add.size === undefined) add.size = 'wide';
      place(add, step.before);
      const reads = readsOf(add);
      if (reads && requires && !requires.includes(reads)) requires = [...requires, reads];
    } else if ('remove' in step) {
      const at = find(step.remove);
      if (at < 0) continue;
      blocks.splice(at, 1);
      /* THE PHONE LETS IT GO BELOW, with every key the board no longer holds. */
    } else if ('keep' in step) {
      const at = find(step.keep);
      if (at < 0) return gone(i, step.keep);
      const { draft: _draft, ...kept } = blocks[at]!;
      blocks[at] = kept;
    } else if ('set' in step) {
      /* A WIDGET CHANGED IN THE INSPECTOR, OR A DRAFT TRIED AGAIN: its block replaced where it stands, under its own key,
         at its size unless the new block says one. */
      const at = find(step.set);
      if (at < 0) return gone(i, step.set);
      const was = blocks[at]!;
      blocks[at] = { ...step.block, key: step.set, size: step.block.size ?? was.size };
      const reads = readsOf(blocks[at]!);
      if (reads && requires && !requires.includes(reads)) requires = [...requires, reads];
    } else if ('phone' in step) {
      phone = step.phone === null ? undefined : structuredClone(step.phone);
    }
  }
  /* THE PHONE NAMES ONLY WIDGETS THE BOARD HOLDS, so a widget removed, or one an agent took off meanwhile, leaves it. */
  if (phone) {
    const keys = new Set(blocks.flatMap((b) => (b.size !== undefined && keyOf(b) ? [keyOf(b)!] : [])));
    phone = {
      ...(phone.order ? { order: phone.order.filter((k) => keys.has(k)) } : {}),
      ...(phone.hidden ? { hidden: phone.hidden.filter((k) => keys.has(k)) } : {}),
      ...(phone.sizes ? { sizes: Object.fromEntries(Object.entries(phone.sizes).filter(([k]) => keys.has(k))) } : {}),
    };
  }
  const { phone: _was, requires: _req, ...rest } = body;
  /* `page` FIRST: a declaration is read by its first key, and a body kept by the record may come back with `blocks` first. */
  return { ok: true, body: { page: rest.page, title: rest.title, ...rest, ...(requires ? { requires } : {}), board: true, ...(phone ? { phone } : {}), blocks } };
}

/** Whether a value is a list of steps of the shapes above. Every key is checked again by the install's own lint. */
export function stepsOf(v: unknown): BoardStep[] | null {
  if (!Array.isArray(v) || v.length === 0 || v.length > 200) return null;
  for (const s of v) {
    if (s === null || typeof s !== 'object' || Array.isArray(s)) return null;
    const o = s as Record<string, unknown>;
    const ok =
      (typeof o.move === 'string' && (o.before === null || typeof o.before === 'string')) ||
      (typeof o.size === 'string' && typeof o.to === 'string') ||
      (o.add !== null && typeof o.add === 'object' && !Array.isArray(o.add) && typeof (o.add as Block).kind === 'string') ||
      typeof o.remove === 'string' ||
      typeof o.keep === 'string' ||
      (typeof o.set === 'string' && o.block !== null && typeof o.block === 'object' && !Array.isArray(o.block) && typeof (o.block as Block).kind === 'string') ||
      (Object.hasOwn(o, 'phone') && (o.phone === null || (typeof o.phone === 'object' && !Array.isArray(o.phone))));
    if (!ok) return null;
  }
  return v as BoardStep[];
}
