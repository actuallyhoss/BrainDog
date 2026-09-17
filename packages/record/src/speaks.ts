/**
 * The `speaks` setting on a use case installed before the setting existed.
 *
 * A USE-CASE PACK INSTALLED BEFORE SEPTEMBER 17TH DECLARES NO `speaks`, so a person could not choose its voice: Switch to
 * and "Keep Student's voice" wrote a setting the pack did not have, the kernel refused it, and the order by id decided.
 * The pack is not reinstalled to fix that. Its settings are read with `speaks` declared, and the one speaking now by the
 * order by id reads as set to speak, so the voice a record had is the voice it keeps once a second use case is chosen.
 *
 * ON READ, AND WRITTEN ONLY WHEN A SETTING IS. A read changes nothing a record holds, so a read-only record reads the
 * same answer. The first write of any use case's settings writes the setting into every such pack, with the one
 * speaking set, before the kernel checks the write against the declared settings.
 *
 * THE RECORD'S AND NOT THE KERNEL'S, because the kernel names no use case.
 */

import { SPEAKS, packIdOf, speakingPack } from '@braindog/declare';
import { jcs, type Kernel } from '@braindog/kernel';
import type { Sql } from '@braindog/ports';

const USE_CASE = packIdOf('');
/** As `useCasePack` declares it. */
const DECLARED = { type: 'bool', label: 'Speaks for this BrainDog' } as const;
/** `readConfig`'s ceiling: a pack already at it is left as it is. */
const CEILING = 64;

type Manifest = Record<string, unknown> & { config?: unknown; config_values?: unknown };

const isMap = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

function manifestOf(sql: Sql, id: string): Manifest | null {
  const row = sql.one<{ manifest: string }>('SELECT manifest FROM pack WHERE id = ?', id);
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.manifest) as unknown;
    return isMap(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** A use-case pack whose manifest declares settings and not `speaks`, with room for one more. */
const lacking = (m: Manifest | null): m is Manifest =>
  m !== null && (m.config === undefined || (isMap(m.config) && !Object.hasOwn(m.config, SPEAKS) && Object.keys(m.config).length < CEILING));

/** The kernel, with `speaks` backfilled on each use case that lacks it. Every other call is the kernel's own. */
export function backfillSpeaks(kernel: Kernel, sql: Sql): Kernel {
  /** The use-case packs lacking the setting, and the one of all of them that speaks now. */
  function standing(): { old: Map<string, Manifest>; speaker: string | null } {
    const old = new Map<string, Manifest>();
    const states = kernel.packStates().filter((s) => s.id.startsWith(USE_CASE));
    const said = states.map((s) => {
      const m = manifestOf(sql, s.id);
      if (lacking(m)) {
        old.set(s.id, m);
        return { id: s.id, disabled_at: s.disabled_at, speaks: null };
      }
      const read = kernel.packConfig(s.id);
      const v = read.ok ? read.value.values[SPEAKS] : null;
      return { id: s.id, disabled_at: s.disabled_at, speaks: typeof v === 'boolean' ? v : null };
    });
    return { old, speaker: old.size === 0 ? null : speakingPack(said) };
  }

  return Object.assign(Object.create(kernel) as Kernel, {
    packConfig(id: string): ReturnType<Kernel['packConfig']> {
      const out = kernel.packConfig(id);
      if (!out.ok || !id.startsWith(USE_CASE) || !lacking(manifestOf(sql, id))) return out;
      const { speaker } = standing();
      return {
        ok: true as const,
        value: { ...out.value, config: { ...out.value.config, [SPEAKS]: { ...DECLARED } }, values: { ...out.value.values, [SPEAKS]: speaker === id ? true : null } },
      };
    },

    setPackConfig(id: string, values: unknown, opts: { actor?: string } = {}): ReturnType<Kernel['setPackConfig']> {
      if (id.startsWith(USE_CASE)) {
        const { old, speaker } = standing();
        for (const [pack, m] of old) {
          const held = isMap(m.config_values) ? m.config_values : {};
          const next = { ...m, config: { ...(isMap(m.config) ? m.config : {}), [SPEAKS]: { ...DECLARED } }, ...(pack === speaker ? { config_values: { ...held, [SPEAKS]: true } } : {}) };
          sql.exec('UPDATE pack SET manifest = ? WHERE id = ?', jcs(next as never), pack);
        }
      }
      return kernel.setPackConfig(id, values, opts);
    },
  });
}
