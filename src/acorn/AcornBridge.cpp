#include "AcornBridge.h"
#include "AcornConfig.h"
#include "client/GameSave.h"
#include "client/SaveFile.h"
#include "common/String.h"
#include "gui/game/GameController.h"
#include "gui/game/IntroText.h"
#include "lua/CommandInterface.h"
#include <cstdlib>
#include <cstring>
#include <emscripten.h>
#include <memory>
#include <vector>

// Convention for every export below: int results are 0 = ok, -1 = error, and the
// error text is available through acorn_last_error() until the next call.
static bool acornReady = false;
static ByteString acornLastError;
static ByteString acornVersion;

void AcornBridge::MarkReady()
{
	acornVersion = VersionInfo();
	acornReady = true;
}

static bool RequireReady()
{
	if (!acornReady)
	{
		acornLastError = "not ready";
	}
	return acornReady;
}

extern "C"
{

EMSCRIPTEN_KEEPALIVE int acorn_is_ready()
{
	return acornReady ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE int acorn_protocol()
{
	return ACORN_BRIDGE_PROTOCOL;
}

EMSCRIPTEN_KEEPALIVE const char *acorn_version()
{
	return acornVersion.c_str();
}

EMSCRIPTEN_KEEPALIVE const char *acorn_last_error()
{
	return acornLastError.c_str();
}

// Runs a Lua chunk exactly like the in-game console would (same state, same error log).
EMSCRIPTEN_KEEPALIVE int acorn_run_lua(const char *code)
{
	if (!RequireReady())
	{
		return -1;
	}
	auto &ci = CommandInterface::Ref();
	auto ret = ci.Command(ByteString(code).FromUtf8());
	if (ret)
	{
		acornLastError = ci.GetLastError().ToUtf8();
		return -1;
	}
	return 0;
}

// Replaces the whole simulation with a serialised save (.cps / .stm bytes).
EMSCRIPTEN_KEEPALIVE int acorn_load_save(const char *data, int len)
{
	if (!RequireReady())
	{
		return -1;
	}
	try
	{
		auto file = std::make_unique<SaveFile>("acorn.cps");
		file->SetGameSave(std::make_unique<GameSave>(std::vector<char>(data, data + len)));
		auto &gc = GameController::Ref();
		gc.HistorySnapshot();
		gc.LoadSaveFile(std::move(file));
		return 0;
	}
	catch (const std::exception &e)
	{
		acornLastError = e.what();
		return -1;
	}
}

// Serialises the current simulation. Returns a malloc'd buffer (release with acorn_free)
// and writes its size to *outLen; nullptr on error.
EMSCRIPTEN_KEEPALIVE char *acorn_get_save(int *outLen)
{
	*outLen = 0;
	if (!RequireReady())
	{
		return nullptr;
	}
	try
	{
		auto save = GameController::Ref().AcornGetSave();
		if (!save)
		{
			acornLastError = "unable to build save";
			return nullptr;
		}
		std::vector<char> bytes;
		std::tie(std::ignore, bytes) = save->Serialise();
		if (bytes.empty())
		{
			acornLastError = "serialise failed";
			return nullptr;
		}
		auto *buf = static_cast<char *>(std::malloc(bytes.size()));
		std::memcpy(buf, bytes.data(), bytes.size());
		*outLen = int(bytes.size());
		return buf;
	}
	catch (const std::exception &e)
	{
		acornLastError = e.what();
		return nullptr;
	}
}

EMSCRIPTEN_KEEPALIVE void acorn_free(void *ptr)
{
	std::free(ptr);
}

EMSCRIPTEN_KEEPALIVE int acorn_part_count()
{
	return acornReady ? GameController::Ref().AcornPartCount() : -1;
}

EMSCRIPTEN_KEEPALIVE int acorn_is_paused()
{
	return acornReady ? (GameController::Ref().GetPaused() ? 1 : 0) : -1;
}

EMSCRIPTEN_KEEPALIVE int acorn_set_paused(int paused)
{
	if (!RequireReady())
	{
		return -1;
	}
	GameController::Ref().SetPaused(paused != 0);
	return 0;
}

}
