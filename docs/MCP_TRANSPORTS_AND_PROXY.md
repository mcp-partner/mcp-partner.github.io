# MCP 连接协议与 Vercel CORS Proxy

本文记录 MCP Partner 当前的连接实现、协议兼容范围与代理部署方式。协议基线核对日期：2026-09-01。

## 当前项目如何通过 JavaScript 连接 MCP

连接入口位于 `App.tsx` 的 `handleConnect`：

1. UI 根据用户选择创建 `SseMcpClient` 或 `StreamableHttpMcpClient`。
2. 两个类都复用 `services/sdkMcpClient.ts`，由官方 `@modelcontextprotocol/client` v2 驱动。
3. Streamable HTTP 使用官方 `StreamableHTTPClientTransport`，并开启 `versionNegotiation: { mode: "auto" }`。
4. 旧 HTTP+SSE 使用官方 `SSEClientTransport`，固定为 legacy 协议族；initialize 与 initialized 通知由 SDK 自动完成。
5. `LoggingTransport` 只负责把 SDK 收发的 JSON-RPC 消息复制到页面日志，不自行解析 SSE、维护 session 或实现版本协商。
6. 若启用代理，`services/proxyFetch.ts` 只改写真实 `fetch` 目标，SDK 仍看到原始 MCP URL。这保证旧 SSE 返回的 `endpoint` 可以先通过 SDK 的同源校验，再由同一个代理转发。

简化链路：

```text
ConnectionBar
  -> App.handleConnect
  -> SdkMcpClient
  -> official Client v2
  -> StreamableHTTPClientTransport / SSEClientTransport
  -> direct fetch or proxy fetch
  -> MCP server
```

常用 RPC（`tools/list`、`tools/call`、`resources/*`、`prompts/*`）使用 SDK 的高级方法，因此同时获得分页、schema 校验、2026 请求 header 镜像和跨版本 wire codec。未知方法仍可通过通用 `client.request()` 调用。

## 最新协议与兼容矩阵

最新正式规范为 [`2026-07-28`](https://modelcontextprotocol.io/specification/2026-07-28)。远程服务器推荐使用 Streamable HTTP；HTTP+SSE 仅保留作兼容用途。

| 协议代际 | 远程传输形态 | 会话/初始化 | SSE 用途 | MCP Partner |
| --- | --- | --- | --- | --- |
| `2024-11-05` | HTTP+SSE：GET SSE 端点通过 `endpoint` 事件给出独立 POST 地址 | `initialize`，连接级状态 | 独立长连接接收所有服务端消息 | 支持；已 deprecated |
| `2025-03-26` 至 `2025-11-25` | 单一 Streamable HTTP 端点，POST；可选 GET/DELETE | `initialize`；可选 `Mcp-Session-Id` | POST 响应流、可选 GET 常驻流；支持 `Last-Event-ID` | 支持；SDK 自动 fallback |
| `2026-07-28` | 单一端点、每条消息一次 POST | 无 initialize、无协议级 session；每次请求携带 `_meta` | 仅请求级响应流；长期变更通知走 `subscriptions/listen` | 支持；SDK 自动探测 |

2026 版本的关键差异：

- `server/discover` 用于发现版本、能力与服务端信息。
- 每个请求在 `_meta` 中声明 `io.modelcontextprotocol/protocolVersion`、客户端能力与客户端信息。
- Streamable HTTP 同时镜像 `MCP-Protocol-Version`、`Mcp-Method`，部分方法还需 `Mcp-Name`；工具 schema 声明 `x-mcp-header` 时还需生成 `Mcp-Param-*`。
- 每个 POST 返回单个 JSON 对象或仅属于该请求的 SSE 流；关闭该响应流即取消请求。
- 不再使用 GET 常驻流、`Mcp-Session-Id`、DELETE session、`Last-Event-ID` 或 SSE 重放。
- 服务端需要客户端输入时返回 `input_required`，不再反向发送独立 JSON-RPC request。

官方资料：

- [2026-07-28 Streamable HTTP](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)
- [版本协商与向后兼容](https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning)
- [2026-07-28 变更说明](https://modelcontextprotocol.io/specification/2026-07-28/changelog)
- [官方 TypeScript SDK v2](https://ts.sdk.modelcontextprotocol.io/v2/)
- [SDK 的 2026 协议迁移说明](https://ts.sdk.modelcontextprotocol.io/v2/migration/support-2026-07-28)

### 当前尚未提供的交互 UI

- 可手工填写 `Authorization` 等 header，但尚无内建 OAuth 浏览器授权流程。
- `input_required` 会原样显示给用户，尚无 elicitation/sampling/roots 的多轮应答表单。
- 尚无 `subscriptions/listen` 的显式订阅控制界面。

这些不影响工具、资源和提示词的普通发现与调用。

## 直接连接所需 CORS

推荐 MCP 服务器明确允许实际前端 origin，不要同时使用 `Access-Control-Allow-Origin: *` 与 credentials。一个兼容新旧协议的响应至少需要覆盖：

```http
Access-Control-Allow-Origin: https://your-mcp-partner.example
Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS
Access-Control-Allow-Headers: Accept, Authorization, Content-Type, Last-Event-ID, MCP-Protocol-Version, Mcp-Session-Id, Mcp-Method, Mcp-Name
Access-Control-Expose-Headers: Content-Type, MCP-Protocol-Version, Mcp-Session-Id, Retry-After, WWW-Authenticate
Vary: Origin
```

2026 工具参数可能动态产生 `Mcp-Param-*`。服务器的 CORS middleware 应安全地回显预检请求中的合法 `Access-Control-Request-Headers`，或按实际工具 schema 补充这些 header。

MCP 规范还要求 Streamable HTTP 服务器校验 `Origin`，本地服务器只绑定 loopback，并为连接配置适当认证。CORS 是浏览器放行规则，不能代替这些服务器安全措施。

## Vercel 内置代理

仓库的 `api/cors.ts` 是 Web Handler 格式的 Vercel Node.js Function，`/cors` 由 `vercel.json` rewrite 到该函数。Node.js runtime 支持：

- GET/POST/DELETE 与 SSE/ReadableStream 透明转发；
- 非 80/443 的公网 MCP 端口；
- DNS 解析后阻止 loopback、内网、link-local、保留地址和 metadata 地址，并把实际 TCP/TLS 连接固定到刚验证的公网 IP，避免 DNS rebinding 时间差；
- 每一跳 redirect 重新校验，跨 origin redirect 自动移除 `Authorization`；
- 默认只接受同一部署页面发起的浏览器请求；
- 目标 host allowlist、调用 origin allowlist和代理 token；
- 请求体大小和 redirect 次数上限；
- 正确转发 `MCP-Protocol-Version`、`Mcp-*`、`WWW-Authenticate`、旧 session header 与 SSE 流。

代理前缀默认是：

```text
/cors?url=
```

客户端会对完整目标 URL 做 percent-encoding。自定义代理也可使用 `{url}` 占位符，例如：

```text
https://proxy.example/fetch/{url}
```

### 推荐的 Vercel 环境变量

| 变量 | 默认 | 用途 |
| --- | --- | --- |
| `MCP_PROXY_ALLOWED_HOSTS` | 任意公网 host | 逗号分隔的精确 host 或 `*.example.com`；生产环境强烈建议配置 |
| `MCP_PROXY_ALLOWED_ORIGINS` | 当前部署 origin | 允许调用代理的网页 origin；可逗号分隔，`*` 会公开代理 |
| `MCP_PROXY_TOKEN` | 无 | 设置后每个实际请求必须携带 `X-MCP-Proxy-Token` |
| `MCP_PROXY_MAX_BODY_BYTES` | `1048576` | 请求体上限，限制范围 1 KiB 至 4 MiB |
| `MCP_PROXY_MAX_REDIRECTS` | `3` | redirect 上限，限制范围 0 至 10 |

示例：

```text
MCP_PROXY_ALLOWED_HOSTS=mcp.example.com,*.trusted-mcp.example
MCP_PROXY_ALLOWED_ORIGINS=https://partner.example.com
MCP_PROXY_TOKEN=replace-with-a-long-random-secret
```

若设置了 token，在 MCP Partner 的自定义 header 中添加：

```text
X-MCP-Proxy-Token: replace-with-a-long-random-secret
```

该 header 只供代理鉴权，不会转发给 MCP 服务器。

### 限制与安全说明

- Vercel 代理无法访问用户电脑上的 `localhost`；本地 MCP 请正确配置服务器 CORS，或使用桌面版/Pancors 等本地代理。
- 私网和保留地址默认永久阻止。若企业确实需要代理私网 MCP，应部署专用、鉴权且有明确 allowlist 的网关，不要把本函数改成公开内网跳板。
- Vercel Hobby 的函数流最长约 300 秒；普通请求级 SSE 足够，但长期 `subscriptions/listen` 可能被平台定时断开。
- 配置中的自定义 header 会保存在浏览器 localStorage。不要在共享电脑保存长期密钥，也不要把带密钥的配置导出给他人。

## GitHub Pages 与浏览器壳

GitHub Pages 只托管静态资源，因此不能运行本仓库的 `api/cors.ts`。除正确配置服务器 CORS 或使用外部代理外，仓库还提供 Linux、macOS 和 Windows 的浏览器壳安装器。它们不会打包 Electron/Chromium，只创建 `--app` 启动器、自动安装图标，并使用完全独立的 browser profile。

该模式会通过 `--disable-web-security` 和 `--allow-running-insecure-content` 放宽浏览器安全边界，只适用于可信开发环境。应用会通过 `?unsafe-cors-bypass=1` 显示风险提示；用户选择“不再显示”后会记录在该专用 profile 的 localStorage 中。完整安装、卸载、平台路径和安全说明见 [浏览器 CORS 绕过启动器](BROWSER_CORS_BYPASS.md)。

## 验证命令

```bash
npm run typecheck
npm test
npm run build
```

测试覆盖 modern `2026-07-28` 协商、2025 legacy fallback、监听器重连、代理 URL 编码、MCP header 转发、SSE 响应、私网/DNS/redirect SSRF 防护、host allowlist 与 token。
