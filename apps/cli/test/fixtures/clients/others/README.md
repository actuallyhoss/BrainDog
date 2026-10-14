Samples of Claude Desktop's and VS Code's server files for apps/cli/test/clients-others.test.ts. Every value is
invented. The shapes are from the apps' own documents, read 2026-10-14, and from a real install of each on the Mac
this was written on, read for its shape only (key names and types, never a value).

claude-desktop-config.json, claude-desktop-bare.json: Claude Desktop's claude_desktop_config.json.
- Document: https://modelcontextprotocol.io/docs/develop/connect-local-servers ("Connect to local MCP servers").
  macOS `~/Library/Application Support/Claude/claude_desktop_config.json`, Windows
  `%APPDATA%\Claude\claude_desktop_config.json`; servers are the `mcpServers` object, each `command`, `args` and an
  optional `env`, with no `type`. The `brave-search` entry is the document's own Windows sample.
- Real install: the file is plain JSON in two-space indent with no newline at its end, and holds the app's own
  `preferences` (and more) beside the servers, with no `mcpServers` at all until one is added. The bare sample is
  that shape.
- Not settled, so not done: the document gives no path on Linux, and says a remote server is added in the app, not in
  this file.

vscode-mcp.json, vscode-workspace-mcp.json: VS Code's user mcp.json and a workspace's .vscode/mcp.json.
- Documents: https://code.visualstudio.com/docs/copilot/reference/mcp-configuration (the top-level `servers` object,
  `inputs`, a stdio entry's required `type` "stdio", `command`, `args`, `env`, `envFile`; an http entry's `type` "http"
  or "sse", `url`, `headers`; `${input:id}` and `${workspaceFolder}`), and
  https://code.visualstudio.com/docs/configure/profiles (the User folder: `%APPDATA%\Code\User` on Windows,
  `$HOME/Library/Application Support/Code/User` on macOS, `$HOME/.config/Code/User` on Linux).
- Real install: `User/mcp.json` on macOS, tab indent, no newline at its end, every entry with its `type`, and the
  gallery's own `gallery` and `version` beside an entry installed from it.

Windsurf is not here: its own document's address (https://docs.windsurf.com/windsurf/cascade/mcp) now opens Devin
Desktop's page, which names `~/.config/devin/mcp_config.json` and does not say it is Windsurf's, and Windsurf was not
installed on this machine. See the header of apps/cli/src/clients/others.ts.
