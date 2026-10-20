# BrainDog for Mac

A thin Tauri 2 window around `https://brain.dog/app` (plan: `docs/55-DESKTOP-APP.md`). The web app is the product; this
shell only adds what a tab cannot do:

- Option+Space from anywhere brings the window forward and opens Slash.
- The Dock badge shows the Needs you count.
- Native notifications.
- Links that leave BrainDog open in the default browser.
- The app menu (About, Settings, Quit), Edit, Go and Window, and the window's size and place are remembered.
- An overlay title bar. The page reads `inset` (78 px) and the top 40 px of the window drags it.

The bridge is `src-tauri/src/bridge.js`. It sets `window.__BRAINDOG_SHELL__` (`open`, `notify`, `badge`, `inset`, `on`)
exactly as `apps/web/src/lib/shell.ts` reads it, and only on the brain.dog origin. Only brain.dog may call the four
commands, named in `src-tauri/capabilities/remote.json`.

## Build

Needs Xcode (with its command line tools) and Rust. This folder is not part of `pnpm test` or `pnpm build`.

```sh
xcode-select --install          # if Xcode's tools are not installed
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
cargo install tauri-cli --version "^2" --locked

cd apps/desktop/src-tauri
cargo tauri icon icons/icon.png   # makes the full icon set from the web app's 512 px icon
cargo tauri dev                   # opens the window on brain.dog/app
BRAINDOG_URL=http://localhost:5173/app cargo tauri dev   # a debug build only: against a local web app
cargo tauri build --target universal-apple-darwin        # Apple silicon and Intel; needs both rust targets
```

Add the targets once with `rustup target add aarch64-apple-darwin x86_64-apple-darwin`.

## Signing and notarising (his Apple Developer Program sitting)

An unsigned build runs on the Mac that made it. To give it to anyone else it must be signed and notarised.
`src-tauri/signing.example.env` lists the four placeholders (Developer ID identity, team id, Apple ID, app-specific
password). Export the real values in the shell that runs `cargo tauri build`; the certificate stays in the keychain.
`tauri.conf.json` has `signingIdentity: null` on purpose; nothing real is written in this folder.

## Sign-in, menu and updates (batch 2)

- **Google sign-in.** The sign-in page, inside the app, opens `/auth/google/start?desktop=1&challenge=` in the default
  browser (the window keeps the PKCE verifier). The worker ends on `braindog://auth?code=`, a sealed one-time code
  (two minutes, the unspent sign-in link inside it); the shell loads `/app/signin/desktop?code=`, which posts the code and
  verifier to `/auth/google/desktop` and gets the session cookie in the window. Passkey and email link are unchanged.
- **Go menu.** Today, Needs you, Projects, Money, Agents (Cmd+1 to 5), Settings (Cmd+,) and Slash (Cmd+K) send `goto`
  with an `/app/...` path; the web layout follows it and ignores any other address. Projects, Money and Agents use
  `/app/p/portfolio`, `/app/p/money` and `/app/p/agents`; change `GO` in `lib.rs` if those pages are named otherwise.
- **Updater.** `tauri-plugin-updater` reads `https://brain.dog/desktop/latest.json` at launch and installs a signed
  update. `plugins.updater.pubkey` in `tauri.conf.json` is a placeholder until the key is made (see
  `signing.example.env`). The download page `/download` on the site is held until `LAUNCH.public`.

## Not done yet

- **The signing sitting.** Generate the updater key, put its public half in `tauri.conf.json`, build signed and notarised,
  publish the DMG and `latest.json` under `brain.dog/desktop/`, and fill the real file name into the site's download page.
- **Deep link in dev.** macOS registers `braindog://` only for a built, installed app, not `cargo tauri dev`.
- Nothing here has been compiled yet: the first `cargo tauri dev` may need small fixes.
