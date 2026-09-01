#!/usr/bin/env bash
set -euo pipefail

APP_NAME="MCP Partner CORS Bypass"
ASSET_BASE_URL="https://mcp-partner.github.io"
APP_DIR="$HOME/Applications/${APP_NAME}.app"
SUPPORT_DIR="$HOME/Library/Application Support/${APP_NAME}"
PROFILE_DIR="${SUPPORT_DIR}/ChromeProfile"
BROWSER_CONFIG="${SUPPORT_DIR}/browser-path"
MANAGER_PATH="${SUPPORT_DIR}/install-macos.sh"

usage() {
  cat <<'EOF'
Install a small macOS .app wrapper that opens MCP Partner in an isolated
Chromium profile. This is a shell launcher, not an Electron application.

Usage:
  bash install-macos.sh             Install or update
  bash install-macos.sh --uninstall Remove the .app, keep its isolated profile
  bash install-macos.sh --purge     Remove the .app and isolated profile
EOF
}

case "${1:-}" in
  -h|--help)
    usage
    exit 0
    ;;
  --uninstall)
    rm -rf -- "$APP_DIR"
    echo "Removed: $APP_DIR"
    echo "The isolated profile remains at: $PROFILE_DIR"
    exit 0
    ;;
  --purge)
    rm -rf -- "$APP_DIR"
    case "$SUPPORT_DIR" in
      "$HOME"/Library/Application\ Support/MCP\ Partner\ CORS\ Bypass)
        rm -rf -- "$SUPPORT_DIR"
        ;;
      *)
        echo "Refusing to remove unexpected path: $SUPPORT_DIR" >&2
        exit 1
        ;;
    esac
    echo "Removed the app and isolated profile."
    exit 0
    ;;
  "") ;;
  *)
    usage >&2
    exit 2
    ;;
esac

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This installer must be run on macOS." >&2
  exit 1
fi

find_browser() {
  local candidate
  if [[ -n "${MCP_PARTNER_BROWSER:-}" && -x "$MCP_PARTNER_BROWSER" ]]; then
    printf '%s\n' "$MCP_PARTNER_BROWSER"
    return 0
  fi
  for candidate in \
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    "$HOME/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    "/Applications/Chromium.app/Contents/MacOS/Chromium" \
    "$HOME/Applications/Chromium.app/Contents/MacOS/Chromium" \
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" \
    "$HOME/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" \
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" \
    "$HOME/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"; do
    if [[ -x "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

BROWSER_PATH="$(find_browser || true)"
if [[ -z "$BROWSER_PATH" ]]; then
  echo "No supported Chromium browser found in /Applications." >&2
  exit 1
fi

CONTENTS_DIR="$APP_DIR/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"
RESOURCES_DIR="$CONTENTS_DIR/Resources"
mkdir -p "$MACOS_DIR" "$RESOURCES_DIR" "$PROFILE_DIR"

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
SCRIPT_PATH="${SCRIPT_DIR}/$(basename -- "$0")"
if [[ "$SCRIPT_PATH" != "$MANAGER_PATH" ]]; then
  install -m 0755 "$SCRIPT_PATH" "$MANAGER_PATH"
fi
printf '%s\n' "$BROWSER_PATH" > "$BROWSER_CONFIG"
chmod 0600 "$BROWSER_CONFIG"

cat > "$CONTENTS_DIR/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key><string>en</string>
  <key>CFBundleDisplayName</key><string>MCP Partner (CORS Bypass)</string>
  <key>CFBundleExecutable</key><string>mcp-partner</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundleIdentifier</key><string>io.github.mcp-partner.cors-bypass</string>
  <key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
  <key>CFBundleName</key><string>MCP Partner CORS Bypass</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>LSMinimumSystemVersion</key><string>10.15</string>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
PLIST

cat > "$MACOS_DIR/mcp-partner" <<'LAUNCHER'
#!/usr/bin/env bash
set -euo pipefail

APP_URL="${MCP_PARTNER_URL:-https://mcp-partner.github.io/?unsafe-cors-bypass=1}"
PROFILE_DIR="$HOME/Library/Application Support/MCP Partner CORS Bypass/ChromeProfile"
BROWSER_CONFIG="$HOME/Library/Application Support/MCP Partner CORS Bypass/browser-path"

find_browser() {
  local candidate
  if [[ -n "${MCP_PARTNER_BROWSER:-}" && -x "$MCP_PARTNER_BROWSER" ]]; then
    printf '%s\n' "$MCP_PARTNER_BROWSER"
    return 0
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
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    "$HOME/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    "/Applications/Chromium.app/Contents/MacOS/Chromium" \
    "$HOME/Applications/Chromium.app/Contents/MacOS/Chromium" \
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" \
    "$HOME/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" \
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" \
    "$HOME/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"; do
    if [[ -x "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

BROWSER_PATH="$(find_browser || true)"
if [[ -z "$BROWSER_PATH" ]]; then
  osascript -e 'display alert "MCP Partner" message "No supported Chromium browser was found." as critical'
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
  --window-size=1400,900
LAUNCHER
chmod 0755 "$MACOS_DIR/mcp-partner"

TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/mcp-partner-macos.XXXXXX")"
trap 'rm -rf -- "$TEMP_DIR"' EXIT
SOURCE_ICON="$TEMP_DIR/source.png"
LOCAL_ICON="${SCRIPT_DIR}/../icon_512px.png"
if [[ -f "$LOCAL_ICON" ]]; then
  cp "$LOCAL_ICON" "$SOURCE_ICON"
else
  curl --proto '=https' --tlsv1.2 -fsSL "${ASSET_BASE_URL}/icon_512px.png" -o "$SOURCE_ICON"
fi

ICONSET="$TEMP_DIR/AppIcon.iconset"
mkdir -p "$ICONSET"
for size in 16 32 128 256 512; do
  double_size=$((size * 2))
  sips -z "$size" "$size" "$SOURCE_ICON" --out "$ICONSET/icon_${size}x${size}.png" >/dev/null
  sips -z "$double_size" "$double_size" "$SOURCE_ICON" --out "$ICONSET/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$RESOURCES_DIR/AppIcon.icns"

if command -v codesign >/dev/null 2>&1; then
  codesign --force --deep --sign - "$APP_DIR" >/dev/null 2>&1 || true
fi
touch "$APP_DIR"

echo "Installed: $APP_DIR"
echo "Browser:   $BROWSER_PATH"
echo "Profile:   $PROFILE_DIR"
echo "Manage:    $MANAGER_PATH"
echo
echo "Security: use this app only for MCP Partner. Do not sign in or browse other sites in its window."
