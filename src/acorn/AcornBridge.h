#pragma once
// Acorn <-> host-page bridge. Only built for Emscripten (see src/acorn/meson.build).
// The C entry points live in AcornBridge.cpp and are called from acorn/shell/shell.ts
// through Module.ccall; the Lua side is the `acorn` table registered in lua/LuaAcorn.cpp.
namespace AcornBridge
{
	// Called once from Main() after the command interface exists; exports refuse to run before this.
	void MarkReady();
}
