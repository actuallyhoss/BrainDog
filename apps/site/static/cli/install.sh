#!/bin/sh
# Installs braindog, BrainDog's command line, for the person who runs it, on macOS and Linux:
#
#   curl -fsSL https://brain.dog/cli/install.sh | sh
#
# WHAT IT WRITES, AND NOTHING ELSE. The command is one JavaScript file, built by apps/cli/scripts/bundle.mjs and
# published beside this script by the deploy. It goes to ~/.braindog/bin/braindog.mjs, with a two-line shim called
# braindog beside it, and ~/.braindog/bin goes on the PATH through one line in the shell's startup file when it is
# not there already. No sudo, no system folder. Once installed, `braindog update` keeps it current: it reads the build
# published beside this script, downloads the same file to the same sum, keeps the old one as braindog.mjs.prev, and
# places the Agent Skill and hooks again. Running this script again still works, and is how a command older than the
# update verb catches up the first time.
#
# THE FILE IS HELD TO ITS SHA-256 BEFORE IT REPLACES ANYTHING. The sum is published from the same place, so it catches
# a download cut short or altered on the way; it does not defend against someone able to change what the site
# serves, who could change both. It is computed with Node, which the command needs anyway, because macOS has
# shasum and not sha256sum and some Linux images have neither.
#
# AND TO ITS SIGNATURE BEFORE IT RUNS, once PIN holds a key (apps/cli/src/release-key.ts, tools/ship/cli-key.mjs): one made at
# release with a key that is not on the site. Empty, the sum alone. THIS SCRIPT COMES FROM THE SITE TOO, so the pin holds
# against the bundle being swapped on its own, and against somebody who can rewrite the site only if you read this
# script before running it and compare PIN with the keys published in apps/cli/README.md in the repository: that is the check.
#
# NODE IS NOT INSTALLED FOR YOU. The command runs on Node 24.13 or later (apps/cli/package.json, engines), and which
# Node a machine has is its owner's choice, so a missing or older one stops this with the address to get one.

set -eu

BASE='https://brain.dog/cli'
PIN='KO5elmVCY0qrMP33qBHbPiKr-0vj58zCmV-4cnXFoZ0'

say() { printf '%s\n' "$*"; }
die() {
  printf '%s\n' "$*" >&2
  exit 1
}

[ -n "${HOME:-}" ] || die 'braindog installs into your home folder, and HOME is not set in this shell.'
DIR="$HOME/.braindog/bin"

command -v node >/dev/null 2>&1 || die 'braindog runs on Node.js 24.13 or later, and there is no node on this PATH. Install it from https://nodejs.org, then run this again.'
node -e 'const [a, b] = process.versions.node.split(".").map(Number); process.exit(a > 24 || (a === 24 && b >= 13) ? 0 : 1)' ||
  die "braindog runs on Node.js 24.13 or later, and this node is $(node --version). Update it from https://nodejs.org, then run this again."

if command -v curl >/dev/null 2>&1; then
  fetch() { curl -fsSL --proto "=${BASE%%:*}" --tlsv1.2 --retry 2 -o "$2" "$1"; }
elif command -v wget >/dev/null 2>&1; then
  fetch() { wget -q --https-only -O "$2" "$1"; }
else
  die 'Downloading braindog needs curl or wget, and this machine has neither.'
fi

mkdir -p "$DIR"
# THE DOWNLOAD LANDS BESIDE ITS DESTINATION, so the move that replaces an installed copy is a rename on one file
# system and a command running from the old file is never left reading half of the new one.
TMP=$(mktemp -d "$DIR/.download.XXXXXX")
trap 'rm -rf "$TMP"' EXIT
trap 'exit 1' INT TERM

fetch "$BASE/braindog.mjs" "$TMP/braindog.mjs" || die "braindog could not be downloaded from $BASE/braindog.mjs."
fetch "$BASE/braindog.mjs.sha256" "$TMP/braindog.mjs.sha256" || die "The checksum could not be downloaded from $BASE/braindog.mjs.sha256."

want=$(cut -d ' ' -f 1 <"$TMP/braindog.mjs.sha256")
case $want in
  '' | *[!0-9a-f]*) die "The checksum at $BASE/braindog.mjs.sha256 is not a SHA-256, so nothing was installed." ;;
esac
[ "${#want}" -eq 64 ] || die "The checksum at $BASE/braindog.mjs.sha256 is not a SHA-256, so nothing was installed."
got=$(node -e 'process.stdout.write(require("node:crypto").createHash("sha256").update(require("node:fs").readFileSync(process.argv[1])).digest("hex"))' "$TMP/braindog.mjs")
[ "$got" = "$want" ] || die "The download does not match its checksum (expected $want, got $got), so nothing was installed. Run this again to download it afresh."

if [ -n "$PIN" ]; then
  fetch "$BASE/braindog.mjs.sig" "$TMP/braindog.mjs.sig" || die "This build has no signature at $BASE/braindog.mjs.sig, so nothing was installed. Run this again in a few minutes; if it says the same, do not install it another way."
  fetch "$BASE/braindog.mjs.build" "$TMP/braindog.mjs.build" || die "The build could not be read from $BASE/braindog.mjs.build, so nothing was installed."
  node -e 'const c=require("node:crypto"),f=require("node:fs");const [pin,sum,build,sig]=process.argv.slice(1);const [r,b]=f.readFileSync(sig,"utf8").trim().split(/\s+/);const s=Buffer.from(b||"","base64url");const m=Buffer.from("braindog-cli release\n"+sum+"\n"+build+"\n"+r+"\n");process.exit(/^\d+$/.test(r)&&s.length===64&&pin.split(" ").some((x)=>{try{return c.verify(null,m,{key:{kty:"OKP",crv:"Ed25519",x},format:"jwk"},s)}catch(e){return false}})?0:1)' "$PIN" "$got" "$(tr -d '[:space:]' <"$TMP/braindog.mjs.build")" "$TMP/braindog.mjs.sig" ||
    die 'The signature on this build is not BrainDog'"'"'s, so nothing was installed and it did not run. Run this again in a few minutes; if it says the same, do not install it another way.'
fi

# ASKED BEFORE IT IS PUT IN PLACE, so a file this Node cannot run never replaces one that works.
node "$TMP/braindog.mjs" --version >/dev/null 2>&1 || die 'The downloaded braindog did not run under this Node, so nothing was installed.'

chmod 755 "$TMP/braindog.mjs"
mv -f "$TMP/braindog.mjs" "$DIR/braindog.mjs"

# THE SHIM NAMES THE FILE BY ITS FULL PATH, quoted for sh, so it runs the same from any folder and under any
# shell that starts it. A single quote in the path is closed, escaped and reopened.
quoted=$(printf '%s' "$DIR/braindog.mjs" | sed "s/'/'\\\\''/g")
printf '#!/bin/sh\nexec node '\''%s'\'' "$@"\n' "$quoted" >"$TMP/braindog"
chmod 755 "$TMP/braindog"
mv -f "$TMP/braindog" "$DIR/braindog"

say "Installed braindog at $DIR/braindog.mjs:"
say "  $(node "$DIR/braindog.mjs" --version)"

case ":${PATH:-}:" in
  *":$DIR:"*)
    say 'Run braindog --version to check it.'
    exit 0
    ;;
esac

# NOT ON THE PATH YET, so one line goes into the startup file of the shell this person uses, once. A pipe into sh
# cannot change the PATH of the terminal it was typed in, so the last line says what to do in this one.
shell_name=$(basename "${SHELL:-sh}")
case $shell_name in
  zsh) rc="${ZDOTDIR:-$HOME}/.zshrc" ;;
  bash)
    # macOS opens every Terminal window as a login shell, which reads .bash_profile and not .bashrc.
    if [ "$(uname -s)" = Darwin ]; then rc="$HOME/.bash_profile"; else rc="$HOME/.bashrc"; fi
    ;;
  fish) rc="$HOME/.config/fish/conf.d/braindog.fish" ;;
  *) rc="$HOME/.profile" ;;
esac

if [ "$shell_name" = fish ]; then
  line='fish_add_path "$HOME/.braindog/bin"'
  mkdir -p "$(dirname "$rc")"
else
  line='export PATH="$HOME/.braindog/bin:$PATH"'
fi

if ! grep -qs '\.braindog/bin' "$rc"; then
  printf '\n# braindog, BrainDog'\''s command line (https://brain.dog/cli)\n%s\n' "$line" >>"$rc"
  say "Added $DIR to your PATH in $rc."
fi
say 'Open a new terminal, or run this line in this one, and braindog --version answers:'
say "  $line"
