
# MCP Partner

English | [中文](README.md)

A Postman-like interface for testing and interacting with Model Context Protocol (MCP) Servers via SSE.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Version](https://img.shields.io/badge/version-0.0.3-green.svg)

## Features

- **SSE Connection**: Connect to any MCP compliant Server-Sent Events endpoint.
- **Tool Discovery**: Automatically lists available tools from the connected server.
- **Interactive Testing**:
  - **Form Mode**: User-friendly form generation based on the tool's input schema.
  - **JSON Mode**: Raw JSON editor for complex arguments.
- **State Persistence**: Remembers your parameters and execution results for each tool during the session.
- **Request Logging**: Real-time console showing JSON-RPC traffic (requests, responses, notifications).
- **History**: Saves previously connected server configurations for quick access.
- **Customization**: Support for Custom Headers and CORS Proxy.
- **Theme**: Light and Dark mode support.
- **i18n**: English and Chinese language support.

## Usage

1. Open the application.
2. Enter your MCP Server SSE URL (e.g., `http://localhost:3000/sse`).
3. (Optional) Configure Proxy or Headers if needed.
4. Click Connect.
5. Select a tool from the sidebar.
6. Enter arguments and click Send.

## Acknowledgments

Thanks to Gemini 3 and Google AI Studio
