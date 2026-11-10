// Unit tests of the iPhone app's own logic (6.3.2) — run without a Mac by tools/check-ios.sh: the app's Swift files that
// need no UI (LaunchRequest, BundleSchemeHandler, NativeBridge.callback) linked with the SDK stubs of ios/stubs.
import Foundation

var failures = 0
func check(_ ok: Bool, _ what: String) {
    if ok { print("ok — \(what)") } else { failures += 1; print("FAIL — \(what)") }
}
let item = { (r: LaunchRequest, name: String) in r.queryItems.first { $0.name == name }?.value }

// ── launch links ──
let play = LaunchRequest(url: URL(string: "synergy://play?game=grip&level=2&side=left&closeThreshold=60&openThreshold=200&x-success=motorica%3A%2F%2Fsynergy%3Ftoken%3D1")!)
check(play?.game == "grip" && play?.level == "2" && play?.side == "left", "a play link opens the exercise it names, on the arm it names")
check(play?.closeThreshold == "60" && play?.openThreshold == "200", "the thresholds 0–255 of the prosthesis app pass")
check(play?.returnURL?.absoluteString == "motorica://synergy?token=1", "x-success is kept as the caller's link")
check(play.map { item($0, "self") } == "1", "the page hears «self=1»: the app opened its own exercise")
check(play.map { r in !r.queryItems.contains { $0.name == "x-success" } } == true, "x-success is not passed to the page")
let launch = LaunchRequest(url: URL(string: "synergy://launch?x-success=motorica://back")!)
check(launch != nil && launch?.game == nil && launch?.queryItems.isEmpty == true, "synergy://launch (the catalog of Motorica Start) opens the home screen")
check(launch?.returnURL?.absoluteString == "motorica://back", "…and may ask to be returned to as well")
check(LaunchRequest(url: URL(string: "synergy://play")!)?.queryItems.isEmpty == true, "a play link without a query opens the home screen")
// 6.3.3 — the pair of «2 жеста + нейтраль» (answer 4г of the experts): two different keys of the task's dist pass, nothing else
let paired = LaunchRequest(url: URL(string: "synergy://play?gestures=tz2&pair=pronation,supination")!)!
check(item(paired, "pair") == "pronation,supination" && item(paired, "gestures") == "tz2", "a pair of the task's dictionary passes")
for bad in ["flexion,flexion", "fist,open", "flexion", "flexion,extension,pronation", "FLEXION,extension"] {
    check(LaunchRequest(url: URL(string: "synergy://play?gestures=tz2&pair=\(bad)")!).map { item($0, "pair") } == .some(nil), "pair «\(bad)» is refused")
}
check(LaunchRequest(url: URL(string: "https://example.com/play?game=grip")!) == nil, "another scheme is not a launch")
check(LaunchRequest(url: URL(string: "synergy://play?game=Grip%20X&level=0&gestures=evil&closeThreshold=60")!).map { $0.queryItems.isEmpty } == true,
      "unknown shapes are dropped; one threshold without the other is dropped")
for bad in ["https://evil.example/", "http://x", "javascript:alert(1)", "file:///etc/passwd", "synergy://play", "synergy-app://game/",
            "data:text/html,x", "tel:112", "sms:1", "mailto:a@b.c", "x://" + String(repeating: "a", count: 600), "not a url"] {
    check(LaunchRequest.returnTarget(bad) == nil, "x-success «\(bad.prefix(30))» is refused")
}
check(LaunchRequest.returnTarget("motorica-start://games/result?id=7") != nil, "a caller's own scheme is taken")

// ── the answer to the caller (x-callback-url) ──
let result = #"{"type":"synergy:result","game":"grip","score":90,"skills":{"separation":95},"at":"2026-11-10T05:00:00.000Z"}"#
let settings = #"{"type":"synergy:settings","side":"left","sensitivity":{"close":0.22,"open":0.25}}"#
let back = NativeBridge.callback(URL(string: "motorica://synergy?token=1&a=b+c")!, reason: "done", result: result, settings: settings)
let parts = back.flatMap { URLComponents(url: $0, resolvingAgainstBaseURL: false) }?.queryItems ?? []
let value = { (name: String) in parts.first { $0.name == name }?.value }
check(back?.scheme == "motorica" && value("token") == "1", "the caller's link and its own query are kept")
check(back?.absoluteString.contains("a=b+c") == true, "the caller's own encoding is not touched")
check(value("synergy") == "close" && value("reason") == "done", "the answer says what happened")
check(value("result") == result, "the result arrives whole, JSON decoded back character for character")
check(value("settings") == settings, "the settings arrive whole")
check(back?.absoluteString.contains("&type") == false && back?.absoluteString.contains("{") == false, "the JSON is percent-encoded: no stray «&» or braces")
check(NativeBridge.callback(nil, reason: "done", result: nil, settings: nil) == nil, "no caller — no link")
let bare = NativeBridge.callback(URL(string: "motorica://x")!, reason: "back", result: nil, settings: nil)
check(bare?.absoluteString == "motorica://x?synergy=close&reason=back", "without a result only the close is told")

// ── the bundled game under synergy-app://game/ ──
let root = FileManager.default.temporaryDirectory.appendingPathComponent("synergy-ios-test-\(UUID().uuidString)")
try FileManager.default.createDirectory(at: root.appendingPathComponent("art"), withIntermediateDirectories: true)
try Data("<!doctype html>".utf8).write(to: root.appendingPathComponent("index.html"))
try Data("x".utf8).write(to: root.appendingPathComponent("art/a.webp"))
try Data("secret".utf8).write(to: root.deletingLastPathComponent().appendingPathComponent("synergy-secret.txt"))
let handler = BundleSchemeHandler(root: root)
let file = { (s: String) in handler.file(for: URL(string: s)) }
check(file("synergy-app://game/index.html")?.lastPathComponent == "index.html", "the page")
check(file("synergy-app://game/")?.lastPathComponent == "index.html", "the root is the page")
check(file("synergy-app://game/art/a.webp")?.lastPathComponent == "a.webp", "a picture in a folder")
check(file("synergy-app://game/art") == nil, "a folder is not a file")
check(file("synergy-app://game/missing.js") == nil, "a missing file is not found")
check(file("synergy-app://game/../synergy-secret.txt") == nil, "«..» does not leave dist")
check(file("synergy-app://game/%2e%2e/synergy-secret.txt") == nil, "an encoded «..» does not leave dist")
check(file("synergy-app://other/index.html") == nil, "another host is not the game")
check(file("https://game/index.html") == nil, "another scheme is not the game")
check(BundleSchemeHandler.url(query: [URLQueryItem(name: "game", value: "grip")])?.absoluteString == "synergy-app://game/index.html?game=grip", "the page URL with a launch's query")
check(BundleSchemeHandler.types["webp"] == "image/webp" && BundleSchemeHandler.types["js"]?.hasPrefix("text/javascript") == true, "MIME types of the bundle")
try? FileManager.default.removeItem(at: root)

print(failures == 0 ? "iOS tests: all passed" : "iOS tests: \(failures) failed")
exit(failures == 0 ? 0 : 1)
