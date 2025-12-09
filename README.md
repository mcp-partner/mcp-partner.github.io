# MCP Partner

[English](README_en.md) | 中文

一个类似 Postman 的工具，用于通过 SSE (Server-Sent Events) 或 Streamable HTTP 测试和交互 Model Context Protocol (MCP) 服务器。

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FEricwyn%2Fmcp-partner)

点击此处直接访问

[https://ericwyn.github.io/mcp-partner](https://ericwyn.github.io/mcp-partner)

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Version](https://img.shields.io/badge/version-0.3.0-green.svg)

## 功能特性

- **即开即用**: 纯静态网页应用，无需本地安装、无需启动后端服务，直接在线访问即可连接您的 MCP 服务器。
- **多协议支持**: 支持标准的 SSE (Server-Sent Events) 和 Streamable HTTP 连接方式。
- **工具发现**: 自动获取并展示已连接服务器的可用工具列表。
- **交互式测试**:
  - **表单模式**: 根据工具的 Input Schema 自动生成友好的输入表单。
  - **JSON 模式**: 提供原始 JSON 编辑器以支持复杂参数。
- **状态保持**: 切换工具时自动保存当前的参数配置和执行结果。
- **配置导入/导出**: 支持 JSON 格式批量导入/导出服务器配置，方便迁移和分享。
- **请求日志**: 实时控制台展示 JSON-RPC 通信详情（请求、响应、通知）。
- **历史记录**: 自动保存常用的服务器连接配置，方便快速重连。
- **自定义配置**: 支持设置自定义 HTTP Header 和 CORS 代理。
- **主题切换**: 支持亮色和深色模式。
- **多语言**: 支持英文和中文界面。
- **PWA 支持**: 支持安装为桌面/移动端独立应用。

## 截图展示

| 1. 默认首页 | 2. 连接状态 & 工具调用 |
| :---: | :---: |
| ![Default](screenshot/mcp-partner-screenshot-1.png) | ![Connected](screenshot/mcp-partner-screenshot-2.png) |

| 3. 历史记录 & 配置管理 | 4. 自动代理 |
| :---: | :---: |
| ![History](screenshot/mcp-partner-screenshot-3.png) | ![AutoProxy](screenshot/mcp-partner-screenshot-4.png) |

## 常见问题：CORS 跨域

由于浏览器的安全策略，网页应用直接访问本地 (localhost) 或不同域名的 MCP 服务器通常会遇到 **CORS (跨域资源共享)** 错误。

为了解决这个问题，MCP Partner 支持 3 种代理方式（点击连接栏右侧的盾牌图标 🛡️ 进行设置）：

1. **Vercel 部署 (内置)**: 如果您将本项目部署在 Vercel 上，可以直接使用 `/cors?url=` 作为代理前缀（使用本项目自带的 Edge Function）。
2. **公共代理**: 使用公共代理服务，例如 `https://corsproxy.io/?url=`。
3. **Pancors (本地推荐)**: 自己本地启动 [Pancors](https://github.com/Ericwyn/pancors)。

### 服务器端 CORS 配置

如果您是 MCP 服务器的开发者，建议在服务器端正确配置 CORS 响应头，这样网页客户端就可以直接连接，无需使用代理。以下是一个完整的 CORS 配置示例：

```go
// Go 语言示例
w.Header().Set("Access-Control-Allow-Origin", "*")
w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
w.Header().Set("Access-Control-Allow-Headers", "*")
w.Header().Set("Access-Control-Expose-Headers", "*")
w.Header().Set("Access-Control-Allow-Credentials", "true")
```

#### 各个 Header 的作用说明：

1. **`Access-Control-Allow-Origin: *`**
   - **作用**: 允许任何域名的前端页面访问您的服务器
   - **必要性**: ⭐⭐⭐⭐⭐ 必需，没有这个 header 浏览器会阻止跨域请求

2. **`Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS`**
   - **作用**: 指定允许的 HTTP 方法
   - **必要性**: ⭐⭐⭐ 重要，MCP 主要使用 GET (SSE) 和 POST 方法

3. **`Access-Control-Allow-Headers: *`**
   - **作用**: 允许前端在请求中携带任意自定义 header
   - **必要性**: ⭐⭐⭐⭐ 重要，MCP 客户端需要发送 `Content-Type` 和 `Mcp-Session-Id` 等 header

4. **`Access-Control-Expose-Headers: *`**
   - **作用**: 允许前端 JavaScript 读取响应中的所有 header
   - **必要性**: ⭐⭐⭐⭐ 关键，MCP 协议需要读取 `mcp-session-id` 响应头

5. **`Access-Control-Allow-Credentials: true`**
   - **作用**: 允许前端发送携带认证信息的请求（如 cookies）
   - **必要性**: ⭐⭐ 可选，如果您的 MCP 服务器使用认证则需要

#### 连接失败排查步骤：

1. **检查浏览器控制台错误**
   - 打开开发者工具 (F12)
   - 查看 Console 和 Network 标签页
   - 寻找 CORS 相关错误信息

2. **验证预检请求 (OPTIONS)**
   - 在 Network 标签页中查看是否有 OPTIONS 请求
   - 检查 OPTIONS 请求的响应头是否包含上述 CORS headers

3. **测试最小配置**
   - 如果不确定哪些 header 必需，可以先用最小配置测试：
   ```go
   w.Header().Set("Access-Control-Allow-Origin", "*")
   w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Mcp-Session-Id")
   w.Header().Set("Access-Control-Expose-Headers", "Mcp-Session-Id")
   ```

4. **检查 Session ID 传递**
   - MCP 协议依赖 `mcp-session-id` header 来维持会话
   - 确保 `Access-Control-Expose-Headers` 包含 `Mcp-Session-Id`
   - 在客户端控制台查看是否有 `[HTTP] Session ID captured:` 日志

5. **临时解决方案**
   - 如果无法修改服务器配置，可以使用 MCP Partner 的代理功能
   - 代理会自动添加必要的 CORS headers


## 使用说明

1. 打开应用。
2. 输入 MCP 服务器地址。
3. 选择传输协议 (SSE 或 Streamable HTTP)。
4. (可选) 如果遇到连接错误，请尝试开启代理设置。
5. 点击“连接”。
6. 在左侧侧边栏选择一个工具。
7. 输入参数并点击“发送请求”。

## 部署说明

### Vercel (推荐)
点击上方的 "Deploy with Vercel" 按钮即可一键部署，且自带 CORS 代理功能。

### GitHub Pages
本项目已包含 GitHub Actions 自动部署工作流。

1. Fork 本仓库。
2. 进入仓库 **Settings (设置)** -> **Pages (页面)**。
3. 在 **Build and deployment (构建与部署)** -> **Source (来源)** 中选择 **GitHub Actions**。
4. 对 `main` 分支进行任意提交，Actions 将自动构建并将应用部署到 GitHub Pages。
5. **注意**：GitHub Pages 部署是纯静态环境，无法使用 Vercel 的内置代理 API，系统会自动默认使用公共代理（如 `corsproxy.io`），您也可以手动配置其他代理。

## 致谢

- 感谢 Gemini 3 / Google AI Studio
- 感谢 Vercel
