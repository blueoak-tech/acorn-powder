#!/usr/bin/env bash
# Builds the Acorn web distribution of The Powder Toy: single-threaded wasm + the shell.
# Output: acorn/dist/ (index.html, shell.js, powder.js, powder.wasm, LICENSE.txt) and acorn/powder-web.tar.gz
# Requirements: emsdk 3.1.72 activated (emcc on PATH), meson >= 1.3, ninja, and either
# acorn/shell/node_modules (npm ci) or TSC=<path to tsc>.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
BUILD=${BUILD_DIR:-$ROOT/build-web}
TSC=${TSC:-$ROOT/acorn/shell/node_modules/.bin/tsc}

if [ ! -f "$BUILD/build.ninja" ]; then
	meson setup "$BUILD" --cross-file "$ROOT/.github/emscripten-ghactions.ini" \
		-Dbuildtype=debugoptimized -Dstatic=prebuilt -Dstrip=false -Db_staticpic=false \
		-Demscripten_pthreads=false -Dhttp=false ${MESON_EXTRA:-}
fi
ninja -C "$BUILD" powder.js
"$TSC" -p "$ROOT/acorn/shell"

DIST=$ROOT/acorn/dist
rm -rf "$DIST"
mkdir -p "$DIST"
cp "$BUILD/powder.js" "$BUILD/powder.wasm" "$DIST/"
cp "$ROOT/acorn/shell/index.html" "$ROOT/acorn/shell/build/shell.js" "$DIST/"
cp "$ROOT/LICENSE" "$DIST/LICENSE.txt"
tar -C "$DIST" -czf "$ROOT/acorn/powder-web.tar.gz" .
echo "dist: $DIST"
du -sh "$DIST"/* "$ROOT/acorn/powder-web.tar.gz"
