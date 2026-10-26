#!/usr/bin/env bash
#
# Offline test launcher — rehearse before going live.
#
#   ./start-test.sh
#
# Same as ./start.sh but without the Python bridge, so it runs while you're
# not live. Type fake chat (!play, !skip, ...) in the Test Console window
# or at http://127.0.0.1:9091/console; songs really play through mpv and
# show up on the overlay.

set -euo pipefail

NO_BRIDGE=1 exec "$(cd "$(dirname "$0")" && pwd)/start.sh" "$@"
