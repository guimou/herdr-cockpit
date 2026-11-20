#!/usr/bin/env bash
# Copies the cockpit mod and its two layouts into the Herdr app's home.
# Herdr loads images and hot-reloads mods only from real files inside its home,
# so this copies; a symlink to the repository would not work.
#
#   tools/install.sh            install or update
#   HERDR_APP_HOME=... tools/install.sh
#
# keys.json is never touched: Herdr stops updating a keys file once it has been
# edited, so merging the cockpit keys is left to you (see the end of the output).

set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
home="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"

if [ ! -d "$home" ]; then
  echo "Herdr home not found at $home. Start Herdr once, or set HERDR_APP_HOME." >&2
  exit 1
fi

mkdir -p "$home/mods" "$home/layouts"

# Replace the mod folder as a whole so files removed from the repository go too.
rm -rf "$home/mods/cockpit"
cp -R "$repo/mods/cockpit" "$home/mods/cockpit"
cp "$repo/layouts/cockpit.json" "$repo/layouts/cockpit-ambient.json" "$home/layouts/"

echo "Installed mods/cockpit and layouts cockpit, cockpit-ambient into $home"

# Your crew assignments live in $home/cockpit-roster.json, outside the mod.
# Put them back over the default roster that was just copied.
if [ -f "$home/cockpit-roster.json" ]; then
  if command -v node >/dev/null 2>&1; then
    HERDR_APP_HOME="$home" node "$repo/tools/crew.mjs" sync && echo "Restored your crew assignments"
  else
    echo "node not found: your crew assignments were not restored. Run 'tools/crew.mjs sync' once node is available." >&2
  fi
fi

# Make the crew tool available as 'crew', unless something else already has that name.
bin="$HOME/.local/bin"
if [ -d "$bin" ] && { [ ! -e "$bin/crew" ] || [ "$(readlink "$bin/crew" 2>/dev/null)" = "$repo/tools/crew.mjs" ]; }; then
  ln -sf "$repo/tools/crew.mjs" "$bin/crew" && echo "Linked $bin/crew"
fi

if command -v herdr-app >/dev/null 2>&1; then
  herdr-app check "$home/mods/cockpit" && echo "herdr-app check passed"
else
  echo "herdr-app not on PATH: run 'herdr-app check $home/mods/cockpit' yourself."
fi

cat <<EOF

Next:
  1. Merge the two sections of $repo/keys.json into $home/keys.json.
  2. Switch to the layout:  herdr-app do layout.switch --name cockpit
  3. Assign crew:  crew assign vega <space name>   (crew --help for the rest)
  4. Check $home for layout.error or keys.error, and 'herdr-app status' for mod errors.
EOF
