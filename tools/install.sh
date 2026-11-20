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

# The "Ships" panel is Herdr's own Spaces mod with its heading renamed. The
# heading is fixed in the mod's code, so this makes a renamed copy from the
# Spaces mod installed here and points the cockpit layout at it. A copy does not
# follow Herdr's updates: run this script again after updating Herdr to refresh
# it. If the heading is not where it is expected, the layout keeps plain Spaces.
ships=""
if grep -q 'el\.child("Spaces")' "$home/mods/spaces/main.js" 2>/dev/null; then
  rm -rf "$home/mods/ships"
  mkdir "$home/mods/ships"
  sed 's/el\.child("Spaces")/el.child("Ships")/' "$home/mods/spaces/main.js" > "$home/mods/ships/main.js"
  sed 's/"title": *"Spaces"/"title": "Ships"/' "$home/mods/spaces/mod.json" > "$home/mods/ships/mod.json"
  sed 's/"mod": "spaces"/"mod": "ships"/' "$repo/layouts/cockpit.json" > "$home/layouts/cockpit.json"
  ships="yes"
  echo "Made the Ships panel from Herdr's Spaces mod"
else
  rm -rf "$home/mods/ships"
  echo "Could not rename the Spaces panel to Ships (Herdr's Spaces mod is missing or has changed): keeping Spaces." >&2
fi

echo "Installed mods/cockpit and layouts cockpit, cockpit-ambient into $home"

if command -v herdr-app >/dev/null 2>&1; then
  herdr-app check "$home/mods/cockpit" && echo "herdr-app check passed"
  if [ -n "$ships" ]; then herdr-app check "$home/mods/ships" && echo "herdr-app check passed for the Ships panel"; fi
else
  echo "herdr-app not on PATH: run 'herdr-app check $home/mods/cockpit' yourself."
fi

cat <<EOF

Next:
  1. Merge the two sections of $repo/keys.json into $home/keys.json.
  2. Switch to the layout:  herdr-app do layout.switch --name cockpit
  3. Check $home for layout.error or keys.error, and 'herdr-app status' for mod errors.
EOF
