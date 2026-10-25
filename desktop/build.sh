#!/usr/bin/env bash
#
# Builds the native overlay window app:
#
#   ./desktop/build.sh   →   desktop/build/Music Overlay.app
#
# Needs the Swift compiler from the Xcode Command Line Tools (xcode-select --install).

set -euo pipefail

DESKTOP_DIR="$(cd "$(dirname "$0")" && pwd)"
APP="$DESKTOP_DIR/build/Music Overlay.app"
MACOS_DIR="$APP/Contents/MacOS"

rm -rf "$APP"
mkdir -p "$MACOS_DIR"

swiftc -O \
  -framework AppKit -framework WebKit \
  -o "$MACOS_DIR/MusicOverlay" \
  "$DESKTOP_DIR/MusicOverlay.swift"

cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>Music Overlay</string>
  <key>CFBundleDisplayName</key><string>Music Overlay</string>
  <key>CFBundleIdentifier</key><string>local.tiktok-live-tools.music-overlay</string>
  <key>CFBundleExecutable</key><string>MusicOverlay</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
  <key>NSPrincipalClass</key><string>NSApplication</string>
  <key>NSHighResolutionCapable</key><true/>
  <!-- The overlay server is plain http on 127.0.0.1 -->
  <key>NSAppTransportSecurity</key>
  <dict><key>NSAllowsLocalNetworking</key><true/></dict>
</dict>
</plist>
PLIST

codesign --force --sign - "$APP" >/dev/null 2>&1 || true

echo "Built $APP"
