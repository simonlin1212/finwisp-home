# Voice starter port

Default: `VOICE_ENGINE=browser`. Browser mode uses Web Speech recognition and optional speech synthesis, and the normal deterministic MCP lesson pipeline. Changing the UI toggle alone starts nothing. `VOICE_ENGINE=codex` enables the experimental Codex engine and selects it initially; the user must press **Tap to speak** before the host launches anything. Status reads, SSE subscriptions, page loading, and tests do not launch Codex.

## Exactly what is ported

Read-only source: `reference/finwisp-2026-09/host/app-server.ts`, `host/native-voice.ts`, `shared/voice.ts`, `src/VoicePanel.tsx`, `src/voice-connection.ts`, and `src/audio-devices.ts`.

- `host/voice/app-server.ts`: trimmed AppServerClient, newline-delimited JSON-RPC over child stdio; initialize/initialized handshake, chunk framing, concurrent responses, notifications, asynchronous server requests, sanitized errors, bounds, timeouts, SIGTERM/SIGKILL cleanup. Child spawning is injectable for tests. The reference's account-discovery retry was removed.
- `host/voice/session.ts`: fresh thread and realtime start/stop lifecycle, English education instructions from `mcp-server/policy.ts`, read-only sandbox, no shell/app/plugin/multi-agent tools. It launches `codex app-server` only inside explicit start. URL and approval overrides are supplied in arguments and thread config: `mcp_servers.finwisp.url` and `mcp_servers.finwisp.default_tools_approval_mode="approve"`. No Codex configuration file is rewritten. Realtime starts with `transport: { type: "webrtc", sdp: <browser offer> }`; the answer arrives as `thread/realtime/sdp`. Only `thread/realtime/transcript/delta`, `transcript/done`, `error` and `closed` are forwarded to the page.
- `host/index.ts`: same-origin/Host-checked `GET /api/voice/status`, `GET /api/voice/events` (SSE), `POST /api/voice/start` and `/stop`. Start requires `{ "explicit": true, "sdp": "v=0…" }` (offer up to 15,000 characters) and returns the answer SDP. Stop, SSE disconnect, host close, failures, or two minutes without realtime activity release the child.
- `web/src/voice-connection.ts`: opens the event stream, then the microphone, then an `RTCPeerConnection` with the microphone track and an `oai-events` data channel; posts the offer, applies the answer, plays the remote audio track and shows “You:” / “Finwisp:” transcripts. Errors, a failed connection or a dropped event stream end the call and switch the selector back to Browser with a notice.

Why WebRTC: with a ChatGPT (subscription) Codex login, the hub-relayed audio path (`thread/realtime/appendAudio`) fails with “realtime conversation requires API key auth”. The WebRTC transport, which the reference also uses, works with that login. Audio flows directly between the browser and OpenAI; the hub only relays the offer/answer and transcripts, and writes no audio to disk.

Not ported: Tauri/CoreAudio adapters, Mac-only device restrictions, Chinese-specific language/device rules, login/settings windows, market research/product actions, backtests, voice history and news navigation. Browser-selected default input/output devices are used.

## What is tested

Unit tests use fake child streams, fake runtime replies and fake browser WebRTC/EventSource objects. They cover JSON-RPC framing/interleaving, requests, RPC errors, malformed data, timeout/process failure, explicit-start gating, the required offer, a realtime error before the answer, disabled fallback, configuration, English policy, transcript relay without duplicates, stop and failure disposal.

Live check on 2026-10-15 (macOS, Chrome 155, codex-cli 0.162.0-alpha.17.2, ChatGPT login). A synthetic voice track replaced the microphone and the reply audio was muted and recorded, so no speaker or real microphone was involved:

- “Please teach me about Coca-Cola”: the call connected, the transcript showed each word once, and the recorded reply (transcribed with Whisper) gave revenue of about $47.06B → $47.94B and a 27.3% net margin for 2025, matching the SEC cards. Figures arrived tens of seconds after the question, while Codex ran its hand-off turn. The reply also included one figure the Finwisp tools do not provide, so spoken answers are model output, not only tool data.
- “Should I put all my savings into Nvidia stock?”: Codex declined to recommend or advise on allocation and moved to filing questions. Advice handling in Codex voice relies on the instructions; the text pipeline's rule-based refusal does not filter speech.
- **End voice** posted stop and the hub reported no active session.

**Not tested:** real microphone and speakers, echo and interruption, browsers other than Chrome, other Codex versions, and longer sessions.

Transport documentation: [official Codex App Server documentation](https://developers.openai.com/codex/app-server/). Realtime is experimental.

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

Do not run step 4 in environments where model sessions are prohibited.
