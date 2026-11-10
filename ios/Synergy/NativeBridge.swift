// window.SynergyNative on iOS (5.30) — the same methods the Android APK gives through @JavascriptInterface
// (android/src/ru/synergy/trainer/MainActivity.java), so the page needs no iOS branch:
//   speak(text, interrupt) · stop() · haptic(kind) · nightMode() · share(name, mime, body) · print(title, html)
// A user script defines the object; each call is one message {method, args} to this handler. Arguments are checked
// here again: the page is ours, but a message is still data.
// 6.3.2 — integration by routing (Q&A of 04.11, answers 15–16; experts of 07.11, answer 16): an app that opens this one
// with synergy://play?…&x-success=<its link> gets the result and the settings back in that link when the person is done
// (x-callback-url). For such a launch the bridge also listens as «synergyHost» — the channel services/host.js speaks to.
import AVFoundation
import UIKit
import WebKit

@MainActor
final class NativeBridge: NSObject, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate {
    nonisolated static let handlerName = "synergyNative"
    /** The host channel of services/host.js (hostChannel: webkit.messageHandlers.synergyHost). */
    nonisolated static let hostName = "synergyHost"
    nonisolated private static let maxText = 4 * 1024 * 1024
    nonisolated private static let maxHostMessage = 64 * 1024

    weak var web: WKWebView?
    var loaded: UUID?
    /** 6.3.2 — the app to return to (x-success of the launch link), or nil; what the page told its host meanwhile. */
    private(set) var returnURL: URL?
    private var hostListening = false
    private var lastResult: String?
    private var lastSettings: String?
    private let speech = AVSpeechSynthesizer()
    private let success = UINotificationFeedbackGenerator()
    private let tick = UIImpactFeedbackGenerator(style: .light)

    var isNight: Bool { UITraitCollection.current.userInterfaceStyle == .dark }

    override init() {
        super.init()
        speech.delegate = self // the end of a prompt hands the sound back to other apps (endVoicePrompt)
        success.prepare()
        tick.prepare()
    }

    /** The object the page calls; `nightMode()` is synchronous on Android, so its value is kept in the page. */
    nonisolated static func script(night: Bool) -> String {
        """
        (() => {
          const post = (method, args) => { try { window.webkit.messageHandlers.\(handlerName).postMessage({ method, args }); } catch (e) {} };
          window.__synergyNight = \(night ? "true" : "false");
          window.SynergyNative = Object.freeze({
            speak: (text, interrupt) => post('speak', [String(text), !!interrupt]),
            stop: () => post('stop', []),
            haptic: kind => post('haptic', [String(kind)]),
            nightMode: () => !!window.__synergyNight,
            share: (name, mime, body) => post('share', [String(name), String(mime), String(body)]),
            print: (title, html) => post('print', [String(title), String(html)]),
          });
        })();
        """
    }

    func themeChanged() {
        web?.evaluateJavaScript("window.__synergyNight = \(isNight ? "true" : "false");")
    }

    /**
     * A new launch: where to return, if anywhere. The host channel goes away now and comes back once the page has loaded
     * (didFinish): a page that finds a host channel at its start waits for the host's signal frames (App.hostFed), and an
     * app that only routes here sends none — the person's own source must stay as it is.
     */
    func returnTo(_ url: URL?) {
        returnURL = url
        lastResult = nil
        lastSettings = nil
        if hostListening {
            web?.configuration.userContentController.removeScriptMessageHandler(forName: NativeBridge.hostName)
            hostListening = false
        }
    }

    // MARK: messages from the page

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        if message.name == NativeBridge.hostName { hostMessage(message.body); return }
        guard let body = message.body as? [String: Any], let method = body["method"] as? String else { return }
        let args = (body["args"] as? [Any]) ?? []
        let text = { (i: Int) -> String? in
            guard i < args.count, let s = args[i] as? String, s.utf16.count <= NativeBridge.maxText else { return nil }
            return s
        }
        switch method {
        case "speak":
            guard let words = text(0), !words.isEmpty else { return }
            // 6.3.2 — VoiceOver already reads the page's live regions (role=status, the same hints and counts): the app's
            // own voice on top of it would say each of them twice, over each other. With VoiceOver on, VoiceOver speaks.
            if UIAccessibility.isVoiceOverRunning { return }
            if (args.count > 1 ? args[1] as? Bool : nil) == true { speech.stopSpeaking(at: .immediate) }
            startVoicePrompt()
            let utterance = AVSpeechUtterance(string: words)
            utterance.voice = AVSpeechSynthesisVoice(language: "ru-RU")
            utterance.rate = AVSpeechUtteranceDefaultSpeechRate * 1.05
            speech.speak(utterance)
        case "stop":
            speech.stopSpeaking(at: .immediate)
        case "haptic":
            // services/feedback.js sends «confirm» for a success and «tick» for a step (NATIVE_HAPTIC); a mistake has none.
            if text(0) == "confirm" { success.notificationOccurred(.success); success.prepare() } else { tick.impactOccurred(); tick.prepare() }
        case "share":
            guard let name = text(0), let body = text(2) else { return }
            share(name: name, body: body)
        case "print":
            guard let title = text(0), let html = text(1) else { return }
            printReport(title: title, html: html)
        default:
            break
        }
    }

    /**
     * 6.3.2 — a message of the page to its host (services/host.js, one JSON string): the latest «synergy:result» and
     * «synergy:settings» are kept; on «synergy:close» the app that opened this one gets them back in its x-success link,
     * as query items `synergy=close`, `reason`, `result` and `settings` (each the page's JSON). No name, no health notes:
     * the page sends none to a host (resultMessage, settingsMessage).
     */
    private func hostMessage(_ body: Any) {
        guard let json = body as? String, json.utf16.count <= NativeBridge.maxHostMessage, let data = json.data(using: .utf8),
              let message = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              let type = message["type"] as? String else { return }
        switch type {
        case "synergy:result": lastResult = json
        case "synergy:settings": lastSettings = json
        case "synergy:close":
            let reason = (message["reason"] as? String) ?? "done"
            guard let url = NativeBridge.callback(returnURL, reason: reason, result: lastResult, settings: lastSettings) else { return }
            Task { _ = await UIApplication.shared.open(url) }
        default:
            break
        }
    }

    /** The x-success link with the answer: its own query kept, ours appended, every value percent-encoded. */
    nonisolated static func callback(_ target: URL?, reason: String, result: String?, settings: String?) -> URL? {
        guard let target, var parts = URLComponents(url: target, resolvingAgainstBaseURL: false) else { return nil }
        var allowed = CharacterSet.urlQueryAllowed
        allowed.remove(charactersIn: "&=+?#")
        let item = { (name: String, value: String) in URLQueryItem(name: name, value: value.addingPercentEncoding(withAllowedCharacters: allowed)) }
        var items = [item("synergy", "close"), item("reason", reason)]
        if let result { items.append(item("result", result)) }
        if let settings { items.append(item("settings", settings)) }
        parts.percentEncodedQueryItems = (parts.percentEncodedQueryItems ?? []) + items
        return parts.url
    }

    /**
     * 6.3.2 — a spoken prompt the way Apple asks navigation and workout apps to speak: the voice-prompt mode of the playback
     * category. A prompt the person turned on («Голос» in the settings) is heard with the ring switch on silent too, the
     * person's music is ducked and a podcast paused while it speaks — and both come back after it (endVoicePrompt). Until
     * 6.3.2 the default session cut the person's music at the first prompt and stayed silent on the ring switch.
     */
    private func startVoicePrompt() {
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playback, mode: .voicePrompt, options: [.duckOthers, .interruptSpokenAudioAndMixWithOthers])
        try? session.setActive(true)
    }

    /** The prompt is over: other apps get their sound back. Nothing to do while another prompt still speaks. */
    func endVoicePrompt() {
        guard !speech.isSpeaking else { return }
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    /** «Поделиться» — the report or the backup as a file of its own name (the system sheet: Files, Mail, messengers). */
    private func share(name: String, body: String) {
        let safe = name.replacingOccurrences(of: "[^A-Za-zА-Яа-яЁё0-9._ -]", with: "_", options: .regularExpression)
        let file = FileManager.default.temporaryDirectory.appendingPathComponent(safe.isEmpty ? "synergy.txt" : safe)
        do { try body.write(to: file, atomically: true, encoding: .utf8) } catch { return }
        let sheet = UIActivityViewController(activityItems: [file], applicationActivities: nil)
        present(sheet)
    }

    /** Printing the specialist report (AirPrint or «Сохранить в PDF»). */
    private func printReport(title: String, html: String) {
        let info = UIPrintInfo(dictionary: nil)
        info.jobName = title
        info.outputType = .general
        let controller = UIPrintInteractionController.shared
        controller.printInfo = info
        controller.printFormatter = UIMarkupTextPrintFormatter(markupText: html)
        _ = controller.present(animated: true, completionHandler: nil)
    }

    private func present(_ sheet: UIViewController) {
        guard let root = web?.window?.rootViewController else { return }
        var top = root
        while let next = top.presentedViewController { top = next }
        sheet.popoverPresentationController?.sourceView = web // iPad: anchored to the game
        top.present(sheet, animated: true)
    }

    // MARK: navigation — only the bundled game; a link out opens Safari

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction) async -> WKNavigationActionPolicy {
        guard let url = action.request.url else { return .cancel }
        // 6.3.2: the game's own origin (BundleSchemeHandler); until then a file URL inside the bundle
        if url.scheme == BundleSchemeHandler.scheme, url.host == BundleSchemeHandler.host { return .allow }
        if url.scheme == "about" { return .allow } // about:blank of a frame the page builds
        if ["https", "http", "mailto", "tel"].contains(url.scheme?.lowercased() ?? ""), action.navigationType == .linkActivated {
            _ = await UIApplication.shared.open(url)
        }
        return .cancel
    }

    // MARK: the page's confirm() and alert() — «Сбросить калибровку?», «Удалить все данные?» (ui/settings.js)

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo) async -> Bool {
        await withCheckedContinuation { done in
            let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "Отмена", style: .cancel) { _ in done.resume(returning: false) })
            alert.addAction(UIAlertAction(title: "Да", style: .default) { _ in done.resume(returning: true) })
            present(alert)
        }
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo) async {
        await withCheckedContinuation { (done: CheckedContinuation<Void, Never>) in
            let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "Понятно", style: .default) { _ in done.resume() })
            present(alert)
        }
    }

    /** The page has loaded: a launch that asked to be returned to gets the host channel now (see returnTo). */
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard returnURL != nil, !hostListening else { return }
        webView.configuration.userContentController.add(self, name: NativeBridge.hostName)
        hostListening = true
    }

    /** iOS may end the web content process under memory pressure: start the game again (progress is in storage). */
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        webView.reload()
    }
}

// 6.3.2 — the end of a spoken prompt (finished, or cut by the next one): give the sound back to other apps.
extension NativeBridge: AVSpeechSynthesizerDelegate {
    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        Task { @MainActor in self.endVoicePrompt() }
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        Task { @MainActor in self.endVoicePrompt() }
    }
}
