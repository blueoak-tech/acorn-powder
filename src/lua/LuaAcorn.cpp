#include "LuaScriptInterface.h"
#include <emscripten.h>

// acorn.emit(str): hands a string to the host page. acorn/shell/shell.ts listens for the
// 'acorn:emit' DOM event and forwards it to the embedding Acorn page as a postMessage.
// Strings only — scenario scripts build their own JSON.
static int emit(lua_State *L)
{
	auto payload = tpt_lua_checkByteString(L, 1);
	EM_ASM({
		window.dispatchEvent(new CustomEvent('acorn:emit', { detail: UTF8ToString($0) }));
	}, payload.c_str());
	return 0;
}

void LuaAcorn::Open(lua_State *L)
{
	static const luaL_Reg reg[] = {
#define LFUNC(v) { #v, v }
		LFUNC(emit),
#undef LFUNC
		{ nullptr, nullptr }
	};
	lua_newtable(L);
	luaL_register(L, nullptr, reg);
	lua_setglobal(L, "acorn");
}
