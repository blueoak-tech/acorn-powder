#pragma once
// Acorn: single-threaded build (Emscripten without -pthread => no SharedArrayBuffer / COOP+COEP needed).
// Every std::thread site in the wasm build checks this and runs the work inline instead.
#if defined(__EMSCRIPTEN__) && !defined(__EMSCRIPTEN_PTHREADS__)
# define TPT_SINGLE_THREADED 1
#else
# define TPT_SINGLE_THREADED 0
#endif
