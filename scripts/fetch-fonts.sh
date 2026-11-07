#!/usr/bin/env bash
#
# Fetches the Satoshi webfonts into public/fonts/.
#
# Syne (OFL) is committed to the repository because its licence permits
# redistribution. Satoshi comes from Fontshare, which allows using the font in
# a product but not redistributing the files — so a fresh clone downloads them
# once instead. Everything works offline afterwards.
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$ROOT/public/fonts"
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

mkdir -p "$DEST"

if [ -f "$DEST/satoshi-400.woff2" ] && [ -f "$DEST/syne-latin.woff2" ]; then
  echo "✓ fonts already present in public/fonts/"
  exit 0
fi

echo "Downloading Syne…"
curl -fsS -o "$DEST/syne-latin.woff2" \
  "https://fonts.gstatic.com/s/syne/v24/8vIH7w4qzmVxm2BL9G78HEY.woff2"

echo "Downloading Satoshi…"
css="$(curl -fsS -A "$UA" "https://api.fontshare.com/v2/css?f[]=satoshi@300,400,500,700&display=swap")"

for weight in 300 400 500 700; do
  # each @font-face block carries its weight; take the woff2 url from that block
  url="$(printf '%s' "$css" | awk -v w="$weight" '
    /font-weight:/ { cur = $2; gsub(/;/, "", cur) }
    cur == w && /woff2/ {
      match($0, /https:\/\/[^'"'"')]+\.woff2/)
      if (RSTART) { print substr($0, RSTART, RLENGTH); exit }
    }')"
  if [ -z "$url" ]; then
    echo "  ! could not resolve Satoshi $weight" >&2
    continue
  fi
  curl -fsS -o "$DEST/satoshi-$weight.woff2" "$url"
  echo "  · satoshi-$weight.woff2"
done

echo "✓ fonts ready in public/fonts/"
ls -la "$DEST"
