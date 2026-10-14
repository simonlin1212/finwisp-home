# Codex Streamable HTTP MCP configuration

Verified on this machine with `codex-cli 0.162.1`, using `codex --help`, `codex mcp --help`, and read-only `get`/`list` commands. Help documents `-c key=value` dotted-path overrides with TOML values. A local filesystem search found the installed CLI and skill documentation, but no standalone CLI MCP configuration manual. Official documentation describes URL-based Streamable HTTP servers: [OpenAI MCP documentation](https://developers.openai.com/codex/extend/mcp).

With a human-started server (`npm run mcp`, default port 8787), use:

```sh
codex -c 'mcp_servers.finwisp.url="http://127.0.0.1:8787/mcp"' mcp get finwisp
codex -c 'mcp_servers.finwisp.url="http://127.0.0.1:8787/mcp"' mcp list
```

Both commands exited 0 here. `get` returned `enabled: true`, `transport: streamable_http`, and the exact URL. `list` showed finwisp enabled with Auth Unknown. These commands confirm configuration parsing; they do not initialize or call the MCP endpoint. The official SDK integration test, smoke, and demo separately verify the HTTP protocol and tools.

Equivalent persistent syntax (shown only, not written):

```toml
[mcp_servers.finwisp]
url = "http://127.0.0.1:8787/mcp"
```

A human who wants an interactive Codex session using this temporary configuration can run:

```sh
codex -c 'mcp_servers.finwisp.url="http://127.0.0.1:8787/mcp"'
```

That final command starts a model session and was **not run**. No `codex exec`, config writes, new CODEX_HOME, login changes, or MCP add/remove commands were used. The CLI printed a read-only PATH-alias warning; the read commands still succeeded.
