/**
 * The owner renames one machine: `renameDevice({ id, label })` (ADMIN), the record's half of the machine stamp.
 *
 * A MACHINE IS NAMED BY ITS HANDLE, the one `listDevices` shows and `revokeDevice` takes, never by the code a device polls
 * with. The kernel checks the name (`renameDevice` in `device.ts`) and renames the grant and the key it minted together,
 * so the sign-in and the key read the same name. The owner's alone, in a browser, as revoking one is.
 */

import type { DeviceRow } from '@braindog/kernel';
import type { Result } from '@braindog/ports';

import type { CallContext } from '../index.ts';
import type { RecordDeps } from './index.ts';

export function methods(deps: RecordDeps) {
  const { kernel, admin, no, tail } = deps;
  return {
    async renameDevice(args: { id?: unknown; label?: unknown } | undefined, ctx: CallContext): Promise<Result<DeviceRow>> {
      const stop = admin(ctx);
      if (stop) return { ok: false as const, refusal: stop };
      if (typeof args?.id !== 'string' || args.id === '') return no('REQUIRED_MISSING', 'Which machine? Name it by its handle.', { at: 'id' });
      return tail(await kernel.renameDevice(args.id, args.label as string));
    },
  };
}
