#!/usr/bin/env bash
set -euo pipefail

APP_NAME="MCP Partner (CORS Bypass)"
ASSET_BASE_URL="https://mcp-partner.github.io"

DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
BIN_HOME="${HOME}/.local/bin"
INSTALL_ROOT="${DATA_HOME}/mcp-partner-cors-bypass"
PROFILE_DIR="${INSTALL_ROOT}/chrome-profile"
BROWSER_CONFIG="${INSTALL_ROOT}/browser-path"
MANAGER_PATH="${INSTALL_ROOT}/install-linux.sh"
LAUNCHER_PATH="${BIN_HOME}/mcp-partner-cors-bypass"
DESKTOP_DIR="${DATA_HOME}/applications"
DESKTOP_FILE="${DESKTOP_DIR}/mcp-partner-cors-bypass.desktop"
ICON_DIR="${DATA_HOME}/icons/hicolor/512x512/apps"
ICON_FILE="${ICON_DIR}/mcp-partner.png"

usage() {
  cat <<'EOF'
Install an isolated Chromium app-mode launcher for MCP Partner.

Usage:
  bash install-linux.sh             Install or update
  bash install-linux.sh --uninstall Remove launcher and icon, keep app data
  bash install-linux.sh --purge     Remove launcher, icon, and isolated profile

Optional runtime override:
  MCP_PARTNER_BROWSER=/path/to/chrome mcp-partner-cors-bypass
EOF
}

refresh_desktop_caches() {
  if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "$DESKTOP_DIR" >/dev/null 2>&1 || true
  fi
  if command -v gtk-update-icon-cache >/dev/null 2>&1; then
    gtk-update-icon-cache -f -t "${DATA_HOME}/icons/hicolor" >/dev/null 2>&1 || true
  fi
}

uninstall() {
  rm -f -- "$DESKTOP_FILE" "$LAUNCHER_PATH" "$ICON_FILE"
  refresh_desktop_caches
  echo "Removed the MCP Partner launcher and icon."
}

case "${1:-}" in
  -h|--help)
    usage
    exit 0
    ;;
  --uninstall)
    uninstall
    echo "The isolated profile remains at: $PROFILE_DIR"
    exit 0
    ;;
  --purge)
    uninstall
    case "$INSTALL_ROOT" in
      "$DATA_HOME"/mcp-partner-cors-bypass)
        rm -rf -- "$INSTALL_ROOT"
        ;;
      *)
        echo "Refusing to remove unexpected path: $INSTALL_ROOT" >&2
        exit 1
        ;;
    esac
    echo "Removed the isolated browser profile."
    exit 0
    ;;
  "") ;;
  *)
    usage >&2
    exit 2
    ;;
esac

find_browser() {
  local candidate
  if [[ -n "${MCP_PARTNER_BROWSER:-}" ]]; then
    if [[ -x "$MCP_PARTNER_BROWSER" ]]; then
      printf '%s\n' "$MCP_PARTNER_BROWSER"
      return 0
    fi
    if command -v "$MCP_PARTNER_BROWSER" >/dev/null 2>&1; then
      command -v "$MCP_PARTNER_BROWSER"
      return 0
    fi
  fi

  for candidate in \
    google-chrome-stable google-chrome chromium chromium-browser \
    microsoft-edge-stable microsoft-edge brave-browser; do
    if command -v "$candidate" >/dev/null 2>&1; then
      command -v "$candidate"
      return 0
    fi
  done
  return 1
}

BROWSER_PATH="$(find_browser || true)"
if [[ -z "$BROWSER_PATH" ]]; then
  echo "No supported Chromium browser found. Install Chrome, Chromium, Edge, or Brave first." >&2
  exit 1
fi

mkdir -p "$BIN_HOME" "$DESKTOP_DIR" "$ICON_DIR" "$INSTALL_ROOT"

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
SCRIPT_PATH="${SCRIPT_DIR}/$(basename -- "$0")"
if [[ "$SCRIPT_PATH" != "$MANAGER_PATH" ]]; then
  install -m 0755 "$SCRIPT_PATH" "$MANAGER_PATH"
fi
printf '%s\n' "$BROWSER_PATH" > "$BROWSER_CONFIG"
chmod 0600 "$BROWSER_CONFIG"

LOCAL_ICON="${SCRIPT_DIR}/../icon_512px.png"
if [[ -f "$LOCAL_ICON" ]]; then
  install -m 0644 "$LOCAL_ICON" "$ICON_FILE"
else
  TEMP_ICON="$(mktemp "${TMPDIR:-/tmp}/mcp-partner-icon.XXXXXX.png")"
  trap 'rm -f -- "$TEMP_ICON"' EXIT
  if command -v curl >/dev/null 2>&1; then
    curl --proto '=https' --tlsv1.2 -fsSL "${ASSET_BASE_URL}/icon_512px.png" -o "$TEMP_ICON"
  elif command -v wget >/dev/null 2>&1; then
    wget -q "${ASSET_BASE_URL}/icon_512px.png" -O "$TEMP_ICON"
  else
    echo "curl or wget is required to install the app icon." >&2
    exit 1
  fi
  install -m 0644 "$TEMP_ICON" "$ICON_FILE"
fi

cat > "$LAUNCHER_PATH" <<'LAUNCHER'
#!/usr/bin/env bash
set -euo pipefail

APP_URL="${MCP_PARTNER_URL:-https://mcp-partner.github.io/?unsafe-cors-bypass=1}"
DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
PROFILE_DIR="${DATA_HOME}/mcp-partner-cors-bypass/chrome-profile"
BROWSER_CONFIG="${DATA_HOME}/mcp-partner-cors-bypass/browser-path"

find_browser() {
  local candidate
  if [[ -n "${MCP_PARTNER_BROWSER:-}" ]]; then
    if [[ -x "$MCP_PARTNER_BROWSER" ]]; then
      printf '%s\n' "$MCP_PARTNER_BROWSER"
      return 0
    fi
    if command -v "$MCP_PARTNER_BROWSER" >/dev/null 2>&1; then
      command -v "$MCP_PARTNER_BROWSER"
      return 0
    fi
  fi
  if [[ -r "$BROWSER_CONFIG" ]]; then
    local configured_browser
    IFS= read -r configured_browser < "$BROWSER_CONFIG" || true
    if [[ -n "$configured_browser" && -x "$configured_browser" ]]; then
      printf '%s\n' "$configured_browser"
      return 0
    fi
  fi
  for candidate in \
    google-chrome-stable google-chrome chromium chromium-browser \
    microsoft-edge-stable microsoft-edge brave-browser; do
    if command -v "$candidate" >/dev/null 2>&1; then
      command -v "$candidate"
      return 0
    fi
  done
  return 1
}

BROWSER_PATH="$(find_browser || true)"
if [[ -z "$BROWSER_PATH" ]]; then
  echo "No supported Chromium browser found." >&2
  exit 1
fi

mkdir -p "$PROFILE_DIR"
exec "$BROWSER_PATH" \
  "--app=${APP_URL}" \
  "--user-data-dir=${PROFILE_DIR}" \
  --disable-web-security \
  --allow-running-insecure-content \
  --test-type \
  --disable-extensions \
  --disable-sync \
  --no-first-run \
  --no-default-browser-check \
  --class=mcp-partner-cors-bypass \
  --window-size=1400,900
LAUNCHER
chmod 0755 "$LAUNCHER_PATH"

cat > "$DESKTOP_FILE" <<EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=${APP_NAME}
GenericName=MCP Debugging Client
Comment=Launch MCP Partner in an isolated Chromium profile with browser CORS disabled
Exec=${LAUNCHER_PATH}
TryExec=${LAUNCHER_PATH}
Icon=mcp-partner
Terminal=false
Categories=Development;Network;
Keywords=MCP;Model Context Protocol;Developer;API;
StartupNotify=true
StartupWMClass=mcp-partner-cors-bypass
EOF
chmod 0644 "$DESKTOP_FILE"

refresh_desktop_caches

echo "Installed: $APP_NAME"
echo "Browser:   $BROWSER_PATH"
echo "Launcher:  $DESKTOP_FILE"
echo "Profile:   $PROFILE_DIR"
echo "Manage:    $MANAGER_PATH"
echo
echo "Security: use this launcher only for MCP Partner. Do not sign in or browse other sites in its window."
