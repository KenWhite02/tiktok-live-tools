// Native window for the stream overlay, so no browser is needed.
//
// Opens two windows on the bot's overlay server:
//   - "Music Overlay": the overlay page — add it in TikTok LIVE Studio / OBS via Window Capture.
//     It keeps rendering while covered by other windows, so it can sit behind LIVE Studio.
//   - "Test Console":  send fake chat (!play, !skip, ...) to rehearse before a live
//
// Env: OVERLAY_PORT (default 9091), OVERLAY_BG (hex colour, e.g. 000000 or 00ff00,
// for a solid overlay background when a capture drops transparency).
//
// Build with desktop/build.sh.

import AppKit
import WebKit

let env = ProcessInfo.processInfo.environment
let port = Int(env["OVERLAY_PORT"] ?? "") ?? 9091
let base = "http://127.0.0.1:\(port)"
let overlayBg = env["OVERLAY_BG"].flatMap { $0.isEmpty ? nil : $0 }

/// A web view that keeps retrying until the bot's server is up (or back after a restart).
final class RetryingWebView: WKWebView, WKNavigationDelegate {
    private let target: URL

    init(url: URL, transparent: Bool, keepAliveWhenHidden: Bool) {
        target = url
        let configuration = WKWebViewConfiguration()
        if keepAliveWhenHidden {
            // Don't suspend or throttle the page when it isn't visible
            disablePrivateFlag(on: configuration.preferences, key: "pageVisibilityBasedProcessSuppressionEnabled")
            disablePrivateFlag(on: configuration.preferences, key: "hiddenPageDOMTimerThrottlingEnabled")
        }
        super.init(frame: .zero, configuration: configuration)
        navigationDelegate = self
        if transparent {
            setValue(false, forKey: "drawsBackground")
            underPageBackgroundColor = .clear
        }
        if keepAliveWhenHidden {
            // Keep painting when another window covers this one, or window capture freezes/blanks
            disablePrivateFlag(on: self, key: "windowOcclusionDetectionEnabled")
        }
        load(URLRequest(url: target))
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    private func retry() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) { [weak self] in
            guard let self else { return }
            self.load(URLRequest(url: self.target))
        }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        retry()
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        retry()
    }

    // The page polls /state on its own once loaded; reload if WebKit's process dies
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        retry()
    }
}

/// Turns off a private WebKit setting, skipping it if this macOS version doesn't have it.
private func disablePrivateFlag(on object: NSObject, key: String) {
    let setter = "_set" + key.prefix(1).uppercased() + key.dropFirst() + ":"
    if object.responds(to: Selector(setter)) {
        object.setValue(false, forKey: key)
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var overlayWindow: NSWindow!
    private var consoleWindow: NSWindow!
    private var activity: NSObjectProtocol?

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Opt out of App Nap, which throttles the app once its windows are in the background
        activity = ProcessInfo.processInfo.beginActivity(
            options: [.userInitiatedAllowingIdleSystemSleep],
            reason: "Overlay must keep rendering for window capture"
        )
        buildMenu()

        var overlayURL = base + "/"
        if let bg = overlayBg { overlayURL += "?bg=" + bg }

        overlayWindow = makeWindow(
            title: "Music Overlay",
            url: URL(string: overlayURL)!,
            size: NSSize(width: 480, height: 480),
            autosave: "MusicOverlaySquare",
            transparent: overlayBg == nil,
            keepAliveWhenHidden: true
        )
        // The overlay is laid out for a square; keep it square while resizing
        overlayWindow.contentAspectRatio = NSSize(width: 1, height: 1)
        consoleWindow = makeWindow(
            title: "Test Console",
            url: URL(string: base + "/console")!,
            size: NSSize(width: 520, height: 640),
            autosave: "TestConsoleWindow",
            transparent: false,
            keepAliveWhenHidden: false
        )

        overlayWindow.makeKeyAndOrderFront(nil)
        consoleWindow.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    // Closing a window just hides it; reopen it from the Window menu
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows: Bool) -> Bool {
        if !hasVisibleWindows { showOverlay() }
        return true
    }

    private func makeWindow(title: String, url: URL, size: NSSize, autosave: String, transparent: Bool, keepAliveWhenHidden: Bool) -> NSWindow {
        let window = NSWindow(
            contentRect: NSRect(origin: .zero, size: size),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = title
        window.isReleasedWhenClosed = false
        window.contentView = RetryingWebView(url: url, transparent: transparent, keepAliveWhenHidden: keepAliveWhenHidden)

        if transparent {
            // Only the overlay's cards are drawn; the rest of the window is see-through
            window.isOpaque = false
            window.backgroundColor = .clear
            window.titlebarAppearsTransparent = true
            window.hasShadow = false
        }

        window.center()
        window.setFrameAutosaveName(autosave)
        return window
    }

    @objc func showOverlay() { overlayWindow.makeKeyAndOrderFront(nil) }
    @objc func showConsole() { consoleWindow.makeKeyAndOrderFront(nil) }

    private func buildMenu() {
        let main = NSMenu()

        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "Quit Music Overlay", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        main.addItem(submenu: appMenu, title: "Music Overlay")

        // Needed for copy/paste in the console's text fields
        let editMenu = NSMenu(title: "Edit")
        editMenu.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
        editMenu.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "Z")
        editMenu.addItem(.separator())
        editMenu.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        editMenu.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editMenu.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        main.addItem(submenu: editMenu, title: "Edit")

        let windowMenu = NSMenu(title: "Window")
        windowMenu.addItem(withTitle: "Music Overlay", action: #selector(showOverlay), keyEquivalent: "1")
        windowMenu.addItem(withTitle: "Test Console", action: #selector(showConsole), keyEquivalent: "2")
        windowMenu.addItem(.separator())
        windowMenu.addItem(withTitle: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        windowMenu.addItem(withTitle: "Close", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        main.addItem(submenu: windowMenu, title: "Window")
        NSApp.windowsMenu = windowMenu

        NSApp.mainMenu = main
    }
}

extension NSMenu {
    func addItem(submenu: NSMenu, title: String) {
        let item = NSMenuItem(title: title, action: nil, keyEquivalent: "")
        item.submenu = submenu
        addItem(item)
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
