// Example host (docs/embed/README.md, «Android»): «Синергия» inside your Android app.
// Copy dist/ of «Синергии» into your app's assets/synergy/ (npm run build), add this Activity to the manifest,
// change the package. Platform API only (API 21+; checked against API 29): no AndroidX needed.
package com.example.synergyhost

import android.app.Activity
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import org.json.JSONObject

class SynergyHostActivity : Activity() {
    private lateinit var web: WebView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        web = WebView(this)
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true // the person's progress lives in the page's localStorage
        web.settings.allowFileAccess = false // android_asset still loads; no other local files
        web.settings.allowContentAccess = false
        web.settings.mediaPlaybackRequiresUserGesture = false // the game's sounds and music
        web.webViewClient = object : WebViewClient() {
            // Stay inside the bundled game: no navigation away from it.
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                !request.url.toString().startsWith(ASSETS)
        }
        // window.SynergyHost.onMessage(json) in the page: every message of «Синергии» (services/host.js).
        web.addJavascriptInterface(Host(), "SynergyHost")
        setContentView(web)
        val game = intent.getStringExtra("game") ?: "grip"
        // ?game opens the exercise — after the safety onboarding on the very first run.
        web.loadUrl("${ASSETS}synergy/index.html?game=${game.filter { it in 'a'..'z' }}&level=1&embed=1")
    }

    /** Call from your prosthesis SDK or sensor callback: one frame, values 0…1 (docs/INTEGRATION.md). */
    fun pushFrame(a: Float, b: Float, gesture: String? = null) {
        val g = gesture?.filter { it in 'a'..'z' }?.let { ",gesture:'$it'" } ?: ""
        runOnUiThread { web.evaluateJavascript("window.Synergy&&window.Synergy.feed({a:$a,b:$b$g})", null) }
    }

    @Deprecated("Android 13+: OnBackInvokedCallback; the game's own back is the same call")
    override fun onBackPressed() {
        // The game's back: a running exercise pauses, a screen goes back; on its home screen it sends synergy:close.
        web.evaluateJavascript("window.Synergy?window.Synergy.back():false") { handled ->
            if (handled != "true") finish()
        }
    }

    override fun onDestroy() {
        web.destroy()
        super.onDestroy()
    }

    /** Your side: store the result, show it in your app. */
    private fun onResult(game: String, level: Int, score: Int, stars: Int) {}

    /** Called on a binder thread — UI work goes to runOnUiThread. */
    inner class Host {
        @JavascriptInterface
        fun onMessage(json: String) {
            val m = try { JSONObject(json) } catch (e: Exception) { return }
            if (m.optInt("protocol") != 1) return
            when (m.optString("type")) {
                "synergy:ready" -> { /* m.getJSONArray("games"): ids and levels you may start */ }
                "synergy:result" -> runOnUiThread {
                    onResult(m.optString("game"), m.optInt("level"), m.optInt("score"), m.optInt("stars"))
                }
                "synergy:close" -> runOnUiThread { finish() } // the person is done: back to your app
            }
        }
    }

    companion object {
        private const val ASSETS = "file:///android_asset/"
    }
}
