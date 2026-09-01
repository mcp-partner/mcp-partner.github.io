# MCP Partner 浏览器 CORS 绕过启动器

本文说明如何把 GitHub Pages 上的 MCP Partner 作为独立 Chromium 应用窗口启动，同时绕过浏览器侧 CORS。它适合调试自己控制或明确可信的 MCP 服务，不是默认推荐的运行方式。

## 先选最安全的方案

按优先级选择：

1. MCP 服务器正确返回 CORS headers，直接安装/使用 MCP Partner PWA。
2. 部署到 Vercel 并使用仓库内置 `/cors` Function，或使用可信的 Pancors/自有代理。
3. 只有无法修改服务器或部署代理时，才使用本文的独立 CORS 绕过 profile。

普通 PWA 可以直接从 Chrome / Edge 地址栏安装，应用图标由 web manifest 自动提供。CORS 绕过启动器首次打开时会在页面顶部显示黄色风险提示；点击“不再显示”后，选择会保存在该专用 profile 的 localStorage 中，刷新或重新打开都不会再出现。清除 `mcp-partner.github.io` 的站点数据可恢复提示。

## 为什么要改原来的 Linux Desktop Entry

原始示例的思路可行，但有几个问题：

- `--app` 参数中必须是普通 URL，不能写成 Markdown 的 `[URL](URL)`。
- Chromium 明确要求 `--disable-web-security` 与 `--user-data-dir` 一起使用；这个 profile 必须与日常浏览 profile 隔离。
- `/opt/mcp-partner-chrome` 通常需要管理员权限。用户级应用数据更适合放在 XDG 目录中。
- Desktop Entry 的 `Exec` 不是普通 shell 命令，不应依赖 `$HOME`、`~` 或复杂 quoting；wrapper 可以稳定处理这些细节。
- 重复传入 `--disable-features` 容易互相覆盖，而且 `SecFetchMetadata` 不是当前 Chromium feature 名。这里不关闭 Fetch Metadata。
- `--test-type` 是 Chromium 测试基础设施使用的开关，不是解决 CORS 所必需。
- 不应加入 `--ignore-certificate-errors`。证书错误应在服务器端正确修复。

安装器最终生成的 Desktop Entry 类似：

```ini
[Desktop Entry]
Version=1.0
Type=Application
Name=MCP Partner (CORS Bypass)
GenericName=MCP Debugging Client
Comment=Launch MCP Partner in an isolated Chromium profile with browser CORS disabled
Exec=/home/alice/.local/bin/mcp-partner-cors-bypass
TryExec=/home/alice/.local/bin/mcp-partner-cors-bypass
Icon=mcp-partner
Terminal=false
Categories=Development;Network;
Keywords=MCP;Model Context Protocol;Developer;API;
StartupNotify=true
StartupWMClass=mcp-partner-cors-bypass
```

实际浏览器命令由 wrapper 维护，核心参数是：

```text
--app=https://mcp-partner.github.io/?unsafe-cors-bypass=1
--user-data-dir=<专用 profile>
--disable-web-security
--allow-running-insecure-content
--disable-extensions
--disable-sync
--no-first-run
--no-default-browser-check
```

其中 `--allow-running-insecure-content` 用于从 HTTPS GitHub Pages 调试 HTTP MCP 服务；它同样会扩大风险，所以不能在这个 profile 中浏览其他网页。

## 自动安装

不要直接执行未经检查的远程脚本。下面的命令先下载、显示内容，再运行。

### Linux

```bash
curl --proto '=https' --tlsv1.2 -fsSL \
  https://mcp-partner.github.io/launchers/install-linux.sh \
  -o /tmp/install-mcp-partner-linux.sh
less /tmp/install-mcp-partner-linux.sh
bash /tmp/install-mcp-partner-linux.sh
```

安装位置：

| 内容 | 默认位置 |
| --- | --- |
| Desktop Entry | `~/.local/share/applications/mcp-partner-cors-bypass.desktop` |
| wrapper | `~/.local/bin/mcp-partner-cors-bypass` |
| 图标 | `~/.local/share/icons/hicolor/512x512/apps/mcp-partner.png` |
| 独立 profile | `~/.local/share/mcp-partner-cors-bypass/chrome-profile` |

脚本遵循 `XDG_DATA_HOME`，并自动识别 Chrome、Chromium、Edge 和 Brave。安装器与图标一起从仓库运行时会复制本地图标；单独下载运行时会通过 HTTPS 自动取得图标。

### macOS

```bash
curl --proto '=https' --tlsv1.2 -fsSL \
  https://mcp-partner.github.io/launchers/install-macos.sh \
  -o /tmp/install-mcp-partner-macos.sh
less /tmp/install-mcp-partner-macos.sh
bash /tmp/install-mcp-partner-macos.sh
open "$HOME/Applications/MCP Partner CORS Bypass.app"
```

安装器创建 `~/Applications/MCP Partner CORS Bypass.app`。它是包含 `Info.plist` 和 shell launcher 的本地 app bundle，不包含 Electron 或 Chromium。安装器自动把站点 PNG 生成多尺寸 `.icns`，独立 profile 位于：

```text
~/Library/Application Support/MCP Partner CORS Bypass/ChromeProfile
```

### Windows

在 PowerShell 中运行：

```powershell
$Installer = Join-Path $env:TEMP 'install-mcp-partner-windows.ps1'
Invoke-WebRequest 'https://mcp-partner.github.io/launchers/install-windows.ps1' -OutFile $Installer
Get-Content $Installer
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $Installer
```

安装器创建桌面和开始菜单 `.lnk`，并自动下载 ICO。应用数据和独立 profile 位于：

```text
%LOCALAPPDATA%\MCP Partner CORS Bypass
```

命令行的 `-ExecutionPolicy Bypass` 只影响这次 PowerShell 子进程；它不修改持久系统设置。企业 Group Policy 仍可能阻止脚本，此时应由管理员审核并签名/允许脚本，不要尝试绕过组织策略。

## 卸载

保留 profile，只删除启动器和图标：

```bash
bash "$HOME/.local/share/mcp-partner-cors-bypass/install-linux.sh" --uninstall
bash "$HOME/Library/Application Support/MCP Partner CORS Bypass/install-macos.sh" --uninstall
```

```powershell
$Manager = Join-Path $env:LOCALAPPDATA 'MCP Partner CORS Bypass\install-windows.ps1'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $Manager -Uninstall
```

彻底删除独立 profile：

```bash
bash "$HOME/.local/share/mcp-partner-cors-bypass/install-linux.sh" --purge
bash "$HOME/Library/Application Support/MCP Partner CORS Bypass/install-macos.sh" --purge
```

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $Manager -Purge
```

卸载脚本只删除其固定的用户级安装路径，不操作日常浏览器 profile。

## 安全边界

浏览器壳只放宽客户端浏览器的限制：

| 能解决 | 不能解决 |
| --- | --- |
| 缺少/不匹配的 CORS 响应头 | MCP 服务器返回 401/403 |
| HTTPS 页面请求 HTTP 服务时的 mixed content | 服务器按 `Origin` 主动拒绝请求 |
| 浏览器读取跨 origin 响应 | 无效/自签名 TLS 证书 |
| 独立窗口与应用快捷方式 | DNS、路由、防火墙或服务未启动 |

必须遵守：

- 只用这个窗口访问 `https://mcp-partner.github.io/`，不要登录 Google/Microsoft/其他账号。
- 不要把日常 Chrome profile 路径传给 `--user-data-dir`，也不要把这个 profile 用作普通浏览器。
- 仅连接你信任的 MCP 服务。恶意服务能利用被放宽的浏览器权限读取其他可达 HTTP 服务的响应。
- Chrome 142+ 对 public-to-local/loopback 请求使用 Local Network Access 权限提示。只允许你刚刚启动并确认可信的本地服务。
- MCP Partner 中的自定义 headers 会保存在这个 profile 的 localStorage；不要保存长期生产密钥。
- Chromium flags 不是稳定公共 API，未来浏览器版本可能修改或移除它们。发现启动异常时应重新下载最新版安装器。

## 故障排查

1. **应用图标没更新：** 注销/登录桌面会话；Linux 也可重新运行安装器刷新 desktop/icon cache。
2. **找不到浏览器：** 安装 Chrome、Chromium、Edge 或 Brave。Linux wrapper 也支持临时执行 `MCP_PARTNER_BROWSER=/absolute/path mcp-partner-cors-bypass`。
3. **仍然出现 403：** 查看 MCP 服务日志；这通常是认证或服务端 `Origin` 检查，不是浏览器 CORS。
4. **本机连接被提示权限：** Chrome 142+ 中对可信服务允许 Local Network Access，然后重试。
5. **证书错误：** 为 MCP 服务配置受信任证书，或仅在本地开发中改用明确的 HTTP endpoint；不要添加忽略证书的浏览器参数。

## 相关官方资料

- [Chromium `--disable-web-security`：必须同时指定 `--user-data-dir`](https://chromium.googlesource.com/chromium/src.git/+/lkgr/content/public/common/content_switches.cc)
- [Chromium user data directory 说明](https://chromium.googlesource.com/chromium/src/+/show/master/docs/user_data_dir.md)
- [Chrome Local Network Access](https://developer.chrome.com/blog/local-network-access)
- [Chrome PWA 安装与 manifest icon](https://developer.chrome.com/docs/devtools/progressive-web-apps)
- [Desktop Entry `Exec` 规范](https://specifications.freedesktop.org/desktop-entry/latest/exec-variables.html)
- [Microsoft PowerShell execution policy](https://learn.microsoft.com/powershell/module/microsoft.powershell.core/about/about_execution_policies)
- [Apple `CFBundleIconFile`](https://developer.apple.com/documentation/bundleresources/information-property-list/cfbundleiconfile)

## English summary

The three installers create an isolated Chromium app-mode launcher without Electron or administrator rights. Icons are copied/downloaded automatically. Use the launcher only for MCP Partner: its dedicated profile has same-origin/CORS protection disabled. Prefer correct server CORS or a trusted proxy whenever possible. Complete copy-and-paste commands are also available in the English [README](../README_en.md#install-on-the-desktop-without-electron).
