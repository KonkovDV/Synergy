// window.SynergyNative on iOS (5.30) — the same methods the Android APK gives through @JavascriptInterface
// (android/src/ru/synergy/trainer/MainActivity.java), so the page needs no iOS branch:
//   speak(text, interrupt) · stop() · haptic(kind) · nightMode() · share(name, mime, body) · print(title, html)
// A user script defines the object; each call is one message {method, args} to this handler. Arguments are checked
// here again: the page is ours, but a message is still data.
import AVFoundation
import UIKit
import WebKit

@MainActor
final class NativeBridge: NSObject, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate {
    nonisolated static let handlerName = "synergyNative"
    nonisolated private static let maxText = 4 * 1024 * 1024

    weak var web: WKWebView?
    var loaded: UUID?
    private let speech = AVSpeechSynthesizer()
    private let success = UINotificationFeedbackGenerator()
    private let tick = UIImpactFeedbackGenerator(style: .light)

    var isNight: Bool { UITraitCollection.current.userInterfaceStyle == .dark }

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

    // MARK: messages from the page

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let method = body["method"] as? String else { return }
        let args = (body["args"] as? [Any]) ?? []
        let text = { (i: Int) -> String? in
            guard i < args.count, let s = args[i] as? String, s.utf16.count <= NativeBridge.maxText else { return nil }
            return s
        }
        switch method {
        case "speak":
            guard let words = text(0), !words.isEmpty else { return }
            if (args.count > 1 ? args[1] as? Bool : nil) == true { speech.stopSpeaking(at: .immediate) }
            let utterance = AVSpeechUtterance(string: words)
            utterance.voice = AVSpeechSynthesisVoice(language: "ru-RU")
            utterance.rate = AVSpeechUtteranceDefaultSpeechRate * 1.05
            speech.speak(utterance)
        case "stop":
            speech.stopSpeaking(at: .immediate)
        case "haptic":
            // services/feedback.js sends «confirm» for a success and «tick» for a step (NATIVE_HAPTIC); a mistake has none.
            if text(0) == "confirm" { success.notificationOccurred(.success) } else { tick.impactOccurred() }
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
        if url.isFileURL, url.path.hasPrefix(Bundle.main.bundlePath) { return .allow }
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

    /** iOS may end the web content process under memory pressure: start the game again (progress is in storage). */
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        webView.reload()
    }
}
