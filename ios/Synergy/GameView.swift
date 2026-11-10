// The game in a WKWebView (5.30). The bundled page stays inside the app: a link out opens Safari, nothing else loads.
// 6.3.2 — the page comes from the app bundle under its own origin, synergy-app://game/ (BundleSchemeHandler), not from
// file://; the screen stays on while the app is open, as in the APK; a long press is the emulator's hold, not a preview.
import SwiftUI
import UIKit
import WebKit

struct GameView: UIViewRepresentable {
    var launch: LaunchRequest

    func makeCoordinator() -> NativeBridge { NativeBridge() }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(BundleSchemeHandler(), forURLScheme: BundleSchemeHandler.scheme)
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = [] // the game's sounds and the music of «Ритм»
        // window.SynergyNative before the page's own scripts run; the page's CSP does not apply to a user script.
        config.userContentController.addUserScript(WKUserScript(source: NativeBridge.script(night: context.coordinator.isNight),
                                                                injectionTime: .atDocumentStart, forMainFrameOnly: true))
        config.userContentController.add(context.coordinator, name: NativeBridge.handlerName)
        // Not «synergyHost» here: that name tells the page it is embedded in another app (services/host.js, hostChannel).
        // NativeBridge offers it only to a launch that asked to be returned to (x-success), and only once the page loaded.
        let web = ThemedWebView(frame: .zero, configuration: config)
        web.isOpaque = false
        web.backgroundColor = .systemBackground
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.allowsBackForwardNavigationGestures = false
        web.allowsLinkPreview = false // holding a pad is how the on-screen emulator is played (styles/app.css, touch-callout)
        #if DEBUG
        if #available(iOS 16.4, *) { web.isInspectable = true } // Safari → «Разработка» → the iPhone: the page's console
        #endif
        web.navigationDelegate = context.coordinator
        web.uiDelegate = context.coordinator // confirm() and alert() of the page
        web.onThemeChange = { [weak coordinator = context.coordinator] in coordinator?.themeChanged() }
        context.coordinator.web = web
        // 6.3.2 — the game is played by muscle signals, not by touch: the screen must not dim and lock in the middle of an
        // exercise. The APK keeps it on the same way (FLAG_KEEP_SCREEN_ON); iOS ignores it while the app is in the background.
        UIApplication.shared.isIdleTimerDisabled = true
        load(launch, in: web, coordinator: context.coordinator)
        return web
    }

    func updateUIView(_ web: WKWebView, context: Context) {
        if context.coordinator.loaded != launch.id { load(launch, in: web, coordinator: context.coordinator) }
    }

    static func dismantleUIView(_ web: WKWebView, coordinator: NativeBridge) {
        // The content controller keeps its handlers: remove them, or the view is never freed.
        web.configuration.userContentController.removeScriptMessageHandler(forName: NativeBridge.handlerName)
        coordinator.returnTo(nil)
        UIApplication.shared.isIdleTimerDisabled = false
    }

    private func load(_ launch: LaunchRequest, in web: WKWebView, coordinator: NativeBridge) {
        coordinator.loaded = launch.id
        coordinator.returnTo(launch.returnURL)
        guard let url = BundleSchemeHandler.url(query: launch.queryItems) else { return }
        web.load(URLRequest(url: url))
    }
}

/** Tells the bridge when the system switches between the light and the dark appearance. */
final class ThemedWebView: WKWebView {
    var onThemeChange: (() -> Void)?

    override func traitCollectionDidChange(_ previous: UITraitCollection?) {
        super.traitCollectionDidChange(previous)
        if traitCollection.userInterfaceStyle != previous?.userInterfaceStyle { onThemeChange?() }
    }
}
