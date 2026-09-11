# Acorn Powder Lab — web build of The Powder Toy

This fork of [The Powder Toy](https://github.com/The-Powder-Toy/The-Powder-Toy) (GPL-3.0) adds:

- **A single-threaded Emscripten build** (`-Demscripten_pthreads=false`). No SharedArrayBuffer, so no
  COOP/COEP headers: the game can be embedded in an `<iframe>` on any page. Thread sites that were made
  inline: Newtonian gravity FFT (`gravity/Fft.cpp`), `Task` (`tasks/Task.cpp`), the renderer thread
  (`GameController::ThreadedRenderingAllowed`). Guard macro: `TPT_SINGLE_THREADED` (`common/SingleThreaded.h`).
- **A host-page bridge** (`src/acorn/AcornBridge.cpp`, exported through `Module.ccall`): `acorn_run_lua`,
  `acorn_load_save`, `acorn_get_save`, `acorn_part_count`, `acorn_set_paused`, `acorn_version`, `acorn_last_error`.
- **A Lua `acorn` table** (`src/lua/LuaAcorn.cpp`): `acorn.emit(str)` hands a string to the host page.
- **A shell** (`acorn/shell/`): `index.html` + `shell.ts` implementing the postMessage protocol in
  `acorn/shell/protocol.ts` for the page that embeds the frame.

Everything in this repository stays under the GPL-3.0 (see `LICENSE`). The Acorn platform only
embeds the built page in an iframe and talks to it over `postMessage`.

## Build

```bash
# once: emsdk 3.1.72 (the version upstream CI pins), meson, ninja
git clone https://github.com/emscripten-core/emsdk.git --branch 3.1.72 && cd emsdk && ./emsdk install latest && ./emsdk activate latest && source ./emsdk_env.sh
pip install meson ninja
(cd acorn/shell && npm ci)

acorn/build-web.sh          # → acorn/dist/ and acorn/powder-web.tar.gz
```

CI does the same on every push to `acorn/main` (`.github/workflows/acorn-web.yaml`); tags `acorn-v*` publish
the tarball as a release asset.

## Serving

Static files, any origin. Recommended headers (see the Acorn repo, `nginx/conf.d/default.conf`):
`Content-Security-Policy: frame-ancestors <the embedding sites>`, long cache for `powder.wasm`/`powder.js`,
gzip/brotli (wasm compresses ~4×). **Do not** send `X-Frame-Options`.

## Protocol (v1)

The parent page waits for `{type:'acorn:ready'}`, then sends commands; every command gets exactly one
`{type:'acorn:result', id, ok, data|error}`. The frame binds itself to the first allowed origin that
messages it (`ALLOWED_PARENTS` in `shell.ts`). Lua `acorn.emit(str)` surfaces as `{type:'acorn:emit', data}`.

Dev harness: serve `acorn/dist` on one origin and open `acorn/shell/dev/harness.html?frame=<that origin>`
from another.

## Keeping up with upstream

```bash
git fetch upstream && git rebase upstream/master   # on acorn/main
```

The patch touches 6 upstream files (see `git log upstream/master..acorn/main`); conflicts are rare.
