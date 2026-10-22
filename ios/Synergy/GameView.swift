// The game in a WKWebView (5.30). The bundled page stays inside the app: a link out opens Safari, nothing else loads.
import SwiftUI
import WebKit

struct GameView: UIViewRepresentable {
    var launch: LaunchRequest

    func makeCoordinator() -> NativeBridge { NativeBridge() }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = [] // the game's sounds and the music of «Ритм»
        // window.SynergyNative before the page's own scripts run; the page's CSP does not apply to a user script.
        config.userContentController.addUserScript(WKUserScript(source: NativeBridge.script(night: context.coordinator.isNight),
                                                                injectionTime: .atDocumentStart, forMainFrameOnly: true))
        config.userContentController.add(context.coordinator, name: NativeBridge.handlerName)
        // Not «synergyHost»: that name tells the page it is embedded in another app (services/host.js, hostChannel).
        let web = ThemedWebView(frame: .zero, configuration: config)
        web.isOpaque = false
        web.backgroundColor = .systemBackground
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.allowsBackForwardNavigationGestures = false
        web.navigationDelegate = context.coordinator
        web.uiDelegate = context.coordinator // confirm() and alert() of the page
        web.onThemeChange = { [weak coordinator = context.coordinator] in coordinator?.themeChanged() }
        context.coordinator.web = web
        load(launch, in: web, coordinator: context.coordinator)
        return web
    }

    func updateUIView(_ web: WKWebView, context: Context) {
        if context.coordinator.loaded != launch.id { load(launch, in: web, coordinator: context.coordinator) }
    }

    static func dismantleUIView(_ web: WKWebView, coordinator: NativeBridge) {
        // The content controller keeps its handler: remove it, or the view is never freed.
        web.configuration.userContentController.removeScriptMessageHandler(forName: NativeBridge.handlerName)
    }

    private func load(_ launch: LaunchRequest, in web: WKWebView, coordinator: NativeBridge) {
        coordinator.loaded = launch.id
        guard let index = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "dist") else { return }
        var components = URLComponents(url: index, resolvingAgainstBaseURL: false)
        let items = launch.queryItems
        if !items.isEmpty { components?.queryItems = items }
        web.loadFileURL(components?.url ?? index, allowingReadAccessTo: index.deletingLastPathComponent())
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
