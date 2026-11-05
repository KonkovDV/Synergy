// «Синергия» for iPhone and iPad (5.30): the same game as the PWA and the APK, bundled offline in a WKWebView.
// The page is dist/ of `npm run build`, copied into the app as the folder «dist» (ios/project.yml).
// Native parts the browser lacks on iOS: the voice (AVSpeechSynthesizer, Russian), vibration (UIFeedbackGenerator),
// the system theme, «Поделиться» and printing — the page reaches them through window.SynergyNative, the same object
// the Android APK gives (NativeBridge.swift). Links synergy://play?game=grip&level=2&gestures=ubi4 open an exercise.
import SwiftUI

@main
struct SynergyApp: App {
    @State private var launch = LaunchRequest()

    var body: some Scene {
        WindowGroup {
            GameView(launch: launch)
                .ignoresSafeArea() // the page lays itself out with env(safe-area-inset-*) (viewport-fit=cover)
                .onOpenURL { url in
                    if let request = LaunchRequest(url: url) { launch = request }
                }
        }
    }
}

/**
 * What to open: the home screen, or an exercise asked by a link. Only known shapes pass — a game id, a level 1–99,
 * a gesture set — exactly as MainActivity.launchQuery on Android; the page checks them again (services/host.js).
 */
struct LaunchRequest: Equatable {
    let id = UUID()
    var game: String?
    var level: String?
    var gestures: String?
    /** 6.1 — what the prosthesis app knows (Q&A of 04.11, answer 16): the arm and the two thresholds, 0–255, both or none. */
    var side: String?
    var closeThreshold: String?
    var openThreshold: String?
    /** A threshold of Motorica Start: the same pattern as MainActivity.LEVEL_255 and services/host.js. */
    static let level255 = "^(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])$"

    init() {}

    init?(url: URL) {
        guard url.scheme == "synergy", url.host == "play",
              let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems else { return nil }
        let value = { (name: String) in items.first { $0.name == name }?.value }
        game = LaunchRequest.matching(value("game"), "^[a-z]{2,16}$")
        level = LaunchRequest.matching(value("level"), "^[1-9][0-9]?$")
        gestures = LaunchRequest.matching(value("gestures"), "^(tz|tz2|synergy|ubi4|spr8)$")
        side = LaunchRequest.matching(value("side"), "^(left|right)$")
        if let close = LaunchRequest.matching(value("closeThreshold"), LaunchRequest.level255),
           let open = LaunchRequest.matching(value("openThreshold"), LaunchRequest.level255) {
            closeThreshold = close
            openThreshold = open
        }
    }

    /** self=1: the app opened its own exercise — not a host waiting for «synergy:close» (services/host.js). */
    var queryItems: [URLQueryItem] {
        let items = [("game", game), ("level", level), ("gestures", gestures), ("side", side),
                     ("closeThreshold", closeThreshold), ("openThreshold", openThreshold)].compactMap { name, value in
            value.map { URLQueryItem(name: name, value: $0) }
        }
        return items.isEmpty ? [] : items + [URLQueryItem(name: "self", value: "1")]
    }

    private static func matching(_ value: String?, _ pattern: String) -> String? {
        guard let value, value.range(of: pattern, options: .regularExpression) != nil else { return nil }
        return value
    }
}
