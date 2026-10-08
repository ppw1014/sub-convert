#!/bin/sh
set -eu

# Build the mobile rule bundle from one pinned clash-rules commit.
# Usage: MIHOMO_BIN=/path/to/mihomo scripts/build_mobile_rules.sh

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
OUTPUT_DIR=${OUTPUT_DIR:-"$ROOT_DIR/subweb/public/mobile-rules"}
RULES_REF=${RULES_REF:-c0c53bb50042de6aaff97785267d9e4adbef8806}
MIHOMO_BIN=${MIHOMO_BIN:-mihomo}
SOURCE_BASE="https://raw.githubusercontent.com/Loyalsoldier/clash-rules/$RULES_REF"
TMP_DIR=${TMPDIR:-/tmp}/sub-convert-mobile-rules.$$
STAGING_DIR="$TMP_DIR/output"
CONFIG_OUTPUT="$TMP_DIR/loyalsoldier_mihomo_mobile.yml"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT INT TERM

if ! command -v "$MIHOMO_BIN" >/dev/null 2>&1 && [ ! -x "$MIHOMO_BIN" ]; then
  echo "mihomo was not found; set MIHOMO_BIN to a pinned mihomo binary" >&2
  exit 1
fi

mkdir -p "$STAGING_DIR" "$TMP_DIR/raw"

build_rule() {
  name=$1
  behavior=$2
  curl -fLsS --retry 3 --connect-timeout 10 --max-time 120 \
    "$SOURCE_BASE/$name.txt" -o "$TMP_DIR/raw/$name.yaml"
  "$MIHOMO_BIN" convert-ruleset "$behavior" yaml "$TMP_DIR/raw/$name.yaml" "$STAGING_DIR/$name.mrs"
}

build_rule reject domain
build_rule direct domain
build_rule proxy domain
build_rule private domain
build_rule icloud domain
build_rule apple domain
build_rule google domain
build_rule lancidr ipcidr
build_rule cncidr ipcidr
build_rule telegramcidr ipcidr

MOBILE_CONFIG_OUTPUT="$CONFIG_OUTPUT" node "$ROOT_DIR/scripts/build_mobile_config.mjs"

hash_file() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    echo "shasum or sha256sum was not found" >&2
    exit 1
  fi
}

{
  printf '{\n  "rulesRef": "%s",\n  "compiler": "' "$RULES_REF"
  "$MIHOMO_BIN" -v | tr '\n' ' ' | sed 's/[[:space:]]*$//'
  printf '",\n  "generatedAt": "%s",\n  "files": {\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  first=true
  for name in reject direct proxy private icloud apple google lancidr cncidr telegramcidr; do
    [ "$first" = true ] || printf ',\n'
    first=false
    size=$(wc -c < "$STAGING_DIR/$name.mrs" | tr -d ' ')
    sha=$(hash_file "$STAGING_DIR/$name.mrs")
    printf '    "%s": {"bytes": %s, "sha256": "%s"}' "$name" "$size" "$sha"
  done
  printf '\n  }\n}\n'
} > "$STAGING_DIR/manifest.json"

mkdir -p "$OUTPUT_DIR"
for name in reject direct proxy private icloud apple google lancidr cncidr telegramcidr; do
  mv "$STAGING_DIR/$name.mrs" "$OUTPUT_DIR/$name.mrs"
done
mv "$STAGING_DIR/manifest.json" "$OUTPUT_DIR/manifest.json"
mv "$CONFIG_OUTPUT" "$ROOT_DIR/tindy-subconverter/base/base/loyalsoldier_mihomo_mobile.yml"

echo "Built mobile MRS rules in $OUTPUT_DIR"
