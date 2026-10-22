/**
 * Where each machine keeps its sync key, and the one tool sign-in item setup sync may move: the system's own secret
 * store, behind one interface (`docs/48-SPEC-CLI.md` §5.20).
 *
 *   - A MAC: the Keychain, through `security`. Read with `find-generic-password -w`, removed with
 *     `delete-generic-password`, and written with `add-generic-password -U` typed into `security -i` on its standard
 *     input. The value goes in as hex (`-X`), so no character of it needs quoting there. Measured on a Mac:
 *     `security -i` reads a piped line and exits with that command's own status (44 for an item that is not there).
 *   - WINDOWS: Credential Manager, which has no command that reads a secret back, so a small PowerShell helper calls the
 *     system's `CredReadW`, `CredWriteW` and `CredDeleteW` through `Add-Type`. The helper is handed as
 *     `-EncodedCommand`, and the value on its standard input.
 *   - LINUX: the secret service, through `secret-tool store`, which reads the value on its standard input, and
 *     `lookup` and `clear`.
 *
 * THE SYNC KEY IS NEVER AN ARGUMENT. Any process on the machine can read another's arguments for as long as it runs
 * (`ps` on a Mac or Linux, the process list on Windows), so a key on a command line is a key shown to every program the
 * person runs. `security add-generic-password` takes a password only as an argument (`-w` or `-X`), so it is typed into
 * `security -i` instead, as a person would type it: the line reaches `security` on its standard input and appears in
 * no process list. What that costs: one more program between this command and the Keychain, whose status is not
 * promised for every line it reads, so every write is read back and compared before it is called done. The plain
 * `-w <value>` form was turned down because it puts the key in the process list for as long as `security` runs, which is
 * the leak this file exists to avoid.
 *
 * ONE LINE OF `security -i` HOLDS 4,096 BYTES (`MAX_LINE_LEN` in Apple's `security.c`), so a value over about 1,900
 * bytes, its hex twice that, cannot be typed into it. The sync key is 64 characters and always fits. A Keychain item of
 * tool sign-ins can be several kilobytes, and there is no other way to hand `security` a value: such an item goes as
 * `-X <hex>` on `security`'s own command line for the moment it runs, the way ccenv writes the same item each session,
 * and only an item that is not the sync key's ever does.
 *
 * AN AGENT APP'S OWN LOGIN IS NEVER ASKED FOR. An item whose name holds Claude Code's keychain item or the claude.ai
 * login is refused before any program runs (`SIGN_INS` in `sync.ts`, the refusal list the `no-login` gate allows),
 * since Claude Code keeps a profile's tool sign-ins in the same item as its account login. The one tool sign-in item
 * setup sync moves is one that holds tool sign-ins alone, such as ccenv's.
 *
 * WHAT A STORE SAYS IS NOT PRINTED. A failure is said in fixed words: the program's own output is never relayed,
 * since it could quote what it was handed.
 */

import { spawn } from 'node:child_process';

import { SIGN_INS } from './sync.ts';

/** An item in a store: a service and an account, and on Linux the attribute the account is kept under. */
export type Item = { service: string; account: string; attribute?: string | undefined };

/** What a program said: its exit code (-1 when it did not start) and its standard output. */
export type Ran = { code: number; out: string };

/** A program run with no shell, `input` written to its standard input when there is one, and what came of it. */
export type Run = (command: string, args: string[], input: string | null) => Promise<Ran>;

/** What a read finds: the value, nothing kept there, or a store that could not be asked and why. */
export type Found = { ok: true; value: string | null } | { ok: false; why: string };

/** One system's store. Each answer is a fact, never a throw. */
export type SecretStore = {
  /** What the store is called in a sentence: "the Keychain", "Credential Manager", "the secret service". */
  name: string;
  read: (item: Item) => Promise<Found>;
  /** Whether the value is now kept there, read back to be sure. */
  write: (item: Item, value: string) => Promise<{ ok: true } | { ok: false; why: string }>;
  /** Whether the item is gone, or was never there. */
  remove: (item: Item) => Promise<{ ok: true; had: boolean } | { ok: false; why: string }>;
};

/** The sync key's item for one record: the service the contract names, and the record by its address. */
export const syncKeyItem = (record: string): Item => ({ service: 'braindog-sync-key', account: record, attribute: 'slug' });

/**
 * Whether an item names an agent app's own login, which is never read, written or removed here. Compared without
 * case, since a Keychain search is.
 */
export function namesLogin(item: Item): boolean {
  const said = `${item.service}\n${item.account}`.toLowerCase();
  return said.includes(SIGN_INS.keychain.toLowerCase()) || said.includes(SIGN_INS.login.toLowerCase());
}

/** What an item may be called here: plain letters, digits and `. _ : @ + -`, so no store ever reads a word in it. */
const PLAIN = /^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,199}$/u;

const LOGIN_REFUSED = "That item holds an agent app's own login, which BrainDog never opens.";
const NOT_PLAIN = 'That item has a name BrainDog does not write into a command: letters, digits and . _ : @ + - only.';

/** Why an item is not asked for at all, or `null` when it may be. */
function itemFault(item: Item): string | null {
  if (namesLogin(item)) return LOGIN_REFUSED;
  if (!PLAIN.test(item.service) || !PLAIN.test(item.account) || (item.attribute !== undefined && !/^[a-z][a-z0-9_-]{0,31}$/u.test(item.attribute))) return NOT_PLAIN;
  return null;
}

/** The real runner: no shell, no window, standard error dropped, thirty seconds at most. */
export const runProgram: Run = (command, args, input) =>
  new Promise((done) => {
    let out = '';
    let settled = false;
    const finish = (code: number) => {
      if (settled) return;
      settled = true;
      done({ code, out });
    };
    let child;
    try {
      child = spawn(command, args, { shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'], timeout: 30_000 });
    } catch {
      finish(-1);
      return;
    }
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      out += chunk;
    });
    child.on('error', () => finish(-1));
    child.on('close', (code) => finish(code ?? 1));
    child.stdin.on('error', () => undefined);
    if (input !== null) child.stdin.write(input, 'utf8');
    child.stdin.end();
  });

/* ── a Mac: the Keychain ───────────────────────────────────────────────── */

/** `security`'s exit when the item is not there (`errSecItemNotFound`). */
const MAC_NONE = 44;

/** The longest line typed into `security -i`, its end included: under the 4,096 bytes its buffer holds. */
export const MAC_LINE = 4_000;

/** The Keychain, through `security`. */
export function keychain(run: Run = runProgram): SecretStore {
  const read = async (item: Item): Promise<Found> => {
    const fault = itemFault(item);
    if (fault !== null) return { ok: false, why: fault };
    const got = await run('security', ['find-generic-password', '-s', item.service, '-a', item.account, '-w'], null);
    if (got.code === 0) return { ok: true, value: got.out.replace(/\r?\n$/u, '') };
    if (got.code === MAC_NONE) return { ok: true, value: null };
    return { ok: false, why: got.code === -1 ? 'security, the Keychain command, did not start.' : 'The Keychain did not answer.' };
  };
  return {
    name: 'the Keychain',
    read,
    write: async (item, value) => {
      const fault = itemFault(item);
      if (fault !== null) return { ok: false, why: fault };
      /* TYPED INTO `security -i` when it fits one line, never an argument; the value in hex, so the line holds nothing to
         quote. A longer value is tool sign-ins, never the sync key, and goes on `security`'s command line (see above). */
      const words = ['add-generic-password', '-U', '-s', item.service, '-a', item.account, '-X', Buffer.from(value, 'utf8').toString('hex')];
      const line = `${words.join(' ')}\n`;
      const fits = line.length <= MAC_LINE;
      if (!fits && item.service === syncKeyItem('').service) return { ok: false, why: 'The sync key is never written on a command line.' };
      const got = await run('security', fits ? ['-i'] : words, fits ? line : null);
      if (got.code === -1) return { ok: false, why: 'security, the Keychain command, did not start.' };
      /* READ BACK, because what interactive mode answers for a line is not promised. */
      const back = await read(item);
      return back.ok && back.value === value ? { ok: true } : { ok: false, why: 'The Keychain did not keep it.' };
    },
    remove: async (item) => {
      const fault = itemFault(item);
      if (fault !== null) return { ok: false, why: fault };
      const got = await run('security', ['delete-generic-password', '-s', item.service, '-a', item.account], null);
      if (got.code === 0) return { ok: true, had: true };
      if (got.code === MAC_NONE) return { ok: true, had: false };
      return { ok: false, why: 'The Keychain did not remove it.' };
    },
  };
}

/* ── Windows: Credential Manager ───────────────────────────────────────── */

/**
 * The helper over the system's credential calls, as C# for `Add-Type`. A generic credential, kept for this user on
 * this machine (`CRED_PERSIST_LOCAL_MACHINE`), its value as UTF-16 the way Credential Manager writes its own. Each call
 * answers 0 for done, 2 for not there and 1 for anything else; the buffer a value passed through is cleared after.
 */
const CRED_HELPER = [
  'using System;',
  'using System.Runtime.InteropServices;',
  'using System.Text;',
  'public static class BrainDogCred {',
  '  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]',
  '  struct Credential {',
  '    public int Flags; public int Type; public string TargetName; public string Comment;',
  '    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;',
  '    public int CredentialBlobSize; public IntPtr CredentialBlob; public int Persist;',
  '    public int AttributeCount; public IntPtr Attributes; public string TargetAlias; public string UserName;',
  '  }',
  '  [DllImport("advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]',
  '  static extern bool CredRead(string target, int type, int flags, out IntPtr cred);',
  '  [DllImport("advapi32.dll", EntryPoint = "CredWriteW", CharSet = CharSet.Unicode, SetLastError = true)]',
  '  static extern bool CredWrite(ref Credential cred, int flags);',
  '  [DllImport("advapi32.dll", EntryPoint = "CredDeleteW", CharSet = CharSet.Unicode, SetLastError = true)]',
  '  static extern bool CredDelete(string target, int type, int flags);',
  '  [DllImport("advapi32.dll")]',
  '  static extern void CredFree(IntPtr cred);',
  '  const int Generic = 1;',
  '  const int NotFound = 1168;',
  '  public static int Read(string target, out string value) {',
  '    value = null;',
  '    IntPtr p;',
  '    if (!CredRead(target, Generic, 0, out p)) return Marshal.GetLastWin32Error() == NotFound ? 2 : 1;',
  '    try {',
  '      Credential c = (Credential)Marshal.PtrToStructure(p, typeof(Credential));',
  '      byte[] b = new byte[c.CredentialBlobSize];',
  '      if (c.CredentialBlobSize > 0) Marshal.Copy(c.CredentialBlob, b, 0, c.CredentialBlobSize);',
  '      value = Encoding.Unicode.GetString(b);',
  '      Array.Clear(b, 0, b.Length);',
  '      return 0;',
  '    } finally { CredFree(p); }',
  '  }',
  '  public static int Write(string target, string user, string value) {',
  '    byte[] b = Encoding.Unicode.GetBytes(value);',
  '    Credential c = new Credential();',
  '    c.Type = Generic; c.TargetName = target; c.UserName = user; c.Persist = 2;',
  '    c.CredentialBlobSize = b.Length;',
  '    c.CredentialBlob = Marshal.AllocHGlobal(Math.Max(1, b.Length));',
  '    try {',
  '      Marshal.Copy(b, 0, c.CredentialBlob, b.Length);',
  '      return CredWrite(ref c, 0) ? 0 : 1;',
  '    } finally {',
  '      Marshal.Copy(new byte[b.Length], 0, c.CredentialBlob, b.Length);',
  '      Marshal.FreeHGlobal(c.CredentialBlob);',
  '      Array.Clear(b, 0, b.Length);',
  '    }',
  '  }',
  '  public static int Remove(string target) {',
  '    if (CredDelete(target, Generic, 0)) return 0;',
  '    return Marshal.GetLastWin32Error() == NotFound ? 2 : 1;',
  '  }',
  '}',
].join('\n');

/** A Credential Manager target for an item: `<service>:<account>`, as the contract names the sync key's. */
export const targetOf = (item: Item): string => `${item.service}:${item.account}`;

/**
 * The PowerShell that runs one call, with UTF-8 and no byte-order mark both ways (Node's JSON reader refuses a BOM, and
 * so does a person's file). The target and account are plain words (`itemFault`), so they are written into it as
 * literals; a value is read from standard input and never written here.
 */
export function credScript(op: 'read' | 'write' | 'remove', item: Item): string {
  const body =
    op === 'read'
      ? `$v = $null; $r = [BrainDogCred]::Read('${targetOf(item)}', [ref]$v); if ($r -eq 0) { [Console]::Out.Write($v) }; exit $r`
      : op === 'write'
        ? `$v = [Console]::In.ReadToEnd(); $r = [BrainDogCred]::Write('${targetOf(item)}', '${item.account}', $v); $v = $null; exit $r`
        : `$r = [BrainDogCred]::Remove('${targetOf(item)}'); exit $r`;
  return [
    "$ErrorActionPreference = 'Stop'",
    '$utf8 = New-Object System.Text.UTF8Encoding($false)',
    '[Console]::OutputEncoding = $utf8',
    '[Console]::InputEncoding = $utf8',
    `Add-Type -TypeDefinition @'\n${CRED_HELPER}\n'@`,
    body,
  ].join('\n');
}

/** A script as `-EncodedCommand` takes it: base64 of its UTF-16 little-endian bytes. */
export const encoded = (script: string): string => Buffer.from(script, 'utf16le').toString('base64');

const POWERSHELL = ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand'];

/** Credential Manager, through a PowerShell helper over the system's credential calls. */
export function credentialManager(run: Run = runProgram): SecretStore {
  const call = (op: 'read' | 'write' | 'remove', item: Item, input: string | null) => run('powershell.exe', [...POWERSHELL, encoded(credScript(op, item))], input);
  const read = async (item: Item): Promise<Found> => {
    const fault = itemFault(item);
    if (fault !== null) return { ok: false, why: fault };
    const got = await call('read', item, null);
    if (got.code === 0) return { ok: true, value: got.out };
    if (got.code === 2) return { ok: true, value: null };
    return { ok: false, why: got.code === -1 ? 'PowerShell did not start, so Credential Manager could not be asked.' : 'Credential Manager did not answer.' };
  };
  return {
    name: 'Credential Manager',
    read,
    write: async (item, value) => {
      const fault = itemFault(item);
      if (fault !== null) return { ok: false, why: fault };
      const got = await call('write', item, value);
      if (got.code === -1) return { ok: false, why: 'PowerShell did not start, so Credential Manager could not be asked.' };
      const back = await read(item);
      return got.code === 0 && back.ok && back.value === value ? { ok: true } : { ok: false, why: 'Credential Manager did not keep it.' };
    },
    remove: async (item) => {
      const fault = itemFault(item);
      if (fault !== null) return { ok: false, why: fault };
      const got = await call('remove', item, null);
      if (got.code === 0) return { ok: true, had: true };
      if (got.code === 2) return { ok: true, had: false };
      return { ok: false, why: 'Credential Manager did not remove it.' };
    },
  };
}

/* ── Linux: the secret service ─────────────────────────────────────────── */

/** The attributes an item is kept under: its service, and its account under the item's own attribute name. */
const attributes = (item: Item): string[] => ['service', item.service, item.attribute ?? 'account', item.account];

/** The secret service, through `secret-tool`. */
export function secretService(run: Run = runProgram): SecretStore {
  const read = async (item: Item): Promise<Found> => {
    const fault = itemFault(item);
    if (fault !== null) return { ok: false, why: fault };
    const got = await run('secret-tool', ['lookup', ...attributes(item)], null);
    if (got.code === 0) return { ok: true, value: got.out.replace(/\r?\n$/u, '') };
    /* `lookup` ANSWERS 1 FOR NOTHING THERE, with nothing printed. */
    if (got.code === 1 && got.out === '') return { ok: true, value: null };
    return { ok: false, why: got.code === -1 ? 'secret-tool did not start. Install it, with a keyring for it to keep keys in.' : 'The secret service did not answer.' };
  };
  return {
    name: 'the secret service',
    read,
    write: async (item, value) => {
      const fault = itemFault(item);
      if (fault !== null) return { ok: false, why: fault };
      const got = await run('secret-tool', ['store', `--label=${item.service} ${item.account}`, ...attributes(item)], value);
      if (got.code === -1) return { ok: false, why: 'secret-tool did not start. Install it, with a keyring for it to keep keys in.' };
      const back = await read(item);
      return got.code === 0 && back.ok && back.value === value ? { ok: true } : { ok: false, why: 'The secret service did not keep it.' };
    },
    remove: async (item) => {
      const fault = itemFault(item);
      if (fault !== null) return { ok: false, why: fault };
      const before = await read(item);
      if (before.ok && before.value === null) return { ok: true, had: false };
      const got = await run('secret-tool', ['clear', ...attributes(item)], null);
      return got.code === 0 ? { ok: true, had: true } : { ok: false, why: 'The secret service did not remove it.' };
    },
  };
}

/** The store this system keeps secrets in: the Keychain on a Mac, Credential Manager on Windows, else the secret service. */
export function storeFor(platform: string = process.platform, run: Run = runProgram): SecretStore {
  if (platform === 'darwin') return keychain(run);
  if (platform === 'win32') return credentialManager(run);
  return secretService(run);
}
