# Voice starter port

Default: `VOICE_ENGINE=browser`. Browser mode uses Web Speech recognition and optional speech synthesis, and the normal deterministic MCP lesson pipeline. Changing the UI toggle alone starts nothing. `VOICE_ENGINE=codex` enables the experimental Codex engine and selects it initially; the user must press **Tap to speak** before the host launches anything. Status reads, SSE subscriptions, page loading, and tests do not launch Codex.

## Exactly what is ported

Read-only source: `reference/finwisp-2026-09/host/app-server.ts`, `host/native-voice.ts`, `shared/voice.ts`, `src/VoicePanel.tsx`, `src/voice-connection.ts`, and `src/audio-devices.ts`.

- `host/voice/app-server.ts`: trimmed AppServerClient, newline-delimited JSON-RPC over child stdio; initialize/initialized handshake, chunk framing, concurrent responses, notifications, asynchronous server requests, sanitized errors, bounds, timeouts, SIGTERM/SIGKILL cleanup. Child spawning is injectable for tests. The reference's account-discovery retry was removed.
- `host/voice/session.ts`: fresh thread and realtime start/append/stop lifecycle, English education instructions from `mcp-server/policy.ts`, read-only sandbox, no shell/app/plugin/multi-agent tools. It launches `codex app-server` only inside explicit start. URL and approval overrides are supplied in arguments and thread config: `mcp_servers.finwisp.url` and `mcp_servers.finwisp.default_tools_approval_mode="approve"`. No Codex configuration file is rewritten.
- `host/index.ts`: same-origin/Host-checked `GET /api/voice/status`, `GET /api/voice/events` (SSE), and `POST /api/voice/start`, `/input`, `/stop`. Start requires `{ "explicit": true }`. Input accepts bounded English text or base64 PCM audio, mono 24 kHz. Realtime audio/transcript notifications travel through SSE. Stop, SSE disconnect, host close, failures, or two minutes without input release the child.
- `web/src/voice-connection.ts`: initial browser microphone ownership, PCM16 input POST, incoming PCM playback, transcript display and disposal; UI engine selector and an explicit Web Speech fallback notice. One input request runs at a time. Page exit closes the browser microphone and requests host stop.

This is a starter skeleton, not the reference's complete native voice stack. The reference uses WebRTC; this port starts a stdio audio bridge with SSE+POST. Tauri/CoreAudio adapters, Mac-only device restrictions, Chinese-specific language/device rules, login/settings windows, market research/product actions, backtests, voice history and news navigation were deliberately omitted. Browser-selected default input/output devices are used. No microphone recording is written to disk by this bridge.

## What is tested and what is untested live

Unit tests use fake child streams and fake runtime replies; they never invoke a real Codex executable or LLM. Tests cover JSON-RPC framing/interleaving, requests, RPC errors, malformed data, timeout/process failure, session initialization, explicit-start gating, disabled fallback, configuration, English policy, audio/text input, transcript/audio relay, stop and failure disposal. Host tests cover the status route and invalid/non-started input. Ordinary tests, build, smoke and demo exercise deterministic lessons only.

**Untested live:** Simon's saved Codex login, account access to realtime, the installed Codex version's realtime start/appendAudio/output notification schemas, end-to-end microphone/speaker operation, duplex latency/echo/interruption, browser permissions, and device behavior on macOS. The v3 realtime methods follow the reference; the audio bridge is new. A successful fake reply is not evidence that live realtime works. The current ScriptProcessor PCM bridge is a temporary implementation; an AudioWorklet and version-specific protocol verification are follow-up work. The recording layouts have responsive CSS for 1920×1080 and 1280×720, but no browser screenshot validation was performed here.

Transport documentation: [official Codex App Server documentation](https://developers.openai.com/codex/app-server/). Realtime is experimental; generic transport documentation does not establish this account's voice access.

## Simon's Mac procedure (manual live validation)

1. Use Node 20.19+ and install dependencies with `npm ci`. Install the official Codex CLI separately if needed. In his own Mac terminal, Simon runs `codex login` and completes his own Codex/ChatGPT login. This project never includes credentials or a personal email.
2. Set SEC identity through environment variables: `SEC_APP_NAME=FinwispHome` and `SEC_CONTACT_EMAIL` to his chosen contact address, or use `SEC_USER_AGENT`. Do not commit those values.
3. Start a separate local hub on an unused port, leaving any existing hub alone:

   ```sh
   VOICE_ENGINE=codex HUB_PORT=0 npm run hub
   ```

   Open the printed URL (optionally append `?demo=1`). The host supplies its embedded MCP server URL automatically. With a separately running MCP server, set `MCP_URL` to its HTTP endpoint. `CODEX_EXECUTABLE` may point to his installed CLI binary.
4. Select **Codex · preview**, then press **Tap to speak**. That explicit action launches app-server using his existing local Codex login. Allow browser microphone access. Ask an educational question and verify English transcript, audible output, and actual finwisp tool use; also check advice refusal. If realtime fails, the UI selects Browser and displays a fallback notice; press again for Web Speech (Chrome is a practical starting browser).
5. Press **End voice**, verify the microphone indicator turns off, and stop this separate hub with Ctrl-C. Check that its app-server child exits. Browser mode alone can be used without Codex or a model session.

Do not run step 4 in environments where model sessions are prohibited. No live voice/model session was started while implementing this port.
