
# MCP Partner

English | [中文](README.md)

A Postman-like interface for testing and interacting with Model Context Protocol (MCP) Servers via SSE or Streamable HTTP.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FEricwyn%2Fmcp-partner)

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Version](https://img.shields.io/badge/version-0.3.0-green.svg)


visit here [https://ericwyn.github.io/mcp-partner](https://ericwyn.github.io/mcp-partner)

## Features

- **Instant Access**: Pure web application. No installation required, works directly in your browser.
- **Protocol Support**: Connect via standard SSE (Server-Sent Events) or Streamable HTTP.
- **Tool Discovery**: Automatically lists available tools from the connected server.
- **Interactive Testing**:
  - **Form Mode**: User-friendly form generation based on the tool's input schema.
  - **JSON Mode**: Raw JSON editor for complex arguments.
- **State Persistence**: Remembers your parameters and execution results for each tool during the session.
- **Import / Export**: Easily backup or share your server configurations via JSON.
- **Request Logging**: Real-time console showing JSON-RPC traffic (requests, responses, notifications).
- **History**: Saves previously connected server configurations for quick access.
- **Customization**: Support for Custom Headers and CORS Proxy.
- **Theme**: Light and Dark mode support.
- **i18n**: English and Chinese language support.
- **PWA Support**: Installable as a standalone app on Desktop/Mobile.

## Screenshots

| 1. Default View | 2. Connected & Tool Execution |
| :---: | :---: |
| ![Default](docs/screenshots/1.png) | ![Connected](docs/screenshots/2.png) |

| 3. History & Settings | |
| :---: | :---: |
| ![History](docs/screenshots/3.png) | |

## Solving CORS Issues

Due to browser security policies, accessing local (localhost) or cross-origin MCP servers directly from a web page often triggers **CORS (Cross-Origin Resource Sharing)** errors.

To solve this, MCP Partner supports 3 proxy methods (configurable via the Shield icon 🛡️):

1. **Vercel Deployment (Built-in)**: If deployed on Vercel, you can use `/cors?url=` as the proxy prefix (uses the project's own Edge Function).
2. **Public Proxy**: Use a public proxy like `https://corsproxy.io/?url=`.
3. **Pancors (Local Recommended)**: Run your own [Pancors](https://github.com/Ericwyn/pancors) locally.
   - Optimized support included (automatically handles `OPTIONS` pre-flight requests).
   - Recommended for local development and stability.

## Usage

1. Open the application.
2. Enter your MCP Server URL.
3. Select Transport Type (SSE or Streamable HTTP).
4. (Optional) Enable Proxy settings if you encounter connection errors.
5. Click Connect.
6. Select a tool from the sidebar.
7. Enter arguments and click Send.

## Deployment

### Vercel (Recommended)
Click the "Deploy with Vercel" button above for one-click deployment. This includes the built-in CORS proxy API.

### GitHub Pages
This repository includes a GitHub Actions workflow for automatic deployment.

1. Fork this repository.
2. Go to **Settings** -> **Pages**.
3. Under **Build and deployment** -> **Source**, select **GitHub Actions**.
4. Push a commit to the `main` branch. The Action will automatically build and deploy the app.
5. **Note**: GitHub Pages is a static environment. The Vercel-specific proxy API will not work. The app will default to using a public proxy (e.g., `corsproxy.io`) or you can configure your own.

## Acknowledgments

- Thanks to Gemini 3 and Google AI Studio
- Thanks Vercel
