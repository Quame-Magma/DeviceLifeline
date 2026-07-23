# DeviceLifeline local AI resources

Copilot is **local-only**. DeviceLifeline does **not** call OpenAI, xAI/Grok,
Gemini, or other cloud LLM APIs.

## Provision (required for local Qwen3)

### End users (preferred)

In the app open **Copilot** (or **Settings → Copilot & AI**) and click
**Download local model**. Assets install to:

`%LOCALAPPDATA%\DeviceLifeline\ai\`

### Developers (optional, into repo `resources/ai`)

```powershell
pwsh scripts/fetch-qwen3.ps1
```

Files:

- `llama-server.exe` (+ runtime DLLs from the pinned llama.cpp CPU build)
- `Qwen3-0.6B-Q8_0.gguf` (~640 MB)

The app searches user app-data first, then next to the binary, then this folder.

## Runtime

On first Copilot ask (when assets exist), the Rust core starts `llama-server`
on `127.0.0.1:39201` and talks OpenAI-compatible `/v1/chat/completions`.
If assets are missing, Copilot uses offline heuristics only.

Large model binaries are **not** committed to git.

