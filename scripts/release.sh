#!/usr/bin/env bash
#
# Cuts a release: bumps the version everywhere, builds the signed bundle,
# writes the updater manifest and publishes it to GitHub Releases.
#
#   npm run release -- 0.2.0 "What changed"
#
# After this finishes, every installed copy of AuraForge offers the update on
# its next launch (and immediately if the user picks ⌘K → Check for updates).
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

VERSION="${1:-}"
NOTES="${2:-Release ${VERSION}}"
REPO="ArdaTkn/AuraForge"
KEY_FILE="${TAURI_SIGNING_PRIVATE_KEY_PATH:-$HOME/.tauri/auraforge.key}"

# ───────────────────────────── validate ─────────────────────────────

if [ -z "$VERSION" ]; then
  echo "usage: npm run release -- <version> [notes]"
  echo "   eg: npm run release -- 0.2.0 \"Sharper shockwave rings\""
  exit 1
fi

if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "version must look like 1.2.3 (got: $VERSION)"
  exit 1
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "! working tree is dirty — commit or stash first so the release tag matches the source"
  exit 1
fi

if [ ! -f "$KEY_FILE" ]; then
  echo "! no signing key at $KEY_FILE"
  echo "  create one with:  npx tauri signer generate -w \"$KEY_FILE\""
  echo "  (losing it means you can never sign another update)"
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "! gh is not authenticated — run: gh auth login"
  exit 1
fi

# ─────────────────────────── bump version ───────────────────────────

echo "▶ bumping to $VERSION"
node -e '
const fs = require("fs");
const v = process.argv[1];

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
pkg.version = v;
fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");

const conf = JSON.parse(fs.readFileSync("src-tauri/tauri.conf.json", "utf8"));
conf.version = v;
fs.writeFileSync("src-tauri/tauri.conf.json", JSON.stringify(conf, null, 2) + "\n");

const cargo = fs.readFileSync("src-tauri/Cargo.toml", "utf8");
fs.writeFileSync(
  "src-tauri/Cargo.toml",
  cargo.replace(/^version = "[^"]*"/m, `version = "${v}"`),
);
' "$VERSION"

# the lock file carries the crate version too — let cargo rewrite it
( cd src-tauri && cargo update -p auraforge --offline >/dev/null 2>&1 || true )

# ─────────────────────────── build & sign ───────────────────────────

export TAURI_SIGNING_PRIVATE_KEY
TAURI_SIGNING_PRIVATE_KEY="$(cat "$KEY_FILE")"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}"

echo "▶ bundling the dmg (best effort)"
# The dmg bundler consumes the .app it packages, so it has to run BEFORE the
# app target. It is also the flaky one — hdiutil intermittently refuses to
# unmount its own scratch volume — hence best-effort.
npm run tauri -- build --bundles dmg >/dev/null 2>&1 \
  || echo "  ! dmg step failed (hdiutil was busy) — releasing without it"

echo "▶ building the signed bundle"
npm run build
# `app` is the target that produces the updater artifacts (.app.tar.gz + .sig)
# and it must be the last thing to run, or the dmg step deletes the app.
npm run tauri -- build --bundles app

MACOS_DIR="src-tauri/target/release/bundle/macos"
DMG_DIR="src-tauri/target/release/bundle/dmg"

APP="$MACOS_DIR/AuraForge.app"
TARBALL="$MACOS_DIR/AuraForge.app.tar.gz"
SIG="$MACOS_DIR/AuraForge.app.tar.gz.sig"
DMG="$(ls -t "$DMG_DIR"/AuraForge_"$VERSION"_*.dmg 2>/dev/null | head -1 || true)"
rm -f "$MACOS_DIR"/rw.*.dmg 2>/dev/null || true

# the .app is a convenience, not a release asset — the updater ships the tarball
[ -e "$APP" ] || echo "  (no bare .app in the bundle dir — the tarball is what ships)"
for f in "$TARBALL" "$SIG"; do
  if [ ! -e "$f" ]; then
    echo "! expected artifact missing: $f"
    echo "  (is bundle.createUpdaterArtifacts still true in tauri.conf.json?)"
    exit 1
  fi
done

case "$(uname -m)" in
  arm64) PLATFORM="darwin-aarch64" ;;
  x86_64) PLATFORM="darwin-x86_64" ;;
  *) PLATFORM="darwin-$(uname -m)" ;;
esac

# ─────────────────────── updater manifest ───────────────────────

echo "▶ writing latest.json"
node -e '
const fs = require("fs");
const [version, platform, sigPath, notes] = process.argv.slice(1);
const signature = fs.readFileSync(sigPath, "utf8").trim();
const manifest = {
  version,
  notes,
  pub_date: new Date().toISOString(),
  platforms: {
    [platform]: {
      signature,
      url: `https://github.com/ArdaTkn/AuraForge/releases/download/v${version}/AuraForge.app.tar.gz`,
    },
  },
};
fs.writeFileSync("latest.json", JSON.stringify(manifest, null, 2) + "\n");
' "$VERSION" "$PLATFORM" "$SIG" "$NOTES"

echo "▶ committing the version bump"
git add -A
git commit -q -m "Release v$VERSION

$NOTES"
git push -q origin HEAD

# ─────────────────────────── publish ───────────────────────────

TAG="v$VERSION"
ASSETS=("$TARBALL" "$SIG" "latest.json")
if [ -n "$DMG" ]; then ASSETS+=("$DMG"); else echo "  (no dmg — the updater does not need one)"; fi

if gh release view "$TAG" --repo "$REPO" >/dev/null 2>&1; then
  echo "▶ release $TAG already exists — replacing its assets"
  gh release upload "$TAG" "${ASSETS[@]}" --repo "$REPO" --clobber
else
  echo "▶ creating release $TAG"
  gh release create "$TAG" "${ASSETS[@]}" \
    --repo "$REPO" \
    --title "AuraForge $VERSION" \
    --notes "$NOTES"
fi

rm -f latest.json

echo
echo "✓ AuraForge $VERSION published"
echo "  https://github.com/$REPO/releases/tag/$TAG"
echo
echo "  Every installed copy picks this up on next launch."
echo "  To try it right now: ⌘K → \"Check for updates\""
