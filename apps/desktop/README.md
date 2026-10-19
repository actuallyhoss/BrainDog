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

## Not done yet

- **Google sign-in return.** The shell opens Google in the browser and handles `braindog://auth?code=...` by loading
  `/app/signin/desktop?code=...` in the window. The server side does not exist: the worker must start the flow in a
  desktop flavour, redirect to `braindog://auth?code=<one-time code>` at the end, and serve that page to swap the code
  for a session. See the TODO(server) in `src-tauri/src/lib.rs`.
- **Menu paths.** Settings sends `goto` with `/app/settings`, and `braindog://goto/<path>` sends the path; the web does
  not listen for `goto` yet (`onShell('goto', ...)` has no caller) and must map them. Go menu has Slash only; the
  Today, Projects, Needs you and Agents items wait on those routes.
- **Updater and the DMG download** (batch B): signed updates need an updater key; the DMG goes to `brain.dog/download`.
- **Deep link in dev.** macOS registers `braindog://` only for a built, installed app, not `cargo tauri dev`.
- Nothing here has been compiled yet: the first `cargo tauri dev` may need small fixes.
