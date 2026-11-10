// Example host (docs/embed/README.md, «iOS»): «Синергия» inside your SwiftUI app (iOS 14+).
// Add dist/ of «Синергии» (npm run build) to the app target as a folder reference named «synergy».
// The page hears the host through window.webkit.messageHandlers.synergyHost — no script to inject.
import SwiftUI
import WebKit

struct SynergyHostView: UIViewRepresentable {
    var game = "grip"
    var onResult: ([String: Any]) -> Void = { _ in }
    var onClose: () -> Void = {}

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.userContentController.add(context.coordinator, name: "synergyHost")
        config.mediaTypesRequiringUserActionForPlayback = [] // the game's sounds and music
        let web = WKWebView(frame: .zero, configuration: config)
        context.coordinator.web = web
        if let index = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "synergy") {
            web.loadFileURL(index, allowingReadAccessTo: index.deletingLastPathComponent())
        }
        return web
    }

    func updateUIView(_ web: WKWebView, context: Context) {}

    static func dismantleUIView(_ web: WKWebView, coordinator: Coordinator) {
        // The content controller keeps its handler: remove it, or the view is never freed.
        web.configuration.userContentController.removeScriptMessageHandler(forName: "synergyHost")
    }

    final class Coordinator: NSObject, WKScriptMessageHandler {
        let host: SynergyHostView
        weak var web: WKWebView?
        private var started = false

        init(_ host: SynergyHostView) { self.host = host }

        /// Every message is one JSON string (services/host.js).
        func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
            guard let text = message.body as? String, let data = text.data(using: .utf8),
                  let m = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
                  m["protocol"] as? Int == 1, let type = m["type"] as? String else { return }
            switch type {
            case "synergy:ready":
                // The game is up: open the exercise (after the safety onboarding on the very first run).
                if !started {
                    started = true
                    web?.evaluateJavaScript("window.Synergy.start(\(Self.quoted(host.game)), 1)")
                }
            case "synergy:result": host.onResult(m)
            case "synergy:close": host.onClose() // the person is done: back to your app
            default: break
            }
        }

        /// Call from your prosthesis SDK or sensor callback: one frame, values 0…1 (docs/INTEGRATION.md).
        func pushFrame(a: Double, b: Double) {
            web?.evaluateJavaScript("window.Synergy&&window.Synergy.feed({a:\(a),b:\(b)})")
        }

        private static func quoted(_ s: String) -> String {
            "'" + s.filter { ("a"..."z").contains($0) } + "'"
        }
    }
}
