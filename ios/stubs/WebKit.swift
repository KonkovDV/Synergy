// Stub of the WebKit API the iPhone app uses — only to type-check ios/Synergy/*.swift (tools/check-ios.sh). The delegate
// methods the app implements are required here (in WebKit they are optional): a wrong label or type would leave a
// method WebKit never calls, and the check would not see it.
@_exported import UIKit
#if canImport(FoundationNetworking)
@_exported import FoundationNetworking // URLRequest, HTTPURLResponse: part of Foundation on Apple platforms
#endif

public enum WKNavigationActionPolicy: Int { case cancel, allow, download }
public enum WKNavigationType: Int { case linkActivated, formSubmitted, backForward, reload, formResubmitted, other = -1 }
public enum WKUserScriptInjectionTime: Int { case atDocumentStart, atDocumentEnd }

public struct WKAudiovisualMediaTypes: OptionSet, Sendable {
    public let rawValue: UInt
    public init(rawValue: UInt) { self.rawValue = rawValue }
    public static let audio = WKAudiovisualMediaTypes(rawValue: 1)
    public static let video = WKAudiovisualMediaTypes(rawValue: 2)
    public static let all = WKAudiovisualMediaTypes(rawValue: 3)
}

@MainActor open class WKFrameInfo: NSObject {}
@MainActor open class WKNavigation: NSObject {}

@MainActor open class WKNavigationAction: NSObject {
    open var request: URLRequest { URLRequest(url: URL(string: "about:blank")!) }
    open var navigationType: WKNavigationType { .other }
}

@MainActor open class WKScriptMessage: NSObject {
    open var body: Any { 0 }
    open var name: String { "" }
}

@MainActor public protocol WKScriptMessageHandler: NSObjectProtocol {
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage)
}

@MainActor open class WKUserScript: NSObject {
    public init(source: String, injectionTime: WKUserScriptInjectionTime, forMainFrameOnly: Bool) { super.init() }
}

@MainActor open class WKUserContentController: NSObject {
    open func addUserScript(_ userScript: WKUserScript) {}
    open func add(_ scriptMessageHandler: any WKScriptMessageHandler, name: String) {}
    open func removeScriptMessageHandler(forName name: String) {}
}

public protocol WKURLSchemeTask: NSObjectProtocol {
    var request: URLRequest { get }
    func didReceive(_ response: URLResponse)
    func didReceive(_ data: Data)
    func didFinish()
    func didFailWithError(_ error: any Error)
}

public protocol WKURLSchemeHandler: NSObjectProtocol {
    func webView(_ webView: WKWebView, start urlSchemeTask: any WKURLSchemeTask)
    func webView(_ webView: WKWebView, stop urlSchemeTask: any WKURLSchemeTask)
}

@MainActor open class WKWebViewConfiguration: NSObject {
    open var allowsInlineMediaPlayback: Bool = false
    open var mediaTypesRequiringUserActionForPlayback: WKAudiovisualMediaTypes = .all
    open var userContentController = WKUserContentController()
    open func setURLSchemeHandler(_ urlSchemeHandler: (any WKURLSchemeHandler)?, forURLScheme urlScheme: String) {}
}

@MainActor public protocol WKNavigationDelegate: NSObjectProtocol {
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction) async -> WKNavigationActionPolicy
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!)
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView)
}

@MainActor public protocol WKUIDelegate: NSObjectProtocol {
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo) async -> Bool
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo) async
}

@MainActor open class WKWebView: UIView {
    public init(frame: CGRect, configuration: WKWebViewConfiguration) {
        self.configuration = configuration
        super.init(frame: frame)
    }
    open private(set) var configuration: WKWebViewConfiguration
    open var scrollView = UIScrollView(frame: .zero)
    open var allowsBackForwardNavigationGestures: Bool = false
    open var allowsLinkPreview: Bool = true
    @available(iOS 16.4, *) open var isInspectable: Bool { get { false } set {} }
    weak open var navigationDelegate: (any WKNavigationDelegate)?
    weak open var uiDelegate: (any WKUIDelegate)?
    @discardableResult open func load(_ request: URLRequest) -> WKNavigation? { nil }
    @discardableResult open func loadFileURL(_ URL: URL, allowingReadAccessTo readAccessURL: URL) -> WKNavigation? { nil }
    @discardableResult open func reload() -> WKNavigation? { nil }
    open func evaluateJavaScript(_ javaScriptString: String, completionHandler: ((Any?, (any Error)?) -> Void)? = nil) {}
}
