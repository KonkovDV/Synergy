package ru.synergy.trainer;

import android.app.Activity;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;

/**
 * Thin native shell: the game itself is the offline web build in assets/www.
 * Integration point for a real prosthesis / Motorica SDK: call pushFrame(a, b, gesture)
 * from the SDK callback — it forwards the SignalFrame to window.Synergy.feed (docs/INTEGRATION.md).
 */
public class MainActivity extends Activity {
    private WebView web;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        web.setWebChromeClient(new WebChromeClient());
        setContentView(web);
        if (state == null) web.loadUrl("file:///android_asset/www/index.html");
        else web.restoreState(state);
    }

    /** Forward one EMG frame from a native source (BLE prosthesis, SDK) into the game. */
    public void pushFrame(final float a, final float b, final String gesture) {
        final String g = gesture == null ? "" : ",gesture:'" + gesture.replaceAll("[^a-z]", "") + "'";
        runOnUiThread(new Runnable() {
            public void run() { web.evaluateJavascript("window.Synergy&&window.Synergy.feed({a:" + a + ",b:" + b + g + "})", null); }
        });
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("(window.Synergy&&window.Synergy.back())?'1':'0'", new ValueCallback<String>() {
            public void onReceiveValue(String handled) {
                if (!"\"1\"".equals(handled)) finish();
            }
        });
    }
}
