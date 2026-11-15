#!/bin/bash
# Fetch the old `sem` v0.8.0 (the version Plannotator pins) for comparisons. Its macOS build needs
# Homebrew openssl@3, so the linux-arm64 release runs in Docker instead (see sem080). The archive is
# checked against the same sha256 Plannotator's scripts/install.sh pins.
# Usage: harness/compare/sem080-setup.sh <new-empty-dir>
set -euo pipefail
ARCHIVE_SHA=c0d4ccede55e166481358013c397f2772e4d76b72df45d567c45792b8033aec9
D=${1:?usage: sem080-setup.sh <new-empty-dir>}
mkdir -p "$D"
[ -z "$(ls -A "$D")" ] || { echo "$D is not empty" >&2; exit 1; }
curl -sSLf -o "$D/sem-linux-arm64.tar.gz" https://github.com/Ataraxy-Labs/sem/releases/download/v0.8.0/sem-linux-arm64.tar.gz
echo "$ARCHIVE_SHA  $D/sem-linux-arm64.tar.gz" | shasum -a 256 -c -
mkdir "$D/x"
tar -xzf "$D/sem-linux-arm64.tar.gz" -C "$D/x"
echo "SEM080_DIR=$D/x"
