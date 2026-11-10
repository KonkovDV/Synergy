// What a launch link asks for (5.30; 6.3.2 — its own file, so tests/ios/ can check it without the app's entry point).
// Pure Foundation: the same rules as MainActivity.launchQuery on Android and services/host.js parseLaunch.
import Foundation

/**
 * What to open: the home screen, or an exercise asked by a link. Only known shapes pass — a game id, a level 1–99,
 * a gesture set — exactly as MainActivity.launchQuery on Android; the page checks them again (services/host.js).
 */
struct LaunchRequest: Equatable {
    let id = UUID()
    var game: String?
    var level: String?
    var gestures: String?
    /**
     * 6.3.3 — the pair of «2 жеста + нейтраль» (answer 4г of the experts, 09.11: any two gestures): two different keys of
     * the task's dist, the closing one first. The same keys as MainActivity.PAIR_KEY; the page checks the pair again.
     */
    var pair: String?
    static let pairKey = "flexion|extension|pronation|supination|adduction|abduction"
    static let pairPattern = "^(" + pairKey + "),(" + pairKey + ")$"
    /** 6.1 — what the prosthesis app knows (Q&A of 04.11, answer 16): the arm and the two thresholds, 0–255, both or none. */
    var side: String?
    var closeThreshold: String?
    var openThreshold: String?
    /** A threshold of Motorica Start: the same pattern as MainActivity.LEVEL_255 and services/host.js. */
    static let level255 = "^(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])$"
    /** 6.3.2 — the app that opened this one and asked to be returned to (x-success), or nil. */
    var returnURL: URL?
    /** A caller's own scheme only: never a web page, a file, a call, a message, nor this app itself. */
    static let returnScheme = "^[a-z][a-z0-9+.-]{1,31}$"
    static let forbiddenReturn: Set<String> = ["http", "https", "file", "javascript", "data", "about", "blob", "synergy",
                                               BundleSchemeHandler.scheme, "mailto", "tel", "sms", "facetime", "facetime-audio"]

    init() {}

    init?(url: URL) {
        guard url.scheme == "synergy" else { return nil }
        let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        let value = { (name: String) in items.first { $0.name == name }?.value }
        returnURL = LaunchRequest.returnTarget(value("x-success"))
        // Motorica Start opens a game of its catalog as <urlScheme>://launch, with a one-time token only its own games can
        // check (public source, 05.11.2026; docs/INTEGRATION.md «Каталог игр Motorica Start»): the home screen, as the
        // Android app started by its activity.
        if url.host == "launch" { return }
        guard url.host == "play" else { return nil }
        game = LaunchRequest.matching(value("game"), "^[a-z]{2,16}$")
        level = LaunchRequest.matching(value("level"), "^[1-9][0-9]?$")
        gestures = LaunchRequest.matching(value("gestures"), "^(tz|tz2|synergy|ubi4|spr8)$")
        if let both = LaunchRequest.matching(value("pair"), LaunchRequest.pairPattern), Set(both.split(separator: ",")).count == 2 {
            pair = both
        }
        side = LaunchRequest.matching(value("side"), "^(left|right)$")
        if let close = LaunchRequest.matching(value("closeThreshold"), LaunchRequest.level255),
           let open = LaunchRequest.matching(value("openThreshold"), LaunchRequest.level255) {
            closeThreshold = close
            openThreshold = open
        }
    }

    /** self=1: the app opened its own exercise — not a host waiting for «synergy:close» (services/host.js). */
    var queryItems: [URLQueryItem] {
        let items = [("game", game), ("level", level), ("gestures", gestures), ("pair", pair), ("side", side),
                     ("closeThreshold", closeThreshold), ("openThreshold", openThreshold)].compactMap { name, value in
            value.map { URLQueryItem(name: name, value: $0) }
        }
        return items.isEmpty ? [] : items + [URLQueryItem(name: "self", value: "1")]
    }

    /** x-success of a launch link, when it is a caller's own scheme (returnScheme, not forbiddenReturn) and short. */
    static func returnTarget(_ value: String?) -> URL? {
        guard let value, value.count <= 512, let url = URL(string: value), let scheme = url.scheme?.lowercased(),
              scheme.range(of: returnScheme, options: .regularExpression) != nil, !forbiddenReturn.contains(scheme) else { return nil }
        return url
    }

    private static func matching(_ value: String?, _ pattern: String) -> String? {
        guard let value, value.range(of: pattern, options: .regularExpression) != nil else { return nil }
        return value
    }
}
