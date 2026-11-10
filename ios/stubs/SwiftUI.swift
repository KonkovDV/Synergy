// Stub of the SwiftUI API the iPhone app uses — only to type-check ios/Synergy/*.swift (tools/check-ios.sh). As in the
// SDK since Xcode 16, View, App and UIViewRepresentable are main-actor protocols.
@_exported import UIKit

@MainActor public protocol View {}
@MainActor public protocol Scene {}

@resultBuilder public enum ViewBuilder {
    public static func buildBlock<Content: View>(_ content: Content) -> Content { content }
}

@resultBuilder public enum SceneBuilder {
    public static func buildBlock<Content: Scene>(_ content: Content) -> Content { content }
}

@MainActor public protocol App {
    associatedtype Body: Scene
    @SceneBuilder var body: Body { get }
    init()
}

extension App {
    public static func main() {}
}

public struct WindowGroup<Content: View>: Scene {
    public init(@ViewBuilder content: () -> Content) {}
}

public struct ModifiedContent<Content: View>: View {}

extension View {
    public func ignoresSafeArea() -> ModifiedContent<Self> { ModifiedContent() }
    public func onOpenURL(perform action: @escaping (URL) -> Void) -> ModifiedContent<Self> { ModifiedContent() }
}

@propertyWrapper public struct State<Value> {
    private final class Box { var value: Value; init(_ value: Value) { self.value = value } }
    private let box: Box
    public init(wrappedValue: Value) { box = Box(wrappedValue) }
    public var wrappedValue: Value {
        get { box.value }
        nonmutating set { box.value = newValue }
    }
}

public struct UIViewRepresentableContext<Representable: UIViewRepresentable> {
    public let coordinator: Representable.Coordinator
}

@MainActor public protocol UIViewRepresentable: View {
    associatedtype UIViewType: UIView
    associatedtype Coordinator = Void
    typealias Context = UIViewRepresentableContext<Self>
    func makeUIView(context: Context) -> UIViewType
    func updateUIView(_ uiView: UIViewType, context: Context)
    static func dismantleUIView(_ uiView: UIViewType, coordinator: Coordinator)
    func makeCoordinator() -> Coordinator
}

extension UIViewRepresentable {
    public static func dismantleUIView(_ uiView: UIViewType, coordinator: Coordinator) {}
}

extension UIViewRepresentable where Coordinator == Void {
    public func makeCoordinator() {}
}
