// Powder Toy shell: boots the wasm module inside an iframe and speaks the protocol in
// protocol.ts with the embedding Acorn page. Standalone (no parent) it is just the game.
import type { ParentToPowder, PowderToParent, PowderScenario } from './protocol.js';

interface PowderModule {
  canvas: HTMLCanvasElement;
  HEAPU8: Uint8Array;
  ccall(name: string, ret: 'number' | 'string' | null, argTypes: string[], args: unknown[]): number;
  UTF8ToString(ptr: number): string;
  _malloc(bytes: number): number;
  _free(ptr: number): void;
}

declare global {
  interface Window {
    create_powder?: (opts: Record<string, unknown>) => Promise<PowderModule>;
    mark_presentable?: () => void;
  }
}

const PROTOCOL = 1;
// Pages allowed to drive this frame. Anything else gets no replies (and no state).
const ALLOWED_PARENTS = [
  /^https:\/\/([a-z0-9-]+\.)*acorn-ai\.(ir|xyz)$/,
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
];
// A dev build served over plain http (never the production origin) may also be embedded by a
// page on the LAN — that is how a phone on the same Wi-Fi tests the touch UI.
if (location.protocol === 'http:') {
  ALLOWED_PARENTS.push(/^http:\/\/(10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/);
}

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const status = document.getElementById('status') as HTMLElement;
let module: PowderModule | null = null;
let ready = false;
let lastEmit: string | null = null;
let parentWin: Window | null = null;
let parentOrigin = '';
const pending: MessageEvent<ParentToPowder>[] = [];

// ── helpers ────────────────────────────────────────────────────────────────
const b64ToBytes = (b64: string): Uint8Array => {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
const bytesToB64 = (bytes: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const lastError = (m: PowderModule) => m.UTF8ToString(m.ccall('acorn_last_error', 'number', [], []));

const post = (msg: PowderToParent) => {
  if (parentWin && parentOrigin) parentWin.postMessage(msg, parentOrigin);
};
const reply = (id: string, data?: unknown) => post({ type: 'acorn:result', id, ok: true, data });
const fail = (id: string, error: string) => post({ type: 'acorn:result', id, ok: false, error });

// ── commands ───────────────────────────────────────────────────────────────
function runLua(m: PowderModule, code: string) {
  if (m.ccall('acorn_run_lua', 'number', ['string'], [code]) !== 0) throw new Error(lastError(m));
}
function loadSave(m: PowderModule, cpsB64: string) {
  const bytes = b64ToBytes(cpsB64);
  const ptr = m._malloc(bytes.length);
  try {
    m.HEAPU8.set(bytes, ptr);
    if (m.ccall('acorn_load_save', 'number', ['number', 'number'], [ptr, bytes.length]) !== 0) throw new Error(lastError(m));
  } finally {
    m._free(ptr);
  }
}
function getSave(m: PowderModule): { cps: string; bytes: number } {
  const lenPtr = m._malloc(4);
  try {
    const ptr = m.ccall('acorn_get_save', 'number', ['number'], [lenPtr]);
    if (!ptr) throw new Error(lastError(m));
    // re-read HEAPU8 after the call: memory growth swaps the underlying buffer
    const len = new DataView(m.HEAPU8.buffer).getInt32(lenPtr, true);
    const bytes = m.HEAPU8.slice(ptr, ptr + len);
    m.ccall('acorn_free', null, ['number'], [ptr]);
    return { cps: bytesToB64(bytes), bytes: len };
  } finally {
    m._free(lenPtr);
  }
}
function applyScenario(m: PowderModule, s: PowderScenario) {
  if (s.cps) loadSave(m, s.cps);
  if (s.lua) runLua(m, s.lua);
}
function snapshot(maxWidth?: number) {
  let src: HTMLCanvasElement = canvas;
  if (maxWidth && maxWidth < canvas.width) {
    const scaled = document.createElement('canvas');
    scaled.width = maxWidth;
    scaled.height = Math.round((canvas.height * maxWidth) / canvas.width);
    scaled.getContext('2d')!.drawImage(canvas, 0, 0, scaled.width, scaled.height);
    src = scaled;
  }
  return { dataUrl: src.toDataURL('image/png'), width: src.width, height: src.height };
}

function handle(ev: MessageEvent<ParentToPowder>) {
  const m = module!;
  const msg = ev.data;
  try {
    switch (msg.type) {
      case 'acorn:init':
        if (msg.v !== PROTOCOL) return fail(msg.id, `protocol ${msg.v} unsupported (shell speaks ${PROTOCOL})`);
        if (msg.scenario) applyScenario(m, msg.scenario);
        if (msg.hideIntro) m.ccall('acorn_hide_intro', 'number', [], []);
        return reply(msg.id, { version: m.UTF8ToString(m.ccall('acorn_version', 'number', [], [])) });
      case 'acorn:run-lua':
        runLua(m, msg.code);
        return reply(msg.id);
      case 'acorn:load-save':
        loadSave(m, msg.cps);
        return reply(msg.id);
      case 'acorn:get-save':
        return reply(msg.id, getSave(m));
      case 'acorn:get-state':
        return reply(msg.id, { parts: m.ccall('acorn_part_count', 'number', [], []), paused: m.ccall('acorn_is_paused', 'number', [], []) === 1, lastEmit });
      case 'acorn:snapshot':
        return reply(msg.id, snapshot(msg.maxWidth));
      case 'acorn:pause':
        m.ccall('acorn_set_paused', 'number', ['number'], [msg.paused ? 1 : 0]);
        return reply(msg.id);
    }
  } catch (e) {
    fail((msg as { id: string }).id, e instanceof Error ? e.message : String(e));
  }
}

window.addEventListener('message', (ev: MessageEvent<ParentToPowder>) => {
  if (!ev.data || typeof ev.data !== 'object' || typeof ev.data.type !== 'string' || !ev.data.type.startsWith('acorn:')) return;
  if (!ALLOWED_PARENTS.some((re) => re.test(ev.origin))) return;
  if (!parentWin) {
    // first message from an allowed page binds this frame to it
    parentWin = ev.source as Window;
    parentOrigin = ev.origin;
  } else if (ev.origin !== parentOrigin) {
    return;
  }
  if (ready) handle(ev);
  else pending.push(ev);
});

window.addEventListener('acorn:emit', (ev) => {
  lastEmit = String((ev as CustomEvent<string>).detail);
  post({ type: 'acorn:emit', data: lastEmit });
});

// ── boot ───────────────────────────────────────────────────────────────────
// Emscripten's SDL creates the WebGL context without preserveDrawingBuffer, which makes
// canvas.toDataURL() return black. Patch it in before the module asks for a context.
const origGetContext = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, attrs?: Record<string, unknown>) {
  if (kind === 'webgl' || kind === 'webgl2' || kind === 'experimental-webgl') attrs = { ...(attrs ?? {}), preserveDrawingBuffer: true };
  return origGetContext.call(this, kind, attrs);
} as typeof origGetContext;

window.mark_presentable = () => {
  status.hidden = true;
  canvas.style.display = 'block';
  ready = true;
  if (window.parent !== window) {
    // announce to whoever embeds us; the parent binds itself with its first command
    window.parent.postMessage({ type: 'acorn:ready', v: PROTOCOL, version: module ? module.UTF8ToString(module.ccall('acorn_version', 'number', [], [])) : '' } satisfies PowderToParent, '*');
  }
  while (pending.length) handle(pending.shift()!);
};
window.onerror = (message) => {
  status.textContent = 'The Powder Toy crashed — reload the page.';
  status.hidden = false;
  post({ type: 'acorn:error', error: String(message) });
};
canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  post({ type: 'acorn:error', error: 'webgl context lost' });
});

const script = document.createElement('script');
script.src = 'powder.js';
script.onload = () => {
  window.create_powder!({ canvas, print: (t: string) => console.log('[tpt]', t), printErr: (t: string) => console.log('[tpt]', t) }).then((m) => {
    module = m;
    // ?debug exposes the module for measurements from the devtools console (never used by the protocol)
    if (new URLSearchParams(location.search).has('debug')) (window as unknown as { powder: PowderModule }).powder = m;
  });
};
script.onerror = () => {
  status.textContent = 'Could not load powder.js';
};
document.head.appendChild(script);
