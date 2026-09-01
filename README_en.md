# MCP Partner

![Version](https://img.shields.io/badge/version-0.7.0-green.svg)

English | [中文](README.md)

A browser-based, Postman-like client for discovering, testing, and invoking remote Model Context Protocol servers.

- Live app: [https://mcp-partner.github.io](https://mcp-partner.github.io)
- One-click Vercel deployment: [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FEricwyn%2Fmcp-partner)

## Protocol support

The connection layer uses the official `@modelcontextprotocol/client` v2 package:

- **Streamable HTTP (recommended):** negotiates the latest `2026-07-28` protocol automatically and falls back to initialize/session-based revisions from `2025-03-26` through `2025-11-25`.
- **HTTP+SSE (compatibility):** supports the separate SSE and POST endpoints from `2024-11-05`. This transport is officially deprecated.
- **Official wire implementation:** version probing, initialization fallback, SSE parsing, sessions, request-header mirroring, JSON-RPC validation, and cancellation are handled by the official SDK rather than a project-specific transport.

The 2026 protocol removes the standalone GET stream, `Mcp-Session-Id`, and the initialize handshake in favor of per-request protocol metadata. See [MCP transports and the Vercel CORS proxy](docs/MCP_TRANSPORTS_AND_PROXY.md) for the implementation and compatibility matrix (the guide is currently in Chinese, with protocol links in English).

## Features

- **Browser-first:** no application backend is required when the MCP server permits browser CORS.
- **Tools, resources, and prompts:** discover and inspect server capabilities.
- **Interactive calls:** generated forms from Input Schema plus raw JSON mode.
- **Wire logs:** inspect the JSON-RPC messages the SDK actually sends and receives, including the negotiated protocol version.
- **Configuration management:** connection history and bulk import/export.
- **Custom headers:** send `Authorization` and server-specific headers.
- **CORS proxy:** a hardened streaming proxy is included for Vercel deployments; Pancors and custom proxies are also supported.
- **PWA, themes, and i18n:** installable app, light/dark themes, and Chinese/English UI.

## Screenshots

| Home | Connected and invoking tools |
| :---: | :---: |
| ![Default](screenshot/mcp-partner-screenshot-1.png) | ![Connected](screenshot/mcp-partner-screenshot-2.png) |

| History | Automatic proxy |
| :---: | :---: |
| ![History](screenshot/mcp-partner-screenshot-3.png) | ![AutoProxy](screenshot/mcp-partner-screenshot-4.png) |

## Usage

1. Enter the MCP server URL.
2. Choose **Streamable HTTP**. Select **SSE** only for a legacy server.
3. Add credentials in the Header settings if required.
4. If the server does not allow CORS, open the shield settings and enable a proxy.
5. Connect. The success log shows the negotiated protocol era and version.
6. Select and invoke a tool, resource, or prompt.

## Browser CORS

For direct connections, allow the actual web-app origin and the methods and headers used by both protocol eras. Do not combine `Access-Control-Allow-Origin: *` with credentials.

```http
Access-Control-Allow-Origin: https://your-mcp-partner.example
Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS
Access-Control-Allow-Headers: Accept, Authorization, Content-Type, Last-Event-ID, MCP-Protocol-Version, Mcp-Session-Id, Mcp-Method, Mcp-Name
Access-Control-Expose-Headers: Content-Type, MCP-Protocol-Version, Mcp-Session-Id, Retry-After, WWW-Authenticate
Vary: Origin
```

A 2026 tool schema can produce dynamic `Mcp-Param-*` headers. The server's CORS middleware must allow the headers named by the actual preflight request. The MCP server must also validate `Origin` and authenticate clients as required by the specification.

## Built-in Vercel CORS proxy

Vercel deployments expose `/cors?url=`. The Node.js Function streams SSE, supports arbitrary public ports and legacy session headers, and by default:

- accepts browser calls from the current deployment only;
- blocks localhost, private, link-local, reserved, and metadata addresses;
- validates DNS and every redirect hop, then pins the connection to a validated public IP;
- limits HTTP methods, request body size, and redirects;
- removes `Authorization` on a cross-origin redirect.

Recommended production settings:

| Environment variable | Purpose |
| --- | --- |
| `MCP_PROXY_ALLOWED_HOSTS` | Target allowlist, for example `mcp.example.com,*.trusted.example` |
| `MCP_PROXY_ALLOWED_ORIGINS` | Web origins allowed to call the proxy; defaults to this deployment |
| `MCP_PROXY_TOKEN` | Optional proxy secret, sent by the client as `X-MCP-Proxy-Token` |
| `MCP_PROXY_MAX_BODY_BYTES` | Request-body limit; defaults to 1 MiB |
| `MCP_PROXY_MAX_REDIRECTS` | Redirect limit; defaults to 3 |

`X-MCP-Proxy-Token` is consumed by the proxy and never forwarded upstream. A Vercel deployment cannot reach localhost on a user's computer. For a local MCP server, configure CORS correctly or use the desktop app / [Pancors](https://github.com/Ericwyn/pancors).

## Deployment

### Vercel (recommended)

Use the Deploy button above to deploy both the web app and `/cors` Function. The Function uses Fluid Compute with a configured 300-second maximum duration; a very long `subscriptions/listen` stream can still hit the platform limit.

### GitHub Pages

The repository includes a GitHub Actions deployment. GitHub Pages is static and cannot provide `/cors`; configure CORS on the MCP server or use a trusted external proxy.

## Local development and verification

```bash
npm install
npm run dev
npm run typecheck
npm test
npm run build
```

Use Vercel CLI's `vercel dev` when testing the Function locally. The regular Vite dev server does not execute `api/cors.ts`.

## Install on the desktop (without Electron)

### Standard PWA (recommended)

If the MCP server has correct CORS headers, or you use a trusted proxy, click the install icon in the Chrome or Edge address bar. This installs the standard PWA, obtains its icon from the web manifest automatically, and leaves all browser security controls enabled.

### Isolated CORS-bypass browser shell

GitHub Pages cannot run a server-side proxy. For a trusted development environment, the installers below can create a Chromium `--app` window instead. This is not Electron and does not bundle a browser. It creates only a launcher/shortcut, installs the icon automatically, and assigns a dedicated browser profile.

> **High-risk mode:** `--disable-web-security` disables same-origin and CORS protections in this profile. Use its window only for MCP Partner. Never sign in, install extensions, or browse other sites there. Select **Don't show again** once to persistently dismiss the notice in this dedicated profile. Correct server CORS, the Vercel proxy, or Pancors is safer.

#### Linux

No root access is required. The installer finds Chrome, Chromium, Edge, or Brave, creates an entry under `~/.local/share/applications`, and installs the icon automatically:

```bash
curl --proto '=https' --tlsv1.2 -fsSL \
  https://mcp-partner.github.io/launchers/install-linux.sh \
  -o /tmp/install-mcp-partner-linux.sh
sed -n '1,260p' /tmp/install-mcp-partner-linux.sh
bash /tmp/install-mcp-partner-linux.sh
```

The `sed` step prints the script and returns to the prompt automatically. It does not enter an interactive pager like `less`, which requires pressing `q` to exit.

The generated `.desktop` points to a user-local wrapper instead of `/opt`:

```ini
[Desktop Entry]
Type=Application
Name=MCP Partner (CORS Bypass)
Exec=/home/YOUR_NAME/.local/bin/mcp-partner-cors-bypass
TryExec=/home/YOUR_NAME/.local/bin/mcp-partner-cors-bypass
Icon=mcp-partner
Terminal=false
Categories=Development;Network;
StartupWMClass=mcp-partner-cors-bypass
```

#### macOS

The installer generates a tiny local `.app` shell wrapper in `~/Applications` and converts the web PNG into an `.icns` automatically:

```bash
curl --proto '=https' --tlsv1.2 -fsSL \
  https://mcp-partner.github.io/launchers/install-macos.sh \
  -o /tmp/install-mcp-partner-macos.sh
sed -n '1,240p' /tmp/install-mcp-partner-macos.sh
bash /tmp/install-mcp-partner-macos.sh
open "$HOME/Applications/MCP Partner CORS Bypass.app"
```

#### Windows

Run these commands in PowerShell. The installer creates Desktop and Start menu shortcuts and downloads the `.ico` automatically:

```powershell
$Installer = Join-Path $env:TEMP 'install-mcp-partner-windows.ps1'
Invoke-WebRequest 'https://mcp-partner.github.io/launchers/install-windows.ps1' -OutFile $Installer
Get-Content $Installer
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $Installer
```

`ExecutionPolicy Bypass` applies only to that child process; it does not change system policy or require administrator privileges.

All three installers use this minimal set of relevant switches:

```text
--app=https://mcp-partner.github.io/?unsafe-cors-bypass=1
--user-data-dir=<dedicated profile>
--disable-web-security
--allow-running-insecure-content
--test-type
```

`--test-type` is used only to suppress Chrome's “unsupported `--disable-web-security` flag” infobar; it does not grant the page additional permissions. The launchers still omit `--ignore-certificate-errors` and `--disable-features=SecFetchMetadata`. Chrome 142+ may also prompt for Local Network Access when connecting to a local or LAN MCP server; allow only servers you trust. This setup bypasses only browser-side CORS/mixed-content checks. It cannot bypass server authentication, an `Origin` rejection, TLS certificate errors, or network reachability.

Remove the shortcuts while retaining the dedicated profile:

```bash
bash "$HOME/.local/share/mcp-partner-cors-bypass/install-linux.sh" --uninstall
bash "$HOME/Library/Application Support/MCP Partner CORS Bypass/install-macos.sh" --uninstall
```

```powershell
$Manager = Join-Path $env:LOCALAPPDATA 'MCP Partner CORS Bypass\install-windows.ps1'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $Manager -Uninstall
```

Replace `--uninstall` / `-Uninstall` with `--purge` / `-Purge` to delete the dedicated profile too. See [CORS-bypass browser launchers](docs/BROWSER_CORS_BYPASS.md) for the complete design, security boundary, and manual setup notes.

### Native desktop build

The repository's existing Wails desktop build remains available as a local-proxy option. The browser shell above requires no native package build or distribution.

## Security note

Custom headers are stored in browser localStorage. Do not keep long-lived secrets on a shared machine or export/share configurations containing credentials.

## Acknowledgments

- The Model Context Protocol project and TypeScript SDK maintainers
- Vercel
