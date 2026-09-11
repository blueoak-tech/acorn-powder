// postMessage protocol between an Acorn page (parent) and the Powder Toy shell (iframe).
// Copy this file verbatim into the Acorn frontend; the shell is the source of truth.
// Versioning: bump ACORN_POWDER_PROTOCOL on any breaking change; `acorn:ready` reports it.

export const ACORN_POWDER_PROTOCOL = 1 as const;

/** A scenario is applied in this order: load-save (if any), then run-lua (if any). */
export interface PowderScenario {
  /** Serialised TPT save (.cps/.stm bytes), base64. Replaces the whole simulation. */
  cps?: string;
  /** Lua chunk run in the game's console state — may register event handlers. */
  lua?: string;
}

export type ParentToPowder =
  | { type: 'acorn:init'; v: typeof ACORN_POWDER_PROTOCOL; id: string; scenario?: PowderScenario }
  | { type: 'acorn:run-lua'; id: string; code: string }
  | { type: 'acorn:load-save'; id: string; cps: string }
  | { type: 'acorn:get-save'; id: string }
  | { type: 'acorn:get-state'; id: string }
  | { type: 'acorn:snapshot'; id: string; maxWidth?: number }
  | { type: 'acorn:pause'; id: string; paused: boolean };

export interface PowderState {
  /** Live particle count (Simulation::NUM_PARTS). */
  parts: number;
  /** Simulation paused (event.tick keeps firing while paused — it is a frame tick, not a sim step). */
  paused: boolean;
  /** Last string the scenario handed over with acorn.emit(), or null. */
  lastEmit: string | null;
}

export type PowderToParent =
  /** Sent to window.parent as soon as the game can accept commands. */
  | { type: 'acorn:ready'; v: typeof ACORN_POWDER_PROTOCOL; version: string }
  /** One reply per command, matched by id. `data` shape depends on the command. */
  | { type: 'acorn:result'; id: string; ok: true; data?: unknown }
  | { type: 'acorn:result'; id: string; ok: false; error: string }
  /** Fired whenever Lua calls acorn.emit(str). */
  | { type: 'acorn:emit'; data: string }
  /** Unrecoverable runtime failure (wasm abort, WebGL context lost). */
  | { type: 'acorn:error'; error: string };

/** Reply payloads by command type. */
export interface PowderResultData {
  'acorn:init': { version: string };
  'acorn:run-lua': undefined;
  'acorn:load-save': undefined;
  'acorn:get-save': { cps: string; bytes: number };
  'acorn:get-state': PowderState;
  'acorn:snapshot': { dataUrl: string; width: number; height: number };
  'acorn:pause': undefined;
}
