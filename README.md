
# MCP Partner

[English](README_en.md) | 中文

一个类似 Postman 的工具，用于通过 SSE (Server-Sent Events) 测试和交互 Model Context Protocol (MCP) 服务器。

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Version](https://img.shields.io/badge/version-0.0.3-green.svg)

## 功能特性

- **SSE 连接管理**: 连接到任何符合 MCP 标准的 SSE 端点。
- **工具发现**: 自动获取并展示已连接服务器的可用工具列表。
- **交互式测试**:
  - **表单模式**: 根据工具的 Input Schema 自动生成友好的输入表单。
  - **JSON 模式**: 提供原始 JSON 编辑器以支持复杂参数。
- **状态保持**: 切换工具时自动保存当前的参数配置和执行结果。
- **请求日志**: 实时控制台展示 JSON-RPC 通信详情（请求、响应、通知）。
- **历史记录**: 自动保存常用的服务器连接配置，方便快速重连。
- **自定义配置**: 支持设置自定义 HTTP Header 和 CORS 代理。
- **主题切换**: 支持亮色和深色模式。
- **多语言**: 支持英文和中文界面。

## 使用说明

1. 打开应用。
2. 输入 MCP 服务器的 SSE 地址 (例如 `http://localhost:3000/sse`)。
3. (可选) 根据需要配置代理或请求头。
4. 点击“连接”。
5. 在左侧侧边栏选择一个工具。
6. 输入参数并点击“发送请求”。

## 致谢

感谢 Gemini 3 和 Google AI Studio
