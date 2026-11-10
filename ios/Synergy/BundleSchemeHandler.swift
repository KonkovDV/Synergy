// 6.3.2 — the bundled game under an origin of its own, synergy-app://game/…, served from the app's «dist» folder
// (ios/project.yml). Until 6.3.2 the page was a file:// URL: progress in localStorage lived under the file origin, and a
// launch link's query string rode on a file URL. A custom scheme handler (WKURLSchemeHandler, iOS 11+) is how hybrid
// apps bundle a web app in WKWebView: one stable origin for the person's data, the right MIME types, CSP «'self'» meaning
// the app itself. Nothing leaves the bundle: another host, a path out of «dist» or a folder is «not found».
import Foundation
import WebKit

final class BundleSchemeHandler: NSObject, WKURLSchemeHandler {
    static let scheme = "synergy-app"
    static let host = "game"

    /** The URL of a page of the game: synergy-app://game/index.html with the launch's query, if any. */
    static func url(page: String = "index.html", query: [URLQueryItem] = []) -> URL? {
        var parts = URLComponents()
        parts.scheme = scheme
        parts.host = host
        parts.path = "/" + page
        if !query.isEmpty { parts.queryItems = query }
        return parts.url
    }

    static let types: [String: String] = [
        "html": "text/html; charset=utf-8", "js": "text/javascript; charset=utf-8", "css": "text/css; charset=utf-8",
        "json": "application/json", "webmanifest": "application/manifest+json", "webp": "image/webp", "png": "image/png",
        "jpg": "image/jpeg", "svg": "image/svg+xml", "woff2": "font/woff2", "txt": "text/plain; charset=utf-8",
    ]

    private let root: URL?

    init(root: URL? = Bundle.main.url(forResource: "dist", withExtension: nil)) {
        self.root = root?.standardizedFileURL
        super.init()
    }

    /** The bundled file a request asks for, or nil: another scheme or host, a path out of «dist», a folder, no such file. */
    func file(for url: URL?) -> URL? {
        guard let url, url.scheme == BundleSchemeHandler.scheme, url.host == BundleSchemeHandler.host, let root else { return nil }
        let path = url.path.isEmpty || url.path == "/" ? "index.html" : String(url.path.dropFirst())
        let file = root.appendingPathComponent(path).standardizedFileURL
        guard file.path.hasPrefix(root.path + "/") else { return nil }
        var folder: ObjCBool = false
        guard FileManager.default.fileExists(atPath: file.path, isDirectory: &folder), !folder.boolValue else { return nil }
        return file
    }

    func webView(_ webView: WKWebView, start task: any WKURLSchemeTask) {
        let asked = task.request.url
        guard let url = asked, let file = file(for: url), let data = try? Data(contentsOf: file) else {
            let fallback = URL(string: "\(BundleSchemeHandler.scheme)://\(BundleSchemeHandler.host)/")!
            if let missing = HTTPURLResponse(url: asked ?? fallback, statusCode: 404, httpVersion: "HTTP/1.1",
                                             headerFields: ["Content-Type": "text/plain; charset=utf-8"]) {
                task.didReceive(missing)
            }
            task.didReceive(Data("not found".utf8))
            task.didFinish()
            return
        }
        let type = BundleSchemeHandler.types[file.pathExtension.lowercased()] ?? "application/octet-stream"
        let headers = ["Content-Type": type, "Content-Length": String(data.count), "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff"]
        guard let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: headers) else {
            task.didFailWithError(URLError(.cannotParseResponse))
            return
        }
        task.didReceive(response)
        task.didReceive(data)
        task.didFinish()
    }

    /** Every answer is sent at once in `start`: nothing is left to stop. */
    func webView(_ webView: WKWebView, stop task: any WKURLSchemeTask) {}
}
