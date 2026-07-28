# DeviceLifeline local AI resources

Copilot is **local-only**. DeviceLifeline does **not** call OpenAI, xAI/Grok,
Gemini, or other cloud LLM APIs.

## Provision (required for local Qwen3)

You need roughly **1.5 GB free** on the install volume (model ~640 MB +
llama.cpp runtime + extract staging).

### End users (preferred)

In the app open **Copilot** (or **Settings → Copilot & AI**) and click
**Download local model**.

Install location (automatic):

1. `DEVICELIFELINE_AI_DIR` if set  
2. `%LOCALAPPDATA%\DeviceLifeline\ai` when that drive has enough free space  
3. Otherwise `{drive}:\DeviceLifeline\ai` on the first fixed drive with room  
   (for example `D:\DeviceLifeline\ai` when `C:` is full)

If download fails with “llama-server was not found after extract”, the usual
cause is **disk full** on `C:`. Free space or point installs elsewhere:

```powershell
# Example: force install onto D:
$env:DEVICELIFELINE_AI_DIR = 'D:\DeviceLifeline\ai'
```

(Start DeviceLifeline from that same shell, or set a user environment variable.)

### Developers (optional)

```powershell
pwsh scripts/fetch-qwen3.ps1
```

Files expected in the install dir:

- `llama-server.exe` (small stub) + `llama-server-impl.dll` + `llama.dll` + `ggml*.dll`
- `Qwen3-0.6B-Q8_0.gguf` (~640 MB)

The app searches the user install dir first, then next to the binary, then
repo `resources/ai`.

## Runtime

On first Copilot ask (when assets exist), the Rust core starts `llama-server`
on `127.0.0.1:39201` and talks OpenAI-compatible `/v1/chat/completions`.
If assets are missing, Copilot uses offline heuristics only.

Large model binaries are **not** committed to git.
