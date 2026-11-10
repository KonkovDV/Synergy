// «Синергия» for iPhone and iPad (5.30): the same game as the PWA and the APK, bundled offline in a WKWebView.
// The page is dist/ of `npm run build`, copied into the app as the folder «dist» (ios/project.yml).
// Native parts the browser lacks on iOS: the voice (AVSpeechSynthesizer, Russian), vibration (UIFeedbackGenerator),
// the system theme, «Поделиться» and printing — the page reaches them through window.SynergyNative, the same object
// the Android APK gives (NativeBridge.swift). Links synergy://play?game=grip&level=2&gestures=ubi4 open an exercise;
// synergy://launch (how Motorica Start opens a game of its catalog) opens the home screen. 6.3.2: either may carry
// x-success=<the caller's link> — the caller gets the result and the settings back there (x-callback-url).
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
