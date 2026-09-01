# MCP Partner

![Version](https://img.shields.io/badge/version-0.7.0-green.svg)

[English](README_en.md) | 中文

一个类似 Postman 的纯前端 MCP 客户端，用于发现、测试和调用远程 Model Context Protocol 服务器。

- 在线访问：[https://mcp-partner.github.io](https://mcp-partner.github.io)
- Vercel 一键部署：[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FEricwyn%2Fmcp-partner)

## 协议支持

连接层使用官方 `@modelcontextprotocol/client` v2：

- **Streamable HTTP（推荐）**：自动协商最新 `2026-07-28` 协议，并向后兼容 `2025-03-26` 至 `2025-11-25` 的 initialize/session 版本。
- **HTTP+SSE（兼容模式）**：支持 `2024-11-05` 的独立 SSE + POST 端点；该传输已被官方 deprecated。
- **官方 wire 实现**：版本探测、initialize fallback、SSE 解析、session、请求 header 镜像、JSON-RPC 校验和取消都交给官方 SDK，不再由项目手写 transport。

最新 2026 协议已移除 GET 常驻流、`Mcp-Session-Id` 和 initialize 握手，改为每次请求携带协议 metadata。详细兼容说明见 [MCP 连接协议与 Vercel CORS Proxy](docs/MCP_TRANSPORTS_AND_PROXY.md)。

## 功能特性

- **即开即用**：浏览器中直接运行，MCP 服务器允许 CORS 时不需要项目后端。
- **工具、资源与提示词**：自动发现并展示服务器能力。
- **交互式调用**：根据 Input Schema 生成表单，也支持原始 JSON。
- **请求日志**：展示 SDK 实际收发的 JSON-RPC、方向及协商版本。
- **配置管理**：保存连接历史，批量导入/导出服务器配置。
- **自定义 Header**：支持 `Authorization` 和其他服务端所需 header。
- **CORS Proxy**：Vercel 部署自带安全加固的流式代理，也可配置 Pancors 或自有代理。
- **PWA / 主题 / 中英文**：支持安装、亮暗主题和界面语言切换。

## 截图

| 默认首页 | 连接与工具调用 |
| :---: | :---: |
| ![Default](screenshot/mcp-partner-screenshot-1.png) | ![Connected](screenshot/mcp-partner-screenshot-2.png) |

| 历史记录 | 自动代理 |
| :---: | :---: |
| ![History](screenshot/mcp-partner-screenshot-3.png) | ![AutoProxy](screenshot/mcp-partner-screenshot-4.png) |

## 使用

1. 输入 MCP 服务器 URL。
2. 选择 **Streamable HTTP**；只有旧服务器才选择 **SSE**。
3. 如服务器需要认证，在 Header 设置中添加凭据。
4. 服务器未开放 CORS 时，打开盾牌设置并启用代理。
5. 点击连接；成功日志会显示实际协商的 protocol era 与版本。
6. 从左侧选择工具、资源或提示词并执行。

## 浏览器 CORS

直接连接时，MCP 服务器应允许实际网页 origin，并允许新旧协议用到的 method/header。不要同时使用 `Access-Control-Allow-Origin: *` 与 credentials。

```http
Access-Control-Allow-Origin: https://your-mcp-partner.example
Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS
Access-Control-Allow-Headers: Accept, Authorization, Content-Type, Last-Event-ID, MCP-Protocol-Version, Mcp-Session-Id, Mcp-Method, Mcp-Name
Access-Control-Expose-Headers: Content-Type, MCP-Protocol-Version, Mcp-Session-Id, Retry-After, WWW-Authenticate
Vary: Origin
```

2026 工具 schema 可能产生动态 `Mcp-Param-*`；服务端 CORS middleware 还应允许预检中实际请求的这些 header。MCP 服务器本身也必须按官方规范验证 `Origin` 并正确认证。

## Vercel 内置 CORS Proxy

Vercel 部署可使用 `/cors?url=`。代理基于 Node.js Function，支持 SSE 流、任意公网端口和旧 session header，并默认：

- 只接受当前部署页面的浏览器请求；
- 阻止 localhost、私网、link-local、保留地址和 metadata 地址；
- 逐跳检查 DNS 与 redirect，并把实际连接固定到已验证公网 IP；
- 限制 method、请求体大小和 redirect 次数；
- 跨 origin redirect 不转发 `Authorization`。

生产部署强烈建议配置：

| 环境变量 | 说明 |
| --- | --- |
| `MCP_PROXY_ALLOWED_HOSTS` | 目标 host allowlist，如 `mcp.example.com,*.trusted.example` |
| `MCP_PROXY_ALLOWED_ORIGINS` | 可调用代理的网页 origin；默认仅当前部署 |
| `MCP_PROXY_TOKEN` | 可选代理密钥；客户端通过 `X-MCP-Proxy-Token` 发送 |
| `MCP_PROXY_MAX_BODY_BYTES` | 请求体上限，默认 1 MiB |
| `MCP_PROXY_MAX_REDIRECTS` | redirect 上限，默认 3 |

`X-MCP-Proxy-Token` 会在代理处移除，不会发给 MCP 服务器。Vercel 无法访问用户电脑上的 localhost；本地 MCP 请开放正确 CORS，或使用桌面版 / [Pancors](https://github.com/Ericwyn/pancors)。

## 部署

### Vercel（推荐）

点击顶部 Deploy 按钮即可部署前端和 `/cors` Function。Function 使用 Fluid Compute，最长配置为 300 秒；长时间 `subscriptions/listen` 仍可能受平台超时影响。

### GitHub Pages

仓库包含 GitHub Actions 自动部署配置。GitHub Pages 是纯静态环境，不提供 `/cors` Function；请让 MCP 服务器正确开放 CORS，或配置可信的外部代理。

## 本地开发与验证

```bash
npm install
npm run dev
npm run typecheck
npm test
npm run build
```

若要在本地同时测试 Vercel Function，请使用 Vercel CLI 的 `vercel dev`；普通 Vite dev server 不执行 `api/cors.ts`。

## 安装到桌面（不使用 Electron）

### 普通 PWA（推荐）

如果 MCP 服务器已正确配置 CORS，或你正在使用可信代理，请直接在 Chrome / Edge 地址栏点击“安装”图标。这会安装标准 PWA，浏览器会从 manifest 自动获取应用图标，不会关闭任何浏览器安全机制。

### 独立的 CORS 绕过浏览器壳

GitHub Pages 无法运行服务端代理。对于你信任的开发环境，也可以用下面的安装器创建一个 Chromium `--app` 窗口。它不是 Electron，也不会复制一份浏览器；安装器只创建启动脚本/快捷方式、自动安装图标，并为它分配独立 profile。

> **高风险模式：** `--disable-web-security` 会关闭该 profile 的同源/CORS 保护。只能在这个窗口打开 MCP Partner；不要登录浏览器账号、安装扩展或访问其他网站。首次提示可点击“不再显示”，选择会永久保存在该专用 profile 中。更推荐配置服务器 CORS、Vercel Proxy 或 Pancors。

#### Linux

无需 root。安装器自动查找 Chrome、Chromium、Edge 或 Brave，在 `~/.local/share/applications` 创建启动项，并从本站自动安装图标：

```bash
curl --proto '=https' --tlsv1.2 -fsSL \
  https://mcp-partner.github.io/launchers/install-linux.sh \
  -o /tmp/install-mcp-partner-linux.sh
sed -n '1,260p' /tmp/install-mcp-partner-linux.sh
bash /tmp/install-mcp-partner-linux.sh
```

其中 `sed` 只会把脚本打印到终端供检查，输出完成后自动返回命令行；不会像 `less` 那样进入需要按 `q` 退出的分页界面。

生成的 `.desktop` 使用用户目录下的 wrapper，而不是 `/opt`：

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

安装器会在 `~/Applications` 生成一个很小的本地 `.app` shell wrapper，并自动将网站 PNG 转换为 `.icns`：

```bash
curl --proto '=https' --tlsv1.2 -fsSL \
  https://mcp-partner.github.io/launchers/install-macos.sh \
  -o /tmp/install-mcp-partner-macos.sh
sed -n '1,240p' /tmp/install-mcp-partner-macos.sh
bash /tmp/install-mcp-partner-macos.sh
open "$HOME/Applications/MCP Partner CORS Bypass.app"
```

#### Windows

在 PowerShell 中下载并检查脚本；它会在桌面和开始菜单创建快捷方式，并自动下载 `.ico`：

```powershell
$Installer = Join-Path $env:TEMP 'install-mcp-partner-windows.ps1'
Invoke-WebRequest 'https://mcp-partner.github.io/launchers/install-windows.ps1' -OutFile $Installer
Get-Content $Installer
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $Installer
```

`ExecutionPolicy Bypass` 只作用于这一次子进程，不会修改系统策略，也不需要管理员权限。

三个安装器都使用以下必要参数：

```text
--app=https://mcp-partner.github.io/?unsafe-cors-bypass=1
--user-data-dir=<专用 profile>
--disable-web-security
--allow-running-insecure-content
--test-type
```

`--test-type` 只用于阻止 Chrome 显示“`--disable-web-security` 是不受支持的命令行标记”提示，不会进一步放宽网页权限。没有使用 `--ignore-certificate-errors` 或 `--disable-features=SecFetchMetadata`。Chrome 142+ 访问本机或局域网 MCP 时还可能显示 Local Network Access 权限提示；只对你确认可信的服务选择允许。此方式只能绕过浏览器侧 CORS/混合内容限制，不能绕过服务器认证、`Origin` 拒绝、TLS 证书错误或网络不可达。

卸载快捷方式但保留独立 profile：

```bash
bash "$HOME/.local/share/mcp-partner-cors-bypass/install-linux.sh" --uninstall
bash "$HOME/Library/Application Support/MCP Partner CORS Bypass/install-macos.sh" --uninstall
```

```powershell
$Manager = Join-Path $env:LOCALAPPDATA 'MCP Partner CORS Bypass\install-windows.ps1'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $Manager -Uninstall
```

将 `--uninstall` / `-Uninstall` 换成 `--purge` / `-Purge` 会同时删除专用 profile。更完整的原理、安全边界和手动配置见 [浏览器 CORS 绕过启动器](docs/BROWSER_CORS_BYPASS.md)。

### 原生桌面版

仓库原有的 Wails 桌面版仍可作为本地代理方案；上面的浏览器壳不需要构建或分发原生安装包。

## 安全提示

自定义 header 会保存在浏览器 localStorage。不要在共享电脑保存长期密钥，也不要导出或分享包含凭据的配置。

## 致谢

- Model Context Protocol 项目与 TypeScript SDK 维护者
- Vercel
