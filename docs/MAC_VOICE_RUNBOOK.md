# Mac voice runbook

Requires Node **20.19 or later**, npm, and an installed Codex CLI that is already signed in. The regular page and rule-based lessons do not start a model; an experimental voice session starts only when Codex voice is selected and the microphone button is clicked. Codex voice uses WebRTC and works with a ChatGPT login to Codex. Connectivity was tested in Chrome with synthetic speech on 2026-10-15 (see [VOICE.md](VOICE.md)); a real microphone and speakers have not yet been tested.

## 1. Get the project onto a Mac

Clone the public repo:

```sh
git clone https://github.com/simonlin1212/finwisp-home && cd finwisp-home
node --version
npm --version
command -v codex
codex login status
```

`codex login status` was confirmed in the local CLI's `codex login --help`; it only checks login status and does not start a model. If not yet signed in, run the following on the Mac and follow the browser prompts to sign in:

```sh
codex login
```

There is no need to modify `~/.codex/config.toml`. See the official [OpenAI command reference](https://developers.openai.com/codex/cli/reference). If the version installed on the Mac differs, first run `codex login --help` to verify the `status` subcommand.

## 2. Install and start

```sh
npm ci
export SEC_CONTACT_EMAIL='<organization contact email for SEC requests>'
VOICE_ENGINE=codex npm run hub
```

Replace the placeholder with an organization contact address. Do not use a personal email or enter or commit the address in the repository. Environment variables are not automatically loaded from `.env`. `npm run hub` builds the web UI before starting the service. Open the default address:

```sh
open 'http://127.0.0.1:8796/?demo=1'
```

In the browser, confirm that **Voice engine** is **Codex · preview**, click **Tap to speak**, and allow microphone access. Say “COST net margin”. Expect an English transcript and spoken output; Codex first says it is checking, then reports the financial figures after a few dozen seconds. Codex voice responses are model-generated; its tool output is not yet mapped to the web learning cards. To reliably demonstrate cards, quizzes, tool-call status, and memory, select **Browser** and click the microphone again, or type the same phrase in the input box and click **Explore →**. Click **End voice** to stop Codex audio.

Before recording, click **Reset demo profile** to clear `family` memory. The `?demo=1` page still shows tool chips, status, and elapsed time in milliseconds.

## 3. Troubleshooting

- **Microphone unavailable**: Allow browser access in the browser's site permissions and in macOS System Settings → Privacy & Security → Microphone, then reopen the localhost page. Test Browser mode in a browser that supports Web Speech; text input is also available.
- **codex not found**: Check with `command -v codex`. If it is installed outside PATH, pass the actual executable path through the environment variable supported by this project:

  ```sh
  CODEX_EXECUTABLE='/actual/path/codex' VOICE_ENGINE=codex npm run hub
  ```

- **Port 8796 in use**: Do not stop the existing service. Let the new service choose a random port:

  ```sh
  HUB_PORT=0 VOICE_ENGINE=codex npm run hub
  ```

  Open the `Finwisp Home` address printed in the terminal and append `?demo=1`; do not keep using the fixed port 8796 address.
- **Codex voice fails**: The page displays a fallback notice and selects Browser. Click the microphone again to start browser recognition; text input is always available. Alternatively, stop the service just started and run in browser-only mode:

  ```sh
  VOICE_ENGINE=browser npm run hub
  ```

- **SEC requests fail**: Check the organization contact email environment variable and the network. The page preserves its advice-refusal boundary and reports that SEC data is unavailable rather than inventing figures.

## 4. Stop

Click **End voice** first if voice is active, then press **Ctrl+C** in the terminal running the service. The host closes the MCP service and voice subprocesses it owns. Do not terminate anyone else's hub.

The npm scripts and the `HUB_PORT`, `VOICE_ENGINE`, `SEC_CONTACT_EMAIL`, and `CODEX_EXECUTABLE` variables cited here have been checked against the project source; the Codex login commands have been checked against CLI help. See [VOICE.md](VOICE.md) for the scope of Codex voice testing.
