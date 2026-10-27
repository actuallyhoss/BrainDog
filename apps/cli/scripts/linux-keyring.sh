#!/bin/sh
# Setup sync on a real Linux keyring: apps/cli/test/sync-flow.test.ts run in a throwaway Linux container, with a
# session bus and an unlocked GNOME keyring, through `secret-tool` (`secretService` in apps/cli/src/secret-store.ts).
#
#   sh apps/cli/scripts/linux-keyring.sh
#
# Needs Docker (OrbStack on his Mac: `orb start`). The checkout is mounted read only at its own path, so the
# installed packages resolve as they do here; the keyring and every home the test makes live in the container and go
# with it. The keyring's password is a word made up for this run. Nothing of this machine's store is asked anything.
set -eu
ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
IMAGE=${BRAINDOG_KEYRING_IMAGE:-node:24-bookworm}
exec docker run --rm -v "$ROOT:$ROOT:ro" -w "$ROOT/apps/cli" -e BRAINDOG_TEST_STORE=secret-service "$IMAGE" sh -c '
  set -eu
  apt-get update -qq >/dev/null
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends gnome-keyring libsecret-tools dbus >/dev/null
  dbus-run-session -- sh -c "
    printf %s keyring-drill | gnome-keyring-daemon --unlock --components=secrets >/dev/null
    printf %s probe | secret-tool store --label=probe service bd-probe account probe
    test \"\$(secret-tool lookup service bd-probe account probe)\" = probe
    secret-tool clear service bd-probe account probe
    echo \"keyring: secret-tool stores, reads and clears on \$(. /etc/os-release && echo \$PRETTY_NAME)\"
    node --test test/sync-flow.test.ts
  "
'
