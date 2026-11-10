// Stub of the UIKit API the iPhone app uses — only to type-check ios/Synergy/*.swift without a Mac (tools/check-ios.sh).
// Names and signatures follow Apple's SDK; the bodies are empty. It is not the SDK: the app is built by Xcode
// (.github/workflows/ios.yml). Like android/stubs for the APK — what our code calls must exist with these types.
@_exported import Foundation

@MainActor open class UIResponder: NSObject {}

@MainActor open class UIColor: NSObject {
    public static let systemBackground = UIColor()
}

public enum UIUserInterfaceStyle: Int { case unspecified, light, dark }

@MainActor open class UITraitCollection: NSObject {
    public static var current = UITraitCollection()
    open var userInterfaceStyle: UIUserInterfaceStyle = .unspecified
}

@MainActor open class UIView: UIResponder {
    public init(frame: CGRect) { super.init() }
    open var backgroundColor: UIColor?
    open var isOpaque: Bool = true
    open var window: UIWindow? { nil }
    open var traitCollection: UITraitCollection { UITraitCollection() }
    open func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {}
}

@MainActor open class UIScrollView: UIView {
    public enum ContentInsetAdjustmentBehavior: Int { case automatic, scrollableAxes, never, always }
    open var contentInsetAdjustmentBehavior: ContentInsetAdjustmentBehavior = .automatic
}

@MainActor open class UIWindow: UIView {
    open var rootViewController: UIViewController?
}

@MainActor open class UIPopoverPresentationController: NSObject {
    open var sourceView: UIView?
}

@MainActor open class UIViewController: UIResponder {
    open var presentedViewController: UIViewController? { nil }
    open var popoverPresentationController: UIPopoverPresentationController? { nil }
    open func present(_ viewControllerToPresent: UIViewController, animated flag: Bool, completion: (() -> Void)? = nil) {}
}

@MainActor open class UIActivity: NSObject {}

@MainActor open class UIActivityViewController: UIViewController {
    public init(activityItems: [Any], applicationActivities: [UIActivity]?) { super.init() }
}

@MainActor open class UIAlertAction: NSObject {
    public enum Style: Int { case `default`, cancel, destructive }
    public init(title: String?, style: UIAlertAction.Style, handler: ((UIAlertAction) -> Void)? = nil) { super.init() }
}

@MainActor open class UIAlertController: UIViewController {
    public enum Style: Int { case actionSheet, alert }
    public init(title: String?, message: String?, preferredStyle: UIAlertController.Style) { super.init() }
    open func addAction(_ action: UIAlertAction) {}
}

@MainActor open class UIPrintInfo: NSObject {
    public enum OutputType: Int { case general, photo, grayscale, photoGrayscale }
    public init(dictionary: [AnyHashable: Any]?) { super.init() }
    open var jobName: String = ""
    open var outputType: UIPrintInfo.OutputType = .general
}

@MainActor open class UIPrintFormatter: NSObject {}

@MainActor open class UIMarkupTextPrintFormatter: UIPrintFormatter {
    public init(markupText: String) { super.init() }
}

@MainActor open class UIPrintInteractionController: NSObject {
    public static var shared = UIPrintInteractionController()
    open var printInfo: UIPrintInfo?
    open var printFormatter: UIPrintFormatter?
    public typealias CompletionHandler = (UIPrintInteractionController, Bool, (any Error)?) -> Void
    open func present(animated: Bool, completionHandler: CompletionHandler? = nil) -> Bool { false }
}

@MainActor open class UIFeedbackGenerator: NSObject {
    open func prepare() {}
}

@MainActor open class UINotificationFeedbackGenerator: UIFeedbackGenerator {
    public enum FeedbackType: Int { case success, warning, error }
    open func notificationOccurred(_ notificationType: UINotificationFeedbackGenerator.FeedbackType) {}
}

@MainActor open class UIImpactFeedbackGenerator: UIFeedbackGenerator {
    public enum FeedbackStyle: Int { case light, medium, heavy, soft, rigid }
    public init(style: UIImpactFeedbackGenerator.FeedbackStyle) { super.init() }
    open func impactOccurred() {}
}

@MainActor open class UIApplication: UIResponder {
    public static let shared = UIApplication()
    open var isIdleTimerDisabled: Bool = false
    public struct OpenExternalURLOptionsKey: Hashable, RawRepresentable {
        public var rawValue: String
        public init(rawValue: String) { self.rawValue = rawValue }
    }
    open func open(_ url: URL, options: [UIApplication.OpenExternalURLOptionsKey: Any] = [:]) async -> Bool { false }
}

public enum UIAccessibility {
    @MainActor public static var isVoiceOverRunning: Bool { false }
}
