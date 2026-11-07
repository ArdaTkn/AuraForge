#!/usr/bin/env bash
#
# Installs AuraForge into /Applications so it behaves like any other Mac app:
# Spotlight (⌘Space → "AuraForge"), Launchpad and the Dock all find it, and no
# terminal is involved ever again.
#
#   npm run app:build && npm run app:install
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/src-tauri/target/release/bundle/macos/AuraForge.app"
DEST="/Applications/AuraForge.app"

if [ ! -d "$SRC" ]; then
  echo "No build found at:"
  echo "  $SRC"
  echo
  echo "Build it first:  npm run app:build"
  exit 1
fi

# a running copy would keep the old binary alive and lock bundle resources
if pgrep -f "AuraForge.app/Contents/MacOS" >/dev/null 2>&1; then
  echo "Quitting the running copy…"
  pkill -f "AuraForge.app/Contents/MacOS" || true
  sleep 1
fi

if [ -w /Applications ]; then
  INSTALL_DIR="/Applications"
else
  INSTALL_DIR="$HOME/Applications"
  DEST="$INSTALL_DIR/AuraForge.app"
  mkdir -p "$INSTALL_DIR"
  echo "/Applications is not writable — installing to $INSTALL_DIR instead."
fi

rm -rf "$DEST"
cp -R "$SRC" "$DEST"

# A locally built bundle carries no quarantine flag, but copying it around can
# pick one up; clearing it keeps Gatekeeper from second-guessing a local build.
xattr -dr com.apple.quarantine "$DEST" 2>/dev/null || true

SIZE="$(du -sh "$DEST" | cut -f1)"

# Register this copy so LaunchServices resolves "AuraForge" to /Applications
# even though a build directory copy also exists on disk.
LSREGISTER="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
[ -x "$LSREGISTER" ] && "$LSREGISTER" -f "$DEST" >/dev/null 2>&1 || true

echo
echo "✓ Installed  $DEST  ($SIZE)"
echo
echo "Open it any of these ways:"
echo "  · ⌘Space then type  AuraForge"
echo "  · Launchpad → AuraForge"
echo "  · terminal:  open -a \"$DEST\"     (or: npm run app:open)"
echo
echo "Optional — a short terminal command, added once:"
echo "  echo \"alias auraforge='open -a \\\"$DEST\\\"'\" >> ~/.zshrc && exec zsh"
