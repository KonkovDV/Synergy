// Stub of the AVFoundation speech API the iPhone app uses — only to type-check ios/Synergy/*.swift (tools/check-ios.sh).
@_exported import Foundation

public enum AVSpeechBoundary: Int { case immediate, word }

open class AVSpeechSynthesisVoice: NSObject {
    public init?(language languageCode: String?) { super.init() }
}

public let AVSpeechUtteranceDefaultSpeechRate: Float = 0.5

open class AVSpeechUtterance: NSObject {
    public init(string: String) { super.init() }
    open var voice: AVSpeechSynthesisVoice?
    open var rate: Float = AVSpeechUtteranceDefaultSpeechRate
}

/** The delegate methods the app implements are required here (optional in the SDK): a misspelt one fails the check. */
public protocol AVSpeechSynthesizerDelegate: NSObjectProtocol {
    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance)
    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance)
}

open class AVSpeechSynthesizer: NSObject {
    public override init() { super.init() }
    weak open var delegate: (any AVSpeechSynthesizerDelegate)?
    open var isSpeaking: Bool { false }
    @discardableResult open func stopSpeaking(at boundary: AVSpeechBoundary) -> Bool { true }
    open func speak(_ utterance: AVSpeechUtterance) {}
}

open class AVAudioSession: NSObject {
    public static func sharedInstance() -> AVAudioSession { AVAudioSession() }
    public struct Category: Hashable, RawRepresentable, Sendable {
        public let rawValue: String
        public init(rawValue: String) { self.rawValue = rawValue }
        public static let ambient = Category(rawValue: "AVAudioSessionCategoryAmbient")
        public static let soloAmbient = Category(rawValue: "AVAudioSessionCategorySoloAmbient")
        public static let playback = Category(rawValue: "AVAudioSessionCategoryPlayback")
    }
    public struct Mode: Hashable, RawRepresentable, Sendable {
        public let rawValue: String
        public init(rawValue: String) { self.rawValue = rawValue }
        public static let `default` = Mode(rawValue: "AVAudioSessionModeDefault")
        public static let spokenAudio = Mode(rawValue: "AVAudioSessionModeSpokenAudio")
        public static let voicePrompt = Mode(rawValue: "AVAudioSessionModeVoicePrompt")
    }
    public struct CategoryOptions: OptionSet, Sendable {
        public let rawValue: UInt
        public init(rawValue: UInt) { self.rawValue = rawValue }
        public static let mixWithOthers = CategoryOptions(rawValue: 0x1)
        public static let duckOthers = CategoryOptions(rawValue: 0x2)
        public static let interruptSpokenAudioAndMixWithOthers = CategoryOptions(rawValue: 0x11)
    }
    public struct SetActiveOptions: OptionSet, Sendable {
        public let rawValue: UInt
        public init(rawValue: UInt) { self.rawValue = rawValue }
        public static let notifyOthersOnDeactivation = SetActiveOptions(rawValue: 1)
    }
    open func setCategory(_ category: AVAudioSession.Category, mode: AVAudioSession.Mode, options: AVAudioSession.CategoryOptions = []) throws {}
    open func setActive(_ active: Bool, options: AVAudioSession.SetActiveOptions = []) throws {}
}
