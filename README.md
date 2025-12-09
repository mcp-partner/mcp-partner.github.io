
# MCP Partner

[English](README_en.md) | 中文

一个类似 Postman 的工具，用于通过 SSE (Server-Sent Events) 测试和交互 Model Context Protocol (MCP) 服务器。

点击此处直接访问

[https://mcp-partner.vercel.app/](https://mcp-partner.vercel.app/)

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Version](https://img.shields.io/badge/version-0.0.5-green.svg)

## 功能特性

- **即开即用**: 纯静态网页应用，无需本地安装、无需启动后端服务，直接在线访问即可连接您的 MCP 服务器。
- **SSE 连接管理**: 连接到任何符合 MCP 标准的 SSE 端点。
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

## 截图展示

| 1. 默认首页 | 2. 连接状态 & 工具调用 |
| :---: | :---: |
| ![Default](screenshot/mcp-partner-screenshot-1.png) | ![Connected](screenshot/mcp-partner-screenshot-2.png) |

| 3. 历史记录 & 配置管理 | 4. 自动代理 |
| :---: | :---: |
| ![History](screenshot/mcp-partner-screenshot-3.png) | ![AutoProxy](screenshot/mcp-partner-screenshot-4.png) |

## 常见问题：CORS 跨域

由于浏览器的安全策略，网页应用直接访问本地 (localhost) 或不同域名的 MCP 服务器通常会遇到 **CORS (跨域资源共享)** 错误。

为了解决这个问题，MCP Partner 提供了内置的代理解决方案：

1. **一键代理**: 点击连接栏右侧的盾牌图标 🛡️，勾选 "启用 CORS 代理" (默认使用 [corsproxy.io](corsproxy.io))。
2. **Pancors 支持**: 我们针对 [Pancors](https://github.com/Ericwyn/pancors) 代理服务进行了深度适配。
   - 工具会自动在发送 JSON 数据前发送 `OPTIONS` 预检请求，确保复杂请求能通过严格的代理校验。
   - 推荐点击代理设置中的链接，部署一个自己的 Pancors 服务以获得最稳定的体验。


## 使用说明

1. 打开应用。
2. 输入 MCP 服务器的 SSE 地址 (例如 `http://localhost:3000/sse`)。
3. (可选) 如果遇到连接错误，请尝试开启代理设置。
4. 点击“连接”。
5. 在左侧侧边栏选择一个工具。
6. 输入参数并点击“发送请求”。

## 致谢

感谢 Gemini 3 / Google AI Studio
感谢 Vercel