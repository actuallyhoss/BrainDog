# BrainDog for Windows and Linux, later

**This is not the Mac app.** BrainDog for Mac is the native SwiftUI app in `apps/apple` (target `BrainDogMac`, the same
bundle id `dog.brain.desktop`), which replaced this shell before anything here was published (apps plan of 2 November,
`loop/plans/apps-2026-11-02/PLAN.md` section 1, and M6). Nobody has this build: `/download` stayed held, and the
updater key below has signed nothing anyone installed.

This folder is kept as the shell for **Windows and Linux**, which are not in v1 (plan section 9). When they are built,
Tauri 2's Windows (WebView2) and Linux (WebKitGTK) targets start from here, with the same bridge contract as the native
apps (`window.__BRAINDOG_SHELL__`, `apps/web/src/lib/shell.ts`). Until then:

- **Do not publish it, and do not run `release.mjs --publish`.** A Mac dmg from here would compete with the native app
  for the same bundle id; the native app's updates come from Sparkle (`apps/apple/Mac/Updates.swift`), not from
  `brain.dog/desktop/latest.json`.
- Everything below describes the shell as it stood on 24 October, on the Mac, where it was built and checked. The
  Mac-only parts (Entitlements, notarising, the dmg) are history; the bridge, the menus, the offline page and the sign-in
  handoff are what a Windows or Linux build would carry over.

## What the shell did (on the Mac, 24 October)

A thin Tauri 2 window around `https://app.brain.dog` (plan: `docs/55-DESKTOP-APP.md`). The web app is the product; this
shell only adds what a tab cannot do:

- Option+Space from anywhere brings the window forward with Ask open (the app menu can turn the key off).
- The Dock badge shows the Needs you count.
- Native notifications.
- Links that leave BrainDog open in the default browser.
- The app menu (About, Settings…, Open at login, the ⌥Space switch, Quit), Edit, View, Go, Window and Help, and the
  window's size and place are remembered.
- Exports and backups save to Downloads; offline at launch, the bundled `ui/index.html` says so with Try again.
- An overlay title bar. The page reads `inset` (78 px) and the top 40 px of the window drags it.

The bridge is `src-tauri/src/bridge.js`. It sets `window.__BRAINDOG_SHELL__` (`open`, `notify`, `badge`, `inset`, `on`)
exactly as `apps/web/src/lib/shell.ts` reads it, and only on the app.brain.dog origin. Only app.brain.dog may call the
five commands, named in `src-tauri/capabilities/remote.json`.

## Build

Needs Xcode (with its command line tools) and Rust. This folder is not part of `pnpm test` or `pnpm build`.

```sh
xcode-select --install          # if Xcode's tools are not installed
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
cargo install tauri-cli --version "^2" --locked

cd apps/desktop/src-tauri
cargo tauri icon icons/icon.png   # makes the full icon set from the web app's 512 px icon
cargo tauri dev                   # opens the window on app.brain.dog
BRAINDOG_URL=http://localhost:5173 cargo tauri dev   # a debug build only: against a local web app
cargo tauri build --target universal-apple-darwin        # Apple silicon and Intel; needs both rust targets
# Build outside the tree (CARGO_TARGET_DIR): an in-tree target/ is 1.6 GB the repo's gates would read file by file.
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
  (two minutes, the unspent sign-in link inside it); the shell loads `/signin/desktop?code=`, which posts the code and
  verifier to `/auth/desktop` and gets the session cookie in the window.
- **Email link.** In the app the link request carries the window's challenge (`app`), the mailed link carries it as
  `?app=`, and the page it opens in the browser offers "Open BrainDog for Mac": `/auth/desktop/handoff` seals the
  unspent link to the challenge and the browser goes to `braindog://auth?code=`, the same way back as Google's.
- **Passkeys** need Associated Domains (`src-tauri/Entitlements.plist`), which the release adds only with the Developer
  ID provisioning profile at `src-tauri/BrainDog.provisionprofile` (out of git), and `APPLE_TEAM_ID` set on the worker
  so `/.well-known/apple-app-site-association` names the app.
- **Go menu.** Today and Needs you (Cmd+1 and 2) and Settings (Cmd+,) send `goto` with a path in the app, which the web
  layout follows inside the BrainDog on screen and never to one of the host's doors; Search (Cmd+K) and Ask Slash
  (Cmd+J) send `search` and `slash`. A notification's click sends its own `goto`.
- **Updater.** `tauri-plugin-updater` reads `https://brain.dog/desktop/latest.json` at launch and every six hours and
  installs a signed update. The download page `/download` on the site is held until a notarised build is published.

## Releasing (E50 to E52)

- **The updater key** is made once with `node tools/desktop/updater-key.mjs`: the private half and its password are in
  this Mac's keychain (`braindog-desktop-updater-key`, `braindog-desktop-updater-password`), the public half is in
  `tauri.conf.json`. `--check` says whether both are in place. Never make a second pair: installed apps trust this one.
- **The build** is `node tools/desktop/release.mjs` (`--universal` for Apple silicon and Intel). It signs and notarises
  when the keychain holds a "Developer ID Application" identity and `signing.env` (or the shell) holds the notarisation
  account; with none it builds an UNSIGNED `apps/desktop/dist/BrainDog.dmg` that runs on this Mac only, and says so.
  The update archive and `latest.json` are always signed with the updater key.
- **The version** is raised with `--version 0.2.0` (tauri.conf.json and Cargo.toml); a version already live is refused.
- **The download** opens with `--publish`, which only a build Gatekeeper accepts as notarised reaches: it uploads the
  dmg, the versioned update archive and `latest.json` (last) to the R2 bucket `braindog-desktop`, served at
  `download.brain.dog`, and once the dmg answers there sets `DESKTOP_NOTARIZED` (`apps/site/src/lib/desktop.ts`),
  which takes `/download` out of the site's held list. `brain.dog/desktop/*` redirects to the bucket
  (`apps/site/static/_redirects`). It needs `CLOUDFLARE_API_TOKEN` (R2 edit) and `CLOUDFLARE_ACCOUNT_ID` in the
  environment or `signing.env`, or `wrangler login`. Commit desktop.ts with a changelog entry, then deploy the site.
  A publish that stopped after its build (an upload that failed, or the dmg not answering yet) is finished with
  `--upload-only`, which builds nothing and sends what `apps/desktop/dist` holds, even when that version is live.

## Before a Windows or Linux build

- Targets: `x86_64-pc-windows-msvc` (WebView2, an MSI or NSIS installer, Authenticode signing) and Linux (WebKitGTK,
  AppImage and deb). Neither has been built.
- A Windows or Linux updater key of their own, or this one; this pair has signed nothing anyone installed.
- `MAC_APP` in `apps/worker/src/apple.ts` names the native Mac app; nothing here needs Apple's association file.
- **Deep link in dev.** An OS registers `braindog://` only for a built, installed app, not `cargo tauri dev`.
